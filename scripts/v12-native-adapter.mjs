import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  V12_NATIVE_ADAPTER_GRACE_MS,
  V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  V12_NATIVE_PROCESS_TREE_KILL_GRACE_MS,
  V12_NATIVE_PROCESS_TREE_TERM_GRACE_MS,
  V12_CALENDAR_ACTION_BUDGET,
  V12_CALENDAR_COMMAND_GRAPH,
  V12_GARMIN_ACTION_BUDGET,
  V12_GARMIN_COMMAND_GRAPH,
  V12_NATIVE_CLEANUP_BUDGET,
  V12_NATIVE_COMMAND_GRAPH,
  V12_NATIVE_LEASE_ACTION_BUDGETS,
  V12_QUALITY_ACTION_BUDGETS,
  V12_QUALITY_COMMAND_GRAPH,
  V12_QUALITY_WAIT_GRAPH,
  V12_RECOVERY_ACTION_BUDGET,
  V12_RECOVERY_COMMAND_GRAPH,
  V12_SQLITE_PRODUCER_BOUND_MS,
  V12_VISUAL_BATCH_PRODUCER_BOUND_MS,
  V12_VISUAL_CLEANUP_BUDGET,
  V12_VISUAL_COMMAND_GRAPH,
  V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS,
  v12CommandPathMaxMs,
} from "./v12-native-time-budgets.mjs";

export {
  V12_NATIVE_ADAPTER_GRACE_MS,
  V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  V12_NATIVE_PROCESS_TREE_KILL_GRACE_MS,
  V12_NATIVE_PROCESS_TREE_TERM_GRACE_MS,
  V12_CALENDAR_ACTION_BUDGET,
  V12_CALENDAR_COMMAND_GRAPH,
  V12_GARMIN_ACTION_BUDGET,
  V12_GARMIN_COMMAND_GRAPH,
  V12_NATIVE_CLEANUP_BUDGET,
  V12_NATIVE_COMMAND_GRAPH,
  V12_NATIVE_LEASE_ACTION_BUDGETS,
  V12_QUALITY_ACTION_BUDGETS,
  V12_QUALITY_COMMAND_GRAPH,
  V12_QUALITY_WAIT_GRAPH,
  V12_RECOVERY_ACTION_BUDGET,
  V12_RECOVERY_COMMAND_GRAPH,
  V12_SQLITE_PRODUCER_BOUND_MS,
  V12_VISUAL_BATCH_PRODUCER_BOUND_MS,
  V12_VISUAL_CLEANUP_BUDGET,
  V12_VISUAL_COMMAND_GRAPH,
  V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS,
  v12CommandPathMaxMs,
};
import {
  createV12NativeExecutionOriginAttestation,
  requiredV12NativeToolsForAction,
  resolveV12NativeExecutionTools,
  V12_PRODUCTION_EXECUTION_ORIGIN,
  V12_TEST_EXECUTION_ORIGIN,
} from "./v12-native-execution-origin.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const ADAPTER = fileURLToPath(import.meta.url);
const SUPERVISOR = fileURLToPath(new URL("./v12-native-adapter-supervisor.mjs", import.meta.url));
const PROCESS_BOOTSTRAP = fileURLToPath(new URL("./v12-native-process-bootstrap.mjs", import.meta.url));
const LAUNCHER = fileURLToPath(new URL("./v12-production-native-adapter-launcher.mjs", import.meta.url));
const NATIVE_RUNTIME = fileURLToPath(new URL("./v12-production-native-runtime.mjs", import.meta.url));
const DOMAIN_ACTIONS = fileURLToPath(new URL("./v12-production-native-domain-actions.mjs", import.meta.url));
const CALENDAR_ACTION = fileURLToPath(new URL("./v12-production-native-calendar-action.mjs", import.meta.url));
const VISUAL_ACTIONS = fileURLToPath(new URL("./v12-production-native-visual-actions.mjs", import.meta.url));
const QUALITY_ACTIONS = fileURLToPath(new URL("./v12-production-native-quality-actions.mjs", import.meta.url));
const CHECKED_IN_TEST_FAKE = fileURLToPath(new URL("./testing/v12-phase20-blackbox/fake-device-adapter.mjs", import.meta.url));
const TEST_MODE = "phase20-native-adapter-subprocess";
export const V12_NATIVE_MAX_REQUEST_BYTES = 1024 * 1024;
export const V12_NATIVE_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const ACTION_DOMAIN_SOURCE = Object.freeze({
  "acquire-lease": NATIVE_RUNTIME,
  "release-lease": NATIVE_RUNTIME,
  "snapshot-settings": NATIVE_RUNTIME,
  "restore-settings": NATIVE_RUNTIME,
  sqlite: NATIVE_RUNTIME,
  recovery: DOMAIN_ACTIONS,
  garmin: DOMAIN_ACTIONS,
  calendar: CALENDAR_ACTION,
  "visual-capture": VISUAL_ACTIONS,
  "visual-capture-batch": VISUAL_ACTIONS,
  "visual-compare": VISUAL_ACTIONS,
  accessibility: QUALITY_ACTIONS,
  performance: QUALITY_ACTIONS,
});
export const V12_CALENDAR_ADAPTER_TIMEOUT_MS = V12_CALENDAR_ACTION_BUDGET.max_ms
  + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS;
