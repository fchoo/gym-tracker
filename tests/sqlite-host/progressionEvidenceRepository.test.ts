import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  progressionEvidenceMigration,
} from "../../src/platform/sqlite/migrations/0015_progression_evidence";
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>>
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

class Statement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (null | number | string | Uint8Array)[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];
const recoveryBackup: RecoveryBackupPort = {
  createAndValidate: async (request) => ({
    backupId: "progression-evidence",
    databaseName: request.databaseName,
    fromVersion: request.fromVersion,
    toVersion: request.toVersion,
    validated: true,
  }),
};

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function openAtV14(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-progression-evidence-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: migrations.filter(({ version }) => version <= 14),
    recoveryBackup,
  }).run();
  kernels.push(kernel);
  return kernel;
}

const loadRepsTarget = JSON.stringify({
  version: 1,
  profile: "load_reps",
  loadGrams: 40_000,
  minReps: 8,
  maxReps: 10,
  incrementGrams: 2_500,
  perSide: false,
});

async function insertTargets(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('evidence-exercise', NULL, 'custom', NULL, NULL,
               'Evidence exercise', 'load_reps', 1, 1, 'Barbell', 90, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES ('evidence-plan', NULL, 'custom', NULL, NULL, 'Evidence plan',
               1, 'Owner', 'Strength', 30, 'Owner', 0, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
       VALUES ('evidence-day', 'evidence-plan', 0, 'Day', 1)`,
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version,
         exercise_metric_generation, availability, revision)
       VALUES ('evidence-exercise', 'custom', 'Evidence exercise',
               'strength', 'compound', 'load_reps', 1, 1, 'available', 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
         metric_profile, metric_contract_version, exercise_metric_generation,
         revision)
       VALUES ('legacy-occurrence', 'evidence-day', 'evidence-exercise', 0,
               90, 'load_reps', 1, 1, 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
         target_json, unit_json, metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES ('legacy-target', 'legacy-occurrence', 0, 40000, 8, 10, ?,
               '{"version":1,"load":"grams","count":"repetitions"}',
               'load_reps', 1, 1, 3)`,
      [loadRepsTarget],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
         metric_profile, metric_contract_version, exercise_metric_generation,
         revision)
       VALUES ('owned-occurrence', 'evidence-day', 'evidence-exercise', 0,
               90, 'load_reps', 1, 1, 1)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version, exercise_metric_generation,
         revision)
       VALUES ('owned-target', 'owned-occurrence', 0, ?,
               '{"version":1,"load":"grams","count":"repetitions"}',
               'load_reps', 1, 1, 4)`,
      [loadRepsTarget],
    );
  });
}

async function insertLegacyRecommendation(
  kernel: SqliteKernel,
  graph: "legacy" | "owned",
): Promise<void> {
  const table = graph === "legacy"
    ? "progression_recommendations"
    : "owned_progression_recommendations";
  const targetColumn = graph === "legacy"
    ? "plan_working_set_target_id"
    : "owned_plan_working_set_target_id";
  const targetId = graph === "legacy" ? "legacy-target" : "owned-target";
  await kernel.write((transaction) => transaction.execute(
    `INSERT INTO ${table}
      (id, exercise_id, ${targetColumn}, rule_type, rule_version,
       evidence_version, evidence_json, current_target_json, proposed_target_json,
       metric_profile, metric_contract_version, exercise_metric_generation,
       status, source_revision, target_revision, created_at_ms, decided_at_ms)
     VALUES (?, 'evidence-exercise', ?, 'load_reps', 1, 1,
             '{"sets":["8","8","8"]}', ?, ?, 'load_reps', 1, 1,
             'accepted', 3, 3, 1000, 1001)`,
    [`legacy-${graph}`, targetId, loadRepsTarget, loadRepsTarget],
  ));
}

async function insertIncompleteActionableRecommendation(
  kernel: SqliteKernel,
  graph: "legacy" | "owned",
): Promise<void> {
  const table = graph === "legacy"
    ? "progression_recommendations"
    : "owned_progression_recommendations";
  const targetColumn = graph === "legacy"
    ? "plan_working_set_target_id"
    : "owned_plan_working_set_target_id";
  const targetId = graph === "legacy" ? "legacy-target" : "owned-target";
  const targetRevision = graph === "legacy" ? 3 : 4;
  await kernel.write((transaction) => transaction.execute(
    `INSERT INTO ${table}
      (id, exercise_id, ${targetColumn}, rule_type, rule_version,
       evidence_version, evidence_json, current_target_json, proposed_target_json,
       metric_profile, metric_contract_version, exercise_metric_generation,
       status, source_revision, target_revision, created_at_ms, decided_at_ms)
     VALUES (?, 'evidence-exercise', ?, 'load_reps', 1, 2, '{"version":2}',
             ?, ?, 'load_reps', 1, 1, 'pending', ${targetRevision},
             ${targetRevision}, 2000, NULL)`,
    [`incomplete-${graph}`, targetId, loadRepsTarget, loadRepsTarget],
  ));
}

describe("progression evidence migration", () => {
  it("fails closed when one required actionable-evidence trigger is absent", async () => {
    await expect(progressionEvidenceMigration.verify({
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() => [
        { name: "progression_recommendations_actionable_evidence_insert" },
        { name: "progression_recommendations_actionable_evidence_update" },
        { name: "owned_progression_recommendations_actionable_evidence_insert" },
      ] as unknown as readonly Row[],
    })).rejects.toThrow("progression_evidence_schema_incomplete");
  });

  it.each(["legacy", "owned"] as const)(
    "retains %s v1 rows but rejects incomplete pending v2 evidence",
    async (graph) => {
      const kernel = await openAtV14();
      await insertTargets(kernel);
      await insertLegacyRecommendation(kernel, graph);

      await createMigrationRunner({
        databaseName: "gym-tracker.db",
        kernel,
        migrations,
        recoveryBackup,
      }).run();

      const table = graph === "legacy"
        ? "progression_recommendations"
        : "owned_progression_recommendations";
      await expect(kernel.queryAll(
        `SELECT id, evidence_version, status, decided_at_ms
         FROM ${table}
         WHERE id = ?`,
        [`legacy-${graph}`],
      )).resolves.toEqual([{
        id: `legacy-${graph}`,
        evidence_version: 1,
        status: "accepted",
        decided_at_ms: 1001,
      }]);

      await expect(insertIncompleteActionableRecommendation(
        kernel,
        graph,
      )).rejects.toThrow("sqlite_transaction_failed");
    },
  );
});
