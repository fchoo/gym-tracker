import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadV12VisualAuthority, v12VisualStateAuthority } from "./v12-visual-authority.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = ".planning/design/v1.2-browser-evidence";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sourceFile = (relative) => readFileSync(path.join(root, relative));
const phase20ActiveSessionId = "session_1790818860000_alternate_day_plan_day_plan_copy_1790815260000_0";
const nativeOnlyStates = [
  { id: "NV-GARMIN-LOGIN", name: "garmin-login", route: "/garmin/index", action: "Connect Garmin" },
  { id: "NV-GARMIN-MFA", name: "garmin-mfa", route: "/garmin/index", action: "Continue" },
  { id: "NV-GARMIN-SESSION-EXPIRED", name: "garmin-session-expired", route: "/garmin/index", action: "Sign in again" },
];
const progressRouteParams = (name) => ({
  sport: name.includes("running") ? "Running" : name.includes("strength") || name === "progress-recommendation" ? "Strength" : "All",
  period: name.endsWith("-12w") ? "12_weeks" : name.endsWith("-all") && name !== "progress-all" ? "all_time" : "4_weeks",
});

const fixtureVariantFor = (index, name) => {
  if (name !== "progress-settings") return name;
  return ({ 83: "progress-settings-ready", 85: "progress-settings-empty", 87: "progress-settings-sparse", 89: "progress-settings-loading" })[index] ?? name;
};

const destinationFor = (name) => {
  if (["appearance", "workout-root", "workout-day-0", "workout-day-1", "workout-day-2", "workout-day-3", "workout-day-4"].includes(name)) {
    return { route: "/(tabs)", component: "TodayScreen", route_params: {} };
  }
  if (name.startsWith("active-") || name.startsWith("warmup-") || name.startsWith("working-") || name.startsWith("rest-") || ["view-back-squat-trend", "open-back-squat-menu", "set-action-menu"].includes(name)) {
    return { route: "/workout/[sessionId]", component: "ActiveWorkoutScreen", route_params: { sessionId: phase20ActiveSessionId, returnTo: "/(tabs)" } };
  }
  if (name === "calendar-planned-strength-detail") {
    return { route: "/calendar/plan/[occurrenceId]", component: "PlannedWorkoutDetailScreen", route_params: { occurrenceId: "phase20-strength-occurrence", origin: "calendar" } };
  }
  if (name.startsWith("calendar-")) return { route: "/(tabs)/calendar", component: "CalendarScreen", route_params: {} };
  if (["library-plans", "plan-filters", "library-actions", "library-exercises"].includes(name)) return { route: "/(tabs)/library", component: "LibraryScreen", route_params: {} };
  if (["library-plan-foundation", "library-plan-strength", "archive-confirmation"].includes(name)) return { route: "/library/plan/[planId]", component: "OwnedPlanDetailScreen", route_params: { planId: name === "library-plan-strength" ? "phase20-strength-reset" : "phase20-strength-foundation" } };
  if (["library-plan-beginner", "library-plan-home"].includes(name)) return { route: "/library/starter/[templateId]", component: "StarterPlanDetailScreen", route_params: { templateId: name === "library-plan-home" ? "minimal-equipment-full-body" : "full-body-foundation" } };
  if (name === "starter-activation-preview") return { route: "/library/starter/[templateId]/activate", component: "StarterActivationScreen", route_params: { templateId: "full-body-foundation" } };
  if (name === "strength-editor") return { route: "/library/plan/[planId]/edit", component: "OwnedPlanEditorScreen", route_params: { planId: "phase20-strength-foundation" } };
  if (name === "schedule-editor") return { route: "/library/plan/[planId]/schedule", component: "ScheduleEditorScreen", route_params: { planId: "phase20-strength-foundation" } };
  if (name === "library-plan-running-2k") return { route: "/library/running/[planId]", component: "RunningPlanDetailScreen", route_params: { planId: "phase20-running-2k" } };
  if (name === "running-editor") return { route: "/library/running/[planId]/edit", component: "RunningPlanEditorScreen", route_params: { planId: "phase20-running-2k" } };
  if (name.startsWith("running-session-")) return { route: "/library/running/[planId]/session/[sessionId]", component: "RunningSessionEditorScreen", route_params: { planId: "phase20-running-2k", sessionId: `phase20-${name.slice("running-session-".length)}` } };
  if (name === "plan-type-chooser") return { route: "/library/plan/create", component: "PlanTypeChooserScreen", route_params: {} };
  if (name === "create-strength") return { route: "/library/plan/create-strength", component: "OwnedPlanEditorScreen", route_params: {} };
  if (name === "create-running") return { route: "/library/running/create", component: "RunningPlanEditorScreen", route_params: {} };
  if (name === "exercise-back-squat") return { route: "/library/exercise/[exerciseId]", component: "ExerciseDetailScreen", route_params: { exerciseId: "5f140001-7e35-4a6d-9100-000000000001" } };
  if (name === "exercise-tempo-goblet") return { route: "/library/exercise/[exerciseId]/edit", component: "ExerciseEditorScreen", route_params: { exerciseId: "phase20-tempo-goblet-squat" } };
  if (name === "custom-exercise-create") return { route: "/library/exercise/create", component: "ExerciseEditorScreen", route_params: {} };
  if (name.startsWith("strength-detail-")) {
    const exercise = name.endsWith("squat")
      ? ["5f140001-7e35-4a6d-9100-000000000001", "Back Squat"]
      : name.endsWith("bench")
        ? ["5f140001-7e35-4a6d-9100-000000000002", "Bench Press"]
        : ["5f140001-7e35-4a6d-9100-000000000005", "Plank"];
    return { route: "/exercise-history/[exerciseId]", component: "ExerciseHistoryScreen", route_params: { exerciseId: exercise[0], exerciseName: exercise[1], origin: "progress" } };
  }
  if (name.startsWith("progress-") || name.startsWith("running-effort-") || name.startsWith("running-target-") || name === "bodyweight-history") return { route: "/(tabs)/progress", component: "ProgressScreen", route_params: progressRouteParams(name) };
  if (["garmin-outdoor", "garmin-treadmill"].includes(name)) return { route: "/garmin/activity/[activityId]", component: "ImportedActivityDetailScreen", route_params: { activityId: name === "garmin-outdoor" ? "phase20-garmin-outdoor" : "phase20-garmin-treadmill", origin: "workout" } };
  if (name.includes("match") || name.includes("confirmed")) return { route: "/garmin/match/[activityId]", component: "ActivityMatchScreen", route_params: { activityId: name.includes("treadmill") ? "phase20-garmin-treadmill" : "phase20-garmin-outdoor", origin: "workout" } };
  if (name.startsWith("garmin-")) return { route: "/garmin/index", component: "GarminSyncScreen", route_params: { origin: "workout" } };
  throw new Error(`phase20_visual_state_destination_missing:${name}`);
};

