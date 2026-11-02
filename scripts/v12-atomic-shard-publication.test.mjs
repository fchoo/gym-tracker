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

function legacyBirthSha256(pid = process.pid) {
  const result = spawnSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8", timeout: 5_000, maxBuffer: 16 * 1024, stdio: ["ignore", "pipe", "ignore"],
  });
  assert.equal(result.status, 0);
  const birth = result.stdout.trim().replaceAll(/\s+/gu, " ");
  assert.notEqual(birth, "");
  return sha256(birth);
}

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

test("a same-second PID collision cannot keep a dead atomic owner claim forever", (t) => {
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
  if (existsSync("/proc/sys/kernel/random/boot_id") && existsSync(`/proc/${String(process.pid)}/stat`)) {
    assert.notEqual(claim.process_birth_sha256, legacyBirthSha256(process.pid));
  }
  writeFileSync(claimPath, `${JSON.stringify({ ...claim, pid: process.pid })}\n`);

  const recovered = publishV12AtomicShard({
    root, runId, shard: "performance", produce: () => { throw new Error("must recover staged bytes"); },
    beforeManifest: () => true,
  });
  assert.equal(recovered.manifest.completed, true);
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "performance" }), true);
});

test("a live legacy-ambiguous owner claim is never stolen", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-live-legacy-claim-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  const claims = path.join(runRoot, ".claims");
  mkdirSync(claims, { recursive: true });
  const claimPath = path.join(claims, "performance.json");
  const claim = {
    schema_version: 2, run_id: runId, shard: "performance", pid: process.pid,
    process_birth_sha256: legacyBirthSha256(process.pid), nonce: "0".repeat(32),
  };
  const claimBytes = `${JSON.stringify(claim)}\n`;
  writeFileSync(claimPath, claimBytes);

  assert.throws(() => publishV12AtomicShard({
    root, runId, shard: "performance", produce: ({ write }) => write("performance.json", { producer: "test" }),
  }), /v12_atomic_publish_claim_conflict/u);
  assert.equal(readFileSync(claimPath, "utf8"), claimBytes);
});

