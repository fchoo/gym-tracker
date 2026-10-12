import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Python coverage fails closed without coverage.py and writes no passed report", () => {
  const outputRoot = mkdtempSync(path.join(tmpdir(), "phase18-python-coverage-"));
  const output = path.join(outputRoot, "python-coverage.json");
  try {
    const result = spawnSync(
      "python3",
      ["-S", "scripts/run-phase18-python-coverage.py", "--output", output],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(existsSync(output), false);
    assert.match(result.stderr, /phase18_python_coverage_dependency_missing/u);
    assert.doesNotMatch(result.stdout, /"status"\s*:\s*"passed"/u);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("Python coverage keeps measurement in memory and never writes .coverage", () => {
  const source = readFileSync("scripts/run-phase18-python-coverage.py", "utf8");
  assert.match(source, /data_file=None/u);
  assert.doesNotMatch(source, /coverage\.save\(\)/u);
});
