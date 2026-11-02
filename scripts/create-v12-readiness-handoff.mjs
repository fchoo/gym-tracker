import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { assertV12ArtifactPrivacySafe } from "./v12-artifact-privacy.mjs";
import { verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const VERDICTS = Object.freeze(["PASS", "ACCEPTED_EXCEPTION", "NOT_RUN", "FAIL", "REVIEW_REQUIRED", "N_A_REVIEWED"]);
const REQUIRED_GATES = Object.freeze(["identity", "automated"]);
const REQUIRED_PHASE_COUNTS = Object.freeze({ "13": 17, "14": 13, "15": 36, "16": 23, "17": 36, "18": 16, "19": 18, "20": 13 });
const SAFE_RECOVERY_BOUNDARY = "compatible_restore_or_forward_fix";
export const V12_FINAL_PUBLICATION_MEMBERS = Object.freeze([
  "ui-state-matrix.json",
  "final-evidence.json",
  "parity-report.md",
  "readiness-handoff.md",
]);
const FINAL_KEYS = Object.freeze([
  "accepted_exception_count", "evidence_hashes", "evidence_origin", "exceptions", "gates", "identity",
  "policy", "readiness", "release_authorized", "rows", "run_id", "schema_version", "source_results", "verdict_counts",
]);
const HANDOFF_KEYS = Object.freeze([
  "exceptions", "final_evidence", "final_evidence_sha256", "gates", "generated_at", "identity", "policy",
  "producer", "readiness", "release_authorized", "rollback", "run_id", "schema_version", "suite", "verdict_counts",
]);

function fail(message) { throw new Error(`v12_readiness_invalid: ${message}`); }
function plain(value) { return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function keys(value, expected, label) {
  if (!plain(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(`${label} has unexpected keys.`);
}
function hash(value, label) { if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be a SHA-256 digest.`); }
function timestamp(value, label) { if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label} must be an ISO timestamp.`); }
const digest = value => createHash("sha256").update(value).digest("hex");

export function validateV12ReadinessIdentity(value) {
  keys(value, ["apk_sha256", "apk_signature_sha256", "config_sha256", "device_sha256", "installed_apk_sha256", "run_id", "source_tree_sha256"], "evidence identity");
  if (typeof value.run_id !== "string" || !RUN_ID.test(value.run_id)) fail("evidence identity run ID is malformed.");
  for (const field of ["source_tree_sha256", "apk_sha256", "apk_signature_sha256", "installed_apk_sha256", "device_sha256", "config_sha256"]) hash(value[field], `evidence identity ${field}`);
  if (value.apk_sha256 !== value.installed_apk_sha256) fail("installed APK does not match evidence APK identity.");
  return value;
}

function exception(value) {
  keys(value, ["configurations", "decided_at", "deviation_id", "evidence_hashes", "owner_decision", "rationale", "row_id", "scope"], "accepted exception");
  if (typeof value.row_id !== "string" || value.row_id.length === 0 || typeof value.deviation_id !== "string"
    || !/^DEV-(?:20-)?[0-9]{3,}$/u.test(value.deviation_id) || typeof value.owner_decision !== "string" || value.owner_decision.length < 1
    || typeof value.rationale !== "string" || value.rationale.length < 1 || typeof value.scope !== "string" || value.scope.length < 1
    || !ISO_DATE.test(value.decided_at ?? "") || !Array.isArray(value.configurations) || value.configurations.length < 1
    || value.configurations.some(item => typeof item !== "string" || item.length < 1)
    || !Array.isArray(value.evidence_hashes) || value.evidence_hashes.length < 1) fail("accepted exception metadata is malformed.");
  value.evidence_hashes.forEach(item => hash(item, "accepted exception evidence"));
  return value;
}

function policy(value, required) {
  if (value === null && !required) return null;
  keys(value, ["permits_accepted_exceptions", "policy_id", "reviewed_at", "reviewed_by"], "reviewed policy");
  if (value.permits_accepted_exceptions !== true || typeof value.policy_id !== "string" || value.policy_id.length < 1
    || typeof value.reviewed_by !== "string" || value.reviewed_by.length < 1 || !ISO_DATE.test(value.reviewed_at ?? "")) fail("reviewed policy is malformed.");
  return value;
}

function rollback(value) {
  if (plain(value) && value.status === "NOT_VERIFIED") {
    keys(value, ["reason_code", "recovery_boundary", "status"], "rollback");
    if (value.reason_code !== "rollback_evidence_missing" || value.recovery_boundary !== SAFE_RECOVERY_BOUNDARY) fail("rollback evidence state is malformed.");
    return value;
  }
  keys(value, ["clean_restore_receipt_sha256", "compatible_archive_format_version", "compatible_archive_sha256", "current_schema_version", "last_valid_schema_version", "newer_schema_committed", "post_restore_facts_sha256", "prior_apk_certificate_sha256", "prior_apk_signature_sha256", "prior_release_manifest_sha256", "prior_signed_apk_sha256", "recovery_boundary", "rollback_evidence_sha256"], "rollback");
  for (const field of ["prior_release_manifest_sha256", "prior_signed_apk_sha256", "prior_apk_signature_sha256", "prior_apk_certificate_sha256", "compatible_archive_sha256", "clean_restore_receipt_sha256", "post_restore_facts_sha256", "rollback_evidence_sha256"]) hash(value[field], `rollback ${field}`);
  if (!Number.isSafeInteger(value.last_valid_schema_version) || value.last_valid_schema_version < 1
    || !Number.isSafeInteger(value.current_schema_version) || value.current_schema_version <= value.last_valid_schema_version
    || !Number.isSafeInteger(value.compatible_archive_format_version) || value.compatible_archive_format_version < 1
    || value.newer_schema_committed !== true || value.recovery_boundary !== SAFE_RECOVERY_BOUNDARY) {
    fail("rollback boundary must require compatible restore or a forward fix after a newer schema commit.");
  }
  return value;
}

function counts(rows) {
  const result = Object.fromEntries(VERDICTS.map(verdict => [verdict, 0]));
  for (const row of rows) result[row.verdict] += 1;
  return result;
}

function sameCanonicalVerdictCounts(actual, expected, label) {
  keys(actual, VERDICTS, label);
  return VERDICTS.every(verdict => actual[verdict] === expected[verdict]);
}

/** Classify validated observation counts and gates; this never authorizes release. */
export function classifyV12Readiness({ verdict_counts: countsInput, gates: gatesInput, reviewed_policy: policyInput = null } = {}) {
  if (!plain(countsInput)) fail("readiness verdict counts must be an object.");
  if (!Array.isArray(gatesInput)) fail("readiness gates are missing.");
  const gateInputs = Array.from(gatesInput);
  for (const gate of gateInputs) if (!plain(gate)) fail("readiness gate must be an object.");
  if (policyInput !== null && !plain(policyInput)) fail("reviewed policy must be an object.");
  let snapshot;
  try { snapshot = structuredClone({ verdictCounts: countsInput, gates: gateInputs, reviewedPolicy: policyInput }); }
  catch { fail("readiness inputs cannot be snapshotted."); }
  const { verdictCounts, gates, reviewedPolicy } = snapshot;
  keys(verdictCounts, VERDICTS, "readiness verdict counts");
  if (!Object.values(verdictCounts).every(value => Number.isSafeInteger(value) && value >= 0)) fail("readiness verdict counts are malformed.");
  if (Object.values(verdictCounts).reduce((total, value) => total + value, 0) !== 172) fail("readiness verdict counts must total 172.");
  if (gates.length < REQUIRED_GATES.length) fail("readiness gates are missing.");
  const gateIds = new Set();
  for (const gate of gates) {
    keys(gate, ["evidence_sha256", "id", "verdict"], "readiness gate");
    if (typeof gate.id !== "string" || gateIds.has(gate.id) || !VERDICTS.includes(gate.verdict)) fail("readiness gate is malformed.");
    gateIds.add(gate.id); hash(gate.evidence_sha256, "readiness gate evidence");
  }
  if (REQUIRED_GATES.some(gate => !gateIds.has(gate))) fail("a required readiness gate is missing.");
  policy(reviewedPolicy, false);
  const gatesPass = gates.every(gate => gate.verdict === "PASS");
  if (!gatesPass || verdictCounts.NOT_RUN > 0 || verdictCounts.FAIL > 0 || verdictCounts.REVIEW_REQUIRED > 0 || verdictCounts.N_A_REVIEWED > 0) return "NOT_READY";
  if (verdictCounts.ACCEPTED_EXCEPTION > 0) return reviewedPolicy === null ? "NOT_READY" : "CONDITIONALLY_READY";
  return "READY";
}

/** Project validated rollback state onto readiness without granting release. */
export function classifyV12RollbackReadiness({ rollback: rollbackInput, readiness: evidenceReadiness } = {}) {
  if (!plain(rollbackInput)) fail("rollback must be an object.");
  let rollbackSnapshot;
  try { rollbackSnapshot = structuredClone(rollbackInput); } catch { fail("rollback cannot be snapshotted."); }
  const rollbackEvidence = rollback(rollbackSnapshot);
  if (!["READY", "CONDITIONALLY_READY", "NOT_READY"].includes(evidenceReadiness)) fail("rollback readiness is malformed.");
  return rollbackEvidence.status === "NOT_VERIFIED" ? "NOT_READY" : evidenceReadiness;
}

function finalEvidence(value) {
  keys(value, FINAL_KEYS, "final evidence");
  if (value.schema_version !== 3 || value.evidence_origin !== "native" || value.release_authorized !== false
    || !RUN_ID.test(value.run_id ?? "") || value.identity?.run_id !== value.run_id) fail("final evidence envelope is malformed.");
  validateV12ReadinessIdentity(value.identity);
  if (!Array.isArray(value.rows) || value.rows.length !== 172) fail("final evidence must contain exactly 172 rows.");
  const rowIds = new Set();
  const phaseCounts = Object.fromEntries(Object.keys(REQUIRED_PHASE_COUNTS).map(phase => [phase, 0]));
  for (const row of value.rows) {
    keys(row, ["coverage_class", "inventory_id", "observations", "owning_phase", "requirement_id", "verdict"], "final evidence row");
    if (typeof row.requirement_id !== "string" || row.requirement_id.length < 1 || rowIds.has(row.requirement_id)
      || typeof row.inventory_id !== "string" || !Number.isSafeInteger(row.owning_phase) || typeof row.coverage_class !== "string"
      || !Array.isArray(row.observations) || !VERDICTS.includes(row.verdict)) fail("final evidence row identifier or verdict is malformed.");
    rowIds.add(row.requirement_id);
    if (!Object.hasOwn(phaseCounts, String(row.owning_phase))) fail("final evidence phase counts are malformed.");
    phaseCounts[String(row.owning_phase)] += 1;
  }
  if (JSON.stringify(phaseCounts) !== JSON.stringify(REQUIRED_PHASE_COUNTS)) fail("final evidence phase counts are malformed.");
  if (!Array.isArray(value.gates) || value.gates.length < REQUIRED_GATES.length) fail("final evidence gates are missing.");
  const gateIds = new Set();
  for (const gate of value.gates) {
    keys(gate, ["evidence_sha256", "id", "verdict"], "final evidence gate");
    if (typeof gate.id !== "string" || gateIds.has(gate.id) || !VERDICTS.includes(gate.verdict)) fail("final evidence gate is malformed.");
    gateIds.add(gate.id); hash(gate.evidence_sha256, "final evidence gate evidence");
  }
  if (REQUIRED_GATES.some(gate => !gateIds.has(gate))) fail("a required final evidence gate is missing.");
  if (!Array.isArray(value.evidence_hashes) || value.evidence_hashes.length !== 172 || value.evidence_hashes.some(item => !SHA256.test(item))) fail("final evidence hashes are malformed.");
  if (!Array.isArray(value.source_results) || value.source_results.length !== 172
    || value.source_results.some((item, index) => item?.row_id !== value.rows[index].requirement_id
      || item.evidence_sha256 !== value.evidence_hashes[index])) fail("final evidence source results are malformed.");
  if (!Array.isArray(value.exceptions)) fail("final evidence exceptions are malformed.");
  const exceptions = value.exceptions.map(exception);
  const exceptionsByRow = new Map(exceptions.map(item => [item.row_id, item]));
  if (exceptionsByRow.size !== exceptions.length || exceptions.some(item => !rowIds.has(item.row_id))
    || value.rows.some(row => (row.verdict === "ACCEPTED_EXCEPTION") !== exceptionsByRow.has(row.requirement_id))) fail("final evidence exceptions do not match rows.");
  const expectedCounts = counts(value.rows);
  if (!sameCanonicalVerdictCounts(value.verdict_counts, expectedCounts, "final evidence verdict counts")
    || value.accepted_exception_count !== expectedCounts.ACCEPTED_EXCEPTION) fail("final evidence verdict counts are malformed.");
  const reviewedPolicy = policy(value.policy, expectedCounts.ACCEPTED_EXCEPTION > 0);
  if (value.readiness !== classifyV12Readiness({ verdict_counts: expectedCounts, gates: value.gates, reviewed_policy: reviewedPolicy })) fail("final evidence readiness is malformed.");
  return value;
}

export function buildV12ReadinessHandoff({ final_evidence: finalEvidenceInput, reviewed_policy: reviewedPolicy, rollback: rollbackInput, generated_at: generatedAt } = {}) {
  const evidence = finalEvidence(finalEvidenceInput);
  const effectivePolicy = reviewedPolicy ?? evidence.policy;
  if (JSON.stringify(effectivePolicy) !== JSON.stringify(evidence.policy)) fail("reviewed policy does not match final evidence.");
  policy(effectivePolicy, evidence.verdict_counts.ACCEPTED_EXCEPTION > 0); const rollbackEvidence = rollback(rollbackInput); timestamp(generatedAt, "handoff generated time");
  return Object.freeze({
    schema_version: 2,
    producer: "v12-readiness-handoff/v2",
    suite: "v12-readiness-handoff",
    run_id: evidence.run_id,
    generated_at: generatedAt,
    readiness: classifyV12RollbackReadiness({ rollback: rollbackEvidence, readiness: evidence.readiness }),
    release_authorized: false,
    identity: evidence.identity,
    verdict_counts: evidence.verdict_counts,
    exceptions: evidence.exceptions,
    gates: evidence.gates,
    policy: effectivePolicy,
    rollback: rollbackEvidence,
    final_evidence_sha256: digest(JSON.stringify(evidence)),
    final_evidence: evidence,
  });
}

export function validateV12ReadinessHandoff(handoff, { final_evidence: expectedFinalEvidence } = {}) {
  keys(handoff, HANDOFF_KEYS, "readiness handoff");
  if (handoff.release_authorized !== false) fail("release authorization is never granted by a readiness handoff.");
  if (handoff.schema_version !== 2 || handoff.producer !== "v12-readiness-handoff/v2" || handoff.suite !== "v12-readiness-handoff"
    || !RUN_ID.test(handoff.run_id ?? "")) fail("readiness handoff schema is malformed.");
  timestamp(handoff.generated_at, "handoff generated time");
  const evidence = finalEvidence(handoff.final_evidence); rollback(handoff.rollback);
  if (handoff.rollback.status === "NOT_VERIFIED") fail("final handoff requires verified rollback evidence.");
  if (expectedFinalEvidence !== undefined && JSON.stringify(evidence) !== JSON.stringify(finalEvidence(expectedFinalEvidence))) fail("handoff final evidence does not match retained evidence.");
  if (handoff.run_id !== evidence.run_id || JSON.stringify(handoff.identity) !== JSON.stringify(evidence.identity)
    || !sameCanonicalVerdictCounts(handoff.verdict_counts, evidence.verdict_counts, "handoff verdict counts")
    || JSON.stringify(handoff.exceptions) !== JSON.stringify(evidence.exceptions)
    || JSON.stringify(handoff.gates) !== JSON.stringify(evidence.gates)
    || JSON.stringify(handoff.policy) !== JSON.stringify(evidence.policy)
    || handoff.readiness !== classifyV12RollbackReadiness({ rollback: handoff.rollback, readiness: evidence.readiness })
    || handoff.final_evidence_sha256 !== digest(JSON.stringify(evidence))) fail("handoff does not preserve final evidence.");
  return handoff;
}

export function resolveV12ReadinessArtifact(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\")
    || path.posix.normalize(relative) !== relative || relative.split("/").some(part => !part || part === "." || part === "..")) fail("path is unsafe.");
  const base = path.resolve(root); let cursor = base;
  if (lstatSync(base).isSymbolicLink() || !lstatSync(base).isDirectory()) fail("path is unsafe.");
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined || stat.isSymbolicLink()) fail("path is unsafe.");
  }
  if (!lstatSync(cursor).isFile()) fail("path is unsafe.");
  return cursor;
}

