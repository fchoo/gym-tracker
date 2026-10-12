import {
  afterEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type SqliteConnection,
  type SqliteParameter,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  createEffectRunner,
  EffectExecutionError,
  EFFECT_MAX_ATTEMPTS,
} from "../../src/platform/sqlite/effects/effectRunner";
import {
  createEffectStore,
  enqueuePendingEffect,
} from "../../src/platform/sqlite/effects/effectStore";
import {
  createMigrationRunner,
  type Migration,
  MigrationError,
} from "../../src/platform/sqlite/migrationRunner";
import {
  INITIAL_SCHEMA_STATEMENTS,
  initialMigration,
} from "../../src/platform/sqlite/migrations/0001_initial";
import {
  outcomeEffortMigration,
} from "../../src/platform/sqlite/migrations/0002_outcome_effort";
import {
  exerciseHistoryIndexMigration,
} from "../../src/platform/sqlite/migrations/0003_exercise_history_index";
import {
  WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS,
  workoutRemoveReceiptsMigration,
} from "../../src/platform/sqlite/migrations/0017_workout_remove_receipts";
import {
  WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS,
  workoutRemoveReceiptEntityIdsMigration,
} from "../../src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids";
import {
  SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS,
  sessionExerciseEditingMigration,
} from "../../src/platform/sqlite/migrations/0019_session_exercise_editing";
import {
  SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS,
  SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS,
  sessionExerciseEditReceiptsMigration,
} from "../../src/platform/sqlite/migrations/0020_session_exercise_edit_receipts";
import {
  ADVANCED_SET_TIMING_SCHEMA_STATEMENTS,
  advancedSetTimingMigration,
} from "../../src/platform/sqlite/migrations/0021_advanced_set_timing";
import {
  PORTABLE_OWNER_IDENTITIES_SCHEMA_STATEMENTS,
  PORTABLE_OWNER_IDENTITIES_TRIGGER_STATEMENTS,
  portableOwnerIdentitiesMigration,
} from "../../src/platform/sqlite/migrations/0022_portable_owner_identities";
import {
  migrations as runtimeMigrations,
} from "../../src/platform/sqlite/migrations";
import * as backupContracts from "../../src/domains/portability/backupContracts";
import {
  AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS,
} from "../../src/platform/sqlite/migrations/0023_automatic_drive_backup";
import {
  advancedTimingTargetOwnershipMigration,
} from "../../src/platform/sqlite/migrations/0027_advanced_timing_target_ownership";
import {
  multiPlanRunningFoundationMigration,
} from "../../src/platform/sqlite/migrations/0028_multi_plan_running_foundation";
import { runningSessionRootsMigration } from "../../src/platform/sqlite/migrations/0029_running_session_roots";
import { importedActivityEvidenceMigration } from "../../src/platform/sqlite/migrations/0030_imported_activity_evidence";
import { bodyweightSourceHistoryMigration } from "../../src/platform/sqlite/migrations/0031_bodyweight_source_history";
import { strengthOccurrenceProvenanceMigration } from "../../src/platform/sqlite/migrations/0032_strength_occurrence_provenance";
import { completedSetCorrectionReceiptsMigration } from "../../src/platform/sqlite/migrations/0033_completed_set_correction_receipts";
import { runningActivityMatchLedgerMigration } from "../../src/platform/sqlite/migrations/0034_running_activity_match_ledger";
import { importedActivityLifecycleStateMigration } from "../../src/platform/sqlite/migrations/0035_imported_activity_lifecycle_state";
import {
  SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE,
  sessionExerciseRestDefaultsMigration,
} from "../../src/platform/sqlite/migrations/0036_session_exercise_rest_defaults";

const MIGRATIONS_THROUGH_V18 = runtimeMigrations.filter(
  ({ version }) => version <= 18,
);
const MIGRATIONS_THROUGH_V19 = runtimeMigrations.filter(
  ({ version }) => version <= 19,
);
const MIGRATIONS_THROUGH_V20 = runtimeMigrations.filter(
  ({ version }) => version <= 20,
);
const MIGRATIONS_THROUGH_V21 = runtimeMigrations.filter(
  ({ version }) => version <= 21,
);
const MIGRATIONS_THROUGH_V26 = runtimeMigrations.filter(
  ({ version }) => version <= 26,
);
import {
  createExpoRecoveryBackupPort,
  type RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteKernelTestObserver,
  type SqliteTransactionExecutor,
} from "../../src/platform/sqlite/sqliteKernel";
import {
  runMigrationsEffectsContract,
  MIGRATIONS_EFFECTS_CONTRACT_CASES,
  type MigrationsEffectsContractAdapter,
} from "../../src/testing/contracts/migrationsEffects.contract";
import {
  createLaunchCoordinator,
} from "../../src/bootstrap/launchCoordinator";

class NodePreparedResult<Row extends Record<string, unknown>>
implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync(): Promise<readonly Row[]> {
    return this.rows;
  }
}

