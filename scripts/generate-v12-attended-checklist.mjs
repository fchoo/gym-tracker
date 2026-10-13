import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const RUN_ID = /^v12-samsung-acceptance-[a-z0-9-]{3,72}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const FORBIDDEN_KEYS = new Set([
  "approval",
  "approved",
  "n4_image",
  "n4_images",
  "n4_status",
  "private_path",
  "promotion",
  "raw_path",
  "release_authorized",
  "release_authorization",
  "release_command",
  "serial",
  "tag",
  "terminal_seal",
]);

export const V12_ATTENDED_ROWS = Object.freeze([
  Object.freeze({ id: "S20-01", scope: "Legibility", instructions: "Confirm native text, contrast, and targets remain legible at F200." }),
  Object.freeze({ id: "S20-02", scope: "One-handed dock", instructions: "Confirm the one-handed dock stays reachable and does not obscure the active action." }),
  Object.freeze({ id: "S20-03", scope: "Calendar feel", instructions: "Confirm Calendar movement, selection, and return feel native and remain visually coherent." }),
  Object.freeze({ id: "S20-04", scope: "Keyboard and focus", instructions: "Confirm keyboard, D-pad, and 3dp focus visibility across the selected route." }),
  Object.freeze({ id: "S20-05", scope: "Theme", instructions: "Confirm Light, Dark, and System theme treatment remains coherent on the Samsung device." }),
  Object.freeze({ id: "S20-06", scope: "Sound", instructions: "Confirm device-owned sound behavior is clear without recording device-private audio data." }),
  Object.freeze({ id: "S20-07", scope: "Haptics", instructions: "Confirm device-owned haptic behavior is clear without recording device-private haptic data." }),
]);

