import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PHASE7_CONSIDERATION_CONTRACTS,
  PHASE7_MAESTRO_FLOW_CONTRACTS,
  PHASE7_NATIVE_BACKSTOPS,
  parsePhase7MaestroArguments,
  phase7NativeHeldDragCommands,
  phase7NativeDragMoveSequence,
  phase7ReorderCoordinates,
  phase7ReorderOrderIs,
  phase7PlanOrderIs,
  phase7PlanReorderCoordinates,
} from "./run-phase7-maestro.mjs";
import {
  PHASE7_N4_ROWS,
  parsePhase7AttendedChecklistArguments,
} from "./generate-phase7-attended-checklist.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runnerPath = path.join(projectRoot, "scripts/run-phase7-maestro.mjs");
const checklistPath = path.join(projectRoot, "scripts/generate-phase7-attended-checklist.mjs");
const packagePath = path.join(projectRoot, "package.json");
const workflowPath = path.join(projectRoot, ".github/workflows/release-candidate.yml");
const restDockPath = path.join(projectRoot, "src/ui/components/RestDock.tsx");

const REQUIRED_FLOW_IDS = Object.freeze([
  "phase7-today-settings",
  "phase7-workout-removal-audio",
  "phase7-plan-schedule-reorder",
  "phase7-icon-navigation-accessibility",
]);

const REQUIRED_CONSIDERATION_IDS = Object.freeze([
  "UX-11", "UX-12", "UX-13", "UX-14", "UX-15", "UX-16",
  "UX-17", "UX-18", "UX-19", "UX-20", "UX-21", "UX-22",
  "UI-E01", "UI-E02", "UI-E03", "UI-E04", "UI-E05", "UI-E06",
  "UI-E07", "UI-E08", "UI-B01", "UI-B02", "UI-B03", "UI-B04",
  "UI-B05",
]);

test("Phase 7 tooling owns the full executable UX/UI matrix", () => {
  assert.equal(existsSync(runnerPath), true, "the Phase 7 runner must exist");
  const source = readFileSync(runnerPath, "utf8");
  assert.match(source, /PHASE7_MAESTRO_FLOW_CONTRACTS/u);
  for (const id of REQUIRED_FLOW_IDS) assert.match(source, new RegExp(id, "u"));
  for (const id of REQUIRED_CONSIDERATION_IDS) assert.match(source, new RegExp(id, "u"));
  assert.match(source, /executed Maestro flow bytes changed/u);
  assert.match(source, /candidate APK bytes do not match/u);
  assert.match(source, /release boundary|release authority/u);
  assert.deepEqual(
    PHASE7_MAESTRO_FLOW_CONTRACTS.map(({ id }) => id),
    REQUIRED_FLOW_IDS,
  );
  assert.deepEqual(
    PHASE7_CONSIDERATION_CONTRACTS.map(({ id }) => id),
    REQUIRED_CONSIDERATION_IDS,
  );
  const flowIds = new Set(REQUIRED_FLOW_IDS);
  for (const consideration of PHASE7_CONSIDERATION_CONTRACTS) {
    assert.equal(typeof consideration.owner, "string");
    assert.equal(consideration.owner.length > 0, true);
    assert.equal(consideration.automated_checks.length > 0, true);
    assert.equal(consideration.flows.length + consideration.native_backstops.length > 0, true);
    for (const flowId of consideration.flows) assert.equal(flowIds.has(flowId), true);
  }
  assert.deepEqual(PHASE7_NATIVE_BACKSTOPS, [{
    id: "N4",
    status: "pending_human",
    description: "Samsung exact-byte aggregated observation-only Phase 7 review.",
    flow_ids: [],
  }]);
});

test("Phase 7 consideration checks resolve to tracked local files", () => {
  for (const { id, automated_checks: automatedChecks } of PHASE7_CONSIDERATION_CONTRACTS) {
    for (const check of automatedChecks) {
      assert.equal(
        existsSync(path.resolve(projectRoot, check)),
        true,
        `${id} cites a missing local check: ${check}`,
      );
    }
  }
});

