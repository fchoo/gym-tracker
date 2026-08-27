import {
  metricComparatorBoundaryKey,
  reduceHistoryProjection,
  type EffectiveHistoryProjectionSession,
} from "../../../domains/history";
import {
  metricIdentityKey,
} from "../../../domains/metrics";
import {
  loadEffectiveHistoryProjectionSessions,
} from "./historyRepository";
import type {
  ExerciseSearchIndexRepository,
} from "./exerciseSearchIndexRepository";
import type {
  HistoryProjectionRepository,
  HistoryProjectionRowDump,
} from "./historyProjectionRepository";
import type {
  SqliteKernel,
} from "../sqliteKernel";

type RestoreState = "ready" | "rebuild_pending";

export type RestoreReconciliationResult = Readonly<{
  outcome: "already_ready" | "rebuilt" | "retryable_failure";
  state: RestoreState;
  unavailableCatalogReferences: number;
}>;

export type RestoreReconciliationRepository = Readonly<{
  reconcileAndRebuild(): Promise<RestoreReconciliationResult>;
}>;

type RestoreStateRow = Readonly<{
  state: RestoreState;
  updated_at_ms: number;
}>;

type SubjectRow = Readonly<{
  subject_id: string;
  revision: number;
  applied_revision: number | null;
}>;

const ALL_PERIOD_SUBJECT_ID = 'history-subject/v1:["period","all"]';

function subjectId(kind: string, ...scope: readonly string[]): string {
  return `history-subject/v1:${JSON.stringify([kind, ...scope])}`;
}

function rebuildSubjects(
  sessions: readonly EffectiveHistoryProjectionSession[],
): readonly string[] {
  const subjects = new Set<string>();
  for (const session of sessions) {
    subjects.add(subjectId("session", session.sessionId));
    subjects.add(subjectId("date", session.localDate));
    subjects.add(subjectId("period", session.localDate));
    subjects.add(ALL_PERIOD_SUBJECT_ID);
    for (const set of session.metricSets) {
      subjects.add(subjectId(
        "exercise_metric",
        set.exerciseId,
        metricIdentityKey(set.identity),
        metricComparatorBoundaryKey({
          identity: set.identity,
          target: set.target,
        }),
      ));
    }
    for (const scope of session.recommendationScopes) {
      subjects.add(subjectId("recommendation_target", scope));
    }
  }
  return Object.freeze([...subjects].sort((left, right) => left.localeCompare(right)));
}

async function readRestoreState(
  kernel: SqliteKernel,
): Promise<RestoreStateRow> {
  const rows = await kernel.queryAll<RestoreStateRow>(
    "SELECT state, updated_at_ms FROM portability_restore_state WHERE id = 1",
  );
  if (rows.length !== 1
    || (rows[0]?.state !== "ready" && rows[0]?.state !== "rebuild_pending")
    || !Number.isSafeInteger(rows[0]?.updated_at_ms)
    || rows[0]!.updated_at_ms < 0) {
    throw new Error("portability_restore_state_invalid");
  }
  return rows[0]!;
}

async function unavailableCatalogReferenceCount(
  kernel: SqliteKernel,
): Promise<number> {
  const [row] = await kernel.queryAll<{ count: number }>(
    `SELECT COUNT(DISTINCT source.exercise_id) AS count
     FROM exercise_catalog_sources source
     WHERE source.availability = 'unavailable'
       AND source.exercise_id IN (
         SELECT exercise_id FROM exercise_owner_preferences
         UNION
         SELECT exercise_id FROM session_exercises
         UNION
         SELECT occurrence.exercise_id
         FROM plan_day_exercises occurrence
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         JOIN plans plan ON plan.id = day.plan_id
         WHERE plan.origin IN ('custom', 'copied')
         UNION
         SELECT occurrence.exercise_id
         FROM owned_plan_day_exercises occurrence
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         JOIN plans plan ON plan.id = day.plan_id
         WHERE plan.origin IN ('custom', 'copied')
       )`,
  );
  if (row === undefined || !Number.isSafeInteger(row.count) || row.count < 0) {
    throw new Error("portability_catalog_reconciliation_invalid");
  }
  return row.count;
}

