import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";
import {
  PHASE14_NATIVE_MATRIX,
  phase14MatrixCellsForIds,
  validatePhase14NativeMatrix,
} from "./phase14-native-matrix.mjs";
import {
  resolvePhase14DeviceSerial,
  validatePhase14Manifest,
} from "./run-phase14-maestro.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const hash = /^[a-f0-9]{64}$/u;
const expectedIds = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
const REPORT_PREFIX = "artifacts/native/phase14/maestro/";
const SCREENSHOT_PREFIX = "artifacts/native/phase14/screenshots/";
const SEMANTIC_PREFIX = "artifacts/native/phase14/semantic/";
const TRACE_PREFIX = "artifacts/native/phase14/traces/";
const OVERLAY_PREFIX = "artifacts/native/phase14/overlays/";
const DEVICE_IDENTITY_PROPERTIES = Object.freeze([
  "ro.build.fingerprint",
  "ro.product.cpu.abi",
  "ro.product.model",
  "ro.build.version.sdk",
  "ro.build.version.release",
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stageById = Object.freeze(
  Object.fromEntries(PHASE14_SHELL_EVIDENCE_CASES.map((entry) => [entry.id, entry])),
);

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stageFor(id) {
  const entry = stageById[id];
  if (entry === undefined) {
    throw new Error(`phase14_unknown_case:${id}`);
  }
  return entry;
}

function normalizeRelativeArtifactPath(
  relativePath,
  prefix,
  suffix,
  errorCode,
) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(errorCode);
  }
  const normalized = path.posix.normalize(relativePath.replace(/\\/gu, "/"));
  if (
    path.posix.isAbsolute(normalized)
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || !normalized.startsWith(prefix)
    || !normalized.endsWith(suffix)
  ) {
    throw new Error(errorCode);
  }
  return normalized;
}

function defaultArtifactReader(relativePath) {
  return readFileSync(path.join(ROOT, relativePath));
}

function readArtifactBytes(relativePath, readArtifact, missingCode) {
  try {
    const value = readArtifact(relativePath);
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
  } catch {
    throw new Error(missingCode);
  }
}

function validatePassingJunit(bytes) {
  const text = bytes.toString("utf8");
  const tests = Number(text.match(/\btests="(\d+)"/u)?.[1] ?? 0);
  const failures = Number(text.match(/\bfailures="(\d+)"/u)?.[1] ?? 0);
  const errors = Number(text.match(/\berrors="(\d+)"/u)?.[1] ?? 0);
  const skipped = Number(text.match(/\bskipped="(\d+)"/u)?.[1] ?? 0);
  if (tests < 1 || failures !== 0 || errors !== 0 || skipped !== 0) {
    throw new Error("phase14_report_content_invalid");
  }
  return Object.freeze({
    tests,
    failures,
    errors,
    skipped,
    sha256: sha256(bytes),
  });
}

function validateReportBinding(reportPath, expectedSha256, readArtifact) {
  const normalized = normalizeRelativeArtifactPath(
    reportPath,
    REPORT_PREFIX,
    ".xml",
    "phase14_report_path_invalid",
  );
  const bytes = readArtifactBytes(normalized, readArtifact, "phase14_report_missing");
  const summary = validatePassingJunit(bytes);
  if (summary.sha256 !== expectedSha256) {
    throw new Error("phase14_report_hash_invalid");
  }
  return Object.freeze({
    path: normalized,
    sha256: summary.sha256,
    summary,
  });
}

function validateArtifactBinding(
  relativePath,
  expectedSha256,
  {
    prefix,
    suffix,
    invalidCode,
    missingCode,
    hashCode,
    readArtifact,
  },
) {
  const normalized = normalizeRelativeArtifactPath(
    relativePath,
    prefix,
    suffix,
    invalidCode,
  );
  const bytes = readArtifactBytes(normalized, readArtifact, missingCode);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error(hashCode);
  }
  return Object.freeze({
    path: normalized,
    sha256: expectedSha256,
  });
}

