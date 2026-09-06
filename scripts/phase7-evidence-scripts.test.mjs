import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PHASE7_CONSIDERATION_CONTRACTS,
  PHASE7_MAESTRO_FLOW_CONTRACTS,
  PHASE7_NATIVE_BACKSTOPS,
  parsePhase7MaestroArguments,
} from "./run-phase7-maestro.mjs";
import {
  PHASE7_N4_ROWS,
  parsePhase7AttendedChecklistArguments,
} from "./generate-phase7-attended-checklist.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runnerPath = path.join(projectRoot, "scripts/run-phase7-maestro.mjs");
const checklistPath = path.join(projectRoot, "scripts/generate-phase7-attended-checklist.mjs");
const packagePath = path.join(projectRoot, "package.json");
const workflowPath = path.join(projectRoot, ".github/workflows/release-candidate.yml");

const REQUIRED_FLOW_IDS = Object.freeze([
  "phase7-today-settings",
  "phase7-workout-removal-audio",
  "phase7-plan-schedule-reorder",
  "phase7-icon-navigation-accessibility",
]);

const REQUIRED_CONSIDERATION_IDS = Object.freeze([
  "UX-11", "UX-12", "UX-13", "UX-14", "UX-15", "UX-16",
  "UX-17", "UX-18", "UX-19", "UX-20", "UX-21", "UX-22",
  "UI-E01", "UI-E02", "UI-E03", "UI-E04", "UI-E05", "UI-E06",
  "UI-E07", "UI-E08", "UI-B01", "UI-B02", "UI-B03", "UI-B04",
  "UI-B05",
]);

test("Phase 7 tooling owns the full executable UX/UI matrix", () => {
  assert.equal(existsSync(runnerPath), true, "the Phase 7 runner must exist");
  const source = readFileSync(runnerPath, "utf8");
  assert.match(source, /PHASE7_MAESTRO_FLOW_CONTRACTS/u);
  for (const id of REQUIRED_FLOW_IDS) assert.match(source, new RegExp(id, "u"));
  for (const id of REQUIRED_CONSIDERATION_IDS) assert.match(source, new RegExp(id, "u"));
  assert.match(source, /executed Maestro flow bytes changed/u);
  assert.match(source, /candidate APK bytes do not match/u);
  assert.match(source, /release boundary|release authority/u);
  assert.deepEqual(
    PHASE7_MAESTRO_FLOW_CONTRACTS.map(({ id }) => id),
    REQUIRED_FLOW_IDS,
  );
  assert.deepEqual(
    PHASE7_CONSIDERATION_CONTRACTS.map(({ id }) => id),
    REQUIRED_CONSIDERATION_IDS,
  );
  const flowIds = new Set(REQUIRED_FLOW_IDS);
  for (const consideration of PHASE7_CONSIDERATION_CONTRACTS) {
    assert.equal(typeof consideration.owner, "string");
    assert.equal(consideration.owner.length > 0, true);
    assert.equal(consideration.automated_checks.length > 0, true);
    assert.equal(consideration.flows.length + consideration.native_backstops.length > 0, true);
    for (const flowId of consideration.flows) assert.equal(flowIds.has(flowId), true);
  }
  assert.deepEqual(PHASE7_NATIVE_BACKSTOPS, [{
    id: "N4",
    status: "pending_human",
    description: "Samsung exact-byte aggregated observation-only Phase 7 review.",
    flow_ids: [],
  }]);
});

test("Phase 7 attended evidence stays exact-byte, N4-only, and observation-only", () => {
  assert.equal(existsSync(checklistPath), true, "the Phase 7 N4 checklist must exist");
  const source = readFileSync(checklistPath, "utf8");
  assert.match(source, /SM-S916B/u);
  assert.match(source, /phase7-attended/u);
  assert.match(source, /observation-only/u);
  assert.match(source, /N4-01/u);
  assert.match(source, /N4-05/u);
  for (const forbidden of [
    "approval", "owner_approval", "promotion", "publication",
    "release_authorization", "terminal_seal", "tag",
  ]) {
    assert.match(source, new RegExp(`\"${forbidden}\"`, "u"));
  }
  assert.deepEqual(PHASE7_N4_ROWS.map(({ id }) => id), [
    "N4-01", "N4-02", "N4-03", "N4-04", "N4-05",
  ]);
});

