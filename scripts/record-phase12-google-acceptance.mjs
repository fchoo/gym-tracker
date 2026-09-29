#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  PHASE12_GOOGLE_ATTENDED_CASES,
  phase12ManifestIdentity,
  serializePhase12GoogleEvidence,
  validateDevelopmentTestManifest,
  validatePhase12GoogleChecklist,
} from "./prepare-phase12-google-acceptance.mjs";

const ROOT = process.cwd();
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;
const SERIAL = /^[A-Za-z0-9._:-]+$/u;
const PATHS = Object.freeze({
  manifest: "artifacts/native/phase12/build.json",
  checklist: "artifacts/native/phase12/attended/checklist.pending.json",
  observations: "artifacts/native/phase12/attended/observations.json",
  output: "artifacts/native/phase12/attended/attended-record.json",
});
const FORBIDDEN_KEY = /(?:token|email|permission|drive[_-]?id|object[_-]?name|workout[_-]?(?:row|content)|raw[_-]?content)/iu;
const FORBIDDEN_STRING = /(?:ya29\.|1\/\/[A-Za-z0-9_-]+|@[a-z0-9.-]+\.[a-z]{2,})/iu;

function fail(code) {
  throw new Error(`phase12_google_acceptance_${code}`);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !exactJson(Object.keys(value), keys)) fail(`${label}_shape_invalid`);
}

function noSecrets(value, label = "evidence") {
  if (typeof value === "string" && FORBIDDEN_STRING.test(value)) fail(`${label}_secret_or_personal_data`);
  if (Array.isArray(value)) value.forEach((entry, index) => noSecrets(entry, `${label}_${index}`));
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) fail(`${label}_forbidden_key`);
      noSecrets(nested, `${label}_${key}`);
    }
  }
}

export function parsePhase12GoogleAcceptanceArguments(args) {
  const names = new Map([
    ["--manifest", "manifest"],
    ["--checklist", "checklist"],
    ["--observations", "observations"],
    ["--emulator-serial", "emulatorSerial"],
    ["--phone-serial", "phoneSerial"],
    ["--output", "output"],
    ["--approval", "approval"],
  ]);
  if (args.length !== names.size * 2) fail("arguments_invalid");
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = names.get(args[index]);
    const value = args[index + 1];
    if (key === undefined || parsed[key] !== undefined || typeof value !== "string"
      || value.length === 0 || value.startsWith("--")) fail("arguments_invalid");
    parsed[key] = value;
  }
  if (parsed.manifest !== PATHS.manifest || parsed.checklist !== PATHS.checklist
    || parsed.observations !== PATHS.observations || parsed.output !== PATHS.output
    || parsed.approval !== "approved" || !SERIAL.test(parsed.emulatorSerial)
    || !SERIAL.test(parsed.phoneSerial) || parsed.emulatorSerial === parsed.phoneSerial) {
    fail("arguments_invalid");
  }
  return Object.freeze(parsed);
}

