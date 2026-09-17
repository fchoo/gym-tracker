#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const PROJECT_ROOT = process.cwd();
const ADB_FALLBACK = "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const PHASE9_SCHEDULED_WORKOUT_CLOCK = "091812002026";
const V20_MANIFEST = "artifacts/native/migrations-effects/build.json";
const V20_RESULT = "artifacts/native/migrations-effects/result.json";
const TASK1_SUMMARY = ".planning/phases/09-in-workout-exercise-editing/09-03-SUMMARY.md";
const TASK1_PATHS = Object.freeze([
  "package.json",
  "scripts/run-phase9-maestro.mjs",
  "scripts/phase9-evidence-scripts.test.mjs",
  "maestro/phase9/in-workout-exercise-editing.yaml",
  "src/ui/__tests__/ActiveWorkoutScreen.test.tsx",
  "src/ui/__tests__/WorkoutCompletionScreen.test.tsx",
]);

export const PHASE9_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "in-workout-exercise-editing",
    flow: "maestro/phase9/in-workout-exercise-editing.yaml",
  }),
  Object.freeze({
    id: "completed-workout-plan-writeback-keep",
    flow: "maestro/phase9/completed-workout-plan-writeback-keep.yaml",
  }),
  Object.freeze({
    id: "completed-workout-plan-writeback-retry",
    flow: "maestro/phase9/completed-workout-plan-writeback-retry.yaml",
  }),
]);

export const PHASE9_EVIDENCE_MATRIX = Object.freeze([
  Object.freeze({ id: "D-01", source: "src/domains/workout/outcomes.test.ts", flows: ["completed-workout-plan-writeback-keep", "completed-workout-plan-writeback-retry"] }),
  Object.freeze({ id: "D-02", source: "src/bootstrap/workoutAppRuntime.test.tsx", flows: ["completed-workout-plan-writeback-keep", "completed-workout-plan-writeback-retry"] }),
  Object.freeze({ id: "D-03", source: "tests/integration/session-exercise-editing.test.ts", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "D-04", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "D-05", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "D-06", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "D-07", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "D-08", source: "tests/integration/session-exercise-editing.test.ts", flows: ["completed-workout-plan-writeback-keep"] }),
  Object.freeze({ id: "WORK-20", source: "tests/integration/session-exercise-editing.test.ts", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "WORK-21", source: "tests/integration/session-exercise-editing.test.ts", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "WORK-22", source: "tests/integration/session-exercise-editing.test.ts", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "WORK-23", source: "tests/integration/session-exercise-editing.test.ts", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "WORK-24", source: "tests/integration/plan-impact-replacement.test.ts", flows: ["completed-workout-plan-writeback-retry"] }),
  Object.freeze({ id: "WORK-25", source: "tests/integration/today-schedule-workout.test.ts", flows: ["completed-workout-plan-writeback-keep"] }),
  Object.freeze({ id: "WORK-27", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: ["completed-workout-plan-writeback-keep", "completed-workout-plan-writeback-retry"] }),
  Object.freeze({ id: "ROADMAP-09-01", source: "tests/integration/session-exercise-editing.test.ts", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "ROADMAP-09-02", source: "tests/integration/session-exercise-editing.test.ts", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "ROADMAP-09-03", source: "tests/integration/session-exercise-editing.test.ts", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "ROADMAP-09-04", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "ROADMAP-09-05", source: "tests/integration/today-schedule-workout.test.ts", flows: ["completed-workout-plan-writeback-keep"] }),
  Object.freeze({ id: "ROADMAP-09-06", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: ["completed-workout-plan-writeback-keep", "completed-workout-plan-writeback-retry"] }),
  Object.freeze({ id: "UI-populated", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "UI-partial", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "UI-overflow", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "UI-zero-one-many", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "UI-long-text", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: ["completed-workout-plan-writeback-keep"] }),
  Object.freeze({ id: "UI-loading", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: ["completed-workout-plan-writeback-retry"] }),
  Object.freeze({ id: "UI-empty", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["in-workout-exercise-editing"] }),
  Object.freeze({ id: "UI-error", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: ["completed-workout-plan-writeback-retry"] }),
  Object.freeze({ id: "UI-themes", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: [] }),
  Object.freeze({ id: "UI-widths", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: [] }),
  Object.freeze({ id: "UI-font-scale-2", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: [] }),
  Object.freeze({ id: "UI-reduced-motion", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: [] }),
  Object.freeze({ id: "UI-role-name-state", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: [] }),
  Object.freeze({ id: "UI-focus-input", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: [] }),
  Object.freeze({ id: "UI-minimum-target", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: [] }),
  Object.freeze({ id: "UI-non-color", source: "src/ui/__tests__/WorkoutCompletionScreen.test.tsx", flows: [] }),
]);

