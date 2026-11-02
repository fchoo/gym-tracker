import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PHASE18_GARMIN_PROOF_CASE_IDS,
  PHASE18_GARMIN_PROOF_RESULT_MARKER,
} from "../src/testing/phase18GarminProof.ts";
import {
  PHASE18_GARMIN_PROOF_APK,
  PHASE18_GARMIN_PROOF_ARTIFACT_ROOT,
  PHASE18_GARMIN_PROOF_RAW_REPORT,
  createPhase18GarminTechnicalReviewReport,
  createPhase18GarminProofRunnerPlan,
  executePhase18GarminProofRunner,
  parsePhase18GarminProofMarker,
  parsePhase18GarminProofRunnerArgs,
  sanitizePhase18GarminProofBuildManifest,
} from "./proof-runner-evidence.mjs";
import {
  createPhase18GarminProofFinalEvidence,
  executePhase18GarminProofVerifier,
  parsePhase18GarminProofVerifierArgs,
  resolvePhase18GarminProofCurrentIdentity,
  validatePhase18GarminProofEvidence,
} from "./proof-verifier-evidence.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import {
  PHASE18_AGGREGATE_ARTIFACT_ROOT,
  PHASE18_AGGREGATE_MANIFEST,
  PHASE18_AGGREGATE_SUITE,
} from "./phase18-aggregate-acceptance.mjs";

const MANIFEST = PHASE18_AGGREGATE_MANIFEST;
const FINAL_EVIDENCE = `${PHASE18_GARMIN_PROOF_ARTIFACT_ROOT}/final-evidence.json`;
const PYTHON_LOCK = "modules/garmin-connect/python/garmin-python-lock.json";
const PACKAGE = "com.fchoo.gymtracker.devtest";
const HASH = "a".repeat(64);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function proofPassedCase(id) {
  const base = { id, status: "passed", duration_ms: 1 };
  if (id === "PH18-PKG") return { ...base, result_sha256: HASH };
  if (id === "PH18-MFA") return { ...base, outcome: "not_requested" };
  if (["PH18-READ", "PH18-REFRESH", "PH18-PRIVACY"].includes(id)) {
    return { ...base, count: 1, result_sha256: HASH };
  }
  return base;
}

function marker(entry) {
  return `${PHASE18_GARMIN_PROOF_RESULT_MARKER}${JSON.stringify(entry)}`;
}

