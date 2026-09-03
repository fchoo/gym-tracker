import assert from "node:assert/strict";
import { transformSync } from "@babel/core";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
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

function screenshotFixtures() {
  return {
    "phase6-progress-library": [
      { file: "phase6-library-favorite-selected.png", sha256: SHA_A },
      { file: "phase6-library-search.png", sha256: SHA_B },
      { file: "phase6-progress-search.png", sha256: SHA_A },
      { file: "phase6-progress-summary.png", sha256: SHA_B },
    ],
    "phase6-calendar-date-reorder": [
      { file: "phase6-calendar-dialog-200pct.png", sha256: SHA_A },
      { file: "phase6-calendar-swipe.png", sha256: SHA_B },
      { file: "phase6-reorder-before-drag.png", sha256: SHA_A },
      { file: "phase6-reorder-live-displacement.png", sha256: SHA_B },
    ],
    "phase6-navigation-accessibility": [
      { file: "phase6-history-data-route-200pct.png", sha256: SHA_A },
      { file: "phase6-navigation-calendar-200pct.png", sha256: SHA_B },
      { file: "phase6-navigation-library-200pct.png", sha256: SHA_A },
      { file: "phase6-navigation-progress-200pct.png", sha256: SHA_B },
      { file: "phase6-navigation-today-200pct.png", sha256: SHA_A },
    ],
  };
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
    snapshotPhase6ExecutableFlows,
    validatePhase6Evidence,
  } = await load("scripts/run-phase6-maestro.mjs");
  const candidate = fixtureCandidate();
  const rawReports = Object.fromEntries([
    "phase6-progress-library",
    "phase6-calendar-date-reorder",
    "phase6-navigation-accessibility",
  ].map((id) => [id, passedReport()]));
  const nativeDragReports = {
    "phase6-calendar-date-reorder": passedReport(),
  };
  const screenshots = screenshotFixtures();
  const executableFlows = snapshotPhase6ExecutableFlows();
  test.after(() => {
    if (existsSync(executableFlows.directory)) {
      executableFlows.cleanup();
    }
  });
  const evidenceInput = {
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
    flowExecutions: executableFlows.flows,
    rawReports,
    nativeDragReports,
    screenshots,
    fontScaleRestored: true,
  };
  const evidence = createPhase6Evidence(evidenceInput);
  const validate = (candidateEvidence) => validatePhase6Evidence(
    candidateEvidence,
    candidate,
    rawReports,
    nativeDragReports,
    executableFlows.flows,
  );
  assert.doesNotThrow(() => validate(evidence));
  assert.throws(() => validate({
    ...evidence,
    device: { ...evidence.device, installed_apk_sha256: SHA_A },
  }), /installed|identity|candidate/u);
  assert.throws(() => validate({
    ...evidence,
    flows: evidence.flows.map((flow, index) => index === 0
      ? { ...flow, screenshots: [] }
      : flow),
  }), /screenshot|artifact|evidence/u);
  assert.throws(() => validate({
    ...evidence,
    flows: evidence.flows.map((flow) => flow.id === "phase6-progress-library"
      ? {
          ...flow,
          screenshots: flow.screenshots.map((screenshot, index) => index === 0
            ? { ...screenshot, file: "phase6-renamed.png" }
            : screenshot),
        }
      : flow),
  }), /screenshot|artifact|evidence/u);
  assert.throws(() => createPhase6Evidence({
    ...evidenceInput,
    screenshots: {
      ...screenshots,
      "phase6-progress-library": screenshots["phase6-progress-library"].slice(1),
    },
  }), /screenshots.*phase6-progress-library|phase6-progress-library.*screenshots/u);
  assert.throws(() => createPhase6Evidence({
    ...evidenceInput,
    screenshots: {
      ...screenshots,
      "phase6-progress-library": [
        ...screenshots["phase6-progress-library"],
        { file: "unexpected-extra.png", sha256: SHA_A },
      ],
    },
  }), /screenshots.*phase6-progress-library|phase6-progress-library.*screenshots/u);
  assert.throws(() => validate({
    ...evidence,
    flows: evidence.flows.map((flow, index) => index === 0
      ? { ...flow, flow_sha256: "0".repeat(64) }
      : flow),
  }), /flow|command|evidence/u);
  assert.throws(() => validate({
    ...evidence,
    flows: evidence.flows.map((flow) => flow.id === "phase6-calendar-date-reorder"
      ? { ...flow, native_drag_flow_sha256: "0".repeat(64) }
      : flow),
  }), /native drag|evidence/u);
  assert.throws(() => validate({
    ...evidence,
    font_scale_restored: false,
  }), /font|cleanup|evidence/u);
  assert.throws(() => createPhase6Evidence({
    ...evidenceInput,
    rawReports,
    nativeDragReports: {},
  }), /native-drag|native drag|report/u);
  assert.throws(() => validate({
    ...evidence,
    release_authorization: "approved",
  }), /authorization|approval|evidence/u);
  assert.throws(() => validate({
    ...evidence,
    raw_path: "/private/device/rows.json",
  }), /private|bounded|evidence/u);
  assert.throws(() => validate({
    ...evidence,
    flows: evidence.flows.map((flow) => flow.id === "phase6-calendar-date-reorder"
      ? {
          ...flow,
          native_drag_live_screenshot: {
            ...flow.native_drag_live_screenshot,
            sha256: SHA_A,
          },
        }
      : flow),
  }), /native drag|evidence/u);
});

