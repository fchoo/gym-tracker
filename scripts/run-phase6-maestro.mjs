#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  loadPhase5Candidate,
  phase5CandidateIdentity,
  SHA256_PATTERN,
  sha256File,
  validatePhase5DeviceIdentity,
} from "./phase5-candidate-evidence.mjs";

const ADB_FALLBACK = "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const PACKAGE = "com.fchoo.gymtracker";
const SERIAL = /^[A-Za-z0-9._:-]+$/u;
const SAFE_RELATIVE_FILE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/u;
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "approval",
  "owner_approval",
  "publication",
  "promotion",
  "raw_path",
  "private_path",
  "private_rows",
  "raw_rows",
  "release_authorization",
  "serial",
  "tag",
  "terminal_seal",
]);
const REQUIRED_OPTIONS = new Map([
  ["--bundle-dir", "bundleDirectory"],
  ["--manifest-sha256", "expectedManifestSha256"],
  ["--package", "packageName"],
  ["--serial", "serial"],
  ["--output", "output"],
  ["--report-dir", "reportDirectory"],
]);

export const PHASE6_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "phase6-progress-library",
    flow: "maestro/phase6/progress-library.yaml",
    considerations: Object.freeze(["C1", "C2", "C3", "C4", "C7", "C11"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "phase6-calendar-date-reorder",
    flow: "maestro/phase6/calendar-date-reorder.yaml",
    considerations: Object.freeze(["C1", "C2", "C3", "C4", "C5", "C6", "C9", "C10"]),
    native_backstops: Object.freeze(["N2", "N3"]),
  }),
  Object.freeze({
    id: "phase6-navigation-accessibility",
    flow: "maestro/phase6/navigation-accessibility.yaml",
    considerations: Object.freeze(["C6", "C8"]),
    native_backstops: Object.freeze(["N1", "N2"]),
  }),
]);

export const PHASE6_CONSIDERATION_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "C1",
    owner: "06-04 Calendar, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library", "phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "C2",
    owner: "06-04 Calendar, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "C3",
    owner: "06-04 Calendar, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library", "phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "C4",
    owner: "06-04 Calendar, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library", "phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N1", "N4"]),
  }),
  Object.freeze({
    id: "C5",
    owner: "06-04 Calendar and CalendarField",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/components/CalendarField.test.tsx",
    ]),
    flows: Object.freeze(["phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N2"]),
  }),
  Object.freeze({
    id: "C6",
    owner: "06-04 CalendarField, 06-05 reorder, 06-06 Library, 06-08 navigation",
    automated_checks: Object.freeze([
      "src/ui/components/CalendarField.test.tsx",
      "src/ui/__tests__/OwnedPlanEditor.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/foundation.test.tsx",
      "app/(tabs)/__tests__/_layout.test.tsx",
    ]),
    flows: Object.freeze(["phase6-calendar-date-reorder", "phase6-navigation-accessibility"]),
    native_backstops: Object.freeze(["N2", "N4"]),
  }),
  Object.freeze({
    id: "C7",
    owner: "06-05 picker, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/OwnedPlanEditor.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "C8",
    owner: "06-04 CalendarField, 06-05 reorder, 06-08 navigation/Today",
    automated_checks: Object.freeze([
      "src/ui/components/CalendarField.test.tsx",
      "src/ui/__tests__/OwnedPlanEditor.test.tsx",
      "src/ui/__tests__/foundation.test.tsx",
      "app/(tabs)/__tests__/_layout.test.tsx",
      "src/ui/__tests__/TodayScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-navigation-accessibility"]),
    native_backstops: Object.freeze(["N2", "N4"]),
  }),
  Object.freeze({
    id: "C9",
    owner: "06-05 reorder",
    automated_checks: Object.freeze(["src/ui/__tests__/OwnedPlanEditor.test.tsx"]),
    flows: Object.freeze(["phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N3", "N4"]),
  }),
  Object.freeze({
    id: "C10",
    owner: "06-04 CalendarField",
    automated_checks: Object.freeze(["src/ui/components/CalendarField.test.tsx"]),
    flows: Object.freeze(["phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N2", "N4"]),
  }),
  Object.freeze({
    id: "C11",
    owner: "06-06 Library",
    automated_checks: Object.freeze(["src/ui/__tests__/LibraryScreen.test.tsx"]),
    flows: Object.freeze(["phase6-progress-library"]),
    native_backstops: Object.freeze(["N1", "N4"]),
  }),
]);

