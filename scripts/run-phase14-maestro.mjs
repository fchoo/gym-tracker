import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";

import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";
import {
  computePhase14ScrimTap,
  evaluatePhase14SemanticPredicate,
  phase14FocusAcquisitionSatisfied,
  parsePhase14SemanticSnapshot,
  validatePhase14ActionObservation,
} from "./phase14-action-observation.mjs";
import {
  buildPhase14CellCheckpoint,
  mergePhase14CellCheckpoints,
  phase14CellCheckpointPath,
  validatePhase14CellCheckpoint,
} from "./phase14-cell-checkpoint.mjs";
import {
  buildPhase14Dev02Evidence,
  comparePhase14PngBytes,
  derivePhase14NativeVerdict,
  ingestPhase14JestReport,
  validatePhase14RuntimeStatePair,
} from "./phase14-evidence-observation.mjs";
import {
  PHASE14_NATIVE_MATRIX,
  phase14BehaviorCoverageForCells,
  phase14MatrixCellsForIds,
  validatePhase14NativeMatrix,
} from "./phase14-native-matrix.mjs";
import {
  buildPhase14CaptureIndex,
  canonicalJson,
  derivePhase14RowVerdict,
  phase14CellCaptureIdentitySha256,
  resolvePhase14VisualReference,
} from "./phase14-visual-review.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const REVISION18_ROOT = "/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const ARTIFACT_ROOT = "artifacts/native/phase14";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shellCaseById = Object.freeze(Object.fromEntries(
  PHASE14_SHELL_EVIDENCE_CASES.map((entry) => [entry.id, entry]),
));

export const PHASE14_MAESTRO_STAGES = Object.freeze(
  PHASE14_SHELL_EVIDENCE_CASES.map(({ stage }) => stage),
);

function command(program, args, options = {}) {
  return execFileSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    ...options,
  }).trim();
}

function adb(adbPath, serial, ...args) {
  return command(adbPath, ["-s", serial, ...args]);
}

function relativeArtifact(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/gu, "/");
}

function mkdirFor(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, value) {
  mkdirFor(filePath);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(filePath, bytes);
  return Object.freeze({ path: relativeArtifact(filePath), sha256: sha256(bytes) });
}

function writeJsonAtomic(filePath, value) {
  mkdirFor(filePath);
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, filePath);
}

function readArtifact(relativePath) {
  return readFileSync(path.join(ROOT, relativePath));
}

function stageFor(id) {
  const entry = shellCaseById[id];
  if (entry === undefined) throw new Error(`phase14_unknown_case:${id}`);
  return entry;
}

export function validatePhase14Manifest(manifest, currentHead, currentSource) {
  if (
    manifest?.schema_version !== 1
    || manifest.suite !== "phase14"
    || manifest.profile !== "development-test"
    || manifest.package !== PACKAGE
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || !/^[a-f0-9]{40}$/u.test(manifest.base_head ?? "")
    || !/^[a-f0-9]{64}$/u.test(manifest.source_tree_sha256 ?? "")
    || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "")
    || typeof manifest.apk?.path !== "string"
    || !manifest.apk.path.startsWith(`${ARTIFACT_ROOT}/`)
    || manifest.apk?.page_alignment_kib !== 16
    || manifest.apk?.page_alignment_verified !== true
    || manifest.installed_apk?.sha256 !== manifest.apk?.sha256
    || manifest.installed_apk?.matches_retained_apk !== true
    || !/^[a-f0-9]{64}$/u.test(manifest.device?.identity_sha256 ?? "")
    || Object.hasOwn(manifest.installed_apk, "device_path")
    || Object.hasOwn(manifest.device, "serial")
  ) {
    throw new Error("phase14_manifest_invalid");
  }
  if (manifest.base_head !== currentHead || manifest.source_tree_sha256 !== currentSource) {
    throw new Error("phase14_manifest_stale");
  }
  return true;
}

export function resolvePhase14DeviceSerial(environment = process.env) {
  const serial = environment.GYM_TRACKER_ANDROID_SERIAL;
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]+$/u.test(serial)) {
    throw new Error("phase14_device_missing");
  }
  return serial;
}

export function validatePhase14ReplayableManifest(manifest, currentSource) {
  return validatePhase14Manifest(manifest, manifest.base_head, currentSource);
}

export function validateDistinctPhase14Flows(flows) {
  const body = Object.values(flows ?? {}).join("\n");
  for (const stage of PHASE14_MAESTRO_STAGES) {
    if (!body.includes(`PHASE14_STAGE == '${stage}'`)) {
      throw new Error(`phase14_maestro_stage_missing:${stage}`);
    }
  }
  if (!body.includes("select-theme.yaml")) {
    throw new Error("phase14_explicit_theme_selection_missing");
  }
  return true;
}

export function parsePhase14RunnerArgs(args) {
  const options = { manifest: "", ids: [], cell: null, mode: null };
  let selectionCount = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest") options.manifest = args[++index] ?? "";
    else if (arg === "--ids") {
      selectionCount += 1;
      options.mode = "ids";
      options.ids = (args[++index] ?? "").split(",").filter(Boolean);
    } else if (arg === "--all") {
      selectionCount += 1;
      options.mode = "all";
      options.ids = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
    } else if (arg === "--cell") {
      selectionCount += 1;
      options.mode = "cell-smoke";
      options.cell = args[++index] ?? "";
      const cell = PHASE14_NATIVE_MATRIX.cells.find(({ id }) => id === options.cell);
      options.ids = cell === undefined ? [] : [cell.caseId];
    }
    else throw new Error(`phase14_runner_unknown_argument:${arg}`);
  }
  if (
    options.manifest !== `${ARTIFACT_ROOT}/build.json`
    || selectionCount !== 1
    || options.ids.length === 0
    || new Set(options.ids).size !== options.ids.length
    || options.ids.some((id) => shellCaseById[id] === undefined)
    || (options.mode === "cell-smoke"
      && !PHASE14_NATIVE_MATRIX.cells.some(({ id }) => id === options.cell))
  ) {
    throw new Error("phase14_runner_arguments_invalid");
  }
  return options;
}

