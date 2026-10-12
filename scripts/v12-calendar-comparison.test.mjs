import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  V12_CALENDAR_CASE_LEDGER_DESCRIPTOR,
  V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR,
  V12_CALENDAR_REQUIRED_CASES,
  V12_CALENDAR_REQUIRED_CASE_IDS,
  V12_CALENDAR_STATIC_CONFIGURATIONS,
} from "./v12-calendar-case-registry.mjs";
import {
  initializeV12CalendarRun,
  readV12CalendarRunState,
  recordV12CalendarStageResult,
  stableCanonicalJson,
} from "./v12-calendar-artifacts.mjs";

import {
  compareV12Calendar,
  v12CalendarReferenceMapSha256,
  validateV12CalendarComparison,
  validateV12CalendarReferenceMap,
} from "./compare-v12-calendar.mjs";
import {
  V12_CALENDAR_DIAGNOSTIC_STAGES,
  createV12CalendarRunnerPlan,
  validateV12CalendarFlow,
  validateV12CalendarManifest,
} from "./run-v12-maestro.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const image = new PNG({ width: 1, height: 1 });
image.data.set([1, 2, 3, 255]);
const png = PNG.sync.write(image);

function completeFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "v12-calendar-"));
  const reference = path.join(directory, "reference.png");
  const native = path.join(directory, "native.png");
  writeFileSync(reference, png);
  writeFileSync(native, png);
  const map = {
    schema_version: 1,
    prototype_revision: 18,
    source_manifest_sha256: "a".repeat(64),
    host_only_fixture: true,
    case_registry: V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR,
    captures: [{
      id: "calendar-month-light-390",
      requirement_ids: ["CAL-01"],
      reference: { path: reference, sha256: sha256(png), width: 1, height: 1 },
      configuration: { theme: "Light", viewport: { width: 390, height: 844 }, orientation: "portrait", font_scale: 1, motion: "normal", input: "touch", fixture: "synthetic-calendar-month-v1" },
    }],
    case_ledger: V12_CALENDAR_CASE_LEDGER_DESCRIPTOR,
  };
  const identity = {
    base_head: "a".repeat(40),
    source_tree_sha256: "b".repeat(64),
    source_manifest_sha256: "a".repeat(64),
    reference_map_sha256: v12CalendarReferenceMapSha256(map),
    package: "com.fchoo.gymtracker.devtest",
    apk_sha256: "c".repeat(64),
    installed_apk_sha256: "c".repeat(64),
    device_identity_sha256: "d".repeat(64),
    report_sha256: "e".repeat(64),
  };
  return {
    directory,
    map,
    identity,
    run: {
      schema_version: 1,
      run_id: "phase16-host-deferred",
      identity,
      source_tree_sha256: "b".repeat(64),
      source_manifest_sha256: "a".repeat(64),
      status: "NOT_RUN",
      captures: [{
        id: "calendar-month-light-390",
        native: { path: native, sha256: sha256(png), width: 1, height: 1 },
        trace: {
          synthetic: true,
          samples: [
            { kind: "drag", dx: -89.64, viewportWidth: 360, transformX: -89.64, semanticOffset: 0, titleOffset: 0 },
            { kind: "drag", dx: -90, viewportWidth: 360, transformX: -90, semanticOffset: 0, titleOffset: 1 },
            { kind: "drag", dx: -90.36, viewportWidth: 360, transformX: -90.36, semanticOffset: 0, titleOffset: 1 },
            { kind: "release", dx: -90.36, viewportWidth: 360, semanticOffset: 1, titleOffset: 1 },
          ],
        },
        semantics: { focus_ring_dp: 3, focus_clearance_dp: 4, authority: "read-only", target: "calendar-month" },
        classification: "REVIEW_REQUIRED",
        differences: [],
      }],
    },
  };
}

