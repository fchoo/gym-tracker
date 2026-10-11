import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE18_GARMIN_PROOF_ARTIFACT_ROOT,
  createPhase18GarminProofRunnerPlan,
  executePhase18GarminProofRunner,
  parsePhase18GarminProofRunnerArgs,
  validatePhase18GarminProofBuildManifest,
} from "./run-phase18-garmin-proof.mjs";

const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const MANIFEST = `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/build.json`;

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-proof",
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
    ...overrides,
  };
}

test("Phase 18 runner is a Phase 20-only explicit native execution gate", () => {
  assert.deepEqual(parsePhase18GarminProofRunnerArgs([
    "--manifest",
    MANIFEST,
  ]), {
    manifest: MANIFEST,
    execute: false,
    phase20Checkpoint: false,
  });
  assert.deepEqual(parsePhase18GarminProofRunnerArgs([
    "--manifest",
    MANIFEST,
    "--execute",
    "--phase20-native-checkpoint",
  ]), {
    manifest: MANIFEST,
    execute: true,
    phase20Checkpoint: true,
  });
  assert.throws(
    () => parsePhase18GarminProofRunnerArgs(["--manifest", MANIFEST, "--execute"]),
    /phase18_runner_arguments_invalid/u,
  );
  assert.throws(
    () => parsePhase18GarminProofRunnerArgs(["--manifest", "other.json"]),
    /phase18_runner_arguments_invalid/u,
  );
});

test("Phase 18 runner plan preserves ordered proof, privacy, and no-fallback contracts", () => {
  const plan = createPhase18GarminProofRunnerPlan();
  assert.deepEqual(plan.case_ids, [
    "PH18-PKG",
    "PH18-LOGIN",
    "PH18-MFA",
    "PH18-READ",
    "PH18-RESTART",
    "PH18-REFRESH",
    "PH18-PRIVACY",
  ]);
  assert.equal(plan.credentials, "installed-app-only");
  assert.equal(plan.transport, "embedded-garmin-module-only");
  assert.equal(plan.fallback_transport, "prohibited");
  assert.equal(plan.final_evidence_owner, "phase20-native-checkpoint");
  assert.equal(plan.runner_writes_final_evidence, false);
});

test("Phase 18 manifest binds only fresh hashed identity fields", () => {
  assert.equal(validatePhase18GarminProofBuildManifest(manifest(), {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    retainedSignatureSha256: HASH,
  }), true);
  for (const changed of [
    { base_head: "c".repeat(40) },
    { source_tree_sha256: "c".repeat(64) },
    { python_lock_sha256: "c".repeat(64) },
    { apk_sha256: "c".repeat(64) },
    { signature_sha256: "c".repeat(64) },
    { profile: "production" },
    { abi: "x86_64" },
    { serial: "personal-device" },
  ]) {
    assert.throws(
      () => validatePhase18GarminProofBuildManifest(manifest(changed), {
        currentHead: HEAD,
        currentSourceTreeSha256: HASH,
        currentPythonLockSha256: HASH,
        retainedApkSha256: HASH,
        retainedSignatureSha256: HASH,
      }),
      /phase18_manifest_invalid/u,
    );
  }
});

test("Phase 18 host plan mode never resolves adb, installs, launches, or writes evidence", () => {
  const calls = [];
  const result = executePhase18GarminProofRunner([
    "--manifest",
    MANIFEST,
  ], {
    native: (...args) => calls.push(args),
    writeEvidence: (...args) => calls.push(args),
  });
  assert.equal(result.status, "native_deferred");
  assert.deepEqual(calls, []);
});

test("Phase 18 route is guarded, uses the real adapter/module, and keeps secrets in secure fields", () => {
  const route = readFileSync("app/__phase18-garmin-proof.tsx", "utf8");
  assert.match(route, /phase18GarminProofEnabled/u);
  assert.match(route, /createGarminActivityAdapter/u);
  assert.match(route, /getGarminConnectNativeModule/u);
  assert.match(route, /secureTextEntry/u);
  assert.doesNotMatch(route, /fetch\(|axios|child_process|python-shell|localhost|http:\/\//u);
  assert.doesNotMatch(route, /final-evidence\.json/u);
});

test("Phase 18 package scripts expose only planning, focused tests, and strict verification", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.equal(
    scripts["proof:phase18:garmin"],
    `node scripts/run-phase18-garmin-proof.mjs --manifest ${MANIFEST}`,
  );
  assert.equal(
    scripts["verify:phase18:garmin-proof"],
    `node scripts/verify-phase18-garmin-proof.mjs --manifest ${MANIFEST}`,
  );
  assert.equal(
    scripts["test:evidence:phase18:garmin-proof"],
    "node --test scripts/phase18-garmin-proof.test.mjs",
  );
});
