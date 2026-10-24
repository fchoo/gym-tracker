import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_STAGE_IDS,
} from "./v12-calendar-observation-contract.mjs";
import {
  createV12CalendarProbeInvocation,
  createV12CalendarDeviceSession,
  createV12CalendarStageInvocation,
  collectV12ProductionCalendarStages,
  createV12CalendarProbeReceipt,
  resolveV12CalendarExecutionTools,
  selectV12CalendarProbeReceipt,
  validateProductionCalendarActionRequest,
} from "./v12-production-native-calendar-action.mjs";
import { createV12CalendarArtifactTransport } from "./v12-calendar-artifact-transport.mjs";
import { V12_CALENDAR_REQUIREMENT_DEFINITIONS } from "./v12-calendar-requirement-map.mjs";
import { createV12CalendarMarkerFixture } from "./testing/v12-calendar-observation-fixture.mjs";

const HASH = "a".repeat(64);
const RUN_ID = "phase20-20261015T010203Z-abcdef123456";

function attestation() {
  return {
    schema_version: 1,
    action: "calendar",
    launcher_source_sha256: HASH,
    run_id: RUN_ID,
    build_profile: "development-test",
    suite: "v1.2-acceptance",
    source_tree_sha256: "b".repeat(64),
    apk_sha256: "c".repeat(64),
    installed_apk_sha256: "c".repeat(64),
    apk_signature_sha256: "d".repeat(64),
    device_identity_sha256: "e".repeat(64),
    package: "com.fchoo.gymtracker.devtest",
  };
}

test("Calendar action accepts only exact v1.2 attestation and source flow identity", () => {
  const payload = { run_id: RUN_ID, flow_sha256: HASH, flow_revision: V12_CALENDAR_FLOW_REVISION };
  assert.equal(validateProductionCalendarActionRequest(payload, attestation(), { launcherSourceSha256: HASH }), true);
  for (const mutate of [
    (value) => { value.build_profile = "production"; },
    (value) => { value.suite = "phase16-calendar"; },
    (value) => { value.action = "recovery"; },
    (value) => { value.source_tree_sha256 = "bad"; },
  ]) {
    const changed = structuredClone(attestation());
    mutate(changed);
    assert.throws(() => validateProductionCalendarActionRequest(payload, changed, { launcherSourceSha256: HASH }), /calendar_action_attestation_invalid/u);
  }
  assert.throws(() => validateProductionCalendarActionRequest({ ...payload, expected_outcome: "PASS" }, attestation(), { launcherSourceSha256: HASH }), /calendar_action_request_invalid/u);
});

test("every stage invocation binds a fresh nonce, exact flow identity, and the production Calendar route", () => {
  const invocations = V12_CALENDAR_STAGE_IDS.map((stageId, order) => createV12CalendarStageInvocation({
    stageId,
    order,
    nonce: order.toString(16).padStart(32, "0"),
    flowSha256: HASH,
  }));
  assert.deepEqual(invocations.map(({ stageId }) => stageId), V12_CALENDAR_STAGE_IDS);
  assert.equal(new Set(invocations.map(({ nonce }) => nonce)).size, 35);
  invocations.forEach((invocation, order) => {
    assert.equal(invocation.order, order);
    assert.deepEqual(Object.keys(invocation.variables), [
      "V12_CALENDAR_STAGE", "V12_CALENDAR_NONCE", "V12_CALENDAR_FLOW_SHA256", "V12_CALENDAR_FLOW_REVISION", "V12_CALENDAR_POINTER_DRIVER",
    ]);
    assert.equal(invocation.variables.V12_CALENDAR_STAGE, V12_CALENDAR_STAGE_IDS[order]);
    assert.equal(invocation.variables.V12_CALENDAR_FLOW_REVISION, V12_CALENDAR_FLOW_REVISION);
    assert.doesNotMatch(JSON.stringify(invocation), /phase16|synthetic|expected|\bPASS\b/u);
  });
});

