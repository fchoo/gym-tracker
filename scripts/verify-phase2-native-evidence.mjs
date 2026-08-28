#!/usr/bin/env node

import {
  execFileSync,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  link,
  copyFile,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  enumeratePhase2MaestroFlows,
  PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
} from "./run-phase2-maestro.mjs";
import {
  sourceTreeSha256,
  sourceTreeSha256AtHead,
} from "./source-tree-digest.mjs";
import { validateImplementationIdentity } from "./phase2-evidence-identity.mjs";
import {
  collectPhase2SourceLedger,
  validateUiSurfaceRemediationCases,
} from "./phase2-source-ledger.mjs";
import {
  resolvePhase2AttendedPaths,
  resolvePhase2ManifestPath,
  resolvePhase2OutputPath,
  withPhase2EvidenceSealLock,
} from "./phase2-evidence-boundary.mjs";
export {
  resolvePhase2ManifestPath,
  resolvePhase2OutputPath,
} from "./phase2-evidence-boundary.mjs";
export { collectPhase2SourceLedger, validateUiSurfaceRemediationCases };
import {
  discoverPhase2AttendedDevices,
  parsePhase2AttendedChecklistBytes,
  parsePhase2AttendedRoleRecordBytes,
  parseSingleInstalledApkPath,
  validatePhase2AttendedRoleRecord,
} from "./generate-phase2-attended-checklist.mjs";

const projectRoot = process.cwd();
export const PHASE2_ADB_COMMAND_TIMEOUT_MS = 60_000;
function exactLedger(label, actual, expected) {
  if (!Array.isArray(actual)) {
    throw new Error(`${label} ledger is missing.`);
  }
  const duplicates = actual.filter(
    (id, index) => actual.indexOf(id) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`${label} ledger contains duplicate IDs.`);
  }
  if (
    actual.length !== expected.length
    || actual.some((id, index) => id !== expected[index])
  ) {
    throw new Error(`${label} ledger is incomplete or stale.`);
  }
}

function exactObjects(label, actual, expected) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + " ledger is incomplete or stale.");
  }
}

function exactIdentity(label, evidence, manifest) {
  if (
    evidence?.base_head !== manifest.base_head
    || evidence?.source_tree_sha256 !== manifest.source_tree_sha256
    || evidence?.package !== manifest.package
    || evidence?.apk?.sha256 !== manifest.apk?.sha256
    || evidence?.apk?.size_bytes !== manifest.apk?.size_bytes
    || evidence?.installed_apk?.sha256 !== manifest.apk?.sha256
    || evidence?.installed_apk?.matches_retained_apk !== true
    || evidence?.device?.serial !== manifest.device?.serial
    || evidence?.device?.api !== manifest.device?.api
    || evidence?.device?.abi !== manifest.device?.abi
  ) {
    throw new Error(`${label} identity does not match the build manifest HEAD.`);
  }
}

function validateCoverage(coverage, integrityCriticalFiles) {
  if (coverage?.total?.functions?.pct < 90) {
    throw new Error("global function coverage is below 90 percent.");
  }
  for (const relativePath of integrityCriticalFiles) {
    const entry = coverage?.[path.join(projectRoot, relativePath)];
    for (const metric of ["statements", "branches", "functions", "lines"]) {
      if (entry?.[metric]?.pct !== 100) {
        throw new Error(
          `integrity coverage failed: ${relativePath} ${metric}`,
        );
      }
    }
  }
}

function validateNative(native, manifest, nativeCaseIds) {
  exactIdentity("native", native, manifest);
  if (
    native?.suite !== "phase2"
    || native?.status !== "passed"
    || native?.contract?.expected_count !== nativeCaseIds.length
    || native?.contract?.total !== nativeCaseIds.length
    || native?.contract?.passed !== nativeCaseIds.length
    || native?.contract?.failed !== 0
    || native?.contract?.skipped !== 0
  ) {
    throw new Error("native aggregate counts are incomplete.");
  }
  exactLedger(
    "native case",
    native.contract?.cases?.map(({ id }) => id),
    nativeCaseIds,
  );
  if (
    native.contract.cases.some(({ status }) => status !== "passed")
  ) {
    throw new Error("native aggregate contains a failed or skipped case.");
  }
}

