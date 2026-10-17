import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildV12ReadinessHandoff } from "./create-v12-readiness-handoff.mjs";
import {
  V12_ARTIFACT_REGISTRY,
  assertV12ExactArtifactFileSet,
  recoverV12FinalPublication,
  validateV12ContractSourceIdentity,
} from "./verify-v12-native-evidence.mjs";

const digest = character => character.repeat(64);

test("native artifact and provenance coverage includes every declared Maestro shard", () => {
  assert.deepEqual(Object.keys(V12_ARTIFACT_REGISTRY), [
    "sqlite", "recovery", "garmin", "calendar", "multi-plan", "workout", "library-running", "visual", "accessibility", "performance",
  ]);
});

test("exact retained file-set validation rejects arbitrary extras", () => {
  const expected = ["build.json", "publication/sqlite.json", "sqlite/history.json"];
  assert.equal(assertV12ExactArtifactFileSet(expected, expected), true);
  assert.throws(
    () => assertV12ExactArtifactFileSet([...expected, "private-source-rows.json"], expected),
    /v12_preflight_artifact_set_invalid/u,
  );
});

test("preseal and final contract identity compares planning, prototype, and fixture hashes exactly", () => {
  const manifest = {
    planning: { matrix_sha256: digest("1"), requirements_sha256: digest("2"), source_manifest_sha256: digest("3"), owner_brief_sha256: digest("4"), ui_spec_sha256: digest("5"), deviations_sha256: digest("6") },
    prototype: { revision: 18, approval_sha256: digest("7"), html_sha256: digest("8") },
    fixtures: { registry_sha256: digest("9") },
  };
  assert.equal(validateV12ContractSourceIdentity(manifest, structuredClone({ planning: manifest.planning, prototype: manifest.prototype, fixtures: manifest.fixtures })), true);
  assert.throws(
    () => validateV12ContractSourceIdentity(manifest, { planning: { ...manifest.planning, requirements_sha256: digest("0") }, prototype: manifest.prototype, fixtures: manifest.fixtures }),
    /v12_preflight_contract_identity_invalid/u,
  );
});

test("final publication recovers after the readiness handoff but before the final manifest", (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-final-recovery-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = "phase20-20261017T000000Z-aaaaaaaaaaaa";
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  const stage = path.join(runRoot, ".staging/final");
  mkdirSync(stage, { recursive: true });
  const identity = { run_id: runId, source_tree_sha256: digest("1"), apk_sha256: digest("2"), apk_signature_sha256: digest("3"), installed_apk_sha256: digest("2"), device_sha256: digest("4"), config_sha256: digest("5") };
  const finalEvidence = {
    schema_version: 3, run_id: runId, evidence_origin: "native", identity,
    rows: [{ inventory_id: "INV-001", requirement_id: "VER-01", owning_phase: 20, coverage_class: "automated", verdict: "PASS", observations: [] }],
    source_results: [], evidence_hashes: [],
    gates: [{ id: "identity", verdict: "PASS", evidence_sha256: digest("6") }, { id: "automated", verdict: "PASS", evidence_sha256: digest("7") }],
    readiness: "READY", verdict_counts: { PASS: 1, ACCEPTED_EXCEPTION: 0, NOT_RUN: 0, FAIL: 0, REVIEW_REQUIRED: 0, N_A_REVIEWED: 0 },
    accepted_exception_count: 0, release_authorized: false, policy: null, exceptions: [],
  };
  const handoff = buildV12ReadinessHandoff({
    final_evidence: finalEvidence,
    reviewed_policy: null,
    rollback: { status: "NOT_VERIFIED", reason_code: "rollback_evidence_missing", recovery_boundary: "compatible_restore_or_forward_fix" },
    generated_at: "2026-10-17T00:00:00.000Z",
  });
  const values = {
    "ui-state-matrix.json": { schema_version: 3, run_id: runId, release_authorized: false },
    "final-evidence.json": finalEvidence,
    "parity-report.md": "Phase 20 parity report\n",
    "readiness-handoff.md": handoff,
  };
  const members = [];
  for (const [artifact, value] of Object.entries(values)) {
    const bytes = Buffer.from(typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
    writeFileSync(path.join(stage, artifact), bytes);
    members.push({ artifact, sha256: createHash("sha256").update(bytes).digest("hex"), size_bytes: bytes.length });
  }
  const manifest = { schema_version: 1, producer: "v12-atomic-shard-publication/v1", run_id: runId, shard: "final", identity: null, members, completed: true };
  writeFileSync(path.join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`);

  assert.equal(recoverV12FinalPublication(root, runId), true);
  assert.equal(existsSync(path.join(runRoot, "publication/final.json")), true);
  assert.equal(existsSync(path.join(runRoot, ".staging")), false);
  const planningHandoff = path.join(root, ".planning/phases/20-native-acceptance/20-READINESS-HANDOFF.md");
  assert.deepEqual(JSON.parse(readFileSync(planningHandoff, "utf8")), handoff);
  assert.equal(recoverV12FinalPublication(root, runId), false);
});
