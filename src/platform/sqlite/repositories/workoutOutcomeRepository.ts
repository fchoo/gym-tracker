import {
  parseMetricIdentity,
  parseMetricObservation,
  parseMetricObservationJson,
  parseMetricTarget,
  parseMetricTargetJson,
  selectBestMetricCandidate,
  type MetricIdentity,
  type MetricObservation,
  type MetricProfile,
  type MetricTarget,
} from "../../../domains/metrics";
import {
  assertValidHistoryCorrectionSnapshot,
  collectHistoryImpact,
  type EffectiveHistorySubjectSnapshot,
  type HistoryCorrectionSnapshot,
} from "../../../domains/history";
import {
  LOAD_REPS_RULE,
  ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION,
  parseActionableRecommendationEvidence,
  evaluateLoadRepsV1,
  evaluateProgressionPolicy,
  type ExerciseEffort,
  type LoadRepsEvidenceSet,
  type LoadRepsProgressionInput,
  type ProgressionRepository,
  type RecommendationDecisionInput,
  type RecommendationDecisionResult,
  type RecordExerciseEffortInput,
} from "../../../domains/progression";
import {
  nextWorkoutStatus,
  sessionIsResumable,
  sessionStatusLabel,
  WorkoutOutcomeConflictError,
  type DiscardWorkoutInput,
  type FinishCompletedInput,
  type FinishOutcomeResult,
  type FinishPartialInput,
  type ResumePartialWorkoutInput,
  type SaveZeroSetInput,
  type SessionDetail,
  type SessionExerciseDetail,
  type SessionNonLoadOutcome,
  type SessionProgress,
  type SessionRecommendation,
  type SessionSetDetail,
  type SkipExerciseInput,
  type WorkoutOutcomeRepository,
  type WorkoutSessionStatus,
} from "../../../domains/workout";
import {
  enqueuePendingEffect,
} from "../effects/effectStore";
import {
  invalidateAndAdvanceHistoryProjectionSubjects,
} from "./historyProjectionRepository";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

type QueryExecutor = Pick<SqliteKernel, "queryAll">
  | Pick<SqliteTransactionExecutor, "queryAll">;

type SessionRow = Readonly<{
  id: string;
  source: "scheduled_day" | "alternate_day" | "rest_day" | "empty" | "manual";
  status: WorkoutSessionStatus;
  plan_id: string | null;
  plan_day_id: string | null;
  local_date: string;
  timezone: string;
  started_at_ms: number;
  completed_at_ms: number | null;
  revision: number;
  plan_name: string | null;
  day_name: string | null;
  effective_revision: number | null;
  lifecycle: "active" | "voided" | null;
  snapshot_json: string | null;
}>;

type ExerciseRow = Readonly<{
  id: string;
  exercise_id: string;
  exercise_name: string;
  metric_profile: MetricProfile;
  metric_contract_version?: number;
  exercise_metric_generation?: number;
  ordinal: number;
  status: "planned" | "active" | "completed" | "skipped";
  effort: ExerciseEffort | null;
  revision: number;
}>;

type SetRow = Readonly<{
  id: string;
  session_exercise_id: string;
  set_kind: "warmup" | "working";
  ordinal: number;
  status: "planned" | "draft" | "completed" | "skipped";
  target_json: string;
  metric_profile?: MetricProfile;
  metric_contract_version?: number;
  exercise_metric_generation?: number;
  observed_load_grams: number | null;
  observed_reps: number | null;
  observed_json: string | null;
  completed_at_ms: number | null;
  source_plan_working_set_target_id: string | null;
  source_owned_plan_working_set_target_id: string | null;
  rule_type: MetricProfile | "manual_hold";
  rule_version: number;
}>;

