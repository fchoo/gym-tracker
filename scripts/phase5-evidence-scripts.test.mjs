import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);

async function load(relativePath) {
  return import(pathToFileURL(path.join(projectRoot, relativePath)).href);
}

function replaceAfterMarker(source, marker, search, replacement) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing mutation marker: ${marker}`);
  const searchIndex = source.indexOf(search, markerIndex);
  assert.notEqual(searchIndex, -1, `missing mutation target after ${marker}: ${search}`);
  return `${source.slice(0, searchIndex)}${replacement}${source.slice(searchIndex + search.length)}`;
}

function assertDeploymentStatusProvenance(source, expectedBindings) {
  assert.match(source, /permissions:[\s\S]*deployments:\s*read/iu);
  assert.match(source, /set -euo pipefail/u);
  assert.doesNotMatch(
    source,
    /actions\/runs\/\$\{[A-Z_]+\}\/jobs|\.jobs\s*\|\s*any\(\.environment\.name/iu,
  );
  assert.match(source, /verify_deployment_provenance\(\)/u);
  assert.match(
    source,
    /gh api --method GET --paginate --slurp[\s\S]*repos\/\$\{GITHUB_REPOSITORY\}\/deployments/iu,
  );
  assert.match(
    source,
    /repos\/\$\{GITHUB_REPOSITORY\}\/deployments\/\$\{deployment_id\}\/statuses/iu,
  );
  assert.match(source, /\.sha == \$commit/iu);
  assert.match(source, /\.ref == \$ref/iu);
  assert.match(source, /\.environment == \$environment/iu);
  assert.match(source, /\.original_environment == \$environment/iu);
  assert.match(source, /\.performed_via_github_app\.slug == "github-actions"/iu);
  assert.match(source, /\.statuses_url ==/iu);
  assert.match(source, /\.state == "success"/iu);
  assert.match(source, /\.environment_url == \$run_url/iu);
  assert.match(source, /\.deployment_url == \$deployment_url/iu);
  assert.match(source, /\.log_url[\s\S]*startswith\(\$run_job_prefix\)/iu);
  assert.match(source, /sort_by\(\[\.created_at, \.id\]\) \| last/iu);
  assert.match(source, /actions\/jobs\/\$\{job_id\}/u);
  assert.match(source, /\.run_id == \$run_id/iu);
  assert.match(source, /\.run_attempt == \$run_attempt/iu);
  assert.match(source, /\.conclusion == "success"/iu);
  assert.match(source, /\.html_url == \$html_url/iu);
  assert.match(source, /test "\$\{matched\}" -eq 1/u);
  assert.match(source, /actions\/runs\/\$\{[A-Z_]+\}\/artifacts[\s\S]*-F per_page=100/iu);
  assert.match(source, /\.workflow_run\.id == \$run_id/iu);
  assert.match(source, /\.workflow_run\.head_sha == \$commit/iu);
  assert.match(source, /\.id == \$run_id and \.status == "completed" and \.conclusion == "success"/iu);
  assert.match(source, /\.html_url == \$run_url and \.head_sha == \$commit and \.head_branch == "main"/iu);
  for (const [runIdVariable, environment] of expectedBindings) {
    assert.match(source, new RegExp(
      `verify_deployment_provenance "\\$\\{${runIdVariable}\\}" "\\$\\{[a-z_]+_run_attempt\\}" "\\$\\{CANDIDATE_COMMIT\\}" "\\$\\{[a-z_]+_ref\\}" "${environment}"`,
      "u",
    ));
  }
}

function artifact(kind, file, innerPrefix, sha256 = SHA_B) {
  return {
    kind,
    file,
    sha256,
    size_bytes: 4096,
    inner_files: [
      { path: `${innerPrefix}index.android.bundle`, sha256: SHA_C, size_bytes: 1024 },
      { path: `${innerPrefix}app.config`, sha256: SHA_D, size_bytes: 256 },
    ],
  };
}

function manifestFixture(overrides = {}) {
  return {
    schema_version: 1,
    candidate_id: "candidate-001",
    source: {
      commit: "0123456789abcdef0123456789abcdef01234567",
      tree_sha256: SHA_A,
      config_sha256: SHA_B,
      package: "com.fchoo.gymtracker",
      version_code: 1,
      version_name: "0.1.0",
    },
    build: {
      profile: "production",
      toolchain: {
        node: "24.19.0",
        npm: "11.17.0",
        java: "17.0.20+8",
        android_api: 36,
        build_tools: "36.0.0",
        ndk: "27.1.12297006",
      },
    },
    artifacts: [
      artifact("apk", "gym-tracker-release.apk", "assets/"),
      artifact("aab", "gym-tracker-release.aab", "base/assets/", SHA_C),
    ],
    retained_bundle: {
      artifact_name: "private-release-candidate-candidate-001",
      retention_days: 30,
    },
    workflow: { repository: "owner/gym-tracker", run_id: "12345" },
    ...overrides,
  };
}

function candidateIdentity(manifest = manifestFixture()) {
  return {
    candidate_id: manifest.candidate_id,
    manifest_sha256: SHA_D,
    source: manifest.source,
    profile: manifest.build.profile,
    package: manifest.source.package,
    artifacts: manifest.artifacts,
    workflow: manifest.workflow,
  };
}

function deviceIdentity() {
  return {
    role: "automated-emulator",
    model: "Pixel_7",
    api: 36,
    abi: "x86_64",
    serial_sha256: SHA_A,
    installed_package: "com.fchoo.gymtracker",
    installed_version_code: 1,
    installed_apk_sha256: SHA_B,
  };
}

function automatedMetadata(producer, manifest = manifestFixture()) {
  return {
    schema_version: 1,
    suite: "phase5",
    status: "passed",
    mode: "automated-only",
    approval_status: "evidence_pending",
    attended_scope: "excluded",
    producer,
    candidate: candidateIdentity(manifest),
    device: deviceIdentity(),
  };
}

function phase6AttendedEvidenceFixture(manifest = manifestFixture()) {
  return {
    record_sha256: SHA_C,
    evidence_run_id: "987654321",
    artifact_name: "phase6-n4-evidence-candidate-001-987654321",
    candidate_id: manifest.candidate_id,
    source_commit: manifest.source.commit,
    manifest_sha256: SHA_D,
    apk_sha256: manifest.artifacts.find(({ kind }) => kind === "apk").sha256,
    status: "passed",
  };
}

async function materializePhase6N4Evidence(
  directory, manifest = manifestFixture(), { failed = false } = {},
) {
  const {
    buildPhase6AttendedChecklist,
    createPhase6AttendedRecord,
    serializePhase6AttendedChecklist,
  } = await load("scripts/generate-phase6-attended-checklist.mjs");
  const candidate = { manifest, manifest_sha256: SHA_D };
  const device = {
    role: "samsung-physical",
    model: "SM-S916B",
    serial_sha256: SHA_A,
    installed_package: manifest.source.package,
    installed_apk_sha256: manifest.artifacts.find(({ kind }) => kind === "apk").sha256,
  };
  mkdirSync(directory, { recursive: true });
  const attachmentDigests = Object.fromEntries(
    ["N4-01", "N4-02", "N4-03", "N4-04"].map((id) => {
      const bytes = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from(id)]);
      writeFileSync(path.join(directory, `${id}.png`), bytes);
      return [id, createHash("sha256").update(bytes).digest("hex")];
    }),
  );
  const checklist = buildPhase6AttendedChecklist({
    candidate, device, generatedAt: "2026-09-03T00:00:00.000Z",
  });
  const checklistBytes = serializePhase6AttendedChecklist(checklist);
  const observations = {
    schema_version: 1,
    suite: "phase6-attended-observations",
    candidate_id: manifest.candidate_id,
    manifest_sha256: SHA_D,
    device,
    rows: Object.entries(attachmentDigests).map(([id, attachment_sha256], index) => ({
      id, status: failed && index === 0 ? "failed" : "passed", attachment_sha256,
    })),
  };
  const observationsBytes = serializePhase6AttendedChecklist(observations);
  const record = createPhase6AttendedRecord({
    candidate, checklist, checklistBytes, observations, observationsBytes,
    evidenceDirectory: directory, recordedAt: "2026-09-03T00:30:00.000Z",
  });
  const recordBytes = serializePhase6AttendedChecklist(record);
  const paths = {
    checklistPath: path.join(directory, "checklist.json"),
    observationsPath: path.join(directory, "observations.json"),
    recordPath: path.join(directory, "attended-record.json"),
  };
  writeFileSync(paths.checklistPath, checklistBytes);
  writeFileSync(paths.observationsPath, observationsBytes);
  writeFileSync(paths.recordPath, recordBytes);
  return {
    ...paths,
    evidenceDirectory: directory,
    evidenceRunId: "987654321",
    artifactName: "phase6-n4-evidence-candidate-001-987654321",
    record,
    recordBytes,
  };
}

test("Phase 5 accepts only the canonical production candidate identity", async () => {
  const { validatePhase5CandidateIdentity } = await load(
    "scripts/verify-phase5-native-evidence.mjs",
  );
  const manifest = manifestFixture();
  assert.doesNotThrow(() => validatePhase5CandidateIdentity({
    manifest,
    manifestSha256: SHA_D,
  }));
  for (const changed of [
    { ...manifest, build: { ...manifest.build, profile: "development-test" } },
    { ...manifest, source: { ...manifest.source, package: "com.fchoo.gymtracker.devtest" } },
    { ...manifest, source: { ...manifest.source, config_sha256: SHA_C } },
    { ...manifest, artifacts: manifest.artifacts.map((value, index) => index === 0
      ? { ...value, sha256: SHA_A }
      : value) },
    { ...manifest, artifacts: manifest.artifacts.map((value, index) => index === 1
      ? { ...value, sha256: SHA_A }
      : value) },
    { ...manifest, artifacts: manifest.artifacts.map((value, index) => index === 0
      ? { ...value, inner_files: value.inner_files.map((inner, innerIndex) => innerIndex === 0
        ? { ...inner, sha256: SHA_A }
        : inner) }
      : value) },
  ]) {
    assert.throws(() => validatePhase5CandidateIdentity({
      manifest: changed,
      manifestSha256: SHA_D,
      expectedManifest: manifest,
    }), /candidate|production|identity|devtest|manifest/iu);
  }
  assert.throws(() => validatePhase5CandidateIdentity({
    manifest,
    manifestSha256: SHA_C,
    expectedManifestSha256: SHA_D,
  }), /manifest|digest/iu);
});

test("Phase 5 clean restore accepts an absent production package exactly", async () => {
  const { cleanProductionState } = await load(
    "scripts/run-phase5-maestro.mjs",
  );
  const commands = [];
  const executeWithDevtestSibling = (_file, args) => {
    commands.push(args.join(" "));
    if (args[2] === "uninstall") {
      throw new Error("package was already absent");
    }
    if (args.slice(2).join(" ") === "shell pm list packages --user 0 com.fchoo.gymtracker") {
      return "package:com.fchoo.gymtracker.devtest\n";
    }
    return "";
  };

  assert.deepEqual(
    cleanProductionState(
      "emulator-5554",
      "com.fchoo.gymtracker",
      executeWithDevtestSibling,
    ),
    {
      auto_backup_disabled: true,
      d2d_disabled: true,
      package_absent_before_install: true,
      pre_restore_state: "empty",
    },
  );
  assert.ok(commands.includes(
    "-s emulator-5554 shell pm list packages --user 0 com.fchoo.gymtracker",
  ));
  assert.throws(() => cleanProductionState(
    "emulator-5554",
    "com.fchoo.gymtracker",
    (_file, args) => args.slice(2).join(" ") === "shell pm list packages --user 0 com.fchoo.gymtracker"
      ? "package:com.fchoo.gymtracker.devtest\npackage:com.fchoo.gymtracker\n"
      : "",
  ), /production package remains/iu);
  assert.throws(() => cleanProductionState(
    "emulator-5554",
    "com.fchoo.gymtracker",
    (_file, args) => {
      if (args.slice(2).join(" ").startsWith("shell pm list packages")) {
        throw new Error("adb unavailable");
      }
      return "";
    },
  ), /adb unavailable/iu);
  assert.throws(() => cleanProductionState(
    "emulator-5554",
    "com.fchoo.gymtracker",
    (_file, args) => args.slice(2).join(" ").startsWith("shell pm list packages")
      ? "Error: package manager unavailable\n"
      : "",
  ), /malformed output/iu);
});

test("Phase 5 installed-byte pull retries only transient ADB transport failures", async () => {
  const { pullInstalledApkWithRetry } = await load(
    "scripts/run-phase5-maestro.mjs",
  );
  const calls = [];
  let pullAttempts = 0;
  const transient = new Error("Command failed: adb pull");
  transient.stderr = "adb: device offline\n";
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-pull-test-"));
  const localPath = path.join(temporaryDirectory, "installed.apk");
  try {
    pullInstalledApkWithRetry({
      execute: (_file, args) => {
        calls.push(args);
        if (args.includes("pull") && pullAttempts++ === 0) {
          writeFileSync(localPath, "partial");
          throw transient;
        }
        if (args.includes("pull")) writeFileSync(localPath, "complete");
        return "";
      },
      localPath,
      remotePath: "/data/app/base.apk",
      serial: "emulator-5554",
    });

    assert.deepEqual(calls, [
      ["-s", "emulator-5554", "pull", "/data/app/base.apk", localPath],
      ["-s", "emulator-5554", "wait-for-device"],
      ["-s", "emulator-5554", "pull", "/data/app/base.apk", localPath],
    ]);
    assert.equal(readFileSync(localPath, "utf8"), "complete");

    for (const retryable of [
      Object.assign(new Error("Command failed: adb pull"), {
        stderr: "adb: device 'emulator-5554' not found\n",
      }),
      Object.assign(new Error("spawnSync adb ETIMEDOUT"), {
        code: "ETIMEDOUT",
        stderr: "",
      }),
    ]) {
      const retryCalls = [];
      let attempts = 0;
      pullInstalledApkWithRetry({
        execute: (_file, args) => {
          retryCalls.push(args);
          if (args.includes("pull") && attempts++ === 0) throw retryable;
          if (args.includes("pull")) writeFileSync(localPath, "complete");
          return "";
        },
        localPath,
        remotePath: "/data/app/base.apk",
        serial: "emulator-5554",
      });
      assert.equal(retryCalls.filter((args) => args.includes("pull")).length, 2);
      assert.equal(retryCalls.filter((args) => args.includes("wait-for-device")).length, 1);
    }

    const permanentCalls = [];
    const permanent = new Error("Command failed: adb pull");
    permanent.stderr = "adb: error: failed to copy: Permission denied\n";
    assert.throws(() => pullInstalledApkWithRetry({
      execute: (_file, args) => {
        permanentCalls.push(args);
        throw permanent;
      },
      localPath,
      remotePath: "/data/app/base.apk",
      serial: "emulator-5554",
    }), /Command failed: adb pull/u);
    assert.equal(permanentCalls.length, 1);

    const exhaustedCalls = [];
    assert.throws(() => pullInstalledApkWithRetry({
      execute: (_file, args) => {
        exhaustedCalls.push(args);
        if (args.includes("pull")) {
          writeFileSync(localPath, "partial");
          throw transient;
        }
        return "";
      },
      localPath,
      remotePath: "/data/app/base.apk",
      serial: "emulator-5554",
    }), /Command failed: adb pull/u);
    assert.equal(exhaustedCalls.filter((args) => args.includes("pull")).length, 3);
    assert.equal(exhaustedCalls.filter((args) => args.includes("wait-for-device")).length, 2);
    assert.equal(existsSync(localPath), false);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
});

test("Phase 5 source and installed-flow ledgers are exact, ordered, and automated-only", async () => {
  const {
    PHASE5_AUTOMATED_CASE_IDS,
    validatePhase5SourceEvidence,
  } = await load("scripts/verify-phase5-native-evidence.mjs");
  const {
    PHASE5_MAESTRO_FLOW_CONTRACTS,
    validatePhase5MaestroEvidence,
  } = await load("scripts/run-phase5-maestro.mjs");
  const manifest = manifestFixture();
  assert.deepEqual(PHASE5_AUTOMATED_CASE_IDS, [
    "source-static-gates",
    "generated-cng-and-backup-rules",
    "native-sqlite-production-ui-persistence",
    "installed-core-workout-and-lifecycle",
    "installed-history-progress-and-data-recovery",
    "candidate-artifact-validation",
    "automated-adaptive-and-accessibility-contracts",
    "bounded-production-performance",
  ]);
  assert.deepEqual(
    PHASE5_MAESTRO_FLOW_CONTRACTS.map(({ id, flow }) => ({ id, flow })),
    [
      { id: "phase5-core-workout-lifecycle", flow: "maestro/phase5/core-workout-lifecycle.yaml" },
      { id: "phase5-history-progress", flow: "maestro/phase5/history-progress.yaml" },
      { id: "phase5-data-recovery", flow: "maestro/phase5/data-recovery.yaml" },
      { id: "phase5-adaptive-accessibility", flow: "maestro/phase5/adaptive-accessibility.yaml" },
    ],
  );
  for (const { flow } of PHASE5_MAESTRO_FLOW_CONTRACTS) {
    const yaml = readFileSync(path.join(projectRoot, flow), "utf8");
    assert.match(yaml, /^appId: com\.fchoo\.gymtracker$/mu);
    assert.doesNotMatch(yaml, /devtest|__native|__notification|__phase/iu);
    assert.match(yaml, /assertVisible|tapOn/gu);
  }
  const source = {
    ...automatedMetadata("phase5-source-gates/v1", manifest),
    commands: PHASE5_AUTOMATED_CASE_IDS.slice(0, 2).map((id) => ({
      id, status: "passed", raw_report_file: `${id}.txt`, raw_report_sha256: SHA_A,
    })),
  };
  const rawReports = Object.fromEntries(source.commands.map(({ id }) => [id, Buffer.from("raw")]));
  for (const command of source.commands) {
    command.raw_report_sha256 = createHash("sha256").update(rawReports[command.id]).digest("hex");
  }
  assert.doesNotThrow(() => validatePhase5SourceEvidence(source, manifest, SHA_D, rawReports));
  assert.throws(() => validatePhase5SourceEvidence({
    ...source, producer: "phase5-source-gates/fake",
  }, manifest, SHA_D, rawReports), /producer/iu);
  const maestro = {
    ...automatedMetadata("phase5-maestro/v1", manifest),
    flows: PHASE5_MAESTRO_FLOW_CONTRACTS.map(({ id, flow, coverage }) => ({
      id, flow, coverage, tests: 1, failures: 0, errors: 0, skipped: 0,
      raw_report_file: `${id}.xml`, raw_report_sha256: SHA_A,
    })),
    restore_precondition: {
      auto_backup_disabled: true,
      d2d_disabled: true,
      package_absent_before_install: true,
      pre_restore_state: "empty",
    },
  };
  const maestroRawReports = Object.fromEntries(maestro.flows.map(({ id }) => [id, Buffer.from("raw")]));
  for (const flow of maestro.flows) {
    flow.raw_report_sha256 = createHash("sha256").update(maestroRawReports[flow.id]).digest("hex");
  }
  assert.doesNotThrow(() => validatePhase5MaestroEvidence(maestro, manifest, SHA_D, maestroRawReports));
  assert.throws(() => validatePhase5MaestroEvidence({
    ...maestro,
    flows: maestro.flows.slice().reverse(),
  }, manifest, SHA_D, maestroRawReports), /order|flow|ledger/iu);
  assert.throws(() => validatePhase5MaestroEvidence({
    ...maestro,
    approval_status: "approved",
  }, manifest, SHA_D, maestroRawReports), /automated|approval|pending/iu);
});

test("Phase 5 history flow uses the live Calendar and Progress root destinations", () => {
  const rootTabs = readFileSync(
    path.join(projectRoot, "src/ui/components/index.ts"),
    "utf8",
  );
  const flow = readFileSync(
    path.join(projectRoot, "maestro/phase5/history-progress.yaml"),
    "utf8",
  );

  assert.match(rootTabs, /name: "calendar", label: "Calendar"/u);
  assert.match(rootTabs, /name: "progress",[\s\S]*?label: "Progress"/u);
  assert.match(
    flow,
    /- assertVisible: "Today"\n- tapOn: "Calendar"\n- assertVisible: "Calendar month grid"\n- tapOn: "Progress"\n- assertVisible: "4 weeks"/u,
  );
  assert.doesNotMatch(flow, /(?:tapOn|assertVisible): "History"/u);
});

test("Phase 5 recovery flows target the unique Data and recovery action", () => {
  const todayRoute = readFileSync(
    path.join(projectRoot, "app/(tabs)/index.tsx"),
    "utf8",
  );
  const todayScreen = readFileSync(
    path.join(projectRoot, "src/ui/screens/TodayScreen.tsx"),
    "utf8",
  );
  const moreRoute = readFileSync(
    path.join(projectRoot, "app/more/index.tsx"),
    "utf8",
  );
  const expectedTap = [
    "- tapOn:",
    '    id: "more-data-and-recovery"',
  ].join("\n");

  assert.match(
    moreRoute,
    /label="Data and recovery"[\s\S]{0,160}testID="more-data-and-recovery"/u,
  );
  assert.match(todayRoute, /onOpenHistoryAndData=\{\(\) => router\.push\("\/more" as Href\)\}/u);
  assert.match(todayScreen, /label="History and data"[\s\S]{0,120}onPress=\{onOpenHistoryAndData\}/u);
  for (const relativePath of [
    "maestro/phase5/data-recovery.yaml",
    "maestro/phase5/adaptive-accessibility.yaml",
  ]) {
    const flow = readFileSync(path.join(projectRoot, relativePath), "utf8");
    assert.match(
      flow,
      /- assertVisible: "Today"\n- extendedWaitUntil:\n    visible: "Use Full Body Foundation"\n    timeout: 90000\n- assertVisible: "History and data"\n- tapOn: "History and data"\n- assertVisible: "Data and recovery"\n- tapOn:\n    id: "more-data-and-recovery"/u,
      relativePath,
    );
    assert.ok(flow.includes(expectedTap), relativePath);
    assert.doesNotMatch(flow, /- tapOn: "Data and recovery"/u, relativePath);
    assert.doesNotMatch(flow, /- tapOn: "More"/u, relativePath);
  }

  const dataRecoveryFlow = readFileSync(
    path.join(projectRoot, "maestro/phase5/data-recovery.yaml"),
    "utf8",
  );
  assert.match(
    dataRecoveryFlow,
    /- inputText: "automation-only-password"\n- hideKeyboard\n- tapOn: "Choose a Gym Tracker backup"/u,
  );

  const adaptiveFlow = readFileSync(
    path.join(projectRoot, "maestro/phase5/adaptive-accessibility.yaml"),
    "utf8",
  );
  assert.match(
    adaptiveFlow,
    /- assertVisible: "Restore backup"\n- scrollUntilVisible:\n    element:\n      text: "Export CSV"\n    direction: DOWN\n    centerElement: true\n- assertVisible: "Export CSV"\n- assertVisible: "CSV is a readable spreadsheet file\. Share it only with people you trust\."/u,
  );
});

test("Phase 5 bounded performance evidence binds raw samples and exact installed bytes", async () => {
  const {
    PHASE5_BENCHMARK_MEASUREMENTS,
    PHASE5_BENCHMARK_THRESHOLDS,
    validatePhase5BenchmarkEvidence,
  } = await load("scripts/benchmark-phase5.mjs");
  const manifest = manifestFixture();
  assert.deepEqual(PHASE5_BENCHMARK_MEASUREMENTS, [
    "production-cold-launch",
    "production-resume-launch",
    "production-data-recovery-navigation",
  ]);
  const evidence = {
    ...automatedMetadata("phase5-benchmark/v1", manifest),
    thresholds: PHASE5_BENCHMARK_THRESHOLDS,
    measurements: PHASE5_BENCHMARK_MEASUREMENTS.map((id) => ({
      id, samples_requested: 20, samples_completed: 20,
      durations_ms: Array.from({ length: 20 }, () => 100),
      p95_ms: 100, raw_report_file: `${id}.txt`, raw_report_sha256: SHA_A,
    })),
  };
  const benchmarkRawReports = Object.fromEntries(evidence.measurements.map(({ id }) => [id, Buffer.from("raw")]));
  for (const measurement of evidence.measurements) {
    measurement.raw_report_sha256 = createHash("sha256").update(benchmarkRawReports[measurement.id]).digest("hex");
  }
  assert.doesNotThrow(() => validatePhase5BenchmarkEvidence(evidence, manifest, SHA_D, benchmarkRawReports));
  assert.throws(() => validatePhase5BenchmarkEvidence({
    ...evidence,
    device: { ...evidence.device, installed_apk_sha256: SHA_C },
  }, manifest, SHA_D, benchmarkRawReports), /installed|candidate|identity/iu);
  assert.throws(() => validatePhase5BenchmarkEvidence({
    ...evidence,
    measurements: evidence.measurements.map((item, index) => index === 0
      ? { ...item, raw_report_sha256: "plausible-but-not-a-digest" }
      : item),
  }, manifest, SHA_D, benchmarkRawReports), /raw|digest|report/iu);
});

test("Phase 5 aggregate recomputes report hashes and rejects identity substitution", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-evidence-"));
  try {
    const { validatePhase5AutomatedEvidence } = await load(
      "scripts/verify-phase5-native-evidence.mjs",
    );
    const manifest = manifestFixture();
    const reports = [
      ["source", "phase5-source-gates/v1"],
      ["maestro", "phase5-maestro/v1"],
      ["benchmark", "phase5-benchmark/v1"],
    ].map(([name, producer]) => {
      const value = { ...automatedMetadata(producer, manifest), payload: name };
      const file = path.join(temporaryDirectory, `${name}.json`);
      writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
      return { name, file, value };
    });
    reports[0].value.commands = [
      "source-static-gates", "generated-cng-and-backup-rules",
    ].map((id) => ({ id }));
    reports[1].value.flows = [
      "native-sqlite-production-ui-persistence",
      "installed-core-workout-and-lifecycle",
      "installed-history-progress-and-data-recovery",
      "automated-adaptive-and-accessibility-contracts",
    ].map((id) => ({ coverage: [id] }));
    for (const report of reports.slice(0, 2)) {
      writeFileSync(report.file, `${JSON.stringify(report.value, null, 2)}\n`);
    }
    const result = validatePhase5AutomatedEvidence({
      manifest,
      manifestSha256: SHA_D,
      reports: reports.map(({ name, file, value }) => ({ name, file, value })),
    });
    assert.equal(result.mode, "automated-only");
    assert.equal(result.approval_status, "evidence_pending");
    assert.deepEqual(result.report_hashes.map(({ name }) => name), [
      "source", "maestro", "benchmark",
    ]);
    writeFileSync(reports[0].file, "{}\n");
    assert.throws(() => validatePhase5AutomatedEvidence({
      manifest, manifestSha256: SHA_D,
      reports: reports.map(({ name, file, value }) => ({ name, file, value })),
    }), /raw|hash|report/iu);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("release workflows enforce one build, immediate manifest, exact command graph, and no post-manifest build", async () => {
  const { validatePhase5WorkflowContracts } = await load(
    "scripts/phase5-workflow-contract.mjs",
  );
  const candidate = readFileSync(
    path.join(projectRoot, ".github/workflows/release-candidate.yml"),
    "utf8",
  );
  const nightly = readFileSync(
    path.join(projectRoot, ".github/workflows/nightly.yml"),
    "utf8",
  );
  assert.match(candidate, /environment:[\s\S]*name:\s*private-release-candidate[\s\S]*url:\s*\$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/u);
  const buildScript = readFileSync(
    path.join(projectRoot, "scripts/build-release-candidate-once.sh"),
    "utf8",
  );
  assert.match(buildScript, /assert-generated-production-android\.mjs/gu);
  assert.equal(
    (statSync(path.join(projectRoot, "scripts/build-release-candidate-once.sh")).mode & 0o111) !== 0,
    true,
  );
  assert.match(candidate, /Run source and generated-native gates[\s\S]*set -o pipefail/iu);
  assert.match(candidate, /Build signed APK and AAB once[\s\S]*set -o pipefail/iu);
  const pullRequest = readFileSync(
    path.join(projectRoot, ".github/workflows/pr.yml"),
    "utf8",
  );
  assert.equal(
    (pullRequest.match(/run: sh scripts\/install-pinned-android-sdk\.sh/gu) ?? []).length,
    2,
  );
  assert.match(candidate, /run: sh scripts\/install-pinned-android-sdk\.sh/u);
  assert.equal(
    (pullRequest.match(/name: Enable KVM for Android emulator/gu) ?? []).length,
    2,
  );
  assert.equal(
    (candidate.match(/name: Enable KVM for Android emulator/gu) ?? []).length,
    1,
  );
  for (const workflowSource of [pullRequest, candidate]) {
    assert.match(workflowSource, /if \[ -e \/dev\/kvm \]; then[\s\S]*MODE="0666"[\s\S]*udevadm trigger --name-match=kvm[\s\S]*KVM unavailable; using the emulator runner's software fallback\./u);
    assert.match(workflowSource, /disable-linux-hw-accel: auto/u);
  }
  assert.match(pullRequest, /native-and-smoke:[\s\S]*timeout-minutes: 120/u);
  assert.match(pullRequest, /artifact-roundtrip:[\s\S]*timeout-minutes: 45/u);
  assert.match(candidate, /timeout-minutes: 120/u);
  assert.doesNotMatch(pullRequest, /^\s*(?:yes\s*\|\s*)?sdkmanager\s/mu);
  assert.doesNotThrow(() => validatePhase5WorkflowContracts({ candidate, nightly }));
  assert.throws(() => validatePhase5WorkflowContracts({
    candidate: candidate.replace(
      "node scripts/create-release-candidate-manifest.mjs",
      "./gradlew assembleRelease\n          node scripts/create-release-candidate-manifest.mjs",
    ),
    nightly,
  }), /build|manifest|order/iu);
  assert.throws(() => validatePhase5WorkflowContracts({
    candidate: candidate.replace(
      "npm run verify:native:phase5",
      "npx expo prebuild && npm run verify:native:phase5",
    ),
    nightly,
  }), /after|build|manifest/iu);
});

test("native build scripts bound Gradle memory without narrowing the production candidate ABI set", () => {
  const nativeTestBuildScript = readFileSync(
    path.join(projectRoot, "scripts/build-current-native-test-apk.sh"),
    "utf8",
  );
  const releaseCandidateBuildScript = readFileSync(
    path.join(projectRoot, "scripts/build-release-candidate-once.sh"),
    "utf8",
  );
  const pullRequest = readFileSync(
    path.join(projectRoot, ".github/workflows/pr.yml"),
    "utf8",
  );
  const candidateWorkflow = readFileSync(
    path.join(projectRoot, ".github/workflows/release-candidate.yml"),
    "utf8",
  );

  assert.match(
    nativeTestBuildScript,
    /'-Dorg\.gradle\.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=768m -Dfile\.encoding=UTF-8'/u,
  );
  assert.doesNotMatch(
    nativeTestBuildScript,
    /-PreactNativeArchitectures=/u,
  );
  assert.match(
    pullRequest,
    /Build once, run complete Phase 2 automated producers[\s\S]*?env:\s*\n\s*ORG_GRADLE_PROJECT_reactNativeArchitectures: x86_64[\s\S]*?npm run android:devtest:fresh -- --suite phase2/u,
  );

  assert.match(
    releaseCandidateBuildScript,
    /'-Dorg\.gradle\.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile\.encoding=UTF-8'/u,
  );
  assert.doesNotMatch(
    releaseCandidateBuildScript,
    /-PreactNativeArchitectures=/u,
  );
  assert.doesNotMatch(
    candidateWorkflow,
    /ORG_GRADLE_PROJECT_reactNativeArchitectures/u,
  );
});

test("pinned Android SDK installer resolves the hosted SDK root and verifies every build component", () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-android-sdk-"));
  try {
    const androidRoot = path.join(temporaryDirectory, "android-sdk");
    const sdkmanager = path.join(androidRoot, "cmdline-tools/latest/bin/sdkmanager");
    const invocationLog = path.join(temporaryDirectory, "sdkmanager.log");
    mkdirSync(path.dirname(sdkmanager), { recursive: true });
    writeFileSync(sdkmanager, `#!/bin/sh
