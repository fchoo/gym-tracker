import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { assertV12ProductCaseEnvironmentRegistry } from "../run-v12-maestro.mjs";
import{withFaultProof}from"./closeout-resume-proof-fixture.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const project = process.cwd();
const directory = path.join(project, "artifacts/native/personal-closeout-20261027/verifier-coverage/resume-20261029/registry-fault-fixtures-current-665");
const sourceRoot = path.join(project, "artifacts/native/personal-closeout-20261027/verifier-coverage/frozen-product-registry-inputs");
const target = "scripts/run-v12-maestro.mjs";
const targetSha = "6314bd9171f1d19f93a9c1e9657b4b9863ba3875b8b3347b3e07b5635bdd70c3";
const dependency = "src/testing/v12NativeAcceptanceProductRegistry.ts";
const originalDependencySha = sha(readFileSync(path.join(project, dependency)));

test("immutable registry backstops reject malformed imported fixture data", async t => {
  assert.equal(sha(readFileSync(path.join(project, target))), targetSha);
  const mutations = [
    ["wrong count", "registry.pop();", /v12_maestro_product_registry_invalid/u],
    ["invalid prerequisites", "registry[0].prerequisites = null;", /v12_maestro_product_registry_prerequisite_invalid/u],
    ["too many prerequisites", "registry[0].prerequisites = Array(100).fill({});", /v12_maestro_product_registry_prerequisite_invalid/u],
    ["nonproduction source", "registry[0].routeSource = 'scripts/test-fixture.ts';", /v12_maestro_product_registry_non_production_source/u],
    ["generic callback", "registry[0].callbackGroup = 'generic-action';", /v12_maestro_product_registry_binding_invalid/u],
    ["wrong contract owner", "registry[0].contractOperation = 'other-handler';", /v12_maestro_product_registry_contract_owner_invalid/u],
    ["missing ready selector", "registry[0].readySelector = {kind:'id',value:'missing-ready-fixture'};", /v12_maestro_product_registry_binding_invalid/u],
    ["missing action selector", "const item = registry.find(item => item.interaction === 'tap'); item.actionSelector = null;", /v12_maestro_product_registry_binding_invalid/u],
    ["invalid input binding", "const item = registry.find(item => item.interaction === 'tap'); item.inputValue = 'unexpected input';", /v12_maestro_product_registry_input_invalid/u],
    ["observation action", "registry[0].actionSelector = {kind:'id',value:'unexpected-action'};", /v12_maestro_product_registry_observation_action_invalid/u],
    ["generic prerequisite", "const item = registry.find(item => item.prerequisites.length > 0); item.prerequisites[0].callbackGroup = 'generic-prerequisite';", /v12_maestro_product_registry_prerequisite_invalid/u],
    ["semantic callback collision", "const pair = registry.filter(item => item.interaction === 'tap').slice(0,2); pair[1].actionSelector = pair[0].actionSelector; pair[1].selectorSource = pair[0].selectorSource; pair[1].callbackSource = pair[0].callbackSource; pair[1].callbackOwnerToken = pair[0].callbackOwnerToken;", /v12_maestro_product_registry_semantic_owner_collapsed/u],
    ["missing route source", "registry[0].routeSource = 'app/missing-fixture.tsx';", /v12_maestro_product_registry_source_missing/u],
    ["missing prerequisite source", "const item = registry.find(item => item.prerequisites.length > 0); item.prerequisites[0].selectorSource = 'app/missing-fixture.tsx';", /v12_maestro_product_registry_source_missing/u],
    ["missing prerequisite callback", "const item = registry.find(item => item.prerequisites.length > 0); item.prerequisites[0].callbackOwnerToken = 'missing-fixture-callback';", /v12_maestro_product_registry_prerequisite_invalid/u],
    ["prerequisite input mismatch", "const item = registry.find(item => item.prerequisites.length > 0); item.prerequisites[0].interaction = item.prerequisites[0].interaction === 'input' ? 'tap' : 'input';", /v12_maestro_product_registry_prerequisite_invalid/u],
    ["semantic group collision", "const pair = registry.filter(item => item.interaction === 'tap').slice(0,2); pair[1].callbackGroup = pair[0].callbackGroup;", /v12_maestro_product_registry_semantic_group_collapsed/u],
    ["absent visual state", "registry[0].visualStateId = 'BW-MISSING';", /v12_maestro_product_registry_binding_invalid/u],
    ["missing callback source", "const item = registry.find(item => item.interaction === 'tap'); item.callbackSource = null;", /v12_maestro_product_registry_binding_invalid/u],
    ["missing callback owner", "const item = registry.find(item => item.interaction === 'tap'); item.callbackOwnerToken = null;", /v12_maestro_product_registry_binding_invalid/u],
  ];
  mkdirSync(directory, { recursive: true });
  const requestedCase = process.env.V12_RESUME_REGISTRY_CASE;
  const selected = [...mutations.entries()].filter(([, [name]]) => requestedCase === undefined || name === requestedCase);
  assert.ok(selected.length > 0, "requested registry case must exist");
  for (const [index, [name, mutation, expected]] of selected) await t.test(name, async () => {
    const root = mkdtempSync(path.join(directory, `case-${index}-`));
    mkdirSync(path.join(root, "scripts"), { recursive: true });
    mkdirSync(path.join(root, "src/testing"), { recursive: true });
    copyFileSync(path.join(project, target), path.join(root, target));
    for (const file of readdirSync(path.join(project, "scripts"))) {
      if (file === "run-v12-maestro.mjs") continue;
      symlinkSync(path.join(project, "scripts", file), path.join(root, "scripts", file));
    }
    symlinkSync(path.join(project, "src/testing/contracts"), path.join(root, "src/testing/contracts"));
    symlinkSync(path.join(project, "src/testing/phase20VisualStateRegistry.generated.ts"), path.join(root, "src/testing/phase20VisualStateRegistry.generated.ts"));
    const fixtureSource = [
      `import { V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY as original, v12NativeAcceptanceProductDefinition } from ${JSON.stringify(pathToFileURL(path.join(project, dependency)).href)};`,
      "const registry = original.map(item => ({...item, prerequisites: item.prerequisites.map(prerequisite => ({...prerequisite}))}));",
      mutation,
      "export const V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY = registry;",
      "export { v12NativeAcceptanceProductDefinition };",
    ].join("\n") + "\n";
    writeFileSync(path.join(root, dependency), fixtureSource);
    const binding = {
      test_only: true, fault_injection: true, native_acceptance_proof: false,
      target_source: target, target_source_sha256: targetSha,
      substituted_dependency: dependency, production_dependency_sha256: originalDependencySha,
      fixture_dependency_sha256: sha(fixtureSource), mutation: name,
      full_dependency_equality_claimed: false, expected_rejection: expected.source,
    };
    assert.equal(sha(readFileSync(path.join(root, target))), targetSha);
    writeFileSync(path.join(root, "fault-binding.json"), JSON.stringify(binding, null, 2) + "\n");
    await withFaultProof({tree:root,subject:target,testFile:"scripts/testing/closeout-current-runner-faults.test.mjs",
      reason:`Malformed imported registry: ${name}`,overrides:[dependency],operation:async()=>{
        const runner = await import(pathToFileURL(path.join(root, target)).href);
        assert.throws(() => runner.assertV12ProductCaseEnvironmentRegistry({ root: sourceRoot }), expected);
      }});
  });
});

