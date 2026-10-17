import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { validateV12RunManifest as validateGenericV12RunManifest } from "./create-v12-run-manifest.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { exactKeys } from "./node-evidence-utils.mjs";
import {
  initializeV12CalendarRun,
  readV12CalendarRunState,
  recordV12CalendarStageResult,
} from "./v12-calendar-artifacts.mjs";
import { publishV12AtomicShard, recordV12AtomicFailure } from "./v12-atomic-shard-publication.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import {
  digestV12CanonicalRestorationSnapshot,
  readV12CanonicalRestorationSnapshot,
  V12_CANONICAL_RESTORATION_SETTINGS,
} from "./v12-device-settings-contract.mjs";
import {
  readV12RetainedGitExecution,
  resolveV12GitExecution,
  resolveV12NativeExecutionTools,
  V12_PRODUCTION_EXECUTION_ORIGIN,
  V12_TEST_EXECUTION_ORIGIN,
} from "./v12-native-execution-origin.mjs";
import { V12_RECOVERY_CASE_IDS, V12_RECOVERY_CUT_IDS, V12_RECOVERY_STEPS } from "./v12-recovery-shard.mjs";
import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_CHUNK_MARKER,
  V12_CALENDAR_STAGE_GROUPS,
  V12_CALENDAR_STAGE_IDS,
} from "./v12-calendar-observation-contract.mjs";
import {
  deriveV12MaestroCaseIdsFromSource,
  V12_MAESTRO_FUNCTIONAL_REGISTRIES,
} from "./v12-maestro-source-registry.mjs";

const ROOT = process.cwd();
const FLOW = "maestro/v1.2/calendar.yaml";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_HEAD = /^[a-f0-9]{40}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const LIVE_GENERIC_SHARDS = Object.freeze(["multi-plan", "workout", "library-running"]);
const DIRECT_MAESTRO_TOOL_NAMES = Object.freeze(["adb", "maestro", "unzip"]);
const DIRECT_MAESTRO_TOOL_VERSIONS = Object.freeze({
  adb: Object.freeze(["version"]),
  maestro: Object.freeze(["--version"]),
  unzip: Object.freeze(["-v"]),
});
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
  "multi-plan": Object.freeze({ flow: "maestro/v1.2/multi-plan.yaml", sources: Object.freeze([V12_MAESTRO_FUNCTIONAL_REGISTRIES["multi-plan"].source]), prefix: V12_MAESTRO_FUNCTIONAL_REGISTRIES["multi-plan"].prefix }),
  workout: Object.freeze({ flow: "maestro/v1.2/workout.yaml", sources: Object.freeze([V12_MAESTRO_FUNCTIONAL_REGISTRIES.workout.source]), prefix: V12_MAESTRO_FUNCTIONAL_REGISTRIES.workout.prefix }),
  "library-running": Object.freeze({ flow: "maestro/v1.2/library-running.yaml", sources: Object.freeze([V12_MAESTRO_FUNCTIONAL_REGISTRIES["library-running"].source]), prefix: V12_MAESTRO_FUNCTIONAL_REGISTRIES["library-running"].prefix }),
  accessibility: Object.freeze({ flow: "maestro/v1.2/accessibility.yaml", sources: Object.freeze(["scripts/v12-accessibility-shard.mjs"]) }),
});

export const V12_MAESTRO_SOURCE_PATHS = Object.freeze(Object.fromEntries(
  LIVE_GENERIC_SHARDS.map((shard) => [shard, Object.freeze({
    adapter: "scripts/run-v12-maestro.mjs",
    launcher: "scripts/run-v12-maestro.mjs",
    domain: V12_MAESTRO_FLOW_CONTRACTS[shard].sources[0],
  })]),
));

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

