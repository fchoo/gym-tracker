import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  V12_ARTIFACT_REGISTRY,
  assertV12ExactArtifactFileSet,
  recoverV12FinalPublication,
  validateV12ContractSourceIdentity,
} from "./verify-v12-native-evidence.mjs";
import {
  publishV12RollbackEvidence,
  verifyV12RollbackEvidence,
  V12_ROLLBACK_PUBLICATION_MEMBERS,
} from "./v12-rollback-evidence.mjs";

const digest = character => character.repeat(64);
const sha256 = value => createHash("sha256").update(value).digest("hex");

function rollbackArchive(formatVersion, schemaVersion) {
  const header = Buffer.from(JSON.stringify({ version: formatVersion, schemaVersion }));
  const prefix = Buffer.alloc(9);
  Buffer.from("GTBK").copy(prefix);
  prefix[4] = formatVersion;
  prefix.writeUInt32BE(header.length, 5);
  return Buffer.concat([prefix, header, Buffer.alloc(16, 1)]);
}

function rollbackFixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-rollback-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = "phase20-20261017T000000Z-aaaaaaaaaaaa";
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  mkdirSync(path.join(root, "src/platform/sqlite/migrations"), { recursive: true });
  writeFileSync(path.join(root, "src/platform/sqlite/migrations/0045_current.ts"), "export const version = 45;\n");
  const priorApk = path.join(root, "inputs/prior.apk");
  const compatibleArchive = path.join(root, "inputs/prior.gtbk");
  mkdirSync(path.dirname(priorApk), { recursive: true });
  writeFileSync(priorApk, Buffer.from("504b0304aabbccdd", "hex"));
  writeFileSync(compatibleArchive, rollbackArchive(9, 44));
  const signatureReport = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`);
  const verifyApkSignature = () => ({ report: signatureReport, certificate_sha256: "ab".repeat(32) });
  return { root, runId, priorApk, compatibleArchive, signatureReport, verifyApkSignature };
}

test("publishes and verifies immutable rollback evidence for a prior signed APK and compatible archive", (t) => {
  const value = rollbackFixture(t);
  const published = publishV12RollbackEvidence({
    root: value.root, runId: value.runId, priorApkPath: value.priorApk,
    compatibleArchivePath: value.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
  });
  assert.deepEqual(published.manifest.members.map(member => member.artifact).sort(), [...V12_ROLLBACK_PUBLICATION_MEMBERS].sort());
  const verified = verifyV12RollbackEvidence({ root: value.root, runId: value.runId, verifyApkSignature: value.verifyApkSignature });
  assert.equal(verified.prior_signed_apk_sha256, sha256(readFileSync(value.priorApk)));
  assert.equal(verified.prior_apk_signature_sha256, sha256(value.signatureReport));
  assert.equal(verified.prior_apk_certificate_sha256, "ab".repeat(32));
  assert.equal(verified.compatible_archive_sha256, sha256(readFileSync(value.compatibleArchive)));
  assert.equal(verified.last_valid_schema_version, 44);
  assert.equal(verified.current_schema_version, 45);
  assert.equal(verified.newer_schema_committed, true);
  assert.match(verified.rollback_evidence_sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(publishV12RollbackEvidence({
    root: value.root, runId: value.runId, priorApkPath: value.priorApk,
    compatibleArchivePath: value.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
  }), published);
});

test("rollback verification rejects tampered bytes and incompatible schema boundaries", (t) => {
  const invalid = rollbackFixture(t);
  assert.throws(() => publishV12RollbackEvidence({
    root: invalid.root, runId: invalid.runId, priorApkPath: invalid.priorApk,
    compatibleArchivePath: invalid.compatibleArchive, lastValidSchemaVersion: 45,
    verifyApkSignature: invalid.verifyApkSignature,
  }), /v12_rollback_schema_boundary_invalid/u);

  const value = rollbackFixture(t);
  publishV12RollbackEvidence({
    root: value.root, runId: value.runId, priorApkPath: value.priorApk,
    compatibleArchivePath: value.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
  });
  writeFileSync(path.join(value.root, `artifacts/native/v1.2/${value.runId}/rollback/prior-signed.apk`), Buffer.from("504b030400", "hex"));
  assert.throws(
    () => verifyV12RollbackEvidence({ root: value.root, runId: value.runId, verifyApkSignature: value.verifyApkSignature }),
    /v12_(?:atomic_publish_member_invalid|rollback_artifact_invalid)/u,
  );
});

test("native artifact and provenance coverage includes every declared Maestro shard", () => {
  assert.deepEqual(Object.keys(V12_ARTIFACT_REGISTRY), [
    "sqlite", "recovery", "garmin", "calendar", "multi-plan", "workout", "library-running", "visual", "accessibility", "performance",
  ]);
});

test("preseal and final verification share the retained absolute Git attestation", () => {
  const source = readFileSync(new URL("./verify-v12-native-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /const gitExecution = readV12RetainedGitExecution\(\{ root, runManifest: manifest \}\);/u);
  assert.match(source, /validateV12LiveSourceLineage\(manifest, \{ root, gitExecution \}\)/u);
  assert.match(source, /git_attestation_sha256: gitExecution\.retained_sha256/u);
  assert.match(source, /preseal\.git_attestation_sha256 !== gitExecution\.retained_sha256/u);
  assert.match(source, /validateV12FinalProductionIdentity\(manifest, \{ root, gitExecution \}\)/u);
  assert.match(source, /verifyV12FinalNativeIdentity\(manifest, \{ root, gitExecution \}\)/u);
  assert.doesNotMatch(source, /execFileSync\(["']git["']/u);
});

test("final mode verifies and passes immutable rollback evidence instead of hardcoding a missing state", () => {
  const source = readFileSync(new URL("./verify-v12-native-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /const rollbackEvidence = verifyV12RollbackEvidence\(\{ root, runId: options\.run_id \}\);/u);
  assert.match(source, /rollback: rollbackEvidence/u);
  assert.doesNotMatch(source, /rollback:\s*Object\.freeze\(\{ status: "NOT_VERIFIED"/u);
});

test("interrupted final recovery revalidates preseal authorities and rederives the canonical ledger", () => {
  const source = readFileSync(new URL("./verify-v12-native-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /function finalRecoveryAuthorities[\s\S]*verifyV12AtomicShard[\s\S]*preflightValidateArtifacts[\s\S]*v12ContractSourceDigests[\s\S]*deriveExpectedFinalOutputs/u);
  assert.match(source, /deriveExpectedFinalOutputs[\s\S]*deriveV12Ledger[\s\S]*ledger\.rows\.length !== 172[\s\S]*ledger\.phase_counts/u);
  assert.match(source, /validateFinalCandidateBytes[\s\S]*member\.sha256 !== sha256\(bytes\)[\s\S]*member\.size_bytes !== bytes\.length/u);
});

test("exact retained file-set validation rejects arbitrary extras", () => {
  const expected = ["build.json", "publication/sqlite.json", "sqlite/history.json"];
  assert.equal(assertV12ExactArtifactFileSet(expected, expected), true);
  assert.throws(
    () => assertV12ExactArtifactFileSet([...expected, "private-source-rows.json"], expected),
    /v12_preflight_artifact_set_invalid/u,
  );
});

test("preseal and final contract identity compares planning, prototype, and fixture hashes exactly", () => {
  const manifest = {
    planning: { matrix_sha256: digest("1"), requirements_sha256: digest("2"), source_manifest_sha256: digest("3"), owner_brief_sha256: digest("4"), ui_spec_sha256: digest("5"), deviations_sha256: digest("6") },
    prototype: { revision: 18, approval_sha256: digest("7"), html_sha256: digest("8") },
    fixtures: { registry_sha256: digest("9") },
  };
  assert.equal(validateV12ContractSourceIdentity(manifest, structuredClone({ planning: manifest.planning, prototype: manifest.prototype, fixtures: manifest.fixtures })), true);
  assert.throws(
    () => validateV12ContractSourceIdentity(manifest, { planning: { ...manifest.planning, requirements_sha256: digest("0") }, prototype: manifest.prototype, fixtures: manifest.fixtures }),
    /v12_preflight_contract_identity_invalid/u,
  );
});

test("interrupted final recovery rejects a staged one-row seal before publication", (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-final-recovery-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = "phase20-20261017T000000Z-aaaaaaaaaaaa";
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  const stage = path.join(runRoot, ".staging/final");
  mkdirSync(stage, { recursive: true });
  const identity = { run_id: runId, source_tree_sha256: digest("1"), apk_sha256: digest("2"), apk_signature_sha256: digest("3"), installed_apk_sha256: digest("2"), device_sha256: digest("4"), config_sha256: digest("5") };
  const finalEvidence = {
    schema_version: 3, run_id: runId, evidence_origin: "native", identity,
    rows: [{ inventory_id: "INV-001", requirement_id: "VER-01", owning_phase: 20, coverage_class: "automated", verdict: "PASS", observations: [] }],
    source_results: [], evidence_hashes: [],
    gates: [{ id: "identity", verdict: "PASS", evidence_sha256: digest("6") }, { id: "automated", verdict: "PASS", evidence_sha256: digest("7") }],
    readiness: "READY", verdict_counts: { PASS: 1, ACCEPTED_EXCEPTION: 0, NOT_RUN: 0, FAIL: 0, REVIEW_REQUIRED: 0, N_A_REVIEWED: 0 },
    accepted_exception_count: 0, release_authorized: false, policy: null, exceptions: [],
  };
  const rollback = {
      prior_signed_apk_sha256: digest("8"), prior_apk_signature_sha256: digest("9"), prior_apk_certificate_sha256: digest("a"),
      compatible_archive_sha256: digest("b"), compatible_archive_format_version: 9, last_valid_schema_version: 44,
      current_schema_version: 45, newer_schema_committed: true, recovery_boundary: "compatible_restore_or_forward_fix",
      rollback_evidence_sha256: digest("c"),
  };
  const handoff = {
    schema_version: 2, producer: "v12-readiness-handoff/v2", suite: "v12-readiness-handoff", run_id: runId,
    generated_at: "2026-10-17T00:00:00.000Z", readiness: "READY", release_authorized: false, identity,
    verdict_counts: finalEvidence.verdict_counts, exceptions: [], gates: finalEvidence.gates, policy: null, rollback,
    final_evidence_sha256: createHash("sha256").update(JSON.stringify(finalEvidence)).digest("hex"), final_evidence: finalEvidence,
  };
  const values = {
    "ui-state-matrix.json": { schema_version: 3, run_id: runId, release_authorized: false },
    "final-evidence.json": finalEvidence,
    "parity-report.md": "Phase 20 parity report\n",
    "readiness-handoff.md": handoff,
  };
  const members = [];
  for (const [artifact, value] of Object.entries(values)) {
    const bytes = Buffer.from(typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
    writeFileSync(path.join(stage, artifact), bytes);
    members.push({ artifact, sha256: createHash("sha256").update(bytes).digest("hex"), size_bytes: bytes.length });
  }
  const manifest = { schema_version: 1, producer: "v12-atomic-shard-publication/v1", run_id: runId, shard: "final", identity: null, members, completed: true };
  writeFileSync(path.join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`);

  assert.throws(() => recoverV12FinalPublication(root, runId), /v12_preflight_final_recovery_invalid/u);
  assert.equal(existsSync(path.join(runRoot, "publication/final.json")), false);
  assert.equal(existsSync(path.join(runRoot, ".staging")), true);
  const planningHandoff = path.join(root, ".planning/phases/20-native-acceptance/20-READINESS-HANDOFF.md");
  assert.equal(existsSync(planningHandoff), false);
});
