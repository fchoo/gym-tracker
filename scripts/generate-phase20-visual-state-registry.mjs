import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = ".planning/design/v1.2-browser-evidence";
const approvedRoot = "/Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sourceFile = (relative) => readFileSync(path.join(root, relative));

const destinationFor = (name) => {
  if (["appearance", "workout-root", "workout-day-0", "workout-day-1", "workout-day-2", "workout-day-3", "workout-day-4"].includes(name)) {
    return { route: "/(tabs)", component: "TodayScreen", route_params: {} };
  }
  if (name.startsWith("active-") || name.startsWith("warmup-") || name.startsWith("working-") || name.startsWith("rest-") || ["view-back-squat-trend", "open-back-squat-menu", "set-action-menu"].includes(name)) {
    return { route: "/workout/[sessionId]", component: "ActiveWorkoutScreen", route_params: { sessionId: "phase20-session-active", returnTo: "/(tabs)" } };
  }
  if (name === "calendar-planned-strength-detail") {
    return { route: "/calendar/plan/[occurrenceId]", component: "PlannedWorkoutDetailScreen", route_params: { occurrenceId: "phase20-strength-occurrence", origin: "calendar" } };
  }
  if (name.startsWith("calendar-")) return { route: "/(tabs)/calendar", component: "CalendarScreen", route_params: {} };
  if (["library-plans", "plan-filters", "library-actions", "library-exercises"].includes(name)) return { route: "/(tabs)/library", component: "LibraryScreen", route_params: {} };
  if (["library-plan-foundation", "library-plan-strength", "archive-confirmation"].includes(name)) return { route: "/library/plan/[planId]", component: "OwnedPlanDetailScreen", route_params: { planId: name === "library-plan-strength" ? "phase20-strength-reset" : "phase20-strength-foundation" } };
  if (["library-plan-beginner", "library-plan-home"].includes(name)) return { route: "/library/starter/[templateId]", component: "StarterPlanDetailScreen", route_params: { templateId: name === "library-plan-home" ? "bodyweight-basics" : "starter-strength" } };
  if (name === "starter-activation-preview") return { route: "/library/starter/[templateId]/activate", component: "StarterActivationScreen", route_params: { templateId: "starter-strength" } };
  if (name === "strength-editor") return { route: "/library/plan/[planId]/edit", component: "OwnedPlanEditorScreen", route_params: { planId: "phase20-strength-foundation" } };
  if (name === "schedule-editor") return { route: "/library/plan/[planId]/schedule", component: "ScheduleEditorScreen", route_params: { planId: "phase20-strength-foundation" } };
  if (name === "library-plan-running-2k") return { route: "/library/running/[planId]", component: "RunningPlanDetailScreen", route_params: { planId: "phase20-running-2k" } };
  if (name === "running-editor") return { route: "/library/running/[planId]/edit", component: "RunningPlanEditorScreen", route_params: { planId: "phase20-running-2k" } };
  if (name.startsWith("running-session-")) return { route: "/library/running/[planId]/session/[sessionId]", component: "RunningSessionEditorScreen", route_params: { planId: "phase20-running-2k", sessionId: `phase20-${name.slice("running-session-".length)}` } };
  if (name === "plan-type-chooser") return { route: "/library/plan/create", component: "PlanTypeChooserScreen", route_params: {} };
  if (name === "create-strength") return { route: "/library/plan/create-strength", component: "OwnedPlanEditorScreen", route_params: {} };
  if (name === "create-running") return { route: "/library/running/create", component: "RunningPlanEditorScreen", route_params: {} };
  if (name === "exercise-back-squat") return { route: "/library/exercise/[exerciseId]", component: "ExerciseDetailScreen", route_params: { exerciseId: "back-squat" } };
  if (name === "exercise-tempo-goblet") return { route: "/library/exercise/[exerciseId]/edit", component: "ExerciseEditorScreen", route_params: { exerciseId: "phase20-tempo-goblet-squat" } };
  if (name === "custom-exercise-create") return { route: "/library/exercise/create", component: "ExerciseEditorScreen", route_params: {} };
  if (name.startsWith("progress-") || name.startsWith("strength-detail-") || name.startsWith("running-effort-") || name.startsWith("running-target-") || name === "bodyweight-history") return { route: "/(tabs)/progress", component: "ProgressScreen", route_params: {} };
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

const readinessTestIdFor = (component) => ({
  TodayScreen: "today-screen", ActiveWorkoutScreen: "active-workout", CalendarScreen: "calendar-screen",
  PlannedWorkoutDetailScreen: "planned-workout-detail", LibraryScreen: "library-screen",
  OwnedPlanDetailScreen: "owned-plan-detail", StarterPlanDetailScreen: "starter-plan-detail",
  StarterActivationScreen: "starter-activation", OwnedPlanEditorScreen: "owned-plan-editor",
  ScheduleEditorScreen: "schedule-editor", RunningPlanDetailScreen: "running-plan-detail",
  RunningPlanEditorScreen: "running-plan-editor", RunningSessionEditorScreen: "running-session-editor",
  PlanTypeChooserScreen: "plan-type-chooser", ExerciseDetailScreen: "exercise-detail-screen",
  ExerciseEditorScreen: "exercise-editor-screen", ProgressScreen: "progress-screen",
  GarminSyncScreen: "garmin-sync-screen", ImportedActivityDetailScreen: "imported-activity-detail-screen",
  ActivityMatchScreen: "activity-match-screen",
}[component]);

const walk = JSON.parse(sourceFile(`${evidence}/serial-walk.json`));
if (!Array.isArray(walk) || walk.length !== 214) throw new Error("phase20_visual_walk_invalid");
const sourceManifest = JSON.parse(sourceFile(`${evidence}/source-manifest.json`));
const sourceHash = Object.fromEntries(sourceManifest.sources.map((entry) => [path.basename(entry.path), entry.sha256]));
for (const required of ["approved-hybrid.html", "approved.json"]) {
  const bytes = readFileSync(path.join(approvedRoot, required));
  if (sourceHash[required] !== sha256(bytes)) throw new Error(`phase20_visual_approved_source_hash_invalid:${required}`);
}

const states = walk.slice(0, 107).map((light, index) => {
  const dark = walk[index + 107];
  if (!light || !dark || light.name !== dark.name || light.theme !== "light" || dark.theme !== "dark") throw new Error(`phase20_visual_walk_pair_invalid:${index}`);
  const name = light.name;
  const destination = destinationFor(name);
  const png = { light: `light-${name}.png`, dark: `dark-${name}.png` };
  const hasPng = existsSync(path.join(root, evidence, png.light)) && existsSync(path.join(root, evidence, png.dark));
  const controls = light.controls.map((control) => ({ id: control.id, text: control.text, data: control.data }));
  return {
    id: `BW-${String(index + 1).padStart(3, "0")}`, name, ...destination,
    fixture_id: "v12-synthetic-fixtures-r18", fixture_seed: fixtureSeedFor(index), scenario: name,
    fixture_facts: { date: "2026-10-01", locale: "en-SG", timezone: "Asia/Singapore", sqlite: "authoritative-synthetic" },
    interactions: controls, expected_visible_semantics: controls.filter((control) => control.text).map((control) => control.text),
    focus_target: controls.find((control) => control.id)?.id || controls.find((control) => control.text)?.text || "screen-heading",
    readiness: { test_id: readinessTestIdFor(destination.component), semantics: controls.filter((control) => control.text).map((control) => control.text) },
    evidence_scope: index >= 91 ? "visual_only" : "production_screen",
    reference: hasPng
      ? { kind: "retained_png", light: { path: `${evidence}/${png.light}`, sha256: sha256(sourceFile(`${evidence}/${png.light}`)) }, dark: { path: `${evidence}/${png.dark}`, sha256: sha256(sourceFile(`${evidence}/${png.dark}`)) } }
      : { kind: "approved_source", approved_hybrid_html_sha256: sourceHash["approved-hybrid.html"], approved_json_sha256: sourceHash["approved.json"], state_name: name },
  };
});
if (new Set(states.map((state) => state.id)).size !== 107 || new Set(states.map((state) => `${state.id}:${state.name}`)).size !== 107) throw new Error("phase20_visual_state_duplicate");
const output = `// Generated by scripts/generate-phase20-visual-state-registry.mjs; do not edit.\nexport const PHASE20_VISUAL_STATE_REGISTRY = ${JSON.stringify(states, null, 2)} as const;\nexport type Phase20VisualState = (typeof PHASE20_VISUAL_STATE_REGISTRY)[number];\n`;
writeFileSync(path.join(root, "src/testing/phase20VisualStateRegistry.generated.ts"), output);
writeFileSync(path.join(root, "src/testing/phase20VisualStateRegistry.json"), `${JSON.stringify(states, null, 2)}\n`);
