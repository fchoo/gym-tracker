import assert from "node:assert/strict";
import test from "node:test";

import { assertV12ArtifactPrivacySafe } from "../v12-artifact-privacy.mjs";
import {
  assertV12AcceptanceNativeContractResult,
  createV12SqliteFailureReceipt,
} from "../v12-sqlite-producer-contract.mjs";

const nativeResult = () => ({
  schemaVersion: 1,
  contractVersion: 1,
  status: "passed",
  total: 1,
  passed: 1,
  failed: 0,
  skipped: 0,
  cases: [{
    id: "bounded-case",
    status: "passed",
    code: "v12_acceptance_case_passed",
    counts: { sourceCases: 1 },
    sourceFacts: [{ registry: "sqlite-kernel", cases: [{ id: "source-case", status: "passed" }] }],
  }],
});

test("text evidence rejects an explicitly encoded replacement character without accepting corrupted content", () => {
  const bytes = Buffer.from("replacement character: \uFFFD", "utf8");
  assert.equal(Buffer.from(bytes.toString("utf8"), "utf8").length, bytes.length);
  assert.throws(() => assertV12ArtifactPrivacySafe("proof.txt", bytes), /v12_artifact_privacy_invalid/u);
});

test("artifact paths reject standalone current and parent directory markers", () => {
  for (const artifact of [".", ".."]) {
    assert.throws(() => assertV12ArtifactPrivacySafe(artifact, Buffer.from("bounded evidence")), /v12_artifact_privacy_invalid/u);
  }
});

test("JSON evidence rejects malformed syntax before treating its contents as technical proof", () => {
  assert.throws(() => assertV12ArtifactPrivacySafe("proof.json", Buffer.from("{")), /v12_artifact_privacy_invalid/u);
});

test("SQLite source proof rejects non-array and empty registry collections", () => {
  for (const sourceFacts of [null, {}, []]) {
    const result = nativeResult();
    result.cases[0].sourceFacts = sourceFacts;
    assert.throws(() => assertV12AcceptanceNativeContractResult(result, ["bounded-case"]), /v12_sqlite_producer_v12_result_invalid/u);
  }
});

test("SQLite source proof rejects duplicate registries instead of counting the same executed proof twice", () => {
  const result = nativeResult();
  result.cases[0].counts.sourceCases = 2;
  result.cases[0].sourceFacts.push(structuredClone(result.cases[0].sourceFacts[0]));
  assert.throws(() => assertV12AcceptanceNativeContractResult(result, ["bounded-case"]), /v12_sqlite_producer_v12_result_invalid/u);
});

test("SQLite source proof rejects malformed registry names and absent registry cases", () => {
  for (const entry of [
    { registry: "X", cases: [{ id: "source-case", status: "passed" }] },
    { registry: "sqlite-kernel", cases: null },
    { registry: "sqlite-kernel", cases: [] },
  ]) {
    const result = nativeResult();
    result.cases[0].sourceFacts = [entry];
    assert.throws(() => assertV12AcceptanceNativeContractResult(result, ["bounded-case"]), /v12_sqlite_producer_v12_result_invalid/u);
  }
});

test("SQLite source proof rejects malformed, failed, and duplicated source case identities", () => {
  for (const cases of [
    [{ id: "@bad", status: "passed" }],
    [{ id: "source-case", status: "failed" }],
    [{ id: "source-case", status: "passed" }, { id: "source-case", status: "passed" }],
  ]) {
    const result = nativeResult();
    result.cases[0].counts.sourceCases = cases.length;
    result.cases[0].sourceFacts[0].cases = cases;
    assert.throws(() => assertV12AcceptanceNativeContractResult(result, ["bounded-case"]), /v12_sqlite_producer_v12_result_invalid/u);
  }
});

test("SQLite source proof requires its declared count to equal the distinct validated cases", () => {
  const result = nativeResult();
  result.cases[0].counts.sourceCases = 2;
  assert.throws(() => assertV12AcceptanceNativeContractResult(result, ["bounded-case"]), /v12_sqlite_producer_v12_result_invalid/u);
});

test("SQLite proof privacy rejects a location-bearing case identity even when the requested identity matches", () => {
  const result = nativeResult();
  result.cases[0].id = "/home/synthetic-case";
  assert.throws(() => assertV12AcceptanceNativeContractResult(result, [result.cases[0].id]), /v12_sqlite_producer_privacy_invalid/u);
});

test("SQLite failure receipt rejects an omitted request before any receipt can be produced", () => {
  assert.throws(() => createV12SqliteFailureReceipt(), /v12_sqlite_producer_run_id_invalid/u);
});

test("SQLite proof rejects an object case identity even when the requested array contains that same object", () => {
  const result = nativeResult();
  const identity = { id: "bounded-case" };
  result.cases[0].id = identity;
  assert.throws(() => assertV12AcceptanceNativeContractResult(result, [identity]), /v12_sqlite_producer_v12_result_invalid/u);
});

test("SQLite proof rejects private keys at every accepted object boundary with the existing malformed-result error", () => {
  for (const addPrivateKey of [
    result => { result.secret = 1; },
    result => { result.cases[0].token = 1; },
    result => { result.cases[0].counts.source_rows = 1; },
    result => { result.cases[0].sourceFacts[0].route = {}; },
    result => { result.cases[0].sourceFacts[0].cases[0].email = "synthetic"; },
  ]) {
    const result = nativeResult();
    addPrivateKey(result);
    assert.throws(() => assertV12AcceptanceNativeContractResult(result, ["bounded-case"]), /v12_sqlite_producer_v12_result_invalid/u);
  }
});
