import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { executeLiveV12AccessibilityShard, executeV12AccessibilityShard, validateV12AccessibilityPublicationMembers, validateV12AccessibilityShard, verifyV12AccessibilityShard } from "./v12-accessibility-shard.mjs";
import { accessibilityEvidence, qualityIdentity } from "./testing/v12-quality-evidence-fixture.mjs";
import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";
import { createV12ShellRequirementEvidence, validateV12ShellRequirementEvidence, V12_SHELL_REQUIREMENT_REGISTRY } from "./v12-shell-requirement-evidence.mjs";
import { phase14ShellEvidenceFixture, SYNTHETIC_PHASE14_VALIDATION_OPTIONS } from "./testing/v12-phase14-shell-evidence-fixture.mjs";

test("plans source-only accessibility observations without native execution", () => {
  const plan = executeV12AccessibilityShard({ mode: "plan" });
  assert.equal(plan.mode, "plan");
  assert.equal(plan.required_inputs.length, 4);
  assert.equal(plan.focus_ring_dp, 3);
  const identity = qualityIdentity();
  assert.equal(validateV12AccessibilityShard({ schema_version: 1, observations: accessibilityEvidence(identity) }, identity), true);
});

test("generated SHL registry exactly mirrors the Phase 14 action and postcondition contract", () => {
  assert.deepEqual(Object.entries(V12_SHELL_REQUIREMENT_REGISTRY), PHASE14_SHELL_EVIDENCE_CASES.map((entry) => [
    entry.requirement,
    { id: entry.id, action_ids: entry.actions.map(({ id }) => id), postcondition_ids: [...entry.postconditions] },
  ]));
});

test("rejects old fixture-shaped and incomplete accessibility evidence", () => {
  const identity = qualityIdentity();
  const one = accessibilityEvidence(identity).slice(0, 1);
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: one }, identity), /coverage_invalid/u);
  const overlap = accessibilityEvidence(identity); overlap[0].targets[0].bounds_dp.width = 47;
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: overlap }, identity), /targets_invalid/u);
  const duplicate = accessibilityEvidence(identity); duplicate[0].interactions[0].command_count = 2;
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: duplicate }, identity), /interactions_invalid/u);
  const motion = accessibilityEvidence(identity); motion[0].motion.destination = "other";
  assert.throws(() => validateV12AccessibilityShard({ schema_version: 1, observations: motion }, identity), /motion_invalid/u);
});

test("writes exact semantic and geometry observations while keeping attended assistive-tech paths excluded", () => {
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  const identity = qualityIdentity();
  const observations = accessibilityEvidence(identity);
  const manifest = { run_id: runId, source: { tree_sha256: identity.source_tree_sha256 },
    configuration: { id: "AP-L-C390-P-F100" },
    build: { apk: { sha256: identity.apk_sha256 } }, device: {
      installed_apk_sha256: identity.installed_apk_sha256,
      identity_sha256: identity.device_identity_sha256,
    }, fixtures: { registry_sha256: identity.fixture_sha256 } };
  manifest.source.head = "a".repeat(40);
  manifest.build.package = "com.fchoo.gymtracker.devtest";
  const phase14 = phase14ShellEvidenceFixture(manifest);
  const written = new Map();
  const result = executeLiveV12AccessibilityShard({ runId, manifest, phase14Manifest: phase14.phase14Manifest,
    phase14Evidence: phase14.evidence, phase14ValidationOptions: SYNTHETIC_PHASE14_VALIDATION_OPTIONS,
    observe: () => observations, write: (file, value) => written.set(file, value) });
  assert.equal(result.geometry.targets.length, observations.reduce((total, entry) => total + entry.targets.length, 0));
  assert.equal(new Set(result.geometry.targets.map(({ configuration_id }) => configuration_id)).size, 8);
  assert.deepEqual(result.semantic.excludes, ["live-talkback", "switch-scanning", "final-verdict"]);
  assert.equal(result.semantic.shell_receipts.length, 13);
  written.set(`artifacts/native/v1.2/${runId}/build.json`, manifest);
  const readArtifact = (file) => written.get(`artifacts/native/v1.2/${runId}/${file}`);
  assert.equal(verifyV12AccessibilityShard({ runId, readJson: (file) => written.get(file), readArtifact,
    phase14ValidationOptions: SYNTHETIC_PHASE14_VALIDATION_OPTIONS }), true);
  const retainedEvidencePath = `artifacts/native/v1.2/${runId}/shell/phase14/maestro/phase14-evidence.json`;
  const substituted = JSON.parse(written.get(retainedEvidencePath).toString("utf8"));
  substituted.verdict = "FAIL";
  written.set(retainedEvidencePath, Buffer.from(`${JSON.stringify(substituted)}\n`));
  assert.throws(() => verifyV12AccessibilityShard({ runId, readJson: (file) => written.get(file), readArtifact }), /member_invalid/u);
});