class NodePreparedStatement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new NodePreparedResult(
        0,
        0,
        this.statement.all(...parameters) as Row[],
      );
    }

    const result = this.statement.run(...parameters);
    return new NodePreparedResult(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new NodePreparedStatement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

type HostRuntime = Readonly<{
  databasePath: string;
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

const temporaryDirectories = new Set<string>();
const migrations = Object.freeze([
  initialMigration,
  outcomeEffortMigration,
  exerciseHistoryIndexMigration,
]);

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

function fixture(
  name: "v0-empty.sql" | "v1-phase1.sql" | "v27-multi-plan-baseline.sql",
): string {
  return readFileSync(
    join(__dirname, "../migrations/fixtures", name),
    "utf8",
  );
}

async function createHostRuntime(
  fixtureSql = fixture("v0-empty.sql"),
  observer: SqliteKernelTestObserver = {},
): Promise<HostRuntime> {
  const directory = mkdtempSync(join(tmpdir(), "gym-migrations-effects-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(fixtureSql);
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer }, observer);

  return {
    databasePath,
    kernel,
    close: () => kernel.close(),
  };
}

async function userVersion(kernel: SqliteKernel): Promise<number> {
  const [row] = await kernel.queryAll<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? -1;
}

async function completeProtectedV27FixtureSchema(runtime: HostRuntime): Promise<void> {
  const released = await createHostRuntime();
  try {
    await createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel: released.kernel,
      migrations: runtimeMigrations.filter(({ version }) => version <= 27),
      recoveryBackup: validatedBackup(),
    }).run();
    const existingTables = new Set((await runtime.kernel.queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    )).map(({ name }) => name));
    const missingReleasedTables = (await released.kernel.queryAll<{
      name: string;
      sql: string;
    }>(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'table' AND sql LIKE 'CREATE TABLE %'
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'exercise_search_fts%'
       ORDER BY rowid`,
    )).filter(({ name }) => !existingTables.has(name));

    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        "ALTER TABLE automatic_backup_state ADD COLUMN dirty_since_ms INTEGER",
      );
      for (const { sql } of missingReleasedTables) {
        await transaction.execute(sql);
      }
    });
  } finally {
    await released.close();
  }
}

function validatedBackup(): RecoveryBackupPort & {
  createAndValidate: jest.MockedFunction<RecoveryBackupPort["createAndValidate"]>;
} {
  return {
    createAndValidate: jest.fn(async (request) => ({
      backupId: `recovery-${request.fromVersion}-${request.toVersion}`,
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true as const,
    })),
  };
}

const requiredTables = [
  "app_settings",
  "content_packs",
  "exercises",
  "pending_effects",
  "plan_day_exercises",
  "plan_days",
  "plan_schedule_bindings",
  "plan_schedules",
  "plan_warmup_sets",
  "plan_working_set_targets",
  "plans",
  "progression_policies",
  "progression_recommendations",
  "session_exercises",
  "session_rest_states",
  "session_sets",
  "session_undo_snapshots",
  "workout_sessions",
] as const;

describe("Plan 01-06 forward migrations and internal recovery", () => {
  it("upgrades the schema-27 protected baseline to the complete current source graph", async () => {
    const runtime = await createHostRuntime(fixture("v27-multi-plan-baseline.sql"));
    try {
      await completeProtectedV27FixtureSchema(runtime);
      await expect(runtime.kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(automatic_backup_state)",
      )).resolves.toContainEqual(expect.objectContaining({ name: "dirty_since_ms" }));
      const result = await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: runtimeMigrations,
        recoveryBackup: validatedBackup(),
      }).run();

      expect(multiPlanRunningFoundationMigration.version).toBe(28);
      expect(sessionExerciseRestDefaultsMigration.version).toBe(36);
      expect(result).toEqual({
        appliedVersions: [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
        currentVersion: 45,
        recoveryBackup: {
          backupId: "recovery-27-45",
          databaseName: "gym-tracker.db",
          fromVersion: 27,
          toVersion: 45,
          validated: true,
        },
      });
      await expect(userVersion(runtime.kernel)).resolves.toBe(45);
      await expect(runtime.kernel.queryAll<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table'
         AND name IN ('running_plans', 'running_session_slots',
           'imported_activities', 'running_match_events',
           '${SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE}') ORDER BY name`,
      )).resolves.toEqual([
        { name: "imported_activities" },
        { name: "running_match_events" },
        { name: "running_plans" },
        { name: "running_session_slots" },
        { name: SESSION_EXERCISE_REST_DEFAULT_RECEIPTS_TABLE },
      ]);
      await expect(runtime.kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(session_exercises)",
      )).resolves.toContainEqual(expect.objectContaining({
        name: "default_rest_seconds_is_override",
      }));
      await expect(runtime.kernel.queryAll<{ plan_kind: string }>(
        "SELECT plan_kind FROM plans ORDER BY id",
      )).resolves.toEqual([{ plan_kind: "strength" }]);
    } finally {
      await runtime.close();
    }
  });

  it("keeps migration 23 bound to its frozen schema-23 backup source tables", () => {
    const schema23Tables = Reflect.get(
      backupContracts,
      "LOGICAL_BACKUP_SCHEMA_23_TABLES",
    ) as readonly string[] | undefined;

    expect(schema23Tables).toEqual([
      "app_settings",
      "exercise_aliases",
      "exercise_library_entries",
      "exercise_metric_baselines",
      "exercise_owner_preferences",
      "exercise_search_terms",
      "exercise_taxonomy",
      "exercises",
      "history_audit_events",
      "history_session_overlays",
      "metric_profile_migration_events",
      "owned_plan_aggregate_states",
      "owned_plan_day_exercises",
      "owned_plan_day_sources",
      "owned_plan_mutation_requests",
      "owned_plan_occurrence_sources",
      "owned_plan_progression_policies",
      "owned_plan_schedule_bindings",
      "owned_plan_schedule_events",
      "owned_plan_schedule_opportunities",
      "owned_plan_schedule_overrides",
      "owned_plan_schedule_versions",
      "owned_plan_schedules",
      "owned_plan_starter_sources",
      "owned_plan_warmup_sets",
      "owned_plan_working_set_targets",
      "owned_progression_recommendations",
      "plan_day_exercises",
      "plan_days",
      "plan_schedule_bindings",
      "plan_schedules",
      "plan_warmup_sets",
      "plan_working_set_targets",
      "plans",
      "progression_policies",
      "progression_recommendations",
      "session_advanced_timing_states",
      "session_exercises",
      "session_rest_states",
      "session_sets",
      "session_undo_snapshots",
      "starter_plan_activation_requests",
      "taxonomy_terms",
      "workout_session_exercise_edit_receipts",
      "workout_session_exercise_reorder_receipts",
      "workout_sessions",
    ]);
    expect(AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS).toHaveLength(
      schema23Tables!.length * 3,
    );
    expect(AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS.join("\n"))
      .not.toContain("portable_owner_identity");
  });

  it("migrates a fresh v0 database through schema 27 with only schema-23 backup triggers", async () => {
    const runtime = await createHostRuntime();
    try {
      const result = await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: runtimeMigrations.filter(({ version }) => version <= 27),
        recoveryBackup: validatedBackup(),
      }).run();
      const triggerNames = await runtime.kernel.queryAll<{ name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger' AND name LIKE 'automatic_backup_generation_%'
         ORDER BY name`,
      );

      expect(result.currentVersion).toBe(27);
      expect(await userVersion(runtime.kernel)).toBe(27);
      expect(triggerNames.map(({ name }) => name)).toEqual(
        AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS.map((statement) =>
          /CREATE TRIGGER ([a-z0-9_]+)/iu.exec(statement)?.[1],
        ).sort(),
      );
    } finally {
      await runtime.close();
    }
  });

  it("characterizes deterministic protected facts in the synthetic schema-27 baseline", async () => {
    const runtime = await createHostRuntime(fixture("v27-multi-plan-baseline.sql"));
    const digest = async (sql: string) => createHash("sha256")
      .update(JSON.stringify(await runtime.kernel.queryAll(sql)))
      .digest("hex");
    try {
      await expect(runtime.kernel.queryAll("PRAGMA foreign_key_check")).resolves.toEqual([]);
      await expect(runtime.kernel.queryAll("PRAGMA integrity_check"))
        .resolves.toEqual([{ integrity_check: "ok" }]);
      await expect(userVersion(runtime.kernel)).resolves.toBe(27);
      await expect(runtime.kernel.queryAll<{ status: string }>(
        "SELECT status FROM session_advanced_timing_states ORDER BY status",
      )).resolves.toEqual([
        { status: "expired" }, { status: "gap" }, { status: "paused" },
        { status: "ready" }, { status: "running" }, { status: "stopped" },
      ]);
      await expect(Promise.all([
        digest("SELECT id, status, revision, portable_id FROM workout_sessions ORDER BY id"),
        digest("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"),
        digest("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name"),
        digest("PRAGMA foreign_key_check"),
        digest("PRAGMA integrity_check"),
        digest("PRAGMA user_version"),
      ])).resolves.toEqual([
        "f2d786d62501375751ba2e4aa3dce5bd39771eb2ba59f795ba51557485d05083",
        "1db69a674c019a25e36f1886e70ce475adb92d7d640a4416ae0654322341095d",
        "d0395be78328386757d1b170d99e159c7659115d2b12630e0ba23c5ea94acf4a",
        "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
        "e44991bd2fd5f1d12155c8b64148202f5e1a517c669657525dbe5cde7671ef64",
        "2e8b95e23bff9dd2917eab83b2bee5cd1be99b3b208e8017821988676654320f",
      ]);
    } finally {
      await runtime.close();
    }
  });

  it("retains the released manifest prefix while allowing later additive migrations", () => {
    expect(runtimeMigrations.slice(0, 11).map(({ version }) => version)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      8,
      9,
      10,
      11,
      12,
    ]);
    expect(runtimeMigrations.map(({ version }) => version)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
    ]);
    expect(runtimeMigrations.slice(0, 3)).toEqual(migrations);
    expect(initialMigration).toEqual(expect.objectContaining({
      kind: "additive",
      name: "initial",
      version: 1,
    }));
    expect(INITIAL_SCHEMA_STATEMENTS.length).toBeGreaterThanOrEqual(20);
  });

  it("keeps migration 17 immutable before widening removal receipt entity IDs", () => {
    expect(WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS[0]).toContain(
      "length(trim(request_id)) BETWEEN 1 AND 128",
    );
    expect(WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS[0]).toContain(
      "length(trim(session_id)) BETWEEN 1 AND 128",
    );
    expect(WORKOUT_REMOVE_RECEIPT_SCHEMA_STATEMENTS[0]).toContain(
      "length(trim(set_id)) BETWEEN 1 AND 128",
    );
  });

  it("creates a bounded, immutable, foreign-key-free removal receipt schema on clean and schema-17 databases", async () => {
    async function assertReceiptSchema(runtime: HostRuntime) {
      expect(await userVersion(runtime.kernel)).toBe(20);
      const columns = await runtime.kernel.queryAll<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>("PRAGMA table_info(workout_remove_receipts)");
      expect(columns.map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }))).toEqual([
        { name: "request_id", type: "TEXT", notnull: 1, pk: 1 },
        { name: "request_sha256", type: "TEXT", notnull: 1, pk: 0 },
        { name: "operation", type: "TEXT", notnull: 1, pk: 0 },
        { name: "session_id", type: "TEXT", notnull: 1, pk: 0 },
        { name: "set_id", type: "TEXT", notnull: 1, pk: 0 },
        { name: "expected_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
        { name: "expected_set_revision", type: "INTEGER", notnull: 1, pk: 0 },
        { name: "result_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
        { name: "result_json", type: "TEXT", notnull: 1, pk: 0 },
        { name: "committed_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
      ]);
      expect(await runtime.kernel.queryAll(
        "PRAGMA foreign_key_list(workout_remove_receipts)",
      )).toEqual([]);

      const [table] = await runtime.kernel.queryAll<{ sql: string }>(
        `SELECT sql
         FROM sqlite_master
         WHERE type = 'table' AND name = 'workout_remove_receipts'`,
      );
      expect(table?.sql).toEqual(expect.stringContaining("STRICT"));
      expect(table?.sql).toEqual(expect.stringContaining("request_sha256"));
      expect(table?.sql).toEqual(expect.stringContaining("operation IN ('remove_warmup', 'remove_working_set')"));
      expect(table?.sql).toEqual(expect.stringContaining("json_valid(result_json)"));
      expect(table?.sql).toEqual(expect.stringContaining(
        "length(trim(request_id)) BETWEEN 1 AND 128",
      ));
      expect(table?.sql).toEqual(expect.stringContaining(
        "length(trim(session_id)) BETWEEN 1 AND 256",
      ));
      expect(table?.sql).toEqual(expect.stringContaining(
        "length(trim(set_id)) BETWEEN 1 AND 256",
      ));

      async function insertReceipt(input: Readonly<{
        requestId: string;
        sessionId: string;
        setId: string;
      }>) {
        return runtime.kernel.write((transaction) => transaction.execute(
          `INSERT INTO workout_remove_receipts
            (request_id, request_sha256, operation, session_id, set_id,
             expected_session_revision, expected_set_revision,
             result_session_revision, result_json, committed_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.requestId,
            "a".repeat(64),
            "remove_working_set",
            input.sessionId,
            input.setId,
            4,
            2,
            5,
            JSON.stringify({
              outcome: "committed",
              sessionId: input.sessionId,
              setId: input.setId,
              sessionRevision: 5,
            }),
            100,
          ],
        ));
      }

      await insertReceipt({
        requestId: "r".repeat(128),
        sessionId: "s".repeat(256),
        setId: "w".repeat(256),
      });
      await expect(insertReceipt({
        requestId: "r".repeat(129),
        sessionId: "session-request-too-long",
        setId: "set-request-too-long",
      })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(insertReceipt({
        requestId: "remove-session-too-long",
        sessionId: "s".repeat(257),
        setId: "set-session-too-long",
      })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(insertReceipt({
        requestId: "remove-set-too-long",
        sessionId: "session-set-too-long",
        setId: "w".repeat(257),
      })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `INSERT INTO workout_remove_receipts
          (request_id, request_sha256, operation, session_id, set_id,
           expected_session_revision, expected_set_revision,
           result_session_revision, result_json, committed_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "remove-request-invalid",
          "A".repeat(64),
          "remove_working_set",
          "session-1",
          "set-1",
          1,
          1,
          2,
          "{}",
          100,
        ],
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        "UPDATE workout_remove_receipts SET committed_at_ms = 101 WHERE request_id = ?",
        ["r".repeat(128)],
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    }

    const clean = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: clean.kernel,
        migrations: MIGRATIONS_THROUGH_V20,
        recoveryBackup: validatedBackup(),
      }).run();
      await assertReceiptSchema(clean);
    } finally {
      await clean.close();
    }

    const upgraded = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: upgraded.kernel,
        migrations: MIGRATIONS_THROUGH_V18,
        recoveryBackup: validatedBackup(),
      }).run();
      expect(await userVersion(upgraded.kernel)).toBe(18);
      await upgraded.kernel.write((transaction) => transaction.execute(
        `INSERT INTO workout_remove_receipts
          (request_id, request_sha256, operation, session_id, set_id,
           expected_session_revision, expected_set_revision,
           result_session_revision, result_json, committed_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "preserved-v17-receipt",
          "f".repeat(64),
          "remove_warmup",
          "preserved-v17-session",
          "preserved-v17-set",
          1,
          1,
          2,
          JSON.stringify({
            outcome: "committed",
            sessionId: "preserved-v17-session",
            setId: "preserved-v17-set",
            sessionRevision: 2,
          }),
          99,
        ],
      ));
      const backup = validatedBackup();
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: upgraded.kernel,
        migrations: MIGRATIONS_THROUGH_V20,
        recoveryBackup: backup,
      }).run();
      expect(backup.createAndValidate).toHaveBeenCalledWith({
        databaseName: "gym-tracker.db",
        fromVersion: 18,
        toVersion: 20,
      });
      await expect(upgraded.kernel.queryAll(
        "SELECT * FROM workout_remove_receipts WHERE request_id = ?",
        ["preserved-v17-receipt"],
      )).resolves.toEqual([expect.objectContaining({
        request_id: "preserved-v17-receipt",
        session_id: "preserved-v17-session",
        set_id: "preserved-v17-set",
      })]);
      await assertReceiptSchema(upgraded);
    } finally {
      await upgraded.close();
    }
  });

  it("creates schema 19 display metadata before schema 20 rebuilds immutable edit receipts without changing ordinal", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: MIGRATIONS_THROUGH_V18,
        recoveryBackup: validatedBackup(),
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision)
           VALUES ('migration-19-session', NULL, NULL, 'manual', 'in_progress', '2026-09-16', 'Asia/Singapore', 1, NULL, 0)`,
        );
        await transaction.execute(
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision)
           VALUES ('migration-19-exercise', NULL, 'custom', NULL, NULL, 'Migration 19', 'load_reps', 1, 1, 'Unspecified', 90, 1)`,
        );
        await transaction.execute(
          `INSERT INTO session_exercises
            (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, default_rest_seconds, target_revision, status, revision)
           VALUES ('migration-19-session-exercise', 'migration-19-session', NULL, 'migration-19-exercise', 7, 'Migration 19', 'load_reps', 1, 1, 90, 0, 'planned', 0)`,
        );
      });
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: MIGRATIONS_THROUGH_V19,
        recoveryBackup: validatedBackup(),
      }).run();
      expect(await userVersion(runtime.kernel)).toBe(19);
      await expect(runtime.kernel.queryAll(
        "SELECT ordinal, display_ordinal, origin FROM session_exercises WHERE id = 'migration-19-session-exercise'",
      )).resolves.toEqual([{ ordinal: 7, display_ordinal: 7, origin: 'planned' }]);
      const [index] = await runtime.kernel.queryAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'session_exercises_session_display_ordinal_idx'",
      );
      expect(index?.name).toBe("session_exercises_session_display_ordinal_idx");
      await runtime.kernel.write((transaction) => transaction.execute(
        `INSERT INTO workout_session_exercise_edit_receipts
          (request_id, request_sha256, operation, session_id, session_exercise_id, expected_session_revision, result_session_revision, result_json, committed_at_ms)
         VALUES ('migration-19-receipt', ?, 'add_exercise', 'migration-19-session', 'migration-19-session-exercise', 0, 1, '{}', 2)`,
        ['a'.repeat(64)],
      ));
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        "DELETE FROM workout_session_exercise_edit_receipts WHERE request_id = 'migration-19-receipt'",
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      expect(SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS[0]).toContain("modified_from_plan");
      await expect(runtime.kernel.write((transaction) => sessionExerciseEditingMigration.verify(transaction))).resolves.toBeUndefined();
    } finally {
      await runtime.close();
    }
  });

  it("forward-rebuilds v19 edit receipts without retaining the provisional-exercise foreign key", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: MIGRATIONS_THROUGH_V19,
        recoveryBackup: validatedBackup(),
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision)
           VALUES ('migration-20-session', NULL, NULL, 'manual', 'in_progress', '2026-09-16', 'Asia/Singapore', 1, NULL, 0)`,
        );
        await transaction.execute(
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision)
           VALUES ('migration-20-exercise', NULL, 'custom', NULL, NULL, 'Migration 20', 'load_reps', 1, 1, 'Unspecified', 90, 1)`,
        );
        await transaction.execute(
          `INSERT INTO session_exercises
            (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, origin, display_ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, default_rest_seconds, target_revision, status, revision)
           VALUES ('migration-20-subject', 'migration-20-session', NULL, 'migration-20-exercise', 0, 'added', 0, 'Migration 20', 'load_reps', 1, 1, 90, 0, 'planned', 1)`,
        );
        await transaction.execute(
          `INSERT INTO workout_session_exercise_edit_receipts
            (request_id, request_sha256, operation, session_id, session_exercise_id, expected_session_revision, result_session_revision, result_json, committed_at_ms)
           VALUES ('migration-20-legacy', ?, 'add_exercise', 'migration-20-session', 'migration-20-subject', 0, 1, '{"legacy":true}', 2)`,
          ['a'.repeat(64)],
        );
      });
      await runtime.kernel.write((transaction) => sessionExerciseEditReceiptsMigration.up(transaction));
      await runtime.kernel.write((transaction) => sessionExerciseEditReceiptsMigration.verify(transaction));
      await expect(runtime.kernel.queryAll(
        "SELECT request_id, request_sha256, operation, session_id, subject_session_exercise_id, replacement_session_exercise_id, expected_session_revision, result_session_revision, result_json, committed_at_ms FROM workout_session_exercise_edit_receipts",
      )).resolves.toEqual([{
        request_id: 'migration-20-legacy', request_sha256: 'a'.repeat(64), operation: 'add_exercise',
        session_id: 'migration-20-session', subject_session_exercise_id: 'migration-20-subject', replacement_session_exercise_id: null,
        expected_session_revision: 0, result_session_revision: 1, result_json: '{"legacy":true}', committed_at_ms: 2,
      }]);
      await expect(runtime.kernel.queryAll(
        "PRAGMA foreign_key_list(workout_session_exercise_edit_receipts)",
      )).resolves.toEqual([expect.objectContaining({ table: 'workout_sessions' })]);
      await runtime.kernel.write((transaction) => transaction.execute(
        "DELETE FROM session_exercises WHERE id = 'migration-20-subject'",
      ));
      await expect(runtime.kernel.queryAll(
        "SELECT request_id FROM workout_session_exercise_edit_receipts WHERE request_id = 'migration-20-legacy'",
      )).resolves.toEqual([{ request_id: 'migration-20-legacy' }]);
    } finally {
      await runtime.close();
    }
  });

  it("migrates v20 plan and session facts into bounded v21 advanced-timing snapshots", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: MIGRATIONS_THROUGH_V20,
        recoveryBackup: validatedBackup(),
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             metric_profile, metric_contract_version, exercise_metric_generation,
             equipment, default_rest_seconds, revision)
           VALUES ('v21-exercise', NULL, 'custom', NULL, NULL, 'V21 exercise',
                   'load_reps', 1, 1, 'Unspecified', 90, 1)`,
        );
        await transaction.execute(
          `INSERT INTO exercise_library_entries
            (exercise_id, origin, canonical_name, exercise_type, movement_class,
             metric_profile, metric_contract_version, exercise_metric_generation,
             availability, revision)
           VALUES ('v21-exercise', 'custom', 'V21 exercise', 'strength', 'compound',
                   'load_reps', 1, 1, 'available', 1)`,
        );
        await transaction.execute(
          `INSERT INTO plans
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision)
           VALUES ('v21-plan', NULL, 'custom', NULL, NULL, 'V21 plan',
                   1, 'Owner', 'Strength', 45, 'Owner', 0, 1)`,
        );
        await transaction.execute(
          `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
           VALUES ('v21-day', 'v21-plan', 0, 'V21 day', 1)`,
        );
        await transaction.execute(
          `INSERT INTO plan_day_exercises
            (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
             metric_profile, metric_contract_version, exercise_metric_generation, revision)
           VALUES ('v21-legacy-occurrence', 'v21-day', 'v21-exercise', 0, 90,
                   'load_reps', 1, 1, 1)`,
        );
        await transaction.execute(
          `INSERT INTO owned_plan_day_exercises
            (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
             metric_profile, metric_contract_version, exercise_metric_generation, revision)
           VALUES ('v21-owned-occurrence', 'v21-day', 'v21-exercise', 1, 90,
                   'load_reps', 1, 1, 1)`,
        );
        await transaction.execute(
          `INSERT INTO plan_warmup_sets
            (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
           VALUES ('v21-legacy-warmup', 'v21-legacy-occurrence', 0, 20000, 8, 1)`,
        );
        await transaction.execute(
          `INSERT INTO owned_plan_warmup_sets
            (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
           VALUES ('v21-owned-warmup', 'v21-owned-occurrence', 0, 20000, 8, 1)`,
        );
        await transaction.execute(
          `INSERT INTO plan_working_set_targets
            (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
             target_json, unit_json, metric_profile, metric_contract_version,
             exercise_metric_generation, revision)
           VALUES ('v21-legacy-target', 'v21-legacy-occurrence', 0, 40000, 8, 10,
                   '{}', '{}', 'load_reps', 1, 1, 1)`,
        );
        await transaction.execute(
          `INSERT INTO owned_plan_working_set_targets
            (id, plan_day_exercise_id, ordinal, target_json, unit_json, metric_profile,
             metric_contract_version, exercise_metric_generation, revision)
           VALUES ('v21-owned-target', 'v21-owned-occurrence', 0, '{}', '{}',
                   'load_reps', 1, 1, 1)`,
        );
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision)
           VALUES ('v21-session', 'v21-plan', 'v21-day', 'scheduled_day',
                   'in_progress', '2026-09-16', 'Asia/Singapore', 1, NULL, 1)`,
        );
        await transaction.execute(
          `INSERT INTO session_exercises
            (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
             origin, display_ordinal, exercise_name, metric_profile,
             metric_contract_version, exercise_metric_generation, default_rest_seconds,
             target_revision, status, revision)
           VALUES ('v21-session-exercise', 'v21-session', 'v21-legacy-occurrence',
                   'v21-exercise', 0, 'planned', 0, 'V21 exercise', 'load_reps',
                   1, 1, 90, 1, 'active', 1)`,
        );
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id,
             target_load_grams, target_min_reps, target_max_reps, target_json, unit_json,
             rule_type, rule_version, metric_profile, metric_contract_version,
             exercise_metric_generation, status, revision)
           VALUES ('v21-session-set', 'v21-session-exercise', 'working', 0,
                   'v21-legacy-target', 40000, 8, 10, '{}', '{}', 'load_reps', 1,
                   'load_reps', 1, 1, 'planned', 1)`,
        );
      });

      const result = await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: MIGRATIONS_THROUGH_V21,
        recoveryBackup: validatedBackup(),
      }).run();

      expect(result).toEqual(expect.objectContaining({
        appliedVersions: [21],
        currentVersion: 21,
      }));
      await expect(runtime.kernel.queryAll(
        `SELECT advanced_timing_default_json FROM plan_day_exercises
         WHERE id = 'v21-legacy-occurrence'`,
      )).resolves.toEqual([{ advanced_timing_default_json: '{"version":1,"mode":"off"}' }]);
      await expect(runtime.kernel.queryAll(
        `SELECT advanced_timing_default_json FROM owned_plan_day_exercises
         WHERE id = 'v21-owned-occurrence'`,
      )).resolves.toEqual([{ advanced_timing_default_json: '{"version":1,"mode":"off"}' }]);
      await expect(runtime.kernel.queryAll(
        `SELECT advanced_timing_override_json, advanced_timing_resolved_json
         FROM session_sets WHERE id = 'v21-session-set'`,
      )).resolves.toEqual([{
        advanced_timing_override_json: null,
        advanced_timing_resolved_json: '{"version":1,"mode":"off"}',
      }]);

      const perRep = '{"version":1,"mode":"per_rep","intervalMs":1000,"cueChannels":"haptic"}';
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE plan_day_exercises
         SET advanced_timing_default_json = ?
         WHERE id = 'v21-legacy-occurrence'`,
        [perRep],
      ))).resolves.toBeDefined();
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE plan_warmup_sets
         SET advanced_timing_override_json = ?
         WHERE id = 'v21-legacy-warmup'`,
        [perRep],
      ))).resolves.toBeDefined();
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE owned_plan_working_set_targets
         SET advanced_timing_override_json = ?
         WHERE id = 'v21-owned-target'`,
        [perRep],
      ))).resolves.toBeDefined();
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE session_sets
         SET advanced_timing_resolved_json = '{"version":1,"mode":"per_rep","intervalMs":99,"cueChannels":"haptic"}'
         WHERE id = 'v21-session-set'`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE session_sets
         SET advanced_timing_resolved_json = '{"version":1,"mode":"per_rep","intervalMs":1000,"cueChannels":"haptic","unexpected":true}'
         WHERE id = 'v21-session-set'`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE session_sets
         SET advanced_timing_resolved_json = '{"version":1,"mode":"cluster","groupSizes":[3,0],"intraRestMs":1000,"cueChannels":"haptic"}'
         WHERE id = 'v21-session-set'`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE session_sets
         SET advanced_timing_resolved_json = '{"version":1,"mode":"cluster","groupSizes":[50,51],"intraRestMs":1000,"cueChannels":"haptic"}'
         WHERE id = 'v21-session-set'`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `INSERT INTO session_advanced_timing_states
          (session_id, session_set_id, state_version, revision, status, mode, config_json,
           progress_json, started_at_ms, next_boundary_at_ms, remaining_ms, stopped_at_ms)
         VALUES ('v21-session', 'v21-session-set', 1, 2, 'stopped', 'per_rep', ?,
                 '{"nextRepetitionIndex":3}', NULL, NULL, NULL, 5)`,
        [perRep],
      ))).resolves.toBeDefined();
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE session_advanced_timing_states
         SET config_json = '{"version":1,"mode":"off"}'
         WHERE session_id = 'v21-session'`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.queryAll(
        "PRAGMA foreign_key_list(session_advanced_timing_states)",
      )).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ table: "workout_sessions" }),
        expect.objectContaining({ table: "session_sets" }),
      ]));
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `INSERT INTO session_advanced_timing_states
          (session_id, session_set_id, state_version, revision, status, mode, config_json,
           progress_json, started_at_ms, next_boundary_at_ms, remaining_ms, stopped_at_ms)
         VALUES ('missing-session', NULL, 1, 0, 'idle', NULL,
                 '{"version":1,"mode":"off"}', '{}', NULL, NULL, NULL, NULL)`,
      ))).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    } finally {
      await runtime.close();
    }
  });

  it("backfills opaque immutable owner identities in schema 22 and allocates them in root writes", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: MIGRATIONS_THROUGH_V21,
        recoveryBackup: validatedBackup(),
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             metric_profile, metric_contract_version, exercise_metric_generation,
             equipment, default_rest_seconds, revision)
           VALUES ('v22-custom-exercise', NULL, 'custom', NULL, NULL, 'V22 exercise',
                   'load_reps', 1, 1, 'Unspecified', 90, 1)`,
        );
        await transaction.execute(
          `INSERT INTO plans
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision)
           VALUES ('v22-custom-plan', NULL, 'custom', NULL, NULL, 'V22 plan',
                   1, 'Owner', 'Strength', 45, 'Owner', 0, 1)`,
        );
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision)
           VALUES ('v22-session', NULL, NULL, 'manual', 'in_progress',
                   '2026-09-19', 'Asia/Singapore', 19, NULL, 1)`,
        );
      });

      const result = await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: runtimeMigrations,
        recoveryBackup: validatedBackup(),
      }).run();

      expect(result).toEqual({
        appliedVersions: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
        currentVersion: 45,
        recoveryBackup: {
          backupId: "recovery-21-45",
          databaseName: "gym-tracker.db",
          fromVersion: 21,
          toVersion: 45,
          validated: true,
        },
      });
      await expect(runtime.kernel.queryAll(
        "SELECT id, owner_namespace FROM portable_owner_identity",
      )).resolves.toEqual([expect.objectContaining({
        id: 1,
        owner_namespace: expect.stringMatching(/^[a-f0-9]{32}$/u),
      })]);
      await expect(runtime.kernel.queryAll(
        `SELECT portable_id FROM exercises WHERE id = 'v22-custom-exercise'`,
      )).resolves.toEqual([expect.objectContaining({
        portable_id: expect.stringMatching(/^[a-f0-9]{32}$/u),
      })]);
      await expect(runtime.kernel.queryAll(
        `SELECT portable_id FROM plans WHERE id = 'v22-custom-plan'`,
      )).resolves.toEqual([expect.objectContaining({
        portable_id: expect.stringMatching(/^[a-f0-9]{32}$/u),
      })]);
      await expect(runtime.kernel.queryAll(
        `SELECT portable_id, merge_modified_at_ms FROM workout_sessions
         WHERE id = 'v22-session'`,
      )).resolves.toEqual([expect.objectContaining({
        portable_id: expect.stringMatching(/^[a-f0-9]{32}$/u),
        merge_modified_at_ms: 19,
      })]);

      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE exercises SET portable_id = '00000000000000000000000000000000'
         WHERE id = 'v22-custom-exercise'`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE plans SET portable_id = 'not-an-opaque-portable-identity'
         WHERE id = 'v22-custom-plan'`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `UPDATE portable_owner_identity
         SET owner_namespace = '00000000000000000000000000000000'
         WHERE id = 1`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });

      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             metric_profile, metric_contract_version, exercise_metric_generation,
             equipment, default_rest_seconds, revision)
           VALUES ('v22-new-custom-exercise', NULL, 'custom', NULL, NULL, 'V22 new exercise',
                   'load_reps', 1, 1, 'Unspecified', 90, 1)`,
        );
        await transaction.execute(
          `INSERT INTO plans
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision)
           VALUES ('v22-new-custom-plan', NULL, 'custom', NULL, NULL, 'V22 new plan',
                   1, 'Owner', 'Strength', 45, 'Owner', 0, 1)`,
        );
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision)
           VALUES ('v22-new-session', NULL, NULL, 'manual', 'completed',
                   '2026-09-19', 'Asia/Singapore', 20, NULL, 1)`,
        );
      });
      await expect(runtime.kernel.queryAll(
        `SELECT portable_id FROM exercises WHERE id = 'v22-new-custom-exercise'`,
      )).resolves.toEqual([expect.objectContaining({
        portable_id: expect.stringMatching(/^[a-f0-9]{32}$/u),
      })]);
      await expect(runtime.kernel.queryAll(
        `SELECT portable_id FROM plans WHERE id = 'v22-new-custom-plan'`,
      )).resolves.toEqual([expect.objectContaining({
        portable_id: expect.stringMatching(/^[a-f0-9]{32}$/u),
      })]);
      await expect(runtime.kernel.queryAll(
        `SELECT portable_id, merge_modified_at_ms FROM workout_sessions
         WHERE id = 'v22-new-session'`,
      )).resolves.toEqual([expect.objectContaining({
        portable_id: expect.stringMatching(/^[a-f0-9]{32}$/u),
        merge_modified_at_ms: 20,
      })]);
    } finally {
      await runtime.close();
    }
  });

  it.each(PORTABLE_OWNER_IDENTITIES_SCHEMA_STATEMENTS.map((_, index) => index))(
    "rolls back v22 portable owner identities when statement %i fails",
    async (statementIndex) => {
      const runtime = await createHostRuntime();
      try {
        await createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations: MIGRATIONS_THROUGH_V21,
          recoveryBackup: validatedBackup(),
        }).run();
        await expect(createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations: [portableOwnerIdentitiesMigration],
          failureInjector(event) {
            if (event.phase === "after" && event.statementIndex === statementIndex) {
              throw new Error("injected_v22_failure");
            }
          },
        }).run()).rejects.toMatchObject({
          code: "migration_statement_failed",
        });
        expect(await userVersion(runtime.kernel)).toBe(21);
        await expect(runtime.kernel.queryAll(
          `SELECT name FROM sqlite_master
           WHERE name IN ('portable_owner_identity', 'exercises_portable_id_immutable')`,
        )).resolves.toEqual([]);
        await expect(runtime.kernel.queryAll(
          "PRAGMA table_info(workout_sessions)",
        )).resolves.not.toContainEqual(expect.objectContaining({
          name: "portable_id",
        }));
      } finally {
        await runtime.close();
      }
    },
  );

  it.each([
    "missing_column",
    "invalid_owner",
    "invalid_backfill",
    "missing_index",
    "missing_trigger",
    "altered_trigger",
  ] as const)(
    "fails v22 verification when %s is malformed",
    async (scenario) => {
      const triggerNames = [
        "portable_owner_identity_immutable",
        "portable_owner_identity_no_delete",
        "exercises_portable_id_insert_valid",
        "exercises_portable_id_allocate",
        "exercises_portable_id_allocate_on_origin",
        "plans_portable_id_insert_valid",
        "plans_portable_id_allocate",
        "plans_portable_id_allocate_on_origin",
        "workout_sessions_portable_identity_insert_valid",
        "workout_sessions_portable_identity_allocate",
        "exercises_portable_id_valid",
        "plans_portable_id_valid",
        "workout_sessions_portable_id_valid",
        "exercises_portable_id_immutable",
        "plans_portable_id_immutable",
        "workout_sessions_portable_id_immutable",
        "workout_sessions_portable_merge_freshness",
      ];
      const transaction: SqliteTransactionExecutor = {
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        async queryAll<Row extends Record<string, unknown>>(sql: string) {
          if (sql.startsWith("PRAGMA table_info(")) {
            const table = sql.slice("PRAGMA table_info(".length, -1);
            const columns = table === "workout_sessions"
              ? [{ name: "portable_id" }, { name: "merge_modified_at_ms" }]
              : [{ name: "portable_id" }];
            return (scenario === "missing_column" && table === "plans"
              ? []
              : columns) as unknown as readonly Row[];
          }
          if (sql === "SELECT id, owner_namespace FROM portable_owner_identity") {
            const ownerRows = scenario === "invalid_owner"
              ? [{ id: 2, owner_namespace: "bad" }]
              : [{ id: 1, owner_namespace: "0123456789abcdef0123456789abcdef" }];
            return ownerRows as unknown as readonly Row[];
          }
          if (sql.includes("portable_id IS NULL")) {
            const invalidRows = [{ count: scenario === "invalid_backfill" ? 1 : 0 }];
            return invalidRows as unknown as readonly Row[];
          }
          if (sql.includes("FROM sqlite_master")) {
            const indexes = [
              "exercises_portable_id_unique",
              "plans_portable_id_unique",
              "workout_sessions_portable_id_unique",
              "workout_sessions_portable_merge_freshness_idx",
            ].map((name) => ({ name, type: "index", sql: "" }));
            const triggers = triggerNames.map((name, index) => ({
              name,
              type: "trigger",
              sql: scenario === "altered_trigger" && index === 0
                ? "CREATE TRIGGER altered"
                : PORTABLE_OWNER_IDENTITIES_TRIGGER_STATEMENTS[index],
            }));
            const objects = [...indexes, ...triggers];
            return (scenario === "missing_index"
              ? objects.slice(1)
              : scenario === "missing_trigger"
                ? objects.slice(0, -1)
                : objects) as unknown as readonly Row[];
          }
          return [] as readonly Row[];
        },
      };
      await expect(portableOwnerIdentitiesMigration.verify(transaction))
        .rejects.toThrow("portable_owner_identity_schema_incomplete");
    },
  );

  it("accepts a fully shaped v22 owner identity verifier surface", async () => {
    const triggerNames = [
      "portable_owner_identity_immutable",
      "portable_owner_identity_no_delete",
      "exercises_portable_id_insert_valid",
      "exercises_portable_id_allocate",
      "exercises_portable_id_allocate_on_origin",
      "plans_portable_id_insert_valid",
      "plans_portable_id_allocate",
      "plans_portable_id_allocate_on_origin",
      "workout_sessions_portable_identity_insert_valid",
      "workout_sessions_portable_identity_allocate",
      "exercises_portable_id_valid",
      "plans_portable_id_valid",
      "workout_sessions_portable_id_valid",
      "exercises_portable_id_immutable",
      "plans_portable_id_immutable",
      "workout_sessions_portable_id_immutable",
      "workout_sessions_portable_merge_freshness",
    ];
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>(sql: string) {
        if (sql.startsWith("PRAGMA table_info(")) {
          const table = sql.slice("PRAGMA table_info(".length, -1);
          return (table === "workout_sessions"
            ? [{ name: "portable_id" }, { name: "merge_modified_at_ms" }]
            : [{ name: "portable_id" }]) as unknown as readonly Row[];
        }
        if (sql === "SELECT id, owner_namespace FROM portable_owner_identity") {
          const ownerRows = [{
            id: 1,
            owner_namespace: "0123456789abcdef0123456789abcdef",
          }];
          return ownerRows as unknown as readonly Row[];
        }
        if (sql.includes("portable_id IS NULL")) {
          return [{ count: 0 }] as unknown as readonly Row[];
        }
        if (sql.includes("FROM sqlite_master")) {
          return [
            ...[
              "exercises_portable_id_unique",
              "plans_portable_id_unique",
              "workout_sessions_portable_id_unique",
              "workout_sessions_portable_merge_freshness_idx",
            ].map((name) => ({ name, type: "index", sql: "" })),
            ...triggerNames.map((name, index) => ({
              name,
              type: "trigger",
              sql: PORTABLE_OWNER_IDENTITIES_TRIGGER_STATEMENTS[index],
            })),
          ] as unknown as readonly Row[];
        }
        return [] as readonly Row[];
      },
    };
    await expect(portableOwnerIdentitiesMigration.verify(transaction))
      .resolves.toBeUndefined();
  });

  it.each(ADVANCED_SET_TIMING_SCHEMA_STATEMENTS.map((_, index) => index))(
    "rolls back v21 advanced timing when statement %i fails",
    async (statementIndex) => {
      const runtime = await createHostRuntime();
      try {
        await createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations: MIGRATIONS_THROUGH_V20,
          recoveryBackup: validatedBackup(),
        }).run();
        const runner = createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations: [advancedSetTimingMigration],
          failureInjector(event) {
            if (event.phase === "after" && event.statementIndex === statementIndex) {
              throw new Error("injected_v21_failure");
            }
          },
        });
        await expect(runner.run()).rejects.toMatchObject({
          code: "migration_statement_failed",
        });
        expect(await userVersion(runtime.kernel)).toBe(20);
        await expect(runtime.kernel.queryAll(
          "PRAGMA table_info(session_sets)",
        )).resolves.not.toContainEqual(expect.objectContaining({
          name: "advanced_timing_resolved_json",
        }));
        await expect(runtime.kernel.queryAll(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name = 'session_advanced_timing_states'`,
        )).resolves.toEqual([]);
      } finally {
        await runtime.close();
      }
    },
  );

  it.each([
    "missing_column",
    "missing_table",
    "missing_foreign_key",
    "missing_target_foreign_key",
    "missing_index",
  ] as const)(
    "fails v21 verification when %s is malformed",
    async (scenario) => {
      const transaction: SqliteTransactionExecutor = {
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: async <Row extends Record<string, unknown>>(sql: string) => {
          if (sql.startsWith("PRAGMA table_info(")) {
            const table = sql.slice("PRAGMA table_info(".length, -1);
            const expected = new Map([
              ["plan_day_exercises", "advanced_timing_default_json"],
              ["owned_plan_day_exercises", "advanced_timing_default_json"],
              ["plan_warmup_sets", "advanced_timing_override_json"],
              ["plan_working_set_targets", "advanced_timing_override_json"],
              ["owned_plan_warmup_sets", "advanced_timing_override_json"],
              ["owned_plan_working_set_targets", "advanced_timing_override_json"],
              ["session_exercises", "advanced_timing_default_json"],
              ["session_sets", "advanced_timing_override_json"],
            ]);
            const column = expected.get(table);
            const columns = table === "session_sets"
              ? [
                  { name: "advanced_timing_override_json" },
                  { name: "advanced_timing_resolved_json" },
                ]
              : column === undefined ? [] : [{ name: column }];
            return (scenario === "missing_column" && table === "plan_day_exercises"
              ? []
              : columns) as unknown as readonly Row[];
          }
          if (sql.includes("FROM sqlite_master")) {
            return (scenario === "missing_table" ? [] : [
              { name: "session_advanced_timing_states" },
            ]) as unknown as readonly Row[];
          }
          if (sql === "PRAGMA foreign_key_list(session_advanced_timing_states)") {
            const foreignKeys = scenario === "missing_foreign_key"
              ? [{ table: "session_sets" }]
              : scenario === "missing_target_foreign_key"
                ? [{ table: "workout_sessions" }]
                : [
                    { table: "workout_sessions" },
                    { table: "session_sets" },
                  ];
            return foreignKeys as unknown as readonly Row[];
          }
          if (sql === "PRAGMA index_list(session_advanced_timing_states)") {
            return (scenario === "missing_index" ? [] : [
              { name: "session_advanced_timing_states_target_idx" },
            ]) as unknown as readonly Row[];
          }
          return [] as readonly Row[];
        },
      };
      await expect(advancedSetTimingMigration.verify(transaction))
        .rejects.toThrow("advanced_set_timing_schema_incomplete");
    },
  );

  it("accepts a fully shaped v21 schema verifier surface", async () => {
    const columnsByTable = new Map([
      ["plan_day_exercises", "advanced_timing_default_json"],
      ["owned_plan_day_exercises", "advanced_timing_default_json"],
      ["plan_warmup_sets", "advanced_timing_override_json"],
      ["plan_working_set_targets", "advanced_timing_override_json"],
      ["owned_plan_warmup_sets", "advanced_timing_override_json"],
      ["owned_plan_working_set_targets", "advanced_timing_override_json"],
      ["session_exercises", "advanced_timing_default_json"],
    ]);
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>(sql: string) {
        const table = /^PRAGMA table_info\((.+)\)$/u.exec(sql)?.[1];
        if (table !== undefined) {
          const columns = table === "session_sets"
            ? [
                { name: "advanced_timing_override_json" },
                { name: "advanced_timing_resolved_json" },
              ]
            : [{ name: columnsByTable.get(table) }];
          return columns as unknown as readonly Row[];
        }
        if (sql.includes("FROM sqlite_master")) {
          const result = [{ name: "session_advanced_timing_states" }];
          return result as unknown as readonly Row[];
        }
        if (sql === "PRAGMA foreign_key_list(session_advanced_timing_states)") {
          return [
            { table: "workout_sessions" },
            { table: "session_sets" },
          ] as unknown as readonly Row[];
        }
        if (sql === "PRAGMA index_list(session_advanced_timing_states)") {
          const result = [{ name: "session_advanced_timing_states_target_idx" }];
          return result as unknown as readonly Row[];
        }
        return [] as readonly Row[];
      },
    };

    await expect(advancedSetTimingMigration.verify(transaction))
      .resolves.toBeUndefined();
  });

  it("installs advanced-timing ownership triggers when upgrading a real v26 database", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: MIGRATIONS_THROUGH_V26,
        recoveryBackup: validatedBackup(),
      }).run();
      await expect(runtime.kernel.queryAll(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger'
           AND name LIKE 'session_advanced_timing_states_target_session_%'`,
      )).resolves.toEqual([]);

      const result = await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: runtimeMigrations,
        recoveryBackup: validatedBackup(),
      }).run();
      expect(result).toEqual({
        appliedVersions: [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
        currentVersion: 45,
        recoveryBackup: {
          backupId: "recovery-26-45",
          databaseName: "gym-tracker.db",
          fromVersion: 26,
          toVersion: 45,
          validated: true,
        },
      });
      await expect(advancedTimingTargetOwnershipMigration.verify({
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: runtime.kernel.queryAll,
      })).resolves.toBeUndefined();

      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision)
           VALUES ('v27-owner', NULL, NULL, 'manual', 'in_progress',
                   '2026-10-01', 'Asia/Singapore', 1, NULL, 1)`,
        );
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision)
           VALUES ('v27-other', NULL, NULL, 'manual', 'partial',
                   '2026-10-01', 'Asia/Singapore', 2, 3, 1)`,
        );
        await transaction.execute(
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             metric_profile, metric_contract_version, exercise_metric_generation,
             equipment, default_rest_seconds, revision)
           VALUES ('v27-exercise', NULL, 'custom', NULL, NULL, 'V27 exercise',
                   'load_reps', 1, 1, 'Barbell', 90, 1)`,
        );
        await transaction.execute(
          `INSERT INTO session_exercises
            (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
             origin, display_ordinal, exercise_name, metric_profile,
             metric_contract_version, exercise_metric_generation,
             advanced_timing_default_json, default_rest_seconds, target_revision,
             status, revision)
           VALUES ('v27-session-exercise', 'v27-owner', NULL, 'v27-exercise', 0,
                   'added', 0, 'V27 exercise', 'load_reps', 1, 1,
                   '{"version":1,"mode":"off"}', 90, 0, 'active', 1)`,
        );
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal,
             source_plan_working_set_target_id, source_owned_plan_working_set_target_id,
             advanced_timing_override_json, advanced_timing_resolved_json,
             target_load_grams, target_min_reps, target_max_reps, target_json,
             unit_json, rule_type, rule_version, metric_profile,
             metric_contract_version, exercise_metric_generation, status, revision)
           VALUES ('v27-set', 'v27-session-exercise', 'working', 0, NULL, NULL,
                   NULL, '{"version":1,"mode":"per_rep","intervalMs":1000,"cueChannels":"haptic"}',
                   1000, 1, 1, '{}', '{}', 'load_reps', 1, 'load_reps', 1, 1,
                   'planned', 1)`,
        );
      });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `INSERT INTO session_advanced_timing_states
          (session_id, session_set_id, state_version, revision, status, mode,
           config_json, progress_json, started_at_ms, next_boundary_at_ms,
           remaining_ms, stopped_at_ms)
         VALUES ('v27-other', 'v27-set', 1, 1, 'running', 'per_rep',
                 '{"version":1,"mode":"per_rep","intervalMs":1000,"cueChannels":"haptic"}',
                 '{"nextRepetitionIndex":1}', 1, 1001, NULL, NULL)`,
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    } finally {
      await runtime.close();
    }
  });

  it("fails migration 27 verification when either ownership trigger is missing", async () => {
    await expect(advancedTimingTargetOwnershipMigration.verify({
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() => [{
        name: "session_advanced_timing_states_target_session_insert",
      }] as unknown as readonly Row[],
    })).rejects.toThrow("advanced_timing_target_ownership_schema_incomplete");
  });

  it.each(Array.from({ length: 9 }, (_, statementIndex) => statementIndex))(
    "rolls back the v20 receipt rebuild when statement %i fails",
    async (statementIndex) => {
      const runtime = await createHostRuntime();
      try {
        await createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations: MIGRATIONS_THROUGH_V19,
          recoveryBackup: validatedBackup(),
        }).run();
        await runtime.kernel.write(async (transaction) => {
          await transaction.execute("INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision) VALUES ('migration-20-rollback-session', NULL, NULL, 'manual', 'in_progress', '2026-09-16', 'Asia/Singapore', 1, NULL, 0)");
          await transaction.execute("INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('migration-20-rollback-exercise', NULL, 'custom', NULL, NULL, 'Migration 20 rollback', 'load_reps', 1, 1, 'Unspecified', 90, 1)");
          await transaction.execute("INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, origin, display_ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, default_rest_seconds, target_revision, status, revision) VALUES ('migration-20-rollback-subject', 'migration-20-rollback-session', NULL, 'migration-20-rollback-exercise', 0, 'added', 0, 'Migration 20 rollback', 'load_reps', 1, 1, 90, 0, 'planned', 1)");
          await transaction.execute("INSERT INTO workout_session_exercise_edit_receipts (request_id, request_sha256, operation, session_id, session_exercise_id, expected_session_revision, result_session_revision, result_json, committed_at_ms) VALUES ('migration-20-rollback-receipt', ?, 'add_exercise', 'migration-20-rollback-session', 'migration-20-rollback-subject', 0, 1, ?, 2)", ['b'.repeat(64), JSON.stringify({ legacy: true })]);
        });
        const before = await runtime.kernel.queryAll(
          "SELECT type, name, sql FROM sqlite_master WHERE name LIKE 'workout_session_exercise_edit_receipts%' ORDER BY type, name",
        );
        const beforeRows = await runtime.kernel.queryAll(
          "SELECT * FROM workout_session_exercise_edit_receipts ORDER BY request_id",
        );
        const runner = createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations: [sessionExerciseEditReceiptsMigration],
          recoveryBackup: validatedBackup(),
          failureInjector(event) {
            if (event.migration.version === 20 && event.phase === "after"
              && event.statementIndex === statementIndex) throw new Error("injected_v20_failure");
          },
        });
        await expect(runner.run()).rejects.toMatchObject({ code: "migration_statement_failed" });
        expect(await userVersion(runtime.kernel)).toBe(19);
        await expect(runtime.kernel.queryAll(
          "SELECT type, name, sql FROM sqlite_master WHERE name LIKE 'workout_session_exercise_edit_receipts%' ORDER BY type, name",
        )).resolves.toEqual(before);
        await expect(runtime.kernel.queryAll(
          "SELECT * FROM workout_session_exercise_edit_receipts ORDER BY request_id",
        )).resolves.toEqual(beforeRows);
      } finally {
        await runtime.close();
      }
    },
  );

  it("enforces the separate reorder receipt operation, JSON-array evidence, session-only foreign key, and immutable triggers", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: runtimeMigrations,
        recoveryBackup: validatedBackup(),
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision)
           VALUES ('migration-20-reorder-session', NULL, NULL, 'manual', 'in_progress', '2026-09-16', 'Asia/Singapore', 1, NULL, 0)`,
        );
        await transaction.execute(
          `INSERT INTO workout_session_exercise_reorder_receipts
            (request_id, request_sha256, operation, session_id, ordered_session_exercise_ids_json,
             expected_session_revision, result_session_revision, result_json, committed_at_ms)
           VALUES ('migration-20-reorder-valid', ?, 'reorder_exercises', 'migration-20-reorder-session',
                   '["subject"]', 0, 1, '{}', 2)`,
          ['c'.repeat(64)],
        );
      });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `INSERT INTO workout_session_exercise_reorder_receipts
          (request_id, request_sha256, operation, session_id, ordered_session_exercise_ids_json,
           expected_session_revision, result_session_revision, result_json, committed_at_ms)
         VALUES ('migration-20-reorder-invalid-operation', ?, 'add_exercise', 'migration-20-reorder-session',
                 '[]', 1, 2, '{}', 3)`, ['d'.repeat(64)],
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        `INSERT INTO workout_session_exercise_reorder_receipts
          (request_id, request_sha256, operation, session_id, ordered_session_exercise_ids_json,
           expected_session_revision, result_session_revision, result_json, committed_at_ms)
         VALUES ('migration-20-reorder-invalid-json', ?, 'reorder_exercises', 'migration-20-reorder-session',
                 '{}', 1, 2, '{}', 3)`, ['e'.repeat(64)],
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        "UPDATE workout_session_exercise_reorder_receipts SET result_json = '{\"changed\":true}' WHERE request_id = 'migration-20-reorder-valid'",
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      await expect(runtime.kernel.write((transaction) => transaction.execute(
        "DELETE FROM workout_session_exercise_reorder_receipts WHERE request_id = 'migration-20-reorder-valid'",
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      expect(await runtime.kernel.queryAll("PRAGMA foreign_key_list(workout_session_exercise_reorder_receipts)")).toEqual([expect.objectContaining({ table: "workout_sessions" })]);
      expect(await runtime.kernel.queryAll("PRAGMA index_list(workout_session_exercise_reorder_receipts)")).toEqual(expect.arrayContaining([expect.objectContaining({ name: "workout_session_exercise_reorder_receipts_session_committed_request_idx" })]));
    } finally {
      await runtime.close();
    }
  });

  it("rejects every malformed v20 verifier surface for both receipt authorities", async () => {
    const editColumns = [
      ["request_id", "TEXT", 1, 1], ["request_sha256", "TEXT", 1, 0], ["operation", "TEXT", 1, 0], ["session_id", "TEXT", 1, 0], ["subject_session_exercise_id", "TEXT", 1, 0], ["replacement_session_exercise_id", "TEXT", 0, 0], ["expected_session_revision", "INTEGER", 1, 0], ["result_session_revision", "INTEGER", 1, 0], ["result_json", "TEXT", 1, 0], ["committed_at_ms", "INTEGER", 1, 0],
    ].map(([name, type, notnull, pk]) => ({ name, type, notnull, pk }));
    const reorderColumns = ["request_id", "request_sha256", "operation", "session_id", "ordered_session_exercise_ids_json", "expected_session_revision", "result_session_revision", "result_json", "committed_at_ms"].map((name, index) => ({ name, type: index === 5 || index === 6 || index === 8 ? "INTEGER" : "TEXT", notnull: 1, pk: index === 0 ? 1 : 0 }));
    const objects = [
      { type: "table", name: "workout_session_exercise_edit_receipts", sql: SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[0] },
      { type: "trigger", name: "workout_session_exercise_edit_receipts_immutable_update", sql: SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[2] },
      { type: "trigger", name: "workout_session_exercise_edit_receipts_immutable_delete", sql: SESSION_EXERCISE_EDIT_RECEIPT_SCHEMA_STATEMENTS[3] },
      { type: "table", name: "workout_session_exercise_reorder_receipts", sql: SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS[0] },
      { type: "trigger", name: "workout_session_exercise_reorder_receipts_immutable_update", sql: SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS[2] },
      { type: "trigger", name: "workout_session_exercise_reorder_receipts_immutable_delete", sql: SESSION_EXERCISE_REORDER_RECEIPT_SCHEMA_STATEMENTS[3] },
    ];
    const valid = { editColumns, editForeignKeys: [{ table: "workout_sessions" }], editIndexes: [{ name: "workout_session_exercise_edit_receipts_session_committed_request_idx" }], reorderColumns, reorderForeignKeys: [{ table: "workout_sessions" }], reorderIndexes: [{ name: "workout_session_exercise_reorder_receipts_session_committed_request_idx" }], objects };
    const variants = [
      { editColumns: [] }, { editColumns: [{ ...editColumns[0], type: "INTEGER" }] }, { editForeignKeys: [] }, { editForeignKeys: [{ table: "session_exercises" }] }, { editIndexes: [] },
      { objects: objects.slice(1) }, { objects: [{ ...objects[0], sql: null }, ...objects.slice(1)] }, { objects: [...objects, { type: "table", name: "workout_session_exercise_edit_receipts_v19", sql: "CREATE TABLE stale" }] },
      { objects: [objects[0], { ...objects[1], sql: "CREATE TRIGGER altered" }, ...objects.slice(2)] }, { objects: [objects[0], objects[1], ...objects.slice(3)] },
      { reorderColumns: [] }, { reorderColumns: [{ ...reorderColumns[0], name: "wrong" }] }, { reorderForeignKeys: [] }, { reorderForeignKeys: [{ table: "session_exercises" }] }, { reorderIndexes: [] },
      { objects: [objects[0], objects[1], objects[2], ...objects.slice(4)] }, { objects: [...objects.slice(0, 3), { ...objects[3], sql: null }, ...objects.slice(4)] }, { objects: [...objects.slice(0, 3), { ...objects[3], sql: "CREATE TABLE altered" }, ...objects.slice(4)] },
    ];
    for (const variant of variants) {
      const scenario = { ...valid, ...variant };
      const transaction: SqliteTransactionExecutor = {
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        async queryAll<Row extends Record<string, unknown>>(sql: string) {
          const value = sql === "PRAGMA table_info(workout_session_exercise_edit_receipts)" ? scenario.editColumns
            : sql === "PRAGMA foreign_key_list(workout_session_exercise_edit_receipts)" ? scenario.editForeignKeys
              : sql === "PRAGMA index_list(workout_session_exercise_edit_receipts)" ? scenario.editIndexes
                : sql === "PRAGMA table_info(workout_session_exercise_reorder_receipts)" ? scenario.reorderColumns
                  : sql === "PRAGMA foreign_key_list(workout_session_exercise_reorder_receipts)" ? scenario.reorderForeignKeys
                    : sql === "PRAGMA index_list(workout_session_exercise_reorder_receipts)" ? scenario.reorderIndexes : scenario.objects;
          return value as unknown as readonly Row[];
        },
      };
      await expect(sessionExerciseEditReceiptsMigration.verify(transaction)).rejects.toThrow("session_exercise_edit_receipts_schema_incomplete");
    }
  });

  it("fails schema 19 verification for malformed columns, indexes, receipts, foreign keys, and triggers", async () => {
    const validSessionColumns = [{ name: "modified_from_plan", notnull: 1 }];
    const validExerciseColumns = [
      { name: "origin", notnull: 1 },
      { name: "display_ordinal", notnull: 1 },
    ];
    const validObjects = [
      {
        type: "table",
        name: "workout_session_exercise_edit_receipts",
        sql: SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS[5],
      },
      {
        type: "trigger",
        name: "workout_session_exercise_edit_receipts_immutable_update",
        sql: SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS[6],
      },
      {
        type: "trigger",
        name: "workout_session_exercise_edit_receipts_immutable_delete",
        sql: SESSION_EXERCISE_EDITING_SCHEMA_STATEMENTS[7],
      },
    ];
    const validIndexes = [{ name: "session_exercises_session_display_ordinal_idx" }];
    const validForeignKeys = [
      { table: "workout_sessions" },
      { table: "session_exercises" },
    ];
    const scenarios = [
      { sessionColumns: [], exerciseColumns: validExerciseColumns, indexes: validIndexes, objects: validObjects, foreignKeys: validForeignKeys },
      { sessionColumns: validSessionColumns, exerciseColumns: validExerciseColumns, indexes: [], objects: validObjects, foreignKeys: validForeignKeys },
      { sessionColumns: validSessionColumns, exerciseColumns: validExerciseColumns, indexes: validIndexes, objects: validObjects.slice(1), foreignKeys: validForeignKeys },
      {
        sessionColumns: validSessionColumns,
        exerciseColumns: validExerciseColumns,
        indexes: validIndexes,
        objects: [{ ...validObjects[0], sql: null }, validObjects[1], validObjects[2]],
        foreignKeys: validForeignKeys,
      },
      { sessionColumns: validSessionColumns, exerciseColumns: validExerciseColumns, indexes: validIndexes, objects: validObjects, foreignKeys: validForeignKeys.slice(0, 1) },
      {
        sessionColumns: validSessionColumns,
        exerciseColumns: validExerciseColumns,
        indexes: validIndexes,
        objects: [
          validObjects[0],
          { ...validObjects[1], sql: "CREATE TRIGGER altered" },
          validObjects[2],
        ],
        foreignKeys: validForeignKeys,
      },
      {
        sessionColumns: validSessionColumns,
        exerciseColumns: validExerciseColumns,
        indexes: validIndexes,
        objects: [validObjects[0], validObjects[1], { ...validObjects[2], name: "unexpected_trigger" }],
        foreignKeys: validForeignKeys,
      },
    ];

    for (const scenario of scenarios) {
      const transaction: SqliteTransactionExecutor = {
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        async queryAll<Row extends Record<string, unknown>>(sql: string) {
          const result = sql === "PRAGMA table_info(workout_sessions)"
            ? scenario.sessionColumns
            : sql === "PRAGMA table_info(session_exercises)"
              ? scenario.exerciseColumns
              : sql === "PRAGMA index_list(session_exercises)"
                ? scenario.indexes
              : sql === "PRAGMA foreign_key_list(workout_session_exercise_edit_receipts)"
                ? scenario.foreignKeys
                : scenario.objects;
          return result as unknown as readonly Row[];
        },
      };
      await expect(sessionExerciseEditingMigration.verify(transaction))
        .rejects.toThrow("session_exercise_editing_schema_incomplete");
    }
  });

  it("rejects removal receipt triggers whose expected names have altered bodies", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: runtimeMigrations,
        recoveryBackup: validatedBackup(),
      }).run();

      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          "DROP TRIGGER workout_remove_receipts_immutable_update",
        );
        await transaction.execute(
          `CREATE TRIGGER workout_remove_receipts_immutable_update
           BEFORE UPDATE ON workout_remove_receipts
           BEGIN
             SELECT 1;
           END`,
        );
      });

      await expect(runtime.kernel.write((transaction) => (
        workoutRemoveReceiptEntityIdsMigration.verify(transaction)
      ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    } finally {
      await runtime.close();
    }
  });

  it("fails v18 verification for malformed columns, foreign keys, stale tables, and trigger bodies", async () => {
    const validColumns = [
      { name: "request_id", type: "TEXT", notnull: 1, pk: 1 },
      { name: "request_sha256", type: "TEXT", notnull: 1, pk: 0 },
      { name: "operation", type: "TEXT", notnull: 1, pk: 0 },
      { name: "session_id", type: "TEXT", notnull: 1, pk: 0 },
      { name: "set_id", type: "TEXT", notnull: 1, pk: 0 },
      { name: "expected_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "expected_set_revision", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "result_session_revision", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "result_json", type: "TEXT", notnull: 1, pk: 0 },
      { name: "committed_at_ms", type: "INTEGER", notnull: 1, pk: 0 },
    ];
    const validObjects = [
      {
        type: "table",
        name: "workout_remove_receipts",
        sql: WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[0],
      },
      {
        type: "trigger",
        name: "workout_remove_receipts_immutable_update",
        sql: WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[1],
      },
      {
        type: "trigger",
        name: "workout_remove_receipts_immutable_delete",
        sql: WORKOUT_REMOVE_RECEIPT_ENTITY_ID_SCHEMA_STATEMENTS[2],
      },
    ];
    async function expectRejected(input: Readonly<{
      columns?: readonly Record<string, unknown>[];
      foreignKeys?: readonly Record<string, unknown>[];
      objects?: readonly Record<string, unknown>[];
    }>) {
      const transaction: SqliteTransactionExecutor = {
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: async <Row extends Record<string, unknown>>(sql: string) => {
          if (sql === "PRAGMA table_info(workout_remove_receipts)") {
            return (input.columns ?? validColumns) as readonly Row[];
          }
          if (sql === "PRAGMA foreign_key_list(workout_remove_receipts)") {
            return (input.foreignKeys ?? []) as readonly Row[];
          }
          return (input.objects ?? validObjects) as readonly Row[];
        },
      };
      await expect(workoutRemoveReceiptEntityIdsMigration.verify(transaction))
        .rejects.toThrow("workout_remove_receipt_entity_ids_schema_incomplete");
    }

    await expectRejected({ columns: validColumns.slice(0, -1) });
    await expectRejected({
      columns: validColumns.map((column) => (
        column.name === "session_id" ? { ...column, type: "INTEGER" } : column
      )),
    });
    await expectRejected({ foreignKeys: [{ table: "workout_sessions" }] });
    await expectRejected({
      objects: [
        ...validObjects,
        { type: "table", name: "workout_remove_receipts_v17", sql: "CREATE TABLE stale(id)" },
      ],
    });
    await expectRejected({ objects: validObjects.slice(1) });
    await expectRejected({
      objects: validObjects.map((object) => (
        object.name === "workout_remove_receipts_immutable_update"
          ? { ...object, sql: "CREATE TRIGGER changed AFTER INSERT ON workout_remove_receipts BEGIN SELECT 1; END" }
          : object
      )),
    });
  });

  it("migrates the empty v0 fixture and commits user_version with the schema", async () => {
    const runtime = await createHostRuntime();
    try {
      const result = await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();

      expect(result).toEqual({
        appliedVersions: [1, 2, 3],
        currentVersion: 3,
        recoveryBackup: null,
      });
      expect(await userVersion(runtime.kernel)).toBe(3);
      const tables = await runtime.kernel.queryAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      );
      expect(tables.map(({ name }) => name)).toEqual(
        expect.arrayContaining([...requiredTables]),
      );
      expect(await runtime.kernel.queryAll("PRAGMA foreign_key_check"))
        .toEqual([]);
      expect(await runtime.kernel.queryAll("PRAGMA integrity_check"))
        .toEqual([{ integrity_check: "ok" }]);
    } finally {
      await runtime.close();
    }
  });

  it("uses the exercise-history index for completed-set value sources", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();

      const plan = await runtime.kernel.queryAll<{ detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT ss.observed_json
         FROM workout_sessions ws
         JOIN session_exercises se ON se.session_id = ws.id
         JOIN session_sets ss ON ss.session_exercise_id = se.id
         WHERE ws.id <> ?
           AND ws.status IN ('completed', 'partial')
           AND se.exercise_id = ?
           AND se.metric_profile = ?
           AND ss.set_kind = 'working'
           AND ss.status = 'completed'
           AND ss.observed_json IS NOT NULL
         ORDER BY COALESCE(ws.completed_at_ms, ws.started_at_ms) DESC,
                  CASE WHEN ss.ordinal = ? THEN 0 ELSE 1 END,
                  ss.ordinal,
                  ss.id
         LIMIT 1`,
        ["current", "exercise", "load_reps", 0],
      );
      const details = plan.map(({ detail }) => detail);

      expect(details).toEqual(expect.arrayContaining([
        expect.stringContaining("SEARCH se USING INDEX exercise_history"),
      ]));
      expect(details.join("\n")).not.toMatch(/\bSCAN ss\b/u);
    } finally {
      await runtime.close();
    }
  });

  it("rejects invalid ownership, state, non-negative, uniqueness, and foreign-key facts", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO content_packs
            (id, namespace, version, source_revision, installed_at_ms)
           VALUES (?, ?, ?, ?, ?)`,
          ["pack-1", "foundation", 1, 1, 100],
        );
      });

      const invalidStatements: ReadonlyArray<
        readonly [string, readonly SqliteParameter[]]
      > = [
        [
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id,
             name, metric_profile, default_rest_seconds, revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "exercise-invalid-origin",
            "pack-1",
            "server",
            "foundation",
            "squat",
            "Squat",
            "load_reps",
            120,
            0,
          ],
        ],
        [
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id,
             name, metric_profile, default_rest_seconds, revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "exercise-negative",
            "pack-1",
            "bundled",
            "foundation",
            "negative",
            "Invalid",
            "load_reps",
            -1,
            0,
          ],
        ],
        [
          `INSERT INTO plan_days
            (id, plan_id, ordinal, name, revision)
           VALUES (?, ?, ?, ?, ?)`,
          ["day-missing-plan", "missing-plan", 0, "Day", 0],
        ],
        [
          `INSERT INTO pending_effects
            (id, effect_type, payload_version, payload_json, idempotency_key,
             subject_id, expected_revision, status, attempt_count,
             next_attempt_at_ms, claimed_at_ms, lease_expires_at_ms,
             last_error_code, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "effect-invalid-status",
            "reconcile_rest_notification",
            1,
            "{}",
            "effect-invalid-status",
            "session-1",
            0,
            "lost",
            0,
            0,
            null,
            null,
            null,
            0,
            0,
          ],
        ],
      ];

      for (const [sql, parameters] of invalidStatements) {
        await expect(runtime.kernel.write((transaction) =>
          transaction.execute(sql, parameters),
        )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      }

      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO pending_effects
            (id, effect_type, payload_version, payload_json, idempotency_key,
             subject_id, expected_revision, status, attempt_count,
             next_attempt_at_ms, claimed_at_ms, lease_expires_at_ms,
             last_error_code, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "effect-1",
            "reconcile_rest_notification",
            1,
            "{}",
            "stable-key",
            "session-1",
            0,
            "pending",
            0,
            0,
            null,
            null,
            null,
            0,
            0,
          ],
        );
      });
      await expect(runtime.kernel.write((transaction) =>
        transaction.execute(
          `INSERT INTO pending_effects
            (id, effect_type, payload_version, payload_json, idempotency_key,
             subject_id, expected_revision, status, attempt_count,
             next_attempt_at_ms, claimed_at_ms, lease_expires_at_ms,
             last_error_code, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "effect-2",
            "reconcile_rest_notification",
            1,
            "{}",
            "stable-key",
            "session-1",
            0,
            "pending",
            0,
            0,
            null,
            null,
            null,
            0,
            0,
          ],
        ),
      )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    } finally {
      await runtime.close();
    }
  });

  it("migrates the populated retained v1 fixture without mutating source identities or revisions", async () => {
    const runtime = await createHostRuntime(fixture("v1-phase1.sql"));
    try {
      const result = await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();

      expect(result.appliedVersions).toEqual([2, 3]);
      expect(result.currentVersion).toBe(3);
      expect(await runtime.kernel.queryAll(
        `SELECT id, origin, source_namespace, upstream_id, revision
         FROM plans ORDER BY id`,
      )).toEqual([
        {
          id: "plan-bundled",
          origin: "bundled",
          revision: 4,
          source_namespace: "foundation",
          upstream_id: "full-body-foundation",
        },
        {
          id: "plan-copy",
          origin: "copied",
          revision: 7,
          source_namespace: "foundation",
          upstream_id: "full-body-foundation",
        },
      ]);
      expect(await runtime.kernel.queryAll(
        `SELECT id, status, revision FROM session_sets ORDER BY id`,
      )).toEqual([
        { id: "set-completed", revision: 2, status: "completed" },
        { id: "set-draft", revision: 3, status: "draft" },
      ]);
      expect(await runtime.kernel.queryAll(
        `SELECT session_id, status, revision FROM session_rest_states`,
      )).toEqual([
        { revision: 5, session_id: "session-active", status: "running" },
      ]);
      expect(await runtime.kernel.queryAll(
        `SELECT id, status, expected_revision FROM pending_effects`,
      )).toEqual([
        { expected_revision: 5, id: "effect-rest", status: "pending" },
      ]);
      expect(await runtime.kernel.queryAll(
        `SELECT id, status, source_revision, target_revision
         FROM progression_recommendations`,
      )).toEqual([
        {
          id: "recommendation-1",
          source_revision: 2,
          status: "pending",
          target_revision: 7,
        },
      ]);
      expect(await runtime.kernel.queryAll(
        `SELECT id, completed_set_id, consumed_at_ms
         FROM session_undo_snapshots`,
      )).toEqual([
        {
          completed_set_id: "set-completed",
          consumed_at_ms: null,
          id: "undo-1",
        },
      ]);
      expect(await runtime.kernel.queryAll("PRAGMA foreign_key_check"))
        .toEqual([]);
    } finally {
      await runtime.close();
    }
  });

  it.each(
    INITIAL_SCHEMA_STATEMENTS.flatMap((_, statementIndex) => [
      ["before", statementIndex] as const,
      ["after", statementIndex] as const,
    ]),
  )(
    "rolls back v1 when failure is injected %s schema statement %i",
    async (...parameters) => {
      const [phase, statementIndex] = parameters;
      const runtime = await createHostRuntime();
      try {
        const runner = createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations,
          failureInjector(event) {
            if (
              event.phase === phase
              && event.statementIndex === statementIndex
            ) {
              throw new Error(`injected_${phase}_${statementIndex}`);
            }
          },
        });

        await expect(runner.run()).rejects.toBeInstanceOf(MigrationError);
        expect(await userVersion(runtime.kernel)).toBe(0);
        expect(await runtime.kernel.queryAll<{ name: string }>(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        )).toEqual([]);
        await expect(runner.run()).rejects.toMatchObject({
          code: "migration_retry_requires_restart",
        });
      } finally {
        await runtime.close();
      }
    },
  );

  it("rolls back rows and user_version when migration verification fails", async () => {
    const runtime = await createHostRuntime();
    const verifyFailure: Migration = {
      version: 1,
      name: "verify-failure",
      kind: "additive",
      async up(transaction) {
        await transaction.execute(
          "CREATE TABLE retained (id TEXT PRIMARY KEY)",
        );
        await transaction.execute(
          "INSERT INTO retained (id) VALUES (?)",
          ["must-rollback"],
        );
      },
      async verify() {
        throw new Error("verification_failed");
      },
    };
    try {
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: [verifyFailure],
      }).run()).rejects.toMatchObject({ code: "migration_verify_failed" });
      expect(await userVersion(runtime.kernel)).toBe(0);
      expect(await runtime.kernel.queryAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE name = 'retained'",
      )).toEqual([]);
    } finally {
      await runtime.close();
    }
  });

  it("rolls back rows and user_version when COMMIT fails", async () => {
    const runtime = await createHostRuntime("", {
      beforeCommit: async () => {
        throw new Error("commit_failed");
      },
    });
    const migration: Migration = {
      version: 1,
      name: "commit-failure",
      kind: "additive",
      async up(transaction) {
        await transaction.execute(
          "CREATE TABLE retained (id TEXT PRIMARY KEY)",
        );
      },
      async verify() {},
    };
    try {
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: [migration],
      }).run()).rejects.toMatchObject({ code: "migration_commit_failed" });
      expect(await userVersion(runtime.kernel)).toBe(0);
      expect(await runtime.kernel.queryAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE name = 'retained'",
      )).toEqual([]);
    } finally {
      await runtime.close();
    }
  });

  it.each(["destructive", "long"] as const)(
    "creates and validates exactly one internal backup before a %s mutation",
    async (kind) => {
      const runtime = await createHostRuntime();
      const backup = validatedBackup();
      let mutationObservedBackup = false;
      const migration: Migration = {
        version: 1,
        name: `${kind}-migration`,
        kind,
        async up(transaction) {
          mutationObservedBackup = backup.createAndValidate.mock.calls.length === 1;
          await transaction.execute(
            "CREATE TABLE retained (id TEXT PRIMARY KEY)",
          );
        },
        async verify() {},
      };
      try {
        const result = await createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations: [migration],
          recoveryBackup: backup,
        }).run();

        expect(mutationObservedBackup).toBe(true);
        expect(backup.createAndValidate).toHaveBeenCalledTimes(1);
        expect(backup.createAndValidate).toHaveBeenCalledWith({
          databaseName: "gym-tracker.db",
          fromVersion: 0,
          toVersion: 1,
        });
        expect(result.recoveryBackup).toEqual(expect.objectContaining({
          backupId: "recovery-0-1",
          validated: true,
        }));
      } finally {
        await runtime.close();
      }
    },
  );

  it("does not mutate when internal recovery validation fails", async () => {
    const runtime = await createHostRuntime();
    const backup: RecoveryBackupPort = {
      createAndValidate: jest.fn(async () => {
        throw new Error("backup_validation_failed");
      }),
    };
    const migration: Migration = {
      version: 1,
      name: "destructive-failure",
      kind: "destructive",
      async up(transaction) {
        await transaction.execute(
          "CREATE TABLE retained (id TEXT PRIMARY KEY)",
        );
      },
      async verify() {},
    };
    try {
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: [migration],
        recoveryBackup: backup,
      }).run()).rejects.toMatchObject({
        code: "migration_recovery_failed",
      });
      expect(await userVersion(runtime.kernel)).toBe(0);
      expect(await runtime.kernel.queryAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE name = 'retained'",
      )).toEqual([]);
    } finally {
      await runtime.close();
    }
  });

  it("blocks an invalid retained v1 fixture without changing its version or rows", async () => {
    const invalidFixture = `${fixture("v1-phase1.sql")}
PRAGMA foreign_keys = OFF;
INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
VALUES ('orphan-day', 'missing-plan', 99, 'Orphan', 0);
PRAGMA foreign_keys = ON;`;
    const runtime = await createHostRuntime(invalidFixture);
    try {
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run()).rejects.toMatchObject({
        code: "migration_integrity_failed",
      });
      expect(await userVersion(runtime.kernel)).toBe(1);
      expect(await runtime.kernel.queryAll<{ id: string }>(
        "SELECT id FROM plan_days WHERE id = 'orphan-day'",
      )).toEqual([{ id: "orphan-day" }]);
    } finally {
      await runtime.close();
    }
  });

  it("rejects a database newer than the application manifest", async () => {
    const runtime = await createHostRuntime("PRAGMA user_version = 99;");
    try {
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run()).rejects.toMatchObject({
        code: "migration_version_unsupported",
      });
      expect(await userVersion(runtime.kernel)).toBe(99);
    } finally {
      await runtime.close();
    }
  });

  it.each([
    [{ version: 0, name: "zero", kind: "additive" }, "zero version"],
    [{ version: 1.5, name: "decimal", kind: "additive" }, "decimal version"],
    [{ version: 1, name: "", kind: "additive" }, "empty name"],
  ] as const)("rejects an invalid manifest with a %s", async (...parameters) => {
    const [partial] = parameters;
    const runtime = await createHostRuntime();
    const invalidMigration: Migration = {
      version: partial.version,
      name: partial.name,
      kind: partial.kind,
      async up() {},
      async verify() {},
    };
    try {
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: [invalidMigration],
      }).run()).rejects.toMatchObject({
        code: "migration_manifest_invalid",
      });
    } finally {
      await runtime.close();
    }
  });

  it("rejects duplicate and descending migration versions", async () => {
    const runtime = await createHostRuntime();
    const migration = (version: number, name: string): Migration => ({
      version,
      name,
      kind: "additive",
      async up() {},
      async verify() {},
    });
    try {
      for (const manifest of [
        [migration(1, "one"), migration(1, "duplicate")],
        [migration(2, "two"), migration(1, "descending")],
      ]) {
        await expect(createMigrationRunner({
          databaseName: "gym-tracker.db",
          kernel: runtime.kernel,
          migrations: manifest,
        }).run()).rejects.toMatchObject({
          code: "migration_manifest_invalid",
        });
      }
    } finally {
      await runtime.close();
    }
  });

  it("supports an empty manifest only for an empty v0 database", async () => {
    const runtime = await createHostRuntime();
    try {
      expect(await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: [],
      }).run()).toEqual({
        appliedVersions: [],
        currentVersion: 0,
        recoveryBackup: null,
      });
    } finally {
      await runtime.close();
    }
  });

  it("requires a recovery port and a validated manifest for destructive work", async () => {
    const runtime = await createHostRuntime();
    const destructiveMigration: Migration = {
      version: 1,
      name: "destructive",
      kind: "destructive",
      async up() {},
      async verify() {},
    };
    try {
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: [destructiveMigration],
      }).run()).rejects.toMatchObject({
        code: "migration_recovery_failed",
      });
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: [destructiveMigration],
        recoveryBackup: {
          createAndValidate: async () => ({
            backupId: "invalid",
            databaseName: "gym-tracker.db",
            fromVersion: 0,
            toVersion: 1,
            validated: false,
          } as never),
        },
      }).run()).rejects.toMatchObject({
        code: "migration_recovery_failed",
      });
    } finally {
      await runtime.close();
    }
  });

  it("maps direct and unclassified migration failures without raw details", async () => {
    const queryRows = async <Row extends Record<string, unknown>>(
      sql: string,
    ): Promise<readonly Row[]> => {
      if (sql === "PRAGMA user_version") {
        return [{ user_version: 0 }] as unknown as Row[];
      }
      return [] as Row[];
    };
    const directFailure = new MigrationError("migration_verify_failed");
    const directKernel: SqliteKernel = {
      write: async () => {
        throw directFailure;
      },
      queryAll: queryRows,
      connectionConfiguration: async () => {
        throw new Error("unused");
      },
      close: async () => undefined,
    };
    const plainKernel: SqliteKernel = {
      ...directKernel,
      write: async () => {
        throw new Error("raw_sql_should_not_escape");
      },
    };
    const migration: Migration = {
      version: 1,
      name: "failure-map",
      kind: "additive",
      async up() {},
      async verify() {},
    };

    await expect(createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel: directKernel,
      migrations: [migration],
    }).run()).rejects.toBe(directFailure);
    await expect(createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel: plainKernel,
      migrations: [migration],
    }).run()).rejects.toMatchObject({
      code: "migration_statement_failed",
    });
  });

  it("supports migration reads with and without bound parameters", async () => {
    const runtime = await createHostRuntime();
    const readMigration: Migration = {
      version: 1,
      name: "read-during-migration",
      kind: "additive",
      async up(transaction) {
        expect(await transaction.queryAll<{ value: number }>(
          "SELECT 1 AS value",
        )).toEqual([{ value: 1 }]);
        expect(await transaction.queryAll<{ value: number }>(
          "SELECT ? AS value",
          [2],
        )).toEqual([{ value: 2 }]);
      },
      async verify() {},
    };
    try {
      await expect(createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: [readMigration],
      }).run()).resolves.toMatchObject({
        currentVersion: 1,
      });
    } finally {
      await runtime.close();
    }
  });

  it("treats a missing user_version row as v0 and propagates integrity query failure safely", async () => {
    const queries: string[] = [];
    const kernel: SqliteKernel = {
      write: async (command) => command({
        execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
        queryAll: async () => [],
      }),
      async queryAll(sql) {
        queries.push(sql);
        if (sql === "PRAGMA user_version") {
          return [];
        }
        throw new Error("integrity_query_failed");
      },
      connectionConfiguration: async () => {
        throw new Error("unused");
      },
      close: async () => undefined,
    };

    await expect(createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel,
      migrations: [],
    }).run()).rejects.toMatchObject({
      code: "migration_integrity_failed",
    });
    expect(queries).toContain("PRAGMA user_version");
  });

  it("fails the initial migration verifier when a required table is absent", async () => {
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() =>
        [{ name: "app_settings" }] as unknown as Row[],
    };
    await expect(initialMigration.verify(transaction))
      .rejects.toThrow("initial_schema_incomplete");
  });

  it("fails additive migration verifiers when their required schema object is absent", async () => {
    const transaction = (
      rows: readonly Record<string, unknown>[],
    ): SqliteTransactionExecutor => ({
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() =>
        rows as Row[],
    });

    await expect(outcomeEffortMigration.verify(transaction([
      { name: "effort" },
    ]))).rejects.toThrow("outcome_effort_schema_incomplete");
    await expect(outcomeEffortMigration.verify(transaction([
      { name: "effort_recorded_at_ms" },
    ]))).rejects.toThrow("outcome_effort_schema_incomplete");
    await expect(exerciseHistoryIndexMigration.verify(transaction([])))
      .rejects.toThrow("exercise_history_index_missing");
  });

  it("rolls back when in-transaction integrity checks fail or cannot run", async () => {
    const migration: Migration = {
      version: 1,
      name: "integrity-failure",
      kind: "additive",
      async up() {},
      async verify() {},
    };
    const kernel = (
      transactionQuery: SqliteTransactionExecutor["queryAll"],
    ): SqliteKernel => ({
      write: async (command) => command({
        execute: async () => ({ changes: 1, lastInsertRowId: 0 }),
        queryAll: transactionQuery,
      }),
      queryAll: async <Row extends Record<string, unknown>>(
        sql: string,
      ): Promise<readonly Row[]> => (
        sql === "PRAGMA user_version"
          ? [{ user_version: 0 }] as unknown as Row[]
          : []
      ),
      connectionConfiguration: async () => {
        throw new Error("unused");
      },
      close: async () => undefined,
    });

    await expect(createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel: kernel(async <Row extends Record<string, unknown>>(
        sql: string,
      ): Promise<readonly Row[]> => {
        if (sql === "PRAGMA foreign_key_check") {
          return [{ table: "orphan" }] as unknown as Row[];
        }
        return [{ integrity_check: "ok" }] as unknown as Row[];
      }),
      migrations: [migration],
    }).run()).rejects.toMatchObject({
      code: "migration_integrity_failed",
    });

    await expect(createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel: kernel(async () => {
        throw new Error("integrity_query_failed");
      }),
      migrations: [migration],
    }).run()).rejects.toMatchObject({
      code: "migration_integrity_failed",
    });
  });

  it("fails the final integrity gate when a migrated database has foreign-key rows", async () => {
    const kernel: SqliteKernel = {
      write: async () => {
        throw new Error("unused");
      },
      async queryAll<Row extends Record<string, unknown>>(
        sql: string,
      ): Promise<readonly Row[]> {
        if (sql === "PRAGMA user_version") {
          return [{ user_version: 0 }] as unknown as Row[];
        }
        if (sql === "PRAGMA foreign_key_check") {
          return [{ table: "orphan" }] as unknown as Row[];
        }
        return [{ integrity_check: "ok" }] as unknown as Row[];
      },
      connectionConfiguration: async () => {
        throw new Error("unused");
      },
      close: async () => undefined,
    };

    await expect(createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel,
      migrations: [],
    }).run()).rejects.toMatchObject({
      code: "migration_integrity_failed",
    });
  });
});

