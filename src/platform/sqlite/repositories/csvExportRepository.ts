import {
  assertValidHistoryCorrectionSnapshot,
  type HistoryCorrectionSnapshot,
} from "../../../domains/history";
import {
  CSV_EXPORT_FORMAT_VERSION,
  canonicalizeCsvJson,
  csvMetricFields,
  serializeCsvExport,
  type CsvExportRow,
} from "../../../domains/portability/csvExport";
import type {
  MetricIdentity,
} from "../../../domains/metrics";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

type SourceSessionRow = Readonly<{
  id: string;
  source: string;
  status: string;
  local_date: string;
  timezone: string;
  creation_timezone_offset_minutes: number | null;
  started_at_ms: number;
  completed_at_ms: number | null;
  revision: number;
  effective_revision: number | null;
  lifecycle: "active" | "voided" | null;
  snapshot_json: string | null;
}>;

type SourceExerciseRow = Readonly<{
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  ordinal: number;
  status: string;
  effort: string | null;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type SourceSetRow = Readonly<{
  id: string;
  session_exercise_id: string;
  set_kind: "warmup" | "working";
  ordinal: number;
  status: string;
  completed_at_ms: number | null;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  target_json: string;
  observed_json: string | null;
  unit_json: string;
  source_plan_working_set_target_id: string | null;
  source_owned_plan_working_set_target_id: string | null;
}>;

type AuditRow = Readonly<{
  id: string;
  session_id: string;
  effective_revision: number;
  event_type: "correction" | "void" | "restore";
  field_identity: string;
  before_json: string;
  after_json: string;
  occurred_at_ms: number;
}>;

type RecommendationRow = Readonly<{
  target_graph: "legacy" | "owned";
  id: string;
  exercise_id: string;
  target_id: string;
  rule_type: string;
  rule_version: number;
  evidence_json: string;
  current_target_json: string;
  proposed_target_json: string;
  status: string;
  created_at_ms: number;
  decided_at_ms: number | null;
}>;

type SessionContext = Readonly<{
  session_id: string;
  session_source: string;
  session_status: string;
  session_lifecycle: "active" | "voided";
  session_original_local_date: string;
  session_original_timezone: string;
  session_original_timezone_offset_minutes: number | null;
  session_original_started_at_epoch_ms: number;
  session_original_started_at_utc: string;
  session_original_completed_at_epoch_ms: number | null;
  session_original_completed_at_utc: string | null;
  session_effective_local_date: string;
  session_effective_timezone: string;
  session_effective_started_at_epoch_ms: number;
  session_effective_started_at_utc: string;
  session_effective_completed_at_epoch_ms: number | null;
  session_effective_completed_at_utc: string | null;
  session_effective_revision: number;
  session_corrected: boolean;
}>;

export type CsvExportRepository = Readonly<{
  readRows(): Promise<readonly CsvExportRow[]>;
  serialize(): Promise<Uint8Array>;
}>;

export class CsvExportRepositoryError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-CSV02" as const;

  constructor(readonly code: "csv_export_collection_failed") {
    super(code);
    this.name = "CsvExportRepositoryError";
  }
}

function timestamp(value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CsvExportRepositoryError("csv_export_collection_failed");
  }
  try {
    return new Date(value).toISOString();
  } catch {
    throw new CsvExportRepositoryError("csv_export_collection_failed");
  }
}

function record(
  type: CsvExportRow["record_type"],
  values: Omit<Partial<CsvExportRow>, "format_version" | "record_type">,
): CsvExportRow {
  return Object.freeze({
    ...values,
    format_version: CSV_EXPORT_FORMAT_VERSION,
    record_type: type,
  });
}

function parseObject(json: string): Readonly<Record<string, unknown>> | null {
  try {
    const value = JSON.parse(json) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>>
      : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === "string")
    ? value
    : null;
}