function sourceOrderedCaseIds(bytes, shard) {
  try { return deriveV12MaestroCaseIdsFromSource(shard, bytes.toString("utf8")); }
  catch { genericFail("source_case_ids_invalid"); }
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
  if (!value || ![V12_PRODUCTION_EXECUTION_ORIGIN, V12_TEST_EXECUTION_ORIGIN].includes(value.execution_origin)
    || value.test_only !== (value.execution_origin === V12_TEST_EXECUTION_ORIGIN)) genericFail("toolchain_invalid");
  const resolved = { execution_origin: value.execution_origin, test_only: value.test_only };
  for (const name of DIRECT_MAESTRO_TOOL_NAMES) {
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

function toolVersion(execute, name, executable, testOnly) {
  if (testOnly) return "test-controlled";
  let output;
  try { output = execute(executable, DIRECT_MAESTRO_TOOL_VERSIONS[name], { encoding: "utf8", maxBuffer: 64 * 1024, timeout: 10_000 }); }
  catch { genericFail("toolchain_invalid"); }
  const line = String(output).split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  if (line === undefined || line.length > 512 || /[\u0000-\u001f\u007f]/u.test(line)) genericFail("toolchain_invalid");
  return line;
}

export function createV12DirectMaestroToolAttestation({ execute = execFileSync, executionTools, shard } = {}) {
  const tools = resolvedExecutionTools(executionTools);
  if (!LIVE_GENERIC_SHARDS.includes(shard)) genericFail("tool_attestation_invalid");
  return Object.freeze({
    schema_version: 1,
    action: shard,
    execution_origin: tools.execution_origin,
    test_only: tools.test_only,
    tools: Object.freeze(DIRECT_MAESTRO_TOOL_NAMES.map((name) => Object.freeze({
      name,
      executable_realpath_sha256: sha256(tools[name]),
      executable_sha256: sourceSha256(tools[name]),
      version: toolVersion(execute, name, tools[name], tools.test_only),
    }))),
  });
}

function directMaestroRequestAttestation({ runId, shard, manifest, snapshot, gitAttestationSha256, toolAttestation, observations }) {
  return sha256(JSON.stringify({
    schema_version: 2,
    action: shard,
    run_id: runId,
    source_tree_sha256: manifest.source.tree_sha256,
    apk_sha256: manifest.build.apk.sha256,
    device_identity_sha256: manifest.device.identity_sha256,
    flow_sha256: snapshot.flow_sha256,
    source_sha256: snapshot.source_sha256,
    git_attestation_sha256: gitAttestationSha256,
    tool_attestation_sha256: sha256(JSON.stringify(toolAttestation)),
    measurement_sha256: sha256(JSON.stringify(observations.map(({ device_measurement: measurement }) => measurement))),
  }));
}

function executionOrigin({ root, runId, shard, manifest, snapshot, tools, gitAttestationSha256, toolAttestation, observations }) {
  const production = tools.execution_origin === V12_PRODUCTION_EXECUTION_ORIGIN;
  const sources = V12_MAESTRO_SOURCE_PATHS[shard];
  if (sources === undefined) genericFail("toolchain_invalid");
  return Object.freeze({
    schema_version: 1,
    action: shard,
    kind: production ? "production-default-launcher" : "test-fixture",
    toolchain_origin: tools.execution_origin,
    default_launcher: production,
    test_only: !production,
    adapter_source_sha256: sourceSha256(path.join(root, sources.adapter)),
    launcher_source_sha256: sourceSha256(path.join(root, sources.launcher)),
    domain_source_sha256: snapshot.source_sha256[sources.domain],
    request_attestation_sha256: directMaestroRequestAttestation({
      runId, shard, manifest, snapshot, gitAttestationSha256, toolAttestation, observations,
    }),
  });
}

function directMaestroAdb(execute, adbExecutable, serial) {
  return (...command) => {
    try {
      return String(execute(adbExecutable, ["-s", serial, ...command], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 20_000,
      })).trim();
    } catch { genericFail("native_command_failed"); }
  };
}

function measureDirectMaestroDevice(adb, serial, manifest) {
  if (adb("get-state") !== "device") genericFail("identity_mismatch");
  const packageName = manifest.build.package;
  const packages = adb("shell", "pm", "list", "packages", packageName).split(/\r?\n/u).filter(Boolean);
  if (packages.length !== 1 || packages[0] !== `package:${packageName}`) genericFail("identity_mismatch");
  const installedPaths = adb("shell", "pm", "path", packageName).split(/\r?\n/u).filter(Boolean);
  if (installedPaths.length !== 1 || !/^package:\/data\/app\/[A-Za-z0-9_./=+-]+\.apk$/u.test(installedPaths[0])) genericFail("identity_mismatch");
  const installedApkSha256 = adb("shell", "sha256sum", installedPaths[0].slice("package:".length)).split(/\s/u)[0];
  const abi = adb("shell", "getprop", "ro.product.cpu.abi");
  const apiLevel = adb("shell", "getprop", "ro.build.version.sdk");
  const model = adb("shell", "getprop", "ro.product.model");
  const settings = readV12CanonicalRestorationSnapshot((args) => adb(...args));
  const measurement = Object.freeze({
    schema_version: 1,
    source: "attested-absolute-adb/v1",
    package: packageName,
    installed_apk_sha256: installedApkSha256,
    device_identity_sha256: phase18DeviceIdentitySha256({ serial, abi, apiLevel, model }),
    abi,
    settings_sha256: digestV12CanonicalRestorationSnapshot(settings),
    configuration_id: manifest.configuration.id,
  });
  if (!SHA256.test(measurement.installed_apk_sha256)) genericFail("identity_mismatch");
  return Object.freeze({ measurement, settings });
}

export function readV12DirectMaestroDeviceMeasurement(manifest, {
  serial = process.env.V12_DEVICE_SERIAL,
  execute = execFileSync,
  executionTools = resolveV12NativeExecutionTools({ domain: true }),
} = {}) {
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]+$/u.test(serial) || serial.startsWith("emulator-")) genericFail("ephemeral_device_required");
  const tools = resolvedExecutionTools(executionTools);
  return measureDirectMaestroDevice(directMaestroAdb(execute, tools.adb, serial), serial, manifest).measurement;
}

