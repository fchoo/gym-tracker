import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_CHUNK_MARKER,
  V12_CALENDAR_STAGE_IDS,
  analyzeV12CalendarScreenshot,
  createV12CalendarDriverReceipt,
  deriveV12CalendarStageResult,
  hashV12CalendarObservationBody,
  selectV12CalendarTerminalMarker,
  validateV12CalendarStageCoverage,
} from "./v12-calendar-observation-contract.mjs";
import { junitOutcome, worse } from "./v12-production-domain-receipts.mjs";
import { createProductionNativeRuntime } from "./v12-production-native-runtime.mjs";
import { resolveV12NativeExecutionTools } from "./v12-native-execution-origin.mjs";
import {
  canonicalV12CalendarArtifactDescriptor,
  createV12CalendarArtifactTransport,
} from "./v12-calendar-artifact-transport.mjs";
import {
  V12_CALENDAR_PROBE_RECEIPT_MARKER,
  V12_CALENDAR_REQUIREMENT_DEFINITIONS,
  V12_CALENDAR_REQUIREMENT_PROBE_COUNT,
  createV12CalendarProbeReceipt,
  validateV12CalendarProbeReceipt,
} from "./v12-calendar-requirement-map.mjs";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const FLOW = "maestro/v1.2/calendar.yaml";
const REQUIREMENTS_FLOW = "maestro/v1.2/calendar-requirements.yaml";
const FIXTURE_SOURCE = "src/testing/phase20CalendarFixture.ts";
const FIXTURE_ID = "v12-calendar-isolated-facts-v1";
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const ATTESTATION_KEYS = Object.freeze([
  "schema_version", "action", "launcher_source_sha256", "run_id", "build_profile", "suite",
  "source_tree_sha256", "apk_sha256", "installed_apk_sha256", "apk_signature_sha256",
  "device_identity_sha256", "package",
]);
const PAYLOAD_KEYS = new Set(["run_id", "lease", "settings", "flow_sha256", "flow_revision"]);
const SETTINGS = Object.freeze({
  font_scale: "system",
  accelerometer_rotation: "system",
  user_rotation: "system",
  window_animation_scale: "global",
  transition_animation_scale: "global",
  animator_duration_scale: "global",
  airplane_mode_on: "global",
});
const LAUNCHER = fileURLToPath(new URL("./v12-production-native-adapter-launcher.mjs", import.meta.url));

const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const hashBytes = (value) => createHash("sha256").update(value).digest("hex");

function fail(code) {
  throw new Error(`calendar_action_${code}`);
}

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function validateProductionCalendarActionRequest(payload, attestation, { launcherSourceSha256 }) {
  if (!exact(attestation, ATTESTATION_KEYS)
    || attestation.schema_version !== 1
    || attestation.action !== "calendar"
    || attestation.launcher_source_sha256 !== launcherSourceSha256
    || attestation.run_id !== payload?.run_id
    || attestation.build_profile !== "development-test"
    || attestation.suite !== "v1.2-acceptance"
    || attestation.package !== PACKAGE
    || !RUN_ID.test(attestation.run_id ?? "")
    || !ATTESTATION_KEYS.filter((key) => key.endsWith("sha256")).every((key) => HASH.test(attestation[key] ?? ""))) fail("attestation_invalid");
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)
    || Object.keys(payload).some((key) => !PAYLOAD_KEYS.has(key))
    || payload.flow_revision !== V12_CALENDAR_FLOW_REVISION
    || !HASH.test(payload.flow_sha256 ?? "")) fail("request_invalid");
  return true;
}

export function createV12CalendarStageInvocation({ stageId, order, nonce, flowSha256 }) {
  if (V12_CALENDAR_STAGE_IDS[order] !== stageId || !NONCE.test(nonce ?? "") || !HASH.test(flowSha256 ?? "")) fail("stage_identity_invalid");
  return Object.freeze({
    stageId,
    kind: "stage",
    order,
    nonce,
    flow: FLOW,
    variables: Object.freeze({
      V12_CALENDAR_STAGE: stageId,
      V12_CALENDAR_NONCE: nonce,
      V12_CALENDAR_FLOW_SHA256: flowSha256,
      V12_CALENDAR_FLOW_REVISION,
      V12_CALENDAR_POINTER_DRIVER: "adb-input-motionevent-v1",
    }),
  });
}

