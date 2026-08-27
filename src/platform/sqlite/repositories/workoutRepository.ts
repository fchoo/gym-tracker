import type {
  ActiveWorkoutExercise,
  ActiveWorkoutRepository,
  ActiveWorkoutRestState,
  ActiveWorkoutSet,
  ActiveWorkoutSetStatus,
  ActiveWorkoutView,
  CompleteSetInput,
  SetObservation,
  SetTarget,
  SetValueSource,
  WorkoutSessionView,
  WorkingSetValueSource,
} from "../../../domains/workout/activeWorkout";
import {
  WorkoutCommandConflictError,
} from "../../../domains/workout/activeWorkout";
import {
  parseMetricIdentity,
  parseMetricObservation,
  parseMetricTarget,
  type MetricIdentity,
  type MetricProfile,
} from "../../../domains/metrics";
import {
  enqueuePendingEffect,
} from "../effects/effectStore";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

type QueryExecutor = Pick<SqliteTransactionExecutor, "queryAll">;

type SessionRow = Readonly<{
  id: string;
  status: string;
  active_session_exercise_id: string | null;
  active_set_id: string | null;
  revision: number;
}>;

type ExerciseRow = Readonly<{
  id: string;
  exercise_id: string;
  ordinal: number;
  exercise_name: string;
  metric_profile: MetricProfile;
  metric_contract_version?: number;
  exercise_metric_generation?: number;
  default_rest_seconds: number;
  status: "planned" | "active" | "completed" | "skipped";
  revision: number;
}>;

type SetRow = Readonly<{
  id: string;
  session_exercise_id: string;
  set_kind: "warmup" | "working";
  ordinal: number;
  source_plan_working_set_target_id: string | null;
  source_owned_plan_working_set_target_id?: string | null;
  target_load_grams: number;
  target_min_reps: number;
  target_max_reps: number;
  target_json: string;
  metric_profile?: MetricProfile;
  metric_contract_version?: number;
  exercise_metric_generation?: number;
  observed_load_grams: number | null;
  observed_reps: number | null;
  observed_json: string | null;
  status: ActiveWorkoutSetStatus;
  draft_updated_at_ms: number | null;
  completed_at_ms: number | null;
  completion_idempotency_key: string | null;
  revision: number;
}>;

type RestRow = Readonly<{
  state_version: 1;
  status: "idle" | "running" | "paused" | "expired";
  started_at_ms: number | null;
  ends_at_ms: number | null;
  remaining_ms: number | null;
  expired_at_ms: number | null;
  next_set_id: string | null;
  revision: number;
}>;

type CompletionSetRow = SetRow & Readonly<{
  exercise_id: string;
  exercise_metric_profile: MetricProfile;
  exercise_metric_contract_version?: number;
  exercise_metric_generation?: number;
  exercise_status: "planned" | "active" | "completed" | "skipped";
  exercise_revision: number;
  source_plan_day_exercise_id: string | null;
  default_rest_seconds: number;
}>;

type SnapshotV1 = Readonly<{
  version: 1;
  session: Readonly<{
    activeExerciseId: string | null;
    activeSetId: string | null;
  }>;
  set: Readonly<{
    status: ActiveWorkoutSetStatus;
    observedLoadGrams: number | null;
    observedReps: number | null;
    observedJson: string | null;
    draftUpdatedAtMs: number | null;
    completedAtMs: number | null;
    completionIdempotencyKey: string | null;
  }>;
  exercises: readonly Readonly<{
    id: string;
    status: "planned" | "active" | "completed" | "skipped";
  }>[];
  rest: RestRow | null;
}>;

function parseJson(value: string, code: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(code);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(code);
  }
  return parsed as Record<string, unknown>;
}

function requiredInteger(
  record: Record<string, unknown>,
  key: string,
  code: string,
): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(code);
  }
  return Number(value);
}

function metricIdentity(
  input: Readonly<{
    profile: MetricProfile;
    contractVersion: number | undefined;
    exerciseMetricGeneration: number | undefined;
  }>,
): MetricIdentity {
  return parseMetricIdentity({
    profile: input.profile,
    contractVersion: input.contractVersion ?? 1,
    exerciseMetricGeneration: input.exerciseMetricGeneration ?? 1,
  });
}

function exerciseIdentity(exercise: ExerciseRow): MetricIdentity {
  return metricIdentity({
    profile: exercise.metric_profile,
    contractVersion: exercise.metric_contract_version,
    exerciseMetricGeneration: exercise.exercise_metric_generation,
  });
}

function setIdentity(row: SetRow, exercise: ExerciseRow): MetricIdentity {
  const identity = metricIdentity({
    profile: row.metric_profile ?? exercise.metric_profile,
    contractVersion:
      row.metric_contract_version ?? exercise.metric_contract_version,
    exerciseMetricGeneration:
      row.exercise_metric_generation ?? exercise.exercise_metric_generation,
  });
  const expected = exerciseIdentity(exercise);
  if (
    identity.profile !== expected.profile
    || identity.contractVersion !== expected.contractVersion
    || identity.exerciseMetricGeneration !== expected.exerciseMetricGeneration
  ) {
    throw new Error("active_workout_metric_identity_mismatch");
  }
  return identity;
}

function parseTarget(
  row: SetRow,
  identity: MetricIdentity,
): SetTarget {
  const target = parseJson(row.target_json, "active_workout_target_invalid");
  const normalized = identity.profile === "load_reps"
    ? (() => {
        const targetReps = Array.isArray(target.targetReps)
          ? target.targetReps
          : null;
        const repAim = targetReps?.[row.ordinal];
        return {
          version: identity.contractVersion,
          profile: identity.profile,
          loadGrams: requiredInteger(
            target,
            "loadGrams",
            "active_workout_target_invalid",
          ),
          minReps: requiredInteger(
            target,
            "minReps",
            "active_workout_target_invalid",
          ),
          maxReps: requiredInteger(
            repAim === undefined ? target : { repAim },
            repAim === undefined ? "maxReps" : "repAim",
            "active_workout_target_invalid",
          ),
          incrementGrams: target.incrementGrams === undefined
            ? 1_000
            : requiredInteger(
                target,
                "incrementGrams",
                "active_workout_target_invalid",
              ),
          perSide: target.perSide === true,
        };
      })()
    : target;
  try {
    return parseMetricTarget(identity, normalized);
  } catch {
    throw new Error("active_workout_target_invalid");
  }
}

function parseObservation(
  value: string | null,
  identity: MetricIdentity,
  source?: WorkingSetValueSource,
): SetObservation | null {
  if (value === null) {
    return null;
  }
  const observation = parseJson(value, "active_workout_observation_invalid");
  const resolvedSource = source ?? observation.source;
  if (
    ![
      "recommended",
      "last_workout",
      "plan_default",
      "manual",
    ].includes(String(resolvedSource))
  ) {
    throw new Error("active_workout_observation_source_invalid");
  }
  try {
    return parseMetricObservation(identity, {
      ...observation,
      source: resolvedSource,
    });
  } catch {
    throw new Error("active_workout_observation_invalid");
  }
}

