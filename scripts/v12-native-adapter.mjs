import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const LAUNCHER = fileURLToPath(new URL("./v12-production-native-adapter-launcher.mjs", import.meta.url));
const CHECKED_IN_TEST_FAKE = fileURLToPath(new URL("./testing/v12-phase20-blackbox/fake-device-adapter.mjs", import.meta.url));
const TEST_MODE = "phase20-native-adapter-subprocess";

export const V12_NATIVE_ADAPTER_TIMEOUTS_MS = Object.freeze({
  accessibility: 26 * 60_000,
  performance: 26 * 60_000,
  sqlite: 26 * 60_000,
});

function fail(code) { throw new Error(`v12_native_adapter_${code}`); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function sourceHash(file) { return sha256(readFileSync(file)); }

function cliRunId() {
  const index = process.argv.indexOf("--run");
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function testInjectionEnabled() {
  const mode = process.env.V12_NATIVE_ADAPTER_TEST_MODE;
  const processMarker = process.env.V12_NATIVE_ADAPTER_TEST_PROCESS;
  const nodeTest = process.env.NODE_ENV === "test";
  if (mode === undefined && processMarker === undefined && !nodeTest) return false;
  if (mode !== TEST_MODE || processMarker !== "1" || !nodeTest) fail("test_mode_inconsistent");
  return true;
}

function commandFor(root, command) {
  const testMode = testInjectionEnabled();
  const injected = command ?? process.env.V12_NATIVE_ADAPTER_COMMAND;
  if (!injected) return Object.freeze({ executable: process.execPath, args: [LAUNCHER], source: LAUNCHER });
  if (!testMode) fail("command_override_forbidden");
  const resolved = realpathSync(path.resolve(root, injected));
  const fixtureFake = realpathSync(path.resolve(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"));
  if (resolved !== fixtureFake && resolved !== realpathSync(CHECKED_IN_TEST_FAKE)) fail("test_command_invalid");
  return Object.freeze({ executable: process.execPath, args: [resolved], source: resolved });
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

/**
 * Production boundary for Phase 20 device execution. The production launcher
 * is fixed and checked in; a subprocess fake is accepted only for a Node test
 * process that deliberately opts into the exact test-mode triplet above.
 */
export function invokeV12NativeAdapter(action, payload, {
  command,
  root = process.cwd(),
} = {}) {
  if (typeof action !== "string" || action.length === 0 || !payload || typeof payload !== "object") fail("request_invalid");
  const target = commandFor(root, command);
  const attestation = createAttestation(action, payload, root);
  const result = spawnSync(target.executable, [...target.args, "--action", action], {
    cwd: root,
    input: `${JSON.stringify({ schema_version: 1, action, payload, attestation })}\n`,
    encoding: "utf8",
    // Quality and SQLite aggregates have bounded native progress plus restoration time.
    timeout: V12_NATIVE_ADAPTER_TIMEOUTS_MS[action] ?? 5 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status !== 0) {
    const bounded = /^v12_production_native_launcher_([a-z_]+)\s*$/u.exec(result.stderr ?? "");
    fail(bounded ? `command_failed:${bounded[1]}` : "command_failed");
  }
  let response;
  try { response = JSON.parse(result.stdout); } catch { fail("response_invalid"); }
  if (!response || response.schema_version !== 1 || response.action !== action || response.ok !== true || !("result" in response)
    || (testInjectionEnabled() ? response.evidence_origin !== "test" : Object.hasOwn(response, "evidence_origin"))) fail("response_invalid");
  if (!sameAttestation(attestation, response.attestation)) fail("attestation_invalid");
  return response.result;
}

export function createV12NativeAdapter(options = {}) {
  const call = (action, payload) => invokeV12NativeAdapter(action, { ...payload, run_id: payload.run_id ?? options.runId ?? cliRunId() }, options);
  return Object.freeze({
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
    executeGarmin: (lease, settings, payload) => call("garmin", { lease, settings, ...payload }),
    executeCalendar: (lease, settings, payload) => call("calendar", { lease, settings, ...payload }),
  });
}
