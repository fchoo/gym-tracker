import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Real, exclusively owned public-input CLI build. Never a numeric coverage fixture.
// Renew this seal only with a new reviewed producer stream when any bound input changes.
export const GARMIN_CLI_EVIDENCE_SHA256 = "b769d4dcdd93e29644f8fa922912ca70b6f0e8151f43558c8bc5c636a9a3da26";
export const GARMIN_CLI_EVIDENCE_DIRECTORY = "artifacts/host/garmin-cli-proof-current-fd";
export const GARMIN_CACHED_CLI_SUPPLEMENT = Object.freeze({
  path: "artifacts/host/garmin-lock-cached-cli-supplement-20261028/evidence.json",
  sha256: "9f7f11d3668781469265c9904d6a29a0a347828af284cf7fdcca9ca5ca26c99b",
});
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function cachedCliSupplement(projectRoot, canonicalUrl) {
  const root = realpathSync(projectRoot);
  const read = entry => {
    assert.ok(typeof entry.path === "string" && !path.isAbsolute(entry.path)
      && !entry.path.includes("\\") && entry.path.split("/").every(part => part && part !== "." && part !== ".."));
    const file = path.join(root, entry.path);
    assert.ok(lstatSync(file).isFile());
    assert.equal(realpathSync(file), file);
    const bytes = readFileSync(file);
    assert.equal(sha256(bytes), entry.sha256);
    return bytes;
  };
  const proof = JSON.parse(read(GARMIN_CACHED_CLI_SUPPLEMENT));
  assert.equal(proof.producer, "garmin-pinned-cached-cli-supplement/v1");
  assert.equal(proof.proof, "NON_NATIVE_HOST_ONLY");
  assert.equal(proof.original_packaging_seal_sha256, GARMIN_CLI_EVIDENCE_SHA256);
  assert.equal(proof.subject, "scripts/verify-garmin-python-lock.mjs");
  assert.equal(sha256(readFileSync(path.join(root, proof.subject))), proof.subject_sha256);
  const lockInput = proof.inputs.find(entry => entry.path === proof.lock_path);
  const lock = JSON.parse(read(lockInput.artifact));
  assert.equal(lockInput.sha256, proof.lock_sha256);
  const actual = JSON.parse(read(proof.execution));
  const before = JSON.parse(read(proof.before)); const after = JSON.parse(read(proof.after));
  const inputs = proof.inputs.map(({ path: file, sha256: digest }) => ({ path: file, sha256: digest }));
  assert.deepEqual(actual.source_inputs, inputs);
  assert.deepEqual(before.source_inputs, inputs); assert.deepEqual(after.source_inputs, inputs);
  assert.equal(actual.exit_code, 0); assert.equal(actual.signal, null); assert.equal(actual.error, null);
  assert.deepEqual(actual.changed_inputs, []); assert.deepEqual(after.changed_inputs, []);
  assert.deepEqual(actual.test_files, proof.tests);
  assert.equal(actual.report_sha256, proof.report.sha256); assert.equal(after.report_sha256, proof.report.sha256);
  assert.ok(Date.parse(before.recorded_at) <= Date.parse(actual.started_at)
    && Date.parse(actual.started_at) <= Date.parse(actual.finished_at)
    && Date.parse(actual.finished_at) <= Date.parse(after.recorded_at));
  assert.deepEqual(read(proof.tool_before), read(proof.tool_after));
  assert.deepEqual(read(proof.dependencies_before), read(proof.dependencies_after));
  assertCompleteTests(read(proof.report).toString("utf8"), proof.test_total);
  for (const entry of proof.inputs) assert.equal(sha256(read(entry.artifact)), entry.sha256);
  for (const entry of lock.packages) {
    const input = proof.inputs.find(value => value.path === `modules/garmin-connect/python/garmin-python-artifacts/${entry.artifact.filename}`);
    assert.equal(input.sha256, entry.artifact.sha256);
  }
  const sourceInput = proof.inputs.find(entry => entry.path === proof.subject);
  assert.equal(sourceInput.sha256, proof.subject_sha256);
  const length = read(sourceInput.artifact).toString("utf8").length;
  const scripts = [];
  for (const entry of proof.raw) {
    const raw = JSON.parse(read(entry));
    for (const script of raw.result) if (script.url === proof.source_url) {
      assert.ok(script.functions.every(fn => fn.ranges.every(range => Number.isSafeInteger(range.startOffset)
        && Number.isSafeInteger(range.endOffset) && range.startOffset >= 0 && range.endOffset <= length
        && range.endOffset >= range.startOffset && Number.isSafeInteger(range.count) && range.count >= 0)));
      scripts.push({ ...script, url: canonicalUrl });
    }
  }
  assert.ok(scripts.length > 0);
  return scripts;
}

export function assertGarminCliProcessReceipt(receipt, invocation) {
  assert.ok(receipt !== null && typeof receipt === "object" && !Array.isArray(receipt), "process receipt object");
  assert.equal(receipt.kind, invocation.kind, "process invocation kind");
  assert.equal(receipt.ownershipSha256, invocation.ownershipSha256, "process ownership binding");
  assert.match(receipt.ownershipSha256, /^[a-f0-9]{64}$/u, "process ownership hash");
  assert.equal(receipt.cleanup, "verified-empty", "process cleanup");
  assert.equal(receipt.boundedSupervisorResolved, true, "bounded supervisor closure");
  assert.deepEqual(receipt.finalGroupRows, [], "final owned process group empty");
  assert.ok(Number.isSafeInteger(receipt.leaderPid) && receipt.leaderPid > 0, "process leader identity");
  assert.ok(Number.isSafeInteger(receipt.markerProbes) && receipt.markerProbes >= 2, "process token probes");
  assert.ok(Number.isSafeInteger(receipt.snapshots) && receipt.snapshots >= 1, "process group snapshots");
  assert.ok(Array.isArray(receipt.observedProcessBirths), "process birth observations");
  assert.ok(receipt.observedProcessBirths.every(row => Number.isSafeInteger(row.pid) && row.pid > 0
    && row.group === receipt.leaderPid && typeof row.birth === "string" && row.birth.length > 0
    && /^[a-f0-9]{64}$/u.test(row.commandSha256)), "process birth binding");
  assert.ok(receipt.observedProcessBirths.some(row => row.pid === receipt.leaderPid), "process leader observed");
}

