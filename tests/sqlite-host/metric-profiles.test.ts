import {
  afterEach,
  describe,
  expect,
  it,
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
  type MetricIdentity,
  type MetricTarget,
} from "../../src/domains/metrics/contracts";
import {
  serializeMetricTarget,
} from "../../src/domains/metrics/observations";
import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  initialMigration,
} from "../../src/platform/sqlite/migrations/0001_initial";
import {
  outcomeEffortMigration,
} from "../../src/platform/sqlite/migrations/0002_outcome_effort";
import {
  exerciseHistoryIndexMigration,
} from "../../src/platform/sqlite/migrations/0003_exercise_history_index";
import {
  contentLibraryMigration,
} from "../../src/platform/sqlite/migrations/0004_content_library";
import {
  exerciseSearchFtsMigration,
} from "../../src/platform/sqlite/migrations/0005_exercise_search_fts";
import {
  assertMetricProfileRegistryPairs,
  metricProfilesMigration,
} from "../../src/platform/sqlite/migrations/0006_metric_profiles";
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

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

type TargetCase = Readonly<{
  name: string;
  identity: MetricIdentity;
  target: MetricTarget;
}>;

const TARGET_CASES: readonly TargetCase[] = [
  {
    name: "load reps",
    identity: {
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams: Number.MAX_SAFE_INTEGER,
      minReps: 1,
      maxReps: 2,
      incrementGrams: 1,
      perSide: false,
    },
  },
  {
    name: "bodyweight reps",
    identity: {
      profile: "bodyweight_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "bodyweight_reps",
      minReps: 1,
      maxReps: 20,
      variationId: "strict",
      perSide: false,
    },
  },
  {
    name: "added load reps",
    identity: {
      profile: "added_load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "added_load_reps",
      addedLoadGrams: 0,
      minReps: 1,
      maxReps: 12,
      incrementGrams: 1,
      perSide: false,
    },
  },
  {
    name: "assisted reps",
    identity: {
      profile: "assisted_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "assisted_reps",
      assistanceGrams: 0,
      minReps: 1,
      maxReps: 12,
      decrementGrams: 1,
      assistanceEquipmentId: "machine",
      perSide: false,
    },
  },
  {
    name: "legacy timed hold",
    identity: {
      profile: "timed_hold",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "timed_hold",
      durationSeconds: 45,
      perSide: false,
    },
  },
  {
    name: "millisecond timed hold",
    identity: {
      profile: "timed_hold",
      contractVersion: 2,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 2,
      profile: "timed_hold",
      durationMs: 45_500,
      perSide: false,
    },
  },
  {
    name: "fixed distance",
    identity: {
      profile: "fixed_distance",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "fixed_distance",
      plannedDistanceMeters: Number.MAX_SAFE_INTEGER,
    },
  },
  {
    name: "fixed time",
    identity: {
      profile: "fixed_time",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "fixed_time",
      plannedDurationMs: Number.MAX_SAFE_INTEGER,
    },
  },
  {
    name: "intervals",
    identity: {
      profile: "intervals",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "intervals",
      protocolId: "bike_30_30_6",
      comparatorId: "rounds_then_work",
      comparatorVersion: 1,
      plannedRounds: 6,
      workIntervalMs: 30_000,
      restIntervalMs: 0,
    },
  },
  {
    name: "unscored",
    identity: {
      profile: "unscored",
      contractVersion: 1,
      exerciseMetricGeneration: 2,
    },
    target: {
      version: 1,
      profile: "unscored",
      completionRequired: true,
    },
  },
];

const repositoryRoot = join(__dirname, "../..");
const migrations = [
  initialMigration,
  outcomeEffortMigration,
  exerciseHistoryIndexMigration,
  contentLibraryMigration,
  exerciseSearchFtsMigration,
  metricProfilesMigration,
] as const;
const temporaryDirectories = new Set<string>();
const runtimes: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function createRuntime(fixtureVersion: 0 | 1 | 2 | 3 | 4 | 5) {
  const directory = mkdtempSync(join(tmpdir(), "gym-metric-profiles-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  if (fixtureVersion >= 1) {
    fixtureDatabase.exec(readFileSync(
      join(repositoryRoot, "tests/migrations/fixtures/v1-phase1.sql"),
      "utf8",
    ));
  }
  if (fixtureVersion === 2) {
    fixtureDatabase.exec(readFileSync(
      join(repositoryRoot, "tests/migrations/fixtures/v2-phase1.sql"),
      "utf8",
    ));
  } else if (fixtureVersion === 3) {
    fixtureDatabase.exec(readFileSync(
      join(repositoryRoot, "tests/migrations/fixtures/v3-phase1.sql"),
      "utf8",
    ));
  } else if (fixtureVersion >= 4) {
    fixtureDatabase.exec(readFileSync(
      join(repositoryRoot, "tests/migrations/fixtures/v4-content-library.sql"),
      "utf8",
    ));
    if (fixtureVersion >= 5) {
      fixtureDatabase.exec(readFileSync(
        join(repositoryRoot, "tests/migrations/fixtures/v5-search-fts.sql"),
        "utf8",
      ));
    }
  }
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  runtimes.push(kernel);
  return kernel;
}

async function migrateToV6(kernel: SqliteKernel): Promise<void> {
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: `retained-${request.fromVersion}-${request.toVersion}`,
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    }),
  };
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
}