function phase2MaestroReportPath(report) {
  if (
    typeof report !== "string"
    || report.length < 1
    || report !== path.posix.basename(report)
  ) {
    throw new Error("Phase 2 Maestro report source is malformed.");
  }
  return path.posix.join("artifacts/native/phase2", report);
}

function normalizedExpectedMaestroExecutions(flows) {
  if (!Array.isArray(flows)) {
    throw new Error("Maestro evidence is missing flows.");
  }
  return flows.map((flow) => ({
    id: flow.id,
    flow: flow.flow,
    report: phase2MaestroReportPath(flow.report),
    airplane_mode: flow.airplane,
    remediation_case_observations: flow.remediation_case_observations,
    viewport: flow.viewport ?? null,
  }));
}

function normalizedRecordedMaestroExecutions(flows) {
  if (!Array.isArray(flows)) {
    throw new Error("Maestro evidence is missing flows.");
  }
  return flows.map((flow) => ({
    id: flow.id,
    flow: flow.flow,
    report: flow.report,
    airplane_mode: flow.airplane_mode,
    remediation_case_observations: flow.remediation_case_observations,
    viewport: flow.viewport ?? null,
  }));
}

function validateMaestro(maestro, manifest, expectedFlows) {
  if (!maestro || typeof maestro !== "object") {
    throw new Error("Maestro evidence is missing.");
  }
  exactIdentity("Maestro", maestro, manifest);
  if (maestro?.suite !== "phase2" || maestro?.status !== "passed") {
    throw new Error("Maestro evidence did not pass.");
  }
  exactObjects(
    "Maestro execution",
    normalizedRecordedMaestroExecutions(maestro.flows),
    normalizedExpectedMaestroExecutions(expectedFlows),
  );
  for (const flow of maestro.flows) {
    if (
      flow.tests < 1
      || flow.failures !== 0
      || flow.errors !== 0
      || flow.skipped !== 0
    ) {
      throw new Error(`Maestro flow did not pass: ${String(flow.id)}`);
    }
  }
  const expectedObservations = expectedFlows.map(({ id, remediation_case_observations: observations = [] }) =>
    [id, observations]);
  const observed = maestro.flows.map(({ id, remediation_case_observations: observations }) => {
    if (!Array.isArray(observations)) {
      throw new Error("Maestro remediation case observations are missing.");
    }
    return [id, observations.map(({ case_id: caseId, observation }) => {
      if (typeof caseId !== "string" || typeof observation !== "string" || observation.length < 24) {
        throw new Error("Maestro remediation case observation is malformed.");
      }
      return { case_id: caseId, observation };
    })];
  });
  if (JSON.stringify(observed) !== JSON.stringify(expectedObservations)) {
    throw new Error("Maestro remediation observation ledger is incomplete or stale.");
  }
}

function validateMaestroProducerEvidence(maestro, sourceLedger) {
  if (!Array.isArray(maestro?.procedural_remediation_case_exclusions)) {
    throw new Error(
      "Maestro evidence is missing procedural remediation exclusions.",
    );
  }
  exactLedger(
    "Maestro procedural remediation exclusion",
    maestro?.procedural_remediation_case_exclusions,
    PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
  );
  const audit = maestro?.input_source_audit;
  if (!audit || JSON.stringify(audit) !== JSON.stringify(sourceLedger.inputSourceAudit)) {
    throw new Error("Maestro input source audit is missing or stale.");
  }
}

function validateBenchmark(benchmark, manifest) {
  exactIdentity("benchmark", benchmark, manifest);
  if (
    benchmark?.suite !== "phase2"
    || benchmark?.status !== "passed"
    || benchmark?.thresholds?.minimum_samples !== 100
  ) {
    throw new Error("benchmark evidence did not pass.");
  }
  exactLedger(
    "benchmark measurement",
    benchmark.measurements?.map(({ id }) => id),
    ["search-page", "working-set-commit"],
  );
  for (const measurement of benchmark.measurements) {
    if (
      measurement.samples_requested < 100
      || measurement.samples_completed < 100
      || measurement.durations_ms?.length !== measurement.samples_completed
      || measurement.p95_ms > benchmark.thresholds.maximum_p95_ms
      || measurement.maximum_js_task_ms
        > benchmark.thresholds.maximum_js_task_ms
    ) {
      throw new Error(`benchmark threshold failed: ${measurement.id}`);
    }
  }
}

