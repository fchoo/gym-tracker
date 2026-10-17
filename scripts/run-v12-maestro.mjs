import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateV12RunManifest as validateGenericV12RunManifest } from "./create-v12-run-manifest.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { exactKeys } from "./node-evidence-utils.mjs";
import {
  initializeV12CalendarRun,
  readV12CalendarRunState,
  recordV12CalendarStageResult,
} from "./v12-calendar-artifacts.mjs";
import { publishV12AtomicShard, recordV12AtomicFailure } from "./v12-atomic-shard-publication.mjs";
import {
  resolveV12NativeExecutionTools,
  V12_PRODUCTION_EXECUTION_ORIGIN,
  V12_TEST_EXECUTION_ORIGIN,
} from "./v12-native-execution-origin.mjs";
import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_CHUNK_MARKER,
  V12_CALENDAR_STAGE_GROUPS,
  V12_CALENDAR_STAGE_IDS,
} from "./v12-calendar-observation-contract.mjs";

const ROOT = process.cwd();
const FLOW = "maestro/v1.2/calendar.yaml";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_HEAD = /^[a-f0-9]{40}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const RUNNER_SOURCE = fileURLToPath(import.meta.url);
const LIVE_GENERIC_SHARDS = Object.freeze(["multi-plan", "workout", "library-running"]);
const sourceSha256 = (file) => {
  try { return sha256(readFileSync(file)); }
  catch { genericFail("toolchain_invalid"); }
};

const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const V12_PACKAGE = "com.fchoo.gymtracker.devtest";

export const V12_MAESTRO_FLOW_CONTRACTS = Object.freeze({
  sqlite: Object.freeze({ flow: "maestro/v1.2/sqlite.yaml", sources: Object.freeze(["scripts/v12-sqlite-shard.mjs"]) }),
  recovery: Object.freeze({ flow: "maestro/v1.2/recovery.yaml", sources: Object.freeze(["scripts/v12-recovery-shard.mjs"]) }),
  garmin: Object.freeze({ flow: "maestro/v1.2/garmin-progress.yaml", sources: Object.freeze(["scripts/v12-garmin-shard.mjs"]) }),
  calendar: Object.freeze({ flow: "maestro/v1.2/calendar.yaml", sources: Object.freeze(["scripts/v12-calendar-shard.mjs"]) }),
  "multi-plan": Object.freeze({ flow: "maestro/v1.2/multi-plan.yaml", sources: Object.freeze(["src/testing/contracts/multiPlanRunning.contract.ts"]), prefix: "phase13-" }),
  workout: Object.freeze({ flow: "maestro/v1.2/workout.yaml", sources: Object.freeze(["src/testing/contracts/phase15Workout.contract.ts"]), prefix: "workout." }),
  "library-running": Object.freeze({ flow: "maestro/v1.2/library-running.yaml", sources: Object.freeze(["src/testing/contracts/phase17LibraryRunning.contract.ts"]), prefix: "library." }),
  accessibility: Object.freeze({ flow: "maestro/v1.2/accessibility.yaml", sources: Object.freeze(["scripts/v12-accessibility-shard.mjs"]) }),
});

function genericFail(code) {
  throw new Error(`v12_maestro_${code}`);
}

function exactGenericArguments(args) {
  if (!Array.isArray(args) || args.length !== 4 || args[0] !== "--run" || args[2] !== "--shard"
    || !V12_RUN_ID.test(args[1] ?? "") || !Object.hasOwn(V12_MAESTRO_FLOW_CONTRACTS, args[3] ?? "")) {
    genericFail("arguments_invalid");
  }
  return Object.freeze({ runId: args[1], shard: args[3] });
}

function genericIdentityMatches(manifest, current) {
  const expected = {
    head: manifest.source.head,
    tree_sha256: manifest.source.tree_sha256,
    package: manifest.build.package,
    apk_sha256: manifest.build.apk.sha256,
    installed_apk_sha256: manifest.device.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: manifest.device.identity_sha256,
    settings_sha256: manifest.device.settings_sha256,
    configuration_id: manifest.configuration.id,
  };
  if (Object.entries(expected).some(([key, value]) => current?.[key] !== value)) genericFail("identity_mismatch");
}

