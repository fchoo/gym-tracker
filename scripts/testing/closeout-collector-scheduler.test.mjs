// Original collector behavior tests; only actual import URLs relocated.
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

test("coverage projects reject a successful test process with skipped tests", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-coverage-skipped-"));
  const outputDirectory = path.join(root, "coverage");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "skipped.test.mjs"), [
    "import test from 'node:test';",
    "test('must execute', { skip: true }, () => {});",
    "",
  ].join("\n"));
  await assert.rejects(
    runPhase20SubprocessCoverage({
      projectRoot: root,
      outputDirectory,
      projects: [{ name: "skipped", coverage: false, tests: ["skipped.test.mjs"] }],
      projectTimeoutMs: 10_000,
    }),
    /phase20_coverage_project_skipped_tests:skipped:1/u,
  );
});

test("a project-specific timeout overrides the shorter scheduler default", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-timeout-override-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "bounded.test.mjs"), [
    "import { setTimeout as delay } from 'node:timers/promises';",
    "import test from 'node:test';",
    "test('finishes inside its project allowance', async () => { await delay(100); });",
    "",
  ].join("\n"));
  await assert.doesNotReject(() => runPhase20SubprocessCoverage({
    projectRoot: root,
    outputDirectory: path.join(root, "coverage"),
    projects: [{ name: "bounded", coverage: false, tests: ["bounded.test.mjs"], timeoutMs: 1_000 }],
    projectTimeoutMs: 50,
  }));
});

test("a converted raw V8 directory is gone before the next project starts", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-coverage-raw-lifecycle-"));
  const outputDirectory = path.join(root, "coverage");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "covered.mjs"), "export const covered = () => 1;\n");
  writeFileSync(path.join(root, "covered.test.mjs"), [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    "import { covered } from './covered.mjs';",
    "test('covers the module', () => assert.equal(covered(), 1));",
    "",
  ].join("\n"));
  writeFileSync(path.join(root, "next.test.mjs"), [
    "import assert from 'node:assert/strict';",
    "import { existsSync } from 'node:fs';",
    "import test from 'node:test';",
    `test('previous raw coverage is deleted', () => assert.equal(existsSync(${JSON.stringify(path.join(outputDirectory, "projects/covered/raw-v8"))}), false));`,
    "",
  ].join("\n"));
  await assert.doesNotReject(() => runPhase20SubprocessCoverage({
    projectRoot: root,
    outputDirectory,
    maxParallel: 1,
    projects: [
      { name: "covered", modules: ["covered.mjs"], tests: ["covered.test.mjs"] },
      { name: "next", coverage: false, tests: ["next.test.mjs"] },
    ],
    projectTimeoutMs: 10_000,
  }));
});

