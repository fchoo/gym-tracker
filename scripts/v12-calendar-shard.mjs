const SHA256 = /^[a-f0-9]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

function record(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value;
}

function finite(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(code);
}

function text(value, code) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
}

function execution(value) {
  if (!["NOT_RUN", "REVIEW_REQUIRED", "FAIL"].includes(value)) throw new Error("calendar_execution_invalid");
}

function validateSample(value, previous) {
  record(value, "calendar_sample_invalid");
  for (const [key, code] of [["timestampMs", "calendar_timestamp_invalid"], ["widthDp", "calendar_width_invalid"], ["dxDp", "calendar_dx_invalid"], ["dyDp", "calendar_dy_invalid"], ["translationDp", "calendar_translation_invalid"]]) finite(value[key], code);
  if (value.widthDp <= 0 || Math.abs(value.translationDp - value.dxDp) > 2) throw new Error("calendar_translation_invalid");
  if (!["horizontal", "vertical", "diagonal"].includes(value.intentOwner)) throw new Error("calendar_intent_invalid");
  text(value.title, "calendar_title_invalid");
  if (typeof value.selectedCivilDate !== "string" || !DATE.test(value.selectedCivilDate)) throw new Error("calendar_date_invalid");
  if (!Number.isInteger(value.generation) || value.generation < 1) throw new Error("calendar_generation_invalid");
  text(value.focusedWeek, "calendar_focused_week_invalid");
  if (!Array.isArray(value.rowBounds) || value.rowBounds.length !== 2 || !value.rowBounds.every(Number.isFinite) || value.rowBounds[1] <= value.rowBounds[0]) throw new Error("calendar_row_bounds_invalid");
  if (!Number.isInteger(value.callbackCount) || value.callbackCount < 1) throw new Error("calendar_callback_invalid");
  text(value.focusIdentity, "calendar_focus_identity_invalid");
  if (!["normal", "reduced"].includes(value.motion)) throw new Error("calendar_motion_invalid");
  if (previous && value.timestampMs <= previous.timestampMs) throw new Error("calendar_timestamp_non_monotonic");
  if (previous && value.generation < previous.generation) throw new Error("calendar_generation_stale");
  if (previous && value.callbackCount < previous.callbackCount) throw new Error("calendar_callback_stale");
}

export function validateV12CalendarShard(input) {
  const value = record(input, "calendar_observation_invalid");
  if (Object.hasOwn(value, "finalVerdict")) throw new Error("calendar_final_verdict_forbidden");
  if (typeof value.sourceDigest !== "string" || !SHA256.test(value.sourceDigest)) throw new Error("calendar_source_digest_invalid");
  execution(value.nativeExecution);
  if (!Array.isArray(value.samples) || value.samples.length < 2) throw new Error("calendar_intermediate_samples_required");
  value.samples.forEach((entry, index) => validateSample(entry, value.samples[index - 1]));
  if (!value.samples.some(({ intentOwner, widthDp, dxDp }) => intentOwner === "horizontal" && Math.abs(Math.abs(dxDp) / widthDp - 0.25) < 0.0001)) throw new Error("calendar_threshold_boundary_invalid");
  return Object.freeze({ status: value.nativeExecution, caseCount: 9 });
}

export function executeV12CalendarShard(observations) {
  validateV12CalendarShard(observations);
  return Object.freeze({ producer: "v12-calendar-shard/v1", status: "NOT_RUN", observations });
}