test("Calendar comparison creates individually hashed artifacts while keeping native execution review-required", () => {
  const fixture = completeFixture();
  try {
    const result = compareV12Calendar({ map: fixture.map, run: fixture.run, outputDirectory: path.join(fixture.directory, "comparison") });
    assert.equal(result.status, "REVIEW_REQUIRED");
    assert.equal(result.records.length, 1);
    assert.deepEqual(result.case_results, {
      status: "REVIEW_REQUIRED",
      native_execution: "NOT_RUN",
      required_case_count: V12_CALENDAR_REQUIRED_CASE_IDS.length,
    });
    assert.match(result.records[0].artifacts.overlay.sha256, /^[a-f0-9]{64}$/u);
    const recordBytes = readFileSync(path.join(fixture.directory, "comparison/calendar-month-light-390/comparison.json"));
    const persisted = JSON.parse(recordBytes);
    assert.deepEqual(persisted.reference, result.records[0].artifacts.reference);
    assert.deepEqual(persisted.native, result.records[0].artifacts.native);
    assert.equal(sha256(recordBytes), result.records[0].artifacts.record.sha256);
    assert.doesNotMatch(JSON.stringify(result), /PASS|serial|token|email/u);
    assert.equal(validateV12CalendarComparison(result), true);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Calendar comparison directories and every artifact are immutable", () => {
  const fixture = completeFixture();
  const outputDirectory = path.join(fixture.directory, "immutable-comparison");
  const repositoryOutputRoot = mkdtempSync(path.join(process.cwd(), "artifacts/v12-calendar-output-"));
  try {
    compareV12Calendar({ map: fixture.map, run: fixture.run, outputDirectory });
    assert.throws(
      () => compareV12Calendar({ map: fixture.map, run: fixture.run, outputDirectory }),
      /output_exists/u,
    );
    const repositoryResult = compareV12Calendar({
      map: fixture.map,
      run: fixture.run,
      outputDirectory: path.join(repositoryOutputRoot, "comparison"),
    });
    assert.match(repositoryResult.records[0].artifacts.reference.path, /^artifacts\/v12-calendar-output-/u);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
    rmSync(repositoryOutputRoot, { recursive: true, force: true });
  }
});

test("Calendar comparison and run journals reject symlinked parent directories", () => {
  const fixture = completeFixture();
  const outside = mkdtempSync(path.join(tmpdir(), "v12-calendar-outside-"));
  const linked = path.join(fixture.directory, "linked");
  symlinkSync(outside, linked, "dir");
  try {
    assert.throws(
      () => compareV12Calendar({
        map: fixture.map,
        run: fixture.run,
        outputDirectory: path.join(linked, "comparison"),
      }),
      /path_unsafe/u,
    );
    assert.equal(existsSync(path.join(outside, "comparison")), false);

    assert.throws(
      () => initializeV12CalendarRun({
        root: linked,
        runId: "phase20-20261013T000000Z-abcdef123456",
        stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES,
      }),
      /path_unsafe/u,
    );
    assert.equal(existsSync(path.join(outside, "phase20-20261013T000000Z-abcdef123456")), false);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("Calendar run journals resume pending stages and refuse completed or failed run overwrite", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-calendar-run-state-"));
  const runId = "phase20-20261013T000000Z-abcdef123456";
  try {
    const initialized = initializeV12CalendarRun({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES });
    assert.equal(initialized.status, "IN_PROGRESS");
    assert.deepEqual(initialized.pending_stage_ids, V12_CALENDAR_DIAGNOSTIC_STAGES);
    assert.throws(
      () => initializeV12CalendarRun({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES }),
      /run_exists/u,
    );

    recordV12CalendarStageResult({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES, stageId: V12_CALENDAR_DIAGNOSTIC_STAGES[0], status: "COMPLETE", artifactSha256: "a".repeat(64) });
    const resumed = readV12CalendarRunState({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES });
    assert.deepEqual(resumed.completed_stage_ids, [V12_CALENDAR_DIAGNOSTIC_STAGES[0]]);
    assert.equal(resumed.pending_stage_ids.length, V12_CALENDAR_DIAGNOSTIC_STAGES.length - 1);
    assert.throws(
      () => recordV12CalendarStageResult({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES, stageId: V12_CALENDAR_DIAGNOSTIC_STAGES[0], status: "COMPLETE", artifactSha256: "a".repeat(64) }),
      /stage_exists/u,
    );

    recordV12CalendarStageResult({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES, stageId: V12_CALENDAR_DIAGNOSTIC_STAGES[1], status: "FAILED", artifactSha256: "b".repeat(64) });
    assert.equal(readV12CalendarRunState({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES }).status, "FAILED");
    assert.throws(
      () => recordV12CalendarStageResult({ root, runId, stageIds: V12_CALENDAR_DIAGNOSTIC_STAGES, stageId: V12_CALENDAR_DIAGNOSTIC_STAGES[2], status: "COMPLETE", artifactSha256: "c".repeat(64) }),
      /run_terminal/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recursive canonical JSON preserves and sorts nested evidence descriptors", () => {
  const value = { z: 1, reference: { sha256: "a".repeat(64), path: "fixtures/reference.png" }, list: [{ b: 2, a: 1 }] };
  assert.equal(
    stableCanonicalJson(value),
    `${JSON.stringify({ list: [{ a: 1, b: 2 }], reference: { path: "fixtures/reference.png", sha256: "a".repeat(64) }, z: 1 }, null, 2)}\n`,
  );
});

test("the shared comparison schema accepts a complete identity-bound live PASS", () => {
  const fixture = completeFixture();
  try {
    const result = structuredClone(compareV12Calendar({
      map: fixture.map,
      run: fixture.run,
      outputDirectory: path.join(fixture.directory, "shared-schema"),
    }));
    result.mode = "live-executed";
    result.run_id = "phase20-20261013T000000Z-abcdef123456";
    result.native_execution = "EXECUTED";
    result.phase20_deferred = false;
    result.status = "PASS";
    const artifactRoot = `artifacts/native/v1.2/${result.run_id}`;
    result.records.forEach((record) => {
      record.classification = "PASS";
      record.differences = [];
      for (const kind of ["reference", "native", "overlay", "difference", "mask", "record"]) {
        record.artifacts[kind].path = `${artifactRoot}/comparison/${record.id}/${kind === "record" ? "comparison.json" : `${kind}.png`}`;
      }
    });
    result.case_results = V12_CALENDAR_REQUIRED_CASES.map((entry) => ({
      id: entry.id,
      case_sha256: entry.case_sha256,
      status: "PASS",
      native_execution: "EXECUTED",
      artifact: { path: `${artifactRoot}/cases/${entry.case_sha256}.json`, sha256: "f".repeat(64) },
    }));
    assert.equal(validateV12CalendarComparison(result, {
      expectedRunId: result.run_id,
      expectedIdentity: fixture.identity,
    }), true);
    result.identity.apk_sha256 = "0".repeat(64);
    assert.throws(() => validateV12CalendarComparison(result, {
      expectedRunId: result.run_id,
      expectedIdentity: fixture.identity,
    }), /result_identity_invalid/u);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Calendar comparison rejects stale hashes, geometry mismatches, bad 25 percent traces, and owner-gate corruption", () => {
  const fixture = completeFixture();
  try {
    const variants = [
      (value) => { value.run.captures[0].native.sha256 = "0".repeat(64); },
      (value) => { value.run.captures[0].native.width = 2; },
      (value) => { value.run.captures[0].trace.samples.splice(1, 1); },
      (value) => { value.run.captures[0].classification = "PASS"; },
      (value) => { value.run.captures[0].semantics.authority = "mutating"; },
    ];
    for (const mutate of variants) {
      const value = structuredClone(fixture);
      mutate(value);
      assert.throws(() => compareV12Calendar({ map: value.map, run: value.run, outputDirectory: path.join(fixture.directory, Math.random().toString(16).slice(2)) }));
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Calendar comparison keeps committed semantics stable while the title previews at the inclusive threshold", () => {
  const fixture = completeFixture();
  try {
    fixture.run.captures[0].trace.samples = [
      { kind: "drag", dx: -89.64, viewportWidth: 360, transformX: -89.64, semanticOffset: 0, titleOffset: 0 },
      { kind: "drag", dx: -90, viewportWidth: 360, transformX: -90, semanticOffset: 0, titleOffset: 1 },
      { kind: "drag", dx: -90.36, viewportWidth: 360, transformX: -90.36, semanticOffset: 0, titleOffset: 1 },
      { kind: "release", dx: -90.36, viewportWidth: 360, semanticOffset: 1, titleOffset: 1 },
    ];
    assert.doesNotThrow(() => compareV12Calendar({
      map: fixture.map,
      run: fixture.run,
      outputDirectory: path.join(fixture.directory, "truthful-preview"),
    }));

    fixture.run.captures[0].trace.samples[1].semanticOffset = 1;
    assert.throws(() => compareV12Calendar({
      map: fixture.map,
      run: fixture.run,
      outputDirectory: path.join(fixture.directory, "false-preview"),
    }), /trace_25_percent_semantic/u);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Calendar map requires the exact source-owned 96-case ledger", () => {
  const fixture = completeFixture();
  try {
    assert.equal(validateV12CalendarReferenceMap(fixture.map), true);
    const missing = structuredClone(fixture.map);
    missing.case_ledger.case_ids.pop();
    assert.throws(() => validateV12CalendarReferenceMap(missing), /ledger_required_case_missing/u);
    const reordered = structuredClone(fixture.map);
    reordered.case_ledger.case_ids.reverse();
    assert.throws(() => validateV12CalendarReferenceMap(reordered), /ledger_required_case_missing/u);
    const unknown = structuredClone(fixture.map);
    unknown.case_ledger.case_ids[0] = "configuration:unknown";
    assert.throws(() => validateV12CalendarReferenceMap(unknown), /ledger_required_case_missing/u);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Calendar comparison rejects unknown privacy-bearing fields in maps, traces, and results", () => {
  const fixture = completeFixture();
  try {
    for (const [location, mutate] of [
      ["map", (value) => { value.map.captures[0].workout_name = "Alice private rehab session"; }],
      ["trace", (value) => { value.run.captures[0].trace.samples[0].local_date = "2026-10-13"; }],
      ["semantics", (value) => { value.run.captures[0].semantics.activity_id = "private-activity"; }],
    ]) {
      const value = structuredClone(fixture);
      mutate(value);
      assert.throws(() => compareV12Calendar({
        map: value.map,
        run: value.run,
        outputDirectory: path.join(fixture.directory, `privacy-${location}`),
      }), /privacy_schema_invalid/u);
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Calendar comparison rejects personal data in allowed reference and artifact path fields", () => {
  const fixture = completeFixture();
  try {
    const privateReference = structuredClone(fixture.map);
    privateReference.captures[0].reference.path = path.join(fixture.directory, "Alice-private-reference.png");
    writeFileSync(privateReference.captures[0].reference.path, png);
    assert.throws(
      () => validateV12CalendarReferenceMap(privateReference, { verifyFiles: true, allowExternal: true }),
      /path_invalid/u,
    );

    const result = structuredClone(compareV12Calendar({
      map: fixture.map,
      run: fixture.run,
      outputDirectory: path.join(fixture.directory, "private-result"),
    }));
    result.records[0].artifacts.report = result.records[0].artifacts.record;
    assert.throws(() => validateV12CalendarComparison(result), /privacy_schema_invalid/u);
    result.records[0].artifacts = {
      ...result.records[0].artifacts,
      record: { ...result.records[0].artifacts.record, path: "comparison/Alice-private-record.json" },
    };
    delete result.records[0].artifacts.report;
    assert.throws(() => validateV12CalendarComparison(result), /path_invalid/u);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Calendar reference coverage is bound to the exact source-owned 64-configuration and state registry", () => {
  assert.equal(V12_CALENDAR_STATIC_CONFIGURATIONS.length, 64);
  assert.equal(V12_CALENDAR_REQUIRED_CASES.length, 96);
  assert.equal(new Set(V12_CALENDAR_STATIC_CONFIGURATIONS.map(({ id }) => id)).size, 64);
  assert.deepEqual(V12_CALENDAR_REQUIRED_CASES.map(({ id }) => id), V12_CALENDAR_REQUIRED_CASE_IDS);
  assert.equal(V12_CALENDAR_REQUIRED_CASES.every(({ case_sha256 }) => /^[a-f0-9]{64}$/u.test(case_sha256)), true);
  assert.equal(new Set(V12_CALENDAR_REQUIRED_CASES.map(({ case_sha256 }) => case_sha256)).size, 96);
  assert.deepEqual(
    new Set(V12_CALENDAR_STATIC_CONFIGURATIONS.map(({ viewport }) => viewport.width)),
    new Set([360, 390, 600, 840, 800, 844, 960, 1080]),
  );
  assert.ok(V12_CALENDAR_REQUIRED_CASE_IDS.includes("state:calendar-loading-month"));
  assert.ok(V12_CALENDAR_REQUIRED_CASE_IDS.includes("state:calendar-rest-day"));
  assert.ok(V12_CALENDAR_REQUIRED_CASE_IDS.includes("state:calendar-query-error-retry"));
  assert.ok(V12_CALENDAR_REQUIRED_CASE_IDS.includes("input:dpad"));
  assert.deepEqual(
    V12_CALENDAR_REQUIRED_CASES.find(({ id }) => id === "input:dpad")?.binding,
    {
      configuration_id: "L-C390-P-F100",
      state_id: "calendar-focused-week",
      input: "dpad",
      motion: "normal",
    },
  );
  assert.deepEqual(
    V12_CALENDAR_REQUIRED_CASES.find(({ id }) => id === "motion:reduced")?.binding,
    {
      configuration_id: "L-C390-P-F100",
      state_id: "calendar-focused-week",
      input: "touch",
      motion: "reduced",
    },
  );

  const fixture = completeFixture();
  try {
    assert.equal(validateV12CalendarReferenceMap(fixture.map), true);
    const incomplete = structuredClone(fixture.map);
    incomplete.case_registry.sha256 = "0".repeat(64);
    assert.throws(() => validateV12CalendarReferenceMap(incomplete), /case_registry_invalid/u);

    const result = structuredClone(compareV12Calendar({
      map: fixture.map,
      run: fixture.run,
      outputDirectory: path.join(fixture.directory, "matrix"),
    }));
    result.case_results.required_case_count -= 1;
    assert.throws(() => validateV12CalendarComparison(result), /case_result_invalid/u);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("the checked-in Calendar map binds every reference byte to the Revision 18 source manifest", () => {
  const map = JSON.parse(readFileSync(".planning/phases/16-calendar-parity/16-REFERENCE-MAP.json", "utf8"));
  assert.equal(sha256(readFileSync(map.source_manifest)), map.source_manifest_sha256);
  assert.equal(validateV12CalendarReferenceMap(map, { verifyFiles: true }), true);
  assert.equal(
    v12CalendarReferenceMapSha256(map),
    JSON.parse(readFileSync("scripts/fixtures/v12-calendar-evidence/complete.json", "utf8")).manifest.reference_map_sha256,
  );
  assert.equal(new Set(map.captures.map((capture) => capture.id)).size, map.captures.length);
});

test("the Phase 16 runner exposes every pre-destination diagnostic stage but cannot award a native verdict", () => {
  const manifest = { schema_version: 1, suite: "v1.2-calendar", profile: "development-test", package: "com.fchoo.gymtracker.devtest", js_bundle: { embedded: true }, base_head: "a".repeat(40), source_tree_sha256: "b".repeat(64), source_manifest_sha256: "e".repeat(64), reference_map_sha256: "f".repeat(64), apk: { path: "artifacts/native/v1.2-calendar/app.apk", sha256: "c".repeat(64), size_bytes: 1 }, installed_apk: { sha256: "c".repeat(64), matches_retained_apk: true }, device: { identity_sha256: "d".repeat(64) }, report_sha256: "f".repeat(64) };
  assert.equal(validateV12CalendarManifest(manifest), true);
  const flow = readFileSync("maestro/v1.2/calendar.yaml", "utf8");
  assert.equal(validateV12CalendarFlow(flow), true);
  assert.throws(
    () => validateV12CalendarFlow(flow.replace("end: \"60%, 45%\"", "end: \"45%, 45%\"")),
    /v12_calendar_flow_stage_invalid:drag-forward-10/u,
  );
  const plan = createV12CalendarRunnerPlan(manifest);
  assert.equal(plan.native_execution, "NOT_RUN");
  assert.equal(plan.phase20_deferred, true);
  assert.deepEqual(plan.stages, V12_CALENDAR_DIAGNOSTIC_STAGES);
  assert.equal(new Set(plan.stages).size, plan.stages.length);
  const controls = readFileSync("src/bootstrap/phase16CalendarTestControls.ts", "utf8");
  for (const stage of plan.stages) assert.match(controls, new RegExp(`"${stage}"`, "u"));
});