export const PHASE6_NATIVE_BACKSTOPS = Object.freeze([
  Object.freeze({
    id: "N1",
    status: "automated_required",
    description: "Emulator keyboard/D-pad Search traversal in Library, Progress, and picker.",
    flow_ids: Object.freeze(["phase6-progress-library", "phase6-navigation-accessibility"]),
  }),
  Object.freeze({
    id: "N2",
    status: "automated_required",
    description: "Emulator Calendar/CalendarField swipe-button-arrow-focus parity at 200% text.",
    flow_ids: Object.freeze(["phase6-calendar-date-reorder", "phase6-navigation-accessibility"]),
  }),
  Object.freeze({
    id: "N3",
    status: "automated_required",
    description: "Emulator continuous reorder displacement and reduced-motion fallback.",
    flow_ids: Object.freeze(["phase6-calendar-date-reorder"]),
  }),
  Object.freeze({
    id: "N4",
    status: "pending_human",
    description: "Samsung exact-byte touch, OLED, 200%-text, TalkBack, filters, Favorite, navigation, and root-route observation.",
    flow_ids: Object.freeze([]),
  }),
]);

function fail(message) {
  throw new Error(`Phase 6 Maestro: ${message}`);
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    !relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative)
  );
}

function safePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(`${label} is required.`);
  }
  return path.resolve(value);
}

function safeRelativeFile(value, label) {
  if (typeof value !== "string"
    || !SAFE_RELATIVE_FILE.test(value)
    || value.startsWith("/")
    || value.includes("\\")
    || value.split("/").some((part) => part === "." || part === ".." || part.length === 0)) {
    fail(`${label} is malformed.`);
  }
  return value;
}

function parsePassedJunit(bytes, flowId) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!/<testsuites?\b/u.test(text)
    || !/<testcase\b/u.test(text)
    || /<(?:failure|error|skipped)\b/u.test(text)) {
    fail(`Maestro did not produce a passing JUnit report: ${flowId}`);
  }
  return Object.freeze({
    tests: [...text.matchAll(/<testcase\b/gu)].length,
    failures: 0,
    errors: 0,
    skipped: 0,
  });
}

function containsForbiddenEvidenceKey(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenEvidenceKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_EVIDENCE_KEYS.has(key) || containsForbiddenEvidenceKey(nested));
}

function candidateApk(manifest) {
  const apk = manifest?.artifacts?.find(({ kind }) => kind === "apk");
  if (apk?.kind !== "apk" || !SHA256_PATTERN.test(apk.sha256 ?? "")) {
    fail("production APK identity is invalid.");
  }
  return apk;
}

function requireEvidencePathInsideBundle(bundleDirectory, candidate, label) {
  if (!isInside(bundleDirectory, candidate)) {
    fail(`${label} must stay inside the retained candidate bundle.`);
  }
  return candidate;
}

export function parsePhase6MaestroArguments(args = process.argv.slice(2)) {
  const options = {};
  if (args.length !== REQUIRED_OPTIONS.size * 2) fail("arguments are malformed.");
  for (let index = 0; index < args.length; index += 2) {
    const field = REQUIRED_OPTIONS.get(args[index]);
    const value = args[index + 1];
    if (field === undefined
      || options[field] !== undefined
      || typeof value !== "string"
      || value.length === 0
      || value.startsWith("--")) {
      fail("arguments are malformed.");
    }
    options[field] = value;
  }
  if (!SHA256_PATTERN.test(options.expectedManifestSha256)) {
    fail("manifest SHA-256 is malformed.");
  }
  if (options.packageName !== PACKAGE) {
    fail("only the production package identity is allowed.");
  }
  if (!SERIAL.test(options.serial)) fail("serial identity is malformed.");
  return options;
}

export function loadPhase6Candidate({
  bundleDirectory,
  expectedManifestSha256,
  packageName,
}) {
  if (packageName !== PACKAGE) fail("candidate package identity is not production.");
  const candidate = loadPhase5Candidate({
    bundleDirectory,
    expectedManifestSha256,
  });
  if (candidate.manifest.source.package !== PACKAGE
    || candidate.manifest.build.profile !== "production"
    || candidate.manifest_sha256 !== expectedManifestSha256) {
    fail("candidate identity is not the exact production replacement.");
  }
  const apk = candidateApk(candidate.manifest);
  const apkPath = requireEvidencePathInsideBundle(
    path.resolve(bundleDirectory),
    path.resolve(bundleDirectory, apk.file),
    "candidate APK",
  );
  if (!existsSync(apkPath) || sha256File(apkPath) !== apk.sha256) {
    fail("candidate APK bytes do not match the immutable manifest.");
  }
  return Object.freeze({ ...candidate, apk, apkPath });
}

