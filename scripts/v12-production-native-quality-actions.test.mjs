import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createControlledRunner } from "./testing/v12-production-launcher/controlled-runner.mjs";
import { executeProductionQualityAction } from "./v12-production-native-quality-actions.mjs";
import { executeLiveV12AccessibilityShard } from "./v12-accessibility-shard.mjs";
import { executeV12PerformanceShard } from "./v12-performance-shard.mjs";
import { V12_PERFORMANCE_BUDGETS, V12_PERFORMANCE_WORKLOAD } from "./benchmark-v12-interactions.mjs";

// Deliberately synthetic transport data. It is never installed, published, or
// presented as measurements. Only the ADB executable is controlled; the module,
// shared runtime, identity/lease checks and schema validators are production code.
const hash = (value) => createHash("sha256").update(value).digest("hex");
const quoted = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const roots = ["workout", "calendar", "library", "progress"];
const values = (length) => Array.from({ length }, (_, i) => 1 + i / 1000);
function receipts(identity) {
  return { source_tree_sha256: identity.source_tree_sha256, fixture_sha256: identity.fixture_sha256,
    source_before_sha256: hash("before"), source_after_sha256: hash("after"), state_sha256: hash("state"), configuration_sha256: hash("configuration"), command_receipt_sha256: hash("command") };
}
function accessibility(identity) {
  return roots.flatMap((root) => ["normal", "reduced"].map((motion_mode) => ({
    root, motion_mode, fixture_id: "v12-synthetic-fixtures-r18", native_execution: "EXECUTED",
    configuration: { font_scale: 2, density: 3, content_bounds: { width: 360, height: 800 }, insets: { top: 24, bottom: 24 }, ime_bounds: { top: 500, bottom: 800 } },
    targets: [
      { id: "primary", name: "Continue", role: "button", state: "enabled", non_color_cue: true, overlap: false, bounds_dp: { left: 0, top: 24, width: 48, height: 48 } },
      { id: "close", name: "Close", role: "button", state: "enabled", non_color_cue: true, overlap: false, bounds_dp: { left: 48, top: 24, width: 48, height: 48 } },
    ],
    interactions: ["touch", "software-keyboard", "hardware-keyboard", "dpad"].map((input) => ({ input, focus_before: "primary", action: "activate", focus_after: "close", command_count: 1, image_hash: hash(input) })),
    modal: { focus_ring_dp: 3, focus_offset_dp: 3, back: "closes-modal", escape: "closes-modal", restores_invoker: true },
    motion: { normal: { destination: "done", callbacks: 1, source_facts: hash("source") }, reduced: { destination: "done", callbacks: 1, source_facts: hash("source") } },
    receipts: { ...receipts(identity), state_sha256: hash(`state:${root}`) },
  })));
}
function performance(identity) {
  const specification = {
    warm_launch_to_interactive_ms: [20, "process-resume-to-interactive"], cold_launch_to_interactive_ms: [20, "process-start-to-interactive"],
    committed_set_to_visible_dock_ms: [100, "authoritative-commit-to-visible-dock"], ordinary_js_task_ms: [100, "js-task-start-to-end"],
    search_after_debounce_ms: [100, "debounce-end-to-visible-results"], calendar_month_and_selection_ms: [100, "calendar-input-to-visible-selection"],
    progress_useful_content_ms: [20, "progress-start-to-useful-content"], progress_review_open_ms: [100, "progress-review-start-to-visible"],
    progress_targeted_rebuild_ms: [20, "progress-rebuild-start-to-useful-content"], phase12_dirty_trigger_ms: [100, "sqlite-dirty-trigger-start-to-end"],
    phase12_writer_occupancy_ms: [20, "sqlite-writer-acquire-to-release"], phase12_merge_preflight_ms: [10, "merge-preflight-start-to-end"],
    phase12_merge_materialization_ms: [5, "merge-materialization-start-to-end"],
  };
  const timing = (raw, endpoint) => ({ clock: "android-elapsed-realtime", endpoint, source_tree_sha256: identity.source_tree_sha256,
    spans: raw.map((value, i) => ({ start_ms: i * 100, end_ms: i * 100 + value })) });
  const samples = Object.fromEntries(Object.entries(specification).map(([key, [count]]) => [key, values(count)]));
  const timings = Object.fromEntries(Object.entries(specification).map(([key, [, endpoint]]) => [key, timing(samples[key], endpoint)]));
  for (const [key, names, endpoint] of [["root_switch_to_useful_ms", roots, "root-input-to-useful-content"], ["input_response_ms", ["numeric_edit", "rest_control"], "input-to-visible-response"]]) {
    samples[key] = Object.fromEntries(names.map((name) => [name, values(100)]));
    timings[key] = Object.fromEntries(names.map((name) => [name, timing(samples[key][name], endpoint)]));
  }
  samples.calendar_frame_sequences = Array.from({ length: 100 }, (_, i) => ({ frame_work_ms: [1, 2 + i / 1000], missed_frames: i % 2, refresh_rate_hz: 60, profiler_overhead_ms: 0.2 }));
  samples.phase12_merge_peak_growth_bytes = values(10);
  samples.phase12_merge_fixture = { snapshot_bytes: 24 * 1024 * 1024, rows: 100_000, writer_commits: 5, sqlite_max_variable_number: 4000 };
  samples.garmin_sync_normalization = { state: "REVIEW_REQUIRED", limit_source: "phase18-exact-artifact-baseline", fixture_sha256: hash("garmin-fixture"), normalization_ms: values(5), peak_rss_bytes: values(5),
    baseline: { source: "phase18-exact-artifact-baseline", identity, artifact_sha256: hash("baseline"), normalization_ms: values(5), peak_rss_bytes: values(5) } };
  samples.native_receipts = { build_variant: "release", debugger_attached: false, receipts: receipts(identity), timings,
    frame_sequences_sha256: hash(JSON.stringify(samples.calendar_frame_sequences)), merge_peak_growth_sha256: hash(JSON.stringify(samples.phase12_merge_peak_growth_bytes)) };
  return { schema_version: 1, suite: "v1.2-performance", producer: "v12-release-performance-collector/v1", native_execution: "EXECUTED",
    sample_origin: "release-native-source-backed", workload: V12_PERFORMANCE_WORKLOAD, identity, budgets: V12_PERFORMANCE_BUDGETS, samples };
}

