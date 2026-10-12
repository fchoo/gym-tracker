#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_HEAD = /^[a-f0-9]{40}$/u;
const MANIFEST_PATH = "artifacts/native/phase19/build.json";
const FLOW_PATH = "maestro/phase19/progress-parity.yaml";
const PACKAGE = "com.fchoo.gymtracker.devtest";

export const PHASE19_REQUIREMENT_EVIDENCE_IDS = Object.freeze([
  "progress.sport-range",
  "progress.all",
  "progress.strength",
  "progress.running",
  "progress.fixed-goal",
  "progress.unset-goals",
  "progress.running-source-states",
  "progress.progress-errors",
  "progress.history-sheet",
  "progress.exercise-history-route",
  "progress.relative-view",
  "progress.target-editor",
  "progress.target-persistence",
  "progress.recommendation",
  "progress.recommendation-persistence",
  "progress.progress-settings",
  "progress.bodyweight-history",
  "progress.bodyweight-editor",
]);

export const PHASE19_MOTION_MODES = Object.freeze(["normal", "reduced"]);
export const PHASE19_INPUT_MODES = Object.freeze([
  "touch",
  "software-keyboard",
  "hardware-keyboard",
  "dpad",
]);

export const PHASE19_NATIVE_SCENARIOS = Object.freeze([
  "sport-range-retention",
  "all-ready",
  "strength-ready",
  "running-ready",
  "fixed-goal-pacing",
  "unset-goals",
  "loading",
  "empty",
  "sparse",
  "rebuild-updating",
  "read-error-retry",
  "history-data-equivalence",
  "exercise-history-return",
  "relative-view-basis",
  "target-editor",
  "target-success",
  "target-failure",
  "target-stale",
  "target-lost-ack-replay",
  "recommendation-keep",
  "recommendation-use",
  "recommendation-failure",
  "recommendation-stale",
  "progress-settings",
  "bodyweight-empty",
  "bodyweight-history",
  "bodyweight-success",
  "bodyweight-private-failure",
  "bodyweight-stale",
  "no-write-dismissal",
]);

const REQUIREMENT_SCENARIO = Object.freeze({
  "progress.sport-range": "sport-range-retention",
  "progress.all": "all-ready",
  "progress.strength": "strength-ready",
  "progress.running": "running-ready",
  "progress.fixed-goal": "fixed-goal-pacing",
  "progress.unset-goals": "unset-goals",
  "progress.running-source-states": "loading",
  "progress.progress-errors": "read-error-retry",
  "progress.history-sheet": "history-data-equivalence",
  "progress.exercise-history-route": "exercise-history-return",
  "progress.relative-view": "relative-view-basis",
  "progress.target-editor": "target-editor",
  "progress.target-persistence": "target-lost-ack-replay",
  "progress.recommendation": "recommendation-keep",
  "progress.recommendation-persistence": "recommendation-stale",
  "progress.progress-settings": "progress-settings",
  "progress.bodyweight-history": "bodyweight-history",
  "progress.bodyweight-editor": "bodyweight-private-failure",
});

function fail(code) {
  throw new Error(code);
}

