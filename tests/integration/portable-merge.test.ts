import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createBackupEnvelopeCodec,
  type BackupEnvelopeCryptoPort,
} from "../../src/domains/portability/backupFormat";
import {
  createMergeCommands,
  createMergePreflightStore,
} from "../../src/domains/portability/mergeCommands";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import type { RecoveryBackupPort } from "../../src/platform/sqlite/recoveryBackup";
import {
  createExerciseSearchIndexRepository,
} from "../../src/platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createHistoryProjectionRepository,
} from "../../src/platform/sqlite/repositories/historyProjectionRepository";
import {
  createLogicalBackupRepository,
} from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import {
  createLogicalMergeRepository,
} from "../../src/platform/sqlite/repositories/logicalMergeRepository";
import {
  createRestoreReconciliationRepository,
} from "../../src/platform/sqlite/repositories/restoreReconciliationRepository";
import {
  createSqliteMergeLocalFactsPort,
  createSqliteRestoreCandidateProbe,
  createSqliteRestoreRetainedReferencePort,
  createSqliteRestoreSchemaPort,
} from "../../src/platform/sqlite/repositories/restorePreflightAdapters";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (null | number | string | Uint8Array)[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}

const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) rmSync(directory, { force: true, recursive: true });
  directories.clear();
});

async function openAt(databasePath: string): Promise<SqliteKernel> {
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  return kernel;
}

async function createRuntime(name: string): Promise<Readonly<{ kernel: SqliteKernel; databasePath: string }>> {
  const directory = mkdtempSync(join(tmpdir(), `gym-portable-merge-${name}-`));
  directories.add(directory);
  const databasePath = join(directory, "gym.db");
  const kernel = await openAt(databasePath);
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "portable-merge-integration",
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    }),
  };
  await createMigrationRunner({
    databaseName: databasePath,
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  return { kernel, databasePath };
}

async function seedSession(
  kernel: SqliteKernel,
  input: Readonly<{ id: string; portableId: string; modifiedAtMs: number }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('portable-bundled', NULL, 'bundled', 'catalog', 'portable-bundled', 'Portable bundled', 'load_reps', 1, 1, 'Unspecified', 90, 1)",
    );
    await transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES ('portable-bundled', 'bundled', 'Portable bundled', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)",
    );
    await transaction.execute(
      "INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, active_session_exercise_id, active_set_id, revision, portable_id, merge_modified_at_ms) VALUES (?, NULL, NULL, 'manual', 'completed', '2026-09-20', 'Asia/Singapore', 1, 2, NULL, NULL, 1, ?, ?)",
      [input.id, input.portableId, input.modifiedAtMs],
    );
    await transaction.execute(
      "INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, origin, display_ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, advanced_timing_default_json, default_rest_seconds, target_revision, status, revision) VALUES (?, ?, NULL, 'portable-bundled', 0, 'planned', 0, 'Portable bundled', 'load_reps', 1, 1, '{\"version\":1,\"mode\":\"off\"}', 90, 1, 'completed', 1)",
      [`exercise-${input.id}`, input.id],
    );
    await transaction.execute(
      "INSERT INTO session_sets (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id, source_owned_plan_working_set_target_id, advanced_timing_override_json, advanced_timing_resolved_json, target_load_grams, target_min_reps, target_max_reps, target_json, unit_json, rule_type, rule_version, metric_profile, metric_contract_version, exercise_metric_generation, status, completed_at_ms, revision) VALUES (?, ?, 'working', 0, NULL, NULL, NULL, '{\"version\":1,\"mode\":\"off\"}', 10000, 8, 10, '{}', '{}', 'load_reps', 1, 'load_reps', 1, 1, 'completed', 2, 1)",
      [`set-${input.id}`, `exercise-${input.id}`],
    );
  });
}

function crypto(): BackupEnvelopeCryptoPort {
  return {
    async deriveKey() { return { key: new Uint8Array(32).fill(7) }; },
    async encrypt(input) {
      return {
        ciphertext: input.plaintext.map((value) => value ^ 0xaa),
        tag: new Uint8Array(16).fill(input.aad.byteLength & 0xff),
      };
    },
    async decrypt(input) {
      if (!input.tag.every((value) => value === (input.aad.byteLength & 0xff))) {
        throw new Error("auth");
      }
      return input.ciphertext.map((value) => value ^ 0xaa);
    },
  };
}