export function resolveAdb(environment = process.env) {
  for (const directory of String(environment.PATH ?? "").split(path.delimiter)) {
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

function installedDevice(adbPath, serial, candidate) {
  const packageOutput = adb(adbPath, serial, "shell", "pm", "path", PACKAGE);
  const packagePath = packageOutput.split(/\r?\n/u)
    .find((line) => /^package:\/[^\r\n]+\.apk$/u.test(line))?.slice(8);
  if (!packagePath) fail("installed production package is missing or malformed.");

  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase6-installed-"));
  const temporaryApk = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync(adbPath, ["-s", serial, "pull", packagePath, temporaryApk], {
      stdio: "ignore",
    });
    const device = {
      role: "automated-emulator",
      model: adb(adbPath, serial, "shell", "getprop", "ro.product.model"),
      api: Number(adb(adbPath, serial, "shell", "getprop", "ro.build.version.sdk")),
      abi: adb(adbPath, serial, "shell", "getprop", "ro.product.cpu.abi"),
      serial_sha256: createHash("sha256").update(serial).digest("hex"),
      installed_package: PACKAGE,
      installed_version_code: Number(
        adb(adbPath, serial, "shell", "dumpsys", "package", PACKAGE)
          .match(/versionCode=(\d+)/u)?.[1],
      ),
      installed_apk_sha256: sha256File(temporaryApk),
    };
    validatePhase5DeviceIdentity(device, candidate.manifest);
    return Object.freeze(device);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function screenshotFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...screenshotFiles(absolute));
    } else if (entry.isFile() && /\.png$/iu.test(entry.name) && statSync(absolute).size > 0) {
      files.push(absolute);
    }
  }
  return files;
}

function screenshotEvidence(reportRoot) {
  const screenshots = screenshotFiles(reportRoot)
    .map((file) => ({
      file: safeRelativeFile(path.relative(reportRoot, file), "screenshot file"),
      sha256: sha256File(file),
    }))
    .sort((left, right) => left.file.localeCompare(right.file));
  if (screenshots.length === 0) fail("required screenshots are missing.");
  return Object.freeze(screenshots);
}

export function createPhase6Evidence({
  candidate,
  device,
  rawReports,
  screenshots,
  fontScaleRestored,
}) {
  const flows = PHASE6_MAESTRO_FLOW_CONTRACTS.map((contract) => {
    const rawReport = rawReports?.[contract.id];
    const flowScreenshots = screenshots?.[contract.id];
    const parsed = parsePassedJunit(rawReport, contract.id);
    if (!Array.isArray(flowScreenshots) || flowScreenshots.length === 0) {
      fail(`required screenshots are missing for ${contract.id}.`);
    }
    return Object.freeze({
      id: contract.id,
      flow: contract.flow,
      considerations: contract.considerations,
      native_backstops: contract.native_backstops,
      raw_report_file: `${contract.id}/report.xml`,
      raw_report_sha256: createHash("sha256").update(rawReport).digest("hex"),
      screenshots: flowScreenshots.map((screenshot) => Object.freeze({
        file: safeRelativeFile(screenshot.file, "screenshot file"),
        sha256: screenshot.sha256,
      })),
      ...parsed,
    });
  });
  const backstops = PHASE6_NATIVE_BACKSTOPS.map((backstop) => Object.freeze({
    id: backstop.id,
    status: backstop.status === "pending_human" ? "pending_human" : "passed",
    flow_ids: backstop.flow_ids,
  }));
  return Object.freeze({
    schema_version: 1,
    suite: "phase6",
    status: "passed",
    mode: "automated-only",
    approval_status: "evidence_pending",
    attended_scope: "N4_pending_human",
    producer: "phase6-maestro/v1",
    candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256),
    device,
    considerations: PHASE6_CONSIDERATION_CONTRACTS,
    flows,
    native_backstops: backstops,
    font_scale_restored: fontScaleRestored,
  });
}