function validateMatrixCellArtifacts(cell, manifest, expectedCell, readArtifact) {
  if (
    typeof cell?.id !== "string"
    || cell.id !== expectedCell.id
    || cell.case_id !== expectedCell.caseId
    || cell.stage !== expectedCell.stage
    || cell.theme !== expectedCell.theme
    || !same(cell.viewport, expectedCell.viewport)
    || cell.orientation !== expectedCell.orientation
    || cell.font_scale !== expectedCell.fontScale
    || cell.reduced_motion !== expectedCell.reducedMotion
    || cell.live_os_switch !== expectedCell.liveOsSwitch
    || !same(cell.expected_inputs, expectedCell.expectedInputs)
    || cell.source_state_sha256 !== manifest.source_tree_sha256
  ) {
    throw new Error("phase14_matrix_cells_invalid");
  }
  const report = validateReportBinding(cell.report, cell.report_sha256, readArtifact);
  if (cell.report !== report.path) {
    throw new Error("phase14_report_path_invalid");
  }
  if (
    !hash.test(cell.screenshot_sha256 ?? "")
    || !hash.test(cell.semantic_tree_sha256 ?? "")
    || !hash.test(cell.focus_key_trace_sha256 ?? "")
    || !hash.test(cell.difference_overlay_sha256 ?? "")
  ) {
    throw new Error("phase14_matrix_cells_invalid");
  }
  const screenshot = validateArtifactBinding(cell.screenshot, cell.screenshot_sha256, {
    prefix: SCREENSHOT_PREFIX,
    suffix: ".png",
    invalidCode: "phase14_matrix_cells_invalid",
    missingCode: "phase14_screenshot_stale",
    hashCode: "phase14_screenshot_stale",
    readArtifact,
  });
  const semanticTree = validateArtifactBinding(
    cell.semantic_tree,
    cell.semantic_tree_sha256,
    {
      prefix: SEMANTIC_PREFIX,
      suffix: ".xml",
      invalidCode: "phase14_matrix_cells_invalid",
      missingCode: "phase14_semantic_tree_missing",
      hashCode: "phase14_semantic_tree_hash_invalid",
      readArtifact,
    },
  );
  const focusKeyTrace = validateArtifactBinding(
    cell.focus_key_trace,
    cell.focus_key_trace_sha256,
    {
      prefix: TRACE_PREFIX,
      suffix: ".json",
      invalidCode: "phase14_matrix_cells_invalid",
      missingCode: "phase14_focus_trace_missing",
      hashCode: "phase14_focus_trace_hash_invalid",
      readArtifact,
    },
  );
  const differenceOverlay = validateArtifactBinding(
    cell.difference_overlay,
    cell.difference_overlay_sha256,
    {
      prefix: OVERLAY_PREFIX,
      suffix: ".json",
      invalidCode: "phase14_matrix_cells_invalid",
      missingCode: "phase14_overlay_missing",
      hashCode: "phase14_overlay_hash_invalid",
      readArtifact,
    },
  );
  if (
    cell.screenshot !== screenshot.path
    || cell.semantic_tree !== semanticTree.path
    || cell.focus_key_trace !== focusKeyTrace.path
    || cell.difference_overlay !== differenceOverlay.path
  ) {
    throw new Error("phase14_matrix_cells_invalid");
  }
  if (
    cell.target_window_bounds?.requested_viewport?.width !== expectedCell.viewport.width
    || cell.target_window_bounds?.requested_viewport?.height !== expectedCell.viewport.height
    || cell.target_window_bounds?.requested_orientation !== expectedCell.orientation
    || cell.target_window_bounds?.requested_font_scale !== expectedCell.fontScale
  ) {
    throw new Error("phase14_matrix_cells_invalid");
  }
  return report;
}

export function stableDeviceIdentitySha256(values) {
  return sha256(`${values.join("\n")}\n`);
}

