#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
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
  SHA256_PATTERN,
  phase5CandidateIdentity,
  sha256File,
} from "./phase5-candidate-evidence.mjs";
import {
  loadPhase7Candidate,
} from "./run-phase7-maestro.mjs";

const SAMSUNG_MODEL = "SM-S916B";
const PACKAGE = "com.fchoo.gymtracker";
const SERIAL = /^[A-Za-z0-9._:-]+$/u;
const MODE_OPTIONS = Object.freeze({
  prepare: Object.freeze([["--bundle-dir", "bundleDirectory"], ["--manifest-sha256", "expectedManifestSha256"], ["--serial", "serial"], ["--output", "output"]]),
  record: Object.freeze([["--bundle-dir", "bundleDirectory"], ["--manifest-sha256", "expectedManifestSha256"], ["--checklist", "checklist"], ["--observations", "observations"], ["--evidence-dir", "evidenceDirectory"], ["--output", "output"]]),
  verify: Object.freeze([["--bundle-dir", "bundleDirectory"], ["--manifest-sha256", "expectedManifestSha256"], ["--checklist", "checklist"], ["--observations", "observations"], ["--evidence-dir", "evidenceDirectory"], ["--record", "record"]]),
});
const FORBIDDEN_KEYS = new Set([
  "approval", "owner_approval", "promotion", "publication", "public_release",
  "release_authorization", "terminal_seal", "tag", "serial", "raw_path",
  "private_path", "raw_rows", "private_rows",
]);
const EVIDENCE_LIMITS = Object.freeze([
  "Record passed or failed observations plus one immutable PNG SHA-256 per N4 row.",
  "Do not record a serial, database rows, identifiers, JSON, paths, backup contents, or release authority.",
  "This checklist cannot approve, promote, publish, tag, or run Terminal Seal.",
]);

export const PHASE7_N4_ROWS = Object.freeze([
  Object.freeze({ id: "N4-01", scope: "Settings and navigation", instructions: "On the exact candidate, use touch plus keyboard/D-pad at 200% text to confirm selected navigation semantics, the gear-only Settings route, Appearance first, and reachable History and data plus Data and recovery." }),
  Object.freeze({ id: "N4-02", scope: "Workout removal and overflow", instructions: "Confirm the compact one-band SetRow reflows without clipping, Remove never changes completed rows, the confirmation is clear, and retained More actions have natural sheet height." }),
  Object.freeze({ id: "N4-03", scope: "Countdown sound", instructions: "With Rest sound enabled, observe one short cue at 3/2/1 and one long zero cue; with sound Off, paused, backgrounded, and failed playback, confirm the timer remains authoritative and the bounded fallback is clear." }),
  Object.freeze({ id: "N4-04", scope: "Reorder accessibility", instructions: "Use held drag and the labelled accessible/keyboard alternatives for plans, Weekday, Rotation, and day selection. Confirm visible displacement, no visible ordinal or Up/Down controls, and retained explicit Save." }),
  Object.freeze({ id: "N4-05", scope: "Adaptive and themed icon", instructions: "Inspect standard, adaptive, monochrome/themed launcher, and splash treatment. Confirm the G ascending-bars mark remains recognisable, centred, and safe under the Samsung mask." }),
]);

function fail(message) {
  throw new Error(`Phase 7 attended checklist: ${message}`);
}

function exactJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function canonical(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !exactJson(Object.keys(value), keys)) fail(`${label} contains missing, reordered, or extra fields.`);
}
function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => FORBIDDEN_KEYS.has(key) || hasForbiddenKey(nested));
}
function adb(adbPath, serial, ...args) { return execFileSync(adbPath, ["-s", serial, ...args], { encoding: "utf8" }).trim(); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function serializePhase7AttendedChecklist(value) { return Buffer.from(canonical(value)); }

export function parsePhase7AttendedChecklistArguments(args = process.argv.slice(2)) {
  const mode = args[0]; const required = MODE_OPTIONS[mode];
  if (required === undefined || args.length !== 1 + required.length * 2) fail("arguments are malformed.");
  const options = { mode }; const requiredOptions = new Map(required);
  for (let index = 1; index < args.length; index += 2) {
    const field = requiredOptions.get(args[index]); const value = args[index + 1];
    if (field === undefined || options[field] !== undefined || typeof value !== "string" || value.length === 0 || value.startsWith("--")) fail("arguments are malformed.");
    options[field] = value;
  }
  if (!SHA256_PATTERN.test(options.expectedManifestSha256) || (mode === "prepare" && !SERIAL.test(options.serial))) fail("manifest or serial identity is malformed.");
  return Object.freeze(options);
}

export function readPhase7SamsungDevice({ adbPath, serial, candidate }) {
  const model = adb(adbPath, serial, "shell", "getprop", "ro.product.model");
  if (model !== SAMSUNG_MODEL) fail("connected device model is not SM-S916B.");
  const packagePath = adb(adbPath, serial, "shell", "pm", "path", PACKAGE).split(/\r?\n/u).find((line) => /^package:\/[^\r\n]+\.apk$/u.test(line))?.slice(8);
  if (packagePath === undefined) fail("installed production package is missing.");
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase7-samsung-"));
  const temporaryApk = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync(adbPath, ["-s", serial, "pull", packagePath, temporaryApk], { stdio: "ignore" });
    const installedApkSha256 = sha256File(temporaryApk);
    const apk = candidate.manifest.artifacts.find(({ kind }) => kind === "apk");
    if (installedApkSha256 !== apk?.sha256) fail("installed Samsung APK bytes do not match the replacement candidate.");
    return Object.freeze({ role: "samsung-physical", model: SAMSUNG_MODEL, serial_sha256: digest(serial), installed_package: PACKAGE, installed_apk_sha256: installedApkSha256 });
  } finally { rmSync(temporaryDirectory, { recursive: true, force: true }); }
}

function validatePhase7SamsungDevice(device, candidate) {
  exactKeys(device, ["role", "model", "serial_sha256", "installed_package", "installed_apk_sha256"], "Samsung device");
  const apks = candidate.manifest.artifacts.filter(({ kind }) => kind === "apk");
  if (device.role !== "samsung-physical" || device.model !== SAMSUNG_MODEL || device.installed_package !== PACKAGE || !SHA256_PATTERN.test(device.serial_sha256 ?? "") || !SHA256_PATTERN.test(device.installed_apk_sha256 ?? "") || apks.length !== 1 || device.installed_apk_sha256 !== apks[0].sha256) fail("Samsung identity or installed candidate APK is invalid.");
}

export function buildPhase7AttendedChecklist({ candidate, device, generatedAt }) {
  return Object.freeze({ schema_version: 1, suite: "phase7-attended", status: "pending_human", mode: "observation-only", approval_status: "evidence_pending", candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256), device, generated_at: generatedAt, rows: PHASE7_N4_ROWS.map((row) => Object.freeze({ ...row, status: "pending_human", attachment_sha256: null })), evidence_limits: EVIDENCE_LIMITS });
}

export function validatePhase7AttendedChecklist(checklist, { candidate, device } = {}) {
  exactKeys(checklist, ["schema_version", "suite", "status", "mode", "approval_status", "candidate", "device", "generated_at", "rows", "evidence_limits"], "checklist");
  if (checklist.schema_version !== 1 || checklist.suite !== "phase7-attended" || checklist.status !== "pending_human" || checklist.mode !== "observation-only" || checklist.approval_status !== "evidence_pending" || !Number.isFinite(Date.parse(checklist.generated_at ?? "")) || !exactJson(checklist.candidate, phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256)) || !exactJson(checklist.device, device) || !Array.isArray(checklist.rows) || checklist.rows.length !== PHASE7_N4_ROWS.length || !exactJson(checklist.evidence_limits, EVIDENCE_LIMITS) || hasForbiddenKey(checklist)) fail("checklist identity, release boundary, or privacy boundary is invalid.");
  for (const [index, expected] of PHASE7_N4_ROWS.entries()) {
    const actual = checklist.rows[index];
    exactKeys(actual, ["id", "scope", "instructions", "status", "attachment_sha256"], `checklist row ${index}`);
    if (actual.id !== expected.id || actual.scope !== expected.scope || actual.instructions !== expected.instructions || actual.status !== "pending_human" || actual.attachment_sha256 !== null) fail(`checklist row is invalid: ${expected.id}`);
  }
  validatePhase7SamsungDevice(device, candidate);
  return checklist;
}

