import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  V12_CALENDAR_DIAGNOSTIC_TARGETS,
  createV12CalendarDiagnostics,
  validateV12CalendarDiagnostics,
} from "./benchmark-v12-interactions.mjs";
import { validateV12CalendarManifest } from "./run-v12-maestro.mjs";
import {
  CALENDAR_NATIVE_CASE_IDS,
  CALENDAR_ROUTE_JOURNEY_IDS,
  validateV12CalendarEvidence,
  validateV12CalendarPackageScripts,
  verifyV12CalendarArtifactSet,
} from "./verify-v12-native-evidence.mjs";

const clone = (value) => structuredClone(value);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = () => JSON.parse(readFileSync(
  "scripts/fixtures/v12-calendar-evidence/complete.json",
  "utf8",
));

function manifest() {
  return {
    schema_version: 1,
    suite: "v1.2-calendar",
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    js_bundle: { embedded: true },
    base_head: "a".repeat(40),
    source_tree_sha256: "b".repeat(64),
    source_manifest_sha256: "90de9f6040f36dc029b97ad3687d0e3569fd9bc33ad3eaab2cafc649ae1196a4",
    apk: { path: "artifacts/native/v1.2-calendar/app.apk", sha256: "c".repeat(64), size_bytes: 1 },
    installed_apk: { sha256: "c".repeat(64), matches_retained_apk: true },
    device: { identity_sha256: "d".repeat(64) },
    report_sha256: "e".repeat(64),
  };
}

function rawDiagnostics() {
  return {
    producer: "v12-calendar-native-diagnostics/v1",
    native_execution: "EXECUTED",
    query_samples: Array.from({ length: 100 }, (_, index) => ({
      sequence: index + 1,
      duration_ms: 10 + index / 10,
      source_backed: true,
      event_count: 6,
      plan_count: 2,
      imported_count: 2,
    })),
    interaction_samples: Array.from({ length: 100 }, (_, index) => ({
      sequence: index + 1,
      kind: "drag-expand-collapse",
      complete: true,
      frame_work_ms: [8 + index / 100, 9 + index / 100],
      missed_frames: index % 7 === 0 ? 1 : 0,
      refresh_rate_hz: 60,
      profiler_overhead_ms: 0.2,
    })),
  };
}

function completeLiveEvidence() {
  const evidence = fixture();
  evidence.host_only_fixture = false;
  evidence.native_execution = "EXECUTED";
  evidence.functional_cases.forEach((entry) => {
    entry.status = "PASS";
    entry.native_execution = "EXECUTED";
    entry.observations.synthetic = false;
  });
  evidence.deviations.forEach((entry) => {
    entry.technical_status = "PASS";
    entry.evidence_complete = true;
    entry.classification = "accepted_deviation";
    entry.evidence_hashes = ["a".repeat(64)];
  });
  evidence.comparison.native_execution = "EXECUTED";
  evidence.comparison.status = "PASS";
  evidence.comparison.records.forEach((entry, index) => {
    entry.classification = index < 2 ? "accepted_deviation" : "PASS";
    entry.differences = index < 2 ? [{ kind: "approved", explained: true }] : [];
    if (index < 2) entry.deviation_id = `DEV-0${index + 1}`;
  });
  evidence.diagnostics = createV12CalendarDiagnostics({ manifest: evidence.manifest, raw: rawDiagnostics() });
  evidence.status = "PASS";
  evidence.all_pass = true;
  return evidence;
}

test("Calendar evidence fixture carries the exact native, route, comparison, and owner-gate sets without claiming PASS", () => {
  const evidence = fixture();
  const result = validateV12CalendarEvidence(evidence);
  assert.deepEqual(evidence.functional_cases.map(({ id }) => id), CALENDAR_NATIVE_CASE_IDS);
  assert.deepEqual(evidence.route_journeys.map(({ id }) => id), CALENDAR_ROUTE_JOURNEY_IDS);
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.all_pass, false);
  assert.equal(evidence.native_execution, "NOT_RUN");
  assert.equal(evidence.acceptance_owner, "phase20");
});

test("Calendar evidence rejects missing, duplicate, stale, mutating, non-monotonic, and weak-focus records", () => {
  const mutations = [
    (value) => { value.functional_cases.pop(); },
    (value) => { value.functional_cases[1].id = value.functional_cases[0].id; },
    (value) => { value.functional_cases[0].observations.timestamps_ms = [2, 1]; },
    (value) => { value.functional_cases[0].observations.focus_ring_dp = 2; },
    (value) => { value.route_journeys.pop(); },
    (value) => { value.route_journeys[0].source_digest_after = "f".repeat(64); },
    (value) => { value.route_journeys[0].command_ledger = ["complete_set"]; },
    (value) => { value.route_journeys[0].actual_route = false; },
    (value) => { value.route_journeys[0].actual_loader = false; },
    (value) => { value.identity.source_tree_sha256 = "0".repeat(64); },
  ];
  for (const mutate of mutations) {
    const evidence = fixture();
    mutate(evidence);
    assert.throws(() => validateV12CalendarEvidence(evidence));
  }
});

