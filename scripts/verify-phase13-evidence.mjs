#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  assertCleanCommittedTree,
  sourceTreeSha256AtHead,
} from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const PHASE13_MANIFEST = "artifacts/native/phase13/build.json";
const PHASE13_APK =
  "artifacts/native/phase13/gym-tracker-phase13-devtest.apk";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const DEVICE_ROLE = "automated-test-device";
const REQUIRED_SCHEMA_VERSION = 35;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const HEAD_PATTERN = /^[a-f0-9]{40}$/u;

export const PHASE13_HOST_GATES = Object.freeze([
  Object.freeze(["run", "typecheck"]),
  Object.freeze(["run", "lint"]),
  Object.freeze(["run", "test:all", "--", "--runInBand"]),
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceCaseIds(file, exportName) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  const block = source.match(
    new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`, "u"),
  )?.[1] ?? "";
  const ids = [...block.matchAll(/"([a-z0-9-]+)"/gu)]
    .map((match) => match[1]);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error(`phase13_case_registry_invalid:${exportName}`);
  }
  return Object.freeze(ids);
}

function sourceSchemaVersion() {
  const source = readFileSync(
    path.join(ROOT, "src/platform/sqlite/migrations/index.ts"),
    "utf8",
  );
  const versions = [...source.matchAll(/from "\.\/(\d{4})_[^"]+";/gu)]
    .map((match) => Number(match[1]));
  if (versions.length === 0 || new Set(versions).size !== versions.length) {
    throw new Error("phase13_schema_registry_invalid");
  }
  return Math.max(...versions);
}

export const PHASE13_MIGRATION_CASE_IDS = sourceCaseIds(
  "src/testing/contracts/migrationsEffects.contract.ts",
  "MIGRATIONS_EFFECTS_CONTRACT_CASES",
);
export const PHASE13_PORTABLE_MERGE_CASE_IDS = sourceCaseIds(
  "src/testing/contracts/portableMerge.contract.ts",
  "PORTABLE_MERGE_CONTRACT_CASES",
);
export const PHASE13_MULTI_PLAN_RUNNING_CASE_IDS = sourceCaseIds(
  "src/testing/contracts/multiPlanRunning.contract.ts",
  "MULTI_PLAN_RUNNING_CONTRACT_CASES",
);
export const PHASE13_SCHEMA_VERSION = sourceSchemaVersion();

function fail(code) {
  throw new Error(code);
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizedKey(key) {
  return key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
}

const FORBIDDEN_EVIDENCE_KEY = /(?:^|_)(?:workout_(?:row|rows|payload|record|records|data)|import(?:ed)?_activity(?:_row|_rows|_payload|_record|_records|_data)?|bodyweight(?:_row|_rows|_payload|_record|_records|_data)?|route(?:_point|_points|_value|_values)?|heart_rate|hr_value|hr_values|filename|file_name|source_filename|sql_parameter|sql_parameters|sql_param|sql_params|bind_arg|bind_args|access_token|refresh_token|password|secret|credential|authorization|cookie|api_key|owner_id|owner_identifier|user_id|account_id|email)(?:_|$)/u;
const FORBIDDEN_EVIDENCE_VALUE = /(?:bearer\s+[a-z0-9._~-]+|(?:access|refresh)[_-]?token\s*[:=]|[^\s/\\]+\.(?:fit|gpx|tcx)(?:\s|$)|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/iu;

export function validatePhase13Privacy(value, pathName = "evidence") {
  if (typeof value === "string") {
    if (FORBIDDEN_EVIDENCE_VALUE.test(value)) {
      fail(`phase13_sensitive_value:${pathName}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      validatePhase13Privacy(entry, `${pathName}[${index}]`);
    });
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEY.test(normalizedKey(key))) {
      fail(`phase13_sensitive_key:${pathName}.${key}`);
    }
    validatePhase13Privacy(entry, `${pathName}.${key}`);
  }
}

