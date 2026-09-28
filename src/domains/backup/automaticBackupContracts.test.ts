import { createHash } from "node:crypto";

import { describe, expect, it } from "@jest/globals";

import {
  AUTOMATIC_BACKUP_LIMITS,
  canonicalJson,
  createDriveBackupSnapshotV1,
  parseDriveBackupManifestV1,
} from "./automaticBackupContracts";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("automatic backup contracts", () => {
  const header = {
    protocol: "drive-backup-v1" as const,
    environment: "development-test" as const,
    packageIdentity: "com.fchoo.gymtracker.devtest",
    snapshotId: "a".repeat(32),
    ownerNamespace: "b".repeat(32),
    writerEpoch: 1,
    mutationGeneration: 2,
    createdAtMs: 3,
    schemaVersion: 23,
  };
  const payload = { version: 2, tables: {} };

  it("hashes the exact canonical header and payload, excluding the digest field", () => {
    const snapshot = createDriveBackupSnapshotV1({ header, payload, sha256 });
    expect(snapshot.payload_sha256).toBe(sha256(canonicalJson({ header, payload })));
  });

  it("accepts exact active and deleted manifest variants only", () => {
    expect(parseDriveBackupManifestV1({
      kind: "active", writer_epoch: 2, latest: { fileId: "id", object_sha256: "a".repeat(64) }, previous: null,
    })).toMatchObject({ kind: "active", writerEpoch: 2 });
    expect(parseDriveBackupManifestV1({
      kind: "deleted", successorWriterEpoch: 3, deletedAtMs: 4,
    })).toMatchObject({ kind: "deleted" });
    expect(() => parseDriveBackupManifestV1({ kind: "deleted", latest: {} })).toThrow();
  });

  it("rejects a manifest above its strict byte bound", () => {
    expect(() => parseDriveBackupManifestV1({
      kind: "active", writer_epoch: 2, latest: { fileId: "id", object_sha256: "a".repeat(64) },
      previous: "x".repeat(AUTOMATIC_BACKUP_LIMITS.maxManifestBytes),
    })).toThrow();
    expect(() => parseDriveBackupManifestV1({
      kind: "active", latest: { fileId: "id", object_sha256: "a".repeat(64) }, previous: null,
    })).toThrow();
  });
});