test("Phase 6 executes immutable flow snapshots and rejects changed snapshot bytes", async () => {
  const {
    snapshotPhase6ExecutableFlows,
    validatePhase6ExecutableFlowSnapshots,
  } = await load(
    "scripts/run-phase6-maestro.mjs",
  );
  const parent = mkdtempSync(path.join(os.tmpdir(), "phase6-flow-snapshot-test-"));
  test.after(() => rmSync(parent, { force: true, recursive: true }));
  const snapshot = snapshotPhase6ExecutableFlows(parent);
  assert.equal(Object.keys(snapshot.flows).length, 3);
  for (const execution of Object.values(snapshot.flows)) {
    assert.equal(
      createHash("sha256").update(readFileSync(execution.flowPath)).digest("hex"),
      execution.flowSha256,
    );
  }
  const n3 = snapshot.flows["phase6-calendar-date-reorder"];
  assert.equal(n3.nativeDragFlow, "maestro/phase6/calendar-date-reorder-verify.yaml");
  assert.equal(
    createHash("sha256").update(readFileSync(n3.nativeDragFlowPath)).digest("hex"),
    n3.nativeDragFlowSha256,
  );
  const originalMode = statSync(n3.flowPath).mode;
  chmodSync(n3.flowPath, 0o600);
  writeFileSync(n3.flowPath, "changed after snapshot");
  assert.throws(
    () => validatePhase6ExecutableFlowSnapshots(snapshot.flows),
    /executed Maestro flow bytes changed/u,
  );
  chmodSync(n3.flowPath, originalMode);
  snapshot.cleanup();
});

test("Phase 6 evidence rejects source drift after immutable flow capture", async () => {
  const {
    snapshotPhase6ExecutableFlows,
    validatePhase6ExecutableFlowSnapshots,
  } = await load("scripts/run-phase6-maestro.mjs");
  const parent = mkdtempSync(path.join(os.tmpdir(), "phase6-source-drift-test-"));
  const sourceRoot = path.join(parent, "source");
  const sourceDirectory = path.join(sourceRoot, "maestro/phase6");
  mkdirSync(sourceDirectory, { recursive: true });
  for (const file of [
    "progress-library.yaml",
    "calendar-date-reorder.yaml",
    "calendar-date-reorder-verify.yaml",
    "navigation-accessibility.yaml",
  ]) {
    writeFileSync(
      path.join(sourceDirectory, file),
      readFileSync(path.join(projectRoot, "maestro/phase6", file)),
    );
  }
  const snapshot = snapshotPhase6ExecutableFlows(parent, sourceRoot);
  const source = path.join(sourceDirectory, "progress-library.yaml");
  try {
    writeFileSync(source, Buffer.concat([readFileSync(source), Buffer.from("\n# drift\n")]));
    assert.throws(
      () => validatePhase6ExecutableFlowSnapshots(snapshot.flows, sourceRoot),
      /executed Maestro flow bytes changed/u,
    );
  } finally {
    snapshot.cleanup();
    rmSync(parent, { force: true, recursive: true });
  }
});

