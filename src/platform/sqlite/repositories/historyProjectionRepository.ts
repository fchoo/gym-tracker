import {
  parseHistorySubjectId,
  reduceHistoryProjection,
  type HistoryProjection,
  type HistorySubject,
} from "../../../domains/history";
import {
  loadEffectiveHistoryProjectionSessions,
} from "./historyRepository";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export type HistoryProjectionFreshness = "current" | "updating" | "unavailable";

export type HistoryProjectionRowDump = Readonly<{
  recordCandidates: readonly Readonly<Record<string, string | number>>[];
  comparableExposures: readonly Readonly<Record<string, string | number>>[];
  metricAggregates: readonly Readonly<Record<string, string>>[];
  periodInputs: readonly Readonly<Record<string, string | number>>[];
  recommendationScopes: readonly Readonly<Record<string, string>>[];
}>;

export type HistoryProjectionRebuildInput = Readonly<{
  subjectId: string;
  expectedRevision: number;
}>;

export type HistoryProjectionRebuildOutcome = HistoryProjectionRebuildInput & Readonly<{
  result: "applied" | "stale";
}>;

export type HistoryProjectionRepository = Readonly<{
  advanceAndEnqueue(input: Readonly<{
    subjects: readonly HistorySubject[];
    nowMs: number;
  }>): Promise<Readonly<{
    subjectId: string;
    revision: number;
  }[]>>;
  currentRevision(subjectId: string): Promise<number | null>;
  freshness(subjectId: string): Promise<HistoryProjectionFreshness>;
  rebuildSubject(input: Readonly<{
    subjectId: string;
    expectedRevision: number;
    nowMs: number;
  }>): Promise<"applied" | "stale">;
  rebuildSubjects?: ((input: Readonly<{
    subjects: readonly HistoryProjectionRebuildInput[];
    nowMs: number;
  }>) => Promise<readonly HistoryProjectionRebuildOutcome[]>) | undefined;
  rebuildAll(input: Readonly<{ nowMs: number }>): Promise<void>;
  dumpProjectionRows(): Promise<HistoryProjectionRowDump>;
  loadFreshness(input: Readonly<{
    subjectIds: readonly string[];
  }>): Promise<HistoryProjectionFreshness>;
}>;

export type HistoryProjectionSubjectRevision = Readonly<{
  subjectId: string;
  revision: number;
}>;

/**
 * Advances source-derived history subjects in the caller's existing writer
 * transaction. Correction and lifecycle commands use this after their source
 * facts and recommendation invalidation have been staged, so acknowledgement
 * can only happen when the full source-to-rebuild fan-out commits together.
 */
