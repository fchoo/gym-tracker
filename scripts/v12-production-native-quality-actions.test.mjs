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
import { accessibilityEvidence, performanceEvidence } from "./testing/v12-quality-evidence-fixture.mjs";

// Deliberately synthetic transport data. It is never installed, published, or
// presented as measurements. Only the ADB executable is controlled; the module,
// shared runtime, identity/lease checks and schema validators are production code.
const hash = (value) => createHash("sha256").update(value).digest("hex");
const quoted = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const accessibility = (identity) => accessibilityEvidence(identity);
const performance = (identity) => performanceEvidence(identity);

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
const hashValue = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,entry])=>JSON.stringify(key)+':'+canonical(entry)).join(',') + '}' : JSON.stringify(value);
if (command.slice(0,3).join(' ') === 'pm list instrumentation') {
  if (!state.noInstrumentation) process.stdout.write('instrumentation:' + component + ' (target=com.fchoo.gymtracker.devtest)\n');
} else if (command[0] === 'pidof') {
  if (state.processId) process.stdout.write(String(state.processId)); else process.exitCode = 1;
} else if (command[0] === 'getconf' && command[1] === 'CLK_TCK') {
  process.stdout.write('100');
} else if (command[0] === 'cat' && command[1]?.startsWith('/proc/')) {
  process.stdout.write(String(state.processId) + ' (gymtracker) S ' + Array(18).fill('0').join(' ') + ' ' + String(state.processStartTicks));
} else if (command[0] === 'logcat' && command[1] === '-c') {
  state.coldLog = ''; save();
} else if (command[0] === 'logcat' && command.includes('monotonic')) {
  process.stdout.write(state.coldLog ?? '');
} else if (command[0] === 'am' && command[1] === 'force-stop') {
  if (state.failStop) { process.stderr.write('private-device /Users/private bearer'); process.exit(1); }
  state.lastProcessId = state.processId; state.lastProcessStartTicks = state.processStartTicks;
  state.processId = null; state.processStartTicks = null; save();
} else if (command[0] === 'am' && command[1] === 'start') {
  const uri = new URL(command[command.indexOf('-d') + 1]);
  state.coldSequence = (state.coldSequence ?? 0) + 1;
  state.processId = state.reuseProcess ? state.lastProcessId : 3000 + state.coldSequence;
  state.processStartTicks = state.reuseProcess ? state.lastProcessStartTicks : 100000 + state.coldSequence * 100;
  const operation = uri.searchParams.get('operation'); const sequence = Number(uri.searchParams.get('sequence'));
  const nonce = uri.searchParams.get('nonce'); const rootName = 'workout'; const fixtureId = 'phase20-workout-active-r1'; const stateId = 'workout-active-session';
  const callbackUnsigned = {schema_version:1,nonce,action:'performance',operation,sequence,kind:'callback',source:'phase20-quality-workload/v1',monotonic_ms:0.5,
    database_name:'gym-tracker-phase20-quality-'+nonce+'-workout.db',root:rootName,fixture_id:fixtureId,state_id:stateId,configuration_id:'quality-workout-performance-f200',
    sqlite_receipt_sha256:hashValue(state.mutateColdSource && sequence === 2 ? 'source:mutated' : 'source:stable'),payload:{callback_id:'route-ready',callback_count:1,root:rootName,state_id:stateId,rendered_root:rootName}};
  const callback = {...callbackUnsigned,receipt_sha256:hashValue(canonical(callbackUnsigned))};
  const unsigned = {schema_version:1,nonce,action:'performance',operation,sequence,kind:'ready',source:'phase20-quality-workload/v1',monotonic_ms:1,
    database_name:'gym-tracker-phase20-quality-'+nonce+'-workout.db',root:rootName,fixture_id:fixtureId,state_id:stateId,configuration_id:'quality-workout-performance-f200',
    sqlite_receipt_sha256:hashValue(state.mutateColdSource && sequence === 2 ? 'source:mutated' : 'source:stable'),readiness_sha256:hashValue('ready:'+sequence),payload:{root:rootName}};
  const marker = {...unsigned,receipt_sha256:hashValue(canonical(unsigned))}; const readySeconds = state.processStartTicks / 100 + 0.1;
  state.coldLog = (readySeconds - 0.01).toFixed(3) + ' I/ReactNativeJS: GYM_TRACKER_PHASE20_WORKLOAD:' + JSON.stringify(callback) + '\n'
    + readySeconds.toFixed(3) + ' I/ReactNativeJS: GYM_TRACKER_PHASE20_WORKLOAD:' + JSON.stringify(marker) + '\n'; save();
  process.stdout.write('Status: ok\n');
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
  assert.deepEqual(result.samples.ordinary_js_task_ms, runner.measured.performance.samples.ordinary_js_task_ms);
  assert.notDeepEqual(result.samples.cold_launch_to_interactive_ms, runner.measured.performance.samples.cold_launch_to_interactive_ms);
  assert.equal(result.samples.native_receipts.cold_launch_cycles.length, 20);
  assert.equal(new Set(result.samples.native_receipts.cold_launch_cycles.map((cycle) => cycle.source_receipt_sha256)).size, 1);
  assert.equal(new Set(result.samples.native_receipts.cold_launch_cycles.map((cycle) => `${cycle.process_id}:${cycle.process_start_ticks}`)).size, 20);
  assert.equal(new Set(result.samples.native_receipts.cold_launch_cycles.map((cycle) => cycle.route_callback_receipt_sha256)).size, 20);
  assert.equal(result.samples.native_receipts.input_receipts.numeric_edit.length, 100);
  assert.equal(result.samples.native_receipts.input_receipts.rest_control.length, 100);
  assert.equal(result.samples.native_receipts.workload_receipt.set_count, 15_000);
  assert.equal(result.samples.native_receipts.workload_receipt.correction_count, 200);
  const shard = executeV12PerformanceShard({ identity: runner.identity, performance: result });
  assert.equal(shard.summary.calendar_frame_sequences.samples, 100);
  assert.deepEqual(shard.raw_samples.native_receipts, result.samples.native_receipts);
  assert.deepEqual(runner.readState().settings, before); released(runner);
  assert.equal(runner.readState().instrumentCalls, 1);
  assert.equal(result.samples.garmin_sync_normalization.baseline.source, "phase20-current-source-baseline/v1");
});
test("cold launch rejects a clear-task-style cycle which does not restart the app process", (t) => {
  const runner = fixture(t); runner.updateState({ reuseProcess: true, processId: 2500, processStartTicks: 90_000 });
  rejected(runner.invoke(), "cold_process_not_restarted"); released(runner);
});
test("cold launch rejects source mutation between otherwise valid process restarts", (t) => {
  const runner = fixture(t); runner.updateState({ mutateColdSource: true });
  rejected(runner.invoke(), "performance_cold_launch_invalid"); released(runner);
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
  ["missing real command receipt", (p) => { delete p.samples.native_receipts.ordinary_js_receipt.receipt_sha256; }],
  ["private raw payload", (p) => { p.samples.private_payload = "private-native /Users/private"; }],
]) test(`performance rejects ${name}`, (t) => {
  const runner = fixture(t); mutate(runner.measured.performance);
  rejected(runner.invoke(), "performance_[a-z_]+(?:invalid|exceeded)"); released(runner);
});
for (const [name, mutate] of [
  ["absent geometry", (o) => { delete o.targets[0].bounds_dp.width; }],
  ["unreported overlap", (o) => { o.targets[1].bounds_dp.left = 47; }],
  ["out of bounds", (o) => { o.targets[0].bounds_dp.top = 799; }],
  ["unresolved focus", (o) => { o.interactions[0].focus_after = ""; }],
  ["absent IME", (o) => { o.configuration.ime_bounds.top = 800; }],
  ["missing hardware keyboard", (o) => { o.interactions.splice(2, 1); }],
  ["claimed TalkBack", (o) => { o.talkback = true; }],
  ["source mismatch", (o) => { o.source_receipts.source_tree_sha256 = "f".repeat(64); }],
  ["reduced motion changes source", (o) => { o.motion.source_facts_sha256 = "f".repeat(64); }],
  ["static overlap claim", (o) => { o.targets[0].overlap = true; }],
  ["static modal state", (o) => { o.modal.focus_ring_dp = 0; }],
  ["static focus transition", (o) => { o.interactions.forEach((entry) => { entry.focus_after = entry.focus_before; }); }],
  ["static motion callback", (o) => { o.motion.callback_count = 0; }],
  ["missing command receipt", (o) => { delete o.native_receipts.command_receipt_sha256; }],
]) test(`accessibility rejects ${name}`, (t) => {
  const runner = fixture(t, "accessibility"); mutate(runner.measured.observations[0]);
  rejected(runner.invoke(), "accessibility_[a-z_]+invalid"); released(runner);
});
test("accessibility requires all four roots in both motion modes", (t) => {
  const runner = fixture(t, "accessibility"); runner.measured.observations.pop();
  rejected(runner.invoke(), "accessibility_coverage_invalid"); released(runner);
});
test("accessibility rejects shared root readiness hashes", (t) => {
  const runner = fixture(t, "accessibility");
  runner.measured.observations.forEach((observation) => { observation.source_receipts.state_sha256 = hash("shared"); observation.native_receipts.readiness_sha256 = hash("shared"); });
  rejected(runner.invoke(), "accessibility_(?:native_receipts|motion|coverage)_invalid"); released(runner);
});
test("accessibility compares source outcomes across the actual normal and reduced observations", (t) => {
  const runner = fixture(t, "accessibility");
  runner.measured.observations[1].motion.destination = "different";
  rejected(runner.invoke(), "accessibility_motion_invalid"); released(runner);
});
test("warm launch maximum is enforced even when raw spans are valid", (t) => {
  const runner = fixture(t);
  runner.measured.performance.samples.warm_launch_to_interactive_ms[0] = 1001;
  const span = runner.measured.performance.samples.native_receipts.timings.warm_launch_to_interactive_ms.spans[0];
  span.end_ms = span.start_ms + 1001;
  rejected(runner.invoke(), "performance_launch_budget_exceeded"); released(runner);
});
test("timing endpoints cannot be relabelled after collection", (t) => {
  const runner = fixture(t);
  runner.measured.performance.samples.native_receipts.timings.search_after_debounce_ms.endpoint = "idle-loop";
  rejected(runner.invoke(), "performance_timing_invalid"); released(runner);
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
