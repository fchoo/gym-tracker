import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const phase20Tests = readdirSync("scripts")
  .filter((name) => /^v12-.*\.test\.mjs$/u.test(name))
  .map((name) => `scripts/${name}`)
  .sort();

test("the Phase 20 evidence and coverage gates enumerate every v12 integration test", () => {
  assert.equal(phase20Tests.length, 27);

  const coverageGate = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  for (const file of phase20Tests) {
    assert.match(coverageGate, new RegExp(file.replaceAll(".", "\\."), "u"), file);
  }
  assert.match(coverageGate, /phase20_evidence_test_manifest_drift/u);
  assert.match(coverageGate, /--test-timeout=600000/u);
  assert.match(coverageGate, /src\/testing\/contracts\/phase20CoverageGate\.test\.ts/u);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["pretest:evidence:v12"], "npm run test:evidence:v12:all");
  assert.match(packageJson.scripts["test:evidence:v12:all"], /scripts\/v12-\*\.test\.mjs/u);
  assert.match(packageJson.scripts["test:evidence:v12:all"], /--test-timeout=600000/u);
  assert.equal(packageJson.scripts["test:evidence:v12"], "node --test scripts/v12-evidence-scripts.test.mjs scripts/generate-v12-attended-checklist.test.mjs scripts/create-v12-readiness-handoff.test.mjs");

  const workflow = readFileSync(".github/workflows/pr.yml", "utf8");
  assert.match(workflow, /'test:evidence:v12'/u);
  assert.match(workflow, /run: npm run test:coverage -- --runInBand/u);
});
