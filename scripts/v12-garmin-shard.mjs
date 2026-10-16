import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { publishV12AtomicShard, recordV12AtomicFailure, verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const PRIVATE = /(?:account|credential|password|token|secret|payload|route|coordinate|subject|serial|bodyweight|heart.?rate|sql|path)/iu;
const FORBIDDEN_AUTHORITY = /(?:^|_)(?:final.?verdict|verdict|readiness|seal)(?:$|_)/iu;
export const V12_GARMIN_SHARD_CASE_IDS = Object.freeze([
  "packaging", "bridge-allowlist", "canonical-json", "sync-read", "account-lifecycle", "recovery",
  "dedupe-restart", "dedupe-restore", "dedupe-merge", "match-zero", "match-one", "match-many",
  "match-stale", "match-alternate", "match-cancel", "match-confirm", "match-reassign", "privacy",
]);
const ARTIFACTS = Object.freeze([
  "garmin/packaging-auth.json", "garmin/sync-read.json", "garmin/dedupe.json", "garmin/matching.json", "maestro/garmin-progress.xml",
]);

function fail(code) { throw new Error(`garmin_${code}`); }
function record(value, code) { if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code); return value; }
function exactKeys(value, keys) { return Object.keys(record(value, "schema_invalid")).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function noPrivate(value, location = "observation") {
  if (typeof value === "string") { if (/(?:bearer\s+|@|\/Users\/|\/home\/|\b(?:lat|lon|gps)\b)/iu.test(value)) fail(`private_value:${location}`); return; }
  if (Array.isArray(value)) return value.forEach((item, index) => noPrivate(item, `${location}[${index}]`));
  if (value !== null && typeof value === "object") for (const [key, nested] of Object.entries(value)) {
    if (PRIVATE.test(key) || FORBIDDEN_AUTHORITY.test(key)) fail(`private_field:${location}.${key}`);
    noPrivate(nested, `${location}.${key}`);
  }
}
function sha(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safeRelative(value) { return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.includes("\\") && value.split("/").every((part) => part && part !== "." && part !== ".."); }
function outputPath(runId, artifact) { if (!RUN_ID.test(runId) || ![...ARTIFACTS, "build.json", "garmin/failure.json"].includes(artifact)) fail("cli_invalid"); return `artifacts/native/v1.2/${runId}/${artifact}`; }

function identity(manifest, runId, dependencies) {
  record(manifest, "build_invalid");
  const source = record(manifest.source, "build_invalid");
  const build = record(manifest.build, "build_invalid");
  const device = record(manifest.device, "build_invalid");
  const apk = record(build.apk, "build_invalid");
  const fixtures = record(manifest.fixtures, "build_invalid");
  if (manifest.run_id !== runId || build.package !== "com.fchoo.gymtracker.devtest" || !HEAD.test(source.head ?? "")
    || !SHA256.test(source.tree_sha256 ?? "") || !SHA256.test(fixtures.registry_sha256 ?? "")
    || !SHA256.test(apk.sha256 ?? "") || !SHA256.test(device.installed_apk_sha256 ?? "")
    || apk.sha256 !== device.installed_apk_sha256 || !SHA256.test(device.identity_sha256 ?? "")
    || !SHA256.test(device.settings_sha256 ?? "") || !SHA256.test(device.restoration_sha256 ?? "")) fail("build_invalid");
  const currentDigest = dependencies.sourceDigest ?? source.tree_sha256;
  const currentHead = dependencies.currentHead ?? source.head;
  const isAncestor = dependencies.isAncestor ?? ((left, right) => left === right);
  if (currentDigest !== source.tree_sha256 || !HEAD.test(currentHead) || isAncestor(source.head, currentHead) !== true) fail("identity_mismatch");
  return Object.freeze({ source_digest: source.tree_sha256, fixture_digest: fixtures.registry_sha256, apk_digest: apk.sha256, installed_apk_digest: device.installed_apk_sha256, device_digest: device.identity_sha256, settings_digest: device.settings_sha256, restoration_digest: device.restoration_sha256, configuration_id: manifest.configuration?.id });
}

function exactCases(value, expected) {
  if (!Array.isArray(value) || value.length !== expected.length) fail("native_cases_invalid");
  value.forEach((entry, order) => {
    const globalOrder = V12_GARMIN_SHARD_CASE_IDS.indexOf(expected[order]);
    record(entry, "native_cases_invalid"); noPrivate(entry, `case[${order}]`);
    if (!exactKeys(entry, ["id", "order", "status", "code", "count", "receipt_sha256"]) || entry.id !== expected[order] || entry.order !== globalOrder || !["PASS", "FAIL"].includes(entry.status)
      || entry.code !== `${entry.id}-${entry.status === "PASS" ? "observed" : "evidence-mismatch"}` || !Number.isSafeInteger(entry.count) || entry.count < 0 || !SHA256.test(entry.receipt_sha256 ?? "")) fail("native_cases_invalid");
  });
}

function observations(result, id) {
  if (!exactKeys(result, ["producer", "cases"]) || result.producer !== "v12-production-garmin-host/v1") fail("native_cases_invalid");
  exactCases(result.cases, V12_GARMIN_SHARD_CASE_IDS);
  const { run_id, ...artifactIdentity } = id;
  const byId = Object.fromEntries(result.cases.map((entry) => [entry.id, entry]));
  const selected = (ids) => ids.map((caseId) => byId[caseId]);
  const base = { schema_version: 2, producer: "v12-garmin-shard/v3", run_id, identity: artifactIdentity };
  return Object.freeze({
    "garmin/packaging-auth.json": { ...base, schema: "packaging-auth/v1", cases: selected(["packaging", "bridge-allowlist", "account-lifecycle", "recovery"]) },
    "garmin/sync-read.json": { ...base, schema: "sync-read/v1", cases: selected(["canonical-json", "sync-read", "privacy"]) },
    "garmin/dedupe.json": { ...base, schema: "dedupe/v1", cases: selected(["dedupe-restart", "dedupe-restore", "dedupe-merge"]) },
    "garmin/matching.json": { ...base, schema: "matching/v1", cases: selected(V12_GARMIN_SHARD_CASE_IDS.slice(9, 17)) },
  });
}

function xml(result, id) {
  const tests = result.cases.map(({ id: caseId, status }) => `<testcase classname="v12.garmin" name="${caseId}">${status === "FAIL" ? "<failure message=\"observed failure\"/>" : status === "NOT_RUN" || status === "REVIEW_REQUIRED" ? "<skipped message=\"observation incomplete\"/>" : ""}</testcase>`).join("");
  const failures = result.cases.filter(({ status }) => status === "FAIL").length;
  const skipped = result.cases.filter(({ status }) => status === "NOT_RUN" || status === "REVIEW_REQUIRED").length;
  return `<?xml version="1.0" encoding="UTF-8"?><testsuite name="v12-garmin" tests="${result.cases.length}" failures="${failures}" errors="0" skipped="${skipped}" source_digest="${id.source_digest}">${tests}</testsuite>\n`;
}

function verifyPublication(manifest, runId, read) {
  if (!exactKeys(manifest, ["schema_version", "producer", "run_id", "shard", "identity", "members", "completed"])
    || manifest.schema_version !== 1 || manifest.producer !== "v12-atomic-shard-publication/v1"
    || manifest.run_id !== runId || manifest.shard !== "garmin" || manifest.completed !== true
    || !Array.isArray(manifest.members) || manifest.members.length !== ARTIFACTS.length) fail("publication_invalid");
  manifest.members.forEach((member, order) => {
    if (!exactKeys(member, ["artifact", "sha256", "size_bytes"]) || member.artifact !== ARTIFACTS[order]
      || !SHA256.test(member.sha256 ?? "") || !Number.isSafeInteger(member.size_bytes) || member.size_bytes < 1) fail("publication_invalid");
    const bytes = Buffer.from(read(outputPath(runId, member.artifact)));
    if (createHash("sha256").update(bytes).digest("hex") !== member.sha256 || bytes.length !== member.size_bytes) fail("publication_invalid");
  });
}

export function parseV12GarminShardCliArgs(args) {
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== "--run" || !RUN_ID.test(args[1] ?? "") || !["--execute", "--verify"].includes(args[2])) fail("cli_invalid");
  return Object.freeze({ runId: args[1], mode: args[2].slice(2) });
}

export async function executeV12GarminShardCli(args = process.argv.slice(2), dependencies = {}) {
  const { runId, mode } = parseV12GarminShardCliArgs(args); const root = dependencies.root ?? process.cwd();
  const exists = dependencies.outputExists ?? ((file) => existsSync(path.join(root, file)));
  const files = ARTIFACTS.map((file) => outputPath(runId, file));
  const readBuild = dependencies.readBuild ?? (() => JSON.parse(readFileSync(path.join(root, outputPath(runId, "build.json")), "utf8")));
  const manifest = readBuild(); const id = identity(manifest, runId, dependencies);
  if (mode === "verify") {
    if (files.some((file) => !exists(file))) fail("output_missing");
    const read = dependencies.readArtifact ?? ((file) => readFileSync(path.join(root, file), "utf8"));
    const verifyAtomic = dependencies.verifyAtomic ?? (() => verifyV12AtomicShard({ root, runId, shard: "garmin" }));
    if (verifyAtomic() !== true) fail("publication_invalid");
    const readPublication = dependencies.readPublication ?? (() => JSON.parse(readFileSync(path.join(root, `artifacts/native/v1.2/${runId}/publication/garmin.json`), "utf8")));
    verifyPublication(readPublication(), runId, read);
    const schemas = ["packaging-auth/v1", "sync-read/v1", "dedupe/v1", "matching/v1"];
    const groups = [[0, 1, 4, 5], [2, 3, 17], [6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16]];
    const observed = new Map();
    files.slice(0, -1).forEach((file, index) => {
      const value = JSON.parse(read(file)); noPrivate(value);
      if (!exactKeys(value, ["schema_version", "producer", "run_id", "identity", "schema", "cases"])
        || value.schema_version !== 2 || value.producer !== "v12-garmin-shard/v3" || value.run_id !== runId
        || JSON.stringify(value.identity) !== JSON.stringify(id) || value.schema !== schemas[index]) fail("verify_invalid");
      const expectedIds = groups[index].map((order) => V12_GARMIN_SHARD_CASE_IDS[order]);
      exactCases(value.cases, expectedIds);
      value.cases.forEach((entry) => {
        if (observed.has(entry.id)) fail("verify_invalid"); observed.set(entry.id, entry);
      });
    });
    const cases = V12_GARMIN_SHARD_CASE_IDS.map((caseId) => observed.get(caseId));
    exactCases(cases, V12_GARMIN_SHARD_CASE_IDS);
    const report = read(files.at(-1));
    if (typeof report !== "string" || report !== xml({ cases }, id)) fail("verify_invalid");
    return Object.freeze({ ok: true, mode, run_id: runId });
  }
  if (files.some(exists) || exists(outputPath(runId, "garmin/failure.json"))) fail("output_exists");
  const acquireLease = dependencies.acquireLease ?? (() => { fail("lease_required"); }); const releaseLease = dependencies.releaseLease ?? (() => true);
  const snapshotSettings = dependencies.snapshotSettings ?? (() => { fail("settings_snapshot_required"); }); const restoreSettings = dependencies.restoreSettings ?? (() => false);
  const write = dependencies.writeImmutable ?? ((file, value) => { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value)}\n`, { flag: "wx" }); });
  const executeNative = dependencies.executeNative ?? (() => { fail("native_executor_required"); });
  const writeFailure = dependencies.writeFailureReceipt ?? ((value) => write(outputPath(runId, "garmin/failure.json"), value));
  let lease; let settings; let restoreOk = false;
  try {
    lease = await acquireLease(); settings = await snapshotSettings(lease);
    const result = await executeNative(lease, settings); const produced = observations(result, { ...id, run_id: runId });
    for (const [artifact, value] of Object.entries(produced)) { noPrivate(value); await write(outputPath(runId, artifact), value); }
    await write(outputPath(runId, "maestro/garmin-progress.xml"), xml(result, id));
    return Object.freeze({ ok: true, mode, run_id: runId });
  } catch (error) {
    const failureCode = error instanceof Error && /(?:^|:)auth_required$/u.test(error.message) ? "auth_required" : "execution_failed";
    const receipt = { schema_version: 1, producer: "v12-garmin-shard/v3", run_id: runId, identity: id, failure_stage: settings === undefined ? "lease" : "native", failure_code: failureCode, failure_digest: sha({ runId, source: id.source_digest, code: failureCode }) };
    try { await writeFailure(receipt); } catch { fail("failure_receipt_write_failed"); }
    throw error;
  } finally {
    if (settings !== undefined) restoreOk = await restoreSettings(settings, lease) === true;
    if (lease !== undefined) await releaseLease(lease);
    if (settings !== undefined && !restoreOk) fail("settings_restore_failed");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const adapter = createV12NativeAdapter();
  const args = process.argv.slice(2); const runId = args[1]; const writes = [];
  executeV12GarminShardCli(args, {
    acquireLease: adapter.acquireLease, releaseLease: adapter.releaseLease, snapshotSettings: adapter.snapshotSettings,
    restoreSettings: adapter.restoreSettings, executeNative: (lease, settings) => adapter.executeGarmin(lease, settings, { run_id: runId }),
    writeImmutable: (file, value) => writes.push([file, value]),
    writeFailureReceipt: (value) => writes.push([`artifacts/native/v1.2/${runId}/garmin/failure.json`, value]),
  }).then((value) => {
    if (args[2] === "--execute") publishV12AtomicShard({
      runId,
      shard: "garmin",
      produce: ({ write }) => writes.forEach(([file, content]) => write(file.replace(`artifacts/native/v1.2/${runId}/`, ""), content)),
      validate: (members) => members.length === ARTIFACTS.length && members.every((member, order) => member.artifact === ARTIFACTS[order]),
    });
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }).catch((error) => {
    const failure = error instanceof Error && /(?:^|:)auth_required$/u.test(error.message) ? new Error("auth_required") : error;
    if (RUN_ID.test(runId ?? "")) { try { recordV12AtomicFailure({ runId, shard: "garmin", error: failure }); } catch { /* the first immutable receipt wins */ } }
    console.error(error instanceof Error ? error.message : "garmin_cli_failed"); process.exitCode = 1;
  });
}
