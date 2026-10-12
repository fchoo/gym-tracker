import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compareV12Calendar,
  validateV12CalendarComparison,
  validateV12CalendarReferenceMap,
} from "./compare-v12-calendar.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/gJ+0wsE0QAAAABJRU5ErkJggg==", "base64");

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
    captures: [{
      id: "calendar-month-light-390",
      requirement_ids: ["CAL-01"],
      reference: { path: reference, sha256: sha256(png), width: 1, height: 1 },
      configuration: { theme: "Light", viewport: { width: 390, height: 844 }, orientation: "portrait", font_scale: 1, motion: "normal", input: "touch", fixture: "synthetic-calendar-month-v1" },
    }],
    case_ledger: [{ id: "calendar-light-touch", capture_ids: ["calendar-month-light-390"], theme: "Light", motion: "normal", input: "touch", viewport: "390x844" }],
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
            { kind: "drag", dx: -89.64, viewportWidth: 360, transformX: -89.64, semanticMonth: "2026-10", titleMonth: "2026-10" },
            { kind: "drag", dx: -90, viewportWidth: 360, transformX: -90, semanticMonth: "2026-11", titleMonth: "2026-11" },
            { kind: "drag", dx: -90.36, viewportWidth: 360, transformX: -90.36, semanticMonth: "2026-11", titleMonth: "2026-11" },
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
