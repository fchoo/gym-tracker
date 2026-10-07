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
  LOGICAL_BACKUP_SCHEMA_23_TABLES,
} from "../../domains/portability/backupContracts";
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
] as const;

const PHASE1_MIGRATIONS = runtimeMigrations.filter(
  ({ version }) => version <= 3,
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
const MIGRATIONS_THROUGH_V22 = runtimeMigrations.filter(
  ({ version }) => version <= 22,
);

export type MigrationsEffectsContractCaseId =
  (typeof MIGRATIONS_EFFECTS_CONTRACT_CASES)[number];

type ContractRuntime = Readonly<{
  databaseName: string;
  kernel: SqliteKernel;
  recoveryBackup?: ReturnType<typeof createExpoRecoveryBackupPort>;
  close(): Promise<void>;
}>;

export interface MigrationsEffectsContractAdapter {
  createRuntime(
    databaseKey: string,
    observer?: SqliteKernelTestObserver,
  ): Promise<ContractRuntime>;
  cleanup?(): Promise<void>;
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
  // Expo SQLite database names are already scoped by the native run ID.
  // Deleting an isolated case while native handles are still releasing can
  // race Expo shared-object teardown, so cleanup is deferred to the matrix.
  const runtime = await adapter.createRuntime(databaseKey, observer);
  try {
    return await operation(runtime);
  } finally {
    await runtime.close();
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

  async "migration-fresh-v27-schema23-registry"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ databaseName, kernel }) => {
      const result = await createMigrationRunner({
        databaseName,
        kernel,
        migrations: runtimeMigrations,
        recoveryBackup: adapter.recoveryBackup,
      }).run();
      const triggers = await kernel.queryAll<{ name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger' AND name LIKE 'automatic_backup_generation_%'`,
      );
      invariant(result.currentVersion === 27, "fresh_v27_version_not_committed");
      invariant(
        triggers.length === LOGICAL_BACKUP_SCHEMA_23_TABLES.length * 3,
        "schema23_backup_trigger_registry_changed",
      );
    });
  },

  async "migration-retained-v1"(adapter, caseId) {
    let stage = "open";
    try {
      await withFreshRuntime(adapter, caseId, async ({ kernel }) => {
        stage = "initial_migration";
        await createMigrationRunner({
          databaseName: caseId,
          kernel,
          migrations: PHASE1_MIGRATIONS,
        }).run();
        stage = "retained_write";
        await kernel.write(async (transaction) => {
          await transaction.execute(
            `INSERT INTO content_packs
              (id, namespace, version, source_revision, installed_at_ms)
             VALUES (?, ?, ?, ?, ?)`,
            ["retained-pack", "retained", 1, 9, 100],
          );
        });
        stage = "repeat_migration";
        const result = await createMigrationRunner({
          databaseName: caseId,
          kernel,
          migrations: PHASE1_MIGRATIONS,
        }).run();
        stage = "retained_read";
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
    } catch (error) {
      throw new Error(`retained_v1_${stage}_${safeErrorCode(error)}`);
    }
  },

  async "migration-statement-rollback"(adapter, caseId) {
    for (
      let statementIndex = 0;
      statementIndex < INITIAL_SCHEMA_STATEMENTS.length;
      statementIndex += 1
    ) {
      for (const phase of ["before", "after"] as const) {
        const databaseKey = `${caseId}-${phase}-${statementIndex}`;
        try {
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
        } catch (error) {
          throw new Error(
            `migration_statement_rollback_${phase}_${statementIndex}_${safeErrorCode(error)}`,
          );
        }
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

  async "migration-session-exercise-edit-receipts-v20"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ databaseName, kernel }) => {
      await createMigrationRunner({
        databaseName,
        kernel,
        migrations: MIGRATIONS_THROUGH_V19,
        recoveryBackup: adapter.recoveryBackup,
      }).run();
      const result = await createMigrationRunner({
        databaseName,
        kernel,
        migrations: MIGRATIONS_THROUGH_V20,
        recoveryBackup: adapter.recoveryBackup,
      }).run();
      invariant(result.currentVersion === 20, "session_exercise_edit_receipts_version_not_committed");
      const sessionColumns = await kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(workout_sessions)",
      );
      const exerciseColumns = await kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(session_exercises)",
      );
      const receiptColumns = await kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(workout_session_exercise_edit_receipts)",
      );
      invariant(sessionColumns.some(({ name }) => name === "modified_from_plan"), "session_modified_flag_missing");
      invariant(exerciseColumns.some(({ name }) => name === "origin")
        && exerciseColumns.some(({ name }) => name === "display_ordinal"), "session_exercise_edit_columns_missing");
      invariant(receiptColumns.some(({ name }) => name === "request_id")
        && receiptColumns.some(({ name }) => name === "subject_session_exercise_id")
        && receiptColumns.some(({ name }) => name === "replacement_session_exercise_id")
        && !receiptColumns.some(({ name }) => name === "session_exercise_id"), "session_exercise_receipt_missing");
      const receiptForeignKeys = await kernel.queryAll<{ table: string }>(
        "PRAGMA foreign_key_list(workout_session_exercise_edit_receipts)",
      );
      invariant(receiptForeignKeys.length === 1
        && receiptForeignKeys[0]?.table === "workout_sessions", "session_exercise_receipt_foreign_key_invalid");
      const reorderColumns = await kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(workout_session_exercise_reorder_receipts)",
      );
      invariant(reorderColumns.some(({ name }) => name === "ordered_session_exercise_ids_json"), "session_exercise_reorder_receipt_missing");
      const reorderForeignKeys = await kernel.queryAll<{ table: string }>(
        "PRAGMA foreign_key_list(workout_session_exercise_reorder_receipts)",
      );
      invariant(reorderForeignKeys.length === 1 && reorderForeignKeys[0]?.table === "workout_sessions", "session_exercise_reorder_receipt_foreign_key_invalid");
      const reorderObjects = await kernel.queryAll<{ name: string; sql: string | null }>(
        "SELECT name, sql FROM sqlite_master WHERE name = 'workout_session_exercise_reorder_receipts'",
      );
      invariant(reorderObjects[0]?.sql?.includes("operation = 'reorder_exercises'") === true, "session_exercise_reorder_operation_invalid");
      await kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision)
           VALUES (?, NULL, NULL, 'manual', 'in_progress', '2026-09-16',
                   'Asia/Singapore', 1, NULL, 0)`,
          ["v20-edit-receipt-contract-session"],
        );
        for (const operation of ["replace_exercise", "remove_exercise"] as const) {
          await transaction.execute(
            `INSERT INTO workout_session_exercise_edit_receipts
              (request_id, request_sha256, operation, session_id,
               subject_session_exercise_id, replacement_session_exercise_id,
               expected_session_revision, result_session_revision, result_json,
               committed_at_ms)
             VALUES (?, ?, ?, ?, ?, ?, 0, 1, '{}', 2)`,
            [
              `v20-${operation}`,
              "a".repeat(64),
              operation,
              "v20-edit-receipt-contract-session",
              `v20-${operation}-subject`,
              operation === "replace_exercise"
                ? "v20-replacement"
                : null,
            ],
          );
        }
      });
      const scalarOperations = await kernel.queryAll<{ operation: string }>(
        `SELECT operation
         FROM workout_session_exercise_edit_receipts
         WHERE request_id IN ('v20-replace_exercise', 'v20-remove_exercise')
         ORDER BY request_id`,
      );
      invariant(
        scalarOperations.map(({ operation }) => operation).join(",")
          === "remove_exercise,replace_exercise",
        "session_exercise_edit_scalar_operations_rejected",
      );
      for (const operation of ["invalid_edit_operation", "reorder_exercises"]) {
        let rejected = false;
        try {
          await kernel.write((transaction) => transaction.execute(
            `INSERT INTO workout_session_exercise_edit_receipts
              (request_id, request_sha256, operation, session_id,
               subject_session_exercise_id, replacement_session_exercise_id,
               expected_session_revision, result_session_revision, result_json,
               committed_at_ms)
             VALUES (?, ?, ?, ?, ?, NULL, 0, 1, '{}', 2)`,
            [
              `v20-rejected-${operation}`,
              "a".repeat(64),
              operation,
              "v20-edit-receipt-contract-session",
              "v20-rejected-subject",
            ],
          ));
        } catch {
          rejected = true;
        }
        invariant(rejected, `session_exercise_edit_${operation}_accepted`);
      }
      const triggers = await kernel.queryAll<{ name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger'
           AND name IN (
             'workout_session_exercise_edit_receipts_immutable_update',
             'workout_session_exercise_edit_receipts_immutable_delete'
           )`,
      );
      invariant(triggers.length === 2, "session_exercise_receipt_immutability_missing");
    });
  },

  async "migration-advanced-set-timing-v21"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ databaseName, kernel }) => {
      await createMigrationRunner({
        databaseName,
        kernel,
        migrations: MIGRATIONS_THROUGH_V20,
        recoveryBackup: adapter.recoveryBackup,
      }).run();
      const result = await createMigrationRunner({
        databaseName,
        kernel,
        migrations: MIGRATIONS_THROUGH_V21,
        recoveryBackup: adapter.recoveryBackup,
      }).run();
      invariant(result.currentVersion === 21, "advanced_timing_version_not_committed");
      const perRep = '{"version":1,"mode":"per_rep","intervalMs":1000,"cueChannels":"haptic"}';
      const off = '{"version":1,"mode":"off"}';
      const planColumns = await kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(plan_day_exercises)",
      );
      const ownedPlanColumns = await kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(owned_plan_day_exercises)",
      );
      const setColumns = await kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(session_sets)",
      );
      invariant(
        planColumns.some(({ name }) => name === "advanced_timing_default_json")
          && ownedPlanColumns.some(({ name }) => name === "advanced_timing_default_json")
          && setColumns.some(({ name }) => name === "advanced_timing_override_json")
          && setColumns.some(({ name }) => name === "advanced_timing_resolved_json"),
        "advanced_timing_snapshot_columns_missing",
      );
      const stateColumns = await kernel.queryAll<{ name: string }>(
        "PRAGMA table_info(session_advanced_timing_states)",
      );
      invariant(
        stateColumns.some(({ name }) => name === "session_id")
          && stateColumns.some(({ name }) => name === "session_set_id")
          && stateColumns.some(({ name }) => name === "revision"),
        "advanced_timing_state_columns_missing",
      );
      await kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision)
           VALUES ('v21-contract-session', NULL, NULL, 'manual', 'in_progress',
                   '2026-09-16', 'Asia/Singapore', 1, NULL, 0)`,
        );
        await transaction.execute(
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             metric_profile, metric_contract_version, exercise_metric_generation,
             equipment, default_rest_seconds, revision)
           VALUES ('v21-contract-exercise', NULL, 'custom', NULL, NULL,
                   'V21 contract exercise', 'load_reps', 1, 1, 'Unspecified', 90, 1)`,
        );
        await transaction.execute(
          `INSERT INTO session_exercises
            (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
             origin, display_ordinal, exercise_name, metric_profile,
             metric_contract_version, exercise_metric_generation,
             advanced_timing_default_json, default_rest_seconds, target_revision,
             status, revision)
           VALUES ('v21-contract-session-exercise', 'v21-contract-session', NULL,
                   'v21-contract-exercise', 0, 'planned', 0, 'V21 contract exercise',
                   'load_reps', 1, 1, ?, 90, 0, 'active', 0)`,
          [perRep],
        );
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal,
             source_plan_working_set_target_id, source_owned_plan_working_set_target_id,
             advanced_timing_override_json, advanced_timing_resolved_json,
             target_load_grams, target_min_reps, target_max_reps, target_json, unit_json,
             rule_type, rule_version, metric_profile, metric_contract_version,
             exercise_metric_generation, status, revision)
           VALUES ('v21-contract-set', 'v21-contract-session-exercise', 'working', 0,
                   NULL, NULL, NULL, ?, 0, 0, 0, '{}', '{}', 'load_reps', 1,
                   'load_reps', 1, 1, 'planned', 0)`,
          [perRep],
        );
        await transaction.execute(
          `INSERT INTO session_advanced_timing_states
            (session_id, session_set_id, state_version, revision, status, mode,
             config_json, progress_json, started_at_ms, next_boundary_at_ms,
             remaining_ms, stopped_at_ms)
           VALUES ('v21-contract-session', 'v21-contract-set', 1, 0, 'running',
                   'per_rep', ?, '{"nextRepetitionIndex":1}', 1, 1001, NULL, NULL)`,
          [perRep],
        );
      });
      const [state] = await kernel.queryAll<{
        config_json: string;
        revision: number;
        session_set_id: string;
      }>(
        `SELECT config_json, revision, session_set_id
         FROM session_advanced_timing_states
         WHERE session_id = 'v21-contract-session'`,
      );
      invariant(
        state?.config_json === perRep
          && state.revision === 0
          && state.session_set_id === "v21-contract-set",
        "advanced_timing_state_not_persisted",
      );
      let malformedRejected = false;
      try {
        await kernel.write((transaction) => transaction.execute(
          `UPDATE session_sets
           SET advanced_timing_resolved_json = ?
           WHERE id = 'v21-contract-set'`,
          ['{"version":1,"mode":"per_rep","intervalMs":99,"cueChannels":"haptic"}'],
        ));
      } catch {
        malformedRejected = true;
      }
      invariant(malformedRejected, "advanced_timing_invalid_config_accepted");
      const [resolved] = await kernel.queryAll<{
        advanced_timing_resolved_json: string;
      }>(
        `SELECT advanced_timing_resolved_json
         FROM session_sets WHERE id = 'v21-contract-set'`,
      );
      invariant(
        resolved?.advanced_timing_resolved_json === perRep
          && off === '{"version":1,"mode":"off"}',
        "advanced_timing_snapshot_not_immutable",
      );
    });
  },

  async "migration-portable-owner-identities-v22"(adapter, caseId) {
    await withFreshRuntime(adapter, caseId, async ({ databaseName, kernel }) => {
      await createMigrationRunner({
        databaseName,
        kernel,
        migrations: MIGRATIONS_THROUGH_V21,
        recoveryBackup: adapter.recoveryBackup,
      }).run();
      await kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO exercises
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             metric_profile, metric_contract_version, exercise_metric_generation,
             equipment, default_rest_seconds, revision)
           VALUES ('v22-contract-exercise', NULL, 'custom', NULL, NULL,
                   'V22 contract exercise', 'load_reps', 1, 1, 'Unspecified', 90, 1)`,
        );
        await transaction.execute(
          `INSERT INTO plans
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision)
           VALUES ('v22-contract-plan', NULL, 'custom', NULL, NULL,
                   'V22 contract plan', 1, 'Owner', 'Strength', 45, 'Owner', 0, 1)`,
        );
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, revision)
           VALUES ('v22-contract-session', NULL, NULL, 'manual', 'in_progress',
                   '2026-09-19', 'Asia/Singapore', 19, NULL, 1)`,
        );
      });
      const result = await createMigrationRunner({
        databaseName,
        kernel,
        migrations: MIGRATIONS_THROUGH_V22,
        recoveryBackup: adapter.recoveryBackup,
      }).run();
      invariant(result.currentVersion === 22, "portable_owner_identity_version_not_committed");
      const [owner] = await kernel.queryAll<{ id: number; owner_namespace: string }>(
        "SELECT id, owner_namespace FROM portable_owner_identity",
      );
      invariant(
        owner?.id === 1 && /^[a-f0-9]{32}$/u.test(owner.owner_namespace),
        "portable_owner_namespace_invalid",
      );
      const roots = await kernel.queryAll<{ portable_id: string | null; merge_modified_at_ms?: number }>(
        `SELECT portable_id FROM exercises WHERE id = 'v22-contract-exercise'
         UNION ALL
         SELECT portable_id FROM plans WHERE id = 'v22-contract-plan'`,
      );
      invariant(
        roots.length === 2
          && roots.every(({ portable_id }) => portable_id !== null && /^[a-f0-9]{32}$/u.test(portable_id)),
        "portable_owner_roots_not_backfilled",
      );
      const [session] = await kernel.queryAll<{ portable_id: string; merge_modified_at_ms: number }>(
        `SELECT portable_id, merge_modified_at_ms FROM workout_sessions
         WHERE id = 'v22-contract-session'`,
      );
      invariant(
        session !== undefined
          && /^[a-f0-9]{32}$/u.test(session.portable_id)
          && session.merge_modified_at_ms === 19,
        "portable_owner_session_not_backfilled",
      );
      let immutableRejected = false;
      try {
        await kernel.write((transaction) => transaction.execute(
          `UPDATE workout_sessions
           SET portable_id = '00000000000000000000000000000000'
           WHERE id = 'v22-contract-session'`,
        ));
      } catch {
        immutableRejected = true;
      }
      invariant(immutableRejected, "portable_owner_identity_mutation_accepted");
    });
  },

  async "effects-lease-replay"(adapter, caseId) {
    let stage = "create_runtime";
    try {
      await withFreshRuntime(adapter, caseId, async ({ kernel }) => {
      stage = "migrate";
      await createMigrationRunner({
        databaseName: caseId,
        kernel,
        migrations: PHASE1_MIGRATIONS,
      }).run();
      const store = createEffectStore(kernel);
      stage = "enqueue";
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
      stage = "first_claim";
      const firstClaim = await store.claimNext({
        nowMs: 100,
        leaseDurationMs: 50,
        maxAttempts: EFFECT_MAX_ATTEMPTS,
      });
      invariant(firstClaim?.attemptCount === 1, "native_effect_not_claimed");
      stage = "reset_expired_claim";
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
      stage = "drain";
      const result = await runner.drain({ nowMs: 200, limit: 2 });
      invariant(result.completed === 1, "native_effect_not_completed");
      invariant(executions === 1, "native_effect_executed_more_than_once");
      stage = "verify_replay";
      invariant(
        (await store.findById("native-effect-lease"))?.attemptCount === 2,
        "native_effect_replay_attempt_missing",
      );
      });
    } catch (error) {
      throw new Error(`native_effect_lease_${stage}_${safeErrorCode(error)}`);
    }
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
  const contractDatabaseNames = new Set<string>();
  const openOptions = {
    useNewConnection: true,
    finalizeUnusedStatementsBeforeClosing: false,
  } as const;
  const recoveryDirectory = new Directory(Paths.document, "backup-staging");
  recoveryDirectory.create({ idempotent: true, intermediates: true });
  const recoveryBackupFor = (databaseKey: string) => createExpoRecoveryBackupPort({
    backupIdPrefix: `${databaseName(databaseKey).replace(/\.db$/u, "")}-`,
    openSource: (sourceName) =>
      openDatabaseAsync(sourceName, openOptions),
    openDestination(destinationName) {
      contractDatabaseNames.add(destinationName);
      return openDatabaseAsync(destinationName, openOptions);
    },
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
    recoveryBackup: recoveryBackupFor("shared"),
    async createRuntime(databaseKey, observer = {}) {
      const resolvedDatabaseName = databaseName(databaseKey);
      contractDatabaseNames.add(resolvedDatabaseName);
      const runtime = await openSqliteKernelTestRuntime(
        resolvedDatabaseName,
        observer,
      );
      return {
        ...runtime,
        databaseName: resolvedDatabaseName,
        recoveryBackup: recoveryBackupFor(databaseKey),
      };
    },
    async cleanup() {
      await Promise.all(
        [...contractDatabaseNames].map((name) =>
          deleteDatabaseAsync(name).catch(() => undefined)),
      );
    },
    async insertForeignKeyViolation(databaseKey) {
      const database = await openDatabaseAsync(
        databaseName(databaseKey),
        openOptions,
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

  try {
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
  } finally {
    if (adapter.cleanup !== undefined) {
      await adapter.cleanup().catch(() => undefined);
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
