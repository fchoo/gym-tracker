import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  createV12CalendarDiagnostics,
  encodeV12CalendarDiagnosticsResult,
  executeV12CalendarDiagnostics,
  extractV12CalendarDiagnosticsResult,
  parseV12CalendarDiagnosticsArgs,
  runV12CalendarAdb,
  runV12CalendarDiagnosticsCli,
  validateV12CalendarDiagnostics,
} from "./benchmark-v12-interactions.mjs";
import {
  compareV12Calendar,
  executeV12CalendarComparisonFixture,
  v12CalendarReferenceMapSha256,
  validateV12CalendarComparison,
  runV12CalendarComparisonCli,
  validateV12CalendarReferenceMap,
} from "./compare-v12-calendar.mjs";
import {
  V12_CALENDAR_CASE_LEDGER_DESCRIPTOR,
  V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR,
  V12_CALENDAR_REQUIRED_CASES,
  V12_CALENDAR_REQUIRED_CASE_IDS,
  validateV12CalendarCaseRegistryDescriptor,
} from "./v12-calendar-case-registry.mjs";
import {
  createExclusiveDirectory,
  ensureV12CalendarDirectory,
  initializeV12CalendarRun,
  readV12CalendarRunState,
  recordV12CalendarStageResult,
  resolveV12CalendarPath,
} from "./v12-calendar-artifacts.mjs";
import {
  V12_CALENDAR_DIAGNOSTIC_STAGES,
  V12_CALENDAR_TRACE_SAMPLE_MARKER,
  createV12CalendarRunnerPlan,
  executeV12Maestro,
  extractV12CalendarStageTrace,
  initializeV12CalendarRunnerState,
  readV12CalendarRunnerState,
  recordV12CalendarRunnerStage,
  runV12MaestroCli,
  validateV12CalendarFlow,
  validateV12CalendarManifest,
} from "./run-v12-maestro.mjs";
import {
  executeV12CalendarEvidenceVerifier,
  runV12CalendarEvidenceVerifierCli,
  validateV12CalendarEvidence,
  validateV12CalendarPackageScripts,
  verifyV12CalendarArtifactSet,
} from "./verify-v12-native-evidence.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = () => JSON.parse(readFileSync("scripts/fixtures/v12-calendar-evidence/complete.json", "utf8"));
const comparisonFixturePath = "scripts/fixtures/v12-calendar-comparison/complete.json";

function manifest() {
  return {
    schema_version: 1,
    suite: "v1.2-calendar",
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    js_bundle: { embedded: true },
    base_head: "a".repeat(40),
    source_tree_sha256: "b".repeat(64),
    source_manifest_sha256: "90de9f6040f36dc029b97ad3687d0e3569fd9bc33ad3eaab2cafc649ae1196a4",
    reference_map_sha256: "513c8f5798c1010eb370d35d259ea9c5e805c80a2786101a2ed732b588167c33",
    apk: { path: "artifacts/native/v1.2-calendar/app.apk", sha256: "c".repeat(64), size_bytes: 1 },
    installed_apk: { sha256: "c".repeat(64), matches_retained_apk: true },
    device: { identity_sha256: "d".repeat(64) },
    report_sha256: "e".repeat(64),
  };
}

function rawDiagnostics(count = 100) {
  return {
    producer: "v12-calendar-native-diagnostics/v1",
    native_execution: "EXECUTED",
    query_samples: Array.from({ length: count }, (_, index) => ({
      sequence: index + 1,
      duration_ms: index + 1,
      source_backed: true,
      event_count: 2,
      plan_count: 1,
      imported_count: 1,
    })),
    interaction_samples: Array.from({ length: count }, (_, index) => ({
      sequence: index + 1,
      kind: "drag-expand-collapse",
      complete: true,
      frame_work_ms: [1, 2],
      missed_frames: 0,
      refresh_rate_hz: index === 0 ? 90 : 60,
      profiler_overhead_ms: 0.1,
    })),
  };
}

function comparisonFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "v12-calendar-comparison-coverage-"));
  const referencePath = path.join(directory, "reference.png");
  const nativePath = path.join(directory, "native.png");
  const image = new PNG({ width: 1, height: 1 });
  image.data.set([1, 2, 3, 255]);
  const bytes = PNG.sync.write(image);
  writeFileSync(referencePath, bytes);
  writeFileSync(nativePath, bytes);
  const identity = {
    base_head: "a".repeat(40),
    source_tree_sha256: "b".repeat(64),
    source_manifest_sha256: "c".repeat(64),
    package: "com.fchoo.gymtracker.devtest",
    apk_sha256: "d".repeat(64),
    installed_apk_sha256: "d".repeat(64),
    device_identity_sha256: "e".repeat(64),
    report_sha256: "f".repeat(64),
  };
  const map = {
    schema_version: 1,
    prototype_revision: 18,
    source_manifest_sha256: identity.source_manifest_sha256,
    host_only_fixture: true,
    case_registry: V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR,
    captures: [{
      id: "calendar-month-light-390",
      requirement_ids: ["CAL-01"],
      reference: { path: referencePath, sha256: hash(bytes), width: 1, height: 1 },
      configuration: { theme: "Light", viewport: { width: 390, height: 844 }, orientation: "portrait", font_scale: 1, motion: "normal", input: "touch", fixture: "synthetic-calendar-month-v1" },
    }],
    case_ledger: V12_CALENDAR_CASE_LEDGER_DESCRIPTOR,
  };
  identity.reference_map_sha256 = v12CalendarReferenceMapSha256(map);
  const trace = {
    schemaVersion: 1,
    stage: "drag-forward-25_1",
    traceNonce: "p16trace-host-coverage",
    sourceIdentity: { packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", suite: "phase16-calendar" },
    synthetic: true,
    samples: [
      { kind: "drag", dx: -89.64, viewportWidth: 360, transformX: -89.64, semanticOffset: 0, titleOffset: 0, elapsedMs: 1, synthetic: true },
      { kind: "drag", dx: -90, viewportWidth: 360, transformX: -90, semanticOffset: 0, titleOffset: 1, elapsedMs: 2, synthetic: true },
      { kind: "drag", dx: -90.36, viewportWidth: 360, transformX: -90.36, semanticOffset: 0, titleOffset: 1, elapsedMs: 3, synthetic: true },
      { kind: "release", dx: -90.36, viewportWidth: 360, semanticOffset: 1, titleOffset: 1, elapsedMs: 4, synthetic: true },
    ],
  };
  return {
    directory,
    bytes,
    map,
    run: {
      schema_version: 1,
      run_id: "phase16-host-deferred",
      identity,
      source_tree_sha256: identity.source_tree_sha256,
      source_manifest_sha256: identity.source_manifest_sha256,
      status: "NOT_RUN",
      captures: [{
        id: "calendar-month-light-390",
        native: { path: nativePath, sha256: hash(bytes), width: 1, height: 1 },
        trace,
        semantics: { focus_ring_dp: 3, focus_clearance_dp: 4, authority: "read-only", target: "calendar-month" },
        classification: "REVIEW_REQUIRED",
        differences: [],
      }],
    },
  };
}

function liveEvidence() {
  const evidence = fixture();
  evidence.run_id = "phase20-20261013T080808Z-abcdef123456";
  const artifactRoot = `artifacts/native/v1.2/${evidence.run_id}`;
  evidence.host_only_fixture = false;
  evidence.native_execution = "EXECUTED";
  evidence.functional_cases.forEach((entry) => {
    entry.status = "PASS";
    entry.native_execution = "EXECUTED";
    entry.observations.synthetic = false;
  });
  evidence.route_journeys.forEach((entry) => {
    entry.focus.clearance_dp = 4;
    entry.focus.measurement_status = "EXECUTED";
  });
  evidence.deviations.forEach((entry) => {
    entry.technical_status = "PASS";
    entry.evidence_complete = true;
    entry.classification = "PASS";
    entry.evidence_hashes = ["a".repeat(64)];
  });
  evidence.comparison.mode = "live-executed";
  evidence.comparison.run_id = evidence.run_id;
  evidence.comparison.native_execution = "EXECUTED";
  evidence.comparison.phase20_deferred = false;
  evidence.comparison.status = "PASS";
  evidence.comparison.identity = structuredClone(evidence.identity);
  evidence.comparison.case_ledger = structuredClone(V12_CALENDAR_CASE_LEDGER_DESCRIPTOR);
  evidence.comparison.case_results = V12_CALENDAR_REQUIRED_CASES.map((entry) => ({
    id: entry.id,
    case_sha256: entry.case_sha256,
    status: "PASS",
    native_execution: "EXECUTED",
    artifact: { path: `${artifactRoot}/cases/${entry.case_sha256}.json`, sha256: "a".repeat(64) },
  }));
  evidence.comparison.records.forEach((entry) => {
    entry.classification = "PASS";
    entry.differences = [];
    for (const kind of ["reference", "native", "overlay", "difference", "mask", "record"]) {
      entry.artifacts[kind].path = `${artifactRoot}/comparison/${entry.id}/${kind === "record" ? "comparison.json" : `${kind}.png`}`;
    }
  });
  evidence.manifest.apk.path = `${artifactRoot}/app.apk`;
  evidence.functional_cases.forEach((entry) => { entry.artifact.path = `${artifactRoot}/cases/${entry.id}.json`; });
  evidence.route_journeys.forEach((entry) => { entry.artifact.path = `${artifactRoot}/routes/${entry.id}.json`; });
  evidence.artifacts.manifest.path = `${artifactRoot}/build.json`;
  evidence.artifacts.report.path = `${artifactRoot}/evidence/native-report.json`;
  evidence.artifacts.comparison.path = `${artifactRoot}/comparison/calendar.json`;
  evidence.artifacts.diagnostics.path = `${artifactRoot}/diagnostics/calendar.json`;
  evidence.diagnostics = createV12CalendarDiagnostics({ manifest: evidence.manifest, raw: rawDiagnostics() });
  evidence.status = "PASS";
  evidence.all_pass = true;
  return evidence;
}

