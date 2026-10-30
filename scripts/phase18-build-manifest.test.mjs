import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePhase18BuildManifest } from "./phase18-build-manifest.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);

function retained(suite, overrides = {}) {
  return {
    schema_version: 1,
    suite,
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: { path: `artifacts/native/${suite}/gym-tracker-${suite}-devtest.apk`, sha256: HASH, size_bytes: 1, page_alignment_kib: 16, page_alignment_verified: true },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    device: { role: "automated-test-device", api: 36, abi: "arm64-v8a", model: "redacted", android_release: "16", identity_sha256: HASH },
    toolchain: {},
    started_at: "2026-10-11T00:00:00Z",
    finished_at: "2026-10-11T00:01:00Z",
    ...overrides,
  };
}

test("sanitizes the one retained v1.2 acceptance builder manifest", () => {
  const suite = "v1.2-acceptance";
  assert.deepEqual(sanitizePhase18BuildManifest(retained(suite), {
    suite,
    pythonLockSha256: HASH,
    signatureSha256: HASH,
  }), {
    schema_version: 1,
    suite,
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    abi: "arm64-v8a",
    js_bundle_embedded: true,
    base_head: HEAD,
    source_tree_sha256: HASH,
    python_lock_sha256: HASH,
    apk_sha256: HASH,
    signature_sha256: HASH,
    device_identity_sha256: HASH,
  });
});

test("rejects privacy-unsafe retained Phase 18 manifests", () => {
  assert.throws(() => sanitizePhase18BuildManifest(retained("v1.2-acceptance", {
    installed_apk: { device_path: "/data/app/private.apk", sha256: HASH, matches_retained_apk: true },
  }), {
    suite: "v1.2-acceptance",
    pythonLockSha256: HASH,
    signatureSha256: HASH,
  }), /phase18_build_manifest_privacy_invalid/u);
  assert.throws(() => sanitizePhase18BuildManifest(retained("v1.2-acceptance", {
    device: { serial: "private", abi: "arm64-v8a", identity_sha256: HASH },
  }), {
    suite: "v1.2-acceptance",
    pythonLockSha256: HASH,
    signatureSha256: HASH,
  }), /phase18_build_manifest_privacy_invalid/u);
});

test("rejects malformed retained Phase 18 manifests", () => {
  const suite = "v1.2-acceptance";
  const validInput = { suite, pythonLockSha256: HASH, signatureSha256: HASH };
  const variants = [
    [retained(suite), null],
    [retained(suite), { ...validInput, suite: "phase18-garmin-acceptance" }],
    [retained(suite, { schema_version: 2 }), validInput],
    [retained(suite, { suite: "phase18-garmin-proof" }), validInput],
    [retained(suite, { profile: "release" }), validInput],
    [retained(suite, { build_variant: "debug" }), validInput],
    [retained(suite, { js_bundle: { embedded: false } }), validInput],
    [retained(suite, { package: "private.package" }), validInput],
    [retained(suite, { apk: { ...retained(suite).apk, path: "wrong.apk" } }), validInput],
    [retained(suite, { apk: { ...retained(suite).apk, sha256: "bad" } }), validInput],
    [retained(suite, { apk: { ...retained(suite).apk, sha256: undefined } }), validInput],
    [retained(suite, { apk: { ...retained(suite).apk, page_alignment_verified: false } }), validInput],
    [retained(suite, { installed_apk: { sha256: HASH, matches_retained_apk: false } }), validInput],
    [retained(suite, { installed_apk: { sha256: "c".repeat(64), matches_retained_apk: true } }), validInput],
    [retained(suite, { device: { abi: "x86_64", identity_sha256: HASH } }), validInput],
    [retained(suite, { device: { abi: "arm64-v8a", identity_sha256: "bad" } }), validInput],
    [retained(suite, { device: { abi: "arm64-v8a", identity_sha256: undefined } }), validInput],
    [retained(suite, { base_head: "bad" }), validInput],
    [retained(suite, { base_head: undefined }), validInput],
    [retained(suite, { source_tree_sha256: "bad" }), validInput],
    [retained(suite, { source_tree_sha256: undefined }), validInput],
    [retained(suite), { ...validInput, pythonLockSha256: "bad" }],
    [retained(suite), { ...validInput, pythonLockSha256: undefined }],
    [retained(suite), { ...validInput, signatureSha256: "bad" }],
    [retained(suite), { ...validInput, signatureSha256: undefined }],
  ];
  for (const [manifest, input] of variants) {
    assert.throws(() => sanitizePhase18BuildManifest(manifest, input), /phase18_build_manifest_invalid/u);
  }
});
