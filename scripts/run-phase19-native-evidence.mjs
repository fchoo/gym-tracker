#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_HEAD = /^[a-f0-9]{40}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const SAFE_TEXT = /^[^\u0000\r\n]{1,512}$/u;
const MANIFEST_PATH = "artifacts/native/phase19/build.json";
const FLOW_PATH = "maestro/phase19/progress-parity.yaml";
const BUILD_PRODUCER_PATH = "scripts/build-current-native-test-apk.sh";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const OBSERVATION_ARTIFACT_KEYS = Object.freeze([
  "semantic",
  "focus",
  "viewport",
  "target_bounds",
  "performance",
  "capture",
]);

export const PHASE19_NATIVE_OPERATION_TIMEOUT_MS = 30_000;
export const PHASE19_NATIVE_MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;

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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function resolveWithin(root, relativePath, code) {
  if (typeof relativePath !== "string" || relativePath.length < 1) fail(code);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail(code);
  }
  return resolved;
}

async function withTimeout(operation, code) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), PHASE19_NATIVE_OPERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function buildPhase19ConfigurationMatrix() {
  const appearances = [
    { appearance: "light", preference: "Light", os_scheme: "light" },
    { appearance: "dark", preference: "Dark", os_scheme: "dark" },
    { appearance: "system-on-light", preference: "System", os_scheme: "light" },
    { appearance: "system-on-dark", preference: "System", os_scheme: "dark" },
  ];
  const portraits = [[360, 800], [390, 844], [600, 960], [840, 1080]];
  const configurations = [];
  for (const appearance of appearances) {
    for (const [portraitWidth, portraitHeight] of portraits) {
      for (const orientation of ["portrait", "landscape"]) {
        for (const fontScale of [1, 2]) {
          const width = orientation === "portrait" ? portraitWidth : portraitHeight;
          const height = orientation === "portrait" ? portraitHeight : portraitWidth;
          configurations.push(Object.freeze({
            id: `${appearance.appearance}-${width}x${height}-font-${fontScale}`,
            appearance: appearance.appearance,
            preference: appearance.preference,
            os_scheme: appearance.os_scheme,
            viewport: `${width}x${height}`,
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

function observationModes() {
  return Object.freeze(PHASE19_MOTION_MODES.flatMap((motionMode) =>
    PHASE19_INPUT_MODES.map((inputMode) => Object.freeze({
      id: `${motionMode}:${inputMode}`,
      motion_mode: motionMode,
      input_mode: inputMode,
      native_status: "NOT_RUN",
    }))));
}

export function buildPhase19NativeRows() {
  const configurations = buildPhase19ConfigurationMatrix();
  return Object.freeze(PHASE19_REQUIREMENT_EVIDENCE_IDS.flatMap((evidenceId) =>
    configurations.map((configuration) => Object.freeze({
      id: `${evidenceId}:${configuration.id}`,
      evidence_id: evidenceId,
      scenario: REQUIREMENT_SCENARIO[evidenceId],
      configuration,
      observations: observationModes(),
      native_status: "NOT_RUN",
      phase20_owned: true,
    }))));
}

export function validatePhase19NativeManifest(manifest) {
  const identity = manifest?.device === undefined ? "" : phase18DeviceIdentitySha256({
    serial: manifest.device.serial,
    abi: manifest.device.abi,
    apiLevel: String(manifest.device.api),
    model: manifest.device.model,
  });
  if (
    !exactKeys(manifest, [
      "schema_version", "suite", "profile", "build_variant", "js_bundle",
      "base_head", "source_tree_sha256", "package", "apk", "installed_apk",
      "package_launch", "device", "toolchain", "started_at", "finished_at",
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
    || !exactKeys(manifest.apk, [
      "path", "sha256", "size_bytes", "page_alignment_kib", "page_alignment_verified",
    ])
    || manifest.apk.path !== "artifacts/native/phase19/gym-tracker-phase19-devtest.apk"
    || !SHA256.test(manifest.apk.sha256)
    || !Number.isSafeInteger(manifest.apk.size_bytes)
    || manifest.apk.size_bytes <= 0
    || manifest.apk.page_alignment_kib !== 16
    || manifest.apk.page_alignment_verified !== true
    || !exactKeys(manifest.installed_apk, [
      "device_path", "sha256", "matches_retained_apk",
    ])
    || !SAFE_TEXT.test(manifest.installed_apk.device_path)
    || manifest.installed_apk.sha256 !== manifest.apk.sha256
    || manifest.installed_apk.matches_retained_apk !== true
    || !exactKeys(manifest.package_launch, ["component", "succeeded"])
    || !SAFE_TEXT.test(manifest.package_launch.component)
    || manifest.package_launch.succeeded !== true
    || !exactKeys(manifest.device, [
      "role", "serial", "api", "abi", "model", "android_release", "identity_sha256",
    ])
    || manifest.device.role !== "automated-test-device"
    || !SAFE_TEXT.test(manifest.device.serial)
    || !Number.isSafeInteger(manifest.device.api)
    || manifest.device.api < 21 || manifest.device.api > 100
    || !SAFE_TEXT.test(manifest.device.abi)
    || !SAFE_TEXT.test(manifest.device.model)
    || !SAFE_TEXT.test(manifest.device.android_release)
    || manifest.device.identity_sha256 !== identity
    || !exactKeys(manifest.toolchain, [
      "node", "npm", "java", "android_api", "build_tools", "ndk",
    ])
    || Object.values(manifest.toolchain).some((value) =>
      typeof value !== "number" && !SAFE_TEXT.test(value))
    || !ISO_DATE.test(manifest.started_at)
    || !ISO_DATE.test(manifest.finished_at)
    || Date.parse(manifest.finished_at) < Date.parse(manifest.started_at)
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

export function createPhase19NativeRunPlan(manifest, flowSha256, bindings) {
  validatePhase19NativeManifest(manifest);
  if (
    !SHA256.test(flowSha256)
    || !exactKeys(bindings, ["build_manifest_sha256", "build_producer_sha256"])
    || !SHA256.test(bindings.build_manifest_sha256)
    || !SHA256.test(bindings.build_producer_sha256)
  ) fail("phase19_native_identity_hash_invalid");
  return Object.freeze({
    schema_version: 2,
    suite: "phase19-progress",
    producer: "phase19-native-evidence/v2",
    native_execution: "NOT_RUN",
    acceptance_authority: "phase20",
    allowed_pre_execution_statuses: Object.freeze(["NOT_RUN", "REVIEW_REQUIRED"]),
    identity: Object.freeze({
      source_head: manifest.base_head,
      source_tree_sha256: manifest.source_tree_sha256,
      build_manifest_sha256: bindings.build_manifest_sha256,
      build_producer_sha256: bindings.build_producer_sha256,
      flow_sha256: flowSha256,
      apk_sha256: manifest.apk.sha256,
      installed_apk_sha256: manifest.installed_apk.sha256,
      device_identity_sha256: manifest.device.identity_sha256,
      package: manifest.package,
      profile: manifest.profile,
    }),
    requirement_evidence_ids: PHASE19_REQUIREMENT_EVIDENCE_IDS,
    configurations: buildPhase19ConfigurationMatrix(),
    scenarios: PHASE19_NATIVE_SCENARIOS,
    rows: buildPhase19NativeRows(),
  });
}

async function hashBoundedArtifact(outputRoot, artifactPath) {
  const resolved = resolveWithin(
    outputRoot,
    artifactPath,
    "phase19_native_artifact_path_invalid",
  );
  const sizeBytes = statSync(resolved).size;
  if (sizeBytes < 1 || sizeBytes > PHASE19_NATIVE_MAX_ARTIFACT_BYTES) {
    fail("phase19_native_artifact_size_invalid");
  }
  return Object.freeze({
    artifact_path: path.relative(path.resolve(outputRoot), resolved),
    sha256: await sha256File(resolved),
    size_bytes: sizeBytes,
  });
}

export async function hashPhase19ObservationArtifacts(outputRoot, artifacts) {
  if (!exactKeys(artifacts, OBSERVATION_ARTIFACT_KEYS)) {
    fail("phase19_native_observation_artifacts_invalid");
  }
  const hashed = {};
  for (const key of OBSERVATION_ARTIFACT_KEYS) {
    hashed[key] = await hashBoundedArtifact(outputRoot, artifacts[key]);
  }
  return Object.freeze(hashed);
}

function validAssertions(assertions) {
  return Array.isArray(assertions)
    && assertions.length >= 1
    && assertions.length <= 64
    && new Set(assertions.map(({ id }) => id)).size === assertions.length
    && assertions.every((assertion) =>
      exactKeys(assertion, ["id", "status"])
      && SAFE_TEXT.test(assertion.id)
      && assertion.status === "PASS");
}

function validateObservationDocument(kind, document, expected) {
  const commonKeys = [
    "schema_version", "artifact_kind", "row_id", "observation_id", "status", "assertions",
  ];
  const kindKeys = {
    semantic: ["summary"],
    focus: ["focus"],
    viewport: ["viewport"],
    target_bounds: ["target_bounds"],
    performance: ["performance"],
  }[kind];
  if (
    kindKeys === undefined
    || !exactKeys(document, [...commonKeys, ...kindKeys])
    || document.schema_version !== 1
    || document.artifact_kind !== kind
    || document.row_id !== expected.row_id
    || document.observation_id !== expected.observation_id
    || document.status !== "PASS"
    || !validAssertions(document.assertions)
  ) fail("phase19_native_artifact_schema_invalid");
  if (kind === "semantic" && (
    !exactKeys(document.summary, ["nodes_checked", "violations"])
    || !Number.isSafeInteger(document.summary.nodes_checked)
    || document.summary.nodes_checked < 1
    || document.summary.violations !== 0
  )) fail("phase19_native_artifact_schema_invalid");
  if (kind === "focus" && (
    !exactKeys(document.focus, ["expected_return", "observed_return", "matches"])
    || !SAFE_TEXT.test(document.focus.expected_return)
    || document.focus.observed_return !== document.focus.expected_return
    || document.focus.matches !== true
  )) fail("phase19_native_artifact_schema_invalid");
  if (kind === "viewport" && (
    !exactKeys(document.viewport, [
      "width", "height", "orientation", "font_scale", "clipped_nodes",
    ])
    || document.viewport.width !== expected.configuration.width
    || document.viewport.height !== expected.configuration.height
    || document.viewport.orientation !== expected.configuration.orientation
    || document.viewport.font_scale !== expected.configuration.font_scale
    || document.viewport.clipped_nodes !== 0
  )) fail("phase19_native_artifact_schema_invalid");
  if (kind === "target_bounds" && (
    !exactKeys(document.target_bounds, ["targets_checked", "violations"])
    || !Number.isSafeInteger(document.target_bounds.targets_checked)
    || document.target_bounds.targets_checked < 1
    || document.target_bounds.violations !== 0
  )) fail("phase19_native_artifact_schema_invalid");
  if (kind === "performance" && (
    !exactKeys(document.performance, ["samples_ms", "max_js_task_ms"])
    || !Array.isArray(document.performance.samples_ms)
    || document.performance.samples_ms.length < 1
    || document.performance.samples_ms.length > 100
    || document.performance.samples_ms.some((sample) =>
      !Number.isFinite(sample) || sample < 0)
    || !Number.isFinite(document.performance.max_js_task_ms)
    || document.performance.max_js_task_ms < 0
    || document.performance.max_js_task_ms > 50
  )) fail("phase19_native_artifact_schema_invalid");
}

export async function validateAndHashPhase19ObservationArtifacts(
  outputRoot,
  artifacts,
  expected,
) {
  const hashed = await hashPhase19ObservationArtifacts(outputRoot, artifacts);
  for (const kind of OBSERVATION_ARTIFACT_KEYS) {
    const resolved = resolveWithin(
      outputRoot,
      artifacts[kind],
      "phase19_native_artifact_path_invalid",
    );
    const bytes = readFileSync(resolved);
    if (kind === "capture") {
      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      if (bytes.length <= pngSignature.length
        || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
        fail("phase19_native_capture_invalid");
      }
      continue;
    }
    let document;
    try {
      document = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("phase19_native_artifact_schema_invalid");
    }
    validateObservationDocument(kind, document, expected);
  }
  return hashed;
}

export async function derivePhase19NativeIdentity(input) {
  const manifestPath = resolveWithin(
    input.artifact_root,
    input.manifest_path,
    "phase19_native_manifest_path_invalid",
  );
  const manifestBytes = readFileSync(manifestPath);
  const manifestFromDisk = JSON.parse(manifestBytes.toString("utf8"));
  validatePhase19NativeManifest(manifestFromDisk);
  const producerPath = resolveWithin(
    input.source_root,
    BUILD_PRODUCER_PATH,
    "phase19_native_producer_path_invalid",
  );
  const flowPath = resolveWithin(
    input.source_root,
    input.flow_path,
    "phase19_native_flow_path_invalid",
  );
  const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: input.source_root,
    encoding: "utf8",
  }).trim();
  const retainedApk = resolveWithin(
    input.artifact_root,
    manifestFromDisk.apk.path,
    "phase19_native_apk_path_invalid",
  );
  const installedPath = resolveWithin(
    input.output_root,
    input.installed_apk_path,
    "phase19_native_installed_apk_path_invalid",
  );
  const deviceProfile = input.device_profile;
  if (!exactKeys(deviceProfile, ["serial", "api", "abi", "model", "android_release"])) {
    fail("phase19_native_device_invalid");
  }
  const identity = {
    source_head: sourceHead,
    source_tree_sha256: sourceTreeSha256(input.source_root),
    build_manifest_sha256: sha256Bytes(manifestBytes),
    build_producer_sha256: sha256Bytes(readFileSync(producerPath)),
    flow_sha256: sha256Bytes(readFileSync(flowPath)),
    apk_sha256: await sha256File(retainedApk),
    installed_apk_sha256: await sha256File(installedPath),
    device_identity_sha256: phase18DeviceIdentitySha256({
      serial: deviceProfile.serial,
      abi: deviceProfile.abi,
      apiLevel: String(deviceProfile.api),
      model: deviceProfile.model,
    }),
    package: manifestFromDisk.package,
    profile: manifestFromDisk.profile,
  };
  if (
    statSync(retainedApk).size !== manifestFromDisk.apk.size_bytes
    || identity.apk_sha256 !== identity.installed_apk_sha256
    || canonicalJson(deviceProfile) !== canonicalJson({
      serial: manifestFromDisk.device.serial,
      api: manifestFromDisk.device.api,
      abi: manifestFromDisk.device.abi,
      model: manifestFromDisk.device.model,
      android_release: manifestFromDisk.device.android_release,
    })
  ) fail("phase19_native_execution_identity_invalid");
  return Object.freeze({
    manifest: Object.freeze(manifestFromDisk),
    identity: Object.freeze(identity),
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
  if (mode === "execute" && !phase20Authorized) fail("phase19_native_execution_phase20_only");
  if (mode === "plan-only" && phase20Authorized) fail("phase19_native_evidence_arguments_invalid");
  return mode === "execute"
    ? Object.freeze({ manifest, mode, phase20_authorized: true })
    : Object.freeze({ manifest, mode });
}

export async function executePhase19NativeEvidence(input) {
  if (input?.phase20_authorized !== true || input?.driver === undefined) {
    fail("phase19_native_execution_phase20_only");
  }
  const plan = createPhase19NativeRunPlan(input.manifest, input.flow_sha256, {
    build_manifest_sha256: input.build_manifest_sha256,
    build_producer_sha256: input.build_producer_sha256,
  });
  const originalSettings = await withTimeout(
    () => input.driver.captureSettings(),
    "phase19_native_settings_timeout",
  );
  const results = [];
  try {
    for (const method of [
      "pullInstalledApk", "readDeviceProfile", "applyConfiguration",
      "readConfiguration", "runObservation", "restoreSettings",
    ]) {
      if (typeof input.driver[method] !== "function") fail("phase19_native_driver_invalid");
    }
    const pulledInstalledApk = await withTimeout(
      () => input.driver.pullInstalledApk(input.manifest.package),
      "phase19_native_pull_timeout",
    );
    const deviceProfile = await withTimeout(
      () => input.driver.readDeviceProfile(),
      "phase19_native_device_timeout",
    );
    const derived = await derivePhase19NativeIdentity({
      source_root: input.source_root,
      artifact_root: input.artifact_root,
      output_root: input.output_root,
      manifest_path: input.manifest_path,
      flow_path: input.flow_path,
      installed_apk_path: pulledInstalledApk,
      device_profile: deviceProfile,
    });
    if (
      canonicalJson(derived.manifest) !== canonicalJson(input.manifest)
      || canonicalJson(derived.identity) !== canonicalJson(plan.identity)
    ) fail("phase19_native_execution_identity_invalid");
    const identity = derived.identity;
    for (const row of plan.rows) {
      const observations = [];
      for (const observation of row.observations) {
        const expectedConfiguration = Object.freeze({
          ...row.configuration,
          motion_mode: observation.motion_mode,
          input_mode: observation.input_mode,
        });
        await withTimeout(
          () => input.driver.applyConfiguration(expectedConfiguration),
          "phase19_native_configuration_timeout",
        );
        const applied = await withTimeout(
          () => input.driver.readConfiguration(),
          "phase19_native_configuration_read_timeout",
        );
        if (canonicalJson(applied) !== canonicalJson(expectedConfiguration)) {
          fail("phase19_native_configuration_invalid");
        }
        const result = await withTimeout(
          () => input.driver.runObservation(row, observation),
          "phase19_native_observation_timeout",
        );
        if (
          !exactKeys(result, ["status", "artifacts"])
          || result.status !== "PASS"
          || !exactKeys(result.artifacts, OBSERVATION_ARTIFACT_KEYS)
        ) fail("phase19_native_observation_invalid");
        const artifacts = await validateAndHashPhase19ObservationArtifacts(
          input.output_root,
          result.artifacts,
          {
            row_id: row.id,
            observation_id: observation.id,
            configuration: expectedConfiguration,
          },
        );
        observations.push(Object.freeze({
          id: observation.id,
          motion_mode: observation.motion_mode,
          input_mode: observation.input_mode,
          status: "PASS",
          configuration_sha256: sha256Bytes(canonicalJson(expectedConfiguration)),
          artifacts,
        }));
      }
      results.push(Object.freeze({
        id: row.id,
        evidence_id: row.evidence_id,
        configuration_id: row.configuration.id,
        status: "PASS",
        observations: Object.freeze(observations),
      }));
    }
    return Object.freeze({
      schema_version: 2,
      suite: plan.suite,
      producer: plan.producer,
      status: "PASS",
      identity,
      rows: Object.freeze(results),
    });
  } finally {
    await withTimeout(
      () => input.driver.restoreSettings(originalSettings),
      "phase19_native_restore_timeout",
    );
  }
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
  const manifestText = readText(manifestPath);
  const manifest = JSON.parse(manifestText);
  const flow = readText(path.join(root, FLOW_PATH));
  validatePhase19NativeFlow(flow);
  if (options.mode === "execute") fail("phase19_native_execution_phase20_only");
  return createPhase19NativeRunPlan(manifest, sha256Bytes(flow), {
    build_manifest_sha256: sha256Bytes(manifestText),
    build_producer_sha256: sha256Bytes(readText(path.join(root, BUILD_PRODUCER_PATH))),
  });
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
