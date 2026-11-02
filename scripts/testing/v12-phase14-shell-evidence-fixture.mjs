import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";

import { PHASE14_SHELL_EVIDENCE_CASES } from "../../src/testing/contracts/phase14Shell.contract.ts";
import { loadV12VisualAuthority } from "../v12-visual-authority.mjs";
import { parsePhase14SemanticSnapshot } from "../phase14-action-observation.mjs";
import { buildPhase14CellCheckpoint, phase14CellCheckpointPath } from "../phase14-cell-checkpoint.mjs";
import { buildPhase14Dev02Evidence, comparePhase14PngBytes, ingestPhase14JestReport } from "../phase14-evidence-observation.mjs";
import {
  PHASE14_NATIVE_MATRIX,
  phase14BehaviorCoverageForCells,
  phase14MatrixCellsForIds,
} from "../phase14-native-matrix.mjs";
import {
  buildPhase14CaptureIndex,
  canonicalJson,
  phase14CellCaptureIdentitySha256,
  resolvePhase14VisualReference,
} from "../phase14-visual-review.mjs";

export const SYNTHETIC_PHASE14_VALIDATION_OPTIONS = Object.freeze({
  validatePhase14Evidence: () => true,
});

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const PHASE14_ROOT = "artifacts/native/phase14";

function put(artifacts, artifactPath, bytes) {
  artifacts.set(artifactPath, Buffer.from(bytes));
  return { path: artifactPath, sha256: sha256(bytes) };
}

function png() {
  const image = new PNG({ width: 1, height: 1 });
  image.data.set([1, 2, 3, 255]);
  return PNG.sync.write(image);
}

function reportXml(label) {
  return Buffer.from(`<?xml version="1.0"?><testsuites><testsuite name="${label}" tests="1" failures="0" errors="0" skipped="0"><testcase name="${label}" /></testsuite></testsuites>\n`);
}

function labelNode({ label, selected = false, focused = false, enabled = true }) {
  const safe = String(label).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return `<node package="com.fchoo.gymtracker.devtest" text="${safe}" content-desc="${safe}" resource-id="" focused="${focused}" selected="${selected}" checked="false" enabled="${enabled}" bounds="[0,0][390,844]" />`;
}

function resourceNode({ resourceIdEndsWith, focused = false, selected = false, enabled = true }) {
  const id = `com.fchoo.gymtracker.devtest:id/${resourceIdEndsWith}`;
  return `<node package="com.fchoo.gymtracker.devtest" text="" content-desc="" resource-id="${id}" focused="${focused}" selected="${selected}" checked="false" enabled="${enabled}" bounds="[0,400][390,844]" />`;
}

function semanticXml(predicate, fallbackLabels = []) {
  if (predicate?.semanticRequired === false) return null;
  const labelStates = new Map();
  const resources = [];
  const mergeLabel = (label, options = {}) => {
    if (typeof label !== "string") return;
    const current = labelStates.get(label) ?? { selected: false, focused: false, enabled: true };
    labelStates.set(label, {
      selected: current.selected || options.selected === true,
      focused: current.focused || options.focused === true,
      enabled: current.enabled && options.enabled !== false,
    });
  };
  for (const node of predicate?.nodes ?? []) {
    if (typeof node.label === "string") mergeLabel(node.label, {
      selected: node.selected === true,
      focused: node.focused === true,
      enabled: node.enabled !== false,
    });
    else if (typeof node.resourceIdEndsWith === "string") resources.push(resourceNode({
      resourceIdEndsWith: node.resourceIdEndsWith,
      focused: node.focused === true,
      selected: node.selected === true,
      enabled: node.enabled !== false,
    }));
  }
  for (const label of predicate?.visible ?? []) mergeLabel(label, {
    focused: predicate?.focus?.equals === label,
    selected: label === "Workout" || label === "Calendar" || label === "Library" || label === "Progress",
  });
  if (typeof predicate?.focus?.equals === "string") mergeLabel(predicate.focus.equals, { focused: true });
  for (const label of fallbackLabels) mergeLabel(label);
  const nodes = [...labelStates.entries()].map(([label, options]) => labelNode({ label, ...options }));
  return Buffer.from(`<hierarchy rotation="0">${[...nodes, ...resources].join("")}</hierarchy>
`);
}

