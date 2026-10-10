#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseAllDocuments } from "yaml";

import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_LIBRARY_RUNNING_CASES } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const ARTIFACT_ROOT = "artifacts/native/phase17";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;
const PHASE17_PORT = "gymtracker-devtest://__phase17-maestro";
const EXECUTABLE_COMMANDS = new Set(["tapOn", "inputText", "pressKey", "swipe", "openLink", "launchApp"]);
const ASSERTION_COMMANDS = new Set(["assertVisible", "assertNotVisible", "extendedWaitUntil"]);

function flowFor(id) {
  if (id === "library.accessibility-recovery") return "maestro/phase17/accessibility.yaml";
  if (id.startsWith("library.running-")) return "maestro/phase17/running-authoring.yaml";
  return "maestro/phase17/library.yaml";
}

export const PHASE17_FLOW_CASES = Object.freeze(
  PHASE17_CASE_ACTION_CONTRACTS.map((contract) => Object.freeze({ ...contract, flow: flowFor(contract.id) })),
);

export const PHASE17_DEVICE_PROFILES = Object.freeze({
  standard: Object.freeze({ width: 393, height: 852, fontScale: 1, night: "auto", reducedMotion: false }),
  largeText: Object.freeze({ width: 393, height: 852, fontScale: 2, night: "light", reducedMotion: true }),
  compactLandscape: Object.freeze({ width: 852, height: 393, fontScale: 2, night: "dark", reducedMotion: true }),
});

const caseById = Object.freeze(Object.fromEntries(
  PHASE17_LIBRARY_RUNNING_CASES.map((entry) => [entry.id, entry]),
));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function command(program, args) {
  return execFileSync(program, args, { cwd: ROOT, encoding: "utf8" }).trim();
}

export function parsePhase17RunnerArgs(args) {
  const options = { manifest: "", ids: [], execute: false };
  let selectionCount = 0;
  let executeCount = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest") options.manifest = args[++index] ?? "";
    else if (arg === "--ids") {
      selectionCount += 1;
      options.ids = (args[++index] ?? "").split(",").filter(Boolean);
    } else if (arg === "--all") {
      selectionCount += 1;
      options.ids = PHASE17_LIBRARY_RUNNING_CASES.map(({ id }) => id);
    } else if (arg === "--execute") {
      executeCount += 1;
      options.execute = true;
    } else throw new Error(`phase17_runner_unknown_argument:${arg}`);
  }
  if (
    options.manifest !== `${ARTIFACT_ROOT}/build.json`
    || selectionCount !== 1
    || executeCount > 1
    || options.ids.length === 0
    || new Set(options.ids).size !== options.ids.length
    || options.ids.some((id) => caseById[id] === undefined)
  ) throw new Error("phase17_runner_arguments_invalid");
  return Object.freeze({ ...options, ids: Object.freeze([...options.ids]) });
}

export function validatePhase17NativeManifest(manifest, currentHead, currentSource) {
  if (
    manifest?.schema_version !== 1
    || manifest.suite !== "phase17-library-running"
    || manifest.profile !== "development-test"
    || manifest.package !== PACKAGE
    || manifest.js_bundle?.embedded !== true
    || manifest.base_head !== currentHead
    || manifest.source_tree_sha256 !== currentSource
    || !SHA256.test(manifest.apk?.sha256 ?? "")
    || manifest.installed_apk?.matches_retained_apk !== true
    || manifest.installed_apk?.sha256 !== manifest.apk?.sha256
    || !manifest.device?.serial
    || !Number.isInteger(manifest.device?.api_level)
    || !manifest.device?.abi
  ) throw new Error("phase17_manifest_invalid");
  return true;
}

export function createPhase17RunnerPlan(manifest) {
  return Object.freeze({
    suite: "phase17-library-running",
    package: manifest.package,
    case_ids: Object.freeze(PHASE17_LIBRARY_RUNNING_CASES.map(({ id }) => id)),
    flows: PHASE17_FLOW_CASES,
    sqlite_contract: "expo-sqlite-authoritative",
    risk_based: true,
    cartesian_expansion: false,
    seven_session_kinds: 7,
    device_profiles: PHASE17_DEVICE_PROFILES,
    device_state_restoration: "guaranteed",
    evidence_policy: "runner-never-writes-consolidated-evidence",
    source_setup_policy: "authoritative-sqlite-commands-only",
    result_policy: "native-evidence-pending-until-phase20",
  });
}

