import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createV12NativeAdapter } from "./v12-native-adapter.mjs";
import { publishV12AtomicShard } from "./v12-atomic-shard-publication.mjs";
import { validateV12AccessibilityProducer } from "./v12-quality-evidence-contract.mjs";
import { validateV12ShellRequirementEvidence } from "./v12-shell-requirement-evidence.mjs";
import {
  createV12RetainedPhase14Closure,
  expectedV12AccessibilityMembers,
  verifyV12RetainedPhase14Closure,
  V12_PHASE14_CLOSURE_REGISTRY,
} from "./v12-phase14-retention.mjs";

const V12_RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const REQUIRED_INPUTS = Object.freeze(["touch", "software-keyboard", "hardware-keyboard", "dpad"]);
const jsonSha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

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
  writeFileSync(absolute, Buffer.isBuffer(value) ? value : `${JSON.stringify(value)}\n`, { flag: "wx" });
}

function retainedArtifactReader(root, runId, relative) {
  const runRoot = realpathSync(path.resolve(root, `artifacts/native/v1.2/${runId}`));
  const absolute = path.resolve(runRoot, relative);
  if (!absolute.startsWith(`${runRoot}${path.sep}`)) fail("shell_retained_path_invalid");
  let cursor = runRoot;
  for (const part of path.relative(runRoot, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined || stat.isSymbolicLink()) fail("shell_retained_path_invalid");
  }
  const real = realpathSync(absolute);
  if (!real.startsWith(`${runRoot}${path.sep}`) || !lstatSync(real).isFile()) fail("shell_retained_path_invalid");
  return readFileSync(real);
}

/** Collects measured semantics and geometry only; TalkBack and switch scanning remain attended gates. */
export function executeLiveV12AccessibilityShard({ runId, root = process.cwd(), observe, write, manifest: suppliedManifest,
  phase14Manifest: suppliedPhase14Manifest, phase14Evidence: suppliedPhase14Evidence,
  phase14ValidationOptions } = {}) {
  if (!V12_RUN_ID.test(runId ?? "") || typeof observe !== "function") fail("adapter_invalid");
  const observations = observe(Object.freeze({ run_id: runId, required_inputs: REQUIRED_INPUTS, font_scale: 2, focus_ring_dp: 3, excludes: Object.freeze(["live-talkback", "switch-scanning"]) }));
  validateV12AccessibilityShard({ schema_version: 1, observations });
  const manifest = suppliedManifest ?? JSON.parse(readFileSync(path.join(root, `artifacts/native/v1.2/${runId}/build.json`), "utf8"));
  const bounded = observations.map((observation) => {
    if (observation.native_execution !== "EXECUTED"
      || observation.talkback !== undefined || observation.switch_scanning !== undefined || observation.restored_settings !== true) fail("observation_invalid");
    return Object.freeze(structuredClone(observation));
  });
  const phase14Manifest = suppliedPhase14Manifest ?? JSON.parse(readFileSync(path.join(root, "artifacts/native/phase14/build.json"), "utf8"));
  const phase14Evidence = suppliedPhase14Evidence ?? JSON.parse(readFileSync(path.join(root, "artifacts/native/phase14/maestro/phase14-evidence.json"), "utf8"));
  const retained = createV12RetainedPhase14Closure({ root, phase14Manifest, phase14Evidence, manifest,
    validationOptions: typeof phase14ValidationOptions === "function" ? phase14ValidationOptions() : phase14ValidationOptions });
  const shellReceipts = retained.receipts;
  const semantic = Object.freeze({ schema_version: 2, producer: "v12-accessibility-native-observation/v2", run_id: runId, scope: "semantics-input-focus-motion-and-shell-requirements", excludes: Object.freeze(["live-talkback", "switch-scanning", "final-verdict"]), observations: Object.freeze(bounded), shell_receipts: shellReceipts });
  const geometry = Object.freeze({ schema_version: 1, producer: "v12-accessibility-geometry/v1", run_id: runId, targets: Object.freeze(bounded.flatMap((entry) => entry.targets.map((target) => Object.freeze({ root: entry.root, state_id: entry.state_id, configuration_id: entry.configuration.id, id: target.id, bounds_dp: target.bounds_dp, overlap: target.overlap })))) });
  immutableWrite(root, `artifacts/native/v1.2/${runId}/semantics/accessibility.json`, semantic, write);
  immutableWrite(root, `artifacts/native/v1.2/${runId}/geometry/hit-targets.json`, geometry, write);
  for (const member of retained.members) immutableWrite(root, `artifacts/native/v1.2/${runId}/${member.path}`, member.bytes, write);
  immutableWrite(root, `artifacts/native/v1.2/${runId}/${V12_PHASE14_CLOSURE_REGISTRY}`, retained.registry, write);
  return Object.freeze({ semantic, geometry });
}