function resolveAdb() {
  const androidRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const candidate = androidRoot === undefined
    ? "/opt/homebrew/share/android-commandlinetools/platform-tools/adb"
    : path.join(androidRoot, "platform-tools", "adb");
  if (!existsSync(candidate)) throw new Error(`phase14_adb_missing:${candidate}`);
  return candidate;
}

function parseOverride(output, label) {
  return output.match(new RegExp(`Override ${label}:\\s*([^\\n]+)`, "u"))?.[1] ?? null;
}

function parseNightMode(output) {
  const value = output.toLowerCase();
  if (value.includes("night mode: yes") || value === "yes") return "dark";
  if (value.includes("night mode: no") || value === "no") return "light";
  return "auto";
}

function parseUserRotationState(output) {
  const match = output.match(/^(free|lock)(?:\s+([0-3]))?$/u);
  if (match === null) throw new Error("phase14_user_rotation_state_invalid");
  return Object.freeze({ mode: match[1], rotation: match[2] ?? null });
}

function parseFixedToUserRotation(output) {
  if (!["enabled", "disabled", "default", "enabled_if_no_auto_rotation"].includes(output)) {
    throw new Error("phase14_fixed_user_rotation_state_invalid");
  }
  return output;
}

function expectedDisplayGeometry(cell) {
  return cell.orientation === "landscape"
    ? Object.freeze({ width: cell.viewport.height, height: cell.viewport.width })
    : Object.freeze({ width: cell.viewport.width, height: cell.viewport.height });
}

function waitForExactDisplayGeometry(adbPath, serial, cell) {
  const expected = expectedDisplayGeometry(cell);
  let last = null;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const bytes = execFileSync(
        adbPath,
        ["-s", serial, "exec-out", "screencap", "-p"],
        { cwd: ROOT },
      );
      const image = PNG.sync.read(bytes);
      last = Object.freeze({ width: image.width, height: image.height });
      if (last.width === expected.width && last.height === expected.height) return;
    } catch {
      last = null;
    }
    if (attempt < 40) adb(adbPath, serial, "shell", "sleep", "0.25");
  }
  const observed = last === null ? "unreadable" : `${last.width}x${last.height}`;
  throw new Error(`phase14_display_geometry_timeout:${expected.width}x${expected.height}:${observed}`);
}

function readDeviceState(adbPath, serial) {
  return Object.freeze({
    wmSizeOverride: parseOverride(adb(adbPath, serial, "shell", "wm", "size"), "size"),
    wmDensityOverride: parseOverride(adb(adbPath, serial, "shell", "wm", "density"), "density"),
    fixedToUserRotation: parseFixedToUserRotation(
      adb(adbPath, serial, "shell", "wm", "fixed-to-user-rotation"),
    ),
    userRotationState: parseUserRotationState(
      adb(adbPath, serial, "shell", "wm", "user-rotation"),
    ),
    fontScale: adb(adbPath, serial, "shell", "settings", "get", "system", "font_scale") || "1.0",
    animatorDurationScale: adb(adbPath, serial, "shell", "settings", "get", "global", "animator_duration_scale") || "1",
    transitionAnimationScale: adb(adbPath, serial, "shell", "settings", "get", "global", "transition_animation_scale") || "1",
    windowAnimationScale: adb(adbPath, serial, "shell", "settings", "get", "global", "window_animation_scale") || "1",
    nightMode: parseNightMode(adb(adbPath, serial, "shell", "cmd", "uimode", "night")),
  });
}

function setNightMode(adbPath, serial, scheme) {
  adb(adbPath, serial, "shell", "cmd", "uimode", "night", scheme === "dark" ? "yes" : "no");
}

function applyCellDeviceState(adbPath, serial, cell) {
  adb(adbPath, serial, "shell", "wm", "fixed-to-user-rotation", "enabled");
  adb(adbPath, serial, "shell", "wm", "user-rotation", "lock", cell.orientation === "landscape" ? "1" : "0");
  adb(adbPath, serial, "shell", "wm", "density", "160");
  adb(adbPath, serial, "shell", "wm", "size", `${cell.viewport.width}x${cell.viewport.height}`);
  adb(adbPath, serial, "shell", "settings", "put", "system", "font_scale", String(cell.fontScale));
  const animationScale = cell.reducedMotion ? "0" : "1";
  for (const key of ["animator_duration_scale", "transition_animation_scale", "window_animation_scale"]) {
    adb(adbPath, serial, "shell", "settings", "put", "global", key, animationScale);
  }
  setNightMode(adbPath, serial, cell.osScheme);
  // Size, font, and UI mode changes can recreate the display and drop the first lock.
  adb(adbPath, serial, "shell", "wm", "fixed-to-user-rotation", "enabled");
  adb(adbPath, serial, "shell", "wm", "user-rotation", "lock", cell.orientation === "landscape" ? "1" : "0");
  waitForExactDisplayGeometry(adbPath, serial, cell);
}

