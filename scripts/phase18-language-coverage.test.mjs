import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PHASE18_LANGUAGE_COVERAGE_SPECS,
  loadPhase18LanguageCoverageReports,
  validatePhase18LanguageCoverageReport,
} from "./phase18-language-coverage.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

function reportFor(spec) {
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
    test: { path: spec.testPath, sha256: digest(spec.testPath) },
    tests_run: spec.requiredCases.length,
    failures: 0,
    errors: 0,
    skipped: 0,
    required_cases: [...spec.requiredCases],
    executed_cases: [...spec.requiredCases],
    coverage,
  };
}

const readBytes = (path) => Buffer.from(path);

test("language coverage reports bind current sources and every required branch case", () => {
  for (const spec of Object.values(PHASE18_LANGUAGE_COVERAGE_SPECS)) {
    assert.equal(validatePhase18LanguageCoverageReport(reportFor(spec), spec, readBytes), true);
  }
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
      ...spec.metrics.map((metric) => ({
        ...valid,
        coverage: { ...valid.coverage, [metric]: { covered: 11, missed: 1, total: 12, percent: 91.67 } },
      })),
      ...spec.metrics.map((metric) => ({
        ...valid,
        coverage: { ...valid.coverage, [metric]: null },
      })),
      { ...valid, test: { path: spec.testPath } },
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
      for (const relativePath of [...spec.sourcePaths, spec.testPath]) {
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
