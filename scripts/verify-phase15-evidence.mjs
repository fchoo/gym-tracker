#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  PHASE15_EVIDENCE_CASE_IDS,
  PHASE15_PINNED_VISUAL_SOURCES,
  PHASE15_REQUIRED_CASES,
  PHASE15_VISUAL_REFERENCES,
} from "../src/testing/contracts/phase15Workout.contract.ts";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { validatePhase15WorkoutBenchmarkEvidence } from "./benchmark-phase15-workout.mjs";

const ROOT = process.cwd();
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const PACKAGE = "com.fchoo.gymtracker.devtest";
const TIM_OWNER_RECORD_SHA256 = "f1f9af1762e6e8fefbda0ee48f1ce2dca58907f19686f36e92130f718769783e";
const TIM_RETIREMENT_EVIDENCE_SHA256 = "c84c0f78af6455e4f3f86881ed7293ded1fb5901fd4e207089bce718314c2ba3";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => { throw new Error(`phase15_${code}`); };
const hash = (value, code) => { if (!HASH.test(value ?? "")) fail(code); };

function exact(value, expected, code) { if (value !== expected) fail(code); }
function finite(value, code) { if (!Number.isFinite(value) || value < 0) fail(code); }
function plainObject(value, code) { if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code); }

function validateNoPrivateData(value, location = "evidence") {
  if (typeof value === "string") {
    if (/(?:@|\b(?:email|token|password|authorization|workout[_ -]?(?:row|name)|exercise[_ -]?name|set[_ -]?(?:value|weight)|owner[_ -]?note|filename)\b)/iu.test(value)) fail(`privacy_unsafe:${location}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateNoPrivateData(entry, `${location}[${index}]`)); return; }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/(?:email|token|password|authorization|workout[_ -]?(?:row|name)|exercise[_ -]?name|set[_ -]?(?:value|weight)|owner[_ -]?note|filename|raw[_ -]?(?:row|payload))/iu.test(key)) fail(`privacy_unsafe:${location}.${key}`);
      validateNoPrivateData(entry, `${location}.${key}`);
    }
  }
}

function validateManifest(manifest) {
  plainObject(manifest, "manifest_invalid");
  if (manifest.schema_version !== 1 || manifest.suite !== "phase15" || manifest.profile !== "development-test" || manifest.package !== PACKAGE || manifest.js_bundle?.embedded !== true || !HEAD.test(manifest.base_head ?? "")) fail("manifest_identity_invalid");
  hash(manifest.source_tree_sha256, "manifest_source_hash_invalid");
  hash(manifest.apk?.sha256, "manifest_apk_hash_invalid");
  if (typeof manifest.apk?.path !== "string" || manifest.apk.path.length === 0) fail("manifest_apk_path_invalid");
  if (manifest.installed_apk?.matches_retained_apk !== true || manifest.installed_apk.sha256 !== manifest.apk.sha256) fail("manifest_installed_apk_invalid");
  if (!manifest.device?.serial || !Number.isInteger(manifest.device.api_level) || manifest.device.api_level < 1 || !manifest.device.abi) fail("manifest_device_invalid");
  hash(manifest.report_sha256, "manifest_report_hash_invalid");
  return true;
}

export function validatePhase15RunnerManifest(manifest) {
  validateManifest(manifest);
  if (manifest.base_head !== "a".repeat(40) || manifest.source_tree_sha256 !== "b".repeat(64) || manifest.apk.sha256 !== "c".repeat(64) || manifest.installed_apk.sha256 !== "c".repeat(64) || manifest.report_sha256 !== "d".repeat(64)) fail("runner_fixture_identity_invalid");
  return true;
}

function validateCase(caseEntry, index, expected, manifest) {
  if (caseEntry?.id !== expected || caseEntry.status !== "passed" || caseEntry.evidence_path !== PHASE15_REQUIRED_CASES[index].evidence_path) fail("case_mapping_invalid");
  if (caseEntry.source_tree_sha256 !== manifest.source_tree_sha256) fail("case_source_hash_invalid");
  finite(caseEntry.duration_ms, "case_duration_invalid");
  if (!/^[a-f0-9]{16,64}$/u.test(caseEntry.opaque_scoped_id ?? "")) fail("case_opaque_id_invalid");
  if (caseEntry.runtime?.sqlite_contract !== "expo-sqlite-authoritative" || caseEntry.runtime?.fixture_only === true) fail("case_sqlite_contract_invalid");
  hash(caseEntry.action?.receipt_sha256, "case_action_invalid");
  hash(caseEntry.semantic?.tree_sha256, "case_semantic_invalid");
  if (!Array.isArray(caseEntry.semantic?.labels) || caseEntry.semantic.labels.length === 0 || !Array.isArray(caseEntry.semantic?.roles) || caseEntry.semantic.roles.length === 0 || !Array.isArray(caseEntry.semantic?.actions) || caseEntry.semantic.actions.length === 0) fail("case_semantic_contract_invalid");
  hash(caseEntry.focus?.trace_sha256, "case_focus_invalid");
  if (caseEntry.focus?.restored !== true || caseEntry.focus?.keyboard_dpad_activated !== true || caseEntry.geometry?.min_target_dp < 48 || caseEntry.geometry?.text_scale !== 2 || caseEntry.geometry?.reduced_motion !== true) fail("case_accessibility_invalid");
}

function validateVisual(visual) {
  if (!Object.hasOwn(PHASE15_VISUAL_REFERENCES, visual?.reference_id)) fail("visual_reference_unmapped");
  exact(visual.reference_sha256, PHASE15_VISUAL_REFERENCES[visual.reference_id], "visual_reference_hash_invalid");
  hash(visual.native_screenshot_sha256, "visual_native_hash_invalid");
  if (visual.viewport?.width !== 390 || visual.viewport?.height !== 844 || !["light", "dark"].includes(visual.theme)) fail("visual_viewport_invalid");
  for (const artifactName of ["overlay", "difference"]) {
    const artifact = visual[artifactName];
    hash(artifact?.sha256, `visual_${artifactName}_hash_invalid`);
    exact(artifact?.inputs?.reference_sha256, visual.reference_sha256, `visual_${artifactName}_reference_input_invalid`);
    exact(artifact?.inputs?.native_screenshot_sha256, visual.native_screenshot_sha256, `visual_${artifactName}_native_input_invalid`);
  }
}

function validateCrossCutting(evidence) {
  if (evidence.accessibility?.semantic_tree_verified !== true || evidence.accessibility?.focus_order_verified !== true || evidence.accessibility?.target_min_dp !== 48 || evidence.accessibility?.text_scale !== 2 || evidence.accessibility?.reduced_motion_verified !== true) fail("accessibility_invalid");
  hash(evidence.accessibility?.keyboard_dpad_trace_sha256, "accessibility_trace_invalid");
  hash(evidence.recovery?.offline_restart_trace_sha256, "recovery_trace_invalid");
  if (evidence.recovery?.process_death_verified !== true) fail("recovery_invalid");
  try {
    const summary = validatePhase15WorkoutBenchmarkEvidence(evidence.performance, evidence.manifest);
    if (summary.sample_count !== evidence.performance.sample_count || summary.render_transition_p95_ms !== evidence.performance.render_transition_p95_ms || summary.active_js_task_max_ms !== evidence.performance.active_js_task_max_ms) fail("performance_summary_invalid");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("phase15_")) throw error;
    fail("performance_invalid");
  }
  if (evidence.timing?.owner_record_sha256 !== TIM_OWNER_RECORD_SHA256 || evidence.timing?.retirement_evidence_sha256 !== TIM_RETIREMENT_EVIDENCE_SHA256 || evidence.timing?.selection !== "retire-playback" || evidence.timing?.legacy_playback_compatibility !== false || evidence.timing?.zero_cue_lifecycle_verified !== true) fail("tim_invalid");
}

function readRetainedArtifact(root, artifact, code) {
  if (typeof artifact?.path !== "string" || !HASH.test(artifact?.sha256 ?? "")) fail(`${code}_descriptor_invalid`);
  if (path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]+/u).includes("..")) fail(`${code}_path_invalid`);
  const rootReal = realpathSync(root);
  const absolute = path.resolve(rootReal, artifact.path);
  const relative = path.relative(rootReal, absolute);
  const rootPrefix = `${rootReal}${path.sep}`;
  if (relative.length === 0 || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${code}_path_invalid`);
  }
  if (!absolute.startsWith(rootPrefix) || !existsSync(absolute)) fail(`${code}_missing`);
  let current = rootReal;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (lstatSync(current).isSymbolicLink()) fail(`${code}_path_invalid`);
  }
  const real = realpathSync(absolute);
  if (!real.startsWith(rootPrefix)) fail(`${code}_path_invalid`);
  const bytes = readFileSync(real);
  if (sha256(bytes) !== artifact.sha256) fail(`${code}_hash_invalid`);
  return bytes;
}

