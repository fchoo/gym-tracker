import type {
  CalendarDayState,
  HistorySessionStatus,
  HistorySource,
} from "./contracts";

export function historySourceLabel(source: HistorySource): string {
  switch (source) {
    case "scheduled_day":
      return "Planned day";
    case "alternate_day":
      return "Alternate plan day";
    case "rest_day":
      return "Trained on rest day";
    case "empty":
      return "Empty workout";
    case "manual":
      return "Manual visit";
  }
}

export function calendarStateForSession(
  status: HistorySessionStatus,
  source: HistorySource,
): CalendarDayState {
  if (source === "manual" || status === "manual_visit") {
    return "manual";
  }
  return status === "partial" ? "partial" : "completed";
}

export function orderedCalendarStates(
  states: readonly CalendarDayState[],
): readonly CalendarDayState[] {
  const order: readonly CalendarDayState[] = [
    "completed",
    "partial",
    "manual",
    "planned_not_completed",
    "today",
  ];
  const present = new Set(states);
  return Object.freeze(order.filter((state) => present.has(state)));
}
