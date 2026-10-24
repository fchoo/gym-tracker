import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import {
  collectV12ProductionCalendarStages,
  createV12CalendarDeviceSession,
  createV12CalendarProbeInvocation,
  createV12CalendarStageInvocation,
  selectV12CalendarProbeReceipt,
  validateProductionCalendarActionRequest,
} from "./v12-production-native-calendar-action.mjs";
import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_STAGE_IDS,
  encodeV12CalendarTerminalMarkerChunks,
} from "./v12-calendar-observation-contract.mjs";
import {
  V12_CALENDAR_PROBE_RECEIPT_MARKER,
  V12_CALENDAR_REQUIREMENT_DEFINITIONS,
  createV12CalendarProbeReceipt,
} from "./v12-calendar-requirement-map.mjs";
import { createV12CalendarMarkerFixture, createV12CalendarObservationResult } from "./testing/v12-calendar-observation-fixture.mjs";

// These are credential-free process fixtures. No native executable is launched,
// and no output from this file is eligible as native acceptance evidence.
const RUN_ID = "phase20-20261015T010203Z-abcdef123456";
const HASH = "a".repeat(64);
const NONCE = "b".repeat(32);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const invocation = () => createV12CalendarStageInvocation({ stageId: V12_CALENDAR_STAGE_IDS[0], order: 0, nonce: NONCE, flowSha256: HASH });
const probeInvocation = () => createV12CalendarProbeInvocation({ definition: V12_CALENDAR_REQUIREMENT_DEFINITIONS[0], probeId: V12_CALENDAR_REQUIREMENT_DEFINITIONS[0].probe_ids[0], order: 0, nonce: NONCE, flowSha256: HASH, fixtureSourceSha256: HASH });
const receiptFor = (input) => createV12CalendarProbeReceipt({ nonce: input.nonce, flowSha256: input.variables.V12_CALENDAR_REQUIREMENTS_SHA256, fixtureSourceSha256: input.variables.V12_CALENDAR_FIXTURE_SOURCE_SHA256, requirementId: input.definition.requirement_id, evidenceId: input.definition.evidence_id, probeId: input.probeId });
const attestation = () => ({ schema_version: 1, action: "calendar", launcher_source_sha256: HASH, run_id: RUN_ID, build_profile: "development-test", suite: "v1.2-acceptance", source_tree_sha256: HASH, apk_sha256: HASH, installed_apk_sha256: HASH, apk_signature_sha256: HASH, device_identity_sha256: HASH, package: "com.fchoo.gymtracker.devtest" });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "calendar-session-test-only-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ["maestro/v1.2/calendar.yaml", "maestro/v1.2/calendar-requirements.yaml", "src/testing/phase20CalendarFixture.ts"]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), `test-only fixture ${file}\n`);
  }
  const tools = { execution_origin: "test-controlled/v1", test_only: true, adb: path.join(root, "fake-adb"), maestro: path.join(root, "fake-maestro"), unzip: path.join(root, "fake-unzip") };
  for (const file of [tools.adb, tools.maestro, tools.unzip]) fs.writeFileSync(file, "never execute this test-only fixture\n");
  fs.mkdirSync(path.join(root, "artifacts/native/v1.2", RUN_ID), { recursive: true });
  fs.writeFileSync(path.join(root, "artifacts/native/v1.2", RUN_ID, "build.json"), JSON.stringify({ build: { apk: { path: "test-only.apk" } } }));
  return { root, tools };
}

