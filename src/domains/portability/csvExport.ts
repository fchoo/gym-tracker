import {
  parseMetricIdentity,
  parseMetricObservation,
  parseMetricTarget,
  type MetricIdentity,
  type MetricObservation,
  type MetricTarget,
} from "../metrics";

export const CSV_EXPORT_FORMAT_VERSION = 1 as const;

export const CSV_EXPORT_COLUMNS = Object.freeze([
  "format_version", "record_type",
  "session_id", "session_source", "session_status", "session_lifecycle",
  "session_original_local_date", "session_original_timezone",
  "session_original_timezone_offset_minutes",
  "session_original_started_at_epoch_ms", "session_original_started_at_utc",
  "session_original_completed_at_epoch_ms", "session_original_completed_at_utc",
  "session_effective_local_date", "session_effective_timezone",
  "session_effective_started_at_epoch_ms", "session_effective_started_at_utc",
  "session_effective_completed_at_epoch_ms", "session_effective_completed_at_utc",
  "session_effective_revision", "session_corrected",
  "exercise_id", "exercise_name", "session_exercise_id",
  "exercise_ordinal", "exercise_status", "exercise_effort",
  "set_id", "set_kind", "set_ordinal", "set_status",
  "set_completed_at_epoch_ms", "set_completed_at_utc",
  "metric_profile", "metric_contract_version", "exercise_metric_generation",
  "target_json", "observation_json", "unit_json",
  "target_load_grams", "observed_load_grams",
  "target_added_load_grams", "observed_added_load_grams",
  "target_assistance_grams", "observed_assistance_grams",
  "target_min_reps", "target_max_reps", "observed_reps",
  "target_duration_seconds", "observed_duration_seconds",
  "target_duration_ms", "observed_duration_ms",
  "target_distance_meters", "observed_distance_meters",
  "planned_rounds", "completed_rounds", "work_interval_ms",
  "rest_interval_ms", "completed_work_ms", "completion_required",
  "completed", "variation_id", "assistance_equipment_id",
  "protocol_id", "comparator_id", "comparator_version",
  "per_side", "value_source", "source_target_graph", "source_target_id",
  "audit_event_id", "audit_event_type", "audit_field_identity",
  "audit_before_json", "audit_after_json",
  "audit_occurred_at_epoch_ms", "audit_occurred_at_utc",
  "recommendation_id", "recommendation_target_graph",
  "recommendation_target_id", "recommendation_rule_id",
  "recommendation_rule_version", "recommendation_status",
  "recommendation_decision", "recommendation_reason_code",
  "recommendation_reason", "recommendation_confidence",
  "recommendation_evidence_json", "recommendation_source_session_id",
  "recommendation_source_session_exercise_id",
  "recommendation_source_set_ids_json",
  "recommendation_current_target_json",
  "recommendation_proposed_target_json",
  "recommendation_created_at_epoch_ms", "recommendation_created_at_utc",
  "recommendation_decided_at_epoch_ms", "recommendation_decided_at_utc",
] as const);

export type CsvExportColumn = (typeof CSV_EXPORT_COLUMNS)[number];
export type CsvExportRecordType =
  | "session"
  | "session_exercise"
  | "session_set"
  | "history_audit"
  | "recommendation";
type CsvScalar = string | number | boolean | null;

export type CsvExportRow = Readonly<{
  format_version: typeof CSV_EXPORT_FORMAT_VERSION;
  record_type: CsvExportRecordType;
} & Partial<Record<Exclude<CsvExportColumn, "format_version" | "record_type">, CsvScalar>>>;

export class CsvExportError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-CSV01" as const;

  constructor(readonly code: "csv_export_json_invalid" | "csv_export_value_invalid") {
    super(code);
    this.name = "CsvExportError";
  }
}

