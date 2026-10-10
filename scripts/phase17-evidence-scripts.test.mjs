import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
import {
  createPhase17EvidenceFixture,
  materializePhase17EvidenceFixture,
  validatePhase17Evidence,
  validatePhase17IntegrityCoverageRegistry,
  verifyPhase17EvidenceArtifacts,
} from "./verify-phase17-evidence.mjs";
import {
  PHASE17_FLOW_CASES,
  createPhase17RunnerPlan,
  parsePhase17RunnerArgs,
  validatePhase17FlowSources,
} from "./run-phase17-maestro.mjs";

const clone = (value) => structuredClone(value);
const fixture = () => createPhase17EvidenceFixture();

test("Phase 17 accepts only an exact one-to-one, real Expo SQLite ledger", () => {
  const evidence = fixture();
  assert.equal(validatePhase17Evidence(evidence).status, "passed");
  assert.equal(evidence.cases.length, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS.length);
});

test("Phase 17 rejects missing, duplicate, skipped, failed, fixture-only, stale, and unmapped cases", () => {
  for (const mutate of [
    (entry) => entry.cases.pop(),
    (entry) => entry.cases.push(clone(entry.cases[0])),
    (entry) => { entry.cases[0].status = "skipped"; },
    (entry) => { entry.cases[0].status = "failed"; },
    (entry) => { entry.cases[0].runtime.sqlite_contract = "fixture-only"; },
    (entry) => { entry.cases[0].source_tree_sha256 = "f".repeat(64); },
    (entry) => { entry.cases[0].id = "library.unmapped"; },
  ]) {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => validatePhase17Evidence(evidence));
  }
});

test("Phase 17 rejects forged, traversing, symlinked, stale, and privacy-unsafe retained evidence", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase17-evidence-"));
  const evidence = materializePhase17EvidenceFixture(root);
  assert.equal(verifyPhase17EvidenceArtifacts(evidence, { root }), true);

  const traversing = clone(evidence);
  traversing.artifacts.report.path = "../forged-report.json";
  assert.throws(() => verifyPhase17EvidenceArtifacts(traversing, { root }), /report_path_invalid/u);

  const symlinked = clone(evidence);
  const externalRoot = mkdtempSync(path.join(tmpdir(), "phase17-evidence-external-"));
  const reportPath = path.join(root, symlinked.artifacts.report.path);
  const external = path.join(externalRoot, "report.json");
  writeFileSync(external, readFileSync(reportPath));
  unlinkSync(reportPath);
  symlinkSync(external, reportPath);
  assert.throws(() => verifyPhase17EvidenceArtifacts(symlinked, { root }), /report_path_invalid/u);

  const privateEvidence = fixture();
  privateEvidence.cases[0].semantic.labels = ["Private draft name"];
  assert.throws(() => validatePhase17Evidence(privateEvidence), /privacy_unsafe/u);
});

test("Phase 17 registers all landed Running migrations and authority at complete coverage", () => {
  assert.equal(validatePhase17IntegrityCoverageRegistry(readFileSync("scripts/run-coverage-gate.mjs", "utf8")), true);
});

test("Phase 17 native runner keeps the 39-case ledger bounded and requires an explicit execution opt-in", () => {
  const manifest = fixture().manifest;
  const plan = createPhase17RunnerPlan(manifest);

  assert.equal(plan.case_ids.length, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS.length);
  assert.equal(new Set(plan.case_ids).size, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS.length);
  assert.equal(plan.risk_based, true);
  assert.equal(plan.cartesian_expansion, false);
  assert.equal(plan.device_state_restoration, "guaranteed");
  assert.equal(plan.device_profiles.largeText.fontScale, 2);
  assert.equal(plan.device_profiles.compactLandscape.reducedMotion, true);
  assert.equal(plan.device_profiles.compactLandscape.width > plan.device_profiles.compactLandscape.height, true);
  assert.deepEqual(
    parsePhase17RunnerArgs(["--manifest", "artifacts/native/phase17/build.json", "--all"]),
    { manifest: "artifacts/native/phase17/build.json", ids: PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS, execute: false },
  );
  assert.throws(
    () => parsePhase17RunnerArgs(["--manifest", "artifacts/native/phase17/build.json", "--all", "--execute", "--execute"]),
    /phase17_runner_arguments_invalid/u,
  );
});

test("Phase 17 flow sources cover all canonical cases without recording evidence payloads", () => {
  const flows = Object.fromEntries(
    [...new Set(PHASE17_FLOW_CASES.map(({ flow }) => flow))]
      .map((flow) => [flow, readFileSync(flow, "utf8")]),
  );
  assert.equal(validatePhase17FlowSources(flows), true);
  assert.equal(Object.values(flows).join("\n").includes("takeScreenshot"), false);
});