function validatedBundleDirectory(bundleDirectory) {
  const target = path.resolve(bundleDirectory); const details = lstatSync(target, { throwIfNoEntry: false });
  if (!details?.isDirectory() || details.isSymbolicLink() || realpathSync(target) !== target) fail("retained candidate bundle is missing or unsafe.");
  return target;
}
function insideBundleFile(bundleDirectory, filePath, label) {
  const bundle = validatedBundleDirectory(bundleDirectory); const target = path.resolve(filePath); const details = lstatSync(target, { throwIfNoEntry: false });
  if (!target.startsWith(`${bundle}${path.sep}`) || !details?.isFile() || details.isSymbolicLink() || realpathSync(target) !== target) fail(`${label} is missing or unsafe.`);
  return target;
}
function insideBundleDirectory(bundleDirectory, directory, label) {
  const bundle = validatedBundleDirectory(bundleDirectory); const target = path.resolve(directory); const details = lstatSync(target, { throwIfNoEntry: false });
  if (!target.startsWith(`${bundle}${path.sep}`) || !details?.isDirectory() || details.isSymbolicLink() || realpathSync(target) !== target) fail(`${label} is missing or unsafe.`);
  return target;
}
function freshOutputInsideBundle(bundleDirectory, output) {
  const bundle = validatedBundleDirectory(bundleDirectory); const target = path.resolve(output); const parent = path.dirname(target); const details = lstatSync(target, { throwIfNoEntry: false }); const parentDetails = lstatSync(parent, { throwIfNoEntry: false });
  if (!target.startsWith(`${bundle}${path.sep}`) || details !== undefined || !parentDetails?.isDirectory() || parentDetails.isSymbolicLink() || realpathSync(parent) !== parent || !parent.startsWith(`${bundle}${path.sep}`)) fail("output must stay inside the retained candidate bundle.");
  return target;
}
function parseCanonicalBytes(bytes, label) {
  let value; try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(`${label} is not valid JSON.`); }
  if (!serializePhase7AttendedChecklist(value).equals(bytes)) fail(`${label} is not canonical JSON.`);
  return value;
}
function validateAttachments(rows, evidenceDirectory) {
  const root = realpathSync(path.resolve(evidenceDirectory)); const usedDigests = new Set();
  for (const row of rows) {
    const target = path.join(root, `${row.id}.png`); const details = lstatSync(target, { throwIfNoEntry: false });
    if (!details?.isFile() || details.isSymbolicLink() || realpathSync(target) !== target || details.size < 9 || details.size > 64 * 1024 * 1024) fail(`attended attachment is missing or unsafe: ${row.id}`);
    const bytes = readFileSync(target); const attachmentDigest = digest(bytes);
    if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) || attachmentDigest !== row.attachment_sha256 || usedDigests.has(attachmentDigest)) fail(`attended attachment hash is missing, changed, or reused: ${row.id}`);
    usedDigests.add(attachmentDigest);
  }
}

export function validatePhase7AttendedObservations(observations, { candidate, device, evidenceDirectory } = {}) {
  exactKeys(observations, ["schema_version", "suite", "candidate_id", "manifest_sha256", "device", "rows"], "observations");
  if (observations.schema_version !== 1 || observations.suite !== "phase7-attended-observations" || observations.candidate_id !== candidate.manifest.candidate_id || observations.manifest_sha256 !== candidate.manifest_sha256 || !exactJson(observations.device, device) || !Array.isArray(observations.rows) || observations.rows.length !== PHASE7_N4_ROWS.length || hasForbiddenKey(observations)) fail("observation identity, privacy boundary, or row set is invalid.");
  validatePhase7SamsungDevice(device, candidate);
  for (const [index, expected] of PHASE7_N4_ROWS.entries()) {
    const actual = observations.rows[index]; exactKeys(actual, ["id", "status", "attachment_sha256"], `observation row ${index}`);
    if (actual.id !== expected.id || !["passed", "failed"].includes(actual.status) || !SHA256_PATTERN.test(actual.attachment_sha256 ?? "")) fail(`observation row is invalid: ${expected.id}`);
  }
  validateAttachments(observations.rows, evidenceDirectory);
  return observations;
}

