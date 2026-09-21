#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  argon2Sync,
  createCipheriv,
  createHash,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const PROJECT_ROOT = process.cwd();
const ADB_FALLBACK = "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const DEFAULT_MANIFEST = "artifacts/native/phase11/build.json";
const DEFAULT_SQLITE_RESULT = "artifacts/native/phase11/result.json";
const FLOW_PATH = "maestro/phase11/portable-merge.yaml";
const RESTORE_FIXTURE_FILE = "phase11-restore-base.gtbk";
const MERGE_FIXTURE_FILE = "phase11-merge-fixture.gtbk";
const FIXTURE_PASSWORD = "phase11-merge-password";
const FIXTURE_OWNER_NAMESPACE = "11111111111111111111111111111111";
const BACK_SQUAT_ID = "5f140001-7e35-4a6d-9100-000000000001";
const OFF_TIMING_JSON = "{\"version\":1,\"mode\":\"off\"}";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;

export const PHASE11_FIXTURE_PASSWORD = FIXTURE_PASSWORD;

export const PHASE11_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "phase11-data-recovery-navigation",
    flow: FLOW_PATH,
    stage: "navigation-cancel",
    coverage: Object.freeze([
      "DATA-09-manual-export-entry",
      "D-03-restore-clean-merge-separation",
      "D-04-picker-cancel-no-mutation",
      "UI-role-name-state",
      "UI-focus-dpad",
    ]),
  }),
  Object.freeze({
    id: "phase11-restore-clean-fixture",
    flow: FLOW_PATH,
    stage: "restore-clean-fixture",
    coverage: Object.freeze([
      "D-03-clean-restore",
      "DATA-09-portable-v2-restore",
    ]),
  }),
  Object.freeze({
    id: "phase11-merge-review-cancel",
    flow: FLOW_PATH,
    stage: "merge-review-cancel",
    coverage: Object.freeze([
      "D-01-merge-preview-summary",
      "D-02-owner-scoped-identity-copy",
      "D-04-review-cancel-token-invalidated",
      "UI-non-color",
    ]),
  }),
  Object.freeze({
    id: "phase11-merge-commit-relaunch",
    flow: FLOW_PATH,
    stage: "merge-commit-relaunch",
    coverage: Object.freeze([
      "D-01-merge-commit-lifecycle",
      "D-04-exact-merge-confirmation",
      "DATA-08-merge-visible-after-relaunch",
      "DATA-09-import-fallback",
    ]),
  }),
]);

export const PHASE11_EVIDENCE_MATRIX = Object.freeze([
  Object.freeze({ id: "D-01", source: "app/more/__tests__/data-and-recovery.test.tsx", flows: ["phase11-merge-review-cancel", "phase11-merge-commit-relaunch"], sqlite_backstop: "portable-merge" }),
  Object.freeze({ id: "D-02", source: "src/domains/portability/mergePlan.test.ts", flows: ["phase11-merge-review-cancel"], sqlite_backstop: "portable-merge" }),
  Object.freeze({ id: "D-03", source: "app/more/__tests__/data-and-recovery.test.tsx", flows: ["phase11-data-recovery-navigation", "phase11-restore-clean-fixture"], sqlite_backstop: "portable-merge" }),
  Object.freeze({ id: "D-04", source: "src/domains/portability/mergeCommands.test.ts", flows: ["phase11-data-recovery-navigation", "phase11-merge-review-cancel", "phase11-merge-commit-relaunch"], sqlite_backstop: "portable-merge" }),
  Object.freeze({ id: "DATA-08", source: "artifacts/native/phase11/result.json", flows: ["phase11-merge-review-cancel", "phase11-merge-commit-relaunch"], sqlite_backstop: "portable-merge" }),
  Object.freeze({ id: "DATA-09", source: "src/bootstrap/workoutAppRuntime.test.tsx", flows: ["phase11-data-recovery-navigation", "phase11-restore-clean-fixture"], sqlite_backstop: "portable-merge" }),
  Object.freeze({ id: "UI-role-name-state", source: "app/more/__tests__/data-and-recovery.test.tsx", flows: ["phase11-data-recovery-navigation", "phase11-merge-review-cancel"], sqlite_backstop: null }),
  Object.freeze({ id: "UI-focus-dpad", source: "maestro/phase11/portable-merge.yaml", flows: ["phase11-data-recovery-navigation"], sqlite_backstop: null }),
  Object.freeze({ id: "UI-minimum-target", source: "src/ui/__tests__/SettingsScreen.test.tsx", flows: ["phase11-data-recovery-navigation"], sqlite_backstop: null }),
  Object.freeze({ id: "UI-non-color", source: "app/more/__tests__/data-and-recovery.test.tsx", flows: ["phase11-merge-review-cancel"], sqlite_backstop: null }),
]);