export function createV12CalendarProbeInvocation({ definition, probeId, order, nonce, flowSha256, fixtureSourceSha256 }) {
  if (!V12_CALENDAR_REQUIREMENT_DEFINITIONS.includes(definition)
    || !definition.probe_ids.includes(probeId)
    || !Number.isSafeInteger(order) || order < 0
    || !NONCE.test(nonce ?? "") || !HASH.test(flowSha256 ?? "") || !HASH.test(fixtureSourceSha256 ?? "")) fail("requirement_identity_invalid");
  return Object.freeze({
    stageId: `${definition.requirement_id}-${probeId}`,
    testcaseId: `${definition.requirement_id}:${probeId}`,
    kind: "requirement-probe",
    order,
    nonce,
    definition,
    probeId,
    flow: REQUIREMENTS_FLOW,
    variables: Object.freeze({
      V12_CALENDAR_REQUIREMENT: definition.requirement_id,
      V12_CALENDAR_EVIDENCE_ID: definition.evidence_id,
      V12_CALENDAR_PROBE: probeId,
      V12_CALENDAR_EVIDENCE_NONCE: nonce,
      V12_CALENDAR_REQUIREMENTS_SHA256: flowSha256,
      V12_CALENDAR_FIXTURE_SOURCE_SHA256: fixtureSourceSha256,
    }),
  });
}

function probeReceiptRows(logs) {
  if (typeof logs !== "string" || logs.length > 8 * 1024 * 1024) fail("probe_receipt_logs_invalid");
  const rows = [];
  for (const line of logs.split(/\r?\n/u)) {
    const index = line.indexOf(V12_CALENDAR_PROBE_RECEIPT_MARKER);
    if (index < 0) continue;
    try { rows.push(JSON.parse(line.slice(index + V12_CALENDAR_PROBE_RECEIPT_MARKER.length))); }
    catch { fail("probe_receipt_invalid"); }
  }
  return rows;
}

export function selectV12CalendarProbeReceipt({ beforeLogs, afterLogs, invocation }) {
  if (probeReceiptRows(beforeLogs).some(({ nonce }) => nonce === invocation.nonce)) fail("probe_receipt_stale");
  const rows = probeReceiptRows(afterLogs).filter(({ nonce }) => nonce === invocation.nonce);
  if (rows.length === 0) fail("probe_receipt_missing");
  if (rows.length !== 1) fail("probe_receipt_duplicate");
  try { validateV12CalendarProbeReceipt(rows[0], {
    nonce: invocation.nonce,
    flowSha256: invocation.variables.V12_CALENDAR_REQUIREMENTS_SHA256,
    fixtureSourceSha256: invocation.variables.V12_CALENDAR_FIXTURE_SOURCE_SHA256,
    requirementId: invocation.definition.requirement_id,
    evidenceId: invocation.definition.evidence_id,
    probeId: invocation.probeId,
  }); } catch { fail("probe_receipt_invalid"); }
  return rows[0];
}

function privacySafeTrace(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 8 * 1024 * 1024
    || /(?:\/Users\/|\/home\/|password="true"|(?:text|content-desc)="[^"]*(?:@|bearer|password|credential|latitude|longitude|gps))/iu.test(value)) fail("privacy_scan_failed");
}

export function resolveV12CalendarExecutionTools({ env = process.env } = {}) {
  return resolveV12NativeExecutionTools({ domain: true, env });
}

