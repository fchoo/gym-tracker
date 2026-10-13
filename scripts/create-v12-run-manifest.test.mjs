import assert from "node:assert/strict";
import test from "node:test";

import {
  createV12RunManifest,
  validateV12RunManifest,
} from "./create-v12-run-manifest.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const buildInput = (overrides = {}) => ({
  created_at: "2026-10-14T12:34:56Z",
  source: {
    head: HEAD,
    tree_sha256: HASH,
    dirty: false,
    package_json_sha256: "c".repeat(64),
    package_lock_sha256: "d".repeat(64),
  },
  planning: {
    matrix_sha256: "e".repeat(64),
    requirements_sha256: "f".repeat(64),
    source_manifest_sha256: "1".repeat(64),
    owner_brief_sha256: "2".repeat(64),
    ui_spec_sha256: "3".repeat(64),
    deviations_sha256: "4".repeat(64),
  },
  prototype: {
    revision: 18,
    approval_sha256: "5".repeat(64),
    html_sha256: "6".repeat(64),
  },
  fixtures: { registry_sha256: "7".repeat(64) },
  build: {
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    version_name: "1.2.0",
    version_code: 120,
    apk: {
      path: "artifacts/native/v1.2-acceptance/gym-tracker-v12-devtest.apk",
      sha256: "8".repeat(64),
      size_bytes: 1048576,
      page_alignment_verified: true,
      signature_sha256: "9".repeat(64),
      certificate_sha256: "0".repeat(64),
    },
  },
  device: {
    identity_sha256: "a".repeat(64),
    abi: "arm64-v8a",
    installed_apk_sha256: "8".repeat(64),
    settings_sha256: "b".repeat(64),
    restoration_sha256: "c".repeat(64),
  },
  configuration: { id: "AP-L-C390-P-F100" },
  ...overrides,
});

test("creates a canonical identity-bound live run manifest with a UTC run ID", () => {
  const manifest = createV12RunManifest({ input: buildInput() });
  assert.equal(manifest.run_id, `phase20-20261014T123456Z-${HEAD.slice(0, 12)}`);
  assert.equal(manifest.mode, "live");
  assert.equal(manifest.build.apk.sha256, manifest.device.installed_apk_sha256);
  assert.equal(JSON.stringify(manifest), JSON.stringify(createV12RunManifest({ input: buildInput() })));
  assert.deepEqual(validateV12RunManifest(manifest), manifest);
  assert.ok(Object.isFrozen(manifest));
});

test("rejects run reuse, overwrite, rename-to-pass, and pre-existing outputs", () => {
  const runId = `phase20-20261014T123456Z-${HEAD.slice(0, 12)}`;
  assert.throws(() => createV12RunManifest({ input: buildInput(), existing_run_ids: [runId] }), /v12_run_manifest_run_reuse/u);
  assert.throws(() => createV12RunManifest({ input: buildInput(), output_exists: true }), /v12_run_manifest_output_exists/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({ requested_run_id: `${runId}-pass` }) }), /v12_run_manifest_run_id_invalid/u);
});

test("allows only the explicit pre-build schema fixture to omit artifact and device evidence", () => {
  const fixture = buildInput({
    mode: "prebuild_schema_fixture",
    build: { profile: "development-test", package: "com.fchoo.gymtracker.devtest", version_name: "1.2.0", version_code: 120 },
    device: undefined,
    configuration: undefined,
  });
  const manifest = createV12RunManifest({ input: fixture });
  assert.equal(manifest.mode, "prebuild_schema_fixture");
  assert.equal(manifest.build.apk, undefined);
  assert.equal(manifest.device, undefined);

  assert.throws(() => createV12RunManifest({ input: buildInput({ device: undefined }) }), /v12_run_manifest_live_identity_invalid/u);
});

test("fails closed on substituted, private, hostile, or incomplete identity values", () => {
  assert.throws(() => createV12RunManifest({ input: buildInput({
    build: { ...buildInput().build, apk: { ...buildInput().build.apk, path: "../private.apk" } },
  }) }), /v12_run_manifest_safe_path_invalid/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({
    device: { ...buildInput().device, installed_apk_sha256: HASH },
  }) }), /v12_run_manifest_live_identity_invalid/u);
  assert.throws(() => validateV12RunManifest({ ...createV12RunManifest({ input: buildInput() }), unexpected: true }), /v12_run_manifest_exact_keys_invalid/u);
  assert.throws(() => createV12RunManifest({ input: buildInput({ source: { ...buildInput().source, dirty: true } }) }), /v12_run_manifest_source_invalid/u);
});
