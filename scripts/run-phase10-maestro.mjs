#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const ADB_FALLBACK = "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";

export const PHASE10_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "phase10-advanced-set-timing",
    flow: "maestro/phase10/advanced-set-timing.yaml",
  }),
]);

export const PHASE10_EVIDENCE_MATRIX = Object.freeze([
  Object.freeze({ id: "WORK-26", source: "src/ui/__tests__/AdvancedTimingIndicator.test.tsx", flows: ["phase10-advanced-set-timing"] }),
  Object.freeze({ id: "D-01", source: "src/bootstrap/workoutAppRuntime.test.tsx", flows: ["phase10-advanced-set-timing"] }),
  Object.freeze({ id: "D-02", source: "tests/integration/advanced-timing.test.ts", flows: ["phase10-advanced-set-timing"] }),
  Object.freeze({ id: "D-03", source: "tests/integration/rest-lifecycle.test.ts", flows: ["phase10-advanced-set-timing"] }),
  Object.freeze({ id: "D-04", source: "tests/integration/advanced-timing.test.ts", flows: ["phase10-advanced-set-timing"] }),
  Object.freeze({ id: "ROADMAP-10-01", source: "tests/integration/advanced-timing.test.ts", flows: ["phase10-advanced-set-timing"] }),
  Object.freeze({ id: "ROADMAP-10-02", source: "src/ui/__tests__/AdvancedTimingIndicator.test.tsx", flows: ["phase10-advanced-set-timing"] }),
  Object.freeze({ id: "ROADMAP-10-03", source: "src/bootstrap/workoutAppRuntime.test.tsx", flows: ["phase10-advanced-set-timing"] }),
  Object.freeze({ id: "ROADMAP-10-04", source: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx", flows: ["phase10-advanced-set-timing"] }),
]);

function fail(message) {
  throw new Error(`Phase 10 Maestro: ${message}`);
}

function parseArguments(args) {
  let manifestArgument = "artifacts/native/phase10/build.json";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      manifestArgument = args[index + 1] ?? "";
      index += 1;
    } else if (argument.startsWith("--manifest=")) {
      manifestArgument = argument.slice("--manifest=".length);
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (!manifestArgument) fail("--manifest is required.");
  return path.resolve(projectRoot, manifestArgument);
}

function command(executable, args) {
  return execFileSync(executable, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function validatePhase10Manifest(manifest, apkPath, apkSha256) {
  if (manifest?.schema_version !== 1
    || manifest.profile !== "development-test"
    || manifest.suite !== "phase10"
    || manifest.package !== "com.fchoo.gymtracker.devtest"
    || typeof manifest.device?.serial !== "string"
    || manifest.device.serial.length === 0
    || typeof manifest.apk?.path !== "string"
    || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "")) {
    fail("manifest is not a Phase 10 development-test APK contract.");
  }
  if (typeof apkPath !== "string" || apkPath.length === 0
    || !/^[a-f0-9]{64}$/u.test(apkSha256 ?? "")
    || apkSha256 !== manifest.apk.sha256) {
    fail("APK bytes do not match the declared Phase 10 manifest.");
  }
  return true;
}

function resolveAdb() {
  const configured = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const candidate = configured === undefined
    ? ADB_FALLBACK
    : path.join(configured, "platform-tools", "adb");
  if (!existsSync(candidate)) fail(`adb is unavailable: ${candidate}`);
  return candidate;
}

function parseManifest(manifestPath) {
  if (!existsSync(manifestPath)) fail(`manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const apkPath = path.resolve(projectRoot, manifest.apk.path);
  if (!existsSync(apkPath)) fail(`retained APK is missing: ${apkPath}`);
  validatePhase10Manifest(manifest, apkPath, sha256File(apkPath));
  return { manifest, apkPath };
}

function junitSummary(xml, flow) {
  const tests = Number(xml.match(/\btests="(\d+)"/u)?.[1] ?? 0);
  const failures = Number(xml.match(/\bfailures="(\d+)"/u)?.[1] ?? 0);
  const errors = Number(xml.match(/\berrors="(\d+)"/u)?.[1] ?? 0);
  const skipped = Number(xml.match(/\bskipped="(\d+)"/u)?.[1] ?? 0);
  if (!xml.includes(flow) || tests < 1 || failures !== 0 || errors !== 0 || skipped !== 0) {
    fail(`Maestro report did not pass: ${flow}`);
  }
  return { tests, failures, errors, skipped };
}

export function validatePhase10Evidence(evidence) {
  if (evidence?.status !== "passed"
    || evidence.build_manifest !== "artifacts/native/phase10/build.json"
    || !Array.isArray(evidence.flows)
    || evidence.flows.length !== PHASE10_MAESTRO_FLOW_CONTRACTS.length) {
    fail("Phase 10 evidence is incomplete.");
  }
  const requiredIds = new Set(PHASE10_EVIDENCE_MATRIX.map(({ id }) => id));
  const actualIds = new Set(evidence.matrix?.map?.(({ id }) => id));
  for (const id of requiredIds) {
    if (!actualIds.has(id)) fail(`Phase 10 evidence is missing ${id}.`);
  }
  for (const [index, contract] of PHASE10_MAESTRO_FLOW_CONTRACTS.entries()) {
    const actual = evidence.flows[index];
    if (actual?.id !== contract.id
      || actual.flow !== contract.flow
      || actual.tests < 1
      || actual.failures !== 0
      || actual.errors !== 0
      || actual.skipped !== 0) {
      fail(`flow evidence is invalid: ${contract.id}`);
    }
  }
}

export function executePhase10Maestro(args = process.argv.slice(2)) {
  const manifestPath = parseArguments(args);
  const { manifest, apkPath } = parseManifest(manifestPath);
  const adb = resolveAdb();
  const serial = manifest.device.serial;
  command(adb, ["-s", serial, "install", "-r", apkPath]);
  const flows = PHASE10_MAESTRO_FLOW_CONTRACTS.map((contract) => {
    const flowPath = path.resolve(projectRoot, contract.flow);
    if (!existsSync(flowPath)) fail(`missing Maestro flow: ${contract.flow}`);
    const reportPath = path.join(path.dirname(manifestPath), `${contract.id}.xml`);
    command(adb, ["-s", serial, "shell", "am", "force-stop", manifest.package]);
    command("maestro", [
      "test", "--no-ansi", "--format", "junit", "--output", reportPath,
      "--udid", serial, flowPath,
    ]);
    const report = readFileSync(reportPath, "utf8");
    return {
      ...contract,
      ...junitSummary(report, contract.flow),
      report_sha256: createHash("sha256").update(report).digest("hex"),
    };
  });
  const evidence = {
    schema_version: 1,
    suite: "phase10",
    status: "passed",
    build_manifest: path.relative(projectRoot, manifestPath),
    apk_sha256: manifest.apk.sha256,
    matrix: PHASE10_EVIDENCE_MATRIX,
    flows,
  };
  validatePhase10Evidence(evidence);
  writeFileSync(
    path.join(path.dirname(manifestPath), "phase10-maestro.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  return evidence;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const evidence = executePhase10Maestro();
    process.stdout.write(`${JSON.stringify({ ok: true, flows: evidence.flows.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "phase10_maestro_failed", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
