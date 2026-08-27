import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
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
  activateOwnedPlanSchedule,
  advanceRotation,
  changeScheduleTimeZone,
  completeScheduledOpportunity,
  consumeScheduleDateOverride,
  createScheduleVersionPreviewToken,
  markWeekdayOpportunityMissed,
  recordTrainAnyway,
  repeatRotation,
  saveScheduleVersion,
  ScheduleCommandInputError,
  setDateOverride,
  skipOpportunity,
  type ActivateOwnedPlanScheduleInput,
} from "../../src/domains/scheduling/scheduleCommands";
import { parseLocalDate } from "../../src/domains/scheduling/localDate";
import {
  consumeDateOverride,
  FOLLOW_DEVICE_TIMEZONE_LABEL,
  KEEP_CURRENT_TIMEZONE_LABEL,
  transitionTimeZoneChoice,
} from "../../src/domains/scheduling/scheduleState";
import {
  parseStoredTimeZone,
} from "../../src/domains/scheduling/timeZone";
import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import {
  scheduleActivationMigration,
} from "../../src/platform/sqlite/migrations/0008_schedule_activation";
import {
  ownedPlansMigration,
} from "../../src/platform/sqlite/migrations/0009_owned_plans";
import {
  createScheduleRepository,
  ScheduleRepositoryError,
  type ApplyScheduleOpportunityRepositoryInput,
  type ChangeScheduleTimeZoneRepositoryInput,
  type ConsumeScheduleDateOverrideRepositoryInput,
  type SaveScheduleVersionRepositoryInput,
  type SetScheduleDateOverrideRepositoryInput,
} from "../../src/platform/sqlite/repositories/scheduleRepository";
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

