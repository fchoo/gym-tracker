const SHA256 = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const PACKAGE = /^com\.fchoo\.gymtracker\.devtest$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const CONFIG = /^AP-(?:L|D|SL|SD)-(?:C360|C390|M600|X840)-(?:P|L)-(?:F100|F200)$/u;
const MAX_APK_BYTES = 1024 * 1024 * 1024;

function fail(code) {
  throw new Error(`v12_run_manifest_${code}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function assertHash(value, code) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
}

function assertSafeRelativePath(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 || value.startsWith("/")
    || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("safe_path_invalid");
  }
}

function assertTimestamp(value) {
  if (typeof value !== "string" || !UTC.test(value) || Number.isNaN(Date.parse(value))) fail("timestamp_invalid");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function createRunId(createdAt, head) {
  assertTimestamp(createdAt);
  if (!HEAD.test(head ?? "")) fail("source_invalid");
  return `phase20-${createdAt.replaceAll(/[-:]/gu, "").replace(".000", "")}-${head.slice(0, 12)}`;
}

function normalizeSource(value) {
  if (!exactKeys(value, ["head", "tree_sha256", "dirty", "package_json_sha256", "package_lock_sha256"])
    || !HEAD.test(value.head ?? "") || value.dirty !== false) fail("source_invalid");
  assertHash(value.tree_sha256, "source_invalid");
  assertHash(value.package_json_sha256, "source_invalid");
  assertHash(value.package_lock_sha256, "source_invalid");
  return { ...value };
}

function normalizePlanning(value) {
  const keys = ["matrix_sha256", "requirements_sha256", "source_manifest_sha256", "owner_brief_sha256", "ui_spec_sha256", "deviations_sha256"];
  if (!exactKeys(value, keys)) fail("planning_invalid");
  for (const key of keys) assertHash(value[key], "planning_invalid");
  return { ...value };
}

function normalizePrototype(value) {
  if (!exactKeys(value, ["revision", "approval_sha256", "html_sha256"]) || value.revision !== 18) fail("prototype_invalid");
  assertHash(value.approval_sha256, "prototype_invalid");
  assertHash(value.html_sha256, "prototype_invalid");
  return { ...value };
}

function normalizeFixtures(value) {
  if (!exactKeys(value, ["registry_sha256"])) fail("fixtures_invalid");
  assertHash(value.registry_sha256, "fixtures_invalid");
  return { ...value };
}

function normalizeBuild(value, live) {
  const expectedKeys = live ? ["profile", "package", "version_name", "version_code", "apk"] : ["profile", "package", "version_name", "version_code"];
  if (!exactKeys(value, expectedKeys) || value.profile !== "development-test" || !PACKAGE.test(value.package ?? "")
    || !VERSION.test(value.version_name ?? "") || !Number.isSafeInteger(value.version_code) || value.version_code < 1) {
    fail(live ? "live_identity_invalid" : "build_invalid");
  }
  if (!live) return { ...value };
  const apk = value.apk;
  if (!exactKeys(apk, ["path", "sha256", "size_bytes", "page_alignment_verified", "signature_sha256", "certificate_sha256"])) fail("live_identity_invalid");
  assertSafeRelativePath(apk.path);
  if (!apk.path.startsWith("artifacts/native/v1.2-acceptance/") || !apk.path.endsWith(".apk")
    || !Number.isSafeInteger(apk.size_bytes) || apk.size_bytes < 1 || apk.size_bytes > MAX_APK_BYTES
    || apk.page_alignment_verified !== true) fail("live_identity_invalid");
  for (const key of ["sha256", "signature_sha256", "certificate_sha256"]) assertHash(apk[key], "live_identity_invalid");
  return { ...value, apk: { ...apk } };
}

function normalizeDevice(value, apkSha256) {
  if (!exactKeys(value, ["identity_sha256", "abi", "installed_apk_sha256", "settings_sha256", "restoration_sha256"])
    || value.abi !== "arm64-v8a") fail("live_identity_invalid");
  for (const key of ["identity_sha256", "installed_apk_sha256", "settings_sha256", "restoration_sha256"]) assertHash(value[key], "live_identity_invalid");
  if (value.installed_apk_sha256 !== apkSha256) fail("live_identity_invalid");
  return { ...value };
}

function normalizeConfiguration(value) {
  if (!exactKeys(value, ["id"]) || !CONFIG.test(value.id ?? "")) fail("live_identity_invalid");
  return { ...value };
}

function expectedRunId(createdAt, source) {
  return createRunId(createdAt, source.head);
}

function normalizeInput(input) {
  if (!isPlainObject(input)) fail("input_invalid");
  const mode = input.mode ?? "live";
  if (mode !== "live" && mode !== "prebuild_schema_fixture") fail("mode_invalid");
  assertTimestamp(input.created_at);
  const source = normalizeSource(input.source);
  const expected = expectedRunId(input.created_at, source);
  if (input.requested_run_id !== undefined && input.requested_run_id !== expected) fail("run_id_invalid");
  const build = normalizeBuild(input.build, mode === "live");
  const output = {
    schema_version: 1,
    run_id: expected,
    mode,
    created_at: input.created_at,
    source,
    planning: normalizePlanning(input.planning),
    prototype: normalizePrototype(input.prototype),
    fixtures: normalizeFixtures(input.fixtures),
    build,
  };
  if (mode === "live") {
    output.device = normalizeDevice(input.device, build.apk.sha256);
    output.configuration = normalizeConfiguration(input.configuration);
  } else if (input.device !== undefined || input.configuration !== undefined) {
    fail("prebuild_identity_invalid");
  }
  return output;
}

export function createV12RunManifest({ input, existing_run_ids = [], output_exists = false } = {}) {
  const manifest = normalizeInput(input);
  if (!Array.isArray(existing_run_ids) || existing_run_ids.some((runId) => typeof runId !== "string")) fail("run_registry_invalid");
  if (existing_run_ids.includes(manifest.run_id)) fail("run_reuse");
  if (output_exists !== false) fail("output_exists");
  return deepFreeze(manifest);
}

export function validateV12RunManifest(manifest) {
  if (!isPlainObject(manifest)) fail("exact_keys_invalid");
  const live = manifest.mode === "live";
  const expectedKeys = live
    ? ["schema_version", "run_id", "mode", "created_at", "source", "planning", "prototype", "fixtures", "build", "device", "configuration"]
    : ["schema_version", "run_id", "mode", "created_at", "source", "planning", "prototype", "fixtures", "build"];
  if (!exactKeys(manifest, expectedKeys) || manifest.schema_version !== 1 || !RUN_ID.test(manifest.run_id ?? "")) fail("exact_keys_invalid");
  const normalized = normalizeInput(manifest);
  if (normalized.run_id !== manifest.run_id || JSON.stringify(normalized) !== JSON.stringify(manifest)) fail("canonical_invalid");
  return deepFreeze(structuredClone(manifest));
}