async function reseedHistoryDerivatives(
  kernel: SqliteKernel,
  nowMs: number,
): Promise<readonly EffectiveHistoryProjectionSession[]> {
  const sessions = await loadEffectiveHistoryProjectionSessions(kernel);
  const subjects = rebuildSubjects(sessions);
  await kernel.write(async (transaction) => {
    // Pending effects are replayable derivatives of the replaced source snapshot.
    // Keep terminal rows as audit history, but fence every active effect type: a
    // revision collision can otherwise replay stale work after restore readiness.
    await transaction.execute(
      `UPDATE pending_effects
       SET status = 'superseded',
           claimed_at_ms = NULL,
           lease_expires_at_ms = NULL,
           last_error_code = 'restore_source_replaced',
           updated_at_ms = MAX(updated_at_ms, created_at_ms, ?)
       WHERE status IN ('pending', 'processing')`,
      [nowMs],
    );
    for (const table of [
      "history_rebuild_effects",
      "history_projection_recommendation_scopes",
      "history_projection_period_inputs",
      "history_projection_metric_aggregates",
      "history_projection_comparable_exposures",
      "history_projection_record_candidates",
      "history_projection_freshness",
      "history_subject_revisions",
    ]) {
      await transaction.execute(`DELETE FROM ${table}`);
    }
    for (const subject of subjects) {
      await transaction.execute(
        `INSERT INTO history_subject_revisions
          (subject_id, revision, updated_at_ms)
         VALUES (?, 1, ?)`,
        [subject, nowMs],
      );
    }
  });
  return sessions;
}

function projectionDumpFor(
  sessions: readonly EffectiveHistoryProjectionSession[],
): HistoryProjectionRowDump {
  const projection = reduceHistoryProjection({ sessions });
  const recordCandidates = projection.recordCandidates.map((row) => ({
    subject_id: subjectId("exercise_metric", row.exerciseId, row.identityKey, row.comparatorKey),
    exercise_id: row.exerciseId,
    identity_key: row.identityKey,
    comparator_key: row.comparatorKey,
    session_id: row.sessionId,
    local_date: row.localDate,
    set_id: row.setId,
    set_ordinal: row.setOrdinal,
    completed_at_ms: row.completedAtMs,
    target_json: row.targetJson,
    observation_json: row.observationJson,
  })).sort((left, right) => left.subject_id.localeCompare(right.subject_id)
    || left.set_id.localeCompare(right.set_id));
  const comparableExposures = projection.comparableExposures.map((row) => ({
    subject_id: subjectId("exercise_metric", row.exerciseId, row.identityKey, row.comparatorKey),
    exercise_id: row.exerciseId,
    identity_key: row.identityKey,
    comparator_key: row.comparatorKey,
    session_id: row.sessionId,
    local_date: row.localDate,
    set_id: row.setId,
    set_ordinal: row.setOrdinal,
    completed_at_ms: row.completedAtMs,
    target_json: row.targetJson,
    observation_json: row.observationJson,
  })).sort((left, right) => left.subject_id.localeCompare(right.subject_id)
    || left.set_id.localeCompare(right.set_id));
  const metricAggregates = projection.metricAggregates.map((row) => ({
    subject_id: subjectId("exercise_metric", row.exerciseId, row.identityKey, row.comparatorKey),
    exercise_id: row.exerciseId,
    identity_key: row.identityKey,
    comparator_key: row.comparatorKey,
    reference_target_json: row.referenceTargetJson,
    aggregate_json: row.aggregateJson,
  })).sort((left, right) => left.subject_id.localeCompare(right.subject_id)
    || left.reference_target_json.localeCompare(right.reference_target_json));
  const periodInputs = projection.periodInputs.flatMap((row) => [
    {
      subject_id: subjectId("period", row.localDate),
      local_date: row.localDate,
      completed_exercises: row.completedExercises,
      planned_exercises: row.plannedExercises,
      completed_working_sets: row.completedWorkingSets,
      planned_working_sets: row.plannedWorkingSets,
      comparable_exposure_count: row.comparableExposureCount,
    },
    {
      subject_id: ALL_PERIOD_SUBJECT_ID,
      local_date: row.localDate,
      completed_exercises: row.completedExercises,
      planned_exercises: row.plannedExercises,
      completed_working_sets: row.completedWorkingSets,
      planned_working_sets: row.plannedWorkingSets,
      comparable_exposure_count: row.comparableExposureCount,
    },
  ]).sort((left, right) => left.subject_id.localeCompare(right.subject_id)
    || left.local_date.localeCompare(right.local_date));
  const recommendationScopes = projection.recommendationInvalidationScopes.map((scope) => ({
    subject_id: subjectId("recommendation_target", scope),
    scope_id: scope,
  })).sort((left, right) => left.subject_id.localeCompare(right.subject_id));
  return Object.freeze({
    recordCandidates: Object.freeze(recordCandidates),
    comparableExposures: Object.freeze(comparableExposures),
    metricAggregates: Object.freeze(metricAggregates),
    periodInputs: Object.freeze(periodInputs),
    recommendationScopes: Object.freeze(recommendationScopes),
  });
}