function whenContainsCase(value, id) {
  return typeof value === "string" && value.includes(`PHASE17_CASE_ID == '${id}'`);
}

export function parsePhase17FlowSources(flows) {
  return Object.fromEntries(Object.entries(flows ?? {}).map(([flow, source]) => [
    flow,
    parseAllDocuments(source, { prettyErrors: true }),
  ]));
}

export function commandTreeForPhase17Case(flows, id) {
  const documents = parsePhase17FlowSources(flows)[flowFor(id)] ?? [];
  const tree = [];
  const walk = (entries) => {
    for (const entry of entries ?? []) {
      if (!entry || typeof entry !== "object") continue;
      const [name] = Object.keys(entry);
      if (name === "runFlow" && whenContainsCase(entry.runFlow?.when?.true, id)) {
        for (const command of entry.runFlow.commands ?? []) {
          const [commandName] = Object.keys(command ?? {});
          tree.push(Object.freeze({ name: commandName, value: command?.[commandName] }));
        }
      }
    }
  };
  for (const document of documents) {
    const parsed = document.toJSON();
    if (Array.isArray(parsed)) walk(parsed);
  }
  return Object.freeze(tree);
}

export function validatePhase17FlowSources(flows, ids = PHASE17_FLOW_CASES.map(({ id }) => id)) {
  for (const id of ids) {
    const contract = PHASE17_FLOW_CASES.find((entry) => entry.id === id);
    const commands = commandTreeForPhase17Case(flows, id);
    if (contract === undefined || commands.length === 0) {
      throw new Error(`phase17_flow_case_missing:${id}`);
    }
    if (!commands.some(({ name }) => EXECUTABLE_COMMANDS.has(name))) throw new Error(`phase17_flow_action_missing:${id}`);
    if (!commands.some(({ name }) => ASSERTION_COMMANDS.has(name))) throw new Error(`phase17_flow_assertion_missing:${id}`);
    if (!commands.some(({ name }) => name === "tapOn" || name === "pressKey" || name === "openLink")) throw new Error(`phase17_flow_selector_missing:${id}`);
  }
  const text = Object.values(flows ?? {}).join("\n");
  if (text.includes("takeScreenshot") || text.includes("writeFile") || text.includes("assertTrue:")) {
    throw new Error("phase17_flow_privacy_unsafe");
  }
  if (!text.includes("PHASE17_CASE_ID")) throw new Error("phase17_flow_case_dispatch_missing");
  return true;
}

function resolveAdb() {
  const androidRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const candidate = androidRoot === undefined
    ? "/opt/homebrew/share/android-commandlinetools/platform-tools/adb"
    : path.join(androidRoot, "platform-tools", "adb");
  if (!existsSync(candidate)) throw new Error(`phase17_adb_missing:${candidate}`);
  return candidate;
}

function adb(adbPath, serial, ...args) {
  return command(adbPath, ["-s", serial, ...args]);
}

function readDeviceState(adbPath, serial) {
  return Object.freeze({
    size: adb(adbPath, serial, "shell", "wm", "size"),
    density: adb(adbPath, serial, "shell", "wm", "density"),
    fontScale: adb(adbPath, serial, "shell", "settings", "get", "system", "font_scale") || "1.0",
    nightMode: adb(adbPath, serial, "shell", "cmd", "uimode", "night"),
    animator: adb(adbPath, serial, "shell", "settings", "get", "global", "animator_duration_scale") || "1",
    transition: adb(adbPath, serial, "shell", "settings", "get", "global", "transition_animation_scale") || "1",
    window: adb(adbPath, serial, "shell", "settings", "get", "global", "window_animation_scale") || "1",
  });
}

