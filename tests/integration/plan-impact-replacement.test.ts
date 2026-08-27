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
  previewDayRemoval,
  previewExerciseReplacement,
  removePlanDayWithImpact,
  replacePlanExercise,
} from "../../src/domains/plans/planImpactCommands";
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
  ownedPlansMigration,
} from "../../src/platform/sqlite/migrations/0009_owned_plans";
import {
  ownedRecommendationsMigration,
} from "../../src/platform/sqlite/migrations/0010_owned_recommendations";
import {
  scheduleActivationMigration,
} from "../../src/platform/sqlite/migrations/0008_schedule_activation";
import {
  createOwnedPlanRepository,
} from "../../src/platform/sqlite/repositories/ownedPlanRepository";
import {
  type ApplyDayRemovalRepositoryInput,
  type ApplyExerciseReplacementRepositoryInput,
  createPlanImpactRepository,
  PlanImpactRepositoryError,
  type PlanImpactRepositoryTestObserver,
  type PlanImpactRepositoryTestStage,
} from "../../src/platform/sqlite/repositories/planImpactRepository";
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
const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();
const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function setupRuntime(
  options: Readonly<{
    failCommit?: boolean;
    powerBindingOrdinal?: number;
    removedBindingOrdinal?: number;
    rotationPointer?: number;
    scheduleMode?: "weekday" | "rotation";
    seedRemovedBinding?: boolean;
    seedPowerBinding?: boolean;
    seedPrimaryPolicy?: boolean;
    seedSecondOccurrence?: boolean;
    beforeRepositoryWrite?: Readonly<{
      stage: PlanImpactRepositoryTestStage;
      run(
        transaction: Parameters<
          NonNullable<PlanImpactRepositoryTestObserver["beforeWrite"]>
        >[1],
      ): Promise<void>;
    }>;
  }> = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "gym-plan-impact-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(databasePath);
  fixture.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v6-metric-profiles.sql",
    ),
    "utf8",
  ));
  fixture.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  let rejectCommit = false;
  const kernel = createSqliteKernel(
    { reader, writer },
    {
      beforeCommit: async () => {
        if (rejectCommit) {
          throw new Error("injected_plan_impact_commit_failure");
        }
      },
    },
  );
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: [
      scheduleActivationMigration,
      ownedPlansMigration,
      ownedRecommendationsMigration,
    ],
  }).run();
  const scheduleMode = options.scheduleMode ?? "weekday";
  const removedBindingOrdinal = options.removedBindingOrdinal ?? 0;
  const powerBindingOrdinal = options.powerBindingOrdinal ?? 1;
  const rotationPointer = scheduleMode === "rotation"
    ? options.rotationPointer ?? 0
    : null;
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
       SET is_active = 0
       WHERE id = 'plan-copy'`,
    );
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES (
         'retained-plan', NULL, 'custom', NULL, NULL,
         'Retained Active Plan', 2, 'Owner', 'Strength', 30,
         'Owner-created', 1, 4
       )`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_aggregate_states
        (plan_id, lifecycle, graph_status, missing_requirement_code,
         missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
       VALUES (
         'retained-plan', 'ready', 'valid', NULL, NULL, 100, 100, NULL
       )`,
    );
    await transaction.execute(
      `INSERT INTO plan_days
        (id, plan_id, ordinal, name, revision)
       VALUES ('retained-day', 'retained-plan', 0, 'Full Body', 2)`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_day_exercises
        (id, plan_day_id, exercise_id, ordinal,
         between_exercise_rest_seconds, metric_profile,
         metric_contract_version, exercise_metric_generation, revision)
       VALUES (
         'retained-occurrence', 'retained-day', 'exercise-squat', 0, 90,
         'load_reps', 1, 1, 2
       )`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_working_set_targets
        (id, plan_day_exercise_id, ordinal, target_json, unit_json,
         metric_profile, metric_contract_version,
         exercise_metric_generation, revision)
       VALUES (
         'retained-target', 'retained-occurrence', 0,
         '{"profile":"load_reps","version":1,"loadGrams":20000,"minReps":8,"maxReps":12,"incrementGrams":2500,"perSide":false}',
         '{"version":1,"load":"grams","count":"repetitions"}',
         'load_reps', 1, 1, 2
       )`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_warmup_sets
        (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
       VALUES (
         'retained-warmup', 'retained-occurrence', 0, 10000, 5, 2
       )`,
    );
    if (options.seedPrimaryPolicy !== false) {
      await transaction.execute(
        `INSERT INTO owned_plan_progression_policies
          (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
           rule_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, revision)
         VALUES (
           'retained-policy', 'retained-occurrence', 'manual_hold',
           'manual-hold-v1', 1,
           '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
           'load_reps', 1, 1, 'active', 2
         )`,
      );
    }
    await transaction.execute(
      `INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms,
         deactivated_at_ms)
       VALUES (
         'retained-schedule', 'retained-plan', 'active', 3, 100, NULL
       )`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_versions
        (id, schedule_id, version_number, effective_local_date, mode,
         timezone, rotation_pointer, created_at_ms)
       VALUES (
         'retained-schedule:version:1', 'retained-schedule', 1,
         '2026-08-18', ?, 'Asia/Singapore', ?, 100
       )`,
      [scheduleMode, rotationPointer],
    );
    if (options.seedRemovedBinding !== false) {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_bindings
          (id, schedule_version_id, mode, ordinal, week_index, weekday,
           plan_day_id)
         VALUES (
           'retained-binding', 'retained-schedule:version:1', ?, ?,
           ?, ?, 'retained-day'
         )`,
        [
          scheduleMode,
          removedBindingOrdinal,
          scheduleMode === "weekday" ? 0 : null,
          scheduleMode === "weekday" ? "Monday" : null,
        ],
      );
    }
    await transaction.execute(
      `INSERT INTO plan_days
        (id, plan_id, ordinal, name, revision)
       VALUES ('retained-power-day', 'retained-plan', 1, 'Power Day', 5)`,
    );
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id,
         name, metric_profile, metric_contract_version,
         exercise_metric_generation, equipment, default_rest_seconds,
         revision)
       VALUES (
         'exercise-incline', NULL, 'custom', NULL, NULL, 'Incline Press',
         'load_reps', 1, 1, 'Barbell', 90, 5
       )`,
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version,
         exercise_metric_generation, availability, revision)
       VALUES (
         'exercise-incline', 'custom', 'Incline Press', 'strength',
         'compound', 'load_reps', 1, 1, 'available', 5
       )`,
    );
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id,
         name, metric_profile, metric_contract_version,
         exercise_metric_generation, equipment, default_rest_seconds,
         revision)
       VALUES (
         'exercise-bodyweight', NULL, 'custom', NULL, NULL,
         'Bodyweight Push-Up', 'bodyweight_reps', 1, 1,
         'Bodyweight', 60, 3
       )`,
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version,
         exercise_metric_generation, availability, revision)
       VALUES (
         'exercise-bodyweight', 'custom', 'Bodyweight Push-Up', 'strength',
         'compound', 'bodyweight_reps', 1, 1, 'available', 3
       )`,
    );
    if (options.seedSecondOccurrence !== false) {
      await transaction.execute(
        `INSERT INTO owned_plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES (
           'retained-occurrence-b', 'retained-power-day', 'exercise-squat',
           0, 120, 'load_reps', 1, 1, 4
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (
           'retained-target-b', 'retained-occurrence-b', 0,
           '{"profile":"load_reps","version":1,"loadGrams":25000,"minReps":6,"maxReps":10,"incrementGrams":2500,"perSide":false}',
           '{"version":1,"load":"grams","count":"repetitions"}',
           'load_reps', 1, 1, 6
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_progression_policies
          (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
           rule_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, revision)
         VALUES (
           'retained-policy-b', 'retained-occurrence-b', 'manual_hold',
           'manual-hold-v1', 1,
           '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
           'load_reps', 1, 1, 'active', 7
         )`,
      );
    }
    if (options.seedPowerBinding !== false) {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_bindings
          (id, schedule_version_id, mode, ordinal, week_index, weekday,
           plan_day_id)
         VALUES (
           'retained-power-binding', 'retained-schedule:version:1',
           ?, ?, ?, ?, 'retained-power-day'
         )`,
        [
          scheduleMode,
          powerBindingOrdinal,
          scheduleMode === "weekday" ? 0 : null,
          scheduleMode === "weekday" ? "Wednesday" : null,
        ],
      );
    }
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_overrides
        (id, schedule_id, local_date, selection_kind, plan_day_id, state,
         revision, consumed_opportunity_id, created_at_ms, consumed_at_ms)
       VALUES (
         'retained-override', 'retained-schedule', '2026-08-24',
         'plan_day', 'retained-day', 'pending', 3, NULL, 200, NULL
       )`,
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_opportunities
        (id, schedule_id, schedule_version_id, local_date, source,
         plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
       VALUES (
         'retained-opportunity', 'retained-schedule',
         'retained-schedule:version:1', '2026-08-18', 'weekday',
         'retained-day', 'consumed', 'skipped', NULL, 2, 300
       )`,
    );
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, active_session_exercise_id,
         active_set_id, revision)
       VALUES (
         'retained-completed-session', 'retained-plan', 'retained-day',
         'scheduled_day', 'completed', '2026-08-17', 'Asia/Singapore',
         10, 20, NULL, NULL, 2
       )`,
    );
  });
  rejectCommit = options.failCommit ?? false;
  let observerRan = false;
  return {
    databasePath,
    kernel,
    ownedPlans: createOwnedPlanRepository(kernel),
    repository: createPlanImpactRepository(kernel, {
      beforeWrite: async (stage, transaction) => {
        if (
          observerRan
          || options.beforeRepositoryWrite === undefined
          || options.beforeRepositoryWrite.stage !== stage
        ) {
          return;
        }
        observerRan = true;
        await options.beforeRepositoryWrite.run(transaction);
      },
    }),
  };
}

