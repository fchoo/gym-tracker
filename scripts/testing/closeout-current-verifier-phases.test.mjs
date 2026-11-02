// Bounded current-source retained verifier test; synthetic input only.
import assert from "node:assert/strict";

import { execFileSync, spawn, spawnSync } from "node:child_process";

import { createHash } from "node:crypto";

import { EventEmitter } from "node:events";

import fs from "node:fs";

import { PassThrough } from "node:stream";

import { setTimeout as delay } from "node:timers/promises";

import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";

import { tmpdir } from "node:os";

import path from "node:path";

import test from "node:test";

import { fileURLToPath, pathToFileURL } from "node:url";

import { syncBuiltinESMExports } from "node:module";
import { runCapturedHostPhase } from "./closeout-resume-phase-proof-fixture.mjs";

import {
  collectPhase20SubprocessCoverage,
  runPhase20SubprocessCoverage,
} from "../phase20-subprocess-coverage.mjs";

import { V12_POSIX_OWNERSHIP_ENV } from "../v12-posix-process-tree.mjs";

import { buildV12ReadinessHandoff } from "../create-v12-readiness-handoff.mjs";

import { publishV12AtomicShard, verifyV12AtomicShard } from "../v12-atomic-shard-publication.mjs";

import { createV12RunManifest } from "../create-v12-run-manifest.mjs";

import {
  createV12NativeAdapter,
  invokeV12NativeAdapter,
  superviseV12NativeProcess,
} from "../v12-native-adapter.mjs";

import {
  readV12RetainedGitExecution,
  resolveV12GitExecution,
  resolveV12NativeExecutionTools,
} from "../v12-native-execution-origin.mjs";

import {
  publishV12RollbackEvidence,
  v12RollbackErrorMessage,
  verifyV12RollbackEvidence,
} from "../v12-rollback-evidence.mjs";

import {
  createV12AppFunctionalReadbacks,
  createV12DirectMaestroToolAttestation,
  prepareV12DirectSafeSdkBinding,
  createV12FunctionalExecutionReceipt,
  readV12DirectMaestroDeviceMeasurement,
  validateV12DirectMaestroMapping,
} from "../run-v12-maestro.mjs";

import { sourceTreeSha256 } from "../source-tree-digest.mjs";

import { prepareSafeMaestroSdk } from "../v12-maestro-safe-sdk.mjs";

import { executeV12SqliteShardCli } from "../v12-sqlite-shard.mjs";

import {
  executeLiveV12VisualCapture,
  executeV12VisualCapture,
} from "../capture-v12-visual.mjs";

import {
  executeV12VisualComparison,
  validateV12ComparisonShard,
  verifyV12ComparisonRecord,
} from "../compare-v12-visual.mjs";

import {
  executeV12VisualStreamingShard,
  iterateV12VisualJsonArray,
  readV12VisualJsonHeader,
} from "../v12-visual-streaming.mjs";

import { loadV12VisualAuthority } from "../v12-visual-authority.mjs";

import { createV12RetainedPhase14Closure } from "../v12-phase14-retention.mjs";

import { phase14ShellEvidenceFixture } from "./v12-phase14-shell-evidence-fixture.mjs";

import { phase18DeviceIdentitySha256 } from "../phase18-device-identity.mjs";

import {
  V12_NATIVE_PROVENANCE_REGISTRY,
  executeV12EvidenceCli,
  validateV12FinalProductionIdentity,
  verifyV12FinalNativeIdentity,
} from "../verify-v12-native-evidence.mjs";

const RETAINED_CLI_TIMEOUT_MS = 10 * 60_000;

const PHASE20_RUN_ID = "phase20-20261018T000000Z-aaaaaaaaaaaa";

const sha256 = value => createHash("sha256").update(value).digest("hex");

function copyRequiredProductionSources({ sourceRoot, targetRoot }) {
  const source = realpathSync(sourceRoot);
  const target = realpathSync(targetRoot);
  assert.notEqual(source, target);
  for (const relative of ["app", "src"]) {
    const from = path.join(source, relative);
    assert.ok(existsSync(from), `missing production source directory: ${relative}`);
    const to = path.join(target, relative);
    rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true, dereference: false });
  }
  for (const relative of [".planning/v1.2-OWNER-DECISIONS.md"]) {
    const from = path.join(source, relative);
    assert.ok(existsSync(from), `missing retained authority file: ${relative}`);
    const to = path.join(target, relative);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  const sourceHash = (relative) => sha256(readFileSync(path.join(source, relative)));
  const targetHash = (relative) => sha256(readFileSync(path.join(target, relative)));
  for (const relative of [
    "src/testing/contracts/multiPlanRunning.contract.ts",
    "src/testing/contracts/phase15Workout.contract.ts",
    "src/testing/contracts/phase17LibraryRunning.contract.ts",
    "src/ui/theme/index.ts",
    ".planning/v1.2-OWNER-DECISIONS.md",
  ]) {
    assert.equal(targetHash(relative), sourceHash(relative), `copied source hash mismatch: ${relative}`);
  }
}

function executable(file, body = "#!/bin/sh\nexit 0\n") {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
  chmodSync(file, 0o755);
  return file;
}

function nonErrorStdoutPreload(root) {
  const file = path.join(root, "artifacts/coverage-preloads/throw-non-error-on-stdout.mjs");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, 'process.stdout.write = () => { throw "non-error"; };\n');
  return file;
}

function rollbackArchive(formatVersion, schemaVersion) {
  const header = Buffer.from(JSON.stringify({ version: formatVersion, schemaVersion }));
  const prefix = Buffer.alloc(9);
  Buffer.from("GTBK").copy(prefix);
  prefix[4] = formatVersion;
  prefix.writeUInt32BE(header.length, 5);
  return Buffer.concat([prefix, header, Buffer.alloc(16, 1)]);
}

function cleanRestoreInspection(archiveBytes, formatVersion, schemaVersion) {
  const archiveSha256 = sha256(archiveBytes);
  const canonicalPostRestoreFacts = Object.freeze({
    schema_version: 1,
    producer: "v12-canonical-post-restore-facts/v1",
    archive_sha256: archiveSha256,
    source_schema_version: schemaVersion,
    table_count: 12,
    row_count: 34,
    source_facts_sha256: "c".repeat(64),
    reopened_facts_sha256: "c".repeat(64),
    integrity_check: "ok",
    foreign_key_violations: 0,
  });
  const factsSha256 = sha256(`${JSON.stringify(canonicalPostRestoreFacts)}\n`);
  return Object.freeze({
    format_version: formatVersion,
    schema_version: schemaVersion,
    clean_restore_receipt: Object.freeze({
      schema_version: 1,
      producer: "v12-production-clean-restore-receipt/v1",
      parser: "src/domains/portability/restoreCommands.ts#createRestoreCommands",
      outcome: "restored",
      clean_target: true,
      archive_sha256: archiveSha256,
      archive_format_version: formatVersion,
      archive_schema_version: schemaVersion,
      post_restore_facts_sha256: factsSha256,
      reopened_post_restore_facts_sha256: factsSha256,
    }),
    canonical_post_restore_facts: canonicalPostRestoreFacts,
  });
}

