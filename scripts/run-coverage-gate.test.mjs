import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("evidence manifests match discovery and PR CI executes the active aggregate gates", () => {
  const manifest = JSON.parse(execFileSync(
    process.execPath,
    ["scripts/run-coverage-gate.mjs", "--list-evidence-tests"],
    { encoding: "utf8", timeout: 10_000 },
  ));
  assert.deepEqual(manifest.phase20, discoveredPhase20);
  assert.deepEqual(manifest.phase18, discoveredPhase18);
  assert.equal(manifest.phase20.length, 49);
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
  assert.equal(manifest.phase20_coverage.jest_istanbul_modules.length, 6);
  const coverageProjects = manifest.phase20_coverage.node_v8_projects;
  const coveredModules = new Set(coverageProjects.flatMap(({ modules }) => modules));
  assert.equal(coveredModules.size, 15);
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
    "scripts/v12-sqlite-shard.mjs",
    "scripts/v12-sqlite-producer-contract.mjs",
    "scripts/v12-blocker-row-resolver.mjs",
    "scripts/v12-artifact-privacy.mjs",
  ]) assert.ok(coveredModules.has(required), required);
  assert.ok(coverageProjects.every(({ modules, tests }) => modules.length > 0
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
  assert.match(source, /SUBPROCESS_TIMEOUT_MS = 5 \* 60_000/u);
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
