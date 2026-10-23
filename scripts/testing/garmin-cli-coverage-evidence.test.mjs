import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { collectPhase20SubprocessCoverage, runPhase20SubprocessCoverage } from "../phase20-subprocess-coverage.mjs";
import { GARMIN_CLI_EVIDENCE_DIRECTORY, GARMIN_CLI_EVIDENCE_SHA256, loadGarminCliCoverageEvidence } from "../garmin-cli-coverage-evidence.mjs";

const root = process.cwd();
const evidence = process.env.PHASE20_GARMIN_CLI_COVERAGE_DIRECTORY ?? path.join(root, GARMIN_CLI_EVIDENCE_DIRECTORY);
const modules = ["scripts/verify-garmin-python-lock.mjs", "scripts/garmin-android-native.mjs", "scripts/build-android-cffi.mjs", "scripts/verify-garmin-android-binaries.mjs"];
const tests = modules.map(file => file.replace(".mjs", ".test.mjs"));
const descriptor = JSON.parse(readFileSync(path.join(evidence, "evidence.json")));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const target = realpathSync(mkdtempSync(path.join(tmpdir(), "garmin-cli-proof-")));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  cpSync(evidence, path.join(target, GARMIN_CLI_EVIDENCE_DIRECTORY), { recursive: true });
  for (const file of [...modules, ...tests, descriptor.manifest.path]) {
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    writeFileSync(path.join(target, file), readFileSync(path.join(root, file)));
  }
  const wheel = path.join(path.dirname(descriptor.manifest.path), descriptor.output.filename);
  writeFileSync(path.join(target, wheel), readFileSync(path.join(root, wheel)));
  return { projectRoot: target, targetFiles: modules, tests, testReportPath: path.join(target, GARMIN_CLI_EVIDENCE_DIRECTORY, "tests.stdout") };
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
    ["tests", directory => writeFileSync(path.join(directory, "tests.stdout"), "# tests 24\n# pass 24\n# skipped 1\n")],
  ]) await t.test(name, t => {
    const options = fixture(t);
    mutate(path.join(options.projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY));
    assert.throws(() => loadGarminCliCoverageEvidence({ ...options, evidenceDirectory: path.join(options.projectRoot, GARMIN_CLI_EVIDENCE_DIRECTORY) }), /phase20_garmin_cli_evidence_invalid/u);
  });
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
    ["skipped", options => { writeFileSync(options.testReportPath, "# tests 24\n# pass 24\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n"); return options; }],
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
