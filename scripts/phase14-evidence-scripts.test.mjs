import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PNG } from "pngjs";

// Keep the package-owned Phase 14 evidence command exhaustive without editing
// shared package metadata while other workers are active in the worktree.
import "./phase14-truthful-evidence.test.mjs";

import { PHASE14_SHELL_CASE_IDS, PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";
import { ingestPhase14JestReport } from "./phase14-evidence-observation.mjs";
import { PHASE14_NATIVE_MATRIX, phase14MatrixCellsForIds } from "./phase14-native-matrix.mjs";
import {
  parsePhase14RunnerArgs,
  resolvePhase14DeviceSerial,
  validateDistinctPhase14Flows,
  validatePhase14Manifest,
  validatePhase14ReplayableManifest,
} from "./run-phase14-maestro.mjs";
import {
  parsePhase14VerifierArgs,
  stableDeviceIdentitySha256,
  validatePhase14CurrentArtifacts,
  validatePhase14Evidence,
  validatePhase14Privacy,
  validatePhase14SourceInventory,
} from "./verify-phase14-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const selectedId = "shell.root-state";
const selectedContract = PHASE14_SHELL_EVIDENCE_CASES.find(({ id }) => id === selectedId);
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
  installed_apk: { sha256: "d".repeat(64), matches_retained_apk: true },
  device: { api: 36, abi: "arm64-v8a", model: "sdk_gphone64_arm64", android_release: "16", identity_sha256: "c".repeat(64) },
});

function reportXml(label) {
  return Buffer.from(`<?xml version="1.0"?><testsuites><testsuite name="${label}" tests="1" failures="0" errors="0" skipped="0"><testcase name="${label}" /></testsuite></testsuites>\n`);
}

function png() {
  const image = new PNG({ width: 1, height: 1 });
  image.data.set([1, 2, 3, 255]);
  return PNG.sync.write(image);
}

function put(artifacts, artifactPath, bytes) {
  artifacts.set(artifactPath, bytes);
  return { path: artifactPath, sha256: sha256(bytes) };
}

function expectedTheme(cell, selectionReport = undefined) {
  const osScheme = cell.liveOsSwitch ? (cell.systemNightAfter ? "dark" : "light") : cell.osScheme;
  return {
    selected_option: cell.appearanceSelection,
    selection_observed_via: "maestro-tap-and-assert",
    ...(selectionReport === undefined ? {} : {
      selection_report: selectionReport.path,
      selection_report_sha256: selectionReport.sha256,
    }),
    os_scheme: osScheme,
    rendered_theme: cell.expectedRenderedThemeAfterSwitch ?? (cell.appearanceSelection === "System" ? osScheme : cell.renderedTheme),
    expected_rendered_theme: cell.expectedRenderedThemeAfterSwitch ?? (cell.appearanceSelection === "System" ? osScheme : cell.renderedTheme),
    verdict: "PASS",
  };
}

