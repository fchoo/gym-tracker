import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT,
  collectInstalledNativeReport,
  createPhase18GarminAdversarialRawReport,
  createPhase18GarminAdversarialRunnerPlan,
  executePhase18GarminAdversarialRunner,
  executePhase18GarminAdversarialRunnerCli,
  parsePhase18GarminAdversarialRunnerArgs,
  validatePhase18GarminAdversarialManifest,
} from "./run-phase18-garmin-adversarial.mjs";
import {
  assertPhase18GarminAdversarialPrivacySafe,
  executePhase18GarminAdversarialVerifier,
  executePhase18GarminAdversarialVerifierCli,
  validatePhase18GarminAdversarialCurrentIdentity,
  validatePhase18GarminAdversarialEvidence,
} from "./verify-phase18-garmin-adversarial.mjs";

const MANIFEST = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/build.json`;
const RECORD = `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-record.json`;
const HASH = "a".repeat(64);
const HEAD = "b".repeat(40);
const NATIVE_BYTES = Buffer.from("native report\n");
const PRIVACY_BYTES = Buffer.from("privacy report\n");
const NATIVE_HASH = createHash("sha256").update(NATIVE_BYTES).digest("hex");
const PRIVACY_HASH = createHash("sha256").update(PRIVACY_BYTES).digest("hex");

function captureCli(fn, argv) {
  const originalArgv = process.argv;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalExitCode = process.exitCode;
  let stdout = "";
  let stderr = "";
  process.argv = argv;
  process.stdout.write = ((chunk) => {
    stdout += String(chunk);
    return true;
  });
  process.stderr.write = ((chunk) => {
    stderr += String(chunk);
    return true;
  });
  process.exitCode = 0;
  try {
    fn();
  } finally {
    process.argv = originalArgv;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
  return { stdout, stderr };
}

function writeExecutable(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

test("installed adversarial route uses the native producer and never the host-fake suite", () => {
  const route = readFileSync("app/__phase18-garmin-adversarial.tsx", "utf8");
  assert.match(route, /runPhase18GarminAdversarialNativeSuite/u);
  assert.doesNotMatch(route, /runPhase18GarminAdversarialHostSuite/u);
});

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
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

function retainedManifest() {
  return {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD,
    source_tree_sha256: HASH,
    package: "com.fchoo.gymtracker.devtest",
    apk: { path: `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/gym-tracker-phase18-garmin-adversarial-devtest.apk`, sha256: HASH, page_alignment_verified: true },
    installed_apk: { sha256: HASH, matches_retained_apk: true },
    device: { abi: "arm64-v8a", identity_sha256: HASH },
  };
}

const expectedCodes = [
  "completed",
  "completed",
  "completed",
  "completed",
  "sign_in_required",
  "stale_generation",
  "data_access_denied",
  "rate_limited",
  "offline",
  "timeout",
  "temporary_failure",
  "malformed_response",
  "malformed_response",
  "malformed_response",
  "temporary_failure",
  "stale_generation",
];
const expectedCalls = [1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3];

function cases() {
  const sessionDigests = [
    "1".repeat(64), "2".repeat(64), "2".repeat(64),
    "3".repeat(64), "3".repeat(64), "3".repeat(64),
  ];
  return createPhase18GarminAdversarialRunnerPlan().case_ids.map((id, index) => ({
    id,
    status: "passed",
    provenance: "native-exact-artifact",
    stage: id.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_"),
    code: expectedCodes[index],
    duration_ms: 1,
    call_count: expectedCalls[index],
    automatic_retry_count: 0,
    retry_after_ms: id === "PH18-ADV-429" ? 900_000 : 0,
    source_write_count: 0,
    connection_state: index === 3 || index === 5
      ? "disconnected"
      : index === 4 ? "sign-in-required" : "connected",
    sync_state: index === 1 || index === 2
      ? "success"
      : index >= 6
        ? `${id === "PH18-ADV-PARTIAL-PAGE" ? "partial" : "failure"}-${expectedCodes[index].replaceAll("_", "-")}`
        : index === 5 ? "failure-stale-generation" : "idle",
    session_digest: sessionDigests[index] ?? "4".repeat(64),
    history_digest: "5".repeat(64),
    source_digest: "6".repeat(64),
    match_digest: "7".repeat(64),
    generation_before: index === 3 ? 7 : index === 4 ? 8 : index === 5 ? 20 : index >= 6 ? 30 : 7,
    generation_after: index === 3 ? 8 : index === 4 ? 8 : index === 5 ? 21 : index >= 6 ? 30 : 7,
  }));
}

function evidence(overrides = {}) {
  return createPhase18GarminAdversarialRawReport({
    manifest: manifest(),
    status: "passed",
    cases: cases(),
    native_report: {
      path: `${PHASE18_GARMIN_ADVERSARIAL_ARTIFACT_ROOT}/native-report.json`,
      sha256: NATIVE_HASH,
    },
    privacy_scan: {
      status: "passed",
      scanned_artifact_count: 4,
      report_sha256: PRIVACY_HASH,
    },
    ...overrides,
  });
}

test("adversarial runner is inert without the explicit Phase 20 authority", () => {
  assert.deepEqual(parsePhase18GarminAdversarialRunnerArgs([
    "--manifest", MANIFEST,
    "--record", RECORD,
  ]), {
    manifest: MANIFEST,
    record: RECORD,
    execute: false,
    phase20Checkpoint: false,
  });
  assert.throws(
    () => parsePhase18GarminAdversarialRunnerArgs([
      "--manifest", MANIFEST,
      "--record", RECORD,
      "--execute",
    ]),
    /phase18_garmin_adversarial_runner_arguments_invalid/u,
  );
  assert.throws(
    () => parsePhase18GarminAdversarialRunnerArgs([
      "--manifest", MANIFEST,
      "--record", RECORD,
      "--unexpected",
    ]),
    /phase18_garmin_adversarial_runner_arguments_invalid/u,
  );
  const calls = [];
  assert.deepEqual(executePhase18GarminAdversarialRunner([
    "--manifest", MANIFEST,
    "--record", RECORD,
  ], {
    readJson: (...args) => calls.push(args),
    writeRawReport: (...args) => calls.push(args),
  }), {
    status: "native_deferred",
    final_evidence_written: false,
  });
  assert.deepEqual(calls, []);
});

test("runner plan owns the exact ordered lifecycle prefix and Phase 20 handoff", () => {
  const plan = createPhase18GarminAdversarialRunnerPlan();
  assert.deepEqual(plan.case_ids.slice(0, 6), [
    "PH18-ADV-RESTORE",
    "PH18-ADV-REFRESH",
    "PH18-ADV-READ",
    "PH18-ADV-LOGOUT",
    "PH18-ADV-RESTART",
    "PH18-ADV-LATE-GENERATION",
  ]);
  assert.equal(plan.execution_authority, "phase20-native-checkpoint");
  assert.equal(plan.final_evidence_owner, "phase20-native-checkpoint");
  assert.equal(plan.runner_writes_final_evidence, false);
  assert.equal(plan.real_account_required, true);
});

test("package scripts expose only planning-safe adversarial commands", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.equal(
    scripts["adversarial:phase18:garmin"],
    `node scripts/run-phase18-garmin-adversarial.mjs --manifest ${MANIFEST} --record ${RECORD}`,
  );
  assert.equal(
    scripts["verify:phase18:garmin-adversarial"],
    `node scripts/verify-phase18-garmin-adversarial.mjs --manifest ${MANIFEST}`,
  );
  assert.equal(
    scripts["test:evidence:phase18:garmin-adversarial"],
    "node --test scripts/phase18-garmin-adversarial.test.mjs",
  );
});

test("manifest and current identity bind source, lock, APK, signature, package, profile, device, and report", () => {
  const current = {
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
    nativeReportSha256: NATIVE_HASH,
    privacyReportSha256: PRIVACY_HASH,
  };
  assert.equal(validatePhase18GarminAdversarialManifest(manifest(), current), true);
  assert.equal(validatePhase18GarminAdversarialCurrentIdentity(evidence(), current), true);
  for (const key of Object.keys(current)) {
    const changed = {
      ...current,
      [key]: key === "currentHead" ? "c".repeat(40) : "c".repeat(64),
    };
    assert.throws(
      () => validatePhase18GarminAdversarialCurrentIdentity(evidence(), changed),
      /phase18_garmin_adversarial_evidence_current_identity_invalid/u,
    );
  }
  for (const changed of [
    { package: "com.example.wrong" },
    { profile: "production" },
    { abi: "x86_64" },
    { source_tree_sha256: "c".repeat(64) },
    { python_lock_sha256: "c".repeat(64) },
    { apk_sha256: "c".repeat(64) },
    { signature_sha256: "c".repeat(64) },
    { device_identity_sha256: "c".repeat(64) },
  ]) {
    assert.throws(
      () => validatePhase18GarminAdversarialManifest(manifest(changed), current),
      /phase18_garmin_adversarial_manifest_invalid/u,
    );
  }
});

test("verifier accepts only the exact ordered expected-injection contract", () => {
  assert.deepEqual(validatePhase18GarminAdversarialEvidence(evidence()), {
    status: "passed",
    cases: 16,
  });
  const exact = evidence();
  for (const variant of [
    { ...exact, cases: exact.cases.map((entry, index) => index === 0 ? { ...entry, provenance: "host-deterministic" } : entry) },
    { ...exact, cases: exact.cases.slice(1) },
    { ...exact, cases: [...exact.cases.slice(0, -1), exact.cases[0]] },
    { ...exact, cases: [exact.cases[1], exact.cases[0], ...exact.cases.slice(2)] },
    { ...exact, case_ids: [...exact.case_ids].reverse() },
    { ...exact, cases: exact.cases.map((entry, index) => index === 7 ? { ...entry, automatic_retry_count: 1 } : entry) },
    { ...exact, cases: exact.cases.map((entry, index) => index === 7 ? { ...entry, call_count: 2 } : entry) },
    { ...exact, cases: exact.cases.map((entry, index) => index === 7 ? { ...entry, retry_after_ms: 999_999 } : entry) },
    { ...exact, cases: exact.cases.map((entry, index) => index === 14 ? { ...entry, source_write_count: 1 } : entry) },
    { ...exact, cases: exact.cases.map((entry, index) => index === 14 ? { ...entry, status: "skipped" } : entry) },
  ]) {
    assert.throws(
      () => validatePhase18GarminAdversarialEvidence(variant),
      /phase18_garmin_adversarial_evidence_/u,
    );
  }
});

test("unexpected real failures remain TECHNICAL_REVIEW_REQUIRED and cannot be rewritten as expected passes", () => {
  const exact = evidence();
  const unexpectedCases = exact.cases.map((entry, index) => index === 10
    ? {
      ...entry,
      status: "TECHNICAL_REVIEW_REQUIRED",
      provenance: "unexpected",
      stage: "native_transport",
      code: "temporary_failure",
    }
    : entry);
  const review = createPhase18GarminAdversarialRawReport({
    manifest: manifest(),
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: unexpectedCases,
    native_report: exact.native_report,
    privacy_scan: exact.privacy_scan,
  });
  assert.deepEqual(validatePhase18GarminAdversarialEvidence(review), {
    status: "TECHNICAL_REVIEW_REQUIRED",
    cases: 16,
  });
  const relabeled = structuredClone(review);
  relabeled.status = "passed";
  relabeled.cases[10].status = "passed";
  relabeled.cases[10].provenance = "native-exact-artifact";
  assert.throws(
    () => validatePhase18GarminAdversarialEvidence(relabeled),
    /phase18_garmin_adversarial_evidence_case_invalid/u,
  );
});

test("privacy scan rejects credentials, identity, provider data, URLs, filenames, and serials", () => {
  for (const forbidden of [
    { credentials: "secret" },
    { mfa_code: "123456" },
    { token: "secret" },
    { ciphertext: "secret" },
    { account_namespace: "private" },
    { external_activity_id: "123456789" },
    { raw_json: {} },
    { route: [{ latitude: 1, longitude: 2 }] },
    { heart_rate: 151 },
    { filename: "personal.fit" },
    { device_serial: "personal-device" },
    { url: "https://example.invalid" },
    { note: "owner@example.invalid" },
    { logcat: "Authorization: Bearer private-value" },
    { note: "private-activity.fit" },
  ]) {
    assert.throws(
      () => assertPhase18GarminAdversarialPrivacySafe(forbidden),
      /phase18_garmin_adversarial_evidence_privacy_invalid/u,
    );
  }
  assert.equal(assertPhase18GarminAdversarialPrivacySafe(evidence()), true);
});

test("Phase 20 runner validates before writing and never writes final evidence", () => {
  const exact = evidence();
  const writes = [];
  const nativeWrites = [];
  const privacyWrites = [];
  const result = executePhase18GarminAdversarialRunner([
    "--manifest", MANIFEST,
    "--record", RECORD,
    "--execute",
    "--phase20-native-checkpoint",
  ], {
    readJson: () => retainedManifest(),
    collectNativeReport: () => ({
      report: {
        schema_version: 1,
        suite: "phase18-garmin-adversarial",
        status: exact.status,
        cases: exact.cases,
        current_identity: {
          currentHead: HEAD,
          currentSourceTreeSha256: HASH,
          currentPythonLockSha256: HASH,
          retainedApkSha256: HASH,
          retainedSignatureSha256: HASH,
          deviceIdentitySha256: HASH,
        },
      },
      logcat: "bounded native result markers only",
    }),
    writeNativeReport: (...args) => nativeWrites.push(args),
    writePrivacyReport: (...args) => privacyWrites.push(args),
    writeRawReport: (report) => writes.push(report),
  });
  assert.deepEqual(result, { status: "passed", final_evidence_written: false });
  assert.equal(writes.length, 1);
  assert.equal(nativeWrites.length, 1);
  assert.equal(privacyWrites.length, 1);
  assert.deepEqual(validatePhase18GarminAdversarialEvidence(writes[0]), {
    status: "passed",
    cases: 16,
  });
});

test("runner rejects private native records before any raw report write", () => {
  const exact = evidence();
  const writes = [];
  assert.throws(
    () => executePhase18GarminAdversarialRunner([
      "--manifest", MANIFEST,
      "--record", RECORD,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      readJson: () => retainedManifest(),
      collectNativeReport: () => ({
        report: {
          schema_version: 1,
          suite: "phase18-garmin-adversarial",
          status: exact.status,
          cases: exact.cases.map((entry, index) => index === 6
            ? { ...entry, token: "synthetic-private-value" }
            : entry),
          current_identity: {
            currentHead: HEAD,
            currentSourceTreeSha256: HASH,
            currentPythonLockSha256: HASH,
            retainedApkSha256: HASH,
            retainedSignatureSha256: HASH,
            deviceIdentitySha256: HASH,
          },
        },
        logcat: "bounded native result markers only",
      }),
      writeRawReport: (report) => writes.push(report),
    }),
    /phase18_garmin_adversarial_record_privacy_invalid/u,
  );
  assert.equal(writes.length, 0);
});

test("runner rejects privacy-unsafe free-form strings and native collection timeouts", () => {
  assert.throws(
    () => executePhase18GarminAdversarialRunner([
      "--manifest", MANIFEST,
      "--record", RECORD,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      readJson: () => retainedManifest(),
      collectNativeReport: () => ({
        report: {
          schema_version: 1,
          suite: "phase18-garmin-adversarial",
          status: "passed",
          cases: cases(),
          current_identity: {
            currentHead: HEAD,
            currentSourceTreeSha256: HASH,
            currentPythonLockSha256: HASH,
            retainedApkSha256: HASH,
            retainedSignatureSha256: HASH,
            deviceIdentitySha256: HASH,
          },
        },
        logcat: "owner@example.invalid",
      }),
    }),
    /phase18_garmin_adversarial_record_privacy_invalid/u,
  );
  const originalDateNow = Date.now;
  const originalPath = process.env.PATH;
  const root = mkdtempSync(path.join(tmpdir(), "phase18-adv-timeout-"));
  try {
    writeExecutable(path.join(root, "adb"), `#!/bin/sh