function exactKeys(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

export function buildPhase19ConfigurationMatrix() {
  const appearances = [
    { appearance: "light", preference: "Light", os_scheme: "light" },
    { appearance: "dark", preference: "Dark", os_scheme: "dark" },
    { appearance: "system-on-light", preference: "System", os_scheme: "light" },
    { appearance: "system-on-dark", preference: "System", os_scheme: "dark" },
  ];
  const portraits = [
    [360, 800],
    [390, 844],
    [600, 960],
    [840, 1080],
  ];
  const configurations = [];
  for (const appearance of appearances) {
    for (const [portraitWidth, portraitHeight] of portraits) {
      for (const orientation of ["portrait", "landscape"]) {
        for (const fontScale of [1, 2]) {
          const width = orientation === "portrait" ? portraitWidth : portraitHeight;
          const height = orientation === "portrait" ? portraitHeight : portraitWidth;
          const viewport = `${width}x${height}`;
          configurations.push(Object.freeze({
            id: `${appearance.appearance}-${viewport}-font-${fontScale}`,
            appearance: appearance.appearance,
            preference: appearance.preference,
            os_scheme: appearance.os_scheme,
            viewport,
            width,
            height,
            orientation,
            font_scale: fontScale,
          }));
        }
      }
    }
  }
  return Object.freeze(configurations);
}

export function buildPhase19NativeRows() {
  const configurations = buildPhase19ConfigurationMatrix();
  return Object.freeze(PHASE19_REQUIREMENT_EVIDENCE_IDS.flatMap((evidenceId) =>
    configurations.map((configuration) => Object.freeze({
      id: `${evidenceId}:${configuration.id}`,
      evidence_id: evidenceId,
      scenario: REQUIREMENT_SCENARIO[evidenceId],
      configuration,
      motion_modes: PHASE19_MOTION_MODES,
      input_modes: PHASE19_INPUT_MODES,
      native_status: "NOT_RUN",
      phase20_owned: true,
    }))));
}

export function validatePhase19NativeManifest(manifest) {
  if (
    !exactKeys(manifest, [
      "schema_version", "suite", "profile", "package", "build_variant", "js_bundle",
      "base_head", "source_tree_sha256", "apk", "installed_apk", "device",
    ])
    || manifest.schema_version !== 1
    || manifest.suite !== "phase19"
    || manifest.profile !== "development-test"
    || manifest.package !== PACKAGE
    || manifest.build_variant !== "release"
    || !exactKeys(manifest.js_bundle, ["embedded"])
    || manifest.js_bundle.embedded !== true
    || !GIT_HEAD.test(manifest.base_head)
    || !SHA256.test(manifest.source_tree_sha256)
    || !exactKeys(manifest.apk, ["path", "sha256", "size_bytes"])
    || !manifest.apk.path.startsWith("artifacts/native/phase19/")
    || !SHA256.test(manifest.apk.sha256)
    || !Number.isSafeInteger(manifest.apk.size_bytes)
    || manifest.apk.size_bytes <= 0
    || !exactKeys(manifest.installed_apk, ["sha256", "matches_retained_apk"])
    || manifest.installed_apk.sha256 !== manifest.apk.sha256
    || manifest.installed_apk.matches_retained_apk !== true
    || !exactKeys(manifest.device, ["identity_sha256"])
    || !SHA256.test(manifest.device.identity_sha256)
  ) fail("phase19_native_manifest_invalid");
  return true;
}

export function validatePhase19NativeFlow(flow) {
  if (typeof flow !== "string" || !flow.includes("PHASE19_SCENARIO")) {
    fail("phase19_native_flow_invalid");
  }
  for (const scenario of PHASE19_NATIVE_SCENARIOS) {
    if (!flow.includes(`PHASE19_SCENARIO == '${scenario}'`)) {
      fail(`phase19_native_scenario_missing:${scenario}`);
    }
  }
  for (const text of [
    "Progress", "All", "Strength", "Running", "4 weeks", "12 weeks", "All time",
    "Open history", "Save target", "Keep target unchanged", "Use target", "Body metrics",
  ]) {
    if (!flow.includes(text)) fail("phase19_native_flow_semantics_missing");
  }
  if (!flow.includes("takeScreenshot") || !flow.includes("pressKey: BACK")) {
    fail("phase19_native_flow_capture_missing");
  }
  return true;
}

export function createPhase19NativeRunPlan(manifest, flowSha256) {
  validatePhase19NativeManifest(manifest);
  if (!SHA256.test(flowSha256)) fail("phase19_native_flow_hash_invalid");
  return Object.freeze({
    schema_version: 1,
    suite: "phase19-progress",
    producer: "phase19-native-evidence/v1",
    native_execution: "NOT_RUN",
    acceptance_authority: "phase20",
    allowed_pre_execution_statuses: Object.freeze(["NOT_RUN", "REVIEW_REQUIRED"]),
    identity: Object.freeze({
      base_head: manifest.base_head,
      source_tree_sha256: manifest.source_tree_sha256,
      apk_sha256: manifest.apk.sha256,
      installed_apk_sha256: manifest.installed_apk.sha256,
      device_identity_sha256: manifest.device.identity_sha256,
      package: manifest.package,
      profile: manifest.profile,
    }),
    flow_sha256: flowSha256,
    requirement_evidence_ids: PHASE19_REQUIREMENT_EVIDENCE_IDS,
    configurations: buildPhase19ConfigurationMatrix(),
    scenarios: PHASE19_NATIVE_SCENARIOS,
    motion_modes: PHASE19_MOTION_MODES,
    input_modes: PHASE19_INPUT_MODES,
    rows: buildPhase19NativeRows(),
  });
}

export function parsePhase19NativeEvidenceArgs(args) {
  let manifest = "";
  let mode = "";
  let phase20Authorized = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") manifest = args[++index] ?? "";
    else if (argument === "--plan-only") mode = mode === "" ? "plan-only" : "invalid";
    else if (argument === "--execute") mode = mode === "" ? "execute" : "invalid";
    else if (argument === "--phase20-authorized") phase20Authorized = true;
    else fail("phase19_native_evidence_arguments_invalid");
  }
  if (manifest !== MANIFEST_PATH || mode === "" || mode === "invalid") {
    fail("phase19_native_evidence_arguments_invalid");
  }
  if (mode === "execute" && !phase20Authorized) {
    fail("phase19_native_execution_phase20_only");
  }
  if (mode === "plan-only" && phase20Authorized) {
    fail("phase19_native_evidence_arguments_invalid");
  }
  return mode === "execute"
    ? Object.freeze({ manifest, mode, phase20_authorized: true })
    : Object.freeze({ manifest, mode });
}

