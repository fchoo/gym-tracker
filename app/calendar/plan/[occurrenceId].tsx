import { router, useLocalSearchParams } from "expo-router";
import React from "react";

import { parseCalendarRouteOrigin, parseScalarRouteParam } from "../../../src/navigation/routeOrigin";
import { CalendarPlannedStrengthRouteAdapter } from "../../../src/ui/calendar/CalendarRouteAdapters";

export default function CalendarPlannedWorkoutRoute() {
  const { occurrenceId, origin } = useLocalSearchParams() as Readonly<{
    occurrenceId?: string | readonly string[];
    origin?: string | readonly string[];
  }>;
  const parsedOccurrenceId = parseScalarRouteParam(occurrenceId);
  const parsedOrigin = parseCalendarRouteOrigin(origin, { managementOrigins: [] });
  const exactOccurrenceId = parsedOrigin.kind === "calendar" && parsedOccurrenceId.kind === "value"
    ? parsedOccurrenceId.value
    : "";
  return (
    <CalendarPlannedStrengthRouteAdapter
      occurrenceId={exactOccurrenceId}
      onBack={() => router.back()}
    />
  );
}
