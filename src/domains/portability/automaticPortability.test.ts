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
    const port = createAutomaticPortableRestorePort({ schema: { columnsFor: async () => [] }, candidateProbe: { validateCandidate: async () => undefined }, localIsEmpty: async () => false, claimIsCurrent: async () => true, restore, rebuild: async () => undefined });
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
      localIsEmpty: async () => true, claimIsCurrent: async () => true, restore, rebuild,
    });

    await expect(port.restore(snapshot)).resolves.toEqual({ state: "rebuild_pending" });
    expect(candidateProbe.validateCandidate).toHaveBeenCalledWith(snapshot);
    expect(restore).toHaveBeenCalledWith(snapshot);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a non-empty local installation", async () => false, async () => true, "automatic_restore_requires_merge"],
    ["a stale recovery claim", async () => true, async () => false, "automatic_restore_claim_stale"],
  ])("does not mutate local facts for %s", async (_label, localIsEmpty, claimIsCurrent, expected) => {
    bypassSnapshotValidation();
    const restore = jest.fn(async () => ({ state: "rebuild_pending" as const }));
    const port = createAutomaticPortableRestorePort({
      schema: { columnsFor: async () => [] }, candidateProbe: { validateCandidate: async () => undefined },
      localIsEmpty, claimIsCurrent, restore, rebuild: async () => undefined,
    });

    await expect(port.restore(snapshot)).rejects.toThrow(expected);
    expect(restore).not.toHaveBeenCalled();
  });

  it("preflights a merge once and hands the fresh local fingerprint to its single-use commit", async () => {
    bypassSnapshotValidation();
    const dependencies = mergeDependencies();
    const port = createAutomaticPortableMergePort(dependencies);

    await expect(port.preflight(snapshot, { token: "fresh-google-auth" })).resolves.toEqual({ token: "merge-token" });
    await expect(port.commit("merge-token")).resolves.toEqual({ state: "ready" });

    expect(dependencies.build).toHaveBeenCalledWith({
      archive: { version: 2, schemaVersion: 26, tables: {} },
      local: { version: 2, schemaVersion: 26, tables: {} },
    });
    expect(dependencies.issue).toHaveBeenCalledWith({ plan, fingerprint: "local-fingerprint", grant: "fresh-google-auth" });
    expect(dependencies.commitPlan).toHaveBeenCalledWith({ plan, fingerprint: "local-fingerprint" });
    expect(dependencies.rebuild).toHaveBeenCalledTimes(1);
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