async function historyParityIsExact(
  kernel: SqliteKernel,
  history: HistoryProjectionRepository,
  sessions: readonly EffectiveHistoryProjectionSession[],
): Promise<boolean> {
  const [dump, revisions] = await Promise.all([
    history.dumpProjectionRows(),
    kernel.queryAll<SubjectRow>(
      `SELECT subject.revision, freshness.applied_revision, subject.subject_id
       FROM history_subject_revisions subject
       LEFT JOIN history_projection_freshness freshness
         ON freshness.subject_id = subject.subject_id
       ORDER BY subject.subject_id`,
    ),
  ]);
  const expectedSubjects = rebuildSubjects(sessions);
  return JSON.stringify(dump) === JSON.stringify(projectionDumpFor(sessions))
    && JSON.stringify(revisions.map(({ subject_id }) => subject_id))
      === JSON.stringify(expectedSubjects)
    && revisions.every(({ revision, applied_revision }) => applied_revision === revision);
}

async function markReady(
  kernel: SqliteKernel,
  pendingUpdatedAtMs: number,
  nowMs: number,
): Promise<boolean> {
  return kernel.write(async (transaction) => {
    const updatedAtMs = Math.max(nowMs, pendingUpdatedAtMs + 1);
    const result = await transaction.execute(
      `UPDATE portability_restore_state
       SET state = 'ready', updated_at_ms = ?
       WHERE id = 1
         AND state = 'rebuild_pending'
         AND updated_at_ms = ?`,
      [updatedAtMs, pendingUpdatedAtMs],
    );
    return result.changes === 1;
  });
}

export function createRestoreReconciliationRepository(
  kernel: SqliteKernel,
  input: Readonly<{
    history: HistoryProjectionRepository;
    search: ExerciseSearchIndexRepository;
    nowMs(): number;
  }>,
): RestoreReconciliationRepository {
  return Object.freeze({
    async reconcileAndRebuild() {
      let unavailableCatalogReferences = 0;
      try {
        const state = await readRestoreState(kernel);
        unavailableCatalogReferences = await unavailableCatalogReferenceCount(kernel);
        if (state.state === "ready") {
          return Object.freeze({
            outcome: "already_ready" as const,
            state: "ready" as const,
            unavailableCatalogReferences,
          });
        }

        const sessions = await reseedHistoryDerivatives(kernel, input.nowMs());
        await input.search.rebuildSearchIndex();
        await input.history.rebuildAll({ nowMs: input.nowMs() });
        const [searchParity, historyExact] = await Promise.all([
          input.search.verifyParity(),
          historyParityIsExact(kernel, input.history, sessions),
        ]);
        if (!searchParity.exact || !historyExact
          || !await markReady(kernel, state.updated_at_ms, input.nowMs())) {
          throw new Error("portability_rebuild_parity_incomplete");
        }
        return Object.freeze({
          outcome: "rebuilt" as const,
          state: "ready" as const,
          unavailableCatalogReferences,
        });
      } catch {
        return Object.freeze({
          outcome: "retryable_failure" as const,
          state: "rebuild_pending" as const,
          unavailableCatalogReferences,
        });
      }
    },
  });
}
