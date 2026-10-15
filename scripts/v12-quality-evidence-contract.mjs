import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const V12_QUALITY_ROOTS = Object.freeze(["workout", "calendar", "library", "progress"]);
export const V12_QUALITY_MOTION_MODES = Object.freeze(["normal", "reduced"]);
export const V12_QUALITY_INPUTS = Object.freeze(["touch", "software-keyboard", "hardware-keyboard", "dpad"]);
export const V12_QUALITY_INPUT_EVENTS = Object.freeze({ touch: "touch-tap", "software-keyboard": "ime-text", "hardware-keyboard": "key-enter", dpad: "key-dpad-center" });
export const V12_QUALITY_SCENARIOS = Object.freeze({
  workout: Object.freeze({ fixture_id: "phase20-workout-active-r1", state_id: "workout-active-session" }),
  calendar: Object.freeze({ fixture_id: "phase20-calendar-month-r1", state_id: "calendar-month-agenda" }),
  library: Object.freeze({ fixture_id: "phase20-library-exercises-r1", state_id: "library-exercise-catalog" }),
  progress: Object.freeze({ fixture_id: "phase20-progress-overview-r1", state_id: "progress-overall-current" }),
});

const HASH = /^[a-f0-9]{64}$/u;
const DATABASE = /^gym-tracker-phase20-quality-[a-f0-9]{48}-(workout|calendar|library|progress)\.db$/u;
const PERFORMANCE_SERIES = Object.freeze({
  warm_launch_to_interactive_ms: [20, "process-resume-to-interactive"],
  cold_launch_to_interactive_ms: [20, "process-start-to-interactive"],
  committed_set_to_visible_dock_ms: [100, "authoritative-commit-to-visible-dock"],
  ordinary_js_task_ms: [100, "js-task-start-to-end"],
  search_after_debounce_ms: [100, "debounce-end-to-visible-results"],
  calendar_month_and_selection_ms: [100, "calendar-input-to-visible-selection"],
  progress_useful_content_ms: [20, "progress-start-to-useful-content"],
  progress_review_open_ms: [100, "progress-review-start-to-visible"],
  progress_targeted_rebuild_ms: [20, "progress-rebuild-start-to-useful-content"],
  phase12_dirty_trigger_ms: [100, "sqlite-dirty-trigger-start-to-end"],
  phase12_writer_occupancy_ms: [20, "sqlite-writer-acquire-to-release"],
  phase12_merge_preflight_ms: [10, "merge-preflight-start-to-end"],
  phase12_merge_materialization_ms: [5, "merge-materialization-start-to-end"],
});
export const V12_PERFORMANCE_SAMPLE_KEYS = Object.freeze([
  ...Object.keys(PERFORMANCE_SERIES), "root_switch_to_useful_ms", "input_response_ms",
  "calendar_frame_sequences", "phase12_merge_peak_growth_bytes", "phase12_merge_fixture",
  "garmin_sync_normalization", "native_receipts",
]);

export function canonicalV12QualityJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalV12QualityJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalV12QualityJson(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function sha256V12Quality(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalV12QualityJson(value)).digest("hex");
}

function exact(value, keys, fail, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail(code);
}
function digest(value, fail, code) { if (typeof value !== "string" || !HASH.test(value)) fail(code); }
function finite(value, fail, code, minimum = 0) { if (!Number.isFinite(value) || value < minimum) fail(code); }
function positiveInteger(value, fail, code) { if (!Number.isSafeInteger(value) || value < 1) fail(code); }
function samples(values, minimum, fail, code) {
  if (!Array.isArray(values) || values.length < minimum || values.length > 10_000) fail(code);
  values.forEach((value) => finite(value, fail, code));
}
function identity(actual, expected, fail, code) {
  const keys = ["base_head", "source_tree_sha256", "apk_sha256", "installed_apk_sha256", "package", "device_identity_sha256", "fixture_sha256"];
  exact(actual, keys, fail, code);
  if (!isDeepStrictEqual(actual, expected)) fail(code);
}
function sourceReceipts(receipts, expected, fail, code) {
  const keys = ["source_tree_sha256", "fixture_sha256", "source_before_sha256", "source_after_sha256", "state_sha256"];
  exact(receipts, keys, fail, code); keys.forEach((key) => digest(receipts[key], fail, code));
  if (receipts.source_tree_sha256 !== expected.source_tree_sha256 || receipts.fixture_sha256 !== expected.fixture_sha256) fail(code);
}