function restoreDeviceState(adbPath, serial, state) {
  const size = state.size.match(/Override size: (\S+)/u)?.[1];
  const density = state.density.match(/Override density: (\S+)/u)?.[1];
  adb(adbPath, serial, "shell", "wm", "size", size ?? "reset");
  adb(adbPath, serial, "shell", "wm", "density", density ?? "reset");
  adb(adbPath, serial, "shell", "settings", "put", "system", "font_scale", state.fontScale);
  adb(adbPath, serial, "shell", "settings", "put", "global", "animator_duration_scale", state.animator);
  adb(adbPath, serial, "shell", "settings", "put", "global", "transition_animation_scale", state.transition);
  adb(adbPath, serial, "shell", "settings", "put", "global", "window_animation_scale", state.window);
  adb(adbPath, serial, "shell", "cmd", "uimode", "night", state.nightMode.includes("yes") ? "yes" : state.nightMode.includes("no") ? "no" : "auto");
}

function profileFor(id) {
  if (id === "library.accessibility-recovery") return PHASE17_DEVICE_PROFILES.compactLandscape;
  if (id === "library.remembered-state" || id === "library.running-create-typed-sessions") {
    return PHASE17_DEVICE_PROFILES.largeText;
  }
  return PHASE17_DEVICE_PROFILES.standard;
}

function sessionKindFor(id) {
  const kinds = Object.freeze({
    "library.running-recovery": "Recovery",
    "library.running-long": "Long run",
    "library.running-progression": "Progression",
    "library.running-tempo": "Tempo",
    "library.running-intervals": "Intervals",
    "library.running-hills": "Hills",
    "library.running-fartlek": "Fartlek",
  });
  return kinds[id] ?? "Recovery";
}

function applyDeviceProfile(adbPath, serial, profile) {
  adb(adbPath, serial, "shell", "wm", "density", "160");
  adb(adbPath, serial, "shell", "wm", "size", `${profile.width}x${profile.height}`);
  adb(adbPath, serial, "shell", "settings", "put", "system", "font_scale", String(profile.fontScale));
  const scale = profile.reducedMotion ? "0" : "1";
  for (const key of ["animator_duration_scale", "transition_animation_scale", "window_animation_scale"]) {
    adb(adbPath, serial, "shell", "settings", "put", "global", key, scale);
  }
  adb(adbPath, serial, "shell", "cmd", "uimode", "night", profile.night);
}

function runCase({ adbPath, manifest, id, fixture }) {
  const flow = flowFor(id);
  const profile = profileFor(id);
  applyDeviceProfile(adbPath, manifest.device.serial, profile);
  const artifactDirectory = path.join(ROOT, ARTIFACT_ROOT, "maestro", id);
  mkdirSync(artifactDirectory, { recursive: true });
  const report = path.join(artifactDirectory, "report.xml");
  const args = [
    "test", "--no-ansi", "--format", "junit", "--output", report, "--test-output-dir", artifactDirectory, "--udid", manifest.device.serial,
    "-e", `PHASE17_CASE_ID=${id}`,
    "-e", `PHASE17_FIXTURE_TOKEN=${fixture.fixtureToken}`,
    "-e", `PHASE17_RUNNING_PLAN_ID=${fixture.selectors.runningPlanId}`,
    "-e", `PHASE17_OWNED_PLAN_ID=${fixture.selectors.ownedPlanId}`,
    "-e", `PHASE17_CUSTOM_EXERCISE_ID=${fixture.selectors.customExerciseId}`,
    "-e", `PHASE17_BUNDLED_EXERCISE_ID=${fixture.selectors.bundledExerciseId}`,
    "-e", `PHASE17_SESSION_KIND=${sessionKindFor(id)}`,
    "-e", `PHASE17_TEXT_SCALE=${profile.fontScale}`,
    "-e", `PHASE17_REDUCED_MOTION=${profile.reducedMotion}`,
    "-e", `PHASE17_THEME=${profile.night}`,
    flow,
  ];
  execFileSync("maestro", args, { cwd: ROOT, stdio: "inherit" });
  const source = capturePhase17SourceProbe(adbPath, manifest.device.serial, id, fixture);
  return Object.freeze({ id, flow, report, source });
}

function portUri(operation, id, fixture) {
  const query = new URLSearchParams({ operation, case: id });
  if (fixture !== undefined) {
    query.set("fixtureToken", fixture.fixtureToken);
    query.set("sourceTable", fixture.sourceTable);
    query.set("expectedState", fixture.expectedState);
  }
  return `${PHASE17_PORT}?${query}`;
}