function readInstalledApkBytes(serial, installedPath) {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "phase14-evidence-"));
  const localApkPath = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync(
      "adb",
      ["-s", serial, "pull", installedPath, localApkPath],
      { cwd: ROOT, stdio: "ignore" },
    );
    return readFileSync(localApkPath);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function readStableDeviceIdentitySha256(serial) {
  const values = DEVICE_IDENTITY_PROPERTIES.map((property) =>
    execFileSync(
      "adb",
      ["-s", serial, "shell", "getprop", property],
      { cwd: ROOT, encoding: "utf8" },
    ).trim());
  return stableDeviceIdentitySha256(values);
}

export function validatePhase14Privacy(value, pathName = "evidence") {
  if (
    typeof value === "string"
    && /(?:^\/|\\\\|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|access[_-]?token|refresh[_-]?token|password|archive[_-]?bytes|@[a-z0-9.-]+\.[a-z]{2,})/iu.test(value)
  ) {
    throw new Error("phase14_privacy_invalid");
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validatePhase14Privacy(entry, `${pathName}[${index}]`));
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/(?:sql|token|password|account|archive[_-]?bytes|email|identifier)/iu.test(key)) {
        throw new Error("phase14_privacy_invalid");
      }
      validatePhase14Privacy(entry, `${pathName}.${key}`);
    }
  }
  return true;
}

export function validatePhase14SourceInventory({
  confirmationSheet,
  appearanceSheet,
  consumers,
}) {
  if (
    !/BottomSheet/u.test(confirmationSheet ?? "")
    || /<Modal\b/u.test(confirmationSheet ?? "")
    || !/BottomSheet/u.test(appearanceSheet ?? "")
    || /<Modal\b/u.test(appearanceSheet ?? "")
  ) {
    throw new Error("phase14_sheet_delegation_invalid");
  }
  for (const consumer of consumers ?? []) {
    if (
      /<Modal\b/u.test(consumer.source ?? "")
      && consumer.exception !== "shared-frame"
      && consumer.exception !== "platform-overlay"
    ) {
      throw new Error("phase14_legacy_modal_owner");
    }
  }
  return true;
}

export function validatePhase14Dev02(dev02) {
  if (
    dev02?.owner_record !== "accessible-9b470b"
    || dev02.title_hex !== "#9B470B"
    || dev02.sport_hex !== "#D97820"
  ) {
    throw new Error("phase14_dev02_owner_invalid");
  }
  if (
    dev02.status !== "approved"
    || dev02.native_blended_fill?.status !== "passed"
    || !hash.test(dev02.native_blended_fill?.report_sha256 ?? "")
  ) {
    throw new Error("phase14_dev02_native_evidence_invalid");
  }
  return true;
}

export function validatePhase14CurrentArtifacts({
  manifest,
  currentSourceTreeSha256,
  apkBytes,
  installedApkSha256,
  deviceIdentitySha256,
}) {
  // base_head records capture provenance; the source digest is the acceptance
  // identity so later planning-only commits do not invalidate native proof.
  if (
    manifest.source_tree_sha256 !== currentSourceTreeSha256
    || sha256(apkBytes) !== manifest.apk?.sha256
  ) {
    throw new Error("phase14_manifest_stale");
  }
  if (installedApkSha256 !== manifest.apk.sha256) {
    throw new Error("phase14_installed_apk_stale");
  }
  if (deviceIdentitySha256 !== manifest.device?.identity_sha256) {
    throw new Error("phase14_device_identity_stale");
  }
  return true;
}