function targetObservation(
  target: SetTarget,
  source: WorkingSetValueSource,
): SetObservation | null {
  switch (target.profile) {
    case "load_reps":
      return {
        version: 1,
        profile: "load_reps",
        loadGrams: target.loadGrams,
        reps: target.maxReps,
        source,
      };
    case "bodyweight_reps":
      return {
        version: target.version,
        profile: target.profile,
        reps: target.maxReps,
        source,
      };
    case "added_load_reps":
      return {
        version: target.version,
        profile: target.profile,
        addedLoadGrams: target.addedLoadGrams,
        reps: target.maxReps,
        source,
      };
    case "assisted_reps":
      return {
        version: target.version,
        profile: target.profile,
        assistanceGrams: target.assistanceGrams,
        reps: target.maxReps,
        source,
      };
    case "timed_hold":
      return target.version === 1
        ? {
            version: 1,
            profile: target.profile,
            durationSeconds: target.durationSeconds,
            source,
          }
        : {
            version: 2,
            profile: target.profile,
            durationMs: target.durationMs,
            source,
          };
    case "fixed_distance":
      return null;
    case "fixed_time":
      return {
        version: target.version,
        profile: target.profile,
        durationMs: target.plannedDurationMs,
        distanceMeters: 0,
        source,
      };
    case "intervals":
      return {
        version: target.version,
        profile: target.profile,
        protocolId: target.protocolId,
        completedRounds: 0,
        completedWorkMs: 0,
        source,
      };
    case "unscored":
      return {
        version: target.version,
        profile: target.profile,
        completed: false,
        source,
      };
  }
}

function requiredTargetObservation(
  target: SetTarget,
  source: WorkingSetValueSource,
  code: string,
): SetObservation {
  const observation = targetObservation(target, source);
  if (observation === null) {
    throw new Error(code);
  }
  return observation;
}

function proposedObservation(
  json: string,
  identity: MetricIdentity,
  ordinal: number,
): SetObservation {
  if (identity.profile === "load_reps") {
    const proposed = parseJson(json, "recommended_values_invalid");
    const targetReps = Array.isArray(proposed.targetReps)
      ? proposed.targetReps
      : null;
    const repAim = targetReps?.[ordinal];
    const repsRecord = repAim === undefined ? proposed : { repAim };
    const repsKey = repAim === undefined
      ? proposed.reps === undefined ? "maxReps" : "reps"
      : "repAim";
    try {
      return parseMetricObservation(identity, {
        version: 1,
        profile: "load_reps",
        loadGrams: requiredInteger(
          proposed,
          "loadGrams",
          "recommended_values_invalid",
        ),
        reps: requiredInteger(
          repsRecord,
          repsKey,
          "recommended_values_invalid",
        ),
        source: "recommended",
      });
    } catch {
      throw new Error("recommended_values_invalid");
    }
  }
  const row = {
    ordinal,
    target_json: json,
  } as SetRow;
  return requiredTargetObservation(
    parseTarget(row, identity),
    "recommended",
    "recommended_values_invalid",
  );
}

function sameMetricIdentity(
  left: MetricIdentity,
  right: MetricIdentity,
): boolean {
  return left.profile === right.profile
    && left.contractVersion === right.contractVersion
    && left.exerciseMetricGeneration === right.exerciseMetricGeneration;
}

async function supportsCompleteMetricIdentity(
  executor: QueryExecutor,
): Promise<boolean> {
  const columns = await executor.queryAll<{ name: string }>(
    "PRAGMA table_info(session_exercises)",
  );
  const names = new Set(columns.map(({ name }) => name));
  return names.has("metric_contract_version")
    && names.has("exercise_metric_generation");
}

async function supportsOwnedTargetSnapshots(
  executor: QueryExecutor,
): Promise<boolean> {
  const columns = await executor.queryAll<{ name: string }>(
    "PRAGMA table_info(session_sets)",
  );
  return columns.some(({ name }) =>
    name === "source_owned_plan_working_set_target_id"
  );
}

async function valueSources(
  executor: QueryExecutor,
  sessionId: string,
  exercise: ExerciseRow,
  set: SetRow,
  identity: MetricIdentity,
  target: SetTarget,
  completeIdentity: boolean,
): Promise<readonly SetValueSource[]> {
  const result: SetValueSource[] = [];
  const recommendationTarget = set.source_plan_working_set_target_id !== null
    ? {
        column: "plan_working_set_target_id",
        id: set.source_plan_working_set_target_id,
        table: "progression_recommendations",
      }
    : set.source_owned_plan_working_set_target_id == null
      ? null
      : {
          column: "owned_plan_working_set_target_id",
          id: set.source_owned_plan_working_set_target_id,
          table: "owned_progression_recommendations",
        };
  if (recommendationTarget !== null) {
    const recommendationIdentityClause = completeIdentity
      ? ` AND metric_profile = ?
          AND metric_contract_version = ?
          AND exercise_metric_generation = ?`
      : "";
    const recommendationParameters = completeIdentity
      ? [
          recommendationTarget.id,
          identity.profile,
          identity.contractVersion,
          identity.exerciseMetricGeneration,
        ]
      : [recommendationTarget.id];
    const [recommendation] = await executor.queryAll<{
      proposed_target_json: string;
    }>(
      `SELECT proposed_target_json
       FROM ${recommendationTarget.table}
       WHERE ${recommendationTarget.column} = ?
         AND status = 'pending'
         ${recommendationIdentityClause}
       ORDER BY created_at_ms DESC, id DESC
       LIMIT 1`,
      recommendationParameters,
    );
    if (recommendation !== undefined) {
      result.push({
        source: "recommended",
        observation: proposedObservation(
          recommendation.proposed_target_json,
          identity,
          set.ordinal,
        ),
      });
    }
  }

  const historyIdentityClause = completeIdentity
    ? ` AND se.metric_contract_version = ?
        AND se.exercise_metric_generation = ?
        AND ss.metric_profile = se.metric_profile
        AND ss.metric_contract_version = se.metric_contract_version
        AND ss.exercise_metric_generation = se.exercise_metric_generation`
    : "";
  const historyParameters = completeIdentity
    ? [
        sessionId,
        exercise.exercise_id,
        identity.profile,
        identity.contractVersion,
        identity.exerciseMetricGeneration,
        set.ordinal,
      ]
    : [sessionId, exercise.exercise_id, identity.profile, set.ordinal];
  const [history] = await executor.queryAll<{ observed_json: string }>(
    `SELECT ss.observed_json
     FROM workout_sessions ws
     JOIN session_exercises se ON se.session_id = ws.id
     JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE ws.id <> ?
       AND ws.status IN ('completed', 'partial')
       AND se.exercise_id = ?
       AND se.metric_profile = ?
       ${historyIdentityClause}
       AND ss.set_kind = 'working'
       AND ss.status = 'completed'
       AND ss.observed_json IS NOT NULL
     ORDER BY COALESCE(ws.completed_at_ms, ws.started_at_ms) DESC,
              CASE WHEN ss.ordinal = ? THEN 0 ELSE 1 END,
              ss.ordinal,
              ss.id
     LIMIT 1`,
    historyParameters,
  );
  if (history !== undefined) {
    const observation = parseObservation(
      history.observed_json,
      identity,
      "last_workout",
    );
    if (observation !== null) {
      result.push({ source: "last_workout", observation });
    }
  }

  const planDefault = targetObservation(target, "plan_default");
  if (planDefault !== null) {
    result.push({
      source: "plan_default",
      observation: planDefault,
    });
  }
  const manual = targetObservation(target, "manual");
  if (manual !== null) {
    result.push({
      source: "manual",
      observation: manual,
    });
  }
  return result;
}

function toRestState(row: RestRow | undefined): ActiveWorkoutRestState {
  if (row === undefined || row.status === "idle") {
    return {
      version: 1,
      state: "idle",
      revision: row?.revision ?? 0,
      nextSetId: row?.next_set_id ?? null,
    };
  }
  if (row.status === "running") {
    return {
      version: 1,
      state: "running",
      revision: row.revision,
      startedAtMs: row.started_at_ms!,
      endsAtMs: row.ends_at_ms!,
      nextSetId: row.next_set_id,
    };
  }
  if (row.status === "paused") {
    return {
      version: 1,
      state: "paused",
      revision: row.revision,
      remainingMs: row.remaining_ms!,
      nextSetId: row.next_set_id,
    };
  }
  return {
    version: 1,
    state: "expired",
    revision: row.revision,
    expiredAtMs: row.expired_at_ms!,
    nextSetId: row.next_set_id,
  };
}