const fixtureSeedFor = (index) => index < 7 ? "phase20-shell-workout"
  : index < 21 ? "phase20-active-workout"
  : index < 33 ? "phase20-calendar"
  : index < 60 ? "phase20-library-running"
  : index < 91 ? "phase20-progress"
  : "phase20-garmin-visual";

const readinessTestIdFor = (component, name) => ({
  appearance: "app-settings-sheet",
  "active-set-editor": "workout-set-editor-sheet",
  "active-plan-settings": "workout-plan-settings-sheet",
  "view-back-squat-trend": "exercise-trend-sheet",
  "open-back-squat-menu": "exercise-actions-sheet",
  "active-exercise-picker": "add-exercise-sheet",
  "set-action-menu": "add-set-sheet",
  "calendar-key": "calendar-key-sheet",
  "calendar-agenda-2026-10-07": "calendar-agenda-region",
  "calendar-agenda-2026-10-04": "calendar-agenda-region",
  "calendar-agenda-2026-10-09": "calendar-agenda-region",
  "calendar-agenda-2026-10-10": "calendar-agenda-region",
  "calendar-agenda-2026-10-05": "calendar-agenda-region",
  "calendar-adjacent-week": "calendar-agenda-region",
  "plan-filters": "starter-filter-sheet-frame",
  "library-actions": "library-actions-sheet-frame",
  "create-strength": "owned-plan-create",
  "progress-recommendation": "recommendation-review-sheet",
  "running-effort-2.4": "running-history-sheet",
  "running-effort-10": "running-history-sheet",
  "running-effort-hm": "running-history-sheet",
  "running-target-2.4": "running-target-sheet",
  "running-target-10": "running-target-sheet",
  "running-target-hm": "running-target-sheet",
  "bodyweight-history": "bodyweight-history-sheet",
  "progress-settings": "progress-settings-sheet",
}[name] ?? ({
  TodayScreen: "adaptive-screen", ActiveWorkoutScreen: "active-workout", CalendarScreen: "adaptive-screen",
  PlannedWorkoutDetailScreen: "adaptive-screen", LibraryScreen: "library-screen",
  OwnedPlanDetailScreen: "owned-plan-detail", StarterPlanDetailScreen: "starter-plan-detail",
  StarterActivationScreen: "starter-activation", OwnedPlanEditorScreen: "owned-plan-editor",
  ScheduleEditorScreen: "schedule-editor", RunningPlanDetailScreen: "running-plan-detail",
  RunningPlanEditorScreen: "running-plan-editor", RunningSessionEditorScreen: "running-session-editor",
  PlanTypeChooserScreen: "plan-type-chooser", ExerciseDetailScreen: "exercise-detail-screen",
  ExerciseEditorScreen: "exercise-editor-screen", ExerciseHistoryScreen: "exercise-history-screen", ProgressScreen: "progress-screen",
  GarminSyncScreen: "garmin-sync-screen", ImportedActivityDetailScreen: "imported-activity-detail-screen",
  ActivityMatchScreen: "activity-match-screen",
}[component]));

