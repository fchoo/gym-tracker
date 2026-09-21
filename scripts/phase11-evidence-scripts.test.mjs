import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PHASE11_EVIDENCE_MATRIX,
  PHASE11_FIXTURE_PASSWORD,
  PHASE11_MAESTRO_FLOW_CONTRACTS,
  createPhase11FixtureArchives,
  deriveLogicalBackupTableNames,
  derivePortableMergeCaseIds,
  validatePhase11Evidence,
  validatePhase11Manifest,
  validatePhase11SqliteBackstop,
} from "./run-phase11-maestro.mjs";

const projectRoot = process.cwd();
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const HEAD_A = "1".repeat(40);
const HEAD_B = "2".repeat(40);

function manifestFixture(overrides = {}) {
  return {
    schema_version: 1,
    suite: "phase11",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: HEAD_A,
    source_tree_sha256: SHA_A,
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: "artifacts/native/phase11/gym-tracker-phase11-devtest.apk",
      sha256: SHA_B,
      size_bytes: 123,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: {
      device_path: "/data/app/base.apk",
      sha256: SHA_B,
      matches_retained_apk: true,
    },
    device: {
      serial: "emulator-5554",
      api: 36,
      abi: "arm64-v8a",
      model: "sdk_gphone64_arm64",
      android_release: "16",
    },
    ...overrides,
  };
}

function sqliteBackstop(manifest = manifestFixture()) {
  const cases = derivePortableMergeCaseIds();
  return {
    schema_version: 1,
    suite: "portable-merge",
    status: "passed",
    build_manifest: "artifacts/native/phase11/build.json",
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: manifest.installed_apk,
    device: manifest.device,
    contract: {
      expected_count: cases.length,
      total: cases.length,
      passed: cases.length,
      failed: 0,
      skipped: 0,
      cases: cases.map((id) => ({
        id,
        status: "passed",
        durationMs: 1,
      })),
    },
  };
}

function identity(manifest = manifestFixture()) {
  return {
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk_sha256: manifest.apk.sha256,
    installed_apk_sha256: manifest.installed_apk.sha256,
    device: manifest.device,
  };
}

function flowSnapshot() {
  return PHASE11_MAESTRO_FLOW_CONTRACTS.map((contract, index) => ({
    ...contract,
    sha256: `${index + 1}`.repeat(64),
  }));
}

function completeEvidence(manifest = manifestFixture()) {
  const flows = flowSnapshot();
  const sqlite = validatePhase11SqliteBackstop(sqliteBackstop(manifest), manifest);
  return {
    schema_version: 1,
    suite: "phase11",
    status: "passed",
    producer: "phase11-maestro/v1",
    build_manifest: "artifacts/native/phase11/build.json",
    identity: identity(manifest),
    sqlite_backstop: sqlite,
    matrix: PHASE11_EVIDENCE_MATRIX,
    fixtures: [
      {
        id: "phase11-restore-base",
        role: "restore-clean-base",
        file: "phase11-restore-base.gtbk",
        sha256: SHA_A,
        size_bytes: 128,
        snapshot_id: "phase11-restore-base",
        total_rows: 8,
      },
      {
        id: "phase11-merge-fixture",
        role: "merge-import",
        file: "phase11-merge-fixture.gtbk",
        sha256: SHA_B,
        size_bytes: 128,
        snapshot_id: "phase11-merge-fixture",
        total_rows: 8,
      },
    ],
    flows: flows.map((contract) => ({
      id: contract.id,
      flow: contract.flow,
      stage: contract.stage,
      coverage: contract.coverage,
      flow_sha256: contract.sha256,
      report_sha256: SHA_C,
      tests: 1,
      failures: 0,
      errors: 0,
      skipped: 0,
    })),
  };
}

