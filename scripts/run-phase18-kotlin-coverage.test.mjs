import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createPhase18KotlinCoverageReport,
  executePhase18KotlinCoverage,
  createPhase18KotlinReadinessCoverageReport,
  executePhase18KotlinReadinessCoverage,
  executePhase18KotlinCoverageCli,
} from "./run-phase18-kotlin-coverage.mjs";
import { PHASE18_LANGUAGE_COVERAGE_SPECS } from "./phase18-language-coverage.mjs";
import * as kotlinRunner from "./run-phase18-kotlin-coverage.mjs";

const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
const suite = ({ failures = 0 } = {}) => `<testsuite tests="${spec.requiredCases.length}" skipped="0" failures="${failures}" errors="0">${spec.requiredCases.map((name) => `<testcase name="${name}"/>`).join("")}</testsuite>`;
const counters = '<counter type="INSTRUCTION" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/><counter type="METHOD" missed="0" covered="10"/><counter type="LINE" missed="0" covered="10"/>';
const jacoco = `<report>${spec.requiredClasses.map((name) => `<class name="${name}">${counters}</class>`).join("")}${counters}</report>`;
const junitXmls = () => spec.testPaths.map(() => suite());
const hostRoot = "modules/garmin-connect/android/src/test/host/readiness";
const producerPath = `${hostRoot}/run-host-tool-bindings-coverage.py`;
const producerTestPath = `${hostRoot}/test_host_coverage_producer.py`;
const hostReportPath = "coverage/phase18/host-tool-bindings-coverage.json";

