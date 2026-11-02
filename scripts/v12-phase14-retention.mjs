import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { assertV12ArtifactPrivacySafe } from "./v12-artifact-privacy.mjs";
import { createV12ShellRequirementEvidence } from "./v12-shell-requirement-evidence.mjs";

const HASH = /^[a-f0-9]{64}$/u;
const SOURCE_ROOT = "artifacts/native/phase14";
const RETAINED_ROOT = "shell/phase14";
const SOURCE_MANIFEST = `${SOURCE_ROOT}/build.json`;
const SOURCE_EVIDENCE = `${SOURCE_ROOT}/maestro/phase14-evidence.json`;
export const V12_PHASE14_CLOSURE_REGISTRY = `${RETAINED_ROOT}/artifact-registry.json`;
const MAX_MEMBERS = 4_096;
const MAX_MEMBER_BYTES = 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => { throw new Error(`v12_phase14_retention_${code}`); };

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function normalized(value, prefix, code) {
  if (typeof value !== "string" || value.includes("\\") || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value || !value.startsWith(`${prefix}/`)
    || value.split("/").some((part) => !part || part === "." || part === "..")) fail(code);
  return value;
}

function retainedPath(sourcePath) {
  return `${RETAINED_ROOT}/${normalized(sourcePath, SOURCE_ROOT, "source_path_invalid").slice(SOURCE_ROOT.length + 1)}`;
}

function safeFile(root, relative) {
  const projectRoot = realpathSync(path.resolve(root));
  const safe = normalized(relative, SOURCE_ROOT, "source_path_invalid");
  const resolved = path.resolve(projectRoot, safe);
  if (!resolved.startsWith(`${projectRoot}${path.sep}`)) fail("source_path_invalid");
  let cursor = projectRoot;
  for (const part of safe.split("/")) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined) fail("source_missing");
    if (stat.isSymbolicLink()) fail("symlink_forbidden");
  }
  const real = realpathSync(resolved);
  if (!real.startsWith(`${projectRoot}${path.sep}`) || !lstatSync(real).isFile()) fail("source_invalid");
  return real;
}

function bounded(bytes, code = "member_invalid") {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_MEMBER_BYTES) fail(code);
  return bytes;
}

function parseJson(bytes, expected, code) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(code); }
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(code);
}

function defaultRead(root, relative) {
  return readFileSync(safeFile(root, relative));
}

function registryFromMembers(members) {
  const sorted = [...members].sort((left, right) => left.source_path.localeCompare(right.source_path));
  return Object.freeze({
    schema_version: 1,
    producer: "v12-retained-phase14-closure/v1",
    source_root: SOURCE_ROOT,
    retained_root: RETAINED_ROOT,
    manifest: retainedPath(SOURCE_MANIFEST),
    evidence: retainedPath(SOURCE_EVIDENCE),
    member_count: sorted.length,
    total_size_bytes: sorted.reduce((total, member) => total + member.size_bytes, 0),
    members: Object.freeze(sorted.map(({ bytes: _bytes, ...member }) => Object.freeze(member))),
  });
}

export function createV12RetainedPhase14Closure({ root = process.cwd(), phase14Manifest, phase14Evidence, manifest,
  validationOptions = {} } = {}) {
  const customValidator = typeof validationOptions.validatePhase14Evidence === "function";
  const suppliedReader = validationOptions.readArtifact;
  const members = new Map();
  let total = 0;
  const collect = (sourcePath, fallback) => {
    const safe = normalized(sourcePath, SOURCE_ROOT, "source_path_invalid");
    if (members.has(safe)) return members.get(safe).bytes;
    let bytes;
    try { bytes = bounded(Buffer.from((suppliedReader ?? ((item) => defaultRead(root, item)))(safe))); }
    catch (error) {
      if (fallback === undefined || !customValidator || error?.message !== "v12_phase14_retention_source_missing") throw error;
      bytes = bounded(Buffer.isBuffer(fallback) ? fallback : Buffer.from(`${JSON.stringify(fallback)}\n`));
    }
    const retained = retainedPath(safe);
    assertV12ArtifactPrivacySafe(retained, bytes);
    total += bytes.length;
    if (members.size >= MAX_MEMBERS || total > MAX_TOTAL_BYTES) fail("bounds_invalid");
    const member = Object.freeze({ source_path: safe, path: retained, sha256: sha256(bytes), size_bytes: bytes.length, bytes });
    members.set(safe, member);
    return bytes;
  };
  parseJson(collect(SOURCE_MANIFEST, phase14Manifest), phase14Manifest, "manifest_invalid");
  parseJson(collect(SOURCE_EVIDENCE, phase14Evidence), phase14Evidence, "evidence_invalid");
  let apk;
  try { apk = collect(phase14Manifest?.apk?.path); }
  catch (error) { if (!customValidator || error?.message !== "v12_phase14_retention_source_missing") throw error; }
  if (apk !== undefined && (sha256(apk) !== phase14Manifest.apk.sha256
    || (phase14Manifest.apk.size_bytes !== undefined && apk.length !== phase14Manifest.apk.size_bytes))) fail("apk_invalid");
  const receipts = createV12ShellRequirementEvidence(phase14Evidence, phase14Manifest, manifest, {
    ...validationOptions,
    root,
    readArtifact: (artifactPath) => collect(artifactPath),
  });
  const retainedMembers = [...members.values()];
  const registry = registryFromMembers(retainedMembers);
  validateV12Phase14ClosureRegistry(registry);
  return Object.freeze({ receipts, registry, members: Object.freeze(retainedMembers) });
}