test("package scripts only delegate Phase 7 evidence operations to Phase 7 owners", () => {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  assert.deepEqual({
    "test:maestro:phase7": packageJson.scripts["test:maestro:phase7"],
    "prepare:attended:phase7": packageJson.scripts["prepare:attended:phase7"],
    "record:attended:phase7": packageJson.scripts["record:attended:phase7"],
    "verify:attended:phase7": packageJson.scripts["verify:attended:phase7"],
  }, {
    "test:maestro:phase7": "node scripts/run-phase7-maestro.mjs",
    "prepare:attended:phase7": "node scripts/generate-phase7-attended-checklist.mjs prepare",
    "record:attended:phase7": "node scripts/generate-phase7-attended-checklist.mjs record",
    "verify:attended:phase7": "node scripts/generate-phase7-attended-checklist.mjs verify",
  });
});

test("Phase 7 command parsing rejects package, stale-manifest, and malformed CLI identity", () => {
  const base = [
    "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", "a".repeat(64),
    "--package", "com.fchoo.gymtracker",
    "--serial", "emulator-5554",
    "--output", "artifacts/release-candidate/evidence/phase7.json",
    "--report-dir", "artifacts/release-candidate/evidence/phase7-maestro",
  ];
  assert.equal(parsePhase7MaestroArguments(base).packageName, "com.fchoo.gymtracker");
  assert.throws(() => parsePhase7MaestroArguments(base.map((value) =>
    value === "com.fchoo.gymtracker" ? "com.fchoo.gymtracker.devtest" : value)), /identity/u);
  assert.throws(() => parsePhase7MaestroArguments(base.map((value) =>
    value === "a".repeat(64) ? "stale" : value)), /identity/u);
  assert.throws(() => parsePhase7MaestroArguments([...base, "--unexpected", "value"]), /malformed/u);

  assert.equal(parsePhase7AttendedChecklistArguments([
    "prepare", "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", "b".repeat(64), "--serial", "R5CT1234",
    "--output", "artifacts/release-candidate/evidence/phase7-n4.json",
  ]).mode, "prepare");
  assert.throws(() => parsePhase7AttendedChecklistArguments([
    "prepare", "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", "b".repeat(64), "--serial", "not safe!",
    "--output", "artifacts/release-candidate/evidence/phase7-n4.json",
  ]), /identity/u);
});

test("release candidate workflow proves native Phase 2 before one verified production build and Phase 7 evidence", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const phase7SourceTest = workflow.indexOf("node --test scripts/phase7-evidence-scripts.test.mjs");
  const phase2Build = workflow.indexOf("npm run android:devtest:fresh -- --suite phase2");
  const phase2Sqlite = workflow.indexOf("npm run test:sqlite:device -- --suite phase2 --manifest artifacts/native/phase2/build.json");
  const candidateBuild = workflow.indexOf("./scripts/build-release-candidate-once.sh --output-dir artifacts/release-candidate");
  const manifestVerification = workflow.indexOf("node scripts/verify-release-candidate-manifest.mjs --bundle-dir artifacts/release-candidate");
  const phase7Evidence = workflow.indexOf("npm run test:maestro:phase7 -- --bundle-dir artifacts/release-candidate");

  for (const position of [phase7SourceTest, phase2Build, phase2Sqlite, candidateBuild, manifestVerification, phase7Evidence]) {
    assert.notEqual(position, -1);
  }
  assert.equal(phase7SourceTest < phase2Build, true);
  assert.equal(phase2Build < phase2Sqlite, true);
  assert.equal(phase2Sqlite < candidateBuild, true);
  assert.equal(candidateBuild < manifestVerification, true);
  assert.equal(manifestVerification < phase7Evidence, true);
  assert.equal((workflow.match(/build-release-candidate-once\.sh/g) ?? []).length, 1);

  const immutableEvidenceSlice = workflow.slice(manifestVerification, phase7Evidence + 500);
  assert.doesNotMatch(immutableEvidenceSlice, /android:devtest:fresh|assembleRelease|expo (?:prebuild|run)|gradlew|build-release-candidate-once/u);
  assert.match(immutableEvidenceSlice, /--manifest-sha256 "\$\{\{ steps\.candidate_manifest\.outputs\.manifest_sha256 \}\}"/u);
  assert.match(workflow, /verify-release-candidate-manifest\.mjs --bundle-dir artifacts\/release-candidate/u);
  assert.doesNotMatch(workflow, /(?:release-promotion|create release|gh release|Terminal Seal)/iu);
});
