#!/usr/bin/env node

import {
  execFileSync,
} from "node:child_process";
import {
  createHash,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  pathToFileURL,
} from "node:url";

const ADB_FALLBACK = "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const SHA256 = /^[a-f0-9]{64}$/u;
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u;
const SERIAL = /^[A-Za-z0-9._:-]+$/u;
const REQUIRED_OPTIONS = new Map([
  ["--bundle-dir", "bundleDirectory"],
  ["--manifest-sha256", "expectedManifestSha256"],
  ["--package", "packageName"],
  ["--serial", "serial"],
  ["--output", "output"],
  ["--report-dir", "reportDirectory"],
  ["--flow", "flow"],
]);

function fail(message) {
  throw new Error(`Phase 6 Maestro: ${message}`);
}

export function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function safeOutputPath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(`${label} is required.`);
  }
  return path.resolve(value);
}

export function parsePhase6MaestroArguments(args = process.argv.slice(2)) {
  const options = {};
  if (args.length !== REQUIRED_OPTIONS.size * 2) {
    fail("arguments are malformed.");
  }
  for (let index = 0; index < args.length; index += 2) {
    const key = REQUIRED_OPTIONS.get(args[index]);
    const value = args[index + 1];
    if (key === undefined || options[key] !== undefined || typeof value !== "string"
      || value.length === 0 || value.startsWith("--")) {
      fail("arguments are malformed.");
    }
    options[key] = value;
  }
  if (!SHA256.test(options.expectedManifestSha256)) {
    fail("manifest SHA-256 is malformed.");
  }
  if (!PACKAGE.test(options.packageName)) {
    fail("package identity is malformed.");
  }
  if (!SERIAL.test(options.serial)) {
    fail("serial identity is malformed.");
  }
  if (options.flow !== "gesture-smoke") {
    fail("only the gesture-smoke flow is allowed.");
  }
  safeOutputPath(options.output, "output");
  safeOutputPath(options.reportDirectory, "report directory");
  return options;
}

function readManifest(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail("candidate manifest is invalid.");
  }
}

export function loadPhase6GestureCandidate({
  bundleDirectory,
  expectedManifestSha256,
  packageName,
}) {
  const bundle = safeOutputPath(bundleDirectory, "bundle directory");
  const manifestPath = path.join(bundle, "build.json");
  if (!existsSync(manifestPath) || sha256File(manifestPath) !== expectedManifestSha256) {
    fail("candidate manifest digest does not match the explicit identity.");
  }
  const manifest = readManifest(manifestPath);
  if (manifest?.schema_version !== 1
    || manifest?.suite !== "phase6-gesture-smoke"
    || manifest?.profile !== "development-test"
    || manifest?.package !== packageName
    || manifest?.package_launch?.succeeded !== true
    || manifest?.installed_apk?.matches_retained_apk !== true
    || !SHA256.test(manifest?.apk?.sha256 ?? "")
    || manifest?.installed_apk?.sha256 !== manifest.apk.sha256
    || typeof manifest?.apk?.path !== "string") {
    fail("candidate manifest identity is invalid.");
  }
  const apkPath = path.resolve(manifest.apk.path);
  if (!isInside(bundle, apkPath) || !existsSync(apkPath) || sha256File(apkPath) !== manifest.apk.sha256) {
    fail("candidate APK identity is invalid.");
  }
  return Object.freeze({
    bundleDirectory: bundle,
    manifest,
    manifestPath,
    manifestSha256: expectedManifestSha256,
    apkPath,
  });
}

export function resolveAdb(environment = process.env) {
  const pathEntries = String(environment.PATH ?? "").split(path.delimiter);
  for (const directory of pathEntries) {
    const candidate = path.join(directory, "adb");
    if (directory.length > 0 && existsSync(candidate)) return candidate;
  }
  if (existsSync(ADB_FALLBACK)) return ADB_FALLBACK;
  fail("ADB is unavailable from PATH and the pinned fallback.");
}

function adb(adbPath, serial, ...argumentsList) {
  return execFileSync(adbPath, ["-s", serial, ...argumentsList], {
    encoding: "utf8",
  }).trim();
}

function parsePassedJunit(bytes) {
  const text = bytes.toString("utf8");
  if (!/<testsuites?\b/u.test(text) || !/<testcase\b/u.test(text)
    || /<(?:failure|error|skipped)\b/u.test(text)) {
    fail("Maestro did not produce a passing JUnit report.");
  }
  return {
    tests: [...text.matchAll(/<testcase\b/gu)].length,
    failures: 0,
    errors: 0,
    skipped: 0,
  };
}

