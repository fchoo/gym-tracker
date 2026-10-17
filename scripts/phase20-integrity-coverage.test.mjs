import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadV12ContractInputs } from "./v12-evidence-contract.mjs";
import {
  createV12NativeExecutionOriginAttestation,
  resolveV12NativeExecutionTools,
  V12_PRODUCTION_EXECUTION_ORIGIN,
  V12_TEST_EXECUTION_ORIGIN,
} from "./v12-native-execution-origin.mjs";
import {
  deriveV12Ledger,
  executeV12EvidenceCli,
  sealV12FinalEvidence,
} from "./verify-v12-native-evidence.mjs";

const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;

test("the retained black-box fixture covers source resolution and final-ledger integrity", {
  skip: root === undefined,
}, () => {
  const runsRoot = path.join(root, "artifacts/native/v1.2");
  const runId = readdirSync(runsRoot).find((entry) => entry.startsWith("phase20-"));
  assert.ok(runId);
  const base = path.join(runsRoot, runId);
  const read = (file) => JSON.parse(readFileSync(path.join(base, file), "utf8"));
  const manifest = read("build.json");
  const resolved = executeV12EvidenceCli(
    ["--run", runId, "--mode", "test-resolve"],
    { root },
  );
  assert.equal(resolved.row_evidence.length, 172);
  assert.equal(new Set(resolved.row_evidence.map(({ row_id }) => row_id)).size, 172);
  const sourceEvidence = JSON.parse(
    readFileSync(path.join(root, "test-resolution.json"), "utf8"),
  ).row_evidence;

  const args = {
    inputs: loadV12ContractInputs({ root }),
    manifest,
    evidence: sourceEvidence,
    root,
    readArtifact: (file) => readFileSync(path.join(root, file)),
    attended: read("attended-observations.json"),
  };
  const blocker = sourceEvidence.find(({ result }) =>
    ["FAIL", "NOT_RUN", "REVIEW_REQUIRED"].includes(result));
  assert.ok(blocker);
  const exception = {
    row_id: blocker.row_id,
    deviation_id: "DEV-203",
    owner_decision: "owner-approved",
    decided_at: "2026-10-14",
    scope: "retained blocker review",
    configurations: [manifest.configuration.id],
    rationale: "cannot override a concrete blocker",
    evidence_hashes: [blocker.sha256],
  };
  const ledger = deriveV12Ledger({
    ...args,
    allowTestCalendarFixture: true,
    exceptions: [exception],
    readiness_policy: {
      policy_id: "v12-reviewed-policy",
      reviewed_by: "owner",
      reviewed_at: "2026-10-14",
      permits_accepted_exceptions: true,
    },
  });
  assert.equal(ledger.evidence_origin, "test");
  assert.equal(ledger.readiness, "NOT_READY");
  assert.equal(
    ledger.rows.find(({ requirement_id }) => requirement_id === blocker.row_id).verdict,
    blocker.result,
  );
  assert.throws(
    () => sealV12FinalEvidence({
      mode: "final",
      run_id: runId,
      ledger,
      writeImmutableJson: () => assert.fail("test-origin ledger must not write"),
    }),
    /test_origin_forbidden/u,
  );

  const changed = structuredClone(sourceEvidence);
  changed[0].result = "FAIL";
  assert.throws(
    () => deriveV12Ledger({
      ...args,
      evidence: changed,
      allowTestCalendarFixture: true,
    }),
    /source_resolution_mismatch/u,
  );
});

test("production execution-origin resolution covers controlled and pinned tool branches", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "phase20-origin-coverage-"));
  try {
    const sdk = path.join(temporary, "sdk");
    const adb = path.join(sdk, "platform-tools/adb");
    const java = path.join(temporary, "jdk/bin/java");
    const maestro = path.join(temporary, "home/.local/bin/maestro");
    for (const file of [adb, java, maestro]) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "#!/bin/sh\nprintf 'tool 1.0\\n'\n");
      chmodSync(file, 0o755);
    }
    const production = resolveV12NativeExecutionTools({
      requiredTools: ["adb", "java", "unzip"],
      env: { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: path.join(temporary, "jdk") },
    });
    assert.equal(production.execution_origin, V12_PRODUCTION_EXECUTION_ORIGIN);
    const sqliteTools = resolveV12NativeExecutionTools({
      requiredTools: ["adb"],
      env: { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
    });
    const attestation = createV12NativeExecutionOriginAttestation({
      action: "sqlite",
      executionTools: sqliteTools,
      runCommand: () => ({ status: 0, signal: null, stdout: "adb 1.0\n", stderr: "" }),
    });
    assert.equal(attestation.test_only, false);
    assert.throws(
      () => createV12NativeExecutionOriginAttestation({
        action: "sqlite",
        executionTools: sqliteTools,
        runCommand: () => ({ status: 1, signal: null, stdout: "", stderr: "" }),
      }),
      /tool_version_invalid/u,
    );
    assert.throws(
      () => resolveV12NativeExecutionTools({
        requiredTools: ["adb"],
        env: { V12_EXECUTION_ORIGIN: V12_TEST_EXECUTION_ORIGIN, V12_ADB_PATH: temporary },
      }),
      /test_toolchain_invalid/u,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("CLI main guards remain bounded and fail closed under direct module entry", () => {
  for (const module of [
    "capture-v12-visual.mjs",
    "compare-v12-visual.mjs",
    "v12-sqlite-shard.mjs",
    "verify-v12-native-evidence.mjs",
  ]) {
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", module), "--invalid"],
      { encoding: "utf8", timeout: 10_000 },
    );
    assert.equal(result.status, 1, `${module}: ${result.stderr}`);
  }
});
