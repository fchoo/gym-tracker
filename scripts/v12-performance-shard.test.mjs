import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runV12PerformanceCli,
  writeV12PerformanceObservation,
} from "./v12-performance-shard.mjs";
import { performanceEvidence } from "./testing/v12-quality-evidence-fixture.mjs";

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