function restoreCellDeviceState(adbPath, serial, applied) {
  const state = applied.original;
  adb(adbPath, serial, "shell", "wm", "size", state.wmSizeOverride ?? "reset");
  adb(adbPath, serial, "shell", "wm", "density", state.wmDensityOverride ?? "reset");
  adb(adbPath, serial, "shell", "settings", "put", "system", "font_scale", state.fontScale);
  if (state.userRotationState.mode === "free") {
    adb(adbPath, serial, "shell", "wm", "user-rotation", "free");
  } else {
    adb(adbPath, serial, "shell", "wm", "user-rotation", "lock", state.userRotationState.rotation ?? "0");
  }
  adb(adbPath, serial, "shell", "wm", "fixed-to-user-rotation", state.fixedToUserRotation);
  adb(adbPath, serial, "shell", "settings", "put", "global", "animator_duration_scale", state.animatorDurationScale);
  adb(adbPath, serial, "shell", "settings", "put", "global", "transition_animation_scale", state.transitionAnimationScale);
  adb(adbPath, serial, "shell", "settings", "put", "global", "window_animation_scale", state.windowAnimationScale);
  if (state.nightMode !== "auto") setNightMode(adbPath, serial, state.nightMode);
  else adb(adbPath, serial, "shell", "cmd", "uimode", "night", "auto");
}

function reportSummary(bytes, label) {
  const text = bytes.toString("utf8");
  const tests = Number(text.match(/\btests="(\d+)"/u)?.[1] ?? 0);
  const failures = Number(text.match(/\bfailures="(\d+)"/u)?.[1] ?? 0);
  const errors = Number(text.match(/\berrors="(\d+)"/u)?.[1] ?? 0);
  const skipped = Number(text.match(/\bskipped="(\d+)"/u)?.[1] ?? 0);
  if (tests < 1 || failures !== 0 || errors !== 0 || skipped !== 0) {
    throw new Error(`phase14_maestro_report_invalid:${label}`);
  }
  return Object.freeze({ tests, failures, errors, skipped, verdict: "PASS" });
}

function runMaestroCell({ actionId = "none", cell, flowPath, reportPath, serial }) {
  const args = [
    "test", "--no-ansi", "--format", "junit", "--output", reportPath,
    "--udid", serial,
    "-e", `PHASE14_STAGE=${cell.stage}`,
    "-e", `PHASE14_THEME_OPTION=${cell.appearanceSelection}`,
    "-e", `PHASE14_RENDERED_THEME=${cell.renderedTheme}`,
    "-e", `PHASE14_REDUCED_MOTION=${cell.reducedMotion ? "true" : "false"}`,
    "-e", `PHASE14_ACTION=${actionId}`,
    "-e", `PHASE14_THEME_PRESELECTED=${actionId === "none" ? "false" : "true"}`,
    flowPath,
  ];
  execFileSync("maestro", args, { cwd: ROOT, stdio: "inherit" });
}

function dumpSemanticTree(adbPath, serial) {
  adb(adbPath, serial, "shell", "uiautomator", "dump", "/sdcard/phase14-window.xml");
  return execFileSync(adbPath, ["-s", serial, "exec-out", "cat", "/sdcard/phase14-window.xml"], { cwd: ROOT });
}

function captureSemanticTree(adbPath, serial, outputPath, existingBytes = undefined) {
  const bytes = existingBytes ?? dumpSemanticTree(adbPath, serial);
  mkdirFor(outputPath);
  writeFileSync(outputPath, bytes);
  return Object.freeze({ path: relativeArtifact(outputPath), sha256: sha256(bytes), bytes });
}

function captureScreenshot(adbPath, serial, outputPath) {
  const bytes = execFileSync(adbPath, ["-s", serial, "exec-out", "screencap", "-p"], { cwd: ROOT });
  mkdirFor(outputPath);
  writeFileSync(outputPath, bytes);
  return Object.freeze({ path: relativeArtifact(outputPath), sha256: sha256(bytes), bytes });
}

function isPackageForeground(adbPath, serial, packageName) {
  const windowOutput = adb(adbPath, serial, "shell", "dumpsys", "window", "windows");
  const activityOutput = adb(adbPath, serial, "shell", "dumpsys", "activity", "activities");
  const focusLines = `${windowOutput}\n${activityOutput}`
    .split("\n")
    .filter((line) => /mCurrentFocus|mFocusedApp|topResumedActivity|ResumedActivity/u.test(line));
  return focusLines.some((line) => line.includes(`${packageName}/`));
}

export function parsePhase14ImeVisibility(output) {
  const inputShown = output.match(/\bmInputShown=(true|false)\b/u);
  if (inputShown !== null) return inputShown[1] === "true";
  return output.match(/\bmIsInputViewShown=(true|false)\b/u)?.[1] === "true";
}

function isImeVisible(adbPath, serial) {
  return parsePhase14ImeVisibility(
    adb(adbPath, serial, "shell", "dumpsys", "input_method"),
  );
}

function resolveLauncherComponent(adbPath, serial, packageName) {
  const component = adb(adbPath, serial, "shell", "cmd", "package", "resolve-activity", "--brief", packageName)
    .split("\n")
    .at(-1);
  if (typeof component !== "string" || !component.startsWith(`${packageName}/`)) {
    throw new Error("phase14_launcher_component_invalid");
  }
  return component;
}

