import {
  LOGICAL_BACKUP_TABLES,
  type LogicalBackupRow,
  type LogicalBackupSnapshot,
} from "../../../domains/portability/backupContracts";
import {
  RestoreCandidateProbeError,
  type RestoreCandidateProbePort,
  type RestoreReferenceAvailabilityPort,
  type RestoreRetainedReferencePort,
  type RestoreSchemaPort,
} from "../../../domains/portability/restoreCommands";
import type { SqliteKernel } from "../sqliteKernel";

type CandidateTables = Record<string, readonly LogicalBackupRow[]> & {
  session_sets: readonly LogicalBackupRow[];
  owned_progression_recommendations: readonly LogicalBackupRow[];
  progression_recommendations: readonly LogicalBackupRow[];
};

// Every caller validates against a closed allowlist before quoting. Keeping the
// formatter branch-free makes that invariant explicit and avoids treating an
// otherwise unreachable private error path as a restore behavior.
function identifier(value: string): string { return `"${value}"`; }

function rowMap(snapshot: LogicalBackupSnapshot, table: string): Map<string, LogicalBackupRow> {
  const tables = snapshot.tables as Record<string, readonly LogicalBackupRow[]>;
  return new Map(tables[table]!.map((row) => [String(row.id), row]));
}

function sameMetric(left: LogicalBackupRow | undefined, right: LogicalBackupRow | undefined): boolean {
  if (left === undefined || right === undefined) return false;
  return left.metric_profile === right.metric_profile
    && left.metric_contract_version === right.metric_contract_version
    && left.exercise_metric_generation === right.exercise_metric_generation;
}

function candidateFailure(): never { throw new RestoreCandidateProbeError(); }

function evidenceIsComplete(
  recommendation: LogicalBackupRow,
  targetColumn: "plan_working_set_target_id" | "owned_plan_working_set_target_id",
  target: LogicalBackupRow | undefined,
  sessions: Map<string, LogicalBackupRow>,
  sessionExercises: Map<string, LogicalBackupRow>,
  sessionSets: Map<string, LogicalBackupRow>,
): boolean {
  if (recommendation.status !== "pending") return true;
  const evidenceVersion = recommendation.evidence_version;
  if (typeof evidenceVersion !== "number") return false;
  if (evidenceVersion < 2) return true;
  if (evidenceVersion !== 2) return false;
  let parsedEvidence: unknown;
  try { parsedEvidence = JSON.parse(String(recommendation.evidence_json)); } catch { return false; }
  const objectAt = (value: unknown): Record<string, unknown> | null => {
    if (typeof value !== "object") return null;
    if (value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  };
  const nonBlankText = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;
  const isInteger = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value);
  const evidence = objectAt(parsedEvidence);
  if (evidence === null) return false;
  const rule = objectAt(evidence.rule);
  const identity = objectAt(evidence.metricIdentity);
  const source = objectAt(evidence.source);
  const revisions = objectAt(evidence.revisions);
  const lifecycle = objectAt(evidence.lifecycle);
  const headerIsValid = [
    evidence.version === 2,
    rule?.id === "load_reps.double_progression.v1",
    isInteger(rule?.version) && rule.version === recommendation.rule_version,
    recommendation.rule_type === "load_reps",
    identity?.profile === recommendation.metric_profile,
    isInteger(identity?.contractVersion) && identity.contractVersion === recommendation.metric_contract_version,
    isInteger(identity?.exerciseMetricGeneration) && identity.exerciseMetricGeneration === recommendation.exercise_metric_generation,
    nonBlankText(source?.sessionId),
    nonBlankText(source?.sessionExerciseId),
    isInteger(source?.sessionRevision) && source.sessionRevision === recommendation.source_revision,
    Array.isArray(source?.setIds) && source.setIds.length > 0,
    isInteger(revisions?.source) && revisions.source === recommendation.source_revision,
    isInteger(revisions?.target) && revisions.target === recommendation.target_revision,
    Array.isArray(evidence.targetScope) && evidence.targetScope.length > 0,
    objectAt(evidence.currentTarget) !== null,
    objectAt(evidence.proposedTarget) !== null,
    nonBlankText(evidence.decision),
    nonBlankText(evidence.reasonCode),
    nonBlankText(evidence.reason),
    nonBlankText(evidence.confidence),
    isInteger(lifecycle?.createdAtMs) && lifecycle.createdAtMs === recommendation.created_at_ms,
    lifecycle?.state === "pending",
    recommendation.decided_at_ms === null,
    target !== undefined,
  ];
  if (!headerIsValid.every(Boolean)) return false;
  const sourceDetails = source as Record<string, unknown>;
  const sourceSessionId = sourceDetails.sessionId as string;
  const sourceExerciseId = sourceDetails.sessionExerciseId as string;
  const sourceRevision = sourceDetails.sessionRevision;
  const sourceSetIds = sourceDetails.setIds as unknown[];
  const sourceExercise = sessionExercises.get(sourceExerciseId);
  const sourceSession = sessions.get(sourceSessionId);
  const sourceIsValid = [
    sourceExercise?.session_id === sourceSessionId,
    sourceExercise?.exercise_id === recommendation.exercise_id,
    sameMetric(sourceExercise, recommendation),
    sourceSession?.revision === sourceRevision,
  ];
  if (!sourceIsValid.every(Boolean)) return false;
  if (!sourceSetIds.every((id) => {
    if (!nonBlankText(id)) return false;
    const set = sessionSets.get(id);
    return [
      set?.session_exercise_id === sourceExerciseId,
      set?.set_kind === "working",
      sameMetric(set, recommendation),
    ].every(Boolean);
  })) return false;
  const targetScope = evidence.targetScope as unknown[];
  if (!targetScope.some((entry) => {
    const scoped = objectAt(entry);
    return [
      scoped?.id === recommendation[targetColumn],
      typeof scoped?.id === "string",
      isInteger(scoped?.revision) && scoped.revision === recommendation.target_revision,
    ].every(Boolean);
  })) return false;
  try {
    return [
      JSON.stringify(JSON.parse(String(recommendation.current_target_json))) === JSON.stringify(evidence.currentTarget),
      JSON.stringify(JSON.parse(String(recommendation.proposed_target_json))) === JSON.stringify(evidence.proposedTarget),
    ].every(Boolean);
  } catch { return false; }
}

