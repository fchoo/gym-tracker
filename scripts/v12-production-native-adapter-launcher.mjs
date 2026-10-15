#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
function run(command, args, input, binary = false) {
  const result = spawnSync(command, args, { encoding: binary ? "buffer" : "utf8", input, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.signal || result.status !== 0) fail("native_prerequisite_failed");
  return result.stdout;
}
function serial() {
  const value = process.env.V12_DEVICE_SERIAL;
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]+$/u.test(value) || value.startsWith("emulator-")) fail("device_binding_unavailable");
  return value;
}
function validateAttestation(request, action) {
  const value = request?.attestation;
  if (!value || value.schema_version !== 1 || value.action !== action || value.launcher_source_sha256 !== sha256(readFileSync(SELF))
    || value.suite !== "v1.2-acceptance" || value.build_profile !== "development-test" || value.package !== "com.fchoo.gymtracker.devtest"
    || ![value.source_tree_sha256, value.apk_sha256, value.installed_apk_sha256, value.apk_signature_sha256, value.device_identity_sha256].every((entry) => SHA256.test(entry ?? ""))) fail("attestation_invalid");
  return value;
}
function nativeScreenshot(device) {
  const png = run("adb", ["-s", device, "exec-out", "screencap", "-p"], undefined, true);
  if (!Buffer.isBuffer(png) || png.length < 8 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail("screenshot_unavailable");
  return png.toString("base64");
}
function execute(action, payload) {
  const device = serial();
  if (action === "acquire-lease") { run("adb", ["-s", device, "get-state"]); return { lease_id: sha256(`${device}:${Date.now()}`).slice(0, 24), native_execution: "EXECUTED" }; }
  if (action === "release-lease") return true;
  if (action === "snapshot-settings") return { font_scale: run("adb", ["-s", device, "shell", "settings", "get", "system", "font_scale"]).trim(), animator_duration_scale: run("adb", ["-s", device, "shell", "settings", "get", "global", "animator_duration_scale"]).trim() };
  if (action === "restore-settings") { const settings = payload?.settings; if (!settings || typeof settings.font_scale !== "string" || typeof settings.animator_duration_scale !== "string") fail("settings_invalid"); run("adb", ["-s", device, "shell", "settings", "put", "system", "font_scale", settings.font_scale]); run("adb", ["-s", device, "shell", "settings", "put", "global", "animator_duration_scale", settings.animator_duration_scale]); return true; }
  if (action === "visual-capture") return { native_execution: "EXECUTED", png_base64: nativeScreenshot(device), settings: { restored: false } };
  if (action === "visual-capture-batch") { if (!Array.isArray(payload?.captures)) fail("captures_invalid"); return payload.captures.map(() => ({ native_execution: "EXECUTED", png_base64: nativeScreenshot(device), settings: { restored: false } })); }
  // The remaining actions require their action-specific Maestro/native
  // instrumentation. A launcher never fabricates observations when that
  // contract is unavailable: it fails closed and bounded instead.
  if (ACTIONS.has(action)) { run("maestro", ["--version"]); fail("action_contract_unavailable"); }
  fail("action_invalid");
}

try {
  const actionIndex = process.argv.indexOf("--action"); const action = process.argv[actionIndex + 1];
  if (actionIndex < 0 || !ACTIONS.has(action)) fail("action_invalid");
  const request = await readRequest();
  if (request?.schema_version !== 1 || request?.action !== action || !request.payload || typeof request.payload !== "object") fail("request_invalid");
  const attestation = validateAttestation(request, action);
  const result = execute(action, request.payload);
  process.stdout.write(`${JSON.stringify({ schema_version: 1, action, ok: true, result, attestation })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "v12_production_native_launcher_failed"}\n`);
  process.exitCode = 1;
}
