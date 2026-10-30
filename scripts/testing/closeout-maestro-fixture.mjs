// Test-only helpers extracted from the existing current SDK producer tests.
import assert from "node:assert/strict";

import { spawn, spawnSync } from "node:child_process";

import { createHash } from "node:crypto";

import { EventEmitter } from "node:events";

import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";

import { PassThrough } from "node:stream";

import { tmpdir } from "node:os";

import path from "node:path";

import test from "node:test";

import { V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY } from "../../src/testing/v12NativeAcceptanceProductRegistry.ts";

import { phase18DeviceIdentitySha256 } from "../phase18-device-identity.mjs";

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
} from "../run-v12-maestro.mjs";

import { digestV12CanonicalRestorationSnapshot } from "../v12-device-settings-contract.mjs";

import { createV12PosixProcessTreeTracker, V12_POSIX_OWNERSHIP_ENV } from "../v12-posix-process-tree.mjs";

import { validateV12ProductionPublicationOrigins } from "../verify-v12-native-evidence.mjs";

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
  writeFileSync(path.join(root, "scripts/run-v12-maestro.mjs"), readFileSync(new URL("../run-v12-maestro.mjs", import.meta.url)));
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

function simulatedWindowsChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { throw new Error("leader_only_kill_forbidden"); };
  return child;
}
export { fixture, runId, DEVICE_FACTS };