function binaryCompare(left: string, right: string): number {
  return left < right ? -1 : 1;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new CsvExportError("csv_export_json_invalid");
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value !== "object" || value === undefined) {
    throw new CsvExportError("csv_export_json_invalid");
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort(binaryCompare).map((key) =>
    `${JSON.stringify(key)}:${stableJson(object[key])}`
  ).join(",")}}`;
}

export function canonicalizeCsvJson(value: string | unknown): string {
  try {
    return stableJson(typeof value === "string" ? JSON.parse(value) : value);
  } catch (error) {
    if (error instanceof CsvExportError) {
      throw error;
    }
    throw new CsvExportError("csv_export_json_invalid");
  }
}

type MetricFieldInput = Readonly<{
  identity: MetricIdentity;
  target: unknown;
  observation?: unknown | null;
  unit: unknown;
}>;

export function csvMetricFields(input: MetricFieldInput): Partial<CsvExportRow> {
  const identity = parseMetricIdentity(input.identity);
  const target = parseMetricTarget(identity, input.target);
  const observation = input.observation === null || input.observation === undefined
    ? null
    : parseMetricObservation(identity, input.observation);
  const fields: Partial<CsvExportRow> = {
    metric_profile: identity.profile,
    metric_contract_version: identity.contractVersion,
    exercise_metric_generation: identity.exerciseMetricGeneration,
    target_json: canonicalizeCsvJson(target),
    observation_json: observation === null ? null : canonicalizeCsvJson(observation),
    unit_json: canonicalizeCsvJson(input.unit),
  };
  switch (target.profile) {
    case "load_reps":
      Object.assign(fields, { target_load_grams: target.loadGrams, target_min_reps: target.minReps, target_max_reps: target.maxReps, per_side: target.perSide });
      break;
    case "bodyweight_reps":
      Object.assign(fields, { target_min_reps: target.minReps, target_max_reps: target.maxReps, variation_id: target.variationId, per_side: target.perSide });
      break;
    case "added_load_reps":
      Object.assign(fields, { target_added_load_grams: target.addedLoadGrams, target_min_reps: target.minReps, target_max_reps: target.maxReps, per_side: target.perSide });
      break;
    case "assisted_reps":
      Object.assign(fields, { target_assistance_grams: target.assistanceGrams, target_min_reps: target.minReps, target_max_reps: target.maxReps, assistance_equipment_id: target.assistanceEquipmentId, per_side: target.perSide });
      break;
    case "timed_hold":
      if (target.version === 1) Object.assign(fields, { target_duration_seconds: target.durationSeconds, per_side: target.perSide });
      else Object.assign(fields, { target_duration_ms: target.durationMs, per_side: target.perSide });
      break;
    case "fixed_distance":
      Object.assign(fields, { target_distance_meters: target.plannedDistanceMeters });
      break;
    case "fixed_time":
      Object.assign(fields, { target_duration_ms: target.plannedDurationMs });
      break;
    case "intervals":
      Object.assign(fields, { protocol_id: target.protocolId, comparator_id: target.comparatorId, comparator_version: target.comparatorVersion, planned_rounds: target.plannedRounds, work_interval_ms: target.workIntervalMs, rest_interval_ms: target.restIntervalMs });
      break;
    case "unscored":
      Object.assign(fields, { completion_required: target.completionRequired });
      break;
  }
  if (observation !== null) {
    Object.assign(fields, { value_source: observation.source });
    switch (observation.profile) {
      case "load_reps": Object.assign(fields, { observed_load_grams: observation.loadGrams, observed_reps: observation.reps }); break;
      case "bodyweight_reps": Object.assign(fields, { observed_reps: observation.reps }); break;
      case "added_load_reps": Object.assign(fields, { observed_added_load_grams: observation.addedLoadGrams, observed_reps: observation.reps }); break;
      case "assisted_reps": Object.assign(fields, { observed_assistance_grams: observation.assistanceGrams, observed_reps: observation.reps }); break;
      case "timed_hold":
        Object.assign(fields, observation.version === 1
          ? { observed_duration_seconds: observation.durationSeconds }
          : { observed_duration_ms: observation.durationMs });
        break;
      case "fixed_distance": Object.assign(fields, { observed_distance_meters: observation.distanceMeters, observed_duration_ms: observation.durationMs }); break;
      case "fixed_time": Object.assign(fields, { observed_duration_ms: observation.durationMs, observed_distance_meters: observation.distanceMeters }); break;
      case "intervals": Object.assign(fields, { completed_rounds: observation.completedRounds, completed_work_ms: observation.completedWorkMs }); break;
      case "unscored": Object.assign(fields, { completed: observation.completed }); break;
    }
  }
  return fields;
}

function scalar(value: CsvScalar | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new CsvExportError("csv_export_value_invalid");
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  const normalized = value.replace(/\r\n|\r|\n/gu, "\r\n");
  const significant = normalized.replace(
    /^[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*/u,
    "",
  );
  return /^[=+\-@]/u.test(significant) ? `'${normalized}` : normalized;
}

function quote(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

export function serializeCsvExport(rows: readonly CsvExportRow[]): Uint8Array {
  const lines = [CSV_EXPORT_COLUMNS.join(",")];
  for (const row of rows) {
    if (row.format_version !== CSV_EXPORT_FORMAT_VERSION) {
      throw new CsvExportError("csv_export_value_invalid");
    }
    lines.push(CSV_EXPORT_COLUMNS.map((column) => {
      const value = row[column];
      const normalized = column.endsWith("_json")
        && typeof value === "string"
        && value !== ""
        ? canonicalizeCsvJson(value)
        : value;
      return quote(scalar(normalized));
    }).join(","));
  }
  return new TextEncoder().encode(`${lines.join("\r\n")}\r\n`);
}
