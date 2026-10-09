import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  PHASE14_SHELL_CASE_IDS,
  PHASE14_SHELL_EVIDENCE_CASES,
} from "../src/testing/contracts/phase14Shell.contract.ts";
import {
  PHASE14_NATIVE_MATRIX,
  phase14MatrixCellsForIds,
} from "./phase14-native-matrix.mjs";
import {
  validateDistinctPhase14Flows,
  validatePhase14Manifest,
} from "./run-phase14-maestro.mjs";
import {
  parsePhase14VerifierArgs,
  stableDeviceIdentitySha256,
  validatePhase14CurrentArtifacts,
  validatePhase14Dev02,
  validatePhase14Evidence,
  validatePhase14Privacy,
  validatePhase14SourceInventory,
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
  build_variant: "release",
  package: "com.fchoo.gymtracker.devtest",
  js_bundle: { embedded: true },
  base_head: "a".repeat(40),
  source_tree_sha256: "b".repeat(64),
  apk: {
    path: "artifacts/native/phase14/gym-tracker-phase14-devtest.apk",
    sha256: "d".repeat(64),
    size_bytes: 123,
    page_alignment_kib: 16,
    page_alignment_verified: true,
  },
  installed_apk: {
    device_path: "/data/app/base.apk",
    sha256: "d".repeat(64),
    matches_retained_apk: true,
  },
  device: {
    serial: "emulator-5554",
    api: 36,
    abi: "arm64-v8a",
    model: "sdk_gphone64_arm64",
    android_release: "16",
    identity_sha256: "c".repeat(64),
  },
});

function passingReportXml(label = "Phase 14 shell proof") {
  return Buffer.from(
    `<?xml version='1.0' encoding='UTF-8'?>
<testsuites>
  <testsuite name="Test Suite" tests="1" failures="0" errors="0" skipped="0">
    <testcase name="${label}" classname="${label}" />
  </testsuite>
</testsuites>
`,
  );
}

function failingReportXml(label = "Phase 14 shell proof") {
  return Buffer.from(
    `<?xml version='1.0' encoding='UTF-8'?>
<testsuites>
  <testsuite name="Test Suite" tests="1" failures="1" errors="0" skipped="0">
    <testcase name="${label}" classname="${label}">
      <failure message="failed" />
    </testcase>
  </testsuite>
</testsuites>
`,
  );
}

function matrixCellRecord(expectedCell, reportSha256) {
  return {
    id: expectedCell.id,
    case_id: expectedCell.caseId,
    stage: expectedCell.stage,
    theme: expectedCell.theme,
    viewport: expectedCell.viewport,
    orientation: expectedCell.orientation,
    font_scale: expectedCell.fontScale,
    reduced_motion: expectedCell.reducedMotion,
    live_os_switch: expectedCell.liveOsSwitch,
    expected_inputs: expectedCell.expectedInputs,
    report: `artifacts/native/phase14/maestro/${expectedCell.id}.xml`,
    report_sha256: reportSha256,
    screenshot: `artifacts/native/phase14/screenshots/${expectedCell.id}.png`,
    screenshot_sha256: "f".repeat(64),
    semantic_tree: `artifacts/native/phase14/semantic/${expectedCell.id}.xml`,
    semantic_tree_sha256: "1".repeat(64),
    focus_key_trace: `artifacts/native/phase14/traces/${expectedCell.id}.json`,
    focus_key_trace_sha256: "2".repeat(64),
    target_window_bounds: {
      requested_viewport: expectedCell.viewport,
      requested_orientation: expectedCell.orientation,
      requested_font_scale: expectedCell.fontScale,
      wm_size: `Physical size: ${expectedCell.viewport.width}x${expectedCell.viewport.height}`,
      wm_density: "Physical density: 160",
      font_scale: String(expectedCell.fontScale),
      night_mode: expectedCell.theme === "system-on-dark" ? "yes" : "no",
    },
    difference_overlay: `artifacts/native/phase14/overlays/${expectedCell.id}.json`,
    difference_overlay_sha256: "3".repeat(64),
    source_state_sha256: manifest.source_tree_sha256,
  };
}

function reportMapFor(ids = expectedIds) {
  const selectedCells = phase14MatrixCellsForIds(ids);
  const map = new Map();
  for (const cell of selectedCells) {
    map.set(
      `artifacts/native/phase14/maestro/${cell.id}.xml`,
      passingReportXml(cell.id),
    );
  }
  return map;
}

function readArtifactFrom(map) {
  return (relativePath) => {
    const bytes = map.get(relativePath);
    if (bytes === undefined) {
      throw new Error(`missing:${relativePath}`);
    }
    return bytes;
  };
}