async function immutableRows(kernel: SqliteKernel) {
  const sessions = await kernel.queryAll(
    "SELECT * FROM workout_sessions ORDER BY id",
  );
  const opportunities = await kernel.queryAll(
    "SELECT * FROM owned_plan_schedule_opportunities ORDER BY id",
  );
  const oldVersions = await kernel.queryAll(
    `SELECT version.*, binding.id AS binding_id,
            binding.plan_day_id, binding.ordinal AS binding_ordinal
     FROM owned_plan_schedule_versions version
     JOIN owned_plan_schedule_bindings binding
       ON binding.schedule_version_id = version.id
     WHERE version.id = 'retained-schedule:version:1'
     ORDER BY binding.ordinal`,
  );
  const sessionExercises = await kernel.queryAll(
    "SELECT * FROM session_exercises ORDER BY id",
  );
  const sessionSets = await kernel.queryAll(
    "SELECT * FROM session_sets ORDER BY id",
  );
  return {
    sessions: JSON.stringify(sessions),
    sessionExercises: JSON.stringify(sessionExercises),
    sessionSets: JSON.stringify(sessionSets),
    opportunities: JSON.stringify(opportunities),
    oldVersions: JSON.stringify(oldVersions),
  };
}

async function replacementRepositoryInput(
  runtime: Awaited<ReturnType<typeof setupRuntime>>,
  changes: Partial<ApplyExerciseReplacementRepositoryInput> = {},
): Promise<ApplyExerciseReplacementRepositoryInput> {
  const preview = await runtime.repository.readExerciseReplacement({
    planId: "retained-plan",
    occurrenceId: "retained-occurrence",
  });
  if (preview === null) {
    throw new Error("replacement_preview_missing");
  }
  return {
    requestId: "repository-replace",
    requestSha256: "a".repeat(64),
    planId: preview.planId,
    sourceOccurrenceId: preview.sourceOccurrenceId,
    sourceExerciseId: preview.sourceExerciseId,
    expectedPlanRevision: preview.planRevision,
    expectedPreview: preview,
    scope: "this_occurrence",
    replacementExerciseId: "exercise-incline",
    occurrences: [preview.occurrences[0]!],
    committedAtMs: 500,
    ...changes,
  };
}

