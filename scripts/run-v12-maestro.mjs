import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { validateV12RunManifest as validateGenericV12RunManifest } from "./create-v12-run-manifest.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { exactKeys } from "./node-evidence-utils.mjs";
import {
  initializeV12CalendarRun,
  readV12CalendarRunState,
  recordV12CalendarStageResult,
} from "./v12-calendar-artifacts.mjs";

const ROOT = process.cwd();
const FLOW = "maestro/v1.2/calendar.yaml";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_HEAD = /^[a-f0-9]{40}$/u;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
  assertMaestroVersion(execute);
  const outputRoot = `artifacts/native/v1.2/${runId}`;
  const reportPath = `${outputRoot}/maestro/${shard}.xml`;
  const mappingPath = `${outputRoot}/mapping/${shard}.json`;
  const leasePath = path.join(root, `${outputRoot}/.leases/${shard}-${serial}.lease`);
  if ([reportPath, mappingPath].some((file) => existsSync(path.join(root, file))) || existsSync(leasePath)) genericFail("immutable_output_invalid");
  mkdirSync(path.dirname(leasePath), { recursive: true });
  writeFileSync(leasePath, `${sha256(serial)}\n`, { flag: "wx" });
  const adb = dependencies.adb ?? ((...command) => execute("adb", ["-s", serial, ...command], { encoding: "utf8" }).trim());
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
      execute("maestro", ["test", "--device", serial, "-e", `V12_CASE_ID=${caseId}`, "-e", "V12_CONFIG_ID=AP-L-C390-P-F100", "-e", "V12_FIXTURE_ID=v12-synthetic-fixtures-r18", "--format", "junit", "--output", temporary, flowPath], { stdio: "inherit" });
      if (!existsSync(temporary)) genericFail("report_missing");
      reports.push(readFileSync(temporary, "utf8"));
      unlinkSync(temporary);
    }
    const reportText = `<testsuites>${reports.join("")}</testsuites>\n`;
    const flowSha256 = sha256(readFileSync(flowPath));
    const observations = caseIds.map((caseId, index) => Object.freeze({ case_id: caseId, ordinal: index + 1, fixture_id: "v12-synthetic-fixtures-r18", report_sha256: sha256(reports[index]) }));
    const mapping = Object.freeze({ schema_version: 1, producer: "v12-maestro-source-map/v1", run_id: runId, shard, identity: Object.freeze({ source_tree_sha256: manifest.source.tree_sha256, apk_sha256: manifest.build.apk.sha256, installed_apk_sha256: manifest.device.installed_apk_sha256, certificate_sha256: manifest.build.apk.certificate_sha256, device_identity_sha256: manifest.device.identity_sha256, settings_sha256: manifest.device.settings_sha256, configuration_id: manifest.configuration.id }), flow_sha256: flowSha256, source_sha256: Object.freeze({ [contract.sources[0]]: sha256(sourceBytes) }), case_ids: caseIds, observations });
    validateSourceOrderedObservations(observations, caseIds, shard);
    const absoluteReport = path.join(root, reportPath);
    mkdirSync(path.dirname(absoluteReport), { recursive: true });
    writeFileSync(absoluteReport, reportText, { flag: "wx" });
    immutableWrite(root, mappingPath, mapping, dependencies.writeImmutableJson);
    outcome = Object.freeze({ run_id: runId, shard, report: reportPath, mapping: mappingPath, cases: caseIds.length });
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

function assertMaestroVersion(execute = execFileSync) {
  const version = execute("maestro", ["--version"], { encoding: "utf8" }).trim();
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
  if (existsSync(output)) genericFail("immutable_output_invalid");
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
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `<testsuites>${reports.join("")}</testsuites>\n`, { flag: "wx" });
  } finally {
    adb("shell", "settings", "put", "global", "airplane_mode_on", priorAirplane);
    restored = adb("shell", "settings", "get", "global", "airplane_mode_on") === priorAirplane;
  }
  if (!restored) genericFail("settings_restore_failed");
  return Object.freeze({ ok: true, run_id: runId, shard, report: path.relative(root, output), cases: 8, cuts: 64 });
}
export const V12_CALENDAR_TRACE_SAMPLE_MARKER = "GYM_TRACKER_V12_CALENDAR_TRACE_SAMPLE:";

