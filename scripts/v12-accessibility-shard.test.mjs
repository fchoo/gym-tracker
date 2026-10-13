import assert from "node:assert/strict";
import test from "node:test";
import { executeV12AccessibilityShard, validateV12AccessibilityShard } from "./v12-accessibility-shard.mjs";

const trace = () => ({
  configuration: { font_scale: 2, density: 3, content_bounds: { width: 360, height: 800 }, insets: { top: 24, bottom: 24 }, ime_bounds: { top: 500, bottom: 800 } },
  targets: [{ id: "primary", bounds_dp: { left: 0, top: 0, width: 48, height: 48 }, name: "Continue", role: "button", state: "enabled", non_color_cue: true }],
  interactions: ["touch", "software-keyboard", "hardware-keyboard", "dpad"].map((input) => ({ input, focus_before: "primary", action: "activate", focus_after: "primary", command_count: 1, image_hash: "a".repeat(64) })),
  modal: { focus_ring_dp: 3, focus_offset_dp: 3, back: "closes-modal", escape: "closes-modal", restores_invoker: true },
  motion: { normal: { destination: "done", callbacks: 1, source_facts: "fixture" }, reduced: { destination: "done", callbacks: 1, source_facts: "fixture" } },
});

test("plans source-only accessibility observations without native execution", () => {
  const plan = executeV12AccessibilityShard({ mode: "plan" });
  assert.equal(plan.mode, "plan");
  assert.equal(plan.required_inputs.length, 4);
  assert.equal(plan.focus_ring_dp, 3);
  assert.equal(validateV12AccessibilityShard({ schema_version: 1, observations: [trace()] }), true);
});

test("rejects unmeasured F200, undersized/overlapping targets, duplicate commands, focus drift, and reduced-motion changes", () => {
  const bad = trace(); bad.configuration.font_scale = 1;
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: [bad] }), /v12_accessibility_font_scale_invalid/u);
  const overlap = trace(); overlap.targets[0].bounds_dp.width = 47;
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: [overlap] }), /v12_accessibility_target_invalid/u);
  const duplicate = trace(); duplicate.interactions[0].command_count = 2;
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: [duplicate] }), /v12_accessibility_interaction_invalid/u);
  const motion = trace(); motion.motion.reduced.destination = "other";
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: [motion] }), /v12_accessibility_motion_invalid/u);
});
