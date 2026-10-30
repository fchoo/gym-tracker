import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { archiveInspection } from "../v12-rollback-archive-inspection.mjs";
import { v12CommandPathMaxMs, V12_NATIVE_COMMAND_GRAPH, V12_NATIVE_LEASE_ACTION_BUDGETS, V12_NATIVE_CLEANUP_BUDGET, V12_RECOVERY_COMMAND_GRAPH, V12_RECOVERY_ACTION_BUDGET, V12_GARMIN_COMMAND_GRAPH, V12_GARMIN_ACTION_BUDGET, V12_CALENDAR_COMMAND_GRAPH, V12_CALENDAR_ACTION_BUDGET, V12_QUALITY_COMMAND_GRAPH, V12_QUALITY_WAIT_GRAPH, V12_QUALITY_ACTION_BUDGETS } from "../v12-native-time-budgets.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const archive = Buffer.from("synthetic encrypted archive bytes for host-only validation");
function inspection() {
  const facts = { schema_version: 1, producer: "v12-canonical-post-restore-facts/v1", archive_sha256: sha(archive), source_schema_version: 22,
    table_count: 3, row_count: 0, source_facts_sha256: "a".repeat(64), reopened_facts_sha256: "a".repeat(64), integrity_check: "ok", foreign_key_violations: 0 };
  const receipt = { schema_version: 1, producer: "v12-production-clean-restore-receipt/v1", parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands",
    outcome: "restored", clean_target: true, archive_sha256: sha(archive), archive_format_version: 2, archive_schema_version: 22,
    post_restore_facts_sha256: sha(Buffer.from(JSON.stringify(facts) + "\n")), reopened_post_restore_facts_sha256: sha(Buffer.from(JSON.stringify(facts) + "\n")) };
  return { format_version: 2, schema_version: 22, clean_restore_receipt: receipt, canonical_post_restore_facts: facts };
}

test("rollback inspection binds authenticated archive bytes and both reopened fact receipts", () => {
  const value = inspection();
  const actual = archiveInspection(value, archive, 22);
  assert.equal(actual.formatVersion, 2);
  assert.equal(actual.schemaVersion, 22);
  assert.deepEqual(actual.receiptBytes, Buffer.from(JSON.stringify(value.clean_restore_receipt) + "\n"));
  assert.deepEqual(actual.factsBytes, Buffer.from(JSON.stringify(value.canonical_post_restore_facts) + "\n"));
  assert.equal(Object.isFrozen(actual), true);
  assert.equal(Object.isFrozen(actual.receipt), true);
  assert.equal(Object.isFrozen(actual.facts), true);
  assert.throws(() => archiveInspection(inspection(), Buffer.from("different archive"), 22), /v12_rollback_restore_facts_invalid/u);
});

test("rollback inspection rejects every malformed schema envelope before accepting restoration", () => {
  for (const value of [null, [], {}, { ...inspection(), extra: true }, { ...inspection(), format_version: 1.5 }, { ...inspection(), schema_version: 22.5 }, { ...inspection(), schema_version: 23 }]) {
    assert.throws(() => archiveInspection(value, archive, 22), /v12_rollback_schema_boundary_invalid/u);
  }
});

test("rollback inspection rejects incomplete, corrupt or unbound restored facts", () => {
  const invalid = { schema_version: 2, producer: "other", archive_sha256: "b".repeat(64), source_schema_version: 23, table_count: 0,
    row_count: -1, source_facts_sha256: "invalid", reopened_facts_sha256: "b".repeat(64), integrity_check: "failed", foreign_key_violations: 1 };
  for (const [key, value] of Object.entries(invalid)) {
    const candidate = inspection(); candidate.canonical_post_restore_facts[key] = value;
    assert.throws(() => archiveInspection(candidate, archive, 22), /v12_rollback_restore_facts_invalid/u, key);
  }
  for (const facts of [null, [], {}, { ...inspection().canonical_post_restore_facts, extra: true },
    { ...inspection().canonical_post_restore_facts, table_count: 1.5 }, { ...inspection().canonical_post_restore_facts, row_count: 1.5 },
    { ...inspection().canonical_post_restore_facts, source_facts_sha256: null }, { ...inspection().canonical_post_restore_facts, reopened_facts_sha256: undefined }]) {
    const candidate = inspection(); candidate.canonical_post_restore_facts = facts;
    assert.throws(() => archiveInspection(candidate, archive, 22), /v12_rollback_restore_facts_invalid/u);
  }
});

test("rollback inspection rejects each receipt mismatch instead of acknowledging unproved restoration", () => {
  const invalid = { schema_version: 2, producer: "other", parser: "other", outcome: "failed", clean_target: false,
    archive_sha256: "b".repeat(64), archive_format_version: 1, archive_schema_version: 23,
    post_restore_facts_sha256: "b".repeat(64), reopened_post_restore_facts_sha256: "b".repeat(64) };
  for (const [key, value] of Object.entries(invalid)) {
    const candidate = inspection(); candidate.clean_restore_receipt[key] = value;
    assert.throws(() => archiveInspection(candidate, archive, 22), /v12_rollback_restore_receipt_invalid/u, key);
  }
  for (const receipt of [null, [], {}, { ...inspection().clean_restore_receipt, extra: true }]) {
    const candidate = inspection(); candidate.clean_restore_receipt = receipt;
    assert.throws(() => archiveInspection(candidate, archive, 22), /v12_rollback_restore_receipt_invalid/u);
  }
});

test("native timeout budgets include every declared operation and preserve independent cleanup windows", () => {
  const input = Object.freeze([Object.freeze({ max_ms: 20 }), Object.freeze({ max_ms: 35 })]);
  assert.equal(v12CommandPathMaxMs(input), 55);
  assert.equal(v12CommandPathMaxMs([]), 0);
  const sum = graph => Object.values(graph).reduce((total, commands) => total + v12CommandPathMaxMs(commands), 0);
  assert.equal(V12_RECOVERY_ACTION_BUDGET.max_ms, sum(V12_RECOVERY_COMMAND_GRAPH));
  assert.equal(V12_GARMIN_ACTION_BUDGET.max_ms, sum(V12_GARMIN_COMMAND_GRAPH));
  assert.equal(V12_CALENDAR_ACTION_BUDGET.max_ms, sum(V12_CALENDAR_COMMAND_GRAPH));
  assert.equal(V12_NATIVE_CLEANUP_BUDGET.max_ms, v12CommandPathMaxMs(V12_NATIVE_COMMAND_GRAPH.runtime_cleanup));
  for (const action of ["performance", "accessibility"]) {
    const budget = V12_QUALITY_ACTION_BUDGETS[action];
    assert.equal(budget.adb_call_count, V12_QUALITY_COMMAND_GRAPH[action].length);
    assert.equal(budget.adb_max_ms, v12CommandPathMaxMs(V12_QUALITY_COMMAND_GRAPH[action]));
    assert.equal(budget.readiness_max_ms, v12CommandPathMaxMs(V12_QUALITY_WAIT_GRAPH[action]));
    assert.equal(budget.max_ms, budget.producer_max_ms + budget.adb_max_ms + budget.readiness_max_ms);
  }
  assert.ok(Object.values(V12_NATIVE_LEASE_ACTION_BUDGETS).every(value => value.adb_call_count > 0 && value.max_ms > 0));
  assert.deepEqual(input.map(value => value.max_ms), [20, 35]);
});