export function createV12CalendarDeviceSession(root, runId, executionTools, {
  serial = process.env.V12_DEVICE_SERIAL,
  spawn = spawnSync,
} = {}) {
  if (typeof serial !== "string" || serial.trim().length === 0) fail("device_missing");
  if (!exact(executionTools, ["execution_origin", "adb", "maestro", "unzip"])
    || !["production-attested/v1", "test-controlled/v1"].includes(executionTools.execution_origin)
    || ![executionTools.adb, executionTools.maestro, executionTools.unzip].every((file) => typeof file === "string" && path.isAbsolute(file))) fail("toolchain_invalid");
  const deadline = Date.now() + 35 * (180_000 + 60_000) + V12_CALENDAR_REQUIREMENT_PROBE_COUNT * (180_000 + 60_000);
  const command = (executable, args, { timeout = 180_000, binary = false, acceptFailure = false, cleanup = false } = {}) => {
    if (!cleanup && Date.now() >= deadline) fail("timeout");
    const result = spawn(executable, args, {
      cwd: root,
      encoding: binary ? undefined : "utf8",
      timeout: cleanup ? timeout : Math.min(timeout, Math.max(1, deadline - Date.now())),
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error || result.signal || (!acceptFailure && result.status !== 0)) fail("native_prerequisite_failed");
    return result;
  };
  const adb = (...args) => command(executionTools.adb, ["-s", serial, ...args]).stdout.trim();
  const shell = (...args) => adb("shell", args.map(quote).join(" "));
  let temporaryDirectory;
  const temporary = () => {
    if (temporaryDirectory !== undefined) return temporaryDirectory;
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), `v12-calendar-${runId}-`));
    const details = lstatSync(temporaryDirectory);
    if (details.isSymbolicLink() || !details.isDirectory()) fail("temporary_path_invalid");
    chmodSync(temporaryDirectory, 0o700);
    return temporaryDirectory;
  };
  const cleanup = () => { if (temporaryDirectory !== undefined) rmSync(temporaryDirectory, { recursive: true, force: true }); };
  const logs = () => adb("logcat", "-d", "-v", "raw", "ReactNativeJS:I", "*:S");
  const clearLogs = () => { adb("logcat", "-c"); };
  const screenshot = () => command(executionTools.adb, ["-s", serial, "exec-out", "screencap", "-p"], { binary: true }).stdout;
  const uiDump = () => command(executionTools.adb, ["-s", serial, "exec-out", "uiautomator", "dump", "/dev/tty"]).stdout;
  const boundsFor = (testId) => {
    const xml = uiDump();
    const node = [...xml.matchAll(/<node\b[^>]*>/gu)].find(([tag]) => tag.includes(`resource-id="${testId}"`) || tag.includes(`/` + `${testId}"`));
    const bounds = /bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"/u.exec(node?.[0] ?? "");
    if (bounds === null) fail("viewport_bounds_invalid");
    const [left, top, right, bottom] = bounds.slice(1).map(Number);
    if (right <= left || bottom <= top) fail("viewport_bounds_invalid");
    return { left, top, right, bottom };
  };
  const wait = (milliseconds) => { if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); };
  const drive = (driver) => {
    if (driver.protocol === "adb-runtime-toggle/v1") {
      for (const key of ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]) shell("settings", "put", "global", key, "0");
      wait(250);
      for (const testId of ["calendar-collapse-day", "calendar-day-2026-10-15"]) {
        const bounds = boundsFor(testId); const x = Math.round((bounds.left + bounds.right) / 2); const y = Math.round((bounds.top + bounds.bottom) / 2);
        command(executionTools.adb, ["-s", serial, "shell", "input", "tap", String(x), String(y)], { timeout: 10_000 }); wait(100);
      }
      return;
    }
    if (driver.protocol !== "adb-input-motionevent/v1") return;
    const bounds = boundsFor("calendar-month-viewport");
    for (const sequence of driver.sequences) {
      const horizontal = sequence.points.find(({ dx_ratio: dx }) => dx !== 0)?.dx_ratio ?? 0;
      const startX = bounds.left + (horizontal < 0 ? 0.8 : horizontal > 0 ? 0.2 : 0.5) * (bounds.right - bounds.left);
      const startY = bounds.top + 0.5 * (bounds.bottom - bounds.top);
      let priorOffset = 0;
      for (const point of sequence.points) {
        wait(point.offset_ms - priorOffset); priorOffset = point.offset_ms;
        const x = Math.round(startX + point.dx_ratio * (bounds.right - bounds.left));
        const y = Math.round(startY + point.dy_ratio * (bounds.bottom - bounds.top));
        command(executionTools.adb, ["-s", serial, "shell", "input", "motionevent", point.action, String(x), String(y)], { timeout: 10_000 });
      }
    }
  };
  const readWm = (execute, key) => {
    const shape = key === "size" ? "[1-9][0-9]{1,4}x[1-9][0-9]{1,4}" : "[1-9][0-9]{1,3}";
    const match = new RegExp(`^Physical ${key}: (${shape})(?:\\r?\\nOverride ${key}: (${shape}))?$`, "u").exec(execute("wm", key));
    if (match === null) fail("settings_invalid");
    return Object.freeze({ physical: match[1], override: match[2] ?? null });
  };
  const wm = (key) => readWm(shell, key);
  const settings = () => {
    const values = Object.fromEntries(Object.entries(SETTINGS).map(([key, namespace]) => {
    const value = shell("settings", "get", namespace, key);
    if (!/^(?:null|\d+(?:\.\d+)?)$/u.test(value)) fail("settings_invalid");
    return [key, value];
    }));
    const airplane = shell("cmd", "connectivity", "airplane-mode");
    const night = /^Night mode: (auto|yes|no|custom)$/u.exec(shell("cmd", "uimode", "night"))?.[1];
    if (!/^Airplane mode is (?:enabled|disabled)$/u.test(airplane) || night === undefined) fail("settings_invalid");
    return Object.freeze({ values, airplane, size: wm("size"), density: wm("density"), night });
  };
  const configureStage = (stageId) => {
    const size = stageId === "dev-01-padding" ? "720x1600" : "780x1688";
    shell("settings", "put", "system", "font_scale", "1");
    shell("settings", "put", "system", "accelerometer_rotation", "0");
    shell("settings", "put", "system", "user_rotation", "0");
    shell("wm", "size", size);
    shell("wm", "density", "320");
    shell("cmd", "uimode", "night", "no");
    shell("settings", "put", "global", "window_animation_scale", "1");
    shell("settings", "put", "global", "transition_animation_scale", "1");
    shell("settings", "put", "global", "animator_duration_scale", "1");
    const configured = settings();
    const animationScale = "1";
    if (Number(configured.values.font_scale) !== 1 || configured.values.accelerometer_rotation !== "0"
      || configured.values.user_rotation !== "0" || configured.size.override !== size
      || configured.density.override !== "320" || configured.night !== "no"
      || Number(configured.values.window_animation_scale) !== Number(animationScale)
      || Number(configured.values.transition_animation_scale) !== Number(animationScale)
      || Number(configured.values.animator_duration_scale) !== Number(animationScale)) fail("settings_invalid");
  };
  const maestro = (invocation) => {
    const report = path.join(temporary(), `${String(invocation.order).padStart(2, "0")}-${invocation.stageId}.xml`);
    const debug = path.join(temporary(), `${String(invocation.order).padStart(2, "0")}-${invocation.stageId}-maestro`);
    const args = ["test", "--device", serial,
      ...Object.entries(invocation.variables).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
      "--format", "junit", "--output", report, "--test-output-dir", debug,
      path.join(root, invocation.flow)];
    const result = command(executionTools.maestro, args, { acceptFailure: true });
    let xml;
    try { xml = readFileSync(report, "utf8"); chmodSync(report, 0o600); }
    catch { fail("junit_missing"); }
    return Object.freeze({ status: junitOutcome(xml, result.status), xml });
  };
  const awaitMarker = async (beforeLogs, invocation) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 60_000) {
      const afterLogs = logs();
      try {
        return selectV12CalendarTerminalMarker({
          beforeLogs,
          afterLogs,
          nonce: invocation.nonce,
          flowSha256: invocation.variables.V12_CALENDAR_FLOW_SHA256,
          stageId: invocation.stageId,
        });
      } catch (error) {
        if (error?.message !== "calendar_observation_marker_missing") throw error;
      }
      await delay(200);
    }
    fail("marker_timeout");
  };
  const awaitProbeReceipt = async (beforeLogs, invocation) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 60_000) {
      const afterLogs = logs();
      try { return selectV12CalendarProbeReceipt({ beforeLogs, afterLogs, invocation }); }
      catch (error) {
        if (error?.message !== "calendar_action_probe_receipt_missing") throw error;
      }
      await delay(200);
    }
    fail("probe_receipt_timeout");
  };
  return Object.freeze({ clearLogs, cleanup, configureStage, drive, logs, maestro, awaitMarker, awaitProbeReceipt, temporary, screenshot, settings, uiDump,
    version: () => { if (command(executionTools.maestro, ["--version"]).stdout.trim() !== "2.8.0") fail("maestro_version_invalid"); },
    standalone: () => {
      const manifest = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", runId, "build.json"), "utf8"));
      const apk = path.join(root, manifest.build.apk.path);
      const entries = command(executionTools.unzip, ["-Z1", apk]).stdout.split(/\r?\n/u);
      if (["assets/index.android.bundle", "assets/app.config"].some((entry) => entries.filter((candidate) => candidate === entry).length !== 1)) fail("standalone_required");
      let config;
      try { config = JSON.parse(command(executionTools.unzip, ["-p", apk, "assets/app.config"]).stdout); }
      catch { fail("standalone_required"); }
      if (config?.android?.package !== PACKAGE || config?.scheme !== "gymtracker-devtest"
        || config?.extra?.buildProfile !== "development-test" || config?.extra?.nativeContractsEnabled !== true
        || config?.extra?.nativeContractSuite !== "v1.2-acceptance") fail("standalone_required");
    },
  });
}

