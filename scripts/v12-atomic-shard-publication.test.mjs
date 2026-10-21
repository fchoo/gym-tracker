import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { publishV12AtomicShard, recordV12AtomicFailure, verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const productionOrigin = Object.freeze({
  schema_version: 1,
  action: "visual-capture",
  kind: "production-default-launcher",
  toolchain_origin: "production-attested/v1",
  default_launcher: true,
  test_only: false,
  adapter_source_sha256: "a".repeat(64),
  launcher_source_sha256: "b".repeat(64),
  domain_source_sha256: "d".repeat(64),
  request_attestation_sha256: "c".repeat(64),
});
const moduleUrl = new URL("./v12-atomic-shard-publication.mjs", import.meta.url).href;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function child(code, args) {
  return spawn(process.execPath, ["--input-type=module", "-e", code, ...args], { stdio: ["ignore", "pipe", "pipe"] });
}

function completed(processHandle) {
  return new Promise((resolve) => {
    let stdout = ""; let stderr = "";
    processHandle.stdout.on("data", chunk => { stdout += chunk; });
    processHandle.stderr.on("data", chunk => { stderr += chunk; });
    processHandle.on("close", status => resolve({ status, stdout, stderr }));
  });
}
test("atomic publisher rejects traversal, second writes, failed retries, and symlink attempts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId); mkdirSync(runRoot, { recursive: true });
  const result = publishV12AtomicShard({ root, runId, shard: "visual", produce: ({ write }) => write("screenshots/index.json", { ok: true }) });
  assert.equal(result.manifest.completed, true); assert.equal(verifyV12AtomicShard({ root, runId, shard: "visual" }), true);
  assert.deepEqual(publishV12AtomicShard({ root, runId, shard: "visual", produce: () => {} }), result);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "calendar", produce: ({ write }) => write("../escape", "x") }), /path_invalid/u);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "garmin", executionOrigin: { ...productionOrigin, action: "garmin" }, domainExecutionOrigin: "production-attested/v1", produce: ({ write }) => { write("a.json", { producer: "test" }); write("a.json", { producer: "test" }); } }), /second_write/u);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "garmin", produce: () => {} }), /attempt_consumed/u);
  mkdirSync(path.join(runRoot, ".staging"), { recursive: true }); symlinkSync(root, path.join(runRoot, ".staging", "link"));
  assert.throws(() => verifyV12AtomicShard({ root, runId, shard: "visual" }), /incomplete_attempt/u);
  assert.match(readFileSync(path.join(runRoot, "failures/garmin.json"), "utf8"), /retry_allowed/u);
});

test("atomic publisher seals adapter execution provenance after production completes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-origin-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId); mkdirSync(runRoot, { recursive: true });
  const result = publishV12AtomicShard({
    root,
    runId,
    shard: "visual",
    executionOrigin: () => productionOrigin,
    produce: ({ write }) => write("screenshots/index.json", { ok: true }),
  });
  assert.deepEqual(result.manifest.execution_origin, productionOrigin);
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "visual" }), true);
  rmSync(root, { recursive: true, force: true });
});

test("atomic publisher rejects malformed execution provenance before publication", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-origin-invalid-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId); mkdirSync(runRoot, { recursive: true });
  assert.throws(() => publishV12AtomicShard({
    root,
    runId,
    shard: "visual",
    executionOrigin: { ...productionOrigin, test_only: "false" },
    produce: ({ write }) => write("screenshots/index.json", { ok: true }),
  }), /execution_origin_invalid/u);
  assert.equal(existsSync(path.join(runRoot, "publication/visual.json")), false);
  rmSync(root, { recursive: true, force: true });
});

test("Garmin atomic publication records only production-attested execution origin", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-garmin-origin-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(runRoot, { recursive: true });
  assert.throws(() => publishV12AtomicShard({
    root, runId, shard: "garmin", executionOrigin: { ...productionOrigin, action: "garmin" }, domainExecutionOrigin: "test-controlled/v1",
    produce: ({ write }) => write("garmin/result.json", { ok: true }),
  }), /execution_origin_invalid/u);
  const cleanRoot = mkdtempSync(path.join(tmpdir(), "v12-garmin-origin-ok-"));
  const cleanRunRoot = path.join(cleanRoot, "artifacts/native/v1.2", runId);
  mkdirSync(cleanRunRoot, { recursive: true });
  const result = publishV12AtomicShard({
    root: cleanRoot, runId, shard: "garmin", executionOrigin: { ...productionOrigin, action: "garmin" }, domainExecutionOrigin: "production-attested/v1",
    produce: ({ write }) => write("garmin/result.json", { ok: true }),
  });
  assert.equal(result.manifest.execution_origin.action, "garmin");
  assert.equal(result.manifest.domain_execution_origin, "production-attested/v1");
  assert.equal(verifyV12AtomicShard({ root: cleanRoot, runId, shard: "garmin" }), true);
  const manifestPath = path.join(cleanRunRoot, "publication/garmin.json");
  const altered = JSON.parse(readFileSync(manifestPath, "utf8"));
  altered.domain_execution_origin = "test-controlled/v1";
  writeFileSync(manifestPath, JSON.stringify(altered));
  assert.throws(() => verifyV12AtomicShard({ root: cleanRoot, runId, shard: "garmin" }), /execution_origin_invalid/u);
});

