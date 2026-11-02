import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { PNG } from "pngjs";

export const V12_CALENDAR_FLOW_REVISION = "calendar-flow-r35-real-v1";
export const V12_CALENDAR_CHUNK_MARKER = "GYM_TRACKER_V12_CALENDAR_CHUNK:";
const CALENDAR_CHUNK_SIZE = 1_800;
const MAX_CALENDAR_CHUNKS = 256;

export const V12_CALENDAR_STAGE_GROUPS = Object.freeze({
  pointer: Object.freeze([
    "drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1",
    "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above",
    "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1",
    "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above",
    "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal",
  ]),
  input_interrupt: Object.freeze(["rapid-reverse-input"]),
  row_geometry: Object.freeze([
    "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "week-collapse-middle-row", "adjacent-week",
  ]),
  month_geometry: Object.freeze([
    "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month",
  ]),
  lifecycle: Object.freeze(["rotation-during-transition", "background-during-transition"]),
  reduced_motion: Object.freeze(["reduced-motion"]),
  baseline: Object.freeze(["dev-01-padding", "dev-02-light-title"]),
});

export const V12_CALENDAR_STAGE_IDS = Object.freeze(Object.values(V12_CALENDAR_STAGE_GROUPS).flat());

const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const MONTH_TITLE = /^(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/u;
const FOCUS_IDENTITY = /^calendar-(?:day-\d{4}-\d{2}-\d{2}|agenda-[A-Za-z0-9._:-]{1,100}|collapse-day|month-(?:previous|next|today))$/u;
const FORBIDDEN_KEY = /(?:^|_)(?:expected(?:_outcome)?|final_verdict|verdict|status|pass|synthetic)(?:$|_)/iu;
const PRIVATE_KEY = /(?:account|credential|password|token|secret|payload|route|coordinate|subject|serial|bodyweight|heart.?rate|sql|path)/iu;
const GENERIC_LABEL = /^(?:visible|month|week|calendar|drag|dragging|focus|synthetic(?:-.*)?)$/iu;
const POINTER_GROUPS = new Set(["pointer", "input-interrupt"]);
const STATES = new Set(["PASS", "FAIL", "NOT_RUN", "REVIEW_REQUIRED"]);

function fail(code) {
  throw new Error(`calendar_observation_${code}`);
}

function exact(value, keys, code = "schema_invalid") {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail(code);
  return value;
}

function finite(value, code = "number_invalid") {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000) fail(code);
  return value;
}

