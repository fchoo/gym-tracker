#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { PHASE18_LANGUAGE_COVERAGE_SPECS } from "./phase18-language-coverage.mjs";

const JACOCO_REPORT = "modules/garmin-connect/android/build/reports/jacoco/phase18-garmin-kotlin.xml";
const JUNIT_REPORT = "modules/garmin-connect/android/build/test-results/testDebugUnitTest/TEST-expo.modules.garminconnect.GarminTokenStoreTest.xml";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const defaultReadBytes = (projectRoot, relativePath) => readFileSync(path.join(projectRoot, relativePath));
const defaultReadText = (projectRoot, relativePath) => readFileSync(path.join(projectRoot, relativePath), "utf8");
const defaultRunGradle = (projectRoot, exec = execFileSync, env = process.env) => exec(
  path.join(projectRoot, "android/gradlew"),
  ["--no-daemon", "-p", "android", ":garmin-connect:phase18GarminKotlinCoverageReport"],
  { cwd: projectRoot, env, stdio: "inherit" },
);
const defaultWriteReport = (projectRoot, relativePath, report, {
  mkdir = mkdirSync,
  write = writeFileSync,
} = {}) => {
  const output = path.join(projectRoot, relativePath);
  mkdir(path.dirname(output), { recursive: true });
  write(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "w" });
};

function xmlAttribute(source, name) {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u").exec(source);
  if (match === null) throw new Error("phase18_kotlin_coverage_xml_invalid");
  return match[1];
}

function integerAttribute(source, name) {
  const value = Number(xmlAttribute(source, name));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("phase18_kotlin_coverage_xml_invalid");
  return value;
}

function counter(jacocoXml, type) {
  const matches = [...jacocoXml.matchAll(/<counter type="([A-Z]+)" missed="([0-9]+)" covered="([0-9]+)"\/>/gu)]
    .filter((match) => match[1] === type);
  const match = matches.at(-1);
  if (match === undefined) throw new Error("phase18_kotlin_coverage_xml_invalid");
  const missed = Number(match[2]);
  const covered = Number(match[3]);
  const total = covered + missed;
  if (covered < 1 || total < 1) throw new Error("phase18_kotlin_coverage_empty");
  return Object.freeze({
    covered,
    missed,
    total,
    percent: Math.round((100 * covered / total) * 100) / 100,
  });
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function createPhase18KotlinCoverageReport(input) {
  const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
  const suiteTag = /<testsuite\b[^>]*>/u.exec(input.junitXml)?.[0];
  if (suiteTag === undefined) throw new Error("phase18_kotlin_coverage_xml_invalid");
  const executedCases = [...input.junitXml.matchAll(/<testcase\b[^>]*>/gu)]
    .map((match) => decodeXml(xmlAttribute(match[0], "name")))
    .sort();
  const missingCases = spec.requiredCases.filter((caseName) => !executedCases.includes(caseName));
  const failures = integerAttribute(suiteTag, "failures");
  const errors = integerAttribute(suiteTag, "errors");
  const skipped = integerAttribute(suiteTag, "skipped");
  const testsRun = integerAttribute(suiteTag, "tests");
  const coverage = Object.freeze({
    lines: counter(input.jacocoXml, "LINE"),
    branches: counter(input.jacocoXml, "BRANCH"),
  });
  const completeCoverage = Object.values(coverage).every((metric) => metric.missed === 0 && metric.percent === 100);
  return Object.freeze({
    schema_version: 1,
    suite: spec.suite,
    status: failures === 0 && errors === 0 && skipped === 0 && missingCases.length === 0 && completeCoverage
      ? "passed"
      : "failed",
    runtime: Object.freeze({ name: "kotlin", version: "jacoco-0.8.13" }),
    sources: Object.freeze(spec.sourcePaths.map((sourcePath) => Object.freeze({
      path: sourcePath,
      sha256: sha256(input.readBytes(sourcePath)),
    }))),
    test: Object.freeze({
      path: spec.testPath,
      sha256: sha256(input.readBytes(spec.testPath)),
    }),
    tests_run: testsRun,
    failures,
    errors,
    skipped,
    required_cases: spec.requiredCases,
    executed_cases: Object.freeze(executedCases),
    coverage,
  });
}

export function executePhase18KotlinCoverage(dependencies = {}) {
  const projectRoot = dependencies.projectRoot ?? process.cwd();
  const readBytes = dependencies.readBytes ?? ((relativePath) => defaultReadBytes(projectRoot, relativePath));
  const readText = dependencies.readText ?? ((relativePath) => defaultReadText(projectRoot, relativePath));
  const runGradle = dependencies.runGradle ?? (() => defaultRunGradle(
    projectRoot,
    dependencies.execFileSync,
    dependencies.env,
  ));
  const writeReport = dependencies.writeReport ?? ((relativePath, report) => defaultWriteReport(
    projectRoot,
    relativePath,
    report,
    { mkdir: dependencies.mkdirSync, write: dependencies.writeFileSync },
  ));
  runGradle();
  const report = createPhase18KotlinCoverageReport({
    jacocoXml: readText(JACOCO_REPORT),
    junitXml: readText(JUNIT_REPORT),
    readBytes,
  });
  if (report.status !== "passed") throw new Error("phase18_kotlin_coverage_tests_failed");
  writeReport(PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin.reportPath, report);
  return report;
}

export function executePhase18KotlinCoverageCli(dependencies = {}) {
  try {
    const report = executePhase18KotlinCoverage(dependencies);
    process.stdout.write(`${JSON.stringify({ status: report.status, coverage: report.coverage })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_kotlin_coverage_failed"}\n`);
    process.exitCode = 1;
  }
}