function controlledSession(t, options = {}) {
  const { root, tools } = fixture(t);
  const calls = [];
  const state = {
    values: { font_scale: "1.5", accelerometer_rotation: "1", user_rotation: "1", window_animation_scale: "0.5", transition_animation_scale: "0.5", animator_duration_scale: "0.5", airplane_mode_on: "0" },
    size: null, density: null, night: "auto", airplane: "Airplane mode is disabled",
    xml: '<hierarchy><node resource-id="unrelated"/><node resource-id="app/calendar-month-viewport" bounds="[10,20][110,220]"/><node resource-id="calendar-collapse-day" bounds="[0,0][100,100]"/><node resource-id="calendar-day-2026-10-15" bounds="[100,0][200,100]"/></hierarchy>',
    logs: [], junit: "<testsuite><testcase/></testsuite>", version: "2.8.0",
    entries: "assets/index.android.bundle\nassets/app.config\n",
    config: { android: { package: "com.fchoo.gymtracker.devtest" }, scheme: "gymtracker-devtest", extra: { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" } },
  };
  const spawn = (executable, args, commandOptions) => {
    calls.push({ executable, args, options: commandOptions });
    const overridden = options.respond?.({ executable, args, commandOptions, state });
    if (overridden !== undefined) return overridden;
    let stdout = "";
    if (executable === tools.maestro) {
      if (args[0] === "--version") stdout = `${state.version}\n`;
      else if (state.junit !== null) fs.writeFileSync(args[args.indexOf("--output") + 1], state.junit);
    } else if (executable === tools.unzip) stdout = args[0] === "-Z1" ? state.entries : typeof state.config === "string" ? state.config : JSON.stringify(state.config);
    else if (args[2] === "logcat") stdout = state.logs.length > 1 ? state.logs.shift() : state.logs[0] ?? "";
    else if (args[2] === "exec-out") stdout = args[3] === "screencap" ? Buffer.from("test-only binary capture") : state.xml;
    else if (args[2] === "shell" && args.length === 4) {
      const tokens = [...args[3].matchAll(/'([^']*)'/gu)].map((match) => match[1]);
      if (tokens[0] === "settings") {
        if (tokens[1] === "get") stdout = state.values[tokens[3]];
        else if (!options.ignoreWrites) state.values[tokens[3]] = tokens[4];
      } else if (tokens[0] === "wm") {
        const key = tokens[1];
        if (tokens.length === 2) stdout = `Physical ${key}: ${key === "size" ? "1080x2400" : "420"}${state[key] === null ? "" : `\nOverride ${key}: ${state[key]}`}`;
        else if (!options.ignoreWrites) state[key] = tokens[2];
      } else if (tokens[1] === "uimode") {
        if (tokens.length === 3) stdout = `Night mode: ${state.night}`;
        else if (!options.ignoreWrites) state.night = tokens[3];
      } else stdout = state.airplane;
    }
    return { status: 0, signal: null, error: undefined, stdout, stderr: "" };
  };
  const session = createV12CalendarDeviceSession(root, RUN_ID, tools, { serial: "test-device-only", spawn });
  t.after(() => session.cleanup());
  return { root, tools, calls, state, session };
}

test("device session rejects missing serial and unowned tool shapes before any process", (t) => {
  const { root, tools } = fixture(t);
  for (const serial of [undefined, null, "", "   ", 42]) {
    const prior = process.env.V12_DEVICE_SERIAL;
    delete process.env.V12_DEVICE_SERIAL;
    try { assert.throws(() => createV12CalendarDeviceSession(root, RUN_ID, tools, { serial, spawn: () => assert.fail("unexpected process") }), /device_missing/u); }
    finally { if (prior !== undefined) process.env.V12_DEVICE_SERIAL = prior; }
  }
  for (const changed of [null, [], {}, { ...tools, execution_origin: "unknown" }, { ...tools, test_only: false }, { ...tools, adb: "relative" }, { ...tools, maestro: null }]) {
    assert.throws(() => createV12CalendarDeviceSession(root, RUN_ID, changed, { serial: "fixture" }), /toolchain_invalid/u);
  }
  const production = createV12CalendarDeviceSession(root, RUN_ID, { ...tools, execution_origin: "production-attested/v1", test_only: false }, { serial: "fixture" });
  production.cleanup();
});

test("session snapshots settings and verifies both configured viewport sizes", (t) => {
  const { session, state, calls, tools } = controlledSession(t);
  state.values.airplane_mode_on = "null";
  assert.deepEqual(session.settings().size, { physical: "1080x2400", override: null });
  session.configureStage("dev-01-padding");
  assert.deepEqual(session.settings().size, { physical: "1080x2400", override: "720x1600" });
  session.configureStage("requirement");
  assert.equal(session.settings().size.override, "780x1688");
  assert.equal(state.values.font_scale, "1");
  assert.equal(state.night, "no");
  assert.ok(calls.every(({ executable, args }) => executable === tools.adb && args[0] === "-s" && args[1] === "test-device-only"));
});

test("invalid settings, physical geometry, airplane output and night output fail closed", (t) => {
  const { session, state } = controlledSession(t);
  state.values.font_scale = "private invalid text";
  assert.throws(() => session.settings(), /settings_invalid/u);
  state.values.font_scale = "1";
  state.airplane = "unexpected";
  assert.throws(() => session.settings(), /settings_invalid/u);
  state.airplane = "Airplane mode is enabled";
  state.night = "invalid";
  assert.throws(() => session.settings(), /settings_invalid/u);
  state.night = "custom";
  state.size = "0x1600";
  assert.throws(() => session.settings(), /settings_invalid/u);
});

test("configuration verifies each setting instead of trusting successful writes", async (t) => {
  for (const [field, value] of [["font_scale", "2"], ["accelerometer_rotation", "1"], ["user_rotation", "1"], ["size", "800x1800"], ["density", "421"], ["night", "yes"], ["window_animation_scale", "0"], ["transition_animation_scale", "0"], ["animator_duration_scale", "0"]]) {
    await t.test(field, (st) => {
      const { session, state } = controlledSession(st, { ignoreWrites: true });
      Object.assign(state.values, { font_scale: "1", accelerometer_rotation: "0", user_rotation: "0", window_animation_scale: "1", transition_animation_scale: "1", animator_duration_scale: "1" });
      Object.assign(state, { size: "780x1688", density: "320", night: "no" });
      if (Object.hasOwn(state, field)) state[field] = value; else state.values[field] = value;
      assert.throws(() => session.configureStage("requirement"), /settings_invalid/u);
    });
  }
});

test("pointer driver projects forward, backward and vertical input onto exact viewport bounds", (t) => {
  const { session, calls } = controlledSession(t);
  t.mock.method(Atomics, "wait", () => "timed-out");
  for (const ratio of [-0.25, 0.25, 0]) session.drive({ protocol: "adb-input-motionevent/v1", sequences: [{ points: [{ action: "DOWN", offset_ms: 0, dx_ratio: 0, dy_ratio: 0 }, { action: "MOVE", offset_ms: 10, dx_ratio: ratio, dy_ratio: 0.1 }] }] });
  const points = calls.filter(({ args }) => args[4] === "motionevent").map(({ args }) => args.slice(5));
  assert.deepEqual(points, [["DOWN", "90", "120"], ["MOVE", "65", "140"], ["DOWN", "30", "120"], ["MOVE", "55", "140"], ["DOWN", "60", "120"], ["MOVE", "60", "140"]]);
  const before = calls.length;
  session.drive({ protocol: "maestro/v1" });
  assert.equal(calls.length, before);
});

test("runtime toggle uses bounded tap centers and disables all animation scales", (t) => {
  const { session, calls, state } = controlledSession(t);
  t.mock.method(Atomics, "wait", () => "timed-out");
  session.drive({ protocol: "adb-runtime-toggle/v1" });
  assert.deepEqual(calls.filter(({ args }) => args[4] === "tap").map(({ args }) => args.slice(5)), [["50", "50"], ["150", "50"]]);
  for (const key of ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]) assert.equal(state.values[key], "0");
});

test("missing, reversed and degenerate bounds reject pointer input", (t) => {
  const { session, state, calls } = controlledSession(t);
  for (const xml of ["<hierarchy/>", '<node resource-id="calendar-month-viewport"/>', '<node resource-id="calendar-month-viewport" bounds="[10,20][10,220]"/>', '<node resource-id="calendar-month-viewport" bounds="[-1,20][110,10]"/>']) {
    state.xml = xml;
    assert.throws(() => session.drive({ protocol: "adb-input-motionevent/v1", sequences: [] }), /viewport_bounds_invalid/u);
  }
  assert.equal(calls.some(({ args }) => args.includes("motionevent")), false);
});

test("binary capture and JUnit reports retain isolated file permissions and clean up", (t) => {
  const { session, calls, state } = controlledSession(t);
  assert.deepEqual(session.screenshot(), Buffer.from("test-only binary capture"));
  assert.equal(calls.at(-1).options.encoding, undefined);
  assert.equal(session.uiDump(), state.xml);
  const dir = session.temporary();
  assert.equal(session.temporary(), dir);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  assert.deepEqual(session.maestro(invocation()), { status: "PASS", xml: state.junit });
  const report = calls.at(-1).args[calls.at(-1).args.indexOf("--output") + 1];
  assert.equal(fs.statSync(report).mode & 0o777, 0o600);
  state.junit = null;
  assert.throws(() => session.maestro({ ...invocation(), order: 2 }), /junit_missing/u);
  session.cleanup();
  assert.equal(fs.existsSync(dir), false);
});

test("temporary path guard rejects symbolic links and non-directories", (t) => {
  const original = fs.lstatSync;
  for (const symbolic of [true, false]) {
    const { session } = controlledSession(t);
    const replacement = t.mock.method(fs, "lstatSync", (file, ...args) => String(file).includes(`v12-calendar-${RUN_ID}-`) ? { isSymbolicLink: () => symbolic, isDirectory: () => false } : original(file, ...args));
    syncBuiltinESMExports();
    try { assert.throws(() => session.temporary(), /temporary_path_invalid/u); }
    finally { replacement.mock.restore(); syncBuiltinESMExports(); session.cleanup(); }
  }
});

test("subprocess failures and whole-session deadline reject unsafe continuation", (t) => {
  for (const result of [{ error: new Error("private tool failure"), status: 0 }, { signal: "SIGTERM", status: 0 }, { status: 7 }]) {
    const { session } = controlledSession(t, { respond: () => result });
    assert.throws(() => session.logs(), /^Error: calendar_action_native_prerequisite_failed$/u);
  }
  const { session } = controlledSession(t);
  t.mock.method(Date, "now", () => Number.MAX_SAFE_INTEGER);
  assert.throws(() => session.logs(), /calendar_action_timeout/u);
});

test("Maestro can report test failure but cannot bypass version or packaging guards", (t) => {
  const { session, state } = controlledSession(t);
  state.version = "2.7.0";
  assert.throws(() => session.version(), /maestro_version_invalid/u);
  state.entries = "assets/app.config\n";
  assert.throws(() => session.standalone(), /standalone_required/u);
  state.entries = "assets/index.android.bundle\nassets/app.config\nassets/app.config\n";
  assert.throws(() => session.standalone(), /standalone_required/u);
  state.entries = "assets/index.android.bundle\nassets/app.config\n";
  state.config = "{invalid";
  assert.throws(() => session.standalone(), /standalone_required/u);
  for (const config of [null, {}, { android: { package: "other" } }, { android: { package: "com.fchoo.gymtracker.devtest" }, scheme: "other" }, { android: { package: "com.fchoo.gymtracker.devtest" }, scheme: "gymtracker-devtest", extra: {} }]) {
    state.config = config;
    assert.throws(() => session.standalone(), /standalone_required/u);
  }
  state.junit = "<testsuite><testcase><failure/></testcase></testsuite>";
  assert.equal(session.maestro(invocation()).status, "FAIL");
});

test("a nonzero Maestro exit returns its failed JUnit outcome without hiding tool faults", (t) => {
  const xml = "<testsuite><testcase><failure/></testcase></testsuite>";
  const { session } = controlledSession(t, { respond: ({ executable, args }) => {
    if (!executable.endsWith("fake-maestro")) return undefined;
    fs.writeFileSync(args[args.indexOf("--output") + 1], xml);
    return { status: 1, signal: null, error: undefined, stdout: "", stderr: "test-only failed testcase" };
  } });
  assert.deepEqual(session.maestro(invocation()), { status: "FAIL", xml });
});

test("marker polling retries only missing nonce data and rejects stale or malformed markers", async (t) => {
  const { session, state } = controlledSession(t);
  const input = invocation();
  const marker = createV12CalendarMarkerFixture(input.stageId, input.order, HASH, NONCE);
  const logs = encodeV12CalendarTerminalMarkerChunks(marker).join("\n");
  state.logs = ["", logs];
  assert.deepEqual(await session.awaitMarker("", input), marker);
  state.logs = [logs];
  await assert.rejects(session.awaitMarker(logs, input), /pre_stage_marker/u);
  state.logs = ["GYM_TRACKER_V12_CALENDAR_CHUNK:{invalid"];
  await assert.rejects(session.awaitMarker("", input), /chunk_json_invalid/u);
});

test("probe polling retries missing receipt and rejects stale nonce receipt", async (t) => {
  const { session, state } = controlledSession(t);
  const input = probeInvocation();
  const receipt = receiptFor(input);
  const logs = `${V12_CALENDAR_PROBE_RECEIPT_MARKER}${JSON.stringify(receipt)}`;
  state.logs = ["", logs];
  assert.deepEqual(await session.awaitProbeReceipt("", input), receipt);
  state.logs = [logs];
  await assert.rejects(session.awaitProbeReceipt(logs, input), /probe_receipt_stale/u);
});

test("marker and probe receipt polling enforce their bounded sixty-second window", async (t) => {
  for (const kind of ["marker", "probe"]) {
    const { session, state } = controlledSession(t);
    state.logs = [""];
    let ticks = 0;
    const time = t.mock.method(Date, "now", () => ticks++ * 30_000);
    try {
      await assert.rejects(kind === "marker" ? session.awaitMarker("", invocation()) : session.awaitProbeReceipt("", probeInvocation()), new RegExp(kind === "marker" ? "marker_timeout" : "probe_receipt_timeout", "u"));
    } finally { time.mock.restore(); }
  }
});

test("exact action and invocation identities reject malformed optional values", () => {
  const payload = { run_id: RUN_ID, flow_sha256: HASH, flow_revision: V12_CALENDAR_FLOW_REVISION };
  for (const changed of [null, [], { ...attestation(), schema_version: 2 }, { ...attestation(), launcher_source_sha256: "b".repeat(64) }, { ...attestation(), run_id: "invalid" }, { ...attestation(), package: "wrong" }, { ...attestation(), apk_sha256: undefined }]) assert.throws(() => validateProductionCalendarActionRequest(payload, changed, { launcherSourceSha256: HASH }), /attestation_invalid/u);
  for (const changed of [null, [], 3, { ...payload, flow_sha256: undefined }, { ...payload, flow_revision: "invalid" }]) {
    const proof = { ...attestation(), run_id: changed?.run_id };
    if (changed?.run_id === undefined) proof.run_id = RUN_ID;
    assert.throws(() => validateProductionCalendarActionRequest(changed, proof, { launcherSourceSha256: HASH }), /(?:attestation|request)_invalid/u);
  }
  for (const changed of [{ ...invocation(), stageId: "invalid" }, { ...invocation(), nonce: undefined }, { ...invocation(), flowSha256: undefined }]) assert.throws(() => createV12CalendarStageInvocation({ stageId: V12_CALENDAR_STAGE_IDS[0], order: 0, nonce: NONCE, flowSha256: HASH, ...changed }), /stage_identity_invalid/u);
  const valid = { definition: V12_CALENDAR_REQUIREMENT_DEFINITIONS[0], probeId: V12_CALENDAR_REQUIREMENT_DEFINITIONS[0].probe_ids[0], order: 0, nonce: NONCE, flowSha256: HASH, fixtureSourceSha256: HASH };
  for (const changed of [{ definition: {} }, { probeId: "unknown" }, { order: 0.1 }, { order: -1 }, { nonce: undefined }, { flowSha256: undefined }, { fixtureSourceSha256: undefined }]) assert.throws(() => createV12CalendarProbeInvocation({ ...valid, ...changed }), /requirement_identity_invalid/u);
  const input = probeInvocation();
  for (const beforeLogs of [null, "x".repeat(8 * 1024 * 1024 + 1), `${V12_CALENDAR_PROBE_RECEIPT_MARKER}{bad`]) assert.throws(() => selectV12CalendarProbeReceipt({ beforeLogs, afterLogs: "", invocation: input }), /probe_receipt_(?:logs_invalid|invalid)/u);
  assert.throws(() => selectV12CalendarProbeReceipt({ beforeLogs: "unrelated log", afterLogs: "", invocation: input }), /probe_receipt_missing/u);
});

function collectionHarness(t) {
  const { root } = fixture(t);
  const flowSha256 = hash(fs.readFileSync(path.join(root, "maestro/v1.2/calendar.yaml")));
  const stages = createV12CalendarObservationResult(flowSha256);
  const image = new PNG({ width: 2, height: 1 }); image.data.set([155, 71, 11, 255, 255, 255, 255, 255]);
  const png = PNG.sync.write(image);
  const io = { version() {}, standalone() {}, configureStage() {}, logs: () => "", maestro: () => ({ status: "PASS" }), drive() {}, awaitMarker: (_before, input) => Promise.resolve(createV12CalendarMarkerFixture(input.stageId, input.order, flowSha256, input.nonce)), awaitProbeReceipt: (_before, input) => Promise.resolve(receiptFor(input)), screenshot: () => png, uiDump: () => '<node text="isolated fixture"/>' };
  const transport = { resumeUnit: ({ kind, ordinal }) => kind === "stage" ? { payload: { stage: stages.stages[ordinal], junit: stages.junit_cases[ordinal] }, artifacts: [] } : undefined, appendUnit: (unit) => ({ payload: unit.payload, artifacts: [] }) };
  const payload = { run_id: RUN_ID, flow_sha256: flowSha256, flow_revision: V12_CALENDAR_FLOW_REVISION };
  return { root, payload, io, transport };
}

test("collection rejects wrong source flow, absent transport and non-callable transport methods", async (t) => {
  const input = collectionHarness(t);
  await assert.rejects(collectV12ProductionCalendarStages({ ...input, payload: { ...input.payload, flow_sha256: HASH } }), /flow_invalid/u);
  await assert.rejects(collectV12ProductionCalendarStages({ ...input, payload: { ...input.payload, flow_revision: "wrong" } }), /flow_invalid/u);
  for (const transport of [null, {}, { resumeUnit() {}, appendUnit: null }]) await assert.rejects(collectV12ProductionCalendarStages({ ...input, transport }), /transport_invalid/u);
});

test("stage and requirement captures reject invalid PNG headers or dimensions", async (t) => {
  const input = collectionHarness(t);
  const png = input.io.screenshot();
  const wrongSignature = Buffer.from(png); wrongSignature[0] = 0;
  const wrongHeader = Buffer.from(png); wrongHeader.write("NOPE", 12);
  const zeroWidth = Buffer.from(png); zeroWidth.writeUInt32BE(0, 16);
  const zeroHeight = Buffer.from(png); zeroHeight.writeUInt32BE(0, 20);
  for (const bytes of ["not a Buffer", Buffer.alloc(2), wrongSignature, wrongHeader, zeroWidth, zeroHeight]) {
    await assert.rejects(collectV12ProductionCalendarStages({ ...input, transport: { ...input.transport, resumeUnit: () => undefined }, io: { ...input.io, screenshot: () => bytes } }), /screenshot_invalid/u);
  }
  await assert.rejects(collectV12ProductionCalendarStages({ ...input, io: { ...input.io, screenshot: () => Buffer.alloc(0) } }), /screenshot_invalid/u);
});

test("requirement traces reject empty, excessive or private content", async (t) => {
  const input = collectionHarness(t);
  for (const trace of ["", "x".repeat(8 * 1024 * 1024 + 1), '<node password="true"/>', '<node text="private@example.invalid"/>']) await assert.rejects(collectV12ProductionCalendarStages({ ...input, io: { ...input.io, uiDump: () => trace } }), /privacy_scan_failed/u);
});

// A fresh child process permits module-boundary mocks without affecting the
// original seven cases, shared dependencies, real native tools, or process env.
async function executeFixtureCase(scenario, fileUrl) {
  const assert = (await import("node:assert/strict")).default;
  const fs = await import("node:fs");
  const path = (await import("node:path")).default;
  const { tmpdir } = await import("node:os");
  const { createHash } = await import("node:crypto");
  const { mock } = await import("node:test");
  const processBoundary = await import("node:child_process");
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const root = fs.mkdtempSync(path.join(tmpdir(), "calendar-action-test-only-"));
  const originalCwd = process.cwd();
  const runId = "phase20-20261015T010203Z-abcdef123456";
  const actionUrl = new URL("./v12-production-native-calendar-action.mjs", fileUrl);
  const launcherUrl = new URL("./v12-production-native-adapter-launcher.mjs", fileUrl);
  const contracts = await import(new URL("./v12-calendar-observation-contract.mjs", fileUrl));
  const requirements = await import(new URL("./v12-calendar-requirement-map.mjs", fileUrl));
  const fixtures = await import(new URL("./testing/v12-calendar-observation-fixture.mjs", fileUrl));
  const artifacts = await import(new URL("./v12-calendar-artifact-transport.mjs", fileUrl));
  const executionOrigin = await import(new URL("./v12-native-execution-origin.mjs", fileUrl));
  const nativeRuntime = await import(new URL("./v12-production-native-runtime.mjs", fileUrl));
  const events = [];
  const tools = { execution_origin: "test-controlled/v1", test_only: true };
  for (const name of ["adb", "maestro", "unzip"]) { tools[name] = path.join(root, `fake-${name}`); fs.writeFileSync(tools[name], "test fixture; never execute\n"); }
  for (const file of ["maestro/v1.2/calendar.yaml", "maestro/v1.2/calendar-requirements.yaml", "src/testing/phase20CalendarFixture.ts"]) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), `test-only ${file}\n`); }
  fs.mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  fs.writeFileSync(path.join(root, "artifacts/native/v1.2", runId, "build.json"), JSON.stringify({ build: { apk: { path: "test-only.apk" } } }));
  const digest = "a".repeat(64);
  const proof = { schema_version: 1, action: "calendar", launcher_source_sha256: hash(fs.readFileSync(launcherUrl)), run_id: runId, build_profile: "development-test", suite: "v1.2-acceptance", source_tree_sha256: digest, apk_sha256: digest, installed_apk_sha256: digest, apk_signature_sha256: digest, device_identity_sha256: digest, package: "com.fchoo.gymtracker.devtest" };
  const payload = { run_id: runId, flow_sha256: hash(fs.readFileSync(path.join(root, "maestro/v1.2/calendar.yaml"))), flow_revision: contracts.V12_CALENDAR_FLOW_REVISION };
  const lease = { lease_id: "test-only-lease" };
  const runtime = {
    acquireLease() { events.push("acquire"); return lease; },
    snapshotSettings(value) { assert.equal(value, lease); events.push("snapshot"); if (scenario === "snapshot-failed") throw new Error("calendar_action_settings_invalid"); return { testOnly: "settings" }; },
    restoreSettings() { events.push("restore"); if (scenario === "restore-failed") throw new Error("calendar_action_settings_invalid"); },
    releaseLease() { events.push("release"); },
    async withLease(input, operation) { assert.equal(input.lease, lease); events.push("withLease"); return operation(); },
    snapshotCalendarSettings() { events.push("calendar-snapshot"); return { testOnly: "calendar-settings" }; },
    restoreCalendarSettings() { events.push("calendar-restore"); if (scenario === "calendar-restore-failed") throw new Error("calendar_action_settings_invalid"); },
  };
  const result = fixtures.createV12CalendarObservationResult(payload.flow_sha256);
  const resumed = Object.freeze({ testOnly: "completed-fixture" });
  let completed;
  mock.module(new URL("./v12-native-execution-origin.mjs", fileUrl).href, { namedExports: { ...executionOrigin, resolveV12NativeExecutionTools: () => tools } });
  mock.module(new URL("./v12-production-native-runtime.mjs", fileUrl).href, { namedExports: { ...nativeRuntime, createProductionNativeRuntime: () => {
    events.push("runtime");
    if (scenario === "preserved-error") throw new Error("v12_production_native_launcher_calendar_existing_failure");
    if (scenario === "unknown-error") throw { privateData: "never disclose" };
    if (scenario === "generic-error") throw new Error("private unknown details");
    return runtime;
  } } });
  mock.module(new URL("./v12-calendar-artifact-transport.mjs", fileUrl).href, { namedExports: { ...artifacts, createV12CalendarArtifactTransport: ({ binding }) => {
    assert.equal(binding.execution_origin, "test-controlled/v1");
    assert.equal(binding.request_sha256, hash(JSON.stringify({ attestation: proof, run_id: payload.run_id, flow_sha256: payload.flow_sha256, flow_revision: payload.flow_revision })));
    return { loadCompleted: () => scenario === "resumed" ? resumed : null,
      resumeUnit: ({ kind, ordinal, key }) => {
        if (scenario === "collect-failed") throw new Error("calendar_observation_marker_invalid");
        if (kind === "stage") return { payload: { stage: result.stages[ordinal], junit: result.junit_cases[ordinal] }, artifacts: [] };
        const [requirementId, probeId] = key.split(":");
        const definition = requirements.V12_CALENDAR_REQUIREMENT_DEFINITIONS.find((item) => item.requirement_id === requirementId);
        const receipt = requirements.createV12CalendarProbeReceipt({ nonce: ordinal.toString(16).padStart(32, "0"), flowSha256: binding.requirements_flow_sha256, fixtureSourceSha256: binding.fixture_source_sha256, requirementId, evidenceId: definition.evidence_id, probeId });
        return { payload: { receipt, junit: { id: key, status: "PASS" } }, artifacts: [] };
      }, appendUnit() { assert.fail("completed test units must not rerun"); }, complete(value) { events.push("complete"); completed = value; if (scenario === "complete-failed") throw new Error("calendar_action_transport_invalid"); } };
  } } });
  mock.module("node:child_process", { namedExports: { ...processBoundary, spawnSync(executable, args) {
    assert.ok([tools.maestro, tools.unzip].includes(executable), "native process forbidden in fixture");
    if (executable === tools.maestro) return { status: 0, stdout: "2.8.0\n" };
    if (args[0] === "-Z1") return { status: 0, stdout: "assets/index.android.bundle\nassets/app.config\n" };
    return { status: 0, stdout: JSON.stringify({ android: { package: "com.fchoo.gymtracker.devtest" }, scheme: "gymtracker-devtest", extra: { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" } }) };
  } } });
  process.chdir(root);
  process.env.V12_DEVICE_SERIAL = "test-only-device";
  for (const key of ["NODE_ENV", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "V12_NATIVE_ADAPTER_COMMAND"]) delete process.env[key];
  if (scenario.startsWith("forbidden:")) { const key = scenario.slice(10); process.env[key] = key === "NODE_ENV" ? "test" : ""; }
  if (scenario === "borrowed") payload.lease = lease;
  try {
    const { executeProductionCalendarAction } = await import(actionUrl);
    if (["success", "borrowed", "resumed"].includes(scenario)) {
      const output = await executeProductionCalendarAction(payload, proof);
      if (scenario === "resumed") { assert.equal(output, resumed); assert.deepEqual(events, ["runtime", "acquire", "snapshot", "withLease", "restore", "release"]); }
      else {
        assert.equal(output, completed);
        assert.equal(output.native_receipt.stage_count, 35);
        assert.equal(output.native_receipt.requirement_count, 23);
        assert.equal(output.native_receipt.probe_count, 69);
        assert.equal(output.native_receipt.evidence_set_sha256, hash(JSON.stringify({ stages: output.stages, requirements: output.requirements, artifacts: [] })));
        assert.deepEqual(events.slice(-3), scenario === "borrowed" ? ["calendar-snapshot", "complete", "calendar-restore"] : ["calendar-restore", "restore", "release"]);
        if (scenario === "borrowed") assert.equal(events.includes("acquire") || events.includes("restore") || events.includes("release"), false);
      }
    } else {
      const expected = scenario.startsWith("forbidden:") ? "v12_production_native_launcher_calendar_action_test_environment_forbidden"
        : scenario === "preserved-error" ? "v12_production_native_launcher_calendar_existing_failure"
        : ["unknown-error", "generic-error"].includes(scenario) ? "v12_production_native_launcher_calendar_calendar_action_failed"
        : scenario === "collect-failed" ? "v12_production_native_launcher_calendar_observation_marker_invalid"
        : scenario === "complete-failed" ? "v12_production_native_launcher_calendar_action_transport_invalid"
        : "v12_production_native_launcher_calendar_action_settings_invalid";
      await assert.rejects(executeProductionCalendarAction(payload, proof), (error) => error.message === expected);
      if (["collect-failed", "complete-failed", "calendar-restore-failed"].includes(scenario)) assert.deepEqual(events.slice(-3), ["calendar-restore", "restore", "release"]);
      if (scenario === "snapshot-failed") assert.deepEqual(events, ["runtime", "acquire", "snapshot"]);
      if (scenario === "restore-failed") { assert.equal(events.at(-1), "restore"); assert.equal(events.includes("release"), false); }
      if (scenario.startsWith("forbidden:")) assert.equal(events.length, 0);
    }
  } finally { process.chdir(originalCwd); fs.rmSync(root, { recursive: true, force: true }); }
}

for (const scenario of ["success", "borrowed", "resumed", "snapshot-failed", "collect-failed", "complete-failed", "calendar-restore-failed", "restore-failed", "preserved-error", "unknown-error", "generic-error", ...["NODE_ENV", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "V12_NATIVE_ADAPTER_COMMAND"].map((key) => `forbidden:${key}`)]) {
  test(`action lifecycle isolates ${scenario} and preserves native authority guards`, () => {
    const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "--eval", `await (${executeFixtureCase.toString()})(${JSON.stringify(scenario)}, ${JSON.stringify(import.meta.url)});`], { encoding: "utf8", timeout: 30_000, env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    assert.equal(child.error, undefined);
    assert.equal(child.signal, null);
    assert.equal(child.status, 0, child.stderr);
  });
}
