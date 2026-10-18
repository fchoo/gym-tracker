import assert from "node:assert/strict";
import test from "node:test";
import { executeLiveV12AccessibilityShard, executeV12AccessibilityShard, validateV12AccessibilityShard, verifyV12AccessibilityShard } from "./v12-accessibility-shard.mjs";
import { accessibilityEvidence, qualityIdentity } from "./testing/v12-quality-evidence-fixture.mjs";
import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";
import { createV12ShellRequirementEvidence, validateV12ShellRequirementEvidence, V12_SHELL_REQUIREMENT_REGISTRY } from "./v12-shell-requirement-evidence.mjs";

test("plans source-only accessibility observations without native execution", () => {
  const plan = executeV12AccessibilityShard({ mode: "plan" });
  assert.equal(plan.mode, "plan");
  assert.equal(plan.required_inputs.length, 4);
  assert.equal(plan.focus_ring_dp, 3);
  const identity = qualityIdentity();
  assert.equal(validateV12AccessibilityShard({ schema_version: 1, observations: accessibilityEvidence(identity) }, identity), true);
});

test("generated SHL registry exactly mirrors the Phase 14 action and postcondition contract", () => {
  assert.deepEqual(Object.entries(V12_SHELL_REQUIREMENT_REGISTRY), PHASE14_SHELL_EVIDENCE_CASES.map((entry) => [
    entry.requirement,
    { id: entry.id, action_ids: entry.actions.map(({ id }) => id), postcondition_ids: [...entry.postconditions] },
  ]));
});

test("rejects old fixture-shaped and incomplete accessibility evidence", () => {
  const identity = qualityIdentity();
  const one = accessibilityEvidence(identity).slice(0, 1);
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: one }, identity), /coverage_invalid/u);
  const overlap = accessibilityEvidence(identity); overlap[0].targets[0].bounds_dp.width = 47;
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: overlap }, identity), /targets_invalid/u);
  const duplicate = accessibilityEvidence(identity); duplicate[0].interactions[0].command_count = 2;
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: duplicate }, identity), /interactions_invalid/u);
  const motion = accessibilityEvidence(identity); motion[0].motion.destination = "other";
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: motion }, identity), /motion_invalid/u);
});

test("writes exact semantic and geometry observations while keeping attended assistive-tech paths excluded", () => {
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  const identity = qualityIdentity();
  const observations = accessibilityEvidence(identity);
  const manifest = { run_id: runId, source: { tree_sha256: identity.source_tree_sha256 },
    build: { apk: { sha256: identity.apk_sha256 } }, device: {
      installed_apk_sha256: identity.installed_apk_sha256,
      identity_sha256: identity.device_identity_sha256,
    }, fixtures: { registry_sha256: identity.fixture_sha256 } };
  const written = new Map();
  const result = executeLiveV12AccessibilityShard({ runId, manifest, observe: () => observations, write: (file, value) => written.set(file, value) });
  assert.equal(result.geometry.targets.length, observations.reduce((total, entry) => total + entry.targets.length, 0));
  assert.equal(new Set(result.geometry.targets.map(({ configuration_id }) => configuration_id)).size, 8);
  assert.deepEqual(result.semantic.excludes, ["live-talkback", "switch-scanning", "final-verdict"]);
  assert.equal(result.semantic.shell_receipts.length, 13);
  written.set(`artifacts/native/v1.2/${runId}/build.json`, manifest);
  assert.equal(verifyV12AccessibilityShard({ runId, readJson: (file) => written.get(file) }), true);
});

test("shell requirement receipts are keyed, permutation-safe, and fail closed on missing or forged members", () => {
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  const identity = qualityIdentity();
  const manifest = { run_id: runId, source: { tree_sha256: identity.source_tree_sha256 },
    build: { apk: { sha256: identity.apk_sha256 } }, device: {
      installed_apk_sha256: identity.installed_apk_sha256,
      identity_sha256: identity.device_identity_sha256,
    } };
  const receipts = createV12ShellRequirementEvidence(accessibilityEvidence(identity), manifest);
  assert.equal(validateV12ShellRequirementEvidence([...receipts].reverse(), manifest), true);
  assert.throws(() => validateV12ShellRequirementEvidence(receipts.slice(1), manifest), /count_invalid/u);
  assert.throws(() => validateV12ShellRequirementEvidence([...receipts.slice(0, -1), receipts[0]], manifest), /identity_invalid/u);
  const forged = structuredClone(receipts); forged[0].apk_sha256 = "0".repeat(64);
  assert.throws(() => validateV12ShellRequirementEvidence(forged, manifest), /identity_invalid/u);
  const stale = structuredClone(receipts); stale[0].members[0].receipt_sha256 = "0".repeat(64);
  assert.throws(() => validateV12ShellRequirementEvidence(stale, manifest), /receipt_invalid/u);
});