test("Calendar evidence derives FAIL and REVIEW_REQUIRED and permits accepted deviations only after complete passing proof", () => {
  const complete = completeLiveEvidence();
  assert.deepEqual(validateV12CalendarEvidence(complete), {
    status: "PASS",
    all_pass: true,
    native_cases: 9,
    route_journeys: 8,
    comparisons: 14,
  });

  const unexplained = fixture();
  unexplained.comparison.records[0].differences = [{ kind: "visual", explained: false }];
  assert.throws(() => validateV12CalendarEvidence(unexplained), /difference_unexplained/u);

  const premature = fixture();
  premature.comparison.records[0].classification = "accepted_deviation";
  premature.comparison.records[0].deviation_id = "DEV-01";
  assert.throws(() => validateV12CalendarEvidence(premature), /accepted_deviation_incomplete/u);

  const failed = fixture();
  failed.functional_cases[0].status = "FAIL";
  failed.status = "FAIL";
  assert.equal(validateV12CalendarEvidence(failed).status, "FAIL");

  const falsePass = fixture();
  falsePass.status = "PASS";
  assert.throws(() => validateV12CalendarEvidence(falsePass), /aggregate_status_mismatch/u);
});

test("Calendar evidence rejects unsafe paths, symlinks, replaced bytes, and privacy-bearing payloads", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-evidence-"));
  const external = mkdtempSync(path.join(tmpdir(), "v12-calendar-external-"));
  try {
    mkdirSync(path.join(root, "evidence"));
    const bytes = Buffer.from("bounded synthetic verifier bytes");
    const descriptor = { path: "evidence/trace.json", sha256: hash(bytes) };
    writeFileSync(path.join(root, descriptor.path), bytes);
    assert.equal(verifyV12CalendarArtifactSet([descriptor], { root }), true);

    writeFileSync(path.join(root, descriptor.path), "replaced");
    assert.throws(() => verifyV12CalendarArtifactSet([descriptor], { root }), /artifact_hash_invalid/u);
    writeFileSync(path.join(root, descriptor.path), bytes);
    assert.throws(() => verifyV12CalendarArtifactSet([{ ...descriptor, path: "../escape.json" }], { root }), /artifact_path_invalid/u);

    const externalFile = path.join(external, "trace.json");
    writeFileSync(externalFile, bytes);
    unlinkSync(path.join(root, descriptor.path));
    symlinkSync(externalFile, path.join(root, descriptor.path));
    assert.throws(() => verifyV12CalendarArtifactSet([descriptor], { root }), /artifact_path_invalid/u);

    const privateEvidence = fixture();
    privateEvidence.route_journeys[0].employee_email = "owner@example.com";
    assert.throws(() => validateV12CalendarEvidence(privateEvidence), /privacy_unsafe/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test("Calendar diagnostics retain 100 source-backed queries and complete frame sequences without a Phase 16 verdict", () => {
  const evidence = createV12CalendarDiagnostics({ manifest: manifest(), raw: rawDiagnostics() });
  const result = validateV12CalendarDiagnostics(evidence, manifest());
  assert.equal(result.query_samples, 100);
  assert.equal(result.interaction_samples, 100);
  assert.equal(result.query_p95_ms, 19.4);
  assert.equal(result.frame_work_p95_ms, 9.94);
  assert.equal(evidence.acceptance_owner, "phase20");
  assert.equal(Object.hasOwn(evidence, "verdict"), false);
  assert.deepEqual(evidence.targets, V12_CALENDAR_DIAGNOSTIC_TARGETS);
});

test("Calendar diagnostics reject deferred, fabricated, incomplete, recomputed-summary, and verdict-bearing samples", () => {
  const valid = createV12CalendarDiagnostics({ manifest: manifest(), raw: rawDiagnostics() });
  const mutations = [
    (value) => { value.native_execution = "NOT_RUN"; },
    (value) => { value.measurements.query_samples[0].source_backed = false; },
    (value) => { value.measurements.query_samples.pop(); },
    (value) => { value.measurements.interaction_samples[0].complete = false; },
    (value) => { value.measurements.interaction_samples[0].frame_work_ms = []; },
    (value) => { value.measurements.interaction_samples[0].missed_frames = -1; },
    (value) => { value.measurements.interaction_samples[0].refresh_rate_hz = 0; },
    (value) => { value.measurements.interaction_samples[0].profiler_overhead_ms = -1; },
    (value) => { value.summary.query_p95_ms = 0; },
    (value) => { value.verdict = "PASS"; },
    (value) => { value.measurements.query_samples[0].raw_payload = "private"; },
  ];
  for (const mutate of mutations) {
    const evidence = clone(valid);
    mutate(evidence);
    assert.throws(() => validateV12CalendarDiagnostics(evidence, manifest()));
  }
});

test("Calendar manifest, package commands, and focused integrity registration are exact", () => {
  assert.equal(validateV12CalendarManifest(manifest()), true);
  assert.throws(() => validateV12CalendarManifest({ ...manifest(), base_head: "a".repeat(64) }));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(validateV12CalendarPackageScripts(packageJson), true);
  assert.equal(
    packageJson.scripts["test:coverage:v12:calendar"],
    "node scripts/run-coverage-gate.mjs --focus-integrity=src/bootstrap/phase16CalendarTestControls.ts --focus-project=unit --runInBand src/bootstrap/phase16CalendarTestControls.test.ts",
  );
  const coverage = readFileSync("scripts/run-coverage-gate.mjs", "utf8");
  assert.match(coverage, /src\/bootstrap\/phase16CalendarTestControls\.ts/u);
});
