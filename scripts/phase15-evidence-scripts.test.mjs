import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PHASE15_EVIDENCE_CASE_IDS,
  PHASE15_REQUIRED_CASES,
  PHASE15_VISUAL_REFERENCES,
} from "../src/testing/contracts/phase15Workout.contract.ts";
import {
  createPhase15EvidenceFixture,
  materializePhase15EvidenceFixture,
  validatePhase15Evidence,
  validatePhase15PackageScripts,
  validatePhase15PinnedVisualSources,
  validatePhase15RunnerManifest,
  verifyPhase15EvidenceArtifacts,
} from "./verify-phase15-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => structuredClone(value);
const fixture = () => createPhase15EvidenceFixture();

test("Phase 15 ledger assigns WRK-01 through WRK-36 and cross-cutting cases exactly once", () => {
  assert.equal(PHASE15_REQUIRED_CASES.length, 42);
  assert.equal(PHASE15_EVIDENCE_CASE_IDS.length, 42);
  assert.equal(new Set(PHASE15_EVIDENCE_CASE_IDS).size, 42);
  for (let number = 1; number <= 36; number += 1) {
    const requirement = `WRK-${String(number).padStart(2, "0")}`;
    assert.equal(PHASE15_REQUIRED_CASES.filter((entry) => entry.requirement === requirement).length, 1);
  }
  for (const required of ["workout.readonly-presentation", "workout.timing-policy", "workout.accessibility", "workout.appearance", "workout.offline-recovery", "workout.performance"]) {
    assert.equal(PHASE15_EVIDENCE_CASE_IDS.includes(required), true);
  }
});

test("Phase 15 accepts only the complete root-to-completion fixture", () => {
  assert.equal(validatePhase15Evidence(fixture()).status, "passed");
});

test("Phase 15 fails closed when retained evidence is absent, replaced, forged, or traversal-addressed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase15-evidence-"));
  const evidence = materializePhase15EvidenceFixture(root);
  assert.equal(verifyPhase15EvidenceArtifacts(evidence, { root }), true);

  const missing = clone(evidence);
  unlinkSync(path.join(root, missing.artifacts.cases[missing.cases[0].id].receipt.path));
  assert.throws(() => verifyPhase15EvidenceArtifacts(missing, { root }), /case_receipt_missing/u);

  const replacedRoot = mkdtempSync(path.join(tmpdir(), "phase15-evidence-"));
  const replaced = materializePhase15EvidenceFixture(replacedRoot);
  writeFileSync(path.join(replacedRoot, replaced.artifacts.visuals[replaced.visuals[0].reference_id].native_screenshot.path), "replaced");
  assert.throws(() => verifyPhase15EvidenceArtifacts(replaced, { root: replacedRoot }), /visual_native_screenshot_hash_invalid/u);

  const forged = fixture();
  forged.artifacts = { report: { path: "evidence/raw/forged-report.json", sha256: forged.manifest.report_sha256 }, cases: {}, visuals: {}, accessibility: { path: "evidence/raw/a11y.json", sha256: forged.accessibility.keyboard_dpad_trace_sha256 }, recovery: { path: "evidence/raw/recovery.json", sha256: forged.recovery.offline_restart_trace_sha256 } };
  assert.throws(() => verifyPhase15EvidenceArtifacts(forged, { root: mkdtempSync(path.join(tmpdir(), "phase15-evidence-")) }), /report_missing/u);

  const traversalRoot = mkdtempSync(path.join(tmpdir(), "phase15-evidence-"));
  const traversal = materializePhase15EvidenceFixture(traversalRoot);
  traversal.artifacts.report.path = "../forged-report.json";
  assert.throws(() => verifyPhase15EvidenceArtifacts(traversal, { root: traversalRoot }), /report_path_invalid/u);
});

test("Phase 15 rejects correctly hashed report and case-artifact symlink escapes", () => {
  const reportRoot = mkdtempSync(path.join(tmpdir(), "phase15-evidence-"));
  const reportEscapeRoot = mkdtempSync(path.join(tmpdir(), "phase15-evidence-external-"));
  const reportEscape = materializePhase15EvidenceFixture(reportRoot);
  const externalReport = path.join(reportEscapeRoot, "maestro-device-report.json");
  const reportBytes = Buffer.from(JSON.stringify({ cases: reportEscape.cases.map(({ id }) => ({ id, status: "passed", device_action: "executed" })) }));
  writeFileSync(externalReport, reportBytes);
  reportEscape.artifacts.report.sha256 = sha256(reportBytes);
  reportEscape.manifest.report_sha256 = reportEscape.artifacts.report.sha256;
  reportEscape.identity.report_sha256 = reportEscape.artifacts.report.sha256;
  const retainedReport = path.join(reportRoot, reportEscape.artifacts.report.path);
  unlinkSync(retainedReport);
  symlinkSync(externalReport, retainedReport);
  assert.throws(() => verifyPhase15EvidenceArtifacts(reportEscape, { root: reportRoot }), /report_path_invalid/u);

  const caseRoot = mkdtempSync(path.join(tmpdir(), "phase15-evidence-"));
  const caseEscapeRoot = mkdtempSync(path.join(tmpdir(), "phase15-evidence-external-"));
  const caseEscape = materializePhase15EvidenceFixture(caseRoot);
  const caseId = caseEscape.cases[0].id;
  const externalReceipt = path.join(caseEscapeRoot, "receipt.json");
  const receiptBytes = Buffer.from("correctly-hashed external receipt");
  writeFileSync(externalReceipt, receiptBytes);
  caseEscape.artifacts.cases[caseId].receipt.sha256 = sha256(receiptBytes);
  caseEscape.cases[0].action.receipt_sha256 = caseEscape.artifacts.cases[caseId].receipt.sha256;
  const retainedReceipt = path.join(caseRoot, caseEscape.artifacts.cases[caseId].receipt.path);
  unlinkSync(retainedReceipt);
  symlinkSync(externalReceipt, retainedReceipt);
  assert.throws(() => verifyPhase15EvidenceArtifacts(caseEscape, { root: caseRoot }), /case_receipt_path_invalid/u);
});

