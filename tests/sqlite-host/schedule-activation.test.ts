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
  InitialScheduleActivationError,
  validateInitialScheduleActivation,
} from "../../src/domains/scheduling/activation";
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
  scheduleActivationMigration,
} from "../../src/platform/sqlite/migrations/0008_schedule_activation";
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

async function createRetainedV6Runtime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-schedule-activation-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v6-metric-profiles.sql",
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

async function migrateToV8(kernel: SqliteKernel): Promise<void> {
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: [scheduleActivationMigration],
  }).run();
}

function validationError(action: () => unknown): InitialScheduleActivationError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(InitialScheduleActivationError);
    return error as InitialScheduleActivationError;
  }
  throw new Error("expected_initial_schedule_activation_error");
}

describe("initial activation schedule contract", () => {
  it("accepts explicit editable Weekday and Rotation bindings", () => {
    expect(validateInitialScheduleActivation({
      startLocalDate: "2026-08-24",
      timeZone: "Asia/Singapore",
      mode: "weekday",
      bindings: [
        {
          planDaySourceId: "full-body-a",
          ordinal: 0,
          weekIndex: 0,
          weekday: "Monday",
        },
        {
          planDaySourceId: "full-body-b",
          ordinal: 1,
          weekIndex: 0,
          weekday: "Wednesday",
        },
      ],
    })).toEqual({
      startLocalDate: "2026-08-24",
      timeZone: "Asia/Singapore",
      mode: "weekday",
      bindings: [
        {
          planDaySourceId: "full-body-a",
          ordinal: 0,
          weekIndex: 0,
          weekday: "Monday",
        },
        {
          planDaySourceId: "full-body-b",
          ordinal: 1,
          weekIndex: 0,
          weekday: "Wednesday",
        },
      ],
    });
    expect(validateInitialScheduleActivation({
      startLocalDate: "2026-08-25",
      timeZone: "Asia/Singapore",
      mode: "rotation",
      bindings: [
        { planDaySourceId: "upper-a", ordinal: 0 },
        { planDaySourceId: "lower-a", ordinal: 1 },
      ],
    }).mode).toBe("rotation");
  });

  it.each([
    {
      name: "invalid LocalDate",
      input: {
        startLocalDate: "2026-02-30",
        timeZone: "Asia/Singapore",
        mode: "rotation",
        bindings: [{ planDaySourceId: "day-a", ordinal: 0 }],
      },
      code: "activation_start_local_date_invalid",
    },
    {
      name: "invalid stored timezone",
      input: {
        startLocalDate: "2026-08-24",
        timeZone: " Asia/Singapore",
        mode: "rotation",
        bindings: [{ planDaySourceId: "day-a", ordinal: 0 }],
      },
      code: "activation_timezone_invalid",
    },
    {
      name: "empty bindings",
      input: {
        startLocalDate: "2026-08-24",
        timeZone: "Asia/Singapore",
        mode: "weekday",
        bindings: [],
      },
      code: "activation_bindings_invalid",
    },
    {
      name: "duplicate weekday slot",
      input: {
        startLocalDate: "2026-08-24",
        timeZone: "Asia/Singapore",
        mode: "weekday",
        bindings: [
          {
            planDaySourceId: "day-a",
            ordinal: 0,
            weekIndex: 0,
            weekday: "Monday",
          },
          {
            planDaySourceId: "day-b",
            ordinal: 1,
            weekIndex: 0,
            weekday: "Monday",
          },
        ],
      },
      code: "activation_bindings_invalid",
    },
    {
      name: "non-contiguous Rotation order",
      input: {
        startLocalDate: "2026-08-24",
        timeZone: "Asia/Singapore",
        mode: "rotation",
        bindings: [
          { planDaySourceId: "day-a", ordinal: 0 },
          { planDaySourceId: "day-b", ordinal: 2 },
        ],
      },
      code: "activation_bindings_invalid",
    },
  ])("rejects $name before persistence", ({ input, code }) => {
    expect(validationError(() =>
      validateInitialScheduleActivation(input as never)
    ).code).toBe(code);
  });
});

