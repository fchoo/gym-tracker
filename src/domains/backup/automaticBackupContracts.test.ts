import { createHash } from "node:crypto";

import { describe, expect, it } from "@jest/globals";

import {
  AUTOMATIC_BACKUP_LIMITS,
  canonicalJson,
  createDriveBackupSnapshotV1,
  parseDriveBackupManifestV1,
  parseDriveBackupSnapshotEnvelopeV1,
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

  it("validates exact canonical snapshot bytes against the complete descriptor", async () => {
    const snapshot = createDriveBackupSnapshotV1({ header, payload, sha256 });
    const bytes = new TextEncoder().encode(canonicalJson(snapshot));
    await expect(parseDriveBackupSnapshotEnvelopeV1(bytes, {
      byteLength: bytes.byteLength,
      objectSha256: sha256(new TextDecoder().decode(bytes)),
      environment: "development-test",
      packageIdentity: "com.fchoo.gymtracker.devtest",
      currentSchemaVersion: 23,
      sha256: async (value) => sha256(typeof value === "string" ? value : new TextDecoder().decode(value)),
    })).resolves.toMatchObject({ kind: "current", header });
  });

  it("fails closed on noncanonical, unknown, hash, length, and future-schema bytes", async () => {
    const snapshot = createDriveBackupSnapshotV1({ header, payload, sha256 });
    const canonical = canonicalJson(snapshot);
    const parse = (value: string, overrides: Record<string, unknown> = {}) => parseDriveBackupSnapshotEnvelopeV1(
      new TextEncoder().encode(value),
      {
        byteLength: new TextEncoder().encode(value).byteLength,
        objectSha256: sha256(value), environment: "development-test",
        packageIdentity: "com.fchoo.gymtracker.devtest", currentSchemaVersion: 23,
        sha256: async (input) => sha256(typeof input === "string" ? input : new TextDecoder().decode(input)),
        ...overrides,
      },
    );
    await expect(parse(` ${canonical}`)).rejects.toThrow("automatic_recovery_snapshot_invalid");
    await expect(parse(canonical, { byteLength: 1 })).rejects.toThrow("automatic_recovery_snapshot_invalid");
    await expect(parse(canonical, { objectSha256: "f".repeat(64) })).rejects.toThrow("automatic_recovery_snapshot_invalid");
    await expect(parse(canonicalJson({ ...snapshot, extra: true }))).rejects.toThrow("automatic_recovery_snapshot_invalid");
    await expect(parse("null")).rejects.toThrow("automatic_recovery_snapshot_invalid");
    await expect(parse("{" )).rejects.toThrow("automatic_recovery_snapshot_invalid");
    await expect(parse(canonicalJson({ ...snapshot, payload_sha256: "f".repeat(64) })))
      .rejects.toThrow("automatic_recovery_snapshot_invalid");
    const futureHeader = { ...header, schemaVersion: 24 };
    const future = createDriveBackupSnapshotV1({ header: futureHeader, payload, sha256 });
    await expect(parse(canonicalJson(future))).resolves.toMatchObject({ kind: "update_required", header: futureHeader });
  });

  it("accepts only an exact optional descriptor byte length", () => {
    expect(parseDriveBackupManifestV1({
      kind: "active", writer_epoch: 1,
      latest: { fileId: "latest", object_sha256: "a".repeat(64), byteLength: 100 }, previous: null,
    })).toMatchObject({ kind: "active", latest: { byteLength: 100 } });
    expect(() => parseDriveBackupManifestV1({
      kind: "active", writer_epoch: 1,
      latest: { fileId: "latest", object_sha256: "a".repeat(64), byteLength: 0 }, previous: null,
    })).toThrow("automatic_backup_manifest_invalid");
    expect(() => parseDriveBackupManifestV1({
      kind: "active", writer_epoch: 1, latest: null, previous: null,
    })).toThrow("automatic_backup_manifest_invalid");
  });
});