test("every Calendar matrix probe gets its own nonce-bound invocation and receipt", () => {
  const probes = V12_CALENDAR_REQUIREMENT_DEFINITIONS.flatMap((definition) => definition.probe_ids.map((probeId) => ({ definition, probeId })));
  assert.equal(probes.length, 69);
  const invocations = probes.map(({ definition, probeId }, order) => createV12CalendarProbeInvocation({
    definition,
    probeId,
    order,
    nonce: (order + 100).toString(16).padStart(32, "0"),
    flowSha256: HASH,
    fixtureSourceSha256: "f".repeat(64),
  }));
  assert.equal(new Set(invocations.map(({ nonce }) => nonce)).size, probes.length);
  invocations.forEach((invocation, order) => {
    assert.equal(invocation.order, order);
    assert.equal(invocation.probeId, probes[order].probeId);
    assert.equal(invocation.variables.V12_CALENDAR_PROBE, probes[order].probeId);
    assert.equal(invocation.variables.V12_CALENDAR_REQUIREMENT, probes[order].definition.requirement_id);
  });

  const invocation = invocations[0];
  const receipt = createV12CalendarProbeReceipt({
    nonce: invocation.nonce,
    flowSha256: HASH,
    fixtureSourceSha256: "f".repeat(64),
    requirementId: invocation.definition.requirement_id,
    evidenceId: invocation.definition.evidence_id,
    probeId: invocation.probeId,
  });
  const line = `GYM_TRACKER_V12_CALENDAR_PROBE_RECEIPT:${JSON.stringify(receipt)}`;
  assert.deepEqual(selectV12CalendarProbeReceipt({ beforeLogs: "", afterLogs: line, invocation }), receipt);
  assert.throws(() => selectV12CalendarProbeReceipt({ beforeLogs: line, afterLogs: line, invocation }), /calendar_action_probe_receipt_stale/u);
  assert.throws(() => selectV12CalendarProbeReceipt({ beforeLogs: "", afterLogs: `${line}\n${line}`, invocation }), /calendar_action_probe_receipt_duplicate/u);
  assert.throws(() => selectV12CalendarProbeReceipt({ beforeLogs: "", afterLogs: line.replace('"status":"PASS"', '"status":"FAIL"'), invocation }), /calendar_action_probe_receipt_invalid/u);
});

test("the Maestro flow drives all 35 real stages and passes the complete route identity", () => {
  const flow = readFileSync(new URL("../maestro/v1.2/calendar.yaml", import.meta.url), "utf8");
  assert.match(flow, /gymtracker-devtest:\/\/calendar\?phase20CalendarStage=\$\{V12_CALENDAR_STAGE\}&phase20CalendarNonce=\$\{V12_CALENDAR_NONCE\}&phase20CalendarFlowSha256=\$\{V12_CALENDAR_FLOW_SHA256\}&phase20CalendarFlowRevision=\$\{V12_CALENDAR_FLOW_REVISION\}/u);
  assert.doesNotMatch(flow, /PHASE16|synthetic|expected_outcome|\bPASS\b/u);
  for (const id of V12_CALENDAR_STAGE_IDS) {
    assert.equal(flow.split(`V12_CALENDAR_STAGE == '${id}'`).length - 1, 1, id);
  }
  assert.ok((flow.match(/- swipe:/gu) ?? []).length >= 20);
  assert.match(flow, /drag-cancel[\s\S]*?swipe:[\s\S]*?start:[\s\S]*?end:[\s\S]*?duration:/u);
  assert.match(flow, /week-expand-first-row[\s\S]*?calendar-day-2026-10-01/u);
  assert.match(flow, /rotation-during-transition[\s\S]*?setOrientation: LANDSCAPE[\s\S]*?setOrientation: PORTRAIT/u);
  assert.match(flow, /background-during-transition[\s\S]*?pressKey: HOME/u);
  assert.match(flow, /reduced-motion[\s\S]*?calendar-day-2026-10-15/u);
  assert.match(flow, /takeScreenshot: "calendar-\$\{V12_CALENDAR_STAGE\}"/u);
});