printf '%s\n' "$*" >> "$SDKMANAGER_LOG"
case " $* " in *" --licenses "*) exit 0 ;; esac
mkdir -p \
  "$ANDROID_SDK_ROOT/platform-tools" \
  "$ANDROID_SDK_ROOT/platforms/android-$ANDROID_API_LEVEL" \
  "$ANDROID_SDK_ROOT/build-tools/$ANDROID_BUILD_TOOLS" \
  "$ANDROID_SDK_ROOT/ndk/$ANDROID_NDK" \
  "$ANDROID_SDK_ROOT/cmake/3.22.1/bin"
touch \
  "$ANDROID_SDK_ROOT/platform-tools/adb" \
  "$ANDROID_SDK_ROOT/platforms/android-$ANDROID_API_LEVEL/android.jar" \
  "$ANDROID_SDK_ROOT/build-tools/$ANDROID_BUILD_TOOLS/zipalign" \
  "$ANDROID_SDK_ROOT/ndk/$ANDROID_NDK/source.properties" \
  "$ANDROID_SDK_ROOT/cmake/3.22.1/bin/cmake"
`);
    chmodSync(sdkmanager, 0o755);
    const result = spawnSync("sh", ["scripts/install-pinned-android-sdk.sh"], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ANDROID_API_LEVEL: "36",
        ANDROID_BUILD_TOOLS: "36.0.0",
        ANDROID_HOME: androidRoot,
        ANDROID_NDK: "27.1.12297006",
        ANDROID_SDK_ROOT: androidRoot,
        SDKMANAGER_LOG: invocationLog,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(invocationLog, "utf8").trim().split("\n"), [
      `--sdk_root=${androidRoot} --licenses`,
      `--sdk_root=${androidRoot} platform-tools platforms;android-36 build-tools;36.0.0 ndk;27.1.12297006 cmake;3.22.1`,
    ]);
    rmSync(path.join(androidRoot, "ndk/27.1.12297006/source.properties"));
    writeFileSync(sdkmanager, "#!/bin/sh\nexit 0\n");
    const incompleteResult = spawnSync("sh", ["scripts/install-pinned-android-sdk.sh"], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ANDROID_API_LEVEL: "36",
        ANDROID_BUILD_TOOLS: "36.0.0",
        ANDROID_HOME: androidRoot,
        ANDROID_NDK: "27.1.12297006",
        ANDROID_SDK_ROOT: androidRoot,
      },
    });
    assert.notEqual(incompleteResult.status, 0);
    assert.match(
      incompleteResult.stderr,
      /Android SDK component is missing after install: ndk\/27\.1\.12297006\/source\.properties/u,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("attended ledger is the exact ordered union of Phase 2 gaps, Phase 3/4 requirements, and Phase 5 rows", async () => {
  const {
    PHASE5_ATTENDED_ROW_SPECS,
    derivePhase5AttendedRows,
    validatePhase5AttendedRowDefinitions,
  } = await load("scripts/generate-phase5-attended-checklist.mjs");
  const rows = derivePhase5AttendedRows(projectRoot);
  assert.deepEqual(rows.slice(0, 9).map(({ row_id }) => row_id),
    Array.from({ length: 9 }, (_, index) => `phase2:G-02-${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(rows.slice(9, 18).map(({ row_id }) => row_id),
    Array.from({ length: 9 }, (_, index) => `phase3:HIST-${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(rows.slice(18, 29).map(({ row_id }) => row_id),
    Array.from({ length: 11 }, (_, index) => `phase4:PROG-${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(rows.slice(29).map(({ row_id }) => row_id),
    PHASE5_ATTENDED_ROW_SPECS.map(({ id }) => `phase5:${id}`));
  assert.equal(
    rows.find(({ row_id: rowId }) => rowId === "phase2:G-02-09")?.evidence_class,
    "attended-emulator-and-physical-phone",
  );
  assert.doesNotThrow(() => validatePhase5AttendedRowDefinitions(rows, projectRoot));
  assert.throws(() => validatePhase5AttendedRowDefinitions(rows.slice(1), projectRoot),
    /missing|union|order/iu);
  assert.throws(() => validatePhase5AttendedRowDefinitions([...rows, rows[0]], projectRoot),
    /duplicate|extra|union/iu);
  assert.throws(() => validatePhase5AttendedRowDefinitions([rows[1], rows[0], ...rows.slice(2)], projectRoot),
    /order|union/iu);
});

test("checklist generator emits pending rows with blank evidence and no approval capability", async () => {
  const {
    buildPhase5PendingChecklist,
    derivePhase5AttendedRows,
    validatePhase5PendingChecklist,
  } = await load("scripts/generate-phase5-attended-checklist.mjs");
  const manifest = manifestFixture();
  const rows = derivePhase5AttendedRows(projectRoot);
  const phase6AttendedEvidence = phase6AttendedEvidenceFixture(manifest);
  const checklist = buildPhase5PendingChecklist({
    candidate: candidateIdentity(manifest),
    automatedEvidence: { file: "automated.json", sha256: SHA_A },
    phase6AttendedEvidence, rows,
    generatedAt: "2026-08-26T00:00:00.000Z",
  });
  assert.doesNotThrow(() => validatePhase5PendingChecklist(checklist, {
    candidate: candidateIdentity(manifest),
    automatedEvidence: { file: "automated.json", sha256: SHA_A },
    phase6AttendedEvidence, rows,
  }));
  assert.equal(checklist.status, "pending");
  assert.equal(checklist.rows.every((row) => row.status === "pending"
    && row.observation === "" && row.attachments.length === 0), true);
  assert.doesNotMatch(JSON.stringify(checklist), /owner_token|approval_status|"status":"approved"/iu);
});

test("Phase 5 pending checklist requires exact passed Phase 6 N4 provenance", async () => {
  const {
    buildPhase5PendingChecklist,
    derivePhase5AttendedRows,
    validatePhase5PendingChecklist,
  } = await load("scripts/generate-phase5-attended-checklist.mjs");
  const manifest = manifestFixture();
  const rows = derivePhase5AttendedRows(projectRoot);
  const automatedEvidence = { file: "automated.json", sha256: SHA_A };
  const phase6AttendedEvidence = phase6AttendedEvidenceFixture(manifest);
  const checklist = buildPhase5PendingChecklist({
    candidate: candidateIdentity(manifest), automatedEvidence,
    phase6AttendedEvidence, rows, generatedAt: "2026-09-03T00:00:00.000Z",
  });
  assert.deepEqual(checklist.phase6_attended_evidence, phase6AttendedEvidence);
  assert.doesNotThrow(() => validatePhase5PendingChecklist(checklist, {
    candidate: candidateIdentity(manifest), automatedEvidence, phase6AttendedEvidence, rows,
  }));
  for (const mutation of [
    undefined,
    { ...phase6AttendedEvidence, status: "failed" },
    { ...phase6AttendedEvidence, candidate_id: "wrong-candidate" },
    { ...phase6AttendedEvidence, source_commit: "f".repeat(40) },
    { ...phase6AttendedEvidence, manifest_sha256: SHA_A },
    { ...phase6AttendedEvidence, apk_sha256: SHA_A },
    { ...phase6AttendedEvidence, record_sha256: "not-a-digest" },
    { ...phase6AttendedEvidence, evidence_run_id: "0" },
    { ...phase6AttendedEvidence, artifact_name: "not canonical/artifact" },
  ]) {
    assert.throws(() => buildPhase5PendingChecklist({
      candidate: candidateIdentity(manifest), automatedEvidence,
      phase6AttendedEvidence: mutation, rows, generatedAt: "2026-09-03T00:00:00.000Z",
    }), /Phase 6|N4|passed|candidate|commit|manifest|APK|digest|run|artifact|provenance/iu);
  }
});

test("Phase 5 derives N4 provenance only by replaying the canonical Phase 6 record", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-phase6-n4-"));
  try {
    const { loadPhase6N4AttendedEvidence } = await load(
      "scripts/generate-phase5-attended-checklist.mjs",
    );
    const manifest = manifestFixture();
    const n4 = await materializePhase6N4Evidence(temporaryDirectory, manifest);
    const options = {
      candidateManifest: manifest,
      manifestSha256: SHA_D,
      phase6N4RecordPath: n4.recordPath,
      phase6N4ChecklistPath: n4.checklistPath,
      phase6N4ObservationsPath: n4.observationsPath,
      phase6N4EvidenceDirectory: n4.evidenceDirectory,
      phase6N4RunId: n4.evidenceRunId,
      phase6N4ArtifactName: n4.artifactName,
    };
    assert.deepEqual(loadPhase6N4AttendedEvidence(options), {
      ...phase6AttendedEvidenceFixture(manifest),
      record_sha256: createHash("sha256").update(n4.recordBytes).digest("hex"),
    });

    const failedDirectory = path.join(temporaryDirectory, "failed");
    const failed = await materializePhase6N4Evidence(failedDirectory, manifest, { failed: true });
    assert.throws(() => loadPhase6N4AttendedEvidence({
      ...options,
      phase6N4RecordPath: failed.recordPath,
      phase6N4ChecklistPath: failed.checklistPath,
      phase6N4ObservationsPath: failed.observationsPath,
      phase6N4EvidenceDirectory: failed.evidenceDirectory,
    }), /Phase 6|N4|passed|failed/iu);

    const wrongCandidate = manifestFixture({ candidate_id: "wrong-candidate" });
    assert.throws(() => loadPhase6N4AttendedEvidence({
      ...options, candidateManifest: wrongCandidate,
    }), /Phase 6|N4|candidate|identity/iu);
    assert.throws(() => loadPhase6N4AttendedEvidence({
      ...options, manifestSha256: SHA_A,
    }), /Phase 6|N4|manifest|identity/iu);
    const wrongApk = manifestFixture({
      artifacts: manifest.artifacts.map((artifactValue) => artifactValue.kind === "apk"
        ? { ...artifactValue, sha256: SHA_A }
        : artifactValue),
    });
    assert.throws(() => loadPhase6N4AttendedEvidence({
      ...options, candidateManifest: wrongApk,
    }), /Phase 6|N4|APK|candidate|identity/iu);

    writeFileSync(n4.recordPath, `${n4.recordBytes.toString("utf8")}\n`);
    assert.throws(() => loadPhase6N4AttendedEvidence(options), /Phase 6|N4|canonical|record/iu);
    writeFileSync(n4.recordPath, n4.recordBytes);
    writeFileSync(path.join(temporaryDirectory, "N4-01.png"), Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("altered"),
    ]));
    assert.throws(() => loadPhase6N4AttendedEvidence(options), /Phase 6|N4|attachment|hash|changed/iu);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("Phase 5 attended CLI requires every Phase 6 N4 binding argument", async () => {
  const { parsePhase5AttendedCliArguments } = await load(
    "scripts/generate-phase5-attended-checklist.mjs",
  );
  const exact = [
    "prepare",
    "--bundle-dir", "retained-candidate",
    "--manifest-sha256", SHA_D,
    "--automated-evidence", "automated.json",
    "--phase6-n4-record", "phase6/attended-record.json",
    "--phase6-n4-checklist", "phase6/checklist.json",
    "--phase6-n4-observations", "phase6/observations.json",
    "--phase6-n4-evidence-dir", "phase6",
    "--phase6-n4-run-id", "987654321",
    "--phase6-n4-artifact-name", "phase6-n4-evidence-candidate-001-987654321",
    "--output", "checklist.pending.json",
  ];
  assert.deepEqual(parsePhase5AttendedCliArguments(exact), {
    mode: "prepare", bundleDir: "retained-candidate", manifestSha256: SHA_D,
    automatedEvidence: "automated.json",
    phase6N4Record: "phase6/attended-record.json",
    phase6N4Checklist: "phase6/checklist.json",
    phase6N4Observations: "phase6/observations.json",
    phase6N4EvidenceDir: "phase6", phase6N4RunId: "987654321",
    phase6N4ArtifactName: "phase6-n4-evidence-candidate-001-987654321",
    output: "checklist.pending.json",
  });
  for (const missingOption of [
    "--phase6-n4-record", "--phase6-n4-checklist",
    "--phase6-n4-observations", "--phase6-n4-evidence-dir",
    "--phase6-n4-run-id", "--phase6-n4-artifact-name",
  ]) {
    const index = exact.indexOf(missingOption);
    assert.throws(
      () => parsePhase5AttendedCliArguments([
        ...exact.slice(0, index), ...exact.slice(index + 2),
      ]),
      /missing|Phase 6|N4|argument/iu,
    );
  }
  for (const [option, invalid] of [
    ["--phase6-n4-run-id", "0"],
    ["--phase6-n4-run-id", "12.5"],
    ["--phase6-n4-artifact-name", "bad/artifact"],
    ["--phase6-n4-artifact-name", ""],
  ]) {
    const index = exact.indexOf(option);
    const changed = [...exact];
    changed[index + 1] = invalid;
    assert.throws(() => parsePhase5AttendedCliArguments(changed), /Phase 6|N4|run|artifact|argument/iu);
  }
});

function attendedFixture(rows, manifest = manifestFixture()) {
  return {
    schema_version: 1,
    suite: "phase5",
    candidate_id: manifest.candidate_id,
    manifest_sha256: SHA_D,
    devices: [
      {
        role: "attended-emulator", model: "Pixel_7", api: 36, abi: "x86_64",
        serial_sha256: SHA_A, installed_package: manifest.source.package,
        installed_version_code: 1, installed_apk_sha256: SHA_B,
      },
      {
        role: "attended-physical-phone", model: "SM-S916B", api: 36, abi: "arm64-v8a",
        serial_sha256: SHA_B, installed_package: manifest.source.package,
        installed_version_code: 1, installed_apk_sha256: SHA_B,
      },
    ],
    rows: rows.map((row, index) => ({
      row_id: row.row_id,
      status: "passed",
      observation: `Observed exact candidate behavior for ${row.row_id}.`,
      attachments: [`attachments/evidence-${String(index).padStart(2, "0")}.txt`],
    })),
  };
}

test("recorder requires explicit closed observations, real attachments, and exact lowercase owner token", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-attended-"));
  try {
    const {
      buildPhase5PendingChecklist,
      createPhase5AttendedRecord,
      derivePhase5AttendedRows,
      serializeCanonicalJson,
    } = await load("scripts/generate-phase5-attended-checklist.mjs");
    const manifest = manifestFixture();
    const rows = derivePhase5AttendedRows(projectRoot);
    const candidate = candidateIdentity(manifest);
    const n4 = await materializePhase6N4Evidence(path.join(temporaryDirectory, "phase6"), manifest);
    const phase6Options = {
      phase6N4RecordPath: n4.recordPath, phase6N4ChecklistPath: n4.checklistPath,
      phase6N4ObservationsPath: n4.observationsPath,
      phase6N4EvidenceDirectory: n4.evidenceDirectory,
      phase6N4RunId: n4.evidenceRunId, phase6N4ArtifactName: n4.artifactName,
    };
    const phase6AttendedEvidence = phase6AttendedEvidenceFixture(manifest);
    phase6AttendedEvidence.record_sha256 = createHash("sha256").update(n4.recordBytes).digest("hex");
    const checklist = buildPhase5PendingChecklist({
      candidate, automatedEvidence: { file: "automated.json", sha256: SHA_A },
      phase6AttendedEvidence, rows, generatedAt: "2026-08-26T00:00:00.000Z",
    });
    const checklistBytes = Buffer.from(serializeCanonicalJson(checklist));
    const observations = attendedFixture(rows, manifest);
    for (const row of observations.rows) {
      const target = path.join(temporaryDirectory, row.attachments[0]);
      const directory = path.dirname(target);
      const { mkdirSync } = await import("node:fs");
      mkdirSync(directory, { recursive: true });
      writeFileSync(target, row.observation);
    }
    const observationsBytes = Buffer.from(serializeCanonicalJson(observations));
    assert.doesNotThrow(() => createPhase5AttendedRecord({
      candidateManifest: manifest, manifestSha256: SHA_D, checklist, checklistBytes,
      observations, observationsBytes, ownerToken: "approved",
      evidenceDirectory: temporaryDirectory, ...phase6Options, rows,
    }));
    for (const ownerToken of [undefined, "Approved", "APPROVED", " approved", "approved ", "approvеd"]) {
      assert.throws(() => createPhase5AttendedRecord({
        candidateManifest: manifest, manifestSha256: SHA_D, checklist, checklistBytes,
        observations, observationsBytes, ownerToken, evidenceDirectory: temporaryDirectory, rows,
        ...phase6Options,
      }), /owner token|approved/iu);
    }
    for (const status of ["pending", "skipped", "failed", "unknown", ""]) {
      const changed = structuredClone(observations);
      changed.rows[0].status = status;
      assert.throws(() => createPhase5AttendedRecord({
        candidateManifest: manifest, manifestSha256: SHA_D, checklist, checklistBytes,
        observations: changed, observationsBytes: Buffer.from(serializeCanonicalJson(changed)),
        ownerToken: "approved", evidenceDirectory: temporaryDirectory, rows,
        ...phase6Options,
      }), /status|passed|closed/iu);
    }
    const blank = structuredClone(observations);
    blank.rows[0].observation = "";
    assert.throws(() => createPhase5AttendedRecord({
      candidateManifest: manifest, manifestSha256: SHA_D, checklist, checklistBytes,
      observations: blank, observationsBytes: Buffer.from(serializeCanonicalJson(blank)),
      ownerToken: "approved", evidenceDirectory: temporaryDirectory, rows,
      ...phase6Options,
    }), /observation|blank/iu);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("attended verifier hashes canonical record, every attachment, automation, and candidate identity", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-attended-verify-"));
  try {
    const { mkdirSync } = await import("node:fs");
    const {
      buildPhase5PendingChecklist, createPhase5AttendedRecord, derivePhase5AttendedRows,
      serializeCanonicalJson, validatePhase5AttendedRecordBytes,
    } = await load("scripts/generate-phase5-attended-checklist.mjs");
    const manifest = manifestFixture();
    const candidate = candidateIdentity(manifest);
    const rows = derivePhase5AttendedRows(projectRoot);
    const n4 = await materializePhase6N4Evidence(path.join(temporaryDirectory, "phase6"), manifest);
    const phase6AttendedEvidence = phase6AttendedEvidenceFixture(manifest);
    phase6AttendedEvidence.record_sha256 = createHash("sha256").update(n4.recordBytes).digest("hex");
    const phase6Options = {
      phase6N4RecordPath: n4.recordPath, phase6N4ChecklistPath: n4.checklistPath,
      phase6N4ObservationsPath: n4.observationsPath,
      phase6N4EvidenceDirectory: n4.evidenceDirectory,
      phase6N4RunId: n4.evidenceRunId, phase6N4ArtifactName: n4.artifactName,
    };
    const automatedPath = path.join(temporaryDirectory, "automated.json");
    writeFileSync(automatedPath, "automated exact candidate evidence\n");
    const automated = {
      file: "automated.json",
      sha256: createHash("sha256").update(readFileSync(automatedPath)).digest("hex"),
    };
    const checklist = buildPhase5PendingChecklist({
      candidate, automatedEvidence: automated, rows,
      phase6AttendedEvidence, generatedAt: "2026-08-26T00:00:00.000Z",
    });
    const checklistBytes = Buffer.from(serializeCanonicalJson(checklist));
    const observations = attendedFixture(rows, manifest);
    for (const row of observations.rows) {
      const target = path.join(temporaryDirectory, row.attachments[0]);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, row.observation);
    }
    const observationsBytes = Buffer.from(serializeCanonicalJson(observations));
    const checklistPath = path.join(temporaryDirectory, "checklist.pending.json");
    const observationsPath = path.join(temporaryDirectory, "observations.json");
    writeFileSync(checklistPath, checklistBytes);
    writeFileSync(observationsPath, observationsBytes);
    const record = createPhase5AttendedRecord({
      candidateManifest: manifest, manifestSha256: SHA_D, checklist, checklistBytes,
      observations, observationsBytes, ownerToken: "approved",
      evidenceDirectory: temporaryDirectory, ...phase6Options, rows,
    });
    assert.deepEqual(record.phase6_attended_evidence, phase6AttendedEvidence);
    const canonicalRecordBytes = Buffer.from(serializeCanonicalJson(record));
    assert.deepEqual(validatePhase5AttendedRecordBytes({
      candidateManifest: manifest, manifestSha256: SHA_D, record,
      recordBytes: canonicalRecordBytes, evidenceDirectory: temporaryDirectory,
      automatedEvidencePath: automatedPath, checklistPath, observationsPath, rows,
      ...phase6Options,
    }), {
      status: "approved",
      rows: record.rows,
      attended_record_sha256: createHash("sha256").update(canonicalRecordBytes).digest("hex"),
    });
    const substitutedN4 = {
      ...record,
      phase6_attended_evidence: { ...record.phase6_attended_evidence, record_sha256: SHA_A },
    };
    assert.throws(() => validatePhase5AttendedRecordBytes({
      candidateManifest: manifest, manifestSha256: SHA_D, record: substitutedN4,
      recordBytes: Buffer.from(serializeCanonicalJson(substitutedN4)),
      evidenceDirectory: temporaryDirectory, automatedEvidencePath: automatedPath,
      checklistPath, observationsPath, rows, ...phase6Options,
    }), /Phase 6|N4|provenance|record|retained/iu);
    writeFileSync(checklistPath, `${checklistBytes.toString("utf8")}\n`);
    assert.throws(() => validatePhase5AttendedRecordBytes({
      candidateManifest: manifest, manifestSha256: SHA_D, record,
      recordBytes: canonicalRecordBytes, evidenceDirectory: temporaryDirectory,
      automatedEvidencePath: automatedPath, checklistPath, observationsPath, rows,
      ...phase6Options,
    }), /checklist|hash|canonical|bytes/iu);
    writeFileSync(checklistPath, checklistBytes);
    writeFileSync(observationsPath, `${observationsBytes.toString("utf8")}\n`);
    assert.throws(() => validatePhase5AttendedRecordBytes({
      candidateManifest: manifest, manifestSha256: SHA_D, record,
      recordBytes: canonicalRecordBytes, evidenceDirectory: temporaryDirectory,
      automatedEvidencePath: automatedPath, checklistPath, observationsPath, rows,
      ...phase6Options,
    }), /observation|hash|canonical|bytes/iu);
    writeFileSync(observationsPath, observationsBytes);
    const attachment = path.join(temporaryDirectory, observations.rows[0].attachments[0]);
    writeFileSync(attachment, "changed bytes");
    assert.throws(() => validatePhase5AttendedRecordBytes({
      candidateManifest: manifest, manifestSha256: SHA_D, record,
      recordBytes: canonicalRecordBytes, evidenceDirectory: temporaryDirectory,
      automatedEvidencePath: automatedPath, checklistPath, observationsPath, rows,
      ...phase6Options,
    }), /attachment|hash|bytes/iu);
    rmSync(attachment);
    assert.throws(() => validatePhase5AttendedRecordBytes({
      candidateManifest: manifest, manifestSha256: SHA_D, record,
      recordBytes: canonicalRecordBytes, evidenceDirectory: temporaryDirectory,
      automatedEvidencePath: automatedPath, checklistPath, observationsPath, rows,
      ...phase6Options,
    }), /attachment|missing|evidence/iu);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("attended attachments reject zero bytes, symlinks, escapes, and reuse across rows", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-attacks-"));
  const outsideDirectory = mkdtempSync(path.join(os.tmpdir(), "phase5-outside-"));
  try {
    const {
      buildPhase5PendingChecklist, createPhase5AttendedRecord, derivePhase5AttendedRows,
      serializeCanonicalJson,
    } = await load("scripts/generate-phase5-attended-checklist.mjs");
    const manifest = manifestFixture();
    const rows = derivePhase5AttendedRows(projectRoot);
    const n4 = await materializePhase6N4Evidence(path.join(temporaryDirectory, "phase6"), manifest);
    const phase6Options = {
      phase6N4RecordPath: n4.recordPath, phase6N4ChecklistPath: n4.checklistPath,
      phase6N4ObservationsPath: n4.observationsPath,
      phase6N4EvidenceDirectory: n4.evidenceDirectory,
      phase6N4RunId: n4.evidenceRunId, phase6N4ArtifactName: n4.artifactName,
    };
    const phase6AttendedEvidence = phase6AttendedEvidenceFixture(manifest);
    phase6AttendedEvidence.record_sha256 = createHash("sha256").update(n4.recordBytes).digest("hex");
    const checklist = buildPhase5PendingChecklist({
      candidate: candidateIdentity(manifest),
      automatedEvidence: { file: "automated.json", sha256: SHA_A },
      phase6AttendedEvidence, rows, generatedAt: "2026-08-26T00:00:00.000Z",
    });
    const checklistBytes = Buffer.from(serializeCanonicalJson(checklist));
    const original = attendedFixture(rows, manifest);
    const materialize = (observations) => {
      for (const row of observations.rows) {
        const target = path.join(temporaryDirectory, row.attachments[0]);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, row.observation);
      }
    };
    const run = (observations) => createPhase5AttendedRecord({
      candidateManifest: manifest, manifestSha256: SHA_D, checklist, checklistBytes,
      observations, observationsBytes: Buffer.from(serializeCanonicalJson(observations)),
      ownerToken: "approved", evidenceDirectory: temporaryDirectory, rows,
      ...phase6Options,
    });
    materialize(original);
    const zero = structuredClone(original);
    writeFileSync(path.join(temporaryDirectory, zero.rows[0].attachments[0]), "");
    assert.throws(() => run(zero), /attachment|empty|size/iu);
    materialize(original);
    const duplicate = structuredClone(original);
    duplicate.rows[1].attachments = [...duplicate.rows[0].attachments];
    assert.throws(() => run(duplicate), /attachment|multiple|duplicate/iu);
    const escaped = structuredClone(original);
    escaped.rows[0].attachments = ["../outside.txt"];
    writeFileSync(path.join(outsideDirectory, "outside.txt"), "outside");
    assert.throws(() => run(escaped), /attachment|escape|unsafe/iu);
    const symlink = structuredClone(original);
    const linkPath = path.join(temporaryDirectory, "attachments/link.txt");
    rmSync(linkPath, { force: true });
    symlinkSync(path.join(outsideDirectory, "outside.txt"), linkPath);
    symlink.rows[0].attachments = ["attachments/link.txt"];
    assert.throws(() => run(symlink), /attachment|symlink|unsafe/iu);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    rmSync(outsideDirectory, { recursive: true, force: true });
  }
});

test("final release gate rejects minimal aggregate JSON and revalidates producer and raw-report bytes", async () => {
  const { validatePhase5ReleaseEvidenceSet } = await load(
    "scripts/verify-phase5-release-gate.mjs",
  );
  const manifest = manifestFixture();
  const minimal = {
    mode: "automated-only", approval_status: "evidence_pending",
    candidate: candidateIdentity(manifest),
  };
  assert.throws(() => validatePhase5ReleaseEvidenceSet({
    candidateManifest: manifest, manifestSha256: SHA_D, aggregate: minimal,
    aggregateBytes: Buffer.from(`${JSON.stringify(minimal)}\n`),
    source: {}, maestro: {}, benchmark: {}, rawReports: {},
  }), /aggregate|producer|case|report|schema/iu);
});

test("promotion proof binds public APK/AAB bytes and workflow provenance", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "phase5-promotion-proof-"));
  try {
    const { createPhase5PromotionProof, serializePhase5PromotionProof, validatePhase5PromotionProof } = await load(
      "scripts/record-phase5-promotion-proof.mjs",
    );
    const manifest = manifestFixture();
    const publicAssets = path.join(directory, "public");
    mkdirSync(publicAssets);
    for (const artifactValue of manifest.artifacts) {
      const bytes = Buffer.from(`${artifactValue.kind}-public-bytes`);
      writeFileSync(path.join(publicAssets, artifactValue.file), bytes);
      artifactValue.sha256 = createHash("sha256").update(bytes).digest("hex");
      artifactValue.size_bytes = bytes.length;
    }
    const candidate = { manifest, manifest_sha256: SHA_D };
    const proof = createPhase5PromotionProof({
      candidate, candidateRunId: "12345", attendedRunId: "23456",
      attendedArtifactName: "attended-release-evidence-candidate-001",
      attendedRecordSha256: SHA_A, promotionRunId: "34567",
      repository: "owner/gym-tracker", releaseTag: "v1.0.0",
      publicAssetsDirectory: publicAssets,
    });
    const bytes = Buffer.from(serializePhase5PromotionProof(proof));
    assert.doesNotThrow(() => validatePhase5PromotionProof({
      proof, proofBytes: bytes, candidate, attendedRecordSha256: SHA_A,
      publicAssetsDirectory: publicAssets,
    }));
    writeFileSync(path.join(publicAssets, "gym-tracker-release.apk"), "changed");
    assert.throws(() => validatePhase5PromotionProof({
      proof, proofBytes: bytes, candidate, attendedRecordSha256: SHA_A,
      publicAssetsDirectory: publicAssets,
    }), /public|asset|candidate/iu);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("protected attended workflow consumes supplied evidence and uploads a verified immutable bundle", async () => {
  const {
    validateAttendedEvidenceWorkflowContract,
    validateWorkflowDispatchInputSafety,
  } = await load(
    "scripts/phase5-workflow-contract.mjs",
  );
  const source = readFileSync(
    path.join(projectRoot, ".github/workflows/release-attended-evidence.yml"), "utf8",
  );
  assert.doesNotThrow(() => validateAttendedEvidenceWorkflowContract(source));
  assertDeploymentStatusProvenance(source, [
    ["CANDIDATE_RUN_ID", "private-release-candidate"],
    ["OBSERVATIONS_RUN_ID", "private-release-observation-upload"],
  ]);
  assert.match(source, /^\s*owner_token:\s*$/mu);
  assert.match(source, /^\s*OWNER_TOKEN:\s*\$\{\{ inputs\.owner_token \}\}\s*$/mu);
  assert.match(source, /test "\$\{OWNER_TOKEN\}" = "approved"/u);
  assert.match(source, /--owner-token "\$\{OWNER_TOKEN\}"/u);
  assert.doesNotMatch(source, /--owner-token approved/u);
  for (const workflow of [
    ".github/workflows/release-candidate.yml",
    ".github/workflows/release-attended-evidence.yml",
    ".github/workflows/release-promotion.yml",
  ]) {
    const workflowSource = readFileSync(path.join(projectRoot, workflow), "utf8");
    assert.doesNotThrow(() => validateWorkflowDispatchInputSafety(workflowSource));
  }
  assert.throws(() => validateWorkflowDispatchInputSafety(
    source.replace("${CANDIDATE_ID}", "${{ inputs.candidate_id }}"),
  ), /dispatch|input|shell/iu);
  assert.throws(() => validateAttendedEvidenceWorkflowContract(
    replaceAfterMarker(
      source,
      '--argjson run_id "${OBSERVATIONS_RUN_ID}" --arg run_url',
      '.head_sha == $commit',
      '.head_sha != $commit',
    ),
  ), /provenance|run|commit/iu);
  assert.throws(() => validateAttendedEvidenceWorkflowContract(
    replaceAfterMarker(
      source,
      '--argjson run_id "${OBSERVATIONS_RUN_ID}" --arg commit',
      '.workflow_run.id == $run_id and .workflow_run.head_sha == $commit',
      'true',
    ),
  ), /provenance|artifact|run|commit/iu);
  assert.throws(() => validateAttendedEvidenceWorkflowContract(
    source.replace(
      '--argjson run_id "${OBSERVATIONS_RUN_ID}" --arg run_url "${observations_run_url}"',
      '--argjson run_id "${OBSERVATIONS_RUN_ID}" --arg run_url "${candidate_run_url}"',
    ),
  ), /provenance|run|URL/iu);
  assert.throws(() => validateAttendedEvidenceWorkflowContract(
    source.replace(
      `observations_run_attempt=$(jq -er '.run_attempt | select(type == "number" and . >= 1)' <<<"${'${observations_run}'}")`,
      `observations_run_attempt=$(jq -er '.run_attempt | select(type == "number" and . >= 1)' <<<"${'${candidate_run}'}")`,
    ),
  ), /provenance|attempt|ref|run/iu);
});

test("protected human observation producer uploads bounded local evidence with pinned provenance", async () => {
  const {
    validateHumanEvidenceUploadWorkflowContract,
    validateWorkflowDispatchInputSafety,
  } = await load("scripts/phase5-workflow-contract.mjs");
  const source = readFileSync(
    path.join(projectRoot, ".github/workflows/release-human-evidence-upload.yml"),
    "utf8",
  );
  assert.doesNotThrow(() => validateHumanEvidenceUploadWorkflowContract(source));
  assertDeploymentStatusProvenance(source, [
    ["CANDIDATE_RUN_ID", "private-release-candidate"],
  ]);
  assert.doesNotThrow(() => validateWorkflowDispatchInputSafety(source));
  assert.match(source, /permissions:[\s\S]*actions:\s*read[\s\S]*contents:\s*read[\s\S]*id-token:\s*none/iu);
  assert.match(source, /^\s*candidate_run_id:\s*$/mu);
  const provenance = source.indexOf("name: Validate candidate provenance with trusted inline shell");
  const checkout = source.indexOf("name: Check out exact proven candidate source");
  const helper = source.indexOf("node workflow-source/scripts/stage-phase5-human-evidence.mjs");
  assert.equal(provenance >= 0 && provenance < checkout && checkout < helper, true);
  assert.match(source, /release-candidate\.yml/iu);
  assert.match(source, /private-release-candidate/iu);
  assert.match(source, /private-release-candidate-\$\{CANDIDATE_ID\}/u);
  const attended = readFileSync(
    path.join(projectRoot, ".github/workflows/release-attended-evidence.yml"),
    "utf8",
  );
  assert.match(attended, /release-human-evidence-upload\.yml/iu);
  assert.match(attended, /private-release-observation-upload/iu);
});

test("human evidence staging stays beneath the protected root and clears only fixed staging", async () => {
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), "phase5-owner-evidence-"));
  const stagingRoot = mkdtempSync(path.join(os.tmpdir(), "phase5-owner-staging-"));
  const outsideRoot = mkdtempSync(path.join(os.tmpdir(), "phase5-owner-outside-"));
  try {
    const { stagePhase5HumanEvidence } = await load(
      "scripts/stage-phase5-human-evidence.mjs",
    );
    mkdirSync(path.join(sourceRoot, "evidence", "attachments"), { recursive: true });
    writeFileSync(path.join(sourceRoot, "evidence", "observations.json"), "{}\n");
    writeFileSync(path.join(sourceRoot, "evidence", "attachments", "screen.txt"), "observed");
    mkdirSync(path.join(stagingRoot, "gym-tracker-human-evidence"), { recursive: true });
    writeFileSync(path.join(stagingRoot, "gym-tracker-human-evidence", "stale.txt"), "stale");
    const result = stagePhase5HumanEvidence({
      evidenceRoot: sourceRoot,
      observationsRelative: "evidence/observations.json",
      attachmentsRelative: "evidence/attachments",
      stagingRoot,
    });
    assert.equal(readFileSync(path.join(result.stagingDirectory, "observations.json"), "utf8"), "{}\n");
    assert.equal(readFileSync(path.join(result.stagingDirectory, "attachments", "screen.txt"), "utf8"), "observed");
    assert.throws(() => readFileSync(path.join(result.stagingDirectory, "stale.txt")), /ENOENT/u);
    assert.throws(() => stagePhase5HumanEvidence({
      evidenceRoot: sourceRoot, observationsRelative: "../outside.json",
      attachmentsRelative: "evidence/attachments", stagingRoot,
    }), /relative|contain|escape/iu);
    assert.throws(() => stagePhase5HumanEvidence({
      evidenceRoot: sourceRoot, observationsRelative: path.join(outsideRoot, "outside.json"),
      attachmentsRelative: "evidence/attachments", stagingRoot,
    }), /relative|absolute|contain/iu);
    writeFileSync(path.join(outsideRoot, "outside.json"), "{}\n");
    symlinkSync(path.join(outsideRoot, "outside.json"), path.join(sourceRoot, "evidence", "link.json"));
    assert.throws(() => stagePhase5HumanEvidence({
      evidenceRoot: sourceRoot, observationsRelative: "evidence/link.json",
      attachmentsRelative: "evidence/attachments", stagingRoot,
    }), /symlink|contain|unsafe/iu);
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test("human evidence staging rejects every unsafe recursive descendant and bound", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "phase5-recursive-evidence-"));
  const stagingRoot = mkdtempSync(path.join(os.tmpdir(), "phase5-recursive-staging-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "phase5-recursive-outside-"));
  const { stagePhase5HumanEvidence } = await load("scripts/stage-phase5-human-evidence.mjs");
  const reset = () => {
    rmSync(path.join(root, "attachments"), { recursive: true, force: true });
    mkdirSync(path.join(root, "attachments", "nested"), { recursive: true });
    writeFileSync(path.join(root, "observations.json"), "{}\n");
  };
  const run = () => stagePhase5HumanEvidence({
    evidenceRoot: root, observationsRelative: "observations.json",
    attachmentsRelative: "attachments", stagingRoot,
  });
  try {
    reset();
    writeFileSync(path.join(outside, "outside.txt"), "outside");
    symlinkSync(path.join(outside, "outside.txt"), path.join(root, "attachments", "nested", "link.txt"));
    assert.throws(run, /symlink|unsafe|escape/iu);

    reset();
    writeFileSync(path.join(root, "attachments", "nested", "empty.txt"), "");
    assert.throws(run, /empty|positive|size/iu);

    reset();
    for (let index = 0; index < 257; index += 1) {
      writeFileSync(path.join(root, "attachments", `file-${index}.txt`), "x");
    }
    assert.throws(run, /256|count|files/iu);

    reset();
    const oversized = path.join(root, "attachments", "oversized.bin");
    writeFileSync(oversized, "x");
    truncateSync(oversized, 64 * 1024 * 1024 + 1);
    assert.throws(run, /64|size|bounded/iu);

    reset();
    for (let index = 0; index < 9; index += 1) {
      const file = path.join(root, "attachments", `aggregate-${index}.bin`);
      writeFileSync(file, "x");
      truncateSync(file, 64 * 1024 * 1024);
    }
    assert.throws(run, /512|aggregate|size/iu);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("production Android contract validates multiline backup and D2D sections", async () => {
  const { validateGeneratedProductionAndroidSources } = await load(
    "scripts/assert-generated-production-android.mjs",
  );
  const exclusions = [
    '<exclude domain="database" path="." />',
    '<exclude domain="root" path="backup-staging" />',
    '<exclude domain="root" path="plaintext-staging" />',
    '<exclude domain="file" path="backup-staging" />',
    '<exclude domain="file" path="plaintext-staging" />',
    '<exclude domain="external" path="backup-staging" />',
    '<exclude domain="external" path="plaintext-staging" />',
  ].join("\n");
  const values = {
    gradle: 'applicationId "com.fchoo.gymtracker"',
    gradleProperties: "reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64",
    manifest: '<application android:fullBackupContent="@xml/backup_rules" android:dataExtractionRules="@xml/data_extraction_rules"><data android:scheme="gymtracker" /></application>',
    strings: '<string name="app_name">Gym Tracker</string>',
    backup: `<full-backup-content>\n${exclusions}\n</full-backup-content>`,
    extraction: `<data-extraction-rules>\n<cloud-backup>\n${exclusions}\n</cloud-backup>\n<device-transfer>\n${exclusions}\n</device-transfer>\n</data-extraction-rules>`,
  };
  assert.deepEqual(validateGeneratedProductionAndroidSources(values), []);
  assert.match(validateGeneratedProductionAndroidSources({
    ...values, extraction: values.extraction.replace(exclusions, ""),
  }).join(" "), /cloud-backup.*omit/iu);
  assert.match(validateGeneratedProductionAndroidSources({
    ...values, gradleProperties: "reactNativeArchitectures=x86_64",
  }).join(" "), /architectures.*full|full.*architectures/iu);
});

test("Phase 5 benchmark resolves an explicit launcher and parses Android timing", async () => {
  const {
    parsePhase5LauncherComponent,
    parsePhase5TotalTime,
    phase5LaunchArguments,
  } = await load("scripts/benchmark-phase5.mjs");
  assert.equal(
    parsePhase5LauncherComponent(
      "com.fchoo.gymtracker/.MainActivity\n",
      "com.fchoo.gymtracker",
    ),
    "com.fchoo.gymtracker/.MainActivity",
  );
  assert.throws(
    () => parsePhase5LauncherComponent(
      "com.attacker/.MainActivity\n",
      "com.fchoo.gymtracker",
    ),
    /launcher|component/iu,
  );
  assert.deepEqual(
    phase5LaunchArguments("com.fchoo.gymtracker/.MainActivity"),
    ["shell", "am", "start", "-W", "-n", "com.fchoo.gymtracker/.MainActivity"],
  );
  assert.deepEqual(
    phase5LaunchArguments(
      "com.fchoo.gymtracker/.MainActivity",
      "gymtracker://more/data-and-recovery",
    ),
    [
      "shell", "am", "start", "-W", "-n",
      "com.fchoo.gymtracker/.MainActivity", "-a", "android.intent.action.VIEW",
      "-d", "gymtracker://more/data-and-recovery",
    ],
  );
  assert.equal(parsePhase5TotalTime("Status: ok\nTotalTime:   123\nWaitTime: 125\n"), 123);
  assert.throws(() => parsePhase5TotalTime("TotalTime:s123\n"), /timing|malformed/iu);
});

test("promotion and terminal contracts require selected successful cross-run inputs and one non-mutating command", async () => {
  const {
    validatePromotionWorkflowContract,
    validateReleasePromotionInputValues,
  } = await load(
    "scripts/phase5-promotion-contract.mjs",
  );
  const { validateTerminalSealDocument } = await load(
    "scripts/phase5-terminal-seal-contract.mjs",
  );
  const promotion = readFileSync(
    path.join(projectRoot, ".github/workflows/release-promotion.yml"), "utf8",
  );
  const terminal = readFileSync(
    path.join(projectRoot, ".planning/phases/05-recovery-distribution-and-release/05-TERMINAL-SEAL.md"), "utf8",
  );
  assert.doesNotThrow(() => validatePromotionWorkflowContract(promotion));
  assertDeploymentStatusProvenance(promotion, [
    ["CANDIDATE_RUN_ID", "private-release-candidate"],
    ["ATTENDED_RUN_ID", "private-release-attended"],
  ]);
  const workflowCheckout = promotion.indexOf("name: Check out workflow source for input validation");
  const validator = promotion.indexOf("node workflow-source/scripts/validate-phase5-promotion-inputs.mjs");
  const candidateCheckout = promotion.indexOf("name: Check out exact candidate source");
  const attendedVerifier = promotion.indexOf("npm run verify:attended:phase5");
  const publisher = promotion.indexOf("gh release create");
  assert.equal(workflowCheckout >= 0 && workflowCheckout < validator, true);
  assert.equal(validator < candidateCheckout && candidateCheckout < attendedVerifier, true);
  assert.equal(attendedVerifier < publisher, true);
  assert.match(promotion, /group:\s*release-promotion\s*$/mu);
  assert.match(promotion, /cancel-in-progress:\s*false/u);
  assert.doesNotMatch(promotion, /group:\s*release-promotion-\$\{\{ github\.run_id \}\}/u);
  assert.match(promotion, /release_bodies=\$\(gh api --paginate/iu);
  assert.doesNotMatch(
    promotion,
    /gh api --paginate[^\n]*releases[\s\S]{0,160}\|\s*grep -F/iu,
  );
  assert.doesNotThrow(() => validateReleasePromotionInputValues({
    candidateRunId: "123", attendedRunId: "456",
    candidateId: "candidate-001", candidateCommit: "a".repeat(40),
    attendedArtifactName: "attended-release-evidence-candidate-001",
    attendedRecordSha256: "b".repeat(64), releaseTag: "v1.2.3-rc.1",
  }));
  for (const releaseTag of ["v1x.2.3", "v1.2.3junk", "v1.2", "1.2.3"]) {
    assert.throws(() => validateReleasePromotionInputValues({
      candidateRunId: "123", attendedRunId: "456",
      candidateId: "candidate-001", candidateCommit: "a".repeat(40),
      attendedArtifactName: "attended-release-evidence-candidate-001",
      attendedRecordSha256: "b".repeat(64), releaseTag,
    }), /release tag|input/iu);
  }
  assert.doesNotThrow(() => validateTerminalSealDocument(terminal));
  for (const suffix of [" && true", "; true", " | tee proof", " > proof", " `true`", " $(true)"]) {
    assert.throws(() => validateTerminalSealDocument(
      terminal.replace(/npm run verify:release:phase5[^\n]*/u, (command) => `${command}${suffix}`),
    ), /exact|metacharacter|executable|command/iu);
  }
  assert.match(terminal, /promotion[^\n]+complete/iu);
  assert.match(terminal, /promotion-proof/iu);
  assert.match(promotion, /promotion-proof\.json/iu);
  assert.match(promotion, /upload-artifact/iu);
  assert.equal((promotion.match(/record-phase5-promotion-proof\.mjs/gu) ?? []).length, 1);
  assert.equal((promotion.match(/name:\s*promotion-proof-\$\{\{ github\.run_id \}\}/gu) ?? []).length, 1);
  const packageSource = readFileSync(path.join(projectRoot, "package.json"), "utf8");
  assert.equal((packageSource.match(/"record:promotion:phase5"/gu) ?? []).length, 1);
  assert.throws(() => validatePromotionWorkflowContract(
    promotion.replace(
      '.id == $run_id and .status == "completed" and .conclusion == "success"',
      '.id == $run_id and .status == "completed" and .conclusion == "failure"',
    ),
  ), /successful|run|conclusion/iu);
  assert.throws(() => validatePromotionWorkflowContract(
    replaceAfterMarker(
      promotion,
      '--argjson run_id "${ATTENDED_RUN_ID}" --arg run_url',
      '.head_sha == $commit',
      '.head_sha != $commit',
    ),
  ), /provenance|run|commit/iu);
  assert.throws(() => validatePromotionWorkflowContract(
    replaceAfterMarker(
      promotion,
      '--argjson run_id "${ATTENDED_RUN_ID}" --arg commit',
      '.workflow_run.id == $run_id and .workflow_run.head_sha == $commit',
      'true',
    ),
  ), /provenance|artifact|run|commit/iu);
  assert.throws(() => validatePromotionWorkflowContract(
    promotion.replace(
      '--argjson run_id "${ATTENDED_RUN_ID}" --arg run_url "${attended_run_url}"',
      '--argjson run_id "${ATTENDED_RUN_ID}" --arg run_url "${candidate_run_url}"',
    ),
  ), /provenance|run|URL/iu);
  assert.throws(() => validatePromotionWorkflowContract(
    promotion.replace(
      `attended_run_attempt=$(jq -er '.run_attempt | select(type == "number" and . >= 1)' <<<"${'${attended_run}'}")`,
      `attended_run_attempt=$(jq -er '.run_attempt | select(type == "number" and . >= 1)' <<<"${'${candidate_run}'}")`,
    ),
  ), /provenance|attempt|ref|run/iu);
  assert.throws(() => validatePromotionWorkflowContract(
    promotion.replace(/gh release view[^\n]+/u, "true"),
  ), /existing|overwrite|release/iu);
  assert.throws(() => validatePromotionWorkflowContract(
    promotion.replace(
      /release_bodies=\$\(gh api --paginate[^\n]*\n\s*--jq[^\n]*\)/u,
      'gh api --paginate "repos/${GITHUB_REPOSITORY}/releases" \
            --jq \'.[].body // ""\' | grep -F "Candidate run: ${candidate_run_id}"',
    ),
  ), /candidate|reuse|API|release/iu);
  assert.throws(() => validatePromotionWorkflowContract(
    promotion.replace("--draft", ""),
  ), /draft|hash|publish/iu);
  assert.throws(() => validateTerminalSealDocument(`${terminal}\n\`\`\`bash\nnpm run build\n\`\`\`\n`),
    /exactly one|executable|build/iu);
});

test("Phase 6 N4 evidence crosses the protected release gate as one exact observation-only artifact", () => {
  const upload = readFileSync(
    path.join(projectRoot, ".github/workflows/release-human-evidence-upload.yml"),
    "utf8",
  );
  for (const pattern of [
    /^\s*phase6_n4_evidence_path:\s*$/mu,
    /^\s*PHASE6_N4_EVIDENCE_PATH:\s*\$\{\{ inputs\.phase6_n4_evidence_path \}\}\s*$/mu,
    /^\s*PHASE6_N4_ARTIFACT_NAME:\s*phase6-n4-evidence-\$\{\{ inputs\.candidate_id \}\}-\$\{\{ github\.run_id \}\}\s*$/mu,
    /gym-tracker-phase6-candidate[\s\S]*phase6-n4-upload[\s\S]*mkdir -p "\$\{phase6_staging_root\}\/phase6"/u,
    /name:\s*\$\{\{ env\.PHASE6_N4_ARTIFACT_NAME \}\}/u,
    /^\s*group:\s*release-human-evidence-upload\s*$/mu,
    /^\s*cancel-in-progress:\s*false\s*$/mu,
  ]) {
    assert.match(upload, pattern);
  }
  for (const file of [
    "checklist.json",
    "observations.json",
    "N4-01.png",
    "N4-02.png",
    "N4-03.png",
    "N4-04.png",
    "attended-record.json",
  ]) {
    assert.match(upload, new RegExp(file.replace(".", "\\."), "u"));
  }
  assert.match(upload, /for phase6_entry in[\s\S]*test -f "\$\{phase6_entry\}"[\s\S]*test ! -L "\$\{phase6_entry\}"[\s\S]*phase6_entry_count=\$\(\(phase6_entry_count \+ 1\)\)[\s\S]*test "\$\{phase6_entry_count\}" -eq 7/u);
  assert.match(upload, /source_file="\$\{phase6_source\}\/\$\{evidence_file\}"[\s\S]*cp --no-dereference "\$\{source_file\}" "\$\{phase6_staging_root\}\/phase6\/\$\{evidence_file\}"/u);
  const phase6Copy = upload.indexOf(
    'cp --no-dereference "${source_file}" "${phase6_staging_root}/phase6/${evidence_file}"',
  );
  const stagedPhase6Validation = upload.indexOf(
    'node workflow-source/scripts/generate-phase6-attended-checklist.mjs verify',
  );
  const phase6Upload = upload.indexOf(
    "name: Upload immutable Phase 6 N4 observation-only evidence",
  );
  assert.equal(phase6Copy >= 0 && phase6Copy < stagedPhase6Validation, true);
  assert.equal(stagedPhase6Validation < phase6Upload, true);
  assert.match(upload, /path:\s*\$\{\{ runner\.temp \}\}\/gym-tracker-phase6-candidate\/evidence\/phase6-n4-upload/u);
  assert.match(upload, /--checklist "\$\{phase6_staging_root\}\/phase6\/checklist\.json"[\s\S]*--observations "\$\{phase6_staging_root\}\/phase6\/observations\.json"[\s\S]*--evidence-dir "\$\{phase6_staging_root\}\/phase6"[\s\S]*--record "\$\{phase6_staging_root\}\/phase6\/attended-record\.json"/u);
  assert.doesNotMatch(upload, /phase6[^\n]*owner[_-]token|owner[_-]token[^\n]*phase6/iu);

  const attended = readFileSync(
    path.join(projectRoot, ".github/workflows/release-attended-evidence.yml"),
    "utf8",
  );
  for (const pattern of [
    /^\s*phase6_evidence_run_id:\s*$/mu,
    /^\s*phase6_evidence_artifact_name:\s*$/mu,
    /^\s*phase6_n4_record_sha256:\s*$/mu,
    /^\s*PHASE6_EVIDENCE_RUN_ID:\s*\$\{\{ inputs\.phase6_evidence_run_id \}\}\s*$/mu,
    /^\s*PHASE6_EVIDENCE_ARTIFACT_NAME:\s*\$\{\{ inputs\.phase6_evidence_artifact_name \}\}\s*$/mu,
    /^\s*PHASE6_N4_RECORD_SHA256:\s*\$\{\{ inputs\.phase6_n4_record_sha256 \}\}\s*$/mu,
  ]) {
    assert.match(attended, pattern);
  }
  assert.equal((attended.match(/^      [a-z0-9_]+:\s*$/gmu) ?? []).length, 10);
  assert.match(
    attended,
    /^  OBSERVATIONS_ARTIFACT_NAME: human-release-observations-\$\{\{ inputs\.candidate_id \}\}-\$\{\{ inputs\.observations_run_id \}\}$/mu,
  );
  assert.match(
    attended,
    /test "\$\{PHASE6_EVIDENCE_ARTIFACT_NAME\}" = "phase6-n4-evidence-\$\{CANDIDATE_ID\}-\$\{PHASE6_EVIDENCE_RUN_ID\}"/u,
  );
  assertDeploymentStatusProvenance(attended, [
    ["CANDIDATE_RUN_ID", "private-release-candidate"],
    ["OBSERVATIONS_RUN_ID", "private-release-observation-upload"],
  ]);
  assert.match(
    attended,
    /verify_deployment_provenance "\$\{PHASE6_EVIDENCE_RUN_ID\}" "\$\{phase6_evidence_run_attempt\}" "\$\{CANDIDATE_COMMIT\}" "\$\{phase6_evidence_ref\}" "private-release-observation-upload"/u,
  );

  const phase6RunValidation = attended.slice(
    attended.indexOf('jq -e --argjson run_id "${PHASE6_EVIDENCE_RUN_ID}"'),
    attended.indexOf('<<<"${phase6_evidence_run}" >/dev/null')
      + '<<<"${phase6_evidence_run}" >/dev/null'.length,
  );
  assert.notEqual(phase6RunValidation.length, 0);
  for (const predicate of [
    '.id == $run_id',
    '.status == "completed"',
    '.conclusion == "success"',
    '.html_url == $run_url',
    '.head_sha == $commit',
    '.head_branch == "main"',
    '.repository.full_name == $repo',
    '.event == "workflow_dispatch"',
    '.path == ".github/workflows/release-human-evidence-upload.yml"',
  ]) {
    assert.match(phase6RunValidation, new RegExp(predicate.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }

  const phase6ArtifactValidation = attended.slice(
    attended.indexOf('repos/${GITHUB_REPOSITORY}/actions/runs/${PHASE6_EVIDENCE_RUN_ID}/artifacts'),
    attended.indexOf('<<<"${phase6_evidence_artifacts}" >/dev/null')
      + '<<<"${phase6_evidence_artifacts}" >/dev/null'.length,
  );
  assert.notEqual(phase6ArtifactValidation.length, 0);
  for (const predicate of [
    '.name == $name',
    '.expired == false',
    '.workflow_run.id == $run_id',
    '.workflow_run.head_sha == $commit',
    '| length == 1',
  ]) {
    assert.ok(phase6ArtifactValidation.includes(predicate), `missing Phase 6 artifact predicate: ${predicate}`);
  }

  assert.equal(
    (attended.match(/gh run download "\$\{PHASE6_EVIDENCE_RUN_ID\}"/gu) ?? []).length,
    1,
  );
  assert.match(
    attended,
    /printf '%s  %s\\n' "\$\{PHASE6_N4_RECORD_SHA256\}" [^\n]*phase6\/attended-record\.json \| sha256sum --check/u,
  );
  assert.match(attended, /for evidence_file in checklist\.json observations\.json N4-01\.png N4-02\.png N4-03\.png N4-04\.png attended-record\.json/u);
  for (const file of ["checklist.json", "observations.json", "attended-record.json"]) {
    assert.match(attended, new RegExp(`phase6/${file.replace(".", "\\.")}`, "u"));
  }
  assert.doesNotMatch(attended, /(?:prepare|record):attended:phase6/iu);
  const phase6Verifier = attended.indexOf("npm run verify:attended:phase6");
  const ownerApproval = attended.indexOf('test "${OWNER_TOKEN}" = "approved"');
  const phase5Recorder = attended.indexOf("npm run record:attended:phase5");
  assert.equal(
    phase6Verifier >= 0 && phase6Verifier < ownerApproval && ownerApproval < phase5Recorder,
    true,
  );
  for (const command of [
    "npm run prepare:attended:phase5",
    "npm run record:attended:phase5",
    "npm run verify:attended:phase5",
  ]) {
    const start = attended.indexOf(command);
    const end = attended.indexOf("\n\n", start);
    const block = attended.slice(start, end < 0 ? undefined : end);
    for (const argument of [
      '--phase6-n4-record retained-candidate/evidence/phase6-n4-upload/phase6/attended-record.json',
      '--phase6-n4-checklist retained-candidate/evidence/phase6-n4-upload/phase6/checklist.json',
      '--phase6-n4-observations retained-candidate/evidence/phase6-n4-upload/phase6/observations.json',
      '--phase6-n4-evidence-dir retained-candidate/evidence/phase6-n4-upload/phase6',
      '--phase6-n4-run-id "${PHASE6_EVIDENCE_RUN_ID}"',
      '--phase6-n4-artifact-name "${PHASE6_EVIDENCE_ARTIFACT_NAME}"',
    ]) {
      assert.ok(block.includes(argument), `${command} is missing ${argument}`);
    }
  }
});