test("Phase 6 evidence outputs reject stale reports before execution", async () => {
  const { preparePhase6EvidenceOutputs } = await load(
    "scripts/run-phase6-maestro.mjs",
  );
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "phase6-output-test-")));
  test.after(() => rmSync(root, { force: true, recursive: true }));
  const output = path.join(root, "evidence", "phase6.json");
  const reports = path.join(root, "evidence", "phase6-maestro");

  preparePhase6EvidenceOutputs(output, reports);
  writeFileSync(path.join(reports, "stale.png"), "stale");
  assert.throws(
    () => preparePhase6EvidenceOutputs(output, reports),
    /report directory must be fresh/u,
  );
});

test("Phase 6 screenshot evidence accepts Maestro nested output without weakening exact names", async () => {
  const { exactScreenshotEvidence } = await load(
    "scripts/run-phase6-maestro.mjs",
  );
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "phase6-screenshot-test-")));
  test.after(() => rmSync(root, { force: true, recursive: true }));
  const screenshotDirectory = path.join(
    root,
    "2026-09-03_160814",
    "Phase 6 production Progress and Library Search_filter evidence",
    "takeScreenshot",
  );
  mkdirSync(screenshotDirectory, { recursive: true });
  const expected = [
    "phase6-progress-search.png",
    "phase6-progress-summary.png",
  ];
  for (const [index, file] of expected.entries()) {
    writeFileSync(
      path.join(screenshotDirectory, file),
      Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from([index])]),
    );
  }

  assert.deepEqual(
    exactScreenshotEvidence(root, expected, "phase6-progress-library")
      .map(({ file }) => file),
    expected,
  );

  writeFileSync(
    path.join(screenshotDirectory, "unexpected-extra.png"),
    Buffer.from("89504e470d0a1a0a01", "hex"),
  );
  assert.throws(
    () => exactScreenshotEvidence(root, expected, "phase6-progress-library"),
    /required screenshots are missing or renamed/u,
  );
  rmSync(path.join(screenshotDirectory, "unexpected-extra.png"));

  const duplicateDirectory = path.join(root, "duplicate", "takeScreenshot");
  mkdirSync(duplicateDirectory, { recursive: true });
  writeFileSync(
    path.join(duplicateDirectory, expected[0]),
    Buffer.from("89504e470d0a1a0a02", "hex"),
  );
  assert.throws(
    () => exactScreenshotEvidence(root, expected, "phase6-progress-library"),
    /required screenshots are missing or renamed/u,
  );
});

test("Phase 6 evidence outputs reject symlink escape through output or report descendants", async () => {
  const { preparePhase6EvidenceOutputs } = await load(
    "scripts/run-phase6-maestro.mjs",
  );
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "phase6-output-symlink-test-")));
  const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "phase6-output-symlink-outside-")));
  test.after(() => {
    rmSync(root, { force: true, recursive: true });
    rmSync(outside, { force: true, recursive: true });
  });
  const evidenceRoot = path.join(root, "evidence");
  mkdirSync(evidenceRoot, { recursive: true });
  symlinkSync(outside, path.join(evidenceRoot, "escape"), "dir");

  assert.throws(
    () => preparePhase6EvidenceOutputs(
      path.join(evidenceRoot, "escape", "phase6.json"),
      path.join(evidenceRoot, "phase6-maestro"),
    ),
    /symlink|canonical|unsafe/u,
  );
  assert.throws(
    () => preparePhase6EvidenceOutputs(
      path.join(evidenceRoot, "phase6.json"),
      path.join(evidenceRoot, "escape", "phase6-maestro"),
    ),
    /symlink|canonical|unsafe/u,
  );
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

