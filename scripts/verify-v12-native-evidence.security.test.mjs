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
  deriveV12Ledger,
  sealV12FinalEvidence,
  validateV12RunManifest,
  readV12FinalDeviceState,
  validateV12ProductionPublicationOrigins,
  validateV12FinalNativeIdentity,
  classifyV12FinalReadiness,
} from "./verify-v12-native-evidence.mjs";
import {
  publishV12RollbackEvidence,
  verifyV12RollbackEvidence,
  V12_ROLLBACK_PUBLICATION_MEMBERS,
} from "./v12-rollback-evidence.mjs";
import { V12_PHASE14_CLOSURE_REGISTRY } from "./v12-phase14-retention.mjs";
import { deriveV12Ledger as deriveContractLedger, loadV12ContractInputs } from "./v12-evidence-contract.mjs";

const digest = character => character.repeat(64);
const sha256 = value => createHash("sha256").update(value).digest("hex");

test("readiness classification preserves every blocker and requires reviewed exception policy",async t=>{
  const counts={NOT_RUN:0,PASS:172,FAIL:0,REVIEW_REQUIRED:0,ACCEPTED_EXCEPTION:0,N_A_REVIEWED:0};
  const policy={policy_id:"reviewed-v12-policy",reviewed_by:"owner",reviewed_at:"2026-10-17",permits_accepted_exceptions:true};
  const cases=[
    ["all passing",counts,undefined,"READY"],
    ["reviewed not applicable",{...counts,PASS:171,N_A_REVIEWED:1},undefined,"READY"],
    ["missing execution",{...counts,PASS:171,NOT_RUN:1},policy,"NOT_READY"],
    ["failed execution",{...counts,PASS:171,FAIL:1},policy,"NOT_READY"],
    ["review required",{...counts,PASS:171,REVIEW_REQUIRED:1},policy,"NOT_READY"],
    ["exception without policy",{...counts,PASS:171,ACCEPTED_EXCEPTION:1},undefined,"NOT_READY"],
    ["exception with null policy",{...counts,PASS:171,ACCEPTED_EXCEPTION:1},null,"NOT_READY"],
    ["reviewed exception",{...counts,PASS:171,ACCEPTED_EXCEPTION:1},policy,"CONDITIONALLY_READY"],
    ["exception cannot soften missing execution",{...counts,PASS:170,ACCEPTED_EXCEPTION:1,NOT_RUN:1},policy,"NOT_READY"],
    ["exception cannot soften failure",{...counts,PASS:170,ACCEPTED_EXCEPTION:1,FAIL:1},policy,"NOT_READY"],
    ["exception cannot soften review",{...counts,PASS:170,ACCEPTED_EXCEPTION:1,REVIEW_REQUIRED:1},policy,"NOT_READY"],
  ];
  for(const [name,value,reviewedPolicy,expected]of cases)await t.test(name,()=>{
    const before=structuredClone(value);assert.equal(classifyV12FinalReadiness(Object.freeze(value),reviewedPolicy),expected);assert.deepEqual(value,before);
  });
  assert.equal(classifyV12FinalReadiness(Object.assign(Object.create(null),counts)),"READY");
});

