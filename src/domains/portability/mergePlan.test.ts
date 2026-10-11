import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  __mergePlanTestOnly,
  buildPortableMergePlan,
  isPlannerIssuedPortableMergePlan,
  MERGE_DIGEST_CONCURRENCY,
  MergePlanError,
  PORTABLE_MERGE_TABLE_CLASSES,
} from "./mergePlan";
import {
  LOGICAL_BACKUP_TABLES,
  type LogicalBackupRow,
} from "./backupContracts";

const ownerNamespace = "1".repeat(32);
const sessionPortableId = "a".repeat(32);
const payloadDigest = async () => "0".repeat(64);

function snapshot(
  session: Readonly<{ id: string; marker: string; modifiedAtMs: number }>,
  extra: Readonly<Record<string, readonly Record<string, unknown>[]>> = {},
) {
  return {
    version: 2 as const,
    schemaVersion: 22,
    snapshotId: `snapshot-${session.id}`,
    createdAtMs: 1,
    manifest: { catalogReferenceCount: 0, rowCounts: {}, totalRows: 0 },
    catalogReferences: [],
    tables: {
      portable_owner_identity: [{ id: 1, owner_namespace: ownerNamespace }],
      workout_sessions: [{
        id: session.id,
        portable_id: sessionPortableId,
        merge_modified_at_ms: session.modifiedAtMs,
        marker: session.marker,
      }],
      session_exercises: [],
      session_sets: [],
      ...extra,
    },
  } as const;
}