function validBundle() {
  const artifacts = new Map();
  const expectedCells = phase14MatrixCellsForIds([selectedId]);
  const matrixCells = expectedCells.map((expectedCell, cellIndex) => {
    const report = put(artifacts, `artifacts/native/phase14/maestro/${expectedCell.id}.xml`, reportXml(expectedCell.id));
    const screenshot = put(artifacts, `artifacts/native/phase14/screenshots/${expectedCell.id}.png`, png());
    const semantic = put(artifacts, `artifacts/native/phase14/semantic/${expectedCell.id}.xml`, Buffer.from(`<hierarchy cell="${cellIndex}"/>\n`));
    const themeSelection = put(
      artifacts,
      `artifacts/native/phase14/maestro/${expectedCell.id}-theme-selection.xml`,
      reportXml(`${expectedCell.id}:theme-selection`),
    );
    const observations = expectedCell.actions.map((action, actionIndex) => {
      const preparation = put(
        artifacts,
        `artifacts/native/phase14/maestro/${expectedCell.id}-action-${actionIndex}-${action.id}.xml`,
        reportXml(`${expectedCell.id}:${action.id}`),
      );
      const pre = put(
        artifacts,
        `artifacts/native/phase14/traces/${expectedCell.id}-${actionIndex}-pre.xml`,
        Buffer.from(`<hierarchy><node focused="true" text="Before ${actionIndex}" /></hierarchy>\n`),
      );
      const post = put(
        artifacts,
        `artifacts/native/phase14/traces/${expectedCell.id}-${actionIndex}-post.xml`,
        Buffer.from(`<hierarchy><node focused="true" text="After ${actionIndex}" /></hierarchy>\n`),
      );
      return {
        order: actionIndex,
        action_id: action.id,
        input: action.input,
        transport: action.transport,
        command: action.transport === "adb-keyevent" ? { key_code: action.command.keyCode } : { normalized_target: "outside-sheet", x_dp: 195, y_dp: 135 },
        preparation_report: preparation.path,
        preparation_report_sha256: preparation.sha256,
        started_at: `2026-10-10T01:00:00.${String(actionIndex * 2).padStart(3, "0")}Z`,
        finished_at: `2026-10-10T01:00:00.${String(actionIndex * 2 + 1).padStart(3, "0")}Z`,
        pre: { semantic_tree: pre.path, semantic_tree_sha256: pre.sha256, focused_node: `Before ${actionIndex}` },
        post: { semantic_tree: post.path, semantic_tree_sha256: post.sha256, focused_node: `After ${actionIndex}` },
        postcondition: { id: action.postcondition.id, kind: action.postcondition.kind, observed: true, verdict: "PASS" },
      };
    });
    const trace = {
      schema_version: 2,
      producer: "phase14-adb-observer/v1",
      synthetic: false,
      cell_id: expectedCell.id,
      stage: expectedCell.stage,
      observations,
    };
    const traceArtifact = put(
      artifacts,
      `artifacts/native/phase14/traces/${expectedCell.id}.json`,
      Buffer.from(`${JSON.stringify(trace, null, 2)}\n`),
    );
    const digest = {
      schema_version: 1,
      producer: "phase14-run-as-runtime-digest/v1",
      authority: "installed-app-sqlite-files",
      digest_sha256: "e".repeat(64),
      file_count: 3,
      byte_count: 4096,
      contains_raw_rows: false,
    };
    const pair = { pre: digest, post: digest };
    const runtimeArtifact = put(
      artifacts,
      `artifacts/native/phase14/runtime-state/${expectedCell.id}.json`,
      Buffer.from(`${JSON.stringify(pair, null, 2)}\n`),
    );
    const checkpoints = expectedCell.checkpoints.map(({ id }) => ({
      id,
      observed_via: "passing-maestro-assertion",
      report_sha256: report.sha256,
      verdict: "PASS",
    }));
    return {
      id: expectedCell.id,
      configuration_id: expectedCell.configurationId,
      variant: expectedCell.variant,
      case_id: expectedCell.caseId,
      stage: expectedCell.stage,
      state: expectedCell.state,
      appearance: expectedCell.appearance,
      appearance_selection: expectedCell.appearanceSelection,
      rendered_theme: expectedCell.renderedTheme,
      os_scheme: expectedCell.osScheme,
      viewport: expectedCell.viewport,
      orientation: expectedCell.orientation,
      font_scale: expectedCell.fontScale,
      reduced_motion: expectedCell.reducedMotion,
      live_os_switch: expectedCell.liveOsSwitch,
      report: report.path,
      report_sha256: report.sha256,
      maestro: { tests: 1, failures: 0, errors: 0, skipped: 0, verdict: "PASS" },
      screenshot: screenshot.path,
      screenshot_sha256: screenshot.sha256,
      semantic_tree: semantic.path,
      semantic_tree_sha256: semantic.sha256,
      focus_key_trace: traceArtifact.path,
      focus_key_trace_sha256: traceArtifact.sha256,
      actions: observations,
      checkpoints,
      target_window_bounds: {
        requested_viewport: expectedCell.viewport,
        requested_orientation: expectedCell.orientation,
        requested_font_scale: expectedCell.fontScale,
        requested_appearance: expectedCell.appearance,
        wm_size: `${expectedCell.viewport.width}x${expectedCell.viewport.height}`,
        wm_density: "160",
        font_scale: String(expectedCell.fontScale),
        os_scheme: expectedTheme(expectedCell).os_scheme,
      },
      runtime_state: { verdict: "PASS", ...runtimeArtifact, ...pair },
      theme_observation: expectedTheme(expectedCell, themeSelection),
      visual_comparison: {
        verdict: "N_A_REVIEWED",
        rationale: expectedCell.referencePolicy.rationale,
        reference_policy: "native-only",
      },
      native_verdict: "PASS",
    };
  });

  const jestReport = {
    success: true,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: [{
      name: `/repo/${selectedContract.componentTests[0]}`,
      status: "passed",
      assertionResults: [{ fullName: "Phase 14 root state", status: "passed" }],
    }],
  };
  const componentReport = put(
    artifacts,
    "artifacts/native/phase14/components/jest.json",
    Buffer.from(`${JSON.stringify(jestReport, null, 2)}\n`),
  );
  const componentIngested = ingestPhase14JestReport(jestReport, [selectedContract]);
  const componentEvidence = { ...componentIngested, report: componentReport.path, report_sha256: componentReport.sha256 };
  const row = {
    id: selectedId,
    requirement: selectedContract.requirement,
    path: selectedContract.evidencePath,
    component_evidence: componentIngested.cases[0],
    component_verdict: "PASS",
    native_verdict: "PASS",
    visual_verdict: "PASS",
    verdict: "PASS",
    matrix_cells: matrixCells,
  };
  return {
    artifacts,
    evidence: {
      schema_version: 2,
      producer: "phase14-native-observation/v2",
      suite: "phase14",
      verdict: "PASS",
      build_manifest: "artifacts/native/phase14/build.json",
      base_head: manifest.base_head,
      source_tree_sha256: manifest.source_tree_sha256,
      package: manifest.package,
      profile: manifest.profile,
      device_identity_sha256: manifest.device.identity_sha256,
      apk: { ...manifest.apk, installed_sha256: manifest.apk.sha256, matches_retained_apk: true },
      matrix: PHASE14_NATIVE_MATRIX,
      component_evidence: componentEvidence,
      evidence: [row],
      matrix_cells: matrixCells,
    },
  };
}

