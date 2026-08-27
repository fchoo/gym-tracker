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
  migrations as runtimeMigrations,
} from "../../src/platform/sqlite/migrations";
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

function fixture(name: "v0-empty.sql" | "v1-phase1.sql"): string {
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
    expect(runtimeMigrations.at(-1)?.version).toBeGreaterThanOrEqual(12);
    expect(runtimeMigrations.slice(0, 3)).toEqual(migrations);
    expect(initialMigration).toEqual(expect.objectContaining({
      kind: "additive",
      name: "initial",
      version: 1,
    }));
    expect(INITIAL_SCHEMA_STATEMENTS.length).toBeGreaterThanOrEqual(20);
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
      async deleteDatabase(databaseKey) {
        const runtime = runtimes.get(databaseKey);
        if (runtime !== undefined) {
          await runtime.close().catch(() => undefined);
          runtimes.delete(databaseKey);
        }
        const databasePath = databasePaths.get(databaseKey);
        if (databasePath !== undefined) {
          rmSync(databasePath, { force: true });
          rmSync(`${databasePath}-shm`, { force: true });
          rmSync(`${databasePath}-wal`, { force: true });
        }
      },
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
  });

  it("keeps a dedicated migration suite without changing the kernel ten-case contract", () => {
    expect(MIGRATIONS_EFFECTS_CONTRACT_CASES).toEqual([
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
    const deviceCommand = packageJson.scripts?.["test:sqlite:device"] ?? "";

    expect(route).toContain("migrations-effects");
    expect(route).toContain("EXPO_PUBLIC_NATIVE_CONTRACT_SUITE");
    expect(deviceCommand).toContain("migrations-effects");
    expect(deviceCommand).toContain("--assert-all");
    expect(deviceCommand).toContain("run-native-sqlite-contracts.mjs");
    expect(verifier).toContain("expectedCaseIds");
    expect(verifier).toContain("contract expected count");
    expect(verifier).toContain("contract cases must contain exactly ten results");
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
