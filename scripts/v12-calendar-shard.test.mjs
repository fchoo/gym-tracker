import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PNG } from "pngjs";

import {
  analyzeV12CalendarScreenshot,
  deriveV12CalendarStageResult,
  V12_CALENDAR_FLOW_REVISION,
} from "./v12-calendar-observation-contract.mjs";
import {
  executeV12CalendarShard,
  executeV12CalendarShardCli,
  parseV12CalendarShardCliArgs,
  validateV12CalendarShard,
  V12_CALENDAR_SHARD_STAGE_IDS,
} from "./v12-calendar-shard.mjs";
import { createV12CalendarObservationResult } from "./testing/v12-calendar-observation-fixture.mjs";
import { createV12CalendarProbeReceipt, V12_CALENDAR_REQUIREMENT_DEFINITIONS } from "./v12-calendar-requirement-map.mjs";

const observation = Object.freeze({
  sourceDigest: "a".repeat(64),
  nativeExecution: "NOT_RUN",
  samples: [
    { timestampMs: 1, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "November 2026", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "2026-11-01", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar-day-2026-11-01", motion: "normal" },
    { timestampMs: 2, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "November 2026", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "2026-11-01", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar-day-2026-11-01", motion: "normal" },
  ],
});

const productionOrigin = Object.freeze({
  schema_version: 1,
  action: "calendar",
  kind: "production-default-launcher",
  default_launcher: true,
  test_only: false,
  adapter_source_sha256: "6".repeat(64),
  launcher_source_sha256: "7".repeat(64),
  domain_source_sha256: "9".repeat(64),
  request_attestation_sha256: "8".repeat(64),
});
const productionResult = (flowSha256) => {
  const fixture = createV12CalendarObservationResult(flowSha256);
  const image = new PNG({ width: 2, height: 1 });
  image.data.set([155, 71, 11, 255, 255, 255, 255, 255]);
  const png = PNG.sync.write(image);
  const pngSha256 = createHash("sha256").update(png).digest("hex");
  const stages = fixture.stages.map((stage, order) => {
    const nonce = order.toString(16).padStart(32, "0");
    return deriveV12CalendarStageResult({
      marker: { schema_version: 1, nonce, kind: "calendar", flow_sha256: flowSha256, flow_revision: V12_CALENDAR_FLOW_REVISION, stage: stage.observation },
      expected: { nonce, flowSha256, stageId: stage.id, order }, driver: stage.driver,
      captureMeasurement: analyzeV12CalendarScreenshot(stage.id, png), screenshotSha256: pngSha256, traceSha256: stage.trace_sha256,
    });
  });
  const stageArtifacts = stages.flatMap((stage) => {
    const trace = Buffer.from(JSON.stringify(stage.observation));
    return [
      { stage_id: stage.id, kind: "png", relative_path: `calendar/stages/${String(stage.order).padStart(2, "0")}-${stage.id}.png`, sha256: createHash("sha256").update(png).digest("hex"), size_bytes: png.length, bytes_base64: png.toString("base64") },
      { stage_id: stage.id, kind: "trace", relative_path: `calendar/stages/${String(stage.order).padStart(2, "0")}-${stage.id}.trace.json`, sha256: createHash("sha256").update(trace).digest("hex"), size_bytes: trace.length, bytes_base64: trace.toString("base64") },
    ];
  });
  const requirementTrace = Buffer.from("<hierarchy><node resource-id=\"calendar-month-viewport\" text=\"Calendar isolated fixture\"/></hierarchy>");
  let probeOrder = 0;
  const requirementRecords = V12_CALENDAR_REQUIREMENT_DEFINITIONS.map((definition) => ({
    requirement_id: definition.requirement_id, evidence_id: definition.evidence_id, native_execution: "EXECUTED",
    fixture_id: "v12-calendar-isolated-facts-v1", fixture_storage: "isolated-in-memory", fixture_source_sha256: "4".repeat(64),
    source_digest_before: "4".repeat(64), source_digest_after: "4".repeat(64),
    probe_receipts: definition.probe_ids.map((probeId) => createV12CalendarProbeReceipt({ nonce: (10_000 + probeOrder++).toString(16).padStart(32, "0"),
      flowSha256: "5".repeat(64), fixtureSourceSha256: "4".repeat(64), requirementId: definition.requirement_id, evidenceId: definition.evidence_id, probeId })),
  }));
  let artifactOrder = 0;
  const requirementArtifacts = requirementRecords.flatMap((record) => record.probe_receipts.flatMap((receipt) => {
    const stem = `${String(artifactOrder++).padStart(2, "0")}-${record.requirement_id}-${receipt.probe_id}`;
    return [
      { requirement_id: record.requirement_id, probe_id: receipt.probe_id, kind: "png", relative_path: `calendar/requirements/${stem}.png`, sha256: createHash("sha256").update(png).digest("hex"), size_bytes: png.length, bytes_base64: png.toString("base64") },
      { requirement_id: record.requirement_id, probe_id: receipt.probe_id, kind: "trace", relative_path: `calendar/requirements/${stem}.trace.xml`, sha256: createHash("sha256").update(requirementTrace).digest("hex"), size_bytes: requirementTrace.length, bytes_base64: requirementTrace.toString("base64") },
    ];
  }));
  let junitOrder = 0;
  const requirements = { flow_sha256: "5".repeat(64), fixture_id: "v12-calendar-isolated-facts-v1", records: requirementRecords,
    junit_cases: requirementRecords.flatMap((record) => record.probe_receipts.map((receipt) => ({ id: `${record.requirement_id}:${receipt.probe_id}`,
      requirement_id: record.requirement_id, probe_id: receipt.probe_id,
      order: junitOrder++,
      status: "PASS" }))) };
  const artifacts = [...stageArtifacts, ...requirementArtifacts];
  const evidenceSetSha256 = createHash("sha256").update(JSON.stringify({ stages, requirements,
    artifacts: artifacts.map(({ bytes_base64: _bytes, ...descriptor }) => descriptor) })).digest("hex");
  return {
  ...fixture,
  stages,
  execution_origin: productionOrigin,
  requirements,
  native_receipt: { schema_version: 2, producer: "v12-calendar-native-receipt/v2", native_execution: "EXECUTED",
    run_id: "phase20-20261014T031137Z-5917481c1fd1", source_tree_sha256: "a".repeat(64), apk_sha256: "c".repeat(64),
    installed_apk_sha256: "c".repeat(64), apk_signature_sha256: "1".repeat(64), device_identity_sha256: "d".repeat(64),
    launcher_source_sha256: productionOrigin.launcher_source_sha256, flow_sha256: flowSha256, requirements_flow_sha256: requirements.flow_sha256,
    fixture_id: requirements.fixture_id, stage_count: 35, requirement_count: 23, probe_count: 69, evidence_set_sha256: evidenceSetSha256 },
  artifacts,
  };
};

test("Calendar shard rejects missing, duplicated, or non-PASS probe receipts", () => {
  for (const mutate of [
    (value) => { value.requirements.records[0].probe_receipts.pop(); },
    (value) => { value.requirements.records[0].probe_receipts[1] = structuredClone(value.requirements.records[0].probe_receipts[0]); },
    (value) => { value.requirements.records[0].probe_receipts[0].status = "FAIL"; },
    (value) => { value.requirements.junit_cases[0].status = "FAIL"; },
    (value) => {
      const first = value.requirements.records[0].probe_receipts[0];
      const second = value.requirements.records[0].probe_receipts[1];
      value.requirements.records[0].probe_receipts[1] = createV12CalendarProbeReceipt({
        nonce: first.nonce,
        flowSha256: value.requirements.flow_sha256,
        fixtureSourceSha256: value.requirements.records[0].fixture_source_sha256,
        requirementId: second.requirement_id,
        evidenceId: second.evidence_id,
        probeId: second.probe_id,
      });
    },
  ]) {
    const value = structuredClone(productionResult("9".repeat(64)));
    mutate(value);
    assert.throws(() => validateV12CalendarShard(value, "9".repeat(64)), /calendar_native_requirements_invalid/u);
  }
});

test("Calendar shard rejects the retired generic observation envelope", () => {
  assert.throws(() => validateV12CalendarShard(observation), /calendar_native_stages_invalid/u);
  assert.throws(() => executeV12CalendarShard(observation), /calendar_native_stages_invalid/u);
});

test("Calendar shard rejects producer verdicts and sample-only evidence", () => {
  assert.throws(() => validateV12CalendarShard({ ...observation, finalVerdict: "PASS" }), /calendar_native_stages_invalid/u);
  assert.throws(() => validateV12CalendarShard({ samples: observation.samples }), /calendar_native_stages_invalid/u);
});

test("Calendar shard rejects test-fixture origin even when the build manifest claims live mode", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const flowSha256 = "9".repeat(64);
  const manifest = {
    run_id: runId,
    mode: "live",
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64), signature_sha256: "1".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const fixture = createV12CalendarObservationResult(flowSha256);
  await assert.rejects(executeV12CalendarShardCli(["--run", runId, "--execute"], {
    root: "/fixture-root", flowSha256, readBuild: () => manifest, sourceDigest: manifest.source.tree_sha256,
    currentHead: manifest.source.head, isAncestor: () => true, acquireLease: () => ({ opaque: true }),
    releaseLease: () => true, snapshotSettings: () => ({}), restoreSettings: () => true,
    executeNative: () => ({ ...productionResult(flowSha256), execution_origin: { schema_version: 1, kind: "test-fixture", default_launcher: false, test_only: true } }),
    writeImmutable: () => {}, outputExists: () => false,
  }), /calendar_native_origin_invalid/u);
});

test("Calendar shard writes the exact stage-specific host-derived observation set", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const flowSha256 = "9".repeat(64);
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64), signature_sha256: "1".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const writes = new Map();
  const result = await executeV12CalendarShardCli(["--run", runId, "--execute"], {
    root: "/fixture-root", flowSha256, readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
    isAncestor: () => true, acquireLease: () => ({ opaque: true }), releaseLease: () => true,
    snapshotSettings: () => ({}), restoreSettings: () => true, executeNative: () => productionResult(flowSha256),
    writeImmutable: (file, value) => writes.set(file, value), outputExists: () => false,
  });
  assert.deepEqual(result, { ok: true, mode: "execute", run_id: runId });
  assert.equal(writes.size, 213);
  assert.match(JSON.stringify(writes.get(`artifacts/native/v1.2/${runId}/calendar-transitions.json`)), /v12-calendar-shard\/v6/u);
  const registry = writes.get(`artifacts/native/v1.2/${runId}/calendar/artifact-registry.json`);
  assert.equal(registry.members.length, 208);
  assert.equal(registry.members.every(({ path, sha256 }) => writes.has(`artifacts/native/v1.2/${runId}/${path}`)
    && createHash("sha256").update(writes.get(`artifacts/native/v1.2/${runId}/${path}`)).digest("hex") === sha256), true);
  assert.doesNotMatch(JSON.stringify([...writes.values()]), /expected_outcome|synthetic/u);
});

