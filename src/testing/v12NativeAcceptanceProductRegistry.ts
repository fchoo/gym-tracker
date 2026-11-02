import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  type V12NativeAcceptanceCaseContract,
  type V12NativeAcceptanceShard,
} from "./contracts/phase15Workout.contract.ts";

export type V12NativeAcceptanceProductInteraction =
  | "tap"
  | "input"
  | "ui-observation"
  | "domain-observation";

export type V12NativeAcceptanceProductSelector = Readonly<{
  kind: "id" | "text";
  value: string;
}>;

export type V12NativeAcceptanceProductPrerequisite = Readonly<{
  interaction: "tap" | "input";
  selector: V12NativeAcceptanceProductSelector;
  selectorSource: string;
  callbackSource: string;
  callbackOwnerToken: string;
  callbackGroup: string;
  canonicalOperation: string;
  inputValue: string | null;
}>;

export type V12NativeAcceptanceProductDefinition = Readonly<{
  shard: V12NativeAcceptanceShard;
  caseId: string;
  operationId: string;
  interaction: V12NativeAcceptanceProductInteraction;
  phaseFlowSource: string;
  visualStateId: string;
  routeSource: string;
  selectorSource: string;
  callbackSource: string | null;
  readySource: string;
  resultSource: string;
  readySelector: V12NativeAcceptanceProductSelector;
  actionSelector: V12NativeAcceptanceProductSelector | null;
  inputValue: string | null;
  resultSelector: V12NativeAcceptanceProductSelector;
  callbackOwnerToken: string | null;
  callbackGroup: string;
  contractOperation: string;
  canonicalOperation: string;
  prerequisites: readonly V12NativeAcceptanceProductPrerequisite[];
  fixtureVariant: string;
  productPath(nonce: string): string;
  routeParams(nonce: string): Readonly<Record<string, string>>;
}>;

type ProductBinding = Omit<
  V12NativeAcceptanceProductDefinition,
  "shard" | "caseId" | "operationId" | "phaseFlowSource" | "visualStateId" | "fixtureVariant" | "contractOperation"
>;

const id = (value: string): V12NativeAcceptanceProductSelector => Object.freeze({ kind: "id", value });
const text = (value: string): V12NativeAcceptanceProductSelector => Object.freeze({ kind: "text", value });
const noParams = () => Object.freeze({});
const constantPath = (value: string) => () => value;
const safeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_|_$/gu, "");
const activatedAtMs = (nonce: string) => 1_800_000_000_000 + Number.parseInt(nonce.slice(0, 8), 16);
const workoutPlanId = (nonce: string) => `plan_copy_${activatedAtMs(nonce)}`;
const workoutDayId = (nonce: string) => `plan_day_${safeToken(workoutPlanId(nonce))}_0`;
const workoutSessionId = (nonce: string) =>
  `session_${activatedAtMs(nonce) + 1_000}_alternate_day_${safeToken(workoutDayId(nonce))}`;
const ownedReadPlanId = (nonce: string) => `v12:owned-plan-read:${nonce}`;
const ownedMutationPlanId = (nonce: string) => `v12:owned-plan-mutation:${nonce}`;
const ownedMutationDayId = (nonce: string) => `${ownedMutationPlanId(nonce)}:day`;
const ownedMutationOccurrenceId = (nonce: string) => `${ownedMutationPlanId(nonce)}:occurrence`;
const runningPlanId = (nonce: string) => `v12:running:${nonce}`;
const customExerciseId = (nonce: string) => `v12:custom-exercise:${nonce}`;
const metricExerciseId = (nonce: string) => `v12:metric-exercise:${nonce}`;
const bundledExerciseId = "00fda844-429f-58c8-9c8c-134b730a480b";

function binding(input: ProductBinding): ProductBinding {
  return Object.freeze(input);
}

function prerequisite(input: Readonly<{
  interaction?: "tap" | "input";
  selector: V12NativeAcceptanceProductSelector;
  selectorSource: string;
  callbackSource: string;
  callbackOwnerToken: string;
  callbackGroup: string;
  canonicalOperation: string;
  inputValue?: string;
}>): V12NativeAcceptanceProductPrerequisite {
  return Object.freeze({
    interaction: input.interaction ?? "tap",
    inputValue: input.inputValue ?? null,
    ...input,
  });
}

const screenTap = (
  selector: V12NativeAcceptanceProductSelector,
  source: string,
  callbackOwnerToken: string,
  callbackGroup: string,
  canonicalOperation: string,
): V12NativeAcceptanceProductPrerequisite => prerequisite({
  selector,
  selectorSource: source,
  callbackSource: source,
  callbackOwnerToken,
  callbackGroup,
  canonicalOperation,
});

const screenInput = (
  selector: V12NativeAcceptanceProductSelector,
  source: string,
  callbackOwnerToken: string,
  callbackGroup: string,
  canonicalOperation: string,
  inputValue: string,
): V12NativeAcceptanceProductPrerequisite => prerequisite({
  interaction: "input",
  selector,
  selectorSource: source,
  callbackSource: source,
  callbackOwnerToken,
  callbackGroup,
  canonicalOperation,
  inputValue,
});

function actionBinding(input: Readonly<{
  interaction?: "tap" | "input";
  inputValue?: string;
  routeSource: string;
  selectorSource: string;
  callbackSource: string;
  readySource: string;
  resultSource: string;
  readySelector: V12NativeAcceptanceProductSelector;
  actionSelector: V12NativeAcceptanceProductSelector;
  resultSelector: V12NativeAcceptanceProductSelector;
  callbackOwnerToken: string;
  callbackGroup: string;
  canonicalOperation: string;
  prerequisites?: readonly V12NativeAcceptanceProductPrerequisite[];
  productPath(nonce: string): string;
  routeParams?(nonce: string): Readonly<Record<string, string>>;
}>): ProductBinding {
  return binding({
    interaction: input.interaction ?? "tap",
    inputValue: input.inputValue ?? null,
    ...input,
    prerequisites: Object.freeze([...(input.prerequisites ?? [])]),
    routeParams: input.routeParams ?? noParams,
  });
}

function observationBinding(input: Readonly<{
  routeSource: string;
  callbackSource: string;
  readySource: string;
  resultSource?: string;
  readySelector: V12NativeAcceptanceProductSelector;
  resultSelector?: V12NativeAcceptanceProductSelector;
  callbackOwnerToken: string;
  callbackGroup: string;
  canonicalOperation: string;
  productPath(nonce: string): string;
  routeParams?(nonce: string): Readonly<Record<string, string>>;
}>): ProductBinding {
  return binding({
    interaction: "ui-observation",
    routeSource: input.routeSource,
    selectorSource: input.readySource,
    callbackSource: input.callbackSource,
    readySource: input.readySource,
    resultSource: input.resultSource ?? input.readySource,
    readySelector: input.readySelector,
    actionSelector: null,
    inputValue: null,
    resultSelector: input.resultSelector ?? input.readySelector,
    callbackOwnerToken: input.callbackOwnerToken,
    callbackGroup: input.callbackGroup,
    canonicalOperation: input.canonicalOperation,
    prerequisites: Object.freeze([]),
    productPath: input.productPath,
    routeParams: input.routeParams ?? noParams,
  });
}

const activeObservation = (
  callbackGroup: string,
  canonicalOperation: string,
): ProductBinding => observationBinding({
  routeSource: "app/workout/[sessionId].tsx",
  callbackSource: "app/workout/[sessionId].tsx",
  readySource: "src/ui/screens/ActiveWorkoutScreen.tsx",
  readySelector: id("active-workout"),
  callbackOwnerToken: "runtime.getActiveWorkout",
  callbackGroup,
  canonicalOperation,
  productPath: (nonce) => `/workout/${encodeURIComponent(workoutSessionId(nonce))}`,
});

