import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_FAMILY_A_MUTATION_RECEIPTS, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
import { createPhase17FixtureProtocol, phase17ActionReceiptId } from "../src/bootstrap/phase17NativeFixture.ts";
import { PHASE17_FAMILY_A_CASE_IDS, createPhase17FamilyAFixtureAdapter, phase17FamilyASelectorSchema } from "../src/bootstrap/phase17FamilyAFixture.ts";
import { PHASE17_FAMILY_B_CASE_IDS, assertPhase17FamilyBRegistry, createPhase17FamilyFixtureAdapter, phase17FamilyBSelectorSchema } from "../src/bootstrap/phase17FamilyBFixture.ts";
import { phase17ActionEnvelopePlan, phase17ActionLabel } from "../src/bootstrap/phase17ActionEnvelope.ts";
import { validatePhase17Evidence, validatePhase17IntegrityCoverageRegistry } from "./verify-phase17-evidence.mjs";
import { PHASE17_FLOW_CASES, commandTreeForPhase17Case, createPhase17RunnerPlan, parsePhase17RunnerArgs, validatePhase17FlowSources } from "./run-phase17-maestro.mjs";

function syntheticSeed(caseId, fixtureToken, selectors = {}) {
  const contract = PHASE17_CASE_ACTION_CONTRACTS.find(({ id }) => id === caseId);
  assert.ok(contract, `missing contract for ${caseId}`);
  const expectedPreState = { caseId, state: "before" };
  const actionReceiptId = contract.proofMode === "mutating" ? phase17ActionReceiptId(caseId, fixtureToken) : null;
  return {
    selectors, expectedPreState,
    expectedPostState: actionReceiptId === null ? expectedPreState : { caseId, state: "after", actionReceiptId },
    actionReceiptId,
  };
}

const syntheticHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

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
    assert.ok(["mutating", "read_only"].includes(contract.proofMode));
    assert.equal(contract.actionReceiptRequired, contract.proofMode === "mutating");
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
  const missingReadOnlyPost = { ...flows, "maestro/phase17/library.yaml": flows["maestro/phase17/library.yaml"].replace('- assertVisible: "Instructions"', '- tapOn: "Instructions"') };
  assert.throws(() => validatePhase17FlowSources(missingReadOnlyPost, ["library.builtin-exercise"]), /phase17_flow_assertion_missing:library\.builtin-exercise/u);
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
  for (const selector of ["Review schedule collision", "Move run", "Move strength", "Keep both", "Confirm schedule change", "Calendar", "Today"]) assert.match(collision, new RegExp(selector, "u"));
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
      canonicalHash: async (value) => syntheticHash(value),
      seed: async ({ caseId, fixtureToken }) => syntheticSeed(caseId, fixtureToken, { runningPlanId: `running-${fixtureToken}`, ownedPlanId: "owned-opaque" }),
      probe: async ({ caseId, fixtureToken }) => ({ rowCount: 1, identityHash: "b".repeat(64), facts: syntheticSeed(caseId, fixtureToken).expectedPostState }),
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
      canonicalHash: async (value) => syntheticHash(value),
      seed: async ({ caseId, fixtureToken }) => syntheticSeed(caseId, fixtureToken, { ownedPlanId: "opaque-owned" }),
      probe: async ({ caseId, fixtureToken }) => ({ rowCount: 1, identityHash: "d".repeat(64), facts: syntheticSeed(caseId, fixtureToken).expectedPostState }),
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
    adapter: { baselineDigest: async () => "f".repeat(64), canonicalHash: async (value) => syntheticHash(value), seed: async ({ caseId, fixtureToken }) => syntheticSeed(caseId, fixtureToken, { ownedPlanId: "opaque" }), probe: async ({ caseId, fixtureToken }) => ({ rowCount: 1, identityHash: "f".repeat(64), facts: syntheticSeed(caseId, fixtureToken).expectedPostState }), cleanup: async () => { throw new Error("cleanup failed"); } },
  });
  const cleanupFixture = await cleanupFailure.setup("library.owned-summary");
  await assert.rejects(cleanupFailure.cleanup({ caseId: cleanupFixture.caseId, fixtureToken: cleanupFixture.fixtureToken }), /cleanup failed/u);
  assert.deepEqual(Object.keys(fixture).sort(), ["actionInputs", "actionReceiptId", "baselineDigest", "caseId", "expectedPostState", "expectedPostStateHash", "expectedPreState", "expectedPreStateHash", "fixtureToken", "proofMode", "selectors", "sourceTable"]);
  assert.equal(JSON.stringify(fixture).includes("raw-row"), false);
});

