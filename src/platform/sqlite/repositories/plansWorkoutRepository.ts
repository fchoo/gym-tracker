import type {
  FoundationExercise,
  FullBodyFoundation,
} from "../../../domains/content";
import type {
  ActivatedPlan,
  ActivatedPlanDay,
  ActivatedSchedule,
  PlansRepository,
  StarterActivation,
} from "../../../domains/plans";
import type {
  MetricProfile,
} from "../../../domains/metrics";
import {
  assertValidHistoryCorrectionSnapshot,
  type HistoryCorrectionSnapshot,
} from "../../../domains/history";
import type {
  StartedWorkout,
  StartWorkoutRequest,
  TodayHistory,
  TodayView,
  WorkoutRepository,
  WorkoutSessionSource,
} from "../../../domains/workout";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";
import {
  creationTimezoneOffsetMinutes,
} from "../migrations/0013_history_integrity";
const CONTENT_PACK_ID = "content_pack_full_body_foundation_v1";
const BUNDLED_PLAN_ID = "plan_bundled_full_body_foundation_v1";
const WEEKDAY_NUMBER = {
  Monday: 1,
  Wednesday: 3,
  Friday: 5,
} as const;

async function supportsCompleteMetricIdentity(
  executor: Pick<SqliteKernel, "queryAll"> | SqliteTransactionExecutor,
): Promise<boolean> {
  const columns = await executor.queryAll<{ name: string }>(
    "PRAGMA table_info(session_exercises)",
  );
  const names = new Set(columns.map(({ name }) => name));
  return names.has("metric_contract_version")
    && names.has("exercise_metric_generation");
}

async function supportsOwnedTargetSnapshots(
  executor: Pick<SqliteKernel, "queryAll"> | SqliteTransactionExecutor,
): Promise<boolean> {
  const columns = await executor.queryAll<{ name: string }>(
    "PRAGMA table_info(session_sets)",
  );
  return columns.some(({ name }) =>
    name === "source_owned_plan_working_set_target_id"
  );
}

async function hasOwnedWorkoutGraph(
  executor: Pick<SqliteKernel, "queryAll"> | SqliteTransactionExecutor,
  planDayId: string,
): Promise<boolean> {
  const [table] = await executor.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM sqlite_master
     WHERE type = 'table' AND name = 'owned_plan_day_exercises'`,
  );
  if ((table?.count ?? 0) === 0) {
    return false;
  }
  const [row] = await executor.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM owned_plan_day_exercises
     WHERE plan_day_id = ?`,
    [planDayId],
  );
  return (row?.count ?? 0) > 0;
}

function safeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_|_$/gu, "");
}

function copiedId(prefix: string, planId: string, suffix: string): string {
  return `${prefix}_${safeToken(planId)}_${safeToken(suffix)}`;
}

function bundledDayId(dayOrdinal: number): string {
  return `plan_day_bundled_foundation_${dayOrdinal}`;
}

function targetJson(exercise: FoundationExercise): string {
  return JSON.stringify(
    exercise.target.kind === "load_reps"
      ? {
          version: 1,
          profile: "load_reps",
          loadGrams: exercise.target.loadGrams,
          minReps: exercise.target.minReps,
          maxReps: exercise.target.maxReps,
          incrementGrams: exercise.incrementGrams,
          perSide: exercise.target.perSide,
        }
      : {
          version: 1,
          profile: "timed_hold",
          durationSeconds: exercise.target.durationSeconds,
          perSide: exercise.target.perSide,
        },
  );
}

function unitJson(exercise: FoundationExercise): string {
  return JSON.stringify(
    exercise.metricProfile === "load_reps"
      ? { version: 1, load: "grams", count: "repetitions" }
      : { version: 1, duration: "seconds" },
  );
}

function policyRuleJson(exercise: FoundationExercise): string {
  return JSON.stringify(
    exercise.metricProfile === "load_reps"
      ? {
          version: 1,
          id: exercise.policy.id,
          incrementGrams: exercise.incrementGrams,
        }
      : {
          version: 1,
          id: exercise.policy.id,
          progression: "manual",
        },
  );
}