test("Phase 11 runner declares Data and recovery flows and evidence matrix", () => {
  assert.deepEqual(
    PHASE11_MAESTRO_FLOW_CONTRACTS.map(({ id, stage, flow }) => ({ id, stage, flow })),
    [
      {
        id: "phase11-data-recovery-navigation",
        stage: "navigation-cancel",
        flow: "maestro/phase11/portable-merge.yaml",
      },
      {
        id: "phase11-restore-clean-fixture",
        stage: "restore-clean-fixture",
        flow: "maestro/phase11/portable-merge.yaml",
      },
      {
        id: "phase11-merge-review-cancel",
        stage: "merge-review-cancel",
        flow: "maestro/phase11/portable-merge.yaml",
      },
      {
        id: "phase11-merge-commit-relaunch",
        stage: "merge-commit-relaunch",
        flow: "maestro/phase11/portable-merge.yaml",
      },
    ],
  );
  assert.deepEqual(
    PHASE11_EVIDENCE_MATRIX.map(({ id }) => id),
    [
      "D-01",
      "D-02",
      "D-03",
      "D-04",
      "DATA-08",
      "DATA-09",
      "UI-role-name-state",
      "UI-focus-dpad",
      "UI-minimum-target",
      "UI-non-color",
    ],
  );
  const byId = new Map(PHASE11_EVIDENCE_MATRIX.map((entry) => [entry.id, entry]));
  assert.equal(byId.get("DATA-08")?.sqlite_backstop, "portable-merge");
  assert.equal(byId.get("DATA-09")?.sqlite_backstop, "portable-merge");
  assert.match(byId.get("D-02")?.source ?? "", /mergePlan\.test/u);
});

test("Phase 11 manifest and SQLite backstop fail closed on stale or incomplete evidence", () => {
  const manifest = manifestFixture();

  assert.doesNotThrow(() => validatePhase11Manifest(
    manifest,
    "/tmp/gym-tracker-phase11-devtest.apk",
    SHA_B,
    { currentHead: HEAD_A, currentSourceSha256: SHA_A },
  ));
  assert.throws(() => validatePhase11Manifest(
    { ...manifest, suite: "phase10" },
    "/tmp/gym-tracker-phase11-devtest.apk",
    SHA_B,
  ), /Phase 11 development-test/u);
  assert.throws(() => validatePhase11Manifest(
    manifest,
    "/tmp/gym-tracker-phase11-devtest.apk",
    SHA_A,
    { currentHead: HEAD_A, currentSourceSha256: SHA_A },
  ), /APK bytes/u);
  assert.throws(() => validatePhase11Manifest(
    manifest,
    "/tmp/gym-tracker-phase11-devtest.apk",
    SHA_B,
    { currentHead: HEAD_B, currentSourceSha256: SHA_A },
  ), /current source/u);
  assert.throws(() => validatePhase11Manifest(
    manifest,
    "/tmp/gym-tracker-phase11-devtest.apk",
    SHA_B,
    { currentHead: HEAD_A, currentSourceSha256: SHA_C },
  ), /current source/u);

  assert.deepEqual(validatePhase11SqliteBackstop(sqliteBackstop(manifest), manifest), {
    suite: "portable-merge",
    expected_count: derivePortableMergeCaseIds().length,
    total: derivePortableMergeCaseIds().length,
    passed: derivePortableMergeCaseIds().length,
    failed: 0,
    skipped: 0,
  });
  assert.throws(() => validatePhase11SqliteBackstop({
    ...sqliteBackstop(manifest),
    contract: { ...sqliteBackstop(manifest).contract, expected_count: 1 },
  }, manifest), /SQLite backstop/u);
  assert.throws(() => validatePhase11SqliteBackstop({
    ...sqliteBackstop(manifest),
    source_tree_sha256: SHA_C,
  }, manifest), /SQLite backstop/u);
});

test("Phase 11 evidence rejects missing flow, fixture, or matrix entries", () => {
  const manifest = manifestFixture();
  const evidence = completeEvidence(manifest);
  const expected = {
    identity: identity(manifest),
    sqliteBackstop: validatePhase11SqliteBackstop(sqliteBackstop(manifest), manifest),
    flows: flowSnapshot(),
  };

  assert.equal(validatePhase11Evidence(evidence, expected), evidence);
  assert.throws(() => validatePhase11Evidence({
    ...evidence,
    flows: evidence.flows.slice(1),
  }, expected), /identity or matrix/u);
  assert.throws(() => validatePhase11Evidence({
    ...evidence,
    fixtures: evidence.fixtures.slice(1),
  }, expected), /identity or matrix/u);
  assert.throws(() => validatePhase11Evidence({
    ...evidence,
    matrix: PHASE11_EVIDENCE_MATRIX.filter(({ id }) => id !== "D-04"),
  }, expected), /identity or matrix/u);
  assert.throws(() => validatePhase11Evidence({
    ...evidence,
    flows: [{ ...evidence.flows[0], failures: 1 }, ...evidence.flows.slice(1)],
  }, expected), /flow is invalid/u);
});