export function validateV12AccessibilityProducer(observations, expectedIdentity, fail) {
  if (!Array.isArray(observations) || observations.length !== V12_QUALITY_ROOTS.length * V12_QUALITY_MOTION_MODES.length) fail("accessibility_coverage_invalid");
  const coverage = new Set(); const configurationIds = new Set(); const configurationHashes = new Set(); const databases = new Map(); const rootStates = new Set();
  const byRoot = new Map();
  for (const observation of observations) {
    exact(observation, ["root", "motion_mode", "operation", "fixture_id", "state_id", "native_execution", "configuration", "targets", "interactions", "modal", "motion", "source_receipts", "native_receipts", "restored_settings"], fail, "accessibility_schema_invalid");
    const scenario = V12_QUALITY_SCENARIOS[observation.root];
    const operation = `accessibility-${observation.root}-${observation.motion_mode}`;
    if (!scenario || !V12_QUALITY_MOTION_MODES.includes(observation.motion_mode) || observation.operation !== operation
      || observation.fixture_id !== scenario.fixture_id || observation.state_id !== scenario.state_id
      || observation.native_execution !== "EXECUTED" || observation.restored_settings !== true) fail("accessibility_identity_invalid");
    const coverageKey = `${observation.root}:${observation.motion_mode}`;
    if (coverage.has(coverageKey)) fail("accessibility_coverage_invalid"); coverage.add(coverageKey);
    const configuration = observation.configuration;
    exact(configuration, ["id", "root", "motion_mode", "operation", "fixture_id", "state_id", "font_scale", "density", "content_bounds", "insets", "ime_bounds"], fail, "accessibility_configuration_invalid");
    if (configuration.id !== `quality-${observation.root}-${observation.motion_mode}-f200`
      || configuration.root !== observation.root || configuration.motion_mode !== observation.motion_mode
      || configuration.operation !== operation || configuration.fixture_id !== scenario.fixture_id || configuration.state_id !== scenario.state_id
      || configuration.font_scale !== 2) fail("accessibility_configuration_invalid");
    finite(configuration.density, fail, "accessibility_configuration_invalid", 0.1);
    exact(configuration.content_bounds, ["width", "height"], fail, "accessibility_configuration_invalid");
    exact(configuration.insets, ["top", "bottom"], fail, "accessibility_configuration_invalid");
    exact(configuration.ime_bounds, ["top", "bottom"], fail, "accessibility_configuration_invalid");
    [configuration.content_bounds.width, configuration.content_bounds.height].forEach((value) => finite(value, fail, "accessibility_configuration_invalid", 48));
    [configuration.insets.top, configuration.insets.bottom, configuration.ime_bounds.top, configuration.ime_bounds.bottom].forEach((value) => finite(value, fail, "accessibility_configuration_invalid"));
    if (configuration.ime_bounds.top >= configuration.ime_bounds.bottom || configuration.ime_bounds.bottom > configuration.content_bounds.height) fail("accessibility_configuration_invalid");
    if (configurationIds.has(configuration.id)) fail("accessibility_configuration_invalid"); configurationIds.add(configuration.id);
    const configurationHash = sha256V12Quality(configuration);
    if (configurationHashes.has(configurationHash)) fail("accessibility_configuration_invalid"); configurationHashes.add(configurationHash);
    if (!Array.isArray(observation.targets) || observation.targets.length === 0 || observation.targets.length > 100) fail("accessibility_targets_invalid");
    const targetIds = new Set();
    for (const target of observation.targets) {
      exact(target, ["id", "name", "role", "state", "non_color_cue", "overlap", "bounds_dp"], fail, "accessibility_targets_invalid");
      exact(target.bounds_dp, ["left", "top", "width", "height"], fail, "accessibility_targets_invalid");
      if ([target.id, target.name, target.role, target.state].some((value) => typeof value !== "string" || value.length === 0)
        || targetIds.has(target.id) || target.non_color_cue !== true || target.overlap !== false) fail("accessibility_targets_invalid");
      targetIds.add(target.id); [target.bounds_dp.left, target.bounds_dp.top].forEach((value) => finite(value, fail, "accessibility_targets_invalid"));
      [target.bounds_dp.width, target.bounds_dp.height].forEach((value) => finite(value, fail, "accessibility_targets_invalid", 48));
      if (target.bounds_dp.left + target.bounds_dp.width > configuration.content_bounds.width || target.bounds_dp.top + target.bounds_dp.height > configuration.content_bounds.height) fail("accessibility_targets_invalid");
      for (const other of observation.targets) {
        if (other === target || other.bounds_dp === undefined) continue;
        if (target.bounds_dp.left < other.bounds_dp.left + other.bounds_dp.width && target.bounds_dp.left + target.bounds_dp.width > other.bounds_dp.left
          && target.bounds_dp.top < other.bounds_dp.top + other.bounds_dp.height && target.bounds_dp.top + target.bounds_dp.height > other.bounds_dp.top) fail("accessibility_targets_invalid");
      }
    }
    if (!Array.isArray(observation.interactions) || observation.interactions.length !== V12_QUALITY_INPUTS.length) fail("accessibility_interactions_invalid");
    const eventReceipts = new Set(); const callbackReceipts = new Set();
    observation.interactions.forEach((entry, index) => {
      exact(entry, ["input", "event", "focus_before", "action", "focus_after", "command_count", "callback_count", "callback_receipt_sha256", "event_receipt_sha256", "image_hash"], fail, "accessibility_interactions_invalid");
      const expectedInput = V12_QUALITY_INPUTS[index];
      if (entry.input !== expectedInput || entry.event !== V12_QUALITY_INPUT_EVENTS[expectedInput] || entry.action !== "activate"
        || typeof entry.focus_before !== "string" || entry.focus_before.length === 0 || typeof entry.focus_after !== "string" || entry.focus_after.length === 0
        || entry.focus_before === entry.focus_after || entry.command_count !== entry.callback_count) fail("accessibility_interactions_invalid");
      positiveInteger(entry.command_count, fail, "accessibility_interactions_invalid");
      [entry.callback_receipt_sha256, entry.event_receipt_sha256, entry.image_hash].forEach((value) => digest(value, fail, "accessibility_interactions_invalid"));
      if (eventReceipts.has(entry.event_receipt_sha256) || callbackReceipts.has(entry.callback_receipt_sha256)) fail("accessibility_interactions_invalid");
      eventReceipts.add(entry.event_receipt_sha256); callbackReceipts.add(entry.callback_receipt_sha256);
    });
    const modal = observation.modal;
    exact(modal, ["focus_ring_dp", "focus_offset_dp", "background_isolated", "back", "escape", "restores_invoker"], fail, "accessibility_modal_invalid");
    if (modal.focus_ring_dp !== 3 || modal.focus_offset_dp !== 3 || modal.background_isolated !== true || modal.restores_invoker !== true) fail("accessibility_modal_invalid");
    for (const [name, event] of [["back", "key-back"], ["escape", "key-escape"]]) {
      const value = modal[name]; exact(value, ["event", "focus_before", "focus_after", "callback_count", "callback_receipt_sha256", "event_receipt_sha256"], fail, "accessibility_modal_invalid");
      if (value.event !== event || typeof value.focus_before !== "string" || typeof value.focus_after !== "string" || value.focus_before === value.focus_after) fail("accessibility_modal_invalid");
      positiveInteger(value.callback_count, fail, "accessibility_modal_invalid");
      digest(value.callback_receipt_sha256, fail, "accessibility_modal_invalid"); digest(value.event_receipt_sha256, fail, "accessibility_modal_invalid");
    }
    if (modal.back.event_receipt_sha256 === modal.escape.event_receipt_sha256 || modal.back.callback_receipt_sha256 === modal.escape.callback_receipt_sha256) fail("accessibility_modal_invalid");
    const motion = observation.motion;
    exact(motion, ["mode", "destination", "callback_count", "frame_callback_count", "source_facts_sha256", "behavior_receipt_sha256"], fail, "accessibility_motion_invalid");
    if (motion.mode !== observation.motion_mode || motion.destination !== scenario.state_id) fail("accessibility_motion_invalid");
    positiveInteger(motion.callback_count, fail, "accessibility_motion_invalid"); positiveInteger(motion.frame_callback_count, fail, "accessibility_motion_invalid");
    digest(motion.source_facts_sha256, fail, "accessibility_motion_invalid"); digest(motion.behavior_receipt_sha256, fail, "accessibility_motion_invalid");
    sourceReceipts(observation.source_receipts, expectedIdentity, fail, "accessibility_source_receipts_invalid");
    const native = observation.native_receipts;
    exact(native, ["operation", "sequence", "database_name", "configuration_sha256", "command_receipt_sha256", "readiness_sha256", "event_receipts_sha256", "callback_receipts_sha256", "modal_receipt_sha256", "motion_receipt_sha256"], fail, "accessibility_native_receipts_invalid");
    if (native.operation !== operation || native.configuration_sha256 !== configurationHash || native.readiness_sha256 !== observation.source_receipts.state_sha256
      || native.event_receipts_sha256 !== sha256V12Quality(observation.interactions.map(({ event_receipt_sha256 }) => event_receipt_sha256))
      || native.callback_receipts_sha256 !== sha256V12Quality(observation.interactions.map(({ callback_receipt_sha256 }) => callback_receipt_sha256))
      || native.modal_receipt_sha256 !== sha256V12Quality(modal) || native.motion_receipt_sha256 !== sha256V12Quality(motion)) fail("accessibility_native_receipts_invalid");
    positiveInteger(native.sequence, fail, "accessibility_native_receipts_invalid");
    [native.configuration_sha256, native.command_receipt_sha256, native.readiness_sha256, native.event_receipts_sha256, native.callback_receipts_sha256, native.modal_receipt_sha256, native.motion_receipt_sha256].forEach((value) => digest(value, fail, "accessibility_native_receipts_invalid"));
    const databaseMatch = DATABASE.exec(native.database_name);
    if (databaseMatch?.[1] !== observation.root) fail("accessibility_native_receipts_invalid");
    if (databases.has(observation.root) && databases.get(observation.root) !== native.database_name) fail("accessibility_native_receipts_invalid");
    databases.set(observation.root, native.database_name);
    const pair = byRoot.get(observation.root) ?? []; pair.push(observation); byRoot.set(observation.root, pair);
    rootStates.add(observation.source_receipts.state_sha256);
  }
  if (coverage.size !== 8 || configurationIds.size !== 8 || configurationHashes.size !== 8 || databases.size !== 4 || rootStates.size !== 8) fail("accessibility_coverage_invalid");
  for (const root of V12_QUALITY_ROOTS) {
    const pair = byRoot.get(root);
    if (pair?.length !== 2 || pair[0].state_id !== pair[1].state_id
      || pair[0].motion.destination !== pair[1].motion.destination || pair[0].motion.source_facts_sha256 !== pair[1].motion.source_facts_sha256) fail("accessibility_motion_invalid");
  }
  return true;
}

