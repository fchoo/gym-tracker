import assert from "node:assert/strict";
import test from "node:test";

import {
  createPhase18KotlinCoverageReport,
  executePhase18KotlinCoverage,
} from "./run-phase18-kotlin-coverage.mjs";
import { PHASE18_LANGUAGE_COVERAGE_SPECS } from "./phase18-language-coverage.mjs";

const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
const suite = ({ failures = 0 } = {}) => `<testsuite tests="${spec.requiredCases.length}" skipped="0" failures="${failures}" errors="0">${spec.requiredCases.map((name) => `<testcase name="${name}"/>`).join("")}</testsuite>`;
const jacoco = '<report><counter type="LINE" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/></report>';

test("Kotlin coverage collector binds JaCoCo counters, executed cases, and source hashes", () => {
  const report = createPhase18KotlinCoverageReport({
    jacocoXml: jacoco,
    junitXml: suite(),
    readBytes: (path) => Buffer.from(path),
  });
  assert.equal(report.status, "passed");
  assert.deepEqual(report.coverage, {
    lines: { covered: 10, missed: 0, total: 10, percent: 100 },
    branches: { covered: 10, missed: 0, total: 10, percent: 100 },
  });
  assert.deepEqual(report.executed_cases, [...spec.requiredCases].sort());
});

test("Kotlin coverage collector fails closed for missing counters or test failures", () => {
  assert.throws(
    () => createPhase18KotlinCoverageReport({ jacocoXml: "<report/>", junitXml: suite(), readBytes: () => Buffer.from("x") }),
    /phase18_kotlin_coverage_xml_invalid/u,
  );
  const report = createPhase18KotlinCoverageReport({
    jacocoXml: jacoco,
    junitXml: suite({ failures: 1 }),
    readBytes: () => Buffer.from("x"),
  });
  assert.equal(report.status, "failed");
  const incomplete = createPhase18KotlinCoverageReport({
    jacocoXml: '<report><counter type="LINE" missed="1" covered="9"/><counter type="BRANCH" missed="0" covered="10"/></report>',
    junitXml: suite(),
    readBytes: () => Buffer.from("x"),
  });
  assert.equal(incomplete.status, "failed");
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
