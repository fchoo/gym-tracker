import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE15_EVIDENCE_CASE_IDS,
  PHASE15_REQUIRED_CASES,
  PHASE15_VISUAL_REFERENCES,
} from "../src/testing/contracts/phase15Workout.contract.ts";
import {
  createPhase15EvidenceFixture,
  validatePhase15Evidence,
  validatePhase15PackageScripts,
  validatePhase15RunnerManifest,
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

test("Phase 15 runner manifest and package commands remain exact", () => {
  const evidence = fixture();
  assert.equal(validatePhase15RunnerManifest(evidence.manifest), true);
  assert.equal(validatePhase15PackageScripts(JSON.parse(readFileSync("package.json", "utf8"))), true);
  const stale = clone(evidence.manifest);
  stale.apk.sha256 = sha256("stale");
  assert.throws(() => validatePhase15RunnerManifest(stale));
});