const repositoryRoot = join(__dirname, "../..");
const temporaryDirectories = new Set<string>();
const runtimes: SqliteKernel[] = [];
const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function createRuntime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-schedule-commands-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(databasePath);
  fixture.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v6-metric-profiles.sql",
    ),
    "utf8",
  ));
  fixture.exec(`
    INSERT INTO plan_days
      (id, plan_id, ordinal, name, revision)
    VALUES ('plan-day-copy-b', 'plan-copy', 1, 'Full Body B', 1);
    INSERT INTO plan_schedules
      (id, plan_id, mode, start_local_date, timezone,
       cycle_length_weeks, revision)
    VALUES (
      'schedule-copy', 'plan-copy', 'weekday', '2026-08-01',
      'Asia/Singapore', 1, 7
    );
    INSERT INTO plan_schedule_bindings
      (id, schedule_id, week_index, weekday, plan_day_id, revision)
    VALUES (
      'schedule-binding-copy', 'schedule-copy', 0, 1,
      'plan-day-copy', 1
    );
  `);
  fixture.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  runtimes.push(kernel);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: [scheduleActivationMigration, ownedPlansMigration],
  }).run();
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `UPDATE workout_sessions
       SET status = 'completed',
           completed_at_ms = COALESCE(completed_at_ms, started_at_ms),
           active_session_exercise_id = NULL,
           active_set_id = NULL
       WHERE status = 'in_progress'`,
    );
    await transaction.execute(
      `UPDATE plans
       SET revision = 8
       WHERE id = 'plan-copy'`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal,
         between_exercise_rest_seconds, metric_profile,
         metric_contract_version, exercise_metric_generation, revision)
       VALUES (
         'occurrence-hold', 'plan-day-hold', 'exercise-plank', 0,
         60, 'timed_hold', 1, 1, 1
       )`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES (
         'target-hold', 'occurrence-hold', 0,
         '{"version":1,"profile":"timed_hold","durationSeconds":30,"sets":3}',
         '{"version":1,"time":"seconds"}',
         'timed_hold', 1, 1, 1
       )`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_progression_policies
        (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
         rule_json, metric_profile, metric_contract_version,
         exercise_metric_generation, status, revision)
       VALUES (
         'policy-hold', 'occurrence-hold', 'manual_hold', 'manual-hold-v1', 1,
         '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
         'timed_hold', 1, 1, 'active', 1
       )`,
    );
  });
  return kernel;
}

async function saveVersion(
  kernel: SqliteKernel,
  input: Readonly<{
    requestId: string;
    expectedScheduleRevision: number;
    expectedPlanRevision: number;
    effectiveLocalDate: string;
    timeZone?: string;
    before?: Readonly<{
      id: string;
      versionNumber: number;
      effectiveLocalDate: string;
      mode: "weekday" | "rotation";
      timeZone: string;
      rotationPointer: number | null;
      bindings: readonly Readonly<{
        id: string;
        ordinal: number;
        weekIndex?: number;
        weekday?: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday"
          | "Saturday" | "Sunday";
        planDayId: string;
      }>[];
    }>;
  }>,
) {
  const repository = createScheduleRepository(kernel);
  const next = {
    effectiveLocalDate: input.effectiveLocalDate,
    mode: "weekday" as const,
    timeZone: input.timeZone ?? "Asia/Singapore",
    bindings: [{
      ordinal: 0,
      weekIndex: 0,
      weekday: "Tuesday" as const,
      planDayId: "plan-day-copy",
    }],
  };
  const before = input.before ?? {
    id: "schedule-copy:version:1",
    versionNumber: 1,
    effectiveLocalDate: "2026-08-01",
    mode: "weekday" as const,
    timeZone: "Asia/Singapore",
    rotationPointer: null,
    bindings: [{
      id: "schedule-binding-copy:owned",
      ordinal: 0,
      weekIndex: 0,
      weekday: "Monday" as const,
      planDayId: "plan-day-copy",
    }],
  };
  const confirmationToken = await createScheduleVersionPreviewToken({
    sha256,
    preview: {
      scheduleId: "schedule-copy",
      planId: "plan-copy",
      expectedScheduleRevision: input.expectedScheduleRevision,
      expectedPlanRevision: input.expectedPlanRevision,
      before,
      after: next,
    },
  });
  return saveScheduleVersion({
    repository,
    invalidate: async () => undefined,
    sha256,
    input: {
      requestId: input.requestId,
      scheduleId: "schedule-copy",
      planId: "plan-copy",
      expectedScheduleRevision: input.expectedScheduleRevision,
      expectedPlanRevision: input.expectedPlanRevision,
      todayLocalDate: "2026-08-18",
      savedAtMs: 1_787_027_200_000,
      before,
      next,
      confirmationToken,
    },
  });
}

async function activateHoldPlan(
  kernel: SqliteKernel,
  overrides: Partial<ActivateOwnedPlanScheduleInput> = {},
  repository = createScheduleRepository(kernel),
) {
  const base = {
    requestId: "activate-hold-schedule",
    planId: "plan-hold",
    expectedPlanRevision: 2,
    expectedActivePair: {
      kind: "pair" as const,
      planId: "plan-copy",
      planRevision: 8,
      scheduleId: "schedule-copy",
      scheduleRevision: 7,
    },
    targetSchedule: {
      kind: "absent" as const,
      scheduleId: "schedule-hold",
    },
    todayLocalDate: "2026-08-18",
    activatedAtMs: 1_787_027_200_000,
    next: {
      effectiveLocalDate: "2026-08-18",
      mode: "weekday" as const,
      timeZone: "Asia/Singapore",
      bindings: [{
        ordinal: 0,
        weekIndex: 0,
        weekday: "Tuesday" as const,
        planDayId: "plan-day-hold",
      }],
    },
    ...overrides,
  };
  const input = {
    ...base,
    confirmationToken: await createScheduleVersionPreviewToken({
      sha256,
      preview: {
        planId: base.planId,
        expectedPlanRevision: base.expectedPlanRevision,
        expectedActivePair: base.expectedActivePair,
        targetSchedule: base.targetSchedule,
        after: base.next,
      },
    }),
  };
  return activateOwnedPlanSchedule({
    repository,
    invalidate: async () => undefined,
    sha256,
    input,
  });
}

describe("schedule version persistence", () => {
  it("atomically activates a valid unscheduled owned plan and replays the receipt", async () => {
    const kernel = await createRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (
           'plan-custom', NULL, 'custom', NULL, NULL, 'Maestro Custom Plan',
           1, 'Personal', 'Strength', 30, 'Owner', 0, 4
         )`,
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES ('plan-day-custom', 'plan-custom', 0, 'Custom Day', 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_aggregate_states
          (plan_id, lifecycle, graph_status, missing_requirement_code,
           missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
         VALUES (
           'plan-custom', 'ready', 'valid', NULL, NULL, 100, 100, NULL
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES (
           'occurrence-custom', 'plan-day-custom', 'exercise-squat', 0,
           120, 'load_reps', 1, 1, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (
           'target-custom', 'occurrence-custom', 0,
           '{"version":1,"profile":"load_reps","loadGrams":30000,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
           '{"version":1,"load":"grams","count":"repetitions"}',
           'load_reps', 1, 1, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_progression_policies
          (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
           rule_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, revision)
         VALUES (
           'policy-custom', 'occurrence-custom', 'manual_hold',
           'manual-hold-v1', 1,
           '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
           'load_reps', 1, 1, 'active', 1
         )`,
      );
    });
    const repository = createScheduleRepository(kernel);
    const next = {
      effectiveLocalDate: "2026-08-18",
      mode: "weekday" as const,
      timeZone: "Asia/Singapore",
      bindings: [{
        ordinal: 0,
        weekIndex: 0,
        weekday: "Monday" as const,
        planDayId: "plan-day-custom",
      }],
    };
    const confirmationToken = await createScheduleVersionPreviewToken({
      sha256,
      preview: {
        planId: "plan-custom",
        expectedPlanRevision: 4,
        expectedActivePair: {
          kind: "pair",
          planId: "plan-copy",
          planRevision: 8,
          scheduleId: "schedule-copy",
          scheduleRevision: 7,
        },
        targetSchedule: {
          kind: "absent",
          scheduleId: "schedule-custom",
        },
        after: next,
      },
    });
    const request = {
      repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "activate-custom-schedule",
        planId: "plan-custom",
        expectedPlanRevision: 4,
        expectedActivePair: {
          kind: "pair",
          planId: "plan-copy",
          planRevision: 8,
          scheduleId: "schedule-copy",
          scheduleRevision: 7,
        },
        targetSchedule: {
          kind: "absent",
          scheduleId: "schedule-custom",
        },
        todayLocalDate: "2026-08-18",
        activatedAtMs: 1_787_027_200_000,
        next,
        confirmationToken,
      },
    } as const;

    const committed = await activateOwnedPlanSchedule(request);
    const replayed = await activateOwnedPlanSchedule(request);

    expect(committed).toMatchObject({
      outcome: "committed",
      operation: "activate_schedule",
      scheduleId: "schedule-custom",
      planId: "plan-custom",
      scheduleRevision: 1,
      planRevision: 5,
      version: {
        versionNumber: 1,
        effectiveLocalDate: "2026-08-18",
      },
    });
    expect(replayed).toEqual({ ...committed, outcome: "already_committed" });
    await expect(kernel.queryAll(
      `SELECT plan.id, plan.is_active, schedule.lifecycle, schedule.revision
       FROM plans plan
       JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
       ORDER BY plan.id`,
    )).resolves.toEqual([
      {
        id: "plan-copy",
        is_active: 0,
        lifecycle: "inactive",
        revision: 8,
      },
      {
        id: "plan-custom",
        is_active: 1,
        lifecycle: "active",
        revision: 1,
      },
    ]);
    await expect(repository.readTimeZoneState({
      scheduleId: "schedule-custom",
    })).resolves.toMatchObject({
      scheduleRevision: 1,
      planRevision: 5,
      version: {
        versionNumber: 1,
        bindings: [{ planDayId: "plan-day-custom" }],
      },
    });
  });

  it("reactivates an existing inactive schedule with a new immutable version", async () => {
    const kernel = await createRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
         VALUES ('schedule-hold', 'plan-hold', 'inactive', 3, 100, 200)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_versions
          (id, schedule_id, version_number, effective_local_date, mode,
           timezone, rotation_pointer, created_at_ms)
         VALUES (
           'schedule-hold:version:1', 'schedule-hold', 1, '2026-08-01',
           'weekday', 'Asia/Singapore', NULL, 100
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_bindings
          (id, schedule_version_id, mode, ordinal, week_index, weekday,
           plan_day_id)
         VALUES (
           'schedule-hold:binding:1', 'schedule-hold:version:1', 'weekday',
           0, 0, 'Monday', 'plan-day-hold'
         )`,
      );
    });
    const repository = createScheduleRepository(kernel);
    const before = await repository.readTimeZoneState({
      scheduleId: "schedule-hold",
    });

    const result = await activateHoldPlan(kernel, {
      targetSchedule: {
        kind: "inactive",
        scheduleId: "schedule-hold",
        scheduleRevision: 3,
        before: before!.version,
      },
    }, repository);

    expect(result).toMatchObject({
      scheduleRevision: 4,
      planRevision: 3,
      version: { versionNumber: 2 },
    });
    await expect(kernel.queryAll(
      `SELECT lifecycle, revision, deactivated_at_ms
       FROM owned_plan_schedules
       WHERE id = 'schedule-hold'`,
    )).resolves.toEqual([{
      lifecycle: "active",
      revision: 4,
      deactivated_at_ms: null,
    }]);
    await expect(kernel.queryAll(
      `SELECT version_number, effective_local_date
       FROM owned_plan_schedule_versions
       WHERE schedule_id = 'schedule-hold'
       ORDER BY version_number`,
    )).resolves.toEqual([
      { version_number: 1, effective_local_date: "2026-08-01" },
      { version_number: 2, effective_local_date: "2026-08-18" },
    ]);
  });

  it("rejects stale active state and in-progress workouts without partial activation", async () => {
    const kernel = await createRuntime();

    await expect(activateHoldPlan(kernel, {
      expectedActivePair: {
        kind: "pair",
        planId: "plan-copy",
        planRevision: 8,
        scheduleId: "schedule-copy",
        scheduleRevision: 6,
      },
    })).rejects.toMatchObject({
      code: "schedule_active_revision_conflict",
    });
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE workout_sessions
         SET status = 'in_progress', completed_at_ms = NULL
         WHERE id = 'session-active'`,
      )
    );
    await expect(activateHoldPlan(kernel)).rejects.toMatchObject({
      code: "schedule_active_workout_blocked",
    });
    await expect(kernel.queryAll(
      `SELECT id FROM owned_plan_schedules WHERE plan_id = 'plan-hold'`,
    )).resolves.toEqual([]);
    await expect(kernel.queryAll(
      `SELECT id, is_active, revision
       FROM plans
       WHERE id IN ('plan-copy', 'plan-hold')
       ORDER BY id`,
    )).resolves.toEqual([
      { id: "plan-copy", is_active: 1, revision: 8 },
      { id: "plan-hold", is_active: 0, revision: 2 },
    ]);
  });

  it("rolls back both active pairs when initial binding persistence fails", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel, {
      afterBinding() {
        throw new Error("injected_activation_binding_failure");
      },
    });

    await expect(activateHoldPlan(kernel, {}, repository))
      .rejects.toThrow("sqlite_transaction_failed");
    await expect(kernel.queryAll(
      `SELECT id, is_active, revision
       FROM plans
       WHERE id IN ('plan-copy', 'plan-hold')
       ORDER BY id`,
    )).resolves.toEqual([
      { id: "plan-copy", is_active: 1, revision: 8 },
      { id: "plan-hold", is_active: 0, revision: 2 },
    ]);
    await expect(kernel.queryAll(
      `SELECT id, lifecycle, revision
       FROM owned_plan_schedules
       ORDER BY id`,
    )).resolves.toEqual([{
      id: "schedule-copy",
      lifecycle: "active",
      revision: 7,
    }]);
    await expect(kernel.queryAll(
      `SELECT id
       FROM owned_plan_schedule_events
       WHERE id = 'schedule-command:activate-hold-schedule'`,
    )).resolves.toEqual([]);
  });

  it("commits a complete prospective Unicode-zone version and reads its effective opportunity in stable order", async () => {
    const kernel = await createRuntime();
    const result = await saveVersion(kernel, {
      requestId: "save-version-unicode",
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      effectiveLocalDate: "2026-08-18",
      timeZone: "Asia/Shanghai",
    });
    const repository = createScheduleRepository(kernel);

    const effective = await repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    });

    expect(result).toMatchObject({
      outcome: "committed",
      scheduleRevision: 8,
      planRevision: 9,
      version: {
        versionNumber: 2,
        effectiveLocalDate: "2026-08-18",
        timeZone: "Asia/Shanghai",
      },
    });
    expect(effective).toMatchObject({
      localDate: "2026-08-18",
      version: {
        id: result.version.id,
        versionNumber: 2,
      },
      opportunity: {
        source: "weekday",
        planDayId: "plan-day-copy",
        state: "pending",
      },
    });
    expect(effective?.version.bindings.map(({ ordinal }) => ordinal))
      .toEqual([0]);
  });

  it("keeps prior versions and historical opportunities unchanged after a later save", async () => {
    const kernel = await createRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_opportunities
          (id, schedule_id, schedule_version_id, local_date, source,
           plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
         VALUES (
           'historical-opportunity', 'schedule-copy',
           'schedule-copy:version:1', '2026-08-11', 'weekday',
           'plan-day-copy', 'consumed', 'skipped', NULL, 2, 100
         )`,
      );
    });
    const before = await kernel.queryAll(
      `SELECT * FROM owned_plan_schedule_opportunities
       WHERE id = 'historical-opportunity'`,
    );

    await saveVersion(kernel, {
      requestId: "save-version-history",
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      effectiveLocalDate: "2026-08-18",
    });

    await expect(kernel.queryAll(
      `SELECT version_number, effective_local_date
       FROM owned_plan_schedule_versions
       WHERE schedule_id = 'schedule-copy'
       ORDER BY version_number`,
    )).resolves.toEqual([
      { version_number: 1, effective_local_date: "2026-08-01" },
      { version_number: 2, effective_local_date: "2026-08-18" },
    ]);
    await expect(kernel.queryAll(
      `SELECT * FROM owned_plan_schedule_opportunities
       WHERE id = 'historical-opportunity'`,
    )).resolves.toEqual(before);
  });

  it("replays one request, rejects changed identity, and serializes stale concurrent saves", async () => {
    const kernel = await createRuntime();
    const first = await saveVersion(kernel, {
      requestId: "save-version-idempotent",
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      effectiveLocalDate: "2026-08-18",
    });
    const replay = await saveVersion(kernel, {
      requestId: "save-version-idempotent",
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      effectiveLocalDate: "2026-08-18",
    });
    expect(replay).toEqual({ ...first, outcome: "already_committed" });

    await expect(saveVersion(kernel, {
      requestId: "save-version-idempotent",
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      effectiveLocalDate: "2026-08-18",
      timeZone: "Asia/Shanghai",
    })).rejects.toMatchObject({
      constructor: ScheduleRepositoryError,
      code: "schedule_request_identity_conflict",
    });

    const attempts = await Promise.allSettled([
      saveVersion(kernel, {
        requestId: "save-version-concurrent-a",
        expectedScheduleRevision: 8,
        expectedPlanRevision: 9,
        effectiveLocalDate: "2026-08-19",
        before: first.version,
      }),
      saveVersion(kernel, {
        requestId: "save-version-concurrent-b",
        expectedScheduleRevision: 8,
        expectedPlanRevision: 9,
        effectiveLocalDate: "2026-08-20",
        before: first.version,
      }),
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = attempts.find(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      constructor: ScheduleRepositoryError,
      code: "schedule_revision_conflict",
    });
  });

  it("rolls back version, bindings, revisions, and event after an injected binding failure", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel, {
      afterBinding() {
        throw new Error("injected_schedule_binding_failure");
      },
    });
    const next = {
      effectiveLocalDate: "2026-08-18",
      mode: "weekday" as const,
      timeZone: "Asia/Singapore",
      bindings: [{
        ordinal: 0,
        weekIndex: 0,
        weekday: "Tuesday" as const,
        planDayId: "plan-day-copy",
      }],
    };
    const before = {
      id: "schedule-copy:version:1",
      versionNumber: 1,
      effectiveLocalDate: "2026-08-01",
      mode: "weekday" as const,
      timeZone: "Asia/Singapore",
      rotationPointer: null,
      bindings: [{
        id: "schedule-binding-copy:owned",
        ordinal: 0,
        weekIndex: 0,
        weekday: "Monday" as const,
        planDayId: "plan-day-copy",
      }],
    };
    const confirmationToken = await createScheduleVersionPreviewToken({
      sha256,
      preview: {
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        before,
        after: next,
      },
    });

    await expect(saveScheduleVersion({
      repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-version-rollback",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        todayLocalDate: "2026-08-18",
        savedAtMs: 1_787_027_200_000,
        before,
        next,
        confirmationToken,
      },
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });

    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedule_versions
       WHERE schedule_id = 'schedule-copy'`,
    )).resolves.toEqual([{ count: 1 }]);
    await expect(kernel.queryAll(
      `SELECT revision FROM owned_plan_schedules
       WHERE id = 'schedule-copy'`,
    )).resolves.toEqual([{ revision: 7 }]);
    await expect(kernel.queryAll(
      `SELECT revision FROM plans WHERE id = 'plan-copy'`,
    )).resolves.toEqual([{ revision: 8 }]);
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedule_events
       WHERE id = 'schedule-command:save-version-rollback'`,
    )).resolves.toEqual([{ count: 0 }]);
  });
});

