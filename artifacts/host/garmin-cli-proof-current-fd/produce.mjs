import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = realpathSync(process.argv[2]);
const evidenceRoot = path.dirname(fileURLToPath(import.meta.url));
const node = "/Users/bytedance/.nvm/versions/node/v24.19.0/bin/node";
const ndk = "/opt/homebrew/share/android-commandlinetools/ndk/27.1.12297006";
const publicCache = "/private/tmp/p20-cffi-pinned-input-cache";
const modules = ["scripts/verify-garmin-python-lock.mjs", "scripts/garmin-android-native.mjs", "scripts/build-android-cffi.mjs", "scripts/verify-garmin-android-binaries.mjs"];
const tests = modules.map(file => file.replace(".mjs", ".test.mjs"));
const manifestPath = "modules/garmin-connect/python/android-cffi/build-inputs.json";
const dependencies = ["scripts/garmin-android-test-fixtures.mjs", "modules/garmin-connect/python/garmin-python-lock.json"];
const sourceRoot = path.join(evidenceRoot, "source");
const inputRoot = path.join(evidenceRoot, "inputs");
const rawRoot = path.join(evidenceRoot, "raw");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const write = (file, bytes, mode = 0o600) => writeFileSync(file, bytes, { flag: "wx", mode });
const entry = file => ({ path: path.relative(evidenceRoot, file), sha256: sha(readFileSync(file)) });
const { runV12BoundedProcess } = await import(pathToFileURL(path.join(projectRoot, "scripts/run-v12-maestro.mjs")));
const { collectPhase20SubprocessCoverage } = await import(pathToFileURL(path.join(projectRoot, "scripts/phase20-subprocess-coverage.mjs")));
const { V12_POSIX_OWNERSHIP_ENV } = await import(pathToFileURL(path.join(projectRoot, "scripts/v12-posix-process-tree.mjs")));

