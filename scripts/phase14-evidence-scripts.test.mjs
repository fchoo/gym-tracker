import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

function storedArtifact(map, relativePath, bytes = Buffer.from(`artifact:${relativePath}\n`)) {
  map.set(relativePath, bytes);
  return Object.freeze({
    path: relativePath,
    sha256: sha256(bytes),
  });
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
  const artifacts = reportMapFor(ids);
  const cellsByCaseId = new Map(
    ids.map((id) => [id, selectedCells
      .filter((cell) => cell.caseId === id)
      .map((cell) => {
        const report = storedArtifact(
          artifacts,
          `artifacts/native/phase14/maestro/${cell.id}.xml`,
          passingReportXml(cell.id),
        );
        const screenshot = storedArtifact(
          artifacts,
          `artifacts/native/phase14/screenshots/${cell.id}.png`,
        );
        const semanticTree = storedArtifact(
          artifacts,
          `artifacts/native/phase14/semantic/${cell.id}.xml`,
        );
        const focusKeyTrace = storedArtifact(
          artifacts,
          `artifacts/native/phase14/traces/${cell.id}.json`,
        );
        const differenceOverlay = storedArtifact(
          artifacts,
          `artifacts/native/phase14/overlays/${cell.id}.json`,
        );
        return {
          ...matrixCellRecord(cell, report.sha256),
          screenshot: screenshot.path,
          screenshot_sha256: screenshot.sha256,
          semantic_tree: semanticTree.path,
          semantic_tree_sha256: semanticTree.sha256,
          focus_key_trace: focusKeyTrace.path,
          focus_key_trace_sha256: focusKeyTrace.sha256,
          difference_overlay: differenceOverlay.path,
          difference_overlay_sha256: differenceOverlay.sha256,
        };
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
        screenshot: matrixCells[0].screenshot,
        screenshot_sha256: matrixCells[0].screenshot_sha256,
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
    artifacts,
  };
}

function approveDev02(bundle) {
  bundle.evidence.dev02.status = "approved";
  bundle.evidence.dev02.native_blended_fill.report_sha256 =
    bundle.evidence.evidence.find(({ id }) => id === "shell.tokens").report_sha256;
  return bundle;
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
      { readArtifact: readArtifactFrom(pending.artifacts) },
    ),
    /phase14_dev02_pending/u,
  );
  const closed = approveDev02(validEvidence());
  assert.doesNotThrow(() => validatePhase14Evidence(
    closed.evidence,
    manifest,
    expectedIds,
    { readArtifact: readArtifactFrom(closed.artifacts) },
  ));
  assert.throws(
    () => validatePhase14Evidence(
      { ...closed.evidence, stages: [...closed.evidence.stages, closed.evidence.stages[0]] },
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(closed.artifacts) },
    ),
    /phase14_stages_invalid/u,
  );
  assert.throws(
    () => validatePhase14Evidence(
      { ...closed.evidence, evidence: closed.evidence.evidence.slice(1) },
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(closed.artifacts) },
    ),
    /phase14_evidence_mapping_invalid/u,
  );
  assert.throws(
    () => validatePhase14Evidence(
      { ...closed.evidence, matrix_cells: closed.evidence.matrix_cells.slice(1) },
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(closed.artifacts) },
    ),
    /phase14_matrix_cells_invalid/u,
  );

  const missingReport = approveDev02(validEvidence());
  missingReport.artifacts.delete(missingReport.evidence.evidence[0].report);
  assert.throws(
    () => validatePhase14Evidence(
      missingReport.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(missingReport.artifacts) },
    ),
    /phase14_report_missing/u,
  );

  const mutatedReport = approveDev02(validEvidence());
  mutatedReport.artifacts.set(
    mutatedReport.evidence.evidence[0].report,
    Buffer.from("mutated report"),
  );
  assert.throws(
    () => validatePhase14Evidence(
      mutatedReport.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(mutatedReport.artifacts) },
    ),
    /phase14_report_content_invalid|phase14_report_hash_invalid/u,
  );

  const failingReport = approveDev02(validEvidence());
  const failingBytes = failingReportXml();
  const failingSha = sha256(failingBytes);
  const firstRow = failingReport.evidence.evidence[0];
  firstRow.report_sha256 = failingSha;
  firstRow.matrix_cells[0].report_sha256 = failingSha;
  failingReport.evidence.stages[0].report_sha256 = failingSha;
  failingReport.artifacts.set(firstRow.report, failingBytes);
  assert.throws(
    () => validatePhase14Evidence(
      failingReport.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(failingReport.artifacts) },
    ),
    /phase14_report_content_invalid/u,
  );

  const pathEscape = approveDev02(validEvidence());
  pathEscape.evidence.evidence[0].report = "../missing.xml";
  pathEscape.evidence.stages[0].report = "../missing.xml";
  pathEscape.evidence.evidence[0].matrix_cells[0].report = "../missing.xml";
  assert.throws(
    () => validatePhase14Evidence(
      pathEscape.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(pathEscape.artifacts) },
    ),
    /phase14_report_path_invalid|phase14_stage_report_mismatch/u,
  );

  const sourceDigestMismatch = approveDev02(validEvidence());
  sourceDigestMismatch.evidence.evidence[0].source_state_sha256 = "9".repeat(64);
  assert.throws(
    () => validatePhase14Evidence(
      sourceDigestMismatch.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(sourceDigestMismatch.artifacts) },
    ),
    /phase14_evidence_mapping_invalid/u,
  );

  const stageHashMismatch = approveDev02(validEvidence());
  stageHashMismatch.evidence.stages[0].report_sha256 = "0".repeat(64);
  assert.throws(
    () => validatePhase14Evidence(
      stageHashMismatch.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(stageHashMismatch.artifacts) },
    ),
    /phase14_stage_report_mismatch/u,
  );

  const rowMatrixMismatch = approveDev02(validEvidence());
  rowMatrixMismatch.evidence.evidence[0].matrix_cells = [];
  rowMatrixMismatch.evidence.stages[0].matrix_cells = [];
  assert.throws(
    () => validatePhase14Evidence(
      rowMatrixMismatch.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(rowMatrixMismatch.artifacts) },
    ),
    /phase14_matrix_cells_invalid/u,
  );

  const missingSemanticTree = approveDev02(validEvidence());
  missingSemanticTree.artifacts.delete(
    missingSemanticTree.evidence.evidence[0].matrix_cells[0].semantic_tree,
  );
  assert.throws(
    () => validatePhase14Evidence(
      missingSemanticTree.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(missingSemanticTree.artifacts) },
    ),
    /phase14_semantic_tree_missing/u,
  );

  const forgedSemanticTree = approveDev02(validEvidence());
  forgedSemanticTree.artifacts.set(
    forgedSemanticTree.evidence.evidence[0].matrix_cells[0].semantic_tree,
    Buffer.from("forged semantic tree"),
  );
  assert.throws(
    () => validatePhase14Evidence(
      forgedSemanticTree.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(forgedSemanticTree.artifacts) },
    ),
    /phase14_semantic_tree_hash_invalid/u,
  );

  const missingFocusTrace = approveDev02(validEvidence());
  missingFocusTrace.artifacts.delete(
    missingFocusTrace.evidence.evidence[0].matrix_cells[0].focus_key_trace,
  );
  assert.throws(
    () => validatePhase14Evidence(
      missingFocusTrace.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(missingFocusTrace.artifacts) },
    ),
    /phase14_focus_trace_missing/u,
  );

  const forgedFocusTrace = approveDev02(validEvidence());
  forgedFocusTrace.artifacts.set(
    forgedFocusTrace.evidence.evidence[0].matrix_cells[0].focus_key_trace,
    Buffer.from("{\"forged\":true}\n"),
  );
  assert.throws(
    () => validatePhase14Evidence(
      forgedFocusTrace.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(forgedFocusTrace.artifacts) },
    ),
    /phase14_focus_trace_hash_invalid/u,
  );

  const missingOverlay = approveDev02(validEvidence());
  missingOverlay.artifacts.delete(
    missingOverlay.evidence.evidence[0].matrix_cells[0].difference_overlay,
  );
  assert.throws(
    () => validatePhase14Evidence(
      missingOverlay.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(missingOverlay.artifacts) },
    ),
    /phase14_overlay_missing/u,
  );

  const forgedOverlay = approveDev02(validEvidence());
  forgedOverlay.artifacts.set(
    forgedOverlay.evidence.evidence[0].matrix_cells[0].difference_overlay,
    Buffer.from("{\"forged\":true}\n"),
  );
  assert.throws(
    () => validatePhase14Evidence(
      forgedOverlay.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(forgedOverlay.artifacts) },
    ),
    /phase14_overlay_hash_invalid/u,
  );

  const semanticPathEscape = approveDev02(validEvidence());
  semanticPathEscape.evidence.evidence[0].matrix_cells[0].semantic_tree = "../missing.xml";
  assert.throws(
    () => validatePhase14Evidence(
      semanticPathEscape.evidence,
      manifest,
      expectedIds,
      { readArtifact: readArtifactFrom(semanticPathEscape.artifacts) },
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

test("Phase 14 binds every screenshot byte in both row and matrix-cell evidence", () => {
  const screenshotIds = ["shell.four-roots", "shell.tokens"];
  const rowScreenshotMissing = approveDev02(validEvidence(screenshotIds));
  const firstRow = rowScreenshotMissing.evidence.evidence[0];
  rowScreenshotMissing.artifacts.delete(firstRow.screenshot);
  assert.throws(
    () => validatePhase14Evidence(
      rowScreenshotMissing.evidence,
      manifest,
      screenshotIds,
      { readArtifact: readArtifactFrom(rowScreenshotMissing.artifacts) },
    ),
    /phase14_screenshot_stale/u,
  );

  const matrixScreenshotMissing = approveDev02(validEvidence(screenshotIds));
  const matrixCells = matrixScreenshotMissing.evidence.evidence[0].matrix_cells;
  const secondCell = matrixCells[1];
  matrixScreenshotMissing.artifacts.delete(secondCell.screenshot);
  assert.throws(
    () => validatePhase14Evidence(
      matrixScreenshotMissing.evidence,
      manifest,
      screenshotIds,
      { readArtifact: readArtifactFrom(matrixScreenshotMissing.artifacts) },
    ),
    /phase14_screenshot_stale/u,
  );

  const matrixScreenshotForged = approveDev02(validEvidence(screenshotIds));
  const forgedCell = matrixScreenshotForged.evidence.evidence[0].matrix_cells[1];
  matrixScreenshotForged.artifacts.set(
    forgedCell.screenshot,
    Buffer.from("forged screenshot bytes"),
  );
  assert.throws(
    () => validatePhase14Evidence(
      matrixScreenshotForged.evidence,
      manifest,
      screenshotIds,
      { readArtifact: readArtifactFrom(matrixScreenshotForged.artifacts) },
    ),
    /phase14_screenshot_stale/u,
  );
});

test("Phase 14 package commands stay bound to the shell evidence owners", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(
    packageJson.scripts["test:evidence:v12:shell"],
    "node --test scripts/phase14-evidence-scripts.test.mjs",
  );
  assert.equal(
    packageJson.scripts["verify:phase14:evidence"],
    "node scripts/verify-phase14-evidence.mjs",
  );
  assert.equal(
    packageJson.scripts["test:maestro:phase14"],
    "node scripts/run-phase14-maestro.mjs",
  );
  assert.match(
    packageJson.scripts["test:evidence:phase14"],
    /scripts\/phase14-evidence-scripts\.test\.mjs/u,
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
