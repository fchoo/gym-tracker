import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const run = "phase20-20261014T000000Z-aaaaaaaaaaaa";
const invoke = (script, args, cwd = root) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env: { ...process.env, V12_NATIVE_ADAPTER_COMMAND: "__no_device_adapter__" } });

test("every Phase 20 command is reached through its real subprocess parser without device authority", () => {
  const commands = [
    ["scripts/capture-v12-visual.mjs", ["--run", run, "--verify"]],
    ["scripts/compare-v12-visual.mjs", ["--run", run, "--verify"]],
    ["scripts/v12-accessibility-shard.mjs", ["--run", run, "--verify"]],
    ["scripts/v12-performance-shard.mjs", ["--run", run, "--verify"]],
    ["scripts/v12-garmin-shard.mjs", ["--run", run, "--verify"]],
    ["scripts/v12-calendar-shard.mjs", ["--run", run, "--verify"]],
    ["scripts/run-v12-maestro.mjs", ["--run", run, "--shard", "workout"]],
    ["scripts/verify-v12-native-evidence.mjs", ["--run", run, "--mode", "shards-only", "--ids", "visual"]],
    ["scripts/generate-v12-parity-report.mjs", ["--final-evidence", "../escape.json"]],
  ];
  for (const [script, args] of commands) {
    const result = invoke(script, args);
    assert.notEqual(result.status, 0, `${script} must fail closed without a prepared disposable run`);
    assert.match(`${result.stderr}${result.stdout}`, /(?:invalid|missing|required|failed|error|ENOENT)/iu);
  }
});

test("attended prepare, record, and verify run as real subprocesses in a disposable tree", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "v12-attended-cli-"));
  const identity = { run_id: "v12-samsung-acceptance-test-run", source_tree_sha256: "a".repeat(64), apk_sha256: "b".repeat(64), apk_signature_sha256: "c".repeat(64), installed_apk_sha256: "b".repeat(64), config_sha256: "d".repeat(64), device: { device_sha256: "e".repeat(64), model: "SM-S916B" } };
  const identityFile = path.join(temp, "identity.json"); const checklist = path.join(temp, "checklist.json"); const observations = path.join(temp, "observations.json"); const record = path.join(temp, "record.json");
  writeFileSync(identityFile, JSON.stringify(identity));
  let result = invoke("scripts/generate-v12-attended-checklist.mjs", ["prepare", "--identity", identityFile, "--output", checklist]);
  assert.equal(result.status, 0, result.stderr);
  const rows = Array.from({ length: 7 }, (_, index) => ({ id: `S20-0${index + 1}`, status: "passed", png_sha256: `${index + 1}`.repeat(64) }));
  writeFileSync(observations, JSON.stringify({ schema_version: 1, suite: "v12-samsung-attended-observations", identity, rows }));
  result = invoke("scripts/generate-v12-attended-checklist.mjs", ["record", "--checklist", checklist, "--observations", observations, "--output", record]);
  assert.equal(result.status, 0, result.stderr);
  result = invoke("scripts/generate-v12-attended-checklist.mjs", ["verify", "--checklist", checklist, "--observations", observations]);
  assert.equal(result.status, 0, result.stderr);
});
