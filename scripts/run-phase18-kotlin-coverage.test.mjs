import assert from "node:assert/strict";
import test from "node:test";

import {
  createPhase18KotlinCoverageReport,
  executePhase18KotlinCoverage,
} from "./run-phase18-kotlin-coverage.mjs";
import { PHASE18_LANGUAGE_COVERAGE_SPECS } from "./phase18-language-coverage.mjs";

const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
const suite = ({ failures = 0 } = {}) => `<testsuite tests="${spec.requiredCases.length}" skipped="0" failures="${failures}" errors="0">${spec.requiredCases.map((name) => `<testcase name="${name}"/>`).join("")}</testsuite>`;
const counters = '<counter type="INSTRUCTION" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/><counter type="METHOD" missed="0" covered="10"/><counter type="LINE" missed="0" covered="10"/>';
const jacoco = `<report>${spec.requiredClasses.map((name) => `<class name="${name}">${counters}</class>`).join("")}${counters}</report>`;
const junitXmls = () => spec.testPaths.map(() => suite());

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
    readText: (path) => path.endsWith(".xml") && path.includes("jacoco") ? jacoco : suite(),
    readBytes: (path) => Buffer.from(path),
    writeReport: (path, value) => calls.push([path, value.status]),
  });
  assert.equal(report.status, "passed");
  assert.deepEqual(calls, ["gradle", [spec.reportPath, "passed"]]);
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
