import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_LIBRARY_RUNNING_EVIDENCE_IDS } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
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