function fail(message) {
  throw new Error(`Phase 11 Maestro: ${message}`);
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

function stableJson(value) {
  if (value === null || typeof value === "boolean"
    || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
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
    manifest: DEFAULT_MANIFEST,
    output: "",
    reportDirectory: "",
    sqliteResult: DEFAULT_SQLITE_RESULT,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const next = args[index + 1];
    if (argument === "--manifest") { options.manifest = next ?? ""; index += 1; }
    else if (argument === "--output") { options.output = next ?? ""; index += 1; }
    else if (argument === "--report-dir") { options.reportDirectory = next ?? ""; index += 1; }
    else if (argument === "--sqlite-result") { options.sqliteResult = next ?? ""; index += 1; }
    else if (argument.startsWith("--manifest=")) options.manifest = argument.slice("--manifest=".length);
    else if (argument.startsWith("--output=")) options.output = argument.slice("--output=".length);
    else if (argument.startsWith("--report-dir=")) options.reportDirectory = argument.slice("--report-dir=".length);
    else if (argument.startsWith("--sqlite-result=")) options.sqliteResult = argument.slice("--sqlite-result=".length);
    else fail(`unknown argument: ${argument}`);
  }
  if (!options.manifest) fail("--manifest is required.");
  const manifestPath = path.resolve(PROJECT_ROOT, options.manifest);
  const artifactDirectory = path.dirname(manifestPath);
  return Object.freeze({
    manifest: manifestPath,
    output: path.resolve(PROJECT_ROOT, options.output || path.join(artifactDirectory, "phase11-maestro.json")),
    reportDirectory: path.resolve(PROJECT_ROOT, options.reportDirectory || path.join(artifactDirectory, "phase11-maestro")),
    sqliteResult: path.resolve(PROJECT_ROOT, options.sqliteResult),
  });
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing: ${filePath}`);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    fail(`${label} is unreadable: ${filePath}`);
  }
  return undefined;
}

function resolveAdb() {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const candidate = androidHome === undefined
    ? ADB_FALLBACK
    : path.join(androidHome, "platform-tools", "adb");
  if (!existsSync(candidate)) fail(`adb is unavailable: ${candidate}`);
  return candidate;
}

export function derivePortableMergeCaseIds(
  source = readFileSync(
    path.join(PROJECT_ROOT, "src/testing/contracts/portableMerge.contract.ts"),
    "utf8",
  ),
) {
  const caseBlock = source.match(
    /export const PORTABLE_MERGE_CONTRACT_CASES = \[([\s\S]*?)\] as const;/u,
  )?.[1] ?? "";
  const caseIds = [...caseBlock.matchAll(/"([a-z0-9-]+)"/gu)]
    .map((match) => match[1]);
  if (caseIds.length < 1 || new Set(caseIds).size !== caseIds.length) {
    fail("portable merge case IDs could not be derived from source.");
  }
  return Object.freeze(caseIds);
}

export function deriveLogicalBackupTableNames(
  source = readFileSync(
    path.join(PROJECT_ROOT, "src/domains/portability/backupContracts.ts"),
    "utf8",
  ),
) {
  const tableBlock = source.match(
    /export const LOGICAL_BACKUP_TABLE_DEFINITIONS = Object\.freeze\(\{([\s\S]*?)\} satisfies/u,
  )?.[1] ?? "";
  const tableNames = [...tableBlock.matchAll(/^\s{2}([a-z][a-z0-9_]*):\s*\{/gmu)]
    .map((match) => match[1])
    .sort();
  if (tableNames.length < 1 || new Set(tableNames).size !== tableNames.length) {
    fail("logical backup table names could not be derived from source.");
  }
  return Object.freeze(tableNames);
}

export function validatePhase11Manifest(
  manifest,
  apkPath,
  apkSha256,
  current = {},
) {
  if (manifest?.schema_version !== 1
    || manifest.suite !== "phase11"
    || manifest.profile !== "development-test"
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || manifest.package !== PACKAGE
    || typeof manifest.device?.serial !== "string"
    || manifest.device.serial.length === 0
    || typeof manifest.device?.abi !== "string"
    || !Number.isInteger(manifest.device?.api)
    || !GIT_SHA_PATTERN.test(manifest.base_head ?? "")
    || !SHA256_PATTERN.test(manifest.source_tree_sha256 ?? "")
    || !SHA256_PATTERN.test(manifest.apk?.sha256 ?? "")
    || manifest.apk?.page_alignment_kib !== 16
    || manifest.apk?.page_alignment_verified !== true
    || manifest.installed_apk?.sha256 !== manifest.apk?.sha256
    || manifest.installed_apk?.matches_retained_apk !== true) {
    fail("manifest is not a Phase 11 development-test APK contract.");
  }
  if (current.currentHead !== undefined && manifest.base_head !== current.currentHead) {
    fail("current source does not match the Phase 11 manifest.");
  }
  if (current.currentSourceSha256 !== undefined
    && manifest.source_tree_sha256 !== current.currentSourceSha256) {
    fail("current source does not match the Phase 11 manifest.");
  }
  if (typeof apkPath !== "string" || apkPath.length === 0
    || !SHA256_PATTERN.test(apkSha256 ?? "")
    || apkSha256 !== manifest.apk.sha256) {
    fail("APK bytes do not match the declared Phase 11 manifest.");
  }
  return true;
}

export function validatePhase11SqliteBackstop(
  evidence,
  manifest,
  expectedCaseIds = derivePortableMergeCaseIds(),
) {
  if (evidence?.schema_version !== 1
    || evidence.suite !== "portable-merge"
    || evidence.status !== "passed"
    || evidence.build_manifest !== DEFAULT_MANIFEST
    || evidence.base_head !== manifest.base_head
    || evidence.source_tree_sha256 !== manifest.source_tree_sha256
    || evidence.package !== manifest.package
    || evidence.apk?.sha256 !== manifest.apk?.sha256
    || evidence.installed_apk?.sha256 !== manifest.installed_apk?.sha256
    || evidence.installed_apk?.matches_retained_apk !== true
    || !same(evidence.device, manifest.device)
    || evidence.contract?.expected_count !== expectedCaseIds.length
    || evidence.contract?.total !== expectedCaseIds.length
    || evidence.contract?.passed !== expectedCaseIds.length
    || evidence.contract?.failed !== 0
    || evidence.contract?.skipped !== 0
    || !same(evidence.contract?.cases?.map(({ id, status }) => ({ id, status })),
      expectedCaseIds.map((id) => ({ id, status: "passed" })))) {
    fail("Phase 11 portable-merge SQLite backstop is incomplete or stale.");
  }
  return Object.freeze({
    suite: "portable-merge",
    expected_count: expectedCaseIds.length,
    total: evidence.contract.total,
    passed: evidence.contract.passed,
    failed: evidence.contract.failed,
    skipped: evidence.contract.skipped,
  });
}

function validateEvidenceMatrix() {
  const flowIds = new Set(PHASE11_MAESTRO_FLOW_CONTRACTS.map(({ id }) => id));
  const ids = new Set();
  for (const entry of PHASE11_EVIDENCE_MATRIX) {
    if (typeof entry.id !== "string" || ids.has(entry.id)
      || typeof entry.source !== "string" || !existsSync(path.join(PROJECT_ROOT, entry.source))) {
      fail(`evidence matrix is invalid: ${entry.id}`);
    }
    ids.add(entry.id);
    for (const flow of entry.flows) {
      if (!flowIds.has(flow)) fail(`evidence matrix names an unknown flow: ${entry.id}`);
    }
  }
}

function parseJunit(bytes, contract) {
  const xml = bytes.toString("utf8");
  const tests = Number(xml.match(/\btests="(\d+)"/u)?.[1] ?? 0);
  const failures = Number(xml.match(/\bfailures="(\d+)"/u)?.[1] ?? 0);
  const errors = Number(xml.match(/\berrors="(\d+)"/u)?.[1] ?? 0);
  const skipped = Number(xml.match(/\bskipped="(\d+)"/u)?.[1] ?? 0);
  if (!xml.includes(contract.flow) || tests < 1
    || failures !== 0 || errors !== 0 || skipped !== 0) {
    fail(`Maestro report did not pass: ${contract.id}`);
  }
  return Object.freeze({ tests, failures, errors, skipped });
}

function snapshotFlows() {
  return Object.freeze(PHASE11_MAESTRO_FLOW_CONTRACTS.map((contract) => {
    const absolute = path.join(PROJECT_ROOT, contract.flow);
    if (!existsSync(absolute)) fail(`required Maestro flow is missing: ${contract.id}`);
    return Object.freeze({ ...contract, absolute, sha256: sha256File(absolute) });
  }));
}

function logicalTables() {
  return Object.fromEntries(
    deriveLogicalBackupTableNames().map((table) => [table, []]),
  );
}

function logicalSnapshot({
  createdAtMs,
  localDate,
  ownerNamespace = FIXTURE_OWNER_NAMESPACE,
  planDayName,
  planId,
  planName,
  planPortableId,
  setting,
  sessionId,
  snapshotId,
}) {
  const tables = logicalTables();
  tables.portable_owner_identity = [
    { id: 1, owner_namespace: ownerNamespace },
  ];
  tables.app_settings = [
    {
      key: "appearance",
      value_version: 1,
      value_json: JSON.stringify(setting),
      revision: 1,
      updated_at_ms: createdAtMs,
    },
  ];
  tables.plans = [
    {
      id: planId,
      content_pack_id: null,
      origin: "custom",
      source_namespace: null,
      upstream_id: null,
      name: planName,
      days_per_week: 1,
      audience: "Owner",
      goal: "Portable merge evidence",
      estimate_minutes: 30,
      attribution: "Owner",
      is_active: 0,
      revision: 1,
      portable_id: planPortableId,
    },
  ];
  tables.plan_days = [
    {
      id: `${planId}-day`,
      plan_id: planId,
      ordinal: 0,
      name: planDayName,
      revision: 1,
    },
  ];
  tables.owned_plan_aggregate_states = [
    {
      plan_id: planId,
      lifecycle: "draft",
      graph_status: "missing_valid_target",
      missing_requirement_code: "owned_plan_missing_valid_target",
      missing_requirement: "Add at least one exercise with valid targets before scheduling or activating.",
      created_at_ms: createdAtMs,
      updated_at_ms: createdAtMs,
      archived_at_ms: null,
    },
  ];
  tables.workout_sessions = [
    {
      id: sessionId,
      plan_id: planId,
      plan_day_id: `${planId}-day`,
      source: "manual",
      status: "completed",
      local_date: localDate,
      timezone: "Asia/Singapore",
      started_at_ms: createdAtMs,
      completed_at_ms: createdAtMs + 1_800_000,
      active_session_exercise_id: null,
      active_set_id: null,
      revision: 1,
      creation_timezone_offset_minutes: 480,
      modified_from_plan: 0,
      portable_id: createHash("sha256").update(`${sessionId}:portable`).digest("hex").slice(0, 32),
      merge_modified_at_ms: createdAtMs + 1_800_000,
    },
  ];
  tables.session_exercises = [
    {
      id: `${sessionId}-exercise`,
      session_id: sessionId,
      source_plan_day_exercise_id: null,
      exercise_id: BACK_SQUAT_ID,
      ordinal: 0,
      exercise_name: "Back Squat",
      metric_profile: "load_reps",
      metric_contract_version: 1,
      exercise_metric_generation: 1,
      default_rest_seconds: 90,
      target_revision: 1,
      status: "completed",
      revision: 1,
      effort: null,
      effort_recorded_at_ms: null,
      origin: "planned",
      display_ordinal: 0,
      advanced_timing_default_json: OFF_TIMING_JSON,
    },
  ];
  tables.session_sets = [
    {
      id: `${sessionId}-set`,
      session_exercise_id: `${sessionId}-exercise`,
      set_kind: "working",
      ordinal: 0,
      source_plan_working_set_target_id: null,
      target_load_grams: 10000,
      target_min_reps: 8,
      target_max_reps: 10,
      target_json: "{}",
      unit_json: "{}",
      rule_type: "load_reps",
      rule_version: 1,
      metric_profile: "load_reps",
      metric_contract_version: 1,
      exercise_metric_generation: 1,
      observed_load_grams: 10000,
      observed_reps: 8,
      observed_json: "{}",
      status: "completed",
      draft_updated_at_ms: null,
      completed_at_ms: createdAtMs + 1_800_000,
      completion_idempotency_key: `${sessionId}-complete`,
      revision: 1,
      source_owned_plan_working_set_target_id: null,
      advanced_timing_override_json: null,
      advanced_timing_resolved_json: OFF_TIMING_JSON,
    },
  ];
  const rowCounts = Object.fromEntries(
    Object.entries(tables).map(([table, rows]) => [table, rows.length]),
  );
  return Object.freeze({
    version: 2,
    snapshotId,
    createdAtMs,
    schemaVersion: 22,
    manifest: Object.freeze({
      catalogReferenceCount: 0,
      rowCounts,
      totalRows: Object.values(rowCounts).reduce((sum, count) => sum + count, 0),
    }),
    tables: Object.freeze(tables),
    catalogReferences: [],
  });
}

function archiveBytes(snapshot, password, saltSeed, nonceSeed) {
  const passwordBytes = Buffer.from(password);
  const salt = Buffer.alloc(16, saltSeed);
  const nonce = Buffer.alloc(12, nonceSeed);
  const plaintext = Buffer.from(stableJson(snapshot));
  const header = {
    cipher: { algorithm: "aes-256-gcm", tagBytes: 16 },
    compression: "none",
    kdf: {
      algorithm: "argon2id",
      iterations: 2,
      memoryKiB: 19_456,
      outputBytes: 32,
      parallelism: 1,
      salt: base64(salt),
      version: 1,
    },
    nonce: base64(nonce),
    payloadBytes: plaintext.byteLength,
    snapshotId: snapshot.snapshotId,
    version: snapshot.version,
  };
  const headerBytes = Buffer.from(stableJson(header));
  const prefix = Buffer.alloc(9 + headerBytes.length);
  Buffer.from([0x47, 0x54, 0x42, 0x4b]).copy(prefix, 0);
  prefix[4] = snapshot.version;
  prefix.writeUInt32BE(headerBytes.length, 5);
  headerBytes.copy(prefix, 9);
  const key = argon2Sync("argon2id", {
    message: passwordBytes,
    nonce: salt,
    memory: 19_456,
    passes: 2,
    parallelism: 1,
    tagLength: 32,
  });
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(prefix);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([prefix, ciphertext, tag]);
}

export function createPhase11FixtureArchives({
  directory,
  localDate,
  password = FIXTURE_PASSWORD,
}) {
  mkdirSync(directory, { recursive: true });
  const fixtures = [
    {
      id: "phase11-restore-base",
      file: RESTORE_FIXTURE_FILE,
      role: "restore-clean-base",
      snapshot: logicalSnapshot({
        createdAtMs: 1_789_980_000_000,
        localDate,
        planDayName: "Base Day",
        planId: "phase11-local-plan",
        planName: "Local Merge Baseline",
        planPortableId: "22222222222222222222222222222222",
        setting: "system",
        sessionId: "phase11-local-session",
        snapshotId: "phase11-restore-base",
      }),
    },
    {
      id: "phase11-merge-fixture",
      file: MERGE_FIXTURE_FILE,
      role: "merge-import",
      snapshot: logicalSnapshot({
        createdAtMs: 1_789_986_000_000,
        localDate,
        planDayName: "Imported Day",
        planId: "phase11-archive-plan",
        planName: "Imported Merge Session",
        planPortableId: "33333333333333333333333333333333",
        setting: "dark",
        sessionId: "phase11-archive-session",
        snapshotId: "phase11-merge-fixture",
      }),
    },
  ].map((fixture, index) => {
    const bytes = archiveBytes(fixture.snapshot, password, index + 1, index + 3);
    const filePath = path.join(directory, fixture.file);
    writeFileSync(filePath, bytes);
    return Object.freeze({
      id: fixture.id,
      role: fixture.role,
      file: fixture.file,
      path: filePath,
      sha256: sha256Bytes(bytes),
      size_bytes: bytes.byteLength,
      snapshot_id: fixture.snapshot.snapshotId,
      total_rows: fixture.snapshot.manifest.totalRows,
    });
  });
  return Object.freeze(fixtures);
}

function validateLiveInstallation(adbPath, manifest) {
  const serial = manifest.device.serial;
  const installedPath = command(adbPath, ["-s", serial, "shell", "pm", "path", PACKAGE])
    .split(/\r?\n/u).find((line) => line.startsWith("package:"))?.slice(8);
  if (typeof installedPath !== "string" || installedPath.length === 0) {
    fail("live Phase 11 package is missing.");
  }
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "phase11-installed-"));
  try {
    const installedCopy = path.join(temporaryDirectory, "installed.apk");
    command(adbPath, ["-s", serial, "pull", installedPath, installedCopy]);
    if (sha256File(installedCopy) !== manifest.apk.sha256) {
      fail("installed APK bytes do not match the retained APK.");
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function validatePhase11Evidence(
  evidence,
  expected,
) {
  if (evidence?.schema_version !== 1
    || evidence.suite !== "phase11"
    || evidence.status !== "passed"
    || evidence.producer !== "phase11-maestro/v1"
    || evidence.build_manifest !== DEFAULT_MANIFEST
    || expected === undefined
    || !same(evidence.identity, expected.identity)
    || !same(evidence.sqlite_backstop, expected.sqliteBackstop)
    || !same(evidence.matrix, PHASE11_EVIDENCE_MATRIX)
    || !Array.isArray(evidence.flows)
    || evidence.flows.length !== expected.flows.length
    || !Array.isArray(evidence.fixtures)
    || evidence.fixtures.length !== 2
    || !same(evidence.fixtures.map(({ id }) => id), [
      "phase11-restore-base",
      "phase11-merge-fixture",
    ])) {
    fail("Phase 11 Maestro evidence identity or matrix is invalid.");
  }
  for (const fixture of evidence.fixtures) {
    if (!["phase11-restore-base", "phase11-merge-fixture"].includes(fixture.id)
      || !SHA256_PATTERN.test(fixture.sha256 ?? "")
      || !Number.isInteger(fixture.size_bytes)
      || fixture.size_bytes < 1
      || typeof fixture.file !== "string"
      || fixture.file.includes("/")) {
      fail("Phase 11 fixture evidence is invalid.");
    }
  }
  for (const [index, contract] of expected.flows.entries()) {
    const actual = evidence.flows[index];
    if (actual?.id !== contract.id
      || actual.flow !== contract.flow
      || actual.stage !== contract.stage
      || !same(actual.coverage, contract.coverage)
      || actual.flow_sha256 !== contract.sha256
      || actual.tests < 1
      || actual.failures !== 0
      || actual.errors !== 0
      || actual.skipped !== 0
      || !SHA256_PATTERN.test(actual.report_sha256 ?? "")) {
      fail(`Phase 11 Maestro flow is invalid: ${contract.id}`);
    }
  }
  return evidence;
}

export function executePhase11Maestro(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  validateEvidenceMatrix();
  const manifest = readJson(options.manifest, "Phase 11 build manifest");
  const apkPath = path.resolve(PROJECT_ROOT, manifest?.apk?.path ?? "");
  validatePhase11Manifest(manifest, apkPath, existsSync(apkPath) ? sha256File(apkPath) : "", {
    currentHead: command("git", ["rev-parse", "HEAD"]),
    currentSourceSha256: sourceTreeSha256(PROJECT_ROOT),
  });
  const sqliteResult = readJson(options.sqliteResult, "Phase 11 portable-merge result");
  const sqliteBackstop = validatePhase11SqliteBackstop(
    sqliteResult,
    manifest,
    derivePortableMergeCaseIds(),
  );
  const adb = resolveAdb();
  const serial = manifest.device.serial;
  const flowPath = path.resolve(PROJECT_ROOT, FLOW_PATH);
  if (!existsSync(flowPath)) fail(`required Maestro flow is missing: ${FLOW_PATH}`);
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "phase11-maestro-"));
  let primaryError;
  let evidence;
  try {
    const fixtures = createPhase11FixtureArchives({
      directory: path.join(temporaryDirectory, "fixtures"),
      localDate: command(adb, ["-s", serial, "shell", "date", "+%Y-%m-%d"]),
    });
    command(adb, ["-s", serial, "install", "-r", apkPath]);
    validateLiveInstallation(adb, manifest);
    command(adb, ["-s", serial, "shell", "mkdir", "-p", "/sdcard/Download"]);
    for (const fixture of fixtures) {
      command(adb, ["-s", serial, "push", fixture.path, `/sdcard/Download/${fixture.file}`]);
    }
    const flows = [];
    for (const contract of snapshotFlows()) {
      const reportPath = path.join(temporaryDirectory, `${contract.id}.xml`);
      command(adb, ["-s", serial, "shell", "am", "force-stop", PACKAGE]);
      execFileSync("maestro", [
        "test", "--no-ansi", "--format", "junit", "--output", reportPath,
        "--udid", serial, "-e", `PHASE11_STAGE=${contract.stage}`,
        "-e", `PHASE11_DEVICE_ROOT=${manifest.device.model}`,
        "-e", `PHASE11_BACKUP_PASSWORD=${FIXTURE_PASSWORD}`, flowPath,
      ], { cwd: PROJECT_ROOT, stdio: "inherit" });
      if (sha256File(contract.absolute) !== contract.sha256) {
        fail(`executed Maestro flow bytes changed: ${contract.id}`);
      }
      const report = readFileSync(reportPath);
      flows.push(Object.freeze({
        id: contract.id,
        flow: contract.flow,
        stage: contract.stage,
        coverage: contract.coverage,
        flow_sha256: contract.sha256,
        report_file: `phase11-maestro/${contract.id}.xml`,
        report_sha256: sha256Bytes(report),
        ...parseJunit(report, contract),
      }));
    }
    evidence = {
      schema_version: 1,
      suite: "phase11",
      status: "passed",
      producer: "phase11-maestro/v1",
      build_manifest: path.relative(PROJECT_ROOT, options.manifest),
      identity: {
        base_head: manifest.base_head,
        source_tree_sha256: manifest.source_tree_sha256,
        package: manifest.package,
        apk_sha256: manifest.apk.sha256,
        installed_apk_sha256: manifest.installed_apk.sha256,
        device: manifest.device,
      },
      sqlite_backstop: sqliteBackstop,
      matrix: PHASE11_EVIDENCE_MATRIX,
      fixtures: fixtures.map(({ id, role, file, sha256, size_bytes, snapshot_id, total_rows }) => ({
        id, role, file, sha256, size_bytes, snapshot_id, total_rows,
      })),
      flows,
    };
    validatePhase11Evidence(evidence, {
      identity: evidence.identity,
      sqliteBackstop,
      flows: snapshotFlows(),
    });
  } catch (error) {
    primaryError = error;
  } finally {
    if (primaryError === undefined && evidence !== undefined) {
      rmSync(options.reportDirectory, { recursive: true, force: true });
      mkdirSync(path.dirname(options.reportDirectory), { recursive: true });
      renameSync(temporaryDirectory, options.reportDirectory);
      const temporaryOutput = `${options.output}.tmp`;
      writeFileSync(temporaryOutput, `${JSON.stringify(evidence, null, 2)}\n`);
      renameSync(temporaryOutput, options.output);
    } else {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  if (primaryError !== undefined) throw primaryError;
  return evidence;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const evidence = executePhase11Maestro();
    process.stdout.write(`${JSON.stringify({ ok: true, flows: evidence.flows.length, sqlite_cases: evidence.sqlite_backstop.expected_count })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: "phase11_maestro_failed", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
