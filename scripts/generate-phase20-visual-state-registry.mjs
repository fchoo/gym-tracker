import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadV12VisualAuthority, v12VisualStateAuthority } from "./v12-visual-authority.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.on("uncaughtException", (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "phase20_visual_generation_failed"}\n`);
    process.exit(1);
  });
}
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
    // Current owner scope uses dated fixture contexts, not a day toolbar.
    return [];
  }
  if (name === "active-set-editor") return [{ action: "tap_text", value: "Current" }];
  if (name === "active-plan-settings") return [{ action: "tap_text", value: "More workout actions" }, { action: "tap_text", value: "Plan settings" }];
  if (name === "view-back-squat-trend") return [{ action: "tap_text", value: "View Back Squat trend" }];
  if (name === "open-back-squat-menu") return [{ action: "tap_text", value: "Open Back Squat menu" }];
  if (name === "active-exercise-picker") return [{ action: "tap_text", value: "Add exercise" }];
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
  if (name.startsWith("running-target-")) steps.push({ action: "tap_text", value: `Edit target for ${name.endsWith("2.4") ? "2.4 km" : name.endsWith("10") ? "10 km" : "Half Marathon"}` });
  if (name === "progress-recommendation") steps.push({ action: "tap_text", value: "Review target for Back Squat" });
  if (name === "bodyweight-history") return [{ action: "tap_text", value: "Body metrics" }];
  if (name === "progress-settings") return [{ action: "tap_text", value: "Settings" }];
  if (name === "garmin-consent") return [{ action: "tap_text", value: "Connect Garmin" }];
  if (["garmin-syncing", "garmin-synced", "garmin-idempotent", "garmin-error"].includes(name)) return [{ action: "tap_text", value: "Sync now" }];
  if (name.startsWith("garmin-confirmed-")) return [{ action: "tap_text", value: "Confirm match" }];
  if (name === "garmin-revoked") return [{ action: "tap_text", value: "Disconnect Garmin" }, { action: "tap_text", value: "Disconnect Garmin" }];
  return steps;
};

