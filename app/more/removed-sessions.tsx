import {
  router,
} from "expo-router";
import React from "react";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  RemovedSessionsScreen,
} from "../../src/ui/screens/RemovedSessionsScreen";

export default function RemovedSessionsRoute() {
  const runtime = useWorkoutAppRuntime();
  return (
    <RemovedSessionsScreen
      loadRemovedSessions={runtime.listRemovedHistorySessions}
      onBack={() => router.back()}
      onRestored={() => {
        void runtime.refresh();
      }}
      restoreSession={runtime.restoreHistorySession}
    />
  );
}