function validateRoundtrip(roundtrip, manifest) {
  if (
    roundtrip?.schema_version !== 1
    || roundtrip?.suite !== "phase2"
    || roundtrip?.status !== "passed"
    || roundtrip?.base_head !== manifest.base_head
    || roundtrip?.source_tree_sha256 !== manifest.source_tree_sha256
    || roundtrip?.package !== manifest.package
    || roundtrip?.apk_sha256 !== manifest.apk.sha256
    || roundtrip?.retained_sha256 !== manifest.apk.sha256
    || roundtrip?.copied_sha256 !== manifest.apk.sha256
    || roundtrip?.installed_sha256 !== manifest.apk.sha256
    || roundtrip?.matches?.retained_manifest !== true
    || roundtrip?.matches?.copied_retained !== true
    || roundtrip?.matches?.installed_retained !== true
  ) {
    throw new Error("artifact roundtrip identity is incomplete.");
  }
}

function validatePhysical(physical, livePhysical, checklistEvidence) {
  if (!physical || typeof physical !== "object") {
    throw new Error("physical evidence is missing.");
  }
  if (!livePhysical || typeof livePhysical !== "object") {
    throw new Error("both attended devices must be live-probed.");
  }
  const roles = [
    ["emulator", "emulator-supplementary"],
    ["samsung", "samsung-physical"],
  ];
  for (const [key, role] of roles) {
    validatePhase2AttendedRoleRecord(physical[key], {
      checklist: checklistEvidence.checklist,
      checklistSha256: checklistEvidence.sha256,
      role,
    });
    if (JSON.stringify(livePhysical[key])
      !== JSON.stringify(checklistEvidence.checklist.devices[role])) {
      throw new Error(`${role} live device identity does not match attended evidence.`);
    }
  }
}