/**
 * Proves 0010/0015 candidate insertion predicates against the already parsed
 * snapshot. It is deliberately pure: preflight cannot open the source writer
 * or alter the live database. The schema/retained ports below are read-only.
 */
export function createSqliteRestoreCandidateProbe(): RestoreCandidateProbePort {
  return Object.freeze({
    async validateCandidate(snapshot) {
      const tables = snapshot.tables as CandidateTables;
      const sessions = rowMap(snapshot, "workout_sessions");
      const sessionExercises = rowMap(snapshot, "session_exercises");
      const sessionSets = rowMap(snapshot, "session_sets");
      const ownedTargets = rowMap(snapshot, "owned_plan_working_set_targets");
      const ownedOccurrences = rowMap(snapshot, "owned_plan_day_exercises");
      const legacyTargets = rowMap(snapshot, "plan_working_set_targets");
      const legacyOccurrences = rowMap(snapshot, "plan_day_exercises");
      for (const set of tables.session_sets) {
        const legacyTargetId = set.source_plan_working_set_target_id;
        const ownedTargetId = set.source_owned_plan_working_set_target_id;
        if ([legacyTargetId, ownedTargetId].filter((targetId) => targetId !== null).length > 1) candidateFailure();
        if (legacyTargetId !== null) {
          const target = legacyTargets.get(String(legacyTargetId));
          const occurrence = legacyOccurrences.get(String(target?.plan_day_exercise_id));
          const exercise = sessionExercises.get(String(set.session_exercise_id));
          const graphIsValid = target !== undefined
            && occurrence !== undefined
            && exercise !== undefined
            && exercise.exercise_id === occurrence.exercise_id
            && sameMetric(set, target);
          if (!graphIsValid) candidateFailure();
        }
        if (ownedTargetId !== null) {
          const target = ownedTargets.get(String(ownedTargetId));
          const occurrence = ownedOccurrences.get(String(target?.plan_day_exercise_id));
          const exercise = sessionExercises.get(String(set.session_exercise_id));
          const graphIsValid = target !== undefined
            && occurrence !== undefined
            && exercise !== undefined
            && exercise.exercise_id === occurrence.exercise_id
            && sameMetric(set, target);
          if (!graphIsValid) candidateFailure();
        }
      }
      for (const recommendation of tables.owned_progression_recommendations) {
        const target = ownedTargets.get(String(recommendation.owned_plan_working_set_target_id));
        const occurrence = ownedOccurrences.get(String(target?.plan_day_exercise_id));
        const graphIsValid = target !== undefined
          && occurrence !== undefined
          && occurrence.exercise_id === recommendation.exercise_id
          && sameMetric(recommendation, target);
        if (!graphIsValid) candidateFailure();
        if (!evidenceIsComplete(recommendation, "owned_plan_working_set_target_id", target, sessions, sessionExercises, sessionSets)) candidateFailure();
      }
      for (const recommendation of tables.progression_recommendations) {
        const target = legacyTargets.get(String(recommendation.plan_working_set_target_id));
        const occurrence = legacyOccurrences.get(String(target?.plan_day_exercise_id));
        const graphIsValid = target !== undefined
          && occurrence !== undefined
          && occurrence.exercise_id === recommendation.exercise_id
          && sameMetric(recommendation, target);
        if (!graphIsValid) candidateFailure();
        if (!evidenceIsComplete(recommendation, "plan_working_set_target_id", target, sessions, sessionExercises, sessionSets)) candidateFailure();
      }
    },
  });
}

