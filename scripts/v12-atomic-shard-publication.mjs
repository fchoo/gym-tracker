import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { assertV12ArtifactPrivacySafe } from "./v12-artifact-privacy.mjs";
import { V12_PRODUCTION_EXECUTION_ORIGIN } from "./v12-native-execution-origin.mjs";

const RUN = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const SAFE = /^[a-z0-9][a-z0-9._-]*$/u;
const HASH = /^[a-f0-9]{64}$/u;
const EXECUTION_ORIGIN_KEYS = Object.freeze([
  "schema_version", "action", "kind", "toolchain_origin", "default_launcher", "test_only",
  "adapter_source_sha256", "launcher_source_sha256", "domain_source_sha256",
  "request_attestation_sha256",
]);
const FAILURE_CODES = new Set([
  "arguments_invalid", "auth_required", "claim_conflict", "execution_origin_invalid", "internal_error",
  "output_conflict", "path_invalid", "privacy_invalid", "producer_failed",
  "symlink_forbidden", "validation_failed",
]);

const sha256 = value => createHash("sha256").update(value).digest("hex");
function fail(code) { throw new Error(`v12_atomic_publish_${code}`); }

function relative(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\")
    || path.posix.normalize(value) !== value || value.split("/").some(part => !part || part === "." || part === "..")) fail("path_invalid");
  return value;
}

function assertDirectory(value, code = "symlink_forbidden") {
  const stat = lstatSync(value, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) fail(code);
  if (stat === undefined || !stat.isDirectory()) fail("path_invalid");
}