test("Phase 7 Maestro flows use source-aligned interactive labels and routes", () => {
  const flowSource = (name) => readFileSync(
    path.join(projectRoot, "maestro/phase7", name),
    "utf8",
  );

  const todaySettings = flowSource("today-settings.yaml");
  assert.match(todaySettings, /- tapOn: "Settings"/u);
  assert.match(todaySettings, /- tapOn: "Removed sessions"/u);
  assert.match(todaySettings, /- assertVisible: "Removed sessions"/u);
  assert.doesNotMatch(todaySettings, /tapOn: "(?:Open Settings|History and data)"/u);

  const workoutRemovalAudio = flowSource("workout-removal-audio.yaml");
  assert.match(workoutRemovalAudio, /- tapOn:\n    id: "remove-warmup-confirm"\n- extendedWaitUntil:\n    visible: "Warm-up W1 removed"/u);
  assert.match(workoutRemovalAudio, /- assertNotVisible: "Remove warm-up W1"/u);
  assert.match(workoutRemovalAudio, /- tapOn: "Complete Set 1"[\s\S]*?- extendedWaitUntil:\n    visible: "Rest ended"\n    timeout: 240000/u);
  assert.doesNotMatch(workoutRemovalAudio, /- tapOn: "Cancel"/u);
  assert.match(workoutRemovalAudio, /- assertVisible: "Today"\n- tapOn: "Settings"/u);
  assert.doesNotMatch(workoutRemovalAudio, /tapOn: "Open Settings"/u);

  const planScheduleReorder = flowSource("plan-schedule-reorder.yaml");
  assert.match(planScheduleReorder, /true: \$\{REORDER_STAGE == 'plan-day-ready'\}[\s\S]*?id: "drag-day-Full Body A"/u);
  assert.match(planScheduleReorder, /- tapOn: "Activate Full Body Foundation"[\s\S]*?- tapOn: "Schedule"/u);
  assert.match(planScheduleReorder, /visible: "Edit schedule"/u);
  assert.match(planScheduleReorder, /true: \$\{REORDER_STAGE == 'weekday-ready'\}[\s\S]*?id: "drag-weekday-0-Monday-.*"[\s\S]*?above:[\s\S]*?id: "drag-weekday-0-Wednesday-.*"/u);
  assert.match(planScheduleReorder, /true: \$\{REORDER_STAGE == 'rotation-ready'\}[\s\S]*?- tapOn: "\^Rotation\$"[\s\S]*?id: "drag-rotation-.*-0"[\s\S]*?above:[\s\S]*?id: "drag-rotation-.*-1"/u);
  assert.match(planScheduleReorder, /true: \$\{REORDER_STAGE == 'weekday-save'\}[\s\S]*?- tapOn: "Save schedule"[\s\S]*?- stopApp[\s\S]*?- tapOn: "Schedule"[\s\S]*?id: "drag-weekday-0-Wednesday-.*"/u);
  assert.match(planScheduleReorder, /true: \$\{REORDER_STAGE == 'rotation-save'\}[\s\S]*?- tapOn: "Save schedule"[\s\S]*?- stopApp[\s\S]*?- tapOn: "Schedule"[\s\S]*?id: "drag-rotation-.*-0"/u);
  const reorderComponent = readFileSync(
    path.join(projectRoot, "src/ui/components/PlanEditorFields.tsx"),
    "utf8",
  );
  assert.equal(
    reorderComponent.includes('accessibilityLabel={`Reorder ${label}`}'),
    true,
  );
  const runner = readFileSync(runnerPath, "utf8");
  assert.match(runner, /executePhase7HeldDrag\(adbPath, options\.serial, PLAN_DAY_REORDER\)[\s\S]*?phase7-plan-day-reorder\.png/u);
  assert.match(runner, /executePhase7PlanReorderEvidence\(adbPath, options\.serial, flowDirectory\)/u);
  assert.match(runner, /aggregatePhase7StageReports\(completedStages\)/u);
  assert.match(runner, /"plan-day-ready", "plan-exercise-ready", "weekday-ready"/u);
  assert.match(runner, /WEEKDAY_PERSISTED_ORDER/u);
  assert.match(runner, /ROTATION_PERSISTED_ORDER/u);
  assert.match(runner, /phase7-weekday-schedule-reorder\.png/u);
  assert.match(runner, /phase7-rotation-schedule-reorder\.png/u);
  assert.doesNotMatch(planScheduleReorder, /takeScreenshot: phase7-(?:plan-selected-day|weekday-schedule-reorder|rotation-schedule-reorder)/u);
  assert.deepEqual(
    [...planScheduleReorder.matchAll(/REORDER_STAGE == '([^']+)'/gu)]
      .map(([, stage]) => stage)
      .filter((stage, index, stages) => stages.indexOf(stage) === index),
    [
      "plan-day-ready", "plan-exercise-ready", "weekday-ready",
      "weekday-save", "rotation-ready", "rotation-save",
    ],
  );
  assert.doesNotMatch(runner, /phase7-schedule-reorder\.png/u);
  assert.doesNotMatch(planScheduleReorder, /(?:longPressOn|pressKey: ARROW_DOWN)/u);
  assert.doesNotMatch(planScheduleReorder, /assertVisible: "Selected day"/u);

  const restDock = readFileSync(restDockPath, "utf8");
  assert.match(restDock, /!\[3, 2, 1, 0\]\.includes\(remainingSeconds\)/u);
  assert.match(restDock, /remainingSeconds === 0[\s\S]*playLongCue()[\s\S]*playShortCue()/u);
  assert.doesNotMatch(restDock, /audible hardware|sound quality/u);

  const iconNavigation = flowSource("icon-navigation-accessibility.yaml");
  assert.match(iconNavigation, /- tapOn: "Settings"/u);
  assert.doesNotMatch(iconNavigation, /tapOn: "Open Settings"/u);
  assert.doesNotMatch(iconNavigation, /phase7-icon-launcher/u);

  const iconFlow = PHASE7_MAESTRO_FLOW_CONTRACTS.find(({ id }) =>
    id === "phase7-icon-navigation-accessibility");
  assert.deepEqual(iconFlow.screenshots, [
    "phase7-navigation-200pct.png",
    "phase7-settings-200pct.png",
  ]);

  const launcherEvidence = PHASE7_CONSIDERATION_CONTRACTS.find(({ id }) => id === "UI-B04");
  assert.equal(launcherEvidence.owner, "07-10 attended-only launcher evidence");
  assert.deepEqual(launcherEvidence.flows, []);
  assert.deepEqual(launcherEvidence.native_backstops, ["N4"]);
});

