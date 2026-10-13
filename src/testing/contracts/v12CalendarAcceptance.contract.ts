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

type CalendarSample = Readonly<Record<string, unknown>>;
export type V12CalendarAcceptanceObservation = Readonly<{
  sourceDigest: string;
  nativeExecution: V12CalendarNativeExecution;
  samples: readonly CalendarSample[];
}>;

const SHA256 = /^[a-f0-9]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function record(value: unknown, code: string): asserts value is CalendarSample {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
}

function finite(value: unknown, code: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(code);
}

function nonEmpty(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
}

function execution(value: unknown): asserts value is V12CalendarNativeExecution {
  if (value !== "NOT_RUN" && value !== "REVIEW_REQUIRED" && value !== "FAIL") throw new Error("calendar_execution_invalid");
}

function sample(value: CalendarSample, previous: CalendarSample | undefined): void {
  finite(value.timestampMs, "calendar_timestamp_invalid");
  finite(value.widthDp, "calendar_width_invalid");
  finite(value.dxDp, "calendar_dx_invalid");
  finite(value.dyDp, "calendar_dy_invalid");
  finite(value.translationDp, "calendar_translation_invalid");
  if ((value.widthDp as number) <= 0 || Math.abs((value.translationDp as number) - (value.dxDp as number)) > 2) throw new Error("calendar_translation_invalid");
  if (value.intentOwner !== "horizontal" && value.intentOwner !== "vertical" && value.intentOwner !== "diagonal") throw new Error("calendar_intent_invalid");
  nonEmpty(value.title, "calendar_title_invalid");
  if (typeof value.selectedCivilDate !== "string" || !DATE.test(value.selectedCivilDate)) throw new Error("calendar_date_invalid");
  if (!Number.isInteger(value.generation) || (value.generation as number) < 1) throw new Error("calendar_generation_invalid");
  nonEmpty(value.focusedWeek, "calendar_focused_week_invalid");
  if (!Array.isArray(value.rowBounds) || value.rowBounds.length !== 2 || !value.rowBounds.every(Number.isFinite)
    || value.rowBounds[1] <= value.rowBounds[0]) throw new Error("calendar_row_bounds_invalid");
  if (!Number.isInteger(value.callbackCount) || (value.callbackCount as number) < 1) throw new Error("calendar_callback_invalid");
  nonEmpty(value.focusIdentity, "calendar_focus_identity_invalid");
  if (value.motion !== "normal" && value.motion !== "reduced") throw new Error("calendar_motion_invalid");
  if (previous !== undefined) {
    if ((value.timestampMs as number) <= (previous.timestampMs as number)) throw new Error("calendar_timestamp_non_monotonic");
    if ((value.generation as number) < (previous.generation as number)) throw new Error("calendar_generation_stale");
    if ((value.callbackCount as number) < (previous.callbackCount as number)) throw new Error("calendar_callback_stale");
  }
}

/** Validates source-derived intermediate samples; no source-freeze path may emit PASS. */
export function runV12CalendarAcceptanceContract(input: V12CalendarAcceptanceObservation): Readonly<{
  status: V12CalendarNativeExecution;
  caseCount: number;
}> {
  record(input, "calendar_observation_invalid");
  if (!SHA256.test(input.sourceDigest)) throw new Error("calendar_source_digest_invalid");
  execution(input.nativeExecution);
  if (!Array.isArray(input.samples) || input.samples.length < 2) throw new Error("calendar_intermediate_samples_required");
  input.samples.forEach((entry, index) => {
    record(entry, "calendar_sample_invalid");
    sample(entry, index === 0 ? undefined : input.samples[index - 1]);
  });
  const exactBoundary = input.samples.some(({ intentOwner, widthDp, dxDp }) => intentOwner === "horizontal"
    && Math.abs(Math.abs(dxDp as number) / (widthDp as number) - 0.25) < 0.0001);
  if (!exactBoundary) throw new Error("calendar_threshold_boundary_invalid");
  return Object.freeze({ status: input.nativeExecution, caseCount: V12_CALENDAR_ACCEPTANCE_CASES.length });
}
