import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildV12ReadinessHandoff,
  validateV12ReadinessHandoff,
} from "./create-v12-readiness-handoff.mjs";
import { publishV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const digest = (character) => character.repeat(64);
const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const identity = Object.freeze({
  run_id: runId,
  source_tree_sha256: digest("a"),
  apk_sha256: digest("b"),
  apk_signature_sha256: digest("c"),
  installed_apk_sha256: digest("b"),
  device_sha256: digest("8"),
  config_sha256: digest("d"),
});

const validException = Object.freeze({
  deviation_id: "DEV-20-001",
  owner_decision: "approved with constrained scope",
  decided_at: "2026-10-14",
  scope: "Samsung SM-S916B Dark F200",
  configurations: ["AP-SD-C390-P-F200"],
  rationale: "The signed candidate preserves an explicitly reviewed native limitation.",
  evidence_hashes: [digest("e"), digest("f")],
});

function finalEvidence(overrides = {}) {
  const phaseCounts = { DOM: [13, 17], SHL: [14, 13], WRK: [15, 36], CAL: [16, 23], LIB: [17, 36], GAR: [18, 16], PRO: [19, 18], VER: [20, 13] };
  const rows = Object.entries(phaseCounts).flatMap(([prefix, [phase, count]]) => Array.from({ length: count }, (_, index) => ({
    inventory_id: `INV-${prefix}-${String(index + 1).padStart(2, "0")}`,
    requirement_id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    owning_phase: phase,
    coverage_class: prefix === "VER" && index === 11 ? "attended" : "automated",
    verdict: prefix === "VER" && index === 11 ? "ACCEPTED_EXCEPTION" : "PASS",
    observations: [],
  })));
  const evidenceHashes = rows.map((_, index) => createHash("sha256").update(`evidence-${index}`).digest("hex"));
  return {
    schema_version: 3,
    run_id: runId,
    evidence_origin: "native",
    identity,
    rows,
    source_results: rows.map((row, index) => ({ row_id: row.requirement_id, evidence_sha256: evidenceHashes[index] })),
    evidence_hashes: evidenceHashes,
    gates: [
      { id: "identity", verdict: "PASS", evidence_sha256: digest("3") },
      { id: "automated", verdict: "PASS", evidence_sha256: digest("4") },
    ],
    readiness: "CONDITIONALLY_READY",
    verdict_counts: { PASS: 171, ACCEPTED_EXCEPTION: 1, NOT_RUN: 0, FAIL: 0, REVIEW_REQUIRED: 0, N_A_REVIEWED: 0 },
    accepted_exception_count: 1,
    release_authorized: false,
    policy: reviewedPolicy,
    exceptions: [{ row_id: "VER-12", ...validException }],
    ...overrides,
  };
}

const reviewedPolicy = Object.freeze({
  policy_id: "v12-reviewed-exception-policy",
  reviewed_by: "owner",
  reviewed_at: "2026-10-14",
  permits_accepted_exceptions: true,
});

const rollback = Object.freeze({
  prior_release_manifest_sha256: digest("4"),
  prior_signed_apk_sha256: digest("5"),
  prior_apk_signature_sha256: digest("6"),
  prior_apk_certificate_sha256: digest("a"),
  compatible_archive_sha256: digest("7"),
  compatible_archive_format_version: 9,
  clean_restore_receipt_sha256: digest("8"),
  post_restore_facts_sha256: digest("9"),
  last_valid_schema_version: 44,
  current_schema_version: 45,
  newer_schema_committed: true,
  recovery_boundary: "compatible_restore_or_forward_fix",
  rollback_evidence_sha256: digest("b"),
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
    PASS: 171,
    ACCEPTED_EXCEPTION: 1,
    NOT_RUN: 0,
    FAIL: 0,
    REVIEW_REQUIRED: 0,
    N_A_REVIEWED: 0,
  });
  assert.equal(handoff.release_authorized, false);
  assert.deepEqual(handoff.exceptions, [{ row_id: "VER-12", ...validException }]);
  assert.equal(handoff.schema_version, 2);
  assert.equal(handoff.run_id, runId);
  assert.equal(handoff.final_evidence_sha256.length, 64);
  assert.doesNotMatch(JSON.stringify(handoff), /release command|publish|promote/iu);
  assert.doesNotThrow(() => validateV12ReadinessHandoff(handoff));
});