export function createPhase7AttendedRecord({ candidate, checklist, checklistBytes, observations, observationsBytes, evidenceDirectory, recordedAt = new Date().toISOString() }) {
  if (!serializePhase7AttendedChecklist(checklist).equals(checklistBytes) || !serializePhase7AttendedChecklist(observations).equals(observationsBytes) || !Number.isFinite(Date.parse(recordedAt))) fail("checklist, observations, or recorded time is noncanonical.");
  const device = checklist.device; validatePhase7AttendedChecklist(checklist, { candidate, device }); validatePhase7AttendedObservations(observations, { candidate, device, evidenceDirectory });
  const rows = PHASE7_N4_ROWS.map((definition, index) => Object.freeze({ ...definition, status: observations.rows[index].status, attachment_sha256: observations.rows[index].attachment_sha256 }));
  const record = Object.freeze({ schema_version: 1, suite: "phase7-attended", status: rows.every(({ status }) => status === "passed") ? "passed" : "failed", mode: "observation-only", approval_status: "evidence_pending", candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256), device, checklist_sha256: digest(checklistBytes), observations_sha256: digest(observationsBytes), recorded_at: recordedAt, rows, evidence_limits: checklist.evidence_limits });
  if (hasForbiddenKey(record)) fail("record violates the release or privacy boundary.");
  return record;
}

export function validatePhase7AttendedRecordBytes({ candidate, checklistBytes, observationsBytes, recordBytes, evidenceDirectory }) {
  const checklist = parseCanonicalBytes(checklistBytes, "checklist"); const observations = parseCanonicalBytes(observationsBytes, "observations"); const record = parseCanonicalBytes(recordBytes, "record");
  exactKeys(record, ["schema_version", "suite", "status", "mode", "approval_status", "candidate", "device", "checklist_sha256", "observations_sha256", "recorded_at", "rows", "evidence_limits"], "record");
  const expected = createPhase7AttendedRecord({ candidate, checklist, checklistBytes, observations, observationsBytes, evidenceDirectory, recordedAt: record.recorded_at });
  if (!exactJson(record, expected) || hasForbiddenKey(record)) fail("record identity, rows, release boundary, or privacy boundary is invalid.");
  return record;
}

export function executePhase7AttendedChecklist(args = process.argv.slice(2)) {
  const options = parsePhase7AttendedChecklistArguments(args);
  const candidate = loadPhase7Candidate({ bundleDirectory: options.bundleDirectory, expectedManifestSha256: options.expectedManifestSha256, packageName: PACKAGE });
  if (options.mode === "prepare") {
    const adbPath = process.env.ADB_PATH ?? "adb"; const device = readPhase7SamsungDevice({ adbPath, serial: options.serial, candidate });
    const checklist = buildPhase7AttendedChecklist({ candidate, device, generatedAt: new Date().toISOString() }); validatePhase7AttendedChecklist(checklist, { candidate, device });
    const output = freshOutputInsideBundle(options.bundleDirectory, options.output); writeFileSync(output, serializePhase7AttendedChecklist(checklist), { flag: "wx" });
    return Object.freeze({ checklist, checklist_sha256: digest(readFileSync(output)) });
  }
  const checklistBytes = readFileSync(insideBundleFile(options.bundleDirectory, options.checklist, "checklist"));
  const observationsBytes = readFileSync(insideBundleFile(options.bundleDirectory, options.observations, "observations"));
  const evidenceDirectory = insideBundleDirectory(options.bundleDirectory, options.evidenceDirectory, "attended evidence directory");
  if (options.mode === "record") {
    const record = createPhase7AttendedRecord({ candidate, checklist: parseCanonicalBytes(checklistBytes, "checklist"), checklistBytes, observations: parseCanonicalBytes(observationsBytes, "observations"), observationsBytes, evidenceDirectory });
    const output = freshOutputInsideBundle(options.bundleDirectory, options.output); writeFileSync(output, serializePhase7AttendedChecklist(record), { flag: "wx" });
    return Object.freeze({ record, record_sha256: digest(readFileSync(output)) });
  }
  const recordBytes = readFileSync(insideBundleFile(options.bundleDirectory, options.record, "record"));
  return Object.freeze({ record: validatePhase7AttendedRecordBytes({ candidate, checklistBytes, observationsBytes, recordBytes, evidenceDirectory }), record_sha256: digest(recordBytes) });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = executePhase7AttendedChecklist();
    process.stdout.write(`${JSON.stringify({ ok: true, mode: process.argv[2], status: result.record?.status ?? result.checklist?.status, sha256: result.record_sha256 ?? result.checklist_sha256, rows: result.record?.rows.length ?? result.checklist?.rows.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