function reader(artifacts) {
  return (artifactPath) => {
    const bytes = artifacts.get(artifactPath);
    if (bytes === undefined) throw new Error(`missing:${artifactPath}`);
    return bytes;
  };
}

function rebindJsonArtifact(bundle, artifactPath, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  bundle.artifacts.set(artifactPath, bytes);
  return sha256(bytes);
}

test("Phase 14 ledger maps every exact shell ID to explicit state, actions, checkpoints, postconditions, components, and reference policy", () => {
  assert.equal(PHASE14_SHELL_CASE_IDS.length, 13);
  assert.equal(new Set(PHASE14_SHELL_CASE_IDS).size, 13);
  for (const entry of PHASE14_SHELL_EVIDENCE_CASES) {
    assert.match(entry.requirement, /^SHL-(?:0[1-9]|1[0-3])$/u);
    assert.ok(entry.actions.length > 0);
    assert.ok(entry.checkpoints.length > 0);
    assert.ok(entry.postconditions.length > 0);
    assert.ok(entry.componentTests.length > 0);
    assert.ok(["revision18-png", "native-only"].includes(entry.referencePolicy.kind));
  }
  assert.doesNotThrow(() => validateDistinctPhase14Flows({
    shell: `${PHASE14_SHELL_EVIDENCE_CASES.map(({ stage }) => `PHASE14_STAGE == '${stage}'`).join("\n")}\nselect-theme.yaml`,
  }));
});

test("Phase 14 validates manifest, current APK/device identity, and unambiguous CLI selection", () => {
  assert.doesNotThrow(() => validatePhase14Manifest(manifest, manifest.base_head, manifest.source_tree_sha256));
  assert.throws(() => validatePhase14Manifest({ ...manifest, package: "wrong" }, manifest.base_head, manifest.source_tree_sha256), /phase14_manifest_invalid/u);
  assert.throws(() => validatePhase14ReplayableManifest(manifest, "0".repeat(64)), /phase14_manifest_stale/u);
  assert.equal(resolvePhase14DeviceSerial({ GYM_TRACKER_ANDROID_SERIAL: "emulator-5554" }), "emulator-5554");
  assert.throws(() => resolvePhase14DeviceSerial({}), /phase14_device_missing/u);
  assert.notEqual(stableDeviceIdentitySha256(["a"]), stableDeviceIdentitySha256(["b"]));

  const apk = Buffer.from("apk");
  const current = { ...manifest, apk: { ...manifest.apk, sha256: sha256(apk) } };
  assert.doesNotThrow(() => validatePhase14CurrentArtifacts({
    manifest: current,
    currentSourceTreeSha256: current.source_tree_sha256,
    apkBytes: apk,
    installedApkSha256: current.apk.sha256,
    deviceIdentitySha256: current.device.identity_sha256,
  }));
  assert.deepEqual(parsePhase14RunnerArgs(["--manifest", "artifacts/native/phase14/build.json", "--ids", selectedId]), { manifest: "artifacts/native/phase14/build.json", ids: [selectedId] });
  assert.deepEqual(parsePhase14VerifierArgs(["--manifest", "artifacts/native/phase14/build.json", "--ids", selectedId]), { manifest: "artifacts/native/phase14/build.json", all: false, ids: [selectedId] });
  assert.throws(() => parsePhase14VerifierArgs(["--all", "--ids", selectedId]), /phase14_verifier_arguments_invalid/u);
});

