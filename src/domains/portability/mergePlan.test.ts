import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  buildPortableMergePlan,
} from "./mergePlan";

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
  it("uses the canonical payload digest to break an equal-timestamp session tie deterministically", () => {
    const archive = snapshot({ id: "archive-session", marker: "archive", modifiedAtMs: 20 });
    const local = snapshot({ id: "local-session", marker: "local", modifiedAtMs: 20 });

    const plan = buildPortableMergePlan({
      archive,
      local,
      payloadDigest: (value) => value.includes("archive")
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
  });

  it("keeps local settings on duplicate keys while importing missing keys", () => {
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

    const plan = buildPortableMergePlan({
      archive,
      local,
      payloadDigest: () => "0".repeat(64),
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

  it("keeps distinct custom exercise identities and remaps a physical ID collision", () => {
    const archive = snapshot(
      { id: "archive-session", marker: "archive", modifiedAtMs: 20 },
      {
        exercises: [{
          id: "exercise-1",
          origin: "custom",
          portable_id: "b".repeat(32),
          name: "Same visible name",
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

    const plan = buildPortableMergePlan({
      archive,
      local,
      payloadDigest: () => "0".repeat(64),
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
  });

  it("deduplicates matching custom exercise identities even when physical IDs differ", () => {
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

    const plan = buildPortableMergePlan({
      archive,
      local,
      payloadDigest: () => "0".repeat(64),
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

  it("keeps distinct owned plan identities through a physical ID collision", () => {
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

    const plan = buildPortableMergePlan({
      archive,
      local,
      payloadDigest: () => "0".repeat(64),
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

  it("rejects an orphan session child before returning any plan", () => {
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

    expect(() => buildPortableMergePlan({
      archive,
      local,
      payloadDigest: () => "0".repeat(64),
    })).toThrow("merge_plan_invalid");
  });
});
