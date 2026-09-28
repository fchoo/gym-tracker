import { describe, expect, it } from "@jest/globals";

import { createAutomaticBackupCoordinator } from "./automaticBackupCoordinator";

describe("automatic backup coordinator", () => {
  it("connects through One-Tap before persisting restore quarantine and never uploads during discovery", async () => {
    const events: string[] = [];
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => ({ permissionId: "permission", displayEmail: "…@example.com" }), disconnect: async () => undefined },
      capture: async () => { events.push("capture"); return { generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }; },
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "permission", connectionGeneration: 1, writerEpoch: 0, mutationGeneration: 0, backedUpGeneration: 0 }),
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        beginQuarantine: async () => { events.push("quarantine"); },
        setRecoveryStatus: async (status) => { events.push(status); },
      },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => null, discover: async () => [] },
      validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(coordinator.connect()).resolves.toEqual({ status: "needs_bootstrap" });
    expect(events).toEqual(["quarantine", "checking", "quarantine", "idle"]);
  });
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

  it("re-discovers a durable tombstone namespace until no snapshot remains", async () => {
    const deleted: string[] = [];
    let calls = 0;
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "permission", connectionGeneration: 3, writerEpoch: 2, mutationGeneration: 0, backedUpGeneration: 0, authorityState: "deleted" as const, deletionProgress: "sweep_pending" as const }),
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        completeDeletionSweep: async () => true,
      },
      drive: {
        createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => null,
        discoverSnapshotsForDeletion: async () => ++calls === 1 ? [{ fileId: "one" }, { fileId: "two" }] : [],
        deleteTombstoned: async (fileId) => { deleted.push(fileId); },
      },
      validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(coordinator.finishDeletionSweep()).resolves.toEqual({ status: "complete" });
    expect(deleted).toEqual(["one", "two"]);
    expect(calls).toBe(2);
  });

  it("binds direct restore and exact merge/adoption commits to one prepared candidate", async () => {
    const restored: string[] = [];
    const snapshot = { version: 2 } as never;
    const manifest = new TextEncoder().encode(JSON.stringify({
      kind: "active", writer_epoch: 2,
      latest: { fileId: "latest", object_sha256: "a".repeat(64) }, previous: null,
    }));
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "permission", connectionGeneration: 1, writerEpoch: 2, mutationGeneration: 0, backedUpGeneration: 0, authorityState: "quarantine" as const }),
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        setRecoveryStatus: async () => undefined,
      },
      drive: { createSnapshot: async () => "snapshot", updateManifest: async () => "etag", readManifest: async () => ({ bytes: manifest, etag: "etag" }), download: async () => new Uint8Array() },
      validate: () => true, nowMs: () => 1, candidateId: () => "attempt",
      recovery: {
        parseSnapshot: async () => snapshot,
        localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "merge", ownerSummary: "other account", adoptionRequired: true }),
        restore: async () => { restored.push("direct"); return { state: "ready" as const }; },
        commitMerge: async () => ({ state: "ready" as const }),
      },
    });
    const prepared = await coordinator.prepareRecovery({ candidate: "latest" });
    expect(prepared).toEqual({ kind: "empty_direct", attemptId: "attempt" });
    await expect(coordinator.commitRecovery({ kind: "empty_direct", attemptId: "attempt" })).resolves.toEqual({ state: "ready" });
    expect(restored).toEqual(["direct"]);
    await expect(coordinator.commitRecovery({ kind: "empty_direct", attemptId: "attempt" })).rejects.toThrow("automatic_recovery_attempt_invalid");
  });
});