function withEnv(updates, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createRetainedManifest({ currentHead, currentSourceTreeSha256, apkSha256, deviceIdentitySha256 }) {
  return {
    schema_version: 1,
    suite: PHASE18_AGGREGATE_SUITE,
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: currentHead,
    source_tree_sha256: currentSourceTreeSha256,
    package: PACKAGE,
    apk: {
      path: PHASE18_GARMIN_PROOF_APK,
      sha256: apkSha256,
      page_alignment_verified: true,
    },
    installed_apk: {
      sha256: apkSha256,
      matches_retained_apk: true,
    },
    device: {
      abi: "arm64-v8a",
      identity_sha256: deviceIdentitySha256,
    },
  };
}

function writeExecutable(filePath, contents) {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function withProofWorkspace(options, callback) {
  const artifactRoot = path.resolve(PHASE18_GARMIN_PROOF_ARTIFACT_ROOT);
  const aggregateRoot = path.resolve(PHASE18_AGGREGATE_ARTIFACT_ROOT);
  const sdkRoot = path.join(tmpdir(), `phase18-proof-sdk-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const stateRoot = path.join(tmpdir(), `phase18-proof-sdk-${process.pid}-${Date.now()}`);
  const stateFile = path.join(stateRoot, "log-state.txt");
  const apkBytes = Buffer.from(options.apkText ?? "proof-apk");
  const retainedSignatureSha256 = "b".repeat(64);
  const currentHead = options.currentHead ?? execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  const currentSourceTreeSha256 = sourceTreeSha256(process.cwd());
  const currentPythonLockSha256 = sha256(readFileSync(PYTHON_LOCK));
  const apkSha256 = sha256(apkBytes);
  const device = {
    serial: "PHASE18PROOF",
    abi: "arm64-v8a",
    apiLevel: "36",
    model: "phase18-proof-device",
  };
  const deviceIdentitySha256 = sha256(JSON.stringify(device));
  const retainedManifest = createRetainedManifest({
    currentHead,
    currentSourceTreeSha256,
    apkSha256,
    deviceIdentitySha256,
  });
  const manifest = sanitizePhase18GarminProofBuildManifest(retainedManifest, {
    currentPythonLockSha256,
    retainedSignatureSha256,
  });
  const logs = options.logs ?? [];
  const installedApkPath = path.join(stateRoot, "installed.apk");

  rmSync(artifactRoot, { recursive: true, force: true });
  rmSync(aggregateRoot, { recursive: true, force: true });
  rmSync(sdkRoot, { recursive: true, force: true });
  rmSync(stateRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(aggregateRoot, { recursive: true });
  mkdirSync(path.join(sdkRoot, "platform-tools"), { recursive: true });
  mkdirSync(path.join(sdkRoot, "build-tools", "35.0.0"), { recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  writeFileSync(stateFile, "0");
  writeFileSync(installedApkPath, options.installedApkBytes ?? apkBytes);
  writeFileSync(path.resolve(PHASE18_GARMIN_PROOF_APK), apkBytes);
  writeFileSync(path.resolve(MANIFEST), `${JSON.stringify(retainedManifest, null, 2)}\n`);

  const adbScript = `#!/bin/sh
set -eu
state_file='${stateFile}'
if [ "$1" = "devices" ]; then
  printf 'List of devices attached\\n${device.serial}\\tdevice\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "getprop" ]; then
  case "$5" in
    ro.product.cpu.abi) printf '${device.abi}\\n' ;;
    ro.build.version.sdk) printf '${device.apiLevel}\\n' ;;
    ro.product.model) printf '${device.model}\\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "install" ]; then
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pm" ] && [ "$5" = "path" ]; then
  printf 'package:/data/app/phase18/base.apk\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "pull" ] && [ "$4" = "/data/app/phase18/base.apk" ]; then
  cp '${installedApkPath}' "$5"
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "logcat" ] && [ "$4" = "-c" ]; then
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "am" ]; then
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "pidof" ]; then
  printf '4242\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "logcat" ] && [ "$4" = "-d" ]; then
  counter=$(cat "$state_file")
  case "$counter" in
    0) cat <<'LOG0'
${logs[0] ?? ""}
LOG0
      ;;
    1) cat <<'LOG1'
${logs[1] ?? ""}
LOG1
      ;;
    2) cat <<'LOG2'
${logs[2] ?? ""}
LOG2
      ;;
    *) cat <<'LOGX'
${logs[3] ?? ""}
LOGX
      ;;
  esac
  echo $((counter + 1)) > "$state_file"
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "run-as" ] && [ "$6" = "find" ]; then
  printf './no_backup/garmin-session/garmin-di-session.bin\\n'
  exit 0
fi
if [ "$1" = "-s" ] && [ "$3" = "shell" ] && [ "$4" = "run-as" ] && [ "$6" = "test" ]; then
  exit 0
