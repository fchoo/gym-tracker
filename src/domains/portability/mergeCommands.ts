import {
  BACKUP_LIMITS,
  type LogicalBackupRow,
  type LogicalBackupSnapshot,
} from "./backupContracts";
import {
  createBackupEnvelopeCodec,
  BackupFormatError,
  type BackupEnvelopeCryptoPort,
} from "./backupFormat";
import {
  RestoreCandidateProbeError,
  type RestoreCandidateProbePort,
  type RestoreRetainedReferencePort,
  type RestoreSchemaPort,
  validateLogicalRestoreSnapshot,
} from "./restoreCommands";
import {
  comparePortableMergeFreshness,
  isOpaquePortableId,
} from "./portableIdentity";
import {
  ARGON2ID_DESCRIPTOR_VERSION,
  ARGON2ID_ITERATIONS,
  ARGON2ID_MEMORY_KIB,
  ARGON2ID_OUTPUT_LENGTH,
  ARGON2ID_PARALLELISM,
  type PasswordKdfPort,
} from "../../platform/crypto/passwordKdf";
import type {
  AesGcmArchivePort,
} from "../../platform/crypto/aesGcmArchivePort";
import {
  RestoreFilePortError,
} from "../../platform/files/expoBackupFilePort";

type MergeArchiveFilePort = Readonly<{
  readSelectedArchiveAtMost(maxBytes: number): Promise<Uint8Array | null>;
}>;

export type MergeLocalFacts = Readonly<{
  ownerNamespace: string;
  schemaVersion: number;
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>;
}>;

export type MergeLocalFactsPort = Readonly<{
  /** Read-only inspection seam. It must never open a SQLite writer. */
  read(): Promise<MergeLocalFacts>;
}>;

export type MergePreview = Readonly<{
  mode: "merge";
  sourceFormatVersion: 2;
  inserted: number;
  duplicates: number;
  archiveWon: number;
  localWon: number;
  conflicts: number;
}>;

export type MergeOperation = Readonly<{
  kind: "insert" | "duplicate" | "archive_won" | "local_won";
  portableId: string;
}>;

export type MergeSessionAggregate = Readonly<{
  session: LogicalBackupRow;
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>;
}>;

export type StoredMergePreflight = Readonly<{
  archiveDigest: string;
  localFingerprint: string;
  operation: MergeOperation;
  snapshot: LogicalBackupSnapshot;
}>;

export type MergePreflightStore = Readonly<{
  invalidate(): void;
  issue(value: StoredMergePreflight): string;
  consume(token: string): StoredMergePreflight | null;
}>;

export type MergeWriterPort = Readonly<{
  /**
   * Runs the selected plan in the repository-owned writer. The implementation
   * must recompute `localFingerprint` from the live transaction before it
   * changes source facts.
   */
  commit(input: StoredMergePreflight): Promise<Readonly<{
    state: "ready" | "rebuild_pending";
  }>>;
}>;

export type SecureMergeCommands = Readonly<{
  preflightSecureMerge(input: Readonly<{ password: string }>): Promise<
    | Readonly<{ outcome: "cancelled" }>
    | Readonly<{ outcome: "ready"; token: string; preview: MergePreview }>
  >;
  commitSecureMerge(input: Readonly<{
    confirmation: string;
    token: string;
  }>): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
  invalidateSecureMergePreflight(token: string): void;
}>;

export class MergeCommandError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-MERGE01" as const;

  constructor(readonly code:
    | "merge_input_invalid"
    | "merge_archive_invalid"
    | "merge_archive_limit_exceeded"
    | "merge_archive_unavailable"
    | "merge_archive_requires_v2"
    | "merge_owner_namespace_conflict"
    | "merge_local_state_invalid"
    | "merge_preflight_token_invalid"
    | "merge_confirmation_invalid"
    | "merge_commit_failed",
  ) {
    super(code);
    this.name = "MergeCommandError";
  }
}