function rollbackFixture(formatVersion, schemaVersion) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-rollback-coverage-")));
  const currentSchemaVersion = Math.max(45, schemaVersion + 1);
  mkdirSync(path.join(root, "artifacts/native/v1.2", PHASE20_RUN_ID), { recursive: true });
  mkdirSync(path.join(root, "src/platform/sqlite/migrations"), { recursive: true });
  writeFileSync(
    path.join(root, `src/platform/sqlite/migrations/${String(currentSchemaVersion).padStart(4, "0")}_current.ts`),
    `export const version = ${String(currentSchemaVersion)};\n`,
  );
  const priorApk = path.join(root, "inputs/prior.apk");
  const priorReleaseManifest = path.join(root, "inputs/prior-release.json");
  const archive = path.join(root, "inputs/prior.gtbk");
  mkdirSync(path.dirname(priorApk), { recursive: true });
  const apkBytes = Buffer.from("504b0304aabbccdd", "hex");
  writeFileSync(priorApk, apkBytes);
  writeFileSync(archive, rollbackArchive(formatVersion, schemaVersion));
  const report = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`);
  writeFileSync(priorReleaseManifest, `${JSON.stringify({
    schema_version: 1,
    producer: "v12-retained-prior-release/v1",
    package: "com.fchoo.gymtracker",
    apk: {
      sha256: sha256(apkBytes),
      size_bytes: apkBytes.length,
      signature_sha256: sha256(report),
      certificate_sha256: "ab".repeat(32),
    },
  })}\n`);
  return {
    archive,
    priorApk,
    priorReleaseManifest,
    report,
    root,
    verifyApkSignature: () => ({ report, certificate_sha256: "ab".repeat(32) }),
    authenticateAndRestoreArchive: ({ archive_bytes: archiveBytes }) => cleanRestoreInspection(
      archiveBytes,
      formatVersion,
      schemaVersion,
    ),
  };
}

function atomicFixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-atomic-coverage-")));
  const runRoot = path.join(root, "artifacts/native/v1.2", PHASE20_RUN_ID);
  mkdirSync(runRoot, { recursive: true });
  return { root, runRoot };
}

function streamingOptions(root, overrides = {}) {
  const shard = overrides.shard ?? "visual";
  return {
    root,
    runId: PHASE20_RUN_ID,
    shard,
    totalCount: 1,
    batchWindow: 1,
    indexRelative: `${shard}/index.json`,
    indexHeader: { schema_version: 1, producer: "phase20-coverage", run_id: PHASE20_RUN_ID },
    resultKey: "records",
    expectedWindow: () => [{ id: "record-1" }],
    processWindow: ({ offset, ordinal, write }) => {
      write(`${shard}/record-1.json`, { id: "record-1" });
      return { records: [{ id: "record-1" }], window: { offset, ordinal, count: 1 } };
    },
    validateBatch: () => true,
    uniqueKey: (value) => createHash("sha256").update(value.id).digest("hex"),
    ...overrides,
  };
}

function ownedCoverageProcessRow(pid, state, token, command = "node coverage-worker.mjs") {
  return `${String(pid)} ${state} ${command} ${V12_POSIX_OWNERSHIP_ENV}=${token}\n`;
}

test("current source validates retained preseal, final, and interrupted recovery", {
  skip: process.env.V12_PHASE20_COVERAGE_FIXTURE === undefined,
  timeout: 25 * 60_000,
}, () => {
  if (process.env.V12_PHASE20_RETAINED_PRODUCTION_CHILD !== "1") {
    const environment = {
      ...process.env,
      V12_PHASE20_RETAINED_PRODUCTION_CHILD: "1",
      V12_PHASE20_COVERAGE_SOURCE_ROOT: process.cwd(),
    };
    delete environment.NODE_TEST_CONTEXT;
    const isolated = spawnSync(process.execPath, [
      "--test",
      "--test-concurrency=1",
      "--test-name-pattern=^current source validates retained preseal, final, and interrupted recovery$",
      fileURLToPath(import.meta.url),
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 25 * 60_000,
    });
    assert.equal(isolated.status, 0, isolated.stderr || isolated.stdout);
    return;
  }
  const archiveRoot = realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const sourceBindingFile = path.join(archiveRoot, ".planning/verification/frozen-production-sources.json");
  const sourceBinding = existsSync(sourceBindingFile)
    ? JSON.parse(readFileSync(sourceBindingFile, "utf8")) : undefined;
  const sourceRoot = realpathSync(sourceBinding?.source_root ?? process.env.V12_PHASE20_COVERAGE_SOURCE_ROOT ?? process.cwd());
  if (sourceBinding !== undefined) {
    assert.equal(sourceBinding.schema_version, 1);
    assert.equal(sourceBinding.test_only, true);
    for (const [relative, expectedHash] of Object.entries(sourceBinding.files)) {
      assert.equal(sha256(readFileSync(path.join(sourceRoot, relative))), expectedHash, `frozen fixture source changed: ${relative}`);
    }
  }
  const retainedParent = process.env.V12_RETAIN_PHASE_FIXTURE === "1"
    ? path.join(process.env.V12_RESUME_CAPTURE_DIR, "synthetic-phase-fixtures") : tmpdir();
  mkdirSync(retainedParent, { recursive: true });
  const root = realpathSync(mkdtempSync(path.join(retainedParent, "v12-retained-production-")));
  fs.cpSync(archiveRoot, root, { recursive: true, dereference: false });
  const runId = readdirSync(path.join(root, "artifacts/native/v1.2"))
    .find((entry) => entry.startsWith("phase20-"));
  assert.ok(runId);
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  const saved = new Map();
  const savedModes = new Map();
  const created = [];
  const protectedRuntimeDirectories = [];
  let publicPhasesPassed = false;
  const save = (relative) => {
    const file = path.join(root, relative);
    if (!saved.has(relative)) {
      saved.set(relative, existsSync(file) ? readFileSync(file) : null);
      if (existsSync(file)) savedModes.set(relative, fs.statSync(file).mode & 0o777);
    }
    return file;
  };
  const writeJson = (relative, value) => {
    const file = save(relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value)}\n`);
  };
  const fileHash = (relative) => createHash("sha256").update(readFileSync(path.join(root, relative))).digest("hex");
  const removeSaved = (relative) => {
    const file = save(relative);
    rmSync(file, { recursive: true, force: true });
  };
  const updatePublicationMember = (shard, artifact) => {
    const publicationRelative = `artifacts/native/v1.2/${runId}/publication/${shard}.json`;
    const publication = JSON.parse(readFileSync(save(publicationRelative), "utf8"));
    const member = publication.members.find((entry) => entry.artifact === artifact);
    assert.ok(member, `${shard}:${artifact}`);
    const bytes = readFileSync(path.join(runRoot, artifact));
    member.sha256 = createHash("sha256").update(bytes).digest("hex");
    member.size_bytes = bytes.length;
    writeJson(publicationRelative, publication);
  };
  const originalEnvironment = Object.fromEntries([
    "ANDROID_HOME", "ANDROID_SDK_ROOT", "V12_DEVICE_SERIAL",
  ].map((key) => [key, process.env[key]]));
  try {
    for (const helper of ["checklist.json", "identity.json", "observations.json", "test-resolution.json"]) removeSaved(helper);
    copyRequiredProductionSources({ sourceRoot, targetRoot: root });

    const authority = loadV12VisualAuthority({ root, externalRoot: "" });
    if (!existsSync(path.join(root, ".planning/v1.2-OWNER-BRIEF.md"))) {
      save(".planning/v1.2-OWNER-BRIEF.md");
      writeFileSync(path.join(root, ".planning/v1.2-OWNER-BRIEF.md"), "# Coverage owner brief\n");
    }

    const apkBytes = Buffer.from("504b0304aabbccdd", "hex");
    const signatureReport = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`);

    const buildRelative = `artifacts/native/v1.2/${runId}/build.json`;
    const build = JSON.parse(readFileSync(save(buildRelative), "utf8"));
    build.source.tree_sha256 = sourceTreeSha256(root);
    assert.equal(build.source.tree_sha256, sourceTreeSha256(root), "transformed fixture source digest is bound to copied production sources");
    const apkRelative = "artifacts/native/v1.2-acceptance/coverage-app.apk";
    const apkFile = path.join(root, apkRelative);
    created.push(apkFile);
    mkdirSync(path.dirname(apkFile), { recursive: true });
    writeFileSync(apkFile, apkBytes);
    const apkSha256 = createHash("sha256").update(apkBytes).digest("hex");
    const signatureSha256 = createHash("sha256").update(signatureReport).digest("hex");
    const serial = "coverage-device";
    const settingsSha256 = createHash("sha256").update("1.0\n0\n1.0\n").digest("hex");
    const restorationSha256 = settingsSha256;
    const deviceSha256 = phase18DeviceIdentitySha256({ serial, abi: "arm64-v8a", apiLevel: "36", model: "Coverage Device" });
    build.evidence_origin = "native";
    build.planning = {
      matrix_sha256: fileHash(".planning/design/v1.2-prototype-parity-matrix.json"),
      requirements_sha256: fileHash(".planning/REQUIREMENTS.md"),
      source_manifest_sha256: fileHash(".planning/design/v1.2-browser-evidence/source-manifest.json"),
      owner_brief_sha256: fileHash(".planning/v1.2-OWNER-BRIEF.md"),
      ui_spec_sha256: fileHash(".planning/phases/20-native-acceptance/20-UI-SPEC.md"),
      deviations_sha256: fileHash(".planning/design/v1.2-DEVIATIONS.md"),
    };
    build.prototype = {
      revision: 18,
      approval_sha256: authority.source_hashes["approved-json"],
      html_sha256: authority.source_hashes["approved-hybrid-html"],
    };
    build.fixtures.registry_sha256 = fileHash(".planning/design/v1.2-browser-evidence/serial-walk.json");
    build.build.apk = {
      path: apkRelative,
      sha256: apkSha256,
      size_bytes: apkBytes.length,
      page_alignment_verified: true,
      signature_sha256: signatureSha256,
      certificate_sha256: "ab".repeat(32),
    };
    build.device = {
      identity_sha256: deviceSha256,
      abi: "arm64-v8a",
      installed_apk_sha256: apkSha256,
      settings_sha256: settingsSha256,
      restoration_sha256: restorationSha256,
    };
    writeJson(buildRelative, build);

    const gitExecution = resolveV12GitExecution();
    const gitAttestationRelative = "artifacts/native/v1.2-acceptance/git-execution-origin.json";
    const gitAttestationBytes = Buffer.from(`${JSON.stringify(gitExecution.attestation)}\n`);
    writeFileSync(save(gitAttestationRelative), gitAttestationBytes);
    writeJson("artifacts/native/v1.2-acceptance/build.json", {
      base_head: build.source.head,
      source_tree_sha256: build.source.tree_sha256,
      apk: { sha256: build.build.apk.sha256 },
      v12_evidence_identity: {
        git_attestation: {
          path: gitAttestationRelative,
          sha256: createHash("sha256").update(gitAttestationBytes).digest("hex"),
        },
      },
    });

    for (const [shard, contract] of Object.entries(V12_NATIVE_PROVENANCE_REGISTRY)) {
      const publicationRelative = `artifacts/native/v1.2/${runId}/publication/${shard}.json`;
      const publication = JSON.parse(readFileSync(save(publicationRelative), "utf8"));
      publication.identity = {
        evidence_origin: "native",
        source_tree_sha256: build.source.tree_sha256,
        apk_sha256: apkSha256,
        installed_apk_sha256: apkSha256,
        device_identity_sha256: deviceSha256,
        fixture_sha256: build.fixtures.registry_sha256,
        configuration_id: build.configuration.id,
      };
      publication.execution_origin = {
        schema_version: 1,
        action: publication.execution_origin.action,
        kind: "production-default-launcher",
        toolchain_origin: "production-attested/v1",
        default_launcher: true,
        test_only: false,
        adapter_source_sha256: fileHash(contract.adapter),
        launcher_source_sha256: fileHash(contract.launcher),
        domain_source_sha256: fileHash(contract.domain),
        request_attestation_sha256: "d".repeat(64),
      };
      writeJson(publicationRelative, publication);
    }

    const calendarRelative = `artifacts/native/v1.2/${runId}/calendar-transitions.json`;
    const calendar = JSON.parse(readFileSync(save(calendarRelative), "utf8"));
    calendar.execution_origin = JSON.parse(readFileSync(
      path.join(runRoot, "publication/calendar.json"),
      "utf8",
    )).execution_origin;
    writeJson(calendarRelative, calendar);
    updatePublicationMember("calendar", "calendar-transitions.json");
    const calendarRequirementsRelative = `artifacts/native/v1.2/${runId}/calendar-requirements.json`;
    const calendarRequirements = JSON.parse(readFileSync(save(calendarRequirementsRelative), "utf8"));
    calendarRequirements.execution_origin = calendar.execution_origin;
    writeJson(calendarRequirementsRelative, calendarRequirements);
    updatePublicationMember("calendar", "calendar-requirements.json");
    const calendarArtifactsRelative = `artifacts/native/v1.2/${runId}/calendar/artifact-registry.json`;
    const calendarArtifacts = JSON.parse(readFileSync(save(calendarArtifactsRelative), "utf8"));
    calendarArtifacts.execution_origin_sha256 = createHash("sha256")
      .update(JSON.stringify(calendar.execution_origin)).digest("hex");
    const nativeRequirements = {
      flow_sha256: calendarRequirements.flow_sha256,
      fixture_id: calendarRequirements.fixture_id,
      records: calendarRequirements.records,
      junit_cases: calendarRequirements.junit_cases,
    };
    const nativeArtifactDescriptors = calendarArtifacts.members.map((member) => member.stage_id === undefined
      ? { requirement_id: member.requirement_id, probe_id: member.probe_id, kind: member.kind, relative_path: member.path, sha256: member.sha256, size_bytes: member.size_bytes }
      : { stage_id: member.stage_id, kind: member.kind, relative_path: member.path, sha256: member.sha256, size_bytes: member.size_bytes });
    Object.assign(calendar.native_receipt, {
      source_tree_sha256: build.source.tree_sha256,
      apk_sha256: apkSha256,
      installed_apk_sha256: apkSha256,
      apk_signature_sha256: signatureSha256,
      device_identity_sha256: deviceSha256,
      launcher_source_sha256: calendar.execution_origin.launcher_source_sha256,
      evidence_set_sha256: createHash("sha256").update(JSON.stringify({
        stages: calendar.stages,
        requirements: nativeRequirements,
        artifacts: nativeArtifactDescriptors,
      })).digest("hex"),
    });
    calendar.artifact_registry_sha256 = createHash("sha256")
      .update(JSON.stringify(calendarArtifacts)).digest("hex");
    writeJson(calendarArtifactsRelative, calendarArtifacts);
    writeJson(calendarRequirementsRelative, calendarRequirements);
    writeJson(calendarRelative, calendar);
    updatePublicationMember("calendar", "calendar/artifact-registry.json");
    updatePublicationMember("calendar", "calendar-requirements.json");
    updatePublicationMember("calendar", "calendar-transitions.json");

    const gitAttestationSha256 = createHash("sha256").update(gitAttestationBytes).digest("hex");
    const currentDirectSdkBinding = prepareSafeMaestroSdk();
    for (const shard of ["multi-plan", "workout", "library-running"]) {
      const mappingRelative = `artifacts/native/v1.2/${runId}/mapping/${shard}.json`;
      const mapping = JSON.parse(readFileSync(save(mappingRelative), "utf8"));
      mapping.git_attestation_sha256 = gitAttestationSha256;
      writeJson(mappingRelative, mapping);
      updatePublicationMember(shard, `mapping/${shard}.json`);
    }

    const rebindIdentity = (value) => {
      if (Array.isArray(value)) {
        value.forEach(rebindIdentity);
        return;
      }
      if (value === null || typeof value !== "object") return;
      const directReplacements = {
        source_tree_sha256: build.source.tree_sha256,
        fixture_sha256: build.fixtures.registry_sha256,
        apk_sha256: apkSha256,
        installed_apk_sha256: apkSha256,
        apk_signature_sha256: signatureSha256,
        device_identity_sha256: deviceSha256,
      };
      for (const [field, replacement] of Object.entries(directReplacements)) {
        if (Object.hasOwn(value, field)) value[field] = replacement;
      }
      if (value.source_hashes && typeof value.source_hashes === "object") {
        if (Object.hasOwn(value.source_hashes, "browser_walk")) {
          value.source_hashes.browser_walk = build.fixtures.registry_sha256;
        }
        if (Object.hasOwn(value.source_hashes, "source_manifest")) {
          value.source_hashes.source_manifest = build.planning.source_manifest_sha256;
        }
      }
      if (value.baseline && typeof value.baseline.artifact_json === "string") {
        const baselineArtifact = JSON.parse(value.baseline.artifact_json);
        baselineArtifact.source_tree_sha256 = build.source.tree_sha256;
        baselineArtifact.fixture_sha256 = build.fixtures.registry_sha256;
        value.baseline.artifact_json = JSON.stringify(baselineArtifact);
        value.baseline.artifact_sha256 = createHash("sha256")
          .update(value.baseline.artifact_json).digest("hex");
      }
      for (const [key, child] of Object.entries(value)) {
        if (key === "identity" && child !== null && typeof child === "object" && !Array.isArray(child)) {
          const replacements = {
            source_digest: build.source.tree_sha256,
            source_tree_sha256: build.source.tree_sha256,
            fixture_digest: build.fixtures.registry_sha256,
            fixture_sha256: build.fixtures.registry_sha256,
            apk_digest: apkSha256,
            apk_sha256: apkSha256,
            certificate_sha256: build.build.apk.certificate_sha256,
            installed_apk_digest: apkSha256,
            installed_apk_sha256: apkSha256,
            device_digest: deviceSha256,
            device_identity_sha256: deviceSha256,
            settings_digest: settingsSha256,
            settings_sha256: settingsSha256,
            restoration_digest: restorationSha256,
            restoration_sha256: restorationSha256,
            base_head: build.source.head,
            package: build.build.package,
          };
          for (const [field, replacement] of Object.entries(replacements)) {
            if (Object.hasOwn(child, field)) child[field] = replacement;
          }
          if (child.device && Object.hasOwn(child.device, "device_sha256")) child.device.device_sha256 = deviceSha256;
        }
        rebindIdentity(child);
      }
    };
    const captureReceipts = new Map();
    for (const legacyRetained of ["shell/phase14-build.json", "shell/phase14-evidence.json"]) {
      removeSaved(`artifacts/native/v1.2/${runId}/${legacyRetained}`);
    }
    const reboundPhase14 = phase14ShellEvidenceFixture(build, { productionShape: true, root, sourceRoot, apkBytes });
    const reboundPhase14Closure = createV12RetainedPhase14Closure({
      root,
      phase14Manifest: reboundPhase14.phase14Manifest,
      phase14Evidence: reboundPhase14.evidence,
      manifest: build,
      validationOptions: { readArtifact: reboundPhase14.readArtifact },
    });
    for (const shard of Object.keys(V12_NATIVE_PROVENANCE_REGISTRY)) {
      const publicationRelative = `artifacts/native/v1.2/${runId}/publication/${shard}.json`;
      const publication = JSON.parse(readFileSync(save(publicationRelative), "utf8"));
      for (const member of publication.members.filter(({ artifact }) => artifact.endsWith(".json"))) {
        const memberRelative = `artifacts/native/v1.2/${runId}/${member.artifact}`;
        let value;
        try { value = JSON.parse(readFileSync(path.join(root, memberRelative), "utf8")); }
        catch { continue; }
        const before = JSON.stringify(value);
        rebindIdentity(value);
        if (/^garmin\/(?:packaging-auth|sync-read|dedupe|matching)\.json$/u.test(member.artifact)) {
          for (const entry of value.cases) {
            const { binding_sha256: _bindingSha256, ...nativeReceipt } = entry;
            entry.binding_sha256 = sha256(JSON.stringify({
              run_id: runId,
              identity: value.identity,
              case: nativeReceipt,
            }));
          }
        }
        if (member.artifact === "semantics/accessibility.json") {
          value.shell_receipts = reboundPhase14Closure.receipts;
        }
        if (member.artifact === "shell/phase14/build.json") value = reboundPhase14.phase14Manifest;
        if (member.artifact === "shell/phase14/maestro/phase14-evidence.json") value = reboundPhase14.evidence;
        if (member.artifact === "screenshots/index.json") {
          for (const record of value.records) {
            record.settings.state_receipt.observation_sha256 = createHash("sha256")
              .update(JSON.stringify(record.settings.observation)).digest("hex");
            captureReceipts.set(`${record.state_id}\u0000${record.configuration_id}`, structuredClone(record.settings.state_receipt));
          }
        }
        if (member.artifact === "comparison/index.json") {
          for (const result of value.results) {
            const key = `${result.id}\u0000${result.configuration_id}`;
            result.capture_state_receipt = structuredClone(captureReceipts.get(key));
            const observation = result.observation.inline
              ?? JSON.parse(readFileSync(path.join(root, result.observation.path), "utf8"));
            result.state_receipt.observation_sha256 = createHash("sha256")
              .update(JSON.stringify(observation)).digest("hex");
          }
        }
        if (JSON.stringify(value) !== before) {
          writeJson(memberRelative, value);
          const bytes = readFileSync(path.join(root, memberRelative));
          member.sha256 = createHash("sha256").update(bytes).digest("hex");
          member.size_bytes = bytes.length;
        }
      }
      if (shard === "accessibility") {
        for (const retained of reboundPhase14Closure.members) {
          const retainedRelative = `artifacts/native/v1.2/${runId}/${retained.path}`;
          save(retainedRelative);
          mkdirSync(path.dirname(path.join(root, retainedRelative)), { recursive: true });
          writeFileSync(path.join(root, retainedRelative), retained.bytes);
        }
        const registryRelative = `artifacts/native/v1.2/${runId}/shell/phase14/artifact-registry.json`;
        save(registryRelative);
        writeJson(registryRelative, reboundPhase14Closure.registry);
        publication.members = [
          ...publication.members.filter(({ artifact }) => ["semantics/accessibility.json", "geometry/hit-targets.json"].includes(artifact)),
          ...reboundPhase14Closure.members.map(({ path: artifact, sha256, size_bytes }) => ({ artifact, sha256, size_bytes })),
          {
            artifact: "shell/phase14/artifact-registry.json",
            sha256: createHash("sha256").update(readFileSync(path.join(root, registryRelative))).digest("hex"),
            size_bytes: readFileSync(path.join(root, registryRelative)).length,
          },
        ];
      }
      writeJson(publicationRelative, publication);
    }

    const attendedRelative = `artifacts/native/v1.2/${runId}/attended-observations.json`;
    const attended = JSON.parse(readFileSync(save(attendedRelative), "utf8"));
    attended.identity.run_id = runId;
    attended.identity.source_tree_sha256 = build.source.tree_sha256;
    attended.identity.apk_sha256 = apkSha256;
    attended.identity.apk_signature_sha256 = signatureSha256;
    attended.identity.installed_apk_sha256 = apkSha256;
    attended.identity.config_sha256 = createHash("sha256").update(build.configuration.id).digest("hex");
    attended.identity.device.device_sha256 = deviceSha256;
    writeJson(attendedRelative, attended);
    const attendedPaths = [attendedRelative, ...attended.rows.map((row) => row.png.path)];
    attendedPaths.forEach(save);
    const attendedBytes = new Map(attendedPaths.map((relative) => [relative, readFileSync(path.join(root, relative))]));
    for (const relative of attendedPaths) rmSync(path.join(root, relative), { force: true });

    const rollbackInputs = path.join(root, "artifacts/coverage-rollback-inputs");
    created.push(rollbackInputs);
    mkdirSync(rollbackInputs, { recursive: true });
    const coverageMigrationRelative = "src/platform/sqlite/migrations/0045_coverage.ts";
    const excludeFile = save(".git/info/exclude");
    const retainedExclude = existsSync(excludeFile) ? readFileSync(excludeFile, "utf8") : "";
    mkdirSync(path.dirname(excludeFile), { recursive: true });
    writeFileSync(excludeFile, `${retainedExclude}\n${coverageMigrationRelative}\n`);
    const coverageMigration = save(coverageMigrationRelative);
    mkdirSync(path.dirname(coverageMigration), { recursive: true });
    writeFileSync(coverageMigration, "export const version = 45;\n");
    const priorApk = path.join(rollbackInputs, "prior.apk");
    const priorReleaseManifest = path.join(rollbackInputs, "prior-release.json");
    const archive = path.join(rollbackInputs, "prior.gtbk");
    writeFileSync(priorApk, apkBytes);
    writeFileSync(archive, rollbackArchive(9, 44));
    writeFileSync(priorReleaseManifest, `${JSON.stringify({
      schema_version: 1,
      producer: "v12-retained-prior-release/v1",
      package: "com.fchoo.gymtracker",
      apk: {
        sha256: sha256(apkBytes),
        size_bytes: apkBytes.length,
        signature_sha256: sha256(signatureReport),
        certificate_sha256: "ab".repeat(32),
      },
    })}\n`);
    publishV12RollbackEvidence({
      root,
      runId,
      priorApkPath: priorApk,
      priorReleaseManifestPath: priorReleaseManifest,
      compatibleArchivePath: archive,
      lastValidSchemaVersion: 44,
      verifyApkSignature: () => ({ report: signatureReport, certificate_sha256: "ab".repeat(32) }),
      authenticateAndRestoreArchive: ({ archive_bytes: archiveBytes }) => cleanRestoreInspection(archiveBytes, 9, 44),
    });
    for (const name of [".claims", ".staging", ".leases", "failures"]) {
      const directory = path.join(runRoot, name);
      if (existsSync(directory)) {
        assert.deepEqual(readdirSync(directory), [], `protected runtime directory is not empty: ${name}`);
        protectedRuntimeDirectories.push(directory);
        rmSync(directory, { recursive: true, force: true });
      }
    }
    for (const shard of [...Object.keys(V12_NATIVE_PROVENANCE_REGISTRY), "rollback"]) {
      assert.doesNotThrow(
        () => verifyV12AtomicShard({ root, runId, shard }),
        `invalid transformed publication: ${shard}`,
      );
    }
    const retainedFiles = [];
    const walkRun = (directory, prefix = "") => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walkRun(path.join(directory, entry.name), relative);
        else if (entry.isFile()) retainedFiles.push(relative);
      }
    };
    walkRun(runRoot);
    const expectedRetainedFiles = ["build.json"];
    for (const shard of [...Object.keys(V12_NATIVE_PROVENANCE_REGISTRY), "rollback"]) {
      const publication = JSON.parse(readFileSync(path.join(runRoot, `publication/${shard}.json`), "utf8"));
      expectedRetainedFiles.push(...publication.members.map((member) => member.artifact), `publication/${shard}.json`);
    }
    assert.deepEqual(retainedFiles.sort(), expectedRetainedFiles.sort());
    // The public preseal below revalidates this exact shard set. The explicit
    // phase-only scope avoids a duplicate heavyweight shard replay.
    for (const shard of process.env.V12_PHASE20_CURRENT_PHASE_SCOPE === "public-phase-only" ? [] : ["sqlite", "recovery", "garmin", "calendar", "multi-plan", "workout", "library-running", "visual", "accessibility", "performance"]) {
      assert.doesNotThrow(
        () => executeV12EvidenceCli(["--run", runId, "--mode", "shards-only", "--ids", shard], { root }),
        `invalid transformed shard artifact set: ${shard}`,
      );
    }

    const sdk = path.join(root, "artifacts/coverage-live-sdk");
    created.push(sdk);
    executable(path.join(sdk, "build-tools/36.0.0/apksigner"), `#!/bin/sh\nprintf 'Verified using v2 scheme (APK Signature Scheme v2): true\\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\\n'\n`);
    executable(path.join(sdk, "platform-tools/adb"), [
      "#!/bin/sh",
      "case \"$*\" in",
      "  *\"get-state\"*) printf 'device\\n' ;;",
      "  *\"ro.product.cpu.abi\"*) printf 'arm64-v8a\\n' ;;",
      "  *\"ro.build.version.sdk\"*) printf '36\\n' ;;",
      "  *\"version\"*) printf 'Android Debug Bridge version 1.0.41\\n' ;;",
      "  *\"ro.product.model\"*) printf 'Coverage Device\\n' ;;",
      "  *\"pm list packages\"*) printf 'package:com.fchoo.gymtracker.devtest\\n' ;;",
      "  *\"pm path\"*) printf 'package:/data/app/coverage/base.apk\\n' ;;",
      "  *\"exec-out cat\"*) printf '\\120\\113\\003\\004\\252\\273\\314\\335' ;;",
      `  *\"sha256sum\"*) printf '${apkSha256}  /data/app/coverage/base.apk\\n' ;;`,
      "  *\"font_scale\"*) printf '1.0\\n' ;;",
      "  *\"ui_night_mode\"*) printf '0\\n' ;;",
      "  *\"animator_duration_scale\"*) printf '1.0\\n' ;;",
      "  *\"[ ! -e \"*) printf 'clear\\n' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"));
    const liveEnvironment = { ...process.env };
    for (const key of ["NODE_ENV", "V12_PHASE20_BLACKBOX", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS", "V12_NATIVE_ADAPTER_COMMAND", "NODE_TEST_CONTEXT"]) delete liveEnvironment[key];
    Object.assign(liveEnvironment, {
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      PATH: `${path.join(sdk, "platform-tools")}:${liveEnvironment.PATH}`,
      V12_DEVICE_SERIAL: serial,
    });
    const executeDirectMaestroTool = (executablePath, args, options = {}) => {
      const result = spawnSync(executablePath, args, { ...options, encoding: "utf8" });
      assert.equal(result.status, 0, `${path.basename(executablePath)} ${args.join(" ")}: ${result.stderr}`);
      return result.stdout;
    };
    const directMaestroTools = resolveV12NativeExecutionTools({ domain: true, env: liveEnvironment });
    for (const [name, args] of [["adb", ["version"]], ["maestro", ["--version"]], ["unzip", ["-v"]]]) {
      const output = executeDirectMaestroTool(directMaestroTools[name], args, { timeout: 60_000, maxBuffer: 64 * 1024 });
      assert.ok(String(output).trim().length > 0, `${name} version output is empty`);
    }
    for (const [args, expected] of [
      [["-s", serial, "get-state"], "device"],
      [["-s", serial, "shell", "pm", "list", "packages", build.build.package], `package:${build.build.package}`],
      [["-s", serial, "shell", "pm", "path", build.build.package], "package:/data/app/coverage/base.apk"],
      [["-s", serial, "shell", "sha256sum", "/data/app/coverage/base.apk"], `${apkSha256}  /data/app/coverage/base.apk`],
      [["-s", serial, "shell", "getprop", "ro.product.cpu.abi"], "arm64-v8a"],
      [["-s", serial, "shell", "getprop", "ro.build.version.sdk"], "36"],
      [["-s", serial, "shell", "getprop", "ro.product.model"], "Coverage Device"],
      [["-s", serial, "shell", "settings", "get", "system", "font_scale"], "1.0"],
      [["-s", serial, "shell", "settings", "get", "secure", "ui_night_mode"], "0"],
      [["-s", serial, "shell", "settings", "get", "global", "animator_duration_scale"], "1.0"],
    ]) assert.equal(executeDirectMaestroTool(directMaestroTools.adb, args).trim(), expected);
    const directMaestroMeasurement = readV12DirectMaestroDeviceMeasurement(build, {
      serial,
      executionTools: directMaestroTools,
      execute: executeDirectMaestroTool,
    });
    for (const shard of ["multi-plan", "workout", "library-running"]) {
      const mappingRelative = `artifacts/native/v1.2/${runId}/mapping/${shard}.json`;
      const publicationRelative = `artifacts/native/v1.2/${runId}/publication/${shard}.json`;
      const mapping = JSON.parse(readFileSync(save(mappingRelative), "utf8"));
      const publication = JSON.parse(readFileSync(save(publicationRelative), "utf8"));
      // This is a deliberate disposable-fixture transformation, never a runtime
      // overwrite. Retain and remove the synthetic SDK artifacts before creating
      // a fresh official host-compiled binding for production-schema validation.
      for (const relative of [mapping.tool_attestation.safe_sdk.receipt_path, mapping.tool_attestation.safe_sdk.jar_path]) {
        save(relative); rmSync(path.join(root, relative));
      }
      const sdkBinding = prepareV12DirectSafeSdkBinding({ root, runId, shard, tools: directMaestroTools,
        dependencies: { prepareSafeSdk: () => currentDirectSdkBinding } });
      created.push(path.join(root, sdkBinding.attestation.receipt_path), path.join(root, sdkBinding.attestation.jar_path));
      const toolAttestation = createV12DirectMaestroToolAttestation({
        execute: executeDirectMaestroTool,
        executionTools: directMaestroTools,
        shard, root, runId, retainedSafeSdk: sdkBinding.attestation,
      });
      mapping.observations = mapping.observations.map((observation) => {
        const priorReceipt = observation.execution_receipt;
        const appReadbacks = createV12AppFunctionalReadbacks({
          shard,
          caseId: observation.case_id,
          nonce: priorReceipt.nonce,
          actionId: priorReceipt.source_receipt.action_id,
          sourceProbe: priorReceipt.source_receipt.source_probe,
          declaredReadback: priorReceipt.ui_readback.declared_readback,
          authorityTables: priorReceipt.source_receipt.authority_tables,
          pre: priorReceipt.source_receipt.pre,
          action: priorReceipt.source_receipt.action,
          post: priorReceipt.source_receipt.post,
        });
        return {
          ...observation,
          device_measurement: {
            before: directMaestroMeasurement,
            after: directMaestroMeasurement,
          },
          execution_receipt: createV12FunctionalExecutionReceipt({
            nonce: priorReceipt.nonce,
            runId,
            shard,
            caseId: observation.case_id,
            identity: {
              source_tree_sha256: build.source.tree_sha256,
              apk_sha256: build.build.apk.sha256,
              installed_apk_sha256: build.device.installed_apk_sha256,
              device_identity_sha256: build.device.identity_sha256,
              configuration_id: build.configuration.id,
            },
            sourceReceipt: appReadbacks.source_receipt,
            uiReadback: appReadbacks.ui_readback,
            pre: { source_sha256: priorReceipt.phases[0].source_sha256 },
            action: { report_sha256: observation.report_sha256 },
            post: {
              source_sha256: priorReceipt.phases[2].source_sha256,
              ui_sha256: appReadbacks.ui_readback.ui_receipt_sha256,
            },
          }),
        };
      });
      mapping.identity = {
        source_tree_sha256: build.source.tree_sha256,
        package: directMaestroMeasurement.package,
        apk_sha256: build.build.apk.sha256,
        installed_apk_sha256: directMaestroMeasurement.installed_apk_sha256,
        certificate_sha256: build.build.apk.certificate_sha256,
        device_identity_sha256: directMaestroMeasurement.device_identity_sha256,
        settings_sha256: directMaestroMeasurement.settings_sha256,
        configuration_id: directMaestroMeasurement.configuration_id,
      };
      mapping.tool_attestation = toolAttestation;
      const executionOrigin = {
        schema_version: 1,
        action: shard,
        kind: "production-default-launcher",
        toolchain_origin: "production-attested/v1",
        default_launcher: true,
        test_only: false,
        adapter_source_sha256: publication.execution_origin.adapter_source_sha256,
        launcher_source_sha256: publication.execution_origin.launcher_source_sha256,
        domain_source_sha256: publication.execution_origin.domain_source_sha256,
        request_attestation_sha256: sha256(JSON.stringify({
          schema_version: 2,
          action: shard,
          run_id: runId,
          source_tree_sha256: build.source.tree_sha256,
          apk_sha256: build.build.apk.sha256,
          device_identity_sha256: build.device.identity_sha256,
          flow_sha256: mapping.flow_sha256,
          source_sha256: mapping.source_sha256,
          git_attestation_sha256: mapping.git_attestation_sha256,
          tool_attestation_sha256: sha256(JSON.stringify(toolAttestation)),
          measurement_sha256: sha256(JSON.stringify(mapping.observations.map(({ device_measurement: measurement }) => measurement))),
          execution_receipt_sha256: sha256(JSON.stringify(mapping.observations.map(({ execution_receipt: receipt }) => receipt?.receipt_sha256))),
        })),
      };
      mapping.execution_origin = executionOrigin;
      assert.equal(validateV12DirectMaestroMapping(mapping, { root, manifest: build, shard }), true);
      publication.execution_origin = executionOrigin;
      writeJson(mappingRelative, mapping);
      const mappingMember = publication.members.find(({ artifact }) => artifact === `mapping/${shard}.json`);
      assert.ok(mappingMember);
      const mappingBytes = readFileSync(path.join(root, mappingRelative));
      mappingMember.sha256 = sha256(mappingBytes);
      mappingMember.size_bytes = mappingBytes.length;
      for (const sdkPath of [sdkBinding.attestation.receipt_path, sdkBinding.attestation.jar_path]) {
        const prefix = `artifacts/native/v1.2/${runId}/`;
        assert.ok(sdkPath.startsWith(prefix));
        const sdkArtifact = sdkPath.slice(prefix.length);
        const sdkMember = publication.members.find(({ artifact }) => artifact === sdkArtifact);
        assert.ok(sdkMember, `prepared SDK member must have publication ownership: ${sdkArtifact}`);
        const sdkBytes = readFileSync(path.join(root, sdkPath));
        sdkMember.sha256 = sha256(sdkBytes);
        sdkMember.size_bytes = sdkBytes.length;
      }
      writeJson(publicationRelative, publication);
    }
    const verifier = new URL("../verify-v12-native-evidence.mjs", import.meta.url).pathname;
    process.stderr.write("[current verifier phases] before preseal\n");
    const preseal = runCapturedHostPhase("preseal",process.execPath, [verifier, "--run", runId, "--mode", "preseal", "--no-final-write"], {
      cwd: root,
      encoding: "utf8",
      env: liveEnvironment,
      maxBuffer: 1024 * 1024 * 1024,
      timeout: RETAINED_CLI_TIMEOUT_MS,
    },Object.values(directMaestroTools).filter(value=>typeof value==="string"&&existsSync(value)));
    assert.equal(preseal.status, 0, preseal.stderr);
    assert.equal(JSON.parse(preseal.stdout).mode, "preseal");
    process.stderr.write("[current verifier phases] after preseal\n");
    for (const [relative, bytes] of attendedBytes) {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      writeFileSync(path.join(root, relative), bytes);
    }
    process.stderr.write("[current verifier phases] before final\n");
    const final = runCapturedHostPhase("final",process.execPath, [verifier, "--run", runId, "--mode", "final"], {
      cwd: root,
      encoding: "utf8",
      env: liveEnvironment,
      maxBuffer: 1024 * 1024 * 1024,
      timeout: RETAINED_CLI_TIMEOUT_MS,
    },Object.values(directMaestroTools).filter(value=>typeof value==="string"&&existsSync(value)));
    assert.equal(final.status, 0, final.stderr);
    assert.equal(JSON.parse(final.stdout).mode, "final");
    assert.equal(JSON.parse(final.stdout).rows, 172);
    assert.equal(JSON.parse(final.stdout).readiness, "NOT_READY");
    assert.equal(JSON.parse(final.stdout).release_authorized, false);
    process.stderr.write("[current verifier phases] after final\n");
    const finalPublicationRelative = `artifacts/native/v1.2/${runId}/publication/final.json`;
    const finalPublication = JSON.parse(readFileSync(path.join(root, finalPublicationRelative), "utf8"));
    const finalStage = path.join(runRoot, ".staging/final");
    mkdirSync(finalStage, { recursive: true });
    for (const member of finalPublication.members) {
      const source = path.join(runRoot, member.artifact);
      const staged = path.join(finalStage, member.artifact);
      mkdirSync(path.dirname(staged), { recursive: true });
      copyFileSync(source, staged);
      rmSync(source);
    }
    writeFileSync(path.join(finalStage, "manifest.json"), `${JSON.stringify(finalPublication)}\n`);
    rmSync(path.join(root, finalPublicationRelative));
    const recoveryScript = [
      `import assert from "node:assert/strict";`,
      `import { recoverV12FinalPublication } from ${JSON.stringify(new URL("../verify-v12-native-evidence.mjs", import.meta.url).href)};`,
      "assert.equal(recoverV12FinalPublication(process.argv[1], process.argv[2]), true);",
    ].join("\n");
    process.stderr.write("[current verifier phases] before recovery\n");
    const recovery = runCapturedHostPhase("recovery",process.execPath, ["--input-type=module", "--eval", recoveryScript, root, runId], {
      cwd: root,
      encoding: "utf8",
      env: liveEnvironment,
      maxBuffer: 1024 * 1024 * 1024,
      timeout: RETAINED_CLI_TIMEOUT_MS,
    },Object.values(directMaestroTools).filter(value=>typeof value==="string"&&existsSync(value)));
    assert.equal(recovery.status, 0, recovery.stderr);
    process.stderr.write("[current verifier phases] after recovery\n");
    process.stderr.write("[current verifier phases] before existing final verification\n");
    const replay=runCapturedHostPhase("existing-final",process.execPath,[verifier,"--run",runId,"--mode","final"],{
      cwd:root,encoding:"utf8",env:liveEnvironment,maxBuffer:1024*1024*1024,timeout:RETAINED_CLI_TIMEOUT_MS,
    },Object.values(directMaestroTools).filter(value=>typeof value==="string"&&existsSync(value)));
    assert.equal(replay.status,0,replay.stderr);
    const replayed=JSON.parse(replay.stdout);
    assert.equal(replayed.recovered,true);
    assert.equal(replayed.rows,172);
    assert.equal(replayed.readiness,"NOT_READY");
    assert.equal(replayed.release_authorized,false);
    process.stderr.write("[current verifier phases] after existing final verification\n");
    process.stderr.write("[current verifier phases] preseal, final, and recovery assertions passed\n");
    publicPhasesPassed = true;
  } catch (error) {
    process.stderr.write(`[retained verifier test] body failure: ${error.message}\n`);
    throw error;
  } finally {
    if (publicPhasesPassed && process.env.V12_RETAIN_PHASE_FIXTURE === "1") {
      writeFileSync(path.join(process.env.V12_RESUME_CAPTURE_DIR,"synthetic-phase-fixture-origin.json"),`${JSON.stringify({
        schema_version:1,test_only:true,native_acceptance_authority:false,production_dependency_equality_claimed:false,
        fixture_root:root,run_id:runId,source_root:sourceRoot,actual_subject_sha256:sha256(readFileSync(new URL("../verify-v12-native-evidence.mjs",import.meta.url))),
        synthetic_tools:true,readiness:"NOT_READY",release_authorized:false,
      },null,2)}\n`);
    } else {
    for (const output of [
      `artifacts/native/v1.2/${runId}/preseal-validation.json`,
      `artifacts/native/v1.2/${runId}/publication/preseal.json`,
      `artifacts/native/v1.2/${runId}/ui-state-matrix.json`,
      `artifacts/native/v1.2/${runId}/final-evidence.json`,
      `artifacts/native/v1.2/${runId}/parity-report.md`,
      `artifacts/native/v1.2/${runId}/readiness-handoff.md`,
      `artifacts/native/v1.2/${runId}/publication/final.json`,
      `artifacts/native/v1.2/${runId}/publication/rollback.json`,
      `artifacts/native/v1.2/${runId}/rollback`,
      ".planning/phases/20-native-acceptance/20-READINESS-HANDOFF.md",
    ]) rmSync(path.join(root, output), { recursive: true, force: true });
    for (const [relative, bytes] of saved) {
      const file = path.join(root, relative);
      if (bytes === null) rmSync(file, { recursive: true, force: true });
      else {
        mkdirSync(path.dirname(file), { recursive: true });
        if (existsSync(file)) chmodSync(file, 0o600);
        writeFileSync(file, bytes);
        if (savedModes.has(relative)) chmodSync(file, savedModes.get(relative));
      }
    }
    for (const directory of protectedRuntimeDirectories) mkdirSync(directory, { recursive: true });
    for (const target of created.reverse()) rmSync(target, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
    }
  }
});
