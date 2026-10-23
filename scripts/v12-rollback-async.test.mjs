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
function fixture(t, formatVersion = 2, schemaVersion = 22) {
  const root = mkdtempSync(path.join(tmpdir(), "rollback-async-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = "phase20-20261023T000000Z-aaaaaaaaaaaa";
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  mkdirSync(path.join(root, "src/platform/sqlite/migrations"), { recursive: true });
  writeFileSync(path.join(root, "src/platform/sqlite/migrations/0047_current.ts"), "");
  const apk = Buffer.from("504b0304aabb", "hex");
  const header = Buffer.from(JSON.stringify({ version: formatVersion }));
  const prefix = Buffer.alloc(9); prefix.write("GTBK"); prefix[4] = formatVersion; prefix.writeUInt32BE(header.length, 5);
  const archive = Buffer.concat([prefix, header, Buffer.alloc(32, 1)]);
  const report = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"a".repeat(64)}\n`);
  const options = { root, runId, priorApkPath: path.join(root, "prior.apk"), priorReleaseManifestPath: path.join(root, "prior.json"),
    compatibleArchivePath: path.join(root, "archive.gtbk"), lastValidSchemaVersion: schemaVersion,
    verifyApkSignature: () => ({ report, certificate_sha256: "a".repeat(64) }) };
  writeFileSync(options.priorApkPath, apk); writeFileSync(options.compatibleArchivePath, archive);
  writeFileSync(options.priorReleaseManifestPath, JSON.stringify({ schema_version: 1, producer: "v12-retained-prior-release/v1",
    package: "com.fchoo.gymtracker", apk: { sha256: hash(apk), size_bytes: apk.length, signature_sha256: hash(report), certificate_sha256: "a".repeat(64) } }));
  const facts = { schema_version: 1, producer: "v12-canonical-post-restore-facts/v1", archive_sha256: hash(archive), source_schema_version: schemaVersion,
    table_count: 1, row_count: 1, source_facts_sha256: "b".repeat(64), reopened_facts_sha256: "b".repeat(64), integrity_check: "ok", foreign_key_violations: 0 };
  const inspection = { format_version: formatVersion, schema_version: schemaVersion, canonical_post_restore_facts: facts,
    clean_restore_receipt: { schema_version: 1, producer: "v12-production-clean-restore-receipt/v1", parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands",
      outcome: "restored", clean_target: true, archive_sha256: hash(archive), archive_format_version: formatVersion, archive_schema_version: schemaVersion,
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

test("validates every retained generation without claiming these host fixtures are native receipts", t => {
  for (const [formatVersion, schemaVersion] of [[1, 15], [2, 22], [3, 28], [4, 29], [5, 31], [6, 36], [7, 40], [8, 42], [9, 44], [10, 45]]) {
    const f = fixture(t, formatVersion, schemaVersion);
    rollback.publishV12RollbackEvidence({ ...f.options, authenticateAndRestoreArchive: () => f.inspection });
    assert.equal(rollback.verifyV12RollbackEvidence(f.options).compatible_archive_format_version, formatVersion);
  }
  for (const schema of [0, 22.5, 47]) {
    const f = fixture(t, 2, schema);
    assert.throws(() => rollback.publishV12RollbackEvidence({ ...f.options, authenticateAndRestoreArchive: () => f.inspection }), /schema_boundary_invalid/u);
  }
});

test("rejects malformed retained inputs before publication and preserves synchronous fixed failures", t => {
  for (const bytes of [Buffer.from("bad"), Buffer.concat([Buffer.from("XXXX"), Buffer.alloc(40)]),
    (() => { const b = fixture(t).archive; b.writeUInt32BE(16_385, 5); return b; })(),
    (() => { const b = fixture(t).archive; b.fill(0xff, 9, 22); return b; })(),
    (() => { const b = fixture(t).archive; b[20] = 49; return b; })()]) {
    const f = fixture(t); writeFileSync(f.options.compatibleArchivePath, bytes);
    assert.throws(() => rollback.publishV12RollbackEvidence(f.options), /archive_invalid/u);
  }
  const noApk = fixture(t); writeFileSync(noApk.options.priorApkPath, "bad");
  assert.throws(() => rollback.publishV12RollbackEvidence(noApk.options), /apk_invalid/u);
  const malformed = fixture(t); writeFileSync(malformed.options.priorReleaseManifestPath, "not-json");
  assert.throws(() => rollback.publishV12RollbackEvidence(malformed.options), /release_manifest_invalid/u);
  const noSchema = fixture(t); rmSync(path.join(noSchema.options.root, "src"), { recursive: true });
  assert.throws(() => rollback.publishV12RollbackEvidence(noSchema.options), /schema_boundary_invalid/u);
  const emptySchema = fixture(t); rmSync(path.join(emptySchema.options.root, "src/platform/sqlite/migrations/0047_current.ts"));
  assert.throws(() => rollback.publishV12RollbackEvidence(emptySchema.options), /schema_boundary_invalid/u);
  const wrongPackage = fixture(t);
  assert.throws(() => rollback.publishV12RollbackEvidence({ ...wrongPackage.options, expectedPackage: "wrong" }), /arguments_invalid/u);
  const wrongFormat = fixture(t); wrongFormat.inspection.format_version = 1; wrongFormat.inspection.clean_restore_receipt.archive_format_version = 1;
  assert.throws(() => rollback.publishV12RollbackEvidence({ ...wrongFormat.options, authenticateAndRestoreArchive: () => wrongFormat.inspection }), /archive_invalid/u);
  const sync = fixture(t);
  assert.throws(() => rollback.publishV12RollbackEvidence({ ...sync.options, authenticateAndRestoreArchive: () => { throw new Error("v12_rollback_native_timeout"); } }), /native_timeout/u);
});

test("signature subprocess success and both real CLI routes are covered with host-only signed fixtures", async t => {
  const f = fixture(t); const sdk = path.join(f.options.root, "sdk");
  const signer = path.join(sdk, "build-tools/36.0.0/apksigner"); mkdirSync(path.dirname(signer), { recursive: true });
  const report = f.options.verifyApkSignature().report.toString();
  writeFileSync(signer, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(report)});\n`, { mode: 0o755 });
  const original = { ANDROID_HOME: process.env.ANDROID_HOME, ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT, V12_ROLLBACK_REQUEST_PATH: process.env.V12_ROLLBACK_REQUEST_PATH };
  Object.assign(process.env, { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk }); delete process.env.V12_ROLLBACK_REQUEST_PATH;
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  assert.equal(rollback.deriveV12RetainedPriorReleaseManifest({ ...f.options, verifyApkSignature: undefined,
    readApkConfig: () => ({ android: { package: "com.fchoo.gymtracker" }, extra: { buildProfile: "production", nativeContractsEnabled: false } }) }).apk.sha256, hash(readFileSync(f.options.priorApkPath)));
  const cliArgs = ["--run", f.options.runId, "--prior-apk", f.options.priorApkPath, "--prior-manifest", f.options.priorReleaseManifestPath,
    "--archive", f.options.compatibleArchivePath, "--last-valid-schema", "22"];
  await assert.rejects(rollback.executeV12RollbackCli(cliArgs), /restore_parser_required/u);
  const script = new URL("./v12-rollback-evidence.mjs", import.meta.url).pathname;
  for (const args of [["--invalid"], cliArgs]) {
    const result = childProcess.spawnSync(process.execPath, [script, ...args], { encoding: "utf8", cwd: f.options.root });
    assert.equal(result.status, 1); assert.match(result.stderr, /^v12_rollback_[a-z_]+\s*$/u);
  }
  const preload = path.join(f.options.root, "host-only-apk-config.mjs");
  writeFileSync(preload, 'import cp from "node:child_process"; import {syncBuiltinESMExports} from "node:module"; const actual=cp.spawnSync; cp.spawnSync=(exe,args,options)=>exe==="/usr/bin/unzip"?{status:0,stdout:Buffer.from(JSON.stringify({android:{package:"com.fchoo.gymtracker"},extra:{buildProfile:"production",nativeContractsEnabled:false}}))}:actual(exe,args,options); syncBuiltinESMExports();');
  const derived = childProcess.spawnSync(process.execPath, ["--import", preload, script, "--derive-prior-manifest", f.options.priorApkPath], { encoding: "utf8" });
  assert.equal(derived.status, 0, derived.stderr); assert.equal(JSON.parse(derived.stdout).apk.sha256, hash(readFileSync(f.options.priorApkPath)));
  const actualSpawn = childProcess.spawnSync;
  const mock = t.mock.method(childProcess, "spawnSync", (exe, args, options) => exe === "/usr/bin/unzip"
    ? { status: 0, stdout: Buffer.from(JSON.stringify({ android: { package: "com.fchoo.gymtracker" }, extra: { buildProfile: "production", nativeContractsEnabled: false } })) }
    : actualSpawn(exe, args, options)); syncBuiltinESMExports();
  try { assert.equal((await rollback.executeV12RollbackCli(["--derive-prior-manifest", f.options.priorApkPath])).apk.sha256, hash(readFileSync(f.options.priorApkPath))); }
  finally { mock.mock.restore(); syncBuiltinESMExports(); }
});
