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
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  OWNED_PLAN_MISSING_VALID_TARGET_CODE,
  OWNED_PLAN_MISSING_VALID_TARGET_REASON,
  ownedPlansMigration,
} from "../../src/platform/sqlite/migrations/0009_owned_plans";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteTransactionExecutor,
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

const repositoryRoot = join(__dirname, "../..");
const temporaryDirectories = new Set<string>();
const runtimes: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function createRetainedV8Runtime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-owned-plans-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v8-schedule-activation.sql",
    ),
    "utf8",
  ));
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  runtimes.push(kernel);
  return kernel;
}

async function migrateToV9(kernel: SqliteKernel): Promise<void> {
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: [ownedPlansMigration],
  }).run();
}

async function insertEmptyDraft(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    planId: string;
    planName: string;
    dayId: string;
    dayName: string;
  }>,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO plans
      (id, content_pack_id, origin, source_namespace, upstream_id, name,
       days_per_week, audience, goal, estimate_minutes, attribution,
       is_active, revision)
     VALUES (?, NULL, 'custom', NULL, NULL, ?, 1, 'Owner', 'Custom', 1,
             'Owner-created', 0, 1)`,
    [input.planId, input.planName],
  );
  await transaction.execute(
    `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
     VALUES (?, ?, 0, ?, 1)`,
    [input.dayId, input.planId, input.dayName],
  );
  await transaction.execute(
    `INSERT INTO owned_plan_aggregate_states
      (plan_id, lifecycle, graph_status, missing_requirement_code,
       missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
     VALUES (?, 'draft', 'missing_valid_target', ?, ?, 100, 100, NULL)`,
    [
      input.planId,
      OWNED_PLAN_MISSING_VALID_TARGET_CODE,
      OWNED_PLAN_MISSING_VALID_TARGET_REASON,
    ],
  );
}

async function insertValidOccurrence(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    dayId: string;
    occurrenceId: string;
    exerciseId: string;
    ordinal: number;
  }>,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO owned_plan_day_exercises
      (id, plan_day_id, exercise_id, ordinal,
       between_exercise_rest_seconds, metric_profile,
       metric_contract_version, exercise_metric_generation, revision)
     VALUES (?, ?, ?, ?, 60, 'load_reps', 1, 1, 1)`,
    [
      input.occurrenceId,
      input.dayId,
      input.exerciseId,
      input.ordinal,
    ],
  );
  await transaction.execute(
    `INSERT INTO owned_plan_working_set_targets
      (id, plan_day_exercise_id, ordinal, target_json, unit_json,
       metric_profile, metric_contract_version,
       exercise_metric_generation, revision)
     VALUES (?, ?, 0, ?, ?, 'load_reps', 1, 1, 1)`,
    [
      `${input.occurrenceId}:target`,
      input.occurrenceId,
      JSON.stringify({
        profile: "load_reps",
        version: 1,
        loadGrams: 20_000,
        minReps: 8,
        maxReps: 12,
      }),
      JSON.stringify({
        version: 1,
        load: "grams",
        count: "repetitions",
      }),
    ],
  );
  await transaction.execute(
    `INSERT INTO owned_plan_progression_policies
      (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
       rule_json, metric_profile, metric_contract_version,
       exercise_metric_generation, status, revision)
     VALUES (?, ?, 'manual_hold', 'manual-hold-v1', 1, ?,
             'load_reps', 1, 1, 'active', 1)`,
    [
      `${input.occurrenceId}:policy`,
      input.occurrenceId,
      JSON.stringify({
        kind: "manual_hold",
        id: "manual-hold-v1",
        version: 1,
      }),
    ],
  );
}

