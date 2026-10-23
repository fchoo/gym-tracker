import {
  logicalBackupTablesForVersion, LOGICAL_BACKUP_TABLE_DEFINITIONS, parseLogicalBackupSnapshot,
  type LogicalBackupSnapshot, type LogicalBackupRow,
} from "../domains/portability/backupContracts";
import { createBackupEnvelopeCodec } from "../domains/portability/backupFormat";
import { createRestoreCommands, createRestorePreflightStore } from "../domains/portability/restoreCommands";
import { createLogicalRestoreRepository } from "../platform/sqlite/repositories/logicalRestoreRepository";
import {
  createSqliteRestoreSchemaPort, createSqliteRestoreRetainedReferencePort,
  createSqliteRestoreCatalogReferenceAvailabilityPort, createSqliteRestoreCandidateProbe,
} from "../platform/sqlite/repositories/restorePreflightAdapters";
import { LOGICAL_BACKUP_TABLE_FILTERS } from "../platform/sqlite/repositories/logicalBackupRepository";
import { migrations, CURRENT_SCHEMA_VERSION } from "../platform/sqlite/migrations";
import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";
import type { AesGcmArchivePort } from "../platform/crypto/aesGcmArchivePort";
import type { PasswordKdfPort } from "../platform/crypto/passwordKdf";

const NONCE = /^[a-f0-9]{32}$/u;
const HASH = /^[a-f0-9]{64}$/u;
export const ROLLBACK_SYNTHETIC_PASSWORD = "public-synthetic-rollback-only";
export const ROLLBACK_NATIVE_ROUTE = "/__v12-recovery-archive";
function fail(code: string): never { throw new Error(`v12_rollback_${code}`); }

export type RollbackBridgePorts = Readonly<{
  open(name: string, fresh: boolean): Promise<SqliteKernel>;
  remove(name: string): Promise<void>;
  crypto: AesGcmArchivePort;
  kdf: PasswordKdfPort;
  digest(bytes: Uint8Array): Promise<string>;
  random(length: number): Uint8Array;
}>;
export type RollbackNativeIdentity = Readonly<{
  packageName?: unknown; buildProfile?: unknown; nativeContractsEnabled?: unknown; suite?: unknown;
}>;
export type RollbackArm = Readonly<{
  schema_version: 1; route_id: "v12-rollback-bridge"; phase: "create" | "restore"; nonce: string;
  run_id: string; source_tree_sha256: string; apk_sha256: string; device_identity_sha256: string;
  lease_id_sha256: string; archive_sha256: string; declared_schema_version: 22; expires_at_ms: number;
}>;

export function rollbackNativeEnabled(identity: RollbackNativeIdentity): boolean {
  return identity.packageName === "com.fchoo.gymtracker.devtest" && identity.buildProfile === "development-test"
    && identity.nativeContractsEnabled === true && identity.suite === "v1.2-acceptance";
}

