import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { publishV12AtomicShard, recordV12AtomicFailure, verifyV12AtomicShard } from "./v12-atomic-shard-publication.mjs";

const runId = "phase20-20261014T000000Z-bbbbbbbbbbbb";
const producers = Object.freeze([
  "capture-v12-visual.mjs", "compare-v12-visual.mjs", "v12-garmin-shard.mjs", "v12-calendar-shard.mjs",
  "v12-accessibility-shard.mjs", "v12-performance-shard.mjs", "verify-v12-native-evidence.mjs",
]);

test("Phase 20 shard and seal writers are bound to immutable publication", () => {
  for (const filename of producers) {
    const source = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
    assert.match(source, /publishV12AtomicShard|v12-atomic-shard-publication/u, filename);
  }
});

test("completed publication is verifiable and interrupted publications remain invalid with one receipt", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publication-integration-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId); mkdirSync(runRoot, { recursive: true });
  publishV12AtomicShard({ root, runId, shard: "visual", produce: ({ write }) => {
    write("screenshots/index.json", { run_id: runId, producer: "fixture" });
    write("screenshots/BW-001/AP-L-C390-P-F100/native.png", Buffer.from("png-fixture"));
  } });
  assert.equal(verifyV12AtomicShard({ root, runId, shard: "visual" }), true);
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "calendar", produce: ({ write }) => {
    write("calendar-transitions.json", "partial"); throw new Error("rename_failure");
  }}), /rename_failure/u);
  assert.equal(existsSync(path.join(runRoot, "publication/calendar.json")), false);
  assert.throws(() => verifyV12AtomicShard({ root, runId, shard: "calendar" }), /incomplete_attempt/u);
  const receipt = path.join(runRoot, "failures/calendar.json");
  assert.equal(JSON.parse(readFileSync(receipt, "utf8")).retry_allowed, false);
  assert.throws(() => recordV12AtomicFailure({ root, runId, shard: "calendar", error: new Error("second") }), /attempt_consumed/u);
});

test("publication rejects staging, symlink, and traversal substitution", () => {
  const root = mkdtempSync(path.join(tmpdir(), "v12-publication-rejection-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", runId); mkdirSync(runRoot, { recursive: true });
  assert.throws(() => publishV12AtomicShard({ root, runId, shard: "invalid", produce: ({ write }) => write("../performance.json", "x") }), /path_invalid/u);
  publishV12AtomicShard({ root, runId, shard: "performance", produce: ({ write }) => write("performance.json", "ok") });
  mkdirSync(path.join(runRoot, ".staging")); symlinkSync(root, path.join(runRoot, ".staging", "escape"));
  assert.throws(() => verifyV12AtomicShard({ root, runId, shard: "performance" }), /incomplete_attempt/u);
});