// Native readiness follows production callbacks. Browser controls remain in
// interactions/reference as retained authority; they are not native selectors.
function productionReadinessFor(component, name, fixtureVariant) {
  const action = (label, id = null) => ({ id, label });
  const back = action("Go back");
  const rootSettings = (root) => action("Open App Settings", `root-settings-trigger-${root}`);
  const bases = {
    PlannedWorkoutDetailScreen: { semantics: ["Workout preview", "Planned Strength target facts"], actions: [action("Back to Calendar")] },
    OwnedPlanDetailScreen: { semantics: [name === "library-plan-strength" ? "Strength Reset" : "Full Body Foundation", "Edit plan"], actions: [back, action("Edit plan"), action("Edit schedule"), action("Duplicate plan")] },
    StarterPlanDetailScreen: { semantics: [name === "library-plan-home" ? "Minimal Equipment Full Body" : "Full Body Foundation", "Activate plan"], actions: [back, action("Save editable copy"), action("Activate plan")] },
    StarterActivationScreen: { semantics: ["Schedule setup", "Start date"], actions: [back, action("Start date"), action("Activate plan")] },
    OwnedPlanEditorScreen: name === "create-strength"
      ? { semantics: ["Create my own", "First day name"], actions: [back, action("Plan name", "owned-plan-create-name"), action("First day name", "owned-plan-create-first-day"), action("Create draft")] }
      : { semantics: ["Plan editor", "Plan name"], actions: [back, action("Plan name", "owned-plan-editor-name"), action("Save Plan Changes")] },
    ScheduleEditorScreen: { semantics: ["Edit schedule", "Effective date"], actions: [back, action("Effective date"), action("Schedule timezone"), action("Save schedule")] },
    RunningPlanDetailScreen: { semantics: ["Running plan", "Goal distance"], actions: [back, action("Sync Garmin / match activity"), action("Edit running plan")] },
    RunningPlanEditorScreen: { semantics: ["Plan name", "Goal distance (metres)"], actions: [back, action("Plan name"), action("Goal distance (metres)"), action("Target time")] },
    RunningSessionEditorScreen: { semantics: ["Edit session", "Workout type"], actions: [back, action("Save session")] },
    PlanTypeChooserScreen: { semantics: ["Create plan", "Strength", "Running"], actions: [back, action("Strength"), action("Running")] },
    ExerciseDetailScreen: { semantics: ["Exercise facts", "Back Squat"], actions: [back, action("View exercise history")] },
    ExerciseEditorScreen: { semantics: ["Exercise name", "Save exercise"], actions: [back, action("Exercise name", "exercise-editor-name"), action("Equipment", "exercise-editor-equipment"), action("Save exercise", name === "custom-exercise-create" ? "exercise-editor-save-create" : "exercise-editor-save-edit")] },
    ExerciseHistoryScreen: { semantics: ["Exercise history", name.endsWith("squat") ? "Back Squat" : name.endsWith("bench") ? "Bench Press" : "Plank"], actions: [back] },
    ImportedActivityDetailScreen: { semantics: ["Activity detail", name.includes("treadmill") ? "Treadmill run" : "Outdoor run"], actions: [back, action("Match to scheduled workout")] },
    ActivityMatchScreen: { semantics: ["Match to scheduled workout", name.includes("confirmed") ? "Matched" : "Confirm match"], actions: name.includes("confirmed") ? [back, action("Leave unmatched")] : [back, action("Confirm match"), action("Leave unmatched")] },
  };
  let result = bases[component];
  if (name === "archive-confirmation") result = { semantics: ["Confirm archive", "Cancel lifecycle review"], actions: [action("Confirm archive"), action("Cancel lifecycle review")] };
  if (component === "TodayScreen") {
    result = { semantics: ["Workout", "Choose another day"], actions: [rootSettings("index"), action("Choose another day", "today-choose-plan-day")], gaps: [] };
    const dayIndex = name.startsWith("workout-day-") ? Number(name.at(-1)) : 3;
    const plannedDay = dayIndex % 2 === 0 ? "Full Body A" : "Full Body B";
    result.semantics = ["Workout", plannedDay, `Start ${plannedDay}`];
    result.actions.push(action(`Start ${plannedDay}`, "today-start-workout"));
    if (name === "appearance") result = { semantics: ["App Settings", "Appearance"], actions: [action("Light"), action("Dark"), action("System"), action("Close App Settings", "bottom-sheet-close-action")], gaps: [] };
  }
  if (component === "ActiveWorkoutScreen") {
    result = { semantics: ["Workout", "Working sets"], actions: [action("More workout actions", "workout-more-actions")], gaps: [] };
    if (name === "active-overview" || name === "warmup-before-working" || name === "warmup-committed-no-rest" || name === "rest-skipped") result.actions.push(action(name === "warmup-before-working" ? "Complete Set 1" : name === "rest-skipped" ? "Complete Set 3" : "Complete Set 2", "workout-complete-set"));
    if (["working-committed-rest", "rest-paused", "rest-adjusted", "rest-resumed"].includes(name)) {
      const paused = name === "rest-paused" || name === "rest-adjusted";
      result.semantics = ["Workout", paused ? "Resume rest" : "Pause rest"];
      result.actions = [action(paused ? "Resume rest" : "Pause rest"), action("Subtract 15 seconds from rest"), action("Add 15 seconds to rest"), action("Skip rest")];
      result.ids = [paused ? "rest-resume" : "rest-pause"];
    }
    if (name === "active-set-editor") result = { semantics: ["Edit Back Squat", "Repetitions"], actions: [action("Repetitions"), action("Save set values"), action("Return to Workout", "bottom-sheet-close-action")] };
    if (name === "active-plan-settings") result = { semantics: ["Plan settings", "Default between-set rest seconds"], actions: [action("Default between-set rest seconds"), action("Save default rest"), action("Edit plan after workout · Schedule")] };
    if (name === "view-back-squat-trend") result = { semantics: ["Back Squat trend", "Return to Workout"], actions: [action("Return to Workout", "bottom-sheet-close-action")] };
    if (name === "open-back-squat-menu") result = { semantics: ["Exercise actions", "Timing"], actions: [action("Timing"), action("Replace exercise"), action("Delete exercise")] };
    if (name === "active-exercise-picker") result = { semantics: ["Choose exercise", "Search exercises"], actions: [action("Search exercises"), action("Return to Workout", "bottom-sheet-close-action")] };
    if (name === "set-action-menu") result = { semantics: ["Add set", "Add working set"], actions: [action("Add warm-up set"), action("Add working set")] };
  }
  if (component === "CalendarScreen") {
    const month = name === "calendar-next" ? "November 2026" : name === "calendar-previous" ? "September 2026" : "October 2026";
    result = { semantics: ["Calendar", month], actions: [rootSettings("calendar"), action("Open Calendar key", "calendar-info-action"), action(`Choose month and year, ${month}`), action("Return to today, 1 October 2026")], gaps: [] };
    if (name === "calendar-key") result = { semantics: ["Activity type", "Strength", "Running"], actions: [action("Close Calendar key", "bottom-sheet-close-action")] };
    if (name.startsWith("calendar-agenda-") || name === "calendar-adjacent-week") { result.semantics = ["Calendar", name.startsWith("calendar-agenda-") ? `${Number(name.slice(-2))} October 2026` : "12 October 2026"]; result.actions = [action("Collapse day and return to month")]; }
  }
  if (component === "LibraryScreen") {
    const exercises = name === "library-exercises";
    result = { semantics: ["Library", exercises ? "All Exercises" : "My Plans", exercises ? "Create custom exercise" : "Create plan"], actions: [action("Actions", "library-actions-trigger"), rootSettings("library"), action("Plans"), action("Exercises"), action(exercises ? "Search exercises" : "Search plans"), action("Filters", "library-filters-chip"), action(exercises ? "Create custom exercise" : "Create plan", exercises ? null : "library-create-plan")], ids: [`library-search-${exercises ? "exercises" : "plans"}`] };
    if (name === "plan-filters") result = { semantics: ["Plan filters", "Show results"], actions: [action("Show results"), action("Keep Current Filters"), action("Close Plan filters", "bottom-sheet-close-action")] };
    if (name === "library-actions") result = { semantics: ["Library actions", "Create plan", "Import plan, unavailable, Later"], actions: [action("Create plan"), action("Create exercise"), action("Close Library actions", "bottom-sheet-close-action")], unavailable: [{ label: "Import plan, unavailable, Later", enabled: false, reason: "Source-owned unavailable Later action; not an actionable match." }] };
  }
  if (component === "ProgressScreen") {
    const params = progressRouteParams(name);
    const period = params.period === "all_time" ? "All time" : params.period === "12_weeks" ? "12 weeks" : "4 weeks";
    result = { semantics: ["Progress", params.sport, period], actions: [rootSettings("progress"), action("Body metrics"), action("Settings"), action("All"), action("Strength"), action("Running"), action("4 weeks"), action("12 weeks"), action("All time")], gaps: [] };
    if (name === "progress-running-loading") result.semantics = ["Progress", "Loading progress"];
    if (name === "progress-settings") result = { semantics: ["Progress settings", "Bodyweight history"], actions: [action("Bodyweight history"), action("Close progress settings", "bottom-sheet-close-action")] };
    if (name === "bodyweight-history") result = { semantics: ["Bodyweight", "No bodyweight entries"], actions: [action("Add first entry"), action("Close bodyweight", "bottom-sheet-close-action")] };
    if (name === "progress-recommendation") result = { semantics: ["Review target", "Keep target unchanged"], actions: [action("Keep target unchanged"), action("Use target"), action("Close review target", "bottom-sheet-close-action")] };
    if (name.startsWith("running-target-")) result = { semantics: ["Running target", "Target time", "Current benchmark"], actions: [action("Target time"), action("Optional target date"), action("Save target"), action("Discard target changes")], unavailable: [{ label: "Current benchmark", editable: false, reason: "Source fact, not the browser editable benchmark field." }] };
    if (name.startsWith("running-effort-")) {
      const distance = name.endsWith("2.4") ? "2.4 km" : name.endsWith("10") ? "10 km" : "Half Marathon";
      result = { semantics: [`${distance} best efforts`, "Best efforts compare elapsed time at the same distance. Faster is lower on the clock."], actions: [action(`Close ${distance} best efforts`, "bottom-sheet-close-action")] };
    }
  }
  if (component === "GarminSyncScreen") {
    const disconnected = ["garmin-disconnected", "garmin-file-import", "garmin-revoked"].includes(name);
    result = { semantics: ["Garmin Sync", disconnected ? "Garmin not connected" : "Connected to Garmin"], actions: disconnected ? [action("Connect Garmin")] : [action("Sync now"), action("Disconnect Garmin")], gaps: [] };
    if (name === "garmin-consent") result = { semantics: ["Connect Garmin", "Email", "Password"], actions: [action("Email"), action("Password"), action("Continue"), action("Cancel")] };
    if (name === "garmin-syncing") result = { semantics: ["Garmin Sync", "Syncing Garmin activities"], actions: [action("Disconnect Garmin")], unavailable: [{ label: "Sync now", enabled: false, reason: "Busy foreground sync action is not a new actionable match." }] };
    if (name === "garmin-error") result = { semantics: ["Garmin Sync", "Retry Garmin sync"], actions: [action("Retry Garmin sync"), action("Disconnect Garmin")] };
    if (name === "garmin-file-import") result.gaps.push("Current production Garmin root has no FIT chooser or preview callbacks. This retained browser state has no production equivalent.");
  }
  if (result === undefined) throw new Error(`phase20_production_readiness_missing:${component}:${name}`);
  return result;
}

