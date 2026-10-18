import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import {
  createV12FunctionalExecutionReceipt,
  executeLiveV12RecoveryMaestro,
  executeLiveV12GenericMaestro,
  runV12BoundedProcess,
  runV12MaestroCli,
  validateV12DirectMaestroMapping,
  validateV12FunctionalExecutionReceipt,
} from "./run-v12-maestro.mjs";
import { digestV12CanonicalRestorationSnapshot } from "./v12-device-settings-contract.mjs";
import { validateV12ProductionPublicationOrigins } from "./verify-v12-native-evidence.mjs";

const TEST_TIMEOUT_MS = 30_000;
const runId = "phase20-20261017T000000Z-aaaaaaaaaaaa";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const DEVICE_FACTS = Object.freeze({ serial: "physical-device-20", abi: "arm64-v8a", apiLevel: "36", model: "Samsung N4" });
const DEVICE_SETTINGS = Object.freeze({ font_scale: "1", ui_night_mode: "1", animator_duration_scale: "1" });
const REAL_CASE_IDS = Object.freeze({
  "multi-plan": Object.freeze([
    "phase13-migration-failure-cuts", "phase13-map01-activation", "phase13-running-two-slots",
    "phase13-strength-completion-retry", "phase13-import-normalized-identity", "phase13-import-remove-restore",
    "phase13-match-invalidation", "phase13-stale-replay-no-resurrection", "phase13-bodyweight-correction-delete",
    "phase13-backup-clean-restore", "phase13-merge-rebuild", "phase13-source-generation-neutrality",
    "phase13-tim01-retirement",
  ]),
  workout: Object.freeze([
    "workout.root-identity", "workout.day-switch", "workout.scheduled-rest-empty", "workout.start-alternate",
    "workout.start-resume", "workout.context-running", "workout.active-layout", "workout.active-back",
    "workout.exercise-disclosure", "workout.active-indicator", "workout.set-states", "workout.row-edit",
    "workout.load-reps-editor", "workout.duration-editor", "workout.all-metrics", "workout.warmup-order",
    "workout.add-set", "workout.complete-commit", "workout.complete-failure", "workout.completion-collapse",
    "workout.rest-dock", "workout.rest-controls", "workout.rest-recovery", "workout.trend",
    "workout.exercise-menu", "workout.timing-flat", "workout.plan-increment", "workout.plan-after-workout",
    "workout.add-exercise", "workout.replace-exercise", "workout.delete-exercise", "workout.reorder",
    "workout.undo", "workout.outcomes", "workout.completion-review", "workout.completion-writeback",
    "workout.readonly-presentation", "workout.timing-policy", "workout.accessibility", "workout.appearance",
    "workout.offline-recovery", "workout.performance",
  ]),
  "library-running": Object.freeze([
    "library.remembered-state", "library.plan-groups", "library.exercise-search", "library.exercise-favorites",
    "library.actions-sheet", "library.neutral-plan-chooser", "library.true-no-plans", "library.owned-summary",
    "library.owned-lifecycle", "library.starter-detail", "library.starter-activation", "library.template-update",
    "library.create-strength", "library.plan-editor", "library.editor-draft-guards", "library.schedule-editor",
    "library.replacement-impact", "library.day-removal-impact", "library.builtin-exercise", "library.custom-exercise",
    "library.create-exercise", "library.copy-metric-migration", "library.load-error-recovery", "library.running-detail",
    "library.running-create-zero-sessions", "library.running-goal-edit", "library.running-session-common",
    "library.running-recovery", "library.running-long", "library.running-progression", "library.running-tempo",
    "library.running-intervals", "library.running-hills", "library.running-fartlek",
    "library.running-session-lifecycle", "library.running-conflict", "library.running-create-typed-sessions",
    "library.running-two-same-day-slots", "library.accessibility-recovery", "library.custom-exercise-edit",
    "library.custom-exercise-hide", "library.custom-exercise-unhide", "library.custom-exercise-copy-bundled",
    "library.custom-exercise-archive", "library.custom-exercise-reactivate", "library.metric-profile-migration",
  ]),
});
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
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "0.1.0", version_code: 1, apk: { path: "artifacts/native/v1.2-acceptance/test.apk", sha256: hash("apk"), size_bytes: 3, page_alignment_verified: true, signature_sha256: hash("signature"), certificate_sha256: hash("certificate") } },
    device: { identity_sha256: phase18DeviceIdentitySha256(DEVICE_FACTS), abi: DEVICE_FACTS.abi, installed_apk_sha256: hash("apk"), settings_sha256: digestV12CanonicalRestorationSnapshot(DEVICE_SETTINGS), restoration_sha256: hash("restoration") },
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
  const caseIds = REAL_CASE_IDS[shard];
  const flow = `maestro/v1.2/${shard}.yaml`;
  const source = details[1];
  const build = manifest();
  for (const relative of [`artifacts/native/v1.2/${runId}/build.json`, build.build.apk.path, flow, source]) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  }
  writeFileSync(path.join(root, `artifacts/native/v1.2/${runId}/build.json`), JSON.stringify(build));
  writeFileSync(path.join(root, build.build.apk.path), "apk");
  cpSync(path.join(process.cwd(), flow), path.join(root, flow));
  cpSync(path.join(process.cwd(), source), path.join(root, source));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  writeFileSync(path.join(root, "scripts/run-v12-maestro.mjs"), readFileSync(new URL("./run-v12-maestro.mjs", import.meta.url)));
  const tools = {
    execution_origin: "test-controlled/v1",
    test_only: true,
    adb: path.join(root, "tools/adb"),
    maestro: path.join(root, "tools/maestro"),
    unzip: path.join(root, "tools/unzip"),
  };
  mkdirSync(path.join(root, "tools"), { recursive: true });
  for (const tool of Object.values(tools).filter((value) => typeof value === "string" && path.isAbsolute(value))) writeFileSync(tool, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const calls = [];
  const maestroCaseIds = [];
  const execute = (program, args) => {
    calls.push(program);
    assert.equal(path.isAbsolute(program), true);
    if (path.basename(program) === "adb" && args[0] === "version") return "Android Debug Bridge version 1.0.41\n";
    if (path.basename(program) === "maestro" && args[0] === "--version") return "2.8.0\n";
    if (path.basename(program) === "unzip" && args[0] === "-v") return "UnZip 6.00\n";
    if (path.basename(program) === "maestro") {
      const output = args[args.indexOf("--output") + 1];
      const caseId = args.find((value) => value.startsWith("V12_CASE_ID=")).slice("V12_CASE_ID=".length);
      maestroCaseIds.push(caseId);
      writeFileSync(output, `<testsuite><testcase name="${caseId}"/></testsuite>\n`);
      return "";
    }
    if (program === tools.adb) {
      const command = args.slice(2);
      if (command[0] === "get-state") return "device\n";
      if (command.join(" ") === `shell pm list packages ${build.build.package}`) return `package:${build.build.package}\n`;
      if (command.join(" ") === `shell pm path ${build.build.package}`) return "package:/data/app/com.fchoo.gymtracker.devtest/base.apk\n";
      if (command.slice(0, 3).join(" ") === "shell sha256sum /data/app/com.fchoo.gymtracker.devtest/base.apk") return `${build.build.apk.sha256}  /data/app/com.fchoo.gymtracker.devtest/base.apk\n`;
      if (command.join(" ") === "shell getprop ro.product.cpu.abi") return `${DEVICE_FACTS.abi}\n`;
      if (command.join(" ") === "shell getprop ro.build.version.sdk") return `${DEVICE_FACTS.apiLevel}\n`;
      if (command.join(" ") === "shell getprop ro.product.model") return `${DEVICE_FACTS.model}\n`;
      if (command.includes("settings") && command.includes("get")) {
        const key = command.at(-1);
        return `${DEVICE_SETTINGS[key]}\n`;
      }
      if (command.includes("settings") && ["put", "delete"].some((action) => command.includes(action))) return "";
      if (command[0] === "exec-out" && command[1] === "cat" && command[2]?.includes("functional-source")) {
        return `<hierarchy text="PHASE14_SOURCE_STATE_PROOF digest_sha256=${hash("source-state")} table_count=27 row_count=0 schema_version=27"/>`;
      }
      if (command[0] === "exec-out" && command[1] === "cat" && command[2]?.includes("functional-ui")) {
        return '<hierarchy><node text="Case verified" resource-id="native-acceptance-readback"/></hierarchy>';
      }
    }
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
  return { root, build, caseIds, tools, calls, maestroCaseIds, execute, currentIdentity };
}

test("alternate Recovery Maestro supplies canonical step and nonce variables through absolute tools", { timeout: TEST_TIMEOUT_MS }, async (t) => {
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
  const result = await executeLiveV12RecoveryMaestro(["--run", runId, "--shard", "recovery"], {
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

test("functional receipt binds nonce, run, source, APK, device, and pre/action/post readbacks", () => {
  const build = manifest();
  const receipt = createV12FunctionalExecutionReceipt({
    nonce: "f".repeat(48), runId, shard: "workout", caseId: "workout.root-identity",
    identity: {
      source_tree_sha256: build.source.tree_sha256,
      apk_sha256: build.build.apk.sha256,
      installed_apk_sha256: build.device.installed_apk_sha256,
      device_identity_sha256: build.device.identity_sha256,
      configuration_id: build.configuration.id,
    },
    pre: { source_sha256: hash("sqlite-before") },
    action: { report_sha256: hash("maestro-action") },
    post: { source_sha256: hash("sqlite-after"), ui_sha256: hash("ui-readback") },
  });
  assert.equal(validateV12FunctionalExecutionReceipt(receipt, {
    runId, shard: "workout", caseId: "workout.root-identity", manifest: build,
  }), true);
  for (const mutate of [
    value => { value.nonce = "0".repeat(48); },
    value => { value.run_id = "phase20-20261018T000000Z-bbbbbbbbbbbb"; },
    value => { value.case_id = "workout.day-switch"; },
    value => { value.identity.apk_sha256 = "0".repeat(64); },
    value => { value.phases.pop(); },
    value => { value.phases.reverse(); },
    value => { value.receipt_sha256 = "0".repeat(64); },
  ]) {
    const changed = structuredClone(receipt); mutate(changed);
    assert.throws(() => validateV12FunctionalExecutionReceipt(changed, {
      runId, shard: "workout", caseId: "workout.root-identity", manifest: build,
    }), /v12_maestro_execution_receipt_invalid/u);
  }
});

test("v1.2 functional flows require a real per-case action and post-action readback", () => {
  for (const shard of ["multi-plan", "workout", "library-running"]) {
    const source = readFileSync(`maestro/v1.2/${shard}.yaml`, "utf8");
    assert.match(source, /V12_EVIDENCE_NONCE/u);
    assert.match(source, /tapOn:\s*\{ id: "native-acceptance-execute" \}/u);
    assert.match(source, /assertVisible:\s*\{ id: "native-acceptance-readback" \}/u);
  }
  assert.equal(existsSync("maestro/v1.2/accessibility.yaml"), false);
});

test("bounded supervisor kills a TERM-resistant process tree", { timeout: 10_000 }, async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-maestro-supervisor-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const childPid = path.join(root, "child.pid");
  const script = path.join(root, "hung.mjs");
  writeFileSync(script, `
    import { spawn } from "node:child_process";
    import { writeFileSync } from "node:fs";
    const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: "ignore" });
    writeFileSync(${JSON.stringify(childPid)}, String(child.pid));
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1000);
  `);
  await assert.rejects(() => runV12BoundedProcess(process.execPath, [script], {
    cwd: root, timeoutMs: 100, termGraceMs: 100, killGraceMs: 1_000,
  }), /v12_maestro_process_timeout/u);
  const descendant = Number(readFileSync(childPid, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.throws(() => process.kill(descendant, 0), /ESRCH/u);
});

test("hung Maestro restores settings and removes the lease before returning", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  const value = fixture(t, "multi-plan");
  let restoreCalls = 0;
  const runProcess = async (program, args, options) => {
    if (program === value.tools.maestro && args[0] === "test") throw new Error("v12_maestro_process_timeout");
    if (program === value.tools.adb && args.includes("put")) restoreCalls += 1;
    return value.execute(program, args, options);
  };
  await assert.rejects(() => executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    currentIdentity: value.currentIdentity, executionTools: value.tools, runProcess,
  }), /v12_maestro_native_command_timeout/u);
  assert.ok(restoreCalls >= 3);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/.leases/multi-plan-${DEVICE_FACTS.serial}.lease`)), false);
});
for (const shard of ["multi-plan", "workout", "library-running"]) {
  test(`${shard} publishes action-scoped provenance after absolute-tool execution`, { timeout: TEST_TIMEOUT_MS }, async (t) => {
    const value = fixture(t, shard);
    const stdout = [];
    const stderr = [];
    const status = await runV12MaestroCli(["--run", runId, "--shard", shard], {
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
    assert.equal(mapping.schema_version, 2);
    assert.equal(mapping.producer, "v12-maestro-source-map/v2");
    assert.equal(mapping.identity.package, value.build.build.package);
    assert.equal(mapping.identity.installed_apk_sha256, value.build.device.installed_apk_sha256);
    assert.equal(mapping.identity.device_identity_sha256, value.build.device.identity_sha256);
    assert.equal(mapping.identity.settings_sha256, value.build.device.settings_sha256);
    assert.deepEqual(mapping.tool_attestation.tools.map(({ name }) => name), ["adb", "maestro", "unzip"]);
    assert.ok(mapping.tool_attestation.tools.every(({ executable_realpath_sha256, executable_sha256, version }) => (
      /^[a-f0-9]{64}$/u.test(executable_realpath_sha256)
      && /^[a-f0-9]{64}$/u.test(executable_sha256)
      && version === "test-controlled"
    )));
    assert.ok(mapping.observations.every(({ device_measurement: measurement }) => (
      JSON.stringify(measurement.before) === JSON.stringify(measurement.after)
      && measurement.before.source === "attested-absolute-adb/v1"
      && measurement.before.package === value.build.build.package
      && measurement.before.installed_apk_sha256 === value.build.device.installed_apk_sha256
      && measurement.before.device_identity_sha256 === value.build.device.identity_sha256
      && measurement.before.settings_sha256 === value.build.device.settings_sha256
    )));
    assert.equal(new Set(mapping.observations.map(({ execution_receipt: receipt }) => receipt.nonce)).size, mapping.observations.length);
    assert.ok(mapping.observations.every(({ case_id: caseId, execution_receipt: receipt }) => (
      validateV12FunctionalExecutionReceipt(receipt, { runId, shard, caseId, manifest: value.build })
    )));
    const labelOnly = structuredClone(mapping);
    delete labelOnly.observations[0].execution_receipt;
    assert.throws(() => validateV12DirectMaestroMapping(labelOnly, {
      root: value.root, manifest: value.build, shard, allowTest: true,
    }), /v12_maestro_observation_mapping_invalid/u);
    const duplicateNonce = structuredClone(mapping);
    duplicateNonce.observations[1].execution_receipt = createV12FunctionalExecutionReceipt({
      nonce: duplicateNonce.observations[0].execution_receipt.nonce, runId, shard,
      caseId: duplicateNonce.observations[1].case_id,
      identity: duplicateNonce.observations[1].execution_receipt.identity,
      pre: { source_sha256: duplicateNonce.observations[1].execution_receipt.phases[0].source_sha256 },
      action: { report_sha256: duplicateNonce.observations[1].report_sha256 },
      post: {
        source_sha256: duplicateNonce.observations[1].execution_receipt.phases[2].source_sha256,
        ui_sha256: duplicateNonce.observations[1].execution_receipt.phases[2].ui_sha256,
      },
    });
    assert.throws(() => validateV12DirectMaestroMapping(duplicateNonce, {
      root: value.root, manifest: value.build, shard, allowTest: true,
    }), /v12_maestro_execution_receipt_invalid/u);
    const forgedMapping = structuredClone(mapping);
    forgedMapping.execution_origin.kind = "production-default-launcher";
    forgedMapping.execution_origin.toolchain_origin = "production-attested/v1";
    forgedMapping.execution_origin.default_launcher = true;
    forgedMapping.execution_origin.test_only = false;
    forgedMapping.tool_attestation.execution_origin = "production-attested/v1";
    forgedMapping.tool_attestation.test_only = false;
    forgedMapping.tool_attestation.tools.forEach((tool) => { tool.version = "forged-production-version"; });
    assert.throws(
      () => validateV12DirectMaestroMapping(forgedMapping, {
        root: value.root,
        manifest: value.build,
        shard,
        allowTest: true,
      }),
      /v12_maestro_request_attestation_invalid/u,
    );
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
    assert.throws(
      () => validateV12ProductionPublicationOrigins(value.root, runId, [shard]),
      /test_provenance_forbidden|adapter_provenance_invalid/u,
    );
    assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/.staging`)), false);
  });
}