const scenarioStepsFor = (name) => {
  if (name === "appearance") return [{ action: "tap_id", value: "root-settings-trigger-index" }];
  if (name.startsWith("workout-day-")) {
    const dates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"];
    return [{ action: "tap_id", value: `workout-day-preview-${dates[Number(name.at(-1))]}` }];
  }
  if (name === "active-set-editor") return [{ action: "tap_text", value: "Current" }];
  if (name === "active-plan-settings") return [{ action: "tap_text", value: "More workout actions" }, { action: "tap_text", value: "Plan settings" }];
  if (name === "view-back-squat-trend") return [{ action: "tap_text", value: "View Back Squat trend" }];
  if (name === "open-back-squat-menu") return [{ action: "tap_text", value: "Open Back Squat menu" }];
  if (name === "active-exercise-picker") return [{ action: "tap_id", value: "add-exercise" }];
  if (name === "set-action-menu") return [{ action: "tap_text", value: "Add set" }];
  if (name === "calendar-key") return [{ action: "tap_id", value: "calendar-info-action" }];
  if (name === "calendar-next") return [{ action: "tap_text", value: "Show November 2026" }];
  if (name === "calendar-previous") return [{ action: "tap_text", value: "Show September 2026" }];
  if (name.startsWith("calendar-agenda-")) return [{ action: "tap_id", value: `calendar-day-${name.slice("calendar-agenda-".length)}` }];
  if (name === "calendar-adjacent-week") return [{ action: "tap_id", value: "calendar-day-2026-10-12" }];
  if (name === "calendar-collapsed") return [{ action: "tap_id", value: "calendar-day-2026-10-01" }, { action: "tap_text", value: "Collapse day and return to month" }];
  if (name === "plan-filters") return [{ action: "tap_id", value: "library-filters-chip" }];
  if (name === "library-actions") return [{ action: "tap_text", value: "Actions" }];
  if (name === "library-exercises") return [{ action: "tap_text", value: "Exercises" }];
  if (name === "archive-confirmation") return [{ action: "tap_text", value: "Archive plan" }];
  const steps = [];
  if (name === "progress-strength" || name.startsWith("progress-strength-") || name === "progress-recommendation") steps.push({ action: "tap_text", value: "Strength" });
  if (name.startsWith("progress-running") || name.startsWith("running-effort-") || name.startsWith("running-target-")) steps.push({ action: "tap_text", value: "Running" });
  if (name.endsWith("-12w")) steps.push({ action: "tap_text", value: "12 weeks" });
  if (name.endsWith("-all") && name !== "progress-all") steps.push({ action: "tap_text", value: "All time" });
  if (name.startsWith("running-effort-")) steps.push({ action: "tap_text", value: `Open best efforts for ${name.endsWith("2.4") ? "2.4 km" : name.endsWith("10") ? "10 km" : "Half Marathon"}` });
  if (name.startsWith("running-target-")) steps.push({ action: "tap_text", value: `Set target for ${name.endsWith("2.4") ? "2.4 km" : name.endsWith("10") ? "10 km" : "Half Marathon"}` });
  if (name === "progress-recommendation") steps.push({ action: "tap_text", value: "Review target for Back Squat" });
  if (name === "bodyweight-history") return [{ action: "tap_text", value: "Body metrics" }];
  if (name === "progress-settings") return [{ action: "tap_text", value: "Settings" }];
  if (name === "garmin-consent") return [{ action: "tap_text", value: "Connect Garmin" }];
  if (["garmin-syncing", "garmin-synced", "garmin-idempotent", "garmin-error"].includes(name)) return [{ action: "tap_text", value: "Sync now" }];
  return steps;
};