export function validateRollbackArm(value: unknown, nonce: unknown, nowMs: number): RollbackArm {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("arm_invalid");
  const arm = value as RollbackArm;
  const keys = ["schema_version", "route_id", "phase", "nonce", "run_id", "source_tree_sha256", "apk_sha256",
    "device_identity_sha256", "lease_id_sha256", "archive_sha256", "declared_schema_version", "expires_at_ms"];
  if (Object.keys(arm).length !== keys.length || !keys.every(key => Object.hasOwn(arm, key))
    || arm.schema_version !== 1 || arm.route_id !== "v12-rollback-bridge" || !["create", "restore"].includes(arm.phase)
    || typeof nonce !== "string" || !NONCE.test(nonce) || arm.nonce !== nonce
    || typeof arm.run_id !== "string" || !/^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(arm.run_id)
    || ![arm.source_tree_sha256, arm.apk_sha256, arm.device_identity_sha256, arm.lease_id_sha256, arm.archive_sha256].every(hash => typeof hash === "string" && HASH.test(hash))
    || arm.declared_schema_version !== 22 || !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(arm.expires_at_ms)
    || arm.expires_at_ms <= nowMs || arm.expires_at_ms > nowMs + 5 * 60_000) fail("arm_invalid");
  return arm;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(stable(value));

async function integrity(kernel: SqliteKernel): Promise<void> {
  const rows = await kernel.queryAll("PRAGMA integrity_check");
  const foreign = await kernel.queryAll("PRAGMA foreign_key_check");
  if (rows.length !== 1 || Object.values(rows[0]!).length !== 1 || Object.values(rows[0]!)[0] !== "ok" || foreign.length !== 0) fail("restore_facts_invalid");
}

/** Only a proven empty, newly opened synthetic database is initialized. No production upgrade or hooks run. */
async function initialize(kernel: SqliteKernel, version: number): Promise<void> {
  const existing = await kernel.queryAll("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  if (existing.length !== 0) fail("clean_target_required");
  for (const migration of migrations.filter(item => item.version <= version)) {
    await kernel.write(async transaction => {
      await migration.up(transaction); await migration.verify(transaction);
      await transaction.execute(`PRAGMA user_version = ${migration.version}`);
    });
  }
  await integrity(kernel);
}

async function tablesFor(kernel: SqliteKernel, tables: readonly string[]): Promise<Record<string, readonly LogicalBackupRow[]>> {
  if (kernel.readSnapshot === undefined) fail("snapshot_required");
  return kernel.readSnapshot(async transaction => {
    const result: Record<string, readonly LogicalBackupRow[]> = {};
    for (const table of tables) {
      const name = table as keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS;
      const order = LOGICAL_BACKUP_TABLE_DEFINITIONS[name].primaryKey.map(key => `"${key}"`).join(", ");
      result[table] = await transaction.queryAll<LogicalBackupRow>(`SELECT * FROM "${table}" WHERE ${LOGICAL_BACKUP_TABLE_FILTERS[name]} ORDER BY ${order}`);
    }
    return result;
  });
}

/** Production writer/parser/repository; host tests may inject genuine host primitives, never native receipts. */
export async function executeRollbackBridge(input: Readonly<{
  nonce: string; phase: "create" | "restore"; archive?: Uint8Array | undefined;
}>, ports: RollbackBridgePorts) {
  if (!NONCE.test(input.nonce) || !["create", "restore"].includes(input.phase)) fail("arguments_invalid");
  let source: SqliteKernel | undefined; let target: SqliteKernel | undefined;
  const created: string[] = [];
  const sourceName = `v12-rollback-source-${input.nonce}.db`; const targetName = `v12-rollback-target-${input.nonce}.db`;
  let failure: Error | undefined; let result;
  try {
    let archive: Uint8Array | undefined = input.archive?.slice();
    if (input.phase === "create") {
      source = await ports.open(sourceName, true); created.push(sourceName);
      await initialize(source, 22);
      await source.write(transaction => transaction.execute(
        "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES ('appearance.theme', 1, '\"dark\"', 1, 1)",
      ));
      const tables = await tablesFor(source, logicalBackupTablesForVersion(2, 22));
      const rowCounts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]));
      const snapshot = parseLogicalBackupSnapshot({ version: 2, schemaVersion: 22, snapshotId: "synthetic-rollback-v2",
        createdAtMs: 1, catalogReferences: [], tables, manifest: { catalogReferenceCount: 0, rowCounts,
          totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0) } });
      archive = await createBackupEnvelopeCodec({
        async deriveKey({ password, salt }) {
          return { key: (await ports.kdf.derive(password, { algorithm: "argon2id", iterations: 2, memoryKiB: 19_456,
            outputLength: 32, parallelism: 1, salt, version: 1 })).bytes };
        }, encrypt: ports.crypto.encrypt, decrypt: ports.crypto.decrypt,
      }).seal({ snapshot, password: new TextEncoder().encode(ROLLBACK_SYNTHETIC_PASSWORD), salt: ports.random(16), nonce: ports.random(12) });
    }
    if (!(archive instanceof Uint8Array) || archive.length < 26 || archive.length > 32 * 1024 * 1024 || archive[4] !== 2) fail("archive_invalid");
    const archiveBytes = archive;
    const archiveSha256 = await ports.digest(archiveBytes);
    target = await ports.open(targetName, true); created.push(targetName);
    await initialize(target, CURRENT_SCHEMA_VERSION);
    let authenticated: LogicalBackupSnapshot | undefined;
    const restorer = createLogicalRestoreRepository(target, { nowMs: () => 2 });
    const commands = createRestoreCommands({ crypto: ports.crypto, kdf: ports.kdf,
      files: { readSelectedArchiveAtMost: async () => archiveBytes.slice() }, schema: createSqliteRestoreSchemaPort(target),
      retainedReferences: createSqliteRestoreRetainedReferencePort(target),
      referenceAvailability: createSqliteRestoreCatalogReferenceAvailabilityPort(target), candidateProbe: createSqliteRestoreCandidateProbe(),
      store: createRestorePreflightStore({ tokenFactory: () => input.nonce }),
      restorer: { async restore(snapshot) { authenticated = snapshot; return restorer.restore(snapshot); } },
    });
    const preflight = await commands.preflightSecureRestore({ password: ROLLBACK_SYNTHETIC_PASSWORD });
    if (preflight.outcome !== "ready") fail("archive_invalid");
    await commands.commitSecureRestore({ token: preflight.token, confirmation: "REPLACE" });
    if (authenticated === undefined || authenticated.version !== 2 || authenticated.schemaVersion !== 22) fail("schema_boundary_invalid");
    const sourceFactsSha256 = await ports.digest(bytes(authenticated.tables));
    const tables = Object.keys(authenticated.tables);
    const postSha256 = await ports.digest(bytes(await tablesFor(target, tables)));
    await integrity(target);
    await target.close(); target = undefined;
    target = await ports.open(targetName, false);
    const reopenedSha256 = await ports.digest(bytes(await tablesFor(target, tables)));
    await integrity(target);
    if (sourceFactsSha256 !== postSha256 || postSha256 !== reopenedSha256) fail("restore_facts_invalid");
    const facts = { schema_version: 1, producer: "v12-canonical-post-restore-facts/v1", archive_sha256: archiveSha256,
      source_schema_version: 22, table_count: tables.length, row_count: authenticated.manifest.totalRows,
      source_facts_sha256: sourceFactsSha256, reopened_facts_sha256: reopenedSha256, integrity_check: "ok", foreign_key_violations: 0 };
    const factsSha256 = await ports.digest(new TextEncoder().encode(`${JSON.stringify(facts)}\n`));
    result = { archive, inspection: { format_version: 2, schema_version: 22, canonical_post_restore_facts: facts,
      clean_restore_receipt: { schema_version: 1, producer: "v12-production-clean-restore-receipt/v1",
        parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands", outcome: "restored", clean_target: true,
        archive_sha256: archiveSha256, archive_format_version: 2, archive_schema_version: 22,
        post_restore_facts_sha256: factsSha256, reopened_post_restore_facts_sha256: factsSha256 } } };
  } catch (error) {
    failure = error instanceof Error && /^v12_rollback_[a-z_]+$/u.test(error.message) ? error : new Error("v12_rollback_archive_invalid");
  }
  for (const kernel of [source, target]) {
    if (kernel !== undefined) {
      try { await kernel.close(); } catch { failure ??= new Error("v12_rollback_cleanup_failed"); }
    }
  }
  for (const name of created) {
    try { await ports.remove(name); } catch { failure ??= new Error("v12_rollback_cleanup_failed"); }
  }
  if (failure !== undefined) throw failure;
  return result!;
}

