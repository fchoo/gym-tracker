import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";
import {
  collectPhase2SourceLedger,
  executePhase2VerifierCli,
} from "./verify-phase2-native-evidence.mjs";
import {
  buildPhase2AttendedChecklist,
  buildPhase2AttendedDevice,
  buildPhase2AttendedRoleRecord,
  derivePhase2AttendedChecklistRows,
  discoverPhase2AttendedDevices,
  PHASE2_ATTENDED_PREVIEW_SCENARIOS,
  parsePhase2AttendedChecklistArgs,
  parsePhase2AttendedChecklistBytes,
  parsePhase2AttendedRecordArgs,
  parseSingleInstalledApkPath,
  runPhase2AttendedChecklistCli,
  runPhase2AttendedRecordCli,
  resolvePhase2AttendedPaths,
  validatePhase2AttendedChecklistRows,
  validatePhase2AttendedRoleRecord,
  validatePhase2AttendedDeviceMetadata,
  validatePhase2AttendedManifest,
  writePhase2AttendedChecklistAtomic,
} from "./generate-phase2-attended-checklist.mjs";
import {
  PHASE2_ATTENDED_PREVIEW_REGISTRY,
  PHASE2_ATTENDED_PREVIEW_ROUTES,
} from "../src/testing/phase2AttendedPreviewFixtures.ts";

const projectRoot = process.cwd();
const packageName = "com.fchoo.gymtracker.devtest";
const previewScenarios = new Map(
  Object.entries(PHASE2_ATTENDED_PREVIEW_SCENARIOS),
);

function previewUrls(sourceKey) {
  const scenario = previewScenarios.get(sourceKey);
  assert.ok(scenario, sourceKey);
  const base = `gymtracker-devtest://__phase2-attended-preview?scenario=${scenario}`;
  return PHASE2_ATTENDED_PREVIEW_ROUTES
    .filter((route) => route.scenario === scenario)
    .map(({ variant }) => variant === null ? base : `${base}&variant=${variant}`);
}

function manifestFixture() {
  return {
    schema_version: 1,
    suite: "phase2",
    profile: "development-test",
    build_variant: "release",
    js_bundle: { embedded: true },
    base_head: "a".repeat(40),
    source_tree_sha256: "b".repeat(64),
    package: packageName,
    apk: {
      path: "artifacts/native/phase2/gym-tracker-phase2-devtest.apk",
      sha256: "c".repeat(64),
      size_bytes: 4,
      page_alignment_kib: 16,
      page_alignment_verified: true,
    },
    installed_apk: {
      device_path: "/data/app/base.apk",
      sha256: "c".repeat(64),
      matches_retained_apk: true,
    },
    device: {
      serial: "emulator-5554",
      api: 36,
      abi: "arm64-v8a",
      model: "sdk_gphone64_arm64",
    },
  };
}

function deviceFixture(role, serial) {
  return buildPhase2AttendedDevice({
    role,
    serial,
    model: role === "samsung-physical"
      ? "SM-S916B"
      : "sdk_gphone64_arm64",
    api: 36,
    abi: "arm64-v8a",
    installedSha256: "c".repeat(64),
  }, manifestFixture());
}