describe("Plan 01-06 Expo recovery backup port", () => {
  function backupKernel(input: Readonly<{
    version?: number;
    foreignKeyRows?: readonly Record<string, unknown>[];
    integrityRows?: readonly Record<string, unknown>[];
  }> = {}): SqliteKernel {
    return {
      write: async () => {
        throw new Error("unused");
      },
      async queryAll<Row extends Record<string, unknown>>(
        sql: string,
      ): Promise<readonly Row[]> {
        if (sql === "PRAGMA user_version") {
          return (input.version === undefined
            ? []
            : [{ user_version: input.version }]) as unknown as Row[];
        }
        if (sql === "PRAGMA foreign_key_check") {
          return (input.foreignKeyRows ?? []) as Row[];
        }
        return (input.integrityRows ?? [
          { integrity_check: "ok" },
        ]) as Row[];
      },
      connectionConfiguration: async () => {
        throw new Error("unused");
      },
      close: jest.fn(async () => undefined),
    };
  }

  function backupOptions(kernel: SqliteKernel) {
    const source = { name: "source" };
    const destination = { name: "destination" };
    return {
      source,
      destination,
      options: {
        openSource: jest.fn(async () => source),
        openDestination: jest.fn(async () => destination),
        backup: jest.fn(async () => undefined),
        close: jest.fn(async () => undefined),
        validate: jest.fn(async () => kernel),
        remove: jest.fn(async () => undefined),
        writeManifest: jest.fn(async () => undefined),
      },
    };
  }

  it("backs up, closes both handles, validates, and writes one bounded manifest", async () => {
    const kernel = backupKernel({ version: 2 });
    const { source, destination, options } = backupOptions(kernel);
    const result = await createExpoRecoveryBackupPort(options)
      .createAndValidate({
        databaseName: "gym-tracker.db",
        fromVersion: 2,
        toVersion: 3,
      });

    expect(options.backup).toHaveBeenCalledWith({
      sourceDatabase: source,
      destDatabase: destination,
    });
    expect(options.close).toHaveBeenCalledTimes(2);
    expect(options.writeManifest).toHaveBeenCalledWith(result);
    expect(result).toEqual({
      backupId: "migration-recovery-v2-to-v3",
      databaseName: "gym-tracker.db",
      fromVersion: 2,
      toVersion: 3,
      validated: true,
    });
    expect(kernel.close).toHaveBeenCalledTimes(1);
  });

  it("namespaces recovery artifacts for isolated benchmark databases", async () => {
    const kernel = backupKernel({ version: 0 });
    const { options } = backupOptions(kernel);
    const result = await createExpoRecoveryBackupPort({
      ...options,
      backupIdPrefix: "phase2-benchmark-",
    }).createAndValidate({
      databaseName: "gym-tracker-phase2-benchmark.db",
      fromVersion: 0,
      toVersion: 10,
    });

    expect(options.openDestination).toHaveBeenCalledWith(
      "phase2-benchmark-migration-recovery-v0-to-v10.db",
    );
    expect(result).toEqual({
      backupId: "phase2-benchmark-migration-recovery-v0-to-v10",
      databaseName: "gym-tracker-phase2-benchmark.db",
      fromVersion: 0,
      toVersion: 10,
      validated: true,
    });
  });

  it.each([
    ["version", backupKernel({ version: 1 })],
    ["foreign keys", backupKernel({
      version: 2,
      foreignKeyRows: [{ table: "orphan" }],
    })],
    ["integrity row count", backupKernel({
      version: 2,
      integrityRows: [],
    })],
    ["multiple integrity rows", backupKernel({
      version: 2,
      integrityRows: [
        { integrity_check: "ok" },
        { integrity_check: "ok" },
      ],
    })],
    ["integrity result", backupKernel({
      version: 2,
      integrityRows: [{ integrity_check: "corrupt" }],
    })],
  ])("rejects invalid backup %s and removes the unusable file", async (_, kernel) => {
    const { options } = backupOptions(kernel);
    await expect(createExpoRecoveryBackupPort(options).createAndValidate({
      databaseName: "gym-tracker.db",
      fromVersion: 2,
      toVersion: 3,
    })).rejects.toThrow("recovery_backup_validation_failed");
    expect(options.remove).toHaveBeenCalledTimes(2);
    expect(options.writeManifest).not.toHaveBeenCalled();
    expect(kernel.close).toHaveBeenCalledTimes(1);
  });

  it("accepts an integrity result whose named value is ok", async () => {
    const kernel = backupKernel({
      version: 2,
      integrityRows: [{ metadata: "ignored", integrity_check: "ok" }],
    });
    const { options } = backupOptions(kernel);
    await expect(createExpoRecoveryBackupPort(options).createAndValidate({
      databaseName: "gym-tracker.db",
      fromVersion: 2,
      toVersion: 3,
    })).resolves.toMatchObject({ validated: true });
  });

  it("removes the target when opening the source fails", async () => {
    const kernel = backupKernel({ version: 0 });
    const { options } = backupOptions(kernel);
    options.openSource.mockRejectedValueOnce(new Error("source_open_failed"));

    await expect(createExpoRecoveryBackupPort(options).createAndValidate({
      databaseName: "gym-tracker.db",
      fromVersion: 0,
      toVersion: 1,
    })).rejects.toThrow("source_open_failed");
    expect(options.close).not.toHaveBeenCalled();
    expect(options.remove).toHaveBeenCalledTimes(2);
  });

  it("continues safely when stale backup cleanup fails", async () => {
    const kernel = backupKernel({ version: 0 });
    const { options } = backupOptions(kernel);
    options.remove
      .mockRejectedValueOnce(new Error("initial_remove_failed"))
      .mockResolvedValueOnce(undefined);

    await expect(createExpoRecoveryBackupPort(options).createAndValidate({
      databaseName: "gym-tracker.db",
      fromVersion: 0,
      toVersion: 1,
    })).resolves.toMatchObject({ validated: true });
  });

  it("preserves the original failure when unusable backup cleanup also fails", async () => {
    const kernel = backupKernel({ version: 0 });
    const { options } = backupOptions(kernel);
    options.openSource.mockRejectedValueOnce(new Error("source_open_failed"));
    options.remove.mockRejectedValue(new Error("cleanup_failed"));

    await expect(createExpoRecoveryBackupPort(options).createAndValidate({
      databaseName: "gym-tracker.db",
      fromVersion: 0,
      toVersion: 1,
    })).rejects.toThrow("source_open_failed");
  });

  it("closes both handles and removes the target when backup fails", async () => {
    const kernel = backupKernel({ version: 0 });
    const { options, source, destination } = backupOptions(kernel);
    options.backup.mockRejectedValueOnce(new Error("backup_failed"));

    await expect(createExpoRecoveryBackupPort(options).createAndValidate({
      databaseName: "gym-tracker.db",
      fromVersion: 0,
      toVersion: 1,
    })).rejects.toThrow("backup_failed");
    expect(options.close).toHaveBeenCalledWith(source);
    expect(options.close).toHaveBeenCalledWith(destination);
    expect(options.remove).toHaveBeenCalledTimes(2);
  });

  it("closes the source if opening the destination fails", async () => {
    const kernel = backupKernel({ version: 0 });
    const { options, source } = backupOptions(kernel);
    options.openDestination.mockRejectedValueOnce(
      new Error("destination_open_failed"),
    );

    await expect(createExpoRecoveryBackupPort(options).createAndValidate({
      databaseName: "gym-tracker.db",
      fromVersion: 0,
      toVersion: 1,
    })).rejects.toThrow("destination_open_failed");
    expect(options.close).toHaveBeenCalledWith(source);
    expect(options.remove).toHaveBeenCalledTimes(2);
  });
});

