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
  const { sessionId, returnTo } = useLocalSearchParams<{
    sessionId: string;
    returnTo?: string;
  }>();
  const runtime = useWorkoutAppRuntime();
  const countdownCue = useRestCountdownCue();
  const resolvedSessionId = sessionId ?? "unknown";
  const [view, setView] = useState<WorkoutSessionView | null>(null);
  const [failed, setFailed] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [focusGeneration, setFocusGeneration] = useState(0);
  const [availableExercises, setAvailableExercises] = useState<readonly Readonly<{
    id: string;
    name: string;
  }>[]>([]);
  const [availableExercisesState, setAvailableExercisesState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [availableExercisesAttempt, setAvailableExercisesAttempt] = useState(0);
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
    readAttempt,
    resolvedSessionId,
    runtime.getActiveWorkout,
    runtime.workoutRefreshGeneration,
  ]);
  const returnToWorkout = useCallback(() => {
    if (returnTo === "/(tabs)") {
      router.replace(returnTo);
      return;
    }
    router.back();
  }, [returnTo]);
  useFocusEffect(useCallback(() => {
    setFocusGeneration((current) => current + 1);
  }, []));
  useEffect(() => {
    let active = true;
    setAvailableExercisesState("loading");
    void runtime.listOwnedPlanExercises().then((exercises) => {
      if (active) {
        setAvailableExercises(exercises.map(({ id, name }) => ({ id, name })));
        setAvailableExercisesState("ready");
      }
    }).catch(() => {
      if (active) {
        setAvailableExercises([]);
        setAvailableExercisesState("error");
      }
    });
    return () => { active = false; };
  }, [availableExercisesAttempt, runtime.listOwnedPlanExercises]);

  if (failed) {
    return (
      <AdaptiveScreen
        constrainActiveWork
        primary={
          <>
            <ScreenHeader
              backAction={returnToWorkout}
              eyebrow="WORKOUT OVERVIEW"
              title="Workout"
            />
            <EmptyState
              body="Your workout was not changed. Return to Today and resume the active session."
              heading="Workout could not be opened"
              primaryAction={<>
                <PrimaryAction
                  label="Retry opening workout data"
                  onPress={() => setReadAttempt((attempt) => attempt + 1)}
                />
                <PrimaryAction
                  label="Go back to Workout"
                  onPress={returnToWorkout}
                />
              </>}
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
        finishCompleted: runtime.finishCompleted,
        finishPartial: runtime.finishPartial,
        saveZeroSetWorkout: runtime.saveZeroSetWorkout,
        discardWorkout: runtime.discardWorkout,
        skipExercise: runtime.skipExercise,
      }}
      availableExercises={availableExercises}
      availableExercisesState={availableExercisesState}
      nowMs={() => Date.now()}
      notificationPermission={runtime.notificationPermission}
      restSoundEnabled={runtime.readRestAlertPreferences().soundEnabled}
      countdownCue={countdownCue}
      onOpenNotificationSettings={() => {
        void runtime.openRestNotificationSettings();
      }}
      onRetryAvailableExercises={() => {
        setAvailableExercisesAttempt((attempt) => attempt + 1);
      }}
      onFinishLater={() => router.replace("/(tabs)")}
      onGoBack={returnToWorkout}
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
