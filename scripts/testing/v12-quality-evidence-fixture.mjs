import { createHash } from "node:crypto";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "../benchmark-v12-interactions.mjs";

export const qualityRoots = ["workout", "calendar", "library", "progress"];
export const qualityModes = ["normal", "reduced"];
export const qualityInputs = ["touch", "software-keyboard", "hardware-keyboard", "dpad"];
export const qualityEvents = {
  touch: "touch-tap",
  "software-keyboard": "ime-text",
  "hardware-keyboard": "key-enter",
  dpad: "key-dpad-center",
};
export const qualityScenarios = {
  workout: { fixture_id: "phase20-workout-active-r1", state_id: "workout-active-session" },
  calendar: { fixture_id: "phase20-calendar-month-r1", state_id: "calendar-month-agenda" },
  library: { fixture_id: "phase20-library-exercises-r1", state_id: "library-exercise-catalog" },
  progress: { fixture_id: "phase20-progress-overview-r1", state_id: "progress-overall-current" },
};
export const fixtureNonce = "a".repeat(48);
export const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function qualityIdentity(overrides = {}) {
  return {
    base_head: "a".repeat(40), source_tree_sha256: sha("source"), apk_sha256: sha("apk"),
    installed_apk_sha256: sha("apk"), package: "com.fchoo.gymtracker.devtest",
    device_identity_sha256: sha("device"), fixture_sha256: sha("fixtures"), ...overrides,
  };
}

export function accessibilityEvidence(identity = qualityIdentity(), nonce = fixtureNonce) {
  return qualityRoots.flatMap((root, rootIndex) => qualityModes.map((motion_mode, modeIndex) => {
    const scenario = qualityScenarios[root];
    const operation = `accessibility-${root}-${motion_mode}`;
    const configuration = {
      id: `quality-${root}-${motion_mode}-f200`, root, motion_mode, operation,
      fixture_id: scenario.fixture_id, state_id: scenario.state_id,
      font_scale: 2, density: 3, content_bounds: { width: 390, height: 844 },
      insets: { top: 24, bottom: 24 }, ime_bounds: { top: 500, bottom: 844 },
    };
    const interactions = qualityInputs.map((input, index) => ({
      input, event: qualityEvents[input], focus_before: `settings-${root}`,
      action: "activate", focus_after: input === "software-keyboard" ? "settings-search" : "settings-close",
      command_count: 1, callback_count: 1,
      callback_receipt_sha256: sha(`callback:${root}:${motion_mode}:${input}`),
      event_receipt_sha256: sha(`event:${root}:${motion_mode}:${input}`),
      image_hash: sha(`image:${root}:${motion_mode}:${input}:${index}`),
    }));
    const modal = {
      focus_ring_dp: 3, focus_offset_dp: 3, background_isolated: true,
      back: { event: "key-back", focus_before: "settings-search", focus_after: `settings-${root}`, callback_count: 1, callback_receipt_sha256: sha(`modal-callback:${root}:${motion_mode}:back`), event_receipt_sha256: sha(`modal-event:${root}:${motion_mode}:back`) },
      escape: { event: "key-escape", focus_before: "settings-search", focus_after: `settings-${root}`, callback_count: 1, callback_receipt_sha256: sha(`modal-callback:${root}:${motion_mode}:escape`), event_receipt_sha256: sha(`modal-event:${root}:${motion_mode}:escape`) },
      restores_invoker: true,
    };
    const motion = {
      mode: motion_mode, destination: scenario.state_id, callback_count: 1 + rootIndex,
      frame_callback_count: 2 + modeIndex, source_facts_sha256: sha(`source-facts:${root}`),
      behavior_receipt_sha256: sha(`motion:${root}:${motion_mode}`),
    };
    const source_receipts = {
      source_tree_sha256: identity.source_tree_sha256, fixture_sha256: identity.fixture_sha256,
      source_before_sha256: sha(`before:${root}`), source_after_sha256: sha(`after:${root}`),
      state_sha256: sha({ root, motion_mode, state_id: scenario.state_id, fixture_id: scenario.fixture_id, source: `after:${root}` }),
    };
    const native_receipts = {
      operation, sequence: rootIndex * 2 + modeIndex + 1,
      database_name: `gym-tracker-phase20-quality-${nonce}-${root}.db`,
      configuration_sha256: sha(configuration), command_receipt_sha256: sha(`command:${operation}`),
      readiness_sha256: source_receipts.state_sha256,
      event_receipts_sha256: sha(interactions.map(({ event_receipt_sha256 }) => event_receipt_sha256)),
      callback_receipts_sha256: sha(interactions.map(({ callback_receipt_sha256 }) => callback_receipt_sha256)),
      modal_receipt_sha256: sha(modal), motion_receipt_sha256: sha(motion),
    };
    return {
      root, motion_mode, operation, fixture_id: scenario.fixture_id, state_id: scenario.state_id,
      native_execution: "EXECUTED", configuration,
      targets: [
        { id: `settings-${root}`, name: `${root} Settings`, role: "button", state: "enabled", non_color_cue: true, overlap: false, bounds_dp: { left: 0, top: 24, width: 48, height: 48 } },
        { id: `content-${root}`, name: `${root} Content`, role: "button", state: "enabled", non_color_cue: true, overlap: false, bounds_dp: { left: 60, top: 24, width: 48, height: 48 } },
      ], interactions, modal, motion, source_receipts, native_receipts, restored_settings: true,
    };
  }));
}

