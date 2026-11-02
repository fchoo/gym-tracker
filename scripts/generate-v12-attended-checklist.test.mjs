import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import { V12_ATTENDED_ROWS, buildV12AttendedChecklist, createV12AttendedRecord, validateV12AttendedObservations } from "./generate-v12-attended-checklist.mjs";

const digest = (character) => character.repeat(64);
const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const identity = Object.freeze({ run_id: runId, source_tree_sha256: digest("a"), apk_sha256: digest("b"), apk_signature_sha256: digest("c"), installed_apk_sha256: digest("b"), device: Object.freeze({ model: "SM-S916B", device_sha256: digest("d") }), config_sha256: digest("e") });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function image(index) { const png = new PNG({ width: 1, height: 1 }); png.data.set([index, 0, 0, 255]); return PNG.sync.write(png); }
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "v12-attended-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const rows = V12_ATTENDED_ROWS.map((row, index) => {
    const bytes = image(index + 1); const relative = `artifacts/native/v1.2/${runId}/attended/${row.id}.png`; const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true }); writeFileSync(absolute, bytes);
    const png = { path: relative, sha256: sha256(bytes), size_bytes: bytes.length, width: 1, height: 1 };
    return { id: row.id, status: index === 0 ? "failed" : "passed", png, attestation: { schema_version: 1, kind: "trusted-synthetic-state-content-review", fixture_id: "v12-synthetic-fixtures-r18", synthetic_state: true, content_reviewed: true, png_sha256: png.sha256 } };
  });
  return { root, rows };
}

function observations(rows) { return { schema_version: 2, suite: "v12-samsung-attended-observations", identity, settings_restored: true, rows }; }

test("attended rows retain safe immutable PNG descriptors and preserve a failed row as a failed record", (t) => {
  const { root, rows } = fixture(t); const observed = observations(rows);
  assert.doesNotThrow(() => validateV12AttendedObservations(observed, { identity, root }));
  const checklist = buildV12AttendedChecklist({ identity, generated_at: "2026-10-14T00:00:00.000Z" });
  const record = createV12AttendedRecord({ checklist, observations: observed, recorded_at: "2026-10-14T01:00:00.000Z", root });
  assert.equal(record.status, "failed"); assert.deepEqual(record.rows[0].png, rows[0].png);
});

test("attended validation rejects missing, tampered, duplicate, stale, and unsafe PNG descriptors", (t) => {
  const { root, rows } = fixture(t);
  assert.throws(() => validateV12AttendedObservations(observations(rows.map((row, index) => index === 1 ? { ...row, png: { ...row.png, path: `${row.png.path}.missing` } } : row)), { identity, root }), /PNG|missing|path/u);
  assert.throws(() => validateV12AttendedObservations(observations(rows.map((row, index) => index === 1 ? { ...row, png: { ...row.png, sha256: digest("f") } } : row)), { identity, root }), /PNG|digest|hash/u);
  writeFileSync(path.join(root, rows[1].png.path), readFileSync(path.join(root, rows[0].png.path)));
  assert.throws(() => validateV12AttendedObservations(observations(rows.map((row, index) => index === 1 ? { ...row, png: { ...row.png, sha256: rows[0].png.sha256 }, attestation: { ...row.attestation, png_sha256: rows[0].png.sha256 } } : row)), { identity, root }), /unique|duplicate/u);
  assert.throws(() => validateV12AttendedObservations(observations(rows), { identity: { ...identity, config_sha256: digest("f") }, root }), /identity/u);
  assert.throws(() => validateV12AttendedObservations(observations(rows.map((row, index) => index === 0 ? { ...row, png: { ...row.png, path: "../private.png" } } : row)), { identity, root }), /path|unsafe/u);
});

test("attended PNGs require an exact trusted synthetic-state and content-review attestation", (t) => {
  const { root, rows } = fixture(t);
  for (const mutation of [
    row => { delete row.attestation; },
    row => { row.attestation.synthetic_state = false; },
    row => { row.attestation.content_reviewed = false; },
    row => { row.attestation.fixture_id = "personal-state"; },
    row => { row.attestation.png_sha256 = digest("f"); },
  ]) {
    const changed = structuredClone(rows); mutation(changed[0]);
    assert.throws(() => validateV12AttendedObservations(observations(changed), { identity, root }), /attestation|synthetic|review|PNG/u);
  }
});