function readinessFor(light, id, component, name, fixtureVariant, steps) {
  const source = productionReadinessFor(component, name, fixtureVariant);
  const semantics = source.semantics;
  const controls = source.actions.map((control, order) => ({ ...control, order }));
  const sourceIds = controls.map(({ id: controlId }) => controlId).filter(Boolean);
  const screenTestId = readinessTestIdFor(component, "");
  const readyTestId = readinessTestIdFor(component, name);
  return {
    status: name.includes("loading") || name === "garmin-syncing" ? "loading" : "ready",
    screen_test_id: screenTestId,
    test_id: readyTestId,
    test_ids: [...new Set([screenTestId, readyTestId, `phase20-visual-state-${id}`, ...sourceIds, ...(source.ids ?? [])])],
    semantics,
    actions: controls,
    order: semantics,
    non_color: semantics.slice(1),
    focus: { target: source.focus ?? semantics[0], required: true },
    unavailable_controls: source.unavailable ?? [],
    alignment_gaps: source.gaps ?? [],
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
    focus_target: productionReadinessFor(destination.component, name, fixtureVariant).focus ?? productionReadinessFor(destination.component, name, fixtureVariant).semantics[0],
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
if (!process.argv.includes("--registry-only")) {
  writeFileSync(path.join(root, "maestro/v1.2/visual-production-states.yaml"), flow);
}