const activeAction = (input: Readonly<{
  selector: V12NativeAcceptanceProductSelector;
  selectorSource: string;
  callbackSource: string;
  callbackOwnerToken: string;
  callbackGroup: string;
  canonicalOperation: string;
  prerequisites?: readonly V12NativeAcceptanceProductPrerequisite[];
  resultSelector?: V12NativeAcceptanceProductSelector;
  resultSource?: string;
}>): ProductBinding => actionBinding({
  routeSource: "app/workout/[sessionId].tsx",
  selectorSource: input.selectorSource,
  callbackSource: input.callbackSource,
  readySource: "src/ui/screens/ActiveWorkoutScreen.tsx",
  resultSource: input.resultSource ?? "src/ui/screens/ActiveWorkoutScreen.tsx",
  readySelector: id("active-workout"),
  actionSelector: input.selector,
  resultSelector: input.resultSelector ?? id("active-workout"),
  callbackOwnerToken: input.callbackOwnerToken,
  callbackGroup: input.callbackGroup,
  canonicalOperation: input.canonicalOperation,
  prerequisites: input.prerequisites ?? [],
  productPath: (nonce) => `/workout/${encodeURIComponent(workoutSessionId(nonce))}`,
});

const runningSessionSave = (kind?: "Long run" | "Progression" | "Tempo" | "Intervals" | "Hills" | "Fartlek"): ProductBinding => actionBinding({
  routeSource: "app/library/running/[planId]/session/new.tsx",
  selectorSource: "src/ui/screens/RunningSessionEditorScreen.tsx",
  callbackSource: "src/ui/screens/RunningSessionEditorScreen.tsx",
  readySource: "src/ui/screens/RunningSessionEditorScreen.tsx",
  resultSource: "src/ui/screens/RunningSessionEditorScreen.tsx",
  readySelector: id("running-session-editor"),
  actionSelector: text("Save session"),
  resultSelector: id("running-session-editor"),
  callbackOwnerToken: "save",
  callbackGroup: "running.save-session",
  canonicalOperation: "running-plan.running-plan-repository.save-source-graph",
  productPath: (nonce) => `/library/running/${encodeURIComponent(runningPlanId(nonce))}/session/new`,
  prerequisites: kind === undefined ? [] : [
    screenTap(id(`running-session-kind-${safeToken(kind)}`), "src/ui/screens/RunningSessionEditorScreen.tsx", "selectKind(entry)", "running.select-session-kind", "running.ui.select-session-kind"),
  ],
});

