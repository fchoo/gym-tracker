import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
import { createPhase17FixtureProtocol } from "../src/bootstrap/phase17NativeFixture.ts";
import { validatePhase17Evidence, validatePhase17IntegrityCoverageRegistry } from "./verify-phase17-evidence.mjs";
import { PHASE17_FLOW_CASES, commandTreeForPhase17Case, createPhase17RunnerPlan, parsePhase17RunnerArgs, validatePhase17FlowSources } from "./run-phase17-maestro.mjs";

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

test("Phase 17 parses actual YAML command trees and rejects comment-only or inert case bindings", () => {
  const flows = Object.fromEntries([...new Set(PHASE17_FLOW_CASES.map(({ flow }) => flow))].map((flow) => [flow, readFileSync(flow, "utf8")]));
  assert.equal(validatePhase17FlowSources(flows), true);
  for (const contract of PHASE17_FLOW_CASES) {
    const tree = commandTreeForPhase17Case(flows, contract.id);
    assert.ok(tree.some(({ name }) => ["tapOn", "inputText", "pressKey", "swipe", "openLink", "launchApp"].includes(name)), contract.id);
    assert.ok(tree.some(({ name }) => ["assertVisible", "assertNotVisible", "extendedWaitUntil"].includes(name)), contract.id);
    assert.ok(tree.some(({ name }) => ["tapOn", "pressKey", "openLink"].includes(name)), contract.id);
  }
  const commentOnly = { ...flows, "maestro/phase17/library.yaml": flows["maestro/phase17/library.yaml"].replace(/commands:\n(?:\s+-.+\n)+/u, "commands: []\n") };
  assert.throws(() => validatePhase17FlowSources(commentOnly, ["library.remembered-state"]), /phase17_flow_case_missing:library\.remembered-state/u);
  const inert = { ...flows, "maestro/phase17/accessibility.yaml": flows["maestro/phase17/accessibility.yaml"].replace("- pressKey: \"Remote Dpad Down\"", "- assertTrue: ${PHASE17_CASE_ID == 'library.accessibility-recovery'}") };
  assert.throws(() => validatePhase17FlowSources(inert), /phase17_flow_privacy_unsafe/u);
});

test("Phase 17 command trees keep the high-risk authoring, collision, and accessibility sequences executable", () => {
  const flows = Object.fromEntries([...new Set(PHASE17_FLOW_CASES.map(({ flow }) => flow))].map((flow) => [flow, readFileSync(flow, "utf8")]));
  const values = (id) => commandTreeForPhase17Case(flows, id).map(({ value }) => typeof value === "string" ? value : JSON.stringify(value));
  const typed = values("library.running-create-typed-sessions").join("\n");
  for (const kind of ["Recovery", "Long run", "Progression", "Tempo", "Intervals", "Hills", "Fartlek"]) assert.match(typed, new RegExp(`Workout type ${kind}`, "u"));
  assert.equal((typed.match(/Save session/gu) ?? []).length, 7);
  assert.match(typed, /library\/running\/\$\{PHASE17_RUNNING_PLAN_ID\}/u);
  const lifecycle = values("library.running-session-lifecycle").join("\n");
  assert.ok(commandTreeForPhase17Case(flows, "library.running-session-lifecycle").some(({ name }) => name === "swipe"));
  assert.match(lifecycle, /Delete session/u);
  assert.match(lifecycle, /Save changes/u);
  assert.match(lifecycle, /No sessions yet/u);
  const collision = values("library.running-conflict").join("\n");
  for (const selector of ["Review schedule collision", "Move Running", "Confirm", "Calendar", "Today"]) assert.match(collision, new RegExp(selector, "u"));
  const accessibility = values("library.accessibility-recovery").join("\n");
  for (const selector of ["Remote Dpad Down", "BACK", "ESCAPE", "Search exercises", "ENTER", "48 dp"]) assert.match(accessibility, new RegExp(selector, "u"));
});

