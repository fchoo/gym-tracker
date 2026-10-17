import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const { load: parseYaml } = require("js-yaml");

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

test("evidence manifests match discovery and PR CI executes the active aggregate gates", () => {
  const manifest = JSON.parse(execFileSync(
    process.execPath,
    ["scripts/run-coverage-gate.mjs", "--list-evidence-tests"],
    { encoding: "utf8", timeout: 10_000 },
  ));
  assert.deepEqual(manifest.phase20, discoveredPhase20);
  assert.deepEqual(manifest.phase18, discoveredPhase18);
  assert.equal(manifest.phase20.length, 48);
  assert.equal(manifest.phase18.length, 18);
  assert.ok(manifest.phase18.includes("scripts/phase18-garmin-proof.test.mjs"));
  assert.deepEqual(Object.keys(manifest.phase20_coverage).sort(), [
    "jest_istanbul_100",
    "node_subprocess_v8_100",
    "separately_enforced_gates",
  ]);
  assert.equal(manifest.phase20_coverage.node_subprocess_v8_100.length, 4);
  assert.equal(manifest.phase20_coverage.jest_istanbul_100.length, 6);
  const separate = Object.values(manifest.phase20_coverage.separately_enforced_gates);
  assert.equal(new Set(separate.flatMap(({ modules }) => modules)).size, 8);
  assert.ok(separate.every(({ tests }) => tests.length > 0
    && tests.every((file) => manifest.phase20.includes(file))));

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
  const calls = [...source.matchAll(/\b(?:execFileSync|spawnSync)\(/gu)];
  assert.equal(calls.length, 6);
  for (const call of calls) {
    assert.match(
      source.slice(call.index, call.index + 700),
      /\btimeout\s*:/u,
      `unbounded child process near offset ${String(call.index)}`,
    );
  }
  assert.match(source, /FIXTURE_COMMAND_TIMEOUT_MS = 10_000/u);
  assert.match(source, /INLINE_HELPER_TIMEOUT_MS = 240_000/u);
  assert.match(source, /SUBPROCESS_TIMEOUT_MS = 5 \* 60_000/u);
});