/**
 * Phase 20 supplies the device driver. This source-owned loop still owns the
 * exhaustive row order and guarantees settings restoration on every exit.
 */
export async function executePhase19NativeEvidence(input) {
  if (input?.phase20_authorized !== true || input?.driver === undefined) {
    fail("phase19_native_execution_phase20_only");
  }
  const plan = createPhase19NativeRunPlan(input.manifest, input.flow_sha256);
  const originalSettings = await input.driver.captureSettings();
  const results = [];
  try {
    for (const row of plan.rows) {
      await input.driver.applyConfiguration(row.configuration);
      const result = await input.driver.runRow(row);
      if (
        result?.status !== "PASS"
        || !SHA256.test(result.semantic_sha256 ?? "")
        || !SHA256.test(result.focus_sha256 ?? "")
        || !SHA256.test(result.viewport_sha256 ?? "")
        || !SHA256.test(result.target_bounds_sha256 ?? "")
        || !SHA256.test(result.performance_sha256 ?? "")
        || !SHA256.test(result.capture_sha256 ?? "")
      ) fail("phase19_native_row_invalid");
      results.push(Object.freeze({
        id: row.id,
        evidence_id: row.evidence_id,
        configuration_id: row.configuration.id,
        status: "PASS",
        semantic_sha256: result.semantic_sha256,
        focus_sha256: result.focus_sha256,
        viewport_sha256: result.viewport_sha256,
        target_bounds_sha256: result.target_bounds_sha256,
        performance_sha256: result.performance_sha256,
        capture_sha256: result.capture_sha256,
      }));
    }
  } finally {
    await input.driver.restoreSettings(originalSettings);
  }
  return Object.freeze({
    ...plan,
    native_execution: "PASS",
    rows: Object.freeze(results),
  });
}

export function executePhase19NativeEvidenceCli(
  args = process.argv.slice(2),
  dependencies = {},
) {
  const options = parsePhase19NativeEvidenceArgs(args);
  const root = dependencies.root ?? process.cwd();
  const manifestPath = path.join(root, options.manifest);
  if (!(dependencies.exists ?? existsSync)(manifestPath)) fail("phase19_native_manifest_missing");
  const readText = dependencies.readText ?? ((filePath) => readFileSync(filePath, "utf8"));
  const manifest = JSON.parse(readText(manifestPath));
  const flow = readText(path.join(root, FLOW_PATH));
  validatePhase19NativeFlow(flow);
  const flowSha256 = createHash("sha256").update(flow).digest("hex");
  if (options.mode === "execute") fail("phase19_native_execution_phase20_only");
  return createPhase19NativeRunPlan(manifest, flowSha256);
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase19NativeEvidenceCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: "phase19_native_evidence_failed",
      message: error instanceof Error ? error.message : "phase19_native_evidence_failed",
    })}\n`);
    process.exitCode = 1;
  }
}