export const V12_CALENDAR_DIAGNOSTIC_STAGES = Object.freeze([
  "drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1",
  "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above",
  "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1",
  "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above",
  "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal",
  "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "adjacent-week",
  "rapid-reverse-input", "second-input-interrupt", "rotation-during-transition", "background-during-transition",
  "reduced-motion", "accessibility-keyboard",
]);

export const V12_CALENDAR_STAGE_CONTRACTS = Object.freeze({
  "drag-forward-10": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-forward-24_9": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-forward-25": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-forward-25_1": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-forward-release-below": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-forward-release-exact": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-forward-release-above": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-backward-10": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-backward-24_9": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-backward-25": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-backward-25_1": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-backward-release-below": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-backward-release-exact": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-backward-release-above": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-fast-subthreshold": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-retreat": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-cancel": Object.freeze(["id: \"calendar-month-viewport\"", "id: \"calendar-month-title\""]),
  "drag-vertical": Object.freeze(["start: \"50%, 70%\", end: \"50%, 30%\", duration: 300", "id: \"calendar-month-title\""]),
  "drag-diagonal": Object.freeze(["start: \"50%, 70%\", end: \"58%, 30%\", duration: 300", "id: \"calendar-month-title\""]),
  "week-expand-first-row": Object.freeze(["point: \"50%, 24%\"", "assertVisible: \"Collapse day and return to month\""]),
  "week-expand-middle-row": Object.freeze(["point: \"50%, 45%\"", "assertVisible: \"Collapse day and return to month\""]),
  "week-expand-last-row": Object.freeze(["point: \"50%, 72%\"", "assertVisible: \"Collapse day and return to month\""]),
  "adjacent-week": Object.freeze(["point: \"50%, 68%\"", "point: \"82%, 76%\"", "assertVisible: \"Collapse day and return to month\""]),
  "rapid-reverse-input": Object.freeze(["end: \"44.9%, 45%\", duration: 100", "end: \"55.1%, 45%\", duration: 100", "id: \"calendar-month-title\""]),
  "second-input-interrupt": Object.freeze(["end: \"44.9%, 45%\", duration: 80", "end: \"44.9%, 45%\", duration: 80", "id: \"calendar-month-title\""]),
  "rotation-during-transition": Object.freeze(["duration: 80", "setOrientation: LANDSCAPE", "setOrientation: PORTRAIT"]),
  "background-during-transition": Object.freeze(["duration: 80", "pressKey: HOME", "phase16CalendarStage=background-during-transition"]),
  "reduced-motion": Object.freeze(["PHASE16_CALENDAR_REDUCED_MOTION == 'verified-device-setting'", "point: \"50%, 45%\"", "assertVisible: \"Collapse day and return to month\""]),
  "accessibility-keyboard": Object.freeze(["pressKey: TAB", "pressKey: DPAD_RIGHT", "pressKey: ENTER", "assertVisible: \"Collapse day and return to month\""]),
});