test("Phase 6 Progress flow saves history-eligible workout facts before root navigation", () => {
  const source = readFileSync(
    path.join(projectRoot, "maestro/phase6/progress-library.yaml"),
    "utf8",
  );

  assert.match(
    source,
    /- tapOn: "Complete Set 1"[\s\S]*visible: "RESTING · NEXT: SET 2 AT 60 kg × 8"[\s\S]*- tapOn: "Complete Set 2"[\s\S]*visible: "RESTING · NEXT: SET 3 AT 60 kg × 8"[\s\S]*- tapOn: "Complete Set 3"[\s\S]*visible: "RESTING · NEXT: SET 1 AT 42\.5 kg × 10"\n    timeout: 60000\n- tapOn: "More workout actions"\n- tapOn: "Finish as partial"\n- assertVisible: "Save partial workout\?"\n- tapOn:\n    id: "save-partial-workout-confirm"\n- extendedWaitUntil:\n    visible: "PARTIAL SAVED"\n    timeout: 60000\n- assertVisible: "PARTIAL SAVED"\n- assertVisible: "Workout saved"\n- stopApp\n- launchApp:\n    clearState: false\n    stopApp: true\n    permissions:\n      notifications: deny\n- extendedWaitUntil:\n    visible: "Bench Press · Working set 1 · 3\/15 working sets"\n    timeout: 90000\n- assertVisible: "Today"\n- assertVisible: "Workout saved as partial"\n- tapOn: "Progress"\n- assertVisible: "4 weeks"\n- assertVisible: "Overall Progress"\n- scrollUntilVisible:\n    element:\n      text: "Working sets · 3 of 15 completed"\n    direction: DOWN\n    centerElement: true\n    timeout: 60000\n- assertNotVisible: "No progress history yet"\n- takeScreenshot: phase6-progress-summary\n- scrollUntilVisible:\n    element:\n      text: "Exercise progress"\n    direction: DOWN\n    centerElement: true\n    timeout: 60000\n- assertVisible: "Exercise progress"\n- tapOn: "Search exercises"\n- inputText: "Back"\n- pressKey: ENTER\n- assertVisible: "Search exercises"\n- scrollUntilVisible:\n    element:\n      id: "progress-exercise-row-5f140001-7e35-4a6d-9100-000000000001-load_reps:1:1-identity"\n    direction: DOWN\n    centerElement: true\n    timeout: 60000\n- assertVisible:\n    id: "progress-exercise-row-5f140001-7e35-4a6d-9100-000000000001-load_reps:1:1-identity"\n- takeScreenshot: phase6-progress-search/u,
  );
  assert.doesNotMatch(
    source,
    /- extendedWaitUntil:\n    visible: "PARTIAL SAVED"\n    timeout: 60000\n- assertVisible: "Workout saved"\n- tapOn: "Progress"/u,
  );
  assert.doesNotMatch(
    source,
    /- tapOn: "Progress"\n- assertVisible: "4 weeks"\n- tapOn: "Search exercises"/u,
  );
  assert.doesNotMatch(
    source,
    /- tapOn: "Return to Today"/u,
  );
});