export function validatePhase2AutomatedEvidence(
  evidence,
  {
    requirePhysical = false,
    requireRoundtrip = false,
    outputPath,
    preflight = false,
  } = {},
) {
  const {
    manifest,
    native,
    maestro,
    benchmark,
    roundtrip,
    physical,
    livePhysical,
    checklist,
    checklistSha256,
    coverage,
    requirements,
    decisions,
    edges,
    uiTruths,
    prohibitions,
    sourceLedger,
  } = evidence;
  if (!sourceLedger) {
    throw new Error("source-derived Phase 2 ledger is required.");
  }
  const ledger = sourceLedger;

  if (
    manifest?.schema_version !== 1
    || manifest?.suite !== "phase2"
    || manifest?.profile !== "development-test"
    || manifest?.build_variant !== "release"
    || manifest?.js_bundle?.embedded !== true
    || manifest?.apk?.page_alignment_kib !== 16
    || manifest?.apk?.page_alignment_verified !== true
  ) {
    throw new Error("Phase 2 build manifest is invalid.");
  }
  exactLedger("requirement", requirements, ledger.requirements);
  exactLedger("decision", decisions, ledger.decisions);
  exactLedger("edge", edges, ledger.edges);
  exactLedger("UI truth", uiTruths, ledger.uiTruths);
  exactLedger("prohibition", prohibitions, ledger.prohibitions);
  validateCoverage(coverage, ledger.integrityCriticalFiles);
  validateNative(native, manifest, ledger.nativeCaseIds);
  validateMaestro(maestro, manifest, evidence.expectedFlows ?? maestro.flows);
  validateMaestroProducerEvidence(maestro, ledger);
  validateBenchmark(benchmark, manifest);
  if (requireRoundtrip) {
    validateRoundtrip(roundtrip, manifest);
  }
  if (requirePhysical && !preflight && !outputPath) {
    throw new Error("--output is required for physical final output.");
  }
  if (requirePhysical) {
    if (!checklist || !/^[a-f0-9]{64}$/u.test(checklistSha256 ?? "")) {
      throw new Error("canonical attended checklist evidence is missing.");
    }
    validatePhysical(physical, livePhysical, {
      checklist,
      sha256: checklistSha256,
    });
  }

  return {
    schema_version: 1,
    suite: "phase2",
    status: "passed",
    mode: preflight ? "attended-preflight" : requirePhysical ? "final" : "automated-only",
    approval_status: requirePhysical && !preflight ? "approved" : "evidence_pending",
    build_manifest: "artifacts/native/phase2/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    installed_sha256: manifest.apk.sha256,
    ...(requirePhysical ? {
      attended_devices: {
        "emulator-supplementary": physical.emulator.device,
        "samsung-physical": physical.samsung.device,
      },
    } : {}),
    counts: {
      requirements: `${ledger.requirements.length}/${ledger.requirements.length}`,
      decisions: `${ledger.decisions.length}/${ledger.decisions.length}`,
      edges: `${ledger.edges.length}/${ledger.edges.length}`,
      ui_truths: `${ledger.uiTruths.length}/${ledger.uiTruths.length}`,
      prohibitions: `${ledger.prohibitions.length}/${ledger.prohibitions.length}`,
    },
    native_cases: `${ledger.nativeCaseIds.length}/${ledger.nativeCaseIds.length}`,
    maestro_flows: `${(evidence.expectedFlows ?? maestro.flows).length}/${(evidence.expectedFlows ?? maestro.flows).length}`,
    benchmark_measurements: "2/2",
    roundtrip_required: requireRoundtrip,
    physical_required: requirePhysical,
    verified_at: new Date().toISOString(),
  };
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export async function producePhase2RoundtripEvidence({
  manifest,
  mode,
  copiedApkPath,
  installedSha256,
}) {
  const retainedPath = path.resolve(projectRoot, manifest.apk.path);
  if (mode === "temp-copy") {
    await copyFile(retainedPath, copiedApkPath);
  } else if (mode !== "downloaded-directory") {
    throw new Error("roundtrip mode is unsupported.");
  }
  const retainedSha256 = sha256(retainedPath);
  const copiedSha256 = sha256(copiedApkPath);
  const matches = {
    retained_manifest: retainedSha256 === manifest.apk.sha256,
    copied_retained: copiedSha256 === retainedSha256,
    installed_retained: installedSha256 === retainedSha256,
  };
  if (Object.values(matches).some((value) => !value)) {
    throw new Error("roundtrip digest identity mismatch.");
  }
  return {
    schema_version: 1,
    suite: "phase2",
    status: "passed",
    mode,
    build_manifest: "artifacts/native/phase2/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    retained_sha256: retainedSha256,
    copied_sha256: copiedSha256,
    installed_sha256: installedSha256,
    matches,
    recorded_at: new Date().toISOString(),
  };
}

export { validateImplementationIdentity };

function adbExecutable(environment = process.env) {
  const androidHome = environment.ANDROID_HOME
    ?? environment.ANDROID_SDK_ROOT
    ?? "/opt/homebrew/share/android-commandlinetools";
  return path.join(androidHome, "platform-tools", "adb");
}

export function liveInstalledIdentity(manifest, {
  executable = adbExecutable(),
  execFile = execFileSync,
  root = projectRoot,
} = {}) {
  const packagePath = parseSingleInstalledApkPath(execFile(
    executable,
    ["-s", manifest.device.serial, "shell", "pm", "path", manifest.package],
    {
      cwd: root,
      encoding: "utf8",
      timeout: PHASE2_ADB_COMMAND_TIMEOUT_MS,
    },
  ), "build device");
  const temporaryDirectory = mkdtempSync(path.join(
    tmpdir(),
    "gym-tracker-phase2-installed-apk-",
  ));
  const installedApkPath = path.join(temporaryDirectory, "installed.apk");
  try {
    execFile(
      executable,
      ["-s", manifest.device.serial, "pull", packagePath, installedApkPath],
      {
        cwd: root,
        encoding: "utf8",
        timeout: PHASE2_ADB_COMMAND_TIMEOUT_MS,
      },
    );
    return {
      path: packagePath,
      sha256: sha256(installedApkPath),
    };
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not readable JSON: ${error.message}`);
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    "." + path.basename(filePath) + "." + process.pid + "." + createHash("sha256").update(String(Date.now()) + Math.random()).digest("hex").slice(0, 12) + ".tmp",
  );
  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
    await rename(temporaryPath, filePath);
  } catch (error) {
    const { rm } = await import("node:fs/promises");
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function publishJsonNoClobber(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${createHash("sha256")
      .update(String(Date.now()) + Math.random()).digest("hex").slice(0, 12)}.tmp`,
  );
  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await link(temporaryPath, filePath);
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(temporaryPath, { force: true });
  }
}