fi
printf 'unexpected adb args: %s\\n' "$*" >&2
exit 1
`;
  const apksignerScript = `#!/bin/sh\nprintf 'Signer #1 certificate SHA-256 digest: ${retainedSignatureSha256}\\n'\n`;
  writeExecutable(path.join(sdkRoot, "platform-tools", "adb"), adbScript);
  writeExecutable(path.join(sdkRoot, "build-tools", "35.0.0", "apksigner"), apksignerScript);

  const previousAndroidHome = process.env.ANDROID_HOME;
  const previousAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
  process.env.ANDROID_HOME = sdkRoot;
  process.env.ANDROID_SDK_ROOT = sdkRoot;
  try {
    return callback({
      deviceIdentitySha256,
      currentPythonLockSha256,
      currentSourceTreeSha256,
      manifest,
      retainedManifest,
      retainedSignatureSha256,
      apkSha256,
      sdkRoot,
    });
  } finally {
    if (previousAndroidHome === undefined) delete process.env.ANDROID_HOME;
    else process.env.ANDROID_HOME = previousAndroidHome;
    if (previousAndroidSdkRoot === undefined) delete process.env.ANDROID_SDK_ROOT;
    else process.env.ANDROID_SDK_ROOT = previousAndroidSdkRoot;
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(aggregateRoot, { recursive: true, force: true });
    rmSync(sdkRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
}

test("proof helper coverage exercises the default runner success path without device execution", { concurrency: false }, () => {
  const logs = [
    [
      marker({ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }),
      marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
      marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
    ].join("\n"),
    [
      marker({ id: "PH18-RESTART", status: "passed", duration_ms: 1 }),
      marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
    ].join("\n"),
    [
      marker({ id: "PH18-RESTART", status: "passed", duration_ms: 1 }),
      marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
    ].join("\n"),
  ];

  withProofWorkspace({ logs }, () => {
    const result = executePhase18GarminProofRunner([
      "--manifest",
      MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ]);
    assert.equal(result.status, "passed");
    const report = JSON.parse(readFileSync(path.resolve(PHASE18_GARMIN_PROOF_RAW_REPORT), "utf8"));
    assert.deepEqual(report.cases.map(({ id }) => id), PHASE18_GARMIN_PROOF_CASE_IDS);
    assert.equal(report.privacy_scan.status, "passed");
    assert.equal(report.privacy_scan.scanned_artifact_count, 2);
  });
});

test("proof helper coverage forces the default wait timeout branch into a review report", { concurrency: false }, () => {
  let nowIndex = 0;
  const timeline = [0, 0, 10_000_000];
  withProofWorkspace({
    logs: [""],
  }, () => {
    const result = executePhase18GarminProofRunner([
      "--manifest",
      MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      now() {
        return timeline[Math.min(nowIndex++, timeline.length - 1)];
      },
      sleep() {},
    });
    assert.equal(result.status, "TECHNICAL_REVIEW_REQUIRED");
    const report = JSON.parse(readFileSync(path.resolve(PHASE18_GARMIN_PROOF_RAW_REPORT), "utf8"));
    assert.equal(report.failure_stage, "PH18-LOGIN");
    assert.equal(report.failure_code, "timeout");
    assert.equal(report.privacy_scan.status, "not_run");
  });
});

test("proof helper coverage seals and reloads final evidence with default verifier IO", { concurrency: false }, () => {
  withProofWorkspace({
    logs: [],
  }, ({ manifest, retainedManifest, currentPythonLockSha256, retainedSignatureSha256 }) => {
    const rawReport = {
      schema_version: 1,
      suite: "phase18-garmin-proof",
      status: "passed",
      manifest,
      cases: createPhase18GarminProofRunnerPlan().case_ids.map(proofPassedCase),
      standalone: createPhase18GarminProofRunnerPlan().standalone,
      privacy_scan: {
        status: "passed",
        scanned_artifact_count: 2,
        report_sha256: HASH,
      },
    };
    const rawReportBytes = Buffer.from(JSON.stringify(rawReport));
    writeFileSync(path.resolve(PHASE18_GARMIN_PROOF_RAW_REPORT), rawReportBytes);

    const sealed = executePhase18GarminProofVerifier([
      "--manifest",
      MANIFEST,
      "--seal",
      "--phase20-native-checkpoint",
    ]);
    assert.equal(sealed.status, "passed");

    const reloaded = executePhase18GarminProofVerifier([
      "--manifest",
      MANIFEST,
    ]);
    assert.equal(reloaded.status, "passed");

    const finalEvidence = JSON.parse(readFileSync(path.resolve(FINAL_EVIDENCE), "utf8"));
    assert.equal(finalEvidence.raw_report_sha256, sha256(rawReportBytes));

    const reviewEvidence = {
      schema_version: 1,
      suite: "phase18-garmin-proof",
      status: "TECHNICAL_REVIEW_REQUIRED",
      manifest,
      case_ids: PHASE18_GARMIN_PROOF_CASE_IDS,
      cases: [
        proofPassedCase("PH18-PKG"),
        {
          id: "PH18-LOGIN",
          status: "TECHNICAL_REVIEW_REQUIRED",
          duration_ms: 0,
          code: "sign_in_required",
        },
      ],
      standalone: createPhase18GarminProofRunnerPlan().standalone,
      privacy_scan: {
        status: "not_run",
        scanned_artifact_count: 0,
      },
      failure_stage: "PH18-LOGIN",
      failure_code: "sign_in_required",
      raw_report_sha256: HASH,
    };
    assert.deepEqual(validatePhase18GarminProofEvidence(reviewEvidence), {
      status: "TECHNICAL_REVIEW_REQUIRED",
      cases: 2,
      stage: "PH18-LOGIN",
      code: "sign_in_required",
    });

    const invalidRetainedManifest = {
      ...retainedManifest,
      apk: {
        ...retainedManifest.apk,
        page_alignment_verified: false,
      },
    };
    assert.throws(
      () => sanitizePhase18GarminProofBuildManifest(invalidRetainedManifest, {
        currentPythonLockSha256,
        retainedSignatureSha256,
      }),
      /phase18_build_manifest_invalid/u,
    );
  });
});

test("proof helper coverage rejects symlinked verifier inputs on the default file reader", { concurrency: false }, () => {
  withProofWorkspace({
    logs: [],
  }, () => {
    const manifestPath = path.resolve(MANIFEST);
    const manifestTarget = path.resolve(`${MANIFEST}.real`);
    rmSync(manifestTarget, { force: true });
    writeFileSync(manifestTarget, readFileSync(manifestPath));
    rmSync(manifestPath, { force: true });
    symlinkSync(path.basename(manifestTarget), manifestPath);
    assert.throws(
      () => executePhase18GarminProofVerifier([
        "--manifest",
        MANIFEST,
      ]),
      /phase18_evidence_manifest_missing/u,
    );
  });
});

test("proof helper coverage exercises remaining runner fail-closed branches", { concurrency: false }, () => {
  assert.throws(
    () => parsePhase18GarminProofRunnerArgs([
      "--manifest",
      MANIFEST,
      "--unexpected",
    ]),
    /phase18_runner_unknown_argument:--unexpected/u,
  );

  assert.throws(
    () => parsePhase18GarminProofMarker(marker(null)),
    /phase18_marker_invalid/u,
  );

  withProofWorkspace({
    logs: [],
  }, ({ retainedManifest, currentPythonLockSha256, retainedSignatureSha256 }) => {
    assert.throws(
      () => sanitizePhase18GarminProofBuildManifest({
        ...retainedManifest,
        device: {
          ...retainedManifest.device,
          serial: "personal-device",
        },
      }, {
        currentPythonLockSha256,
        retainedSignatureSha256,
      }),
      /phase18_build_manifest_privacy_invalid/u,
    );
  });

  withProofWorkspace({
    logs: [],
  }, ({ manifest }) => {
    assert.throws(
      () => createPhase18GarminTechnicalReviewReport({
        manifest,
        passedCases: [
          {
            id: "PH18-PKG",
            status: "passed",
            duration_ms: 0,
            result_sha256: manifest.apk_sha256,
          },
          {
            id: "PH18-PKG",
            status: "passed",
            duration_ms: 0,
            result_sha256: manifest.apk_sha256,
          },
        ],
        stage: "PH18-READ",
        code: "temporary_failure",
      }),
      /phase18_case_order_invalid/u,
    );
  });

  withProofWorkspace({ logs: [] }, () => {
    withEnv({ ANDROID_HOME: undefined, ANDROID_SDK_ROOT: undefined }, () => {
      assert.throws(
        () => executePhase18GarminProofRunner([
          "--manifest",
          MANIFEST,
          "--execute",
          "--phase20-native-checkpoint",
        ]),
        /phase18_android_sdk_missing:apksigner/u,
      );
    });
  });

  withProofWorkspace({
    logs: [],
  }, () => {
    rmSync(path.resolve(PHASE18_GARMIN_PROOF_APK), { force: true });
    assert.throws(
      () => executePhase18GarminProofRunner([
        "--manifest",
        MANIFEST,
        "--execute",
        "--phase20-native-checkpoint",
      ]),
      /phase18_apk_missing/u,
    );
  });

  for (const scenario of [
    {
      name: "installed path outside data app",
      native(program, args) {
        if (path.basename(program) === "git") return `${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })}`;
        if (path.basename(program) === "apksigner") return `Signer #1 certificate SHA-256 digest: ${"b".repeat(64)}\n`;
        if (args[0] === "devices") return "List of devices attached\nPHASE18PROOF\tdevice\n";
        if (args[2] === "shell" && args[3] === "getprop") {
          if (args[4] === "ro.product.cpu.abi") return "arm64-v8a\n";
          if (args[4] === "ro.build.version.sdk") return "36\n";
          if (args[4] === "ro.product.model") return "phase18-proof-device\n";
        }
        if (args[2] === "install") return "";
        if (args[2] === "shell" && args[3] === "pm" && args[4] === "path") {
          return "package:/sdcard/base.apk\n";
        }
        throw new Error(`unexpected_command:${[path.basename(program), ...args].join(" ")}`);
      },
      expectedCode: "packaging_failed",
    },
    {
      name: "installed apk bytes drift",
      installedApkBytes: Buffer.from("drift-apk"),
      native(program, args) {
        if (path.basename(program) === "git") return `${execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })}`;
        if (path.basename(program) === "apksigner") return `Signer #1 certificate SHA-256 digest: ${"b".repeat(64)}\n`;
        if (args[0] === "devices") return "List of devices attached\nPHASE18PROOF\tdevice\n";
        if (args[2] === "shell" && args[3] === "getprop") {
          if (args[4] === "ro.product.cpu.abi") return "arm64-v8a\n";
          if (args[4] === "ro.build.version.sdk") return "36\n";
          if (args[4] === "ro.product.model") return "phase18-proof-device\n";
        }
        if (args[2] === "install") return "";
        if (args[2] === "shell" && args[3] === "pm" && args[4] === "path") {
          return "package:/data/app/phase18/base.apk\n";
        }
        throw new Error(`unexpected_command:${[path.basename(program), ...args].join(" ")}`);
      },
      expectedCode: "packaging_failed",
    },
  ]) {
    withProofWorkspace({
      logs: [],
      installedApkBytes: scenario.installedApkBytes,
    }, () => {
      const writes = [];
      const result = executePhase18GarminProofRunner([
        "--manifest",
        MANIFEST,
        "--execute",
        "--phase20-native-checkpoint",
      ], {
        native: scenario.native,
        writeEvidence(report) {
          writes.push(report);
        },
      });
      assert.equal(result.status, "TECHNICAL_REVIEW_REQUIRED", scenario.name);
      assert.equal(writes[0].failure_stage, "PH18-PKG", scenario.name);
      assert.equal(writes[0].failure_code, scenario.expectedCode, scenario.name);
    });
  }

  withProofWorkspace({ logs: [] }, ({ sdkRoot }) => {
    rmSync(path.join(sdkRoot, "platform-tools", "adb"), { force: true });
    const writes = [];
    const result = executePhase18GarminProofRunner([
      "--manifest",
      MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      writeEvidence(report) {
        writes.push(report);
      },
    });
    assert.equal(result.status, "TECHNICAL_REVIEW_REQUIRED");
    assert.equal(writes[0].failure_code, "packaging_failed");
  });

  for (const removePath of [
    ["build-tools"],
    ["build-tools", "35.0.0", "apksigner"],
  ]) {
    withProofWorkspace({ logs: [] }, ({ sdkRoot }) => {
      rmSync(path.join(sdkRoot, ...removePath), { recursive: true, force: true });
      assert.throws(
        () => executePhase18GarminProofRunner([
          "--manifest",
          MANIFEST,
          "--execute",
          "--phase20-native-checkpoint",
        ]),
        /phase18_apksigner_missing/u,
      );
    });
  }

  for (const output of [
    "Signer output without a digest\n",
    `Signer #1 certificate SHA-256 digest: ${"a".repeat(65)}\n`,
  ]) {
    withProofWorkspace({ logs: [] }, () => {
      assert.throws(
        () => executePhase18GarminProofRunner([
          "--manifest",
          MANIFEST,
          "--execute",
          "--phase20-native-checkpoint",
        ], {
          native(program, args, options = {}) {
            if (path.basename(program) === "apksigner") {
              return options.encoding === "utf8" ? output : Buffer.from(output);
            }
            return execFileSync(program, args, options);
          },
        }),
        /phase18_signature_unreadable/u,
      );
    });
  }

  withProofWorkspace({
    logs: [
      [
        marker({ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }),
        marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
        marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
      ].join("\n"),
      [
        marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
        marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
      ].join("\n"),
      [
        marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
      ].join("\n"),
    ],
  }, () => {
    const writes = [];
    const result = executePhase18GarminProofRunner([
      "--manifest",
      MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      native(program, args, options = {}) {
        const value = execFileSync(program, args, options);
        if (options.encoding === "utf8" && path.basename(program) === "git") {
          return Buffer.from(String(value));
        }
        return value;
      },
      writeEvidence(report) {
        writes.push(report);
      },
    });
    assert.equal(result.status, "TECHNICAL_REVIEW_REQUIRED");
    assert.equal(writes[0].failure_code, "temporary_failure");
  });

  withProofWorkspace({
    logs: [[
      marker({ id: "PH18-LOGIN", status: "TECHNICAL_REVIEW_REQUIRED", duration_ms: 0, code: "sign_in_required" }),
      marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
    ].join("\n")],
  }, () => {
    const writes = [];
    const result = executePhase18GarminProofRunner([
      "--manifest",
      MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      writeEvidence(report) {
        writes.push(report);
      },
    });
    assert.equal(result.status, "TECHNICAL_REVIEW_REQUIRED");
    assert.equal(writes[0].failure_code, "temporary_failure");
  });

  withProofWorkspace({
    logs: [[
      marker({ id: "PH18-PKG", status: "passed", duration_ms: 1, result_sha256: HASH }),
      marker({ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }),
      marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
      marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
    ].join("\n")],
  }, () => {
    const writes = [];
    const result = executePhase18GarminProofRunner([
      "--manifest",
      MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      writeEvidence(report) {
        writes.push(report);
      },
    });
    assert.equal(result.status, "TECHNICAL_REVIEW_REQUIRED");
    assert.equal(writes[0].failure_stage, "PH18-LOGIN");
    assert.equal(writes[0].failure_code, "temporary_failure");
  });

  withProofWorkspace({
    logs: [
      [
        marker({ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }),
        marker({ id: "PH18-MFA", status: "passed", duration_ms: 1, outcome: "not_requested" }),
        marker({ id: "PH18-READ", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
      ].join("\n"),
      [
        marker({ id: "PH18-RESTART", status: "TECHNICAL_REVIEW_REQUIRED", duration_ms: 0, code: "temporary_failure" }),
        marker({ id: "PH18-REFRESH", status: "passed", duration_ms: 1, count: 1, result_sha256: HASH }),
      ].join("\n"),
    ],
  }, () => {
    const writes = [];
    const result = executePhase18GarminProofRunner([
      "--manifest",
      MANIFEST,
      "--execute",
      "--phase20-native-checkpoint",
    ], {
      writeEvidence(report) {
        writes.push(report);
      },
    });
    assert.equal(result.status, "TECHNICAL_REVIEW_REQUIRED");
    assert.equal(writes[0].failure_stage, "PH18-RESTART");
    assert.equal(writes[0].failure_code, "temporary_failure");
  });
});

test("proof helper coverage exercises remaining verifier identity branches", { concurrency: false }, () => {
  const rawReportBytes = Buffer.from("{}");

  assert.throws(
    () => parsePhase18GarminProofVerifierArgs([
      "--manifest",
      MANIFEST,
      "--unexpected",
    ]),
    /phase18_verifier_unknown_argument:--unexpected/u,
  );

  withProofWorkspace({
    logs: [],
  }, ({ sdkRoot }) => {
    rmSync(path.join(sdkRoot, "platform-tools", "adb"), { force: true });
    assert.throws(
      () => resolvePhase18GarminProofCurrentIdentity(rawReportBytes),
      /phase18_evidence_adb_missing/u,
    );
  });

  for (const apksignerScript of [
    "#!/bin/sh\nprintf 'no digest here\\n'\n",
    "#!/bin/sh\nprintf 'certificate SHA-256 digest: zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz:zz\\n'\n",
    `#!/bin/sh\nprintf 'certificate SHA-256 digest: ${"a".repeat(65)}\\n'\n`,
  ]) {
    withProofWorkspace({
      logs: [],
    }, ({ sdkRoot }) => {
      writeExecutable(
        path.join(sdkRoot, "build-tools", "35.0.0", "apksigner"),
        apksignerScript,
      );
      assert.throws(
        () => resolvePhase18GarminProofCurrentIdentity(rawReportBytes),
        /phase18_evidence_signature_unreadable/u,
      );
    });
  }

  withProofWorkspace({
    logs: [],
  }, ({ manifest }) => {
    const passedReport = {
      schema_version: 1,
      suite: "phase18-garmin-proof",
      status: "passed",
      manifest,
      cases: PHASE18_GARMIN_PROOF_CASE_IDS.map((id) => proofPassedCase(id)),
      standalone: createPhase18GarminProofRunnerPlan().standalone,
      privacy_scan: {
        status: "passed",
        scanned_artifact_count: 2,
        report_sha256: HASH,
      },
    };
    const passedBytes = Buffer.from(JSON.stringify(passedReport));
    const finalPassed = createPhase18GarminProofFinalEvidence({
      manifest,
      report: passedReport,
      rawReportBytes: passedBytes,
    });
    assert.equal(finalPassed.status, "passed");

    assert.throws(
      () => createPhase18GarminProofFinalEvidence({
        manifest,
        report: {
          ...passedReport,
          failure_stage: "PH18-LOGIN",
          failure_code: "sign_in_required",
        },
        rawReportBytes: passedBytes,
      }),
      /phase18_evidence_report_schema_invalid/u,
    );

    for (const evidence of [
      {
        ...finalPassed,
        cases: finalPassed.cases.map((entry, index) => (
          index === 2
            ? {
              ...entry,
              outcome: "invalid",
            }
            : entry
        )),
      },
      {
        ...finalPassed,
        cases: finalPassed.cases.map((entry, index) => (
          index === 3
            ? {
              ...entry,
              count: 2,
            }
            : entry
        )),
      },
    ]) {
      assert.throws(
        () => validatePhase18GarminProofEvidence(evidence),
        /phase18_evidence_case_invalid:(PH18-MFA|PH18-READ)/u,
      );
    }

    const reviewReport = {
      schema_version: 1,
      suite: "phase18-garmin-proof",
      status: "TECHNICAL_REVIEW_REQUIRED",
      manifest,
      cases: [
        {
          id: "PH18-PKG",
          status: "passed",
          duration_ms: 1,
          result_sha256: manifest.apk_sha256,
        },
        {
          id: "PH18-LOGIN",
          status: "TECHNICAL_REVIEW_REQUIRED",
          duration_ms: 0,
          code: "sign_in_required",
        },
      ],
      standalone: createPhase18GarminProofRunnerPlan().standalone,
      privacy_scan: {
        status: "not_run",
        scanned_artifact_count: 0,
      },
      failure_stage: "PH18-LOGIN",
      failure_code: "sign_in_required",
    };
    const reviewBytes = Buffer.from(JSON.stringify(reviewReport));
    const finalReview = createPhase18GarminProofFinalEvidence({
      manifest,
      report: reviewReport,
      rawReportBytes: reviewBytes,
    });
    assert.equal(finalReview.status, "TECHNICAL_REVIEW_REQUIRED");

    assert.throws(
      () => createPhase18GarminProofFinalEvidence({
        manifest,
        report: {
          ...reviewReport,
          failure_stage: undefined,
        },
        rawReportBytes: reviewBytes,
      }),
      /phase18_evidence_failure_classification_invalid/u,
    );

    for (const evidence of [
      {
        ...finalReview,
        cases: [
          {
            ...finalReview.cases[0],
            count: 2,
          },
          ...finalReview.cases.slice(1),
        ],
      },
      {
        ...finalReview,
        cases: [
          finalReview.cases[0],
          {
            ...finalReview.cases[1],
            code: "not_allowed",
          },
        ],
      },
      {
        ...finalReview,
        standalone: {
          ...finalReview.standalone,
          runtime_agent: true,
        },
      },
      {
        ...finalReview,
        privacy_scan: {
          status: "not_run",
          scanned_artifact_count: 1,
        },
      },
      {
        ...finalReview,
        privacy_scan: {
          status: "passed",
          scanned_artifact_count: 0,
          report_sha256: HASH,
        },
      },
      {
        ...finalReview,
        cases: [],
      },
      {
        ...finalReview,
        failure_code: "timeout",
      },
      {
        ...finalReview,
        cases: [
          finalReview.cases[0],
          {
            id: "PH18-MFA",
            status: "passed",
            duration_ms: 1,
            outcome: "invalid",
          },
        ],
      },
      {
        ...finalReview,
        cases: [
          finalReview.cases[0],
          {
            id: "PH18-READ",
            status: "passed",
            duration_ms: 1,
            count: 2,
            result_sha256: HASH,
          },
        ],
      },
    ]) {
      assert.throws(
        () => validatePhase18GarminProofEvidence(evidence),
        /phase18_evidence_(case_invalid|standalone_invalid|privacy_scan_invalid|case_count_invalid|failure_classification_invalid)/u,
      );
    }
  });
});