describe("owned-plan migration", () => {
  it("registers the released v12 prefix and retains later migrations", () => {
    expect(ownedPlansMigration).toMatchObject({
      version: 9,
      name: "owned-plans",
      kind: "additive",
    });
    expect(migrations.slice(0, 11).map(({ version }) => version)).toEqual([
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
    expect(migrations.at(-1)?.version).toBeGreaterThanOrEqual(12);
  });

  it("rejects incomplete, uncovered, and invalid owned-plan schemas", async () => {
    await expect(ownedPlansMigration.verify({
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>() {
        return [] as Row[];
      },
    })).rejects.toThrow("owned_plan_schema_incomplete");

    const schema = [
      { name: "owned_plan_aggregate_states", type: "table" },
      { name: "owned_plan_mutation_requests", type: "table" },
      { name: "owned_plan_requests_immutable_delete", type: "trigger" },
      { name: "owned_plan_requests_immutable_update", type: "trigger" },
      { name: "owned_plan_state_requires_owned_origin", type: "trigger" },
      { name: "owned_plan_days_no_permanent_delete", type: "trigger" },
      { name: "owned_plan_occurrences_no_permanent_delete", type: "trigger" },
      { name: "owned_plan_policies_no_permanent_delete", type: "trigger" },
      { name: "owned_plan_targets_no_permanent_delete", type: "trigger" },
      { name: "owned_plan_warmups_no_permanent_delete", type: "trigger" },
      { name: "owned_plans_no_permanent_delete", type: "trigger" },
    ];
    let queryIndex = 0;
    await expect(ownedPlansMigration.verify({
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>() {
        const rows = queryIndex === 0
          ? schema
          : [{ owned_count: 1, state_count: 0 }];
        queryIndex += 1;
        return rows as unknown as Row[];
      },
    })).rejects.toThrow("owned_plan_state_coverage_invalid");

    queryIndex = 0;
    await expect(ownedPlansMigration.verify({
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>() {
        const rows = queryIndex === 0
          ? schema
          : queryIndex === 1
            ? [{ owned_count: 1, state_count: 1 }]
            : [{ count: 1 }];
        queryIndex += 1;
        return rows as unknown as Row[];
      },
    })).rejects.toThrow("owned_plan_state_invalid");
  });

  it("E-48/E-49 preserves v8 facts and accepts a Unicode named empty draft", async () => {
    const kernel = await createRetainedV8Runtime();
    const before = {
      plans: await kernel.queryAll("SELECT * FROM plans ORDER BY id"),
      schedules: await kernel.queryAll(
        "SELECT * FROM owned_plan_schedules ORDER BY id",
      ),
      exercises: await kernel.queryAll(
        "SELECT * FROM exercise_library_entries ORDER BY exercise_id",
      ),
    };

    await migrateToV9(kernel);
    await kernel.write((transaction) =>
      insertEmptyDraft(transaction, {
        planId: "owned-plan-unicode",
        planName: "力量计划 🏋️",
        dayId: "owned-day-unicode",
        dayName: "上肢 Día α",
      })
    );

    await expect(kernel.queryAll("PRAGMA user_version")).resolves.toEqual([
      { user_version: 9 },
    ]);
    await expect(kernel.queryAll(
      `SELECT plan.name, day.name AS day_name, state.lifecycle,
              state.graph_status, state.missing_requirement_code,
              state.missing_requirement, plan.is_active, plan.revision
       FROM plans plan
       JOIN plan_days day ON day.plan_id = plan.id
       JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id
       WHERE plan.id = 'owned-plan-unicode'`,
    )).resolves.toEqual([{
      day_name: "上肢 Día α",
      graph_status: "missing_valid_target",
      is_active: 0,
      lifecycle: "draft",
      missing_requirement: OWNED_PLAN_MISSING_VALID_TARGET_REASON,
      missing_requirement_code: OWNED_PLAN_MISSING_VALID_TARGET_CODE,
      name: "力量计划 🏋️",
      revision: 1,
    }]);
    await expect(kernel.queryAll(
      "SELECT * FROM plans WHERE id <> 'owned-plan-unicode' ORDER BY id",
    )).resolves.toEqual(before.plans);
    await expect(kernel.queryAll(
      "SELECT * FROM owned_plan_schedules ORDER BY id",
    )).resolves.toEqual(before.schedules);
    await expect(kernel.queryAll(
      "SELECT * FROM exercise_library_entries ORDER BY exercise_id",
    )).resolves.toEqual(before.exercises);
  });

  it("E-50 saves one valid graph at the expected revision with stable order", async () => {
    const kernel = await createRetainedV8Runtime();
    await migrateToV9(kernel);
    await kernel.write((transaction) =>
      insertEmptyDraft(transaction, {
        planId: "owned-plan-order",
        planName: "Ordered Plan",
        dayId: "owned-day-order",
        dayName: "Day One",
      })
    );

    await kernel.write(async (transaction) => {
      await insertValidOccurrence(transaction, {
        dayId: "owned-day-order",
        occurrenceId: "occurrence-second",
        exerciseId: "exercise-plank",
        ordinal: 1,
      });
      await insertValidOccurrence(transaction, {
        dayId: "owned-day-order",
        occurrenceId: "occurrence-first",
        exerciseId: "exercise-squat",
        ordinal: 0,
      });
      const saved = await transaction.execute(
        `UPDATE plans
         SET revision = revision + 1
         WHERE id = 'owned-plan-order' AND revision = 1`,
      );
      if (saved.changes !== 1) {
        throw new Error("owned_plan_revision_conflict");
      }
      await transaction.execute(
        `UPDATE owned_plan_aggregate_states
         SET lifecycle = 'ready',
             graph_status = 'valid',
             missing_requirement_code = NULL,
             missing_requirement = NULL,
             updated_at_ms = 200
         WHERE plan_id = 'owned-plan-order'`,
      );
    });

    await expect(kernel.queryAll(
      `SELECT occurrence.id, occurrence.ordinal, target.ordinal AS target_ordinal
       FROM owned_plan_day_exercises occurrence
       JOIN owned_plan_working_set_targets target
         ON target.plan_day_exercise_id = occurrence.id
       WHERE occurrence.plan_day_id = 'owned-day-order'
       ORDER BY occurrence.ordinal, target.ordinal`,
    )).resolves.toEqual([
      { id: "occurrence-first", ordinal: 0, target_ordinal: 0 },
      { id: "occurrence-second", ordinal: 1, target_ordinal: 0 },
    ]);
    await expect(kernel.queryAll(
      `SELECT plan.revision, state.lifecycle, state.graph_status,
              state.missing_requirement
       FROM plans plan
       JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id
       WHERE plan.id = 'owned-plan-order'`,
    )).resolves.toEqual([{
      graph_status: "valid",
      lifecycle: "ready",
      missing_requirement: null,
      revision: 2,
    }]);
  });

  it("E-47 rejects adjacent identity/ordinal collisions and permanent delete", async () => {
    const kernel = await createRetainedV8Runtime();
    await migrateToV9(kernel);
    await kernel.write((transaction) =>
      insertEmptyDraft(transaction, {
        planId: "owned-plan-collision",
        planName: "Collision Plan",
        dayId: "owned-day-collision",
        dayName: "Day One",
      })
    );

    await expect(kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES (
           'owned-day-collision-2', 'owned-plan-collision', 0, 'Day Two', 1
         )`,
      )
    )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    await expect(kernel.write((transaction) =>
      transaction.execute(
        "DELETE FROM plans WHERE id = 'owned-plan-collision'",
      )
    )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    await kernel.write(async (transaction) => {
      await insertValidOccurrence(transaction, {
        dayId: "owned-day-collision",
        occurrenceId: "owned-occurrence-collision",
        exerciseId: "exercise-squat",
        ordinal: 0,
      });
    });
    await expect(kernel.write((transaction) =>
      transaction.execute(
        `DELETE FROM owned_plan_working_set_targets
         WHERE id = 'owned-occurrence-collision:target'`,
      )
    )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    await expect(kernel.queryAll(
      "SELECT id FROM plans WHERE id = 'owned-plan-collision'",
    )).resolves.toEqual([{ id: "owned-plan-collision" }]);
    await expect(kernel.queryAll(
      `SELECT id
       FROM owned_plan_working_set_targets
       WHERE id = 'owned-occurrence-collision:target'`,
    )).resolves.toEqual([{ id: "owned-occurrence-collision:target" }]);
  });

  it("E-51 retains one immutable request identity for idempotent replay", async () => {
    const kernel = await createRetainedV8Runtime();
    await migrateToV9(kernel);
    await kernel.write((transaction) =>
      insertEmptyDraft(transaction, {
        planId: "owned-plan-request",
        planName: "Request Plan",
        dayId: "owned-day-request",
        dayName: "Day One",
      })
    );

    const requestSha256 = "a".repeat(64);
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_plan_mutation_requests
          (request_id, request_sha256, operation, source_plan_id,
           result_plan_id, expected_revision, result_revision, result_json,
           committed_at_ms)
         VALUES (
           'request-1', ?, 'create', NULL, 'owned-plan-request', NULL, 1,
           '{"outcome":"committed","planId":"owned-plan-request","revision":1}',
           100
         )`,
        [requestSha256],
      )
    );
    const replay = await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_plan_mutation_requests
          (request_id, request_sha256, operation, source_plan_id,
           result_plan_id, expected_revision, result_revision, result_json,
           committed_at_ms)
         VALUES (
           'request-1', ?, 'create', NULL, 'owned-plan-request', NULL, 1,
           '{"outcome":"committed","planId":"owned-plan-request","revision":1}',
           100
         )
         ON CONFLICT(request_id) DO NOTHING`,
        [requestSha256],
      )
    );

    expect(replay.changes).toBe(0);
    await expect(kernel.write((transaction) =>
      transaction.execute(
        `UPDATE owned_plan_mutation_requests
         SET request_sha256 = ?
         WHERE request_id = 'request-1'`,
        ["b".repeat(64)],
      )
    )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
  });

  it("E-52 serializes competing expected revisions and rolls back failed writes", async () => {
    const kernel = await createRetainedV8Runtime();
    await migrateToV9(kernel);
    await kernel.write((transaction) =>
      insertEmptyDraft(transaction, {
        planId: "owned-plan-revision",
        planName: "Revision Plan",
        dayId: "owned-day-revision",
        dayName: "Day One",
      })
    );
    const before = {
      schedule: await kernel.queryAll(
        "SELECT * FROM owned_plan_schedules ORDER BY id",
      ),
      day: await kernel.queryAll(
        "SELECT * FROM plan_days WHERE id = 'owned-day-revision'",
      ),
    };

    const results = await Promise.allSettled([1, 2].map(() =>
      kernel.write(async (transaction) => {
        const result = await transaction.execute(
          `UPDATE plans
           SET name = 'Saved once', revision = revision + 1
           WHERE id = 'owned-plan-revision' AND revision = 1`,
        );
        if (result.changes !== 1) {
          throw new Error("owned_plan_revision_conflict");
        }
        return result.changes;
      })
    ));
    expect(results.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    await expect(kernel.queryAll(
      `SELECT name, revision
       FROM plans
       WHERE id = 'owned-plan-revision'`,
    )).resolves.toEqual([{ name: "Saved once", revision: 2 }]);

    await expect(kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE owned_plan_schedules
         SET revision = revision + 1`,
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES (
           'owned-day-duplicate', 'owned-plan-revision', 0, 'Duplicate', 1
         )`,
      );
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    await expect(kernel.queryAll(
      "SELECT * FROM owned_plan_schedules ORDER BY id",
    )).resolves.toEqual(before.schedule);
    await expect(kernel.queryAll(
      "SELECT * FROM plan_days WHERE id = 'owned-day-revision'",
    )).resolves.toEqual(before.day);
  });
});
