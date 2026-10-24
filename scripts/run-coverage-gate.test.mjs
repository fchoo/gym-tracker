import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml");
const ts = require("typescript");

const supportTests = new Set([
  "assert-generated-android.test.mjs",
  "assert-generated-production-android.test.mjs",
  "validate-development-test-native-access.test.mjs",
  "build-current-native-test-apk.test.mjs",
  "doctor-android.test.mjs",
  "native-device-selection.test.mjs",
  "run-coverage-gate.test.mjs",
  "source-tree-digest.test.mjs",
  "validate-v12-prebuild-predecessors.test.mjs",
  "verify-garmin-python-lock.test.mjs",
  "garmin-android-native.test.mjs",
  "build-android-cffi.test.mjs",
  "verify-garmin-android-binaries.test.mjs",
]);
const testFiles = readdirSync("scripts").filter((name) => name.endsWith(".test.mjs"));
const discoveredPhase20 = testFiles
  .filter((name) => name.includes("v12") || name.includes("phase20") || supportTests.has(name))
  .map((name) => `scripts/${name}`)
  .sort();
const discoveredPhase18 = testFiles
  .filter((name) => name.includes("phase18"))
  .map((name) => `scripts/${name}`)
  .sort();

function activeRunCommands(workflow) {
  return Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => typeof step.run === "string" ? [step.run] : []));
}

function runsExactCommand(commands, expected) {
  return commands.some((command) => command.split(/\r?\n/u)
    .map((line) => line.trim())
    .includes(expected));
}

