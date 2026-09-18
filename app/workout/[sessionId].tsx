import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  WorkoutSessionView,
} from "../../src/domains/workout";
import type {
  AdvancedTimingStateV1,
} from "../../src/domains/advancedTiming";
import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  createWorkoutMutationTestCommandAdapters,
} from "../../src/bootstrap/workoutMutationTestControls";
import {
  useRestCountdownCue,
} from "../../src/bootstrap/restCountdownCue";
import {
  ActiveWorkoutLoadingScreen,
} from "../../src/ui/screens/RootScreens";
import {
  EmptyState,
  PrimaryAction,
  ScreenHeader,
} from "../../src/ui/components";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  ActiveWorkoutScreen,
} from "../../src/ui/screens/ActiveWorkoutScreen";

export default function ActiveWorkoutRoute() {
  const { sessionId } = useLocalSearchParams<{
    sessionId: string;
  }>();
  const runtime = useWorkoutAppRuntime();
  const countdownCue = useRestCountdownCue();
  const resolvedSessionId = sessionId ?? "unknown";
  const [view, setView] = useState<WorkoutSessionView | null>(null);
  const [advancedTimingContext, setAdvancedTimingContext] = useState<Readonly<{
    sessionId: string;
    sessionRevision: number;
    state: AdvancedTimingStateV1;
  }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [focusGeneration, setFocusGeneration] = useState(0);
  const [availableExercises, setAvailableExercises] = useState<readonly Readonly<{
    id: string;
    name: string;
  }>[]>([]);
  const mutationCommands = createWorkoutMutationTestCommandAdapters({
    addWarmup: runtime.addWarmup,
    addWorkingSet: runtime.addWorkingSet,
    reviseCompletedSet: runtime.reviseCompletedSet,
    replaceExercise: runtime.replaceExercise,
    removeExercise: runtime.removeExercise,
  });
  useEffect(() => {
    let active = true;
    setFailed(false);
    setView((current) => current?.id === resolvedSessionId ? current : null);
    void Promise.all([
      runtime.getActiveWorkout(resolvedSessionId),
      (runtime.getAdvancedTimingContext?.(resolvedSessionId)
        ?? Promise.resolve(null)).catch(() => null),
    ]).then(([nextView, nextAdvancedTimingContext]) => {
      if (active) {
        setView(nextView);
        setAdvancedTimingContext(nextAdvancedTimingContext);
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
    runtime.getAdvancedTimingContext,
    runtime.getActiveWorkout,
    runtime.workoutRefreshGeneration,
  ]);
  useFocusEffect(useCallback(() => {
    setFocusGeneration((current) => current + 1);
  }, []));
  useEffect(() => {
    let active = true;
    void runtime.listOwnedPlanExercises().then((exercises) => {
      if (active) {
        setAvailableExercises(exercises.map(({ id, name }) => ({ id, name })));
      }
    }).catch(() => { if (active) setAvailableExercises([]); });
    return () => { active = false; };
  }, [runtime.listOwnedPlanExercises]);

  if (failed) {
    return (
      <AdaptiveScreen
        constrainActiveWork
        primary={
          <>
            <ScreenHeader
              backAction={() => router.back()}
              eyebrow="WORKOUT OVERVIEW"
              title="Workout"
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
      <ActiveWorkoutLoadingScreen
        onGoBack={() => router.back()}
        sessionId={resolvedSessionId}
      />
    );
  }

  return (
    <ActiveWorkoutScreen
      commands={{
        addExercise: runtime.addExercise,
        replaceExercise: mutationCommands.replaceExercise ?? runtime.replaceExercise,
        removeExercise: mutationCommands.removeExercise ?? runtime.removeExercise,
        reorderExercises: runtime.reorderExercises,
        updateActiveSetDraft: runtime.updateActiveSetDraft,
        updateWarmupDraft: runtime.updateWarmupDraft,
        addWarmup: mutationCommands.addWarmup,
        addWorkingSet: mutationCommands.addWorkingSet,
        completeWarmup: runtime.completeWarmup,
        removeWarmup: runtime.removeWarmup,
        removeWorkingSet: runtime.removeWorkingSet,
        completeSet: runtime.completeSet,
        reviseCompletedSet: mutationCommands.reviseCompletedSet,
        startManualRest: runtime.startManualRest,
        pauseRest: runtime.pauseRest,
        resumeRest: runtime.resumeRest,
        adjustRest: runtime.adjustRest,
        skipRest: runtime.skipRest,
        expireRest: runtime.expireRest,
        configureAdvancedTiming: runtime.configureAdvancedTiming,
        startAdvancedTiming: runtime.startAdvancedTiming,
        beginAdvancedTimingClusterGap: runtime.beginAdvancedTimingClusterGap,
        skipAdvancedTimingClusterGap: runtime.skipAdvancedTimingClusterGap,
        pauseAdvancedTiming: runtime.pauseAdvancedTiming,
        resumeAdvancedTiming: runtime.resumeAdvancedTiming,
        reconcileAdvancedTiming: runtime.reconcileAdvancedTiming,
        stopAdvancedTiming: runtime.stopAdvancedTiming,
        finishCompleted: runtime.finishCompleted,
        finishPartial: runtime.finishPartial,
        saveZeroSetWorkout: runtime.saveZeroSetWorkout,
        discardWorkout: runtime.discardWorkout,
        skipExercise: runtime.skipExercise,
      }}
      advancedTimingContext={advancedTimingContext}
      availableExercises={availableExercises}
      cueUnavailable={runtime.advancedTimingCueFailed === true}
      nowMs={() => Date.now()}
      onAdvancedTimingChanged={setAdvancedTimingContext}
      notificationPermission={runtime.notificationPermission}
      restSoundEnabled={runtime.readRestAlertPreferences().soundEnabled}
      countdownCue={countdownCue}
      onOpenNotificationSettings={() => {
        void runtime.openRestNotificationSettings();
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
      view={view}
      key={`${resolvedSessionId}:${focusGeneration}`}
    />
  );
}
