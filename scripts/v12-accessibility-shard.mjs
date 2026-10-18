import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { publishV12AtomicShard } from "./v12-atomic-shard-publication.mjs";
import { validateV12AccessibilityProducer } from "./v12-quality-evidence-contract.mjs";
import { createV12ShellRequirementEvidence, validateV12ShellRequirementEvidence } from "./v12-shell-requirement-evidence.mjs";

const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const REQUIRED_INPUTS = Object.freeze(["touch", "software-keyboard", "hardware-keyboard", "dpad"]);

function fail(code) { throw new Error(`v12_accessibility_${code}`); }

export function executeV12AccessibilityShard({ mode = "plan" } = {}) {
  if (mode !== "plan") fail("native_execution_forbidden");
  return Object.freeze({ schema_version: 1, producer: "v12-accessibility-shard/v1", mode, required_inputs: REQUIRED_INPUTS, font_scale: 2, focus_ring_dp: 3, focus_offset_dp: 3, scope: "semantics-geometry-input-observation", excludes: Object.freeze(["live-talkback", "switch-scanning", "native-execution", "final-verdict"]) });
}

export function validateV12AccessibilityShard(shard, identity, manifest = undefined) {
  if (!shard || shard.schema_version !== 1 || !Array.isArray(shard.observations)) fail("shard_invalid");
  const receipts = shard.observations[0]?.source_receipts;
  const expected = identity ?? { source_tree_sha256: receipts?.source_tree_sha256, fixture_sha256: receipts?.fixture_sha256 };
  validateV12AccessibilityProducer(shard.observations, expected, fail);
  if (manifest !== undefined) validateV12ShellRequirementEvidence(shard.shell_receipts, manifest);
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
export function executeLiveV12AccessibilityShard({ runId, root = process.cwd(), observe, write, manifest: suppliedManifest } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || typeof observe !== "function") fail("adapter_invalid");
  const observations = observe(Object.freeze({ run_id: runId, required_inputs: REQUIRED_INPUTS, font_scale: 2, focus_ring_dp: 3, excludes: Object.freeze(["live-talkback", "switch-scanning"]) }));
  validateV12AccessibilityShard({ schema_version: 1, observations });
  const manifest = suppliedManifest ?? JSON.parse(readFileSync(path.join(root, `artifacts/native/v1.2/${runId}/build.json`), "utf8"));
  const bounded = observations.map((observation) => {
    if (observation.native_execution !== "EXECUTED"
      || observation.talkback !== undefined || observation.switch_scanning !== undefined || observation.restored_settings !== true) fail("observation_invalid");
    return Object.freeze(structuredClone(observation));
  });
  const shellReceipts = createV12ShellRequirementEvidence(bounded, manifest);
  const semantic = Object.freeze({ schema_version: 2, producer: "v12-accessibility-native-observation/v2", run_id: runId, scope: "semantics-input-focus-motion-and-shell-requirements", excludes: Object.freeze(["live-talkback", "switch-scanning", "final-verdict"]), observations: Object.freeze(bounded), shell_receipts: shellReceipts });
  const geometry = Object.freeze({ schema_version: 1, producer: "v12-accessibility-geometry/v1", run_id: runId, targets: Object.freeze(bounded.flatMap((entry) => entry.targets.map((target) => Object.freeze({ root: entry.root, state_id: entry.state_id, configuration_id: entry.configuration.id, id: target.id, bounds_dp: target.bounds_dp, overlap: target.overlap })))) });
  immutableWrite(root, `artifacts/native/v1.2/${runId}/semantics/accessibility.json`, semantic, write);
  immutableWrite(root, `artifacts/native/v1.2/${runId}/geometry/hit-targets.json`, geometry, write);
  return Object.freeze({ semantic, geometry });
}

export function verifyV12AccessibilityShard({ runId, root = process.cwd(), readJson } = {}) {
  if (!V12_RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const read = readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const semantic = read(`artifacts/native/v1.2/${runId}/semantics/accessibility.json`);
  if (!semantic || semantic.schema_version !== 2 || semantic.run_id !== runId || semantic.producer !== "v12-accessibility-native-observation/v2" || semantic.scope !== "semantics-input-focus-motion-and-shell-requirements" || !Array.isArray(semantic.excludes) || !semantic.excludes.includes("live-talkback") || !semantic.excludes.includes("switch-scanning")) fail("semantic_invalid");
  const manifest = read(`artifacts/native/v1.2/${runId}/build.json`);
  return validateV12AccessibilityShard({ schema_version: 1, observations: semantic.observations, shell_receipts: semantic.shell_receipts }, {
    source_tree_sha256: manifest?.source?.tree_sha256,
    fixture_sha256: manifest?.fixtures?.registry_sha256,
  }, manifest);
}

export function runV12AccessibilityCli(args = process.argv.slice(2), io = process) {
  try {
    if (args.length !== 3 || args[0] !== "--run" || !V12_RUN_ID.test(args[1] ?? "") || !["--execute", "--verify"].includes(args[2])) fail("arguments_invalid");
    if (args[2] === "--verify") verifyV12AccessibilityShard({ runId: args[1] });
    else {
      const adapter = createV12NativeAdapter();
      publishV12AtomicShard({ runId: args[1], shard: "accessibility", executionOrigin: () => adapter.executionOrigin("accessibility"), produce: ({ write }) => executeLiveV12AccessibilityShard({ runId: args[1], observe: adapter.observeAccessibility, write: (file, value) => write(file.replace(`artifacts/native/v1.2/${args[1]}/`, ""), value) }) });
    }
    io.stdout.write(`${JSON.stringify({ run_id: args[1], command: args[2], ok: true })}\n`);
    return 0;
  } catch (error) { io.stderr.write(`${error.message}\n`); return 1; }
}

if (process.argv[1]?.endsWith("v12-accessibility-shard.mjs")) process.exitCode = runV12AccessibilityCli();