export function resolvePhase2VerifierMode({
  attendedPreflight,
  automatedOnly,
  outputArgument,
  requirePhysical,
  requireRoundtrip,
  roundtripMode,
}) {
  const producerMode = roundtripMode !== null;
  const selectedConsumerModes = [
    automatedOnly,
    attendedPreflight,
    requirePhysical,
  ].filter(Boolean).length;
  if (producerMode && (selectedConsumerModes > 0 || requireRoundtrip)) {
    throw new Error(
      "roundtrip producer mode cannot be combined with verifier modes.",
    );
  }
  if (selectedConsumerModes > 1) {
    throw new Error("select exactly one Phase 2 verifier mode.");
  }
  const normalizedAutomatedOnly = !producerMode
    && selectedConsumerModes === 0
    ? true
    : automatedOnly;
  if (producerMode && !outputArgument) {
    throw new Error("--output is required for roundtrip evidence.");
  }
  if (requirePhysical && !outputArgument) {
    throw new Error("--output is required for physical final output.");
  }
  if (!producerMode && !requirePhysical && outputArgument) {
    throw new Error("--output is only valid with --require-physical.");
  }
  if (requirePhysical
    && outputArgument !== "artifacts/native/phase2/final-verification.json") {
    throw new Error("physical final output must be artifacts/native/phase2/final-verification.json.");
  }
  if (producerMode
    && outputArgument !== "artifacts/native/phase2/artifact-roundtrip.json") {
    throw new Error("roundtrip output must be artifacts/native/phase2/artifact-roundtrip.json.");
  }
  return {
    attendedPreflight,
    automatedOnly: normalizedAutomatedOnly,
    requirePhysical,
  };
}