type CopiedPolicyRow = Readonly<{
  policy_kind: "automatic" | "manual_hold" | "plan_authored";
  policy_id: string;
  policy_version: number;
  rule_json: string;
  metric_profile: MetricProfile;
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type LegacyPolicyRow = Readonly<{
  policy_type: MetricProfile | "manual_hold";
  policy_version: number;
  rule_json: string;
  metric_profile: MetricProfile;
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type RecommendationRow = Readonly<{
  id: string;
  exercise_id: string;
  target_id: string;
  target_graph: "legacy" | "owned";
  metric_profile: MetricProfile | null;
  metric_contract_version: number | null;
  exercise_metric_generation: number | null;
  proposed_target_json: string;
  evidence_version: number;
  evidence_json: string;
  rule_type: MetricProfile;
  rule_version: number;
  status: "pending" | "accepted" | "rejected" | "invalidated" | "superseded";
  source_revision: number;
  target_revision: number;
  created_at_ms: number;
}>;

type TargetReference = Readonly<{
  graph: "legacy" | "owned";
  id: string;
}>;

type TargetRow = Readonly<{
  id: string;
  plan_day_exercise_id: string;
  target_json: string;
  revision: number;
}>;

type RecommendationTargetScopeRow = Readonly<{
  id: string;
  target_json: string;
  revision: number;
}>;

type RecommendationTargetIdentityRow = RecommendationTargetScopeRow & Readonly<{
  exercise_id: string;
  metric_profile: MetricProfile;
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type RecommendationSourceSessionRow = Readonly<{
  revision: number;
  status: WorkoutSessionStatus;
}>;

async function supportsOwnedRecommendations(
  executor: QueryExecutor,
): Promise<boolean> {
  const columns = await executor.queryAll<{ name: string }>(
    "PRAGMA table_info(session_sets)",
  );
  if (!columns.some(({ name }) =>
    name === "source_owned_plan_working_set_target_id"
  )) {
    return false;
  }
  const [table] = await executor.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM sqlite_master
     WHERE type = 'table' AND name = 'owned_progression_recommendations'`,
  );
  return (table?.count ?? 0) === 1;
}

function targetReference(set: SetRow): TargetReference | null {
  if (set.source_plan_working_set_target_id !== null) {
    return {
      graph: "legacy",
      id: set.source_plan_working_set_target_id,
    };
  }
  if (set.source_owned_plan_working_set_target_id !== null) {
    return {
      graph: "owned",
      id: set.source_owned_plan_working_set_target_id,
    };
  }
  return null;
}

function uniqueTargetReferences(sets: readonly SetRow[]): readonly TargetReference[] {
  const references = new Map<string, TargetReference>();
  for (const set of sets) {
    const reference = targetReference(set);
    if (reference !== null) {
      references.set(`${reference.graph}:${reference.id}`, reference);
    }
  }
  return [...references.values()];
}

function historySubjectSnapshot(
  session: SessionRow,
  exercises: readonly ExerciseRow[],
  sets: readonly SetRow[],
  lifecycle: EffectiveHistorySubjectSnapshot["lifecycle"],
): EffectiveHistorySubjectSnapshot {
  return Object.freeze({
    sessionId: session.id,
    localDate: session.local_date,
    lifecycle,
    exercises: Object.freeze(exercises.flatMap((exercise) => sets
      .filter(({ session_exercise_id, set_kind }) =>
        session_exercise_id === exercise.id && set_kind === "working"
      )
      .map((set) => {
        const identity = setIdentity(set, exercise);
        const reference = targetReference(set);
        return Object.freeze({
          exerciseId: exercise.exercise_id,
          identity,
          target: parseSetTarget(set, identity),
          recommendationTargetIds: Object.freeze(reference === null
            ? []
            : [`${reference.graph}:${reference.id}`]),
        });
      }))),
  });
}

function historySubjectSnapshotFromCorrectionSnapshot(
  snapshot: HistoryCorrectionSnapshot,
  lifecycle: EffectiveHistorySubjectSnapshot["lifecycle"],
): EffectiveHistorySubjectSnapshot {
  return Object.freeze({
    sessionId: snapshot.session.id,
    localDate: snapshot.session.localDate,
    lifecycle,
    exercises: Object.freeze(snapshot.exercises.flatMap((exercise) =>
      exercise.sets
        .filter(({ kind }) => kind === "working")
        .map((set) => {
          const identity = parseMetricIdentity(exercise.metricIdentity);
          return Object.freeze({
            exerciseId: exercise.exerciseId,
            identity,
            target: parseMetricTarget(identity, set.target),
            recommendationTargetIds: Object.freeze([
              set.sourcePlanWorkingSetTargetId === undefined
                ? null
                : `legacy:${set.sourcePlanWorkingSetTargetId}`,
              set.sourceOwnedPlanWorkingSetTargetId === undefined
                ? null
                : `owned:${set.sourceOwnedPlanWorkingSetTargetId}`,
            ].filter((value): value is string => value !== null)),
          });
        })
    )),
  });
}

function targetTable(graph: TargetReference["graph"]): string {
  return graph === "owned"
    ? "owned_plan_working_set_targets"
    : "plan_working_set_targets";
}

function recommendationTable(graph: TargetReference["graph"]): string {
  return graph === "owned"
    ? "owned_progression_recommendations"
    : "progression_recommendations";
}

function recommendationTargetColumn(graph: TargetReference["graph"]): string {
  return graph === "owned"
    ? "owned_plan_working_set_target_id"
    : "plan_working_set_target_id";
}

async function recommendationTargetScope(
  executor: QueryExecutor,
  graph: TargetReference["graph"],
  targetId: string,
): Promise<readonly RecommendationTargetIdentityRow[]> {
  if (graph === "owned") {
    return executor.queryAll<RecommendationTargetIdentityRow>(
      `SELECT target.id, target.target_json, target.revision,
              occurrence.exercise_id, target.metric_profile,
              target.metric_contract_version,
              target.exercise_metric_generation
       FROM owned_plan_working_set_targets target
       JOIN owned_plan_day_exercises occurrence
         ON occurrence.id = target.plan_day_exercise_id
       WHERE target.plan_day_exercise_id = (
         SELECT plan_day_exercise_id
         FROM owned_plan_working_set_targets
         WHERE id = ?
       )
       ORDER BY target.ordinal`,
      [targetId],
    );
  }
  return executor.queryAll<RecommendationTargetIdentityRow>(
    `SELECT target.id, target.target_json, target.revision,
            occurrence.exercise_id, target.metric_profile,
            target.metric_contract_version,
            target.exercise_metric_generation
     FROM plan_working_set_targets target
     JOIN plan_day_exercises occurrence
       ON occurrence.id = target.plan_day_exercise_id
     WHERE target.plan_day_exercise_id = (
       SELECT plan_day_exercise_id
       FROM plan_working_set_targets
       WHERE id = ?
     )
     ORDER BY target.ordinal`,
    [targetId],
  );
}

async function pendingRecommendation(
  executor: QueryExecutor,
  recommendationId: string,
): Promise<RecommendationRow | null> {
  const [legacy] = await executor.queryAll<Omit<
    RecommendationRow,
    "target_graph"
  >>(
    `SELECT id, exercise_id, plan_working_set_target_id AS target_id,
            metric_profile, metric_contract_version,
            exercise_metric_generation, proposed_target_json,
            evidence_version, evidence_json, rule_type, rule_version,
            status, source_revision, target_revision, created_at_ms
     FROM progression_recommendations
     WHERE id = ?`,
    [recommendationId],
  );
  if (legacy !== undefined) {
    return { ...legacy, target_graph: "legacy" };
  }
  if (!await supportsOwnedRecommendations(executor)) {
    return null;
  }
  const [owned] = await executor.queryAll<Omit<
    RecommendationRow,
    "target_graph"
  >>(
    `SELECT id, exercise_id, owned_plan_working_set_target_id AS target_id,
            metric_profile, metric_contract_version,
            exercise_metric_generation,
            proposed_target_json, evidence_version, evidence_json,
            rule_type, rule_version, status, source_revision,
            target_revision, created_at_ms
     FROM owned_progression_recommendations
     WHERE id = ?`,
    [recommendationId],
  );
  return owned === undefined ? null : { ...owned, target_graph: "owned" };
}

function percentage(completed: number, planned: number): SessionProgress {
  return {
    completed,
    planned,
    percent: planned === 0 ? null : Math.round((completed / planned) * 100),
  };
}

function sourceLabel(source: SessionRow["source"]): string {
  switch (source) {
    case "scheduled_day":
      return "Planned day";
    case "alternate_day":
      return "Alternate plan day";
    case "rest_day":
      return "Trained on rest day";
    case "empty":
      return "Empty workout";
    case "manual":
      return "Manual visit";
  }
}

function formatKilograms(loadGrams: number): string {
  const value = loadGrams / 1_000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} kg`;
}

function exerciseIdentity(row: ExerciseRow): MetricIdentity {
  return parseMetricIdentity({
    profile: row.metric_profile,
    contractVersion: row.metric_contract_version ?? 1,
    exerciseMetricGeneration: row.exercise_metric_generation ?? 1,
  });
}

function setIdentity(row: SetRow, exercise: ExerciseRow): MetricIdentity {
  const identity = parseMetricIdentity({
    profile: row.metric_profile ?? exercise.metric_profile,
    contractVersion:
      row.metric_contract_version ?? exercise.metric_contract_version ?? 1,
    exerciseMetricGeneration:
      row.exercise_metric_generation
      ?? exercise.exercise_metric_generation
      ?? 1,
  });
  const expected = exerciseIdentity(exercise);
  if (
    identity.profile !== expected.profile
    || identity.contractVersion !== expected.contractVersion
    || identity.exerciseMetricGeneration !== expected.exerciseMetricGeneration
  ) {
    throw new WorkoutOutcomeConflictError(
      "session_detail_metric_identity_mismatch",
    );
  }
  return identity;
}

function legacyTarget(row: SetRow, identity: MetricIdentity): MetricTarget {
  if (identity.profile === "timed_hold") {
    return {
      version: 1,
      profile: "timed_hold",
      durationSeconds: 1,
      perSide: false,
    };
  }
  return {
    version: 1,
    profile: "load_reps",
    loadGrams: row.observed_load_grams ?? 0,
    minReps: Math.max(1, row.observed_reps ?? 1),
    maxReps: Math.max(1, row.observed_reps ?? 1),
    incrementGrams: 1_000,
    perSide: false,
  };
}

function parseSetTarget(row: SetRow, identity: MetricIdentity): MetricTarget {
  if (row.target_json === "{}") {
    return legacyTarget(row, identity);
  }
  try {
    return parseMetricTargetJson(identity, row.target_json);
  } catch {
    throw new WorkoutOutcomeConflictError("session_detail_target_invalid");
  }
}

function parseSetObservation(
  row: SetRow,
  identity: MetricIdentity,
): MetricObservation | null {
  if (row.observed_json === null) {
    if (
      identity.profile === "load_reps"
      && row.observed_load_grams !== null
      && row.observed_reps !== null
    ) {
      return {
        version: 1,
        profile: "load_reps",
        loadGrams: row.observed_load_grams,
        reps: row.observed_reps,
        source: "manual",
      };
    }
    return null;
  }
  if (row.metric_contract_version === undefined) {
    let legacy: Record<string, unknown>;
    try {
      legacy = JSON.parse(row.observed_json) as Record<string, unknown>;
    } catch {
      throw new WorkoutOutcomeConflictError(
        "session_detail_observation_invalid",
      );
    }
    if (
      identity.profile === "load_reps"
      && Number.isSafeInteger(legacy.loadGrams)
      && Number(legacy.loadGrams) >= 0
      && Number.isSafeInteger(legacy.reps)
      && Number(legacy.reps) > 0
    ) {
      return {
        version: 1,
        profile: "load_reps",
        loadGrams: Number(legacy.loadGrams),
        reps: Number(legacy.reps),
        source: "manual",
      };
    }
    if (
      identity.profile === "timed_hold"
      && Number.isSafeInteger(legacy.durationSeconds)
      && Number(legacy.durationSeconds) > 0
    ) {
      return {
        version: 1,
        profile: "timed_hold",
        durationSeconds: Number(legacy.durationSeconds),
        source: "manual",
      };
    }
    return null;
  }
  try {
    return parseMetricObservationJson(identity, row.observed_json);
  } catch {
    throw new WorkoutOutcomeConflictError(
      "session_detail_observation_invalid",
    );
  }
}

function formatDurationMs(durationMs: number): string {
  return `${durationMs / 1_000} sec`;
}

function setValue(
  row: Pick<SetRow, "status">,
  observation: MetricObservation | null,
): string {
  if (observation !== null) {
    switch (observation.profile) {
      case "load_reps":
        return `${formatKilograms(observation.loadGrams)} × ${observation.reps}`;
      case "bodyweight_reps":
        return `Bodyweight × ${observation.reps}`;
      case "added_load_reps":
        return `BW + ${formatKilograms(observation.addedLoadGrams)} × ${observation.reps}`;
      case "assisted_reps":
        return `${formatKilograms(observation.assistanceGrams)} assist × ${observation.reps}`;
      case "timed_hold":
        return observation.version === 1
          ? `${observation.durationSeconds} sec`
          : formatDurationMs(observation.durationMs);
      case "fixed_distance":
        return `${observation.distanceMeters} m in ${
          formatDurationMs(observation.durationMs)
        }`;
      case "fixed_time":
        return `${observation.distanceMeters} m in ${
          formatDurationMs(observation.durationMs)
        }`;
      case "intervals":
        return `${observation.completedRounds} rounds · ${
          formatDurationMs(observation.completedWorkMs)
        } work`;
      case "unscored":
        return observation.completed ? "Completed" : "Not completed";
    }
  }
  return row.status === "skipped" ? "Skipped" : "Not completed";
}

function topWorkingSet(
  sessionId: string,
  exercise: ExerciseRow,
  sets: readonly SetRow[],
): string | null {
  const completed = sets.filter(
    ({ set_kind, status }) =>
      set_kind === "working" && status === "completed",
  );
  const identity = exerciseIdentity(exercise);
  const candidates = completed.flatMap((row) => {
    const observation = parseSetObservation(row, identity);
    return observation === null
      ? []
      : [{
          observation,
          completedAtMs: row.ordinal,
          sessionId,
          setOrdinal: row.ordinal,
          setId: row.id,
        }];
  });
  if (candidates.length === 0) {
    return null;
  }
  const target = parseSetTarget(completed[0]!, identity);
  const best = selectBestMetricCandidate({
    identity,
    target,
    candidates,
  });
  if (best === null) {
    return null;
  }
  return setValue(
    completed.find(({ id }) => id === best.setId)!,
    best.observation,
  );
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

async function sessionRows(
  executor: QueryExecutor,
  sessionId: string,
): Promise<Readonly<{
  session: SessionRow;
  exercises: readonly ExerciseRow[];
  sets: readonly SetRow[];
}>> {
  const completeIdentity = await supportsCompleteMetricIdentity(executor);
  const ownedRecommendations = await supportsOwnedRecommendations(executor);
  const [session] = await executor.queryAll<SessionRow>(
    `SELECT ws.id, ws.source, ws.status, ws.plan_id, ws.plan_day_id,
            ws.local_date, ws.timezone,
            ws.started_at_ms, ws.completed_at_ms, ws.revision,
            p.name AS plan_name, pd.name AS day_name,
            overlay.effective_revision, overlay.lifecycle, overlay.snapshot_json
     FROM workout_sessions ws
     LEFT JOIN plans p ON p.id = ws.plan_id
     LEFT JOIN plan_days pd ON pd.id = ws.plan_day_id
     LEFT JOIN history_session_overlays overlay ON overlay.session_id = ws.id
     WHERE ws.id = ?`,
    [sessionId],
  );
  if (session === undefined) {
    throw new WorkoutOutcomeConflictError("workout_session_not_found");
  }
  const exercises = await executor.queryAll<ExerciseRow>(
    `SELECT id, exercise_id, exercise_name, metric_profile,
            ${completeIdentity
              ? "metric_contract_version, exercise_metric_generation,"
              : ""}
            ordinal, status,
            effort, revision
     FROM session_exercises
     WHERE session_id = ?
     ORDER BY ordinal`,
    [sessionId],
  );
  const sets = await executor.queryAll<SetRow>(
    `SELECT ss.id, ss.session_exercise_id, ss.set_kind, ss.ordinal,
            ss.status, ss.target_json, ss.observed_load_grams,
            ${completeIdentity
              ? `ss.metric_profile, ss.metric_contract_version,
                 ss.exercise_metric_generation,`
              : ""}
            ss.observed_reps, ss.observed_json, ss.completed_at_ms,
            ss.source_plan_working_set_target_id,
            ${ownedRecommendations
              ? "ss.source_owned_plan_working_set_target_id,"
              : "NULL AS source_owned_plan_working_set_target_id,"}
            ss.rule_type,
            ss.rule_version
     FROM session_sets ss
     JOIN session_exercises se ON se.id = ss.session_exercise_id
     WHERE se.session_id = ?
     ORDER BY se.ordinal,
              CASE ss.set_kind WHEN 'warmup' THEN 0 ELSE 1 END,
              ss.ordinal`,
    [sessionId],
  );
  return { session, exercises, sets };
}

function recommendationStatus(
  recommendations: readonly SessionRecommendation[],
): SessionDetail["recommendationStatus"] {
  if (recommendations.some(({ status }) => status === "accepted")) {
    return "accepted";
  }
  if (recommendations.some(({ status }) => status === "rejected")) {
    return "kept_current";
  }
  if (recommendations.some(({ status }) => status === "pending")) {
    return "pending";
  }
  return "none";
}

function effectiveOverlaySnapshot(
  session: SessionRow,
): HistoryCorrectionSnapshot | null {
  if (session.snapshot_json === null) {
    return null;
  }
  try {
    const snapshot = JSON.parse(session.snapshot_json) as HistoryCorrectionSnapshot;
    assertValidHistoryCorrectionSnapshot(snapshot);
    if (snapshot.session.id !== session.id) {
      throw new Error("history_session_id_mismatch");
    }
    return snapshot;
  } catch {
    throw new WorkoutOutcomeConflictError(
      "session_detail_effective_overlay_invalid",
    );
  }
}

function sourceHistoryCorrectionSnapshot(
  session: SessionRow,
  exercises: readonly ExerciseRow[],
  sets: readonly SetRow[],
  status: HistoryCorrectionSnapshot["session"]["status"],
  completedAtMs: number,
): HistoryCorrectionSnapshot {
  const snapshot: HistoryCorrectionSnapshot = Object.freeze({
    version: 1,
    session: Object.freeze({
      id: session.id,
      source: session.source,
      status,
      planId: session.plan_id,
      planDayId: session.plan_day_id,
      planName: session.plan_name,
      dayName: session.day_name,
      localDate: session.local_date,
      timezone: session.timezone,
      startedAtMs: session.started_at_ms,
      completedAtMs,
      ownerNote: null,
    }),
    exercises: Object.freeze(exercises.map((exercise) => {
      const identity = exerciseIdentity(exercise);
      return Object.freeze({
        id: exercise.id,
        exerciseId: exercise.exercise_id,
        name: exercise.exercise_name,
        ordinal: exercise.ordinal,
        status: exercise.status,
        metricIdentity: identity,
        effort: exercise.effort,
        sets: Object.freeze(sets
          .filter(({ session_exercise_id }) => session_exercise_id === exercise.id)
          .map((set) => {
            const setMetricIdentity = setIdentity(set, exercise);
            const observation = parseSetObservation(set, setMetricIdentity);
            return Object.freeze({
              id: set.id,
              kind: set.set_kind,
              ordinal: set.ordinal,
              status: set.status,
              target: parseSetTarget(set, setMetricIdentity),
              observation: observation ?? undefined,
              completedAtMs: set.completed_at_ms,
              ...(set.source_plan_working_set_target_id === null
                ? {}
                : {
                    sourcePlanWorkingSetTargetId:
                      set.source_plan_working_set_target_id,
                  }),
              ...(set.source_owned_plan_working_set_target_id === null
                ? {}
                : {
                    sourceOwnedPlanWorkingSetTargetId:
                      set.source_owned_plan_working_set_target_id,
                  }),
            });
          })),
      });
    })),
  });
  assertValidHistoryCorrectionSnapshot(snapshot);
  return snapshot;
}

function lifecycleAuditId(
  sessionId: string,
  effectiveRevision: number,
  lifecycle: "active" | "voided",
): string {
  return `history-audit:${sessionId}:${effectiveRevision}:${lifecycle}`;
}

function sourceSnapshotAuditId(
  sessionId: string,
  effectiveRevision: number,
): string {
  return `history-audit:${sessionId}:${effectiveRevision}:source-snapshot`;
}

function terminalizationAuditId(
  sessionId: string,
  effectiveRevision: number,
): string {
  return `history-audit:${sessionId}:${effectiveRevision}:terminalized`;
}

async function voidActiveHistoryOverlayForResume(
  transaction: SqliteTransactionExecutor,
  session: SessionRow,
  nowMs: number,
): Promise<void> {
  if (
    session.lifecycle !== "active"
    || session.effective_revision === null
  ) {
    throw new WorkoutOutcomeConflictError("resume_partial_conflict");
  }
  const effectiveRevision = session.effective_revision + 1;
  const updated = await transaction.execute(
    `UPDATE history_session_overlays
     SET effective_revision = ?,
         lifecycle = 'voided',
         updated_at_ms = ?
     WHERE session_id = ?
       AND effective_revision = ?
       AND lifecycle = 'active'`,
    [
      effectiveRevision,
      nowMs,
      session.id,
      session.effective_revision,
    ],
  );
  if (updated.changes !== 1) {
    throw new WorkoutOutcomeConflictError("resume_partial_conflict");
  }
  await transaction.execute(
    `INSERT INTO history_audit_events
      (id, session_id, effective_revision, event_type, field_identity,
       before_json, after_json, occurred_at_ms)
     VALUES (?, ?, ?, 'void', 'session.lifecycle', ?, ?, ?)`,
    [
      lifecycleAuditId(session.id, effectiveRevision, "voided"),
      session.id,
      effectiveRevision,
      JSON.stringify("active"),
      JSON.stringify("voided"),
      nowMs,
    ],
  );
}

async function reactivateHistoryOverlayAfterResume(
  transaction: SqliteTransactionExecutor,
  session: SessionRow,
  previousSnapshot: HistoryCorrectionSnapshot,
  nextSnapshot: HistoryCorrectionSnapshot,
  nowMs: number,
): Promise<void> {
  if (
    session.lifecycle !== "voided"
    || session.effective_revision === null
  ) {
    throw new WorkoutOutcomeConflictError("finish_workout_conflict");
  }
  const effectiveRevision = session.effective_revision + 1;
  const updated = await transaction.execute(
    `UPDATE history_session_overlays
     SET effective_revision = ?,
         lifecycle = 'active',
         snapshot_json = ?,
         effective_local_date = ?,
         effective_timezone = ?,
         effective_started_at_ms = ?,
         effective_completed_at_ms = ?,
         updated_at_ms = ?
     WHERE session_id = ?
       AND effective_revision = ?
       AND lifecycle = 'voided'`,
    [
      effectiveRevision,
      JSON.stringify(nextSnapshot),
      nextSnapshot.session.localDate,
      nextSnapshot.session.timezone,
      nextSnapshot.session.startedAtMs,
      nextSnapshot.session.completedAtMs,
      nowMs,
      session.id,
      session.effective_revision,
    ],
  );
  if (updated.changes !== 1) {
    throw new WorkoutOutcomeConflictError("finish_workout_conflict");
  }
  await transaction.execute(
    `INSERT INTO history_audit_events
      (id, session_id, effective_revision, event_type, field_identity,
       before_json, after_json, occurred_at_ms)
     VALUES (?, ?, ?, 'restore', 'session.lifecycle', ?, ?, ?)`,
    [
      lifecycleAuditId(session.id, effectiveRevision, "active"),
      session.id,
      effectiveRevision,
      JSON.stringify("voided"),
      JSON.stringify("active"),
      nowMs,
    ],
  );
  await transaction.execute(
    `INSERT INTO history_audit_events
      (id, session_id, effective_revision, event_type, field_identity,
       before_json, after_json, occurred_at_ms)
     VALUES (?, ?, ?, 'correction', 'session.source_snapshot', ?, ?, ?)`,
    [
      sourceSnapshotAuditId(session.id, effectiveRevision),
      session.id,
      effectiveRevision,
      JSON.stringify(previousSnapshot),
      JSON.stringify(nextSnapshot),
      nowMs,
    ],
  );
}

async function terminalizeVoidedHistoryOverlay(
  transaction: SqliteTransactionExecutor,
  session: SessionRow,
  snapshot: HistoryCorrectionSnapshot,
  terminalStatus: Extract<WorkoutSessionStatus, "discarded" | "zero_sets">,
  nowMs: number,
): Promise<ReturnType<typeof collectHistoryImpact>> {
  if (
    session.lifecycle !== "voided"
    || session.effective_revision === null
  ) {
    throw new WorkoutOutcomeConflictError("finish_workout_conflict");
  }
  const deleted = await transaction.execute(
    `DELETE FROM history_session_overlays
     WHERE session_id = ?
       AND effective_revision = ?
       AND lifecycle = 'voided'`,
    [session.id, session.effective_revision],
  );
  if (deleted.changes !== 1) {
    throw new WorkoutOutcomeConflictError("finish_workout_conflict");
  }
  await transaction.execute(
    `INSERT INTO history_audit_events
      (id, session_id, effective_revision, event_type, field_identity,
       before_json, after_json, occurred_at_ms)
     VALUES (?, ?, ?, 'correction', 'session.terminal_status', ?, ?, ?)`,
    [
      terminalizationAuditId(session.id, session.effective_revision),
      session.id,
      session.effective_revision,
      JSON.stringify("in_progress"),
      JSON.stringify(terminalStatus),
      nowMs,
    ],
  );
  const activeHistory = historySubjectSnapshotFromCorrectionSnapshot(
    snapshot,
    "active",
  );
  return collectHistoryImpact({
    oldSnapshot: activeHistory,
    newSnapshot: { ...activeHistory, lifecycle: "voided" },
  });
}

function nonLoadOutcome(
  input: Readonly<{
    exerciseId: string;
    exerciseName: string;
    identity: MetricIdentity;
    policy: CopiedPolicyRow;
    target: MetricTarget;
    sourceFacts: readonly MetricObservation[];
    source: SessionNonLoadOutcome["source"];
  }>,
): SessionNonLoadOutcome | null {
  if (
    input.policy.policy_kind !== "manual_hold"
    && input.policy.policy_kind !== "plan_authored"
  ) {
    return null;
  }
  const rule = parsePolicyRule(input.policy.rule_json);
  if (rule === null) {
    return null;
  }
  const evaluation = evaluateProgressionPolicy({
    version: 1,
    policy: {
      kind: input.policy.policy_kind,
      id: input.policy.policy_id,
      version: input.policy.policy_version,
      rule,
    },
    metricIdentity: input.identity,
    policyMetricIdentity: {
      profile: input.policy.metric_profile,
      contractVersion: input.policy.metric_contract_version,
      exerciseMetricGeneration: input.policy.exercise_metric_generation,
    },
    currentTarget: input.target,
    sourceFacts: input.sourceFacts,
  });
  if (
    evaluation.review.actionable
    || evaluation.proposedTarget !== null
    || (evaluation.policy.kind !== "manual_hold"
      && evaluation.policy.kind !== "plan_authored")
  ) {
    return null;
  }
  if (
    evaluation.policy.kind !== "manual_hold"
    && evaluation.policy.kind !== "plan_authored"
  ) {
    return null;
  }
  const policyKind: SessionNonLoadOutcome["rule"]["kind"] =
    evaluation.policy.kind === "manual_hold" ? "manual_hold" : "plan_authored";
  return Object.freeze({
    version: 1,
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    profile: evaluation.profile,
    rule: {
      kind: policyKind,
      id: evaluation.policy.id,
      version: evaluation.policy.version,
    },
    decision: evaluation.decision,
    reasonCode: evaluation.reasonCode,
    reason: evaluation.reason,
    currentTarget: input.target,
    proposedTarget: null,
    review: evaluation.review,
    evidence: evaluation.evidence,
    source: Object.freeze({
      ...input.source,
      setIds: Object.freeze([...input.source.setIds].sort((left, right) =>
        left.localeCompare(right)
      )),
    }),
  });
}

function sameMetricIdentity(
  left: MetricIdentity,
  right: MetricIdentity,
): boolean {
  return left.profile === right.profile
    && left.contractVersion === right.contractVersion
    && left.exerciseMetricGeneration === right.exerciseMetricGeneration;
}

function rawMetricIdentity(row: SetRow): MetricIdentity | null {
  if (
    row.metric_profile === undefined
    || row.metric_contract_version === undefined
    || row.exercise_metric_generation === undefined
  ) {
    return null;
  }
  try {
    return parseMetricIdentity({
      profile: row.metric_profile,
      contractVersion: row.metric_contract_version,
      exerciseMetricGeneration: row.exercise_metric_generation,
    });
  } catch {
    return null;
  }
}

function expectedRawRuleType(
  policy: CopiedPolicyRow,
): SetRow["rule_type"] {
  return policy.policy_kind === "manual_hold"
    ? "manual_hold"
    : policy.metric_profile;
}

function policyIdentityKey(policy: CopiedPolicyRow): string {
  return [
    policy.policy_kind,
    policy.policy_id,
    policy.policy_version,
    policy.metric_profile,
    policy.metric_contract_version,
    policy.exercise_metric_generation,
  ].join("\u0000");
}

function policyMatchesRawSet(
  row: SetRow,
  identity: MetricIdentity,
  policy: CopiedPolicyRow,
): boolean {
  const rowIdentity = rawMetricIdentity(row);
  return row.rule_type === expectedRawRuleType(policy)
    && row.rule_version === policy.policy_version
    && sameMetricIdentity(identity, rowIdentity ?? identity)
    && rowIdentity !== null
    && policy.metric_profile === identity.profile
    && policy.metric_contract_version === identity.contractVersion
    && policy.exercise_metric_generation === identity.exerciseMetricGeneration;
}

function sameTarget(
  left: MetricTarget,
  right: MetricTarget,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function policyForReference(
  executor: QueryExecutor,
  reference: TargetReference,
): Promise<CopiedPolicyRow | null> {
  return reference.graph === "owned"
    ? copiedOwnedPolicy(executor, reference.id)
    : copiedLegacyPolicy(executor, reference.id);
}

function completeRawWorkingSets(
  sets: readonly SetRow[],
  identity: MetricIdentity,
): readonly Readonly<{ row: SetRow; observation: MetricObservation }>[] | null {
  const completed = sets.filter(
    ({ set_kind, status }) => set_kind === "working" && status === "completed",
  );
  if (completed.length === 0) {
    return null;
  }
  const parsed = completed.map((row) => {
    try {
      const observation = parseSetObservation(row, identity);
      return observation === null ? null : { row, observation };
    } catch {
      return null;
    }
  });
  return parsed.some((value) => value === null)
    ? null
    : parsed as readonly Readonly<{ row: SetRow; observation: MetricObservation }>[];
}

async function policyForRawSet(
  executor: QueryExecutor,
  row: SetRow,
  identity: MetricIdentity,
): Promise<CopiedPolicyRow | null> {
  const reference = targetReference(row);
  if (reference === null) {
    return null;
  }
  const policy = await policyForReference(executor, reference);
  return policy !== null && policyMatchesRawSet(row, identity, policy)
    ? policy
    : null;
}

async function nonLoadOutcomeFromCompletedSets(
  executor: QueryExecutor,
  input: Readonly<{
    sessionId: string;
    sessionExerciseId: string;
    exerciseId: string;
    exerciseName: string;
    identity: MetricIdentity;
    effectiveRevision: number;
    completed: readonly Readonly<{
      row: SetRow;
      sourceSetId?: string;
      target: MetricTarget;
      observation: MetricObservation;
    }>[];
  }>,
): Promise<SessionNonLoadOutcome | null> {
  if (input.completed.length === 0) {
    return null;
  }
  const policies = await Promise.all(input.completed.map(({ row }) =>
    policyForRawSet(executor, row, input.identity)
  ));
  if (policies.some((policy) => policy === null)) {
    return null;
  }
  const resolved = policies as readonly CopiedPolicyRow[];
  const policy = resolved[0]!;
  if (new Set(resolved.map(policyIdentityKey)).size !== 1) {
    return null;
  }
  const target = input.completed[0]!.target;
  if (!input.completed.every((entry) => sameTarget(entry.target, target))) {
    return null;
  }
  return nonLoadOutcome({
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    identity: input.identity,
    policy,
    target,
    sourceFacts: input.completed.map(({ observation }) => observation),
    source: {
      sessionId: input.sessionId,
      sessionExerciseId: input.sessionExerciseId,
      setIds: input.completed.map(({ row, sourceSetId }) => sourceSetId ?? row.id),
      effectiveRevision: input.effectiveRevision,
    },
  });
}

async function rawNonLoadOutcomes(
  executor: QueryExecutor,
  session: SessionRow,
  exercises: readonly ExerciseRow[],
  sets: readonly SetRow[],
): Promise<readonly SessionNonLoadOutcome[]> {
  const outcomes: SessionNonLoadOutcome[] = [];
  for (const exercise of exercises) {
    const identity = exerciseIdentity(exercise);
    if (identity.profile === "load_reps") {
      continue;
    }
    const exerciseSets = sets.filter(
      ({ session_exercise_id }) => session_exercise_id === exercise.id,
    );
    const completed = completeRawWorkingSets(exerciseSets, identity);
    if (completed === null) {
      continue;
    }
    let outcome: SessionNonLoadOutcome | null;
    try {
      outcome = await nonLoadOutcomeFromCompletedSets(executor, {
        sessionId: session.id,
        sessionExerciseId: exercise.id,
      exerciseId: exercise.exercise_id,
      exerciseName: exercise.exercise_name,
      identity,
        effectiveRevision: session.revision,
        completed: completed.map(({ row, observation }) => ({
          row,
          observation,
          target: parseSetTarget(row, identity),
        })),
      });
    } catch {
      outcome = null;
    }
    if (outcome !== null) {
      outcomes.push(outcome);
    }
  }
  return Object.freeze(outcomes.sort((left, right) =>
    left.source.sessionExerciseId.localeCompare(right.source.sessionExerciseId)
    || left.source.setIds.join("\u0000").localeCompare(right.source.setIds.join("\u0000"))
  ));
}

function snapshotTargetReference(
  set: HistoryCorrectionSnapshot["exercises"][number]["sets"][number],
): TargetReference | null {
  const legacy = set.sourcePlanWorkingSetTargetId;
  const owned = set.sourceOwnedPlanWorkingSetTargetId;
  if ((legacy === undefined) === (owned === undefined)) {
    return null;
  }
  return legacy === undefined
    ? { graph: "owned", id: owned! }
    : { graph: "legacy", id: legacy };
}

function sameTargetReference(
  left: TargetReference | null,
  right: TargetReference | null,
): boolean {
  return left !== null
    && right !== null
    && left.graph === right.graph
    && left.id === right.id;
}

async function effectiveNonLoadOutcomes(
  executor: QueryExecutor,
  session: SessionRow,
  snapshot: HistoryCorrectionSnapshot,
  exercises: readonly ExerciseRow[],
  sets: readonly SetRow[],
): Promise<readonly SessionNonLoadOutcome[]> {
  if (session.effective_revision === null) {
    return [];
  }
  const outcomes: SessionNonLoadOutcome[] = [];
  for (const effectiveExercise of snapshot.exercises) {
    let identity: MetricIdentity;
    try {
      identity = parseMetricIdentity(effectiveExercise.metricIdentity);
    } catch {
      continue;
    }
    if (identity.profile === "load_reps") {
      continue;
    }
    const rawExercise = exercises.find(({ id }) => id === effectiveExercise.id);
    if (rawExercise === undefined
      || rawExercise.exercise_id !== effectiveExercise.exerciseId
      || !sameMetricIdentity(identity, exerciseIdentity(rawExercise))) {
      continue;
    }
    const rawSets = sets.filter(
      ({ session_exercise_id }) => session_exercise_id === rawExercise.id,
    );
    const completed = [] as Array<Readonly<{
      row: SetRow;
      sourceSetId?: string;
      target: MetricTarget;
      observation: MetricObservation;
    }>>;
    let unresolved = false;
    for (const effectiveSet of effectiveExercise.sets) {
      if (effectiveSet.kind !== "working" || effectiveSet.status !== "completed") {
        continue;
      }
      const reference = snapshotTargetReference(effectiveSet);
      const retained = rawSets.find(({ id }) => id === effectiveSet.id);
      const candidates = retained === undefined
        ? rawSets.filter((row) => sameTargetReference(targetReference(row), reference))
        : [retained];
      if (reference === null || candidates.length === 0
        || (retained !== undefined
          && !sameTargetReference(targetReference(retained), reference))) {
        unresolved = true;
        break;
      }
      const raw = candidates[0]!;
      try {
        const rawIdentity = rawMetricIdentity(raw);
        const target = parseMetricTarget(identity, effectiveSet.target);
        const observation = effectiveSet.observation === undefined
          ? null
          : parseMetricObservation(identity, effectiveSet.observation);
        if (rawIdentity === null || !sameMetricIdentity(rawIdentity, identity)
          || observation === null) {
          unresolved = true;
          break;
        }
        completed.push({
          row: raw,
          sourceSetId: effectiveSet.id,
          target,
          observation,
        });
      } catch {
        unresolved = true;
        break;
      }
    }
    if (unresolved || completed.length === 0) {
      continue;
    }
    const outcome = await nonLoadOutcomeFromCompletedSets(executor, {
      sessionId: session.id,
      sessionExerciseId: effectiveExercise.id,
      exerciseId: effectiveExercise.exerciseId,
      exerciseName: effectiveExercise.name,
      identity,
      effectiveRevision: session.effective_revision,
      completed,
    });
    if (outcome !== null) {
      outcomes.push(outcome);
    }
  }
  return Object.freeze(outcomes.sort((left, right) =>
    left.source.sessionExerciseId.localeCompare(right.source.sessionExerciseId)
    || left.source.setIds.join("\u0000").localeCompare(right.source.setIds.join("\u0000"))
  ));
}

function topEffectiveWorkingSet(
  sessionId: string,
  identity: MetricIdentity,
  sets: readonly HistoryCorrectionSnapshot["exercises"][number]["sets"][number][],
): string | null {
  const completed = sets.filter(
    ({ kind, status }) => kind === "working" && status === "completed",
  );
  const candidates = completed.flatMap((set) => {
    if (set.observation === undefined) {
      return [];
    }
    const observation = parseMetricObservation(identity, set.observation);
    return [{
      observation,
      completedAtMs: set.completedAtMs ?? 0,
      sessionId,
      setOrdinal: set.ordinal,
      setId: set.id,
    }];
  });
  if (candidates.length === 0) {
    return null;
  }
  const target = parseMetricTarget(identity, completed[0]!.target);
  const best = selectBestMetricCandidate({ identity, target, candidates });
  if (best === null) {
    return null;
  }
  const set = completed.find(({ id }) => id === best.setId)!;
  return setValue(set, best.observation);
}

function detailFromEffectiveOverlay(
  session: SessionRow,
  snapshot: HistoryCorrectionSnapshot,
  recommendations: readonly SessionRecommendation[],
  nonLoadOutcomes: readonly SessionNonLoadOutcome[],
): SessionDetail {
  const effectiveRevision = session.effective_revision;
  if (effectiveRevision === null) {
    throw new WorkoutOutcomeConflictError(
      "session_detail_effective_revision_missing",
    );
  }
  const exercises: SessionExerciseDetail[] = snapshot.exercises.map((exercise) => {
    const identity = parseMetricIdentity(exercise.metricIdentity);
    const setDetails = exercise.sets.map((set): SessionSetDetail => {
      const target = parseMetricTarget(identity, set.target);
      const observation = set.observation === undefined
        ? null
        : parseMetricObservation(identity, set.observation);
      return {
        id: set.id,
        kind: set.kind,
        ordinal: set.ordinal,
        status: set.status,
        metricIdentity: identity,
        target,
        observation,
        value: setValue(set, observation),
      };
    });
    const workingSets = setDetails.filter(({ kind }) => kind === "working");
    const totalWorkingReps = identity.profile === "load_reps"
      ? workingSets
          .filter(({ status, observation }) =>
            status === "completed" && observation?.profile === "load_reps",
          )
          .reduce((total, { observation }) =>
            total + (observation?.profile === "load_reps" ? observation.reps : 0), 0)
      : null;
    return {
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      metricIdentity: identity,
      metricProfile: identity.profile,
      ordinal: exercise.ordinal,
      status: exercise.status,
      revision: effectiveRevision,
      effort: exercise.effort,
      topWorkingSet: topEffectiveWorkingSet(session.id, identity, exercise.sets),
      totalWorkingReps,
      warmups: setDetails.filter(({ kind }) => kind === "warmup"),
      workingSets,
    };
  });
  const workingSets = snapshot.exercises.flatMap(({ sets }) => sets).filter(
    ({ kind }) => kind === "working",
  );
  const endedAtMs = snapshot.session.completedAtMs;
  return {
    id: session.id,
    status: snapshot.session.status,
    statusLabel: sessionStatusLabel(snapshot.session.status),
    sourceLabel: sourceLabel(snapshot.session.source),
    planName: snapshot.session.planName,
    dayName: snapshot.session.dayName,
    localDate: snapshot.session.localDate,
    timezone: snapshot.session.timezone,
    startedAtMs: snapshot.session.startedAtMs,
    endedAtMs,
    durationMs: endedAtMs === null ? null : endedAtMs - snapshot.session.startedAtMs,
    revision: effectiveRevision,
    corrected: true,
    ownerNote: snapshot.session.ownerNote,
    exerciseProgress: percentage(
      snapshot.exercises.filter(({ status }) => status === "completed").length,
      snapshot.exercises.length,
    ),
    workingSetProgress: percentage(
      workingSets.filter(({ status }) => status === "completed").length,
      workingSets.length,
    ),
    exercises,
    nonLoadOutcomes,
    recommendations,
    recommendationStatus: recommendationStatus(recommendations),
    resumable: sessionIsResumable(snapshot.session.status),
    readOnly: true,
  };
}

function integerArray(value: unknown): readonly number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => Number.isSafeInteger(entry))
    : [];
}

async function recommendationsForSession(
  executor: QueryExecutor,
  sessionId: string,
  sets: readonly SetRow[],
  exercises: readonly ExerciseRow[],
): Promise<readonly SessionRecommendation[]> {
  const references = uniqueTargetReferences(sets);
  if (references.length === 0) {
    return [];
  }
  const rows = (
    await Promise.all(references.map((reference) =>
      executor.queryAll<{
        id: string;
        exercise_id: string;
        status: SessionRecommendation["status"];
        evidence_json: string;
        current_target_json: string;
        proposed_target_json: string;
        rule_version: number;
        created_at_ms: number;
      }>(
        `SELECT id, exercise_id, status, evidence_json, current_target_json,
                proposed_target_json, rule_version, created_at_ms
         FROM ${recommendationTable(reference.graph)}
         WHERE ${recommendationTargetColumn(reference.graph)} = ?
           AND COALESCE(
             json_extract(evidence_json, '$.source.sessionId'),
             json_extract(evidence_json, '$.sessionId')
           ) = ?
         ORDER BY created_at_ms DESC, id`,
        [reference.id, sessionId],
      )
    ))
  ).flat().sort((left, right) =>
    right.created_at_ms - left.created_at_ms || left.id.localeCompare(right.id)
  );
  const typedRows: readonly Readonly<{
    id: string;
    exercise_id: string;
    status: SessionRecommendation["status"];
    evidence_json: string;
    current_target_json: string;
    proposed_target_json: string;
    rule_version: number;
  }>[] = rows;
  const seen = new Set<string>();
  return typedRows.flatMap((row): readonly SessionRecommendation[] => {
    if (seen.has(row.exercise_id) || row.rule_version !== 1) {
      return [];
    }
    const evidence = parseTarget(row.evidence_json);
    const current = parseTarget(row.current_target_json);
    const proposed = parseTarget(row.proposed_target_json);
    const decision = evidence.decision;
    const confidence = evidence.confidence;
    const reason = evidence.reason;
    const currentLoadGrams = current.loadGrams;
    const proposedLoadGrams = proposed.loadGrams;
    if (
      !["baseline", "hold", "increase", "retry", "manual"].includes(
        String(decision),
      )
      || !["baseline", "high", "manual"].includes(String(confidence))
      || typeof reason !== "string"
      || !Number.isSafeInteger(currentLoadGrams)
      || !Number.isSafeInteger(proposedLoadGrams)
    ) {
      return [];
    }
    seen.add(row.exercise_id);
    return [{
      id: row.id,
      exerciseId: row.exercise_id,
      exerciseName: exercises.find(
        ({ exercise_id: exerciseId }) => exerciseId === row.exercise_id,
      )?.exercise_name ?? "Exercise",
      status: row.status,
      decision: decision as SessionRecommendation["decision"],
      reason,
      confidence: confidence as SessionRecommendation["confidence"],
      currentLoadGrams: currentLoadGrams as number,
      proposedLoadGrams: proposedLoadGrams as number,
      currentTargetReps: integerArray(
        current.targetReps ?? current.maxReps,
      ),
      proposedTargetReps: integerArray(proposed.targetReps),
      comparableReps: integerArray(
        evidence.comparableReps
        ?? (evidence.evaluator as Record<string, unknown> | undefined)
          ?.comparableReps,
      ),
      rule: "load_reps.double_progression.v1",
      ruleVersion: 1,
    }];
  });
}

async function loadSessionDetail(
  executor: QueryExecutor,
  sessionId: string,
): Promise<SessionDetail> {
  const { session, exercises, sets } = await sessionRows(executor, sessionId);
  const recommendations = await recommendationsForSession(
    executor,
    session.id,
    sets,
    exercises,
  );
  const overlay = effectiveOverlaySnapshot(session);
  if (session.lifecycle === "voided" && session.status !== "in_progress") {
    return detailFromEffectiveOverlay(
      session,
      overlay ?? {
        version: 1,
        session: {
          id: session.id,
          source: session.source,
          status: session.status === "partial" ? "partial" : "completed",
          planId: null,
          planDayId: null,
          planName: session.plan_name,
          dayName: session.day_name,
          localDate: session.local_date,
          timezone: session.timezone,
          startedAtMs: session.started_at_ms,
          completedAtMs: session.completed_at_ms,
          ownerNote: null,
        },
        exercises: [],
      },
      recommendations,
      [],
    );
  }
  if (overlay !== null && session.lifecycle !== "voided") {
    return detailFromEffectiveOverlay(
      session,
      overlay,
      recommendations,
      await effectiveNonLoadOutcomes(executor, session, overlay, exercises, sets),
    );
  }
  const nonLoadOutcomes = await rawNonLoadOutcomes(
    executor,
    session,
    exercises,
    sets,
  );
  const exerciseDetails: SessionExerciseDetail[] = exercises.map((exercise) => {
    const identity = exerciseIdentity(exercise);
    const exerciseSets = sets.filter(
      ({ session_exercise_id: exerciseId }) => exerciseId === exercise.id,
    );
    const toDetail = (row: SetRow): SessionSetDetail => {
      const rowIdentity = setIdentity(row, exercise);
      const target = parseSetTarget(row, rowIdentity);
      const observation = parseSetObservation(row, rowIdentity);
      return {
        id: row.id,
        kind: row.set_kind,
        ordinal: row.ordinal,
        status: row.status,
        metricIdentity: rowIdentity,
        target,
        observation,
        value: setValue(row, observation),
      };
    };
    const totalWorkingReps = exercise.metric_profile === "load_reps"
      ? exerciseSets
          .filter(
            ({ set_kind, status }) =>
              set_kind === "working" && status === "completed",
          )
          .reduce((total, { observed_reps: reps }) => total + (reps ?? 0), 0)
      : null;
    return {
      id: exercise.id,
      exerciseId: exercise.exercise_id,
      name: exercise.exercise_name,
      metricIdentity: identity,
      metricProfile: exercise.metric_profile,
      ordinal: exercise.ordinal,
      status: exercise.status,
      revision: exercise.revision,
      effort: exercise.effort,
      topWorkingSet: topWorkingSet(
        session.id,
        exercise,
        exerciseSets,
      ),
      totalWorkingReps,
      warmups: exerciseSets
        .filter(({ set_kind }) => set_kind === "warmup")
        .map(toDetail),
      workingSets: exerciseSets
        .filter(({ set_kind }) => set_kind === "working")
        .map(toDetail),
    };
  });
  const workingSets = sets.filter(({ set_kind }) => set_kind === "working");
  const endedAtMs = session.completed_at_ms;
  return {
    id: session.id,
    status: session.status,
    statusLabel: sessionStatusLabel(session.status),
    sourceLabel: sourceLabel(session.source),
    planName: session.plan_name,
    dayName: session.day_name,
    localDate: session.local_date,
    timezone: session.timezone,
    startedAtMs: session.started_at_ms,
    endedAtMs,
    durationMs: endedAtMs === null ? null : endedAtMs - session.started_at_ms,
    revision: session.revision,
    exerciseProgress: percentage(
      exercises.filter(({ status }) => status === "completed").length,
      exercises.length,
    ),
    workingSetProgress: percentage(
      workingSets.filter(({ status }) => status === "completed").length,
      workingSets.length,
    ),
    exercises: exerciseDetails,
    nonLoadOutcomes,
    recommendations,
    recommendationStatus: recommendationStatus(recommendations),
    resumable: sessionIsResumable(session.status),
    readOnly: true,
  };
}

async function idleRest(
  transaction: SqliteTransactionExecutor,
  sessionId: string,
): Promise<number> {
  const [rest] = await transaction.queryAll<{ revision: number }>(
    "SELECT revision FROM session_rest_states WHERE session_id = ?",
    [sessionId],
  );
  const revision = (rest?.revision ?? 0) + 1;
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

async function enqueueFinishEffects(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    sessionId: string;
    sessionRevision: number;
    restRevision: number;
    nowMs: number;
    recommend: boolean;
  }>,
): Promise<void> {
  await transaction.execute(
    `UPDATE pending_effects
     SET status = 'superseded',
         claimed_at_ms = NULL,
         lease_expires_at_ms = NULL,
         last_error_code = 'outcome_superseded',
         updated_at_ms = ?
     WHERE effect_type = 'reconcile_rest_notification'
       AND subject_id = ?
       AND status IN ('pending', 'processing')`,
    [input.nowMs, input.sessionId],
  );
  await enqueuePendingEffect(transaction, {
    id: `effect_rest_outcome_${input.sessionId}_${input.restRevision}`,
    type: "reconcile_rest_notification",
    payloadVersion: 1,
    payload: {
      version: 1,
      sessionId: input.sessionId,
      restRevision: input.restRevision,
    },
    idempotencyKey: `rest:outcome:${input.sessionId}:${input.restRevision}`,
    subjectId: input.sessionId,
    expectedRevision: input.restRevision,
    nowMs: input.nowMs,
  });
  if (input.recommend) {
    await enqueuePendingEffect(transaction, {
      id: `effect_recommend_${input.sessionId}_${input.sessionRevision}`,
      type: "regenerate_load_reps_recommendation",
      payloadVersion: 1,
      payload: {
        version: 1,
        sessionId: input.sessionId,
        sessionRevision: input.sessionRevision,
      },
      idempotencyKey:
        `recommend:${input.sessionId}:${input.sessionRevision}`,
      subjectId: input.sessionId,
      expectedRevision: input.sessionRevision,
      nowMs: input.nowMs,
    });
  }
}

async function finish(
  transaction: SqliteTransactionExecutor,
  input: FinishCompletedInput,
  action: "finish_completed" | "finish_partial" | "save_zero_sets" | "discard",
): Promise<FinishOutcomeResult> {
  const { session, exercises, sets } = await sessionRows(
    transaction,
    input.sessionId,
  );
  if (
    session.status !== "in_progress"
    || session.revision !== input.expectedSessionRevision
  ) {
    throw new WorkoutOutcomeConflictError("finish_workout_conflict");
  }
  const workingSets = sets.filter(({ set_kind }) => set_kind === "working");
  const completedWorkingSets = workingSets.filter(
    ({ status }) => status === "completed",
  );
  if (
    action === "finish_completed"
    && (
      workingSets.some(({ status }) =>
        status !== "completed" && status !== "skipped"
      )
      || exercises.some(({ status }) =>
        status !== "completed" && status !== "skipped"
      )
    )
  ) {
    throw new WorkoutOutcomeConflictError("workout_not_complete");
  }
  if (action === "save_zero_sets" && completedWorkingSets.length !== 0) {
    throw new WorkoutOutcomeConflictError("zero_set_outcome_has_work");
  }

  const nextStatus = nextWorkoutStatus(session.status, action);
  const overlay = effectiveOverlaySnapshot(session);
  const preservePointer = nextStatus === "partial";
  const result = await transaction.execute(
    `UPDATE workout_sessions
     SET status = ?,
         completed_at_ms = ?,
         active_session_exercise_id = CASE
           WHEN ? THEN active_session_exercise_id ELSE NULL END,
         active_set_id = CASE WHEN ? THEN active_set_id ELSE NULL END,
         revision = revision + 1
     WHERE id = ? AND status = 'in_progress' AND revision = ?`,
    [
      nextStatus,
      input.endedAtMs,
      preservePointer ? 1 : 0,
      preservePointer ? 1 : 0,
      input.sessionId,
      input.expectedSessionRevision,
    ],
  );
  if (result.changes !== 1) {
    throw new Error("finish_workout_conditional_update_failed");
  }
  const sessionRevision = input.expectedSessionRevision + 1;
  const restRevision = await idleRest(transaction, input.sessionId);
  if (nextStatus === "completed" || nextStatus === "partial") {
    let historyImpact: ReturnType<typeof collectHistoryImpact>;
    if (overlay === null) {
      const activeHistory = historySubjectSnapshot(
        session,
        exercises,
        sets,
        "active",
      );
      historyImpact = collectHistoryImpact({
        oldSnapshot: { ...activeHistory, lifecycle: "voided" },
        newSnapshot: activeHistory,
      });
    } else {
      const nextSnapshot = sourceHistoryCorrectionSnapshot(
        session,
        exercises,
        sets,
        nextStatus,
        input.endedAtMs,
      );
      await reactivateHistoryOverlayAfterResume(
        transaction,
        session,
        overlay,
        nextSnapshot,
        input.endedAtMs,
      );
      historyImpact = collectHistoryImpact({
        oldSnapshot: historySubjectSnapshotFromCorrectionSnapshot(
          overlay,
          "voided",
        ),
        newSnapshot: historySubjectSnapshotFromCorrectionSnapshot(
          nextSnapshot,
          "active",
        ),
      });
    }
    await invalidateAndAdvanceHistoryProjectionSubjects(transaction, {
      ...historyImpact,
      nowMs: input.endedAtMs,
    });
  } else if (
    (nextStatus === "discarded" || nextStatus === "zero_sets")
    && overlay !== null
  ) {
    const historyImpact = await terminalizeVoidedHistoryOverlay(
      transaction,
      session,
      overlay,
      nextStatus,
      input.endedAtMs,
    );
    await invalidateAndAdvanceHistoryProjectionSubjects(transaction, {
      ...historyImpact,
      nowMs: input.endedAtMs,
    });
  }
  await enqueueFinishEffects(transaction, {
    sessionId: input.sessionId,
    sessionRevision,
    restRevision,
    nowMs: input.endedAtMs,
    recommend: nextStatus === "completed" || nextStatus === "partial",
  });
  return {
    detail: await loadSessionDetail(transaction, input.sessionId),
    invalidationScopes: [
      ["today"],
      ["session-detail", input.sessionId],
      ["workout-completion", input.sessionId],
    ],
  };
}

function parseTarget(json: string): Record<string, unknown> {
  const value = JSON.parse(json) as unknown;
  if (typeof value !== "object" || value === null) {
    throw new WorkoutOutcomeConflictError("progression_target_invalid");
  }
  return value as Record<string, unknown>;
}

function recommendationTarget(
  result: ReturnType<typeof evaluateLoadRepsV1>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...current,
    version: 1,
    profile: "load_reps",
    loadGrams: result.proposed.loadGrams,
    targetReps: result.proposed.targetReps,
  };
}

function parsePolicyRule(json: string): Readonly<Record<string, unknown>> | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Readonly<Record<string, unknown>>
      : null;
  } catch {
    return null;
  }
}