async function loadActiveWorkout(
  executor: QueryExecutor,
  sessionId: string,
): Promise<WorkoutSessionView> {
  const completeIdentity = await supportsCompleteMetricIdentity(executor);
  const ownedTargetSnapshots = await supportsOwnedTargetSnapshots(executor);
  const [session] = await executor.queryAll<SessionRow>(
    `SELECT id, status, active_session_exercise_id, active_set_id, revision
     FROM workout_sessions
     WHERE id = ?`,
    [sessionId],
  );
  if (session === undefined || session.status !== "in_progress") {
    throw new WorkoutCommandConflictError("active_workout_not_found");
  }

  const exerciseRows = await executor.queryAll<ExerciseRow>(
    `SELECT id, exercise_id, ordinal, exercise_name, metric_profile,
            ${completeIdentity
              ? "metric_contract_version, exercise_metric_generation,"
              : ""}
            default_rest_seconds, status, revision
     FROM session_exercises
     WHERE session_id = ?
     ORDER BY ordinal`,
    [sessionId],
  );
  const setRows = await executor.queryAll<SetRow>(
    `SELECT ss.id, ss.session_exercise_id, ss.set_kind, ss.ordinal,
            ss.source_plan_working_set_target_id, ss.target_load_grams,
            ${ownedTargetSnapshots
              ? "ss.source_owned_plan_working_set_target_id,"
              : ""}
            ss.target_min_reps, ss.target_max_reps, ss.target_json,
            ${completeIdentity
              ? `ss.metric_profile, ss.metric_contract_version,
                 ss.exercise_metric_generation,`
              : ""}
            ss.observed_load_grams, ss.observed_reps, ss.observed_json,
            ss.status, ss.draft_updated_at_ms, ss.completed_at_ms,
            ss.completion_idempotency_key, ss.revision
     FROM session_sets ss
     JOIN session_exercises se ON se.id = ss.session_exercise_id
     WHERE se.session_id = ?
     ORDER BY se.ordinal,
              CASE ss.set_kind WHEN 'warmup' THEN 0 ELSE 1 END,
              ss.ordinal`,
    [sessionId],
  );
  const exercises: ActiveWorkoutExercise[] = [];
  for (const exercise of exerciseRows) {
    const rows = setRows.filter(
      ({ session_exercise_id }) => session_exercise_id === exercise.id,
    );
    const sets: ActiveWorkoutSet[] = [];
    for (const row of rows) {
      const identity = setIdentity(row, exercise);
      const target = parseTarget(row, identity);
      sets.push({
        id: row.id,
        kind: row.set_kind,
        ordinal: row.ordinal,
        sourceTargetId: row.source_plan_working_set_target_id
          ?? row.source_owned_plan_working_set_target_id
          ?? null,
        metricIdentity: identity,
        target,
        observation: parseObservation(row.observed_json, identity),
        status: row.status,
        completedAtMs: row.completed_at_ms,
        revision: row.revision,
        valueSources: row.set_kind === "working"
          ? await valueSources(
              executor,
              sessionId,
              exercise,
              row,
              identity,
              target,
              completeIdentity,
            )
          : [],
      });
    }
    const identity = exerciseIdentity(exercise);
    exercises.push({
      id: exercise.id,
      exerciseId: exercise.exercise_id,
      name: exercise.exercise_name,
      metricIdentity: identity,
      metricProfile: exercise.metric_profile,
      ordinal: exercise.ordinal,
      defaultRestSeconds: exercise.default_rest_seconds,
      status: exercise.status,
      revision: exercise.revision,
      warmups: sets.filter(({ kind }) => kind === "warmup"),
      workingSets: sets.filter(({ kind }) => kind === "working"),
    });
  }

  const currentExercise = exercises.find(
    ({ id }) => id === session.active_session_exercise_id,
  ) ?? exercises.find(({ status }) => status !== "completed")
    ?? exercises.at(-1);
  const [rest] = await executor.queryAll<RestRow>(
    `SELECT state_version, status, started_at_ms, ends_at_ms, remaining_ms,
            expired_at_ms, next_set_id, revision
     FROM session_rest_states
     WHERE session_id = ?`,
    [sessionId],
  );
  if (
    exercises.length === 0
    && session.active_session_exercise_id === null
    && session.active_set_id === null
  ) {
    return {
      state: "empty_workout",
      id: session.id,
      status: "in_progress",
      revision: session.revision,
      activeSetId: null,
      activeExerciseId: null,
      progress: {
        completedWorkingSets: 0,
        totalWorkingSets: 0,
      },
      rest: toRestState(rest),
    };
  }
  if (currentExercise === undefined) {
    throw new WorkoutCommandConflictError("active_workout_exercise_missing");
  }
  const workingSets = exercises.flatMap(({ workingSets }) => workingSets);
  return {
    id: session.id,
    status: "in_progress",
    revision: session.revision,
    activeSetId: session.active_set_id,
    activeExerciseId: session.active_session_exercise_id,
    currentExercise,
    exercises,
    progress: {
      completedWorkingSets: workingSets.filter(
        ({ status }) => status === "completed",
      ).length,
      totalWorkingSets: workingSets.length,
    },
    rest: toRestState(rest),
  };
}

async function loadPlannedWorkout(
  executor: QueryExecutor,
  sessionId: string,
): Promise<ActiveWorkoutView> {
  const view = await loadActiveWorkout(executor, sessionId);
  if ("state" in view) {
    throw new WorkoutCommandConflictError("active_workout_exercise_missing");
  }
  return view;
}

function observationColumns(observation: SetObservation): Readonly<{
  loadGrams: number | null;
  reps: number | null;
  json: string;
}> {
  const loadGrams = observation.profile === "load_reps"
    ? observation.loadGrams
    : null;
  const reps = [
    "load_reps",
    "bodyweight_reps",
    "added_load_reps",
    "assisted_reps",
  ].includes(observation.profile)
    ? (observation as Extract<
        SetObservation,
        {
          profile:
            | "load_reps"
            | "bodyweight_reps"
            | "added_load_reps"
            | "assisted_reps";
        }
      >).reps
    : null;
  return {
    loadGrams,
    reps,
    json: JSON.stringify(observation),
  };
}

async function incrementSessionRevision(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
): Promise<void> {
  const result = await transaction.execute(
    `UPDATE workout_sessions
     SET revision = revision + 1
     WHERE id = ? AND status = 'in_progress'`,
    [sessionId],
  );
  if (result.changes !== 1) {
    throw new Error("active_workout_session_update_failed");
  }
}

function loadRepsTargetJson(
  loadGrams: number,
  reps: number,
  incrementGrams = 1_000,
): string {
  return JSON.stringify({
    version: 1,
    profile: "load_reps",
    loadGrams,
    minReps: reps,
    maxReps: reps,
    incrementGrams,
    perSide: false,
  });
}

async function nextWarmupOrdinal(
  transaction: SqliteTransactionExecutor,
  sessionExerciseId: string,
): Promise<number> {
  const [row] = await transaction.queryAll<{ next_ordinal: number }>(
    `SELECT COALESCE(MAX(ordinal), -1) + 1 AS next_ordinal
     FROM session_sets
     WHERE session_exercise_id = ? AND set_kind = 'warmup'`,
    [sessionExerciseId],
  );
  return row?.next_ordinal ?? 0;
}