function validateCurrentManifestIdentity(manifest, { root, execFile }) {
  const currentHead = execFile(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  const changedPaths = currentHead === manifest.base_head
    ? []
    : execFile(
        "git",
        ["diff", "--name-only", `${manifest.base_head}..${currentHead}`],
        { cwd: root, encoding: "utf8" },
      ).trim().split(/\r?\n/u).filter(Boolean);
  validateImplementationIdentity({
    manifestHead: manifest.base_head,
    currentHead,
    changedPaths,
    manifestSourceSha256: manifest.source_tree_sha256,
    currentSourceSha256: sourceTreeSha256(root),
    implementationSourceSha256: sourceTreeSha256AtHead(
      manifest.base_head,
      root,
    ),
  });
  if (sha256(path.resolve(root, manifest.apk?.path ?? ""))
      !== manifest.apk?.sha256) {
    throw new Error("current APK identity does not match manifest.");
  }
}

export function parsePhase2VerifierArgs(args) {
  const options = {
    attendedPreflight: false, automatedOnly: false, requirePhysical: false,
    requireRoundtrip: false, roundtripMode: null, downloadedDirectory: null,
    outputArgument: null, manifestArgument: "artifacts/native/phase2/build.json",
  };
  const seen = new Set();
  const valueOption = (name, index, prefix) => {
    if (seen.has(name)) throw new Error(`duplicate argument: ${prefix}`);
    seen.add(name);
    const argument = args[index];
    const inline = argument.startsWith(`${prefix}=`);
    const value = inline ? argument.slice(prefix.length + 1) : args[index + 1];
    if (!value || value.startsWith("--") || value.includes("\0")) {
      throw new Error(`${prefix} requires a value.`);
    }
    return { value, consumed: inline ? 1 : 2 };
  };
  for (let index = 0; index < args.length;) {
    const argument = args[index];
    if (argument === "--manifest" || argument.startsWith("--manifest=")) {
      const parsed = valueOption("manifest", index, "--manifest");
      options.manifestArgument = parsed.value;
      index += parsed.consumed;
    } else if (argument === "--output" || argument.startsWith("--output=")) {
      const parsed = valueOption("output", index, "--output");
      options.outputArgument = parsed.value;
      index += parsed.consumed;
    } else if (argument === "--roundtrip-downloaded-dir"
      || argument.startsWith("--roundtrip-downloaded-dir=")) {
      const parsed = valueOption("roundtripMode", index, "--roundtrip-downloaded-dir");
      options.roundtripMode = "downloaded-directory";
      options.downloadedDirectory = parsed.value;
      index += parsed.consumed;
    } else {
      const flags = new Map([
        ["--automated-only", "automatedOnly"],
        ["--attended-preflight", "attendedPreflight"],
        ["--require-physical", "requirePhysical"],
        ["--require-roundtrip", "requireRoundtrip"],
        ["--roundtrip-temp", "roundtripMode"],
      ]);
      const name = flags.get(argument);
      if (!name) throw new Error(`unknown argument: ${argument}`);
      if (seen.has(name)) throw new Error(`duplicate argument: ${argument}`);
      seen.add(name);
      if (name === "roundtripMode") options.roundtripMode = "temp-copy";
      else options[name] = true;
      index += 1;
    }
  }
  return options;
}

export async function executePhase2VerifierCli({
  args = process.argv.slice(2),
  root = projectRoot,
  execFile = execFileSync,
  environment = process.env,
  log = console.log,
} = {}) {
  let {
    manifestArgument, automatedOnly, attendedPreflight, requirePhysical,
    requireRoundtrip, roundtripMode, downloadedDirectory, outputArgument,
  } = parsePhase2VerifierArgs(args);
  ({ attendedPreflight, automatedOnly, requirePhysical } =
    resolvePhase2VerifierMode({
      attendedPreflight,
      automatedOnly,
      outputArgument,
      requirePhysical,
      requireRoundtrip,
      roundtripMode,
    }));
  const protectedOutputPath = outputArgument === null ? null
    : resolvePhase2OutputPath({
        root,
        outputArgument,
        kind: requirePhysical ? "final" : "roundtrip",
      });

  const manifestPath = resolvePhase2ManifestPath({ root, manifestArgument });
  const manifest = await readJson(manifestPath, "build manifest");
  validateCurrentManifestIdentity(manifest, { root, execFile });
  const installed = roundtripMode || automatedOnly
    ? liveInstalledIdentity(manifest, {
        executable: path.join(
          environment.ANDROID_HOME ?? environment.ANDROID_SDK_ROOT
            ?? "/opt/homebrew/share/android-commandlinetools",
          "platform-tools",
          "adb",
        ),
        execFile,
        root,
      })
    : null;
  if (installed && installed.sha256 !== manifest.apk.sha256) throw new Error("live installed APK identity does not match manifest.");

  if (roundtripMode) {
    const copiedApkPath = roundtripMode === "temp-copy"
      ? `${path.resolve(root, manifest.apk.path)}.roundtrip.tmp`
      : path.join(
          path.resolve(root, downloadedDirectory),
          path.basename(manifest.apk.path),
        );
    const result = await producePhase2RoundtripEvidence({
      manifest,
      mode: roundtripMode,
      copiedApkPath,
      installedSha256: installed?.sha256,
    });
    await writeJsonAtomic(protectedOutputPath, result);
    if (roundtripMode === "temp-copy") {
      const { rm } = await import("node:fs/promises");
      await rm(copiedApkPath, { force: true });
    }
    log(JSON.stringify({
      ok: true,
      mode: result.mode,
      output: outputArgument,
      apk_sha256: result.apk_sha256,
    }));
    return;
  }

  const verify = async () => {
    const lockedManifestPath = resolvePhase2ManifestPath({
      root,
      manifestArgument,
    });
    const lockedManifest = await readJson(
      lockedManifestPath,
      "build manifest",
    );
    if (JSON.stringify(lockedManifest) !== JSON.stringify(manifest)) {
      throw new Error("Phase 2 build manifest changed during verification.");
    }
    validateCurrentManifestIdentity(lockedManifest, { root, execFile });
    const artifactDirectory = path.dirname(lockedManifestPath);
    const sourceLedger = await collectPhase2SourceLedger(root);
    const expectedFlows = await enumeratePhase2MaestroFlows(root);
    const attendedPaths = automatedOnly
      ? null
      : resolvePhase2AttendedPaths({ root });
    const checklistEvidence = automatedOnly
      ? null
      : parsePhase2AttendedChecklistBytes(
          await readFile(attendedPaths.checklistPath),
          { manifest: lockedManifest, sourceLedger },
        );
    const livePhysical = automatedOnly ? null : discoverPhase2AttendedDevices({
      manifest: lockedManifest,
      expectedDevices: checklistEvidence.checklist.devices,
      executable: path.join(
        environment.ANDROID_HOME ?? environment.ANDROID_SDK_ROOT
          ?? "/opt/homebrew/share/android-commandlinetools",
        "platform-tools", "adb",
      ),
      root,
      execFile,
    });
    const evidence = {
      manifest: lockedManifest,
      native: await readJson(path.join(artifactDirectory, "result.json"), "native"),
      maestro: await readJson(
        path.join(artifactDirectory, "maestro.json"),
        "Maestro",
      ),
      benchmark: await readJson(
        path.join(artifactDirectory, "benchmark.json"),
        "benchmark",
      ),
      roundtrip: existsSync(path.join(artifactDirectory, "artifact-roundtrip.json"))
        ? await readJson(
            path.join(artifactDirectory, "artifact-roundtrip.json"),
            "roundtrip",
          )
        : null,
      physical: !automatedOnly ? {
        emulator: parsePhase2AttendedRoleRecordBytes(
          await readFile(attendedPaths.emulatorPath),
          { checklist: checklistEvidence.checklist, checklistSha256: checklistEvidence.sha256, role: "emulator-supplementary" },
        ),
        samsung: parsePhase2AttendedRoleRecordBytes(
          await readFile(attendedPaths.samsungPath),
          { checklist: checklistEvidence.checklist, checklistSha256: checklistEvidence.sha256, role: "samsung-physical" },
        ),
      } : null,
      livePhysical,
      checklist: checklistEvidence?.checklist ?? null,
      checklistSha256: checklistEvidence?.sha256 ?? null,
      coverage: await readJson(
        path.join(root, "coverage/coverage-summary.json"),
        "coverage",
      ),
      requirements: sourceLedger.requirements,
      decisions: sourceLedger.decisions,
      edges: sourceLedger.edges,
      uiTruths: sourceLedger.uiTruths,
      prohibitions: sourceLedger.prohibitions,
      sourceLedger,
      expectedFlows,
    };
    const result = validatePhase2AutomatedEvidence(evidence, {
      requirePhysical: requirePhysical || attendedPreflight,
      requireRoundtrip,
      outputPath: requirePhysical ? outputArgument : undefined,
      preflight: attendedPreflight,
    });
    if (requirePhysical) {
      await publishJsonNoClobber(protectedOutputPath, result);
    }
    return result;
  };
  const result = automatedOnly
    ? await verify()
    : await withPhase2EvidenceSealLock({
        root,
        operation: requirePhysical
          ? "final-physical-verifier"
          : "attended-preflight-verifier",
      }, verify);
  if (attendedPreflight) {
    log(JSON.stringify({ ok: true, mode: "attended-preflight", approval_status: "evidence_pending", counts: result.counts }));
    return;
  }
  log(JSON.stringify({
    ok: true,
    mode: result.mode,
    counts: result.counts,
    native_cases: result.native_cases,
    maestro_flows: result.maestro_flows,
    benchmark_measurements: result.benchmark_measurements,
    apk_sha256: result.apk_sha256,
    ...(requirePhysical ? { output: outputArgument } : {}),
  }));
}

async function executeMain() {
  return executePhase2VerifierCli();
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executeMain().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: "phase2_native_evidence_failed",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}