test("direct Maestro rejects a forged injected identity when absolute adb measures another APK", async (t) => {
  const value = fixture(t, "multi-plan");
  const stderr = [];
  const execute = (program, args, options) => {
    if (program === value.tools.adb && args.slice(2, 4).join(" ") === "shell sha256sum") {
      return `${"f".repeat(64)}  /data/app/com.fchoo.gymtracker.devtest/base.apk\n`;
    }
    return value.execute(program, args, options);
  };
  const status = await runV12MaestroCli(["--run", runId, "--shard", "multi-plan"], {
    stdout: { write: () => undefined },
    stderr: { write: (message) => stderr.push(message) },
  }, {
    root: value.root,
    serial: DEVICE_FACTS.serial,
    currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256,
    isAncestor: () => true,
    currentIdentity: value.currentIdentity,
    executionTools: value.tools,
    execFileSync: execute,
  });

  assert.equal(status, 1);
  assert.match(stderr.join(""), /v12_maestro_identity_mismatch/u);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)), false);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/publication/multi-plan.json`)), false);
});

test("direct Maestro rejects device drift measured after a flow", async (t) => {
  const value = fixture(t, "multi-plan");
  const stderr = [];
  let flowExecuted = false;
  const execute = (program, args, options) => {
    if (program === value.tools.adb
      && args.slice(2).join(" ") === "shell getprop ro.product.model"
      && flowExecuted) return "Different device\n";
    const result = value.execute(program, args, options);
    if (program === value.tools.maestro && args[0] === "test") flowExecuted = true;
    return result;
  };
  const status = await runV12MaestroCli(["--run", runId, "--shard", "multi-plan"], {
    stdout: { write: () => undefined },
    stderr: { write: (message) => stderr.push(message) },
  }, {
    root: value.root,
    serial: DEVICE_FACTS.serial,
    currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256,
    isAncestor: () => true,
    currentIdentity: value.currentIdentity,
    executionTools: value.tools,
    execFileSync: execute,
  });

  assert.equal(status, 1);
  assert.match(stderr.join(""), /v12_maestro_identity_mismatch/u);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/mapping/multi-plan.json`)), false);
  assert.equal(existsSync(path.join(value.root, `artifacts/native/v1.2/${runId}/publication/multi-plan.json`)), false);
});