/** Fail-closed provenance verification for raw, retained native observations. */
export function verifyPhase15EvidenceArtifacts(evidence, { root = ROOT } = {}) {
  const artifacts = evidence?.artifacts;
  plainObject(artifacts, "artifacts_invalid");
  const reportBytes = readRetainedArtifact(root, artifacts.report, "report");
  if (artifacts.report.sha256 !== evidence.manifest.report_sha256) fail("report_manifest_mismatch");
  let report;
  try { report = JSON.parse(reportBytes.toString("utf8")); } catch { fail("report_parse_invalid"); }
  if (!Array.isArray(report.cases)) fail("report_cases_invalid");
  for (const entry of evidence.cases) {
    const retained = artifacts.cases?.[entry.id];
    const receipt = readRetainedArtifact(root, retained?.receipt, "case_receipt");
    const semantic = readRetainedArtifact(root, retained?.semantic, "case_semantic");
    const focus = readRetainedArtifact(root, retained?.focus, "case_focus");
    if (retained.receipt.sha256 !== entry.action.receipt_sha256 || retained.semantic.sha256 !== entry.semantic.tree_sha256 || retained.focus.sha256 !== entry.focus.trace_sha256) fail("case_artifact_binding_invalid");
    if (receipt.length === 0 || semantic.length === 0 || focus.length === 0) fail("case_artifact_empty");
    const reportCase = report.cases.find(({ id }) => id === entry.id);
    if (reportCase?.status !== "passed" || reportCase.device_action !== "executed") fail("report_case_binding_invalid");
  }
  for (const visual of evidence.visuals) {
    const retained = artifacts.visuals?.[visual.reference_id];
    for (const [key, expected] of [["native_screenshot", visual.native_screenshot_sha256], ["overlay", visual.overlay.sha256], ["difference", visual.difference.sha256]]) {
      const artifact = retained?.[key];
      readRetainedArtifact(root, artifact, `visual_${key}`);
      if (artifact.sha256 !== expected) fail("visual_artifact_binding_invalid");
    }
  }
  const accessibility = readRetainedArtifact(root, artifacts.accessibility, "accessibility_trace");
  const recovery = readRetainedArtifact(root, artifacts.recovery, "recovery_trace");
  if (artifacts.accessibility.sha256 !== evidence.accessibility.keyboard_dpad_trace_sha256 || artifacts.recovery.sha256 !== evidence.recovery.offline_restart_trace_sha256 || accessibility.length === 0 || recovery.length === 0) fail("cross_cutting_artifact_binding_invalid");
  return true;
}