function validEvidence(ids = expectedIds) {
  const selectedCases = PHASE14_SHELL_EVIDENCE_CASES.filter(({ id }) => ids.includes(id));
  const selectedCells = phase14MatrixCellsForIds(ids);
  const reports = reportMapFor(ids);
  const cellsByCaseId = new Map(
    ids.map((id) => [id, selectedCells
      .filter((cell) => cell.caseId === id)
      .map((cell) => {
        const report = reports.get(`artifacts/native/phase14/maestro/${cell.id}.xml`);
        return matrixCellRecord(cell, sha256(report));
      })]),
  );

  const evidence = {
    schema_version: 1,
    suite: "phase14",
    status: "passed",
    build_manifest: "artifacts/native/phase14/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    profile: manifest.profile,
    device_identity_sha256: manifest.device.identity_sha256,
    apk: {
      ...manifest.apk,
      installed_sha256: manifest.apk.sha256,
      matches_retained_apk: true,
    },
    matrix: PHASE14_NATIVE_MATRIX,
    stages: selectedCases.map(({ id, stage }) => {
      const matrixCells = cellsByCaseId.get(id);
      return {
        stage,
        status: "passed",
        report: matrixCells[0].report,
        report_sha256: matrixCells[0].report_sha256,
        matrix_cells: matrixCells,
      };
    }),
    evidence: selectedCases.map(({ id, requirement, evidencePath }) => {
      const matrixCells = cellsByCaseId.get(id);
      return {
        id,
        status: "passed",
        requirement,
        path: evidencePath,
        report: matrixCells[0].report,
        report_sha256: matrixCells[0].report_sha256,
        screenshot: `artifacts/native/phase14/screenshots/${id}.png`,
        screenshot_sha256: "f".repeat(64),
        component_verdict: "passed",
        native_verdict: "passed",
        source_state_sha256: manifest.source_tree_sha256,
        matrix_cells: matrixCells,
      };
    }),
    matrix_cells: selectedCases.flatMap(({ id }) => cellsByCaseId.get(id)),
    dev02: {
      owner_record: "accessible-9b470b",
      status: "evidence-pending",
      title_hex: "#9B470B",
      sport_hex: "#D97820",
      native_blended_fill: {
        status: "passed",
        report_sha256: "e".repeat(64),
      },
    },
  };

  return {
    evidence,
    reports,
  };
}

test("Phase 14 ledger owns every exact shell ID once with one requirement, stage, and canonical evidence path", () => {
  assert.deepEqual(PHASE14_SHELL_CASE_IDS, expectedIds);
  assert.equal(PHASE14_SHELL_EVIDENCE_CASES.length, expectedIds.length);
  assert.deepEqual(PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id), expectedIds);
  for (const entry of PHASE14_SHELL_EVIDENCE_CASES) {
    assert.match(entry.requirement, /^SHL-(?:0[1-9]|1[0-3])$/u);
    assert.match(entry.stage, /^phase14-[a-z0-9-]+$/u);
    assert.equal(
      entry.evidencePath,
      `.planning/phases/14-prototype-visual-shell/evidence/${entry.id}.json`,
    );
  }
  assert.doesNotThrow(() => validateDistinctPhase14Flows({
    shell: PHASE14_SHELL_CASE_IDS
      .map((id) => `PHASE14_STAGE == '${PHASE14_SHELL_EVIDENCE_CASES.find((entry) => entry.id === id).stage}'`)
      .join("\n"),
  }));
});