// This tool is invoked in a production-mode child process, not as an in-process
// fake adapter. Existing controlled ADB handles identity, leases and restoration.
const DEVICE_TOOL = String.raw`
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.env.V12_CONTROLLED_STATE;
const file = path.join(root, 'state.json');
const state = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const command = args[2] === 'shell' ? [...args[3].matchAll(/'([^']*)'/g)].map(m => m[1]) : [];
const component = 'com.fchoo.gymtracker.devtest/com.fchoo.gymtracker.Phase20QualityInstrumentation';
const save = () => writeFileSync(file, JSON.stringify(state));
if (command.slice(0,3).join(' ') === 'pm list instrumentation') {
  if (!state.noInstrumentation) process.stdout.write('instrumentation:' + component + ' (target=com.fchoo.gymtracker.devtest)\n');
} else if (command[0] === 'am' && command[1] === 'instrument') {
  if (process.env.NODE_ENV !== 'production' || process.env.NODE_TEST_CONTEXT || process.env.V12_NATIVE_ADAPTER_COMMAND || process.env.V12_NATIVE_ADAPTER_TEST_MODE) process.exit(79);
  state.instrumentCalls = (state.instrumentCalls ?? 0) + 1;
  state.instrumentCommand = command;
  state.settings.font_scale = '2'; state.settings.animator_duration_scale = '0'; state.settings.show_ime_with_hard_keyboard = '1';
  if (state.restoreFailure) state.failedSetting = 'show_ime_with_hard_keyboard';
  if (state.ignoredRestore) state.ignoredSetting = 'show_ime_with_hard_keyboard';
  if (state.afterWrongApk) state.wrongApk = true;
  if (state.stopFailure) state.failStop = true;
  save();
  if (state.hang) await new Promise(resolve => setTimeout(resolve, 60000));
  if (state.missingMarker) process.exit(0);
  const nonce = state.staleMarker ? 'stale' : command[command.indexOf('qualityNonce')+1];
  const action = command[command.indexOf('qualityAction')+1];
  const emit = (kind, rest) => process.stdout.write('GYM_TRACKER_V12_QUALITY:' + JSON.stringify({schema_version:1, nonce, action, kind, ...rest}) + '\n');
  if (state.nativeFailure) { emit('error', {error:'private-native bearer /Users/private'}); process.exit(0); }
  const body = readFileSync(path.join(root, 'quality-result.json'));
  const base64 = body.toString('base64');
  const chunks = Array.from({length:Math.ceil(base64.length/3000)}, (_,i)=>base64.slice(i*3000,(i+1)*3000));
  emit('progress',{sequence:1});
  if (state.duplicateProgress) emit('progress',{sequence:1});
  chunks.forEach((payload,i) => { if (!state.missingChunk || i !== 1) emit('chunk',{sequence:i+1,total:chunks.length,payload}); });
  if (state.duplicateChunk) emit('chunk',{sequence:chunks.length,total:chunks.length,payload:chunks.at(-1)});
  emit('result',{sha256:state.badDigest ? '0'.repeat(64) : createHash('sha256').update(body).digest('hex')});
  if (state.duplicateResult) emit('result',{sha256:'0'.repeat(64)});
  if (!state.noCompletion) process.stdout.write(state.failedCompletion ? 'INSTRUMENTATION_CODE: 0\n' : 'INSTRUMENTATION_CODE: -1\n');
} else if (command[0] === 'am' && command[1] === 'force-stop' && state.failStop) {
  process.stderr.write('private-device /Users/private bearer'); process.exit(1);
} else {
  await import(pathToFileURL(path.join(process.cwd(),'scripts/testing/v12-production-launcher/controlled-device-tool.mjs')));
}
`;

