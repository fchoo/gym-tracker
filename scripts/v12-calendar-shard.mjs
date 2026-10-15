import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { publishV12AtomicShard, recordV12AtomicFailure } from "./v12-atomic-shard-publication.mjs";
import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_STAGE_IDS,
  validateV12CalendarStageCoverage,
  validateV12CalendarStageResult,
} from "./v12-calendar-observation-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const PRIVATE = /(?:account|credential|password|token|secret|payload|route|coordinate|subject|serial|bodyweight|heart.?rate|sql|path)/iu;
const AUTHORITY = /(?:^|_)(?:final.?verdict|verdict|readiness|seal)(?:$|_)/iu;
const FLOW = "maestro/v1.2/calendar.yaml";
const FLOW_REVISION = V12_CALENDAR_FLOW_REVISION;
export const V12_CALENDAR_SHARD_STAGE_IDS = V12_CALENDAR_STAGE_IDS;
const ARTIFACTS = Object.freeze(["calendar-transitions.json", "maestro/calendar.xml"]);
function fail(code) { throw new Error(`calendar_${code}`); }
function record(value, code) { if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code); return value; }
function exactKeys(value, keys) { return Object.keys(record(value, "schema_invalid")).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function sha(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function noPrivate(value, location = "observation") { if (typeof value === "string") { if (/(?:@|\/Users\/|\/home\/|\b(?:lat|lon|gps)\b)/iu.test(value)) fail(`private_value:${location}`); return; } if (Array.isArray(value)) return value.forEach((item, index) => noPrivate(item, `${location}[${index}]`)); if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { if (PRIVATE.test(key) || AUTHORITY.test(key)) fail(`private_field:${location}.${key}`); noPrivate(child, `${location}.${key}`); } }
function outputPath(runId, artifact) { if (!RUN_ID.test(runId) || ![...ARTIFACTS, "calendar-failure.json", "build.json"].includes(artifact)) fail("cli_invalid"); return `artifacts/native/v1.2/${runId}/${artifact}`; }
function identity(manifest, runId, dependencies) { record(manifest, "build_invalid"); const source = record(manifest.source, "build_invalid"); const build = record(manifest.build, "build_invalid"); const apk = record(build.apk, "build_invalid"); const device = record(manifest.device, "build_invalid"); const fixtures = record(manifest.fixtures, "build_invalid"); if (manifest.run_id !== runId || build.package !== "com.fchoo.gymtracker.devtest" || !HEAD.test(source.head ?? "") || !SHA256.test(source.tree_sha256 ?? "") || !SHA256.test(fixtures.registry_sha256 ?? "") || !SHA256.test(apk.sha256 ?? "") || apk.sha256 !== device.installed_apk_sha256 || !SHA256.test(device.identity_sha256 ?? "") || !SHA256.test(device.settings_sha256 ?? "") || !SHA256.test(device.restoration_sha256 ?? "")) fail("build_invalid"); const currentDigest = dependencies.sourceDigest ?? source.tree_sha256; const currentHead = dependencies.currentHead ?? source.head; if (currentDigest !== source.tree_sha256 || !HEAD.test(currentHead) || (dependencies.isAncestor ?? ((a, b) => a === b))(source.head, currentHead) !== true) fail("identity_mismatch"); return Object.freeze({ source_digest: source.tree_sha256, fixture_digest: fixtures.registry_sha256, apk_digest: apk.sha256, installed_apk_digest: device.installed_apk_sha256, device_digest: device.identity_sha256, settings_digest: device.settings_sha256, restoration_digest: device.restoration_sha256, configuration_id: manifest.configuration?.id }); }

export function parseV12CalendarShardCliArgs(args) { if (!Array.isArray(args) || args.length !== 3 || args[0] !== "--run" || !RUN_ID.test(args[1] ?? "") || !["--execute", "--verify"].includes(args[2])) fail("cli_invalid"); return Object.freeze({ runId: args[1], mode: args[2].slice(2) }); }
export function validateV12CalendarShard(input, expectedFlowSha256 = input?.flow_sha256) {
  const value = validatedStages(input, expectedFlowSha256);
  const statusCounts = Object.freeze(value.stages.reduce((counts, stage) => ({
    ...counts,
    [stage.status]: (counts[stage.status] ?? 0) + 1,
  }), {}));
  return Object.freeze({ stageCount: value.stages.length, statusCounts });
}
export function executeV12CalendarShard(observations) { validateV12CalendarShard(observations); return Object.freeze({ producer: "v12-calendar-shard/v4", observations }); }
function validatedStages(result, expectedFlowSha256) {
  record(result, "native_stages_invalid");
  if (!exactKeys(result, ["flow_sha256", "flow_revision", "stages", "junit_cases"])
    || result.flow_sha256 !== expectedFlowSha256 || result.flow_revision !== FLOW_REVISION
    || !Array.isArray(result.stages) || !Array.isArray(result.junit_cases)) fail("native_stages_invalid");
  try {
    validateV12CalendarStageCoverage(result.stages);
    result.stages.forEach((stage, order) => {
      noPrivate(stage, `stage[${order}]`);
      validateV12CalendarStageResult(stage, V12_CALENDAR_SHARD_STAGE_IDS[order], order);
      const junit = result.junit_cases[order];
      if (!exactKeys(junit, ["id", "order", "status"]) || junit.id !== stage.id || junit.order !== order || junit.status !== stage.status) fail("native_stages_invalid");
    });
  } catch { fail("native_stages_invalid"); }
  return result;
}
function xml(stages, id, flowSha256) { return `<?xml version="1.0" encoding="UTF-8"?><testsuite name="v12-calendar" tests="${stages.length}" source_digest="${id.source_digest}" flow_sha256="${flowSha256}">${stages.map(({ id: stageId, status }) => `<testcase classname="v12.calendar" name="${stageId}">${status === "FAIL" ? "<failure message=\"observed failure\"/>" : status === "NOT_RUN" || status === "REVIEW_REQUIRED" ? "<skipped message=\"observation incomplete\"/>" : ""}</testcase>`).join("")}</testsuite>\n`; }
export async function executeV12CalendarShardCli(args = process.argv.slice(2), dependencies = {}) { const { runId, mode } = parseV12CalendarShardCliArgs(args); const root = dependencies.root ?? process.cwd(); const exists = dependencies.outputExists ?? ((file) => existsSync(path.join(root, file))); const files = ARTIFACTS.map((file) => outputPath(runId, file)); const manifest = (dependencies.readBuild ?? (() => JSON.parse(readFileSync(path.join(root, outputPath(runId, "build.json")), "utf8"))))(); const id = identity(manifest, runId, dependencies); const flowSha256 = dependencies.flowSha256 ?? createHash("sha256").update(readFileSync(path.join(root, FLOW))).digest("hex"); if (mode === "verify") { if (files.some((file) => !exists(file))) fail("output_missing"); const read = dependencies.readArtifact ?? ((file) => readFileSync(path.join(root, file), "utf8")); const observation = JSON.parse(read(files[0])); noPrivate(observation); if (observation?.run_id !== runId || JSON.stringify(observation?.identity) !== JSON.stringify(id) || observation?.flow_sha256 !== flowSha256 || observation?.flow_revision !== FLOW_REVISION) fail("verify_invalid"); const validated = validatedStages({ flow_sha256: observation.flow_sha256, flow_revision: observation.flow_revision, stages: observation.stages, junit_cases: observation.junit_cases }, flowSha256); const report = read(files[1]); if (typeof report !== "string" || !report.includes(`source_digest=\"${id.source_digest}\"`) || !report.includes(`flow_sha256=\"${flowSha256}\"`) || !validated) fail("verify_invalid"); return Object.freeze({ ok: true, mode, run_id: runId }); } if (files.some(exists) || exists(outputPath(runId, "calendar-failure.json"))) fail("output_exists"); const acquireLease = dependencies.acquireLease ?? (() => { fail("lease_required"); }); const releaseLease = dependencies.releaseLease ?? (() => true); const snapshotSettings = dependencies.snapshotSettings ?? (() => { fail("settings_snapshot_required"); }); const restoreSettings = dependencies.restoreSettings ?? (() => false); const executeNative = dependencies.executeNative ?? (() => { fail("native_executor_required"); }); const write = dependencies.writeImmutable ?? ((file, value) => { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value)}\n`, { flag: "wx" }); }); const writeFailure = dependencies.writeFailureReceipt ?? ((value) => write(outputPath(runId, "calendar-failure.json"), value)); let lease; let settings; let restored = false; try { lease = await acquireLease(); settings = await snapshotSettings(lease); const native = validatedStages(await executeNative(lease, settings, { run_id: runId, flow_sha256: flowSha256, flow_revision: FLOW_REVISION }), flowSha256); const output = { schema_version: 3, producer: "v12-calendar-shard/v4", run_id: runId, identity: id, flow_sha256: native.flow_sha256, flow_revision: native.flow_revision, stages: native.stages, junit_cases: native.junit_cases }; noPrivate(output); await write(files[0], output); await write(files[1], xml(native.stages, id, flowSha256)); return Object.freeze({ ok: true, mode, run_id: runId }); } catch (error) { try { await writeFailure({ schema_version: 1, producer: "v12-calendar-shard/v4", run_id: runId, identity: id, failure_stage: settings === undefined ? "lease" : "native", failure_code: "execution_failed", failure_digest: sha({ runId, source: id.source_digest, code: "execution_failed" }) }); } catch { fail("failure_receipt_write_failed"); } throw error; } finally { if (settings !== undefined) restored = await restoreSettings(settings, lease) === true; if (lease !== undefined) await releaseLease(lease); if (settings !== undefined && !restored) fail("settings_restore_failed"); } }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const adapter = createV12NativeAdapter();
  const args = process.argv.slice(2); const runId = args[1]; const writes = [];
  executeV12CalendarShardCli(args, {
    acquireLease: adapter.acquireLease, releaseLease: adapter.releaseLease, snapshotSettings: adapter.snapshotSettings,
    restoreSettings: adapter.restoreSettings, executeNative: (lease, settings, payload) => adapter.executeCalendar(lease, settings, payload),
    writeImmutable: (file, value) => writes.push([file, value]),
    writeFailureReceipt: (value) => writes.push([`artifacts/native/v1.2/${runId}/calendar-failure.json`, value]),
  }).then((value) => {
    if (args[2] === "--execute") publishV12AtomicShard({ runId, shard: "calendar", produce: ({ write }) => writes.forEach(([file, content]) => write(file.replace(`artifacts/native/v1.2/${runId}/`, ""), content)) });
    process.stdout.write(`${JSON.stringify(value)}\n`);
  }).catch((error) => {
    if (RUN_ID.test(runId ?? "")) { try { recordV12AtomicFailure({ runId, shard: "calendar", error }); } catch { /* the first immutable receipt wins */ } }
    console.error(error instanceof Error ? error.message : "calendar_cli_failed"); process.exitCode = 1;
  });
}