function pollExactActionState(adbPath, serial, packageName, predicate, poll, outputPath) {
  const maxAttempts = Math.ceil(poll.timeoutMs / poll.intervalMs) + 1;
  let lastEvaluation = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const packageForeground = isPackageForeground(adbPath, serial, packageName);
    const imeVisible = isImeVisible(adbPath, serial);
    let bytes = null;
    let snapshot = null;
    if (predicate.semanticRequired !== false) {
      try {
        bytes = dumpSemanticTree(adbPath, serial);
        snapshot = parsePhase14SemanticSnapshot(bytes);
      } catch {
        snapshot = null;
      }
    }
    lastEvaluation = evaluatePhase14SemanticPredicate(snapshot, predicate, { packageForeground, imeVisible });
    if (lastEvaluation.ok) {
      const artifact = bytes === null ? null : captureSemanticTree(adbPath, serial, outputPath, bytes);
      return Object.freeze({
        attempts: attempt,
        packageForeground,
        imeVisible,
        snapshot,
        artifact,
      });
    }
    if (attempt < maxAttempts) adb(adbPath, serial, "shell", "sleep", String(poll.intervalMs / 1_000));
  }
  throw new Error(`phase14_action_state_timeout:${lastEvaluation?.failures.join(",") ?? "unknown"}`);
}

function acquireExactFocus(adbPath, serial, packageName, action) {
  const acquisition = action.focusAcquisition;
  if (acquisition === undefined) return;
  for (let attempt = 0; attempt < acquisition.maxAttempts; attempt += 1) {
    const snapshot = parsePhase14SemanticSnapshot(dumpSemanticTree(adbPath, serial));
    const runtimeState = {
      packageForeground: isPackageForeground(adbPath, serial, packageName),
      imeVisible: isImeVisible(adbPath, serial),
    };
    if (phase14FocusAcquisitionSatisfied(snapshot, action, runtimeState)) return;
    const keyCodes = acquisition.keyCodes;
    const keyCode = keyCodes[attempt % keyCodes.length];
    adb(adbPath, serial, "shell", "input", "keyevent", String(keyCode));
    adb(adbPath, serial, "shell", "sleep", String(action.poll.intervalMs / 1_000));
  }
  throw new Error(`phase14_focus_acquisition_failed:${action.id}`);
}

export function parsePhase14SourceStateProof(output) {
  const match = output.match(
    /PHASE14_SOURCE_STATE_PROOF digest_sha256=([a-f0-9]{64}) table_count=(\d+) row_count=(\d+) schema_version=(\d+)(?=$|["<])/u,
  );
  const tableCount = Number(match?.[2]);
  const rowCount = Number(match?.[3]);
  const schemaVersion = Number(match?.[4]);
  if (
    match === null
    || !Number.isSafeInteger(tableCount)
    || tableCount < 1
    || !Number.isSafeInteger(rowCount)
    || rowCount < 0
    || !Number.isSafeInteger(schemaVersion)
    || schemaVersion < 1
  ) {
    throw new Error("phase14_runtime_state_capture_invalid");
  }
  return Object.freeze({
    proof_schema_version: 1,
    producer: "phase14-app-canonical-logical-source-digest/v1",
    authority: "development-test-app-canonical-logical-sqlite-source",
    digest_sha256: match[1],
    table_count: tableCount,
    row_count: rowCount,
    schema_version: schemaVersion,
    contains_raw_rows: false,
  });
}

function captureRuntimeSourceStateProof(adbPath, serial, packageName) {
  const remotePath = "/sdcard/phase14-source-state-proof.xml";
  adb(adbPath, serial, "shell", "am", "force-stop", packageName);
  try {
    adb(
      adbPath,
      serial,
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      "gymtracker-devtest://__phase14-source-state-proof",
      "-p",
      packageName,
    );
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        adb(adbPath, serial, "shell", "uiautomator", "dump", remotePath);
        const xml = execFileSync(
          adbPath,
          ["-s", serial, "exec-out", "cat", remotePath],
          { cwd: ROOT, encoding: "utf8" },
        );
        return parsePhase14SourceStateProof(xml);
      } catch (error) {
        if (error?.message === "phase14_runtime_state_capture_invalid") {
          adb(adbPath, serial, "shell", "sleep", "0.25");
          continue;
        }
        if (attempt === 39) throw error;
        adb(adbPath, serial, "shell", "sleep", "0.25");
      }
    }
    throw new Error("phase14_runtime_state_capture_invalid");
  } finally {
    adb(adbPath, serial, "shell", "am", "force-stop", packageName);
  }
}

function observedSide(result) {
  return Object.freeze({
    package_foreground: result.packageForeground,
    ime_visible: result.imeVisible,
    semantic_tree: result.artifact?.path ?? null,
    semantic_tree_sha256: result.artifact?.sha256 ?? null,
    focused_node: result.snapshot?.focused_node ?? null,
    predicate: Object.freeze({ verdict: "PASS", failures: Object.freeze([]) }),
  });
}

function executeObservedAction(adbPath, serial, packageName, cell, action, traceDirectory, order, prepare) {
  const prePath = path.join(traceDirectory, `${cell.id}-${order}-pre.xml`);
  const postPath = path.join(traceDirectory, `${cell.id}-${order}-post.xml`);
  let preparation;
  if (action.transport === "adb-launch") {
    adb(adbPath, serial, "shell", "am", "force-stop", packageName);
    preparation = Object.freeze({ kind: "adb-force-stop" });
  } else {
    const report = prepare();
    preparation = Object.freeze({ kind: "maestro", report: report.path, report_sha256: report.sha256 });
    acquireExactFocus(adbPath, serial, packageName, action);
  }
  const preResult = pollExactActionState(adbPath, serial, packageName, action.pre, action.poll, prePath);
  const startedAt = new Date().toISOString();
  let commandObservation;
  if (action.transport === "adb-keyevent") {
    adb(adbPath, serial, "shell", "input", "keyevent", String(action.command.keyCode));
    commandObservation = { key_code: action.command.keyCode };
  } else if (action.transport === "adb-coordinate") {
    const target = computePhase14ScrimTap(preResult.snapshot);
    adb(adbPath, serial, "shell", "input", "tap", String(target.x), String(target.y));
    commandObservation = { normalized_target: "outside-sheet", ...target };
  } else {
    const component = resolveLauncherComponent(adbPath, serial, packageName);
    adb(adbPath, serial, "shell", "am", "start", "-W", "-n", component);
    commandObservation = { intent: "launcher", component_sha256: sha256(component) };
  }
  const postResult = pollExactActionState(adbPath, serial, packageName, action.post, action.poll, postPath);
  const observation = Object.freeze({
    schema_version: 3,
    order,
    action_id: action.id,
    input: action.input,
    transport: action.transport,
    command: commandObservation,
    preparation,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    poll_attempts: Math.max(preResult.attempts, postResult.attempts),
    pre: observedSide(preResult),
    post: observedSide(postResult),
    verdict: "PASS",
  });
  validatePhase14ActionObservation(observation, action, { pre: preResult.snapshot, post: postResult.snapshot });
  return observation;
}