function validateManifest(manifest) {
  if (
    manifest?.schema_version !== 1
    || manifest.suite !== "phase13"
    || manifest.profile !== "development-test"
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || manifest.package !== PACKAGE
    || !HEAD_PATTERN.test(manifest.base_head ?? "")
    || !SHA256_PATTERN.test(manifest.source_tree_sha256 ?? "")
    || manifest.apk?.path !== PHASE13_APK
    || !SHA256_PATTERN.test(manifest.apk?.sha256 ?? "")
    || !Number.isInteger(manifest.apk?.size_bytes)
    || manifest.apk.size_bytes < 1
    || manifest.apk.page_alignment_kib !== 16
    || manifest.apk.page_alignment_verified !== true
    || manifest.installed_apk?.sha256 !== manifest.apk.sha256
    || manifest.installed_apk?.matches_retained_apk !== true
    || typeof manifest.installed_apk?.device_path !== "string"
    || manifest.device?.role !== DEVICE_ROLE
    || typeof manifest.device?.serial !== "string"
    || manifest.device.serial.length === 0
    || !Number.isInteger(manifest.device?.api)
    || manifest.device.api < 24
    || typeof manifest.device?.abi !== "string"
    || manifest.device.abi.length === 0
    || typeof manifest.device?.model !== "string"
    || manifest.device.model.length === 0
    || typeof manifest.device?.android_release !== "string"
    || manifest.device.android_release.length === 0
    || !validTimestamp(manifest.started_at)
    || !validTimestamp(manifest.finished_at)
    || Date.parse(manifest.finished_at) < Date.parse(manifest.started_at)
    || PHASE13_SCHEMA_VERSION !== REQUIRED_SCHEMA_VERSION
  ) {
    fail("phase13_manifest_invalid");
  }
}

function validateContractResult(label, result, expectedIds, manifest) {
  const contract = result?.contract;
  if (
    result?.schema_version !== 1
    || result.suite !== label
    || result.status !== "passed"
    || result.build_manifest !== PHASE13_MANIFEST
    || result.base_head !== manifest.base_head
    || result.source_tree_sha256 !== manifest.source_tree_sha256
    || result.package !== manifest.package
    || !exactJson(result.apk, manifest.apk)
    || !exactJson(result.device, manifest.device)
    || result.installed_apk?.device_path !== manifest.installed_apk.device_path
    || result.installed_apk?.sha256 !== manifest.apk.sha256
    || result.installed_apk?.matches_retained_apk !== true
    || contract?.version !== 1
    || contract.expected_count !== expectedIds.length
    || contract.total !== expectedIds.length
    || contract.passed !== expectedIds.length
    || contract.failed !== 0
    || contract.skipped !== 0
    || !Array.isArray(contract.cases)
    || contract.cases.length !== expectedIds.length
    || !validTimestamp(contract.started_at)
    || !validTimestamp(contract.finished_at)
    || Date.parse(contract.finished_at) < Date.parse(contract.started_at)
    || typeof result.runner?.run_id !== "string"
    || result.runner.run_id.length === 0
    || !validTimestamp(result.runner?.started_at)
    || !validTimestamp(result.runner?.finished_at)
    || Date.parse(result.runner.finished_at) < Date.parse(result.runner.started_at)
  ) {
    fail(`phase13_${label.replaceAll("-", "_")}_invalid`);
  }
  for (let index = 0; index < expectedIds.length; index += 1) {
    const entry = contract.cases[index];
    if (
      entry?.id !== expectedIds[index]
      || entry.status !== "passed"
      || !Number.isFinite(entry.durationMs)
      || entry.durationMs < 0
      || Object.hasOwn(entry, "errorCode")
    ) {
      fail(`phase13_${label.replaceAll("-", "_")}_cases_invalid`);
    }
  }
}

function validateOwnerDecisions(ownerDecisions) {
  const map = ownerDecisions?.decisions?.["MAP-01"];
  const timing = ownerDecisions?.decisions?.["TIM-01"];
  if (
    ownerDecisions?.schema_version !== 1
    || ownerDecisions.milestone !== "v1.2"
    || ownerDecisions.source !== "direct_owner_reply"
    || ownerDecisions.product_decisions_pending !== 0
    || map?.status !== "approved"
    || map.selection !== "one-per-sport"
    || timing?.status !== "approved"
    || timing.selection !== "retire-playback"
    || timing.legacy_playback_compatibility !== false
  ) {
    fail("phase13_owner_decisions_invalid");
  }
}