function isCopiedAutomaticLoadRepsPolicy(
  policy: CopiedPolicyRow,
  metricIdentity: MetricIdentity,
): boolean {
  if (
    policy.policy_kind !== "automatic"
    || policy.policy_id !== LOAD_REPS_RULE
    || policy.policy_version !== 1
    || policy.metric_profile !== metricIdentity.profile
    || policy.metric_contract_version !== metricIdentity.contractVersion
    || policy.exercise_metric_generation
      !== metricIdentity.exerciseMetricGeneration
  ) {
    return false;
  }
  const rule = parsePolicyRule(policy.rule_json);
  return rule?.kind === policy.policy_kind
    && rule.id === policy.policy_id
    && rule.version === policy.policy_version;
}

async function copiedOwnedPolicy(
  executor: QueryExecutor,
  targetId: string,
): Promise<CopiedPolicyRow | null> {
  const [policy] = await executor.queryAll<CopiedPolicyRow>(
    `SELECT policy.policy_kind, policy.policy_id, policy.policy_version,
            policy.rule_json, policy.metric_profile,
            policy.metric_contract_version,
            policy.exercise_metric_generation
     FROM owned_plan_progression_policies policy
     JOIN owned_plan_working_set_targets target
       ON target.plan_day_exercise_id = policy.plan_day_exercise_id
     WHERE target.id = ?
       AND policy.status = 'active'
       AND policy.metric_profile = target.metric_profile
       AND policy.metric_contract_version = target.metric_contract_version
       AND policy.exercise_metric_generation =
         target.exercise_metric_generation`,
    [targetId],
  );
  return policy ?? null;
}

