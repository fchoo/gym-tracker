#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { executeProductionDomainAction } from "./v12-production-native-domain-actions.mjs";
import { createProductionNativeRuntime } from "./v12-production-native-runtime.mjs";
import { executeProductionQualityAction } from "./v12-production-native-quality-actions.mjs";
import { executeProductionVisualAction } from "./v12-production-native-visual-actions.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SELF = fileURLToPath(import.meta.url);
const ACTIONS = new Set(["acquire-lease", "release-lease", "snapshot-settings", "restore-settings", "visual-capture", "visual-capture-batch", "visual-compare", "accessibility", "performance", "sqlite", "recovery", "garmin", "calendar"]);
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => { throw new Error(`v12_production_native_launcher_${code}`); };

function readRequest() {
  let body = "";
  let bytes = 0;
  let settled = false;
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_REQUEST_BYTES) { settled = true; reject(new Error("request_too_large")); return; }
      body += chunk;
    });
    process.stdin.on("end", () => { if (settled) return; try { settled = true; resolve(JSON.parse(body)); } catch { settled = true; reject(new Error("request_invalid")); } });
  });
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
async function execute(action, payload, attestation) {
  const runtime = createProductionNativeRuntime(attestation, { cleanup: ["restore-settings", "release-lease"].includes(action) });
  if (action === "acquire-lease") return runtime.acquireLease();
  if (action === "release-lease") return runtime.releaseLease(payload.lease);
  if (action === "snapshot-settings") return runtime.snapshotSettings(payload.lease);
  if (action === "restore-settings") return runtime.restoreSettings(payload.settings, payload.lease);
  if (action === "sqlite") return runtime.withLease(payload, runtime.sqlite);
  const handlers = [
    () => action.startsWith("visual-")
      ? runtime.withLease(payload, () => executeProductionVisualAction({ action, payload, attestation }))
      : undefined,
    () => executeProductionQualityAction(action, payload, attestation),
    () => executeProductionDomainAction(action, payload, attestation),
  ];
  for (const handler of handlers) {
    const result = await handler();
    if (result !== undefined) return result;
  }
  fail("action_contract_unavailable");
}

try {
  const actionIndex = process.argv.indexOf("--action"); const action = process.argv[actionIndex + 1];
  if (actionIndex < 0 || !ACTIONS.has(action)) fail("action_invalid");
  const request = await readRequest();
  if (request?.schema_version !== 1 || request?.action !== action || !request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) fail("request_invalid");
  const attestation = validateAttestation(request, action);
  if (request.payload.run_id !== attestation.run_id) fail("attestation_invalid");
  if (process.env.V12_NATIVE_ADAPTER_TEST_MODE !== undefined || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== undefined || process.env.NODE_ENV === "test") fail("test_environment_forbidden");
  const result = await execute(action, request.payload, attestation);
  const response = `${JSON.stringify({ schema_version: 1, action, ok: true, result, attestation })}\n`;
  if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) fail("response_too_large");
  process.stdout.write(response);
} catch (error) {
  const code = error instanceof Error && /^v12_production_native_launcher_[a-z_]+$/u.test(error.message)
    ? error.message : "v12_production_native_launcher_failed";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
