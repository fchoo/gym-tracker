import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "garmin", executionOrigin: "production-attested/v1", produce: ({ write }) => { write("a.json", "x"); write("a.json", "x"); } }), /second_write/u);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "garmin", produce: () => {} }), /attempt_consumed/u);
  mkdirSync(path.join(runRoot, ".staging"), { recursive: true }); symlinkSync(root, path.join(runRoot, ".staging", "link"));
  assert.throws(() => verifyV12AtomicShard({ root, runId, shard: "visual" }), /incomplete_attempt/u);
  assert.match(readFileSync(path.join(runRoot, "failures/garmin.json"), "utf8"), /retry_allowed/u);
});

test("Garmin atomic publication records only production-attested execution origin", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-garmin-origin-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId);
  mkdirSync(runRoot, { recursive: true });
  assert.throws(() => publishV12AtomicShard({
    root, runId, shard: "garmin", executionOrigin: "test-controlled/v1",
    produce: ({ write }) => write("garmin/result.json", { ok: true }),
  }), /execution_origin_invalid/u);
  const cleanRoot = mkdtempSync(path.join(tmpdir(), "v12-garmin-origin-ok-"));
  const cleanRunRoot = path.join(cleanRoot, "artifacts/native/v1.2", runId);
  mkdirSync(cleanRunRoot, { recursive: true });
  const result = publishV12AtomicShard({
    root: cleanRoot, runId, shard: "garmin", executionOrigin: "production-attested/v1",
    produce: ({ write }) => write("garmin/result.json", { ok: true }),
  });
  assert.equal(result.manifest.execution_origin, "production-attested/v1");
  assert.equal(verifyV12AtomicShard({ root: cleanRoot, runId, shard: "garmin" }), true);
  const manifestPath = path.join(cleanRunRoot, "publication/garmin.json");
  const altered = JSON.parse(readFileSync(manifestPath, "utf8"));
  altered.execution_origin = "test-controlled/v1";
  writeFileSync(manifestPath, JSON.stringify(altered));
  assert.throws(() => verifyV12AtomicShard({ root: cleanRoot, runId, shard: "garmin" }), /execution_origin_invalid/u);
});
