import {
  createMigrationRunner,
  type Migration,
} from "../../platform/sqlite/migrationRunner";
import {
  createEffectRunner,
  EffectExecutionError,
  EFFECT_MAX_ATTEMPTS,
} from "../../platform/sqlite/effects/effectRunner";
import {
  createEffectStore,
  enqueuePendingEffect,
} from "../../platform/sqlite/effects/effectStore";
import {
  INITIAL_SCHEMA_STATEMENTS,
} from "../../platform/sqlite/migrations/0001_initial";
import { migrations as runtimeMigrations } from "../../platform/sqlite/migrations";
import {
  createExpoRecoveryBackupPort,
} from "../../platform/sqlite/recoveryBackup";
import {
  type SqliteKernel,
  type SqliteKernelTestObserver,
  openSqliteKernelTestRuntime,
} from "../../platform/sqlite/sqliteKernel";

export const MIGRATIONS_EFFECTS_CONTRACT_VERSION = 1 as const;

export const MIGRATIONS_EFFECTS_CONTRACT_CASES = [
  "migration-empty-v0",
  "migration-retained-v1",
  "migration-statement-rollback",
  "migration-verify-rollback",
  "migration-commit-rollback",
  "migration-integrity-block",
  "migration-recovery-backup",
  "effects-lease-replay",
  "effects-stale-revision",
  "effects-retry-limit",
] as const;

const PHASE1_MIGRATIONS = runtimeMigrations.filter(
  ({ version }) => version <= 3,
);

export type MigrationsEffectsContractCaseId =
  (typeof MIGRATIONS_EFFECTS_CONTRACT_CASES)[number];

type ContractRuntime = Readonly<{
  databaseName: string;
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

export interface MigrationsEffectsContractAdapter {
  createRuntime(
    databaseKey: string,
    observer?: SqliteKernelTestObserver,
  ): Promise<ContractRuntime>;
  deleteDatabase(databaseKey: string): Promise<void>;
  insertForeignKeyViolation(databaseKey: string): Promise<void>;
  recoveryBackup: ReturnType<typeof createExpoRecoveryBackupPort>;
}

export type MigrationsEffectsContractCaseResult = Readonly<{
  id: MigrationsEffectsContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type MigrationsEffectsContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof MIGRATIONS_EFFECTS_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly MigrationsEffectsContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

function invariant(value: unknown, code: string): asserts value {
  if (!value) {
    throw new Error(code);
  }
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "migrations_effects_contract_failed";
}

async function userVersion(kernel: SqliteKernel): Promise<number> {
  const [row] = await kernel.queryAll<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? -1;
}

async function tableCount(kernel: SqliteKernel): Promise<number> {
  const [row] = await kernel.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  return row?.count ?? -1;
}

async function withFreshRuntime<Result>(
  adapter: MigrationsEffectsContractAdapter,
  databaseKey: string,
  operation: (runtime: ContractRuntime) => Promise<Result>,
  observer: SqliteKernelTestObserver = {},
): Promise<Result> {
  await adapter.deleteDatabase(databaseKey);
  const runtime = await adapter.createRuntime(databaseKey, observer);
  try {
    return await operation(runtime);
  } finally {
    await runtime.close();
    await adapter.deleteDatabase(databaseKey);
  }
}

const verifyFailureMigration: Migration = {
  version: 1,
  name: "verify-failure",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      "CREATE TABLE retained (id TEXT PRIMARY KEY NOT NULL) STRICT",
    );
    await transaction.execute(
      "INSERT INTO retained (id) VALUES (?)",
      ["must-rollback"],
    );
  },
  async verify() {
    throw new Error("migration_verify_failed");
  },
};

const commitFailureMigration: Migration = {
  version: 1,
  name: "commit-failure",
  kind: "additive",
  async up(transaction) {
    await transaction.execute(
      "CREATE TABLE retained (id TEXT PRIMARY KEY NOT NULL) STRICT",
    );
  },
  async verify() {},
};

type ContractCase = (
  adapter: MigrationsEffectsContractAdapter,
  caseId: MigrationsEffectsContractCaseId,
) => Promise<void>;