test("Phase 11 fixture archives are encrypted GTBK v2 payloads without raw rows or paths", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "phase11-fixtures-"));
  try {
    const fixtures = createPhase11FixtureArchives({
      directory,
      localDate: "2026-09-21",
    });

    assert.deepEqual(fixtures.map(({ id }) => id), [
      "phase11-restore-base",
      "phase11-merge-fixture",
    ]);
    for (const fixture of fixtures) {
      const bytes = readFileSync(fixture.path);
      assert.equal(bytes.subarray(0, 4).toString("utf8"), "GTBK");
      assert.equal(bytes[4], 2);
      assert.equal(fixture.sha256, createHash("sha256").update(bytes).digest("hex"));
      assert.equal(fixture.file.endsWith(".gtbk"), true);
      assert.equal(fixture.total_rows, 8);
      assert.notEqual(bytes.toString("utf8").includes("phase11-archive-session"), true);
      assert.notEqual(bytes.toString("utf8").includes("Local Merge Baseline"), true);
    }
    assert.equal(PHASE11_FIXTURE_PASSWORD, "phase11-merge-password");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Phase 11 flow exercises the split UI without claiming database rollback proof", () => {
  const flow = readFileSync(
    path.join(projectRoot, "maestro/phase11/portable-merge.yaml"),
    "utf8",
  );

  assert.match(flow, /^appId: com\.fchoo\.gymtracker\.devtest$/mu);
  assert.match(flow, /PHASE11_STAGE == 'navigation-cancel'/u);
  assert.match(flow, /PHASE11_STAGE == 'restore-clean-fixture'/u);
  assert.match(flow, /PHASE11_STAGE == 'merge-review-cancel'/u);
  assert.match(flow, /PHASE11_STAGE == 'merge-commit-relaunch'/u);
  assert.match(
    flow,
    /PHASE11_STAGE == 'merge-commit-relaunch'[\s\S]*?launchApp:[\s\S]*?clearState: false[\s\S]*?tapOn: "Settings"[\s\S]*?scrollUntilVisible:[\s\S]*?id: "more-data-and-recovery"[\s\S]*?tapOn:[\s\S]*?id: "more-data-and-recovery"/u,
  );
  assert.equal(
    (flow.match(/scrollUntilVisible:[\s\S]{0,140}?id: "more-data-and-recovery"/gu) ?? []).length,
    4,
  );
  assert.match(flow, /Latest backup: Never exported/u);
  assert.match(flow, /Restore clean/u);
  assert.match(flow, /Import \/ merge backup/u);
  assert.match(
    flow,
    /assertNotVisible: "Review restore clean"[\s\S]*?scrollUntilVisible:[\s\S]*?text: "Export CSV"[\s\S]*?assertVisible: "Export CSV"/u,
  );
  assert.match(flow, /phase11-restore-base\.gtbk/u);
  assert.match(flow, /phase11-merge-fixture\.gtbk/u);
  assert.match(flow, /No changes have been made yet\./u);
  for (const label of [
    "Records inserted",
    "Duplicates unchanged",
    "Archive wins",
    "Local wins",
    "Kept both",
    "Remapped IDs",
    "Conflicts",
  ]) {
    assert.match(flow, new RegExp(label, "u"));
  }
  assert.match(flow, /inputText: "merge"[\s\S]*?eraseText: 5[\s\S]*?inputText: "MERGE"/u);
  assert.match(flow, /Cancel merge/u);
  assert.match(flow, /Merge complete\. Search and progress are ready\./u);
  assert.match(flow, /Local Merge Baseline · Base Day/u);
  assert.match(flow, /Imported Merge Session · Imported Day/u);
  assert.doesNotMatch(flow, /Google|Drive|sync|raw rows|SQL/iu);

  const runner = readFileSync(
    path.join(projectRoot, "scripts/run-phase11-maestro.mjs"),
    "utf8",
  );
  assert.match(runner, /PHASE11_BACKUP_PASSWORD=/u);
  assert.match(runner, /createPhase11FixtureArchives/u);
  assert.match(runner, /validatePhase11SqliteBackstop/u);
  assert.match(runner, /current source does not match the Phase 11 manifest/u);
});

test("Phase 11 package script exposes the manifest-bound runner", () => {
  const packageJson = JSON.parse(readFileSync(
    path.join(projectRoot, "package.json"),
    "utf8",
  ));

  assert.equal(
    packageJson.scripts["test:maestro:phase11"],
    "node scripts/run-phase11-maestro.mjs",
  );
});

test("Phase 11 runner derives contract IDs and backup tables from source", () => {
  assert.equal(derivePortableMergeCaseIds().length, 12);
  assert.deepEqual(
    deriveLogicalBackupTableNames().slice(0, 3),
    ["app_settings", "exercise_aliases", "exercise_library_entries"],
  );
  assert.ok(deriveLogicalBackupTableNames().includes("portable_owner_identity"));
});
