import {
  router,
  useLocalSearchParams,
} from "expo-router";
import React from "react";

import {
  useWorkoutAppRuntime,
} from "../../../src/bootstrap/workoutAppRuntime";
import {
  SessionCorrectionScreen,
} from "../../../src/ui/screens/SessionCorrectionScreen";

export default function SessionCorrectionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const runtime = useWorkoutAppRuntime();
  const resolvedSessionId = sessionId ?? "unknown";

  return (
    <SessionCorrectionScreen
      correctSession={runtime.correctHistorySession}
      listAvailableExercises={runtime.listAvailableCorrectionExercises}
      loadCorrectionSession={runtime.loadHistoryCorrectionSession}
      onBack={() => router.back()}
      onSaved={() => router.back()}
      sessionId={resolvedSessionId}
    />
  );
}