describe("Plan 01-06 native migration suite selection", () => {
  it("executes all shared migration and effect cases in the aggregate suite", async () => {
    const runtimes = new Map<string, HostRuntime>();
    const databasePaths = new Map<string, string>();
    const cleanup = jest.fn(async () => undefined);
    const openKeyedRuntime = async (
      databaseKey: string,
      observer: SqliteKernelTestObserver,
    ): Promise<HostRuntime> => {
      let databasePath = databasePaths.get(databaseKey);
      if (databasePath === undefined) {
        const directory = mkdtempSync(
          join(tmpdir(), "gym-migrations-effects-contract-"),
        );
        temporaryDirectories.add(directory);
        databasePath = join(directory, "gym-tracker.db");
        databasePaths.set(databaseKey, databasePath);
      }
      const fixtureDatabase = new DatabaseSync(databasePath);
      fixtureDatabase.close();
      const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
      const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
      await configureSqliteConnection(writer, { enableWal: true });
      await configureSqliteConnection(reader, { enableWal: false });
      const kernel = createSqliteKernel({ reader, writer }, observer);
      return {
        databasePath,
        kernel,
        close: () => kernel.close(),
      };
    };
    const adapter: MigrationsEffectsContractAdapter = {
      recoveryBackup: validatedBackup(),
      async createRuntime(databaseKey, observer = {}) {
        const runtime = await openKeyedRuntime(databaseKey, observer);
        runtimes.set(databaseKey, runtime);
        return {
          databaseName: databaseKey,
          kernel: runtime.kernel,
          close: runtime.close,
        };
      },
      cleanup,
      async insertForeignKeyViolation(databaseKey) {
        const runtime = runtimes.get(databaseKey);
        if (runtime === undefined) {
          throw new Error("host_contract_runtime_missing");
        }
        const database = new DatabaseSync(runtime.databasePath);
        try {
          database.exec(`
            PRAGMA foreign_keys = OFF;
            INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
            VALUES ('orphan-day', 'missing-plan', 99, 'Orphan', 0);
          `);
        } finally {
          database.close();
        }
      },
    };

    const result = await runMigrationsEffectsContract(adapter);

    expect(result.cases.filter(({ status }) => status === "failed")).toEqual([]);
    expect(result).toMatchObject({
      status: "passed",
      total: MIGRATIONS_EFFECTS_CONTRACT_CASES.length,
      passed: MIGRATIONS_EFFECTS_CONTRACT_CASES.length,
      failed: 0,
      skipped: 0,
    });
    expect(result.cases.map(({ id }) => id))
      .toEqual(MIGRATIONS_EFFECTS_CONTRACT_CASES);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("keeps a dedicated migration suite without changing the kernel ten-case contract", () => {
    expect(MIGRATIONS_EFFECTS_CONTRACT_CASES).toEqual([
      "migration-empty-v0",
      "migration-fresh-v27-schema23-registry",
      "migration-retained-v1",
      "migration-statement-rollback",
      "migration-verify-rollback",
      "migration-commit-rollback",
      "migration-integrity-block",
      "migration-recovery-backup",
      "migration-session-exercise-edit-receipts-v20",
      "migration-advanced-set-timing-v21",
      "migration-portable-owner-identities-v22",
      "effects-lease-replay",
      "effects-stale-revision",
      "effects-retry-limit",
    ]);
  });

  it("routes a selected migrations-effects manifest to the dedicated device contract", () => {
    const repositoryRoot = join(__dirname, "../..");
    const packageJson = JSON.parse(
      readFileSync(join(repositoryRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const route = readFileSync(
      join(repositoryRoot, "app/__native-contracts.tsx"),
      "utf8",
    );
    const verifier = readFileSync(
      join(repositoryRoot, "scripts/verify-native-evidence.mjs"),
      "utf8",
    );
    const migrationsContract = readFileSync(
      join(repositoryRoot, "src/testing/contracts/migrationsEffects.contract.ts"),
      "utf8",
    );
    const deviceCommand = packageJson.scripts?.["test:sqlite:device"] ?? "";

    expect(route).toContain("migrations-effects");
    expect(route).toContain("EXPO_PUBLIC_NATIVE_CONTRACT_SUITE");
    expect(route).toContain(
      "console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);",
    );
    expect(route).toContain("setState({ status: \"finished\", result });");
    expect(route).not.toContain("migrationsEffects?: MigrationsEffectsContractResult");
    expect(migrationsContract).toContain("finalizeUnusedStatementsBeforeClosing: false");
    expect(migrationsContract).toContain("migration_statement_rollback_${phase}_${statementIndex}_${safeErrorCode(error)}");
    expect(deviceCommand).toContain("migrations-effects");
    expect(deviceCommand).not.toContain("--assert-all=10");
    expect(deviceCommand).toContain('--suite "$suite"');
    expect(deviceCommand).toContain("run-native-sqlite-contracts.mjs");
    expect(deviceCommand).toContain("EXPO_PUBLIC_NATIVE_CONTRACT_SUITE");
    expect(route).toContain('configuredSuite === "phase10" || configuredSuite === "phase11"');
    expect(verifier).toContain("expectedCaseIds");
    expect(verifier).toContain("contract expected count");
    expect(verifier).toContain("MIGRATIONS_EFFECTS_CONTRACT_CASES");
  });
});

describe("Plan 01-06 leased durable effects", () => {
  it("commits source facts and one coalesced pending effect atomically", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO app_settings
            (key, value_version, value_json, revision, updated_at_ms)
           VALUES (?, ?, ?, ?, ?)`,
          ["source-revision", 1, "{\"revision\":1}", 1, 100],
        );
        expect(await enqueuePendingEffect(transaction, {
          id: "effect-atomic",
          type: "regenerate_load_reps_recommendation",
          payloadVersion: 1,
          payload: { exerciseId: "exercise-1" },
          idempotencyKey: "recommendation:exercise-1:r1",
          subjectId: "exercise-1",
          expectedRevision: 1,
          nowMs: 100,
        })).toBe("inserted");
        expect(await enqueuePendingEffect(transaction, {
          id: "effect-duplicate",
          type: "regenerate_load_reps_recommendation",
          payloadVersion: 1,
          payload: { exerciseId: "exercise-1" },
          idempotencyKey: "recommendation:exercise-1:r1",
          subjectId: "exercise-1",
          expectedRevision: 1,
          nowMs: 100,
        })).toBe("coalesced");
      });

      expect(await runtime.kernel.queryAll(
        "SELECT key, revision FROM app_settings",
      )).toEqual([{ key: "source-revision", revision: 1 }]);
      expect(await runtime.kernel.queryAll(
        `SELECT id, status, attempt_count, idempotency_key
         FROM pending_effects`,
      )).toEqual([{
        attempt_count: 0,
        id: "effect-atomic",
        idempotency_key: "recommendation:exercise-1:r1",
        status: "pending",
      }]);

      await expect(runtime.kernel.write(async (transaction) => {
        await transaction.execute(
          `UPDATE app_settings SET revision = 2 WHERE key = ?`,
          ["source-revision"],
        );
        await enqueuePendingEffect(transaction, {
          id: "effect-rollback",
          type: "reconcile_rest_notification",
          payloadVersion: 1,
          payload: { sessionId: "session-1" },
          idempotencyKey: "rest:session-1:r2",
          subjectId: "session-1",
          expectedRevision: 2,
          nowMs: 200,
        });
        throw new Error("process_died_before_commit");
      })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
      expect(await runtime.kernel.queryAll(
        "SELECT revision FROM app_settings WHERE key = 'source-revision'",
      )).toEqual([{ revision: 1 }]);
      expect(await runtime.kernel.queryAll<{ count: number }>(
        "SELECT COUNT(*) AS count FROM pending_effects",
      )).toEqual([{ count: 1 }]);
    } finally {
      await runtime.close();
    }
  });

  it("reclaims an expired processing lease and replays it once", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();
      const store = createEffectStore(runtime.kernel);
      await runtime.kernel.write((transaction) => enqueuePendingEffect(
        transaction,
        {
          id: "effect-lease",
          type: "reconcile_rest_notification",
          payloadVersion: 1,
          payload: { sessionId: "session-lease" },
          idempotencyKey: "rest:session-lease:r3",
          subjectId: "session-lease",
          expectedRevision: 3,
          nowMs: 100,
        },
      ));
      expect(await store.claimNext({
        nowMs: 100,
        leaseDurationMs: 50,
        maxAttempts: EFFECT_MAX_ATTEMPTS,
      })).toEqual(expect.objectContaining({
        attemptCount: 1,
        id: "effect-lease",
        status: "processing",
      }));
      expect(await store.resetExpiredClaims(149)).toBe(0);
      expect(await store.resetExpiredClaims(150)).toBe(1);

      const handler = jest.fn(async () => {
        await runtime.kernel.write((transaction) => transaction.execute(
          `INSERT INTO app_settings
            (key, value_version, value_json, revision, updated_at_ms)
           VALUES (?, ?, ?, ?, ?)`,
          ["handler-reentered-writer", 1, "{}", 1, 200],
        ));
      });
      const runner = createEffectRunner({
        store,
        currentRevision: async () => 3,
        handlers: {
          reconcile_rest_notification: handler,
          regenerate_load_reps_recommendation: async () => undefined,
        },
      });
      expect(await runner.drain({ nowMs: 200, limit: 10 })).toEqual({
        claimed: 1,
        completed: 1,
        permanentFailures: 0,
        retried: 0,
        superseded: 0,
      });
      expect(await runner.drain({ nowMs: 300, limit: 10 })).toEqual({
        claimed: 0,
        completed: 0,
        permanentFailures: 0,
        retried: 0,
        superseded: 0,
      });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(await store.findById("effect-lease")).toEqual(
        expect.objectContaining({
          attemptCount: 2,
          lastErrorCode: null,
          status: "completed",
        }),
      );
    } finally {
      await runtime.close();
    }
  });

  it("supersedes stale revisions without invoking a handler", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();
      const store = createEffectStore(runtime.kernel);
      await runtime.kernel.write((transaction) => enqueuePendingEffect(
        transaction,
        {
          id: "effect-stale",
          type: "regenerate_load_reps_recommendation",
          payloadVersion: 1,
          payload: { exerciseId: "exercise-stale" },
          idempotencyKey: "recommendation:exercise-stale:r4",
          subjectId: "exercise-stale",
          expectedRevision: 4,
          nowMs: 100,
        },
      ));
      const handler = jest.fn(async () => undefined);
      const runner = createEffectRunner({
        store,
        currentRevision: async () => 5,
        handlers: {
          reconcile_rest_notification: async () => undefined,
          regenerate_load_reps_recommendation: handler,
        },
      });

      expect(await runner.drain({ nowMs: 100, limit: 1 })).toEqual({
        claimed: 1,
        completed: 0,
        permanentFailures: 0,
        retried: 0,
        superseded: 1,
      });
      expect(handler).not.toHaveBeenCalled();
      expect(await store.findById("effect-stale")).toEqual(
        expect.objectContaining({
          lastErrorCode: "stale_source_revision",
          status: "superseded",
        }),
      );
    } finally {
      await runtime.close();
    }
  });

  it("retries explicit transient failures at most five times", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();
      const store = createEffectStore(runtime.kernel);
      await runtime.kernel.write((transaction) => enqueuePendingEffect(
        transaction,
        {
          id: "effect-transient",
          type: "regenerate_load_reps_recommendation",
          payloadVersion: 1,
          payload: { exerciseId: "exercise-transient" },
          idempotencyKey: "recommendation:exercise-transient:r1",
          subjectId: "exercise-transient",
          expectedRevision: 1,
          nowMs: 0,
        },
      ));
      const handler = jest.fn(async () => {
        throw new EffectExecutionError("transient", "platform_temporarily_busy");
      });
      const runner = createEffectRunner({
        store,
        currentRevision: async () => 1,
        handlers: {
          reconcile_rest_notification: async () => undefined,
          regenerate_load_reps_recommendation: handler,
        },
      });

      for (let attempt = 1; attempt <= EFFECT_MAX_ATTEMPTS; attempt += 1) {
        const result = await runner.drain({
          nowMs: attempt * 100_000,
          limit: 1,
        });
        expect(result.claimed).toBe(1);
        expect(result.retried).toBe(
          attempt === EFFECT_MAX_ATTEMPTS ? 0 : 1,
        );
        expect(result.permanentFailures).toBe(
          attempt === EFFECT_MAX_ATTEMPTS ? 1 : 0,
        );
      }
      expect(handler).toHaveBeenCalledTimes(EFFECT_MAX_ATTEMPTS);
      expect(await runner.drain({ nowMs: 999_999, limit: 1 })).toEqual({
        claimed: 0,
        completed: 0,
        permanentFailures: 0,
        retried: 0,
        superseded: 0,
      });
      expect(await store.findById("effect-transient")).toEqual(
        expect.objectContaining({
          attemptCount: EFFECT_MAX_ATTEMPTS,
          lastErrorCode: "platform_temporarily_busy",
          status: "permanent_failure",
        }),
      );
    } finally {
      await runtime.close();
    }
  });

  it("stops explicit permanent and unclassified failures safely", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();
      const store = createEffectStore(runtime.kernel);
      for (const [id, error] of [
        [
          "effect-permanent",
          new EffectExecutionError("permanent", "notification_permission_denied"),
        ],
        ["effect-unknown", new Error("raw payload should not persist")],
      ] as const) {
        await runtime.kernel.write((transaction) => enqueuePendingEffect(
          transaction,
          {
            id,
            type: "reconcile_rest_notification",
            payloadVersion: 1,
            payload: { sessionId: id },
            idempotencyKey: `rest:${id}:r1`,
            subjectId: id,
            expectedRevision: 1,
            nowMs: 0,
          },
        ));
        const runner = createEffectRunner({
          store,
          currentRevision: async () => 1,
          handlers: {
            reconcile_rest_notification: async () => {
              throw error;
            },
            regenerate_load_reps_recommendation: async () => undefined,
          },
        });
        expect(await runner.drain({ nowMs: 100, limit: 1 })).toEqual(
          expect.objectContaining({
            claimed: 1,
            permanentFailures: 1,
          }),
        );
      }
      expect(await store.findById("effect-permanent")).toEqual(
        expect.objectContaining({
          lastErrorCode: "notification_permission_denied",
          status: "permanent_failure",
        }),
      );
      expect(await store.findById("effect-unknown")).toEqual(
        expect.objectContaining({
          lastErrorCode: "effect_handler_failed",
          status: "permanent_failure",
        }),
      );
    } finally {
      await runtime.close();
    }
  });

  it("returns null for an absent effect and for a lost claim race", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations,
      }).run();
      const store = createEffectStore(runtime.kernel);
      expect(await store.findById("missing-effect")).toBeNull();
    } finally {
      await runtime.close();
    }

    const kernel: SqliteKernel = {
      async write(command) {
        return command({
          execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
          queryAll: async <Row extends Record<string, unknown>>() =>
            [{ id: "raced-effect" }] as unknown as Row[],
        });
      },
      queryAll: async () => [],
      connectionConfiguration: async () => {
        throw new Error("unused");
      },
      close: async () => undefined,
    };
    expect(await createEffectStore(kernel).claimNext({
      nowMs: 100,
      leaseDurationMs: 50,
      maxAttempts: EFFECT_MAX_ATTEMPTS,
    })).toBeNull();
  });
});

describe("Plan 01-06 trusted launch coordinator", () => {
  it("enables trusted roots only after every startup gate passes in order", async () => {
    const events: string[] = [];
    const coordinator = createLaunchCoordinator({
      openWriter: async () => {
        events.push("writer");
      },
      runMigrations: async () => {
        events.push("migrations");
      },
      runIntegrityChecks: async () => {
        events.push("checks");
      },
      openReader: async () => {
        events.push("reader");
      },
      resetStaleEffectClaims: async () => {
        events.push("lease-reset");
      },
      repairRestState: async () => {
        events.push("rest-repair");
      },
      drainUrgentEffects: async () => {
        events.push("urgent-drain");
      },
      firstTrustedQuery: async () => {
        events.push("trusted-query");
        return { route: "today", revision: 9 };
      },
    });

    expect(await coordinator.run()).toEqual({
      status: "trusted",
      value: { route: "today", revision: 9 },
    });
    expect(events).toEqual([
      "writer",
      "migrations",
      "checks",
      "reader",
      "lease-reset",
      "rest-repair",
      "urgent-drain",
      "trusted-query",
    ]);
  });

  it.each([
    ["openWriter", "storage", "GT-WRITER01", []],
    ["runMigrations", "migration", "GT-MIGRATE1", ["openWriter"]],
    [
      "runIntegrityChecks",
      "migration",
      "GT-CHECKS01",
      ["openWriter", "runMigrations"],
    ],
    [
      "openReader",
      "storage",
      "GT-READER01",
      ["openWriter", "runMigrations", "runIntegrityChecks"],
    ],
    [
      "resetStaleEffectClaims",
      "storage",
      "GT-LEASES01",
      ["openWriter", "runMigrations", "runIntegrityChecks", "openReader"],
    ],
    [
      "repairRestState",
      "storage",
      "GT-RESTFIX1",
      [
        "openWriter",
        "runMigrations",
        "runIntegrityChecks",
        "openReader",
        "resetStaleEffectClaims",
      ],
    ],
    [
      "drainUrgentEffects",
      "storage",
      "GT-EFFECT01",
      [
        "openWriter",
        "runMigrations",
        "runIntegrityChecks",
        "openReader",
        "resetStaleEffectClaims",
        "repairRestState",
      ],
    ],
    [
      "firstTrustedQuery",
      "storage",
      "GT-QUERY001",
      [
        "openWriter",
        "runMigrations",
        "runIntegrityChecks",
        "openReader",
        "resetStaleEffectClaims",
        "repairRestState",
        "drainUrgentEffects",
      ],
    ],
  ] as const)(
    "blocks trust and redacts a %s failure",
    async (...parameters) => {
      const [
        failedPort,
        category,
        correlationCode,
        precedingEvents,
      ] = parameters;
      const events: string[] = [];
      const port = (name: string) => async () => {
        if (name === failedPort) {
          throw new Error(
            "SQL INSERT password=secret note=private set_payload=raw",
          );
        }
        events.push(name);
        return { route: "today" };
      };
      const coordinator = createLaunchCoordinator({
        openWriter: port("openWriter"),
        runMigrations: port("runMigrations"),
        runIntegrityChecks: port("runIntegrityChecks"),
        openReader: port("openReader"),
        resetStaleEffectClaims: port("resetStaleEffectClaims"),
        repairRestState: port("repairRestState"),
        drainUrgentEffects: port("drainUrgentEffects"),
        firstTrustedQuery: port("firstTrustedQuery"),
      });

      const result = await coordinator.run();
      expect(result).toEqual({
        status: "failed",
        failure: {
          category,
          code: `launch_${failedPort}_failed`,
          correlationCode,
          retryable: true,
        },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /SQL|INSERT|password|secret|note|set_payload|raw/u,
      );
      expect(events).toEqual(precedingEvents);
    },
  );
});

describe("Phase 13 schema contracts", () => {
  const phase13Migrations: readonly [Migration, string, string][] = [
    [multiPlanRunningFoundationMigration, "running_plans", "multi_plan_running_foundation_schema_incomplete"],
    [runningSessionRootsMigration, "running_session_roots", "running_session_roots_schema_incomplete"],
    [importedActivityEvidenceMigration, "imported_activity_identities", "imported_activity_evidence_schema_incomplete"],
    [bodyweightSourceHistoryMigration, "bodyweight_entries", "bodyweight_source_history_schema_incomplete"],
    [strengthOccurrenceProvenanceMigration, "workout_session_schedule_links", "strength_occurrence_provenance_schema_incomplete"],
    [completedSetCorrectionReceiptsMigration, "workout_completed_set_correction_receipts", "completed_set_correction_receipts_schema_incomplete"],
    [runningActivityMatchLedgerMigration, "running_activity_match_events", "running_activity_match_ledger_schema_incomplete"],
    [importedActivityLifecycleStateMigration, "imported_activity_current_lifecycle", "imported_activity_lifecycle_state_schema_incomplete"],
  ];

  it.each(phase13Migrations)("installs %s and fails closed when its registry is incomplete", async (migration, omittedTable, error) => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: runtimeMigrations,
        recoveryBackup: validatedBackup(),
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await expect(migration.verify(transaction)).resolves.toBeUndefined();
        await transaction.execute(`DROP TABLE ${omittedTable}`);
        await expect(migration.verify(transaction)).rejects.toThrow(error);
      });
    } finally {
      await runtime.close();
    }
  });

  it("requires both per-sport uniqueness indexes in schema 28", async () => {
    const runtime = await createHostRuntime();
    try {
      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel: runtime.kernel,
        migrations: runtimeMigrations,
        recoveryBackup: validatedBackup(),
      }).run();
      await runtime.kernel.write(async (transaction) => {
        await transaction.execute("DROP INDEX one_active_owned_schedule_per_sport");
        await expect(multiPlanRunningFoundationMigration.verify(transaction))
          .rejects.toThrow("multi_plan_running_foundation_schema_incomplete");
      });
    } finally {
      await runtime.close();
    }
  });
});
