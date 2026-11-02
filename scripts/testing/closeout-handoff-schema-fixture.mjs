// Existing numeric schema fixtures for adversarial rejection only; no source/native authority.
import assert from "node:assert/strict";

import { spawnSync } from "node:child_process";

import { createHash } from "node:crypto";

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { tmpdir } from "node:os";

import path from "node:path";

import test from "node:test";

import {
  buildV12ReadinessHandoff,
  validateV12ReadinessHandoff,
  writeV12VerifiedReadinessMirror,
} from "../create-v12-readiness-handoff.mjs";

import { publishV12AtomicShard } from "../v12-atomic-shard-publication.mjs";

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
export { finalEvidence, rollback, runId };
