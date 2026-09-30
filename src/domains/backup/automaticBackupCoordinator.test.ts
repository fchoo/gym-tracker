import { describe, expect, it, jest } from "@jest/globals";

import { createAutomaticBackupCoordinator, selectRecoveryLineage } from "./automaticBackupCoordinator";

const activeState = (overrides: Record<string, unknown> = {}) => ({
  environment: "development-test" as const, permissionId: "permission", connectionGeneration: 1,
  writerEpoch: 2, mutationGeneration: 4, backedUpGeneration: 3, authorityState: "active" as const,
  manifestId: "manifest", manifestEtag: "etag", ...overrides,
});

const activeManifest = (writerEpoch = 2, previous: unknown = null) => {
  const complete = (value: Record<string, unknown>, fallbackId: string, mutationGeneration: number) => ({
    byteLength: 1,
    snapshotId: `snapshot-${fallbackId}`,
    writerEpoch,
    mutationGeneration,
    ...value,
  });
  return new TextEncoder().encode(JSON.stringify({
    kind: "active",
    writer_epoch: writerEpoch,
    latest: complete({ fileId: "latest", object_sha256: "a".repeat(64) }, "latest", 4),
    previous: previous === null ? null : complete(previous as Record<string, unknown>, "previous", 3),
  }));
};