test("Phase 7 plan evidence uses live native held drag, not simulated gestures", () => {
  const hierarchy = [
    '<node resource-id="drag-exercise-Bench Press" content-desc="Reorder Bench Press" bounds="[120,640][240,720]"/>',
    '<node resource-id="drag-exercise-Back Squat" content-desc="Reorder Back Squat" bounds="[120,480][240,560]"/>',
  ].join("");
  const nativeHierarchy = [
    '<node resource-id="drag-exercise-Bench Press" content-desc="Drag Bench Press. Position 2 of 2" bounds="[120,640][240,720]"/>',
    '<node resource-id="drag-exercise-Back Squat" content-desc="Drag Back Squat. Position 1 of 2" bounds="[120,480][240,560]"/>',
  ].join("");
  const drag = phase7PlanReorderCoordinates(hierarchy);
  assert.deepEqual(drag, { startX: 180, startY: 680, endX: 180, endY: 520 });
  assert.deepEqual(phase7NativeHeldDragCommands(drag), {
    down: ["shell", "input", "touchscreen", "motionevent", "DOWN", "180", "680"],
    up: ["shell", "input", "touchscreen", "motionevent", "UP", "180", "520"],
  });
  assert.equal(phase7NativeDragMoveSequence(drag).length, 12);
  assert.equal(phase7PlanOrderIs(hierarchy, "Back Squat", "Bench Press"), true);
  assert.equal(phase7PlanOrderIs(hierarchy, "Bench Press", "Back Squat"), false);
  assert.equal(phase7PlanOrderIs(nativeHierarchy, "Back Squat", "Bench Press"), true);
  assert.throws(() => phase7PlanReorderCoordinates("<node/>"), /drag hierarchy/u);
});