export async function advanceHistoryProjectionSubjects(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    subjects: readonly HistorySubject[];
    nowMs: number;
  }>,
): Promise<readonly HistoryProjectionSubjectRevision[]> {
  const subjects = [...new Map(input.subjects.map((item) => [item.id, item])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  const revised: HistoryProjectionSubjectRevision[] = [];
  for (const item of subjects) {
    const [existing] = await transaction.queryAll<RevisionRow>(
      `SELECT revision FROM history_subject_revisions WHERE subject_id = ?`,
      [item.id],
    );
    const revision = (existing?.revision ?? 0) + 1;
    await transaction.execute(
      `INSERT INTO history_subject_revisions
        (subject_id, revision, updated_at_ms)
       VALUES (?, ?, ?)
       ON CONFLICT(subject_id) DO UPDATE SET
         revision = excluded.revision,
         updated_at_ms = excluded.updated_at_ms`,
      [item.id, revision, input.nowMs],
    );
    await transaction.execute(
      `UPDATE history_rebuild_effects
       SET status = 'superseded',
           last_error_code = 'stale_source_revision',
           claimed_at_ms = NULL,
           lease_expires_at_ms = NULL,
           updated_at_ms = ?
       WHERE subject_id = ?
         AND expected_revision < ?
         AND status IN ('pending', 'processing')`,
      [input.nowMs, item.id, revision],
    );
    await transaction.execute(
      `INSERT INTO history_rebuild_effects
        (id, subject_id, expected_revision, payload_version, payload_json,
         status, attempt_count, next_attempt_at_ms, claimed_at_ms,
         lease_expires_at_ms, last_error_code, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, 1, ?, 'pending', 0, ?, NULL, NULL, NULL, ?, ?)
       ON CONFLICT(subject_id, expected_revision) DO NOTHING`,
      [
        `history-rebuild:${item.id}:${revision}`, item.id, revision,
        JSON.stringify({ type: "rebuild_history_subject", version: 1 }),
        input.nowMs, input.nowMs, input.nowMs,
      ],
    );
    revised.push({ subjectId: item.id, revision });
  }
  return Object.freeze(revised);
}

export async function invalidateHistoryRecommendationScopes(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{ scopes: readonly string[]; nowMs: number }>,
): Promise<void> {
  const legacyTargetIds = [...new Set(input.scopes
    .filter((scope) => scope.startsWith("legacy:"))
    .map((scope) => scope.slice("legacy:".length))
    .filter((id) => id.length > 0))]
    .sort((left, right) => left.localeCompare(right));
  const ownedTargetIds = [...new Set(input.scopes
    .filter((scope) => scope.startsWith("owned:"))
    .map((scope) => scope.slice("owned:".length))
    .filter((id) => id.length > 0))]
    .sort((left, right) => left.localeCompare(right));
  if (legacyTargetIds.length > 0) {
    const placeholders = legacyTargetIds.map(() => "?").join(", ");
    await transaction.execute(
      `UPDATE progression_recommendations
       SET status = 'invalidated', decided_at_ms = ?
       WHERE status = 'pending'
         AND plan_working_set_target_id IN (${placeholders})`,
      [input.nowMs, ...legacyTargetIds],
    );
  }
  if (ownedTargetIds.length > 0) {
    const [support] = await transaction.queryAll<{ supported: 0 | 1 }>(
      `SELECT EXISTS(
         SELECT 1 FROM sqlite_master
         WHERE type = 'table' AND name = 'owned_progression_recommendations'
       ) AS supported`,
    );
    if (support?.supported === 1) {
      const placeholders = ownedTargetIds.map(() => "?").join(", ");
      await transaction.execute(
        `UPDATE owned_progression_recommendations
         SET status = 'invalidated', decided_at_ms = ?
         WHERE status = 'pending'
           AND owned_plan_working_set_target_id IN (${placeholders})`,
        [input.nowMs, ...ownedTargetIds],
      );
    }
  }
  const effectScopePredicates: string[] = [];
  const effectScopeParameters: string[] = [];
  if (legacyTargetIds.length > 0) {
    effectScopePredicates.push(
      `set_row.source_plan_working_set_target_id
       IN (${legacyTargetIds.map(() => "?").join(", ")})`,
    );
    effectScopeParameters.push(...legacyTargetIds);
  }
  if (ownedTargetIds.length > 0) {
    effectScopePredicates.push(
      `set_row.source_owned_plan_working_set_target_id
       IN (${ownedTargetIds.map(() => "?").join(", ")})`,
    );
    effectScopeParameters.push(...ownedTargetIds);
  }
  if (effectScopePredicates.length > 0) {
    await transaction.execute(
      `UPDATE pending_effects AS effect
       SET status = 'superseded',
           claimed_at_ms = NULL,
           lease_expires_at_ms = NULL,
           last_error_code = 'history_source_changed',
           updated_at_ms = ?
       WHERE effect.effect_type = 'regenerate_load_reps_recommendation'
         AND effect.status IN ('pending', 'processing')
         AND EXISTS (
           SELECT 1
           FROM session_exercises session_exercise
           JOIN session_sets set_row
             ON set_row.session_exercise_id = session_exercise.id
           WHERE session_exercise.session_id = effect.subject_id
             AND (${effectScopePredicates.join(" OR ")})
         )`,
      [input.nowMs, ...effectScopeParameters],
    );
  }
}

export async function invalidateAndAdvanceHistoryProjectionSubjects(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    subjects: readonly HistorySubject[];
    recommendationScopes: readonly string[];
    nowMs: number;
  }>,
): Promise<readonly HistoryProjectionSubjectRevision[]> {
  await invalidateHistoryRecommendationScopes(transaction, {
    scopes: input.recommendationScopes,
    nowMs: input.nowMs,
  });
  return advanceHistoryProjectionSubjects(transaction, {
    subjects: input.subjects,
    nowMs: input.nowMs,
  });
}

type RevisionRow = Readonly<{ revision: number }>;

type ProjectionEffectRow = Readonly<{
  id: string;
  subject_id: string;
  expected_revision: number;
  payload_version: number;
  payload_json: string;
  status: "pending" | "processing" | "completed" | "superseded" | "permanent_failure";
  attempt_count: number;
  next_attempt_at_ms: number;
  claimed_at_ms: number | null;
  lease_expires_at_ms: number | null;
  last_error_code: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}>;

const EFFECT_COLUMNS = `
  id, subject_id, expected_revision, payload_version, payload_json, status,
  attempt_count, next_attempt_at_ms, claimed_at_ms, lease_expires_at_ms,
  last_error_code, created_at_ms, updated_at_ms
`;

async function sourceProjection(
  executor: Pick<SqliteKernel, "queryAll"> | SqliteTransactionExecutor,
): Promise<HistoryProjection> {
  return reduceHistoryProjection({
    sessions: await loadEffectiveHistoryProjectionSessions(executor),
  });
}

async function deleteRowsForSubject(
  transaction: SqliteTransactionExecutor,
  subjectId: string,
): Promise<void> {
  for (const table of [
    "history_projection_record_candidates",
    "history_projection_comparable_exposures",
    "history_projection_metric_aggregates",
    "history_projection_period_inputs",
    "history_projection_recommendation_scopes",
  ]) {
    await transaction.execute(`DELETE FROM ${table} WHERE subject_id = ?`, [subjectId]);
  }
}

function subjectMatchesRow(
  subject: ReturnType<typeof parseHistorySubjectId>,
  row: Readonly<{
    exerciseId?: string;
    identityKey?: string;
    comparatorKey?: string;
    localDate?: string;
  }>,
): boolean {
  switch (subject.kind) {
    case "session":
      return false;
    case "date":
      return row.localDate === subject.scope[0];
    case "period":
      return subject.scope[0] === "all"
        || row.localDate === subject.scope[0];
    case "exercise_metric":
      return row.exerciseId === subject.scope[0]
        && row.identityKey === subject.scope[1]
        && row.comparatorKey === subject.scope[2];
    case "recommendation_target":
      return false;
  }
}

async function applySubjectProjection(
  transaction: SqliteTransactionExecutor,
  subjectId: string,
  expectedRevision: number,
  nowMs: number,
  projection: HistoryProjection,
): Promise<void> {
  const subject = parseHistorySubjectId(subjectId);
  await deleteRowsForSubject(transaction, subjectId);
  for (const row of projection.recordCandidates) {
    if (subject.kind !== "exercise_metric"
      || !subjectMatchesRow(subject, row)) {
      continue;
    }
    await transaction.execute(
      `INSERT INTO history_projection_record_candidates
        (subject_id, exercise_id, identity_key, comparator_key, session_id,
         local_date, set_id, set_ordinal, completed_at_ms, target_json,
         observation_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subjectId, row.exerciseId, row.identityKey, row.comparatorKey, row.sessionId,
        row.localDate, row.setId, row.setOrdinal, row.completedAtMs, row.targetJson,
        row.observationJson,
      ],
    );
  }
  for (const row of projection.comparableExposures) {
    if (subject.kind !== "exercise_metric"
      || !subjectMatchesRow(subject, row)) {
      continue;
    }
    await transaction.execute(
      `INSERT INTO history_projection_comparable_exposures
        (subject_id, exercise_id, identity_key, comparator_key, session_id,
         local_date, set_id, set_ordinal, completed_at_ms, target_json,
         observation_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subjectId, row.exerciseId, row.identityKey, row.comparatorKey, row.sessionId,
        row.localDate, row.setId, row.setOrdinal, row.completedAtMs, row.targetJson,
        row.observationJson,
      ],
    );
  }
  for (const row of projection.metricAggregates) {
    if (subject.kind !== "exercise_metric"
      || !subjectMatchesRow(subject, {
      exerciseId: row.exerciseId,
      identityKey: row.identityKey,
      comparatorKey: row.comparatorKey,
    })) {
      continue;
    }
    await transaction.execute(
      `INSERT INTO history_projection_metric_aggregates
        (subject_id, exercise_id, identity_key, comparator_key,
         reference_target_json, aggregate_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        subjectId, row.exerciseId, row.identityKey, row.comparatorKey,
        row.referenceTargetJson, row.aggregateJson,
      ],
    );
  }
  for (const row of projection.periodInputs) {
    if (subject.kind !== "period"
      || !subjectMatchesRow(subject, { localDate: row.localDate })) {
      continue;
    }
    await transaction.execute(
      `INSERT INTO history_projection_period_inputs
        (subject_id, local_date, completed_exercises, planned_exercises,
         completed_working_sets, planned_working_sets, comparable_exposure_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        subjectId, row.localDate, row.completedExercises, row.plannedExercises,
        row.completedWorkingSets, row.plannedWorkingSets, row.comparableExposureCount,
      ],
    );
  }
  if (subject.kind === "recommendation_target") {
    await transaction.execute(
      `INSERT INTO history_projection_recommendation_scopes (subject_id, scope_id)
       VALUES (?, ?)`,
      [subjectId, subject.scope[0]!],
    );
  }
  await transaction.execute(
    `INSERT INTO history_projection_freshness
      (subject_id, applied_revision, updated_at_ms)
     VALUES (?, ?, ?)
     ON CONFLICT(subject_id) DO UPDATE SET
       applied_revision = excluded.applied_revision,
       updated_at_ms = excluded.updated_at_ms`,
    [subjectId, expectedRevision, nowMs],
  );
}

async function rebuildSubjectProjections(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    subjects: readonly HistoryProjectionRebuildInput[];
    nowMs: number;
  }>,
): Promise<readonly HistoryProjectionRebuildOutcome[]> {
  if (input.subjects.length === 0) {
    return Object.freeze([]);
  }
  const subjectIds = [...new Set(input.subjects.map((item) => item.subjectId))];
  const revisions = await transaction.queryAll<Readonly<{
    subject_id: string;
    revision: number;
  }>>(
    `SELECT subject_id, revision
     FROM history_subject_revisions
     WHERE subject_id IN (${subjectIds.map(() => "?").join(", ")})`,
    subjectIds,
  );
  const revisionBySubjectId = new Map(
    revisions.map((row) => [row.subject_id, row.revision]),
  );
  const currentSubjects = new Map<string, HistoryProjectionRebuildInput>();
  const outcomes = input.subjects.map((item) => {
    const result = revisionBySubjectId.get(item.subjectId) === item.expectedRevision
      ? "applied" as const
      : "stale" as const;
    if (result === "applied") {
      currentSubjects.set(item.subjectId, item);
    }
    return Object.freeze({ ...item, result });
  });
  if (currentSubjects.size === 0) {
    return Object.freeze(outcomes);
  }

  const projection = await sourceProjection(transaction);
  for (const item of currentSubjects.values()) {
    await applySubjectProjection(
      transaction,
      item.subjectId,
      item.expectedRevision,
      input.nowMs,
      projection,
    );
  }
  return Object.freeze(outcomes);
}

