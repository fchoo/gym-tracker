import type {
  CalendarDayState,
  HistorySessionStatus,
  HistorySource,
} from "./contracts";

type CalendarEventLike = Readonly<{
  id: string;
  title: string;
  sport: "strength" | "running";
  status: "planned" | "completed" | "partial" | "imported" | "matched";
  sourceLabel: string;
}>;

function eventStatusLabel(status: CalendarEventLike["status"]): string {
  switch (status) {
    case "completed": return "Complete";
    case "partial": return "Partial";
    case "planned": return "Planned";
    case "imported": return "Imported";
    case "matched": return "Matched";
  }
}

/** Phase 13's range order is authoritative: never collapse or re-sort identities. */
export function orderedCalendarEvents<Event extends CalendarEventLike>(
  events: readonly Event[],
): readonly Event[] {
  return Object.freeze([...events]);
}

export function calendarDayPresentation<Event extends CalendarEventLike>(
  events: readonly Event[],
): Readonly<{ visualEvents: readonly Event[]; overflowCount: number }> {
  return Object.freeze({
    visualEvents: Object.freeze(events.slice(0, 2)),
    overflowCount: Math.max(0, events.length - 2),
  });
}

export function calendarDayAccessibilityLabel<Event extends CalendarEventLike>({
  date,
  events,
  isOutsideMonth,
  isSelected,
  isToday,
}: Readonly<{
  date: string;
  events: readonly Event[];
  isOutsideMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
}>): string {
  return [
    date,
    isToday ? "today" : null,
    isOutsideMonth ? "outside month" : null,
    events.length === 0
      ? "No workout"
      : `${events.length} scheduled or imported event${events.length === 1 ? "" : "s"}`,
    ...events.flatMap((event) => [
      event.title,
      event.sport === "strength" ? "Strength" : "Running",
      eventStatusLabel(event.status),
      event.sourceLabel,
    ]),
    isSelected ? "selected" : null,
  ].filter((value): value is string => value !== null).join(". ");
}

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
