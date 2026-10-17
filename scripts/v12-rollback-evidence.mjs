#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { publishV12AtomicShard, verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";
import { resolveV12NativeExecutionTools } from "./v12-native-execution-origin.mjs";

const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const APK_MAGIC = Buffer.from("504b0304", "hex");
const ARCHIVE_MAGIC = Buffer.from("GTBK");
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const RECOVERY_BOUNDARY = "compatible_restore_or_forward_fix";

export const V12_ROLLBACK_PUBLICATION_MEMBERS = Object.freeze([
  "rollback/prior-signed.apk",
  "rollback/prior-apk-signature.txt",
  "rollback/compatible-archive.gtbk",
  "rollback/rollback-evidence.json",
]);

function fail(code) { throw new Error(`v12_rollback_${code}`); }
const sha256 = value => createHash("sha256").update(value).digest("hex");
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function regularFile(file, code = "artifact_invalid") {
  if (typeof file !== "string" || !path.isAbsolute(file)) fail(code);
  let resolved;
  try {
    if (lstatSync(file).isSymbolicLink()) fail(code);
    resolved = realpathSync(file);
    if (!lstatSync(resolved).isFile()) fail(code);
  } catch (error) {
    if (error instanceof Error && error.message === `v12_rollback_${code}`) throw error;
    fail(code);
  }
  return resolved;
}

function retainedFile(root, relative) {
  const base = realpathSync(root); let cursor = base;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined || stat.isSymbolicLink()) fail("artifact_invalid");
  }
  if (!lstatSync(cursor).isFile()) fail("artifact_invalid");
  return cursor;
}

function archiveFormat(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 26 || bytes.length > MAX_ARCHIVE_BYTES
    || !bytes.subarray(0, 4).equals(ARCHIVE_MAGIC)) fail("archive_invalid");
  const version = bytes[4];
  const headerLength = bytes.readUInt32BE(5);
  if (!Number.isSafeInteger(version) || version < 1 || version > 10 || headerLength < 2
    || 9 + headerLength + 16 > bytes.length || headerLength > 16 * 1024) fail("archive_invalid");
  let header;
  try { header = JSON.parse(bytes.subarray(9, 9 + headerLength).toString("utf8")); }
  catch { fail("archive_invalid"); }
  if (!plain(header) || header.version !== version) fail("archive_invalid");
  return version;
}

function archiveSupportsSchema(formatVersion, schemaVersion) {
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) return false;
  if (formatVersion === 10) return schemaVersion === 45;
  if (formatVersion === 9) return schemaVersion === 43 || schemaVersion === 44;
  if (formatVersion === 8) return schemaVersion === 42;
  if (formatVersion === 7) return schemaVersion === 40 || schemaVersion === 41;
  if (formatVersion === 6) return schemaVersion >= 36 && schemaVersion <= 39;
  if (formatVersion === 5) return schemaVersion === 31;
  if (formatVersion === 4) return schemaVersion === 29 || schemaVersion === 30;
  if (formatVersion === 3) return schemaVersion === 28;
  return schemaVersion < 28;
}

function currentSchemaVersion(root) {
  let entries;
  try { entries = readdirSync(path.join(root, "src/platform/sqlite/migrations")); }
  catch { fail("schema_boundary_invalid"); }
  const versions = entries.map(name => Number(/^([0-9]{4})_[a-z0-9_]+\.ts$/u.exec(name)?.[1])).filter(Number.isSafeInteger);
  if (versions.length === 0) fail("schema_boundary_invalid");
  return Math.max(...versions);
}

