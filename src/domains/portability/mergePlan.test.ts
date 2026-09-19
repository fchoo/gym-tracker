import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  __mergePlanTestOnly,
  buildPortableMergePlan,
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
});