function captureWindowBounds(adbPath, serial, cell) {
  return Object.freeze({
    requested_viewport: cell.viewport,
    requested_orientation: cell.orientation,
    requested_font_scale: cell.fontScale,
    requested_appearance: cell.appearance,
    wm_size: adb(adbPath, serial, "shell", "wm", "size"),
    wm_density: adb(adbPath, serial, "shell", "wm", "density"),
    font_scale: adb(adbPath, serial, "shell", "settings", "get", "system", "font_scale"),
    os_scheme: parseNightMode(adb(adbPath, serial, "shell", "cmd", "uimode", "night")),
  });
}

function themeObservation(adbPath, serial, cell, selectionReport) {
  const actualOsScheme = parseNightMode(adb(adbPath, serial, "shell", "cmd", "uimode", "night"));
  const expectedOsScheme = cell.liveOsSwitch
    ? (cell.systemNightAfter ? "dark" : "light")
    : cell.osScheme;
  const renderedTheme = cell.appearanceSelection === "System" ? actualOsScheme : cell.renderedTheme;
  const expectedRenderedTheme = cell.expectedRenderedThemeAfterSwitch ?? cell.renderedTheme;
  const passed = actualOsScheme === expectedOsScheme && renderedTheme === expectedRenderedTheme;
  return Object.freeze({
    selected_option: cell.appearanceSelection,
    selection_observed_via: "maestro-tap-and-assert",
    selection_report: selectionReport.path,
    selection_report_sha256: selectionReport.sha256,
    os_scheme: actualOsScheme,
    rendered_theme: renderedTheme,
    expected_rendered_theme: expectedRenderedTheme,
    verdict: passed ? "PASS" : "FAIL",
  });
}

function writeVisualComparison(cell, nativeCapture, observedTheme, outputDirectory) {
  const policy = cell.referencePolicy;
  const resolution = resolvePhase14VisualReference(cell, observedTheme);
  if (resolution.kind === "native-only") return resolution;
  if (resolution.kind === "not-exact") {
    return Object.freeze({
      verdict: "NOT_RUN",
      rationale: resolution.rationale,
      reference_policy: "authoritative-only",
    });
  }
  const reference = resolution.reference;
  const referencePath = path.resolve(ROOT, reference.file);
  const referenceBytes = readFileSync(referencePath);
  if (sha256(referenceBytes) !== reference.sha256) throw new Error("phase14_revision18_reference_stale");
  const comparison = comparePhase14PngBytes({ reference: referenceBytes, native: nativeCapture.bytes });
  const directory = path.join(outputDirectory, "comparison", cell.id);
  const artifactRecords = {};
  for (const [name, bytes] of Object.entries(comparison.bytes)) {
    const outputPath = path.join(directory, `${name}.png`);
    mkdirFor(outputPath);
    writeFileSync(outputPath, bytes);
    artifactRecords[name] = Object.freeze({ path: relativeArtifact(outputPath), sha256: sha256(bytes), media_type: "image/png" });
  }
  const record = Object.freeze({
    ...comparison.record,
    reference_id: policy.referenceId,
    reference_source: policy.source,
    capture_state: policy.captureState,
    observed_rendered_theme: observedTheme.rendered_theme,
    configuration_id: cell.configurationId,
    artifacts: Object.freeze(artifactRecords),
  });
  const recordArtifact = writeJson(path.join(directory, "comparison.json"), record);
  return Object.freeze({
    verdict: record.classification === "MATCH" ? "PASS" : "REVIEW_REQUIRED",
    classification: record.classification,
    record: recordArtifact.path,
    record_sha256: recordArtifact.sha256,
    metrics: record.metrics,
    artifacts: record.artifacts,
  });
}

function runComponentEvidence(ids, outputDirectory) {
  const contracts = PHASE14_SHELL_EVIDENCE_CASES.filter(({ id }) => ids.includes(id));
  const files = [...new Set(contracts.flatMap(({ componentTests }) => componentTests))];
  const reportPath = path.join(outputDirectory, "components", "jest.json");
  mkdirFor(reportPath);
  execFileSync(process.execPath, [
    "scripts/run-component-tests.mjs", "--runInBand", "--json", `--outputFile=${reportPath}`, ...files,
  ], { cwd: ROOT, stdio: "inherit" });
  const bytes = readFileSync(reportPath);
  const ingested = ingestPhase14JestReport(JSON.parse(bytes.toString("utf8")), contracts);
  return Object.freeze({
    ...ingested,
    report: relativeArtifact(reportPath),
    report_sha256: sha256(bytes),
  });
}