function commandForAction(action, preSnapshot) {
  if (action.transport === "adb-keyevent") return { key_code: action.command.keyCode };
  if (action.transport === "adb-launch") return { intent: action.command.intent, component_sha256: "f".repeat(64) };
  const windowBounds = preSnapshot.window_bounds;
  const sheetBounds = preSnapshot.nodes.find(({ resource_id: resourceId }) => resourceId.endsWith("bottom-sheet-frame"))?.bounds;
  const edgeOffset = Math.max(1, Math.min(8, Math.floor((sheetBounds.top - windowBounds.top) / 2)));
  return {
    normalized_target: "outside-sheet",
    rotation: preSnapshot.rotation,
    window_bounds: windowBounds,
    sheet_bounds: sheetBounds,
    x: Math.floor((windowBounds.left + windowBounds.right) / 2),
    y: sheetBounds.top - edgeOffset,
  };
}

function expectedTheme(cell, selectionReport = undefined) {
  const osScheme = cell.liveOsSwitch ? (cell.systemNightAfter ? "dark" : "light") : cell.osScheme;
  const rendered = cell.expectedRenderedThemeAfterSwitch ?? (cell.appearanceSelection === "System" ? osScheme : cell.renderedTheme);
  return {
    selected_option: cell.appearanceSelection,
    selection_observed_via: "maestro-tap-and-assert",
    ...(selectionReport === undefined ? {} : { selection_report: selectionReport.path, selection_report_sha256: selectionReport.sha256 }),
    os_scheme: osScheme,
    rendered_theme: rendered,
    expected_rendered_theme: rendered,
    verdict: "PASS",
  };
}

function runtimeStateForCell(artifacts, cell) {
  const rationale = cell.runtimeStatePolicy === "preference-write-reviewed"
    ? "Preference selection intentionally writes settings and is reviewed by explicit theme evidence."
    : "Logical no-write state is probed only by the explicit representative behavior configurations for this state.";
  if (!cell.behavior.logicalStateProbe) return { verdict: "N_A_REVIEWED", rationale };
  const digest = {
    proof_schema_version: 1,
    producer: "phase14-app-canonical-logical-source-digest/v1",
    authority: "development-test-app-canonical-logical-sqlite-source",
    digest_sha256: "e".repeat(64),
    table_count: 48,
    row_count: 321,
    schema_version: 30,
    contains_raw_rows: false,
  };
  const pair = { pre: digest, post: digest };
  const runtimeArtifact = put(artifacts, `${PHASE14_ROOT}/runtime-state/${cell.id}.json`, Buffer.from(`${JSON.stringify(pair, null, 2)}\n`));
  return { verdict: "PASS", ...runtimeArtifact, ...pair };
}

function visualComparisonForCell({ artifacts, root, cell, screenshot, theme }) {
  const resolution = resolvePhase14VisualReference(cell, theme);
  if (resolution.kind === "native-only") return { verdict: "N_A_REVIEWED", rationale: resolution.rationale, reference_policy: "native-only" };
  if (resolution.kind === "not-exact") return { verdict: "NOT_RUN", reference_policy: "authoritative-only" };
  let referenceBytes;
  try { referenceBytes = readFileSync(path.join(root ?? process.cwd(), resolution.reference.file)); }
  catch { referenceBytes = screenshot.bytes; }
  const comparison = comparePhase14PngBytes({ reference: referenceBytes, native: screenshot.bytes });
  const artifactRoot = `${PHASE14_ROOT}/comparison/${cell.id}`;
  const comparisonArtifacts = {};
  for (const [name, bytes] of Object.entries(comparison.bytes)) {
    const artifact = put(artifacts, `${artifactRoot}/${name}.png`, bytes);
    comparisonArtifacts[name] = { path: artifact.path, sha256: artifact.sha256, media_type: "image/png" };
  }
  const record = {
    ...comparison.record,
    reference_id: cell.referencePolicy.referenceId,
    reference_source: cell.referencePolicy.source,
    configuration_id: cell.configurationId,
    capture_state: cell.referencePolicy.captureState,
    observed_rendered_theme: theme.rendered_theme,
    artifacts: comparisonArtifacts,
  };
  const recordArtifact = put(artifacts, `${artifactRoot}/record.json`, Buffer.from(`${JSON.stringify(record, null, 2)}\n`));
  return {
    verdict: "PASS",
    reference_policy: "authoritative-only",
    classification: comparison.classification,
    artifacts: comparisonArtifacts,
    metrics: comparison.metrics,
    record: recordArtifact.path,
    record_sha256: recordArtifact.sha256,
  };
}