const commandTime = 1_787_027_200_000;

async function saveRotationVersion(
  kernel: SqliteKernel,
): Promise<Awaited<ReturnType<typeof saveScheduleVersion>>> {
  const repository = createScheduleRepository(kernel);
  const before = {
    id: "schedule-copy:version:1",
    versionNumber: 1,
    effectiveLocalDate: "2026-08-01",
    mode: "weekday" as const,
    timeZone: "Asia/Singapore",
    rotationPointer: null,
    bindings: [{
      id: "schedule-binding-copy:owned",
      ordinal: 0,
      weekIndex: 0,
      weekday: "Monday" as const,
      planDayId: "plan-day-copy",
    }],
  };
  const next = {
    effectiveLocalDate: "2026-08-18",
    mode: "rotation" as const,
    timeZone: "Asia/Singapore",
    bindings: [
      { ordinal: 0, planDayId: "plan-day-copy" },
      { ordinal: 1, planDayId: "plan-day-copy-b" },
    ],
  };
  const confirmationToken = await createScheduleVersionPreviewToken({
    sha256,
    preview: {
      scheduleId: "schedule-copy",
      planId: "plan-copy",
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      before,
      after: next,
    },
  });
  return saveScheduleVersion({
    repository,
    invalidate: async () => undefined,
    sha256,
    input: {
      requestId: "save-rotation-version",
      scheduleId: "schedule-copy",
      planId: "plan-copy",
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      todayLocalDate: "2026-08-18",
      savedAtMs: commandTime,
      before,
      next,
      confirmationToken,
    },
  });
}