test("Phase 7 schedule evidence binds Weekday and Rotation screenshots to native schedule-row drags", () => {
  const weekdayHierarchy = [
    '<node resource-id="drag-weekday-0-Monday-day-first" content-desc="Reorder First" bounds="[120,480][240,560]"/>',
    '<node resource-id="drag-weekday-0-Wednesday-day-second" content-desc="Reorder Second" bounds="[120,640][240,720]"/>',
  ].join("");
  const rotationHierarchy = [
    '<node resource-id="drag-rotation-day-first-0" content-desc="Reorder First" bounds="[120,480][240,560]"/>',
    '<node resource-id="drag-rotation-day-second-1" content-desc="Reorder Second" bounds="[120,640][240,720]"/>',
  ].join("");

  assert.deepEqual(phase7ReorderCoordinates(weekdayHierarchy, {
    source: { idPattern: /^drag-weekday-[^-]+-[^-]+-.+$/u, label: "First" },
    target: { idPattern: /^drag-weekday-[^-]+-[^-]+-.+$/u, label: "Second" },
  }), { startX: 180, startY: 520, endX: 180, endY: 680 });
  assert.equal(phase7ReorderOrderIs(weekdayHierarchy, {
    first: { idPattern: /^drag-weekday-[^-]+-[^-]+-.+$/u, label: "First" },
    second: { idPattern: /^drag-weekday-[^-]+-[^-]+-.+$/u, label: "Second" },
  }), true);
  assert.equal(phase7ReorderOrderIs(rotationHierarchy, {
    first: { idPattern: /^drag-rotation-.+-\d+$/u, label: "First" },
    second: { idPattern: /^drag-rotation-.+-\d+$/u, label: "Second" },
  }), true);

  const scheduleFlow = PHASE7_MAESTRO_FLOW_CONTRACTS.find(({ id }) =>
    id === "phase7-plan-schedule-reorder");
  assert.deepEqual(scheduleFlow.screenshots, [
    "phase7-plan-selected-day.png",
    "phase7-plan-day-reorder.png",
    "phase7-plan-exercise-reorder.png",
    "phase7-weekday-schedule-reorder.png",
    "phase7-rotation-schedule-reorder.png",
  ]);
});

test("Phase 7 attended evidence stays exact-byte, N4-only, and observation-only", () => {
  assert.equal(existsSync(checklistPath), true, "the Phase 7 N4 checklist must exist");
  const source = readFileSync(checklistPath, "utf8");
  assert.match(source, /SM-S916B/u);
  assert.match(source, /phase7-attended/u);
  assert.match(source, /observation-only/u);
  assert.match(source, /N4-01/u);
  assert.match(source, /N4-05/u);
  for (const forbidden of [
    "approval", "owner_approval", "promotion", "publication",
    "release_authorization", "terminal_seal", "tag",
  ]) {
    assert.match(source, new RegExp(`\"${forbidden}\"`, "u"));
  }
  assert.deepEqual(PHASE7_N4_ROWS.map(({ id }) => id), [
    "N4-01", "N4-02", "N4-03", "N4-04", "N4-05",
  ]);
});

test("package scripts only delegate Phase 7 evidence operations to Phase 7 owners", () => {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  assert.deepEqual({
    "test:maestro:phase7": packageJson.scripts["test:maestro:phase7"],
    "prepare:attended:phase7": packageJson.scripts["prepare:attended:phase7"],
    "record:attended:phase7": packageJson.scripts["record:attended:phase7"],
    "verify:attended:phase7": packageJson.scripts["verify:attended:phase7"],
  }, {
    "test:maestro:phase7": "node scripts/run-phase7-maestro.mjs",
    "prepare:attended:phase7": "node scripts/generate-phase7-attended-checklist.mjs prepare",
    "record:attended:phase7": "node scripts/generate-phase7-attended-checklist.mjs record",
    "verify:attended:phase7": "node scripts/generate-phase7-attended-checklist.mjs verify",
  });
});