const readinessSemanticsFor = (component, name) => {
  if (component === "TodayScreen") return ["Workout"];
  if (component === "ActiveWorkoutScreen") return ["Active"];
  if (component === "CalendarScreen") return ["Calendar"];
  if (component === "PlannedWorkoutDetailScreen") return ["Workout preview"];
  if (component === "LibraryScreen") return ["Library"];
  if (component === "OwnedPlanDetailScreen") return [name === "library-plan-strength" ? "Strength Reset" : "Full Body Foundation"];
  if (component === "StarterPlanDetailScreen") return [name === "library-plan-home" ? "Minimal Equipment Full Body" : "Full Body Foundation"];
  if (component === "StarterActivationScreen") return ["Full Body Foundation"];
  if (component === "OwnedPlanEditorScreen") return [name === "create-strength" ? "Create plan" : "Plan editor"];
  if (component === "ScheduleEditorScreen") return ["Schedule"];
  if (component === "RunningPlanDetailScreen") return ["Running"];
  if (component === "RunningPlanEditorScreen") return [name === "create-running" ? "Create running plan" : "Edit running plan"];
  if (component === "RunningSessionEditorScreen") return ["Workout type"];
  if (component === "PlanTypeChooserScreen") return ["What are you training for?"];
  if (component === "ExerciseDetailScreen") return ["Back Squat"];
  if (component === "ExerciseEditorScreen") return [name === "custom-exercise-create" ? "Create exercise" : "Tempo Goblet Squat"];
  if (component === "ExerciseHistoryScreen") return [name.endsWith("squat") ? "Back Squat" : name.endsWith("bench") ? "Bench Press" : "Plank"];
  if (component === "ProgressScreen") return ["Progress"];
  if (component === "GarminSyncScreen") return ["Garmin Sync"];
  if (component === "ImportedActivityDetailScreen") return ["Activity detail"];
  if (component === "ActivityMatchScreen") return ["Match activity"];
  throw new Error(`phase20_visual_state_readiness_missing:${name}`);
};

function linesFor(entry) {
  return [...new Set(entry.text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 2
    && line !== "9:41" && line !== "▮ ◒" && !["Workout", "Calendar", "Library", "Progress"].includes(line)))];
}

function readinessFor(light, id, component, name, fixtureVariant, steps) {
  const specific = linesFor(light);
  const base = readinessSemanticsFor(component, name);
  const semantics = [...new Set([...base, ...specific.slice(-3)])];
  const controls = light.controls.filter(({ id: controlId, text }) => controlId || text).map(({ id: controlId, text }, index) => ({
    id: controlId || null,
    label: text || null,
    order: index,
  }));
  const sourceIds = light.controls.map(({ id: controlId }) => controlId).filter(Boolean);
  const screenTestId = readinessTestIdFor(component, "");
  const readyTestId = readinessTestIdFor(component, name);
  return {
    status: name.includes("loading") || name === "garmin-syncing" ? "loading" : "ready",
    screen_test_id: screenTestId,
    test_id: readyTestId,
    test_ids: [...new Set([screenTestId, readyTestId, `phase20-visual-state-${id}`, ...sourceIds])],
    semantics,
    actions: controls,
    order: semantics,
    non_color: specific.filter((value) => /(Active|Completed|Current|Planned|REST|Loading|Ready|Sparse|Empty|connected|revoked|Sync|Match|Imported|No )/u.test(value)).slice(0, 4).concat(semantics.slice(-1)).filter((value, index, values) => values.indexOf(value) === index),
    focus: { target: light.controls.find(({ id: controlId }) => controlId)?.id ?? steps[0]?.value ?? "screen-heading", required: true },
    source_receipt: { assertions: [`state:${name}`, `fixture:${fixtureVariant}`, `theme:${light.theme}`] },
  };
}

const authority = loadV12VisualAuthority({ root });
const walk = authority.walk;