async function dump(
  kernel: SqliteKernel,
): Promise<HistoryProjectionRowDump> {
  const [recordCandidates, comparableExposures, metricAggregates, periodInputs,
    recommendationScopes] = await Promise.all([
    kernel.queryAll<Record<string, string | number>>(
      `SELECT subject_id, exercise_id, identity_key, comparator_key, session_id, local_date,
              set_id, set_ordinal, completed_at_ms, target_json, observation_json
       FROM history_projection_record_candidates
       ORDER BY subject_id, exercise_id, identity_key, comparator_key, completed_at_ms,
                session_id, set_ordinal, set_id`,
    ),
    kernel.queryAll<Record<string, string | number>>(
      `SELECT subject_id, exercise_id, identity_key, comparator_key, session_id, local_date,
              set_id, set_ordinal, completed_at_ms, target_json, observation_json
       FROM history_projection_comparable_exposures
       ORDER BY subject_id, exercise_id, identity_key, comparator_key, completed_at_ms,
                session_id, set_ordinal, set_id`,
    ),
    kernel.queryAll<Record<string, string>>(
      `SELECT subject_id, exercise_id, identity_key, comparator_key, reference_target_json,
              aggregate_json
       FROM history_projection_metric_aggregates
       ORDER BY subject_id, exercise_id, identity_key, comparator_key, reference_target_json`,
    ),
    kernel.queryAll<Record<string, string | number>>(
      `SELECT subject_id, local_date, completed_exercises, planned_exercises,
              completed_working_sets, planned_working_sets, comparable_exposure_count
       FROM history_projection_period_inputs
       ORDER BY subject_id, local_date`,
    ),
    kernel.queryAll<Record<string, string>>(
      `SELECT subject_id, scope_id FROM history_projection_recommendation_scopes
       ORDER BY subject_id, scope_id`,
    ),
  ]);
  return Object.freeze({
    recordCandidates: Object.freeze(recordCandidates),
    comparableExposures: Object.freeze(comparableExposures),
    metricAggregates: Object.freeze(metricAggregates),
    periodInputs: Object.freeze(periodInputs),
    recommendationScopes: Object.freeze(recommendationScopes),
  });
}

