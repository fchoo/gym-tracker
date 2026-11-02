import assert from "node:assert/strict";
import test from "node:test";

import { assertV12AcceptanceNativeContractResult } from "../v12-sqlite-producer-contract.mjs";

const result = () => ({
  schemaVersion: 1,
  contractVersion: 1,
  status: "passed",
  total: 1,
  passed: 1,
  failed: 0,
  skipped: 0,
  cases: [{
    id: "snapshot-case",
    status: "passed",
    code: "v12_acceptance_case_passed",
    counts: { sourceCases: 1 },
    sourceFacts: [{ registry: "sqlite-kernel", cases: [{ id: "source-case", status: "passed" }] }],
  }],
});

test("the returned SQLite receipt is the snapshot actually validated when a source getter changes", () => {
  const input = result();
  let reads = 0;
  Object.defineProperty(input.cases[0], "status", {
    enumerable: true,
    get: () => ++reads === 1 ? "passed" : "failed",
  });
  const receipt = assertV12AcceptanceNativeContractResult(input, ["snapshot-case"]);
  assert.equal(reads, 1);
  assert.equal(receipt.cases[0].status, "passed");
  assert.notEqual(receipt, input);
  input.cases[0].id = "changed-after-validation";
  assert.equal(receipt.cases[0].id, "snapshot-case");
});

test("unsupported callable receipt data rejects with the bounded malformed-result error", () => {
  const input = result();
  input.cases[0].counts.sourceCases = () => 1;
  assert.throws(() => assertV12AcceptanceNativeContractResult(input, ["snapshot-case"]), {
    message: "v12_sqlite_producer_v12_result_invalid",
  });
});