test("the requirement flow names every parity row and all high-risk Calendar destinations", () => {
  const flow = readFileSync(new URL("../maestro/v1.2/calendar-requirements.yaml", import.meta.url), "utf8");
  for (const { requirement_id, probe_ids } of V12_CALENDAR_REQUIREMENT_DEFINITIONS) {
    for (const probeId of probe_ids) {
      assert.equal(flow.split(`V12_CALENDAR_REQUIREMENT == '${requirement_id}' && V12_CALENDAR_PROBE == '${probeId}'`).length - 1, 1, `${requirement_id}:${probeId}`);
    }
  }
  for (const identity of ["v12-cal-strength-complete", "v12-cal-strength-partial", "v12-cal-strength-planned", "v12-cal-running-planned", "v12-cal-running-imported"]) assert.match(flow, new RegExp(identity, "u"));
  assert.match(flow, /CAL-13[\s\S]*Collapse day and return to month/u);
  assert.match(flow, /CAL-20'[\s\S]*exercise-disclosure[\s\S]*calendar-exercise-disclosure-v12-exercise[\s\S]*calendar-read-only-set-v12-set-complete/u);
  assert.match(flow, /CAL-21'[\s\S]*loading-empty-error[\s\S]*Loading Calendar[\s\S]*Calendar could not be loaded[\s\S]*Retry Calendar/u);
  assert.match(flow, /CAL-22'[\s\S]*revision-conflict-retry[\s\S]*Correction needs attention[\s\S]*Workout changed elsewhere[\s\S]*Save failed[\s\S]*Workout details/u);
  assert.match(flow, /CAL-23'[\s\S]*management-resume[\s\S]*Resume workout[\s\S]*active-workout[\s\S]*CAL-23'[\s\S]*management-remove-confirmation[\s\S]*Remove from history\?/u);
  assert.match(flow, /GYM_TRACKER_V12_CALENDAR_PROBE_RECEIPT|phase20CalendarProbeReceipt=PASS/u);
});

test("the Calendar action stages every raw trace and realistic screenshot without response retention", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-action-"));
  mkdirSync(path.join(root, "maestro/v1.2"), { recursive: true });
  mkdirSync(path.join(root, "artifacts/native/v1.2", RUN_ID), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const flow = readFileSync(new URL("../maestro/v1.2/calendar.yaml", import.meta.url));
  writeFileSync(path.join(root, "maestro/v1.2/calendar.yaml"), flow);
  const requirementsFlow = readFileSync(new URL("../maestro/v1.2/calendar-requirements.yaml", import.meta.url));
  writeFileSync(path.join(root, "maestro/v1.2/calendar-requirements.yaml"), requirementsFlow);
  mkdirSync(path.join(root, "src/testing"), { recursive: true });
  writeFileSync(path.join(root, "src/testing/phase20CalendarFixture.ts"), "isolated calendar fixture\n");
  const flowSha256 = createHash("sha256").update(flow).digest("hex");
  const invocations = [];
  const driven = [];
  const image = new PNG({ width: 320, height: 480 });
  let random = 0xCA1E2026;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
    image.data[offset] = random & 255;
    image.data[offset + 1] = (random >>> 8) & 255;
    image.data[offset + 2] = (random >>> 16) & 255;
    image.data[offset + 3] = 255;
  }
  image.data.set([155, 71, 11, 255, 255, 255, 255, 255], 0);
  const screenshot = PNG.sync.write(image);
  assert.ok(screenshot.length >= 300 * 1024, `fixture must be realistic-sized, got ${screenshot.length}`);
  const binding = Object.freeze({
    schema_version: 1,
    run_id: RUN_ID,
    execution_origin: "test-controlled/v1",
    request_sha256: "1".repeat(64),
    sdk_binding_sha256: createHash("sha256").update("v12-calendar-test-controlled-sdk-flow/v1").digest("hex"),
    flow_sha256: flowSha256,
    requirements_flow_sha256: createHash("sha256").update(requirementsFlow).digest("hex"),
    fixture_source_sha256: createHash("sha256").update("isolated calendar fixture\n").digest("hex"),
    tool_facts: Object.freeze({ adb_sha256: "2".repeat(64), maestro_sha256: "3".repeat(64), unzip_sha256: "4".repeat(64) }),
  });
  const transport = createV12CalendarArtifactTransport({ root, runId: RUN_ID, binding });
  const createIo = ({ resumed = false } = {}) => ({
    version: () => undefined,
    standalone: () => undefined,
    configureStage: () => { if (resumed) throw new Error("completed units must not execute again"); },
    clearLogs: () => { throw new Error("shared_calendar_log_clear_forbidden"); },
    logs: () => "",
    maestro: (invocation) => { if (resumed) throw new Error("completed units must not execute again"); invocations.push(invocation); return { status: "PASS", xml: "<testsuite><testcase/></testsuite>" }; },
    drive: (driver) => { driven.push(driver); },
    awaitMarker: (_before, invocation) => Promise.resolve(createV12CalendarMarkerFixture(invocation.stageId, invocation.order, flowSha256, invocation.nonce)),
    awaitProbeReceipt: (_before, invocation) => Promise.resolve(createV12CalendarProbeReceipt({
      nonce: invocation.nonce,
      flowSha256: invocation.variables.V12_CALENDAR_REQUIREMENTS_SHA256,
      fixtureSourceSha256: invocation.variables.V12_CALENDAR_FIXTURE_SOURCE_SHA256,
      requirementId: invocation.definition.requirement_id,
      evidenceId: invocation.definition.evidence_id,
      probeId: invocation.probeId,
    })),
    screenshot: () => screenshot,
    uiDump: () => "<hierarchy><node resource-id=\"calendar-month-viewport\" text=\"Calendar isolated fixture\"/></hierarchy>",
  });
  const result = await collectV12ProductionCalendarStages({
    root,
    payload: { run_id: RUN_ID, flow_sha256: flowSha256, flow_revision: V12_CALENDAR_FLOW_REVISION },
    io: createIo(),
    transport,
  });
  assert.deepEqual(result.stages.map(({ id }) => id), V12_CALENDAR_STAGE_IDS);
  assert.deepEqual(result.junit_cases.map(({ id }) => id), V12_CALENDAR_STAGE_IDS);
  assert.equal(invocations.filter(({ kind }) => kind === "stage").length, 35);
  assert.equal(invocations.filter(({ kind }) => kind === "requirement-probe").length, 69);
  assert.equal(new Set(invocations.map(({ nonce }) => nonce)).size, 104);
  assert.equal(driven.length, 21);
  assert.equal(driven.filter(({ protocol }) => protocol === "adb-input-motionevent/v1").length, 20);
  assert.equal(driven.filter(({ protocol }) => protocol === "adb-runtime-toggle/v1").length, 1);
  assert.equal(result.stages.every(({ observation, assertion_results }) => !Object.hasOwn(observation, "status") && assertion_results.length > 0), true);
  assert.equal(result.artifacts.length, 208);
  assert.equal(result.artifacts.every((artifact) => {
    const { relative_path: relativePath, sha256, size_bytes: sizeBytes } = artifact;
    const bytes = transport.readArtifact(artifact);
    assert.equal(Object.hasOwn(artifact, "bytes_base64"), false);
    return /^calendar\/(?:stages|requirements)\//u.test(relativePath)
      && createHash("sha256").update(bytes).digest("hex") === sha256
      && bytes.length === sizeBytes;
  }), true);
  assert.equal(result.requirements.records.length, 23);
  assert.equal(result.requirements.junit_cases.length, 69);
  assert.equal(result.requirements.records.flatMap(({ probe_receipts }) => probe_receipts).length, 69);
  assert.equal(result.requirements.records.every(({ probe_receipts }, requirementOrder) => probe_receipts.every((receipt, probeOrder) => (
    receipt.requirement_id === V12_CALENDAR_REQUIREMENT_DEFINITIONS[requirementOrder].requirement_id
    && receipt.probe_id === V12_CALENDAR_REQUIREMENT_DEFINITIONS[requirementOrder].probe_ids[probeOrder]
    && receipt.status === "PASS"
  ))), true);
  assert.equal(result.requirements.records.every(({ fixture_id, fixture_storage, source_digest_before, source_digest_after }) => fixture_id === "v12-calendar-isolated-facts-v1"
    && fixture_storage === "isolated-in-memory" && source_digest_before === source_digest_after), true);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 4 * 1024 * 1024, "compact Calendar response must remain far below 32 MiB");
  transport.complete(result);
  const resumedTransport = createV12CalendarArtifactTransport({ root, runId: RUN_ID, binding });
  assert.deepEqual(resumedTransport.loadCompleted(), result);
  const resumed = await collectV12ProductionCalendarStages({
    root,
    payload: { run_id: RUN_ID, flow_sha256: flowSha256, flow_revision: V12_CALENDAR_FLOW_REVISION },
    io: createIo({ resumed: true }),
    transport: resumedTransport,
  });
  assert.deepEqual(resumed, result);
});

test("Calendar device commands use only resolver-owned absolute native tools", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-tools-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["adb", "maestro", "unzip"]) writeFileSync(path.join(bin, name), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const tools = resolveV12CalendarExecutionTools({ env: {
    V12_EXECUTION_ORIGIN: "test-controlled/v1",
    V12_ADB_PATH: path.join(bin, "adb"),
    V12_MAESTRO_PATH: path.join(bin, "maestro"),
    V12_UNZIP_PATH: path.join(bin, "unzip"),
  } });
  assert.deepEqual(tools, {
    execution_origin: "test-controlled/v1",
    test_only: true,
    adb: realpathSync(path.join(bin, "adb")),
    maestro: realpathSync(path.join(bin, "maestro")),
    unzip: realpathSync(path.join(bin, "unzip")),
  });

  const runRoot = path.join(root, "artifacts/native/v1.2", RUN_ID);
  mkdirSync(runRoot, { recursive: true });
  writeFileSync(path.join(root, "fixture.apk"), "fixture");
  writeFileSync(path.join(runRoot, "build.json"), JSON.stringify({ build: { apk: { path: "fixture.apk" } } }));
  const commands = [];
  const spawn = (executable, args) => {
    commands.push([executable, ...args]);
    if (executable === tools.maestro) {
      if (args[0] === "sdk-flow") writeFileSync(args[args.indexOf("--junit") + 1], "<testsuite><testcase/></testsuite>");
      return { status: 0, signal: null, error: undefined, stdout: "2.8.0\n", stderr: "" };
    }
    if (executable === tools.unzip && args[0] === "-Z1") return { status: 0, signal: null, error: undefined, stdout: "assets/index.android.bundle\nassets/app.config\n", stderr: "" };
    if (executable === tools.unzip) return { status: 0, signal: null, error: undefined, stdout: JSON.stringify({ android: { package: "com.fchoo.gymtracker.devtest" }, scheme: "gymtracker-devtest", extra: { buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" } }), stderr: "" };
    return { status: 0, signal: null, error: undefined, stdout: "", stderr: "" };
  };
  const session = createV12CalendarDeviceSession(root, RUN_ID, tools, { serial: "device-1", spawn });
  assert.equal(Object.hasOwn(session, "clearLogs"), false);
  session.logs();
  session.version();
  session.standalone();
  assert.equal(session.maestro(createV12CalendarStageInvocation({ stageId: V12_CALENDAR_STAGE_IDS[0], order: 0, nonce: "1".repeat(32), flowSha256: HASH })).status, "PASS");
  const definition = V12_CALENDAR_REQUIREMENT_DEFINITIONS[0];
  assert.equal(session.maestro(createV12CalendarProbeInvocation({ definition, probeId: definition.probe_ids[0], order: 0, nonce: "2".repeat(32), flowSha256: HASH, fixtureSourceSha256: HASH })).status, "PASS");
  session.cleanup();
  assert.deepEqual(commands.map(([executable]) => executable), [tools.adb, tools.maestro, tools.unzip, tools.unzip, tools.maestro, tools.maestro]);
  assert.equal(commands.some((command) => command.includes("-c")), false);
  assert.equal(commands.some((command) => command.includes("test") || command.includes("--test-output-dir")), false);
  assert.equal(commands.filter((command) => command.includes("sdk-flow")).length, 2);
});
