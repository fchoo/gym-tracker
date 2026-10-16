import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { publishV12AtomicShard, verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const productionOrigin = Object.freeze({
  schema_version: 1,
  kind: "production-default-launcher",
  default_launcher: true,
  test_only: false,
  adapter_source_sha256: "a".repeat(64),
  launcher_source_sha256: "b".repeat(64),
  request_attestation_sha256: "c".repeat(64),
});
test("atomic publisher rejects traversal, second writes, failed retries, and symlink attempts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId); mkdirSync(runRoot, { recursive: true });
  const result = publishV12AtomicShard({ root, runId, shard: "visual", produce: ({ write }) => write("screenshots/index.json", { ok: true }) });
  assert.equal(result.manifest.completed, true); assert.equal(verifyV12AtomicShard({ root, runId, shard: "visual" }), true);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "visual", produce: () => {} }), /attempt_consumed/u);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "calendar", produce: ({ write }) => write("../escape", "x") }), /path_invalid/u);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "garmin", produce: ({ write }) => { write("a.json", "x"); write("a.json", "x"); } }), /second_write/u);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "garmin", produce: () => {} }), /attempt_consumed/u);
  mkdirSync(path.join(runRoot, ".staging"), { recursive: true }); symlinkSync(root, path.join(runRoot, ".staging", "link"));
  assert.throws(() => verifyV12AtomicShard({ root, runId, shard: "visual" }), /incomplete_attempt/u);
  assert.match(readFileSync(path.join(runRoot, "failures/garmin.json"), "utf8"), /retry_allowed/u);
});

test("atomic publisher seals adapter execution provenance after production completes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-origin-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId); mkdirSync(runRoot, { recursive: true });
  const result = publishV12AtomicShard({
    root,
    runId,
    shard: "visual",
    executionOrigin: () => productionOrigin,
    produce: ({ write }) => write("screenshots/index.json", { ok: true }),
  });
  assert.deepEqual(result.manifest.execution_origin, productionOrigin);
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "visual" }), true);
  rmSync(root, { recursive: true, force: true });
});

test("atomic publisher rejects malformed execution provenance before publication", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publish-origin-invalid-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId); mkdirSync(runRoot, { recursive: true });
  assert.throws(() => publishV12AtomicShard({
    root,
    runId,
    shard: "visual",
    executionOrigin: { ...productionOrigin, test_only: "false" },
    produce: ({ write }) => write("screenshots/index.json", { ok: true }),
  }), /execution_origin_invalid/u);
  assert.equal(existsSync(path.join(runRoot, "publication/visual.json")), false);
  rmSync(root, { recursive: true, force: true });
});