function hostToolsFixture() {
  const readBytes = (file) => {
    try { return readFileSync(file); }
    catch { return Buffer.from(file); }
  };
  const bind = (files) => files.map(file => ({ path: file, sha256: createHash("sha256").update(readBytes(file)).digest("hex") }));
  const cases = [];
  let owner;
  for (const line of readBytes(`${hostRoot}/test_host_tool_bindings.py`).toString().split(/\r?\n/u)) {
    const declaration = /^class (\w+)\(unittest\.TestCase\):/u.exec(line);
    if (declaration) owner = declaration[1];
    const method = /^    def (test_\w+)\(/u.exec(line);
    if (owner && method) cases.push(`test_host_tool_bindings.${owner}.${method[1]}`);
  }
  const counter = (count) => ({ covered: count, missed: 0, total: count, percent: 100 });
  return { readBytes, raw: {
    schema_version: 1, suite: "phase18-garmin-host-tool-bindings", status: "passed",
    runtime_proof: "NON_NATIVE_CONTROLLED_TOOL_PATH_FIXTURES; no compiler/APK/provider proof",
    runtime: { name: "python", version: "3.14.8", venv: true }, coverage_engine: "7.16.2",
    coverage: { statements: counter(58), lines: counter(58), branches: counter(20), functions: counter(6) },
    tests_run: 16, skipped: 0, failures: 0, errors: 0,
    required_cases: cases.sort(), executed_cases: cases.sort(),
    sources: bind([`${hostRoot}/host_tool_bindings.py`]), tests: bind([`${hostRoot}/test_host_tool_bindings.py`]),
    support: bind([`${hostRoot}/run-kotlin.py`, `${hostRoot}/seal-kotlin.py`, producerPath, producerTestPath]),
    producer_sha256: bind([producerPath])[0].sha256,
    source_unchanged: true, missing_functions: [], exclusions: [],
  } };
}

test("default readiness validates the complete host-tools gate before compiler execution", () => {
  const fixture = readinessFixture(); const tools = hostToolsFixture(); const calls = [];
  executePhase18KotlinReadinessCoverage({
    projectRoot: "/repo", runHostTools: () => calls.push("host-tools-tests"),
    runHost: () => calls.push("compiler"), readBytes: tools.readBytes,
    readText: file => file.endsWith("host-tool-bindings-coverage.json") ? JSON.stringify(tools.raw)
      : file.endsWith(".json") ? JSON.stringify(fixture.raw) : file.endsWith(".xml") ? fixture.jacocoXml : fixture.log,
    writeReport: (file, report) => calls.push([file, report.status]),
  });
  assert.deepEqual(calls, ["host-tools-tests", [hostReportPath, "passed"], "compiler", [PHASE18_LANGUAGE_COVERAGE_SPECS.kotlinReadiness.reportPath, "passed"]]);
});

test("default readiness never compiles or publishes when host-tools evidence fails", () => {
  const fixture = readinessFixture(); const tools = hostToolsFixture(); let compiles = 0;
  assert.throws(() => executePhase18KotlinReadinessCoverage({
    projectRoot: "/repo", runHostTools: () => {}, runHost: () => { compiles++; }, readBytes: tools.readBytes,
    readText: file => file.endsWith("host-tool-bindings-coverage.json") ? JSON.stringify({ ...tools.raw, status: "failed" })
      : file.endsWith(".json") ? JSON.stringify(fixture.raw) : file.endsWith(".xml") ? fixture.jacocoXml : fixture.log,
    writeReport: () => {},
  }), /phase18_host_tools_coverage_invalid/u);
  assert.equal(compiles, 0);
});

test("host-tools receipts reject partial execution, loose counters, exclusions, drift and stale producer bindings", () => {
  const fixture = hostToolsFixture();
  const variants = [null, [], {},
    { ...fixture.raw, schema_version: 2 }, { ...fixture.raw, suite: "other" },
    { ...fixture.raw, status: "failed" }, { ...fixture.raw, runtime_proof: "native" },
    { ...fixture.raw, runtime: null }, { ...fixture.raw, runtime: { name: "python", version: "test" } },
    { ...fixture.raw, runtime: { name: "other", version: "3.14.8", venv: true } },
    { ...fixture.raw, runtime: { name: "python", version: "test", venv: true } },
    { ...fixture.raw, runtime: { name: "python", version: "", venv: true } },
    { ...fixture.raw, runtime: { name: "python", version: 3, venv: true } },
    { ...fixture.raw, coverage_engine: "0.0.0" }, { ...fixture.raw, tests_run: 17 },
    { ...fixture.raw, tests_run: 15 }, { ...fixture.raw, tests_run: 16.5 },
    { ...fixture.raw, skipped: 1 }, { ...fixture.raw, failures: 1 }, { ...fixture.raw, errors: 1 },
    { ...fixture.raw, required_cases: fixture.raw.required_cases.slice(1) },
    { ...fixture.raw, executed_cases: [...fixture.raw.executed_cases.slice(1), fixture.raw.executed_cases[1]] },
    { ...fixture.raw, executed_cases: [...fixture.raw.executed_cases, "extra"] },
    { ...fixture.raw, source_unchanged: false }, { ...fixture.raw, missing_functions: ["missing"] },
    { ...fixture.raw, exclusions: [1] }, { ...fixture.raw, sources: [] }, { ...fixture.raw, tests: [] },
    { ...fixture.raw, support: fixture.raw.support.slice(1) }, { ...fixture.raw, producer_sha256: "a".repeat(64) },
    { ...fixture.raw, coverage: { ...fixture.raw.coverage, extra: {} } },
    { ...fixture.raw, coverage: { ...fixture.raw.coverage, functions: { covered: 7, missed: 0, total: 7, percent: 100 } } },
    { ...fixture.raw, coverage: { ...fixture.raw.coverage, lines: { ...fixture.raw.coverage.lines, extra: 1 } } },
    ...["statements", "branches", "functions", "lines"].flatMap(metric => [
      { ...fixture.raw, coverage: { ...fixture.raw.coverage, [metric]: { covered: 0, missed: 0, total: 0, percent: 100 } } },
      { ...fixture.raw, coverage: { ...fixture.raw.coverage, [metric]: { covered: 1, missed: 1, total: 2, percent: 100 } } },
      { ...fixture.raw, coverage: { ...fixture.raw.coverage, [metric]: { ...fixture.raw.coverage[metric], percent: "100" } } },
    ]),
  ];
  for (const candidate of variants) assert.throws(() => kotlinRunner.validatePhase18HostToolsCoverageReport(candidate, fixture.readBytes), /phase18_host_tools_coverage_invalid/u);
  assert.equal(kotlinRunner.validatePhase18HostToolsCoverageReport(fixture.raw), true);
  assert.throws(() => kotlinRunner.validatePhase18HostToolsCoverageReport(fixture.raw, file => Buffer.concat([fixture.readBytes(file), Buffer.from("drift")])), /phase18_host_tools_coverage_invalid/u);
});

test("authored source cases, source exclusions and added functions cannot be hidden in a receipt", () => {
  for (const mutation of [
    { path: `${hostRoot}/test_host_tool_bindings.py`, change: text => text.replace('    def test_version_probe_errors_are_sanitized', '    def removed_case') },
    { path: `${hostRoot}/test_host_tool_bindings.py`, change: text => text.replace('    def test_version_probe_errors_are_sanitized', '    @unittest.skip("controlled")\n    def test_version_probe_errors_are_sanitized') },
    { path: `${hostRoot}/host_tool_bindings.py`, change: text => text + '\n# pragma: no cover\n' },
    { path: `${hostRoot}/host_tool_bindings.py`, change: text => text + '\ndef missed_function():\n    return None\n' },
  ]) {
    const fixture = hostToolsFixture();
    const changed = Buffer.from(mutation.change(fixture.readBytes(mutation.path).toString()));
    const readBytes = file => file === mutation.path ? changed : fixture.readBytes(file);
    const raw = structuredClone(fixture.raw);
    for (const group of ["sources", "tests", "support"]) raw[group] = raw[group].map(entry => ({ path: entry.path, sha256: createHash("sha256").update(readBytes(entry.path)).digest("hex") }));
    assert.throws(() => kotlinRunner.validatePhase18HostToolsCoverageReport(raw, readBytes), /phase18_host_tools_coverage_invalid/u);
  }
});

test("default Python binding requires an absolute configured or provisioned interpreter and propagates tool failures", () => {
  for (const python of [123, "relative/python"]) {
    assert.throws(() => executePhase18KotlinReadinessCoverage({ env: { GARMIN_READINESS_PYTHON: python }, runHostTools: () => assert.fail("must reject first") }), /phase18_host_tools_python_invalid/u);
  }
  const root = mkdtempSync(path.join(tmpdir(), "phase18-host-tool-binding-"));
  try {
    assert.throws(() => executePhase18KotlinReadinessCoverage({
      projectRoot: root, env: { GARMIN_READINESS_PYTHON: "/configured/.venv/bin/python" },
      execFileSync: (command, args) => { assert.equal(command, "/configured/.venv/bin/python"); assert.equal(args[0], producerPath); throw new Error("controlled interpreter failure"); },
    }), /controlled interpreter failure/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("readiness source inputs include the helper, its complete test and the committed producer", () => {
  for (const file of [`${hostRoot}/host_tool_bindings.py`, `${hostRoot}/test_host_tool_bindings.py`, producerPath, producerTestPath]) {
    assert.equal(PHASE18_LANGUAGE_COVERAGE_SPECS.kotlinReadiness.supportPaths.includes(file), true, file);
  }
});

// Synthetic collector fixtures are host-only, not Android runtime evidence.
function readinessFixture() {
  const readiness = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlinReadiness;
  const readBytes = (file) => readFileSync(file);
  const inputs = [...readiness.sourcePaths, ...readiness.testPaths, ...readiness.supportPaths]
    .map((file) => ({ path: file, sha256: createHash("sha256").update(readBytes(file)).digest("hex") }));
  const classes = {};
  const coverage = Object.fromEntries(readiness.metrics.map((metric) => [metric, { covered: 0, missed: 0, total: 0, percent: 100 }]));
  const line = readBytes(readiness.sourcePaths[0]).toString().split(/\r?\n/u)
    .findIndex((source) => source.includes('AsyncFunction("diagnoseTransportReadiness")')) + 1;
  const xml = readiness.requiredClasses.map((name) => {
    const source = name.includes("GarminTransportReadiness") ? "GarminTransportReadiness.kt"
      : name.includes("GarminConnectModule") ? "GarminConnectModule.kt" : "GarminConnectPlatformBindings.kt";
    classes[name] = Object.fromEntries(readiness.metrics.map((metric) => {
      const covered = metric === "branches" && readiness.branchlessClasses.includes(name) ? 0 : 10;
      coverage[metric].covered += covered; coverage[metric].total += covered;
      return [metric, { covered, missed: 0, total: covered, percent: 100 }];
    }));
    const callback = name.endsWith("$definition$1$3") ? `<method name="invokeSuspend" desc="(Ljava/lang/Object;)Ljava/lang/Object;" line="${line}"/>` : "";
    const block = [["statements", "INSTRUCTION"], ["branches", "BRANCH"], ["functions", "METHOD"], ["lines", "LINE"]]
      .filter(([metric]) => classes[name][metric].covered > 0)
      .map(([metric, type]) => `<counter type="${type}" missed="0" covered="${classes[name][metric].covered}"/>`).join("");
    return `<class name="${name}" sourcefilename="${source}">${callback}${block}</class>`;
  }).join("");
  return { readBytes, log: "OK (22 tests)\n", jacocoXml: `<report>${xml}</report>`, raw: {
    status: "passed", runtime_proof: readiness.runtimeProof, coverage_engine: "JaCoCo 0.8.13",
    tests_run: 22, skipped: 0, failures: 0, errors: 0, inputs, classes, coverage,
  } };
}

test("supplemental readiness binds real source headers and callback line instead of trusting host percentages", () => {
  const fixture = readinessFixture();
  const report = createPhase18KotlinReadinessCoverageReport(fixture);
  assert.equal(report.status, "passed");
  assert.equal(report.tests_run, 22);
  assert.equal(report.executed_cases.length, 22);
  assert.match(report.runtime_proof, /NON_NATIVE_HOST_ONLY/u);
  assert.equal(report.covered_classes.some((name) => name.endsWith("$definition$1$4")), false);
  const variants = [
    { raw: { ...fixture.raw, status: "failed" } },
    { raw: { ...fixture.raw, runtime_proof: "native" } },
    { raw: { ...fixture.raw, skipped: 1 } },
    { raw: { ...fixture.raw, inputs: fixture.raw.inputs.slice(1) } },
    { raw: { ...fixture.raw, tests_run: 21 } },
    { log: "OK (21 tests)\n" },
    { log: "OK (22 tests)\nOK (22 tests)\n" },
    { jacocoXml: fixture.jacocoXml.replace("GarminTransportReadiness.kt", "Other.kt") },
    { jacocoXml: fixture.jacocoXml.replace('$definition$1$3', '$definition$1$4') },
    { jacocoXml: fixture.jacocoXml.replace('missed="0"', 'missed="1"') },
    { jacocoXml: fixture.jacocoXml.replace('covered="10"', 'covered="0"') },
    { jacocoXml: fixture.jacocoXml.replace('name="invokeSuspend"', 'name="unaffectedOldCallback"') },
    { raw: { ...fixture.raw, classes: {} } },
    { raw: { ...fixture.raw, coverage: {} } },
    { readBytes: (file) => file.endsWith("Test.kt") ? Buffer.from("@Ignore\n" + fixture.readBytes(file)) : fixture.readBytes(file) },
  ];
  for (const variant of variants) assert.throws(() => createPhase18KotlinReadinessCoverageReport({ ...fixture, ...variant }), /phase18_kotlin_readiness_coverage_invalid/u);
  const wrongCounts = structuredClone(fixture.raw);
  wrongCounts.classes[Object.keys(wrongCounts.classes)[0]].lines.covered = 9;
  assert.throws(() => createPhase18KotlinReadinessCoverageReport({ ...fixture, raw: wrongCounts }), /phase18_kotlin_readiness_coverage_invalid/u);
});

test("readiness host collection publishes only validated supplemental evidence and never invokes Gradle", () => {
  const fixture = readinessFixture();
  const tools = hostToolsFixture();
  const calls = [];
  const report = executePhase18KotlinReadinessCoverage({
    projectRoot: "/repo", runHostTools: () => calls.push("tools"), runHost: () => calls.push("host"), readBytes: tools.readBytes,
    readText: (file) => file.endsWith("host-tool-bindings-coverage.json") ? JSON.stringify(tools.raw)
      : file.endsWith(".json") ? JSON.stringify(fixture.raw) : file.endsWith(".xml") ? fixture.jacocoXml : fixture.log,
    writeReport: (file, value) => calls.push([file, value.status]),
  });
  assert.equal(report.status, "passed");
  assert.deepEqual(calls, ["tools", [hostReportPath, "passed"], "host", [PHASE18_LANGUAGE_COVERAGE_SPECS.kotlinReadiness.reportPath, "passed"]]);
  assert.throws(() => executePhase18KotlinReadinessCoverage({ runHostTools: () => { throw new Error("missing pinned coverage"); }, writeReport: () => assert.fail("must not publish") }), /missing pinned coverage/u);
});

test("default host orchestration keeps fake APIs isolated and writes source-validated supplemental output", () => {
  const fixture = readinessFixture();
  const tools = hostToolsFixture();
  const root = mkdtempSync(path.join(tmpdir(), "phase18-kotlin-host-default-"));
  try {
    symlinkSync(path.resolve("modules"), path.join(root, "modules"));
    const calls = [];
    executePhase18KotlinReadinessCoverage({
      projectRoot: root,
      execFileSync: (command, args, options) => {
        calls.push([command, args, options.timeout]);
        assert.equal(options.cwd, root);
        assert.equal(options.env.GARMIN_READINESS_OUTPUT, path.join(root, "coverage/phase18/readiness-host"));
        assert.equal(options.env.PYTHONDONTWRITEBYTECODE, "1");
        if (args[0] === producerPath) {
          writeFileSync(path.join(options.env.GARMIN_READINESS_OUTPUT, "host-tool-bindings-coverage.json"), JSON.stringify(tools.raw));
          return "controlled host-only proof\n";
        }
        assert.equal(JSON.parse(readFileSync(path.join(root, hostReportPath))).status, "passed");
        if (args[0].endsWith("run-kotlin.py")) return fixture.log;
        writeFileSync(path.join(options.env.GARMIN_READINESS_OUTPUT, "kotlin-four-metrics.json"), JSON.stringify(fixture.raw));
        writeFileSync(path.join(options.env.GARMIN_READINESS_OUTPUT, "kotlin-all.xml"), fixture.jacocoXml);
      },
    });
    assert.equal(calls.length, 3);
    assert.equal(calls.every(([command, _args, timeout]) => command === path.join(root, ".venv/bin/python") && timeout === 120_000), true);
    assert.deepEqual(calls.map(([_command, args]) => args[0]), [producerPath, `${hostRoot}/run-kotlin.py`, `${hostRoot}/seal-kotlin.py`]);
    assert.equal(JSON.parse(readFileSync(path.join(root, PHASE18_LANGUAGE_COVERAGE_SPECS.kotlinReadiness.reportPath))).runtime_proof,
      PHASE18_LANGUAGE_COVERAGE_SPECS.kotlinReadiness.runtimeProof);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("combined Kotlin CLI reports both gates and fails closed without relabelling errors", () => {
  const stdout = process.stdout.write; const stderr = process.stderr.write; const exitCode = process.exitCode;
  const out = []; const err = [];
  process.stdout.write = (text) => { out.push(text); return true; };
  process.stderr.write = (text) => { err.push(text); return true; };
  try {
    const dependencies = { runGradle: () => {}, readText: (file) => file.includes("jacoco") ? jacoco : suite(),
      readBytes: (file) => Buffer.from(file), writeReport: () => {}, runReadiness: () => {} };
    executePhase18KotlinCoverageCli(dependencies);
    assert.equal(JSON.parse(out[0]).status, "passed");
    executePhase18KotlinCoverageCli({ ...dependencies, runReadiness: () => { throw new Error("host tool binding absent"); } });
    assert.equal(process.exitCode, 1);
    assert.match(err[0], /host tool binding absent/u);
    executePhase18KotlinCoverageCli({ ...dependencies, runGradle: () => { throw "non-error failure"; } });
    assert.match(err[1], /phase18_kotlin_coverage_failed/u);
  } finally { process.stdout.write = stdout; process.stderr.write = stderr; process.exitCode = exitCode; }
});

test("Kotlin coverage collector binds JaCoCo counters, executed cases, and source hashes", () => {
  const report = createPhase18KotlinCoverageReport({
    jacocoXml: jacoco,
    junitXmls: junitXmls(),
    readBytes: (path) => Buffer.from(path),
  });
  assert.equal(report.status, "passed");
  assert.deepEqual(report.coverage, {
    statements: { covered: 10, missed: 0, total: 10, percent: 100 },
    branches: { covered: 10, missed: 0, total: 10, percent: 100 },
    functions: { covered: 10, missed: 0, total: 10, percent: 100 },
    lines: { covered: 10, missed: 0, total: 10, percent: 100 },
  });
  assert.deepEqual(report.executed_cases, [...spec.requiredCases].sort());
  assert.deepEqual(report.covered_classes, [...spec.requiredClasses]);

  const withEmptyCompilerClass = createPhase18KotlinCoverageReport({
    jacocoXml: jacoco.replace("<report>", '<report><class name="compiler/generated/Empty"/>'),
    junitXmls: junitXmls(),
    readBytes: (path) => Buffer.from(path),
  });
  assert.equal(withEmptyCompilerClass.status, "passed");

  const branchlessClass = spec.branchlessClasses[0];
  const branchlessBlock = `<class name="${branchlessClass}">${counters}</class>`;
  const withoutVacuousBranchCounter = jacoco.replace(
    branchlessBlock,
    branchlessBlock.replace('<counter type="BRANCH" missed="0" covered="10"/>', ""),
  );
  assert.equal(createPhase18KotlinCoverageReport({
    jacocoXml: withoutVacuousBranchCounter,
    junitXmls: junitXmls(),
    readBytes: (path) => Buffer.from(path),
  }).status, "passed");
});

test("Kotlin coverage collector fails closed for missing counters or test failures", () => {
  assert.throws(
    () => createPhase18KotlinCoverageReport({ jacocoXml: jacoco, junitXml: suite(), readBytes: () => Buffer.from("x") }),
    /phase18_kotlin_coverage_xml_invalid/u,
  );
  assert.throws(
    () => createPhase18KotlinCoverageReport({ jacocoXml: jacoco, junitXmls: "invalid", readBytes: () => Buffer.from("x") }),
    /phase18_kotlin_coverage_xml_invalid/u,
  );
  assert.throws(
    () => createPhase18KotlinCoverageReport({ jacocoXml: jacoco, junitXmls: [suite()], readBytes: () => Buffer.from("x") }),
    /phase18_kotlin_coverage_xml_invalid/u,
  );
  assert.throws(
    () => createPhase18KotlinCoverageReport({ jacocoXml: "<report/>", junitXmls: junitXmls(), readBytes: () => Buffer.from("x") }),
    /phase18_kotlin_coverage_xml_invalid/u,
  );
  const report = createPhase18KotlinCoverageReport({
    jacocoXml: jacoco,
    junitXmls: spec.testPaths.map(() => suite({ failures: 1 })),
    readBytes: () => Buffer.from("x"),
  });
  assert.equal(report.status, "failed");
  assert.throws(() => createPhase18KotlinCoverageReport({
    jacocoXml: jacoco.replace('<counter type="LINE" missed="0" covered="10"/>', '<counter type="LINE" missed="1" covered="9"/>'),
    junitXmls: junitXmls(),
    readBytes: () => Buffer.from("x"),
  }), /phase18_kotlin_coverage_class_incomplete/u);
  assert.throws(() => createPhase18KotlinCoverageReport({
    jacocoXml: jacoco.replace(`<class name="${spec.requiredClasses[0]}">${counters}</class>`, ""),
    junitXmls: junitXmls(),
    readBytes: () => Buffer.from("x"),
  }), /phase18_kotlin_coverage_class_missing/u);
  const branchingClass = spec.requiredClasses.find((name) => !spec.branchlessClasses.includes(name));
  const branchingBlock = `<class name="${branchingClass}">${counters}</class>`;
  assert.throws(() => createPhase18KotlinCoverageReport({
    jacocoXml: jacoco.replace(
      branchingBlock,
      branchingBlock.replace('<counter type="BRANCH" missed="0" covered="10"/>', ""),
    ),
    junitXmls: junitXmls(),
    readBytes: () => Buffer.from("x"),
  }), /phase18_kotlin_coverage_xml_invalid/u);
});

test("Kotlin coverage execution writes only after the focused Gradle task succeeds", () => {
  const calls = [];
  const report = executePhase18KotlinCoverage({
    projectRoot: "/repo",
    runGradle: () => calls.push("gradle"),
    runReadiness: () => calls.push("host-only-readiness"),
    readText: (path) => path.endsWith(".xml") && path.includes("jacoco") ? jacoco : suite(),
    readBytes: (path) => Buffer.from(path),
    writeReport: (path, value) => calls.push([path, value.status]),
  });
  assert.equal(report.status, "passed");
  assert.deepEqual(calls, ["gradle", [spec.reportPath, "passed"], "host-only-readiness"]);
});

test("Kotlin coverage execution fails when Gradle, JaCoCo, or the toolchain is unavailable", () => {
  const writes = [];
  assert.throws(() => executePhase18KotlinCoverage({
    projectRoot: "/repo",
    runGradle: () => {
      const error = new Error("missing wrapper");
      error.code = "ENOENT";
      throw error;
    },
    readBytes: (filePath) => Buffer.from(filePath),
    writeReport: (...args) => writes.push(args),
  }), /missing wrapper/u);

  assert.throws(
    () => executePhase18KotlinCoverage({
      projectRoot: "/repo",
      runGradle: () => {
        throw new Error("spawn ENOENT");
      },
      readBytes: (filePath) => Buffer.from(filePath),
      writeReport: () => {},
    }),
    /ENOENT/u,
  );
  assert.throws(
    () => executePhase18KotlinCoverage({
      projectRoot: "/repo",
      runGradle: () => {},
      readText: () => {
        const error = new Error("JaCoCo report missing");
        error.code = "ENOENT";
        throw error;
      },
      readBytes: (filePath) => Buffer.from(filePath),
      writeReport: (...args) => writes.push(args),
    }),
    /JaCoCo report missing/u,
  );
  assert.deepEqual(writes, []);
});
