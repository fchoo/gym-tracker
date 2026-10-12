import type { PlannedStrengthOccurrenceDetail } from "../../../domains/workout";
import type { SqliteReadTransactionExecutor, SqliteTransactionExecutor } from "../sqliteKernel";

const SNAPSHOT_EVENT_TYPE = "planned_occurrence_snapshot";

type SourceRow = Readonly<{
  occurrence_id: string;
  opportunity_revision: number;
  plan_id: string;
  plan_name: string;
  plan_revision: number;
  plan_day_id: string;
  day_name: string;
  day_revision: number;
  schedule_id: string;
  schedule_version_id: string;
  schedule_revision: number;
  local_date: string;
  timezone: string;
}>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

export function parseStrengthOccurrenceSnapshot(
  value: string,
): PlannedStrengthOccurrenceDetail | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const snapshot = parsed as PlannedStrengthOccurrenceDetail;
  if (!snapshot || typeof snapshot !== "object"
    || !validText(snapshot.occurrenceId)
    || !validText(snapshot.planId)
    || !validText(snapshot.planName)
    || !validText(snapshot.planDayId)
    || !validText(snapshot.dayName)
    || !validText(snapshot.scheduleId)
    || !validText(snapshot.scheduleVersionId)
    || !validText(snapshot.localDate)
    || !validText(snapshot.timezone)
    || !validRevision(snapshot.sourceRevisions?.plan)
    || !validRevision(snapshot.sourceRevisions?.day)
    || !validRevision(snapshot.sourceRevisions?.schedule)
    || !validRevision(snapshot.sourceRevisions?.opportunity)
    || !Array.isArray(snapshot.exercises)
    || snapshot.exercises.length === 0
    || snapshot.exercises.some((exercise) => !validText(exercise.id)
      || !validText(exercise.exerciseId)
      || !validText(exercise.exerciseName)
      || !Number.isSafeInteger(exercise.ordinal)
      || exercise.ordinal < 0
      || !Array.isArray(exercise.targets)
      || exercise.targets.length === 0
      || exercise.targets.some((target) => !validText(target.id)
        || !Number.isSafeInteger(target.ordinal)
        || target.ordinal < 0
        || !validText(target.targetJson)
        || typeof target.unitJson !== "string"
        || (target.previousObservationJson !== null
          && typeof target.previousObservationJson !== "string")))) return null;
  return deepFreeze(snapshot);
}

async function previousObservation(
  executor: SqliteReadTransactionExecutor,
  input: Readonly<{
    exerciseId: string;
    metricProfile: string;
    metricContractVersion: number;
    exerciseMetricGeneration: number;
    ordinal: number;
  }>,
): Promise<string | null> {
  const [row] = await executor.queryAll<{ observed_json: string }>(
    `SELECT set_row.observed_json
       FROM workout_sessions session
       JOIN session_exercises exercise ON exercise.session_id = session.id
       JOIN session_sets set_row ON set_row.session_exercise_id = exercise.id
      WHERE session.status IN ('completed', 'partial')
        AND exercise.exercise_id = ?
        AND exercise.metric_profile = ?
        AND exercise.metric_contract_version = ?
        AND exercise.exercise_metric_generation = ?
        AND set_row.metric_profile = exercise.metric_profile
        AND set_row.metric_contract_version = exercise.metric_contract_version
        AND set_row.exercise_metric_generation = exercise.exercise_metric_generation
        AND set_row.set_kind = 'working'
        AND set_row.status = 'completed'
        AND set_row.observed_json IS NOT NULL
      ORDER BY COALESCE(session.completed_at_ms, session.started_at_ms) DESC,
               CASE WHEN set_row.ordinal = ? THEN 0 ELSE 1 END,
               set_row.ordinal, set_row.id
      LIMIT 1`,
    [
      input.exerciseId,
      input.metricProfile,
      input.metricContractVersion,
      input.exerciseMetricGeneration,
      input.ordinal,
    ],
  );
  if (row === undefined) return null;
  try {
    JSON.parse(row.observed_json);
    return row.observed_json;
  } catch {
    return null;
  }
}

