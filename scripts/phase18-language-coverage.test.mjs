import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PHASE18_LANGUAGE_COVERAGE_SPECS,
  loadPhase18LanguageCoverageReports,
  validatePhase18LanguageCoverageReport,
} from "./phase18-language-coverage.mjs";
import { createPhase18KotlinCoverageReport } from "./run-phase18-kotlin-coverage.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

function reportFor(spec) {
  const testPaths = spec.testPaths ?? [spec.testPath];
  const coverage = {};
  for (const metric of spec.metrics) {
    coverage[metric] = { covered: 12, missed: 0, total: 12, percent: 100 };
  }
  return {
    schema_version: 1,
    suite: spec.suite,
    status: "passed",
    runtime: { name: spec.language, version: "test" },
    sources: spec.sourcePaths.map((path) => ({ path, sha256: digest(path) })),
    tests: testPaths.map((path) => ({ path, sha256: digest(path) })),
    tests_run: spec.requiredCases.length,
    failures: 0,
    errors: 0,
    skipped: 0,
    required_cases: [...spec.requiredCases],
    executed_cases: [...spec.requiredCases],
    ...(spec.requiredClasses === undefined ? {} : { covered_classes: [...spec.requiredClasses] }),
    coverage,
  };
}

const readBytes = (path) => Buffer.from(path);

test("Kotlin coverage explicitly enumerates every security-critical Garmin source, test, class and metric", () => {
  const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
  assert.deepEqual(spec.metrics, ["statements", "branches", "functions", "lines"]);
  assert.deepEqual(spec.sourcePaths, [
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminClientWorker.kt",
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminPythonContainers.kt",
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminAdversarialSuiteRunner.kt",
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminTokenStore.kt",
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminEvidenceArmStore.kt",
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminStoredSessionEvidenceRunner.kt",
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectPlatformBindings.kt",
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt",
  ]);
  assert.deepEqual(spec.testPaths, [
    "modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminTokenStoreTest.kt",
    "modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminPythonContainersTest.kt",
    "modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminEvidenceArmStoreTest.kt",
    "modules/garmin-connect/android/src/test/java/expo/modules/garminconnect/GarminConnectModuleTest.kt",
  ]);
  assert.deepEqual(spec.requiredClasses, [
    "expo/modules/garminconnect/GarminConnectModule",
    "expo/modules/garminconnect/GarminConnectModuleKt",
    "expo/modules/garminconnect/GarminConnectPlatformBindings",
    "expo/modules/garminconnect/GarminEvidenceAuthorizationController",
    "expo/modules/garminconnect/GarminEvidenceExecutionIdentity",
    "expo/modules/garminconnect/GarminClientWorker",
    "expo/modules/garminconnect/GarminClientWorkerKt",
    "expo/modules/garminconnect/GarminPythonContainers",
    "expo/modules/garminconnect/GarminPythonKind",
    "expo/modules/garminconnect/ChaquopyGarminPythonDispatcher",
    "expo/modules/garminconnect/GarminAdversarialSuiteRunner",
    "expo/modules/garminconnect/GarminTokenStore",
    "expo/modules/garminconnect/AndroidGarminAtomicWriter",
    "expo/modules/garminconnect/AndroidKeystoreGarminTokenCipher",
    "expo/modules/garminconnect/GarminEvidenceArmStore",
    "expo/modules/garminconnect/GarminStoredSessionEvidenceRunner",
    "expo/modules/garminconnect/GarminAdversarialRotationGate",
    "expo/modules/garminconnect/GarminRuntimeInfo",
    "expo/modules/garminconnect/GarminBenchmarkRuntimeInfo",
  ]);
  assert.deepEqual(spec.branchlessClasses, [
    "expo/modules/garminconnect/GarminPythonKind",
    "expo/modules/garminconnect/GarminConnectModule",
    "expo/modules/garminconnect/GarminConnectPlatformBindings",
    "expo/modules/garminconnect/GarminEvidenceExecutionIdentity",
    "expo/modules/garminconnect/ChaquopyGarminPythonDispatcher",
    "expo/modules/garminconnect/AndroidKeystoreGarminTokenCipher",
    "expo/modules/garminconnect/GarminRuntimeInfo",
  ]);
  const gradle = readFileSync("modules/garmin-connect/android/build.gradle", "utf8");
  for (const className of spec.requiredClasses) {
    const escaped = className.replaceAll("/", "\\/").replaceAll("$", "\\$");
    assert.match(gradle, new RegExp(`include '${escaped}\\*?\\.class'`, "u"));
  }
  assert.doesNotMatch(gradle, /exclude\s/u);
});