const CASE_BINDINGS: Readonly<Record<string, ProductBinding>> = Object.freeze({
  "workout.root-identity": observationBinding({
    routeSource: "app/(tabs)/index.tsx", callbackSource: "src/ui/screens/TodayScreen.tsx",
    readySource: "src/ui/screens/TodayScreen.tsx", readySelector: text("Today"),
    callbackOwnerToken: "view", callbackGroup: "workout.today-view", canonicalOperation: "workout.plans-workout-repository.get-today-view",
    productPath: constantPath("/index"),
  }),
  "workout.day-switch": actionBinding({
    routeSource: "app/(tabs)/index.tsx", selectorSource: "src/ui/screens/TodayScreen.tsx", callbackSource: "src/ui/screens/TodayScreen.tsx",
    readySource: "src/ui/screens/TodayScreen.tsx", resultSource: "src/ui/components/WorkoutStartSheet.tsx",
    readySelector: text("Today"), actionSelector: id("today-choose-plan-day"), resultSelector: text("Start a workout"),
    callbackOwnerToken: "setStartSheetVisible(true)", callbackGroup: "workout.choose-plan-day", canonicalOperation: "workout.ui.open-plan-day-chooser",
    productPath: constantPath("/index"),
  }),
  "workout.scheduled-rest-empty": observationBinding({
    routeSource: "app/(tabs)/index.tsx", callbackSource: "src/ui/screens/TodayScreen.tsx",
    readySource: "src/ui/screens/TodayScreen.tsx", readySelector: id("today-rest-day-card"),
    callbackOwnerToken: "view", callbackGroup: "workout.today-rest-state", canonicalOperation: "workout.plans-workout-repository.get-today-view",
    productPath: constantPath("/index"),
  }),
  "workout.start-alternate": actionBinding({
    routeSource: "app/(tabs)/index.tsx", selectorSource: "src/ui/screens/TodayScreen.tsx", callbackSource: "app/(tabs)/index.tsx",
    readySource: "src/ui/screens/TodayScreen.tsx", resultSource: "src/ui/screens/ActiveWorkoutScreen.tsx",
    readySelector: text("Today"), actionSelector: id("today-start-workout"), resultSelector: id("active-workout"),
    callbackOwnerToken: "runtime.startPlanDay", callbackGroup: "workout.start-plan-day", canonicalOperation: "workout.plans-workout-repository.start-workout",
    productPath: constantPath("/index"),
  }),
  "workout.start-resume": actionBinding({
    routeSource: "app/(tabs)/index.tsx", selectorSource: "src/ui/screens/TodayScreen.tsx", callbackSource: "app/(tabs)/index.tsx",
    readySource: "src/ui/screens/TodayScreen.tsx", resultSource: "src/ui/screens/ActiveWorkoutScreen.tsx",
    readySelector: text("Today"), actionSelector: text("Resume workout"), resultSelector: id("active-workout"),
    callbackOwnerToken: "openActiveWorkout(sessionId)", callbackGroup: "workout.resume-session", canonicalOperation: "active-workout.workout-repository.get-workout-session",
    productPath: constantPath("/index"),
  }),
  "workout.context-running": observationBinding({
    routeSource: "app/library/running/[planId].tsx", callbackSource: "src/ui/screens/RunningPlanDetailScreen.tsx",
    readySource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySelector: id("running-plan-detail"),
    callbackOwnerToken: "props.loadPlan(props.planId)", callbackGroup: "running.open-detail", canonicalOperation: "running-plan.running-plan-repository.read-aggregate",
    productPath: (nonce) => `/library/running/${encodeURIComponent(runningPlanId(nonce))}`,
  }),
  "workout.active-layout": activeObservation("workout.active-layout", "active-workout.workout-repository.get-workout-session"),
  "workout.active-back": activeAction({ selector: id("active-workout-back"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "app/workout/[sessionId].tsx", callbackOwnerToken: "returnToWorkout", callbackGroup: "workout.leave-active", canonicalOperation: "workout.navigation.return-to-workout-origin", resultSelector: text("Today"), resultSource: "src/ui/screens/TodayScreen.tsx" }),
  "workout.exercise-disclosure": activeAction({ selector: id("workout-exercise-disclosure"), selectorSource: "src/ui/components/WorkoutSessionPresentation.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "onExerciseToggle", callbackGroup: "workout.exercise-disclosure", canonicalOperation: "active-workout.workout-repository.get-active-workout" }),
  "workout.active-indicator": activeObservation("workout.active-indicator", "active-workout.workout-repository.get-active-workout"),
  "workout.set-states": activeObservation("workout.set-states", "active-workout.workout-repository.get-active-workout"),
  "workout.row-edit": activeAction({ selector: text("Save set values"), selectorSource: "src/ui/components/WorkoutSetEditorSheet.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.updateActiveSetDraft", callbackGroup: "workout.save-set-values", canonicalOperation: "active-workout.workout-repository.update-active-set-draft", prerequisites: [screenTap(id("workout-active-set-row"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setEditingSetId(set.id)", "workout.open-set-editor", "workout.ui.open-active-set-editor")] }),
  "workout.load-reps-editor": activeAction({ selector: text("Save set values"), selectorSource: "src/ui/components/WorkoutSetEditorSheet.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.updateActiveSetDraft", callbackGroup: "workout.save-set-values", canonicalOperation: "active-workout.workout-repository.update-active-set-draft", prerequisites: [screenTap(id("workout-active-set-row"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setEditingSetId(set.id)", "workout.open-set-editor", "workout.ui.open-active-set-editor")] }),
  "workout.duration-editor": activeAction({ selector: text("Save set values"), selectorSource: "src/ui/components/WorkoutSetEditorSheet.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.updateActiveSetDraft", callbackGroup: "workout.save-set-values", canonicalOperation: "active-workout.workout-repository.update-active-set-draft", prerequisites: [screenTap(id("workout-active-set-row"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setEditingSetId(set.id)", "workout.open-set-editor", "workout.ui.open-active-set-editor")] }),
  "workout.all-metrics": activeAction({ selector: text("Save set values"), selectorSource: "src/ui/components/WorkoutSetEditorSheet.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.updateActiveSetDraft", callbackGroup: "workout.save-set-values", canonicalOperation: "active-workout.workout-repository.update-active-set-draft", prerequisites: [screenTap(id("workout-active-set-row"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setEditingSetId(set.id)", "workout.open-set-editor", "workout.ui.open-active-set-editor")] }),
  "workout.warmup-order": activeObservation("workout.warmup-order", "active-workout.workout-repository.get-active-workout"),
  "workout.add-set": activeAction({ selector: text("Add working set"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.addWorkingSet", callbackGroup: "workout.add-working-set", canonicalOperation: "active-workout.workout-repository.add-working-set", prerequisites: [screenTap(id("workout-active-add-set"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setAddSetMenuExerciseId(exercise.id)", "workout.open-add-set", "workout.ui.open-add-set-menu")] }),
  "workout.complete-commit": activeAction({ selector: id("workout-complete-set"), selectorSource: "src/ui/components/WorkoutActionDock.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.completeSet", callbackGroup: "workout.complete-set", canonicalOperation: "active-workout.workout-repository.complete-set" }),
  "workout.complete-failure": activeAction({ selector: id("workout-complete-set"), selectorSource: "src/ui/components/WorkoutActionDock.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.completeSet", callbackGroup: "workout.complete-set", canonicalOperation: "active-workout.workout-repository.complete-set", resultSelector: text("Set not saved · Retry") }),
  "workout.completion-collapse": activeObservation("workout.completion-collapse", "active-workout.workout-repository.get-active-workout"),
  "workout.rest-dock": activeObservation("workout.rest-dock", "rest.rest-repository.get-rest-context"),
  "workout.rest-controls": activeAction({ selector: id("rest-control-Add 15 seconds to rest"), selectorSource: "src/ui/components/RestDock.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.adjustRest", callbackGroup: "workout.adjust-rest", canonicalOperation: "rest.rest-repository.adjust-rest" }),
  "workout.rest-recovery": activeAction({ selector: id("rest-resume"), selectorSource: "src/ui/components/RestDock.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.resumeRest", callbackGroup: "workout.resume-rest", canonicalOperation: "rest.rest-repository.resume-rest" }),
  "workout.trend": activeAction({ selector: id("workout-active-exercise-trend"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "setTrendExerciseId", callbackGroup: "workout.open-trend", canonicalOperation: "history.history-repository.load-exercise-metric-history" }),
  "workout.exercise-menu": activeAction({ selector: id("workout-active-exercise-menu"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "setExerciseActionsVisibleForId(exercise.id)", callbackGroup: "workout.open-exercise-menu", canonicalOperation: "workout.ui.open-active-exercise-menu" }),
  "workout.timing-flat": activeObservation("workout.timing-flat", "active-workout.workout-repository.get-active-workout"),
  "workout.plan-increment": activeAction({ selector: text("Use this target next time"), selectorSource: "src/ui/components/RecommendationSurface.tsx", callbackSource: "app/completion/[sessionId].tsx", callbackOwnerToken: "runtime.acceptRecommendation", callbackGroup: "workout.accept-recommendation", canonicalOperation: "workout.workout-outcome-repository.accept-recommendation", resultSelector: id("workout-completion-context-card"), resultSource: "src/ui/screens/WorkoutCompletionScreen.tsx" }),
  "workout.plan-after-workout": observationBinding({ routeSource: "app/library/plan/[planId]/index.tsx", callbackSource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySelector: id("owned-plan-detail"), callbackOwnerToken: "props.loadPlan(props.planId)", callbackGroup: "owned-plan.open-detail", canonicalOperation: "owned-plan.owned-plan-repository.read", productPath: (nonce) => `/library/plan/${encodeURIComponent(ownedReadPlanId(nonce))}` }),
  "workout.add-exercise": activeAction({ selector: id("workout-add-exercise-confirm"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "submitExerciseAdd", callbackGroup: "workout.add-exercise", canonicalOperation: "active-workout.workout-repository.add-exercise", prerequisites: [
    prerequisite({ selector: id("workout-action-dock-add"), selectorSource: "src/ui/components/WorkoutActionDock.tsx", callbackSource: "src/ui/components/WorkoutActionDock.tsx", callbackOwnerToken: "onPress={onAddExercise}", callbackGroup: "workout.open-add-exercise", canonicalOperation: "workout.ui.open-add-exercise-picker" }),
    screenTap(id("workout-add-exercise-first-option"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setExerciseAddSelectedId(candidate.id)", "workout.select-add-exercise", "workout.ui.select-exercise-to-add"),
  ] }),
  "workout.replace-exercise": activeAction({ selector: id("workout-replace-exercise-confirm"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "submitExerciseEdit", callbackGroup: "workout.replace-exercise", canonicalOperation: "active-workout.workout-repository.replace-exercise", prerequisites: [
    screenTap(id("workout-active-exercise-menu"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setExerciseActionsVisibleForId(exercise.id)", "workout.open-exercise-menu", "workout.ui.open-active-exercise-menu"),
    screenTap(text("Replace exercise"), "src/ui/screens/ActiveWorkoutScreen.tsx", "openReplacementPicker(exerciseId)", "workout.open-replacement-picker", "workout.ui.open-replacement-picker"),
    screenTap(id("workout-replace-exercise-first-option"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setReplacementExerciseId(candidate.id)", "workout.select-replacement", "workout.ui.select-replacement-exercise"),
  ] }),
  "workout.delete-exercise": activeAction({ selector: id("delete-exercise-confirm"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "submitExerciseEdit", callbackGroup: "workout.remove-exercise", canonicalOperation: "active-workout.workout-repository.remove-exercise", prerequisites: [
    screenTap(id("workout-active-exercise-menu"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setExerciseActionsVisibleForId(exercise.id)", "workout.open-exercise-menu", "workout.ui.open-active-exercise-menu"),
    screenTap(text("Delete exercise"), "src/ui/screens/ActiveWorkoutScreen.tsx", "beginExerciseEdit({ action: \"remove\", exerciseId })", "workout.review-remove-exercise", "workout.ui.review-remove-exercise"),
  ] }),
  "workout.reorder": activeAction({ selector: id("workout-reorder-exercise-down"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "submitExerciseReorder", callbackGroup: "workout.reorder-exercises", canonicalOperation: "active-workout.workout-repository.reorder-exercises", prerequisites: [
    screenTap(id("workout-more-actions"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setMoreVisible(true)", "workout.open-more-actions", "workout.ui.open-more-actions"),
    screenTap(text("Reorder exercises"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setReorderMode((current) => !current)", "workout.enable-reorder", "workout.ui.enable-exercise-reorder"),
  ] }),
  "workout.undo": activeAction({ selector: text("Undo completed set"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "undoCompletedSet", callbackGroup: "workout.undo-completed-set", canonicalOperation: "active-workout.workout-repository.undo-completed-set", prerequisites: [
    screenTap(id("workout-complete-set"), "src/ui/components/WorkoutActionDock.tsx", "onPress={onComplete}", "workout.complete-set-for-undo", "active-workout.workout-repository.complete-set"),
  ] }),
  "workout.outcomes": activeAction({ selector: id("save-partial-workout-confirm"), selectorSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackSource: "src/ui/screens/ActiveWorkoutScreen.tsx", callbackOwnerToken: "commands.finishPartial", callbackGroup: "workout.finish-partial", canonicalOperation: "workout.workout-outcome-repository.finish-partial", resultSelector: id("workout-completion-context-card"), resultSource: "src/ui/screens/WorkoutCompletionScreen.tsx", prerequisites: [
    screenTap(id("workout-more-actions"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setMoreVisible(true)", "workout.open-more-actions", "workout.ui.open-more-actions"),
    screenTap(text("Finish as partial"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setOutcomeConfirmation(\"partial\")", "workout.review-finish-partial", "workout.ui.review-finish-partial"),
  ] }),
  "workout.completion-review": observationBinding({ routeSource: "app/completion/[sessionId].tsx", callbackSource: "app/completion/[sessionId].tsx", readySource: "src/ui/screens/WorkoutCompletionScreen.tsx", readySelector: id("workout-completion-context-card"), callbackOwnerToken: "runtime.getSessionDetail", callbackGroup: "workout.completion-review", canonicalOperation: "workout.workout-outcome-repository.get-session-detail", productPath: (nonce) => `/completion/${encodeURIComponent(workoutSessionId(nonce))}` }),
  "workout.completion-writeback": activeAction({ selector: text("Save changes to plan"), selectorSource: "src/ui/screens/WorkoutCompletionScreen.tsx", callbackSource: "app/completion/[sessionId].tsx", callbackOwnerToken: "runtime.applyCompletedWorkoutPlanWriteBack", callbackGroup: "workout.apply-plan-writeback", canonicalOperation: "owned-plan.owned-plan-repository.apply-session-exercise-edits-to-plan", resultSelector: text("Today"), resultSource: "src/ui/screens/TodayScreen.tsx" }),
  "workout.readonly-presentation": activeObservation("workout.readonly-presentation", "workout.workout-presentation.project-workout"),
  "workout.timing-policy": activeAction({ selector: text("Save default rest"), selectorSource: "src/ui/components/WorkoutPlanSettingsSheet.tsx", callbackSource: "app/workout/[sessionId].tsx", callbackOwnerToken: "savePlanPreferences", callbackGroup: "workout.save-plan-preference", canonicalOperation: "workout.workout-preference-repository.write", prerequisites: [
    screenTap(id("workout-more-actions"), "src/ui/screens/ActiveWorkoutScreen.tsx", "setMoreVisible(true)", "workout.open-more-actions", "workout.ui.open-more-actions"),
    screenTap(text("Plan settings"), "src/ui/screens/ActiveWorkoutScreen.tsx", "onOpenPlanSettings();", "workout.open-plan-settings", "workout.ui.open-plan-settings"),
  ] }),
  "workout.accessibility": activeObservation("workout.accessibility", "workout.workout-presentation.project-accessibility"),
  "workout.appearance": actionBinding({ routeSource: "app/more/index.tsx", selectorSource: "src/ui/screens/SettingsScreen.tsx", callbackSource: "src/ui/screens/SettingsScreen.tsx", readySource: "src/ui/screens/SettingsScreen.tsx", resultSource: "src/ui/screens/SettingsScreen.tsx", readySelector: text("Appearance"), actionSelector: text("Dark"), resultSelector: id("settings-appearance-group"), callbackOwnerToken: "setAppearance(option)", callbackGroup: "settings.set-appearance", canonicalOperation: "appearance.preference.write", productPath: constantPath("/more") }),
  "workout.offline-recovery": actionBinding({ routeSource: "app/more/manual-encrypted-backup.tsx", selectorSource: "app/more/data-and-recovery.tsx", callbackSource: "app/more/data-and-recovery.tsx", readySource: "app/more/data-and-recovery.tsx", resultSource: "app/more/data-and-recovery.tsx", readySelector: text("Create secure backup"), actionSelector: text("Create secure backup"), resultSelector: text("Secure backup ready"), callbackOwnerToken: "manualBackup.createBackup", callbackGroup: "backup.create-secure-backup", canonicalOperation: "backup.logical-backup-repository.collect", productPath: constantPath("/more/manual-encrypted-backup") }),
  "workout.performance": activeObservation("workout.performance", "workout.workout-presentation.project-workout"),

  "library.remembered-state": actionBinding({ routeSource: "app/(tabs)/_layout.tsx", selectorSource: "app/(tabs)/_layout.tsx", callbackSource: "app/(tabs)/library.tsx", readySource: "src/ui/screens/TodayScreen.tsx", resultSource: "src/ui/screens/LibraryScreen.tsx", readySelector: text("Today"), actionSelector: text("Library"), resultSelector: id("library-screen"), callbackOwnerToken: "loadLibrary={runtime.loadLibrary}", callbackGroup: "library.return-and-restore", canonicalOperation: "library.app-settings-repository.read-library-view-state", productPath: constantPath("/index") }),
  "library.plan-groups": actionBinding({ routeSource: "app/(tabs)/library.tsx", selectorSource: "src/ui/screens/LibraryScreen.tsx", callbackSource: "src/ui/screens/LibraryScreen.tsx", readySource: "src/ui/screens/LibraryScreen.tsx", resultSource: "src/ui/screens/LibraryScreen.tsx", readySelector: id("library-screen"), actionSelector: id("library-filters-chip"), resultSelector: id("starter-filter-sheet-frame"), callbackOwnerToken: "setFilterVisible(true)", callbackGroup: "library.open-plan-filters", canonicalOperation: "library.ui.open-plan-filter-sheet", productPath: constantPath("/library") }),
  "library.exercise-search": actionBinding({ interaction: "input", inputValue: "squat", routeSource: "app/(tabs)/library.tsx", selectorSource: "src/ui/screens/LibraryScreen.tsx", callbackSource: "src/ui/screens/LibraryScreen.tsx", readySource: "src/ui/screens/LibraryScreen.tsx", resultSource: "src/ui/screens/LibraryScreen.tsx", readySelector: id("library-screen"), actionSelector: text("Search exercises"), resultSelector: id("library-screen"), callbackOwnerToken: "searchExercises", callbackGroup: "library.search-exercises", canonicalOperation: "library.library-search-repository.search-exercises", productPath: constantPath("/library") }),
  "library.exercise-favorites": actionBinding({ routeSource: "app/(tabs)/library.tsx", selectorSource: "src/ui/screens/LibraryScreen.tsx", callbackSource: "src/ui/screens/LibraryScreen.tsx", readySource: "src/ui/screens/LibraryScreen.tsx", resultSource: "src/ui/screens/LibraryScreen.tsx", readySelector: id("library-screen"), actionSelector: text("Favorite"), resultSelector: id("library-screen"), callbackOwnerToken: "setExerciseFavorite", callbackGroup: "library.toggle-favorite", canonicalOperation: "custom-exercise.custom-exercise-repository.set-exercise-favorite", productPath: constantPath("/library") }),
  "library.actions-sheet": actionBinding({ routeSource: "app/(tabs)/library.tsx", selectorSource: "src/ui/screens/LibraryScreen.tsx", callbackSource: "src/ui/screens/LibraryScreen.tsx", readySource: "src/ui/screens/LibraryScreen.tsx", resultSource: "src/ui/screens/LibraryScreen.tsx", readySelector: id("library-screen"), actionSelector: id("library-actions-trigger"), resultSelector: id("library-actions-sheet-frame"), callbackOwnerToken: "setActionsVisible(true)", callbackGroup: "library.open-actions", canonicalOperation: "library.ui.open-actions-sheet", productPath: constantPath("/library") }),
  "library.neutral-plan-chooser": actionBinding({ routeSource: "app/(tabs)/library.tsx", selectorSource: "src/ui/screens/LibraryScreen.tsx", callbackSource: "app/(tabs)/library.tsx", readySource: "src/ui/screens/LibraryScreen.tsx", resultSource: "src/ui/screens/PlanTypeChooserScreen.tsx", readySelector: id("library-screen"), actionSelector: id("library-create-plan"), resultSelector: id("plan-type-chooser"), callbackOwnerToken: "router.push(\"/library/plan/create\"", callbackGroup: "library.open-plan-chooser", canonicalOperation: "library.navigation.open-plan-type-chooser", productPath: constantPath("/library") }),
  "library.true-no-plans": actionBinding({ routeSource: "app/library/plan/create-strength.tsx", selectorSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", callbackSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySource: "src/ui/screens/OwnedPlanEditorScreen.tsx", resultSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySelector: id("owned-plan-create"), actionSelector: text("Create draft"), resultSelector: id("owned-plan-editor"), callbackOwnerToken: "void create()", callbackGroup: "owned-plan.create", canonicalOperation: "owned-plan.owned-plan-repository.create-draft", productPath: constantPath("/library/plan/create-strength"), prerequisites: [
    screenInput(id("owned-plan-create-name"), "src/ui/screens/OwnedPlanEditorScreen.tsx", "onChangeText={setCreateName}", "owned-plan.enter-create-name", "owned-plan.ui.enter-draft-name", "CR-01 Empty Library Plan"),
    screenInput(id("owned-plan-create-first-day"), "src/ui/screens/OwnedPlanEditorScreen.tsx", "onChangeText={setFirstDayName}", "owned-plan.enter-first-day", "owned-plan.ui.enter-first-day-name", "Day One"),
  ] }),
  "library.owned-summary": observationBinding({ routeSource: "app/library/plan/[planId]/index.tsx", callbackSource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySelector: id("owned-plan-detail"), callbackOwnerToken: "props.loadPlan(props.planId)", callbackGroup: "owned-plan.open-detail", canonicalOperation: "owned-plan.owned-plan-repository.read", productPath: (nonce) => `/library/plan/${encodeURIComponent(ownedReadPlanId(nonce))}` }),
  "library.owned-lifecycle": actionBinding({ routeSource: "app/library/plan/[planId]/index.tsx", selectorSource: "src/ui/screens/OwnedPlanDetailScreen.tsx", callbackSource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySource: "src/ui/screens/OwnedPlanDetailScreen.tsx", resultSource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySelector: id("owned-plan-detail"), actionSelector: text("Archive plan"), resultSelector: id("owned-plan-detail"), callbackOwnerToken: "confirmReview", callbackGroup: "owned-plan.archive", canonicalOperation: "owned-plan.owned-plan-repository.archive", productPath: (nonce) => `/library/plan/${encodeURIComponent(ownedMutationPlanId(nonce))}`, prerequisites: [
    screenTap(text("Archive plan"), "src/ui/screens/OwnedPlanDetailScreen.tsx", "setReview(\"archive\")", "owned-plan.review-archive", "owned-plan.ui.review-archive"),
  ] }),
  "library.starter-detail": actionBinding({ routeSource: "app/library/starter/[templateId].tsx", selectorSource: "src/ui/screens/StarterPlanDetailScreen.tsx", callbackSource: "src/ui/screens/StarterPlanDetailScreen.tsx", readySource: "src/ui/screens/StarterPlanDetailScreen.tsx", resultSource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySelector: id("starter-plan-detail"), actionSelector: text("Save editable copy"), resultSelector: id("owned-plan-detail"), callbackOwnerToken: "saveEditableCopy(template.id).then(onSavedCopy)", callbackGroup: "starter-plan.create-copy", canonicalOperation: "starter-plan.starter-plan-repository.create-editable-copy", productPath: constantPath("/library/starter/full-body-foundation") }),
  "library.starter-activation": actionBinding({ routeSource: "app/library/starter/[templateId]/activate.tsx", selectorSource: "src/ui/screens/StarterActivationScreen.tsx", callbackSource: "src/ui/screens/StarterActivationScreen.tsx", readySource: "src/ui/screens/StarterActivationScreen.tsx", resultSource: "src/ui/screens/StarterActivationScreen.tsx", readySelector: id("starter-activation"), actionSelector: text("Activate plan"), resultSelector: id("starter-activation"), callbackOwnerToken: "void confirmActivation()", callbackGroup: "starter-plan.activate", canonicalOperation: "starter-plan.starter-plan-repository.activate-accepted-starter-plan", productPath: constantPath("/library/starter/full-body-foundation/activate"), prerequisites: [
    screenTap(text("Activate plan"), "src/ui/screens/StarterActivationScreen.tsx", "setConfirmVisible(true)", "starter-plan.review-activation", "starter-plan.ui.review-activation"),
  ] }),
  "library.template-update": actionBinding({ routeSource: "app/library/starter/[templateId]/activate.tsx", selectorSource: "src/ui/screens/TemplateUpdateScreen.tsx", callbackSource: "src/ui/screens/TemplateUpdateScreen.tsx", readySource: "src/ui/screens/TemplateUpdateScreen.tsx", resultSource: "src/ui/screens/TemplateUpdateScreen.tsx", readySelector: id("template-update"), actionSelector: text("Create new copy"), resultSelector: text("New copy created"), callbackOwnerToken: "void confirmCreate()", callbackGroup: "starter-plan.template-update-copy", canonicalOperation: "starter-plan.starter-plan-repository.create-template-update-copy", productPath: constantPath("/library/starter/full-body-foundation/activate"), routeParams: (nonce) => Object.freeze({ mode: "template-update", ownedPlanId: workoutPlanId(nonce) }), prerequisites: [
    screenTap(text("Create new copy"), "src/ui/screens/TemplateUpdateScreen.tsx", "setConfirmVisible(true)", "starter-plan.review-template-update", "starter-plan.ui.review-template-update-copy"),
  ] }),
  "library.create-strength": actionBinding({ routeSource: "app/library/plan/create-strength.tsx", selectorSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", callbackSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySource: "src/ui/screens/OwnedPlanEditorScreen.tsx", resultSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySelector: id("owned-plan-create"), actionSelector: text("Create draft"), resultSelector: id("owned-plan-editor"), callbackOwnerToken: "void create()", callbackGroup: "owned-plan.create", canonicalOperation: "owned-plan.owned-plan-repository.create-draft", productPath: constantPath("/library/plan/create-strength"), prerequisites: [
    screenInput(id("owned-plan-create-name"), "src/ui/screens/OwnedPlanEditorScreen.tsx", "onChangeText={setCreateName}", "owned-plan.enter-create-name", "owned-plan.ui.enter-draft-name", "CR-01 Strength Plan"),
    screenInput(id("owned-plan-create-first-day"), "src/ui/screens/OwnedPlanEditorScreen.tsx", "onChangeText={setFirstDayName}", "owned-plan.enter-first-day", "owned-plan.ui.enter-first-day-name", "Strength Day"),
  ] }),
  "library.plan-editor": actionBinding({ routeSource: "app/library/plan/[planId]/edit.tsx", selectorSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", callbackSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySource: "src/ui/screens/OwnedPlanEditorScreen.tsx", resultSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySelector: id("owned-plan-editor"), actionSelector: text("Save Plan Changes"), resultSelector: id("owned-plan-editor"), callbackOwnerToken: "commitPlan(\"saved\")", callbackGroup: "owned-plan.save", canonicalOperation: "owned-plan.owned-plan-repository.save", productPath: (nonce) => `/library/plan/${encodeURIComponent(ownedMutationPlanId(nonce))}/edit`, prerequisites: [
    screenInput(id("owned-plan-editor-name"), "src/ui/screens/OwnedPlanEditorScreen.tsx", "updateDraft((current) => ({ ...current, name }))", "owned-plan.edit-name", "owned-plan.ui.edit-name", "CR-01 Saved Plan"),
  ] }),
  "library.editor-draft-guards": actionBinding({ routeSource: "app/library/plan/[planId]/edit.tsx", selectorSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", callbackSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySource: "src/ui/screens/OwnedPlanEditorScreen.tsx", resultSource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySelector: id("owned-plan-editor"), actionSelector: text("Discard"), resultSelector: id("owned-plan-detail"), callbackOwnerToken: "onBack();", callbackGroup: "owned-plan.discard-draft", canonicalOperation: "owned-plan.ui.discard-unsaved-draft", productPath: (nonce) => `/library/plan/${encodeURIComponent(ownedMutationPlanId(nonce))}/edit`, prerequisites: [
    screenInput(id("owned-plan-editor-name"), "src/ui/screens/OwnedPlanEditorScreen.tsx", "updateDraft((current) => ({ ...current, name }))", "owned-plan.edit-name", "owned-plan.ui.edit-name", "CR-01 Unsaved Plan"),
    screenTap(id("owned-plan-editor-back"), "src/ui/screens/OwnedPlanEditorScreen.tsx", "setDirtyLeaveVisible(true)", "owned-plan.review-dirty-leave", "owned-plan.ui.review-dirty-leave"),
  ] }),
  "library.schedule-editor": actionBinding({ routeSource: "app/library/plan/[planId]/schedule.tsx", selectorSource: "src/ui/screens/ScheduleEditorScreen.tsx", callbackSource: "src/ui/screens/ScheduleEditorScreen.tsx", readySource: "src/ui/screens/ScheduleEditorScreen.tsx", resultSource: "src/ui/screens/OwnedPlanDetailScreen.tsx", readySelector: id("schedule-editor"), actionSelector: text("Save schedule"), resultSelector: id("owned-plan-detail"), callbackOwnerToken: "void confirmSave()", callbackGroup: "owned-plan.save-schedule", canonicalOperation: "owned-plan.schedule-repository.save-version", productPath: (nonce) => `/library/plan/${encodeURIComponent(ownedMutationPlanId(nonce))}/schedule`, prerequisites: [
    screenTap(text("Save schedule"), "src/ui/screens/ScheduleEditorScreen.tsx", "setConfirmVisible(true)", "owned-plan.review-schedule", "owned-plan.ui.review-schedule-save"),
  ] }),
  "library.replacement-impact": actionBinding({ routeSource: "app/library/plan/[planId]/replace/[occurrenceId].tsx", selectorSource: "src/ui/screens/ExerciseReplacementScreen.tsx", callbackSource: "src/ui/screens/ExerciseReplacementScreen.tsx", readySource: "src/ui/screens/ExerciseReplacementScreen.tsx", resultSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySelector: text("Review replacement"), actionSelector: text("Replace exercises"), resultSelector: id("owned-plan-editor"), callbackOwnerToken: "void save()", callbackGroup: "owned-plan.replace-exercise", canonicalOperation: "plan-impact.plan-impact-repository.apply-exercise-replacement", productPath: (nonce) => `/library/plan/${encodeURIComponent(ownedMutationPlanId(nonce))}/replace/${encodeURIComponent(ownedMutationOccurrenceId(nonce))}`, prerequisites: [
    screenTap(id("exercise-replacement-first-compatible"), "src/ui/screens/ExerciseReplacementScreen.tsx", "setReplacementExerciseId(candidate.exerciseId)", "owned-plan.select-replacement", "owned-plan.ui.select-compatible-replacement"),
    ...["targets", "warmups", "rest", "progression", "historyImmutable"].map((key) => screenTap(id(`exercise-replacement-review-${key}`), "src/ui/screens/ExerciseReplacementScreen.tsx", "setReview((current) => ({", `owned-plan.review-replacement-${key}`, `owned-plan.ui.review-replacement-${key}`)),
    screenTap(text("Save replacement"), "src/ui/screens/ExerciseReplacementScreen.tsx", "setConfirmVisible(true)", "owned-plan.review-replacement-save", "owned-plan.ui.review-replacement-save"),
  ] }),
  "library.day-removal-impact": actionBinding({ routeSource: "app/library/plan/[planId]/day/[dayId]/remove.tsx", selectorSource: "src/ui/screens/PlanDayRemovalScreen.tsx", callbackSource: "src/ui/screens/PlanDayRemovalScreen.tsx", readySource: "src/ui/screens/PlanDayRemovalScreen.tsx", resultSource: "src/ui/screens/OwnedPlanEditorScreen.tsx", readySelector: text("Schedule impact"), actionSelector: text("Remove day"), resultSelector: id("owned-plan-editor"), callbackOwnerToken: "void commit()", callbackGroup: "owned-plan.remove-day", canonicalOperation: "plan-impact.plan-impact-repository.apply-day-removal", productPath: (nonce) => `/library/plan/${encodeURIComponent(ownedMutationPlanId(nonce))}/day/${encodeURIComponent(ownedMutationDayId(nonce))}/remove`, prerequisites: [
    screenTap(text("Remove binding"), "src/ui/screens/PlanDayRemovalScreen.tsx", "setChoice({ kind: \"remove_binding\" })", "owned-plan.select-day-removal-impact", "owned-plan.ui.select-remove-binding"),
    screenTap(text("Remove day"), "src/ui/screens/PlanDayRemovalScreen.tsx", "setConfirmVisible(true)", "owned-plan.review-day-removal", "owned-plan.ui.review-day-removal"),
  ] }),
  "library.builtin-exercise": observationBinding({ routeSource: "app/library/exercise/[exerciseId].tsx", callbackSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySource: "src/ui/screens/ExerciseDetailScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-detail-screen"), resultSelector: id("exercise-detail-instructions-card"), callbackOwnerToken: "loadExercise(exerciseId)", callbackGroup: "exercise.load-instructions", canonicalOperation: "library.content-repository.read-exercise-instructions", productPath: constantPath(`/library/exercise/${bundledExerciseId}`) }),
  "library.custom-exercise": actionBinding({ routeSource: "app/library/exercise/[exerciseId].tsx", selectorSource: "src/ui/screens/ExerciseDetailScreen.tsx", callbackSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySource: "src/ui/screens/ExerciseDetailScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-detail-screen"), actionSelector: id("exercise-archive-confirm"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "setArchived({", callbackGroup: "exercise.archive", canonicalOperation: "custom-exercise.custom-exercise-repository.set-custom-exercise-archived", productPath: (nonce) => `/library/exercise/${encodeURIComponent(customExerciseId(nonce))}`, prerequisites: [
    screenTap(text("Archive exercise"), "src/ui/screens/ExerciseDetailScreen.tsx", "void openArchivePreview()", "exercise.review-archive", "exercise.ui.review-archive"),
  ] }),
  "library.create-exercise": actionBinding({ routeSource: "app/library/exercise/create.tsx", selectorSource: "src/ui/screens/ExerciseEditorScreen.tsx", callbackSource: "src/bootstrap/customExerciseRuntime.tsx", readySource: "src/ui/screens/ExerciseEditorScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-editor-screen"), actionSelector: id("exercise-editor-save-create"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "return runtime.createCustomExercise", callbackGroup: "exercise.create", canonicalOperation: "custom-exercise.custom-exercise-repository.create-custom-exercise", productPath: constantPath("/library/exercise/create"), prerequisites: [
    screenInput(id("exercise-editor-name"), "src/ui/screens/ExerciseEditorScreen.tsx", "onChangeText={(name) => update({ name })}", "exercise.enter-create-name", "exercise.ui.enter-create-name", "CR-01 Custom Exercise"),
  ] }),
  "library.copy-metric-migration": actionBinding({ routeSource: "app/library/exercise/[exerciseId]/edit.tsx", selectorSource: "src/ui/screens/MetricMigrationScreen.tsx", callbackSource: "src/ui/screens/MetricMigrationScreen.tsx", readySource: "src/ui/screens/MetricMigrationScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("metric-migration-screen"), actionSelector: text("Save profile change"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "void commit()", callbackGroup: "exercise.metric-migration", canonicalOperation: "metric-profile.metric-repository.migrate-custom-exercise-metric-profile", productPath: (nonce) => `/library/exercise/${encodeURIComponent(metricExerciseId(nonce))}/edit`, routeParams: () => Object.freeze({ mode: "metric" }), prerequisites: [
    screenTap(id("metric-migration-profile-unscored"), "src/ui/screens/MetricMigrationScreen.tsx", "onSelect={selectProfile}", "exercise.select-metric-profile", "exercise.ui.select-unscored-profile"),
    screenTap(id("metric-migration-first-policy-hold"), "src/ui/screens/MetricMigrationScreen.tsx", "\"manual_hold\"", "exercise.select-migration-policy", "exercise.ui.select-manual-hold-policy"),
    screenTap(text("Save profile change"), "src/ui/screens/MetricMigrationScreen.tsx", "setConfirmationVisible(true)", "exercise.review-metric-migration", "exercise.ui.review-metric-migration"),
  ] }),
  "library.load-error-recovery": actionBinding({ routeSource: "app/(tabs)/library.tsx", selectorSource: "src/ui/screens/LibraryScreen.tsx", callbackSource: "src/ui/screens/LibraryScreen.tsx", readySource: "src/ui/screens/LibraryScreen.tsx", resultSource: "src/ui/screens/LibraryScreen.tsx", readySelector: text("Library could not be loaded"), actionSelector: text("Retry loading Library"), resultSelector: id("library-screen"), callbackOwnerToken: "retryInitialLibraryLoad", callbackGroup: "library.retry-load", canonicalOperation: "owned-plan.owned-plan-repository.read", productPath: constantPath("/library"), routeParams: () => Object.freeze({ phase17Load: "fail-once" }) }),
  "library.running-detail": observationBinding({ routeSource: "app/library/running/[planId].tsx", callbackSource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySelector: id("running-plan-detail"), callbackOwnerToken: "props.loadPlan(props.planId)", callbackGroup: "running.open-detail", canonicalOperation: "running-plan.running-plan-repository.read-aggregate", productPath: (nonce) => `/library/running/${encodeURIComponent(runningPlanId(nonce))}` }),
  "library.running-create-zero-sessions": actionBinding({ routeSource: "app/library/running/create.tsx", selectorSource: "src/ui/screens/RunningPlanEditorScreen.tsx", callbackSource: "app/library/running/create.tsx", readySource: "src/ui/screens/RunningPlanEditorScreen.tsx", resultSource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySelector: id("running-plan-editor"), actionSelector: text("Create running plan"), resultSelector: id("running-plan-detail"), callbackOwnerToken: "runtime.createInactivePlan", callbackGroup: "running.create-plan", canonicalOperation: "running-plan.running-plan-repository.create-inactive-aggregate", productPath: constantPath("/library/running/create"), prerequisites: [
    screenInput(text("Goal distance (metres)"), "src/ui/screens/RunningPlanEditorScreen.tsx", "goalDistanceMeters: Number(value)", "running.enter-goal-distance", "running.ui.enter-goal-distance", "5000"),
    screenInput(text("Target time"), "src/ui/screens/RunningPlanEditorScreen.tsx", "targetDurationMs: seconds === \"\"", "running.enter-target-time", "running.ui.enter-target-time", "1500"),
    screenInput(text("Runs per week"), "src/ui/screens/RunningPlanEditorScreen.tsx", "runsPerWeek: Number(value)", "running.enter-runs-per-week", "running.ui.enter-runs-per-week", "1"),
    screenTap(id("running-plan-training-day-Monday"), "src/ui/screens/RunningPlanEditorScreen.tsx", "trainingDays: selected ?", "running.select-training-day", "running.ui.select-training-day"),
  ] }),
  "library.running-goal-edit": actionBinding({ routeSource: "app/library/running/[planId]/edit.tsx", selectorSource: "src/ui/screens/RunningPlanEditorScreen.tsx", callbackSource: "src/ui/screens/RunningPlanEditorScreen.tsx", readySource: "src/ui/screens/RunningPlanEditorScreen.tsx", resultSource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySelector: id("running-plan-editor"), actionSelector: text("Save changes"), resultSelector: id("running-plan-detail"), callbackOwnerToken: "save", callbackGroup: "running.save-plan", canonicalOperation: "running-plan.running-plan-repository.save-source-graph", productPath: (nonce) => `/library/running/${encodeURIComponent(runningPlanId(nonce))}/edit`, prerequisites: [
    screenInput(text("Goal distance (metres)"), "src/ui/screens/RunningPlanEditorScreen.tsx", "goalDistanceMeters: Number(value)", "running.edit-goal-distance", "running.ui.edit-goal-distance", "10000"),
  ] }),
  "library.running-session-common": runningSessionSave(),
  "library.running-recovery": runningSessionSave(),
  "library.running-long": runningSessionSave("Long run"),
  "library.running-progression": runningSessionSave("Progression"),
  "library.running-tempo": runningSessionSave("Tempo"),
  "library.running-intervals": runningSessionSave("Intervals"),
  "library.running-hills": runningSessionSave("Hills"),
  "library.running-fartlek": runningSessionSave("Fartlek"),
  "library.running-session-lifecycle": actionBinding({ routeSource: "app/library/running/[planId].tsx", selectorSource: "src/ui/screens/RunningPlanDetailScreen.tsx", callbackSource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySource: "src/ui/screens/RunningPlanDetailScreen.tsx", resultSource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySelector: id("running-plan-detail"), actionSelector: text("Archive plan"), resultSelector: id("running-plan-detail"), callbackOwnerToken: "confirmLifecycle", callbackGroup: "running.confirm-lifecycle", canonicalOperation: "running-plan.running-plan-repository.confirm-lifecycle", productPath: (nonce) => `/library/running/${encodeURIComponent(runningPlanId(nonce))}`, prerequisites: [
    screenTap(text("Archive plan"), "src/ui/screens/RunningPlanDetailScreen.tsx", "beginLifecycleReview(lifecycleAction)", "running.review-lifecycle", "running.ui.review-lifecycle"),
  ] }),
  "library.running-conflict": actionBinding({ routeSource: "app/library/running/[planId].tsx", selectorSource: "src/ui/components/ScheduleConflictSheet.tsx", callbackSource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySource: "src/ui/screens/RunningPlanDetailScreen.tsx", resultSource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySelector: id("running-plan-detail"), actionSelector: text("Confirm schedule change"), resultSelector: id("running-plan-detail"), callbackOwnerToken: "confirmCollision", callbackGroup: "running.confirm-collision", canonicalOperation: "schedule-collision.schedule-collision-repository.confirm", productPath: (nonce) => `/library/running/${encodeURIComponent(`v12:collision:${nonce}:running-plan`)}`, prerequisites: [
    screenTap(text("Review schedule collision"), "src/ui/screens/RunningPlanDetailScreen.tsx", "beginCollisionReview", "running.review-schedule-collision", "running.ui.review-schedule-collision"),
    screenTap(id("schedule-conflict-first-choice"), "src/ui/components/ScheduleConflictSheet.tsx", "setChoice(candidate)", "running.select-collision-choice", "running.ui.select-collision-choice"),
  ] }),
  "library.running-create-typed-sessions": runningSessionSave("Fartlek"),
  "library.running-two-same-day-slots": actionBinding({ routeSource: "app/library/running/[planId]/edit.tsx", selectorSource: "src/ui/screens/RunningPlanEditorScreen.tsx", callbackSource: "src/ui/screens/RunningPlanEditorScreen.tsx", readySource: "src/ui/screens/RunningPlanEditorScreen.tsx", resultSource: "src/ui/screens/RunningPlanDetailScreen.tsx", readySelector: id("running-plan-editor"), actionSelector: text("Save changes"), resultSelector: id("running-plan-detail"), callbackOwnerToken: "save", callbackGroup: "running.save-plan", canonicalOperation: "running-plan.running-plan-repository.save-source-graph", productPath: (nonce) => `/library/running/${encodeURIComponent(runningPlanId(nonce))}/edit`, prerequisites: [
    screenInput(text("Plan name"), "src/ui/screens/RunningPlanEditorScreen.tsx", "name }))", "running.edit-plan-name", "running.ui.edit-plan-name", "CR-01 Two Slots"),
  ] }),
  "library.accessibility-recovery": observationBinding({ routeSource: "app/(tabs)/library.tsx", callbackSource: "src/ui/screens/LibraryScreen.tsx", readySource: "src/ui/screens/LibraryScreen.tsx", readySelector: id("library-screen"), callbackOwnerToken: "loadLibrary", callbackGroup: "library.accessibility-observation", canonicalOperation: "library.library-runtime.read-accessibility-recovery", productPath: constantPath("/library") }),
  "library.custom-exercise-edit": actionBinding({ routeSource: "app/library/exercise/[exerciseId]/edit.tsx", selectorSource: "src/ui/screens/ExerciseEditorScreen.tsx", callbackSource: "src/bootstrap/customExerciseRuntime.tsx", readySource: "src/ui/screens/ExerciseEditorScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-editor-screen"), actionSelector: id("exercise-editor-save-edit"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "return runtime.editCustomExercise", callbackGroup: "exercise.edit", canonicalOperation: "custom-exercise.custom-exercise-repository.edit-custom-exercise", productPath: (nonce) => `/library/exercise/${encodeURIComponent(customExerciseId(nonce))}/edit`, prerequisites: [
    screenInput(id("exercise-editor-name"), "src/ui/screens/ExerciseEditorScreen.tsx", "onChangeText={(name) => update({ name })}", "exercise.edit-name", "exercise.ui.edit-name", "CR-01 Edited Exercise"),
  ] }),
  "library.custom-exercise-hide": actionBinding({ routeSource: "app/library/exercise/[exerciseId].tsx", selectorSource: "src/ui/screens/ExerciseDetailScreen.tsx", callbackSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySource: "src/ui/screens/ExerciseDetailScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-detail-screen"), actionSelector: text("Hide exercise"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "setHidden({", callbackGroup: "exercise.set-hidden", canonicalOperation: "custom-exercise.custom-exercise-repository.set-exercise-hidden", productPath: (nonce) => `/library/exercise/${encodeURIComponent(customExerciseId(nonce))}` }),
  "library.custom-exercise-unhide": actionBinding({ routeSource: "app/library/exercise/[exerciseId].tsx", selectorSource: "src/ui/screens/ExerciseDetailScreen.tsx", callbackSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySource: "src/ui/screens/ExerciseDetailScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-detail-screen"), actionSelector: text("Show exercise"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "setHidden({", callbackGroup: "exercise.set-hidden", canonicalOperation: "custom-exercise.custom-exercise-repository.set-exercise-hidden", productPath: (nonce) => `/library/exercise/${encodeURIComponent(customExerciseId(nonce))}` }),
  "library.custom-exercise-copy-bundled": actionBinding({ routeSource: "app/library/exercise/[exerciseId]/edit.tsx", selectorSource: "src/ui/screens/ExerciseEditorScreen.tsx", callbackSource: "src/bootstrap/customExerciseRuntime.tsx", readySource: "src/ui/screens/ExerciseEditorScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-editor-screen"), actionSelector: id("exercise-editor-save-copy"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "return runtime.createCustomCopy({", callbackGroup: "exercise.copy", canonicalOperation: "custom-exercise.custom-exercise-repository.create-custom-copy", productPath: constantPath(`/library/exercise/${bundledExerciseId}/edit`), routeParams: () => Object.freeze({ mode: "copy" }) }),
  "library.custom-exercise-archive": actionBinding({ routeSource: "app/library/exercise/[exerciseId].tsx", selectorSource: "src/ui/screens/ExerciseDetailScreen.tsx", callbackSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySource: "src/ui/screens/ExerciseDetailScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-detail-screen"), actionSelector: id("exercise-archive-confirm"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "setArchived({", callbackGroup: "exercise.archive", canonicalOperation: "custom-exercise.custom-exercise-repository.set-custom-exercise-archived", productPath: (nonce) => `/library/exercise/${encodeURIComponent(customExerciseId(nonce))}`, prerequisites: [
    screenTap(text("Archive exercise"), "src/ui/screens/ExerciseDetailScreen.tsx", "void openArchivePreview()", "exercise.review-archive", "exercise.ui.review-archive"),
  ] }),
  "library.custom-exercise-reactivate": actionBinding({ routeSource: "app/library/exercise/[exerciseId].tsx", selectorSource: "src/ui/screens/ExerciseDetailScreen.tsx", callbackSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySource: "src/ui/screens/ExerciseDetailScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("exercise-detail-screen"), actionSelector: text("Restore exercise"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "restore", callbackGroup: "exercise.reactivate", canonicalOperation: "custom-exercise.custom-exercise-repository.set-custom-exercise-archived", productPath: (nonce) => `/library/exercise/${encodeURIComponent(customExerciseId(nonce))}` }),
  "library.metric-profile-migration": actionBinding({ routeSource: "app/library/exercise/[exerciseId]/edit.tsx", selectorSource: "src/ui/screens/MetricMigrationScreen.tsx", callbackSource: "src/ui/screens/MetricMigrationScreen.tsx", readySource: "src/ui/screens/MetricMigrationScreen.tsx", resultSource: "src/ui/screens/ExerciseDetailScreen.tsx", readySelector: id("metric-migration-screen"), actionSelector: text("Save profile change"), resultSelector: id("exercise-detail-screen"), callbackOwnerToken: "void commit()", callbackGroup: "exercise.metric-migration", canonicalOperation: "metric-profile.metric-repository.migrate-custom-exercise-metric-profile", productPath: (nonce) => `/library/exercise/${encodeURIComponent(metricExerciseId(nonce))}/edit`, routeParams: () => Object.freeze({ mode: "metric" }), prerequisites: [
    screenTap(id("metric-migration-profile-unscored"), "src/ui/screens/MetricMigrationScreen.tsx", "onSelect={selectProfile}", "exercise.select-metric-profile", "exercise.ui.select-unscored-profile"),
    screenTap(id("metric-migration-first-policy-hold"), "src/ui/screens/MetricMigrationScreen.tsx", "\"manual_hold\"", "exercise.select-migration-policy", "exercise.ui.select-manual-hold-policy"),
    screenTap(text("Save profile change"), "src/ui/screens/MetricMigrationScreen.tsx", "setConfirmationVisible(true)", "exercise.review-metric-migration", "exercise.ui.review-metric-migration"),
  ] }),
});

function phaseFlowSource(shard: V12NativeAcceptanceShard): string {
  if (shard === "multi-plan") return "maestro/v1.2/multi-plan.yaml";
  return shard === "workout" ? "maestro/v1.2/workout.yaml" : "maestro/v1.2/library-running.yaml";
}

function multiPlanBinding(contract: V12NativeAcceptanceCaseContract): V12NativeAcceptanceProductDefinition {
  return Object.freeze({
    shard: contract.shard,
    caseId: contract.caseId,
    operationId: contract.operation.id,
    interaction: "domain-observation",
    phaseFlowSource: phaseFlowSource(contract.shard),
    visualStateId: "BW-027",
    routeSource: "app/calendar/plan/[occurrenceId].tsx",
    selectorSource: "src/ui/screens/PlannedWorkoutDetailScreen.tsx",
    callbackSource: null,
    readySource: "src/ui/screens/PlannedWorkoutDetailScreen.tsx",
    resultSource: "src/ui/screens/PlannedWorkoutDetailScreen.tsx",
    readySelector: id("planned-workout-summary"),
    actionSelector: null,
    inputValue: null,
    resultSelector: id("planned-workout-summary"),
    callbackOwnerToken: null,
    callbackGroup: `phase13.domain-observation.${contract.caseId}`,
    contractOperation: contract.operation.handlerId,
    canonicalOperation: contract.operation.handlerId,
    prerequisites: Object.freeze([]),
    fixtureVariant: contract.caseId,
    productPath: (nonce) => `/calendar/plan/${encodeURIComponent(`v12:collision:${nonce}:strength-opportunity`)}`,
    routeParams: () => Object.freeze({ origin: "calendar" }),
  });
}

const entries = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.map((contract) => {
  if (contract.shard === "multi-plan") return multiPlanBinding(contract);
  const product = CASE_BINDINGS[contract.caseId];
  if (product === undefined) throw new Error(`v12_product_registry_case_unbound:${contract.caseId}`);
  return Object.freeze({
    shard: contract.shard,
    caseId: contract.caseId,
    operationId: contract.operation.id,
    phaseFlowSource: phaseFlowSource(contract.shard),
    visualStateId: contract.shard === "workout" ? "BW-002" : "BW-034",
    fixtureVariant: contract.caseId,
    contractOperation: contract.operation.handlerId,
    ...product,
  });
});

for (const entry of entries) {
  const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ shard, caseId }) => (
    shard === entry.shard && caseId === entry.caseId
  ));
  if (contract === undefined || entry.contractOperation !== contract.operation.handlerId) {
    throw new Error(`v12_product_registry_semantic_owner_invalid:${entry.caseId}`);
  }
  if ((entry.interaction === "input") !== (entry.inputValue !== null)) {
    throw new Error(`v12_product_registry_input_invalid:${entry.caseId}`);
  }
}

const byKey = new Map(entries.map((entry) => [`${entry.shard}:${entry.caseId}`, entry]));
if (entries.length !== 101 || byKey.size !== 101 || Object.keys(CASE_BINDINGS).length !== 88) {
  throw new Error("v12_product_registry_coverage_invalid");
}

export const V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY: readonly V12NativeAcceptanceProductDefinition[] =
  Object.freeze(entries);

export function v12NativeAcceptanceProductDefinition(
  shard: V12NativeAcceptanceShard,
  caseId: string,
): V12NativeAcceptanceProductDefinition {
  const definition = byKey.get(`${shard}:${caseId}`);
  if (definition === undefined) throw new Error("v12_product_registry_case_missing");
  return definition;
}
