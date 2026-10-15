#!/usr/bin/env node
// JSON-stdin fake device protocol. It intentionally contains no device serial,
// credentials, host path, or production data.
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { V12_BROWSER_WALK_STATE_IDS, V12_CONFIG_IDS } from "../../v12-evidence-contract.mjs";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "../../benchmark-v12-interactions.mjs";
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const read = await new Promise((resolve) => { let body = ""; process.stdin.on("data", (chunk) => { body += chunk; }); process.stdin.on("end", () => resolve(JSON.parse(body))); });
const action = process.argv[3]; const fail = process.env.V12_FAKE_DEVICE_FAIL; const mutation = process.env.V12_FAKE_DEVICE_MUTATION;
if (fail && action.includes(fail)) process.exit(1);
if (mutation && action === "garmin") process.exit(1);
const png = (key) => { const image = new PNG({ width: 2, height: 1 }); const hash = Buffer.from(sha(key), "hex"); image.data.set([hash[0], hash[1], hash[2], 255, hash[3], hash[4], hash[5], 255]); return PNG.sync.write(image).toString("base64"); };
const sample = (index, dx = 25) => ({ timestampMs: index + 1, widthDp: 100, dxDp: dx, dyDp: 0, intentOwner: "horizontal", translationDp: dx, title: "2026-10", selectedCivilDate: "2026-10-14", generation: index + 1, focusedWeek: "week", rowBounds: [0, 48], callbackCount: index + 1, focusIdentity: "calendar", motion: "normal" });
const repeated = (count, value) => Array.from({ length: count }, () => value);
const performanceIdentity = Object.freeze({ base_head: "a".repeat(40), source_tree_sha256: sha("performance-source"), apk_sha256: sha("performance-apk"), installed_apk_sha256: sha("performance-apk"), package: "com.fchoo.gymtracker.devtest", device_identity_sha256: sha("performance-device"), fixture_sha256: sha("performance-fixture") });
const sqliteCaseIds = [
  "fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen",
  "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history",
];
const garminCaseIds = [
  "packaging", "bridge-allowlist", "canonical-json", "sync-read", "account-lifecycle", "recovery",
  "dedupe-restart", "dedupe-restore", "dedupe-merge", "match-zero", "match-one", "match-many",
  "match-stale", "match-alternate", "match-cancel", "match-confirm", "match-reassign", "privacy",
];
const response = (() => {
  if (action === "acquire-lease") return { id: "lease" }; if (action === "release-lease") return true;
  if (action === "snapshot-settings") return { id: "settings" }; if (action === "restore-settings") return true;
  if (action === "visual-capture") return { native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png_base64: png(`${read.payload.state_id}:${read.payload.configuration_id}`), settings: { restored: true, privacy: "synthetic-only" } };
  if (action === "visual-capture-batch") return read.payload.captures.map(({ state_id, configuration_id }) => ({ native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png_base64: png(`${state_id}:${configuration_id}`), settings: { restored: true, privacy: "synthetic-only" } }));
  if (action === "visual-compare") return V12_BROWSER_WALK_STATE_IDS.flatMap((id) => V12_CONFIG_IDS.map((configuration_id) => {
    const key = `${id}:${configuration_id}`;
    return {
      id,
      configuration_id,
      identity: { fixture: "v12-synthetic-fixtures-r18", clock: "2026-10-14T00:00:00Z", locale: "en-SG", timezone: "Asia/Singapore", content_bounds: { width: 390, height: 844 } },
      approved_reference_png_base64: png(key),
      observation: { native_execution: "EXECUTED", state_id: id, configuration_id, content: true, actions: true, copy: true, state: true, route: true, focus: true, order: true, targets: [{ width_dp: 48, height_dp: 48, overlap: false }], non_color_state: true, commit_read_only: true, geometry_dp: 0, baseline_icon_dp: 0, token_exact: true, ciede2000: 0 },
    };
  }));
  if (action === "accessibility") return [{
    configuration: { font_scale: 2, density: 3, content_bounds: { width: 390, height: 844 }, insets: { top: 24, bottom: 24 }, ime_bounds: { top: 500, bottom: 844 } },
    targets: [{ id: "primary", bounds_dp: { left: 0, top: 0, width: 48, height: 48 }, name: "Continue", role: "button", state: "enabled", non_color_cue: true, overlap: false }],
    interactions: ["touch", "software-keyboard", "hardware-keyboard", "dpad"].map((input) => ({ input, focus_before: "primary", action: "activate", focus_after: "primary", command_count: 1, image_hash: sha(`accessibility:${input}`) })),
    modal: { focus_ring_dp: 3, focus_offset_dp: 3, back: "closes-modal", escape: "closes-modal", restores_invoker: true },
    motion: { normal: { destination: "done", callbacks: 1, source_facts: "synthetic" }, reduced: { destination: "done", callbacks: 1, source_facts: "synthetic" } },
    fixture_id: "v12-synthetic-fixtures-r18",
    native_execution: "EXECUTED",
    restored_settings: true,
  }];
  if (action === "performance" && read.payload.request === "identity") return { identity: performanceIdentity };
  if (action === "performance") return {
    schema_version: 1,
    suite: "v1.2-performance",
    producer: "v12-release-performance-collector/v1",
    native_execution: "EXECUTED",
    sample_origin: "release-native-source-backed",
    workload: V12_PERFORMANCE_WORKLOAD,
    identity: performanceIdentity,
    budgets: V12_PERFORMANCE_BUDGETS,
    samples: {
      warm_launch_to_interactive_ms: repeated(20, 100), cold_launch_to_interactive_ms: repeated(20, 200),
      root_switch_to_useful_ms: { workout: repeated(100, 40), calendar: repeated(100, 40) },
      committed_set_to_visible_dock_ms: repeated(100, 80), ordinary_js_task_ms: repeated(100, 10),
      input_response_ms: { numeric_edit: repeated(100, 10), rest_control: repeated(100, 10) },
      search_after_debounce_ms: repeated(100, 20), calendar_month_and_selection_ms: repeated(100, 50),
      progress_useful_content_ms: repeated(20, 80), progress_review_open_ms: repeated(100, 50), progress_targeted_rebuild_ms: repeated(20, 80),
      calendar_frame_sequences: Array.from({ length: 100 }, () => ({ frame_work_ms: [10, 12], missed_frames: 0, refresh_rate_hz: 60, profiler_overhead_ms: 0.2 })),
      phase12_dirty_trigger_ms: repeated(100, 1), phase12_writer_occupancy_ms: repeated(20, 20),
      phase12_merge_preflight_ms: repeated(10, 100), phase12_merge_peak_growth_bytes: repeated(10, 1024), phase12_merge_materialization_ms: repeated(5, 100),
      phase12_merge_fixture: { snapshot_bytes: 24 * 1024 * 1024, rows: 100000, writer_commits: 5, sqlite_max_variable_number: 4000 },
      garmin_sync_normalization: { state: "REVIEW_REQUIRED", limit_source: "phase18-exact-artifact-baseline", fixture_sha256: sha("garmin-fixture") },
    },
  };
  if (action === "sqlite") return {
    status: "passed",
    contract: {
      schemaVersion: 1,
      contractVersion: 1,
      status: "passed",
      total: sqliteCaseIds.length,
      passed: sqliteCaseIds.length,
      failed: 0,
      skipped: 0,
      cases: sqliteCaseIds.map((id) => ({ id, status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: 1 } })),
    },
  };
  if (action === "recovery") return '<testsuites name="v12-recovery"><testsuite name="synthetic" tests="64"><testcase name="recovery"/></testsuite></testsuites>';
  if (action === "garmin") return {
    cases: garminCaseIds.map((id, order) => ({ id, order, status: "PASS", code: "native-passed", count: id === "match-one" ? 1 : 0 })),
  };
  if (action === "calendar") return { stages: Array.from({ length: 35 }, (_, index) => ({ id: ["drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1", "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above", "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1", "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above", "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal", "second-input-interrupt", "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "adjacent-week", "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month", "rapid-reverse-input", "rotation-during-transition", "background-during-transition", "reduced-motion", "dev-01-padding", "dev-02-light-title"][index], order: index, status: "PASS", samples: [sample(index * 2, 25), sample(index * 2 + 1, 25)] })) };
  // Other actions intentionally return only a shape; the black-box test is the
  // contract that forces producers to reject anything insufficient.
  return { mutation, result: "synthetic" };
})();
const attestation = { ...read.attestation };
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "apk") attestation.apk_sha256 = "0".repeat(64);
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "device") attestation.device_identity_sha256 = "0".repeat(64);
if (process.env.V12_FAKE_DEVICE_FORGE_ATTESTATION === "source") attestation.source_tree_sha256 = "0".repeat(64);
process.stdout.write(`${JSON.stringify({ schema_version: 1, action, ok: true, result: response, attestation })}\n`);