export function validatePhase13AutomatedEvidence({
  manifest,
  migrations,
  portableMerge,
  multiPlanRunning,
  ownerDecisions,
}) {
  validateManifest(manifest);
  validateContractResult(
    "migrations-effects",
    migrations,
    PHASE13_MIGRATION_CASE_IDS,
    manifest,
  );
  validateContractResult(
    "portable-merge",
    portableMerge,
    PHASE13_PORTABLE_MERGE_CASE_IDS,
    manifest,
  );
  validateContractResult(
    "multi-plan-running",
    multiPlanRunning,
    PHASE13_MULTI_PLAN_RUNNING_CASE_IDS,
    manifest,
  );
  validateOwnerDecisions(ownerDecisions);
  validatePhase13Privacy({ manifest, migrations, portableMerge, multiPlanRunning });
  const native = Object.fromEntries([
    ["migrations-effects", migrations],
    ["portable-merge", portableMerge],
    ["multi-plan-running", multiPlanRunning],
  ].map(([suite, result]) => [suite, Object.freeze({
    cases: `${result.contract.passed}/${result.contract.expected_count}`,
    result_sha256: sha256(JSON.stringify(result)),
  })]));
  const evidence = Object.freeze({
    schema_version: 1,
    database_schema_version: PHASE13_SCHEMA_VERSION,
    suite: "phase13",
    status: "passed",
    mode: "automated-only",
    approval_status: "evidence_pending",
    attended_scope: "excluded",
    release_scope: "excluded",
    host: Object.freeze({
      typecheck: "passed",
      lint: "passed",
      full_jest_and_coverage: "passed",
    }),
    manifest: Object.freeze({
      base_head: manifest.base_head,
      source_tree_sha256: manifest.source_tree_sha256,
      apk_path: manifest.apk.path,
      apk_sha256: manifest.apk.sha256,
      installed_apk_sha256: manifest.installed_apk.sha256,
      package: manifest.package,
    }),
    device: Object.freeze({
      role: manifest.device.role,
      serial_sha256: sha256(manifest.device.serial),
      api: manifest.device.api,
      abi: manifest.device.abi,
    }),
    native: Object.freeze(native),
    owner_decisions: Object.freeze({
      "MAP-01": "one-per-sport",
      "TIM-01": "retire-playback",
      legacy_playback_compatibility: false,
    }),
    generated_at: new Date().toISOString(),
  });
  validatePhase13Privacy(evidence);
  return evidence;
}

export function validatePhase13CurrentArtifacts({
  manifest,
  currentHead,
  currentSourceTreeSha256,
  isCleanCommittedTree,
  retainedApkBytes,
  installedApkBytes,
  installedPackagePath,
  liveDevice = manifest.device,
}) {
  if (
    isCleanCommittedTree !== true
    ||
    manifest.base_head !== currentHead
    || manifest.source_tree_sha256 !== currentSourceTreeSha256
    || sha256(retainedApkBytes) !== manifest.apk?.sha256
    || retainedApkBytes.length !== manifest.apk?.size_bytes
    || sha256(installedApkBytes) !== manifest.apk?.sha256
    || installedPackagePath !== manifest.installed_apk?.device_path
    || liveDevice.serial !== manifest.device?.serial
    || liveDevice.api !== manifest.device?.api
    || liveDevice.abi !== manifest.device?.abi
    || liveDevice.model !== manifest.device?.model
    || liveDevice.android_release !== manifest.device?.android_release
  ) {
    fail("phase13_artifact_stale");
  }
}