function fixture(t, action = "performance") {
  const runner = createControlledRunner(); t.after(runner.cleanup);
  const { build } = runner;
  const identity = { base_head: build.source.head, source_tree_sha256: build.source.tree_sha256, apk_sha256: build.build.apk.sha256,
    installed_apk_sha256: build.device.installed_apk_sha256, package: build.build.package, device_identity_sha256: build.device.identity_sha256, fixture_sha256: build.fixtures.registry_sha256 };
  const attestation = { schema_version: 1, action, launcher_source_sha256: hash(readFileSync(path.join(runner.root, "scripts/v12-production-native-adapter-launcher.mjs"))),
    run_id: build.run_id, build_profile: "development-test", suite: "v1.2-acceptance", source_tree_sha256: identity.source_tree_sha256,
    apk_sha256: identity.apk_sha256, installed_apk_sha256: identity.installed_apk_sha256, apk_signature_sha256: build.build.apk.signature_sha256,
    device_identity_sha256: identity.device_identity_sha256, package: identity.package };
  const measured = { schema_version: 1, action, identity, build_variant: "release", debugger_attached: false,
    ...(action === "accessibility" ? { observations: accessibility(identity) } : { performance: performance(identity) }) };
  const resultFile = path.join(runner.scratch, "quality-result.json");
  const deviceFile = path.join(runner.scratch, "quality-device.mjs");
  writeFileSync(deviceFile, DEVICE_TOOL);
  writeFileSync(path.join(runner.scratch, "bin/adb"), `#!/bin/sh\nexec ${quoted(process.execPath)} ${quoted(deviceFile)} "$@"\n`, { mode: 0o755 });
  const environment = { ...process.env, NODE_ENV: "production", PATH: `${path.join(runner.scratch, "bin")}:${process.env.PATH}`, V12_DEVICE_SERIAL: "controlled-device-20", V12_CONTROLLED_STATE: runner.scratch };
  for (const name of ["NODE_TEST_CONTEXT", "V12_NATIVE_ADAPTER_COMMAND", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS"]) delete environment[name];
  const program = `import fs from 'node:fs'; import {executeProductionQualityAction} from './scripts/v12-production-native-quality-actions.mjs';
    const {action,payload,attestation}=JSON.parse(fs.readFileSync(0,'utf8'));
    try {const result=await executeProductionQualityAction(action,payload,attestation); process.stdout.write(JSON.stringify(result));}
    catch(e) {process.stderr.write(e.message); process.exitCode=1;}`;
  const invoke = (payload = {}, env = {}) => {
    writeFileSync(resultFile, JSON.stringify(measured));
    return spawnSync(process.execPath, ["--input-type=module", "--eval", program], { cwd: runner.root, env: { ...environment, ...env },
      input: JSON.stringify({ action, payload: { run_id: build.run_id, ...payload }, attestation }), encoding: "utf8", timeout: 45_000, maxBuffer: 4 * 1024 * 1024 });
  };
  return { ...runner, invoke, identity, measured, attestation };
}
function rejected(result, code) {
  assert.notEqual(result.status, 0); assert.equal(result.stdout, "");
  assert.match(result.stderr, new RegExp(`^v12_production_(native_launcher_quality|native_launcher)_${code}$`, "u"));
  assert.doesNotMatch(result.stderr, /bearer|\/Users\/|private-native|controlled-device/u);
}
function released(runner) { assert.equal(existsSync(path.join(runner.scratch, "lock")), false); }
function successful(runner, payload) {
  const result = runner.invoke(payload); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
}

test("unsupported actions return undefined without reading identity or running ADB", async () => {
  for (const action of ["sqlite", "calendar", "garmin", "recovery", "visual-capture", "unknown", undefined]) {
    assert.equal(await executeProductionQualityAction(action), undefined);
  }
});
test("production subprocess returns the complete native performance raw schema unchanged", (t) => {
  const runner = fixture(t);
  const before = runner.readState().settings;
  const result = successful(runner, { workload: V12_PERFORMANCE_WORKLOAD, budgets: V12_PERFORMANCE_BUDGETS, build_variant: "release", sample_origin: "release-native-source-backed" });
  assert.deepEqual(result, runner.measured.performance);
  const shard = executeV12PerformanceShard({ identity: runner.identity, performance: result });
  assert.equal(shard.summary.calendar_frame_sequences.samples, 100);
  assert.deepEqual(shard.raw_samples.native_receipts, result.samples.native_receipts);
  assert.deepEqual(runner.readState().settings, before); released(runner);
  assert.equal(runner.readState().instrumentCalls, 1);
  assert.equal(result.samples.garmin_sync_normalization.baseline.source, "phase18-exact-artifact-baseline");
});
test("production subprocess returns measured F200/accessibility with restored settings and attended exclusions", (t) => {
  const runner = fixture(t, "accessibility"); const before = runner.readState().settings;
  const result = successful(runner, { required_inputs: ["touch", "software-keyboard", "hardware-keyboard", "dpad"], font_scale: 2, focus_ring_dp: 3, excludes: ["live-talkback", "switch-scanning"] });
  assert.deepEqual(result, runner.measured.observations.map((entry) => ({ ...entry, restored_settings: true })));
  const writes = [];
  const shard = executeLiveV12AccessibilityShard({ runId: runner.build.run_id, observe: () => result, write: (file, value) => writes.push([file, value]) });
  assert.deepEqual(shard.semantic.excludes, ["live-talkback", "switch-scanning", "final-verdict"]);
  assert.equal(writes.length, 2); assert.deepEqual(runner.readState().settings, before); released(runner);
});
test("identity request verifies installed identity under a lease and does not start instrumentation", (t) => {
  const runner = fixture(t); assert.deepEqual(successful(runner, { request: "identity" }), { identity: runner.identity });
  assert.equal(runner.readState().instrumentCalls, undefined); released(runner);
});
for (const action of ["accessibility", "performance"]) {
  for (const [flag, code] of [["noInstrumentation", "instrumentation_missing"], ["missingMarker", "marker_missing"], ["staleMarker", "marker_invalid"],
    ["missingChunk", "marker_invalid"], ["duplicateChunk", "marker_invalid"], ["duplicateResult", "marker_invalid"], ["duplicateProgress", "marker_invalid"],
    ["badDigest", "marker_digest_invalid"], ["noCompletion", "instrumentation_incomplete"], ["failedCompletion", "marker_invalid"], ["nativeFailure", "marker_invalid"], ["afterWrongApk", "identity_mismatch"]]) {
    test(`${action}: ${flag} fails bounded and restores settings without emitting evidence`, (t) => {
      const runner = fixture(t, action); const before = runner.readState().settings;
      runner.updateState({ [flag]: true }); const started = Date.now(); rejected(runner.invoke(), code);
      assert.ok(Date.now() - started < 40_000); assert.deepEqual(runner.readState().settings, before); released(runner);
    });
  }
  for (const flag of ["restoreFailure", "ignoredRestore", "stopFailure"]) test(`${action}: ${flag} fails and retains the lease`, (t) => {
    const runner = fixture(t, action); runner.updateState({ [flag]: true });
    rejected(runner.invoke(), flag === "stopFailure" ? "instrumentation_stop_failed" : "settings_restore_failed");
    assert.equal(existsSync(path.join(runner.scratch, "lock")), true);
    // All settings, not just the failed one, are attempted on cleanup.
    assert.ok(runner.readState().restorationAttempts.includes("animator_duration_scale"));
  });
  test(`${action}: mismatched native identity and debug build cannot be promoted`, (t) => {
    const runner = fixture(t, action); runner.measured.identity = { ...runner.identity, apk_sha256: "f".repeat(64) };
    rejected(runner.invoke(), "identity_mismatch"); released(runner);
    runner.measured.identity = runner.identity; runner.measured.debugger_attached = true;
    rejected(runner.invoke(), "release_required"); released(runner);
  });
}
for (const [name, mutate] of [
  ["missing series", (p) => { delete p.samples.ordinary_js_task_ms; }],
  ["nineteen cold launches", (p) => { p.samples.cold_launch_to_interactive_ms.pop(); }],
  ["ninety-nine frames", (p) => { p.samples.calendar_frame_sequences.pop(); }],
  ["missing root", (p) => { delete p.samples.root_switch_to_useful_ms.library; }],
  ["missing input path", (p) => { delete p.samples.input_response_ms.rest_control; }],
  ["missing Garmin source", (p) => { delete p.samples.garmin_sync_normalization.baseline; }],
  ["partial Phase12 merge", (p) => { p.samples.phase12_merge_materialization_ms.pop(); }],
  ["host clock", (p) => { p.samples.native_receipts.timings.ordinary_js_task_ms.clock = "host-date-now"; }],
  ["invented elapsed time", (p) => { p.samples.ordinary_js_task_ms[0] += 1; }],
  ["duplicated idle spans", (p) => {
    p.samples.ordinary_js_task_ms.fill(1);
    p.samples.native_receipts.timings.ordinary_js_task_ms.spans = p.samples.ordinary_js_task_ms.map(() => ({ start_ms: 0, end_ms: 1 }));
  }],
  ["missing real command receipt", (p) => { delete p.samples.native_receipts.receipts.command_receipt_sha256; }],
  ["private raw payload", (p) => { p.samples.private_payload = "private-native /Users/private"; }],
]) test(`performance rejects ${name}`, (t) => {
  const runner = fixture(t); mutate(runner.measured.performance);
  rejected(runner.invoke(), "(?:schema_invalid|sample_count_invalid|timing_receipt_duplicate|timing_receipt_invalid|timing_receipt_mismatch)"); released(runner);
});
for (const [name, mutate] of [
  ["absent geometry", (o) => { delete o.targets[0].bounds_dp.width; }],
  ["unreported overlap", (o) => { o.targets[1].bounds_dp.left = 47; }],
  ["out of bounds", (o) => { o.targets[0].bounds_dp.top = 799; }],
  ["unresolved focus", (o) => { o.interactions[0].focus_after = ""; }],
  ["absent IME", (o) => { o.configuration.ime_bounds.top = 800; }],
  ["missing hardware keyboard", (o) => { o.interactions.splice(2, 1); }],
  ["claimed TalkBack", (o) => { o.talkback = true; }],
  ["source mismatch", (o) => { o.receipts.source_tree_sha256 = "f".repeat(64); }],
  ["reduced motion changes source", (o) => { o.motion.reduced.source_facts = "f".repeat(64); }],
  ["static overlap claim", (o) => { o.targets[0].overlap = true; }],
  ["static modal state", (o) => { o.modal.focus_ring_dp = 0; }],
  ["static focus transition", (o) => { o.interactions.forEach((entry) => { entry.focus_after = entry.focus_before; }); }],
  ["static motion callback", (o) => { o.motion.normal.callbacks = 0; }],
  ["missing command receipt", (o) => { delete o.receipts.command_receipt_sha256; }],
]) test(`accessibility rejects ${name}`, (t) => {
  const runner = fixture(t, "accessibility"); mutate(runner.measured.observations[0]);
  rejected(runner.invoke(), "(?:schema_invalid|geometry_overlap|geometry_invalid|focus_invalid|ime_invalid|measurement_invalid|receipt_identity_mismatch|observation_invalid)"); released(runner);
});
test("accessibility requires all four roots in both motion modes", (t) => {
  const runner = fixture(t, "accessibility"); runner.measured.observations.pop();
  rejected(runner.invoke(), "accessibility_coverage_invalid"); released(runner);
});
test("accessibility rejects shared root readiness hashes", (t) => {
  const runner = fixture(t, "accessibility");
  runner.measured.observations.forEach((observation) => { observation.receipts.state_sha256 = hash("shared"); });
  rejected(runner.invoke(), "shared_root_readiness"); released(runner);
});
test("accessibility compares source outcomes across the actual normal and reduced observations", (t) => {
  const runner = fixture(t, "accessibility");
  const changed = { destination: "different", callbacks: 1, source_facts: hash("source") };
  runner.measured.observations[1].motion = { normal: changed, reduced: changed };
  rejected(runner.invoke(), "motion_mismatch"); released(runner);
});
test("warm launch maximum is enforced even when raw spans are valid", (t) => {
  const runner = fixture(t);
  runner.measured.performance.samples.warm_launch_to_interactive_ms[0] = 1001;
  runner.measured.performance.samples.native_receipts.timings.warm_launch_to_interactive_ms.spans[0].end_ms = 1001;
  rejected(runner.invoke(), "launch_budget_exceeded"); released(runner);
});
test("timing endpoints cannot be relabelled after collection", (t) => {
  const runner = fixture(t);
  runner.measured.performance.samples.native_receipts.timings.search_after_debounce_ms.endpoint = "idle-loop";
  rejected(runner.invoke(), "timing_receipt_invalid"); released(runner);
});
test("borrowed lease stays owned by the caller after verified restoration", (t) => {
  const runner = fixture(t, "accessibility");
  const lease = runner.success("acquire-lease");
  runner.success("snapshot-settings", { lease });
  assert.equal(successful(runner, { lease }).length, 8);
  assert.equal(existsSync(path.join(runner.scratch, "lock")), true);
  runner.success("release-lease", { lease }); released(runner);
});
test("wrong borrowed lease is rejected before instrumentation", (t) => {
  const runner = fixture(t);
  rejected(runner.invoke({ lease: { lease_id: "f".repeat(48), native_execution: "EXECUTED" } }), "lease_invalid");
  assert.equal(runner.readState().instrumentCalls, undefined);
});
test("forged attestation is rejected without native execution", (t) => {
  const runner = fixture(t); runner.attestation.launcher_source_sha256 = "f".repeat(64);
  rejected(runner.invoke(), "attestation_invalid"); assert.equal(runner.readState().instrumentCalls, undefined);
});
test("production module rejects adapter overrides, test markers and unknown request fields", (t) => {
  const runner = fixture(t);
  for (const env of [{ NODE_ENV: "test" }, { V12_NATIVE_ADAPTER_COMMAND: "fake" }, { V12_NATIVE_ADAPTER_TEST_MODE: "1" }, { V12_NATIVE_ADAPTER_TEST_PROCESS: "1" }]) {
    rejected(runner.invoke({}, env), "test_environment_forbidden");
  }
  rejected(runner.invoke({ marker_file: "private" }), "request_invalid");
  rejected(runner.invoke({ workload: {} }), "request_invalid");
  assert.equal(runner.readState().instrumentCalls, undefined);
});
test("missing progress is bounded even when the ADB subprocess never exits", (t) => {
  const runner = fixture(t); runner.updateState({ hang: true });
  const started = Date.now(); rejected(runner.invoke(), "marker_timeout");
  assert.ok(Date.now() - started < 40_000); released(runner);
});