test("Phase 14 rejects stale source/APK/package/profile/device identity and invalid native stages", () => {
  assert.equal(
    stableDeviceIdentitySha256(["fingerprint", "abi", "model", "36", "16"]),
    stableDeviceIdentitySha256(["fingerprint", "abi", "model", "36", "16"]),
  );
  assert.notEqual(
    stableDeviceIdentitySha256(["fingerprint", "abi", "model", "36", "16"]),
    stableDeviceIdentitySha256(["fingerprint", "abi", "model", "35", "16"]),
  );
  assert.doesNotThrow(() =>
    validatePhase14Manifest(manifest, manifest.base_head, manifest.source_tree_sha256));
  assert.throws(
    () => validatePhase14Manifest(
      { ...manifest, package: "com.fchoo.gymtracker" },
      manifest.base_head,
      manifest.source_tree_sha256,
    ),
    /phase14_manifest_invalid/u,
  );
  assert.throws(
    () => validatePhase14Manifest(manifest, "f".repeat(40), manifest.source_tree_sha256),
    /phase14_manifest_stale/u,
  );

  const bytes = Buffer.from("phase14-apk");
  const current = {
    ...manifest,
    apk: { ...manifest.apk, sha256: sha256(bytes) },
    installed_apk: { ...manifest.installed_apk, sha256: sha256(bytes) },
  };
  assert.doesNotThrow(() =>
    validatePhase14CurrentArtifacts({
      manifest: current,
      currentHead: current.base_head,
      currentSourceTreeSha256: current.source_tree_sha256,
      apkBytes: bytes,
      installedApkSha256: current.apk.sha256,
      deviceIdentitySha256: current.device.identity_sha256,
    }));
  assert.throws(
    () => validatePhase14CurrentArtifacts({
      manifest: current,
      currentHead: current.base_head,
      currentSourceTreeSha256: current.source_tree_sha256,
      apkBytes: bytes,
      installedApkSha256: "0".repeat(64),
      deviceIdentitySha256: current.device.identity_sha256,
    }),
    /phase14_installed_apk_stale/u,
  );

  const pending = validEvidence();
  assert.throws(
    () => validatePhase14Evidence(
      pending.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(pending.reports) },
    ),
    /phase14_dev02_pending/u,
  );
  const closed = validEvidence();
  closed.evidence.dev02.status = "approved";
  closed.evidence.dev02.native_blended_fill.report_sha256 =
    closed.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  assert.doesNotThrow(() => validatePhase14Evidence(
    closed.evidence,
    manifest,
    expectedIds,
    { readArtifact: readArtifactFrom(closed.reports) },
  ));
  assert.throws(
    () => validatePhase14Evidence(
      { ...closed.evidence, stages: [...closed.evidence.stages, closed.evidence.stages[0]] },
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(closed.reports) },
    ),
    /phase14_stages_invalid/u,
  );
  assert.throws(
    () => validatePhase14Evidence(
      { ...closed.evidence, evidence: closed.evidence.evidence.slice(1) },
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(closed.reports) },
    ),
    /phase14_evidence_mapping_invalid/u,
  );
  assert.throws(
    () => validatePhase14Evidence(
      { ...closed.evidence, matrix_cells: closed.evidence.matrix_cells.slice(1) },
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(closed.reports) },
    ),
    /phase14_matrix_cells_invalid/u,
  );

  const missingReport = validEvidence();
  missingReport.evidence.dev02.status = "approved";
  missingReport.evidence.dev02.native_blended_fill.report_sha256 =
    missingReport.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  missingReport.reports.delete(missingReport.evidence.evidence[0].report);
  assert.throws(
    () => validatePhase14Evidence(
      missingReport.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(missingReport.reports) },
    ),
    /phase14_report_missing/u,
  );

  const mutatedReport = validEvidence();
  mutatedReport.evidence.dev02.status = "approved";
  mutatedReport.evidence.dev02.native_blended_fill.report_sha256 =
    mutatedReport.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  mutatedReport.reports.set(
    mutatedReport.evidence.evidence[0].report,
    Buffer.from("mutated report"),
  );
  assert.throws(
    () => validatePhase14Evidence(
      mutatedReport.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(mutatedReport.reports) },
    ),
    /phase14_report_content_invalid|phase14_report_hash_invalid/u,
  );

  const failingReport = validEvidence();
  failingReport.evidence.dev02.status = "approved";
  failingReport.evidence.dev02.native_blended_fill.report_sha256 =
    failingReport.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  const failingBytes = failingReportXml();
  const failingSha = sha256(failingBytes);
  const firstRow = failingReport.evidence.evidence[0];
  firstRow.report_sha256 = failingSha;
  firstRow.matrix_cells[0].report_sha256 = failingSha;
  failingReport.evidence.stages[0].report_sha256 = failingSha;
  failingReport.reports.set(firstRow.report, failingBytes);
  assert.throws(
    () => validatePhase14Evidence(
      failingReport.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(failingReport.reports) },
    ),
    /phase14_report_content_invalid/u,
  );

  const pathEscape = validEvidence();
  pathEscape.evidence.dev02.status = "approved";
  pathEscape.evidence.dev02.native_blended_fill.report_sha256 =
    pathEscape.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  pathEscape.evidence.evidence[0].report = "../missing.xml";
  pathEscape.evidence.stages[0].report = "../missing.xml";
  pathEscape.evidence.evidence[0].matrix_cells[0].report = "../missing.xml";
  assert.throws(
    () => validatePhase14Evidence(
      pathEscape.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(pathEscape.reports) },
    ),
    /phase14_report_path_invalid|phase14_stage_report_mismatch/u,
  );

  const sourceDigestMismatch = validEvidence();
  sourceDigestMismatch.evidence.dev02.status = "approved";
  sourceDigestMismatch.evidence.dev02.native_blended_fill.report_sha256 =
    sourceDigestMismatch.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  sourceDigestMismatch.evidence.evidence[0].source_state_sha256 = "9".repeat(64);
  assert.throws(
    () => validatePhase14Evidence(
      sourceDigestMismatch.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(sourceDigestMismatch.reports) },
    ),
    /phase14_evidence_mapping_invalid/u,
  );

  const stageHashMismatch = validEvidence();
  stageHashMismatch.evidence.dev02.status = "approved";
  stageHashMismatch.evidence.dev02.native_blended_fill.report_sha256 =
    stageHashMismatch.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  stageHashMismatch.evidence.stages[0].report_sha256 = "0".repeat(64);
  assert.throws(
    () => validatePhase14Evidence(
      stageHashMismatch.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(stageHashMismatch.reports) },
    ),
    /phase14_stage_report_mismatch/u,
  );

  const rowMatrixMismatch = validEvidence();
  rowMatrixMismatch.evidence.dev02.status = "approved";
  rowMatrixMismatch.evidence.dev02.native_blended_fill.report_sha256 =
    rowMatrixMismatch.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  rowMatrixMismatch.evidence.evidence[0].matrix_cells = [];
  rowMatrixMismatch.evidence.stages[0].matrix_cells = [];
  assert.throws(
    () => validatePhase14Evidence(
      rowMatrixMismatch.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(rowMatrixMismatch.reports) },
    ),
    /phase14_matrix_cells_invalid/u,
  );
});