function signatureFor(apkPath, { verifyApkSignature, environment = process.env } = {}) {
  if (typeof verifyApkSignature === "function") return verifyApkSignature(apkPath);
  const tools = resolveV12NativeExecutionTools({ requiredTools: ["apksigner"], env: environment });
  const result = spawnSync(tools.apksigner, ["verify", "--verbose", "--print-certs", apkPath], {
    encoding: null,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.signal || result.status !== 0) fail("signature_invalid");
  const report = Buffer.from(result.stdout ?? Buffer.alloc(0));
  const text = report.toString("utf8");
  const certificate = /certificate SHA-256 digest:\s*([A-Fa-f0-9:]{64,95})/u.exec(text)?.[1]?.replaceAll(":", "").toLowerCase();
  if (!text.includes("Verified using v2 scheme (APK Signature Scheme v2): true") || !HASH.test(certificate ?? "")) fail("signature_invalid");
  return Object.freeze({ report, certificate_sha256: certificate });
}

function validateSignature(value) {
  if (!plain(value) || !Buffer.isBuffer(value.report) || value.report.length === 0 || !HASH.test(value.certificate_sha256 ?? "")) fail("signature_invalid");
  const text = value.report.toString("utf8");
  if (!text.includes("Verified using v2 scheme (APK Signature Scheme v2): true")) fail("signature_invalid");
  const certificate = /certificate SHA-256 digest:\s*([A-Fa-f0-9:]{64,95})/u.exec(text)?.[1]?.replaceAll(":", "").toLowerCase();
  if (certificate !== value.certificate_sha256) fail("signature_invalid");
  return value;
}

function evidenceValue({ runId, apkBytes, signature, archiveBytes, formatVersion, lastValidSchemaVersion, currentVersion }) {
  if (!archiveSupportsSchema(formatVersion, lastValidSchemaVersion) || currentVersion <= lastValidSchemaVersion) fail("schema_boundary_invalid");
  return Object.freeze({
    schema_version: 1,
    producer: "v12-rollback-evidence/v1",
    run_id: runId,
    prior_signed_apk: Object.freeze({
      path: `artifacts/native/v1.2/${runId}/rollback/prior-signed.apk`,
      sha256: sha256(apkBytes),
      size_bytes: apkBytes.length,
      signature_sha256: sha256(signature.report),
      certificate_sha256: signature.certificate_sha256,
    }),
    compatible_archive: Object.freeze({
      path: `artifacts/native/v1.2/${runId}/rollback/compatible-archive.gtbk`,
      sha256: sha256(archiveBytes),
      size_bytes: archiveBytes.length,
      format_version: formatVersion,
      schema_version: lastValidSchemaVersion,
    }),
    schema_boundary: Object.freeze({
      current_schema_version: currentVersion,
      last_valid_schema_version: lastValidSchemaVersion,
      newer_schema_committed: true,
      recovery_boundary: RECOVERY_BOUNDARY,
    }),
  });
}

function validateEvidenceShape(value, runId, root) {
  if (!exact(value, ["schema_version", "producer", "run_id", "prior_signed_apk", "compatible_archive", "schema_boundary"])
    || value.schema_version !== 1 || value.producer !== "v12-rollback-evidence/v1" || value.run_id !== runId
    || !exact(value.prior_signed_apk, ["path", "sha256", "size_bytes", "signature_sha256", "certificate_sha256"])
    || !exact(value.compatible_archive, ["path", "sha256", "size_bytes", "format_version", "schema_version"])
    || !exact(value.schema_boundary, ["current_schema_version", "last_valid_schema_version", "newer_schema_committed", "recovery_boundary"])) fail("evidence_invalid");
  const apk = value.prior_signed_apk; const archive = value.compatible_archive; const boundary = value.schema_boundary;
  if (apk.path !== `artifacts/native/v1.2/${runId}/rollback/prior-signed.apk`
    || archive.path !== `artifacts/native/v1.2/${runId}/rollback/compatible-archive.gtbk`
    || ![apk.sha256, apk.signature_sha256, apk.certificate_sha256, archive.sha256].every(hash => HASH.test(hash ?? ""))
    || !Number.isSafeInteger(apk.size_bytes) || apk.size_bytes < 4 || !Number.isSafeInteger(archive.size_bytes) || archive.size_bytes < 26
    || !Number.isSafeInteger(archive.format_version) || !Number.isSafeInteger(archive.schema_version)
    || boundary.current_schema_version !== currentSchemaVersion(root)) fail("evidence_invalid");
  if (boundary.last_valid_schema_version !== archive.schema_version || boundary.current_schema_version <= boundary.last_valid_schema_version
    || boundary.newer_schema_committed !== true || boundary.recovery_boundary !== RECOVERY_BOUNDARY
    || !archiveSupportsSchema(archive.format_version, archive.schema_version)) fail("schema_boundary_invalid");
  return value;
}

export function publishV12RollbackEvidence({ root = process.cwd(), runId, priorApkPath, compatibleArchivePath, lastValidSchemaVersion, verifyApkSignature, environment } = {}) {
  if (!RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const priorApk = regularFile(priorApkPath); const compatibleArchive = regularFile(compatibleArchivePath);
  const apkBytes = readFileSync(priorApk); const archiveBytes = readFileSync(compatibleArchive);
  if (apkBytes.length < 4 || !apkBytes.subarray(0, 4).equals(APK_MAGIC)) fail("apk_invalid");
  const formatVersion = archiveFormat(archiveBytes);
  const signature = validateSignature(signatureFor(priorApk, { verifyApkSignature, environment }));
  const evidence = evidenceValue({ runId, apkBytes, signature, archiveBytes, formatVersion, lastValidSchemaVersion, currentVersion: currentSchemaVersion(root) });
  return publishV12AtomicShard({
    root,
    runId,
    shard: "rollback",
    produce: ({ write }) => {
      write("rollback/prior-signed.apk", apkBytes);
      write("rollback/prior-apk-signature.txt", signature.report);
      write("rollback/compatible-archive.gtbk", archiveBytes);
      write("rollback/rollback-evidence.json", evidence);
    },
    validate: members => members.length === V12_ROLLBACK_PUBLICATION_MEMBERS.length
      && [...members.map(({ artifact }) => artifact)].sort().every((member, index) => member === [...V12_ROLLBACK_PUBLICATION_MEMBERS].sort()[index]),
  });
}

export function verifyV12RollbackEvidence({ root = process.cwd(), runId, verifyApkSignature, environment, allowFinalResidue = false } = {}) {
  if (!RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  try { verifyV12AtomicShard({ root, runId, shard: "rollback", allowOtherShardResidue: allowFinalResidue }); }
  catch (error) { throw error; }
  const base = `artifacts/native/v1.2/${runId}`;
  const publication = JSON.parse(readFileSync(retainedFile(root, `${base}/publication/rollback.json`), "utf8"));
  if (!Array.isArray(publication.members) || publication.members.length !== V12_ROLLBACK_PUBLICATION_MEMBERS.length
    || [...publication.members.map(({ artifact }) => artifact)].sort().some((member, index) => member !== [...V12_ROLLBACK_PUBLICATION_MEMBERS].sort()[index])) fail("artifact_invalid");
  const evidencePath = `${base}/rollback/rollback-evidence.json`;
  const evidenceBytes = readFileSync(retainedFile(root, evidencePath));
  let evidence;
  try { evidence = JSON.parse(evidenceBytes.toString("utf8")); } catch { fail("evidence_invalid"); }
  validateEvidenceShape(evidence, runId, root);
  const apkBytes = readFileSync(retainedFile(root, evidence.prior_signed_apk.path));
  const archiveBytes = readFileSync(retainedFile(root, evidence.compatible_archive.path));
  const signatureReport = readFileSync(retainedFile(root, `${base}/rollback/prior-apk-signature.txt`));
  if (apkBytes.length !== evidence.prior_signed_apk.size_bytes || sha256(apkBytes) !== evidence.prior_signed_apk.sha256
    || archiveBytes.length !== evidence.compatible_archive.size_bytes || sha256(archiveBytes) !== evidence.compatible_archive.sha256
    || archiveFormat(archiveBytes) !== evidence.compatible_archive.format_version
    || sha256(signatureReport) !== evidence.prior_signed_apk.signature_sha256) fail("artifact_invalid");
  const signature = validateSignature(signatureFor(retainedFile(root, evidence.prior_signed_apk.path), { verifyApkSignature, environment }));
  if (!signature.report.equals(signatureReport) || signature.certificate_sha256 !== evidence.prior_signed_apk.certificate_sha256) fail("signature_invalid");
  return Object.freeze({
    prior_signed_apk_sha256: evidence.prior_signed_apk.sha256,
    prior_apk_signature_sha256: evidence.prior_signed_apk.signature_sha256,
    prior_apk_certificate_sha256: evidence.prior_signed_apk.certificate_sha256,
    compatible_archive_sha256: evidence.compatible_archive.sha256,
    compatible_archive_format_version: evidence.compatible_archive.format_version,
    last_valid_schema_version: evidence.schema_boundary.last_valid_schema_version,
    current_schema_version: evidence.schema_boundary.current_schema_version,
    newer_schema_committed: true,
    recovery_boundary: RECOVERY_BOUNDARY,
    rollback_evidence_sha256: sha256(evidenceBytes),
  });
}

function cli(args) {
  if (args.length !== 8 || args[0] !== "--run" || args[2] !== "--prior-apk" || args[4] !== "--archive" || args[6] !== "--last-valid-schema") fail("arguments_invalid");
  return publishV12RollbackEvidence({ runId: args[1], priorApkPath: path.resolve(args[3]), compatibleArchivePath: path.resolve(args[5]), lastValidSchemaVersion: Number(args[7]) });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try { process.stdout.write(`${JSON.stringify(cli(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "v12_rollback_failed"}\n`); process.exitCode = 1; }
}
