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
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
} from "react-native";

import type {
  AdvancedTimingCommandResult,
  AdvancedTimingConfigV1,
  AdvancedTimingRevisionInput,
  AdvancedTimingStateV1,
  UpdateSessionExerciseAdvancedTimingInput,
  UpdateSessionSetAdvancedTimingInput,
} from "../../domains/advancedTiming";
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
  SetObservation,
  SkipExerciseInput,
  UpdateActiveSetDraftInput,
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
import {
  AdvancedTimingIndicator,
  type AdvancedTimingIndicatorContext,
} from "../components/AdvancedTimingIndicator";
import {
  AdvancedTimingConfigSheet,
  advancedTimingConfigSummary,
  type AdvancedTimingConfigScope,
} from "../components/AdvancedTimingConfigSheet";
import {
  RestDock,
} from "../components/RestDock";
import type {
  RestCountdownCuePort,
} from "../../domains/rest/restCountdownCuePort";
import {
  formatObservation,
  observationForSet,
  SetRow,
} from "../components/SetRow";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

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
  reviseCompletedSet(
    input: ReviseCompletedSetInput,
  ): Promise<CommittedSetMutationResult>;
  startManualRest(input: RestRevisionInput): Promise<RestCommandResult>;
  pauseRest(input: RestRevisionInput): Promise<RestCommandResult>;
  resumeRest(input: RestRevisionInput): Promise<RestCommandResult>;
  adjustRest(input: AdjustRestInput): Promise<RestCommandResult>;
  skipRest(input: RestRevisionInput): Promise<RestCommandResult>;
  expireRest(input: RestRevisionInput): Promise<RestCommandResult>;
  configureAdvancedTiming?(
    input: AdvancedTimingRevisionInput & Readonly<{
      config: AdvancedTimingConfigV1;
    }>,
  ): Promise<AdvancedTimingCommandResult>;
  updateSessionExerciseAdvancedTiming?(
    input: UpdateSessionExerciseAdvancedTimingInput,
  ): Promise<AdvancedTimingCommandResult>;
  updateSessionSetAdvancedTiming?(
    input: UpdateSessionSetAdvancedTimingInput,
  ): Promise<AdvancedTimingCommandResult>;
  startAdvancedTiming?(
    input: AdvancedTimingRevisionInput & Readonly<{
      config: AdvancedTimingConfigV1;
      countdownCue?: RestCountdownCuePort | undefined;
    }>,
  ): Promise<AdvancedTimingCommandResult>;
  beginAdvancedTimingClusterGap?(
    input: AdvancedTimingRevisionInput & Readonly<{
      countdownCue?: RestCountdownCuePort | undefined;
    }>,
  ): Promise<AdvancedTimingCommandResult>;
  skipAdvancedTimingClusterGap?(
    input: AdvancedTimingRevisionInput & Readonly<{
      countdownCue?: RestCountdownCuePort | undefined;
    }>,
  ): Promise<AdvancedTimingCommandResult>;
  pauseAdvancedTiming?(input: AdvancedTimingRevisionInput): Promise<AdvancedTimingCommandResult>;
  resumeAdvancedTiming?(input: AdvancedTimingRevisionInput): Promise<AdvancedTimingCommandResult>;
  reconcileAdvancedTiming?(input: AdvancedTimingRevisionInput & Readonly<{
    countdownCue?: RestCountdownCuePort | undefined;
    foregroundSinceMs: number;
  }>): Promise<AdvancedTimingCommandResult>;
  stopAdvancedTiming?(input: AdvancedTimingRevisionInput): Promise<AdvancedTimingCommandResult>;
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

type SectionMutation = "add_warmup" | "add_working";

