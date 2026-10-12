import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { CalendarPlannedStrengthRouteAdapter } from "../../../src/ui/calendar/CalendarRouteAdapters";

export default function CalendarPlannedWorkoutRoute() {
  const { occurrenceId } = useLocalSearchParams() as Readonly<{
    occurrenceId?: string | readonly string[];
  }>;
  const exactOccurrenceId = typeof occurrenceId === "string" && occurrenceId.length > 0
    ? occurrenceId
    : "";
  return (
    <CalendarPlannedStrengthRouteAdapter
      occurrenceId={exactOccurrenceId}
      onBack={() => router.back()}
    />
  );
}