test("Phase 17 fixture protocol binds Library, session, lifecycle, and collision proof to a synthetic opaque fixture", async () => {
  let digest = "a".repeat(64);
  const cleaned = [];
  const protocol = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS,
    createToken: () => "phase17:fixture-token-0001",
    adapter: {
      baselineDigest: async () => digest,
      seed: async ({ fixtureToken }) => ({ runningPlanId: `running-${fixtureToken}`, ownedPlanId: "owned-opaque", customExerciseId: "custom-opaque", bundledExerciseId: "bundled-opaque" }),
      probe: async ({ sourceTable, expectedState }) => ({ rowCount: 1, identityHash: "b".repeat(64), matchesExpectedState: sourceTable.length > 0 && expectedState.length > 0 }),
      cleanup: async ({ fixtureToken }) => { cleaned.push(fixtureToken); digest = "a".repeat(64); },
    },
  });
  for (const caseId of ["library.owned-summary", "library.running-recovery", "library.running-session-lifecycle", "library.running-conflict"]) {
    const fixture = await protocol.setup(caseId);
    const proof = await protocol.probe({ caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable, expectedState: fixture.expectedState });
    assert.equal(proof.verdict, "matched");
    await protocol.cleanup({ caseId, fixtureToken: fixture.fixtureToken });
  }
  assert.equal(cleaned.length, 4);
});

test("Phase 17 fixture protocol fails closed for missing or mismatched lifecycle inputs and payload leakage", async () => {
  let digest = "c".repeat(64);
  const protocol = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS,
    createToken: () => "phase17:fixture-token-0002",
    adapter: {
      baselineDigest: async () => digest,
      seed: async () => ({ runningPlanId: "opaque-running", ownedPlanId: "opaque-owned", customExerciseId: "opaque-custom", bundledExerciseId: "opaque-bundled" }),
      probe: async () => ({ rowCount: 1, identityHash: "d".repeat(64), matchesExpectedState: true }),
      cleanup: async () => undefined,
    },
  });
  await assert.rejects(protocol.probe({ caseId: "library.running-recovery", fixtureToken: "phase17:fixture-token-0002", sourceTable: "running_session_revisions", expectedState: "recovery-session-visible" }), /phase17_fixture_missing/u);
  const fixture = await protocol.setup("library.running-recovery");
  await assert.rejects(protocol.setup("library.running-long"), /phase17_fixture_active/u);
  await assert.rejects(protocol.probe({ caseId: "library.running-long", fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable, expectedState: fixture.expectedState }), /phase17_fixture_case_mismatch/u);
  await assert.rejects(protocol.probe({ caseId: fixture.caseId, fixtureToken: "phase17:wrong-token-000000", sourceTable: fixture.sourceTable, expectedState: fixture.expectedState }), /phase17_fixture_token_invalid/u);
  await assert.rejects(protocol.probe({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, sourceTable: "wrong_table", expectedState: fixture.expectedState }), /phase17_fixture_table_mismatch/u);
  await assert.rejects(protocol.probe({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable, expectedState: "wrong-state" }), /phase17_fixture_expected_state_mismatch/u);
  digest = "e".repeat(64);
  await assert.rejects(protocol.cleanup({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken }), /phase17_fixture_cleanup_digest_mismatch/u);
  const cleanupFailure = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS,
    createToken: () => "phase17:fixture-token-0003",
    adapter: { baselineDigest: async () => "f".repeat(64), seed: async () => ({ ownedPlanId: "opaque" }), probe: async () => ({ rowCount: 1, identityHash: "f".repeat(64), matchesExpectedState: true }), cleanup: async () => { throw new Error("cleanup failed"); } },
  });
  const cleanupFixture = await cleanupFailure.setup("library.owned-summary");
  await assert.rejects(cleanupFailure.cleanup({ caseId: cleanupFixture.caseId, fixtureToken: cleanupFixture.fixtureToken }), /cleanup failed/u);
  assert.deepEqual(Object.keys(fixture).sort(), ["baselineDigest", "caseId", "expectedState", "fixtureToken", "selectors", "sourceTable"]);
  assert.equal(JSON.stringify(fixture).includes("raw-row"), false);
});