test("Phase 17 requires explicit per-case proof modes, rejects skipped or wrong mutating receipts, and never falls back to setup state", async () => {
  assert.equal(PHASE17_CASE_ACTION_CONTRACTS.length, 39);
  for (const contract of PHASE17_CASE_ACTION_CONTRACTS) {
    const token = `phase17:proof-${contract.id.replace("library.", "").replaceAll(".", "-")}-0001`;
    const seed = syntheticSeed(contract.id, token);
    if (contract.proofMode === "mutating") {
      assert.notDeepEqual(seed.expectedPreState, seed.expectedPostState, contract.id);
      assert.equal(seed.actionReceiptId, phase17ActionReceiptId(contract.id, token));
    } else {
      assert.equal(seed.actionReceiptId, null, contract.id);
      assert.ok(contract.uiReadback.length > 0, contract.id);
    }
  }
  let hashToken = 0;
  const everyCase = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS,
    createToken: () => `phase17:all-cases-${String(++hashToken).padStart(16, "0")}`,
    adapter: {
      baselineDigest: async () => "0".repeat(64), canonicalHash: async (value) => syntheticHash(value),
      seed: async ({ caseId, fixtureToken }) => syntheticSeed(caseId, fixtureToken),
      probe: async ({ caseId, fixtureToken }) => ({ rowCount: 1, identityHash: "f".repeat(64), facts: syntheticSeed(caseId, fixtureToken).expectedPostState }),
      cleanup: async () => undefined,
    },
  });
  for (const contract of PHASE17_CASE_ACTION_CONTRACTS) {
    const fixture = await everyCase.setup(contract.id);
    if (contract.proofMode === "mutating") assert.notEqual(fixture.expectedPreStateHash, fixture.expectedPostStateHash, contract.id);
    await everyCase.cleanup({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken });
  }
  const skipped = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS, createToken: () => "phase17:skipped-action-0001",
    adapter: {
      baselineDigest: async () => "1".repeat(64), canonicalHash: async (value) => syntheticHash(value),
      seed: async ({ caseId, fixtureToken }) => syntheticSeed(caseId, fixtureToken),
      probe: async ({ caseId, fixtureToken }) => ({ rowCount: 1, identityHash: "2".repeat(64), facts: syntheticSeed(caseId, fixtureToken).expectedPreState }),
      cleanup: async () => undefined,
    },
  });
  const skippedFixture = await skipped.setup("library.running-recovery");
  await assert.rejects(skipped.probe({ caseId: skippedFixture.caseId, fixtureToken: skippedFixture.fixtureToken, sourceTable: skippedFixture.sourceTable }), /phase17_fixture_probe_failed/u);

  const wrongReceipt = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS, createToken: () => "phase17:wrong-receipt-0001",
    adapter: {
      baselineDigest: async () => "3".repeat(64), canonicalHash: async (value) => syntheticHash(value),
      seed: async ({ caseId, fixtureToken }) => syntheticSeed(caseId, fixtureToken),
      probe: async ({ caseId, fixtureToken }) => ({ rowCount: 1, identityHash: "4".repeat(64), facts: { ...syntheticSeed(caseId, fixtureToken).expectedPostState, actionReceiptId: "phase17:wrong-action" } }),
      cleanup: async () => undefined,
    },
  });
  const wrongFixture = await wrongReceipt.setup("library.running-recovery");
  await assert.rejects(wrongReceipt.probe({ caseId: wrongFixture.caseId, fixtureToken: wrongFixture.fixtureToken, sourceTable: wrongFixture.sourceTable }), /phase17_fixture_probe_failed/u);
});