function containsVerdictAuthority(value) {
  if (Array.isArray(value)) return value.some(containsVerdictAuthority);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => (
    ["verdict", "readiness", "final_evidence", "seal"].includes(key) || containsVerdictAuthority(child)
  ));
}

function immutableWrite(root, relativePath, value, write = undefined) {
  if (typeof write === "function") return write(relativePath, value);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(absolute)) genericFail("immutable_output_invalid");
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
}

function sourceOrderedCaseIds(bytes, prefix) {
  if (typeof prefix !== "string") return Object.freeze([]);
  const ids = [...bytes.toString("utf8").matchAll(/\[\s*["']([^"']+)["']/gu)]
    .map(([, id]) => id)
    .filter((id) => id.startsWith(prefix));
  const ordered = [...new Set(ids)];
  if (ordered.length === 0) genericFail("source_case_ids_invalid");
  return Object.freeze(ordered);
}

function validateSourceOrderedObservations(observations, caseIds, shard) {
  if (!Array.isArray(observations) || observations.length !== caseIds.length) genericFail("observation_count_invalid");
  const seen = new Set();
  for (const [index, observation] of observations.entries()) {
    if (!observation || observation.case_id !== caseIds[index] || observation.ordinal !== index + 1
      || observation.fixture_id !== "v12-synthetic-fixtures-r18" || typeof observation.report_sha256 !== "string"
      || !SHA256.test(observation.report_sha256) || seen.has(observation.case_id)
      || containsVerdictAuthority(observation)) genericFail("observation_mapping_invalid");
    seen.add(observation.case_id);
  }
  if (seen.size !== caseIds.length || shard === "recovery") genericFail("observation_mapping_invalid");
}

function resolvedExecutionTools(value) {
  if (!value || ![V12_PRODUCTION_EXECUTION_ORIGIN, V12_TEST_EXECUTION_ORIGIN].includes(value.execution_origin)) genericFail("toolchain_invalid");
  const resolved = { execution_origin: value.execution_origin };
  for (const name of ["adb", "maestro", "unzip"]) {
    if (typeof value[name] !== "string" || !path.isAbsolute(value[name])) genericFail("toolchain_invalid");
    try {
      const executable = realpathSync(value[name]);
      if (!path.isAbsolute(executable) || !statSync(executable).isFile()) genericFail("toolchain_invalid");
      accessSync(executable, constants.X_OK);
      resolved[name] = executable;
    } catch (error) {
      if (error instanceof Error && error.message === "v12_maestro_toolchain_invalid") throw error;
      genericFail("toolchain_invalid");
    }
  }
  return Object.freeze(resolved);
}

function executionOrigin({ runId, shard, manifest, snapshot, tools, sourceFile }) {
  const production = tools.execution_origin === V12_PRODUCTION_EXECUTION_ORIGIN;
  return Object.freeze({
    schema_version: 1,
    action: shard,
    kind: production ? "production-default-launcher" : "test-fixture",
    toolchain_origin: tools.execution_origin,
    default_launcher: production,
    test_only: !production,
    adapter_source_sha256: sourceSha256(RUNNER_SOURCE),
    launcher_source_sha256: sourceSha256(RUNNER_SOURCE),
    domain_source_sha256: snapshot.source_sha256[sourceFile],
    request_attestation_sha256: sha256(JSON.stringify({
      schema_version: 1,
      action: shard,
      run_id: runId,
      source_tree_sha256: manifest.source.tree_sha256,
      apk_sha256: manifest.build.apk.sha256,
      device_identity_sha256: manifest.device.identity_sha256,
      flow_sha256: snapshot.flow_sha256,
      source_sha256: snapshot.source_sha256,
      tool_sha256: {
        adb: sourceSha256(tools.adb),
        maestro: sourceSha256(tools.maestro),
        unzip: sourceSha256(tools.unzip),
      },
    })),
  });
}

export function executeGenericV12Maestro(args = process.argv.slice(2), dependencies = {}) {
  const { runId, shard } = exactGenericArguments(args);
  const root = dependencies.root ?? ROOT;
  const contract = V12_MAESTRO_FLOW_CONTRACTS[shard];
  const manifestPath = `artifacts/native/v1.2/${runId}/build.json`;
  const readJson = dependencies.readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const readBytes = dependencies.readBytes ?? ((file) => readFileSync(path.join(root, file)));
  const exists = dependencies.exists ?? ((file) => existsSync(path.join(root, file)));
  if (!exists(manifestPath) || !exists(contract.flow) || contract.sources.some((file) => !exists(file))) genericFail("artifact_missing");
  const manifest = readJson(manifestPath);
  try { validateGenericV12RunManifest(manifest); }
  catch { genericFail("manifest_invalid"); }
  if (manifest.run_id !== runId || manifest.mode !== "live" || manifest.build.package !== V12_PACKAGE) genericFail("manifest_invalid");
  genericIdentityMatches(manifest, dependencies.currentIdentity);

  const snapshot = () => Object.freeze({
    flow_sha256: sha256(readBytes(contract.flow)),
    source_sha256: Object.freeze(Object.fromEntries(contract.sources.map((file) => [file, sha256(readBytes(file))]))),
  });
  const before = snapshot();
  const caseIds = contract.prefix === undefined ? Object.freeze([]) : sourceOrderedCaseIds(readBytes(contract.sources[0]), contract.prefix);
  const adapter = dependencies.adapter;
  if (!adapter || typeof adapter.snapshotSettings !== "function" || typeof adapter.execute !== "function" || typeof adapter.restoreSettings !== "function") genericFail("adapter_invalid");
  const settings = adapter.snapshotSettings();
  let result;
  let executionError;
  try {
    result = adapter.execute(Object.freeze({ run_id: runId, shard, flow: contract.flow, settings }));
    if (containsVerdictAuthority(result)) genericFail("producer_verdict_forbidden");
  } catch (error) {
    executionError = error;
  } finally {
    if (adapter.restoreSettings(settings) !== true) genericFail("settings_restore_failed");
  }
  if (executionError !== undefined) throw executionError;
  const after = snapshot();
  if (before.flow_sha256 !== after.flow_sha256) genericFail("flow_hash_mismatch");
  if (JSON.stringify(before.source_sha256) !== JSON.stringify(after.source_sha256)) genericFail("source_hash_mismatch");
  const rawObservations = structuredClone(result?.observations ?? []);
  if (caseIds.length > 0) validateSourceOrderedObservations(rawObservations, caseIds, shard);
  const record = Object.freeze({
    schema_version: 1,
    producer: "v12-maestro-runner/v1",
    run_id: runId,
    shard,
    identity: Object.freeze({
      source_tree_sha256: manifest.source.tree_sha256,
      apk_sha256: manifest.build.apk.sha256,
      installed_apk_sha256: manifest.device.installed_apk_sha256,
      certificate_sha256: manifest.build.apk.certificate_sha256,
      device_identity_sha256: manifest.device.identity_sha256,
      settings_sha256: manifest.device.settings_sha256,
      configuration_id: manifest.configuration.id,
    }),
    flow_sha256: before.flow_sha256,
    source_sha256: before.source_sha256,
    case_ids: caseIds,
    observations: Object.freeze(rawObservations),
  });
  if (["multi-plan", "workout", "library-running"].includes(shard)) {
    immutableWrite(root, `artifacts/native/v1.2/${runId}/mapping/${shard}.json`, record, dependencies.writeImmutableJson);
  } else immutableWrite(root, `artifacts/native/v1.2/${runId}/shards/${shard}.json`, record, dependencies.writeImmutableJson);
  return record;
}

/**
 * Executes a generic source-owned Maestro flow with an ephemeral device lease.
 * It is intentionally separate from recovery: recovery carries destructive-cut
 * semantics that cannot be safely inferred for normal product flows.
 */
export function executeLiveV12GenericMaestro(args = process.argv.slice(2), dependencies = {}) {
  const { runId, shard } = exactGenericArguments(args);
  if (shard === "recovery") return executeLiveV12RecoveryMaestro(args, dependencies);
  if (!LIVE_GENERIC_SHARDS.includes(shard)) genericFail("live_shard_invalid");
  const root = dependencies.root ?? ROOT;
  const readJson = dependencies.readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const manifest = readJson(`artifacts/native/v1.2/${runId}/build.json`);
  try { validateGenericV12RunManifest(manifest); } catch { genericFail("manifest_invalid"); }
  if (manifest.run_id !== runId || manifest.mode !== "live" || manifest.build.package !== V12_PACKAGE) genericFail("manifest_invalid");
  const sourceIdentity = validateV12LiveSourceLineage(manifest, dependencies);
  genericIdentityMatches(manifest, dependencies.currentIdentity ?? liveIdentity(manifest, root, sourceIdentity));
  const contract = V12_MAESTRO_FLOW_CONTRACTS[shard];
  const flowPath = path.join(root, contract.flow);
  if (!existsSync(flowPath)) genericFail("artifact_missing");
  const sourceBytes = readFileSync(path.join(root, contract.sources[0]));
  const caseIds = sourceOrderedCaseIds(sourceBytes, contract.prefix);
  const serial = dependencies.serial ?? process.env.V12_DEVICE_SERIAL;
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]+$/u.test(serial) || serial.startsWith("emulator-")) genericFail("ephemeral_device_required");
  const execute = dependencies.execFileSync ?? execFileSync;
  const tools = resolvedExecutionTools(dependencies.executionTools
    ?? resolveV12NativeExecutionTools({ domain: true, env: dependencies.environment ?? process.env }));
  assertMaestroVersion(execute, tools.maestro);
  const outputRoot = `artifacts/native/v1.2/${runId}`;
  const reportPath = `${outputRoot}/maestro/${shard}.xml`;
  const mappingPath = `${outputRoot}/mapping/${shard}.json`;
  const leasePath = path.join(root, `${outputRoot}/.leases/${shard}-${serial}.lease`);
  if ([reportPath, mappingPath].some((file) => existsSync(path.join(root, file))) || existsSync(leasePath)) genericFail("immutable_output_invalid");
  mkdirSync(path.dirname(leasePath), { recursive: true });
  writeFileSync(leasePath, `${sha256(serial)}\n`, { flag: "wx" });
  const adb = dependencies.adb ?? ((...command) => {
    try { return execute(tools.adb, ["-s", serial, ...command], { encoding: "utf8" }).trim(); }
    catch { genericFail("native_command_failed"); }
  });
  const reports = [];
  let restored = false;
  let outcome;
  let previousSettings;
  try {
    previousSettings = Object.freeze({
      font_scale: adb("shell", "settings", "get", "system", "font_scale"),
      animator_duration_scale: adb("shell", "settings", "get", "global", "animator_duration_scale"),
    });
    for (const [index, caseId] of caseIds.entries()) {
      const temporary = path.join(root, `${outputRoot}/maestro/.${shard}-${index + 1}.xml`);
      mkdirSync(path.dirname(temporary), { recursive: true });
      try {
        execute(tools.maestro, ["test", "--device", serial, "-e", `V12_CASE_ID=${caseId}`, "-e", "V12_CONFIG_ID=AP-L-C390-P-F100", "-e", "V12_FIXTURE_ID=v12-synthetic-fixtures-r18", "--format", "junit", "--output", temporary, flowPath], { stdio: "inherit" });
      } catch { genericFail("native_command_failed"); }
      if (!existsSync(temporary)) genericFail("report_missing");
      reports.push(readFileSync(temporary, "utf8"));
      unlinkSync(temporary);
    }
    const reportText = `<testsuites source_tree_sha256="${manifest.source.tree_sha256}" apk_sha256="${manifest.build.apk.sha256}" installed_apk_sha256="${manifest.device.installed_apk_sha256}" device_identity_sha256="${manifest.device.identity_sha256}">${reports.join("")}</testsuites>\n`;
    const flowSha256 = sha256(readFileSync(flowPath));
    const observations = caseIds.map((caseId, index) => Object.freeze({ case_id: caseId, ordinal: index + 1, fixture_id: "v12-synthetic-fixtures-r18", report_sha256: sha256(reports[index]) }));
    const sourceSnapshot = Object.freeze({ flow_sha256: flowSha256, source_sha256: Object.freeze({ [contract.sources[0]]: sha256(sourceBytes) }) });
    const provenance = executionOrigin({ runId, shard, manifest, snapshot: sourceSnapshot, tools, sourceFile: contract.sources[0] });
    const mapping = Object.freeze({ schema_version: 1, producer: "v12-maestro-source-map/v1", run_id: runId, shard, identity: Object.freeze({ source_tree_sha256: manifest.source.tree_sha256, apk_sha256: manifest.build.apk.sha256, installed_apk_sha256: manifest.device.installed_apk_sha256, certificate_sha256: manifest.build.apk.certificate_sha256, device_identity_sha256: manifest.device.identity_sha256, settings_sha256: manifest.device.settings_sha256, configuration_id: manifest.configuration.id }), execution_origin: provenance, flow_sha256: flowSha256, source_sha256: sourceSnapshot.source_sha256, case_ids: caseIds, observations });
    validateSourceOrderedObservations(observations, caseIds, shard);
    const writeReport = dependencies.writeReport ?? ((file, value) => {
      const absoluteReport = path.join(root, file);
      mkdirSync(path.dirname(absoluteReport), { recursive: true });
      writeFileSync(absoluteReport, value, { flag: "wx" });
    });
    writeReport(reportPath, reportText);
    immutableWrite(root, mappingPath, mapping, dependencies.writeImmutableJson);
    outcome = Object.freeze({ run_id: runId, shard, report: reportPath, mapping: mappingPath, cases: caseIds.length, execution_origin: provenance });
  } finally {
    try {
      if (previousSettings !== undefined) {
        adb("shell", "settings", "put", "system", "font_scale", previousSettings.font_scale);
        adb("shell", "settings", "put", "global", "animator_duration_scale", previousSettings.animator_duration_scale);
        restored = adb("shell", "settings", "get", "system", "font_scale") === previousSettings.font_scale
          && adb("shell", "settings", "get", "global", "animator_duration_scale") === previousSettings.animator_duration_scale;
      }
    } finally { unlinkSync(leasePath); }
  }
  if (!restored) genericFail("settings_restore_failed");
  return outcome;
}

