import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY } from "../src/testing/v12NativeAcceptanceProductRegistry.ts";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import {
  createV12AppFunctionalReadbacks,
  createV12DirectMaestroToolAttestation,
  readV12DirectSafeSdkIdentity,
  readV12DirectLeaseOwner,
  validateV12DirectSafeSdkAttestation,
  assertV12ProductCaseEnvironmentRegistry,
  createV12FunctionalExecutionReceipt,
  createV12ProductCaseEnvironment,
  executeLiveV12RecoveryMaestro,
  executeLiveV12GenericMaestro,
  runV12BoundedProcess,
  runV12MaestroCli,
  validateV12DirectMaestroMapping,
  validateV12FunctionalCaseReadbacks,
  validateV12FunctionalExecutionReceipt,
  validateV12ProductCaseEnvironment,
} from "./run-v12-maestro.mjs";
import { digestV12CanonicalRestorationSnapshot } from "./v12-device-settings-contract.mjs";
import { createV12PosixProcessTreeTracker, V12_POSIX_OWNERSHIP_ENV } from "./v12-posix-process-tree.mjs";
import { validateV12ProductionPublicationOrigins } from "./verify-v12-native-evidence.mjs";

const TEST_TIMEOUT_MS = 30_000;
const runId = "phase20-20261017T000000Z-aaaaaaaaaaaa";
const hash = (value) => createHash("sha256").update(value).digest("hex");

function sdkIdentityFixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "direct-sdk-identity-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "scripts/maestro-safe-sdk");
  const lib = path.join(root, "lib"); const jdk = path.join(root, "jdk");
  mkdirSync(source, { recursive: true }); mkdirSync(lib); mkdirSync(path.join(jdk, "bin"), { recursive: true });
  writeFileSync(path.join(root, "scripts/v12-maestro-safe-sdk.mjs"), "controlled-wrapper");
  for (const name of ["SafeFlow.kt", "SafeMaestro.kt", "SessionOwnedDriver.kt"]) writeFileSync(path.join(source, name), `controlled-source:${name}`);
  const java = path.join(jdk, "bin/java"); const compiler = path.join(root, "compiler.jar");
  writeFileSync(java, "controlled-java", { mode: 0o755 }); writeFileSync(compiler, "controlled-compiler");
  writeFileSync(path.join(lib, "runtime.jar"), "controlled-runtime");
  const toolchain = { lib, compiler, jdk, pins: { maestro_version: "2.8.0", compiler: { version: "2.2.0", sha256: hash("controlled-compiler") },
    jdk: { version: "17.0.20+8", files: { "bin/java": hash("controlled-java") } }, jars: { "runtime.jar": hash("controlled-runtime") } } };
  const runCommand = (program, args) => {
    assert.equal(program, java); assert.deepEqual(args, ["-version"]);
    return { status: 0, stderr: 'openjdk version "17.0.20"\nTemurin-17.0.20+8\n' };
  };
  const readIdentity = () => readV12DirectSafeSdkIdentity({ root, toolchain, runCommand });
  const identity = readIdentity(); const jar = Buffer.from("controlled-retained-jar");
  const receipt = { ...identity, jar_sha256: hash(jar) };
  const prefix = `artifacts/native/v1.2/${runId}/tools/direct-multi-plan`;
  const receiptPath = `${prefix}-receipt.json`; const jarPath = `${prefix}-runner.jar`;
  mkdirSync(path.dirname(path.join(root, jarPath)), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(receipt));
  writeFileSync(path.join(root, receiptPath), bytes); writeFileSync(path.join(root, jarPath), jar);
  const value = { schema_version: 1, identity_sha256: hash(JSON.stringify(identity)), receipt_path: receiptPath,
    receipt_sha256: hash(bytes), jar_path: jarPath, jar_sha256: hash(jar) };
  // Identity uses binary key order, independent of JSON insertion order.
  const stable = value => value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);
  value.identity_sha256 = hash(stable(identity));
  return { root, value, receipt, jar, readIdentity, toolchain, runCommand };
}

test("retained SDK identity excludes compilation timestamps while hashing the actual JAR and complete current inputs", t => {
  const f = sdkIdentityFixture(t);
  assert.equal(validateV12DirectSafeSdkAttestation(f.value, { root: f.root, runId, shard: "multi-plan", readIdentity: f.readIdentity }), true);
  writeFileSync(path.join(f.root, "scripts/maestro-safe-sdk/SafeFlow.kt"), "changed-current-source");
  assert.throws(() => validateV12DirectSafeSdkAttestation(f.value, { root: f.root, runId, shard: "multi-plan", readIdentity: f.readIdentity }), /safe_sdk_attestation_invalid/u);
});

test("SDK attestation rejects malformed scope, hashes, bytes, paths, symlinks and synthetic production receipts", async t => {
  for (const [name, mutate] of [
    ["wrong schema", f => { f.value.schema_version = 2; }],
    ["wrong hash", f => { f.value.jar_sha256 = "not-hash"; }],
    ["wrong run", f => { f.value.jar_path = f.value.jar_path.replace(runId, "another-run"); }],
    ["absolute path", f => { f.value.receipt_path = path.join(f.root, f.value.receipt_path); }],
    ["traversal", f => { f.value.jar_path += "/../runner.jar"; }],
    ["receipt hash", f => { f.value.receipt_sha256 = "0".repeat(64); }],
    ["identity hash", f => { f.value.identity_sha256 = "0".repeat(64); }],
    ["JAR bytes", f => { writeFileSync(path.join(f.root, f.value.jar_path), "changed"); }],
    ["missing JAR", f => { rmSync(path.join(f.root, f.value.jar_path)); }],
    ["non-file JAR", f => { rmSync(path.join(f.root, f.value.jar_path)); mkdirSync(path.join(f.root, f.value.jar_path)); }],
    ["symlink JAR", f => { rmSync(path.join(f.root, f.value.jar_path)); symlinkSync(path.join(f.root, f.value.receipt_path), path.join(f.root, f.value.jar_path)); }],
    ["invalid JSON", f => { writeFileSync(path.join(f.root, f.value.receipt_path), "invalid"); f.value.receipt_sha256 = hash("invalid"); }],
  ]) await t.test(name, t => {
    const f = sdkIdentityFixture(t); mutate(f);
    assert.throws(() => validateV12DirectSafeSdkAttestation(f.value, { root: f.root, runId, shard: "multi-plan", readIdentity: f.readIdentity }), /safe_sdk_attestation_invalid/u);
  });
  const f = sdkIdentityFixture(t);
  for (const options of [{ runId: "invalid", shard: "multi-plan" }, { runId, shard: "unknown" }, { runId, shard: "multi-plan", testOnly: true }]) {
    assert.throws(() => validateV12DirectSafeSdkAttestation(f.value, { root: f.root, ...options, readIdentity: f.readIdentity }), /safe_sdk_attestation_invalid/u);
  }
  assert.throws(() => validateV12DirectSafeSdkAttestation({}, { root: f.root, runId, shard: "multi-plan" }), /safe_sdk_attestation_invalid/u);
});

test("all native APK identity guards accept Android opaque install segments", () => {
  const files = [
    ["scripts/v12-production-native-runtime.mjs", 1],
    ["scripts/v12-production-native-quality-actions.mjs", 1],
    ["scripts/v12-production-native-visual-actions.mjs", 1],
    ["scripts/run-v12-maestro.mjs", 2],
  ];
  const prefix = "/^package:\\/data\\/app\\/";
  for (const [file, expected] of files) {
    const lines = readFileSync(file, "utf8").split("\n").filter(line => line.includes(prefix));
    assert.equal(lines.length, expected, file);
    for (const line of lines) {
      const start = line.indexOf(prefix);
      const end = line.indexOf("/u", start) + 2;
      const guard = new RegExp(line.slice(start + 1, end - 2), "u");
      assert.equal(guard.test("package:/data/app/controlled/base.apk"), true, file);
      assert.equal(guard.test("package:/data/app/~~opaque-token==/com.fchoo.gymtracker.devtest-token==/base.apk"), true, file);
      assert.equal(guard.test("package:/data/user/0/base.apk"), false, file);
      assert.equal(guard.test("package:/data/app/base.apk;command"), false, file);
      assert.equal(guard.test("package:/data/app/base.apk\npackage:/data/app/split.apk"), false, file);
    }
  }
});