export function validatePhase15Evidence(evidence) {
  if (evidence?.schema_version !== 1 || evidence.suite !== "phase15" || evidence.status !== "passed") fail("evidence_invalid");
  validateManifest(evidence.manifest);
  if (evidence.identity?.base_head !== evidence.manifest.base_head
    || evidence.identity?.source_tree_sha256 !== evidence.manifest.source_tree_sha256
    || evidence.identity?.package !== evidence.manifest.package
    || evidence.identity?.apk_sha256 !== evidence.manifest.apk.sha256
    || evidence.identity?.installed_apk_sha256 !== evidence.manifest.installed_apk.sha256
    || evidence.identity?.device_serial !== evidence.manifest.device.serial
    || evidence.identity?.report_sha256 !== evidence.manifest.report_sha256) fail("evidence_identity_mismatch");
  if (!Array.isArray(evidence.cases) || evidence.cases.length !== PHASE15_EVIDENCE_CASE_IDS.length) fail("case_count_invalid");
  evidence.cases.forEach((entry, index) => validateCase(entry, index, PHASE15_EVIDENCE_CASE_IDS[index], evidence.manifest));
  if (new Set(evidence.cases.map(({ id }) => id)).size !== PHASE15_EVIDENCE_CASE_IDS.length) fail("case_duplicate");
  if (!Array.isArray(evidence.visuals) || evidence.visuals.length !== Object.keys(PHASE15_VISUAL_REFERENCES).length) fail("visual_count_invalid");
  evidence.visuals.forEach(validateVisual);
  if (new Set(evidence.visuals.map(({ reference_id }) => reference_id)).size !== evidence.visuals.length) fail("visual_duplicate");
  validateCrossCutting(evidence);
  validateNoPrivateData(evidence);
  return Object.freeze({ status: "passed", cases: evidence.cases.length, visuals: evidence.visuals.length });
}