test("production source scanning rejects a live testing dispatcher", () => {
  const root = mkdtempSync(path.join(directory, "live-dispatcher-data-"));
  mkdirSync(path.join(root, "app"), { recursive: true });
  mkdirSync(path.join(root, "src"), { recursive: true });
  const bytes = "export const nativeAcceptanceAction = 'forbidden live fixture dispatcher';\n";
  writeFileSync(path.join(root, "src/dispatcher.ts"), bytes);
  writeFileSync(path.join(root, "fault-binding.json"), JSON.stringify({ test_only: true, fault_injection: true,
    target_source_sha256: targetSha, substituted_source: "src/dispatcher.ts", fixture_source_sha256: sha(bytes),
    native_acceptance_proof: false, full_dependency_equality_claimed: false }, null, 2) + "\n");
  assert.throws(() => assertV12ProductCaseEnvironmentRegistry({ root }), /v12_maestro_product_registry_testing_dispatcher_live/u);
});

test("a failed cleanup dependency cannot turn an empty process tree into success", async () => {
  const root = mkdtempSync(path.join(directory, "cleanup-stop-fault-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  copyFileSync(path.join(project, target), path.join(root, target));
  for (const file of readdirSync(path.join(project, "scripts"))) {
    if (["run-v12-maestro.mjs", "v12-posix-process-tree.mjs"].includes(file)) continue;
    symlinkSync(path.join(project, "scripts", file), path.join(root, "scripts", file));
  }
  symlinkSync(path.join(project, "src"), path.join(root, "src"));
  const bytes = "export const V12_POSIX_OWNERSHIP_ENV = 'V12_TEST_OWNER';\nexport function createV12PosixProcessTreeTracker() { return {treeState:()=> 'empty', signal:()=> {throw Error('unexpected signal');}, stop:()=> {throw Error('controlled cleanup failure');}}; }\n";
  writeFileSync(path.join(root, "scripts/v12-posix-process-tree.mjs"), bytes);
  writeFileSync(path.join(root, "fault-binding.json"), JSON.stringify({ test_only: true, fault_injection: true,
    target_source_sha256: targetSha, substituted_dependency: "scripts/v12-posix-process-tree.mjs",
    production_dependency_sha256: sha(readFileSync(path.join(project, "scripts/v12-posix-process-tree.mjs"))),
    fixture_dependency_sha256: sha(bytes), native_acceptance_proof: false, full_dependency_equality_claimed: false }, null, 2) + "\n");
  assert.equal(sha(readFileSync(path.join(root, target))), targetSha);
  await withFaultProof({tree:root,subject:target,testFile:"scripts/testing/closeout-current-runner-faults.test.mjs",
    reason:"An imported cleanup tracker reports failure after an empty tree",overrides:["scripts/v12-posix-process-tree.mjs"],operation:async()=>{
      const runner = await import(pathToFileURL(path.join(root, target)).href);
      const child = new EventEmitter();child.pid = 7001;child.stdout = new PassThrough();child.stderr = new PassThrough();
      const result = runner.runV12BoundedProcess(process.execPath, [], { platform: "linux", timeoutMs: 1000,spawnImplementation: () => child });
      child.emit("close", 0, null);
      await assert.rejects(result, /v12_maestro_process_tree_termination_failed/u);
    }});
});