const DEVICE_FACTS = Object.freeze({ serial: "physical-device-20", abi: "arm64-v8a", apiLevel: "36", model: "Samsung N4" });
const DEVICE_SETTINGS = Object.freeze({ font_scale: "1", ui_night_mode: "1", animator_duration_scale: "1" });
const deviceLeasePath = (root) => path.join(root,
  `artifacts/native/v1.2/${runId}/.leases/device-${hash(DEVICE_FACTS.serial)}.lease`);
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

function productFlowSource(shard) {
  const file = `maestro/v1.2/${shard}.yaml`;
  const source = readFileSync(file, "utf8");
  if (source.includes("V12_PRODUCT_URL")) return source;
  return source
    .replace("- launchApp: { clearState: false, stopApp: true, permissions: { notifications: deny } }", [
      "- assertTrue: ${V12_PRODUCT_URL != null}",
      "- assertTrue: ${V12_PRODUCT_READY_VALUE != null}",
      "- assertTrue: ${V12_PRODUCT_ACTION_VALUE != null}",
      "- assertTrue: ${V12_PRODUCT_RESULT_VALUE != null}",
      "- launchApp: { clearState: false, stopApp: true, permissions: { notifications: deny } }",
    ].join("\n"))
    .replace([
      `- openLink: "gymtracker-devtest:///native-acceptance/${shard}?case=\${V12_CASE_ID}&fixture=\${V12_FIXTURE_ID}&nonce=\${V12_EVIDENCE_NONCE}"`,
      "- extendedWaitUntil: { visible: \"Native acceptance fixture\", timeout: 30000 }",
      "- assertVisible: { id: \"native-acceptance-stage\" }",
      "- assertVisible: \"${V12_CASE_ID}\"",
      "- tapOn: { id: \"native-acceptance-execute\" }",
    ].join("\n"), [
      "- openLink: \"${V12_PRODUCT_URL}\"",
      "- extendedWaitUntil: { visible: { id: \"${V12_PRODUCT_READY_VALUE}\" }, timeout: 30000 }",
      "- tapOn: { id: \"${V12_PRODUCT_ACTION_VALUE}\" }",
      "- extendedWaitUntil: { visible: { id: \"${V12_PRODUCT_RESULT_VALUE}\" }, timeout: 30000 }",
      `- openLink: "gymtracker-devtest:///native-acceptance/${shard}?case=\${V12_CASE_ID}&fixture=\${V12_FIXTURE_ID}&nonce=\${V12_EVIDENCE_NONCE}&mode=receipt"`,
    ].join("\n"));
}
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
  writeFileSync(path.join(root, flow), productFlowSource(shard));
  cpSync(path.join(process.cwd(), source), path.join(root, source));
  for (const file of new Set(V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY.flatMap((entry) => [
    entry.routeSource,
    entry.selectorSource,
    entry.callbackSource,
    entry.readySource,
    entry.resultSource,
    entry.phaseFlowSource,
    ...entry.prerequisites.flatMap((prerequisite) => [
      prerequisite.selectorSource,
      prerequisite.callbackSource,
    ]),
  ].filter((value) => value !== null)))) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(process.cwd(), file), path.join(root, file));
  }
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  writeFileSync(path.join(root, "scripts/run-v12-maestro.mjs"), readFileSync(new URL("./run-v12-maestro.mjs", import.meta.url)));
  cpSync(path.join(process.cwd(), "scripts/maestro-safe-sdk"), path.join(root, "scripts/maestro-safe-sdk"), { recursive: true });
  cpSync(path.join(process.cwd(), "scripts/v12-maestro-safe-sdk.mjs"), path.join(root, "scripts/v12-maestro-safe-sdk.mjs"));
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
  const maestroProductEnvironments = [];
  const sdkRequests = [];
  let activeCaseId = "";
  let activeNonce = "";
  const execute = (program, args, options) => {
    calls.push(program);
    assert.equal(path.isAbsolute(program), true);
    if (path.basename(program) === "java" && args[2] === "gymtracker.maestrosafe.SafeMaestroKt") {
      const [, , , serial, flow, junit, deadline, ...environment] = args;
      return execute(tools.maestro, ["sdk-flow", "--device", serial, "--flow", flow, "--junit", junit,
        "--deadline-ms", deadline, ...environment.flatMap(value => ["-e", value])], options);
    }
    if (path.basename(program) === "adb" && args[0] === "version") return "Android Debug Bridge version 1.0.41\n";
    if (path.basename(program) === "maestro" && args[0] === "--version") return "2.8.0\n";
    if (path.basename(program) === "unzip" && args[0] === "-v") return "UnZip 6.00\n";
    if (path.basename(program) === "maestro") {
      assert.equal(args[0], "sdk-flow", "direct flows must disable CLI default artifact capture");
      assert.equal(args[args.indexOf("--deadline-ms") + 1], "594000");
      assert.equal(options.timeout ?? options.timeoutMs, 600000);
      sdkRequests.push({ args: [...args], timeoutMs: options.timeout ?? options.timeoutMs });
      const output = args[args.indexOf("--junit") + 1];
      const caseId = args.find((value) => value.startsWith("V12_CASE_ID=")).slice("V12_CASE_ID=".length);
      activeCaseId = caseId;
      activeNonce = args.find((value) => value.startsWith("V12_EVIDENCE_NONCE=")).slice("V12_EVIDENCE_NONCE=".length);
      maestroCaseIds.push(caseId);
      const environmentValue = (name) => args.find((value) => value.startsWith(`${name}=`)).slice(name.length + 1);
      maestroProductEnvironments.push({
        product_url: environmentValue("V12_PRODUCT_URL"),
        interaction: environmentValue("V12_PRODUCT_INTERACTION"),
        ready_kind: environmentValue("V12_PRODUCT_READY_KIND"),
        ready_value: environmentValue("V12_PRODUCT_READY_VALUE"),
        action_kind: environmentValue("V12_PRODUCT_ACTION_KIND"),
        action_value: environmentValue("V12_PRODUCT_ACTION_VALUE"),
        result_kind: environmentValue("V12_PRODUCT_RESULT_KIND"),
        result_value: environmentValue("V12_PRODUCT_RESULT_VALUE"),
      });
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
        const state = { source_sha256: hash(`source:${activeCaseId}`), row_count: 0, table_count: 1, schema_version: 42 };
        const readbacks = createV12AppFunctionalReadbacks({ shard, caseId: activeCaseId, nonce: activeNonce,
          pre: state, action: state, post: state });
        return `<hierarchy><node content-desc="V12_SOURCE_RECEIPT:${encodeURIComponent(JSON.stringify(readbacks.source_receipt))}"/><node content-desc="V12_UI_READBACK:${encodeURIComponent(JSON.stringify(readbacks.ui_readback))}"/></hierarchy>`;
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
  return { root, build, caseIds, tools, calls, maestroCaseIds, maestroProductEnvironments, sdkRequests, execute, currentIdentity };
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
      assert.equal(args[0], "sdk-flow", "alternate recovery must disable CLI default artifact capture");
      commands.push(args);
      const output = args[args.indexOf("--junit") + 1];
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
  const readbacks = createV12AppFunctionalReadbacks({
    shard: "workout", caseId: "workout.root-identity", nonce: "f".repeat(48),
    pre: { source_sha256: hash("sqlite-state"), row_count: 2, table_count: 2, schema_version: 42 },
    action: { source_sha256: hash("sqlite-state"), row_count: 2, table_count: 2, schema_version: 42 },
    post: { source_sha256: hash("sqlite-state"), row_count: 2, table_count: 2, schema_version: 42 },
  });
  const receipt = createV12FunctionalExecutionReceipt({
    nonce: "f".repeat(48), runId, shard: "workout", caseId: "workout.root-identity",
    identity: {
      source_tree_sha256: build.source.tree_sha256,
      apk_sha256: build.build.apk.sha256,
      installed_apk_sha256: build.device.installed_apk_sha256,
      device_identity_sha256: build.device.identity_sha256,
      configuration_id: build.configuration.id,
    },
    sourceReceipt: readbacks.source_receipt,
    uiReadback: readbacks.ui_readback,
    pre: { source_sha256: readbacks.source_receipt.pre.source_sha256 },
    action: { report_sha256: hash("maestro-action") },
    post: { source_sha256: readbacks.source_receipt.post.source_sha256, ui_sha256: readbacks.ui_readback.ui_receipt_sha256 },
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
    }), /v12_maestro_(?:execution_receipt|source_readback|ui_readback)_invalid/u);
  }
});