test("preseal provenance revalidates complete tools and current device measurements", async (t) => {
  const value = fixture(t, "multi-plan");
  const productionTools = Object.freeze({
    ...value.tools,
    execution_origin: "production-attested/v1",
    test_only: false,
  });
  const stderr = [];
  const status = await runV12MaestroCli(["--run", runId, "--shard", "multi-plan"], {
    stdout: { write: () => undefined },
    stderr: { write: (message) => stderr.push(message) },
  }, {
    root: value.root,
    serial: DEVICE_FACTS.serial,
    currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256,
    isAncestor: () => true,
    executionTools: productionTools,
    execFileSync: value.execute,
  });
  assert.equal(status, 0, stderr.join(""));
  assert.equal(validateV12ProductionPublicationOrigins(
    value.root,
    runId,
    ["multi-plan"],
    { executionTools: productionTools, execFileSync: value.execute, serial: DEVICE_FACTS.serial },
  ), true);

  const changedDevice = (program, args, options) => {
    if (program === value.tools.adb
      && args.slice(2).join(" ") === "shell getprop ro.product.model") return "Different device\n";
    return value.execute(program, args, options);
  };
  assert.throws(() => validateV12ProductionPublicationOrigins(
    value.root,
    runId,
    ["multi-plan"],
    { executionTools: productionTools, execFileSync: changedDevice, serial: DEVICE_FACTS.serial },
  ), /v12_preflight_adapter_provenance_invalid/u);
});

test("real source registries drive exact ordered mappings and executions", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  for (const shard of ["multi-plan", "workout", "library-running"]) {
    await t.test(shard, async () => {
      const value = fixture(t, shard);
      const stdout = [];
      const stderr = [];
      const status = await runV12MaestroCli(["--run", runId, "--shard", shard], {
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
      const mapping = JSON.parse(readFileSync(path.join(
        value.root,
        `artifacts/native/v1.2/${runId}/mapping/${shard}.json`,
      ), "utf8"));
      assert.deepEqual(mapping.case_ids, REAL_CASE_IDS[shard]);
      assert.deepEqual(mapping.observations.map(({ case_id }) => case_id), REAL_CASE_IDS[shard]);
      assert.deepEqual(value.maestroCaseIds, REAL_CASE_IDS[shard]);
      assert.equal(mapping.observations.length, { "multi-plan": 13, workout: 42, "library-running": 46 }[shard]);
    });
  }
});