function syntheticHash(value) { return sha256(`phase15-fixture:${value}`); }
export function createPhase15EvidenceFixture() {
  const manifest = { schema_version: 1, suite: "phase15", profile: "development-test", package: PACKAGE, js_bundle: { embedded: true }, base_head: "a".repeat(40), source_tree_sha256: "b".repeat(64), apk: { path: "artifacts/native/phase15/app.apk", sha256: "c".repeat(64) }, installed_apk: { matches_retained_apk: true, sha256: "c".repeat(64) }, device: { serial: "emulator-5554", api_level: 35, abi: "arm64-v8a" }, report_sha256: "d".repeat(64) };
  const cases = PHASE15_REQUIRED_CASES.map((entry, index) => ({ id: entry.id, evidence_path: entry.evidence_path, status: "passed", source_tree_sha256: manifest.source_tree_sha256, duration_ms: index + 1, opaque_scoped_id: syntheticHash(entry.id).slice(0, 32), runtime: { sqlite_contract: "expo-sqlite-authoritative", fixture_only: false }, action: { receipt_sha256: syntheticHash(`${entry.id}:receipt`) }, semantic: { tree_sha256: syntheticHash(`${entry.id}:semantic`), labels: ["Workout"], roles: ["button"], actions: ["activate"] }, focus: { trace_sha256: syntheticHash(`${entry.id}:focus`), restored: true, keyboard_dpad_activated: true }, geometry: { min_target_dp: 48, text_scale: 2, reduced_motion: true } }));
  const visuals = Object.entries(PHASE15_VISUAL_REFERENCES).map(([reference_id, reference_sha256]) => { const native_screenshot_sha256 = syntheticHash(`${reference_id}:native`); const inputs = { reference_sha256, native_screenshot_sha256 }; return { reference_id, reference_sha256, native_screenshot_sha256, viewport: { width: 390, height: 844 }, theme: reference_id.startsWith("light") ? "light" : "dark", overlay: { sha256: syntheticHash(`${reference_id}:overlay`), inputs }, difference: { sha256: syntheticHash(`${reference_id}:difference`), inputs } }; });
  const identity = { base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, package: manifest.package, apk_sha256: manifest.apk.sha256, installed_apk_sha256: manifest.installed_apk.sha256, device_serial: manifest.device.serial, report_sha256: manifest.report_sha256 };
  const renderTransition = Array.from({ length: 100 }, () => 150);
  const performance = { schema_version: 1, suite: "phase15", status: "passed", producer: "phase15-rendered-workout-benchmark/v1", identity: { base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, package: manifest.package, apk_sha256: manifest.apk.sha256, installed_apk_sha256: manifest.installed_apk.sha256, device_serial: manifest.device.serial }, measurements: { render_transition_ms: renderTransition, active_js_task_ms: [50], long_session_render_ms: [1], long_session_scroll_ms: [1], long_session_interaction_ms: [1] }, sample_count: 100, render_transition_p95_ms: 150, active_js_task_max_ms: 50 };
  return { schema_version: 1, suite: "phase15", status: "passed", manifest, identity, cases, visuals, accessibility: { semantic_tree_verified: true, focus_order_verified: true, target_min_dp: 48, text_scale: 2, reduced_motion_verified: true, keyboard_dpad_trace_sha256: syntheticHash("a11y") }, recovery: { process_death_verified: true, offline_restart_trace_sha256: syntheticHash("recovery") }, performance, timing: { owner_record_sha256: TIM_OWNER_RECORD_SHA256, retirement_evidence_sha256: TIM_RETIREMENT_EVIDENCE_SHA256, selection: "retire-playback", legacy_playback_compatibility: false, zero_cue_lifecycle_verified: true } };
}

