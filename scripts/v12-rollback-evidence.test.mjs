import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  publishV12RollbackEvidence,
  verifyV12RollbackEvidence,
  V12_ROLLBACK_PUBLICATION_MEMBERS,
} from "./v12-rollback-evidence.mjs";

const runId = "phase20-20261017T000000Z-aaaaaaaaaaaa";
const sha256 = value => createHash("sha256").update(value).digest("hex");

function archive(formatVersion, schemaVersion) {
  const header = Buffer.from(JSON.stringify({ version: formatVersion, schemaVersion }));
  const prefix = Buffer.alloc(9);
  Buffer.from("GTBK").copy(prefix);
  prefix[4] = formatVersion;
  prefix.writeUInt32BE(header.length, 5);
  return Buffer.concat([prefix, header, Buffer.alloc(16, 1)]);
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "v12-rollback-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  mkdirSync(path.join(root, "src/platform/sqlite/migrations"), { recursive: true });
  writeFileSync(path.join(root, "src/platform/sqlite/migrations/0045_current.ts"), "export const version = 45;\n");
  const priorApk = path.join(root, "inputs/prior.apk");
  const compatibleArchive = path.join(root, "inputs/prior.gtbk");
  mkdirSync(path.dirname(priorApk), { recursive: true });
  writeFileSync(priorApk, Buffer.from("504b0304aabbccdd", "hex"));
  writeFileSync(compatibleArchive, archive(9, 44));
  const signatureReport = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`);
  const verifyApkSignature = () => ({ report: signatureReport, certificate_sha256: "ab".repeat(32) });
  return { root, priorApk, compatibleArchive, signatureReport, verifyApkSignature };
}

test("publishes and verifies immutable rollback evidence for a prior signed APK and compatible archive", (t) => {
  const value = fixture(t);
  const published = publishV12RollbackEvidence({
    root: value.root,
    runId,
    priorApkPath: value.priorApk,
    compatibleArchivePath: value.compatibleArchive,
    lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
  });
  assert.deepEqual(published.manifest.members.map(member => member.artifact).sort(), [...V12_ROLLBACK_PUBLICATION_MEMBERS].sort());
  const verified = verifyV12RollbackEvidence({ root: value.root, runId, verifyApkSignature: value.verifyApkSignature });
  assert.equal(verified.prior_signed_apk_sha256, sha256(readFileSync(value.priorApk)));
  assert.equal(verified.prior_apk_signature_sha256, sha256(value.signatureReport));
  assert.equal(verified.prior_apk_certificate_sha256, "ab".repeat(32));
  assert.equal(verified.compatible_archive_sha256, sha256(readFileSync(value.compatibleArchive)));
  assert.equal(verified.last_valid_schema_version, 44);
  assert.equal(verified.current_schema_version, 45);
  assert.equal(verified.newer_schema_committed, true);
  assert.match(verified.rollback_evidence_sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(publishV12RollbackEvidence({
    root: value.root,
    runId,
    priorApkPath: value.priorApk,
    compatibleArchivePath: value.compatibleArchive,
    lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
  }), published);
});

test("rollback verification rejects tampered bytes and incompatible schema boundaries", (t) => {
  const value = fixture(t);
  assert.throws(() => publishV12RollbackEvidence({
    root: value.root,
    runId,
    priorApkPath: value.priorApk,
    compatibleArchivePath: value.compatibleArchive,
    lastValidSchemaVersion: 45,
    verifyApkSignature: value.verifyApkSignature,
  }), /v12_rollback_schema_boundary_invalid/u);

  publishV12RollbackEvidence({
    root: value.root,
    runId,
    priorApkPath: value.priorApk,
    compatibleArchivePath: value.compatibleArchive,
    lastValidSchemaVersion: 44,
    verifyApkSignature: value.verifyApkSignature,
  });
  writeFileSync(path.join(value.root, `artifacts/native/v1.2/${runId}/rollback/prior-signed.apk`), Buffer.from("504b030400", "hex"));
  assert.throws(
    () => verifyV12RollbackEvidence({ root: value.root, runId, verifyApkSignature: value.verifyApkSignature }),
    /v12_(?:atomic_publish_member_invalid|rollback_artifact_invalid)/u,
  );
});
