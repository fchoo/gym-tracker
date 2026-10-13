import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  V12_BROWSER_WALK_STATE_IDS,
  V12_CONFIG_IDS,
  V12_NATIVE_STATE_PACKS,
  V12_REQUIRED_ARTIFACTS,
  V12_VERDICTS,
  deriveV12Ledger,
  loadV12ContractInputs,
} from "./v12-evidence-contract.mjs";

const ROOT = process.cwd();
const clone = (value) => structuredClone(value);

function canonicalInputs() {
  return loadV12ContractInputs({ root: ROOT });
}

test("derives the immutable 172-row requirement inventory in canonical source order", () => {
  const inputs = canonicalInputs();
  const ledger = deriveV12Ledger(inputs);

  assert.equal(ledger.rows.length, 172);
  assert.deepEqual(ledger.phase_counts, {
    "13": 17,
    "14": 13,
    "15": 36,
    "16": 23,
    "17": 36,
    "18": 16,
    "19": 18,
    "20": 13,
  });
  assert.equal(new Set(ledger.rows.map(({ inventory_id, requirement_id }) => `${inventory_id}\u0000${requirement_id}`)).size, 172);
  assert.deepEqual(ledger.rows.map(({ requirement_id }) => requirement_id), inputs.matrix.rows.map(({ requirement_id }) => requirement_id));
  assert.ok(ledger.rows.every((row) => row.verdict === "NOT_RUN"));
});

test("rejects duplicate, unknown, and REQUIREMENTS.md-drifted source inventory", () => {
  const duplicate = canonicalInputs();
  duplicate.matrix.rows.push(clone(duplicate.matrix.rows[0]));
  assert.throws(() => deriveV12Ledger(duplicate), /v12_contract_duplicate_requirement_or_inventory/u);

  const unknown = canonicalInputs();
  unknown.matrix.rows[0].requirement_id = "VER-99";
  assert.throws(() => deriveV12Ledger(unknown), /v12_contract_requirement_set_drift/u);

  const driftedRequirements = canonicalInputs();
  driftedRequirements.requirementsByPhase[13] = driftedRequirements.requirementsByPhase[13].slice(1);
  assert.throws(() => deriveV12Ledger(driftedRequirements), /v12_contract_requirement_set_drift/u);
});

test("preserves 107 ordered browser occurrences and expands static coverage into all 64 configurations", () => {
  const inputs = canonicalInputs();
  const ledger = deriveV12Ledger(inputs);

  assert.equal(V12_BROWSER_WALK_STATE_IDS.length, 107);
  assert.deepEqual(V12_BROWSER_WALK_STATE_IDS.slice(0, 3), ["BW-001", "BW-002", "BW-003"]);
  assert.equal(V12_BROWSER_WALK_STATE_IDS.at(-1), "BW-107");
  assert.equal(ledger.browser_states.length, 107);
  assert.deepEqual(ledger.browser_states.map(({ id }) => id), V12_BROWSER_WALK_STATE_IDS);
  assert.equal(ledger.browser_states.filter(({ name }) => name === "progress-settings").length, 3);
  assert.equal(V12_CONFIG_IDS.length, 64);
  assert.equal(new Set(V12_CONFIG_IDS).size, 64);
  assert.equal(ledger.static_configurations.length, 64);
});

test("rejects browser evidence state collapse, inherited v1.1 evidence, and false N/A", () => {
  const inputs = canonicalInputs();
  const collapsed = clone(inputs.browserWalk);
  collapsed.splice(1, 1);
  assert.throws(() => deriveV12Ledger({ ...inputs, browserWalk: collapsed }), /v12_contract_browser_walk_invalid/u);

  const inherited = deriveV12Ledger(inputs, {
    observations: [{ row_id: "DOM-01", source: "v1.1", status: "passed" }],
  });
  assert.equal(inherited.rows[0].verdict, "NOT_RUN");

  assert.throws(() => deriveV12Ledger(inputs, {
    verdicts: [{ row_id: "DOM-01", verdict: "N_A_REVIEWED", reason: "not captured", reviewer: "owner", reviewed_at: "2026-10-14" }],
  }), /v12_contract_na_reason_invalid/u);
});

test("uses exactly six validator-owned verdicts and keeps accepted exceptions out of PASS counts", () => {
  const inputs = canonicalInputs();
  assert.deepEqual(V12_VERDICTS, ["NOT_RUN", "PASS", "FAIL", "REVIEW_REQUIRED", "ACCEPTED_EXCEPTION", "N_A_REVIEWED"]);

  assert.throws(() => deriveV12Ledger(inputs, {
    verdicts: [{ row_id: "DOM-01", verdict: "ACCEPTED_EXCEPTION", deviation_id: "D20-X", owner_decision: "owner", decided_at: "2026-10-14", configurations: [], rationale: "", evidence_hashes: [] }],
  }), /v12_contract_exception_metadata_invalid/u);

  const ledger = deriveV12Ledger(inputs, {
    verdicts: [{
      row_id: "DOM-01",
      verdict: "ACCEPTED_EXCEPTION",
      deviation_id: "D20-X",
      owner_decision: "approved retained failing oracle",
      decided_at: "2026-10-14",
      configurations: [V12_CONFIG_IDS[0]],
      rationale: "The exact configuration is owner-reviewed.",
      evidence_hashes: ["a".repeat(64)],
    }],
  });
  assert.equal(ledger.rows[0].verdict, "ACCEPTED_EXCEPTION");
  assert.equal(ledger.verdict_counts.ACCEPTED_EXCEPTION, 1);
  assert.equal(ledger.verdict_counts.PASS, 0);
});

test("does not let producers author verdicts and keeps settled baselines as technical evidence", () => {
  const inputs = canonicalInputs();
  const ledger = deriveV12Ledger(inputs, {
    observations: [{ row_id: "DOM-01", source: "native", verdict: "PASS", status: "passed" }],
  });
  assert.equal(ledger.rows[0].verdict, "NOT_RUN");
  assert.deepEqual(ledger.rows[0].observations, [{ source: "native", status: "passed" }]);
  assert.deepEqual(ledger.settled_baselines, ["MAP-01", "TIM-01", "DEV-01", "DEV-02", "GARMIN_TRANSPORT"]);
  assert.ok(V12_REQUIRED_ARTIFACTS.length > 0);
  assert.ok(V12_NATIVE_STATE_PACKS.length > 0);
});

test("reads only canonical structured files and rejects source path substitution", () => {
  assert.throws(() => loadV12ContractInputs({
    root: ROOT,
    matrixPath: "../outside.json",
  }), /v12_contract_unsafe_relative_path/u);
  assert.ok(readFileSync(".planning/design/v1.2-prototype-parity-matrix.json", "utf8").includes("\"rows\""));
});