const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

function reconciliation(kernel: SqliteKernel) {
  return createRestoreReconciliationRepository(kernel, {
    history: createHistoryProjectionRepository(kernel),
    nowMs: () => 100,
    search: createExerciseSearchIndexRepository(kernel),
  });
}

describe("portable merge integration", () => {
  it("authenticates, commits, relaunches, and deterministically rebuilds an archive-wins session", async () => {
    const archiveRuntime = await createRuntime("archive");
    await seedSession(archiveRuntime.kernel, {
      id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20,
    });
    const archive = await createLogicalBackupRepository(archiveRuntime.kernel).collect({
      createdAtMs: 1,
      snapshotId: "portable-merge-archive",
    });
    const localRuntime = await createRuntime("local");
    await seedSession(localRuntime.kernel, {
      id: "local-session", portableId: "a".repeat(32), modifiedAtMs: 10,
    });
    const localFacts = await createSqliteMergeLocalFactsPort(localRuntime.kernel).read();
    const portableArchive = {
      ...archive,
      tables: {
        ...archive.tables,
        portable_owner_identity: [{ id: 1, owner_namespace: localFacts.ownerNamespace }],
      },
    };
    const bytes = await createBackupEnvelopeCodec(crypto()).seal({
      snapshot: portableArchive,
      password: new TextEncoder().encode("owner-password"),
      salt: new Uint8Array(16).fill(1),
      nonce: new Uint8Array(12).fill(2),
    });
    const commands = createMergeCommands({
      crypto: crypto(),
      files: { readSelectedArchiveAtMost: async () => bytes },
      kdf: { derive: async () => ({ algorithm: "argon2id", bytes: new Uint8Array(32), durationMs: 1, provider: "Bouncy Castle", providerVersion: "1.85.2" }) },
      schema: createSqliteRestoreSchemaPort(localRuntime.kernel),
      retainedReferences: createSqliteRestoreRetainedReferencePort(localRuntime.kernel),
      candidateProbe: createSqliteRestoreCandidateProbe(),
      local: createSqliteMergeLocalFactsPort(localRuntime.kernel),
      sha256,
      store: createMergePreflightStore({ tokenFactory: () => "portable-merge-token" }),
      writer: createLogicalMergeRepository(localRuntime.kernel, { sha256 }),
    });

    const preview = await commands.preflightSecureMerge({ password: "owner-password" });
    expect(preview).toEqual(expect.objectContaining({
      outcome: "ready",
      preview: expect.objectContaining({ archiveWon: 1 }),
    }));
    if (preview.outcome !== "ready") throw new Error("merge_not_ready");
    await expect(commands.commitSecureMerge({
      confirmation: "MERGE",
      token: preview.token,
    })).resolves.toEqual({ state: "rebuild_pending" });

    await localRuntime.kernel.close();
    kernels.delete(localRuntime.kernel);
    const relaunched = await openAt(localRuntime.databasePath);
    await expect(reconciliation(relaunched).reconcileAndRebuild())
      .resolves.toMatchObject({ outcome: "rebuilt", state: "ready" });
    const first = {
      history: await createHistoryProjectionRepository(relaunched).dumpProjectionRows(),
      search: await createExerciseSearchIndexRepository(relaunched).verifyParity(),
      sessions: await relaunched.queryAll("SELECT id, merge_modified_at_ms FROM workout_sessions"),
    };
    await expect(reconciliation(relaunched).reconcileAndRebuild())
      .resolves.toMatchObject({ outcome: "already_ready", state: "ready" });
    expect({
      history: await createHistoryProjectionRepository(relaunched).dumpProjectionRows(),
      search: await createExerciseSearchIndexRepository(relaunched).verifyParity(),
      sessions: await relaunched.queryAll("SELECT id, merge_modified_at_ms FROM workout_sessions"),
    }).toEqual(first);
    expect(first.sessions).toEqual([{ id: "local-session", merge_modified_at_ms: 20 }]);
  });
});
