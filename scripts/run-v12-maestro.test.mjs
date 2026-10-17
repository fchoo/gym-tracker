import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { executeLiveV12RecoveryMaestro, runV12MaestroCli } from "./run-v12-maestro.mjs";
import { validateV12ProductionPublicationOrigins } from "./verify-v12-native-evidence.mjs";

const TEST_TIMEOUT_MS = 30_000;
const runId = "phase20-20261017T000000Z-aaaaaaaaaaaa";
const hash = (value) => createHash("sha256").update(value).digest("hex");

function manifest() {
  return {
    schema_version: 1,
    run_id: runId,
    mode: "live",
    evidence_origin: "test",
    created_at: "2026-10-17T00:00:00Z",
    source: { head: "a".repeat(40), tree_sha256: hash("tree"), dirty: false, package_json_sha256: hash("package"), package_lock_sha256: hash("lock") },
    planning: { matrix_sha256: hash("matrix"), requirements_sha256: hash("requirements"), source_manifest_sha256: hash("source-manifest"), owner_brief_sha256: hash("owner"), ui_spec_sha256: hash("ui"), deviations_sha256: hash("deviations") },
    prototype: { revision: 18, approval_sha256: hash("approval"), html_sha256: hash("html") },
    fixtures: { registry_sha256: hash("fixtures") },
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/test.apk", sha256: hash("apk"), size_bytes: 1, page_alignment_verified: true, signature_sha256: hash("signature"), certificate_sha256: hash("certificate") } },
    device: { identity_sha256: hash("device"), abi: "arm64-v8a", installed_apk_sha256: hash("apk"), settings_sha256: hash("settings"), restoration_sha256: hash("restoration") },
    configuration: { id: "AP-L-C390-P-F100" },
  };
}

function fixture(t, shard) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), `v12-maestro-${shard}-`)));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const details = {
    "multi-plan": ["phase13-", "src/testing/contracts/multiPlanRunning.contract.ts"],
    workout: ["workout.", "src/testing/contracts/phase15Workout.contract.ts"],
    "library-running": ["library.", "src/testing/contracts/phase17LibraryRunning.contract.ts"],
  }[shard];
  const caseIds = [`${details[0]}one`, `${details[0]}two`];
  const flow = `maestro/v1.2/${shard}.yaml`;
  const source = details[1];
  const build = manifest();
  for (const relative of [`artifacts/native/v1.2/${runId}/build.json`, flow, source]) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  }
  writeFileSync(path.join(root, `artifacts/native/v1.2/${runId}/build.json`), JSON.stringify(build));
  writeFileSync(path.join(root, flow), "appId: com.fchoo.gymtracker.devtest\n---\n- launchApp\n");
  writeFileSync(path.join(root, source), `export const CASES = ["${caseIds.join('\", \"')}"] as const;\n`);
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  writeFileSync(path.join(root, "scripts/run-v12-maestro.mjs"), readFileSync(new URL("./run-v12-maestro.mjs", import.meta.url)));
  const tools = {
    execution_origin: "test-controlled/v1",
    adb: path.join(root, "tools/adb"),
    maestro: path.join(root, "tools/maestro"),
    unzip: path.join(root, "tools/unzip"),
  };
  mkdirSync(path.join(root, "tools"), { recursive: true });
  for (const tool of Object.values(tools).filter((value) => path.isAbsolute(value))) writeFileSync(tool, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const calls = [];
  const execute = (program, args) => {
    calls.push(program);
    assert.equal(path.isAbsolute(program), true);
    if (path.basename(program) === "maestro" && args[0] === "--version") return "2.8.0\n";
    if (path.basename(program) === "maestro") {
      const output = args[args.indexOf("--output") + 1];
      const caseId = args.find((value) => value.startsWith("V12_CASE_ID=")).slice("V12_CASE_ID=".length);
      writeFileSync(output, `<testsuite><testcase name="${caseId}"/></testsuite>\n`);
      return "";
    }
    if (program === tools.adb && args.includes("get")) return "1\n";
    return "";
  };
  const currentIdentity = {
    head: build.source.head,
    tree_sha256: build.source.tree_sha256,
    package: build.build.package,
    apk_sha256: build.build.apk.sha256,
    installed_apk_sha256: build.device.installed_apk_sha256,
    certificate_sha256: build.build.apk.certificate_sha256,
    device_identity_sha256: build.device.identity_sha256,
    settings_sha256: build.device.settings_sha256,
    configuration_id: build.configuration.id,
  };
  return { root, build, caseIds, tools, calls, execute, currentIdentity };
}