describe("automatic backup coordinator", () => {
  it("selects latest and previous only from one verified recovery lineage", () => {
    const candidate = (ownerNamespace: string, writerEpoch: number, mutationGeneration: number, fileId: string) => ({
      kind: "current" as const, ownerNamespace, writerEpoch, mutationGeneration,
      createdAtMs: mutationGeneration, fileId, objectSha256: fileId.padEnd(64, "a").slice(0, 64), byteLength: 100,
    });
    expect(selectRecoveryLineage([
      candidate("a".repeat(32), 3, 4, "four"),
      candidate("a".repeat(32), 3, 6, "six"),
      candidate("a".repeat(32), 3, 5, "five"),
    ])).toMatchObject({
      kind: "verified", latest: { fileId: "six" }, previous: { fileId: "five" },
    });
    expect(selectRecoveryLineage([
      candidate("a".repeat(32), 3, 4, "one"),
      candidate("b".repeat(32), 3, 5, "two"),
    ])).toEqual({ kind: "quarantined" });
    expect(selectRecoveryLineage([{ kind: "update_required", schemaVersion: 99, fileId: "future" }]))
      .toEqual({ kind: "update_required" });
    expect(selectRecoveryLineage([])).toEqual({ kind: "quarantined" });
    expect(selectRecoveryLineage(Array.from({ length: 9 }, (_, index) => candidate("a".repeat(32), 3, index, `id-${index}`))))
      .toEqual({ kind: "quarantined" });
    expect(selectRecoveryLineage([
      candidate("a".repeat(32), 3, 4, "b"), candidate("a".repeat(32), 3, 4, "a"),
    ])).toEqual({ kind: "quarantined" });
    expect(selectRecoveryLineage([candidate("a".repeat(32), 3, 4, "only")]))
      .toMatchObject({ kind: "verified", previous: null });
  });

  it("publishes future and previous recovery prompts without unsafe fallback", async () => {
    const make = (candidate: any, manifestBytes: Uint8Array | null = null) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "quarantine" }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => manifestBytes === null ? null : ({ fileId: "manifest", bytes: manifestBytes, etag: "etag" }), discover: async () => [{}] },
      validate: () => true, validateManifest: () => null, nowMs: () => 1, candidateId: () => "candidate",
      recovery: {
        parseSnapshot: async () => ({}), localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired: false }),
        restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "ready" as const }),
        discoverCandidates: async () => Array.isArray(candidate) ? candidate : [candidate], reconstructManifest: async () => undefined,
      },
    });
    const future = make({ kind: "update_required", schemaVersion: 99, fileId: "future" });
    await future.recover();
    expect(future.recoveryPrompt()).toEqual({ kind: "update_required" });
    const prior = make({
      kind: "current", ownerNamespace: "a".repeat(32), writerEpoch: 3, mutationGeneration: 5,
      createdAtMs: 10, fileId: "prior", objectSha256: "b".repeat(64), byteLength: 100,
    }, new Uint8Array([1]));
    await prior.recover();
    expect(prior.recoveryPrompt()).toEqual({ kind: "previous", producedAtMs: 10 });
    const withPrevious = make([
      { kind: "current", ownerNamespace: "a".repeat(32), writerEpoch: 3, mutationGeneration: 6, createdAtMs: 11, fileId: "latest", objectSha256: "b".repeat(64), byteLength: 100 },
      { kind: "current", ownerNamespace: "a".repeat(32), writerEpoch: 3, mutationGeneration: 5, createdAtMs: 10, fileId: "prior", objectSha256: "c".repeat(64), byteLength: 100 },
    ]);
    await withPrevious.recover();
    expect(withPrevious.recoveryPrompt()).toEqual({ kind: "latest", producedAtMs: 11, previousProducedAtMs: 10 });

    const stateManifestFallback = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "quarantine" }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => ({ bytes: new Uint8Array([1]), etag: "etag" }), discover: async () => [{}] },
      validate: () => true, validateManifest: () => null, nowMs: () => 1, candidateId: () => "candidate",
      recovery: { parseSnapshot: async () => ({}), localIsEmpty: async () => true, prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired: false }), restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "ready" as const }), discoverCandidates: async () => [] },
    });
    await expect(stateManifestFallback.recover()).resolves.toEqual({ status: "quarantined" });
    const noManifestIdentity = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "quarantine", manifestId: null }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => ({ bytes: new Uint8Array([1]), etag: "etag" }) },
      validate: () => true, validateManifest: () => null, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(noManifestIdentity.recover()).resolves.toEqual({ status: "quarantined" });
  });

  it("reconstructs a missing manifest only from one verified bounded lineage", async () => {
    const reconstructed: unknown[] = [];
    const candidate = {
      kind: "current" as const, ownerNamespace: "a".repeat(32), writerEpoch: 3,
      mutationGeneration: 6, createdAtMs: 10, fileId: "latest",
      objectSha256: "b".repeat(64), byteLength: 100,
    };
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate: async () => ({ permissionId: "permission", displayEmail: null }), disconnect: async () => undefined },
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "quarantine", manifestId: null }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => null, discover: async () => [{}] },
      validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
      recovery: {
        parseSnapshot: async () => ({}), localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired: false }),
        restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "ready" as const }),
        discoverCandidates: async () => [candidate],
        reconstructManifest: async (selection) => { reconstructed.push(selection); },
      },
    });

    await expect(coordinator.recover()).resolves.toEqual({ status: "quarantined" });
    expect(reconstructed).toEqual([expect.objectContaining({ kind: "verified", latest: candidate })]);
    expect(coordinator.recoveryPrompt()).toEqual({ kind: "latest", producedAtMs: 10 });
  });
  it("connects through One-Tap before persisting restore quarantine and never uploads during discovery", async () => {
    const events: string[] = [];
    let current: any = { environment: "production" as const, permissionId: "permission", connectionGeneration: 1, writerEpoch: 0, mutationGeneration: 0, backedUpGeneration: 0 };
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => ({ permissionId: "permission", displayEmail: "…@example.com" }), disconnect: async () => undefined },
      capture: async () => { events.push("capture"); return { generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }; },
      state: {
        read: async () => current,
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        beginQuarantine: async (value) => {
          current = { ...current, ...value, authorityState: "quarantine" };
          events.push(`quarantine:${value.environment}`);
        },
        setRecoveryStatus: async (status) => { events.push(status); },
      },
      drive: { environment: "development-test", createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => null, discover: async () => [] },
      validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(coordinator.connect()).resolves.toEqual({ status: "needs_bootstrap" });
    expect(events).toEqual([
      "quarantine:development-test",
      "checking",
      "quarantine:development-test",
      "idle",
    ]);
  });

  it("bootstraps an empty namespace only after a validated candidate round trip", async () => {
    const events: string[] = [];
    let current: any = {
      ...activeState({
        authorityState: "quarantine" as const,
        writerEpoch: 0,
        mutationGeneration: 1,
        backedUpGeneration: 0,
        manifestId: null,
        manifestEtag: null,
      }),
    };
    let manifest: { bytes: Uint8Array; etag: string } | null = null;
    const ids = ["snapshot-server-id", "manifest-server-id"];
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: {
        connect: async () => ({ permissionId: "permission", displayEmail: "…@example.com" }),
        disconnect: async () => undefined,
      },
      capture: async () => ({
        generation: 1,
        sourceDigest: "a".repeat(64),
        bytes: new Uint8Array([7]),
      }),
      state: {
        read: async () => current,
        beginQuarantine: async (input) => {
          current = { ...current, ...input, authorityState: "quarantine" };
          events.push("quarantine");
        },
        persistAttempt: async (input) => {
          expect(input).toMatchObject({
            snapshotId: "snapshot-server-id",
            manifestId: "manifest-server-id",
            writerEpoch: 1,
          });
          events.push("persist");
        },
        activateWriter: async (input) => {
          current = { ...current, ...input, authorityState: "active" };
          events.push("activate");
          return true;
        },
        acknowledgeReceipt: async (input) => {
          expect(input.manifestEtag).toBe('"created-etag"');
          events.push("acknowledge");
          return true;
        },
        setRecoveryStatus: async (status) => { events.push(status); },
      },
      drive: {
        allocateFileId: async () => ids.shift()!,
        createSnapshot: async (id) => { events.push(`snapshot:${id}`); return id; },
        download: async () => new Uint8Array([7]),
        createManifest: async (id, value) => {
          events.push(`manifest:${id}`);
          manifest = { bytes: value, etag: '"created-etag"' };
          return { fileId: id, etag: '"created-etag"' };
        },
        updateManifest: async () => { throw new Error("must_not_update_missing_manifest"); },
        readManifest: async () => manifest,
        discover: async () => [],
      },
      validate: () => true,
      validateManifest: () => ({ writerEpoch: 1 }),
      buildManifest: ({ state }) => new Uint8Array([state.writerEpoch]),
      nowMs: () => 1,
      candidateId: () => "local-fallback-id",
    });

    await expect(coordinator.connect()).resolves.toEqual({ status: "needs_bootstrap" });
    await expect(coordinator.backup()).resolves.toEqual({
      status: "backed_up",
      generation: 1,
    });
    expect(events).toEqual([
      "quarantine", "checking", "quarantine", "idle", "persist",
      "snapshot:snapshot-server-id", "manifest:manifest-server-id",
      "activate", "acknowledge",
    ]);
  });

  it("fails closed when bootstrap capabilities or activation are incomplete", async () => {
    const make = (options: Readonly<{
      allocate?: boolean;
      createdManifestId?: string;
      activate?: boolean;
      manifestConflict?: boolean;
    }>) => {
      let current: any = activeState({
        authorityState: "quarantine",
        writerEpoch: 0,
        mutationGeneration: 1,
        backedUpGeneration: 0,
        manifestId: null,
        manifestEtag: null,
      });
      let manifest: { bytes: Uint8Array; etag: string } | null = null;
      const ids = ["snapshot-server-id", "manifest-server-id"];
      return createAutomaticBackupCoordinator({
        isWorkoutActive: () => false,
        auth: {
          connect: async () => ({ permissionId: "permission", displayEmail: null }),
          disconnect: async () => undefined,
        },
        capture: async () => ({
          generation: 1,
          sourceDigest: "a".repeat(64),
          bytes: new Uint8Array([7]),
        }),
        state: {
          read: async () => current,
          beginQuarantine: async (input) => {
            current = { ...current, ...input, authorityState: "quarantine" };
          },
          persistAttempt: async () => undefined,
          activateWriter: async () => options.activate ?? true,
          acknowledgeReceipt: async () => true,
          setRecoveryStatus: async () => undefined,
        },
        drive: {
          ...(options.allocate === false ? {} : {
            allocateFileId: async () => ids.shift()!,
            createManifest: async (_id: string, value: Uint8Array) => {
              if (options.manifestConflict === true) throw new Error("drive_manifest_conflict");
              manifest = { bytes: value, etag: '"created-etag"' };
              return {
                fileId: options.createdManifestId ?? "manifest-server-id",
                etag: '"created-etag"',
              };
            },
          }),
          createSnapshot: async (id: string) => id,
          download: async () => new Uint8Array([7]),
          updateManifest: async () => "unused",
          readManifest: async () => manifest,
          discover: async () => [],
        },
        validate: () => true,
        validateManifest: () => ({ writerEpoch: 1 }),
        buildManifest: () => new Uint8Array([1]),
        nowMs: () => 1,
        candidateId: () => "fallback",
      });
    };

    const missingCapability = make({ allocate: false });
    await missingCapability.connect();
    await expect(missingCapability.backup()).resolves.toEqual({ status: "deferred" });

    const mismatchedId = make({ createdManifestId: "wrong" });
    await mismatchedId.connect();
    await expect(mismatchedId.backup()).resolves.toEqual({ status: "deferred" });

    const rejectedActivation = make({ activate: false });
    await rejectedActivation.connect();
    await expect(rejectedActivation.backup()).resolves.toEqual({ status: "deferred" });

    const conflictedManifest = make({ manifestConflict: true });
    await conflictedManifest.connect();
    await expect(conflictedManifest.backup()).resolves.toEqual({ status: "deferred" });
  });

  it("rejects stale or unreadable active manifests before snapshot capture", async () => {
    const make = (readManifest: () => Promise<{ bytes: Uint8Array; etag: string } | null>) => {
      const capture = jest.fn(async () => ({
        generation: 4,
        sourceDigest: "a".repeat(64),
        bytes: new Uint8Array([1]),
      }));
      const stale = jest.fn(async () => true);
      return {
        capture,
        stale,
        coordinator: createAutomaticBackupCoordinator({
          isWorkoutActive: () => false,
          capture,
          state: {
            read: async () => activeState(),
            persistAttempt: async () => undefined,
            acknowledgeReceipt: async () => true,
            markStaleWriter: stale,
          },
          drive: {
            createSnapshot: async () => "snapshot",
            download: async () => new Uint8Array([1]),
            updateManifest: async () => "next",
            readManifest,
          },
          validate: () => true,
          validateManifest: (bytes) => bytes[0] === 2
            ? { writerEpoch: 2, latest: { fileId: "prior", object_sha256: "b".repeat(64) } }
            : bytes[0] === 3
              ? { writerEpoch: 3, latest: { fileId: "prior", object_sha256: "b".repeat(64) } }
              : { writerEpoch: 2 },
          buildManifest: () => new Uint8Array([2]),
          nowMs: () => 1,
          candidateId: () => "candidate",
        }),
      };
    };

    for (const readManifest of [
      async () => null,
      async () => ({ bytes: new Uint8Array([2]), etag: "wrong" }),
      async () => ({ bytes: new Uint8Array([3]), etag: "etag" }),
      async () => ({ bytes: new Uint8Array([1]), etag: "etag" }),
    ]) {
      const { coordinator, capture, stale } = make(readManifest);
      await expect(coordinator.backup()).resolves.toEqual({ status: "stale_writer" });
      expect(capture).not.toHaveBeenCalled();
      expect(stale).toHaveBeenCalledTimes(1);
    }

    const failed = make(async () => { throw new Error("offline"); });
    await expect(failed.coordinator.backup()).resolves.toEqual({ status: "deferred" });
    expect(failed.capture).not.toHaveBeenCalled();
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

  it("trashes only 24-hour orphan candidates while the promoted manifest fence remains current", async () => {
    const trashed: string[] = [];
    let reads = 0;
    const manifest = { writerEpoch: 2, latest: { fileId: "candidate", object_sha256: "a".repeat(64) }, previous: { fileId: "previous", object_sha256: "b".repeat(64) } };
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: { read: async () => activeState(), persistAttempt: async () => undefined, acknowledgeReceipt: async () => true },
      drive: {
        createSnapshot: async () => "candidate", download: async () => new Uint8Array([1]),
        updateManifest: async () => "next-etag",
        readManifest: async () => { reads += 1; return { bytes: new Uint8Array([2]), etag: reads === 1 ? "etag" : "next-etag" }; },
        discoverSnapshotsForRetention: async () => [
          { fileId: "candidate", createdAtMs: 0, etag: "candidate-etag" },
          { fileId: "previous", createdAtMs: 0, etag: "previous-etag" },
          { fileId: "young", createdAtMs: 1, etag: "young-etag" },
          { fileId: "orphan", createdAtMs: 0, etag: "orphan-etag" },
        ],
        trash: async (fileId) => { trashed.push(fileId); },
      },
      validate: () => true, validateManifest: () => manifest,
      buildManifest: () => new Uint8Array([2]), nowMs: () => 24 * 60 * 60 * 1000, candidateId: () => "candidate",
    });

    await expect(coordinator.backup()).resolves.toEqual({ status: "backed_up", generation: 4 });
    expect(trashed).toEqual(["orphan"]);
  });

  it("stops retention before trash when the promoted manifest fence disappears", async () => {
    let reads = 0;
    const trash = jest.fn(async () => undefined);
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: { read: async () => activeState(), persistAttempt: async () => undefined, acknowledgeReceipt: async () => true },
      drive: { createSnapshot: async () => "candidate", download: async () => new Uint8Array([1]), updateManifest: async () => "next-etag", readManifest: async () => ++reads <= 2 ? ({ bytes: new Uint8Array([2]), etag: reads === 1 ? "etag" : "next-etag" }) : null, discoverSnapshotsForRetention: async () => [{ fileId: "orphan", createdAtMs: 0, etag: "orphan-etag" }], trash },
      validate: () => true, validateManifest: () => ({ writerEpoch: 2, latest: { fileId: "candidate", object_sha256: "a".repeat(64) }, previous: null }), buildManifest: () => new Uint8Array([2]), nowMs: () => 24 * 60 * 60 * 1000, candidateId: () => "candidate",
    });
    await expect(coordinator.backup()).resolves.toEqual({ status: "backed_up", generation: 4 });
    expect(trash).not.toHaveBeenCalled();
  });

  it("re-discovers a durable tombstone namespace until no snapshot remains", async () => {
    const deleted: string[] = [];
    let calls = 0;
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate: async () => ({ permissionId: "permission", displayEmail: null }), disconnect: async () => undefined },
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "permission", connectionGeneration: 3, writerEpoch: 2, mutationGeneration: 0, backedUpGeneration: 0, authorityState: "deleted" as const, deletionProgress: "sweep_pending" as const, manifestId: "manifest", manifestEtag: "tombstone-etag" }),
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        completeDeletionSweep: async () => true,
      },
      drive: {
        createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag",
        readManifest: async () => ({ fileId: "manifest", etag: "tombstone-etag", bytes: new TextEncoder().encode(JSON.stringify({ kind: "deleted", successorWriterEpoch: 2, deletedAtMs: 1 })) }),
        discoverSnapshotsForDeletion: async () => ++calls === 1 ? [{ fileId: "one" }, { fileId: "two" }] : [],
        deleteTombstoned: async (fileId) => { deleted.push(fileId); },
      },
      validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(coordinator.finishDeletionSweep()).resolves.toEqual({ status: "complete" });
    expect(deleted).toEqual(["one", "two"]);
    expect(calls).toBe(2);
  });

  it("stops a resumed deletion sweep when a newer writer replaces the tombstone", async () => {
    let manifestReads = 0;
    const deleted: string[] = [];
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: {
        connect: async () => null,
        reauthenticate: async () => ({ permissionId: "permission", displayEmail: null }),
        disconnect: async () => undefined,
      },
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => activeState({
          authorityState: "deleted",
          deletionProgress: "sweep_pending",
          writerEpoch: 3,
          manifestEtag: "tombstone-etag",
        }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
        completeDeletionSweep: async () => true,
      },
      drive: {
        createSnapshot: async () => "snapshot",
        download: async () => new Uint8Array(),
        updateManifest: async () => "etag",
        readManifest: async () => {
          manifestReads += 1;
          return manifestReads === 1
            ? {
              fileId: "manifest",
              etag: "tombstone-etag",
              bytes: new TextEncoder().encode(JSON.stringify({
                kind: "deleted", successorWriterEpoch: 3, deletedAtMs: 1,
              })),
            }
            : { fileId: "manifest", etag: "new-writer-etag", bytes: activeManifest(4) };
        },
        discoverSnapshotsForDeletion: async () => [{ fileId: manifestReads === 1 ? "old-a" : "old-b" }],
        deleteTombstoned: async (fileId) => { deleted.push(fileId); },
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "candidate",
    });

    await expect(coordinator.finishDeletionSweep()).resolves.toEqual({ status: "cancelled" });
    expect(deleted).toEqual(["old-a"]);
  });

  it("recovers a promoted tombstone without reconstructing readable snapshots", async () => {
    const beginDeletionSweep = jest.fn(async () => true);
    const discoverCandidates = jest.fn(async () => [{
      kind: "current" as const,
      ownerNamespace: "a".repeat(32),
      writerEpoch: 2,
      mutationGeneration: 4,
      createdAtMs: 1,
      fileId: "leftover",
      objectSha256: "a".repeat(64),
      byteLength: 1,
    }]);
    const reconstructManifest = jest.fn(async () => undefined);
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => activeState({ authorityState: "active", manifestEtag: "active-etag" }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
        beginQuarantine: async () => undefined,
        beginDeletionSweep,
      },
      drive: {
        createSnapshot: async () => "snapshot",
        download: async () => new Uint8Array(),
        updateManifest: async () => "etag",
        readManifest: async () => ({
          fileId: "manifest",
          etag: "tombstone-etag",
          bytes: new TextEncoder().encode(JSON.stringify({
            kind: "deleted",
            successorWriterEpoch: 3,
            deletedAtMs: 100,
          })),
        }),
        discover: async () => [{ fileId: "leftover" }],
      },
      validate: () => true,
      validateManifest: () => null,
      nowMs: () => 101,
      candidateId: () => "candidate",
      recovery: {
        parseSnapshot: async () => ({}),
        localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "merge", ownerSummary: "owner", adoptionRequired: false }),
        restore: async () => ({ state: "ready" as const }),
        commitMerge: async () => ({ state: "ready" as const }),
        discoverCandidates,
        reconstructManifest,
      },
    });

    await expect(coordinator.recover()).resolves.toEqual({ status: "quarantined" });
    expect(beginDeletionSweep).toHaveBeenCalledWith({
      environment: "development-test",
      permissionId: "permission",
      connectionGeneration: 1,
      manifestId: "manifest",
      manifestEtag: "tombstone-etag",
      successorWriterEpoch: 3,
    });
    expect(discoverCandidates).not.toHaveBeenCalled();
    expect(reconstructManifest).not.toHaveBeenCalled();
  });

  it("promotes a verified successor tombstone before deleting snapshots", async () => {
    const events: string[] = [];
    let manifest: Uint8Array<ArrayBufferLike> = activeManifest(2);
    let etag = "active-etag";
    let authorityState: "active" | "deleted" = "active";
    let writerEpoch = 2;
    let stateManifestEtag = "active-etag";
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate: async () => ({ permissionId: "permission", displayEmail: null }), disconnect: async () => undefined },
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => activeState({ authorityState, writerEpoch, manifestEtag: stateManifestEtag, deletionProgress: authorityState === "deleted" ? "sweep_pending" : "none" }),
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        beginDeletionSweep: async (value) => { authorityState = "deleted"; writerEpoch = value.successorWriterEpoch; stateManifestEtag = value.manifestEtag; events.push("tombstone"); return true; },
        completeDeletionSweep: async () => true,
      },
      drive: {
        createSnapshot: async () => "snapshot", download: async () => new Uint8Array(),
        updateManifest: async (_id, value, expected) => { expect(expected).toBe("active-etag"); manifest = value; etag = "deleted-etag"; events.push("promote"); return etag; },
        readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag }),
        discoverSnapshotsForDeletion: async () => events.includes("delete") ? [] : [{ fileId: "latest" }],
        deleteTombstoned: async () => { events.push("delete"); },
      },
      validate: () => true, nowMs: () => 100, candidateId: () => "candidate",
    });

    await expect(coordinator.deleteCloudBackup()).resolves.toEqual({ status: "complete" });
    expect(events).toEqual(["promote", "tombstone", "delete"]);
    expect(JSON.parse(new TextDecoder().decode(manifest))).toEqual({
      deletedAtMs: 100, kind: "deleted", successorWriterEpoch: 3,
    });
  });

  it("joins an in-flight upload before promoting a deletion tombstone", async () => {
    const events: string[] = [];
    let releaseUpload: (() => void) | undefined;
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: {
        connect: async () => null,
        reauthenticate: async () => { events.push("reauthenticate"); return null; },
        disconnect: async () => undefined,
      },
      capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: {
        read: async () => activeState(),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
      },
      drive: {
        createSnapshot: async () => new Promise<string>((resolve) => {
          events.push("upload");
          releaseUpload = () => resolve("snapshot");
        }),
        download: async () => { throw new Error("offline"); },
        updateManifest: async () => "etag",
        readManifest: async () => ({ fileId: "manifest", bytes: activeManifest(2), etag: "etag" }),
      },
      validate: () => true,
      validateManifest: () => ({ writerEpoch: 2, latest: { fileId: "latest", object_sha256: "a".repeat(64) }, previous: null }),
      buildManifest: () => activeManifest(2),
      nowMs: () => 1,
      candidateId: () => "candidate",
    });

    const backup = coordinator.backup();
    for (let attempt = 0; attempt < 8 && releaseUpload === undefined; attempt += 1) await Promise.resolve();
    const deletion = coordinator.deleteCloudBackup();
    await Promise.resolve();
    expect(events).toEqual(["upload"]);
    releaseUpload?.();
    await expect(backup).resolves.toEqual({ status: "deferred" });
    await expect(deletion).resolves.toEqual({ status: "cancelled" });
    expect(events).toEqual(["upload", "reauthenticate"]);
  });

  it("reopens a deleted tombstone only after fresh auth and a first-backup fence", async () => {
    const quarantine = jest.fn(async () => undefined);
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate: async () => ({ permissionId: "permission", displayEmail: null }), disconnect: async () => undefined },
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: { read: async () => activeState({ authorityState: "deleted", deletionProgress: "complete" }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: quarantine },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "next", readManifest: async () => ({ fileId: "manifest", bytes: new TextEncoder().encode(JSON.stringify({ kind: "deleted", successorWriterEpoch: 3, deletedAtMs: 1 })), etag: "tombstone-etag" }) },
      validate: () => true, nowMs: () => 2, candidateId: () => "candidate",
    });
    await expect(coordinator.startNewCloudBackup()).resolves.toEqual({ status: "ready" });
    expect(quarantine).toHaveBeenCalledWith(expect.objectContaining({ connectionGeneration: 2, permissionId: "permission" }));
  });

  it("promotes the first post-deletion snapshot through the retained tombstone identity", async () => {
    let state: any = activeState({ authorityState: "deleted", deletionProgress: "complete", manifestEtag: "tombstone-etag" });
    let manifest: Uint8Array<ArrayBufferLike> = new TextEncoder().encode(JSON.stringify({ kind: "deleted", successorWriterEpoch: 3, deletedAtMs: 1 }));
    let etag = "tombstone-etag";
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate: async () => ({ permissionId: "permission", displayEmail: null }), disconnect: async () => undefined },
      capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([7]) }),
      state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => true, beginQuarantine: async (value) => { state = { ...state, ...value, authorityState: "quarantine" }; }, activateWriter: async (value) => { state = { ...state, ...value, authorityState: "active" }; return true; } },
      drive: { createSnapshot: async () => "candidate", download: async () => new Uint8Array([7]), updateManifest: async (id, bytes, expected) => { expect(id).toBe("manifest"); expect(expected).toBe("tombstone-etag"); manifest = bytes; etag = "active-etag"; return etag; }, readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag }) },
      validate: () => true, validateManifest: (bytes) => { const value = JSON.parse(new TextDecoder().decode(bytes)); return value.kind === "active" ? { writerEpoch: value.writer_epoch } : null; }, buildManifest: ({ state: current }) => new TextEncoder().encode(JSON.stringify({ kind: "active", writer_epoch: current.writerEpoch, latest: { fileId: "candidate", object_sha256: "a".repeat(64) }, previous: null })), nowMs: () => 2, candidateId: () => "candidate",
    });
    await expect(coordinator.startNewCloudBackup()).resolves.toEqual({ status: "ready" });
    await expect(coordinator.backup()).resolves.toEqual({ status: "backed_up", generation: 4 });
    expect(state).toMatchObject({ authorityState: "active", writerEpoch: 3, manifestEtag: "active-etag" });
  });

  it("fails closed at every deletion and restart authority fence", async () => {
    const deletion = (options: Record<string, any> = {}) => {
      let reads = 0;
      const state = activeState({ manifestEtag: "active-etag", ...options.state });
      return createAutomaticBackupCoordinator({
        isWorkoutActive: () => false,
        auth: { connect: async () => null, reauthenticate: async () => options.identity === null ? null : ({ permissionId: options.permissionId ?? "permission", displayEmail: null }), disconnect: async () => undefined },
        capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
        state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginDeletionSweep: async () => options.begin ?? true },
        drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => options.promotedEtag ?? "deleted-etag", readManifest: async () => {
          reads += 1;
          if (options.nullAt === reads) return null;
          if (reads === 1) return { fileId: options.firstId ?? "manifest", bytes: options.firstBytes ?? activeManifest(options.epoch ?? 2), etag: options.firstEtag ?? "active-etag" };
          return { fileId: options.secondId ?? "manifest", bytes: options.secondBytes ?? new TextEncoder().encode(JSON.stringify({ kind: "deleted", successorWriterEpoch: (options.epoch ?? 2) + 1, deletedAtMs: 1 })), etag: options.secondEtag ?? "deleted-etag" };
        } }, validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
      });
    };
    for (const coordinator of [
      deletion({ identity: null }), deletion({ permissionId: "different" }), deletion({ state: { authorityState: "deleted" } }),
      deletion({ state: { manifestId: null } }), deletion({ nullAt: 1 }), deletion({ firstId: "other" }), deletion({ firstEtag: "other" }),
      deletion({ firstBytes: new TextEncoder().encode(JSON.stringify({ kind: "deleted", successorWriterEpoch: 2, deletedAtMs: 1 })) }),
      deletion({ epoch: Number.MAX_SAFE_INTEGER, state: { writerEpoch: Number.MAX_SAFE_INTEGER } }), deletion({ nullAt: 2 }), deletion({ secondId: "other" }), deletion({ secondEtag: "other" }),
      deletion({ secondBytes: activeManifest(3) }), deletion({ begin: false }),
    ]) await expect(coordinator.deleteCloudBackup()).resolves.toEqual({ status: "cancelled" });

    const restart = (options: Record<string, any> = {}) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate: async () => options.identity === null ? null : ({ permissionId: options.permissionId ?? "permission", displayEmail: null }), disconnect: async () => undefined },
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "deleted", connectionGeneration: options.connectionGeneration ?? 1, ...options.state }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => options.manifest === null ? null : ({ fileId: options.fileId ?? "manifest", bytes: options.bytes ?? new TextEncoder().encode(JSON.stringify({ kind: "deleted", successorWriterEpoch: 3, deletedAtMs: 1 })), etag: "etag" }) },
      validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    for (const coordinator of [
      restart({ identity: null }), restart({ permissionId: "different" }), restart({ state: { authorityState: "active" } }),
      restart({ state: { manifestId: null } }), restart({ manifest: null }), restart({ fileId: "other" }),
      restart({ bytes: activeManifest(2) }), restart({ connectionGeneration: Number.MAX_SAFE_INTEGER }),
    ]) await expect(coordinator.startNewCloudBackup()).resolves.toEqual({ status: "cancelled" });
  });

  it("binds direct restore and exact merge/adoption commits to one prepared candidate", async () => {
    const restored: string[] = [];
    const snapshot = { version: 2 } as never;
    let manifest: Uint8Array = new TextEncoder().encode(JSON.stringify({
      kind: "active", writer_epoch: 2,
      latest: {
        fileId: "latest", object_sha256: "a".repeat(64), byteLength: 1,
        snapshotId: "snapshot-latest", writerEpoch: 2, mutationGeneration: 4,
      },
      previous: null,
    }));
    let manifestEtag = "etag";
    let state = activeState({ authorityState: "quarantine" as const });
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => state,
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        setRecoveryStatus: async () => undefined,
        activateWriter: async (value) => { state = { ...state, ...value, authorityState: "active" }; return true; },
      },
      drive: {
        createSnapshot: async () => "snapshot",
        updateManifest: async (_id, value) => { manifest = value; manifestEtag = "next-etag"; return manifestEtag; },
        readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag: manifestEtag }),
        download: async () => new Uint8Array([1]),
      },
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

  it("binds recovery bytes to the complete selected manifest descriptor", async () => {
    const descriptor = {
      fileId: "latest",
      object_sha256: "a".repeat(64),
      byteLength: 7,
      snapshotId: "snapshot-latest",
      writerEpoch: 3,
      mutationGeneration: 9,
    };
    const parseSnapshot = jest.fn(async (_bytes: Uint8Array, selected: unknown) => {
      expect(selected).toEqual({
        fileId: descriptor.fileId,
        objectSha256: descriptor.object_sha256,
        byteLength: descriptor.byteLength,
        snapshotId: descriptor.snapshotId,
        writerEpoch: descriptor.writerEpoch,
        mutationGeneration: descriptor.mutationGeneration,
      });
      return {};
    });
    const download = jest.fn(async () => new Uint8Array(7));
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => activeState({ authorityState: "quarantine", writerEpoch: 2 }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
      },
      drive: {
        createSnapshot: async () => "snapshot",
        download,
        updateManifest: async () => "etag",
        readManifest: async () => ({
          fileId: "manifest",
          etag: "etag",
          bytes: new TextEncoder().encode(JSON.stringify({
            kind: "active",
            writer_epoch: 3,
            latest: descriptor,
            previous: null,
          })),
        }),
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "attempt",
      recovery: {
        parseSnapshot,
        localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "merge", ownerSummary: "owner", adoptionRequired: false }),
        restore: async () => ({ state: "ready" as const }),
        commitMerge: async () => ({ state: "ready" as const }),
      },
    });

    await expect(coordinator.prepareRecovery({ candidate: "latest" }))
      .resolves.toMatchObject({ kind: "empty_direct" });
    expect(download).toHaveBeenCalledWith("latest", 8);
    expect(parseSnapshot).toHaveBeenCalledTimes(1);

    const missingLength = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => activeState({ authorityState: "quarantine" }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
      },
      drive: {
        createSnapshot: async () => "snapshot",
        download,
        updateManifest: async () => "etag",
        readManifest: async () => ({ fileId: "manifest", etag: "etag", bytes: new TextEncoder().encode(JSON.stringify({
          kind: "active", writer_epoch: 2,
          latest: { fileId: "latest", object_sha256: "a".repeat(64) }, previous: null,
        })) }),
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "attempt",
      recovery: {
        parseSnapshot,
        localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "merge", ownerSummary: "owner", adoptionRequired: false }),
        restore: async () => ({ state: "ready" as const }),
        commitMerge: async () => ({ state: "ready" as const }),
      },
    });
    await expect(missingLength.prepareRecovery({ candidate: "latest" }))
      .rejects.toThrow("automatic_recovery_manifest_invalid");
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
    const reportedFailures: string[] = [];
    const large = new Uint8Array(5 * 1024 * 1024 + 1);
    let manifestReads = 0;
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: large }),
      state: { read: async () => activeState(), persistAttempt: async () => { events.push("persist"); }, acknowledgeReceipt: async () => { events.push("ack"); return true; }, markStaleWriter: async () => { events.push("stale"); return true; } },
      drive: { createSnapshot: async () => { throw new Error("multipart must not run"); }, createResumableSnapshot: async () => { events.push("create"); return { location: "https://www.googleapis.com/upload/session", uploadedBytes: 0 }; }, resumeSnapshot: async () => { events.push("resume"); return "snapshot"; }, download: async () => { events.push("download"); return large; }, updateManifest: async () => { events.push("promote"); return "etag2"; }, readManifest: async () => ({ bytes: activeManifest(), etag: ++manifestReads === 1 ? "etag" : "etag2" }) },
      validate: () => true, validateManifest: () => ({ writerEpoch: 2, latest: { fileId: "prior", object_sha256: "b".repeat(64) } }), buildManifest: () => new Uint8Array([2]), nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(coordinator.backup()).resolves.toEqual({ status: "backed_up", generation: 4 });
    expect(events).toEqual(["persist", "create", "resume", "download", "promote", "ack"]);

    for (const [drive, expected] of [
      [{ createSnapshot: async () => { throw new Error("upload"); } }, "deferred"],
      [{ createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => { throw new Error("network"); } }, "deferred"],
      [{ createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "next", readManifest: async () => null }, "deferred"],
      [{ createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "next", readManifest: async () => { throw new Error("read"); } }, "deferred"],
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

    const boundaryFailure = (failure: "capture" | "allocate" | "persist" | "download") => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => {
        if (failure === "capture") throw new Error("capture");
        return { generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) };
      },
      state: {
        read: async () => activeState(),
        persistAttempt: async () => {
          if (failure === "persist") throw new Error("persist");
        },
        acknowledgeReceipt: async () => true,
      },
      drive: {
        allocateFileId: async () => {
          if (failure === "allocate") throw new Error("allocate");
          return "candidate";
        },
        createSnapshot: async () => "snapshot",
        download: async () => {
          if (failure === "download") throw new Error("download");
          return new Uint8Array([1]);
        },
        updateManifest: async () => "next",
        readManifest: async () => ({ bytes: new Uint8Array([2]), etag: "next" }),
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "candidate",
      reportFailure: (stage) => { reportedFailures.push(`${failure}:${stage}`); },
    });
    for (const failure of ["capture", "allocate", "persist", "download"] as const) {
      await expect(boundaryFailure(failure).backup()).resolves.toEqual({ status: "deferred" });
    }
    expect(reportedFailures).toEqual([
      "capture:snapshot_capture",
      "allocate:file_id_allocation",
      "persist:attempt_persistence",
      "download:snapshot_download",
    ]);
  });

  it("quarantines every discovery ambiguity and only activates a matching newer writer", async () => {
    const make = (state: ReturnType<typeof activeState>, readManifest: () => Promise<{ fileId?: string; bytes: Uint8Array; etag: string } | null>, discover?: () => Promise<readonly unknown[]>, activateWriter?: () => Promise<boolean>) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined, ...(activateWriter === undefined ? {} : { activateWriter }), markStaleWriter: async () => true },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest, ...(discover === undefined ? {} : { discover }) }, validate: () => true, validateManifest: (bytes) => bytes[0] === 1 ? null : ({ writerEpoch: bytes[0]! }), nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(make(activeState(), async () => null).recover()).resolves.toEqual({ status: "needs_bootstrap" });
    await expect(make(activeState(), async () => null, async () => [{}]).recover()).resolves.toEqual({ status: "quarantined" });
    await expect(make(activeState(), async () => ({ bytes: new Uint8Array([1]), etag: "e" })).recover()).resolves.toEqual({ status: "quarantined" });
    await expect(make(activeState({ writerEpoch: 3 }), async () => ({ bytes: new Uint8Array([2]), etag: "e" })).recover()).resolves.toEqual({ status: "quarantined" });
    const activateHigher = jest.fn(async () => true);
    await expect(make(activeState(), async () => ({ bytes: new Uint8Array([3]), etag: "e" }), undefined, activateHigher).recover()).resolves.toEqual({ status: "stale_writer" });
    expect(activateHigher).not.toHaveBeenCalled();
    await expect(make(activeState({ manifestId: undefined }), async () => ({ bytes: new Uint8Array([2]), etag: "e" })).recover()).resolves.toEqual({ status: "quarantined" });
    await expect(make(activeState(), async () => ({ fileId: "other", bytes: new Uint8Array([2]), etag: "e" })).recover()).resolves.toEqual({ status: "quarantined" });
    await expect(make(activeState(), async () => ({ bytes: new Uint8Array([2]), etag: "e" }), undefined, async () => false).recover()).resolves.toEqual({ status: "quarantined" });
    await expect(make(activeState(), async () => ({ bytes: new Uint8Array([2]), etag: "e" }), undefined, async () => true).recover()).resolves.toEqual({ status: "ready" });
  });

  it("requires explicit fresh-auth takeover before reopening a higher epoch for recovery", async () => {
    let state: any = activeState({ authorityState: "stale_writer" });
    const reauthenticate = jest.fn(async () => ({ permissionId: "permission", displayEmail: "…@example.com" }));
    const activateWriter = jest.fn(async () => true);
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate, disconnect: async () => undefined },
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => state,
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
        beginQuarantine: async (value) => { state = { ...state, ...value, authorityState: "quarantine" }; },
        activateWriter,
        markStaleWriter: async () => { state = { ...state, authorityState: "stale_writer" }; return true; },
        setRecoveryStatus: async () => undefined,
      },
      drive: {
        createSnapshot: async () => "snapshot", download: async () => new Uint8Array(),
        updateManifest: async () => "etag",
        readManifest: async () => ({ fileId: "manifest", bytes: activeManifest(3), etag: "remote-etag" }),
      },
      validate: () => true,
      validateManifest: () => ({ writerEpoch: 3 }),
      nowMs: () => 1,
      candidateId: () => "candidate",
    });

    await expect(coordinator.checkAgain()).resolves.toEqual({ status: "stale_writer" });
    expect(reauthenticate).not.toHaveBeenCalled();
    expect(activateWriter).not.toHaveBeenCalled();
    await expect(coordinator.takeOver()).resolves.toEqual({ status: "quarantined" });
    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(activateWriter).not.toHaveBeenCalled();
  });

  it("resumes only a durable successor claim after restart", async () => {
    const updates: string[] = [];
    let manifest: Uint8Array<ArrayBufferLike> = activeManifest(7);
    let etag = "old-etag";
    const activateWriter = jest.fn(async (value: { writerEpoch: number }) => {
      expect(value.writerEpoch).toBe(8);
      return true;
    });
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate: async () => ({ permissionId: "permission", displayEmail: null }), disconnect: async () => undefined },
      capture: async () => { throw new Error("must_not_capture"); },
      state: {
        read: async () => activeState({ authorityState: "quarantine", statusCode: "finishing", writerEpoch: 2 }),
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        readPendingHandover: async () => ({
          attemptId: "attempt", environment: "development-test", permissionId: "permission",
          connectionGeneration: 1, manifestId: "manifest", manifestEtag: "old-etag",
          remoteWriterEpoch: 7, snapshotId: "latest", sourceDigest: "a".repeat(64),
        }),
        activateWriter,
        setRecoveryStatus: async () => undefined,
      },
      drive: {
        createSnapshot: async () => { throw new Error("must_not_upload"); },
        download: async () => { throw new Error("must_not_restore"); },
        updateManifest: async (_id, bytes, expectedEtag) => {
          expect(expectedEtag).toBe("old-etag");
          manifest = bytes; etag = "new-etag"; updates.push("claim"); return etag;
        },
        readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag }),
      },
      validate: () => true, nowMs: () => 1, candidateId: () => "unused",
    });

    await expect(coordinator.takeOver()).resolves.toEqual({ status: "ready" });
    expect(updates).toEqual(["claim"]);
    expect(activateWriter).toHaveBeenCalledTimes(1);
  });

  it("rejects cancelled, changed, and stale durable handover claims", async () => {
    const pending = {
      attemptId: "attempt", environment: "development-test" as const, permissionId: "permission",
      connectionGeneration: 1, manifestId: "manifest", manifestEtag: "old-etag",
      remoteWriterEpoch: 7, snapshotId: "latest", sourceDigest: "a".repeat(64),
    };
    const make = (options: Readonly<{
      identity?: { permissionId: string; displayEmail: null } | null;
      state?: Record<string, unknown>;
      pending?: typeof pending;
      manifest?: Uint8Array | null;
      fileId?: string;
      etag?: string;
    }> = {}) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: { connect: async () => null, reauthenticate: async () => options.identity === undefined ? { permissionId: "permission", displayEmail: null } : options.identity, disconnect: async () => undefined },
      capture: async () => { throw new Error("must_not_capture"); },
      state: {
        read: async () => activeState({ authorityState: "quarantine", statusCode: "finishing", ...options.state }),
        persistAttempt: async () => undefined, acknowledgeReceipt: async () => false,
        readPendingHandover: async () => options.pending ?? pending,
        activateWriter: async () => true, setRecoveryStatus: async () => undefined,
      },
      drive: {
        createSnapshot: async () => { throw new Error("must_not_upload"); }, download: async () => new Uint8Array(),
        updateManifest: async () => "new-etag",
        readManifest: async () => options.manifest === null ? null : ({
          fileId: options.fileId ?? "manifest",
          bytes: options.manifest ?? activeManifest(7),
          etag: options.etag ?? "old-etag",
        }),
      },
      validate: () => true, nowMs: () => 1, candidateId: () => "unused",
    });

    await expect(make({ identity: null }).takeOver()).resolves.toEqual({ status: "cancelled" });
    await expect(make({ pending: { ...pending, permissionId: "different" } }).takeOver())
      .rejects.toThrow("automatic_recovery_claim_stale");
    await expect(make({ state: { connectionGeneration: 2 } }).takeOver())
      .rejects.toThrow("automatic_recovery_claim_stale");
    await expect(make({ etag: "changed" }).takeOver()).rejects.toThrow("automatic_recovery_claim_stale");
    await expect(make({ manifest: activeManifest(8) }).takeOver()).rejects.toThrow("automatic_recovery_claim_stale");
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
      validate: () => true, nowMs: () => 1, candidateId: () => "attempt", recovery: { parseSnapshot: async () => ({}), localIsEmpty: async () => false, prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired: true }), restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "rebuild_pending" as const }), freshAdoptionGrant: async () => ({ receiptId: "grant", permissionId: "permission", connectionGeneration: 1, environment: "production", expiresAtMs: 60_000 }) },
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
      state: { read: async () => activeState({ manifestEtag: "next" }), persistAttempt: async () => undefined, acknowledgeReceipt },
      drive: { createSnapshot: async () => "snapshot", createResumableSnapshot: async () => ({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 0 }), resumeSnapshot: async () => ({ location: "https://www.googleapis.com/upload/session", uploadedBytes: 1 }), download: async () => new Uint8Array(5 * 1024 * 1024 + 1), updateManifest: async () => "next", readManifest: async () => ({ bytes: new Uint8Array([2]), etag: "next" }), ...drive },
      validate, validateManifest: () => ({ writerEpoch: 2, latest: { fileId: "prior", object_sha256: "b".repeat(64) } }), buildManifest: () => new Uint8Array([2]), nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(base({}).backup()).resolves.toEqual({ status: "deferred" });
    let reads = 0;
    await expect(base({ resumeSnapshot: async () => "snapshot", readManifest: async () => ({ bytes: new Uint8Array([2]), etag: ++reads === 1 ? "next" : "wrong" }) }).backup()).resolves.toEqual({ status: "deferred" });
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

    const activeRecovery = createAutomaticBackupCoordinator({
      isWorkoutActive: async () => true,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "quarantine" }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => null },
      validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
      recovery: { parseSnapshot: async () => ({}), localIsEmpty: async () => true, prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired: false }), restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "ready" as const }) },
    });
    await expect(activeRecovery.prepareRecovery({ candidate: "latest" }))
      .rejects.toThrow("automatic_recovery_workout_active");
    await expect(activeRecovery.commitRecovery({ kind: "empty_direct", attemptId: "attempt" }))
      .rejects.toThrow("automatic_recovery_workout_active");

    const deletion = (state: Record<string, unknown>, drive: Record<string, unknown>, beginDeletionSweep = async () => true, completeDeletionSweep = async () => true) => createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, auth: { connect: async () => null, reauthenticate: async () => ({ permissionId: "permission", displayEmail: null }), disconnect: async () => undefined }, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => activeState({ authorityState: "deleted", deletionProgress: "none", ...state }), persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginDeletionSweep, completeDeletionSweep },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => ({ fileId: "manifest", etag: "etag", bytes: new TextEncoder().encode(JSON.stringify({ kind: "deleted", successorWriterEpoch: 2, deletedAtMs: 1 })) }), ...drive }, validate: () => true, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(deletion({ authorityState: "active" }, {}).finishDeletionSweep()).resolves.toEqual({ status: "cancelled" });
    await expect(deletion({}, {}, async () => false).finishDeletionSweep()).resolves.toEqual({ status: "cancelled" });
    await expect(deletion({}, {}).finishDeletionSweep()).resolves.toEqual({ status: "partial" });
    await expect(deletion({}, { discoverSnapshotsForDeletion: async () => [{ fileId: "x" }, { fileId: "y" }], deleteTombstoned: async () => undefined }).finishDeletionSweep()).resolves.toEqual({ status: "partial" });
    await expect(deletion({}, { discoverSnapshotsForDeletion: async () => { throw new Error("offline"); }, deleteTombstoned: async () => undefined }).finishDeletionSweep()).resolves.toEqual({ status: "partial" });
    await expect(deletion({}, { discoverSnapshotsForDeletion: async () => [], deleteTombstoned: async () => undefined }, async () => true, async () => false).finishDeletionSweep()).resolves.toEqual({ status: "cancelled" });
  });

  it("makes recovery attempts single-use and accepts only a fully authorized merge", async () => {
    let state = activeState({ authorityState: "quarantine" });
    let manifest: Uint8Array = activeManifest(2);
    let manifestEtag = "etag";
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, setRecoveryStatus: async () => undefined, activateWriter: async (value) => { state = { ...state, ...value, authorityState: "active" }; return true; } },
      drive: { createSnapshot: async () => "snapshot", updateManifest: async (_id, value) => { manifest = value; manifestEtag = "next"; return manifestEtag; }, readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag: manifestEtag }), download: async () => new Uint8Array([1]) },
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
    await expect(errors({ manifestId: null }, activeManifest(2), "latest").prepareRecovery({ candidate: "latest" })).rejects.toThrow("automatic_recovery_manifest_invalid");
    await expect(errors({}, activeManifest(2), "previous").prepareRecovery({ candidate: "previous" })).rejects.toThrow("automatic_recovery_candidate_missing");
  });

  it("keeps a replacement install quarantined until direct restore claims a successor epoch", async () => {
    const events: string[] = [];
    let current: any = activeState({
      authorityState: "quarantine",
      manifestId: null,
      manifestEtag: null,
      writerEpoch: 0,
      mutationGeneration: 4,
      backedUpGeneration: 0,
    });
    let manifestBytes: Uint8Array = activeManifest(2, {
      fileId: "previous",
      object_sha256: "b".repeat(64),
    });
    let manifestEtag = '"etag-2"';
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      auth: {
        connect: async () => ({ permissionId: "permission", displayEmail: "…@example.com" }),
        disconnect: async () => undefined,
      },
      capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: {
        read: async () => current,
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
        beginQuarantine: async (value) => {
          current = { ...current, ...value, authorityState: "quarantine" };
          events.push("quarantine");
        },
        activateWriter: async (value) => {
          current = { ...current, ...value, authorityState: "active" };
          events.push(`activate:${value.writerEpoch}`);
          return true;
        },
        setRecoveryStatus: async (status) => {
          current = { ...current, statusCode: status };
          events.push(status);
        },
      },
      drive: {
        createSnapshot: async () => "snapshot",
        download: async () => new Uint8Array([1]),
        updateManifest: async (fileId, value, etag) => {
          expect({ fileId, etag }).toEqual({ fileId: "manifest", etag: '"etag-2"' });
          expect(JSON.parse(new TextDecoder().decode(value))).toMatchObject({
            kind: "active",
            writer_epoch: 3,
            latest: { fileId: "latest" },
            previous: { fileId: "previous" },
          });
          events.push("claim");
          manifestBytes = value;
          manifestEtag = '"etag-3"';
          return manifestEtag;
        },
        readManifest: async () => ({ fileId: "manifest", bytes: manifestBytes, etag: manifestEtag }),
      },
      validate: () => true,
      validateManifest: (value) => {
        const parsed = JSON.parse(new TextDecoder().decode(value));
        return { writerEpoch: parsed.writer_epoch, latest: parsed.latest, previous: parsed.previous };
      },
      nowMs: () => 1,
      candidateId: () => "recovery-attempt",
      recovery: {
        parseSnapshot: async () => ({}),
        localIsEmpty: async () => true,
        prepareMerge: async () => ({ token: "merge", ownerSummary: "owner", adoptionRequired: false }),
        restore: async () => { events.push("restore"); return { state: "ready" as const }; },
        commitMerge: async () => ({ state: "ready" as const }),
      },
    });

    await expect(coordinator.connect()).resolves.toEqual({ status: "quarantined" });
    expect(current.authorityState).toBe("quarantine");
    const prepared = await coordinator.prepareRecovery({ candidate: "latest" });
    await expect(coordinator.commitRecovery({ kind: "empty_direct", attemptId: prepared.attemptId }))
      .resolves.toEqual({ state: "ready" });
    expect(current).toMatchObject({
      authorityState: "active",
      manifestId: "manifest",
      manifestEtag: '"etag-3"',
      writerEpoch: 3,
      statusCode: "idle",
    });
    expect(events).toEqual([
      "quarantine", "checking", "quarantine", "restore_pending",
      "checking", "restore_pending", "restoring", "restore", "finishing", "claim",
      "activate:3", "idle",
    ]);
  });

  it("rejects every stale or invalid replacement writer claim", async () => {
    const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const make = (options: Readonly<{
      writerEpoch?: number;
      rereadNull?: boolean;
      rereadFileId?: string;
      rereadEtag?: string;
      rereadBytes?: Uint8Array;
      activate?: boolean;
    }> = {}) => {
      const writerEpoch = options.writerEpoch ?? 2;
      let state: any = activeState({
        authorityState: "quarantine",
        manifestId: null,
        manifestEtag: null,
        writerEpoch: 0,
      });
      let promoted: Uint8Array = activeManifest(writerEpoch);
      let reads = 0;
      const coordinator = createAutomaticBackupCoordinator({
        isWorkoutActive: () => false,
        capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
        state: {
          read: async () => state,
          persistAttempt: async () => undefined,
          acknowledgeReceipt: async () => false,
          setRecoveryStatus: async () => undefined,
          activateWriter: async () => options.activate ?? true,
        },
        drive: {
          createSnapshot: async () => "snapshot",
          download: async () => new Uint8Array([1]),
          updateManifest: async (_id, value) => { promoted = value; return "next-etag"; },
          readManifest: async () => {
            reads += 1;
            if (reads > 1 && options.rereadNull === true) return null;
            return {
              fileId: reads > 1 ? options.rereadFileId ?? "manifest" : "manifest",
              bytes: reads > 1 ? options.rereadBytes ?? promoted : activeManifest(writerEpoch),
              etag: reads > 1 ? options.rereadEtag ?? "next-etag" : "etag",
            };
          },
        },
        validate: () => true,
        nowMs: () => 1,
        candidateId: () => "attempt",
        recovery: {
          parseSnapshot: async () => ({}),
          localIsEmpty: async () => true,
          prepareMerge: async () => ({ token: "merge", ownerSummary: "owner", adoptionRequired: false }),
          restore: async () => ({ state: "ready" as const }),
          commitMerge: async () => ({ state: "ready" as const }),
        },
      });
      return {
        coordinator,
        mutateState(value: Record<string, unknown>) { state = { ...state, ...value }; },
      };
    };

    for (const stale of [
      { permissionId: "other" },
      { connectionGeneration: 2 },
      { authorityState: "active" },
    ]) {
      const fixture = make();
      const prepared = await fixture.coordinator.prepareRecovery({ candidate: "latest" });
      fixture.mutateState(stale);
      await expect(fixture.coordinator.commitRecovery({ kind: "empty_direct", attemptId: prepared.attemptId }))
        .rejects.toThrow("automatic_recovery_claim_stale");
    }

    const invalidClaims = [
      make({ rereadNull: true }),
      make({ rereadFileId: "other" }),
      make({ rereadEtag: "wrong" }),
      make({ rereadBytes: encoded({ kind: "deleted", successorWriterEpoch: 3, deletedAtMs: 1 }) }),
      make({ rereadBytes: activeManifest(4) }),
      make({ rereadBytes: encoded({ kind: "active", writer_epoch: 3, latest: { fileId: "other", object_sha256: "a".repeat(64) }, previous: null }) }),
    ];
    for (const fixture of invalidClaims) {
      const prepared = await fixture.coordinator.prepareRecovery({ candidate: "latest" });
      await expect(fixture.coordinator.commitRecovery({ kind: "empty_direct", attemptId: prepared.attemptId }))
        .rejects.toThrow("automatic_recovery_claim_invalid");
    }

    const rejectedActivation = make({ activate: false });
    const rejectedPreparation = await rejectedActivation.coordinator.prepareRecovery({ candidate: "latest" });
    await expect(rejectedActivation.coordinator.commitRecovery({ kind: "empty_direct", attemptId: rejectedPreparation.attemptId }))
      .rejects.toThrow("automatic_recovery_claim_stale");

    const overflow = make({ writerEpoch: Number.MAX_SAFE_INTEGER });
    const overflowPreparation = await overflow.coordinator.prepareRecovery({ candidate: "latest" });
    await expect(overflow.coordinator.commitRecovery({ kind: "empty_direct", attemptId: overflowPreparation.attemptId }))
      .rejects.toThrow("automatic_recovery_claim_invalid");
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

    const discoveryStatuses: string[] = [];
    const failedDiscovery = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => activeState({ authorityState: "quarantine" }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
        beginQuarantine: async () => undefined,
        setRecoveryStatus: async (value) => { discoveryStatuses.push(value); },
      },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array(), updateManifest: async () => "etag", readManifest: async () => { throw new Error("offline"); } },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "candidate",
    });
    await expect(failedDiscovery.checkAgain()).resolves.toEqual({ status: "quarantined" });
    expect(discoveryStatuses).toEqual(["checking", "idle"]);

    let rejectDiscovery: (() => void) | undefined;
    const cancelledDiscovery = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => activeState({ authorityState: "quarantine" }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
        beginQuarantine: async () => undefined,
        setRecoveryStatus: async () => undefined,
      },
      drive: {
        createSnapshot: async () => "snapshot",
        download: async () => new Uint8Array(),
        updateManifest: async () => "etag",
        readManifest: async () => new Promise((_resolve, reject) => { rejectDiscovery = () => { reject(new Error("offline")); }; }),
      },
      validate: () => true,
      nowMs: () => 1,
      candidateId: () => "candidate",
    });
    const cancelled = cancelledDiscovery.checkAgain();
    for (let attempt = 0; attempt < 8 && rejectDiscovery === undefined; attempt += 1) await Promise.resolve();
    await cancelledDiscovery.abortChecking();
    rejectDiscovery?.();
    await expect(cancelled).resolves.toEqual({ status: "cancelled" });
  });

  it("covers rejected candidate bytes, anonymous connect, and both recovery activation paths", async () => {
    const candidate = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false, capture: async () => ({ generation: 4, sourceDigest: "a".repeat(64), bytes: new Uint8Array([1]) }),
      state: { read: async () => activeState(), persistAttempt: async () => undefined, acknowledgeReceipt: async () => true },
      drive: { createSnapshot: async () => "snapshot", download: async () => new Uint8Array([1]), updateManifest: async () => "etag", readManifest: async () => ({ bytes: new Uint8Array(), etag: "etag" }) }, validate: () => false, nowMs: () => 1, candidateId: () => "candidate",
    });
    await expect(candidate.backup()).resolves.toEqual({ status: "deferred" });
    await expect(candidate.connect()).resolves.toEqual({ status: "cancelled" });

    const activate = (stateOverrides: Record<string, unknown>, adoptionRequired: boolean, supplyGrant = true) => {
      let state = activeState({ authorityState: "quarantine", ...stateOverrides });
      let manifest: Uint8Array = activeManifest();
      let manifestEtag = "etag";
      return createAutomaticBackupCoordinator({
        isWorkoutActive: () => false, capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
        state: { read: async () => state, persistAttempt: async () => undefined, acknowledgeReceipt: async () => false, beginQuarantine: async () => undefined, activateWriter: async (value) => { state = { ...state, ...value, authorityState: "active" }; return true; }, setRecoveryStatus: async () => undefined },
        drive: { createSnapshot: async () => "snapshot", updateManifest: async (_id, value) => { manifest = value; manifestEtag = "next"; return manifestEtag; }, readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag: manifestEtag }), download: async () => new Uint8Array([1]) },
        validate: () => true, validateManifest: (value) => ({ writerEpoch: JSON.parse(new TextDecoder().decode(value)).writer_epoch }), nowMs: () => 1, candidateId: () => "attempt", recovery: { parseSnapshot: async () => ({}), localIsEmpty: async () => false, prepareMerge: async () => ({ token: "token", ownerSummary: "owner", adoptionRequired }), restore: async () => ({ state: "ready" as const }), commitMerge: async () => ({ state: "ready" as const }), ...(adoptionRequired && supplyGrant ? { freshAdoptionGrant: async () => ({ receiptId: "grant", permissionId: "permission", connectionGeneration: 1, environment: "production" as const, expiresAtMs: 60_000 }) } : {}) },
      });
    };
    await expect(activate({ manifestId: null }, false).recover()).resolves.toEqual({ status: "quarantined" });
    const adopted = activate({}, true); const prepared = await adopted.prepareRecovery({ candidate: "latest" });
    await expect(adopted.commitRecovery({ kind: "merge", attemptId: prepared.attemptId, confirmation: "MERGE", adoptIdentity: true, adoptionGrant: "grant" })).resolves.toEqual({ state: "ready" });
    const missingGrant = activate({}, true, false); const missingPrepared = await missingGrant.prepareRecovery({ candidate: "latest" });
    await expect(missingGrant.commitRecovery({ kind: "merge", attemptId: missingPrepared.attemptId, confirmation: "MERGE", adoptIdentity: true }))
      .rejects.toThrow("automatic_recovery_adoption_grant_invalid");
  });
});
