import assert from "node:assert/strict";
import test from "node:test";

import {
  V12_ATTENDED_ROWS,
  buildV12AttendedChecklist,
  createV12AttendedRecord,
  validateV12AttendedObservations,
} from "./generate-v12-attended-checklist.mjs";

const digest = (character) => character.repeat(64);

const identity = Object.freeze({
  run_id: "v12-samsung-acceptance-001",
  source_tree_sha256: digest("a"),
  apk_sha256: digest("b"),
  apk_signature_sha256: digest("c"),
  installed_apk_sha256: digest("b"),
  device: Object.freeze({
    model: "SM-S916B",
    device_sha256: digest("d"),
  }),
  config_sha256: digest("e"),
});

function observations(overrides = {}) {
  return {
    schema_version: 1,
    suite: "v12-samsung-attended-observations",
    identity,
    rows: V12_ATTENDED_ROWS.map((row, index) => ({
      id: row.id,
      status: index === 0 ? "failed" : "passed",
      png_sha256: digest(String((index + 1) % 10)),
    })),
    ...overrides,
  };
}

test("the fresh Samsung checklist covers all required observation surfaces without a device identifier", () => {
  const checklist = buildV12AttendedChecklist({
    identity,
    generated_at: "2026-10-14T00:00:00.000Z",
  });

  assert.equal(checklist.mode, "observation-only");
  assert.equal(checklist.release_authorized, false);
  assert.equal(checklist.rows.length, 7);
  assert.deepEqual(V12_ATTENDED_ROWS.map(({ id }) => id), [
    "S20-01", "S20-02", "S20-03", "S20-04", "S20-05", "S20-06", "S20-07",
  ]);
  assert.match(JSON.stringify(checklist), /one-handed dock/u);
  assert.match(JSON.stringify(checklist), /keyboard, D-pad, and 3dp focus/u);
  assert.doesNotMatch(JSON.stringify(checklist), /serial|raw_path|release_authorized":true/u);
});

test("observation validation requires exact identity, all rows, unique PNG hashes, and pass/fail statuses", () => {
  assert.doesNotThrow(() => validateV12AttendedObservations(observations()));
  assert.throws(
    () => validateV12AttendedObservations(observations({
      identity: { ...identity, config_sha256: digest("f") },
    }), { identity }),
    /identity/u,
  );
  assert.throws(
    () => validateV12AttendedObservations(observations({ rows: observations().rows.slice(1) })),
    /row/u,
  );
  assert.throws(
    () => validateV12AttendedObservations(observations({
      rows: observations().rows.map((row) => ({ ...row, png_sha256: digest("9") })),
    })),
    /unique|PNG/u,
  );
  assert.throws(
    () => validateV12AttendedObservations(observations({
      rows: observations().rows.map((row) => ({ ...row, status: "pending_human" })),
    })),
    /status/u,
  );
});

test("N4 proof, authority fields, raw device data, and private paths are rejected recursively", () => {
  for (const invalid of [
    { n4_status: "passed" },
    { approval: "approved" },
    { release_authorized: true },
    { device: { ...identity.device, serial: "R5CT" } },
    { evidence: { raw_path: "/private/device/screenshot.png" } },
  ]) {
    assert.throws(
      () => validateV12AttendedObservations(observations(invalid)),
      /forbidden|privacy|authority|N4/u,
    );
  }
});

test("a recorded observation preserves failures and never grants readiness or release authority", () => {
  const checklist = buildV12AttendedChecklist({
    identity,
    generated_at: "2026-10-14T00:00:00.000Z",
  });
  const record = createV12AttendedRecord({
    checklist,
    observations: observations(),
    recorded_at: "2026-10-14T01:00:00.000Z",
  });

  assert.equal(record.status, "failed");
  assert.equal(record.rows[0].status, "failed");
  assert.equal(record.release_authorized, false);
  assert.equal("approval" in record, false);
});
