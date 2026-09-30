import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createAutomaticPortableMergePort, createAutomaticPortableRestorePort } from "./automaticPortability";
import * as restoreCommands from "./restoreCommands";
import type { PortableMergePlan } from "./mergePlan";

const snapshot = {} as never;
const plan = {} as PortableMergePlan;

function bypassSnapshotValidation() {
  return jest.spyOn(restoreCommands, "validateLogicalRestoreSnapshot")
    .mockResolvedValue(undefined);
}

function mergeDependencies(overrides: Partial<Parameters<typeof createAutomaticPortableMergePort>[0]> = {}) {
  return {
    schema: { columnsFor: async () => [] },
    candidateProbe: { validateCandidate: jest.fn(async () => undefined) },
    isWorkoutActive: jest.fn(() => false),
    local: jest.fn(async () => ({ version: 2 as const, schemaVersion: 26, tables: {} })),
    archive: jest.fn(() => ({ version: 2 as const, schemaVersion: 26, tables: {} })),
    build: jest.fn(async () => plan),
    fingerprint: jest.fn(async () => "local-fingerprint"),
    issue: jest.fn(() => "merge-token"),
    consume: jest.fn(() => ({ plan, fingerprint: "local-fingerprint" })),
    commitPlan: jest.fn(async () => ({ state: "ready" as const })),
    rebuild: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe("automatic portability", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("refuses non-empty or stale-claim direct restore before invoking a writer", async () => {
    const restore = jest.fn(async () => ({ state: "rebuild_pending" as const }));
    const port = createAutomaticPortableRestorePort({ schema: { columnsFor: async () => [] }, candidateProbe: { validateCandidate: async () => undefined }, isWorkoutActive: () => false, localIsEmpty: async () => false, claimIsCurrent: async () => true, restore, rebuild: async () => undefined });
    await expect(port.restore({} as never)).rejects.toThrow("restore_archive_unsupported_version");
    expect(restore).not.toHaveBeenCalled();
  });

  it("restores only a currently quarantined empty installation and rebuilds durable projections", async () => {
    bypassSnapshotValidation();
    const restore = jest.fn(async () => ({ state: "rebuild_pending" as const }));
    const rebuild = jest.fn(async () => undefined);
    const candidateProbe = { validateCandidate: jest.fn(async () => undefined) };
    const port = createAutomaticPortableRestorePort({
      schema: { columnsFor: async () => [] }, candidateProbe,
      isWorkoutActive: () => false,
      localIsEmpty: async () => true, claimIsCurrent: async () => true, restore, rebuild,
    });

    await expect(port.restore(snapshot)).resolves.toEqual({ state: "rebuild_pending" });
    expect(candidateProbe.validateCandidate).toHaveBeenCalledWith(snapshot);
    expect(restore).toHaveBeenCalledWith(snapshot);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it("normalizes a completed direct restore to ready", async () => {
    bypassSnapshotValidation();
    const port = createAutomaticPortableRestorePort({
      schema: { columnsFor: async () => [] }, candidateProbe: { validateCandidate: async () => undefined },
      isWorkoutActive: () => false,
      localIsEmpty: async () => true, claimIsCurrent: async () => true,
      restore: async () => ({ state: "ready" as never }), rebuild: async () => undefined,
    });

    await expect(port.restore(snapshot)).resolves.toEqual({ state: "ready" });
  });

  it.each([
    ["a non-empty local installation", async () => false, async () => true, "automatic_restore_requires_merge"],
    ["a stale recovery claim", async () => true, async () => false, "automatic_restore_claim_stale"],
  ])("does not mutate local facts for %s", async (_label, localIsEmpty, claimIsCurrent, expected) => {
    bypassSnapshotValidation();
    const restore = jest.fn(async () => ({ state: "rebuild_pending" as const }));
    const port = createAutomaticPortableRestorePort({
      schema: { columnsFor: async () => [] }, candidateProbe: { validateCandidate: async () => undefined },
      isWorkoutActive: () => false,
      localIsEmpty, claimIsCurrent, restore, rebuild: async () => undefined,
    });

    await expect(port.restore(snapshot)).rejects.toThrow(expected);
    expect(restore).not.toHaveBeenCalled();
  });

  it("defers direct restore before validation when an interactive workout is active", async () => {
    const candidateProbe = { validateCandidate: jest.fn(async () => undefined) };
    const restore = jest.fn(async () => ({ state: "rebuild_pending" as const }));
    const port = createAutomaticPortableRestorePort({
      schema: { columnsFor: async () => [] }, candidateProbe,
      isWorkoutActive: async () => true,
      localIsEmpty: async () => true, claimIsCurrent: async () => true,
      restore, rebuild: async () => undefined,
    });

    await expect(port.restore(snapshot)).rejects.toThrow("automatic_restore_workout_active");
    expect(candidateProbe.validateCandidate).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });

  it("preflights a merge once and hands the fresh local fingerprint to its single-use commit", async () => {
    bypassSnapshotValidation();
    const dependencies = mergeDependencies();
    const port = createAutomaticPortableMergePort(dependencies);

    await expect(port.preflight(snapshot)).resolves.toEqual({ token: "merge-token", adoptionRequired: false });
    await expect(port.commit("merge-token")).resolves.toEqual({ state: "ready" });

    expect(dependencies.build).toHaveBeenCalledWith({
      archive: { version: 2, schemaVersion: 26, tables: {} },
      local: { version: 2, schemaVersion: 26, tables: {} },
    });
    expect(dependencies.issue).toHaveBeenCalledWith({ plan, fingerprint: "local-fingerprint" });
    expect(dependencies.commitPlan).toHaveBeenCalledWith({ plan, fingerprint: "local-fingerprint" });
    expect(dependencies.rebuild).toHaveBeenCalledTimes(1);
  });

  it("binds a namespace adoption to one fresh account and connection context", async () => {
    bypassSnapshotValidation();
    const remote = { tables: { portable_owner_identity: [{ id: 1, owner_namespace: "b".repeat(32) }] } } as never;
    const pending = {
      plan,
      fingerprint: "local-fingerprint",
      adoption: {
        oldNamespace: "a".repeat(32),
        newNamespace: "b".repeat(32),
        remoteSnapshotSha256: "c".repeat(64),
      },
    };
    const dependencies = mergeDependencies({
      local: jest.fn(async () => ({
        version: 2 as const,
        schemaVersion: 26,
        tables: { portable_owner_identity: [{ id: 1, owner_namespace: "a".repeat(32) }] },
      })),
      archive: jest.fn(() => ({
        version: 2 as const,
        schemaVersion: 26,
        tables: { portable_owner_identity: [{ id: 1, owner_namespace: "b".repeat(32) }] },
      })),
      snapshotDigest: jest.fn(async () => "c".repeat(64)),
      nowMs: () => 1_000,
      issue: jest.fn(() => "adoption-token"),
      consume: jest.fn(() => pending),
    });
    const port = createAutomaticPortableMergePort(dependencies);

    await expect(port.preflight(remote)).resolves.toEqual({ token: "adoption-token", adoptionRequired: true });
    await expect(port.commit("adoption-token")).rejects.toThrow("automatic_merge_adoption_grant_required");

    const successful = createAutomaticPortableMergePort({
      ...dependencies,
      consume: jest.fn(() => pending),
    });
    await expect(successful.commit("adoption-token", {
      receiptId: "receipt",
      permissionId: "permission",
      connectionGeneration: 4,
      environment: "development-test",
      expiresAtMs: 2_000,
    })).resolves.toEqual({ state: "ready" });
    expect(dependencies.commitPlan).toHaveBeenLastCalledWith(expect.objectContaining({
      adoption: expect.objectContaining({
        oldNamespace: "a".repeat(32),
        newNamespace: "b".repeat(32),
        remoteSnapshotSha256: "c".repeat(64),
        permissionId: "permission",
        connectionGeneration: 4,
      }),
    }));
  });

  it("preflights without a grant and rejects a workout that becomes active before commit", async () => {
    bypassSnapshotValidation();
    let active = false;
    const dependencies = mergeDependencies({ isWorkoutActive: () => active });
    const port = createAutomaticPortableMergePort(dependencies);

    await port.preflight(snapshot);
    expect(dependencies.issue).toHaveBeenCalledWith({ plan, fingerprint: "local-fingerprint" });
    active = true;
    await expect(port.commit("merge-token")).rejects.toThrow("automatic_merge_workout_active");
    expect(dependencies.consume).not.toHaveBeenCalled();
  });

  it.each([
    ["preflight", () => mergeDependencies({ isWorkoutActive: () => true }), "automatic_merge_workout_active"],
    ["commit", () => mergeDependencies({ consume: () => null }), "automatic_merge_token_invalid"],
  ])("rejects an unsafe %s merge path without committing", async (stage, create, expected) => {
    bypassSnapshotValidation();
    const dependencies = create();
    const port = createAutomaticPortableMergePort(dependencies);

    if (stage === "preflight") await expect(port.preflight(snapshot)).rejects.toThrow(expected);
    else await expect(port.commit("missing-token")).rejects.toThrow(expected);
    expect(dependencies.commitPlan).not.toHaveBeenCalled();
  });
});
