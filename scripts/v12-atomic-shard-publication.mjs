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
function fsyncFile(file) { const descriptor = openSync(file, "r"); try { fsyncSync(descriptor); } finally { closeSync(descriptor); } }

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
    const manifest = { schema_version: 1, producer: "v12-atomic-shard-publication/v1", run_id: runId, shard, members, completed: true };
    write("manifest.json", manifest);
    for (const member of members) {
      if (member.artifact === "manifest.json") continue;
      const from = path.join(stage, member.artifact); const to = path.join(runRoot, member.artifact); noLinks(runRoot, to);
      if (existsSync(to)) fail("output_exists");
      mkdirSync(path.dirname(to), { recursive: true }); renameSync(from, to);
    }
    mkdirSync(path.dirname(finalManifest), { recursive: true }); renameSync(path.join(stage, "manifest.json"), finalManifest);
    rmSync(stage, { recursive: true, force: true });
    try { rmdirSync(path.dirname(stage)); } catch { /* another attempt may own the parent */ }
    return Object.freeze({ manifest, manifest_path: path.relative(path.resolve(root), finalManifest) });
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    try { rmdirSync(path.dirname(stage)); } catch { /* preserve concurrent staging */ }
    mkdirSync(path.dirname(failure), { recursive: true });
    if (!existsSync(failure)) writeFileSync(failure, `${JSON.stringify({ schema_version: 1, producer: "v12-atomic-shard-failure/v1", run_id: runId, shard, failure_code: error instanceof Error ? error.message.replace(/[^a-z0-9_-]/giu, "_").slice(0, 96) : "unknown", privacy: "safe", retry_allowed: false })}\n`, { flag: "wx" });
    throw error;
  }
}

export function verifyV12AtomicShard({ root = process.cwd(), runId, shard } = {}) {
  const runRoot = safeRoot(root, runId); if (!SAFE.test(shard ?? "") || existsSync(path.join(runRoot, "failures", `${shard}.json`)) || existsSync(path.join(runRoot, ".staging"))) fail("incomplete_attempt");
  const manifest = JSON.parse(readFileSync(path.join(runRoot, "publication", `${shard}.json`), "utf8"));
  if (manifest?.run_id !== runId || manifest.shard !== shard || manifest.completed !== true || !Array.isArray(manifest.members)) fail("manifest_invalid");
  for (const member of manifest.members) {
    if (member.artifact === "manifest.json") continue;
    const file = path.join(runRoot, relative(member.artifact)); noLinks(runRoot, file);
    const bytes = readFileSync(file); if (sha256(bytes) !== member.sha256 || bytes.length !== member.size_bytes) fail("member_invalid");
  }
  return true;
}
