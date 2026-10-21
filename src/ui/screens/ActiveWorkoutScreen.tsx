import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import * as Crypto from "expo-crypto";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Plus,
  type LucideIcon,
} from "lucide-react-native";
import {
  PlanEditorReorderableRow,
  type PlanEditorReorderMethod,
} from "../components/PlanEditorFields";

import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextStyle,
} from "react-native";

import type {
  AdjustRestInput,
  RestCommandResult,
  RestNotificationPermission,
  RestRevisionInput,
} from "../../domains/rest";
import type {
  ActiveWorkoutSet,
  ActiveWorkoutExercise,
  ActiveWorkoutView,
  EmptyWorkoutView,
  AddWorkingSetInput,
  AddWarmupInput,
  AddExerciseInput,
  CompleteSetInput,
  CompleteSetResult,
  CompleteWarmupInput,
  DiscardWorkoutInput,
  FinishCompletedInput,
  FinishOutcomeResult,
  FinishPartialInput,
  RemoveWarmupInput,
  RemoveWorkingSetInput,
  ReviseCompletedSetInput,
  SaveZeroSetInput,
  SessionDetail,
  SetObservation,
  SkipExerciseInput,
  UndoCompletedSetInput,
  UndoCompletedSetResult,
  UpdateActiveSetDraftInput,
  UpdateSessionExerciseDefaultRestInput,
  UpdateWarmupDraftInput,
} from "../../domains/workout";
import type {
  RemoveExerciseInput,
  ReorderExercisesInput,
  ReplaceExerciseInput,
} from "../../domains/workout/activeWorkout";
import {
  ConfirmationSheet,
  ContentCard,
  ActionCluster,
  FocusablePressable,
  IconAction,
  InlineNotice,
  M3SearchField,
  type M3SearchFieldHandle,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
} from "../components";
import { BottomSheet } from "../components/BottomSheet";
import {
  RestDock,
} from "../components/RestDock";
import { useOptionalSemanticToast } from "../components/SemanticToast";
import type {
  RestCountdownCuePort,
} from "../../domains/rest/restCountdownCuePort";
import type {
  ExerciseMetricHistory,
} from "../../domains/history";
import { ExerciseTrendSheet } from "../components/ExerciseTrendSheet";
import {
  formatObservation,
  observationForSet,
  SetRow,
} from "../components/SetRow";
import { WorkoutSetEditorSheet } from "../components/WorkoutSetEditorSheet";
import { WorkoutActionDock } from "../components/WorkoutActionDock";
import {
  presentWorkoutSession,
} from "../../domains/workout/workoutPresentation";
import {
  WorkoutSessionPresentation,
} from "../components/WorkoutSessionPresentation";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  radius,
  sizes,
  space,
  workoutTypeScale,
  useAppTheme,
} from "../theme";
import type {
  V12AcceptanceBenchmarkPort,
} from "../../bootstrap/v12AcceptanceBenchmark";

export interface ActiveWorkoutCommands {
  addExercise?(input: AddExerciseInput): Promise<import("../../domains/workout").AddExerciseResult>;
  replaceExercise?(input: ReplaceExerciseInput): Promise<ExerciseEditCommandResult>;
  removeExercise?(input: RemoveExerciseInput): Promise<ExerciseEditCommandResult>;
  reorderExercises?(input: ReorderExercisesInput): Promise<ExerciseReorderCommandResult>;
  updateActiveSetDraft(
    input: UpdateActiveSetDraftInput,
  ): Promise<ActiveWorkoutView>;
  updateWarmupDraft(
    input: UpdateWarmupDraftInput,
  ): Promise<ActiveWorkoutView>;
  addWarmup(input: AddWarmupInput): Promise<CommittedSetMutationResult>;
  addWorkingSet(input: AddWorkingSetInput): Promise<CommittedSetMutationResult>;
  completeWarmup(input: CompleteWarmupInput): Promise<ActiveWorkoutView>;
  removeWarmup?(input: RemoveWarmupInput): Promise<RemovalCommandResult>;
  removeWorkingSet?(input: RemoveWorkingSetInput): Promise<RemovalCommandResult>;
  /** @deprecated The screen never invokes legacy skip commands. */
  skipWarmup?(input: import("../../domains/workout").SkipWarmupInput): Promise<ActiveWorkoutView>;
  /** @deprecated The screen never invokes legacy skip commands. */
  skipWorkingSet?(input: import("../../domains/workout").SkipWorkingSetInput): Promise<ActiveWorkoutView>;
  completeSet(input: CompleteSetInput): Promise<CompleteSetResult>;
  undoCompletedSet?(input: UndoCompletedSetInput): Promise<UndoCompletedSetResult>;
  reviseCompletedSet(
    input: ReviseCompletedSetInput,
  ): Promise<CommittedSetMutationResult>;
  startManualRest(input: RestRevisionInput): Promise<RestCommandResult>;
  pauseRest(input: RestRevisionInput): Promise<RestCommandResult>;
  resumeRest(input: RestRevisionInput): Promise<RestCommandResult>;
  adjustRest(input: AdjustRestInput): Promise<RestCommandResult>;
  skipRest(input: RestRevisionInput): Promise<RestCommandResult>;
  expireRest(input: RestRevisionInput): Promise<RestCommandResult>;
  updateSessionExerciseDefaultRest?(
    input: UpdateSessionExerciseDefaultRestInput,
  ): Promise<ActiveWorkoutView>;
  finishCompleted(input: FinishCompletedInput): Promise<FinishOutcomeResult>;
  finishPartial(input: FinishPartialInput): Promise<FinishOutcomeResult>;
  saveZeroSetWorkout(input: SaveZeroSetInput): Promise<FinishOutcomeResult>;
  discardWorkout(input: DiscardWorkoutInput): Promise<FinishOutcomeResult>;
  skipExercise(input: SkipExerciseInput): Promise<Readonly<{
    sessionId: string;
    status: "in_progress";
    sessionRevision: number;
  }>>;
}

type CommittedSetMutationResult = ActiveWorkoutView & Readonly<{
  committedSetId: string;
}>;

type CommittedRemovalRefreshFailure = Readonly<{
  outcome: "committed_refresh_failed";
  sessionId: string;
  setId: string;
  sessionRevision: number;
}>;

type RemovalCommandResult = ActiveWorkoutView | CommittedRemovalRefreshFailure;

type CommittedExerciseEditRefreshFailure = Readonly<{
  outcome: "committed_refresh_failed";
  sessionId: string;
  sessionExerciseId: string;
  sessionRevision: number;
}>;

type ExerciseEditCommandResult = ActiveWorkoutView | CommittedExerciseEditRefreshFailure;

type ExerciseReorderCommandResult = ActiveWorkoutView
  | CommittedExerciseReorderRefreshFailure;

type CommittedExerciseReorderRefreshFailure = Readonly<{
  outcome: "committed_refresh_failed";
  sessionId: string;
  sessionRevision: number;
}>;

type ExerciseReorderFailure = Readonly<{
  sourcePosition: number;
  targetPosition: number;
  request: ReorderExercisesInput;
  retry: () => void;
}>;

type ExerciseReorderAnnouncement = Readonly<{
  sessionExerciseId: string;
  text: string;
}>;

function isCommittedExerciseReorderRefreshFailure(
  result: ExerciseReorderCommandResult,
): result is CommittedExerciseReorderRefreshFailure {
  return "outcome" in result && result.outcome === "committed_refresh_failed";
}

type ExerciseAction = "replace" | "remove";

type ExerciseEditCandidate = Readonly<{
  action: ExerciseAction;
  exerciseId: string;
}>;

type ExerciseEditFailure = Readonly<{
  action: ExerciseAction;
  exerciseId: string;
  retry: () => void;
}>;

type WarmupCommandState = Readonly<{
  setId: string;
  action: "complete" | "skip" | "update" | "add";
}> | null;

type OutcomeConfirmation =
  | "skip_exercise"
  | "partial"
  | "zero_sets"
  | "discard"
  | null;

type TerminalWorkoutOperation =
  | "finish_completed"
  | "partial"
  | "zero_sets"
  | "discard";

type OutcomeFailure = Readonly<{
  operation: TerminalWorkoutOperation;
}>;

type SectionMutation = "add_warmup" | "add_working";

type SectionMutationFailure = Readonly<{
  operation: SectionMutation;
  sessionExerciseId: string;
  retry: () => void;
}>;

type RemovalCandidate = Readonly<{
  kind: "warmup" | "working";
  setId: string;
  index: number;
  sessionExerciseId: string;
}>;

function exercisesFor(view: ActiveWorkoutView): readonly ActiveWorkoutExercise[] {
  return view.exercises.length > 0 ? view.exercises : [view.currentExercise];
}

function isCommittedExerciseEditRefreshFailure(
  result: ExerciseEditCommandResult,
): result is CommittedExerciseEditRefreshFailure {
  return "outcome" in result && result.outcome === "committed_refresh_failed";
}

function resolveSetOwner(
  view: ActiveWorkoutView,
  setId: string,
): Readonly<{ exercise: ActiveWorkoutExercise; set: ActiveWorkoutSet }> | undefined {
  for (const exercise of exercisesFor(view)) {
    const set = [...exercise.warmups, ...exercise.workingSets].find(
      (candidate) => candidate.id === setId,
    );
    if (set !== undefined) {
      return { exercise, set };
    }
  }
  return undefined;
}

type RemovalFailure = RemovalCandidate;

function isCommittedRemovalRefreshFailure(
  result: RemovalCommandResult,
): result is CommittedRemovalRefreshFailure {
  return "outcome" in result && result.outcome === "committed_refresh_failed";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    );
    return `{${entries.map(([key, entry]) =>
      `${JSON.stringify(key)}:${stableJson(entry)}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function idempotencyKey(
  sessionId: string,
  setId: string,
  expectedRevision: number,
): string {
  return `complete_${sessionId}_${setId}_${expectedRevision}`;
}

function workingIndex(
  sets: readonly ActiveWorkoutSet[],
  setId: string | null,
): number {
  const index = sets.findIndex(({ id }) => id === setId);
  return index < 0 ? 0 : index;
}

function exerciseStatusText(exercise: ActiveWorkoutExercise): string {
  if (exercise.status === "skipped") {
    return "Skipped";
  }
  if (exercise.origin === "added") {
    return "Added";
  }
  switch (exercise.status) {
    case "completed":
      return "Completed";
    case "active":
      return "Active";
    case "planned":
      return "Upcoming";
  }
}

function workingSetSummary(exercise: ActiveWorkoutExercise): Readonly<{
  completed: number;
  total: number;
  observation: string;
}> {
  const completed = exercise.workingSets.filter(
    ({ status }) => status === "completed",
  ).length;
  const topWorkingSet = exercise.workingSets.find(
    ({ observation }) => observation !== null,
  );
  return {
    completed,
    total: exercise.workingSets.length,
    observation: topWorkingSet === undefined
      ? "Done"
      : formatObservation(observationForSet(topWorkingSet)),
  };
}

function exerciseHeaderMetadata(
  exercise: ActiveWorkoutExercise,
  activeSetId: string | null,
): string {
  const currentSet = [...exercise.warmups, ...exercise.workingSets].find(
    ({ id }) => id === activeSetId,
  );
  const referenceSet = currentSet ?? exercise.workingSets[0];
  const target = referenceSet === undefined
    ? "No target"
    : formatObservation(observationForSet(referenceSet));
  if (currentSet?.kind === "warmup") {
    return `${target} · warm-up W${currentSet.ordinal + 1}`;
  }
  if (currentSet?.kind === "working") {
    return `${target} · set ${currentSet.ordinal + 1}/${exercise.workingSets.length}`;
  }
  const summary = workingSetSummary(exercise);
  return `${target} · ${summary.completed}/${summary.total} complete`;
}

function TargetContext({
  set,
}: Readonly<{ set: ActiveWorkoutSet }>) {
  const { colors } = useAppTheme();
  const planDefault = set.valueSources.find(
    ({ source }) => source === "plan_default",
  );
  const history = set.valueSources.find(
    ({ source }) => source === "last_workout",
  );
  const value = formatObservation(
    planDefault?.observation ?? observationForSet(set),
  );

  return (
    <ContentCard style={styles.targetSection} testID="active-workout-target-card">
      <Text
        style={[
          workoutTypeScale.label as TextStyle,
          { color: colors.contentCardTextSecondary },
        ]}
      >
        TODAY&apos;S TARGET
      </Text>
      <Text
        style={[
          workoutTypeScale.targetValue as TextStyle,
          { color: colors.contentCardText },
        ]}
      >
        {value}
      </Text>
      <Text
        style={[
          workoutTypeScale.body as TextStyle,
          { color: colors.contentCardTextSecondary },
        ]}
      >
        {history === undefined
          ? "First recorded session"
          : `Last workout · ${formatObservation(history.observation)}`}
      </Text>
    </ContentCard>
  );
}