function readJson(root, relative) {
  const bytes = readFileSync(resolveV12ReadinessArtifact(root, relative));
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("artifact is not valid JSON."); }
  assertV12ArtifactPrivacySafe(relative, bytes);
  return value;
}

function verifiedFinalPublication(root, runId) {
  const base = `artifacts/native/v1.2/${runId}`;
  try { verifyV12AtomicShard({ root, runId, shard: "final" }); }
  catch { fail("final atomic publication is invalid."); }
  const publication = readJson(root, `${base}/publication/final.json`);
  const members = publication?.members;
  if (!Array.isArray(members) || members.length !== V12_FINAL_PUBLICATION_MEMBERS.length
    || new Set(members.map(member => member?.artifact)).size !== members.length
    || [...members.map(member => member?.artifact)].sort().some((member, index) => member !== [...V12_FINAL_PUBLICATION_MEMBERS].sort()[index])) {
    fail("final atomic publication member set is invalid.");
  }
  for (const member of members) {
    if (!plain(member) || !SHA256.test(member.sha256 ?? "")
      || digest(readFileSync(resolveV12ReadinessArtifact(root, `${base}/${member.artifact}`))) !== member.sha256) fail("final atomic publication member hash is invalid.");
  }
  const evidence = readJson(root, `${base}/final-evidence.json`);
  const handoffFile = resolveV12ReadinessArtifact(root, `${base}/readiness-handoff.md`);
  const handoffBytes = readFileSync(handoffFile);
  let handoff; try { handoff = JSON.parse(handoffBytes.toString("utf8")); } catch { fail("artifact is not valid JSON."); }
  validateV12ReadinessHandoff(handoff, { final_evidence: evidence });
  return Object.freeze({ evidence, handoff, handoffBytes });
}