describe("metric profile persistence migration", () => {
  it("fails closed when migration schema and registry pairs drift", () => {
    expect(() => assertMetricProfileRegistryPairs([])).toThrow(
      "metric_profile_registry_schema_mismatch",
    );
    expect(() => assertMetricProfileRegistryPairs([
      ...Array.from({ length: 10 }, () => ({
        profile: "load_reps",
        contractVersion: 1,
      })),
    ] as never)).toThrow("metric_profile_registry_schema_mismatch");
  });

  it.each([
    {
      name: "missing widened column",
      queryAll: async <Row extends Record<string, unknown>>(
        sql: string,
      ): Promise<readonly Row[]> => (
        sql.startsWith("PRAGMA table_info(") ? [] : []
      ) as Row[],
      error: "metric_profile_schema_incomplete",
    },
    {
      name: "invalid persisted identity",
      queryAll: async <Row extends Record<string, unknown>>(
        sql: string,
      ): Promise<readonly Row[]> => {
        if (sql.startsWith("PRAGMA table_info(")) {
          return [
            { name: "metric_profile" },
            { name: "metric_contract_version" },
            { name: "exercise_metric_generation" },
            { name: "target_json" },
            { name: "observed_json" },
          ] as unknown as Row[];
        }
        return [{ count: 1 }] as unknown as Row[];
      },
      error: "metric_profile_identity_invalid",
    },
    {
      name: "missing support table",
      queryAll: async <Row extends Record<string, unknown>>(
        sql: string,
      ): Promise<readonly Row[]> => {
        if (sql.startsWith("PRAGMA table_info(")) {
          return [
            { name: "metric_profile" },
            { name: "metric_contract_version" },
            { name: "exercise_metric_generation" },
            { name: "target_json" },
            { name: "observed_json" },
          ] as unknown as Row[];
        }
        if (sql.includes("COUNT(*)")) {
          return [{ count: 0 }] as unknown as Row[];
        }
        return [] as Row[];
      },
      error: "metric_profile_support_schema_incomplete",
    },
  ])("rejects $name during verification", async ({ queryAll, error }) => {
    await expect(metricProfilesMigration.verify({
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll,
    })).rejects.toThrow(error);
  });

  it.each([0, 1, 2, 3, 4, 5] as const)(
    "migrates retained version %i directly to metric schema version 6",
    async (fixtureVersion) => {
      const kernel = await createRuntime(fixtureVersion);
      await migrateToV6(kernel);

      await expect(kernel.queryAll("PRAGMA foreign_key_check")).resolves
        .toEqual([]);
      await expect(kernel.queryAll<{ user_version: number }>(
        "PRAGMA user_version",
      )).resolves.toEqual([{ user_version: 6 }]);
    },
  );

  it("preserves legacy load/reps and timed-hold JSON bytes and seconds", async () => {
    const kernel = await createRuntime(5);
    const before = {
      targets: await kernel.queryAll(
        `SELECT *
         FROM plan_working_set_targets
         ORDER BY id`,
      ),
      snapshots: await kernel.queryAll(
        `SELECT *
         FROM session_exercises
         ORDER BY id`,
      ),
      sets: await kernel.queryAll(
        `SELECT *
         FROM session_sets
         ORDER BY id`,
      ),
      undo: await kernel.queryAll(
        `SELECT *
         FROM session_undo_snapshots
         ORDER BY id`,
      ),
    };

    await migrateToV6(kernel);

    const migratedTargets = await kernel.queryAll<Record<string, unknown>>(
      `SELECT *
       FROM plan_working_set_targets
       ORDER BY id`,
    );
    const migratedSnapshots = await kernel.queryAll<Record<string, unknown>>(
      `SELECT *
       FROM session_exercises
       ORDER BY id`,
    );
    const migratedSets = await kernel.queryAll<Record<string, unknown>>(
      `SELECT *
       FROM session_sets
       ORDER BY id`,
    );
    expect(migratedTargets.map((row) => {
      const {
        metric_contract_version: _contract,
        exercise_metric_generation: _generation,
        metric_profile: _profile,
        ...legacy
      } = row;
      return legacy;
    })).toEqual(before.targets);
    expect(migratedSnapshots.map((row) => {
      const {
        metric_contract_version: _contract,
        exercise_metric_generation: _generation,
        ...legacy
      } = row;
      return legacy;
    })).toEqual(before.snapshots);
    expect(migratedSets.map((row) => {
      const {
        metric_contract_version: _contract,
        exercise_metric_generation: _generation,
        metric_profile: _profile,
        ...legacy
      } = row;
      return legacy;
    })).toEqual(before.sets);
    await expect(kernel.queryAll(
      `SELECT *
       FROM session_undo_snapshots
       ORDER BY id`,
    )).resolves.toEqual(before.undo);
    await expect(kernel.queryAll(
      `SELECT metric_profile, metric_contract_version,
              exercise_metric_generation
       FROM session_exercises
       WHERE id = 'session-exercise-plank'`,
    )).resolves.toEqual([{
      exercise_metric_generation: 1,
      metric_contract_version: 1,
      metric_profile: "timed_hold",
    }]);
  });

  it.each(TARGET_CASES)(
    "round-trips E-64..E-78 boundary identity for $name",
    async ({ identity, target }) => {
      const kernel = await createRuntime(5);
      await migrateToV6(kernel);
      const serialized = serializeMetricTarget(identity, target);

      await kernel.write(async (transaction) => {
        await transaction.execute(
          `UPDATE exercises
           SET metric_profile = ?,
               metric_contract_version = ?,
               exercise_metric_generation = ?
           WHERE id = 'exercise-plank'`,
          [
            identity.profile,
            identity.contractVersion,
            identity.exerciseMetricGeneration,
          ],
        );
        await transaction.execute(
          `UPDATE plan_day_exercises
           SET metric_profile = ?,
               metric_contract_version = ?,
               exercise_metric_generation = ?
           WHERE id = 'plan-day-exercise-plank'`,
          [
            identity.profile,
            identity.contractVersion,
            identity.exerciseMetricGeneration,
          ],
        );
        await transaction.execute(
          `UPDATE progression_policies
           SET metric_profile = ?,
               metric_contract_version = ?,
               exercise_metric_generation = ?
           WHERE id = 'policy-plank'`,
          [
            identity.profile,
            identity.contractVersion,
            identity.exerciseMetricGeneration,
          ],
        );
        await transaction.execute(
          `UPDATE plan_working_set_targets
           SET target_json = ?,
               metric_profile = ?,
               metric_contract_version = ?,
               exercise_metric_generation = ?
           WHERE id = 'working-target-plank'`,
          [
            serialized,
            identity.profile,
            identity.contractVersion,
            identity.exerciseMetricGeneration,
          ],
        );
      });

      await expect(kernel.queryAll(
        `SELECT metric_profile, metric_contract_version,
                exercise_metric_generation, target_json
         FROM plan_working_set_targets
         WHERE id = 'working-target-plank'`,
      )).resolves.toEqual([{
        exercise_metric_generation: identity.exerciseMetricGeneration,
        metric_contract_version: identity.contractVersion,
        metric_profile: identity.profile,
        target_json: serialized,
      }]);
    },
  );

  it("rejects invalid or unsupported identity/value combinations before writes", async () => {
    const kernel = await createRuntime(5);
    await migrateToV6(kernel);
    const count = () => kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM plan_working_set_targets
       WHERE exercise_metric_generation > 1`,
    );

    expect(() => serializeMetricTarget(
      {
        profile: "timed_hold",
        contractVersion: 99,
        exerciseMetricGeneration: 2,
      },
      {
        version: 2,
        profile: "timed_hold",
        durationMs: 45_000,
        perSide: false,
      },
    )).toThrow("metric_identity_unsupported");
    expect(() => serializeMetricTarget(
      {
        profile: "timed_hold",
        contractVersion: 2,
        exerciseMetricGeneration: 2,
      },
      {
        version: 2,
        profile: "timed_hold",
        durationMs: 0,
        perSide: false,
      },
    )).toThrow("metric_target_invalid");
    await expect(count()).resolves.toEqual([{ count: 0 }]);
  });
});