type SectionGlyphActionProps = Readonly<{
  accessibilityLabel: string;
  busy?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  onPress: () => void;
  testID?: string;
}>;

const SectionGlyphAction = React.forwardRef<View, SectionGlyphActionProps>(function SectionGlyphAction(
  { accessibilityLabel, busy = false, disabled = false, icon: Icon, onPress, testID },
  ref,
) {
  const { colors, reduceMotion } = useAppTheme();
  const unavailable = busy || disabled;
  return (
    <FocusablePressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: unavailable }}
      disabled={unavailable}
      focusable={!unavailable}
      onPress={onPress}
      ref={ref}
      testID={testID}
      style={({ pressed }) => [
        styles.sectionGlyphAction,
        {
          backgroundColor: pressed
            ? colors.contentCardPressed
            : "transparent",
          borderColor: colors.contentCardBorder,
          opacity: unavailable ? 0.62 : 1,
        },
      ]}
    >
      <Icon
        accessibilityElementsHidden
        color={colors.contentCardText}
        importantForAccessibility="no-hide-descendants"
        size={sizes.icon}
        strokeWidth={2}
      />
    </FocusablePressable>
  );
});

export type ActiveWorkoutScreenProps = Readonly<{
  sessionId: string;
  view: ActiveWorkoutView | EmptyWorkoutView;
  commands: ActiveWorkoutCommands;
  availableExercises?: readonly Readonly<{ id: string; name: string }>[];
  availableExercisesState?: "loading" | "ready" | "error";
  onRetryAvailableExercises?: (() => void) | undefined;
  nowMs: () => number;
  notificationPermission?: RestNotificationPermission;
  restSoundEnabled?: boolean;
  countdownCue?: RestCountdownCuePort | undefined;
  onOpenNotificationSettings?: () => void;
  onGoBack: () => void;
  onFinishLater: () => void;
  onOutcomeSaved?: (sessionId: string) => void;
  onDiscarded?: () => void;
  onResolveUnknownOutcome?: (sessionId: string) => Promise<Pick<SessionDetail, "id" | "status">>;
  onRequestPlanEdit?: () => void;
  onOpenPlanSettings?: () => void;
  initialHeaderFocus?: boolean;
  onInitialHeaderFocused?: () => void;
  loadExerciseHistory?: ((exerciseId: string) => Promise<ExerciseMetricHistory>) | undefined;
  acceptanceBenchmark?: V12AcceptanceBenchmarkPort;
  width?: number;
}>;

