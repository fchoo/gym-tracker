const SHA256 = /^[a-f0-9]{64}$/u;
const REQUIRED_INPUTS = Object.freeze(["touch", "software-keyboard", "hardware-keyboard", "dpad"]);

function fail(code) { throw new Error(`v12_accessibility_${code}`); }

export function executeV12AccessibilityShard({ mode = "plan" } = {}) {
  if (mode !== "plan") fail("native_execution_forbidden");
  return Object.freeze({ schema_version: 1, producer: "v12-accessibility-shard/v1", mode, required_inputs: REQUIRED_INPUTS, font_scale: 2, focus_ring_dp: 3, focus_offset_dp: 3, scope: "semantics-geometry-input-observation", excludes: Object.freeze(["live-talkback", "switch-scanning", "native-execution", "final-verdict"]) });
}

export function validateV12AccessibilityShard(shard) {
  if (!shard || shard.schema_version !== 1 || !Array.isArray(shard.observations) || shard.observations.length === 0) fail("shard_invalid");
  for (const observation of shard.observations) {
    const configuration = observation?.configuration;
    if (!configuration || configuration.font_scale !== 2 || !Number.isFinite(configuration.density)
      || !Number.isFinite(configuration.content_bounds?.width) || !Number.isFinite(configuration.content_bounds?.height)
      || !Number.isFinite(configuration.insets?.top) || !Number.isFinite(configuration.insets?.bottom)
      || !Number.isFinite(configuration.ime_bounds?.top) || !Number.isFinite(configuration.ime_bounds?.bottom)) fail("font_scale_invalid");
    if (!Array.isArray(observation.targets) || observation.targets.length === 0 || observation.targets.some((target) =>
      typeof target.id !== "string" || typeof target.name !== "string" || typeof target.role !== "string"
      || typeof target.state !== "string" || target.non_color_cue !== true || target.bounds_dp?.width < 48
      || target.bounds_dp?.height < 48 || (target.overlap !== false && target.bounds_dp?.overlap !== false))) fail("target_invalid");
    const targetIds = new Set();
    for (const target of observation.targets) {
      if (targetIds.has(target.id)) fail("target_invalid");
      targetIds.add(target.id);
    }
    if (!Array.isArray(observation.interactions) || observation.interactions.length !== REQUIRED_INPUTS.length
      || observation.interactions.some((entry, index) => entry?.input !== REQUIRED_INPUTS[index]
        || typeof entry.focus_before !== "string" || typeof entry.focus_after !== "string"
        || entry.action !== "activate" || entry.command_count !== 1 || !SHA256.test(entry.image_hash))) fail("interaction_invalid");
    const modal = observation.modal;
    if (!modal || modal.focus_ring_dp !== 3 || modal.focus_offset_dp !== 3 || modal.back !== "closes-modal"
      || modal.escape !== "closes-modal" || modal.restores_invoker !== true) fail("modal_invalid");
    const normal = observation.motion?.normal; const reduced = observation.motion?.reduced;
    if (!normal || !reduced || normal.destination !== reduced.destination || normal.callbacks !== reduced.callbacks
      || normal.source_facts !== reduced.source_facts) fail("motion_invalid");
  }
  return true;
}