export function validateV12ReadinessMirrorDestination(root, directory) {
  const base = path.resolve(root);
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(`${base}${path.sep}`)) fail("path is unsafe.");
  return resolved;
}

export function writeV12VerifiedReadinessMirror({ root = process.cwd(), runId } = {}) {
  if (!RUN_ID.test(runId ?? "")) fail("CLI arguments are malformed.");
  const verified = verifiedFinalPublication(root, runId);
  const directory = validateV12ReadinessMirrorDestination(root, path.resolve(root, ".planning/phases/20-native-acceptance"));
  const base = path.resolve(root);
  let cursor = base;
  for (const part of path.relative(base, directory).split(path.sep)) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined || stat.isSymbolicLink() || !stat.isDirectory()) fail("path is unsafe.");
  }
  const target = path.join(directory, "20-READINESS-HANDOFF.md");
  const current = lstatSync(target, { throwIfNoEntry: false });
  if (current?.isSymbolicLink() || (current !== undefined && !current.isFile())) fail("path is unsafe.");
  if (current !== undefined && readFileSync(target).equals(verified.handoffBytes)) {
    return Object.freeze({ mirror_path: path.relative(base, target), refreshed: false });
  }
  const temporary = path.join(directory, `.20-READINESS-HANDOFF-${process.pid}-${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, verified.handoffBytes, { flag: "wx", mode: 0o600 });
    const fileDescriptor = openSync(temporary, "r"); try { fsyncSync(fileDescriptor); } finally { closeSync(fileDescriptor); }
    const beforeRename = lstatSync(target, { throwIfNoEntry: false });
    if (beforeRename?.isSymbolicLink() || (beforeRename !== undefined && !beforeRename.isFile())) fail("path is unsafe.");
    renameSync(temporary, target);
    const directoryDescriptor = openSync(directory, "r"); try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
  return Object.freeze({ mirror_path: path.relative(base, target), refreshed: true });
}

export function executeV12ReadinessHandoffCli(args = process.argv.slice(2), { root = process.cwd() } = {}) {
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== "--run" || !RUN_ID.test(args[1] ?? "") || args[2] !== "--verify") fail("CLI arguments are malformed.");
  const runId = args[1]; const { handoff } = verifiedFinalPublication(root, runId);
  return Object.freeze({ ok: true, run_id: runId, readiness: handoff.readiness, release_authorized: false });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try { process.stdout.write(`${JSON.stringify(executeV12ReadinessHandoffCli())}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "v12_readiness_invalid"}\n`); process.exitCode = 1; }
}
