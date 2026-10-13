const SHA256 = /^[a-f0-9]{64}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const VERDICTS = Object.freeze(["PASS", "ACCEPTED_EXCEPTION", "NOT_RUN", "FAIL", "REVIEW_REQUIRED", "N_A_REVIEWED"]);
const REQUIRED_GATES = Object.freeze(["identity", "automated"]);
const SAFE_RECOVERY_BOUNDARY = "compatible_restore_or_forward_fix";

function fail(message) { throw new Error(`v12_readiness_invalid: ${message}`); }
function plain(value) { return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function keys(value, expected, label) {
  if (!plain(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(`${label} has unexpected keys.`);
}
function hash(value, label) { if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be a SHA-256 digest.`); }
function timestamp(value, label) { if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label} must be an ISO timestamp.`); }
function identity(value) {
  keys(value, ["apk_sha256", "apk_signature_sha256", "config_sha256", "installed_apk_sha256", "run_id", "source_tree_sha256"], "evidence identity");
  if (typeof value.run_id !== "string" || !/^v12-samsung-acceptance-[a-z0-9-]{3,72}$/u.test(value.run_id)) fail("evidence identity run ID is malformed.");
  for (const field of ["source_tree_sha256", "apk_sha256", "apk_signature_sha256", "installed_apk_sha256", "config_sha256"]) hash(value[field], `evidence identity ${field}`);
  if (value.apk_sha256 !== value.installed_apk_sha256) fail("installed APK does not match evidence APK identity.");
  return value;
}
function evidenceHashes(value, label) { if (!Array.isArray(value) || value.length < 1) fail(`${label} must include evidence hashes.`); value.forEach((item) => hash(item, label)); }
function exception(value) {
  keys(value, ["deviation_id", "evidence_sha256", "owner_decided_at", "owner_decision", "rationale", "scope"], "accepted exception");
  if (typeof value.deviation_id !== "string" || !/^DEV-20-[0-9]{3,}$/u.test(value.deviation_id) || typeof value.owner_decision !== "string" || value.owner_decision.length < 1 || typeof value.rationale !== "string" || value.rationale.length < 1 || !Array.isArray(value.scope) || value.scope.length < 1 || value.scope.some((scope) => typeof scope !== "string" || scope.length < 1)) fail("accepted exception metadata is malformed.");
  timestamp(value.owner_decided_at, "accepted exception decision time"); evidenceHashes(value.evidence_sha256, "accepted exception evidence"); return value;
}
function finalEvidence(value) {
  keys(value, ["gates", "identity", "rows"], "final evidence"); identity(value.identity);
  if (!Array.isArray(value.rows) || value.rows.length < 1) fail("final evidence rows are missing.");
  const ids = new Set();
  for (const row of value.rows) {
    if (row?.verdict === "ACCEPTED_EXCEPTION" && !Object.hasOwn(row, "exception")) fail("accepted exception evidence is required.");
    keys(row, row?.verdict === "ACCEPTED_EXCEPTION" ? ["evidence_sha256", "exception", "id", "verdict"] : ["evidence_sha256", "id", "verdict"], "final evidence row");
    if (typeof row.id !== "string" || row.id.length < 1 || ids.has(row.id) || !VERDICTS.includes(row.verdict)) fail("final evidence row identifier or verdict is malformed.");
    ids.add(row.id); evidenceHashes(row.evidence_sha256, "final evidence row evidence"); if (row.verdict === "ACCEPTED_EXCEPTION") exception(row.exception);
  }
  if (!Array.isArray(value.gates)) fail("final evidence gates are missing.");
  const gateIds = new Set();
  for (const gate of value.gates) {
    keys(gate, ["evidence_sha256", "id", "verdict"], "final evidence gate");
    if (typeof gate.id !== "string" || gateIds.has(gate.id) || gate.verdict !== "PASS") fail("final evidence gate is malformed.");
    gateIds.add(gate.id); hash(gate.evidence_sha256, "final evidence gate evidence");
  }
  if (REQUIRED_GATES.some((gate) => !gateIds.has(gate))) fail("a required final evidence gate is missing."); return value;
}
function policy(value) {
  keys(value, ["permits_conditional_readiness", "policy_id", "reviewed_at", "reviewer"], "reviewed policy");
  if (value.permits_conditional_readiness !== true || typeof value.policy_id !== "string" || value.policy_id.length < 1 || typeof value.reviewer !== "string" || value.reviewer.length < 1) fail("reviewed policy is malformed.");
  timestamp(value.reviewed_at, "reviewed policy time"); return value;
}
function rollback(value) {
  keys(value, ["compatible_archive_sha256", "last_valid_schema_version", "newer_schema_committed", "prior_apk_signature_sha256", "prior_signed_apk_sha256", "recovery_boundary"], "rollback");
  for (const field of ["prior_signed_apk_sha256", "prior_apk_signature_sha256", "compatible_archive_sha256"]) hash(value[field], `rollback ${field}`);
  if (!Number.isSafeInteger(value.last_valid_schema_version) || value.last_valid_schema_version < 1 || value.newer_schema_committed !== true || value.recovery_boundary !== SAFE_RECOVERY_BOUNDARY) fail("rollback boundary must require compatible restore or a forward fix after a newer schema commit."); return value;
}
function counts(rows) { const result = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0])); rows.forEach((row) => { result[row.verdict] += 1; }); return result; }
function readiness(verdictCounts) {
  const total = Object.values(verdictCounts).reduce((sum, value) => sum + value, 0);
  if (verdictCounts.PASS === total) return "READY";
  return verdictCounts.ACCEPTED_EXCEPTION > 0 && verdictCounts.NOT_RUN === 0 && verdictCounts.FAIL === 0 && verdictCounts.REVIEW_REQUIRED === 0 && verdictCounts.N_A_REVIEWED === 0 ? "CONDITIONALLY_READY" : "NOT_READY";
}