function ensureFlowBodies() {
  const flows = Object.fromEntries(
    [...new Set(PHASE14_SHELL_EVIDENCE_CASES.map(({ flow }) => flow))]
      .map((flow) => [flow, readFileSync(path.join(ROOT, "maestro/phase14", `${flow}.yaml`), "utf8")]),
  );
  validateDistinctPhase14Flows(flows);
}

function buildDev02() {
  const themeBytes = readFileSync(path.join(ROOT, "src/ui/theme/index.ts"));
  const prototypeBytes = readFileSync(path.join(REVISION18_ROOT, "approved-hybrid.html"));
  const ownerBytes = readFileSync(path.join(ROOT, ".planning/v1.2-OWNER-DECISIONS.md"));
  const themeText = themeBytes.toString("utf8");
  const prototypeText = prototypeBytes.toString("utf8");
  if (!themeText.includes('calendarStrengthTextLight: "#9B470B"') || !themeText.includes('orange: "#D97820"')) {
    throw new Error("phase14_dev02_source_token_invalid");
  }
  if (!prototypeText.includes("color-mix(in srgb,currentColor 14%,transparent)")) {
    throw new Error("phase14_dev02_source_blend_invalid");
  }
  return buildPhase14Dev02Evidence({
    titleHex: "#9B470B",
    sportHex: "#D97820",
    surfaceHex: "#FFFAF0",
    blendAlpha: 0.14,
    sourceHashes: {
      theme_sha256: sha256(themeBytes),
      prototype_sha256: sha256(prototypeBytes),
      owner_record_sha256: sha256(ownerBytes),
    },
  });
}

function cellCheckpointIdentity(manifest) {
  return Object.freeze({
    source_tree_sha256: manifest.source_tree_sha256,
    apk_sha256: manifest.apk.sha256,
    package: manifest.package,
    profile: manifest.profile,
    device_identity_sha256: manifest.device.identity_sha256,
    matrix_schema_version: PHASE14_NATIVE_MATRIX.schemaVersion,
  });
}

function absoluteCellCheckpointPath(outputDirectory, cellId) {
  return path.join(
    ROOT,
    phase14CellCheckpointPath(relativeArtifact(outputDirectory), cellId),
  );
}

function readValidatedCellCheckpoint(outputDirectory, expectedCell, identity) {
  const checkpointPath = absoluteCellCheckpointPath(outputDirectory, expectedCell.id);
  if (!existsSync(checkpointPath)) return null;
  let checkpoint;
  try {
    checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
  } catch {
    throw new Error(`phase14_cell_checkpoint_incomplete:${expectedCell.id}`);
  }
  validatePhase14CellCheckpoint(checkpoint, {
    expectedCell,
    identity,
    readArtifact,
  });
  return checkpoint;
}