test("Calendar shard exposes exhaustive stage order and strict immutable CLI arguments", () => {
  assert.deepEqual(V12_CALENDAR_SHARD_STAGE_IDS, [
    "drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1",
    "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above",
    "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1",
    "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above",
    "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal",
    "rapid-reverse-input", "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "week-collapse-middle-row",
    "adjacent-week", "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month",
    "rotation-during-transition", "background-during-transition", "reduced-motion", "dev-01-padding", "dev-02-light-title",
  ]);
  assert.deepEqual(
    parseV12CalendarShardCliArgs(["--run", "phase20-20261014T031137Z-5917481c1fd1", "--execute"]),
    { runId: "phase20-20261014T031137Z-5917481c1fd1", mode: "execute" },
  );
  assert.throws(() => parseV12CalendarShardCliArgs(["--run", "bad", "--execute"]), /calendar_cli_invalid/);
});

test("Calendar shard rejects the legacy homogeneous pointer receipt for all stage groups", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64), signature_sha256: "1".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const flowSha256 = "9".repeat(64);
  const receipt = (id, status = "PASS") => ({
    content_width_dp: 400, start_dp: [300, 180], end_dp: [200, 180], dx_dp: -100, dy_dp: 0,
    event_sequence: ["pointer-down", "pointer-move", "pointer-up"], cancelled: false, settled: status !== "NOT_RUN",
    callback_count: 1, semantic_transition: { pre: "month", during: "dragging", post: "month" },
    screenshot_sha256: "1".repeat(64), trace_sha256: "2".repeat(64), expected_outcome: id,
  });
  const native = {
    flow_sha256: flowSha256,
    flow_revision: "calendar-flow-r35",
    stages: V12_CALENDAR_SHARD_STAGE_IDS.map((id, order) => ({
      id, order, status: "NOT_RUN", samples: [
        { timestampMs: order * 2 + 1, widthDp: 400, dxDp: id.includes("25") ? -100 : -40, dyDp: 0, intentOwner: "horizontal", translationDp: id.includes("25") ? -100 : -40, title: "synthetic", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "synthetic-week", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "synthetic-focus", motion: id === "reduced-motion" ? "reduced" : "normal" },
        { timestampMs: order * 2 + 2, widthDp: 400, dxDp: id.includes("25") ? -100 : -40, dyDp: 0, intentOwner: "horizontal", translationDp: id.includes("25") ? -100 : -40, title: "synthetic", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "synthetic-week", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "synthetic-focus", motion: id === "reduced-motion" ? "reduced" : "normal" },
      ],
      receipt: receipt(id),
    })),
    junit_cases: V12_CALENDAR_SHARD_STAGE_IDS.map((id, order) => ({ id, order, status: "NOT_RUN" })),
  };
  const writes = new Map();
  await assert.rejects(executeV12CalendarShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", flowSha256: "9".repeat(64), readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
    isAncestor: () => true, acquireLease: () => ({ opaque: true }), releaseLease: () => true,
    snapshotSettings: () => ({}), restoreSettings: () => true, executeNative: () => native,
    writeImmutable: (file, value) => writes.set(file, value), outputExists: () => false,
  }), /calendar_native_stages_invalid/u);
  assert.equal(writes.size, 1);
  const malformed = structuredClone(native);
  malformed.stages[1].id = malformed.stages[0].id;
  await assert.rejects(
    executeV12CalendarShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", flowSha256, readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({}), releaseLease: () => true, snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => malformed, writeImmutable: () => {}, outputExists: () => false,
    }),
    /calendar_native_stages_invalid/,
  );
  const injected = structuredClone(native);
  injected.stages[0].samples[0].injected = true;
  await assert.rejects(
    executeV12CalendarShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", flowSha256, readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({}), releaseLease: () => true, snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => injected, writeImmutable: () => {}, outputExists: () => false,
    }),
    /calendar_native_stages_invalid/,
  );
});