function sourceContext(
  source: SourceSessionRow,
  effective: Readonly<{
    source: string;
    status: string;
    localDate: string;
    timezone: string;
    startedAtMs: number;
    completedAtMs: number | null;
  }>,
  corrected: boolean,
): SessionContext {
  return Object.freeze({
    session_id: source.id,
    session_source: effective.source,
    session_status: effective.status,
    session_lifecycle: source.lifecycle ?? "active",
    session_original_local_date: source.local_date,
    session_original_timezone: source.timezone,
    session_original_timezone_offset_minutes:
      source.creation_timezone_offset_minutes,
    session_original_started_at_epoch_ms: source.started_at_ms,
    session_original_started_at_utc: timestamp(source.started_at_ms)!,
    session_original_completed_at_epoch_ms: source.completed_at_ms,
    session_original_completed_at_utc: timestamp(source.completed_at_ms),
    session_effective_local_date: effective.localDate,
    session_effective_timezone: effective.timezone,
    session_effective_started_at_epoch_ms: effective.startedAtMs,
    session_effective_started_at_utc: timestamp(effective.startedAtMs)!,
    session_effective_completed_at_epoch_ms: effective.completedAtMs,
    session_effective_completed_at_utc: timestamp(effective.completedAtMs),
    session_effective_revision: source.effective_revision ?? source.revision,
    session_corrected: corrected,
  });
}

function targetReference(input: Readonly<{
  legacy?: string | null | undefined;
  owned?: string | null | undefined;
}>): Pick<CsvExportRow, "source_target_graph" | "source_target_id"> {
  if (input.legacy) return { source_target_graph: "legacy", source_target_id: input.legacy };
  if (input.owned) return { source_target_graph: "owned", source_target_id: input.owned };
  return { source_target_graph: null, source_target_id: null };
}

function rawRows(
  source: SourceSessionRow,
  exercises: readonly SourceExerciseRow[],
  setsByExercise: ReadonlyMap<string, readonly SourceSetRow[]>,
): readonly CsvExportRow[] {
  const context = sourceContext(source, {
    source: source.source,
    status: source.status,
    localDate: source.local_date,
    timezone: source.timezone,
    startedAtMs: source.started_at_ms,
    completedAtMs: source.completed_at_ms,
  }, false);
  const rows: CsvExportRow[] = [record("session", context)];
  for (const exercise of exercises) {
    const exerciseContext = {
      ...context,
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.exercise_name,
      session_exercise_id: exercise.id,
      exercise_ordinal: exercise.ordinal,
      exercise_status: exercise.status,
      exercise_effort: exercise.effort,
      metric_profile: exercise.metric_profile,
      metric_contract_version: exercise.metric_contract_version,
      exercise_metric_generation: exercise.exercise_metric_generation,
    } as const;
    rows.push(record("session_exercise", exerciseContext));
    for (const set of setsByExercise.get(exercise.id) ?? []) {
      const identity: MetricIdentity = {
        profile: set.metric_profile,
        contractVersion: set.metric_contract_version,
        exerciseMetricGeneration: set.exercise_metric_generation,
      };
      rows.push(record("session_set", {
        ...exerciseContext,
        set_id: set.id,
        set_kind: set.set_kind,
        set_ordinal: set.ordinal,
        set_status: set.status,
        set_completed_at_epoch_ms: set.completed_at_ms,
        set_completed_at_utc: timestamp(set.completed_at_ms),
        ...csvMetricFields({
          identity,
          target: JSON.parse(set.target_json),
          observation: set.observed_json === null
            ? null
            : JSON.parse(set.observed_json),
          unit: JSON.parse(set.unit_json),
        }),
        ...targetReference({
          legacy: set.source_plan_working_set_target_id,
          owned: set.source_owned_plan_working_set_target_id,
        }),
      }));
    }
  }
  return Object.freeze(rows);
}

