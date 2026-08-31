import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

async function load(relativePath) {
  return import(pathToFileURL(path.join(projectRoot, relativePath)).href);
}

function fixtureCandidate() {
  return {
    manifest_sha256: SHA_A,
    manifest: {
      candidate_id: "phase6-candidate",
      source: {
        commit: "c".repeat(40),
        tree_sha256: SHA_B,
        config_sha256: SHA_A,
        package: "com.fchoo.gymtracker",
        version_code: 1,
        version_name: "1.0.0",
      },
      build: { profile: "production" },
      workflow: { repository: "fchoo/gym-tracker", run_id: "1" },
      artifacts: [
        { kind: "apk", file: "gym-tracker-release.apk", sha256: SHA_B, size_bytes: 1 },
        { kind: "aab", file: "gym-tracker-release.aab", sha256: SHA_A, size_bytes: 1 },
      ],
      retained_bundle: { artifact_name: "private-release-candidate-phase6-candidate", retention_days: 30 },
    },
  };
}

function passedReport() {
  return Buffer.from("<testsuites><testsuite><testcase/></testsuite></testsuites>");
}

test("Phase 6 runner requires production candidate identity arguments", async () => {
  const { parsePhase6MaestroArguments } = await load("scripts/run-phase6-maestro.mjs");
  const exact = [
    "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", SHA_A,
    "--package", "com.fchoo.gymtracker",
    "--serial", "emulator-5554",
    "--output", "artifacts/release-candidate/evidence/phase6.json",
    "--report-dir", "artifacts/release-candidate/evidence/maestro",
  ];
  assert.deepEqual(parsePhase6MaestroArguments(exact), {
    bundleDirectory: "artifacts/release-candidate",
    expectedManifestSha256: SHA_A,
    packageName: "com.fchoo.gymtracker",
    serial: "emulator-5554",
    output: "artifacts/release-candidate/evidence/phase6.json",
    reportDirectory: "artifacts/release-candidate/evidence/maestro",
  });
  for (const invalid of [
    exact.slice(2),
    [...exact, "--unknown", "value"],
    exact.map((value) => value === SHA_A ? "not-a-digest" : value),
    exact.map((value) => value === "com.fchoo.gymtracker" ? "com.fchoo.gymtracker.devtest" : value),
    exact.map((value) => value === "emulator-5554" ? "bad serial value" : value),
  ]) {
    assert.throws(() => parsePhase6MaestroArguments(invalid), /Phase 6|argument|identity|manifest|production/u);
  }
});

test("Phase 6 maps every UI consideration and native backstop explicitly", async () => {
  const {
    PHASE6_CONSIDERATION_CONTRACTS,
    PHASE6_MAESTRO_FLOW_CONTRACTS,
    PHASE6_NATIVE_BACKSTOPS,
  } = await load("scripts/run-phase6-maestro.mjs");

  assert.deepEqual(
    PHASE6_CONSIDERATION_CONTRACTS.map(({ id }) => id),
    ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11"],
  );
  assert.deepEqual(
    PHASE6_NATIVE_BACKSTOPS.map(({ id }) => id),
    ["N1", "N2", "N3", "N4"],
  );
  assert.equal(PHASE6_MAESTRO_FLOW_CONTRACTS.length, 3);
  for (const consideration of PHASE6_CONSIDERATION_CONTRACTS) {
    assert.ok(consideration.owner.length > 0);
    assert.ok(consideration.automated_checks.length > 0);
    assert.ok(consideration.flows.length > 0);
    assert.ok(consideration.native_backstops.length > 0);
  }
  assert.equal(
    PHASE6_CONSIDERATION_CONTRACTS.some(({ id, automated_checks }) =>
      id === "C11" && automated_checks.includes("src/ui/__tests__/LibraryScreen.test.tsx")),
    true,
  );
  assert.equal(
    PHASE6_NATIVE_BACKSTOPS.find(({ id }) => id === "N4")?.status,
    "pending_human",
  );
});