test("black-box fixture residue is removed when a coverage project fails", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-blackbox-fixture-cleanup-"));
  const outputDirectory = path.join(root, "coverage");
  const fixtureDirectory = path.join(outputDirectory, "blackbox-fixture");
  try {
    writeFileSync(path.join(root, "fails-after-fixture.test.mjs"), [
      "import { mkdirSync, writeFileSync } from 'node:fs';",
      "import test from 'node:test';",
      "test('leaves a fixture before failing', () => {",
      "  mkdirSync(process.env.PHASE20_BLACKBOX_FIXTURE_DIRECTORY, { recursive: true });",
      "  writeFileSync(`${process.env.PHASE20_BLACKBOX_FIXTURE_DIRECTORY}/partial.txt`, 'partial');",
      "  throw new Error('fixture-project-failed');",
      "});",
      "",
    ].join("\n"));
    await assert.rejects(
      runPhase20SubprocessCoverage({
        projectRoot: root,
        outputDirectory,
        maxParallel: 1,
        projects: [{
          name: "fixture-failure",
          coverage: false,
          tests: ["fails-after-fixture.test.mjs"],
          env: { PHASE20_BLACKBOX_FIXTURE_DIRECTORY: fixtureDirectory },
        }],
        projectTimeoutMs: 10_000,
      }),
      /phase20_coverage_project_failed:fixture-failure/u,
    );
    assert.equal(existsSync(fixtureDirectory), false);
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
    writeFileSync(path.join(root, "scripts/eval-target.mjs"), [
      "export function classify(value) { return value ? 'yes' : 'no'; }",
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
      "  const imported = new URL('./scripts/eval-target.mjs', new URL(`file://${process.cwd()}/`)).href;",
      "  const evalResult = spawnSync(process.execPath, ['--input-type=module', '--eval', `const { classify } = await import(${JSON.stringify(imported)}); classify(true); classify(false);`], { encoding: 'utf8' });",
      "  assert.equal(evalResult.status, 0, evalResult.stderr);",
      "});",
      "",
    ].join("\n"));
    await runPhase20SubprocessCoverage({
      projectRoot: root,
      projects: [{
        name: "child-only",
        coverage: "children",
        modules: ["scripts/target.mjs", "scripts/eval-target.mjs"],
        tests: ["target.test.mjs"],
      }],
      outputDirectory: path.join(root, "coverage"),
      maxParallel: 1,
    });
    const summary = JSON.parse(readFileSync(path.join(root, "coverage/coverage-summary.json"), "utf8"));
    for (const module of ["scripts/target.mjs", "scripts/eval-target.mjs"]) {
      assert.deepEqual(
        ["statements", "branches", "functions", "lines"]
          .map((metric) => summary[module][metric].pct),
        [100, 100, 100, 100],
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a timed-out coverage project kills its TERM-resistant grandchild", {
  skip: process.platform !== "linux",
  timeout: 10_000,
}, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-timeout-"));
  const pidFile = path.join(root, "grandchild.pid");
  let grandchildPid;
  try {
    writeFileSync(path.join(root, "hung.test.mjs"), [
      "import { spawn } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "import { setTimeout as delay } from 'node:timers/promises';",
      "import test from 'node:test';",
      "test('hangs with a resistant grandchild', async () => {",
      "  const child = spawn(process.execPath, ['--input-type=module', '--eval', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { stdio: 'ignore' });",
      `  writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
      "  try { await delay(3000); } finally { try { child.kill('SIGKILL'); } catch {} }",
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

function ownedCoverageProcessRow(pid, state, token, command = "node coverage-worker.mjs") {
  return `${String(pid)} ${state} ${command} ${V12_POSIX_OWNERSHIP_ENV}=${token}\n`;
}

test("a successful coverage leader drains its TERM-resistant token-owned descendants", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-success-tree-"));
  const child = new EventEmitter();
  child.pid = 5151; child.exitCode = null; child.signalCode = null;
  child.stdio = [null, null, null, new PassThrough()];
  let leaderAlive = true;
  let descendantAlive = true;
  let ownershipToken;
  const signals = [];
  try {
    writeFileSync(path.join(root, "success.test.mjs"), "import test from 'node:test'; test('ok', () => {});\n");
    await runPhase20SubprocessCoverage({
      projectRoot: root,
      projects: [{ name: "success", coverage: false, tests: ["success.test.mjs"] }],
      outputDirectory: path.join(root, "coverage"),
      maxParallel: 1,
      projectTimeoutMs: 2_000,
      terminateGraceMs: 5,
      platform: "linux",
      spawnImplementation: (_program, _args, options) => {
        ownershipToken = options.env[V12_POSIX_OWNERSHIP_ENV];
        const report = path.join(root, "coverage/projects/success/test-results.tap");
        mkdirSync(path.dirname(report), { recursive: true }); writeFileSync(report, "# skipped 0\n");
        queueMicrotask(() => { leaderAlive = false; child.exitCode = 0; child.emit("close", 0, null); });
        return child;
      },
      posixPidfdSignalImplementation: (_program, args, options) => {
        assert.equal(options.input, `${ownershipToken}\n`);
        signals.push([args.slice(3).map(Number), args[1]]);
        if (args[1] === "SIGKILL") descendantAlive = false;
        return { status: 0, signal: null, error: undefined, stdout: "ok\n", stderr: "" };
      },
      posixProcessProbeImplementation: () => ({ status: 0, signal: null, error: undefined,
        stdout: `${leaderAlive ? ownedCoverageProcessRow(5151, "Ss", ownershipToken) : ""}${descendantAlive ? ownedCoverageProcessRow(5152, "Ss", ownershipToken) : ""}` }),
    });
    assert.deepEqual(signals, [[[5152], "SIGTERM"], [[5152], "SIGKILL"]]);
    assert.equal(descendantAlive, false);
    assert.equal(existsSync(path.join(root, "coverage/projects/success/.process-ownership")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("coverage cleanup sends zero signals when initial POSIX ownership enumeration fails", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-initial-enumeration-failure-"));
  const child = new EventEmitter();
  child.pid = 5153; child.exitCode = null; child.signalCode = null;
  child.stdio = [null, null, null, new PassThrough()];
  let helperCalls = 0;
  try {
    writeFileSync(path.join(root, "success.test.mjs"), "import test from 'node:test'; test('ok', () => {});\n");
    await assert.rejects(runPhase20SubprocessCoverage({
      projectRoot: root,
      projects: [{ name: "initial-enumeration", coverage: false, tests: ["success.test.mjs"] }],
      outputDirectory: path.join(root, "coverage"),
      maxParallel: 1,
      projectTimeoutMs: 1_000,
      terminateGraceMs: 5,
      platform: "linux",
      spawnImplementation: () => {
        const report = path.join(root, "coverage/projects/initial-enumeration/test-results.tap");
        mkdirSync(path.dirname(report), { recursive: true }); writeFileSync(report, "# skipped 0\n");
        queueMicrotask(() => { child.exitCode = 0; child.emit("close", 0, null); });
        return child;
      },
      posixProcessProbeImplementation: () => { throw new Error("ps unavailable"); },
      posixPidfdSignalImplementation: () => { helperCalls += 1; throw new Error("must not run"); },
    }), /phase20_coverage_project_cleanup_failed:initial-enumeration/u);
    assert.equal(helperCalls, 0);
    assert.equal(existsSync(path.join(root, "coverage/projects/initial-enumeration/.process-ownership")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("coverage cleanup sends zero later signals when POSIX ownership re-enumeration fails", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-later-enumeration-failure-"));
  const child = new EventEmitter();
  child.pid = 5154; child.exitCode = null; child.signalCode = null;
  child.stdio = [null, null, null, new PassThrough()];
  let ownershipToken;
  let probeCount = 0;
  let helperCalls = 0;
  try {
    writeFileSync(path.join(root, "success.test.mjs"), "import test from 'node:test'; test('ok', () => {});\n");
    await assert.rejects(runPhase20SubprocessCoverage({
      projectRoot: root,
      projects: [{ name: "later-enumeration", coverage: false, tests: ["success.test.mjs"] }],
      outputDirectory: path.join(root, "coverage"),
      maxParallel: 1,
      projectTimeoutMs: 1_000,
      terminateGraceMs: 5,
      platform: "linux",
      spawnImplementation: (_program, _args, options) => {
        ownershipToken = options.env[V12_POSIX_OWNERSHIP_ENV];
        const report = path.join(root, "coverage/projects/later-enumeration/test-results.tap");
        mkdirSync(path.dirname(report), { recursive: true }); writeFileSync(report, "# skipped 0\n");
        queueMicrotask(() => { child.exitCode = 0; child.emit("close", 0, null); });
        return child;
      },
      posixProcessProbeImplementation: () => {
        if (probeCount++ === 0) {
          return { status: 0, signal: null, error: undefined,
            stdout: ownedCoverageProcessRow(5154, "Ss", ownershipToken) };
        }
        throw new Error("ps became unavailable");
      },
      posixPidfdSignalImplementation: () => { helperCalls += 1; throw new Error("must not run"); },
    }), /phase20_coverage_project_cleanup_failed:later-enumeration/u);
    assert.equal(helperCalls, 0);
    assert.equal(existsSync(path.join(root, "coverage/projects/later-enumeration/.process-ownership")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unsupported POSIX coverage cleanup retains its ownership marker and blocks a rerun", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-unsupported-posix-"));
  const outputDirectory = path.join(root, "coverage");
  const child = new EventEmitter();
  child.pid = 5155; child.exitCode = null; child.signalCode = null;
  child.stdio = [null, null, null, new PassThrough()];
  let ownershipToken;
  let helperCalls = 0;
  try {
    writeFileSync(path.join(root, "success.test.mjs"), "import test from 'node:test'; test('ok', () => {});\n");
    const options = {
      projectRoot: root,
      projects: [{ name: "unsupported", coverage: false, tests: ["success.test.mjs"] }],
      outputDirectory,
      maxParallel: 1,
      projectTimeoutMs: 1_000,
      terminateGraceMs: 5,
      platform: "darwin",
      spawnImplementation: (_program, _args, spawnOptions) => {
        ownershipToken = spawnOptions.env[V12_POSIX_OWNERSHIP_ENV];
        const report = path.join(outputDirectory, "projects/unsupported/test-results.tap");
        mkdirSync(path.dirname(report), { recursive: true }); writeFileSync(report, "# skipped 0\n");
        queueMicrotask(() => { child.exitCode = 0; child.emit("close", 0, null); });
        return child;
      },
      posixProcessProbeImplementation: () => ({ status: 0, signal: null, error: undefined,
        stdout: ownedCoverageProcessRow(5155, "Ss", ownershipToken) }),
      posixPidfdSignalImplementation: () => { helperCalls += 1; throw new Error("must not run"); },
    };
    await assert.rejects(runPhase20SubprocessCoverage(options), /phase20_coverage_project_cleanup_failed:unsupported/u);
    assert.equal(helperCalls, 0);
    assert.equal(existsSync(path.join(outputDirectory, "projects/unsupported/.process-ownership")), true);
    assert.equal(existsSync(path.join(outputDirectory, ".process-ownership")), true);
    await assert.rejects(runPhase20SubprocessCoverage(options), /phase20_coverage_process_ownership_retained/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a successful coverage leader drains a detached POSIX descendant before resolving", {
  skip: process.platform === "win32",
  timeout: 10_000,
}, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-detached-success-"));
  const pidFile = path.join(root, "detached.pid");
  let detachedPid;
  try {
    writeFileSync(path.join(root, "detached.test.mjs"), [
      "import { spawn } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "import test from 'node:test';",
      "test('detaches an owned child', async () => {",
      "  const child = spawn(process.execPath, ['--input-type=module', '--eval', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { detached: true, stdio: 'ignore' });",
      `  writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
      "  child.unref();",
      "});",
      "",
    ].join("\n"));
    const running = runPhase20SubprocessCoverage({
      projectRoot: root,
      projects: [{ name: "detached", coverage: false, tests: ["detached.test.mjs"] }],
      outputDirectory: path.join(root, "coverage"),
      maxParallel: 1,
      projectTimeoutMs: 2_000,
      terminateGraceMs: 100,
    });
    if (process.platform === "linux") await running;
    else await assert.rejects(running, /phase20_coverage_project_cleanup_failed:detached/u);
    detachedPid = Number(readFileSync(pidFile, "utf8"));
    if (process.platform === "linux") {
      assert.throws(() => process.kill(detachedPid, 0), /ESRCH/u);
      detachedPid = undefined;
    } else {
      assert.doesNotThrow(() => process.kill(detachedPid, 0));
      assert.equal(existsSync(path.join(root, "coverage/projects/detached/.process-ownership")), true);
    }
  } finally {
    if (detachedPid !== undefined) { try { process.kill(detachedPid, "SIGKILL"); } catch { /* already gone */ } }
    rmSync(root, { recursive: true, force: true });
  }
});

test("a successful mocked Windows coverage leader verifies and drains its task tree", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-windows-success-"));
  const child = new EventEmitter();
  child.pid = 6262; child.exitCode = null; child.signalCode = null;
  child.stdio = [null, null, null, new PassThrough()];
  let descendantAlive = true;
  const taskkillCalls = [];
  try {
    writeFileSync(path.join(root, "success.test.mjs"), "import test from 'node:test'; test('ok', () => {});\n");
    await runPhase20SubprocessCoverage({
      projectRoot: root,
      projects: [{ name: "success", coverage: false, tests: ["success.test.mjs"] }],
      outputDirectory: path.join(root, "coverage"),
      maxParallel: 1,
      projectTimeoutMs: 1_000,
      terminateGraceMs: 5,
      platform: "win32",
      spawnImplementation: () => {
        const report = path.join(root, "coverage/projects/success/test-results.tap");
        mkdirSync(path.dirname(report), { recursive: true }); writeFileSync(report, "# skipped 0\n");
        queueMicrotask(() => { child.exitCode = 0; child.emit("close", 0, null); });
        return child;
      },
      windowsTreeProbeImplementation: () => ({ status: 0, signal: null, error: undefined,
        stdout: descendantAlive ? "7272\n" : "" }),
      taskkillImplementation: (_program, args) => {
        taskkillCalls.push(args);
        if (args.includes("/F")) descendantAlive = false;
        return { status: 0, signal: null, error: undefined };
      },
    });
    assert.deepEqual(taskkillCalls, [["/PID", "7272", "/T"], ["/PID", "7272", "/T", "/F"]]);
    assert.equal(descendantAlive, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("first project failure stops dequeuing and awaits cleanup of every active project tree", {
  skip: process.platform !== "linux",
  timeout: 15_000,
}, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-fail-fast-"));
  const activeReady = path.join(root, "active.ready");
  const activePid = path.join(root, "active.pid");
  const queuedStarted = path.join(root, "queued.started");
  let grandchildPid;
  try {
    writeFileSync(path.join(root, "active.test.mjs"), [
      "import { spawn } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "import test from 'node:test';",
      "test('stays active until peer failure cleanup', async () => {",
      "  const child = spawn(process.execPath, ['--input-type=module', '--eval', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { stdio: 'ignore' });",
      `  writeFileSync(${JSON.stringify(activePid)}, String(child.pid));`,
      `  writeFileSync(${JSON.stringify(activeReady)}, 'ready');`,
      "  await new Promise(() => {});",
      "});",
      "",
    ].join("\n"));
    writeFileSync(path.join(root, "fail.test.mjs"), [
      "import assert from 'node:assert/strict';",
      "import { existsSync } from 'node:fs';",
      "import { setTimeout as delay } from 'node:timers/promises';",
      "import test from 'node:test';",
      "test('fails after the peer is active', async () => {",
      `  for (let attempt = 0; attempt < 200 && !existsSync(${JSON.stringify(activeReady)}); attempt += 1) await delay(10);`,
      `  assert.equal(existsSync(${JSON.stringify(activeReady)}), true);`,
      "  assert.fail('first-project-failure');",
      "});",
      "",
    ].join("\n"));
    writeFileSync(path.join(root, "queued.test.mjs"), [
      "import { writeFileSync } from 'node:fs';",
      "import test from 'node:test';",
      `writeFileSync(${JSON.stringify(queuedStarted)}, 'started');`,
      "test('must not be dequeued', () => {});",
      "",
    ].join("\n"));

    await assert.rejects(
      runPhase20SubprocessCoverage({
        projectRoot: root,
        projects: [
          { name: "active", coverage: false, tests: ["active.test.mjs"] },
          { name: "fail", coverage: false, tests: ["fail.test.mjs"] },
          { name: "queued", coverage: false, tests: ["queued.test.mjs"] },
        ],
        outputDirectory: path.join(root, "coverage"),
        maxParallel: 2,
        projectTimeoutMs: 10_000,
        terminateGraceMs: 100,
      }),
      /phase20_coverage_project_failed:fail/u,
    );
    assert.equal(existsSync(queuedStarted), false, "scheduler dequeued work after the first failure");
    grandchildPid = Number(readFileSync(activePid, "utf8"));
    assert.throws(() => process.kill(grandchildPid, 0), { code: "ESRCH" });
    grandchildPid = undefined;
  } finally {
    if (grandchildPid !== undefined) {
      try { process.kill(grandchildPid, "SIGKILL"); } catch { /* already gone */ }
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("a leader that exits after TERM cannot receive a delayed KILL", {
  skip: process.platform !== "linux",
  timeout: 10_000,
}, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-project-no-late-kill-"));
  const signals = [];
  try {
    writeFileSync(path.join(root, "hang.test.mjs"), [
      "import test from 'node:test';",
      "test('waits for supervisor termination', async () => { await new Promise(() => {}); });",
      "",
    ].join("\n"));
    await assert.rejects(
      runPhase20SubprocessCoverage({
        projectRoot: root,
        projects: [{ name: "hang", coverage: false, tests: ["hang.test.mjs"] }],
        outputDirectory: path.join(root, "coverage"),
        maxParallel: 1,
        projectTimeoutMs: 200,
        terminateGraceMs: 500,
        onProjectSignal: ({ signal }) => signals.push(signal),
      }),
      /phase20_coverage_project_timeout:hang/u,
    );
    await delay(600);
    assert.deepEqual(signals, ["SIGTERM"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