test("Calendar shard rejects visibility-only stages that do not carry an executed flow-bound receipt", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const flowSha256 = "9".repeat(64);
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64), signature_sha256: "1".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const visibilityOnly = {
    stages: V12_CALENDAR_SHARD_STAGE_IDS.map((id, order) => ({
      id,
      order,
      status: "PASS",
      samples: [
        { timestampMs: order * 2 + 1, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "visible", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "week", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar", motion: "normal" },
        { timestampMs: order * 2 + 2, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "visible", selectedCivilDate: "2026-11-01", generation: 2, focusedWeek: "week", rowBounds: [0, 64], callbackCount: 2, focusIdentity: "calendar", motion: "normal" },
      ],
    })),
  };
  await assert.rejects(
    executeV12CalendarShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", flowSha256, readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({}), releaseLease: () => true, snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => visibilityOnly, writeImmutable: () => {}, outputExists: () => false,
    }),
    /calendar_native_stages_invalid/u,
  );
});

test("Calendar shard retains the lease when settings read-back restoration fails", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const manifest = {
    run_id: runId, source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) }, fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64), signature_sha256: "1".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) }, configuration: { id: "AP-L-C390-P-F100" },
  };
  let released = false;
  await assert.rejects(executeV12CalendarShardCli(["--run", runId, "--execute"], {
    root: "/fixture-root", flowSha256: "9".repeat(64), readBuild: () => manifest, sourceDigest: manifest.source.tree_sha256,
    currentHead: manifest.source.head, isAncestor: () => true, acquireLease: () => ({ opaque: true }), releaseLease: () => { released = true; },
    snapshotSettings: () => ({ all: "persisted-under-lease" }), restoreSettings: () => false, executeNative: () => productionResult("9".repeat(64)),
    writeImmutable: () => {}, outputExists: () => false,
  }), /calendar_settings_restore_failed/u);
  assert.equal(released, false);
});