export function productionRollbackPorts(): RollbackBridgePorts {
  const { File } = require("expo-file-system") as typeof import("expo-file-system");
  const { digest, CryptoDigestAlgorithm, getRandomBytes } = require("expo-crypto") as typeof import("expo-crypto");
  const { openSqliteKernel } = require("../platform/sqlite/sqliteKernel") as typeof import("../platform/sqlite/sqliteKernel");
  const { deleteDatabaseAsync, defaultDatabaseDirectory } = require("expo-sqlite") as typeof import("expo-sqlite");
  const { createAesGcmArchivePort, createExpoAesGcmArchiveDriver } = require("../platform/crypto/aesGcmArchivePort") as typeof import("../platform/crypto/aesGcmArchivePort");
  const { createPasswordKdfPort } = require("../platform/crypto/passwordKdf") as typeof import("../platform/crypto/passwordKdf");
  const owned = new Set<string>();
  const databaseUri = defaultDatabaseDirectory.startsWith("file://") ? defaultDatabaseDirectory : `file://${defaultDatabaseDirectory}`;
  return {
    async open(name, fresh) {
      if (!/^v12-rollback-(?:source|target)-[a-f0-9]{32}\.db$/u.test(name)) fail("arguments_invalid");
      const file = new File(databaseUri, name);
      if (file.exists === fresh || (!fresh && !owned.has(name))) fail("clean_target_required");
      const kernel = await openSqliteKernel(name);
      if (fresh) owned.add(name);
      return kernel;
    },
    async remove(name) {
      if (!owned.has(name)) fail("cleanup_failed");
      await deleteDatabaseAsync(name); owned.delete(name);
    },
    digest: async value => Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(value)))).map(byte => byte.toString(16).padStart(2, "0")).join(""),
    random: getRandomBytes, crypto: createAesGcmArchivePort(createExpoAesGcmArchiveDriver()), kdf: createPasswordKdfPort(),
  };
}

