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

  it("canonicalizes every supported JSON shape and rejects non-plain values", () => {
    expect(canonicalJson({ z: [null, true, 2, "x"], a: { b: false } })).toBe('{"a":{"b":false},"z":[null,true,2,"x"]}');
    expect(() => canonicalJson(new Date())).toThrow("automatic_backup_contract_invalid");
  });

  it.each([
    [{ kind: "active", writer_epoch: 0, latest: { fileId: "id", object_sha256: "a".repeat(64) }, previous: null }],
    [{ kind: "active", writer_epoch: 1.5, latest: { fileId: "id", object_sha256: "a".repeat(64) }, previous: null }],
    [{ kind: "active", writer_epoch: 1, latest: { fileId: "", object_sha256: "a".repeat(64) }, previous: null }],
    [{ kind: "active", writer_epoch: 1, latest: { fileId: "id", object_sha256: "A".repeat(64) }, previous: null }],
    [{ kind: "active", writer_epoch: 1, latest: { fileId: "id", object_sha256: "a".repeat(64), extra: true }, previous: null }],
    [{ kind: "deleted", successorWriterEpoch: -1, deletedAtMs: 0 }],
    [{ kind: "deleted", successorWriterEpoch: 0, deletedAtMs: -1 }],
    [{ kind: "deleted", successorWriterEpoch: 0.5, deletedAtMs: 0 }],
  ])("rejects invalid strict manifest data", (manifest) => {
    expect(() => parseDriveBackupManifestV1(manifest)).toThrow("automatic_backup_manifest_invalid");
  });

  it("accepts an exact previous descriptor and a zero epoch tombstone", () => {
    expect(parseDriveBackupManifestV1({
      kind: "active", writer_epoch: 1,
      latest: { fileId: "latest", object_sha256: "a".repeat(64) },
      previous: { fileId: "previous", object_sha256: "b".repeat(64) },
    })).toMatchObject({ kind: "active", previous: { fileId: "previous" } });
    expect(parseDriveBackupManifestV1({ kind: "deleted", successorWriterEpoch: 0, deletedAtMs: 0 })).toMatchObject({ kind: "deleted" });
  });
});