test("alternate Recovery Maestro supplies canonical step and nonce variables through absolute tools", { timeout: TEST_TIMEOUT_MS }, (t) => {
  const value = fixture(t, "multi-plan");
  const flow = "maestro/v1.2/recovery.yaml";
  mkdirSync(path.dirname(path.join(value.root, flow)), { recursive: true });
  writeFileSync(path.join(value.root, flow), "appId: com.fchoo.gymtracker.devtest\n---\n- launchApp\n");
  const commands = [];
  const execute = (program, args) => {
    assert.equal(path.isAbsolute(program), true);
    if (path.basename(program) === "maestro" && args[0] === "--version") return "2.8.0\n";
    if (path.basename(program) === "maestro") {
      commands.push(args);
      const output = args[args.indexOf("--output") + 1];
      writeFileSync(output, "<testsuite><testcase name=\"recovery\"/></testsuite>\n");
      return "";
    }
    if (path.basename(program) === "adb" && args.includes("get")) return "0\n";
    return "";
  };
  const result = executeLiveV12RecoveryMaestro(["--run", runId, "--shard", "recovery"], {
    root: value.root,
    currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256,
    isAncestor: () => true,
    currentIdentity: value.currentIdentity,
    executionTools: value.tools,
    serial: "physical-device-20",
    execFileSync: execute,
  });

  assert.equal(result.executions, 224);
  assert.equal(commands.length, 224);
  for (const args of commands) {
    const variables = args.filter((value) => value.startsWith("V12_")).map(value => value.split("=")[0]);
    assert.deepEqual(variables, ["V12_DOMAIN_NONCE", "V12_RECOVERY_CASE", "V12_RECOVERY_STEP", "V12_RECOVERY_STAGE", "V12_RECOVERY_PHASE"]);
    assert.match(args.find(value => value.startsWith("V12_DOMAIN_NONCE=")), /^V12_DOMAIN_NONCE=[a-f0-9]{32}$/u);
  }
});

for (const shard of ["multi-plan", "workout", "library-running"]) {
  test(`${shard} publishes action-scoped provenance after absolute-tool execution`, { timeout: TEST_TIMEOUT_MS }, (t) => {
    const value = fixture(t, shard);
    const stdout = [];
    const stderr = [];
    const status = runV12MaestroCli(["--run", runId, "--shard", shard], {
      stdout: { write: (message) => stdout.push(message) },
      stderr: { write: (message) => stderr.push(message) },
    }, {
      root: value.root,
      serial: "physical-device-20",
      currentHead: value.build.source.head,
      sourceDigest: value.build.source.tree_sha256,
      isAncestor: () => true,
      currentIdentity: value.currentIdentity,
      executionTools: value.tools,
      execFileSync: value.execute,
    });

    assert.equal(status, 0, stderr.join(""));
    assert.equal(stderr.length, 0);
    assert.equal(JSON.parse(stdout.join("")).shard, shard);
    assert.ok(value.calls.length > 0);
    assert.ok(value.calls.every((program) => path.isAbsolute(program)));
    const publication = JSON.parse(readFileSync(path.join(value.root, `artifacts/native/v1.2/${runId}/publication/${shard}.json`), "utf8"));
    const mapping = JSON.parse(readFileSync(path.join(value.root, `artifacts/native/v1.2/${runId}/mapping/${shard}.json`), "utf8"));
    assert.match(mapping.git_attestation_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(publication.execution_origin.action, shard);
    assert.equal(publication.execution_origin.kind, "test-fixture");
    assert.equal(publication.execution_origin.toolchain_origin, "test-controlled/v1");
    assert.equal(publication.execution_origin.default_launcher, false);
    assert.equal(publication.execution_origin.test_only, true);
    assert.match(publication.execution_origin.adapter_source_sha256, /^[a-f0-9]{64}$/u);
    assert.match(publication.execution_origin.launcher_source_sha256, /^[a-f0-9]{64}$/u);
    assert.match(publication.execution_origin.domain_source_sha256, /^[a-f0-9]{64}$/u);
    assert.match(publication.execution_origin.request_attestation_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(publication.execution_origin.adapter_source_sha256, publication.execution_origin.launcher_source_sha256);
    assert.notEqual(publication.execution_origin.domain_source_sha256, publication.execution_origin.launcher_source_sha256);
    const productionManifest = JSON.parse(readFileSync(path.join(value.root, `artifacts/native/v1.2/${runId}/publication/${shard}.json`), "utf8"));
    productionManifest.execution_origin.kind = "production-default-launcher";
    productionManifest.execution_origin.toolchain_origin = "production-attested/v1";
    productionManifest.execution_origin.default_launcher = true;
    productionManifest.execution_origin.test_only = false;
    writeFileSync(path.join(value.root, `artifacts/native/v1.2/${runId}/publication/${shard}.json`), JSON.stringify(productionManifest));
    assert.equal(validateV12ProductionPublicationOrigins(value.root, runId, [shard]), true);
    assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/.staging`)), false);
  });
}
