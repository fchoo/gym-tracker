import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PHASE14_SHELL_CASE_IDS,
  PHASE14_SHELL_EVIDENCE_CASES,
} from "../src/testing/contracts/phase14Shell.contract.ts";
import {
  PHASE14_MAESTRO_STAGES,
  validateDistinctPhase14Flows,
  validatePhase14Manifest,
} from "./run-phase14-maestro.mjs";
import {
  validatePhase14CurrentArtifacts,
  validatePhase14Dev02,
  validatePhase14Evidence,
  validatePhase14Privacy,
  validatePhase14SourceInventory,
  parsePhase14VerifierArgs,
  stableDeviceIdentitySha256,
} from "./verify-phase14-evidence.mjs";
import { parsePhase14RunnerArgs } from "./run-phase14-maestro.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const expectedIds = [
  "shell.four-roots", "shell.root-state", "shell.appearance", "shell.tokens",
  "shell.sheets", "shell.toasts", "shell.launch", "shell.rest-alerts",
  "shell.settings-deep-links", "shell.removed-sessions", "shell.data-recovery",
  "shell.automatic-backup", "shell.manual-backup",
];
const manifest = Object.freeze({
  schema_version: 1,
  suite: "phase14",
  profile: "development-test",
  package: "com.fchoo.gymtracker.devtest",
  js_bundle: { embedded: true },
  base_head: "a".repeat(40),
  source_tree_sha256: "b".repeat(64),
  device: { identity_sha256: "c".repeat(64) },
  apk: { path: "artifacts/native/phase14/app-devtest.apk", sha256: "d".repeat(64) },
});

const evidenceRow = (id) => ({
  id,
  status: "passed",
  requirement: `SHL-${String(expectedIds.indexOf(id) + 1).padStart(2, "0")}`,
  path: `.planning/phases/14-prototype-visual-shell/evidence/${id}.json`,
  report: `artifacts/native/phase14/maestro/${id}.xml`,
  report_sha256: "e".repeat(64),
  screenshot_sha256: "f".repeat(64),
  component_verdict: "passed",
  native_verdict: "passed",
});

const validEvidence = () => ({
  schema_version: 1,
  suite: "phase14",
  status: "passed",
  build_manifest: "artifacts/native/phase14/build.json",
  base_head: manifest.base_head,
  source_tree_sha256: manifest.source_tree_sha256,
  package: manifest.package,
  profile: manifest.profile,
  device_identity_sha256: manifest.device.identity_sha256,
  apk: { ...manifest.apk, installed_sha256: manifest.apk.sha256, matches_retained_apk: true },
  stages: PHASE14_MAESTRO_STAGES.map((stage) => ({ stage, status: "passed" })),
  evidence: expectedIds.map(evidenceRow),
  dev02: {
    owner_record: "accessible-9b470b",
    status: "evidence-pending",
    title_hex: "#9B470B",
    sport_hex: "#D97820",
    native_blended_fill: { status: "passed", report_sha256: "e".repeat(64) },
  },
});

test("Phase 14 ledger owns every exact shell ID once with one requirement, stage, and canonical evidence path", () => {
  assert.deepEqual(PHASE14_SHELL_CASE_IDS, expectedIds);
  assert.equal(PHASE14_SHELL_EVIDENCE_CASES.length, expectedIds.length);
  assert.deepEqual(PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id), expectedIds);
  for (const entry of PHASE14_SHELL_EVIDENCE_CASES) {
    assert.match(entry.requirement, /^SHL-(?:0[1-9]|1[0-3])$/u);
    assert.match(entry.stage, /^phase14-[a-z0-9-]+$/u);
    assert.equal(entry.evidencePath, `.planning/phases/14-prototype-visual-shell/evidence/${entry.id}.json`);
  }
  assert.doesNotThrow(() => validateDistinctPhase14Flows({
    shell: PHASE14_MAESTRO_STAGES.map((stage) => `PHASE14_STAGE == '${stage}'`).join("\n"),
  }));
});