type SectionMutationFailure = Readonly<{
  operation: SectionMutation;
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
          typeScale.label as TextStyle,
          { color: colors.contentCardTextSecondary },
        ]}
      >
        TODAY&apos;S TARGET
      </Text>
      <Text
        style={[
          typeScale.targetValue as TextStyle,
          { color: colors.contentCardText },
        ]}
      >
        {value}
      </Text>
      <Text
        style={[
          typeScale.body as TextStyle,
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
}>;

const SectionGlyphAction = React.forwardRef<View, SectionGlyphActionProps>(function SectionGlyphAction(
  { accessibilityLabel, busy = false, disabled = false, icon: Icon, onPress },
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
  nowMs: () => number;
  notificationPermission?: RestNotificationPermission;
  restSoundEnabled?: boolean;
  countdownCue?: RestCountdownCuePort | undefined;
  advancedTimingContext?: AdvancedTimingIndicatorContext | null | undefined;
  cueUnavailable?: boolean;
  onAdvancedTimingChanged?: (context: AdvancedTimingIndicatorContext) => void;
  onOpenNotificationSettings?: () => void;
  onGoBack: () => void;
  onFinishLater: () => void;
  onOutcomeSaved?: (sessionId: string) => void;
  onDiscarded?: () => void;
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
  advancedTimingContext = null,
  cueUnavailable = false,
  onAdvancedTimingChanged = () => undefined,
  onOpenNotificationSettings = () => undefined,
  onGoBack,
  onFinishLater,
  onOutcomeSaved = () => onFinishLater(),
  onDiscarded = onFinishLater,
  availableExercises = [],
  width,
}: ActiveWorkoutScreenProps) {
  if ("state" in initialView) {
    return (
      <EmptyWorkoutOverview
        commands={commands}
        availableExercises={availableExercises}
        nowMs={nowMs}
        onDiscarded={onDiscarded}
        onFinishLater={onFinishLater}
        onGoBack={onGoBack}
        onOutcomeSaved={onOutcomeSaved}
        sessionId={sessionId}
        view={initialView}
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  return (
    <PopulatedWorkoutOverview
      commands={commands}
      availableExercises={availableExercises}
      countdownCue={countdownCue}
      advancedTimingContext={advancedTimingContext}
      cueUnavailable={cueUnavailable}
      onAdvancedTimingChanged={onAdvancedTimingChanged}
      initialView={initialView}
      notificationPermission={notificationPermission}
      nowMs={nowMs}
      onDiscarded={onDiscarded}
      onFinishLater={onFinishLater}
      onGoBack={onGoBack}
      onOpenNotificationSettings={onOpenNotificationSettings}
      onOutcomeSaved={onOutcomeSaved}
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
  nowMs: () => number;
  onGoBack: () => void;
  onFinishLater: () => void;
  onOutcomeSaved: (sessionId: string) => void;
  onDiscarded: () => void;
  width?: number;
}>;

function EmptyWorkoutOverview({
  sessionId,
  view,
  commands,
  availableExercises = [],
  nowMs,
  onGoBack,
  onFinishLater,
  onOutcomeSaved,
  onDiscarded,
  width,
}: EmptyWorkoutOverviewProps) {
  const { colors } = useAppTheme();
  const [outcomeConfirmation, setOutcomeConfirmation] =
    useState<"zero_sets" | "discard" | null>(null);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [addFailed, setAddFailed] = useState(false);
  const searchRef = useRef<M3SearchFieldHandle>(null);
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

  const confirmOutcome = async () => {
    const confirmation = outcomeConfirmation;
    if (confirmation === null) {
      return;
    }
    setOutcomeBusy(true);
    try {
      if (confirmation === "zero_sets") {
        await commands.saveZeroSetWorkout({
          sessionId,
          expectedSessionRevision: view.revision,
          confirmation: "save_zero_set_workout",
          endedAtMs: nowMs(),
        });
        onOutcomeSaved(sessionId);
        return;
      }
      await commands.discardWorkout({
        sessionId,
        expectedSessionRevision: view.revision,
        confirmation: "discard_workout",
        endedAtMs: nowMs(),
      });
      onDiscarded();
    } finally {
      setOutcomeBusy(false);
    }
  };

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
                {filteredExercises.map((exercise) => (
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
                    <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>
                      {exercise.name}
                    </Text>
                    <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
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
    </>
  );
}

type PopulatedWorkoutOverviewProps = Omit<ActiveWorkoutScreenProps, "view"> & Readonly<{
  initialView: ActiveWorkoutView;
}>;

function PopulatedWorkoutOverview({
  sessionId,
  initialView,
  commands,
  nowMs,
  notificationPermission = "undetermined",
  restSoundEnabled = false,
  countdownCue,
  advancedTimingContext,
  cueUnavailable = false,
  onAdvancedTimingChanged,
  onOpenNotificationSettings = () => undefined,
  onGoBack,
  onFinishLater,
  onOutcomeSaved = () => onFinishLater(),
  onDiscarded = onFinishLater,
  availableExercises = [],
  width,
}: PopulatedWorkoutOverviewProps) {
  const { colors, reduceMotion } = useAppTheme();
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
  const [timingPanelMeasurement, setTimingPanelMeasurement] = useState<
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
  const [pendingTimingPanelScroll, setPendingTimingPanelScroll] = useState<
    Readonly<{ key: string; exerciseId: string; animated: boolean }> | null
  >(null);
  const [editingCompletedSetId, setEditingCompletedSetId] =
    useState<string | null>(null);
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
  const [pendingRemoval, setPendingRemoval] = useState<RemovalCandidate | null>(null);
  const [removalBusy, setRemovalBusy] = useState(false);
  const [removalFailure, setRemovalFailure] = useState<RemovalFailure | null>(null);
  const [removalRecovery, setRemovalRecovery] = useState<RemovalCandidate | null>(null);
  const [removalAnnouncement, setRemovalAnnouncement] = useState<string | null>(null);
  const [exerciseActionCandidate, setExerciseActionCandidate] =
    useState<ExerciseEditCandidate | null>(null);
  const [exerciseActionsVisibleForId, setExerciseActionsVisibleForId] =
    useState<string | null>(null);
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
  const [reorderMode, setReorderMode] = useState(false);
  const [timingConfig, setTimingConfig] = useState<Readonly<{
    scope: AdvancedTimingConfigScope;
    exercise: ActiveWorkoutExercise;
    set?: ActiveWorkoutSet;
  }> | null>(null);
  const [timingConfigBusy, setTimingConfigBusy] = useState(false);
  const [timingConfigFailed, setTimingConfigFailed] = useState(false);
  const [latestAdvancedTimingContext, setLatestAdvancedTimingContext] = useState(
    advancedTimingContext ?? null,
  );
  const [replacementPickerForId, setReplacementPickerForId] =
    useState<string | null>(null);
  const [replacementQuery, setReplacementQuery] = useState("");
  const [replacementExerciseId, setReplacementExerciseId] =
    useState<string | null>(null);
  const exerciseAddSearchRef = useRef<M3SearchFieldHandle>(null);
  const replacementSearchRef = useRef<M3SearchFieldHandle>(null);
  const moreActionRef = useRef<View>(null);
  const moreFirstActionRef = useRef<View>(null);
  const exerciseActionRefs = useRef(new Map<string, View | null>());
  const exerciseActionFirstRef = useRef<View>(null);
  const warmupAddRef = useRef<View>(null);
  const workingAddRef = useRef<View>(null);
  const removeFocusRef = useRef<View>(null);
  const removeGlyphRefs = useRef(new Map<string, View | null>());
  const draftQueue = useRef(Promise.resolve());
  const sectionMutationRef = useRef<SectionMutation | null>(null);
  const correctionSetIdRef = useRef<string | null>(null);
  const restCommandInFlightRef = useRef(false);
  const timingContext = latestAdvancedTimingContext ?? advancedTimingContext ?? null;
  const overviewExercises = React.useMemo(() => exercisesFor(view), [view]);
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

  const isExerciseCollapsed = (exercise: ActiveWorkoutExercise, index: number) =>
    exercise.id !== view.activeExerciseId
    && !expandedExerciseIds.has(exercise.id)
    && (exercise.status === "completed"
      || (activeExerciseIndex >= 0 && index < activeExerciseIndex));

  const applyView = (nextView: ActiveWorkoutView) => {
    viewRef.current = nextView;
    setView(nextView);
  };

  const identityHeader = (
    <View
      testID="active-workout-identity-current"
    >
      <ScreenHeader
        action={
          <ActionCluster style={styles.headerActions}>
            <IconAction
              accessibilityLabel={`Configure ${activeExercise.name} timing`}
              disabled={
                timingConfigBusy
                || commands.updateSessionExerciseAdvancedTiming === undefined
                || activeExercise.status === "completed"
                || activeExercise.status === "skipped"
              }
              icon="settings"
              onPress={() => {
                setTimingConfigFailed(false);
                setTimingConfig({ scope: "exercise", exercise: activeExercise });
              }}
            />
            <IconAction
              accessibilityLabel="More workout actions"
              icon="more"
              onPress={() => setMoreVisible(true)}
              ref={moreActionRef}
            />
          </ActionCluster>
        }
        backAction={onGoBack}
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

  const applyAdvancedTimingResult = (result: AdvancedTimingCommandResult) => {
    setPendingScrollTarget(null);
    const nextContext = {
      sessionId,
      sessionRevision: result.sessionRevision,
      state: result.state,
    };
    setLatestAdvancedTimingContext(nextContext);
    onAdvancedTimingChanged?.(nextContext);
    const nextView = {
      ...viewRef.current,
      revision: result.sessionRevision,
    };
    viewRef.current = nextView;
    setView(nextView);
  };

  const scheduleTimingPanelScroll = (
    exerciseId: string,
    sessionRevision: number,
  ) => {
    setPendingScrollTarget(null);
    setPendingTimingPanelScroll({
      animated: !reduceMotion,
      exerciseId,
      key: `timing-${sessionRevision}-${exerciseId}`,
    });
  };

  const applyExerciseTimingConfig = (
    exerciseId: string,
    config: AdvancedTimingConfigV1,
    sessionRevision: number,
  ) => {
    const current = viewRef.current;
    const nextExercises = exercisesFor(current).map((exercise) => {
      if (exercise.id !== exerciseId) return exercise;
      const appliesInheritedConfig = (set: ActiveWorkoutSet) =>
        (set.status === "planned" || set.status === "draft")
        && (set.advancedTimingOverride === null
          || set.advancedTimingOverride === undefined);
      const applyInheritedConfig = (set: ActiveWorkoutSet): ActiveWorkoutSet => {
        if (!appliesInheritedConfig(set)) return set;
        return {
          ...set,
          revision: set.revision + 1,
          advancedTimingResolved: config,
        };
      };
      return {
        ...exercise,
        revision: exercise.revision + 1,
        advancedTimingDefault: config,
        warmups: exercise.warmups.map(applyInheritedConfig),
        workingSets: exercise.workingSets.map(applyInheritedConfig),
      };
    });
    const currentExercise = nextExercises.find(
      ({ id }) => id === current.currentExercise.id,
    ) ?? current.currentExercise;
    const nextView = {
      ...current,
      revision: sessionRevision,
      currentExercise,
      exercises: current.exercises.length === 0 ? [] : nextExercises,
    };
    viewRef.current = nextView;
    setView(nextView);
  };

  const applySetTimingConfig = (
    exerciseId: string,
    setId: string,
    override: AdvancedTimingConfigV1 | null,
    sessionRevision: number,
  ) => {
    const current = viewRef.current;
    const nextExercises = exercisesFor(current).map((exercise) => {
      if (exercise.id !== exerciseId) return exercise;
      const resolvedConfig = override ?? exercise.advancedTimingDefault;
      const applyConfig = (set: ActiveWorkoutSet): ActiveWorkoutSet => {
        if (set.id !== setId) return set;
        const { advancedTimingResolved: _previousResolvedConfig, ...setWithoutResolved } = set;
        return {
          ...setWithoutResolved,
          revision: set.revision + 1,
          advancedTimingOverride: override,
          ...(resolvedConfig === undefined
            ? {}
            : { advancedTimingResolved: resolvedConfig }),
        };
      };
      return {
        ...exercise,
        warmups: exercise.warmups.map(applyConfig),
        workingSets: exercise.workingSets.map(applyConfig),
      };
    });
    const currentExercise = nextExercises.find(
      ({ id }) => id === current.currentExercise.id,
    ) ?? current.currentExercise;
    const nextView = {
      ...current,
      revision: sessionRevision,
      currentExercise,
      exercises: current.exercises.length === 0 ? [] : nextExercises,
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

  const advancedInput = (): AdvancedTimingRevisionInput | null => {
    const context = timingContext;
    const target = activeSet;
    if (context === null || target === undefined) {
      return null;
    }
    return {
      sessionId,
      sessionSetId: target.id,
      expectedSessionRevision: view.revision,
      expectedAdvancedTimingRevision: context.state.revision,
      nowMs: nowMs(),
    };
  };

  const configureAndStartAdvancedTiming = async (
    config: Extract<AdvancedTimingConfigV1, { mode: "per_rep" }>,
  ): Promise<AdvancedTimingCommandResult> => {
    const input = advancedInput();
    if (
      input === null
      || commands.configureAdvancedTiming === undefined
      || commands.startAdvancedTiming === undefined
    ) {
      throw new Error("advanced_timing_unavailable");
    }
    const configured = await commands.configureAdvancedTiming({
      ...input,
      config,
    });
    applyAdvancedTimingResult(configured);
    const started = await commands.startAdvancedTiming({
      ...input,
      expectedSessionRevision: configured.sessionRevision,
      expectedAdvancedTimingRevision: configured.state.revision,
      nowMs: nowMs(),
      config,
      countdownCue,
    });
    applyAdvancedTimingResult(started);
    return started;
  };

  const configureAndStartClusterTiming = async (
    config: Extract<AdvancedTimingConfigV1, { mode: "cluster" }>,
  ): Promise<AdvancedTimingCommandResult> => {
    const input = advancedInput();
    if (
      input === null
      || commands.configureAdvancedTiming === undefined
      || commands.startAdvancedTiming === undefined
    ) {
      throw new Error("advanced_timing_unavailable");
    }
    const configured = await commands.configureAdvancedTiming({
      ...input,
      config,
    });
    applyAdvancedTimingResult(configured);
    const started = await commands.startAdvancedTiming({
      ...input,
      expectedSessionRevision: configured.sessionRevision,
      expectedAdvancedTimingRevision: configured.state.revision,
      nowMs: nowMs(),
      config,
      countdownCue,
    });
    applyAdvancedTimingResult(started);
    return started;
  };

  const runAdvancedTiming = async (
    command: (
      input: AdvancedTimingRevisionInput,
    ) => Promise<AdvancedTimingCommandResult>,
  ): Promise<AdvancedTimingCommandResult> => {
    const input = advancedInput();
    if (input === null) {
      throw new Error("advanced_timing_unavailable");
    }
    const result = await command(input);
    applyAdvancedTimingResult(result);
    return result;
  };

  const saveAdvancedTimingConfig = async (
    value: AdvancedTimingConfigV1 | null,
  ) => {
    const target = timingConfig;
    if (target === null || timingConfigBusy) {
      return;
    }
    setTimingConfigBusy(true);
    setTimingConfigFailed(false);
    try {
      if (target.scope === "exercise") {
        if (
          commands.updateSessionExerciseAdvancedTiming === undefined
          || value === null
        ) {
          throw new Error("advanced_timing_config_unavailable");
        }
        const result = await commands.updateSessionExerciseAdvancedTiming({
          sessionId,
          sessionExerciseId: target.exercise.id,
          expectedSessionRevision: viewRef.current.revision,
          expectedSessionExerciseRevision: target.exercise.revision,
          config: value,
          nowMs: nowMs(),
        });
        applyAdvancedTimingResult(result);
        applyExerciseTimingConfig(
          target.exercise.id,
          value,
          result.sessionRevision,
        );
        scheduleTimingPanelScroll(target.exercise.id, result.sessionRevision);
      } else {
        const set = target.set;
        if (set === undefined
          || commands.updateSessionSetAdvancedTiming === undefined) {
          throw new Error("advanced_timing_config_unavailable");
        }
        const result = await commands.updateSessionSetAdvancedTiming({
          sessionId,
          sessionSetId: set.id,
          expectedSessionRevision: viewRef.current.revision,
          expectedSetRevision: set.revision,
          override: value,
          nowMs: nowMs(),
        });
        applyAdvancedTimingResult(result);
        applySetTimingConfig(
          target.exercise.id,
          set.id,
          value,
          result.sessionRevision,
        );
        scheduleTimingPanelScroll(target.exercise.id, result.sessionRevision);
      }
      setTimingConfig(null);
    } catch {
      setTimingConfigFailed(true);
    } finally {
      setTimingConfigBusy(false);
    }
  };

  const renderSetTimingControl = (
    exercise: ActiveWorkoutExercise,
    set: ActiveWorkoutSet,
  ) => {
    const label = set.kind === "warmup"
      ? `Warm-up W${set.ordinal + 1}`
      : `Working set ${set.ordinal + 1}`;
    const testKey = `${set.kind}-${set.ordinal}`;
    const editable = set.status === "planned" || set.status === "draft";
    const summary = editable
      ? advancedTimingConfigSummary(set.advancedTimingOverride ?? null, "set")
      : advancedTimingConfigSummary(
          set.advancedTimingResolved
            ?? set.advancedTimingOverride
            ?? exercise.advancedTimingDefault,
          "exercise",
        );
    return (
      <View style={styles.setTimingRow} testID={`set-timing-${testKey}`}>
        <Text
          style={[
            typeScale.secondary as TextStyle,
            { color: colors.contentCardTextSecondary },
          ]}
          testID={`set-timing-summary-${testKey}`}
        >
          {`${label} timing · ${summary}`}
        </Text>
        {editable ? (
          <SecondaryAction
            disabled={
              timingConfigBusy
              || commands.updateSessionSetAdvancedTiming === undefined
            }
            label={`${label} timing`}
            onPress={() => {
              setTimingConfigFailed(false);
              setTimingConfig({ scope: "set", exercise, set });
            }}
            testID={`set-timing-action-${testKey}`}
          />
        ) : (
          <Text
            style={[
              typeScale.secondary as TextStyle,
              { color: colors.contentCardTextSecondary },
            ]}
            testID={`set-timing-readonly-${testKey}`}
          >
            {`${set.status === "completed" ? "Completed" : "Skipped"} sets are read-only. Timing cannot change.`}
          </Text>
        )}
      </View>
    );
  };

  const runRest = async (
    command: () => Promise<RestCommandResult>,
  ) => {
    if (restCommandInFlightRef.current) {
      return;
    }
    restCommandInFlightRef.current = true;
    setRestBusy(true);
    try {
      applyRestResult(await command());
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
    if (advancedTimingContext === null || advancedTimingContext === undefined) {
      return;
    }
    setLatestAdvancedTimingContext((current) =>
      current === null || advancedTimingContext.sessionRevision >= current.sessionRevision
        ? advancedTimingContext
        : current
    );
  }, [advancedTimingContext]);

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
      || workingBusySetId !== null
    ) {
      return;
    }
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
      applyView(result.view);
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
      setWorkingBusySetId(null);
    }
  };

  const persistValues = (
    set: ActiveWorkoutSet,
    observation: SetObservation,
  ) => {
    const save = draftQueue.current.then(async () => {
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
      setSaveFailedSetId(null);
    });
    draftQueue.current = save.catch(() => {
      setSaveFailedSetId(set.id);
    });
    return save;
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
        retry: () => {
          void addWarmup();
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
        retry: () => {
          void addWorking();
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
        (candidate.kind === "warmup" ? warmupAddRef : workingAddRef)
          .current?.focus();
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

  const submitExerciseEdit = async (candidate: ExerciseEditCandidate) => {
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
    try {
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
      const result = candidate.action === "replace"
        ? await commands.replaceExercise?.({
            requestId,
            requestSha256,
            sessionId,
            expectedSessionRevision: currentView.revision,
            sessionExerciseId: exercise.id,
            expectedSessionExerciseRevision: exercise.revision,
            occurredAtMs,
            libraryExerciseId: replacementExerciseId ?? "",
            replacementSessionExerciseId: `${requestId}:exercise`,
            replacementSetId: `${requestId}:set`,
          })
        : await commands.removeExercise?.({
            requestId,
            requestSha256,
            sessionId,
            expectedSessionRevision: currentView.revision,
            sessionExerciseId: exercise.id,
            expectedSessionExerciseRevision: exercise.revision,
            occurredAtMs,
          });
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
          void submitExerciseEdit(candidate);
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
    try {
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
      const result = await commands.reorderExercises?.({
        requestId: `reorder_exercises:${requestSha256}`,
        requestSha256,
        ...identity,
      });
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
        retry: () => {
          void submitExerciseReorder(sourcePosition, targetPosition);
        },
      });
    } finally {
      setExerciseReorderBusy(false);
    }
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
      setExerciseAddPickerVisible(false);
      setExerciseAddSelectedId(null);
      setExerciseAddQuery("");
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
    } catch {
      setCorrectionFailure({
        setId: currentSet.id,
        retry: () => {
          void reviseCompletedSet(currentSet, observation);
        },
      });
    } finally {
      correctionSetIdRef.current = null;
      setCorrectionBusySetId(null);
    }
  };

  const finishCompletedWorkout = async () => {
    setOutcomeBusy(true);
    try {
      await commands.finishCompleted({
        sessionId,
        expectedSessionRevision: view.revision,
        endedAtMs: nowMs(),
      });
      onOutcomeSaved(sessionId);
    } finally {
      setOutcomeBusy(false);
    }
  };

  const confirmOutcome = async () => {
    const confirmation = outcomeConfirmation;
    if (confirmation === null) {
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
      if (confirmation === "partial") {
        await commands.finishPartial({
          sessionId,
          expectedSessionRevision: view.revision,
          confirmation: "save_partial_workout",
          endedAtMs: nowMs(),
        });
        onOutcomeSaved(sessionId);
        return;
      }
      if (confirmation === "zero_sets") {
        await commands.saveZeroSetWorkout({
          sessionId,
          expectedSessionRevision: view.revision,
          confirmation: "save_zero_set_workout",
          endedAtMs: nowMs(),
        });
        onOutcomeSaved(sessionId);
        return;
      }
      await commands.discardWorkout({
        sessionId,
        expectedSessionRevision: view.revision,
        confirmation: "discard_workout",
        endedAtMs: nowMs(),
      });
      onDiscarded();
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
          pendingTimingPanelScroll !== null
          && timingPanelMeasurement?.exerciseId === pendingTimingPanelScroll.exerciseId
          && activeExerciseOffset?.exerciseId === pendingTimingPanelScroll.exerciseId
          && activeWorkingCardOffset?.exerciseId === pendingTimingPanelScroll.exerciseId
            ? {
              measuredScrollRequest: {
                animated: pendingTimingPanelScroll.animated,
                targetKey: pendingTimingPanelScroll.key,
                y: activeExerciseOffset.y
                  + activeWorkingCardOffset.y
                  + timingPanelMeasurement.y,
              },
            }
            : pendingScrollTarget === null
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
          <RestDock
            busy={restBusy}
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
        ) : activeSet === undefined ? (
          <PrimaryAction
            busy={outcomeBusy}
            label="Finish workout"
            onPress={() => {
              void finishCompletedWorkout();
            }}
          />
        ) : undefined}
        primary={
          <>
            {activeSet === undefined ? null : <TargetContext set={activeSet} />}
            {overviewExercises.map((exercise, index) => {
              const collapsed = isExerciseCollapsed(exercise, index);
              const summary = workingSetSummary(exercise);
              const status = exerciseStatusText(exercise);
              const skippedSummary = exercise.status === "skipped" && summary.completed > 0
                ? `${status} · Completed · ${summary.observation}`
                : `${status} · ${summary.observation}`;
              const statusDescription = exercise.status === "skipped" && summary.completed > 0
                ? `${status}. Completed · ${summary.observation}`
                : status;
              const collapseLabel = `${exercise.name}. ${statusDescription}. ${summary.completed} of ${summary.total} working sets. ${collapsed ? "Expand" : "Collapse"} exercise`;
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
                {index === 0 ? null : (
                  <View
                    style={[styles.exerciseDivider, { backgroundColor: colors.divider }]}
                    testID={`exercise-divider-${exercise.id}`}
                  />
                )}
                <FocusablePressable
                  accessibilityLabel={collapseLabel}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !collapsed }}
                  onPress={() => {
                    setExpandedExerciseIds((current) => {
                      const next = new Set(current);
                      if (collapsed) {
                        next.add(exercise.id);
                      } else {
                        next.delete(exercise.id);
                      }
                      return next;
                    });
                  }}
                  style={({ pressed }) => [
                    styles.exerciseToggle,
                    {
                      backgroundColor: pressed
                        ? colors.contentCardPressed
                        : "transparent",
                      borderColor: colors.contentCardBorder,
                    },
                  ]}
                >
                  <View style={styles.exerciseToggleCopy}>
                    <Text
                      accessibilityRole="header"
                      style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}
                    >
                      {exercise.name}
                    </Text>
                    <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                      {exercise.status === "skipped" && summary.completed > 0
                        ? skippedSummary
                        : collapsed
                          ? skippedSummary
                          : `${status} · ${summary.completed} of ${summary.total} working sets`}
                    </Text>
                  </View>
                  {collapsed && exercise.status === "completed" ? (
                    <CircleCheck
                      accessibilityElementsHidden
                      color={colors.contentCardStatusCompleted}
                      importantForAccessibility="no-hide-descendants"
                      size={sizes.icon}
                      strokeWidth={2.5}
                    />
                  ) : collapsed ? (
                    <ChevronRight
                      accessibilityElementsHidden
                      color={colors.contentCardTextSecondary}
                      importantForAccessibility="no-hide-descendants"
                      size={sizes.icon}
                    />
                  ) : (
                    <ChevronDown
                      accessibilityElementsHidden
                      color={colors.contentCardTextSecondary}
                      importantForAccessibility="no-hide-descendants"
                      size={sizes.icon}
                    />
                  )}
                </FocusablePressable>
                {reorderMode ? <>
                  <PlanEditorReorderableRow
                    count={overviewExercises.length}
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
                    <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                      Reorder exercise
                    </Text>
                    <Text
                      style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}
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
                    />
                  </View>
                  {exerciseReorderAnnouncement?.sessionExerciseId === exercise.id
                    ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        style={[
                          typeScale.secondary as TextStyle,
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
                <FocusablePressable
                  accessibilityLabel={`${exercise.name} exercise actions`}
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: exerciseEditBusy,
                    disabled: exerciseEditBusy,
                    expanded: exerciseActionsVisibleForId === exercise.id,
                  }}
                  disabled={exerciseEditBusy}
                  focusable={!exerciseEditBusy}
                  onPress={() => {
                    setExerciseActionsVisibleForId(exercise.id);
                    setExerciseEditFailure(null);
                    setExerciseEditRecovery(null);
                  }}
                  ref={(node) => {
                    exerciseActionRefs.current.set(exercise.id, node);
                  }}
                  style={({ pressed }) => [
                    styles.exerciseAction,
                    index === 0
                      ? styles.exerciseActionFirst
                      : styles.exerciseActionAfterDivider,
                    {
                      backgroundColor: pressed
                        ? colors.contentCardPressed
                        : "transparent",
                      borderColor: exerciseActionsVisibleForId === exercise.id
                        ? colors.action
                        : colors.contentCardBorder,
                      opacity: exerciseEditBusy ? 0.62 : 1,
                    },
                  ]}
                  testID={`exercise-actions-${exercise.exerciseId}`}
                >
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}
                  >
                    •••
                  </Text>
                </FocusablePressable>
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
                action={(
                  <View
                    style={styles.inlineActions}
                    testID={isMultiExerciseOverview
                      ? `active-workout-${exercise.id}-warmup-actions`
                      : "active-workout-warmup-actions"}
                  >
                    <SectionGlyphAction
                      busy={sectionMutationRef.current === "add_warmup"}
                      disabled={
                        warmupBusy !== null
                        || exercise.metricProfile !== "load_reps"
                      }
                      accessibilityLabel="Add warm-up"
                      icon={Plus}
                      onPress={() => {
                        void addWarmup(exercise);
                      }}
                      ref={warmupAddRef}
                    />
                  </View>
                )}
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
                  count={exercise.warmups.length}
                  index={index + 1}
                  key={`${set.id}-${set.id === activeSet?.id || set.id === expandedCompactSetId ? "expanded" : "compact"}`}
                  kind="warmup"
                  onChangeValues={(observation) => {
                    return persistValues(set, observation);
                  }}
                  onComplete={() => {
                    void runWarmup(set);
                  }}
                  onExpandCompact={() => setExpandedCompactSetId(set.id)}
                  onRevealedLayout={setRevealedSetOffset}
                  {...(set.id === activeSet?.id
                    ? { onMeasuredLayout: (y: number) => {
                      setActiveSetMeasurement((current) =>
                        current?.setId === set.id && current.y === y
                          ? current
                          : { setId: set.id, y }
                      );
                    } }
                    : {})}
                  {...(isMultiExerciseOverview
                    ? { overviewTestID: `overview-${exercise.id}-${set.id}` }
                    : {})}
                  onRemove={() => requestRemoval("warmup", set, index)}
                  removeRef={(node) => {
                    removeGlyphRefs.current.set(set.id, node);
                  }}
                  revealed={revealedSetId === set.id}
                  set={set}
                  tone="card"
                />
                {renderSetTimingControl(exercise, set)}
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
                      busy={sectionMutationRef.current === "add_working"}
                      disabled={workingBusySetId !== null}
                      accessibilityLabel="Add working set"
                      icon={Plus}
                      onPress={() => {
                        void addWorking(exercise);
                      }}
                      ref={workingAddRef}
                    />
                  </View>
                )}
                supportingText={`${view.progress.completedWorkingSets} of ${view.progress.totalWorkingSets} working sets`}
                title="Working sets"
                tone="card"
              />
              {sectionFailure?.operation !== "add_working" ? null : (
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
              {exercise.id === activeExercise.id ? (
                <View
                  onLayout={(event: LayoutChangeEvent) => {
                    const y = event.nativeEvent.layout.y;
                    setTimingPanelMeasurement((current) =>
                      current?.exerciseId === exercise.id && current.y === y
                        ? current
                        : { exerciseId: exercise.id, y }
                    );
                  }}
                  testID="advanced-timing-panel-measurement"
                >
                <AdvancedTimingIndicator
                  busy={workingBusySetId !== null}
                  context={timingContext}
                  cueUnavailable={cueUnavailable}
                  disabled={
                    activeSet === undefined
                    || activeSet.kind !== "working"
                    || activeSet.status === "completed"
                    || activeSet.status === "skipped"
                    || timingContext === null
                    || commands.configureAdvancedTiming === undefined
                    || commands.startAdvancedTiming === undefined
                  }
                  nowMs={nowMs}
                  onConfigureAndStart={configureAndStartAdvancedTiming}
                  onConfigureAndStartCluster={configureAndStartClusterTiming}
                  onBeginClusterGap={() => runAdvancedTiming((input) => {
                    if (commands.beginAdvancedTimingClusterGap === undefined) {
                      throw new Error("advanced_timing_unavailable");
                    }
                    return commands.beginAdvancedTimingClusterGap({
                      ...input,
                      countdownCue,
                    });
                  })}
                  onPause={() => runAdvancedTiming((input) => {
                    if (commands.pauseAdvancedTiming === undefined) {
                      throw new Error("advanced_timing_unavailable");
                    }
                    return commands.pauseAdvancedTiming(input);
                  })}
                  onReconcile={(foregroundSinceMs) => runAdvancedTiming((input) => {
                    if (commands.reconcileAdvancedTiming === undefined) {
                      throw new Error("advanced_timing_unavailable");
                    }
                    return commands.reconcileAdvancedTiming({
                      ...input,
                      countdownCue,
                      foregroundSinceMs,
                    });
                  })}
                  onResume={() => runAdvancedTiming((input) => {
                    if (commands.resumeAdvancedTiming === undefined) {
                      throw new Error("advanced_timing_unavailable");
                    }
                    return commands.resumeAdvancedTiming(input);
                  })}
                  onSkipClusterGap={() => runAdvancedTiming((input) => {
                    if (commands.skipAdvancedTimingClusterGap === undefined) {
                      throw new Error("advanced_timing_unavailable");
                    }
                    return commands.skipAdvancedTimingClusterGap({
                      ...input,
                      countdownCue,
                    });
                  })}
                  onStop={() => runAdvancedTiming((input) => {
                    if (commands.stopAdvancedTiming === undefined) {
                      throw new Error("advanced_timing_unavailable");
                    }
                    return commands.stopAdvancedTiming(input);
                  })}
                  {...(activeSet?.advancedTimingResolved === undefined
                    ? {}
                    : { resolvedConfig: activeSet.advancedTimingResolved })}
                  targetSetId={activeSet?.id ?? null}
                />
                </View>
              ) : null}
              {exercise.workingSets.map((set, index) => (
                <React.Fragment key={set.id}>
                <SetRow
                  active={view.activeSetId === set.id}
                  compact={isMultiExerciseOverview
                    && set.id !== activeSet?.id
                    && set.id !== expandedCompactSetId}
                  actionsDisabled={
                    view.rest.state === "running"
                    || view.rest.state === "paused"
                  }
                  busy={workingBusySetId === set.id}
                  count={exercise.workingSets.length}
                  index={index + 1}
                  key={`${set.id}-${set.id === activeSet?.id || set.id === expandedCompactSetId ? "expanded" : "compact"}`}
                  kind="working"
                  onChangeValues={(observation) => {
                    return persistValues(set, observation);
                  }}
                  onComplete={() => {
                    void completeCurrentSet(set);
                  }}
                  onExpandCompact={() => setExpandedCompactSetId(set.id)}
                  onCancelCorrection={() => {
                    setEditingCompletedSetId(null);
                    setCorrectionFailure(null);
                  }}
                  onEditCompleted={() => {
                    setEditingCompletedSetId(set.id);
                    setCorrectionFailure(null);
                  }}
                  onSaveCorrection={(observation) => {
                    return reviseCompletedSet(set, observation);
                  }}
                  onRemove={() => requestRemoval("working", set, index)}
                  {...(set.id === activeSet?.id
                    ? { onMeasuredLayout: (y: number) => {
                      setActiveSetMeasurement((current) =>
                        current?.setId === set.id && current.y === y
                          ? current
                          : { setId: set.id, y }
                      );
                    } }
                    : {})}
                  removeRef={(node) => {
                    removeGlyphRefs.current.set(set.id, node);
                  }}
                  correctionBusy={correctionBusySetId === set.id}
                  correctionError={correctionFailure?.setId === set.id
                    ? "Correction was not saved. Retry the correction."
                    : undefined}
                  correctionMode={editingCompletedSetId === set.id}
                  revealed={revealedSetId === set.id}
                  set={set}
                  tone="card"
                  {...(isMultiExerciseOverview
                    ? { overviewTestID: `overview-${exercise.id}-${set.id}` }
                    : {})}
                />
                {renderSetTimingControl(exercise, set)}
                </React.Fragment>
              ))}
              {saveFailedSetId === null ? null : (
                <InlineNotice
                  action={
                    saveFailedSetId === activeSet?.id ? (
                      <PrimaryAction
                        label="Set not saved · Retry"
                        onPress={() => {
                          void completeCurrentSet(activeSet);
                        }}
                      />
                    ) : undefined
                  }
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
            })}
            {commands.addExercise === undefined ? null : (
              <PrimaryAction
                accessibilityHint="Choose one library exercise to append to this workout."
                label="Add exercise"
                onPress={() => {
                  setExerciseAddFailed(false);
                  setExerciseAddPickerVisible(true);
                }}
                testID="active-workout-add-exercise"
              />
            )}
          </>
        }
        testID="active-workout"
      />
      <Modal
        animationType="fade"
        onRequestClose={closeMoreActions}
        transparent
        visible={moreVisible}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            accessibilityViewIsModal
            contentContainerStyle={styles.moreSheetContent}
            keyboardShouldPersistTaps="handled"
            style={[
              styles.moreSheet,
              { backgroundColor: colors.surface },
            ]}
            testID="workout-actions-sheet-content"
          >
            <SectionHeader title="More workout actions" />
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
            <SecondaryAction
              destructive
              disabled={outcomeBusy}
              label="Discard workout"
              onPress={() => {
                closeMoreActions();
                setOutcomeConfirmation("discard");
              }}
            />
          </ScrollView>
        </View>
      </Modal>
      <Modal
        animationType={reduceMotion ? "none" : "fade"}
        onRequestClose={closeExerciseActions}
        transparent
        visible={exerciseActionsVisibleForId !== null}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            accessibilityViewIsModal
            contentContainerStyle={styles.moreSheetContent}
            keyboardShouldPersistTaps="handled"
            style={[styles.moreSheet, { backgroundColor: colors.surface }]}
            testID="exercise-actions-sheet-content"
          >
            <SectionHeader title="Exercise actions" />
            {exerciseActionsVisibleForId === null ? null : (
              <SecondaryAction
                label="Configure timing"
                onPress={() => {
                  const exerciseId = exerciseActionsVisibleForId;
                  closeExerciseActions();
                  const target = exercisesFor(viewRef.current).find(
                    ({ id }) => id === exerciseId,
                  );
                  if (target !== undefined) {
                    setTimingConfigFailed(false);
                    setTimingConfig({ scope: "exercise", exercise: target });
                  }
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
                label="Remove exercise"
                onPress={() => {
                  const exerciseId = exerciseActionsVisibleForId;
                  closeExerciseActions();
                  if (exerciseId !== null) {
                    beginExerciseEdit({ action: "remove", exerciseId });
                  }
                }}
              />
            )}
          </ScrollView>
        </View>
      </Modal>
      <Modal
        animationType={reduceMotion ? "none" : "fade"}
        onRequestClose={() => {
          setExerciseAddPickerVisible(false);
          setExerciseAddSelectedId(null);
          setExerciseAddQuery("");
        }}
        transparent
        visible={exerciseAddPickerVisible}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalBackdrop}
          testID="active-workout-add-exercise-picker-keyboard-layout"
        >
          <ScrollView
            accessibilityViewIsModal
            contentContainerStyle={styles.moreSheetContent}
            keyboardShouldPersistTaps="handled"
            style={[styles.moreSheet, { backgroundColor: colors.surface }]}
            testID="active-workout-add-exercise-picker-content"
          >
            <SectionHeader title="Choose exercise" />
            {selectedExerciseToAdd === undefined ? null : (
              <PrimaryAction
                busy={exerciseAddBusy}
                label={`Add ${selectedExerciseToAdd.name}`}
                onPress={() => {
                  void submitExerciseAdd();
                }}
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
            {exerciseAddCandidates.map((candidate) => (
              <FocusablePressable
                accessibilityLabel={`${candidate.name}. Add exercise`}
                accessibilityRole="button"
                key={candidate.id}
                onPress={() => {
                  setExerciseAddSelectedId(candidate.id);
                  exerciseAddSearchRef.current?.blur();
                  Keyboard.dismiss();
                }}
                testID={`add-exercise-option-${candidate.id}`}
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
                <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
                  {candidate.name}
                </Text>
                {exerciseAddSelectedId === candidate.id ? (
                  <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
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
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        animationType={reduceMotion ? "none" : "fade"}
        onRequestClose={() => {
          setReplacementPickerForId(null);
          if (replacementPickerForId !== null) {
            exerciseActionRefs.current.get(replacementPickerForId)?.focus();
          }
        }}
        transparent
        visible={replacementPickerForId !== null}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalBackdrop}
          testID="replace-exercise-picker-keyboard-layout"
        >
          <ScrollView
            accessibilityViewIsModal
            contentContainerStyle={styles.moreSheetContent}
            keyboardShouldPersistTaps="handled"
            style={[styles.moreSheet, { backgroundColor: colors.surface }]}
            testID="replace-exercise-picker-content"
          >
            <SectionHeader title="Choose exercise" />
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
            {replacementCandidates.map((candidate) => (
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
                testID={`replace-exercise-option-${candidate.id}`}
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
                <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
                  {candidate.name}
                </Text>
                {replacementExerciseId === candidate.id ? (
                  <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
                    Selected
                  </Text>
                ) : null}
              </FocusablePressable>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
      {timingConfig === null ? null : (
        <AdvancedTimingConfigSheet
          initialValue={timingConfig.scope === "exercise"
            ? timingConfig.exercise.advancedTimingDefault ?? null
            : timingConfig.set?.advancedTimingOverride ?? null}
          onCancel={() => {
            setTimingConfig(null);
            setTimingConfigFailed(false);
          }}
          onSave={(value) => {
            void saveAdvancedTimingConfig(value);
          }}
          scope={timingConfig.scope}
          visible
        />
      )}
      {timingConfigFailed ? (
        <InlineNotice
          body="Your recorded sets and rest were not changed. Try again."
          heading="Timing could not be saved"
          tone="error"
        />
      ) : null}
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
              : `Remove ${exercise?.name ?? "this exercise"} from this workout?`;
          })()}
          cancelLabel="Keep exercise"
          confirmBusy={exerciseEditBusy}
          confirmLabel="Remove exercise"
          confirmTestID="remove-exercise-confirm"
          destructive
          heading="Remove exercise"
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
      {removalAnnouncement === null ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.visuallyHidden}>
          {removalAnnouncement}
        </Text>
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
  exerciseAction: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    position: "absolute",
    right: 0,
  },
  exerciseActionAfterDivider: {
    top: sizes.focusRing + space[2],
  },
  exerciseActionFirst: {
    top: 0,
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
  setTimingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space[2],
    justifyContent: "space-between",
  },
  exerciseSection: {
    gap: space[2],
    position: "relative",
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
  modalBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    flex: 1,
    justifyContent: "flex-end",
  },
  moreSheet: {
    borderTopLeftRadius: radius.emphasized,
    borderTopRightRadius: radius.emphasized,
    maxHeight: "90%",
  },
  moreSheetContent: {
    gap: space[4],
    padding: space[6],
  },
  visuallyHidden: {
    height: 1,
    opacity: 0,
    position: "absolute",
    width: 1,
  },
});
