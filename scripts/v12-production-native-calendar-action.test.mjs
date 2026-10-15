import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_STAGE_IDS,
} from "./v12-calendar-observation-contract.mjs";
import {
  createV12CalendarStageInvocation,
  collectV12ProductionCalendarStages,
  validateProductionCalendarActionRequest,
} from "./v12-production-native-calendar-action.mjs";
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
      "V12_CALENDAR_STAGE", "V12_CALENDAR_NONCE", "V12_CALENDAR_FLOW_SHA256", "V12_CALENDAR_FLOW_REVISION",
    ]);
    assert.equal(invocation.variables.V12_CALENDAR_STAGE, V12_CALENDAR_STAGE_IDS[order]);
    assert.equal(invocation.variables.V12_CALENDAR_FLOW_REVISION, V12_CALENDAR_FLOW_REVISION);
    assert.doesNotMatch(JSON.stringify(invocation), /phase16|synthetic|expected|\bPASS\b/u);
  });
});

test("the Maestro flow drives all 35 real stages and passes the complete route identity", () => {
  const flow = readFileSync(new URL("../maestro/v1.2/calendar.yaml", import.meta.url), "utf8");
  assert.match(flow, /gymtracker-devtest:\/\/calendar\?phase20CalendarStage=\$\{V12_CALENDAR_STAGE\}&phase20CalendarNonce=\$\{V12_CALENDAR_NONCE\}&phase20CalendarFlowSha256=\$\{V12_CALENDAR_FLOW_SHA256\}&phase20CalendarFlowRevision=\$\{V12_CALENDAR_FLOW_REVISION\}/u);
  assert.doesNotMatch(flow, /PHASE16|synthetic|expected_outcome|\bPASS\b/u);
  for (const id of V12_CALENDAR_STAGE_IDS) {
    assert.equal(flow.split(`V12_CALENDAR_STAGE == '${id}'`).length - 1, 1, id);
  }
  assert.ok((flow.match(/- swipe:/gu) ?? []).length >= 21);
  assert.match(flow, /drag-cancel[\s\S]*?swipe:[\s\S]*?start:[\s\S]*?end:[\s\S]*?duration:/u);
  assert.match(flow, /week-expand-first-row[\s\S]*?calendar-day-2026-10-01/u);
  assert.match(flow, /rotation-during-transition[\s\S]*?setOrientation: LANDSCAPE[\s\S]*?setOrientation: PORTRAIT/u);
  assert.match(flow, /background-during-transition[\s\S]*?pressKey: HOME/u);
  assert.match(flow, /reduced-motion[\s\S]*?calendar-day-2026-10-15/u);
  assert.match(flow, /takeScreenshot: "calendar-\$\{V12_CALENDAR_STAGE\}"/u);
});

test("the Calendar action collects every stage in order and retains raw traces and screenshots", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-action-"));
  const retained = path.join(root, "retained");
  mkdirSync(path.join(root, "maestro/v1.2"), { recursive: true });
  mkdirSync(retained);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const flow = readFileSync(new URL("../maestro/v1.2/calendar.yaml", import.meta.url));
  writeFileSync(path.join(root, "maestro/v1.2/calendar.yaml"), flow);
  const flowSha256 = createHash("sha256").update(flow).digest("hex");
  const invocations = [];
  const result = await collectV12ProductionCalendarStages({
    root,
    payload: { run_id: RUN_ID, flow_sha256: flowSha256, flow_revision: V12_CALENDAR_FLOW_REVISION },
    io: {
      version: () => undefined,
      standalone: () => undefined,
      configureStage: () => undefined,
      clearLogs: () => undefined,
      logs: () => "",
      maestro: (invocation) => { invocations.push(invocation); return { status: "PASS", xml: "<testsuite><testcase/></testsuite>" }; },
      awaitMarker: (_before, invocation) => Promise.resolve(createV12CalendarMarkerFixture(invocation.stageId, invocation.order, flowSha256, invocation.nonce)),
      screenshot: () => Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1EAAAAASUVORK5CYII=", "base64"),
      temporary: () => retained,
    },
  });
  assert.deepEqual(result.stages.map(({ id }) => id), V12_CALENDAR_STAGE_IDS);
  assert.deepEqual(result.junit_cases.map(({ id }) => id), V12_CALENDAR_STAGE_IDS);
  assert.equal(invocations.length, 35);
  assert.equal(new Set(invocations.map(({ nonce }) => nonce)).size, 35);
  assert.equal(result.stages.every(({ observation, assertion_results }) => !Object.hasOwn(observation, "status") && assertion_results.length > 0), true);
  assert.equal(result.artifacts.length, 70);
  assert.equal(result.artifacts.every(({ relative_path, sha256, size_bytes, bytes_base64 }) => {
    const bytes = Buffer.from(bytes_base64, "base64");
    return relative_path.startsWith("calendar/stages/")
      && createHash("sha256").update(bytes).digest("hex") === sha256
      && bytes.length === size_bytes;
  }), true);
  assert.equal(readdirSync(retained).length, 70);
});
