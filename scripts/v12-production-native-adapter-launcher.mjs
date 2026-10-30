#!/usr/bin/env node
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync, realpathSync, writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { executeProductionDomainAction } from "./v12-production-native-domain-actions.mjs";
import { createProductionNativeRuntime } from "./v12-production-native-runtime.mjs";
import { executeProductionQualityAction } from "./v12-production-native-quality-actions.mjs";
import { executeProductionVisualAction } from "./v12-production-native-visual-actions.mjs";
import {
  createV12NativeExecutionOriginAttestation,
  requiredV12NativeToolsForAction,
  resolveV12NativeExecutionTools,
} from "./v12-native-execution-origin.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SELF = fileURLToPath(import.meta.url);
const ACTIONS = new Set(["acquire-lease", "release-lease", "snapshot-settings", "restore-settings", "visual-capture", "visual-capture-batch", "visual-compare", "accessibility", "performance", "sqlite", "recovery", "garmin", "calendar"]);
export const V12_PRODUCTION_NATIVE_MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => { throw new Error(`v12_production_native_launcher_${code}`); };
let requestedSignal = null;
const terminationGuard = () => { if (requestedSignal !== null) fail("termination_requested"); };

export function readV12ProductionNativeRequest(stream = process.stdin, {
  signal,
  maxBytes = V12_PRODUCTION_NATIVE_MAX_REQUEST_BYTES,
} = {}) {
  let body = "";
  let bytes = 0;
  let settled = false;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
      stream.removeListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onData = (chunk) => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        stream.pause?.();
        finish(reject, new Error("v12_production_native_launcher_request_too_large"));
        return;
      }
      body += chunk;
    };
    const onEnd = () => {
      if (settled) return;
      try { finish(resolve, JSON.parse(body)); }
      catch { finish(reject, new Error("v12_production_native_launcher_request_invalid")); }
    };
    const onError = () => finish(reject, new Error("v12_production_native_launcher_request_read_failed"));
    const onClose = () => finish(reject, new Error("v12_production_native_launcher_request_premature_close"));
    const onAbort = () => {
      stream.pause?.();
      finish(reject, new Error("v12_production_native_launcher_termination_requested"));
    };
    stream.setEncoding?.("utf8");
    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
    stream.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else if (stream.readableEnded) queueMicrotask(onEnd);
    else if (stream.destroyed) queueMicrotask(onClose);
  });
}

async function writeAndDrain(stream, value) {
  if (stream.write(value)) return;
  await once(stream, "drain");
}
function validateAttestation(request, action) {
  const value = request?.attestation;
  const keys = ["schema_version", "action", "launcher_source_sha256", "run_id", "build_profile", "suite",
    "source_tree_sha256", "apk_sha256", "installed_apk_sha256", "apk_signature_sha256", "device_identity_sha256", "package"];
  if (!value || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)) || value.schema_version !== 1 || value.action !== action || value.launcher_source_sha256 !== sha256(readFileSync(SELF))
    || value.suite !== "v1.2-acceptance" || value.build_profile !== "development-test" || value.package !== "com.fchoo.gymtracker.devtest"
    || ![value.source_tree_sha256, value.apk_sha256, value.installed_apk_sha256, value.apk_signature_sha256, value.device_identity_sha256].every((entry) => SHA256.test(entry ?? ""))) fail("attestation_invalid");
  return value;
}
async function execute(action, payload, attestation, executionTools) {
  terminationGuard();
  const quality = await executeProductionQualityAction(action, payload, attestation, { executionTools });
  if (quality !== undefined) return quality;
  const runtime = createProductionNativeRuntime(attestation, { cleanup: ["restore-settings", "release-lease"].includes(action), executionTools });
  if (action === "acquire-lease") return runtime.acquireLease();
  if (action === "release-lease") return runtime.releaseLease(payload.lease);
  if (action === "snapshot-settings") return runtime.snapshotSettings(payload.lease);
  if (action === "restore-settings") return runtime.restoreSettings(payload.settings, payload.lease);
  if (action === "sqlite") return runtime.withLease(payload, runtime.sqlite);
  const handlers = [
    () => action.startsWith("visual-")
      ? runtime.withLease(payload, () => executeProductionVisualAction({ action, payload, attestation, executionTools }))
      : undefined,
    () => executeProductionDomainAction(action, payload, attestation, { executionTools }),
  ];
  for (const handler of handlers) {
    const result = await handler();
    if (result !== undefined) return result;
  }
  fail("action_contract_unavailable");
}

async function main() {
  const terminationController = new AbortController();
  const signalHandlers = new Map(["SIGTERM", "SIGINT"].map((signal) => [signal, () => {
    requestedSignal ??= signal;
    terminationController.abort();
  }]));
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);
  try { writeSync(3, "ready\n"); } catch { /* fd 3 is present only in readiness tests */ }
  try {
  const actionIndex = process.argv.indexOf("--action"); const action = process.argv[actionIndex + 1];
  if (actionIndex < 0 || !ACTIONS.has(action)) fail("action_invalid");
  const request = await readV12ProductionNativeRequest(process.stdin, { signal: terminationController.signal });
  if (request?.schema_version !== 1 || request?.action !== action || !request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) fail("request_invalid");
  const attestation = validateAttestation(request, action);
  if (request.payload.run_id !== attestation.run_id) fail("attestation_invalid");
  if (process.env.V12_NATIVE_ADAPTER_TEST_MODE !== undefined || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== undefined || process.env.NODE_ENV === "test") fail("test_environment_forbidden");
  const executionTools = resolveV12NativeExecutionTools({ requiredTools: requiredV12NativeToolsForAction(action) });
  const executionOrigin = createV12NativeExecutionOriginAttestation({ action, executionTools });
  if (JSON.stringify(request.execution_origin) !== JSON.stringify(executionOrigin)) fail("execution_origin_invalid");
  const result = await execute(action, request.payload, attestation, executionTools);
  terminationGuard();
  const response = `${JSON.stringify({ schema_version: 1, action, ok: true, result, attestation, execution_origin: executionOrigin })}\n`;
  if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) fail("response_too_large");
  await writeAndDrain(process.stdout, response);
  return 0;
  } catch (error) {
    const code = requestedSignal !== null ? "v12_production_native_launcher_termination_requested"
      : error instanceof Error && /^v12_production_native_launcher_[a-z_]+$/u.test(error.message)
      ? error.message : "v12_production_native_launcher_failed";
    await writeAndDrain(process.stderr, `${code}\n`);
    return 1;
  } finally {
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    process.stdin.pause();
  }
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(SELF)) {
  process.exitCode = await main();
}
