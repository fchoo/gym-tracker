import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml");
const ts = require("typescript");

const supportTests = new Set([
  "build-current-native-test-apk.test.mjs",
  "doctor-android.test.mjs",
  "native-device-selection.test.mjs",
  "run-coverage-gate.test.mjs",
  "source-tree-digest.test.mjs",
  "validate-v12-prebuild-predecessors.test.mjs",
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
  assert.equal(manifest.phase20.length, 50);
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
  assert.equal(manifest.phase20_coverage.jest_istanbul_modules.length, 8);
  const coverageProjects = manifest.phase20_coverage.node_v8_projects;
  assert.equal(coverageProjects.length, 6);
  assert.deepEqual(coverageProjects.map(({ name }) => name), [
    "contracts",
    "native-actions",
    "native-fixtures",
    "cli-blackbox",
    "cli-coverage",
    "fixture-coverage",
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
  assert.equal(registeredProjectTests.length, 50);
  assert.equal(new Set(registeredProjectTests).size, 50);
  assert.deepEqual([...registeredProjectTests].sort(), manifest.phase20);
  const coveredModules = new Set(coverageProjects.flatMap(({ modules }) => modules));
  assert.equal(coveredModules.size, 16);
  for (const required of [
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
    "scripts/v12-sqlite-shard.mjs",
    "scripts/v12-sqlite-producer-contract.mjs",
    "scripts/v12-blocker-row-resolver.mjs",
    "scripts/v12-artifact-privacy.mjs",
  ]) assert.ok(coveredModules.has(required), required);
  assert.ok(coverageProjects.every(({ coverage, modules, tests }) => (coverage === false || modules.length > 0)
    && tests.length > 0
    && tests.every((file) => manifest.phase20.includes(file))));
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
