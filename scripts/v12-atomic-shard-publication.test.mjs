import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { publishV12AtomicShard, verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const runId = "phase20-20261014T000000Z-aaaaaaaaaaaa";
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