async function copiedLegacyPolicy(
  executor: QueryExecutor,
  targetId: string,
): Promise<CopiedPolicyRow | null> {
  const [policy] = await executor.queryAll<LegacyPolicyRow>(
    `SELECT policy.policy_type, policy.policy_version, policy.rule_json,
            policy.metric_profile, policy.metric_contract_version,
            policy.exercise_metric_generation
     FROM progression_policies policy
     JOIN plan_working_set_targets target
       ON target.plan_day_exercise_id = policy.plan_day_exercise_id
     WHERE target.id = ?
       AND policy.status = 'active'
       AND policy.metric_profile = target.metric_profile
       AND policy.metric_contract_version = target.metric_contract_version
       AND policy.exercise_metric_generation =
         target.exercise_metric_generation`,
    [targetId],
  );
  if (policy === undefined) {
    return null;
  }
  const rule = parsePolicyRule(policy.rule_json);
  const ruleId = rule?.id;
  if (
    rule === null
    || (rule.kind !== "manual_hold" && rule.kind !== "plan_authored")
    || rule.version !== policy.policy_version
    || typeof ruleId !== "string"
    || ruleId.trim() === ""
    || policy.policy_type !== (rule.kind === "manual_hold"
      ? "manual_hold"
      : policy.metric_profile)
  ) {
    return null;
  }
  return {
    policy_kind: rule.kind,
    policy_id: ruleId,
    policy_version: rule.version,
    rule_json: policy.rule_json,
    metric_profile: policy.metric_profile,
    metric_contract_version: policy.metric_contract_version,
    exercise_metric_generation: policy.exercise_metric_generation,
  };
}