set -eu
exit 0
`);
    process.env.PATH = `${root}:${originalPath ?? ""}`;
    let index = 0;
    const timeline = [0, 0, 31_000];
    Date.now = () => timeline[Math.min(index++, timeline.length - 1)];
    assert.throws(
      () => collectInstalledNativeReport(),
      /phase18_garmin_adversarial_native_report_timeout/u,
    );
  } finally {
    Date.now = originalDateNow;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("verifier sealing is write-once and requires explicit Phase 20 authority", () => {
  const exact = evidence();
  const reads = (path) => path === MANIFEST ? retainedManifest() : exact;
  const writes = [];
  const resolveCurrentIdentity = () => ({
    currentHead: HEAD,
    currentSourceTreeSha256: HASH,
    currentPythonLockSha256: HASH,
    retainedApkSha256: HASH,
    installedApkSha256: HASH,
    retainedSignatureSha256: HASH,
    deviceIdentitySha256: HASH,
    nativeReportSha256: NATIVE_HASH,
    privacyReportSha256: PRIVACY_HASH,
  });
  assert.deepEqual(executePhase18GarminAdversarialVerifier([
    "--manifest", MANIFEST,
  ], {
    readJson: reads,
    readBytes: (path) => path.endsWith("native-report.json") ? NATIVE_BYTES : PRIVACY_BYTES,
    writeFinalEvidence: (...args) => writes.push(args),
    resolveCurrentIdentity,
  }), {
    status: "passed",
    cases: 16,
    final_evidence_written: false,
  });
  assert.equal(writes.length, 0);
  assert.throws(
    () => executePhase18GarminAdversarialVerifier([
      "--manifest", MANIFEST,
      "--seal",
  ], { readJson: reads, readBytes: (path) => path.endsWith("native-report.json") ? NATIVE_BYTES : PRIVACY_BYTES }),
    /phase18_garmin_adversarial_evidence_arguments_invalid/u,
  );
  assert.deepEqual(executePhase18GarminAdversarialVerifier([
    "--manifest", MANIFEST,
    "--seal",
    "--phase20-native-checkpoint",
  ], {
    readJson: reads,
    readBytes: (path) => path.endsWith("native-report.json") ? NATIVE_BYTES : PRIVACY_BYTES,
    writeFinalEvidence: (...args) => writes.push(args),
    resolveCurrentIdentity,
  }), {
    status: "passed",
    cases: 16,
    final_evidence_written: true,
  });
  assert.equal(writes.length, 1);
});

test("adversarial CLI helpers emit bounded stdout and stderr", () => {
  const runner = captureCli(executePhase18GarminAdversarialRunnerCli, [
    "node",
    "scripts/run-phase18-garmin-adversarial.mjs",
    "--manifest", MANIFEST,
    "--record", RECORD,
  ]);
  assert.match(runner.stdout, /"status":"native_deferred"/u);

  const runnerFailure = captureCli(executePhase18GarminAdversarialRunnerCli, [
    "node",
    "scripts/run-phase18-garmin-adversarial.mjs",
    "--manifest",
    "wrong.json",
  ]);
  assert.match(runnerFailure.stderr, /phase18_garmin_adversarial_runner_arguments_invalid/u);

  const verifier = captureCli(executePhase18GarminAdversarialVerifierCli, [
    "node",
    "scripts/verify-phase18-garmin-adversarial.mjs",
    "--manifest",
    "wrong.json",
  ]);
  assert.match(verifier.stderr, /phase18_garmin_adversarial_evidence_arguments_invalid/u);
});
