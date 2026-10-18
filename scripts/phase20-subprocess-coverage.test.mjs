import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";

import {
  collectPhase20SubprocessCoverage,
  runPhase20SubprocessCoverage,
} from "./phase20-subprocess-coverage.mjs";
import { buildV12ReadinessHandoff } from "./create-v12-readiness-handoff.mjs";
import { publishV12AtomicShard, verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";
import { createV12RunManifest } from "./create-v12-run-manifest.mjs";
import {
  createV12NativeAdapter,
  invokeV12NativeAdapter,
  superviseV12NativeProcess,
} from "./v12-native-adapter.mjs";
import {
  readV12RetainedGitExecution,
  resolveV12GitExecution,
  resolveV12NativeExecutionTools,
} from "./v12-native-execution-origin.mjs";
import {
  publishV12RollbackEvidence,
  v12RollbackErrorMessage,
  verifyV12RollbackEvidence,
} from "./v12-rollback-evidence.mjs";
import {
  createV12DirectMaestroToolAttestation,
  readV12DirectMaestroDeviceMeasurement,
} from "./run-v12-maestro.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import { executeV12SqliteShardCli } from "./v12-sqlite-shard.mjs";
import {
  executeLiveV12VisualCapture,
  executeV12VisualCapture,
} from "./capture-v12-visual.mjs";
import {
  executeV12VisualComparison,
  validateV12ComparisonShard,
  verifyV12ComparisonRecord,
} from "./compare-v12-visual.mjs";
import {
  executeV12VisualStreamingShard,
  iterateV12VisualJsonArray,
  readV12VisualJsonHeader,
} from "./v12-visual-streaming.mjs";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import {
  V12_NATIVE_PROVENANCE_REGISTRY,
  executeV12EvidenceCli,
  validateV12FinalProductionIdentity,
  verifyV12FinalNativeIdentity,
} from "./verify-v12-native-evidence.mjs";

const RETAINED_CLI_TIMEOUT_MS = 10 * 60_000;
const PHASE20_RUN_ID = "phase20-20261018T000000Z-aaaaaaaaaaaa";
const sha256 = value => createHash("sha256").update(value).digest("hex");

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

test("subprocess coverage merges canonical child-process V8 ranges at 100 percent", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-subprocess-coverage-"));
  try {
    const relativePath = "integrity.mjs";
    const target = path.join(root, relativePath);
    const rawDirectory = path.join(root, "raw");
    mkdirSync(rawDirectory);
    writeFileSync(target, [
      "export function classify(value) {",
      "  if (value) return 'yes';",
      "  return 'no';",
      "}",
      "classify(true);",
      "classify(false);",
      "",
    ].join("\n"));
    const run = spawnSync(process.execPath, [target], {
      cwd: root,
      env: { ...process.env, NODE_V8_COVERAGE: rawDirectory },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(run.status, 0, run.stderr);

    const report = await collectPhase20SubprocessCoverage({
      projectRoot: root,
      rawDirectory,
      targetFiles: [relativePath],
    });
    assert.deepEqual(report.failures, []);
    assert.deepEqual(
      ["statements", "branches", "functions", "lines"]
        .map((metric) => report.files[relativePath][metric].pct),
      [100, 100, 100, 100],
    );
    assert.deepEqual(report.files[relativePath].uncovered_lines, []);

    const imported = await import(pathToFileURL(target).href);
    assert.equal(imported.classify(true), "yes");
    assert.equal(imported.classify(false), "no");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("coverage is isolated to each project's exact tests", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-isolation-"));
  try {
    writeFileSync(path.join(root, "a.mjs"), "export const a = () => 'a';\n");
    writeFileSync(path.join(root, "b.mjs"), "export const b = () => 'b';\n");
    writeFileSync(path.join(root, "a.test.mjs"), [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { a } from './a.mjs';",
      "import { b } from './b.mjs';",
      "test('covers both modules in project a', () => { assert.equal(a(), 'a'); assert.equal(b(), 'b'); });",
      "",
    ].join("\n"));
    writeFileSync(path.join(root, "b.test.mjs"), [
      "import test from 'node:test';",
      "test('does not import module b', () => {});",
      "",
    ].join("\n"));

    await assert.rejects(
      runPhase20SubprocessCoverage({
        projectRoot: root,
        projects: [
          { name: "a", concurrency: 1, modules: ["a.mjs"], tests: ["a.test.mjs"] },
          { name: "b", concurrency: 1, modules: ["b.mjs"], tests: ["b.test.mjs"] },
        ],
        outputDirectory: path.join(root, "coverage"),
        maxParallel: 1,
      }),
      /b\.mjs: no coverage data/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("coverage projects fail closed on missing modules and tests", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-contract-"));
  try {
    writeFileSync(path.join(root, "target.mjs"), "export const value = 1;\n");
    writeFileSync(path.join(root, "target.test.mjs"), "import test from 'node:test'; test('ok', () => {});\n");
    await assert.rejects(
      runPhase20SubprocessCoverage({
        projectRoot: root,
        projects: [{ name: "missing-module", modules: ["missing.mjs"], tests: ["target.test.mjs"] }],
        outputDirectory: path.join(root, "missing-module-coverage"),
      }),
      /phase20_coverage_module_missing:missing-module:missing\.mjs/u,
    );
    await assert.rejects(
      runPhase20SubprocessCoverage({
        projectRoot: root,
        projects: [{ name: "missing-test", modules: ["target.mjs"], tests: ["missing.test.mjs"] }],
        outputDirectory: path.join(root, "missing-test-coverage"),
      }),
      /phase20_coverage_test_missing:missing-test:missing\.test\.mjs/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("child-only coverage instruments production CLI descendants without instrumenting the test worker", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-child-only-coverage-"));
  try {
    mkdirSync(path.join(root, "scripts"));
    writeFileSync(path.join(root, "scripts/target.mjs"), [
      "export function classify(value) { return value ? 'yes' : 'no'; }",
      "classify(true);",
      "classify(false);",
      "",
    ].join("\n"));
    writeFileSync(path.join(root, "target.test.mjs"), [
      "import assert from 'node:assert/strict';",
      "import { spawnSync } from 'node:child_process';",
      "import path from 'node:path';",
      "import test from 'node:test';",
      "test('runs the production CLI child', () => {",
      "  const result = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts/target.mjs')], { encoding: 'utf8' });",
      "  assert.equal(result.status, 0, result.stderr);",
      "});",
      "",
    ].join("\n"));
    await runPhase20SubprocessCoverage({
      projectRoot: root,
      projects: [{
        name: "child-only",
        coverage: "children",
        modules: ["scripts/target.mjs"],
        tests: ["target.test.mjs"],
      }],
      outputDirectory: path.join(root, "coverage"),
      maxParallel: 1,
    });
    const summary = JSON.parse(readFileSync(path.join(root, "coverage/coverage-summary.json"), "utf8"));
    assert.deepEqual(
      ["statements", "branches", "functions", "lines"]
        .map((metric) => summary["scripts/target.mjs"][metric].pct),
      [100, 100, 100, 100],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readiness handoff derives READY only from 172 PASS rows and verified rollback", () => {
  const runId = "phase20-20261018T000000Z-aaaaaaaaaaaa";
  const hash = (character) => character.repeat(64);
  const phaseCounts = [[13, 17], [14, 13], [15, 36], [16, 23], [17, 36], [18, 16], [19, 18], [20, 13]];
  const rows = phaseCounts.flatMap(([phase, count]) => Array.from({ length: count }, (_, index) => ({
    inventory_id: `INV-${String(phase)}-${String(index + 1).padStart(2, "0")}`,
    requirement_id: `REQ-${String(phase)}-${String(index + 1).padStart(2, "0")}`,
    owning_phase: phase,
    coverage_class: "automated",
    verdict: "PASS",
    observations: [],
  })));
  const evidenceHashes = rows.map((_, index) => createHash("sha256").update(`ready-${String(index)}`).digest("hex"));
  const finalEvidence = {
    schema_version: 3,
    run_id: runId,
    evidence_origin: "native",
    identity: {
      run_id: runId,
      source_tree_sha256: hash("1"),
      apk_sha256: hash("2"),
      apk_signature_sha256: hash("3"),
      installed_apk_sha256: hash("2"),
      device_sha256: hash("4"),
      config_sha256: hash("5"),
    },
    rows,
    source_results: rows.map((row, index) => ({ row_id: row.requirement_id, evidence_sha256: evidenceHashes[index] })),
    evidence_hashes: evidenceHashes,
    gates: [
      { id: "identity", verdict: "PASS", evidence_sha256: hash("6") },
      { id: "automated", verdict: "PASS", evidence_sha256: hash("7") },
    ],
    readiness: "READY",
    verdict_counts: { PASS: 172, ACCEPTED_EXCEPTION: 0, NOT_RUN: 0, FAIL: 0, REVIEW_REQUIRED: 0, N_A_REVIEWED: 0 },
    accepted_exception_count: 0,
    release_authorized: false,
    policy: null,
    exceptions: [],
  };
  const handoff = buildV12ReadinessHandoff({
    final_evidence: finalEvidence,
    reviewed_policy: null,
    rollback: {
      prior_release_manifest_sha256: hash("7"),
      prior_signed_apk_sha256: hash("8"),
      prior_apk_signature_sha256: hash("9"),
      prior_apk_certificate_sha256: hash("a"),
      compatible_archive_sha256: hash("b"),
      clean_restore_receipt_sha256: hash("c"),
      post_restore_facts_sha256: hash("d"),
      compatible_archive_format_version: 9,
      last_valid_schema_version: 44,
      current_schema_version: 45,
      newer_schema_committed: true,
      recovery_boundary: "compatible_restore_or_forward_fix",
      rollback_evidence_sha256: hash("e"),
    },
    generated_at: "2026-10-18T00:00:00.000Z",
  });
  assert.equal(handoff.readiness, "READY");
  assert.equal(handoff.release_authorized, false);
  const cliRoot = atomicFixture();
  try {
    publishV12AtomicShard({
      root: cliRoot.root,
      runId,
      shard: "final",
      produce: ({ write }) => {
        write("ui-state-matrix.json", { schema_version: 3, run_id: runId });
        write("final-evidence.json", finalEvidence);
        write("parity-report.md", "Phase 20 parity report\n");
        write("readiness-handoff.md", handoff);
      },
    });
    const fallback = spawnSync(process.execPath, [
      `--import=${pathToFileURL(nonErrorStdoutPreload(cliRoot.root)).href}`,
      new URL("./create-v12-readiness-handoff.mjs", import.meta.url).pathname,
      "--run", runId, "--verify",
    ], { cwd: cliRoot.root, encoding: "utf8", timeout: 10_000 });
    assert.equal(fallback.status, 1);
    assert.match(fallback.stderr, /^v12_readiness_invalid\s*$/u);
  } finally {
    rmSync(cliRoot.root, { recursive: true, force: true });
  }
});

test("rollback evidence enforces every supported archive generation and the real signature subprocess", () => {
  const compatible = [[10, 45], [9, 44], [8, 42], [7, 41], [6, 39], [5, 31], [4, 30], [3, 28], [2, 27]];
  for (const [formatVersion, schemaVersion] of compatible) {
    const fixture = rollbackFixture(formatVersion, schemaVersion);
    try {
      publishV12RollbackEvidence({
        root: fixture.root,
        runId: PHASE20_RUN_ID,
        priorApkPath: fixture.priorApk,
        priorReleaseManifestPath: fixture.priorReleaseManifest,
        compatibleArchivePath: fixture.archive,
        lastValidSchemaVersion: schemaVersion,
        verifyApkSignature: fixture.verifyApkSignature,
        authenticateAndRestoreArchive: fixture.authenticateAndRestoreArchive,
      });
      assert.equal(
        verifyV12RollbackEvidence({
          root: fixture.root,
          runId: PHASE20_RUN_ID,
          verifyApkSignature: fixture.verifyApkSignature,
        }).compatible_archive_format_version,
        formatVersion,
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  const fixture = rollbackFixture(9, 44);
  try {
    const sdk = path.join(fixture.root, "sdk");
    executable(path.join(sdk, "build-tools/36.0.0/apksigner"), `#!/bin/sh\nprintf '%b' ${JSON.stringify(fixture.report.toString("utf8"))}\n`);
    const environment = { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
    publishV12RollbackEvidence({
      root: fixture.root,
      runId: PHASE20_RUN_ID,
      priorApkPath: fixture.priorApk,
      priorReleaseManifestPath: fixture.priorReleaseManifest,
      compatibleArchivePath: fixture.archive,
      lastValidSchemaVersion: 44,
      environment,
      authenticateAndRestoreArchive: fixture.authenticateAndRestoreArchive,
    });
    assert.equal(verifyV12RollbackEvidence({
      root: fixture.root,
      runId: PHASE20_RUN_ID,
      environment,
    }).prior_apk_certificate_sha256, "ab".repeat(32));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }

  const cliFixture = rollbackFixture(9, 44);
  try {
    const cliSdk = path.join(cliFixture.root, "sdk");
    executable(path.join(cliSdk, "build-tools/36.0.0/apksigner"), `#!/bin/sh\nprintf '%b' ${JSON.stringify(cliFixture.report.toString("utf8"))}\n`);
    const cli = spawnSync(process.execPath, [
      new URL("./v12-rollback-evidence.mjs", import.meta.url).pathname,
      "--run", PHASE20_RUN_ID,
      "--prior-apk", cliFixture.priorApk,
      "--prior-manifest", cliFixture.priorReleaseManifest,
      "--archive", cliFixture.archive,
      "--last-valid-schema", "44",
    ], {
      cwd: cliFixture.root,
      encoding: "utf8",
      env: { ...process.env, ANDROID_HOME: cliSdk, ANDROID_SDK_ROOT: cliSdk },
      timeout: 10_000,
    });
    assert.equal(cli.status, 1, cli.stderr);
    assert.match(cli.stderr, /^v12_rollback_restore_parser_required\s*$/u);
    const fallback = spawnSync(process.execPath, [
      `--import=${pathToFileURL(nonErrorStdoutPreload(cliFixture.root)).href}`,
      new URL("./v12-rollback-evidence.mjs", import.meta.url).pathname,
      "--run", PHASE20_RUN_ID,
      "--prior-apk", cliFixture.priorApk,
      "--prior-manifest", cliFixture.priorReleaseManifest,
      "--archive", cliFixture.archive,
      "--last-valid-schema", "44",
    ], {
      cwd: cliFixture.root,
      encoding: "utf8",
      env: { ...process.env, ANDROID_HOME: cliSdk, ANDROID_SDK_ROOT: cliSdk },
      timeout: 10_000,
    });
    assert.equal(fallback.status, 1);
    assert.match(fallback.stderr, /^v12_rollback_restore_parser_required\s*$/u);
    assert.equal(v12RollbackErrorMessage(new Error("v12_rollback_expected")), "v12_rollback_expected");
    assert.equal(v12RollbackErrorMessage("non-error"), "v12_rollback_failed");
  } finally {
    rmSync(cliFixture.root, { recursive: true, force: true });
  }

  const missing = rollbackFixture(9, 44);
  try {
    assert.throws(() => publishV12RollbackEvidence({
      root: missing.root,
      runId: PHASE20_RUN_ID,
      priorApkPath: path.join(missing.root, "missing.apk"),
      compatibleArchivePath: missing.archive,
      lastValidSchemaVersion: 44,
      verifyApkSignature: missing.verifyApkSignature,
    }), /v12_rollback_artifact_invalid/u);
  } finally {
    rmSync(missing.root, { recursive: true, force: true });
  }
});

test("atomic publication covers stale stages, residue recovery, races, and special-file rejection", () => {
  const stale = atomicFixture();
  try {
    const stage = path.join(stale.runRoot, ".staging/sqlite");
    mkdirSync(stage, { recursive: true });
    writeFileSync(path.join(stage, "stale.json"), "stale\n");
    assert.equal(publishV12AtomicShard({
      root: stale.root,
      runId: PHASE20_RUN_ID,
      shard: "sqlite",
      produce: ({ write }) => write("sqlite/result.json", { ok: true }),
    }).manifest.completed, true);

    mkdirSync(stage, { recursive: true });
    copyFileSync(
      path.join(stale.runRoot, "publication/sqlite.json"),
      path.join(stage, "manifest.json"),
    );
    assert.equal(publishV12AtomicShard({
      root: stale.root,
      runId: PHASE20_RUN_ID,
      shard: "sqlite",
      produce: () => assert.fail("published residue recovery must not produce"),
    }).manifest.completed, true);
  } finally {
    rmSync(stale.root, { recursive: true, force: true });
  }

  const existingTarget = atomicFixture();
  try {
    const bytes = Buffer.from('{"ok":true}\n');
    assert.equal(publishV12AtomicShard({
      root: existingTarget.root,
      runId: PHASE20_RUN_ID,
      shard: "calendar",
      produce: ({ write }) => {
        write("calendar/result.json", bytes);
        mkdirSync(path.join(existingTarget.runRoot, "calendar"), { recursive: true });
        writeFileSync(path.join(existingTarget.runRoot, "calendar/result.json"), bytes);
      },
    }).manifest.completed, true);
  } finally {
    rmSync(existingTarget.root, { recursive: true, force: true });
  }

  for (const validRace of [true, false]) {
    const race = atomicFixture();
    const originalLinkSync = fs.linkSync;
    let injected = false;
    try {
      fs.linkSync = (source, target) => {
        if (!injected && target.endsWith("race/result.json")) {
          injected = true;
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, validRace ? readFileSync(source) : "conflict\n");
          const error = new Error("simulated no-clobber race");
          error.code = "EEXIST";
          throw error;
        }
        return originalLinkSync(source, target);
      };
      syncBuiltinESMExports();
      const publish = () => publishV12AtomicShard({
        root: race.root,
        runId: PHASE20_RUN_ID,
        shard: "race",
        produce: ({ write }) => write("race/result.json", { ok: true }),
      });
      if (validRace) assert.equal(publish().manifest.completed, true);
      else assert.throws(publish, /v12_atomic_publish_output_conflict/u);
    } finally {
      fs.linkSync = originalLinkSync;
      syncBuiltinESMExports();
      rmSync(race.root, { recursive: true, force: true });
    }
  }

  const special = atomicFixture();
  try {
    assert.throws(() => publishV12AtomicShard({
      root: special.root,
      runId: PHASE20_RUN_ID,
      shard: "special",
      produce: ({ write, stage_root: stageRoot }) => {
        write("special/result.json", { ok: true });
        execFileSync("mkfifo", [path.join(stageRoot, "special.pipe")]);
      },
    }), /v12_atomic_publish_(?:stage_member|path)_invalid/u);
  } finally {
    rmSync(special.root, { recursive: true, force: true });
  }
});

test("visual streaming covers staged cleanup, malformed input, residue recovery, and special files", () => {
  const malformedRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-json-")));
  try {
    const missingHeader = path.join(malformedRoot, "missing-header.json");
    const unfinishedArray = path.join(malformedRoot, "unfinished-array.json");
    writeFileSync(missingHeader, "{}\n");
    writeFileSync(unfinishedArray, '{"records":[{"id":"one"}');
    assert.throws(
      () => readV12VisualJsonHeader({ file: missingHeader, firstArrayKey: "records" }),
      /v12_visual_stream_json_invalid/u,
    );
    assert.throws(
      () => [...iterateV12VisualJsonArray({ file: unfinishedArray, arrayKey: "records" })],
      /v12_visual_stream_json_invalid/u,
    );
  } finally {
    rmSync(malformedRoot, { recursive: true, force: true });
  }

  const cleanupRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-cleanup-")));
  try {
    const stage = path.join(cleanupRoot, "artifacts/native/v1.2", PHASE20_RUN_ID, ".staging/visual");
    mkdirSync(path.join(stage, "pending-dir"), { recursive: true });
    writeFileSync(path.join(stage, "pending.txt"), "pending\n");
    writeFileSync(path.join(stage, "pending-dir/value.txt"), "pending\n");
    const result = executeV12VisualStreamingShard(streamingOptions(cleanupRoot, {
      cleanupPending: ({ remove }) => {
        remove("pending.txt");
        remove("pending-dir", { recursive: true });
      },
    }));
    assert.equal(result.capture_count, 1);

    const journal = path.join(cleanupRoot, "artifacts/native/v1.2", PHASE20_RUN_ID, ".visual-stream/visual");
    mkdirSync(journal, { recursive: true });
    writeFileSync(path.join(journal, "stale.tmp-1"), "stale\n");
    mkdirSync(stage, { recursive: true });
    assert.equal(executeV12VisualStreamingShard(streamingOptions(cleanupRoot)).resumed, true);
    assert.equal(existsSync(journal), false);
    assert.equal(existsSync(stage), false);
  } finally {
    rmSync(cleanupRoot, { recursive: true, force: true });
  }

  const invalidBuildRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-build-")));
  try {
    const runRoot = path.join(invalidBuildRoot, "artifacts/native/v1.2", PHASE20_RUN_ID);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(path.join(runRoot, "build.json"), "not-json\n");
    assert.throws(
      () => executeV12VisualStreamingShard(streamingOptions(invalidBuildRoot)),
      /v12_visual_stream_build_identity_invalid/u,
    );
  } finally {
    rmSync(invalidBuildRoot, { recursive: true, force: true });
  }

  const specialRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-special-")));
  try {
    const stage = path.join(specialRoot, "artifacts/native/v1.2", PHASE20_RUN_ID, ".staging/visual");
    assert.throws(() => executeV12VisualStreamingShard(streamingOptions(specialRoot, {
      processWindow: ({ offset, ordinal, write }) => {
        write("visual/record-1.json", { id: "record-1" });
        execFileSync("mkfifo", [path.join(stage, "special.pipe")]);
        return { records: [{ id: "record-1" }], window: { offset, ordinal, count: 1 } };
      },
    })), /v12_visual_stream_(?:path|stage_member)_invalid/u);
  } finally {
    rmSync(specialRoot, { recursive: true, force: true });
  }
});

test("visual streaming covers abrupt journal, manifest-tail, replay, race, and staged-manifest recovery", () => {
  const crashRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-crash-")));
  try {
    mkdirSync(path.join(crashRoot, "artifacts/native/v1.2", PHASE20_RUN_ID), { recursive: true });
    const program = [
      `import { executeV12VisualStreamingShard } from ${JSON.stringify(new URL("./v12-visual-streaming.mjs", import.meta.url).href)};`,
      "import { createHash } from 'node:crypto';",
      "const root = process.argv[1], runId = process.argv[2];",
      "executeV12VisualStreamingShard({ root, runId, shard: 'visual', totalCount: 1, batchWindow: 1, indexRelative: 'visual/index.json', indexHeader: {schema_version:1,producer:'coverage',run_id:runId}, resultKey: 'records', expectedWindow: () => [{id:'record-1'}], processWindow: ({offset,ordinal,write}) => { write('visual/record-1.json',{id:'record-1'}); return {records:[{id:'record-1'}],window:{offset,ordinal,count:1}}; }, validateBatch: () => true, uniqueKey: value => createHash('sha256').update(value.id).digest('hex'), onWindowCommitted: () => process.exit(86) });",
    ].join("\n");
    const crashed = spawnSync(process.execPath, ["--input-type=module", "--eval", program, crashRoot, PHASE20_RUN_ID], {
      cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
    });
    assert.equal(crashed.status, 86, crashed.stderr);
    writeFileSync(path.join(crashRoot, `artifacts/native/v1.2/${PHASE20_RUN_ID}/.visual-stream/visual/unknown.bin`), "unknown\n");
    assert.throws(
      () => executeV12VisualStreamingShard(streamingOptions(crashRoot)),
      /v12_visual_stream_journal_invalid/u,
    );
  } finally {
    rmSync(crashRoot, { recursive: true, force: true });
  }

  const tailRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-tail-")));
  try {
    const publication = path.join(tailRoot, `artifacts/native/v1.2/${PHASE20_RUN_ID}/publication`);
    mkdirSync(publication, { recursive: true });
    const incompleteManifest = JSON.stringify({
      schema_version: 1,
      producer: "v12-atomic-shard-publication/v1",
      run_id: PHASE20_RUN_ID,
      shard: "visual",
      completed: false,
      members: [],
    });
    writeFileSync(
      path.join(publication, "visual.json"),
      `${incompleteManifest.slice(0, -1)},"completed":true}\n`,
    );
    assert.throws(
      () => executeV12VisualStreamingShard(streamingOptions(tailRoot)),
      /v12_visual_stream_manifest_invalid/u,
    );
  } finally {
    rmSync(tailRoot, { recursive: true, force: true });
  }

  const replayRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-replay-")));
  const originalExistsSync = fs.existsSync;
  try {
    mkdirSync(path.join(replayRoot, "artifacts/native/v1.2", PHASE20_RUN_ID), { recursive: true });
    assert.equal(executeV12VisualStreamingShard(streamingOptions(replayRoot)).capture_count, 1);
    const finalManifest = path.join(replayRoot, `artifacts/native/v1.2/${PHASE20_RUN_ID}/publication/visual.json`);
    let hidden = false;
    fs.existsSync = (file) => {
      if (!hidden && path.resolve(file) === path.resolve(finalManifest)) {
        hidden = true;
        return false;
      }
      return originalExistsSync(file);
    };
    syncBuiltinESMExports();
    assert.equal(executeV12VisualStreamingShard(streamingOptions(replayRoot)).capture_count, 1);
  } finally {
    fs.existsSync = originalExistsSync;
    syncBuiltinESMExports();
    rmSync(replayRoot, { recursive: true, force: true });
  }

  for (const validRace of [true, false]) {
    const raceRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-race-")));
    const originalLinkSync = fs.linkSync;
    let injected = false;
    try {
      mkdirSync(path.join(raceRoot, "artifacts/native/v1.2", PHASE20_RUN_ID), { recursive: true });
      fs.linkSync = (source, target) => {
        if (!injected && target.endsWith("visual/record-1.json")) {
          injected = true;
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, validRace ? readFileSync(source) : "conflict\n");
          const error = new Error("simulated streaming EEXIST");
          error.code = "EEXIST";
          throw error;
        }
        return originalLinkSync(source, target);
      };
      syncBuiltinESMExports();
      const execute = () => executeV12VisualStreamingShard(streamingOptions(raceRoot));
      if (validRace) assert.equal(execute().capture_count, 1);
      else assert.throws(execute, /v12_visual_stream_output_conflict/u);
    } finally {
      fs.linkSync = originalLinkSync;
      syncBuiltinESMExports();
      rmSync(raceRoot, { recursive: true, force: true });
    }
  }

  const stagedRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-staged-")));
  const originalLinkSync = fs.linkSync;
  let blocked = false;
  try {
    mkdirSync(path.join(stagedRoot, "artifacts/native/v1.2", PHASE20_RUN_ID), { recursive: true });
    fs.linkSync = (source, target) => {
      if (!blocked && target.endsWith("publication/visual.json")) {
        blocked = true;
        throw new Error("simulated final publication failure");
      }
      return originalLinkSync(source, target);
    };
    syncBuiltinESMExports();
    assert.throws(
      () => executeV12VisualStreamingShard(streamingOptions(stagedRoot)),
      /simulated final publication failure/u,
    );
    fs.linkSync = originalLinkSync;
    syncBuiltinESMExports();
    assert.equal(executeV12VisualStreamingShard(streamingOptions(stagedRoot)).resumed, true);
  } finally {
    fs.linkSync = originalLinkSync;
    syncBuiltinESMExports();
    rmSync(stagedRoot, { recursive: true, force: true });
  }
});

test("production tool and retained Git resolution exercise pinned SDK and fail-closed filesystem paths", () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-origin-coverage-")));
  try {
    const sdk = path.join(root, "artifacts/sdk");
    const javaHome = path.join(root, "java");
    executable(path.join(sdk, "platform-tools/adb"));
    executable(path.join(javaHome, "bin/java"));
    const tools = resolveV12NativeExecutionTools({
      requiredTools: ["adb", "java"],
      env: { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: javaHome },
    });
    assert.equal(tools.adb, realpathSync(path.join(sdk, "platform-tools/adb")));
    assert.equal(tools.java, realpathSync(path.join(javaHome, "bin/java")));
    const hostTools = resolveV12NativeExecutionTools({ requiredTools: ["unzip", "git"], env: {} });
    assert.equal(hostTools.unzip, realpathSync("/usr/bin/unzip"));
    assert.equal(hostTools.git, realpathSync("/usr/bin/git"));
    rmSync(path.join(sdk, "platform-tools/adb"));
    mkdirSync(path.join(sdk, "platform-tools/adb"));
    assert.throws(() => resolveV12NativeExecutionTools({
      requiredTools: ["adb"],
      env: { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
    }), /adb_missing/u);
    assert.throws(() => resolveV12NativeExecutionTools({
      requiredTools: ["adb"],
      env: {
        V12_EXECUTION_ORIGIN: "test-controlled/v1",
        V12_ADB_PATH: path.join(root, "missing-controlled-adb"),
      },
    }), /test_toolchain_invalid/u);
    assert.throws(() => readV12RetainedGitExecution({
      root,
      runManifest: { source: { head: "a".repeat(40), tree_sha256: "b".repeat(64) }, build: { apk: { sha256: "c".repeat(64) } } },
    }), /git_attestation_invalid/u);
    mkdirSync(path.join(root, "artifacts/native/v1.2-acceptance"), { recursive: true });
    writeFileSync(path.join(root, "artifacts/native/v1.2-acceptance/build.json"), "not-json\n");
    assert.throws(() => readV12RetainedGitExecution({
      root,
      runManifest: { source: { head: "a".repeat(40), tree_sha256: "b".repeat(64) }, build: { apk: { sha256: "c".repeat(64) } } },
    }), /git_attestation_invalid/u);

    const home = path.join(root, "home");
    executable(path.join(home, ".local/bin/maestro"));
    const child = spawnSync(process.execPath, ["--input-type=module", "--eval", [
      `import { resolveV12NativeExecutionTools } from ${JSON.stringify(new URL("./v12-native-execution-origin.mjs", import.meta.url).href)};`,
      "const tools = resolveV12NativeExecutionTools({ requiredTools: ['maestro'], env: process.env });",
      "if (!tools.maestro.endsWith('/.local/bin/maestro')) process.exitCode = 1;",
    ].join("\n")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, HOME: home },
      timeout: 10_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const missingMaestro = spawnSync(process.execPath, ["--input-type=module", "--eval", [
      `import { resolveV12NativeExecutionTools } from ${JSON.stringify(new URL("./v12-native-execution-origin.mjs", import.meta.url).href)};`,
      "try { resolveV12NativeExecutionTools({ requiredTools: ['maestro'], env: process.env }); process.exitCode = 1; }",
      "catch (error) { if (!String(error.message).includes('maestro_missing')) process.exitCode = 1; }",
    ].join("\n")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, HOME: path.join(root, "empty-home") },
      timeout: 10_000,
    });
    assert.equal(missingMaestro.status, 0, missingMaestro.stderr);
    const attestationCli = spawnSync(process.execPath, [
      new URL("./v12-native-execution-origin.mjs", import.meta.url).pathname,
      "--git-attestation",
    ], { cwd: root, encoding: "utf8", timeout: 10_000 });
    assert.equal(attestationCli.status, 0, attestationCli.stderr);
    assert.equal(JSON.parse(attestationCli.stdout).action, "source-control");
    const fallback = spawnSync(process.execPath, [
      `--import=${pathToFileURL(nonErrorStdoutPreload(root)).href}`,
      new URL("./v12-native-execution-origin.mjs", import.meta.url).pathname,
      "--git-path",
    ], { cwd: root, encoding: "utf8", timeout: 10_000 });
    assert.equal(fallback.status, 1);
    assert.match(fallback.stderr, /^v12_production_native_launcher_failed\s*$/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the native adapter object exercises every action wrapper against the checked-in subprocess fake", {
  skip: process.env.V12_PHASE20_COVERAGE_FIXTURE === undefined,
  timeout: 5 * 60_000,
}, async () => {
  const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;
  const runId = readdirSync(path.join(root, "artifacts/native/v1.2"))
    .find((entry) => entry.startsWith("phase20-"));
  assert.ok(runId);
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess",
    V12_NATIVE_ADAPTER_TEST_PROCESS: "1",
    V12_NATIVE_ADAPTER_COMMAND: path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"),
    V12_EXECUTION_ORIGIN: "test-controlled/v1",
  };
  const adapter = createV12NativeAdapter({ root, environment, runId });
  await assert.rejects(superviseV12NativeProcess({}), /supervisor_invalid/u);
  assert.throws(() => adapter.executionOrigin("sqlite"), /execution_origin_missing/u);
  const lease = adapter.acquireLease();
  const settings = adapter.snapshotSettings(lease);
  assert.equal(adapter.restoreSettings(settings, lease), true);
  assert.equal(adapter.releaseLease(lease), true);
  assert.equal(invokeV12NativeAdapter("release-lease", { run_id: runId, lease }, { root, environment }), true);
  assert.ok(adapter.capture({ state_id: "BW-001", configuration_id: "AP-L-C360-P-F100" }).png.length > 0);
  assert.equal(adapter.captureBatch({ captures: [{ state_id: "BW-001", configuration_id: "AP-L-C360-P-F100" }] }).length, 1);
  assert.equal(adapter.compare({ captures: [{ state_id: "BW-001", configuration_id: "AP-L-C360-P-F100" }] }).length, 1);
  assert.equal(typeof adapter.observeAccessibility({}), "object");
  assert.equal(typeof adapter.collectPerformance({}), "object");
  assert.equal(adapter.executeSqlite({ run_id: runId }).contract.status, "passed");
  assert.ok(adapter.executeRecovery({ run_id: runId }));
  assert.equal(adapter.executeGarmin(lease, settings, { run_id: runId }).execution_origin, "test-controlled/v1");
  assert.throws(
    () => adapter.executeCalendar(lease, settings, { run_id: runId }),
    /v12_native_adapter_command_failed/u,
  );
  assert.ok(adapter.executionOrigin("garmin"));
  const originalArgv = process.argv;
  try {
    process.argv = [...process.argv, "--run", runId];
    assert.equal(createV12NativeAdapter({ root, environment }).releaseLease(lease), true);
  } finally {
    process.argv = originalArgv;
  }
});

test("native adapter supervisor forwards host cancellation through its abort handler", { timeout: 10_000 }, async () => {
  const supervisor = spawn(process.execPath, [
    new URL("./v12-native-adapter.mjs", import.meta.url).pathname,
    "--supervise",
    "10000",
    process.execPath,
    "--input-type=module",
    "--eval",
    "setInterval(() => {}, 1000);",
  ], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  supervisor.stdin.end();
  await delay(100);
  supervisor.kill("SIGTERM");
  const result = await new Promise((resolve, reject) => {
    supervisor.once("error", reject);
    supervisor.once("close", (status, signal) => resolve({ status, signal }));
  });
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
});

test("visual capture and comparison cover malformed PNG, flow, timer, cursor, and producer paths", {
  skip: process.env.V12_PHASE20_COVERAGE_FIXTURE === undefined,
  timeout: 5 * 60_000,
}, () => {
  const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;
  const runId = readdirSync(path.join(root, "artifacts/native/v1.2"))
    .find((entry) => entry.startsWith("phase20-"));
  assert.ok(runId);

  const flow = path.join(root, "maestro/v1.2/multi-plan.yaml");
  const flowBytes = readFileSync(flow);
  try {
    writeFileSync(flow, flowBytes.toString("utf8").replace("appId: com.fchoo.gymtracker.devtest", "appId: invalid.coverage"));
    assert.throws(() => executeV12VisualCapture({ root }), /v12_visual_capture_flow_source_invalid/u);
  } finally {
    writeFileSync(flow, flowBytes);
  }

  const validPng = readFileSync(path.join(
    root,
    `artifacts/native/v1.2/${runId}/screenshots/BW-001/AP-L-C360-P-F100/native.png`,
  ));
  const malformedPng = validPng.subarray(0, validPng.length - 12);
  const malformedRunId = `phase20-20261018T020000Z-${runId.slice(-12)}`;
  try {
    mkdirSync(path.join(root, "artifacts/native/v1.2", malformedRunId), { recursive: true });
    assert.throws(() => executeLiveV12VisualCapture({
      runId: malformedRunId,
      root,
      artifactRoot: root,
      capture: () => assert.fail("batch capture is required"),
      captureAll: ({ captures }) => captures.map(() => ({
        native_execution: "EXECUTED",
        fixture_id: "v12-synthetic-fixtures-r18",
        png: malformedPng,
        settings: { restored: true, privacy: "synthetic-only" },
      })),
    }), /v12_visual_capture_png_invalid/u);
  } finally {
    rmSync(path.join(root, "artifacts/native/v1.2", malformedRunId), { recursive: true, force: true });
  }

  const comparisonIndex = path.join(root, `artifacts/native/v1.2/${runId}/comparison/index.json`);
  const captureIndex = path.join(root, `artifacts/native/v1.2/${runId}/screenshots/index.json`);
  const result = structuredClone(iterateV12VisualJsonArray({ file: comparisonIndex, arrayKey: "results" }).next().value.value);
  const captureRecord = structuredClone(iterateV12VisualJsonArray({ file: captureIndex, arrayKey: "records" }).next().value.value);
  assert.equal(verifyV12ComparisonRecord({ runId, root, artifactRoot: root, result, captureRecord }), true);
  assert.equal(verifyV12ComparisonRecord({ runId, root, artifactRoot: root, result }), true);
  for (const timer of [
    { state: "invalid", revision: 0, remaining_ms: null, ends_at_ms: null },
    { state: "idle", revision: -1, remaining_ms: null, ends_at_ms: null },
    { state: "paused", revision: 0, remaining_ms: -1, ends_at_ms: null },
    { state: "running", revision: 0, remaining_ms: null, ends_at_ms: -1 },
    { state: "running", revision: 0, remaining_ms: 1, ends_at_ms: 1 },
    { state: "paused", revision: 0, remaining_ms: null, ends_at_ms: null },
    { state: "idle", revision: 0, remaining_ms: 1, ends_at_ms: null },
  ]) {
    const changed = structuredClone(result);
    changed.state_receipt.source_receipt.timer = timer;
    assert.throws(
      () => verifyV12ComparisonRecord({ runId, root, artifactRoot: root, result: changed, captureRecord }),
      /v12_visual_compare_state_receipt_invalid/u,
    );
  }
  assert.equal(validateV12ComparisonShard({ schema_version: 3, results: [result] }, {
    root, artifactRoot: root, runId,
  }), true);
  assert.throws(() => validateV12ComparisonShard({ schema_version: 3, results: [result, result] }, {
    root, artifactRoot: root, runId,
  }), /v12_visual_compare_duplicate_invalid/u);

  const cursorRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-comparison-cursors-")));
  try {
    const nativePng = result.artifacts.native.path;
    for (let index = 0; index < 9; index += 1) {
      const artifactRoot = path.join(cursorRoot, String(index));
      const targetIndex = path.join(artifactRoot, `artifacts/native/v1.2/${runId}/screenshots/index.json`);
      const targetPng = path.join(artifactRoot, nativePng);
      mkdirSync(path.dirname(targetIndex), { recursive: true });
      mkdirSync(path.dirname(targetPng), { recursive: true });
      fs.linkSync(captureIndex, targetIndex);
      fs.linkSync(path.join(root, nativePng), targetPng);
      assert.equal(verifyV12ComparisonRecord({ runId, root, artifactRoot, result }), true);
    }
  } finally {
    rmSync(cursorRoot, { recursive: true, force: true });
  }
});

test("comparison cursor cache evicts the oldest of nine retained indexes", {
  skip: process.env.V12_PHASE20_COVERAGE_FIXTURE === undefined,
  timeout: 60_000,
}, () => {
  const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;
  const runId = readdirSync(path.join(root, "artifacts/native/v1.2"))
    .find((entry) => entry.startsWith("phase20-"));
  assert.ok(runId);
  const comparisonIndex = path.join(root, `artifacts/native/v1.2/${runId}/comparison/index.json`);
  const captureIndex = path.join(root, `artifacts/native/v1.2/${runId}/screenshots/index.json`);
  const result = structuredClone(iterateV12VisualJsonArray({ file: comparisonIndex, arrayKey: "results" }).next().value.value);
  const cursorRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-cursor-eviction-")));
  try {
    for (let index = 0; index < 9; index += 1) {
      const artifactRoot = path.join(cursorRoot, String(index));
      const targetIndex = path.join(artifactRoot, `artifacts/native/v1.2/${runId}/screenshots/index.json`);
      const targetPng = path.join(artifactRoot, result.artifacts.native.path);
      mkdirSync(path.dirname(targetIndex), { recursive: true });
      mkdirSync(path.dirname(targetPng), { recursive: true });
      fs.linkSync(captureIndex, targetIndex);
      fs.linkSync(path.join(root, result.artifacts.native.path), targetPng);
      assert.equal(verifyV12ComparisonRecord({ runId, root, artifactRoot, result }), true);
    }
  } finally {
    rmSync(cursorRoot, { recursive: true, force: true });
  }
});

test("visual streaming rejects injected unknown journal and special stage entries", () => {
  const journalRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-journal-entry-")));
  const originalOpendirSync = fs.opendirSync;
  try {
    mkdirSync(path.join(journalRoot, "artifacts/native/v1.2", PHASE20_RUN_ID), { recursive: true });
    let injected = false;
    fs.opendirSync = (directory, options) => {
      if (!injected && directory.endsWith(".visual-stream/visual") && existsSync(path.join(directory, "journal.json"))) {
        injected = true;
        let read = false;
        return {
          readSync: () => read ? null : (read = true, {
            name: "unknown.bin",
            isSymbolicLink: () => false,
            isDirectory: () => false,
            isFile: () => true,
          }),
          closeSync: () => {},
        };
      }
      return originalOpendirSync(directory, options);
    };
    syncBuiltinESMExports();
    assert.throws(
      () => executeV12VisualStreamingShard(streamingOptions(journalRoot)),
      /v12_visual_stream_journal_invalid/u,
    );
  } finally {
    fs.opendirSync = originalOpendirSync;
    syncBuiltinESMExports();
    rmSync(journalRoot, { recursive: true, force: true });
  }

  const stageRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-stream-stage-entry-")));
  try {
    const stage = path.join(stageRoot, `artifacts/native/v1.2/${PHASE20_RUN_ID}/.staging/visual`);
    mkdirSync(path.join(stageRoot, "artifacts/native/v1.2", PHASE20_RUN_ID), { recursive: true });
    let injected = false;
    fs.opendirSync = (directory, options) => {
      if (!injected && path.resolve(directory) === path.resolve(stage) && existsSync(path.join(stage, "manifest.json"))) {
        injected = true;
        let read = false;
        return {
          readSync: () => read ? null : (read = true, {
            name: "special.pipe",
            isSymbolicLink: () => false,
            isDirectory: () => false,
            isFile: () => false,
          }),
          closeSync: () => {},
        };
      }
      return originalOpendirSync(directory, options);
    };
    syncBuiltinESMExports();
    assert.throws(
      () => executeV12VisualStreamingShard(streamingOptions(stageRoot)),
      /v12_visual_stream_path_invalid/u,
    );
  } finally {
    fs.opendirSync = originalOpendirSync;
    syncBuiltinESMExports();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test("SQLite CLI coverage uses every default filesystem and adapter dependency", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-sqlite-cli-coverage-")));
  try {
    const fake = path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs");
    mkdirSync(path.dirname(fake), { recursive: true });
    copyFileSync(new URL("./testing/v12-phase20-blackbox/fake-device-adapter.mjs", import.meta.url), fake);
    writeFileSync(path.join(root, "source.txt"), "phase20 sqlite coverage\n");
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["config", "user.email", "phase20-test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Phase 20 test"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const runId = `phase20-20261018T000000Z-${head.slice(0, 12)}`;
    const digest = sourceTreeSha256(root);
    const manifest = createV12RunManifest({ input: {
      requested_run_id: runId,
      created_at: "2026-10-18T00:00:00Z",
      source: { tree_sha256: digest, head, dirty: false, package_json_sha256: "1".repeat(64), package_lock_sha256: "2".repeat(64) },
      fixtures: { registry_sha256: "3".repeat(64) },
      build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "1.2.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/app.apk", sha256: "4".repeat(64), size_bytes: 1, page_alignment_verified: true, signature_sha256: "5".repeat(64), certificate_sha256: "6".repeat(64) } },
      device: { identity_sha256: "7".repeat(64), abi: "arm64-v8a", installed_apk_sha256: "4".repeat(64), settings_sha256: "8".repeat(64), restoration_sha256: "8".repeat(64) },
      planning: { matrix_sha256: "9".repeat(64), requirements_sha256: "a".repeat(64), source_manifest_sha256: "b".repeat(64), owner_brief_sha256: "c".repeat(64), ui_spec_sha256: "d".repeat(64), deviations_sha256: "e".repeat(64) },
      prototype: { revision: 18, approval_sha256: "f".repeat(64), html_sha256: "0".repeat(64) },
      configuration: { id: "AP-L-C390-P-F100" },
    } });
    const runRoot = path.join(root, "artifacts/native/v1.2", runId);
    mkdirSync(runRoot, { recursive: true });
    writeFileSync(path.join(runRoot, "build.json"), `${JSON.stringify(manifest)}\n`);
    const environment = {
      ...process.env,
      NODE_ENV: "test",
      V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess",
      V12_NATIVE_ADAPTER_TEST_PROCESS: "1",
      V12_NATIVE_ADAPTER_COMMAND: realpathSync(new URL("./testing/v12-phase20-blackbox/fake-device-adapter.mjs", import.meta.url)),
      V12_EXECUTION_ORIGIN: "test-controlled/v1",
    };
    const environmentKeys = [
      "NODE_ENV", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS",
      "V12_NATIVE_ADAPTER_COMMAND", "V12_EXECUTION_ORIGIN",
    ];
    const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    try {
      for (const key of environmentKeys) process.env[key] = environment[key];
      const writes = [];
      const direct = await executeV12SqliteShardCli(["--run", runId, "--execute"], {
        root,
        sourceDigest: digest,
        readBuild: () => manifest,
        outputExists: () => false,
        writeObservation: async (name, value) => writes.push([name, value]),
      });
      assert.equal(direct.ok, true);
      assert.equal(writes.length, 3);
    } finally {
      for (const key of environmentKeys) {
        if (previousEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = previousEnvironment[key];
      }
    }
    const execute = spawnSync(process.execPath, [
      new URL("./v12-sqlite-shard.mjs", import.meta.url).pathname,
      "--run", runId, "--execute", "--device", "coverage-device",
    ], {
      cwd: root,
      encoding: "utf8",
      env: environment,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    assert.equal(execute.status, 0, execute.stderr);
    const invalid = spawnSync(process.execPath, [
      new URL("./v12-sqlite-shard.mjs", import.meta.url).pathname,
      "--run", runId, "--invalid",
    ], {
      cwd: root,
      encoding: "utf8",
      env: environment,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    assert.equal(invalid.status, 1);

    const failureCreatedAt = "2026-10-18T00:00:01Z";
    const failureRunId = `phase20-20261018T000001Z-${head.slice(0, 12)}`;
    const failureManifest = createV12RunManifest({ input: {
      ...structuredClone(manifest),
      requested_run_id: failureRunId,
      run_id: undefined,
      created_at: failureCreatedAt,
    } });
    const failureRoot = path.join(root, "artifacts/native/v1.2", failureRunId);
    mkdirSync(failureRoot, { recursive: true });
    writeFileSync(path.join(failureRoot, "build.json"), `${JSON.stringify(failureManifest)}\n`);
    const failed = spawnSync(process.execPath, [
      new URL("./v12-sqlite-shard.mjs", import.meta.url).pathname,
      "--run", failureRunId, "--execute",
    ], {
      cwd: root,
      encoding: "utf8",
      env: { ...environment, V12_FAKE_DEVICE_FAIL: "sqlite" },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    assert.equal(failed.status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("native final identity re-reads Git, APK, signature, installed bytes, settings, and device", () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "phase20-final-identity-")));
  const originalAndroidHome = process.env.ANDROID_HOME;
  const originalAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
  const originalSerial = process.env.V12_DEVICE_SERIAL;
  const originalPath = process.env.PATH;
  try {
    writeFileSync(path.join(root, "source.txt"), "phase20 final identity\n");
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["config", "user.email", "phase20-test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Phase 20 test"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const tree = sourceTreeSha256(root);
    const apkBytes = Buffer.from("504b0304aabbccdd", "hex");
    const apkPath = path.join(root, "artifacts/native/v1.2-acceptance/app.apk");
    mkdirSync(path.dirname(apkPath), { recursive: true });
    writeFileSync(apkPath, apkBytes);
    const signatureReport = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`);
    const sdk = path.join(root, "artifacts/final-sdk");
    executable(
      path.join(sdk, "build-tools/36.0.0/apksigner"),
      `#!/bin/sh\nprintf 'Verified using v2 scheme (APK Signature Scheme v2): true\\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\\n'\n`,
    );
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
      `  *\"sha256sum\"*) printf '${createHash("sha256").update(apkBytes).digest("hex")}  /data/app/coverage/base.apk\\n' ;;`,
      "  *\"font_scale\"*) printf '1.0\\n' ;;",
      "  *\"ui_night_mode\"*) printf '0\\n' ;;",
      "  *\"animator_duration_scale\"*) printf '1.0\\n' ;;",
      "  *\"sh -c\"*) printf 'clear\\n' ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"));
    const serial = "coverage-device";
    const settingsSha256 = createHash("sha256").update("1.0\n0\n1.0\n").digest("hex");
    const manifest = {
      evidence_origin: "native",
      source: { head, tree_sha256: tree },
      build: {
        package: "com.fchoo.gymtracker.devtest",
        apk: {
          path: path.relative(root, apkPath),
          sha256: createHash("sha256").update(apkBytes).digest("hex"),
          size_bytes: apkBytes.length,
          signature_sha256: createHash("sha256").update(signatureReport).digest("hex"),
          certificate_sha256: "ab".repeat(32),
        },
      },
      device: {
        installed_apk_sha256: createHash("sha256").update(apkBytes).digest("hex"),
        identity_sha256: phase18DeviceIdentitySha256({ serial, abi: "arm64-v8a", apiLevel: "36", model: "Coverage Device" }),
        settings_sha256: settingsSha256,
        restoration_sha256: settingsSha256,
        abi: "arm64-v8a",
      },
    };
    process.env.ANDROID_HOME = sdk;
    process.env.ANDROID_SDK_ROOT = sdk;
    process.env.V12_DEVICE_SERIAL = serial;
    const gitExecution = resolveV12GitExecution();
    assert.equal(verifyV12FinalNativeIdentity(manifest, { root, gitExecution }), true);
    const finalRunId = `phase20-20261018T000000Z-${head.slice(0, 12)}`;
    const finalManifest = createV12RunManifest({ input: {
      requested_run_id: finalRunId,
      created_at: "2026-10-18T00:00:00Z",
      evidence_origin: "native",
      source: { ...manifest.source, dirty: false, package_json_sha256: "1".repeat(64), package_lock_sha256: "2".repeat(64) },
      planning: { matrix_sha256: "3".repeat(64), requirements_sha256: "4".repeat(64), source_manifest_sha256: "5".repeat(64), owner_brief_sha256: "6".repeat(64), ui_spec_sha256: "7".repeat(64), deviations_sha256: "8".repeat(64) },
      prototype: { revision: 18, approval_sha256: "9".repeat(64), html_sha256: "a".repeat(64) },
      fixtures: { registry_sha256: "b".repeat(64) },
      build: { ...manifest.build, profile: "development-test", version_name: "1.2.0", version_code: 1, apk: { ...manifest.build.apk, page_alignment_verified: true } },
      device: manifest.device,
      configuration: { id: "AP-L-C390-P-F100" },
    } });
    assert.equal(validateV12FinalProductionIdentity(finalManifest, {
      root,
      gitExecution,
      verifyApkSignature: () => ({ signature_sha256: manifest.build.apk.signature_sha256, certificate_sha256: manifest.build.apk.certificate_sha256 }),
      readDeviceIdentity: () => ({
        lease_state: "clear",
        restoration_sha256: settingsSha256,
        identity_sha256: manifest.device.identity_sha256,
        installed_apk_sha256: manifest.device.installed_apk_sha256,
        abi: "arm64-v8a",
      }),
    }), true);
    process.env.PATH = `${path.join(sdk, "platform-tools")}:${originalPath}`;
    assert.equal(validateV12FinalProductionIdentity(finalManifest, { root, gitExecution }), true);
  } finally {
    if (originalAndroidHome === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = originalAndroidHome;
    if (originalAndroidSdkRoot === undefined) delete process.env.ANDROID_SDK_ROOT;
    else process.env.ANDROID_SDK_ROOT = originalAndroidSdkRoot;
    if (originalSerial === undefined) delete process.env.V12_DEVICE_SERIAL;
    else process.env.V12_DEVICE_SERIAL = originalSerial;
    process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("production-shaped retained evidence completes preseal and final readiness", {
  skip: process.env.V12_PHASE20_COVERAGE_FIXTURE === undefined
    || process.env.V12_APPROVED_SOURCE_ROOT === undefined,
  timeout: 25 * 60_000,
}, () => {
  const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;
  const runId = readdirSync(path.join(root, "artifacts/native/v1.2"))
    .find((entry) => entry.startsWith("phase20-"));
  assert.ok(runId);
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  const saved = new Map();
  const created = [];
  const protectedRuntimeDirectories = [];
  const save = (relative) => {
    const file = path.join(root, relative);
    if (!saved.has(relative)) saved.set(relative, existsSync(file) ? readFileSync(file) : null);
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
    "ANDROID_HOME", "ANDROID_SDK_ROOT", "V12_DEVICE_SERIAL", "V12_APPROVED_SOURCE_ROOT",
  ].map((key) => [key, process.env[key]]));
  try {
    for (const helper of ["checklist.json", "identity.json", "observations.json", "test-resolution.json"]) removeSaved(helper);

    const approvedRoot = process.env.V12_APPROVED_SOURCE_ROOT;
    if (!existsSync(path.join(root, ".planning/v1.2-OWNER-BRIEF.md"))) {
      save(".planning/v1.2-OWNER-BRIEF.md");
      writeFileSync(path.join(root, ".planning/v1.2-OWNER-BRIEF.md"), "# Coverage owner brief\n");
    }

    const apkBytes = Buffer.from("504b0304aabbccdd", "hex");
    const signatureReport = Buffer.from(`Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${"ab".repeat(32)}\n`);

    const buildRelative = `artifacts/native/v1.2/${runId}/build.json`;
    const build = JSON.parse(readFileSync(save(buildRelative), "utf8"));
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
      approval_sha256: createHash("sha256").update(readFileSync(path.join(approvedRoot, "approved.json"))).digest("hex"),
      html_sha256: createHash("sha256").update(readFileSync(path.join(approvedRoot, "approved-hybrid.html"))).digest("hex"),
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
    for (const shard of ["sqlite", "recovery", "garmin", "calendar", "multi-plan", "workout", "library-running", "visual", "accessibility", "performance"]) {
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
      "  *\"sh -c\"*) printf 'clear\\n' ;;",
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
      V12_APPROVED_SOURCE_ROOT: approvedRoot,
    });
    const executeDirectMaestroTool = (executablePath, args, options = {}) => {
      const result = spawnSync(executablePath, args, { ...options, encoding: "utf8" });
      assert.equal(result.status, 0, `${path.basename(executablePath)} ${args.join(" ")}: ${result.stderr}`);
      return result.stdout;
    };
    const directMaestroTools = resolveV12NativeExecutionTools({ domain: true, env: liveEnvironment });
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
      const toolAttestation = createV12DirectMaestroToolAttestation({
        execute: executeDirectMaestroTool,
        executionTools: directMaestroTools,
        shard,
      });
      mapping.observations = mapping.observations.map((observation) => ({
        ...observation,
        device_measurement: {
          before: directMaestroMeasurement,
          after: directMaestroMeasurement,
        },
      }));
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
        })),
      };
      mapping.execution_origin = executionOrigin;
      publication.execution_origin = executionOrigin;
      writeJson(mappingRelative, mapping);
      const mappingMember = publication.members.find(({ artifact }) => artifact === `mapping/${shard}.json`);
      assert.ok(mappingMember);
      const mappingBytes = readFileSync(path.join(root, mappingRelative));
      mappingMember.sha256 = sha256(mappingBytes);
      mappingMember.size_bytes = mappingBytes.length;
      writeJson(publicationRelative, publication);
    }
    const verifier = new URL("./verify-v12-native-evidence.mjs", import.meta.url).pathname;
    const preseal = spawnSync(process.execPath, [verifier, "--run", runId, "--mode", "preseal", "--no-final-write"], {
      cwd: root,
      encoding: "utf8",
      env: liveEnvironment,
      maxBuffer: 1024 * 1024 * 1024,
      timeout: RETAINED_CLI_TIMEOUT_MS,
    });
    assert.equal(preseal.status, 0, preseal.stderr);
    assert.equal(JSON.parse(preseal.stdout).mode, "preseal");
    for (const [relative, bytes] of attendedBytes) {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      writeFileSync(path.join(root, relative), bytes);
    }
    const final = spawnSync(process.execPath, [verifier, "--run", runId, "--mode", "final"], {
      cwd: root,
      encoding: "utf8",
      env: liveEnvironment,
      maxBuffer: 1024 * 1024 * 1024,
      timeout: RETAINED_CLI_TIMEOUT_MS,
    });
    assert.equal(final.status, 0, final.stderr);
    assert.equal(JSON.parse(final.stdout).mode, "final");
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
      `import { recoverV12FinalPublication } from ${JSON.stringify(new URL("./verify-v12-native-evidence.mjs", import.meta.url).href)};`,
      "assert.equal(recoverV12FinalPublication(process.argv[1], process.argv[2]), true);",
    ].join("\n");
    const recovery = spawnSync(process.execPath, ["--input-type=module", "--eval", recoveryScript, root, runId], {
      cwd: root,
      encoding: "utf8",
      env: liveEnvironment,
      maxBuffer: 1024 * 1024 * 1024,
      timeout: RETAINED_CLI_TIMEOUT_MS,
    });
    assert.equal(recovery.status, 0, recovery.stderr);
    const replay = spawnSync(process.execPath, [verifier, "--run", runId, "--mode", "final"], {
      cwd: root,
      encoding: "utf8",
      env: liveEnvironment,
      maxBuffer: 1024 * 1024 * 1024,
      timeout: RETAINED_CLI_TIMEOUT_MS,
    });
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(JSON.parse(replay.stdout).recovered, true);
    const preloader = nonErrorStdoutPreload(root);
    created.push(preloader);
    const nonErrorFinal = spawnSync(process.execPath, [
      `--import=${pathToFileURL(preloader).href}`,
      verifier, "--run", runId, "--mode", "final",
    ], {
      cwd: root,
      encoding: "utf8",
      env: liveEnvironment,
      maxBuffer: 1024 * 1024 * 1024,
      timeout: RETAINED_CLI_TIMEOUT_MS,
    });
    assert.equal(nonErrorFinal.status, 1);
    assert.match(nonErrorFinal.stderr, /v12_preflight_failed\s*$/u);
    if (process.platform !== "win32") {
      const special = path.join(runRoot, "coverage-special-file");
      execFileSync("/usr/bin/mkfifo", [special]);
      const specialResult = spawnSync(process.execPath, [verifier, "--run", runId, "--mode", "final"], {
        cwd: root,
        encoding: "utf8",
        env: liveEnvironment,
        maxBuffer: 1024 * 1024 * 1024,
        timeout: RETAINED_CLI_TIMEOUT_MS,
      });
      assert.equal(specialResult.status, 1);
      assert.match(specialResult.stderr, /v12_preflight_artifact_invalid/u);
      rmSync(special);
    }
  } finally {
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
        writeFileSync(file, bytes);
      }
    }
    for (const directory of protectedRuntimeDirectories) mkdirSync(directory, { recursive: true });
    for (const target of created.reverse()) rmSync(target, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("retained Phase 20 fixture executes the exact coverage CLI entrypoints", {
  skip: process.env.V12_PHASE20_COVERAGE_FIXTURE === undefined,
  timeout: 20 * 60_000,
}, () => {
  const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;
  const runId = readdirSync(path.join(root, "artifacts/native/v1.2"))
    .find((entry) => entry.startsWith("phase20-"));
  assert.ok(runId);
  const projectRoot = process.cwd();
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess",
    V12_NATIVE_ADAPTER_TEST_PROCESS: "1",
    V12_NATIVE_ADAPTER_COMMAND: path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"),
    V12_NATIVE_ADAPTER_BATCH: "1",
    V12_DEVICE_SERIAL: "fake-device-20",
    V12_EXECUTION_ORIGIN: "test-controlled/v1",
  };
  const rootHelpers = ["checklist.json", "identity.json", "observations.json", "test-resolution.json"]
    .map((file) => [file, readFileSync(path.join(root, file))]);
  const retainedBuild = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", runId, "build.json"), "utf8"));
  const visualRunId = `phase20-20261018T010000Z-${retainedBuild.source.head.slice(0, 12)}`;
  const visualRunRoot = path.join(root, "artifacts/native/v1.2", visualRunId);
  mkdirSync(visualRunRoot, { recursive: true });
  writeFileSync(path.join(visualRunRoot, "build.json"), `${JSON.stringify({ ...retainedBuild, run_id: visualRunId })}\n`);
  const commands = [
    ["scripts/v12-sqlite-shard.mjs", ["--run", runId, "--verify"], 0],
    ["scripts/capture-v12-visual.mjs", ["--run", runId, "--verify"], 0],
    ["scripts/capture-v12-visual.mjs", ["--run", visualRunId, "--all"], 0],
    ["scripts/compare-v12-visual.mjs", ["--run", runId, "--verify"], 0],
    ["scripts/compare-v12-visual.mjs", ["--run", visualRunId, "--all"], 0],
    ["scripts/verify-v12-native-evidence.mjs", ["--run", runId, "--mode", "preseal", "--no-final-write"], 1],
    ["scripts/verify-v12-native-evidence.mjs", ["--run", runId, "--mode", "final"], 1],
    ["scripts/create-v12-readiness-handoff.mjs", ["--run", runId, "--verify"], 1],
    ["scripts/v12-rollback-evidence.mjs", ["--invalid"], 1],
    ["scripts/v12-native-execution-origin.mjs", ["--git-path"], 0],
    ["scripts/v12-native-execution-origin.mjs", ["--git-attestation"], 0],
    ["scripts/v12-native-execution-origin.mjs", ["--invalid"], 1],
  ];
  try {
    for (const [file] of rootHelpers) rmSync(path.join(root, file));
    for (const [script, args, expectedStatus] of commands) {
      const result = spawnSync(process.execPath, [path.join(projectRoot, script), ...args], {
        cwd: root,
        encoding: "utf8",
        env: environment,
        maxBuffer: 64 * 1024 * 1024,
        timeout: RETAINED_CLI_TIMEOUT_MS,
      });
      assert.equal(result.status, expectedStatus, `${script}: ${result.stderr}`);
    }
    rmSync(path.join(visualRunRoot, "publication/comparison.json"), { force: true });
    rmSync(path.join(visualRunRoot, "comparison"), { recursive: true, force: true });
    assert.throws(() => executeV12VisualComparison({
      runId: visualRunId,
      root,
      artifactRoot: root,
      compare: ({ captures }) => captures.map(({ state_id: id, configuration_id }) => ({ id, configuration_id })),
      produceRecord: () => { throw "non-error"; },
    }), /v12_visual_compare_failed/u);
  } finally {
    for (const [file, bytes] of rootHelpers) writeFileSync(path.join(root, file), bytes);
    rmSync(visualRunRoot, { recursive: true, force: true });
  }
});

test("a timed-out coverage project kills its TERM-resistant grandchild", {
  skip: process.platform === "win32",
  timeout: 10_000,
}, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-timeout-"));
  const pidFile = path.join(root, "grandchild.pid");
  let grandchildPid;
  try {
    writeFileSync(path.join(root, "hung.test.mjs"), [
      "import { spawn } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "import test from 'node:test';",
      "test('hangs with a resistant grandchild', async () => {",
      "  const child = spawn(process.execPath, ['--input-type=module', '--eval', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { stdio: 'ignore' });",
      `  writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
      "  await new Promise(() => {});",
      "});",
      "",
    ].join("\n"));

    await assert.rejects(
      runPhase20SubprocessCoverage({
        projectRoot: root,
        projects: [{ name: "hung", coverage: false, tests: ["hung.test.mjs"] }],
        outputDirectory: path.join(root, "coverage"),
        maxParallel: 1,
        projectTimeoutMs: 1_000,
        terminateGraceMs: 200,
      }),
      /phase20_coverage_project_timeout:hung/u,
    );
    assert.equal(existsSync(pidFile), true, "hung grandchild never started");
    grandchildPid = Number(readFileSync(pidFile, "utf8"));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        process.kill(grandchildPid, 0);
        await delay(50);
      } catch (error) {
        assert.equal(error.code, "ESRCH");
        grandchildPid = undefined;
        break;
      }
    }
    assert.equal(grandchildPid, undefined, "grandchild survived bounded TERM-to-KILL cleanup");
  } finally {
    if (grandchildPid !== undefined) {
      try { process.kill(grandchildPid, "SIGKILL"); } catch { /* already gone */ }
    }
    rmSync(root, { recursive: true, force: true });
  }
});