const seriesSpec = {
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
};
const values = (count, offset = 1) => Array.from({ length: count }, (_, index) => offset + index / 1000);
const timing = (samples, endpoint, source) => ({ clock: "android-elapsed-realtime", endpoint, source_tree_sha256: source, spans: samples.map((duration, index) => ({ start_ms: 10_000 + index * 100, end_ms: 10_000 + index * 100 + duration })) });

export function performanceEvidence(identity = qualityIdentity(), nonce = fixtureNonce) {
  const samples = Object.fromEntries(Object.entries(seriesSpec).map(([key, [count]]) => [key, values(count)]));
  const timings = Object.fromEntries(Object.entries(seriesSpec).map(([key, [, endpoint]]) => [key, timing(samples[key], endpoint, identity.source_tree_sha256)]));
  for (const [key, paths, endpoint] of [["root_switch_to_useful_ms", qualityRoots, "root-input-to-useful-content"], ["input_response_ms", ["numeric_edit", "rest_control"], "input-to-visible-response"]]) {
    samples[key] = Object.fromEntries(paths.map((name, index) => [name, values(100, index + 1)]));
    timings[key] = Object.fromEntries(paths.map((name) => [name, timing(samples[key][name], endpoint, identity.source_tree_sha256)]));
  }
  samples.calendar_frame_sequences = Array.from({ length: 100 }, (_, index) => ({
    sequence: index + 1, capture_phase: "calendar-gesture-before-ready",
    start_ms: 20_000 + index * 100, end_ms: 20_020 + index * 100, ready_ms: 20_025 + index * 100,
    frame_work_ms: [8 + index / 1000, 10 + index / 1000], missed_frames: index % 2,
    refresh_rate_hz: 120, refresh_rate_source: "android-display-mode", profiler_overhead_ms: 0.2,
  }));
  samples.phase12_merge_peak_growth_bytes = values(10, 1024);
  samples.phase12_merge_fixture = { snapshot_bytes: 24 * 1024 * 1024, rows: 100_000, writer_commits: 5, sqlite_max_variable_number: 4_000 };
  const garminFixtureSha256 = sha("maximum-reviewed-garmin-json");
  const garminPayloadSha256 = sha("deterministic-garmin-json");
  const garminOutputSha256 = sha("normalized-garmin-json");
  const garminBaselineArtifact = {
    schema_version: 1,
    producer: "phase20-current-source-garmin-baseline/v1",
    source_tree_sha256: identity.source_tree_sha256,
    native_path: "modules/garmin-connect/android/src/main/python/garmin_bridge.py#benchmarkDeterministicJson",
    transport: "chaquopy-python-garminconnect-0.3.17",
    fixture_sha256: garminFixtureSha256,
    payload_sha256: garminPayloadSha256,
    output_sha256: garminOutputSha256,
    fixture_profile: { activity_count: 100, lap_count: 10, route_point_count: 64 },
    normalization_ms: values(5, 6),
    peak_rss_bytes: values(5, 2 * 1024 * 1024),
  };
  const garminBaselineJson = canonical(garminBaselineArtifact);
  samples.garmin_sync_normalization = {
    state: "REVIEW_REQUIRED", limit_source: "phase20-current-source-baseline/v1", transport: "chaquopy-python-garminconnect-0.3.17",
    fixture_sha256: garminFixtureSha256, payload_sha256: garminPayloadSha256, output_sha256: garminOutputSha256,
    fixture_profile: { activity_count: 100, lap_count: 10, route_point_count: 64 },
    runtime_receipt_sha256: sha("chaquopy-runtime"), normalization_ms: values(5, 5), peak_rss_bytes: values(5, 1024 * 1024),
    baseline: { source: "phase20-current-source-baseline/v1", source_tree_sha256: identity.source_tree_sha256,
      artifact_sha256: sha(garminBaselineJson), artifact_json: garminBaselineJson, fixture_sha256: garminFixtureSha256,
      normalization_ms: garminBaselineArtifact.normalization_ms, peak_rss_bytes: garminBaselineArtifact.peak_rss_bytes },
  };
  const cold_launch_cycles = samples.cold_launch_to_interactive_ms.map((duration, index) => ({
    sequence: index + 1, operation: "launch-cold", previous_process_id: index === 0 ? 2000 : 2999 + index,
    process_id: 3000 + index, previous_process_start_ticks: index === 0 ? 40_000 : 50_000 + (index - 1) * 200,
    process_start_ticks: 50_000 + index * 200, process_start_ms: 50_000 + index * 200,
    ready_ms: 50_000 + index * 200 + duration,
    database_name: `gym-tracker-phase20-quality-${nonce}-workout.db`,
    readiness_sha256: sha(`cold-ready:${index}`), source_receipt_sha256: sha("cold-source-stable"),
    route_callback_receipt_sha256: sha(`cold-route-ready:${index}`),
  }));
  const source_receipts = {
    source_tree_sha256: identity.source_tree_sha256, fixture_sha256: identity.fixture_sha256,
    source_before_sha256: sha("performance-before"), source_after_sha256: sha("performance-after"),
    state_sha256: sha("performance-state"),
  };
  const input_receipts = Object.fromEntries(["numeric_edit", "rest_control"].map((name) => [name,
    Array.from({ length: 100 }, (_, index) => ({ sequence: index + 1,
      operation: name === "numeric_edit" ? "numeric-edit" : "rest-control",
      callback_id: name === "numeric_edit" ? "numeric-edit-commit" : "rest-adjust-commit",
      callback_count: 1, activation: "accessibility-action", target_id: name === "numeric_edit" ? "set-editor-save" : "rest-control-Add 15 seconds to rest",
      callback_receipt_sha256: sha(`${name}:callback:${index}`), result_sha256: sha(`${name}:result:${index}`) }))]));
  const root_switch_receipts = Object.fromEntries(qualityRoots.map((root) => [root,
    Array.from({ length: 100 }, (_, index) => ({ sequence: index + 1, target_id: `root-tab-${root === "workout" ? "index" : root}`,
      operation: `root-switch-${root}`, activation: "accessibility-action", callback_id: "route-ready", callback_count: 1, callback_receipt_sha256: sha(`${root}:route:${index}`), result_sha256: sha(`${root}:result:${index}`),
      readiness_sha256: sha(`${root}:ready:${index}`) }))]));
  const workloadBase = {
    producer: "phase20-quality-workload-proof/v1", set_count: V12_PERFORMANCE_WORKLOAD.set_count,
    correction_count: V12_PERFORMANCE_WORKLOAD.correction_count, plan_count: 3,
    plan_kinds: ["running", "strength"], set_digest_sha256: sha("workload-sets"),
    correction_digest_sha256: sha("workload-corrections"), plan_digest_sha256: sha("workload-plans"),
  };
  const workload_receipt = { ...workloadBase, workload_digest_sha256: sha(workloadBase) };
  samples.native_receipts = {
    build_variant: "release", debugger_attached: false, source_receipts, timings,
    cold_launch_cycles, root_switch_receipts, input_receipts, workload_receipt,
    frame_sequences_sha256: sha(samples.calendar_frame_sequences),
    merge_peak_growth_sha256: sha(samples.phase12_merge_peak_growth_bytes),
    ordinary_js_receipt: { producer: "phase20-ordinary-js-source-work/v1", database_name: `gym-tracker-phase20-quality-${nonce}-workout.db`, work_units: 100, receipt_sha256: sha("ordinary-js-work") },
    garmin_receipt: { producer: "phase20-garmin-installed-normalization/v1", transport: "chaquopy-python-garminconnect-0.3.17", receipt_sha256: samples.garmin_sync_normalization.runtime_receipt_sha256 },
  };
  return { schema_version: 1, suite: "v1.2-performance", producer: "v12-release-performance-collector/v1", native_execution: "EXECUTED", sample_origin: "release-native-source-backed", workload: V12_PERFORMANCE_WORKLOAD, identity, budgets: V12_PERFORMANCE_BUDGETS, samples };
}
