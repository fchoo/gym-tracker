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
  analyzeV12CalendarScreenshot,
  validateV12CalendarStageCoverage,
  validateV12CalendarStageResult,
} from "./v12-calendar-observation-contract.mjs";
import { V12_CALENDAR_REQUIREMENT_DEFINITIONS } from "./v12-calendar-requirement-map.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const PRIVATE = /(?:account|credential|password|token|secret|payload|route|coordinate|subject|serial|bodyweight|heart.?rate|sql|path)/iu;
const AUTHORITY = /(?:^|_)(?:final.?verdict|verdict|readiness|seal)(?:$|_)/iu;
const FLOW = "maestro/v1.2/calendar.yaml";
const FLOW_REVISION = V12_CALENDAR_FLOW_REVISION;
export const V12_CALENDAR_SHARD_STAGE_IDS = V12_CALENDAR_STAGE_IDS;
const ARTIFACTS = Object.freeze(["calendar-transitions.json", "calendar-requirements.json", "maestro/calendar.xml", "maestro/calendar-requirements.xml", "calendar/artifact-registry.json"]);
const ORIGIN_KEYS = Object.freeze(["schema_version", "kind", "default_launcher", "test_only", "adapter_source_sha256", "launcher_source_sha256", "request_attestation_sha256"]);
function fail(code) { throw new Error(`calendar_${code}`); }
function record(value, code) { if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code); return value; }
function exactKeys(value, keys) { return Object.keys(record(value, "schema_invalid")).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function sha(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function noPrivate(value, location = "observation") { if (typeof value === "string") { if (/(?:@|\/Users\/|\/home\/|\b(?:lat|lon|gps)\b)/iu.test(value)) fail(`private_value:${location}`); return; } if (Array.isArray(value)) return value.forEach((item, index) => noPrivate(item, `${location}[${index}]`)); if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { if (PRIVATE.test(key) || AUTHORITY.test(key)) fail(`private_field:${location}.${key}`); noPrivate(child, `${location}.${key}`); } }
function outputPath(runId, artifact) { if (!RUN_ID.test(runId) || (![...ARTIFACTS, "calendar-failure.json", "build.json"].includes(artifact)
  && !/^calendar\/stages\/\d{2}-[a-z0-9_-]+\.(?:png|trace\.json)$/u.test(artifact)
  && !/^calendar\/requirements\/CAL-\d{2}-calendar\.[a-z0-9-]+\.(?:png|trace\.xml)$/u.test(artifact))) fail("cli_invalid"); return `artifacts/native/v1.2/${runId}/${artifact}`; }
function identity(manifest, runId, dependencies) { record(manifest, "build_invalid"); const source = record(manifest.source, "build_invalid"); const build = record(manifest.build, "build_invalid"); const apk = record(build.apk, "build_invalid"); const device = record(manifest.device, "build_invalid"); const fixtures = record(manifest.fixtures, "build_invalid"); if (manifest.run_id !== runId || build.package !== "com.fchoo.gymtracker.devtest" || !HEAD.test(source.head ?? "") || !SHA256.test(source.tree_sha256 ?? "") || !SHA256.test(fixtures.registry_sha256 ?? "") || !SHA256.test(apk.sha256 ?? "") || !SHA256.test(apk.signature_sha256 ?? "") || apk.sha256 !== device.installed_apk_sha256 || !SHA256.test(device.identity_sha256 ?? "") || !SHA256.test(device.settings_sha256 ?? "") || !SHA256.test(device.restoration_sha256 ?? "")) fail("build_invalid"); const currentDigest = dependencies.sourceDigest ?? source.tree_sha256; const currentHead = dependencies.currentHead ?? source.head; if (currentDigest !== source.tree_sha256 || !HEAD.test(currentHead) || (dependencies.isAncestor ?? ((a, b) => a === b))(source.head, currentHead) !== true) fail("identity_mismatch"); return Object.freeze({ source_digest: source.tree_sha256, fixture_digest: fixtures.registry_sha256, apk_digest: apk.sha256, installed_apk_digest: device.installed_apk_sha256, apk_signature_digest: apk.signature_sha256, device_digest: device.identity_sha256, settings_digest: device.settings_sha256, restoration_digest: device.restoration_sha256, configuration_id: manifest.configuration?.id }); }

function validateExecutionOrigin(value, allowTestFixture = false) {
  if (!exactKeys(value, ORIGIN_KEYS) || value.schema_version !== 1
    || ![value.adapter_source_sha256, value.launcher_source_sha256, value.request_attestation_sha256].every((entry) => SHA256.test(entry ?? ""))) fail("native_origin_invalid");
  const production = value.kind === "production-default-launcher" && value.default_launcher === true && value.test_only === false;
  const testOnly = value.kind === "test-fixture" && value.default_launcher === false && value.test_only === true;
  if (!production && !(allowTestFixture && testOnly)) fail("native_origin_invalid");
}

function validateRequirements(value) {
  if (!exactKeys(value, ["flow_sha256", "fixture_id", "records", "junit_cases"]) || !SHA256.test(value.flow_sha256 ?? "")
    || value.fixture_id !== "v12-calendar-isolated-facts-v1" || !Array.isArray(value.records) || !Array.isArray(value.junit_cases)
    || value.records.length !== V12_CALENDAR_REQUIREMENT_DEFINITIONS.length || value.junit_cases.length !== value.records.length) fail("native_requirements_invalid");
  value.records.forEach((entry, order) => {
    const expected = V12_CALENDAR_REQUIREMENT_DEFINITIONS[order];
    const junit = value.junit_cases[order];
    if (!exactKeys(entry, ["requirement_id", "evidence_id", "native_execution", "fixture_id", "fixture_storage", "fixture_source_sha256", "source_digest_before", "source_digest_after", "probe_ids"])
      || entry.requirement_id !== expected.requirement_id || entry.evidence_id !== expected.evidence_id
      || entry.native_execution !== "EXECUTED" || entry.fixture_id !== value.fixture_id || entry.fixture_storage !== "isolated-in-memory"
      || ![entry.fixture_source_sha256, entry.source_digest_before, entry.source_digest_after].every((digest) => SHA256.test(digest ?? ""))
      || entry.source_digest_before !== entry.source_digest_after || entry.fixture_source_sha256 !== entry.source_digest_before
      || JSON.stringify(entry.probe_ids) !== JSON.stringify(expected.probe_ids)
      || !exactKeys(junit, ["id", "order", "status"]) || junit.id !== entry.evidence_id || junit.order !== order || !["PASS", "FAIL", "NOT_RUN", "REVIEW_REQUIRED"].includes(junit.status)) fail("native_requirements_invalid");
  });
  return value;
}

function validateNativeReceipt(value, expectedIdentity, result) {
  const keys = ["schema_version", "producer", "native_execution", "run_id", "source_tree_sha256", "apk_sha256", "installed_apk_sha256", "apk_signature_sha256", "device_identity_sha256", "launcher_source_sha256", "flow_sha256", "requirements_flow_sha256", "fixture_id", "stage_count", "requirement_count", "evidence_set_sha256"];
  if (!exactKeys(value, keys) || value.schema_version !== 1 || value.producer !== "v12-calendar-native-receipt/v1" || value.native_execution !== "EXECUTED"
    || value.run_id !== expectedIdentity.run_id || value.source_tree_sha256 !== expectedIdentity.source_digest
    || value.apk_sha256 !== expectedIdentity.apk_digest || value.installed_apk_sha256 !== expectedIdentity.installed_apk_digest
    || value.apk_signature_sha256 !== expectedIdentity.apk_signature_digest || value.device_identity_sha256 !== expectedIdentity.device_digest
    || value.launcher_source_sha256 !== result.execution_origin.launcher_source_sha256 || value.flow_sha256 !== result.flow_sha256
    || value.requirements_flow_sha256 !== result.requirements.flow_sha256 || value.fixture_id !== result.requirements.fixture_id
    || value.stage_count !== result.stages.length || value.requirement_count !== result.requirements.records.length
    || value.evidence_set_sha256 !== sha({ stages: result.stages, requirements: result.requirements, artifacts: result.artifacts.map(({ bytes_base64: _bytes, ...descriptor }) => descriptor) })) fail("native_receipt_invalid");
}

function validateArtifactPayloads(value, stages, requirements) {
  const stageArtifactCount = stages.length * 2;
  if (!Array.isArray(value) || value.length !== stageArtifactCount + requirements.records.length * 2) fail("native_artifacts_invalid");
  return Object.freeze(value.map((entry, index) => {
    if (index >= stageArtifactCount) {
      const requirement = requirements.records[Math.floor((index - stageArtifactCount) / 2)];
      const kind = (index - stageArtifactCount) % 2 === 0 ? "png" : "trace";
      const stem = `${requirement.requirement_id}-${requirement.evidence_id}`;
      const relativePath = `calendar/requirements/${stem}.${kind === "png" ? "png" : "trace.xml"}`;
      if (!exactKeys(entry, ["requirement_id", "kind", "relative_path", "sha256", "size_bytes", "bytes_base64"])
        || entry.requirement_id !== requirement.requirement_id || entry.kind !== kind || entry.relative_path !== relativePath
        || !SHA256.test(entry.sha256 ?? "") || !Number.isSafeInteger(entry.size_bytes) || entry.size_bytes < 1 || typeof entry.bytes_base64 !== "string") fail("native_artifacts_invalid");
      const bytes = Buffer.from(entry.bytes_base64, "base64");
      if (bytes.toString("base64") !== entry.bytes_base64 || bytes.length !== entry.size_bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256
        || (kind === "png" && !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
        || (kind === "trace" && (!bytes.toString("utf8").includes("<hierarchy") || /(?:@|\/Users\/|\/home\/|bearer|password|credential)/iu.test(bytes.toString("utf8"))))) fail("native_artifacts_invalid");
      return Object.freeze({ requirement_id: entry.requirement_id, kind, path: entry.relative_path, sha256: entry.sha256, size_bytes: entry.size_bytes });
    }
    const stage = stages[Math.floor(index / 2)];
    const kind = index % 2 === 0 ? "png" : "trace";
    const stem = `${String(stage.order).padStart(2, "0")}-${stage.id}`;
    const relativePath = `calendar/stages/${stem}.${kind === "png" ? "png" : "trace.json"}`;
    if (!exactKeys(entry, ["stage_id", "kind", "relative_path", "sha256", "size_bytes", "bytes_base64"])
      || entry.stage_id !== stage.id || entry.kind !== kind || entry.relative_path !== relativePath
      || !SHA256.test(entry.sha256 ?? "") || !Number.isSafeInteger(entry.size_bytes) || entry.size_bytes < 1
      || typeof entry.bytes_base64 !== "string") fail("native_artifacts_invalid");
    const bytes = Buffer.from(entry.bytes_base64, "base64");
    if (bytes.toString("base64") !== entry.bytes_base64 || bytes.length !== entry.size_bytes
      || createHash("sha256").update(bytes).digest("hex") !== entry.sha256
      || (kind === "png" && (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) || entry.sha256 !== stage.screenshot_sha256
        || JSON.stringify(analyzeV12CalendarScreenshot(stage.id, bytes)) !== JSON.stringify(stage.capture_measurement)))
      || (kind === "trace" && (bytes.toString("utf8") !== JSON.stringify(stage.observation) || entry.sha256 !== stage.trace_sha256))) fail("native_artifacts_invalid");
    return Object.freeze({ stage_id: entry.stage_id, kind, path: entry.relative_path, sha256: entry.sha256, size_bytes: entry.size_bytes });
  }));
}

export function parseV12CalendarShardCliArgs(args) { const testFixture = args?.[3] === "--test-fixture"; if (!Array.isArray(args) || ![3, 4].includes(args.length) || args[0] !== "--run" || !RUN_ID.test(args[1] ?? "") || !["--execute", "--verify"].includes(args[2]) || (args.length === 4 && (!testFixture || args[2] !== "--execute"))) fail("cli_invalid"); return Object.freeze({ runId: args[1], mode: args[2].slice(2), ...(testFixture ? { testFixture: true } : {}) }); }
export function validateV12CalendarShard(input, expectedFlowSha256 = input?.flow_sha256) {
  const value = validatedStages(input, expectedFlowSha256);
  const statusCounts = Object.freeze(value.stages.reduce((counts, stage) => ({
    ...counts,
    [stage.status]: (counts[stage.status] ?? 0) + 1,
  }), {}));
  return Object.freeze({ stageCount: value.stages.length, statusCounts });
}
export function executeV12CalendarShard(observations) { validateV12CalendarShard(observations); return Object.freeze({ producer: "v12-calendar-shard/v5", observations }); }
function validatedStages(result, expectedFlowSha256, allowTestFixture = false) {
  record(result, "native_stages_invalid");
  if (result.execution_origin !== undefined) validateExecutionOrigin(result.execution_origin, allowTestFixture);
  if (!exactKeys(result, ["flow_sha256", "flow_revision", "stages", "junit_cases", "requirements", "native_receipt", "execution_origin", "artifacts"])
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
  const requirements = validateRequirements(result.requirements);
  return Object.freeze({ ...result, artifact_descriptors: validateArtifactPayloads(result.artifacts, result.stages, requirements) });
}
function xml(stages, id, flowSha256) { return `<?xml version="1.0" encoding="UTF-8"?><testsuite name="v12-calendar" tests="${stages.length}" source_digest="${id.source_digest}" flow_sha256="${flowSha256}">${stages.map(({ id: stageId, status }) => `<testcase classname="v12.calendar" name="${stageId}">${status === "FAIL" ? "<failure message=\"observed failure\"/>" : status === "NOT_RUN" || status === "REVIEW_REQUIRED" ? "<skipped message=\"observation incomplete\"/>" : ""}</testcase>`).join("")}</testsuite>\n`; }
function requirementsXml(requirements, id) { return `<?xml version="1.0" encoding="UTF-8"?><testsuite name="v12-calendar-requirements" tests="${requirements.junit_cases.length}" source_digest="${id.source_digest}" flow_sha256="${requirements.flow_sha256}">${requirements.junit_cases.map(({ id: evidenceId, status }) => `<testcase classname="v12.calendar.requirement" name="${evidenceId}">${status === "FAIL" ? "<failure message=\"observed failure\"/>" : status === "NOT_RUN" || status === "REVIEW_REQUIRED" ? "<skipped message=\"observation incomplete\"/>" : ""}</testcase>`).join("")}</testsuite>\n`; }
export async function executeV12CalendarShardCli(args = process.argv.slice(2), dependencies = {}) {
  const { runId, mode, testFixture = false } = parseV12CalendarShardCliArgs(args);
  if (testFixture && (process.env.NODE_ENV !== "test" || process.env.V12_NATIVE_ADAPTER_TEST_MODE !== "phase20-native-adapter-subprocess" || process.env.V12_NATIVE_ADAPTER_TEST_PROCESS !== "1")) fail("test_fixture_forbidden");
  const root = dependencies.root ?? process.cwd();
  const exists = dependencies.outputExists ?? ((file) => existsSync(path.join(root, file)));
  const files = ARTIFACTS.map((file) => outputPath(runId, file));
  const manifest = (dependencies.readBuild ?? (() => JSON.parse(readFileSync(path.join(root, outputPath(runId, "build.json")), "utf8"))))();
  const id = identity(manifest, runId, dependencies);
  const flowSha256 = dependencies.flowSha256 ?? createHash("sha256").update(readFileSync(path.join(root, FLOW))).digest("hex");
  const read = dependencies.readArtifact ?? ((file) => readFileSync(path.join(root, file)));
  if (mode === "verify") {
    if (files.some((file) => !exists(file))) fail("output_missing");
    const observation = JSON.parse(read(files[0]).toString());
    const requirementEvidence = JSON.parse(read(files[1]).toString());
    const registry = JSON.parse(read(files[4]).toString());
    noPrivate(observation);
    if (observation?.schema_version !== 4 || observation?.producer !== "v12-calendar-shard/v5"
      || observation.run_id !== runId || JSON.stringify(observation.identity) !== JSON.stringify(id)
      || observation.flow_sha256 !== flowSha256 || observation.flow_revision !== FLOW_REVISION
      || requirementEvidence?.schema_version !== 1 || requirementEvidence.producer !== "v12-calendar-requirements/v1"
      || requirementEvidence.run_id !== runId || JSON.stringify(requirementEvidence.execution_origin) !== JSON.stringify(observation.execution_origin)
      || registry?.schema_version !== 1 || registry.producer !== "v12-calendar-artifact-registry/v1"
      || registry.run_id !== runId || registry.execution_origin_sha256 !== sha(observation.execution_origin)
      || observation.artifact_registry_sha256 !== sha(registry)) fail("verify_invalid");
    const artifactPayloads = registry.members.map((member) => {
      const artifact = outputPath(runId, member.path);
      if (!exists(artifact)) fail("output_missing");
      return { stage_id: member.stage_id, kind: member.kind, relative_path: member.path,
        sha256: member.sha256, size_bytes: member.size_bytes, bytes_base64: Buffer.from(read(artifact)).toString("base64") };
    });
    const validated = validatedStages({ flow_sha256: observation.flow_sha256, flow_revision: observation.flow_revision,
      stages: observation.stages, junit_cases: observation.junit_cases, requirements: { flow_sha256: requirementEvidence.flow_sha256,
        fixture_id: requirementEvidence.fixture_id, records: requirementEvidence.records, junit_cases: requirementEvidence.junit_cases },
      native_receipt: observation.native_receipt, execution_origin: observation.execution_origin, artifacts: artifactPayloads }, flowSha256, false);
    validateNativeReceipt(validated.native_receipt, { ...id, run_id: runId }, validated);
    const report = read(files[2]).toString(); const requirementReport = read(files[3]).toString();
    if (!report.includes(`source_digest=\"${id.source_digest}\"`) || !report.includes(`flow_sha256=\"${flowSha256}\"`)
      || !requirementReport.includes(`source_digest=\"${id.source_digest}\"`) || !requirementReport.includes(`flow_sha256=\"${requirementEvidence.flow_sha256}\"`) || !validated) fail("verify_invalid");
    return Object.freeze({ ok: true, mode, run_id: runId });
  }
  if (files.some(exists) || exists(outputPath(runId, "calendar-failure.json"))) fail("output_exists");
  const acquireLease = dependencies.acquireLease ?? (() => { fail("lease_required"); });
  const releaseLease = dependencies.releaseLease ?? (() => true);
  const snapshotSettings = dependencies.snapshotSettings ?? (() => { fail("settings_snapshot_required"); });
  const restoreSettings = dependencies.restoreSettings ?? (() => false);
  const executeNative = dependencies.executeNative ?? (() => { fail("native_executor_required"); });
  const write = dependencies.writeImmutable ?? ((file, value) => {
    const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, Buffer.isBuffer(value) ? value : typeof value === "string" ? value : `${JSON.stringify(value)}\n`, { flag: "wx" });
  });
  const writeFailure = dependencies.writeFailureReceipt ?? ((value) => write(outputPath(runId, "calendar-failure.json"), value));
  let lease; let settings; let restored = false;
  try {
    lease = await acquireLease();
    settings = await snapshotSettings(lease);
    const native = validatedStages(await executeNative(lease, settings, { run_id: runId, flow_sha256: flowSha256, flow_revision: FLOW_REVISION }), flowSha256, testFixture);
    validateNativeReceipt(native.native_receipt, { ...id, run_id: runId }, native);
    const registry = Object.freeze({ schema_version: 1, producer: "v12-calendar-artifact-registry/v1", run_id: runId,
      execution_origin_sha256: sha(native.execution_origin), members: native.artifact_descriptors });
    const requirementEvidence = Object.freeze({ schema_version: 1, producer: "v12-calendar-requirements/v1", run_id: runId,
      identity: id, execution_origin: native.execution_origin, flow_sha256: native.requirements.flow_sha256,
      fixture_id: native.requirements.fixture_id, records: native.requirements.records, junit_cases: native.requirements.junit_cases });
    const output = { schema_version: 4, producer: "v12-calendar-shard/v5", run_id: runId, identity: id,
      execution_origin: native.execution_origin, flow_sha256: native.flow_sha256, flow_revision: native.flow_revision,
      native_receipt: native.native_receipt, artifact_registry_sha256: sha(registry), stages: native.stages, junit_cases: native.junit_cases };
    noPrivate(output);
    for (const artifact of native.artifacts) await write(`artifacts/native/v1.2/${runId}/${artifact.relative_path}`, Buffer.from(artifact.bytes_base64, "base64"));
    await write(files[0], output); await write(files[1], requirementEvidence);
    await write(files[2], xml(native.stages, id, flowSha256)); await write(files[3], requirementsXml(native.requirements, id)); await write(files[4], registry);
    return Object.freeze({ ok: true, mode, run_id: runId });
  } catch (error) {
    try { await writeFailure({ schema_version: 1, producer: "v12-calendar-shard/v5", run_id: runId, identity: id,
      failure_stage: settings === undefined ? "lease" : "native", failure_code: "execution_failed",
      failure_digest: sha({ runId, source: id.source_digest, code: "execution_failed" }) }); }
    catch { fail("failure_receipt_write_failed"); }
    throw error;
  } finally {
    if (settings !== undefined) restored = await restoreSettings(settings, lease) === true;
    if (lease !== undefined && restored) await releaseLease(lease);
    if (settings !== undefined && !restored) fail("settings_restore_failed");
  }
}
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
