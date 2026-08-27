import {
  router,
  useLocalSearchParams,
} from "expo-router";
import React, {
  useEffect,
  useState,
} from "react";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import type {
  WorkoutSessionView,
} from "../../src/domains/workout";
import {
  resolveWorkoutPlanOverviewScene,
  type WorkoutPlanOverviewScene,
  WorkoutPlanOverviewScreen,
} from "../../src/ui/screens/WorkoutPlanOverviewScreen";

type WorkoutPlanLoadResult =
  | Readonly<{
      state: "loaded";
      sessionId: string;
      refreshGeneration: number;
      view: WorkoutSessionView;
    }>
  | Readonly<{
      state: "error";
      sessionId: string;
      refreshGeneration: number;
    }>;

export default function WorkoutPlanOverviewRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const runtime = useWorkoutAppRuntime();
  const resolvedSessionId = sessionId ?? "unknown";
  const refreshGeneration = runtime.workoutRefreshGeneration;
  const [result, setResult] = useState<WorkoutPlanLoadResult | null>(null);

  useEffect(() => {
    let active = true;
    void runtime.getActiveWorkout(resolvedSessionId).then((nextView) => {
      if (active) {
        setResult({
          state: "loaded",
          sessionId: resolvedSessionId,
          refreshGeneration,
          view: nextView,
        });
      }
    }).catch(() => {
      if (active) {
        setResult({
          state: "error",
          sessionId: resolvedSessionId,
          refreshGeneration,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [
    resolvedSessionId,
    refreshGeneration,
    runtime.getActiveWorkout,
  ]);

  const currentResult = result?.sessionId === resolvedSessionId
    && result.refreshGeneration === refreshGeneration
    ? result
    : null;
  const scene: WorkoutPlanOverviewScene = currentResult === null
    ? { state: "loading" }
    : currentResult.state === "error"
      ? { state: "error" }
      : resolveWorkoutPlanOverviewScene(currentResult.view);

  return (
    <WorkoutPlanOverviewScreen
      onBack={() => router.back()}
      onReturnToActiveWorkout={() => {
        router.replace(`/workout/${resolvedSessionId}`);
      }}
      onReviewExercise={(sessionExerciseId) => {
        router.replace({
          pathname: "/workout/[sessionId]",
          params: {
            sessionId: resolvedSessionId,
            reviewExerciseId: sessionExerciseId,
          },
        });
      }}
      scene={scene}
    />
  );
}