test("Phase 14 accepts a complete observation-derived subset and rejects incomplete Cartesian coverage", () => {
  const bundle = validBundle();
  assert.doesNotThrow(() => validatePhase14Evidence(bundle.evidence, manifest, [selectedId], { readArtifact: reader(bundle.artifacts) }));
  bundle.evidence.evidence[0].matrix_cells.pop();
  bundle.evidence.matrix_cells.pop();
  assert.throws(
    () => validatePhase14Evidence(bundle.evidence, manifest, [selectedId], { readArtifact: reader(bundle.artifacts) }),
    /phase14_evidence_mapping_invalid|phase14_matrix_cells_invalid/u,
  );
});

test("Phase 14 rejects synthetic focus traces and hard-coded native verdicts", () => {
  const synthetic = validBundle();
  const cell = synthetic.evidence.matrix_cells[0];
  const trace = JSON.parse(synthetic.artifacts.get(cell.focus_key_trace));
  trace.synthetic = true;
  cell.focus_key_trace_sha256 = rebindJsonArtifact(synthetic, cell.focus_key_trace, trace);
  assert.throws(
    () => validatePhase14Evidence(synthetic.evidence, manifest, [selectedId], { readArtifact: reader(synthetic.artifacts) }),
    /phase14_focus_trace_synthetic/u,
  );

  const hardCoded = validBundle();
  hardCoded.evidence.matrix_cells[0].native_verdict = "FAIL";
  assert.throws(
    () => validatePhase14Evidence(hardCoded.evidence, manifest, [selectedId], { readArtifact: reader(hardCoded.artifacts) }),
    /phase14_native_verdict_invalid/u,
  );
});

test("Phase 14 rejects source-tree-as-runtime-state and mislabeled rendered themes", () => {
  const sourceTree = validBundle();
  const cell = sourceTree.evidence.matrix_cells[0];
  const pair = JSON.parse(sourceTree.artifacts.get(cell.runtime_state.path));
  pair.pre.authority = "source-tree";
  cell.runtime_state.pre.authority = "source-tree";
  cell.runtime_state.sha256 = rebindJsonArtifact(sourceTree, cell.runtime_state.path, pair);
  assert.throws(
    () => validatePhase14Evidence(sourceTree.evidence, manifest, [selectedId], { readArtifact: reader(sourceTree.artifacts) }),
    /phase14_runtime_state_invalid/u,
  );

  const mislabeled = validBundle();
  mislabeled.evidence.matrix_cells[0].theme_observation.rendered_theme = "wrong";
  assert.throws(
    () => validatePhase14Evidence(mislabeled.evidence, manifest, [selectedId], { readArtifact: reader(mislabeled.artifacts) }),
    /phase14_rendered_theme_invalid/u,
  );
});

test("Phase 14 rejects skipped or todo Jest component evidence", () => {
  for (const field of ["numPendingTests", "numTodoTests"]) {
    const bundle = validBundle();
    const reportPath = bundle.evidence.component_evidence.report;
    const report = JSON.parse(bundle.artifacts.get(reportPath));
    report[field] = 1;
    bundle.evidence.component_evidence.report_sha256 = rebindJsonArtifact(bundle, reportPath, report);
    assert.throws(
      () => validatePhase14Evidence(bundle.evidence, manifest, [selectedId], { readArtifact: reader(bundle.artifacts) }),
      /phase14_component_report_invalid/u,
    );
  }
});

test("Phase 14 privacy and sheet ownership reject raw/private evidence and legacy Modal owners", () => {
  for (const unsafe of [
    { raw_rows: ["person"] },
    { sql_parameter: "secret" },
    { access_token: "secret" },
    { account_identifier: "person@example.com" },
    { personal_filename: "owner-backup.zip" },
    "/Users/example/private.db",
  ]) assert.throws(() => validatePhase14Privacy(unsafe), /phase14_privacy_invalid/u);
  assert.doesNotThrow(() => validatePhase14Privacy({ digest_sha256: "a".repeat(64), row_count: 3 }));
  assert.doesNotThrow(() => validatePhase14SourceInventory({
    confirmationSheet: "return <BottomSheet />;",
    appearanceSheet: "return <BottomSheet />;",
    consumers: [{ source: "<Modal />", exception: "shared-frame" }],
  }));
  assert.throws(() => validatePhase14SourceInventory({ confirmationSheet: "<Modal />", appearanceSheet: "<BottomSheet />", consumers: [] }), /phase14_sheet_delegation_invalid/u);
});

test("Phase 14 package commands remain bound to the owned runner, verifier, and script tests", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["test:maestro:phase14"], "node scripts/run-phase14-maestro.mjs");
  assert.equal(packageJson.scripts["verify:phase14:evidence"], "node scripts/verify-phase14-evidence.mjs");
  assert.match(packageJson.scripts["test:evidence:phase14"], /phase14-native-matrix\.test\.mjs/u);
});
