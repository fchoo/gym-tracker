import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("a retained test-origin run cannot publish native preseal or final evidence through the CLI", () => {
  assert.equal(typeof process.env.V12_PHASE20_COVERAGE_FIXTURE, "string", "the retained synthetic dataset is required");
  const root = realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const run = readdirSync(path.join(root, "artifacts/native/v1.2")).find(name => name.startsWith("phase20-"));
  assert.equal(typeof run, "string");
  const script = fileURLToPath(new URL("../verify-v12-native-evidence.mjs", import.meta.url));
  for (const args of [
    ["--run", run, "--mode", "preseal", "--no-final-write"],
    ["--run", run, "--mode", "final"],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr.trim(), /^v12_preflight_test_origin_forbidden$/u);
  }
  for (const output of ["publication/preseal.json", "publication/final.json", "preseal-validation.json", "final-evidence.json", "readiness-handoff.md"]) {
    assert.equal(existsSync(path.join(root, "artifacts/native/v1.2", run, output)), false, output);
  }
});
