import { describe, expect, it, jest } from "@jest/globals";

import { createAutomaticBackupCoordinator } from "../../src/domains/backup/automaticBackupCoordinator";
import { reconstructedDriveManifestBytes } from "../../src/domains/backup/automaticBackupContracts";

describe("automatic Drive backup integration", () => {
  it("reconstructs complete descriptors that remain usable for recovery", async () => {
    const candidate = {
      kind: "current" as const,
      ownerNamespace: "a".repeat(32),
      writerEpoch: 3,
      mutationGeneration: 9,
      createdAtMs: 10,
      snapshotId: "snapshot-latest",
      fileId: "latest",
      objectSha256: "b".repeat(64),
      byteLength: 1,
    };
    const manifest = reconstructedDriveManifestBytes({ latest: candidate, previous: null });
    const parseSnapshot = jest.fn(async () => ({}));
    const coordinator = createAutomaticBackupCoordinator({
      isWorkoutActive: () => false,
      capture: async () => ({ generation: 1, sourceDigest: "a".repeat(64), bytes: new Uint8Array() }),
      state: {
        read: async () => ({ environment: "development-test" as const, permissionId: "p", connectionGeneration: 2, writerEpoch: 2, mutationGeneration: 2, backedUpGeneration: 1, authorityState: "quarantine" as const, manifestId: "manifest" }),
        persistAttempt: async () => undefined,
        acknowledgeReceipt: async () => false,
      },
      drive: {
        createSnapshot: async () => "snapshot",
        download: async () => new Uint8Array([1]),
        updateManifest: async () => "etag",
        readManifest: async () => ({ fileId: "manifest", bytes: manifest, etag: "etag" }),
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

    await expect(coordinator.prepareRecovery({ candidate: "latest" })).resolves.toMatchObject({ kind: "empty_direct" });
    expect(parseSnapshot).toHaveBeenCalledWith(new Uint8Array([1]), {
      fileId: "latest", objectSha256: "b".repeat(64), byteLength: 1,
      snapshotId: "snapshot-latest", writerEpoch: 3, mutationGeneration: 9,
    });
  });
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
