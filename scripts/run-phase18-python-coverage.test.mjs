import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("Python coverage fails closed for an unpinned coverage.py version", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "phase18-python-version-"));
  const output = path.join(tempRoot, "python-coverage.json");
  writeFileSync(path.join(tempRoot, "coverage.py"), "__version__ = '0.0.0'\n");
  try {
    const result = spawnSync(
      "python3",
      ["-S", "scripts/run-phase18-python-coverage.py", "--output", output],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, PYTHONPATH: tempRoot },
      },
    );
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(existsSync(output), false);
    assert.match(result.stderr, /phase18_python_coverage_version_mismatch/u);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Python coverage keeps measurement in memory and never writes .coverage", () => {
  const source = readFileSync("scripts/run-phase18-python-coverage.py", "utf8");
  const coverageContract = readFileSync("scripts/phase18-language-coverage.mjs", "utf8");
  assert.match(source, /data_file=None/u);
  assert.doesNotMatch(source, /coverage\.save\(\)/u);
  assert.doesNotMatch(source, /\._analyze\(/u);
  assert.match(coverageContract, /coverage\.py is mandatory/u);
  assert.match(coverageContract, /missing dependency hard-fails/u);
  assert.doesNotMatch(coverageContract, /falls back/u);
});

test("Python coverage uses one checked-in pin across bootstrap, npm, CI, and docs", () => {
  const requirement = readFileSync("requirements-dev.lock", "utf8").trim();
  const bootstrap = readFileSync("scripts/bootstrap-phase18-python-coverage.sh", "utf8");
  const runner = readFileSync("scripts/run-phase18-python-coverage.py", "utf8");
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const workflow = readFileSync(".github/workflows/pr.yml", "utf8");
  const documentation = readFileSync("docs/development.md", "utf8");

  assert.equal(requirement, "coverage==7.16.2");
  assert.match(runner, /REQUIRED_COVERAGE_VERSION = "7\.16\.2"/u);
  assert.match(bootstrap, /python3 -m venv \.venv/u);
  assert.match(bootstrap, /\.venv\/bin\/python -m pip install --requirement requirements-dev\.lock/u);
  assert.equal(
    scripts["bootstrap:coverage:phase18"],
    "sh scripts/bootstrap-phase18-python-coverage.sh",
  );
  assert.equal(
    scripts["test:coverage:phase18:python"],
    ".venv/bin/python scripts/run-phase18-python-coverage.py",
  );
  assert.doesNotMatch(scripts["test:coverage:phase18:python"], /pip|bootstrap/u);
  assert.match(workflow, /npm run bootstrap:coverage:phase18/u);
  assert.match(workflow, /npm run test:coverage:phase18:python/u);
  assert.match(documentation, /npm run bootstrap:coverage:phase18/u);
  assert.match(documentation, /npm run test:coverage:phase18:python/u);
});

test("PR bootstrap runs the dependency audit immediately after locked installation", () => {
  const workflow = readFileSync(".github/workflows/pr.yml", "utf8");

  assert.match(
    workflow,
    /- name: Install locked dependencies\n        run: npm ci\n\n      - name: Enforce dependency advisory policy\n        run: npm run audit:dependencies/u,
  );
});
