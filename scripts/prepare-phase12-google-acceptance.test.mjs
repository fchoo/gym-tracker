import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PHASE12_GOOGLE_ATTENDED_CASES,
  buildPhase12GoogleChecklist,
  phase12ManifestIdentity,
  serializePhase12GoogleEvidence,
  validateDevelopmentTestManifest,
  validatePhase12GoogleChecklist,
} from "./prepare-phase12-google-acceptance.mjs";
import {
  createPhase12GoogleAcceptanceRecord,
  parsePhase12GoogleAcceptanceArguments,
  validatePhase12GoogleAcceptanceRecord,
  validatePhase12GoogleObservations,
} from "./record-phase12-google-acceptance.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const apkBytes = Buffer.from("phase12-apk");
const manifest = Object.freeze({
  schema_version: 1,
  suite: "phase12",
  profile: "development-test",
  package: "com.fchoo.gymtracker.devtest",
  js_bundle: { embedded: true },
  base_head: "c".repeat(40),
  source_tree_sha256: HASH_A,
  apk: {
    path: "artifacts/native/phase12/gym-tracker-phase12-devtest.apk",
    sha256: sha256(apkBytes),
  },
});

function observations() {
  return {
    schema_version: 1,
    suite: "phase12-google-attended-observations",
    manifest: phase12ManifestIdentity(manifest),
    account_identity_sha256: HASH_B,
    cases: PHASE12_GOOGLE_ATTENDED_CASES.map(({ id }) => ({
      id,
      status: "passed",
      observed_at: "2026-09-29T00:00:00.000Z",
      object_count: id === "emulator-fresh-replacement" ? 1 : 0,
      total_bytes: id === "emulator-fresh-replacement" ? 1024 : 0,
      source_digest_sha256: id === "emulator-fresh-replacement" ? HASH_A : null,
      result_digest_sha256: id === "emulator-fresh-replacement" ? HASH_A : null,
    })),
  };
}

const devices = Object.freeze([
  Object.freeze({
    role: "replacement-emulator",
    model_sha256: HASH_A,
    serial_sha256: HASH_B,
    api: 36,
    abi: "arm64-v8a",
    installed_apk_sha256: manifest.apk.sha256,
  }),
  Object.freeze({
    role: "physical-phone-auth-only",
    model_sha256: HASH_B,
    serial_sha256: HASH_A,
    api: 36,
    abi: "arm64-v8a",
    installed_apk_sha256: manifest.apk.sha256,
  }),
]);

test("Phase 12 attended checklist is exact, pending, and manifest bound", () => {
  assert.equal(validateDevelopmentTestManifest(
    manifest,
    manifest.base_head,
    manifest.source_tree_sha256,
    apkBytes,
  ), true);
  const checklist = buildPhase12GoogleChecklist(manifest, "2026-09-29T00:00:00.000Z");
  assert.deepEqual(checklist.cases.map(({ id }) => id), PHASE12_GOOGLE_ATTENDED_CASES.map(({ id }) => id));
  assert.equal(checklist.status, "pending_human");
  assert.equal(checklist.approval_status, "evidence_pending");
  assert.equal(validatePhase12GoogleChecklist(checklist, manifest), checklist);
  assert.ok(serializePhase12GoogleEvidence(checklist).toString("utf8").endsWith("\n"));
});

test("Phase 12 attended observations require complete redacted proof", () => {
  assert.equal(validatePhase12GoogleObservations(observations(), manifest).cases.length, 2);
  const missing = observations();
  missing.cases = missing.cases.slice(1);
  assert.throws(() => validatePhase12GoogleObservations(missing, manifest), /observations_invalid/u);
  const mismatched = observations();
  mismatched.cases[0] = { ...mismatched.cases[0], result_digest_sha256: HASH_B };
  assert.throws(() => validatePhase12GoogleObservations(mismatched, manifest), /observations_proof_invalid/u);
  const secret = observations();
  secret.access_token = "forbidden";
  assert.throws(() => validatePhase12GoogleObservations(secret, manifest), /shape_invalid/u);
});

test("Phase 12 attended record binds approval, checklist, observations, and both device roles", () => {
  const checklist = buildPhase12GoogleChecklist(manifest, "2026-09-29T00:00:00.000Z");
  const observed = observations();
  const record = createPhase12GoogleAcceptanceRecord({
    manifest,
    checklistBytes: serializePhase12GoogleEvidence(checklist),
    observations: observed,
    observationsBytes: serializePhase12GoogleEvidence(observed),
    emulator: devices[0],
    phone: devices[1],
    recordedAt: "2026-09-29T00:01:00.000Z",
  });
  assert.equal(validatePhase12GoogleAcceptanceRecord(record, manifest), record);
  assert.equal(record.status, "passed");
  assert.equal(record.approval_status, "approved");
  assert.deepEqual(record.devices.map(({ role }) => role), [
    "replacement-emulator",
    "physical-phone-auth-only",
  ]);
  assert.throws(() => validatePhase12GoogleAcceptanceRecord({
    ...record,
    devices: [{ ...devices[0], installed_apk_sha256: HASH_A }, devices[1]],
  }, manifest), /record_device_invalid/u);
});

test("Phase 12 recorder requires the explicit owner approval and canonical paths", () => {
  const args = [
    "--manifest", "artifacts/native/phase12/build.json",
    "--checklist", "artifacts/native/phase12/attended/checklist.pending.json",
    "--observations", "artifacts/native/phase12/attended/observations.json",
    "--emulator-serial", "emulator-5554",
    "--phone-serial", "R123",
    "--output", "artifacts/native/phase12/attended/attended-record.json",
    "--approval", "approved",
  ];
  assert.equal(parsePhase12GoogleAcceptanceArguments(args).approval, "approved");
  assert.throws(() => parsePhase12GoogleAcceptanceArguments(
    args.with(args.indexOf("approved"), "pending"),
  ), /arguments_invalid/u);
});
