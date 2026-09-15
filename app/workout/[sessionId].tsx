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
  const [failed, setFailed] = useState(false);
  const mutationCommands = createWorkoutMutationTestCommandAdapters({
    addWarmup: runtime.addWarmup,
    addWorkingSet: runtime.addWorkingSet,
    reviseCompletedSet: runtime.reviseCompletedSet,
  });
  useEffect(() => {
    let active = true;
    setFailed(false);
    setView(null);
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
      nowMs={() => Date.now()}
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
    />
  );
}