test("Phase 15 rejects every stale or forged source/build/install identity field", () => {
  for (const mutate of [
    (entry) => { entry.manifest.base_head = "b".repeat(40); },
    (entry) => { entry.manifest.source_tree_sha256 = "c".repeat(64); },
    (entry) => { entry.manifest.package = "com.example.forged"; },
    (entry) => { entry.manifest.profile = "production"; },
    (entry) => { entry.manifest.apk.sha256 = "d".repeat(64); },
    (entry) => { entry.manifest.installed_apk.sha256 = "e".repeat(64); },
    (entry) => { entry.manifest.installed_apk.matches_retained_apk = false; },
    (entry) => { entry.manifest.device.api_level = 0; },
    (entry) => { entry.manifest.device.abi = ""; },
    (entry) => { entry.manifest.report_sha256 = "f".repeat(64); },
  ]) {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => validatePhase15Evidence(evidence));
  }
});

test("Phase 15 rejects missing, duplicate, skipped, failed, stale, synthetic, and unmapped cases", () => {
  const mutations = [
    (entry) => { entry.cases.pop(); },
    (entry) => { entry.cases.push(clone(entry.cases[0])); },
    (entry) => { entry.cases[0].status = "skipped"; },
    (entry) => { entry.cases[0].status = "failed"; },
    (entry) => { entry.cases[0].source_tree_sha256 = "f".repeat(64); },
    (entry) => { entry.cases[0].runtime.sqlite_contract = "fixture-only"; },
    (entry) => { entry.cases[0].id = "workout.unmapped"; },
  ];
  for (const mutate of mutations) {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => validatePhase15Evidence(evidence));
  }
});

test("Phase 15 requires real SQLite, action, semantic, focus, geometry, accessibility, recovery, and performance facts", () => {
  const paths = [
    ["cases", 0, "runtime", "sqlite_contract"],
    ["cases", 0, "action", "receipt_sha256"],
    ["cases", 0, "semantic", "tree_sha256"],
    ["cases", 0, "focus", "trace_sha256"],
    ["cases", 0, "geometry", "min_target_dp"],
    ["accessibility", "keyboard_dpad_trace_sha256"],
    ["recovery", "offline_restart_trace_sha256"],
    ["performance", "sample_count"],
    ["performance", "measurements", "render_transition_ms"],
  ];
  for (const path of paths) {
    const evidence = fixture();
    let target = evidence;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = path.at(-1) === "min_target_dp" ? 47 : "";
    assert.throws(() => validatePhase15Evidence(evidence));
  }
});

test("Phase 15 pins every visual source and rejects incomplete or unchained visual evidence", () => {
  assert.equal(Object.keys(PHASE15_VISUAL_REFERENCES).length, 6);
  for (const mutate of [
    (entry) => { entry.visuals[0].reference_sha256 = "0".repeat(64); },
    (entry) => { entry.visuals[0].overlay.inputs.native_screenshot_sha256 = "0".repeat(64); },
    (entry) => { entry.visuals[0].difference.inputs.reference_sha256 = "0".repeat(64); },
    (entry) => { entry.visuals[0].native_screenshot_sha256 = ""; },
    (entry) => { entry.visuals[0].viewport.width = 0; },
  ]) {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => validatePhase15Evidence(evidence));
  }
});

test("Phase 15 recomputes approved source, manifest, and all six checked-in reference hashes", () => {
  assert.equal(validatePhase15PinnedVisualSources(), true);
  assert.throws(() => validatePhase15PinnedVisualSources({
    readFile: (file) => file.endsWith("light-workout-root.png") ? Buffer.from("stale") : readFileSync(file),
  }));
});

test("Phase 15 rejects non-approved TIM evidence and privacy-unsafe payloads recursively", () => {
  for (const mutate of [
    (entry) => { entry.timing.owner_record_sha256 = "0".repeat(64); },
    (entry) => { entry.timing.legacy_playback_compatibility = true; },
    (entry) => { entry.timing.retirement_evidence_sha256 = ""; },
    (entry) => { entry.cases[0].runtime.exercise_name = "Sensitive exercise"; },
    (entry) => { entry.cases[0].opaque_scoped_id = "employee@example.com"; },
  ]) {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => validatePhase15Evidence(evidence));
  }
});

test("Phase 15 rejects performance summaries that do not derive from retained raw measurements", () => {
  for (const mutate of [
    (entry) => { entry.performance.measurements.render_transition_ms.pop(); },
    (entry) => { entry.performance.measurements.active_js_task_ms[0] = 51; },
    (entry) => { entry.performance.render_transition_p95_ms = 149; },
  ]) {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => validatePhase15Evidence(evidence));
  }
});

test("Phase 15 runner manifest and package commands remain exact", () => {
  const evidence = fixture();
  assert.equal(validatePhase15RunnerManifest(evidence.manifest), true);
  assert.equal(validatePhase15PackageScripts(JSON.parse(readFileSync("package.json", "utf8"))), true);
  const stale = clone(evidence.manifest);
  stale.apk.sha256 = sha256("stale");
  assert.throws(() => validatePhase15RunnerManifest(stale));
});
