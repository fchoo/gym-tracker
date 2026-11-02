import assert from "node:assert/strict";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { executeV12EvidenceCli } from "../verify-v12-native-evidence.mjs";

test("test-only resolution consumes the retained attended record without granting sealing authority", () => {
  assert.equal(typeof process.env.V12_PHASE20_COVERAGE_FIXTURE, "string");
  const root = realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const run = readdirSync(path.join(root, "artifacts/native/v1.2")).find(name => name.startsWith("phase20-"));
  const attended = JSON.parse(readFileSync(path.join(root, "artifacts/native/v1.2", run, "attended-observations.json"), "utf8"));
  const resolved = executeV12EvidenceCli(["--run", run, "--mode", "test-resolve"], { root });
  assert.equal(resolved.producer, "v12-test-resolution/v1");
  assert.equal(resolved.run_id, run);
  assert.equal(resolved.sealable, false);
  assert.equal(resolved.row_evidence.length, 172);
  const row = resolved.row_evidence.find(item => item.row_id === "VER-12");
  const members = row.selector.resolution.members;
  assert.deepEqual(members.map(member => member.id), attended.rows.map(row => row.id));
  assert.deepEqual(members.map(member => member.result), attended.rows.map(row => row.status === "passed" ? "PASS" : "FAIL"));
});