async function insertPlanGraph(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    fixture: FullBodyFoundation;
    planId: string;
    origin: "bundled" | "copied";
    active: boolean;
    completeMetricIdentity: boolean;
  }>,
): Promise<readonly ActivatedPlanDay[]> {
  const { fixture, planId, origin } = input;
  await transaction.execute(
    `INSERT INTO plans
      (id, content_pack_id, origin, source_namespace, upstream_id, name,
       days_per_week, audience, goal, estimate_minutes, attribution,
       is_active, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       audience = excluded.audience,
       goal = excluded.goal,
       estimate_minutes = excluded.estimate_minutes,
       attribution = excluded.attribution,
       revision = excluded.revision`,
    [
      planId,
      origin === "bundled" ? CONTENT_PACK_ID : null,
      origin,
      fixture.metadata.namespace,
      fixture.metadata.templateId,
      fixture.metadata.displayName,
      3,
      fixture.metadata.audience,
      fixture.metadata.goal,
      fixture.metadata.estimateMinutes,
      fixture.metadata.attribution,
      input.active ? 1 : 0,
      1,
    ],
  );

  const days: ActivatedPlanDay[] = [];
  for (const [dayOrdinal, day] of fixture.days.entries()) {
    const dayId = origin === "bundled"
      ? bundledDayId(dayOrdinal)
      : copiedId("plan_day", planId, String(dayOrdinal));
    await transaction.execute(
      `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, revision = excluded.revision`,
      [dayId, planId, dayOrdinal, day.name, 1],
    );
    days.push({ id: dayId, name: day.name, ordinal: dayOrdinal });

    for (const [exerciseOrdinal, exercise] of day.exercises.entries()) {
      const dayExerciseId = copiedId(
        origin === "bundled" ? "bundled_day_exercise" : "copied_day_exercise",
        dayId,
        String(exerciseOrdinal),
      );
      if (input.completeMetricIdentity) {
        await transaction.execute(
          `INSERT INTO plan_day_exercises
            (id, plan_day_id, exercise_id, ordinal,
             between_exercise_rest_seconds, metric_profile,
             metric_contract_version, exercise_metric_generation, revision)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
           ON CONFLICT(id) DO UPDATE SET
             exercise_id = excluded.exercise_id,
             ordinal = excluded.ordinal,
             between_exercise_rest_seconds =
               excluded.between_exercise_rest_seconds,
             metric_profile = excluded.metric_profile,
             metric_contract_version = excluded.metric_contract_version,
             exercise_metric_generation =
               excluded.exercise_metric_generation,
             revision = excluded.revision`,
          [
            dayExerciseId,
            dayId,
            exercise.exerciseId,
            exerciseOrdinal,
            exercise.restSeconds,
            exercise.metricProfile,
            1,
          ],
        );
      } else {
        await transaction.execute(
          `INSERT INTO plan_day_exercises
            (id, plan_day_id, exercise_id, ordinal,
             between_exercise_rest_seconds, revision)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             exercise_id = excluded.exercise_id,
             ordinal = excluded.ordinal,
             between_exercise_rest_seconds =
               excluded.between_exercise_rest_seconds,
             revision = excluded.revision`,
          [
            dayExerciseId,
            dayId,
            exercise.exerciseId,
            exerciseOrdinal,
            exercise.restSeconds,
            1,
          ],
        );
      }
      for (const [warmupOrdinal, warmup] of exercise.warmups.entries()) {
        await transaction.execute(
          `INSERT INTO plan_warmup_sets
            (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             load_grams = excluded.load_grams,
             reps = excluded.reps,
             revision = excluded.revision`,
          [
            copiedId("warmup", dayExerciseId, String(warmupOrdinal)),
            dayExerciseId,
            warmupOrdinal,
            warmup.loadGrams,
            warmup.reps,
            1,
          ],
        );
      }
      for (let setOrdinal = 0; setOrdinal < exercise.target.sets; setOrdinal += 1) {
        const loadGrams = exercise.target.kind === "load_reps"
          ? exercise.target.loadGrams
          : 0;
        const minReps = exercise.target.kind === "load_reps"
          ? exercise.target.minReps
          : 0;
        const maxReps = exercise.target.kind === "load_reps"
          ? exercise.target.maxReps
          : 0;
        const parameters = [
          copiedId("target", dayExerciseId, String(setOrdinal)),
          dayExerciseId,
          setOrdinal,
          loadGrams,
          minReps,
          maxReps,
          targetJson(exercise),
          unitJson(exercise),
        ] as const;
        if (input.completeMetricIdentity) {
          await transaction.execute(
            `INSERT INTO plan_working_set_targets
              (id, plan_day_exercise_id, ordinal, load_grams, min_reps,
               max_reps, target_json, unit_json, metric_profile,
               metric_contract_version, exercise_metric_generation, revision)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
             ON CONFLICT(id) DO UPDATE SET
               load_grams = excluded.load_grams,
               min_reps = excluded.min_reps,
               max_reps = excluded.max_reps,
               target_json = excluded.target_json,
               unit_json = excluded.unit_json,
               metric_profile = excluded.metric_profile,
               metric_contract_version = excluded.metric_contract_version,
               exercise_metric_generation =
                 excluded.exercise_metric_generation,
               revision = excluded.revision`,
            [...parameters, exercise.metricProfile, 1],
          );
        } else {
          await transaction.execute(
            `INSERT INTO plan_working_set_targets
              (id, plan_day_exercise_id, ordinal, load_grams, min_reps,
               max_reps, target_json, unit_json, revision)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               load_grams = excluded.load_grams,
               min_reps = excluded.min_reps,
               max_reps = excluded.max_reps,
               target_json = excluded.target_json,
               unit_json = excluded.unit_json,
               revision = excluded.revision`,
            [...parameters, 1],
          );
        }
      }
      const policyParameters = [
        copiedId("policy", dayExerciseId, exercise.policy.kind),
        dayExerciseId,
        exercise.policy.kind,
        exercise.policy.version,
        policyRuleJson(exercise),
      ] as const;
      if (input.completeMetricIdentity) {
        await transaction.execute(
          `INSERT INTO progression_policies
            (id, plan_day_exercise_id, policy_type, policy_version,
             rule_json, metric_profile, metric_contract_version,
             exercise_metric_generation, revision)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
           ON CONFLICT(id) DO UPDATE SET
             policy_type = excluded.policy_type,
             policy_version = excluded.policy_version,
             rule_json = excluded.rule_json,
             metric_profile = excluded.metric_profile,
             metric_contract_version = excluded.metric_contract_version,
             exercise_metric_generation =
               excluded.exercise_metric_generation,
             revision = excluded.revision`,
          [...policyParameters, exercise.metricProfile, 1],
        );
      } else {
        await transaction.execute(
          `INSERT INTO progression_policies
            (id, plan_day_exercise_id, policy_type, policy_version,
             rule_json, revision)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             policy_type = excluded.policy_type,
             policy_version = excluded.policy_version,
             rule_json = excluded.rule_json,
             revision = excluded.revision`,
          [...policyParameters, 1],
        );
      }
    }
  }
  return days;
}