export const V12_NATIVE_ACTION_TIMEOUT_MS = Object.freeze({
  "acquire-lease": V12_NATIVE_LEASE_ACTION_BUDGETS["acquire-lease"].max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  "release-lease": V12_NATIVE_LEASE_ACTION_BUDGETS["release-lease"].max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  "snapshot-settings": V12_NATIVE_LEASE_ACTION_BUDGETS["snapshot-settings"].max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  "restore-settings": V12_NATIVE_LEASE_ACTION_BUDGETS["restore-settings"].max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  "visual-capture": V12_VISUAL_CAPTURE_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS,
  "visual-capture-batch": V12_VISUAL_BATCH_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS,
  "visual-compare": V12_VISUAL_BATCH_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS,
  accessibility: V12_QUALITY_ACTION_BUDGETS.accessibility.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  performance: V12_QUALITY_ACTION_BUDGETS.performance.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  sqlite: V12_SQLITE_PRODUCER_BOUND_MS + V12_NATIVE_ADAPTER_GRACE_MS,
  recovery: V12_RECOVERY_ACTION_BUDGET.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  garmin: V12_GARMIN_ACTION_BUDGET.max_ms + V12_NATIVE_ADAPTER_EXIT_MARGIN_MS,
  calendar: V12_CALENDAR_ADAPTER_TIMEOUT_MS,
});