function persistedContext(kernel: SqliteKernel) {
  return {
    repository: createScheduleRepository(kernel),
    invalidate: async () => undefined,
    sha256,
  };
}

function persistedActionInput(
  requestId: string,
  scheduleRevision: number,
  planRevision: number,
  instantMs = Date.UTC(2026, 7, 18, 4),
) {
  return {
    requestId,
    scheduleId: "schedule-copy",
    planId: "plan-copy",
    expectedScheduleRevision: scheduleRevision,
    expectedPlanRevision: planRevision,
    instantMs,
    occurredAtMs: commandTime + scheduleRevision,
  };
}

describe("D-42/D-43 rotation command persistence", () => {
  it("persists Repeat, Skip, Advance, and scheduled completion as exact pointer events", async () => {
    const kernel = await createRuntime();
    const rotation = await saveRotationVersion(kernel);
    const context = persistedContext(kernel);

    const repeated = await repeatRotation({
      ...context,
      input: persistedActionInput(
        "rotation-repeat",
        rotation.scheduleRevision,
        rotation.planRevision,
      ),
    });
    expect(repeated.scheduleRevision).toBe(9);

    const skipped = await skipOpportunity({
      ...context,
      input: persistedActionInput(
        "rotation-skip",
        repeated.scheduleRevision,
        repeated.planRevision,
      ),
    });
    expect(skipped.scheduleRevision).toBe(10);
    await expect(kernel.queryAll(
      `SELECT local_date, source, plan_day_id, state, outcome
       FROM owned_plan_schedule_opportunities
       WHERE schedule_id = 'schedule-copy'
       ORDER BY local_date`,
    )).resolves.toEqual([{
      local_date: "2026-08-18",
      source: "rotation",
      plan_day_id: "plan-day-copy",
      state: "consumed",
      outcome: "skipped",
    }]);

    const advanced = await advanceRotation({
      ...context,
      input: persistedActionInput(
        "rotation-advance",
        skipped.scheduleRevision,
        skipped.planRevision,
        Date.UTC(2026, 7, 19, 4),
      ),
    });
    expect(advanced.scheduleRevision).toBe(11);

    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES (
           'rotation-session', 'plan-copy', 'plan-day-copy',
           'scheduled_day', 'completed', '2026-08-20', 'Asia/Singapore',
           ?, ?, NULL, NULL, 1
         )`,
        [commandTime + 100, commandTime + 200],
      )
    );
    const completed = await completeScheduledOpportunity({
      ...context,
      input: {
        ...persistedActionInput(
          "rotation-complete",
          advanced.scheduleRevision,
          advanced.planRevision,
          Date.UTC(2026, 7, 20, 4),
        ),
        sessionId: "rotation-session",
        sessionLocalDate: "2026-08-20",
        planDayId: "plan-day-copy",
      },
    });
    expect(completed.scheduleRevision).toBe(12);

    const events = await kernel.queryAll<{
      event_type: string;
      payload_json: string;
    }>(
      `SELECT event_type, payload_json
       FROM owned_plan_schedule_events
       WHERE event_type LIKE 'rotation_%'
       ORDER BY schedule_revision`,
    );
    expect(events.map(({ event_type }) => event_type)).toEqual([
      "rotation_repeated",
      "rotation_skipped",
      "rotation_advanced",
      "rotation_completed",
    ]);
    expect(events.map(({ payload_json }) =>
      JSON.parse(payload_json).domainEvents[0].toPointer
    )).toEqual([0, 1, 0, 1]);
  });

  it("does not advance alternate, rest, or empty training without explicit intent", async () => {
    const kernel = await createRuntime();
    const rotation = await saveRotationVersion(kernel);
    const context = persistedContext(kernel);

    const held = await recordTrainAnyway({
      ...context,
      input: {
        ...persistedActionInput(
          "train-anyway-held",
          rotation.scheduleRevision,
          rotation.planRevision,
        ),
        workout: { kind: "plan_day", planDayId: "plan-day-copy-b" },
        advanceRotation: false,
      },
    });
    const advanced = await recordTrainAnyway({
      ...context,
      input: {
        ...persistedActionInput(
          "train-anyway-advanced",
          held.scheduleRevision,
          held.planRevision,
          Date.UTC(2026, 7, 19, 4),
        ),
        workout: { kind: "rest_day", planDayId: null },
        advanceRotation: true,
      },
    });

    const events = await kernel.queryAll<{ payload_json: string }>(
      `SELECT payload_json
       FROM owned_plan_schedule_events
       WHERE event_type = 'train_anyway'
       ORDER BY schedule_revision`,
    );
    expect(events.map(({ payload_json }) => {
      const event = JSON.parse(payload_json).domainEvents[0];
      return [event.workoutKind, event.rotationAdvanced, event.toPointer];
    })).toEqual([
      ["plan_day", false, 0],
      ["rest_day", true, 1],
    ]);
    expect(advanced.scheduleRevision).toBe(10);
  });
});

describe("D-44 override lifecycle persistence", () => {
  it("confirmed-replaces pending intent, consumes it once, and rejects historical rewrite", async () => {
    const kernel = await createRuntime();
    const context = persistedContext(kernel);

    const created = await setDateOverride({
      ...context,
      input: {
        requestId: "override-create",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        expectedOverrideRevision: 0,
        overrideId: "override-1",
        localDate: "2026-08-18",
        replacement: { kind: "plan_day", planDayId: "plan-day-copy-b" },
        occurredAtMs: commandTime,
      },
    });
    const replaced = await setDateOverride({
      ...context,
      input: {
        requestId: "override-replace",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: created.scheduleRevision,
        expectedPlanRevision: created.planRevision,
        expectedOverrideRevision: 1,
        overrideId: "override-1",
        localDate: "2026-08-18",
        replacement: { kind: "rest_day" },
        confirmation: "replace_pending_override",
        occurredAtMs: commandTime + 1,
      },
    });
    await expect(context.repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toMatchObject({
      override: {
        id: "override-1",
        state: "pending",
        selection: { kind: "rest_day" },
      },
      opportunity: {
        source: "override",
        state: "pending",
        selectionKind: "rest_day",
        planDayId: null,
      },
    });
    const consumed = await consumeScheduleDateOverride({
      ...context,
      input: {
        requestId: "override-consume",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: replaced.scheduleRevision,
        expectedPlanRevision: replaced.planRevision,
        expectedOverrideRevision: 2,
        overrideId: "override-1",
        localDate: "2026-08-18",
        opportunityId: "override-opportunity-1",
        occurredAtMs: commandTime + 2,
      },
    });
    await expect(context.repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toMatchObject({
      override: {
        id: "override-1",
        state: "consumed",
        opportunityId: "override-opportunity-1",
      },
      opportunity: {
        id: "override-opportunity-1",
        source: "override",
        state: "consumed",
        selectionKind: "rest_day",
        outcome: "rest_day",
      },
    });

    await expect(setDateOverride({
      ...context,
      input: {
        requestId: "override-rewrite",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: consumed.scheduleRevision,
        expectedPlanRevision: consumed.planRevision,
        expectedOverrideRevision: 3,
        overrideId: "override-1",
        localDate: "2026-08-18",
        replacement: { kind: "skip" },
        confirmation: "replace_pending_override",
        occurredAtMs: commandTime + 3,
      },
    })).rejects.toMatchObject({ code: "schedule_override_consumed" });
    await expect(kernel.queryAll(
      `SELECT selection_kind, state, revision, consumed_opportunity_id
       FROM owned_plan_schedule_overrides
       WHERE id = 'override-1'`,
    )).resolves.toEqual([{
      selection_kind: "rest_day",
      state: "consumed",
      revision: 3,
      consumed_opportunity_id: "override-opportunity-1",
    }]);
  });
});

describe("D-45 through D-49 Weekday and timezone persistence", () => {
  it("stores date-only Skip and neutral missed facts without changing recurring bindings", async () => {
    const kernel = await createRuntime();
    const context = persistedContext(kernel);

    const skipped = await skipOpportunity({
      ...context,
      input: persistedActionInput(
        "weekday-skip",
        7,
        8,
        Date.UTC(2026, 7, 17, 4),
      ),
    });
    const missed = await markWeekdayOpportunityMissed({
      ...context,
      input: {
        ...persistedActionInput(
          "weekday-missed",
          skipped.scheduleRevision,
          skipped.planRevision,
          Date.UTC(2026, 7, 24, 4),
        ),
        observedLocalDate: "2026-08-25",
      },
    });

    await expect(kernel.queryAll(
      `SELECT local_date, outcome
       FROM owned_plan_schedule_opportunities
       WHERE schedule_id = 'schedule-copy'
       ORDER BY local_date`,
    )).resolves.toEqual([
      { local_date: "2026-08-17", outcome: "skipped" },
      { local_date: "2026-08-24", outcome: "planned_not_completed" },
    ]);
    await expect(kernel.queryAll(
      `SELECT weekday, plan_day_id
       FROM owned_plan_schedule_bindings
       WHERE schedule_version_id = 'schedule-copy:version:1'`,
    )).resolves.toEqual([{
      weekday: "Monday",
      plan_day_id: "plan-day-copy",
    }]);
    expect(missed.scheduleRevision).toBe(9);
  });

  it("uses stored timezone calendar intent and appends a prospective timezone version", async () => {
    const kernel = await createRuntime();
    const context = persistedContext(kernel);

    const changed = await changeScheduleTimeZone({
      ...context,
      input: {
        requestId: "timezone-follow",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-18",
        choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
        occurredAtMs: commandTime,
      },
    });

    expect(changed).toMatchObject({
      scheduleRevision: 8,
      planRevision: 9,
      version: {
        versionNumber: 2,
        effectiveLocalDate: "2026-08-18",
        timeZone: "America/New_York",
      },
    });
    const effective = await context.repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    });
    expect(effective).toMatchObject({
      localDate: "2026-08-18",
      timeZone: "America/New_York",
      version: { id: changed.version?.id },
    });
  });
});

async function baseSaveInput(
  overrides: Partial<SaveScheduleVersionRepositoryInput> = {},
): Promise<SaveScheduleVersionRepositoryInput> {
  return {
    operation: "save_schedule_version",
    requestId: "repository-save",
    requestSha256: "a".repeat(64),
    scheduleId: "schedule-copy",
    planId: "plan-copy",
    expectedScheduleRevision: 7,
    expectedPlanRevision: 8,
    todayLocalDate: parseLocalDate("2026-08-18"),
    savedAtMs: commandTime,
    before: {
      id: "schedule-copy:version:1",
      versionNumber: 1,
      effectiveLocalDate: "2026-08-01",
      mode: "weekday",
      timeZone: "Asia/Singapore",
      rotationPointer: null,
      bindings: [{
        id: "schedule-binding-copy:owned",
        ordinal: 0,
        weekIndex: 0,
        weekday: "Monday",
        planDayId: "plan-day-copy",
      }],
    },
    next: {
      effectiveLocalDate: parseLocalDate("2026-08-18"),
      mode: "weekday",
      timeZone: parseStoredTimeZone("Asia/Singapore"),
      bindings: [{
        ordinal: 0,
        weekIndex: 0,
        weekday: "Tuesday",
        planDayId: "plan-day-copy",
      }],
    },
    confirmationToken: "schedule-preview-v1:test",
    versionId: "repository-version-2",
    bindingIds: ["repository-binding-2"],
    ...overrides,
  };
}

function repositoryErrorCode(
  action: () => Promise<unknown>,
): Promise<string> {
  return action().then(
    () => {
      throw new Error("expected_schedule_repository_error");
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(ScheduleRepositoryError);
      return (error as ScheduleRepositoryError).code;
    },
  );
}

describe("schedule repository edge contracts", () => {
  it("returns null for absent receipts and rejects invalid or changed receipts", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel);
    await expect(repository.readCommandResult({
      requestId: "absent",
      requestSha256: "a".repeat(64),
    })).resolves.toBeNull();

    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_plan_schedule_events
          (id, schedule_id, event_type, local_date, payload_json,
           schedule_revision, created_at_ms)
         VALUES (
           'schedule-command:invalid-receipt', 'schedule-copy',
           'invalid_receipt', NULL, '{}', 7, 100
         )`,
      )
    );
    await expect(repository.readCommandResult({
      requestId: "invalid-receipt",
      requestSha256: "a".repeat(64),
    })).rejects.toThrow("schedule_command_receipt_invalid");

    const committed = await repository.saveVersion(await baseSaveInput({
      requestId: "receipt-source",
    }));
    await expect(repository.readCommandResult({
      requestId: "receipt-source",
      requestSha256: "b".repeat(64),
    })).rejects.toMatchObject({
      code: "schedule_request_identity_conflict",
    });
    await expect(repository.readCommandResult({
      requestId: "receipt-source",
      requestSha256: "a".repeat(64),
    })).resolves.toEqual({ ...committed, outcome: "already_committed" });
  });

  it.each([
    {
      name: "missing schedule",
      mutate: (input: SaveScheduleVersionRepositoryInput) => ({
        ...input,
        scheduleId: "missing-schedule",
      }),
      code: "schedule_reference_invalid",
    },
    {
      name: "wrong plan",
      mutate: (input: SaveScheduleVersionRepositoryInput) => ({
        ...input,
        planId: "plan-hold",
      }),
      code: "schedule_reference_invalid",
    },
    {
      name: "stale schedule revision",
      mutate: (input: SaveScheduleVersionRepositoryInput) => ({
        ...input,
        expectedScheduleRevision: 6,
      }),
      code: "schedule_revision_conflict",
    },
    {
      name: "stale plan revision",
      mutate: (input: SaveScheduleVersionRepositoryInput) => ({
        ...input,
        expectedPlanRevision: 7,
      }),
      code: "schedule_plan_revision_conflict",
    },
    {
      name: "changed before snapshot",
      mutate: (input: SaveScheduleVersionRepositoryInput) => ({
        ...input,
        before: null,
      }),
      code: "schedule_before_snapshot_conflict",
    },
    {
      name: "foreign plan-day binding",
      mutate: (input: SaveScheduleVersionRepositoryInput) => ({
        ...input,
        next: {
          ...input.next,
          bindings: [{
            ordinal: 0,
            weekIndex: 0,
            weekday: "Tuesday" as const,
            planDayId: "plan-day-hold",
          }],
        },
      }),
      code: "schedule_reference_invalid",
    },
  ])("rejects $name without partial facts", async ({ name, mutate, code }) => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel);
    const idSuffix = name.replaceAll(" ", "-");
    const input = mutate(await baseSaveInput({
      requestId: `save-conflict-${idSuffix}`,
      versionId: `save-conflict-version-${idSuffix}`,
      bindingIds: [`save-conflict-binding-${idSuffix}`],
    })) as SaveScheduleVersionRepositoryInput;

    await expect(repositoryErrorCode(() => repository.saveVersion(input)))
      .resolves.toBe(code);
  });

  it("rejects archived ownership state and accepts an empty Rotation version", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel);
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE owned_plan_aggregate_states
         SET lifecycle = 'archived', archived_at_ms = 100
         WHERE plan_id = 'plan-copy'`,
      )
    );
    const archivedInput = await baseSaveInput({
      requestId: "save-archived",
    });
    await expect(repositoryErrorCode(() =>
      repository.saveVersion(archivedInput)
    )).resolves.toBe("schedule_reference_invalid");

    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE owned_plan_aggregate_states
         SET lifecycle = 'ready', archived_at_ms = NULL
         WHERE plan_id = 'plan-copy'`,
      )
    );
    const empty = await repository.saveVersion(await baseSaveInput({
      requestId: "save-empty-rotation",
      next: {
        effectiveLocalDate: parseLocalDate("2026-08-18"),
        mode: "rotation",
        timeZone: parseStoredTimeZone("Asia/Singapore"),
        rotationPointer: 0,
        bindings: [],
      },
      versionId: "empty-rotation-version",
      bindingIds: [],
    }));
    expect(empty.version).toMatchObject({
      mode: "rotation",
      rotationPointer: 0,
      bindings: [],
    });
    await expect(repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toMatchObject({ opportunity: null });
  });

  it("reads null before the first effective date and for a missing schedule", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel);
    await expect(repository.readEffectiveOpportunity({
      scheduleId: "missing-schedule",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toBeNull();
    await expect(repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 6, 31, 4),
    })).resolves.toBeNull();
    await expect(repository.readActionState({
      scheduleId: "missing-schedule",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toBeNull();
    await expect(repository.readTimeZoneState({
      scheduleId: "missing-schedule",
    })).resolves.toBeNull();
  });

  it("updates a materialized pending opportunity and rejects mismatched session facts atomically", async () => {
    const kernel = await createRuntime();
    const rotation = await saveRotationVersion(kernel);
    const repository = createScheduleRepository(kernel);
    const state = await repository.readActionState({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    });
    expect(state?.opportunity).toBeTruthy();
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_plan_schedule_opportunities
          (id, schedule_id, schedule_version_id, local_date, source,
           plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
         VALUES (?, 'schedule-copy', ?, '2026-08-18', 'rotation',
                 'plan-day-copy', 'pending', NULL, NULL, 1, NULL)`,
        [state!.opportunity!.id, rotation.version.id],
      )
    );
    const skipped = await skipOpportunity({
      ...persistedContext(kernel),
      input: persistedActionInput(
        "update-pending-opportunity",
        rotation.scheduleRevision,
        rotation.planRevision,
      ),
    });
    await expect(kernel.queryAll(
      `SELECT state, outcome, revision
       FROM owned_plan_schedule_opportunities
       WHERE id = ?`,
      [state!.opportunity!.id],
    )).resolves.toEqual([{
      state: "consumed",
      outcome: "skipped",
      revision: 2,
    }]);

    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES (
           'bad-session', 'plan-copy', 'plan-day-copy',
           'scheduled_day', 'completed', '2026-08-19', 'Asia/Singapore',
           100, 200, NULL, NULL, 1
         )`,
      )
    );
    await expect(completeScheduledOpportunity({
      ...persistedContext(kernel),
      input: {
        ...persistedActionInput(
          "bad-session-completion",
          skipped.scheduleRevision,
          skipped.planRevision,
          Date.UTC(2026, 7, 19, 4),
        ),
        sessionId: "bad-session",
        sessionLocalDate: "2026-08-19",
        planDayId: "plan-day-copy-b",
      },
    })).rejects.toMatchObject({ code: "schedule_session_fact_conflict" });
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedule_events
       WHERE id = 'schedule-command:bad-session-completion'`,
    )).resolves.toEqual([{ count: 0 }]);
  });

  it("replays each mutation repository transaction without duplicate facts", async () => {
    const kernel = await createRuntime();
    const context = persistedContext(kernel);
    const first = await setDateOverride({
      ...context,
      input: {
        requestId: "repository-override-replay",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        expectedOverrideRevision: 0,
        overrideId: "override-replay",
        localDate: "2026-08-18",
        replacement: { kind: "skip" },
        occurredAtMs: commandTime,
      },
    });
    const replay = await context.repository.readCommandResult({
      requestId: "repository-override-replay",
      requestSha256: (
        await kernel.queryAll<{ payload_json: string }>(
          `SELECT payload_json FROM owned_plan_schedule_events
           WHERE id = 'schedule-command:repository-override-replay'`,
        )
      ).map(({ payload_json }) => JSON.parse(payload_json).requestSha256)[0],
    });
    expect(replay).toEqual({ ...first, outcome: "already_committed" });

    const repeated = await repeatRotation({
      ...context,
      input: {
        ...persistedActionInput(
          "repository-action-replay",
          first.scheduleRevision,
          first.planRevision,
        ),
      },
    }).catch((error: unknown) => error);
    expect(repeated).toBeInstanceOf(ScheduleCommandInputError);
  });

  it("persists plan-day and skip override opportunity variants", async () => {
    const kernel = await createRuntime();
    const context = persistedContext(kernel);
    const planDay = await setDateOverride({
      ...context,
      input: {
        requestId: "override-plan-day",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        expectedOverrideRevision: 0,
        overrideId: "override-plan-day",
        localDate: "2026-08-18",
        replacement: { kind: "plan_day", planDayId: "plan-day-copy-b" },
        occurredAtMs: commandTime,
      },
    });
    const consumedPlanDay = await consumeScheduleDateOverride({
      ...context,
      input: {
        requestId: "consume-plan-day",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: planDay.scheduleRevision,
        expectedPlanRevision: planDay.planRevision,
        expectedOverrideRevision: 1,
        overrideId: "override-plan-day",
        localDate: "2026-08-18",
        opportunityId: "override-plan-day-opportunity",
        occurredAtMs: commandTime + 1,
      },
    });
    await expect(kernel.queryAll(
      `SELECT state, outcome, plan_day_id, consumed_at_ms
       FROM owned_plan_schedule_opportunities
       WHERE id = 'override-plan-day-opportunity'`,
    )).resolves.toEqual([{
      state: "pending",
      outcome: null,
      plan_day_id: "plan-day-copy-b",
      consumed_at_ms: null,
    }]);

    const nextDate = "2026-08-19";
    const skip = await setDateOverride({
      ...context,
      input: {
        requestId: "override-skip",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: consumedPlanDay.scheduleRevision,
        expectedPlanRevision: consumedPlanDay.planRevision,
        expectedOverrideRevision: 0,
        overrideId: "override-skip",
        localDate: nextDate,
        replacement: { kind: "skip" },
        occurredAtMs: commandTime + 2,
      },
    });
    await consumeScheduleDateOverride({
      ...context,
      input: {
        requestId: "consume-skip",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: skip.scheduleRevision,
        expectedPlanRevision: skip.planRevision,
        expectedOverrideRevision: 1,
        overrideId: "override-skip",
        localDate: nextDate,
        opportunityId: "override-skip-opportunity",
        occurredAtMs: commandTime + 3,
      },
    });
    await expect(kernel.queryAll(
      `SELECT state, outcome, plan_day_id
       FROM owned_plan_schedule_opportunities
       WHERE id = 'override-skip-opportunity'`,
    )).resolves.toEqual([{
      state: "consumed",
      outcome: "skipped",
      plan_day_id: null,
    }]);
  });

  it("rejects a foreign override plan day and keeps timezone without a version", async () => {
    const kernel = await createRuntime();
    const context = persistedContext(kernel);
    await expect(setDateOverride({
      ...context,
      input: {
        requestId: "override-foreign-day",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        expectedOverrideRevision: 0,
        overrideId: "override-foreign",
        localDate: "2026-08-18",
        replacement: { kind: "plan_day", planDayId: "plan-day-hold" },
        occurredAtMs: commandTime,
      },
    })).rejects.toMatchObject({ code: "schedule_reference_invalid" });

    const kept = await changeScheduleTimeZone({
      ...context,
      input: {
        requestId: "timezone-keep-repository",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-18",
        choice: KEEP_CURRENT_TIMEZONE_LABEL,
        occurredAtMs: commandTime,
      },
    });
    expect(kept).toMatchObject({
      scheduleRevision: 8,
      planRevision: 8,
      invalidations: [
        "schedule:schedule-copy",
        "schedule:schedule-copy:date:2026-08-18",
        "today",
      ],
    });
    expect(kept).not.toHaveProperty("version");
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedule_versions
       WHERE schedule_id = 'schedule-copy'`,
    )).resolves.toEqual([{ count: 1 }]);
    await expect(context.repository.readTimeZoneState({
      scheduleId: "schedule-copy",
    })).resolves.toMatchObject({
      state: {
        timeZone: "Asia/Singapore",
        lastDeviceTimeZoneDecision: {
          detectedDeviceTimeZone: "America/New_York",
          choice: KEEP_CURRENT_TIMEZONE_LABEL,
        },
      },
    });
  });

  it("replays direct repository mutation calls before touching mutable state", async () => {
    const kernel = await createRuntime();
    const real = createScheduleRepository(kernel);

    let actionInput: ApplyScheduleOpportunityRepositoryInput | undefined;
    const actionRepository = {
      ...real,
      async applyOpportunityAction(input: ApplyScheduleOpportunityRepositoryInput) {
        actionInput = input;
        return real.applyOpportunityAction(input);
      },
    };
    const action = await repeatRotation({
      repository: actionRepository,
      invalidate: async () => undefined,
      sha256,
      input: persistedActionInput("direct-action-replay", 7, 8),
    }).catch((error: unknown) => error);
    expect(action).toBeInstanceOf(ScheduleCommandInputError);

    let overrideInput: SetScheduleDateOverrideRepositoryInput | undefined;
    const overrideRepository = {
      ...real,
      async setDateOverride(input: SetScheduleDateOverrideRepositoryInput) {
        overrideInput = input;
        return real.setDateOverride(input);
      },
    };
    const created = await setDateOverride({
      repository: overrideRepository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "direct-override-replay",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: 7,
        expectedPlanRevision: 8,
        expectedOverrideRevision: 0,
        overrideId: "direct-override",
        localDate: "2026-08-18",
        replacement: { kind: "rest_day" },
        occurredAtMs: commandTime,
      },
    });
    await expect(real.setDateOverride(overrideInput!)).resolves.toEqual({
      ...created,
      outcome: "already_committed",
    });

    let consumeInput: ConsumeScheduleDateOverrideRepositoryInput | undefined;
    const consumeRepository = {
      ...real,
      async consumeDateOverride(
        input: ConsumeScheduleDateOverrideRepositoryInput,
      ) {
        consumeInput = input;
        return real.consumeDateOverride(input);
      },
    };
    const consumed = await consumeScheduleDateOverride({
      repository: consumeRepository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "direct-consume-replay",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: created.scheduleRevision,
        expectedPlanRevision: created.planRevision,
        expectedOverrideRevision: 1,
        overrideId: "direct-override",
        localDate: "2026-08-18",
        opportunityId: "direct-override-opportunity",
        occurredAtMs: commandTime + 1,
      },
    });
    await expect(real.consumeDateOverride(consumeInput!)).resolves.toEqual({
      ...consumed,
      outcome: "already_committed",
    });

    let timezoneInput: ChangeScheduleTimeZoneRepositoryInput | undefined;
    const timezoneRepository = {
      ...real,
      async changeTimeZone(input: ChangeScheduleTimeZoneRepositoryInput) {
        timezoneInput = input;
        return real.changeTimeZone(input);
      },
    };
    const kept = await changeScheduleTimeZone({
      repository: timezoneRepository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "direct-timezone-replay",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: consumed.scheduleRevision,
        expectedPlanRevision: consumed.planRevision,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-18",
        choice: KEEP_CURRENT_TIMEZONE_LABEL,
        occurredAtMs: commandTime + 2,
      },
    });
    await expect(real.changeTimeZone(timezoneInput!)).resolves.toEqual({
      ...kept,
      outcome: "already_committed",
    });
  });

  it("replays a direct opportunity transaction after a Rotation command commits", async () => {
    const kernel = await createRuntime();
    const rotation = await saveRotationVersion(kernel);
    const real = createScheduleRepository(kernel);
    let staged: ApplyScheduleOpportunityRepositoryInput | undefined;
    const repository = {
      ...real,
      async applyOpportunityAction(input: ApplyScheduleOpportunityRepositoryInput) {
        staged = input;
        return real.applyOpportunityAction(input);
      },
    };
    const committed = await repeatRotation({
      repository,
      invalidate: async () => undefined,
      sha256,
      input: persistedActionInput(
        "direct-rotation-action-replay",
        rotation.scheduleRevision,
        rotation.planRevision,
      ),
    });

    await expect(real.applyOpportunityAction(staged!)).resolves.toEqual({
      ...committed,
      outcome: "already_committed",
    });
  });

  it("reads empty Weekday and Rotation schedules without inventing opportunities", async () => {
    const weekdayKernel = await createRuntime();
    const weekdayRepository = createScheduleRepository(weekdayKernel);
    await weekdayRepository.saveVersion(await baseSaveInput({
      requestId: "empty-weekday",
      versionId: "empty-weekday-version",
      bindingIds: [],
      next: {
        effectiveLocalDate: parseLocalDate("2026-08-18"),
        mode: "weekday",
        timeZone: parseStoredTimeZone("Asia/Singapore"),
        bindings: [],
      },
    }));
    await expect(weekdayRepository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toMatchObject({ opportunity: null });

    const rotationKernel = await createRuntime();
    const rotationRepository = createScheduleRepository(rotationKernel);
    await rotationRepository.saveVersion(await baseSaveInput({
      requestId: "empty-rotation-action",
      versionId: "empty-rotation-action-version",
      bindingIds: [],
      next: {
        effectiveLocalDate: parseLocalDate("2026-08-18"),
        mode: "rotation",
        timeZone: parseStoredTimeZone("Asia/Singapore"),
        rotationPointer: 0,
        bindings: [],
      },
    }));
    await expect(rotationRepository.readActionState({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toMatchObject({
      rotationState: {
        bindings: [],
        pointer: 0,
        currentOpportunity: null,
      },
      opportunity: null,
    });
  });

  it("reads consumed recurring opportunities and rejects malformed rest outcomes", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_opportunities
          (id, schedule_id, schedule_version_id, local_date, source,
           plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
         VALUES (
           'consumed-weekday', 'schedule-copy', 'schedule-copy:version:1',
           '2026-08-17', 'weekday', 'plan-day-copy', 'consumed',
           'skipped', NULL, 2, 100
         )`,
      );
    });
    await expect(repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 17, 4),
    })).resolves.toMatchObject({
      opportunity: {
        id: "consumed-weekday",
        state: "consumed",
        outcome: "skipped",
      },
    });

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `DELETE FROM owned_plan_schedule_opportunities
         WHERE id = 'consumed-weekday'`,
      ).catch(() => undefined);
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_opportunities
          (id, schedule_id, schedule_version_id, local_date, source,
           plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
         VALUES (
           'malformed-weekday', 'schedule-copy', 'schedule-copy:version:1',
           '2026-08-24', 'weekday', 'plan-day-copy', 'consumed',
           'rest_day', NULL, 2, 100
         )`,
      );
    });
    await expect(repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 24, 4),
    })).rejects.toThrow("schedule_opportunity_state_invalid");
  });

  it("rejects a consumed override whose opportunity fact is missing", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel);
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_plan_schedule_overrides
          (id, schedule_id, local_date, selection_kind, plan_day_id, state,
           revision, consumed_opportunity_id, created_at_ms, consumed_at_ms)
         VALUES (
           'orphan-override', 'schedule-copy', '2026-08-18', 'skip', NULL,
           'consumed', 2, 'missing-override-opportunity', 100, 200
         )`,
      )
    );

    await expect(repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).rejects.toThrow("schedule_override_opportunity_invalid");
  });

  it("rejects consuming an override when its schedule has no version", async () => {
    const kernel = await createRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE plans SET is_active = 0 WHERE id = 'plan-copy'`,
      );
      await transaction.execute(
        `UPDATE owned_plan_schedules
         SET lifecycle = 'inactive', deactivated_at_ms = 100
         WHERE id = 'schedule-copy'`,
      );
      await transaction.execute(
        `UPDATE plans SET is_active = 1, revision = 3
         WHERE id = 'plan-hold'`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
         VALUES ('versionless-schedule', 'plan-hold', 'active', 1, 100, NULL)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_overrides
          (id, schedule_id, local_date, selection_kind, plan_day_id, state,
           revision, consumed_opportunity_id, created_at_ms, consumed_at_ms)
         VALUES (
           'versionless-override', 'versionless-schedule', '2026-08-18',
           'skip', NULL, 'pending', 1, NULL, 100, NULL
         )`,
      );
    });
    const repository = createScheduleRepository(kernel);
    const transition = consumeDateOverride({
      current: {
        version: 1,
        state: "pending",
        id: "versionless-override",
        revision: 1,
        localDate: parseLocalDate("2026-08-18"),
        selection: { kind: "skip" },
      },
      expectedRevision: 1,
      opportunityId: "versionless-opportunity",
    });
    const input: ConsumeScheduleDateOverrideRepositoryInput = {
      operation: "consume_date_override",
      requestId: "consume-versionless",
      requestSha256: "c".repeat(64),
      scheduleId: "versionless-schedule",
      planId: "plan-hold",
      expectedScheduleRevision: 1,
      expectedPlanRevision: 3,
      localDate: parseLocalDate("2026-08-18"),
      occurredAtMs: 200,
      transition,
    };
    await expect(repository.consumeDateOverride(input)).rejects.toMatchObject({
      code: "schedule_reference_invalid",
    });
  });

  it("rejects a timezone version containing a foreign binding", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel);
    const transition = transitionTimeZoneChoice({
      current: {
        version: 1,
        revision: 7,
        timeZone: parseStoredTimeZone("Asia/Singapore"),
        lastDeviceTimeZoneDecision: null,
      },
      expectedRevision: 7,
      detectedDeviceTimeZone: parseStoredTimeZone("America/New_York"),
      effectiveLocalDate: parseLocalDate("2026-08-18"),
      choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
    });
    const input: ChangeScheduleTimeZoneRepositoryInput = {
      operation: "change_timezone",
      requestId: "timezone-foreign-binding",
      requestSha256: "d".repeat(64),
      scheduleId: "schedule-copy",
      planId: "plan-copy",
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      localDate: parseLocalDate("2026-08-18"),
      occurredAtMs: commandTime,
      transition,
      nextVersion: {
        effectiveLocalDate: parseLocalDate("2026-08-18"),
        mode: "weekday",
        timeZone: parseStoredTimeZone("America/New_York"),
        bindings: [{
          ordinal: 0,
          weekIndex: 0,
          weekday: "Tuesday",
          planDayId: "plan-day-hold",
        }],
      },
      versionId: "timezone-foreign-version",
      bindingIds: ["timezone-foreign-binding"],
    };
    await expect(repository.changeTimeZone(input)).rejects.toMatchObject({
      code: "schedule_reference_invalid",
    });
  });

  it("ignores non-pointer events and returns no opportunity for an out-of-range stored pointer", async () => {
    const kernel = await createRuntime();
    const repository = createScheduleRepository(kernel);
    await repository.saveVersion(await baseSaveInput({
      requestId: "out-of-range-pointer",
      versionId: "out-of-range-pointer-version",
      bindingIds: ["out-of-range-pointer-binding"],
      next: {
        effectiveLocalDate: parseLocalDate("2026-08-18"),
        mode: "rotation",
        timeZone: parseStoredTimeZone("Asia/Singapore"),
        rotationPointer: 9,
        bindings: [{ ordinal: 0, planDayId: "plan-day-copy" }],
      },
    }));
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_events
          (id, schedule_id, event_type, local_date, payload_json,
           schedule_revision, created_at_ms)
         VALUES (
           'event-without-domain-events', 'schedule-copy', 'unrelated',
           '2026-08-18', '{}', 9, 101
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_events
          (id, schedule_id, event_type, local_date, payload_json,
           schedule_revision, created_at_ms)
         VALUES (
           'event-with-invalid-pointers', 'schedule-copy', 'unrelated',
           '2026-08-18',
           '{"domainEvents":[null,"bad",{},{"toPointer":"bad"}]}',
           10, 102
         )`,
      );
    });

    await expect(repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toMatchObject({
      version: { rotationPointer: 9 },
      opportunity: null,
    });
  });

  it("prioritizes a pending plan-day override over Rotation action state", async () => {
    const kernel = await createRuntime();
    const rotation = await saveRotationVersion(kernel);
    const context = persistedContext(kernel);
    await setDateOverride({
      ...context,
      input: {
        requestId: "rotation-plan-day-override",
        scheduleId: "schedule-copy",
        planId: "plan-copy",
        expectedScheduleRevision: rotation.scheduleRevision,
        expectedPlanRevision: rotation.planRevision,
        expectedOverrideRevision: 0,
        overrideId: "rotation-plan-day-override",
        localDate: "2026-08-18",
        replacement: {
          kind: "plan_day",
          planDayId: "plan-day-copy-b",
        },
        occurredAtMs: commandTime + 1,
      },
    });

    await expect(context.repository.readEffectiveOpportunity({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toMatchObject({
      opportunity: {
        source: "override",
        state: "pending",
        planDayId: "plan-day-copy-b",
      },
    });
    await expect(context.repository.readActionState({
      scheduleId: "schedule-copy",
      instantMs: Date.UTC(2026, 7, 18, 4),
    })).resolves.toMatchObject({
      hasEffectiveOverride: true,
      rotationState: {
        currentOpportunity: {
          source: "rotation",
          planDayId: "plan-day-copy",
        },
      },
      opportunity: null,
    });
    await expect(repeatRotation({
      ...context,
      input: persistedActionInput(
        "rotation-override-repeat-rejected",
        rotation.scheduleRevision + 1,
        rotation.planRevision,
      ),
    })).rejects.toMatchObject({ code: "schedule_action_invalid" });
    await expect(recordTrainAnyway({
      ...context,
      input: {
        ...persistedActionInput(
          "rotation-override-train-anyway",
          rotation.scheduleRevision + 1,
          rotation.planRevision,
        ),
        workout: { kind: "plan_day", planDayId: "plan-day-copy-b" },
        advanceRotation: true,
      },
    })).resolves.toMatchObject({ scheduleRevision: rotation.scheduleRevision + 2 });
  });
});
