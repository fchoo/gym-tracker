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
export type DriveBackupObjectDescriptorV1 = Readonly<{
  fileId: string;
  object_sha256: string;
  byteLength?: number;
  snapshotId?: string;
  writerEpoch?: number;
  mutationGeneration?: number;
}>;
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
  const keys = plain(value) ? Object.keys(value).sort().join("\0") : "";
  const legacy = keys === "fileId\0object_sha256" || keys === "byteLength\0fileId\0object_sha256";
  const complete = keys === "byteLength\0fileId\0mutationGeneration\0object_sha256\0snapshotId\0writerEpoch";
  return plain(value) && (legacy || complete)
    && typeof value.fileId === "string" && value.fileId.length > 0 && digest(value.object_sha256)
    && (value.byteLength === undefined || (Number.isSafeInteger(value.byteLength) && (value.byteLength as number) > 0))
    && (!complete || (typeof value.snapshotId === "string" && value.snapshotId.length > 0
      && Number.isSafeInteger(value.writerEpoch) && (value.writerEpoch as number) >= 1
      && Number.isSafeInteger(value.mutationGeneration) && (value.mutationGeneration as number) >= 0));
}
export function createDriveBackupSnapshotV1(input: Readonly<{ header: DriveBackupSnapshotHeaderV1; payload: unknown; sha256(value: string): string }>): DriveBackupSnapshotV1 {
  return Object.freeze({ header: input.header, payload: input.payload, payload_sha256: input.sha256(canonicalJson({ header: input.header, payload: input.payload })) });
}

const HEADER_KEYS = Object.freeze([
  "createdAtMs", "environment", "mutationGeneration", "ownerNamespace", "packageIdentity",
  "protocol", "schemaVersion", "snapshotId", "writerEpoch",
]);

export type ParsedDriveBackupSnapshotEnvelopeV1 = Readonly<{
  kind: "current" | "update_required";
  header: DriveBackupSnapshotHeaderV1;
  payload?: unknown;
}>;

export async function parseDriveBackupSnapshotEnvelopeV1(
  bytes: Uint8Array,
  input: Readonly<{
    byteLength: number;
    objectSha256: string;
    environment: AutomaticBackupEnvironment;
    packageIdentity: string;
    currentSchemaVersion: number;
    sha256(value: string | Uint8Array): Promise<string>;
  }>,
): Promise<ParsedDriveBackupSnapshotEnvelopeV1> {
  const invalid = (): never => { throw new Error("automatic_recovery_snapshot_invalid"); };
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength !== bytes.byteLength
    || !digest(input.objectSha256) || await input.sha256(bytes) !== input.objectSha256) invalid();
  let decoded: unknown;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  try { decoded = JSON.parse(text); } catch { return invalid(); }
  if (!plain(decoded)) invalid();
  const envelope = decoded as Record<string, unknown>;
  if (Object.keys(envelope).sort().join("\0") !== "header\0payload\0payload_sha256"
    || canonicalJson(envelope) !== text || !digest(envelope.payload_sha256) || !plain(envelope.header)) invalid();
  const header = envelope.header as Record<string, unknown>;
  if (Object.keys(header).sort().join("\0") !== HEADER_KEYS.join("\0")
    || header.protocol !== "drive-backup-v1"
    || header.environment !== input.environment
    || header.packageIdentity !== input.packageIdentity
    || typeof header.snapshotId !== "string" || header.snapshotId.length === 0
    || typeof header.ownerNamespace !== "string" || !/^[a-f0-9]{32}$/u.test(header.ownerNamespace)
    || !Number.isSafeInteger(header.writerEpoch) || (header.writerEpoch as number) < 1
    || !Number.isSafeInteger(header.mutationGeneration) || (header.mutationGeneration as number) < 0
    || !Number.isSafeInteger(header.createdAtMs) || (header.createdAtMs as number) < 0
    || !Number.isSafeInteger(header.schemaVersion) || (header.schemaVersion as number) < 1
    || await input.sha256(canonicalJson({ header, payload: envelope.payload })) !== envelope.payload_sha256) invalid();
  const typed = header as unknown as DriveBackupSnapshotHeaderV1;
  return typed.schemaVersion > input.currentSchemaVersion
    ? Object.freeze({ kind: "update_required" as const, header: typed })
    : Object.freeze({ kind: "current" as const, header: typed, payload: envelope.payload });
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
