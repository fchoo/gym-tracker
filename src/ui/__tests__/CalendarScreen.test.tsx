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

import type {
  CalendarMonth,
} from "../../domains/history";
import {
  calendarMonthDirectionForHorizontalSwipe,
  CalendarScreen,
} from "../screens/CalendarScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  themes,
} from "../theme";

function month(
  overrides: Partial<CalendarMonth> = {},
): CalendarMonth {
  return {
    month: "2026-08-01" as CalendarMonth["month"],
    selectedDate: "2026-08-24" as CalendarMonth["selectedDate"],
    days: [{
      localDate: "2026-08-24" as CalendarMonth["selectedDate"],
      states: ["completed", "manual", "today"],
    }, {
      localDate: "2026-08-25" as CalendarMonth["selectedDate"],
      states: ["partial", "planned_not_completed"],
    }],
    sessions: [{
      id: "session-1",
      status: "completed",
      source: "scheduled_day",
      sourceLabel: "Planned day",
      planName: "Full Body Foundation",
      dayName: "Full Body A",
      original: {
        localDate: "2026-08-24" as CalendarMonth["selectedDate"],
        timezone: "Asia/Singapore",
        startedAtMs: 1_724_428_800_000,
        completedAtMs: 1_724_429_160_000,
        creationTimezoneOffsetMinutes: 480,
      },
      effective: {
        lifecycle: "active",
        localDate: "2026-08-24" as CalendarMonth["selectedDate"],
        timezone: "Asia/Singapore",
        startedAtMs: 1_724_428_800_000,
        completedAtMs: 1_724_429_160_000,
        revision: 1,
      },
      exerciseProgress: { completed: 1, planned: 2, percent: 50 },
      workingSetProgress: { completed: 2, planned: 3, percent: 67 },
    }],
    ...overrides,
  };
}

async function renderCalendar(
  overrides: Partial<React.ComponentProps<typeof CalendarScreen>> = {},
  appearanceStore = createMemoryAppearanceStore(),
) {
  const props: React.ComponentProps<typeof CalendarScreen> = {
    initialDate: "2026-08-24",
    loadCalendarMonth: jest.fn(async () => month()),
    onOpenSession: jest.fn(),
    ...overrides,
  };
  await render(
    <AppearanceProvider store={appearanceStore}>
      <CalendarScreen {...props} />
    </AppearanceProvider>,
  );
  return props;
}

