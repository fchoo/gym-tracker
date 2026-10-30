import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { collectPhase20SubprocessCoverage, runPhase20SubprocessCoverage } from "../phase20-subprocess-coverage.mjs";
import { assertGarminCliProcessReceipt, GARMIN_CLI_EVIDENCE_DIRECTORY, GARMIN_CLI_EVIDENCE_SHA256, GARMIN_CACHED_CLI_SUPPLEMENT, loadGarminCliCoverageEvidence } from "../garmin-cli-coverage-evidence.mjs";

const root = process.cwd();
const evidence = process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY ?? path.join(root, GARMIN_CLI_EVIDENCE_DIRECTORY);
const modules = ["scripts/verify-garmin-python-lock.mjs", "scripts/garmin-android-native.mjs", "scripts/build-android-cffi.mjs", "scripts/verify-garmin-android-binaries.mjs"];
const tests = modules.map(file => file.replace(".mjs", ".test.mjs"));
const descriptor = JSON.parse(readFileSync(path.join(evidence, "evidence.json")));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const target = realpathSync(mkdtempSync(path.join(tmpdir(), "garmin-cli-proof-")));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  const copiedEvidence = path.join(target, GARMIN_CLI_EVIDENCE_DIRECTORY);
  cpSync(evidence, copiedEvidence, { recursive: true });
  const supplementDirectory = path.dirname(GARMIN_CACHED_CLI_SUPPLEMENT.path);
  mkdirSync(path.dirname(path.join(target, supplementDirectory)), { recursive: true });
  cpSync(path.join(root, supplementDirectory), path.join(target, supplementDirectory), { recursive: true });
  const supplemental = JSON.parse(readFileSync(path.join(root, GARMIN_CACHED_CLI_SUPPLEMENT.path)));
  for (const binding of [supplemental.execution, supplemental.before, supplemental.after, supplemental.report,
    supplemental.tool_before, supplemental.tool_after, supplemental.dependencies_before, supplemental.dependencies_after]) {
    mkdirSync(path.dirname(path.join(target, binding.path)), { recursive: true });
    writeFileSync(path.join(target, binding.path), readFileSync(path.join(root, binding.path)));
  }
  // Fault injection modifies only this disposable copy. The reviewed original
  // keeps its immutable modes and hash-bound bytes throughout the suite.
  const makeWritable = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) makeWritable(file);
      else if (entry.isFile()) chmodSync(file, 0o600);
    }
  };
  makeWritable(copiedEvidence);
  for (const file of [...modules, ...tests, descriptor.manifest.path]) {
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    writeFileSync(path.join(target, file), readFileSync(path.join(root, file)));
  }
  const wheel = path.join(path.dirname(descriptor.manifest.path), descriptor.output.filename);
  writeFileSync(path.join(target, wheel), readFileSync(path.join(root, wheel)));
  const testReportPath = path.join(target, "current-test-results.tap");
  writeFileSync(testReportPath, readFileSync(path.join(evidence, "tests.stdout")));
  return { projectRoot: target, targetFiles: modules, tests, testReportPath };
}

test("sealed real CLI ranges remap only exact bound helper sources across checkout roots", t => {
  const options = fixture(t);
  assert.equal(sha(readFileSync(path.join(evidence, "evidence.json"))), GARMIN_CLI_EVIDENCE_SHA256);
  const scripts = loadGarminCliCoverageEvidence(options);
  assert.ok(scripts.length > 4);
  assert.deepEqual(new Set(scripts.map(script => script.url)), new Set(modules.map(file => pathToFileURL(path.join(options.projectRoot, file)).href)));
  assert.ok(scripts.every(script => script.functions.length > 0));
  const prior = process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY;
  try {
    delete process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY;
    assert.deepEqual(loadGarminCliCoverageEvidence(options), scripts);
    process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY = path.join(options.projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY);
    assert.deepEqual(loadGarminCliCoverageEvidence({ ...options, projectRoot: root }).map(script => script.url), scripts.map(script => script.url.replace(options.projectRoot, root)));
  } finally {
    if (prior === undefined) delete process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY;
    else process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY = prior;
  }
});