export function validatePhase14Evidence(
  evidence,
  manifest,
  ids = expectedIds,
  options = {},
) {
  validatePhase14Manifest(manifest, manifest.base_head, manifest.source_tree_sha256);
  validatePhase14NativeMatrix(PHASE14_NATIVE_MATRIX);
  const readArtifact = options.readArtifact ?? defaultArtifactReader;
  if (
    evidence?.schema_version !== 1
    || evidence.suite !== "phase14"
    || evidence.status !== "passed"
    || evidence.build_manifest !== "artifacts/native/phase14/build.json"
    || evidence.base_head !== manifest.base_head
    || evidence.source_tree_sha256 !== manifest.source_tree_sha256
    || evidence.package !== manifest.package
    || evidence.profile !== manifest.profile
    || evidence.device_identity_sha256 !== manifest.device?.identity_sha256
    || evidence.apk?.sha256 !== manifest.apk?.sha256
    || evidence.apk?.installed_sha256 !== manifest.apk?.sha256
    || evidence.apk?.matches_retained_apk !== true
    || !same(evidence.matrix, PHASE14_NATIVE_MATRIX)
  ) {
    throw new Error("phase14_evidence_identity_invalid");
  }

  const expectedCases = PHASE14_SHELL_EVIDENCE_CASES.filter(({ id }) => ids.includes(id));
  const expectedCells = phase14MatrixCellsForIds(ids);
  if (
    !Array.isArray(evidence.matrix_cells)
    || evidence.matrix_cells.length !== expectedCells.length
  ) {
    throw new Error("phase14_matrix_cells_invalid");
  }

  const expectedStages = expectedCases.map(({ stage }) => stage);
  if (
    !Array.isArray(evidence.stages)
    || evidence.stages.length !== expectedStages.length
  ) {
    throw new Error("phase14_stages_invalid");
  }
  const rows = evidence.evidence;
  if (!Array.isArray(rows) || rows.length !== expectedCases.length) {
    throw new Error("phase14_evidence_mapping_invalid");
  }

  const flattenedMatrixCells = [];
  for (const [index, expected] of expectedCases.entries()) {
    const row = rows[index];
    const stage = evidence.stages[index];
    const rowExpectedCells = expectedCells.filter(({ caseId }) => caseId === expected.id);
    if (
      row?.id !== expected.id
      || row.status !== "passed"
      || row.requirement !== expected.requirement
      || row.path !== expected.evidencePath
      || !hash.test(row.report_sha256 ?? "")
      || !hash.test(row.screenshot_sha256 ?? "")
      || row.component_verdict !== "passed"
      || row.native_verdict !== "passed"
      || row.source_state_sha256 !== manifest.source_tree_sha256
    ) {
      throw new Error("phase14_evidence_mapping_invalid");
    }
    const rowReport = validateReportBinding(row.report, row.report_sha256, readArtifact);
    if (row.report !== rowReport.path) {
      throw new Error("phase14_report_path_invalid");
    }
    const rowScreenshot = validateArtifactBinding(row.screenshot, row.screenshot_sha256, {
      prefix: SCREENSHOT_PREFIX,
      suffix: ".png",
      invalidCode: "phase14_screenshot_stale",
      missingCode: "phase14_screenshot_stale",
      hashCode: "phase14_screenshot_stale",
      readArtifact,
    });
    if (row.screenshot !== rowScreenshot.path) {
      throw new Error("phase14_screenshot_stale");
    }

    if (
      stage?.stage !== expected.stage
      || stage.status !== "passed"
      || stage.report !== row.report
      || stage.report_sha256 !== row.report_sha256
    ) {
      throw new Error("phase14_stage_report_mismatch");
    }
    const stageReport = validateReportBinding(stage.report, stage.report_sha256, readArtifact);
    if (
      stage.report !== stageReport.path
      || stageReport.sha256 !== rowReport.sha256
    ) {
      throw new Error("phase14_stage_report_mismatch");
    }
    if (!Array.isArray(row.matrix_cells) || row.matrix_cells.length !== rowExpectedCells.length) {
      throw new Error("phase14_matrix_cells_invalid");
    }
    if (!same(stage.matrix_cells, row.matrix_cells)) {
      throw new Error("phase14_stage_report_mismatch");
    }
    for (const [cellIndex, expectedCell] of rowExpectedCells.entries()) {
      const cell = row.matrix_cells[cellIndex];
      const report = validateMatrixCellArtifacts(
        cell,
        manifest,
        expectedCell,
        readArtifact,
      );
      if (cell.report_sha256 !== report.sha256) {
        throw new Error("phase14_report_hash_invalid");
      }
      flattenedMatrixCells.push(cell);
    }
    if (
      row.matrix_cells[0]?.report !== row.report
      || row.matrix_cells[0]?.report_sha256 !== row.report_sha256
    ) {
      throw new Error("phase14_stage_report_mismatch");
    }
  }

  if (!same(evidence.matrix_cells, flattenedMatrixCells)) {
    throw new Error("phase14_matrix_cells_invalid");
  }
  if (ids.includes("shell.tokens")) {
    if (evidence.dev02?.status !== "approved") {
      throw new Error("phase14_dev02_pending");
    }
    validatePhase14Dev02(evidence.dev02);
  }
  validatePhase14Privacy(evidence);
  return true;
}