export function validatePhase6Evidence(evidence, candidate, rawReports) {
  const expectedCandidate = phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256);
  if (evidence?.schema_version !== 1
    || evidence?.suite !== "phase6"
    || evidence?.status !== "passed"
    || evidence?.mode !== "automated-only"
    || evidence?.approval_status !== "evidence_pending"
    || evidence?.attended_scope !== "N4_pending_human"
    || evidence?.producer !== "phase6-maestro/v1"
    || !exactJson(evidence?.candidate, expectedCandidate)
    || !exactJson(evidence?.considerations, PHASE6_CONSIDERATION_CONTRACTS)
    || evidence?.font_scale_restored !== true
    || containsForbiddenEvidenceKey(evidence)) {
    fail("automated evidence identity, release boundary, or privacy boundary is invalid.");
  }
  validatePhase5DeviceIdentity(evidence.device, candidate.manifest);
  if (!Array.isArray(evidence.flows)
    || evidence.flows.length !== PHASE6_MAESTRO_FLOW_CONTRACTS.length) {
    fail("automated evidence flow ledger is incomplete.");
  }
  for (const [index, contract] of PHASE6_MAESTRO_FLOW_CONTRACTS.entries()) {
    const flow = evidence.flows[index];
    const rawReport = rawReports?.[contract.id];
    if (flow?.id !== contract.id
      || flow?.flow !== contract.flow
      || !exactJson(flow?.considerations, contract.considerations)
      || !exactJson(flow?.native_backstops, contract.native_backstops)
      || flow?.tests < 1
      || flow?.failures !== 0
      || flow?.errors !== 0
      || flow?.skipped !== 0
      || flow?.raw_report_file !== `${contract.id}/report.xml`
      || flow?.raw_report_sha256 !== createHash("sha256").update(rawReport).digest("hex")
      || !Array.isArray(flow?.screenshots)
      || flow.screenshots.length < 1) {
      fail(`automated evidence flow is invalid: ${contract.id}`);
    }
    for (const screenshot of flow.screenshots) {
      if (!SHA256_PATTERN.test(screenshot?.sha256 ?? "")) {
        fail(`screenshot hash is invalid: ${contract.id}`);
      }
      safeRelativeFile(screenshot.file, "screenshot file");
    }
  }
  const expectedBackstops = PHASE6_NATIVE_BACKSTOPS.map((backstop) => ({
    id: backstop.id,
    status: backstop.status === "pending_human" ? "pending_human" : "passed",
    flow_ids: backstop.flow_ids,
  }));
  if (!exactJson(evidence.native_backstops, expectedBackstops)) {
    fail("native backstop ledger is incomplete.");
  }
}

export function executePhase6Maestro(args = process.argv.slice(2)) {
  const options = parsePhase6MaestroArguments(args);
  const candidate = loadPhase6Candidate(options);
  const bundleDirectory = path.resolve(options.bundleDirectory);
  const output = requireEvidencePathInsideBundle(
    bundleDirectory,
    safePath(options.output, "output"),
    "output",
  );
  const reportDirectory = requireEvidencePathInsideBundle(
    bundleDirectory,
    safePath(options.reportDirectory, "report directory"),
    "report directory",
  );
  const adbPath = resolveAdb();
  mkdirSync(path.dirname(output), { recursive: true });
  mkdirSync(reportDirectory, { recursive: true });
  const priorFontScale = adb(adbPath, options.serial, "shell", "settings", "get", "system", "font_scale");
  let evidence;
  try {
    execFileSync(adbPath, ["-s", options.serial, "install", "-r", candidate.apkPath], {
      stdio: "inherit",
    });
    const device = installedDevice(adbPath, options.serial, candidate);
    adb(adbPath, options.serial, "shell", "settings", "put", "system", "font_scale", "2.0");
    const rawReports = {};
    const screenshots = {};
    for (const contract of PHASE6_MAESTRO_FLOW_CONTRACTS) {
      const flowPath = path.resolve(contract.flow);
      if (!existsSync(flowPath)) fail(`required Maestro flow is missing: ${contract.id}`);
      const flowReportDirectory = path.join(reportDirectory, contract.id);
      const reportPath = path.join(flowReportDirectory, "report.xml");
      mkdirSync(flowReportDirectory, { recursive: true });
      execFileSync("maestro", [
        "test",
        "--device", options.serial,
        "--format", "junit",
        "--output", reportPath,
        "--test-output-dir", flowReportDirectory,
        flowPath,
      ], { stdio: "inherit" });
      if (!existsSync(reportPath)) fail(`Maestro report is missing: ${contract.id}`);
      rawReports[contract.id] = readFileSync(reportPath);
      screenshots[contract.id] = screenshotEvidence(flowReportDirectory);
    }
    evidence = createPhase6Evidence({
      candidate,
      device,
      rawReports,
      screenshots,
      fontScaleRestored: false,
    });
  } finally {
    adb(adbPath, options.serial, "shell", "settings", "put", "system", "font_scale", priorFontScale);
    const restored = adb(adbPath, options.serial, "shell", "settings", "get", "system", "font_scale") === priorFontScale;
    if (evidence !== undefined) {
      const finalized = { ...evidence, font_scale_restored: restored };
      const rawReports = Object.fromEntries(PHASE6_MAESTRO_FLOW_CONTRACTS.map((contract) => [
        contract.id,
        readFileSync(path.join(reportDirectory, contract.id, "report.xml")),
      ]));
      validatePhase6Evidence(finalized, candidate, rawReports);
      writeFileSync(output, `${JSON.stringify(finalized, null, 2)}\n`);
      evidence = finalized;
    }
  }
  return evidence;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const evidence = executePhase6Maestro();
    process.stdout.write(`${JSON.stringify({ ok: true, flows: evidence.flows.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