/** Creates retained synthetic bytes only for mutation tests; production never calls this helper. */
export function materializePhase15EvidenceFixture(root) {
  const evidence = createPhase15EvidenceFixture();
  const writeArtifact = (relativePath, value) => {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    const bytes = Buffer.from(value);
    writeFileSync(absolute, bytes);
    return { path: relativePath, sha256: sha256(bytes) };
  };
  evidence.artifacts = { cases: {}, visuals: {} };
  for (const entry of evidence.cases) {
    const base = `evidence/raw/cases/${entry.id}`;
    const retained = {
      receipt: writeArtifact(`${base}/receipt.json`, `receipt:${entry.id}`),
      semantic: writeArtifact(`${base}/semantic.json`, `semantic:${entry.id}`),
      focus: writeArtifact(`${base}/focus.json`, `focus:${entry.id}`),
    };
    evidence.artifacts.cases[entry.id] = retained;
    entry.action.receipt_sha256 = retained.receipt.sha256;
    entry.semantic.tree_sha256 = retained.semantic.sha256;
    entry.focus.trace_sha256 = retained.focus.sha256;
  }
  for (const visual of evidence.visuals) {
    const base = `evidence/raw/visuals/${visual.reference_id}`;
    const retained = {
      native_screenshot: writeArtifact(`${base}/native.png`, `native:${visual.reference_id}`),
      overlay: writeArtifact(`${base}/overlay.png`, `overlay:${visual.reference_id}`),
      difference: writeArtifact(`${base}/difference.png`, `difference:${visual.reference_id}`),
    };
    evidence.artifacts.visuals[visual.reference_id] = retained;
    visual.native_screenshot_sha256 = retained.native_screenshot.sha256;
    visual.overlay.sha256 = retained.overlay.sha256;
    visual.difference.sha256 = retained.difference.sha256;
    visual.overlay.inputs.native_screenshot_sha256 = retained.native_screenshot.sha256;
    visual.difference.inputs.native_screenshot_sha256 = retained.native_screenshot.sha256;
  }
  evidence.artifacts.accessibility = writeArtifact("evidence/raw/accessibility.json", "keyboard-dpad-observed");
  evidence.artifacts.recovery = writeArtifact("evidence/raw/recovery.json", "offline-restart-observed");
  evidence.accessibility.keyboard_dpad_trace_sha256 = evidence.artifacts.accessibility.sha256;
  evidence.recovery.offline_restart_trace_sha256 = evidence.artifacts.recovery.sha256;
  const report = { cases: evidence.cases.map(({ id }) => ({ id, status: "passed", device_action: "executed" })) };
  evidence.artifacts.report = writeArtifact("evidence/raw/maestro-device-report.json", JSON.stringify(report));
  evidence.manifest.report_sha256 = evidence.artifacts.report.sha256;
  evidence.identity.report_sha256 = evidence.artifacts.report.sha256;
  return evidence;
}

export function validatePhase15PackageScripts(packageJson) {
  const scripts = packageJson?.scripts;
  if (scripts?.["test:maestro:phase15"] !== "node scripts/run-phase15-maestro.mjs" || scripts?.["benchmark:phase15:host"] !== "node scripts/benchmark-phase15-workout.mjs --host" || scripts?.["benchmark:phase15"] !== "node scripts/benchmark-phase15-workout.mjs --manifest artifacts/native/phase15/build.json --evidence artifacts/native/phase15/evidence/performance.json" || scripts?.["verify:phase15:evidence"] !== "node scripts/verify-phase15-evidence.mjs --manifest artifacts/native/phase15/build.json --all" || scripts?.["test:evidence:phase15"] !== "node --test scripts/phase15-evidence-scripts.test.mjs") fail("package_scripts_invalid");
  return true;
}