test("missing gates, unreviewed exceptions, and other non-PASS verdicts prevent conditional readiness", () => {
  assert.throws(
    () => buildV12ReadinessHandoff({
      final_evidence: finalEvidence({ gates: finalEvidence().gates.slice(1) }),
      reviewed_policy: null,
      rollback,
      generated_at: "2026-10-14T01:00:00.000Z",
    }),
    /gate/u,
  );
  for (const verdict of ["NOT_RUN", "FAIL", "REVIEW_REQUIRED", "N_A_REVIEWED"]) {
    const changedRows = finalEvidence().rows.map((row, index) => index === 0 ? { ...row, verdict } : row);
    const changedCounts = { ...finalEvidence().verdict_counts, PASS: 170, [verdict]: 1 };
    const handoff = buildV12ReadinessHandoff({
      final_evidence: finalEvidence({
        rows: changedRows,
        verdict_counts: changedCounts,
        accepted_exception_count: 1,
        readiness: "NOT_READY",
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
        exceptions: [],
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
  const blocked = buildV12ReadinessHandoff({
    final_evidence: finalEvidence(), reviewed_policy: reviewedPolicy,
    rollback: { status: "NOT_VERIFIED", reason_code: "rollback_evidence_missing", recovery_boundary: "compatible_restore_or_forward_fix" },
    generated_at: "2026-10-14T01:00:00.000Z",
  });
  assert.equal(blocked.readiness, "NOT_READY");
  assert.throws(() => validateV12ReadinessHandoff(blocked), /verified rollback/u);
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

test("the real --verify CLI requires the exact atomic four-member final publication", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-readiness-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(base, { recursive: true });
  const evidence = finalEvidence();
  const handoff = buildV12ReadinessHandoff({ final_evidence: evidence, reviewed_policy: reviewedPolicy, rollback, generated_at: "2026-10-14T01:00:00.000Z" });
  writeFileSync(path.join(base, "final-evidence.json"), `${JSON.stringify(evidence)}\n`);
  writeFileSync(path.join(base, "readiness-handoff.md"), `${JSON.stringify(handoff)}\n`);
  const script = new URL("./create-v12-readiness-handoff.mjs", import.meta.url);
  const loose = spawnSync(process.execPath, [script.pathname, "--run", runId, "--verify"], { cwd: root, encoding: "utf8" });
  assert.notEqual(loose.status, 0);
  rmSync(path.join(base, "final-evidence.json"));
  rmSync(path.join(base, "readiness-handoff.md"));
  publishV12AtomicShard({
    root,
    runId,
    shard: "final",
    produce: ({ write }) => {
      write("ui-state-matrix.json", { schema_version: 3, run_id: runId });
      write("final-evidence.json", evidence);
      write("parity-report.md", "Phase 20 parity report\n");
      write("readiness-handoff.md", handoff);
    },
  });
  const valid = spawnSync(process.execPath, [script.pathname, "--run", runId, "--verify"], { cwd: root, encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stderr);
  writeFileSync(path.join(base, "readiness-handoff.md"), `${JSON.stringify({ ...handoff, final_evidence_sha256: digest("0") })}\n`);
  const invalid = spawnSync(process.execPath, [script.pathname, "--run", runId, "--verify"], { cwd: root, encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /v12_(?:readiness_invalid|atomic_publish_member_invalid)/u);
});

test("the real --verify CLI rejects a final publication with a missing or extra member", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-readiness-member-set-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(base, { recursive: true });
  const evidence = finalEvidence();
  const handoff = buildV12ReadinessHandoff({ final_evidence: evidence, reviewed_policy: reviewedPolicy, rollback, generated_at: "2026-10-14T01:00:00.000Z" });
  publishV12AtomicShard({
    root,
    runId,
    shard: "final",
    produce: ({ write }) => {
      write("final-evidence.json", evidence);
      write("parity-report.md", "Phase 20 parity report\n");
      write("readiness-handoff.md", handoff);
      write("unexpected.json", { unexpected: true });
    },
  });
  const script = new URL("./create-v12-readiness-handoff.mjs", import.meta.url);
  const invalid = spawnSync(process.execPath, [script.pathname, "--run", runId, "--verify"], { cwd: root, encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /v12_readiness_invalid/u);
});

test("Phase 20 package commands are registered as host-only entrypoints", () => {
  const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(scripts["test:evidence:v12"], "node --test scripts/v12-evidence-scripts.test.mjs scripts/generate-v12-attended-checklist.test.mjs scripts/create-v12-readiness-handoff.test.mjs");
  assert.equal(scripts["test:maestro:v12"], "node scripts/run-v12-maestro.mjs");
  assert.equal(scripts["benchmark:v12:interactions"], "node scripts/benchmark-v12-interactions.mjs");
  assert.equal(scripts["verify:attended:v12"], "node scripts/generate-v12-attended-checklist.mjs verify");
  assert.equal(scripts["verify:v12:evidence"], "node scripts/verify-v12-native-evidence.mjs");
});
