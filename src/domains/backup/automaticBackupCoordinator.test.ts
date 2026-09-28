import { describe, expect, it, jest } from "@jest/globals";

import { createAutomaticBackupCoordinator } from "./automaticBackupCoordinator";

const activeState = (overrides: Record<string, unknown> = {}) => ({
  environment: "development-test" as const, permissionId: "permission", connectionGeneration: 1,
  writerEpoch: 2, mutationGeneration: 4, backedUpGeneration: 3, authorityState: "active" as const,
  manifestId: "manifest", manifestEtag: "etag", ...overrides,
});

const activeManifest = (writerEpoch = 2, previous: unknown = null) => new TextEncoder().encode(JSON.stringify({
  kind: "active", writer_epoch: writerEpoch,
  latest: { fileId: "latest", object_sha256: "a".repeat(64) }, previous,
}));

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

  it("defers every unsafe capture boundary and never acknowledges it", async () => {
    for (const [state, capture] of [
      [activeState({ permissionId: null }), { generation: 4 }],
      [activeState({ authorityState: "quarantine" }), { generation: 4 }],
      [activeState({ authorityState: "stale_writer" }), { generation: 4 }],
      [activeState({ mutationGeneration: 3, backedUpGeneration: 3 }), { generation: 4 }],
      [activeState(), { generation: 5 }],
      [activeState(), { generation: 3 }],
    ] as const) {
      const captureSpy = jest.fn(async () => ({ ...capture, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }));
      const coordinator = createAutomaticBackupCoordinator({
        isWorkoutActive: () => false, capture: captureSpy,
        state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => true },
        drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "etag", readManifest: async () => ({ bytes: new Uint8Array([1]), etag: "etag" }) },
        validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
      });
      await expect(coordinator.backup()).resolves.toEqual({ status: "deferred" });
      if (state.permissionId === null || state.authorityState !== "active" || state.mutationGeneration <= state.backedUpGeneration) expect(captureSpy).not.toHaveBeenCalled();
    }
    const activeWorkout = createAutomaticBackupCoordinator({
      isWorkoutActive: () => true, capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: { read: async () => activeState(), persistAttempt: async () => undefined, acknowledgeReceipt: async () => true },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "etag", readManifest: async () => null }, validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(activeWorkout.backup()).resolves.toEqual({ status: "deferred" });
  });

  it("uses resumable transport only above multipart size and fails closed at every durable cut", async () => {
    const events: string[] = [];
    const large = new Uint8Array(5 * 1024 * 1024 + 1);
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: large }),
      state: { read: async () => activeState(), persistAttempt: async () => { events.push("persist"); }, acknowledgeReceipt: async () => { events.push("ack"); return true; }, markStaleWriter: async () => { events.push("stale"); return true; } },
      drive: { createSnapshot: async () => { throw new Error("multipart must not run"); }, createResumableSnapshot: async () => { events.push("create"); return { location: "https://www.googleapis.com/upload/session", uploadedBytes: 0 }; }, resumeSnapshot: async () => { events.push("resume"); return "snapshot"; }, download: async () => { events.push("download"); return large; }, updateManifest: async () => { events.push("promote"); return "etag2"; }, readManifest: async () => ({ bytes: activeManifest(), etag: "etag2" }) },
      validate: () => true, validateManifest: () => ({ writerEpoch: 2 }), buildManifest: () => new Uint8Array([2]), nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(coordinator.backup()).resolves.toEqual({ status: "backed_up", generation: 4 });
    expect(events).toEqual(["persist", "create", "resume", "download", "promote", "ack"]);

    for (const [drive, expected] of [
      [{ createSnapshot: async () => { throw new Error("upload"); } }, "deferred"],
      [{ createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => { throw new Error("network"); } }, "deferred"],
      [{ createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "next", readManifest: async () => null }, "deferred"],
      [{ createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => { throw new Error("drive_manifest_conflict"); } }, "stale_writer"],
    ] as const) {
      const candidate = createAutomaticBackupCoordinator({
        isWorkoutActive: () => false, capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
        state: { read: async () => activeState(), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, markStaleWriter: async () => true },
        drive: Object.assign({ createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "next", readManifest: async () => ({ bytes: new Uint8Array([1]), etag: "next" }) }, drive),
        validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
      });
      await expect(candidate.backup()).resolves.toMatchObject({ status: expected });
    }
  });

  it("quarantines every discovery ambiguity and only activates a matching newer writer", async () => {
    const make = (state: ReturnType<typeof activeState>, readManifest: () => Promise<{ bytes: Uint8Array; etag: string } | null>, discover?: () => Promise<readonly unknown[]>, activateWriter?: () => Promise<boolean>) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined, ...(activateWriter === undefined ? {} : { activateWriter }), markStaleWriter: async () => true },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest, ...(discover === undefined ? {} : { discover }) }, validate: () => true, validateManifest: (bytes) => bytes[0] === 1 ? null : ({ writerEpoch: bytes[0]! }), nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(make(activeState(), async () => null).recover()).resolves.toEqual({ status: "needs_bootstrap" });
    await expect(make(activeState(), async () => null, async () => [{}]).recover()).resolves.toEqual({ status: "quarantined" });
    await expect(make(activeState(), async () => ({ bytes: new Uint8Array([1]), etag: "e" })).recover()).resolves.toEqual({ status: "quarantined" });
    await expect(make(activeState({ writerEpoch: 3 }), async () => ({ bytes: new Uint8Array([2]), etag: "e" })).recover()).resolves.toEqual({ status: "stale_writer" });
    await expect(make(activeState(), async () => ({ bytes: new Uint8Array([2]), etag: "e" }), undefined, async () => false).recover()).resolves.toEqual({ status: "quarantined" });
    await expect(make(activeState(), async () => ({ bytes: new Uint8Array([2]), etag: "e" }), undefined, async () => true).recover()).resolves.toEqual({ status: "ready" });
  });

  it("guards cancellation, deletion, and merge adoption generations", async () => {
    const events: string[] = [];
    let resolveManifest: (() => void) | undefined;
    let firstManifestRead = true;
    const state = activeState({ authorityState: "quarantine" });
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, auth: { connect: async () => ({ permissionId: "permission", displayEmail: null }), disconnect: async () => { events.push("disconnect"); } },
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined, setRecoveryStatus: async (s) => { events.push(s); }, disconnectLocal: async () => { events.push("local"); }, beginDeletionSweep: async () => true, completeDeletionSweep: async () => true },
      drive: { createSnapshot: async () => "snapshot", updateManifest: async () => "etag", readManifest: async () => {
        if (firstManifestRead) { firstManifestRead = false; await new Promise<void>((resolve) => { resolveManifest = resolve; }); }
        return { bytes: activeManifest(2, { fileId: "previous", object_sha256: "b".repeat(64) }), etag: "etag" };
      }, download: async () => new Uint8Array([1]), discoverSnapshotsForDeletion: async () => [], deleteTombstoned: async () => undefined },
      validate: () => true, nowMs: () => 1, candidateId: () => "attempt", recovery: { parseSnapshot: async () => ({}), localIsEmpty: async () => false, prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired: true }), restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "rebuild_pending" as const }), freshAdoptionGrant: async () => "grant" },
    });
    const pending = coordinator.connect();
    for (let attempt = 0; attempt < 8 && resolveManifest === undefined; attempt += 1) await Promise.resolve();
    expect(resolveManifest).toBeDefined();
    await coordinator.abortChecking(); resolveManifest?.();
    await expect(pending).resolves.toEqual({ status: "cancelled" });
    await coordinator.disconnect(); expect(events).toEqual(expect.arrayContaining(["disconnect", "local"]));
    const prepared = await coordinator.prepareRecovery({ candidate: "previous" });
    expect(prepared).toMatchObject({ kind: "merge" });
    await expect(coordinator.commitRecovery({ kind: "merge", attemptId: prepared.attemptId, confirmation: "MERGE" })).rejects.toThrow("automatic_recovery_adoption_required");
    const retry = await coordinator.prepareRecovery({ candidate: "previous" });
    await expect(coordinator.commitRecovery({ kind: "merge", attemptId: retry.attemptId, confirmation: "MERGE", adoptIdentity: true, adoptionGrant: "bad" })).rejects.toThrow("automatic_recovery_adoption_grant_invalid");
  });

  it("covers deferred resumable acknowledgement, manifest reread, and acknowledgement fences", async () => {
    const base = (drive: Record<string, unknown>, validate = () => true, acknowledgeReceipt = async () => true) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array(5 * 1024 * 1024 + 1) }),
      state: { read: async () => activeState(), persistAttempt: async () => undefined, acknowledgeReceipt },
      drive: { createSnapshot: async () => "snapshot", createResumableSnapshot: async () => ({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 0 }), resumeSnapshot: async () => ({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 1 }), download: async () => new Uint8Array([1]), updateManifest: async () => "next", readManifest: async () => ({ bytes: new Uint8Array([1]), etag: "next" }), ...drive },
      validate, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(base({}).backup()).resolves.toEqual({ status: "deferred" });
    await expect(base({ resumeSnapshot: async () => "snapshot", readManifest: async () => ({ bytes: new Uint8Array([1]), etag: "wrong" }) }).backup()).resolves.toEqual({ status: "deferred" });
    await expect(base({ resumeSnapshot: async () => "snapshot" }, () => true, async () => false).backup()).resolves.toEqual({ status: "stale_writer" });
  });

  it("rejects unavailable recovery inputs and reports every deletion sweep outcome", async () => {
    const noRecovery = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ permissionId: null }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => null }, validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(noRecovery.recover()).resolves.toEqual({ status: "quarantined" });
    await expect(noRecovery.checkAgain()).resolves.toEqual({ status: "cancelled" });
    await expect(noRecovery.prepareRecovery({ candidate: "latest" })).rejects.toThrow("automatic_recovery_unavailable");
    await expect(noRecovery.commitRecovery({ kind: "empty_direct", attemptId: "x" })).rejects.toThrow("automatic_recovery_unavailable");

    const deletion = (state: Record<string, unknown>, drive: Record<string, unknown>, beginDeletionSweep = async () => true, completeDeletionSweep = async () => true) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "deleted", deletionProgress: "none", ...state }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginDeletionSweep, completeDeletionSweep },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => null, ...drive }, validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(deletion({ authorityState: "active" }, {}).finishDeletionSweep()).resolves.toEqual({ status: "cancelled" });
    await expect(deletion({}, {}, async () => false).finishDeletionSweep()).resolves.toEqual({ status: "cancelled" });
    await expect(deletion({}, {}).finishDeletionSweep()).resolves.toEqual({ status: "partial" });
    await expect(deletion({}, { discoverSnapshotsForDeletion: async () => [{ fileId: "x" }, { fileId: "y" }], deleteTombstoned: async () => undefined }).finishDeletionSweep()).resolves.toEqual({ status: "partial" });
    await expect(deletion({}, { discoverSnapshotsForDeletion: async () => { throw new Error("offline"); }, deleteTombstoned: async () => undefined }).finishDeletionSweep()).resolves.toEqual({ status: "partial" });
    await expect(deletion({}, { discoverSnapshotsForDeletion: async () => [], deleteTombstoned: async () => undefined }, async () => true, async () => false).finishDeletionSweep()).resolves.toEqual({ status: "cancelled" });
  });

  it("makes recovery attempts single-use and accepts only a fully authorized merge", async () => {
    const state = activeState({ authorityState: "quarantine" });
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, setRecoveryStatus: async () => undefined },
      drive: { createSnapshot: async () => "snapshot", updateManifest: async () => "etag", readManifest: async () => ({ bytes: activeManifest(2), etag: "etag" }), download: async () => new Uint8Array([1]) },
      validate: () => true, nowMs: () => 1, candidateId: () => Math.random().toString(), recovery: { parseSnapshot: async () => ({}), localIsEmpty: async () => false, prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired: false }), restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "rebuild_pending" as const }) },
    });
    const attempt = await coordinator.prepareRecovery({ candidate: "latest" });
    await expect(coordinator.commitRecovery({ kind: "empty_direct", attemptId: attempt.attemptId })).rejects.toThrow("automatic_recovery_attempt_invalid");
    const successful = await coordinator.prepareRecovery({ candidate: "latest" });
    await expect(coordinator.commitRecovery({ kind: "merge", attemptId: successful.attemptId, confirmation: "MERGE" })).resolves.toEqual({ state: "rebuild_pending" });

    const errors = (stateValue: Record<string, unknown>, manifest: Uint8Array | null, candidate: "latest" | "previous") => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "quarantine", ...stateValue }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false },
      drive: { createSnapshot: async () => "snapshot", updateManifest: async () => "etag", readManifest: async () => manifest === null ? null : ({ bytes: manifest, etag: "etag" }), download: async () => new Uint8Array() },
      validate: () => true, nowMs: () => 1, candidateId: () => "attempt", recovery: { parseSnapshot: async () => ({}), localIsEmpty: async () => true, prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired: false }), restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "ready" as const }) },
    });
    await expect(errors({ permissionId: null }, activeManifest(), "latest").prepareRecovery({ candidate: "latest" })).rejects.toThrow("automatic_recovery_not_quarantined");
    await expect(errors({}, null, "latest").prepareRecovery({ candidate: "latest" })).rejects.toThrow("automatic_recovery_manifest_missing");
    await expect(errors({}, new TextEncoder().encode(JSON.stringify({ kind: "deleted", successorWriterEpoch: 1, deletedAtMs: 1 })), "latest").prepareRecovery({ candidate: "latest" })).rejects.toThrow("automatic_recovery_manifest_invalid");
    await expect(errors({}, activeManifest(2), "previous").prepareRecovery({ candidate: "previous" })).rejects.toThrow("automatic_recovery_candidate_missing");
  });

  it("keeps public scheduling methods non-blocking and supports a credential-free recheck", async () => {
    let runs = 0;
    const statuses: string[] = [];
    let currentState = activeState();
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => { runs += 1; return { generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }; },
      state: { read: async () => currentState, persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined, setRecoveryStatus: async (value) => { statuses.push(value); } },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "etag", readManifest: async () => null, discover: async () => [] }, validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    const first = coordinator.backup(); const second = coordinator.backup();
    expect(first).toBe(second); await first; expect(runs).toBe(1);
    currentState = activeState({ authorityState: "quarantine" });
    await expect(coordinator.checkAgain()).resolves.toEqual({ status: "needs_bootstrap" });
    await coordinator.deferRecovery(); await coordinator.abortChecking();
    expect(statuses).toEqual(expect.arrayContaining(["restore_pending"]));

    const quarantined = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "quarantine" }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined, setRecoveryStatus: async (value) => { statuses.push(value); } },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => ({ bytes: new Uint8Array([1]), etag: "etag" }) }, validate: () => true, validateManifest: () => null, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(quarantined.checkAgain()).resolves.toEqual({ status: "quarantined" });
    expect(statuses).toEqual(expect.arrayContaining(["restore_pending"]));
  });

  it("covers rejected candidate bytes, anonymous connect, and both recovery activation paths", async () => {
    const candidate = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: { read: async () => activeState(), persistAttempt: async () => undefined, acknowledgeReceipt: async () => true },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "etag", readManifest: async () => ({ bytes: new Uint8Array(), etag: "etag" }) }, validate: () => false, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(candidate.backup()).resolves.toEqual({ status: "deferred" });
    await expect(candidate.connect()).resolves.toEqual({ status: "cancelled" });

    const activate = (state: Record<string, unknown>, adoptionRequired: boolean) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "quarantine", ...state }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined, activateWriter: async () => true, setRecoveryStatus: async () => undefined },
      drive: { createSnapshot: async () => "snapshot", updateManifest: async () => "etag", readManifest: async () => ({ bytes: activeManifest(), etag: "etag" }), download: async () => new Uint8Array([1]) },
      validate: () => true, validateManifest: () => ({ writerEpoch: 2 }), nowMs: () => 1, candidateId: () => "attempt", recovery: { parseSnapshot: async () => ({}), localIsEmpty: async () => false, prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired }), restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "ready" as const }), ...(adoptionRequired ? { freshAdoptionGrant: async () => "grant" } : {}) },
    });
    await expect(activate({ manifestId: null }, false).recover()).resolves.toEqual({ status: "ready" });
    const adopted = activate({}, true); const prepared = await adopted.prepareRecovery({ candidate: "latest" });
    await expect(adopted.commitRecovery({ kind: "merge", attemptId: prepared.attemptId, confirmation: "MERGE", adoptIdentity: true, adoptionGrant: "grant" })).resolves.toEqual({ state: "ready" });
  });
});