test("readiness rejects malformed count and policy DTOs rather than assuming missing counters are zero",async t=>{
  const counts={NOT_RUN:0,PASS:172,FAIL:0,REVIEW_REQUIRED:0,ACCEPTED_EXCEPTION:0,N_A_REVIEWED:0};
  const missing={...counts};delete missing.FAIL;
  for(const value of [null,undefined,[],{},missing,{...counts,extra:0},{...counts,PASS:171},{...counts,PASS:173},{...counts,PASS:-1},{...counts,PASS:1.5},{...counts,PASS:"172"},{...counts,PASS:NaN},{...counts,PASS:Infinity},{...counts,PASS:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>classifyV12FinalReadiness(value),/v12_final_readiness_counts_invalid/u);
  const policy={policy_id:"reviewed-v12-policy",reviewed_by:"owner",reviewed_at:"2026-10-17",permits_accepted_exceptions:true};
  for(const [field,value]of [["policy_id",1],["reviewed_by",1],["reviewed_at",undefined],["reviewed_at","invalid"],["permits_accepted_exceptions",false]])await t.test(field+" "+String(value),()=>{
    assert.throws(()=>classifyV12FinalReadiness(counts,{...policy,[field]:value}),/v12_final_readiness_policy_invalid/u);
  });
  assert.throws(()=>classifyV12FinalReadiness(counts,{}),/v12_final_readiness_policy_invalid/u);
});

function closeoutManifest() {
  return {
    schema_version: 1, run_id: "phase20-20261017T000000Z-aaaaaaaaaaaa", mode: "live", evidence_origin: "native", created_at: "2026-10-17T00:00:00Z",
    source: { head: "a".repeat(40), tree_sha256: digest("b"), dirty: false, package_json_sha256: digest("c"), package_lock_sha256: digest("d") },
    planning: { matrix_sha256: digest("e"), requirements_sha256: digest("f"), source_manifest_sha256: digest("1"), owner_brief_sha256: digest("2"), ui_spec_sha256: digest("3"), deviations_sha256: digest("4") },
    prototype: { revision: 18, approval_sha256: digest("5"), html_sha256: digest("6") }, fixtures: { registry_sha256: digest("7") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/app.apk", sha256: digest("8"), size_bytes: 1, page_alignment_verified: true, signature_sha256: digest("9"), certificate_sha256: digest("a") } },
    device: { identity_sha256: digest("b"), abi: "arm64-v8a", installed_apk_sha256: digest("8"), settings_sha256: digest("c"), restoration_sha256: digest("d") }, configuration: { id: "AP-L-C390-P-F100" },
  };
}

test("a retained run rejects drift in each observed identity field", () => {
  const manifest = closeoutManifest();
  const identity = {
    head: manifest.source.head, tree_sha256: manifest.source.tree_sha256, package: manifest.build.package,
    apk_sha256: manifest.build.apk.sha256, installed_apk_sha256: manifest.device.installed_apk_sha256,
    certificate_sha256: manifest.build.apk.certificate_sha256, device_identity_sha256: manifest.device.identity_sha256,
    settings_sha256: manifest.device.settings_sha256, configuration_id: manifest.configuration.id,
  };
  assert.deepEqual(validateV12RunManifest(manifest, identity), manifest);
  for (const key of Object.keys(identity)) {
    assert.throws(() => validateV12RunManifest(manifest, { ...identity, [key]: "changed" }), /v12_final_run_identity_stale/u, key);
  }
  assert.throws(() => validateV12RunManifest({ ...manifest, mode: "host-only" }), /v12_final_run_manifest_invalid/u);
  const prebuild = structuredClone(manifest);
  prebuild.mode = "prebuild_schema_fixture";
  delete prebuild.build.apk;
  delete prebuild.device;
  delete prebuild.configuration;
  assert.throws(() => validateV12RunManifest(prebuild), /v12_final_run_manifest_invalid/u);
});

test("final native identity rejects absent source, APK, device, and settings authority", () => {
  const observed = Object.fromEntries([
    "source_head", "source_tree_sha256", "apk_sha256", "apk_size_bytes", "signature_sha256",
    "certificate_sha256", "installed_apk_sha256", "device_identity_sha256", "settings_sha256",
  ].map(key => [key, undefined]));
  assert.throws(() => validateV12FinalNativeIdentity({ evidence_origin: "native" }, observed), /v12_final_native_identity_invalid/u);
  const historical = closeoutManifest();
  delete historical.evidence_origin;
  assert.throws(() => validateV12FinalNativeIdentity(historical, observed), /v12_final_native_identity_invalid/u);
  assert.throws(() => validateV12FinalNativeIdentity(closeoutManifest(), null), /v12_final_native_identity_invalid/u);
});

test("typed row evidence rejects unsafe paths and unreadable or unbound artifact bytes", () => {
  const manifest = closeoutManifest();
  const bytes = Buffer.from('{"bounded":true}\n');
  const item = { row_id: "VER-01", artifact: `artifacts/native/v1.2/${manifest.run_id}/proof/bounded.json`, sha256: sha256(bytes), result: "PASS", configuration_id: manifest.configuration.id, selector: {}, bindings: [] };
  const inputs = { matrix: { rows: [{ requirement_id: item.row_id }] } };
  const derive = (evidence, readArtifact = () => bytes) => deriveV12Ledger({ inputs, manifest, evidence, readArtifact });
  for (const artifact of [
    "artifacts/native/v1.2/other/proof/bounded.json",
    item.artifact.replace("proof/", "proof\\"),
    item.artifact.replace("proof/", "proof//"),
    item.artifact.replace("proof/", "proof/./"),
    item.artifact.replace("proof/", "proof/../"),
  ]) {
    let reads = 0;
    assert.throws(() => derive([{ ...item, artifact }], () => { reads += 1; return bytes; }), /v12_final_artifact_path_invalid/u, artifact);
    assert.equal(reads, 0);
  }
  assert.throws(() => derive([item], () => { throw Error("not readable"); }), /v12_final_artifact_read_failed/u);
  for (const actual of [bytes.toString(), Buffer.alloc(0), Buffer.from("changed")]) {
    assert.throws(() => derive([item], () => actual), /v12_final_artifact_hash_invalid/u);
  }
  const privateBytes = Buffer.from('{"email":"fixture@example.invalid"}\n');
  assert.throws(() => derive([{ ...item, sha256: sha256(privateBytes) }], () => privateBytes), /v12_final_privacy_invalid/u);
  for (const evidence of [null, [], [null], [{ ...item, result: "UNKNOWN" }], [{ ...item, row_id: "VER-02" }], [{ ...item, sha256: "bad" }], [{ ...item, configuration_id: 1 }]]) {
    assert.throws(() => derive(evidence), /v12_final_evidence_(?:set|schema)_invalid/u);
  }
  assert.throws(()=>derive([{...item,verdict:"PASS"}]),/v12_final_producer_verdict_forbidden/u);
  assert.throws(() => deriveV12Ledger({ inputs, manifest, evidence: [item] }), /v12_final_artifact_reader_required/u);
  const na = { ...item, result: "N_A_REVIEWED", na: {} };
  delete na.selector;
  delete na.bindings;
  assert.throws(() => derive([na]), /v12_final_na_metadata_invalid/u);
});

test("final device observation fails closed on invalid serials, transport errors, and ambiguous installs", () => {
  const manifest = closeoutManifest();
  for (const serial of [undefined, "", "unsafe serial", 1]) {
    let calls = 0;
    assert.throws(() => readV12FinalDeviceState(manifest, { serial, executeAdb: () => { calls += 1; return "device"; } }), /v12_preflight_final_identity_invalid/u);
    assert.equal(calls, 0);
  }
  assert.throws(() => readV12FinalDeviceState(manifest, { serial: "controlled", executeAdb: () => { throw Error("transport unavailable"); } }), /v12_preflight_final_identity_invalid/u);
  assert.throws(() => readV12FinalDeviceState(manifest, { serial: "controlled", executeAdb: () => "offline" }), /v12_preflight_final_identity_invalid/u);
  for (const installed of ["", "package:/other/base.apk", "package:/data/app/one.apk\npackage:/data/app/two.apk"]) {
    const executeAdb = (...args) => {
      if (args[0] === "get-state") return "device";
      if (args.includes("ro.product.cpu.abi")) return "arm64-v8a";
      if (args.includes("ro.build.version.sdk")) return "36";
      if (args.includes("ro.product.model")) return "controlled";
      if (args.includes("path")) return installed;
      assert.fail("ambiguous install must fail before reading installed bytes or settings");
    };
    assert.throws(() => readV12FinalDeviceState(manifest, { serial: "controlled", executeAdb }), /v12_preflight_final_identity_invalid/u);
  }
});

test("publication provenance rejects malformed shard lists and absent or invalid origin records", (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-closeout-origin-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = closeoutManifest().run_id;
  for (const shards of [null, [], ["sqlite", "sqlite"], ["unknown"]]) {
    assert.throws(() => validateV12ProductionPublicationOrigins(root, runId, shards), /v12_preflight_adapter_provenance_invalid/u);
  }
  assert.throws(() => validateV12ProductionPublicationOrigins(root, runId, ["sqlite"]), /v12_preflight_adapter_provenance_missing/u);
  const publication = path.join(root, `artifacts/native/v1.2/${runId}/publication/sqlite.json`);
  mkdirSync(path.dirname(publication), { recursive: true });
  for (const bytes of ["not json", JSON.stringify({ execution_origin: {} })]) {
    writeFileSync(publication, bytes);
    assert.throws(() => validateV12ProductionPublicationOrigins(root, runId, ["sqlite"]), /v12_preflight_adapter_provenance_(?:missing|invalid)/u);
  }
});

test("final sealing rejects mismatched runs, missing writers, and softened source blockers before writing", () => {
  const runId = closeoutManifest().run_id;
  const rows = Array.from({ length: 172 }, (_, index) => ({ requirement_id: `REQ-${index}`, verdict: "PASS" }));
  const ledger = { run_id: runId, evidence_origin: "native", rows, readiness: "READY", source_results: rows.map(row => ({ row_id: row.requirement_id, result: "PASS", selector: { type: "typed" } })) };
  let writes = 0;
  const seal = change => sealV12FinalEvidence({ mode: "final", run_id: runId, ledger, writeImmutableJson: () => { writes += 1; }, ...change });
  for (const run_id of [undefined, "invalid", "phase20-20261017T000000Z-bbbbbbbbbbbb"]) assert.throws(() => seal({ run_id }), /v12_final_seal_input_invalid/u);
  assert.throws(() => seal({ writeImmutableJson: undefined }), /v12_final_seal_input_invalid/u);
  assert.throws(() => seal({ ledger: { ...ledger, rows: [] } }), /v12_final_seal_input_invalid/u);
  assert.throws(() => seal({ ledger: { ...ledger, source_results: null } }), /v12_final_seal_source_results_invalid/u);
  assert.throws(() => seal({ ledger: { ...ledger, source_results: [] } }), /v12_final_seal_source_results_invalid/u);
  for (const update of [{ selector: null }, { row_id: "other" }, { result: "FAIL" }, { result: "NOT_RUN" }, { result: "REVIEW_REQUIRED" }]) {
    assert.throws(() => seal({ ledger: { ...ledger, source_results: [{ ...ledger.source_results[0], ...update }, ...ledger.source_results.slice(1)] } }), /v12_final_seal_source_results_invalid/u);
  }
  assert.equal(writes, 0);
});

test("interrupted final publication rejects inconsistent 172-row envelopes and incomplete handoffs", (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-closeout-recovery-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = closeoutManifest().run_id;
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  const stage = path.join(runRoot, ".staging/final");
  mkdirSync(stage, { recursive: true });
  writeFileSync(path.join(stage, "manifest.json"), "{}\n");
  const rows = Object.entries({ 13: 17, 14: 13, 15: 36, 16: 23, 17: 36, 18: 16, 19: 18, 20: 13 }).flatMap(([phase, count]) =>
    Array.from({ length: count }, (_, index) => ({ owning_phase: Number(phase), requirement_id: `REQ-${phase}-${index}`, verdict: "PASS" })));
  const finalEvidence = { rows, source_results: rows.map(row => ({ row_id: row.requirement_id })), evidence_hashes: rows.map(() => digest("a")), verdict_counts: { PASS: 172 }, readiness: "READY" };
  const matrix = { rows: structuredClone(rows), verdict_counts: { PASS: 172 }, readiness: "READY" };
  const scenarios = [
    value => { value.finalEvidence.rows = null; },
    value => { value.finalEvidence.source_results = []; },
    value => { value.finalEvidence.evidence_hashes = []; },
    value => { value.matrix.rows = null; },
    value => { value.matrix.rows[0].verdict = "FAIL"; },
    value => { value.matrix.verdict_counts.PASS = 171; },
    value => { value.matrix.readiness = "NOT_READY"; },
    value => { value.finalEvidence.rows[0].owning_phase = 99; value.matrix.rows[0].owning_phase = 99; },
    value => { value.finalEvidence.rows[0].owning_phase = 14; value.matrix.rows[0].owning_phase = 14; },
    () => {}, // A consistent envelope still needs a valid readiness handoff.
  ];
  for (const mutate of scenarios) {
    const value = structuredClone({ finalEvidence, matrix });
    mutate(value);
    writeFileSync(path.join(stage, "final-evidence.json"), `${JSON.stringify(value.finalEvidence)}\n`);
    writeFileSync(path.join(stage, "ui-state-matrix.json"), `${JSON.stringify(value.matrix)}\n`);
    writeFileSync(path.join(stage, "readiness-handoff.md"), "{}\n");
    assert.throws(() => recoverV12FinalPublication(root, runId), /v12_preflight_final_recovery_invalid/u);
    assert.equal(existsSync(path.join(runRoot, "publication/final.json")), false);
  }
  for (const bytes of ["not json", '{"email":"fixture@example.invalid"}\n']) {
    writeFileSync(path.join(stage, "final-evidence.json"), bytes);
    assert.throws(() => recoverV12FinalPublication(root, runId), /v12_preflight_final_recovery_invalid/u);
  }
  rmSync(path.join(stage, "final-evidence.json"));
  assert.throws(() => recoverV12FinalPublication(root, runId), /v12_preflight_final_recovery_invalid/u);
});

function rollbackArchive(formatVersion, schemaVersion) {
  const header = Buffer.from(JSON.stringify({ version: formatVersion, schemaVersion }));
  const prefix = Buffer.alloc(9);
  Buffer.from("GTBK").copy(prefix);
  prefix[4] = formatVersion;
  prefix.writeUInt32BE(header.length, 5);
  return Buffer.concat([prefix, header, Buffer.from("authenticated-ciphertext"), Buffer.alloc(16, 1)]);
}

function cleanRestoreInspection(archiveBytes, formatVersion = 9, schemaVersion = 44) {
  const archiveSha256 = sha256(archiveBytes);
  const canonicalPostRestoreFacts = Object.freeze({
    schema_version: 1,
    producer: "v12-canonical-post-restore-facts/v1",
    archive_sha256: archiveSha256,
    source_schema_version: schemaVersion,
    table_count: 12,
    row_count: 34,
    source_facts_sha256: digest("c"),
    reopened_facts_sha256: digest("c"),
    integrity_check: "ok",
    foreign_key_violations: 0,
  });
  return Object.freeze({
    format_version: formatVersion,
    schema_version: schemaVersion,
    clean_restore_receipt: Object.freeze({
      schema_version: 1,
      producer: "v12-production-clean-restore-receipt/v1",
      parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands",
      outcome: "restored",
      clean_target: true,
      archive_sha256: archiveSha256,
      archive_format_version: formatVersion,
      archive_schema_version: schemaVersion,
      post_restore_facts_sha256: sha256(`${JSON.stringify(canonicalPostRestoreFacts)}\n`),
      reopened_post_restore_facts_sha256: sha256(`${JSON.stringify(canonicalPostRestoreFacts)}\n`),
    }),
    canonical_post_restore_facts: canonicalPostRestoreFacts,
  });
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
  const priorReleaseManifest = path.join(root, "inputs/prior-release.json");
  mkdirSync(path.dirname(priorApk), { recursive: true });
  const apkBytes = Buffer.from("504b0304aabbccdd", "hex");
  writeFileSync(priorApk, apkBytes);
  writeFileSync(compatibleArchive, rollbackArchive(9, 44));
  const signatureReport = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`);
  writeFileSync(priorReleaseManifest, `${JSON.stringify({
    schema_version: 1,
    producer: "v12-retained-prior-release/v1",
    package: "com.fchoo.gymtracker",
    apk: {
      sha256: sha256(apkBytes),
      size_bytes: apkBytes.length,
      signature_sha256: sha256(signatureReport),
      certificate_sha256: "ab".repeat(32),
    },
  })}\n`);
  const verifyApkSignature = () => ({ report: signatureReport, certificate_sha256: "ab".repeat(32) });
  const authenticateAndRestoreArchive = ({ archive_bytes: archiveBytes }) => {
    assert.equal(archiveBytes.includes(Buffer.from("authenticated-ciphertext")), true);
    return cleanRestoreInspection(archiveBytes);
  };
  return { root, runId, priorApk, priorReleaseManifest, compatibleArchive, signatureReport,
    verifyApkSignature, authenticateAndRestoreArchive };
}

test("publishes and verifies immutable rollback evidence for a prior signed APK and compatible archive", (t) => {
  const value = rollbackFixture(t);
  const published = publishV12RollbackEvidence({
    root: value.root, runId: value.runId, priorApkPath: value.priorApk,
    priorReleaseManifestPath: value.priorReleaseManifest,
    compatibleArchivePath: value.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
    authenticateAndRestoreArchive: value.authenticateAndRestoreArchive,
  });
  assert.deepEqual(published.manifest.members.map(member => member.artifact).sort(), [...V12_ROLLBACK_PUBLICATION_MEMBERS].sort());
  const verified = verifyV12RollbackEvidence({ root: value.root, runId: value.runId, verifyApkSignature: value.verifyApkSignature });
  assert.equal(verified.prior_signed_apk_sha256, sha256(readFileSync(value.priorApk)));
  assert.equal(verified.prior_apk_signature_sha256, sha256(value.signatureReport));
  assert.equal(verified.prior_apk_certificate_sha256, "ab".repeat(32));
  assert.equal(verified.compatible_archive_sha256, sha256(readFileSync(value.compatibleArchive)));
  assert.equal(verified.prior_release_manifest_sha256, sha256(readFileSync(value.priorReleaseManifest)));
  assert.equal(verified.clean_restore_receipt_sha256, sha256(readFileSync(path.join(value.root,
    `artifacts/native/v1.2/${value.runId}/rollback/clean-restore-receipt.json`))));
  assert.equal(verified.post_restore_facts_sha256, sha256(readFileSync(path.join(value.root,
    `artifacts/native/v1.2/${value.runId}/rollback/canonical-post-restore-facts.json`))));
  assert.equal(verified.last_valid_schema_version, 44);
  assert.equal(verified.current_schema_version, 45);
  assert.equal(verified.newer_schema_committed, true);
  assert.match(verified.rollback_evidence_sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(publishV12RollbackEvidence({
    root: value.root, runId: value.runId, priorApkPath: value.priorApk,
    priorReleaseManifestPath: value.priorReleaseManifest,
    compatibleArchivePath: value.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
    authenticateAndRestoreArchive: value.authenticateAndRestoreArchive,
  }), published);
});

test("rollback publication rejects an unrelated signed APK and a header-only archive", (t) => {
  const unrelated = rollbackFixture(t);
  writeFileSync(unrelated.priorApk, Buffer.from("504b0304deadbeef", "hex"));
  assert.throws(() => publishV12RollbackEvidence({
    root: unrelated.root, runId: unrelated.runId, priorApkPath: unrelated.priorApk,
    priorReleaseManifestPath: unrelated.priorReleaseManifest,
    compatibleArchivePath: unrelated.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: unrelated.verifyApkSignature,
    authenticateAndRestoreArchive: unrelated.authenticateAndRestoreArchive,
  }), /v12_rollback_release_manifest_invalid/u);

  const headerOnly = rollbackFixture(t);
  writeFileSync(headerOnly.compatibleArchive, (() => {
    const header = Buffer.from(JSON.stringify({ version: 9, schemaVersion: 44 }));
    const prefix = Buffer.alloc(9); Buffer.from("GTBK").copy(prefix); prefix[4] = 9; prefix.writeUInt32BE(header.length, 5);
    return Buffer.concat([prefix, header, Buffer.alloc(16, 1)]);
  })());
  assert.throws(() => publishV12RollbackEvidence({
    root: headerOnly.root, runId: headerOnly.runId, priorApkPath: headerOnly.priorApk,
    priorReleaseManifestPath: headerOnly.priorReleaseManifest,
    compatibleArchivePath: headerOnly.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: headerOnly.verifyApkSignature,
    authenticateAndRestoreArchive: headerOnly.authenticateAndRestoreArchive,
  }));
});

test("rollback publication binds the declared schema to the authenticated embedded schema", (t) => {
  const value = rollbackFixture(t);
  assert.throws(() => publishV12RollbackEvidence({
    root: value.root, runId: value.runId, priorApkPath: value.priorApk,
    priorReleaseManifestPath: value.priorReleaseManifest,
    compatibleArchivePath: value.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
    authenticateAndRestoreArchive: ({ archive_bytes: archiveBytes }) => cleanRestoreInspection(archiveBytes, 9, 43),
  }), /v12_rollback_schema_boundary_invalid/u);
});

test("rollback verification rejects tampered bytes and incompatible schema boundaries", (t) => {
  const invalid = rollbackFixture(t);
  assert.throws(() => publishV12RollbackEvidence({
    root: invalid.root, runId: invalid.runId, priorApkPath: invalid.priorApk,
    priorReleaseManifestPath: invalid.priorReleaseManifest,
    compatibleArchivePath: invalid.compatibleArchive, lastValidSchemaVersion: 45,
    verifyApkSignature: invalid.verifyApkSignature,
    authenticateAndRestoreArchive: invalid.authenticateAndRestoreArchive,
  }), /v12_rollback_schema_boundary_invalid/u);

  const value = rollbackFixture(t);
  publishV12RollbackEvidence({
    root: value.root, runId: value.runId, priorApkPath: value.priorApk,
    priorReleaseManifestPath: value.priorReleaseManifest,
    compatibleArchivePath: value.compatibleArchive, lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
    authenticateAndRestoreArchive: value.authenticateAndRestoreArchive,
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

test("preseal and final expand and revalidate every retained Phase 14 accessibility member", () => {
  assert.deepEqual(V12_ARTIFACT_REGISTRY.accessibility, [
    "semantics/accessibility.json", "geometry/hit-targets.json", V12_PHASE14_CLOSURE_REGISTRY,
  ]);
  const source = readFileSync(new URL("./verify-v12-native-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /id === "accessibility" \? expectedPublicationMembers\(root, runId, id\)/u);
  assert.match(source, /verifyV12AccessibilityShard\(\{ root, runId \}\)/u);
  assert.match(source, /if \(shard === "accessibility"\)[\s\S]*expectedV12AccessibilityMembers\(registry\)/u);
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
  assert.match(source, /deriveExpectedFinalOutputs[\s\S]*deriveV12Ledger/u);
  const inputs = loadV12ContractInputs();
  const ledger = deriveContractLedger(inputs);
  assert.equal(ledger.rows.length, 172);
  assert.deepEqual(ledger.phase_counts, { 13: 17, 14: 13, 15: 36, 16: 23, 17: 36, 18: 16, 19: 18, 20: 13 });
  const missingRow = structuredClone(inputs);
  missingRow.matrix.rows.pop();
  assert.throws(() => deriveContractLedger(missingRow), /v12_contract_requirement_set_drift/u);
  const wrongPhase = structuredClone(inputs);
  wrongPhase.matrix.rows[0].owning_phase = 14;
  assert.throws(() => deriveContractLedger(wrongPhase), /v12_contract_requirement_set_drift/u);
  assert.match(source, /validateFinalCandidateBytes[\s\S]*member\.sha256 !== sha256\(bytes\)[\s\S]*member\.size_bytes !== bytes\.length/u);
});

test("final publication is verified before the planning readiness mirror is refreshed", () => {
  const source = readFileSync(new URL("./verify-v12-native-evidence.mjs", import.meta.url), "utf8");
  const finalPublish = source.lastIndexOf("publishV12AtomicShard({");
  const finalVerify = source.indexOf('verifyV12AtomicShard({ root, runId: options.run_id, shard: "final" })', finalPublish);
  const finalCandidateValidation = source.indexOf("validateFinalCandidateBytes(root, options.run_id, expectedFinal)", finalVerify);
  const planningMirror = source.indexOf("writeV12VerifiedReadinessMirror({ root, runId: options.run_id })", finalCandidateValidation);
  assert.ok(finalPublish >= 0 && finalVerify > finalPublish && finalCandidateValidation > finalVerify && planningMirror > finalCandidateValidation);
  assert.doesNotMatch(source, /beforeManifest:[^\n]*20-READINESS-HANDOFF/u);
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
      prior_release_manifest_sha256: digest("7"), prior_signed_apk_sha256: digest("8"), prior_apk_signature_sha256: digest("9"), prior_apk_certificate_sha256: digest("a"),
      compatible_archive_sha256: digest("b"), compatible_archive_format_version: 9, last_valid_schema_version: 44,
      clean_restore_receipt_sha256: digest("d"), post_restore_facts_sha256: digest("e"),
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
