import {
  BACKUP_LIMITS,
  LOGICAL_BACKUP_TABLE_DEFINITIONS,
  LOGICAL_BACKUP_TABLES,
  type LogicalBackupSnapshot,
} from "./backupContracts";
import {
  createBackupEnvelopeCodec,
  BackupFormatError,
  type BackupEnvelopeCryptoPort,
} from "./backupFormat";
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

export type LogicalRestorePort = Readonly<{
  restore(snapshot: LogicalBackupSnapshot): Promise<Readonly<{
    state: "rebuild_pending";
  }>>;
}>;

type RestoreArchiveFilePort = Readonly<{
  readSelectedArchiveAtMost(maxBytes: number): Promise<Uint8Array | null>;
}>;

export type RestoreReferenceAvailabilityPort = Readonly<{
  availabilityFor(reference: LogicalBackupSnapshot["catalogReferences"][number]): Promise<"available" | "unavailable">;
}>;

export type RestoreRetainedReferencePort = Readonly<{
  /** Answers only for immutable/bundled local identities; never current user-owned rows. */
  hasRetainedIdentity(input: Readonly<{
    table: string;
    columns: readonly string[];
    values: readonly (string | number)[];
  }>): Promise<boolean>;
}>;

export type RestoreCandidateProbePort = Readonly<{
  /** Read-only candidate probe. It must not open a writer or mutate local state. */
  validateCandidate(snapshot: LogicalBackupSnapshot): Promise<void>;
}>;

export class RestoreCandidateProbeError extends Error {
  constructor() {
    super("restore_candidate_invalid");
    this.name = "RestoreCandidateProbeError";
  }
}

export type RestoreSchemaColumn = Readonly<{
  name: string;
  sqliteType: "INTEGER" | "TEXT";
  notNull: boolean;
}>;

/** Read-only local-schema seam; Task 2 never receives it and cannot write through it. */
export type RestoreSchemaPort = Readonly<{
  columnsFor(table: string): Promise<readonly RestoreSchemaColumn[]>;
}>;

export type RestorePreview = Readonly<{
  sourceFormatVersion: number;
  createdAtMs: number;
  replacementCounts: Readonly<Record<string, number>>;
  references: Readonly<{
    internalSnapshotReferences: number;
    requiredLocalBundled: Readonly<{ available: number; unavailable: number }>;
    /** Catalog identities are traceable preview facts, not restore prerequisites. */
    catalogReferences: Readonly<{ available: number; unavailable: number }>;
  }>;
}>;

type StoredRestorePreflight = Readonly<{
  snapshot: LogicalBackupSnapshot;
  preview: RestorePreview;
  digest: string;
}>;

/** Task 2 consumes this handoff once immediately before its writer transaction. */
export type RestorePreflightStore = Readonly<{
  invalidate(): void;
  issue(value: StoredRestorePreflight): string;
  consume(token: string): StoredRestorePreflight | null;
}>;

export type RestoreCommands = Readonly<{
  preflightSecureRestore(input: Readonly<{ password: string }>): Promise<
    | Readonly<{ outcome: "cancelled" }>
    | Readonly<{ outcome: "ready"; token: string; preview: RestorePreview }>
  >;
  commitSecureRestore(input: Readonly<{
    token: string;
    confirmation: string;
  }>): Promise<Readonly<{ state: "rebuild_pending" }>>;
  invalidateSecureRestorePreflight(token: string): void;
}>;

export class RestoreCommandError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-RESTORE01" as const;

  constructor(readonly code: "restore_archive_invalid" | "restore_archive_limit_exceeded" | "restore_archive_unavailable" | "restore_archive_unsupported_version" | "restore_preflight_token_invalid" | "restore_confirmation_invalid" | "restore_commit_failed") {
    super(code);
    this.name = "RestoreCommandError";
  }
}