test("Phase 7 command parsing rejects package, stale-manifest, and malformed CLI identity", () => {
  const base = [
    "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", "a".repeat(64),
    "--package", "com.fchoo.gymtracker",
    "--serial", "emulator-5554",
    "--output", "artifacts/release-candidate/evidence/phase7.json",
    "--report-dir", "artifacts/release-candidate/evidence/phase7-maestro",
  ];
  assert.equal(parsePhase7MaestroArguments(base).packageName, "com.fchoo.gymtracker");
  assert.throws(() => parsePhase7MaestroArguments(base.map((value) =>
    value === "com.fchoo.gymtracker" ? "com.fchoo.gymtracker.devtest" : value)), /identity/u);
  assert.throws(() => parsePhase7MaestroArguments(base.map((value) =>
    value === "a".repeat(64) ? "stale" : value)), /identity/u);
  assert.throws(() => parsePhase7MaestroArguments([...base, "--unexpected", "value"]), /malformed/u);

  assert.equal(parsePhase7AttendedChecklistArguments([
    "prepare", "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", "b".repeat(64), "--serial", "R5CT1234",
    "--output", "artifacts/release-candidate/evidence/phase7-n4.json",
  ]).mode, "prepare");
  assert.throws(() => parsePhase7AttendedChecklistArguments([
    "prepare", "--bundle-dir", "artifacts/release-candidate",
    "--manifest-sha256", "b".repeat(64), "--serial", "not safe!",
    "--output", "artifacts/release-candidate/evidence/phase7-n4.json",
  ]), /identity/u);
});

test("release candidate workflow proves native Phase 2 before one verified production build and Phase 7 evidence", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const phase7SourceTest = workflow.indexOf("node --test scripts/phase7-evidence-scripts.test.mjs");
  const iconContract = workflow.indexOf(
    "node --test scripts/concept-g-image-contract.test.mjs",
  );
  const phase2Build = workflow.indexOf("npm run android:devtest:fresh -- --suite phase2");
  const phase2Sqlite = workflow.indexOf("npm run test:sqlite:device -- --suite phase2 --manifest artifacts/native/phase2/build.json");
  const candidateBuild = workflow.indexOf("./scripts/build-release-candidate-once.sh --output-dir artifacts/release-candidate");
  const manifestVerification = workflow.indexOf("node scripts/verify-release-candidate-manifest.mjs --bundle-dir artifacts/release-candidate");
  const phase7Evidence = workflow.indexOf("npm run test:maestro:phase7 -- --bundle-dir artifacts/release-candidate");

  for (const position of [phase7SourceTest, iconContract, phase2Build, phase2Sqlite, candidateBuild, manifestVerification, phase7Evidence]) {
    assert.notEqual(position, -1);
  }
  assert.equal(iconContract < candidateBuild, true);
  assert.equal(phase7SourceTest < phase2Build, true);
  assert.equal(phase2Build < phase2Sqlite, true);
  assert.equal(phase2Sqlite < candidateBuild, true);
  assert.equal(candidateBuild < manifestVerification, true);
  assert.equal(manifestVerification < phase7Evidence, true);
  assert.equal((workflow.match(/build-release-candidate-once\.sh/g) ?? []).length, 1);

  const immutableEvidenceSlice = workflow.slice(manifestVerification, phase7Evidence + 500);
  assert.doesNotMatch(immutableEvidenceSlice, /android:devtest:fresh|assembleRelease|expo (?:prebuild|run)|gradlew|build-release-candidate-once/u);
  assert.match(immutableEvidenceSlice, /--manifest-sha256 "\$\{\{ steps\.candidate_manifest\.outputs\.manifest_sha256 \}\}"/u);
  assert.match(workflow, /verify-release-candidate-manifest\.mjs --bundle-dir artifacts\/release-candidate/u);
  assert.doesNotMatch(workflow, /(?:release-promotion|create release|gh release|Terminal Seal)/iu);
});