test("functional case readbacks reject synthetic hierarchy, wrong case, wrong nonce, and unrelated digests", () => {
  const nonce = "d".repeat(48);
  const readbacks = createV12AppFunctionalReadbacks({
    shard: "library-running", caseId: "library.metric-profile-migration", nonce,
    pre: { source_sha256: hash("state"), row_count: 1, table_count: 1, schema_version: 42 },
    action: { source_sha256: hash("state"), row_count: 1, table_count: 1, schema_version: 42 },
    post: { source_sha256: hash("state"), row_count: 1, table_count: 1, schema_version: 42 },
  });
  const hierarchy = `<hierarchy><node content-desc="V12_SOURCE_RECEIPT:${encodeURIComponent(JSON.stringify(readbacks.source_receipt))}"/><node content-desc="V12_UI_READBACK:${encodeURIComponent(JSON.stringify(readbacks.ui_readback))}"/></hierarchy>`;
  const report = `<testsuite><testcase name="library.metric-profile-migration"/></testsuite>`;
  assert.deepEqual(validateV12FunctionalCaseReadbacks({ hierarchy, report, shard: "library-running", caseId: "library.metric-profile-migration", nonce }), readbacks);
  for (const [name, changedHierarchy, changedReport, changedCase, changedNonce] of [
    ["synthetic toggle", '<hierarchy><node content-desc="Case verified"/></hierarchy>', report, "library.metric-profile-migration", nonce],
    ["arbitrary hierarchy", `<hierarchy digest_sha256="${hash("unrelated")}"/>`, report, "library.metric-profile-migration", nonce],
    ["label-only JUnit", "<hierarchy/>", report, "library.metric-profile-migration", nonce],
    ["wrong case", hierarchy, report, "library.custom-exercise", nonce],
    ["wrong nonce", hierarchy, report, "library.metric-profile-migration", "e".repeat(48)],
  ]) {
    assert.throws(
      () => validateV12FunctionalCaseReadbacks({ hierarchy: changedHierarchy, report: changedReport, shard: "library-running", caseId: changedCase, nonce: changedNonce }),
      /v12_maestro_(?:source|ui|junit)_readback_invalid/u,
      name,
    );
  }
  const unrelated = structuredClone(readbacks);
  const source = unrelated.source_receipt;
  source.action_id = "unrelated-global-action";
  source.operation_id = "global:settings-read";
  source.operation_kind = "repository-read";
  source.operation_result = "read";
  source.operation_result_sha256 = hash("unrelated-operation");
  source.source_probe = "global_settings";
  source.authority_tables = ["app_settings"];
  for (const [index, phase] of ["pre", "action", "post"].entries()) {
    source[phase].probe_id = `global-settings:${phase}`;
    source[phase].facts_sha256 = hash(`global-facts:${index}`);
    source[phase].source_sha256 = hash(`global-source:${index}`);
    source[phase].table_count = 1;
  }
  source.action_request_sha256 = hash(JSON.stringify({
    schema_version: 2,
    producer: "v12-native-acceptance-action-request/v2",
    shard: "library-running",
    case_id: "library.metric-profile-migration",
    nonce,
    action_id: source.action_id,
    operation_id: source.operation_id,
    operation_kind: source.operation_kind,
    expected_result: source.operation_result,
    source_probe: source.source_probe,
    authority_tables: source.authority_tables,
    probe_ids: [source.pre.probe_id, source.action.probe_id, source.post.probe_id],
    ui_readback_id: "global-settings:ui",
  }));
  const { source_receipt_sha256: _sourceDigest, ...sourceUnsigned } = source;
  source.source_receipt_sha256 = hash(JSON.stringify(sourceUnsigned));
  unrelated.ui_readback.declared_action = source.action_id;
  unrelated.ui_readback.declared_readback = "Global settings visible";
  unrelated.ui_readback.readback_id = "global-settings:ui";
  unrelated.ui_readback.source_receipt_sha256 = source.source_receipt_sha256;
  const { ui_receipt_sha256: _uiDigest, ...uiUnsigned } = unrelated.ui_readback;
  unrelated.ui_readback.ui_receipt_sha256 = hash(JSON.stringify(uiUnsigned));
  const unrelatedHierarchy = `<hierarchy><node content-desc="V12_SOURCE_RECEIPT:${encodeURIComponent(JSON.stringify(source))}"/><node content-desc="V12_UI_READBACK:${encodeURIComponent(JSON.stringify(unrelated.ui_readback))}"/></hierarchy>`;
  assert.throws(() => validateV12FunctionalCaseReadbacks({
    hierarchy: unrelatedHierarchy,
    report,
    shard: "library-running",
    caseId: "library.metric-profile-migration",
    nonce,
  }), /v12_maestro_source_readback_invalid/u,
  "the review's recomputed unrelated-global-action/app_settings receipt must fail the source-owned case contract");
});

test("v1.2 functional flows require a real per-case action and post-action readback", () => {
  for (const shard of ["multi-plan", "workout", "library-running"]) {
    const source = productFlowSource(shard);
    assert.match(source, /V12_EVIDENCE_NONCE/u);
    assert.match(source, /openLink: "\$\{V12_PRODUCT_URL\}"/u);
    if (shard === "multi-plan") {
      assert.match(source, /V12_PRODUCT_INTERACTION == 'domain-observation'/u);
      assert.doesNotMatch(source, /\btapOn:/u);
    } else {
      assert.match(source, /tapOn:\s*\{ id: "\$\{V12_PRODUCT_ACTION_VALUE\}" \}/u);
      assert.match(source, /tapOn: "\$\{V12_PRODUCT_ACTION_VALUE\}"/u);
    }
    assert.match(source, /mode=receipt/u);
    assert.doesNotMatch(source, /native-acceptance-execute/u);
    assert.match(source, /assertVisible:\s*\{ id: "native-acceptance-readback" \}/u);
  }
  assert.equal(existsSync("maestro/v1.2/accessibility.yaml"), false);
});

test("product environments bind exact case identity and case-owned selectors", () => {
  const nonce = "a".repeat(48);
  const environment = createV12ProductCaseEnvironment({ shard: "workout", caseId: "workout.complete-commit", nonce });
  const productUrl = new URL(environment.product_url);
  assert.deepEqual(Object.fromEntries(productUrl.searchParams), {
    shard: "workout", case: "workout.complete-commit", fixture: "v12-synthetic-fixtures-r18", nonce, mode: "product",
  });
  assert.equal(validateV12ProductCaseEnvironment(environment, { shard: "workout", caseId: "workout.complete-commit", nonce }), true);
  const substituted = structuredClone(environment); substituted.action_value = "generic-button";
  assert.throws(() => validateV12ProductCaseEnvironment(substituted, {
    shard: "workout", caseId: "workout.complete-commit", nonce,
  }), /v12_maestro_product_environment_invalid/u);
});

