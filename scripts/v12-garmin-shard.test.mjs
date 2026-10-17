import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  executeV12GarminShardCli,
  parseV12GarminShardCliArgs,
  V12_GARMIN_SHARD_CASE_IDS,
} from "./v12-garmin-shard.mjs";

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
    producer: "v12-production-garmin-host/v1",
    cases: V12_GARMIN_SHARD_CASE_IDS.map((id, order) => ({
      id, order, status: "PASS", code: `${id}-observed`, count: id === "match-one" ? 1 : 0,
      receipt_sha256: String(order).padStart(64, "a").slice(-64),
    })),
    execution_origin: "production-attested/v1",
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
      executeNative: () => ({ ...validResult, execution_origin: "test-controlled/v1" }),
      writeImmutable: () => assert.fail("test provenance must not write shard members"),
      writeFailureReceipt: () => undefined, outputExists: () => false,
    }),
    /garmin_execution_origin_invalid/,
  );
  await assert.rejects(
    executeV12GarminShardCli(["--run", runId, "--execute"], {
      root: "/synthetic-root", readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
      isAncestor: () => true, acquireLease: () => ({ opaque: true }), releaseLease: () => true,
      snapshotSettings: () => ({}), restoreSettings: () => true,
      executeNative: () => ({ producer: "v12-production-garmin-host/v1", cases: [{ id: "packaging", order: 0, status: "PASS", code: "packaging-observed", count: 1, receipt_sha256: "a".repeat(64) }] }),
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

test("Garmin verify requires the atomic completion manifest, exact four JSON schemas, all receipts, and 18 passing JUnit outcomes", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const identity = {
    source_digest: "a".repeat(64), fixture_digest: "b".repeat(64), apk_digest: "c".repeat(64),
    installed_apk_digest: "c".repeat(64), device_digest: "d".repeat(64), settings_digest: "e".repeat(64),
    restoration_digest: "f".repeat(64), configuration_id: "AP-L-C390-P-F100",
  };
  const cases = V12_GARMIN_SHARD_CASE_IDS.map((id, order) => ({ id, order, status: "PASS", code: `${id}-observed`, count: id === "match-one" ? 1 : 0, receipt_sha256: String(order).padStart(64, "a").slice(-64) }));
  const base = { schema_version: 2, producer: "v12-garmin-shard/v3", run_id: runId, identity };
  const artifacts = new Map([
    [`artifacts/native/v1.2/${runId}/garmin/packaging-auth.json`, JSON.stringify({ ...base, schema: "packaging-auth/v1", cases: [cases[0], cases[1], cases[4], cases[5]] })],
    [`artifacts/native/v1.2/${runId}/garmin/sync-read.json`, JSON.stringify({ ...base, schema: "sync-read/v1", cases: [cases[2], cases[3], cases[17]] })],
    [`artifacts/native/v1.2/${runId}/garmin/dedupe.json`, JSON.stringify({ ...base, schema: "dedupe/v1", cases: cases.slice(6, 9) })],
    [`artifacts/native/v1.2/${runId}/garmin/matching.json`, JSON.stringify({ ...base, schema: "matching/v1", cases: cases.slice(9, 17) })],
    [`artifacts/native/v1.2/${runId}/maestro/garmin-progress.xml`, `<?xml version="1.0" encoding="UTF-8"?><testsuite name="v12-garmin" tests="18" failures="0" errors="0" skipped="0" source_digest="${identity.source_digest}">${cases.map(({ id }) => `<testcase classname="v12.garmin" name="${id}"></testcase>`).join("")}</testsuite>\n`],
  ]);
  const publication = {
    schema_version: 1, producer: "v12-atomic-shard-publication/v1", run_id: runId, shard: "garmin", execution_origin: "production-attested/v1", identity: {}, completed: true,
    members: [...artifacts].map(([file, value]) => ({ artifact: file.split(`${runId}/`)[1], sha256: createHash("sha256").update(value).digest("hex"), size_bytes: Buffer.byteLength(value) })),
  };
  assert.deepEqual(await executeV12GarminShardCli(["--run", runId, "--verify"], {
    root: "/synthetic-root", readBuild: () => manifest, sourceDigest: identity.source_digest, currentHead: manifest.source.head,
    isAncestor: () => true, outputExists: (file) => artifacts.has(file), readArtifact: (file) => artifacts.get(file),
    readPublication: () => publication, verifyAtomic: () => true,
  }), { ok: true, mode: "verify", run_id: runId });
  publication.execution_origin = "test-controlled/v1";
  await assert.rejects(executeV12GarminShardCli(["--run", runId, "--verify"], {
    root: "/synthetic-root", readBuild: () => manifest, sourceDigest: identity.source_digest, currentHead: manifest.source.head,
    isAncestor: () => true, outputExists: (file) => artifacts.has(file), readArtifact: (file) => artifacts.get(file),
    readPublication: () => publication, verifyAtomic: () => true,
  }), /garmin_publication_invalid/u);
  publication.execution_origin = "production-attested/v1";
  publication.members.pop();
  await assert.rejects(executeV12GarminShardCli(["--run", runId, "--verify"], {
    root: "/synthetic-root", readBuild: () => manifest, sourceDigest: identity.source_digest, currentHead: manifest.source.head,
    isAncestor: () => true, outputExists: (file) => artifacts.has(file), readArtifact: (file) => artifacts.get(file),
    readPublication: () => publication, verifyAtomic: () => true,
  }), /garmin_publication_invalid/u);
});

test("auth_required writes only a bounded failure receipt and no shard members", async () => {
  const runId = "phase20-20261014T031137Z-5917481c1fd1";
  const manifest = {
    run_id: runId,
    source: { tree_sha256: "a".repeat(64), head: "5917481c1fd1" + "b".repeat(28) },
    fixtures: { registry_sha256: "b".repeat(64) },
    build: { package: "com.fchoo.gymtracker.devtest", apk: { sha256: "c".repeat(64) } },
    device: { installed_apk_sha256: "c".repeat(64), identity_sha256: "d".repeat(64), settings_sha256: "e".repeat(64), restoration_sha256: "f".repeat(64) },
    configuration: { id: "AP-L-C390-P-F100" },
  };
  const writes = [];
  await assert.rejects(executeV12GarminShardCli(["--run", runId, "--execute"], {
    root: "/synthetic-root", readBuild: () => manifest, sourceDigest: "a".repeat(64), currentHead: manifest.source.head,
    isAncestor: () => true, outputExists: () => false, acquireLease: () => ({ opaque: true }), releaseLease: () => true,
    snapshotSettings: () => ({}), restoreSettings: () => true,
    executeNative: () => { throw new Error("v12_native_adapter_command_failed:auth_required"); },
    writeImmutable: (file) => writes.push(file), writeFailureReceipt: (value) => writes.push({ failure: value }),
  }), /auth_required/u);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]), ["failure"]);
  assert.equal(writes[0].failure.failure_code, "auth_required");
  assert.equal(writes.some((value) => typeof value === "string" && /garmin\/(?:packaging|sync|dedupe|matching)|maestro/u.test(value)), false);
});
