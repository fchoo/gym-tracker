import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY } from "../src/testing/v12NativeAcceptanceProductRegistry.ts";
import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";
import {
  createV12AppFunctionalReadbacks,
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
  let activeCaseId = "";
  let activeNonce = "";
  const execute = (program, args) => {
    calls.push(program);
    assert.equal(path.isAbsolute(program), true);
    if (path.basename(program) === "adb" && args[0] === "version") return "Android Debug Bridge version 1.0.41\n";
    if (path.basename(program) === "maestro" && args[0] === "--version") return "2.8.0\n";
    if (path.basename(program) === "unzip" && args[0] === "-v") return "UnZip 6.00\n";
    if (path.basename(program) === "maestro") {
      const output = args[args.indexOf("--output") + 1];
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
  return { root, build, caseIds, tools, calls, maestroCaseIds, maestroProductEnvironments, execute, currentIdentity };
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

test("bounded supervisor kills a TERM-resistant process tree", { timeout: 10_000 }, async (t) => {
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

test("bounded supervisor drains a TERM-resistant descendant after a successful POSIX leader", { timeout: 10_000 }, async (t) => {
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

test("bounded supervisor drains a detached POSIX descendant before successful resolution", {
  skip: process.platform === "win32",
  timeout: 10_000,
}, async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "v12-maestro-detached-tree-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const childPid = path.join(root, "detached-child.pid");
  const script = path.join(root, "detached-leader.mjs");
  writeFileSync(script, [
    'import { spawn } from "node:child_process";',
    'import { writeFileSync } from "node:fs";',
    'import { setTimeout as delay } from "node:timers/promises";',
    `const child = spawn(process.execPath, ["-e", ${JSON.stringify('process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);')}], { detached: true, stdio: "ignore" });`,
    `writeFileSync(${JSON.stringify(childPid)}, String(child.pid));`,
    "child.unref();",
    "await delay(125);",
    "",
  ].join("\n"));
  let descendant;
  try {
    assert.equal(await runV12BoundedProcess(process.execPath, [script], {
      cwd: root, timeoutMs: 2_000, termGraceMs: 100, killGraceMs: 1_000,
    }), "");
    descendant = Number(readFileSync(childPid, "utf8"));
    assert.throws(() => process.kill(descendant, 0), /ESRCH/u);
    descendant = undefined;
  } finally {
    if (descendant !== undefined) { try { process.kill(descendant, "SIGKILL"); } catch { /* already gone */ } }
  }
});

test("bounded supervisor rejects reused detached PIDs without signalling the new owner", async () => {
  const child = simulatedWindowsChild();
  child.pid = 500;
  let leaderAlive = true;
  const signals = [];
  const processTable = () => ({ status: 0, signal: null, error: undefined, stdout: leaderAlive
    ? "500 1 500 500 Ss Mon Oct 20 12:00:00 2026\n600 500 600 600 Ss Mon Oct 20 12:00:01 2026\n"
    : "600 1 888 888 Ss Mon Oct 20 12:00:02 2026\n" });
  const running = runV12BoundedProcess(process.execPath, ["-e", ""], {
    spawnImplementation: () => {
      queueMicrotask(() => { leaderAlive = false; child.emit("close", 0, null); });
      return child;
    },
    killImplementation: (target, signal) => {
      signals.push([target, signal]);
      throw new Error("PID reuse must not be signalled");
    },
    posixProcessProbeImplementation: processTable,
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  assert.equal(await running, "");
  assert.deepEqual(signals, []);
});

test("bounded supervisor fails closed when POSIX descendant enumeration is unavailable", async () => {
  const child = simulatedWindowsChild();
  child.pid = 500;
  const signals = [];
  const running = runV12BoundedProcess(process.execPath, ["-e", ""], {
    spawnImplementation: () => {
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    },
    killImplementation: (target, signal) => { signals.push([target, signal]); },
    posixProcessProbeImplementation: () => { throw new Error("ps unavailable"); },
    timeoutMs: 1_000,
    termGraceMs: 5,
    killGraceMs: 20,
  });
  await assert.rejects(running, /v12_maestro_process_tree_enumeration_failed/u);
  assert.deepEqual(signals, [[-500, "SIGTERM"], [-500, "SIGKILL"]]);
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

test("external cancellation terminates Maestro before cleanup restores settings and removes the lease", { timeout: TEST_TIMEOUT_MS }, async (t) => {
  const value = fixture(t, "multi-plan");
  const controller = new AbortController();
  let restoreCalls = 0;
  const runProcess = async (program, args, options) => {
    if (program === value.tools.maestro && args[0] === "test") {
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
