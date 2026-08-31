#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  loadPhase6Candidate,
  resolveAdb,
} from "./run-phase6-maestro.mjs";
import {
  phase5CandidateIdentity,
  SHA256_PATTERN,
  sha256File,
} from "./phase5-candidate-evidence.mjs";

const SAMSUNG_MODEL = "SM-S916B";
const PACKAGE = "com.fchoo.gymtracker";
const SERIAL = /^[A-Za-z0-9._:-]+$/u;
const MODE_OPTIONS = Object.freeze({
  prepare: Object.freeze([
    ["--bundle-dir", "bundleDirectory"],
    ["--manifest-sha256", "expectedManifestSha256"],
    ["--serial", "serial"],
    ["--output", "output"],
  ]),
  record: Object.freeze([
    ["--bundle-dir", "bundleDirectory"],
    ["--manifest-sha256", "expectedManifestSha256"],
    ["--checklist", "checklist"],
    ["--observations", "observations"],
    ["--evidence-dir", "evidenceDirectory"],
    ["--output", "output"],
  ]),
  verify: Object.freeze([
    ["--bundle-dir", "bundleDirectory"],
    ["--manifest-sha256", "expectedManifestSha256"],
    ["--checklist", "checklist"],
    ["--observations", "observations"],
    ["--evidence-dir", "evidenceDirectory"],
    ["--record", "record"],
  ]),
});
const FORBIDDEN_KEYS = new Set([
  "approval",
  "owner_approval",
  "promotion",
  "publication",
  "raw_path",
  "release_authorization",
  "serial",
  "terminal_seal",
]);
const EVIDENCE_LIMITS = Object.freeze([
  "Record pass or fail plus attachment SHA-256 only.",
  "Do not record a device serial, database rows, identifiers, JSON, paths, backup contents, or release authorization.",
  "Do not approve, promote, publish, tag, or run Terminal Seal from this checklist.",
]);

function fail(message) {
  throw new Error(`Phase 6 attended checklist: ${message}`);
}

function adb(adbPath, serial, ...args) {
  return execFileSync(adbPath, ["-s", serial, ...args], {
    encoding: "utf8",
  }).trim();
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, keys, label) {
  if (value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !exactJson(Object.keys(value), keys)) {
    fail(`${label} contains missing, reordered, or extra fields.`);
  }
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_KEYS.has(key) || hasForbiddenKey(nested));
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function serializePhase6AttendedChecklist(checklist) {
  return Buffer.from(canonical(checklist));
}