export function validateV12LiveSourceLineage(manifest, dependencies = {}) {
  const root = dependencies.root ?? ROOT;
  const currentHead = dependencies.currentHead
    ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const sourceDigest = dependencies.sourceDigest ?? sourceTreeSha256(root);
  const isAncestor = dependencies.isAncestor ?? ((ancestor, descendant) => {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
  if (!GIT_HEAD.test(manifest?.source?.head ?? "") || !SHA256.test(manifest?.source?.tree_sha256 ?? "") || !GIT_HEAD.test(currentHead)) {
    genericFail("identity_mismatch");
  }
  if (isAncestor(manifest.source.head, currentHead) !== true) genericFail("source_lineage_mismatch");
  if (sourceDigest !== manifest.source.tree_sha256) genericFail("source_tree_mismatch");
  return Object.freeze({
    head: manifest.source.head,
    tree_sha256: manifest.source.tree_sha256,
  });
}

function liveIdentity(manifest, root, sourceIdentity) {
  return {
    head: sourceIdentity.head,
    tree_sha256: sourceIdentity.tree_sha256,
    package: manifest.build.package,
    apk_sha256: manifest.build.apk.sha256,
    installed_apk_sha256: manifest.device.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: manifest.device.identity_sha256,
    settings_sha256: manifest.device.settings_sha256,
    configuration_id: manifest.configuration.id,
  };
}

function assertMaestroVersion(execute = execFileSync, maestro = "maestro") {
  let version;
  try { version = execute(maestro, ["--version"], { encoding: "utf8" }).trim(); }
  catch { genericFail("maestro_version_invalid"); }
  if (!/(?:^|\s)2\.8\.0(?:\s|$)/u.test(version)) genericFail("maestro_version_invalid");
}

export function executeLiveV12RecoveryMaestro(args = process.argv.slice(2), dependencies = {}) {
  const { runId, shard } = exactGenericArguments(args);
  if (shard !== "recovery") genericFail("live_shard_invalid");
  const root = dependencies.root ?? ROOT;
  const manifest = (dependencies.readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8"))))(`artifacts/native/v1.2/${runId}/build.json`);
  try { validateGenericV12RunManifest(manifest); } catch { genericFail("manifest_invalid"); }
  if (manifest.run_id !== runId || manifest.mode !== "live") genericFail("manifest_invalid");
  const sourceIdentity = validateV12LiveSourceLineage(manifest, {
    root,
    currentHead: dependencies.currentHead,
    sourceDigest: dependencies.sourceDigest,
    isAncestor: dependencies.isAncestor,
  });
  genericIdentityMatches(manifest, dependencies.currentIdentity ?? liveIdentity(manifest, root, sourceIdentity));
  const flow = V12_MAESTRO_FLOW_CONTRACTS.recovery.flow;
  if (!(dependencies.exists ?? ((file) => existsSync(path.join(root, file))))(flow)) genericFail("artifact_missing");
  const execute = dependencies.execFileSync ?? execFileSync;
  assertMaestroVersion(execute);
  const output = path.join(root, `artifacts/native/v1.2/${runId}/maestro/recovery.xml`);
  const writeReport = dependencies.writeReport ?? ((file, content) => {
    if (existsSync(file)) genericFail("immutable_output_invalid");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, { flag: "wx" });
  });
  const serial = dependencies.serial ?? "emulator-5554";
  const adb = dependencies.adb ?? ((...command) => execute("adb", ["-s", serial, ...command], { encoding: "utf8" }).trim());
  const priorAirplane = adb("shell", "settings", "get", "global", "airplane_mode_on");
  const reports = [];
  let restored = false;
  try {
    for (const caseId of ["legacy-playback", "foreground-reconciliation", "queued-callback", "relaunch", "restore", "merge", "zero-cue", "between-set-rest-pointer"]) {
      for (const cut of ["pre-transaction", "in-transaction", "post-commit-before-ack", "post-acknowledgement", "relaunch", "retry", "offline", "recovery"]) {
        const temporary = path.join(root, `artifacts/native/v1.2/${runId}/maestro/.${caseId}-${cut}.xml`);
        execute("maestro", ["test", "--device", serial, "-e", `V12_RECOVERY_CASE=${caseId}`, "-e", `V12_RECOVERY_STAGE=${cut}`, "--format", "junit", "--output", temporary, path.join(root, flow)], { stdio: "inherit" });
        if (!existsSync(temporary)) genericFail("report_missing");
        reports.push(readFileSync(temporary, "utf8"));
      }
    }
    writeReport(output, `<testsuites>${reports.join("")}</testsuites>\n`);
  } finally {
    adb("shell", "settings", "put", "global", "airplane_mode_on", priorAirplane);
    restored = adb("shell", "settings", "get", "global", "airplane_mode_on") === priorAirplane;
  }
  if (!restored) genericFail("settings_restore_failed");
  return Object.freeze({ ok: true, run_id: runId, shard, report: path.relative(root, output), cases: 8, cuts: 64 });
}
export const V12_CALENDAR_DIAGNOSTIC_STAGES = V12_CALENDAR_STAGE_IDS;

const IN_APP_GESTURE_STAGES = new Set([
  ...V12_CALENDAR_STAGE_GROUPS.pointer,
  ...V12_CALENDAR_STAGE_GROUPS.input_interrupt,
]);

export function validateV12CalendarManifest(manifest, current = {}) {
  if (!exactKeys(manifest, ["schema_version", "suite", "profile", "package", "js_bundle", "base_head", "source_tree_sha256", "source_manifest_sha256", "reference_map_sha256", "apk", "installed_apk", "device", "report_sha256"])) throw new Error("v12_calendar_manifest_invalid");
  if ([!exactKeys(manifest.js_bundle, ["embedded"]), !exactKeys(manifest.apk, ["path", "sha256", "size_bytes"]), !exactKeys(manifest.installed_apk, ["sha256", "matches_retained_apk"]), !exactKeys(manifest.device, ["identity_sha256"])].some(Boolean)) throw new Error("v12_calendar_manifest_invalid");
  if ([
    manifest.schema_version !== 1,
    manifest.suite !== "v1.2-calendar",
    manifest.profile !== "development-test",
    manifest.package !== PACKAGE,
    manifest.js_bundle.embedded !== true,
    !GIT_HEAD.test(manifest.base_head),
    !SHA256.test(manifest.source_tree_sha256),
    !SHA256.test(manifest.source_manifest_sha256),
    !SHA256.test(manifest.reference_map_sha256),
    !SHA256.test(manifest.apk.sha256),
    manifest.installed_apk.matches_retained_apk !== true,
    manifest.installed_apk.sha256 !== manifest.apk.sha256,
    !SHA256.test(manifest.device.identity_sha256),
    !SHA256.test(manifest.report_sha256),
  ].some(Boolean)) throw new Error("v12_calendar_manifest_invalid");
  if (current.head !== undefined && manifest.base_head !== current.head) throw new Error("v12_calendar_manifest_stale_head");
  if (current.source !== undefined && manifest.source_tree_sha256 !== current.source) throw new Error("v12_calendar_manifest_stale_source");
  return true;
}

export function validateV12CalendarFlow(flow) {
  const route = "gymtracker-devtest://calendar?phase20CalendarStage=${V12_CALENDAR_STAGE}&phase20CalendarNonce=${V12_CALENDAR_NONCE}&phase20CalendarFlowSha256=${V12_CALENDAR_FLOW_SHA256}&phase20CalendarFlowRevision=${V12_CALENDAR_FLOW_REVISION}";
  if (typeof flow !== "string" || !flow.includes("Phase 20 real Calendar native observation")
    || flow.split(route).length - 1 !== 1 || !flow.includes(`V12_CALENDAR_FLOW_REVISION == '${V12_CALENDAR_FLOW_REVISION}'`)
    || /PHASE16|synthetic|expected_outcome|\bPASS\b/u.test(flow)) throw new Error("v12_calendar_flow_invalid");
  for (const stage of V12_CALENDAR_DIAGNOSTIC_STAGES) {
    const marker = `V12_CALENDAR_STAGE == '${stage}'`;
    const start = flow.indexOf(marker);
    if (start < 0 || flow.split(marker).length !== 2) throw new Error(`v12_calendar_stage_missing:${stage}`);
    const next = flow.indexOf("- runFlow:", start);
    const block = flow.slice(start, next < 0 ? flow.length : next);
    if (IN_APP_GESTURE_STAGES.has(stage)) {
      if (!/swipe:\s*\{/u.test(block) || !/start:.*end:.*duration:/us.test(block)
        || /pressKey: BACK/u.test(block)) throw new Error(`v12_calendar_flow_stage_invalid:${stage}`);
    }
  }
  if (!flow.includes('takeScreenshot: "calendar-${V12_CALENDAR_STAGE}"')) throw new Error("v12_calendar_capture_missing");
  return true;
}

export function createV12CalendarRunnerPlan(manifest) {
  return Object.freeze({
    suite: "v1.2-acceptance",
    native_execution: "NOT_RUN",
    package: manifest.package,
    stages: V12_CALENDAR_DIAGNOSTIC_STAGES,
    observation_source: "/calendar",
    terminal_marker: V12_CALENDAR_CHUNK_MARKER,
    flow_revision: V12_CALENDAR_FLOW_REVISION,
    flow_sha256: sha256(readFileSync(path.join(ROOT, FLOW))),
    identity: { base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, source_manifest_sha256: manifest.source_manifest_sha256, reference_map_sha256: manifest.reference_map_sha256, apk_sha256: manifest.apk.sha256, device_identity_sha256: manifest.device.identity_sha256 },
    prohibited_verdicts: ["PASS", "FAIL"],
  });
}

export function initializeV12CalendarRunnerState({ root, runId }) {
  return initializeV12CalendarRun({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES });
}

export function readV12CalendarRunnerState({ root, runId }) {
  return readV12CalendarRunState({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES });
}

export function recordV12CalendarRunnerStage({ root, runId, stageId, status, artifactSha256 }) {
  return recordV12CalendarStageResult({
    root,
    runId,
    stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES,
    stageId,
    status,
    artifactSha256,
  });
}

export function executeV12Maestro(args = process.argv.slice(2), dependencies = {}) {
  if (args.includes("--run") || args.includes("--shard")) return executeGenericV12Maestro(args, dependencies);
  if (!args.includes("--diagnostic")) throw new Error("v12_calendar_diagnostic_flag_required");
  const manifestIndex = args.indexOf("--manifest");
  if ([manifestIndex < 0, manifestIndex >= 0 && args[manifestIndex + 1] === undefined].some(Boolean)) throw new Error("v12_calendar_manifest_required");
  const root = dependencies.root ?? ROOT;
  const manifestPath = path.resolve(root, args[manifestIndex + 1]);
  const fileExists = dependencies.exists ?? existsSync;
  if (!fileExists(manifestPath)) throw new Error("v12_calendar_manifest_missing");
  const readText = dependencies.readText ?? ((file) => readFileSync(file, "utf8"));
  const manifest = JSON.parse(readText(manifestPath));
  const head = dependencies.head ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const source = dependencies.source ?? sourceTreeSha256(root);
  validateV12CalendarManifest(manifest, { head, source });
  validateV12CalendarFlow(readText(path.join(root, FLOW)));
  throw new Error("v12_calendar_native_execution_phase20_only");
}

export function runV12MaestroCli(args = process.argv.slice(2), io = process, dependencies = {}) {
  try {
    if (args.includes("--run")) {
      const { runId, shard } = exactGenericArguments(args);
      if (shard === "recovery") {
        io.stdout.write(`${JSON.stringify(executeLiveV12RecoveryMaestro(args, dependencies))}\n`);
      } else {
        const writes = [];
        const result = executeLiveV12GenericMaestro(args, {
          ...dependencies,
          writeReport: (file, value) => writes.push([file.replace(`artifacts/native/v1.2/${runId}/`, ""), value]),
          writeImmutableJson: (file, value) => writes.push([file.replace(`artifacts/native/v1.2/${runId}/`, ""), value]),
        });
        publishV12AtomicShard({ root: dependencies.root, runId, shard, executionOrigin: result.execution_origin,
          produce: ({ write }) => writes.forEach(([file, value]) => write(file, value)) });
        io.stdout.write(`${JSON.stringify(result)}\n`);
      }
    } else io.stdout.write(`${JSON.stringify(executeV12Maestro(args))}\n`);
    return 0;
  } catch (error) {
    const runIndex = args.indexOf("--run"); const shardIndex = args.indexOf("--shard");
    const runId = runIndex >= 0 ? args[runIndex + 1] : undefined; const shard = shardIndex >= 0 ? args[shardIndex + 1] : undefined;
    if (V12_RUN_ID.test(runId ?? "") && typeof shard === "string" && shard !== "recovery") { try { recordV12AtomicFailure({ root: dependencies.root, runId, shard, error }); } catch { /* first receipt wins */ } }
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

/* node:coverage ignore next 4 */
if (process.argv[1]?.endsWith("run-v12-maestro.mjs")) {
  process.exitCode = runV12MaestroCli();
}