test("Phase 6 Progress flow anchors the filtered exercise row before asserting it", () => {
  const source = readFileSync(
    path.join(projectRoot, "maestro/phase6/progress-library.yaml"),
    "utf8",
  );
  const filteredExerciseRow = [
    '- assertVisible: "Exercise progress"',
    '- tapOn: "Search exercises"',
    '- inputText: "Back"',
    '- pressKey: ENTER',
    '- assertVisible: "Search exercises"',
    '- scrollUntilVisible:',
    '    element:',
    '      id: "progress-exercise-row-5f140001-7e35-4a6d-9100-000000000001-load_reps:1:1-identity"',
    '    direction: DOWN',
    '    centerElement: true',
    '    timeout: 60000',
    '- assertVisible:',
    '    id: "progress-exercise-row-5f140001-7e35-4a6d-9100-000000000001-load_reps:1:1-identity"',
    '- takeScreenshot: phase6-progress-search',
  ].join("\n");

  assert.ok(source.includes(filteredExerciseRow));
  assert.doesNotMatch(
    source,
    /text: "Open exercise history for Back Squat"[\s\S]*- assertVisible: "Back Squat"/u,
  );
  assert.match(
    source,
    /- tapOn: "Clear search exercises"\n- pressKey: TAB\n- hideKeyboard\n- assertVisible: "Library"\n- tapOn: "Library"/u,
  );
});

test("plan reorder callbacks compile as UI worklets without remote helpers", () => {
  const fileName = path.join(
    projectRoot,
    "src/ui/components/PlanEditorFields.tsx",
  );
  const source = readFileSync(fileName, "utf8");
  const transformed = transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: fileName,
    presets: ["babel-preset-expo"],
  })?.code;

  assert.ok(transformed);
  const rowStyleStart = transformed.indexOf("var rowStyle=");
  const handleLabelStart = transformed.indexOf("var handleLabel=");
  assert.notEqual(rowStyleStart, -1);
  assert.ok(handleLabelStart > rowStyleStart);
  const rowStyle = transformed.slice(rowStyleStart, handleLabelStart);
  assert.match(rowStyle, /__workletHash=/u);
  assert.match(rowStyle, /useAnimatedStyle/u);

  for (const remoteHelper of [
    "useReorderAnimatedStyle",
    "scheduleOnJavaScript",
    "animateTo",
  ]) {
    assert.doesNotMatch(rowStyle, new RegExp(remoteHelper, "u"));
  }
  for (const workletStart of [".onStart(", ".onUpdate(", ".onFinalize("]) {
    const start = transformed.indexOf(workletStart);
    assert.notEqual(start, -1, workletStart);
    const end = transformed.indexOf(".__workletHash=", start);
    assert.ok(end > start, workletStart);
    const callback = transformed.slice(start, end);
    assert.doesNotMatch(
      callback,
      /scheduleOnJavaScript|animateTo/u,
      workletStart,
    );
  }
});

