import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as rollback from "./v12-rollback-evidence.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "rollback-async-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = "phase20-20261023T000000Z-aaaaaaaaaaaa";
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  mkdirSync(path.join(root, "src/platform/sqlite/migrations"), { recursive: true });
  writeFileSync(path.join(root, "src/platform/sqlite/migrations/0047_current.ts"), "");
  const apk = Buffer.from("504b0304aabb", "hex");
  const header = Buffer.from('{"version":2}');
  const prefix = Buffer.alloc(9); prefix.write("GTBK"); prefix[4] = 2; prefix.writeUInt32BE(header.length, 5);
  const archive = Buffer.concat([prefix, header, Buffer.alloc(32, 1)]);
  const report = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"a".repeat(64)}\n`);
  const options = { root, runId, priorApkPath: path.join(root, "prior.apk"), priorReleaseManifestPath: path.join(root, "prior.json"),
    compatibleArchivePath: path.join(root, "archive.gtbk"), lastValidSchemaVersion: 22,
    verifyApkSignature: () => ({ report, certificate_sha256: "a".repeat(64) }) };
  writeFileSync(options.priorApkPath, apk); writeFileSync(options.compatibleArchivePath, archive);
  writeFileSync(options.priorReleaseManifestPath, JSON.stringify({ schema_version: 1, producer: "v12-retained-prior-release/v1",
    package: "com.fchoo.gymtracker", apk: { sha256: hash(apk), size_bytes: apk.length, signature_sha256: hash(report), certificate_sha256: "a".repeat(64) } }));
  const facts = { schema_version: 1, producer: "v12-canonical-post-restore-facts/v1", archive_sha256: hash(archive), source_schema_version: 22,
    table_count: 1, row_count: 1, source_facts_sha256: "b".repeat(64), reopened_facts_sha256: "b".repeat(64), integrity_check: "ok", foreign_key_violations: 0 };
  const inspection = { format_version: 2, schema_version: 22, canonical_post_restore_facts: facts,
    clean_restore_receipt: { schema_version: 1, producer: "v12-production-clean-restore-receipt/v1", parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands",
      outcome: "restored", clean_target: true, archive_sha256: hash(archive), archive_format_version: 2, archive_schema_version: 22,
      post_restore_facts_sha256: hash(`${JSON.stringify(facts)}\n`), reopened_post_restore_facts_sha256: hash(`${JSON.stringify(facts)}\n`) } };
  return { options, inspection, archive, published: path.join(root, `artifacts/native/v1.2/${runId}/publication/rollback.json`) };
}

test("async publisher waits for real executor completion before atomic publication (host orchestration test)", async t => {
  const f = fixture(t); let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  assert.equal(typeof rollback.publishV12RollbackEvidenceAsync, "function");
  const publication = rollback.publishV12RollbackEvidenceAsync({ ...f.options, authenticateAndRestoreArchive: async input => {
    assert.equal(input.required_parser, "src/domains/portability/restoreCommands.ts#createRestoreCommands");
    assert.deepEqual(input.archive_bytes, f.archive);
    await pending;
    return f.inspection;
  } });
  assert.equal(existsSync(f.published), false);
  finish(); await publication;
  assert.equal(existsSync(f.published), true);
});

test("async executor failures never publish and remain privacy-safe", async t => {
  const f = fixture(t);
  assert.equal(typeof rollback.publishV12RollbackEvidenceAsync, "function");
  await assert.rejects(rollback.publishV12RollbackEvidenceAsync({ ...f.options, authenticateAndRestoreArchive: async () => {
    throw new Error("sensitive source payload");
  } }), /^Error: v12_rollback_archive_invalid$/u);
  assert.equal(existsSync(f.published), false);
});

test("async publisher rejects missing executor, rejects bad proof, and preserves fixed first failures", async t => {
  for (const error of [new Error("v12_rollback_native_timeout"), "private text"]) {
    const f = fixture(t);
    await assert.rejects(rollback.publishV12RollbackEvidenceAsync({ ...f.options, authenticateAndRestoreArchive: async () => { throw error; } }),
      error instanceof Error ? /v12_rollback_native_timeout/u : /v12_rollback_archive_invalid/u);
    assert.equal(existsSync(f.published), false);
  }
  const missing = fixture(t);
  await assert.rejects(rollback.publishV12RollbackEvidenceAsync(missing.options), /restore_parser_required/u);
  await assert.rejects(rollback.publishV12RollbackEvidenceAsync(), /arguments_invalid/u);
  const invalid = fixture(t); invalid.inspection.canonical_post_restore_facts.integrity_check = "bad";
  await assert.rejects(rollback.publishV12RollbackEvidenceAsync({ ...invalid.options, authenticateAndRestoreArchive: async () => invalid.inspection }), /restore_facts_invalid/u);
  assert.equal(existsSync(invalid.published), false);
});

test("async publication retains exactly the authenticated bytes even if the input path changes while awaiting", async t => {
  const f = fixture(t);
  await rollback.publishV12RollbackEvidenceAsync({ ...f.options, authenticateAndRestoreArchive: async () => {
    writeFileSync(f.options.compatibleArchivePath, "changed-input"); await Promise.resolve(); return f.inspection;
  } });
  assert.deepEqual(readFileSync(path.join(f.options.root, `artifacts/native/v1.2/${f.options.runId}/rollback/compatible-archive.gtbk`)), f.archive);
});

test("prior manifest derives signed-byte ownership only, without declaring unproven schema compatibility (HOST UNIT ONLY)", t => {
  const f = fixture(t);
  const config = { android: { package: "com.fchoo.gymtracker" }, extra: { buildProfile: "production", nativeContractsEnabled: false } };
  const derived = rollback.deriveV12RetainedPriorReleaseManifest({ ...f.options, readApkConfig: () => config });
  assert.equal(derived.apk.sha256, hash(readFileSync(f.options.priorApkPath)));
  assert.equal(derived.package, "com.fchoo.gymtracker");
  assert.equal(Object.hasOwn(derived, "compatible_schema_version"), false);
  for (const value of [undefined, {}, { ...config, android: { package: "wrong" } }, { ...config, extra: { buildProfile: "development-test" } },
    { ...config, extra: { buildProfile: "production", nativeContractsEnabled: true } }]) {
    assert.throws(() => rollback.deriveV12RetainedPriorReleaseManifest({ ...f.options, readApkConfig: () => value }), /release_manifest_invalid/u);
  }
  writeFileSync(f.options.priorApkPath, "bad");
  assert.throws(() => rollback.deriveV12RetainedPriorReleaseManifest({ ...f.options, readApkConfig: () => config }), /apk_invalid/u);
});

test("prior config extraction uses a subprocess and rejects failed or malformed output (HOST UNIT ONLY)", t => {
  const f = fixture(t); const executable = path.join(f.options.root, "unzip-unit");
  const options = { ...f.options, environment: { V12_EXECUTION_ORIGIN: "test-controlled/v1", V12_UNZIP_PATH: executable } };
  for (const body of ['process.stdout.write(JSON.stringify({android:{package:"com.fchoo.gymtracker"},extra:{buildProfile:"production",nativeContractsEnabled:false}}));',
    'process.stdout.write("bad");', 'process.exitCode=1;']) {
    writeFileSync(executable, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
    if (body.includes("JSON.stringify")) assert.equal(rollback.deriveV12RetainedPriorReleaseManifest(options).apk.sha256, hash(readFileSync(f.options.priorApkPath)));
    else assert.throws(() => rollback.deriveV12RetainedPriorReleaseManifest(options), /release_manifest_invalid/u);
  }
});

test("prior manifest rejects non-files, symbolic links and missing inputs without exposing paths", t => {
  const f = fixture(t);
  for (const file of [undefined, "relative", f.options.root, path.join(f.options.root, "absent")]) {
    assert.throws(() => rollback.deriveV12RetainedPriorReleaseManifest({ ...f.options, priorApkPath: file }), /artifact_invalid/u);
  }
  const link = path.join(f.options.root, "prior-link"); symlinkSync(f.options.priorApkPath, link);
  assert.throws(() => rollback.deriveV12RetainedPriorReleaseManifest({ ...f.options, priorApkPath: link }), /artifact_invalid/u);
});

test("signature ownership guards reject every malformed report and certificate (HOST UNIT ONLY)", t => {
  const f = fixture(t); const valid = f.options.verifyApkSignature();
  for (const value of [null, { ...valid, report: "not-bytes" }, { ...valid, report: Buffer.alloc(0) },
    { ...valid, certificate_sha256: undefined }, { ...valid, report: Buffer.from(`Signer #1 certificate SHA-256 digest: ${"a".repeat(64)}`) },
    { ...valid, report: Buffer.from("Verified using v2 scheme (APK Signature Scheme v2): true") }, { ...valid, certificate_sha256: "b".repeat(64) }]) {
    assert.throws(() => rollback.deriveV12RetainedPriorReleaseManifest({ ...f.options, verifyApkSignature: () => value }), /signature_invalid/u);
  }
});