function assertCompleteTests(report, total) {
  for (const [field, expected] of Object.entries({ tests: total, pass: total, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    const matches = [...report.matchAll(new RegExp(`^# ${field} (\\d+)$`, "gmu"))];
    assert.equal(matches.length, 1, `test report ${field}`);
    assert.equal(Number(matches[0][1]), expected, `test report ${field}`);
  }
}

export function loadGarminCliCoverageEvidence({ projectRoot, targetFiles, tests, testReportPath,
  evidenceDirectory = process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY ?? path.join(projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY) }) {
  try {
    const directory = realpathSync(evidenceDirectory);
    function readBound(entry) {
      const file = path.join(directory, entry.path);
      assert.ok(lstatSync(file).isFile(), `regular evidence file: ${entry.path}`);
      assert.equal(realpathSync(file), file, `non-symlink evidence file: ${entry.path}`);
      const bytes = readFileSync(file);
      assert.equal(sha256(bytes), entry.sha256, `evidence hash: ${entry.path}`);
      return bytes;
    }
    // The reviewed seal binds the complete schema, source commit/version, command,
    // process-tree cleanup, toolchain/input manifest, successful receipt and raw set.
    // A changed descriptor is rejected before parsing; there is no trust in percentages.
    const sealed = readBound({ path: "evidence.json", sha256: GARMIN_CLI_EVIDENCE_SHA256 });
    const proof = JSON.parse(sealed);
    readBound(proof.producerScript);
    assert.equal(proof.proof, "NON_NATIVE_HOST_ONLY");
    assert.equal(process.versions.node, proof.runtime.node, "pinned Node version");
    assert.equal(process.versions.v8, proof.runtime.v8, "pinned V8 version");
    assert.deepEqual(tests, proof.tests.files, "complete test file scope");
    const sourceFiles = proof.source.files.slice(0, 4);
    assert.deepEqual(targetFiles, sourceFiles.map(entry => entry.path), "exact helper scope");
    const root = realpathSync(projectRoot);
    for (const entry of proof.source.files) {
      assert.equal(sha256(readFileSync(path.join(root, entry.path))), entry.sha256, `source hash: ${entry.path}`);
    }
    const manifestBytes = readFileSync(path.join(root, proof.manifest.path));
    assert.equal(sha256(manifestBytes), proof.manifest.sha256);
    const manifest = JSON.parse(manifestBytes);
    assert.deepEqual(manifest.output, proof.output);
    // The producer validated every pinned NDK file/tree and public locked input.
    // Reuse that Mac compiler proof on Linux without executing/retagging a host backend.
    const committedWheel = path.join(root, path.dirname(proof.manifest.path), proof.output.filename);
    assert.equal(sha256(readFileSync(committedWheel)), proof.output.sha256, "committed wheel hash");
    readBound({ path: `output/${proof.output.filename}`, sha256: proof.output.sha256 });
    const receipt = JSON.parse(readBound(proof.receipt));
    assert.equal(receipt.manifestSha256, proof.manifest.sha256);
    assert.deepEqual(receipt.output, proof.output);
    assert.equal(receipt.native.sha256, proof.output.backendSha256);
    for (const invocation of proof.invocations) {
      assert.equal(invocation.exitCode, 0); assert.equal(invocation.signal, null);
      assert.equal(invocation.cleanup, "verified-empty");
      assertGarminCliProcessReceipt(JSON.parse(readBound(invocation.processReceipt)), invocation);
      const stdout = readBound(invocation.stdout).toString("utf8");
      readBound(invocation.stderr);
      if (invocation.kind === "tests") assertCompleteTests(stdout, proof.tests.total);
      else assert.deepEqual(JSON.parse(stdout), receipt, "successful CLI publication receipt");
    }
    // The sealed producer records the supervisor bytes actually used. Current
    // caller supervisors may evolve without changing these helper sources.
    assertCompleteTests(readFileSync(testReportPath, "utf8"), proof.tests.total);
    assert.deepEqual(readdirSync(path.join(directory, "raw")).sort(), proof.raw.map(entry => path.basename(entry.path)).sort(), "exact retained raw set");
    const urls = new Map(sourceFiles.map(entry => [pathToFileURL(path.join(proof.source.root, entry.path)).href,
      pathToFileURL(realpathSync(path.join(root, entry.path))).href]));
    const scripts = [];
    for (const entry of proof.raw) {
      const raw = JSON.parse(readBound(entry));
      for (const script of raw.result) {
        // Queries are real independent test imports of the same hash-bound bytes.
        const canonical = script.url.split(/[?#]/u)[0];
        const url = urls.get(canonical);
        if (url !== undefined) scripts.push({ ...script, url });
      }
    }
    assert.deepEqual(new Set(scripts.map(script => script.url)), new Set(urls.values()));
    scripts.push(...cachedCliSupplement(root, pathToFileURL(path.join(root, "scripts/verify-garmin-python-lock.mjs")).href));
    return scripts;
  } catch (error) {
    throw new Error("phase20_garmin_cli_evidence_invalid", { cause: error });
  }
}
