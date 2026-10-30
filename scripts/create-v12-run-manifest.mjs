import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sourceTreeSha256AtHead, assertCleanCommittedTree } from "./source-tree-digest.mjs";

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

export function createV12RunId(createdAt, head) {
  assertTimestamp(createdAt);
  if (typeof head !== "string" || !HEAD.test(head)) fail("source_invalid");
  return `phase20-${createdAt.replaceAll(/[-:]/gu, "")}-${head.slice(0, 12)}`;
}

function normalizeSource(value) {
  if (!exactKeys(value, ["head", "tree_sha256", "dirty", "package_json_sha256", "package_lock_sha256"])
    || typeof value.head !== "string" || !HEAD.test(value.head) || value.dirty !== false) fail("source_invalid");
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
  if (!exactKeys(value, expectedKeys) || value.profile !== "development-test" || typeof value.package !== "string" || !PACKAGE.test(value.package)
    || typeof value.version_name !== "string" || !VERSION.test(value.version_name) || !Number.isSafeInteger(value.version_code) || value.version_code < 1) {
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
  if (!exactKeys(value, ["id"]) || typeof value.id !== "string" || !CONFIG.test(value.id)) fail("live_identity_invalid");
  return { ...value };
}

function expectedRunId(createdAt, source) {
  return createV12RunId(createdAt, source.head);
}

function normalizeInput(input) {
  if (!isPlainObject(input)) fail("input_invalid");
  const mode = input.mode ?? "live";
  const hasEvidenceOrigin = Object.hasOwn(input, "evidence_origin");
  const evidenceOrigin = input.evidence_origin ?? "native";
  if (!new Set(["native", "test"]).has(evidenceOrigin)) fail("origin_invalid");
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
    ...(hasEvidenceOrigin ? { evidence_origin: evidenceOrigin } : {}),
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
  try { input = snapshotManifestValue(input); } catch { fail("canonical_invalid"); }
  if (input?.evidence_origin === "test") fail("origin_invalid");
  const manifest = normalizeInput(input);
  if (!Array.isArray(existing_run_ids) || existing_run_ids.some((runId) => typeof runId !== "string")) fail("run_registry_invalid");
  if (existing_run_ids.includes(manifest.run_id)) fail("run_reuse");
  if (output_exists !== false) fail("output_exists");
  return deepFreeze(manifest);
}

function snapshotManifestValue(value, snapshots = new WeakMap()) {
  if (value === null || typeof value !== "object") return value;
  if (snapshots.has(value)) return snapshots.get(value);
  const snapshot = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  snapshots.set(value, snapshot);
  for (const key of Object.keys(value)) {
    Object.defineProperty(snapshot, key, {
      value: snapshotManifestValue(value[key], snapshots), enumerable: true, configurable: true, writable: true,
    });
  }
  return snapshot;
}

export function validateV12RunManifest(manifest) {
  if (!isPlainObject(manifest)) fail("exact_keys_invalid");
  try { manifest = snapshotManifestValue(manifest); } catch { fail("canonical_invalid"); }
  const live = manifest.mode === "live";
  const expectedKeys = live
    ? ["schema_version", "run_id", "mode", ...(Object.hasOwn(manifest, "evidence_origin") ? ["evidence_origin"] : []), "created_at", "source", "planning", "prototype", "fixtures", "build", "device", "configuration"]
    : ["schema_version", "run_id", "mode", ...(Object.hasOwn(manifest, "evidence_origin") ? ["evidence_origin"] : []), "created_at", "source", "planning", "prototype", "fixtures", "build"];
  if (!exactKeys(manifest, expectedKeys) || manifest.schema_version !== 1 || typeof manifest.run_id !== "string" || !RUN_ID.test(manifest.run_id)) fail("exact_keys_invalid");
  const normalized = normalizeInput(manifest);
  let canonical;
  try { canonical = normalized.run_id === manifest.run_id && JSON.stringify(normalized) === JSON.stringify(manifest); }
  catch { fail("canonical_invalid"); }
  if (!canonical) fail("canonical_invalid");
  return deepFreeze(manifest);
}

export function parseV12RunManifestCliArgs(args) {
  if (Array.isArray(args) && args.length === 2 && args[0] === "--from-build" && args[1] === "--create") {
    return Object.freeze({ mode: "create" });
  }
  if (Array.isArray(args) && args.length === 3 && args[0] === "--run" && typeof args[1] === "string" && RUN_ID.test(args[1]) && args[2] === "--verify-build-only") {
    return Object.freeze({ mode: "verify", runId: args[1] });
  }
  fail("cli_invalid");
}

function hashFile(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`) || !existsSync(resolved)) fail("input_missing");
  return createHash("sha256").update(readFileSync(resolved)).digest("hex");
}

function readJson(root, relativePath) {
  try { return JSON.parse(readFileSync(path.resolve(root, relativePath), "utf8")); } catch { fail("input_invalid"); }
}

export function executeV12RunManifestCli(args, { root = process.cwd(), now = () => new Date() } = {}) {
  const options = parseV12RunManifestCliArgs(args);
  const projectRoot = path.resolve(root);
  if (options.mode === "verify") {
    const relativePath = `artifacts/native/v1.2/${options.runId}/build.json`;
    const manifest = readJson(projectRoot, relativePath);
    if (validateV12RunManifest(manifest).run_id !== options.runId) fail("run_id_invalid");
    return manifest;
  }
  const buildManifest = readJson(projectRoot, "artifacts/native/v1.2-acceptance/build.json");
  const identity = buildManifest.v12_evidence_identity;
  if (buildManifest?.suite !== "v1.2-acceptance" || buildManifest?.profile !== "development-test"
    || buildManifest?.build_variant !== "release" || buildManifest?.package !== "com.fchoo.gymtracker.devtest"
    || !identity || identity.retained_apk_sha256 !== buildManifest?.apk?.sha256
    || identity.installed_apk_sha256 !== buildManifest?.apk?.sha256) fail("build_identity_invalid");
  const head = buildManifest.base_head;
  assertCleanCommittedTree(head, projectRoot);
  if (sourceTreeSha256AtHead(head, projectRoot) !== buildManifest.source_tree_sha256) fail("source_invalid");
  const sourceManifest = readJson(projectRoot, ".planning/design/v1.2-browser-evidence/source-manifest.json");
  const sources = sourceManifest.sources;
  if (!Array.isArray(sources) || sourceManifest.revision !== 18 || sources.length < 2) fail("input_invalid");
  const createdAt = now().toISOString().replace(/\.\d{3}Z$/u, "Z");
  const input = {
    created_at: createdAt,
    evidence_origin: "native",
    source: { head, tree_sha256: buildManifest.source_tree_sha256, dirty: false, package_json_sha256: hashFile(projectRoot, "package.json"), package_lock_sha256: hashFile(projectRoot, "package-lock.json") },
    planning: { matrix_sha256: hashFile(projectRoot, ".planning/design/v1.2-prototype-parity-matrix.json"), requirements_sha256: hashFile(projectRoot, ".planning/REQUIREMENTS.md"), source_manifest_sha256: hashFile(projectRoot, ".planning/design/v1.2-browser-evidence/source-manifest.json"), owner_brief_sha256: hashFile(projectRoot, ".planning/v1.2-OWNER-BRIEF.md"), ui_spec_sha256: hashFile(projectRoot, ".planning/phases/20-native-acceptance/20-UI-SPEC.md"), deviations_sha256: hashFile(projectRoot, ".planning/design/v1.2-DEVIATIONS.md") },
    prototype: { revision: 18, approval_sha256: sources[0]?.sha256, html_sha256: sources[1]?.sha256 },
    fixtures: { registry_sha256: hashFile(projectRoot, ".planning/design/v1.2-browser-evidence/serial-walk.json") },
    build: { profile: "development-test", package: buildManifest.package, version_name: "0.1.0", version_code: 1, apk: { path: buildManifest.apk.path, sha256: buildManifest.apk.sha256, size_bytes: buildManifest.apk.size_bytes, page_alignment_verified: buildManifest.apk.page_alignment_verified, signature_sha256: identity.signature_sha256, certificate_sha256: identity.certificate_sha256 } },
    device: { identity_sha256: identity.device_identity_sha256, abi: buildManifest.device.abi, installed_apk_sha256: identity.installed_apk_sha256, settings_sha256: identity.settings_sha256, restoration_sha256: identity.restoration_sha256 },
    configuration: { id: "AP-SL-C390-P-F100" },
  };
  const runDirectory = path.join(projectRoot, "artifacts/native/v1.2", createV12RunManifest({ input }).run_id);
  const output = path.join(runDirectory, "build.json");
  const manifest = createV12RunManifest({ input, existing_run_ids: existsSync(path.join(projectRoot, "artifacts/native/v1.2")) ? [] : [], output_exists: existsSync(output) });
  if (existsSync(runDirectory)) fail("output_exists");
  mkdirSync(runDirectory, { recursive: false });
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return manifest;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${executeV12RunManifestCli(process.argv.slice(2)).run_id}\n`); } catch (error) { console.error(error instanceof Error ? error.message : "v12_run_manifest_cli_failed"); process.exitCode = 1; }
}