export function parsePhase6AttendedChecklistArguments(args = process.argv.slice(2)) {
  const mode = args[0];
  const required = MODE_OPTIONS[mode];
  if (required === undefined || args.length !== 1 + required.length * 2) {
    fail("arguments are malformed.");
  }
  const requiredOptions = new Map(required);
  const options = { mode };
  for (let index = 1; index < args.length; index += 2) {
    const field = requiredOptions.get(args[index]);
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
  if (mode === "prepare" && !SERIAL.test(options.serial)) {
    fail("serial identity is malformed.");
  }
  return options;
}

export function readPhase6SamsungDevice({
  adbPath,
  serial,
  candidate,
}) {
  const model = adb(adbPath, serial, "shell", "getprop", "ro.product.model");
  if (model !== SAMSUNG_MODEL) fail("connected device model is not SM-S916B.");
  const packagePath = adb(adbPath, serial, "shell", "pm", "path", PACKAGE)
    .split(/\r?\n/u)
    .find((line) => /^package:\/[^\r\n]+\.apk$/u.test(line))?.slice(8);
  if (packagePath === undefined) fail("installed production package is missing.");

  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase6-samsung-"));
  const temporaryApk = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync(adbPath, ["-s", serial, "pull", packagePath, temporaryApk], {
      stdio: "ignore",
    });
    const installedApkSha256 = sha256File(temporaryApk);
    const apk = candidate.manifest.artifacts.find(({ kind }) => kind === "apk");
    if (installedApkSha256 !== apk?.sha256) {
      fail("installed Samsung APK bytes do not match the replacement candidate.");
    }
    return Object.freeze({
      role: "samsung-physical",
      model: SAMSUNG_MODEL,
      serial_sha256: createHash("sha256").update(serial).digest("hex"),
      installed_package: PACKAGE,
      installed_apk_sha256: installedApkSha256,
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const N4_ROWS = Object.freeze([
  Object.freeze({
    id: "N4-01",
    scope: "Touch and motion",
    instructions: "Repeat Calendar/date swipe and continuous long-press reorder. Confirm touch ergonomics, visible displacement, stable scrolling, 48dp fallback controls, and reduced-motion acknowledgement.",
  }),
  Object.freeze({
    id: "N4-02",
    scope: "OLED and non-colour state",
    instructions: "In System, Light, and Dark/OLED, confirm filter selection and Favorite filled/outlined state remain distinguishable without colour alone.",
  }),
  Object.freeze({
    id: "N4-03",
    scope: "200 percent text and rotation",
    instructions: "At Android 200% text and rotation, confirm root labels, Search, chips, rows, dialogs, History and data, and data routes remain complete and reachable.",
  }),
  Object.freeze({
    id: "N4-04",
    scope: "TalkBack and keyboard/D-pad",
    instructions: "With TalkBack plus keyboard/D-pad, confirm names, roles, states, modal containment, order, alternatives, and restored focus across changed surfaces.",
  }),
]);

export function buildPhase6AttendedChecklist({
  candidate,
  device,
  generatedAt,
}) {
  return Object.freeze({
    schema_version: 1,
    suite: "phase6-attended",
    status: "pending_human",
    mode: "observation-only",
    approval_status: "evidence_pending",
    candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256),
    device,
    generated_at: generatedAt,
    rows: N4_ROWS.map((row) => Object.freeze({
      ...row,
      status: "pending_human",
      attachment_sha256: null,
    })),
    evidence_limits: EVIDENCE_LIMITS,
  });
}

function validatePhase6SamsungDevice(device, candidate) {
  exactKeys(device, [
    "role",
    "model",
    "serial_sha256",
    "installed_package",
    "installed_apk_sha256",
  ], "Samsung device");
  const apks = candidate.manifest.artifacts.filter(({ kind }) => kind === "apk");
  if (device.role !== "samsung-physical"
    || device.model !== SAMSUNG_MODEL
    || device.installed_package !== PACKAGE
    || !SHA256_PATTERN.test(device.serial_sha256 ?? "")
    || !SHA256_PATTERN.test(device.installed_apk_sha256 ?? "")
    || apks.length !== 1
    || device.installed_apk_sha256 !== apks[0].sha256) {
    fail("Samsung identity or installed candidate APK is invalid.");
  }
}

export function validatePhase6AttendedChecklist(checklist, {
  candidate,
  device,
} = {}) {
  exactKeys(checklist, [
    "schema_version",
    "suite",
    "status",
    "mode",
    "approval_status",
    "candidate",
    "device",
    "generated_at",
    "rows",
    "evidence_limits",
  ], "checklist");
  if (checklist.schema_version !== 1
    || checklist?.suite !== "phase6-attended"
    || checklist?.status !== "pending_human"
    || checklist?.mode !== "observation-only"
    || checklist?.approval_status !== "evidence_pending"
    || !Number.isFinite(Date.parse(checklist?.generated_at ?? ""))
    || !exactJson(checklist?.candidate, phase5CandidateIdentity(
      candidate.manifest, candidate.manifest_sha256,
    ))
    || !exactJson(checklist?.device, device)
    || !Array.isArray(checklist.rows)
    || checklist.rows.length !== N4_ROWS.length
    || !exactJson(checklist.evidence_limits, EVIDENCE_LIMITS)
    || hasForbiddenKey(checklist)) {
    fail("checklist identity, release boundary, or privacy boundary is invalid.");
  }
  for (const [index, expected] of N4_ROWS.entries()) {
    const actual = checklist.rows[index];
    exactKeys(actual, [
      "id", "scope", "instructions", "status", "attachment_sha256",
    ], `checklist row ${index}`);
    if (actual?.id !== expected.id
      || actual?.scope !== expected.scope
      || actual?.instructions !== expected.instructions
      || actual?.status !== "pending_human"
      || actual?.attachment_sha256 !== null) {
      fail(`checklist row is invalid: ${expected.id}`);
    }
  }
  validatePhase6SamsungDevice(device, candidate);
  return checklist;
}

function validatedBundleDirectory(bundleDirectory) {
  const requested = path.resolve(bundleDirectory);
  const details = lstatSync(requested, { throwIfNoEntry: false });
  if (!details?.isDirectory()
    || details.isSymbolicLink()
    || realpathSync(requested) !== requested) {
    fail("retained candidate bundle is missing or unsafe.");
  }
  return requested;
}

function inputFileInsideBundle(bundleDirectory, filePath, label) {
  const bundle = validatedBundleDirectory(bundleDirectory);
  const target = path.resolve(filePath);
  const details = lstatSync(target, { throwIfNoEntry: false });
  if (!target.startsWith(`${bundle}${path.sep}`)
    || !details?.isFile()
    || details.isSymbolicLink()
    || realpathSync(target) !== target) {
    fail(`${label} is missing or unsafe.`);
  }
  return target;
}

function evidenceDirectoryInsideBundle(bundleDirectory, evidenceDirectory) {
  const bundle = validatedBundleDirectory(bundleDirectory);
  const directory = path.resolve(evidenceDirectory);
  const details = lstatSync(directory, { throwIfNoEntry: false });
  if (!directory.startsWith(`${bundle}${path.sep}`)
    || !details?.isDirectory()
    || details.isSymbolicLink()
    || realpathSync(directory) !== directory) {
    fail("attended evidence directory is missing or unsafe.");
  }
  return directory;
}

function validatePhase6Attachments(rows, evidenceDirectory) {
  const evidenceRoot = realpathSync(path.resolve(evidenceDirectory));
  const usedDigests = new Set();
  for (const row of rows) {
    const target = path.join(evidenceRoot, `${row.id}.png`);
    const details = lstatSync(target, { throwIfNoEntry: false });
    if (!details?.isFile()
      || details.isSymbolicLink()
      || realpathSync(target) !== target
      || details.size < 9
      || details.size > 64 * 1024 * 1024) {
      fail(`attended attachment is missing or unsafe: ${row.id}`);
    }
    const bytes = readFileSync(target);
    if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
      fail(`attended attachment is not a PNG: ${row.id}`);
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== row.attachment_sha256 || usedDigests.has(digest)) {
      fail(`attended attachment hash is missing, changed, or reused: ${row.id}`);
    }
    usedDigests.add(digest);
  }
}

export function validatePhase6AttendedObservations(observations, {
  candidate,
  device,
  evidenceDirectory,
} = {}) {
  exactKeys(observations, [
    "schema_version",
    "suite",
    "candidate_id",
    "manifest_sha256",
    "device",
    "rows",
  ], "observations");
  if (observations.schema_version !== 1
    || observations.suite !== "phase6-attended-observations"
    || observations.candidate_id !== candidate.manifest.candidate_id
    || observations.manifest_sha256 !== candidate.manifest_sha256
    || !exactJson(observations.device, device)
    || !Array.isArray(observations.rows)
    || observations.rows.length !== N4_ROWS.length
    || hasForbiddenKey(observations)) {
    fail("observation identity, privacy boundary, or row set is invalid.");
  }
  validatePhase6SamsungDevice(device, candidate);
  for (const [index, expected] of N4_ROWS.entries()) {
    const actual = observations.rows[index];
    exactKeys(actual, ["id", "status", "attachment_sha256"], `observation row ${index}`);
    if (actual.id !== expected.id
      || !["passed", "failed"].includes(actual.status)
      || !SHA256_PATTERN.test(actual.attachment_sha256 ?? "")) {
      fail(`observation row is invalid: ${expected.id}`);
    }
  }
  validatePhase6Attachments(observations.rows, evidenceDirectory);
  return observations;
}

export function createPhase6AttendedRecord({
  candidate,
  checklist,
  checklistBytes,
  observations,
  observationsBytes,
  evidenceDirectory,
  recordedAt = new Date().toISOString(),
}) {
  if (serializePhase6AttendedChecklist(checklist).equals(checklistBytes) === false
    || serializePhase6AttendedChecklist(observations).equals(observationsBytes) === false
    || !Number.isFinite(Date.parse(recordedAt))) {
    fail("checklist, observations, or recorded time is noncanonical.");
  }
  const device = checklist.device;
  validatePhase6AttendedChecklist(checklist, { candidate, device });
  validatePhase6AttendedObservations(observations, {
    candidate, device, evidenceDirectory,
  });
  const rows = N4_ROWS.map((definition, index) => Object.freeze({
    ...definition,
    status: observations.rows[index].status,
    attachment_sha256: observations.rows[index].attachment_sha256,
  }));
  const record = Object.freeze({
    schema_version: 1,
    suite: "phase6-attended",
    status: rows.every(({ status }) => status === "passed") ? "passed" : "failed",
    mode: "observation-only",
    approval_status: "evidence_pending",
    candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256),
    device,
    checklist_sha256: createHash("sha256").update(checklistBytes).digest("hex"),
    observations_sha256: createHash("sha256").update(observationsBytes).digest("hex"),
    recorded_at: recordedAt,
    rows,
    evidence_limits: checklist.evidence_limits,
  });
  if (hasForbiddenKey(record)) {
    fail("record violates the release or privacy boundary.");
  }
  return record;
}

function parseCanonicalBytes(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} is not valid JSON.`);
  }
  if (serializePhase6AttendedChecklist(value).equals(bytes) === false) {
    fail(`${label} is not canonical JSON.`);
  }
  return value;
}

export function validatePhase6AttendedRecordBytes({
  candidate,
  checklistBytes,
  observationsBytes,
  recordBytes,
  evidenceDirectory,
}) {
  const checklist = parseCanonicalBytes(checklistBytes, "checklist");
  const observations = parseCanonicalBytes(observationsBytes, "observations");
  const record = parseCanonicalBytes(recordBytes, "record");
  exactKeys(record, [
    "schema_version",
    "suite",
    "status",
    "mode",
    "approval_status",
    "candidate",
    "device",
    "checklist_sha256",
    "observations_sha256",
    "recorded_at",
    "rows",
    "evidence_limits",
  ], "record");
  const expected = createPhase6AttendedRecord({
    candidate,
    checklist,
    checklistBytes,
    observations,
    observationsBytes,
    evidenceDirectory,
    recordedAt: record.recorded_at,
  });
  if (!exactJson(record, expected) || hasForbiddenKey(record)) {
    fail("record identity, rows, release boundary, or privacy boundary is invalid.");
  }
  return record;
}

function outputInsideBundle(bundleDirectory, outputPath) {
  const bundle = validatedBundleDirectory(bundleDirectory);
  const output = path.resolve(outputPath);
  const outputParent = path.dirname(output);
  const outputDetails = lstatSync(output, { throwIfNoEntry: false });
  const parentDetails = lstatSync(outputParent, { throwIfNoEntry: false });
  if (!output.startsWith(`${bundle}${path.sep}`)
    || outputDetails !== undefined
    || !parentDetails?.isDirectory()
    || parentDetails.isSymbolicLink()
    || realpathSync(outputParent) !== outputParent
    || !outputParent.startsWith(`${bundle}${path.sep}`)) {
    fail("output must stay inside the retained candidate bundle.");
  }
  return output;
}

export function executePhase6AttendedChecklist(args = process.argv.slice(2)) {
  const options = parsePhase6AttendedChecklistArguments(args);
  const candidate = loadPhase6Candidate({
    bundleDirectory: options.bundleDirectory,
    expectedManifestSha256: options.expectedManifestSha256,
    packageName: PACKAGE,
  });
  if (options.mode === "prepare") {
    const adbPath = resolveAdb();
    const device = readPhase6SamsungDevice({
      adbPath,
      serial: options.serial,
      candidate,
    });
    const checklist = buildPhase6AttendedChecklist({
      candidate,
      device,
      generatedAt: new Date().toISOString(),
    });
    validatePhase6AttendedChecklist(checklist, { candidate, device });
    const output = outputInsideBundle(options.bundleDirectory, options.output);
    writeFileSync(output, serializePhase6AttendedChecklist(checklist), { flag: "wx" });
    return Object.freeze({
      checklist,
      checklist_sha256: createHash("sha256").update(readFileSync(output)).digest("hex"),
    });
  }

  const checklistBytes = readFileSync(inputFileInsideBundle(
    options.bundleDirectory, options.checklist, "checklist",
  ));
  const observationsBytes = readFileSync(inputFileInsideBundle(
    options.bundleDirectory, options.observations, "observations",
  ));
  const evidenceDirectory = evidenceDirectoryInsideBundle(
    options.bundleDirectory, options.evidenceDirectory,
  );
  if (options.mode === "record") {
    const record = createPhase6AttendedRecord({
      candidate,
      checklist: parseCanonicalBytes(checklistBytes, "checklist"),
      checklistBytes,
      observations: parseCanonicalBytes(observationsBytes, "observations"),
      observationsBytes,
      evidenceDirectory,
    });
    const output = outputInsideBundle(options.bundleDirectory, options.output);
    writeFileSync(output, serializePhase6AttendedChecklist(record), { flag: "wx" });
    return Object.freeze({
      record,
      record_sha256: createHash("sha256").update(readFileSync(output)).digest("hex"),
    });
  }

  const recordBytes = readFileSync(inputFileInsideBundle(
    options.bundleDirectory, options.record, "record",
  ));
  return Object.freeze({
    record: validatePhase6AttendedRecordBytes({
      candidate,
      checklistBytes,
      observationsBytes,
      recordBytes,
      evidenceDirectory,
    }),
    record_sha256: createHash("sha256").update(recordBytes).digest("hex"),
  });
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = executePhase6AttendedChecklist();
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: process.argv[2],
      status: result.record?.status ?? result.checklist?.status,
      sha256: result.record_sha256 ?? result.checklist_sha256,
      rows: result.record?.rows.length ?? result.checklist?.rows.length,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
