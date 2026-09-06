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
