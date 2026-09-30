import assert from "node:assert/strict";
import test from "node:test";
import { PHASE12_MAESTRO_STAGES, validateDistinctPhase12Flow, validatePhase12Manifest } from "./run-phase12-maestro.mjs";
import { readFileSync } from "node:fs";
const manifest = { schema_version: 1, suite: "phase12", profile: "development-test", package: "com.fchoo.gymtracker.devtest", js_bundle: { embedded: true }, apk: { path: "fixture.apk", sha256: "a".repeat(64) }, base_head: "b".repeat(40), source_tree_sha256: "c".repeat(64) };
test("Phase 12 runner owns each fake-port evidence stage", () => assert.equal(PHASE12_MAESTRO_STAGES.length, 18));
test("Phase 12 runner rejects stale or non-devtest manifests", () => {
  assert.equal(validatePhase12Manifest(manifest, "b".repeat(40), "c".repeat(64)), true);
  assert.throws(() => validatePhase12Manifest({ ...manifest, profile: "production" }, "b".repeat(40), "c".repeat(64)));
  assert.throws(() => validatePhase12Manifest(manifest, "d".repeat(40), "c".repeat(64)));
});
test("Phase 12 flow recovers only the known retained restore state before the canonical route link", () => {
  const flow = readFileSync("maestro/phase12/automatic-drive-backup.yaml", "utf8");
  const conditional = flow.indexOf('visible: "Retry opening workout data"');
  const trusted = flow.indexOf('visible: "Today"');
  const link = flow.indexOf('openLink: "gymtracker-devtest:///more/data-and-recovery?suite=phase12&phase12Stage=${PHASE12_STAGE}"');
  const route = flow.indexOf('visible: "Data and recovery"');
  assert.ok(conditional >= 0 && trusted > conditional && link > trusted && route > link);
  assert.match(flow, /clearState: false/u);
  assert.match(flow, /stopApp: true/u);
  assert.match(flow, /tapOn: "Retry opening workout data"/u);
  assert.equal(validateDistinctPhase12Flow(flow), true);
});

test("Phase 12 becomes the explicit credential-free PR native producer", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const workflow = readFileSync(".github/workflows/pr.yml", "utf8");
  for (const script of ["test:maestro:phase12", "benchmark:phase12:backup", "verify:phase12:evidence", "test:evidence:phase12", "prepare:attended:phase12", "record:attended:phase12"]) assert.equal(typeof packageJson.scripts[script], "string");
  assert.match(packageJson.scripts["ci:pr"], /--suite phase12/u);
  assert.match(workflow, /Build Phase 12 once/u);
  assert.match(workflow, /--suite migrations-effects --manifest artifacts\/native\/phase12\/build\.json/u);
  assert.match(workflow, /--suite google-drive-backup --manifest artifacts\/native\/phase12\/build\.json/u);
  assert.match(workflow, /verify:phase12:evidence/u);
  assert.doesNotMatch(workflow, /GOOGLE_(?:TOKEN|TEST_ACCOUNT)|access[_-]?token/iu);
  assert.match(readFileSync("scripts/record-phase12-google-acceptance.mjs", "utf8"), /physical-phone-auth-only/u);
});

test("Phase 12 native benchmark route is development-test and suite gated", () => {
  const route = readFileSync("app/__phase12-benchmark.tsx", "utf8");
  assert.match(route, /nativeContractsEnabled === true/u);
  assert.match(route, /suite === "phase12"/u);
  assert.match(route, /PHASE12_BENCHMARK_START_MARKER/u);
  assert.match(route, /PHASE12_BENCHMARK_RESULT_MARKER/u);
});

test("Phase 12 benchmark invokes the production atomic merge writer", () => {
  const source = readFileSync("src/bootstrap/phase12BackupBenchmark.ts", "utf8");
  assert.match(source, /createFullPlanLogicalMergeWriter/u);
  assert.match(source, /commitFullPlan/u);
  assert.doesNotMatch(source, /materializedRows/u);
  assert.match(source, /"k000000"/u);
  assert.match(source, /mutation\.changes !== 1/u);
  assert.match(source, /"k000000"[\s\S]*?phase12_capture_mutation_missing/u);
  assert.doesNotMatch(source, /const mergePlans: PortableMergePlan\[\]/u);
  assert.match(source, /stage: "materialization"[\s\S]*?event: "started"/u);
  assert.match(source, /stage: "materialization"[\s\S]*?event: "completed"/u);
  assert.match(source, /stage: "materialization_writer"[\s\S]*?writer_stage: stage/u);
  assert.match(source, /stage: "materialization_plan"[\s\S]*?elapsed_ms/u);
  assert.match(source, /stage: "materialization_timing"[\s\S]*?elapsed_ms/u);
});