describe("portable merge plan", () => {
  it("bounds equal-timestamp session digests while preserving canonical plan order", async () => {
    const portableIds = Array.from({ length: MERGE_DIGEST_CONCURRENCY + 2 }, (_, index) => (
      `${index.toString(16)}${"a".repeat(31)}`
    ));
    const archive = snapshot({ id: "archive-0", marker: "archive", modifiedAtMs: 20 });
    const local = snapshot({ id: "local-0", marker: "local", modifiedAtMs: 20 });
    const withSessions = (value: typeof archive, prefix: string) => ({
      ...value,
      tables: {
        ...value.tables,
        workout_sessions: portableIds.map((portableId, index) => ({
          id: `${prefix}-${index}`,
          portable_id: portableId,
          merge_modified_at_ms: 20,
          marker: prefix,
        })),
      },
    });
    let active = 0;
    let maxActive = 0;
    const plan = await buildPortableMergePlan({
      archive: withSessions(archive, "archive"),
      local: withSessions(local, "local"),
      payloadDigest: async (value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return value.includes("archive") ? "0".repeat(64) : "f".repeat(64);
      },
    });
    expect(isPlannerIssuedPortableMergePlan(plan)).toBe(true);
    expect(isPlannerIssuedPortableMergePlan({ ...plan })).toBe(false);
    expect(isPlannerIssuedPortableMergePlan(null)).toBe(false);

    expect(maxActive).toBeLessThanOrEqual(MERGE_DIGEST_CONCURRENCY * 2);
    const operations = plan.operations.filter((operation) => operation.aggregateClass === "workout_session");
    expect(operations.map((operation) => operation.portableId)).toEqual([...portableIds].sort());
    expect(operations.every((operation) => operation.kind === "local_won")).toBe(true);
  });

  it("reuses the session index when materializing archive-won aggregates", async () => {
    let filterCalls = 0;
    const tracked = <T>(rows: readonly T[]): readonly T[] => {
      const copy = [...rows];
      const filter = copy.filter.bind(copy);
      copy.filter = ((...args: Parameters<typeof copy.filter>) => {
        filterCalls += 1;
        return filter(...args);
      }) as typeof copy.filter;
      return copy;
    };
    const base = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      session_exercises: [{
        id: "archive-exercise",
        session_id: "archive-session",
        metric_profile: "load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 1,
      }],
      session_sets: [{
        id: "archive-set",
        session_exercise_id: "archive-exercise",
        metric_profile: "load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 1,
      }],
    });
    const archive = {
      ...base,
      tables: {
        ...base.tables,
        workout_sessions: tracked(base.tables.workout_sessions),
        session_exercises: tracked(base.tables.session_exercises),
        session_sets: tracked(base.tables.session_sets),
      },
    };
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    await expect(buildPortableMergePlan({ archive, local, payloadDigest }))
      .resolves.toEqual(expect.objectContaining({
        aggregates: [expect.objectContaining({ aggregateClass: "workout_session" })],
      }));
    expect(filterCalls).toBe(0);
  });

  it("reuses occupied child identifiers across aggregate materialization", async () => {
    const archive = snapshot({ id: "archive-one", marker: "archive", modifiedAtMs: 20 });
    const withTwoSessions = {
      ...archive,
      tables: {
        ...archive.tables,
        workout_sessions: [
          { id: "archive-one", portable_id: "a".repeat(32), merge_modified_at_ms: 20 },
          { id: "archive-two", portable_id: "b".repeat(32), merge_modified_at_ms: 20 },
        ],
      },
    };
    const localBase = snapshot({ id: "local", marker: "local", modifiedAtMs: 10 });
    const local = {
      ...localBase,
      tables: { ...localBase.tables, workout_sessions: [] },
    };

    const plan = await buildPortableMergePlan({
      archive: withTwoSessions,
      local,
      payloadDigest,
    });

    expect(plan.aggregates).toHaveLength(2);
    expect(plan.aggregates).toBe(plan.aggregates);
  });

  it("classifies every portable source table before planning a merge", () => {
    expect(Object.keys(PORTABLE_MERGE_TABLE_CLASSES).sort())
      .toEqual([...LOGICAL_BACKUP_TABLES].sort());
  });

  const invalidSnapshotCases: Array<[
    string,
    (value: ReturnType<typeof snapshot>) => unknown,
  ]> = [
    ["a pre-identity schema", (value) => ({ ...value, schemaVersion: 21 })],
    ["a missing owner identity", (value) => ({
      ...value,
      tables: { ...value.tables, portable_owner_identity: [] },
    })],
    ["an owner namespace mismatch", (value) => ({
      ...value,
      tables: {
        ...value.tables,
        portable_owner_identity: [{ id: 1, owner_namespace: "2".repeat(32) }],
      },
    })],
    ["a missing session table", (value) => {
      const { workout_sessions: _sessions, ...tables } = value.tables;
      return { ...value, tables };
    }],
  ];

  it.each(invalidSnapshotCases)("rejects %s before building a plan", async (_label, mutate) => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    await expect(buildPortableMergePlan({
      archive: mutate(archive) as never,
      local,
      payloadDigest,
    })).rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  const invalidSessionGraphCases: Array<[
    string,
    Readonly<Record<string, readonly Record<string, unknown>[]>>,
  ]> = [
    ["a session exercise without its session", {
      session_exercises: [{ id: "orphan-exercise", session_id: "missing" }],
    }],
    ["a session set without its exercise", {
      session_sets: [{ id: "orphan-set", session_exercise_id: "missing" }],
    }],
    ["a rest pointer outside the session aggregate", {
      session_rest_states: [{ session_id: "archive-session", next_set_id: "missing" }],
    }],
    ["an advanced timing pointer outside the session aggregate", {
      session_advanced_timing_states: [{ session_id: "archive-session", session_set_id: "missing" }],
    }],
    ["an undo snapshot outside the session aggregate", {
      session_undo_snapshots: [{ id: "undo", session_id: "archive-session", completed_set_id: "missing" }],
    }],
    ["a receipt without its owning session", {
      history_audit_events: [{ id: "audit", session_id: "missing" }],
    }],
  ];

  it.each(invalidSessionGraphCases)("rejects %s", async (_label, extra) => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, extra);
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    await expect(buildPortableMergePlan({ archive, local, payloadDigest }))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  const invalidRootAndSettingCases: Array<[
    string,
    Readonly<Record<string, readonly Record<string, unknown>[]>>,
    Readonly<Record<string, readonly Record<string, unknown>[]>>,
  ]> = [
    ["a blank archive session id", {
      workout_sessions: [{ id: " " , portable_id: sessionPortableId, merge_modified_at_ms: 20 }],
    }, {}],
    ["an invalid archive portable identity", {
      workout_sessions: [{ id: "archive-session", portable_id: "bad", merge_modified_at_ms: 20 }],
    }, {}],
    ["an invalid archive modification timestamp", {
      workout_sessions: [{ id: "archive-session", portable_id: sessionPortableId, merge_modified_at_ms: -1 }],
    }, {}],
    ["two archive sessions with one portable identity", {
      workout_sessions: [
        { id: "archive-session", portable_id: sessionPortableId, merge_modified_at_ms: 20 },
        { id: "archive-session-2", portable_id: sessionPortableId, merge_modified_at_ms: 21 },
      ],
    }, {}],
    ["two local sessions with one portable identity", {}, {
      workout_sessions: [
        { id: "local-session", portable_id: sessionPortableId, merge_modified_at_ms: 10 },
        { id: "local-session-2", portable_id: sessionPortableId, merge_modified_at_ms: 11 },
      ],
    }],
    ["a duplicate archive setting key", {
      app_settings: [{ key: "units" }, { key: "units" }],
    }, {}],
    ["a duplicate local setting key", {}, {
      app_settings: [{ key: "units" }, { key: "units" }],
    }],
    ["an owned archive exercise with a duplicate portable identity", {
      exercises: [
        { id: "exercise-one", origin: "custom", portable_id: "b".repeat(32) },
        { id: "exercise-two", origin: "copied", portable_id: "b".repeat(32) },
      ],
    }, {}],
    ["an owned local plan with a duplicate portable identity", {}, {
      plans: [
        { id: "plan-one", origin: "custom", portable_id: "c".repeat(32) },
        { id: "plan-two", origin: "copied", portable_id: "c".repeat(32) },
      ],
    }],
  ];

  it.each(invalidRootAndSettingCases)("rejects %s", async (_label, archiveExtra, localExtra) => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      archiveExtra,
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      localExtra,
    );

    await expect(buildPortableMergePlan({ archive, local, payloadDigest }))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  const invalidReceiptCases: Array<[
    string,
    Readonly<Record<string, readonly Record<string, unknown>[]>>,
  ]> = [
    ["an active session exercise pointer that cannot be rewritten", {
      workout_sessions: [{
        id: "archive-session", portable_id: sessionPortableId, merge_modified_at_ms: 20,
        active_session_exercise_id: "missing", active_set_id: null,
      }],
    }],
    ["an edit receipt with an unsupported operation", {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      workout_session_exercise_edit_receipts: [{
        request_id: "edit", session_id: "archive-session", operation: "rename",
        subject_session_exercise_id: "exercise", replacement_session_exercise_id: null, result_json: "{}",
      }],
    }],
    ["an edit receipt with a non-object result", {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      workout_session_exercise_edit_receipts: [{
        request_id: "edit", session_id: "archive-session", operation: "remove_exercise",
        subject_session_exercise_id: "exercise", replacement_session_exercise_id: null, result_json: "[]",
      }],
    }],
    ["a reorder receipt with a non-array ordered payload", {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      workout_session_exercise_reorder_receipts: [{
        request_id: "reorder", session_id: "archive-session", ordered_session_exercise_ids_json: "{}",
        result_json: JSON.stringify({ sessionId: "archive-session", orderedSessionExerciseIds: [], expectedSessionExerciseRevisions: [] }),
      }],
    }],
    ["a reorder receipt result with a non-object revision entry", {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      workout_session_exercise_reorder_receipts: [{
        request_id: "reorder", session_id: "archive-session", ordered_session_exercise_ids_json: JSON.stringify(["exercise"]),
        result_json: JSON.stringify({
          sessionId: "archive-session", orderedSessionExerciseIds: ["exercise"], expectedSessionExerciseRevisions: ["bad"],
        }),
      }],
    }],
  ];

  it.each(invalidReceiptCases)("rejects %s", async (_label, extra) => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, extra);
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    await expect(buildPortableMergePlan({ archive, local, payloadDigest }))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  it("fails closed when materializing a rest-default receipt outside its canonical shape", async () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      workout_session_exercise_rest_default_receipts: [{
        request_id: "exercise-rest:invalid",
        session_id: "archive-session",
        session_exercise_id: "exercise",
        result_json: JSON.stringify({
          version: 1,
          sessionId: "archive-session",
          sessionExerciseId: "exercise",
          defaultRestSeconds: -1,
        }),
      }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    const plan = await buildPortableMergePlan({ archive, local, payloadDigest });

    expect(() => plan.aggregates).toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("uses the canonical payload digest to break an equal-timestamp session tie deterministically", async () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 20 });

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async (value) => value.includes("archive")
        ? "f".repeat(64)
        : "0".repeat(64),
    });

    expect(plan.preview).toEqual({
      archiveWon: 1,
      conflicts: 0,
      duplicates: 0,
      inserted: 0,
      keptBoth: 0,
      localWon: 0,
      remapped: 0,
    });
    expect(plan.operations).toEqual([expect.objectContaining({
      aggregateClass: "workout_session",
      kind: "archive_won",
      portableId: sessionPortableId,
    })]);
    expect(plan.aggregates).toEqual([expect.objectContaining({
      aggregateClass: "workout_session",
      portableId: sessionPortableId,
      tables: expect.objectContaining({
        workout_sessions: [expect.objectContaining({ id: "local-session" })],
      }),
    })]);
  });

  it("keeps local settings on duplicate keys while importing missing keys", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        app_settings: [
          { key: "appearance", value_json: '"dark"' },
          { key: "units", value_json: '"metric"' },
        ],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      { app_settings: [{ key: "appearance", value_json: '"light"' }] },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });

    expect(plan.preview).toEqual(expect.objectContaining({
      inserted: 1,
      localWon: 1,
    }));
    expect(plan.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        aggregateClass: "app_setting",
        kind: "local_won",
        key: "appearance",
      }),
      expect.objectContaining({
        aggregateClass: "app_setting",
        kind: "insert",
        key: "units",
      }),
    ]));
  });

  it("remaps a distinct portable session that collides with a local physical ID", async () => {
    const archive = snapshot(
      { id: "session-1", marker: "archive", modifiedAtMs: 20 },
      {
        session_exercises: [{ id: "session-exercise-1", session_id: "session-1" }],
      },
    );
    const local = {
      ...snapshot({ id: "session-1", marker: "local", modifiedAtMs: 10 }),
      tables: {
        ...snapshot({ id: "session-1", marker: "local", modifiedAtMs: 10 }).tables,
        workout_sessions: [{
          id: "session-1",
          portable_id: "b".repeat(32),
          merge_modified_at_ms: 10,
          marker: "local",
        }],
      },
    };

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });
    const remap = plan.idRemaps.find((value) =>
      value.recordClass === "workout_session" && value.archiveId === "session-1",
    );
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "workout_session" && value.portableId === sessionPortableId,
    );

    expect(remap?.localId).not.toBe("session-1");
    expect(aggregate?.tables.workout_sessions).toEqual([
      expect.objectContaining({ id: remap?.localId }),
    ]);
    expect(aggregate?.tables.session_exercises).toEqual([
      expect.objectContaining({ session_id: remap?.localId }),
    ]);
  });

  it("remaps colliding session descendants and rewrites their internal references", async () => {
    const children = {
      session_exercises: [{
        id: "exercise-1",
        session_id: "session-1",
        metric_profile: "load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 1,
      }],
      session_sets: [{
        id: "set-1",
        session_exercise_id: "exercise-1",
        metric_profile: "load_reps",
        metric_contract_version: 1,
        exercise_metric_generation: 1,
      }],
      session_rest_states: [{ session_id: "session-1", next_set_id: "set-1" }],
      session_advanced_timing_states: [{ session_id: "session-1", session_set_id: "set-1" }],
      session_undo_snapshots: [{
        id: "undo-1", session_id: "session-1", completed_set_id: "set-1",
      }],
      history_audit_events: [{ id: "audit-1", session_id: "session-1" }],
      workout_session_exercise_edit_receipts: [{
        request_id: "edit-1",
        operation: "replace_exercise",
        session_id: "session-1",
        subject_session_exercise_id: "exercise-1",
        replacement_session_exercise_id: "exercise-1",
        result_json: JSON.stringify({
          sessionId: "session-1",
          sessionExerciseId: "exercise-1",
          replacementSessionExerciseId: "exercise-1",
          replacementSetId: "set-1",
        }),
      }],
      workout_session_exercise_reorder_receipts: [{
        request_id: "reorder-1",
        session_id: "session-1",
        ordered_session_exercise_ids_json: JSON.stringify(["exercise-1"]),
        result_json: JSON.stringify({
          sessionId: "session-1",
          orderedSessionExerciseIds: ["exercise-1"],
          expectedSessionExerciseRevisions: [{
            sessionExerciseId: "exercise-1",
            revision: 1,
          }],
        }),
      }],
      workout_session_exercise_rest_default_receipts: [{
        request_id: "exercise-rest:deterministic-request-sha",
        request_sha256: "a".repeat(64),
        session_id: "session-1",
        session_exercise_id: "exercise-1",
        default_rest_seconds: 75,
        expected_session_revision: 1,
        expected_session_exercise_revision: 1,
        result_session_revision: 2,
        result_session_exercise_revision: 2,
        result_json: JSON.stringify({
          version: 1,
          sessionId: "session-1",
          sessionExerciseId: "exercise-1",
          defaultRestSeconds: 75,
        }),
        committed_at_ms: 1,
      }],
    } as const;
    const archive = snapshot(
      { id: "session-1", marker: "archive", modifiedAtMs: 20 },
      children,
    );
    const archiveWithActivePointers = {
      ...archive,
      tables: {
        ...archive.tables,
        workout_sessions: [{
          ...archive.tables.workout_sessions[0]!,
          active_session_exercise_id: "exercise-1",
          active_set_id: "set-1",
        }],
      },
    };
    const local = {
      ...snapshot({ id: "session-1", marker: "local", modifiedAtMs: 10 }, children),
      tables: {
        ...snapshot({ id: "session-1", marker: "local", modifiedAtMs: 10 }, children).tables,
        workout_sessions: [{
          id: "session-1",
          portable_id: "b".repeat(32),
          merge_modified_at_ms: 10,
          marker: "local",
        }],
      },
    };

    const plan = await buildPortableMergePlan({
      archive: archiveWithActivePointers,
      local,
      payloadDigest: async () => "0".repeat(64),
    });
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "workout_session" && value.portableId === sessionPortableId,
    );
    const sessionId = aggregate?.tables.workout_sessions?.[0]?.id;
    const exerciseId = aggregate?.tables.session_exercises?.[0]?.id;
    const setId = aggregate?.tables.session_sets?.[0]?.id;

    expect(sessionId).not.toBe("session-1");
    expect(exerciseId).not.toBe("exercise-1");
    expect(setId).not.toBe("set-1");
    expect(aggregate?.tables.session_exercises).toEqual([
      expect.objectContaining({ id: exerciseId, session_id: sessionId }),
    ]);
    expect(aggregate?.tables.session_sets).toEqual([
      expect.objectContaining({ id: setId, session_exercise_id: exerciseId }),
    ]);
    expect(aggregate?.tables.workout_sessions).toEqual([
      expect.objectContaining({
        id: sessionId,
        active_session_exercise_id: exerciseId,
        active_set_id: setId,
      }),
    ]);
    expect(aggregate?.tables.session_rest_states).toEqual([
      expect.objectContaining({ session_id: sessionId, next_set_id: setId }),
    ]);
    expect(aggregate?.tables.session_advanced_timing_states).toEqual([
      expect.objectContaining({ session_id: sessionId, session_set_id: setId }),
    ]);
    expect(aggregate?.tables.session_undo_snapshots).toEqual([
      expect.objectContaining({
        id: expect.not.stringMatching(/^undo-1$/u),
        session_id: sessionId,
        completed_set_id: setId,
      }),
    ]);
    expect(aggregate?.tables.history_audit_events).toEqual([
      expect.objectContaining({ id: expect.not.stringMatching(/^audit-1$/u), session_id: sessionId }),
    ]);
    expect(aggregate?.tables.workout_session_exercise_edit_receipts).toEqual([
      expect.objectContaining({
        request_id: expect.not.stringMatching(/^edit-1$/u),
        session_id: sessionId,
        subject_session_exercise_id: exerciseId,
        replacement_session_exercise_id: exerciseId,
        result_json: JSON.stringify({
          sessionId,
          sessionExerciseId: exerciseId,
          replacementSessionExerciseId: exerciseId,
          replacementSetId: setId,
        }),
      }),
    ]);
    expect(aggregate?.tables.workout_session_exercise_reorder_receipts).toEqual([
      expect.objectContaining({
        request_id: expect.not.stringMatching(/^reorder-1$/u),
        session_id: sessionId,
        ordered_session_exercise_ids_json: JSON.stringify([exerciseId]),
        result_json: JSON.stringify({
          sessionId,
          orderedSessionExerciseIds: [exerciseId],
          expectedSessionExerciseRevisions: [{ sessionExerciseId: exerciseId, revision: 1 }],
        }),
      }),
    ]);
    expect(aggregate?.tables.workout_session_exercise_rest_default_receipts).toEqual([
      expect.objectContaining({
        request_id: expect.not.stringMatching(/^exercise-rest:deterministic-request-sha$/u),
        request_sha256: "a".repeat(64),
        session_id: sessionId,
        session_exercise_id: exerciseId,
        result_json: JSON.stringify({
          version: 1,
          sessionId,
          sessionExerciseId: exerciseId,
          defaultRestSeconds: 75,
        }),
      }),
    ]);
  });

  it("keeps distinct custom exercise identities and remaps a physical ID collision", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        exercises: [{
          id: "exercise-1",
          origin: "custom",
          portable_id: "b".repeat(32),
          name: "Same visible name",
        }],
        exercise_library_entries: [{
          exercise_id: "exercise-1",
          origin: "custom",
        }],
        exercise_taxonomy: [{
          exercise_id: "exercise-1",
          kind: "equipment",
          slug: "barbell",
          relation: "equipment",
          ordinal: 0,
        }],
        taxonomy_terms: [{
          kind: "equipment",
          slug: "barbell",
          display_name: "Barbell",
        }],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      {
        exercises: [{
          id: "exercise-1",
          origin: "custom",
          portable_id: "c".repeat(32),
          name: "Same visible name",
        }],
      },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });

    expect(plan.preview).toEqual(expect.objectContaining({
      keptBoth: 1,
      remapped: 1,
    }));
    expect(plan.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        aggregateClass: "custom_exercise",
        kind: "keep_both",
        portableId: "b".repeat(32),
      }),
    ]));
    expect(plan.idRemaps).toEqual([expect.objectContaining({
      archiveId: "exercise-1",
      recordClass: "custom_exercise",
    })]);
    expect(plan.idRemaps[0]?.localId).not.toBe("exercise-1");
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "custom_exercise"
      && value.portableId === "b".repeat(32),
    );
    expect(aggregate?.tables.exercise_library_entries).toEqual([
      expect.objectContaining({ exercise_id: plan.idRemaps[0]?.localId }),
    ]);
    expect(aggregate?.tables.taxonomy_terms).toEqual([
      expect.objectContaining({ kind: "equipment", slug: "barbell" }),
    ]);
  });

  it("deduplicates matching custom exercise identities even when physical IDs differ", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        exercises: [{
          id: "archive-exercise",
          origin: "custom",
          portable_id: "d".repeat(32),
        }],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      {
        exercises: [{
          id: "local-exercise",
          origin: "custom",
          portable_id: "d".repeat(32),
        }],
      },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });

    expect(plan.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        aggregateClass: "custom_exercise",
        kind: "duplicate",
        archiveId: "archive-exercise",
        localId: "local-exercise",
      }),
    ]));
    expect(plan.idRemaps).toEqual([]);
    expect(plan.idMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recordClass: "custom_exercise",
        archiveId: "archive-exercise",
        localId: "local-exercise",
      }),
    ]));
  });

  it("remaps colliding custom-exercise child primary keys", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        exercises: [{ id: "archive-exercise", origin: "custom", portable_id: "e".repeat(32) }],
        exercise_library_entries: [{ exercise_id: "archive-exercise", origin: "custom" }],
        exercise_aliases: [{ id: 1, exercise_id: "archive-exercise", ordinal: 0 }],
        exercise_search_terms: [{ id: 1, exercise_id: "archive-exercise", kind: "canonical", ordinal: 0 }],
        metric_profile_migration_events: [{
          idempotency_key: "event-1",
          exercise_id: "archive-exercise",
        }],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      {
        exercises: [{ id: "local-exercise", origin: "custom", portable_id: "f".repeat(32) }],
        exercise_library_entries: [{ exercise_id: "local-exercise", origin: "custom" }],
        exercise_aliases: [{ id: 1, exercise_id: "local-exercise", ordinal: 0 }],
        exercise_search_terms: [{ id: 1, exercise_id: "local-exercise", kind: "canonical", ordinal: 0 }],
        metric_profile_migration_events: [{
          idempotency_key: "event-1",
          exercise_id: "local-exercise",
        }],
      },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "custom_exercise" && value.portableId === "e".repeat(32),
    );

    expect(aggregate?.tables.exercise_aliases).toEqual([
      expect.objectContaining({ id: expect.any(Number), exercise_id: "archive-exercise" }),
    ]);
    expect(aggregate?.tables.exercise_aliases?.[0]?.id).not.toBe(1);
    expect(aggregate?.tables.exercise_search_terms?.[0]?.id).not.toBe(1);
    expect(aggregate?.tables.metric_profile_migration_events?.[0]?.idempotency_key)
      .not.toBe("event-1");
  });

  it("allocates unique custom-exercise child ids across every aggregate collision", async () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      exercises: [
        { id: "archive-a", origin: "custom", portable_id: "a".repeat(32) },
        { id: "archive-b", origin: "custom", portable_id: "b".repeat(32) },
      ],
      exercise_aliases: [
        { id: 1, exercise_id: "archive-a", ordinal: 0 },
        { id: 2, exercise_id: "archive-a", ordinal: 1 },
        { id: 3, exercise_id: "archive-b", ordinal: 0 },
        { id: 4, exercise_id: "archive-b", ordinal: 1 },
      ],
      exercise_search_terms: [
        { id: 1, exercise_id: "archive-a", kind: "canonical", ordinal: 0 },
        { id: 2, exercise_id: "archive-a", kind: "alias", ordinal: 1 },
        { id: 3, exercise_id: "archive-b", kind: "canonical", ordinal: 0 },
        { id: 4, exercise_id: "archive-b", kind: "alias", ordinal: 1 },
      ],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      exercises: [
        { id: "local-a", origin: "custom", portable_id: "c".repeat(32) },
        { id: "local-b", origin: "custom", portable_id: "d".repeat(32) },
      ],
      exercise_aliases: [
        { id: 1, exercise_id: "local-a", ordinal: 0 },
        { id: 2, exercise_id: "local-b", ordinal: 0 },
        { id: 3, exercise_id: "local-a", ordinal: 1 },
        { id: 4, exercise_id: "local-b", ordinal: 1 },
      ],
      exercise_search_terms: [
        { id: 1, exercise_id: "local-a", kind: "canonical", ordinal: 0 },
        { id: 2, exercise_id: "local-b", kind: "canonical", ordinal: 0 },
        { id: 3, exercise_id: "local-a", kind: "alias", ordinal: 1 },
        { id: 4, exercise_id: "local-b", kind: "alias", ordinal: 1 },
      ],
    });

    const plan = await buildPortableMergePlan({ archive, local, payloadDigest });
    const aliases = plan.aggregates.flatMap((aggregate) => aggregate.tables.exercise_aliases ?? []);
    const terms = plan.aggregates.flatMap((aggregate) => aggregate.tables.exercise_search_terms ?? []);

    expect(aliases.map((row) => row.id)).toEqual([5, 6, 7, 8]);
    expect(new Set(aliases.map((row) => row.id)).size).toBe(4);
    expect(terms.map((row) => row.id)).toEqual([5, 6, 7, 8]);
  });

  it("keeps distinct owned plan identities through a physical ID collision", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        plans: [{
          id: "plan-1",
          origin: "copied",
          portable_id: "e".repeat(32),
          name: "Same name",
        }],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      {
        plans: [{
          id: "plan-1",
          origin: "copied",
          portable_id: "f".repeat(32),
          name: "Same name",
        }],
      },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });

    expect(plan.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        aggregateClass: "owned_plan",
        kind: "keep_both",
        portableId: "e".repeat(32),
      }),
    ]));
    expect(plan.idRemaps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recordClass: "owned_plan",
        archiveId: "plan-1",
      }),
    ]));
  });

  it("keeps the existing active plan when importing a distinct active plan", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        plans: [{
          id: "archive-plan",
          origin: "custom",
          portable_id: "a".repeat(32),
          is_active: 1,
        }],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      {
        plans: [{
          id: "local-plan",
          origin: "custom",
          portable_id: "b".repeat(32),
          is_active: 1,
        }],
      },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "owned_plan" && value.portableId === "a".repeat(32),
    );

    expect(aggregate?.tables.plans).toEqual([
      expect.objectContaining({ id: "archive-plan", is_active: 0 }),
    ]);
  });

  it("keeps the existing active schedule when importing a distinct active plan", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        plans: [{ id: "archive-plan", origin: "custom", portable_id: "a".repeat(32) }],
        owned_plan_schedules: [{
          id: "archive-schedule",
          plan_id: "archive-plan",
          lifecycle: "active",
        }],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      {
        plans: [{ id: "local-plan", origin: "custom", portable_id: "b".repeat(32) }],
        owned_plan_schedules: [{
          id: "local-schedule",
          plan_id: "local-plan",
          lifecycle: "active",
        }],
      },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "owned_plan" && value.portableId === "a".repeat(32),
    );

    expect(aggregate?.tables.owned_plan_schedules).toEqual([
      expect.objectContaining({ id: "archive-schedule", lifecycle: "inactive" }),
    ]);
  });

  it("rewrites an owned plan child graph through deterministic root and day remaps", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        plans: [{ id: "plan-1", origin: "custom", portable_id: "f".repeat(32) }],
        plan_days: [{ id: "day-1", plan_id: "plan-1", ordinal: 0 }],
        plan_schedules: [{ id: "schedule-1", plan_id: "plan-1" }],
        plan_schedule_bindings: [{
          id: "legacy-schedule-binding-1",
          schedule_id: "schedule-1",
          plan_day_id: "day-1",
        }],
        owned_plan_schedules: [{ id: "owned-schedule-1", plan_id: "plan-1" }],
        owned_plan_schedule_versions: [{
          id: "schedule-version-1",
          schedule_id: "owned-schedule-1",
        }],
        owned_plan_schedule_bindings: [{
          id: "schedule-binding-1",
          schedule_version_id: "schedule-version-1",
          plan_day_id: "day-1",
        }],
        owned_plan_schedule_overrides: [{
          id: "schedule-override-1",
          schedule_id: "owned-schedule-1",
          plan_day_id: "day-1",
        }],
        owned_plan_schedule_opportunities: [{
          id: "schedule-opportunity-1",
          schedule_id: "owned-schedule-1",
          schedule_version_id: "schedule-version-1",
          plan_day_id: "day-1",
        }],
        owned_plan_day_sources: [{ plan_day_id: "day-1", plan_id: "plan-1" }],
        owned_plan_day_exercises: [{
          id: "owned-occurrence-1",
          plan_day_id: "day-1",
          exercise_id: "retained-exercise",
        }],
        owned_plan_working_set_targets: [{
          id: "owned-target-1",
          plan_day_exercise_id: "owned-occurrence-1",
        }],
        owned_plan_occurrence_sources: [{
          plan_day_exercise_id: "owned-occurrence-1",
          plan_day_id: "day-1",
        }],
        owned_progression_recommendations: [{
          id: "owned-recommendation-1",
          exercise_id: "retained-exercise",
          owned_plan_working_set_target_id: "owned-target-1",
        }],
        plan_working_set_targets: [{
          id: "target-1",
          plan_day_exercise_id: "occurrence-1",
          metric_profile: "load_reps",
          metric_contract_version: 1,
          exercise_metric_generation: 1,
        }],
        progression_recommendations: [{
          id: "recommendation-1",
          exercise_id: "retained-exercise",
          plan_working_set_target_id: "target-1",
        }],
        owned_plan_mutation_requests: [{
          request_id: "mutation-1",
          source_plan_id: "plan-1",
          result_plan_id: "plan-1",
        }],
        starter_plan_activation_requests: [{
          request_id: "activation-1",
          selected_plan_id: "plan-1",
          result_plan_id: "plan-1",
          result_schedule_id: "owned-schedule-1",
        }],
        plan_day_exercises: [{
          id: "occurrence-1",
          plan_day_id: "day-1",
          exercise_id: "retained-exercise",
          metric_profile: "load_reps",
          metric_contract_version: 1,
          exercise_metric_generation: 1,
        }],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      {
        plans: [{ id: "plan-1", origin: "custom", portable_id: "e".repeat(32) }],
        plan_days: [{ id: "day-1", plan_id: "plan-1", ordinal: 0 }],
        plan_schedules: [{ id: "schedule-1", plan_id: "plan-1" }],
        owned_plan_schedules: [{ id: "owned-schedule-1", plan_id: "plan-1" }],
        owned_plan_schedule_versions: [{
          id: "schedule-version-1",
          schedule_id: "owned-schedule-1",
        }],
        owned_plan_day_exercises: [{
          id: "owned-occurrence-1",
          plan_day_id: "day-1",
          exercise_id: "retained-exercise",
        }],
      },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "owned_plan"
      && value.portableId === "f".repeat(32),
    );
    const rootId = plan.idRemaps.find((value) =>
      value.recordClass === "owned_plan" && value.archiveId === "plan-1",
    )?.localId;

    expect(rootId).toBeDefined();
    expect(aggregate?.tables.plans).toEqual([
      expect.objectContaining({ id: rootId }),
    ]);
    expect(aggregate?.tables.plan_days).toEqual([
      expect.objectContaining({ plan_id: rootId }),
    ]);
    expect(aggregate?.tables.plan_day_exercises).toEqual([
      expect.objectContaining({ plan_day_id: expect.not.stringMatching(/^day-1$/u) }),
    ]);
    expect(aggregate?.tables.plan_schedules).toEqual([
      expect.objectContaining({ plan_id: rootId }),
    ]);
    expect(aggregate?.tables.plan_schedule_bindings).toEqual([
      expect.objectContaining({
        schedule_id: expect.not.stringMatching(/^schedule-1$/u),
        plan_day_id: expect.not.stringMatching(/^day-1$/u),
      }),
    ]);
    expect(aggregate?.tables.owned_plan_schedules).toEqual([
      expect.objectContaining({ plan_id: rootId }),
    ]);
    expect(aggregate?.tables.owned_plan_schedule_versions).toEqual([
      expect.objectContaining({ schedule_id: expect.not.stringMatching(/^owned-schedule-1$/u) }),
    ]);
    expect(aggregate?.tables.owned_plan_schedule_bindings).toEqual([
      expect.objectContaining({
        schedule_version_id: expect.not.stringMatching(/^schedule-version-1$/u),
        plan_day_id: expect.not.stringMatching(/^day-1$/u),
      }),
    ]);
    expect(aggregate?.tables.owned_plan_schedule_overrides).toEqual([
      expect.objectContaining({
        schedule_id: expect.not.stringMatching(/^owned-schedule-1$/u),
        plan_day_id: expect.not.stringMatching(/^day-1$/u),
      }),
    ]);
    expect(aggregate?.tables.owned_plan_schedule_opportunities).toEqual([
      expect.objectContaining({
        schedule_id: expect.not.stringMatching(/^owned-schedule-1$/u),
        schedule_version_id: expect.not.stringMatching(/^schedule-version-1$/u),
        plan_day_id: expect.not.stringMatching(/^day-1$/u),
      }),
    ]);
    expect(aggregate?.tables.owned_plan_day_sources).toEqual([
      expect.objectContaining({
        plan_day_id: expect.not.stringMatching(/^day-1$/u),
        plan_id: rootId,
      }),
    ]);
    expect(aggregate?.tables.owned_plan_occurrence_sources).toEqual([
      expect.objectContaining({
        plan_day_exercise_id: expect.not.stringMatching(/^owned-occurrence-1$/u),
        plan_day_id: expect.not.stringMatching(/^day-1$/u),
      }),
    ]);
    expect(aggregate?.tables.owned_plan_mutation_requests).toEqual([
      expect.objectContaining({ source_plan_id: rootId, result_plan_id: rootId }),
    ]);
    expect(aggregate?.tables.starter_plan_activation_requests).toEqual([
      expect.objectContaining({
        selected_plan_id: rootId,
        result_plan_id: rootId,
        result_schedule_id: expect.not.stringMatching(/^owned-schedule-1$/u),
      }),
    ]);
    expect(aggregate?.tables.progression_recommendations).toEqual([
      expect.objectContaining({ plan_working_set_target_id: "target-1" }),
    ]);
    expect(aggregate?.tables.owned_progression_recommendations).toEqual([
      expect.objectContaining({ owned_plan_working_set_target_id: "owned-target-1" }),
    ]);
  });

  it("rewrites a plan occurrence to the mapped local custom exercise identity", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        exercises: [{
          id: "archive-exercise",
          origin: "custom",
          portable_id: "c".repeat(32),
        }],
        plans: [{ id: "archive-plan", origin: "custom", portable_id: "d".repeat(32) }],
        plan_days: [{ id: "archive-day", plan_id: "archive-plan", ordinal: 0 }],
        plan_day_exercises: [{
          id: "archive-occurrence",
          plan_day_id: "archive-day",
          exercise_id: "archive-exercise",
          metric_profile: "load_reps",
          metric_contract_version: 1,
          exercise_metric_generation: 1,
        }],
      },
    );
    const local = snapshot(
      { id: "local-session", marker: "local", modifiedAtMs: 10 },
      {
        exercises: [{
          id: "local-exercise",
          origin: "custom",
          portable_id: "c".repeat(32),
        }],
      },
    );

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });
    const aggregate = plan.aggregates.find((value) =>
      value.aggregateClass === "owned_plan" && value.portableId === "d".repeat(32),
    );

    expect(aggregate?.tables.plan_day_exercises).toEqual([
      expect.objectContaining({ exercise_id: "local-exercise" }),
    ]);
  });

  it("rejects an orphan session child before returning any plan", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        session_exercises: [{
          id: "orphan-exercise",
          session_id: "missing-session",
        }],
      },
    );
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    await expect(buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    })).rejects.toThrow("merge_plan_invalid");
  });

  it("is order-independent for the same archive facts", async () => {
    const base = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        app_settings: [
          { key: "z", value_json: "1" },
          { key: "a", value_json: "2" },
        ],
        exercises: [
          { id: "exercise-z", origin: "custom", portable_id: "c".repeat(32) },
          { id: "exercise-a", origin: "custom", portable_id: "b".repeat(32) },
        ],
      },
    );
    const tables = base.tables as Readonly<Record<string, readonly import("./backupContracts").LogicalBackupRow[]>>;
    const reordered = {
      ...base,
      tables: {
        ...base.tables,
        app_settings: [...tables.app_settings!].reverse(),
        exercises: [...tables.exercises!].reverse(),
      },
    };
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });
    const input = { local, payloadDigest: async () => "0".repeat(64) };

    await expect(buildPortableMergePlan({ ...input, archive: base }))
      .resolves.toEqual(await buildPortableMergePlan({ ...input, archive: reordered }));
  });

  it("serializes and rejects primitive planner helper inputs deterministically", () => {
    expect(__mergePlanTestOnly.canonicalValue({ z: [true, null], a: 1 }))
      .toBe('{"a":1,"z":[true,null]}');
    expect(() => __mergePlanTestOnly.canonicalValue(new Date()))
      .toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.nonNegativeInteger(-1))
      .toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.textId(" "))
      .toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.parseJsonObject("[]"))
      .toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.encodeJson(undefined))
      .toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.mappedIdentifier(new Map(), "missing"))
      .toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("rewrites both supported receipt payload forms and rejects missing mappings", () => {
    const sessionIds = new Map([["archive-session", "local-session"]]);
    const exerciseIds = new Map([["archive-exercise", "local-exercise"]]);
    const setIds = new Map([["archive-set", "local-set"]]);

    expect(__mergePlanTestOnly.rewriteEditReceiptResult(
      JSON.stringify({ sessionId: "archive-session", sessionExerciseId: "archive-exercise" }),
      "remove_exercise",
      sessionIds,
      exerciseIds,
      setIds,
    )).toBe(JSON.stringify({ sessionId: "local-session", sessionExerciseId: "local-exercise" }));
    expect(__mergePlanTestOnly.rewriteReorderReceipt(
      JSON.stringify(["archive-exercise"]),
      exerciseIds,
    )).toBe(JSON.stringify(["local-exercise"]));
    expect(__mergePlanTestOnly.rewriteReorderReceiptResult(
      JSON.stringify({
        sessionId: "archive-session",
        orderedSessionExerciseIds: ["archive-exercise"],
        expectedSessionExerciseRevisions: [{ sessionExerciseId: "archive-exercise", revision: 1 }],
      }),
      sessionIds,
      exerciseIds,
    )).toBe(JSON.stringify({
      sessionId: "local-session",
      orderedSessionExerciseIds: ["local-exercise"],
      expectedSessionExerciseRevisions: [{ sessionExerciseId: "local-exercise", revision: 1 }],
    }));
    expect(() => __mergePlanTestOnly.rewriteEditReceiptResult("{}", "unsupported", sessionIds, exerciseIds, setIds))
      .toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.rewriteReorderReceipt("invalid", exerciseIds))
      .toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.rewriteReorderReceiptResult("{}", sessionIds, exerciseIds))
      .toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("allocates deterministic root and child collision identifiers", () => {
    const occupied = new Set(["merge_session_" + sessionPortableId, `merge_session_${sessionPortableId}_1`]);
    expect(__mergePlanTestOnly.nextPhysicalId("workout_session", sessionPortableId, occupied))
      .toBe(`merge_session_${sessionPortableId}_2`);
    const children = new Set([`merge_session_sets_${sessionPortableId}_0`]);
    expect(__mergePlanTestOnly.remappedChildId("session_sets", sessionPortableId, 0, children))
      .toBe(`merge_session_sets_${sessionPortableId}_0_1`);
    expect(__mergePlanTestOnly.replaceScalar({ id: "old" }, "id", "old", "new"))
      .toEqual({ id: "new" });
    expect(__mergePlanTestOnly.replaceScalar({ id: "other" }, "id", "old", "new"))
      .toEqual({ id: "other" });
  });

  it("rejects invalid numeric exercise children and skips occupied allocator successors", () => {
    const operation = {
      aggregateClass: "custom_exercise" as const,
      kind: "insert" as const,
      portableId: "e".repeat(32),
      archiveId: "exercise",
      localId: "exercise",
    };
    const source = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      exercises: [{ id: "exercise", origin: "custom", portable_id: "e".repeat(32) }],
      exercise_aliases: [{ id: 1, exercise_id: "exercise" }],
    });
    const allocators = new Map([["exercise_aliases", { occupied: new Set([1, 2]), nextId: 2 }]]);
    expect(__mergePlanTestOnly.exerciseAggregate(source, snapshot({ id: "local", marker: "local", modifiedAtMs: 1 }), operation, allocators).tables.exercise_aliases)
      .toEqual([expect.objectContaining({ id: 3 })]);
    expect(() => __mergePlanTestOnly.exerciseAggregate({
      ...source,
      tables: { ...source.tables, exercise_aliases: [{ id: "bad", exercise_id: "exercise" }] },
    }, snapshot({ id: "local", marker: "local", modifiedAtMs: 1 }), operation, new Map([
      ["exercise_aliases", { occupied: new Set<number>(), nextId: 1 }],
    ])))
      .toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("maps child references, optional references, and supplied composite identities fail-closed", () => {
    const source = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      child_rows: [{ id: "child", parent_id: "parent", optional_id: "missing" }],
    });
    const childRows = (source.tables as Readonly<Record<string, readonly LogicalBackupRow[]>>).child_rows!;
    const mapped = __mergePlanTestOnly.mappedRows(
      source,
      "child_rows",
      childRows,
      [
        { column: "parent_id", ids: new Map([["parent", "local-parent"]]) },
        { column: "optional_id", ids: new Map(), optional: true },
      ],
      false,
      sessionPortableId,
    );
    expect(mapped.rows).toEqual([{ id: "child", parent_id: "local-parent", optional_id: "missing" }]);
    expect(() => __mergePlanTestOnly.mappedRows(
      source,
      "child_rows",
      childRows,
      [{ column: "parent_id", ids: new Map() }],
      false,
      sessionPortableId,
    )).toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.mappedRows(
      source,
      "child_rows",
      childRows,
      [],
      false,
      sessionPortableId,
      "id",
      new Map(),
    )).toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("constructs session aggregate remaps with nullable pointers and remove receipts", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      session_exercises: [{ id: "archive-exercise", session_id: "archive-session" }],
      session_sets: [{ id: "archive-set", session_exercise_id: "archive-exercise" }],
      session_rest_states: [{ session_id: "archive-session", next_set_id: null }],
      workout_session_exercise_edit_receipts: [{
        request_id: "remove-receipt", session_id: "archive-session", operation: "remove_exercise",
        subject_session_exercise_id: "archive-exercise", replacement_session_exercise_id: null,
        result_json: JSON.stringify({ sessionId: "archive-session", sessionExerciseId: "archive-exercise" }),
      }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      session_exercises: [{ id: "archive-exercise", session_id: "other-session" }],
      session_sets: [{ id: "archive-set", session_exercise_id: "other-exercise" }],
      workout_session_exercise_edit_receipts: [{ request_id: "remove-receipt", session_id: "other-session" }],
    });

    const aggregate = __mergePlanTestOnly.sessionAggregate(archive, local, sessionPortableId, "local-session");
    expect(aggregate.tables.session_rest_states).toEqual([{ session_id: "local-session", next_set_id: null }]);
    expect(aggregate.tables.workout_session_exercise_edit_receipts).toEqual([expect.objectContaining({
      request_id: expect.not.stringMatching(/^remove-receipt$/u),
      session_id: "local-session",
      subject_session_exercise_id: expect.not.stringMatching(/^archive-exercise$/u),
      result_json: expect.stringContaining("local-session"),
    })]);
  });

  it("reuses frozen rows when no aggregate identifiers change", () => {
    const row = Object.freeze({ id: "child", session_id: "session" });
    const occupiedRows = [{ id: "occupied" }];
    occupiedRows.map = (() => {
      throw new Error("unexpected occupied-id scan");
    }) as typeof occupiedRows.map;
    const source = snapshot({ id: "session", marker: "source", modifiedAtMs: 1 }, {
      child_rows: occupiedRows,
    });

    const mapped = __mergePlanTestOnly.mappedRows(
      source,
      "child_rows",
      [row],
      [{ column: "session_id", ids: new Map([["session", "session"]]) }],
      false,
      sessionPortableId,
    );

    expect(mapped.rows[0]).toBe(row);
    expect(mapped.ids).toEqual(new Map([["child", "child"]]));
  });

  it("rejects session aggregate remaps with an unresolved active pointer", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      workout_sessions: [{
        id: "archive-session", portable_id: sessionPortableId, merge_modified_at_ms: 20, active_session_exercise_id: "missing", active_set_id: null,
      }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    expect(() => __mergePlanTestOnly.sessionAggregate(archive, local, sessionPortableId, "local-session"))
      .toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("rejects invalid lazy materialization inputs and indexed session identities", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });
    expect(() => __mergePlanTestOnly.assertSessionMaterializationInputs({
      ...archive,
      tables: {
        ...archive.tables,
        workout_sessions: [{
          ...archive.tables.workout_sessions[0]!,
          active_set_id: "missing-set",
        }],
      },
    })).toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.assertSessionMaterializationInputs({
      ...archive,
      tables: {
        ...archive.tables,
        session_exercises: [{ id: "exercise", session_id: "archive-session" }],
        workout_session_exercise_edit_receipts: [{
          request_id: "receipt",
          session_id: "archive-session",
          operation: "remove_exercise",
          subject_session_exercise_id: "exercise",
          replacement_session_exercise_id: "missing-exercise",
          result_json: JSON.stringify({
            sessionId: "archive-session",
            sessionExerciseId: "exercise",
          }),
        }],
      },
    })).toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.sessionAggregate(
      archive,
      local,
      sessionPortableId,
      "local-session",
      {
        archiveSessionId: "different-session",
        index: __mergePlanTestOnly.createSessionDigestIndex(archive),
        occupiedIdsFor: () => new Set(),
      },
    )).toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.requiredMappedRow(new Map(), "missing"))
      .toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("builds root operations for matching identity and physical collisions", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      exercises: [
        { id: "same", origin: "custom", portable_id: "b".repeat(32) },
        { id: "collision", origin: "custom", portable_id: "c".repeat(32) },
      ],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      exercises: [
        { id: "local-same", origin: "custom", portable_id: "b".repeat(32) },
        { id: "collision", origin: "custom", portable_id: "d".repeat(32) },
      ],
    });

    const result = __mergePlanTestOnly.rootOperations(archive, local, {
      aggregateClass: "custom_exercise", table: "exercises",
    });
    expect(result.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "duplicate", archiveId: "same", localId: "local-same" }),
      expect.objectContaining({ kind: "keep_both", archiveId: "collision" }),
    ]));
  });

  it("rejects root and plan aggregate mapping inconsistencies", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      exercises: [{ id: "archive-exercise", origin: "custom", portable_id: "b".repeat(32) }],
      plans: [{ id: "archive-plan", origin: "custom", portable_id: "c".repeat(32) }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });
    expect(() => __mergePlanTestOnly.rootOperations(archive, local, {
      aggregateClass: "custom_exercise", table: "exercises",
    })).not.toThrow();
    expect(() => __mergePlanTestOnly.planAggregate(
      archive, local,
      { aggregateClass: "owned_plan", kind: "insert", portableId: "c".repeat(32), archiveId: "archive-plan", localId: "archive-plan" },
      new Map(),
      new Map(),
      new Map(),
    )).toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("derives a canonical session digest from roots, exercise children, set children, and set-linked rows", () => {
    const value = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      session_sets: [{ id: "set", session_exercise_id: "exercise" }],
      session_undo_snapshots: [{ id: "undo", session_id: "other", completed_set_id: "set" }],
    });
    const digest = __mergePlanTestOnly.sessionDigestInput(value, value.tables.workout_sessions[0]!);

    expect(digest).toContain('"session_exercises"');
    expect(digest).toContain('"session_sets"');
    expect(digest).toContain('"session_undo_snapshots"');
    expect(() => __mergePlanTestOnly.sessionDigestInput(value, { id: 1 }))
      .toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("rejects unresolved session aggregate child identifiers before remapping", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      session_sets: [{ id: "set", session_exercise_id: "exercise" }],
      history_audit_events: [{ id: "audit", session_id: "archive-session" }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      history_audit_events: [{ id: "audit", session_id: "other" }],
    });
    const broken = {
      ...archive,
      tables: {
        ...archive.tables,
        history_audit_events: [{ id: "missing", session_id: "archive-session" }],
      },
    };

    expect(() => __mergePlanTestOnly.sessionAggregate(broken, local, sessionPortableId, "local-session"))
      .not.toThrow();
    expect(() => __mergePlanTestOnly.sessionAggregate({
      ...archive,
      tables: {
        ...archive.tables,
        workout_session_exercise_edit_receipts: [{
          request_id: "receipt", session_id: "archive-session", operation: "remove_exercise",
          subject_session_exercise_id: "missing", replacement_session_exercise_id: null, result_json: "{}",
        }],
      },
    }, local, sessionPortableId, "local-session"))
      .toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("handles custom-child non-collisions and rejects invalid child keys", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      exercises: [{ id: "exercise", origin: "custom", portable_id: "b".repeat(32) }],
      exercise_library_entries: [{ exercise_id: "exercise", origin: "custom" }],
      exercise_aliases: [{ id: 10, exercise_id: "exercise" }],
      exercise_search_terms: [{ id: 11, exercise_id: "exercise" }],
      metric_profile_migration_events: [{ idempotency_key: "new-event", exercise_id: "exercise" }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });
    const operation = {
      aggregateClass: "custom_exercise" as const, kind: "insert" as const,
      portableId: "b".repeat(32), archiveId: "exercise", localId: "exercise",
    };
    expect(__mergePlanTestOnly.exerciseAggregate(archive, local, operation).tables.exercise_aliases)
      .toEqual([{ id: 10, exercise_id: "exercise" }]);
    expect(() => __mergePlanTestOnly.exerciseAggregate({
      ...archive,
      tables: { ...archive.tables, exercise_aliases: [{ id: "bad", exercise_id: "exercise" }] },
    }, local, operation)).toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("selects session operations across collisions, local wins, and invalid digests", async () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 30 });
    const archiveRow = archive.tables.workout_sessions[0]!;
    const localRow = local.tables.workout_sessions[0]!;

    await expect(__mergePlanTestOnly.sessionOperation(archive, local, archiveRow, [localRow], new Set(), payloadDigest))
      .resolves.toEqual(expect.objectContaining({ kind: "local_won" }));
    await expect(__mergePlanTestOnly.sessionOperation(archive, local, archiveRow, [], new Set(["archive-session"]), payloadDigest))
      .resolves.toEqual(expect.objectContaining({ kind: "insert", localId: expect.not.stringMatching(/^archive-session$/u) }));
    await expect(__mergePlanTestOnly.sessionOperation(archive, local, archiveRow, [localRow, localRow], new Set(), payloadDigest))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
    const tiedLocal = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 20 });
    await expect(__mergePlanTestOnly.sessionOperation(archive, tiedLocal, archiveRow, [tiedLocal.tables.workout_sessions[0]!], new Set(), async () => "bad"))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  it("remaps every owned-plan child family through a keep-both graph collision", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      plans: [{ id: "archive-plan", origin: "custom", portable_id: "c".repeat(32), is_active: 1 }],
      plan_days: [{ id: "day", plan_id: "archive-plan" }],
      plan_day_exercises: [{ id: "legacy-occurrence", plan_day_id: "day", exercise_id: "archive-exercise" }],
      plan_warmup_sets: [{ id: "legacy-warmup", plan_day_exercise_id: "legacy-occurrence" }],
      plan_working_set_targets: [{ id: "legacy-target", plan_day_exercise_id: "legacy-occurrence" }],
      progression_policies: [{ id: "legacy-policy", plan_day_exercise_id: "legacy-occurrence" }],
      progression_recommendations: [{ id: "legacy-recommendation", plan_working_set_target_id: "legacy-target", exercise_id: "archive-exercise" }],
      plan_schedules: [{ id: "legacy-schedule", plan_id: "archive-plan" }],
      plan_schedule_bindings: [{ id: "legacy-binding", schedule_id: "legacy-schedule", plan_day_id: "day" }],
      owned_plan_aggregate_states: [{ plan_id: "archive-plan" }],
      owned_plan_starter_sources: [{ plan_id: "archive-plan" }],
      owned_plan_day_sources: [{ plan_day_id: "day", plan_id: "archive-plan" }],
      owned_plan_day_exercises: [{ id: "owned-occurrence", plan_day_id: "day", exercise_id: "archive-exercise" }],
      owned_plan_warmup_sets: [{ id: "owned-warmup", plan_day_exercise_id: "owned-occurrence" }],
      owned_plan_working_set_targets: [{ id: "owned-target", plan_day_exercise_id: "owned-occurrence" }],
      owned_plan_progression_policies: [{ id: "owned-policy", plan_day_exercise_id: "owned-occurrence" }],
      owned_plan_occurrence_sources: [{ plan_day_exercise_id: "owned-occurrence", plan_day_id: "day" }],
      owned_progression_recommendations: [{ id: "owned-recommendation", owned_plan_working_set_target_id: "owned-target", exercise_id: "archive-exercise" }],
      owned_plan_schedules: [{ id: "owned-schedule", plan_id: "archive-plan", lifecycle: "active", activated_at_ms: 7, deactivated_at_ms: null }],
      owned_plan_schedule_versions: [{ id: "owned-version", schedule_id: "owned-schedule" }],
      owned_plan_schedule_bindings: [{ id: "owned-binding", schedule_version_id: "owned-version", plan_day_id: "day" }],
      owned_plan_schedule_overrides: [{ id: "override", schedule_id: "owned-schedule", plan_day_id: "day", schedule_version_id: "owned-version", session_id: "archive-session" }],
      owned_plan_schedule_opportunities: [{ id: "opportunity", schedule_id: "owned-schedule", plan_day_id: "day", schedule_version_id: "owned-version", session_id: "archive-session" }],
      owned_plan_schedule_events: [{ id: "event", schedule_id: "owned-schedule" }],
      owned_plan_mutation_requests: [{ request_id: "mutation", source_plan_id: "archive-plan", result_plan_id: "archive-plan" }],
      starter_plan_activation_requests: [{ request_id: "activation", selected_plan_id: "archive-plan", result_plan_id: "archive-plan", result_schedule_id: "owned-schedule" }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      plans: [{ id: "archive-plan", origin: "custom", portable_id: "d".repeat(32), is_active: 1 }],
      plan_days: [{ id: "day" }],
      plan_day_exercises: [{ id: "legacy-occurrence" }],
      plan_warmup_sets: [{ id: "legacy-warmup" }],
      plan_working_set_targets: [{ id: "legacy-target" }],
      progression_policies: [{ id: "legacy-policy" }],
      progression_recommendations: [{ id: "legacy-recommendation" }],
      plan_schedules: [{ id: "legacy-schedule" }],
      plan_schedule_bindings: [{ id: "legacy-binding" }],
      owned_plan_day_exercises: [{ id: "owned-occurrence" }],
      owned_plan_warmup_sets: [{ id: "owned-warmup" }],
      owned_plan_working_set_targets: [{ id: "owned-target" }],
      owned_plan_progression_policies: [{ id: "owned-policy" }],
      owned_progression_recommendations: [{ id: "owned-recommendation" }],
      owned_plan_schedules: [{ id: "owned-schedule", lifecycle: "active" }],
      owned_plan_schedule_versions: [{ id: "owned-version" }],
      owned_plan_schedule_bindings: [{ id: "owned-binding" }],
      owned_plan_schedule_overrides: [{ id: "override" }],
      owned_plan_schedule_opportunities: [{ id: "opportunity" }],
      owned_plan_schedule_events: [{ id: "event" }],
      owned_plan_mutation_requests: [{ request_id: "mutation" }],
      starter_plan_activation_requests: [{ request_id: "activation" }],
    });
    const aggregate = __mergePlanTestOnly.planAggregate(
      archive,
      local,
      { aggregateClass: "owned_plan", kind: "keep_both", portableId: "c".repeat(32), archiveId: "archive-plan", localId: "local-plan" },
      new Map([["archive-exercise", "local-exercise"]]),
      new Map([["archive-plan", "local-plan"]]),
      new Map([["archive-session", "local-session"]]),
    );

    expect(aggregate.tables.plans).toEqual([expect.objectContaining({ id: "local-plan", is_active: 0 })]);
    expect(aggregate.tables.owned_plan_schedules).toEqual([expect.objectContaining({ lifecycle: "inactive", deactivated_at_ms: 7 })]);
    for (const table of [
      "plan_days", "plan_day_exercises", "plan_warmup_sets", "plan_working_set_targets",
      "progression_policies", "progression_recommendations", "plan_schedules", "plan_schedule_bindings",
      "owned_plan_aggregate_states", "owned_plan_starter_sources", "owned_plan_day_sources",
      "owned_plan_day_exercises", "owned_plan_warmup_sets", "owned_plan_working_set_targets",
      "owned_plan_progression_policies", "owned_plan_occurrence_sources", "owned_progression_recommendations",
      "owned_plan_schedules", "owned_plan_schedule_versions", "owned_plan_schedule_bindings",
      "owned_plan_schedule_overrides", "owned_plan_schedule_opportunities", "owned_plan_schedule_events",
      "owned_plan_mutation_requests", "starter_plan_activation_requests",
    ]) {
      expect(aggregate.tables[table]).toHaveLength(1);
    }
    expect(aggregate.tables.owned_plan_schedule_opportunities).toEqual([expect.objectContaining({ session_id: "local-session" })]);
  });

  it("rejects remaining malformed pure planner helper inputs", async () => {
    expect(() => __mergePlanTestOnly.parseJsonObject(1)).toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.rewriteReorderReceipt(1, new Map())).toThrow(new MergePlanError("merge_plan_invalid"));
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });
    expect(() => __mergePlanTestOnly.sessionAggregate(
      { ...archive, tables: { ...archive.tables, workout_sessions: [] } }, local, sessionPortableId, "local-session",
    )).toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.exerciseAggregate(
      archive, local,
      { aggregateClass: "custom_exercise", kind: "insert", portableId: "b".repeat(32), archiveId: "missing", localId: "missing" },
    )).toThrow(new MergePlanError("merge_plan_invalid"));
    expect(() => __mergePlanTestOnly.planAggregate(
      archive, local,
      { aggregateClass: "owned_plan", kind: "insert", portableId: "c".repeat(32), archiveId: "missing", localId: "missing" },
      new Map(), new Map([["missing", "missing"]]), new Map(),
    )).toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it("rejects partial references and invalid occupied child keys", async () => {
    const partial = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      plan_days: [{ id: "day" }],
      plan_day_exercises: [{
        id: "occurrence", plan_day_id: "day", exercise_id: "exercise",
        metric_profile: null, metric_contract_version: null, exercise_metric_generation: null,
      }],
    });
    expect(() => __mergePlanTestOnly.assertReferenceClosure(partial))
      .toThrow(new MergePlanError("merge_plan_invalid"));
    const localWithBadAlias = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      exercise_aliases: [{ id: "bad" }],
    });
    const archiveExercise = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      exercises: [{ id: "exercise", origin: "custom", portable_id: "b".repeat(32) }],
      exercise_library_entries: [{ exercise_id: "exercise", origin: "custom" }],
      exercise_aliases: [{ id: 1, exercise_id: "exercise" }],
    });
    expect(() => __mergePlanTestOnly.exerciseAggregate(
      archiveExercise, localWithBadAlias,
      { aggregateClass: "custom_exercise", kind: "insert", portableId: "b".repeat(32), archiveId: "exercise", localId: "exercise" },
    )).toThrow(new MergePlanError("merge_plan_invalid"));

    const invalidLocal = {
      ...snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }),
      tables: {
        ...snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }).tables,
        workout_sessions: [{ id: "local-session", portable_id: "invalid", merge_modified_at_ms: 10 }],
      },
    };
    const validArchive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    await expect(buildPortableMergePlan({ archive: validArchive, local: invalidLocal, payloadDigest }))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  it("rewrites optional session descendants while retaining unrelated optional ids", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      session_sets: [{ id: "set", session_exercise_id: "exercise" }],
      extension_rows: [
        { id: "mapped-exercise", session_id: "archive-session", session_exercise_id: "exercise" },
        { id: "unmapped-exercise", session_id: "archive-session", session_exercise_id: "other" },
        { id: "mapped-set", session_id: "archive-session", session_set_id: "set" },
        { id: "unmapped-set", session_id: "archive-session", session_set_id: "other-set" },
      ],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });
    const aggregate = __mergePlanTestOnly.sessionAggregate(archive, local, sessionPortableId, "local-session");
    const rows = aggregate.tables.extension_rows!;

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "mapped-exercise", session_id: "local-session", session_exercise_id: "exercise" }),
      expect.objectContaining({ id: "unmapped-exercise", session_id: "local-session", session_exercise_id: "other" }),
      expect.objectContaining({ id: "mapped-set", session_id: "local-session", session_set_id: "set" }),
      expect.objectContaining({ id: "unmapped-set", session_id: "local-session", session_set_id: "other-set" }),
    ]));
  });

  it("rewrites optional exercise references after a child identifier collision", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      session_exercises: [{ id: "exercise", session_id: "archive-session" }],
      extension_rows: [{
        id: "extension",
        session_id: "archive-session",
        session_exercise_id: "exercise",
      }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      session_exercises: [{ id: "exercise", session_id: "local-session" }],
    });

    const aggregate = __mergePlanTestOnly.sessionAggregate(
      archive,
      local,
      sessionPortableId,
      "local-session",
    );

    expect(aggregate.tables.extension_rows).toEqual([
      expect.objectContaining({
        session_id: "local-session",
        session_exercise_id: expect.not.stringMatching(/^exercise$/u),
      }),
    ]);
  });

  it("uses a suffix when an already-remapped metric event key also collides", () => {
    const portableId = "b".repeat(32);
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      exercises: [{ id: "exercise", origin: "custom", portable_id: portableId }],
      exercise_library_entries: [{ exercise_id: "exercise", origin: "custom" }],
      metric_profile_migration_events: [{ idempotency_key: "event", exercise_id: "exercise" }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      metric_profile_migration_events: [
        { idempotency_key: "event" },
        { idempotency_key: `merge_metric_event_${portableId}_0` },
      ],
    });
    const aggregate = __mergePlanTestOnly.exerciseAggregate(
      archive, local,
      { aggregateClass: "custom_exercise", kind: "insert", portableId, archiveId: "exercise", localId: "exercise" },
    );

    expect(aggregate.tables.metric_profile_migration_events).toEqual([
      expect.objectContaining({ idempotency_key: `merge_metric_event_${portableId}_0_1` }),
    ]);
  });

  it("sorts and remaps multiple child identities deterministically", () => {
    const source = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      child_rows: [{ id: "z", parent_id: "parent" }, { id: "a", parent_id: "parent" }],
    });
    const rows = (source.tables as Readonly<Record<string, readonly LogicalBackupRow[]>>).child_rows!;
    const mapped = __mergePlanTestOnly.mappedRows(
      snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }), "child_rows", rows,
      [{ column: "parent_id", ids: new Map([["parent", "local-parent"]]) }],
      true, sessionPortableId,
    );
    expect([...mapped.ids.keys()]).toEqual(["a", "z"]);
    expect(mapped.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "z", parent_id: "local-parent" }),
      expect.objectContaining({ id: "a", parent_id: "local-parent" }),
    ]));
  });

  it("rejects invalid local portable identity before session operation selection", async () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    const invalidLocal = { id: "local-session", portable_id: "invalid", merge_modified_at_ms: 20 };

    await expect(__mergePlanTestOnly.sessionOperation(archive, archive, archive.tables.workout_sessions[0]!, [invalidLocal], new Set(), payloadDigest))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  it("covers absent optional digest tables, default child keys, and every session tie outcome", async () => {
    const bare = {
      ...snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }),
      tables: {
        portable_owner_identity: [{ id: 1, owner_namespace: ownerNamespace }],
        workout_sessions: [{ id: "archive-session", portable_id: sessionPortableId, merge_modified_at_ms: 20 }],
      },
    };
    expect(__mergePlanTestOnly.sessionDigestInput(bare, bare.tables.workout_sessions[0]!))
      .toContain('"workout_sessions"');
    expect(__mergePlanTestOnly.tableOccupiedIds(bare, "session_exercises")).toEqual(new Set());

    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 20 });
    const archiveRow = archive.tables.workout_sessions[0]!;
    const localRow = local.tables.workout_sessions[0]!;
    await expect(__mergePlanTestOnly.sessionOperation(archive, local, archiveRow, [], new Set(), payloadDigest))
      .resolves.toEqual(expect.objectContaining({ kind: "insert", localId: "archive-session" }));
    await expect(__mergePlanTestOnly.sessionOperation(archive, local, archiveRow, [localRow], new Set(), async () => "0".repeat(64)))
      .resolves.toEqual(expect.objectContaining({ kind: "duplicate" }));
    await expect(__mergePlanTestOnly.sessionOperation(archive, local, archiveRow, [localRow], new Set(), (() => {
      let calls = 0;
      return async () => calls++ === 0 ? "0".repeat(64) : "f".repeat(64);
    })()))
      .resolves.toEqual(expect.objectContaining({ kind: "local_won" }));
  });

  it("indexes every valid descendant once and leaves dangling extension references out of a session digest", () => {
    const source = snapshot({ id: "session", marker: "source", modifiedAtMs: 20 }, {
      session_exercises: [{ id: "exercise", session_id: "session" }],
      session_sets: [
        { id: "set", session_exercise_id: "exercise" },
        { id: "orphan-set", session_exercise_id: "missing-exercise" },
      ],
      extension_rows: [
        { id: "by-session", session_id: "session" },
        { id: "by-exercise", session_exercise_id: "exercise" },
        { id: "by-set", session_set_id: "set" },
        { id: "by-completed-set", completed_set_id: "set" },
        { id: "unknown-exercise", session_exercise_id: "missing-exercise" },
        { id: "unknown-set", session_set_id: "missing-set" },
        { id: "unknown-session", session_id: "missing-session" },
      ],
    });

    const index = __mergePlanTestOnly.createSessionDigestIndex(source);
    const indexed = __mergePlanTestOnly.sessionDigestInput(source, source.tables.workout_sessions[0]!, index);
    const fallback = __mergePlanTestOnly.sessionDigestInput(source, source.tables.workout_sessions[0]!);

    expect(indexed).toEqual(fallback);
    expect(indexed).toContain('"by-completed-set"');
    expect(indexed).not.toContain('"unknown-exercise"');
    expect(indexed).not.toContain('"unknown-set"');
    expect(indexed).not.toContain('"unknown-session"');
  });

  it("preserves a supplied imported deactivation and routes source-only request records", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      plans: [{ id: "archive-plan", origin: "custom", portable_id: "c".repeat(32), is_active: 1 }],
      plan_days: [{ id: "day", plan_id: "archive-plan" }],
      owned_plan_schedules: [{ id: "schedule", plan_id: "archive-plan", lifecycle: "active", activated_at_ms: 4, deactivated_at_ms: 9 }],
      owned_plan_schedule_versions: [{ id: "version", schedule_id: "schedule" }],
      owned_plan_mutation_requests: [{ request_id: "mutation", source_plan_id: "other-plan", result_plan_id: "archive-plan" }],
      starter_plan_activation_requests: [{ request_id: "activation", selected_plan_id: "other-plan", result_plan_id: "archive-plan", result_schedule_id: "schedule" }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      plans: [{ id: "local-plan", origin: "custom", portable_id: "d".repeat(32), is_active: 1 }],
      owned_plan_schedules: [{ id: "local-schedule", lifecycle: "active" }],
    });
    const aggregate = __mergePlanTestOnly.planAggregate(
      archive, local,
      { aggregateClass: "owned_plan", kind: "insert", portableId: "c".repeat(32), archiveId: "archive-plan", localId: "archive-plan" },
      new Map(), new Map([["archive-plan", "archive-plan"]]), new Map(),
    );

    expect(aggregate.tables.owned_plan_schedules).toEqual([expect.objectContaining({ lifecycle: "inactive", deactivated_at_ms: 9 })]);
    expect(aggregate.tables.owned_plan_mutation_requests).toHaveLength(1);
    expect(aggregate.tables.starter_plan_activation_requests).toHaveLength(1);
  });

  it("keeps an imported active Running pair when the local active pair is Strength", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      plans: [{ id: "archive-running", origin: "custom", portable_id: "c".repeat(32), plan_kind: "running", is_active: 1 }],
      owned_plan_schedules: [{ id: "archive-schedule", plan_id: "archive-running", plan_kind: "running", lifecycle: "active", activated_at_ms: 4 }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      plans: [{ id: "local-strength", origin: "custom", portable_id: "d".repeat(32), plan_kind: "strength", is_active: 1 }],
      owned_plan_schedules: [{ id: "local-schedule", plan_id: "local-strength", plan_kind: "strength", lifecycle: "active" }],
    });

    const aggregate = __mergePlanTestOnly.planAggregate(
      archive, local,
      { aggregateClass: "owned_plan", kind: "insert", portableId: "c".repeat(32), archiveId: "archive-running", localId: "archive-running" },
      new Map(), new Map([["archive-running", "archive-running"]]), new Map(),
    );

    expect(aggregate.tables.plans).toEqual([expect.objectContaining({ is_active: 1, plan_kind: "running" })]);
    expect(aggregate.tables.owned_plan_schedules).toEqual([expect.objectContaining({ lifecycle: "active", plan_kind: "running" })]);
  });

  it("fails closed when a shared plan identity changes sport", async () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      plans: [{ id: "archive-plan", origin: "custom", portable_id: "c".repeat(32), plan_kind: "running" }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 }, {
      plans: [{ id: "local-plan", origin: "custom", portable_id: "c".repeat(32), plan_kind: "strength" }],
    });

    await expect(buildPortableMergePlan({ archive, local, payloadDigest: async () => "0".repeat(64) }))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  it("plans a complete owner-scoped Phase 13 source graph without serialising rebuild-only current matches", async () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      imported_activities: [{ id: "activity", source: "garmin", source_activity_id: "external-1" }],
      imported_activity_identities: [{ activity_id: "activity", source_kind: "garmin_connect_account", account_namespace: "owner-a", external_activity_id: "external-1" }],
      imported_activity_events: [{ id: "activity-event", activity_id: "activity", aggregate_revision: 1 }],
      bodyweight_entries: [{ id: "weight", owner_id: "owner-a", current_revision: 1, lifecycle: "active", created_at_ms: 1 }],
      bodyweight_entry_events: [{ id: "weight-event", entry_id: "weight", owner_id: "owner-a", revision: 1, event_id: "event-1", operation: "create", local_date: "2026-10-07", timezone: "Asia/Singapore", grams: 70000, occurred_at_ms: 1 }],
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    const plan = await buildPortableMergePlan({ archive, local, payloadDigest });
    const graphs = plan.aggregates.filter((aggregate) => aggregate.aggregateClass === "source_graph");

    expect(plan.operations.filter(({ aggregateClass }) => aggregateClass === "source_graph"))
      .toHaveLength(2);
    expect(graphs.some((graph) => graph.tables.imported_activity_events?.length === 1)).toBe(true);
    expect(graphs.some((graph) => graph.tables.bodyweight_entry_events?.length === 1)).toBe(true);
    expect(graphs.every((graph) => graph.tables.running_current_matches === undefined)).toBe(true);
  });

  it("merges an exact activity overlap beside a new activity and unrelated source facts", async () => {
    const sharedActivity = {
      imported_activities: [{ id: "activity-a", source: "garmin", source_activity_id: "external-a" }],
      imported_activity_identities: [{ activity_id: "activity-a", source_kind: "garmin_connect_account", account_namespace: "owner-a", external_activity_id: "external-a" }],
      imported_activity_events: [{ id: "event-a", activity_id: "activity-a", aggregate_revision: 1 }],
    };
    const archive = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
      ...sharedActivity,
      imported_activities: [
        ...sharedActivity.imported_activities,
        { id: "activity-b", source: "garmin", source_activity_id: "external-b" },
      ],
      imported_activity_identities: [
        ...sharedActivity.imported_activity_identities,
        { activity_id: "activity-b", source_kind: "garmin_connect_account", account_namespace: "owner-a", external_activity_id: "external-b" },
      ],
      imported_activity_events: [
        ...sharedActivity.imported_activity_events,
        { id: "event-b", activity_id: "activity-b", aggregate_revision: 1 },
      ],
      bodyweight_entries: [{ id: "weight-archive", owner_id: "owner-a", current_revision: 1, lifecycle: "active", created_at_ms: 2 }],
      bodyweight_entry_events: [{ id: "weight-event-archive", entry_id: "weight-archive", owner_id: "owner-a", revision: 1, event_id: "weight-event-a", operation: "create", local_date: "2026-10-08", timezone: "Asia/Singapore", grams: 71000, occurred_at_ms: 2 }],
    });
    const local = snapshot({ id: "local", marker: "local", modifiedAtMs: 1 }, {
      ...sharedActivity,
      bodyweight_entries: [{ id: "weight-local", owner_id: "owner-a", current_revision: 1, lifecycle: "active", created_at_ms: 1 }],
      bodyweight_entry_events: [{ id: "weight-event-local", entry_id: "weight-local", owner_id: "owner-a", revision: 1, event_id: "weight-event-l", operation: "create", local_date: "2026-10-07", timezone: "Asia/Singapore", grams: 70000, occurred_at_ms: 1 }],
    });

    const plan = await buildPortableMergePlan({ archive, local, payloadDigest });

    expect(plan.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ aggregateClass: "source_graph", kind: "duplicate", archiveId: "activity-a" }),
      expect.objectContaining({ aggregateClass: "source_graph", kind: "insert", archiveId: "activity-b" }),
      expect.objectContaining({ aggregateClass: "source_graph", kind: "insert", archiveId: "phase13-source-residual" }),
    ]));
    expect(plan.operations).not.toContainEqual(expect.objectContaining({
      aggregateClass: "source_graph",
      kind: "conflict",
    }));
  });

  it("plans duplicate and conflict outcomes for shared source identities", async () => {
    const shared = {
      imported_activities: [{ id: "activity", source: "garmin", source_activity_id: "external-1" }],
      imported_activity_identities: [{ activity_id: "activity", source_kind: "garmin_connect_account", account_namespace: "owner-a", external_activity_id: "external-1" }],
    };
    const exact = snapshot({ id: "session", marker: "same", modifiedAtMs: 1 }, shared);
    const duplicate = await buildPortableMergePlan({ archive: exact, local: exact, payloadDigest });
    expect(duplicate.operations).toContainEqual(expect.objectContaining({
      aggregateClass: "source_graph", kind: "duplicate",
    }));
    expect(duplicate.aggregates.some(({ aggregateClass }) => aggregateClass === "source_graph")).toBe(false);

    const archive = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, shared);
    const local = snapshot({ id: "local", marker: "local", modifiedAtMs: 1 }, {
      ...shared,
      imported_activities: [{ id: "different-activity", source: "garmin", source_activity_id: "external-1", aggregate_json: "{\"changed\":true}" }],
      imported_activity_identities: [{ activity_id: "different-activity", source_kind: "garmin_connect_account", account_namespace: "owner-a", external_activity_id: "external-1" }],
    });
    const conflict = await buildPortableMergePlan({ archive, local, payloadDigest });
    expect(conflict.operations).toContainEqual(expect.objectContaining({
      aggregateClass: "source_graph", kind: "conflict",
    }));
  });

  it("remaps colliding source roots and their child references deterministically", async () => {
    const archive = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
      imported_activities: [{ id: "activity", source: "garmin", source_activity_id: "external-1" }],
      imported_activity_identities: [{ activity_id: "activity", source_kind: "garmin_connect_account", account_namespace: "owner-a", external_activity_id: "external-1" }],
      imported_activity_events: [{ id: "event", activity_id: "activity", aggregate_revision: 1 }],
    });
    const local = snapshot({ id: "local", marker: "local", modifiedAtMs: 1 }, {
      imported_activities: [{ id: "activity", source: "garmin", source_activity_id: "other" }],
      imported_activity_events: [{ id: "event", activity_id: "activity", aggregate_revision: 1 }],
    });
    const plan = await buildPortableMergePlan({ archive, local, payloadDigest });
    const graph = plan.aggregates.find(({ aggregateClass }) => aggregateClass === "source_graph")!;
    const mappedActivityId = graph.tables.imported_activities![0]!.id;
    expect(mappedActivityId).not.toBe("activity");
    expect(graph.tables.imported_activity_identities![0]!.activity_id).toBe(mappedActivityId);
    expect(graph.tables.imported_activity_events![0]!.activity_id).toBe(mappedActivityId);
    expect(graph.tables.imported_activity_events![0]!.id).not.toBe("event");
  });

  it("rewrites collision outcomes and immutable receipts through owned-plan ID remaps", () => {
    const archive = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
      schedule_collision_outcomes: [{
        id: "outcome", request_id: "request", strength_opportunity_id: "strength-opportunity",
        strength_schedule_id: "strength-schedule", running_opportunity_id: "running-opportunity",
        running_schedule_id: "running-schedule",
      }],
      schedule_collision_receipts: [{ request_id: "request", outcome_id: "outcome" }],
      schedule_collision_projections: [{ outcome_id: "outcome" }],
    });
    const local = snapshot({ id: "local", marker: "local", modifiedAtMs: 1 }, {
      schedule_collision_outcomes: [{
        id: "outcome", request_id: "other-request", strength_opportunity_id: "other-strength",
        strength_schedule_id: "other-strength-schedule", running_opportunity_id: "other-running",
        running_schedule_id: "other-running-schedule",
      }],
    });
    const mapped = __mergePlanTestOnly.mappedGraphRows(archive, local, new Map([
      ["owned_plan_schedule_opportunities", new Map([["strength-opportunity", "merged-strength-opportunity"]])],
      ["owned_plan_schedules", new Map([
        ["strength-schedule", "merged-strength-schedule"],
        ["running-schedule", "merged-running-schedule"],
      ])],
      ["running_opportunities", new Map([["running-opportunity", "merged-running-opportunity"]])],
    ]));
    const outcome = mapped.schedule_collision_outcomes![0]!;
    expect(outcome).toEqual(expect.objectContaining({
      strength_opportunity_id: "merged-strength-opportunity",
      strength_schedule_id: "merged-strength-schedule",
      running_opportunity_id: "merged-running-opportunity",
      running_schedule_id: "merged-running-schedule",
    }));
    expect(mapped.schedule_collision_receipts![0]!.outcome_id).toBe(outcome.id);
    expect(mapped.schedule_collision_projections![0]!.outcome_id).toBe(outcome.id);
  });

  it("covers legacy source identities, nullable graph references, and invalid digests", async () => {
    expect(__mergePlanTestOnly.sourceIdentityKey({
      source: "garmin",
      source_activity_id: "legacy-activity",
    })).toBe("legacy:garmin:legacy-activity");

    const archive = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
      running_activity_match_events: [{
        id: "match-event",
        activity_id: "activity",
        opportunity_id: "opportunity",
        prior_opportunity_id: null,
      }],
    });
    const local = snapshot({ id: "local", marker: "local", modifiedAtMs: 1 });
    expect(__mergePlanTestOnly.mappedGraphRows(archive, local).running_activity_match_events)
      .toEqual([expect.objectContaining({ prior_opportunity_id: null })]);

    await expect(buildPortableMergePlan({
      archive: snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
        bodyweight_entries: [{ id: "weight" }],
      }),
      local,
      payloadDigest: async () => "invalid-digest",
    })).rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  it("remaps plan preferences and rejects every malformed preference payload", () => {
    const preferenceKey = "gym_tracker.workout_plan_preferences.v1:archive-plan";
    const local = snapshot({ id: "local", marker: "local", modifiedAtMs: 1 });
    const archiveWith = (value_json: string) => snapshot(
      { id: "archive", marker: "archive", modifiedAtMs: 2 },
      { app_settings: [{ key: preferenceKey, value_json }] },
    );
    const valid = __mergePlanTestOnly.settingPlan(
      archiveWith(JSON.stringify({ version: 1, planId: "archive-plan", weekStartsOn: 1 })),
      local,
      new Map([["archive-plan", "local-plan"]]),
    );
    expect(valid.inserts).toEqual([expect.objectContaining({
      key: "gym_tracker.workout_plan_preferences.v1:local-plan",
      value_json: JSON.stringify({ version: 1, planId: "local-plan", weekStartsOn: 1 }),
    })]);

    expect(() => __mergePlanTestOnly.settingPlan(
      archiveWith(JSON.stringify({ version: 1, planId: "archive-plan" })),
      local,
      new Map(),
    )).toThrow(new MergePlanError("merge_plan_invalid"));
    for (const serialized of [
      "{",
      "null",
      "[]",
      JSON.stringify({ version: 2, planId: "archive-plan" }),
      JSON.stringify({ version: 1, planId: "other-plan" }),
    ]) {
      expect(() => __mergePlanTestOnly.settingPlan(
        archiveWith(serialized),
        local,
        new Map([["archive-plan", "local-plan"]]),
      )).toThrow(new MergePlanError("merge_plan_invalid"));
    }
  });

  it("retains running plan ledger families while materializing an owned plan", () => {
    const archive = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
      plans: [{ id: "archive-plan", origin: "custom", portable_id: "c".repeat(32), plan_kind: "running" }],
      running_plan_receipts: [{ request_id: "request", plan_id: "archive-plan" }],
      running_plan_events: [{ id: "event", plan_id: "archive-plan" }],
      running_goals: [{ id: "goal", plan_id: "archive-plan" }],
    });
    const aggregate = __mergePlanTestOnly.planAggregate(
      archive,
      snapshot({ id: "local", marker: "local", modifiedAtMs: 1 }),
      { aggregateClass: "owned_plan", kind: "insert", portableId: "c".repeat(32), archiveId: "archive-plan", localId: "archive-plan" },
      new Map(),
      new Map([["archive-plan", "archive-plan"]]),
      new Map(),
    );
    expect(aggregate.tables.running_plan_receipts).toHaveLength(1);
    expect(aggregate.tables.running_plan_events).toHaveLength(1);
    expect(aggregate.tables.running_goals).toHaveLength(1);
  });

  it("fails closed or classifies conflicts for malformed source graph mappings", async () => {
    const local = snapshot({ id: "local", marker: "local", modifiedAtMs: 1 });
    const collision = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
      schedule_collision_outcomes: [{ id: "outcome", strength_opportunity_id: "missing-opportunity" }],
    });
    expect(() => __mergePlanTestOnly.mappedGraphRows(collision, local))
      .toThrow(new MergePlanError("merge_plan_invalid"));

    const malformedActivity = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
      imported_activities: [{ id: "activity", source: "garmin", source_activity_id: "external" }],
      imported_activity_identities: [{ activity_id: "activity", source_kind: "garmin_connect_account", account_namespace: "owner-a", external_activity_id: "external" }],
      imported_activity_events: [{ id: null, activity_id: "activity" }],
    });
    await expect(__mergePlanTestOnly.sourceGraphPlan(malformedActivity, local, payloadDigest))
      .resolves.toEqual(expect.objectContaining({
        operations: [expect.objectContaining({ kind: "conflict" })],
      }));

    const validActivity = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, {
      imported_activities: [{ id: "activity", source: "garmin", source_activity_id: "external" }],
      imported_activity_identities: [{ activity_id: "activity", source_kind: "garmin_connect_account", account_namespace: "owner-a", external_activity_id: "external" }],
    });
    await expect(__mergePlanTestOnly.sourceGraphPlan(validActivity, local, async () => "invalid"))
      .rejects.toEqual(new MergePlanError("merge_plan_invalid"));
  });

  it("classifies an identical residual source graph as duplicate", async () => {
    const residual = {
      schedule_collision_outcomes: [{ id: "outcome" }],
    };
    const archive = snapshot({ id: "archive", marker: "archive", modifiedAtMs: 2 }, residual);
    const local = snapshot({ id: "local", marker: "local", modifiedAtMs: 1 }, residual);
    await expect(__mergePlanTestOnly.sourceGraphPlan(archive, local, payloadDigest, new Map([
      ["schedule_collision_outcomes", new Map([["outcome", "outcome"]])],
    ])))
      .resolves.toEqual(expect.objectContaining({
        operations: [expect.objectContaining({ kind: "duplicate" })],
        aggregates: [],
      }));
  });

  it("requires a matching source graph aggregate during lazy materialization", () => {
    expect(() => __mergePlanTestOnly.requiredSourceGraphAggregate([], "missing"))
      .toThrow(new MergePlanError("merge_plan_invalid"));
  });

  it.each([
    ["a mutation request whose source selects this plan but result cannot map", {
      owned_plan_mutation_requests: [{ request_id: "mutation", source_plan_id: "archive-plan", result_plan_id: "other-plan" }],
    }],
    ["an activation request whose selection selects this plan but result cannot map", {
      starter_plan_activation_requests: [{ request_id: "activation", selected_plan_id: "archive-plan", result_plan_id: "other-plan", result_schedule_id: "schedule" }],
      owned_plan_schedules: [{ id: "schedule", plan_id: "archive-plan", lifecycle: "inactive" }],
    }],
  ] as Array<[string, Readonly<Record<string, readonly Record<string, unknown>[]>>]>)("rejects %s", (_label, extra) => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 }, {
      plans: [{ id: "archive-plan", origin: "custom", portable_id: "c".repeat(32) }],
      ...extra,
    });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 10 });

    expect(() => __mergePlanTestOnly.planAggregate(
      archive, local,
      { aggregateClass: "owned_plan", kind: "insert", portableId: "c".repeat(32), archiveId: "archive-plan", localId: "archive-plan" },
      new Map(), new Map([["archive-plan", "archive-plan"]]), new Map(),
    )).toThrow(new MergePlanError("merge_plan_invalid"));
  });
});
