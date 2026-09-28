export const AUTOMATIC_BACKUP_LIMITS = Object.freeze({ maxManifestBytes: 16 * 1024 });

export type AutomaticBackupEnvironment = "production" | "development-test";
export type DriveBackupSnapshotHeaderV1 = Readonly<{
  protocol: "drive-backup-v1"; environment: AutomaticBackupEnvironment; packageIdentity: string;
  snapshotId: string; ownerNamespace: string; writerEpoch: number; mutationGeneration: number;
  createdAtMs: number; schemaVersion: number;
}>;
export type DriveBackupSnapshotV1 = Readonly<{
  header: DriveBackupSnapshotHeaderV1; payload: unknown; payload_sha256: string;
}>;
export type DriveBackupObjectDescriptorV1 = Readonly<{ fileId: string; object_sha256: string }>;
export type DriveBackupManifestV1 = Readonly<
  | { kind: "active"; writerEpoch: number; latest: DriveBackupObjectDescriptorV1; previous: DriveBackupObjectDescriptorV1 | null }
  | { kind: "deleted"; successorWriterEpoch: number; deletedAtMs: number }
>;

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!plain(value)) throw new Error("automatic_backup_contract_invalid");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function descriptor(value: unknown): value is DriveBackupObjectDescriptorV1 {
  return plain(value) && Object.keys(value).length === 2 && typeof value.fileId === "string" && value.fileId.length > 0 && digest(value.object_sha256);
}
export function createDriveBackupSnapshotV1(input: Readonly<{ header: DriveBackupSnapshotHeaderV1; payload: unknown; sha256(value: string): string }>): DriveBackupSnapshotV1 {
  return Object.freeze({ header: input.header, payload: input.payload, payload_sha256: input.sha256(canonicalJson({ header: input.header, payload: input.payload })) });
}
export function parseDriveBackupManifestV1(value: unknown): DriveBackupManifestV1 {
  if (!plain(value) || new TextEncoder().encode(canonicalJson(value)).byteLength > AUTOMATIC_BACKUP_LIMITS.maxManifestBytes) throw new Error("automatic_backup_manifest_invalid");
  const writerEpoch = value.writer_epoch;
  if (value.kind === "active" && Object.keys(value).length === 4
    && typeof writerEpoch === "number" && Number.isSafeInteger(writerEpoch) && writerEpoch >= 1
    && descriptor(value.latest) && (value.previous === null || descriptor(value.previous))) {
    return Object.freeze({ kind: "active", writerEpoch, latest: value.latest, previous: value.previous });
  }
  const successorWriterEpoch = value.successorWriterEpoch;
  const deletedAtMs = value.deletedAtMs;
  if (value.kind === "deleted" && Object.keys(value).length === 3 && typeof successorWriterEpoch === "number" && Number.isSafeInteger(successorWriterEpoch) && successorWriterEpoch >= 0 && typeof deletedAtMs === "number" && Number.isSafeInteger(deletedAtMs) && deletedAtMs >= 0) return Object.freeze({ kind: "deleted", successorWriterEpoch, deletedAtMs });
  throw new Error("automatic_backup_manifest_invalid");
}