function buildProductionPhase14Evidence(manifest, { root, sourceRoot, apkBytes } = {}) {
  if (typeof sourceRoot !== "string" || sourceRoot.length === 0) throw new Error("phase14_production_fixture_source_root_required");
  const authority = loadV12VisualAuthority({ root, externalRoot: "" });
  const artifacts = new Map();
  const ids = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
  const expectedCells = phase14MatrixCellsForIds(ids);
  const matrixCells = expectedCells.map((expectedCell, cellIndex) => {
    const report = put(artifacts, `${PHASE14_ROOT}/maestro/${expectedCell.id}.xml`, reportXml(expectedCell.id));
    const initialTheme = expectedTheme(expectedCell);
    const visualReference = resolvePhase14VisualReference(expectedCell, initialTheme);
    let screenshotBytes = png();
    if (visualReference.kind === "comparable") {
      try { screenshotBytes = readFileSync(path.join(root ?? process.cwd(), visualReference.reference.file)); }
      catch { /* The retained synthetic fixture can still exercise non-exact visual paths without a local reference. */ }
    }
    const screenshot = { ...put(artifacts, `${PHASE14_ROOT}/screenshots/${expectedCell.id}.png`, screenshotBytes), bytes: screenshotBytes };
    const semanticBytes = semanticXml(expectedCell.state.capture, ["Workout"]);
    const semantic = put(artifacts, `${PHASE14_ROOT}/semantic/${expectedCell.id}.xml`, semanticBytes);
    const actions = expectedCell.behavior.actionIds.map((actionId, actionIndex) => {
      const action = expectedCell.actions.find(({ id }) => id === actionId);
      const preparationArtifact = action.transport === "adb-launch"
        ? null
        : put(artifacts, `${PHASE14_ROOT}/maestro/${expectedCell.id}-action-${actionIndex}-${action.id}.xml`, reportXml(`${expectedCell.id}:${action.id}`));
      const preparation = action.transport === "adb-launch"
        ? { kind: "adb-force-stop" }
        : { kind: "maestro", report: preparationArtifact.path, report_sha256: preparationArtifact.sha256 };
      const preBytes = semanticXml(action.pre);
      const postBytes = semanticXml(action.post);
      const pre = preBytes === null ? { path: null, sha256: null, snapshot: null } : { ...put(artifacts, `${PHASE14_ROOT}/traces/${expectedCell.id}-${actionIndex}-pre.xml`, preBytes), snapshot: parsePhase14SemanticSnapshot(preBytes) };
      const post = postBytes === null ? { path: null, sha256: null, snapshot: null } : { ...put(artifacts, `${PHASE14_ROOT}/traces/${expectedCell.id}-${actionIndex}-post.xml`, postBytes), snapshot: parsePhase14SemanticSnapshot(postBytes) };
      return {
        schema_version: 3,
        order: actionIndex,
        action_id: action.id,
        input: action.input,
        transport: action.transport,
        command: commandForAction(action, pre.snapshot),
        preparation,
        started_at: `2026-10-10T01:${String(cellIndex).padStart(2, "0")}:00.${String(actionIndex * 2).padStart(3, "0")}Z`,
        finished_at: `2026-10-10T01:${String(cellIndex).padStart(2, "0")}:00.${String(actionIndex * 2 + 1).padStart(3, "0")}Z`,
        poll_attempts: 1,
        pre: { package_foreground: action.pre.packageForeground, ime_visible: action.pre.imeVisible, semantic_tree: pre.path, semantic_tree_sha256: pre.sha256, focused_node: pre.snapshot?.focused_node ?? null, predicate: { verdict: "PASS", failures: [] } },
        post: { package_foreground: action.post.packageForeground, ime_visible: action.post.imeVisible, semantic_tree: post.path, semantic_tree_sha256: post.sha256, focused_node: post.snapshot?.focused_node ?? null, predicate: { verdict: "PASS", failures: [] } },
        verdict: "PASS",
      };
    });
    const trace = { schema_version: 3, producer: "phase14-adb-observer/v2", synthetic: false, cell_id: expectedCell.id, stage: expectedCell.stage, observations: actions };
    const traceArtifact = put(artifacts, `${PHASE14_ROOT}/traces/${expectedCell.id}.json`, Buffer.from(`${JSON.stringify(trace, null, 2)}\n`));
    const theme = expectedTheme(expectedCell, report);
    const cell = {
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
      behavior: expectedCell.behavior,
      capture_requirements: expectedCell.captureRequirements,
      report: report.path,
      report_sha256: report.sha256,
      maestro: { tests: 1, failures: 0, errors: 0, skipped: 0, verdict: "PASS" },
      screenshot: screenshot.path,
      screenshot_sha256: screenshot.sha256,
      semantic_tree: semantic.path,
      semantic_tree_sha256: semantic.sha256,
      semantic_observation: { capture_state: expectedCell.state.captureState, package: manifest.build.package, focused_node: parsePhase14SemanticSnapshot(semanticBytes).focused_node, verdict: "PASS" },
      focus_key_trace: traceArtifact.path,
      focus_key_trace_sha256: traceArtifact.sha256,
      actions,
      checkpoints: expectedCell.checkpoints.map(({ id }) => ({ id, observed_via: "passing-maestro-assertion", report_sha256: report.sha256, verdict: "PASS" })),
      target_window_bounds: {
        requested_viewport: expectedCell.viewport,
        requested_orientation: expectedCell.orientation,
        requested_font_scale: expectedCell.fontScale,
        requested_appearance: expectedCell.appearance,
        wm_size: `${expectedCell.viewport.width}x${expectedCell.viewport.height}`,
        wm_density: "160",
        font_scale: String(expectedCell.fontScale),
        os_scheme: theme.os_scheme,
      },
      runtime_state: runtimeStateForCell(artifacts, expectedCell),
      theme_observation: theme,
    };
    cell.visual_comparison = visualComparisonForCell({ artifacts, root, cell: expectedCell, screenshot, theme });
    cell.native_verdict = "PASS";
    return cell;
  });
  const componentResults = [...new Set(PHASE14_SHELL_EVIDENCE_CASES.flatMap(({ componentTests }) => componentTests))]
    .map((componentTest) => ({
      name: componentTest,
      status: "passed",
      assertionResults: [{ fullName: componentTest, status: "passed" }],
    }));
  const jestReport = {
    success: true,
    numTotalTests: componentResults.length,
    numPassedTests: componentResults.length,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: componentResults,
  };
  const componentReport = put(artifacts, `${PHASE14_ROOT}/components/jest.json`, Buffer.from(`${JSON.stringify(jestReport, null, 2)}\n`));
  const componentIngested = ingestPhase14JestReport(jestReport, PHASE14_SHELL_EVIDENCE_CASES);
  const rows = PHASE14_SHELL_EVIDENCE_CASES.map((contract) => {
    const cells = matrixCells.filter(({ case_id: caseId }) => caseId === contract.id);
    const visualVerdicts = cells.map(({ visual_comparison: comparison }) => comparison.verdict);
    const comparableRequired = cells.filter(({ visual_comparison: comparison }) => comparison.artifacts !== undefined).length;
    const visualVerdict = visualVerdicts.includes("REVIEW_REQUIRED") ? "REVIEW_REQUIRED"
      : comparableRequired > 0 && visualVerdicts.filter((verdict) => verdict === "PASS").length === comparableRequired ? "PASS" : "N_A_REVIEWED";
    return {
      id: contract.id,
      requirement: contract.requirement,
      path: contract.evidencePath,
      component_evidence: componentIngested.cases.find(({ id }) => id === contract.id),
      component_verdict: "PASS",
      native_verdict: "PASS",
      visual_verdict: visualVerdict,
      verdict: visualVerdict === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "PASS",
      matrix_cells: cells,
    };
  });
  const checkpointSet = matrixCells.map((cell) => ({ cell_id: cell.id, observation_sha256: phase14CellCaptureIdentitySha256(cell) }));
  const checkpointIdentity = {
    source_tree_sha256: manifest.source.tree_sha256,
    apk_sha256: manifest.build.apk.sha256,
    package: manifest.build.package,
    profile: "development-test",
    device_identity_sha256: manifest.device.identity_sha256,
    matrix_schema_version: PHASE14_NATIVE_MATRIX.schemaVersion,
  };
  const coverageCheckpoints = matrixCells.map((cell) => {
    const expectedCell = expectedCells.find(({ id }) => id === cell.id);
    const checkpoint = buildPhase14CellCheckpoint({
      expectedCell,
      identity: checkpointIdentity,
      observation: cell,
      capturedStartedAt: "2026-10-10T01:00:00.000Z",
      capturedFinishedAt: "2026-10-10T01:10:00.000Z",
    });
    const artifactPath = phase14CellCheckpointPath(PHASE14_ROOT, cell.id);
    const bytes = Buffer.from(`${JSON.stringify(checkpoint, null, 2)}\n`);
    artifacts.set(artifactPath, bytes);
    return { cell_id: cell.id, path: artifactPath, sha256: sha256(bytes) };
  });
  const evidence = {
    schema_version: 4,
    producer: "phase14-native-observation/v4",
    suite: "phase14",
    verdict: "PASS",
    build_manifest: `${PHASE14_ROOT}/build.json`,
    base_head: manifest.source.head,
    source_tree_sha256: manifest.source.tree_sha256,
    package: manifest.build.package,
    profile: "development-test",
    device_identity_sha256: manifest.device.identity_sha256,
    apk: { path: `${PHASE14_ROOT}/gym-tracker-phase14-devtest.apk`, sha256: manifest.build.apk.sha256, size_bytes: manifest.build.apk.size_bytes ?? 1, page_alignment_kib: 16, page_alignment_verified: true, installed_sha256: manifest.device.installed_apk_sha256, matches_retained_apk: true },
    captured_started_at: "2026-10-10T01:00:00.000Z",
    captured_finished_at: "2026-10-10T01:10:00.000Z",
    matrix: PHASE14_NATIVE_MATRIX,
    coverage: {
      mode: "all",
      complete: true,
      requested_ids: ids,
      requested_cell: null,
      expected_cell_count: matrixCells.length,
      observed_cell_count: matrixCells.length,
      checkpoint_cell_count: matrixCells.length,
      resumed_cell_count: 0,
      checkpoint_cell_ids: matrixCells.map(({ id }) => id),
      checkpoint_set_sha256: sha256(canonicalJson(checkpointSet)),
      cell_checkpoints: coverageCheckpoints,
    },
    behavior_coverage: phase14BehaviorCoverageForCells(expectedCells),
    dev02: buildPhase14Dev02Evidence({
      titleHex: "#9B470B",
      sportHex: "#D97820",
      surfaceHex: "#FFFFFF",
      blendAlpha: 0.14,
      sourceHashes: {
        theme_sha256: sha256(readFileSync(path.join(sourceRoot, "src/ui/theme/index.ts"))),
        prototype_sha256: authority.source_hashes["approved-hybrid-html"],
        owner_record_sha256: sha256(readFileSync(path.join(sourceRoot, ".planning/v1.2-OWNER-DECISIONS.md"))),
      },
    }),
    component_evidence: { ...componentIngested, report: componentReport.path, report_sha256: componentReport.sha256 },
    evidence: rows,
    matrix_cells: matrixCells,
  };
  const captureIndex = buildPhase14CaptureIndex(evidence);
  const captureIndexArtifact = put(artifacts, `${PHASE14_ROOT}/capture-index.json`, Buffer.from(`${JSON.stringify(captureIndex, null, 2)}\n`));
  evidence.capture_index = { path: captureIndexArtifact.path, sha256: captureIndexArtifact.sha256, capture_set_sha256: captureIndex.capture_set_sha256 };
  artifacts.set(`${PHASE14_ROOT}/maestro/phase14-evidence.json`, Buffer.from(`${JSON.stringify(evidence)}\n`));
  if (apkBytes !== undefined) artifacts.set(evidence.apk.path, Buffer.from(apkBytes));
  return { evidence, artifacts };
}

