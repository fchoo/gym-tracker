import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  pathToFileURL,
} from "node:url";

const projectRoot = process.cwd();
const SHA_A = "a".repeat(64);

async function load(relativePath) {
  return import(pathToFileURL(path.join(projectRoot, relativePath)).href);
}

function writeFixtureBundle(directory) {
  const apk = path.join(directory, "gym-tracker-phase6-gesture-smoke-devtest.apk");
  const apkBytes = Buffer.from("phase-6-gesture-apk");
  writeFileSync(apk, apkBytes);
  const manifest = {
    schema_version: 1,
    suite: "phase6-gesture-smoke",
    profile: "development-test",
    package: "com.fchoo.gymtracker.devtest",
    apk: {
      path: apk,
      sha256: createHash("sha256").update(apkBytes).digest("hex"),
    },
    installed_apk: {
      sha256: createHash("sha256").update(apkBytes).digest("hex"),
      matches_retained_apk: true,
    },
    package_launch: { succeeded: true },
  };
  const manifestPath = path.join(directory, "build.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    manifest,
    manifestSha256: createHash("sha256").update(readFileSync(manifestPath)).digest("hex"),
  };
}

test("Phase 6 runner requires exact generated-native identity arguments", async () => {
  const { parsePhase6MaestroArguments } = await load(
    "scripts/run-phase6-maestro.mjs",
  );
  const exact = [
    "--bundle-dir", "artifacts/native/phase6-gesture-smoke",
    "--manifest-sha256", SHA_A,
    "--package", "com.fchoo.gymtracker.devtest",
    "--serial", "emulator-5554",
    "--output", "artifacts/native/phase6-gesture-smoke/evidence/gesture-smoke.json",
    "--report-dir", "artifacts/native/phase6-gesture-smoke/evidence/maestro",
    "--flow", "gesture-smoke",
  ];
  assert.deepEqual(parsePhase6MaestroArguments(exact), {
    bundleDirectory: "artifacts/native/phase6-gesture-smoke",
    expectedManifestSha256: SHA_A,
    packageName: "com.fchoo.gymtracker.devtest",
    serial: "emulator-5554",
    output: "artifacts/native/phase6-gesture-smoke/evidence/gesture-smoke.json",
    reportDirectory: "artifacts/native/phase6-gesture-smoke/evidence/maestro",
    flow: "gesture-smoke",
  });
  for (const invalid of [
    exact.slice(2),
    [...exact, "--unknown", "value"],
    exact.map((value) => value === SHA_A ? "not-a-digest" : value),
    exact.map((value) => value === "com.fchoo.gymtracker.devtest" ? "not a package" : value),
    exact.map((value) => value === "emulator-5554" ? "bad serial value" : value),
    exact.map((value) => value === "gesture-smoke" ? "placeholder" : value),
  ]) {
    assert.throws(() => parsePhase6MaestroArguments(invalid), /Phase 6|argument|identity|manifest|flow/u);
  }
});

test("Phase 6 runner validates candidate/install identity and records only bounded evidence", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase6-runner-"));
  try {
    const {
      loadPhase6GestureCandidate,
      validatePhase6GestureEvidence,
    } = await load("scripts/run-phase6-maestro.mjs");
    const bundleDirectory = path.join(temporaryDirectory, "bundle");
    mkdirSync(bundleDirectory);
    const fixture = writeFixtureBundle(bundleDirectory);
    const candidate = loadPhase6GestureCandidate({
      bundleDirectory,
      expectedManifestSha256: fixture.manifestSha256,
      packageName: fixture.manifest.package,
    });
    assert.equal(candidate.manifest.package, fixture.manifest.package);
    assert.throws(() => loadPhase6GestureCandidate({
      bundleDirectory,
      expectedManifestSha256: SHA_A,
      packageName: fixture.manifest.package,
    }), /manifest|digest|identity/u);

    const rawReport = Buffer.from("<testsuites><testsuite><testcase/></testsuite></testsuites>");
    const evidence = {
      schema_version: 1,
      suite: "phase6-gesture-smoke",
      status: "passed",
      mode: "automated-only",
      approval_status: "evidence_pending",
      attended_scope: "excluded",
      producer: "phase6-maestro/v1",
      candidate: {
        manifest_sha256: fixture.manifestSha256,
        package: fixture.manifest.package,
        apk_sha256: fixture.manifest.apk.sha256,
      },
      device: {
        serial_sha256: SHA_A,
        installed_package: fixture.manifest.package,
        installed_apk_sha256: fixture.manifest.apk.sha256,
      },
      flow: {
        id: "gesture-smoke",
        raw_report_file: "gesture-smoke.xml",
        raw_report_sha256: createHash("sha256").update(rawReport).digest("hex"),
        tests: 1,
        failures: 0,
        errors: 0,
        skipped: 0,
      },
      font_scale_restored: true,
    };
    assert.doesNotThrow(() => validatePhase6GestureEvidence(
      evidence, candidate, rawReport,
    ));
    assert.throws(() => validatePhase6GestureEvidence({
      ...evidence,
      device: { ...evidence.device, installed_apk_sha256: SHA_A },
    }, candidate, rawReport), /installed|identity|candidate/u);
    assert.throws(() => validatePhase6GestureEvidence({
      ...evidence,
      raw_path: "/private/runtime/row.json",
    }, candidate, rawReport), /bounded|evidence|private/u);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("Phase 6 flow performs horizontal swipe and long-press displacement checks", () => {
  const flow = readFileSync(path.join(
    projectRoot, "maestro/phase6/gesture-smoke.yaml",
  ), "utf8");
  assert.match(flow, /^appId: com\.fchoo\.gymtracker\.devtest$/mu);
  assert.match(flow, /swipe:[\s\S]*start: 80%, 50%[\s\S]*end: 20%, 50%/u);
  assert.match(flow, /longPressOn:[\s\S]*id: drag-/u);
  assert.match(flow, /assertVisible: "Held row displaced"/u);
  assert.doesNotMatch(flow, /__phase2-attended-preview|placeholder/iu);
});