export function buildV12ReadinessHandoff({ final_evidence: finalEvidenceInput, reviewed_policy: reviewedPolicy, rollback: rollbackInput, generated_at: generatedAt } = {}) {
  const evidence = finalEvidence(finalEvidenceInput); policy(reviewedPolicy); rollback(rollbackInput); timestamp(generatedAt, "handoff generated time");
  const verdictCounts = counts(evidence.rows); const exceptions = evidence.rows.filter((row) => row.verdict === "ACCEPTED_EXCEPTION").map(({ id, exception: item }) => Object.freeze({ row_id: id, ...item }));
  return Object.freeze({ schema_version: 1, suite: "v12-readiness-handoff", generated_at: generatedAt, readiness: readiness(verdictCounts), release_authorized: false, identity: evidence.identity, verdict_counts: verdictCounts, exceptions, gates: evidence.gates, reviewed_policy: reviewedPolicy, rollback: rollbackInput, final_evidence: evidence });
}

export function validateV12ReadinessHandoff(handoff) {
  keys(handoff, ["exceptions", "final_evidence", "gates", "generated_at", "identity", "readiness", "release_authorized", "reviewed_policy", "rollback", "schema_version", "suite", "verdict_counts"], "readiness handoff");
  if (handoff.schema_version !== 1 || handoff.suite !== "v12-readiness-handoff") fail("readiness handoff schema is malformed.");
  if (handoff.release_authorized !== false) fail("release authorization is never granted by a readiness handoff.");
  timestamp(handoff.generated_at, "handoff generated time"); const evidence = finalEvidence(handoff.final_evidence); policy(handoff.reviewed_policy); identity(handoff.identity); rollback(handoff.rollback);
  if (JSON.stringify(handoff.identity) !== JSON.stringify(evidence.identity)) fail("handoff identity does not match final evidence.");
  const expectedCounts = counts(evidence.rows); if (JSON.stringify(handoff.verdict_counts) !== JSON.stringify(expectedCounts)) fail("handoff verdict counts do not preserve final evidence.");
  const expectedExceptions = evidence.rows.filter((row) => row.verdict === "ACCEPTED_EXCEPTION").map(({ id, exception: item }) => ({ row_id: id, ...item }));
  if (JSON.stringify(handoff.exceptions) !== JSON.stringify(expectedExceptions)) fail("handoff exceptions do not preserve final evidence.");
  if (JSON.stringify(handoff.gates) !== JSON.stringify(evidence.gates)) fail("handoff gates do not preserve final evidence.");
  if (handoff.readiness !== readiness(expectedCounts)) fail("handoff readiness does not match preserved evidence."); return handoff;
}
