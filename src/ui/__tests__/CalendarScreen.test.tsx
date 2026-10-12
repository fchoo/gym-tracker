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

describe("CalendarScreen", () => {
  it("renders a full source-backed event in its shared Monday-first day cell", async () => {
    const onOpenEvent = jest.fn();
    const loadCalendarRange = jest.fn(async () => range);

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
      name: /24 August 2026.*Full body progression, week 12.*Strength.*Planned/u,
    });
    await fireEvent.press(day);

    expect(onOpenEvent).toHaveBeenCalledWith(range.events[0]!.destination);
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
