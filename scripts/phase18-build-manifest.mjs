import { isDeepStrictEqual } from "node:util";

const HASH = /^[a-f0-9]{64}$/u;
const HEAD = /^[a-f0-9]{40}$/u;
const SUITES = new Set([
  "phase18-garmin-proof",
  "phase18-garmin-acceptance",
  "phase18-garmin-adversarial",
]);
const OUTPUT_KEYS = [
  "abi", "apk_sha256", "base_head", "device_identity_sha256",
  "js_bundle_embedded", "package", "profile", "python_lock_sha256",
  "schema_version", "signature_sha256", "source_tree_sha256", "suite",
];

function fail(code) {
  throw new Error(`phase18_build_manifest_${code}`);
}

export function sanitizePhase18BuildManifest(retained, input) {
  if (retained?.device?.serial !== undefined || retained?.installed_apk?.device_path !== undefined) {
    fail("privacy_invalid");
  }
  if (!SUITES.has(input?.suite)
    || retained?.schema_version !== 1
    || retained?.suite !== input.suite
    || retained?.profile !== "development-test"
    || retained?.build_variant !== "release"
    || retained?.js_bundle?.embedded !== true
    || retained?.package !== "com.fchoo.gymtracker.devtest"
    || retained?.apk?.path !== `artifacts/native/${input.suite}/gym-tracker-${input.suite}-devtest.apk`
    || !HASH.test(retained?.apk?.sha256 ?? "")
    || retained?.apk?.page_alignment_verified !== true
    || retained?.installed_apk?.matches_retained_apk !== true
    || retained?.installed_apk?.sha256 !== retained.apk.sha256
    || retained?.device?.abi !== "arm64-v8a"
    || !HASH.test(retained?.device?.identity_sha256 ?? "")
    || !HEAD.test(retained?.base_head ?? "")
    || !HASH.test(retained?.source_tree_sha256 ?? "")
    || !HASH.test(input?.pythonLockSha256 ?? "")
    || !HASH.test(input?.signatureSha256 ?? "")) {
    fail("invalid");
  }
  const output = Object.freeze({
    schema_version: 1,
    suite: input.suite,
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    abi: "arm64-v8a",
    js_bundle_embedded: true,
    base_head: retained.base_head,
    source_tree_sha256: retained.source_tree_sha256,
    python_lock_sha256: input.pythonLockSha256,
    apk_sha256: retained.apk.sha256,
    signature_sha256: input.signatureSha256,
    device_identity_sha256: retained.device.identity_sha256,
  });
  if (!isDeepStrictEqual(Object.keys(output).sort(), [...OUTPUT_KEYS].sort())) fail("invalid");
  return output;
}
