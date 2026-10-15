import assert from "node:assert/strict";
import test from "node:test";
import { executeLiveV12AccessibilityShard, executeV12AccessibilityShard, validateV12AccessibilityShard, verifyV12AccessibilityShard } from "./v12-accessibility-shard.mjs";
import { accessibilityEvidence, qualityIdentity } from "./testing/v12-quality-evidence-fixture.mjs";

test("plans source-only accessibility observations without native execution", () => {
  const plan = executeV12AccessibilityShard({ mode: "plan" });
  assert.equal(plan.mode, "plan");
  assert.equal(plan.required_inputs.length, 4);
  assert.equal(plan.focus_ring_dp, 3);
  const identity = qualityIdentity();
  assert.equal(validateV12AccessibilityShard({ schema_version: 1, observations: accessibilityEvidence(identity) }, identity), true);
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
  const written = new Map();
  const result = executeLiveV12AccessibilityShard({ runId, observe: () => observations, write: (file, value) => written.set(file, value) });
  assert.equal(result.geometry.targets.length, observations.reduce((total, entry) => total + entry.targets.length, 0));
  assert.equal(new Set(result.geometry.targets.map(({ configuration_id }) => configuration_id)).size, 8);
  assert.deepEqual(result.semantic.excludes, ["live-talkback", "switch-scanning", "final-verdict"]);
  written.set(`artifacts/native/v1.2/${runId}/build.json`, { source: { tree_sha256: identity.source_tree_sha256 }, fixtures: { registry_sha256: identity.fixture_sha256 } });
  assert.equal(verifyV12AccessibilityShard({ runId, readJson: (file) => written.get(file) }), true);
});