function integer(value, code = "integer_invalid") {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

function safeString(value, pattern, code) {
  if (typeof value !== "string" || !pattern.test(value) || GENERIC_LABEL.test(value)) fail(code);
  return value;
}

function monthIdFromTitle(title) {
  const match = MONTH_TITLE.exec(title);
  if (match === null) return null;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [name, year] = title.split(" ");
  const month = names.indexOf(name) + 1;
  return month < 1 ? null : `${year}-${String(month).padStart(2, "0")}`;
}

function monthOrdinal(value) {
  const match = /^(\d{4})-(\d{2})$/u.exec(value ?? "");
  if (match === null) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

function noForbidden(value, location = "stage") {
  if (typeof value === "string") {
    if (/(?:@|\/Users\/|\/home\/|\b(?:lat|lon|gps)\b|bearer|password|secret|credential)/iu.test(value)) fail(`private_value:${location}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => noForbidden(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) fail(`authority_field:${location}.${key}`);
      if (PRIVATE_KEY.test(key)) fail(`private_field:${location}.${key}`);
      noForbidden(entry, `${location}.${key}`);
    }
  }
}

export function hashV12CalendarObservationBody(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function expectedGroup(stageId) {
  if (V12_CALENDAR_STAGE_GROUPS.pointer.includes(stageId)) return "pointer";
  if (V12_CALENDAR_STAGE_GROUPS.input_interrupt.includes(stageId)) return "input-interrupt";
  if (V12_CALENDAR_STAGE_GROUPS.row_geometry.includes(stageId)) return "row-geometry";
  if (V12_CALENDAR_STAGE_GROUPS.month_geometry.includes(stageId)) return "month-geometry";
  if (V12_CALENDAR_STAGE_GROUPS.lifecycle.includes(stageId)) return "lifecycle";
  if (V12_CALENDAR_STAGE_GROUPS.reduced_motion.includes(stageId)) return "reduced-motion";
  if (V12_CALENDAR_STAGE_GROUPS.baseline.includes(stageId)) return "baseline";
  fail("stage_unknown");
}

function pointerRatio(stageId) {
  const token = /-(10|24_9|25|25_1)$/u.exec(stageId)?.[1]
    ?? /release-(below|exact|above)$/u.exec(stageId)?.[1];
  if (token === "10" || stageId === "drag-fast-subthreshold") return 0.1;
  if (token === "24_9" || token === "below") return 0.249;
  if (token === "25" || token === "exact") return 0.25;
  if (token === "25_1" || token === "above") return 0.251;
  return null;
}

function gestureSequence(id, direction, ratio, durationMs, terminal = "UP") {
  const dx = direction * ratio;
  return {
    id,
    duration_ms: durationMs,
    points: [
      { action: "DOWN", dx_ratio: 0, dy_ratio: 0, offset_ms: 0 },
      { action: "MOVE", dx_ratio: dx, dy_ratio: 0, offset_ms: Math.max(1, durationMs - 1) },
      { action: terminal, dx_ratio: dx, dy_ratio: 0, offset_ms: durationMs },
    ],
  };
}

export function createV12CalendarDriverReceipt(stageId) {
  const group = expectedGroup(stageId);
  if (stageId === "reduced-motion") return Object.freeze({ schema_version: 1, protocol: "adb-runtime-toggle/v1", stage_id: stageId, sequences: Object.freeze([]) });
  if (!POINTER_GROUPS.has(group)) return Object.freeze({ schema_version: 1, protocol: "maestro/v1", stage_id: stageId, sequences: Object.freeze([]) });
  let sequences;
  if (stageId === "drag-retreat") sequences = [{ id: "primary", duration_ms: 180, points: [
    { action: "DOWN", dx_ratio: 0, dy_ratio: 0, offset_ms: 0 },
    { action: "MOVE", dx_ratio: -0.251, dy_ratio: 0, offset_ms: 80 },
    { action: "MOVE", dx_ratio: -0.1, dy_ratio: 0, offset_ms: 160 },
    { action: "UP", dx_ratio: -0.1, dy_ratio: 0, offset_ms: 180 },
  ] }];
  else if (stageId === "drag-cancel") sequences = [{ id: "primary", duration_ms: 100, points: [
    { action: "DOWN", dx_ratio: 0, dy_ratio: 0, offset_ms: 0 },
    { action: "MOVE", dx_ratio: -0.18, dy_ratio: 0, offset_ms: 80 },
    { action: "CANCEL", dx_ratio: -0.18, dy_ratio: 0, offset_ms: 100 },
  ] }];
  else if (stageId === "drag-vertical") sequences = [{ id: "primary", duration_ms: 180, points: [
    { action: "DOWN", dx_ratio: 0, dy_ratio: 0, offset_ms: 0 },
    { action: "MOVE", dx_ratio: 0, dy_ratio: 0.3, offset_ms: 160 },
    { action: "UP", dx_ratio: 0, dy_ratio: 0.3, offset_ms: 180 },
  ] }];
  else if (stageId === "drag-diagonal") sequences = [{ id: "primary", duration_ms: 180, points: [
    { action: "DOWN", dx_ratio: 0, dy_ratio: 0, offset_ms: 0 },
    { action: "MOVE", dx_ratio: -0.1, dy_ratio: 0.087, offset_ms: 160 },
    { action: "UP", dx_ratio: -0.1, dy_ratio: 0.087, offset_ms: 180 },
  ] }];
  else if (stageId === "rapid-reverse-input") sequences = [
    gestureSequence("forward", -1, 0.251, 80), gestureSequence("reverse", 1, 0.251, 80),
  ];
  else {
    const ratio = pointerRatio(stageId);
    const direction = stageId.startsWith("drag-backward") ? 1 : -1;
    if (ratio === null) fail("driver_invalid");
    sequences = [gestureSequence("primary", direction, ratio, stageId === "drag-fast-subthreshold" ? 60 : 180)];
  }
  return Object.freeze({ schema_version: 1, protocol: "adb-input-motionevent/v1", stage_id: stageId,
    sequences: Object.freeze(sequences.map((sequence) => Object.freeze({ ...sequence, points: Object.freeze(sequence.points.map((point) => Object.freeze(point))) }))) });
}

function validateDriverReceipt(value, stageId) {
  const expected = createV12CalendarDriverReceipt(stageId);
  if (!isDeepStrictEqual(value, expected)) fail("driver_invalid");
  return expected;
}

function commonEvent(value, kind) {
  if (value?.kind !== kind) fail(`${kind}_invalid`);
  integer(value.sequence, "sequence_invalid");
  if (value.sequence < 1) fail("sequence_invalid");
  finite(value.observed_at_monotonic_ms, "timestamp_invalid");
  if (value.observed_at_monotonic_ms < 0) fail("timestamp_invalid");
  integer(value.callback_generation, "callback_generation_invalid");
}

function viewportEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "width_dp", "height_dp", "orientation", "layout_generation"], "viewport_invalid");
  commonEvent(value, "viewport-layout");
  if (finite(value.width_dp) <= 0 || finite(value.height_dp) <= 0
    || !["portrait", "landscape"].includes(value.orientation)) fail("viewport_invalid");
  integer(value.layout_generation, "viewport_invalid");
}

function motionEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "reduced_motion"], "motion_invalid");
  commonEvent(value, "motion");
  if (typeof value.reduced_motion !== "boolean") fail("motion_invalid");
}

function semanticEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "title", "current_month_id", "selected_civil_date", "focused_week_start", "week_count"], "semantic_invalid");
  commonEvent(value, "semantic");
  safeString(value.title, MONTH_TITLE, "generic_label_invalid");
  safeString(value.current_month_id, MONTH, "semantic_invalid");
  safeString(value.selected_civil_date, DATE, "semantic_invalid");
  if (value.focused_week_start !== null) safeString(value.focused_week_start, DATE, "semantic_invalid");
  if (![4, 5, 6].includes(value.week_count)) fail("semantic_invalid");
}

function transitionState(value) {
  exact(value, ["current_month_id", "selected_civil_date", "mode", "phase", "title_panel", "drag_dx_dp", "epoch", "reduced_motion"], "transition_state_invalid");
  safeString(value.current_month_id, MONTH, "transition_state_invalid");
  safeString(value.selected_civil_date, DATE, "transition_state_invalid");
  if (!["month", "focused"].includes(value.mode)
    || !["idle", "dragging", "settling", "adjacent-collapsing", "adjacent-measuring", "adjacent-expanding"].includes(value.phase)
    || !["previous", "current", "next"].includes(value.title_panel)
    || typeof value.reduced_motion !== "boolean") fail("transition_state_invalid");
  finite(value.drag_dx_dp, "transition_state_invalid");
  integer(value.epoch, "transition_state_invalid");
}

function transitionEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "trigger", "before", "after", "command_kinds"], "transition_invalid");
  commonEvent(value, "transition");
  if (!/^(?:drag|release|cancel|invalidate|set-reduced-motion|move|settle-complete|expand|collapse|select-date|select-adjacent|layout-ready|back)$/u.test(value.trigger)
    || !Array.isArray(value.command_kinds)
    || value.command_kinds.some((entry) => !["settle-month", "settle-week", "request-back"].includes(entry))) fail("transition_invalid");
  transitionState(value.before);
  transitionState(value.after);
}

const POINTER_CALLBACK_PHASE = Object.freeze({
  onTouchesDown: "down",
  onTouchesMove: "intent",
  onBegin: "begin",
  onChange: "change",
  onEnd: "release",
  onFinalize: null,
});

function pointerEvent(value, viewportWidth) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "callback", "phase", "x_dp", "y_dp", "dx_dp", "dy_dp", "viewport_width_dp", "intent_owner"], "pointer_invalid");
  commonEvent(value, "pointer");
  if (!Object.hasOwn(POINTER_CALLBACK_PHASE, value.callback)
    || (POINTER_CALLBACK_PHASE[value.callback] !== null && POINTER_CALLBACK_PHASE[value.callback] !== value.phase)
    || (value.callback === "onFinalize" && !["finalize-release", "finalize-cancel"].includes(value.phase))
    || !["undetermined", "horizontal", "vertical", "diagonal"].includes(value.intent_owner)) fail("pointer_invalid");
  for (const key of ["x_dp", "y_dp", "dx_dp", "dy_dp", "viewport_width_dp"]) finite(value[key], "pointer_invalid");
  if (value.viewport_width_dp <= 0 || Math.abs(value.viewport_width_dp - viewportWidth) > 2) fail("pointer_invalid");
}

function renderedPanelEvent(value, viewportWidth) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "viewport_x_dp", "previous_x_dp", "current_x_dp", "next_x_dp", "width_dp"], "rendered_panel_invalid");
  commonEvent(value, "rendered-panel");
  for (const key of ["viewport_x_dp", "previous_x_dp", "current_x_dp", "next_x_dp", "width_dp"]) finite(value[key], "rendered_panel_invalid");
  if (value.width_dp <= 0 || Math.abs(value.width_dp - viewportWidth) > 2
    || Math.abs((value.current_x_dp - value.previous_x_dp) - value.width_dp) > 2
    || Math.abs((value.next_x_dp - value.current_x_dp) - value.width_dp) > 2) fail("rendered_panel_invalid");
}

function inputAttemptEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "callback", "x_dp", "y_dp", "transition_phase"], "input_attempt_invalid");
  commonEvent(value, "input-attempt");
  if (value.callback !== "onTouchStart" || !["idle", "dragging", "settling", "adjacent-collapsing", "adjacent-measuring", "adjacent-expanding"].includes(value.transition_phase)) fail("input_attempt_invalid");
  finite(value.x_dp, "input_attempt_invalid"); finite(value.y_dp, "input_attempt_invalid");
}

function rowEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "week_start", "y_dp", "height_dp", "layout_generation"], "row_geometry_invalid");
  commonEvent(value, "row-layout");
  safeString(value.week_start, DATE, "row_geometry_invalid");
  if (finite(value.height_dp) <= 0) fail("row_geometry_invalid");
  finite(value.y_dp, "row_geometry_invalid");
  integer(value.layout_generation, "row_geometry_invalid");
}

function renderedOverlayEvent(value, viewportHeight) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "phase", "progress", "reduced_motion", "selected_y_dp", "following_y_dp", "selected_month_y_dp", "following_month_y_dp", "viewport_height_dp"], "rendered_overlay_invalid");
  commonEvent(value, "rendered-overlay");
  if (!["expand", "collapse"].includes(value.phase) || ![0, 1].includes(value.progress) || typeof value.reduced_motion !== "boolean") fail("rendered_overlay_invalid");
  for (const key of ["selected_y_dp", "following_y_dp", "selected_month_y_dp", "following_month_y_dp", "viewport_height_dp"]) finite(value[key], "rendered_overlay_invalid");
  if (value.viewport_height_dp <= 0 || Math.abs(value.viewport_height_dp - viewportHeight) > 2) fail("rendered_overlay_invalid");
}

function callbackEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "callback", "epoch"], "callback_invalid");
  commonEvent(value, "callback");
  if (!["month-settle", "week-settle"].includes(value.callback)) fail("callback_invalid");
  integer(value.epoch, "callback_invalid");
}

function validateSettleContract(stage, callback, { includeReducedImmediate = false } = {}) {
  const settleKind = callback === "month-settle" ? "settle-month" : "settle-week";
  const commanded = stage.transition_events.filter(({ command_kinds }) => command_kinds.includes(settleKind));
  const immediate = includeReducedImmediate
    ? stage.transition_events.filter(({ trigger, before, after, command_kinds }) => (
      command_kinds.length === 0
      && ["expand", "collapse", "select-adjacent", "move"].includes(trigger)
      && after.reduced_motion
      && after.phase === "idle"
      && after.epoch > before.epoch
    ))
    : [];
  const expected = [...commanded, ...immediate].sort((left, right) => left.sequence - right.sequence);
  const callbacks = stage.callback_events.filter((entry) => entry.callback === callback);
  const completions = stage.transition_events.filter(({ trigger }) => trigger === "settle-complete");
  if (stage.callback_events.length !== callbacks.length || callbacks.length !== expected.length
    || new Set(callbacks.map(({ epoch }) => epoch)).size !== callbacks.length
    || completions.length !== commanded.length) fail("settle_contract_invalid");
  for (const transition of expected) {
    const matches = callbacks.filter(({ epoch }) => epoch === transition.after.epoch);
    if (matches.length !== 1 || matches[0].sequence <= transition.sequence) fail("settle_contract_invalid");
    if (transition.command_kinds.includes(settleKind)) {
      const matchingCompletions = completions.filter(({ before }) => before.epoch === transition.after.epoch);
      if (matchingCompletions.length !== 1 || matchingCompletions[0].sequence <= matches[0].sequence) fail("settle_contract_invalid");
    }
  }
  if (expected.length > 0 && callbacks.at(-1)?.epoch !== expected.at(-1)?.after.epoch) fail("settle_contract_invalid");
}

function focusEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "identity"], "focus_invalid");
  commonEvent(value, "focus");
  safeString(value.identity, FOCUS_IDENTITY, "generic_label_invalid");
}

function lifecycleEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "event", "value"], "lifecycle_invalid");
  commonEvent(value, "lifecycle");
  if (value.event === "orientation") {
    if (!["portrait", "landscape"].includes(value.value)) fail("lifecycle_invalid");
  } else if (value.event === "app-state") {
    if (!["active", "background", "inactive"].includes(value.value)) fail("lifecycle_invalid");
  } else fail("lifecycle_invalid");
}

function baselineEvent(value) {
  exact(value, ["sequence", "observed_at_monotonic_ms", "callback_generation", "kind", "measurement"], "baseline_invalid");
  commonEvent(value, "baseline");
  if (value.measurement?.kind === "content-bounds") {
    exact(value.measurement, ["kind", "screen_width_dp", "content_left_dp", "content_width_dp", "content_right_dp"], "baseline_invalid");
    for (const key of ["screen_width_dp", "content_left_dp", "content_width_dp", "content_right_dp"]) finite(value.measurement[key], "baseline_invalid");
  } else if (value.measurement?.kind === "screenshot-request") {
    exact(value.measurement, ["kind", "color_scheme"], "baseline_invalid");
    if (!['light', 'dark'].includes(value.measurement.color_scheme)) fail("baseline_invalid");
  } else fail("baseline_invalid");
}

function validateEvents(stage, eventSets) {
  const events = eventSets.flat().sort((left, right) => left.sequence - right.sequence);
  if (events.length < 2 || new Set(events.map(({ sequence }) => sequence)).size !== events.length) fail("sequence_invalid");
  for (let index = 1; index < events.length; index += 1) {
    if (events[index].observed_at_monotonic_ms <= events[index - 1].observed_at_monotonic_ms) fail("timestamp_non_monotonic");
  }
  const deltas = events.slice(1).map((event, index) => event.observed_at_monotonic_ms - events[index].observed_at_monotonic_ms);
  if (events.every(({ observed_at_monotonic_ms }) => Number.isSafeInteger(observed_at_monotonic_ms))
    && deltas.length > 0 && deltas.every((delta) => delta === 1)) fail("sequential_clock_invalid");
  const secondDeltas = deltas.slice(1).map((delta, index) => delta - deltas[index]);
  if (deltas.length >= 3 && (new Set(deltas.map((delta) => delta.toFixed(6))).size === 1
    || new Set(secondDeltas.map((delta) => delta.toFixed(6))).size === 1)) fail("modeled_clock_invalid");
  if (stage.started_at_monotonic_ms >= events[0].observed_at_monotonic_ms
    || stage.completed_at_monotonic_ms !== events.at(-1).observed_at_monotonic_ms) fail("clock_bounds_invalid");
  return events;
}

function baseStage(stage, stageId, group, keys) {
  exact(stage, [...keys, "observation_digest_sha256"], "schema_invalid");
  if (stage.schema_version !== 1 || stage.id !== stageId || stage.group !== group
    || !HASH.test(stage.observation_digest_sha256 ?? "")) fail("identity_invalid");
  finite(stage.started_at_monotonic_ms, "clock_bounds_invalid");
  finite(stage.completed_at_monotonic_ms, "clock_bounds_invalid");
  const { observation_digest_sha256: claimed, ...body } = stage;
  if (hashV12CalendarObservationBody(body) !== claimed) fail("digest_invalid");
  noForbidden(body);
}

function assertion(id, passed, observed) {
  return Object.freeze({ id, passed, observation_digest_sha256: hashV12CalendarObservationBody(observed) });
}

function relativeLuminance([red, green, blue]) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function analyzeV12CalendarScreenshot(stageId, bytes) {
  if (stageId !== "dev-02-light-title") return null;
  let image;
  try { image = PNG.sync.read(bytes); } catch { fail("screenshot_invalid"); }
  const target = [0x9B, 0x47, 0x0B];
  let closest = null; let distance = Number.POSITIVE_INFINITY; let matchingPixels = 0;
  let background = [0, 0, 0]; let backgroundLuminance = -1;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] === 0) continue;
    const rgb = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    const delta = Math.sqrt(rgb.reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0));
    if (delta < distance) { distance = delta; closest = rgb; }
    if (delta <= 18) matchingPixels += 1;
    const luminance = relativeLuminance(rgb);
    if (luminance > backgroundLuminance) { background = rgb; backgroundLuminance = luminance; }
  }
  if (closest === null) fail("screenshot_invalid");
  const foreground = relativeLuminance(closest);
  const contrastRatio = (Math.max(foreground, backgroundLuminance) + 0.05) / (Math.min(foreground, backgroundLuminance) + 0.05);
  return Object.freeze({ schema_version: 1, source: "screenshot-pixels", target_rgb: Object.freeze(target), observed_rgb: Object.freeze(closest), background_rgb: Object.freeze(background), color_distance: distance, matching_pixel_count: matchingPixels, contrast_ratio: contrastRatio });
}

function captureAssertions(stageId, measurement) {
  if (stageId !== "dev-02-light-title") {
    if (measurement !== null) fail("capture_measurement_invalid");
    return [];
  }
  exact(measurement, ["schema_version", "source", "target_rgb", "observed_rgb", "background_rgb", "color_distance", "matching_pixel_count", "contrast_ratio"], "capture_measurement_invalid");
  if (measurement.schema_version !== 1 || measurement.source !== "screenshot-pixels"
    || !isDeepStrictEqual(measurement.target_rgb, [155, 71, 11])
    || ![measurement.observed_rgb, measurement.background_rgb].every((rgb) => Array.isArray(rgb) && rgb.length === 3 && rgb.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 255))
    || !Number.isFinite(measurement.color_distance) || !Number.isSafeInteger(measurement.matching_pixel_count)
    || !Number.isFinite(measurement.contrast_ratio)) fail("capture_measurement_invalid");
  return [assertion("light-strength-title-pixels", measurement.matching_pixel_count > 0
    && measurement.color_distance <= 18 && measurement.contrast_ratio >= 4.5, measurement)];
}

function validatePointer(stage, stageId, group, driver) {
  const keys = group === "input-interrupt"
    ? ["schema_version", "id", "group", "started_at_monotonic_ms", "completed_at_monotonic_ms", "viewport", "pointer_events", "rendered_panel_samples", "input_attempts", "transition_events", "semantic_samples", "callback_events", "motion"]
    : ["schema_version", "id", "group", "started_at_monotonic_ms", "completed_at_monotonic_ms", "viewport", "pointer_events", "rendered_panel_samples", "transition_events", "semantic_samples", "callback_events", "focus_events", "motion"];
  baseStage(stage, stageId, group, keys);
  viewportEvent(stage.viewport); motionEvent(stage.motion);
  if (!Array.isArray(stage.pointer_events) || !Array.isArray(stage.rendered_panel_samples) || !Array.isArray(stage.transition_events) || !Array.isArray(stage.semantic_samples)
    || !Array.isArray(stage.callback_events) || (group === "input-interrupt" ? !Array.isArray(stage.input_attempts) : !Array.isArray(stage.focus_events))) fail("pointer_invalid");
  stage.pointer_events.forEach((value) => pointerEvent(value, stage.viewport.width_dp));
  stage.rendered_panel_samples.forEach((value) => renderedPanelEvent(value, stage.viewport.width_dp));
  stage.transition_events.forEach(transitionEvent); stage.semantic_samples.forEach(semanticEvent);
  stage.callback_events.forEach(callbackEvent);
  if (group === "input-interrupt") stage.input_attempts.forEach(inputAttemptEvent);
  else stage.focus_events.forEach(focusEvent);
  validateEvents(stage, [[stage.viewport], stage.pointer_events, stage.rendered_panel_samples, ...(group === "input-interrupt" ? [stage.input_attempts] : [stage.focus_events]), stage.transition_events, stage.semantic_samples, stage.callback_events, [stage.motion]]);
  const callbacks = stage.pointer_events.map(({ callback }) => callback);
  if (callbacks[0] !== "onTouchesDown") fail("callback_provenance_invalid");
  const cancelled = ["drag-cancel", "drag-vertical", "drag-diagonal"].includes(stageId);
  if (cancelled) {
    if (callbacks.at(-1) !== "onFinalize" || stage.pointer_events.at(-1).phase !== "finalize-cancel" || callbacks.includes("onEnd")) fail("cancel_invalid");
    const activated = callbacks.includes("onBegin") || callbacks.includes("onChange");
    if (stageId === "drag-cancel" ? (!activated || !stage.pointer_events.some(({ intent_owner }) => intent_owner === "horizontal")) : activated) fail("cancel_invalid");
  } else if (stageId === "rapid-reverse-input") {
    if (!["onBegin", "onChange", "onEnd", "onFinalize"].every((name) => callbacks.includes(name))) fail("callback_provenance_invalid");
  } else if (!["onBegin", "onChange", "onEnd"].every((name) => callbacks.includes(name))
    || callbacks.at(-1) !== "onFinalize" || stage.pointer_events.at(-1).phase !== "finalize-release") fail("callback_provenance_invalid");
  const uniqueCallbacks = cancelled ? ["onTouchesDown", "onFinalize"] : ["onTouchesDown", "onBegin", "onEnd", "onFinalize"];
  if (stageId !== "rapid-reverse-input" && uniqueCallbacks.some((name) => callbacks.filter((entry) => entry === name).length !== 1)) fail("callback_order_invalid");
  const callbackRanks = { onTouchesDown: 0, onTouchesMove: 1, onBegin: 2, onChange: 3, onEnd: 4, onFinalize: 5 };
  if (stageId !== "rapid-reverse-input" && callbacks.some((name, index) => index > 0 && callbackRanks[name] < callbackRanks[callbacks[index - 1]])) fail("callback_order_invalid");
  const generations = stage.pointer_events.map(({ callback_generation }) => callback_generation);
  if (generations.some((generation, index) => index > 0 && generation < generations[index - 1])) fail("callback_generation_invalid");
  const changes = stage.pointer_events.filter(({ callback }) => callback === "onChange");
  const released = stage.pointer_events.filter(({ callback }) => callback === "onEnd");
  const final = released.at(-1) ?? changes.at(-1);
  const ratio = final === undefined ? 0 : Math.abs(final.dx_dp) / final.viewport_width_dp;
  const titlePanels = stage.transition_events.filter(({ trigger }) => trigger === "drag").map(({ after }) => after.title_panel);
  const relevantDriverSequences = group === "input-interrupt" ? driver?.sequences.slice(0, 1) ?? [] : driver?.sequences ?? [];
  const commandedMoves = relevantDriverSequences.flatMap(({ points }) => points.filter(({ action }) => action === "MOVE"));
  const renderedMatchesCommands = cancelled && !changes.length
    ? stage.rendered_panel_samples.some((sample) => Math.abs(sample.current_x_dp - sample.viewport_x_dp) <= 2)
    : commandedMoves.every(({ dx_ratio }) => changes.some(({ dx_dp, viewport_width_dp }) => (
      Math.abs(dx_dp / viewport_width_dp - dx_ratio) <= 0.00075
      && stage.rendered_panel_samples.some((sample) => Math.abs((sample.current_x_dp - sample.viewport_x_dp) - dx_dp) <= 2)
    )));
  const assertions = [
    assertion("real-callbacks", true, callbacks),
    assertion("one-to-one-translation", renderedMatchesCommands, { commandedMoves, rendered: stage.rendered_panel_samples, changes: changes.map(({ dx_dp }) => dx_dp) }),
    assertion("terminal-kind", cancelled ? stage.pointer_events.at(-1).phase === "finalize-cancel"
      : stageId === "rapid-reverse-input" ? callbacks.includes("onFinalize") : stage.pointer_events.at(-1).phase === "finalize-release", stage.pointer_events.at(-1).phase),
  ];
  validateSettleContract(stage, "month-settle");
  const command = driver === undefined ? null : validateDriverReceipt(driver, stageId);
  const terminalPoint = command?.sequences[0]?.points.at(-1);
  const commandedRatio = terminalPoint === undefined ? null : Math.abs(terminalPoint.dx_ratio);
  if (driver !== undefined && pointerRatio(stageId) !== null) assertions.push(assertion("commanded-measured-distance", commandedRatio !== null
    && Math.abs(ratio - commandedRatio) <= 0.00075, { commandedRatio, measuredRatio: ratio }));
  const finalSemantic = stage.semantic_samples.at(-1);
  assertions.push(assertion("semantic-month-date-title", monthIdFromTitle(finalSemantic.title) === finalSemantic.current_month_id
    && finalSemantic.selected_civil_date.startsWith(`${finalSemantic.current_month_id}-`), finalSemantic));
  if (!cancelled) assertions.push(assertion("settle-callback", stage.callback_events.length === 1
    && stage.transition_events.some(({ trigger, after }) => trigger === "settle-complete" && after.phase === "idle"), { callbacks: stage.callback_events, transitions: stage.transition_events.map(({ trigger, after }) => ({ trigger, phase: after.phase })) }));
  else {
    const finalized = stage.pointer_events.at(-1);
    const resetPanel = stage.rendered_panel_samples.find((sample) => sample.sequence > finalized.sequence
      && Math.abs(sample.current_x_dp - sample.viewport_x_dp) <= 2);
    const initialSemantic = stage.semantic_samples[0];
    const settledSemantic = stage.semantic_samples.find((sample) => sample.sequence > finalized.sequence);
    assertions.push(assertion("cancel-reset-rendered-zero", resetPanel !== undefined, stage.rendered_panel_samples));
    assertions.push(assertion("cancel-semantics-unchanged", settledSemantic !== undefined
      && initialSemantic?.title === settledSemantic.title
      && initialSemantic?.current_month_id === settledSemantic.current_month_id
      && initialSemantic?.selected_civil_date === settledSemantic.selected_civil_date
      && initialSemantic?.focused_week_start === settledSemantic.focused_week_start,
    { initialSemantic, settledSemantic }));
  }
  const ratioMatch = /-(10|24_9|25|25_1)$/u.exec(stageId)?.[1]
    ?? (/release-(below|exact|above)$/u.exec(stageId)?.[1]);
  if (ratioMatch !== undefined) {
    const passed = ratioMatch === "10" ? Math.abs(ratio - 0.1) <= 2 / stage.viewport.width_dp
      : ratioMatch === "24_9" || ratioMatch === "below" ? ratio < 0.25
        : ratioMatch === "25" || ratioMatch === "exact" ? Math.abs(ratio - 0.25) < 0.000001
          : ratio > 0.25;
    assertions.push(assertion(ratioMatch === "25" || ratioMatch === "exact" ? "exact-threshold" : "stage-distance", passed, { ratio, width_dp: stage.viewport.width_dp }));
  }
  const initialMonth = stage.semantic_samples[0]?.current_month_id;
  const finalMonth = finalSemantic?.current_month_id;
  const shouldChangeMonth = !cancelled && stageId !== "drag-retreat" && stageId !== "drag-fast-subthreshold"
    && commandedRatio !== null && commandedRatio >= 0.25;
  if (driver !== undefined && (pointerRatio(stageId) !== null || ["drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal"].includes(stageId))) {
    const expectedDelta = stageId.startsWith("drag-forward") ? 1 : stageId.startsWith("drag-backward") ? -1 : 0;
    const initialOrdinal = monthOrdinal(initialMonth); const finalOrdinal = monthOrdinal(finalMonth);
    assertions.push(assertion("month-outcome", initialOrdinal !== null && finalOrdinal !== null
      && (shouldChangeMonth ? finalOrdinal - initialOrdinal === expectedDelta : finalOrdinal === initialOrdinal),
    { initialMonth, finalMonth, expectedDelta: shouldChangeMonth ? expectedDelta : 0 }));
  }
  if (stageId.startsWith("drag-forward")) assertions.push(assertion("forward-direction", (final?.dx_dp ?? 0) < 0, final?.dx_dp ?? 0));
  if (stageId.startsWith("drag-backward")) assertions.push(assertion("backward-direction", (final?.dx_dp ?? 0) > 0, final?.dx_dp ?? 0));
  if (stageId === "drag-fast-subthreshold") assertions.push(assertion("short-snap-back", ratio < 0.25 && stage.semantic_samples.at(-1).current_month_id === stage.semantic_samples[0].current_month_id, { ratio, months: stage.semantic_samples.map(({ current_month_id }) => current_month_id) }));
  if (stageId === "drag-fast-subthreshold") {
    const elapsed = (released.at(-1)?.observed_at_monotonic_ms ?? Number.POSITIVE_INFINITY) - (stage.pointer_events[0]?.observed_at_monotonic_ms ?? 0);
    assertions.push(assertion("short-fast-duration", elapsed <= 120 && ratio / elapsed >= 0.00075, { elapsed, ratio }));
  }
  if (stageId === "drag-retreat") assertions.push(assertion("threshold-recede", changes.some(({ dx_dp, viewport_width_dp }) => Math.abs(dx_dp) >= viewport_width_dp * 0.25) && ratio < 0.25 && titlePanels.includes("current"), { ratio, titlePanels }));
  if (stageId === "drag-vertical") assertions.push(assertion("vertical-intent", stage.pointer_events.some(({ intent_owner }) => intent_owner === "vertical"), stage.pointer_events.map(({ intent_owner }) => intent_owner)));
  if (stageId === "drag-diagonal") assertions.push(assertion("diagonal-intent", stage.pointer_events.some(({ intent_owner }) => intent_owner === "diagonal"), stage.pointer_events.map(({ intent_owner }) => intent_owner)));
  if (stageId === "rapid-reverse-input") {
    const secondAttempt = stage.input_attempts[1];
    assertions.push(assertion("second-input-suppressed", stage.input_attempts.length >= 2
      && secondAttempt?.transition_phase === "settling"
      && callbacks.filter((entry) => entry === "onEnd").length === 1, { input_attempts: stage.input_attempts, callbacks }));
  }
  if (stageId === "rapid-reverse-input" && driver !== undefined) assertions.push(assertion("rapid-reverse", released.length >= 1
    && stage.input_attempts.length >= 2 && driver.sequences.length === 2
    && driver.sequences[1].points.some(({ dx_ratio }) => dx_ratio > 0)
    && stage.callback_events.length === 1
    && stage.callback_events[0].epoch === stage.transition_events.filter(({ trigger }) => trigger === "release").at(-1)?.after.epoch,
  { releases: released.map(({ dx_dp }) => dx_dp), input_attempts: stage.input_attempts, callback_events: stage.callback_events }));
  return assertions;
}

function validateRows(stage, stageId) {
  const keys = ["schema_version", "id", "group", "started_at_monotonic_ms", "completed_at_monotonic_ms", "viewport", "row_measurements", "rendered_overlay_samples", "transition_events", "semantic_samples", "callback_events", "focus_events", "motion"];
  baseStage(stage, stageId, "row-geometry", keys);
  viewportEvent(stage.viewport); motionEvent(stage.motion);
  if (![stage.row_measurements, stage.rendered_overlay_samples, stage.transition_events, stage.semantic_samples, stage.callback_events, stage.focus_events].every(Array.isArray)) fail("row_geometry_invalid");
  stage.row_measurements.forEach(rowEvent); stage.rendered_overlay_samples.forEach((event) => renderedOverlayEvent(event, stage.viewport.height_dp)); stage.transition_events.forEach(transitionEvent); stage.semantic_samples.forEach(semanticEvent); stage.callback_events.forEach(callbackEvent); stage.focus_events.forEach(focusEvent);
  validateEvents(stage, [[stage.viewport], stage.row_measurements, stage.rendered_overlay_samples, stage.transition_events, stage.semantic_samples, stage.callback_events, stage.focus_events, [stage.motion]]);
  validateSettleContract(stage, "week-settle");
  const rows = [...stage.row_measurements].sort((left, right) => left.y_dp - right.y_dp);
  if (rows.length < 2 || new Set(rows.map(({ week_start }) => week_start)).size !== rows.length
    || new Set(rows.map(({ y_dp }) => y_dp)).size !== rows.length) fail("row_geometry_invalid");
  const focused = stage.semantic_samples.find(({ focused_week_start }) => focused_week_start !== null)?.focused_week_start;
  const selectedIndex = rows.findIndex(({ week_start }) => week_start === focused);
  if (selectedIndex < 0) fail("row_geometry_invalid");
  const positionPass = stageId === "week-expand-first-row" ? selectedIndex === 0
    : stageId === "week-expand-last-row" ? selectedIndex === rows.length - 1
      : stageId === "week-expand-middle-row" ? selectedIndex > 0 && selectedIndex < rows.length - 1 : selectedIndex >= 0;
  const triggers = stage.transition_events.map(({ trigger }) => trigger);
  const adjacentPass = stageId !== "adjacent-week" || ["expand", "settle-complete", "select-adjacent", "settle-complete", "layout-ready", "settle-complete"]
    .every((trigger, index, required) => triggers.indexOf(trigger, index === 0 ? 0 : triggers.indexOf(required[index - 1]) + 1) >= 0);
  const collapsePass = stageId !== "week-collapse-middle-row" || ["expand", "settle-complete", "collapse", "settle-complete"]
    .every((trigger, index, required) => triggers.indexOf(trigger, index === 0 ? 0 : triggers.indexOf(required[index - 1]) + 1) >= 0);
  const focusedRow = rows[selectedIndex];
  const followingRow = rows[selectedIndex + 1] ?? rows.at(-1);
  const expanded = stage.rendered_overlay_samples.some((sample) => sample.phase === "expand" && sample.progress === 1
    && Math.abs(sample.selected_y_dp) <= 2
    && Math.abs(sample.following_y_dp - (sample.viewport_height_dp - followingRow.height_dp)) <= 2);
  const collapseTransition = stage.transition_events.find(({ trigger }) => trigger === "collapse");
  const collapseCallback = collapseTransition === undefined ? undefined : stage.callback_events.find(({ epoch }) => epoch === collapseTransition.after.epoch);
  const collapseEndpoint = stage.rendered_overlay_samples.find((sample) => sample.phase === "collapse" && sample.progress === 0
    && Math.abs(sample.selected_y_dp - focusedRow.y_dp) <= 2
    && Math.abs(sample.following_y_dp - followingRow.y_dp) <= 2);
  const collapsed = stageId !== "week-collapse-middle-row" || (collapseEndpoint !== undefined
    && collapseCallback !== undefined && collapseEndpoint.sequence > collapseCallback.sequence);
  const selectedFocus = stageId !== "week-collapse-middle-row" || stage.focus_events.some(({ identity, sequence }) => (
    identity === `calendar-day-${stage.transition_events.at(-1)?.after.selected_civil_date}`
    && collapseEndpoint !== undefined && sequence > collapseEndpoint.sequence
  ));
  return [
    assertion("measured-row-geometry", true, rows.map(({ week_start, y_dp, height_dp }) => ({ week_start, y_dp, height_dp }))),
    assertion("focused-row-position", positionPass, { focused, selectedIndex, rowCount: rows.length }),
    assertion("ordered-transition", adjacentPass && collapsePass && triggers.includes("settle-complete"), triggers),
    assertion("rendered-overlay-positions", expanded && collapsed, stage.rendered_overlay_samples),
    assertion("inverse-morph-endpoint", collapsed, collapseEndpoint ?? null),
    assertion("selected-day-focus-restored", selectedFocus, stage.focus_events),
    assertion("focus-callback", stage.focus_events.length > 0, stage.focus_events.map(({ identity }) => identity)),
    assertion("week-settle-callback", stage.callback_events.some(({ callback }) => callback === "week-settle"), stage.callback_events),
  ];
}

function validateMonthGeometry(stage, stageId) {
  const keys = ["schema_version", "id", "group", "started_at_monotonic_ms", "completed_at_monotonic_ms", "viewport", "row_measurements", "transition_events", "semantic_samples", "callback_events", "motion"];
  baseStage(stage, stageId, "month-geometry", keys);
  viewportEvent(stage.viewport); motionEvent(stage.motion);
  if (![stage.row_measurements, stage.transition_events, stage.semantic_samples, stage.callback_events].every(Array.isArray)) fail("month_geometry_invalid");
  stage.row_measurements.forEach(rowEvent); stage.transition_events.forEach(transitionEvent); stage.semantic_samples.forEach(semanticEvent); stage.callback_events.forEach(callbackEvent);
  validateEvents(stage, [[stage.viewport], stage.row_measurements, stage.transition_events, stage.semantic_samples, stage.callback_events, [stage.motion]]);
  validateSettleContract(stage, "month-settle");
  const semantic = stage.semantic_samples.at(-1);
  const rowCount = stage.row_measurements.length;
  const expectedRows = stageId === "four-row-month" ? 4 : stageId === "five-row-month" ? 5 : stageId === "six-row-month" ? 6 : semantic.week_count;
  const assertions = [
    assertion("row-count", rowCount === expectedRows && semantic.week_count === expectedRows, { rowCount, semantic: semantic.week_count }),
    assertion("semantic-month-date-title", monthIdFromTitle(semantic.title) === semantic.current_month_id && semantic.selected_civil_date.startsWith(`${semantic.current_month_id}-`), semantic),
  ];
  if (stageId === "leap-february") assertions.push(assertion("leap-date", semantic.selected_civil_date.endsWith("-02-29"), semantic.selected_civil_date));
  if (stageId === "month-year-boundary") assertions.push(assertion("year-boundary", stage.transition_events.some(({ before, after }) => before.current_month_id.slice(0, 4) !== after.current_month_id.slice(0, 4)), stage.transition_events));
  return assertions;
}

function validateLifecycle(stage, stageId) {
  const keys = ["schema_version", "id", "group", "started_at_monotonic_ms", "completed_at_monotonic_ms", "viewport_events", "lifecycle_events", "transition_events", "semantic_samples", "callback_events", "motion_events"];
  baseStage(stage, stageId, "lifecycle", keys);
  if (![stage.viewport_events, stage.lifecycle_events, stage.transition_events, stage.semantic_samples, stage.callback_events, stage.motion_events].every(Array.isArray)) fail("lifecycle_invalid");
  stage.viewport_events.forEach(viewportEvent); stage.lifecycle_events.forEach(lifecycleEvent); stage.transition_events.forEach(transitionEvent); stage.semantic_samples.forEach(semanticEvent); stage.callback_events.forEach(callbackEvent); stage.motion_events.forEach(motionEvent);
  validateEvents(stage, [stage.viewport_events, stage.lifecycle_events, stage.transition_events, stage.semantic_samples, stage.callback_events, stage.motion_events]);
  const values = stage.lifecycle_events.map(({ value }) => value);
  const invalidation = stage.transition_events.find(({ trigger }) => trigger === "invalidate");
  const interrupted = stage.lifecycle_events.find(({ event, value }) => event === "app-state" && value !== "active");
  const resumed = stage.lifecycle_events.find((entry) => entry.event === "app-state" && entry.value === "active"
    && (interrupted === undefined || entry.sequence > interrupted.sequence));
  const passed = stageId === "rotation-during-transition"
    ? values.includes("portrait") && values.includes("landscape") && new Set(stage.viewport_events.map(({ orientation }) => orientation)).size >= 2
      && invalidation !== undefined && invalidation.sequence > stage.lifecycle_events.at(-1).sequence && invalidation.sequence > stage.viewport_events.at(-1).sequence
    : interrupted !== undefined && resumed !== undefined && invalidation !== undefined
      && interrupted.sequence < invalidation.sequence && invalidation.sequence < resumed.sequence;
  return [assertion(stageId === "rotation-during-transition" ? "orientation-callbacks" : "app-state-callbacks", passed, values), assertion("transition-invalidated", stage.transition_events.some(({ trigger }) => trigger === "invalidate"), stage.transition_events.map(({ trigger }) => trigger))];
}

function validateReducedMotion(stage, stageId) {
  const keys = ["schema_version", "id", "group", "started_at_monotonic_ms", "completed_at_monotonic_ms", "viewport", "row_measurements", "rendered_overlay_samples", "transition_events", "semantic_samples", "callback_events", "focus_events", "motion_events"];
  baseStage(stage, stageId, "reduced-motion", keys);
  viewportEvent(stage.viewport);
  if (![stage.row_measurements, stage.rendered_overlay_samples, stage.transition_events, stage.semantic_samples, stage.callback_events, stage.focus_events, stage.motion_events].every(Array.isArray)) fail("reduced_motion_invalid");
  stage.row_measurements.forEach(rowEvent); stage.rendered_overlay_samples.forEach((event) => renderedOverlayEvent(event, stage.viewport.height_dp)); stage.transition_events.forEach(transitionEvent); stage.semantic_samples.forEach(semanticEvent); stage.callback_events.forEach(callbackEvent); stage.focus_events.forEach(focusEvent); stage.motion_events.forEach(motionEvent);
  validateEvents(stage, [[stage.viewport], stage.row_measurements, stage.rendered_overlay_samples, stage.transition_events, stage.semantic_samples, stage.callback_events, stage.focus_events, stage.motion_events]);
  validateSettleContract(stage, "week-settle", { includeReducedImmediate: true });
  const final = stage.transition_events.at(-1)?.after;
  const motionModes = stage.motion_events.map(({ reduced_motion }) => reduced_motion);
  const normal = stage.rendered_overlay_samples.find(({ reduced_motion, phase, progress }) => !reduced_motion && phase === "expand" && progress === 1);
  const reduced = stage.rendered_overlay_samples.find(({ reduced_motion, phase, progress }) => reduced_motion && phase === "expand" && progress === 1);
  const triggers = stage.transition_events.map(({ trigger }) => trigger);
  const firstSemantic = stage.semantic_samples[0]; const lastSemantic = stage.semantic_samples.at(-1);
  return [
    assertion("runtime-motion-toggle", motionModes.includes(false) && motionModes.includes(true) && motionModes.indexOf(false) < motionModes.lastIndexOf(true), motionModes),
    assertion("normal-vs-reduced-destination", final?.phase === "idle" && final?.mode === "focused"
      && firstSemantic?.selected_civil_date === lastSemantic?.selected_civil_date
      && triggers.filter((trigger) => trigger === "expand").length >= 2 && triggers.includes("collapse"), { final, firstSemantic, lastSemantic, triggers }),
    assertion("normal-reduced-callback-comparison", stage.callback_events.filter(({ callback }) => callback === "week-settle").length >= 2
      && stage.callback_events.some(({ epoch }) => epoch === stage.transition_events.find(({ trigger, after }) => trigger === "expand" && !after.reduced_motion)?.after.epoch)
      && stage.callback_events.some(({ epoch }) => epoch === stage.transition_events.findLast(({ trigger, after }) => trigger === "expand" && after.reduced_motion)?.after.epoch), stage.callback_events),
    assertion("identical-rendered-destination", normal !== undefined && reduced !== undefined
      && Math.abs(normal.selected_y_dp - reduced.selected_y_dp) <= 2 && Math.abs(normal.following_y_dp - reduced.following_y_dp) <= 2, { normal, reduced }),
    assertion("focus-callback", stage.focus_events.length > 0, stage.focus_events),
  ];
}

function validateBaseline(stage, stageId) {
  const keys = ["schema_version", "id", "group", "started_at_monotonic_ms", "completed_at_monotonic_ms", "viewport", "row_measurements", "baseline_measurements", "semantic_samples", "motion"];
  baseStage(stage, stageId, "baseline", keys);
  viewportEvent(stage.viewport); motionEvent(stage.motion);
  if (![stage.row_measurements, stage.baseline_measurements, stage.semantic_samples].every(Array.isArray)) fail("baseline_invalid");
  stage.row_measurements.forEach(rowEvent); stage.baseline_measurements.forEach(baselineEvent); stage.semantic_samples.forEach(semanticEvent);
  validateEvents(stage, [[stage.viewport], stage.row_measurements, stage.baseline_measurements, stage.semantic_samples, [stage.motion]]);
  const measurement = stage.baseline_measurements[0]?.measurement;
  const semantic = stage.semantic_samples.at(-1);
  if (stage.baseline_measurements.length !== 1 || semantic === undefined
    || stage.row_measurements.length !== semantic.week_count
    || new Set(stage.row_measurements.map(({ y_dp }) => y_dp)).size !== stage.row_measurements.length) fail("baseline_invalid");
  if (stageId === "dev-01-padding") {
    const leftInset = measurement.content_left_dp;
    const rightInset = measurement.screen_width_dp - measurement.content_right_dp;
    return [assertion("measured-content-padding", measurement.kind === "content-bounds" && measurement.screen_width_dp === 360
      && leftInset >= 6 && leftInset <= 18 && rightInset >= 6 && rightInset <= 18
      && Math.abs(measurement.content_width_dp - (measurement.content_right_dp - measurement.content_left_dp)) <= 0.5
      && Math.abs(stage.viewport.width_dp - measurement.content_width_dp) <= 2, { measurement, viewport_width_dp: stage.viewport.width_dp })];
  }
  return [assertion("light-screenshot-requested", measurement.kind === "screenshot-request" && measurement.color_scheme === "light", measurement)];
}

export function validateV12CalendarTerminalMarker(marker, expected) {
  exact(marker, ["schema_version", "nonce", "kind", "flow_sha256", "flow_revision", "stage"], "marker_invalid");
  if (marker.schema_version !== 1 || marker.kind !== "calendar" || marker.nonce !== expected.nonce || !NONCE.test(marker.nonce ?? "")
    || marker.flow_sha256 !== expected.flowSha256 || !HASH.test(marker.flow_sha256 ?? "")
    || marker.flow_revision !== V12_CALENDAR_FLOW_REVISION || marker.stage?.id !== expected.stageId) fail("marker_invalid");
  const group = expectedGroup(expected.stageId);
  const assertions = POINTER_GROUPS.has(group) ? validatePointer(marker.stage, expected.stageId, group)
    : group === "row-geometry" ? validateRows(marker.stage, expected.stageId)
      : group === "month-geometry" ? validateMonthGeometry(marker.stage, expected.stageId)
        : group === "lifecycle" ? validateLifecycle(marker.stage, expected.stageId)
          : group === "reduced-motion" ? validateReducedMotion(marker.stage, expected.stageId)
            : validateBaseline(marker.stage, expected.stageId);
  return Object.freeze({ observation: marker.stage, assertionResults: Object.freeze(assertions) });
}

function chunkRows(logs) {
  if (typeof logs !== "string" || logs.length > 8 * 1024 * 1024) fail("logs_invalid");
  const rows = [];
  for (const line of logs.split(/\r?\n/u)) {
    const index = line.indexOf(V12_CALENDAR_CHUNK_MARKER);
    if (index < 0) continue;
    try { rows.push(JSON.parse(line.slice(index + V12_CALENDAR_CHUNK_MARKER.length))); }
    catch { fail("chunk_json_invalid"); }
  }
  return rows;
}

export function encodeV12CalendarTerminalMarkerChunks(marker, chunkSize = CALENDAR_CHUNK_SIZE) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 128 || chunkSize > CALENDAR_CHUNK_SIZE) fail("chunk_size_invalid");
  const payload = JSON.stringify(marker);
  const total = Math.ceil(payload.length / chunkSize);
  if (total < 1 || total > MAX_CALENDAR_CHUNKS || !NONCE.test(marker?.nonce ?? "")) fail("chunk_count_invalid");
  const payloadSha256 = hashV12CalendarObservationBody(payload);
  return Object.freeze(Array.from({ length: total }, (_, index) => `${V12_CALENDAR_CHUNK_MARKER}${JSON.stringify({
    schema_version: 1,
    nonce: marker.nonce,
    sequence: index + 1,
    total,
    payload_sha256: payloadSha256,
    payload: payload.slice(index * chunkSize, (index + 1) * chunkSize),
  })}`));
}

function terminalFromChunks(rows, nonce) {
  const selected = rows.filter((row) => row?.nonce === nonce);
  if (selected.length === 0) fail("marker_missing");
  for (const row of selected) {
    exact(row, ["schema_version", "nonce", "sequence", "total", "payload_sha256", "payload"], "chunk_invalid");
    if (row.schema_version !== 1 || !NONCE.test(row.nonce ?? "") || !HASH.test(row.payload_sha256 ?? "")
      || !Number.isSafeInteger(row.sequence) || !Number.isSafeInteger(row.total)
      || row.sequence < 1 || row.total < 1 || row.sequence > row.total || row.total > MAX_CALENDAR_CHUNKS
      || typeof row.payload !== "string" || row.payload.length === 0 || row.payload.length > CALENDAR_CHUNK_SIZE) fail("chunk_invalid");
  }
  const total = selected[0].total;
  if (selected.length !== total || selected.some((row, index) => row.sequence !== index + 1
    || row.total !== total || row.payload_sha256 !== selected[0].payload_sha256)) fail("chunk_sequence_invalid");
  const payload = selected.map(({ payload: chunk }) => chunk).join("");
  if (hashV12CalendarObservationBody(payload) !== selected[0].payload_sha256) fail("chunk_hash_invalid");
  try { return JSON.parse(payload); } catch { fail("marker_json_invalid"); }
}

export function selectV12CalendarTerminalMarker({ beforeLogs, afterLogs, nonce, flowSha256, stageId }) {
  if (chunkRows(beforeLogs).some((row) => row?.nonce === nonce)) fail("pre_stage_marker");
  const marker = terminalFromChunks(chunkRows(afterLogs), nonce);
  validateV12CalendarTerminalMarker(marker, { nonce, flowSha256, stageId });
  return marker;
}

export function deriveV12CalendarStageResult({ marker, expected, driver, captureMeasurement = null, screenshotSha256, traceSha256 }) {
  if (!Number.isSafeInteger(expected.order) || expected.order < 0 || V12_CALENDAR_STAGE_IDS[expected.order] !== expected.stageId
    || !HASH.test(screenshotSha256 ?? "") || !HASH.test(traceSha256 ?? "")) fail("result_identity_invalid");
  validateDriverReceipt(driver, expected.stageId);
  const validated = validateV12CalendarTerminalMarker(marker, expected);
  const assertionResults = Object.freeze([...(POINTER_GROUPS.has(expectedGroup(expected.stageId))
    ? validatePointer(marker.stage, expected.stageId, expectedGroup(expected.stageId), driver)
    : validated.assertionResults), ...captureAssertions(expected.stageId, captureMeasurement)]);
  const status = assertionResults.every(({ passed }) => passed) ? "PASS" : "FAIL";
  if (!STATES.has(status)) fail("result_status_invalid");
  return Object.freeze({
    id: expected.stageId,
    order: expected.order,
    status,
    observation: validated.observation,
    driver,
    capture_measurement: captureMeasurement,
    assertion_results: assertionResults,
    terminal_marker_sha256: hashV12CalendarObservationBody(marker),
    screenshot_sha256: screenshotSha256,
    trace_sha256: traceSha256,
  });
}

export function validateV12CalendarStageResult(value, stageId, order) {
  exact(value, ["id", "order", "status", "observation", "driver", "capture_measurement", "assertion_results", "terminal_marker_sha256", "screenshot_sha256", "trace_sha256"], "stage_result_invalid");
  if (value.id !== stageId || value.order !== order || !STATES.has(value.status)
    || ![value.terminal_marker_sha256, value.screenshot_sha256, value.trace_sha256].every((entry) => HASH.test(entry ?? ""))
    || hashV12CalendarObservationBody(value.observation) !== value.trace_sha256) fail("stage_result_invalid");
  const group = expectedGroup(stageId);
  validateDriverReceipt(value.driver, stageId);
  const assertions = [...(POINTER_GROUPS.has(group) ? validatePointer(value.observation, stageId, group, value.driver)
    : group === "row-geometry" ? validateRows(value.observation, stageId)
      : group === "month-geometry" ? validateMonthGeometry(value.observation, stageId)
        : group === "lifecycle" ? validateLifecycle(value.observation, stageId)
          : group === "reduced-motion" ? validateReducedMotion(value.observation, stageId)
            : validateBaseline(value.observation, stageId)), ...captureAssertions(stageId, value.capture_measurement)];
  const assertionStatus = assertions.every(({ passed }) => passed) ? "PASS" : "FAIL";
  if (JSON.stringify(value.assertion_results) !== JSON.stringify(assertions)) fail("stage_assertions_invalid");
  if (assertionStatus === "FAIL" && value.status !== "FAIL") fail("stage_status_invalid");
  return true;
}

export function validateV12CalendarStageCoverage(stages) {
  if (!Array.isArray(stages) || stages.length !== V12_CALENDAR_STAGE_IDS.length) fail("stage_coverage_invalid");
  const observedGroups = new Set();
  stages.forEach((stage, order) => {
    const id = V12_CALENDAR_STAGE_IDS[order];
    const group = expectedGroup(id);
    const registryGroup = Object.entries(V12_CALENDAR_STAGE_GROUPS).find(([, ids]) => ids.includes(id))?.[0];
    const observedGroup = stage?.group ?? stage?.observation?.group;
    if (stage?.id !== id || stage.order !== order || ![group, registryGroup].includes(observedGroup)) fail("stage_coverage_invalid");
    observedGroups.add(registryGroup);
  });
  if (Object.keys(V12_CALENDAR_STAGE_GROUPS).some((group) => !observedGroups.has(group))) fail("stage_coverage_invalid");
  return true;
}