function restoreDirectMaestroSettings(adb, settings) {
  for (const { key, adb_args: getArgs } of V12_CANONICAL_RESTORATION_SETTINGS) {
    const [, , scope] = getArgs;
    const value = settings[key];
    adb("shell", "settings", value === "null" ? "delete" : "put", scope, key, ...(value === "null" ? [] : [value]));
  }
}

function directMaestroIdentity(manifest, sourceIdentity, apkSha256, measurement) {
  return Object.freeze({
    source_tree_sha256: sourceIdentity.tree_sha256,
    package: measurement.package,
    apk_sha256: apkSha256,
    installed_apk_sha256: measurement.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: measurement.device_identity_sha256,
    settings_sha256: measurement.settings_sha256,
    configuration_id: measurement.configuration_id,
  });
}

function assertDirectMaestroMeasurement(manifest, sourceIdentity, apkSha256, measurement) {
  genericIdentityMatches(manifest, {
    head: sourceIdentity.head,
    tree_sha256: sourceIdentity.tree_sha256,
    package: measurement.package,
    apk_sha256: apkSha256,
    installed_apk_sha256: measurement.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: measurement.device_identity_sha256,
    settings_sha256: measurement.settings_sha256,
    configuration_id: measurement.configuration_id,
  });
  if (measurement.abi !== manifest.device.abi) genericFail("identity_mismatch");
}

function validateDirectMaestroToolAttestation(value, shard, executionOrigin, allowTest) {
  if (!exactKeys(value, ["schema_version", "action", "execution_origin", "test_only", "tools"])
    || value.schema_version !== 1 || value.action !== shard
    || value.execution_origin !== executionOrigin.toolchain_origin
    || value.test_only !== executionOrigin.test_only
    || (!allowTest && value.test_only !== false)
    || !Array.isArray(value.tools) || value.tools.length !== DIRECT_MAESTRO_TOOL_NAMES.length) genericFail("tool_attestation_invalid");
  for (const [index, descriptor] of value.tools.entries()) {
    if (!exactKeys(descriptor, ["name", "executable_realpath_sha256", "executable_sha256", "version"])
      || descriptor.name !== DIRECT_MAESTRO_TOOL_NAMES[index]
      || !SHA256.test(descriptor.executable_realpath_sha256 ?? "")
      || !SHA256.test(descriptor.executable_sha256 ?? "")
      || typeof descriptor.version !== "string" || descriptor.version.length < 1 || descriptor.version.length > 512
      || /[\u0000-\u001f\u007f]/u.test(descriptor.version)
      || (value.test_only ? descriptor.version !== "test-controlled" : descriptor.version === "test-controlled")) genericFail("tool_attestation_invalid");
  }
}