function fail(message) {
  throw new Error(`Phase 9 Maestro: ${message}`);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function command(executable, args, options = {}) {
  return execFileSync(executable, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function parseArguments(args) {
  const options = {
    manifest: "artifacts/native/phase9/build.json",
    v20Manifest: V20_MANIFEST,
    v20Result: V20_RESULT,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--manifest") { options.manifest = next ?? ""; index += 1; }
    else if (argument === "--v20-manifest") { options.v20Manifest = next ?? ""; index += 1; }
    else if (argument === "--v20-result") { options.v20Result = next ?? ""; index += 1; }
    else if (argument.startsWith("--manifest=")) options.manifest = argument.slice("--manifest=".length);
    else if (argument.startsWith("--v20-manifest=")) options.v20Manifest = argument.slice("--v20-manifest=".length);
    else if (argument.startsWith("--v20-result=")) options.v20Result = argument.slice("--v20-result=".length);
    else fail(`unknown argument: ${argument}`);
  }
  for (const [label, value] of Object.entries(options)) {
    if (!value) fail(`${label} is required.`);
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(options).map(([key, value]) => [key, path.resolve(PROJECT_ROOT, value)]),
  ));
}

function resolveAdb() {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const candidate = androidHome === undefined
    ? ADB_FALLBACK
    : path.join(androidHome, "platform-tools", "adb");
  if (!existsSync(candidate)) fail(`adb is unavailable: ${candidate}`);
  return candidate;
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing: ${filePath}`);
  try { return JSON.parse(readFileSync(filePath, "utf8")); }
  catch { fail(`${label} is unreadable: ${filePath}`); }
  return undefined;
}

function parseJunit(bytes, contract) {
  const xml = bytes.toString("utf8");
  const tests = Number(xml.match(/\btests="(\d+)"/u)?.[1] ?? 0);
  const failures = Number(xml.match(/\bfailures="(\d+)"/u)?.[1] ?? 0);
  const errors = Number(xml.match(/\berrors="(\d+)"/u)?.[1] ?? 0);
  const skipped = Number(xml.match(/\bskipped="(\d+)"/u)?.[1] ?? 0);
  if (!xml.includes(contract.flow) || tests < 1 || failures !== 0 || errors !== 0 || skipped !== 0) {
    fail(`JUnit report did not pass: ${contract.id}`);
  }
  return Object.freeze({ tests, failures, errors, skipped });
}

function ensureEvidenceMatrix() {
  const ids = new Set();
  const flowIds = new Set(PHASE9_MAESTRO_FLOW_CONTRACTS.map(({ id }) => id));
  for (const entry of PHASE9_EVIDENCE_MATRIX) {
    if (typeof entry.id !== "string" || ids.has(entry.id) || !existsSync(path.join(PROJECT_ROOT, entry.source))) {
      fail(`evidence matrix is invalid: ${entry.id}`);
    }
    ids.add(entry.id);
    for (const flowId of entry.flows) {
      if (!flowIds.has(flowId)) fail(`evidence matrix names an unknown flow: ${entry.id}`);
    }
  }
}

function task1Boundary() {
  const source = readFileSync(path.join(PROJECT_ROOT, TASK1_SUMMARY), "utf8");
  const matches = source.match(/^task1_boundary_commit: ([0-9a-f]{40})$/gmu) ?? [];
  if (matches.length !== 1) fail("Task 1 boundary is invalid");
  return matches[0].slice("task1_boundary_commit: ".length);
}

function verifyNoForbiddenScope(boundary) {
  const changed = command("git", ["diff", "--name-only", `${boundary}..HEAD`, "--"])
    .split(/\r?\n/u).filter(Boolean);
  if (changed.some((filePath) => /^(?:web|dashboard|api)(?:\/|$)/u.test(filePath))) {
    fail("dashboard, web, or external API artifacts are outside the Phase 9 scope");
  }
}

function verifyImmutableMigration(boundary) {
  try {
    command("git", [
      "diff", "--quiet", `${boundary}..HEAD`, "--",
      "src/platform/sqlite/migrations/0019_session_exercise_editing.ts",
    ]);
  } catch {
    fail("migration 0019 changed after the Task 1 boundary");
  }
}

function verifyTask1Boundary() {
  command(process.execPath, [
    "scripts/verify-phase9-task1-boundary.mjs",
    "downstream",
    "--summary", TASK1_SUMMARY,
    "--paths",
    ...TASK1_PATHS,
  ]);
  return task1Boundary();
}

function verifyV20(options) {
  const output = command(process.execPath, [
    "scripts/verify-phase9-v20-native-evidence.mjs",
    "--manifest", path.relative(PROJECT_ROOT, options.v20Manifest),
    "--result", path.relative(PROJECT_ROOT, options.v20Result),
    "--skip-live-device-check",
  ]);
  try { return JSON.parse(output); }
  catch { fail("v20 evidence parser returned invalid JSON"); }
  return undefined;
}

function loadManifest(manifestPath) {
  const manifest = readJson(manifestPath, "native build manifest");
  const currentHead = command("git", ["rev-parse", "HEAD"]);
  const currentDigest = sourceTreeSha256(PROJECT_ROOT);
  if (manifest?.schema_version !== 1
    || manifest.suite !== "phase9"
    || manifest.profile !== "development-test"
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || manifest.package !== PACKAGE
    || manifest.base_head !== currentHead
    || manifest.source_tree_sha256 !== currentDigest
    || !/^[0-9a-f]{40}$/u.test(manifest.base_head ?? "")
    || !/^[0-9a-f]{64}$/u.test(manifest.source_tree_sha256 ?? "")) {
    fail("native manifest identity does not match the current Phase 9 source");
  }
  const apkPath = path.resolve(PROJECT_ROOT, manifest?.apk?.path ?? "");
  if (!existsSync(apkPath)
    || manifest.apk?.sha256 !== sha256File(apkPath)
    || manifest.apk?.size_bytes !== statSync(apkPath).size
    || manifest.apk?.page_alignment_kib !== 16
    || manifest.apk?.page_alignment_verified !== true
    || manifest.installed_apk?.sha256 !== manifest.apk?.sha256
    || manifest.installed_apk?.matches_retained_apk !== true
    || typeof manifest.device?.serial !== "string"
    || !Number.isInteger(manifest.device?.api)
    || typeof manifest.device?.abi !== "string") {
    fail("native APK or device identity is incomplete");
  }
  return Object.freeze({ manifest, apkPath, currentHead, currentDigest });
}

function validateLiveInstallation(adb, manifest) {
  const serial = manifest.device.serial;
  const api = Number(command(adb, ["-s", serial, "shell", "getprop", "ro.build.version.sdk"]));
  const abi = command(adb, ["-s", serial, "shell", "getprop", "ro.product.cpu.abi"]);
  const installedPath = command(adb, ["-s", serial, "shell", "pm", "path", PACKAGE])
    .split(/\r?\n/u).find((line) => line.startsWith("package:"))?.slice(8);
  if (
    api !== manifest.device.api
    || abi !== manifest.device.abi
    || typeof installedPath !== "string"
    || installedPath.length === 0
  ) {
    fail("live manifest device or installed package does not match");
  }
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase9-installed-apk-"));
  try {
    const installedCopy = path.join(temporaryDirectory, "installed.apk");
    command(adb, ["-s", serial, "pull", installedPath, installedCopy]);
    if (sha256File(installedCopy) !== manifest.apk.sha256) {
      fail("installed APK bytes do not match the retained APK");
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function snapshotFlows() {
  return Object.freeze(PHASE9_MAESTRO_FLOW_CONTRACTS.map((contract) => {
    const absolute = path.join(PROJECT_ROOT, contract.flow);
    if (!existsSync(absolute)) fail(`required Maestro flow is missing: ${contract.id}`);
    return Object.freeze({ ...contract, absolute, sha256: sha256File(absolute) });
  }));
}

export function validatePhase9Evidence(
  evidence,
  snapshot = PHASE9_MAESTRO_FLOW_CONTRACTS,
  expected,
) {
  if (evidence?.schema_version !== 1
    || evidence.suite !== "phase9"
    || evidence.status !== "passed"
    || evidence.producer !== "phase9-maestro/v1"
    || !same(evidence.matrix, PHASE9_EVIDENCE_MATRIX)
    || expected === undefined
    || evidence.v20?.ok !== true
    || evidence.v20.suite !== "migrations-effects"
    || !Number.isInteger(evidence.v20.exact_cases)
    || evidence.v20.exact_cases < 1
    || !same(evidence.identity, expected.identity)
    || !same(evidence.v20, expected.v20)) {
    fail("Phase 9 evidence identity or matrix is invalid");
  }
  if (!Array.isArray(evidence.flows) || evidence.flows.length !== snapshot.length) {
    fail("Phase 9 evidence flow ledger is incomplete");
  }
  for (const [index, contract] of snapshot.entries()) {
    const actual = evidence.flows?.[index];
    if (actual?.id !== contract.id
      || actual.flow !== contract.flow
      || actual.flow_sha256 !== contract.sha256
      || actual.tests < 1
      || actual.failures !== 0
      || actual.errors !== 0
      || actual.skipped !== 0
      || !/^[0-9a-f]{64}$/u.test(actual.report_sha256 ?? "")) {
      fail(`Phase 9 evidence flow is invalid: ${contract.id}`);
    }
  }
  return evidence;
}

export function executePhase9Maestro(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  ensureEvidenceMatrix();
  const boundary = verifyTask1Boundary();
  verifyNoForbiddenScope(boundary);
  verifyImmutableMigration(boundary);
  const v20 = verifyV20(options);
  const { manifest, apkPath, currentHead, currentDigest } = loadManifest(options.manifest);
  const adb = resolveAdb();
  const serial = manifest.device.serial;
  const reportDirectory = path.join(path.dirname(options.manifest), "phase9-maestro");
  const output = path.join(path.dirname(options.manifest), "phase9-maestro.json");
  const temporaryReports = mkdtempSync(path.join(os.tmpdir(), "phase9-maestro-reports-"));
  const flows = snapshotFlows();
  let priorAutoTime;
  let priorDate;
  let primaryError;
  let evidence;

  try {
    command(adb, ["-s", serial, "root"]);
    command(adb, ["-s", serial, "wait-for-device"]);
    const adbUser = command(adb, ["-s", serial, "shell", "id"]);
    if (!adbUser.includes("uid=0(root)")) fail("the manifest device must allow adb root for the scheduled-day fixture");
    command(adb, ["-s", serial, "install", "-r", apkPath]);
    validateLiveInstallation(adb, manifest);
    priorAutoTime = command(adb, ["-s", serial, "shell", "settings", "get", "global", "auto_time"]);
    priorDate = command(adb, ["-s", serial, "shell", "date", "+%m%d%H%M%Y"]);
    command(adb, ["-s", serial, "shell", "settings", "put", "global", "auto_time", "0"]);
    command(adb, ["-s", serial, "shell", "date", PHASE9_SCHEDULED_WORKOUT_CLOCK]);
    if (command(adb, ["-s", serial, "shell", "date", "+%Y-%m-%d"]) !== "2026-09-18") {
      fail("scheduled workout date was not applied");
    }

    const reports = [];
    for (const contract of flows) {
      const reportPath = path.join(temporaryReports, `${contract.id}.xml`);
      execFileSync("maestro", [
        "test", "--no-ansi", "--format", "junit", "--output", reportPath,
        "--udid", serial, contract.absolute,
      ], { cwd: PROJECT_ROOT, stdio: "inherit" });
      if (sha256File(contract.absolute) !== contract.sha256) {
        fail(`executed Maestro flow bytes changed: ${contract.id}`);
      }
      const report = readFileSync(reportPath);
      reports.push(Object.freeze({
        id: contract.id,
        flow: contract.flow,
        flow_sha256: contract.sha256,
        report_file: `phase9-maestro/${contract.id}.xml`,
        report_sha256: sha256Bytes(report),
        ...parseJunit(report, contract),
      }));
    }
    evidence = {
      schema_version: 1,
      suite: "phase9",
      status: "passed",
      producer: "phase9-maestro/v1",
      build_manifest: path.relative(PROJECT_ROOT, options.manifest),
      identity: {
        base_head: currentHead,
        source_tree_sha256: currentDigest,
        apk_sha256: manifest.apk.sha256,
        installed_apk_sha256: manifest.installed_apk.sha256,
        device: manifest.device,
      },
      v20,
      matrix: PHASE9_EVIDENCE_MATRIX,
      flows: reports,
    };
    validatePhase9Evidence(evidence, flows, Object.freeze({
      identity: evidence.identity,
      v20,
    }));
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    if (priorAutoTime !== undefined) {
      try {
        command(adb, ["-s", serial, "shell", "settings", "put", "global", "auto_time", priorAutoTime]);
        if (priorAutoTime === "0") command(adb, ["-s", serial, "shell", "date", priorDate]);
      } catch (error) { cleanupErrors.push(error); }
    }
    if (primaryError === undefined && cleanupErrors.length === 0 && evidence !== undefined) {
      rmSync(reportDirectory, { recursive: true, force: true });
      renameSync(temporaryReports, reportDirectory);
      const temporaryOutput = `${output}.tmp`;
      writeFileSync(temporaryOutput, `${JSON.stringify(evidence, null, 2)}\n`);
      renameSync(temporaryOutput, output);
    } else {
      rmSync(temporaryReports, { recursive: true, force: true });
    }
    if (primaryError !== undefined) throw primaryError;
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "Phase 9 clock cleanup failed.");
  }
  return evidence;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const evidence = executePhase9Maestro();
    process.stdout.write(`${JSON.stringify({ ok: true, flows: evidence.flows.length, exact_cases: evidence.v20.exact_cases })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "phase9_maestro_failed", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
