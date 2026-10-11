import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE18_GARMIN_PROOF_ARTIFACT_ROOT,
  createPhase18GarminTechnicalReviewReport,
  createPhase18GarminProofRunnerPlan,
  executePhase18GarminProofRunner,
  parsePhase18GarminProofRunnerArgs,
  sanitizePhase18GarminProofBuildManifest,
  validatePhase18GarminProofBuildManifest,
} from "./run-phase18-garmin-proof.mjs";
import {
  createPhase18GarminProofFinalEvidence,
  parsePhase18GarminProofVerifierArgs,
  validatePhase18GarminProofCurrentIdentity,
  validatePhase18GarminProofEvidence,
} from "./verify-phase18-garmin-proof.mjs";

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

function passedCase(id) {
  const base = { id, status: "passed", duration_ms: 1 };
  if (id === "PH18-PKG") return { ...base, result_sha256: HASH };
  if (id === "PH18-MFA") return { ...base, outcome: "not_requested" };
  if (["PH18-READ", "PH18-REFRESH", "PH18-PRIVACY"].includes(id)) {
    return { ...base, count: 1, result_sha256: HASH };
  }
  return base;
}

function passedEvidence(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    status: "passed",
    manifest: manifest(),
    case_ids: [...createPhase18GarminProofRunnerPlan().case_ids],
    cases: createPhase18GarminProofRunnerPlan().case_ids.map(passedCase),
    standalone: {
      embedded_js: true,
      external_python: false,
      metro: false,
      downloaded_scripts: false,
      runtime_agent: false,
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 2,
      report_sha256: HASH,
    },
    raw_report_sha256: HASH,
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

test("Phase 18 runner sanitizes the repository native-build manifest without manual evidence fabrication", () => {
  const retained = {
    schema_version: 1,
    suite: "phase18-garmin-proof",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-proof-devtest.apk`,
      sha256: HASH,
      size_bytes: 1,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    package_launch: { component: "safe-component", succeeded: true },
    device: {
      role: "automated-test-device",
      api: 36,
      abi: "arm64-v8a",
      model: "bounded-device-class",
      android_release: "16",
      identity_sha256: HASH,
    },
    toolchain: {},
    started_at: "bounded-time",
    finished_at: "bounded-time",
  };
  assert.deepEqual(sanitizePhase18GarminProofBuildManifest(retained, {
    currentPythonLockSha256: HASH,
    retainedSignatureSha256: HASH,
  }), manifest());
  assert.throws(
    () => sanitizePhase18GarminProofBuildManifest({
      ...retained,
      device: { ...retained.device, serial: "personal-device" },
    }, {
      currentPythonLockSha256: HASH,
      retainedSignatureSha256: HASH,
    }),
    /phase18_build_manifest_privacy_invalid/u,
  );
  const buildScript = readFileSync("scripts/build-current-native-test-apk.sh", "utf8");
  assert.match(buildScript, /phase18-garmin-proof/u);
  assert.match(buildScript, /device_identity_sha256/u);
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

test("Phase 18 runner classifies post-manifest failures without leaking exception details", () => {
  const report = createPhase18GarminTechnicalReviewReport({
    manifest: manifest(),
    passedCases: [],
    stage: "PH18-PKG",
    code: "packaging_failed",
    privateError: new Error("private path token account activity 123456789"),
  });
  assert.equal(report.status, "TECHNICAL_REVIEW_REQUIRED");
  assert.deepEqual(report.cases, [{
    id: "PH18-PKG",
    status: "TECHNICAL_REVIEW_REQUIRED",
    duration_ms: 0,
    code: "packaging_failed",
  }]);
  assert.equal(report.failure_stage, "PH18-PKG");
  assert.doesNotMatch(JSON.stringify(report), /private|path|token|account|123456789/iu);
  assert.throws(
    () => createPhase18GarminTechnicalReviewReport({
      manifest: manifest(),
      passedCases: [passedCase("PH18-PKG")],
      stage: "PH18-READ",
      code: "temporary_failure",
    }),
    /phase18_case_order_invalid/u,
  );
});

test("Phase 18 route is guarded, uses the real adapter/module, and keeps secrets in secure fields", () => {
  const route = readFileSync("app/__phase18-garmin-proof.tsx", "utf8");
  const bootstrap = readFileSync("src/bootstrap/phase18GarminProof.ts", "utf8");
  const layout = readFileSync("app/_layout.tsx", "utf8");
  assert.match(route, /phase18GarminProofEnabled/u);
  assert.match(route, /createProductionPhase18GarminProofHarness/u);
  assert.match(bootstrap, /createGarminActivityAdapter/u);
  assert.match(bootstrap, /getGarminConnectNativeModule/u);
  assert.match(route, /secureTextEntry/u);
  assert.doesNotMatch(route, /fetch\(|axios|child_process|python-shell|localhost|http:\/\//u);
  assert.doesNotMatch(route, /final-evidence\.json/u);
  assert.match(layout, /Phase18GarminProofNavigator/u);
  assert.match(layout, /nativeContractSuite === "phase18-garmin-proof"/u);
  assert.match(layout, /pathname === "\/__phase18-garmin-proof"/u);
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

test("Phase 18 verifier accepts one exact ordered pass and binds current source/artifacts", () => {
  const evidence = passedEvidence();
  assert.deepEqual(validatePhase18GarminProofEvidence(evidence), {
    status: "passed",
    cases: 7,
  });
  assert.equal(validatePhase18GarminProofCurrentIdentity(evidence, {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
    rawReportSha256: HASH,
  }), true);
});

test("Phase 18 verifier rejects missing, skipped, duplicated, and reordered cases", () => {
  const exact = passedEvidence();
  const variants = [
    { ...exact, cases: exact.cases.slice(0, -1) },
    { ...exact, cases: exact.cases.map((entry, index) => index === 3 ? { ...entry, status: "skipped" } : entry) },
    { ...exact, cases: [...exact.cases.slice(0, -1), exact.cases[0]] },
    { ...exact, cases: [exact.cases[1], exact.cases[0], ...exact.cases.slice(2)] },
    { ...exact, case_ids: [...exact.case_ids].reverse() },
  ];
  for (const evidence of variants) {
    assert.throws(
      () => validatePhase18GarminProofEvidence(evidence),
      /phase18_evidence_/u,
    );
  }
});

test("Phase 18 verifier rejects stale or wrong artifact bindings", () => {
  const evidence = passedEvidence();
  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
    rawReportSha256: HASH,
  };
  for (const key of Object.keys(current)) {
    const wrong = {
      ...current,
      [key]: key === "currentHead" ? "c".repeat(40) : "c".repeat(64),
    };
    assert.throws(
      () => validatePhase18GarminProofCurrentIdentity(evidence, wrong),
      /phase18_evidence_current_identity_invalid/u,
    );
  }
});

test("Phase 18 verifier accepts a bounded technical stop but never mistakes it for PASS", () => {
  const cases = createPhase18GarminProofRunnerPlan().case_ids
    .slice(0, 5)
    .map(passedCase);
  cases[4] = {
    id: "PH18-RESTART",
    status: "TECHNICAL_REVIEW_REQUIRED",
    duration_ms: 1,
    code: "sign_in_required",
  };
  const evidence = passedEvidence({
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases,
    failure_stage: "PH18-RESTART",
    failure_code: "sign_in_required",
  });
  assert.deepEqual(validatePhase18GarminProofEvidence(evidence), {
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: 5,
    stage: "PH18-RESTART",
    code: "sign_in_required",
  });
  assert.throws(
    () => validatePhase18GarminProofEvidence({ ...evidence, status: "passed" }),
    /phase18_evidence_/u,
  );
});

test("Phase 18 verifier rejects secret, account, activity, route, health, filename, URL, and SQL data", () => {
  const forbidden = [
    { credentials: "secret" },
    { account_namespace: "private" },
    { external_activity_id: "123456789" },
    { route: [{ latitude: 1 }] },
    { heart_rate: 151 },
    { bodyweight: 70 },
    { filename: "personal.fit" },
    { url: "https://example.invalid" },
    { sql_params: ["private"] },
    { note: "owner@example.invalid" },
  ];
  for (const extra of forbidden) {
    assert.throws(
      () => validatePhase18GarminProofEvidence({ ...passedEvidence(), ...extra }),
      /phase18_evidence_privacy_invalid/u,
    );
  }
});

test("Phase 18 final evidence can only be sealed from a matching bounded raw report", () => {
  const report = passedEvidence();
  delete report.raw_report_sha256;
  delete report.case_ids;
  const rawReportBytes = Buffer.from(`${JSON.stringify(report)}\n`);
  const finalEvidence = createPhase18GarminProofFinalEvidence({
    manifest: manifest(),
    report,
    rawReportBytes,
  });
  assert.equal(finalEvidence.raw_report_sha256, createHash("sha256").update(rawReportBytes).digest("hex"));
  assert.deepEqual(finalEvidence.case_ids, createPhase18GarminProofRunnerPlan().case_ids);
  assert.deepEqual(validatePhase18GarminProofEvidence(finalEvidence), {
    status: "passed",
    cases: 7,
  });
  assert.throws(
    () => createPhase18GarminProofFinalEvidence({
      manifest: manifest({ apk_sha256: "c".repeat(64) }),
      report,
      rawReportBytes,
    }),
    /phase18_evidence_report_identity_invalid/u,
  );
});

test("Phase 18 sealing requires the explicit comprehensive Phase 20 checkpoint", () => {
  assert.deepEqual(parsePhase18GarminProofVerifierArgs([
    "--manifest",
    MANIFEST,
  ]), {
    manifest: MANIFEST,
    seal: false,
    phase20Checkpoint: false,
  });
  assert.deepEqual(parsePhase18GarminProofVerifierArgs([
    "--manifest",
    MANIFEST,
    "--seal",
    "--phase20-native-checkpoint",
  ]), {
    manifest: MANIFEST,
    seal: true,
    phase20Checkpoint: true,
  });
  assert.throws(
    () => parsePhase18GarminProofVerifierArgs(["--manifest", MANIFEST, "--seal"]),
    /phase18_verifier_arguments_invalid/u,
  );
});