test("all 101 product environments resolve through production UI selectors and callbacks", () => {
  assert.equal(assertV12ProductCaseEnvironmentRegistry({ root: process.cwd() }), true);
  const nonce = "c".repeat(48);
  const environments = Object.entries(REAL_CASE_IDS).flatMap(([shard, caseIds]) =>
    caseIds.map((caseId) => createV12ProductCaseEnvironment({ shard, caseId, nonce })));

  assert.equal(environments.length, 101);
  assert.equal(new Set(environments.map(({ case_id: caseId }) => caseId)).size, 101);
  const domainObservations = environments.filter(({ interaction }) => interaction === "domain-observation");
  const productCases = environments.filter(({ interaction }) => interaction !== "domain-observation");
  assert.equal(domainObservations.length, 13);
  assert.equal(productCases.length, 88);
  for (const environment of environments) {
    assert.notEqual(new URL(environment.product_url).pathname, "/", environment.case_id);
    assert.doesNotMatch(environment.action_value, /synthetic|generic/u, environment.case_id);
    if (environment.interaction === "domain-observation") {
      assert.equal(environment.action_kind, "none", environment.case_id);
      assert.equal(environment.action_value, "none", environment.case_id);
      assert.equal(environment.prerequisite_count, 0, environment.case_id);
    } else if (environment.interaction === "ui-observation") {
      assert.equal(environment.action_kind, "none", environment.case_id);
      assert.equal(environment.action_value, "none", environment.case_id);
    } else {
      assert.notEqual(environment.action_kind, "none", environment.case_id);
      assert.notEqual(environment.action_value, "none", environment.case_id);
    }
  }
});

