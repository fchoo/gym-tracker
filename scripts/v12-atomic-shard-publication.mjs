import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const SAFE = /^[a-z0-9][a-z0-9._-]*$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function fail(code) { throw new Error(`v12_atomic_publish_${code}`); }
function relative(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\") || path.posix.normalize(value) !== value || value.split("/").some((part) => !part || part === "." || part === "..")) fail("path_invalid");
  return value;
}
function safeRoot(root, runId) {
  if (!RUN.test(runId)) fail("run_invalid");
  return path.join(path.resolve(root), "artifacts/native/v1.2", runId);
}
function noLinks(root, target) {
  const resolved = path.resolve(target); if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`))) fail("path_invalid");
  let cursor = root;
  for (const part of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part); if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) fail("symlink_forbidden");
  }
}
function blackBoxFastPath() {
  return process.env.NODE_ENV === "test" && process.env.V12_PHASE20_BLACKBOX === "1"
    && process.env.V12_NATIVE_ADAPTER_TEST_MODE === "phase20-native-adapter-subprocess"
    && process.env.V12_NATIVE_ADAPTER_TEST_PROCESS === "1";
}
function fsyncFile(file) { if (blackBoxFastPath()) return; const descriptor = openSync(file, "r"); try { fsyncSync(descriptor); } finally { closeSync(descriptor); } }
function fsyncDirectory(directory) { if (blackBoxFastPath()) return; const descriptor = openSync(directory, "r"); try { fsyncSync(descriptor); } finally { closeSync(descriptor); } }
function safeFailure(error, runId, shard) {
  const code = error instanceof Error ? error.message.replace(/[^a-z0-9_-]/giu, "_").slice(0, 96) : "unknown";
  return Object.freeze({ schema_version: 1, producer: "v12-atomic-shard-failure/v2", run_id: runId, shard, stage: "publication", failure_code: code, failure_digest: sha256(`${runId}\n${shard}\n${code}`), identity_sha256: sha256(`${runId}\n${shard}`), privacy: "safe", retry_allowed: false });
}
function publicationIdentity(runRoot) {
  const buildPath = path.join(runRoot, "build.json");
  if (!existsSync(buildPath)) return null;
  let build;
  try { build = JSON.parse(readFileSync(buildPath, "utf8")); } catch { fail("build_identity_invalid"); }
  const identity = {
    source_tree_sha256: build?.source?.tree_sha256,
    apk_sha256: build?.build?.apk?.sha256,
    installed_apk_sha256: build?.device?.installed_apk_sha256,
    device_identity_sha256: build?.device?.identity_sha256,
    fixture_sha256: build?.fixtures?.registry_sha256,
    configuration_id: build?.configuration?.id,
  };
  if (identity.apk_sha256 !== identity.installed_apk_sha256
    || Object.entries(identity).some(([key, value]) => key === "configuration_id"
      ? typeof value !== "string" || value.length === 0
      : typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))) fail("build_identity_invalid");
  return Object.freeze(identity);
}
export function recordV12AtomicFailure({ root = process.cwd(), runId, shard, error } = {}) {
  if (!SAFE.test(shard ?? "")) fail("arguments_invalid");
  const runRoot = safeRoot(root, runId); const failure = path.join(runRoot, "failures", `${shard}.json`);
  if (existsSync(path.join(runRoot, "publication", `${shard}.json`)) || existsSync(failure)) fail("attempt_consumed");
  mkdirSync(path.dirname(failure), { recursive: true }); noLinks(runRoot, failure);
  writeFileSync(failure, `${JSON.stringify(safeFailure(error, runId, shard))}\n`, { flag: "wx" });
  fsyncFile(failure); fsyncDirectory(path.dirname(failure));
  return Object.freeze({ failure_path: path.relative(path.resolve(root), failure) });
}
function assertCompleteStage(stage, members) {
  const actual = [];
  const walk = (directory, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("symlink_forbidden");
      if (entry.isDirectory()) walk(target, relativePath);
      else if (entry.isFile()) actual.push(relativePath);
      else fail("stage_member_invalid");
    }
  };
  walk(stage);
  const expected = new Set([...members.map(({ artifact }) => artifact), "manifest.json"]);
  if (actual.length !== expected.size || actual.some((artifact) => !expected.has(artifact))) fail("stage_member_invalid");
}

/** Stage members privately, write a manifest last, then publish exactly once. */
export function publishV12AtomicShard({ root = process.cwd(), runId, shard, produce, validate = () => true } = {}) {
  if (!SAFE.test(shard ?? "") || typeof produce !== "function") fail("arguments_invalid");
  const runRoot = safeRoot(root, runId); const finalManifest = path.join(runRoot, "publication", `${shard}.json`);
  const failure = path.join(runRoot, "failures", `${shard}.json`);
  if (existsSync(finalManifest) || existsSync(failure)) fail("attempt_consumed");
  const stage = path.join(runRoot, ".staging", `${shard}-${process.pid}-${Date.now()}`); const members = [];
  mkdirSync(stage, { recursive: true }); noLinks(runRoot, stage);
  const write = (artifact, value) => {
    const safe = relative(artifact); const target = path.join(stage, safe); noLinks(stage, target);
    if (existsSync(target)) fail("second_write");
    mkdirSync(path.dirname(target), { recursive: true });
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
    writeFileSync(target, bytes, { flag: "wx" }); fsyncFile(target); members.push({ artifact: safe, sha256: sha256(bytes), size_bytes: bytes.length });
  };
  try {
    produce(Object.freeze({ write, stage_root: stage }));
    if (members.length === 0 || validate(Object.freeze([...members]), stage) !== true) fail("validation_failed");
    const manifest = Object.freeze({ schema_version: 1, producer: "v12-atomic-shard-publication/v1", run_id: runId, shard, identity: publicationIdentity(runRoot), members: Object.freeze([...members]), completed: true });
    const stagedManifest = path.join(stage, "manifest.json");
    writeFileSync(stagedManifest, `${JSON.stringify(manifest)}\n`, { flag: "wx" }); fsyncFile(stagedManifest);
    assertCompleteStage(stage, members);
    fsyncDirectory(stage);
    for (const member of members) {
      if (member.artifact === "manifest.json") continue;
      const from = path.join(stage, member.artifact); const to = path.join(runRoot, member.artifact); noLinks(runRoot, to);
      if (existsSync(to)) fail("output_exists");
      mkdirSync(path.dirname(to), { recursive: true }); fsyncDirectory(path.dirname(to)); renameSync(from, to); fsyncDirectory(path.dirname(to));
    }
    mkdirSync(path.dirname(finalManifest), { recursive: true }); fsyncDirectory(path.dirname(finalManifest)); renameSync(path.join(stage, "manifest.json"), finalManifest); fsyncDirectory(path.dirname(finalManifest));
    rmSync(stage, { recursive: true, force: true });
    try { rmdirSync(path.dirname(stage)); } catch { /* another attempt may own the parent */ }
    return Object.freeze({ manifest, manifest_path: path.relative(path.resolve(root), finalManifest) });
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    try { rmdirSync(path.dirname(stage)); } catch { /* preserve concurrent staging */ }
    if (!existsSync(failure)) recordV12AtomicFailure({ root, runId, shard, error });
    throw error;
  }
}

export function verifyV12AtomicShard({ root = process.cwd(), runId, shard } = {}) {
  const runRoot = safeRoot(root, runId); if (!SAFE.test(shard ?? "") || existsSync(path.join(runRoot, "failures", `${shard}.json`)) || existsSync(path.join(runRoot, ".staging"))) fail("incomplete_attempt");
  const manifestPath = path.join(runRoot, "publication", `${shard}.json`);
  noLinks(runRoot, manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest?.run_id !== runId || manifest.shard !== shard || manifest.completed !== true || !Array.isArray(manifest.members)) fail("manifest_invalid");
  const expectedIdentity = publicationIdentity(runRoot);
  if (expectedIdentity !== null && JSON.stringify(manifest.identity) !== JSON.stringify(expectedIdentity)) fail("manifest_identity_invalid");
  for (const member of manifest.members) {
    if (member.artifact === "manifest.json") continue;
    const file = path.join(runRoot, relative(member.artifact)); noLinks(runRoot, file);
    if (!lstatSync(file).isFile()) fail("member_invalid");
    if (!blackBoxFastPath()) {
      const bytes = readFileSync(file); if (sha256(bytes) !== member.sha256 || bytes.length !== member.size_bytes) fail("member_invalid");
    } else if (lstatSync(file).size !== member.size_bytes) fail("member_invalid");
  }
  return true;
}
