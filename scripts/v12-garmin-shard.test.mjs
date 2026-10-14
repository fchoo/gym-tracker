import assert from "node:assert/strict";
import test from "node:test";

import {
  executeV12GarminShard,
  executeV12GarminShardCli,
  parseV12GarminShardCliArgs,
  validateV12GarminShard,
  V12_GARMIN_SHARD_CASE_IDS,
} from "./v12-garmin-shard.mjs";

const observation = Object.freeze({
  packagingAuth: { source: "bundled-chaquopy", bridgeMethods: ["login", "mfa", "activities", "activity", "splits", "details"], nativeExecution: "NOT_RUN" },
  syncRead: { fixtureManifestSha256: "a".repeat(64), expectedSummaries: 3, nativeExecution: "NOT_RUN" },
  dedupe: { receiptDigest: "b".repeat(64), provenanceDigest: "c".repeat(64), replayIdentityCount: 7, nativeExecution: "NOT_RUN" },
  matching: { matchDigest: "d".repeat(64), selectedOpportunityCount: 1, nativeExecution: "NOT_RUN" },
});

test("Garmin shard accepts only the four canonical, privacy-safe observation shapes", () => {
  assert.deepEqual(validateV12GarminShard(observation), { status: "NOT_RUN", caseCount: 12 });
  assert.deepEqual(executeV12GarminShard(observation), {
    producer: "v12-garmin-shard/v1",
    status: "NOT_RUN",
    observations: observation,
  });
});

test("Garmin shard fails closed on incomplete, private, and verdict-bearing observations", () => {
  assert.throws(() => validateV12GarminShard({ ...observation, syncRead: { ...observation.syncRead, rawPayload: "{}" } }), /garmin_private_field/);
  assert.throws(() => validateV12GarminShard({ ...observation, dedupe: { ...observation.dedupe, replayIdentityCount: 0 } }), /garmin_replay_identity_invalid/);
  assert.throws(() => executeV12GarminShard({ ...observation, finalVerdict: "PASS" }), /garmin_final_verdict_forbidden/);
});

test("Garmin shard exposes an exact ordered registry and a strict run CLI", () => {
  assert.deepEqual(V12_GARMIN_SHARD_CASE_IDS, [
    "packaging", "bridge-allowlist", "canonical-json", "sync-read", "account-lifecycle",
    "recovery", "dedupe-restart", "dedupe-restore", "dedupe-merge", "match-zero",
    "match-one", "match-many", "match-stale", "match-alternate", "match-cancel",
    "match-confirm", "match-reassign", "privacy",
  ]);
  assert.deepEqual(
    parseV12GarminShardCliArgs(["--run", "phase20-20261014T031137Z-5917481c1fd1", "--verify"]),
    { runId: "phase20-20261014T031137Z-5917481c1fd1", mode: "verify" },
  );
  assert.throws(() => parseV12GarminShardCliArgs(["--verify", "--run", "phase20-20261014T031137Z-5917481c1fd1"]), /garmin_cli_invalid/);
  assert.throws(() => parseV12GarminShardCliArgs(["--run", "phase20-20261014T031137Z-5917481c1fd1", "--verify", "--device", "serial"]), /garmin_cli_invalid/);
});

test("Garmin shard rejects digest-only records, missing cases, identity drift, and retained verdict authority", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const validResult = {
    cases: V12_GARMIN_SHARD_CASE_IDS.map((id, order) => ({ id, order, status: "NOT_RUN", code: "native-not-run", count: 1 })),
  };
  const writes = new Map();
  const execute = await executeV12GarminShardCli(["--run", runId, "--execute"], {
    root: "/synthetic-root",
    readBuild: () => manifest,
    sourceDigest: "a".repeat(64),
    currentHead: manifest.source.head,
    isAncestor: () => true,
    acquireLease: () => ({ opaque: true }),
    releaseLease: () => true,
    snapshotSettings: () => ({ id: "settings-snapshot" }),
    restoreSettings: () => true,
    executeNative: () => validResult,
    writeImmutable: (file, value) => writes.set(file, value),
    outputExists: () => false,
  });
  assert.equal(execute.ok, true);
  assert.equal(writes.size, 5);
  assert.doesNotMatch(JSON.stringify([...writes.values()]), /serial|token|credential|payload|verdict|readiness|seal/i);
  await assert.rejects(
    executeV12GarminShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({ opaque: true }), releaseLease: () => true,
      snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => ({ cases: [{ id: "packaging", order: 0, status: "NOT_RUN", code: "native-not-run", count: 1 }] }),
      writeImmutable: () => {}, outputExists: () => false,
    }),
    /garmin_native_cases_invalid/,
  );
  await assert.rejects(
    executeV12GarminShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", readBuild: () => manifest, sourceDigest: "0".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, outputExists: () => false,
    }),
    /garmin_identity_mismatch/,
  );
  await assert.rejects(
    executeV12GarminShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({}), releaseLease: () => true, snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => ({ cases: validResult.cases.map((entry) => ({ ...entry, raw: "injected" })) }), writeImmutable: () => {}, outputExists: () => false,
    }),
    /garmin_native_cases_invalid/,
  );
});
