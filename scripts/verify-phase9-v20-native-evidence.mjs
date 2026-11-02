#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const value = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const manifestArgument = value("--manifest");
const resultArgument = value("--result");
const skipLiveDeviceCheck = args.includes("--skip-live-device-check");
const failures = [];
const V20_RECEIPT_CASE = "migration-session-exercise-edit-receipts-v20";

function fail(message) { failures.push(message); }
function same(label, left, right) { if (left !== right) fail(`${label}_mismatch`); }
function sha256(filePath) { return createHash("sha256").update(readFileSync(filePath)).digest("hex"); }
function readJson(filePath, label) {
  try { return JSON.parse(readFileSync(filePath, "utf8")); }
  catch { fail(`${label}_unreadable`); return {}; }
}
function caseIdsFromSource() {
  const source = readFileSync(path.join(root, "src/testing/contracts/migrationsEffects.contract.ts"), "utf8");
  const block = source.match(/export const MIGRATIONS_EFFECTS_CONTRACT_CASES = \[([\s\S]*?)\] as const;/u)?.[1] ?? "";
  const ids = [...block.matchAll(/"([a-z0-9-]+)"/gu)].map((match) => match[1]);
  if (!ids.includes(V20_RECEIPT_CASE)) fail("source_v20_case_missing");
  return [V20_RECEIPT_CASE];
}
function adb(serial, ...command) {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "/opt/homebrew/share/android-commandlinetools";
  return execFileSync(path.join(androidHome, "platform-tools", "adb"), ["-s", serial, ...command], { encoding: "utf8" }).trim();
}

if (!manifestArgument || !resultArgument) fail("manifest_and_result_required");
const manifestPath = path.resolve(root, manifestArgument ?? "");
const resultPath = path.resolve(root, resultArgument ?? "");
if (!existsSync(manifestPath)) fail("manifest_missing");
if (!existsSync(resultPath)) fail("result_missing");
const manifest = readJson(manifestPath, "manifest");
const result = readJson(resultPath, "result");
const expectedCaseIds = caseIdsFromSource();

same("manifest_schema_version", manifest.schema_version, 1);
same("result_schema_version", result.schema_version, 1);
same("manifest_suite", manifest.suite, "migrations-effects");
same("result_suite", result.suite, "migrations-effects");
same("result_status", result.status, "passed");
same("result_failed", result.contract?.failed, 0);
same("result_skipped", result.contract?.skipped, 0);
same("manifest_profile", manifest.profile, "development-test");
same("manifest_build_variant", manifest.build_variant, "release");
same("manifest_embedded_bundle", manifest.js_bundle?.embedded, true);
same("result_manifest_path", path.resolve(root, result.build_manifest ?? ""), manifestPath);
for (const key of ["base_head", "source_tree_sha256", "package"]) same(`manifest_result_${key}`, result[key], manifest[key]);
for (const key of ["path", "sha256", "size_bytes", "page_alignment_kib", "page_alignment_verified"]) same(`manifest_result_apk_${key}`, result.apk?.[key], manifest.apk?.[key]);
for (const key of ["serial", "api", "abi", "model", "android_release"]) same(`manifest_result_device_${key}`, result.device?.[key], manifest.device?.[key]);
same("current_base_head", manifest.base_head, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
same("current_source_tree_sha256", manifest.source_tree_sha256, sourceTreeSha256(root));
if (!/^[0-9a-f]{40}$/u.test(manifest.base_head ?? "")) fail("base_head_invalid");
if (!/^[0-9a-f]{64}$/u.test(manifest.source_tree_sha256 ?? "")) fail("source_tree_sha256_invalid");
if (!manifest.package || !manifest.device?.serial || !manifest.device?.abi || !Number.isInteger(manifest.device?.api)) fail("manifest_identity_incomplete");
if (manifest.apk?.page_alignment_kib !== 16 || manifest.apk?.page_alignment_verified !== true) fail("apk_alignment_unverified");
const apkPath = path.resolve(root, manifest.apk?.path ?? "");
if (!existsSync(apkPath)) fail("apk_missing");
else {
  same("apk_sha256", manifest.apk?.sha256, sha256(apkPath));
  same("apk_size_bytes", manifest.apk?.size_bytes, statSync(apkPath).size);
  same("result_installed_apk_sha256", result.installed_apk?.sha256, manifest.apk?.sha256);
  same("result_installed_apk_match", result.installed_apk?.matches_retained_apk, true);
}
const cases = result.contract?.cases;
same("contract_expected_count", result.contract?.expected_count, expectedCaseIds.length);
same("contract_total", result.contract?.total, expectedCaseIds.length);
same("contract_passed", result.contract?.passed, expectedCaseIds.length);
if (!Array.isArray(cases) || cases.length !== expectedCaseIds.length) fail("contract_case_count_invalid");
else {
  const actual = new Set();
  for (const entry of cases) {
    if (entry?.status !== "passed" || typeof entry.id !== "string" || actual.has(entry.id)) fail("contract_case_invalid");
    actual.add(entry.id);
  }
  for (const id of expectedCaseIds) if (!actual.has(id)) fail("contract_case_set_mismatch");
}
if (!skipLiveDeviceCheck && failures.length === 0) {
  try {
    same("live_device_api", Number(adb(manifest.device.serial, "shell", "getprop", "ro.build.version.sdk")), manifest.device.api);
    same("live_device_abi", adb(manifest.device.serial, "shell", "getprop", "ro.product.cpu.abi"), manifest.device.abi);
    const packagePath = adb(manifest.device.serial, "shell", "pm", "path", manifest.package).split(/\r?\n/u).find((line) => line.startsWith("package:"))?.slice(8);
    if (!packagePath || packagePath !== result.installed_apk?.device_path) fail("live_installed_package_mismatch");
  } catch { fail("live_device_unavailable"); }
}
if (failures.length > 0) { process.stderr.write(JSON.stringify({ ok: false, error: "phase9_v20_native_evidence_invalid", failures: [...new Set(failures)] }) + "\n"); process.exit(1); }
process.stdout.write(JSON.stringify({ ok: true, suite: manifest.suite, base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, apk_sha256: manifest.apk.sha256, device: manifest.device, exact_cases: expectedCaseIds.length }) + "\n");