function installedDevice(adbPath, serial, packageName, expectedApkSha256) {
  const packagePath = adb(adbPath, serial, "shell", "pm", "path", packageName)
    .split(/\r?\n/u)
    .find((line) => line.startsWith("package:"))?.slice(8);
  if (!packagePath) fail("installed package is missing.");
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase6-installed-"));
  const temporaryApk = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync(adbPath, ["-s", serial, "pull", packagePath, temporaryApk], { stdio: "ignore" });
    const installedApkSha256 = sha256File(temporaryApk);
    if (installedApkSha256 !== expectedApkSha256) {
      fail("installed APK bytes do not match the candidate.");
    }
    return {
      serial_sha256: createHash("sha256").update(serial).digest("hex"),
      installed_package: packageName,
      installed_apk_sha256: installedApkSha256,
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function hasForbiddenEvidenceFields(evidence) {
  return [
    "raw_path",
    "private_path",
    "private_rows",
    "raw_rows",
    "serial",
  ].some((key) => Object.hasOwn(evidence, key));
}

export function validatePhase6GestureEvidence(evidence, candidate, rawReport) {
  const apkSha256 = candidate?.manifest?.apk?.sha256;
  if (evidence?.schema_version !== 1
    || evidence?.suite !== "phase6-gesture-smoke"
    || evidence?.status !== "passed"
    || evidence?.mode !== "automated-only"
    || evidence?.approval_status !== "evidence_pending"
    || evidence?.attended_scope !== "excluded"
    || evidence?.producer !== "phase6-maestro/v1"
    || evidence?.candidate?.manifest_sha256 !== candidate?.manifestSha256
    || evidence?.candidate?.package !== candidate?.manifest?.package
    || evidence?.candidate?.apk_sha256 !== apkSha256
    || evidence?.device?.installed_package !== candidate?.manifest?.package
    || evidence?.device?.installed_apk_sha256 !== apkSha256
    || !SHA256.test(evidence?.device?.serial_sha256 ?? "")
    || evidence?.flow?.id !== "gesture-smoke"
    || evidence?.flow?.raw_report_file !== "gesture-smoke.xml"
    || evidence?.flow?.tests < 1
    || evidence?.flow?.failures !== 0
    || evidence?.flow?.errors !== 0
    || evidence?.flow?.skipped !== 0
    || evidence?.flow?.raw_report_sha256 !== createHash("sha256").update(rawReport).digest("hex")
    || evidence?.font_scale_restored !== true
    || hasForbiddenEvidenceFields(evidence)) {
    fail("automated evidence identity or privacy boundary is invalid.");
  }
}

function runMain() {
  const options = parsePhase6MaestroArguments();
  const candidate = loadPhase6GestureCandidate(options);
  const adbPath = resolveAdb();
  const output = safeOutputPath(options.output, "output");
  const reportDirectory = safeOutputPath(options.reportDirectory, "report directory");
  const flowPath = path.resolve("maestro/phase6/gesture-smoke.yaml");
  if (!existsSync(flowPath)) fail("gesture smoke flow is missing.");
  mkdirSync(path.dirname(output), { recursive: true });
  mkdirSync(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, "gesture-smoke.xml");
  const priorFontScale = adb(adbPath, options.serial, "shell", "settings", "get", "system", "font_scale");
  let evidence;
  try {
    execFileSync(adbPath, ["-s", options.serial, "install", "-r", candidate.apkPath], { stdio: "inherit" });
    const device = installedDevice(adbPath, options.serial, options.packageName, candidate.manifest.apk.sha256);
    adb(adbPath, options.serial, "shell", "settings", "put", "system", "font_scale", "1.0");
    execFileSync("maestro", [
      "test", "--device", options.serial, "--format", "junit",
      "--output", reportPath, "--test-output-dir", reportDirectory, flowPath,
    ], { stdio: "inherit" });
    if (!existsSync(reportPath)) fail("Maestro report is missing.");
    const rawReport = readFileSync(reportPath);
    evidence = {
      schema_version: 1, suite: "phase6-gesture-smoke", status: "passed",
      mode: "automated-only", approval_status: "evidence_pending",
      attended_scope: "excluded", producer: "phase6-maestro/v1",
      candidate: { manifest_sha256: candidate.manifestSha256, package: candidate.manifest.package, apk_sha256: candidate.manifest.apk.sha256 },
      device,
      flow: { id: "gesture-smoke", raw_report_file: "gesture-smoke.xml", raw_report_sha256: createHash("sha256").update(rawReport).digest("hex"), ...parsePassedJunit(rawReport) },
      font_scale_restored: false,
    };
  } finally {
    adb(adbPath, options.serial, "shell", "settings", "put", "system", "font_scale", priorFontScale);
    const restored = adb(adbPath, options.serial, "shell", "settings", "get", "system", "font_scale") === priorFontScale;
    if (evidence !== undefined) {
      evidence.font_scale_restored = restored;
      const rawReport = readFileSync(reportPath);
      validatePhase6GestureEvidence(evidence, candidate, rawReport);
      writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    }
  }
  return evidence;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const evidence = runMain();
    process.stdout.write(`${JSON.stringify({ ok: true, tests: evidence.flow.tests })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