function inspectSubprocessCalls(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && ["execFileSync", "spawnSync"].includes(node.expression.text)) {
      const options = node.arguments[2];
      const timeoutProperty = ts.isObjectLiteralExpression(options)
        ? options.properties.find((property) => ts.isPropertyAssignment(property)
          && property.name.getText(sourceFile) === "timeout")
        : undefined;
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      calls.push({
        callee: node.expression.text,
        line: location.line + 1,
        node,
        sourceFile,
        timeoutProperty,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return calls;
}

test("Phase 20 gates reject the wrong Node runtime before manifest or test work", () => {
  const preload = "Object.defineProperty(process.versions, 'node', { value: '0.0.0' });";
  const started = Date.now();
  const result = spawnSync(process.execPath, [
    `--import=data:text/javascript,${encodeURIComponent(preload)}`,
    "scripts/run-coverage-gate.mjs",
    "--list-evidence-tests",
  ], { encoding: "utf8", timeout: 2_000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /phase20_node_version_invalid:24\.19\.0:0\.0\.0/u);
  assert.ok(Date.now() - started < 2_000);
});

test("evidence manifests match discovery and PR CI executes the active aggregate gates", () => {
  const manifest = JSON.parse(execFileSync(
    process.execPath,
    ["scripts/run-coverage-gate.mjs", "--list-evidence-tests"],
    { encoding: "utf8", timeout: 10_000 },
  ));
  assert.deepEqual(manifest.phase20, discoveredPhase20);
  assert.deepEqual(manifest.phase18, discoveredPhase18);
  assert.equal(manifest.phase20.length, 63);
  assert.equal(manifest.phase18.length, 18);
  assert.ok(manifest.phase18.includes("scripts/phase18-garmin-proof.test.mjs"));
  assert.deepEqual(Object.keys(manifest.phase20_coverage).sort(), [
    "jest_istanbul_modules",
    "metrics",
    "node_v8_projects",
    "required_percent",
  ]);
  assert.equal(manifest.phase20_coverage.required_percent, 100);
  assert.deepEqual(
    manifest.phase20_coverage.metrics,
    ["statements", "branches", "functions", "lines"],
  );
  assert.equal(manifest.phase20_coverage.jest_istanbul_modules.length, 19);
  assert.ok(manifest.phase20_coverage.jest_istanbul_modules.includes("src/testing/v12RecoveryLogTransport.ts"));
  assert.ok(manifest.phase20_coverage.jest_istanbul_modules.includes("src/testing/v12RecoveryRootContext.ts"));
  assert.ok(manifest.phase20_coverage.jest_istanbul_modules.includes("src/testing/garminSyncDiagnostic.ts"));
  assert.ok(manifest.phase20_coverage.jest_istanbul_modules.includes("app/__garmin-sync-diagnostic.tsx"));
  const coverageProjects = manifest.phase20_coverage.node_v8_projects;
  assert.equal(coverageProjects.length, 10);
  assert.deepEqual(coverageProjects.map(({ name }) => name), [
    "contracts",
    "native-actions",
    "native-fixtures",
    "quality-coverage",
    "calendar-coverage",
    "cli-blackbox",
    "cli-coverage",
    "fixture-coverage",
    "garmin-packaging",
    "maestro-safe-sdk",
  ]);
  assert.deepEqual(
    coverageProjects.filter(({ coverage }) => coverage === false).map(({ name }) => name),
    ["native-fixtures", "cli-blackbox"],
  );
  assert.deepEqual(coverageProjects.filter(({ timeoutMs }) => timeoutMs !== undefined)
    .map(({ name, timeoutMs }) => ({ name, timeoutMs })), [
    { name: "cli-blackbox", timeoutMs: 50 * 60_000 },
  ]);
  const registeredProjectTests = coverageProjects.flatMap(({ tests }) => tests);
  assert.equal(registeredProjectTests.length, 63);
  assert.equal(new Set(registeredProjectTests).size, 63);
  assert.deepEqual([...registeredProjectTests].sort(), manifest.phase20);
  const coveredModules = new Set(coverageProjects.flatMap(({ modules }) => modules));
  assert.equal(coveredModules.size, 30);
  const safeSdk = coverageProjects.find(({ name }) => name === "maestro-safe-sdk");
  assert.equal(safeSdk.coverage, true);
  assert.deepEqual(safeSdk.modules, ["scripts/v12-maestro-safe-sdk.mjs"]);
  assert.deepEqual(safeSdk.tests, ["scripts/v12-maestro-safe-sdk.test.mjs"]);
  const calendarCoverage = coverageProjects.find(({ name }) => name === "calendar-coverage");
  assert.equal(calendarCoverage.coverage, true);
  assert.deepEqual(calendarCoverage.modules, ["scripts/v12-production-native-calendar-action.mjs"]);
  assert.deepEqual(calendarCoverage.tests, [
    "scripts/v12-production-native-calendar-action.test.mjs",
    "scripts/v12-production-native-calendar-session.test.mjs",
  ]);
  for (const required of [
    "scripts/garmin-cli-coverage-evidence.mjs",
    "scripts/phase20-subprocess-coverage.mjs",
    "scripts/verify-garmin-python-lock.mjs",
    "scripts/garmin-android-native.mjs",
    "scripts/build-android-cffi.mjs",
    "scripts/verify-garmin-android-binaries.mjs",
    "scripts/v12-airplane-mode-status.mjs",
    "scripts/native-contract-log-transport.mjs",
    "scripts/validate-development-test-native-access.mjs",
    "scripts/v12-native-rollback-bridge.mjs",
    "scripts/v12-rollback-archive-inspection.mjs",
    "scripts/v12-atomic-shard-publication.mjs",
    "scripts/v12-rollback-evidence.mjs",
    "scripts/verify-v12-native-evidence.mjs",
    "scripts/create-v12-readiness-handoff.mjs",
    "scripts/v12-calendar-artifact-transport.mjs",
    "scripts/capture-v12-visual.mjs",
    "scripts/compare-v12-visual.mjs",
    "scripts/v12-visual-streaming.mjs",
    "scripts/v12-native-execution-origin.mjs",
    "scripts/v12-native-adapter.mjs",
    "scripts/v12-native-time-budgets.mjs",
    "scripts/v12-posix-process-tree.mjs",
    "scripts/v12-production-native-quality-actions.mjs",
    "scripts/v12-sqlite-shard.mjs",
    "scripts/v12-sqlite-producer-contract.mjs",
    "scripts/v12-blocker-row-resolver.mjs",
    "scripts/v12-artifact-privacy.mjs",
  ]) assert.ok(coveredModules.has(required), required);
  assert.ok(coverageProjects.every(({ coverage, modules, tests }) => (coverage === false || modules.length > 0)
    && tests.length > 0
    && tests.every((file) => manifest.phase20.includes(file))));
  const packaging = coverageProjects.find(({ name }) => name === "garmin-packaging");
  assert.deepEqual(packaging.tests, [
    "scripts/verify-garmin-python-lock.test.mjs",
    "scripts/garmin-android-native.test.mjs",
    "scripts/build-android-cffi.test.mjs",
    "scripts/verify-garmin-android-binaries.test.mjs",
  ]);
  assert.equal(manifest.phase18.some((file) => packaging.tests.includes(file)), false);
  const gate = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  assert.match(gate, /const phase18IntegrityCriticalFiles = \[\s+"plugins\/withGarminConnectModule\.ts"/u);
  assert.match(gate, /const integrityCriticalFiles = \[\s+"plugins\/withGarminConnectModule\.ts"/u);
  assert.match(gate, /const phase18TargetedTests = \[\s+"plugins\/withGarminConnectModule\.test\.ts"/u);
  assert.match(
    readFileSync("scripts/capture-v12-visual.test.mjs", "utf8"),
    /import "\.\/testing\/v12-visual-streaming\.test\.mjs";/u,
  );

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["pretest:evidence:v12"], "npm run test:evidence:v12:all");
  assert.equal(
    packageJson.scripts["test:evidence:v12:all"],
    "node scripts/run-coverage-gate.mjs --all-evidence-only",
  );
  assert.equal(
    packageJson.scripts["test:evidence:v12"],
    "node --test scripts/v12-evidence-scripts.test.mjs scripts/generate-v12-attended-checklist.test.mjs scripts/create-v12-readiness-handoff.test.mjs",
  );

  const workflow = parseYaml(readFileSync(".github/workflows/pr.yml", "utf8"));
  const commands = activeRunCommands(workflow);
  assert.ok(runsExactCommand(commands, "npm run test:evidence:v12:all"));
  assert.ok(runsExactCommand(commands, "npm run test:coverage:phase18"));
  assert.ok(runsExactCommand(
    commands,
    "npm run test:coverage -- --skip-phase20-evidence --runInBand",
  ));

  const phase18Job = workflow.jobs["phase18-aggregate-coverage"];
  assert.equal(phase18Job.needs, "host-gates");
  const phase18Commands = activeRunCommands({ jobs: { phase18: phase18Job } });
  const generation = phase18Commands.findIndex((command) => command.trim() === "npm run prebuild:android");
  const aggregate = phase18Commands.findIndex((command) => command.trim() === "npm run test:coverage:phase18");
  assert.ok(generation >= 0 && aggregate > generation, "JaCoCo must run against a generated Android project");
});

test("every Phase 20 black-box child process has an explicit test-only timeout", () => {
  const source = readFileSync("scripts/v12-phase20-cli-blackbox.test.mjs", "utf8");
  const calls = inspectSubprocessCalls(source, "scripts/v12-phase20-cli-blackbox.test.mjs");
  assert.equal(calls.length, 6);
  for (const call of calls) {
    assert.ok(call.timeoutProperty, `unbounded ${call.callee} call at line ${String(call.line)}`);
    const propertyName = call.timeoutProperty.name;
    const mutated = `${source.slice(0, propertyName.getStart(call.sourceFile))}removedTimeout${source.slice(propertyName.end)}`;
    const mutatedCalls = inspectSubprocessCalls(mutated, "mutated-v12-phase20-cli-blackbox.test.mjs");
    assert.equal(
      mutatedCalls.filter(({ timeoutProperty }) => timeoutProperty === undefined).length,
      1,
      `renaming the timeout on ${call.callee} line ${String(call.line)} must fail closed`,
    );
  }
  assert.match(source, /FIXTURE_COMMAND_TIMEOUT_MS = 10_000/u);
  assert.match(source, /INLINE_HELPER_TIMEOUT_MS = 240_000/u);
  assert.match(source, /SUBPROCESS_TIMEOUT_MS = 10 \* 60_000/u);
});

test("the exact Phase 18 evidence subprocess owns a local timeout", () => {
  const source = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  const calls = inspectSubprocessCalls(source, "scripts/run-coverage-gate.mjs");
  const phase18EvidenceCall = calls.find(({ node, sourceFile }) =>
    node.arguments[1]?.getText(sourceFile).includes("phase18EvidenceTests"));
  assert.ok(phase18EvidenceCall, "Phase 18 evidence subprocess call not found");
  assert.ok(
    phase18EvidenceCall.timeoutProperty,
    `unbounded Phase 18 evidence subprocess at line ${String(phase18EvidenceCall.line)}`,
  );
  assert.equal(
    phase18EvidenceCall.timeoutProperty.initializer.getText(phase18EvidenceCall.sourceFile),
    "PHASE18_EVIDENCE_TIMEOUT_MS",
  );
});

test("the Phase 20 coverage CLI rejects a skipped pidfd report before dequeuing projects", () => {
  const root = process.cwd();
  const fixture = mkdtempSync(path.join(tmpdir(), "phase20-pidfd-skip-cli-"));
  try {
    execFileSync("git", ["init", "--quiet", fixture], { timeout: 5_000 });
    execFileSync("git", ["-C", fixture, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "--allow-empty",
      "-m", "test: initialize isolated coverage fixture", "-m", "Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>"], { timeout: 5_000 });
    for (const entry of readdirSync(root)) {
      if (entry === "scripts" || entry === ".git" || entry === ".venv" || entry === "artifacts"
        || entry === ".coverage" || entry.startsWith("coverage") || entry.startsWith(".native-")) continue;
      symlinkSync(path.join(root, entry), path.join(fixture, entry));
    }
    mkdirSync(path.join(fixture, "scripts"));
    for (const entry of readdirSync(path.join(root, "scripts"))) {
      const source = path.join(root, "scripts", entry);
      const target = path.join(fixture, "scripts", entry);
      if (entry === "run-coverage-gate.mjs") writeFileSync(target, readFileSync(source));
      else symlinkSync(source, target);
    }
    mkdirSync(path.join(fixture, ".venv", "bin"), { recursive: true });
    writeFileSync(path.join(fixture, ".venv", "bin", "python"), `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const output = process.argv[process.argv.indexOf("--output") + 1];
const metrics = ["statements", "branches", "functions", "lines"];
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({
  status: "passed", suite: "phase20-linux-pidfd-signal", metrics,
  tests_run: 9, failures: 0, errors: 0, skipped: 1,
  coverage: Object.fromEntries(metrics.map(key => [key, { covered: 1, missed: 0, total: 1, percent: 100 }])),
  missing_lines: [], missing_branches: [], missing_functions: [],
  sources: [{ path: "scripts/v12-linux-pidfd-signal.py" }],
  tests: [{ path: "scripts/test_v12_linux_pidfd_signal.py" }],
}));
`, { mode: 0o755 });
    // The retained marker also prevents project execution on the pre-fix path.
    const projects = path.join(fixture, "coverage", "phase20-node");
    mkdirSync(projects, { recursive: true });
    const ownership = path.join(projects, ".process-ownership");
    writeFileSync(ownership, "b".repeat(64));
    const result = spawnSync(process.execPath, ["scripts/run-coverage-gate.mjs", "--all-evidence-only"], {
      cwd: fixture, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /phase20_pidfd_coverage_invalid/u);
    assert.equal(readFileSync(ownership, "utf8"), "b".repeat(64));
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test("the Linux pidfd helper is a normal source-bound Phase 20 exact coverage gate", () => {
  const source = readFileSync("scripts/run-coverage-gate.mjs", "utf8");

  assert.match(source, /phase20PidfdCoverage = Object\.freeze/u);
  assert.match(source, /source: "scripts\/v12-linux-pidfd-signal\.py"/u);
  assert.match(source, /test: "scripts\/test_v12_linux_pidfd_signal\.py"/u);
  assert.match(source, /metrics: Object\.freeze\(\["statements", "branches", "functions", "lines"\]\)/u);
  assert.match(source, /runPhase20PidfdCoverage\(\);\n  await runPhase20SubprocessCoverage/u);
  assert.match(source, /phase20_pidfd_coverage_invalid/u);
  assert.match(source, /PHASE20_PIDFD_COVERAGE_TIMEOUT_MS = 2 \* 60_000/u);
});