export type RestoreCommandDependencies = Readonly<{
  crypto: BackupEnvelopeCryptoPort | AesGcmArchivePort;
  files: RestoreArchiveFilePort;
  kdf: PasswordKdfPort;
  schema: RestoreSchemaPort;
  retainedReferences?: RestoreRetainedReferencePort;
  candidateProbe: RestoreCandidateProbePort;
  restorer?: LogicalRestorePort;
  referenceAvailability?: RestoreReferenceAvailabilityPort;
  store: RestorePreflightStore;
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

export const LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS = Object.freeze([15, 16] as const);

type LogicalReference = Readonly<{
  childTable: string;
  childColumns: readonly string[];
  parentTable: string;
  parentColumns: readonly string[];
  allowRetained?: true;
}>;

/** Versioned, explicit pre-write relationship contract for all logical source tables. */
export const LOGICAL_BACKUP_REFERENCE_DEFINITIONS = Object.freeze([
  ["exercises", ["content_pack_id"], "content_packs", ["id"], true], ["plans", ["content_pack_id"], "content_packs", ["id"], true], ["exercise_owner_preferences", ["exercise_id"], "exercise_library_entries", ["exercise_id"], true], ["exercise_aliases", ["exercise_id"], "exercise_library_entries", ["exercise_id"], true], ["exercise_search_terms", ["exercise_id"], "exercise_library_entries", ["exercise_id"], true], ["exercise_taxonomy", ["exercise_id"], "exercise_library_entries", ["exercise_id"], true], ["exercise_taxonomy", ["kind", "slug"], "taxonomy_terms", ["kind", "slug"]], ["metric_profile_migration_events", ["exercise_id"], "exercises", ["id"]], ["exercise_metric_baselines", ["exercise_id"], "exercises", ["id"]],
  ["plan_schedules", ["plan_id"], "plans", ["id"]], ["plan_schedule_bindings", ["schedule_id"], "plan_schedules", ["id"]], ["plan_schedule_bindings", ["plan_day_id"], "plan_days", ["id"]], ["plan_days", ["plan_id"], "plans", ["id"]], ["plan_day_exercises", ["plan_day_id"], "plan_days", ["id"]], ["plan_day_exercises", ["exercise_id", "metric_profile", "metric_contract_version", "exercise_metric_generation"], "exercises", ["id", "metric_profile", "metric_contract_version", "exercise_metric_generation"], true], ["plan_warmup_sets", ["plan_day_exercise_id"], "plan_day_exercises", ["id"]], ["plan_working_set_targets", ["plan_day_exercise_id", "metric_profile", "metric_contract_version", "exercise_metric_generation"], "plan_day_exercises", ["id", "metric_profile", "metric_contract_version", "exercise_metric_generation"]], ["progression_policies", ["plan_day_exercise_id"], "plan_day_exercises", ["id"]], ["progression_recommendations", ["exercise_id"], "exercises", ["id"], true], ["progression_recommendations", ["plan_working_set_target_id"], "plan_working_set_targets", ["id"]],
  ["owned_plan_aggregate_states", ["plan_id"], "plans", ["id"]], ["owned_plan_mutation_requests", ["source_plan_id"], "plans", ["id"], true], ["owned_plan_mutation_requests", ["result_plan_id"], "plans", ["id"]], ["owned_plan_starter_sources", ["plan_id"], "plans", ["id"]], ["owned_plan_starter_sources", ["source_namespace", "template_id", "source_revision"], "starter_plan_sources", ["source_namespace", "template_id", "source_revision"], true], ["owned_plan_day_sources", ["plan_day_id"], "plan_days", ["id"]], ["owned_plan_day_sources", ["plan_id"], "plans", ["id"]], ["owned_plan_day_exercises", ["plan_day_id"], "plan_days", ["id"]], ["owned_plan_day_exercises", ["exercise_id"], "exercise_library_entries", ["exercise_id"], true], ["owned_plan_warmup_sets", ["plan_day_exercise_id"], "owned_plan_day_exercises", ["id"]], ["owned_plan_working_set_targets", ["plan_day_exercise_id"], "owned_plan_day_exercises", ["id"]], ["owned_plan_progression_policies", ["plan_day_exercise_id"], "owned_plan_day_exercises", ["id"]], ["owned_plan_occurrence_sources", ["plan_day_exercise_id"], "owned_plan_day_exercises", ["id"]], ["owned_plan_occurrence_sources", ["plan_day_id"], "plan_days", ["id"]], ["owned_plan_schedules", ["plan_id"], "plans", ["id"]], ["owned_plan_schedule_versions", ["schedule_id"], "owned_plan_schedules", ["id"]], ["owned_plan_schedule_bindings", ["schedule_version_id"], "owned_plan_schedule_versions", ["id"]], ["owned_plan_schedule_bindings", ["plan_day_id"], "plan_days", ["id"]], ["owned_plan_schedule_overrides", ["schedule_id"], "owned_plan_schedules", ["id"]], ["owned_plan_schedule_overrides", ["plan_day_id"], "plan_days", ["id"]], ["owned_plan_schedule_opportunities", ["schedule_id"], "owned_plan_schedules", ["id"]], ["owned_plan_schedule_opportunities", ["schedule_version_id"], "owned_plan_schedule_versions", ["id"]], ["owned_plan_schedule_opportunities", ["plan_day_id"], "plan_days", ["id"]], ["owned_plan_schedule_opportunities", ["session_id"], "workout_sessions", ["id"]], ["owned_plan_schedule_events", ["schedule_id"], "owned_plan_schedules", ["id"]], ["starter_plan_activation_requests", ["selected_plan_id"], "plans", ["id"]], ["starter_plan_activation_requests", ["result_plan_id"], "plans", ["id"]], ["starter_plan_activation_requests", ["result_schedule_id"], "owned_plan_schedules", ["id"]], ["starter_plan_activation_requests", ["source_namespace", "template_id", "source_revision"], "starter_plan_sources", ["source_namespace", "template_id", "source_revision"], true],
  ["workout_sessions", ["plan_id"], "plans", ["id"], true], ["workout_sessions", ["plan_day_id"], "plan_days", ["id"], true], ["workout_sessions", ["active_session_exercise_id"], "session_exercises", ["id"]], ["workout_sessions", ["active_set_id"], "session_sets", ["id"]], ["session_exercises", ["session_id"], "workout_sessions", ["id"]], ["session_exercises", ["source_plan_day_exercise_id"], "plan_day_exercises", ["id"], true], ["session_exercises", ["exercise_id"], "exercises", ["id"], true], ["session_sets", ["session_exercise_id", "metric_profile", "metric_contract_version", "exercise_metric_generation"], "session_exercises", ["id", "metric_profile", "metric_contract_version", "exercise_metric_generation"]], ["session_sets", ["source_plan_working_set_target_id"], "plan_working_set_targets", ["id"], true], ["session_sets", ["source_owned_plan_working_set_target_id"], "owned_plan_working_set_targets", ["id"], true], ["session_rest_states", ["session_id"], "workout_sessions", ["id"]], ["session_rest_states", ["next_set_id"], "session_sets", ["id"]], ["session_undo_snapshots", ["session_id"], "workout_sessions", ["id"]], ["session_undo_snapshots", ["completed_set_id"], "session_sets", ["id"]], ["history_session_overlays", ["session_id"], "workout_sessions", ["id"]], ["history_audit_events", ["session_id"], "workout_sessions", ["id"]], ["owned_progression_recommendations", ["exercise_id"], "exercises", ["id"], true], ["owned_progression_recommendations", ["owned_plan_working_set_target_id"], "owned_plan_working_set_targets", ["id"]],
] .map(([childTable, childColumns, parentTable, parentColumns, allowRetained]) => Object.freeze({ childTable, childColumns, parentTable, parentColumns, ...(allowRetained === true ? { allowRetained: true } : {}) })) as readonly LogicalReference[]);

function invalid(): never {
  throw new RestoreCommandError("restore_archive_invalid");
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function tupleKey(values: readonly unknown[]): string { return JSON.stringify(values); }

function validateDomainInvariants(snapshot: LogicalBackupSnapshot): void {
  const enumValues: ReadonlyArray<readonly [string, string, readonly string[]]> = [["exercises", "origin", ["custom", "copied"]], ["plans", "origin", ["custom", "copied"]], ["workout_sessions", "status", ["in_progress", "completed", "partial", "discarded", "voided", "manual_visit", "zero_sets"]]];
  for (const [table, column, allowed] of enumValues) for (const row of snapshot.tables[table]!) if (row[column] !== undefined && (typeof row[column] !== "string" || !allowed.includes(row[column] as string))) invalid();
  for (const table of LOGICAL_BACKUP_TABLES) for (const row of snapshot.tables[table]!) for (const [column, value] of Object.entries(row)) if (column.endsWith("_json") && typeof value === "string") { try { JSON.parse(value); } catch { invalid(); } }
  for (const [table, column] of [["plans", "is_active"], ["workout_sessions", "status"]] as const) {
    const active = snapshot.tables[table]!.filter((row) => table === "plans" ? row[column] === 1 : row[column] === "in_progress");
    if (active.length > 1) invalid();
  }
}

async function validateRows(
  snapshot: LogicalBackupSnapshot,
  schema: RestoreSchemaPort,
  retained: RestoreRetainedReferencePort | undefined,
): Promise<Readonly<{ internal: number; retained: number }>> {
  if (!(LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(snapshot.schemaVersion)) throw new RestoreCommandError("restore_archive_unsupported_version");
  if (!exactKeys(snapshot.tables, LOGICAL_BACKUP_TABLES)) invalid();
  if (!exactKeys(snapshot.manifest.rowCounts, LOGICAL_BACKUP_TABLES)) invalid();
  if (snapshot.manifest.totalRows !== Object.values(snapshot.manifest.rowCounts).reduce((sum, count) => sum + count, 0)) invalid();

  for (const table of LOGICAL_BACKUP_TABLES) {
    const rows = snapshot.tables[table]!;
    if (snapshot.manifest.rowCounts[table] !== rows.length) invalid();
    const columns = await schema.columnsFor(table);
    if (columns.length === 0 || new Set(columns.map(({ name }) => name)).size !== columns.length) invalid();
    const expectedColumns = columns.map(({ name }) => name);
    const identities = new Set<string>();
    for (const row of rows) {
      if (row === null || Array.isArray(row) || typeof row !== "object") invalid();
      if (!exactKeys(row, expectedColumns)) invalid();
      for (const column of columns) {
        const value = row[column.name];
        if (value === null && !column.notNull) continue;
        if (column.sqliteType === "TEXT" && typeof value === "string") continue;
        if (column.sqliteType === "INTEGER" && typeof value === "number" && Number.isSafeInteger(value)) continue;
        invalid();
      }
      const definition = LOGICAL_BACKUP_TABLE_DEFINITIONS[table as keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS];
      const identity = definition.primaryKey.map((column) => row[column]);
      if (identity.some((value) => (typeof value !== "string" || value.trim().length === 0) && (typeof value !== "number" || !Number.isSafeInteger(value)))) invalid();
      const key = JSON.stringify(identity);
      if (identities.has(key)) invalid();
      identities.add(key);
    }
  }

  validateDomainInvariants(snapshot);
  let internal = 0;
  let retainedCount = 0;
  for (const definition of LOGICAL_BACKUP_REFERENCE_DEFINITIONS) {
    const childRows = snapshot.tables[definition.childTable];
    if (childRows === undefined || childRows.length === 0) continue;
    const parentRows = new Set((snapshot.tables[definition.parentTable] ?? []).map((row) => tupleKey(definition.parentColumns.map((column) => row[column]))));
    for (const row of childRows) {
      const values = definition.childColumns.map((column) => row[column]);
      if (values.every((value) => value === null)) continue;
      if (values.some((value) => value === null || (typeof value !== "string" && typeof value !== "number"))) invalid();
      if (parentRows.has(tupleKey(values))) { internal += 1; continue; }
      if (definition.allowRetained === true && retained !== undefined && await retained.hasRetainedIdentity({ table: definition.parentTable, columns: definition.parentColumns, values: values as readonly (string | number)[] })) { retainedCount += 1; continue; }
      invalid();
    }
  }
  return { internal, retained: retainedCount };
}

async function createPreview(snapshot: LogicalBackupSnapshot, availability: RestoreReferenceAvailabilityPort | undefined, referenceCounts: Readonly<{ internal: number; retained: number }>): Promise<RestorePreview> {
  const referenceFacts = await Promise.all(snapshot.catalogReferences.map(async (reference) => availability?.availabilityFor(reference) ?? "unavailable" as const));
  const availableCatalogReferences = referenceFacts.filter((value) => value === "available").length;
  return Object.freeze({
    sourceFormatVersion: snapshot.version,
    createdAtMs: snapshot.createdAtMs,
    replacementCounts: Object.freeze(Object.fromEntries(LOGICAL_BACKUP_TABLES.filter((table) => snapshot.tables[table]!.length > 0).map((table) => [table, snapshot.tables[table]!.length]))),
    references: Object.freeze({
      internalSnapshotReferences: referenceCounts.internal,
      requiredLocalBundled: Object.freeze({
        available: referenceCounts.retained,
        unavailable: 0,
      }),
      catalogReferences: Object.freeze({
        available: availableCatalogReferences,
        unavailable: referenceFacts.length - availableCatalogReferences,
      }),
    }),
  });
}

function preflightDigest(snapshot: LogicalBackupSnapshot): string {
  return snapshot.snapshotId + ":" + snapshot.createdAtMs + ":" + snapshot.manifest.totalRows;
}

export function createRestorePreflightStore(input: Readonly<{ tokenFactory(): string }>): RestorePreflightStore {
  let active: Readonly<{ token: string; value: StoredRestorePreflight }> | undefined;
  const issued = new Set<string>();
  return Object.freeze({
    invalidate() { active = undefined; },
    issue(value) {
      const token = input.tokenFactory();
      if (token.trim().length === 0 || issued.has(token)) throw new RestoreCommandError("restore_preflight_token_invalid");
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

export function createRestoreCommands(dependencies: RestoreCommandDependencies): RestoreCommands {
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
    async preflightSecureRestore(input) {
      dependencies.store.invalidate();
      if (!validPassword(input.password)) invalid();
      const password = new TextEncoder().encode(input.password);
      let archive: Uint8Array | null | undefined;
      try {
        archive = await dependencies.files.readSelectedArchiveAtMost(BACKUP_LIMITS.maxArchiveBytes + 1);
        if (archive === null) return { outcome: "cancelled" } as const;
        if (!(archive instanceof Uint8Array) || archive.byteLength === 0) invalid();
        if (archive.byteLength > BACKUP_LIMITS.maxArchiveBytes) throw new RestoreCommandError("restore_archive_limit_exceeded");
        const snapshot = await codec.open({ archive, password });
        const referenceCounts = await validateRows(snapshot, dependencies.schema, dependencies.retainedReferences);
        await dependencies.candidateProbe.validateCandidate(snapshot);
        const preview = await createPreview(snapshot, dependencies.referenceAvailability, referenceCounts);
        const token = dependencies.store.issue({ snapshot, preview, digest: preflightDigest(snapshot) });
        return Object.freeze({ outcome: "ready" as const, token, preview });
      } catch (error) {
        dependencies.store.invalidate();
        if (error instanceof RestoreCommandError) throw error;
        if (error instanceof RestoreFilePortError) {
          if (error.code === "limit_exceeded") {
            throw new RestoreCommandError("restore_archive_limit_exceeded");
          }
          throw new RestoreCommandError("restore_archive_invalid");
        }
        if (error instanceof RestoreCandidateProbeError) throw new RestoreCommandError("restore_archive_invalid");
        if (error instanceof BackupFormatError) {
          if (error.code === "backup_archive_unsupported_version") throw new RestoreCommandError("restore_archive_unsupported_version");
          if (error.code === "backup_archive_limit_exceeded") throw new RestoreCommandError("restore_archive_limit_exceeded");
          // The envelope parser cannot distinguish a malformed unauthenticated
          // header from a modified authenticated AAD without creating an oracle.
          throw new RestoreCommandError("restore_archive_unavailable");
        }
        // Archive parse/authentication failures are deliberately indistinguishable.
        // This includes wrong passwords, header/AAD tampering, ciphertext, nonce,
        // and tags, and never exposes archive-derived diagnostics.
        throw new RestoreCommandError("restore_archive_unavailable");
      } finally {
        wipe(password, archive ?? undefined);
      }
    },
    async commitSecureRestore(input) {
      if (input.confirmation !== "REPLACE") {
        throw new RestoreCommandError("restore_confirmation_invalid");
      }
      const preflight = dependencies.store.consume(input.token);
      if (preflight === null || dependencies.restorer === undefined) {
        throw new RestoreCommandError("restore_preflight_token_invalid");
      }
      try {
        return await dependencies.restorer.restore(preflight.snapshot);
      } catch {
        throw new RestoreCommandError("restore_commit_failed");
      }
    },
    invalidateSecureRestorePreflight(token) {
      dependencies.store.consume(token);
    },
  });
}
