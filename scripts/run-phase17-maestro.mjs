#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_LIBRARY_RUNNING_CASES } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const ARTIFACT_ROOT = "artifacts/native/phase17";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const SHA256 = /^[a-f0-9]{64}$/u;

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

export function validatePhase17FlowSources(flows, ids = PHASE17_FLOW_CASES.map(({ id }) => id)) {
  const text = Object.values(flows ?? {}).join("\n");
  for (const id of ids) {
    const contract = PHASE17_FLOW_CASES.find((entry) => entry.id === id);
    if (contract === undefined || !text.includes(`PHASE17_CASE_ID == '${id}'`)) {
      throw new Error(`phase17_flow_case_missing:${id}`);
    }
    const binding = `# phase17-contract: ${contract.id} | ${contract.action} | ${contract.uiReadback} | ${contract.sourceProbe}`;
    if (!text.includes(binding)) throw new Error(`phase17_flow_contract_missing:${id}`);
  }
  if (text.includes("takeScreenshot") || text.includes("writeFile") || text.includes("inputText: \"")) {
    throw new Error("phase17_flow_privacy_unsafe");
  }
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

function runCase({ adbPath, manifest, id }) {
  const flow = flowFor(id);
  const profile = profileFor(id);
  applyDeviceProfile(adbPath, manifest.device.serial, profile);
  const args = [
    "test", "--no-ansi", "--udid", manifest.device.serial,
    "-e", `PHASE17_CASE_ID=${id}`,
    "-e", `PHASE17_SESSION_KIND=${sessionKindFor(id)}`,
    "-e", `PHASE17_TEXT_SCALE=${profile.fontScale}`,
    "-e", `PHASE17_REDUCED_MOTION=${profile.reducedMotion}`,
    "-e", `PHASE17_THEME=${profile.night}`,
    flow,
  ];
  execFileSync("maestro", args, { cwd: ROOT, stdio: "inherit" });
  return Object.freeze({ id, flow });
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
    const results = options.ids.map((id) => runCase({ adbPath, manifest, id }));
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