function overlayRows(
  source: SourceSessionRow,
  snapshot: HistoryCorrectionSnapshot,
  corrected: boolean,
): readonly CsvExportRow[] {
  assertValidHistoryCorrectionSnapshot(snapshot);
  if (snapshot.session.id !== source.id) {
    throw new CsvExportRepositoryError("csv_export_collection_failed");
  }
  const context = sourceContext(source, snapshot.session, corrected);
  const rows: CsvExportRow[] = [record("session", context)];
  for (const exercise of snapshot.exercises) {
    const exerciseContext = {
      ...context,
      exercise_id: exercise.exerciseId,
      exercise_name: exercise.name,
      session_exercise_id: exercise.id,
      exercise_ordinal: exercise.ordinal,
      exercise_status: exercise.status,
      exercise_effort: exercise.effort,
      metric_profile: exercise.metricIdentity.profile,
      metric_contract_version: exercise.metricIdentity.contractVersion,
      exercise_metric_generation: exercise.metricIdentity.exerciseMetricGeneration,
    } as const;
    rows.push(record("session_exercise", exerciseContext));
    for (const set of exercise.sets) {
      rows.push(record("session_set", {
        ...exerciseContext,
        set_id: set.id,
        set_kind: set.kind,
        set_ordinal: set.ordinal,
        set_status: set.status,
        set_completed_at_epoch_ms: set.completedAtMs,
        set_completed_at_utc: timestamp(set.completedAtMs),
        ...csvMetricFields({
          identity: exercise.metricIdentity,
          target: set.target,
          observation: set.observation,
          unit: {},
        }),
        ...targetReference({
          legacy: set.sourcePlanWorkingSetTargetId,
          owned: set.sourceOwnedPlanWorkingSetTargetId,
        }),
      }));
    }
  }
  return Object.freeze(rows);
}