function validPng(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length >= 33
    && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && bytes.toString("ascii", 12, 16) === "IHDR"
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0;
}

export async function collectV12ProductionCalendarStages({ root, payload, io, transport }) {
  const flowSha256 = hashBytes(readFileSync(path.join(root, FLOW)));
  if (payload.flow_sha256 !== flowSha256 || payload.flow_revision !== V12_CALENDAR_FLOW_REVISION) fail("flow_invalid");
  if (!transport || typeof transport.resumeUnit !== "function" || typeof transport.appendUnit !== "function") fail("transport_invalid");
  io.version();
  io.standalone();
  const stages = [];
  const junitCases = [];
  const artifacts = [];
  for (const [order, stageId] of V12_CALENDAR_STAGE_IDS.entries()) {
    const resumed = transport.resumeUnit({ ordinal: order, kind: "stage", key: stageId });
    if (resumed !== undefined) {
      stages.push(resumed.payload.stage);
      junitCases.push(resumed.payload.junit);
      artifacts.push(...resumed.artifacts);
      continue;
    }
    const nonce = randomBytes(16).toString("hex");
    const invocation = createV12CalendarStageInvocation({ stageId, order, nonce, flowSha256 });
    const driver = createV12CalendarDriverReceipt(stageId);
    io.configureStage(stageId);
    io.clearLogs();
    const beforeLogs = io.logs();
    const junit = io.maestro(invocation);
    if (driver.protocol !== "maestro/v1") io.drive(driver);
    const marker = await io.awaitMarker(beforeLogs, invocation);
    const png = io.screenshot();
    if (!validPng(png)) fail("screenshot_invalid");
    const traceJson = JSON.stringify(marker.stage);
    const trace = Buffer.from(traceJson);
    const result = deriveV12CalendarStageResult({
      marker,
      expected: { nonce, flowSha256, stageId, order },
      driver,
      captureMeasurement: analyzeV12CalendarScreenshot(stageId, png),
      screenshotSha256: hashBytes(png),
      traceSha256: hashBytes(trace),
    });
    const status = worse(junit.status, result.status);
    const stage = Object.freeze({ ...result, status });
    const junitCase = Object.freeze({ id: stageId, order, status });
    const stem = `${String(order).padStart(2, "0")}-${stageId}`;
    const committed = transport.appendUnit({ kind: "stage", key: stageId, payload: { stage, junit: junitCase }, artifacts: [
      { stage_id: stageId, kind: "png", relative_path: `calendar/stages/${stem}.png`, bytes: png },
      { stage_id: stageId, kind: "trace", relative_path: `calendar/stages/${stem}.trace.json`, bytes: trace },
    ] });
    stages.push(committed.payload.stage);
    junitCases.push(committed.payload.junit);
    artifacts.push(...committed.artifacts);
  }
  validateV12CalendarStageCoverage(stages);
  const requirementsFlowSha256 = hashBytes(readFileSync(path.join(root, REQUIREMENTS_FLOW)));
  const fixtureSha256 = hashBytes(readFileSync(path.join(root, FIXTURE_SOURCE)));
  const requirementRecords = [];
  const requirementJunitCases = [];
  let probeOrder = 0;
  for (const definition of V12_CALENDAR_REQUIREMENT_DEFINITIONS) {
    const probeReceipts = [];
    for (const probeId of definition.probe_ids) {
      const key = `${definition.requirement_id}:${probeId}`;
      const resumed = transport.resumeUnit({ ordinal: V12_CALENDAR_STAGE_IDS.length + probeOrder, kind: "requirement", key });
      if (resumed !== undefined) {
        probeReceipts.push(resumed.payload.receipt);
        requirementJunitCases.push(resumed.payload.junit);
        artifacts.push(...resumed.artifacts);
        probeOrder += 1;
        continue;
      }
      const invocation = createV12CalendarProbeInvocation({ definition, probeId, order: probeOrder, nonce: randomBytes(16).toString("hex"), flowSha256: requirementsFlowSha256, fixtureSourceSha256: fixtureSha256 });
      io.configureStage("requirement");
      io.clearLogs();
      const beforeLogs = io.logs();
      const junit = io.maestro(invocation);
      const receipt = await io.awaitProbeReceipt(beforeLogs, invocation);
      const trace = Buffer.from(io.uiDump()); privacySafeTrace(trace.toString("utf8"));
      const png = io.screenshot(); if (!validPng(png)) fail("screenshot_invalid");
      const stem = `${String(probeOrder).padStart(2, "0")}-${definition.requirement_id}-${probeId}`;
      const junitCase = Object.freeze({ id: invocation.testcaseId, requirement_id: definition.requirement_id, probe_id: probeId, order: probeOrder, status: junit.status });
      const committed = transport.appendUnit({ kind: "requirement", key, payload: { receipt, junit: junitCase }, artifacts: [
        { requirement_id: definition.requirement_id, probe_id: probeId, kind: "png", relative_path: `calendar/requirements/${stem}.png`, bytes: png },
        { requirement_id: definition.requirement_id, probe_id: probeId, kind: "trace", relative_path: `calendar/requirements/${stem}.trace.xml`, bytes: trace },
      ] });
      probeReceipts.push(committed.payload.receipt);
      requirementJunitCases.push(committed.payload.junit);
      artifacts.push(...committed.artifacts);
      probeOrder += 1;
    }
    requirementRecords.push(Object.freeze({ requirement_id: definition.requirement_id, evidence_id: definition.evidence_id,
      native_execution: "EXECUTED", fixture_id: FIXTURE_ID, fixture_storage: "isolated-in-memory",
      fixture_source_sha256: fixtureSha256, source_digest_before: fixtureSha256, source_digest_after: fixtureSha256,
      probe_receipts: Object.freeze(probeReceipts) }));
  }
  return Object.freeze({
    flow_sha256: flowSha256,
    flow_revision: V12_CALENDAR_FLOW_REVISION,
    stages: Object.freeze(stages),
    junit_cases: Object.freeze(junitCases),
    requirements: Object.freeze({ flow_sha256: requirementsFlowSha256, fixture_id: FIXTURE_ID,
      records: Object.freeze(requirementRecords), junit_cases: Object.freeze(requirementJunitCases) }),
    artifacts: Object.freeze(artifacts),
  });
}

