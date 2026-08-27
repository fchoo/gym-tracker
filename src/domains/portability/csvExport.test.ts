import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  CSV_EXPORT_COLUMNS,
  CSV_EXPORT_FORMAT_VERSION,
  canonicalizeCsvJson,
  csvMetricFields,
  serializeCsvExport,
  type CsvExportRow,
} from "./csvExport";
import type {
  MetricIdentity,
} from "../metrics";

const HEADER = [
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
].join(",");

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function row(values: Partial<CsvExportRow>): CsvExportRow {
  return {
    format_version: CSV_EXPORT_FORMAT_VERSION,
    record_type: "session_set",
    ...values,
  };
}

describe("CSV export v1 serializer", () => {
  it("freezes the versioned header and emits exactly one terminal CRLF", () => {
    expect(CSV_EXPORT_FORMAT_VERSION).toBe(1);
    expect(CSV_EXPORT_COLUMNS.join(",")).toBe(HEADER);
    expect(text(serializeCsvExport([]))).toBe(`${HEADER}\r\n`);
  });

  it("serializes one and many factual records as byte-stable RFC 4180 UTF-8", () => {
    const rows = [
      row({
        session_id: "session-1",
        session_status: "completed",
        session_lifecycle: "active",
        session_original_local_date: "2026-08-24",
        session_original_timezone: "Asia/Singapore",
        session_original_timezone_offset_minutes: 480,
        session_original_started_at_epoch_ms: 1_777_000_000_000,
        session_original_started_at_utc: "2026-04-25T16:26:40.000Z",
        session_effective_local_date: "2026-08-25",
        session_effective_timezone: "Asia/Singapore",
        session_effective_started_at_epoch_ms: 1_777_000_000_000,
        session_effective_started_at_utc: "2026-04-25T16:26:40.000Z",
        session_effective_revision: 3,
        session_corrected: true,
        exercise_name: "Café, \"press\"\n第二行",
        set_kind: "warmup",
        target_json: '{"loadGrams":40500,"profile":"load_reps","version":1}',
        observation_json: '{"loadGrams":40500,"profile":"load_reps","reps":8,"source":"manual","version":1}',
        target_load_grams: 40_500,
        observed_load_grams: 40_500,
        observed_reps: 8,
      }),
      row({
        record_type: "recommendation",
        recommendation_id: "recommendation-1",
        recommendation_status: "accepted",
        recommendation_decision: "increase",
      }),
    ];

    const first = serializeCsvExport(rows);
    expect(serializeCsvExport(rows)).toEqual(first);
    const output = text(first);
    expect(output.startsWith(`${HEADER}\r\n`)).toBe(true);
    expect(output).toContain('"Café, ""press""\r\n第二行"');
    expect(output).toContain(
      '"{""loadGrams"":40500,""profile"":""load_reps"",""version"":1}"',
    );
    expect(output.endsWith("\r\n")).toBe(true);
    expect(output.endsWith("\r\n\r\n")).toBe(false);
  });

  it.each([
    "=2+3", "+cmd|' /C calc'!A0", "-2+3", "@SUM(A1:A2)",
    "\t=2+3", "  =2+3", "\u0000@SUM(A1:A2)",
    "\u0085+2+3", "\ufeff-2+3",
  ])("neutralizes formula-leading text after leading whitespace/control characters: %s", (value) => {
    const output = text(serializeCsvExport([row({ exercise_name: value })]));
    expect(output).toContain(`'${value}`);
  });

  it("keeps numeric negatives numeric and formats decimal numbers without locale rules", () => {
    const output = text(serializeCsvExport([row({
      session_original_timezone_offset_minutes: -210,
      target_load_grams: 40.5,
    })]));
    expect(output).toContain(",-210,");
    expect(output).toContain(",40.5,");
    expect(output).not.toContain("'-210");
  });

  it("recursively canonicalizes JSON with binary code-unit key ordering", () => {
    expect(canonicalizeCsvJson('{"ä":3,"z":2,"A":{"b":2,"a":1}}'))
      .toBe('{"A":{"a":1,"b":2},"z":2,"ä":3}');
    expect(canonicalizeCsvJson({ z: 2, A: [{ y: 2, x: 1 }] }))
      .toBe('{"A":[{"x":1,"y":2}],"z":2}');
    expect(() => canonicalizeCsvJson(1e100)).toThrow("csv_export_json_invalid");
    expect(() => canonicalizeCsvJson("{")).toThrow("csv_export_json_invalid");
    expect(() => canonicalizeCsvJson(undefined)).toThrow("csv_export_json_invalid");
  });

  const metricCases: readonly Readonly<[
    MetricIdentity["profile"],
    number,
    unknown,
    unknown,
    Partial<CsvExportRow>,
  ]>[] = [
    ["load_reps", 1, { version: 1, profile: "load_reps", loadGrams: 40_500, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false }, { version: 1, profile: "load_reps", loadGrams: 40_500, reps: 9, source: "manual" }, { target_load_grams: 40_500, observed_load_grams: 40_500, observed_reps: 9 }],
    ["bodyweight_reps", 1, { version: 1, profile: "bodyweight_reps", minReps: 8, maxReps: 12, variationId: "strict", perSide: false }, { version: 1, profile: "bodyweight_reps", reps: 11, source: "manual" }, { observed_reps: 11, variation_id: "strict" }],
    ["added_load_reps", 1, { version: 1, profile: "added_load_reps", addedLoadGrams: 10_000, minReps: 5, maxReps: 8, incrementGrams: 1_250, perSide: false }, { version: 1, profile: "added_load_reps", addedLoadGrams: 10_000, reps: 7, source: "manual" }, { target_added_load_grams: 10_000, observed_added_load_grams: 10_000, observed_reps: 7 }],
    ["assisted_reps", 1, { version: 1, profile: "assisted_reps", assistanceGrams: 20_000, minReps: 5, maxReps: 8, decrementGrams: 2_500, assistanceEquipmentId: "machine-1", perSide: false }, { version: 1, profile: "assisted_reps", assistanceGrams: 20_000, reps: 7, source: "manual" }, { target_assistance_grams: 20_000, observed_assistance_grams: 20_000, assistance_equipment_id: "machine-1" }],
    ["timed_hold", 1, { version: 1, profile: "timed_hold", durationSeconds: 45, perSide: true }, { version: 1, profile: "timed_hold", durationSeconds: 44, source: "manual" }, { target_duration_seconds: 45, observed_duration_seconds: 44, per_side: true }],
    ["timed_hold", 2, { version: 2, profile: "timed_hold", durationMs: 45_500, perSide: false }, { version: 2, profile: "timed_hold", durationMs: 45_250, source: "manual" }, { target_duration_ms: 45_500, observed_duration_ms: 45_250 }],
    ["fixed_distance", 1, { version: 1, profile: "fixed_distance", plannedDistanceMeters: 5_000 }, { version: 1, profile: "fixed_distance", distanceMeters: 5_000, durationMs: 1_500_000, source: "manual" }, { target_distance_meters: 5_000, observed_distance_meters: 5_000, observed_duration_ms: 1_500_000 }],
    ["fixed_time", 1, { version: 1, profile: "fixed_time", plannedDurationMs: 600_000 }, { version: 1, profile: "fixed_time", durationMs: 600_000, distanceMeters: 2_500, source: "manual" }, { target_duration_ms: 600_000, observed_duration_ms: 600_000, observed_distance_meters: 2_500 }],
    ["intervals", 1, { version: 1, profile: "intervals", protocolId: "emom", comparatorId: "rounds_then_work", comparatorVersion: 1, plannedRounds: 10, workIntervalMs: 40_000, restIntervalMs: 20_000 }, { version: 1, profile: "intervals", protocolId: "emom", completedRounds: 9, completedWorkMs: 360_000, source: "manual" }, { planned_rounds: 10, completed_rounds: 9, work_interval_ms: 40_000, rest_interval_ms: 20_000, completed_work_ms: 360_000 }],
    ["unscored", 1, { version: 1, profile: "unscored", completionRequired: true }, { version: 1, profile: "unscored", completed: true, source: "manual" }, { completion_required: true, completed: true }],
  ];

  it.each(metricCases)("maps %s contract %i to explicit atomic unit fields", (profile, contractVersion, target, observation, expected) => {
    expect(csvMetricFields({
      identity: { profile, contractVersion, exerciseMetricGeneration: 1 },
      target,
      observation,
      unit: { sourceUnit: "atomic" },
    })).toEqual(expect.objectContaining(expected));
  });

  it("rejects non-finite or unsafe numeric values instead of coercing them", () => {
    expect(() => serializeCsvExport([row({ target_load_grams: Number.NaN })]))
      .toThrow("csv_export_value_invalid");
    expect(() => serializeCsvExport([row({ observed_reps: Number.MAX_VALUE })]))
      .toThrow("csv_export_value_invalid");
    expect(() => serializeCsvExport([{ ...row({}), format_version: 2 as 1 }]))
      .toThrow("csv_export_value_invalid");
    expect(csvMetricFields({
      identity: { profile: "unscored", contractVersion: 1, exerciseMetricGeneration: 1 },
      target: { version: 1, profile: "unscored", completionRequired: true },
      observation: null,
      unit: {},
    }).observation_json).toBeNull();
  });
});
