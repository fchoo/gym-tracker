import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { publishV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
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

function immutableWrite(root, relativePath, value, write = undefined) {
  if (typeof write === "function") return write(relativePath, value);
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || existsSync(absolute)) fail("immutable_output_invalid");
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value)}\n`, { flag: "wx" });
}

/** Collects measured semantics and geometry only; TalkBack and switch scanning remain attended gates. */
export function executeLiveV12AccessibilityShard({ runId, root = process.cwd(), observe, write } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || typeof observe !== "function") fail("adapter_invalid");
  const observations = observe(Object.freeze({ run_id: runId, required_inputs: REQUIRED_INPUTS, font_scale: 2, focus_ring_dp: 3, excludes: Object.freeze(["live-talkback", "switch-scanning"]) }));
  validateV12AccessibilityShard({ schema_version: 1, observations });
  const bounded = observations.map((observation) => {
    if (observation.fixture_id !== "v12-synthetic-fixtures-r18" || observation.native_execution !== "EXECUTED"
      || observation.talkback !== undefined || observation.switch_scanning !== undefined || observation.restored_settings !== true) fail("observation_invalid");
    return Object.freeze(structuredClone(observation));
  });
  const semantic = Object.freeze({ schema_version: 1, producer: "v12-accessibility-native-observation/v1", run_id: runId, scope: "semantics-input-focus-motion", excludes: Object.freeze(["live-talkback", "switch-scanning", "final-verdict"]), observations: Object.freeze(bounded) });
  const geometry = Object.freeze({ schema_version: 1, producer: "v12-accessibility-geometry/v1", run_id: runId, targets: Object.freeze(bounded.flatMap((entry) => entry.targets.map((target) => Object.freeze({ configuration: entry.configuration, id: target.id, bounds_dp: target.bounds_dp, overlap: target.overlap })))) });
  immutableWrite(root, `artifacts/native/v1.2/${runId}/semantics/accessibility.json`, semantic, write);
  immutableWrite(root, `artifacts/native/v1.2/${runId}/geometry/hit-targets.json`, geometry, write);
  return Object.freeze({ semantic, geometry });
}

export function verifyV12AccessibilityShard({ runId, root = process.cwd(), readJson } = {}) {
  if (!V12_RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const read = readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const semantic = read(`artifacts/native/v1.2/${runId}/semantics/accessibility.json`);
  if (!semantic || semantic.run_id !== runId || semantic.producer !== "v12-accessibility-native-observation/v1" || semantic.scope !== "semantics-input-focus-motion" || !Array.isArray(semantic.excludes) || !semantic.excludes.includes("live-talkback") || !semantic.excludes.includes("switch-scanning")) fail("semantic_invalid");
  return validateV12AccessibilityShard({ schema_version: 1, observations: semantic.observations });
}

export function runV12AccessibilityCli(args = process.argv.slice(2), io = process) {
  try {
    if (args.length !== 3 || args[0] !== "--run" || !V12_RUN_ID.test(args[1] ?? "") || !["--execute", "--verify"].includes(args[2])) fail("arguments_invalid");
    if (args[2] === "--verify") verifyV12AccessibilityShard({ runId: args[1] });
    else {
      const adapter = createV12NativeAdapter();
      publishV12AtomicShard({ runId: args[1], shard: "accessibility", executionOrigin: adapter.executionOrigin, produce: ({ write }) => executeLiveV12AccessibilityShard({ runId: args[1], observe: adapter.observeAccessibility, write: (file, value) => write(file.replace(`artifacts/native/v1.2/${args[1]}/`, ""), value) }) });
    }
    io.stdout.write(`${JSON.stringify({ run_id: args[1], command: args[2], ok: true })}\n`);
    return 0;
  } catch (error) { io.stderr.write(`${error.message}\n`); return 1; }
}

if (process.argv[1]?.endsWith("v12-accessibility-shard.mjs")) process.exitCode = runV12AccessibilityCli();
