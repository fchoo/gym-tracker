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
  SqliteTransactionExecutor,
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

/** Test-only seam for proving that every post-restore boundary fails closed. */
export type RestoreReconciliationFaultStage =
  | "phase13_current_relations"
  | "history_seed"
  | "search"
  | "history"
  | "parity";

type RestoreStateRow = Readonly<{
  state: RestoreState;
  updated_at_ms: number;
}>;

type SubjectRow = Readonly<{
  subject_id: string;
  revision: number;
  applied_revision: number | null;
}>;

type ImportedLifecycleRow = Readonly<{
  activity_id: string;
  aggregate_revision: number;
  removal_state: "active" | "removed";
  lifecycle_event_id: string;
}>;

type RunningCurrentMatchRow = Readonly<{
  opportunity_id: string;
  activity_id: string;
  relation_revision: number;
  event_id: string;
}>;

const PHASE_13_LIFECYCLE_TRIGGER_NAMES = Object.freeze([
  "automatic_backup_generation_imported_activity_current_lifecycle_insert",
  "automatic_backup_generation_imported_activity_current_lifecycle_update",
] as const);

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

/**
 * These state tables deliberately stay out of the portable source archive.  A
 * source restore clears them; rebuilding them must not manufacture a backup
 * generation, otherwise a retry of the same restore would dirty Drive state.
 */
async function capturePhase13LifecycleTriggers(
  transaction: SqliteTransactionExecutor,
): Promise<ReadonlyMap<string, string>> {
  const rows = await transaction.queryAll<{ name: string; sql: string }>(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'trigger' AND name IN (?, ?)
     ORDER BY name`,
    PHASE_13_LIFECYCLE_TRIGGER_NAMES,
  );
  if (rows.length !== PHASE_13_LIFECYCLE_TRIGGER_NAMES.length
    || rows.some(({ sql }) => sql.trim().length === 0)) {
    throw new Error("phase13_lifecycle_generation_trigger_invalid");
  }
  return new Map(rows.map(({ name, sql }) => [name, sql]));
}

async function phase13ProjectionSupport(kernel: SqliteKernel): Promise<boolean> {
  const rows = await kernel.queryAll<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name IN ('imported_activity_identities', 'imported_activity_events',
                    'imported_activity_current_lifecycle',
                    'running_activity_match_events', 'running_activity_current_matches')`,
  );
  return rows.length === 5;
}

async function expectedImportedLifecycleRows(
  executor: Pick<SqliteTransactionExecutor, "queryAll">,
): Promise<readonly ImportedLifecycleRow[]> {
  return executor.queryAll<ImportedLifecycleRow>(
    `SELECT identity.activity_id, identity.aggregate_revision,
            CASE latest.event_type WHEN 'removed' THEN 'removed' ELSE 'active' END AS removal_state,
            latest.id AS lifecycle_event_id
       FROM imported_activity_identities identity
       JOIN imported_activity_events latest ON latest.activity_id = identity.activity_id
      WHERE latest.id = (
        SELECT event.id FROM imported_activity_events event
         WHERE event.activity_id = identity.activity_id
         ORDER BY event.created_at_ms DESC, event.id DESC LIMIT 1
      )
        AND latest.aggregate_revision = identity.aggregate_revision
      ORDER BY identity.activity_id`,
  );
}

async function expectedRunningCurrentMatchRows(
  executor: Pick<SqliteTransactionExecutor, "queryAll">,
): Promise<readonly RunningCurrentMatchRow[]> {
  return executor.queryAll<RunningCurrentMatchRow>(
    `SELECT latest.opportunity_id, latest.activity_id, latest.relation_revision,
            latest.id AS event_id
       FROM running_activity_match_events latest
       JOIN imported_activity_identities identity ON identity.activity_id = latest.activity_id
       JOIN imported_activity_events lifecycle ON lifecycle.activity_id = identity.activity_id
      WHERE latest.id = (
        SELECT event.id FROM running_activity_match_events event
         WHERE event.activity_id = latest.activity_id
         ORDER BY event.relation_revision DESC, event.created_at_ms DESC, event.id DESC LIMIT 1
      )
        AND lifecycle.id = (
          SELECT event.id FROM imported_activity_events event
           WHERE event.activity_id = identity.activity_id
           ORDER BY event.created_at_ms DESC, event.id DESC LIMIT 1
        )
        AND lifecycle.aggregate_revision = identity.aggregate_revision
        AND lifecycle.event_type IN ('imported', 'restored')
        AND latest.action IN ('matched', 'reassigned')
      ORDER BY latest.opportunity_id, latest.activity_id`,
  );
}

