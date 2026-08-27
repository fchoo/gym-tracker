import {
  afterEach,
  describe,
  expect,
  it,
  jest,
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
  createScheduleRuntimePort,
} from "../../src/bootstrap/scheduleRuntime";
import {
  createOwnedPlanRuntimePort,
} from "../../src/bootstrap/ownedPlanRuntime";
import {
  parseAcceptedStarterPlanPack,
} from "../../src/domains/plans";
import {
  completeSet,
  finishCompleted,
  startWorkout,
} from "../../src/domains/workout";
import {
  FOLLOW_DEVICE_TIMEZONE_LABEL,
  KEEP_CURRENT_TIMEZONE_LABEL,
} from "../../src/domains/scheduling/scheduleState";
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
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  createPlansWorkoutRepository,
} from "../../src/platform/sqlite/repositories/plansWorkoutRepository";
import {
  createScheduleRepository,
} from "../../src/platform/sqlite/repositories/scheduleRepository";
import {
  createWorkoutOutcomeRepository,
} from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";
import {
  createWorkoutRepository,
} from "../../src/platform/sqlite/repositories/workoutRepository";
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
const kernels = new Set<SqliteKernel>();
const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function setupRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "gym-today-schedule-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(databasePath);
  fixture.exec(readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures/v6-metric-profiles.sql"),
    "utf8",
  ));
  fixture.exec(`
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
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
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
      `UPDATE plans SET revision = 8 WHERE id = 'plan-copy'`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal,
         between_exercise_rest_seconds, metric_profile,
         metric_contract_version, exercise_metric_generation, revision)
       VALUES (
         'owned-day-exercise-squat-a', 'plan-day-copy', 'exercise-squat', 0,
         120, 'load_reps', 1, 1, 1
       )`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES (
         'owned-working-target-a', 'owned-day-exercise-squat-a', 0,
         '{"version":1,"profile":"load_reps","loadGrams":45000,"minReps":6,"maxReps":8,"incrementGrams":2500,"perSide":false}',
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
         'owned-policy-a', 'owned-day-exercise-squat-a', 'manual_hold',
         'manual-hold-v1', 1,
         '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
         'load_reps', 1, 1, 'active', 1
       )`,
    );
    await transaction.execute(
      `INSERT INTO plan_days
        (id, plan_id, ordinal, name, revision)
       VALUES ('plan-day-copy-b', 'plan-copy', 1, 'Full Body B', 1)`,
    );
    await transaction.execute(
      `INSERT INTO plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal,
         between_exercise_rest_seconds, metric_profile,
         metric_contract_version, exercise_metric_generation, revision)
       VALUES (
         'plan-day-exercise-squat-b', 'plan-day-copy-b', 'exercise-squat', 0,
         120, 'load_reps', 1, 1, 1
       )`,
    );
    await transaction.execute(
      `INSERT INTO plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
         target_json, unit_json, metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES (
         'working-target-b', 'plan-day-exercise-squat-b', 0, 45000, 6, 8,
         '{"version":1,"profile":"load_reps","loadGrams":45000,"minReps":6,"maxReps":8,"incrementGrams":2500,"perSide":false}',
         '{"version":1,"load":"grams","count":"repetitions"}',
         'load_reps', 1, 1, 1
       )`,
    );
    await transaction.execute(
      `INSERT INTO progression_policies
        (id, plan_day_exercise_id, policy_type, policy_version, rule_json,
         metric_profile, metric_contract_version,
         exercise_metric_generation, status, invalidated_at_ms, revision)
       VALUES (
         'policy-b', 'plan-day-exercise-squat-b', 'load_reps', 1,
         '{"version":1,"incrementGrams":2500}', 'load_reps', 1, 1,
         'active', NULL, 1
       )`,
    );
  });

  let nowMs = Date.UTC(2026, 7, 18, 4);
  let id = 0;
  const ownedPlans = createOwnedPlanRuntimePort(kernel, {
    nowMs: () => nowMs,
    randomUUID: () => `owned-${++id}`,
    sha256,
  });
  const schedule = createScheduleRuntimePort(kernel, ownedPlans, {
    now: () => new Date(nowMs),
    nowMs: () => nowMs,
    randomUUID: () => `schedule-${++id}`,
    sha256,
  }) as any;
  return {
    kernel,
    ownedPlans,
    schedule,
    setNow(value: number) {
      nowMs = value;
    },
  };
}

async function insertValidCustomOwnedPlan(
  kernel: SqliteKernel,
  input: Readonly<{
    planId: string;
    dayId: string;
    occurrenceId: string;
    targetId: string;
    policyId: string;
    name: string;
  }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES (?, NULL, 'custom', NULL, NULL, ?, 1, 'Personal', 'Strength',
               30, 'Owner', 0, 4)`,
      [input.planId, input.name],
    );
    await transaction.execute(
      `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
       VALUES (?, ?, 0, 'Custom Day', 1)`,
      [input.dayId, input.planId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_aggregate_states
        (plan_id, lifecycle, graph_status, missing_requirement_code,
         missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
       VALUES (?, 'ready', 'valid', NULL, NULL, 100, 100, NULL)`,
      [input.planId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal,
         between_exercise_rest_seconds, metric_profile,
         metric_contract_version, exercise_metric_generation, revision)
       VALUES (?, ?, 'exercise-squat', 0, 120, 'load_reps', 1, 1, 1)`,
      [input.occurrenceId, input.dayId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES (
         ?, ?, 0,
         '{"version":1,"profile":"load_reps","loadGrams":30000,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
         '{"version":1,"load":"grams","count":"repetitions"}',
         'load_reps', 1, 1, 1
       )`,
      [input.targetId, input.occurrenceId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_progression_policies
        (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
         rule_json, metric_profile, metric_contract_version,
         exercise_metric_generation, status, revision)
       VALUES (
         ?, ?, 'manual_hold', 'manual-hold-v1', 1,
         '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
         'load_reps', 1, 1, 'active', 1
       )`,
      [input.policyId, input.occurrenceId],
    );
  });
}