test("Phase 6 evidence rejects wrong identity, screenshots, cleanup, and release fields", async () => {
  const {
    createPhase6Evidence,
    validatePhase6Evidence,
  } = await load("scripts/run-phase6-maestro.mjs");
  const candidate = fixtureCandidate();
  const rawReports = Object.fromEntries([
    "phase6-progress-library",
    "phase6-calendar-date-reorder",
    "phase6-navigation-accessibility",
  ].map((id) => [id, passedReport()]));
  const screenshots = Object.fromEntries(Object.keys(rawReports).map((id) => [id, [
    { file: `${id}/complete.png`, sha256: SHA_A },
  ]]));
  const evidence = createPhase6Evidence({
    candidate,
    device: {
      role: "automated-emulator",
      model: "Pixel 7",
      api: 36,
      abi: "x86_64",
      serial_sha256: SHA_A,
      installed_package: "com.fchoo.gymtracker",
      installed_version_code: 1,
      installed_apk_sha256: SHA_B,
    },
    rawReports,
    screenshots,
    fontScaleRestored: true,
  });
  assert.doesNotThrow(() => validatePhase6Evidence(evidence, candidate, rawReports));
  assert.throws(() => validatePhase6Evidence({
    ...evidence,
    device: { ...evidence.device, installed_apk_sha256: SHA_A },
  }, candidate, rawReports), /installed|identity|candidate/u);
  assert.throws(() => validatePhase6Evidence({
    ...evidence,
    flows: evidence.flows.map((flow, index) => index === 0
      ? { ...flow, screenshots: [] }
      : flow),
  }, candidate, rawReports), /screenshot|artifact|evidence/u);
  assert.throws(() => validatePhase6Evidence({
    ...evidence,
    font_scale_restored: false,
  }, candidate, rawReports), /font|cleanup|evidence/u);
  assert.throws(() => validatePhase6Evidence({
    ...evidence,
    release_authorization: "approved",
  }, candidate, rawReports), /authorization|approval|evidence/u);
  assert.throws(() => validatePhase6Evidence({
    ...evidence,
    raw_path: "/private/device/rows.json",
  }, candidate, rawReports), /private|bounded|evidence/u);
});

test("Phase 6 production flows retain exact package, labelled coverage, and screenshot capture", () => {
  const flowExpectations = [
    ["progress-library.yaml", ["Library", "Progress", "Favorite", "takeScreenshot"]],
    ["calendar-date-reorder.yaml", ["Calendar", "takeScreenshot", "swipe"]],
    ["navigation-accessibility.yaml", ["Today", "History and data", "takeScreenshot"]],
  ];
  for (const [file, expected] of flowExpectations) {
    const source = readFileSync(path.join(projectRoot, "maestro/phase6", file), "utf8");
    assert.match(source, /^appId: com\.fchoo\.gymtracker$/mu);
    assert.doesNotMatch(source, /devtest|placeholder|approval|promotion|terminal seal/iu);
    for (const text of expected) {
      assert.ok(source.includes(text), `${file} is missing ${text}`);
    }
  }
});

test("Phase 6 Samsung checklist is canonical, exact-byte, and observation-only", async () => {
  const {
    buildPhase6AttendedChecklist,
    serializePhase6AttendedChecklist,
    validatePhase6AttendedChecklist,
  } = await load("scripts/generate-phase6-attended-checklist.mjs");
  const candidate = fixtureCandidate();
  const device = {
    role: "samsung-physical",
    model: "SM-S916B",
    serial_sha256: SHA_A,
    installed_package: "com.fchoo.gymtracker",
    installed_apk_sha256: SHA_B,
  };
  const checklist = buildPhase6AttendedChecklist({
    candidate,
    device,
    generatedAt: "2026-08-31T14:00:00.000Z",
  });
  assert.doesNotThrow(() => validatePhase6AttendedChecklist(checklist, {
    candidate,
    device,
  }));
  assert.equal(
    serializePhase6AttendedChecklist(checklist).toString("utf8"),
    `${JSON.stringify(checklist, null, 2)}\n`,
  );
  assert.throws(() => validatePhase6AttendedChecklist({
    ...checklist,
    release_authorization: "approved",
  }, { candidate, device }), /release|privacy|identity|checklist/u);
});

test("Phase 6 workflow gates the exact production candidate evidence matrix", () => {
  const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const workflow = readFileSync(
    path.join(projectRoot, ".github/workflows/release-candidate.yml"),
    "utf8",
  );
  const manifestSha = "${{ steps.candidate_manifest.outputs.manifest_sha256 }}";
  const exactRunner = [
    "npm run test:maestro:phase6",
    "--",
    "--bundle-dir artifacts/release-candidate",
    `--manifest-sha256 "${manifestSha}"`,
    "--package com.fchoo.gymtracker",
    "--serial emulator-5554",
    "--output artifacts/release-candidate/evidence/phase6.json",
    "--report-dir artifacts/release-candidate/evidence/phase6-maestro",
  ].join(" ");

  assert.equal(
    packageJson.scripts["test:evidence:phase6"],
    "node --test scripts/phase6-evidence-scripts.test.mjs",
  );
  assert.ok(workflow.includes("npm run test:evidence:phase6"));
  assert.ok(workflow.includes(exactRunner));
});
