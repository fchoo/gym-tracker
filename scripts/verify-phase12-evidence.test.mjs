import assert from "node:assert/strict";
import test from "node:test";

import { PHASE12_GOOGLE_CASE_IDS, PHASE12_MIGRATION_CASE_IDS, parsePhase12VerifierArgs, validatePhase12AutomatedEvidence } from "./verify-phase12-evidence.mjs";
import { PHASE12_MAESTRO_STAGES } from "./run-phase12-maestro.mjs";

const manifest = { schema_version: 1, suite: "phase12", profile: "development-test", package: "com.fchoo.gymtracker.devtest", js_bundle: { embedded: true }, base_head: "a".repeat(40), source_tree_sha256: "b".repeat(64), apk: { path: "artifacts/native/phase12/fake.apk", sha256: "c".repeat(64) } };
const result = (suite, ids) => ({ schema_version: 1, suite, status: "passed", build_manifest: "artifacts/native/phase12/build.json", base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, package: manifest.package, apk: manifest.apk, installed_apk: { sha256: manifest.apk.sha256, matches_retained_apk: true }, contract: { expected_count: ids.length, total: ids.length, passed: ids.length, failed: 0, skipped: 0, cases: ids.map((id) => ({ id, status: "passed", durationMs: 1 })) } });
const samples = (count, value) => Array.from({ length: count }, () => value);
const benchmark = { schema_version: 1, suite: "phase12", producer: "phase12-backup-benchmark/v1", status: "passed", mode: "automated-only", manifest: { base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, apk_sha256: manifest.apk.sha256, package: manifest.package }, measurements: { dirty_trigger_ms: samples(100, 1), writer_occupancy_ms: samples(20, 1), merge_preflight_ms: samples(10, 1), merge_peak_growth_bytes: samples(10, 1), snapshot_bytes: 24 * 1024 * 1024, total_rows: 100_000, merge_digest_concurrency: 4, merge_output_equivalent: true, network_inside_writer: false, skipped: 0 } };
const maestro = { schema_version: 1, suite: "phase12", status: "passed", stages: PHASE12_MAESTRO_STAGES.map((stage) => ({ stage, sha256: "d".repeat(64) })) };

test("Phase 12 verifier requires the complete native, Maestro, benchmark, and no-secret automated matrix", () => {
  assert.doesNotThrow(() => validatePhase12AutomatedEvidence({ manifest, migrations: result("migrations-effects", PHASE12_MIGRATION_CASE_IDS), google: result("google-drive-backup", PHASE12_GOOGLE_CASE_IDS), maestro, benchmark }));
  assert.throws(() => validatePhase12AutomatedEvidence({ manifest, migrations: result("migrations-effects", PHASE12_MIGRATION_CASE_IDS), google: result("google-drive-backup", PHASE12_GOOGLE_CASE_IDS.slice(1)), maestro, benchmark }));
  assert.throws(() => validatePhase12AutomatedEvidence({ manifest, migrations: result("migrations-effects", PHASE12_MIGRATION_CASE_IDS), google: result("google-drive-backup", PHASE12_GOOGLE_CASE_IDS), maestro: { ...maestro, stages: maestro.stages.slice(1) }, benchmark }));
  assert.throws(() => validatePhase12AutomatedEvidence({ manifest, migrations: result("migrations-effects", PHASE12_MIGRATION_CASE_IDS), google: result("google-drive-backup", PHASE12_GOOGLE_CASE_IDS), maestro, benchmark: { ...benchmark, accessToken: "secret" } }));
});

test("Phase 12 CLI never allows an automated run to impersonate attended Google proof", () => {
  assert.deepEqual(parsePhase12VerifierArgs(["--manifest", "artifacts/native/phase12/build.json", "--automated-only"]), { manifest: "artifacts/native/phase12/build.json", automatedOnly: true });
  assert.throws(() => parsePhase12VerifierArgs(["--manifest", "other.json", "--automated-only"]));
  assert.throws(() => parsePhase12VerifierArgs(["--manifest", "artifacts/native/phase12/build.json", "--require-real-google"]));
});
