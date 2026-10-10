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