test("Phase 17 rejects unrelated rows, fabricated identities, wrong facts or count, and cleanup leaks", async () => {
  let digest = "1".repeat(64);
  const protocol = createPhase17FixtureProtocol({
    contracts: PHASE17_CASE_ACTION_CONTRACTS,
    createToken: () => "phase17:fixture-token-0004",
    adapter: {
      baselineDigest: async () => digest,
      canonicalHash: async () => "2".repeat(64),
      seed: async ({ caseId, fixtureToken }) => syntheticSeed(caseId, fixtureToken, { runningPlanId: "returned-running-id" }),
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
    canonicalHash: async (value) => syntheticHash(value),
    driver: {
      selectorSchema: (caseId, proofMode) => phase17FamilyASelectorSchema(caseId, proofMode),
      seed: async (caseId, token, sourceTable) => {
        touched.push(`seed:${caseId}:${sourceTable}`);
        const contract = PHASE17_CASE_ACTION_CONTRACTS.find(({ id }) => id === caseId);
        const schema = phase17FamilyASelectorSchema(caseId, contract.proofMode);
        const selectors = Object.fromEntries(schema.selectors.map((key) => [key, `${key}:${token}`]));
        const actionInputs = Object.fromEntries(schema.actionInputs.map((key) => [key, `${key}:${token}`]));
        return { ...syntheticSeed(caseId, token, selectors), ...(Object.keys(actionInputs).length === 0 ? {} : { actionInputs }) };
      },
      probe: async (caseId, token, sourceTable, selectors) => {
        touched.push(`probe:${caseId}:${sourceTable}`);
        const contract = PHASE17_CASE_ACTION_CONTRACTS.find(({ id }) => id === caseId);
        const seeded = Object.fromEntries(phase17FamilyASelectorSchema(caseId, contract.proofMode).selectors.map((key) => [key, selectors[key]]));
        return { rowCount: 1, identityHash: "c".repeat(64), facts: syntheticSeed(caseId, token, seeded).expectedPostState };
      },
      cleanup: async (caseId, token, selectors) => { touched.push(`cleanup:${caseId}:${selectors.ownedPlanId}`); },
    },
  });
  const protocol = createPhase17FixtureProtocol({ contracts: PHASE17_CASE_ACTION_CONTRACTS, adapter, createToken: () => "phase17:fixture-token-0005" });
  for (const caseId of ["library.exercise-search", "library.owned-lifecycle", "library.starter-activation", "library.custom-exercise", "library.copy-metric-migration"]) {
    const fixture = await protocol.setup(caseId);
    await protocol.probe({ caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable });
    await protocol.cleanup({ caseId, fixtureToken: fixture.fixtureToken });
  }
  assert.equal(PHASE17_FAMILY_A_CASE_IDS.length, 24);
  assert.equal(touched.filter((entry) => entry.startsWith("seed:")).length, 5);
  await assert.rejects(adapter.seed({ caseId: "library.running-detail", fixtureToken: "phase17:fixture-token-0005", sourceTable: "running_plans" }), /phase17_fixture_family_unimplemented/u);
});

test("Phase 17 Family B maps every non-collision Running ledger ID to an explicit authoritative fixture family", async () => {
  assert.equal(PHASE17_FAMILY_B_CASE_IDS.length, 14);
  assert.equal(assertPhase17FamilyBRegistry(PHASE17_CASE_ACTION_CONTRACTS), true);
  assert.equal(PHASE17_FAMILY_B_CASE_IDS.includes("library.running-conflict"), false);
  const calls = [];
  const familyA = {
    selectorSchema: (caseId, proofMode) => phase17FamilyASelectorSchema(caseId, proofMode),
    seed: async () => { throw new Error("phase17_fixture_family_unimplemented"); },
    probe: async () => { throw new Error("phase17_fixture_family_unimplemented"); },
    cleanup: async () => { throw new Error("phase17_fixture_family_unimplemented"); },
  };
  const familyB = {
    selectorSchema: (caseId) => phase17FamilyBSelectorSchema(caseId),
    seed: async (caseId, token, sourceTable) => {
      calls.push(`seed:${caseId}:${sourceTable}`);
      const schema = phase17FamilyBSelectorSchema(caseId);
      const selectors = Object.fromEntries(schema.selectors.map((key) => [key, key === "runningPlanRevision" ? "1" : `readback:${key}:${token}`]));
      const actionInputs = Object.fromEntries(schema.actionInputs.map((key) => [key, `input:${key}:${token}`]));
      return { ...syntheticSeed(caseId, token, selectors), ...(Object.keys(actionInputs).length === 0 ? {} : { actionInputs }) };
    },
    probe: async (caseId, token, sourceTable, selectors) => {
      calls.push(`probe:${caseId}:${sourceTable}`);
      return { rowCount: 1, identityHash: "c".repeat(64), facts: syntheticSeed(caseId, token).expectedPostState };
    },
    cleanup: async (caseId, token, selectors) => { calls.push(`cleanup:${caseId}:${selectors.runningPlanId}`); },
  };
  const adapter = createPhase17FamilyFixtureAdapter({ baselineDigest: async () => "a".repeat(64), canonicalHash: async (value) => syntheticHash(value), familyA, familyB });
  const protocol = createPhase17FixtureProtocol({ contracts: PHASE17_CASE_ACTION_CONTRACTS, adapter, createToken: () => "phase17:fixture-token-family-b" });
  for (const caseId of PHASE17_FAMILY_B_CASE_IDS) {
    const fixture = await protocol.setup(caseId);
    const schema = phase17FamilyBSelectorSchema(caseId);
    assert.deepEqual(Object.keys(fixture.selectors).sort(), [...schema.selectors].sort(), caseId);
    assert.deepEqual(Object.keys(fixture.actionInputs).sort(), [...schema.actionInputs].sort(), caseId);
    await protocol.probe({ caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable });
    await protocol.cleanup({ caseId, fixtureToken: fixture.fixtureToken });
  }
  assert.equal(calls.filter((call) => call.startsWith("seed:")).length, PHASE17_FAMILY_B_CASE_IDS.length);
  assert.equal(calls.filter((call) => call.startsWith("probe:")).length, PHASE17_FAMILY_B_CASE_IDS.length);
  assert.equal(calls.filter((call) => call.startsWith("cleanup:")).length, PHASE17_FAMILY_B_CASE_IDS.length);
  await assert.rejects(adapter.seed({ caseId: "library.running-conflict", fixtureToken: "phase17:fixture-token-family-b", sourceTable: "schedule_collision_projections" }), /phase17_fixture_family_unimplemented/u);
});

test("Phase 17 fixture selector schemas are exhaustive, typed, and keep action-only values out of authoritative readback", () => {
  for (const caseId of PHASE17_FAMILY_A_CASE_IDS) {
    const contract = PHASE17_CASE_ACTION_CONTRACTS.find(({ id }) => id === caseId);
    assert.ok(contract, caseId);
    const schema = phase17FamilyASelectorSchema(caseId, contract.proofMode);
    assert.deepEqual(schema.actionInputs, contract.proofMode === "mutating" ? ["phase17ActionReceiptId"] : []);
    assert.deepEqual([...new Set(schema.selectors)], schema.selectors);
    assert.ok(schema.selectors.every((key) => typeof key === "string" && key.length > 0));
  }
  for (const caseId of PHASE17_FAMILY_B_CASE_IDS) {
    const schema = phase17FamilyBSelectorSchema(caseId);
    assert.deepEqual([...new Set([...schema.selectors, ...schema.actionInputs])], [...schema.selectors, ...schema.actionInputs]);
    if (caseId === "library.running-create-zero-sessions") {
      assert.deepEqual(schema.selectors, []);
      assert.deepEqual(schema.actionInputs, ["runningPlanId"]);
    } else {
      assert.ok(schema.selectors.includes("runningPlanId"));
      assert.ok(schema.selectors.includes("runningPlanRevision"));
    }
  }
  const familyC = readFileSync("src/bootstrap/phase17FamilyCFixture.ts", "utf8");
  assert.match(familyC, /export function phase17FamilyCSelectorSchema/u);
  for (const selector of ["runningPlanId", "strengthPlanId", "runningOpportunityId", "strengthOpportunityId", "collisionToken"]) {
    assert.match(familyC, new RegExp(`${selector}\\$\\{named\\}`, "u"));
  }
  assert.match(familyC, /actionInputs: Object\.freeze\(choices\.map/u);
});

test("Phase 17 Running YAML consumes only fixture-owned Running IDs and names the complete non-collision lifecycle", () => {
  const running = readFileSync("maestro/phase17/running-authoring.yaml", "utf8");
  for (const selector of ["PHASE17_RUNNING_PLAN_ID", "PHASE17_RUNNING_SESSION_ROOT_ID", "PHASE17_RUNNING_SLOT_ROOT_ID"]) {
    assert.match(running, new RegExp(selector, "u"));
  }
  for (const action of ["Move earlier", "Delete session", "Activate plan", "Archive plan", "Reactivate plan", "Retry loading Running plan", "Retry saving Running plan"]) {
    assert.match(running, new RegExp(action, "u"));
  }
});

test("Phase 17 Running evidence plans zero-create, seven saves, and lifecycle writes in product-command order", () => {
  const token = "phase17:fixture-envelope-plan-0001";
  const zero = phase17ActionEnvelopePlan("library.running-create-zero-sessions", token);
  assert.deepEqual(zero.map(({ label }) => label), ["running-plan-create"]);
  const typed = phase17ActionEnvelopePlan("library.running-create-typed-sessions", token);
  assert.equal(typed.length, 7);
  assert.deepEqual(typed.map(({ label }) => label), Array(7).fill("running-session-save"));
  const lifecycle = phase17ActionEnvelopePlan("library.running-session-lifecycle", token);
  assert.deepEqual(lifecycle.map(({ label }) => label), ["running-lifecycle", "running-lifecycle", "running-lifecycle", "running-plan-save"]);
  assert.equal(new Set([...zero, ...typed, ...lifecycle].map(({ requestId }) => requestId)).size, 12);
  const running = readFileSync("maestro/phase17/running-authoring.yaml", "utf8");
  assert.match(running, /running\/create\?fixturePlanId=\$\{PHASE17_RUNNING_PLAN_ID\}/u);
  assert.equal((commandTreeForPhase17Case({ "maestro/phase17/running-authoring.yaml": running }, "library.running-create-typed-sessions").filter(({ value }) => value === "Save session")).length, 7);
});

test("Phase 17 Family C requires all three independent collision choices, projections, and duplicate guards", () => {
  const fixture = readFileSync("src/bootstrap/phase17FamilyCFixture.ts", "utf8");
  const yaml = readFileSync("maestro/phase17/running-authoring.yaml", "utf8");
  for (const choice of ["move_running", "move_strength", "keep_both"]) assert.match(fixture, new RegExp(`"${choice}"`, "u"));
  for (const selector of ["RUNNING_PLAN_ID_MOVE_RUNNING", "RUNNING_PLAN_ID_MOVE_STRENGTH", "RUNNING_PLAN_ID_KEEP_BOTH", "Move run", "Move strength", "Keep both"]) assert.match(yaml, new RegExp(selector, "u"));
  assert.match(fixture, /fixtures\.set\(token, byChoice\)/u);
  assert.match(fixture, /rowCount: outcomes\.length/u);
  assert.match(fixture, /phase17_collision_fixture_duplicate_event/u);
  assert.match(fixture, /schedule_collision_projections/u);
});

test("Phase 17 routes claim only the hydrated fixture envelope before real Running commands", () => {
  for (const [file, label] of [
    ["app/library/running/[planId].tsx", "running-lifecycle"],
    ["app/library/running/[planId]/session/new.tsx", "running-session-save"],
    ["app/library/running/[planId]/session/[sessionId].tsx", "running-session-save"],
  ]) {
    const source = readFileSync(file, "utf8");
    assert.ok(source.includes(`createPhase17ActionRequestId("${label}"`));
  }
  const runner = readFileSync("scripts/run-phase17-maestro.mjs", "utf8");
  const port = readFileSync("app/__phase17-maestro.tsx", "utf8");
  assert.match(runner, /phase17_action_envelope_missing/u);
  assert.match(runner, /Object\.entries\(\{ \.\.\.fixture\.selectors, \.\.\.fixture\.actionInputs \}\)/u);
  assert.match(port, /hydratePhase17ActionEnvelopes\(\{ caseId, fixtureToken \}\)/u);
  assert.match(port, /action_inputs=\$\{Object\.entries\(fixture\.actionInputs\)/u);
});

test("Phase 17 has a reachable labelled product-command path and expected receipt for every mutating ledger case", () => {
  const runtime = readFileSync("src/bootstrap/workoutAppRuntime.tsx", "utf8");
  const envelope = readFileSync("src/bootstrap/phase17ActionEnvelope.ts", "utf8");
  const runningRoutes = [
    "app/library/running/create.tsx",
    "app/library/running/[planId]/edit.tsx",
    "app/library/running/[planId].tsx",
    "app/library/running/[planId]/session/new.tsx",
    "app/library/running/[planId]/session/[sessionId].tsx",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  const impactRoutes = [
    "app/library/plan/[planId]/replace/[occurrenceId].tsx",
    "app/library/plan/[planId]/day/[dayId]/remove.tsx",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  const mutating = PHASE17_CASE_ACTION_CONTRACTS.filter(({ proofMode }) => proofMode === "mutating");
  assert.equal(mutating.length, 26);
  assert.equal(PHASE17_FAMILY_A_CASE_IDS.filter((id) => mutating.some((entry) => entry.id === id)).length, 12);
  assert.equal(PHASE17_FAMILY_B_CASE_IDS.length + 1, 15);
  for (const { id } of mutating) {
    const label = phase17ActionLabel(id);
    assert.match(envelope, new RegExp(`"${id}": "${label}"`, "u"), id);
    assert.match(envelope, /REQUEST_ID.*:action/u, id);
    assert.ok(
      new RegExp(`phase17RequestId\\([\\s\\S]{0,120}?"${label}"`, "u").test(runtime)
      || runningRoutes.includes(`createPhase17ActionRequestId("${label}"`)
      || impactRoutes.includes(`createPhase17ActionRequestId(\n            "${label}"`),
      `${id} must bind ${label} to a real product command`,
    );
  }
  assert.equal(runtime.includes("fail_closed_mutation"), false);
  assert.equal(runtime.includes("phase17_family_a_action_receipt_unverified"), false);
});

test("Phase 17 Family A names a durable source receipt and authoritative result comparator for every mutation", () => {
  const runtime = readFileSync("src/bootstrap/workoutAppRuntime.tsx", "utf8");
  const familyAMutations = PHASE17_CASE_ACTION_CONTRACTS
    .filter(({ id, proofMode }) => proofMode === "mutating" && PHASE17_FAMILY_A_CASE_IDS.includes(id));
  assert.equal(PHASE17_FAMILY_A_MUTATION_RECEIPTS.length, familyAMutations.length);
  assert.deepEqual(
    new Set(PHASE17_FAMILY_A_MUTATION_RECEIPTS.map(([caseId]) => caseId)),
    new Set(familyAMutations.map(({ id }) => id)),
  );
  for (const [caseId, receiptTable, comparator] of PHASE17_FAMILY_A_MUTATION_RECEIPTS) {
    assert.match(receiptTable, /^[a-z_]+$/u, caseId);
    assert.match(comparator, /^[a-z_]+$/u, caseId);
    assert.match(runtime, new RegExp(receiptTable, "u"), caseId);
  }
  assert.equal(runtime.includes('"nextEnvelope":1'), false);
  assert.equal(runtime.includes("library-load-retry"), false);
});