async function createTrustedCliFixture(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
  const outsideDirectory = await mkdtemp(path.join(
    tmpdir(),
    `${prefix}-outside-`,
  ));
  const artifactDirectory = path.join(directory, "artifacts/native/phase2");
  const attendedDirectory = path.join(artifactDirectory, "attended");
  const manifestPath = path.join(artifactDirectory, "build.json");
  const apkPath = path.join(artifactDirectory, "gym-tracker-phase2-devtest.apk");
  const emulatorSerial = "emulator-private-serial";
  const samsungSerial = "samsung-private-serial";
  await mkdir(attendedDirectory, { recursive: true });
  await writeFile(path.join(directory, ".gitignore"), "artifacts/native/\n");
  await writeFile(path.join(directory, "fixture.txt"), "source\n");
  execFileSync("git", ["init", "-q"], { cwd: directory });
  execFileSync("git", ["add", ".gitignore", "fixture.txt"], {
    cwd: directory,
  });
  execFileSync("git", [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  ], { cwd: directory });
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: directory,
    encoding: "utf8",
  }).trim();
  const apkBytes = Buffer.from("same-apk-bytes");
  const apkSha256 = createHash("sha256").update(apkBytes).digest("hex");
  await writeFile(apkPath, apkBytes);
  const manifest = {
    ...manifestFixture(),
    base_head: head,
    source_tree_sha256: sourceTreeSha256(directory),
    apk: {
      ...manifestFixture().apk,
      sha256: apkSha256,
      size_bytes: apkBytes.length,
    },
    installed_apk: {
      device_path: "/data/app/base.apk",
      sha256: apkSha256,
      matches_retained_apk: true,
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const calls = [];
  const fakeExec = (file, commandArgs, options) => {
    if (file === "git"
      && commandArgs[0] === "status"
      && commandArgs.includes("--untracked-files=no")) {
      return "";
    }
    if (file === "git") return execFileSync(file, commandArgs, options);
    calls.push(commandArgs);
    const serial = commandArgs[1];
    const command = commandArgs.slice(2).join(" ");
    if (command === "get-state") return "device\n";
    if (command === "shell getprop ro.product.model") {
      return serial === emulatorSerial
        ? "sdk_gphone64_arm64\n"
        : "SM-S916B\n";
    }
    if (command === "shell getprop ro.build.version.sdk") {
      return serial === emulatorSerial ? "36\n" : "34\n";
    }
    if (command === "shell getprop ro.product.cpu.abi") {
      return serial === emulatorSerial ? "arm64-v8a\n" : "armeabi-v7a\n";
    }
    if (command === "shell getprop ro.kernel.qemu") {
      return serial === emulatorSerial ? "1\n" : "0\n";
    }
    if (command.startsWith("install -r ")) return "Success\n";
    if (command === `shell pm path ${packageName}`) {
      return "package:/data/app/base.apk\n";
    }
    if (command === "exec-out cat /data/app/base.apk") return apkBytes;
    throw new Error(`unexpected fake command: ${command}`);
  };
  const checklistArgs = [
    "--manifest",
    "artifacts/native/phase2/build.json",
    "--emulator-serial",
    emulatorSerial,
    "--samsung-serial",
    samsungSerial,
    "--output",
    "artifacts/native/phase2/attended/checklist.pending.json",
  ];
  const recordArgs = [
    "--manifest",
    "artifacts/native/phase2/build.json",
    "--emulator-serial",
    emulatorSerial,
    "--samsung-serial",
    samsungSerial,
  ];
  const cliOptions = {
    root: directory,
    execFile: fakeExec,
    environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
    collectSourceLedger: async () => ledger,
    log: () => undefined,
  };
  return {
    apkBytes,
    artifactDirectory,
    attendedDirectory,
    calls,
    checklistArgs,
    cliOptions,
    directory,
    manifestPath,
    outsideDirectory,
    recordArgs,
  };
}

async function removeTrustedCliFixture(fixture) {
  await rm(fixture.directory, { force: true, recursive: true });
  await rm(fixture.outsideDirectory, { force: true, recursive: true });
}

function withChecklistSha256(args, bytes) {
  return [
    ...args,
    "--checklist-sha256",
    createHash("sha256").update(bytes).digest("hex"),
  ];
}

function expectedRowIds(ledger) {
  return ledger.attendedRoles.flatMap((role) => [
    ...ledger.remediationRows
      .filter((row) => row.attended_roles.split(", ").includes(role))
      .map((row) => `${role}:remediation:${row.id}`),
    ...ledger.uiTruthRows
      .filter((row) => row.applicability === "required"
        && row.evidence.split("+").includes(role))
      .map((row) => `${role}:ui-truth:${row.surface_id}:${row.truth_id}`),
    ...ledger.prohibitionRows
      .filter((row) => row.attended_roles.split(", ").includes(role))
      .map((row) => `${role}:prohibition:${row.id}`),
  ]);
}

function containsKey(value, key) {
  if (!value || typeof value !== "object") return false;
  return Object.hasOwn(value, key)
    || Object.values(value).some((child) => containsKey(child, key));
}

test("attended checklist derives the exact canonical 82/76 row matrix", async () => {
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const rows = derivePhase2AttendedChecklistRows(ledger);

  assert.equal(rows.length, 158);
  assert.deepEqual(rows.map(({ row_id: rowId }) => rowId), expectedRowIds(ledger));
  assert.equal(rows.filter(({ role }) => role === "emulator-supplementary").length, 82);
  assert.equal(rows.filter(({ role }) => role === "samsung-physical").length, 76);
  assert.equal(new Set(rows.map(({ row_id: rowId }) => rowId)).size, 158);
  assert.ok(rows.every(({ status }) => status === "pending"));
  assert.ok(rows.every((row) => [
    row.setup,
    row.navigation,
    row.action,
    row.expected_observation,
  ].every((instruction) => typeof instruction === "string"
    && instruction.length >= 24
    && !/todo|tbd|same as above/iu.test(instruction))));
  assert.ok(rows.every(({ suggested_observation_code: code }) =>
    /^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(code)
      && !["approved", "generic", "passed", "reviewed"].includes(code)
  ));
  assert.equal(new Set(rows.map(({ suggested_observation_code: code }) => code)).size, 158);
  const cardinalityRows = rows.filter(({ truth_id: truthId }) =>
    truthId === "zero-one-many"
  );
  assert.ok(cardinalityRows.length > 0);
  assert.ok(cardinalityRows.every(({ substeps }) =>
    Array.isArray(substeps) && substeps.length === 3
  ));
  assert.ok(rows.filter(({ truth_id: truthId }) =>
    truthId !== "zero-one-many"
  ).every((row) => !Object.hasOwn(row, "substeps")));
  assert.doesNotThrow(() => validatePhase2AttendedChecklistRows(rows, ledger));
});

test("only the exact 23 unsupported role rows use canonical preview deep links", async () => {
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const rows = derivePhase2AttendedChecklistRows(ledger);
  const previewRows = rows.filter(({ navigation }) =>
    navigation.includes("gymtracker-devtest://__phase2-attended-preview?scenario=")
  );

  assert.equal(previewRows.length, 23);
  for (const row of previewRows) {
    assert.equal(row.kind, "ui-truth");
    const sourceKey = `${row.surface_id}|${row.truth_id}`;
    assert.deepEqual(
      row.navigation.match(
        /gymtracker-devtest:\/\/__phase2-attended-preview\?scenario=[a-z0-9-]+(?:&variant=[a-z0-9-]+)?/gu,
      ) ?? [],
      previewUrls(sourceKey),
    );
    assert.doesNotMatch(row.navigation, /exact heading|scenario slug/iu);
    assert.match(row.navigation, /named production state or control/iu);
  }

  const expectedPreviewRows = ledger.attendedRoles.flatMap((role) =>
    ledger.uiTruthRows
      .filter((row) => row.applicability === "required"
        && row.evidence.split("+").includes(role)
        && previewScenarios.has(`${row.surface_id}|${row.truth_id}`))
      .map((row) => `${role}:${row.surface_id}:${row.truth_id}`)
  );
  assert.deepEqual(
    previewRows.map((row) => `${row.role}:${row.surface_id}:${row.truth_id}`),
    expectedPreviewRows,
  );
  assert.equal(new Set(previewRows.map(({ surface_id: surfaceId, truth_id: truthId }) =>
    `${surfaceId}|${truthId}`)).size, 15);
  assert.equal(new Set(previewScenarios.values()).size, 15);
  assert.deepEqual(
    [...previewScenarios.values()],
    Object.keys(PHASE2_ATTENDED_PREVIEW_REGISTRY),
  );
  assert.ok([...previewScenarios.values()].every((scenario) =>
    /^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(scenario)
  ));
  assert.equal(
    new Set([...previewScenarios.keys()].flatMap(previewUrls)).size,
    PHASE2_ATTENDED_PREVIEW_ROUTES.length,
  );
  const alertError = previewRows.find((row) =>
    row.surface_id === "UI-02-ALERT-SETTINGS" && row.truth_id === "error"
  );
  assert.match(alertError.action, /toggle Rest sound/iu);
  assert.ok(
    alertError.action.indexOf("Appearance and rest-alert settings")
      < alertError.action.indexOf("Rest sound"),
  );
  assert.doesNotMatch(alertError.action, /Retry/u);
  assert.match(alertError.expected_observation, /Rest alert setting was not saved/u);
  const alertLoading = previewRows.find((row) =>
    row.surface_id === "UI-02-ALERT-SETTINGS" && row.truth_id === "loading"
  );
  assert.match(alertLoading.action, /^Using .+ press Appearance and rest-alert settings/iu);
  const exerciseError = previewRows.find((row) =>
    row.surface_id === "UI-02-LIBRARY-EXERCISE-CARD" && row.truth_id === "error"
  );
  for (const label of [
    "barbell",
    "Search exercises",
    "Filter",
    "Origin: Bundled",
    "Show results",
    "Load more exercises",
    "Retry loading more exercises",
  ]) assert.ok(exerciseError.action.includes(label), label);
  assert.ok(exerciseError.action.indexOf("Show results")
    < exerciseError.action.indexOf("Load more exercises"));
  assert.ok(exerciseError.action.indexOf("Load more exercises")
    < exerciseError.action.indexOf("Retry loading more exercises"));
  const exercisePartial = previewRows.find((row) =>
    row.surface_id === "UI-02-LIBRARY-EXERCISE-CARD"
      && row.truth_id === "partial"
  );
  for (const label of [
    "Filter",
    "Visibility: Unavailable",
    "Visibility: Hidden",
    "Visibility: Archived",
    "Show results",
  ]) {
    assert.ok(exercisePartial.action.includes(label), label);
  }
  assert.ok(exercisePartial.action.indexOf("Filter")
    < exercisePartial.action.indexOf("Visibility: Unavailable"));
  assert.ok(exercisePartial.action.indexOf("Visibility: Archived")
    < exercisePartial.action.indexOf("Show results"));
  assert.match(exercisePartial.action, /Load more exercises.*page-retry.*Retry loading more exercises/iu);
  assert.match(exercisePartial.expected_observation, /page-retry/iu);
  const planError = previewRows.find((row) =>
    row.surface_id === "UI-02-LIBRARY-PLAN-CARD" && row.truth_id === "error"
  );
  for (const label of [
    "travel",
    "Search plans",
    "Travel strength draft",
    "Refresh Library",
    "Retry Library refresh",
  ]) assert.ok(planError.action.includes(label), label);
  assert.ok(planError.action.indexOf("Refresh Library")
    < planError.action.indexOf("Retry Library refresh"));
  const planPartial = previewRows.find((row) =>
    row.surface_id === "UI-02-LIBRARY-PLAN-CARD"
      && row.truth_id === "partial"
  );
  assert.equal(
    planPartial.expected_observation,
    ledger.uiTruthRows.find((row) =>
      row.surface_id === "UI-02-LIBRARY-PLAN-CARD"
        && row.truth_id === "partial"
    ).reason_or_expectation,
  );
  assert.doesNotMatch(planPartial.expected_observation, /in-progress block/iu);
  const calendarCardinality = previewRows.find((row) =>
    row.surface_id === "UI-02-CALENDAR"
      && row.truth_id === "zero-one-many"
  );
  assert.deepEqual(calendarCardinality.substeps.map((step) =>
    step.split(":", 1)[0]), ["Zero", "One", "Many"]);
  assert.match(calendarCardinality.substeps[0], /no day is selected/u);
  assert.match(calendarCardinality.substeps[0], /Confirm is disabled/u);
  assert.match(calendarCardinality.substeps[0], /select an enabled day/u);
  assert.deepEqual(
    calendarCardinality.substeps.map((step) =>
      step.match(/gymtracker-devtest:\/\/__phase2-attended-preview\?scenario=[a-z0-9-]+&variant=[a-z0-9-]+/u)?.[0]),
    previewUrls("UI-02-CALENDAR|zero-one-many"),
  );
  const setMutationLoading = previewRows.find((row) =>
    row.surface_id === "UI-02-SET-MUTATIONS" && row.truth_id === "loading"
  );
  assert.match(
    setMutationLoading.action,
    /for each Add warm-up, Copy previous warm-up, Add working set, and completed-set correction variant, start the named mutation once/iu,
  );
  assert.match(setMutationLoading.action, /duplicate activation is unavailable/u);
  assert.match(setMutationLoading.action, /cardinality stays unchanged/u);
  assert.doesNotMatch(setMutationLoading.action, /Press Add warm-up twice/u);
  for (const url of previewUrls("UI-02-SET-MUTATIONS|loading")) {
    assert.ok(setMutationLoading.navigation.includes(url), url);
  }
  const todayCardinality = previewRows.find((row) =>
    row.surface_id === "UI-02-TODAYS-PLAN"
      && row.truth_id === "zero-one-many"
  );
  assert.deepEqual(
    todayCardinality.substeps.map((step) =>
      step.match(/gymtracker-devtest:\/\/__phase2-attended-preview\?scenario=[a-z0-9-]+&variant=[a-z0-9-]+/u)?.[0]),
    previewUrls("UI-02-TODAYS-PLAN|zero-one-many"),
  );
  assert.match(todayCardinality.substeps[0], /Return to active workout.*Empty workout in progress.*no fabricated/iu);
  assert.match(todayCardinality.substeps[1], /open it for review.*Back Squat.*two working sets/iu);
  assert.match(todayCardinality.substeps[2], /Bench Press.*Reviewing another exercise.*Back Squat.*Return to current exercise/iu);
  const todayLoading = previewRows.find((row) =>
    row.surface_id === "UI-02-TODAYS-PLAN" && row.truth_id === "loading"
  );
  assert.match(todayLoading.expected_observation, /without fabricating.*or mutating/iu);
  const rootRows = previewRows.filter((row) =>
    row.surface_id === "UI-02-ROOT-NAV" && row.truth_id === "loading"
  );
  assert.match(rootRows.find(({ role }) => role === "emulator-supplementary").action, /840dp.*left rail/iu);
  assert.match(rootRows.find(({ role }) => role === "samsung-physical").action, /native compact viewport.*bottom tab bar/iu);
  assert.match(
    rootRows.find(({ role }) => role === "emulator-supplementary")
      .expected_observation,
    /840dp.*expanded left rail/iu,
  );
  assert.match(
    rootRows.find(({ role }) => role === "samsung-physical")
      .expected_observation,
    /Samsung native compact width.*bottom tab bar/iu,
  );
  assert.doesNotMatch(
    rootRows.find(({ role }) => role === "samsung-physical")
      .expected_observation,
    /expanded rail/iu,
  );

  const ordinaryUiRows = rows.filter((row) => row.kind === "ui-truth"
    && !previewRows.includes(row));
  assert.ok(ordinaryUiRows.every(({ navigation }) =>
    navigation.includes("maestro/")
      && !navigation.includes("__phase2-attended-preview")
  ));
});

test("checklist row validation rejects missing, extra, duplicate, generic, and TODO instructions", async () => {
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const rows = derivePhase2AttendedChecklistRows(ledger);
  const clone = () => structuredClone(rows);

  assert.throws(
    () => validatePhase2AttendedChecklistRows(rows.slice(1), ledger),
    /missing|incomplete/u,
  );
  assert.throws(
    () => validatePhase2AttendedChecklistRows([
      ...rows,
      { ...rows[0], row_id: "emulator-supplementary:ui-truth:extra:row" },
    ], ledger),
    /extra|stale/u,
  );
  assert.throws(
    () => validatePhase2AttendedChecklistRows([...rows, rows[0]], ledger),
    /duplicate/u,
  );
  const missingInstruction = clone();
  missingInstruction[0].action = "";
  assert.throws(
    () => validatePhase2AttendedChecklistRows(missingInstruction, ledger),
    /instruction.*missing|missing.*instruction/u,
  );
  const genericInstruction = clone();
  genericInstruction[0].action = "Review this";
  assert.throws(
    () => validatePhase2AttendedChecklistRows(genericInstruction, ledger),
    /generic/u,
  );
  const todoInstruction = clone();
  todoInstruction[0].expected_observation = "TODO inspect this later";
  assert.throws(
    () => validatePhase2AttendedChecklistRows(todoInstruction, ledger),
    /TODO/u,
  );
  const incompleteComposite = clone();
  const compositeIndex = incompleteComposite.findIndex(({ truth_id: truthId }) =>
    truthId === "zero-one-many"
  );
  incompleteComposite[compositeIndex].substeps.pop();
  assert.throws(
    () => validatePhase2AttendedChecklistRows(incompleteComposite, ledger),
    /zero-one-many substeps.*incomplete/u,
  );
  const wrongPreview = clone();
  const previewIndex = wrongPreview.findIndex(({ navigation }) =>
    navigation.includes("__phase2-attended-preview")
  );
  wrongPreview[previewIndex].navigation = wrongPreview[previewIndex].navigation
    .replace(/scenario=[a-z0-9-]+/u, "scenario=wrong-scenario");
  assert.throws(
    () => validatePhase2AttendedChecklistRows(wrongPreview, ledger),
    /preview navigation.*malformed/u,
  );
  const previewOnSupportedRow = clone();
  const ordinaryIndex = previewOnSupportedRow.findIndex(({ kind, navigation }) =>
    kind === "ui-truth" && !navigation.includes("__phase2-attended-preview")
  );
  previewOnSupportedRow[ordinaryIndex].navigation =
    "Open gymtracker-devtest://__phase2-attended-preview?scenario=wrong-scenario and inspect this supported row.";
  assert.throws(
    () => validatePhase2AttendedChecklistRows(previewOnSupportedRow, ledger),
    /preview navigation rows.*stale/u,
  );
  const genericCode = clone();
  genericCode[0].suggested_observation_code = "approved";
  assert.throws(
    () => validatePhase2AttendedChecklistRows(genericCode, ledger),
    /observation code.*generic|generic.*observation code/u,
  );
});

test("manifest validation requires exact current source and retained APK identity", () => {
  const manifest = manifestFixture();
  assert.doesNotThrow(() => validatePhase2AttendedManifest(manifest, {
    currentHead: manifest.base_head,
    currentSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }));
  assert.throws(() => validatePhase2AttendedManifest(manifest, {
    currentHead: "d".repeat(40),
    changedPaths: [".planning/STATE.md"],
    currentSourceSha256: "e".repeat(64),
    implementationSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }), /source digest/u);
  assert.throws(() => validatePhase2AttendedManifest({
    ...manifest,
    package: "com.example.wrong",
  }, {
    currentHead: manifest.base_head,
    currentSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }), /package/u);
  assert.throws(() => validatePhase2AttendedManifest(manifest, {
    currentHead: "d".repeat(40),
    currentSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }), /HEAD|planning metadata/u);
  assert.doesNotThrow(() => validatePhase2AttendedManifest(manifest, {
    currentHead: "d".repeat(40),
    changedPaths: [".planning/STATE.md", ".planning/ROADMAP.md"],
    currentSourceSha256: manifest.source_tree_sha256,
    implementationSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }));
  assert.throws(() => validatePhase2AttendedManifest(manifest, {
    currentHead: "d".repeat(40),
    changedPaths: ["package.json"],
    currentSourceSha256: manifest.source_tree_sha256,
    implementationSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }), /outside planning metadata/u);
  assert.throws(() => validatePhase2AttendedManifest(manifest, {
    currentHead: manifest.base_head,
    currentSourceSha256: "e".repeat(64),
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }), /source/u);
  assert.throws(() => validatePhase2AttendedManifest(manifest, {
    currentHead: manifest.base_head,
    currentSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: "f".repeat(64),
    actualApkSize: manifest.apk.size_bytes,
  }), /APK/u);
  assert.throws(() => validatePhase2AttendedManifest({
    ...manifest,
    installed_apk: {
      ...manifest.installed_apk,
      sha256: "d".repeat(64),
    },
  }, {
    currentHead: manifest.base_head,
    currentSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }), /manifest.*invalid/u);
  assert.throws(() => validatePhase2AttendedManifest({
    ...manifest,
    apk: { ...manifest.apk, size_bytes: 5 },
  }, {
    currentHead: manifest.base_head,
    currentSourceSha256: manifest.source_tree_sha256,
    actualApkSha256: manifest.apk.sha256,
    actualApkSize: manifest.apk.size_bytes,
  }), /APK/u);
});

test("attended devices are role-bound, hash serials, and require installed APK bytes", () => {
  const manifest = manifestFixture();
  const emulator = deviceFixture("emulator-supplementary", "emulator-5554");
  const samsung = deviceFixture("samsung-physical", "R3C123EXAMPLE");

  assert.deepEqual(emulator, {
    model: "sdk_gphone64_arm64",
    api: 36,
    abi: "arm64-v8a",
    serial_sha256: createHash("sha256").update("emulator-5554").digest("hex"),
    installed_sha256: manifest.apk.sha256,
  });
  assert.equal(samsung.model, "SM-S916B");
  assert.ok(!containsKey(emulator, "serial"));
  assert.ok(!containsKey(samsung, "serial"));
  assert.throws(() => buildPhase2AttendedDevice({
    role: "samsung-physical",
    serial: "R3C123EXAMPLE",
    model: "SM-OTHER",
    api: 36,
    abi: "arm64-v8a",
    installedSha256: manifest.apk.sha256,
  }, manifest), /model/u);
  assert.doesNotThrow(() => buildPhase2AttendedDevice({
    role: "samsung-physical",
    serial: "R3C123EXAMPLE",
    model: "SM-S916B",
    api: 35,
    abi: "armeabi-v7a",
    installedSha256: manifest.apk.sha256,
  }, manifest));
  assert.doesNotThrow(() => validatePhase2AttendedDeviceMetadata({
    role: "samsung-physical",
    model: "SM-S916B",
    api: 34,
    abi: "armeabi-v7a",
    qemu: "0",
  }, manifest));
  assert.throws(() => validatePhase2AttendedDeviceMetadata({
    role: "samsung-physical",
    model: "SM-S916B",
    api: 36,
    abi: "arm64-v8a",
    qemu: "1",
  }, manifest), /physical hardware/u);
  assert.doesNotThrow(() => validatePhase2AttendedDeviceMetadata({
    role: "emulator-supplementary",
    model: manifest.device.model,
    api: manifest.device.api,
    abi: manifest.device.abi,
    qemu: "1",
  }, manifest));
  assert.throws(() => buildPhase2AttendedDevice({
    role: "emulator-supplementary",
    serial: "emulator-5554",
    model: "sdk_gphone64_arm64",
    api: 35,
    abi: "arm64-v8a",
    installedSha256: manifest.apk.sha256,
  }, manifest), /API/u);
  assert.throws(() => buildPhase2AttendedDevice({
    role: "emulator-supplementary",
    serial: "emulator-5554",
    model: "sdk_gphone64_arm64",
    api: 36,
    abi: "x86_64",
    installedSha256: manifest.apk.sha256,
  }, manifest), /ABI/u);
  assert.throws(() => buildPhase2AttendedDevice({
    role: "samsung-physical",
    serial: "R3C123EXAMPLE",
    model: "SM-S916B",
    api: 36,
    abi: "arm64-v8a",
    installedSha256: "d".repeat(64),
  }, manifest), /installed APK/u);
  assert.equal(
    parseSingleInstalledApkPath("package:/data/app/base.apk\n", "fixture"),
    "/data/app/base.apk",
  );
  assert.throws(
    () => parseSingleInstalledApkPath(
      "package:/data/app/base.apk\npackage:/data/app/split.apk\n",
      "fixture",
    ),
    /split/u,
  );
});

test("live attended discovery requires one exact device per role without exposing serials", () => {
  const installedBytes = Buffer.from("test");
  const installedSha256 = createHash("sha256").update(installedBytes).digest("hex");
  const manifest = {
    ...manifestFixture(),
    apk: { ...manifestFixture().apk, sha256: installedSha256 },
  };
  const serials = ["private-emulator", "private-samsung"];
  const expectedDevices = {
    "emulator-supplementary": buildPhase2AttendedDevice({
      role: "emulator-supplementary", serial: serials[0],
      model: manifest.device.model, api: manifest.device.api,
      abi: manifest.device.abi, installedSha256,
    }, manifest),
    "samsung-physical": buildPhase2AttendedDevice({
      role: "samsung-physical", serial: serials[1], model: "SM-S916B",
      api: 36, abi: "arm64-v8a", installedSha256,
    }, manifest),
  };
  const fakeExec = (_file, args) => {
    if (args.join(" ") === "devices -l") {
      return `List of devices attached\n${serials[0]}\tdevice product:fixture\n${serials[1]}\tdevice product:fixture\n`;
    }
    const serial = args[1];
    const command = args.slice(2).join(" ");
    if (command === "get-state") return "device\n";
    if (command === "shell getprop ro.kernel.qemu") return serial === serials[0] ? "1\n" : "0\n";
    if (command === "shell getprop ro.product.model") return serial === serials[0] ? `${manifest.device.model}\n` : "SM-S916B\n";
    if (command === "shell getprop ro.build.version.sdk") return "36\n";
    if (command === "shell getprop ro.product.cpu.abi") {
      return serial === serials[0] ? `${manifest.device.abi}\n` : "arm64-v8a\n";
    }
    if (command === `shell pm path ${manifest.package}`) return "package:/data/app/base.apk\n";
    if (command === "exec-out cat /data/app/base.apk") return installedBytes;
    throw new Error(`unexpected command: ${command}`);
  };
  assert.deepEqual(discoverPhase2AttendedDevices({
    manifest, expectedDevices, executable: "adb", execFile: fakeExec,
  }), {
    emulator: expectedDevices["emulator-supplementary"],
    samsung: expectedDevices["samsung-physical"],
  });
  assert.throws(() => discoverPhase2AttendedDevices({
    manifest, expectedDevices, executable: "adb",
    execFile: (file, args, options) => args.join(" ") === "devices -l"
      ? `List of devices attached\n${serials[0]}\tdevice\n${serials[0]}\tdevice\n${serials[1]}\tdevice\n`
      : fakeExec(file, args, options),
  }), (error) => !error.message.includes(serials[0])
    && !error.message.includes(serials[1]) && /duplicate/u.test(error.message));
});

test("pending checklist schema contains no approval and only pending status", async () => {
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const manifest = manifestFixture();
  const checklist = buildPhase2AttendedChecklist({
    manifest,
    manifestPath: "artifacts/native/phase2/build.json",
    sourceLedger: ledger,
    emulator: deviceFixture("emulator-supplementary", "emulator-5554"),
    samsung: deviceFixture("samsung-physical", "R3C123EXAMPLE"),
    generatedAt: "2026-08-23T00:00:00.000Z",
  });

  assert.equal(checklist.schema_version, 1);
  assert.equal(checklist.suite, "phase2");
  assert.equal(checklist.status, "pending");
  assert.equal(checklist.base_head, manifest.base_head);
  assert.equal(checklist.current_planning_head, manifest.base_head);
  assert.equal(checklist.counts.total, 158);
  assert.equal(checklist.counts.by_role["emulator-supplementary"], 82);
  assert.equal(checklist.counts.by_role["samsung-physical"], 76);
  assert.deepEqual(checklist.counts.by_kind, {
    remediation: 32,
    "ui-truth": 122,
    prohibition: 4,
  });
  assert.ok(!containsKey(checklist, "approval"));
  assert.ok(!JSON.stringify(checklist).includes("emulator-5554"));
  assert.ok(!JSON.stringify(checklist).includes("R3C123EXAMPLE"));
  const statuses = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(value, "status")) statuses.push(value.status);
    Object.values(value).forEach(visit);
  };
  visit(checklist);
  assert.deepEqual(new Set(statuses), new Set(["pending"]));
});