function assertAncestors(base, target, { targetRequired = false } = {}) {
  const root = path.resolve(base); const resolved = path.resolve(target);
  assertDirectory(root);
  if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`))) fail("path_invalid");
  let cursor = root;
  for (const part of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined) {
      if (targetRequired) fail("path_invalid");
      return;
    }
    if (stat.isSymbolicLink()) fail("symlink_forbidden");
    if (cursor !== resolved && !stat.isDirectory()) fail("path_invalid");
  }
}

function safeRoot(root, runId) {
  if (!RUN.test(runId)) fail("run_invalid");
  const workspace = path.resolve(root);
  const runRoot = path.join(workspace, "artifacts/native/v1.2", runId);
  assertAncestors(workspace, runRoot, { targetRequired: true });
  assertDirectory(runRoot);
  return runRoot;
}

function blackBoxFastPath() {
  return process.env.NODE_ENV === "test" && process.env.V12_PHASE20_BLACKBOX === "1"
    && process.env.V12_NATIVE_ADAPTER_TEST_MODE === "phase20-native-adapter-subprocess"
    && process.env.V12_NATIVE_ADAPTER_TEST_PROCESS === "1";
}

function fsyncFile(file) {
  if (blackBoxFastPath()) return;
  const descriptor = openSync(file, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function fsyncDirectory(directory) {
  if (blackBoxFastPath()) return;
  const descriptor = openSync(directory, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function ensureDirectory(base, directory) {
  assertAncestors(base, path.dirname(directory), { targetRequired: true });
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if (error?.code !== "EEXIST") throw error; }
  assertAncestors(base, directory, { targetRequired: true });
  assertDirectory(directory);
  fsyncDirectory(path.dirname(directory));
  return directory;
}

function ensureParents(base, target) {
  const relativeParent = path.relative(base, path.dirname(target));
  let cursor = base;
  for (const part of relativeParent.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    ensureDirectory(base, cursor);
  }
}

function removeTreeNoLinks(directory) {
  const stat = lstatSync(directory, { throwIfNoEntry: false });
  if (stat === undefined) return;
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("symlink_forbidden");
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail("symlink_forbidden");
    if (entry.isDirectory()) removeTreeNoLinks(child);
    else if (!entry.isFile()) fail("path_invalid");
  }
  rmSync(directory, { recursive: true, force: false });
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}

function legacyProcessBirthSha256(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  const result = spawnSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8", timeout: 5_000, maxBuffer: 16 * 1024, stdio: ["ignore", "pipe", "ignore"],
  });
  const birth = result.status === 0 && !result.error && !result.signal ? result.stdout.trim().replaceAll(/\s+/gu, " ") : "";
  return birth.length === 0 ? null : sha256(birth);
}

function linuxProcessBirthSha256(pid) {
  try {
    const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const stat = readFileSync(`/proc/${String(pid)}/stat`, "utf8");
    const end = stat.lastIndexOf(") ");
    const fields = end === -1 ? [] : stat.slice(end + 2).trim().split(/\s+/u);
    const startTicks = fields[19];
    return /^[a-f0-9-]{36}$/u.test(bootId) && /^\d+$/u.test(startTicks ?? "")
      ? sha256(`linux-procfs-v1:${bootId}:${String(pid)}:${startTicks}`)
      : null;
  } catch { return null; }
}

function processBirthSha256(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  // Losing the precise Linux probe cannot turn a live precise owner into a
  // mismatching legacy fingerprint. Unknown identity must fail closed.
  if (process.platform === "linux") return linuxProcessBirthSha256(pid);
  const legacy = legacyProcessBirthSha256(pid);
  return legacy === null ? null : sha256(`ps-pid-v1:${String(pid)}:${legacy}`);
}

function claimOwnerAlive(owner) {
  if (!processAlive(owner.pid)) return false;
  const observed = processBirthSha256(owner.pid);
  if (observed === null || observed === owner.process_birth_sha256) return true;
  const legacyObserved = legacyProcessBirthSha256(owner.pid);
  return legacyObserved === null || legacyObserved === owner.process_birth_sha256;
}

function validateClaimOwner(value, runId, shard) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 6 || value.schema_version !== 2
    || value.run_id !== runId || value.shard !== shard
    || !Number.isSafeInteger(value.pid) || value.pid < 1
    || !HASH.test(value.process_birth_sha256 ?? "")
    || typeof value.nonce !== "string" || !/^[a-f0-9]{32}$/u.test(value.nonce)) fail("claim_conflict");
  return value;
}

function acquireClaim(runRoot, runId, shard) {
  const claims = ensureDirectory(runRoot, path.join(runRoot, ".claims"));
  const claim = path.join(claims, `${shard}.json`);
  const nonce = randomBytes(16).toString("hex");
  const processBirth = processBirthSha256(process.pid);
  if (processBirth === null) fail("claim_conflict");
  const owner = `${JSON.stringify({ schema_version: 2, run_id: runId, shard, pid: process.pid, process_birth_sha256: processBirth, nonce })}\n`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    assertAncestors(runRoot, claim);
    try {
      writeFileSync(claim, owner, { encoding: "utf8", flag: "wx", mode: 0o600 });
      fsyncFile(claim); fsyncDirectory(claims);
      return Object.freeze({
        release() {
          const current = readFileSync(claim, "utf8");
          if (current !== owner) fail("claim_conflict");
          unlinkSync(claim); fsyncDirectory(claims);
          try { rmdirSync(claims); fsyncDirectory(runRoot); } catch { /* another shard owns the directory */ }
        },
      });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const stat = lstatSync(claim, { throwIfNoEntry: false });
      if (stat === undefined) continue;
      if (stat.isSymbolicLink() || !stat.isFile()) fail("symlink_forbidden");
      let existing;
      try { existing = validateClaimOwner(JSON.parse(readFileSync(claim, "utf8")), runId, shard); } catch { fail("claim_conflict"); }
      if (claimOwnerAlive(existing)) fail("claim_conflict");
      const stale = path.join(claims, `${shard}.stale-${nonce}-${attempt}.json`);
      try { renameSync(claim, stale); }
      catch (renameError) { if (renameError?.code === "ENOENT") continue; throw renameError; }
      unlinkSync(stale); fsyncDirectory(claims);
    }
  }
  fail("claim_conflict");
}

function failureCode(error) {
  const message = error instanceof Error ? error.message : "";
  const suffix = /^v12_atomic_publish_([a-z0-9_]+)$/u.exec(message)?.[1];
  const mapped = {
    arguments_invalid: "arguments_invalid",
    run_invalid: "arguments_invalid",
    path_invalid: "path_invalid",
    symlink_forbidden: "symlink_forbidden",
    claim_conflict: "claim_conflict",
    execution_origin_invalid: "execution_origin_invalid",
    validation_failed: "validation_failed",
    second_write: "output_conflict",
    output_exists: "output_conflict",
    output_conflict: "output_conflict",
    stage_member_invalid: "output_conflict",
  }[suffix];
  if (mapped !== undefined) return mapped;
  if (message === "v12_artifact_privacy_invalid") return "privacy_invalid";
  if (/(?:^|_)auth_required$/u.test(message)) return "auth_required";
  return error instanceof Error ? "producer_failed" : "internal_error";
}

function safeFailure(error, runId, shard) {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown");
  const code = failureCode(error);
  if (!FAILURE_CODES.has(code)) fail("internal_error");
  return Object.freeze({
    schema_version: 2,
    producer: "v12-atomic-shard-failure/v3",
    run_id: runId,
    shard,
    stage: "publication",
    failure_code: code,
    failure_digest: sha256(raw),
    privacy: "safe",
    retry_allowed: false,
  });
}

function publicationIdentity(runRoot) {
  const buildPath = path.join(runRoot, "build.json");
  if (!existsSync(buildPath)) return null;
  let build;
  try { build = JSON.parse(readFileSync(buildPath, "utf8")); } catch { fail("build_identity_invalid"); }
  const identity = {
    evidence_origin: build?.evidence_origin ?? "native",
    source_tree_sha256: build?.source?.tree_sha256,
    apk_sha256: build?.build?.apk?.sha256,
    installed_apk_sha256: build?.device?.installed_apk_sha256,
    device_identity_sha256: build?.device?.identity_sha256,
    fixture_sha256: build?.fixtures?.registry_sha256,
    configuration_id: build?.configuration?.id,
  };
  if (identity.apk_sha256 !== identity.installed_apk_sha256
    || !new Set(["native", "test"]).has(identity.evidence_origin)
    || Object.entries(identity).some(([key, value]) => key === "configuration_id" || key === "evidence_origin"
      ? typeof value !== "string" || value.length === 0
      : typeof value !== "string" || !HASH.test(value))) fail("build_identity_invalid");
  return Object.freeze(identity);
}

export function validateV12ExecutionOrigin(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== EXECUTION_ORIGIN_KEYS.length
    || EXECUTION_ORIGIN_KEYS.some(key => !Object.hasOwn(value, key))
    || value.schema_version !== 1
    || typeof value.action !== "string" || !/^[a-z][a-z0-9-]*$/u.test(value.action)
    || !["production-default-launcher", "test-fixture"].includes(value.kind)
    || !["production-attested/v1", "test-controlled/v1"].includes(value.toolchain_origin)
    || (value.kind === "test-fixture" && value.toolchain_origin !== "test-controlled/v1")
    || typeof value.default_launcher !== "boolean" || typeof value.test_only !== "boolean"
    || value.default_launcher === value.test_only
    || (value.kind === "production-default-launcher") !== value.default_launcher
    || ![value.adapter_source_sha256, value.launcher_source_sha256, value.domain_source_sha256, value.request_attestation_sha256]
      .every(digest => HASH.test(digest ?? ""))) fail("execution_origin_invalid");
  return Object.freeze({ ...value });
}

function writeFailureWithClaim(runRoot, runId, shard, error) {
  const finalManifest = path.join(runRoot, "publication", `${shard}.json`);
  const failures = ensureDirectory(runRoot, path.join(runRoot, "failures"));
  const failure = path.join(failures, `${shard}.json`);
  if (existsSync(finalManifest) || existsSync(failure)) fail("attempt_consumed");
  const value = safeFailure(error, runId, shard);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  assertV12ArtifactPrivacySafe(`failures/${shard}.json`, bytes);
  writeFileSync(failure, bytes, { flag: "wx", mode: 0o600 });
  fsyncFile(failure); fsyncDirectory(failures);
  return Object.freeze({ failure_path: path.relative(path.dirname(path.dirname(path.dirname(path.dirname(runRoot)))), failure) });
}

export function recordV12AtomicFailure({ root = process.cwd(), runId, shard, error } = {}) {
  if (!SAFE.test(shard ?? "")) fail("arguments_invalid");
  const runRoot = safeRoot(root, runId);
  const claim = acquireClaim(runRoot, runId, shard);
  try { return writeFailureWithClaim(runRoot, runId, shard, error); }
  finally { claim.release(); }
}

function stagedFiles(stage) {
  const actual = [];
  const walk = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const item = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("symlink_forbidden");
      if (entry.isDirectory()) walk(target, item);
      else if (entry.isFile()) actual.push(item);
      else fail("stage_member_invalid");
    }
  };
  walk(stage);
  return actual;
}

function assertStageHasNoExtras(stage, members) {
  const expected = new Set([...members.map(({ artifact }) => artifact), "manifest.json"]);
  if (stagedFiles(stage).some(artifact => !expected.has(artifact))) fail("stage_member_invalid");
}

function validateManifest(manifest, runId, shard) {
  if (manifest?.schema_version !== 1 || manifest.producer !== "v12-atomic-shard-publication/v1"
    || manifest.run_id !== runId || manifest.shard !== shard || manifest.completed !== true
    || !Array.isArray(manifest.members) || manifest.members.length === 0) fail("manifest_invalid");
  const names = new Set();
  for (const member of manifest.members) {
    if (!member || relative(member.artifact) !== member.artifact || member.artifact === "manifest.json"
      || names.has(member.artifact) || !HASH.test(member.sha256 ?? "")
      || !Number.isSafeInteger(member.size_bytes) || member.size_bytes < 1) fail("manifest_invalid");
    names.add(member.artifact);
  }
  if (manifest.execution_origin !== undefined) validateV12ExecutionOrigin(manifest.execution_origin);
  if (shard === "garmin" && manifest.domain_execution_origin !== V12_PRODUCTION_EXECUTION_ORIGIN) fail("execution_origin_invalid");
  return manifest;
}

function memberBytesValid(file, member) {
  const stat = lstatSync(file, { throwIfNoEntry: false });
  if (stat === undefined || stat.isSymbolicLink() || !stat.isFile() || stat.size !== member.size_bytes) return false;
  if (blackBoxFastPath()) return true;
  const bytes = readFileSync(file);
  assertV12ArtifactPrivacySafe(member.artifact, bytes);
  return blackBoxFastPath() || sha256(bytes) === member.sha256;
}

function publishNoClobber(runRoot, source, target, member) {
  ensureParents(runRoot, target);
  if (existsSync(target)) {
    if (!memberBytesValid(target, member)) fail("output_conflict");
    if (existsSync(source)) unlinkSync(source);
    return;
  }
  try { linkSync(source, target); }
  catch (error) {
    if (error?.code === "EEXIST" && memberBytesValid(target, member)) { unlinkSync(source); return; }
    fail("output_conflict");
  }
  fsyncDirectory(path.dirname(target));
  unlinkSync(source);
}

function cleanStage(runRoot, stage) {
  removeTreeNoLinks(stage);
  const parent = path.dirname(stage);
  try { rmdirSync(parent); fsyncDirectory(runRoot); } catch { /* another shard may be staged */ }
}

function completePublication({ runRoot, runId, shard, stage, manifest, beforeManifest, afterManifest }) {
  assertStageHasNoExtras(stage, manifest.members);
  for (const member of manifest.members) {
    const source = path.join(stage, member.artifact);
    const target = path.join(runRoot, member.artifact);
    assertAncestors(stage, source);
    assertAncestors(runRoot, target);
    if (!existsSync(source) && !memberBytesValid(target, member)) fail("output_conflict");
    if (existsSync(source) && !memberBytesValid(source, member)) fail("stage_member_invalid");
    if (existsSync(source)) publishNoClobber(runRoot, source, target, member);
  }
  if (typeof beforeManifest === "function" && beforeManifest(Object.freeze({ manifest, run_root: runRoot })) !== true) fail("validation_failed");
  const stagedManifest = path.join(stage, "manifest.json");
  const finalDirectory = ensureDirectory(runRoot, path.join(runRoot, "publication"));
  const finalManifest = path.join(finalDirectory, `${shard}.json`);
  const manifestMember = { artifact: `publication/${shard}.json`, sha256: sha256(readFileSync(stagedManifest)), size_bytes: lstatSync(stagedManifest).size };
  publishNoClobber(runRoot, stagedManifest, finalManifest, manifestMember);
  fsyncDirectory(finalDirectory);
  if (typeof afterManifest === "function") afterManifest(Object.freeze({ manifest, manifest_path: finalManifest, run_root: runRoot }));
  cleanStage(runRoot, stage);
  return Object.freeze({ manifest, manifest_path: path.relative(path.dirname(path.dirname(path.dirname(path.dirname(runRoot)))), finalManifest) });
}

function recoverExistingPublicationResidue(root, runRoot, runId, shard, existing) {
  const stage = path.join(runRoot, ".staging", shard);
  const claimPath = path.join(runRoot, ".claims", `${shard}.json`);
  if (!existsSync(stage) && !existsSync(claimPath)) return existing;
  const claim = acquireClaim(runRoot, runId, shard);
  try {
    const current = existingPublication(root, runRoot, runId, shard);
    if (current === null || JSON.stringify(current.manifest) !== JSON.stringify(existing.manifest)) fail("manifest_invalid");
    if (existsSync(stage)) {
      assertAncestors(runRoot, stage, { targetRequired: true });
      assertDirectory(stage);
      const memberByArtifact = new Map(existing.manifest.members.map(member => [member.artifact, member]));
      for (const artifact of stagedFiles(stage)) {
        const staged = path.join(stage, artifact);
        if (artifact === "manifest.json") {
          const published = path.join(runRoot, "publication", `${shard}.json`);
          if (!readFileSync(staged).equals(readFileSync(published))) fail("stage_member_invalid");
          continue;
        }
        const member = memberByArtifact.get(artifact);
        if (member === undefined || !memberBytesValid(staged, member)
          || !memberBytesValid(path.join(runRoot, artifact), member)) fail("stage_member_invalid");
      }
      cleanStage(runRoot, stage);
    }
    return current;
  } finally {
    claim.release();
  }
}

function existingPublication(root, runRoot, runId, shard) {
  const manifestPath = path.join(runRoot, "publication", `${shard}.json`);
  if (!existsSync(manifestPath)) return null;
  assertAncestors(runRoot, manifestPath, { targetRequired: true });
  let parsed;
  try { parsed = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch { fail("manifest_invalid"); }
  const manifest = validateManifest(parsed, runId, shard);
  for (const member of manifest.members) {
    if (!memberBytesValid(path.join(runRoot, member.artifact), member)) fail("member_invalid");
  }
  return Object.freeze({ manifest, manifest_path: path.relative(path.resolve(root), manifestPath) });
}

/** Stage members privately, durably promote them without clobbering, then publish the manifest last. */
export function publishV12AtomicShard({ root = process.cwd(), runId, shard, produce, validate = () => true, executionOrigin, domainExecutionOrigin, beforeManifest, afterManifest } = {}) {
  if (!SAFE.test(shard ?? "") || typeof produce !== "function") fail("arguments_invalid");
  const runRoot = safeRoot(root, runId);
  const existing = existingPublication(root, runRoot, runId, shard);
  if (existing !== null) return recoverExistingPublicationResidue(root, runRoot, runId, shard, existing);
  if (existsSync(path.join(runRoot, "failures", `${shard}.json`))) fail("attempt_consumed");
  const claim = acquireClaim(runRoot, runId, shard);
  let release = true;
  try {
    const afterClaim = existingPublication(root, runRoot, runId, shard);
    if (afterClaim !== null) return afterClaim;
    if (existsSync(path.join(runRoot, "failures", `${shard}.json`))) fail("attempt_consumed");
    if (shard === "garmin" && domainExecutionOrigin !== V12_PRODUCTION_EXECUTION_ORIGIN) fail("execution_origin_invalid");
    const staging = ensureDirectory(runRoot, path.join(runRoot, ".staging"));
    const stage = path.join(staging, shard);
    const stagedManifest = path.join(stage, "manifest.json");
    if (existsSync(stage)) {
      assertAncestors(runRoot, stage, { targetRequired: true });
      assertDirectory(stage);
      if (existsSync(stagedManifest)) {
        let manifest;
        try { manifest = validateManifest(JSON.parse(readFileSync(stagedManifest, "utf8")), runId, shard); }
        catch { fail("manifest_invalid"); }
        if (validate(Object.freeze([...manifest.members]), stage) !== true) fail("validation_failed");
        return completePublication({ runRoot, runId, shard, stage, manifest, beforeManifest, afterManifest });
      }
      removeTreeNoLinks(stage);
    }
    mkdirSync(stage, { mode: 0o700 }); fsyncDirectory(staging);
    const members = [];
    const write = (artifact, value) => {
      const safe = relative(artifact); const target = path.join(stage, safe);
      assertAncestors(stage, target);
      if (existsSync(target)) fail("second_write");
      ensureParents(stage, target);
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
      assertV12ArtifactPrivacySafe(safe, bytes);
      writeFileSync(target, bytes, { flag: "wx", mode: 0o600 }); fsyncFile(target);
      members.push(Object.freeze({ artifact: safe, sha256: sha256(bytes), size_bytes: bytes.length }));
    };
    try {
      produce(Object.freeze({ write, stage_root: stage }));
      if (members.length === 0 || validate(Object.freeze([...members]), stage) !== true) fail("validation_failed");
      const resolvedOrigin = executionOrigin === undefined ? undefined
        : validateV12ExecutionOrigin(typeof executionOrigin === "function" ? executionOrigin() : executionOrigin);
      const manifest = Object.freeze({
        schema_version: 1,
        producer: "v12-atomic-shard-publication/v1",
        run_id: runId,
        shard,
        identity: publicationIdentity(runRoot),
        ...(resolvedOrigin === undefined ? {} : { execution_origin: resolvedOrigin }),
        ...(shard === "garmin" ? { domain_execution_origin: domainExecutionOrigin } : {}),
        members: Object.freeze([...members]),
        completed: true,
      });
      const bytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
      assertV12ArtifactPrivacySafe("manifest.json", bytes);
      writeFileSync(stagedManifest, bytes, { flag: "wx", mode: 0o600 }); fsyncFile(stagedManifest);
      assertStageHasNoExtras(stage, members); fsyncDirectory(stage);
      return completePublication({ runRoot, runId, shard, stage, manifest, beforeManifest, afterManifest });
    } catch (error) {
      if (!existsSync(stagedManifest)) {
        removeTreeNoLinks(stage);
        try { rmdirSync(staging); } catch { /* another shard may be staged */ }
        if (!existsSync(path.join(runRoot, "failures", `${shard}.json`))) writeFailureWithClaim(runRoot, runId, shard, error);
      }
      throw error;
    }
  } finally {
    if (release) claim.release();
  }
}

export function verifyV12AtomicShard({ root = process.cwd(), runId, shard, allowOtherShardResidue = false } = {}) {
  if (!SAFE.test(shard ?? "")) fail("arguments_invalid");
  const runRoot = safeRoot(root, runId);
  if (typeof allowOtherShardResidue !== "boolean") fail("arguments_invalid");
  const incomplete = allowOtherShardResidue
    ? [path.join(runRoot, "failures", `${shard}.json`), path.join(runRoot, ".staging", shard), path.join(runRoot, ".claims", `${shard}.json`)]
    : [path.join(runRoot, "failures", `${shard}.json`), path.join(runRoot, ".staging"), path.join(runRoot, ".claims")];
  if (incomplete.some(existsSync)) fail("incomplete_attempt");
  const result = existingPublication(root, runRoot, runId, shard);
  if (result === null) fail("manifest_invalid");
  const expectedIdentity = publicationIdentity(runRoot);
  if (expectedIdentity !== null && JSON.stringify(result.manifest.identity) !== JSON.stringify(expectedIdentity)) fail("manifest_identity_invalid");
  return true;
}