test("evidence rejects missing, tampered, malformed, added and symlinked raw streams", async t => {
  for (const [name, mutate] of [
    ["missing", directory => rmSync(path.join(directory, "evidence.json"))],
    ["descriptor", directory => writeFileSync(path.join(directory, "evidence.json"), JSON.stringify({ ...descriptor, proof: "native" }))],
    ["raw", directory => writeFileSync(path.join(directory, descriptor.raw[0].path), "{malformed")],
    ["added", directory => writeFileSync(path.join(directory, "raw/extra.json"), "{}")],
    ["symlink", directory => { const file = path.join(directory, descriptor.raw[0].path); rmSync(file); symlinkSync(path.join(evidence, descriptor.raw[0].path), file); }],
    ["receipt", directory => writeFileSync(path.join(directory, descriptor.receipt.path), "{}")],
    ["stdout", directory => writeFileSync(path.join(directory, "cli.stdout"), "{}")],
    ["stderr", directory => writeFileSync(path.join(directory, "cli.stderr"), "failure")],
    ["producer", directory => writeFileSync(path.join(directory, descriptor.producerScript.path), "changed producer")],
    ["process receipt", directory => writeFileSync(path.join(directory, descriptor.invocations[0].processReceipt.path), "{}")],
    ["tests", directory => writeFileSync(path.join(directory, "tests.stdout"), `# tests ${descriptor.tests.total}\n# pass ${descriptor.tests.total}\n# skipped 1\n`)],
  ]) await t.test(name, t => {
    const options = fixture(t);
    mutate(path.join(options.projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY));
    assert.throws(() => loadGarminCliCoverageEvidence({ ...options, evidenceDirectory: path.join(options.projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY) }), /phase20_garmin_cli_evidence_invalid/u);
  });
});

test("reviewed process receipts require observed births and verified empty closure", async t => {
  const invocation = descriptor.invocations[0];
  const processReceipt = JSON.parse(readFileSync(path.join(evidence, invocation.processReceipt.path), "utf8"));
  assert.doesNotThrow(() => assertGarminCliProcessReceipt(processReceipt, invocation));
  const mutations = {
    null: () => null, array: () => [], kind: r => { r.kind = "unknown"; },
    ownership: r => { r.ownershipSha256 = "a".repeat(64); },
    cleanup: r => { r.cleanup = "unverified"; }, supervisor: r => { r.boundedSupervisorResolved = false; },
    live_group: r => { r.finalGroupRows = [{ pid: r.leaderPid }]; },
    leader_type: r => { r.leaderPid = 0.1; }, leader_range: r => { r.leaderPid = 0; },
    token_probes_type: r => { r.markerProbes = 0.1; }, token_probes_count: r => { r.markerProbes = 1; },
    snapshots_type: r => { r.snapshots = 0.1; }, snapshots_count: r => { r.snapshots = 0; },
    births_type: r => { r.observedProcessBirths = null; }, missing_leader: r => { r.observedProcessBirths = []; },
    child_pid_type: r => { r.observedProcessBirths[0].pid = 0.1; }, child_pid_range: r => { r.observedProcessBirths[0].pid = 0; },
    child_group: r => { r.observedProcessBirths[0].group = 0; }, birth_type: r => { r.observedProcessBirths[0].birth = null; },
    birth_empty: r => { r.observedProcessBirths[0].birth = ""; }, command_hash: r => { r.observedProcessBirths[0].commandSha256 = "bad"; },
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, () => {
    const copy = structuredClone(processReceipt);
    const changed = mutate(copy);
    assert.throws(() => assertGarminCliProcessReceipt(changed === undefined ? copy : changed, invocation));
  });
  assert.throws(() => assertGarminCliProcessReceipt({ ...processReceipt, ownershipSha256: "bad" }, { ...invocation, ownershipSha256: "bad" }), /process ownership hash/u);
});

test("all source/test, manifest and committed/output wheel bytes remain binding", async t => {
  for (const file of [...modules, ...tests, descriptor.manifest.path, path.join(path.dirname(descriptor.manifest.path), descriptor.output.filename), path.join(GARMIN_CLI_EVIDENCE_DIRECTORY, "output", descriptor.output.filename)]) await t.test(file, t => {
    const options = fixture(t);
    writeFileSync(path.join(options.projectRoot, file), "changed source or output");
    assert.throws(() => loadGarminCliCoverageEvidence({ ...options, evidenceDirectory: path.join(options.projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY) }), /phase20_garmin_cli_evidence_invalid/u);
  });
});