function validateDirectMaestroMeasurement(value, manifest) {
  if (!exactKeys(value, ["schema_version", "source", "package", "installed_apk_sha256", "device_identity_sha256", "abi", "settings_sha256", "configuration_id"])
    || value.schema_version !== 1 || value.source !== "attested-absolute-adb/v1"
    || value.package !== manifest.build.package
    || value.installed_apk_sha256 !== manifest.device.installed_apk_sha256
    || value.installed_apk_sha256 !== manifest.build.apk.sha256
    || value.device_identity_sha256 !== manifest.device.identity_sha256
    || value.abi !== manifest.device.abi
    || value.settings_sha256 !== manifest.device.settings_sha256
    || value.configuration_id !== manifest.configuration.id) genericFail("measurement_invalid");
}

export function validateV12DirectMaestroMapping(mapping, { root = ROOT, manifest, shard, allowTest = false } = {}) {
  if (!LIVE_GENERIC_SHARDS.includes(shard)
    || !exactKeys(mapping, ["schema_version", "producer", "run_id", "shard", "identity", "git_attestation_sha256", "execution_origin", "tool_attestation", "flow_sha256", "source_sha256", "case_ids", "observations"])
    || mapping.schema_version !== 2 || mapping.producer !== "v12-maestro-source-map/v2" || mapping.shard !== shard
    || !manifest || mapping.run_id !== manifest.run_id || !SHA256.test(mapping.git_attestation_sha256 ?? "")) genericFail("mapping_invalid");
  const contract = V12_MAESTRO_FLOW_CONTRACTS[shard];
  const caseIds = deriveV12MaestroCaseIdsFromSource(shard, readFileSync(path.join(root, contract.sources[0]), "utf8"));
  if (JSON.stringify(mapping.case_ids) !== JSON.stringify(caseIds)) genericFail("mapping_invalid");
  validateSourceOrderedObservations(mapping.observations, caseIds, shard);
  const origin = mapping.execution_origin;
  const production = origin?.kind === "production-default-launcher" && origin.default_launcher === true
    && origin.test_only === false && origin.toolchain_origin === V12_PRODUCTION_EXECUTION_ORIGIN;
  const testOnly = allowTest && origin?.kind === "test-fixture" && origin.default_launcher === false
    && origin.test_only === true && origin.toolchain_origin === V12_TEST_EXECUTION_ORIGIN;
  if (!exactKeys(origin, ["schema_version", "action", "kind", "toolchain_origin", "default_launcher", "test_only", "adapter_source_sha256", "launcher_source_sha256", "domain_source_sha256", "request_attestation_sha256"])
    || origin.schema_version !== 1 || origin.action !== shard || (!production && !testOnly)
    || origin.adapter_source_sha256 !== sourceSha256(path.join(root, V12_MAESTRO_SOURCE_PATHS[shard].adapter))
    || origin.launcher_source_sha256 !== sourceSha256(path.join(root, V12_MAESTRO_SOURCE_PATHS[shard].launcher))
    || origin.domain_source_sha256 !== sourceSha256(path.join(root, V12_MAESTRO_SOURCE_PATHS[shard].domain))) genericFail("mapping_origin_invalid");
  validateDirectMaestroToolAttestation(mapping.tool_attestation, shard, origin, allowTest);
  for (const observation of mapping.observations) {
    if (!exactKeys(observation, ["case_id", "ordinal", "fixture_id", "report_sha256", "device_measurement"])
      || !exactKeys(observation.device_measurement, ["before", "after"])) genericFail("measurement_invalid");
    validateDirectMaestroMeasurement(observation.device_measurement.before, manifest);
    validateDirectMaestroMeasurement(observation.device_measurement.after, manifest);
    if (JSON.stringify(observation.device_measurement.before) !== JSON.stringify(observation.device_measurement.after)) genericFail("measurement_drift");
  }
  const firstMeasurement = mapping.observations[0]?.device_measurement.before;
  const expectedIdentity = firstMeasurement === undefined ? undefined : {
    source_tree_sha256: manifest.source.tree_sha256,
    package: firstMeasurement.package,
    apk_sha256: manifest.build.apk.sha256,
    installed_apk_sha256: firstMeasurement.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256,
    device_identity_sha256: firstMeasurement.device_identity_sha256,
    settings_sha256: firstMeasurement.settings_sha256,
    configuration_id: firstMeasurement.configuration_id,
  };
  if (JSON.stringify(mapping.identity) !== JSON.stringify(expectedIdentity)
    || mapping.flow_sha256 !== sourceSha256(path.join(root, contract.flow))
    || !exactKeys(mapping.source_sha256, contract.sources)
    || contract.sources.some((file) => mapping.source_sha256[file] !== sourceSha256(path.join(root, file)))) genericFail("mapping_identity_invalid");
  const requestSha256 = directMaestroRequestAttestation({
    runId: mapping.run_id,
    shard,
    manifest,
    snapshot: { flow_sha256: mapping.flow_sha256, source_sha256: mapping.source_sha256 },
    gitAttestationSha256: mapping.git_attestation_sha256,
    toolAttestation: mapping.tool_attestation,
    observations: mapping.observations,
  });
  if (origin.request_attestation_sha256 !== requestSha256) genericFail("request_attestation_invalid");
  return true;
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
  const caseIds = contract.prefix === undefined ? Object.freeze([]) : sourceOrderedCaseIds(readBytes(contract.sources[0]), shard);
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
  const gitExecution = dependencies.gitExecution ?? (manifest.evidence_origin === "native"
    ? readV12RetainedGitExecution({ root, runManifest: manifest, env: dependencies.environment ?? process.env })
    : resolveV12GitExecution({ env: dependencies.environment ?? process.env }));
  const sourceIdentity = validateV12LiveSourceLineage(manifest, { ...dependencies, gitExecution });
  const contract = V12_MAESTRO_FLOW_CONTRACTS[shard];
  const flowPath = path.join(root, contract.flow);
  if (!existsSync(flowPath)) genericFail("artifact_missing");
  const sourceBytes = readFileSync(path.join(root, contract.sources[0]));
  const caseIds = sourceOrderedCaseIds(sourceBytes, shard);
  const serial = dependencies.serial ?? process.env.V12_DEVICE_SERIAL;
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]+$/u.test(serial) || serial.startsWith("emulator-")) genericFail("ephemeral_device_required");
  const execute = dependencies.execFileSync ?? execFileSync;
  const tools = resolvedExecutionTools(dependencies.executionTools
    ?? resolveV12NativeExecutionTools({ domain: true, env: dependencies.environment ?? process.env }));
  assertMaestroVersion(execute, tools.maestro);
  const toolAttestation = createV12DirectMaestroToolAttestation({ execute, executionTools: tools, shard });
  const apkSha256 = retainedApkSha256(root, manifest);
  const outputRoot = `artifacts/native/v1.2/${runId}`;
  const reportPath = `${outputRoot}/maestro/${shard}.xml`;
  const mappingPath = `${outputRoot}/mapping/${shard}.json`;
  const leasePath = path.join(root, `${outputRoot}/.leases/${shard}-${serial}.lease`);
  if ([reportPath, mappingPath].some((file) => existsSync(path.join(root, file))) || existsSync(leasePath)) genericFail("immutable_output_invalid");
  mkdirSync(path.dirname(leasePath), { recursive: true });
  writeFileSync(leasePath, `${sha256(serial)}\n`, { flag: "wx" });
  const adb = dependencies.adb ?? directMaestroAdb(execute, tools.adb, serial);
  const reports = [];
  const observations = [];
  let restored = false;
  let outcome;
  try {
    for (const [index, caseId] of caseIds.entries()) {
      const temporary = path.join(root, `${outputRoot}/maestro/.${shard}-${index + 1}.xml`);
      mkdirSync(path.dirname(temporary), { recursive: true });
      const before = measureDirectMaestroDevice(adb, serial, manifest);
      assertDirectMaestroMeasurement(manifest, sourceIdentity, apkSha256, before.measurement);
      let after;
      let flowError;
      try {
        execute(tools.maestro, ["test", "--device", serial, "-e", `V12_CASE_ID=${caseId}`, "-e", "V12_CONFIG_ID=AP-L-C390-P-F100", "-e", "V12_FIXTURE_ID=v12-synthetic-fixtures-r18", "--format", "junit", "--output", temporary, flowPath], { stdio: "inherit" });
      } catch { flowError = new Error("v12_maestro_native_command_failed"); }
      finally {
        restoreDirectMaestroSettings(adb, before.settings);
        after = measureDirectMaestroDevice(adb, serial, manifest);
        assertDirectMaestroMeasurement(manifest, sourceIdentity, apkSha256, after.measurement);
        if (JSON.stringify(before.measurement) !== JSON.stringify(after.measurement)) genericFail("measurement_drift");
      }
      if (flowError !== undefined) throw flowError;
      if (!existsSync(temporary)) genericFail("report_missing");
      const report = readFileSync(temporary, "utf8");
      reports.push(report);
      observations.push(Object.freeze({
        case_id: caseId,
        ordinal: index + 1,
        fixture_id: "v12-synthetic-fixtures-r18",
        report_sha256: sha256(report),
        device_measurement: Object.freeze({ before: before.measurement, after: after.measurement }),
      }));
      unlinkSync(temporary);
    }
    const measuredIdentity = directMaestroIdentity(manifest, sourceIdentity, apkSha256, observations[0].device_measurement.before);
    const reportText = `<testsuites source_tree_sha256="${measuredIdentity.source_tree_sha256}" apk_sha256="${measuredIdentity.apk_sha256}" installed_apk_sha256="${measuredIdentity.installed_apk_sha256}" device_identity_sha256="${measuredIdentity.device_identity_sha256}">${reports.join("")}</testsuites>\n`;
    const flowSha256 = sha256(readFileSync(flowPath));
    const sourceSnapshot = Object.freeze({ flow_sha256: flowSha256, source_sha256: Object.freeze({ [contract.sources[0]]: sha256(sourceBytes) }) });
    const gitAttestationSha256 = gitExecution.retained_sha256 ?? sha256(`${JSON.stringify(gitExecution.attestation)}\n`);
    const provenance = executionOrigin({ root, runId, shard, manifest, snapshot: sourceSnapshot, tools, gitAttestationSha256, toolAttestation, observations });
    const mapping = Object.freeze({ schema_version: 2, producer: "v12-maestro-source-map/v2", run_id: runId, shard, identity: measuredIdentity, git_attestation_sha256: gitAttestationSha256, execution_origin: provenance, tool_attestation: toolAttestation, flow_sha256: flowSha256, source_sha256: sourceSnapshot.source_sha256, case_ids: caseIds, observations });
    validateSourceOrderedObservations(observations, caseIds, shard);
    validateV12DirectMaestroMapping(mapping, { root, manifest, shard, allowTest: tools.test_only });
    const writeReport = dependencies.writeReport ?? ((file, value) => {
      const absoluteReport = path.join(root, file);
      mkdirSync(path.dirname(absoluteReport), { recursive: true });
      writeFileSync(absoluteReport, value, { flag: "wx" });
    });
    writeReport(reportPath, reportText);
    immutableWrite(root, mappingPath, mapping, dependencies.writeImmutableJson);
    outcome = Object.freeze({ run_id: runId, shard, report: reportPath, mapping: mappingPath, cases: caseIds.length, execution_origin: provenance });
    restored = true;
  } finally { unlinkSync(leasePath); }
  if (!restored) genericFail("settings_restore_failed");
  return outcome;
}