test("Phase 6 N2 and N3 evidence proves reversible months and one native held drag", async () => {
  const {
    phase6CalendarMonthEnvironment,
    phase6HeldDragIsDisplaced,
    phase6NativeDragCommands,
    phase6ReorderDragCoordinates,
    throwPhase6Failures,
  } = await load("scripts/run-phase6-maestro.mjs");
  assert.deepEqual(phase6CalendarMonthEnvironment("2026-08-31"), {
    current: "August 2026",
    next: "September 2026",
    previous: "July 2026",
  });
  assert.deepEqual(phase6CalendarMonthEnvironment("2026-12-01"), {
    current: "December 2026",
    next: "January 2027",
    previous: "November 2026",
  });
  for (const invalidDate of ["2026-02-29", "0001-01-01", "9999-12-31"]) {
    assert.throws(
      () => phase6CalendarMonthEnvironment(invalidDate),
      /civil date|adjacent month/u,
    );
  }

  const hierarchy = [
    "<hierarchy>",
    '<node resource-id="drag-exercise-Back Squat" content-desc="Drag Back Squat. Position 1 of 2" bounds="[120,500][360,620]" />',
    '<node resource-id="drag-exercise-Bench Press" content-desc="Drag Bench Press. Position 2 of 2" bounds="[120,700][360,820]" />',
    "</hierarchy>",
  ].join("");
  assert.deepEqual(phase6ReorderDragCoordinates(hierarchy, {
    sourceLabel: "Bench Press",
    targetLabel: "Back Squat",
  }), {
    endX: 240,
    endY: 560,
    startX: 240,
    startY: 760,
  });
  assert.deepEqual(phase6NativeDragCommands({
    endX: 240,
    endY: 560,
    startX: 240,
    startY: 760,
  }), {
    down: ["shell", "input", "touchscreen", "motionevent", "DOWN", "240", "760"],
    move: ["shell", "input", "touchscreen", "motionevent", "MOVE", "240", "560"],
    up: ["shell", "input", "touchscreen", "motionevent", "UP", "240", "560"],
  });
  assert.throws(() => phase6NativeDragCommands({
    endX: 240,
    endY: 560,
    startX: -1,
    startY: 760,
  }), /drag.*coordinates/iu);
  assert.equal(phase6HeldDragIsDisplaced([
    "<hierarchy>",
    '<node resource-id="drag-exercise-Bench Press" content-desc="Drag Bench Press. Moving to position 1 of 2" bounds="[120,500][360,620]" />',
    "</hierarchy>",
  ].join(""), { label: "Bench Press", targetPosition: 1, count: 2 }), true);
  assert.equal(phase6HeldDragIsDisplaced(hierarchy, {
    label: "Bench Press",
    targetPosition: 1,
    count: 2,
  }), false);
  const primary = new Error("primary");
  const cleanup = new Error("cleanup");
  assert.throws(
    () => throwPhase6Failures(primary, [cleanup], "native drag"),
    (error) => error instanceof AggregateError
      && error.errors[0] === primary
      && error.errors[1] === cleanup,
  );
  assert.throws(() => phase6ReorderDragCoordinates("<hierarchy />", {
    sourceLabel: "Bench Press",
    targetLabel: "Back Squat",
  }), /drag.*hierarchy|hierarchy.*drag/iu);

  const setup = readFileSync(
    path.join(projectRoot, "maestro/phase6/calendar-date-reorder.yaml"),
    "utf8",
  );
  const verify = readFileSync(
    path.join(projectRoot, "maestro/phase6/calendar-date-reorder-verify.yaml"),
    "utf8",
  );
  for (const month of [
    "CURRENT_MONTH",
    "NEXT_MONTH",
    "PREVIOUS_MONTH",
  ]) {
    assert.ok(
      setup.includes(`"^\${${month}}$"`),
      `missing \${${month}}`,
    );
  }
  assert.match(
    setup,
    /assertVisible: "\^\$\{CURRENT_MONTH\}\$"[\s\S]*swipe:[\s\S]*visible: "\^\$\{NEXT_MONTH\}\$"[\s\S]*swipe:[\s\S]*visible: "\^\$\{CURRENT_MONTH\}\$"/u,
  );
  assert.match(
    setup,
    /tapOn: "Previous month"[\s\S]*visible: "\^\$\{PREVIOUS_MONTH\}\$"[\s\S]*swipe:[\s\S]*visible: "\^\$\{CURRENT_MONTH\}\$"/u,
  );
  assert.doesNotMatch(setup, /longPressOn:|tapOn: "Move Bench Press up"/u);
  assert.match(setup, /id: "drag-exercise-Bench Press"/u);
  assert.match(verify, /Bench Press dragged to 1 of 2/u);
  assert.match(verify, /Drag Bench Press\. Position 1 of 2/u);
  assert.match(verify, /Drag Back Squat\. Position 2 of 2/u);
  const runner = readFileSync(
    path.join(projectRoot, "scripts/run-phase6-maestro.mjs"),
    "utf8",
  );
  assert.match(runner, /"-e", `CURRENT_MONTH=\$\{monthEnvironment\.current\}`/u);
  assert.match(runner, /calendar-date-reorder-verify\.yaml/u);
  assert.match(runner, /phase6-reorder-live-displacement\.png/u);
});