test("Kotlin coverage rejects a 100 percent aggregate XML that omits the actual Garmin module", () => {
  const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlin;
  const actualModule = "expo/modules/garminconnect/GarminConnectModule";
  const counters = '<counter type="INSTRUCTION" missed="0" covered="10"/><counter type="BRANCH" missed="0" covered="10"/><counter type="METHOD" missed="0" covered="10"/><counter type="LINE" missed="0" covered="10"/>';
  const classes = [...new Set([...spec.requiredClasses, actualModule])];
  const completeXml = `<report>${classes.map((name) => `<class name="${name}">${counters}</class>`).join("")}${counters}</report>`;
  const omittedXml = completeXml.replace(`<class name="${actualModule}">${counters}</class>`, "");
  const suite = `<testsuite tests="${spec.requiredCases.length}" skipped="0" failures="0" errors="0">${spec.requiredCases.map((name) => `<testcase name="${name}"/>`).join("")}</testsuite>`;

  assert.match(omittedXml, /<counter type="BRANCH" missed="0" covered="10"\/>/u);
  assert.throws(
    () => createPhase18KotlinCoverageReport({
      jacocoXml: omittedXml,
      junitXmls: spec.testPaths.map(() => suite),
      readBytes,
    }),
    /phase18_kotlin_coverage_class_missing/u,
  );
});

test("language coverage reports bind current sources and every required branch case", () => {
  for (const spec of Object.values(PHASE18_LANGUAGE_COVERAGE_SPECS)) {
    assert.equal(validatePhase18LanguageCoverageReport(reportFor(spec), spec, readBytes), true);
  }
  const python = reportFor(PHASE18_LANGUAGE_COVERAGE_SPECS.python);
  const { tests, ...legacyPython } = python;
  assert.equal(validatePhase18LanguageCoverageReport({ ...legacyPython, test: tests[0] }, PHASE18_LANGUAGE_COVERAGE_SPECS.python, readBytes), true);
});

test("language coverage reports reject failed, stale, incomplete, or empty evidence", () => {
  for (const spec of Object.values(PHASE18_LANGUAGE_COVERAGE_SPECS)) {
    const valid = reportFor(spec);
    const emptyCounter = { covered: 0, missed: 0, total: 0, percent: 100 };
    const variants = [
      { ...valid, status: "failed" },
      { ...valid, failures: 1 },
      { ...valid, skipped: 1 },
      { ...valid, sources: [{ ...valid.sources[0], sha256: "a".repeat(64) }, ...valid.sources.slice(1)] },
      { ...valid, executed_cases: valid.executed_cases.slice(1) },
      { ...valid, coverage: { ...valid.coverage, [spec.metrics[0]]: emptyCounter } },
      { ...valid, coverage: null },
      ...spec.metrics.map((metric) => ({
        ...valid,
        coverage: { ...valid.coverage, [metric]: { covered: 11, missed: 1, total: 12, percent: 91.67 } },
      })),
      ...spec.metrics.map((metric) => ({
        ...valid,
        coverage: { ...valid.coverage, [metric]: null },
      })),
      { ...valid, tests: valid.tests.slice(1) },
      { ...valid, tests: undefined },
      ...(spec.requiredClasses === undefined ? [] : [{ ...valid, covered_classes: valid.covered_classes.slice(1) }]),
    ];
    for (const candidate of variants) {
      assert.throws(
        () => validatePhase18LanguageCoverageReport(candidate, spec, readBytes),
        /phase18_language_coverage_invalid/u,
      );
    }
  }
});

test("Phase 18 loading fails closed when either language report is absent", () => {
  assert.throws(
    () => loadPhase18LanguageCoverageReports({
      projectRoot: "/repo",
      readBytes,
      readJson: (path) => {
        if (path.endsWith("python-coverage.json")) {
          return reportFor(PHASE18_LANGUAGE_COVERAGE_SPECS.python);
        }
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
      },
    }),
    /phase18_language_coverage_missing/u,
  );
});

test("Phase 18 loading resolves current source-bound reports from disk", () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "phase18-language-coverage-"));
  try {
    for (const spec of Object.values(PHASE18_LANGUAGE_COVERAGE_SPECS)) {
      for (const relativePath of [...spec.sourcePaths, ...(spec.testPaths ?? [spec.testPath])]) {
        const absolutePath = path.join(projectRoot, relativePath);
        mkdirSync(path.dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, relativePath);
      }
      const reportPath = path.join(projectRoot, spec.reportPath);
      mkdirSync(path.dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, JSON.stringify(reportFor(spec)));
    }
    assert.deepEqual(
      Object.keys(loadPhase18LanguageCoverageReports({ projectRoot })).sort(),
      ["kotlin", "python"],
    );
  } finally {
    rmSync(projectRoot, { force: true, recursive: true });
  }
});
