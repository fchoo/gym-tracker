import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runV12PerformanceCli,
  writeV12PerformanceObservation,
} from "./v12-performance-shard.mjs";
import { performanceEvidence } from "./testing/v12-quality-evidence-fixture.mjs";
import { publishV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

test("--verify reads retained artifacts without constructing a live native adapter", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-performance-verify-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = "phase20-20261017T000000Z-aaaaaaaaaaaa";
  const identity = {
    base_head: "a".repeat(40),
    source_tree_sha256: digest("source"),
    apk_sha256: digest("apk"),
    installed_apk_sha256: digest("apk"),
    package: "com.fchoo.gymtracker.devtest",
    device_identity_sha256: digest("device"),
    fixture_sha256: digest("fixtures"),
  };
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(runRoot, { recursive: true });
  writeFileSync(path.join(runRoot, "build.json"), JSON.stringify({
    run_id: runId,
    source: { head: identity.base_head, tree_sha256: identity.source_tree_sha256 },
    fixtures: { registry_sha256: identity.fixture_sha256 },
    build: { profile: "development-test", package: identity.package, apk: { sha256: identity.apk_sha256 } },
    device: { installed_apk_sha256: identity.installed_apk_sha256, identity_sha256: identity.device_identity_sha256 },
  }));
  writeV12PerformanceObservation({
    runId,
    identity,
    root,
    collect: () => performanceEvidence(identity),
  });
  let stdout = "";
  let stderr = "";
  const status = runV12PerformanceCli(["--run", runId, "--verify"], {
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
  }, {
    root,
    createAdapter: () => { throw new Error("live_adapter_must_not_run"); },
  });
  assert.equal(status, 0, stderr);
  assert.deepEqual(JSON.parse(stdout), { run_id: runId, command: "--verify", ok: true });
});

test("--execute validates and byte-stably replays an existing atomic publication without a device", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-performance-replay-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runId = "phase20-20261017T000000Z-bbbbbbbbbbbb";
  const identity = {
    base_head: "b".repeat(40),
    source_tree_sha256: digest("source"),
    apk_sha256: digest("apk"),
    installed_apk_sha256: digest("apk"),
    package: "com.fchoo.gymtracker.devtest",
    device_identity_sha256: digest("device"),
    fixture_sha256: digest("fixtures"),
  };
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(runRoot, { recursive: true });
  writeFileSync(path.join(runRoot, "build.json"), JSON.stringify({
    run_id: runId,
    evidence_origin: "test",
    source: { head: identity.base_head, tree_sha256: identity.source_tree_sha256 },
    fixtures: { registry_sha256: identity.fixture_sha256 },
    build: { profile: "development-test", package: identity.package, apk: { sha256: identity.apk_sha256 } },
    device: { installed_apk_sha256: identity.installed_apk_sha256, identity_sha256: identity.device_identity_sha256 },
    configuration: { id: "AP-L-C390-P-F100" },
  }));
  publishV12AtomicShard({
    root,
    runId,
    shard: "performance",
    executionOrigin: {
      schema_version: 1,
      action: "performance",
      kind: "test-fixture",
      toolchain_origin: "test-controlled/v1",
      default_launcher: false,
      test_only: true,
      adapter_source_sha256: digest("adapter"),
      launcher_source_sha256: digest("launcher"),
      domain_source_sha256: digest("domain"),
      request_attestation_sha256: digest("request"),
    },
    produce: ({ write }) => writeV12PerformanceObservation({
      runId,
      identity,
      collect: () => performanceEvidence(identity),
      write: (file, value) => write(file.replace(`artifacts/native/v1.2/${runId}/`, ""), value),
    }),
  });
  const manifestPath = path.join(runRoot, "publication/performance.json");
  const observationPath = path.join(runRoot, "performance.json");
  const before = {
    manifest: readFileSync(manifestPath),
    observation: readFileSync(observationPath),
  };
  let adapterCalls = 0;
  let stdout = "";
  let stderr = "";
  const status = runV12PerformanceCli(["--run", runId, "--execute"], {
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
  }, {
    root,
    createAdapter: () => { adapterCalls += 1; throw new Error("live_adapter_must_not_run"); },
  });
  assert.equal(status, 0, stderr);
  assert.equal(adapterCalls, 0);
  assert.deepEqual(JSON.parse(stdout), { run_id: runId, command: "--execute", ok: true });
  assert.deepEqual(readFileSync(manifestPath), before.manifest);
  assert.deepEqual(readFileSync(observationPath), before.observation);

  const wrongOrigin = JSON.parse(before.manifest);
  wrongOrigin.execution_origin.action = "calendar";
  writeFileSync(manifestPath, `${JSON.stringify(wrongOrigin)}\n`);
  stderr = "";
  assert.equal(runV12PerformanceCli(["--run", runId, "--execute"], {
    stdout: { write: () => undefined },
    stderr: { write: (value) => { stderr += value; } },
  }, {
    root,
    createAdapter: () => { adapterCalls += 1; throw new Error("live_adapter_must_not_run"); },
  }), 1);
  assert.match(stderr, /v12_performance_shard_publication_invalid/u);
  assert.equal(adapterCalls, 0);

  writeFileSync(manifestPath, before.manifest);
  writeFileSync(observationPath, Buffer.from("tampered\n"));
  stderr = "";
  assert.equal(runV12PerformanceCli(["--run", runId, "--execute"], {
    stdout: { write: () => undefined },
    stderr: { write: (value) => { stderr += value; } },
  }, {
    root,
    createAdapter: () => { adapterCalls += 1; throw new Error("live_adapter_must_not_run"); },
  }), 1);
  assert.match(stderr, /v12_atomic_publish_member_invalid/u);
  assert.equal(adapterCalls, 0);
});
