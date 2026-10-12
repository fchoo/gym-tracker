import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  V12_CALENDAR_CASE_REGISTRY_DESCRIPTOR,
  V12_CALENDAR_REQUIRED_CASE_IDS,
  V12_CALENDAR_STATIC_CONFIGURATIONS,
} from "./v12-calendar-case-registry.mjs";

import {
  compareV12Calendar,
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
    case_ledger: [
      { id: "calendar-light-touch", capture_ids: ["calendar-month-light-390"], theme: "Light", motion: "normal", input: "touch", viewport: "390x844" },
      { id: "calendar-dark-touch", capture_ids: ["calendar-month-light-390"], theme: "Dark", motion: "normal", input: "touch", viewport: "390x844" },
      { id: "calendar-accessibility", capture_ids: ["calendar-month-light-390"], theme: "Light", motion: "normal", input: "keyboard", viewport: "390x844" },
      { id: "calendar-reduced-motion", capture_ids: ["calendar-month-light-390"], theme: "Light", motion: "reduced", input: "touch", viewport: "390x844" },
    ],
  };
  return {
    directory,
    map,
    run: {
      schema_version: 1,
      run_id: "host-fixture",
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
    assert.deepEqual(result.case_results.map(({ id }) => id), V12_CALENDAR_REQUIRED_CASE_IDS);
    assert.match(result.records[0].overlay.sha256, /^[a-f0-9]{64}$/u);
    assert.doesNotMatch(JSON.stringify(result), /PASS|serial|token|email/u);
    assert.equal(validateV12CalendarComparison(result), true);
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

test("Calendar map requires a unique exact Revision 18 reference and Light/Dark/accessibility/reduced-motion ledger", () => {
  const fixture = completeFixture();
  try {
    const requiredLedger = ["Light", "Dark", "accessibility", "reduced-motion"];
    for (const missing of requiredLedger) {
      const value = structuredClone(fixture.map);
      value.case_ledger = missing === "Light" ? [] : [{ id: missing, capture_ids: [value.captures[0].id], theme: missing === "Dark" ? "Dark" : "Light", motion: missing === "reduced-motion" ? "reduced" : "normal", input: missing === "accessibility" ? "keyboard" : "touch", viewport: "390x844" }];
      assert.throws(() => validateV12CalendarReferenceMap(value));
    }
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("Calendar reference coverage is bound to the exact source-owned 64-configuration and state registry", () => {
  assert.equal(V12_CALENDAR_STATIC_CONFIGURATIONS.length, 64);
  assert.equal(new Set(V12_CALENDAR_STATIC_CONFIGURATIONS.map(({ id }) => id)).size, 64);
  assert.deepEqual(
    new Set(V12_CALENDAR_STATIC_CONFIGURATIONS.map(({ viewport }) => viewport.width)),
    new Set([360, 390, 600, 840, 800, 844, 960, 1080]),
  );
  assert.ok(V12_CALENDAR_REQUIRED_CASE_IDS.includes("state:calendar-loading-month"));
  assert.ok(V12_CALENDAR_REQUIRED_CASE_IDS.includes("state:calendar-rest-day"));
  assert.ok(V12_CALENDAR_REQUIRED_CASE_IDS.includes("state:calendar-query-error-retry"));
  assert.ok(V12_CALENDAR_REQUIRED_CASE_IDS.includes("input:dpad"));

  const fixture = completeFixture();
  try {
    assert.equal(validateV12CalendarReferenceMap(fixture.map), true);
    const incomplete = structuredClone(fixture.map);
    incomplete.case_registry.sha256 = "0".repeat(64);
    assert.throws(() => validateV12CalendarReferenceMap(incomplete), /case_registry_invalid/u);

    const result = compareV12Calendar({
      map: fixture.map,
      run: fixture.run,
      outputDirectory: path.join(fixture.directory, "matrix"),
    });
    result.case_results.pop();
    assert.throws(() => validateV12CalendarComparison(result), /case_result_set_invalid/u);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("the checked-in Calendar map binds every reference byte to the Revision 18 source manifest", () => {
  const map = JSON.parse(readFileSync(".planning/phases/16-calendar-parity/16-REFERENCE-MAP.json", "utf8"));
  assert.equal(sha256(readFileSync(map.source_manifest)), map.source_manifest_sha256);
  assert.equal(validateV12CalendarReferenceMap(map, { verifyFiles: true }), true);
  assert.equal(new Set(map.captures.map((capture) => capture.id)).size, map.captures.length);
});

test("the Phase 16 runner exposes every pre-destination diagnostic stage but cannot award a native verdict", () => {
  const manifest = { schema_version: 1, suite: "v1.2-calendar", profile: "development-test", package: "com.fchoo.gymtracker.devtest", js_bundle: { embedded: true }, base_head: "a".repeat(40), source_tree_sha256: "b".repeat(64), source_manifest_sha256: "e".repeat(64), apk: { sha256: "c".repeat(64) }, installed_apk: { sha256: "c".repeat(64), matches_retained_apk: true }, device: { identity_sha256: "d".repeat(64) }, report_sha256: "f".repeat(64) };
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