export type MergeCommandDependencies = Readonly<{
  crypto: BackupEnvelopeCryptoPort | AesGcmArchivePort;
  files: MergeArchiveFilePort;
  kdf: PasswordKdfPort;
  schema: RestoreSchemaPort;
  retainedReferences?: RestoreRetainedReferencePort;
  candidateProbe: RestoreCandidateProbePort;
  local: MergeLocalFactsPort;
  sha256(value: string): Promise<string>;
  store: MergePreflightStore;
  writer?: MergeWriterPort;
}>;

function wipe(...buffers: Array<Uint8Array | undefined>): void {
  for (const buffer of buffers) buffer?.fill(0);
}

function validPassword(value: string): boolean {
  const bytes = new TextEncoder().encode(value);
  try {
    return bytes.byteLength >= 1 && bytes.byteLength <= 1_024;
  } finally {
    wipe(bytes);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canonicalMergeValue(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalMergeValue).join(",")}]`;
  }
  if (!isPlainObject(value)) {
    throw new MergeCommandError("merge_local_state_invalid");
  }
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalMergeValue(value[key])}`
  )).join(",")}}`;
}

function archiveDigestInput(archive: Uint8Array): string {
  return Array.from(archive, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type MergeFactSnapshot = Readonly<{
  tables: Readonly<Record<string, readonly LogicalBackupRow[]>>;
}>;

function sessionAggregate(
  snapshot: MergeFactSnapshot,
  session: LogicalBackupRow,
): Readonly<Record<string, readonly LogicalBackupRow[]>> {
  const sessionId = session.id;
  if (typeof sessionId !== "string") {
    throw new MergeCommandError("merge_archive_invalid");
  }
  const tables = snapshot.tables;
  const sessionExercises = tables.session_exercises!.filter(
    (row) => row.session_id === sessionId,
  );
  const exerciseIds = new Set(sessionExercises.map(({ id }) => id));
  const sessionSets = tables.session_sets!.filter(
    (row) => exerciseIds.has(row.session_exercise_id),
  );
  const setIds = new Set(sessionSets.map(({ id }) => id));
  const result: Record<string, readonly LogicalBackupRow[]> = {};
  for (const [table, rows] of Object.entries(tables)) {
    const selected = table === "workout_sessions"
      ? rows.filter((row) => row.id === sessionId)
      : rows.filter((row) => (
        row.session_id === sessionId
        || exerciseIds.has(row.session_exercise_id)
        || setIds.has(row.session_set_id)
        || setIds.has(row.completed_set_id)
      ));
    if (selected.length > 0) result[table] = selected;
  }
  return Object.freeze(result);
}

export function portableMergeSessionAggregate(
  snapshot: MergeFactSnapshot,
  session: LogicalBackupRow,
): MergeSessionAggregate {
  return Object.freeze({
    session,
    tables: sessionAggregate(snapshot, session),
  });
}

export function portableMergeArchiveSessionAggregate(
  snapshot: LogicalBackupSnapshot,
): MergeSessionAggregate {
  const session = archiveSession(snapshot);
  return portableMergeSessionAggregate(snapshot, session);
}

function archiveSession(snapshot: LogicalBackupSnapshot): LogicalBackupRow {
  const rows = snapshot.tables.workout_sessions ?? [];
  if (rows.length !== 1 || !isPlainObject(rows[0])) {
    throw new MergeCommandError("merge_archive_invalid");
  }
  return rows[0];
}

function assertLocalFacts(value: MergeLocalFacts): void {
  if (!isOpaquePortableId(value.ownerNamespace)
    || !Number.isSafeInteger(value.schemaVersion)
    // GTBK v2 merge requires the schema-22 portable identity contract.
    // Earlier schemas may still restore clean, but cannot safely deduplicate.
    || value.schemaVersion < 22
    || !isPlainObject(value.tables)
    || Object.values(value.tables).some((rows) => !Array.isArray(rows))) {
    throw new MergeCommandError("merge_local_state_invalid");
  }
}

export async function resolvePortableMergeOperation(
  snapshot: LogicalBackupSnapshot,
  local: MergeLocalFacts,
  sha256: MergeCommandDependencies["sha256"],
): Promise<MergeOperation> {
  const archive = archiveSession(snapshot);
  const archivePortableId = archive.portable_id as string;
  const matches = (local.tables.workout_sessions ?? []).filter(
    (row) => row.portable_id === archivePortableId,
  );
  if (matches.length === 0) {
    return Object.freeze({ kind: "insert", portableId: archivePortableId });
  }
  if (matches.length !== 1) {
    throw new MergeCommandError("merge_local_state_invalid");
  }
  const current = matches[0]!;
  if (!isOpaquePortableId(current.portable_id)
    || !Number.isSafeInteger(current.merge_modified_at_ms)
    || (current.merge_modified_at_ms as number) < 0) {
    throw new MergeCommandError("merge_local_state_invalid");
  }
  const freshness = comparePortableMergeFreshness(
    { mergeModifiedAtMs: archive.merge_modified_at_ms as number, portableId: archivePortableId },
    { mergeModifiedAtMs: current.merge_modified_at_ms as number, portableId: current.portable_id as string },
  );
  if (freshness > 0) return Object.freeze({ kind: "archive_won", portableId: archivePortableId });
  if (freshness < 0) return Object.freeze({ kind: "local_won", portableId: archivePortableId });

  const [archiveDigest, localDigest] = await Promise.all([
    sha256(canonicalMergeValue(sessionAggregate(snapshot, archive))),
    sha256(canonicalMergeValue(sessionAggregate(local, current))),
  ]);
  if (!/^[a-f0-9]{64}$/u.test(archiveDigest) || !/^[a-f0-9]{64}$/u.test(localDigest)) {
    throw new MergeCommandError("merge_local_state_invalid");
  }
  if (archiveDigest === localDigest) {
    return Object.freeze({ kind: "duplicate", portableId: archivePortableId });
  }
  return archiveDigest > localDigest
    ? Object.freeze({ kind: "archive_won", portableId: archivePortableId })
    : Object.freeze({ kind: "local_won", portableId: archivePortableId });
}

function previewFor(operation: MergeOperation): MergePreview {
  return Object.freeze({
    mode: "merge",
    sourceFormatVersion: 2,
    inserted: operation.kind === "insert" ? 1 : 0,
    duplicates: operation.kind === "duplicate" ? 1 : 0,
    archiveWon: operation.kind === "archive_won" ? 1 : 0,
    localWon: operation.kind === "local_won" ? 1 : 0,
    conflicts: 0,
  });
}

export function createMergePreflightStore(
  input: Readonly<{ tokenFactory(): string }>,
): MergePreflightStore {
  let active: Readonly<{ token: string; value: StoredMergePreflight }> | undefined;
  const issued = new Set<string>();
  return Object.freeze({
    invalidate() { active = undefined; },
    issue(value) {
      const token = input.tokenFactory();
      if (token.trim().length === 0 || issued.has(token)) {
        throw new MergeCommandError("merge_preflight_token_invalid");
      }
      issued.add(token);
      active = Object.freeze({ token, value });
      return token;
    },
    consume(token) {
      if (active?.token !== token) return null;
      const value = active.value;
      active = undefined;
      return value;
    },
  });
}

export function createMergeCommands(
  dependencies: MergeCommandDependencies,
): SecureMergeCommands {
  const codec = createBackupEnvelopeCodec({
    async deriveKey({ password, salt }) {
      const result = await dependencies.kdf.derive(password, {
        algorithm: "argon2id",
        iterations: ARGON2ID_ITERATIONS,
        memoryKiB: ARGON2ID_MEMORY_KIB,
        outputLength: ARGON2ID_OUTPUT_LENGTH,
        parallelism: ARGON2ID_PARALLELISM,
        salt,
        version: ARGON2ID_DESCRIPTOR_VERSION,
      });
      return { key: result.bytes };
    },
    encrypt: dependencies.crypto.encrypt,
    decrypt: dependencies.crypto.decrypt,
  });

  return Object.freeze({
    async preflightSecureMerge(input) {
      dependencies.store.invalidate();
      if (!validPassword(input.password)) {
        throw new MergeCommandError("merge_input_invalid");
      }
      const password = new TextEncoder().encode(input.password);
      let archive: Uint8Array | null | undefined;
      try {
        archive = await dependencies.files.readSelectedArchiveAtMost(
          BACKUP_LIMITS.maxArchiveBytes + 1,
        );
        if (archive === null) return { outcome: "cancelled" } as const;
        if (!(archive instanceof Uint8Array) || archive.byteLength === 0) {
          throw new MergeCommandError("merge_archive_invalid");
        }
        if (archive.byteLength > BACKUP_LIMITS.maxArchiveBytes) {
          throw new MergeCommandError("merge_archive_limit_exceeded");
        }
        const snapshot = await codec.open({ archive, password });
        if (snapshot.version !== 2) {
          throw new MergeCommandError("merge_archive_requires_v2");
        }
        await validateLogicalRestoreSnapshot(
          snapshot,
          dependencies.schema,
          dependencies.retainedReferences,
        );
        await dependencies.candidateProbe.validateCandidate(snapshot);
        const local = await dependencies.local.read();
        assertLocalFacts(local);
        const archiveNamespace = snapshot.tables.portable_owner_identity?.[0]?.owner_namespace;
        if (archiveNamespace !== local.ownerNamespace) {
          throw new MergeCommandError("merge_owner_namespace_conflict");
        }
        const [operation, archiveDigest, localFingerprint] = await Promise.all([
          resolvePortableMergeOperation(snapshot, local, dependencies.sha256),
          dependencies.sha256(archiveDigestInput(archive)),
          dependencies.sha256(canonicalMergeValue(local)),
        ]);
        if (!/^[a-f0-9]{64}$/u.test(archiveDigest)
          || !/^[a-f0-9]{64}$/u.test(localFingerprint)) {
          throw new MergeCommandError("merge_local_state_invalid");
        }
        const token = dependencies.store.issue(Object.freeze({
          archiveDigest,
          localFingerprint,
          operation,
          snapshot,
        }));
        return Object.freeze({
          outcome: "ready" as const,
          token,
          preview: previewFor(operation),
        });
      } catch (error) {
        dependencies.store.invalidate();
        if (error instanceof MergeCommandError) throw error;
        if (error instanceof RestoreFilePortError) {
          if (error.code === "limit_exceeded") {
            throw new MergeCommandError("merge_archive_limit_exceeded");
          }
          throw new MergeCommandError("merge_archive_invalid");
        }
        if (error instanceof BackupFormatError) {
          if (error.code === "backup_archive_limit_exceeded") {
            throw new MergeCommandError("merge_archive_limit_exceeded");
          }
          throw new MergeCommandError("merge_archive_unavailable");
        }
        if (error instanceof RestoreCandidateProbeError) {
          throw new MergeCommandError("merge_archive_invalid");
        }
        throw new MergeCommandError("merge_archive_unavailable");
      } finally {
        wipe(password, archive ?? undefined);
      }
    },
    async commitSecureMerge(input) {
      if (input.confirmation !== "MERGE") {
        throw new MergeCommandError("merge_confirmation_invalid");
      }
      const preflight = dependencies.store.consume(input.token);
      if (preflight === null || dependencies.writer === undefined) {
        throw new MergeCommandError("merge_preflight_token_invalid");
      }
      try {
        return await dependencies.writer.commit(preflight);
      } catch {
        throw new MergeCommandError("merge_commit_failed");
      }
    },
    invalidateSecureMergePreflight(token) {
      dependencies.store.consume(token);
    },
  });
}