function groupRows(group) {
  const result = spawnSync("/bin/ps", ["-axo", "pid=,pgid=,lstart=,stat=,comm="], { encoding: "utf8", timeout: 5_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0);
  return result.stdout.split(/\r?\n/u).filter(Boolean).flatMap(line => {
    const row = /^\s*(\d+)\s+(\d+)\s+(.{24})\s+(\S+)\s+(.+)$/u.exec(line);
    assert.ok(row, "process birth/group row must parse");
    return Number(row[2]) === group ? [{ pid: Number(row[1]), group, birth: row[3], state: row[4], commandSha256: sha(row[5]) }] : [];
  });
}

async function invoke(kind, args, timeoutMs) {
  const owned = path.join(evidenceRoot, `${kind}.process-ownership`);
  let child; let tokenHash; let outcome; let stderr = []; let groupProblem;
  const observations = new Map(); let snapshots = 0; let markerProbes = 0;
  const sample = () => {
    try {
      if (child?.pid === undefined) return;
      for (const row of groupRows(child.pid)) observations.set(`${row.pid}:${row.birth}`, row);
      snapshots += 1;
    } catch (error) { groupProblem ??= error; }
  };
  let sampler;
  const startedAt = new Date().toISOString();
  let stdout;
  try {
    stdout = await runV12BoundedProcess(node, args, {
      cwd: sourceRoot,
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin", LC_ALL: "C", NODE_V8_COVERAGE: rawRoot },
      timeoutMs, termGraceMs: 5_000, killGraceMs: 5_000,
      posixProcessProbeImplementation: (program, probeArgs, options) => {
        assert.equal(program, "ps"); markerProbes += 1;
        return spawnSync("/bin/ps", probeArgs, options);
      },
      spawnImplementation: (program, childArgs, options) => {
        assert.equal(program, node);
        tokenHash = sha(options.env[V12_POSIX_OWNERSHIP_ENV]);
        write(owned, json({ kind, ownershipSha256: tokenHash, startedAt }));
        child = spawn(program, childArgs, options);
        child.stderr.on("data", bytes => stderr.push(Buffer.from(bytes)));
        child.once("close", (exitCode, signal) => { outcome = { exitCode, signal }; });
        sample();
        sampler = setInterval(sample, 100);
        return child;
      },
    });
  } finally { clearInterval(sampler); }
  if (groupProblem) throw groupProblem;
  assert.deepEqual(outcome, { exitCode: 0, signal: null });
  const finalRows = groupRows(child.pid);
  assert.deepEqual(finalRows, [], "owned group including compiler children must be empty");
  assert.ok([...observations.values()].some(row => row.pid === child.pid), "actual leader birth must have been observed");
  assert.ok(markerProbes >= 2, "bounded supervisor must verify owned token processes");
  const stdoutPath = path.join(evidenceRoot, `${kind}.stdout`);
  const stderrPath = path.join(evidenceRoot, `${kind}.stderr`);
  write(stdoutPath, stdout); write(stderrPath, Buffer.concat(stderr));
  const processReceipt = { kind, startedAt, endedAt: new Date().toISOString(), leaderPid: child.pid,
    ownershipSha256: tokenHash, observedProcessBirths: [...observations.values()], snapshots, markerProbes,
    finalGroupRows: finalRows, boundedSupervisorResolved: true, cleanup: "verified-empty" };
  const processPath = path.join(evidenceRoot, `${kind}.process-receipt.json`);
  write(processPath, json(processReceipt));
  // Removal is only after both the existing token supervisor and actual group
  // verification succeed. Failed runs retain their ownership marker and data.
  await import("node:fs").then(fs => fs.unlinkSync(owned));
  return { kind, executable: node, args, ...outcome, ownershipSha256: tokenHash, cleanup: "verified-empty",
    stdout: entry(stdoutPath), stderr: entry(stderrPath), processReceipt: entry(processPath) };
}

try {
  assert.equal(process.execPath, node); assert.equal(process.versions.node, "24.19.0");
  assert.equal(process.platform, "darwin"); assert.equal(process.arch, "arm64");
  for (const directory of [sourceRoot, inputRoot, rawRoot]) mkdirSync(directory, { mode: 0o700 });
  const manifestBytes = readFileSync(path.join(projectRoot, manifestPath));
  assert.equal(sha(manifestBytes), "40c706297872d458021a090d3c84bbcbd401e6e2570d8af86080156ba682d9e0");
  const manifest = JSON.parse(manifestBytes);
  const wheelPath = path.join(path.dirname(manifestPath), manifest.output.filename);
  assert.equal(sha(readFileSync(path.join(projectRoot, wheelPath))), manifest.output.sha256);
  const sourceFiles = [...modules, ...tests, manifestPath];
  for (const file of [...sourceFiles, ...dependencies, wheelPath]) {
    const destination = path.join(sourceRoot, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(projectRoot, file), destination); chmodSync(destination, 0o400);
  }
  for (const input of manifest.inputs) {
    const bytes = readFileSync(path.join(publicCache, input.filename));
    assert.equal(sha(bytes), input.sha256, `public pinned input ${input.name}`);
    write(path.join(inputRoot, input.filename), bytes, 0o400);
  }
  const source = { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim(), root: sourceRoot,
    files: sourceFiles.map(file => ({ path: file, sha256: sha(readFileSync(path.join(sourceRoot, file))) })),
    dependencies: dependencies.map(file => ({ path: file, sha256: sha(readFileSync(path.join(sourceRoot, file))) })) };
  write(path.join(evidenceRoot, "inputs.json"), json({ source, manifest: { path: manifestPath, sha256: sha(manifestBytes) },
    inputFiles: manifest.inputs, toolchain: manifest.toolchain, producerSha256: sha(readFileSync(fileURLToPath(import.meta.url))) }));
  const testInvocation = await invoke("tests", ["--test", "--test-concurrency=1", "--test-reporter=tap", ...tests], 10 * 60_000);
  const testReport = readFileSync(path.join(evidenceRoot, "tests.stdout"), "utf8");
  for (const [field, value] of Object.entries({ tests: 30, pass: 30, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    const matches = [...testReport.matchAll(new RegExp(`^# ${field} (\\d+)$`, "gmu"))];
    assert.equal(matches.length, 1); assert.equal(Number(matches[0][1]), value, `complete ${field}`);
  }
  const cliInvocation = await invoke("cli", ["scripts/build-android-cffi.mjs", ndk, inputRoot,
    path.join(evidenceRoot, "new-work"), path.join(evidenceRoot, "output")], 10 * 60_000);
  const receiptPath = path.join(evidenceRoot, "output/build-receipt.json");
  const receipt = JSON.parse(readFileSync(receiptPath));
  assert.deepEqual(receipt, JSON.parse(readFileSync(path.join(evidenceRoot, "cli.stdout"))));
  assert.equal(receipt.manifestSha256, sha(manifestBytes)); assert.deepEqual(receipt.output, manifest.output);
  assert.equal(receipt.native.sha256, manifest.output.backendSha256);
  assert.equal(receipt.native.machine, "AArch64"); assert.equal(receipt.native.androidApi, 24);
  assert.ok(receipt.native.minLoadAlignment >= 16_384);
  assert.equal(sha(readFileSync(path.join(evidenceRoot, "output", manifest.output.filename))), manifest.output.sha256);
  for (const file of [...source.files, ...source.dependencies]) assert.equal(sha(readFileSync(path.join(sourceRoot, file.path))), file.sha256);
  const coverage = await collectPhase20SubprocessCoverage({ projectRoot: sourceRoot, rawDirectory: rawRoot, targetFiles: modules });
  write(path.join(evidenceRoot, "coverage-summary.json"), json(coverage));
  assert.deepEqual(coverage.failures, [], "all four helper metrics must be exactly 100%");
  const proof = { schemaVersion: 1, proof: "NON_NATIVE_HOST_ONLY", producer: "real-pinned-android-cffi-cli", source,
    runtime: { node: process.versions.node, v8: process.versions.v8, platform: process.platform, arch: process.arch },
    manifest: { path: manifestPath, sha256: sha(manifestBytes) }, output: manifest.output,
    tests: { files: tests, total: 30 }, invocations: [testInvocation, cliInvocation], receipt: entry(receiptPath),
    raw: readdirSync(rawRoot).sort().map(file => entry(path.join(rawRoot, file))),
    producerScript: entry(fileURLToPath(import.meta.url)),
    supervision: ["scripts/run-v12-maestro.mjs", "scripts/v12-posix-process-tree.mjs"].map(file => ({ path: file, sha256: sha(readFileSync(path.join(projectRoot, file))) })) };
  const proofPath = path.join(evidenceRoot, "evidence.json");
  write(proofPath, `${JSON.stringify(proof)}\n`, 0o400);
  console.log(json({ ok: true, proof: proof.proof, root: evidenceRoot, descriptorSha256: sha(readFileSync(proofPath)), tests: 30,
    wheelSha256: manifest.output.sha256, backendSha256: manifest.output.backendSha256, cleanup: "verified-empty" }));
} catch (error) {
  const failure = path.join(evidenceRoot, "failure.json");
  if (!existsSync(failure)) write(failure, json({ ok: false, error: error instanceof Error ? error.message : "producer_failed", endedAt: new Date().toISOString() }));
  throw error;
}