export function parsePhase13VerifierArgs(args) {
  const options = { manifest: PHASE13_MANIFEST, automatedOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--automated-only") options.automatedOnly = true;
    else if (argument === "--manifest") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail("phase13_manifest_argument_invalid");
      options.manifest = value;
      index += 1;
    } else if (argument.startsWith("--manifest=")) {
      options.manifest = argument.slice("--manifest=".length);
    } else fail(`phase13_unknown_argument:${argument}`);
  }
  if (options.manifest !== PHASE13_MANIFEST || options.automatedOnly !== true) {
    fail("phase13_evidence_mode_invalid");
  }
  return options;
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`phase13_${label}_unreadable:${error instanceof Error ? error.message : "unknown"}`);
  }
}

function adb(serial, ...args) {
  const androidHome = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? "/opt/homebrew/share/android-commandlinetools";
  return execFileSync(
    path.join(androidHome, "platform-tools", "adb"),
    ["-s", serial, ...args],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

function runHostGates() {
  for (const command of PHASE13_HOST_GATES) {
    execFileSync("npm", command, { cwd: ROOT, stdio: "inherit" });
  }
}

export function executePhase13EvidenceVerifier(args = process.argv.slice(2)) {
  const options = parsePhase13VerifierArgs(args);
  const manifestPath = path.resolve(ROOT, options.manifest);
  const directory = path.dirname(manifestPath);
  const manifest = readJson(manifestPath, "manifest");
  const migrations = readJson(
    path.join(directory, "migrations-effects.json"),
    "migrations_effects",
  );
  const portableMerge = readJson(
    path.join(directory, "portable-merge.json"),
    "portable_merge",
  );
  const multiPlanRunning = readJson(
    path.join(directory, "multi-plan-running.json"),
    "multi_plan_running",
  );
  const ownerDecisions = readJson(
    path.join(ROOT, ".planning/v1.2-owner-decisions.json"),
    "owner_decisions",
  );
  const apkPath = path.resolve(ROOT, manifest.apk?.path ?? "");
  if (!existsSync(apkPath)) fail("phase13_apk_missing");
  const installedPackagePath = adb(
    manifest.device?.serial,
    "shell",
    "pm",
    "path",
    manifest.package,
  ).split(/\r?\n/u).find((line) => line.startsWith("package:"))?.slice(8);
  if (!installedPackagePath) fail("phase13_installed_package_missing");
  const installedApkBytes = execFileSync(
    path.join(
      process.env.ANDROID_HOME
        ?? process.env.ANDROID_SDK_ROOT
        ?? "/opt/homebrew/share/android-commandlinetools",
      "platform-tools",
      "adb",
    ),
    ["-s", manifest.device.serial, "exec-out", "cat", installedPackagePath],
    { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 },
  );
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  assertCleanCommittedTree(manifest.base_head, ROOT);
  validatePhase13CurrentArtifacts({
    manifest,
    currentHead,
    currentSourceTreeSha256: sourceTreeSha256AtHead(
      manifest.base_head,
      ROOT,
    ),
    isCleanCommittedTree: true,
    retainedApkBytes: readFileSync(apkPath),
    installedApkBytes,
    installedPackagePath,
    liveDevice: {
      serial: manifest.device.serial,
      api: Number(adb(manifest.device.serial, "shell", "getprop", "ro.build.version.sdk")),
      abi: adb(manifest.device.serial, "shell", "getprop", "ro.product.cpu.abi"),
      model: adb(manifest.device.serial, "shell", "getprop", "ro.product.model"),
      android_release: adb(
        manifest.device.serial,
        "shell",
        "getprop",
        "ro.build.version.release",
      ),
    },
  });
  const evidence = validatePhase13AutomatedEvidence({
    manifest,
    migrations,
    portableMerge,
    multiPlanRunning,
    ownerDecisions,
  });
  runHostGates();
  const outputPath = path.join(directory, "automated-evidence.json");
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (statSync(outputPath).size < 1) fail("phase13_evidence_write_failed");
  return evidence;
}

if (
  process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      ...executePhase13EvidenceVerifier(),
    })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "phase13_evidence_failed",
    })}\n`);
    process.exitCode = 1;
  }
}
