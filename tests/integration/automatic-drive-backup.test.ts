import { describe, expect, it } from "@jest/globals";

import { createAutomaticBackupCoordinator } from "../../src/domains/backup/automaticBackupCoordinator";

describe("automatic Drive backup integration", () => {
  it("keeps a stale writer quarantined after a conditional manifest conflict", async () => {
    const states: string[] = [];
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 2, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "p", connectionGeneration: 2, writerEpoch: 4, mutationGeneration: 2, backedUpGeneration: 1 }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => true,
        markStaleWriter: async () => { states.push("stale_writer"); return true; },
      },
      drive: {
        createSnapshot: async () => "immutable-candidate",
        download: async () => new Uint8Array([1]),
        updateManifest: async () => { throw new Error("drive_manifest_conflict"); },
        readManifest: async () => null,
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "candidate",
    });

    await expect(coordinator.backup()).resolves.toEqual({ status: "stale_writer" });
    expect(states).toEqual(["stale_writer"]);
  });
});