describe("CalendarScreen", () => {
  it("renders a civil month grid with explicit state semantics and factual selected-date counts", async () => {
    const onOpenSession = jest.fn();
    await renderCalendar({ onOpenSession });

    expect(await screen.findByRole("header", { name: "Calendar" }))
      .toBeOnTheScreen();
    expect(screen.getByText("August 2026")).toBeOnTheScreen();
    expect(screen.getAllByText("Sun")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "24 August 2026. Completed. Manual. Today." }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "25 August 2026. Partial. Planned, not completed." }))
      .toBeOnTheScreen();
    expect(screen.getByText("Completed · Manual · Today")).toBeOnTheScreen();
    expect(screen.getByText("Full Body Foundation · Full Body A"))
      .toBeOnTheScreen();
    expect(screen.getByText("Exercises · 1/2 (50%)")).toBeOnTheScreen();
    expect(screen.getByText("Working sets · 2/3 (67%)")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: /Open workout details for Full Body Foundation/u,
    }));
    expect(onOpenSession).toHaveBeenCalledWith("session-1");
  });

  it("loads the selected civil date after month navigation without Date-only conversion", async () => {
    const loadCalendarMonth = jest.fn(async (input: Readonly<{
      month: string;
      selectedDate: string;
    }>) => month({
      month: input.month as CalendarMonth["month"],
      selectedDate: input.selectedDate as CalendarMonth["selectedDate"],
      days: [],
      sessions: [],
    }));
    await renderCalendar({ loadCalendarMonth });
    await screen.findByText("August 2026");

    await fireEvent.press(screen.getByRole("button", {
      name: "Show September 2026",
    }));

    await waitFor(() => expect(loadCalendarMonth).toHaveBeenLastCalledWith({
      month: "2026-09-01",
      selectedDate: "2026-09-24",
      today: "2026-08-24",
    }));
    expect(screen.getByText("September 2026")).toBeOnTheScreen();
    expect(screen.getByText("No sessions on 24 September 2026"))
      .toBeOnTheScreen();
  });

  it("renders six full weeks with selectable adjacent civil dates", async () => {
    const loadCalendarMonth = jest.fn(async (input: Readonly<{
      month: string;
      selectedDate: string;
    }>) => month({
      month: input.month as CalendarMonth["month"],
      selectedDate: input.selectedDate as CalendarMonth["selectedDate"],
      days: [],
      sessions: [],
    }));
    await renderCalendar({ loadCalendarMonth });
    await screen.findByText("August 2026");

    expect(screen.getAllByTestId(/^calendar-day-/u)).toHaveLength(42);
    expect(screen.getByRole("button", {
      name: "26 July 2026. Adjacent month.",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      selected: false,
    }));
    expect(screen.getByRole("button", {
      name: "5 September 2026. Adjacent month.",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      selected: false,
    }));

    await fireEvent.press(screen.getByRole("button", {
      name: "5 September 2026. Adjacent month.",
    }));

    await waitFor(() => expect(loadCalendarMonth).toHaveBeenLastCalledWith({
      month: "2026-09-01",
      selectedDate: "2026-09-05",
      today: "2026-08-24",
    }));
    expect(screen.getByText("September 2026")).toBeOnTheScreen();
    expect(screen.getByText("No sessions on 5 September 2026"))
      .toBeOnTheScreen();
  });

  it("gives buttons, keyboard, and horizontal swipe directions identical month transitions", async () => {
    const loadCalendarMonth = jest.fn(async (input: Readonly<{
      month: string;
      selectedDate: string;
    }>) => month({
      month: input.month as CalendarMonth["month"],
      selectedDate: input.selectedDate as CalendarMonth["selectedDate"],
      days: [],
      sessions: [],
    }));
    await renderCalendar({ loadCalendarMonth });
    await screen.findByText("August 2026");

    await fireEvent.press(screen.getByRole("button", {
      name: "Show September 2026",
    }));
    await waitFor(() => expect(loadCalendarMonth).toHaveBeenLastCalledWith({
      month: "2026-09-01",
      selectedDate: "2026-09-24",
      today: "2026-08-24",
    }));

    await fireEvent(screen.getByRole("button", {
      name: "Show August 2026",
    }), "keyDown", { nativeEvent: { key: "Enter" } });
    await waitFor(() => expect(loadCalendarMonth).toHaveBeenLastCalledWith({
      month: "2026-08-01",
      selectedDate: "2026-08-24",
      today: "2026-08-24",
    }));

    expect(calendarMonthDirectionForHorizontalSwipe(-96)).toBe(1);
    expect(calendarMonthDirectionForHorizontalSwipe(96)).toBe(-1);
    expect(calendarMonthDirectionForHorizontalSwipe(24)).toBeNull();
  });

  it("keeps a complete civil grid within the supported LocalDate range", async () => {
    const loadCalendarMonth = jest.fn(async (input: Readonly<{
      month: string;
      selectedDate: string;
    }>) => month({
      month: input.month as CalendarMonth["month"],
      selectedDate: input.selectedDate as CalendarMonth["selectedDate"],
      days: [],
      sessions: [],
    }));
    await renderCalendar({
      initialDate: "0001-01-01",
      loadCalendarMonth,
      today: "0001-01-01",
    });

    await screen.findByText("January 0001");
    expect(screen.getAllByTestId(/^calendar-day-/u)).toHaveLength(42);
    expect(screen.getByTestId("calendar-day-unavailable-0")).toBeOnTheScreen();
    expect(screen.getByTestId("calendar-day-unavailable-0"))
      .toHaveProp("accessible", false);
    expect(screen.getByRole("button", {
      name: "1 January 0001.",
    })).toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Previous month unavailable",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: true,
    }));
    expect(screen.getByRole("button", {
      name: "Show February 0001",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: false,
    }));
  });

  it("keeps a complete civil grid at the upper LocalDate boundary", async () => {
    const loadCalendarMonth = jest.fn(async (input: Readonly<{
      month: string;
      selectedDate: string;
    }>) => month({
      month: input.month as CalendarMonth["month"],
      selectedDate: input.selectedDate as CalendarMonth["selectedDate"],
      days: [],
      sessions: [],
    }));
    await renderCalendar({
      initialDate: "9999-12-31",
      loadCalendarMonth,
      today: "9999-12-31",
    });

    await screen.findByText("December 9999");
    expect(screen.getAllByTestId(/^calendar-day-/u)).toHaveLength(42);
    expect(screen.getByRole("button", {
      name: "31 December 9999.",
    })).toBeOnTheScreen();
    expect(screen.getByTestId("calendar-day-unavailable-41")).toBeOnTheScreen();
    expect(screen.getByTestId("calendar-day-unavailable-41"))
      .toHaveProp("accessible", false);
    expect(screen.getByRole("button", {
      name: "Show November 9999",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: false,
    }));
    expect(screen.getByRole("button", {
      name: "Next month unavailable",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: true,
    }));
  });

  it("renders retryable loading and error states without erasing the current grid", async () => {
    let attempt = 0;
    const loadCalendarMonth = jest.fn(async (): Promise<CalendarMonth> => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("storage unavailable");
      }
      return month({ days: [], sessions: [] });
    });
    await renderCalendar({ loadCalendarMonth });

    expect(await screen.findByRole("header", {
      name: "Calendar could not be loaded",
    })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry Calendar" }));

    expect(await screen.findByText("No sessions on 24 August 2026"))
      .toBeOnTheScreen();
    expect(loadCalendarMonth).toHaveBeenCalledTimes(2);
  });

  async function expectCardSurface(
    appearance: "Light" | "Dark",
    colors: typeof themes.light | typeof themes.dark,
  ) {
    const store = {
      ...createMemoryAppearanceStore(),
      read: () => appearance,
    };
    await renderCalendar({}, store);

    expect(await screen.findByTestId("calendar-session-card-session-1"))
      .toHaveStyle({
        backgroundColor: colors.contentCard,
        borderColor: colors.contentCardBorder,
      });
  }

  it("uses the shared inverse card surface in Light appearance", async () => {
    await expectCardSurface("Light", themes.light);
  });

  it("uses the shared inverse card surface in Dark appearance", async () => {
    await expectCardSurface("Dark", themes.dark);
  });
});
