import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { createControlledRunner } from "./testing/v12-production-launcher/controlled-runner.mjs";

function fixture(t) {
  const runner = createControlledRunner();
  t.after(runner.cleanup);
  return runner;
}
function markers(root, extra = {}) {
  return { NODE_ENV: "test", V12_NATIVE_ADAPTER_TEST_MODE: "phase20-native-adapter-subprocess", V12_NATIVE_ADAPTER_TEST_PROCESS: "1", V12_NATIVE_ADAPTER_COMMAND: path.join(root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs"), ...extra };
}

test("unset adapter command reaches the default launcher and a real exclusive lease protocol", (t) => {
  const runner = fixture(t);
  const lease = runner.success("acquire-lease");
  assert.match(lease.lease_id, /^[a-f0-9]{48}$/u);
  assert.equal(lease.native_execution, "EXECUTED");
  assert.notEqual(runner.invoke("acquire-lease").status, 0);
  assert.equal(runner.success("release-lease", { lease }), true);
});
test("checked-in fake accepted only by the explicit test triplet", (t) => {
  const runner = fixture(t);
  const result = runner.invoke("acquire-lease", {}, markers(runner.root));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { id: "lease" });
});
test("fake command rejected outside explicit test mode", (t) => {
  const runner = fixture(t);
  const result = runner.invoke("acquire-lease", {}, { V12_NATIVE_ADAPTER_COMMAND: path.join(runner.root, "scripts/testing/v12-phase20-blackbox/fake-device-adapter.mjs") });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /command_override_forbidden/u);
});
for (const field of ["NODE_ENV", "V12_NATIVE_ADAPTER_TEST_MODE", "V12_NATIVE_ADAPTER_TEST_PROCESS"]) {
  test(`partial test triplet rejected with and without override: ${field}`, (t) => {
    const runner = fixture(t);
    const partial = markers(runner.root, { [field]: undefined });
    for (const command of [partial.V12_NATIVE_ADAPTER_COMMAND, undefined]) {
      const result = runner.invoke("acquire-lease", {}, { ...partial, V12_NATIVE_ADAPTER_COMMAND: command });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /test_mode_inconsistent/u);
    }
  });
}
for (const field of ["source", "apk", "device"]) test(`forged ${field} response attestation rejected`, (t) => {
  const runner = fixture(t);
  const result = runner.invoke("acquire-lease", {}, markers(runner.root, { V12_FAKE_DEVICE_FORGE_ATTESTATION: field }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /attestation_invalid/u);
});
test("production rejects test markers even when the fake override is unset", (t) => {
  const runner = fixture(t);
  const result = runner.invoke("acquire-lease", {}, markers(runner.root, { V12_NATIVE_ADAPTER_COMMAND: undefined }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test_environment_forbidden/u);
});

test("direct launcher rejects extra attestation fields without reflecting private data", (t) => {
  const runner = fixture(t);
  const launcher = path.join(runner.root, "scripts/v12-production-native-adapter-launcher.mjs");
  const build = runner.build;
  const request = { schema_version: 1, action: "acquire-lease", payload: { run_id: build.run_id }, attestation: {
    schema_version: 1, action: "acquire-lease", launcher_source_sha256: createHash("sha256").update(readFileSync(launcher)).digest("hex"),
    run_id: build.run_id, build_profile: "development-test", suite: "v1.2-acceptance", package: build.build.package,
    source_tree_sha256: build.source.tree_sha256, apk_sha256: build.build.apk.sha256, installed_apk_sha256: build.device.installed_apk_sha256,
    apk_signature_sha256: build.build.apk.signature_sha256, device_identity_sha256: build.device.identity_sha256,
    private_value: "must-never-be-reflected",
  } };
  const result = spawnSync(process.execPath, [launcher, "--action", "acquire-lease"], { cwd: runner.root, input: JSON.stringify(request), encoding: "utf8", timeout: 5_000 });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "v12_production_native_launcher_attestation_invalid\n");
});
