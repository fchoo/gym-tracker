import assert from "node:assert/strict";
import test from "node:test";

import {
  assertV12ArtifactPrivacySafe,
  assertV12PrivacySafeValue,
} from "./v12-artifact-privacy.mjs";

test("recursive privacy validation accepts bounded technical evidence", () => {
  const evidence = {
    schema_version: 1,
    producer: "v12-controlled-evidence/v1",
    run_id: "phase20-20261017T000000Z-aaaaaaaaaaaa",
    artifact: "artifacts/native/v1.2/phase20-20261017T000000Z-aaaaaaaaaaaa/proof.json",
    counts: { passed: 12, failed: 0 },
    dev02: { token_measurement_verdict: "PASS" },
    hashes: ["a".repeat(64)],
  };
  assert.equal(assertV12PrivacySafeValue(evidence), true);
  assert.equal(assertV12ArtifactPrivacySafe("proof.json", Buffer.from(JSON.stringify(evidence))), true);
});

test("recursive privacy validation rejects credentials, source rows, routes, health data, SQL params, filenames, and raw payloads", () => {
  const attacks = [
    { credentials: { access_token: "secret" } },
    { source_rows: [{ id: "personal-row" }] },
    { route: { coordinates: [[1.29, 103.85]] } },
    { gps_samples: [{ latitude: 1.29, longitude: 103.85 }] },
    { heart_rate: [141, 145] },
    { bodyweight_kg: 72.4 },
    { sql_params: ["personal-id"] },
    { personal_filename: "morning-run.fit" },
    { raw_payload: "{\"private\":true}" },
  ];
  for (const attack of attacks) {
    assert.throws(() => assertV12PrivacySafeValue(attack), /v12_artifact_privacy_invalid/u);
  }
  for (const text of [
    "Authorization: Bearer abc.def.ghi",
    "source_rows=[{id:1}]",
    "<route><gps latitude=\"1.29\" longitude=\"103.85\" /></route>",
    "heart_rate=145 bodyweight_kg=72.4",
    "sql_params=[personal-id] raw_payload={private:true}",
    "/Users/alice/Downloads/morning-run.fit",
  ]) {
    assert.throws(() => assertV12ArtifactPrivacySafe("report.xml", Buffer.from(text)), /v12_artifact_privacy_invalid/u);
  }
});


test("recursive privacy validation only accepts bounded token measurement verdict enums", () => {
  for (const verdict of ["PASS", "FAIL", "N_A_REVIEWED", "REVIEW_REQUIRED", "NOT_RUN"]) {
    assert.equal(assertV12PrivacySafeValue({ dev02: { token_measurement_verdict: verdict } }), true);
  }
  for (const attack of [
    { token_measurement_verdict: "credential-string" },
    { token_measurement_verdict: { access_token: "secret" } },
    { dev02: { nested: { token_measurement_verdict: ["PASS"] } } },
  ]) {
    assert.throws(() => assertV12PrivacySafeValue({ dev02: attack }), /v12_artifact_privacy_invalid/u);
    assert.throws(() => assertV12ArtifactPrivacySafe("proof.json", Buffer.from(JSON.stringify({ dev02: attack }))), /v12_artifact_privacy_invalid/u);
  }
});

test("binary artifacts are not decoded as text but path metadata remains bounded", () => {
  assert.equal(assertV12ArtifactPrivacySafe("screenshots/BW-001/AP-L-C390-P-F100/native.png", Buffer.from([0, 1, 2, 3])), true);
  assert.throws(
    () => assertV12ArtifactPrivacySafe("../private.png", Buffer.from([0, 1, 2, 3])),
    /v12_artifact_privacy_invalid/u,
  );
});