describe("schedule activation migration", () => {
  it("is the direct focused successor of retained version 6 with version 7 unused", () => {
    expect(scheduleActivationMigration).toMatchObject({
      version: 8,
      name: "schedule-activation",
      kind: "additive",
    });
  });

  it("fails closed when required source and schedule tables are absent", async () => {
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() => [] as Row[],
    };
    await expect(scheduleActivationMigration.verify(transaction)).rejects
      .toThrow("schedule_activation_schema_incomplete");
  });

  it("fails closed when persisted active schedule count is invalid", async () => {
    const requiredTables = [
      "owned_plan_day_exercises",
      "owned_plan_day_sources",
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
      "starter_plan_activation_requests",
      "starter_plan_sources",
    ];
    let queryIndex = 0;
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>() {
        const rows = queryIndex === 0
          ? requiredTables.map((name) => ({ name }))
          : [{ count: 2 }];
        queryIndex += 1;
        return rows as unknown as Row[];
      },
    };
    await expect(scheduleActivationMigration.verify(transaction)).rejects
      .toThrow("schedule_activation_active_count_invalid");
  });

  it("fails closed when the active schedule count query returns no row", async () => {
    const requiredTables = [
      "owned_plan_day_exercises",
      "owned_plan_day_sources",
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
      "starter_plan_activation_requests",
      "starter_plan_sources",
    ];
    let queryIndex = 0;
    const transaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>() {
        const rows = queryIndex === 0
          ? requiredTables.map((name) => ({ name }))
          : [];
        queryIndex += 1;
        return rows as unknown as Row[];
      },
    };
    await expect(scheduleActivationMigration.verify(transaction)).rejects
      .toThrow("schedule_activation_active_count_invalid");
  });

  it("migrates the immutable retained v6 fixture and preserves source bytes", async () => {
    const kernel = await createRetainedV6Runtime();
    const before = {
      plans: await kernel.queryAll("SELECT * FROM plans ORDER BY id"),
      targets: await kernel.queryAll(
        "SELECT * FROM plan_working_set_targets ORDER BY id",
      ),
      policies: await kernel.queryAll(
        "SELECT * FROM progression_policies ORDER BY id",
      ),
    };

    await migrateToV8(kernel);

    await expect(kernel.queryAll("PRAGMA user_version")).resolves.toEqual([
      { user_version: 8 },
    ]);
    await expect(kernel.queryAll("SELECT * FROM plans ORDER BY id")).resolves
      .toEqual(before.plans);
    await expect(kernel.queryAll(
      "SELECT * FROM plan_working_set_targets ORDER BY id",
    )).resolves.toEqual(before.targets);
    await expect(kernel.queryAll(
      "SELECT * FROM progression_policies ORDER BY id",
    )).resolves.toEqual(before.policies);
    await expect(kernel.queryAll("PRAGMA foreign_key_check")).resolves
      .toEqual([]);
  });

  it("traces one accepted day into fresh owned IDs and one active schedule", async () => {
    const kernel = await createRetainedV6Runtime();
    await migrateToV8(kernel);

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE plans
         SET is_active = 0, revision = revision + 1
         WHERE is_active = 1`,
      );
      await transaction.execute(
        `UPDATE owned_plan_schedules
         SET lifecycle = 'inactive',
             revision = revision + 1,
             deactivated_at_ms = activated_at_ms
         WHERE lifecycle = 'active'`,
      );
      await transaction.execute(
        `INSERT INTO starter_plan_sources
          (source_namespace, template_id, source_revision, asset_sha256,
           display_name, template_json, accepted_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          "gym-tracker.starter-plans",
          "full-body-foundation",
          2,
          "8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4",
          "Full Body Foundation",
          JSON.stringify({
            days: [{
              id: "full-body-a",
              exercises: [{ id: "full-body-a-plank" }],
            }],
          }),
          1_787_027_200_000,
        ],
      );
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (?, NULL, 'copied', ?, ?, ?, 1, ?, ?, 30, ?, 1, 1)`,
        [
          "owned-plan-1",
          "gym-tracker.starter-plans",
          "full-body-foundation",
          "Full Body Foundation",
          "Owner",
          "General strength",
          "Gym Tracker accepted starter",
        ],
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES ('owned-day-1', 'owned-plan-1', 0, 'Full Body A', 1)`,
      );
      await transaction.execute(
        `INSERT INTO plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES (
           'owned-occurrence-1', 'owned-day-1', 'exercise-plank', 0, 60,
           'timed_hold', 1, 1, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
           target_json, unit_json, metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (
           'owned-target-1', 'owned-occurrence-1', 0, 0, 0, 0,
           '{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}',
           '{"version":1,"duration":"seconds"}',
           'timed_hold', 1, 1, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO progression_policies
          (id, plan_day_exercise_id, policy_type, policy_version, rule_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, status, invalidated_at_ms, revision)
         VALUES (
           'owned-policy-1', 'owned-occurrence-1', 'manual_hold', 1,
           '{"version":1,"progression":"manual"}',
           'timed_hold', 1, 1, 'active', NULL, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_starter_sources
          (plan_id, source_namespace, template_id, source_revision,
           asset_sha256, cloned_day_count, cloned_occurrence_count,
           cloned_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "owned-plan-1",
          "gym-tracker.starter-plans",
          "full-body-foundation",
          2,
          "8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4",
          1,
          1,
          1_787_027_200_000,
        ],
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms,
           deactivated_at_ms)
         VALUES ('owned-schedule-1', 'owned-plan-1', 'active', 1, ?, NULL)`,
        [1_787_027_200_000],
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_versions
          (id, schedule_id, version_number, effective_local_date, mode,
           timezone, rotation_pointer, created_at_ms)
         VALUES (
           'owned-schedule-version-1', 'owned-schedule-1', 1, '2026-08-24',
           'weekday', 'Asia/Singapore', NULL, ?
         )`,
        [1_787_027_200_000],
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_bindings
          (id, schedule_version_id, mode, ordinal, week_index, weekday,
           plan_day_id)
         VALUES (
           'owned-binding-1', 'owned-schedule-version-1', 'weekday', 0, 0,
           'Monday', 'owned-day-1'
         )`,
      );
    });

    await expect(kernel.queryAll(
      `SELECT p.id AS plan_id, pd.id AS day_id, pde.id AS occurrence_id,
              target.id AS target_id, policy.id AS policy_id,
              source.cloned_day_count, source.cloned_occurrence_count,
              schedule.lifecycle, version.mode, binding.weekday
       FROM plans p
       JOIN plan_days pd ON pd.plan_id = p.id
       JOIN plan_day_exercises pde ON pde.plan_day_id = pd.id
       JOIN plan_working_set_targets target
         ON target.plan_day_exercise_id = pde.id
       JOIN progression_policies policy
         ON policy.plan_day_exercise_id = pde.id
       JOIN owned_plan_starter_sources source ON source.plan_id = p.id
       JOIN owned_plan_schedules schedule ON schedule.plan_id = p.id
       JOIN owned_plan_schedule_versions version
         ON version.schedule_id = schedule.id
       JOIN owned_plan_schedule_bindings binding
         ON binding.schedule_version_id = version.id`,
    )).resolves.toEqual([{
      cloned_day_count: 1,
      cloned_occurrence_count: 1,
      day_id: "owned-day-1",
      lifecycle: "active",
      mode: "weekday",
      occurrence_id: "owned-occurrence-1",
      plan_id: "owned-plan-1",
      policy_id: "owned-policy-1",
      target_id: "owned-target-1",
      weekday: "Monday",
    }]);
  });

  it("prevents two active schedules and mutation of consumed facts", async () => {
    const kernel = await createRetainedV6Runtime();
    await migrateToV8(kernel);

    await kernel.write(async (transaction) => {
      for (const planId of ["owned-plan-a", "owned-plan-b"]) {
        await transaction.execute(
          `INSERT INTO plans
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             days_per_week, audience, goal, estimate_minutes, attribution,
             is_active, revision)
           VALUES (?, NULL, 'copied', ?, ?, ?, 1, 'Owner', 'Strength', 30,
                   'Accepted starter', 0, 1)`,
          [
            planId,
            "gym-tracker.starter-plans",
            planId,
            planId,
          ],
        );
      }
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms,
           deactivated_at_ms)
         VALUES ('schedule-a', 'owned-plan-a', 'active', 1, 10, NULL)`,
      );
    });

    await expect(kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms,
           deactivated_at_ms)
         VALUES ('schedule-b', 'owned-plan-b', 'active', 1, 11, NULL)`,
      )
    )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_versions
          (id, schedule_id, version_number, effective_local_date, mode,
           timezone, rotation_pointer, created_at_ms)
         VALUES (
           'schedule-version-a', 'schedule-a', 1, '2026-08-24', 'rotation',
           'Asia/Singapore', 0, 10
         )`,
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES ('owned-day-a', 'owned-plan-a', 0, 'Day A', 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_opportunities
          (id, schedule_id, schedule_version_id, local_date, source,
           plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
         VALUES (
           'opportunity-a', 'schedule-a', 'schedule-version-a',
           '2026-08-24', 'rotation', 'owned-day-a', 'consumed', 'skipped',
           NULL, 2, 20
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_events
          (id, schedule_id, event_type, local_date, payload_json,
           schedule_revision, created_at_ms)
         VALUES (
           'event-a', 'schedule-a', 'rotation_skipped', '2026-08-24',
           '{}', 2, 20
         )`,
      );
    });

    await expect(kernel.write((transaction) =>
      transaction.execute(
        `UPDATE owned_plan_schedule_opportunities
         SET outcome = 'advanced'
         WHERE id = 'opportunity-a'`,
      )
    )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    await expect(kernel.write((transaction) =>
      transaction.execute(
        `DELETE FROM owned_plan_schedule_events WHERE id = 'event-a'`,
      )
    )).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
  });
});
