import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Copy,
  Plus,
  type LucideIcon,
} from "lucide-react-native";

import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
  ActiveWorkoutView,
  AddWorkingSetInput,
  AddWarmupInput,
  CompleteSetInput,
  CompleteSetResult,
  CompleteWarmupInput,
  CopyPreviousWarmupInput,
  DiscardWorkoutInput,
  FinishCompletedInput,
  FinishOutcomeResult,
  FinishPartialInput,
  ReviseCompletedSetInput,
  SaveZeroSetInput,
  SetObservation,
  SkipExerciseInput,
  SkipWorkingSetInput,
  SkipWarmupInput,
  UpdateActiveSetDraftInput,
  UpdateWarmupDraftInput,
} from "../../domains/workout";
import {
  ConfirmationSheet,
  ContentCard,
  ActionCluster,
  FocusablePressable,
  IconAction,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
} from "../components";
import {
  RestDock,
} from "../components/RestDock";
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
  updateActiveSetDraft(
    input: UpdateActiveSetDraftInput,
  ): Promise<ActiveWorkoutView>;
  updateWarmupDraft(
    input: UpdateWarmupDraftInput,
  ): Promise<ActiveWorkoutView>;
  addWarmup(input: AddWarmupInput): Promise<CommittedSetMutationResult>;
  addWorkingSet(input: AddWorkingSetInput): Promise<CommittedSetMutationResult>;
  copyPreviousWarmup(
    input: CopyPreviousWarmupInput,
  ): Promise<CommittedSetMutationResult>;
  completeWarmup(input: CompleteWarmupInput): Promise<ActiveWorkoutView>;
  skipWarmup(input: SkipWarmupInput): Promise<ActiveWorkoutView>;
  skipWorkingSet(input: SkipWorkingSetInput): Promise<ActiveWorkoutView>;
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

type SectionMutation = "add_warmup" | "copy_warmup" | "add_working";

type SectionMutationFailure = Readonly<{
  operation: SectionMutation;
  retry: () => void;
}>;

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

function ReviewSetSummary({
  set,
  kind,
  index,
}: Readonly<{
  set: ActiveWorkoutSet;
  kind: "warmup" | "working";
  index: number;
}>) {
  const { colors } = useAppTheme();
  const label = kind === "warmup" ? `Warm-up W${index}` : `Working set ${index}`;
  const status = set.status === "completed"
    ? "Completed"
    : set.status === "skipped"
      ? "Skipped"
      : "Planned";
  return (
    <View
      accessibilityLabel={`${label}. ${status}. ${formatObservation(observationForSet(set))}. Review only.`}
      accessibilityRole="summary"
      style={styles.reviewSet}
    >
      <Text
        style={[
          typeScale.bodyStrong as TextStyle,
          { color: colors.contentCardText },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          typeScale.body as TextStyle,
          { color: colors.contentCardTextSecondary },
        ]}
      >
        {`${status} · ${formatObservation(observationForSet(set))}`}
      </Text>
    </View>
  );
}

function SectionGlyphAction({
  accessibilityLabel,
  busy = false,
  disabled = false,
  icon: Icon,
  onPress,
}: Readonly<{
  accessibilityLabel: string;
  busy?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  onPress: () => void;
}>) {
  const { colors } = useAppTheme();
  const unavailable = busy || disabled;
  return (
    <FocusablePressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: unavailable }}
      disabled={unavailable}
      focusable={!unavailable}
      onPress={onPress}
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
}

export type ActiveWorkoutScreenProps = Readonly<{
  sessionId: string;
  view: ActiveWorkoutView;
  commands: ActiveWorkoutCommands;
  nowMs: () => number;
  notificationPermission?: RestNotificationPermission;
  onOpenNotificationSettings?: () => void;
  onGoBack: () => void;
  onFinishLater: () => void;
  onOutcomeSaved?: (sessionId: string) => void;
  onDiscarded?: () => void;
  onOpenWorkoutPlan?: () => void;
  onReturnToCurrent?: () => void;
  reviewExerciseId?: string;
  width?: number;
}>;

