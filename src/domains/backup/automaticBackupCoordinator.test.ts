import { describe, expect, it } from "@jest/globals";

import { createAutomaticBackupCoordinator } from "./automaticBackupCoordinator";

describe("automatic backup coordinator", () => {
  it("does not acknowledge an upload until its immutable candidate is reread and the manifest is reread", async () => {
    const events: string[] = [];
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new TextEncoder().encode("snapshot") }),
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "permission", connectionGeneration: 1, writerEpoch: 2, mutationGeneration: 4, backedUpGeneration: 3 }),
        persistAttempt: async () => { events.push("persist"); },
        acknowledgeReceipt: async () => { events.push("acknowledge"); return true; },
      },
      drive: {
        createSnapshot: async () => { events.push("upload"); return "snapshot"; },
        download: async () => { events.push("download"); return new TextEncoder().encode("snapshot"); },
        updateManifest: async () => { events.push("promote"); return "next-etag"; },
        readManifest: async () => { events.push("reread"); return { bytes: new TextEncoder().encode("{}"), etag: "next-etag" }; },
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "candidate",
    });

    await expect(coordinator.backup()).resolves.toEqual({ status: "backed_up", generation: 4 });
    expect(events).toEqual(["persist", "upload", "download", "promote", "reread", "acknowledge"]);
  });
});
