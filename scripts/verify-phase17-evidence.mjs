import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_EVIDENCE_PATH, PHASE17_LIBRARY_RUNNING_CASES } from "../src/testing/contracts/phase17LibraryRunning.contract.ts";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const PACKAGE = "com.fchoo.gymtracker.devtest";
const fail = (code) => { throw new Error(`phase17_${code}`); };
const digest = (value) => createHash("sha256").update(value).digest("hex");
const requireHash = (value, code) => { if (!HASH.test(value ?? "")) fail(code); };
const contractById = new Map(PHASE17_CASE_ACTION_CONTRACTS.map((contract) => [contract.id, contract]));

function validateManifest(manifest) {
  if (!manifest || manifest.schema_version !== 1 || manifest.suite !== "phase17-library-running" || manifest.profile !== "development-test" || manifest.package !== PACKAGE || manifest.js_bundle?.embedded !== true || !HEAD.test(manifest.base_head ?? "")) fail("manifest_identity_invalid");
  requireHash(manifest.source_tree_sha256, "manifest_source_hash_invalid");
  requireHash(manifest.apk?.sha256, "manifest_apk_hash_invalid");
  requireHash(manifest.report_sha256, "manifest_report_hash_invalid");
  if (!manifest.apk?.path || manifest.installed_apk?.matches_retained_apk !== true || manifest.installed_apk.sha256 !== manifest.apk.sha256 || !manifest.device?.serial || !Number.isInteger(manifest.device.api_level) || !manifest.device.abi || !manifest.device.model) fail("manifest_runtime_invalid");
}

function retained(root, descriptor, code) {
  if (!descriptor?.path || !HASH.test(descriptor.sha256 ?? "") || path.isAbsolute(descriptor.path) || descriptor.path.split(/[\\/]+/u).includes("..")) fail(`${code}_path_invalid`);
  const canonicalRoot = realpathSync(root);
  const resolved = path.resolve(canonicalRoot, descriptor.path);
  const relative = path.relative(canonicalRoot, resolved);
  if (!relative || relative.startsWith("..") || !existsSync(resolved)) fail(`${code}_missing`);
  let current = canonicalRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) fail(`${code}_path_invalid`);
  }
  const bytes = readFileSync(resolved);
  if (digest(bytes) !== descriptor.sha256) fail(`${code}_hash_invalid`);
  return bytes;
}

function readArtifact(root, descriptor, code) {
  try { return JSON.parse(retained(root, descriptor, code).toString("utf8")); }
  catch (error) { if (error instanceof SyntaxError) fail(`${code}_json_invalid`); throw error; }
}

export function validatePhase17Evidence(evidence) {
  if (evidence?.schema_version !== 2 || evidence.suite !== "phase17-library-running" || evidence.status !== "passed") fail("evidence_invalid");
  validateManifest(evidence.manifest);
  if (evidence.matrix?.risk_based !== true || evidence.matrix?.cartesian_expansion !== false || evidence.matrix?.case_count !== 39 || evidence.matrix?.native_results_pending_until !== "phase20") fail("matrix_invalid");
  if (!Array.isArray(evidence.cases) || evidence.cases.length !== PHASE17_LIBRARY_RUNNING_CASES.length || new Set(evidence.cases.map((entry) => entry.id)).size !== evidence.cases.length) fail("case_count_invalid");
  for (const entry of evidence.cases) {
    const contract = contractById.get(entry.id);
    if (!contract || entry.status !== "passed" || entry.base_head !== evidence.manifest.base_head || entry.source_tree_sha256 !== evidence.manifest.source_tree_sha256) fail("case_identity_invalid");
    if (entry.runtime?.sqlite_contract !== "expo-sqlite-authoritative" || entry.runtime?.fixture_only !== false || entry.runtime?.source_setup !== "authoritative-sqlite-command" || entry.action?.trace !== contract.action || entry.postcondition?.ui_readback !== contract.uiReadback || entry.source?.probe !== contract.sourceProbe || !HASH.test(entry.source?.digest_sha256 ?? "") || entry.cleanup?.device_restored !== true || entry.cleanup?.source_restored !== true || !HASH.test(entry.cleanup?.receipt_sha256 ?? "")) fail(`case_contract_missing:${entry.id}`);
    if (!Array.isArray(entry.action?.steps) || entry.action.steps.length === 0 || !Array.isArray(entry.semantic?.nodes) || entry.semantic.nodes.length === 0 || !HASH.test(entry.raw_report_sha256 ?? "")) fail(`case_readback_missing:${entry.id}`);
    const expected = PHASE17_LIBRARY_RUNNING_CASES.find((caseEntry) => caseEntry.id === entry.id);
    if (!expected?.assertions.every((assertion) => entry.assertions?.includes(assertion))) fail(`case_assertion_missing:${entry.id}`);
  }
  return { status: "passed", cases: evidence.cases.length };
}

export function verifyPhase17EvidenceArtifacts(evidence, { root = ROOT } = {}) {
  const report = readArtifact(root, evidence.artifacts?.raw_report, "raw_report");
  if (!Array.isArray(report.cases) || digest(JSON.stringify(report)) !== evidence.manifest.report_sha256) fail("report_invalid");
  for (const entry of evidence.cases) {
    const artifacts = evidence.artifacts?.cases?.[entry.id];
    const receipt = readArtifact(root, artifacts?.receipt, "case_receipt");
    const semantic = readArtifact(root, artifacts?.semantic, "case_semantic");
    const source = readArtifact(root, artifacts?.source_probe, "case_source_probe");
    const cleanup = readArtifact(root, artifacts?.cleanup, "case_cleanup");
    if (receipt.trace !== entry.action.trace || semantic.ui_readback !== entry.postcondition.ui_readback || source.probe !== entry.source.probe || source.digest_sha256 !== entry.source.digest_sha256 || cleanup.device_restored !== true || cleanup.source_restored !== true || cleanup.receipt_sha256 !== entry.cleanup.receipt_sha256 || report.cases.filter((caseResult) => caseResult.id === entry.id && caseResult.status === "passed" && caseResult.raw_report_sha256 === entry.raw_report_sha256).length !== 1) fail(`case_artifact_binding_invalid:${entry.id}`);
  }
  return true;
}

export function validatePhase17IntegrityCoverageRegistry(source) {
  for (const file of ["src/domains/running/lifecycle.ts", "src/platform/sqlite/migrations/0038_running_plan_lifecycle_receipts.ts", "src/platform/sqlite/migrations/0039_running_session_slot_membership.ts", "src/platform/sqlite/migrations/0040_schedule_collision_outcomes.ts", "src/platform/sqlite/repositories/runningPlanRepository.ts"]) if (!source.includes(`\"${file}\"`)) fail("coverage_registry_incomplete");
  return true;
}

export function executePhase17EvidenceVerifier(args = process.argv.slice(2), root = ROOT) {
  if (args.length !== 2 || args[0] !== "--manifest" || args[1] !== "artifacts/native/phase17/build.json") fail("argument_invalid");
  const file = path.join(root, PHASE17_EVIDENCE_PATH);
  if (!existsSync(file) || lstatSync(file).isSymbolicLink()) fail("evidence_missing");
  const evidence = JSON.parse(readFileSync(file, "utf8"));
  const result = validatePhase17Evidence(evidence);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (evidence.manifest.base_head !== head || evidence.manifest.source_tree_sha256 !== sourceTreeSha256(root)) fail("current_source_mismatch");
  verifyPhase17EvidenceArtifacts(evidence, { root });
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(executePhase17EvidenceVerifier())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