export function parsePhase14VerifierArgs(args) {
  const options = {
    manifest: "artifacts/native/phase14/build.json",
    all: false,
    ids: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--manifest") options.manifest = args[++index] ?? "";
    else if (args[index] === "--all") options.all = true;
    else if (args[index] === "--ids") {
      options.ids = (args[++index] ?? "").split(",").filter(Boolean);
    } else {
      throw new Error(`phase14_unknown_argument:${args[index]}`);
    }
  }
  if (
    options.manifest !== "artifacts/native/phase14/build.json"
    || (options.all === (options.ids.length > 0))
    || new Set(options.ids).size !== options.ids.length
    || options.ids.some((id) => !expectedIds.includes(id))
  ) {
    throw new Error("phase14_verifier_arguments_invalid");
  }
  return options;
}

export function executePhase14EvidenceVerifier(args = process.argv.slice(2)) {
  const options = parsePhase14VerifierArgs(args);
  const directory = path.join(ROOT, "artifacts/native/phase14");
  const manifest = JSON.parse(readFileSync(path.join(directory, "build.json"), "utf8"));
  const serial = resolvePhase14DeviceSerial();
  const apkPath = path.resolve(ROOT, manifest.apk.path);
  if (!existsSync(apkPath)) throw new Error("phase14_apk_missing");
  const installedPath = execFileSync(
    "adb",
    ["-s", serial, "shell", "pm", "path", manifest.package],
    { cwd: ROOT, encoding: "utf8" },
  ).trim().replace(/^package:/u, "");
  const installedApkBytes = readInstalledApkBytes(serial, installedPath);
  const deviceIdentitySha256 = readStableDeviceIdentitySha256(serial);
  validatePhase14CurrentArtifacts({
    manifest,
    currentHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    currentSourceTreeSha256: sourceTreeSha256(ROOT),
    apkBytes: readFileSync(apkPath),
    installedApkSha256: sha256(installedApkBytes),
    deviceIdentitySha256,
  });
  const ids = options.all ? expectedIds : options.ids;
  const evidence = JSON.parse(readFileSync(path.join(directory, "maestro/phase14-evidence.json"), "utf8"));
  validatePhase14Evidence(evidence, manifest, ids);
  for (const id of ids) {
    const expected = stageFor(id);
    const record = JSON.parse(readFileSync(path.join(ROOT, expected.evidencePath), "utf8"));
    const row = record.evidence;
    validatePhase14Evidence(
      {
        ...record,
        matrix_cells: row.matrix_cells,
        stages: [record.stage],
        evidence: [row],
      },
      manifest,
      [id],
    );
    const screenshotPath = normalizeRelativeArtifactPath(
      row.screenshot,
      SCREENSHOT_PREFIX,
      ".png",
      "phase14_screenshot_stale",
    );
    const absoluteScreenshotPath = path.join(ROOT, screenshotPath);
    if (
      !existsSync(absoluteScreenshotPath)
      || sha256(readFileSync(absoluteScreenshotPath)) !== row.screenshot_sha256
    ) {
      throw new Error("phase14_screenshot_stale");
    }
  }
  const result = {
    schema_version: 1,
    suite: "phase14",
    status: "passed",
    ids,
    evidence_sha256: sha256(JSON.stringify(evidence)),
  };
  writeFileSync(
    path.join(directory, "verified-evidence.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

if (process.argv[1]?.endsWith("verify-phase14-evidence.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...executePhase14EvidenceVerifier() })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