function fail(code) { throw new Error(`v12_native_adapter_${code}`); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function sourceHash(file) { return sha256(readFileSync(file)); }

function cliRunId() {
  const index = process.argv.indexOf("--run");
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function testInjectionEnabled(environment) {
  const mode = environment.V12_NATIVE_ADAPTER_TEST_MODE;
  const processMarker = environment.V12_NATIVE_ADAPTER_TEST_PROCESS;
  const nodeTest = environment.NODE_ENV === "test";
  if (mode === undefined && processMarker === undefined && !nodeTest) return false;
  if (mode !== TEST_MODE || processMarker !== "1" || !nodeTest) fail("test_mode_inconsistent");
  return true;
}

function commandFor(root, command, environment) {
  const testMode = testInjectionEnabled(environment);
  const injected = command ?? environment.V12_NATIVE_ADAPTER_COMMAND;
  if (!injected) return Object.freeze({ executable: process.execPath, args: [LAUNCHER], source: LAUNCHER, testOnly: false });
  if (!testMode) fail("command_override_forbidden");
  const resolved = realpathSync(path.resolve(root, injected));
  const fixtureFake = realpathSync(path.resolve(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"));
  if (resolved !== fixtureFake && resolved !== realpathSync(CHECKED_IN_TEST_FAKE)) fail("test_command_invalid");
  return Object.freeze({ executable: process.execPath, args: [resolved], source: resolved, testOnly: true });
}

function readBuildIdentity(root, runId) {
  if (!RUN_ID.test(runId ?? "")) fail("run_identity_missing");
  const file = path.join(root, "artifacts/native/v1.2", runId, "build.json");
  if (!existsSync(file)) fail("build_identity_missing");
  let manifest;
  try { manifest = JSON.parse(readFileSync(file, "utf8")); } catch { fail("build_identity_invalid"); }
  const source = manifest?.source; const build = manifest?.build; const apk = build?.apk; const device = manifest?.device;
  const values = [source?.tree_sha256, apk?.sha256, device?.installed_apk_sha256, apk?.signature_sha256, device?.identity_sha256];
  if (manifest?.run_id !== runId || build?.profile !== "development-test" || build?.package !== "com.fchoo.gymtracker.devtest" || values.some((value) => !SHA256.test(value ?? ""))) fail("build_identity_invalid");
  return Object.freeze({
    run_id: runId,
    build_profile: build.profile,
    suite: "v1.2-acceptance",
    source_tree_sha256: source.tree_sha256,
    apk_sha256: apk.sha256,
    installed_apk_sha256: device.installed_apk_sha256,
    apk_signature_sha256: apk.signature_sha256,
    device_identity_sha256: device.identity_sha256,
    package: build.package,
  });
}

function createAttestation(action, payload, root) {
  const runId = payload.run_id ?? cliRunId();
  const identity = readBuildIdentity(root, runId);
  return Object.freeze({
    schema_version: 1,
    action,
    launcher_source_sha256: sourceHash(LAUNCHER),
    ...identity,
  });
}

function sameAttestation(expected, actual) {
  return actual && typeof actual === "object" && Object.keys(expected).every((key) => actual[key] === expected[key])
    && Object.keys(actual).length === Object.keys(expected).length;
}

function signalOwnedTree(child, signal) {
  if (!Number.isSafeInteger(child.pid) || child.pid < 1 || child.exitCode !== null || child.signalCode !== null) return true;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    });
    return !result.error && !result.signal && result.status === 0;
  }
  try { process.kill(-child.pid, signal); return true; }
  catch (error) {
    if (error?.code === "ESRCH") return true;
    return false;
  }
}

function processGroupIsEmpty(processGroupId) {
  if (process.platform === "win32") return true;
  try { process.kill(-processGroupId, 0); return false; }
  catch (error) { return error?.code === "ESRCH"; }
}

async function verifyProcessGroupEmpty(processGroupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!processGroupIsEmpty(processGroupId) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return processGroupIsEmpty(processGroupId);
}

/** Owns one detached process group and bounds TERM -> KILL escalation. */
export function superviseV12NativeProcess({
  executable,
  args,
  cwd,
  environment,
  input,
  timeoutMs,
  termGraceMs = V12_NATIVE_PROCESS_TREE_TERM_GRACE_MS,
  killGraceMs = V12_NATIVE_PROCESS_TREE_KILL_GRACE_MS,
  maxBuffer = V12_NATIVE_MAX_RESPONSE_BYTES,
  signal,
} = {}) {
  if (typeof executable !== "string" || !path.isAbsolute(executable) || !Array.isArray(args)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(termGraceMs) || termGraceMs < 1
    || !Number.isSafeInteger(killGraceMs) || killGraceMs < 1 || !Number.isSafeInteger(maxBuffer) || maxBuffer < 1) {
    return Promise.reject(new Error("v12_native_adapter_supervisor_invalid"));
  }
  if (signal?.aborted) {
    return Promise.resolve(Object.freeze({
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
      timed_out: false,
      cancelled: true,
      output_exceeded: false,
      termination: null,
      cleanup_verified: true,
    }));
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PROCESS_BOOTSTRAP, executable, ...args], {
      cwd,
      env: environment,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const processGroupId = child.pid;
    const stdout = []; const stderr = [];
    let stdoutBytes = 0; let stderrBytes = 0;
    let timedOut = false; let cancelled = false; let outputExceeded = false; let termination = null; let settled = false;
    let cleanupVerified = true;
    let termTimer; let killTimer;
    const finish = async (status, childSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); clearTimeout(termTimer); clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      cleanupVerified = cleanupVerified && await verifyProcessGroupEmpty(processGroupId, killGraceMs);
      resolve(Object.freeze({
        status,
        signal: childSignal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timed_out: timedOut,
        cancelled,
        output_exceeded: outputExceeded,
        termination,
        cleanup_verified: cleanupVerified,
      }));
    };
    const terminate = (reason) => {
      if (settled || termination !== null) return;
      timedOut = reason === "timeout";
      cancelled = reason === "signal";
      termination = "SIGTERM";
      cleanupVerified = signalOwnedTree(child, "SIGTERM") && cleanupVerified;
      termTimer = setTimeout(() => {
        if (settled) return;
        termination = "SIGKILL";
        cleanupVerified = signalOwnedTree(child, "SIGKILL") && cleanupVerified;
        killTimer = setTimeout(() => finish(null, null), killGraceMs);
      }, termGraceMs);
    };
    const deadline = setTimeout(() => terminate("timeout"), timeoutMs);
    const onAbort = () => terminate("signal");
    signal?.addEventListener("abort", onAbort, { once: true });
    const collect = (chunks, kind) => (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (kind === "stdout") stdoutBytes += bytes.length; else stderrBytes += bytes.length;
      if (stdoutBytes + stderrBytes > maxBuffer) { outputExceeded = true; terminate("output"); return; }
      chunks.push(bytes);
    };
    child.stdout.on("data", collect(stdout, "stdout"));
    child.stderr.on("data", collect(stderr, "stderr"));
    child.on("error", () => terminate("error"));
    child.on("close", finish);
    child.stdio[3].resume();
    child.stdin.on("error", () => { /* close/error settles through the child */ });
    child.stdin.end(input ?? "");
  });
}