async function nextWorkingOrdinal(
  transaction: SqliteTransactionExecutor,
  sessionExerciseId: string,
): Promise<number> {
  const [row] = await transaction.queryAll<{ next_ordinal: number }>(
    `SELECT COALESCE(MAX(ordinal), -1) + 1 AS next_ordinal
     FROM session_sets
     WHERE session_exercise_id = ? AND set_kind = 'working'`,
    [sessionExerciseId],
  );
  return row?.next_ordinal ?? 0;
}

async function restRow(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
): Promise<RestRow | null> {
  const [rest] = await transaction.queryAll<RestRow>(
    `SELECT state_version, status, started_at_ms, ends_at_ms, remaining_ms,
            expired_at_ms, next_set_id, revision
     FROM session_rest_states
     WHERE session_id = ?`,
    [sessionId],
  );
  return rest ?? null;
}

async function completionRows(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  setId: string,
): Promise<Readonly<{
  session: SessionRow;
  set: CompletionSetRow;
}> | null> {
  const [session] = await transaction.queryAll<SessionRow>(
    `SELECT id, status, active_session_exercise_id, active_set_id, revision
     FROM workout_sessions
     WHERE id = ?`,
    [sessionId],
  );
  const completeIdentity = await supportsCompleteMetricIdentity(transaction);
  const [set] = await transaction.queryAll<CompletionSetRow>(
    `SELECT ss.id, ss.session_exercise_id, ss.set_kind, ss.ordinal,
            ss.source_plan_working_set_target_id, ss.target_load_grams,
            ss.target_min_reps, ss.target_max_reps, ss.target_json,
            ss.observed_load_grams, ss.observed_reps, ss.observed_json,
            ss.status, ss.draft_updated_at_ms, ss.completed_at_ms,
            ss.completion_idempotency_key, ss.revision,
            se.exercise_id, se.metric_profile AS exercise_metric_profile,
            ${completeIdentity
              ? `se.metric_contract_version AS
                   exercise_metric_contract_version,
                 se.exercise_metric_generation,`
              : ""}
            se.status AS exercise_status, se.revision AS exercise_revision,
            se.source_plan_day_exercise_id, se.default_rest_seconds
     FROM session_sets ss
     JOIN session_exercises se ON se.id = ss.session_exercise_id
     WHERE ss.id = ? AND se.session_id = ?`,
    [setId, sessionId],
  );
  return session === undefined || set === undefined ? null : { session, set };
}

async function nextWorkingSet(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  completedSetId: string,
): Promise<Readonly<{
  set_id: string;
  exercise_id: string;
  exercise_ordinal: number;
}> | null> {
  const [row] = await transaction.queryAll<{
    set_id: string;
    exercise_id: string;
    exercise_ordinal: number;
  }>(
    `SELECT ss.id AS set_id, se.id AS exercise_id,
            se.ordinal AS exercise_ordinal
     FROM session_exercises se
     JOIN session_sets ss ON ss.session_exercise_id = se.id
     WHERE se.session_id = ?
       AND ss.set_kind = 'working'
       AND ss.id <> ?
       AND ss.status IN ('planned', 'draft')
     ORDER BY se.ordinal, ss.ordinal
     LIMIT 1`,
    [sessionId, completedSetId],
  );
  return row ?? null;
}

async function restDurationSeconds(
  transaction: SqliteTransactionExecutor,
  set: CompletionSetRow,
  next: Awaited<ReturnType<typeof nextWorkingSet>>,
): Promise<number | null> {
  if (next === null) {
    return null;
  }
  if (next.exercise_id === set.session_exercise_id) {
    return set.default_rest_seconds;
  }
  if (set.source_plan_day_exercise_id === null) {
    return set.default_rest_seconds;
  }
  const [row] = await transaction.queryAll<{
    between_exercise_rest_seconds: number | null;
  }>(
    `SELECT between_exercise_rest_seconds
     FROM plan_day_exercises
     WHERE id = ?`,
    [set.source_plan_day_exercise_id],
  );
  return row?.between_exercise_rest_seconds ?? null;
}

function snapshot(
  session: SessionRow,
  set: CompletionSetRow,
  exercises: readonly ExerciseRow[],
  rest: RestRow | null,
): SnapshotV1 {
  return {
    version: 1,
    session: {
      activeExerciseId: session.active_session_exercise_id,
      activeSetId: session.active_set_id,
    },
    set: {
      status: set.status,
      observedLoadGrams: set.observed_load_grams,
      observedReps: set.observed_reps,
      observedJson: set.observed_json,
      draftUpdatedAtMs: set.draft_updated_at_ms,
      completedAtMs: set.completed_at_ms,
      completionIdempotencyKey: set.completion_idempotency_key,
    },
    exercises: exercises.map(({ id, status }) => ({ id, status })),
    rest,
  };
}

function parseSnapshot(value: string): SnapshotV1 {
  const parsed = JSON.parse(value) as SnapshotV1;
  if (parsed.version !== 1) {
    throw new Error("undo_snapshot_version_unsupported");
  }
  return parsed;
}

async function setRunningRest(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    sessionId: string;
    nextSetId: string;
    completedAtMs: number;
    durationSeconds: number;
    priorRevision: number;
  }>,
): Promise<number> {
  const revision = input.priorRevision + 1;
  await transaction.execute(
    `INSERT INTO session_rest_states
      (session_id, state_version, status, started_at_ms, ends_at_ms,
       remaining_ms, expired_at_ms, next_set_id, revision)
     VALUES (?, 1, 'running', ?, ?, NULL, NULL, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       state_version = 1,
       status = 'running',
       started_at_ms = excluded.started_at_ms,
       ends_at_ms = excluded.ends_at_ms,
       remaining_ms = NULL,
       expired_at_ms = NULL,
       next_set_id = excluded.next_set_id,
       revision = excluded.revision`,
    [
      input.sessionId,
      input.completedAtMs,
      input.completedAtMs + input.durationSeconds * 1_000,
      input.nextSetId,
      revision,
    ],
  );
  return revision;
}

async function setIdleRest(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
  priorRevision: number,
): Promise<number> {
  const revision = priorRevision + 1;
  await transaction.execute(
    `INSERT INTO session_rest_states
      (session_id, state_version, status, started_at_ms, ends_at_ms,
       remaining_ms, expired_at_ms, next_set_id, revision)
     VALUES (?, 1, 'idle', NULL, NULL, NULL, NULL, NULL, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       state_version = 1,
       status = 'idle',
       started_at_ms = NULL,
       ends_at_ms = NULL,
       remaining_ms = NULL,
       expired_at_ms = NULL,
       next_set_id = NULL,
       revision = excluded.revision`,
    [sessionId, revision],
  );
  return revision;
}

async function enqueueRestReconciliation(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    idempotencyKey: string;
    sessionId: string;
    restRevision: number;
    nowMs: number;
  }>,
): Promise<void> {
  await enqueuePendingEffect(transaction, {
    id: `effect_${input.idempotencyKey}`,
    type: "reconcile_rest_notification",
    payloadVersion: 1,
    payload: {
      version: 1,
      sessionId: input.sessionId,
      restRevision: input.restRevision,
    },
    idempotencyKey: input.idempotencyKey,
    subjectId: input.sessionId,
    expectedRevision: input.restRevision,
    nowMs: input.nowMs,
  });
}