const contractCases: Record<MigrationsEffectsContractCaseId, ContractCase> = {
  async "migration-empty-v0"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ kernel }) => {
      const result = await createMigrationRunner({
        databaseName: caseId,
        kernel,
        migrations: PHASE1_MIGRATIONS,
      }).run();
      invariant(
        result.currentVersion === PHASE1_MIGRATIONS.at(-1)?.version,
        "empty_v0_version_not_committed",
      );
      invariant(
        result.appliedVersions.length === PHASE1_MIGRATIONS.length
        && result.appliedVersions.every(
          (version, index) => version === PHASE1_MIGRATIONS[index]?.version,
        ),
        "empty_v0_migration_not_applied",
      );
      invariant(
        await tableCount(kernel) >= 18,
        "empty_v0_schema_incomplete",
      );
    });
  },

  async "migration-retained-v1"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ kernel }) => {
      await createMigrationRunner({
        databaseName: caseId,
        kernel,
        migrations: PHASE1_MIGRATIONS,
      }).run();
      await kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO content_packs
            (id, namespace, version, source_revision, installed_at_ms)
           VALUES (?, ?, ?, ?, ?)`,
          ["retained-pack", "retained", 1, 9, 100],
        );
      });
      const result = await createMigrationRunner({
        databaseName: caseId,
        kernel,
        migrations: PHASE1_MIGRATIONS,
      }).run();
      const rows = await kernel.queryAll<{
        id: string;
        source_revision: number;
      }>(
        `SELECT id, source_revision FROM content_packs
         WHERE id = 'retained-pack'`,
      );
      invariant(
        result.appliedVersions.length === 0,
        "retained_current_reapplied",
      );
      invariant(
        rows[0]?.id === "retained-pack"
        && rows[0].source_revision === 9,
        "retained_v1_row_changed",
      );
    });
  },

  async "migration-statement-rollback"(adapter, caseId) {
    for (
      let statementIndex = 0;
      statementIndex < INITIAL_SCHEMA_STATEMENTS.length;
      statementIndex += 1
    ) {
      for (const phase of ["before", "after"] as const) {
        const databaseKey = `${caseId}-${phase}-${statementIndex}`;
        await withFreshRuntime(adapter, databaseKey, async ({ kernel }) => {
          let failed = false;
          try {
            await createMigrationRunner({
              databaseName: databaseKey,
              kernel,
              migrations: PHASE1_MIGRATIONS,
              failureInjector(event) {
                if (
                  event.phase === phase
                  && event.statementIndex === statementIndex
                ) {
                  throw new Error(`injected_${phase}_${statementIndex}`);
                }
              },
            }).run();
          } catch {
            failed = true;
          }
          invariant(failed, "statement_failure_not_observed");
          invariant(
            await userVersion(kernel) === 0,
            "statement_failure_version_changed",
          );
          invariant(
            await tableCount(kernel) === 0,
            "statement_failure_schema_changed",
          );
        });
      }
    }
  },

  async "migration-verify-rollback"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ kernel }) => {
      let failed = false;
      try {
        await createMigrationRunner({
          databaseName: caseId,
          kernel,
          migrations: [verifyFailureMigration],
        }).run();
      } catch {
        failed = true;
      }
      invariant(failed, "verify_failure_not_observed");
      invariant(await userVersion(kernel) === 0, "verify_failure_version_changed");
      invariant(await tableCount(kernel) === 0, "verify_failure_schema_changed");
    });
  },

  async "migration-commit-rollback"(adapter, caseId) {
    await withFreshRuntime(
      adapter,
      caseId,
      async ({ kernel }) => {
        let failed = false;
        try {
          await createMigrationRunner({
            databaseName: caseId,
            kernel,
            migrations: [commitFailureMigration],
          }).run();
        } catch {
          failed = true;
        }
        invariant(failed, "commit_failure_not_observed");
        invariant(
          await userVersion(kernel) === 0,
          "commit_failure_version_changed",
        );
        invariant(
          await tableCount(kernel) === 0,
          "commit_failure_schema_changed",
        );
      },
      {
        async beforeCommit() {
          throw new Error("injected_commit_failure");
        },
      },
    );
  },

  async "migration-integrity-block"(adapter, caseId) {
    await adapter.deleteDatabase(caseId);
    let runtime = await adapter.createRuntime(caseId);
    try {
      await createMigrationRunner({
        databaseName: caseId,
        kernel: runtime.kernel,
        migrations: PHASE1_MIGRATIONS,
      }).run();
    } finally {
      await runtime.close();
    }
    await adapter.insertForeignKeyViolation(caseId);
    runtime = await adapter.createRuntime(caseId);
    try {
      let failed = false;
      try {
        await createMigrationRunner({
          databaseName: caseId,
          kernel: runtime.kernel,
          migrations: PHASE1_MIGRATIONS,
        }).run();
      } catch {
        failed = true;
      }
      invariant(failed, "integrity_failure_not_observed");
      invariant(
        await userVersion(runtime.kernel) === PHASE1_MIGRATIONS.at(-1)?.version,
        "integrity_failure_version_changed",
      );
      const rows = await runtime.kernel.queryAll<{ id: string }>(
        "SELECT id FROM plan_days WHERE id = 'orphan-day'",
      );
      invariant(rows[0]?.id === "orphan-day", "integrity_failure_row_changed");
    } finally {
      await runtime.close();
      await adapter.deleteDatabase(caseId);
    }
  },

  async "migration-recovery-backup"(adapter, caseId) {
    const destructiveMigration: Migration = {
      ...PHASE1_MIGRATIONS[0]!,
      kind: "destructive",
    };
    await withFreshRuntime(adapter, caseId, async ({ databaseName, kernel }) => {
      const result = await createMigrationRunner({
        databaseName,
        kernel,
        migrations: [destructiveMigration],
        recoveryBackup: adapter.recoveryBackup,
      }).run();
      invariant(
        result.recoveryBackup?.validated === true,
        "recovery_backup_not_validated",
      );
      invariant(
        result.recoveryBackup.fromVersion === 0,
        "recovery_backup_version_incorrect",
      );
    });
  },

  async "effects-lease-replay"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ kernel }) => {
      await createMigrationRunner({
        databaseName: caseId,
        kernel,
        migrations: PHASE1_MIGRATIONS,
      }).run();
      const store = createEffectStore(kernel);
      await kernel.write((transaction) => enqueuePendingEffect(
        transaction,
        {
          id: "native-effect-lease",
          type: "reconcile_rest_notification",
          payloadVersion: 1,
          payload: { sessionId: "native-session" },
          idempotencyKey: "native-rest:session:r1",
          subjectId: "native-session",
          expectedRevision: 1,
          nowMs: 100,
        },
      ));
      const firstClaim = await store.claimNext({
        nowMs: 100,
        leaseDurationMs: 50,
        maxAttempts: EFFECT_MAX_ATTEMPTS,
      });
      invariant(firstClaim?.attemptCount === 1, "native_effect_not_claimed");
      invariant(
        await store.resetExpiredClaims(150) === 1,
        "native_effect_lease_not_reset",
      );

      let executions = 0;
      const runner = createEffectRunner({
        store,
        currentRevision: async () => 1,
        handlers: {
          reconcile_rest_notification: async () => {
            executions += 1;
            await kernel.write((transaction) => transaction.execute(
              `INSERT INTO app_settings
                (key, value_version, value_json, revision, updated_at_ms)
               VALUES (?, ?, ?, ?, ?)`,
              ["native-handler-reentry", 1, "{}", 1, 200],
            ));
          },
          regenerate_load_reps_recommendation: async () => undefined,
        },
      });
      const result = await runner.drain({ nowMs: 200, limit: 2 });
      invariant(result.completed === 1, "native_effect_not_completed");
      invariant(executions === 1, "native_effect_executed_more_than_once");
      invariant(
        (await store.findById("native-effect-lease"))?.attemptCount === 2,
        "native_effect_replay_attempt_missing",
      );
    });
  },

  async "effects-stale-revision"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ kernel }) => {
      await createMigrationRunner({
        databaseName: caseId,
        kernel,
        migrations: PHASE1_MIGRATIONS,
      }).run();
      const store = createEffectStore(kernel);
      await kernel.write((transaction) => enqueuePendingEffect(
        transaction,
        {
          id: "native-effect-stale",
          type: "regenerate_load_reps_recommendation",
          payloadVersion: 1,
          payload: { exerciseId: "native-exercise" },
          idempotencyKey: "native-recommendation:exercise:r1",
          subjectId: "native-exercise",
          expectedRevision: 1,
          nowMs: 100,
        },
      ));
      let executions = 0;
      const runner = createEffectRunner({
        store,
        currentRevision: async () => 2,
        handlers: {
          reconcile_rest_notification: async () => undefined,
          regenerate_load_reps_recommendation: async () => {
            executions += 1;
          },
        },
      });
      const result = await runner.drain({ nowMs: 100, limit: 1 });
      invariant(result.superseded === 1, "native_stale_effect_not_superseded");
      invariant(executions === 0, "native_stale_effect_executed");
    });
  },

  async "effects-retry-limit"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ kernel }) => {
      await createMigrationRunner({
        databaseName: caseId,
        kernel,
        migrations: PHASE1_MIGRATIONS,
      }).run();
      const store = createEffectStore(kernel);
      await kernel.write((transaction) => enqueuePendingEffect(
        transaction,
        {
          id: "native-effect-retry",
          type: "regenerate_load_reps_recommendation",
          payloadVersion: 1,
          payload: { exerciseId: "native-retry" },
          idempotencyKey: "native-recommendation:retry:r1",
          subjectId: "native-retry",
          expectedRevision: 1,
          nowMs: 0,
        },
      ));
      let executions = 0;
      const runner = createEffectRunner({
        store,
        currentRevision: async () => 1,
        handlers: {
          reconcile_rest_notification: async () => undefined,
          regenerate_load_reps_recommendation: async () => {
            executions += 1;
            throw new EffectExecutionError(
              "transient",
              "native_transient_failure",
            );
          },
        },
      });
      for (let attempt = 1; attempt <= EFFECT_MAX_ATTEMPTS; attempt += 1) {
        await runner.drain({ nowMs: attempt * 100_000, limit: 1 });
      }
      const effect = await store.findById("native-effect-retry");
      invariant(
        executions === EFFECT_MAX_ATTEMPTS,
        "native_retry_count_incorrect",
      );
      invariant(
        effect?.status === "permanent_failure"
        && effect.attemptCount === EFFECT_MAX_ATTEMPTS,
        "native_retry_limit_not_enforced",
      );
    });
  },
};

export async function createExpoMigrationsEffectsContractAdapter(
  runId: string,
): Promise<MigrationsEffectsContractAdapter> {
  const {
    backupDatabaseAsync,
    deleteDatabaseAsync,
    openDatabaseAsync,
  } = require("expo-sqlite") as typeof import("expo-sqlite");
  const {
    Directory,
    File,
    Paths,
  } = require("expo-file-system") as typeof import("expo-file-system");
  const databaseName = (databaseKey: string) =>
    `migrations-effects-${runId}-${databaseKey}.db`;
  const recoveryDirectory = new Directory(Paths.document, "backup-staging");
  recoveryDirectory.create({ idempotent: true, intermediates: true });
  const recoveryBackup = createExpoRecoveryBackupPort({
    openSource: (sourceName) =>
      openDatabaseAsync(sourceName, { useNewConnection: true }),
    openDestination: (destinationName) =>
      openDatabaseAsync(destinationName, { useNewConnection: true }),
    backup: ({ sourceDatabase, destDatabase }) =>
      backupDatabaseAsync({
        sourceDatabase: sourceDatabase as Awaited<
          ReturnType<typeof openDatabaseAsync>
        >,
        destDatabase: destDatabase as Awaited<
          ReturnType<typeof openDatabaseAsync>
        >,
      }),
    close: (database) => (
      database as Awaited<ReturnType<typeof openDatabaseAsync>>
    ).closeAsync(),
    validate: (backupName) => openSqliteKernelTestRuntime(backupName)
      .then(({ kernel }) => kernel),
    remove: (backupName) => deleteDatabaseAsync(backupName),
    async writeManifest(manifest) {
      const manifestFile = new File(
        recoveryDirectory,
        `${manifest.backupId}.json`,
      );
      if (manifestFile.exists) {
        manifestFile.delete();
      }
      manifestFile.create({ intermediates: true, overwrite: true });
      manifestFile.write(JSON.stringify(manifest));
    },
  });

  return {
    recoveryBackup,
    async createRuntime(databaseKey, observer = {}) {
      const resolvedDatabaseName = databaseName(databaseKey);
      const runtime = await openSqliteKernelTestRuntime(
        resolvedDatabaseName,
        observer,
      );
      return {
        ...runtime,
        databaseName: resolvedDatabaseName,
      };
    },
    deleteDatabase: (databaseKey) =>
      deleteDatabaseAsync(databaseName(databaseKey)).catch(() => undefined),
    async insertForeignKeyViolation(databaseKey) {
      const database = await openDatabaseAsync(
        databaseName(databaseKey),
        { useNewConnection: true },
      );
      try {
        await database.execAsync(`
          PRAGMA foreign_keys = OFF;
          INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
          VALUES ('orphan-day', 'missing-plan', 99, 'Orphan', 0);
        `);
      } finally {
        await database.closeAsync();
      }
    },
  };
}

export async function runMigrationsEffectsContract(
  adapter: MigrationsEffectsContractAdapter,
): Promise<MigrationsEffectsContractResult> {
  const startedAt = new Date().toISOString();
  const results: MigrationsEffectsContractCaseResult[] = [];

  for (const caseId of MIGRATIONS_EFFECTS_CONTRACT_CASES) {
    const caseStartedAt = Date.now();
    try {
      await contractCases[caseId](adapter, caseId);
      results.push({
        id: caseId,
        status: "passed",
        durationMs: Date.now() - caseStartedAt,
      });
    } catch (error) {
      results.push({
        id: caseId,
        status: "failed",
        durationMs: Date.now() - caseStartedAt,
        errorCode: safeErrorCode(error),
      });
    }
  }

  const passed = results.filter(({ status }) => status === "passed").length;
  const failed = results.length - passed;
  return {
    schemaVersion: 1,
    contractVersion: MIGRATIONS_EFFECTS_CONTRACT_VERSION,
    status: failed === 0 ? "passed" : "failed",
    total: results.length,
    passed,
    failed,
    skipped: 0,
    cases: results,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