function parseCanonical(file, label) {
  const bytes = readFileSync(path.resolve(ROOT, file));
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label}_json_invalid`);
  }
  if (!serializePhase12GoogleEvidence(value).equals(bytes)) fail(`${label}_noncanonical`);
  return { bytes, value };
}

function adb(adbPath, serial, ...args) {
  return execFileSync(adbPath, ["-s", serial, ...args], { encoding: "utf8" }).trim();
}

export function readPhase12AttendedDevice({ adbPath, serial, role, manifest }) {
  const emulated = adb(adbPath, serial, "shell", "getprop", "ro.kernel.qemu") === "1";
  if ((role === "replacement-emulator") !== emulated) fail(`${role}_device_kind_invalid`);
  const packagePath = adb(adbPath, serial, "shell", "pm", "path", PACKAGE)
    .split(/\r?\n/u)
    .find((line) => /^package:\/[^\r\n]+\.apk$/u.test(line))
    ?.slice("package:".length);
  if (packagePath === undefined) fail(`${role}_package_missing`);
  const directory = mkdtempSync(path.join(os.tmpdir(), "phase12-attended-"));
  const localApk = path.join(directory, "installed.apk");
  try {
    execFileSync(adbPath, ["-s", serial, "pull", packagePath, localApk], { stdio: "ignore" });
    const installedApkSha256 = digest(readFileSync(localApk));
    if (installedApkSha256 !== manifest.apk.sha256) fail(`${role}_apk_mismatch`);
    return Object.freeze({
      role,
      model_sha256: digest(adb(adbPath, serial, "shell", "getprop", "ro.product.model")),
      serial_sha256: digest(serial),
      api: Number(adb(adbPath, serial, "shell", "getprop", "ro.build.version.sdk")),
      abi: adb(adbPath, serial, "shell", "getprop", "ro.product.cpu.abi"),
      installed_apk_sha256: installedApkSha256,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function validatePhase12GoogleObservations(observations, manifest) {
  exactKeys(observations, [
    "schema_version", "suite", "manifest", "account_identity_sha256", "cases",
  ], "observations");
  if (observations.schema_version !== 1
    || observations.suite !== "phase12-google-attended-observations"
    || !exactJson(observations.manifest, phase12ManifestIdentity(manifest))
    || !SHA256.test(observations.account_identity_sha256 ?? "")
    || !Array.isArray(observations.cases)
    || observations.cases.length !== PHASE12_GOOGLE_ATTENDED_CASES.length) {
    fail("observations_invalid");
  }
  noSecrets(observations);
  for (const [index, definition] of PHASE12_GOOGLE_ATTENDED_CASES.entries()) {
    const observed = observations.cases[index];
    exactKeys(observed, [
      "id", "status", "observed_at", "object_count", "total_bytes",
      "source_digest_sha256", "result_digest_sha256",
    ], `observation_${definition.id}`);
    if (observed.id !== definition.id || observed.status !== "passed"
      || !Number.isFinite(Date.parse(observed.observed_at ?? ""))
      || !Number.isSafeInteger(observed.object_count) || observed.object_count < 0
      || !Number.isSafeInteger(observed.total_bytes) || observed.total_bytes < 0
      || (observed.source_digest_sha256 !== null && !SHA256.test(observed.source_digest_sha256))
      || (observed.result_digest_sha256 !== null && !SHA256.test(observed.result_digest_sha256))) {
      fail(`observation_${definition.id}_invalid`);
    }
  }
  const byId = new Map(observations.cases.map((entry) => [entry.id, entry]));
  const emptyNamespace = byId.get("emulator-namespace-empty");
  const rotation = byId.get("emulator-latest-previous-rotation");
  const restore = byId.get("emulator-direct-restore-digest");
  if (emptyNamespace.object_count !== 0 || rotation.object_count < 2
    || rotation.total_bytes <= 0 || restore.source_digest_sha256 === null
    || restore.source_digest_sha256 !== restore.result_digest_sha256) {
    fail("observations_proof_invalid");
  }
  return observations;
}

export function validatePhase12GoogleAcceptanceRecord(record, manifest) {
  exactKeys(record, [
    "schema_version", "suite", "status", "approval_status", "manifest",
    "account_identity_sha256", "devices", "checklist_sha256",
    "observations_sha256", "recorded_at", "cases",
  ], "record");
  if (record.schema_version !== 1 || record.suite !== "phase12-google-attended"
    || record.status !== "passed" || record.approval_status !== "approved"
    || !exactJson(record.manifest, phase12ManifestIdentity(manifest))
    || !SHA256.test(record.account_identity_sha256 ?? "")
    || !SHA256.test(record.checklist_sha256 ?? "")
    || !SHA256.test(record.observations_sha256 ?? "")
    || !Number.isFinite(Date.parse(record.recorded_at ?? ""))
    || !Array.isArray(record.devices) || record.devices.length !== 2
    || !Array.isArray(record.cases)
    || record.cases.length !== PHASE12_GOOGLE_ATTENDED_CASES.length) fail("record_invalid");
  validatePhase12GoogleObservations({
    schema_version: 1,
    suite: "phase12-google-attended-observations",
    manifest: record.manifest,
    account_identity_sha256: record.account_identity_sha256,
    cases: record.cases,
  }, manifest);
  for (const device of record.devices) {
    exactKeys(device, [
      "role", "model_sha256", "serial_sha256", "api", "abi",
      "installed_apk_sha256",
    ], `record_device_${device.role}`);
  }
  const roles = record.devices.map((device) => device.role);
  if (!exactJson(roles, ["replacement-emulator", "physical-phone-auth-only"])
    || record.devices.some((device) => (
      !SHA256.test(device.model_sha256 ?? "")
      || !SHA256.test(device.serial_sha256 ?? "")
      || device.installed_apk_sha256 !== manifest.apk.sha256
      || !Number.isSafeInteger(device.api) || device.api < 24
      || typeof device.abi !== "string" || device.abi.length === 0
    )) || record.devices[0].serial_sha256 === record.devices[1].serial_sha256) {
    fail("record_device_invalid");
  }
  noSecrets(record);
  return record;
}

export function createPhase12GoogleAcceptanceRecord(input) {
  const observations = validatePhase12GoogleObservations(input.observations, input.manifest);
  const record = Object.freeze({
    schema_version: 1,
    suite: "phase12-google-attended",
    status: "passed",
    approval_status: "approved",
    manifest: phase12ManifestIdentity(input.manifest),
    account_identity_sha256: observations.account_identity_sha256,
    devices: Object.freeze([input.emulator, input.phone]),
    checklist_sha256: digest(input.checklistBytes),
    observations_sha256: digest(input.observationsBytes),
    recorded_at: input.recordedAt,
    cases: observations.cases,
  });
  return validatePhase12GoogleAcceptanceRecord(record, input.manifest);
}

export function recordPhase12GoogleAcceptance(args = process.argv.slice(2)) {
  const options = parsePhase12GoogleAcceptanceArguments(args);
  const manifest = JSON.parse(readFileSync(options.manifest, "utf8"));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const source = execFileSync("node", ["scripts/source-tree-digest.mjs", "--assert-no-untracked"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  validateDevelopmentTestManifest(manifest, head, source);
  validateDevelopmentTestManifest(
    manifest,
    head,
    source,
    readFileSync(path.resolve(ROOT, manifest.apk.path)),
  );
  const checklist = parseCanonical(options.checklist, "checklist");
  const observations = parseCanonical(options.observations, "observations");
  validatePhase12GoogleChecklist(checklist.value, manifest);
  const adbPath = process.env.ADB_PATH ?? "adb";
  const emulator = readPhase12AttendedDevice({
    adbPath,
    serial: options.emulatorSerial,
    role: "replacement-emulator",
    manifest,
  });
  const phone = readPhase12AttendedDevice({
    adbPath,
    serial: options.phoneSerial,
    role: "physical-phone-auth-only",
    manifest,
  });
  const record = createPhase12GoogleAcceptanceRecord({
    manifest,
    checklistBytes: checklist.bytes,
    observations: observations.value,
    observationsBytes: observations.bytes,
    emulator,
    phone,
    recordedAt: new Date().toISOString(),
  });
  writeFileSync(options.output, serializePhase12GoogleEvidence(record), { flag: "wx" });
  return Object.freeze({ output: options.output, record_sha256: digest(readFileSync(options.output)) });
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...recordPhase12GoogleAcceptance() })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase12_google_acceptance_record_failed"}\n`);
    process.exitCode = 1;
  }
}