test("attended records are exact canonical projections of checklist bytes", async () => {
  const ledger = await collectPhase2SourceLedger(projectRoot);
  const manifest = manifestFixture();
  const checklist = buildPhase2AttendedChecklist({
    manifest,
    manifestPath: "artifacts/native/phase2/build.json",
    sourceLedger: ledger,
    emulator: deviceFixture("emulator-supplementary", "emulator-5554"),
    samsung: deviceFixture("samsung-physical", "R3C123EXAMPLE"),
    generatedAt: "2026-08-23T00:00:00.000Z",
  });
  const bytes = Buffer.from(`${JSON.stringify(checklist, null, 2)}\n`);
  const parsed = parsePhase2AttendedChecklistBytes(bytes, {
    manifest,
    sourceLedger: ledger,
    currentPlanningHead: manifest.base_head,
  });
  const record = buildPhase2AttendedRoleRecord({
    checklist,
    checklistSha256: parsed.sha256,
    role: "emulator-supplementary",
    device: checklist.devices["emulator-supplementary"],
    recordedAt: "2026-08-23T01:00:00.000Z",
  });
  assert.doesNotThrow(() => validatePhase2AttendedRoleRecord(record, {
    checklist,
    checklistSha256: parsed.sha256,
    role: "emulator-supplementary",
  }));
  for (const changed of [
    { ...record, extra: true },
    { ...record, checklist_sha256: "f".repeat(64) },
    { ...record, device: { ...record.device, serial: "raw" } },
    { ...record, rows: record.rows.slice(1) },
    { ...record, rows: record.rows.map((row, index) => index === 0
      ? { ...row, observation_code: "ui-observed" } : row) },
    { ...record, rows: [record.rows[1], record.rows[0], ...record.rows.slice(2)] },
  ]) {
    assert.throws(() => validatePhase2AttendedRoleRecord(changed, {
      checklist,
      checklistSha256: parsed.sha256,
      role: "emulator-supplementary",
    }), /schema|bound|checklist|rows/u);
  }
  const reordered = Buffer.from(`${JSON.stringify({
    suite: checklist.suite,
    schema_version: checklist.schema_version,
    ...Object.fromEntries(Object.entries(checklist).slice(2)),
  }, null, 2)}\n`);
  assert.throws(() => parsePhase2AttendedChecklistBytes(reordered, {
    manifest,
    sourceLedger: ledger,
  }), /schema|canonical/u);
  assert.throws(() => parsePhase2AttendedChecklistBytes(Buffer.concat([bytes, Buffer.from(" ")]), {
    manifest,
    sourceLedger: ledger,
  }), /canonical/u);
});