export function ActiveWorkoutScreen({
  sessionId,
  view: initialView,
  commands,
  nowMs,
  notificationPermission = "undetermined",
  restSoundEnabled = false,
  countdownCue,
  onOpenNotificationSettings = () => undefined,
  onGoBack,
  onFinishLater,
  onOutcomeSaved = () => onFinishLater(),
  onDiscarded = onFinishLater,
  onResolveUnknownOutcome = async () => {
    throw new Error("outcome_source_reload_unavailable");
  },
  onRequestPlanEdit = () => undefined,
  onOpenPlanSettings = () => undefined,
  initialHeaderFocus = false,
  onInitialHeaderFocused,
  loadExerciseHistory,
  acceptanceBenchmark,
  availableExercises = [],
  availableExercisesState = "ready",
  onRetryAvailableExercises,
  width,
}: ActiveWorkoutScreenProps) {
  if ("state" in initialView) {
    return (
      <EmptyWorkoutOverview
        commands={commands}
        availableExercises={availableExercises}
        availableExercisesState={availableExercisesState}
        nowMs={nowMs}
        onDiscarded={onDiscarded}
        onRequestPlanEdit={onRequestPlanEdit}
        loadExerciseHistory={loadExerciseHistory}
        onFinishLater={onFinishLater}
        onGoBack={onGoBack}
        onOutcomeSaved={onOutcomeSaved}
        onResolveUnknownOutcome={onResolveUnknownOutcome}
        onRetryAvailableExercises={onRetryAvailableExercises}
        sessionId={sessionId}
        view={initialView}
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  return (
    <PopulatedWorkoutOverview
      {...(acceptanceBenchmark === undefined ? {} : { acceptanceBenchmark })}
      commands={commands}
      availableExercises={availableExercises}
      availableExercisesState={availableExercisesState}
      countdownCue={countdownCue}
      initialView={initialView}
      notificationPermission={notificationPermission}
      nowMs={nowMs}
      onDiscarded={onDiscarded}
      onRequestPlanEdit={onRequestPlanEdit}
      onOpenPlanSettings={onOpenPlanSettings}
      initialHeaderFocus={initialHeaderFocus}
      {...(onInitialHeaderFocused === undefined ? {} : { onInitialHeaderFocused })}
      loadExerciseHistory={loadExerciseHistory}
      onFinishLater={onFinishLater}
      onGoBack={onGoBack}
      onOpenNotificationSettings={onOpenNotificationSettings}
      onOutcomeSaved={onOutcomeSaved}
      onResolveUnknownOutcome={onResolveUnknownOutcome}
      onRetryAvailableExercises={onRetryAvailableExercises}
      restSoundEnabled={restSoundEnabled}
      sessionId={sessionId}
      {...(width === undefined ? {} : { width })}
    />
  );
}

type EmptyWorkoutOverviewProps = Readonly<{
  sessionId: string;
  view: EmptyWorkoutView;
  commands: ActiveWorkoutCommands;
  availableExercises?: readonly Readonly<{ id: string; name: string }>[];
  availableExercisesState: "loading" | "ready" | "error";
  nowMs: () => number;
  onGoBack: () => void;
  onFinishLater: () => void;
  onOutcomeSaved: (sessionId: string) => void;
  onDiscarded: () => void;
  onResolveUnknownOutcome: (sessionId: string) => Promise<Pick<SessionDetail, "id" | "status">>;
  onRequestPlanEdit: () => void;
  onOpenPlanSettings?: () => void;
  loadExerciseHistory?: ((exerciseId: string) => Promise<ExerciseMetricHistory>) | undefined;
  onRetryAvailableExercises?: (() => void) | undefined;
  width?: number;
}>;

function EmptyWorkoutOverview({
  sessionId,
  view,
  commands,
  availableExercises = [],
  availableExercisesState,
  nowMs,
  onGoBack,
  onFinishLater,
  onOutcomeSaved,
  onDiscarded,
  onResolveUnknownOutcome,
  onRequestPlanEdit,
  loadExerciseHistory,
  onRetryAvailableExercises,
  width,
}: EmptyWorkoutOverviewProps) {
  const { colors } = useAppTheme();
  const [outcomeConfirmation, setOutcomeConfirmation] =
    useState<"zero_sets" | "discard" | null>(null);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [outcomeFailure, setOutcomeFailure] =
    useState<"zero_sets" | "discard" | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [addFailed, setAddFailed] = useState(false);
  const searchRef = useRef<M3SearchFieldHandle>(null);
  const saveZeroSetInputRef = useRef<SaveZeroSetInput | null>(null);
  const discardWorkoutInputRef = useRef<DiscardWorkoutInput | null>(null);
  const adaptiveWidth = width === undefined ? {} : { width };
  const filteredExercises = availableExercises.filter((exercise) =>
    exercise.name.toLocaleLowerCase("en").includes(query.trim().toLocaleLowerCase("en")),
  );
  const selectedExercise = availableExercises.find(
    ({ id }) => id === selectedExerciseId,
  );
  const addExercise = async () => {
    if (selectedExercise === undefined || commands.addExercise === undefined) return;
    setOutcomeBusy(true);
    setAddFailed(false);
    try {
      const requestId = `add-exercise:${sessionId}:${view.revision}:${selectedExercise.id}`;
      const requestSha256 = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        requestId,
      );
      await commands.addExercise({
        requestId, requestSha256, sessionId,
        expectedSessionRevision: view.revision, occurredAtMs: nowMs(),
        libraryExerciseId: selectedExercise.id,
        sessionExerciseId: `${requestId}:exercise`, setId: `${requestId}:set`,
      });
      setPickerVisible(false);
      setSelectedExerciseId(null);
    } catch {
      setAddFailed(true);
    } finally {
      setOutcomeBusy(false);
    }
  };
  const confirmationCopy = outcomeConfirmation === "zero_sets"
    ? {
        body: "This workout will be saved with zero completed working sets.",
        cancelLabel: "Keep training",
        confirmLabel: "Save zero-set workout",
        heading: "Finish without working sets?",
        destructive: false,
      }
    : {
        body: "This ends the workout and marks it discarded. It cannot be resumed.",
        cancelLabel: "Keep workout",
        confirmLabel: "Discard workout",
        heading: "Discard workout?",
        destructive: true,
      };

  const saveZeroSetWorkout = async () => {
    if (outcomeBusy) return;
    const input = saveZeroSetInputRef.current ?? {
      sessionId,
      expectedSessionRevision: view.revision,
      confirmation: "save_zero_set_workout",
      endedAtMs: nowMs(),
    };
    saveZeroSetInputRef.current = input;
    setOutcomeBusy(true);
    setOutcomeFailure(null);
    try {
      const result = await commands.saveZeroSetWorkout(input);
      if (result.detail.id !== sessionId || result.detail.status !== "zero_sets") {
        const durableDetail = await onResolveUnknownOutcome(sessionId);
        if (durableDetail.id !== sessionId || durableDetail.status !== "zero_sets") {
          throw new Error("zero_set_workout_result_unknown");
        }
      }
      saveZeroSetInputRef.current = null;
      setOutcomeConfirmation(null);
      onOutcomeSaved(sessionId);
    } catch {
      setOutcomeConfirmation(null);
      setOutcomeFailure("zero_sets");
    } finally {
      setOutcomeBusy(false);
    }
  };

  const discardCurrentWorkout = async () => {
    if (outcomeBusy) return;
    const input = discardWorkoutInputRef.current ?? {
      sessionId,
      expectedSessionRevision: view.revision,
      confirmation: "discard_workout",
      endedAtMs: nowMs(),
    };
    discardWorkoutInputRef.current = input;
    setOutcomeBusy(true);
    setOutcomeFailure(null);
    try {
      const result = await commands.discardWorkout(input);
      if (result.detail.id !== sessionId || result.detail.status !== "discarded") {
        const durableDetail = await onResolveUnknownOutcome(sessionId);
        if (durableDetail.id !== sessionId || durableDetail.status !== "discarded") {
          throw new Error("discard_workout_result_unknown");
        }
      }
      discardWorkoutInputRef.current = null;
      setOutcomeConfirmation(null);
      onDiscarded();
    } catch {
      setOutcomeConfirmation(null);
      setOutcomeFailure("discard");
    } finally {
      setOutcomeBusy(false);
    }
  };

  const confirmOutcome = async () => {
    if (outcomeConfirmation === "zero_sets") {
      await saveZeroSetWorkout();
      return;
    }
    if (outcomeConfirmation === "discard") {
      await discardCurrentWorkout();
    }
  };

  const outcomeFailureCopy = outcomeFailure === "zero_sets"
    ? {
        body: "The workout is still active with zero completed working sets. Try saving it again or keep training.",
        confirmLabel: "Retry saving zero-set workout",
        heading: "Zero-set workout was not saved",
        retry: saveZeroSetWorkout,
      }
    : outcomeFailure === "discard"
      ? {
          body: "The workout is still active. No saved set or history fact was removed. Try again or keep the workout.",
          confirmLabel: "Retry discarding workout",
          heading: "Workout was not discarded",
          retry: discardCurrentWorkout,
        }
      : null;

  return (
    <>
      <AdaptiveScreen
        {...adaptiveWidth}
        constrainActiveWork
        stickyHeader={(
          <ScreenHeader
            backAction={onGoBack}
            eyebrow="WORKOUT OVERVIEW"
            title="Workout"
          />
        )}
        primary={(
          <>
            <InlineNotice
              body="No exercises are planned in this session yet. Save a zero-set visit explicitly, finish later, or discard it."
              heading="Empty workout in progress"
              tone="neutral"
            />
            <PrimaryAction
              accessibilityHint="Choose one library exercise to append to this workout."
              label="Add exercise"
              onPress={() => setPickerVisible(true)}
              testID="add-exercise"
            />
            {pickerVisible ? (
              <ContentCard>
                <SectionHeader title="Choose exercise" tone="card" />
                {selectedExercise === undefined ? null : (
                  <PrimaryAction
                    busy={outcomeBusy}
                    label={`Add ${selectedExercise.name}`}
                    onPress={() => void addExercise()}
                  />
                )}
                <M3SearchField
                  label="Search exercises"
                  onChangeText={setQuery}
                  resultCount={filteredExercises.length}
                  ref={searchRef}
                  state={filteredExercises.length === 0 ? "empty" : "results"}
                  value={query}
                />
                {availableExercisesState === "loading" ? (
                  <InlineNotice
                    body="Please wait while your exercise library loads."
                    heading="Loading exercises"
                    tone="neutral"
                  />
                ) : availableExercisesState === "error" ? (
                  <InlineNotice
                    action={<SecondaryAction label="Retry loading exercises" onPress={() => onRetryAvailableExercises?.()} />}
                    body="Your workout was not changed. Retry loading exercises before choosing one."
                    heading="Exercises could not be loaded"
                    tone="error"
                  />
                ) : filteredExercises.length === 0 ? (
                  <InlineNotice body="Try a different search." heading="No exercises found" tone="neutral" />
                ) : filteredExercises.map((exercise) => (
                  <FocusablePressable
                    accessibilityLabel={`${exercise.name}. Add exercise`}
                    accessibilityRole="button"
                    key={exercise.id}
                    onPress={() => {
                      setSelectedExerciseId(exercise.id);
                      searchRef.current?.blur();
                      Keyboard.dismiss();
                    }}
                    style={[styles.exerciseOption, { borderColor: colors.contentCardBorder }]}
                  >
                    <Text style={[workoutTypeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>
                      {exercise.name}
                    </Text>
                    <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                      {selectedExerciseId === exercise.id ? "Selected" : "Select"}
                    </Text>
                  </FocusablePressable>
                ))}
                {addFailed ? (
                  <InlineNotice
                    body="Your workout was not changed. Try again from the latest workout."
                    heading="Exercise was not added"
                    tone="error"
                  />
                ) : null}
              </ContentCard>
            ) : null}
            <PrimaryAction
              busy={outcomeBusy}
              label="Save zero-set workout"
              onPress={() => setOutcomeConfirmation("zero_sets")}
            />
            <SecondaryAction
              disabled={outcomeBusy}
              label="Finish workout later"
              onPress={onFinishLater}
            />
            <SecondaryAction
              destructive
              disabled={outcomeBusy}
              label="Discard workout"
              onPress={() => setOutcomeConfirmation("discard")}
            />
          </>
        )}
        testID="active-workout"
      />
      <ConfirmationSheet
        body={confirmationCopy.body}
        cancelLabel={confirmationCopy.cancelLabel}
        confirmLabel={confirmationCopy.confirmLabel}
        destructive={confirmationCopy.destructive}
        heading={confirmationCopy.heading}
        onCancel={() => setOutcomeConfirmation(null)}
        onConfirm={() => {
          void confirmOutcome();
        }}
        visible={outcomeConfirmation !== null}
      />
      <ConfirmationSheet
        body={outcomeFailureCopy?.body ?? ""}
        cancelLabel="Return to Workout"
        confirmBusy={outcomeBusy}
        confirmLabel={outcomeFailureCopy?.confirmLabel ?? "Retry"}
        heading={outcomeFailureCopy?.heading ?? "Workout was not saved"}
        onCancel={() => setOutcomeFailure(null)}
        onConfirm={() => { void outcomeFailureCopy?.retry(); }}
        visible={outcomeFailureCopy !== null}
      />
    </>
  );
}

type PopulatedWorkoutOverviewProps = Omit<ActiveWorkoutScreenProps, "view"> & Readonly<{
  initialView: ActiveWorkoutView;
}>;

function PopulatedWorkoutOverview({
  acceptanceBenchmark,
  sessionId,
  initialView,
  commands,
  nowMs,
  notificationPermission = "undetermined",
  restSoundEnabled = false,
  countdownCue,
  onOpenNotificationSettings = () => undefined,
  onGoBack,
  onFinishLater,
  onOutcomeSaved = () => onFinishLater(),
  onDiscarded = onFinishLater,
  onResolveUnknownOutcome = async () => {
    throw new Error("outcome_source_reload_unavailable");
  },
  onRequestPlanEdit = () => undefined,
  onOpenPlanSettings = () => undefined,
  initialHeaderFocus = false,
  onInitialHeaderFocused,
  loadExerciseHistory,
  availableExercises = [],
  availableExercisesState = "ready",
  onRetryAvailableExercises,
  width,
}: PopulatedWorkoutOverviewProps) {
  const { colors, reduceMotion } = useAppTheme();
  const semanticToast = useOptionalSemanticToast();
  const [view, setView] = useState(initialView);
  const viewRef = useRef(initialView);
  const parentActiveSetIdRef = useRef(initialView.activeSetId);
  const [warmupBusy, setWarmupBusy] = useState<WarmupCommandState>(null);
  const [workingBusySetId, setWorkingBusySetId] = useState<string | null>(null);
  const [saveFailedSetId, setSaveFailedSetId] = useState<string | null>(null);
  const [sectionFailure, setSectionFailure] =
    useState<SectionMutationFailure | null>(null);
  const [revealedSetId, setRevealedSetId] = useState<string | null>(null);
  const [revealedSetOffset, setRevealedSetOffset] = useState(0);
  const [activeSetMeasurement, setActiveSetMeasurement] = useState<
    Readonly<{ setId: string; y: number }> | null
  >(null);
  const [activeExerciseOffset, setActiveExerciseOffset] = useState<
    Readonly<{ exerciseId: string; y: number }> | null
  >(null);
  const [activeWorkingCardOffset, setActiveWorkingCardOffset] = useState<
    Readonly<{ exerciseId: string; y: number }> | null
  >(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<
    Readonly<{ key: string; setId: string; animated: boolean }> | null
  >(() => initialView.activeSetId === null
    ? null
    : {
      key: `entry-${initialView.revision}-${initialView.activeSetId}`,
      setId: initialView.activeSetId,
      animated: false,
    });
  const [editingCompletedSetId, setEditingCompletedSetId] =
    useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedCompactSetId, setExpandedCompactSetId] = useState<string | null>(
    null,
  );
  const [correctionBusySetId, setCorrectionBusySetId] =
    useState<string | null>(null);
  const [correctionFailure, setCorrectionFailure] =
    useState<Readonly<{ setId: string; retry: () => void }> | null>(null);
  const [restBusy, setRestBusy] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [outcomeConfirmation, setOutcomeConfirmation] =
    useState<OutcomeConfirmation>(null);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [outcomeFailure, setOutcomeFailure] = useState<OutcomeFailure | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<RemovalCandidate | null>(null);
  const [removalBusy, setRemovalBusy] = useState(false);
  const [removalFailure, setRemovalFailure] = useState<RemovalFailure | null>(null);
  const [removalRecovery, setRemovalRecovery] = useState<RemovalCandidate | null>(null);
  const [removalAnnouncement, setRemovalAnnouncement] = useState<string | null>(null);
  const [exerciseActionCandidate, setExerciseActionCandidate] =
    useState<ExerciseEditCandidate | null>(null);
  const [exerciseActionsVisibleForId, setExerciseActionsVisibleForId] =
    useState<string | null>(null);
  const [trendExerciseId, setTrendExerciseId] = useState<string | null>(null);
  const [trendHistory, setTrendHistory] = useState<ExerciseMetricHistory | null>(null);
  const [timingExerciseId, setTimingExerciseId] = useState<string | null>(null);
  const [timingRestDraft, setTimingRestDraft] = useState("");
  const [timingRestBusy, setTimingRestBusy] = useState(false);
  const [timingRestFailure, setTimingRestFailure] = useState<string | null>(null);
  const [exerciseEditBusy, setExerciseEditBusy] = useState(false);
  const [exerciseEditFailure, setExerciseEditFailure] =
    useState<ExerciseEditFailure | null>(null);
  const [exerciseEditRecovery, setExerciseEditRecovery] =
    useState<ExerciseEditCandidate | null>(null);
  const [exerciseReorderBusy, setExerciseReorderBusy] = useState(false);
  const [exerciseReorderFailure, setExerciseReorderFailure] =
    useState<ExerciseReorderFailure | null>(null);
  const [exerciseReorderRecovery, setExerciseReorderRecovery] = useState(false);
  const [exerciseReorderAnnouncement, setExerciseReorderAnnouncement] =
    useState<ExerciseReorderAnnouncement | null>(null);
  const [exerciseAddPickerVisible, setExerciseAddPickerVisible] = useState(false);
  const [exerciseAddQuery, setExerciseAddQuery] = useState("");
  const [exerciseAddSelectedId, setExerciseAddSelectedId] = useState<string | null>(null);
  const [exerciseAddBusy, setExerciseAddBusy] = useState(false);
  const [exerciseAddFailed, setExerciseAddFailed] = useState(false);
  const [addSetMenuExerciseId, setAddSetMenuExerciseId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [replacementPickerForId, setReplacementPickerForId] =
    useState<string | null>(null);
  const [replacementQuery, setReplacementQuery] = useState("");
  const [replacementExerciseId, setReplacementExerciseId] =
    useState<string | null>(null);
  const exerciseAddSearchRef = useRef<M3SearchFieldHandle>(null);
  const exerciseAddTriggerRef = useRef<View>(null);
  const replacementSearchRef = useRef<M3SearchFieldHandle>(null);
  const moreActionRef = useRef<View>(null);
  const moreFirstActionRef = useRef<View>(null);
  const exerciseActionRefs = useRef(new Map<string, View | null>());
  const exerciseActionFirstRef = useRef<View>(null);
  const workingAddRef = useRef<View>(null);
  const removeFocusRef = useRef<View>(null);
  const removeGlyphRefs = useRef(new Map<string, View | null>());
  const setRowRefs = useRef(new Map<string, View | null>());
  const draftQueue = useRef(Promise.resolve());
  const sectionMutationRef = useRef<SectionMutation | null>(null);
  const completionInFlightRef = useRef(false);
  const benchmarkDockPendingRef = useRef(false);
  const finishCompletedInputRef = useRef<FinishCompletedInput | null>(null);
  const finishPartialInputRef = useRef<FinishPartialInput | null>(null);
  useEffect(() => {
    if (!initialHeaderFocus || moreActionRef.current?.focus === undefined) return;
    moreActionRef.current.focus();
    onInitialHeaderFocused?.();
  }, [initialHeaderFocus, onInitialHeaderFocused]);
  const saveZeroSetInputRef = useRef<SaveZeroSetInput | null>(null);
  const discardWorkoutInputRef = useRef<DiscardWorkoutInput | null>(null);
  const correctionSetIdRef = useRef<string | null>(null);
  const restCommandInFlightRef = useRef(false);
  const overviewExercises = React.useMemo(() => exercisesFor(view), [view]);
  const presentationModel = React.useMemo(() => presentWorkoutSession(view), [view]);
  const replacementCandidates = availableExercises.filter((exercise) =>
    exercise.name.toLocaleLowerCase("en").includes(
      replacementQuery.trim().toLocaleLowerCase("en"),
    ),
  );
  const exerciseAddCandidates = availableExercises.filter((exercise) =>
    exercise.name.toLocaleLowerCase("en").includes(
      exerciseAddQuery.trim().toLocaleLowerCase("en"),
    ),
  );
  const selectedExerciseToAdd = availableExercises.find(
    ({ id }) => id === exerciseAddSelectedId,
  );
  const isMultiExerciseOverview = view.exercises.length > 0;
  const activeOwner = view.activeSetId === null
    ? undefined
    : resolveSetOwner(view, view.activeSetId);
  const activeExercise = activeOwner?.exercise ?? view.currentExercise;
  const activeSets = activeExercise.workingSets;
  const activeIndex = workingIndex(activeSets, view.activeSetId);
  const activeSet = activeOwner?.set;
  const adaptiveWidth = width === undefined ? {} : { width };
  const activeExerciseIndex = overviewExercises.findIndex(
    ({ id }) => id === view.activeExerciseId,
  );

  useEffect(() => {
    if (trendExerciseId === null || loadExerciseHistory === undefined) return;
    let active = true;
    setTrendHistory(null);
    const exercise = overviewExercises.find(({ id }) => id === trendExerciseId);
    if (exercise === undefined) return;
    void loadExerciseHistory(exercise.exerciseId).then((history) => {
      if (active) setTrendHistory(history);
    }).catch(() => {
      if (active) setTrendHistory(null);
    });
    return () => { active = false; };
  }, [loadExerciseHistory, overviewExercises, trendExerciseId]);

  const isExerciseCollapsed = (exercise: ActiveWorkoutExercise, index: number) =>
    !expandedExerciseIds.has(exercise.id)
    && (
      (exercise.status === "completed" && (
        exercise.id !== view.activeExerciseId || view.activeSetId === null
      ))
      || (activeExerciseIndex >= 0 && index < activeExerciseIndex)
    );

  const applyView = (nextView: ActiveWorkoutView) => {
    viewRef.current = nextView;
    setView(nextView);
  };

  const saveExerciseRest = async () => {
    const exercise = overviewExercises.find(({ id }) => id === timingExerciseId);
    const defaultRestSeconds = Number(timingRestDraft);
    if (
      exercise === undefined
      || commands.updateSessionExerciseDefaultRest === undefined
      || timingRestBusy
      || !Number.isSafeInteger(defaultRestSeconds)
      || defaultRestSeconds < 0
    ) {
      return;
    }
    setTimingRestBusy(true);
    setTimingRestFailure(null);
    try {
      const occurredAtMs = nowMs();
      const identity = {
        operation: "update_session_exercise_default_rest",
        sessionId,
        sessionExerciseId: exercise.id,
        defaultRestSeconds,
        expectedSessionRevision: viewRef.current.revision,
        expectedSessionExerciseRevision: exercise.revision,
        occurredAtMs,
      };
      const requestSha256 = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        stableJson(identity),
      );
      const nextView = await commands.updateSessionExerciseDefaultRest({
        ...identity,
        requestId: `exercise-rest:${requestSha256}`,
        requestSha256,
      });
      applyView(nextView);
      setTimingExerciseId(null);
      setTimingRestFailure(null);
    } catch {
      setTimingRestFailure("Between-set rest was not saved");
    } finally {
      setTimingRestBusy(false);
    }
  };

  const identityHeader = (
    <View
      testID="active-workout-identity-current"
    >
      <ScreenHeader
        action={
          <ActionCluster style={styles.headerActions}>
            <IconAction
              accessibilityLabel="More workout actions"
              icon="more"
              onPress={() => setMoreVisible(true)}
              ref={moreActionRef}
              testID="workout-more-actions"
            />
          </ActionCluster>
        }
        backAction={onGoBack}
        backActionTestID="active-workout-back"
        eyebrow={
          "WORKOUT OVERVIEW"
        }
        title="Workout"
      />
    </View>
  );

  const nextTarget = activeSet === undefined
    ? "next work"
    : formatObservation(observationForSet(activeSet));

  const applyRestResult = (result: RestCommandResult) => {
    const nextView = {
      ...viewRef.current,
      revision: result.sessionRevision,
      rest: result.state,
    };
    viewRef.current = nextView;
    setView(nextView);
  };

  const restInput = (): RestRevisionInput => ({
    sessionId,
    expectedSessionRevision: view.revision,
    expectedRestRevision: view.rest.revision,
    nowMs: nowMs(),
  });

  const runRest = async (
    command: () => Promise<RestCommandResult>,
  ) => {
    if (restCommandInFlightRef.current) {
      return;
    }
    restCommandInFlightRef.current = true;
    setRestBusy(true);
    try {
      acceptanceBenchmark?.markInputStart("rest-control");
      applyRestResult(await command());
      requestAnimationFrame(() => acceptanceBenchmark?.markInputVisible("rest-control"));
    } finally {
      restCommandInFlightRef.current = false;
      setRestBusy(false);
    }
  };

  useEffect(() => {
    const previousActiveSetId = parentActiveSetIdRef.current;
    parentActiveSetIdRef.current = initialView.activeSetId;
    viewRef.current = initialView;
    setView(initialView);
    if (previousActiveSetId !== initialView.activeSetId) {
      setPendingScrollTarget(initialView.activeSetId === null
        ? null
        : {
          key: `entry-${initialView.revision}-${initialView.activeSetId}`,
          setId: initialView.activeSetId,
          animated: false,
        });
    }
  }, [initialView]);

  useEffect(() => {
    setExpandedCompactSetId((current) =>
      current === view.activeSetId ? null : current
    );
  }, [view.activeSetId]);

  useEffect(() => {
    if (moreVisible) {
      moreFirstActionRef.current?.focus();
    }
  }, [moreVisible]);

  const completeCurrentSet = async (set = activeSet) => {
    const requestedSetId = set?.id;
    if (
      requestedSetId === undefined
      || completionInFlightRef.current
    ) {
      return;
    }
    completionInFlightRef.current = true;
    acceptanceBenchmark?.markSetActivation();
    setWorkingBusySetId(requestedSetId);
    setSaveFailedSetId(null);
    try {
      await draftQueue.current;
      const currentView = viewRef.current;
      const owner = resolveSetOwner(currentView, requestedSetId);
      const currentSet = owner?.set;
      if (
        currentSet === undefined
        || currentSet.kind !== "working"
        || currentView.activeSetId !== currentSet.id
      ) {
        return;
      }
      const completedAtMs = nowMs();
      const result = await commands.completeSet({
        sessionId,
        setId: currentSet.id,
        expectedSessionRevision: currentView.revision,
        expectedSetRevision: currentSet.revision,
        completionIdempotencyKey: idempotencyKey(
          sessionId,
          currentSet.id,
          currentSet.revision,
        ),
        metricIdentity: currentSet.metricIdentity,
        observation: observationForSet(currentSet),
        completedAtMs,
      });
      if (result.outcome === "committed") {
        acceptanceBenchmark?.markAuthoritativeSetCommit();
        benchmarkDockPendingRef.current = true;
      }
      applyView(result.view);
      if (result.outcome === "committed") {
        const completedSetId = currentSet.id;
        semanticToast?.enqueue({
          message: "Set completed",
          durationMs: 8_000,
          action: {
            label: "Undo completed set",
            onPress: () => { void undoCompletedSet(completedSetId); },
          },
        });
      }
      if (
        result.outcome === "committed"
        && result.view.activeSetId !== null
        && result.view.activeSetId !== currentView.activeSetId
      ) {
        setExpandedCompactSetId(null);
        setPendingScrollTarget({
          key: `advance-${result.view.revision}-${result.view.activeSetId}`,
          setId: result.view.activeSetId,
          animated: !reduceMotion,
        });
      }
    } catch {
      setSaveFailedSetId(requestedSetId);
    } finally {
      completionInFlightRef.current = false;
      setWorkingBusySetId(null);
    }
  };

  const undoCompletedSet = async (completedSetId: string) => {
    const result = await commands.undoCompletedSet?.({
      sessionId,
      completedSetId,
      nowMs: nowMs(),
    });
    if (result?.outcome === "undone") {
      applyView(result.view);
    }
  };

  const persistValues = (
    set: ActiveWorkoutSet,
    observation: SetObservation,
  ) => {
    const save = draftQueue.current.then(async () => {
      acceptanceBenchmark?.markInputStart("numeric-edit");
      const currentView = viewRef.current;
      const currentSet = resolveSetOwner(currentView, set.id)?.set ?? set;
      const nextView = set.kind === "warmup"
        ? observation.profile === "load_reps"
          ? await commands.updateWarmupDraft({
              sessionId,
              setId: currentSet.id,
              expectedSetRevision: currentSet.revision,
              observation,
              updatedAtMs: nowMs(),
            })
          : currentView
        : await commands.updateActiveSetDraft({
            sessionId,
            setId: currentSet.id,
            expectedSetRevision: currentSet.revision,
            metricIdentity: currentSet.metricIdentity,
            observation,
            updatedAtMs: nowMs(),
          });
      applyView(nextView);
      requestAnimationFrame(() => acceptanceBenchmark?.markInputVisible("numeric-edit"));
      setSaveFailedSetId(null);
    });
    draftQueue.current = save.catch(() => {
      setSaveFailedSetId(set.id);
    });
    return save;
  };

  const editorOwner = editingSetId === null
    ? undefined
    : resolveSetOwner(view, editingSetId);

  const saveEditorValues = async (observation: SetObservation) => {
    const owner = editingSetId === null
      ? undefined
      : resolveSetOwner(viewRef.current, editingSetId);
    if (owner === undefined) {
      throw new Error("set_no_longer_available");
    }
    if (owner.set.status === "completed") {
      await reviseCompletedSet(owner.set, observation);
    } else {
      await persistValues(owner.set, observation);
    }
    setEditingSetId(null);
  };

  const runWarmup = async (set: ActiveWorkoutSet) => {
    setWarmupBusy({ setId: set.id, action: "complete" });
    try {
      await draftQueue.current;
      const currentSet = resolveSetOwner(viewRef.current, set.id)?.set ?? set;
      const nextView = await commands.completeWarmup({
        sessionId,
        setId: currentSet.id,
        expectedSetRevision: currentSet.revision,
        completedAtMs: nowMs(),
      });
      applyView(nextView);
    } finally {
      setWarmupBusy(null);
    }
  };

  const addWarmup = async (exercise = activeExercise) => {
    if (sectionMutationRef.current !== null) {
      return;
    }
    const source = exercise.warmups.at(-1);
    const workingSource = exercise.workingSets.find(
      ({ target }) => target.profile === "load_reps",
    );
    const observation = source?.observation
      ?? (source === undefined
        ? workingSource === undefined
          ? null
          : observationForSet(workingSource)
        : observationForSet(source));
    if (observation === null || observation.profile !== "load_reps") {
      return;
    }
    sectionMutationRef.current = "add_warmup";
    setWarmupBusy({ setId: "new", action: "complete" });
    setSectionFailure(null);
    try {
      const result = await commands.addWarmup({
        sessionId,
        sessionExerciseId: exercise.id,
        setId: `warmup_${sessionId}_${nowMs()}`,
        observation: {
          ...observation,
          source: "manual",
        },
        nowMs: nowMs(),
      });
      applyView(result);
      setRevealedSetId(result.committedSetId);
      setRevealedSetOffset(0);
    } catch {
      setSectionFailure({
        operation: "add_warmup",
        sessionExerciseId: exercise.id,
        retry: () => {
          void addWarmup(exercise);
        },
      });
    } finally {
      sectionMutationRef.current = null;
      setWarmupBusy(null);
    }
  };

  const addWorking = async (exercise = activeExercise) => {
    if (sectionMutationRef.current !== null) {
      return;
    }
    const source = exercise.workingSets.at(-1);
    if (source === undefined) {
      return;
    }
    sectionMutationRef.current = "add_working";
    setWorkingBusySetId("new");
    setSectionFailure(null);
    try {
      const result = await commands.addWorkingSet({
        sessionId,
        sessionExerciseId: exercise.id,
        sourceSetId: source.id,
        setId: `working_${sessionId}_${nowMs()}`,
        nowMs: nowMs(),
      });
      applyView(result);
      setRevealedSetId(result.committedSetId);
      setRevealedSetOffset(0);
    } catch {
      setSectionFailure({
        operation: "add_working",
        sessionExerciseId: exercise.id,
        retry: () => {
          void addWorking(exercise);
        },
      });
    } finally {
      sectionMutationRef.current = null;
      setWorkingBusySetId(null);
    }
  };

  const requestRemoval = (
    kind: RemovalCandidate["kind"],
    set: ActiveWorkoutSet,
    index: number,
  ) => {
    if (set.status === "completed") {
      return;
    }
    removeFocusRef.current = removeGlyphRefs.current.get(set.id) ?? null;
    setRemovalAnnouncement(null);
    setRemovalFailure(null);
    setRemovalRecovery(null);
    const owner = resolveSetOwner(viewRef.current, set.id);
    if (owner === undefined) {
      return;
    }
    setPendingRemoval({
      kind,
      setId: set.id,
      index,
      sessionExerciseId: owner.exercise.id,
    });
  };

  const confirmRemoval = async () => {
    const candidate = pendingRemoval;
    if (candidate === null || removalBusy) {
      return;
    }
    setRemovalBusy(true);
    try {
      await draftQueue.current;
      const currentView = viewRef.current;
      const owner = resolveSetOwner(currentView, candidate.setId);
      const currentSet = owner?.set;
      const remove = candidate.kind === "warmup"
        ? commands.removeWarmup
        : commands.removeWorkingSet;
      if (currentSet === undefined || currentSet.status === "completed" || remove === undefined) {
        throw new Error("remove_set_unavailable");
      }
      const removedAtMs = nowMs();
      const {
        CryptoDigestAlgorithm,
        digestStringAsync,
      } = require("expo-crypto") as typeof import("expo-crypto");
      const operation = candidate.kind === "warmup"
        ? "remove_warmup"
        : "remove_working_set";
      const removalIdentity = {
        operation,
        sessionId,
        setId: currentSet.id,
        expectedSessionRevision: currentView.revision,
        expectedSetRevision: currentSet.revision,
        removedAtMs,
      };
      const requestId = `remove_${await digestStringAsync(
        CryptoDigestAlgorithm.SHA256,
        stableJson(removalIdentity),
      )}`;
      const request = {
        requestId,
        sessionId,
        setId: currentSet.id,
        expectedSessionRevision: currentView.revision,
        expectedSetRevision: currentSet.revision,
        removedAtMs,
      };
      const requestSha256 = await digestStringAsync(
        CryptoDigestAlgorithm.SHA256,
        stableJson(request),
      );
      const nextView = await remove({ ...request, requestSha256 });
      if (isCommittedRemovalRefreshFailure(nextView)) {
        setPendingRemoval(null);
        setRemovalFailure(null);
        setRemovalRecovery(candidate);
        return;
      }
      applyView(nextView);
      const nextExercise = exercisesFor(nextView).find(
        ({ id }) => id === candidate.sessionExerciseId,
      ) ?? nextView.currentExercise;
      const nextSets = candidate.kind === "warmup"
        ? nextExercise.warmups
        : nextExercise.workingSets;
      const nextSet = nextSets[candidate.index] ?? nextSets.at(-1);
      if (nextSet === undefined) {
        workingAddRef.current?.focus();
      } else {
        setRevealedSetId(nextSet.id);
        setRevealedSetOffset(0);
      }
      setRemovalAnnouncement(candidate.kind === "warmup"
        ? `Warm-up W${candidate.index + 1} removed`
        : `Set ${candidate.index + 1} removed`);
      setPendingRemoval(null);
      setRemovalFailure(null);
      setRemovalRecovery(null);
    } catch {
      setRemovalFailure(candidate);
      setPendingRemoval(null);
      removeFocusRef.current?.focus();
    } finally {
      setRemovalBusy(false);
    }
  };

  const closeExerciseActions = () => {
    const exerciseId = exerciseActionsVisibleForId;
    setExerciseActionsVisibleForId(null);
    if (exerciseId !== null) {
      exerciseActionRefs.current.get(exerciseId)?.focus();
    }
  };

  const beginExerciseEdit = (candidate: ExerciseEditCandidate) => {
    setExerciseActionCandidate(candidate);
    setExerciseEditFailure(null);
    setExerciseEditRecovery(null);
  };

  const openReplacementPicker = (exerciseId: string) => {
    setReplacementQuery("");
    setReplacementExerciseId(null);
    setReplacementPickerForId(exerciseId);
  };

  const closeReplacementPicker = () => {
    const exerciseId = replacementPickerForId;
    setReplacementPickerForId(null);
    if (exerciseId !== null) {
      exerciseActionRefs.current.get(exerciseId)?.focus();
    }
  };

  const submitExerciseEdit = async (
    candidate: ExerciseEditCandidate,
    retryRequest?: ReplaceExerciseInput | RemoveExerciseInput,
  ) => {
    if (exerciseEditBusy) {
      return;
    }
    const currentView = viewRef.current;
    const exercise = exercisesFor(currentView).find(
      ({ id }) => id === candidate.exerciseId,
    );
    if (exercise === undefined) {
      return;
    }
    setExerciseEditBusy(true);
    setExerciseEditFailure(null);
    setExerciseEditRecovery(null);
    let commandRequest = retryRequest;
    try {
      commandRequest = retryRequest ?? await (async (): Promise<
        ReplaceExerciseInput | RemoveExerciseInput
      > => {
        const occurredAtMs = nowMs();
        const operation = candidate.action === "replace"
          ? "replace_exercise"
          : "remove_exercise";
        const identity = {
          operation,
          sessionId,
          sessionExerciseId: exercise.id,
          expectedSessionRevision: currentView.revision,
          expectedSessionExerciseRevision: exercise.revision,
          occurredAtMs,
          ...(candidate.action === "replace"
            ? { libraryExerciseId: replacementExerciseId }
            : {}),
        };
        const requestSha256 = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          stableJson(identity),
        );
        const requestId = `${operation}:${requestSha256}`;
        if (candidate.action === "replace") {
          return {
            requestId, requestSha256, sessionId,
            expectedSessionRevision: currentView.revision,
            sessionExerciseId: exercise.id,
            expectedSessionExerciseRevision: exercise.revision,
            occurredAtMs,
            libraryExerciseId: replacementExerciseId ?? "",
            replacementSessionExerciseId: `${requestId}:exercise`,
            replacementSetId: `${requestId}:set`,
          };
        }
        return {
          requestId, requestSha256, sessionId,
          expectedSessionRevision: currentView.revision,
          sessionExerciseId: exercise.id,
          expectedSessionExerciseRevision: exercise.revision,
          occurredAtMs,
        };
      })();
      const result = candidate.action === "replace"
        ? await commands.replaceExercise?.(commandRequest as ReplaceExerciseInput)
        : await commands.removeExercise?.(commandRequest as RemoveExerciseInput);
      if (result === undefined) {
        throw new Error("exercise_edit_unavailable");
      }
      if (isCommittedExerciseEditRefreshFailure(result)) {
        setExerciseEditRecovery(candidate);
        setExerciseActionCandidate(null);
        setReplacementPickerForId(null);
        return;
      }
      applyView(result);
      setExerciseActionCandidate(null);
      setReplacementPickerForId(null);
      setReplacementExerciseId(null);
    } catch {
      setExerciseEditFailure({
        ...candidate,
        retry: () => {
          void submitExerciseEdit(candidate, commandRequest);
        },
      });
      setExerciseActionCandidate(null);
      setReplacementPickerForId(null);
      exerciseActionRefs.current.get(candidate.exerciseId)?.focus();
    } finally {
      setExerciseEditBusy(false);
    }
  };

  const submitExerciseReorder = async (
    sourcePosition: number,
    targetPosition: number,
    _method: PlanEditorReorderMethod = "fallback",
    retryRequest?: ReorderExercisesInput,
  ) => {
    if (exerciseReorderBusy || sourcePosition === targetPosition) {
      return;
    }
    const currentView = viewRef.current;
    const currentExercises = exercisesFor(currentView);
    const source = currentExercises[sourcePosition];
    if (source === undefined || targetPosition < 0
      || targetPosition >= currentExercises.length) {
      return;
    }
    const orderedExercises = [...currentExercises];
    orderedExercises.splice(sourcePosition, 1);
    orderedExercises.splice(targetPosition, 0, source);
    setExerciseReorderBusy(true);
    setExerciseReorderFailure(null);
    setExerciseReorderRecovery(false);
    let commandRequest = retryRequest;
    try {
      commandRequest = retryRequest ?? await (async (): Promise<ReorderExercisesInput> => {
        const occurredAtMs = nowMs();
        const identity = {
          operation: "reorder_exercises",
          sessionId,
          expectedSessionRevision: currentView.revision,
          occurredAtMs,
          orderedSessionExerciseIds: orderedExercises.map(({ id }) => id),
          expectedSessionExerciseRevisions: orderedExercises.map(({ id, revision }) => ({
            sessionExerciseId: id,
            revision,
          })),
        };
        const requestSha256 = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          stableJson(identity),
        );
        return {
          requestId: `reorder_exercises:${requestSha256}`,
          requestSha256,
          ...identity,
        };
      })();
      const result = await commands.reorderExercises?.(commandRequest);
      if (result === undefined) {
        throw new Error("reorder_exercises_unavailable");
      }
      if (isCommittedExerciseReorderRefreshFailure(result)) {
        setExerciseReorderRecovery(true);
        return;
      }
      applyView(result);
      setExerciseReorderAnnouncement({
        sessionExerciseId: source.id,
        text: `${source.name} moved to ${targetPosition + 1} of ${orderedExercises.length}`,
      });
    } catch {
      setExerciseReorderFailure({
        sourcePosition,
        targetPosition,
        request: commandRequest as ReorderExercisesInput,
        retry: () => {
          void submitExerciseReorder(sourcePosition, targetPosition, "fallback", commandRequest);
        },
      });
    } finally {
      setExerciseReorderBusy(false);
    }
  };

  const closeExerciseAddPicker = () => {
    setExerciseAddPickerVisible(false);
    setExerciseAddSelectedId(null);
    setExerciseAddQuery("");
  };

  const submitExerciseAdd = async () => {
    if (exerciseAddBusy || selectedExerciseToAdd === undefined) {
      return;
    }
    const currentView = viewRef.current;
    const occurredAtMs = nowMs();
    const identity = {
      operation: "add_exercise",
      sessionId,
      expectedSessionRevision: currentView.revision,
      occurredAtMs,
      libraryExerciseId: selectedExerciseToAdd.id,
    };
    setExerciseAddBusy(true);
    setExerciseAddFailed(false);
    try {
      const requestSha256 = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        stableJson(identity),
      );
      const requestId = `add_exercise:${requestSha256}`;
      const result = await commands.addExercise?.({
        requestId,
        requestSha256,
        ...identity,
        sessionExerciseId: `${requestId}:exercise`,
        setId: `${requestId}:set`,
      });
      if (result === undefined) {
        throw new Error("add_exercise_unavailable");
      }
      closeExerciseAddPicker();
    } catch {
      setExerciseAddFailed(true);
    } finally {
      setExerciseAddBusy(false);
    }
  };


  const reviseCompletedSet = async (
    set: ActiveWorkoutSet,
    observation: SetObservation,
  ) => {
    if (correctionSetIdRef.current !== null) {
      return;
    }
    const currentView = viewRef.current;
    const currentSet = resolveSetOwner(currentView, set.id)?.set;
    if (
      currentSet === undefined
      || currentSet.status !== "completed"
      || currentView.status !== "in_progress"
    ) {
      return;
    }
    correctionSetIdRef.current = currentSet.id;
    setCorrectionBusySetId(currentSet.id);
    setCorrectionFailure(null);
    try {
      const result = await commands.reviseCompletedSet({
        sessionId,
        setId: currentSet.id,
        expectedSessionRevision: currentView.revision,
        expectedSetRevision: currentSet.revision,
        correctionIdempotencyKey: `correction_${sessionId}_${currentSet.id}_${currentSet.revision}`,
        metricIdentity: currentSet.metricIdentity,
        observation,
        revisedAtMs: nowMs(),
      });
      applyView(result);
      setEditingCompletedSetId(null);
      setRevealedSetId(result.committedSetId);
      setRevealedSetOffset(0);
    } catch (error) {
      setCorrectionFailure({
        setId: currentSet.id,
        retry: () => {
          void reviseCompletedSet(currentSet, observation);
        },
      });
      throw error;
    } finally {
      correctionSetIdRef.current = null;
      setCorrectionBusySetId(null);
    }
  };

  const finishCompletedWorkout = async () => {
    if (outcomeBusy) return;
    const input = finishCompletedInputRef.current ?? {
      sessionId,
      expectedSessionRevision: viewRef.current.revision,
      endedAtMs: nowMs(),
    };
    finishCompletedInputRef.current = input;
    setOutcomeBusy(true);
    setOutcomeFailure(null);
    try {
      const result = await commands.finishCompleted(input);
      if (
        result.detail.id !== sessionId
        || result.detail.status !== "completed"
      ) {
        const durableDetail = await onResolveUnknownOutcome(sessionId);
        if (durableDetail.id !== sessionId || durableDetail.status !== "completed") {
          throw new Error("finish_workout_result_unknown");
        }
      }
      finishCompletedInputRef.current = null;
      onOutcomeSaved(sessionId);
    } catch {
      setOutcomeFailure({ operation: "finish_completed" });
    } finally {
      setOutcomeBusy(false);
    }
  };

  const finishPartialWorkout = async () => {
    if (outcomeBusy) return;
    const input = finishPartialInputRef.current ?? {
      sessionId,
      expectedSessionRevision: viewRef.current.revision,
      confirmation: "save_partial_workout",
      endedAtMs: nowMs(),
    };
    finishPartialInputRef.current = input;
    setOutcomeBusy(true);
    setOutcomeFailure(null);
    try {
      const result = await commands.finishPartial(input);
      if (result.detail.id !== sessionId || result.detail.status !== "partial") {
        const durableDetail = await onResolveUnknownOutcome(sessionId);
        if (durableDetail.id !== sessionId || durableDetail.status !== "partial") {
          throw new Error("partial_workout_result_unknown");
        }
      }
      finishPartialInputRef.current = null;
      setOutcomeConfirmation(null);
      onOutcomeSaved(sessionId);
    } catch {
      setOutcomeConfirmation(null);
      setOutcomeFailure({ operation: "partial" });
    } finally {
      setOutcomeBusy(false);
    }
  };

  const saveZeroSetWorkout = async () => {
    if (outcomeBusy) return;
    const input = saveZeroSetInputRef.current ?? {
      sessionId,
      expectedSessionRevision: viewRef.current.revision,
      confirmation: "save_zero_set_workout",
      endedAtMs: nowMs(),
    };
    saveZeroSetInputRef.current = input;
    setOutcomeBusy(true);
    setOutcomeFailure(null);
    try {
      const result = await commands.saveZeroSetWorkout(input);
      if (result.detail.id !== sessionId || result.detail.status !== "zero_sets") {
        const durableDetail = await onResolveUnknownOutcome(sessionId);
        if (durableDetail.id !== sessionId || durableDetail.status !== "zero_sets") {
          throw new Error("zero_set_workout_result_unknown");
        }
      }
      saveZeroSetInputRef.current = null;
      setOutcomeConfirmation(null);
      onOutcomeSaved(sessionId);
    } catch {
      setOutcomeConfirmation(null);
      setOutcomeFailure({ operation: "zero_sets" });
    } finally {
      setOutcomeBusy(false);
    }
  };

  const discardCurrentWorkout = async () => {
    if (outcomeBusy) return;
    const input = discardWorkoutInputRef.current ?? {
      sessionId,
      expectedSessionRevision: viewRef.current.revision,
      confirmation: "discard_workout",
      endedAtMs: nowMs(),
    };
    discardWorkoutInputRef.current = input;
    setOutcomeBusy(true);
    setOutcomeFailure(null);
    try {
      const result = await commands.discardWorkout(input);
      if (result.detail.id !== sessionId || result.detail.status !== "discarded") {
        const durableDetail = await onResolveUnknownOutcome(sessionId);
        if (durableDetail.id !== sessionId || durableDetail.status !== "discarded") {
          throw new Error("discard_workout_result_unknown");
        }
      }
      discardWorkoutInputRef.current = null;
      setOutcomeConfirmation(null);
      onDiscarded();
    } catch {
      setOutcomeConfirmation(null);
      setOutcomeFailure({ operation: "discard" });
    } finally {
      setOutcomeBusy(false);
    }
  };

  const confirmOutcome = async () => {
    const confirmation = outcomeConfirmation;
    if (confirmation === null) {
      return;
    }
    if (confirmation === "partial") {
      await finishPartialWorkout();
      return;
    }
    if (confirmation === "zero_sets") {
      await saveZeroSetWorkout();
      return;
    }
    if (confirmation === "discard") {
      await discardCurrentWorkout();
      return;
    }
    setOutcomeBusy(true);
    try {
      if (confirmation === "skip_exercise") {
        await commands.skipExercise({
          sessionId,
          sessionExerciseId: activeExercise.id,
          expectedSessionRevision: view.revision,
          expectedExerciseRevision: activeExercise.revision,
          confirmation: "skip_exercise",
          nowMs: nowMs(),
        });
        setOutcomeConfirmation(null);
        return;
      }
    } finally {
      setOutcomeBusy(false);
    }
  };

  const confirmationCopy = outcomeConfirmation === "partial"
      ? {
          heading: "Save partial workout?",
          body: `You completed ${
            view.exercises.filter(({ status }) => status === "completed").length
          } of ${view.exercises.length} exercises and ${
            view.progress.completedWorkingSets
          } working sets. You can resume later when this session remains valid.`,
          cancelLabel: "Keep training",
          confirmLabel: "Save partial workout",
          confirmTestID: "save-partial-workout-confirm",
          destructive: false,
        }
      : {
          heading: "Discard workout?",
          body: "This ends the workout and marks it discarded. It cannot be resumed.",
          cancelLabel: "Keep workout",
          confirmLabel: "Discard workout",
          confirmTestID: "discard-workout-confirm",
          destructive: true,
        };

  const outcomeFailureCopy = outcomeFailure?.operation === "finish_completed"
    ? {
        body: "Your workout is still active. Your completed sets and rest are unchanged. Try finishing again.",
        confirmLabel: "Retry finishing workout",
        heading: "Workout was not finished",
        retry: finishCompletedWorkout,
      }
    : outcomeFailure?.operation === "partial"
      ? {
          body: "Your workout is still active. Your completed sets and current rest are unchanged. Try saving the partial workout again.",
          confirmLabel: "Retry saving partial workout",
          heading: "Partial workout was not saved",
          retry: finishPartialWorkout,
        }
      : outcomeFailure?.operation === "zero_sets"
        ? {
            body: "The workout is still active with zero completed working sets. Try saving it again or keep training.",
            confirmLabel: "Retry saving zero-set workout",
            heading: "Zero-set workout was not saved",
            retry: saveZeroSetWorkout,
          }
        : outcomeFailure?.operation === "discard"
          ? {
              body: "The workout is still active. No saved set or history fact was removed. Try again or keep the workout.",
              confirmLabel: "Retry discarding workout",
              heading: "Workout was not discarded",
              retry: discardCurrentWorkout,
            }
          : null;

  function closeMoreActions() {
    setMoreVisible(false);
    moreActionRef.current?.focus();
  }

  return (
    <>
      <AdaptiveScreen
        {...adaptiveWidth}
        constrainActiveWork
        scrollOffset={revealedSetOffset}
        {...(revealedSetId === null ? {} : { scrollRestoreKey: revealedSetId })}
        {...(
          pendingScrollTarget === null
          || activeSet === undefined
          || pendingScrollTarget.setId !== activeSet.id
          || activeSetMeasurement?.setId !== activeSet.id
          || activeExerciseOffset?.exerciseId !== activeExercise.id
          || activeWorkingCardOffset?.exerciseId !== activeExercise.id
            ? {}
            : {
              measuredScrollRequest: {
                animated: pendingScrollTarget.animated,
                targetKey: pendingScrollTarget.key,
                y: activeExerciseOffset.y
                  + activeWorkingCardOffset.y
                  + activeSetMeasurement.y,
              },
            }
        )}
        stickyHeader={identityHeader}
        dock={(
          view.rest.state === "running" || view.rest.state === "paused"
        ) ? (
          <View
            onLayout={() => {
              if (!benchmarkDockPendingRef.current) return;
              benchmarkDockPendingRef.current = false;
              acceptanceBenchmark?.markVisibleDock();
            }}
          >
            <RestDock
              busy={restBusy}
              exerciseName={activeExercise.name}
              nextSetIndex={activeIndex + 1}
              nextTarget={nextTarget}
              notificationPermission={notificationPermission}
              restSoundEnabled={restSoundEnabled}
              countdownCue={countdownCue}
              nowMs={nowMs}
              onAdjust={(deltaMs) => {
                void runRest(() => commands.adjustRest({
                  ...restInput(),
                  deltaMs,
                }));
              }}
              onExpired={() => {
                void runRest(() => commands.expireRest(restInput()));
              }}
              onOpenSettings={onOpenNotificationSettings}
              onPause={() => {
                void runRest(() => commands.pauseRest(restInput()));
              }}
              onResume={() => {
                void runRest(() => commands.resumeRest(restInput()));
              }}
              onSkip={() => {
                void runRest(() => commands.skipRest(restInput()));
              }}
              state={view.rest}
            />
          </View>
        ) : activeSet === undefined ? (
          <PrimaryAction
            busy={outcomeBusy}
            label="Finish workout"
            onPress={() => {
              void finishCompletedWorkout();
            }}
          />
        ) : (
          <WorkoutActionDock
            addExerciseRef={exerciseAddTriggerRef}
            completeLabel={saveFailedSetId === activeSet.id
              ? "Set not saved · Retry"
              : `Complete Set ${activeIndex + 1}`}
            onAddExercise={() => {
              setExerciseAddFailed(false);
              setExerciseAddPickerVisible(true);
            }}
            onComplete={() => { void completeCurrentSet(activeSet); }}
            state={workingBusySetId === activeSet.id
              ? "saving"
              : saveFailedSetId === activeSet.id ? "failed" : "ready"}
          />
        )}
        primary={
          <>
            {activeSet === undefined ? null : <TargetContext set={activeSet} />}
            <WorkoutSessionPresentation
              exerciseAccessibilityLabel={(presentationExercise, expanded, index) => {
                const exercise = overviewExercises.find(({ id }) => id === presentationExercise.id);
                if (exercise === undefined) return presentationExercise.name;
                const metadata = exerciseHeaderMetadata(
                  exercise,
                  exercise.id === activeExercise.id ? view.activeSetId : null,
                );
                return `${exercise.name}. ${metadata}. ${expanded ? "Collapse" : "Expand"} exercise`;
              }}
              exerciseSupportingText={(presentationExercise, expanded, index) => {
                const exercise = overviewExercises.find(({ id }) => id === presentationExercise.id);
                if (exercise === undefined) return "";
                return exerciseHeaderMetadata(
                  exercise,
                  exercise.id === activeExercise.id ? view.activeSetId : null,
                );
              }}
              renderExerciseAccessory={(presentationExercise) => {
                const exercise = overviewExercises.find(({ id }) => id === presentationExercise.id);
                if (exercise === undefined) return null;
                return <>
                  <FocusablePressable
                    accessibilityLabel={`View ${exercise.name} trend`}
                    accessibilityRole="button"
                    focusable
                    nativeID="workout-exercise-trend"
                    onPress={() => setTrendExerciseId(exercise.id)}
                    style={({ pressed }) => [styles.exerciseHeaderAction, {
                      backgroundColor: pressed ? colors.contentCardPressed : "transparent",
                      borderColor: colors.contentCardBorder,
                    }]}
                    testID={exercise.id === activeExercise.id
                      ? "workout-active-exercise-trend"
                      : `exercise-trend-${exercise.exerciseId}`}
                  >
                    <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[workoutTypeScale.bodyStrong as TextStyle, { color: colors.focusRing }]}>↗</Text>
                  </FocusablePressable>
                  <FocusablePressable
                    accessibilityLabel={`Open ${exercise.name} menu`}
                    accessibilityRole="button"
                    accessibilityState={{
                      busy: exerciseEditBusy,
                      disabled: exerciseEditBusy,
                      expanded: exerciseActionsVisibleForId === exercise.id,
                    }}
                    disabled={exerciseEditBusy}
                    focusable={!exerciseEditBusy}
                    nativeID="workout-exercise-menu"
                    onPress={() => {
                      setExerciseActionsVisibleForId(exercise.id);
                      setExerciseEditFailure(null);
                      setExerciseEditRecovery(null);
                    }}
                    ref={(node) => {
                      exerciseActionRefs.current.set(exercise.id, node);
                    }}
                    style={({ pressed }) => [
                      styles.exerciseHeaderAction,
                      {
                        backgroundColor: pressed ? colors.contentCardPressed : "transparent",
                        borderColor: exerciseActionsVisibleForId === exercise.id
                          ? colors.action
                          : colors.contentCardBorder,
                        opacity: exerciseEditBusy ? 0.62 : 1,
                      },
                    ]}
                    testID={exercise.id === activeExercise.id
                      ? "workout-active-exercise-menu"
                      : `exercise-actions-${exercise.exerciseId}`}
                  >
                    <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[workoutTypeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>•••</Text>
                  </FocusablePressable>
                </>;
              }}
              isExerciseExpanded={(presentationExercise, index) => {
                const exercise = overviewExercises.find(({ id }) => id === presentationExercise.id);
                return exercise === undefined ? false : !isExerciseCollapsed(exercise, index);
              }}
              model={presentationModel}
              onExerciseToggle={(presentationExercise, expanded) => {
                setExpandedExerciseIds((current) => {
                  const next = new Set(current);
                  if (expanded) next.delete(presentationExercise.id); else next.add(presentationExercise.id);
                  return next;
                });
              }}
            >
              {(presentationExercise, expanded, index) => {
              const exercise = overviewExercises.find(({ id }) => id === presentationExercise.id);
              if (exercise === undefined) return null;
              const collapsed = !expanded;
              return (
              <View
                key={exercise.id}
                testID={`overview-exercise-${exercise.id}`}
                onLayout={(event: LayoutChangeEvent) => {
                  if (exercise.id === activeExercise.id) {
                    const y = event.nativeEvent.layout.y;
                    setActiveExerciseOffset((current) =>
                      current?.exerciseId === exercise.id && current.y === y
                        ? current
                        : { exerciseId: exercise.id, y }
                    );
                  }
                }}
                style={styles.exerciseSection}
              >
                {reorderMode ? <>
                  <PlanEditorReorderableRow
                    count={overviewExercises.length}
                    dragActivationDistance={8}
                    disabled={exerciseReorderBusy}
                    label={exercise.name}
                    onMoveDown={() => {
                      void submitExerciseReorder(index, index + 1);
                    }}
                    onMoveTo={(targetPosition, method) => {
                      void submitExerciseReorder(index, targetPosition, method);
                    }}
                    onMoveUp={() => {
                      void submitExerciseReorder(index, index - 1);
                    }}
                    position={index}
                    reorderId={`exercise-${exercise.id}`}
                    tone="card"
                  >
                    <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                      Reorder exercise
                    </Text>
                    <Text
                      style={[workoutTypeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}
                      testID={`exercise-reorder-position-${exercise.id}`}
                    >
                      {`${exercise.name} · Position ${index + 1} of ${overviewExercises.length}`}
                    </Text>
                  </PlanEditorReorderableRow>
                  <View style={styles.reorderFallbackActions}>
                    <SecondaryAction
                      disabled={exerciseReorderBusy || index === 0}
                      label={`Move ${exercise.name} up`}
                      onPress={() => {
                        void submitExerciseReorder(index, index - 1);
                      }}
                    />
                    <SecondaryAction
                      disabled={exerciseReorderBusy || index === overviewExercises.length - 1}
                      label={`Move ${exercise.name} down`}
                      onPress={() => {
                        void submitExerciseReorder(index, index + 1);
                      }}
                      testID="workout-reorder-exercise-down"
                    />
                  </View>
                  {exerciseReorderAnnouncement?.sessionExerciseId === exercise.id
                    ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        style={[
                          workoutTypeScale.secondary as TextStyle,
                          styles.reorderAnnouncement,
                          { color: colors.contentCardTextSecondary },
                        ]}
                        testID={`exercise-reorder-announcement-${exercise.id}`}
                      >
                        {exerciseReorderAnnouncement.text}
                      </Text>
                    )
                    : null}
                </> : null}
                {exerciseEditFailure?.exerciseId !== exercise.id ? null : (
                  <InlineNotice
                    action={
                      <SecondaryAction
                        label={exerciseEditFailure.action === "replace"
                          ? "Retry replacing exercise"
                          : "Retry removing exercise"}
                        onPress={exerciseEditFailure.retry}
                      />
                    }
                    body="Your workout was not changed. Try again from the latest workout."
                    heading={exerciseEditFailure.action === "replace"
                      ? "Exercise could not be replaced"
                      : "Exercise could not be removed"}
                    tone="error"
                  />
                )}
                {exerciseEditRecovery?.exerciseId !== exercise.id ? null : (
                  <InlineNotice
                    action={<SecondaryAction label="Return to Today" onPress={onGoBack} />}
                    body="The exercise change was saved, but the latest workout could not be loaded. Return to Today and reopen this workout."
                    heading="Exercise changed. Reload workout"
                    tone="attention"
                  />
                )}
                {exerciseReorderFailure?.sourcePosition !== index ? null : (
                  <InlineNotice
                    action={<SecondaryAction label="Retry reordering exercise" onPress={exerciseReorderFailure.retry} />}
                    body="Your workout order was not changed. Try again from the latest workout."
                    heading="Exercise could not be reordered"
                    tone="error"
                  />
                )}
                {collapsed ? null : <>
                <ContentCard
                  style={styles.section}
                  testID={isMultiExerciseOverview
                    ? `active-workout-${exercise.id}-warmups-card`
                    : "active-workout-warmups-card"}
                >
              <SectionHeader
                supportingText="Optional warm-up sets"
                title="Warm-ups"
                tone="card"
              />
              {sectionFailure === null
                || sectionFailure.operation !== "add_warmup" ? null : (
                  <InlineNotice
                    action={
                      <SecondaryAction
                        label="Retry add warm-up"
                        onPress={sectionFailure.retry}
                      />
                    }
                    body="Your warm-up values are still available. Try the same action again."
                    card
                    heading="Warm-up was not added"
                    tone="error"
                  />
                )}
              {removalFailure?.kind !== "warmup" ? null : (
                <InlineNotice
                  body="Warm-up could not be removed. Your workout was not changed. Try again."
                  card
                  heading="Warm-up could not be removed"
                  tone="error"
                />
              )}
              {removalRecovery?.kind !== "warmup" ? null : (
                <InlineNotice
                  action={<SecondaryAction label="Return to Today" onPress={onGoBack} />}
                  body="The warm-up was removed, but the latest workout could not be loaded. Return to Today and reopen this workout."
                  card
                  heading="Warm-up removed. Reload workout"
                  tone="attention"
                />
              )}
              {exercise.warmups.map((set, index) => (
                <React.Fragment key={set.id}>
                <SetRow
                  active={false}
                  compact={isMultiExerciseOverview
                    && set.id !== activeSet?.id
                    && set.id !== expandedCompactSetId}
                  busy={warmupBusy?.setId === set.id}
                  index={index + 1}
                  key={`${set.id}-${set.id === activeSet?.id || set.id === expandedCompactSetId ? "expanded" : "compact"}`}
                  kind="warmup"
                  onPress={() => setEditingSetId(set.id)}
                  {...(isMultiExerciseOverview
                    ? { overviewTestID: `overview-${exercise.id}-${set.id}` }
                    : {})}
                  ref={(node) => { setRowRefs.current.set(set.id, node); }}
                  set={set}
                  tone="card"
                />
                </React.Fragment>
              ))}
                </ContentCard>
            <View
              testID={`overview-working-card-${exercise.id}`}
              onLayout={(event: LayoutChangeEvent) => {
                if (exercise.id === activeExercise.id) {
                  const y = event.nativeEvent.layout.y;
                  setActiveWorkingCardOffset((current) =>
                    current?.exerciseId === exercise.id && current.y === y
                      ? current
                      : { exerciseId: exercise.id, y }
                  );
                }
              }}
            >
            <ContentCard
              style={styles.section}
              testID={isMultiExerciseOverview
                ? `active-workout-${exercise.id}-working-sets-card`
                : "active-workout-working-sets-card"}
            >
              <SectionHeader
                action={(
                  <View
                    style={styles.inlineActions}
                    testID={isMultiExerciseOverview
                      ? `active-workout-${exercise.id}-working-actions`
                      : "active-workout-working-actions"}
                  >
                    <SectionGlyphAction
                      busy={sectionMutationRef.current !== null}
                      disabled={
                        sectionMutationRef.current !== null
                        || warmupBusy !== null
                        || workingBusySetId !== null
                      }
                      accessibilityLabel="Add set"
                      icon={Plus}
                      onPress={() => {
                        setAddSetMenuExerciseId(exercise.id);
                      }}
                      ref={workingAddRef}
                      testID={exercise.id === activeExercise.id
                        ? "workout-active-add-set"
                        : `workout-add-set-${exercise.id}`}
                    />
                  </View>
                )}
                supportingText={`${view.progress.completedWorkingSets} of ${view.progress.totalWorkingSets} working sets`}
                title="Working sets"
                tone="card"
              />
              {sectionFailure?.operation !== "add_working"
                || sectionFailure.sessionExerciseId !== exercise.id ? null : (
                <InlineNotice
                  action={
                    <SecondaryAction
                      label="Retry add working set"
                      onPress={sectionFailure.retry}
                    />
                  }
                  body="Your working-set values are still available. Try the same action again."
                  card
                  heading="Working set was not added"
                  tone="error"
                />
              )}
              {exercise.workingSets.map((set, index) => (
                <React.Fragment key={set.id}>
                <SetRow
                  active={view.activeSetId === set.id}
                  compact={isMultiExerciseOverview
                    && set.id !== activeSet?.id
                    && set.id !== expandedCompactSetId}
                  busy={workingBusySetId === set.id}
                  index={index + 1}
                  key={`${set.id}-${set.id === activeSet?.id || set.id === expandedCompactSetId ? "expanded" : "compact"}`}
                  kind="working"
                  disabled={view.rest.state === "running" || view.rest.state === "paused"}
                  onPress={() => setEditingSetId(set.id)}
                  ref={(node) => { setRowRefs.current.set(set.id, node); }}
                  set={set}
                  tone="card"
                  {...(isMultiExerciseOverview
                    ? { overviewTestID: view.activeSetId === set.id
                      ? "workout-active-set-row"
                      : `overview-${exercise.id}-${set.id}` }
                    : view.activeSetId === set.id
                      ? { overviewTestID: "workout-active-set-row" }
                      : {})}
                />
                </React.Fragment>
              ))}
              {saveFailedSetId === null ? null : (
                <InlineNotice
                  body="Your values are still here. The set was not completed and rest did not start."
                  heading="Set not saved"
                  card
                  tone="error"
                />
              )}
              {removalFailure?.kind !== "working" ? null : (
                <InlineNotice
                  body="Set could not be removed. Your workout was not changed. Try again."
                  card
                  heading="Set could not be removed"
                  tone="error"
                />
              )}
              {removalRecovery?.kind !== "working" ? null : (
                <InlineNotice
                  action={<SecondaryAction label="Return to Today" onPress={onGoBack} />}
                  body="The set was removed, but the latest workout could not be loaded. Return to Today and reopen this workout."
                  card
                  heading="Set removed. Reload workout"
                  tone="attention"
                />
              )}
              {correctionFailure === null ? null : (
                <InlineNotice
                  action={
                    <SecondaryAction
                      label="Retry completed set correction"
                      onPress={correctionFailure.retry}
                    />
                  }
                  body="The completed set is unchanged until its correction is saved."
                  card
                  heading="Correction was not saved"
                  tone="error"
                />
              )}
            </ContentCard>
            </View>
              </>}
              </View>
            );
            }}</WorkoutSessionPresentation>
          </>
        }
        testID="active-workout"
      />
      <BottomSheet
        cancelLabel="Return to Workout"
        contentStyle={styles.moreSheetContent}
        heading="More workout actions"
        onCancel={() => setMoreVisible(false)}
        restoreFocusRef={moreActionRef}
        scrollTestID="workout-actions-sheet-content"
        testID="workout-actions-sheet"
        visible={moreVisible}
      >
            {view.activeSetId === null ? (
              <PrimaryAction
                busy={outcomeBusy}
                label="Finish workout"
                ref={moreFirstActionRef}
                onPress={() => {
                  closeMoreActions();
                  void finishCompletedWorkout();
                }}
              />
            ) : null}
            <SecondaryAction
              label={reorderMode ? "Done reordering" : "Reorder exercises"}
              onPress={() => {
                closeMoreActions();
                setReorderMode((current) => !current);
              }}
            />
            <SecondaryAction
              disabled={outcomeBusy}
              label="Finish as partial"
              ref={view.activeSetId === null ? undefined : moreFirstActionRef}
              onPress={() => {
                closeMoreActions();
                setOutcomeConfirmation("partial");
              }}
            />
            {view.planId === null || view.planId === undefined ? null : (
              <SecondaryAction
                disabled={outcomeBusy}
                label="Plan settings"
                onPress={() => {
                  closeMoreActions();
                  onOpenPlanSettings();
                }}
              />
            )}
            {view.planId === null || view.planId === undefined ? null : (
              <SecondaryAction
                disabled={outcomeBusy}
                label="Edit plan after workout · Schedule"
                onPress={() => {
                  closeMoreActions();
                  onRequestPlanEdit();
                }}
              />
            )}
            <SecondaryAction
              destructive
              disabled={outcomeBusy}
              label="Discard workout"
              onPress={() => {
                closeMoreActions();
                setOutcomeConfirmation("discard");
              }}
            />
      </BottomSheet>
      <ExerciseTrendSheet
        exerciseName={overviewExercises.find(({ id }) => id === trendExerciseId)?.name ?? "Exercise"}
        history={trendHistory}
        onClose={() => setTrendExerciseId(null)}
        visible={trendExerciseId !== null}
      />
      {timingExerciseId === null ? null : (() => {
        const exercise = overviewExercises.find(({ id }) => id === timingExerciseId);
        if (exercise === undefined) return null;
        return (
          <BottomSheet
            cancelLabel="Return to Workout"
            heading={`Timing · ${exercise.name}`}
            cancelDisabled={timingRestBusy}
            onCancel={() => setTimingExerciseId(null)}
            restoreFocusRef={{ current: exerciseActionRefs.current.get(exercise.id) ?? null }}
            visible
          >
            <Text style={[workoutTypeScale.body as TextStyle, { color: colors.textSecondary }]}>
              {`Between-set rest · ${exercise.defaultRestSeconds} sec`}
            </Text>
            <TextInput
              accessibilityLabel={`Between-set rest seconds for ${exercise.name}`}
              keyboardType="number-pad"
              onChangeText={setTimingRestDraft}
              style={[styles.timingRestInput, { borderColor: colors.divider, color: colors.textPrimary }]}
              value={timingRestDraft}
            />
            {timingRestFailure === null ? null : (
              <Text accessibilityRole="alert" style={[workoutTypeScale.body as TextStyle, { color: colors.destructive }]}>
                {timingRestFailure}
              </Text>
            )}
            <PrimaryAction
              busy={timingRestBusy}
              disabled={timingRestBusy || commands.updateSessionExerciseDefaultRest === undefined}
              label="Save between-set rest"
              onPress={() => { void saveExerciseRest(); }}
            />
          </BottomSheet>
        );
      })()}
      <BottomSheet
        cancelLabel="Return to Workout"
        contentStyle={styles.moreSheetContent}
        heading="Exercise actions"
        onCancel={closeExerciseActions}
        scrollTestID="exercise-actions-sheet-content"
        testID="exercise-actions-sheet"
        visible={exerciseActionsVisibleForId !== null}
      >
            {exerciseActionsVisibleForId === null ? null : (
              <SecondaryAction
                label="Timing"
                onPress={() => {
                  setTimingExerciseId(exerciseActionsVisibleForId);
                  const exercise = overviewExercises.find(({ id }) => id === exerciseActionsVisibleForId);
                  setTimingRestDraft(String(exercise?.defaultRestSeconds ?? 0));
                  setTimingRestFailure(null);
                  closeExerciseActions();
                }}
              />
            )}
            {exerciseActionsVisibleForId === null ? null : (
              <SecondaryAction
                label="Replace exercise"
                ref={exerciseActionFirstRef}
                onPress={() => {
                  const exerciseId = exerciseActionsVisibleForId;
                  closeExerciseActions();
                  if (exerciseId !== null) {
                    openReplacementPicker(exerciseId);
                  }
                }}
              />
            )}
            {exerciseActionsVisibleForId === null ? null : (
              <SecondaryAction
                destructive
                label="Delete exercise"
                onPress={() => {
                  const exerciseId = exerciseActionsVisibleForId;
                  closeExerciseActions();
                  if (exerciseId !== null) {
                    beginExerciseEdit({ action: "remove", exerciseId });
                  }
                }}
              />
            )}
      </BottomSheet>
      <BottomSheet
        cancelLabel="Return to Workout"
        contentStyle={styles.moreSheetContent}
        heading="Choose exercise"
        onCancel={closeExerciseAddPicker}
        restoreFocusRef={exerciseAddTriggerRef}
        scrollTestID="active-workout-add-exercise-picker-content"
        testID="add-exercise-sheet"
        visible={exerciseAddPickerVisible}
      >
        {selectedExerciseToAdd === undefined ? null : (
          <PrimaryAction
            busy={exerciseAddBusy}
            label={`Add ${selectedExerciseToAdd.name}`}
            onPress={() => {
              void submitExerciseAdd();
            }}
            testID="workout-add-exercise-confirm"
          />
        )}
        <M3SearchField
          label="Search exercises"
          onChangeText={setExerciseAddQuery}
          resultCount={exerciseAddCandidates.length}
          ref={exerciseAddSearchRef}
          state={exerciseAddCandidates.length === 0 ? "empty" : "results"}
          value={exerciseAddQuery}
        />
        {availableExercisesState === "loading" ? (
          <InlineNotice
            body="Please wait while your exercise library loads."
            heading="Loading exercises"
            tone="neutral"
          />
        ) : availableExercisesState === "error" ? (
          <InlineNotice
            action={<SecondaryAction label="Retry loading exercises" onPress={() => onRetryAvailableExercises?.()} />}
            body="Your workout was not changed. Retry loading exercises before choosing one."
            heading="Exercises could not be loaded"
            tone="error"
          />
        ) : exerciseAddCandidates.length === 0 ? (
          <InlineNotice body="Try a different search." heading="No exercises found" tone="neutral" />
        ) : exerciseAddCandidates.map((candidate, index) => (
          <FocusablePressable
            accessibilityLabel={`${candidate.name}. Add exercise`}
            accessibilityRole="button"
            key={candidate.id}
            onPress={() => {
              setExerciseAddSelectedId(candidate.id);
              exerciseAddSearchRef.current?.blur();
              Keyboard.dismiss();
            }}
            testID={index === 0 ? "workout-add-exercise-first-option" : `add-exercise-option-${candidate.id}`}
            style={[
              styles.exerciseOption,
              {
                backgroundColor: exerciseAddSelectedId === candidate.id
                  ? colors.contentCardSelected
                  : colors.surface,
                borderColor: exerciseAddSelectedId === candidate.id
                  ? colors.action
                  : colors.divider,
              },
            ]}
          >
            <Text style={[workoutTypeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
              {candidate.name}
            </Text>
            {exerciseAddSelectedId === candidate.id ? (
              <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
                Selected
              </Text>
            ) : null}
          </FocusablePressable>
        ))}
        {exerciseAddFailed ? (
          <InlineNotice
            action={<SecondaryAction label="Retry adding exercise" onPress={() => { void submitExerciseAdd(); }} />}
            body="Your workout was not changed. Try again from the latest workout."
            heading="Exercise was not added"
            tone="error"
          />
        ) : null}
      </BottomSheet>
      <BottomSheet
        cancelLabel="Return to Workout"
        contentStyle={styles.moreSheetContent}
        heading="Choose exercise"
        onCancel={closeReplacementPicker}
        scrollTestID="replace-exercise-picker-content"
        visible={replacementPickerForId !== null}
      >
            {replacementPickerForId === null || replacementExerciseId === null ? null : (
              <PrimaryAction
                busy={exerciseEditBusy}
                label={`Replace with ${availableExercises.find(
                  ({ id }) => id === replacementExerciseId,
                )?.name ?? "exercise"}`}
                onPress={() => {
                  void submitExerciseEdit({
                    action: "replace",
                    exerciseId: replacementPickerForId,
                  });
                }}
                testID="workout-replace-exercise-confirm"
              />
            )}
            <M3SearchField
              label="Search exercises"
              onChangeText={setReplacementQuery}
              resultCount={replacementCandidates.length}
              ref={replacementSearchRef}
              state={replacementCandidates.length === 0 ? "empty" : "results"}
              value={replacementQuery}
            />
            {replacementCandidates.length !== 0 ? null : (
              <InlineNotice
                body="Try a different search or clear a filter."
                heading="No exercises found"
                tone="neutral"
              />
            )}
            {replacementCandidates.map((candidate, index) => (
              <FocusablePressable
                accessibilityLabel={candidate.name}
                accessibilityRole="radio"
                accessibilityState={{ checked: replacementExerciseId === candidate.id }}
                key={candidate.id}
                onPress={() => {
                  setReplacementExerciseId(candidate.id);
                  replacementSearchRef.current?.blur();
                  Keyboard.dismiss();
                }}
                testID={index === 0 ? "workout-replace-exercise-first-option" : `replace-exercise-option-${candidate.id}`}
                style={[
                  styles.exerciseOption,
                  {
                    backgroundColor: replacementExerciseId === candidate.id
                      ? colors.contentCardSelected
                      : colors.surface,
                    borderColor: replacementExerciseId === candidate.id
                      ? colors.action
                      : colors.divider,
                  },
                ]}
              >
                <Text style={[workoutTypeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
                  {candidate.name}
                </Text>
                {replacementExerciseId === candidate.id ? (
                  <Text style={[workoutTypeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
                    Selected
                  </Text>
                ) : null}
              </FocusablePressable>
            ))}
      </BottomSheet>
      <ConfirmationSheet
        body={confirmationCopy.body}
        cancelLabel={confirmationCopy.cancelLabel}
        confirmLabel={confirmationCopy.confirmLabel}
        confirmTestID={confirmationCopy.confirmTestID}
        destructive={confirmationCopy.destructive}
        heading={confirmationCopy.heading}
        onCancel={() => setOutcomeConfirmation(null)}
        onConfirm={() => {
          void confirmOutcome();
        }}
        restoreFocusRef={moreActionRef}
        visible={outcomeConfirmation !== null}
      />
      <ConfirmationSheet
        body={outcomeFailureCopy?.body ?? ""}
        cancelLabel="Return to Workout"
        confirmBusy={outcomeBusy}
        confirmLabel={outcomeFailureCopy?.confirmLabel ?? "Retry"}
        heading={outcomeFailureCopy?.heading ?? "Workout was not saved"}
        onCancel={() => setOutcomeFailure(null)}
        onConfirm={() => {
          void outcomeFailureCopy?.retry();
        }}
        restoreFocusRef={moreActionRef}
        visible={outcomeFailureCopy !== null}
      />
      {exerciseActionCandidate?.action !== "remove" ? null : (
        <ConfirmationSheet
          body={(() => {
            const exercise = exercisesFor(view).find(
              ({ id }) => id === exerciseActionCandidate.exerciseId,
            );
            const hasCompletedHistory = exercise?.workingSets.some(
              ({ status }) => status === "completed",
            ) ?? false;
            return hasCompletedHistory
              ? "This exercise has completed sets. They will be retained and this exercise will be marked Skipped, not deleted."
              : `Delete ${exercise?.name ?? "this exercise"} from this workout?`;
          })()}
          cancelLabel="Keep exercise"
          confirmBusy={exerciseEditBusy}
          confirmLabel={`Confirm delete ${exercisesFor(view).find(
            ({ id }) => id === exerciseActionCandidate.exerciseId,
          )?.name ?? "exercise"}`}
          confirmTestID="delete-exercise-confirm"
          destructive
          heading={`Delete ${exercisesFor(view).find(
            ({ id }) => id === exerciseActionCandidate.exerciseId,
          )?.name ?? "exercise"}?`}
          onCancel={() => {
            const exerciseId = exerciseActionCandidate.exerciseId;
            setExerciseActionCandidate(null);
            exerciseActionRefs.current.get(exerciseId)?.focus();
          }}
          onConfirm={() => {
            void submitExerciseEdit(exerciseActionCandidate);
          }}
          restoreFocusRef={{
            current: exerciseActionRefs.current.get(
              exerciseActionCandidate.exerciseId,
            ) ?? null,
          }}
          visible
        />
      )}
      {pendingRemoval === null ? null : <ConfirmationSheet
        body={pendingRemoval.kind === "warmup"
          ? "This warm-up will be removed from this workout. This cannot be undone."
          : "This set will be removed from this workout. This cannot be undone."}
        cancelLabel={pendingRemoval.kind === "warmup" ? "Keep warm-up" : "Keep set"}
        confirmBusy={removalBusy}
        confirmLabel={pendingRemoval.kind === "warmup" ? "Remove warm-up" : "Remove set"}
        confirmTestID={pendingRemoval.kind === "warmup"
          ? "remove-warmup-confirm"
          : "remove-working-set-confirm"}
        destructive
        heading={pendingRemoval.kind === "warmup"
          ? `Remove warm-up W${pendingRemoval.index + 1}?`
          : `Remove set ${pendingRemoval.index + 1}?`}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          void confirmRemoval();
        }}
        restoreFocusRef={removeFocusRef}
        visible
      />}
      {addSetMenuExerciseId === null ? null : (() => {
        const exercise = exercisesFor(view).find(
          ({ id }) => id === addSetMenuExerciseId,
        );
        if (exercise === undefined) return null;
        const warmupAvailable = exercise.metricProfile === "load_reps";
        const workingAvailable = exercise.workingSets.length > 0;
        return (
          <BottomSheet
            cancelLabel="Return to Workout"
            heading={`Add set · ${exercise.name}`}
            onCancel={() => setAddSetMenuExerciseId(null)}
            restoreFocusRef={workingAddRef}
            testID="add-set-sheet"
            visible
          >
            <PrimaryAction
              disabled={!warmupAvailable || sectionMutationRef.current !== null}
              label="Add warm-up set"
              onPress={() => {
                setAddSetMenuExerciseId(null);
                void addWarmup(exercise);
              }}
            />
            <SecondaryAction
              disabled={!workingAvailable || sectionMutationRef.current !== null}
              label="Add working set"
              onPress={() => {
                setAddSetMenuExerciseId(null);
                void addWorking(exercise);
              }}
            />
          </BottomSheet>
        );
      })()}
      {removalAnnouncement === null ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.visuallyHidden}>
          {removalAnnouncement}
        </Text>
      )}
      {editorOwner === undefined ? null : (
        <WorkoutSetEditorSheet
          exerciseName={editorOwner.exercise.name}
          onCancel={() => setEditingSetId(null)}
          onSave={saveEditorValues}
          restoreFocusRef={{ current: setRowRefs.current.get(editorOwner.set.id) ?? null }}
          set={editorOwner.set}
          visible
        />
      )}
      {exerciseReorderRecovery ? (
        <InlineNotice
          action={<SecondaryAction label="Return to Today" onPress={onGoBack} />}
          body="The exercise order was saved, but the latest workout could not be loaded. Return to Today and reopen this workout."
          heading="Exercise reordered. Reload workout"
          tone="attention"
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  exerciseOption: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    minHeight: sizes.minimumTarget,
    padding: space[2],
  },
  exerciseHeaderAction: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
  },
  exerciseDivider: {
    height: sizes.focusRing,
    width: "100%",
  },
  targetSection: {
    gap: space[1],
  },
  section: {
    gap: space[2],
  },
  exerciseSection: {
    gap: space[2],
  },
  exerciseToggle: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    paddingHorizontal: space[2],
    paddingRight: sizes.minimumTarget + space[2],
    paddingVertical: space[2],
  },
  exerciseToggleCopy: {
    flex: 1,
    gap: space[1],
    paddingRight: space[2],
  },
  inlineActions: {
    alignSelf: "flex-end",
    flexDirection: "row",
    gap: space[2],
    justifyContent: "flex-end",
  },
  reorderFallbackActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  reorderAnnouncement: {
    paddingHorizontal: space[2],
  },
  sectionGlyphAction: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
  },
  headerActions: {
    gap: space[1],
  },
  moreSheetContent: {
    gap: space[4],
    padding: space[6],
  },
  timingRestInput: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 18,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[2],
  },
  visuallyHidden: {
    height: 1,
    opacity: 0,
    position: "absolute",
    width: 1,
  },
});
