import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type { CalendarRange } from "../calendar/calendarPorts";
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
      endLocalDateExclusive: "2026-09-07",
    });
  });
});