const states = walk.slice(0, 107).map((light, index) => {
  const dark = walk[index + 107];
  if (!light || !dark || light.name !== dark.name || light.theme !== "light" || dark.theme !== "dark") throw new Error(`phase20_visual_walk_pair_invalid:${index}`);
  const browserStateName = light.name;
  const name = browserStateName;
  const destination = destinationFor(name);
  const png = { light: `light-${browserStateName}.png`, dark: `dark-${browserStateName}.png` };
  const hasPng = existsSync(path.join(root, evidence, png.light)) && existsSync(path.join(root, evidence, png.dark));
  const controls = light.controls.map((control) => ({ id: control.id, text: control.text, data: control.data }));
  const fixtureVariant = fixtureVariantFor(index, name);
  const scenarioSteps = scenarioStepsFor(name);
  const sourceBinding = v12VisualStateAuthority(authority, light, dark);
  return {
    id: `BW-${String(index + 1).padStart(3, "0")}`, name, ...destination,
    fixture_id: "v12-synthetic-fixtures-r18", fixture_seed: fixtureSeedFor(index), scenario: name, fixture_variant: fixtureVariant,
    fixture_facts: { date: "2026-10-01", locale: "en-SG", timezone: "Asia/Singapore", sqlite: "authoritative-synthetic" },
    interactions: controls, expected_visible_semantics: controls.filter((control) => control.text).map((control) => control.text),
    focus_target: controls.find((control) => control.id)?.id || controls.find((control) => control.text)?.text || "screen-heading",
    scenario_steps: scenarioSteps,
    readiness: readinessFor(light, `BW-${String(index + 1).padStart(3, "0")}`, destination.component, name, fixtureVariant, scenarioSteps),
    evidence_scope: index >= 91 ? "visual_only" : "production_screen",
    reference: hasPng
      ? { kind: "retained_png", light: { path: `${evidence}/${png.light}`, sha256: sha256(sourceFile(`${evidence}/${png.light}`)) }, dark: { path: `${evidence}/${png.dark}`, sha256: sha256(sourceFile(`${evidence}/${png.dark}`)) }, source: { kind: "approved_source", ...sourceBinding } }
      : { kind: "approved_source", ...sourceBinding },
  };
});
if (new Set(states.map((state) => state.id)).size !== 107 || new Set(states.map((state) => `${state.id}:${state.name}`)).size !== 107) throw new Error("phase20_visual_state_duplicate");
const output = `// Generated by scripts/generate-phase20-visual-state-registry.mjs; do not edit.\nexport const PHASE20_VISUAL_STATE_REGISTRY = ${JSON.stringify(states, null, 2)} as const;\nexport type Phase20VisualState = (typeof PHASE20_VISUAL_STATE_REGISTRY)[number];\n`;
const nativeOutput = `export const PHASE20_NATIVE_ONLY_VISUAL_STATES = ${JSON.stringify(nativeOnlyStates, null, 2)} as const;\n`;
writeFileSync(path.join(root, "src/testing/phase20VisualStateRegistry.generated.ts"), `${output}${nativeOutput}`);
writeFileSync(path.join(root, "src/testing/phase20VisualStateRegistry.json"), `${JSON.stringify(states, null, 2)}\n`);

const yamlStep = (step) => step.action === "tap_id"
  ? `      - tapOn: { id: ${JSON.stringify(step.value)} }`
  : `      - tapOn: { text: ${JSON.stringify(step.value)} }`;
const scenarioFlows = states.filter(({ scenario_steps: steps }) => steps.length > 0).flatMap((state) => [
  "- runFlow:",
  "    when:",
  `      true: \${VISUAL_MODE == 'capture' && VISUAL_STATE == '${state.id}'}`,
  "    commands:",
  ...state.scenario_steps.map(yamlStep),
]);
const flow = [
  "appId: com.fchoo.gymtracker.devtest",
  "name: Phase 20 production visual registry probe",
  "tags: [v1.2, phase-20, visual, synthetic-fixture]",
  "---",
  "- assertTrue: \${VISUAL_LINK != null && VISUAL_STATE != null && VISUAL_SCREEN_ID != null && VISUAL_READY_ID != null && (VISUAL_MODE == 'capture' || VISUAL_MODE == 'reset')}",
  "- openLink: \"\${VISUAL_LINK}\"",
  "- runFlow:",
  "    when:",
  "      true: \${VISUAL_MODE == 'capture'}",
  "    commands:",
  "      - extendedWaitUntil:",
  "          visible: { id: \"\${VISUAL_SCREEN_ID}\" }",
  "          timeout: 15000",
  ...scenarioFlows,
  "- runFlow:",
  "    when:",
  "      true: \${VISUAL_MODE == 'capture'}",
  "    commands:",
  "      - extendedWaitUntil:",
  "          visible: { id: \"\${VISUAL_READY_ID}\" }",
  "          timeout: 15000",
  "      - extendedWaitUntil:",
  "          visible: { id: \"phase20-visual-capture\" }",
  "          timeout: 15000",
  "- runFlow:",
  "    when:",
  "      true: \${VISUAL_MODE == 'reset'}",
  "    commands:",
  "      - extendedWaitUntil:",
  "          visible: { id: \"phase20-visual-reset\" }",
  "          timeout: 15000",
  "",
].join("\n");
writeFileSync(path.join(root, "maestro/v1.2/visual-production-states.yaml"), flow);