test("checklist writes replace atomically and preserve prior output on serialization failure", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-checklist-"));
  const output = path.join(directory, "checklist.pending.json");
  try {
    await writeFile(output, "prior\n");
    const circular = { status: "pending" };
    circular.self = circular;
    await assert.rejects(
      writePhase2AttendedChecklistAtomic(output, circular),
      /circular/u,
    );
    assert.equal(await readFile(output, "utf8"), "prior\n");
    assert.deepEqual(await readdir(directory), ["checklist.pending.json"]);

    await writePhase2AttendedChecklistAtomic(output, { status: "pending" });
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), {
      status: "pending",
    });
    assert.deepEqual(await readdir(directory), ["checklist.pending.json"]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("attended paths reject symlink directories and checklist or role files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-attended-paths-"));
  const outside = await mkdtemp(path.join(tmpdir(), "phase2-attended-outside-"));
  const artifactDirectory = path.join(directory, "artifacts/native/phase2");
  const attendedDirectory = path.join(artifactDirectory, "attended");
  try {
    await mkdir(artifactDirectory, { recursive: true });
    await symlink(outside, attendedDirectory, "dir");
    assert.throws(() => resolvePhase2AttendedPaths({ root: directory }), /symlink/u);

    await rm(attendedDirectory);
    await mkdir(attendedDirectory);
    const paths = resolvePhase2AttendedPaths({ root: directory });
    assert.equal(paths.checklistPath, path.join(
      await (await import("node:fs/promises")).realpath(directory),
      "artifacts/native/phase2/attended/checklist.pending.json",
    ));
    for (const filePath of [
      paths.checklistPath,
      paths.emulatorPath,
      paths.samsungPath,
    ]) {
      await symlink(path.join(outside, path.basename(filePath)), filePath);
      assert.throws(() => resolvePhase2AttendedPaths({ root: directory }), /symlink/u);
      await rm(filePath);
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});