/**
 * Calendar-owned production action. The shared launcher intentionally does not
 * import it in this branch; the integration owner can add that single dispatch.
 */
export async function executeProductionCalendarAction(payload, attestation) {
  try {
    if (process.env.NODE_ENV === "test" || process.env.V12_NATIVE_ADAPTER_TEST_MODE !== undefined
      || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== undefined || process.env.V12_NATIVE_ADAPTER_COMMAND !== undefined) fail("test_environment_forbidden");
    const root = process.cwd();
    validateProductionCalendarActionRequest(payload, attestation, {
      launcherSourceSha256: hashBytes(readFileSync(LAUNCHER)),
    });
    const executionTools = resolveV12CalendarExecutionTools();
    const requirementsFlowSha256 = hashBytes(readFileSync(path.join(root, REQUIREMENTS_FLOW)));
    const fixtureSourceSha256 = hashBytes(readFileSync(path.join(root, FIXTURE_SOURCE)));
    const binding = Object.freeze({ schema_version: 1, run_id: attestation.run_id,
      execution_origin: executionTools.execution_origin,
      request_sha256: hashBytes(JSON.stringify({ attestation, run_id: payload.run_id, flow_sha256: payload.flow_sha256, flow_revision: payload.flow_revision })),
      flow_sha256: payload.flow_sha256, requirements_flow_sha256: requirementsFlowSha256, fixture_source_sha256: fixtureSourceSha256,
      tool_facts: Object.freeze({ adb_sha256: hashBytes(readFileSync(executionTools.adb)), maestro_sha256: hashBytes(readFileSync(executionTools.maestro)), unzip_sha256: hashBytes(readFileSync(executionTools.unzip)) }) });
    const runtime = createProductionNativeRuntime(attestation, { root, executionTools });
    const transport = createV12CalendarArtifactTransport({ root, runId: attestation.run_id, binding });
    const ownedLease = payload.lease === undefined;
    const lease = ownedLease ? runtime.acquireLease() : payload.lease;
    let runtimeSettings;
    try {
      if (ownedLease) runtimeSettings = runtime.snapshotSettings(lease);
      return await runtime.withLease({ ...payload, lease }, async () => {
        const completed = transport.loadCompleted();
        if (completed !== null) return completed;
        const io = createV12CalendarDeviceSession(root, attestation.run_id, executionTools);
        const deviceSettings = runtime.snapshotCalendarSettings(lease);
        try {
          const collected = await collectV12ProductionCalendarStages({ root, payload, io, transport });
          const receiptBody = {
            schema_version: 2, producer: "v12-calendar-native-receipt/v2", native_execution: "EXECUTED",
            run_id: attestation.run_id, source_tree_sha256: attestation.source_tree_sha256,
            apk_sha256: attestation.apk_sha256, installed_apk_sha256: attestation.installed_apk_sha256,
            apk_signature_sha256: attestation.apk_signature_sha256, device_identity_sha256: attestation.device_identity_sha256,
            launcher_source_sha256: attestation.launcher_source_sha256, flow_sha256: collected.flow_sha256,
            requirements_flow_sha256: collected.requirements.flow_sha256, fixture_id: collected.requirements.fixture_id,
            stage_count: collected.stages.length, requirement_count: collected.requirements.records.length,
            probe_count: collected.requirements.junit_cases.length,
            evidence_set_sha256: hashBytes(JSON.stringify({ stages: collected.stages, requirements: collected.requirements, artifacts: collected.artifacts.map(canonicalV12CalendarArtifactDescriptor) })),
          };
          const result = Object.freeze({ ...collected, native_receipt: Object.freeze(receiptBody) });
          transport.complete(result);
          return result;
        }
        finally {
          try { runtime.restoreCalendarSettings(deviceSettings, lease); }
          finally { io.cleanup(); }
        }
      });
    } finally {
      if (ownedLease && runtimeSettings !== undefined) {
        runtime.restoreSettings(runtimeSettings, lease);
        runtime.releaseLease(lease);
      }
    }
  } catch (error) {
    if (error instanceof Error && /^v12_production_native_launcher_calendar_[a-z_:.-]+$/u.test(error.message)) throw error;
    const code = error instanceof Error && /^calendar_(?:action|observation)_[a-z_:.-]+$/u.test(error.message)
      ? error.message.replace(/^calendar_/u, "") : "calendar_action_failed";
    throw new Error(`v12_production_native_launcher_calendar_${code}`);
  }
}

export { FLOW as V12_CALENDAR_FLOW_PATH, V12_CALENDAR_CHUNK_MARKER };
export { createV12CalendarProbeReceipt };