export function createHistoryProjectionRepository(
  kernel: SqliteKernel,
): HistoryProjectionRepository {
  async function rebuildSubjects(input: Readonly<{
    subjects: readonly HistoryProjectionRebuildInput[];
    nowMs: number;
  }>): Promise<readonly HistoryProjectionRebuildOutcome[]> {
    if (input.subjects.length === 0) {
      return Object.freeze([]);
    }
    return kernel.write((transaction) => rebuildSubjectProjections(
      transaction,
      input,
    ));
  }

  return Object.freeze({
    async advanceAndEnqueue(input) {
      return kernel.write((transaction) => advanceHistoryProjectionSubjects(
        transaction,
        input,
      ));
    },

    async currentRevision(subjectId) {
      const [row] = await kernel.queryAll<RevisionRow>(
        `SELECT revision FROM history_subject_revisions WHERE subject_id = ?`,
        [subjectId],
      );
      return row?.revision ?? null;
    },

    async freshness(subjectId) {
      const [row] = await kernel.queryAll<{
        revision: number;
        applied_revision: number | null;
      }>(
        `SELECT revision, freshness.applied_revision
         FROM history_subject_revisions subject
         LEFT JOIN history_projection_freshness freshness
           ON freshness.subject_id = subject.subject_id
         WHERE subject.subject_id = ?`,
        [subjectId],
      );
      if (row === undefined) {
        return "unavailable";
      }
      return row.applied_revision === row.revision ? "current" : "updating";
    },

    async rebuildSubject(input) {
      const [outcome] = await rebuildSubjects({
        subjects: [{
          subjectId: input.subjectId,
          expectedRevision: input.expectedRevision,
        }],
        nowMs: input.nowMs,
      });
      return outcome!.result;
    },

    rebuildSubjects,

    async rebuildAll(input) {
      await kernel.write(async (transaction) => {
        for (const table of [
          "history_projection_record_candidates",
          "history_projection_comparable_exposures",
          "history_projection_metric_aggregates",
          "history_projection_period_inputs",
          "history_projection_recommendation_scopes",
        ]) {
          await transaction.execute(`DELETE FROM ${table}`);
        }
        const revisions = await transaction.queryAll<Readonly<{
          subject_id: string;
          revision: number;
        }>>(
          `SELECT subject_id, revision
           FROM history_subject_revisions
           ORDER BY subject_id`,
        );
        if (revisions.length > 0) {
          const projection = await sourceProjection(transaction);
          for (const row of revisions) {
            await applySubjectProjection(
              transaction,
              row.subject_id,
              row.revision,
              input.nowMs,
              projection,
            );
          }
        }
      });
    },

    dumpProjectionRows: () => dump(kernel),

    async loadFreshness(input) {
      const ids = [...new Set(input.subjectIds)];
      if (ids.length === 0) {
        return "unavailable";
      }
      const placeholders = ids.map(() => "?").join(", ");
      const rows = await kernel.queryAll<Readonly<{
        revision: number;
        applied_revision: number | null;
      }>>(
        `SELECT subject.revision, freshness.applied_revision
         FROM history_subject_revisions subject
         LEFT JOIN history_projection_freshness freshness
           ON freshness.subject_id = subject.subject_id
         WHERE subject.subject_id IN (${placeholders})`,
        ids,
      );
      if (rows.length !== ids.length) {
        return "unavailable";
      }
      return rows.every((row) => row.applied_revision === row.revision)
        ? "current"
        : "updating";
    },
  });
}

export type StoredHistoryProjectionEffect = Readonly<{
  id: string;
  subjectId: string;
  expectedRevision: number;
  payloadVersion: number;
  payload: unknown;
  status: ProjectionEffectRow["status"];
  attemptCount: number;
  nextAttemptAtMs: number;
  claimedAtMs: number | null;
  leaseExpiresAtMs: number | null;
  lastErrorCode: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}>;

export function toStoredHistoryProjectionEffect(
  row: ProjectionEffectRow,
): StoredHistoryProjectionEffect {
  return Object.freeze({
    id: row.id,
    subjectId: row.subject_id,
    expectedRevision: row.expected_revision,
    payloadVersion: row.payload_version,
    payload: JSON.parse(row.payload_json) as unknown,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAtMs: row.next_attempt_at_ms,
    claimedAtMs: row.claimed_at_ms,
    leaseExpiresAtMs: row.lease_expires_at_ms,
    lastErrorCode: row.last_error_code,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  });
}

export { EFFECT_COLUMNS, type ProjectionEffectRow };
