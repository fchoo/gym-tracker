#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const ADB_FALLBACK = "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";

export const PHASE8_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "phase8-session-overview",
    flow: "maestro/phase8/session-overview.yaml",
  }),
  Object.freeze({
    id: "rest-recovery",
    flow: "maestro/lifecycle/rest-recovery.yaml",
  }),
  Object.freeze({
    id: "phase2-remediation-workout",
    flow: "maestro/phase2/remediation-workout.yaml",
  }),
  Object.freeze({
    id: "phase1-full-loop",
    flow: "maestro/smoke/phase1-full-loop.yaml",
  }),
  Object.freeze({
    id: "phase1-denied-late-notifications",
    flow: "maestro/smoke/phase1-denied-late-notifications.yaml",
  }),
]);

function fail(message) {
  throw new Error(`Phase 8 Maestro: ${message}`);
}

function parseArguments(args) {
  let manifestArgument = "artifacts/native/phase2/build.json";
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
  if (manifest?.schema_version !== 1
    || manifest.profile !== "development-test"
    || manifest.suite !== "phase2"
    || manifest.package !== "com.fchoo.gymtracker.devtest"
    || typeof manifest.device?.serial !== "string"
    || manifest.device.serial.length === 0
    || typeof manifest.apk?.path !== "string") {
    fail("manifest is not a Phase 2 development-test APK contract.");
  }
  const apkPath = path.resolve(projectRoot, manifest.apk.path);
  if (!existsSync(apkPath)) fail(`retained APK is missing: ${apkPath}`);
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

export function validatePhase8Evidence(evidence) {
  if (evidence?.status !== "passed"
    || evidence.font_scale?.applied !== "2.0"
    || evidence.font_scale?.restored !== true
    || typeof evidence.font_scale?.prior !== "string"
    || evidence.font_scale.prior.length === 0
    || !Array.isArray(evidence.flows)
    || evidence.flows.length !== PHASE8_MAESTRO_FLOW_CONTRACTS.length) {
    fail("font scale or flow evidence is incomplete.");
  }
  for (const [index, contract] of PHASE8_MAESTRO_FLOW_CONTRACTS.entries()) {
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

export function executePhase8Maestro(args = process.argv.slice(2)) {
  const manifestPath = parseArguments(args);
  const { manifest, apkPath } = parseManifest(manifestPath);
  const adb = resolveAdb();
  const serial = manifest.device.serial;
  const priorFontScale = command(adb, ["-s", serial, "shell", "settings", "get", "system", "font_scale"]);
  let primaryError;
  let flows;
  try {
    command(adb, ["-s", serial, "install", "-r", apkPath]);
    command(adb, ["-s", serial, "shell", "settings", "put", "system", "font_scale", "2.0"]);
    if (command(adb, ["-s", serial, "shell", "settings", "get", "system", "font_scale"]) !== "2.0") {
      fail("font scale did not become 2.0.");
    }
    flows = PHASE8_MAESTRO_FLOW_CONTRACTS.map((contract) => {
      const flowPath = path.resolve(projectRoot, contract.flow);
      if (!existsSync(flowPath)) fail(`missing Maestro flow: ${contract.flow}`);
      const reportPath = path.join(path.dirname(manifestPath), `${contract.id}.xml`);
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
  } catch (error) {
    primaryError = error;
  }

  let restored = false;
  let cleanupError;
  try {
    command(adb, ["-s", serial, "shell", "settings", "put", "system", "font_scale", priorFontScale]);
    restored = command(adb, ["-s", serial, "shell", "settings", "get", "system", "font_scale"]) === priorFontScale;
    if (!restored) fail("font scale cleanup did not restore the original value.");
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;

  const evidence = {
    schema_version: 1,
    suite: "phase8",
    status: "passed",
    build_manifest: path.relative(projectRoot, manifestPath),
    font_scale: { prior: priorFontScale, applied: "2.0", restored },
    flows,
  };
  validatePhase8Evidence(evidence);
  const output = path.join(path.dirname(manifestPath), "phase8-maestro.json");
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const evidence = executePhase8Maestro();
    process.stdout.write(`${JSON.stringify({ ok: true, flows: evidence.flows.length, font_scale_restored: true })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "phase8_maestro_failed", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