function parseArgs(args) { const options = { manifest: "artifacts/native/phase15/build.json", all: false }; for (let index = 0; index < args.length; index += 1) { const argument = args[index]; if (argument === "--all") options.all = true; else if (argument === "--manifest") options.manifest = args[++index]; else if (argument.startsWith("--manifest=")) options.manifest = argument.slice(11); else fail("argument_invalid"); } if (!options.all || options.manifest !== "artifacts/native/phase15/build.json") fail("argument_invalid"); return options; }

export function validatePhase15PinnedVisualSources({ readFile = readFileSync } = {}) {
  const manifestPath = path.join(ROOT, ".planning/design/v1.2-browser-evidence/source-manifest.json");
  const approvedRoot = "/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001";
  const pinnedFiles = {
    [path.join(approvedRoot, "approved.json")]: PHASE15_PINNED_VISUAL_SOURCES.approved_json,
    [path.join(approvedRoot, "approved-hybrid.html")]: PHASE15_PINNED_VISUAL_SOURCES.approved_hybrid_html,
    [manifestPath]: PHASE15_PINNED_VISUAL_SOURCES.source_manifest,
    [path.join(ROOT, ".planning/design/v1.2-browser-evidence/light-workout-root.png")]: PHASE15_VISUAL_REFERENCES["light-workout-root"],
    [path.join(ROOT, ".planning/design/v1.2-browser-evidence/dark-workout-root.png")]: PHASE15_VISUAL_REFERENCES["dark-workout-root"],
    [path.join(ROOT, ".planning/design/v1.2-browser-evidence/light-active-overview.png")]: PHASE15_VISUAL_REFERENCES["light-active-overview"],
    [path.join(ROOT, ".planning/design/v1.2-browser-evidence/dark-active-overview.png")]: PHASE15_VISUAL_REFERENCES["dark-active-overview"],
    [path.join(ROOT, ".planning/design/v1.2-browser-evidence/light-working-committed-rest.png")]: PHASE15_VISUAL_REFERENCES["light-committed-rest"],
    [path.join(ROOT, ".planning/design/v1.2-browser-evidence/dark-working-committed-rest.png")]: PHASE15_VISUAL_REFERENCES["dark-committed-rest"],
  };
  for (const [file, expectedHash] of Object.entries(pinnedFiles)) {
    let bytes;
    try { bytes = readFile(file); } catch { fail("visual_source_missing"); }
    if (sha256(bytes) !== expectedHash) fail("visual_source_stale");
  }
  const sourceManifest = JSON.parse(readFile(manifestPath, "utf8"));
  const sourceHashes = new Set(sourceManifest.sources?.map(({ sha256: entryHash }) => entryHash));
  if (!sourceHashes.has(PHASE15_PINNED_VISUAL_SOURCES.approved_json) || !sourceHashes.has(PHASE15_PINNED_VISUAL_SOURCES.approved_hybrid_html)) fail("visual_source_pin_missing");
  return true;
}

export function executePhase15EvidenceVerifier(args = process.argv.slice(2)) {
  const { manifest: manifestPath } = parseArgs(args);
  const absoluteManifest = path.join(ROOT, manifestPath);
  const evidencePath = path.join(ROOT, "artifacts/native/phase15/evidence/phase15-evidence.json");
  if (!existsSync(absoluteManifest) || !existsSync(evidencePath)) fail("evidence_artifact_missing");
  const manifest = JSON.parse(readFileSync(absoluteManifest, "utf8"));
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  validateManifest(manifest);
  if (manifest.base_head !== execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim() || manifest.source_tree_sha256 !== sourceTreeSha256(ROOT) || !existsSync(path.join(ROOT, manifest.apk.path)) || sha256(readFileSync(path.join(ROOT, manifest.apk.path))) !== manifest.apk.sha256) fail("artifact_stale");
  if (JSON.stringify(manifest) !== JSON.stringify(evidence.manifest)) fail("evidence_manifest_mismatch");
  validatePhase15PinnedVisualSources();
  const result = validatePhase15Evidence(evidence);
  verifyPhase15EvidenceArtifacts(evidence);
  writeFileSync(path.join(ROOT, "artifacts/native/phase15/evidence/verification.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(executePhase15EvidenceVerifier())}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