function mutateAndReject(base, mutations, validate) {
  for (const [index, mutate] of mutations.entries()) {
    const value = structuredClone(base);
    mutate(value);
    assert.throws(() => validate(value), undefined, `mutation ${index} must be rejected`);
  }
}

function captureIo() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
    },
  };
}

test("diagnostic argument, adb, and marker helpers reject every malformed boundary", () => {
  assert.deepEqual(parseV12CalendarDiagnosticsArgs(["--manifest", "build.json"]), {
    manifestPath: "build.json",
    querySamples: 100,
    interactionSamples: 100,
  });
  assert.deepEqual(parseV12CalendarDiagnosticsArgs([
    "--manifest", "build.json",
    "--output", "out.json",
    "--query-samples", "101",
    "--interaction-samples", "102",
  ]), {
    manifestPath: "build.json",
    outputPath: "out.json",
    querySamples: 101,
    interactionSamples: 102,
  });
  for (const args of [
    [],
    ["--unknown"],
    ["--manifest"],
    ["--manifest", "build.json", "--query-samples", "99"],
    ["--manifest", "build.json", "--query-samples", "100.5"],
    ["--manifest", "build.json", "--interaction-samples", "99"],
    ["--manifest", "build.json", "--interaction-samples", "bad"],
  ]) assert.throws(() => parseV12CalendarDiagnosticsArgs(args), /argument_invalid/u);

  assert.equal(extractV12CalendarDiagnosticsResult("noise"), undefined);
  const encoded = encodeV12CalendarDiagnosticsResult({ ok: true });
  assert.deepEqual(extractV12CalendarDiagnosticsResult(`noise\n${encoded.join("\n")}`), { ok: true });
  assert.throws(() => encodeV12CalendarDiagnosticsResult({ ok: true }, "Alice"), /result_stream_invalid/u);
  assert.throws(() => extractV12CalendarDiagnosticsResult("GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_CHUNK:{"), /result_json_invalid/u);
  const malformedChunk = JSON.parse(encoded[0].split(":").slice(1).join(":"));
  for (const mutate of [
    (value) => { value.stream_id = "Alice"; },
    (value) => { value.total = 0; },
    (value) => { value.sequence = 2; },
    (value) => { value.extra = true; },
    (value) => { value.schema_version = 2; },
    (value) => { value.payload = 1; },
    (value) => { value.payload = "x".repeat(1_801); },
  ]) {
    const value = structuredClone(malformedChunk);
    mutate(value);
    assert.throws(() => extractV12CalendarDiagnosticsResult(`GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_CHUNK:${JSON.stringify(value)}`), /result_chunks_invalid/u);
  }
  const invalidPayload = { ...malformedChunk, payload: "{" };
  assert.throws(() => extractV12CalendarDiagnosticsResult(`GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_CHUNK:${JSON.stringify(invalidPayload)}`), /result_json_invalid/u);

  const fakeAdb = "/sdk/platform-tools/adb";
  assert.throws(() => runV12CalendarAdb("serial", [], { environment: {}, exists: () => false }), /adb_unavailable/u);
  assert.throws(() => runV12CalendarAdb("serial", [], { environment: { ANDROID_HOME: "/sdk" }, exists: () => false }), /adb_unavailable/u);
  assert.throws(() => runV12CalendarAdb(undefined, [], { environment: { ANDROID_SDK_ROOT: "/sdk" }, exists: () => true }), /adb_unavailable/u);
  assert.throws(() => runV12CalendarAdb("serial", [], { environment: { ANDROID_HOME: "/sdk" }, exists: () => true, spawn: () => ({ status: 1, stdout: "" }) }), /adb_command_failed/u);
  let invocation;
  assert.equal(runV12CalendarAdb("serial", ["devices"], {
    environment: { ANDROID_HOME: "/sdk" },
    exists: (value) => value === fakeAdb,
    root: "/repo",
    spawn: (...args) => { invocation = args; return { status: 0, stdout: " ok \n" }; },
  }), "ok");
  assert.deepEqual(invocation, [fakeAdb, ["-s", "serial", "devices"], { cwd: "/repo", encoding: "utf8" }]);
});

test("diagnostic validators exercise every exact-schema and numeric branch", () => {
  const validManifest = manifest();
  const validRaw = rawDiagnostics();
  const evidence = createV12CalendarDiagnostics({ manifest: validManifest, raw: validRaw });
  assert.equal(validateV12CalendarDiagnostics(evidence, validManifest).query_samples, 100);

  mutateAndReject(validRaw, [
    (value) => { value.producer = "wrong"; },
    (value) => { value.native_execution = "NOT_RUN"; },
    (value) => { value.query_samples = null; },
    (value) => { value.query_samples.pop(); },
    (value) => { value.interaction_samples = null; },
    (value) => { value.interaction_samples.pop(); },
    (value) => { value.query_samples[0].sequence = 2; },
    (value) => { value.interaction_samples[0].sequence = 2; },
    (value) => { value.query_samples[0].duration_ms = "1"; },
    (value) => { value.query_samples[0].duration_ms = Number.NaN; },
    (value) => { value.query_samples[0].duration_ms = -1; },
    (value) => { value.query_samples[0].source_backed = false; },
    (value) => { value.query_samples[0].event_count = 0.5; },
    (value) => { value.query_samples[0].event_count = -1; },
    (value) => { value.query_samples[0].plan_count = 0.5; },
    (value) => { value.query_samples[0].plan_count = -1; },
    (value) => { value.query_samples[0].imported_count = 0.5; },
    (value) => { value.query_samples[0].imported_count = -1; },
    (value) => { value.interaction_samples[0].kind = "tap"; },
    (value) => { value.interaction_samples[0].complete = false; },
    (value) => { value.interaction_samples[0].frame_work_ms = null; },
    (value) => { value.interaction_samples[0].frame_work_ms = []; },
    (value) => { value.interaction_samples[0].frame_work_ms = [-1]; },
    (value) => { value.interaction_samples[0].missed_frames = 0.5; },
    (value) => { value.interaction_samples[0].missed_frames = -1; },
    (value) => { value.interaction_samples[0].refresh_rate_hz = "60"; },
    (value) => { value.interaction_samples[0].refresh_rate_hz = Number.NaN; },
    (value) => { value.interaction_samples[0].refresh_rate_hz = 0; },
    (value) => { value.interaction_samples[0].profiler_overhead_ms = -1; },
  ], (value) => createV12CalendarDiagnostics({ manifest: validManifest, raw: value }));

  mutateAndReject(evidence, [
    (value) => { value.schema_version = 2; },
    (value) => { value.suite = "wrong"; },
    (value) => { value.producer = "wrong"; },
    (value) => { value.native_execution = "NOT_RUN"; },
    (value) => { value.acceptance_owner = "phase16"; },
    (value) => { value.verdict = "PASS"; },
    (value) => { value.status = "PASS"; },
    (value) => { value.targets.nv_perf_07.target_ms = 1; },
    (value) => { value.summary.query_p95_ms = -1; },
    (value) => { value.summary.frame_work_p95_ms = -1; },
    (value) => { value.summary.missed_frames = -1; },
    (value) => { value.summary.refresh_rates_hz = [59]; },
    (value) => { value.summary.profiler_overhead_max_ms = -1; },
    (value) => { value.identity.base_head = "0".repeat(40); },
    (value) => { value.identity.source_tree_sha256 = "0".repeat(64); },
    (value) => { value.identity.source_manifest_sha256 = "0".repeat(64); },
    (value) => { value.identity.package = "wrong"; },
    (value) => { value.identity.apk_sha256 = "0".repeat(64); },
    (value) => { value.identity.installed_apk_sha256 = "0".repeat(64); },
    (value) => { value.identity.device_identity_sha256 = "0".repeat(64); },
  ], (value) => validateV12CalendarDiagnostics(value, validManifest));
});