export function createSqliteRestoreSchemaPort(kernel: SqliteKernel): RestoreSchemaPort {
  return Object.freeze({
    async columnsFor(table) {
      if (!LOGICAL_BACKUP_TABLES.includes(table)) throw new RestoreCandidateProbeError();
      const rows = await kernel.queryAll<{ name: string; type: string; notnull: number }>(`PRAGMA table_info(${identifier(table)})`);
      return rows.map((row) => {
        const sqliteType = row.type.toUpperCase();
        if (!(["INTEGER", "TEXT"] as const).includes(sqliteType as "INTEGER" | "TEXT")) throw new RestoreCandidateProbeError();
        return Object.freeze({ name: row.name, sqliteType, notNull: row.notnull === 1 }) as { name: string; sqliteType: "INTEGER" | "TEXT"; notNull: boolean };
      });
    },
  });
}

export function createSqliteRestoreCatalogReferenceAvailabilityPort(
  kernel: SqliteKernel,
): RestoreReferenceAvailabilityPort {
  return Object.freeze({
    async availabilityFor(reference) {
      const rows = reference.kind === "exercise"
        ? await kernel.queryAll(
          "SELECT 1 AS present FROM exercise_catalog_sources WHERE source_namespace = ? AND COALESCE(upstream_id, linked_upstream_id) = ? AND source_revision = ? AND availability = 'available' LIMIT 1",
          [reference.sourceNamespace, reference.upstreamId, reference.sourceRevision],
        )
        : await kernel.queryAll(
          "SELECT 1 AS present FROM starter_plan_sources WHERE source_namespace = ? AND template_id = ? AND CAST(source_revision AS TEXT) = ? LIMIT 1",
          [reference.sourceNamespace, reference.upstreamId, reference.sourceRevision],
        );
      return rows.length === 1 ? "available" : "unavailable";
    },
  });
}

const RETAINED_IDENTITIES = Object.freeze({
  exercises: [
    ["id"],
    ["id", "metric_profile", "metric_contract_version", "exercise_metric_generation"],
  ],
  exercise_library_entries: [["exercise_id"]],
  plans: [["id"]],
  content_packs: [["id"]],
  starter_plan_sources: [["source_namespace", "template_id", "source_revision"]],
} as const);

const ORIGIN_BOUND_RETAINED_TABLES = new Set([
  "exercises",
  "exercise_library_entries",
  "plans",
]);

function exactRetainedIdentity(
  table: string,
  columns: readonly string[],
): boolean {
  const allowed = RETAINED_IDENTITIES[table as keyof typeof RETAINED_IDENTITIES];
  if (allowed === undefined) return false;
  return allowed.some((identity) => identity.join("\u0000") === columns.join("\u0000"));
}

export function createSqliteRestoreRetainedReferencePort(kernel: SqliteKernel): RestoreRetainedReferencePort {
  return Object.freeze({
    async hasRetainedIdentity(input) {
      if (!exactRetainedIdentity(input.table, input.columns)) return false;
      if (input.columns.length !== input.values.length) return false;
      if (!input.values.every((value) => typeof value === "string" || typeof value === "number")) return false;
      const where = input.columns.map((column) => `${identifier(column)} = ?`).join(" AND ");
      const ownership = ORIGIN_BOUND_RETAINED_TABLES.has(input.table)
        ? " AND origin = 'bundled'"
        : "";
      const rows = await kernel.queryAll(`SELECT 1 AS present FROM ${identifier(input.table)} WHERE ${where}${ownership} LIMIT 1`, input.values);
      return rows.length === 1;
    },
  });
}