test("signature subprocess handles execution failures, absent stdout and missing certs (HOST UNIT ONLY)", t => {
  const f = fixture(t); const executable = path.join(f.options.root, "signature-unit");
  writeFileSync(executable, "#!/usr/bin/env node\n", { mode: 0o755 });
  const options = { ...f.options, verifyApkSignature: undefined,
    environment: { V12_EXECUTION_ORIGIN: "test-controlled/v1", V12_APKSIGNER_PATH: executable },
    readApkConfig: () => ({ android: { package: "com.fchoo.gymtracker" }, extra: { buildProfile: "production", nativeContractsEnabled: false } }) };
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  for (const result of [{ error: new Error("private") }, { signal: "SIGTERM" }, { status: 1 }, { status: 0 },
    { status: 0, stdout: Buffer.from("not-verified") }, { status: 0, stdout: Buffer.from("Verified using v2 scheme (APK Signature Scheme v2): true") }]) {
    const mock = t.mock.method(childProcess, "spawnSync", () => result); syncBuiltinESMExports();
    assert.throws(() => rollback.deriveV12RetainedPriorReleaseManifest(options), /signature_invalid/u);
    mock.mock.restore(); syncBuiltinESMExports();
  }
});

test("CLI wires the source-owned native executor rather than a canned callback", async () => {
  assert.equal(typeof rollback.executeV12RollbackCli, "function");
  await assert.rejects(rollback.executeV12RollbackCli(["--invalid"]), /v12_rollback_arguments_invalid/u);
  assert.equal(rollback.v12RollbackErrorMessage(new Error("private payload")), "v12_rollback_failed");
});