async function collectRows(
  transaction: Pick<SqliteTransactionExecutor, "queryAll">,
): Promise<readonly CsvExportRow[]> {
  const [sessions, exercises, sets, audits, recommendations] = await Promise.all([
    transaction.queryAll<SourceSessionRow>(
      `SELECT session.id, session.source, session.status, session.local_date,
              session.timezone, session.creation_timezone_offset_minutes,
              session.started_at_ms, session.completed_at_ms, session.revision,
              overlay.effective_revision, overlay.lifecycle, overlay.snapshot_json
       FROM workout_sessions session
       LEFT JOIN history_session_overlays overlay ON overlay.session_id = session.id
       ORDER BY session.started_at_ms, session.id`,
    ),
    transaction.queryAll<SourceExerciseRow>(
      `SELECT id, session_id, exercise_id, exercise_name, ordinal, status, effort,
              metric_profile, metric_contract_version, exercise_metric_generation
       FROM session_exercises
       ORDER BY session_id, ordinal, id`,
    ),
    transaction.queryAll<SourceSetRow>(
      `SELECT id, session_exercise_id, set_kind, ordinal, status, completed_at_ms,
              metric_profile, metric_contract_version,
              exercise_metric_generation, target_json, observed_json, unit_json,
              source_plan_working_set_target_id,
              source_owned_plan_working_set_target_id
       FROM session_sets
       ORDER BY session_exercise_id,
                CASE set_kind WHEN 'warmup' THEN 0 ELSE 1 END, ordinal, id`,
    ),
    transaction.queryAll<AuditRow>(
      `SELECT id, session_id, effective_revision, event_type, field_identity,
              before_json, after_json, occurred_at_ms
       FROM history_audit_events
       ORDER BY occurred_at_ms, session_id, effective_revision, id`,
    ),
    transaction.queryAll<RecommendationRow>(
      `SELECT 'legacy' AS target_graph, id, exercise_id,
              plan_working_set_target_id AS target_id, rule_type, rule_version,
              evidence_json, current_target_json, proposed_target_json, status,
              created_at_ms, decided_at_ms
       FROM progression_recommendations
       UNION ALL
       SELECT 'owned' AS target_graph, id, exercise_id,
              owned_plan_working_set_target_id AS target_id, rule_type,
              rule_version, evidence_json, current_target_json,
              proposed_target_json, status, created_at_ms, decided_at_ms
       FROM owned_progression_recommendations
       ORDER BY created_at_ms, target_graph, id`,
    ),
  ]);
  const exercisesBySession = new Map<string, SourceExerciseRow[]>();
  for (const exercise of exercises) {
    const rows = exercisesBySession.get(exercise.session_id) ?? [];
    rows.push(exercise);
    exercisesBySession.set(exercise.session_id, rows);
  }
  const setsByExercise = new Map<string, SourceSetRow[]>();
  for (const set of sets) {
    const rows = setsByExercise.get(set.session_exercise_id) ?? [];
    rows.push(set);
    setsByExercise.set(set.session_exercise_id, rows);
  }
  const contextBySession = new Map<string, SessionContext>();
  const correctedSessions = new Set(audits
    .filter(({ event_type }) => event_type === "correction")
    .map(({ session_id }) => session_id));
  const output: CsvExportRow[] = [];
  for (const session of sessions) {
    const sessionRows = session.snapshot_json === null
      ? rawRows(session, exercisesBySession.get(session.id) ?? [], setsByExercise)
      : overlayRows(
          session,
          JSON.parse(session.snapshot_json) as HistoryCorrectionSnapshot,
          correctedSessions.has(session.id),
        );
    output.push(...sessionRows);
    const contextRow = sessionRows[0]!;
    contextBySession.set(session.id, contextRow as SessionContext);
  }
  for (const audit of audits) {
    output.push(record("history_audit", {
      ...contextBySession.get(audit.session_id),
      session_id: audit.session_id,
      audit_event_id: audit.id,
      audit_event_type: audit.event_type,
      audit_field_identity: audit.field_identity,
      audit_before_json: canonicalizeCsvJson(audit.before_json),
      audit_after_json: canonicalizeCsvJson(audit.after_json),
      audit_occurred_at_epoch_ms: audit.occurred_at_ms,
      audit_occurred_at_utc: timestamp(audit.occurred_at_ms),
    }));
  }
  for (const recommendation of recommendations) {
    const evidence = parseObject(recommendation.evidence_json);
    const source = evidence !== null && typeof evidence.source === "object"
      && evidence.source !== null && !Array.isArray(evidence.source)
      ? evidence.source as Readonly<Record<string, unknown>>
      : null;
    const rule = evidence !== null && typeof evidence.rule === "object"
      && evidence.rule !== null && !Array.isArray(evidence.rule)
      ? evidence.rule as Readonly<Record<string, unknown>>
      : null;
    const sourceSessionId = stringValue(source?.sessionId)
      ?? stringValue(evidence?.sessionId);
    const sourceSetIds = stringArray(source?.setIds)
      ?? stringArray(evidence?.setIds);
    output.push(record("recommendation", {
      ...contextBySession.get(sourceSessionId ?? ""),
      session_id: sourceSessionId,
      exercise_id: recommendation.exercise_id,
      recommendation_id: recommendation.id,
      recommendation_target_graph: recommendation.target_graph,
      recommendation_target_id: recommendation.target_id,
      recommendation_rule_id: stringValue(rule?.id) ?? recommendation.rule_type,
      recommendation_rule_version: typeof rule?.version === "number"
        ? rule.version
        : recommendation.rule_version,
      recommendation_status: recommendation.status,
      recommendation_decision: stringValue(evidence?.decision),
      recommendation_reason_code: stringValue(evidence?.reasonCode),
      recommendation_reason: stringValue(evidence?.reason),
      recommendation_confidence: stringValue(evidence?.confidence),
      recommendation_evidence_json: canonicalizeCsvJson(recommendation.evidence_json),
      recommendation_source_session_id: sourceSessionId,
      recommendation_source_session_exercise_id:
        stringValue(source?.sessionExerciseId)
        ?? stringValue(evidence?.sessionExerciseId),
      recommendation_source_set_ids_json: sourceSetIds === null
        ? null
        : canonicalizeCsvJson(sourceSetIds),
      recommendation_current_target_json:
        canonicalizeCsvJson(recommendation.current_target_json),
      recommendation_proposed_target_json:
        canonicalizeCsvJson(recommendation.proposed_target_json),
      recommendation_created_at_epoch_ms: recommendation.created_at_ms,
      recommendation_created_at_utc: timestamp(recommendation.created_at_ms),
      recommendation_decided_at_epoch_ms: recommendation.decided_at_ms,
      recommendation_decided_at_utc: timestamp(recommendation.decided_at_ms),
    }));
  }
  return Object.freeze(output);
}

export function createCsvExportRepository(
  kernel: SqliteKernel,
): CsvExportRepository {
  async function readRows(): Promise<readonly CsvExportRow[]> {
    try {
      // The private serialized transaction gives every SELECT the same SQLite
      // snapshot. No execute call is exposed to this collector.
      return await kernel.write((transaction) => collectRows({
        queryAll: transaction.queryAll,
      }));
    } catch (error) {
      if (error instanceof CsvExportRepositoryError) throw error;
      throw new CsvExportRepositoryError("csv_export_collection_failed");
    }
  }
  return Object.freeze({
    readRows,
    async serialize() {
      return serializeCsvExport(await readRows());
    },
  });
}