export async function captureStrengthOccurrenceSnapshot(
  transaction: SqliteTransactionExecutor,
  occurrenceId: string,
  createdAtMs: number,
): Promise<boolean> {
  const [existing] = await transaction.queryAll<{ payload_json: string }>(
    `SELECT payload_json FROM owned_plan_schedule_events
      WHERE event_type = ? AND json_extract(payload_json, '$.occurrenceId') = ?
      ORDER BY created_at_ms DESC, id DESC LIMIT 1`,
    [SNAPSHOT_EVENT_TYPE, occurrenceId],
  );
  if (existing !== undefined) return parseStrengthOccurrenceSnapshot(existing.payload_json) !== null;
  const [source] = await transaction.queryAll<SourceRow>(
    `SELECT opportunity.id AS occurrence_id,
            opportunity.revision AS opportunity_revision,
            plan.id AS plan_id, plan.name AS plan_name, plan.revision AS plan_revision,
            day.id AS plan_day_id, day.name AS day_name, day.revision AS day_revision,
            schedule.id AS schedule_id, version.id AS schedule_version_id,
            schedule.revision AS schedule_revision,
            opportunity.local_date, version.timezone
       FROM owned_plan_schedule_opportunities opportunity
       JOIN owned_plan_schedules schedule ON schedule.id = opportunity.schedule_id
       JOIN owned_plan_schedule_versions version
         ON version.id = opportunity.schedule_version_id
        AND version.schedule_id = schedule.id
       JOIN plans plan ON plan.id = schedule.plan_id
       JOIN plan_days day ON day.id = opportunity.plan_day_id AND day.plan_id = plan.id
      WHERE opportunity.id = ? AND opportunity.state = 'pending'
        AND plan.plan_kind = 'strength' AND schedule.plan_kind = 'strength'`,
    [occurrenceId],
  );
  if (source === undefined) return false;
  const exercises = await transaction.queryAll<{
    id: string;
    exercise_id: string;
    exercise_name: string;
    ordinal: number;
    metric_profile: string;
    metric_contract_version: number;
    exercise_metric_generation: number;
  }>(
    `SELECT planned.id, planned.exercise_id,
            COALESCE(exercise.name, library.canonical_name) AS exercise_name,
            planned.ordinal, planned.metric_profile, planned.metric_contract_version,
            planned.exercise_metric_generation
       FROM owned_plan_day_exercises planned
       JOIN exercise_library_entries library ON library.exercise_id = planned.exercise_id
       LEFT JOIN exercises exercise ON exercise.id = planned.exercise_id
      WHERE planned.plan_day_id = ?
      ORDER BY planned.ordinal, planned.id`,
    [source.plan_day_id],
  );
  if (exercises.length === 0) return false;
  const mapped = await Promise.all(exercises.map(async (exercise) => {
    const targets = await transaction.queryAll<{
      id: string;
      ordinal: number;
      target_json: string;
      unit_json: string;
    }>(
      `SELECT id, ordinal, target_json, unit_json
         FROM owned_plan_working_set_targets
        WHERE plan_day_exercise_id = ?
        ORDER BY ordinal, id`,
      [exercise.id],
    );
    if (targets.length === 0) return null;
    return {
      id: exercise.id,
      exerciseId: exercise.exercise_id,
      exerciseName: exercise.exercise_name,
      ordinal: exercise.ordinal,
      targets: await Promise.all(targets.map(async (target) => ({
        id: target.id,
        ordinal: target.ordinal,
        targetJson: target.target_json,
        unitJson: target.unit_json,
        previousObservationJson: await previousObservation(transaction, {
          exerciseId: exercise.exercise_id,
          metricProfile: exercise.metric_profile,
          metricContractVersion: exercise.metric_contract_version,
          exerciseMetricGeneration: exercise.exercise_metric_generation,
          ordinal: target.ordinal,
        }),
      }))),
    };
  }));
  if (mapped.some((exercise) => exercise === null)) return false;
  const snapshot: PlannedStrengthOccurrenceDetail = {
    occurrenceId: source.occurrence_id,
    planId: source.plan_id,
    planName: source.plan_name,
    planDayId: source.plan_day_id,
    dayName: source.day_name,
    scheduleId: source.schedule_id,
    scheduleVersionId: source.schedule_version_id,
    localDate: source.local_date,
    timezone: source.timezone,
    sourceRevisions: {
      plan: source.plan_revision,
      day: source.day_revision,
      schedule: source.schedule_revision,
      opportunity: source.opportunity_revision,
    },
    exercises: mapped as PlannedStrengthOccurrenceDetail["exercises"],
  };
  const inserted = await transaction.execute(
    `INSERT OR IGNORE INTO owned_plan_schedule_events
      (id, schedule_id, event_type, local_date, payload_json, schedule_revision, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      `${occurrenceId}:planned-snapshot`,
      source.schedule_id,
      SNAPSHOT_EVENT_TYPE,
      source.local_date,
      JSON.stringify(snapshot),
      source.schedule_revision,
      createdAtMs,
    ],
  );
  return inserted.changes === 1;
}

export async function loadStrengthOccurrenceSnapshot(
  executor: SqliteReadTransactionExecutor,
  occurrenceId: string,
): Promise<PlannedStrengthOccurrenceDetail | null> {
  const [row] = await executor.queryAll<{
    payload_json: string;
    opportunity_revision: number;
    plan_revision: number;
    day_revision: number;
    schedule_revision: number;
    plan_active: number;
    schedule_lifecycle: string;
  }>(
    `SELECT event.payload_json, opportunity.revision AS opportunity_revision,
            plan.revision AS plan_revision, day.revision AS day_revision,
            schedule.revision AS schedule_revision, plan.is_active AS plan_active,
            schedule.lifecycle AS schedule_lifecycle
       FROM owned_plan_schedule_opportunities opportunity
       JOIN owned_plan_schedules schedule ON schedule.id = opportunity.schedule_id
       JOIN plans plan ON plan.id = schedule.plan_id
       JOIN plan_days day ON day.id = opportunity.plan_day_id AND day.plan_id = plan.id
       JOIN owned_plan_schedule_events event
         ON event.schedule_id = schedule.id
        AND event.event_type = ?
        AND json_extract(event.payload_json, '$.occurrenceId') = opportunity.id
      WHERE opportunity.id = ? AND opportunity.state = 'pending'
        AND plan.plan_kind = 'strength' AND schedule.plan_kind = 'strength'
      ORDER BY event.created_at_ms DESC, event.id DESC LIMIT 1`,
    [SNAPSHOT_EVENT_TYPE, occurrenceId],
  );
  if (row === undefined || row.plan_active !== 1 || row.schedule_lifecycle !== "active") return null;
  const snapshot = parseStrengthOccurrenceSnapshot(row.payload_json);
  if (snapshot === null
    || snapshot.occurrenceId !== occurrenceId
    || snapshot.sourceRevisions.plan !== row.plan_revision
    || snapshot.sourceRevisions.day !== row.day_revision
    || snapshot.sourceRevisions.schedule !== row.schedule_revision
    || snapshot.sourceRevisions.opportunity !== row.opportunity_revision) return null;
  return snapshot;
}