export function ActiveWorkoutScreen({
  sessionId,
  view: initialView,
  commands,
  nowMs,
  notificationPermission = "undetermined",
  onOpenNotificationSettings = () => undefined,
  onGoBack,
  onFinishLater,
  onOutcomeSaved = () => onFinishLater(),
  onDiscarded = onFinishLater,
  onOpenWorkoutPlan = () => undefined,
  onReturnToCurrent = () => undefined,
  reviewExerciseId,
  width,
}: ActiveWorkoutScreenProps) {
  const { colors } = useAppTheme();
  const [view, setView] = useState(initialView);
  const viewRef = useRef(initialView);
  const [warmupBusy, setWarmupBusy] = useState<WarmupCommandState>(null);
  const [workingBusySetId, setWorkingBusySetId] = useState<string | null>(null);
  const [saveFailedSetId, setSaveFailedSetId] = useState<string | null>(null);
  const [sectionFailure, setSectionFailure] =
    useState<SectionMutationFailure | null>(null);
  const [revealedSetId, setRevealedSetId] = useState<string | null>(null);
  const [revealedSetMessage, setRevealedSetMessage] = useState<string | null>(null);
  const [revealedSetOffset, setRevealedSetOffset] = useState(0);
  const [editingCompletedSetId, setEditingCompletedSetId] =
    useState<string | null>(null);
  const [correctionBusySetId, setCorrectionBusySetId] =
    useState<string | null>(null);
  const [correctionFailure, setCorrectionFailure] =
    useState<Readonly<{ setId: string; retry: () => void }> | null>(null);
  const [restBusy, setRestBusy] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [outcomeConfirmation, setOutcomeConfirmation] =
    useState<OutcomeConfirmation>(null);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const moreActionRef = useRef<View>(null);
  const moreHeadingRef = useRef<View>(null);
  const draftQueue = useRef(Promise.resolve());
  const sectionMutationRef = useRef<SectionMutation | null>(null);
  const correctionSetIdRef = useRef<string | null>(null);
  const restCommandInFlightRef = useRef(false);
  const viewedExercise = reviewExerciseId === undefined
    ? view.currentExercise
    : view.exercises.find(({ id }) => id === reviewExerciseId)
      ?? view.currentExercise;
  const reviewingEarlierOrLater = viewedExercise.id !== view.currentExercise.id;
  const activeSets = viewedExercise.workingSets;
  const activeIndex = workingIndex(activeSets, view.activeSetId);
  const activeSet = reviewingEarlierOrLater || view.activeSetId === null
    ? undefined
    : activeSets[activeIndex];
  const adaptiveWidth = width === undefined ? {} : { width };

  const applyView = (nextView: ActiveWorkoutView) => {
    viewRef.current = nextView;
    setView(nextView);
  };

  const identityHeader = (
    <View
      testID={reviewingEarlierOrLater
        ? "active-workout-identity-review"
        : "active-workout-identity-current"}
    >
      <ScreenHeader
        action={
          <ActionCluster style={styles.headerActions}>
            <IconAction
              accessibilityLabel="Today's plan"
              icon="more"
              onPress={onOpenWorkoutPlan}
            />
            {reviewingEarlierOrLater ? null : <IconAction
              accessibilityLabel="More workout actions"
              icon="more"
              onPress={() => setMoreVisible(true)}
              ref={moreActionRef}
            />}
          </ActionCluster>
        }
        backAction={onGoBack}
        eyebrow={
          reviewingEarlierOrLater ? "REVIEWING WORKOUT" : "FOCUSED WORKOUT"
        }
        title={viewedExercise.name}
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
      applyRestResult(await command());
    } finally {
      restCommandInFlightRef.current = false;
      setRestBusy(false);
    }
  };

  useEffect(() => {
    viewRef.current = initialView;
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (moreVisible) {
      moreHeadingRef.current?.focus();
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
      const currentSet = currentView.currentExercise.workingSets.find(
        ({ id }) => id === requestedSetId,
      );
      if (currentSet === undefined || currentView.activeSetId !== currentSet.id) {
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
      const currentSet = [
        ...currentView.currentExercise.warmups,
        ...currentView.currentExercise.workingSets,
      ].find(({ id }) => id === set.id) ?? set;
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

  const runWarmup = async (
    set: ActiveWorkoutSet,
    action: "complete" | "skip",
  ) => {
    setWarmupBusy({ setId: set.id, action });
    try {
      await draftQueue.current;
      const currentSet = viewRef.current.currentExercise.warmups.find(
        ({ id }) => id === set.id,
      ) ?? set;
      const nextView = action === "complete"
        ? await commands.completeWarmup({
            sessionId,
            setId: currentSet.id,
            expectedSetRevision: currentSet.revision,
            completedAtMs: nowMs(),
          })
        : await commands.skipWarmup({
            sessionId,
            setId: currentSet.id,
            expectedSetRevision: currentSet.revision,
            skippedAtMs: nowMs(),
          });
      applyView(nextView);
    } finally {
      setWarmupBusy(null);
    }
  };

  const addWarmup = async () => {
    if (sectionMutationRef.current !== null) {
      return;
    }
    const source = view.currentExercise.warmups.at(-1);
    const workingSource = view.currentExercise.workingSets.find(
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
        sessionExerciseId: view.currentExercise.id,
        setId: `warmup_${sessionId}_${nowMs()}`,
        observation: {
          ...observation,
          source: "manual",
        },
        nowMs: nowMs(),
      });
      applyView(result);
      const setIndex = result.currentExercise.warmups.findIndex(
        ({ id }) => id === result.committedSetId,
      );
      setRevealedSetId(result.committedSetId);
      setRevealedSetOffset(0);
      setRevealedSetMessage(
        `Warm-up W${setIndex + 1} added and focused`,
      );
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

  const copyWarmup = async () => {
    if (sectionMutationRef.current !== null) {
      return;
    }
    const source = view.currentExercise.warmups.at(-1);
    if (source === undefined) {
      return;
    }
    sectionMutationRef.current = "copy_warmup";
    setWarmupBusy({ setId: source.id, action: "complete" });
    setSectionFailure(null);
    try {
      const result = await commands.copyPreviousWarmup({
        sessionId,
        sourceSetId: source.id,
        setId: `warmup_copy_${sessionId}_${nowMs()}`,
        nowMs: nowMs(),
      });
      applyView(result);
      const setIndex = result.currentExercise.warmups.findIndex(
        ({ id }) => id === result.committedSetId,
      );
      setRevealedSetId(result.committedSetId);
      setRevealedSetOffset(0);
      setRevealedSetMessage(
        `Warm-up W${setIndex + 1} added and focused`,
      );
    } catch {
      setSectionFailure({
        operation: "copy_warmup",
        retry: () => {
          void copyWarmup();
        },
      });
    } finally {
      sectionMutationRef.current = null;
      setWarmupBusy(null);
    }
  };

  const addWorking = async () => {
    if (sectionMutationRef.current !== null) {
      return;
    }
    const source = view.currentExercise.workingSets.at(-1);
    if (source === undefined) {
      return;
    }
    sectionMutationRef.current = "add_working";
    setWorkingBusySetId("new");
    setSectionFailure(null);
    try {
      const result = await commands.addWorkingSet({
        sessionId,
        sessionExerciseId: view.currentExercise.id,
        sourceSetId: source.id,
        setId: `working_${sessionId}_${nowMs()}`,
        nowMs: nowMs(),
      });
      applyView(result);
      const setIndex = result.currentExercise.workingSets.findIndex(
        ({ id }) => id === result.committedSetId,
      );
      setRevealedSetId(result.committedSetId);
      setRevealedSetOffset(0);
      setRevealedSetMessage(
        `Working set ${setIndex + 1} added and focused`,
      );
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

  const skipWorking = async (set: ActiveWorkoutSet) => {
    if (workingBusySetId !== null) {
      return;
    }
    setWorkingBusySetId(set.id);
    try {
      await draftQueue.current;
      const currentView = viewRef.current;
      const currentSet = currentView.currentExercise.workingSets.find(
        ({ id }) => id === set.id,
      );
      if (currentSet === undefined || currentView.activeSetId !== currentSet.id) {
        return;
      }
      applyView(await commands.skipWorkingSet({
        sessionId,
        setId: currentSet.id,
        expectedSessionRevision: currentView.revision,
        expectedSetRevision: currentSet.revision,
        metricIdentity: currentSet.metricIdentity,
        skippedAtMs: nowMs(),
      }));
      setSaveFailedSetId(null);
    } finally {
      setWorkingBusySetId(null);
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
    const currentSet = currentView.currentExercise.workingSets.find(
      ({ id }) => id === set.id,
    );
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
      setRevealedSetMessage(
        `Working set ${workingIndex(result.currentExercise.workingSets, result.committedSetId) + 1} correction saved`,
      );
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
          sessionExerciseId: view.currentExercise.id,
          expectedSessionRevision: view.revision,
          expectedExerciseRevision: view.currentExercise.revision,
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

  const confirmationCopy = outcomeConfirmation === "skip_exercise"
    ? {
        heading: `Skip ${view.currentExercise.name}?`,
        body: "This exercise will be marked skipped for this workout. Completed sets stay recorded.",
        cancelLabel: "Keep exercise",
        confirmLabel: "Skip exercise",
        confirmTestID: "skip-exercise-confirm",
        destructive: false,
      }
    : outcomeConfirmation === "partial"
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
      : outcomeConfirmation === "zero_sets"
        ? {
            heading: "Finish without working sets?",
            body: "This workout will be saved with zero completed working sets.",
            cancelLabel: "Keep training",
            confirmLabel: "Save zero-set workout",
            confirmTestID: "save-zero-set-workout-confirm",
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
        stickyHeader={identityHeader}
        dock={reviewingEarlierOrLater ? undefined : (
          view.rest.state === "running" || view.rest.state === "paused"
        ) ? (
          <RestDock
            busy={restBusy}
            nextSetIndex={activeIndex + 1}
            nextTarget={nextTarget}
            notificationPermission={notificationPermission}
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
            {revealedSetMessage === null ? null : (
              <InlineNotice
                body="The saved row is ready to review and edit."
                heading={revealedSetMessage}
                tone="completed"
              />
            )}
            {reviewingEarlierOrLater || activeSet !== undefined ? null : (
              <InlineNotice
                body="Every planned working set in this exercise has been saved. You can still correct any completed set before finishing the workout."
                heading="Exercise complete"
                tone="completed"
              />
            )}
            {!reviewingEarlierOrLater && view.rest.state === "expired" ? (
              <InlineNotice
                action={
                  <SecondaryAction
                    disabled={restBusy}
                    label="Dismiss rest notice"
                    onPress={() => {
                      void runRest(() => commands.skipRest(restInput()));
                    }}
                  />
                }
                body={`Rest ended ${Math.max(
                  0,
                  Math.floor((nowMs() - view.rest.expiredAtMs) / 1_000),
                )} seconds ago · working set ${activeIndex + 1} is ready`}
                heading="Rest ended"
                tone="attention"
              />
            ) : null}
            {reviewingEarlierOrLater ? (
              <InlineNotice
                action={
                  <SecondaryAction
                    label="Return to current exercise"
                    onPress={onReturnToCurrent}
                  />
                }
                body={`You are reviewing ${viewedExercise.name}. Workout progress remains on ${view.currentExercise.name}.`}
                heading="Reviewing another exercise"
                tone="neutral"
              />
            ) : null}
            {activeSet === undefined ? null : <TargetContext set={activeSet} />}
            <ContentCard
              style={styles.section}
              testID="active-workout-warmups-card"
            >
              <SectionHeader
                supportingText="Optional warm-up sets"
                title="Warm-ups"
                tone="card"
              />
              {reviewingEarlierOrLater ? null : <View
                style={styles.inlineActions}
                testID="active-workout-warmup-actions"
              >
                <SectionGlyphAction
                  busy={sectionMutationRef.current === "add_warmup"}
                  disabled={
                    warmupBusy !== null
                    || view.currentExercise.metricProfile !== "load_reps"
                  }
                  accessibilityLabel="Add warm-up"
                  icon={Plus}
                  onPress={() => {
                    void addWarmup();
                  }}
                />
                <SectionGlyphAction
                  busy={sectionMutationRef.current === "copy_warmup"}
                  disabled={
                    warmupBusy !== null
                    || view.currentExercise.warmups.length === 0
                  }
                  accessibilityLabel="Copy previous warm-up"
                  icon={Copy}
                  onPress={() => {
                    void copyWarmup();
                  }}
                />
              </View>}
              {sectionFailure === null
                || (sectionFailure.operation !== "add_warmup"
                  && sectionFailure.operation !== "copy_warmup") ? null : (
                  <InlineNotice
                    action={
                      <SecondaryAction
                        label={sectionFailure.operation === "add_warmup"
                          ? "Retry add warm-up"
                          : "Retry copy warm-up"}
                        onPress={sectionFailure.retry}
                      />
                    }
                    body="Your warm-up values are still available. Try the same action again."
                    card
                    heading="Warm-up was not added"
                    tone="error"
                  />
                )}
              {viewedExercise.warmups.map((set, index) => (
                reviewingEarlierOrLater ? <ReviewSetSummary
                  index={index + 1}
                  key={set.id}
                  kind="warmup"
                  set={set}
                /> : <SetRow
                  active={false}
                  busy={warmupBusy?.setId === set.id}
                  count={viewedExercise.warmups.length}
                  index={index + 1}
                  key={set.id}
                  kind="warmup"
                  onChangeValues={(observation) => {
                    return persistValues(set, observation);
                  }}
                  onComplete={() => {
                    void runWarmup(set, "complete");
                  }}
                  onRevealedLayout={setRevealedSetOffset}
                  onSkip={() => {
                    void runWarmup(set, "skip");
                  }}
                  revealed={revealedSetId === set.id}
                  set={set}
                  tone="card"
                />
              ))}
            </ContentCard>
            <ContentCard
              style={styles.section}
              testID="active-workout-working-sets-card"
            >
              <SectionHeader
                supportingText={`${view.progress.completedWorkingSets} of ${view.progress.totalWorkingSets} working sets`}
                title="Working sets"
                tone="card"
              />
              {reviewingEarlierOrLater ? null : <View
                style={styles.inlineActions}
                testID="active-workout-working-actions"
              >
                <SectionGlyphAction
                  busy={sectionMutationRef.current === "add_working"}
                  disabled={workingBusySetId !== null}
                  accessibilityLabel="Add working set"
                  icon={Plus}
                  onPress={() => {
                    void addWorking();
                  }}
                />
              </View>}
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
              {viewedExercise.workingSets.map((set, index) => (
                reviewingEarlierOrLater ? <ReviewSetSummary
                  index={index + 1}
                  key={set.id}
                  kind="working"
                  set={set}
                /> : <SetRow
                  active={view.activeSetId === set.id}
                  actionsDisabled={
                    view.rest.state === "running"
                    || view.rest.state === "paused"
                  }
                  busy={workingBusySetId === set.id}
                  count={viewedExercise.workingSets.length}
                  index={index + 1}
                  key={set.id}
                  kind="working"
                  onChangeValues={(observation) => {
                    return persistValues(set, observation);
                  }}
                  onComplete={() => {
                    void completeCurrentSet(set);
                  }}
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
                  onSkip={() => {
                    void skipWorking(set);
                  }}
                  correctionBusy={correctionBusySetId === set.id}
                  correctionError={correctionFailure?.setId === set.id
                    ? "Correction was not saved. Retry the correction."
                    : undefined}
                  correctionMode={editingCompletedSetId === set.id}
                  revealed={revealedSetId === set.id}
                  set={set}
                  tone="card"
                />
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
          </>
        }
        testID="active-workout"
      />
      {reviewingEarlierOrLater ? null : <Modal
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
            <View
              accessibilityRole="header"
              accessible
              focusable
              ref={moreHeadingRef}
            >
              <SectionHeader
                supportingText={`Uses ${view.currentExercise.defaultRestSeconds} seconds from this workout snapshot.`}
                title="More workout actions"
              />
            </View>
            <PrimaryAction
              disabled={restBusy}
              label="Start rest"
              onPress={() => {
                closeMoreActions();
                void runRest(() => commands.startManualRest(restInput()));
              }}
            />
            <SecondaryAction
              disabled={outcomeBusy}
              label={`Skip ${view.currentExercise.name}`}
              onPress={() => {
                closeMoreActions();
                setOutcomeConfirmation("skip_exercise");
              }}
            />
            {view.activeSetId === null ? (
              <PrimaryAction
                busy={outcomeBusy}
                label="Finish workout"
                onPress={() => {
                  closeMoreActions();
                  void finishCompletedWorkout();
                }}
              />
            ) : null}
            <SecondaryAction
              disabled={outcomeBusy}
              label="Finish as partial"
              onPress={() => {
                closeMoreActions();
                setOutcomeConfirmation("partial");
              }}
            />
            {view.progress.completedWorkingSets === 0 ? (
              <SecondaryAction
                disabled={outcomeBusy}
                label="Save zero-set workout"
                onPress={() => {
                  closeMoreActions();
                  setOutcomeConfirmation("zero_sets");
                }}
              />
            ) : null}
            <SecondaryAction
              disabled={outcomeBusy}
              label="Finish workout later"
              onPress={() => {
                closeMoreActions();
                onFinishLater();
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
            <SecondaryAction
              label="Close"
              onPress={closeMoreActions}
            />
          </ScrollView>
        </View>
      </Modal>}
      {reviewingEarlierOrLater ? null : <ConfirmationSheet
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
      />}
    </>
  );
}

const styles = StyleSheet.create({
  targetSection: {
    gap: space[1],
  },
  section: {
    gap: space[2],
  },
  inlineActions: {
    alignSelf: "flex-end",
    flexDirection: "row",
    gap: space[2],
    justifyContent: "flex-end",
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
  reviewSet: {
    gap: space[1],
    minHeight: 48,
    paddingVertical: space[2],
  },
});