export function executePhase14Maestro(args = process.argv.slice(2)) {
  validatePhase14NativeMatrix(PHASE14_NATIVE_MATRIX);
  const { manifest: manifestPath, ids, cell: requestedCell, mode } = parsePhase14RunnerArgs(args);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const currentSource = sourceTreeSha256(ROOT);
  validatePhase14ReplayableManifest(manifest, currentSource);
  ensureFlowBodies();
  const apkPath = path.resolve(ROOT, manifest.apk.path);
  if (!existsSync(apkPath) || sha256(readFileSync(apkPath)) !== manifest.apk.sha256) throw new Error("phase14_apk_stale");

  const serial = resolvePhase14DeviceSerial();
  const adbPath = resolveAdb();
  const outputDirectory = mode === "cell-smoke"
    ? path.join(ROOT, ARTIFACT_ROOT, "smoke", requestedCell)
    : path.join(ROOT, ARTIFACT_ROOT);
  const maestroDirectory = path.join(outputDirectory, "maestro");
  if (mode === "cell-smoke") {
    rmSync(outputDirectory, { recursive: true, force: true });
  } else {
    for (const staleFinal of [
      path.join(maestroDirectory, "phase14-evidence.json"),
      path.join(outputDirectory, "capture-index.json"),
      path.join(outputDirectory, "verified-evidence.json"),
      path.join(outputDirectory, "finalized-evidence.json"),
    ]) rmSync(staleFinal, { force: true });
  }
  for (const name of ["cells", "maestro", "screenshots", "semantic", "traces", "comparison", "components", "runtime-state"]) {
    mkdirSync(path.join(outputDirectory, name), { recursive: true });
  }

  const componentEvidence = runComponentEvidence(ids, outputDirectory);
  const componentById = new Map(componentEvidence.cases.map((entry) => [entry.id, entry]));
  const finalCells = phase14MatrixCellsForIds(ids);
  const cells = requestedCell === null
    ? finalCells
    : finalCells.filter(({ id }) => id === requestedCell);
  const checkpointIdentity = cellCheckpointIdentity(manifest);
  const cellCheckpoints = [];
  let resumedCellCount = 0;

  for (const cell of cells) {
    const existingCheckpoint = readValidatedCellCheckpoint(outputDirectory, cell, checkpointIdentity);
    if (existingCheckpoint !== null) {
      cellCheckpoints.push(existingCheckpoint);
      resumedCellCount += 1;
      continue;
    }
    const cellCapturedStartedAt = new Date().toISOString();
    adb(adbPath, serial, "shell", "am", "force-stop", manifest.package);
    const applied = Object.freeze({ original: readDeviceState(adbPath, serial) });
    let completedCheckpoint;
    try {
      applyCellDeviceState(adbPath, serial, cell);
      const flowPath = path.join(ROOT, "maestro/phase14", `${cell.flow}.yaml`);
      const reportPath = path.join(maestroDirectory, `${cell.id}.xml`);
      runMaestroCell({ cell, flowPath, reportPath, serial });
      if (cell.liveOsSwitch) {
        setNightMode(adbPath, serial, cell.systemNightAfter ? "dark" : "light");
        adb(adbPath, serial, "shell", "sleep", "0.5");
      }
      const reportBytes = readFileSync(reportPath);
      const maestro = reportSummary(reportBytes, cell.id);
      const screenshot = captureScreenshot(adbPath, serial, path.join(outputDirectory, "screenshots", `${cell.id}.png`));
      const semantic = captureSemanticTree(adbPath, serial, path.join(outputDirectory, "semantic", `${cell.id}.xml`));
      const semanticSnapshot = parsePhase14SemanticSnapshot(semantic.bytes);
      const semanticEvaluation = evaluatePhase14SemanticPredicate(
        semanticSnapshot,
        cell.state.capture,
        {
          packageForeground: isPackageForeground(adbPath, serial, manifest.package),
          imeVisible: isImeVisible(adbPath, serial),
        },
      );
      if (!semanticEvaluation.ok) {
        throw new Error(`phase14_capture_state_invalid:${cell.id}:${semanticEvaluation.failures.join(",")}`);
      }
      const reportArtifact = Object.freeze({ path: relativeArtifact(reportPath), sha256: sha256(reportBytes) });
      const theme = themeObservation(adbPath, serial, cell, reportArtifact);
      const scheduledActions = cell.behavior.actionIds.map((actionId) => {
        const action = cell.actions.find(({ id }) => id === actionId);
        if (action === undefined) throw new Error(`phase14_behavior_action_missing:${cell.id}:${actionId}`);
        return action;
      });
      const runtimePre = cell.behavior.logicalStateProbe
        ? captureRuntimeSourceStateProof(adbPath, serial, manifest.package)
        : null;
      const actionObservations = scheduledActions.map((action, order) =>
        executeObservedAction(
          adbPath,
          serial,
          manifest.package,
          cell,
          action,
          path.join(outputDirectory, "traces"),
          order,
          () => {
            const preparationReportPath = path.join(maestroDirectory, `${cell.id}-action-${order}-${action.id}.xml`);
            runMaestroCell({ actionId: action.id, cell, flowPath, reportPath: preparationReportPath, serial });
            const preparationBytes = readFileSync(preparationReportPath);
            reportSummary(preparationBytes, `${cell.id}:${action.id}`);
            return Object.freeze({ path: relativeArtifact(preparationReportPath), sha256: sha256(preparationBytes) });
          },
        ));
      const trace = Object.freeze({
        schema_version: 3,
        producer: "phase14-adb-observer/v2",
        synthetic: false,
        cell_id: cell.id,
        stage: cell.stage,
        observations: Object.freeze(actionObservations),
      });
      const traceArtifact = writeJson(path.join(outputDirectory, "traces", `${cell.id}.json`), trace);
      const runtimeState = cell.behavior.logicalStateProbe
        ? (() => {
            adb(adbPath, serial, "shell", "am", "force-stop", manifest.package);
            const pair = { pre: runtimePre, post: captureRuntimeSourceStateProof(adbPath, serial, manifest.package) };
            validatePhase14RuntimeStatePair(pair);
            const artifact = writeJson(path.join(outputDirectory, "runtime-state", `${cell.id}.json`), pair);
            return Object.freeze({ verdict: "PASS", ...artifact, ...pair });
          })()
        : Object.freeze({
            verdict: "N_A_REVIEWED",
            rationale: cell.runtimeStatePolicy === "preference-write-reviewed"
              ? "The appearance preference action intentionally writes the reviewed device preference."
              : "Logical no-write state is probed only by the explicit representative behavior configurations for this state.",
          });
      const checkpoints = cell.checkpoints.map((checkpoint) => Object.freeze({
        id: checkpoint.id,
        observed_via: "passing-maestro-assertion",
        report_sha256: sha256(reportBytes),
        verdict: maestro.verdict,
      }));
      const visual = writeVisualComparison(cell, screenshot, theme, outputDirectory);
      const nativeVerdict = derivePhase14NativeVerdict({
        maestro,
        actions: actionObservations,
        expectedActionCount: cell.behavior.actionIds.length,
        checkpoints,
        runtimeState,
        theme,
      });
      const cellObservation = Object.freeze({
        id: cell.id,
        configuration_id: cell.configurationId,
        variant: cell.variant,
        case_id: cell.caseId,
        stage: cell.stage,
        state: cell.state,
        appearance: cell.appearance,
        appearance_selection: cell.appearanceSelection,
        rendered_theme: cell.renderedTheme,
        os_scheme: cell.osScheme,
        viewport: cell.viewport,
        orientation: cell.orientation,
        font_scale: cell.fontScale,
        reduced_motion: cell.reducedMotion,
        live_os_switch: cell.liveOsSwitch,
        behavior: cell.behavior,
        capture_requirements: cell.captureRequirements,
        report: relativeArtifact(reportPath),
        report_sha256: sha256(reportBytes),
        maestro,
        screenshot: screenshot.path,
        screenshot_sha256: screenshot.sha256,
        semantic_tree: semantic.path,
        semantic_tree_sha256: semantic.sha256,
        semantic_observation: Object.freeze({
          capture_state: cell.state.captureState,
          package: manifest.package,
          focused_node: semanticSnapshot.focused_node,
          verdict: "PASS",
        }),
        focus_key_trace: traceArtifact.path,
        focus_key_trace_sha256: traceArtifact.sha256,
        actions: actionObservations,
        checkpoints,
        target_window_bounds: captureWindowBounds(adbPath, serial, cell),
        runtime_state: runtimeState,
        theme_observation: theme,
        visual_comparison: visual,
        native_verdict: nativeVerdict,
      });
      completedCheckpoint = buildPhase14CellCheckpoint({
        expectedCell: cell,
        identity: checkpointIdentity,
        observation: cellObservation,
        capturedStartedAt: cellCapturedStartedAt,
        capturedFinishedAt: new Date().toISOString(),
      });
    } finally {
      adb(adbPath, serial, "shell", "am", "force-stop", manifest.package);
      restoreCellDeviceState(adbPath, serial, applied);
    }
    if (completedCheckpoint === undefined) throw new Error(`phase14_cell_checkpoint_incomplete:${cell.id}`);
    writeJsonAtomic(absoluteCellCheckpointPath(outputDirectory, cell.id), completedCheckpoint);
    cellCheckpoints.push(completedCheckpoint);
  }

  const merged = mergePhase14CellCheckpoints(cellCheckpoints, cells, checkpointIdentity, readArtifact);
  const byCaseId = new Map(ids.map((id) => [id, []]));
  for (const observation of merged.observations) byCaseId.get(observation.case_id)?.push(observation);

  const rows = ids.map((id) => {
    const entry = stageFor(id);
    const matrixCells = Object.freeze(byCaseId.get(id));
    const component = componentById.get(id);
    const nativeVerdict = matrixCells.every(({ native_verdict: verdict }) => verdict === "PASS") ? "PASS" : "FAIL";
    const visualVerdicts = matrixCells.map(({ visual_comparison: comparison }) => comparison.verdict);
    const comparableRequired = matrixCells.filter(({ visual_comparison: comparison }) => comparison.artifacts !== undefined).length;
    const rowVerdict = derivePhase14RowVerdict({
      componentVerdict: component.verdict,
      nativeVerdict,
      visualVerdicts,
      comparableRequired,
    });
    return Object.freeze({
      id,
      requirement: entry.requirement,
      path: entry.evidencePath,
      component_evidence: component,
      component_verdict: component.verdict,
      native_verdict: nativeVerdict,
      visual_verdict: rowVerdict.visual_verdict,
      verdict: rowVerdict.verdict,
      matrix_cells: matrixCells,
    });
  });
  const dev02 = ids.includes("shell.tokens") ? buildDev02() : undefined;
  const capturedStartedAt = merged.captured_started_at;
  const capturedFinishedAt = merged.captured_finished_at;
  const checkpointSet = cellCheckpoints.map(({ cell_id: cellId, observation }) => ({
    cell_id: cellId,
    observation_sha256: phase14CellCaptureIdentitySha256(observation),
  }));
  const checkpointArtifacts = cells.map((cell) => {
    const checkpointPath = absoluteCellCheckpointPath(outputDirectory, cell.id);
    const bytes = readFileSync(checkpointPath);
    return Object.freeze({
      cell_id: cell.id,
      path: relativeArtifact(checkpointPath),
      sha256: sha256(bytes),
    });
  });
  const evidence = {
    schema_version: 4,
    producer: "phase14-native-observation/v4",
    suite: "phase14",
    verdict: rows.every(({ verdict }) => verdict === "PASS") ? "PASS" : (rows.some(({ verdict }) => verdict === "FAIL") ? "FAIL" : "REVIEW_REQUIRED"),
    build_manifest: manifestPath,
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    profile: manifest.profile,
    device_identity_sha256: manifest.device.identity_sha256,
    apk: { ...manifest.apk, installed_sha256: manifest.apk.sha256, matches_retained_apk: true },
    captured_started_at: capturedStartedAt,
    captured_finished_at: capturedFinishedAt,
    matrix: PHASE14_NATIVE_MATRIX,
    coverage: Object.freeze({
      mode,
      complete: mode !== "cell-smoke",
      requested_ids: ids,
      requested_cell: requestedCell,
      expected_cell_count: cells.length,
      observed_cell_count: rows.flatMap(({ matrix_cells: matrixCells }) => matrixCells).length,
      checkpoint_cell_count: cellCheckpoints.length,
      resumed_cell_count: resumedCellCount,
      checkpoint_cell_ids: Object.freeze(checkpointSet.map(({ cell_id: cellId }) => cellId)),
      checkpoint_set_sha256: sha256(canonicalJson(checkpointSet)),
      cell_checkpoints: Object.freeze(checkpointArtifacts),
    }),
    behavior_coverage: phase14BehaviorCoverageForCells(cells),
    component_evidence: componentEvidence,
    evidence: rows,
    matrix_cells: rows.flatMap(({ matrix_cells: matrixCells }) => matrixCells),
    ...(dev02 === undefined ? {} : { dev02 }),
  };
  const captureIndex = buildPhase14CaptureIndex(evidence);
  const captureIndexArtifact = writeJson(path.join(outputDirectory, "capture-index.json"), captureIndex);
  evidence.capture_index = {
    path: captureIndexArtifact.path,
    sha256: captureIndexArtifact.sha256,
    capture_set_sha256: captureIndex.capture_set_sha256,
  };
  writeJson(path.join(maestroDirectory, "phase14-evidence.json"), evidence);
  if (mode !== "cell-smoke") {
    for (const row of rows) {
      const record = {
        ...evidence,
        coverage: {
          mode: "ids",
          complete: true,
          requested_ids: [row.id],
          requested_cell: null,
          expected_cell_count: row.matrix_cells.length,
          observed_cell_count: row.matrix_cells.length,
        },
        evidence: [row],
        matrix_cells: row.matrix_cells,
      };
      delete record.component_evidence;
      writeJson(path.join(ROOT, row.path), record);
    }
  }
  return evidence;
}

if (process.argv[1]?.endsWith("run-phase14-maestro.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase14Maestro())}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