test("Phase 6 Samsung checklist is canonical, exact-byte, and observation-only", async () => {
  const {
    buildPhase6AttendedChecklist,
    createPhase6AttendedRecord,
    parsePhase6AttendedChecklistArguments,
    serializePhase6AttendedChecklist,
    validatePhase6AttendedRecordBytes,
    validatePhase6AttendedChecklist,
  } = await load("scripts/generate-phase6-attended-checklist.mjs");
  const candidate = fixtureCandidate();
  const evidenceDirectory = mkdtempSync(path.join(os.tmpdir(), "phase6-n4-test-"));
  test.after(() => rmSync(evidenceDirectory, { force: true, recursive: true }));
  const attachmentDigests = Object.fromEntries([
    "N4-01", "N4-02", "N4-03", "N4-04",
  ].map((id) => {
    const bytes = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      Buffer.from(id),
    ]);
    writeFileSync(path.join(evidenceDirectory, `${id}.png`), bytes);
    return [id, createHash("sha256").update(bytes).digest("hex")];
  }));
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
  assert.throws(() => validatePhase6AttendedChecklist({
    ...checklist,
    device: { ...device, installed_apk_sha256: SHA_A },
  }, {
    candidate,
    device: { ...device, installed_apk_sha256: SHA_A },
  }), /installed|candidate|identity/u);
  assert.throws(() => validatePhase6AttendedChecklist({
    ...checklist,
    private_note: "not allowed",
  }, { candidate, device }), /missing|reordered|extra|privacy/u);
  assert.throws(() => validatePhase6AttendedChecklist({
    ...checklist,
    device: { ...device, employee_id: "private" },
  }, { candidate, device: { ...device, employee_id: "private" } }),
  /missing|reordered|extra|privacy/u);
  assert.throws(() => validatePhase6AttendedChecklist({
    ...checklist,
    rows: checklist.rows.map((row, index) =>
      index === 0 ? { ...row, note: "private" } : row),
  }, { candidate, device }), /missing|reordered|extra|privacy/u);

  const checklistBytes = serializePhase6AttendedChecklist(checklist);
  const observations = {
    schema_version: 1,
    suite: "phase6-attended-observations",
    candidate_id: candidate.manifest.candidate_id,
    manifest_sha256: candidate.manifest_sha256,
    device,
    rows: checklist.rows.map(({ id }, index) => ({
      id,
      status: index === 3 ? "failed" : "passed",
      attachment_sha256: attachmentDigests[id],
    })),
  };
  const observationsBytes = serializePhase6AttendedChecklist(observations);
  const record = createPhase6AttendedRecord({
    candidate,
    checklist,
    checklistBytes,
    observations,
    observationsBytes,
    evidenceDirectory,
    recordedAt: "2026-08-31T15:00:00.000Z",
  });
  const recordBytes = serializePhase6AttendedChecklist(record);

  assert.equal(record.status, "failed");
  assert.equal(record.approval_status, "evidence_pending");
  assert.deepEqual(record.rows.map(({ id, status, attachment_sha256 }) => ({
    id, status, attachment_sha256,
  })), observations.rows);
  assert.doesNotThrow(() => validatePhase6AttendedRecordBytes({
    candidate,
    checklistBytes,
    observationsBytes,
    recordBytes,
    evidenceDirectory,
  }));
  const passedObservations = {
    ...observations,
    rows: observations.rows.map((row) => ({ ...row, status: "passed" })),
  };
  assert.equal(createPhase6AttendedRecord({
    candidate,
    checklist,
    checklistBytes,
    observations: passedObservations,
    observationsBytes: serializePhase6AttendedChecklist(passedObservations),
    evidenceDirectory,
    recordedAt: "2026-08-31T15:00:00.000Z",
  }).status, "passed");
  for (const mutation of [
    { ...observations, candidate_id: "substituted" },
    { ...observations, manifest_sha256: SHA_B },
    { ...observations, device: { ...device, model: "other" } },
    { ...observations, device: { ...device, employee_id: "private" } },
    { ...observations, rows: observations.rows.slice(1) },
    {
      ...observations,
      rows: observations.rows.map((row, index) =>
        index === 0 ? { ...row, attachment_sha256: SHA_A } : row),
    },
    {
      ...observations,
      rows: observations.rows.map((row, index) =>
        index === 0 ? { ...row, note: "private" } : row),
    },
    {
      ...observations,
      rows: observations.rows.map((row, index) =>
        index === 0 ? { ...row, status: "pending_human" } : row),
    },
    { ...observations, release_authorization: "approved" },
  ]) {
    assert.throws(() => createPhase6AttendedRecord({
      candidate,
      checklist,
      checklistBytes,
      observations: mutation,
      observationsBytes: serializePhase6AttendedChecklist(mutation),
      evidenceDirectory,
      recordedAt: "2026-08-31T15:00:00.000Z",
    }), /Phase 6 attended|identity|row|privacy|release/u);
  }

  assert.deepEqual(parsePhase6AttendedChecklistArguments([
    "prepare",
    "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", SHA_A,
    "--serial", "device-1",
    "--output", "artifacts/release-candidate/evidence/n4-pending.json",
  ]), {
    mode: "prepare",
    bundleDirectory: "artifacts/release-candidate",
    expectedManifestSha256: SHA_A,
    serial: "device-1",
    output: "artifacts/release-candidate/evidence/n4-pending.json",
  });
  assert.deepEqual(parsePhase6AttendedChecklistArguments([
    "record",
    "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", SHA_A,
    "--checklist", "pending.json",
    "--observations", "observations.json",
    "--evidence-dir", "attachments",
    "--output", "artifacts/release-candidate/evidence/n4-record.json",
  ]).mode, "record");
  assert.deepEqual(parsePhase6AttendedChecklistArguments([
    "verify",
    "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", SHA_A,
    "--checklist", "pending.json",
    "--observations", "observations.json",
    "--evidence-dir", "attachments",
    "--record", "record.json",
  ]).mode, "verify");
  for (const invalid of [
    [],
    ["unknown"],
    ["prepare", "--bundle-dir", "bundle"],
    ["verify", "--bundle-dir", "bundle", "--manifest-sha256", "bad",
      "--checklist", "pending.json", "--observations", "observations.json",
      "--record", "record.json"],
  ]) {
    assert.throws(
      () => parsePhase6AttendedChecklistArguments(invalid),
      /Phase 6 attended|argument|manifest/u,
    );
  }
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
  assert.equal(
    packageJson.scripts["prepare:attended:phase6"],
    "node scripts/generate-phase6-attended-checklist.mjs prepare",
  );
  assert.equal(
    packageJson.scripts["record:attended:phase6"],
    "node scripts/generate-phase6-attended-checklist.mjs record",
  );
  assert.equal(
    packageJson.scripts["verify:attended:phase6"],
    "node scripts/generate-phase6-attended-checklist.mjs verify",
  );
  assert.ok(workflow.includes("npm run test:evidence:phase6"));
  assert.ok(workflow.includes(exactRunner));
});

test("Phase 6 plan hashes the canonical release-candidate manifest bytes", () => {
  const plan = readFileSync(
    path.join(
      projectRoot,
      ".planning/phases/06-material-3-ux-remediation/06-09-PLAN.md",
    ),
    "utf8",
  );
  const validation = readFileSync(
    path.join(
      projectRoot,
      ".planning/phases/06-material-3-ux-remediation/06-VALIDATION.md",
    ),
    "utf8",
  );

  for (const source of [plan, validation]) {
    assert.match(
      source,
      /shasum -a 256 artifacts\/release-candidate\/release-candidate\.json/u,
    );
    assert.doesNotMatch(source, /artifacts\/release-candidate\/build\.json/u);
    assert.doesNotMatch(
      source,
      /require\(['"]\.\/artifacts\/release-candidate/u,
    );
  }
});