export function createWorkoutOutcomeRepository(
  kernel: SqliteKernel,
): WorkoutOutcomeRepository & ProgressionRepository {
  const repository: WorkoutOutcomeRepository & ProgressionRepository = {
    getSessionDetail: (sessionId) => loadSessionDetail(kernel, sessionId),

    finishCompleted: (input) =>
      kernel.write((transaction) =>
        finish(transaction, input, "finish_completed"),
      ),

    finishPartial: (input: FinishPartialInput) =>
      kernel.write((transaction) =>
        finish(transaction, input, "finish_partial"),
      ),

    saveZeroSetWorkout: (input: SaveZeroSetInput) =>
      kernel.write((transaction) =>
        finish(transaction, input, "save_zero_sets"),
      ),

    discardWorkout: (input: DiscardWorkoutInput) =>
      kernel.write((transaction) =>
        finish(transaction, input, "discard"),
      ),

    async resumePartialWorkout(input: ResumePartialWorkoutInput) {
      return kernel.write(async (transaction) => {
        const { session, exercises, sets } = await sessionRows(
          transaction,
          input.sessionId,
        );
        const overlay = effectiveOverlaySnapshot(session);
        const expectedRevision = overlay === null
          ? session.revision
          : session.effective_revision;
        if (
          session.status !== "partial"
          || expectedRevision !== input.expectedSessionRevision
          || (overlay !== null && session.lifecycle !== "active")
        ) {
          throw new WorkoutOutcomeConflictError("resume_partial_conflict");
        }
        const result = await transaction.execute(
          `UPDATE workout_sessions
           SET status = 'in_progress',
               completed_at_ms = NULL,
               revision = revision + 1
           WHERE id = ? AND status = 'partial' AND revision = ?`,
          [input.sessionId, session.revision],
        );
        if (result.changes !== 1) {
          throw new WorkoutOutcomeConflictError("resume_partial_conflict");
        }
        if (overlay !== null) {
          await voidActiveHistoryOverlayForResume(
            transaction,
            session,
            input.resumedAtMs,
          );
        }
        const activeHistory = overlay === null
          ? historySubjectSnapshot(session, exercises, sets, "active")
          : historySubjectSnapshotFromCorrectionSnapshot(overlay, "active");
        const historyImpact = collectHistoryImpact({
          oldSnapshot: activeHistory,
          newSnapshot: { ...activeHistory, lifecycle: "voided" },
        });
        await invalidateAndAdvanceHistoryProjectionSubjects(transaction, {
          ...historyImpact,
          nowMs: input.resumedAtMs,
        });
        return {
          sessionId: input.sessionId,
          status: "in_progress" as const,
          sessionRevision: session.revision + 1,
        };
      });
    },

    async skipExercise(input: SkipExerciseInput) {
      return kernel.write(async (transaction) => {
        const { session } = await sessionRows(transaction, input.sessionId);
        const [exercise] = await transaction.queryAll<ExerciseRow>(
          `SELECT id, exercise_id, exercise_name, metric_profile, ordinal,
                  status, effort, revision
           FROM session_exercises
           WHERE id = ? AND session_id = ?`,
          [input.sessionExerciseId, input.sessionId],
        );
        if (
          session.status !== "in_progress"
          || session.revision !== input.expectedSessionRevision
          || exercise === undefined
          || exercise.revision !== input.expectedExerciseRevision
          || !["planned", "active"].includes(exercise.status)
        ) {
          throw new WorkoutOutcomeConflictError("skip_exercise_conflict");
        }
        await transaction.execute(
          `UPDATE session_sets
           SET status = 'skipped', revision = revision + 1
           WHERE session_exercise_id = ? AND status IN ('planned', 'draft')`,
          [exercise.id],
        );
        const updated = await transaction.execute(
          `UPDATE session_exercises
           SET status = 'skipped', revision = revision + 1
           WHERE id = ? AND revision = ? AND status IN ('planned', 'active')`,
          [exercise.id, input.expectedExerciseRevision],
        );
        if (updated.changes !== 1) {
          throw new Error("skip_exercise_conditional_update_failed");
        }
        const [next] = await transaction.queryAll<{
          exercise_id: string;
          set_id: string;
        }>(
          `SELECT se.id AS exercise_id, ss.id AS set_id
           FROM session_exercises se
           JOIN session_sets ss ON ss.session_exercise_id = se.id
           WHERE se.session_id = ?
             AND se.status IN ('planned', 'active')
             AND ss.set_kind = 'working'
             AND ss.status IN ('planned', 'draft')
           ORDER BY se.ordinal, ss.ordinal
           LIMIT 1`,
          [input.sessionId],
        );
        if (next !== undefined) {
          await transaction.execute(
            `UPDATE session_exercises
             SET status = 'active', revision = revision + 1
             WHERE id = ? AND status = 'planned'`,
            [next.exercise_id],
          );
        }
        const sessionUpdate = await transaction.execute(
          `UPDATE workout_sessions
           SET active_session_exercise_id = ?,
               active_set_id = ?,
               revision = revision + 1
           WHERE id = ? AND status = 'in_progress' AND revision = ?`,
          [
            next?.exercise_id ?? null,
            next?.set_id ?? null,
            input.sessionId,
            input.expectedSessionRevision,
          ],
        );
        if (sessionUpdate.changes !== 1) {
          throw new Error("skip_exercise_session_update_failed");
        }
        const restRevision = await idleRest(transaction, input.sessionId);
        await enqueueFinishEffects(transaction, {
          sessionId: input.sessionId,
          sessionRevision: input.expectedSessionRevision + 1,
          restRevision,
          nowMs: input.nowMs,
          recommend: false,
        });
        return {
          sessionId: input.sessionId,
          status: "in_progress" as const,
          sessionRevision: input.expectedSessionRevision + 1,
        };
      });
    },

    async recordExerciseEffort(input: RecordExerciseEffortInput) {
      const outcome = await kernel.write(async (transaction) => {
        const [session] = await transaction.queryAll<{
          status: WorkoutSessionStatus;
          revision: number;
        }>(
          `SELECT status, revision FROM workout_sessions
           WHERE id = ?`,
          [input.sessionId],
        );
        if (
          session === undefined
          || !["completed", "partial"].includes(session.status)
        ) {
          return {
            kind: "conflict" as const,
            code: "exercise_effort_session_invalid",
          };
        }
        const result = await transaction.execute(
          `UPDATE session_exercises
           SET effort = ?,
               effort_recorded_at_ms = ?,
               revision = revision + 1
           WHERE id = ?
             AND session_id = ?
             AND revision = ?
             AND status = 'completed'
             AND metric_profile = 'load_reps'
             AND effort IS NULL`,
          [
            input.effort,
            input.recordedAtMs,
            input.sessionExerciseId,
            input.sessionId,
            input.expectedExerciseRevision,
          ],
        );
        if (result.changes !== 1) {
          const [current] = await transaction.queryAll<{
            effort: ExerciseEffort | null;
          }>(
            `SELECT effort FROM session_exercises
             WHERE id = ? AND session_id = ?`,
            [input.sessionExerciseId, input.sessionId],
          );
          return {
            kind: "conflict" as const,
            code: current?.effort === null
              ? "exercise_effort_conflict"
              : "exercise_effort_already_recorded",
          };
        }
        const sessionUpdate = await transaction.execute(
          `UPDATE workout_sessions
           SET revision = revision + 1
           WHERE id = ? AND revision = ? AND status IN ('completed', 'partial')`,
          [input.sessionId, session.revision],
        );
        if (sessionUpdate.changes !== 1) {
          throw new Error("exercise_effort_session_update_failed");
        }
        const nextSessionRevision = session.revision + 1;
        await enqueuePendingEffect(transaction, {
          id: `effect_recommend_effort_${input.sessionExerciseId}_${nextSessionRevision}`,
          type: "regenerate_load_reps_recommendation",
          payloadVersion: 1,
          payload: {
            version: 1,
            sessionId: input.sessionId,
            sessionRevision: nextSessionRevision,
          },
          idempotencyKey:
            `recommend:effort:${input.sessionExerciseId}:${nextSessionRevision}`,
          subjectId: input.sessionId,
          expectedRevision: nextSessionRevision,
          nowMs: input.recordedAtMs,
        });
        return {
          kind: "result" as const,
          value: {
            sessionExerciseId: input.sessionExerciseId,
            effort: input.effort,
            revision: input.expectedExerciseRevision + 1,
          },
        };
      });
      if (outcome.kind === "conflict") {
        throw new WorkoutOutcomeConflictError(outcome.code);
      }
      return outcome.value;
    },

    async acceptRecommendation(input: RecommendationDecisionInput) {
      return kernel.write(async (transaction) => {
        const recommendation = await pendingRecommendation(
          transaction,
          input.recommendationId,
        );
        if (recommendation === null || recommendation.status !== "pending") {
          throw new WorkoutOutcomeConflictError(
            "recommendation_decision_conflict",
          );
        }
        const graph = recommendation.target_graph;
        const recommendationTableName = recommendationTable(graph);
        const targetScope = await recommendationTargetScope(
          transaction,
          graph,
          recommendation.target_id,
        );
        const target = targetScope.find(({ id }) => id === recommendation.target_id);
        const supersede = async () => {
          await transaction.execute(
            `UPDATE ${recommendationTableName}
             SET status = 'superseded', decided_at_ms = ?
             WHERE id = ? AND status = 'pending'`,
            [input.decidedAtMs, input.recommendationId],
          );
          return {
            recommendationId: input.recommendationId,
            status: "superseded" as const,
          };
        };
        if (
          recommendation.evidence_version !== ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION
          || recommendation.rule_type !== "load_reps"
          || target === undefined
          || target.exercise_id !== recommendation.exercise_id
          || target.metric_profile !== recommendation.metric_profile
          || target.metric_contract_version !== recommendation.metric_contract_version
          || target.exercise_metric_generation
            !== recommendation.exercise_metric_generation
          || targetScope.some(({ revision }) =>
            revision !== recommendation.target_revision
          )
        ) {
          return supersede();
        }
        let sourceSessionId: string;
        let sourceSessionRevision: number;
        let evidence;
        let proposed: MetricTarget;
        try {
          proposed = parseMetricTargetJson(
            parseMetricIdentity({
              profile: recommendation.metric_profile,
              contractVersion: recommendation.metric_contract_version,
              exerciseMetricGeneration: recommendation.exercise_metric_generation,
            }),
            recommendation.proposed_target_json,
          );
          evidence = parseActionableRecommendationEvidence({
            evidence: parseTarget(recommendation.evidence_json),
            expected: {
              rule: {
                id: LOAD_REPS_RULE,
                version: recommendation.rule_version,
              },
              metricIdentity: {
                profile: recommendation.metric_profile,
                contractVersion: recommendation.metric_contract_version,
                exerciseMetricGeneration: recommendation.exercise_metric_generation,
              },
              sourceRevision: recommendation.source_revision,
              targetRevision: recommendation.target_revision,
              targetId: recommendation.target_id,
              sourceSessionRevision: recommendation.source_revision,
              currentTarget: parseTarget(target.target_json),
              proposedTarget: proposed,
              createdAtMs: recommendation.created_at_ms,
            },
          });
          sourceSessionId = evidence.source.sessionId;
          sourceSessionRevision = evidence.source.sessionRevision;
        } catch {
          return supersede();
        }
        const [sourceSession] = await transaction.queryAll<
          RecommendationSourceSessionRow
        >(
          `SELECT revision, status
           FROM workout_sessions
           WHERE id = ?`,
          [sourceSessionId!],
        );
        if (
          sourceSession === undefined
          || sourceSession.revision !== sourceSessionRevision!
          || !["completed", "partial"].includes(sourceSession.status)
        ) {
          return supersede();
        }
        if (
          evidence.rule.id !== LOAD_REPS_RULE
          || evidence.targetScope.length !== targetScope.length
          || evidence.targetScope.some(({ id, revision }) =>
            targetScope.find((targetRow) => targetRow.id === id)?.revision
              !== revision
          )
        ) {
          return supersede();
        }
        const loadGrams = proposed.profile === "load_reps"
          ? proposed.loadGrams
          : null;
        const targetReps = proposed.profile === "load_reps"
          ? proposed.targetReps
          : null;
        if (
          !Number.isSafeInteger(loadGrams)
          || (loadGrams as number) < 0
          || !Array.isArray(targetReps)
          || targetReps.some((value) =>
            !Number.isSafeInteger(value) || (value as number) < 1
          )
        ) {
          throw new WorkoutOutcomeConflictError(
            "recommendation_target_invalid",
          );
        }
        for (const row of targetScope) {
          const current = parseTarget(row.target_json);
          const update = graph === "owned"
            ? `UPDATE owned_plan_working_set_targets
               SET target_json = ?,
                   revision = revision + 1
               WHERE id = ? AND revision = ?`
            : `UPDATE plan_working_set_targets
               SET load_grams = ?,
                   target_json = ?,
                   revision = revision + 1
               WHERE id = ? AND revision = ?`;
          const targetJson = JSON.stringify({
            ...current,
            loadGrams,
            targetReps,
          });
          const updateResult = await transaction.execute(
            update,
            graph === "owned"
              ? [targetJson, row.id, row.revision]
              : [loadGrams as number, targetJson, row.id, row.revision],
          );
          if (updateResult.changes !== 1) {
            throw new WorkoutOutcomeConflictError(
              "recommendation_target_compare_and_swap_failed",
            );
          }
        }
        const decision = await transaction.execute(
          `UPDATE ${recommendationTableName}
           SET status = 'accepted', decided_at_ms = ?,
               target_revision = target_revision + 1
           WHERE id = ? AND status = 'pending'`,
          [input.decidedAtMs, input.recommendationId],
        );
        if (decision.changes !== 1) {
          throw new WorkoutOutcomeConflictError(
            "recommendation_decision_conflict",
          );
        }
        return {
          recommendationId: input.recommendationId,
          status: "accepted" as const,
        };
      });
    },

    async keepCurrentTarget(
      input: RecommendationDecisionInput,
    ): Promise<RecommendationDecisionResult> {
      return kernel.write(async (transaction) => {
        const recommendation = await pendingRecommendation(
          transaction,
          input.recommendationId,
        );
        if (recommendation === null) {
          throw new WorkoutOutcomeConflictError(
            "recommendation_decision_conflict",
          );
        }
        const result = await transaction.execute(
          `UPDATE ${recommendationTable(recommendation.target_graph)}
           SET status = 'rejected', decided_at_ms = ?
           WHERE id = ? AND status = 'pending'`,
          [input.decidedAtMs, input.recommendationId],
        );
        if (result.changes !== 1) {
          throw new WorkoutOutcomeConflictError(
            "recommendation_decision_conflict",
          );
        }
        return {
          recommendationId: input.recommendationId,
          status: "rejected" as const,
        };
      });
    },

    async generateRecommendationsForSession(
      sessionId: string,
      expectedSessionRevision: number,
      nowMs: number,
    ) {
      return kernel.write(async (transaction) => {
        const { session, exercises, sets } = await sessionRows(
          transaction,
          sessionId,
        );
        if (
          !["completed", "partial"].includes(session.status)
          || session.revision !== expectedSessionRevision
        ) {
          throw new WorkoutOutcomeConflictError(
            "recommendation_source_stale",
          );
        }
        let generated = 0;
        for (const exercise of exercises) {
          if (exercise.status === "skipped") {
            continue;
          }
          const exerciseSets = sets.filter(
            ({ session_exercise_id: exerciseId }) =>
              exerciseId === exercise.id,
          );
          const reference = exerciseSets
            .filter(({ set_kind }) => set_kind === "working")
            .map(targetReference)
            .find((value): value is TargetReference => value !== null);
          if (reference === undefined) {
            continue;
          }
          const recommendationId =
            `recommendation_${exercise.id}_${expectedSessionRevision}`;
          const [existing] = await transaction.queryAll<{
            exercise_id: string;
            target_id: string;
            evidence_json: string;
          }>(
            `SELECT exercise_id,
                    ${recommendationTargetColumn(reference.graph)} AS target_id,
                    evidence_json
             FROM ${recommendationTable(reference.graph)}
             WHERE id = ?`,
            [recommendationId],
          );
          if (existing !== undefined) {
            const evidence = parseTarget(existing.evidence_json);
            if (
              existing.exercise_id !== exercise.exercise_id
              || existing.target_id !== reference.id
              || (
                evidence.sessionId
                ?? (evidence.source as Record<string, unknown> | undefined)
                  ?.sessionId
              ) !== sessionId
              || (
                evidence.sessionExerciseId
                ?? (evidence.source as Record<string, unknown> | undefined)
                  ?.sessionExerciseId
              ) !== exercise.id
            ) {
              throw new WorkoutOutcomeConflictError(
                "recommendation_replay_conflict",
              );
            }
            generated += 1;
            continue;
          }
          const [target] = await transaction.queryAll<TargetRow>(
            `SELECT id, plan_day_exercise_id, target_json, revision
             FROM ${targetTable(reference.graph)} WHERE id = ?`,
            [reference.id],
          );
          if (target === undefined) {
            continue;
          }
          const currentTarget = parseTarget(target.target_json);
          const working = exerciseSets.filter(
            ({ set_kind }) => set_kind === "working",
          );
          if (!working.some(({ status }) => status === "completed")) {
            continue;
          }
          const policy = reference.graph === "owned"
            ? await copiedOwnedPolicy(transaction, target.id)
            : null;
          if (reference.graph === "owned" && policy === null) {
            continue;
          }
          if (exercise.metric_profile !== "load_reps") {
            continue;
          }
          if (
            reference.graph === "owned"
            && (
              policy === null
              || !isCopiedAutomaticLoadRepsPolicy(
                policy,
                exerciseIdentity(exercise),
              )
            )
          ) {
            continue;
          }
          const progressionInput: LoadRepsProgressionInput = {
            version: 1,
            rule: LOAD_REPS_RULE,
            target: {
              version: 1,
              profile: "load_reps",
              loadGrams: Number(currentTarget.loadGrams),
              minReps: Number(currentTarget.minReps),
              maxReps: Number(currentTarget.maxReps),
              incrementGrams: Number(currentTarget.incrementGrams),
              plannedSets: working.length,
            },
            sets: exerciseSets.map((set): LoadRepsEvidenceSet => ({
              id: set.id,
              kind: set.set_kind,
              status: set.status,
              profile: set.rule_type === "load_reps"
                ? "load_reps"
                : "timed_hold",
              version: set.rule_version,
              loadGrams: set.observed_load_grams ?? 0,
              reps: set.observed_reps,
            })),
            effort: exercise.effort,
          };
          const recommendation = evaluateLoadRepsV1(progressionInput);
          const table = recommendationTable(reference.graph);
          const targetColumn = recommendationTargetColumn(reference.graph);
          const targetScope = await transaction.queryAll<RecommendationTargetScopeRow>(
            `SELECT id, target_json, revision
             FROM ${targetTable(reference.graph)}
             WHERE plan_day_exercise_id = ?
             ORDER BY ordinal`,
            [target.plan_day_exercise_id],
          );
          if (
            targetScope.length === 0
            || targetScope.some(({ revision }) => revision !== target.revision)
          ) {
            throw new WorkoutOutcomeConflictError(
              "recommendation_target_scope_stale",
            );
          }
          const proposedTarget = recommendationTarget(
            recommendation,
            currentTarget,
          );
          const evidence = {
            version: ACTIONABLE_RECOMMENDATION_EVIDENCE_VERSION,
            rule: { id: LOAD_REPS_RULE, version: 1 },
            metricIdentity: exerciseIdentity(exercise),
            source: {
              sessionId,
              sessionExerciseId: exercise.id,
              sessionRevision: expectedSessionRevision,
              setIds: working.map(({ id }) => id),
            },
            revisions: {
              source: expectedSessionRevision,
              target: target.revision,
            },
            targetScope: targetScope.map(({ id, revision }) => ({ id, revision })),
            currentTarget,
            proposedTarget,
            decision: recommendation.decision,
            reasonCode: recommendation.reasonCode,
            reason: recommendation.reason,
            confidence: recommendation.confidence,
            lifecycle: { state: "pending" as const, createdAtMs: nowMs },
            evaluator: recommendation.evidence,
          };
          await transaction.execute(
            `UPDATE ${table}
             SET status = 'superseded', decided_at_ms = ?
             WHERE ${targetColumn} = ? AND status = 'pending'`,
            [nowMs, target.id],
          );
          const recommendationValues = [
            recommendationId,
            exercise.exercise_id,
            target.id,
            JSON.stringify(evidence),
            JSON.stringify(currentTarget),
            JSON.stringify(proposedTarget),
          ] as const;
          if (reference.graph === "owned") {
            await transaction.execute(
              `INSERT INTO owned_progression_recommendations
                (id, exercise_id, owned_plan_working_set_target_id, rule_type,
                 rule_version, evidence_version, evidence_json,
                 current_target_json, proposed_target_json,
                 metric_profile, metric_contract_version,
                 exercise_metric_generation, status,
                 source_revision, target_revision, created_at_ms, decided_at_ms)
               VALUES (?, ?, ?, 'load_reps', 1, 2, ?, ?, ?,
                       'load_reps', 1, ?, 'pending', ?, ?, ?, NULL)`,
              [
                ...recommendationValues,
                exercise.exercise_metric_generation ?? 1,
                expectedSessionRevision,
                target.revision,
                nowMs,
              ],
            );
          } else {
            await transaction.execute(
              `INSERT INTO progression_recommendations
                (id, exercise_id, plan_working_set_target_id, rule_type,
                 rule_version, evidence_version, evidence_json,
                 current_target_json, proposed_target_json,
                 metric_profile, metric_contract_version,
                 exercise_metric_generation, status,
                 source_revision, target_revision, created_at_ms, decided_at_ms)
               VALUES (?, ?, ?, 'load_reps', 1, 2, ?, ?, ?,
                       'load_reps', 1, ?, 'pending', ?, ?, ?, NULL)`,
              [
                ...recommendationValues,
                exercise.exercise_metric_generation ?? 1,
                expectedSessionRevision,
                target.revision,
                nowMs,
              ],
            );
          }
          generated += 1;
        }
        return generated;
      });
    },

    async currentSessionRevision(sessionId: string) {
      const [row] = await kernel.queryAll<{ revision: number }>(
        "SELECT revision FROM workout_sessions WHERE id = ?",
        [sessionId],
      );
      return row?.revision ?? null;
    },
  };
  return Object.freeze(repository);
}