const IN_APP_GESTURE_STAGES = new Set([
  ...V12_CALENDAR_DIAGNOSTIC_STAGES.filter((stage) => (
    stage.startsWith("drag-forward")
    || stage.startsWith("drag-backward")
    || ["drag-fast-subthreshold", "drag-retreat", "drag-cancel"].includes(stage)
  )),
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
  if ([typeof flow !== "string", typeof flow === "string" && !flow.includes("calendar-tracer"), typeof flow === "string" && !flow.includes("PHASE16_CALENDAR_STAGE"), typeof flow === "string" && !flow.includes("PHASE16_CALENDAR_FIXTURE_ID == 'synthetic-calendar-v1'"), typeof flow === "string" && (flow.includes("phase16CalendarReducedMotion=true") || /(?:September|October|November) 2026/u.test(flow))].some(Boolean)) throw new Error("v12_calendar_flow_invalid");
  for (const stage of V12_CALENDAR_DIAGNOSTIC_STAGES) {
    const marker = `PHASE16_CALENDAR_STAGE == '${stage}'`;
    const start = flow.indexOf(marker);
    if (start < 0) throw new Error(`v12_calendar_stage_missing:${stage}`);
    const next = flow.indexOf("- runFlow:", start);
    const block = flow.slice(start, next < 0 ? flow.length : next);
    for (const expected of new Set(V12_CALENDAR_STAGE_CONTRACTS[stage])) {
      const requiredCount = V12_CALENDAR_STAGE_CONTRACTS[stage].filter((value) => value === expected).length;
      if (block.split(expected).length - 1 !== requiredCount) throw new Error(`v12_calendar_flow_stage_invalid:${stage}`);
    }
    if (IN_APP_GESTURE_STAGES.has(stage)) {
      if (/(?:swipe:|pressKey: BACK)/u.test(block)) throw new Error(`v12_calendar_flow_stage_invalid:${stage}`);
    }
  }
  if (!flow.includes("takeScreenshot")) throw new Error("v12_calendar_capture_missing");
  return true;
}

export function extractV12CalendarStageTrace(logs, expectedStage) {
  const encoded = logs.split(/\r?\n/u).filter((entry) => entry.includes(V12_CALENDAR_TRACE_SAMPLE_MARKER));
  if (encoded.length === 0) return undefined;
  let rows;
  try {
    rows = encoded.map((line) => JSON.parse(line.slice(line.indexOf(V12_CALENDAR_TRACE_SAMPLE_MARKER) + V12_CALENDAR_TRACE_SAMPLE_MARKER.length)));
  } catch {
    throw new Error("v12_calendar_trace_json_invalid");
  }
  const traceNonce = rows.at(-1)?.trace_nonce;
  const selected = rows.filter((row) => row.trace_nonce === traceNonce && row.stage === expectedStage);
  if ([
    !V12_CALENDAR_DIAGNOSTIC_STAGES.includes(expectedStage),
    !/^p16trace-[a-z0-9-]{3,63}$/u.test(traceNonce),
    selected.length === 0,
    selected.some((row, index) => !exactKeys(row, ["schema_version", "trace_nonce", "source_identity", "stage", "sequence", "sample"])
      || !exactKeys(row.source_identity, ["package_name", "build_profile", "suite"])
      || row.schema_version !== 1
      || row.stage !== expectedStage
      || row.sequence !== index + 1
      || row.source_identity.package_name !== PACKAGE
      || row.source_identity.build_profile !== "development-test"
      || row.source_identity.suite !== "phase16-calendar"),
  ].some(Boolean)) throw new Error("v12_calendar_trace_chunks_invalid");
  return Object.freeze({
    schemaVersion: 1,
    stage: expectedStage,
    traceNonce,
    sourceIdentity: Object.freeze({
      packageName: PACKAGE,
      buildProfile: "development-test",
      suite: "phase16-calendar",
    }),
    synthetic: true,
    samples: Object.freeze(selected.map(({ sample }) => Object.freeze(sample))),
  });
}

export function createV12CalendarRunnerPlan(manifest) {
  return Object.freeze({
    suite: "v1.2-calendar",
    native_execution: "NOT_RUN",
    phase20_deferred: true,
    package: manifest.package,
    stages: V12_CALENDAR_DIAGNOSTIC_STAGES,
    fixture_id: "synthetic-calendar-v1",
    trace_sample_marker: V12_CALENDAR_TRACE_SAMPLE_MARKER,
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

export function runV12MaestroCli(args = process.argv.slice(2), io = process) {
  try {
    io.stdout.write(`${JSON.stringify(args.includes("--run") ? executeLiveV12GenericMaestro(args) : executeV12Maestro(args))}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

/* node:coverage ignore next 4 */
if (process.argv[1]?.endsWith("run-v12-maestro.mjs")) {
  process.exitCode = runV12MaestroCli();
}
