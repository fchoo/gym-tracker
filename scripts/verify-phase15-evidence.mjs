#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  PHASE15_EVIDENCE_CASE_IDS,
  PHASE15_PINNED_VISUAL_SOURCES,
  PHASE15_REQUIRED_CASES,
  PHASE15_VISUAL_REFERENCES,
} from "../src/testing/contracts/phase15Workout.contract.ts";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

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
  if (evidence.performance?.sample_count < 100 || evidence.performance?.render_transition_p95_ms > 150 || evidence.performance?.active_js_task_max_ms > 50) fail("performance_invalid");
  if (evidence.timing?.owner_record_sha256 !== TIM_OWNER_RECORD_SHA256 || evidence.timing?.retirement_evidence_sha256 !== TIM_RETIREMENT_EVIDENCE_SHA256 || evidence.timing?.selection !== "retire-playback" || evidence.timing?.legacy_playback_compatibility !== false || evidence.timing?.zero_cue_lifecycle_verified !== true) fail("tim_invalid");
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
  return { schema_version: 1, suite: "phase15", status: "passed", manifest, identity, cases, visuals, accessibility: { semantic_tree_verified: true, focus_order_verified: true, target_min_dp: 48, text_scale: 2, reduced_motion_verified: true, keyboard_dpad_trace_sha256: syntheticHash("a11y") }, recovery: { process_death_verified: true, offline_restart_trace_sha256: syntheticHash("recovery") }, performance: { sample_count: 100, render_transition_p95_ms: 150, active_js_task_max_ms: 50 }, timing: { owner_record_sha256: TIM_OWNER_RECORD_SHA256, retirement_evidence_sha256: TIM_RETIREMENT_EVIDENCE_SHA256, selection: "retire-playback", legacy_playback_compatibility: false, zero_cue_lifecycle_verified: true } };
}

export function validatePhase15PackageScripts(packageJson) {
  const scripts = packageJson?.scripts;
  if (scripts?.["test:maestro:phase15"] !== "node scripts/run-phase15-maestro.mjs" || scripts?.["verify:phase15:evidence"] !== "node scripts/verify-phase15-evidence.mjs --manifest artifacts/native/phase15/build.json --all" || scripts?.["test:evidence:phase15"] !== "node --test scripts/phase15-evidence-scripts.test.mjs") fail("package_scripts_invalid");
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
  writeFileSync(path.join(ROOT, "artifacts/native/phase15/evidence/verification.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { process.stdout.write(`${JSON.stringify(executePhase15EvidenceVerifier())}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