test("trusted attended prepare CLI rejects a symlinked canonical build manifest", async () => {
  const fixture = await createTrustedCliFixture("phase2-prepare-manifest-link");
  try {
    const outsideManifest = path.join(fixture.outsideDirectory, "build.json");
    await rename(fixture.manifestPath, outsideManifest);
    await symlink(outsideManifest, fixture.manifestPath, "file");

    await assert.rejects(runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
    }), /manifest.*symlink/iu);
    assert.equal(fixture.calls.length, 0);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("trusted attended prepare publishes immutable checklist bytes and their hash", async () => {
  const fixture = await createTrustedCliFixture("phase2-checklist-immutable");
  const messages = [];
  try {
    await runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
      log: (message) => messages.push(JSON.parse(message)),
    });
    const checklistPath = path.join(
      fixture.attendedDirectory,
      "checklist.pending.json",
    );
    const checklistBytes = await readFile(checklistPath);
    const checklistSha256 = createHash("sha256")
      .update(checklistBytes)
      .digest("hex");
    assert.equal(messages.at(-1).checklist_sha256, checklistSha256);

    await assert.rejects(runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
    }), /checklist.*already exists|refus.*overwrite/iu);
    assert.deepEqual(await readFile(checklistPath), checklistBytes);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("trusted attended record requires the exact approved checklist SHA-256", async () => {
  const fixture = await createTrustedCliFixture("phase2-checklist-approval");
  try {
    await runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
    });
    const checklistBytes = await readFile(path.join(
      fixture.attendedDirectory,
      "checklist.pending.json",
    ));
    const callsBeforeRecord = fixture.calls.length;

    await assert.rejects(runPhase2AttendedRecordCli({
      args: fixture.recordArgs,
      ...fixture.cliOptions,
    }), /checklist SHA-256 is required/iu);
    await assert.rejects(runPhase2AttendedRecordCli({
      args: [
        ...fixture.recordArgs,
        "--checklist-sha256",
        "f".repeat(64),
      ],
      ...fixture.cliOptions,
    }), /approved checklist SHA-256 does not match/iu);
    assert.equal(fixture.calls.length, callsBeforeRecord);

    const records = await runPhase2AttendedRecordCli({
      args: withChecklistSha256(fixture.recordArgs, checklistBytes),
      ...fixture.cliOptions,
    });
    assert.equal(records.length, 2);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("trusted attended record CLI rejects a symlinked canonical build manifest", async () => {
  const fixture = await createTrustedCliFixture("phase2-record-manifest-link");
  try {
    await runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
    });
    const recordArgs = withChecklistSha256(
      fixture.recordArgs,
      await readFile(path.join(
        fixture.attendedDirectory,
        "checklist.pending.json",
      )),
    );
    const callsBeforeRecord = fixture.calls.length;
    const outsideManifest = path.join(fixture.outsideDirectory, "build.json");
    await rename(fixture.manifestPath, outsideManifest);
    await symlink(outsideManifest, fixture.manifestPath, "file");

    await assert.rejects(runPhase2AttendedRecordCli({
      args: recordArgs,
      ...fixture.cliOptions,
    }), /manifest.*symlink/iu);
    assert.equal(fixture.calls.length, callsBeforeRecord);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("checklist preparation excludes recording until immutable bytes are published", async () => {
  const fixture = await createTrustedCliFixture("phase2-prepare-record-race");
  try {
    const checklistPath = path.join(
      fixture.attendedDirectory,
      "checklist.pending.json",
    );
    let recorderAttempted = false;
    let recorderRejected = false;

    await runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
      beforeWrite: async () => {
        recorderAttempted = true;
        await assert.rejects(runPhase2AttendedRecordCli({
          args: [
            ...fixture.recordArgs,
            "--checklist-sha256",
            "d".repeat(64),
          ],
          ...fixture.cliOptions,
        }), /evidence seal lock.*held/iu);
        recorderRejected = true;
      },
    });

    const currentBytes = await readFile(checklistPath);
    assert.equal(recorderAttempted, true);
    assert.equal(recorderRejected, true);
    assert.ok(currentBytes.length > 0);
    assert.equal(existsSync(path.join(
      fixture.attendedDirectory,
      "emulator-supplementary.json",
    )), false);
    assert.equal(existsSync(path.join(
      fixture.attendedDirectory,
      "physical-result.json",
    )), false);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("checklist preparation excludes recording after valid bytes are published", async () => {
  const fixture = await createTrustedCliFixture("phase2-prepare-record-after-write");
  const checklistPath = path.join(
    fixture.attendedDirectory,
    "checklist.pending.json",
  );
  try {
    let recorderRejected = false;
    await runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
      afterWrite: async () => {
        const recordArgs = withChecklistSha256(
          fixture.recordArgs,
          await readFile(checklistPath),
        );
        await assert.rejects(runPhase2AttendedRecordCli({
          args: recordArgs,
          ...fixture.cliOptions,
        }), /evidence seal lock.*held/iu);
        recorderRejected = true;
        assert.equal(existsSync(path.join(
          fixture.attendedDirectory,
          "emulator-supplementary.json",
        )), false);
        assert.equal(existsSync(path.join(
          fixture.attendedDirectory,
          "physical-result.json",
        )), false);
      },
    });

    assert.equal(recorderRejected, true);
    const records = await runPhase2AttendedRecordCli({
      args: withChecklistSha256(
        fixture.recordArgs,
        await readFile(checklistPath),
      ),
      ...fixture.cliOptions,
    });
    assert.equal(records.length, 2);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("checklist rollback never deletes replacement bytes", async () => {
  const fixture = await createTrustedCliFixture("phase2-checklist-rollback-owner");
  const checklistPath = path.join(
    fixture.attendedDirectory,
    "checklist.pending.json",
  );
  const finalPath = path.join(
    fixture.artifactDirectory,
    "final-verification.json",
  );
  const replacement = Buffer.from("replacement checklist bytes\n");
  try {
    await assert.rejects(runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
      afterWrite: async () => {
        await rm(checklistPath);
        await writeFile(checklistPath, replacement, { flag: "wx" });
        await writeFile(finalPath, "racing final bytes\n", { flag: "wx" });
      },
    }), /attended or final evidence appeared/iu);
    assert.deepEqual(await readFile(checklistPath), replacement);
    assert.equal(await readFile(finalPath, "utf8"), "racing final bytes\n");
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("recorder seal excludes final publication after its first role link", async () => {
  const fixture = await createTrustedCliFixture("phase2-record-final-race");
  const finalPath = path.join(
    fixture.artifactDirectory,
    "final-verification.json",
  );
  let finalPublicationAttempted = false;
  let finalPublicationRejected = false;
  try {
    await runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
    });
    const recordArgs = withChecklistSha256(
      fixture.recordArgs,
      await readFile(path.join(
        fixture.attendedDirectory,
        "checklist.pending.json",
      )),
    );
    const records = await runPhase2AttendedRecordCli({
      args: recordArgs,
      ...fixture.cliOptions,
      afterFirstRolePublish: async () => {
        finalPublicationAttempted = true;
        await assert.rejects(
          executePhase2VerifierCli({
            args: [
              "--require-physical",
              "--require-roundtrip",
              "--output",
              "artifacts/native/phase2/final-verification.json",
            ],
            root: fixture.directory,
            execFile: fixture.cliOptions.execFile,
            environment: fixture.cliOptions.environment,
            log: () => undefined,
          }),
          /evidence seal lock.*held/iu,
        );
        finalPublicationRejected = true;
      },
    });

    assert.equal(finalPublicationAttempted, true);
    assert.equal(finalPublicationRejected, true);
    assert.equal(records.length, 2);
    assert.equal(existsSync(path.join(
      fixture.attendedDirectory,
      "emulator-supplementary.json",
    )), true);
    assert.equal(existsSync(path.join(
      fixture.attendedDirectory,
      "physical-result.json",
    )), true);
    assert.equal(existsSync(finalPath), false);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("role rollback never deletes replacement evidence", async () => {
  const fixture = await createTrustedCliFixture("phase2-role-rollback-owner");
  const emulatorPath = path.join(
    fixture.attendedDirectory,
    "emulator-supplementary.json",
  );
  const replacement = Buffer.from("replacement role bytes\n");
  try {
    await runPhase2AttendedChecklistCli({
      args: fixture.checklistArgs,
      ...fixture.cliOptions,
    });
    await assert.rejects(runPhase2AttendedRecordCli({
      args: withChecklistSha256(
        fixture.recordArgs,
        await readFile(path.join(
          fixture.attendedDirectory,
          "checklist.pending.json",
        )),
      ),
      ...fixture.cliOptions,
      afterFirstRolePublish: async () => {
        await rm(emulatorPath);
        await writeFile(emulatorPath, replacement, { flag: "wx" });
        throw new Error("injected role publication failure");
      },
    }), /injected role publication failure/iu);
    assert.deepEqual(await readFile(emulatorPath), replacement);
    assert.equal(existsSync(path.join(
      fixture.attendedDirectory,
      "physical-result.json",
    )), false);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("evidence seal lock fails fast and only reclaims proven dead same-host owners", async () => {
  const fixture = await createTrustedCliFixture("phase2-seal-lock");
  const lockPath = path.join(fixture.artifactDirectory, ".evidence-seal.lock");
  try {
    const { withPhase2EvidenceSealLock } = await import(
      "./phase2-evidence-boundary.mjs"
    );
    await withPhase2EvidenceSealLock({
      root: fixture.directory,
      operation: "outer-fixture",
    }, async () => {
      await assert.rejects(
        withPhase2EvidenceSealLock({
          root: fixture.directory,
          operation: "live-contender",
        }, async () => undefined),
        /evidence seal lock.*held/iu,
      );
    });
    assert.equal(existsSync(lockPath), false);

    await writeFile(lockPath, "not-json\n", { flag: "wx" });
    await assert.rejects(
      withPhase2EvidenceSealLock({
        root: fixture.directory,
        operation: "unknown-contender",
      }, async () => undefined),
      /ownership.*unknown|held/iu,
    );
    assert.equal(existsSync(lockPath), true);
    await rm(lockPath);

    await writeFile(lockPath, `${JSON.stringify({
      schema_version: 1,
      hostname: (await import("node:os")).hostname(),
      pid: 2_147_483_647,
      token: "d".repeat(64),
      operation: "dead-fixture",
      acquired_at: "2026-08-23T00:00:00.000Z",
    }, null, 2)}\n`);
    let reclaimed = false;
    await withPhase2EvidenceSealLock({
      root: fixture.directory,
      operation: "reclaimer",
    }, async () => {
      reclaimed = true;
    });
    assert.equal(reclaimed, true);
    assert.equal(existsSync(lockPath), false);
    assert.deepEqual(
      (await readdir(fixture.artifactDirectory))
        .filter((name) => name.includes("evidence-seal")),
      [],
    );
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("evidence seal lock is atomically visible only as a complete owner file", async () => {
  const fixture = await createTrustedCliFixture("phase2-seal-atomic-owner");
  const lockPath = path.join(fixture.artifactDirectory, ".evidence-seal.lock");
  try {
    const { withPhase2EvidenceSealLock } = await import(
      "./phase2-evidence-boundary.mjs"
    );
    await withPhase2EvidenceSealLock({
      root: fixture.directory,
      operation: "atomic-owner-fixture",
    }, async () => {
      assert.equal((await lstat(lockPath)).isFile(), true);
      const owner = JSON.parse(await readFile(lockPath, "utf8"));
      assert.equal(owner.schema_version, 1);
      assert.equal(owner.operation, "atomic-owner-fixture");
      assert.equal(typeof owner.hostname, "string");
      assert.equal(Number.isSafeInteger(owner.pid), true);
      assert.match(owner.token, /^[a-f0-9]{64}$/u);
    });
    assert.equal(existsSync(lockPath), false);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("two stale-lock reclaimers never displace the new live owner", async () => {
  const fixture = await createTrustedCliFixture("phase2-seal-two-reclaimers");
  const lockPath = path.join(fixture.artifactDirectory, ".evidence-seal.lock");
  let releaseFirstRead;
  let firstReadResolved;
  const firstRead = new Promise((resolve) => { firstReadResolved = resolve; });
  const firstMayContinue = new Promise((resolve) => { releaseFirstRead = resolve; });
  let releaseLiveOwner;
  let liveOwnerResolved;
  const liveOwner = new Promise((resolve) => { liveOwnerResolved = resolve; });
  const liveOwnerMayExit = new Promise((resolve) => { releaseLiveOwner = resolve; });
  try {
    await writeFile(lockPath, `${JSON.stringify({
      schema_version: 1,
      hostname: (await import("node:os")).hostname(),
      pid: 2_147_483_647,
      token: "e".repeat(64),
      operation: "dead-two-reclaimer-fixture",
      acquired_at: "2026-08-23T00:00:00.000Z",
    }, null, 2)}\n`);
    const { withPhase2EvidenceSealLock } = await import(
      "./phase2-evidence-boundary.mjs"
    );
    let paused = false;
    const delayedReclaimer = withPhase2EvidenceSealLock({
      root: fixture.directory,
      operation: "delayed-reclaimer",
      afterReadContendedOwner: async () => {
        if (paused) return;
        paused = true;
        firstReadResolved();
        await firstMayContinue;
      },
    }, async () => undefined);
    await firstRead;

    const liveReclaimer = withPhase2EvidenceSealLock({
      root: fixture.directory,
      operation: "live-reclaimer",
    }, async () => {
      liveOwnerResolved();
      await liveOwnerMayExit;
    });
    await liveOwner;
    const liveBytes = await readFile(lockPath);
    releaseFirstRead();
    await assert.rejects(delayedReclaimer, /evidence seal lock.*held/iu);
    assert.deepEqual(await readFile(lockPath), liveBytes);
    releaseLiveOwner();
    await liveReclaimer;
    assert.equal(existsSync(lockPath), false);
  } finally {
    releaseFirstRead?.();
    releaseLiveOwner?.();
    await removeTrustedCliFixture(fixture);
  }
});

test("evidence seal lock preserves callback and release failures", async () => {
  const fixture = await createTrustedCliFixture("phase2-seal-dual-failure");
  const lockPath = path.join(fixture.artifactDirectory, ".evidence-seal.lock");
  try {
    const { withPhase2EvidenceSealLock } = await import(
      "./phase2-evidence-boundary.mjs"
    );
    await assert.rejects(withPhase2EvidenceSealLock({
      root: fixture.directory,
      operation: "dual-failure-fixture",
    }, async () => {
      const owner = JSON.parse(await readFile(lockPath, "utf8"));
      await writeFile(lockPath, `${JSON.stringify({
        ...owner,
        token: "c".repeat(64),
      }, null, 2)}\n`);
      throw new Error("primary callback failure");
    }), (error) => error instanceof AggregateError
      && error.errors.some((entry) => /primary callback failure/u.test(entry.message))
      && error.errors.some((entry) => /owner token.*changed|refus/iu.test(entry.message)));
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("evidence seal lock release refuses to remove a replaced owner token", async () => {
  const fixture = await createTrustedCliFixture("phase2-seal-owner-token");
  const lockPath = path.join(fixture.artifactDirectory, ".evidence-seal.lock");
  try {
    const { withPhase2EvidenceSealLock } = await import(
      "./phase2-evidence-boundary.mjs"
    );
    await assert.rejects(withPhase2EvidenceSealLock({
      root: fixture.directory,
      operation: "token-fixture",
    }, async () => {
      const owner = JSON.parse(await readFile(lockPath, "utf8"));
      await writeFile(lockPath, `${JSON.stringify({
        ...owner,
        token: "f".repeat(64),
      }, null, 2)}\n`);
    }), /owner token.*changed|refus/iu);
    assert.equal(existsSync(lockPath), true);
  } finally {
    await removeTrustedCliFixture(fixture);
  }
});

test("CLI preflights both devices and preserves the prior checklist on failure", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-checklist-cli-"));
  const outsideDirectory = await mkdtemp(path.join(
    tmpdir(),
    "phase2-checklist-cli-outside-",
  ));
  const artifactDirectory = path.join(directory, "artifacts/native/phase2");
  const attendedDirectory = path.join(artifactDirectory, "attended");
  const manifestPath = path.join(artifactDirectory, "build.json");
  const apkPath = path.join(artifactDirectory, "gym-tracker-phase2-devtest.apk");
  const outputPath = path.join(attendedDirectory, "checklist.pending.json");
  const emulatorSerial = "emulator-private-serial";
  const samsungSerial = "samsung-private-serial";
  try {
    await mkdir(attendedDirectory, { recursive: true });
    await writeFile(path.join(directory, ".gitignore"), "artifacts/native/\n");
    await writeFile(path.join(directory, "fixture.txt"), "source\n");
    execFileSync("git", ["init", "-q"], { cwd: directory });
    execFileSync("git", ["add", ".gitignore", "fixture.txt"], {
      cwd: directory,
    });
    execFileSync("git", [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ], { cwd: directory });
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
    }).trim();
    const apkBytes = Buffer.from("same-apk-bytes");
    const apkSha256 = createHash("sha256").update(apkBytes).digest("hex");
    await writeFile(apkPath, apkBytes);
    const manifest = {
      ...manifestFixture(),
      base_head: head,
      source_tree_sha256: sourceTreeSha256(directory),
      apk: {
        ...manifestFixture().apk,
        sha256: apkSha256,
        size_bytes: apkBytes.length,
      },
      installed_apk: {
        device_path: "/data/app/base.apk",
        sha256: apkSha256,
        matches_retained_apk: true,
      },
    };
    await writeFile(manifestPath, JSON.stringify(manifest) + "\n");
    const ledger = await collectPhase2SourceLedger(projectRoot);
    const calls = [];
    const fakeExec = (file, commandArgs, options) => {
      if (file === "git"
        && commandArgs[0] === "status"
        && commandArgs.includes("--untracked-files=no")) {
        return "";
      }
      if (file === "git") return execFileSync(file, commandArgs, options);
      calls.push(commandArgs);
      const serial = commandArgs[1];
      const command = commandArgs.slice(2).join(" ");
      if (command === "get-state") return "device\n";
      if (command === "shell getprop ro.product.model") {
        return serial === emulatorSerial
          ? "sdk_gphone64_arm64\n"
          : "SM-S916B\n";
      }
      if (command === "shell getprop ro.build.version.sdk") {
        return serial === emulatorSerial ? "36\n" : "34\n";
      }
      if (command === "shell getprop ro.product.cpu.abi") {
        return serial === emulatorSerial ? "arm64-v8a\n" : "armeabi-v7a\n";
      }
      if (command === "shell getprop ro.kernel.qemu") {
        return serial === emulatorSerial ? "1\n" : "0\n";
      }
      if (command.startsWith("install -r ")) return "Success\n";
      if (command === "shell pm path " + packageName) {
        return "package:/data/app/base.apk\n";
      }
      if (command === "exec-out cat /data/app/base.apk") return apkBytes;
      throw new Error("unexpected fake command: " + command);
    };
    const args = [
      "--manifest",
      "artifacts/native/phase2/build.json",
      "--emulator-serial",
      emulatorSerial,
      "--samsung-serial",
      samsungSerial,
      "--output",
      "artifacts/native/phase2/attended/checklist.pending.json",
    ];
    const checklist = await runPhase2AttendedChecklistCli({
      args,
      root: directory,
      execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger,
      log: () => undefined,
    });
    assert.equal(checklist.counts.total, 158);
    assert.equal(calls.filter((call) => call[2] === "install").length, 2);
    const written = await readFile(outputPath, "utf8");
    const checklistSha256 = createHash("sha256")
      .update(written)
      .digest("hex");
    assert.ok(!written.includes(emulatorSerial));
    assert.ok(!written.includes(samsungSerial));

    const outsideChecklist = path.join(outsideDirectory, "outside-checklist.json");
    await writeFile(outsideChecklist, written);
    await rm(outputPath);
    await symlink(outsideChecklist, outputPath);
    await assert.rejects(runPhase2AttendedRecordCli({
      args: [
        "--manifest", "artifacts/native/phase2/build.json",
        "--emulator-serial", emulatorSerial,
        "--samsung-serial", samsungSerial,
        "--checklist-sha256", checklistSha256,
      ],
      root: directory, execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger, log: () => undefined,
    }), /checklist.*symlink/iu);
    assert.equal(await readFile(outsideChecklist, "utf8"), written);
    await rm(outputPath);
    await writeFile(outputPath, written);

    const outsideRole = path.join(outsideDirectory, "outside-role.json");
    await writeFile(outsideRole, "outside role bytes\n");
    const emulatorRolePath = path.join(
      attendedDirectory,
      "emulator-supplementary.json",
    );
    await symlink(outsideRole, emulatorRolePath);
    await assert.rejects(runPhase2AttendedRecordCli({
      args: [
        "--manifest", "artifacts/native/phase2/build.json",
        "--emulator-serial", emulatorSerial,
        "--samsung-serial", samsungSerial,
        "--checklist-sha256", checklistSha256,
      ],
      root: directory, execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger, log: () => undefined,
    }), /emulator attended record.*symlink/iu);
    assert.equal(await readFile(outsideRole, "utf8"), "outside role bytes\n");
    assert.equal(await readFile(outputPath, "utf8"), written);
    await rm(emulatorRolePath);

    const failingExec = (file, commandArgs, options) => {
      if (file === "git") return execFileSync(file, commandArgs, options);
      if (commandArgs[2] === "install" && commandArgs[1] === samsungSerial) {
        throw new Error("fixture install failure");
      }
      return fakeExec(file, commandArgs, options);
    };
    await rm(outputPath);
    await assert.rejects(runPhase2AttendedChecklistCli({
      args,
      root: directory,
      execFile: failingExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger,
      log: () => undefined,
    }), /samsung-physical exact APK installation failed.*partially prepared.*no checklist.*no package restoration/iu);
    assert.equal(existsSync(outputPath), false);

    await assert.rejects(runPhase2AttendedChecklistCli({
      args,
      root: directory,
      execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger,
      afterWrite: async () => {
        await writeFile(
          path.join(artifactDirectory, "final-verification.json"),
          "forbidden\n",
        );
      },
      log: () => undefined,
    }), /appeared while writing/u);
    assert.equal(existsSync(outputPath), false);
    await rm(path.join(artifactDirectory, "final-verification.json"));
    await writeFile(outputPath, written);

    const finalPath = path.join(artifactDirectory, "final-verification.json");
    await writeFile(finalPath, "existing final bytes\n");
    await assert.rejects(runPhase2AttendedRecordCli({
      args: [
        "--manifest", "artifacts/native/phase2/build.json",
        "--emulator-serial", emulatorSerial,
        "--samsung-serial", samsungSerial,
        "--checklist-sha256", checklistSha256,
      ],
      root: directory, execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger, log: () => undefined,
    }), /final verification must be absent/iu);
    assert.equal(await readFile(finalPath, "utf8"), "existing final bytes\n");
    assert.equal(existsSync(path.join(
      attendedDirectory,
      "emulator-supplementary.json",
    )), false);
    assert.equal(existsSync(path.join(
      attendedDirectory,
      "physical-result.json",
    )), false);
    await rm(finalPath);

    await assert.rejects(runPhase2AttendedRecordCli({
      args: [
        "--manifest", "artifacts/native/phase2/build.json",
        "--emulator-serial", emulatorSerial,
        "--samsung-serial", samsungSerial,
        "--checklist-sha256", checklistSha256,
      ],
      root: directory, execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger, log: () => undefined,
      beforePublish: async () => {
        await writeFile(finalPath, "racing final bytes\n");
      },
    }), /final verification appeared/iu);
    assert.equal(await readFile(finalPath, "utf8"), "racing final bytes\n");
    assert.equal(existsSync(path.join(
      attendedDirectory,
      "emulator-supplementary.json",
    )), false);
    assert.equal(existsSync(path.join(
      attendedDirectory,
      "physical-result.json",
    )), false);
    await rm(finalPath);

    const records = await runPhase2AttendedRecordCli({
      args: [
        "--manifest", "artifacts/native/phase2/build.json",
        "--emulator-serial", emulatorSerial,
        "--samsung-serial", samsungSerial,
        "--checklist-sha256", checklistSha256,
      ],
      root: directory,
      execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger,
      log: () => undefined,
    });
    assert.equal(records.length, 2);
    for (const name of ["emulator-supplementary.json", "physical-result.json"]) {
      const recordBytes = await readFile(path.join(attendedDirectory, name));
      assert.equal(recordBytes.includes(emulatorSerial), false);
      assert.equal(recordBytes.includes(samsungSerial), false);
      assert.equal(JSON.parse(recordBytes).schema_version, 2);
    }
    await assert.rejects(runPhase2AttendedRecordCli({
      args: [
        "--manifest", "artifacts/native/phase2/build.json",
        "--emulator-serial", emulatorSerial,
        "--samsung-serial", samsungSerial,
        "--checklist-sha256", checklistSha256,
      ],
      root: directory, execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
      collectSourceLedger: async () => ledger, log: () => undefined,
    }), /already exist|overwrite/u);
  } finally {
    await rm(directory, { force: true, recursive: true });
    await rm(outsideDirectory, { force: true, recursive: true });
  }
});

test("CLI refuses tracked drift before any ADB call and keeps the previous checklist", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "phase2-checklist-drift-"));
  const artifactDirectory = path.join(directory, "artifacts/native/phase2");
  const attendedDirectory = path.join(artifactDirectory, "attended");
  const outputPath = path.join(attendedDirectory, "checklist.pending.json");
  try {
    await mkdir(attendedDirectory, { recursive: true });
    await writeFile(path.join(directory, ".gitignore"), "artifacts/native/\n");
    await writeFile(path.join(directory, "fixture.txt"), "source\n");
    execFileSync("git", ["init", "-q"], { cwd: directory });
    execFileSync("git", ["add", ".gitignore", "fixture.txt"], { cwd: directory });
    execFileSync("git", [
      "-c", "user.name=Fixture",
      "-c", "user.email=fixture@example.invalid",
      "commit", "-qm", "fixture",
    ], { cwd: directory });
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
    }).trim();
    const apkBytes = Buffer.from("same-apk-bytes");
    const apkSha256 = createHash("sha256").update(apkBytes).digest("hex");
    await writeFile(
      path.join(artifactDirectory, "gym-tracker-phase2-devtest.apk"),
      apkBytes,
    );
    await writeFile(path.join(artifactDirectory, "build.json"), JSON.stringify({
      ...manifestFixture(),
      base_head: head,
      source_tree_sha256: sourceTreeSha256(directory),
      apk: {
        ...manifestFixture().apk,
        sha256: apkSha256,
        size_bytes: apkBytes.length,
      },
      installed_apk: {
        device_path: "/data/app/base.apk",
        sha256: apkSha256,
        matches_retained_apk: true,
      },
    }) + "\n");
    await writeFile(path.join(directory, "fixture.txt"), "dirty\n");
    let adbCalled = false;
    const fakeExec = (file, commandArgs, options) => {
      if (file === "git") return execFileSync(file, commandArgs, options);
      adbCalled = true;
      throw new Error("ADB must not be called");
    };
    await assert.rejects(runPhase2AttendedChecklistCli({
      args: [
        "--manifest", "artifacts/native/phase2/build.json",
        "--emulator-serial", "emulator-private-serial",
        "--samsung-serial", "samsung-private-serial",
        "--output", "artifacts/native/phase2/attended/checklist.pending.json",
      ],
      root: directory,
      execFile: fakeExec,
      environment: { ANDROID_HOME: path.join(directory, "android-sdk") },
    }), /tracked worktree changes|source digest/u);
    assert.equal(adbCalled, false);
    assert.equal(existsSync(outputPath), false);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("CLI arguments require manifest, both device serials, and checklist.pending.json output", () => {
  assert.deepEqual(parsePhase2AttendedChecklistArgs([
    "--manifest", "artifacts/native/phase2/build.json",
    "--emulator-serial=emulator-5554",
    "--samsung-serial", "R3C123EXAMPLE",
    "--output", "artifacts/native/phase2/attended/checklist.pending.json",
  ]), {
    manifest: "artifacts/native/phase2/build.json",
    emulatorSerial: "emulator-5554",
    samsungSerial: "R3C123EXAMPLE",
    output: "artifacts/native/phase2/attended/checklist.pending.json",
  });
  assert.throws(
    () => parsePhase2AttendedChecklistArgs(["--manifest", "build.json"]),
    /emulator|Samsung|output/u,
  );
  assert.throws(
    () => parsePhase2AttendedChecklistArgs([
      "--manifest", "build.json",
      "--emulator-serial", "same",
      "--samsung-serial", "same",
      "--output", "checklist.pending.json",
    ]),
    /distinct/u,
  );
  assert.throws(
    () => parsePhase2AttendedChecklistArgs([
      "--manifest", "build.json",
      "--emulator-serial", "emulator-5554",
      "--samsung-serial", "phone",
      "--output", "physical-result.json",
    ]),
    /checklist\.pending\.json/u,
  );
  assert.throws(
    () => parsePhase2AttendedChecklistArgs([
      "--manifest", "build.json",
      "--emulator-serial", "emulator-5554",
      "--samsung-serial", "phone",
      "--output", "checklist.pending.json",
      "--output", "checklist.pending.json",
    ]),
    /duplicate/u,
  );
  assert.throws(
    () => parsePhase2AttendedChecklistArgs(["R3C123EXAMPLE"]),
    (error) => !error.message.includes("R3C123EXAMPLE")
      && /unknown.*argument/u.test(error.message),
  );
});

test("approved-record arguments require manifest, distinct serials, and checklist hash", () => {
  assert.deepEqual(parsePhase2AttendedRecordArgs([
    "--manifest", "artifacts/native/phase2/build.json",
    "--emulator-serial", "emulator-5554",
    "--samsung-serial", "phone",
    "--checklist-sha256", "a".repeat(64),
  ]), {
    manifest: "artifacts/native/phase2/build.json",
    emulatorSerial: "emulator-5554",
    samsungSerial: "phone",
    checklistSha256: "a".repeat(64),
  });
  assert.throws(() => parsePhase2AttendedRecordArgs([
    "--manifest", "build.json", "--manifest", "other.json",
    "--emulator-serial", "one", "--samsung-serial", "two",
    "--checklist-sha256", "a".repeat(64),
  ]), /duplicate/u);
  assert.throws(() => parsePhase2AttendedRecordArgs([
    "--manifest", "build.json",
    "--emulator-serial", "one", "--samsung-serial", "two",
  ]), /checklist SHA-256 is required/iu);
  assert.throws(() => parsePhase2AttendedRecordArgs([
    "--manifest", "build.json",
    "--emulator-serial", "one", "--samsung-serial", "two",
    "--checklist-sha256", "A".repeat(64),
  ]), /64 lowercase hexadecimal/iu);
});

test("package scripts expose checklist preparation and the combined evidence suite", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(
    packageJson.scripts["prepare:attended:phase2"],
    "node scripts/generate-phase2-attended-checklist.mjs",
  );
  assert.equal(
    packageJson.scripts["record:attended:phase2"],
    "node scripts/generate-phase2-attended-checklist.mjs --record-approved",
  );
  assert.match(
    packageJson.scripts["test:evidence:phase2"],
    /phase2-evidence-scripts\.test\.mjs/u,
  );
  assert.match(
    packageJson.scripts["test:evidence:phase2"],
    /generate-phase2-attended-checklist\.test\.mjs/u,
  );
});
