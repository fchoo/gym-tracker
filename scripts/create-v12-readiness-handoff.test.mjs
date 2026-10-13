import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildV12ReadinessHandoff,
  validateV12ReadinessHandoff,
} from "./create-v12-readiness-handoff.mjs";

const digest = (character) => character.repeat(64);
const identity = Object.freeze({
  run_id: "v12-samsung-acceptance-001",
  source_tree_sha256: digest("a"),
  apk_sha256: digest("b"),
  apk_signature_sha256: digest("c"),
  installed_apk_sha256: digest("b"),
  config_sha256: digest("d"),
});

const validException = Object.freeze({
  deviation_id: "DEV-20-001",
  owner_decision: "approved with constrained scope",
  owner_decided_at: "2026-10-14T00:00:00.000Z",
  scope: ["Samsung SM-S916B", "Dark", "F200"],
  rationale: "The signed candidate preserves an explicitly reviewed native limitation.",
  evidence_sha256: [digest("e"), digest("f")],
});

function finalEvidence(overrides = {}) {
  return {
    identity,
    rows: [
      { id: "VER-01", verdict: "PASS", evidence_sha256: [digest("1")] },
      { id: "VER-12", verdict: "ACCEPTED_EXCEPTION", evidence_sha256: [digest("2")], exception: validException },
    ],
    gates: [
      { id: "identity", verdict: "PASS", evidence_sha256: digest("3") },
      { id: "automated", verdict: "PASS", evidence_sha256: digest("4") },
    ],
    ...overrides,
  };
}

const reviewedPolicy = Object.freeze({
  policy_id: "v12-reviewed-exception-policy",
  reviewer: "owner",
  reviewed_at: "2026-10-14T00:00:00.000Z",
  permits_conditional_readiness: true,
});

const rollback = Object.freeze({
  prior_signed_apk_sha256: digest("5"),
  prior_apk_signature_sha256: digest("6"),
  compatible_archive_sha256: digest("7"),
  last_valid_schema_version: 23,
  newer_schema_committed: true,
  recovery_boundary: "compatible_restore_or_forward_fix",
});

test("conditional readiness keeps every verdict and exception separate while release authorization stays false", () => {
  const handoff = buildV12ReadinessHandoff({
    final_evidence: finalEvidence(),
    reviewed_policy: reviewedPolicy,
    rollback,
    generated_at: "2026-10-14T01:00:00.000Z",
  });

  assert.equal(handoff.readiness, "CONDITIONALLY_READY");
  assert.deepEqual(handoff.verdict_counts, {
    PASS: 1,
    ACCEPTED_EXCEPTION: 1,
    NOT_RUN: 0,
    FAIL: 0,
    REVIEW_REQUIRED: 0,
    N_A_REVIEWED: 0,
  });
  assert.equal(handoff.release_authorized, false);
  assert.deepEqual(handoff.exceptions, [{ row_id: "VER-12", ...validException }]);
  assert.doesNotMatch(JSON.stringify(handoff), /release command|publish|promote/iu);
  assert.doesNotThrow(() => validateV12ReadinessHandoff(handoff));
});

test("missing gates, unreviewed exceptions, and other non-PASS verdicts prevent conditional readiness", () => {
  assert.throws(
    () => buildV12ReadinessHandoff({
      final_evidence: finalEvidence({ gates: finalEvidence().gates.slice(1) }),
      reviewed_policy: reviewedPolicy,
      rollback,
      generated_at: "2026-10-14T01:00:00.000Z",
    }),
    /gate/u,
  );
  for (const verdict of ["NOT_RUN", "FAIL", "REVIEW_REQUIRED", "N_A_REVIEWED"]) {
    const handoff = buildV12ReadinessHandoff({
      final_evidence: finalEvidence({
        rows: [{ id: "VER-01", verdict, evidence_sha256: [digest("1")] }],
      }),
      reviewed_policy: reviewedPolicy,
      rollback,
      generated_at: "2026-10-14T01:00:00.000Z",
    });
    assert.equal(handoff.readiness, "NOT_READY");
    assert.equal(handoff.verdict_counts[verdict], 1);
  }
  assert.throws(
    () => buildV12ReadinessHandoff({
      final_evidence: finalEvidence({
        rows: [{ id: "VER-12", verdict: "ACCEPTED_EXCEPTION", evidence_sha256: [digest("2")] }],
      }),
      reviewed_policy: reviewedPolicy,
      rollback,
      generated_at: "2026-10-14T01:00:00.000Z",
    }),
    /exception/u,
  );
});

test("rollback binds a prior signed archive and requires compatible restore or a forward fix after a schema commit", () => {
  assert.throws(
    () => buildV12ReadinessHandoff({
      final_evidence: finalEvidence(),
      reviewed_policy: reviewedPolicy,
      rollback: { ...rollback, recovery_boundary: "downgrade old APK onto new schema" },
      generated_at: "2026-10-14T01:00:00.000Z",
    }),
    /rollback|boundary/u,
  );
});

test("the validator rejects authorization and generated release commands even when all evidence looks valid", () => {
  const handoff = buildV12ReadinessHandoff({
    final_evidence: finalEvidence(),
    reviewed_policy: reviewedPolicy,
    rollback,
    generated_at: "2026-10-14T01:00:00.000Z",
  });
  assert.throws(
    () => validateV12ReadinessHandoff({ ...handoff, release_authorized: true }),
    /authorization/u,
  );
  assert.throws(
    () => validateV12ReadinessHandoff({ ...handoff, release_command: "npm run release" }),
    /unexpected|release/u,
  );
});

test("Phase 20 package commands are registered as host-only entrypoints", () => {
  const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(scripts["test:evidence:v12"], "node --test scripts/v12-evidence-scripts.test.mjs scripts/generate-v12-attended-checklist.test.mjs scripts/create-v12-readiness-handoff.test.mjs");
  assert.equal(scripts["test:maestro:v12"], "node scripts/run-v12-maestro.mjs");
  assert.equal(scripts["benchmark:v12:interactions"], "node scripts/benchmark-v12-interactions.mjs");
  assert.equal(scripts["verify:attended:v12"], "node scripts/generate-v12-attended-checklist.mjs verify");
  assert.equal(scripts["verify:v12:evidence"], "node scripts/verify-v12-native-evidence.mjs");
});