test("publisher rejects symlinked workspace and run ancestors before creating claims, staging, publication, or failures", (t) => {
  const realRoot = mkdtempSync(path.join(tmpdir(), "v12-publish-real-"));
  const linkedRoot = `${realRoot}-link`;
  t.after(() => { rmSync(linkedRoot, { force: true }); rmSync(realRoot, { recursive: true, force: true }); });
  mkdirSync(path.join(realRoot, "artifacts/native/v1.2", runId), { recursive: true });
  symlinkSync(realRoot, linkedRoot, "dir");
  assert.throws(
    () => publishV12AtomicShard({ root: linkedRoot, runId, shard: "visual", produce: ({ write }) => write("screenshots/index.json", { ok: true }) }),
    /symlink_forbidden/u,
  );
  assert.equal(existsSync(path.join(realRoot, "artifacts/native/v1.2", runId, ".claims")), false);

  const outside = mkdtempSync(path.join(tmpdir(), "v12-publish-outside-"));
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-root-"));
  t.after(() => { rmSync(outside, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); });
  mkdirSync(path.join(root, "artifacts/native"), { recursive: true });
  mkdirSync(path.join(outside, runId), { recursive: true });
  symlinkSync(outside, path.join(root, "artifacts/native/v1.2"), "dir");
  assert.throws(
    () => recordV12AtomicFailure({ root, runId, shard: "calendar", error: new Error("private token value") }),
    /symlink_forbidden/u,
  );
  assert.equal(existsSync(path.join(outside, runId, "failures")), false);
});

test("exclusive claim prevents concurrent producers from both running", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-claim-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  const marker = path.join(root, "producer-count.txt");
  const code = `
    import { appendFileSync } from 'node:fs';
    import { publishV12AtomicShard } from ${JSON.stringify(moduleUrl)};
    const [root, runId, marker] = process.argv.slice(1);
    try {
      publishV12AtomicShard({ root, runId, shard: 'performance', produce: ({write}) => {
        appendFileSync(marker, 'ran\\n');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
        write('performance.json', { schema_version: 1, producer: 'test', run_id: runId });
      }});
      process.exitCode = 0;
    } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
  `;
  const results = await Promise.all(Array.from({ length: 4 }, () => completed(child(code, [root, runId, marker]))));
  assert.equal(results.filter(({ status }) => status === 0).length, 1, JSON.stringify(results));
  assert.equal(readFileSync(marker, "utf8").trim().split("\n").length, 1);
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "performance" }), true);
});

test("publication and failure compete through one no-clobber claim", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-failure-race-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  const publishCode = `
    import { publishV12AtomicShard } from ${JSON.stringify(moduleUrl)};
    const [root, runId] = process.argv.slice(1);
    try { publishV12AtomicShard({root, runId, shard:'performance', produce:({write}) => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
      write('performance.json', {schema_version:1, producer:'test', run_id:runId});
    }}); } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
  `;
  const failureCode = `
    import { recordV12AtomicFailure } from ${JSON.stringify(moduleUrl)};
    const [root, runId] = process.argv.slice(1);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    try { recordV12AtomicFailure({root, runId, shard:'performance', error:new Error('Bearer private-secret')}); }
    catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
  `;
  await Promise.all([completed(child(publishCode, [root, runId])), completed(child(failureCode, [root, runId]))]);
  const publication = existsSync(path.join(root, "artifacts/native/v1.2", runId, "publication/performance.json"));
  const failure = existsSync(path.join(root, "artifacts/native/v1.2", runId, "failures/performance.json"));
  assert.notEqual(publication, failure);
});

test("crash after member promotion recovers idempotently and publishes the manifest last", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-recovery-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  const code = `
    import { publishV12AtomicShard } from ${JSON.stringify(moduleUrl)};
    const [root, runId] = process.argv.slice(1);
    publishV12AtomicShard({root, runId, shard:'performance', produce:({write}) =>
      write('performance.json', {schema_version:1, producer:'test', run_id:runId}),
      beforeManifest: () => process.exit(91),
    });
  `;
  const crashed = spawnSync(process.execPath, ["--input-type=module", "-e", code, root, runId], { encoding: "utf8" });
  assert.equal(crashed.status, 91);
  const base = path.join(root, "artifacts/native/v1.2", runId);
  assert.equal(existsSync(path.join(base, "performance.json")), true);
  assert.equal(existsSync(path.join(base, "publication/performance.json")), false);
  let produced = false;
  const recovered = publishV12AtomicShard({
    root, runId, shard: "performance",
    produce: () => { produced = true; throw new Error("must not rerun producer"); },
    beforeManifest: () => true,
  });
  assert.equal(produced, false);
  assert.equal(recovered.manifest.completed, true);
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "performance" }), true);
  assert.deepEqual(publishV12AtomicShard({ root, runId, shard: "performance", produce: () => { throw new Error("must stay idempotent"); } }), recovered);
});