function timing(values, receipt, minimum, endpoint, expectedIdentity, fail) {
  samples(values, minimum, fail, "performance_samples_invalid");
  exact(receipt, ["clock", "endpoint", "source_tree_sha256", "spans"], fail, "performance_timing_invalid");
  if (!['android-elapsed-realtime', 'js-performance-now'].includes(receipt.clock) || receipt.endpoint !== endpoint || receipt.source_tree_sha256 !== expectedIdentity.source_tree_sha256
    || !Array.isArray(receipt.spans) || receipt.spans.length !== values.length) fail("performance_timing_invalid");
  const spans = new Set();
  receipt.spans.forEach((span, index) => {
    exact(span, ["start_ms", "end_ms"], fail, "performance_timing_invalid"); finite(span.start_ms, fail, "performance_timing_invalid"); finite(span.end_ms, fail, "performance_timing_invalid", span.start_ms);
    if (Math.abs(span.end_ms - span.start_ms - values[index]) > 0.000001) fail("performance_timing_invalid");
    spans.add(`${span.start_ms}:${span.end_ms}`);
  });
  if (spans.size !== values.length) fail("performance_timing_invalid");
}

export function validateV12PerformanceProducer(performance, expectedIdentity, budgets, workload, fail) {
  exact(performance, ["schema_version", "suite", "producer", "native_execution", "sample_origin", "workload", "identity", "budgets", "samples"], fail, "performance_schema_invalid");
  if (performance.schema_version !== 1 || performance.suite !== "v1.2-performance" || performance.producer !== "v12-release-performance-collector/v1"
    || performance.native_execution !== "EXECUTED" || performance.sample_origin !== "release-native-source-backed"
    || !isDeepStrictEqual(performance.workload, workload) || !isDeepStrictEqual(performance.budgets, budgets)) fail("performance_schema_invalid");
  identity(performance.identity, expectedIdentity, fail, "performance_identity_invalid");
  const raw = performance.samples; exact(raw, V12_PERFORMANCE_SAMPLE_KEYS, fail, "performance_schema_invalid");
  const native = raw.native_receipts;
  exact(native, ["build_variant", "debugger_attached", "source_receipts", "timings", "cold_launch_cycles", "frame_sequences_sha256", "merge_peak_growth_sha256", "ordinary_js_receipt", "garmin_receipt"], fail, "performance_native_receipts_invalid");
  if (native.build_variant !== "release" || native.debugger_attached !== false) fail("performance_native_receipts_invalid");
  sourceReceipts(native.source_receipts, expectedIdentity, fail, "performance_source_receipts_invalid");
  exact(native.timings, [...Object.keys(PERFORMANCE_SERIES), "root_switch_to_useful_ms", "input_response_ms"], fail, "performance_timing_invalid");
  for (const [key, [minimum, endpoint]] of Object.entries(PERFORMANCE_SERIES)) timing(raw[key], native.timings[key], minimum, endpoint, expectedIdentity, fail);
  for (const [key, paths, endpoint] of [["root_switch_to_useful_ms", V12_QUALITY_ROOTS, "root-input-to-useful-content"], ["input_response_ms", ["numeric_edit", "rest_control"], "input-to-visible-response"]]) {
    exact(raw[key], paths, fail, "performance_paths_invalid"); exact(native.timings[key], paths, fail, "performance_paths_invalid");
    for (const path of paths) timing(raw[key][path], native.timings[key][path], 100, endpoint, expectedIdentity, fail);
  }
  if (!Array.isArray(native.cold_launch_cycles) || native.cold_launch_cycles.length !== raw.cold_launch_to_interactive_ms.length) fail("performance_cold_launch_invalid");
  native.cold_launch_cycles.forEach((cycle, index) => {
    exact(cycle, ["sequence", "operation", "previous_process_id", "process_id", "previous_process_start_ticks", "process_start_ticks", "process_start_ms", "ready_ms", "database_name", "readiness_sha256", "source_receipt_sha256"], fail, "performance_cold_launch_invalid");
    if (cycle.sequence !== index + 1 || cycle.operation !== "launch-cold" || cycle.previous_process_id === cycle.process_id
      || cycle.previous_process_start_ticks === cycle.process_start_ticks || cycle.ready_ms <= cycle.process_start_ms
      || Math.abs(cycle.ready_ms - cycle.process_start_ms - raw.cold_launch_to_interactive_ms[index]) > 0.000001
      || !DATABASE.test(cycle.database_name)) fail("performance_cold_launch_invalid");
    [cycle.previous_process_id, cycle.process_id, cycle.previous_process_start_ticks, cycle.process_start_ticks].forEach((value) => positiveInteger(value, fail, "performance_cold_launch_invalid"));
    digest(cycle.readiness_sha256, fail, "performance_cold_launch_invalid"); digest(cycle.source_receipt_sha256, fail, "performance_cold_launch_invalid");
  });
  if (!Array.isArray(raw.calendar_frame_sequences) || raw.calendar_frame_sequences.length < 100) fail("performance_frame_sequences_invalid");
  raw.calendar_frame_sequences.forEach((frame, index) => {
    exact(frame, ["sequence", "capture_phase", "start_ms", "end_ms", "ready_ms", "frame_work_ms", "missed_frames", "refresh_rate_hz", "refresh_rate_source", "profiler_overhead_ms"], fail, "performance_frame_sequences_invalid");
    if (frame.sequence !== index + 1 || frame.capture_phase !== "calendar-gesture-before-ready" || frame.refresh_rate_source !== "android-display-mode"
      || frame.end_ms > frame.ready_ms || frame.start_ms >= frame.end_ms) fail("performance_frame_sequences_invalid");
    samples(frame.frame_work_ms, 1, fail, "performance_frame_sequences_invalid"); finite(frame.refresh_rate_hz, fail, "performance_frame_sequences_invalid", 1); finite(frame.profiler_overhead_ms, fail, "performance_frame_sequences_invalid");
    if (!Number.isSafeInteger(frame.missed_frames) || frame.missed_frames < 0) fail("performance_frame_sequences_invalid");
  });
  if (native.frame_sequences_sha256 !== sha256V12Quality(raw.calendar_frame_sequences) || native.merge_peak_growth_sha256 !== sha256V12Quality(raw.phase12_merge_peak_growth_bytes)) fail("performance_native_receipts_invalid");
  exact(native.ordinary_js_receipt, ["producer", "database_name", "work_units", "receipt_sha256"], fail, "performance_ordinary_js_invalid");
  if (native.ordinary_js_receipt.producer !== "phase20-ordinary-js-source-work/v1" || !DATABASE.test(native.ordinary_js_receipt.database_name)) fail("performance_ordinary_js_invalid");
  positiveInteger(native.ordinary_js_receipt.work_units, fail, "performance_ordinary_js_invalid"); if (native.ordinary_js_receipt.work_units < 100) fail("performance_ordinary_js_invalid"); digest(native.ordinary_js_receipt.receipt_sha256, fail, "performance_ordinary_js_invalid");
  const garmin = raw.garmin_sync_normalization;
  exact(garmin, ["state", "limit_source", "transport", "fixture_sha256", "payload_sha256", "output_sha256", "runtime_receipt_sha256", "normalization_ms", "peak_rss_bytes", "baseline"], fail, "performance_garmin_invalid");
  if (garmin.state !== "REVIEW_REQUIRED" || garmin.limit_source !== "phase18-pinned-artifact/v1" || garmin.transport !== "chaquopy-python-garminconnect-0.3.17") fail("performance_garmin_invalid");
  [garmin.fixture_sha256, garmin.payload_sha256, garmin.output_sha256, garmin.runtime_receipt_sha256].forEach((value) => digest(value, fail, "performance_garmin_invalid"));
  samples(garmin.normalization_ms, 5, fail, "performance_garmin_invalid"); samples(garmin.peak_rss_bytes, 5, fail, "performance_garmin_invalid");
  exact(garmin.baseline, ["source", "phase18_source_tree_sha256", "artifact_sha256", "fixture_sha256", "normalization_ms", "peak_rss_bytes"], fail, "performance_garmin_invalid");
  if (garmin.baseline.source !== "phase18-pinned-artifact/v1" || garmin.baseline.fixture_sha256 !== garmin.fixture_sha256 || garmin.baseline.artifact_sha256 === garmin.runtime_receipt_sha256
    || isDeepStrictEqual(garmin.baseline.normalization_ms, garmin.normalization_ms) || isDeepStrictEqual(garmin.baseline.peak_rss_bytes, garmin.peak_rss_bytes)) fail("performance_garmin_invalid");
  [garmin.baseline.phase18_source_tree_sha256, garmin.baseline.artifact_sha256, garmin.baseline.fixture_sha256].forEach((value) => digest(value, fail, "performance_garmin_invalid"));
  samples(garmin.baseline.normalization_ms, 5, fail, "performance_garmin_invalid"); samples(garmin.baseline.peak_rss_bytes, 5, fail, "performance_garmin_invalid");
  exact(native.garmin_receipt, ["producer", "transport", "receipt_sha256"], fail, "performance_garmin_invalid");
  if (native.garmin_receipt.producer !== "phase18-garmin-bounded-sync/v1" || native.garmin_receipt.transport !== garmin.transport || native.garmin_receipt.receipt_sha256 !== garmin.runtime_receipt_sha256) fail("performance_garmin_invalid");
  return true;
}
