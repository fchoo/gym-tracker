#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { executeProductionDomainAction } from "./v12-production-native-domain-actions.mjs";
import { createProductionNativeRuntime } from "./v12-production-native-runtime.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const SELF = fileURLToPath(import.meta.url);
const ACTIONS = new Set(["acquire-lease", "release-lease", "snapshot-settings", "restore-settings", "visual-capture", "visual-capture-batch", "visual-compare", "accessibility", "performance", "sqlite", "recovery", "garmin", "calendar"]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => { throw new Error(`v12_production_native_launcher_${code}`); };

function readRequest() {
  let body = "";
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => { body += chunk; if (body.length > 1024 * 1024) reject(new Error("request_too_large")); });
    process.stdin.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("request_invalid")); } });
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
  if (["recovery", "garmin"].includes(action)) {
    const domainResult = await executeProductionDomainAction(action, payload, attestation);
    if (domainResult !== undefined) return domainResult;
  }
  // These producers do not exist in the source tree yet. Never convert a
  // screenshot of an arbitrary screen or a successful Maestro process into
  // a state/observation receipt. Keep the unsupported actions explicitly closed.
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
  process.stdout.write(`${JSON.stringify({ schema_version: 1, action, ok: true, result, attestation })}\n`);
} catch (error) {
  const code = error instanceof Error && /^v12_production_native_launcher_[a-z_]+$/u.test(error.message)
    ? error.message : "v12_production_native_launcher_failed";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