describe("Today schedule workout integration", () => {
  it("projects pending owned recommendations on Today", async () => {
    const runtime = await setupRuntime();
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE progression_recommendations
         SET status = 'invalidated', decided_at_ms = 1_787_027_199_000
         WHERE status = 'pending'`,
      );
      await transaction.execute(
        `INSERT INTO owned_progression_recommendations
          (id, exercise_id, owned_plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json, metric_profile,
           metric_contract_version, exercise_metric_generation, status,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         VALUES (
           'owned-recommendation-today', 'exercise-squat',
           'owned-working-target-a', 'load_reps', 1, 1,
           '{"version":1,"comparableReps":[8,8,8]}',
           '{"version":1,"profile":"load_reps","loadGrams":45000,"minReps":6,"maxReps":8,"incrementGrams":2500,"perSide":false}',
           '{"version":1,"profile":"load_reps","loadGrams":47500,"minReps":6,"maxReps":8,"incrementGrams":2500,"perSide":false}',
           'load_reps', 1, 1, 'pending', 1, 1, 1_787_027_200_000, NULL
         )`,
      );
    });

    const today = await runtime.schedule.loadToday(
      Date.UTC(2026, 7, 17, 4),
    );

    expect(today?.view).toMatchObject({
      state: "scheduled",
      exercises: [{
        exerciseId: "exercise-squat",
        recommendationStatus: "pending",
      }],
    });
    await expect(createPlansWorkoutRepository(runtime.kernel).getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    })).resolves.toMatchObject({
      state: "scheduled",
      exercises: [{
        exerciseId: "exercise-squat",
        recommendationStatus: "pending",
      }],
    });
  });

  it("activates a valid unscheduled owned plan through Save schedule and projects Today", async () => {
    const runtime = await setupRuntime();
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (
           'plan-custom-runtime', NULL, 'custom', NULL, NULL,
           'Maestro Custom Plan', 1, 'Personal', 'Strength', 30, 'Owner', 0, 4
         )`,
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES (
           'plan-day-custom-runtime', 'plan-custom-runtime', 0,
           'Custom Day', 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_aggregate_states
          (plan_id, lifecycle, graph_status, missing_requirement_code,
           missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
         VALUES (
           'plan-custom-runtime', 'ready', 'valid', NULL, NULL,
           100, 100, NULL
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES (
           'occurrence-custom-runtime', 'plan-day-custom-runtime',
           'exercise-squat', 0, 120, 'load_reps', 1, 1, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (
           'target-custom-runtime', 'occurrence-custom-runtime', 0,
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
           'policy-custom-runtime', 'occurrence-custom-runtime', 'manual_hold',
           'manual-hold-v1', 1,
           '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
           'load_reps', 1, 1, 'active', 1
         )`,
      );
    });

    const before = await runtime.schedule.loadSchedule("plan-custom-runtime");
    expect(before).toMatchObject({
      planRevision: 4,
      scheduleId: null,
      scheduleRevision: null,
      scheduleLifecycle: null,
      activeSchedule: {
        kind: "pair",
        planId: "plan-copy",
        planRevision: 8,
        scheduleId: "schedule-copy",
        scheduleRevision: 7,
      },
      current: null,
    });

    const saved = await runtime.schedule.saveSchedule({
      planId: "plan-custom-runtime",
      scheduleId: null,
      expectedPlanRevision: before.planRevision,
      expectedScheduleRevision: null,
      expectedActivePair: before.activeSchedule,
      before: null,
      todayLocalDate: before.todayLocalDate,
      next: {
        effectiveLocalDate: before.todayLocalDate,
        mode: "weekday",
        timeZone: "Asia/Singapore",
        bindings: [{
          ordinal: 0,
          weekIndex: 0,
          weekday: "Tuesday",
          planDayId: "plan-day-custom-runtime",
        }],
      },
    });

    expect(saved).toMatchObject({
      planRevision: 5,
      scheduleRevision: 1,
      scheduleLifecycle: "active",
      activeSchedule: {
        kind: "pair",
        planId: "plan-custom-runtime",
        planRevision: 5,
        scheduleRevision: 1,
      },
      current: {
        versionNumber: 1,
        mode: "weekday",
        bindings: [{ planDayId: "plan-day-custom-runtime" }],
      },
    });
    await expect(runtime.schedule.loadToday(Date.UTC(2026, 7, 18, 4)))
      .resolves.toMatchObject({
        planId: "plan-custom-runtime",
        planRevision: 5,
        scheduleRevision: 1,
        view: {
          state: "scheduled",
          dayId: "plan-day-custom-runtime",
          dayName: "Custom Day",
        },
      });
    await expect(runtime.kernel.queryAll(
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
        id: "plan-custom-runtime",
        is_active: 1,
        lifecycle: "active",
        revision: 1,
      },
    ]);
  });

  it("replays one activation after post-commit readback fails", async () => {
    const runtime = await setupRuntime();
    await insertValidCustomOwnedPlan(runtime.kernel, {
      planId: "plan-retry-runtime",
      dayId: "plan-day-retry-runtime",
      occurrenceId: "occurrence-retry-runtime",
      targetId: "target-retry-runtime",
      policyId: "policy-retry-runtime",
      name: "Retry Plan",
    });
    let loadCount = 0;
    const flakyOwnedPlans = {
      ...runtime.ownedPlans,
      async loadPlan(planId: string) {
        loadCount += 1;
        const loaded = await runtime.ownedPlans.loadPlan(planId);
        return loadCount === 3 ? null : loaded;
      },
    };
    let id = 0;
    const schedule = createScheduleRuntimePort(
      runtime.kernel,
      flakyOwnedPlans,
      {
        now: () => new Date(Date.UTC(2026, 7, 18, 4)),
        nowMs: () => Date.UTC(2026, 7, 18, 4),
        randomUUID: () => `retry-${++id}`,
        sha256,
      },
    );
    const before = await schedule.loadSchedule("plan-retry-runtime");
    const draft = {
      planId: "plan-retry-runtime",
      scheduleId: null,
      expectedPlanRevision: before!.planRevision,
      expectedScheduleRevision: null,
      expectedActivePair: before!.activeSchedule,
      before: null,
      todayLocalDate: before!.todayLocalDate,
      next: {
        effectiveLocalDate: before!.todayLocalDate,
        mode: "weekday" as const,
        timeZone: "Asia/Singapore",
        bindings: [{
          ordinal: 0,
          weekIndex: 0,
          weekday: "Tuesday" as const,
          planDayId: "plan-day-retry-runtime",
        }],
      },
    };

    await expect(schedule.saveSchedule(draft))
      .rejects.toThrow("schedule_readback_unavailable");
    await expect(schedule.saveSchedule(draft)).resolves.toMatchObject({
      planId: "plan-retry-runtime",
      planRevision: 5,
      scheduleRevision: 1,
      scheduleLifecycle: "active",
    });
    expect(id).toBe(2);
    await expect(runtime.kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedule_versions
       WHERE schedule_id LIKE 'owned-schedule:retry-%'`,
    )).resolves.toEqual([{ count: 1 }]);
    await expect(runtime.kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedule_events
       WHERE event_type = 'schedule_activated'
         AND schedule_id LIKE 'owned-schedule:retry-%'`,
    )).resolves.toEqual([{ count: 1 }]);
  });

  it("keeps Weekday Skip date-only and exposes exact missed copy", async () => {
    const runtime = await setupRuntime();
    runtime.setNow(Date.UTC(2026, 7, 17, 4));
    const beforeBindings = await runtime.kernel.queryAll(
      `SELECT week_index, weekday, plan_day_id
       FROM owned_plan_schedule_bindings
       WHERE schedule_version_id = 'schedule-copy:version:1'
       ORDER BY ordinal`,
    );
    const skipped = await runtime.schedule.actOnToday("skip");
    expect(skipped.scheduleToday.mode).toBe("weekday");
    await expect(runtime.kernel.queryAll(
      `SELECT local_date, outcome
       FROM owned_plan_schedule_opportunities
       WHERE schedule_id = 'schedule-copy'
       ORDER BY local_date`,
    )).resolves.toEqual([{
      local_date: "2026-08-17",
      outcome: "skipped",
    }]);
    await expect(runtime.kernel.queryAll(
      `SELECT week_index, weekday, plan_day_id
       FROM owned_plan_schedule_bindings
       WHERE schedule_version_id = 'schedule-copy:version:1'
       ORDER BY ordinal`,
    )).resolves.toEqual(beforeBindings);

    runtime.setNow(Date.UTC(2026, 7, 25, 4));
    const missed = await runtime.schedule.markWeekdayMissed("2026-08-24");
    expect(missed.scheduleToday.missedLabel).toBe(
      "Planned but not completed",
    );
  });

  it("uses explicit pointer, override, missed, and timezone commands", async () => {
    const runtime = await setupRuntime();
    const before = await runtime.schedule.loadSchedule("plan-copy");
    expect(before.current.mode).toBe("weekday");
    const saved = await runtime.schedule.saveSchedule({
      planId: "plan-copy",
      scheduleId: before.scheduleId,
      expectedPlanRevision: before.planRevision,
      expectedScheduleRevision: before.scheduleRevision,
      expectedActivePair: before.activeSchedule,
      before: before.current,
      todayLocalDate: "2026-08-18",
      next: {
        effectiveLocalDate: "2026-08-18",
        mode: "rotation",
        timeZone: "Asia/Singapore",
        bindings: [
          { ordinal: 0, planDayId: "plan-day-copy" },
          { ordinal: 1, planDayId: "plan-day-copy-b" },
        ],
      },
    });
    expect(saved.current).toMatchObject({
      mode: "rotation",
      rotationPointer: 0,
    });

    const repeated = await runtime.schedule.actOnToday("repeat");
    expect(repeated.view).toMatchObject({
      state: "scheduled",
      dayName: "Full Body A",
      exercises: [{
        exerciseId: "exercise-squat",
        metricProfile: "load_reps",
        nextTarget: "45 kg × 8",
      }],
    });
    const trainedAnyway = await runtime.schedule.recordTrainAnyway({
      workout: {
        kind: "plan_day",
        planDayId: "plan-day-copy-b",
      },
      advanceRotation: false,
    });
    expect(trainedAnyway).toMatchObject({
      mode: "rotation",
      view: {
        state: "scheduled",
        dayName: "Full Body A",
      },
    });
    await expect(runtime.kernel.queryAll<{ payload_json: string }>(
      `SELECT payload_json
       FROM owned_plan_schedule_events
       WHERE event_type = 'train_anyway'
       ORDER BY schedule_revision`,
    )).resolves.toEqual([
      expect.objectContaining({
        payload_json: expect.stringContaining(
          '"rotationAdvanced":false',
        ),
      }),
    ]);
    const skipped = await runtime.schedule.actOnToday("skip");
    expect(skipped.scheduleRevision).toBe(trainedAnyway.scheduleRevision + 1);
    runtime.setNow(Date.UTC(2026, 7, 19, 4));
    await expect(runtime.schedule.loadToday(Date.UTC(2026, 7, 19, 4)))
      .resolves.toMatchObject({
        view: { state: "scheduled", dayName: "Full Body B" },
      });
    const advanced = await runtime.schedule.actOnToday("advance");
    expect(advanced.scheduleRevision).toBe(skipped.scheduleRevision + 1);

    const pending = await runtime.schedule.setDateOverride({
      localDate: "2026-08-20",
      replacement: { kind: "rest_day" },
    });
    expect(pending.dateOverride).toMatchObject({
      state: "pending",
      selection: { kind: "rest_day" },
    });
    const replaced = await runtime.schedule.setDateOverride({
      localDate: "2026-08-20",
      replacement: { kind: "skip" },
      confirmation: "replace_pending_override",
    });
    expect(replaced.dateOverride).toMatchObject({
      revision: 2,
      selection: { kind: "skip" },
    });
    const used = await runtime.schedule.consumeDateOverride("2026-08-20");
    expect(used.dateOverride).toMatchObject({ state: "consumed" });
    await expect(runtime.schedule.setDateOverride({
      localDate: "2026-08-20",
      replacement: { kind: "rest_day" },
      confirmation: "replace_pending_override",
    })).rejects.toThrow("schedule_override_consumed");

    runtime.setNow(Date.UTC(2026, 7, 21, 4));
    const kept = await runtime.schedule.chooseTimeZone(
      KEEP_CURRENT_TIMEZONE_LABEL,
      "America/New_York",
    );
    expect(kept.timeZone).toBe("Asia/Singapore");
    runtime.setNow(Date.UTC(2026, 7, 22, 4));
    const followed = await runtime.schedule.chooseTimeZone(
      FOLLOW_DEVICE_TIMEZONE_LABEL,
      "Europe/London",
    );
    expect(followed.timeZone).toBe("Europe/London");
  });

  it("keeps the start LocalDate across midnight and advances only after committed completion", async () => {
    const runtime = await setupRuntime();
    const before = await runtime.schedule.loadSchedule("plan-copy");
    await runtime.schedule.saveSchedule({
      planId: "plan-copy",
      scheduleId: before.scheduleId,
      expectedPlanRevision: before.planRevision,
      expectedScheduleRevision: before.scheduleRevision,
      expectedActivePair: before.activeSchedule,
      before: before.current,
      todayLocalDate: "2026-08-18",
      next: {
        effectiveLocalDate: "2026-08-18",
        mode: "rotation",
        timeZone: "Asia/Singapore",
        bindings: [
          { ordinal: 0, planDayId: "plan-day-copy" },
          { ordinal: 1, planDayId: "plan-day-copy-b" },
        ],
      },
    });

    const startInstant = Date.UTC(2026, 7, 18, 15, 55);
    runtime.setNow(startInstant);
    const today = await runtime.schedule.loadToday(startInstant);
    const plans = createPlansWorkoutRepository(runtime.kernel);
    const session = await startWorkout({
      repository: plans,
      request: {
        mode: "scheduled",
        planId: today.planId,
        planDayId: today.view.dayId,
        localDate: today.localDate,
        timezone: today.timeZone,
        startedAtMs: startInstant,
      },
    });
    const workout = createWorkoutRepository(runtime.kernel);
    let active = await workout.getActiveWorkout(session.id);
    const set = active.currentExercise.workingSets[0]!;
    const snapshotBefore = JSON.stringify(set.target);
    await runtime.kernel.write((transaction) =>
      transaction.execute(
        `UPDATE plan_working_set_targets
         SET load_grams = 50000,
             target_json = json_set(target_json, '$.loadGrams', 50000),
             revision = revision + 1
         WHERE id = 'working-target-1'`,
      )
    );
    expect(JSON.stringify(
      (await workout.getActiveWorkout(session.id))
        .currentExercise.workingSets[0]!.target,
    )).toBe(snapshotBefore);

    const completion = await completeSet({
      repository: workout,
      haptics: { committed: jest.fn(async () => undefined) },
      invalidate: jest.fn(async () => undefined),
      drainEffects: jest.fn(async () => undefined),
      input: {
        sessionId: session.id,
        setId: set.id,
        expectedSessionRevision: active.revision,
        expectedSetRevision: set.revision,
        completionIdempotencyKey: "complete-midnight",
        metricIdentity: set.metricIdentity,
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 40_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: startInstant + 300_000,
      },
    });
    active = completion.view;
    const endedAtMs = Date.UTC(2026, 7, 18, 16, 10);
    const finished = await finishCompleted({
      repository: createWorkoutOutcomeRepository(runtime.kernel),
      input: {
        sessionId: session.id,
        expectedSessionRevision: active.revision,
        endedAtMs,
      },
    });
    expect(finished.detail.localDate).toBe("2026-08-18");
    expect(finished.detail.timezone).toBe("Asia/Singapore");

    const completedSchedule = await runtime.schedule.completeScheduledSession(
      session.id,
    );
    expect(completedSchedule.scheduleRevision).toBeGreaterThan(
      today.scheduleRevision,
    );
    runtime.setNow(Date.UTC(2026, 7, 19, 4));
    await expect(runtime.schedule.loadToday(Date.UTC(2026, 7, 19, 4)))
      .resolves.toMatchObject({
        view: { state: "scheduled", dayName: "Full Body B" },
      });
  });

  it("retains all six accepted starters and exact D-55 five-day behavior", async () => {
    const pack = await parseAcceptedStarterPlanPack({
      starterPackBytes: readFileSync(
        join(repositoryRoot, "assets/content/starter-plans.v2.json"),
        "utf8",
      ),
      acceptanceBytes: readFileSync(
        join(
          repositoryRoot,
          "artifacts/review/phase2/starter-plans-acceptance.json",
        ),
        "utf8",
      ),
      sha256,
    });
    expect(pack.templates).toHaveLength(6);
    const bodyPart = pack.templates.find(
      ({ id }) => id === "gym-body-part-split",
    )!;
    expect(bodyPart.days.map(({ displayName }) => displayName)).toEqual([
      "Chest",
      "Back",
      "Shoulders",
      "Legs",
      "Arms",
    ]);
    expect(bodyPart.scheduleSuggestion).toEqual({
      mode: "weekday",
      cycleWeeks: [[
        { weekday: "Monday", dayId: "body-part-chest" },
        { weekday: "Tuesday", dayId: "body-part-back" },
        { weekday: "Wednesday", dayId: "body-part-shoulders" },
        { weekday: "Thursday", dayId: "body-part-legs" },
        { weekday: "Friday", dayId: "body-part-arms" },
      ]],
    });
    expect(bodyPart.days.every(({ exercises }) =>
      exercises.length === 4
      && exercises.every(({ metricIdentity }) =>
        metricIdentity.profile === "load_reps"
      )
    )).toBe(true);
  });
});