test("diagnostic execution exports one exclusive aggregate and fails closed", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-diagnostics-"));
  try {
    writeFileSync(path.join(root, "build.json"), JSON.stringify(manifest()));
    const raw = rawDiagnostics();
    const logs = encodeV12CalendarDiagnosticsResult(raw).join("\n");
    const calls = [];
    const result = await executeV12CalendarDiagnostics(["--manifest", "build.json"], {
      root,
      head: manifest().base_head,
      source: manifest().source_tree_sha256,
      serial: "hashed-outside-evidence",
      now: () => 0,
      wait: async () => undefined,
      adb: (...args) => { calls.push(args); return args[1] === "-d" ? logs : ""; },
    });
    assert.deepEqual(result, {
      output: "diagnostics/calendar.json",
      query_samples: 100,
      interaction_samples: 100,
      acceptance_owner: "phase20",
    });
    assert.equal(calls.length, 3);
    assert.equal(readFileSync(path.join(root, result.output), "utf8").includes("Alice"), false);
    const cli = captureIo();
    assert.equal(await runV12CalendarDiagnosticsCli(["--manifest", "build.json", "--output", "diagnostics/cli.json"], cli.io, {
      root,
      head: manifest().base_head,
      source: manifest().source_tree_sha256,
      now: () => 0,
      wait: async () => undefined,
      adb: (...args) => args[1] === "-d" ? logs : "",
      write: writeFileSync,
    }), 0);
    assert.match(cli.stdout[0], /"acceptance_owner":"phase20"/u);
    const failedCli = captureIo();
    assert.equal(await runV12CalendarDiagnosticsCli([], failedCli.io), 1);
    assert.match(failedCli.stderr[0], /argument_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  await assert.rejects(() => executeV12CalendarDiagnostics(["--manifest", "missing.json"], { root: "/tmp/absent-v12-calendar", exists: () => false }), /manifest_missing/u);

  const failureRoot = mkdtempSync(path.join(tmpdir(), "v12-calendar-diagnostics-fail-"));
  try {
    writeFileSync(path.join(failureRoot, "build.json"), JSON.stringify(manifest()));
    const dependencies = {
      root: failureRoot,
      head: manifest().base_head,
      source: manifest().source_tree_sha256,
      now: (() => { const values = [0, 600_001]; return () => values.shift() ?? 600_001; })(),
      wait: async () => undefined,
      adb: () => "",
    };
    await assert.rejects(() => executeV12CalendarDiagnostics(["--manifest", "build.json"], dependencies), /result_missing/u);
    await assert.rejects(() => executeV12CalendarDiagnostics(["--manifest", "build.json", "--output", "../escape.json"], {
      ...dependencies,
      now: () => 0,
      adb: (...args) => args[1] === "-d" ? encodeV12CalendarDiagnosticsResult(rawDiagnostics()).join("\n") : "",
    }), /output_path_invalid/u);
    await assert.rejects(() => executeV12CalendarDiagnostics(["--manifest", "build.json", "--query-samples", "101"], {
      ...dependencies,
      now: () => 0,
      adb: (...args) => args[1] === "-d" ? encodeV12CalendarDiagnosticsResult(rawDiagnostics()).join("\n") : "",
    }), /requested_sample_count_mismatch/u);
  } finally {
    rmSync(failureRoot, { recursive: true, force: true });
  }
});

test("diagnostic execution default adapters read git identity, adb output, clock, wait, and exclusive storage", async () => {
  const artifactRoot = mkdtempSync(path.join(process.cwd(), "artifacts/v12-calendar-default-"));
  const sdkRoot = mkdtempSync(path.join(tmpdir(), "v12-calendar-sdk-"));
  const previousAndroidHome = process.env.ANDROID_HOME;
  const previousSerial = process.env.ANDROID_SERIAL;
  try {
    const current = manifest();
    current.base_head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    current.source_tree_sha256 = sourceTreeSha256(process.cwd());
    const manifestPath = path.join(artifactRoot, "build.json");
    writeFileSync(manifestPath, JSON.stringify(current));
    const adbDirectory = path.join(sdkRoot, "platform-tools");
    mkdirSync(adbDirectory, { recursive: true });
    const counterPath = path.join(sdkRoot, "counter");
    const raw = encodeV12CalendarDiagnosticsResult(rawDiagnostics()).join("\\n").replaceAll("'", "");
    const adbPath = path.join(adbDirectory, "adb");
    writeFileSync(adbPath, `#!/bin/sh\ncase "$*" in\n  *"logcat -d -v raw"*)\n    if [ -f "${counterPath}" ]; then printf '%b\\n' '${raw}'; else printf 1 > "${counterPath}"; fi\n    ;;\nesac\n`);
    chmodSync(adbPath, 0o755);
    process.env.ANDROID_HOME = sdkRoot;
    process.env.ANDROID_SERIAL = "local-test-device";
    const result = await executeV12CalendarDiagnostics(["--manifest", manifestPath]);
    assert.equal(result.query_samples, 100);
    assert.equal(readFileSync(path.join(artifactRoot, "diagnostics/calendar.json"), "utf8").includes("REVIEW_REQUIRED"), false);
  } finally {
    if (previousAndroidHome === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = previousAndroidHome;
    if (previousSerial === undefined) delete process.env.ANDROID_SERIAL;
    else process.env.ANDROID_SERIAL = previousSerial;
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(sdkRoot, { recursive: true, force: true });
  }
});

test("runner manifest, flow, state wrappers, and Phase 16 execution gate are exhaustive", () => {
  const valid = manifest();
  assert.equal(validateV12CalendarManifest(valid), true);
  mutateAndReject(valid, [
    (value) => { value.extra = true; },
    (value) => { value.js_bundle.extra = true; },
    (value) => { value.apk.extra = true; },
    (value) => { value.installed_apk.extra = true; },
    (value) => { value.device.extra = true; },
    (value) => { value.schema_version = 2; },
    (value) => { value.suite = "wrong"; },
    (value) => { value.profile = "production"; },
    (value) => { value.package = "wrong"; },
    (value) => { value.js_bundle.embedded = false; },
    (value) => { value.base_head = "x"; },
    (value) => { value.source_tree_sha256 = "x"; },
    (value) => { value.source_manifest_sha256 = "x"; },
    (value) => { value.apk.sha256 = "x"; },
    (value) => { value.installed_apk.matches_retained_apk = false; },
    (value) => { value.installed_apk.sha256 = "f".repeat(64); },
    (value) => { value.device.identity_sha256 = "x"; },
    (value) => { value.report_sha256 = "x"; },
  ], (value) => validateV12CalendarManifest(value));
  assert.throws(() => validateV12CalendarManifest(valid, { head: "0".repeat(40) }), /stale_head/u);
  assert.throws(() => validateV12CalendarManifest(valid, { source: "0".repeat(64) }), /stale_source/u);

  const flow = readFileSync("maestro/v1.2/calendar.yaml", "utf8");
  assert.equal(validateV12CalendarFlow(flow), true);
  assert.throws(() => validateV12CalendarFlow(null), /flow_invalid/u);
  assert.throws(() => validateV12CalendarFlow("PHASE16_CALENDAR_STAGE"), /flow_invalid/u);
  assert.throws(() => validateV12CalendarFlow("calendar-tracer"), /flow_invalid/u);
  assert.throws(() => validateV12CalendarFlow(flow.replace("PHASE16_CALENDAR_FIXTURE_ID == 'synthetic-calendar-v1'", "PHASE16_CALENDAR_FIXTURE_ID != null")), /flow_invalid/u);
  assert.throws(() => validateV12CalendarFlow(`${flow}\n# October 2026`), /flow_invalid/u);
  assert.throws(() => validateV12CalendarFlow(`${flow}\n# phase16CalendarReducedMotion=true`), /flow_invalid/u);
  assert.throws(() => validateV12CalendarFlow(flow.replace("PHASE16_CALENDAR_STAGE == 'drag-forward-10'", "PHASE16_CALENDAR_STAGE == 'missing'")), /stage_missing/u);
  assert.throws(() => validateV12CalendarFlow(flow.replace("takeScreenshot", "capture")), /capture_missing/u);
  const runnerPlan = createV12CalendarRunnerPlan(valid);
  assert.equal(runnerPlan.stages.length, V12_CALENDAR_DIAGNOSTIC_STAGES.length);
  assert.equal(runnerPlan.fixture_id, "synthetic-calendar-v1");
  assert.equal(runnerPlan.trace_sample_marker, V12_CALENDAR_TRACE_SAMPLE_MARKER);

  const traceRow = {
    schema_version: 1,
    trace_nonce: "p16trace-native-1",
    source_identity: { package_name: "com.fchoo.gymtracker.devtest", build_profile: "development-test", suite: "phase16-calendar" },
    stage: "drag-cancel",
    sequence: 1,
    sample: { kind: "cancel", elapsedMs: 1, synthetic: true },
  };
  const traceLine = `${V12_CALENDAR_TRACE_SAMPLE_MARKER}${JSON.stringify(traceRow)}`;
  assert.equal(extractV12CalendarStageTrace("noise", "drag-cancel"), undefined);
  assert.deepEqual(extractV12CalendarStageTrace(traceLine, "drag-cancel"), {
    schemaVersion: 1,
    stage: "drag-cancel",
    traceNonce: "p16trace-native-1",
    sourceIdentity: { packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", suite: "phase16-calendar" },
    synthetic: true,
    samples: [{ kind: "cancel", elapsedMs: 1, synthetic: true }],
  });
  assert.throws(() => extractV12CalendarStageTrace(`${V12_CALENDAR_TRACE_SAMPLE_MARKER}{`, "drag-cancel"), /trace_json_invalid/u);
  for (const mutate of [
    (value) => { value.trace_nonce = "Alice"; },
    (value) => { value.sequence = 2; },
    (value) => { value.source_identity.package_name = "wrong"; },
    (value) => { value.extra = true; },
  ]) {
    const invalid = structuredClone(traceRow);
    mutate(invalid);
    assert.throws(() => extractV12CalendarStageTrace(`${V12_CALENDAR_TRACE_SAMPLE_MARKER}${JSON.stringify(invalid)}`, "drag-cancel"), /trace_chunks_invalid/u);
  }
  assert.throws(() => extractV12CalendarStageTrace(traceLine, "unknown"), /trace_chunks_invalid/u);

  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-runner-state-"));
  try {
    const runId = "phase20-20261013T010101Z-abcdef123456";
    assert.equal(initializeV12CalendarRunnerState({ root, runId }).status, "IN_PROGRESS");
    assert.equal(readV12CalendarRunnerState({ root, runId }).pending_stage_ids.length, V12_CALENDAR_DIAGNOSTIC_STAGES.length);
    assert.equal(recordV12CalendarRunnerStage({ root, runId, stageId: V12_CALENDAR_DIAGNOSTIC_STAGES[0], status: "FAILED", artifactSha256: "a".repeat(64) }).status, "FAILED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  assert.throws(() => executeV12Maestro([]), /diagnostic_flag_required/u);
  assert.throws(() => executeV12Maestro(["--diagnostic"]), /manifest_required/u);
  assert.throws(() => executeV12Maestro(["--diagnostic", "--manifest"]), /manifest_required/u);
  assert.throws(() => executeV12Maestro(["--diagnostic", "--manifest", "missing.json"], { root: "/tmp", exists: () => false }), /manifest_missing/u);
  assert.throws(() => executeV12Maestro(["--diagnostic", "--manifest", "build.json"], {
    root: "/repo",
    exists: () => true,
    readText: (file) => file.endsWith("calendar.yaml") ? flow : JSON.stringify(valid),
    head: valid.base_head,
    source: valid.source_tree_sha256,
  }), /native_execution_phase20_only/u);

  const defaultRoot = mkdtempSync(path.join(process.cwd(), "artifacts/v12-calendar-runner-default-"));
  try {
    const current = manifest();
    current.base_head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    current.source_tree_sha256 = sourceTreeSha256(process.cwd());
    const manifestPath = path.join(defaultRoot, "build.json");
    writeFileSync(manifestPath, JSON.stringify(current));
    assert.throws(() => executeV12Maestro(["--diagnostic", "--manifest", manifestPath]), /native_execution_phase20_only/u);
  } finally {
    rmSync(defaultRoot, { recursive: true, force: true });
  }

  const cli = captureIo();
  assert.equal(runV12MaestroCli([], cli.io), 1);
  assert.match(cli.stderr[0], /diagnostic_flag_required/u);
});

test("artifact journals validate registry, corruption, terminal completion, and filesystem failures", () => {
  assert.throws(() => createExclusiveDirectory("/definitely/missing/parent/output"), /path_escape/u);
  assert.throws(() => validateV12CalendarCaseRegistryDescriptor({ ...V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR, route_count: 7 }), /case_registry_invalid/u);
  for (const stageIds of [null, [], ["a", "a"], ["bad stage"]]) {
    assert.throws(() => initializeV12CalendarRun({ root: "/tmp", runId: "phase20-20261013T020202Z-abcdef123456", stageIds }));
  }
  assert.throws(() => initializeV12CalendarRun({ root: "/tmp", runId: "bad", stageIds: ["stage-one"] }), /run_id_invalid/u);

  const pathRoot = mkdtempSync(path.join(tmpdir(), "v12-calendar-path-branches-"));
  const outsideRoot = mkdtempSync(path.join(tmpdir(), "v12-calendar-path-outside-"));
  try {
    const existing = path.join(pathRoot, "existing");
    mkdirSync(existing);
    assert.equal(resolveV12CalendarPath(existing), existing);
    assert.throws(() => resolveV12CalendarPath(path.join(pathRoot, "missing"), { root: path.join(pathRoot, "absent-root"), mustExist: true }), /path_unsafe/u);
    const linkedRoot = path.join(pathRoot, "linked-root");
    symlinkSync(outsideRoot, linkedRoot, "dir");
    assert.throws(() => resolveV12CalendarPath(path.join(linkedRoot, "missing"), { root: linkedRoot }), /path_unsafe/u);
    const rootFile = path.join(pathRoot, "root-file");
    writeFileSync(rootFile, "file");
    assert.throws(() => resolveV12CalendarPath(path.join(rootFile, "child"), { root: rootFile }), /path_unsafe/u);
    assert.throws(() => resolveV12CalendarPath(path.join(pathRoot, "missing", "child"), { root: pathRoot }), /path_missing/u);
    assert.throws(() => resolveV12CalendarPath(path.join(pathRoot, "missing"), { root: pathRoot, mustExist: true }), /path_missing/u);
    const blockingFile = path.join(pathRoot, "blocking-file");
    writeFileSync(blockingFile, "file");
    assert.throws(() => resolveV12CalendarPath(path.join(blockingFile, "child"), { root: pathRoot }), /path_unsafe/u);
    assert.throws(() => ensureV12CalendarDirectory(blockingFile, { root: pathRoot }), /path_unsafe/u);
    assert.throws(() => ensureV12CalendarDirectory(outsideRoot, { root: pathRoot }), /path_escape/u);
    assert.throws(() => ensureV12CalendarDirectory(existing, { root: pathRoot, exclusive: true }), /output_exists/u);
  } finally {
    rmSync(pathRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }

  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-terminal-"));
  const runId = "phase20-20261013T020202Z-abcdef123456";
  const stages = ["stage-one", "stage-two"];
  try {
    initializeV12CalendarRun({ root, runId, stageIds: stages });
    assert.throws(() => initializeV12CalendarRun({ root, runId, stageIds: stages }), /run_exists/u);
    assert.throws(() => recordV12CalendarStageResult({ root, runId, stageIds: stages, stageId: "unknown", status: "COMPLETE", artifactSha256: "a".repeat(64) }), /stage_unknown/u);
    assert.throws(() => recordV12CalendarStageResult({ root, runId, stageIds: stages, stageId: "stage-one", status: "PENDING", artifactSha256: "a".repeat(64) }), /stage_result_invalid/u);
    assert.throws(() => recordV12CalendarStageResult({ root, runId, stageIds: stages, stageId: "stage-one", status: "COMPLETE", artifactSha256: "bad" }), /stage_result_invalid/u);
    recordV12CalendarStageResult({ root, runId, stageIds: stages, stageId: "stage-one", status: "COMPLETE", artifactSha256: "a".repeat(64) });
    assert.throws(() => recordV12CalendarStageResult({ root, runId, stageIds: stages, stageId: "stage-one", status: "COMPLETE", artifactSha256: "a".repeat(64) }), /stage_exists/u);
    assert.equal(recordV12CalendarStageResult({ root, runId, stageIds: stages, stageId: "stage-two", status: "COMPLETE", artifactSha256: "b".repeat(64) }).status, "COMPLETE");
    assert.equal(readV12CalendarRunState({ root, runId, stageIds: stages }).status, "COMPLETE");
    assert.throws(() => recordV12CalendarStageResult({ root, runId, stageIds: stages, stageId: "stage-two", status: "COMPLETE", artifactSha256: "b".repeat(64) }), /run_terminal/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const corruptRoot = mkdtempSync(path.join(tmpdir(), "v12-calendar-corrupt-"));
  const corruptId = "phase20-20261013T030303Z-abcdef123456";
  try {
    initializeV12CalendarRun({ root: corruptRoot, runId: corruptId, stageIds: stages });
    writeFileSync(path.join(corruptRoot, corruptId, "run.json"), "{}");
    assert.throws(() => readV12CalendarRunState({ root: corruptRoot, runId: corruptId, stageIds: stages }), /run_state_invalid/u);
  } finally {
    rmSync(corruptRoot, { recursive: true, force: true });
  }

  const withInitializedRun = (callback) => {
    const localRoot = mkdtempSync(path.join(tmpdir(), "v12-calendar-state-branch-"));
    const localRunId = "phase20-20261013T050505Z-abcdef123456";
    try {
      initializeV12CalendarRun({ root: localRoot, runId: localRunId, stageIds: stages });
      callback({ localRoot, localRunId, directory: path.join(localRoot, localRunId) });
    } finally {
      rmSync(localRoot, { recursive: true, force: true });
    }
  };

  for (const mutate of [
    (run) => { run.extra = true; },
    (run) => { run.schema_version = 2; },
    (run) => { run.run_id = "phase20-20261013T060606Z-abcdef123456"; },
    (run) => { run.stage_ids = ["stage-one"]; },
  ]) withInitializedRun(({ localRoot, localRunId, directory }) => {
    const run = JSON.parse(readFileSync(path.join(directory, "run.json"), "utf8"));
    mutate(run);
    writeFileSync(path.join(directory, "run.json"), JSON.stringify(run));
    assert.throws(() => readV12CalendarRunState({ root: localRoot, runId: localRunId, stageIds: stages }), /run_state_invalid/u);
  });

  withInitializedRun(({ localRoot, localRunId, directory }) => {
    writeFileSync(path.join(directory, "stages/not-a-stage.txt"), "{}");
    assert.throws(() => readV12CalendarRunState({ root: localRoot, runId: localRunId, stageIds: stages }), /stage_file_invalid/u);
  });

  for (const [name, result] of [
    ["001-stage-one.json", { schema_version: 1, stage_id: "stage-one", status: "COMPLETE", artifact_sha256: "a".repeat(64), extra: true }],
    ["001-stage-one.json", { schema_version: 2, stage_id: "stage-one", status: "COMPLETE", artifact_sha256: "a".repeat(64) }],
    ["001-stage-one.json", { schema_version: 1, stage_id: "unknown", status: "COMPLETE", artifact_sha256: "a".repeat(64) }],
    ["001-stage-one.json", { schema_version: 1, stage_id: "stage-one", status: "PENDING", artifact_sha256: "a".repeat(64) }],
    ["001-stage-one.json", { schema_version: 1, stage_id: "stage-one", status: "COMPLETE", artifact_sha256: "bad" }],
    ["002-stage-two.json", { schema_version: 1, stage_id: "stage-one", status: "COMPLETE", artifact_sha256: "a".repeat(64) }],
  ]) withInitializedRun(({ localRoot, localRunId, directory }) => {
    writeFileSync(path.join(directory, "stages", name), JSON.stringify(result));
    assert.throws(() => readV12CalendarRunState({ root: localRoot, runId: localRunId, stageIds: stages }), /stage_result_invalid/u);
  });

  for (const mutate of [
    (terminal) => { terminal.extra = true; },
    (terminal) => { terminal.schema_version = 2; },
    (terminal) => { terminal.run_id = "phase20-20261013T060606Z-abcdef123456"; },
    (terminal) => { terminal.status = "FAILED"; },
    (terminal) => { terminal.completed_stage_count = 0; },
    (terminal) => { terminal.failed_stage_count = 1; },
  ]) withInitializedRun(({ localRoot, localRunId, directory }) => {
    recordV12CalendarStageResult({ root: localRoot, runId: localRunId, stageIds: stages, stageId: "stage-one", status: "COMPLETE", artifactSha256: "a".repeat(64) });
    recordV12CalendarStageResult({ root: localRoot, runId: localRunId, stageIds: stages, stageId: "stage-two", status: "COMPLETE", artifactSha256: "b".repeat(64) });
    const terminal = JSON.parse(readFileSync(path.join(directory, "terminal.json"), "utf8"));
    mutate(terminal);
    writeFileSync(path.join(directory, "terminal.json"), JSON.stringify(terminal));
    assert.throws(() => readV12CalendarRunState({ root: localRoot, runId: localRunId, stageIds: stages }), /terminal_state_invalid/u);
  });
  withInitializedRun(({ localRoot, localRunId, directory }) => {
    writeFileSync(path.join(directory, "terminal.json"), JSON.stringify({ schema_version: 1, run_id: localRunId, status: "IN_PROGRESS", completed_stage_count: 0, failed_stage_count: 0 }));
    assert.throws(() => readV12CalendarRunState({ root: localRoot, runId: localRunId, stageIds: stages }), /terminal_state_invalid/u);
  });
});

test("comparison fixture CLI and final verifier fixture route are executable", () => {
  assert.deepEqual(executeV12CalendarComparisonFixture(["--fixture", comparisonFixturePath, "--verify"]), {
    status: "REVIEW_REQUIRED",
    native_execution: "NOT_RUN",
    host_only: true,
  });
  assert.throws(() => executeV12CalendarComparisonFixture([]), /fixture_argument_invalid/u);
  const comparisonIo = captureIo();
  assert.equal(runV12CalendarComparisonCli(["--fixture", comparisonFixturePath, "--verify"], comparisonIo.io), 0);
  assert.match(comparisonIo.stdout[0], /"host_only":true/u);
  const comparisonErrorIo = captureIo();
  assert.equal(runV12CalendarComparisonCli([], comparisonErrorIo.io), 1);
  assert.match(comparisonErrorIo.stderr[0], /fixture_argument_invalid/u);
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-bad-fixture-"));
  try {
    const bad = path.join(root, "bad.json");
    writeFileSync(bad, JSON.stringify({ mode: "wrong", png_base64: "x" }));
    assert.throws(() => executeV12CalendarComparisonFixture(["--fixture", bad]), /fixture_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  assert.equal(executeV12CalendarEvidenceVerifier({
    args: ["--fixture", "scripts/fixtures/v12-calendar-evidence/complete.json"],
  }).status, "REVIEW_REQUIRED");
  const verifierIo = captureIo();
  assert.equal(runV12CalendarEvidenceVerifierCli({
    args: ["--fixture", "scripts/fixtures/v12-calendar-evidence/complete.json"],
  }, verifierIo.io), 0);
  assert.match(verifierIo.stdout[0], /"ok":true/u);
  const verifierErrorIo = captureIo();
  assert.equal(runV12CalendarEvidenceVerifierCli({ args: [] }, verifierErrorIo.io), 1);
  assert.match(verifierErrorIo.stderr[0], /argument_invalid/u);
  assert.throws(() => executeV12CalendarEvidenceVerifier({ args: [] }), /argument_invalid/u);
  assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["x", "y"] }), /argument_invalid/u);
  assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--manifest", "build.json"] }), /argument_invalid/u);
  assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--automated-only"] }), /argument_invalid/u);
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const invalidPackage = structuredClone(packageJson);
  invalidPackage.scripts["verify:v12:calendar"] = "false";
  assert.throws(() => validateV12CalendarPackageScripts(invalidPackage), /package_scripts_invalid/u);
  assert.throws(() => validateV12CalendarPackageScripts(null), /package_scripts_invalid/u);
});

test("final verifier rejects invalid fixture and missing or linked live inputs before evidence validation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-verifier-boundaries-"));
  const currentIdentity = { head: manifest().base_head, source: manifest().source_tree_sha256 };
  try {
    const badFixturePath = path.join(root, "bad-fixture.json");
    const badFixture = fixture();
    badFixture.host_only_fixture = false;
    writeFileSync(badFixturePath, JSON.stringify(badFixture));
    assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--fixture", badFixturePath], root }), /fixture_invalid/u);

    assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--manifest", "missing.json", "--automated-only"], root, currentIdentity }), /manifest_missing/u);
    const realManifestPath = path.join(root, "real-build.json");
    const manifestPath = path.join(root, "build.json");
    writeFileSync(realManifestPath, JSON.stringify(manifest()));
    symlinkSync(realManifestPath, manifestPath);
    assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--manifest", "build.json", "--automated-only"], root, currentIdentity }), /manifest_missing/u);
    rmSync(manifestPath);
    writeFileSync(manifestPath, JSON.stringify(manifest()));
    assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--manifest", "build.json", "--automated-only"], root, currentIdentity }), /evidence_missing/u);

    const evidenceDirectory = path.join(root, "evidence");
    mkdirSync(evidenceDirectory);
    const realEvidencePath = path.join(root, "real-evidence.json");
    writeFileSync(realEvidencePath, JSON.stringify(fixture()));
    symlinkSync(realEvidencePath, path.join(evidenceDirectory, "calendar-evidence.json"));
    assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--manifest", "build.json", "--automated-only"], root, currentIdentity }), /evidence_missing/u);
    rmSync(path.join(evidenceDirectory, "calendar-evidence.json"));
    writeFileSync(path.join(evidenceDirectory, "calendar-evidence.json"), JSON.stringify(fixture()));
    assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--manifest", "build.json", "--automated-only"], root, currentIdentity }), /live_evidence_identity_invalid/u);

    const mismatched = fixture();
    mismatched.host_only_fixture = false;
    mismatched.manifest.source_tree_sha256 = "0".repeat(64);
    writeFileSync(path.join(evidenceDirectory, "calendar-evidence.json"), JSON.stringify(mismatched));
    assert.throws(() => executeV12CalendarEvidenceVerifier({ args: ["--manifest", "build.json", "--automated-only"], root, currentIdentity }), /live_evidence_identity_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("artifact verifier rejects empty, duplicate, root, missing, empty-byte, and size-mismatched descriptors", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-artifact-coverage-"));
  try {
    const bytes = Buffer.from("evidence");
    mkdirSync(path.join(root, "evidence"));
    writeFileSync(path.join(root, "evidence/ok.json"), bytes);
    const descriptor = { path: "evidence/ok.json", sha256: hash(bytes), size_bytes: bytes.length };
    assert.equal(verifyV12CalendarArtifactSet([descriptor], { root }), true);
    assert.throws(() => verifyV12CalendarArtifactSet([], { root }), /artifact_set_invalid/u);
    assert.throws(() => verifyV12CalendarArtifactSet([descriptor, descriptor], { root }), /artifact_duplicate/u);
    assert.throws(() => verifyV12CalendarArtifactSet([{ path: ".", sha256: hash(bytes) }], { root }), /artifact_path_invalid/u);
    assert.throws(() => verifyV12CalendarArtifactSet([{ path: "evidence/missing.json", sha256: hash(bytes) }], { root }), /artifact_path_invalid/u);
    writeFileSync(path.join(root, "evidence/empty.json"), "");
    assert.throws(() => verifyV12CalendarArtifactSet([{ path: "evidence/empty.json", sha256: hash("") }], { root }), /artifact_hash_invalid/u);
    assert.throws(() => verifyV12CalendarArtifactSet([{ ...descriptor, size_bytes: bytes.length + 1 }], { root }), /artifact_hash_invalid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("final evidence validator rejects every malformed envelope, identity, functional, route, deviation, and diagnostic branch", () => {
  const valid = fixture();
  assert.equal(validateV12CalendarEvidence(valid).status, "REVIEW_REQUIRED");
  mutateAndReject(valid, [
    (value) => { value.schema_version = 2; },
    (value) => { value.suite = "wrong"; },
    (value) => { value.run_id = "wrong"; },
    (value) => { value.native_execution = "UNKNOWN"; },
    (value) => { value.acceptance_owner = "phase16"; },
    (value) => { value.host_only_fixture = false; value.run_id = "phase20-20261013T070707Z-abcdef123456"; },
    (value) => { value.identity.base_head = "bad"; },
    (value) => { value.identity.source_tree_sha256 = "bad"; },
    (value) => { value.identity.source_manifest_sha256 = "bad"; },
    (value) => { value.identity.apk_sha256 = "bad"; },
    (value) => { value.identity.installed_apk_sha256 = "bad"; },
    (value) => { value.identity.device_identity_sha256 = "bad"; },
    (value) => { value.identity.report_sha256 = "bad"; },
    (value) => { value.identity.package = "wrong"; },
    (value) => { value.manifest.base_head = "0".repeat(40); },
    (value) => { value.manifest.source_tree_sha256 = "0".repeat(64); },
    (value) => { value.manifest.source_manifest_sha256 = "0".repeat(64); },
    (value) => { value.manifest.package = "wrong"; },
    (value) => { value.manifest.apk.sha256 = "0".repeat(64); },
    (value) => { value.manifest.installed_apk.sha256 = "0".repeat(64); },
    (value) => { value.manifest.device.identity_sha256 = "0".repeat(64); },
    (value) => { value.manifest.report_sha256 = "0".repeat(64); },
    (value) => { value.functional_cases = null; },
    (value) => { value.functional_cases.pop(); },
    (value) => { value.functional_cases[1].id = value.functional_cases[0].id; },
    (value) => { [value.functional_cases[0], value.functional_cases[1]] = [value.functional_cases[1], value.functional_cases[0]]; },
    (value) => { value.functional_cases[0].status = "UNKNOWN"; },
    (value) => { value.functional_cases[0].native_execution = "EXECUTED"; },
    (value) => { value.functional_cases[0].observations.timestamps_ms = null; },
    (value) => { value.functional_cases[0].observations.timestamps_ms = [1, 2]; },
    (value) => { value.functional_cases[0].observations.timestamps_ms = [1, Number.NaN, 3]; },
    (value) => { value.functional_cases[0].observations.timestamps_ms = [1, 1, 2]; },
    (value) => { value.functional_cases[0].observations.geometry_monotonic = false; },
    (value) => { value.functional_cases[0].observations.semantics_monotonic = false; },
    (value) => { value.functional_cases[0].observations.focus_ring_dp = 2; },
    (value) => { value.functional_cases[0].observations.focus_clearance_dp = 3; },
    (value) => { value.functional_cases[0].status = "PASS"; },
    (value) => { value.functional_cases[0].observations.synthetic = false; },
    (value) => { value.functional_cases[0].artifact.path = ""; },
    (value) => { value.functional_cases[0].artifact.sha256 = "bad"; },
    (value) => { value.functional_cases[0].artifact.size_bytes = 0; },
    (value) => { value.functional_cases[0].artifact.size_bytes = 0.5; },
    (value) => { value.route_journeys = null; },
    (value) => { value.route_journeys.pop(); },
    (value) => { value.route_journeys[1].id = value.route_journeys[0].id; },
    (value) => { [value.route_journeys[0], value.route_journeys[1]] = [value.route_journeys[1], value.route_journeys[0]]; },
    (value) => { value.route_journeys[0].status = "FAIL"; },
    (value) => { value.route_journeys[0].execution = "mock"; },
    (value) => { value.route_journeys[0].actual_route = false; },
    (value) => { value.route_journeys[0].actual_loader = false; },
    (value) => { value.route_journeys[0].back_restored = false; },
    (value) => { value.route_journeys[0].focus.ring_dp = 2; },
    (value) => { value.route_journeys[0].focus.clearance_dp = 3; },
    (value) => { value.route_journeys[0].durable_identity_sha256 = "bad"; },
    (value) => { value.route_journeys[0].source_digest_before = "bad"; },
    (value) => { value.route_journeys[0].source_digest_after = "0".repeat(64); },
    (value) => { value.route_journeys[0].command_ledger = null; },
    (value) => { value.route_journeys[0].command_ledger = ["mutation"]; },
    (value) => { value.route_journeys[0].activation = "voice"; },
    (value) => { value.route_journeys.forEach((entry) => { entry.activation = "touch"; }); },
    (value) => { value.route_journeys.forEach((entry) => { entry.activation = "keyboard"; }); },
    (value) => { value.deviations = null; },
    (value) => { value.deviations[1].id = value.deviations[0].id; },
    (value) => { value.deviations[0].owner_decision = "pending"; },
    (value) => { value.deviations[0].owner_decision_date = "2026-10-08"; },
    (value) => { value.deviations[0].technical_status = "UNKNOWN"; },
    (value) => { value.deviations[0].technical_status = "PASS"; },
    (value) => { value.deviations[0].classification = "PASS"; },
    (value) => { value.comparison.identity.source_manifest_sha256 = "0".repeat(64); },
    (value) => { value.comparison.native_execution = "EXECUTED"; },
    (value) => { value.diagnostics.native_execution = "EXECUTED"; },
    (value) => { value.diagnostics.status = "PASS"; },
    (value) => { value.diagnostics.acceptance_owner = "phase16"; },
    (value) => { value.diagnostics.verdict = "PASS"; },
    (value) => { value.status = "PASS"; },
    (value) => { value.all_pass = true; },
  ], (value) => validateV12CalendarEvidence(value));
});

test("live evidence exercises synthetic rejection, technical failure, review, and accepted-deviation linkage", () => {
  const valid = liveEvidence();
  assert.equal(validateV12CalendarEvidence(valid).status, "PASS");

  const synthetic = structuredClone(valid);
  synthetic.functional_cases[0].observations.synthetic = true;
  assert.throws(() => validateV12CalendarEvidence(synthetic), /live_case_synthetic/u);

  mutateAndReject(valid, [
    (value) => { value.deviations[0].evidence_hashes = null; },
    (value) => { value.deviations[0].evidence_hashes = []; },
    (value) => { value.deviations[0].evidence_hashes = ["bad"]; },
    (value) => { value.deviations[0].classification = "REVIEW_REQUIRED"; },
    (value) => { value.deviations[0] = { ...value.deviations[0], technical_status: "FAIL", classification: "PASS", measured_reason_code: "target_geometry_mismatch" }; },
    (value) => { value.deviations[0] = { ...value.deviations[0], technical_status: "FAIL", classification: "FAIL", measured_reason_code: "BAD" }; },
    (value) => { value.deviations[0] = { ...value.deviations[0], technical_status: "FAIL", classification: "FAIL" }; },
    (value) => { value.deviations[0] = { ...value.deviations[0], technical_status: "REVIEW_REQUIRED", classification: "REVIEW_REQUIRED" }; },
  ], (value) => validateV12CalendarEvidence(value));

  const accepted = structuredClone(valid);
  accepted.deviations[0].classification = "accepted_deviation";
  accepted.comparison.records[0].classification = "accepted_deviation";
  accepted.comparison.records[0].deviation_id = "DEV-01";
  accepted.comparison.status = "REVIEW_REQUIRED";
  accepted.status = "REVIEW_REQUIRED";
  accepted.all_pass = false;
  assert.equal(validateV12CalendarEvidence(accepted).status, "REVIEW_REQUIRED");
  mutateAndReject(accepted, [
    (value) => { value.deviations[0].evidence_complete = false; },
    (value) => { value.deviations[0].technical_status = "REVIEW_REQUIRED"; },
    (value) => { value.deviations[0].classification = "PASS"; },
  ], (value) => validateV12CalendarEvidence(value));

  const strayDeviation = structuredClone(valid);
  strayDeviation.comparison.records[0].deviation_id = "DEV-01";
  assert.throws(() => validateV12CalendarEvidence(strayDeviation), /comparison_schema_invalid|comparison_deviation_invalid/u);

  for (const mutate of [
    (value) => { value.functional_cases[0].status = "FAIL"; },
    (value) => { value.comparison.records[0].classification = "FAIL"; value.comparison.status = "FAIL"; },
    (value) => { value.deviations[0] = { ...value.deviations[0], technical_status: "FAIL", classification: "FAIL", measured_reason_code: "target_geometry_mismatch" }; },
  ]) {
    const failed = structuredClone(valid);
    mutate(failed);
    failed.status = "FAIL";
    failed.all_pass = false;
    assert.equal(validateV12CalendarEvidence(failed).status, "FAIL");
  }

  for (const mutate of [
    (value) => { value.functional_cases[0].status = "REVIEW_REQUIRED"; },
    (value) => { value.comparison.records[0].classification = "REVIEW_REQUIRED"; value.comparison.status = "REVIEW_REQUIRED"; },
    (value) => { value.deviations[0] = { ...value.deviations[0], technical_status: "REVIEW_REQUIRED", evidence_complete: false, classification: "REVIEW_REQUIRED", evidence_hashes: [] }; },
  ]) {
    const review = structuredClone(valid);
    mutate(review);
    review.status = "REVIEW_REQUIRED";
    review.all_pass = false;
    assert.equal(validateV12CalendarEvidence(review).status, "REVIEW_REQUIRED");
  }
});

test("checked reference map rejects every malformed structural field", () => {
  const map = JSON.parse(readFileSync(".planning/phases/16-calendar-parity/16-REFERENCE-MAP.json", "utf8"));
  mutateAndReject(map, [
    (value) => { value.schema_version = 2; },
    (value) => { value.prototype_revision = 17; },
    (value) => { value.source_manifest_sha256 = "bad"; },
    (value) => { value.captures = null; },
    (value) => { value.captures = []; },
    (value) => { value.case_ledger = null; },
    (value) => { value.captures[0].id = ""; },
    (value) => { value.captures[1].id = value.captures[0].id; },
    (value) => { value.captures[0].requirement_ids = []; },
    (value) => { value.captures[0].requirement_ids = ["BAD-01"]; },
    (value) => { value.captures[0].reference.sha256 = "bad"; },
    (value) => { value.captures[0].reference.width = 0; },
    (value) => { value.captures[0].reference.height = 0; },
    (value) => { value.captures[0].configuration.theme = "Sepia"; },
    (value) => { value.captures[0].configuration.viewport.width = Number.NaN; },
    (value) => { value.captures[0].configuration.viewport.height = Number.NaN; },
    (value) => { value.captures[0].configuration.orientation = "square"; },
    (value) => { value.captures[0].configuration.font_scale = Number.NaN; },
    (value) => { value.captures[0].configuration.motion = "spring"; },
    (value) => { value.captures[0].configuration.input = "voice"; },
    (value) => { value.captures[0].configuration.fixture = null; },
    (value) => { value.case_ledger.case_ids = []; },
  ], (value) => validateV12CalendarReferenceMap(value));
});

test("comparison generation rejects every untrusted map, trace, image, and output branch", () => {
  const value = comparisonFixture();
  let sequence = 0;
  const reject = (mutate, pattern) => {
    const candidate = { map: structuredClone(value.map), run: structuredClone(value.run) };
    mutate(candidate);
    assert.throws(() => compareV12Calendar({
      ...candidate,
      outputDirectory: path.join(value.directory, `reject-${sequence += 1}`),
    }), pattern);
  };
  try {
    reject(({ run }) => { run.schema_version = 2; }, /run_identity_invalid/u);
    reject(({ run }) => { run.status = "EXECUTED"; }, /run_identity_invalid/u);
    reject(({ run }) => { run.run_id = "wrong"; }, /run_identity_invalid/u);
    reject(({ run }) => { run.source_manifest_sha256 = "0".repeat(64); }, /run_identity_invalid/u);
    reject(({ run }) => { run.source_tree_sha256 = "bad"; }, /run_identity_invalid/u);
    reject(({ run }) => { run.captures = null; }, /run_identity_invalid/u);
    reject(({ run }) => { run.identity.source_tree_sha256 = "0".repeat(64); }, /run_identity_invalid/u);
    reject(({ run }) => { run.identity.source_manifest_sha256 = "0".repeat(64); }, /run_identity_invalid/u);
    reject(({ run }) => { run.captures = []; }, /capture_set_invalid/u);
    reject(({ run }) => { run.captures.push(structuredClone(run.captures[0])); }, /capture_set_invalid/u);
    assert.throws(() => compareV12Calendar({ map: value.map, run: value.run, outputDirectory: "/etc/v12-calendar-output" }), /output_escape/u);
    reject(({ run }) => { run.captures[0].id = "unknown"; }, /capture_unknown/u);
    reject(({ run }) => { run.captures[0].classification = "PASS"; }, /classification_invalid/u);
    reject(({ run }) => { run.captures[0].differences = null; }, /classification_invalid/u);
    reject(({ run }) => { run.captures[0].trace.synthetic = false; }, /trace_invalid/u);
    reject(({ run }) => { run.captures[0].trace.samples = null; }, /trace_invalid/u);
    reject(({ run }) => { run.captures[0].trace.samples.push({ kind: "cancel" }); }, /privacy_schema_invalid/u);
    reject(({ run }) => { run.captures[0].trace.samples[0].dx = "bad"; }, /trace_invalid/u);
    reject(({ run }) => { run.captures[0].trace.samples[1].viewportWidth = Number.NaN; }, /trace_invalid/u);
    reject(({ run }) => { run.captures[0].trace.samples[3].semanticOffset = 0; }, /trace_stage_semantic_invalid/u);
    reject(({ run }) => { run.captures[0].semantics.focus_ring_dp = 2; }, /semantic_mismatch/u);
    reject(({ run }) => { run.captures[0].semantics.focus_clearance_dp = 3; }, /semantic_mismatch/u);
    reject(({ run }) => { run.captures[0].semantics.authority = "mutating"; }, /semantic_mismatch/u);
    reject(({ run }) => { run.captures[0].semantics.target = null; }, /privacy_schema_invalid/u);
    reject(({ run }) => { run.captures[0].semantics.target = "employee-session"; }, /privacy_schema_invalid/u);
    reject(({ run }) => { run.captures[0].native.path = ""; }, /path_invalid/u);
    reject(({ run }) => { run.captures[0].native.path = "/etc/passwd"; }, /path_escape/u);
    reject(({ run }) => { run.captures[0].native.path = path.join(value.directory, "missing.png"); }, /path_unsafe/u);
    const linkedPath = path.join(value.directory, "linked.png");
    symlinkSync(path.join(value.directory, "native.png"), linkedPath);
    reject(({ run }) => { run.captures[0].native.path = linkedPath; }, /path_unsafe/u);
    reject(({ run }) => { run.captures[0].native.sha256 = "0".repeat(64); }, /image_identity_invalid/u);
    reject(({ run }) => { run.captures[0].native.height = 2; }, /image_identity_invalid/u);
    reject(({ map }) => { map.captures[0].reference.sha256 = "0".repeat(64); }, /reference_stale/u);
    reject(({ map }) => { map.case_ledger.case_ids = null; }, /ledger_required_case_missing/u);
    reject(({ map }) => {
      delete map.host_only_fixture;
      map.source_manifest = ".planning/design/v1.2-browser-evidence/source-manifest.json";
    }, /path_invalid/u);
    reject(({ map }) => {
      delete map.host_only_fixture;
      map.source_manifest = ".planning/design/v1.2-browser-evidence/source-manifest.json";
      map.captures[0].reference.path = ".planning/design/v1.2-browser-evidence/alice-private-reference.png";
    }, /path_invalid/u);

    const invalidPng = path.join(value.directory, "invalid.png");
    writeFileSync(invalidPng, "not-png");
    reject(({ run }) => { run.captures[0].native = { path: invalidPng, sha256: hash("not-png"), width: 1, height: 1 }; }, /png_invalid/u);

    const changed = new PNG({ width: 1, height: 1 });
    changed.data.set([9, 8, 7, 255]);
    const changedBytes = PNG.sync.write(changed);
    const changedPath = path.join(value.directory, "changed.png");
    writeFileSync(changedPath, changedBytes);
    const changedRun = structuredClone(value.run);
    changedRun.captures[0].native = { path: changedPath, sha256: hash(changedBytes), width: 1, height: 1 };
    assert.equal(compareV12Calendar({ map: value.map, run: changedRun, outputDirectory: path.join(value.directory, "changed-output") }).records.length, 1);

    const wide = new PNG({ width: 2, height: 1 });
    wide.data.set([1, 2, 3, 255, 1, 2, 3, 255]);
    const wideBytes = PNG.sync.write(wide);
    const widePath = path.join(value.directory, "wide.png");
    writeFileSync(widePath, wideBytes);
    reject(({ run }) => { run.captures[0].native = { path: widePath, sha256: hash(wideBytes), width: 2, height: 1 }; }, /image_identity_invalid|geometry_mismatch/u);

    const fullTraceRun = structuredClone(value.run);
    fullTraceRun.captures[0].trace = {
      ...fullTraceRun.captures[0].trace,
      samples: fullTraceRun.captures[0].trace.samples.map((sample, index) => ({ ...sample, elapsedMs: index + 1, synthetic: true })),
    };
    assert.equal(compareV12Calendar({ map: value.map, run: fullTraceRun, outputDirectory: path.join(value.directory, "full-trace") }).records.length, 1);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("shared comparison validation rejects malformed host and live envelopes", () => {
  const value = comparisonFixture();
  try {
    const host = structuredClone(compareV12Calendar({ map: value.map, run: value.run, outputDirectory: path.join(value.directory, "host") }));
    mutateAndReject(host, [
      (entry) => { entry.schema_version = 1; },
      (entry) => { entry.suite = "wrong"; },
      (entry) => { entry.mode = "wrong"; },
      (entry) => { entry.native_execution = "EXECUTED"; },
      (entry) => { entry.phase20_deferred = false; },
      (entry) => { entry.records = null; },
      (entry) => { entry.records = []; },
      (entry) => { entry.run_id = "wrong"; },
      (entry) => { entry.identity.base_head = "bad"; },
      (entry) => { entry.identity.source_tree_sha256 = "bad"; },
      (entry) => { entry.identity.source_manifest_sha256 = "bad"; },
      (entry) => { entry.identity.package = "wrong"; },
      (entry) => { entry.identity.apk_sha256 = "bad"; },
      (entry) => { entry.identity.installed_apk_sha256 = "e".repeat(64); },
      (entry) => { entry.identity.device_identity_sha256 = "bad"; },
      (entry) => { entry.identity.report_sha256 = "bad"; },
      (entry) => { entry.case_registry.sha256 = "0".repeat(64); },
      (entry) => { entry.case_ledger.case_ids = []; },
      (entry) => { entry.case_results.status = "PASS"; },
      (entry) => { entry.case_results.native_execution = "EXECUTED"; },
      (entry) => { entry.case_results.required_case_count = 1; },
      (entry) => { entry.records[0].classification = "UNKNOWN"; },
      (entry) => { entry.records[0].differences = null; },
      (entry) => { entry.records[0].artifacts.reference.sha256 = "bad"; },
      (entry) => { entry.status = "PASS"; },
    ], (entry) => validateV12CalendarComparison(entry));
    assert.throws(() => validateV12CalendarComparison(host, { expectedRunId: "wrong" }), /result_identity_invalid/u);
    assert.throws(() => validateV12CalendarComparison(host, { expectedIdentity: { ...host.identity, report_sha256: "0".repeat(64) } }), /result_identity_invalid/u);

    const live = structuredClone(host);
    live.mode = "live-executed";
    live.run_id = "phase20-20261013T040404Z-abcdef123456";
    live.native_execution = "EXECUTED";
    live.phase20_deferred = false;
    live.status = "PASS";
    live.records[0].classification = "PASS";
    const artifactRoot = `artifacts/native/v1.2/${live.run_id}`;
    for (const kind of ["reference", "native", "overlay", "difference", "mask", "record"]) {
      live.records[0].artifacts[kind].path = `${artifactRoot}/comparison/${live.records[0].id}/${kind === "record" ? "comparison.json" : `${kind}.png`}`;
    }
    live.case_ledger = structuredClone(V12_CALENDAR_CASE_LEDGER_DESCRIPTOR);
    live.case_results = V12_CALENDAR_REQUIRED_CASES.map((entry) => ({ id: entry.id, case_sha256: entry.case_sha256, status: "PASS", native_execution: "EXECUTED", artifact: { path: `${artifactRoot}/cases/${entry.case_sha256}.json`, sha256: "a".repeat(64) } }));
    assert.equal(validateV12CalendarComparison(live), true);
    const explained = structuredClone(live);
    explained.records[0].differences = [{ kind: "visual", explained: true }];
    assert.equal(validateV12CalendarComparison(explained), true);
    const unknownDifference = structuredClone(explained);
    unknownDifference.records[0].differences[0].kind = "private-route-data";
    assert.throws(() => validateV12CalendarComparison(unknownDifference), /privacy_schema_invalid/u);
    const unexplainedDifference = structuredClone(explained);
    unexplainedDifference.records[0].differences[0].explained = false;
    assert.throws(() => validateV12CalendarComparison(unexplainedDifference), /difference_unexplained/u);
    mutateAndReject(live, [
      (entry) => { entry.run_id = "bad"; },
      (entry) => { entry.case_results = null; },
      (entry) => { entry.case_results.pop(); },
      (entry) => { entry.case_results[0].id = "wrong"; },
      (entry) => { entry.case_results[0].status = "UNKNOWN"; },
      (entry) => { entry.case_results[0].native_execution = "NOT_RUN"; },
      (entry) => { entry.case_results[0].artifact.sha256 = "bad"; },
      (entry) => { entry.case_results[0].status = "FAIL"; },
      (entry) => { entry.case_results[0].status = "REVIEW_REQUIRED"; },
    ], (entry) => validateV12CalendarComparison(entry));
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});