async function importBundledContent(
  transaction: SqliteTransactionExecutor,
  fixture: FullBodyFoundation,
  installedAtMs: number,
  completeMetricIdentity: boolean,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO content_packs
      (id, namespace, version, source_revision, installed_at_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source_revision = excluded.source_revision,
       installed_at_ms = excluded.installed_at_ms`,
    [
      CONTENT_PACK_ID,
      fixture.metadata.namespace,
      fixture.version,
      fixture.metadata.sourceRevision,
      installedAtMs,
    ],
  );
  for (const exercise of fixture.days.flatMap(({ exercises }) => exercises)) {
    const parameters = [
      exercise.exerciseId,
      CONTENT_PACK_ID,
      fixture.metadata.namespace,
      exercise.exerciseId,
      exercise.name,
      exercise.metricProfile,
      exercise.equipment,
      exercise.restSeconds,
      fixture.metadata.sourceRevision,
    ] as const;
    if (completeMetricIdentity) {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, metric_contract_version,
           exercise_metric_generation, equipment, default_rest_seconds,
           revision)
         VALUES (?, ?, 'bundled', ?, ?, ?, ?, 1, 1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           metric_profile = excluded.metric_profile,
           metric_contract_version = excluded.metric_contract_version,
           exercise_metric_generation = excluded.exercise_metric_generation,
           equipment = excluded.equipment,
           default_rest_seconds = excluded.default_rest_seconds,
           revision = excluded.revision`,
        parameters,
      );
    } else {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, equipment, default_rest_seconds, revision)
         VALUES (?, ?, 'bundled', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           metric_profile = excluded.metric_profile,
           equipment = excluded.equipment,
           default_rest_seconds = excluded.default_rest_seconds,
           revision = excluded.revision`,
        parameters,
      );
    }
  }
  await insertPlanGraph(transaction, {
    fixture,
    planId: BUNDLED_PLAN_ID,
    origin: "bundled",
    active: false,
    completeMetricIdentity,
  });
}

type ExistingActivationRow = Readonly<{
  plan_id: string;
  plan_name: string;
  plan_revision: number;
  schedule_id: string;
  schedule_mode: "weekday";
  start_local_date: string;
  timezone: string;
  cycle_length_weeks: number;
}>;

async function existingActivation(
  transaction: SqliteTransactionExecutor,
  namespace: string,
  upstreamId: string,
): Promise<StarterActivation | null> {
  const [row] = await transaction.queryAll<ExistingActivationRow>(
    `SELECT p.id AS plan_id, p.name AS plan_name,
            p.revision AS plan_revision, s.id AS schedule_id,
            s.mode AS schedule_mode, s.start_local_date,
            s.timezone, s.cycle_length_weeks
     FROM plans p
     JOIN plan_schedules s ON s.plan_id = p.id
     WHERE p.origin = 'copied'
       AND p.source_namespace = ?
       AND p.upstream_id = ?
       AND p.is_active = 1
     ORDER BY p.id
     LIMIT 1`,
    [namespace, upstreamId],
  );
  if (row === undefined) {
    return null;
  }
  const days = await transaction.queryAll<{
    id: string;
    name: "Full Body A" | "Full Body B";
    ordinal: number;
  }>(
    `SELECT id, name, ordinal FROM plan_days
     WHERE plan_id = ? ORDER BY ordinal`,
    [row.plan_id],
  );
  return {
    plan: {
      id: row.plan_id,
      origin: "copied",
      sourceNamespace: namespace,
      upstreamId,
      name: row.plan_name,
      isActive: true,
      revision: row.plan_revision,
    },
    days,
    schedule: {
      id: row.schedule_id,
      mode: row.schedule_mode,
      startLocalDate: row.start_local_date,
      timezone: row.timezone,
      cycleLengthWeeks: row.cycle_length_weeks,
    },
  };
}

function sessionSource(mode: StartWorkoutRequest["mode"]): WorkoutSessionSource {
  switch (mode) {
    case "scheduled":
      return "scheduled_day";
    case "alternate":
      return "alternate_day";
    case "rest_day":
      return "rest_day";
    case "empty":
      return "empty";
  }
}

function workoutTargetJson(input: Readonly<{
  metricProfile: MetricProfile;
  targetJson: string;
  loadGrams: number;
  minReps: number;
  maxReps: number;
  incrementGrams: number;
}>): string {
  if (input.targetJson !== "{}") {
    return input.targetJson;
  }
  if (input.metricProfile === "load_reps") {
    return JSON.stringify({
      version: 1,
      profile: "load_reps",
      loadGrams: input.loadGrams,
      minReps: input.minReps,
      maxReps: input.maxReps,
      incrementGrams: input.incrementGrams,
      perSide: false,
    });
  }
  return input.targetJson;
}

function formatTarget(metricProfile: string, target: Record<string, unknown>): string {
  if (metricProfile === "timed_hold") {
    const side = target.perSide === true ? " per side" : "";
    return `${String(target.durationSeconds)} sec${side}`;
  }
  const side = target.perSide === true ? " per side" : "";
  const targetReps = Array.isArray(target.targetReps)
    ? target.targetReps.filter((value): value is number =>
        Number.isSafeInteger(value)
      )
    : [];
  const repAim = targetReps.length > 0
    ? new Set(targetReps).size === 1
      ? String(targetReps[0])
      : targetReps.join(" / ")
    : String(target.maxReps);
  return `${Number(target.loadGrams) / 1_000} kg × ${repAim}${side}`;
}

function addLocalDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayNumber(localDate: string): number {
  const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

async function comparableHistory(
  kernel: SqliteKernel,
  exerciseId: string,
  metricProfile: "load_reps" | "timed_hold",
): Promise<TodayHistory | null> {
  const rows = await kernel.queryAll<{
    session_id: string;
    observed_load_grams: number | null;
    observed_reps: number | null;
    observed_json: string | null;
  }>(
    `WITH latest AS (
       SELECT ws.id
       FROM workout_sessions ws
       JOIN session_exercises se ON se.session_id = ws.id
       WHERE se.exercise_id = ?
         AND se.metric_profile = ?
         AND ws.status IN ('completed', 'partial')
       ORDER BY COALESCE(ws.completed_at_ms, ws.started_at_ms) DESC
       LIMIT 1
     )
     SELECT se.session_id, ss.observed_load_grams, ss.observed_reps,
            ss.observed_json
     FROM session_exercises se
     JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE se.session_id = (SELECT id FROM latest)
       AND se.exercise_id = ?
       AND se.metric_profile = ?
       AND ss.set_kind = 'working'
       AND ss.status = 'completed'
     ORDER BY ss.ordinal`,
    [exerciseId, metricProfile, exerciseId, metricProfile],
  );
  if (rows.length === 0) {
    return null;
  }
  if (metricProfile === "timed_hold") {
    const observations = rows.map(({ observed_json: observedJson }) =>
      observedJson === null
        ? null
        : JSON.parse(observedJson) as { durationSeconds?: unknown },
    );
    const durations = observations
      .map((observation) => observation?.durationSeconds)
      .filter((duration): duration is number => Number.isSafeInteger(duration));
    return durations.length === 0
      ? null
      : {
          summary: `Last ${durations.join(" / ")} sec`,
          change: null,
        };
  }
  const loadGrams = rows[0]?.observed_load_grams;
  const repetitions = rows
    .map(({ observed_reps: observedReps }) => observedReps)
    .filter((reps): reps is number => reps !== null);
  if (loadGrams === null || loadGrams === undefined || repetitions.length === 0) {
    return null;
  }
  return {
    summary: `Last ${loadGrams / 1_000} kg · ${repetitions.join(" / ")}`,
    change: null,
  };
}

export function createPlansWorkoutRepository(
  kernel: SqliteKernel,
): PlansRepository & WorkoutRepository {
  return Object.freeze({
    activateStarterPlan(
      input: Parameters<PlansRepository["activateStarterPlan"]>[0],
    ): Promise<StarterActivation> {
      return kernel.write(async (transaction) => {
        const completeMetricIdentity = await supportsCompleteMetricIdentity(
          transaction,
        );
        await importBundledContent(
          transaction,
          input.fixture,
          input.activatedAtMs,
          completeMetricIdentity,
        );
        const existing = await existingActivation(
          transaction,
          input.fixture.metadata.namespace,
          input.fixture.metadata.templateId,
        );
        if (existing !== null) {
          return existing;
        }

        const planId = `plan_copy_${input.activatedAtMs}`;
        const days = await insertPlanGraph(transaction, {
          fixture: input.fixture,
          planId,
          origin: "copied",
          active: true,
          completeMetricIdentity,
        });
        const scheduleId = `schedule_${input.activatedAtMs}`;
        await transaction.execute(
          `INSERT INTO plan_schedules
            (id, plan_id, mode, start_local_date, timezone,
             cycle_length_weeks, revision)
           VALUES (?, ?, 'weekday', ?, ?, ?, ?)`,
          [
            scheduleId,
            planId,
            input.startLocalDate,
            input.timezone,
            input.fixture.metadata.schedule.cycle.length,
            1,
          ],
        );
        for (
          const [weekIndex, week] of
          input.fixture.metadata.schedule.cycle.entries()
        ) {
          for (const binding of week) {
            const day = days.find(({ name }) => name === binding.day)!;
            await transaction.execute(
              `INSERT INTO plan_schedule_bindings
                (id, schedule_id, week_index, weekday, plan_day_id, revision)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                copiedId(
                  "schedule_binding",
                  scheduleId,
                  `${weekIndex}_${binding.weekday}`,
                ),
                scheduleId,
                weekIndex,
                WEEKDAY_NUMBER[binding.weekday],
                day.id,
                1,
              ],
            );
          }
        }
        await transaction.execute(
          `INSERT INTO app_settings
            (key, value_version, value_json, revision, updated_at_ms)
           VALUES ('selected_copied_plan', 1, ?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             revision = app_settings.revision + 1,
             updated_at_ms = excluded.updated_at_ms`,
          [JSON.stringify({ planId }), input.activatedAtMs],
        );
        const plan: ActivatedPlan = {
          id: planId,
          origin: "copied",
          sourceNamespace: input.fixture.metadata.namespace,
          upstreamId: input.fixture.metadata.templateId,
          name: input.fixture.metadata.displayName,
          isActive: true,
          revision: 1,
        };
        const schedule: ActivatedSchedule = {
          id: scheduleId,
          mode: "weekday",
          startLocalDate: input.startLocalDate,
          timezone: input.timezone,
          cycleLengthWeeks: input.fixture.metadata.schedule.cycle.length,
        };
        return { plan, days, schedule };
      });
    },

    startWorkout(
      request: StartWorkoutRequest,
    ): Promise<StartedWorkout> {
      return kernel.write(async (transaction) => {
        const completeIdentity = await supportsCompleteMetricIdentity(
          transaction,
        );
        const ownedTargetSnapshots = await supportsOwnedTargetSnapshots(
          transaction,
        );
        const ownedGraph = request.mode !== "empty"
          && await hasOwnedWorkoutGraph(transaction, request.planDayId);
        const occurrenceTable = ownedGraph
          ? "owned_plan_day_exercises"
          : "plan_day_exercises";
        const warmupTable = ownedGraph
          ? "owned_plan_warmup_sets"
          : "plan_warmup_sets";
        const targetTable = ownedGraph
          ? "owned_plan_working_set_targets"
          : "plan_working_set_targets";
        const policyTable = ownedGraph
          ? "owned_plan_progression_policies"
          : "progression_policies";
        const exerciseTable = ownedGraph
          ? "exercise_library_entries"
          : "exercises";
        const exerciseJoin = ownedGraph
          ? "e.exercise_id = de.exercise_id"
          : "e.id = de.exercise_id";
        const source = sessionSource(request.mode);
        const identitySuffix = request.mode === "empty"
          ? source
          : `${source}_${safeToken(request.planDayId)}`;
        const sessionId = `session_${request.startedAtMs}_${identitySuffix}`;
        const planId = request.mode === "empty" ? null : request.planId;
        const planDayId = request.mode === "empty" ? null : request.planDayId;
        await transaction.execute(
          `INSERT INTO workout_sessions
            (id, plan_id, plan_day_id, source, status, local_date, timezone,
             started_at_ms, completed_at_ms, creation_timezone_offset_minutes,
             active_session_exercise_id, active_set_id, revision)
           VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?, NULL, ?, NULL, NULL, 1)`,
          [
            sessionId,
            planId,
            planDayId,
            source,
            request.localDate,
            request.timezone,
            request.startedAtMs,
            creationTimezoneOffsetMinutes(
              request.timezone,
              request.startedAtMs,
            ),
          ],
        );

        if (request.mode !== "empty") {
          const exercises = await transaction.queryAll<{
            day_exercise_id: string;
            exercise_id: string;
            ordinal: number;
            exercise_name: string;
            metric_profile: MetricProfile;
            metric_contract_version?: number;
            exercise_metric_generation?: number;
            default_rest_seconds: number;
            increment_grams: number;
          }>(
            `SELECT de.id AS day_exercise_id, de.exercise_id, de.ordinal,
                    ${ownedGraph ? "e.canonical_name" : "e.name"}
                      AS exercise_name,
                    ${completeIdentity
                      ? `de.metric_profile,
                         de.metric_contract_version,
                         de.exercise_metric_generation,`
                      : "e.metric_profile,"}
                    ${ownedGraph
                      ? "de.between_exercise_rest_seconds"
                      : "e.default_rest_seconds"} AS default_rest_seconds,
                    COALESCE(
                      json_extract(p.rule_json, '$.incrementGrams'),
                      1000
                    ) AS increment_grams
             FROM ${occurrenceTable} de
             JOIN ${exerciseTable} e ON ${exerciseJoin}
             LEFT JOIN ${policyTable} p
               ON p.plan_day_exercise_id = de.id
             WHERE de.plan_day_id = ?
             ORDER BY de.ordinal`,
            [request.planDayId],
          );
          for (const exercise of exercises) {
            const sessionExerciseId = copiedId(
              "session_exercise",
              sessionId,
              String(exercise.ordinal),
            );
            const [targetRevision] = await transaction.queryAll<{
              revision: number;
            }>(
              `SELECT MAX(revision) AS revision
               FROM ${targetTable}
               WHERE plan_day_exercise_id = ?`,
              [exercise.day_exercise_id],
            );
            if (targetRevision === undefined || targetRevision.revision === null) {
              throw new Error("workout_start_target_missing");
            }
            await transaction.execute(
              `INSERT INTO session_exercises
                (id, session_id, source_plan_day_exercise_id, exercise_id,
                 ordinal, exercise_name, metric_profile,
                 ${completeIdentity
                   ? `metric_contract_version,
                      exercise_metric_generation,`
                   : ""}
                 default_rest_seconds, target_revision, status, revision)
               VALUES (?, ?, ?, ?, ?, ?, ?,
                       ${completeIdentity ? "?, ?," : ""}
                       ?, ?, ?, ?)`,
              completeIdentity
                ? [
                    sessionExerciseId,
                    sessionId,
                    ownedGraph ? null : exercise.day_exercise_id,
                    exercise.exercise_id,
                    exercise.ordinal,
                    exercise.exercise_name,
                    exercise.metric_profile,
                    exercise.metric_contract_version!,
                    exercise.exercise_metric_generation!,
                    exercise.default_rest_seconds,
                    targetRevision.revision,
                    exercise.ordinal === 0 ? "active" : "planned",
                    1,
                  ]
                : [
                    sessionExerciseId,
                    sessionId,
                    ownedGraph ? null : exercise.day_exercise_id,
                    exercise.exercise_id,
                    exercise.ordinal,
                    exercise.exercise_name,
                    exercise.metric_profile,
                    exercise.default_rest_seconds,
                    targetRevision.revision,
                    exercise.ordinal === 0 ? "active" : "planned",
                    1,
                  ],
            );
            const warmups = await transaction.queryAll<{
              ordinal: number;
              load_grams: number;
              reps: number;
            }>(
              `SELECT ordinal, load_grams, reps FROM ${warmupTable}
               WHERE plan_day_exercise_id = ? ORDER BY ordinal`,
              [exercise.day_exercise_id],
            );
            for (
              const warmup of exercise.metric_profile === "load_reps"
                ? warmups
                : []
            ) {
              await transaction.execute(
                `INSERT INTO session_sets
                  (id, session_exercise_id, set_kind, ordinal,
                   source_plan_working_set_target_id,
                   ${ownedTargetSnapshots
                     ? "source_owned_plan_working_set_target_id,"
                     : ""}
                   target_load_grams, target_min_reps, target_max_reps,
                   target_json, unit_json, rule_type, rule_version,
                   ${completeIdentity
                     ? `metric_profile, metric_contract_version,
                        exercise_metric_generation,`
                     : ""}
                   observed_load_grams, observed_reps, status,
                   draft_updated_at_ms, completed_at_ms,
                   completion_idempotency_key, revision)
                 VALUES (?, ?, 'warmup', ?, NULL,
                         ${ownedTargetSnapshots ? "NULL," : ""}
                         ?, ?, ?, ?, ?, 'load_reps', 1,
                         ${completeIdentity ? "'load_reps', 1, ?," : ""}
                         NULL, NULL, 'planned', NULL, NULL, NULL, 1)`,
                [
                  copiedId("session_warmup", sessionExerciseId, String(warmup.ordinal)),
                  sessionExerciseId,
                  warmup.ordinal,
                  warmup.load_grams,
                  warmup.reps,
                  warmup.reps,
                  JSON.stringify({
                    version: 1,
                    profile: "load_reps",
                    loadGrams: warmup.load_grams,
                    minReps: warmup.reps,
                    maxReps: warmup.reps,
                    incrementGrams: exercise.increment_grams,
                    perSide: false,
                  }),
                  JSON.stringify({
                    version: 1,
                    load: "grams",
                    count: "repetitions",
                  }),
                  ...(completeIdentity
                    ? [exercise.exercise_metric_generation!]
                    : []),
                ],
              );
            }
            const targets = await transaction.queryAll<{
              id: string;
              ordinal: number;
              load_grams: number;
              min_reps: number;
              max_reps: number;
              target_json: string;
              unit_json: string;
              policy_type: MetricProfile | "manual_hold";
              policy_version: number;
              metric_profile?: MetricProfile;
              metric_contract_version?: number;
              exercise_metric_generation?: number;
            }>(
              `SELECT t.id, t.ordinal,
                      ${ownedGraph
                        ? `COALESCE(
                             json_extract(t.target_json, '$.loadGrams'),
                             json_extract(t.target_json, '$.addedLoadGrams'),
                             json_extract(t.target_json, '$.assistanceGrams'),
                             0
                           ) AS load_grams,
                           COALESCE(
                             json_extract(t.target_json, '$.minReps'),
                             0
                           ) AS min_reps,
                           COALESCE(
                             json_extract(t.target_json, '$.maxReps'),
                             0
                           ) AS max_reps,`
                        : "t.load_grams, t.min_reps, t.max_reps,"}
                      t.target_json, t.unit_json,
                      ${ownedGraph
                        ? `CASE
                             WHEN p.policy_kind = 'manual_hold'
                               THEN 'manual_hold'
                             ELSE t.metric_profile
                           END`
                        : "p.policy_type"} AS policy_type,
                      p.policy_version
                      ${completeIdentity
                        ? `, t.metric_profile, t.metric_contract_version,
                           t.exercise_metric_generation`
                        : ""}
               FROM ${targetTable} t
               JOIN ${policyTable} p
                 ON p.plan_day_exercise_id = t.plan_day_exercise_id
               WHERE t.plan_day_exercise_id = ?
                 ${completeIdentity
                   ? `AND p.status = 'active'
                      AND p.metric_profile = t.metric_profile
                      AND p.metric_contract_version =
                        t.metric_contract_version
                      AND p.exercise_metric_generation =
                        t.exercise_metric_generation`
                   : ""}
               ORDER BY t.ordinal`,
              [exercise.day_exercise_id],
            );
            for (const target of targets) {
              await transaction.execute(
                `INSERT INTO session_sets
                  (id, session_exercise_id, set_kind, ordinal,
                   source_plan_working_set_target_id,
                   ${ownedTargetSnapshots
                     ? "source_owned_plan_working_set_target_id,"
                     : ""}
                   target_load_grams, target_min_reps, target_max_reps,
                   target_json, unit_json, rule_type, rule_version,
                   ${completeIdentity
                     ? `metric_profile, metric_contract_version,
                        exercise_metric_generation,`
                     : ""}
                   observed_load_grams, observed_reps, status,
                   draft_updated_at_ms, completed_at_ms,
                   completion_idempotency_key, revision)
                 VALUES (?, ?, 'working', ?, ?,
                         ${ownedTargetSnapshots ? "?," : ""}
                         ?, ?, ?, ?, ?, ?, ?,
                         ${completeIdentity ? "?, ?, ?," : ""}
                         NULL, NULL, 'planned', NULL, NULL, NULL, 1)`,
                [
                  copiedId("session_target", sessionExerciseId, String(target.ordinal)),
                  sessionExerciseId,
                  target.ordinal,
                  ownedGraph ? null : target.id,
                  ...(ownedTargetSnapshots
                    ? [ownedGraph ? target.id : null]
                    : []),
                  target.load_grams,
                  target.min_reps,
                  target.max_reps,
                  workoutTargetJson({
                    metricProfile: target.metric_profile
                      ?? exercise.metric_profile,
                    targetJson: target.target_json,
                    loadGrams: target.load_grams,
                    minReps: target.min_reps,
                    maxReps: target.max_reps,
                    incrementGrams: exercise.increment_grams,
                  }),
                  target.unit_json,
                  target.policy_type,
                  target.policy_version,
                  ...(completeIdentity
                    ? [
                        target.metric_profile!,
                        target.metric_contract_version!,
                        target.exercise_metric_generation!,
                      ]
                    : []),
                ],
              );
            }
          }
          const [active] = await transaction.queryAll<{
            exercise_id: string;
            set_id: string;
          }>(
            `SELECT se.id AS exercise_id, ss.id AS set_id
             FROM session_exercises se
             JOIN session_sets ss ON ss.session_exercise_id = se.id
             WHERE se.session_id = ?
             ORDER BY se.ordinal,
                      CASE ss.set_kind WHEN 'working' THEN 0 ELSE 1 END,
                      ss.ordinal
             LIMIT 1`,
            [sessionId],
          );
          if (active === undefined) {
            throw new Error("workout_start_plan_day_empty");
          }
          await transaction.execute(
            `UPDATE workout_sessions
             SET active_session_exercise_id = ?, active_set_id = ?
             WHERE id = ?`,
            [active.exercise_id, active.set_id, sessionId],
          );
        }
        const result: StartedWorkout = {
          id: sessionId,
          source,
          status: "in_progress",
          planId,
          planDayId,
          revision: 1,
        };
        return result;
      });
    },

    async getTodayView(
      {
        localDate,
        weekday,
      }: Parameters<WorkoutRepository["getTodayView"]>[0],
    ): Promise<TodayView> {
      const [active] = await kernel.queryAll<{
        session_id: string;
        exercise_name: string | null;
        set_kind: string | null;
        set_ordinal: number | null;
        rest_status: "idle" | "running" | "paused" | "expired" | null;
      }>(
        `SELECT ws.id AS session_id, se.exercise_name, ss.set_kind,
                ss.ordinal AS set_ordinal, rs.status AS rest_status
         FROM workout_sessions ws
         LEFT JOIN session_exercises se
           ON se.id = ws.active_session_exercise_id
         LEFT JOIN session_sets ss ON ss.id = ws.active_set_id
         LEFT JOIN session_rest_states rs ON rs.session_id = ws.id
         WHERE ws.status = 'in_progress'
         LIMIT 1`,
      );
      if (active !== undefined) {
        return {
          state: "active_workout",
          sessionId: active.session_id,
          exerciseName: active.exercise_name,
          setLabel: active.set_kind === null || active.set_ordinal === null
            ? null
            : `${active.set_kind === "warmup" ? "Warm-up" : "Working set"} ${
                active.set_ordinal + 1
              }`,
          restStatus: active.rest_status ?? "idle",
        };
      }
      const [partial] = await kernel.queryAll<{
        session_id: string;
        revision: number;
        active_session_exercise_id: string | null;
        active_set_id: string | null;
        exercise_name: string | null;
        set_kind: string | null;
        set_ordinal: number | null;
        completed_working_sets: number;
        total_working_sets: number;
        snapshot_json: string | null;
        effective_local_date: string | null;
        effective_timezone: string | null;
        effective_started_at_ms: number | null;
        effective_completed_at_ms: number | null;
      }>(
        `SELECT ws.id AS session_id,
                COALESCE(overlay.effective_revision, ws.revision) AS revision,
                ws.active_session_exercise_id, ws.active_set_id,
                se.exercise_name, ss.set_kind,
                ss.ordinal AS set_ordinal,
                SUM(CASE
                  WHEN all_sets.set_kind = 'working'
                   AND all_sets.status = 'completed' THEN 1 ELSE 0 END
                ) AS completed_working_sets,
                SUM(CASE
                  WHEN all_sets.set_kind = 'working' THEN 1 ELSE 0 END
                ) AS total_working_sets,
                overlay.snapshot_json, overlay.effective_local_date,
                overlay.effective_timezone, overlay.effective_started_at_ms,
                overlay.effective_completed_at_ms
         FROM workout_sessions ws
         LEFT JOIN session_exercises se
           ON se.id = ws.active_session_exercise_id
         LEFT JOIN session_sets ss ON ss.id = ws.active_set_id
         LEFT JOIN session_exercises all_exercises
           ON all_exercises.session_id = ws.id
         LEFT JOIN session_sets all_sets
           ON all_sets.session_exercise_id = all_exercises.id
         LEFT JOIN history_session_overlays overlay
           ON overlay.session_id = ws.id
         WHERE ws.status = 'partial'
           AND (overlay.session_id IS NULL OR overlay.lifecycle = 'active')
         GROUP BY ws.id
         ORDER BY ws.completed_at_ms DESC, ws.id DESC
         LIMIT 1`,
      );
      if (partial !== undefined) {
        let exerciseName = partial.exercise_name;
        let setKind = partial.set_kind;
        let setOrdinal = partial.set_ordinal;
        let completedWorkingSets = partial.completed_working_sets;
        let totalWorkingSets = partial.total_working_sets;
        if (partial.snapshot_json !== null) {
          try {
            const snapshot = JSON.parse(
              partial.snapshot_json,
            ) as HistoryCorrectionSnapshot;
            assertValidHistoryCorrectionSnapshot(snapshot);
            if (
              snapshot.session.id !== partial.session_id
              || snapshot.session.status !== "partial"
              || snapshot.session.localDate !== partial.effective_local_date
              || snapshot.session.timezone !== partial.effective_timezone
              || snapshot.session.startedAtMs
                !== partial.effective_started_at_ms
              || snapshot.session.completedAtMs
                !== partial.effective_completed_at_ms
            ) {
              throw new Error("today_partial_overlay_mismatch");
            }
            const activeExercise = partial.active_session_exercise_id === null
              ? undefined
              : snapshot.exercises.find(({ id }) =>
                id === partial.active_session_exercise_id
              );
            const activeSet = partial.active_set_id === null
              ? undefined
              : activeExercise?.sets.find(({ id }) => id === partial.active_set_id);
            if (
              (partial.active_session_exercise_id !== null
                && activeExercise === undefined)
              || (partial.active_set_id !== null && activeSet === undefined)
            ) {
              throw new Error("today_partial_overlay_cursor_mismatch");
            }
            exerciseName = activeExercise?.name ?? null;
            setKind = activeSet?.kind ?? null;
            setOrdinal = activeSet?.ordinal ?? null;
            const workingSets = snapshot.exercises.flatMap(({ sets }) =>
              sets.filter(({ kind }) => kind === "working")
            );
            completedWorkingSets = workingSets.filter(({ status }) =>
              status === "completed"
            ).length;
            totalWorkingSets = workingSets.length;
          } catch {
            throw new Error("today_partial_overlay_invalid");
          }
        }
        return {
          state: "saved_partial",
          sessionId: partial.session_id,
          revision: partial.revision,
          exerciseName,
          setLabel: setKind === null || setOrdinal === null
            ? null
            : `${setKind === "warmup" ? "Warm-up" : "Working set"} ${
                setOrdinal + 1
              }`,
          completedWorkingSets,
          totalWorkingSets,
        };
      }

      const activation = await kernel.queryAll<{
        plan_id: string;
        plan_name: string;
        estimate_minutes: number;
        schedule_id: string;
        start_local_date: string;
        cycle_length_weeks: number;
      }>(
        `SELECT p.id AS plan_id, p.name AS plan_name, p.estimate_minutes,
                s.id AS schedule_id, s.start_local_date, s.cycle_length_weeks
         FROM plans p
         JOIN plan_schedules s ON s.plan_id = p.id
         WHERE p.origin = 'copied' AND p.is_active = 1
         LIMIT 1`,
      );
      const selected = activation[0];
      if (selected === undefined) {
        return { state: "no_active_plan" };
      }
      const daysSinceStart = Math.floor(
        (
          Date.parse(`${localDate}T00:00:00Z`)
          - Date.parse(`${selected.start_local_date}T00:00:00Z`)
        ) / 86_400_000,
      );
      const weekIndex = Math.max(
        0,
        Math.floor(daysSinceStart / 7) % selected.cycle_length_weeks,
      );
      const [binding] = await kernel.queryAll<{
        plan_day_id: string;
        day_name: string;
      }>(
        `SELECT b.plan_day_id, d.name AS day_name
         FROM plan_schedule_bindings b
         JOIN plan_days d ON d.id = b.plan_day_id
         WHERE b.schedule_id = ? AND b.week_index = ? AND b.weekday = ?`,
        [selected.schedule_id, weekIndex, weekday],
      );
      if (binding === undefined) {
        const bindings = await kernel.queryAll<{
          week_index: number;
          weekday: number;
          plan_day_id: string;
          day_name: string;
        }>(
          `SELECT b.week_index, b.weekday, b.plan_day_id, d.name AS day_name
           FROM plan_schedule_bindings b
           JOIN plan_days d ON d.id = b.plan_day_id
           WHERE b.schedule_id = ?
           ORDER BY b.week_index, b.weekday`,
          [selected.schedule_id],
        );
        let next:
          | { plan_day_id: string; day_name: string; local_date: string }
          | undefined;
        for (
          let offset = 1;
          offset <= selected.cycle_length_weeks * 7;
          offset += 1
        ) {
          const candidateDate = addLocalDays(localDate, offset);
          const candidateDaysSinceStart = Math.floor(
            (
              Date.parse(`${candidateDate}T00:00:00Z`)
              - Date.parse(`${selected.start_local_date}T00:00:00Z`)
            ) / 86_400_000,
          );
          if (candidateDaysSinceStart < 0) {
            continue;
          }
          const candidateWeek = Math.floor(candidateDaysSinceStart / 7)
            % selected.cycle_length_weeks;
          const candidateWeekday = weekdayNumber(candidateDate);
          const candidateBinding = bindings.find((candidate) =>
            candidate.week_index === candidateWeek
            && candidate.weekday === candidateWeekday,
          );
          if (candidateBinding === undefined) {
            continue;
          }
          next = {
            plan_day_id: candidateBinding.plan_day_id,
            day_name: candidateBinding.day_name,
            local_date: candidateDate,
          };
          break;
        }
        if (next === undefined) {
          throw new Error("plan_schedule_empty");
        }
        return {
          state: "rest_day",
          planId: selected.plan_id,
          planName: selected.plan_name,
          nextDayId: next.plan_day_id,
          nextDayName: next.day_name,
          nextLocalDate: next.local_date,
        };
      }
      const ownedGraph = await hasOwnedWorkoutGraph(
        kernel,
        binding.plan_day_id,
      );
      const ownedRecommendations = ownedGraph
        && await supportsOwnedTargetSnapshots(kernel);
      const occurrenceTable = ownedGraph
        ? "owned_plan_day_exercises"
        : "plan_day_exercises";
      const targetTable = ownedGraph
        ? "owned_plan_working_set_targets"
        : "plan_working_set_targets";
      const recommendationJoin = ownedGraph
        ? ownedRecommendations
          ? `LEFT JOIN owned_progression_recommendations r
               ON r.owned_plan_working_set_target_id = t.id
              AND r.status = 'pending'`
          : ""
        : `LEFT JOIN progression_recommendations r
             ON r.plan_working_set_target_id = t.id
            AND r.status = 'pending'`;
      const recommendationCount = ownedGraph && !ownedRecommendations
        ? "0"
        : "COUNT(r.id)";
      const rows = await kernel.queryAll<{
        exercise_id: string;
        exercise_name: string;
        metric_profile: "load_reps" | "timed_hold";
        target_json: string;
        recommendation_count: number;
      }>(
        `SELECT e.id AS exercise_id, e.name AS exercise_name,
                e.metric_profile, MIN(t.target_json) AS target_json,
                ${recommendationCount} AS recommendation_count
         FROM ${occurrenceTable} de
         JOIN exercises e ON e.id = de.exercise_id
         JOIN ${targetTable} t
           ON t.plan_day_exercise_id = de.id
         ${recommendationJoin}
         WHERE de.plan_day_id = ?
         GROUP BY de.id
         ORDER BY de.ordinal`,
        [binding.plan_day_id],
      );
      const exercises = await Promise.all(rows.map(async (row) => ({
        exerciseId: row.exercise_id,
        name: row.exercise_name,
        metricProfile: row.metric_profile,
        nextTarget: formatTarget(
          row.metric_profile,
          JSON.parse(row.target_json) as Record<string, unknown>,
        ),
        history: await comparableHistory(
          kernel,
          row.exercise_id,
          row.metric_profile,
        ),
        recommendationStatus:
          row.recommendation_count > 0 ? "pending" as const : "none" as const,
      })));
      return {
        state: "scheduled",
        planId: selected.plan_id,
        planName: selected.plan_name,
        dayId: binding.plan_day_id,
        dayName: binding.day_name,
        estimateMinutes: selected.estimate_minutes,
        exercises,
      };
    },

    async getActivation(): Promise<StarterActivation | null> {
      const rows = await kernel.queryAll<ExistingActivationRow>(
        `SELECT p.id AS plan_id, p.name AS plan_name,
                p.revision AS plan_revision, s.id AS schedule_id,
                s.mode AS schedule_mode, s.start_local_date,
                s.timezone, s.cycle_length_weeks
         FROM plans p
         JOIN plan_schedules s ON s.plan_id = p.id
         WHERE p.origin = 'copied' AND p.is_active = 1
         LIMIT 1`,
      );
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      const days = await this.getPlanDays(row.plan_id);
      return {
        plan: {
          id: row.plan_id,
          origin: "copied",
          sourceNamespace: "gym-tracker.original",
          upstreamId: "full-body-foundation",
          name: row.plan_name,
          isActive: true,
          revision: row.plan_revision,
        },
        days,
        schedule: {
          id: row.schedule_id,
          mode: row.schedule_mode,
          startLocalDate: row.start_local_date,
          timezone: row.timezone,
          cycleLengthWeeks: row.cycle_length_weeks,
        },
      };
    },

    async getPlanDays(planId: string): Promise<readonly ActivatedPlanDay[]> {
      return kernel.queryAll<{
        id: string;
        name: "Full Body A" | "Full Body B";
        ordinal: number;
      }>(
        "SELECT id, name, ordinal FROM plan_days WHERE plan_id = ? ORDER BY ordinal",
        [planId],
      );
    },
  });
}