test("Phase 14 rejects privacy hazards, legacy modal owners, and a DEV-02 closure without approved native blended-fill proof", () => {
  for (const unsafe of [
    { output_path: "/Users/example/archive.zip" },
    { sql: "SELECT * FROM workouts" },
    { accessToken: "secret" },
    { password: "secret" },
    { account_identifier: "person@example.com" },
    { archive_bytes: "deadbeef" },
  ]) {
    assert.throws(() => validatePhase14Privacy(unsafe), /phase14_privacy_invalid/u);
  }
  assert.doesNotThrow(() =>
    validatePhase14Privacy({ fixture: "deterministic", source_digest: "a".repeat(64) }));
  assert.doesNotThrow(() => validatePhase14SourceInventory({
    confirmationSheet: "return <BottomSheet />;",
    appearanceSheet: "return <BottomSheet />;",
    consumers: [{
      file: "src/ui/components/BottomSheet.tsx",
      source: "<Modal />",
      exception: "shared-frame",
    }],
  }));
  assert.throws(
    () => validatePhase14SourceInventory({
      confirmationSheet: "return <Modal />;",
      appearanceSheet: "return <BottomSheet />;",
      consumers: [],
    }),
    /phase14_sheet_delegation_invalid/u,
  );
  assert.throws(
    () => validatePhase14SourceInventory({
      confirmationSheet: "return <BottomSheet />;",
      appearanceSheet: "return <BottomSheet />;",
      consumers: [{ file: "src/ui/screens/LibraryScreen.tsx", source: "<Modal />" }],
    }),
    /phase14_legacy_modal_owner/u,
  );
  assert.doesNotThrow(() => validatePhase14Dev02({
    owner_record: "accessible-9b470b",
    status: "approved",
    title_hex: "#9B470B",
    sport_hex: "#D97820",
    native_blended_fill: { status: "passed", report_sha256: "a".repeat(64) },
  }));
  assert.throws(
    () => validatePhase14Dev02({
      owner_record: "accessible-9b470b",
      status: "approved",
      title_hex: "#9B470B",
      sport_hex: "#D97820",
      native_blended_fill: { status: "pending" },
    }),
    /phase14_dev02_native_evidence_invalid/u,
  );
});

test("Phase 14 runner and verifier accept exact canonical subsets and reject ambiguous selection", () => {
  assert.deepEqual(
    parsePhase14RunnerArgs([
      "--manifest",
      "artifacts/native/phase14/build.json",
      "--ids",
      "shell.four-roots,shell.tokens",
    ]),
    { manifest: "artifacts/native/phase14/build.json", ids: ["shell.four-roots", "shell.tokens"] },
  );
  assert.throws(
    () => parsePhase14RunnerArgs([
      "--manifest",
      "artifacts/native/phase14/build.json",
      "--ids",
      "shell.tokens,shell.tokens",
    ]),
    /phase14_runner_arguments_invalid/u,
  );
  assert.deepEqual(
    parsePhase14VerifierArgs([
      "--manifest",
      "artifacts/native/phase14/build.json",
      "--ids",
      "shell.four-roots,shell.tokens",
    ]),
    {
      manifest: "artifacts/native/phase14/build.json",
      all: false,
      ids: ["shell.four-roots", "shell.tokens"],
    },
  );
  assert.throws(
    () => parsePhase14VerifierArgs([
      "--manifest",
      "artifacts/native/phase14/build.json",
      "--all",
      "--ids",
      "shell.tokens",
    ]),
    /phase14_verifier_arguments_invalid/u,
  );
});