export function verifyV12AccessibilityShard({ runId, root = process.cwd(), readJson, readArtifact, phase14ValidationOptions } = {}) {
  if (!V12_RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const read = readJson ?? ((file) => JSON.parse(readFileSync(path.join(root, file), "utf8")));
  const semantic = read(`artifacts/native/v1.2/${runId}/semantics/accessibility.json`);
  if (!semantic || semantic.schema_version !== 2 || semantic.run_id !== runId || semantic.producer !== "v12-accessibility-native-observation/v2" || semantic.scope !== "semantics-input-focus-motion-and-shell-requirements" || !Array.isArray(semantic.excludes) || !semantic.excludes.includes("live-talkback") || !semantic.excludes.includes("switch-scanning")) fail("semantic_invalid");
  const manifest = read(`artifacts/native/v1.2/${runId}/build.json`);
  const registry = read(`artifacts/native/v1.2/${runId}/${V12_PHASE14_CLOSURE_REGISTRY}`);
  const retainedRead = readArtifact ?? ((file) => retainedArtifactReader(root, runId, file));
  const retainedValidation = phase14ValidationOptions ?? (manifest?.evidence_origin === "test"
    ? { validatePhase14Evidence: () => true }
    : undefined);
  const { phase14Manifest, phase14Evidence } = verifyV12RetainedPhase14Closure({ registry, readArtifact: retainedRead,
    manifest, shellReceipts: semantic.shell_receipts, validationOptions: retainedValidation });
  if (!semantic.shell_receipts.every((receipt) => receipt.phase14_manifest_sha256 === jsonSha256(phase14Manifest)
    && receipt.phase14_evidence_sha256 === jsonSha256(phase14Evidence))) fail("shell_retained_source_invalid");
  return validateV12AccessibilityShard({ schema_version: 1, observations: semantic.observations, shell_receipts: semantic.shell_receipts }, {
    source_tree_sha256: manifest?.source?.tree_sha256,
    fixture_sha256: manifest?.fixtures?.registry_sha256,
  }, manifest);
}

export function validateV12AccessibilityPublicationMembers(members, stageRoot) {
  if (!Array.isArray(members) || typeof stageRoot !== "string") fail("publication_invalid");
  let registry;
  try { registry = JSON.parse(readFileSync(path.join(stageRoot, V12_PHASE14_CLOSURE_REGISTRY), "utf8")); }
  catch { fail("publication_invalid"); }
  const actual = members.map(({ artifact }) => artifact).sort();
  const expected = [...expectedV12AccessibilityMembers(registry)].sort();
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) fail("publication_invalid");
  return true;
}

export function runV12AccessibilityCli(args = process.argv.slice(2), io = process) {
  try {
    if (args.length !== 3 || args[0] !== "--run" || !V12_RUN_ID.test(args[1] ?? "") || !["--execute", "--verify"].includes(args[2])) fail("arguments_invalid");
    if (args[2] === "--verify") verifyV12AccessibilityShard({ runId: args[1] });
    else {
      const adapter = createV12NativeAdapter();
      let executionOrigin;
      publishV12AtomicShard({ runId: args[1], shard: "accessibility", executionOrigin: () => executionOrigin, produce: ({ write }) => executeLiveV12AccessibilityShard({ runId: args[1], observe: (request) => {
        const value = adapter.observeAccessibility(request);
        executionOrigin = adapter.executionOrigin("accessibility");
        return value;
      }, phase14ValidationOptions: () => executionOrigin?.test_only === true ? { validatePhase14Evidence: () => true } : undefined,
      write: (file, value) => write(file.replace(`artifacts/native/v1.2/${args[1]}/`, ""), value) }),
      validate: validateV12AccessibilityPublicationMembers });
    }
    io.stdout.write(`${JSON.stringify({ run_id: args[1], command: args[2], ok: true })}\n`);
    return 0;
  } catch (error) { io.stderr.write(`${error.message}\n`); return 1; }
}

if (process.argv[1]?.endsWith("v12-accessibility-shard.mjs")) process.exitCode = runV12AccessibilityCli();