async function dayRemovalRepositoryInput(
  runtime: Awaited<ReturnType<typeof setupRuntime>>,
  changes: Partial<ApplyDayRemovalRepositoryInput> = {},
): Promise<ApplyDayRemovalRepositoryInput> {
  const preview = await runtime.repository.readDayRemoval({
    planId: "retained-plan",
    dayId: "retained-day",
  });
  if (preview === null || preview.schedule === null) {
    throw new Error("day_removal_preview_missing");
  }
  return {
    requestId: "repository-remove",
    requestSha256: "b".repeat(64),
    planId: preview.planId,
    dayId: preview.dayId,
    expectedPlanRevision: preview.planRevision,
    expectedScheduleRevision: preview.schedule.revision,
    expectedPreview: preview,
    effectiveLocalDate: "2026-08-19",
    choice: { kind: "remove_binding" },
    committedAtMs: 500,
    ...changes,
  };
}

describe("plan impact day removal", () => {
  it("returns null for missing, bundled, one-day, and absent current days", async () => {
    const runtime = await setupRuntime();
    await expect(runtime.repository.readDayRemoval({
      planId: "missing-plan",
      dayId: "missing-day",
    })).resolves.toBeNull();
    await expect(runtime.repository.readDayRemoval({
      planId: "plan-bundled",
      dayId: "missing-day",
    })).resolves.toBeNull();
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE plans
         SET days_per_week = 1
         WHERE id = 'retained-plan'`,
      );
    });
    await expect(runtime.repository.readDayRemoval({
      planId: "retained-plan",
      dayId: "retained-day",
    })).resolves.toBeNull();
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE plans
         SET days_per_week = 2
         WHERE id = 'retained-plan'`,
      );
    });
    await expect(runtime.repository.readDayRemoval({
      planId: "retained-plan",
      dayId: "missing-day",
    })).resolves.toBeNull();
  });

  it("reads owned day impact without a schedule version", async () => {
    const runtime = await setupRuntime();
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (
           'unscheduled-plan', NULL, 'custom', NULL, NULL, 'Unscheduled',
           2, 'Owner', 'Strength', 20, 'Owner-created', 0, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_aggregate_states
          (plan_id, lifecycle, graph_status, missing_requirement_code,
           missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
         VALUES (
           'unscheduled-plan', 'draft', 'missing_valid_target',
           'owned_plan_missing_valid_target',
           'Add at least one exercise with valid targets before scheduling or activating.',
           1, 1, NULL
         )`,
      );
      await transaction.execute(
        `INSERT INTO plan_days
          (id, plan_id, ordinal, name, revision)
         VALUES
          ('unscheduled-a', 'unscheduled-plan', 0, 'A', 1),
          ('unscheduled-b', 'unscheduled-plan', 1, 'B', 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms,
           deactivated_at_ms)
         VALUES (
           'unscheduled-schedule', 'unscheduled-plan', 'inactive', 1, 1, 1
         )`,
      );
    });

    await expect(runtime.repository.readDayRemoval({
      planId: "unscheduled-plan",
      dayId: "unscheduled-a",
    })).resolves.toMatchObject({
      schedule: null,
      affectedOverrides: [],
      replacementDays: [{ id: "unscheduled-b" }],
    });
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (
           'no-schedule-plan', NULL, 'custom', NULL, NULL, 'No Schedule',
           2, 'Owner', 'Strength', 20, 'Owner-created', 0, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_aggregate_states
          (plan_id, lifecycle, graph_status, missing_requirement_code,
           missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
         VALUES (
           'no-schedule-plan', 'draft', 'missing_valid_target',
           'owned_plan_missing_valid_target',
           'Add at least one exercise with valid targets before scheduling or activating.',
           1, 1, NULL
         )`,
      );
      await transaction.execute(
        `INSERT INTO plan_days
          (id, plan_id, ordinal, name, revision)
         VALUES
          ('no-schedule-a', 'no-schedule-plan', 0, 'A', 1),
          ('no-schedule-b', 'no-schedule-plan', 1, 'B', 1)`,
      );
    });
    const noSchedulePreview = await runtime.repository.readDayRemoval({
      planId: "no-schedule-plan",
      dayId: "no-schedule-a",
    });
    expect(noSchedulePreview).toMatchObject({
      schedule: null,
      affectedOverrides: [],
    });
    await expect(runtime.repository.applyDayRemoval({
      requestId: "remove-no-schedule",
      requestSha256: "d".repeat(64),
      planId: "no-schedule-plan",
      dayId: "no-schedule-a",
      expectedPlanRevision: 1,
      expectedScheduleRevision: 1,
      expectedPreview: noSchedulePreview!,
      effectiveLocalDate: "2026-08-19",
      choice: { kind: "remove_binding" },
      committedAtMs: 10,
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });
  });

  it("blocks active workouts and rejects stale repository previews", async () => {
    const runtime = await setupRuntime();
    const input = await dayRemovalRepositoryInput(runtime);
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES (
           'impact-active-session', 'retained-plan', 'retained-day',
           'scheduled_day', 'in_progress', '2026-08-18',
           'Asia/Singapore', 400, NULL, NULL, NULL, 1
         )`,
      );
    });
    const activeInput = await dayRemovalRepositoryInput(runtime);
    await expect(runtime.repository.applyDayRemoval(activeInput))
      .rejects.toMatchObject({ code: "plan_impact_workout_active" });
    await expect(runtime.repository.applyDayRemoval({
      ...input,
      expectedPreview: {
        ...input.expectedPreview,
        planRevision: 99,
      },
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });
    await expect(runtime.repository.applyDayRemoval({
      ...input,
      expectedScheduleRevision: 99,
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });
    const invalidReplacement = await setupRuntime();
    const invalidReplacementInput = await dayRemovalRepositoryInput(
      invalidReplacement,
    );
    await expect(invalidReplacement.repository.applyDayRemoval({
      ...invalidReplacementInput,
      choice: {
        kind: "replacement_day",
        replacementDayId: "missing-day",
      },
    })).rejects.toMatchObject({
      code: "plan_impact_replacement_invalid",
    });
  });

  it("replaces bindings/overrides and leaves earlier effective-date overrides unchanged", async () => {
    const replacement = await setupRuntime();
    const replacementInput = await dayRemovalRepositoryInput(replacement, {
      choice: {
        kind: "replacement_day",
        replacementDayId: "retained-power-day",
      },
    });
    await replacement.repository.applyDayRemoval(replacementInput);
    await expect(replacement.kernel.queryAll(
      `SELECT selection_kind, plan_day_id, revision
       FROM owned_plan_schedule_overrides
       WHERE id = 'retained-override'`,
    )).resolves.toEqual([{
      selection_kind: "plan_day",
      plan_day_id: "retained-power-day",
      revision: 4,
    }]);

    const effective = await setupRuntime();
    const effectiveInput = await dayRemovalRepositoryInput(effective, {
      effectiveLocalDate: "2026-08-25",
      choice: { kind: "effective_date" },
    });
    await effective.repository.applyDayRemoval(effectiveInput);
    await expect(effective.kernel.queryAll(
      `SELECT selection_kind, plan_day_id, revision
       FROM owned_plan_schedule_overrides
       WHERE id = 'retained-override'`,
    )).resolves.toEqual([{
      selection_kind: "plan_day",
      plan_day_id: "retained-day",
      revision: 3,
    }]);
  });

  const rotationCases: [
    number,
    "replacement_day" | "remove_binding",
    number,
  ][] = [
    [0, "replacement_day", 0],
    [0, "remove_binding", 0],
    [1, "remove_binding", 0],
  ];

  it.each(rotationCases)(
    "keeps rotation pointer valid from %i with %s",
    async (pointer, choiceKind, expectedPointer) => {
      const runtime = await setupRuntime({
        rotationPointer: pointer,
        scheduleMode: "rotation",
      });
      const input = await dayRemovalRepositoryInput(runtime, {
        choice: choiceKind === "replacement_day"
          ? {
              kind: "replacement_day",
              replacementDayId: "retained-power-day",
            }
          : { kind: "remove_binding" },
      });
      await runtime.repository.applyDayRemoval(input);
      await expect(runtime.kernel.queryAll(
        `SELECT rotation_pointer
         FROM owned_plan_schedule_versions
         WHERE schedule_id = 'retained-schedule'
         ORDER BY version_number DESC
         LIMIT 1`,
      )).resolves.toEqual([{ rotation_pointer: expectedPointer }]);
    },
  );

  it("handles empty, unbound, and before-current rotation pointer states", async () => {
    const empty = await setupRuntime({
      scheduleMode: "rotation",
      seedPowerBinding: false,
    });
    const emptyInput = await dayRemovalRepositoryInput(empty);
    await empty.repository.applyDayRemoval(emptyInput);
    await expect(empty.kernel.queryAll(
      `SELECT rotation_pointer
       FROM owned_plan_schedule_versions
       WHERE schedule_id = 'retained-schedule'
       ORDER BY version_number DESC
       LIMIT 1`,
    )).resolves.toEqual([{ rotation_pointer: 0 }]);

    const unbound = await setupRuntime({
      rotationPointer: 0,
      scheduleMode: "rotation",
      seedRemovedBinding: false,
    });
    const unboundInput = await dayRemovalRepositoryInput(unbound);
    await unbound.repository.applyDayRemoval(unboundInput);
    await expect(unbound.kernel.queryAll(
      `SELECT rotation_pointer
       FROM owned_plan_schedule_versions
       WHERE schedule_id = 'retained-schedule'
       ORDER BY version_number DESC
       LIMIT 1`,
    )).resolves.toEqual([{ rotation_pointer: 0 }]);

    const beforeCurrent = await setupRuntime({
      powerBindingOrdinal: 0,
      removedBindingOrdinal: 1,
      rotationPointer: 0,
      scheduleMode: "rotation",
    });
    const beforeInput = await dayRemovalRepositoryInput(beforeCurrent);
    await beforeCurrent.repository.applyDayRemoval(beforeInput);
    await expect(beforeCurrent.kernel.queryAll(
      `SELECT rotation_pointer
       FROM owned_plan_schedule_versions
       WHERE schedule_id = 'retained-schedule'
       ORDER BY version_number DESC
       LIMIT 1`,
    )).resolves.toEqual([{ rotation_pointer: 0 }]);
  });

  const dayRaceCases: [
    PlanImpactRepositoryTestStage,
    (
      transaction: Parameters<
        NonNullable<PlanImpactRepositoryTestObserver["beforeWrite"]>
      >[1],
    ) => Promise<void>,
  ][] = [
    [
      "before_day_override_update",
      async (transaction: Parameters<
        NonNullable<PlanImpactRepositoryTestObserver["beforeWrite"]>
      >[1]) => {
        await transaction.execute(
          `UPDATE owned_plan_schedule_overrides
           SET revision = revision + 1
           WHERE id = 'retained-override'`,
        );
      },
    ],
    [
      "before_day_retire",
      async (transaction: Parameters<
        NonNullable<PlanImpactRepositoryTestObserver["beforeWrite"]>
      >[1]) => {
        await transaction.execute(
          `UPDATE plan_days
           SET revision = revision + 1
           WHERE id = 'retained-day'`,
        );
      },
    ],
    [
      "before_day_aggregate_update",
      async (transaction: Parameters<
        NonNullable<PlanImpactRepositoryTestObserver["beforeWrite"]>
      >[1]) => {
        await transaction.execute(
          `UPDATE plans
           SET revision = revision + 1
           WHERE id = 'retained-plan'`,
        );
      },
    ],
  ];

  it.each(dayRaceCases)(
    "rejects a concurrent %s race and rolls back",
    async (stage, run) => {
      const runtime = await setupRuntime({
        beforeRepositoryWrite: { stage, run },
      });
      const input = await dayRemovalRepositoryInput(runtime);
      await expect(runtime.repository.applyDayRemoval(input)).rejects
        .toMatchObject({ code: "plan_impact_preview_stale" });
      await expect(runtime.kernel.queryAll(
        `SELECT revision FROM plans WHERE id = 'retained-plan'`,
      )).resolves.toEqual([{ revision: 4 }]);
      await expect(runtime.kernel.queryAll(
        `SELECT COUNT(*) AS count
         FROM owned_plan_schedule_versions
         WHERE schedule_id = 'retained-schedule'`,
      )).resolves.toEqual([{ count: 1 }]);
    },
  );

  it("records draft state when the retained day has the only valid target", async () => {
    const runtime = await setupRuntime({ seedSecondOccurrence: false });
    const input = await dayRemovalRepositoryInput(runtime);
    await runtime.repository.applyDayRemoval(input);
    await expect(runtime.kernel.queryAll(
      `SELECT lifecycle, graph_status, missing_requirement
       FROM owned_plan_aggregate_states
       WHERE plan_id = 'retained-plan'`,
    )).resolves.toEqual([{
      lifecycle: "draft",
      graph_status: "missing_valid_target",
      missing_requirement:
        "Add at least one exercise with valid targets before scheduling or activating.",
    }]);
  });

  it("rejects changed and corrupt durable day-removal receipts", async () => {
    const runtime = await setupRuntime();
    const input = await dayRemovalRepositoryInput(runtime);
    await runtime.repository.applyDayRemoval(input);
    await expect(runtime.repository.applyDayRemoval(input)).resolves
      .toMatchObject({ outcome: "already_committed" });
    await expect(runtime.repository.readCommandResult({
      requestId: input.requestId,
      requestSha256: "c".repeat(64),
    })).rejects.toMatchObject({
      code: "plan_impact_idempotency_conflict",
    });

    const corrupt = await setupRuntime();
    await corrupt.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_events
          (id, schedule_id, event_type, local_date, payload_json,
           schedule_revision, created_at_ms)
         VALUES (
           'plan-impact-command:corrupt', 'retained-schedule',
           'plan_day_removed', NULL, '{}', 3, 1
         )`,
      );
    });
    await expect(corrupt.repository.readCommandResult({
      requestId: "corrupt",
      requestSha256: "a".repeat(64),
    })).rejects.toThrow("plan_impact_receipt_invalid");
  });

  it("previews every binding/date and commits plan plus prospective schedule atomically", async () => {
    const runtime = await setupRuntime();
    const before = await immutableRows(runtime.kernel);
    const invalidations: string[][] = [];
    const preview = await previewDayRemoval({
      repository: runtime.repository,
      sha256,
      nowMs: () => Date.parse("2026-08-19T01:00:00+08:00"),
      input: {
        planId: "retained-plan",
        dayId: "retained-day",
      },
    });

    expect(preview).toMatchObject({
      planRevision: 4,
      dayRevision: 2,
      currentWorkoutUnaffected: false,
      restructuringBlocked: false,
      schedule: {
        id: "retained-schedule",
        revision: 3,
        versionId: "retained-schedule:version:1",
      },
      affectedBindings: [{
        id: "retained-binding",
        label: "Week 1 · Monday",
      }],
      affectedDates: [{
        id: "retained-override",
        localDate: "2026-08-24",
        revision: 3,
      }],
      replacementDays: [{
        id: "retained-power-day",
        name: "Power Day",
        revision: 5,
      }],
      earliestEffectiveLocalDate: "2026-08-19",
    });
    expect(preview.previewToken).toMatch(/^plan-impact-v1:[a-f0-9]{64}$/u);

    const result = await removePlanDayWithImpact({
      repository: runtime.repository,
      sha256,
      invalidate: async (keys) => {
        invalidations.push([...keys]);
      },
      nowMs: () => 500,
      input: {
        requestId: "remove-retained-day",
        planId: "retained-plan",
        dayId: "retained-day",
        expectedPlanRevision: 4,
        expectedScheduleRevision: 3,
        previewToken: preview.previewToken,
        choice: { kind: "remove_binding" },
      },
    });

    expect(result).toEqual({
      outcome: "committed",
      planId: "retained-plan",
      planRevision: 5,
      scheduleRevision: 4,
      currentWorkoutUnaffected: false,
      invalidations: [
        "library:plans",
        "plan:retained-plan",
        "schedule:retained-schedule",
        "today",
      ],
    });
    expect(invalidations).toEqual([result.invalidations]);
    await expect(removePlanDayWithImpact({
      repository: runtime.repository,
      sha256,
      invalidate: async (keys) => {
        invalidations.push([...keys]);
      },
      nowMs: () => 9_999,
      input: {
        requestId: "remove-retained-day",
        planId: "retained-plan",
        dayId: "retained-day",
        expectedPlanRevision: 4,
        expectedScheduleRevision: 3,
        previewToken: preview.previewToken,
        choice: { kind: "remove_binding" },
      },
    })).resolves.toEqual({
      ...result,
      outcome: "already_committed",
    });
    expect(invalidations).toEqual([result.invalidations]);
    await expect(runtime.ownedPlans.read("retained-plan")).resolves
      .toMatchObject({
        revision: 5,
        days: [{
          id: "retained-power-day",
          name: "Power Day",
          ordinal: 0,
        }],
      });
    await expect(runtime.kernel.queryAll(
      `SELECT id, ordinal FROM plan_days
       WHERE plan_id = 'retained-plan'
       ORDER BY ordinal`,
    )).resolves.toEqual([
      { id: "retained-power-day", ordinal: 0 },
      { id: "retained-day", ordinal: 1_000_000 },
    ]);
    await expect(runtime.kernel.queryAll(
      `SELECT version.version_number, version.effective_local_date,
              binding.plan_day_id, binding.weekday
       FROM owned_plan_schedule_versions version
       LEFT JOIN owned_plan_schedule_bindings binding
         ON binding.schedule_version_id = version.id
       WHERE version.schedule_id = 'retained-schedule'
       ORDER BY version.version_number, binding.ordinal`,
    )).resolves.toEqual([
      {
        version_number: 1,
        effective_local_date: "2026-08-18",
        plan_day_id: "retained-day",
        weekday: "Monday",
      },
      {
        version_number: 1,
        effective_local_date: "2026-08-18",
        plan_day_id: "retained-power-day",
        weekday: "Wednesday",
      },
      {
        version_number: 2,
        effective_local_date: "2026-08-19",
        plan_day_id: "retained-power-day",
        weekday: "Wednesday",
      },
    ]);
    await expect(runtime.kernel.queryAll(
      `SELECT selection_kind, plan_day_id, revision
       FROM owned_plan_schedule_overrides
       WHERE id = 'retained-override'`,
    )).resolves.toEqual([{
      selection_kind: "rest_day",
      plan_day_id: null,
      revision: 4,
    }]);
    expect(await immutableRows(runtime.kernel)).toEqual(before);
  });

  it("rejects a stale preview and rolls both aggregates back on commit failure", async () => {
    const staleRuntime = await setupRuntime();
    const stalePreview = await previewDayRemoval({
      repository: staleRuntime.repository,
      sha256,
      nowMs: () => Date.parse("2026-08-19T01:00:00+08:00"),
      input: {
        planId: "retained-plan",
        dayId: "retained-day",
      },
    });
    await staleRuntime.kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE plan_days
         SET revision = revision + 1
         WHERE id = 'retained-power-day'`,
      );
    });
    await expect(removePlanDayWithImpact({
      repository: staleRuntime.repository,
      sha256,
      invalidate: async () => undefined,
      nowMs: () => 600,
      input: {
        requestId: "remove-stale-day",
        planId: "retained-plan",
        dayId: "retained-day",
        expectedPlanRevision: 4,
        expectedScheduleRevision: 3,
        previewToken: stalePreview.previewToken,
        choice: {
          kind: "replacement_day",
          replacementDayId: "retained-power-day",
        },
      },
    })).rejects.toMatchObject({
      code: "plan_impact_preview_stale",
    });

    const failedRuntime = await setupRuntime({ failCommit: true });
    const before = await immutableRows(failedRuntime.kernel);
    const preview = await previewDayRemoval({
      repository: failedRuntime.repository,
      sha256,
      nowMs: () => Date.parse("2026-08-19T01:00:00+08:00"),
      input: {
        planId: "retained-plan",
        dayId: "retained-day",
      },
    });
    await expect(removePlanDayWithImpact({
      repository: failedRuntime.repository,
      sha256,
      invalidate: async () => undefined,
      nowMs: () => 700,
      input: {
        requestId: "remove-failed-day",
        planId: "retained-plan",
        dayId: "retained-day",
        expectedPlanRevision: 4,
        expectedScheduleRevision: 3,
        previewToken: preview.previewToken,
        choice: { kind: "remove_binding" },
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    const inspection = new DatabaseSync(failedRuntime.databasePath);
    expect(inspection.prepare(
      "SELECT days_per_week, revision FROM plans WHERE id = 'retained-plan'",
    ).get()).toEqual({ days_per_week: 2, revision: 4 });
    expect(inspection.prepare(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedule_versions
       WHERE schedule_id = 'retained-schedule'`,
    ).get()).toEqual({ count: 1 });
    inspection.close();
    expect(await immutableRows(failedRuntime.kernel)).toEqual(before);
  });
});

