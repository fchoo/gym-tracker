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

const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
const suite = ({ failures = 0 } = {}) => `<testsuite tests="${spec.requiredCases.length}" skipped="0" failures="${failures}" errors="0">${spec.requiredCases.map((name) => `<testcase name="${name}"/>`).join("")}</testsuite>`;
const counters = '<counter type="INSTRUCTION" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/><counter type="METHOD" missed="0" covered="10"/><counter type="LINE" missed="0" covered="10"/>';
const jacoco = `<report>${spec.requiredClasses.map((name) => `<class name="${name}">${counters}</class>`).join("")}${counters}</report>`;
const junitXmls = () => spec.testPaths.map(() => suite());

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
  const calls = [];
  const report = executePhase18KotlinReadinessCoverage({
    projectRoot: "/repo", runHost: () => calls.push("host"), readBytes: fixture.readBytes,
    readText: (file) => file.endsWith(".json") ? JSON.stringify(fixture.raw) : file.endsWith(".xml") ? fixture.jacocoXml : fixture.log,
    writeReport: (file, value) => calls.push([file, value.status]),
  });
  assert.equal(report.status, "passed");
  assert.deepEqual(calls, ["host", [PHASE18_LANGUAGE_COVERAGE_SPECS.kotlinReadiness.reportPath, "passed"]]);
  assert.throws(() => executePhase18KotlinReadinessCoverage({ runHost: () => { throw new Error("missing pinned compiler"); }, writeReport: () => assert.fail("must not publish") }), /missing pinned compiler/u);
});

test("default host orchestration keeps fake APIs isolated and writes source-validated supplemental output", () => {
  const fixture = readinessFixture();
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
        if (args[0].endsWith("run-kotlin.py")) return fixture.log;
        writeFileSync(path.join(options.env.GARMIN_READINESS_OUTPUT, "kotlin-four-metrics.json"), JSON.stringify(fixture.raw));
        writeFileSync(path.join(options.env.GARMIN_READINESS_OUTPUT, "kotlin-all.xml"), fixture.jacocoXml);
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls.every(([command, _args, timeout]) => command === "python3" && timeout === 120_000), true);
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