test("crash immediately after the manifest link cleans validated dead claim and stage residue idempotently", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-post-manifest-recovery-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  const code = `
    import { publishV12AtomicShard } from ${JSON.stringify(moduleUrl)};
    const [root, runId] = process.argv.slice(1);
    publishV12AtomicShard({root, runId, shard:'performance', produce:({write}) =>
      write('performance.json', {schema_version:1, producer:'test', run_id:runId}),
      afterManifest: () => process.exit(92),
    });
  `;
  const crashed = spawnSync(process.execPath, ["--input-type=module", "-e", code, root, runId], { encoding: "utf8" });
  assert.equal(crashed.status, 92);
  const base = path.join(root, "artifacts/native/v1.2", runId);
  assert.equal(existsSync(path.join(base, "publication/performance.json")), true);
  assert.equal(existsSync(path.join(base, ".claims/performance.json")), true);
  assert.equal(existsSync(path.join(base, ".staging/performance")), true);

  let produced = false;
  const recovered = publishV12AtomicShard({ root, runId, shard: "performance", produce: () => { produced = true; } });
  assert.equal(produced, false);
  assert.equal(existsSync(path.join(base, ".claims")), false);
  assert.equal(existsSync(path.join(base, ".staging")), false);
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "performance" }), true);
  assert.deepEqual(publishV12AtomicShard({ root, runId, shard: "performance", produce: () => { throw new Error("must stay idempotent"); } }), recovered);
});

test("a reused live PID cannot keep a dead atomic owner claim forever", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-pid-reuse-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  const code = `
    import { publishV12AtomicShard } from ${JSON.stringify(moduleUrl)};
    const [root, runId] = process.argv.slice(1);
    publishV12AtomicShard({root, runId, shard:'performance', produce:({write}) =>
      write('performance.json', {schema_version:1, producer:'test', run_id:runId}),
      beforeManifest: () => process.exit(94),
    });
  `;
  const crashed = spawnSync(process.execPath, ["--input-type=module", "-e", code, root, runId], { encoding: "utf8" });
  assert.equal(crashed.status, 94);
  const claimPath = path.join(root, "artifacts/native/v1.2", runId, ".claims/performance.json");
  const claim = JSON.parse(readFileSync(claimPath, "utf8"));
  assert.match(claim.process_birth_sha256, /^[a-f0-9]{64}$/u);
  writeFileSync(claimPath, `${JSON.stringify({ ...claim, pid: process.pid })}\n`);

  const recovered = publishV12AtomicShard({
    root, runId, shard: "performance", produce: () => { throw new Error("must recover staged bytes"); },
    beforeManifest: () => true,
  });
  assert.equal(recovered.manifest.completed, true);
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "performance" }), true);
});

test("existing publication recovery rejects unvalidated staged residue", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-post-manifest-tamper-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  const code = `
    import { publishV12AtomicShard } from ${JSON.stringify(moduleUrl)};
    const [root, runId] = process.argv.slice(1);
    publishV12AtomicShard({root, runId, shard:'performance', produce:({write}) =>
      write('performance.json', {schema_version:1, producer:'test', run_id:runId}),
      afterManifest: () => process.exit(93),
    });
  `;
  const crashed = spawnSync(process.execPath, ["--input-type=module", "-e", code, root, runId], { encoding: "utf8" });
  assert.equal(crashed.status, 93);
  const stage = path.join(root, "artifacts/native/v1.2", runId, ".staging/performance");
  writeFileSync(path.join(stage, "unexpected.json"), "{}\n");
  assert.throws(
    () => publishV12AtomicShard({ root, runId, shard: "performance", produce: () => {} }),
    /stage_member_invalid/u,
  );
});

test("failure receipts use a bounded code and only a digest of the raw error", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-safe-failure-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "artifacts/native/v1.2", runId), { recursive: true });
  const raw = "Authorization Bearer private-secret /Users/alice/morning-run.fit";
  recordV12AtomicFailure({ root, runId, shard: "calendar", error: new Error(raw) });
  const receiptText = readFileSync(path.join(root, "artifacts/native/v1.2", runId, "failures/calendar.json"), "utf8");
  const receipt = JSON.parse(receiptText);
  assert.match(receipt.failure_code, /^(?:arguments_invalid|auth_required|claim_conflict|execution_origin_invalid|internal_error|output_conflict|path_invalid|privacy_invalid|producer_failed|symlink_forbidden|validation_failed)$/u);
  assert.equal(receipt.failure_digest, sha256(raw));
  assert.doesNotMatch(receiptText, /Bearer|private-secret|Users|morning-run/iu);
});
