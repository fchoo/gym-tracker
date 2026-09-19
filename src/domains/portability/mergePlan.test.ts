import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  buildPortableMergePlan,
  PORTABLE_MERGE_TABLE_CLASSES,
} from "./mergePlan";
import {
  LOGICAL_BACKUP_TABLES,
} from "./backupContracts";

const ownerNamespace = "1".repeat(32);
const sessionPortableId = "a".repeat(32);

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

  it("rewrites an owned plan child graph through deterministic root and day remaps", async () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        plans: [{ id: "plan-1", origin: "custom", portable_id: "f".repeat(32) }],
        plan_days: [{ id: "day-1", plan_id: "plan-1", ordinal: 0 }],
        plan_schedules: [{ id: "schedule-1", plan_id: "plan-1" }],
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
});