test("current full packaging test report and exact scope cannot be bypassed by retained proof", async t => {
  for (const [name, change] of [
    ["filtered scope", options => ({ ...options, tests: tests.slice(1) })],
    ["wrong target", options => ({ ...options, targetFiles: modules.slice(1) })],
    ["skipped", options => { writeFileSync(options.testReportPath, `# tests ${descriptor.tests.total}\n# pass ${descriptor.tests.total}\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n`); return options; }],
    ["stale pre-repair count", options => { writeFileSync(options.testReportPath, "# tests 24\n# pass 24\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n"); return options; }],
    ["empty", options => { writeFileSync(options.testReportPath, ""); return options; }],
    ["failed", options => { writeFileSync(options.testReportPath, readFileSync(path.join(evidence, "tests.stdout"), "utf8").replace("# fail 0", "# fail 1")); return options; }],
  ]) await t.test(name, t => {
    const options = change(fixture(t));
    assert.throws(() => loadGarminCliCoverageEvidence({ ...options, evidenceDirectory: path.join(options.projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY) }), /phase20_garmin_cli_evidence_invalid/u);
  });
});

test("the current converter must use the recorded pinned Node and V8 versions", t => {
  const options = fixture(t);
  for (const key of ["node", "v8"]) {
    const original = Object.getOwnPropertyDescriptor(process.versions, key);
    try {
      Object.defineProperty(process.versions, key, { value: "wrong-runtime" });
      assert.throws(() => loadGarminCliCoverageEvidence(options), /phase20_garmin_cli_evidence_invalid/u);
    } finally { Object.defineProperty(process.versions, key, original); }
  }
});

test("default packaging rejection preserves retained evidence and cleans owned temporary raw", async t => {
  const options = fixture(t);
  const directory = path.join(options.projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY);
  writeFileSync(path.join(directory, "cli.stdout"), "tampered");
  const prior = process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY;
  const output = path.join(options.projectRoot, "coverage");
  try {
    process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY = directory;
    await assert.rejects(runPhase20SubprocessCoverage({ projectRoot: root, projects: [{ name: "garmin-packaging", modules, tests }], outputDirectory: output }), /phase20_garmin_cli_evidence_invalid/u);
    assert.equal(readFileSync(path.join(directory, "cli.stdout"), "utf8"), "tampered");
    assert.equal(existsSync(path.join(output, ".process-ownership")), false);
    assert.equal(existsSync(path.join(output, "projects/garmin-packaging/raw-v8")), false);
    assert.equal(existsSync(path.join(output, "coverage-summary.json")), false);
  } finally {
    if (prior === undefined) delete process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY;
    else process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY = prior;
  }
});

test("default packaging collector closes the real CLI publication gap with full tests", async t => {
  const output = mkdtempSync(path.join(tmpdir(), "garmin-default-coverage-"));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  await runPhase20SubprocessCoverage({ projectRoot: root, projects: [{ name: "garmin-packaging", modules, tests }], outputDirectory: path.join(output, "coverage"), maxParallel: 1 });
  const summary = JSON.parse(readFileSync(path.join(output, "coverage/coverage-summary.json")));
  for (const file of modules) for (const metric of ["statements", "branches", "functions", "lines"]) assert.equal(summary[file][metric].pct, 100);
  // Independently recompute from the unmodified actual upstream stream, not percentages.
  const mapped = path.join(output, "mapped-real-raw");
  mkdirSync(mapped);
  const scripts = loadGarminCliCoverageEvidence({ projectRoot: root, targetFiles: modules, tests, testReportPath: path.join(output, "coverage/projects/garmin-packaging/test-results.tap") });
  writeFileSync(path.join(mapped, "verified-mapped.json"), JSON.stringify({ result: scripts }));
  const report = await collectPhase20SubprocessCoverage({ projectRoot: root, rawDirectory: mapped, targetFiles: modules });
  assert.deepEqual(report.failures, []);
});