async function assertUnsupportedSupervisorCleanupIsClosed(leaderSuccess) {
  const child = simulatedWindowsChild();
  child.pid = 700;
  let ownershipToken;
  let helperCalls = 0;
  let numericSignals = 0;
  child.kill = () => { numericSignals += 1; return true; };
  const running = runV12BoundedProcess(process.execPath, ["-e", ""], {
    platform: "darwin",
    spawnImplementation: (_program, _args, options) => {
      ownershipToken = options.env[V12_POSIX_OWNERSHIP_ENV];
      if (leaderSuccess) queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    posixProcessProbeImplementation: () => successfulProcessProbe(ownedProcessRow(700, "Ss", ownershipToken)),
    posixPidfdSignalImplementation: () => { helperCalls += 1; return successfulPidfdHelper(); },
    timeoutMs: 40, termGraceMs: 5, killGraceMs: 20,
  });
  await assert.rejects(running, /v12_maestro_process_tree_enumeration_failed/u);
  assert.equal(helperCalls, 0);
  assert.equal(numericSignals, 0);
}

test("bounded supervisor kills a resistant Linux tree or rejects unsupported POSIX cleanup", {
  timeout: 10_000,
}, async (t) => {
  if (process.platform !== "linux") {
    await assertUnsupportedSupervisorCleanupIsClosed(false);
    return;
  }
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-maestro-supervisor-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const childPid = path.join(root, "child.pid");
  const childReady = path.join(root, "child.ready");
  const script = path.join(root, "hung.mjs");
  writeFileSync(script, `
    import { spawn } from "node:child_process";
    import { existsSync, writeFileSync } from "node:fs";
    const child = spawn(process.execPath, ["-e", ${JSON.stringify(`const fs=require("node:fs");process.on("SIGTERM",()=>{});fs.writeFileSync(${JSON.stringify(childReady)},"ready");setInterval(()=>{},1000)`)}], { stdio: "ignore" });
    const ready = setInterval(() => { if (existsSync(${JSON.stringify(childReady)})) { clearInterval(ready); writeFileSync(${JSON.stringify(childPid)}, String(child.pid)); } }, 5);
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1000);
  `);
  await assert.rejects(() => runV12BoundedProcess(process.execPath, [script], {
    cwd: root, timeoutMs: 500, termGraceMs: 100, killGraceMs: 1_000,
  }), /v12_maestro_process_timeout/u);
  const descendant = Number(readFileSync(childPid, "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.throws(() => process.kill(descendant, 0), /ESRCH/u);
});

test("bounded supervisor drains a Linux descendant or rejects unsupported cleanup after leader success", {
  timeout: 10_000,
}, async (t) => {
  if (process.platform !== "linux") {
    await assertUnsupportedSupervisorCleanupIsClosed(true);
    return;
  }
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-maestro-success-tree-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const childPid = path.join(root, "child.pid");
  const script = path.join(root, "successful-leader.mjs");
  writeFileSync(script, [
    'import { spawn } from "node:child_process";',
    'import { writeFileSync } from "node:fs";',
    `const child = spawn(process.execPath, ["-e", ${JSON.stringify('process.on("SIGTERM",()=>{});setInterval(()=>{},1000)')}], { stdio: "ignore" });`,
    `writeFileSync(${JSON.stringify(childPid)}, String(child.pid));`,
    "child.unref();",
    "",
  ].join("\n"));
  let descendant = null;
  try {
    assert.equal(await runV12BoundedProcess(process.execPath, [script], {
      cwd: root, timeoutMs: 5_000, termGraceMs: 100, killGraceMs: 2_000,
    }), "");
    descendant = Number(readFileSync(childPid, "utf8"));
    assert.throws(() => process.kill(descendant, 0), /ESRCH/u);
    descendant = null;
  } finally {
    if (descendant !== null) { try { process.kill(descendant, "SIGKILL"); } catch { /* already gone */ } }
  }
});

test("bounded supervisor finds a detached POSIX child after its leader exits before the first ancestry poll", {
  skip: process.platform === "win32",
  timeout: 10_000,
}, async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-maestro-detached-tree-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const childPid = path.join(root, "detached-child.pid");
  const leaderReady = path.join(root, "leader.ready");
  const releaseLeader = path.join(root, "release.leader");
  const script = path.join(root, "detached-leader.mjs");
  writeFileSync(script, [
    'import { spawn } from "node:child_process";',
    'import { existsSync, writeFileSync } from "node:fs";',
    'import { setTimeout as delay } from "node:timers/promises";',
    `writeFileSync(${JSON.stringify(leaderReady)}, "ready");`,
    `while (!existsSync(${JSON.stringify(releaseLeader)})) await delay(1);`,
    `const child = spawn(process.execPath, ["-e", ${JSON.stringify('process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);')}], { detached: true, stdio: "ignore" });`,
    `writeFileSync(${JSON.stringify(childPid)}, String(child.pid));`,
    "child.unref();",
    "",
  ].join("\n"));
  let descendant;
  let probeCount = 0;
  try {
    const running = runV12BoundedProcess(process.execPath, [script], {
      cwd: root, timeoutMs: 2_000, termGraceMs: 100, killGraceMs: 1_000,
      spawnImplementation: (program, args, options) => {
        const leader = spawn(program, args, options);
        const waitArray = new Int32Array(new SharedArrayBuffer(4));
        const deadline = Date.now() + 1_000;
        while (!existsSync(leaderReady) && Date.now() < deadline) Atomics.wait(waitArray, 0, 0, 1);
        assert.equal(existsSync(leaderReady), true, "leader did not reach the pre-fork gate");
        return leader;
      },
      posixProcessProbeImplementation: (program, args, options) => {
        const outcome = spawnSync(program, args, options);
        if (probeCount === 0) writeFileSync(releaseLeader, "release");
        probeCount += 1;
        return outcome;
      },
    });
    if (process.platform === "linux") assert.equal(await running, "");
    else await assert.rejects(running, /v12_maestro_process_tree_enumeration_failed/u);
    descendant = Number(readFileSync(childPid, "utf8"));
    if (process.platform === "linux") {
      assert.throws(() => process.kill(descendant, 0), /ESRCH/u);
      descendant = undefined;
    } else {
      assert.doesNotThrow(() => process.kill(descendant, 0));
    }
    assert.equal(probeCount >= 3, true, "terminal token ownership was not re-probed");
  } finally {
    if (descendant !== undefined) { try { process.kill(descendant, "SIGKILL"); } catch { /* already gone */ } }
  }
});

function ownedProcessRow(pid, state, token, command = "node worker.mjs") {
  return `${String(pid)} ${state} ${command} ${V12_POSIX_OWNERSHIP_ENV}=${token}\n`;
}

function successfulProcessProbe(stdout) {
  return { status: 0, signal: null, error: undefined, stdout };
}

function successfulPidfdHelper() {
  return { status: 0, signal: null, error: undefined, stdout: "ok\n", stderr: "" };
}

function failedPidfdHelper(stderr = "") {
  return { status: 1, signal: null, error: undefined, stdout: "", stderr };
}

test("mocked Linux pidfd helper rejects same-second PID reuse after discovery", async () => {
  const child = simulatedWindowsChild();
  child.pid = 500;
  let ownershipToken;
  const pidfdSignals = [];
  const running = runV12BoundedProcess(process.execPath, ["-e", ""], {
    platform: "linux",
    spawnImplementation: (_program, _args, options) => {
      ownershipToken = options.env[V12_POSIX_OWNERSHIP_ENV];
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    posixProcessProbeImplementation: () => successfulProcessProbe(ownedProcessRow(500, "Ss", ownershipToken)),
    posixPidfdSignalImplementation: (_program, args, options) => {
      assert.deepEqual(args.slice(3), ["500"]);
      assert.equal(options.input, `${ownershipToken}\n`);
      const pinnedIdentity = "original-token-owner";
      const currentIdentity = "same-second-replacement";
      assert.notEqual(pinnedIdentity, currentIdentity);
      return failedPidfdHelper();
    },
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  await assert.rejects(running, /v12_maestro_process_tree_enumeration_failed/u);
  assert.deepEqual(pidfdSignals, []);
});

test("mocked Linux pidfd helper rejects token removal after discovery", async () => {
  const child = simulatedWindowsChild();
  child.pid = 501;
  let ownershipToken;
  const pidfdSignals = [];
  const running = runV12BoundedProcess(process.execPath, ["-e", ""], {
    platform: "linux",
    spawnImplementation: (_program, _args, options) => {
      ownershipToken = options.env[V12_POSIX_OWNERSHIP_ENV];
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    posixProcessProbeImplementation: () => successfulProcessProbe(ownedProcessRow(501, "Ss", ownershipToken)),
    posixPidfdSignalImplementation: () => failedPidfdHelper(),
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  await assert.rejects(running, /v12_maestro_process_tree_enumeration_failed/u);
  assert.deepEqual(pidfdSignals, []);
});

test("bounded supervisor fails closed when initial POSIX ownership enumeration is unavailable", async () => {
  const child = simulatedWindowsChild();
  child.pid = 500;
  let helperCalls = 0;
  const running = runV12BoundedProcess(process.execPath, ["-e", ""], {
    platform: "linux",
    spawnImplementation: () => {
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    posixProcessProbeImplementation: () => { throw new Error("ps unavailable"); },
    posixPidfdSignalImplementation: () => { helperCalls += 1; return successfulPidfdHelper(); },
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  await assert.rejects(running, /v12_maestro_process_tree_enumeration_failed/u);
  assert.equal(helperCalls, 0);
});

test("bounded supervisor sends zero later signals when POSIX ownership re-enumeration fails", async () => {
  const child = simulatedWindowsChild();
  child.pid = 502;
  let ownershipToken;
  let probeCount = 0;
  let helperCalls = 0;
  const running = runV12BoundedProcess(process.execPath, ["-e", ""], {
    platform: "linux",
    spawnImplementation: (_program, _args, options) => {
      ownershipToken = options.env[V12_POSIX_OWNERSHIP_ENV];
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    posixProcessProbeImplementation: () => {
      if (probeCount++ === 0) return successfulProcessProbe(ownedProcessRow(502, "Ss", ownershipToken));
      throw new Error("ps became unavailable");
    },
    posixPidfdSignalImplementation: () => { helperCalls += 1; return successfulPidfdHelper(); },
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  await assert.rejects(running, /v12_maestro_process_tree_enumeration_failed/u);
  assert.equal(helperCalls, 0);
});

test("mocked Linux pidfd transaction validates every candidate before its first signal", async () => {
  const token = "a".repeat(64);
  const acquiredHandles = [];
  const pidfdSignals = [];
  const tracker = createV12PosixProcessTreeTracker({
    ownershipToken: token,
    platform: "linux",
    probeImplementation: () => successfulProcessProbe(
      ownedProcessRow(601, "Ss", token) + ownedProcessRow(602, "Ss", token),
    ),
    pidfdSignalImplementation: (_program, args, options) => {
      const pids = args.slice(3).map(Number);
      acquiredHandles.push(...pids.map((pid) => Object.freeze({ pid })));
      assert.equal(options.input, `${token}\n`);
      assert.deepEqual(pids, [601, 602]);
      assert.equal(acquiredHandles.length, 2);
      assert.equal(pids[0], 601);
      assert.equal(pids[1], 602);
      return failedPidfdHelper();
    },
    probeTimeoutMs: 100,
  });
  assert.throws(() => tracker.signal("SIGTERM"), /v12_posix_process_tree_stable_signal_failed/u);
  assert.deepEqual(pidfdSignals, []);
  assert.throws(() => tracker.signal("SIGKILL"), /v12_posix_process_tree_failed/u);
});

test("mocked Linux pidfd signal stays bound to the validated process after PID replacement", async () => {
  const token = "b".repeat(64);
  let live = true;
  const currentByPid = new Map([[603, { identity: "owned-original", token }]]);
  const pidfdSignals = [];
  const tracker = createV12PosixProcessTreeTracker({
    ownershipToken: token,
    platform: "linux",
    probeImplementation: () => successfulProcessProbe(live ? ownedProcessRow(603, "Ss", token) : ""),
    pidfdSignalImplementation: (_program, args, options) => {
      assert.deepEqual(args.slice(3), ["603"]);
      assert.equal(options.input, `${token}\n`);
      const pinnedHandle = currentByPid.get(603);
      assert.equal(pinnedHandle.token, token);
      currentByPid.set(603, { identity: "unrelated-replacement", token: "0".repeat(64) });
      pidfdSignals.push(pinnedHandle.identity);
      live = false;
      return successfulPidfdHelper();
    },
    probeTimeoutMs: 100,
  });
  assert.equal(tracker.signal("SIGTERM"), true);
  assert.deepEqual(pidfdSignals, ["owned-original"]);
  assert.equal(currentByPid.get(603).identity, "unrelated-replacement");
  assert.equal(tracker.treeState(), "empty");
  tracker.stop();
});

test("Python pidfd helper acquires and validates the complete set before signalling stable handles", () => {
  const harness = String.raw`
import contextlib
import importlib.util
import io
import sys

spec = importlib.util.spec_from_file_location("pidfd_helper", sys.argv[1])
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

events = []
handles = {}
current = {701: "owned-701", 702: "owned-702"}
signals = []

class FakeOS:
    def pidfd_open(self, pid, flags):
        fd = pid + 1000
        handles[fd] = current[pid]
        events.append(("open", pid))
        return fd

    def close(self, fd):
        events.append(("close", fd))

class FakeSignal:
    SIGTERM = 15
    SIGKILL = 9

    def pidfd_send_signal(self, fd, selected_signal, info, flags):
        signals.append(handles[fd])

helper.os = FakeOS()
helper.signal = FakeSignal()
helper._parse = lambda arguments: (15, 1000, [701, 702], b"a" * 64)

def reject_second(pid, pidfd, token, deadline):
    events.append(("validate", pid))
    return pid == 701

helper._has_exact_token = reject_second
assert helper.main(["helper", "SIGTERM", "1000", "701", "702"]) == 1
assert events[:4] == [("open", 701), ("open", 702), ("validate", 701), ("validate", 702)]
assert signals == []
assert events[-2:] == [("close", 1701), ("close", 1702)]

events.clear()
handles.clear()
signals.clear()
current = {701: "owned-701", 702: "owned-702"}

def validate_then_replace(pid, pidfd, token, deadline):
    events.append(("validate", pid))
    if pid == 702:
        current[701] = "replacement-701"
        current[702] = "replacement-702"
    return True

helper._has_exact_token = validate_then_replace
captured = io.StringIO()
with contextlib.redirect_stdout(captured):
    assert helper.main(["helper", "SIGTERM", "1000", "701", "702"]) == 0
assert captured.getvalue() == "ok\n"
assert events[:4] == [("open", 701), ("open", 702), ("validate", 701), ("validate", 702)]
assert signals == ["owned-701", "owned-702"]
`;
  const outcome = spawnSync("python3", ["-c", harness, path.resolve("scripts/v12-linux-pidfd-signal.py")], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    timeout: 1_000,
  });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(outcome.stdout, "");
});

test("unsupported POSIX platform fails closed before invoking a numeric or pidfd signal", () => {
  const token = "c".repeat(64);
  let helperCalls = 0;
  let numericSignals = 0;
  const tracker = createV12PosixProcessTreeTracker({
    ownershipToken: token,
    platform: "darwin",
    probeImplementation: () => successfulProcessProbe(ownedProcessRow(604, "Ss", token)),
    pidfdSignalImplementation: () => { helperCalls += 1; return successfulPidfdHelper(); },
    killImplementation: () => { numericSignals += 1; },
    probeTimeoutMs: 100,
  });
  assert.throws(() => tracker.signal("SIGTERM"), /v12_posix_process_tree_stable_signal_unavailable/u);
  assert.equal(helperCalls, 0);
  assert.equal(numericSignals, 0);
});

test("POSIX ownership failures never expose the token or raw process environment", async () => {
  const child = simulatedWindowsChild();
  child.pid = 503;
  let ownershipToken;
  const privateEnvironment = "PRIVATE_PROCESS_VALUE=must-not-escape";
  const running = runV12BoundedProcess(process.execPath, ["-e", ""], {
    platform: "linux",
    spawnImplementation: (_program, _args, options) => {
      ownershipToken = options.env[V12_POSIX_OWNERSHIP_ENV];
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    posixProcessProbeImplementation: () => successfulProcessProbe(ownedProcessRow(
      503, "Ss", ownershipToken, `node private-worker.mjs ${privateEnvironment}`,
    )),
    posixPidfdSignalImplementation: () => failedPidfdHelper(`${privateEnvironment}:${ownershipToken}`),
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  const error = await running.then(() => null, (failure) => failure);
  assert.match(error.message, /v12_maestro_process_tree_enumeration_failed/u);
  assert.equal(JSON.stringify(error).includes(ownershipToken), false);
  assert.equal(JSON.stringify(error).includes(privateEnvironment), false);
});

function simulatedWindowsChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { throw new Error("leader_only_kill_forbidden"); };
  return child;
}

test("Windows bounded supervisor uses taskkill tree termination even when the leader exits cooperatively", async () => {
  const child = simulatedWindowsChild();
  let leaderAlive = true;
  let descendantAlive = true;
  const calls = [];
  const running = runV12BoundedProcess("/tools/maestro.exe", ["test"], {
    platform: "win32",
    spawnImplementation: () => child,
    killImplementation: () => { if (!leaderAlive) throw new Error("ESRCH"); },
    windowsTreeProbeImplementation: () => ({ status: 0, signal: null, error: undefined,
      stdout: leaderAlive || descendantAlive ? "4242\n" : "" }),
    taskkillImplementation: (_program, args) => {
      calls.push(args);
      descendantAlive = !args.includes("/T");
      leaderAlive = false;
      queueMicrotask(() => child.emit("close", 1, null));
      return { status: 0, signal: null, error: undefined };
    },
    timeoutMs: 5,
    termGraceMs: 20,
    killGraceMs: 20,
  });

  await assert.rejects(running, /v12_maestro_process_timeout/u);
  assert.deepEqual(calls, [["/PID", "4242", "/T"]]);
  assert.equal(descendantAlive, false);
});

test("Windows bounded supervisor verifies and drains a resistant descendant after leader success", async () => {
  const child = simulatedWindowsChild();
  let descendantAlive = true;
  const taskkillCalls = [];
  const running = runV12BoundedProcess("/tools/maestro.exe", ["test"], {
    platform: "win32",
    spawnImplementation: () => {
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    windowsTreeProbeImplementation: () => ({ status: 0, signal: null, error: undefined,
      stdout: descendantAlive ? "5252\n" : "" }),
    taskkillImplementation: (_program, args) => {
      taskkillCalls.push(args);
      if (args.includes("/F")) descendantAlive = false;
      return { status: 0, signal: null, error: undefined };
    },
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  assert.equal(await running, "");
  assert.deepEqual(taskkillCalls, [["/PID", "5252", "/T"], ["/PID", "5252", "/T", "/F"]]);
  assert.equal(descendantAlive, false);
});

test("Windows bounded supervisor fails closed when it cannot verify the final task tree", async () => {
  const child = simulatedWindowsChild();
  const taskkillCalls = [];
  const running = runV12BoundedProcess("/tools/maestro.exe", ["test"], {
    platform: "win32",
    spawnImplementation: () => {
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    windowsTreeProbeImplementation: () => null,
    taskkillImplementation: (_program, args) => {
      taskkillCalls.push(args);
      return { status: 0, signal: null, error: undefined };
    },
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  await assert.rejects(running, /v12_maestro_process_tree_termination_failed/u);
  assert.deepEqual(taskkillCalls, [["/PID", "4242", "/T"], ["/PID", "4242", "/T", "/F"]]);
});

test("Windows bounded supervisor escalates the complete tree and rejects failed taskkill outcomes", async () => {
  const escalatedChild = simulatedWindowsChild();
  let leaderAlive = true;
  const escalationCalls = [];
  const escalating = runV12BoundedProcess("/tools/maestro.exe", ["test"], {
    platform: "win32",
    spawnImplementation: () => escalatedChild,
    killImplementation: () => { if (!leaderAlive) throw new Error("ESRCH"); },
    windowsTreeProbeImplementation: () => ({ status: 0, signal: null, error: undefined,
      stdout: leaderAlive ? "4242\n" : "" }),
    taskkillImplementation: (_program, args) => {
      escalationCalls.push(args);
      if (args.includes("/F")) {
        leaderAlive = false;
        queueMicrotask(() => escalatedChild.emit("close", 1, null));
      }
      return { status: 0, signal: null, error: undefined };
    },
    timeoutMs: 5,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  await assert.rejects(escalating, /v12_maestro_process_timeout/u);
  assert.deepEqual(escalationCalls, [["/PID", "4242", "/T"], ["/PID", "4242", "/T", "/F"]]);

  const failedChild = simulatedWindowsChild();
  const failedCalls = [];
  const failed = runV12BoundedProcess("/tools/maestro.exe", ["test"], {
    platform: "win32",
    spawnImplementation: () => failedChild,
    killImplementation: () => undefined,
    windowsTreeProbeImplementation: () => ({ status: 0, signal: null, error: undefined, stdout: "4242\n" }),
    taskkillImplementation: (_program, args) => {
      failedCalls.push(args);
      return { status: 1, signal: null, error: undefined };
    },
    timeoutMs: 5,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  await assert.rejects(failed, /v12_maestro_process_tree_termination_failed/u);
  assert.deepEqual(failedCalls, [["/PID", "4242", "/T"], ["/PID", "4242", "/T", "/F"]]);
});

test("postdispatch SDK timeout retains the original snapshot after host termination", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  const value = fixture(t, "multi-plan");
  let restoreCalls = 0;
  const runProcess = async (program, args, options) => {
    if (program === value.tools.maestro && args[0] === "sdk-flow") throw new Error("v12_maestro_process_timeout");
    if (program === value.tools.adb && args.includes("put")) restoreCalls += 1;
    return value.execute(program, args, options);
  };
  await assert.rejects(() => executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    currentIdentity: value.currentIdentity, executionTools: value.tools, runProcess,
  }), /v12_maestro_native_command_timeout/u);
  assert.equal(restoreCalls, 0);
  assert.equal(existsSync(deviceLeasePath(value.root)), true);
  assert.deepEqual(JSON.parse(readFileSync(`${deviceLeasePath(value.root)}.snapshot.json`, "utf8")).original_settings, DEVICE_SETTINGS);
});

test("unresolved POSIX cleanup retains the device lease", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  const value = fixture(t, "multi-plan");
  const leasePath = deviceLeasePath(value.root);
  let restores = 0;
  const runProcess = async (program, args, options) => {
    if (program === value.tools.adb && args.includes("put")) restores += 1;
    if (program === value.tools.maestro && args[0] === "sdk-flow") {
      throw new Error("v12_maestro_process_tree_enumeration_failed");
    }
    return value.execute(program, args, options);
  };
  await assert.rejects(() => executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    currentIdentity: value.currentIdentity, executionTools: value.tools, runProcess,
  }), /v12_maestro_native_command_failed/u);
  assert.equal(existsSync(leasePath), true);
  assert.equal(restores, 0);
});

test("fixed SDK remote-cleanup failure retains the lease and prevents settings restoration", async t => {
  for (const processFails of [false, true]) await t.test(String(processFails), async t => {
    const value = fixture(t, "multi-plan"); let restores = 0;
    const runProcess = async (program, args, options) => {
      if (program === value.tools.maestro && args[0] === "sdk-flow") {
        const report = args[args.indexOf("--junit") + 1];
        writeFileSync(report, '<testsuite tests="1" errors="1"><testcase name="sdk"><error message="maestro_sdk_cleanup_failed"/></testcase></testsuite>');
        if (processFails) throw new Error("v12_maestro_process_failed");
        return "";
      }
      if (program === value.tools.adb && args.includes("put")) restores += 1;
      return value.execute(program, args, options);
    };
    await assert.rejects(() => executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
      root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
      sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
      executionTools: value.tools, runProcess,
    }), /native_command_failed/u);
    assert.equal(restores, 0);
    assert.equal(existsSync(deviceLeasePath(value.root)), true);
    const snapshot = JSON.parse(readFileSync(`${deviceLeasePath(value.root)}.snapshot.json`, "utf8"));
    assert.deepEqual(snapshot.original_settings, DEVICE_SETTINGS);
    assert.equal(snapshot.device_identity_sha256, value.build.device.identity_sha256);
    assert.match(snapshot.owner.process_birth_sha256, /^[a-f0-9]{64}$/u);
    assert.match(snapshot.owner.nonce, /^[a-f0-9]{64}$/u);
  });
});

test("lease birth identity follows precise Linux or observed process birth and never falls back on unknown state", () => {
  const stat = `42 (node) ${["S", ...Array(18).fill("0"), "12345"].join(" ")}`;
  const owner = readV12DirectLeaseOwner({ platform: "linux", pid: 42,
    readText: file => file.endsWith("boot_id") ? "a".repeat(36) : stat });
  assert.match(owner.process_birth_sha256, /^[a-f0-9]{64}$/u);
  for (const options of [
    { pid: 0 },
    { platform: "linux", pid: 42, readText: () => "invalid" },
    { platform: "darwin", pid: 42, probe: () => ({ status: 1, stdout: "" }) },
    { platform: "darwin", pid: 42, probe: () => ({ status: 0, stdout: "" }) },
  ]) assert.throws(() => readV12DirectLeaseOwner(options), /lease_owner_invalid/u);
  assert.match(readV12DirectLeaseOwner({ platform: "darwin", pid: 42,
    probe: () => ({ status: 0, stdout: "Sun  Oct 25 00:00:00 2026\n" }) }).nonce, /^[a-f0-9]{64}$/u);
  if (process.platform === "linux") assert.match(readV12DirectLeaseOwner().process_birth_sha256, /^[a-f0-9]{64}$/u);
  else assert.throws(() => readV12DirectLeaseOwner({ platform: "linux" }), /lease_owner_invalid/u);
});

test("existing or changed durable owners reject before unsafe work and preserve their snapshots", async t => {
  for (const existingKind of ["legacy", "json", "directory", "snapshot"]) await t.test(existingKind, async t => {
    const value = fixture(t, "multi-plan"); const lease = deviceLeasePath(value.root);
    mkdirSync(path.dirname(lease), { recursive: true });
    if (existingKind === "directory") mkdirSync(lease);
    else if (existingKind === "snapshot") writeFileSync(`${lease}.snapshot.json`, '{"unknown":"owner"}');
    else writeFileSync(lease, existingKind === "legacy" ? `${hash(DEVICE_FACTS.serial)}\n` : '{"unknown":"owner"}');
    await assert.rejects(() => executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
      root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
      sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
      executionTools: value.tools, execFileSync: value.execute,
    }), /immutable_output_invalid/u);
    assert.equal(value.maestroCaseIds.length, 0);
    assert.equal(existsSync(existingKind === "snapshot" ? `${lease}.snapshot.json` : lease), true);
  });
  const value = fixture(t, "multi-plan"); let restores = 0;
  const runProcess = async (program, args, options) => {
    if (program === value.tools.maestro && args[0] === "sdk-flow") {
      writeFileSync(deviceLeasePath(value.root), '{"replacement":"owner"}');
      return value.execute(program, args, options);
    }
    if (program === value.tools.adb && args.includes("put")) restores += 1;
    return value.execute(program, args, options);
  };
  await assert.rejects(() => executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    executionTools: value.tools, runProcess,
  }), /lease_owner_changed/u);
  assert.equal(restores, 0);
  assert.deepEqual(JSON.parse(readFileSync(`${deviceLeasePath(value.root)}.snapshot.json`, "utf8")).original_settings, DEVICE_SETTINGS);
});

test("alternate Recovery preserves its original airplane snapshot when remote SDK cleanup is uncertain", async t => {
  const value = fixture(t, "multi-plan"); const flow = path.join(value.root, "maestro/v1.2/recovery.yaml");
  writeFileSync(flow, "appId: com.fchoo.gymtracker.devtest\n---\n- launchApp\n");
  let restores = 0;
  const runProcess = async (program, args) => {
    if (program === value.tools.maestro && args[0] === "--version") return "2.8.0";
    if (program === value.tools.adb && args.includes("get")) return "0";
    if (program === value.tools.adb && args.includes("put")) { restores += 1; return ""; }
    if (program === value.tools.maestro && args[0] === "sdk-flow") {
      writeFileSync(args[args.indexOf("--junit") + 1], '<testsuite><testcase name="sdk"><error message="maestro_sdk_cleanup_failed"/></testcase></testsuite>');
      throw new Error("v12_maestro_process_failed");
    }
    throw new Error("unexpected controlled command");
  };
  await assert.rejects(() => executeLiveV12RecoveryMaestro(["--run", runId, "--shard", "recovery"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    executionTools: value.tools, runProcess,
  }), /native_command_failed/u);
  assert.equal(restores, 0);
  assert.deepEqual(JSON.parse(readFileSync(`${deviceLeasePath(value.root)}.snapshot.json`, "utf8")).original_settings, { airplane_mode_on: "0" });
});

test("only validated terminal JUnit allows restoration after SDK dispatch", async t => {
  const ordinaryFailure = '<testsuite><testcase name="sdk"><error message="maestro_sdk_execution_failed"/></testcase></testsuite>';
  for (const xml of ["not XML maestro_sdk_cleanup_failed", ordinaryFailure,
    '<testsuite><testcase name="sdk"><error message="unrecognized_private_failure"/></testcase></testsuite>',
    "x".repeat(2000001)]) await t.test(String(xml.length), async t => {
    const value = fixture(t, "multi-plan"); let restores = 0;
    const runProcess = async (program, args, options) => {
      if (program === value.tools.maestro && args[0] === "sdk-flow") {
        writeFileSync(args[args.indexOf("--junit") + 1], xml);
        throw new Error("v12_maestro_process_failed");
      }
      if (program === value.tools.adb && args.includes("put")) restores += 1;
      return value.execute(program, args, options);
    };
    await assert.rejects(() => executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
      root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
      sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
      executionTools: value.tools, runProcess,
    }), /native_command_failed/u);
    assert.equal(restores > 0, xml === ordinaryFailure);
    assert.equal(existsSync(deviceLeasePath(value.root)), xml !== ordinaryFailure);
  });
});

test("postdispatch SDK cancellation retains the snapshot after terminating the host tree", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  const value = fixture(t, "multi-plan");
  const controller = new AbortController();
  let restoreCalls = 0;
  const runProcess = async (program, args, options) => {
    if (program === value.tools.maestro && args[0] === "sdk-flow") {
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("v12_maestro_process_cancelled")), { once: true }));
    }
    if (program === value.tools.adb && args.includes("put")) restoreCalls += 1;
    return value.execute(program, args, options);
  };
  const running = executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    currentIdentity: value.currentIdentity, executionTools: value.tools, runProcess,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(running, /v12_maestro_native_command_cancelled/u);
  assert.equal(restoreCalls, 0);
  assert.equal(existsSync(deviceLeasePath(value.root)), true);
});

test("cancellation before the first device measurement releases its unused lease without dispatching SDK", async t => {
  const value = fixture(t, "multi-plan"); const controller = new AbortController(); let restores = 0;
  const runProcess = async (program, args, options) => {
    const result = value.execute(program, args, options);
    if (program === value.tools.adb && args.includes("put")) restores += 1;
    return result;
  };
  await assert.rejects(() => executeLiveV12GenericMaestro(["--run", runId, "--shard", "multi-plan"], {
    root: value.root, serial: DEVICE_FACTS.serial, currentHead: value.build.source.head,
    sourceDigest: value.build.source.tree_sha256, isAncestor: () => true,
    executionTools: value.tools, runProcess, signal: controller.signal,
    readLeaseOwner: () => { controller.abort(); return { pid: process.pid, process_birth_sha256: "a".repeat(64), nonce: "b".repeat(64) }; },
  }), /native_command_failed/u);
  assert.equal(value.maestroCaseIds.length, 0);
  assert.equal(restores, 0); // Cancellation occurred before the first measured snapshot or mutation.
  assert.equal(existsSync(deviceLeasePath(value.root)), false);
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
    assert.deepEqual(publication.members.map(({ artifact }) => artifact).sort(), [
      `maestro/${shard}.xml`, `mapping/${shard}.json`,
      `tools/direct-${shard}-receipt.json`, `tools/direct-${shard}-runner.jar`,
    ].sort());
    for (const [relative, expectedHash] of [
      [`tools/direct-${shard}-receipt.json`, mapping.tool_attestation.safe_sdk.receipt_sha256],
      [`tools/direct-${shard}-runner.jar`, mapping.tool_attestation.safe_sdk.jar_sha256],
    ]) {
      const member = publication.members.find(({ artifact }) => artifact === relative);
      assert.equal(member.sha256, expectedHash);
      assert.equal(hash(readFileSync(path.join(value.root, `artifacts/native/v1.2/${runId}/${relative}`))), expectedHash);
    }
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
    const prior = duplicateNonce.observations[1].execution_receipt;
    const duplicateReadbacks = createV12AppFunctionalReadbacks({
      shard,
      caseId: duplicateNonce.observations[1].case_id,
      nonce: duplicateNonce.observations[0].execution_receipt.nonce,
      actionId: prior.source_receipt.action_id,
      sourceProbe: prior.source_receipt.source_probe,
      declaredReadback: prior.ui_readback.declared_readback,
      authorityTables: prior.source_receipt.authority_tables,
      pre: prior.source_receipt.pre,
      action: prior.source_receipt.action,
      post: prior.source_receipt.post,
    });
    duplicateNonce.observations[1].execution_receipt = createV12FunctionalExecutionReceipt({
      nonce: duplicateNonce.observations[0].execution_receipt.nonce, runId, shard,
      caseId: duplicateNonce.observations[1].case_id,
      identity: duplicateNonce.observations[1].execution_receipt.identity,
      sourceReceipt: duplicateReadbacks.source_receipt,
      uiReadback: duplicateReadbacks.ui_readback,
      pre: { source_sha256: duplicateNonce.observations[1].execution_receipt.phases[0].source_sha256 },
      action: { report_sha256: duplicateNonce.observations[1].report_sha256 },
      post: {
        source_sha256: duplicateNonce.observations[1].execution_receipt.phases[2].source_sha256,
        ui_sha256: duplicateReadbacks.ui_readback.ui_receipt_sha256,
      },
    });
    duplicateNonce.observations[1].product_environment = createV12ProductCaseEnvironment({
      shard,
      caseId: duplicateNonce.observations[1].case_id,
      nonce: duplicateNonce.observations[0].execution_receipt.nonce,
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
    const legacyProduction = structuredClone(forgedMapping);
    legacyProduction.tool_attestation.schema_version = 1;
    delete legacyProduction.tool_attestation.safe_sdk;
    assert.throws(() => validateV12DirectMaestroMapping(legacyProduction, {
      root: value.root, manifest: value.build, shard, allowTest: true,
    }), /v12_maestro_tool_attestation_invalid/u);
    assert.throws(
      () => validateV12DirectMaestroMapping(forgedMapping, {
        root: value.root,
        manifest: value.build,
        shard,
        allowTest: true,
      }),
      /v12_maestro_(?:request|safe_sdk)_attestation_invalid/u,
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
    if (program === value.tools.maestro && args[0] === "sdk-flow") flowExecuted = true;
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

test("preseal provenance revalidates complete tools and current device measurements", { timeout: 120_000 }, async (t) => {
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
      assert.ok(mapping.observations.every(({ case_id: caseId, execution_receipt: receipt, product_environment: environment }) =>
        validateV12ProductCaseEnvironment(environment, { shard, caseId, nonce: receipt.nonce })));
      assert.deepEqual(value.maestroCaseIds, REAL_CASE_IDS[shard]);
      assert.deepEqual(value.maestroProductEnvironments, mapping.observations.map(({ product_environment: environment }) => ({
        product_url: environment.product_url, interaction: environment.interaction,
        ready_kind: environment.ready_kind, ready_value: environment.ready_value,
        action_kind: environment.action_kind, action_value: environment.action_value,
        result_kind: environment.result_kind, result_value: environment.result_value,
      })));
      assert.equal(mapping.observations.length, { "multi-plan": 13, workout: 42, "library-running": 46 }[shard]);
      const substituted = structuredClone(mapping);
      substituted.observations[0].product_environment.ready_value = "generic-ready";
      assert.throws(() => validateV12DirectMaestroMapping(substituted, {
        root: value.root, manifest: value.build, shard, allowTest: true,
      }), /v12_maestro_product_environment_invalid/u);
    });
  }
});
