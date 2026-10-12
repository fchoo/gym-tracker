import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type { CalendarRange, CalendarReadPort } from "../calendar/calendarPorts";
import { CalendarScreen } from "../screens/CalendarScreen";
import { AppearanceProvider } from "../theme";

const range = Object.freeze({
  events: Object.freeze([Object.freeze({
    id: "strength-opportunity-1",
    source: "strength",
    sport: "strength",
    status: "planned",
    title: "Full body progression, week 12",
    sourceLabel: "Strength",
    localDate: "2026-08-24",
    timeZone: "Asia/Singapore",
    scheduleId: "schedule-1",
    scheduleVersionId: "version-1",
    planId: "plan-1",
    slotId: null,
    revision: 1,
    state: "planned",
    destination: Object.freeze({
      kind: "occurrence",
      occurrenceId: "strength-opportunity-1",
    }),
  })]),
}) as CalendarRange;

const completedStrengthRange = Object.freeze({
  events: Object.freeze([Object.freeze({
    ...range.events[0],
    id: "strength-session-1",
    state: "completed",
    status: "completed",
    destination: Object.freeze({
      kind: "session" as const,
      sessionId: "strength-session-1",
    }),
  })]),
}) as CalendarRange;

const agendaRange = Object.freeze({
  events: Object.freeze([
    Object.freeze({
      ...completedStrengthRange.events[0],
      id: "partial-strength-1",
      state: "partial",
      status: "partial",
      destination: Object.freeze({ kind: "session" as const, sessionId: "partial-strength-1" }),
    }),
    Object.freeze({
      ...range.events[0],
      id: "planned-strength-1",
      destination: Object.freeze({ kind: "occurrence" as const, occurrenceId: "planned-strength-1" }),
    }),
    Object.freeze({
      ...range.events[0],
      id: "planned-running-1",
      source: "running" as const,
      sport: "running" as const,
      sourceLabel: "Tempo",
      title: "Tempo progression",
      destination: Object.freeze({ kind: "plan" as const, planId: "running-plan-1", sessionId: "session-revision-1" }),
    }),
    Object.freeze({
      ...range.events[0],
      id: "imported-running-1",
      source: "imported_activity" as const,
      sport: "running" as const,
      sourceLabel: "Garmin",
      status: "imported" as const,
      state: "imported",
      title: "Outdoor run",
      destination: Object.freeze({ kind: "activity" as const, activityId: "activity-1" }),
    }),
  ]),
}) as CalendarRange;

describe("CalendarScreen", () => {
  it("opens one completed Strength agenda target without giving the date cell a nested event action", async () => {
    const onOpenEvent = jest.fn();
    const loadCalendarRange = jest.fn(async () => completedStrengthRange);

    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={onOpenEvent}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByRole("header", { name: "Calendar" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Mon")).toBeOnTheScreen();
    expect(screen.getByText("Full body progression, week 12")).toBeOnTheScreen();

    const day = screen.getByRole("button", {
      name: /24 August 2026.*Full body progression, week 12.*Strength.*Complete/u,
    });
    await fireEvent.press(day);

    expect(onOpenEvent).not.toHaveBeenCalled();
    const agendaTarget = await screen.findByRole("button", {
      name: /Full body progression, week 12.*Strength.*Complete.*Strength/u,
    });
    await fireEvent.press(agendaTarget);

    expect(onOpenEvent).toHaveBeenCalledTimes(1);
    expect(onOpenEvent).toHaveBeenCalledWith(
      completedStrengthRange.events[0]!.destination,
      "strength-session-1",
    );
    expect(loadCalendarRange).toHaveBeenCalledWith({
      startLocalDate: "2026-07-27",
      endLocalDateExclusive: "2026-09-14",
    });
  });

  it("keeps Previous, Today, Next, and the modal-only Calendar key reachable", async () => {
    const loadCalendarRange = jest.fn(async () => range);

    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByRole("button", { name: "Return to today, 24 August 2026" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Show July 2026" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Show September 2026" })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Open Calendar key" }));

    expect(screen.getByRole("header", { name: "Calendar key" })).toBeOnTheScreen();
    expect(screen.getByText("Color identifies the activity. Fill and border style identify its status."))
      .toBeOnTheScreen();
    expect(screen.getByText("ACTIVITY")).toBeOnTheScreen();
    expect(screen.getByText("STATUS")).toBeOnTheScreen();
    expect(screen.queryByText("Complete", { exact: true })).not.toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Close Calendar key" }));
    expect(screen.queryByRole("header", { name: "Calendar key" })).toBeNull();
  });

  it("keeps all selected-date agenda identities in source order and exposes no management command", async () => {
    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => agendaRange)}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(await screen.findByRole("button", { name: /24 August 2026.*4 scheduled or imported events/u }));

    expect(await screen.findByLabelText("4 scheduled or imported events")).toBeOnTheScreen();
    expect(screen.getAllByTestId(/calendar-agenda-event/u).map((node) => node.props.testID)).toEqual([
      "calendar-agenda-event-partial-strength-1",
      "calendar-agenda-event-planned-strength-1",
      "calendar-agenda-event-planned-running-1",
      "calendar-agenda-event-imported-running-1",
    ]);
    expect(screen.queryByText(/resume|correct|remove|match workout/u)).toBeNull();
  });

  it("retains the last good month during refresh and retries the exact failed range", async () => {
    let rejectNextRange: ((error: Error) => void) | undefined;
    const loadCalendarRange = jest.fn() as jest.MockedFunction<CalendarReadPort["loadCalendarRange"]>;
    loadCalendarRange
      .mockResolvedValueOnce(range)
      .mockImplementationOnce(() => new Promise<CalendarRange>((_resolve, reject) => {
        rejectNextRange = reject;
      }))
      .mockResolvedValueOnce(range);

    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByText("Full body progression, week 12")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Show September 2026" }));

    expect(screen.getByText("Updating Calendar")).toBeOnTheScreen();
    expect(screen.getByText("Full body progression, week 12")).toBeOnTheScreen();

    rejectNextRange?.(new Error("offline"));

    expect(await screen.findByText("Calendar could not be loaded")).toBeOnTheScreen();
    expect(screen.getByText("Your saved workouts were not changed. Try loading Calendar again."))
      .toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Retry Calendar" }));

    await waitFor(() => {
      expect(loadCalendarRange).toHaveBeenLastCalledWith({
        startLocalDate: "2026-08-31",
        endLocalDateExclusive: "2026-10-12",
      });
    });
  });
});