export async function runV12NativeSupervisorCli({ signal, argv = process.argv.slice(2) } = {}) {
  const offset = argv[0] === "--supervise" ? 1 : 0;
  const timeoutMs = Number(argv[offset]);
  const executable = argv[offset + 1];
  const args = argv.slice(offset + 2);
  const result = await superviseV12NativeProcess({
    executable,
    args,
    cwd: process.cwd(),
    environment: process.env,
    input: readFileSync(0),
    timeoutMs,
    signal,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.status === 0 && result.signal === null ? 0 : 1;
}

/**
 * Production boundary for Phase 20 device execution. The production launcher
 * is fixed and checked in; a subprocess fake is accepted only for a Node test
 * process that deliberately opts into the exact test-mode triplet above.
 */
export function invokeV12NativeAdapterEnvelope(action, payload, {
  command,
  environment = process.env,
  root = process.cwd(),
} = {}) {
  if (typeof action !== "string" || !Object.hasOwn(V12_NATIVE_ACTION_TIMEOUT_MS, action)) fail("action_invalid");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("request_invalid");
  const target = commandFor(root, command, environment);
  const attestation = createAttestation(action, payload, root);
  const nativeExecutionOrigin = target.testOnly ? undefined : createV12NativeExecutionOriginAttestation({
    action,
    executionTools: resolveV12NativeExecutionTools({
      requiredTools: requiredV12NativeToolsForAction(action),
      env: environment,
    }),
  });
  const request = `${JSON.stringify({ schema_version: 1, action, payload, attestation,
    ...(nativeExecutionOrigin === undefined ? {} : { execution_origin: nativeExecutionOrigin }) })}\n`;
  if (Buffer.byteLength(request) > V12_NATIVE_MAX_REQUEST_BYTES) fail("request_too_large");
  const supervisedTimeoutMs = V12_NATIVE_ACTION_TIMEOUT_MS[action] - V12_NATIVE_ADAPTER_EXIT_MARGIN_MS;
  const targetEnvironment = { ...environment };
  if (target.testOnly) delete targetEnvironment.NODE_V8_COVERAGE;
  const result = spawnSync(process.execPath, [SUPERVISOR, String(supervisedTimeoutMs), target.executable,
    ...target.args, "--action", action], {
    cwd: root,
    input: request,
    encoding: "utf8",
    env: targetEnvironment,
    timeout: V12_NATIVE_ACTION_TIMEOUT_MS[action],
    killSignal: "SIGKILL",
    maxBuffer: V12_NATIVE_MAX_RESPONSE_BYTES,
  });
  if (result.error || result.signal || result.status !== 0) {
    const bounded = /^v12_production_native_launcher_([a-z_]+)\s*$/u.exec(result.stderr ?? "");
    fail(bounded ? `command_failed:${bounded[1]}` : "command_failed");
  }
  let response;
  try { response = JSON.parse(result.stdout); } catch { fail("response_invalid"); }
  if (!response || response.schema_version !== 1 || response.action !== action || response.ok !== true || !("result" in response)
    || (target.testOnly ? response.evidence_origin !== "test" : Object.hasOwn(response, "evidence_origin"))) fail("response_invalid");
  if (!sameAttestation(attestation, response.attestation)) fail("attestation_invalid");
  if (!target.testOnly && JSON.stringify(response.execution_origin) !== JSON.stringify(nativeExecutionOrigin)) fail("execution_origin_invalid");
  let normalizedResult = response.result;
  if (action === "garmin") {
    if (normalizedResult === null || typeof normalizedResult !== "object" || Array.isArray(normalizedResult)) fail("response_invalid");
    const domainOrigin = target.testOnly ? V12_TEST_EXECUTION_ORIGIN : normalizedResult.execution_origin;
    if (![V12_PRODUCTION_EXECUTION_ORIGIN, V12_TEST_EXECUTION_ORIGIN].includes(domainOrigin)) fail("execution_origin_invalid");
    normalizedResult = Object.freeze({ ...normalizedResult, execution_origin: domainOrigin });
  }
  const toolchainOrigin = target.testOnly || environment.V12_EXECUTION_ORIGIN === V12_TEST_EXECUTION_ORIGIN
    ? V12_TEST_EXECUTION_ORIGIN
    : V12_PRODUCTION_EXECUTION_ORIGIN;
  return Object.freeze({
    result: normalizedResult,
    execution_origin: Object.freeze({
      schema_version: 1,
      action,
      kind: target.testOnly ? "test-fixture" : "production-default-launcher",
      toolchain_origin: toolchainOrigin,
      default_launcher: target.testOnly === false,
      test_only: target.testOnly,
      adapter_source_sha256: sourceHash(ADAPTER),
      launcher_source_sha256: sourceHash(target.source),
      domain_source_sha256: sourceHash(target.testOnly ? target.source : ACTION_DOMAIN_SOURCE[action]),
      request_attestation_sha256: sha256(JSON.stringify({ attestation, execution_origin: nativeExecutionOrigin ?? null })),
    }),
  });
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(ADAPTER)
  && process.argv[2] === "--supervise") {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGTERM", abort); process.once("SIGINT", abort);
  await runV12NativeSupervisorCli({ signal: controller.signal });
}

export function invokeV12NativeAdapter(action, payload, options = {}) {
  return invokeV12NativeAdapterEnvelope(action, payload, options).result;
}

export function createV12NativeAdapter(options = {}) {
  const executionOrigins = new Map();
  const callEnvelope = (action, payload) => {
    const response = invokeV12NativeAdapterEnvelope(action, { ...payload, run_id: payload.run_id ?? options.runId ?? cliRunId() }, options);
    executionOrigins.set(action, response.execution_origin);
    return response;
  };
  const call = (action, payload) => callEnvelope(action, payload).result;
  return Object.freeze({
    executionOrigin: (action) => {
      const origin = executionOrigins.get(action);
      if (origin === undefined) fail("execution_origin_missing");
      return origin;
    },
    acquireLease: () => call("acquire-lease", {}),
    releaseLease: (lease) => call("release-lease", { lease }),
    snapshotSettings: (lease) => call("snapshot-settings", { lease }),
    restoreSettings: (settings, lease) => call("restore-settings", { settings, lease }) === true,
    capture: (payload) => { const result = call("visual-capture", payload); return { ...result, png: Buffer.from(result.png_base64 ?? "", "base64") }; },
    captureBatch: (payload) => call("visual-capture-batch", payload).map((result) => ({ ...result, png: Buffer.from(result.png_base64 ?? "", "base64") })),
    compare: (payload) => call("visual-compare", payload),
    observeAccessibility: (payload) => call("accessibility", payload),
    collectPerformance: (payload) => call("performance", payload),
    executeSqlite: (payload) => call("sqlite", payload),
    executeRecovery: (payload) => call("recovery", payload),
    executeGarmin: (lease, settings, payload) => {
      const response = callEnvelope("garmin", { lease, settings, ...payload });
      if (response.result === null || typeof response.result !== "object" || Array.isArray(response.result)) fail("response_invalid");
      return response.result;
    },
    executeCalendar: (lease, settings, payload) => {
      const response = callEnvelope("calendar", { lease, settings, ...payload });
      if (response.result === null || typeof response.result !== "object" || Array.isArray(response.result)) fail("response_invalid");
      return Object.freeze({ ...response.result, execution_origin: response.execution_origin });
    },
  });
}
