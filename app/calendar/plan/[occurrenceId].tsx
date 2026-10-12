import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { useWorkoutAppRuntime } from "../../../src/bootstrap/workoutAppRuntime";
import { PlannedWorkoutDetailScreen } from "../../../src/ui/screens/PlannedWorkoutDetailScreen";

export default function CalendarPlannedWorkoutRoute() {
  const { occurrenceId } = useLocalSearchParams() as Readonly<{
    occurrenceId?: string | readonly string[];
  }>;
  const exactOccurrenceId = typeof occurrenceId === "string" && occurrenceId.length > 0
    ? occurrenceId
    : "";
  const runtime = useWorkoutAppRuntime();

  return (
    <PlannedWorkoutDetailScreen
      occurrenceId={exactOccurrenceId}
      loadOccurrence={runtime.loadPlannedStrengthOccurrence}
      onBack={() => router.back()}
    />
  );
}