export function validateV12Phase14ClosureRegistry(registry) {
  if (!exact(registry, ["schema_version", "producer", "source_root", "retained_root", "manifest", "evidence", "member_count", "total_size_bytes", "members"])
    || registry.schema_version !== 1 || registry.producer !== "v12-retained-phase14-closure/v1"
    || registry.source_root !== SOURCE_ROOT || registry.retained_root !== RETAINED_ROOT
    || registry.manifest !== retainedPath(SOURCE_MANIFEST) || registry.evidence !== retainedPath(SOURCE_EVIDENCE)
    || !Array.isArray(registry.members) || registry.members.length < 2 || registry.members.length > MAX_MEMBERS
    || registry.member_count !== registry.members.length || !Number.isSafeInteger(registry.total_size_bytes)
    || registry.total_size_bytes < 1 || registry.total_size_bytes > MAX_TOTAL_BYTES) fail("registry_invalid");
  let total = 0; const sources = new Set(); const retained = new Set();
  for (const member of registry.members) {
    if (!exact(member, ["source_path", "path", "sha256", "size_bytes"])
      || member.path !== retainedPath(member.source_path) || !HASH.test(member.sha256 ?? "")
      || !Number.isSafeInteger(member.size_bytes) || member.size_bytes < 1 || member.size_bytes > MAX_MEMBER_BYTES
      || sources.has(member.source_path) || retained.has(member.path)) fail("registry_invalid");
    sources.add(member.source_path); retained.add(member.path); total += member.size_bytes;
  }
  if (!sources.has(SOURCE_MANIFEST) || !sources.has(SOURCE_EVIDENCE)
    || total !== registry.total_size_bytes) fail("registry_invalid");
  return true;
}

export function verifyV12RetainedPhase14Closure({ registry, readArtifact, manifest, shellReceipts,
  validationOptions = {} } = {}) {
  validateV12Phase14ClosureRegistry(registry);
  if (typeof readArtifact !== "function") fail("reader_invalid");
  const bySource = new Map();
  for (const member of registry.members) {
    const bytes = bounded(Buffer.from(readArtifact(member.path)));
    assertV12ArtifactPrivacySafe(member.path, bytes);
    if (bytes.length !== member.size_bytes || sha256(bytes) !== member.sha256) fail("member_invalid");
    bySource.set(member.source_path, bytes);
  }
  let phase14Manifest; let phase14Evidence;
  try {
    phase14Manifest = JSON.parse(bySource.get(SOURCE_MANIFEST).toString("utf8"));
    phase14Evidence = JSON.parse(bySource.get(SOURCE_EVIDENCE).toString("utf8"));
  } catch { fail("index_invalid"); }
  const expected = createV12ShellRequirementEvidence(phase14Evidence, phase14Manifest, manifest, {
    ...validationOptions,
    readArtifact: (sourcePath) => {
      const bytes = bySource.get(normalized(sourcePath, SOURCE_ROOT, "source_path_invalid"));
      if (bytes === undefined) fail("member_missing");
      return bytes;
    },
  });
  if (JSON.stringify(shellReceipts) !== JSON.stringify(expected)) fail("receipt_invalid");
  return Object.freeze({ phase14Manifest, phase14Evidence });
}

export function expectedV12AccessibilityMembers(registry) {
  validateV12Phase14ClosureRegistry(registry);
  return Object.freeze(["semantics/accessibility.json", "geometry/hit-targets.json", V12_PHASE14_CLOSURE_REGISTRY,
    ...registry.members.map(({ path: retained }) => retained)]);
}