test("Phase 14 rejects stale source/APK/package/profile/device identity and invalid native stages", () => {
  assert.equal(stableDeviceIdentitySha256(["fingerprint", "abi", "model", "36", "16"]), stableDeviceIdentitySha256(["fingerprint", "abi", "model", "36", "16"]));
  assert.notEqual(stableDeviceIdentitySha256(["fingerprint", "abi", "model", "36", "16"]), stableDeviceIdentitySha256(["fingerprint", "abi", "model", "35", "16"]));
  assert.doesNotThrow(() => validatePhase14Manifest(manifest, manifest.base_head, manifest.source_tree_sha256));
  assert.throws(() => validatePhase14Manifest({ ...manifest, package: "com.fchoo.gymtracker" }, manifest.base_head, manifest.source_tree_sha256), /phase14_manifest_invalid/u);
  assert.throws(() => validatePhase14Manifest(manifest, "f".repeat(40), manifest.source_tree_sha256), /phase14_manifest_stale/u);
  const bytes = Buffer.from("phase14-apk");
  const current = { ...manifest, apk: { ...manifest.apk, sha256: sha256(bytes) } };
  assert.doesNotThrow(() => validatePhase14CurrentArtifacts({ manifest: current, currentHead: current.base_head, currentSourceTreeSha256: current.source_tree_sha256, apkBytes: bytes, installedApkSha256: current.apk.sha256, deviceIdentitySha256: current.device.identity_sha256 }));
  assert.throws(() => validatePhase14CurrentArtifacts({ manifest: current, currentHead: current.base_head, currentSourceTreeSha256: current.source_tree_sha256, apkBytes: bytes, installedApkSha256: "0".repeat(64), deviceIdentitySha256: current.device.identity_sha256 }), /phase14_installed_apk_stale/u);
  assert.throws(() => validatePhase14Evidence(validEvidence(), manifest), /phase14_dev02_pending/u);
  const closed = validEvidence();
  closed.dev02.status = "approved";
  assert.doesNotThrow(() => validatePhase14Evidence(closed, manifest));
  assert.throws(() => validatePhase14Evidence({ ...closed, stages: [...closed.stages, { stage: closed.stages[0].stage, status: "passed" }] }, manifest), /phase14_stages_invalid/u);
  assert.throws(() => validatePhase14Evidence({ ...closed, evidence: closed.evidence.slice(1) }, manifest), /phase14_evidence_mapping_invalid/u);
  assert.throws(() => validatePhase14Evidence({ ...closed, evidence: [...closed.evidence, closed.evidence[0]] }, manifest), /phase14_evidence_mapping_invalid/u);
  assert.throws(() => validatePhase14Evidence({ ...closed, evidence: closed.evidence.map((entry, index) => index === 0 ? { ...entry, status: "skipped" } : entry) }, manifest), /phase14_evidence_mapping_invalid/u);
  assert.throws(() => validatePhase14Evidence({ ...closed, evidence: closed.evidence.map((entry, index) => index === 0 ? { ...entry, report_sha256: "invalid" } : entry) }, manifest), /phase14_evidence_mapping_invalid/u);
});

test("Phase 14 rejects privacy hazards, legacy modal owners, and a DEV-02 closure without approved native blended-fill proof", () => {
  for (const unsafe of [
    { output_path: "/Users/example/archive.zip" }, { sql: "SELECT * FROM workouts" },
    { accessToken: "secret" }, { password: "secret" }, { account_identifier: "person@example.com" },
    { archive_bytes: "deadbeef" },
  ]) assert.throws(() => validatePhase14Privacy(unsafe), /phase14_privacy_invalid/u);
  assert.doesNotThrow(() => validatePhase14Privacy({ fixture: "deterministic", source_digest: "a".repeat(64) }));
  assert.doesNotThrow(() => validatePhase14SourceInventory({
    confirmationSheet: "return <BottomSheet />;",
    appearanceSheet: "return <BottomSheet />;",
    consumers: [{ file: "src/ui/components/BottomSheet.tsx", source: "<Modal />", exception: "shared-frame" }],
  }));
  assert.throws(() => validatePhase14SourceInventory({
    confirmationSheet: "return <Modal />;", appearanceSheet: "return <BottomSheet />;", consumers: [],
  }), /phase14_sheet_delegation_invalid/u);
  assert.throws(() => validatePhase14SourceInventory({
    confirmationSheet: "return <BottomSheet />;", appearanceSheet: "return <BottomSheet />;",
    consumers: [{ file: "src/ui/screens/LibraryScreen.tsx", source: "<Modal />" }],
  }), /phase14_legacy_modal_owner/u);
  assert.doesNotThrow(() => validatePhase14Dev02({ owner_record: "accessible-9b470b", status: "approved", title_hex: "#9B470B", sport_hex: "#D97820", native_blended_fill: { status: "passed", report_sha256: "a".repeat(64) } }));
  assert.throws(() => validatePhase14Dev02({ owner_record: "accessible-9b470b", status: "approved", title_hex: "#9B470B", sport_hex: "#D97820", native_blended_fill: { status: "pending" } }), /phase14_dev02_native_evidence_invalid/u);
});

test("Phase 14 runner and verifier accept exact canonical subsets and reject ambiguous selection", () => {
  assert.deepEqual(parsePhase14RunnerArgs(["--manifest", "artifacts/native/phase14/build.json", "--ids", "shell.four-roots,shell.tokens"]), { manifest: "artifacts/native/phase14/build.json", ids: ["shell.four-roots", "shell.tokens"] });
  assert.throws(() => parsePhase14RunnerArgs(["--manifest", "artifacts/native/phase14/build.json", "--ids", "shell.tokens,shell.tokens"]), /phase14_runner_arguments_invalid/u);
  assert.deepEqual(parsePhase14VerifierArgs(["--manifest", "artifacts/native/phase14/build.json", "--ids", "shell.four-roots,shell.tokens"]), { manifest: "artifacts/native/phase14/build.json", all: false, ids: ["shell.four-roots", "shell.tokens"] });
  assert.throws(() => parsePhase14VerifierArgs(["--manifest", "artifacts/native/phase14/build.json", "--all", "--ids", "shell.tokens"]), /phase14_verifier_arguments_invalid/u);
});