export function phase14ShellEvidenceFixture(manifest, options = {}) {
  const phase14Manifest = {
    schema_version: 1,
    suite: "phase14",
    profile: "development-test",
    build_variant: "release",
    package: manifest.build.package,
    js_bundle: { embedded: true },
    base_head: manifest.source.head,
    source_tree_sha256: manifest.source.tree_sha256,
    apk: {
      path: `${PHASE14_ROOT}/gym-tracker-phase14-devtest.apk`,
      sha256: manifest.build.apk.sha256,
      size_bytes: manifest.build.apk.size_bytes ?? 1,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: { sha256: manifest.device.installed_apk_sha256, matches_retained_apk: true },
    device: { identity_sha256: manifest.device.identity_sha256 },
  };
  if (options.productionShape !== true) {
    const matrixCells = PHASE14_SHELL_EVIDENCE_CASES.map((contract, order) => ({
      id: `retained-${String(order).padStart(2, "0")}-${contract.id}`,
      case_id: contract.id,
      configuration_id: manifest.configuration.id,
      actions: contract.actions.map((action, actionOrder) => ({
        schema_version: 3,
        order: actionOrder,
        action_id: action.id,
        input: action.input,
        transport: action.transport,
        command: action.command,
        pre: { predicate: { verdict: "PASS", failures: [] }, semantic_tree_sha256: `${order}`.padStart(64, "a") },
        post: { predicate: { verdict: "PASS", failures: [] }, semantic_tree_sha256: `${actionOrder}`.padStart(64, "b") },
        verdict: "PASS",
      })),
      checkpoints: contract.checkpoints.map((id) => ({ id, verdict: "PASS" })),
      runtime_state: { verdict: "PASS", policy: contract.runtimeStatePolicy },
      native_verdict: "PASS",
    }));
    const evidence = {
      schema_version: 4,
      producer: "phase14-native-observation/v4",
      suite: "phase14",
      verdict: "PASS",
      build_manifest: `${PHASE14_ROOT}/build.json`,
      base_head: phase14Manifest.base_head,
      source_tree_sha256: phase14Manifest.source_tree_sha256,
      package: phase14Manifest.package,
      profile: phase14Manifest.profile,
      device_identity_sha256: phase14Manifest.device.identity_sha256,
      apk: { ...phase14Manifest.apk, installed_sha256: phase14Manifest.apk.sha256, matches_retained_apk: true },
      evidence: PHASE14_SHELL_EVIDENCE_CASES.map((contract) => ({
        id: contract.id,
        requirement: contract.requirement,
        path: contract.evidencePath,
        component_verdict: "PASS",
        native_verdict: "PASS",
        visual_verdict: "N_A_REVIEWED",
        verdict: "PASS",
        matrix_cells: matrixCells.filter(({ case_id: caseId }) => caseId === contract.id),
      })),
      matrix_cells: matrixCells,
    };
    return { phase14Manifest, evidence };
  }
  const { evidence, artifacts } = buildProductionPhase14Evidence(manifest, options);
  artifacts.set(`${PHASE14_ROOT}/build.json`, Buffer.from(`${JSON.stringify(phase14Manifest)}\n`));
  const readArtifact = (artifactPath) => {
    const bytes = artifacts.get(artifactPath);
    if (bytes === undefined) throw new Error("v12_phase14_retention_source_missing");
    return bytes;
  };
  return { phase14Manifest, evidence, artifacts, readArtifact };
}