export function validateV12LiveSourceLineage(manifest, dependencies = {}) {
  const root = dependencies.root ?? ROOT;
  const gitExecution = dependencies.gitExecution ?? ((dependencies.currentHead !== undefined
    && dependencies.sourceDigest !== undefined && dependencies.isAncestor !== undefined)
    ? undefined : resolveV12GitExecution({ env: dependencies.environment ?? process.env }));
  const currentHead = dependencies.currentHead
    ?? execFileSync(gitExecution.executable, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const sourceDigest = dependencies.sourceDigest ?? sourceTreeSha256(root, {
    gitExecution,
    expectedGitAttestation: gitExecution.attestation,
  });
  const isAncestor = dependencies.isAncestor ?? ((ancestor, descendant) => {
    try {
      execFileSync(gitExecution.executable, ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" });
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

function retainedApkSha256(root, manifest) {
  const workspace = path.resolve(root);
  const apkPath = path.resolve(root, manifest.build.apk.path);
  if (!apkPath.startsWith(`${workspace}${path.sep}`)) genericFail("identity_mismatch");
  let bytes;
  try {
    if (!statSync(apkPath).isFile()) genericFail("identity_mismatch");
    bytes = readFileSync(apkPath);
  } catch (error) {
    if (error instanceof Error && error.message === "v12_maestro_identity_mismatch") throw error;
    genericFail("identity_mismatch");
  }
  const digest = sha256(bytes);
  if (bytes.length !== manifest.build.apk.size_bytes || digest !== manifest.build.apk.sha256) genericFail("identity_mismatch");
  return digest;
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
  const gitExecution = dependencies.gitExecution ?? ((dependencies.currentHead !== undefined
    && dependencies.sourceDigest !== undefined && dependencies.isAncestor !== undefined)
    ? undefined : readV12RetainedGitExecution({ root, runManifest: manifest, env: dependencies.environment ?? process.env }));
  const sourceIdentity = validateV12LiveSourceLineage(manifest, {
    root,
    currentHead: dependencies.currentHead,
    sourceDigest: dependencies.sourceDigest,
    isAncestor: dependencies.isAncestor,
    gitExecution,
  });
  genericIdentityMatches(manifest, dependencies.currentIdentity ?? liveIdentity(manifest, root, sourceIdentity));
  const flow = V12_MAESTRO_FLOW_CONTRACTS.recovery.flow;
  if (!(dependencies.exists ?? ((file) => existsSync(path.join(root, file))))(flow)) genericFail("artifact_missing");
  const execute = dependencies.execFileSync ?? execFileSync;
  const tools = resolvedExecutionTools(dependencies.executionTools
    ?? resolveV12NativeExecutionTools({ domain: true, env: dependencies.environment ?? process.env }));
  assertMaestroVersion(execute, tools.maestro);
  const output = path.join(root, `artifacts/native/v1.2/${runId}/maestro/recovery.xml`);
  const writeReport = dependencies.writeReport ?? ((file, content) => {
    if (existsSync(file)) genericFail("immutable_output_invalid");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, { flag: "wx" });
  });
  const serial = dependencies.serial ?? "emulator-5554";
  const adb = dependencies.adb ?? ((...command) => execute(tools.adb, ["-s", serial, ...command], { encoding: "utf8" }).trim());
  const priorAirplane = adb("shell", "settings", "get", "global", "airplane_mode_on");
  const reports = [];
  let restored = false;
  try {
    for (const step of V12_RECOVERY_STEPS) {
      for (const cut of V12_RECOVERY_CUT_IDS) {
        const nonce = randomBytes(16).toString("hex");
        for (const phase of ["arm", "recover"]) {
          const temporary = path.join(root, `artifacts/native/v1.2/${runId}/maestro/.${step.case_id}-${step.id}-${cut}-${phase}.xml`);
          mkdirSync(path.dirname(temporary), { recursive: true });
          execute(tools.maestro, ["test", "--device", serial,
            "-e", `V12_DOMAIN_NONCE=${nonce}`,
            "-e", `V12_RECOVERY_CASE=${step.case_id}`,
            "-e", `V12_RECOVERY_STEP=${step.id}`,
            "-e", `V12_RECOVERY_STAGE=${cut}`,
            "-e", `V12_RECOVERY_PHASE=${phase}`,
            "--format", "junit", "--output", temporary, path.join(root, flow)], { stdio: "inherit" });
          if (!existsSync(temporary)) genericFail("report_missing");
          reports.push(readFileSync(temporary, "utf8"));
          unlinkSync(temporary);
        }
      }
    }
    writeReport(output, `<testsuites>${reports.join("")}</testsuites>\n`);
  } finally {
    adb("shell", "settings", "put", "global", "airplane_mode_on", priorAirplane);
    restored = adb("shell", "settings", "get", "global", "airplane_mode_on") === priorAirplane;
  }
  if (!restored) genericFail("settings_restore_failed");
  return Object.freeze({ ok: true, run_id: runId, shard, report: path.relative(root, output), cases: V12_RECOVERY_CASE_IDS.length,
    steps: V12_RECOVERY_STEPS.length, cuts: V12_RECOVERY_STEPS.length * V12_RECOVERY_CUT_IDS.length, executions: reports.length });
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
  const gitExecution = dependencies.gitExecution ?? resolveV12GitExecution({ env: dependencies.environment ?? process.env });
  const head = dependencies.head ?? execFileSync(gitExecution.executable, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const source = dependencies.source ?? sourceTreeSha256(root, { gitExecution, expectedGitAttestation: gitExecution.attestation });
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