describe("plan impact exercise replacement", () => {
  it("returns null for missing/bundled/currently absent sources and handles one occurrence", async () => {
    const runtime = await setupRuntime({ seedSecondOccurrence: false });
    await expect(runtime.repository.readExerciseReplacement({
      planId: "missing-plan",
      occurrenceId: "missing-occurrence",
    })).resolves.toBeNull();
    await expect(runtime.repository.readExerciseReplacement({
      planId: "plan-bundled",
      occurrenceId: "missing-occurrence",
    })).resolves.toBeNull();
    await expect(runtime.repository.readExerciseReplacement({
      planId: "retained-plan",
      occurrenceId: "missing-occurrence",
    })).resolves.toBeNull();

    const preview = await runtime.repository.readExerciseReplacement({
      planId: "retained-plan",
      occurrenceId: "retained-occurrence",
    });
    expect(preview?.occurrences).toHaveLength(1);
    expect(preview?.occurrences[0]?.warmups).toEqual([
      expect.objectContaining({
        id: "retained-warmup",
        loadGrams: 10_000,
        reps: 5,
      }),
    ]);
  });

  it("rejects corrupt replacement JSON and missing policy rows", async () => {
    const invalidJson = await setupRuntime();
    await invalidJson.kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE owned_plan_working_set_targets
         SET target_json = '[]'
         WHERE id = 'retained-target'`,
      );
    });
    await expect(invalidJson.repository.readExerciseReplacement({
      planId: "retained-plan",
      occurrenceId: "retained-occurrence",
    })).rejects.toThrow("plan_impact_json_invalid");

    const missingPolicy = await setupRuntime({ seedPrimaryPolicy: false });
    await expect(missingPolicy.repository.readExerciseReplacement({
      planId: "retained-plan",
      occurrenceId: "retained-occurrence",
    })).rejects.toThrow("plan_impact_policy_missing");
  });

  it("reconstructs exact committed replacement only for complete matching facts", async () => {
    const runtime = await setupRuntime();
    const input = await replacementRepositoryInput(runtime);
    await expect(runtime.repository.readCommittedExerciseReplacement({
      planId: input.planId,
      expectedPlanRevision: input.expectedPlanRevision,
      replacementExerciseId: input.replacementExerciseId,
      occurrences: input.occurrences,
    })).resolves.toBeNull();

    const committed = await runtime.repository.applyExerciseReplacement(input);
    expect(committed.outcome).toBe("committed");
    await expect(runtime.repository.readCommittedExerciseReplacement({
      planId: input.planId,
      expectedPlanRevision: input.expectedPlanRevision,
      replacementExerciseId: input.replacementExerciseId,
      occurrences: input.occurrences,
    })).resolves.toEqual({
      ...committed,
      outcome: "already_committed",
      invalidations: [],
    });
    await expect(runtime.repository.readCommittedExerciseReplacement({
      planId: input.planId,
      expectedPlanRevision: input.expectedPlanRevision,
      replacementExerciseId: input.replacementExerciseId,
      occurrences: [],
    })).resolves.toBeNull();
    await expect(runtime.repository.readCommittedExerciseReplacement({
      planId: input.planId,
      expectedPlanRevision: input.expectedPlanRevision,
      replacementExerciseId: input.replacementExerciseId,
      occurrences: [{
        ...input.occurrences[0]!,
        occurrenceId: "missing-occurrence",
      }],
    })).resolves.toBeNull();
    await expect(runtime.repository.readCommittedExerciseReplacement({
      planId: input.planId,
      expectedPlanRevision: input.expectedPlanRevision,
      replacementExerciseId: "exercise-bodyweight",
      occurrences: input.occurrences,
    })).resolves.toBeNull();
    await expect(runtime.repository.readCommittedExerciseReplacement({
      planId: input.planId,
      expectedPlanRevision: input.expectedPlanRevision,
      replacementExerciseId: input.replacementExerciseId,
      occurrences: [{
        ...input.occurrences[0]!,
        restSeconds: 999,
      }],
    })).resolves.toBeNull();
  });

  it("rejects repository-level stale previews, incompatible candidates, and incomplete scopes", async () => {
    const runtime = await setupRuntime();
    const input = await replacementRepositoryInput(runtime);
    const cases: ApplyExerciseReplacementRepositoryInput[] = [
      {
        ...input,
        expectedPreview: {
          ...input.expectedPreview,
          planRevision: 99,
        },
      },
      {
        ...input,
        replacementExerciseId: "missing-candidate",
      },
      {
        ...input,
        replacementExerciseId: "exercise-bodyweight",
      },
      {
        ...input,
        scope: "all_occurrences",
      },
      {
        ...input,
        occurrences: [{
          ...input.occurrences[0]!,
          restSeconds: 999,
        }],
      },
    ];
    for (const value of cases) {
      await expect(runtime.repository.applyExerciseReplacement(value))
        .rejects.toBeInstanceOf(PlanImpactRepositoryError);
    }
  });

  const replacementRaceCases: [
    PlanImpactRepositoryTestStage,
    (
      transaction: Parameters<
        NonNullable<PlanImpactRepositoryTestObserver["beforeWrite"]>
      >[1],
    ) => Promise<void>,
  ][] = [
    [
      "before_replacement_occurrence_update",
      async (transaction: Parameters<
        NonNullable<PlanImpactRepositoryTestObserver["beforeWrite"]>
      >[1]) => {
        await transaction.execute(
          `UPDATE owned_plan_day_exercises
           SET revision = revision + 1
           WHERE id = 'retained-occurrence'`,
        );
      },
    ],
    [
      "before_replacement_plan_update",
      async (transaction: Parameters<
        NonNullable<PlanImpactRepositoryTestObserver["beforeWrite"]>
      >[1]) => {
        await transaction.execute(
          `UPDATE plans
           SET revision = revision + 1
           WHERE id = 'retained-plan'`,
        );
      },
    ],
  ];

  it.each(replacementRaceCases)(
    "rejects a concurrent %s race and rolls back",
    async (stage, run) => {
      const runtime = await setupRuntime({
        beforeRepositoryWrite: { stage, run },
      });
      const input = await replacementRepositoryInput(runtime);
      await expect(runtime.repository.applyExerciseReplacement(input))
        .rejects.toMatchObject({ code: "plan_impact_preview_stale" });
      await expect(runtime.kernel.queryAll(
        `SELECT exercise_id, revision
         FROM owned_plan_day_exercises
         WHERE id = 'retained-occurrence'`,
      )).resolves.toEqual([{
        exercise_id: "exercise-squat",
        revision: 2,
      }]);
      await expect(runtime.kernel.queryAll(
        `SELECT revision FROM plans WHERE id = 'retained-plan'`,
      )).resolves.toEqual([{ revision: 4 }]);
    },
  );

  const scopes: [
    "this_occurrence" | "all_occurrences",
    readonly string[],
  ][] = [
    ["this_occurrence", ["retained-occurrence"]],
    [
      "all_occurrences",
      ["retained-occurrence", "retained-occurrence-b"],
    ],
  ];

  it.each(scopes)(
    "commits %s with complete reviewed values and immutable history",
    async (scope, affectedOccurrenceIds) => {
      const runtime = await setupRuntime();
      const before = await immutableRows(runtime.kernel);
      await runtime.kernel.write(async (transaction) => {
        for (const [id, targetId, createdAtMs] of [
          ["replacement-recommendation-a", "retained-target", 400],
          ["replacement-recommendation-b", "retained-target-b", 401],
        ] as const) {
          await transaction.execute(
            `INSERT INTO owned_progression_recommendations
              (id, exercise_id, owned_plan_working_set_target_id, rule_type,
               rule_version, evidence_version, evidence_json,
               current_target_json, proposed_target_json, metric_profile,
               metric_contract_version, exercise_metric_generation, status,
               source_revision, target_revision, created_at_ms, decided_at_ms)
             SELECT ?, occurrence.exercise_id, target.id, 'load_reps', 1, 1,
                    '{}', target.target_json, target.target_json,
                    target.metric_profile, target.metric_contract_version,
                    target.exercise_metric_generation, 'pending',
                    target.revision, target.revision, ?, NULL
             FROM owned_plan_working_set_targets target
             JOIN owned_plan_day_exercises occurrence
               ON occurrence.id = target.plan_day_exercise_id
             WHERE target.id = ?`,
            [id, createdAtMs, targetId],
          );
        }
      });
      const preview = await previewExerciseReplacement({
        repository: runtime.repository,
        sha256,
        input: {
          planId: "retained-plan",
          occurrenceId: "retained-occurrence",
        },
      });

      expect(preview.candidates.map(({ exerciseId, compatible }) => ({
        exerciseId,
        compatible,
      }))).toEqual(expect.arrayContaining([
        { exerciseId: "exercise-incline", compatible: true },
        { exerciseId: "exercise-bodyweight", compatible: false },
      ]));
      expect(preview.candidates.findIndex(({ compatible }) => !compatible))
        .toBeGreaterThan(
          preview.candidates.findIndex(({ exerciseId }) =>
            exerciseId === "exercise-incline"
          ),
        );
      expect(preview.occurrences.map(({ occurrenceId }) => occurrenceId))
        .toEqual(["retained-occurrence", "retained-occurrence-b"]);

      const selected = scope === "this_occurrence"
        ? [preview.occurrences[0]!]
        : preview.occurrences;
      const result = await replacePlanExercise({
        repository: runtime.repository,
        sha256,
        nowMs: () => 500,
        invalidate: async () => undefined,
        input: {
          requestId: `replace-${scope}`,
          planId: preview.planId,
          sourceOccurrenceId: preview.sourceOccurrenceId,
          expectedPlanRevision: preview.planRevision,
          previewToken: preview.previewToken,
          scope,
          replacementExerciseId: "exercise-incline",
          review: {
            targets: true,
            warmups: true,
            rest: true,
            progression: true,
            historyImmutable: true,
          },
          occurrences: selected,
        },
      });

      expect(result).toMatchObject({
        outcome: "committed",
        planRevision: 5,
        replacementExerciseId: "exercise-incline",
        affectedOccurrenceIds,
      });
      await expect(replacePlanExercise({
        repository: runtime.repository,
        sha256,
        nowMs: () => 9_999,
        invalidate: async () => {
          throw new Error("replay_must_not_invalidate");
        },
        input: {
          requestId: `replace-${scope}`,
          planId: preview.planId,
          sourceOccurrenceId: preview.sourceOccurrenceId,
          expectedPlanRevision: preview.planRevision,
          previewToken: preview.previewToken,
          scope,
          replacementExerciseId: "exercise-incline",
          review: {
            targets: true,
            warmups: true,
            rest: true,
            progression: true,
            historyImmutable: true,
          },
          occurrences: selected,
        },
      })).resolves.toEqual({
        ...result,
        outcome: "already_committed",
        invalidations: [],
      });
      await expect(runtime.kernel.queryAll(
        `SELECT id, exercise_id, revision
         FROM owned_plan_day_exercises
         WHERE id IN ('retained-occurrence', 'retained-occurrence-b')
         ORDER BY id`,
      )).resolves.toEqual([
        {
          id: "retained-occurrence",
          exercise_id: "exercise-incline",
          revision: 3,
        },
        {
          id: "retained-occurrence-b",
          exercise_id: scope === "all_occurrences"
            ? "exercise-incline"
            : "exercise-squat",
          revision: scope === "all_occurrences" ? 5 : 4,
        },
      ]);
      await expect(runtime.kernel.queryAll(
        `SELECT id, status, decided_at_ms
         FROM owned_progression_recommendations
         ORDER BY id`,
      )).resolves.toEqual([
        {
          decided_at_ms: 500,
          id: "replacement-recommendation-a",
          status: "invalidated",
        },
        {
          decided_at_ms: scope === "all_occurrences" ? 500 : null,
          id: "replacement-recommendation-b",
          status: scope === "all_occurrences" ? "invalidated" : "pending",
        },
      ]);
      expect(await immutableRows(runtime.kernel)).toEqual(before);
    },
  );

  it("rejects incomplete, stale, incompatible, and failed replacements without writes", async () => {
    const runtime = await setupRuntime();
    const before = await runtime.kernel.queryAll(
      `SELECT * FROM owned_plan_day_exercises
       WHERE plan_day_id IN ('retained-day', 'retained-power-day')
       ORDER BY id`,
    );
    const preview = await previewExerciseReplacement({
      repository: runtime.repository,
      sha256,
      input: {
        planId: "retained-plan",
        occurrenceId: "retained-occurrence",
      },
    });
    const reviewed = {
      targets: true,
      warmups: true,
      rest: true,
      progression: true,
      historyImmutable: true,
    } as const;

    await expect(replacePlanExercise({
      repository: runtime.repository,
      sha256,
      nowMs: () => 500,
      invalidate: async () => undefined,
      input: {
        requestId: "replace-incompatible",
        planId: preview.planId,
        sourceOccurrenceId: preview.sourceOccurrenceId,
        expectedPlanRevision: preview.planRevision,
        previewToken: preview.previewToken,
        scope: "this_occurrence",
        replacementExerciseId: "exercise-bodyweight",
        review: reviewed,
        occurrences: [preview.occurrences[0]!],
      },
    })).rejects.toMatchObject({
      code: "plan_impact_replacement_incompatible",
    });
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE owned_plan_working_set_targets
         SET revision = revision + 1
         WHERE id = 'retained-target'`,
      );
    });
    await expect(replacePlanExercise({
      repository: runtime.repository,
      sha256,
      nowMs: () => 500,
      invalidate: async () => undefined,
      input: {
        requestId: "replace-stale",
        planId: preview.planId,
        sourceOccurrenceId: preview.sourceOccurrenceId,
        expectedPlanRevision: preview.planRevision,
        previewToken: preview.previewToken,
        scope: "this_occurrence",
        replacementExerciseId: "exercise-incline",
        review: reviewed,
        occurrences: [preview.occurrences[0]!],
      },
    })).rejects.toMatchObject({ code: "plan_impact_preview_stale" });
    await expect(runtime.kernel.queryAll(
      `SELECT * FROM owned_plan_day_exercises
       WHERE plan_day_id IN ('retained-day', 'retained-power-day')
       ORDER BY id`,
    )).resolves.toEqual(before);

    const failed = await setupRuntime({ failCommit: true });
    const failedPreview = await previewExerciseReplacement({
      repository: failed.repository,
      sha256,
      input: {
        planId: "retained-plan",
        occurrenceId: "retained-occurrence",
      },
    });
    await expect(replacePlanExercise({
      repository: failed.repository,
      sha256,
      nowMs: () => 500,
      invalidate: async () => undefined,
      input: {
        requestId: "replace-failed",
        planId: failedPreview.planId,
        sourceOccurrenceId: failedPreview.sourceOccurrenceId,
        expectedPlanRevision: failedPreview.planRevision,
        previewToken: failedPreview.previewToken,
        scope: "all_occurrences",
        replacementExerciseId: "exercise-incline",
        review: reviewed,
        occurrences: failedPreview.occurrences,
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    const inspection = new DatabaseSync(failed.databasePath);
    expect(inspection.prepare(
      `SELECT COUNT(*) AS count
       FROM owned_plan_day_exercises
       WHERE exercise_id = 'exercise-incline'`,
    ).get()).toEqual({ count: 0 });
    inspection.close();
  });
});
