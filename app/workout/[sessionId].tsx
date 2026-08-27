import {
  router,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import React, {
  useEffect,
  useState,
} from "react";

import type {
  WorkoutSessionView,
} from "../../src/domains/workout";
import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  createWorkoutMutationTestCommandAdapters,
} from "../../src/bootstrap/workoutMutationTestControls";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  EmptyState,
  ConfirmationSheet,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SkeletonBlock,
} from "../../src/ui/components";
import {
  ActiveWorkoutScreen,
} from "../../src/ui/screens/ActiveWorkoutScreen";

export default function ActiveWorkoutRoute() {
  const { sessionId, reviewExerciseId } = useLocalSearchParams<{
    sessionId: string;
    reviewExerciseId?: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const resolvedSessionId = sessionId ?? "unknown";
  const resolvedReviewExerciseId = Array.isArray(reviewExerciseId)
    ? reviewExerciseId[0]
    : reviewExerciseId;
  const [view, setView] = useState<WorkoutSessionView | null>(null);
  const [failed, setFailed] = useState(false);
  const [emptyConfirmation, setEmptyConfirmation] = useState<
    "zero_sets" | "discard" | null
  >(null);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const mutationCommands = createWorkoutMutationTestCommandAdapters({
    addWarmup: runtime.addWarmup,
    addWorkingSet: runtime.addWorkingSet,
    copyPreviousWarmup: runtime.copyPreviousWarmup,
    reviseCompletedSet: runtime.reviseCompletedSet,
  });

  useEffect(() => {
    let active = true;
    setFailed(false);
    void runtime.getActiveWorkout(resolvedSessionId).then((nextView) => {
      if (active) {
        setView(nextView);
      }
    }).catch(() => {
      if (active) {
        setFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [
    resolvedSessionId,
    runtime.getActiveWorkout,
    runtime.workoutRefreshGeneration,
  ]);

  if (failed) {
    return (
      <AdaptiveScreen
        constrainActiveWork
        primary={
          <>
            <ScreenHeader
              backAction={() => router.back()}
              eyebrow="FOCUSED WORKOUT"
              title="Active Workout"
            />
            <EmptyState
              body="Your workout was not changed. Return to Today and resume the active session."
              heading="Workout could not be opened"
              primaryAction={
                <PrimaryAction
                  label="Go back to Today"
                  onPress={() => router.replace("/(tabs)")}
                />
              }
            />
          </>
        }
      />
    );
  }

  if (view === null) {
    return (
      <AdaptiveScreen
        constrainActiveWork
        primary={
          <>
            <ScreenHeader
              backAction={() => router.back()}
              eyebrow="FOCUSED WORKOUT"
              title="Active Workout"
            />
            <SkeletonBlock height={34} width="72%" />
            <SkeletonBlock height={72} />
            <SkeletonBlock height={72} />
            <SkeletonBlock height={56} />
          </>
        }
      />
    );
  }

  if ("state" in view) {
    return (
      <>
        <AdaptiveScreen
          constrainActiveWork
          primary={
            <>
              <ScreenHeader
                backAction={() => router.back()}
                eyebrow="FOCUSED WORKOUT"
                title="Empty workout"
              />
              <InlineNotice
                body="No exercises are planned in this session yet. Save a zero-set visit explicitly, finish later, or discard it."
                heading="Empty workout in progress"
                tone="neutral"
              />
              <PrimaryAction
                busy={outcomeBusy}
                label="Save zero-set workout"
                onPress={() => setEmptyConfirmation("zero_sets")}
              />
              <SecondaryAction
                disabled={outcomeBusy}
                label="Finish workout later"
                onPress={() => router.replace("/(tabs)")}
              />
              <SecondaryAction
                destructive
                disabled={outcomeBusy}
                label="Discard workout"
                onPress={() => setEmptyConfirmation("discard")}
              />
            </>
          }
        />
        <ConfirmationSheet
          body={
            emptyConfirmation === "discard"
              ? "This ends the workout and marks it discarded. It cannot be resumed."
              : "This workout will be saved with zero completed working sets."
          }
          cancelLabel={
            emptyConfirmation === "discard" ? "Keep workout" : "Keep training"
          }
          confirmLabel={
            emptyConfirmation === "discard"
              ? "Discard workout"
              : "Save zero-set workout"
          }
          destructive={emptyConfirmation === "discard"}
          heading={
            emptyConfirmation === "discard"
              ? "Discard workout?"
              : "Finish without working sets?"
          }
          onCancel={() => setEmptyConfirmation(null)}
          onConfirm={() => {
            setOutcomeBusy(true);
            const operation = emptyConfirmation === "discard"
              ? runtime.discardWorkout({
                  sessionId: resolvedSessionId,
                  expectedSessionRevision: view.revision,
                  confirmation: "discard_workout",
                  endedAtMs: Date.now(),
                })
              : runtime.saveZeroSetWorkout({
                  sessionId: resolvedSessionId,
                  expectedSessionRevision: view.revision,
                  confirmation: "save_zero_set_workout",
                  endedAtMs: Date.now(),
                });
            void operation.then(() => {
              if (emptyConfirmation === "discard") {
                router.replace("/(tabs)");
              } else {
                router.replace({
                  pathname: "/completion/[sessionId]",
                  params: { sessionId: resolvedSessionId },
                } as unknown as Href);
              }
            }).finally(() => setOutcomeBusy(false));
          }}
          visible={emptyConfirmation !== null}
        />
      </>
    );
  }

  return (
    <ActiveWorkoutScreen
      commands={{
        updateActiveSetDraft: runtime.updateActiveSetDraft,
        updateWarmupDraft: runtime.updateWarmupDraft,
        addWarmup: mutationCommands.addWarmup,
        addWorkingSet: mutationCommands.addWorkingSet,
        copyPreviousWarmup: mutationCommands.copyPreviousWarmup,
        completeWarmup: runtime.completeWarmup,
        skipWarmup: runtime.skipWarmup,
        skipWorkingSet: runtime.skipWorkingSet,
        completeSet: runtime.completeSet,
        reviseCompletedSet: mutationCommands.reviseCompletedSet,
        startManualRest: runtime.startManualRest,
        pauseRest: runtime.pauseRest,
        resumeRest: runtime.resumeRest,
        adjustRest: runtime.adjustRest,
        skipRest: runtime.skipRest,
        expireRest: runtime.expireRest,
        finishCompleted: runtime.finishCompleted,
        finishPartial: runtime.finishPartial,
        saveZeroSetWorkout: runtime.saveZeroSetWorkout,
        discardWorkout: runtime.discardWorkout,
        skipExercise: runtime.skipExercise,
      }}
      nowMs={() => Date.now()}
      notificationPermission={runtime.notificationPermission}
      onOpenNotificationSettings={() => {
        void runtime.openRestNotificationSettings();
      }}
      onOpenWorkoutPlan={() => {
        router.push(`/workout-plan/${resolvedSessionId}` as Href);
      }}
      onReturnToCurrent={() => {
        router.replace(`/workout/${resolvedSessionId}`);
      }}
      onFinishLater={() => router.replace("/(tabs)")}
      onGoBack={() => router.back()}
      onOutcomeSaved={(savedSessionId) => {
        router.replace({
          pathname: "/completion/[sessionId]",
          params: { sessionId: savedSessionId },
        } as unknown as Href);
      }}
      onDiscarded={() => router.replace("/(tabs)")}
      sessionId={resolvedSessionId}
      {...(resolvedReviewExerciseId === undefined
        ? {}
        : { reviewExerciseId: resolvedReviewExerciseId })}
      view={view}
    />
  );
}
