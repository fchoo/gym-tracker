import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
import { validatePhase17Evidence, validatePhase17IntegrityCoverageRegistry } from "./verify-phase17-evidence.mjs";
import { PHASE17_FLOW_CASES, createPhase17RunnerPlan, parsePhase17RunnerArgs, validatePhase17FlowSources } from "./run-phase17-maestro.mjs";

test("Phase 17 rejects any evidence that does not bind every case to a real action, UI readback, SQLite probe, report and cleanup", () => {
  assert.throws(() => validatePhase17Evidence({}), /phase17_evidence_invalid/u);
  assert.equal(PHASE17_CASE_ACTION_CONTRACTS.length, 39);
  assert.deepEqual(PHASE17_CASE_ACTION_CONTRACTS.map(({ id }) => id), PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS);
  for (const contract of PHASE17_CASE_ACTION_CONTRACTS) {
    assert.ok(contract.action.length > 0);
    assert.ok(contract.uiReadback.length > 0);
    assert.ok(contract.sourceProbe.length > 0);
    assert.equal(contract.rawReportRequired, true);
    assert.equal(contract.cleanupRequired, true);
  }
});

test("Phase 17 registers all landed Running migrations and authority at complete coverage", () => {
  assert.equal(validatePhase17IntegrityCoverageRegistry(readFileSync("scripts/run-coverage-gate.mjs", "utf8")), true);
});

test("Phase 17 native runner keeps the 39-case ledger bounded, requires explicit execution, and declares authoritative setup", () => {
  const manifest = { package: "com.fchoo.gymtracker.devtest" };
  const plan = createPhase17RunnerPlan(manifest);
  assert.equal(plan.case_ids.length, 39);
  assert.equal(plan.risk_based, true);
  assert.equal(plan.cartesian_expansion, false);
  assert.equal(plan.source_setup_policy, "authoritative-sqlite-commands-only");
  assert.equal(plan.result_policy, "native-evidence-pending-until-phase20");
  assert.deepEqual(parsePhase17RunnerArgs(["--manifest", "artifacts/native/phase17/build.json", "--all"]), { manifest: "artifacts/native/phase17/build.json", ids: PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS, execute: false });
});

test("Phase 17 flow sources fail closed when a ledger action or factual readback binding is absent", () => {
  const flows = Object.fromEntries([...new Set(PHASE17_FLOW_CASES.map(({ flow }) => flow))].map((flow) => [flow, readFileSync(flow, "utf8")]));
  assert.equal(validatePhase17FlowSources(flows), true);
  const missing = { ...flows, "maestro/phase17/library.yaml": flows["maestro/phase17/library.yaml"].replace("# phase17-contract: library.exercise-search | search-exercises | matching-exercise-result-visible | exercise_search_index\n", "") };
  assert.throws(() => validatePhase17FlowSources(missing), /phase17_flow_contract_missing:library\.exercise-search/u);
});
