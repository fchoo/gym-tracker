import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  runV12VisualCaptureCli,
  verifyV12VisualCapture,
} from "./capture-v12-visual.mjs";
import {
  runV12VisualComparisonCli,
  verifyV12VisualComparison,
} from "./compare-v12-visual.mjs";

const root = process.env.V12_PHASE20_COVERAGE_FIXTURE;

test("retained visual capture and comparison indexes re-verify through public APIs and CLIs", {
  skip: root === undefined,
  timeout: 10 * 60_000,
}, () => {
  const runId = readdirSync(path.join(root, "artifacts/native/v1.2"))
    .find((entry) => entry.startsWith("phase20-"));
  assert.ok(runId);
  assert.equal(verifyV12VisualCapture({ runId, root }), true);
  assert.equal(verifyV12VisualComparison({ runId, root }), true);

  const output = [];
  const errors = [];
  const io = {
    stdout: { write: (value) => output.push(String(value)) },
    stderr: { write: (value) => errors.push(String(value)) },
  };
  const previous = process.cwd();
  try {
    process.chdir(root);
    assert.equal(runV12VisualCaptureCli(["--run", runId, "--verify"], io), 0);
    assert.equal(runV12VisualComparisonCli(["--run", runId, "--verify"], io), 0);
  } finally {
    process.chdir(previous);
  }
  assert.equal(output.length, 2);
  assert.deepEqual(errors, []);
  assert.doesNotThrow(() => JSON.parse(readFileSync(
    path.join(root, `artifacts/native/v1.2/${runId}/comparison/index.json`),
    "utf8",
  )));
});
