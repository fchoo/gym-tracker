import {
  PHASE20_CALENDAR_STAGE_GROUPS,
  type Phase20CalendarStage,
  type Phase20CalendarStageGroup,
} from "../../bootstrap/phase20CalendarObservation";

export type V12CalendarNativeExecution = "NOT_RUN" | "REVIEW_REQUIRED" | "FAIL";

export type V12CalendarAcceptanceCase = Readonly<{
  id: `NV-CAL-${string}`;
  concern: string;
  disposition: "observe-only";
}>;

export const V12_CALENDAR_ACCEPTANCE_CASES = Object.freeze([
  { id: "NV-CAL-01", concern: "10/24.9/25/25.1 percent bidirectional thresholds", disposition: "observe-only" },
  { id: "NV-CAL-02", concern: "below/exact/above release semantics", disposition: "observe-only" },
  { id: "NV-CAL-03", concern: "retreat, fast-short, reverse, cancellation, and second input", disposition: "observe-only" },
  { id: "NV-CAL-04", concern: "vertical and diagonal intent ownership", disposition: "observe-only" },
  { id: "NV-CAL-05", concern: "first/middle/last focused-week geometry", disposition: "observe-only" },
  { id: "NV-CAL-06", concern: "four/five/six row month and civil-date semantics", disposition: "observe-only" },
  { id: "NV-CAL-07", concern: "adjacent month, leap year, and rapid retarget", disposition: "observe-only" },
  { id: "NV-CAL-08", concern: "rotation/background generations and callbacks", disposition: "observe-only" },
  { id: "NV-CAL-09", concern: "normal/reduced motion, DEV-01, and DEV-02", disposition: "observe-only" },
] as const satisfies readonly V12CalendarAcceptanceCase[]);

export type V12CalendarObservationSchema = Readonly<{
  stageId: Phase20CalendarStage;
  group: Phase20CalendarStageGroup;
  schemaVersion: 1;
  requiredCollections: readonly string[];
}>;

const REQUIRED = Object.freeze({
  pointer: Object.freeze(["viewport", "pointer_events", "rendered_panel_samples", "transition_events", "semantic_samples", "callback_events", "focus_events", "motion"]),
  "input-interrupt": Object.freeze(["viewport", "pointer_events", "rendered_panel_samples", "input_attempts", "transition_events", "semantic_samples", "callback_events", "motion"]),
  "row-geometry": Object.freeze(["viewport", "row_measurements", "rendered_overlay_samples", "transition_events", "semantic_samples", "callback_events", "focus_events", "motion"]),
  "month-geometry": Object.freeze(["viewport", "row_measurements", "transition_events", "semantic_samples", "motion"]),
  lifecycle: Object.freeze(["viewport_events", "lifecycle_events", "transition_events", "semantic_samples", "callback_events", "motion_events"]),
  "reduced-motion": Object.freeze(["viewport", "row_measurements", "rendered_overlay_samples", "transition_events", "semantic_samples", "callback_events", "focus_events", "motion_events"]),
  baseline: Object.freeze(["viewport", "row_measurements", "baseline_measurements", "semantic_samples", "motion"]),
} satisfies Record<Phase20CalendarStageGroup, readonly string[]>);

function schemas(
  stages: readonly Phase20CalendarStage[],
  group: Phase20CalendarStageGroup,
): readonly V12CalendarObservationSchema[] {
  return stages.map((stageId) => Object.freeze({
    stageId,
    group,
    schemaVersion: 1 as const,
    requiredCollections: REQUIRED[group],
  }));
}

export const V12_CALENDAR_OBSERVATION_SCHEMAS = Object.freeze([
  ...schemas(PHASE20_CALENDAR_STAGE_GROUPS.pointer, "pointer"),
  ...schemas(PHASE20_CALENDAR_STAGE_GROUPS.inputInterrupt, "input-interrupt"),
  ...schemas(PHASE20_CALENDAR_STAGE_GROUPS.rowGeometry, "row-geometry"),
  ...schemas(PHASE20_CALENDAR_STAGE_GROUPS.monthGeometry, "month-geometry"),
  ...schemas(PHASE20_CALENDAR_STAGE_GROUPS.lifecycle, "lifecycle"),
  ...schemas(PHASE20_CALENDAR_STAGE_GROUPS.reducedMotion, "reduced-motion"),
  ...schemas(PHASE20_CALENDAR_STAGE_GROUPS.baseline, "baseline"),
]);

export type V12CalendarAcceptanceObservationPlan = Readonly<{
  sourceDigest: string;
  nativeExecution: V12CalendarNativeExecution;
  stages: readonly V12CalendarObservationSchema[];
}>;

const SHA256 = /^[a-f0-9]{64}$/u;

function exactRecord(value: unknown, keys: readonly string[]): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * Validates the source-freeze plan only. Native observations and PASS/FAIL are
 * validated and derived by the host-side stage-specific contract.
 */
export function runV12CalendarAcceptanceContract(input: V12CalendarAcceptanceObservationPlan): Readonly<{
  nativeExecution: V12CalendarNativeExecution;
  caseCount: number;
  stageCount: number;
}> {
  if (!exactRecord(input, ["sourceDigest", "nativeExecution", "stages"])) throw new Error("calendar_observation_invalid");
  if (!SHA256.test(input.sourceDigest)) throw new Error("calendar_source_digest_invalid");
  if (!(["NOT_RUN", "REVIEW_REQUIRED", "FAIL"] as readonly unknown[]).includes(input.nativeExecution)) throw new Error("calendar_execution_invalid");
  if (!Array.isArray(input.stages) || input.stages.length !== V12_CALENDAR_OBSERVATION_SCHEMAS.length) throw new Error("calendar_stage_plan_invalid");
  input.stages.forEach((stage, index) => {
    const expected = V12_CALENDAR_OBSERVATION_SCHEMAS[index];
    if (!exactRecord(stage, ["stageId", "group", "schemaVersion", "requiredCollections"])
      || JSON.stringify(stage) !== JSON.stringify(expected)) throw new Error("calendar_stage_plan_invalid");
  });
  return Object.freeze({
    nativeExecution: input.nativeExecution,
    caseCount: V12_CALENDAR_ACCEPTANCE_CASES.length,
    stageCount: V12_CALENDAR_OBSERVATION_SCHEMAS.length,
  });
}