test("an unreadable legacy birth probe cannot steal a live legacy claim", () => {
  const code = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import childProcess from 'node:child_process';
    import {createHash} from 'node:crypto';
    import {syncBuiltinESMExports} from 'node:module';
    import {tmpdir} from 'node:os';
    import path from 'node:path';
    const originalSpawn = childProcess.spawnSync;
    const birth = originalSpawn('/bin/ps', ['-o','lstart=','-p',String(process.pid)], {encoding:'utf8'});
    assert.equal(birth.status, 0);
    const legacy = createHash('sha256').update(birth.stdout.trim().replaceAll(/\\s+/gu, ' ')).digest('hex');
    const root = fs.mkdtempSync(path.join(tmpdir(), 'v12-publish-legacy-probe-failure-'));
    const runId = ${JSON.stringify(runId)};
    const claimPath = path.join(root, 'artifacts/native/v1.2', runId, '.claims/performance.json');
    fs.mkdirSync(path.dirname(claimPath), {recursive:true});
    const bytes = JSON.stringify({schema_version:2,run_id:runId,shard:'performance',pid:process.pid,process_birth_sha256:legacy,nonce:'0'.repeat(32)})+'\\n';
    fs.writeFileSync(claimPath, bytes);
    childProcess.spawnSync = (command, args, options) => command === '/bin/ps'
      ? {status:1,signal:null,stdout:'',stderr:''}
      : originalSpawn(command, args, options);
    syncBuiltinESMExports();
    const {publishV12AtomicShard} = await import(${JSON.stringify(moduleUrl)});
    try {
      assert.throws(() => publishV12AtomicShard({root,runId,shard:'performance',produce:() => {throw new Error('live claim must remain protected');}}), /v12_atomic_publish_claim_conflict/u);
      assert.equal(fs.readFileSync(claimPath, 'utf8'), bytes);
    } finally {
      fs.rmSync(root, {recursive:true,force:true});
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("loss of the precise Linux birth probe cannot steal a live precise claim", () => {
  const code = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import path from 'node:path';
    import {tmpdir} from 'node:os';
    import {createHash} from 'node:crypto';
    import {syncBuiltinESMExports} from 'node:module';
    Object.defineProperty(process, 'platform', {value:'linux'});
    const originalRead = fs.readFileSync;
    const boot = '11111111-1111-1111-1111-111111111111';
    let failed = false;
    fs.readFileSync = (file, options) => {
      if (String(file).startsWith('/proc/')) {
        if (failed) throw new Error('probe unavailable');
        return String(file).endsWith('boot_id') ? boot : process.pid+' (test) S '+Array(18).fill('0').join(' ')+' 99';
      }
      return originalRead(file, options);
    };
    syncBuiltinESMExports();
    const {publishV12AtomicShard} = await import(${JSON.stringify(moduleUrl)});
    const root = fs.mkdtempSync(path.join(tmpdir(), 'v12-publish-precise-probe-failure-'));
    const runId = ${JSON.stringify(runId)};
    const claimPath = path.join(root, 'artifacts/native/v1.2', runId, '.claims/performance.json');
    fs.mkdirSync(path.dirname(claimPath), {recursive:true});
    const precise = createHash('sha256').update('linux-procfs-v1:'+boot+':'+process.pid+':99').digest('hex');
    const bytes = JSON.stringify({schema_version:2,run_id:runId,shard:'performance',pid:process.pid,process_birth_sha256:precise,nonce:'0'.repeat(32)})+'\\n';
    fs.writeFileSync(claimPath, bytes);
    failed = true;
    try {
      assert.throws(() => publishV12AtomicShard({root,runId,shard:'performance',produce:() => {throw new Error('live claim must remain protected');}}), /v12_atomic_publish_claim_conflict/u);
      assert.equal(fs.readFileSync(claimPath, 'utf8'), bytes);
    } finally {
      fs.rmSync(root, {recursive:true,force:true});
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("non-Linux owner fingerprints include PID and fail closed if the birth probe is absent", () => {
  const code = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import path from 'node:path';
    import {tmpdir} from 'node:os';
    import {createHash} from 'node:crypto';
    import childProcess from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    Object.defineProperty(process, 'platform', {value:'darwin'});
    const originalSpawn = childProcess.spawnSync;
    let absent = false;
    childProcess.spawnSync = (command, args, options) => command === '/bin/ps'
      ? {status:0,signal:null,stdout:absent ? '' : 'same start second',stderr:''}
      : originalSpawn(command, args, options);
    syncBuiltinESMExports();
    const {publishV12AtomicShard} = await import(${JSON.stringify(moduleUrl)});
    const root = fs.mkdtempSync(path.join(tmpdir(), 'v12-publish-pid-fingerprint-'));
    const runId = ${JSON.stringify(runId)};
    fs.mkdirSync(path.join(root, 'artifacts/native/v1.2', runId), {recursive:true});
    const hash = value => createHash('sha256').update(value).digest('hex');
    try {
      publishV12AtomicShard({root,runId,shard:'performance',produce:({write}) => write('performance.json', {producer:'test'}),beforeManifest:() => {
        const claim = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/native/v1.2', runId, '.claims/performance.json')));
        assert.equal(claim.process_birth_sha256, hash('ps-pid-v1:'+process.pid+':'+hash('same start second')));
        return true;
      }});
      absent = true;
      assert.throws(() => publishV12AtomicShard({root,runId,shard:'visual',produce:() => {throw new Error('missing identity must fail first');}}), /v12_atomic_publish_claim_conflict/u);
    } finally {
      fs.rmSync(root, {recursive:true,force:true});
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
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


test("stale staged publication paths are cleaned or completed without clobbering", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-staged-residue-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(path.join(runRoot, ".staging/performance"), { recursive: true });
  writeFileSync(path.join(runRoot, ".staging/performance/orphan.json"), "{}\n");
  let produced = false;
  assert.equal(publishV12AtomicShard({
    root, runId, shard: "performance", produce: ({ write }) => {
      produced = true;
      write("performance.json", { schema_version: 1, producer: "test", run_id: runId });
    },
  }).manifest.completed, true);
  assert.equal(produced, true);
  assert.equal(existsSync(path.join(runRoot, ".staging")), false);
});

test("staged manifest retry accepts already promoted identical members", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-promoted-member-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  const stage = path.join(runRoot, ".staging/performance");
  mkdirSync(stage, { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify({ schema_version: 1, producer: "test", run_id: runId })}\n`);
  const member = { artifact: "performance.json", sha256: sha256(bytes), size_bytes: bytes.length };
  writeFileSync(path.join(stage, "performance.json"), bytes);
  writeFileSync(path.join(runRoot, "performance.json"), bytes);
  writeFileSync(path.join(stage, "manifest.json"), `${JSON.stringify({
    schema_version: 1, producer: "v12-atomic-shard-publication/v1", run_id: runId, shard: "performance", completed: true, members: [member],
  })}\n`);

  const result = publishV12AtomicShard({
    root, runId, shard: "performance", produce: () => { throw new Error("staged manifest must drive retry"); },
    validate: members => members.length === 1,
  });
  assert.equal(result.manifest.completed, true);
  assert.equal(existsSync(path.join(stage, "performance.json")), false);
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "performance" }), true);
});

test("published manifest residue is compared before stale stage cleanup", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-manifest-residue-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(runRoot, { recursive: true });
  const first = publishV12AtomicShard({
    root, runId, shard: "performance", produce: ({ write }) => write("performance.json", { schema_version: 1, producer: "test", run_id: runId }),
  });
  const stage = path.join(runRoot, ".staging/performance");
  mkdirSync(stage, { recursive: true });
  writeFileSync(path.join(stage, "manifest.json"), readFileSync(path.join(runRoot, "publication/performance.json")));
  assert.deepEqual(publishV12AtomicShard({
    root, runId, shard: "performance", produce: () => { throw new Error("published manifest must remain idempotent"); },
  }), first);
  assert.equal(existsSync(path.join(runRoot, ".staging")), false);
});

test("published residue with a special staged member fails closed", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-special-residue-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(runRoot, { recursive: true });
  publishV12AtomicShard({
    root, runId, shard: "performance", produce: ({ write }) => write("performance.json", { schema_version: 1, producer: "test", run_id: runId }),
  });
  const stage = path.join(runRoot, ".staging/performance");
  mkdirSync(stage, { recursive: true });
  const fifo = path.join(stage, "special");
  const made = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
  assert.equal(made.status, 0);
  assert.throws(() => publishV12AtomicShard({
    root, runId, shard: "performance", produce: () => { throw new Error("special residue must fail first"); },
  }), /v12_atomic_publish_stage_member_invalid/u);
});

test("link-time EEXIST races either accept matching bytes or fail closed", () => {
  const code = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { tmpdir } from 'node:os';
    import path from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';
    const root = fs.mkdtempSync(path.join(tmpdir(), 'v12-publish-link-race-'));
    const runId = ${JSON.stringify(runId)};
    fs.mkdirSync(path.join(root, 'artifacts/native/v1.2', runId), { recursive: true });
    const originalExists = fs.existsSync;
    const originalLink = fs.linkSync;
    const originalRead = fs.readFileSync;
    const originalWrite = fs.writeFileSync;
    fs.existsSync = value => String(value).endsWith('/performance.json') && !String(value).includes('/.staging/') && !String(value).includes('/publication/') ? false : originalExists(value);
    fs.linkSync = (source, target) => {
      if (String(target).endsWith('/performance.json')) {
        originalWrite(target, originalRead(source));
        const error = new Error('simulated-race'); error.code = 'EEXIST'; throw error;
      }
      return originalLink(source, target);
    };
    syncBuiltinESMExports();
    const { publishV12AtomicShard, verifyV12AtomicShard } = await import(${JSON.stringify(moduleUrl)});
    publishV12AtomicShard({ root, runId, shard: 'performance', produce: ({write}) => write('performance.json', {schema_version:1, producer:'test', run_id:runId}) });
    assert.equal(verifyV12AtomicShard({ root, runId, shard: 'performance' }), true);
    fs.linkSync = (source, target) => {
      if (String(target).endsWith('/visual.json')) { const error = new Error('simulated-race'); error.code = 'EEXIST'; throw error; }
      return originalLink(source, target);
    };
    syncBuiltinESMExports();
    assert.throws(() => publishV12AtomicShard({ root, runId, shard: 'visual', produce: ({write}) => write('visual.json', {schema_version:1, producer:'test', run_id:runId}) }), /v12_atomic_publish_output_conflict/);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
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