/** One-shot private arm. Output contains only encrypted bytes and hashes/counts, never source rows. */
export async function collectNativeRollbackBridge(identity: RollbackNativeIdentity, nonce: unknown): Promise<void> {
  if (!rollbackNativeEnabled(identity) || typeof nonce !== "string" || !NONCE.test(nonce)) fail("disabled");
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const armFile = new File(Paths.document, `v12-rollback-${nonce}`, "arm.json");
  const consumed = new File(Paths.document, `v12-rollback-${nonce}`, "consumed.json");
  const resultFile = new File(Paths.document, `v12-rollback-${nonce}`, "result.json");
  const stagedResult = new File(Paths.document, `v12-rollback-${nonce}`, "result-staged.json");
  const resultReady = new File(Paths.document, `v12-rollback-${nonce}`, "result.ready");
  if (consumed.exists || resultFile.exists || stagedResult.exists || resultReady.exists) fail("arm_invalid");
  async function publishResult(value: unknown): Promise<void> {
    // Expo move may fall back to copy/delete. Await its completion before exposing
    // the readiness barrier; the host never reads a partially copied result.json.
    stagedResult.write(JSON.stringify(value));
    await stagedResult.move(resultFile);
    resultReady.write("ready");
  }
  const arm = validateRollbackArm(JSON.parse(armFile.textSync()), nonce, Date.now());
  await armFile.move(consumed);
  try {
    const ports = productionRollbackPorts();
    const archive = arm.phase === "restore" ? new File(Paths.document, `v12-rollback-${nonce}`, "incoming.gtbk").bytesSync() : undefined;
    if (archive !== undefined && await ports.digest(archive) !== arm.archive_sha256) fail("archive_invalid");
    const result = await executeRollbackBridge({ nonce, phase: arm.phase, archive }, ports);
    validateRollbackArm(arm, nonce, Date.now());
    const archiveFile = new File(Paths.document, `v12-rollback-${nonce}`, "archive.gtbk");
    if (archiveFile.exists) fail("arm_invalid");
    archiveFile.write(result.archive);
    await publishResult({ schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, inspection: result.inspection });
  } catch (error) {
    const code = error instanceof Error && /^v12_rollback_[a-z_]+$/u.test(error.message) ? error.message : "v12_rollback_failed";
    await publishResult({ schema_version: 1, producer: "v12-native-rollback-bridge/v1", arm, failure: code });
    throw new Error(code);
  }
}
