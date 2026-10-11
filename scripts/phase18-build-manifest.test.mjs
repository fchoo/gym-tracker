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

test("sanitizes the shared builder manifest for every Phase 18 native suite", () => {
  for (const suite of [
    "phase18-garmin-proof",
    "phase18-garmin-acceptance",
    "phase18-garmin-adversarial",
  ]) {
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
  }
});

test("rejects privacy-unsafe retained Phase 18 manifests", () => {
  assert.throws(() => sanitizePhase18BuildManifest(retained("phase18-garmin-acceptance", {
    installed_apk: { device_path: "/data/app/private.apk", sha256: HASH, matches_retained_apk: true },
  }), {
    suite: "phase18-garmin-acceptance",
    pythonLockSha256: HASH,
    signatureSha256: HASH,
  }), /phase18_build_manifest_privacy_invalid/u);
});