function readPhase17Port(adbPath, serial, operation, id, fixture) {
  adb(adbPath, serial, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", portUri(operation, id, fixture), PACKAGE);
  const xml = adb(adbPath, serial, "shell", "uiautomator", "dump", "/sdcard/phase17-window.xml");
  if (!xml.includes("UI hierchary dumped")) throw new Error(`phase17_port_dump_failed:${operation}:${id}`);
  return adb(adbPath, serial, "shell", "cat", "/sdcard/phase17-window.xml");
}

export function capturePhase17SourceProbe(adbPath, serial, id, fixture) {
  const output = readPhase17Port(adbPath, serial, "probe", id, fixture);
  const identityHash = output.match(/identity_hash=([a-f0-9]{64})/u)?.[1];
  if (identityHash === undefined || !output.includes(`fixture_token=${fixture.fixtureToken}`) || !output.includes(`source_table=${fixture.sourceTable}`) || !output.includes("verdict=matched")) throw new Error(`phase17_source_probe_missing:${id}`);
  return Object.freeze({ probe: fixture.sourceTable, identity_hash: identityHash });
}

function setupPhase17Case(adbPath, serial, id) {
  const output = readPhase17Port(adbPath, serial, "setup", id);
  const match = output.match(/PHASE17_SETUP_READY case=([^\s]+) fixture_token=([^\s]+) baseline_sha256=([a-f0-9]{64}) source_table=([^\s]+) expected_state=([^\s]+) selectors=([^\s]+)/u);
  if (match === null || match[1] !== id) throw new Error(`phase17_setup_missing:${id}`);
  const selectors = Object.fromEntries(match[6].split(",").map((entry) => [entry.slice(0, entry.indexOf(":")), entry.slice(entry.indexOf(":") + 1)]));
  if (!match[2] || !selectors.runningPlanId || !selectors.ownedPlanId || !selectors.customExerciseId || !selectors.bundledExerciseId) throw new Error(`phase17_setup_fixture_invalid:${id}`);
  return Object.freeze({ fixtureToken: match[2], baselineDigest: match[3], sourceTable: match[4], expectedState: match[5], selectors });
}

function cleanupPhase17Case(adbPath, serial, id, fixture) {
  const output = readPhase17Port(adbPath, serial, "cleanup", id, fixture);
  if (!output.includes(`PHASE17_CLEANUP_READY case=${id} fixture_token=${fixture.fixtureToken} baseline_sha256=${fixture.baselineDigest} verdict=restored`)) throw new Error(`phase17_cleanup_missing:${id}`);
}

export function executePhase17Maestro(args = process.argv.slice(2)) {
  const options = parsePhase17RunnerArgs(args);
  const manifestPath = path.join(ROOT, options.manifest);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const head = command("git", ["rev-parse", "HEAD"]);
  validatePhase17NativeManifest(manifest, head, sourceTreeSha256(ROOT));
  const apk = path.join(ROOT, manifest.apk.path);
  if (!existsSync(apk) || sha256(readFileSync(apk)) !== manifest.apk.sha256) throw new Error("phase17_apk_stale");
  const plan = createPhase17RunnerPlan(manifest);
  validatePhase17FlowSources(Object.fromEntries([...new Set(plan.flows.map(({ flow }) => flow))].map((flow) => [flow, readFileSync(path.join(ROOT, flow), "utf8")])));
  if (!options.execute) return Object.freeze({ status: "planned", plan, selected_case_ids: options.ids });

  const adbPath = resolveAdb();
  const original = readDeviceState(adbPath, manifest.device.serial);
  try {
    const results = options.ids.map((id) => {
      const fixture = setupPhase17Case(adbPath, manifest.device.serial, id);
      try { return runCase({ adbPath, manifest, id, fixture }); }
      finally { cleanupPhase17Case(adbPath, manifest.device.serial, id, fixture); }
    });
    return Object.freeze({ status: "executed", plan, results, evidence_written: false });
  } finally {
    restoreDeviceState(adbPath, manifest.device.serial, original);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase17Maestro())}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
