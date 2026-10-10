import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
import { createPhase17FixtureProtocol } from "../src/bootstrap/phase17NativeFixture.ts";
import { PHASE17_FAMILY_A_CASE_IDS, createPhase17FamilyAFixtureAdapter } from "../src/bootstrap/phase17FamilyAFixture.ts";
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
      canonicalHash: async () => "b".repeat(64),
      seed: async ({ fixtureToken }) => ({ selectors: { runningPlanId: `running-${fixtureToken}`, ownedPlanId: "owned-opaque" }, expectedPreState: { lifecycle: "inactive", revision: 1 }, expectedPostState: { lifecycle: "inactive", revision: 1 } }),
      probe: async ({ sourceTable }) => ({ rowCount: 1, identityHash: "b".repeat(64), facts: { lifecycle: sourceTable.length > 0 ? "inactive" : "invalid", revision: 1 } }),
      cleanup: async ({ fixtureToken }) => { cleaned.push(fixtureToken); digest = "a".repeat(64); },
    },
  });
  for (const caseId of ["library.owned-summary", "library.running-recovery", "library.running-session-lifecycle", "library.running-conflict"]) {
    const fixture = await protocol.setup(caseId);
    const proof = await protocol.probe({ caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable });
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
      canonicalHash: async () => "d".repeat(64),
      seed: async () => ({ selectors: { ownedPlanId: "opaque-owned" }, expectedPreState: { lifecycle: "inactive", revision: 1 }, expectedPostState: { lifecycle: "inactive", revision: 1 } }),
      probe: async () => ({ rowCount: 1, identityHash: "d".repeat(64), facts: { lifecycle: "inactive", revision: 1 } }),
      cleanup: async () => undefined,
    },
  });
  await assert.rejects(protocol.probe({ caseId: "library.running-recovery", fixtureToken: "phase17:fixture-token-0002", sourceTable: "running_session_revisions" }), /phase17_fixture_missing/u);
  const fixture = await protocol.setup("library.running-recovery");
  await assert.rejects(protocol.setup("library.running-long"), /phase17_fixture_active/u);
  await assert.rejects(protocol.probe({ caseId: "library.running-long", fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable }), /phase17_fixture_case_mismatch/u);
  await assert.rejects(protocol.probe({ caseId: fixture.caseId, fixtureToken: "phase17:wrong-token-000000", sourceTable: fixture.sourceTable }), /phase17_fixture_token_invalid/u);
  await assert.rejects(protocol.probe({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, sourceTable: "wrong_table" }), /phase17_fixture_table_mismatch/u);
  digest = "e".repeat(64);
  await assert.rejects(protocol.cleanup({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken }), /phase17_fixture_cleanup_digest_mismatch/u);
  const cleanupFailure = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS,
    createToken: () => "phase17:fixture-token-0003",
    adapter: { baselineDigest: async () => "f".repeat(64), canonicalHash: async () => "f".repeat(64), seed: async () => ({ selectors: { ownedPlanId: "opaque" }, expectedPreState: { lifecycle: "inactive" }, expectedPostState: { lifecycle: "inactive" } }), probe: async () => ({ rowCount: 1, identityHash: "f".repeat(64), facts: { lifecycle: "inactive" } }), cleanup: async () => { throw new Error("cleanup failed"); } },
  });
  const cleanupFixture = await cleanupFailure.setup("library.owned-summary");
  await assert.rejects(cleanupFailure.cleanup({ caseId: cleanupFixture.caseId, fixtureToken: cleanupFixture.fixtureToken }), /cleanup failed/u);
  assert.deepEqual(Object.keys(fixture).sort(), ["baselineDigest", "caseId", "expectedPostState", "expectedPreState", "expectedState", "expectedStateHash", "fixtureToken", "selectors", "sourceTable"]);
  assert.equal(JSON.stringify(fixture).includes("raw-row"), false);
});

test("Phase 17 rejects unrelated rows, fabricated identities, wrong facts or count, and cleanup leaks", async () => {
  let digest = "1".repeat(64);
  const protocol = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS,
    createToken: () => "phase17:fixture-token-0004",
    adapter: {
      baselineDigest: async () => digest,
      canonicalHash: async () => "2".repeat(64),
      seed: async () => ({ selectors: { runningPlanId: "returned-running-id" }, expectedPreState: { id: "returned-running-id", lifecycle: "inactive", revision: 1 }, expectedPostState: { id: "returned-running-id", lifecycle: "inactive", revision: 1 } }),
      probe: async () => ({ rowCount: 2, identityHash: "3".repeat(64), facts: { id: "unrelated-row", lifecycle: "inactive", revision: 1 } }),
      cleanup: async () => { digest = "4".repeat(64); },
    },
  });
  const fixture = await protocol.setup("library.running-detail");
  await assert.rejects(protocol.probe({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable }), /phase17_fixture_probe_failed/u);
  await assert.rejects(protocol.cleanup({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken }), /phase17_fixture_cleanup_digest_mismatch/u);
  assert.equal(JSON.stringify(fixture).includes("unrelated-row"), false);
});

test("Phase 17 Family A is an explicit typed registry with table-specific seed, probe and token cleanup", async () => {
  const touched = [];
  const adapter = createPhase17FamilyAFixtureAdapter({
    baselineDigest: async () => "a".repeat(64),
    canonicalHash: async () => "b".repeat(64),
    driver: {
      seed: async (caseId, token, sourceTable) => {
        touched.push(`seed:${caseId}:${sourceTable}`);
        const facts = { id: `${caseId}:${token}`, sourceTable };
        return { selectors: { fixtureId: facts.id }, expectedPreState: facts, expectedPostState: facts };
      },
      probe: async (caseId, token, sourceTable, selectors) => {
        touched.push(`probe:${caseId}:${sourceTable}`);
        return { rowCount: 1, identityHash: "c".repeat(64), facts: { id: selectors.fixtureId, sourceTable } };
      },
      cleanup: async (caseId, token, selectors) => { touched.push(`cleanup:${caseId}:${selectors.fixtureId}`); },
    },
  });
  const protocol = createPhase17FixtureProtocol({ contracts: PHASE17_CASE_ACTION_CONTRACTS, adapter, createToken: () => "phase17:fixture-token-0005" });
  for (const caseId of ["library.exercise-search", "library.owned-lifecycle", "library.starter-activation", "library.custom-exercise", "library.copy-metric-migration"]) {
    const fixture = await protocol.setup(caseId);
    await protocol.probe({ caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable });
    await protocol.cleanup({ caseId, fixtureToken: fixture.fixtureToken });
  }
  assert.equal(PHASE17_FAMILY_A_CASE_IDS.length, 23);
  assert.equal(touched.filter((entry) => entry.startsWith("seed:")).length, 5);
  await assert.rejects(adapter.seed({ caseId: "library.running-detail", fixtureToken: "phase17:fixture-token-0005", sourceTable: "running_plans" }), /phase17_fixture_family_unimplemented/u);
});