async function rebuildPhase13CurrentRelations(kernel: SqliteKernel): Promise<void> {
  if (!await phase13ProjectionSupport(kernel)) return;
  await kernel.write(async (transaction) => {
    const [triggers, lifecycleRows, matchRows] = await Promise.all([
      capturePhase13LifecycleTriggers(transaction),
      expectedImportedLifecycleRows(transaction),
      expectedRunningCurrentMatchRows(transaction),
    ]);
    for (const name of triggers.keys()) await transaction.execute(`DROP TRIGGER ${name}`);
    await transaction.execute("DELETE FROM running_activity_current_matches");
    await transaction.execute("DELETE FROM imported_activity_current_lifecycle");
    for (const row of lifecycleRows) {
      await transaction.execute(
        `INSERT INTO imported_activity_current_lifecycle
          (activity_id, aggregate_revision, removal_state, lifecycle_event_id)
         VALUES (?, ?, ?, ?)`,
        [row.activity_id, row.aggregate_revision, row.removal_state, row.lifecycle_event_id],
      );
    }
    for (const row of matchRows) {
      await transaction.execute(
        `INSERT INTO running_activity_current_matches
          (opportunity_id, activity_id, relation_revision, event_id)
         VALUES (?, ?, ?, ?)`,
        [row.opportunity_id, row.activity_id, row.relation_revision, row.event_id],
      );
    }
    for (const statement of triggers.values()) await transaction.execute(statement);
    const restored = await capturePhase13LifecycleTriggers(transaction);
    if ([...triggers].some(([name, sql]) => restored.get(name) !== sql)) {
      throw new Error("phase13_lifecycle_generation_trigger_restore_invalid");
    }
  });
}

async function phase13CurrentRelationsParityIsExact(kernel: SqliteKernel): Promise<boolean> {
  if (!await phase13ProjectionSupport(kernel)) return true;
  const [expectedLifecycle, expectedMatches, actualLifecycle, actualMatches] = await Promise.all([
    expectedImportedLifecycleRows(kernel),
    expectedRunningCurrentMatchRows(kernel),
    kernel.queryAll<ImportedLifecycleRow>(
      `SELECT activity_id, aggregate_revision, removal_state, lifecycle_event_id
       FROM imported_activity_current_lifecycle ORDER BY activity_id`,
    ),
    kernel.queryAll<RunningCurrentMatchRow>(
      `SELECT opportunity_id, activity_id, relation_revision, event_id
       FROM running_activity_current_matches ORDER BY opportunity_id, activity_id`,
    ),
  ]);
  return JSON.stringify(actualLifecycle) === JSON.stringify(expectedLifecycle)
    && JSON.stringify(actualMatches) === JSON.stringify(expectedMatches);
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
    faultAfter?: (stage: RestoreReconciliationFaultStage) => Promise<void>;
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

        // Current Running relations precede every dependent Calendar/Progress
        // reader. The remaining sequence preserves the established history
        // ordering and does not expose a ready restore before all parity holds.
        await rebuildPhase13CurrentRelations(kernel);
        await input.faultAfter?.("phase13_current_relations");
        const sessions = await reseedHistoryDerivatives(kernel, input.nowMs());
        await input.faultAfter?.("history_seed");
        await input.search.rebuildSearchIndex();
        await input.faultAfter?.("search");
        await input.history.rebuildAll({ nowMs: input.nowMs() });
        await input.faultAfter?.("history");
        const [searchParity, historyExact, phase13Exact] = await Promise.all([
          input.search.verifyParity(),
          historyParityIsExact(kernel, input.history, sessions),
          phase13CurrentRelationsParityIsExact(kernel),
        ]);
        await input.faultAfter?.("parity");
        if (!searchParity.exact || !historyExact || !phase13Exact
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
