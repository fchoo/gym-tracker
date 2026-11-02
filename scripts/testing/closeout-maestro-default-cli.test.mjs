import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sourceTreeSha256 } from "../source-tree-digest.mjs";
import { verifyV12AtomicShard } from "../v12-atomic-shard-publication.mjs";

test("the real functional CLI uses bounded default subprocesses and publishes its exact four members", t => {
  const archive = realpathSync(process.env.V12_PHASE20_COVERAGE_FIXTURE);
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "closeout-default-cli-")));
  t.after(() => {
    for (const name of readdirSync(root)) {
      if (name !== "scripts") rmSync(path.join(root, name), { recursive: true, force: true });
    }
    for (const name of readdirSync(path.join(root, "scripts"))) {
      if (name !== "run-v12-maestro.mjs") rmSync(path.join(root, "scripts", name), { recursive: true, force: true });
    }
  });
  cpSync(archive, root, { recursive: true });
  const project = process.cwd();
  symlinkSync(path.join(project, "node_modules"), path.join(root, "node_modules"));
  for (const helper of ["checklist.json", "identity.json", "observations.json", "test-resolution.json"]) rmSync(path.join(root, helper));
  copyFileSync(path.join(project, "scripts/run-v12-maestro.mjs"), path.join(root, "scripts/run-v12-maestro.mjs"));
  const run = readdirSync(path.join(root, "artifacts/native/v1.2")).find(name => name.startsWith("phase20-"));
  const runRoot = path.join(root, "artifacts/native/v1.2", run);
  const build = JSON.parse(readFileSync(path.join(runRoot, "build.json"), "utf8"));
  build.source.tree_sha256 = sourceTreeSha256(root);
  writeFileSync(path.join(runRoot, "build.json"), JSON.stringify(build));
  for (const member of ["publication/multi-plan.json", "mapping/multi-plan.json", "maestro/multi-plan.xml", "tools/direct-multi-plan-receipt.json", "tools/direct-multi-plan-runner.jar"]) rmSync(path.join(runRoot, member));
  const bins = path.join(root, "artifacts/fake-bin");
  mkdirSync(bins, { recursive: true });
  for (const tool of ["adb", "maestro", "unzip"]) writeFileSync(path.join(bins, tool), `#!/bin/sh\nexec '${process.execPath}' '${path.join(project, "scripts/testing/v12-phase20-blackbox/fake-device-tool.mjs")}' --tool ${tool} "$@"\n`, { mode: 0o755 });
  const result = spawnSync(process.execPath, [path.join(root, "scripts/run-v12-maestro.mjs"), "--run", run, "--shard", "multi-plan"], {
    cwd: root, encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PATH: `${bins}:${process.env.PATH}`, NODE_ENV: "test", V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess", V12_NATIVE_ADAPTER_TEST_PROCESS: "1", V12_NATIVE_ADAPTER_COMMAND: path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"), V12_NATIVE_ADAPTER_BATCH: "1", V12_DEVICE_SERIAL: "fake-device-20", V12_EXECUTION_ORIGIN: "test-controlled/v1", V12_ADB_PATH: path.join(bins, "adb"), V12_MAESTRO_PATH: path.join(bins, "maestro"), V12_UNZIP_PATH: path.join(bins, "unzip") },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).shard, "multi-plan");
  assert.equal(verifyV12AtomicShard({ root, runId: run, shard: "multi-plan" }), true);
  const publication = JSON.parse(readFileSync(path.join(runRoot, "publication/multi-plan.json"), "utf8"));
  assert.deepEqual(publication.members.map(member => member.artifact).sort(), ["maestro/multi-plan.xml", "mapping/multi-plan.json", "tools/direct-multi-plan-receipt.json", "tools/direct-multi-plan-runner.jar"].sort());
  assert.equal(publication.execution_origin.test_only, true);
});