test("retains and revalidates the complete Phase 14 closure after the source tree is removed", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-phase14-retained-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  const identity = qualityIdentity();
  const observations = accessibilityEvidence(identity);
  const manifest = { run_id: runId, evidence_origin: "native", source: { head: "a".repeat(40), tree_sha256: identity.source_tree_sha256 },
    configuration: { id: "AP-L-C390-P-F100" }, fixtures: { registry_sha256: identity.fixture_sha256 },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: identity.apk_sha256 } },
    device: { installed_apk_sha256: identity.apk_sha256, identity_sha256: identity.device_identity_sha256 } };
  const phase14 = phase14ShellEvidenceFixture(manifest);
  const extraPath = "artifacts/native/phase14/components/retained-report.json";
  const apkBytes = Buffer.from("phase14-retained-apk");
  phase14.phase14Manifest.apk.sha256 = createHash("sha256").update(apkBytes).digest("hex");
  phase14.phase14Manifest.apk.size_bytes = apkBytes.length;
  phase14.phase14Manifest.installed_apk.sha256 = phase14.phase14Manifest.apk.sha256;
  phase14.evidence.apk.sha256 = phase14.phase14Manifest.apk.sha256;
  phase14.evidence.apk.installed_sha256 = phase14.phase14Manifest.apk.sha256;
  manifest.build.apk.sha256 = phase14.phase14Manifest.apk.sha256;
  manifest.device.installed_apk_sha256 = phase14.phase14Manifest.apk.sha256;
  const source = new Map([
    ["artifacts/native/phase14/build.json", Buffer.from(`${JSON.stringify(phase14.phase14Manifest)}\n`)],
    ["artifacts/native/phase14/maestro/phase14-evidence.json", Buffer.from(`${JSON.stringify(phase14.evidence)}\n`)],
    [phase14.phase14Manifest.apk.path, apkBytes],
    [extraPath, Buffer.from('{"producer":"phase14-component-report/v1"}\n')],
  ]);
  for (const [relative, bytes] of source) {
    const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
  }
  const validatePhase14Evidence = (_evidence, _phase14Manifest, _ids, options) => {
    assert.deepEqual(options.readArtifact(extraPath), source.get(extraPath));
    return true;
  };
  const written = new Map();
  executeLiveV12AccessibilityShard({ runId, root, manifest, phase14Manifest: phase14.phase14Manifest,
    phase14Evidence: phase14.evidence, phase14ValidationOptions: { root, validatePhase14Evidence },
    observe: () => observations, write: (file, value) => written.set(file, value) });
  written.set(`artifacts/native/v1.2/${runId}/build.json`, manifest);
  const registryPath = `artifacts/native/v1.2/${runId}/shell/phase14/artifact-registry.json`;
  const registry = written.get(registryPath);
  assert.deepEqual(registry.members.map(({ source_path: sourcePath }) => sourcePath).sort(), [...source.keys()].sort());
  assert.ok(registry.members.every(({ path: retainedPath }) => retainedPath.startsWith("shell/phase14/")));
  const stage = path.join(root, "stage");
  const stagedRegistry = path.join(stage, "shell/phase14/artifact-registry.json");
  mkdirSync(path.dirname(stagedRegistry), { recursive: true }); writeFileSync(stagedRegistry, `${JSON.stringify(registry)}\n`);
  const publicationMembers = [...written.keys()]
    .filter((file) => file !== `artifacts/native/v1.2/${runId}/build.json`)
    .map((file) => ({ artifact: file.replace(`artifacts/native/v1.2/${runId}/`, "") }));
  assert.equal(validateV12AccessibilityPublicationMembers(publicationMembers, stage), true);
  assert.throws(() => validateV12AccessibilityPublicationMembers(publicationMembers.slice(1), stage), /publication_invalid/u);
  const linkedPath = "artifacts/native/phase14/components/linked-report.json";
  symlinkSync(path.join(root, extraPath), path.join(root, linkedPath));
  assert.throws(() => executeLiveV12AccessibilityShard({ runId, root, manifest,
    phase14Manifest: phase14.phase14Manifest, phase14Evidence: phase14.evidence,
    phase14ValidationOptions: { root, validatePhase14Evidence: (_evidence, _phase14Manifest, _ids, options) => options.readArtifact(linkedPath) },
    observe: () => observations, write: () => {} }), /symlink_forbidden/u);
  rmSync(path.join(root, "artifacts/native/phase14"), { recursive: true, force: true });
  assert.equal(verifyV12AccessibilityShard({ runId,
    readJson: (file) => written.get(file),
    readArtifact: (file) => {
      const value = written.get(`artifacts/native/v1.2/${runId}/${file}`);
      return Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value)}\n`);
    },
    phase14ValidationOptions: { root, validatePhase14Evidence } }), true);
});

test("shell requirement receipts are keyed, permutation-safe, and fail closed on missing or forged members", () => {
  const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
  const identity = qualityIdentity();
  const manifest = { run_id: runId, source: { tree_sha256: identity.source_tree_sha256 },
    configuration: { id: "AP-L-C390-P-F100" },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: identity.apk_sha256 } }, device: {
      installed_apk_sha256: identity.installed_apk_sha256,
      identity_sha256: identity.device_identity_sha256,
    } };
  manifest.source.head = "a".repeat(40);
  const phase14 = phase14ShellEvidenceFixture(manifest);
  const receipts = createV12ShellRequirementEvidence(phase14.evidence, phase14.phase14Manifest, manifest, SYNTHETIC_PHASE14_VALIDATION_OPTIONS);
  assert.equal(validateV12ShellRequirementEvidence([...receipts].reverse(), manifest), true);
  assert.equal(receipts.flatMap(({ postcondition_receipts: entries }) => entries)
    .some(({ evaluation }) => evaluation === "all-retained-native-cells-pass"), false);
  assert.throws(() => validateV12ShellRequirementEvidence(receipts.slice(1), manifest), /count_invalid/u);
  assert.throws(() => validateV12ShellRequirementEvidence([...receipts.slice(0, -1), receipts[0]], manifest), /identity_invalid/u);
  const forged = structuredClone(receipts); forged[0].apk_sha256 = "0".repeat(64);
  assert.throws(() => validateV12ShellRequirementEvidence(forged, manifest), /schema_invalid/u);
  const stale = structuredClone(receipts); stale[0].members[0].receipt_sha256 = "0".repeat(64);
  assert.throws(() => validateV12ShellRequirementEvidence(stale, manifest), /cell_receipt_invalid/u);
  const wrongAction = structuredClone(receipts); wrongAction[0].action_receipts[0].action_id = "generic-accessibility-pass";
  assert.throws(() => validateV12ShellRequirementEvidence(wrongAction, manifest), /schema_invalid|action_receipt_invalid/u);
  const wrongPostcondition = structuredClone(receipts); wrongPostcondition[0].postcondition_receipts[0].postcondition_id = "generic-geometry-pass";
  assert.throws(() => validateV12ShellRequirementEvidence(wrongPostcondition, manifest), /schema_invalid|postcondition_receipt_invalid/u);
  const missingActionEvidence = structuredClone(phase14.evidence); missingActionEvidence.evidence[0].matrix_cells[0].actions = [];
  missingActionEvidence.matrix_cells[0].actions = [];
  assert.throws(() => createV12ShellRequirementEvidence(missingActionEvidence, phase14.phase14Manifest, manifest, SYNTHETIC_PHASE14_VALIDATION_OPTIONS), /action_missing/u);
  const duplicateActionEvidence = structuredClone(phase14.evidence);
  duplicateActionEvidence.evidence[0].matrix_cells[0].actions.push(structuredClone(duplicateActionEvidence.evidence[0].matrix_cells[0].actions[0]));
  duplicateActionEvidence.matrix_cells[0].actions = duplicateActionEvidence.evidence[0].matrix_cells[0].actions;
  assert.throws(() => createV12ShellRequirementEvidence(duplicateActionEvidence, phase14.phase14Manifest, manifest, SYNTHETIC_PHASE14_VALIDATION_OPTIONS), /action_duplicate/u);
  const noopCheckpointForgery = structuredClone(phase14.evidence);
  const forgedShellCell = noopCheckpointForgery.evidence[0].matrix_cells[0];
  forgedShellCell.actions[0].input = "NOOP";
  forgedShellCell.actions[0].command = { keyCode: 0 };
  forgedShellCell.checkpoints = [{ id: "unrelated-checkpoint", verdict: "PASS" }];
  noopCheckpointForgery.matrix_cells[0] = forgedShellCell;
  assert.throws(() => createV12ShellRequirementEvidence(noopCheckpointForgery, phase14.phase14Manifest, manifest, SYNTHETIC_PHASE14_VALIDATION_OPTIONS), /action_invalid|postcondition_failed/u,
    "SHL-01 cannot close from a NOOP plus an unrelated passing checkpoint");
  const wrongIdentityEvidence = structuredClone(phase14.evidence); wrongIdentityEvidence.source_tree_sha256 = "0".repeat(64);
  assert.throws(() => createV12ShellRequirementEvidence(wrongIdentityEvidence, phase14.phase14Manifest, manifest, SYNTHETIC_PHASE14_VALIDATION_OPTIONS), /phase14_identity_invalid/u);
  assert.throws(() => createV12ShellRequirementEvidence(accessibilityEvidence(identity), phase14.phase14Manifest, manifest, SYNTHETIC_PHASE14_VALIDATION_OPTIONS), /phase14_/u,
    "generic accessibility PASS observations cannot mint SHL receipts");
  for (const requirement of ["SHL-01", "SHL-13"]) {
    const receipt = receipts.find((entry) => entry.requirement_id === requirement);
    assert.ok(receipt.action_receipts.every((entry) => entry.producer === "v12-shell-phase14-action-receipt/v1"));
    assert.ok(receipt.postcondition_receipts.every((entry) => entry.producer === "v12-shell-phase14-postcondition-receipt/v1"));
  }
  const backupForgery = structuredClone(receipts);
  const backupReceipt = backupForgery.find(({ requirement_id: id }) => id === "SHL-13");
  const backupPostcondition = backupReceipt.postcondition_receipts.find(({ postcondition_id: id }) => id === "cancel-does-not-write");
  backupPostcondition.evaluation_facts_sha256 = "f".repeat(64);
  const { receipt_sha256: _postconditionDigest, ...postconditionUnsigned } = backupPostcondition;
  backupPostcondition.receipt_sha256 = createHash("sha256").update(JSON.stringify(postconditionUnsigned)).digest("hex");
  const { receipt_sha256: _backupDigest, ...backupUnsigned } = backupReceipt;
  backupReceipt.receipt_sha256 = createHash("sha256").update(JSON.stringify(backupUnsigned)).digest("hex");
  assert.throws(() => validateV12ShellRequirementEvidence(backupForgery, manifest), /postcondition_receipt_invalid/u,
    "a recomputed backup/recovery PASS cannot replace the evaluated no-write facts");
});