function fail(message) {
  throw new Error(`v12_attended_invalid: ${message}`);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object.`);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    fail(`${label} has unexpected keys.`);
  }
}

function exactJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function hasForbiddenData(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenData);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, nested]) => FORBIDDEN_KEYS.has(key)
    || key.startsWith("n4_")
    || hasForbiddenData(nested));
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a SHA-256 digest.`);
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be an ISO timestamp.`);
  }
}

function validateIdentity(identity) {
  if (hasForbiddenData(identity)) fail("identity contains forbidden private data.");
  exactKeys(identity, [
    "apk_sha256", "apk_signature_sha256", "config_sha256", "device", "installed_apk_sha256", "run_id", "source_tree_sha256",
  ], "identity");
  if (typeof identity.run_id !== "string" || !RUN_ID.test(identity.run_id)) {
    fail("identity run ID is malformed.");
  }
  for (const key of ["source_tree_sha256", "apk_sha256", "apk_signature_sha256", "installed_apk_sha256", "config_sha256"]) {
    assertSha256(identity[key], `identity ${key}`);
  }
  if (identity.apk_sha256 !== identity.installed_apk_sha256) {
    fail("installed APK identity does not match the candidate APK.");
  }
  exactKeys(identity.device, ["device_sha256", "model"], "device identity");
  if (identity.device.model !== "SM-S916B") fail("device model must be SM-S916B.");
  assertSha256(identity.device.device_sha256, "device hash");
  return identity;
}

export function buildV12AttendedChecklist({ identity, generated_at: generatedAt } = {}) {
  validateIdentity(identity);
  assertTimestamp(generatedAt, "generated time");
  return Object.freeze({
    schema_version: 1,
    suite: "v12-samsung-attended",
    mode: "observation-only",
    status: "pending_human",
    release_authorized: false,
    identity,
    generated_at: generatedAt,
    rows: V12_ATTENDED_ROWS.map((row) => Object.freeze({ ...row, status: "pending_human", png_sha256: null })),
  });
}

export function validateV12AttendedObservations(observations, { identity } = {}) {
  if (hasForbiddenData(observations)) fail("observations contain forbidden authority, N4, or private data.");
  exactKeys(observations, ["identity", "rows", "schema_version", "suite"], "observations");
  if (observations.schema_version !== 1 || observations.suite !== "v12-samsung-attended-observations") {
    fail("observation schema is malformed.");
  }
  validateIdentity(observations.identity);
  if (identity !== undefined && !exactJson(observations.identity, identity)) {
    fail("observation identity does not match the prepared checklist.");
  }
  if (!Array.isArray(observations.rows) || observations.rows.length !== V12_ATTENDED_ROWS.length) {
    fail("observation rows are incomplete.");
  }
  const imageHashes = new Set();
  for (const [index, expected] of V12_ATTENDED_ROWS.entries()) {
    const actual = observations.rows[index];
    exactKeys(actual, ["id", "png_sha256", "status"], `observation row ${index}`);
    if (actual.id !== expected.id || !["passed", "failed"].includes(actual.status)) {
      fail(`observation row status is invalid: ${expected.id}.`);
    }
    assertSha256(actual.png_sha256, `observation PNG ${expected.id}`);
    if (imageHashes.has(actual.png_sha256)) fail("observation PNG hashes must be unique.");
    imageHashes.add(actual.png_sha256);
  }
  return observations;
}

export function createV12AttendedRecord({ checklist, observations, recorded_at: recordedAt } = {}) {
  exactKeys(checklist, ["generated_at", "identity", "mode", "release_authorized", "rows", "schema_version", "status", "suite"], "checklist");
  if (checklist.schema_version !== 1 || checklist.suite !== "v12-samsung-attended"
    || checklist.mode !== "observation-only" || checklist.status !== "pending_human"
    || checklist.release_authorized !== false) {
    fail("checklist cannot express approval or release authority.");
  }
  validateIdentity(checklist.identity);
  assertTimestamp(checklist.generated_at, "checklist generated time");
  assertTimestamp(recordedAt, "recorded time");
  validateV12AttendedObservations(observations, { identity: checklist.identity });
  const rows = V12_ATTENDED_ROWS.map((definition, index) => Object.freeze({
    ...definition,
    status: observations.rows[index].status,
    png_sha256: observations.rows[index].png_sha256,
  }));
  return Object.freeze({
    schema_version: 1,
    suite: "v12-samsung-attended",
    mode: "observation-only",
    status: rows.every(({ status }) => status === "passed") ? "passed" : "failed",
    release_authorized: false,
    identity: checklist.identity,
    checklist_sha256: createHash("sha256").update(JSON.stringify(checklist)).digest("hex"),
    recorded_at: recordedAt,
    rows,
  });
}

function parseModeArguments(args) {
  const [mode, ...rest] = args;
  const expected = mode === "prepare" ? ["identity", "output"]
    : mode === "record" ? ["checklist", "observations", "output"]
      : mode === "verify" ? ["checklist", "observations"] : undefined;
  if (expected === undefined || rest.length !== expected.length * 2) fail("CLI arguments are malformed.");
  const values = { mode };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]?.slice(2); const value = rest[index + 1];
    if (!expected.includes(key) || values[key] !== undefined || typeof value !== "string" || value.length < 1 || value.startsWith("--")) fail("CLI arguments are malformed.");
    values[key] = value;
  }
  return values;
}

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { fail(`${label} is not valid JSON.`); }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

function executeCli(args = process.argv.slice(2)) {
  const options = parseModeArguments(args);
  if (options.mode === "prepare") {
    const checklist = buildV12AttendedChecklist({ identity: readJson(options.identity, "identity"), generated_at: new Date().toISOString() });
    writeJson(options.output, checklist); return checklist;
  }
  const checklist = readJson(options.checklist, "checklist"); const observations = readJson(options.observations, "observations");
  if (options.mode === "record") {
    const record = createV12AttendedRecord({ checklist, observations, recorded_at: new Date().toISOString() });
    writeJson(options.output, record); return record;
  }
  validateV12AttendedObservations(observations, { identity: checklist.identity }); return observations;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = executeCli();
    process.stdout.write(`${JSON.stringify({ ok: true, mode: process.argv[2], status: result.status ?? "validated" })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "v12_attended_invalid" })}\n`);
    process.exitCode = 1;
  }
}