export function createWorkoutRepository(
  kernel: SqliteKernel,
): ActiveWorkoutRepository {
  const repository: ActiveWorkoutRepository = {
    getActiveWorkout: (sessionId: string) =>
      loadPlannedWorkout(kernel, sessionId),

    getWorkoutSession: (sessionId: string) =>
      loadActiveWorkout(kernel, sessionId),

    async updateActiveSetDraft(input) {
      const observation = observationColumns(input.observation);
      const result = await kernel.write(async (transaction) => {
        const completeIdentity = await supportsCompleteMetricIdentity(
          transaction,
        );
        const [persisted] = completeIdentity
          ? await transaction.queryAll<{
              metric_profile: MetricProfile;
              metric_contract_version: number;
              exercise_metric_generation: number;
            }>(
              `SELECT metric_profile, metric_contract_version,
                      exercise_metric_generation
               FROM session_sets
               WHERE id = ? AND session_exercise_id IN (
                 SELECT id FROM session_exercises WHERE session_id = ?
               )`,
              [input.setId, input.sessionId],
            )
          : [{
              metric_profile: input.observation.profile,
              metric_contract_version: 1,
              exercise_metric_generation: 1,
            }];
        if (
          persisted === undefined
          || !sameMetricIdentity(input.metricIdentity, {
            profile: persisted.metric_profile,
            contractVersion: persisted.metric_contract_version,
            exerciseMetricGeneration: persisted.exercise_metric_generation,
          })
          || input.observation.profile !== input.metricIdentity.profile
          || input.observation.version !== input.metricIdentity.contractVersion
        ) {
          return null;
        }
        const update = await transaction.execute(
          `UPDATE session_sets
           SET observed_load_grams = ?,
               observed_reps = ?,
               observed_json = ?,
               status = 'draft',
               draft_updated_at_ms = ?,
               revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND set_kind = 'working'
             AND status IN ('planned', 'draft')
             AND session_exercise_id IN (
               SELECT id FROM session_exercises WHERE session_id = ?
             )`,
          [
            observation.loadGrams,
            observation.reps,
            observation.json,
            input.updatedAtMs,
            input.setId,
            input.expectedSetRevision,
            input.sessionId,
          ],
        );
        if (update.changes !== 1) {
          return null;
        }
        await incrementSessionRevision(transaction, input.sessionId);
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("active_set_draft_conflict");
      }
      return result;
    },

    async updateWarmupDraft(input) {
      const observation = observationColumns(input.observation);
      const result = await kernel.write(async (transaction) => {
        const update = await transaction.execute(
          `UPDATE session_sets
           SET observed_load_grams = ?,
               observed_reps = ?,
               observed_json = ?,
               status = 'draft',
               draft_updated_at_ms = ?,
               revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND set_kind = 'warmup'
             AND status IN ('planned', 'draft')
             AND session_exercise_id IN (
               SELECT id FROM session_exercises WHERE session_id = ?
             )`,
          [
            observation.loadGrams,
            observation.reps,
            observation.json,
            input.updatedAtMs,
            input.setId,
            input.expectedSetRevision,
            input.sessionId,
          ],
        );
        if (update.changes !== 1) {
          return null;
        }
        await incrementSessionRevision(transaction, input.sessionId);
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("warmup_draft_conflict");
      }
      return result;
    },

    async addWarmup(input) {
      const observation = observationColumns(input.observation);
      const result = await kernel.write(async (transaction) => {
        const [exercise] = await transaction.queryAll<ExerciseRow>(
          `SELECT se.id, se.exercise_id, se.ordinal, se.exercise_name,
                  se.metric_profile, se.metric_contract_version,
                  se.exercise_metric_generation, se.default_rest_seconds,
                  se.status, se.revision
           FROM session_exercises se
           JOIN workout_sessions ws ON ws.id = se.session_id
           WHERE se.id = ? AND se.session_id = ? AND ws.status = 'in_progress'`,
          [input.sessionExerciseId, input.sessionId],
        );
        const [existing] = await transaction.queryAll<{ id: string }>(
          "SELECT id FROM session_sets WHERE id = ?",
          [input.setId],
        );
        if (exercise === undefined || existing !== undefined) {
          return null;
        }
        const ordinal = await nextWarmupOrdinal(
          transaction,
          input.sessionExerciseId,
        );
        const identity = exerciseIdentity(exercise);
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal,
             source_plan_working_set_target_id,
             target_load_grams, target_min_reps, target_max_reps,
             target_json, unit_json, rule_type, rule_version,
             metric_profile, metric_contract_version,
             exercise_metric_generation,
             observed_load_grams, observed_reps, observed_json, status,
             draft_updated_at_ms, completed_at_ms,
             completion_idempotency_key, revision)
           VALUES (?, ?, 'warmup', ?, NULL, ?, ?, ?, ?, ?,
                   'load_reps', 1, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, 1)`,
          [
            input.setId,
            input.sessionExerciseId,
            ordinal,
            input.observation.loadGrams,
            input.observation.reps,
            input.observation.reps,
            loadRepsTargetJson(
              input.observation.loadGrams,
              input.observation.reps,
            ),
            JSON.stringify({
              version: 1,
              load: "grams",
              count: "repetitions",
            }),
            identity.profile,
            identity.contractVersion,
            identity.exerciseMetricGeneration,
            observation.loadGrams,
            observation.reps,
            observation.json,
            input.nowMs,
          ],
        );
        await incrementSessionRevision(transaction, input.sessionId);
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("add_warmup_conflict");
      }
      return result;
    },

    async addWorkingSet(input) {
      const result = await kernel.write(async (transaction) => {
        const [source] = await transaction.queryAll<SetRow & Readonly<{
          unit_json: string;
          rule_type: "load_reps" | "manual_hold";
          rule_version: number;
          metric_profile: MetricProfile;
        }>>(
          `SELECT ss.id, ss.session_exercise_id, ss.set_kind, ss.ordinal,
                  ss.source_plan_working_set_target_id, ss.target_load_grams,
                  ss.target_min_reps, ss.target_max_reps, ss.target_json,
                  ss.unit_json, ss.rule_type, ss.rule_version,
                  ss.metric_profile, ss.metric_contract_version,
                  ss.exercise_metric_generation,
                  ss.observed_load_grams, ss.observed_reps, ss.observed_json,
                  ss.status, ss.draft_updated_at_ms, ss.completed_at_ms,
                  ss.completion_idempotency_key, ss.revision,
                  se.metric_profile, se.metric_contract_version,
                  se.exercise_metric_generation
           FROM session_sets ss
           JOIN session_exercises se ON se.id = ss.session_exercise_id
           JOIN workout_sessions ws ON ws.id = se.session_id
           WHERE ss.id = ? AND ss.set_kind = 'working'
             AND se.id = ? AND se.session_id = ?
             AND ws.status = 'in_progress'`,
          [input.sourceSetId, input.sessionExerciseId, input.sessionId],
        );
        const [existing] = await transaction.queryAll<{ id: string }>(
          "SELECT id FROM session_sets WHERE id = ?",
          [input.setId],
        );
        if (source === undefined || existing !== undefined) {
          return null;
        }
        const identity = metricIdentity({
          profile: source.metric_profile,
          contractVersion: source.metric_contract_version,
          exerciseMetricGeneration: source.exercise_metric_generation,
        });
        const target = parseTarget(source, identity);
        const observation = source.observed_json === null
          ? requiredTargetObservation(
              target,
              "manual",
              "add_working_set_values_required",
            )
          : parseObservation(source.observed_json, identity, "manual")
            ?? requiredTargetObservation(
              target,
              "manual",
              "add_working_set_values_required",
            );
        const columns = observationColumns(observation);
        const ordinal = await nextWorkingOrdinal(
          transaction,
          input.sessionExerciseId,
        );
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal,
             source_plan_working_set_target_id,
             target_load_grams, target_min_reps, target_max_reps,
             target_json, unit_json, rule_type, rule_version,
             metric_profile, metric_contract_version,
             exercise_metric_generation,
             observed_load_grams, observed_reps, observed_json, status,
             draft_updated_at_ms, completed_at_ms,
             completion_idempotency_key, revision)
           VALUES (?, ?, 'working', ?, NULL, ?, ?, ?, ?, ?, ?, ?,
                   ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, 1)`,
          [
            input.setId,
            input.sessionExerciseId,
            ordinal,
            source.target_load_grams,
            source.target_min_reps,
            source.target_max_reps,
            source.target_json,
            source.unit_json,
            source.rule_type,
            source.rule_version,
            identity.profile,
            identity.contractVersion,
            identity.exerciseMetricGeneration,
            columns.loadGrams,
            columns.reps,
            columns.json,
            input.nowMs,
          ],
        );
        await incrementSessionRevision(transaction, input.sessionId);
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("add_working_set_conflict");
      }
      return result;
    },

    async copyPreviousWarmup(input) {
      const result = await kernel.write(async (transaction) => {
        const [source] = await transaction.queryAll<SetRow & Readonly<{
          exercise_metric_profile: MetricProfile;
          exercise_metric_contract_version: number;
          exercise_metric_generation: number;
        }>>(
          `SELECT ss.id, ss.session_exercise_id, ss.set_kind, ss.ordinal,
                  ss.source_plan_working_set_target_id, ss.target_load_grams,
                  ss.target_min_reps, ss.target_max_reps, ss.target_json,
                  ss.metric_profile, ss.metric_contract_version,
                  ss.exercise_metric_generation,
                  ss.observed_load_grams, ss.observed_reps, ss.observed_json,
                  ss.status, ss.draft_updated_at_ms, ss.completed_at_ms,
                  ss.completion_idempotency_key, ss.revision,
                  se.metric_profile AS exercise_metric_profile,
                  se.metric_contract_version AS exercise_metric_contract_version,
                  se.exercise_metric_generation AS exercise_metric_generation
           FROM session_sets ss
           JOIN session_exercises se ON se.id = ss.session_exercise_id
           JOIN workout_sessions ws ON ws.id = se.session_id
           WHERE ss.id = ? AND ss.set_kind = 'warmup'
             AND se.session_id = ? AND ws.status = 'in_progress'`,
          [input.sourceSetId, input.sessionId],
        );
        const [existing] = await transaction.queryAll<{ id: string }>(
          "SELECT id FROM session_sets WHERE id = ?",
          [input.setId],
        );
        if (source === undefined || existing !== undefined) {
          return null;
        }
        const observation = source.observed_json === null
          ? {
              version: 1 as const,
              profile: "load_reps" as const,
              loadGrams: source.target_load_grams,
              reps: source.target_max_reps,
              source: "manual" as const,
            }
          : parseObservation(
              source.observed_json,
              metricIdentity({
                profile: source.exercise_metric_profile,
                contractVersion: source.exercise_metric_contract_version,
                exerciseMetricGeneration: source.exercise_metric_generation,
              }),
              "manual",
            );
        if (observation === null || observation.profile !== "load_reps") {
          return null;
        }
        const columns = observationColumns(observation);
        const ordinal = await nextWarmupOrdinal(
          transaction,
          source.session_exercise_id,
        );
        await transaction.execute(
          `INSERT INTO session_sets
            (id, session_exercise_id, set_kind, ordinal,
             source_plan_working_set_target_id,
             target_load_grams, target_min_reps, target_max_reps,
             target_json, unit_json, rule_type, rule_version,
             metric_profile, metric_contract_version,
             exercise_metric_generation,
             observed_load_grams, observed_reps, observed_json, status,
             draft_updated_at_ms, completed_at_ms,
             completion_idempotency_key, revision)
           VALUES (?, ?, 'warmup', ?, NULL, ?, ?, ?, ?, ?,
                   'load_reps', 1, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, 1)`,
          [
            input.setId,
            source.session_exercise_id,
            ordinal,
            observation.loadGrams,
            observation.reps,
            observation.reps,
            loadRepsTargetJson(observation.loadGrams, observation.reps),
            JSON.stringify({
              version: 1,
              load: "grams",
              count: "repetitions",
            }),
            source.exercise_metric_profile,
            source.exercise_metric_contract_version,
            source.exercise_metric_generation,
            columns.loadGrams,
            columns.reps,
            columns.json,
            input.nowMs,
          ],
        );
        await incrementSessionRevision(transaction, input.sessionId);
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("copy_warmup_conflict");
      }
      return result;
    },

    async completeWarmup(input) {
      const result = await kernel.write(async (transaction) => {
        const [set] = await transaction.queryAll<SetRow>(
          `SELECT ss.id, ss.session_exercise_id, ss.set_kind, ss.ordinal,
                  ss.source_plan_working_set_target_id, ss.target_load_grams,
                  ss.target_min_reps, ss.target_max_reps, ss.target_json,
                  ss.observed_load_grams, ss.observed_reps, ss.observed_json,
                  ss.status, ss.draft_updated_at_ms, ss.completed_at_ms,
                  ss.completion_idempotency_key, ss.revision
           FROM session_sets ss
           JOIN session_exercises se ON se.id = ss.session_exercise_id
           WHERE ss.id = ? AND se.session_id = ?
             AND ss.set_kind = 'warmup'`,
          [input.setId, input.sessionId],
        );
        if (
          set === undefined
          || set.revision !== input.expectedSetRevision
          || !["planned", "draft"].includes(set.status)
        ) {
          return null;
        }
        const observation = set.observed_json === null
          ? {
              version: 1 as const,
              profile: "load_reps" as const,
              loadGrams: set.target_load_grams,
              reps: set.target_max_reps,
              source: "plan_default" as const,
            }
          : parseObservation(
              set.observed_json,
              metricIdentity({
                profile: "load_reps",
                contractVersion: 1,
                exerciseMetricGeneration: 1,
              }),
            );
        if (observation === null || observation.profile !== "load_reps") {
          return null;
        }
        const columns = observationColumns(observation);
        await transaction.execute(
          `UPDATE session_sets
           SET observed_load_grams = ?,
               observed_reps = ?,
               observed_json = ?,
               status = 'completed',
               draft_updated_at_ms = COALESCE(draft_updated_at_ms, ?),
               completed_at_ms = ?,
               revision = revision + 1
           WHERE id = ?`,
          [
            columns.loadGrams,
            columns.reps,
            columns.json,
            input.completedAtMs,
            input.completedAtMs,
            input.setId,
          ],
        );
        await incrementSessionRevision(transaction, input.sessionId);
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("complete_warmup_conflict");
      }
      return result;
    },

    async skipWarmup(input) {
      const result = await kernel.write(async (transaction) => {
        const update = await transaction.execute(
          `UPDATE session_sets
           SET status = 'skipped',
               completed_at_ms = ?,
               revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND set_kind = 'warmup'
             AND status IN ('planned', 'draft')
             AND session_exercise_id IN (
               SELECT id FROM session_exercises WHERE session_id = ?
             )`,
          [
            input.skippedAtMs,
            input.setId,
            input.expectedSetRevision,
            input.sessionId,
          ],
        );
        if (update.changes !== 1) {
          return null;
        }
        await incrementSessionRevision(transaction, input.sessionId);
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("skip_warmup_conflict");
      }
      return result;
    },

    async skipWorkingSet(input) {
      const result = await kernel.write(async (transaction) => {
        const rows = await completionRows(
          transaction,
          input.sessionId,
          input.setId,
        );
        if (rows === null) {
          return null;
        }
        const { session, set } = rows;
        if (
          session.status !== "in_progress"
          || session.active_set_id !== set.id
          || session.revision !== input.expectedSessionRevision
          || set.set_kind !== "working"
          || set.revision !== input.expectedSetRevision
          || !["planned", "draft"].includes(set.status)
          || !sameMetricIdentity(input.metricIdentity, {
            profile: set.exercise_metric_profile,
            contractVersion:
              set.exercise_metric_contract_version ?? 1,
            exerciseMetricGeneration:
              set.exercise_metric_generation ?? 1,
          })
        ) {
          return null;
        }
        const next = await nextWorkingSet(
          transaction,
          input.sessionId,
          set.id,
        );
        const setUpdate = await transaction.execute(
          `UPDATE session_sets
           SET status = 'skipped',
               completed_at_ms = ?,
               revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND set_kind = 'working'
             AND status IN ('planned', 'draft')`,
          [input.skippedAtMs, input.setId, input.expectedSetRevision],
        );
        if (setUpdate.changes !== 1) {
          throw new Error("skip_working_set_conditional_update_failed");
        }
        const hasCurrentExerciseWork = next?.exercise_id
          === set.session_exercise_id;
        await transaction.execute(
          `UPDATE session_exercises
           SET status = ?, revision = revision + 1
           WHERE id = ?`,
          [
            hasCurrentExerciseWork ? "active" : "completed",
            set.session_exercise_id,
          ],
        );
        if (
          next !== null
          && next.exercise_id !== set.session_exercise_id
        ) {
          await transaction.execute(
            `UPDATE session_exercises
             SET status = 'active', revision = revision + 1
             WHERE id = ?`,
            [next.exercise_id],
          );
        }
        const sessionUpdate = await transaction.execute(
          `UPDATE workout_sessions
           SET active_session_exercise_id = ?,
               active_set_id = ?,
               revision = revision + 1
           WHERE id = ? AND revision = ? AND status = 'in_progress'`,
          [
            next?.exercise_id ?? set.session_exercise_id,
            next?.set_id ?? null,
            input.sessionId,
            input.expectedSessionRevision,
          ],
        );
        if (sessionUpdate.changes !== 1) {
          throw new Error("skip_working_set_session_update_failed");
        }
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("skip_working_set_conflict");
      }
      return result;
    },

    async completeSet(input) {
      const result = await kernel.write(async (transaction) => {
        const rows = await completionRows(
          transaction,
          input.sessionId,
          input.setId,
        );
        if (rows === null) {
          return { kind: "conflict" as const, code: "complete_set_not_found" };
        }
        const { session, set } = rows;
        if (set.status === "completed") {
          if (
            set.completion_idempotency_key
              !== input.completionIdempotencyKey
            || set.observed_json !== JSON.stringify(input.observation)
            || !sameMetricIdentity(input.metricIdentity, {
              profile: set.exercise_metric_profile,
              contractVersion:
                set.exercise_metric_contract_version ?? 1,
              exerciseMetricGeneration:
                set.exercise_metric_generation ?? 1,
            })
          ) {
            return {
              kind: "conflict" as const,
              code: "complete_set_replay_conflict",
            };
          }
          return {
            kind: "result" as const,
            result: {
              outcome: "already_completed" as const,
              view: await loadPlannedWorkout(transaction, input.sessionId),
            },
          };
        }
        if (
          session.status !== "in_progress"
          || session.active_set_id !== set.id
          || session.revision !== input.expectedSessionRevision
          || set.set_kind !== "working"
          || set.revision !== input.expectedSetRevision
          || !["planned", "draft"].includes(set.status)
          || set.exercise_metric_profile !== input.observation.profile
          || input.observation.version !== input.metricIdentity.contractVersion
          || !sameMetricIdentity(input.metricIdentity, {
            profile: set.exercise_metric_profile,
            contractVersion:
              set.exercise_metric_contract_version ?? 1,
            exerciseMetricGeneration:
              set.exercise_metric_generation ?? 1,
          })
        ) {
          return { kind: "conflict" as const, code: "complete_set_conflict" };
        }

        const exercises = await transaction.queryAll<ExerciseRow>(
          `SELECT id, exercise_id, ordinal, exercise_name, metric_profile,
                  default_rest_seconds, status, revision
           FROM session_exercises
           WHERE session_id = ?
           ORDER BY ordinal`,
          [input.sessionId],
        );
        const priorRest = await restRow(transaction, input.sessionId);
        const prior = snapshot(session, set, exercises, priorRest);
        const next = await nextWorkingSet(
          transaction,
          input.sessionId,
          set.id,
        );
        const durationSeconds = await restDurationSeconds(
          transaction,
          set,
          next,
        );
        const observation = observationColumns(input.observation);
        const setUpdate = await transaction.execute(
          `UPDATE session_sets
           SET observed_load_grams = ?,
               observed_reps = ?,
               observed_json = ?,
               status = 'completed',
               draft_updated_at_ms = COALESCE(draft_updated_at_ms, ?),
               completed_at_ms = ?,
               completion_idempotency_key = ?,
               revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND status IN ('planned', 'draft')`,
          [
            observation.loadGrams,
            observation.reps,
            observation.json,
            input.completedAtMs,
            input.completedAtMs,
            input.completionIdempotencyKey,
            input.setId,
            input.expectedSetRevision,
          ],
        );
        if (setUpdate.changes !== 1) {
          throw new Error("complete_set_conditional_update_failed");
        }

        const hasCurrentExerciseWork = next?.exercise_id
          === set.session_exercise_id;
        await transaction.execute(
          `UPDATE session_exercises
           SET status = ?, revision = revision + 1
           WHERE id = ?`,
          [
            hasCurrentExerciseWork ? "active" : "completed",
            set.session_exercise_id,
          ],
        );
        if (
          next !== null
          && next.exercise_id !== set.session_exercise_id
        ) {
          await transaction.execute(
            `UPDATE session_exercises
             SET status = 'active', revision = revision + 1
             WHERE id = ?`,
            [next.exercise_id],
          );
        }
        const sessionUpdate = await transaction.execute(
          `UPDATE workout_sessions
           SET active_session_exercise_id = ?,
               active_set_id = ?,
               revision = revision + 1
           WHERE id = ? AND revision = ? AND status = 'in_progress'`,
          [
            next?.exercise_id ?? set.session_exercise_id,
            next?.set_id ?? null,
            input.sessionId,
            input.expectedSessionRevision,
          ],
        );
        if (sessionUpdate.changes !== 1) {
          throw new Error("complete_set_session_update_failed");
        }

        const priorRestRevision = priorRest?.revision ?? 0;
        const restRevision = (
          next !== null
          && durationSeconds !== null
          && durationSeconds > 0
        )
          ? await setRunningRest(transaction, {
              sessionId: input.sessionId,
              nextSetId: next.set_id,
              completedAtMs: input.completedAtMs,
              durationSeconds,
              priorRevision: priorRestRevision,
            })
          : await setIdleRest(
              transaction,
              input.sessionId,
              priorRestRevision,
            );

        await transaction.execute(
          `INSERT INTO session_undo_snapshots
            (id, session_id, completed_set_id, idempotency_key,
             snapshot_version, snapshot_json, undo_until_ms,
             consumed_at_ms, created_at_ms)
           VALUES (?, ?, ?, ?, 1, ?, ?, NULL, ?)`,
          [
            `undo_${input.completionIdempotencyKey}`,
            input.sessionId,
            input.setId,
            `undo:${input.completionIdempotencyKey}`,
            JSON.stringify(prior),
            input.completedAtMs + 8_000,
            input.completedAtMs,
          ],
        );
        await enqueueRestReconciliation(transaction, {
          idempotencyKey: `rest:${input.completionIdempotencyKey}`,
          sessionId: input.sessionId,
          restRevision,
          nowMs: input.completedAtMs,
        });
        return {
          kind: "result" as const,
          result: {
            outcome: "committed" as const,
            view: await loadPlannedWorkout(transaction, input.sessionId),
          },
        };
      });
      if (result.kind === "conflict") {
        throw new WorkoutCommandConflictError(result.code);
      }
      return result.result;
    },

    async reviseCompletedSet(input) {
      const result = await kernel.write(async (transaction) => {
        const rows = await completionRows(
          transaction,
          input.sessionId,
          input.setId,
        );
        if (rows === null) {
          return null;
        }
        const { session, set } = rows;
        const identity: MetricIdentity = {
          profile: set.exercise_metric_profile,
          contractVersion: set.exercise_metric_contract_version ?? 1,
          exerciseMetricGeneration: set.exercise_metric_generation ?? 1,
        };
        if (
          session.status !== "in_progress"
          || session.revision !== input.expectedSessionRevision
          || set.set_kind !== "working"
          || set.status !== "completed"
          || set.revision !== input.expectedSetRevision
          || input.observation.profile !== identity.profile
          || input.observation.version !== identity.contractVersion
          || !sameMetricIdentity(input.metricIdentity, identity)
        ) {
          return null;
        }
        const observation = observationColumns(input.observation);
        const setUpdate = await transaction.execute(
          `UPDATE session_sets
           SET observed_load_grams = ?,
               observed_reps = ?,
               observed_json = ?,
               draft_updated_at_ms = ?,
               revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND set_kind = 'working'
             AND status = 'completed'`,
          [
            observation.loadGrams,
            observation.reps,
            observation.json,
            input.revisedAtMs,
            input.setId,
            input.expectedSetRevision,
          ],
        );
        if (setUpdate.changes !== 1) {
          throw new Error("revise_completed_set_conditional_update_failed");
        }
        const sessionUpdate = await transaction.execute(
          `UPDATE workout_sessions
           SET revision = revision + 1
           WHERE id = ?
             AND revision = ?
             AND status = 'in_progress'`,
          [input.sessionId, input.expectedSessionRevision],
        );
        if (sessionUpdate.changes !== 1) {
          throw new Error("revise_completed_set_session_update_failed");
        }
        return loadPlannedWorkout(transaction, input.sessionId);
      });
      if (result === null) {
        throw new WorkoutCommandConflictError("revise_completed_set_conflict");
      }
      return result;
    },

    async undoCompletedSet(input) {
      return kernel.write(async (transaction) => {
        const [undo] = await transaction.queryAll<{
          id: string;
          snapshot_json: string;
          undo_until_ms: number;
        }>(
          `SELECT id, snapshot_json, undo_until_ms
           FROM session_undo_snapshots
           WHERE session_id = ?
             AND completed_set_id = ?
             AND consumed_at_ms IS NULL
           ORDER BY created_at_ms DESC, id DESC
           LIMIT 1`,
          [input.sessionId, input.completedSetId],
        );
        if (undo === undefined || input.nowMs >= undo.undo_until_ms) {
          return { outcome: "unavailable" as const };
        }
        const prior = parseSnapshot(undo.snapshot_json);
        const [session] = await transaction.queryAll<SessionRow>(
          `SELECT id, status, active_session_exercise_id, active_set_id,
                  revision
           FROM workout_sessions
           WHERE id = ?`,
          [input.sessionId],
        );
        const [set] = await transaction.queryAll<SetRow>(
          `SELECT ss.id, ss.session_exercise_id, ss.set_kind, ss.ordinal,
                  ss.source_plan_working_set_target_id, ss.target_load_grams,
                  ss.target_min_reps, ss.target_max_reps, ss.target_json,
                  ss.observed_load_grams, ss.observed_reps, ss.observed_json,
                  ss.status, ss.draft_updated_at_ms, ss.completed_at_ms,
                  ss.completion_idempotency_key, ss.revision
           FROM session_sets ss
           JOIN session_exercises se ON se.id = ss.session_exercise_id
           WHERE ss.id = ? AND se.session_id = ?`,
          [input.completedSetId, input.sessionId],
        );
        if (
          session === undefined
          || session.status !== "in_progress"
          || set === undefined
          || set.status !== "completed"
        ) {
          return { outcome: "unavailable" as const };
        }
        await transaction.execute(
          `UPDATE session_sets
           SET observed_load_grams = ?,
               observed_reps = ?,
               observed_json = ?,
               status = ?,
               draft_updated_at_ms = ?,
               completed_at_ms = ?,
               completion_idempotency_key = ?,
               revision = revision + 1
           WHERE id = ? AND status = 'completed'`,
          [
            prior.set.observedLoadGrams,
            prior.set.observedReps,
            prior.set.observedJson,
            prior.set.status,
            prior.set.draftUpdatedAtMs,
            prior.set.completedAtMs,
            prior.set.completionIdempotencyKey,
            input.completedSetId,
          ],
        );
        for (const exercise of prior.exercises) {
          await transaction.execute(
            `UPDATE session_exercises
             SET status = ?, revision = revision + 1
             WHERE id = ? AND session_id = ?`,
            [exercise.status, exercise.id, input.sessionId],
          );
        }
        await transaction.execute(
          `UPDATE workout_sessions
           SET active_session_exercise_id = ?,
               active_set_id = ?,
               revision = revision + 1
           WHERE id = ? AND status = 'in_progress'`,
          [
            prior.session.activeExerciseId,
            prior.session.activeSetId,
            input.sessionId,
          ],
        );

        const currentRest = await restRow(transaction, input.sessionId);
        let restRevision: number;
        if (prior.rest === null || prior.rest.status === "idle") {
          restRevision = await setIdleRest(
            transaction,
            input.sessionId,
            currentRest?.revision ?? 0,
          );
        } else {
          restRevision = (currentRest?.revision ?? 0) + 1;
          await transaction.execute(
            `UPDATE session_rest_states
             SET state_version = 1,
                 status = ?,
                 started_at_ms = ?,
                 ends_at_ms = ?,
                 remaining_ms = ?,
                 expired_at_ms = ?,
                 next_set_id = ?,
                 revision = ?
             WHERE session_id = ?`,
            [
              prior.rest.status,
              prior.rest.started_at_ms,
              prior.rest.ends_at_ms,
              prior.rest.remaining_ms,
              prior.rest.expired_at_ms,
              prior.rest.next_set_id,
              restRevision,
              input.sessionId,
            ],
          );
        }
        await transaction.execute(
          `UPDATE session_undo_snapshots
           SET consumed_at_ms = ?
           WHERE id = ? AND consumed_at_ms IS NULL`,
          [input.nowMs, undo.id],
        );
        await transaction.execute(
          `UPDATE pending_effects
           SET status = 'superseded',
               claimed_at_ms = NULL,
               lease_expires_at_ms = NULL,
               last_error_code = 'undo_superseded',
               updated_at_ms = ?
           WHERE effect_type = 'reconcile_rest_notification'
             AND subject_id = ?
             AND status IN ('pending', 'processing')`,
          [input.nowMs, input.sessionId],
        );
        await enqueueRestReconciliation(transaction, {
          idempotencyKey: `rest:undo:${undo.id}`,
          sessionId: input.sessionId,
          restRevision,
          nowMs: input.nowMs,
        });
        return {
          outcome: "undone" as const,
          view: await loadPlannedWorkout(transaction, input.sessionId),
        };
      });
    },
  };
  return Object.freeze(repository);
}
