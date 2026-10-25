import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { StyleSheet } from "react-native";
import * as ReactNative from "react-native";
import { Gesture } from "react-native-gesture-handler";

import type { CalendarRange, CalendarReadPort } from "../calendar/calendarPorts";
import { CalendarScreen } from "../screens/CalendarScreen";
import { createCalendarTransitionState, transitionCalendar } from "../calendar/calendarTransitionController";
import { AppearanceProvider } from "../theme";

const emptyRange: CalendarRange = { days: [], events: [] };
const picker = () => within(screen.getByTestId("calendar-month-picker"));

async function renderCalendar(initialDate = "2024-01-31", reducedMotion = true) {
  const loadCalendarRange = jest.fn(async (_input: Parameters<CalendarReadPort["loadCalendarRange"]>[0]) => emptyRange);
  await render(
    <AppearanceProvider reduceMotion={reducedMotion}>
      <CalendarScreen initialDate={initialDate} loadCalendarRange={loadCalendarRange} onOpenEvent={jest.fn()} />
    </AppearanceProvider>,
  );
  await screen.findByTestId("calendar-month-viewport");
  return loadCalendarRange;
}

describe("Calendar phone navigation", () => {
  it("gives the empty month a full-height primary region before its absolute panels lay out", async () => {
    await renderCalendar();
    // The Calendar's scroll viewport is clipped by this ancestor. Without flex,
    // Yoga gives it zero height even though all date cells are in the host tree.
    expect(StyleSheet.flatten(screen.getByTestId("adaptive-primary-region").props.style).flex).toBe(1);
    expect(screen.getByTestId("calendar-vertical-scroll")).toHaveStyle({ flex: 1 });
    expect(screen.getByRole("button", { name: /^31 January 2024/u })).toBeOnTheScreen();
  });

  it("jumps directly to a month and year while clamping the selected civil day", async () => {
    const load = await renderCalendar();
    await fireEvent.press(screen.getByRole("button", { name: "Choose month and year, January 2024" }));
    await fireEvent.press(picker().getByRole("button", { name: "Show February 2024" }));
    await screen.findByText("February 2024");
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: /29 February 2024/u })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));

    await fireEvent.press(screen.getByRole("button", { name: "Choose month and year, February 2024" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose year, 2024" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose 2025" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show February 2025" }));
    await screen.findByText("February 2025");
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("button", { name: /28 February 2025/u })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
    for (const [request] of load.mock.calls) {
      expect(request).toEqual({ startLocalDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u), endLocalDateExclusive: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u) });
    }
  });

  it("replaces a distant focused month directly and invalidates stale settle callbacks", () => {
    const initial = createCalendarTransitionState({ currentMonthId: "2024-01", selectedLocalDate: "2024-01-31", reducedMotion: false });
    const focused = { ...initial, mode: "focused" as const };
    const jumped = transitionCalendar(focused, { type: "jump", localDate: "2030-02-28" });
    expect(jumped.commands).toEqual([]);
    expect(jumped.state).toMatchObject({ currentMonthId: "2030-02", selectedLocalDate: "2030-02-28", mode: "month", phase: "idle", epoch: 1 });
    expect(transitionCalendar(jumped.state, { type: "settle-complete", epoch: 0 }).state).toBe(jumped.state);
    const settling = { ...focused, phase: "settling" as const };
    expect(transitionCalendar(settling, { type: "jump", localDate: "2030-02-28" }).state).toBe(settling);
    expect(() => transitionCalendar(initial, { type: "jump", localDate: "2030-02-30" })).toThrow("local_date_invalid");
  });

  it("keeps complete month names and scaled touch targets while paging years on a narrow phone", async () => {
    const dimensions = jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({ width: 360, height: 800, fontScale: 2, scale: 1 });
    try {
      const load = await renderCalendar();
      await fireEvent.press(screen.getByRole("button", { name: "Choose month and year, January 2024" }));
      const september = picker().getByRole("button", { name: "Show September 2024" });
      expect(september).toHaveStyle({ minHeight: 48 });
      expect(september.parent?.children).toHaveLength(1);
      expect(picker().getByText("September").props.allowFontScaling).not.toBe(false);
      await fireEvent.press(picker().getByRole("button", { name: "Choose year, 2024" }));
      await fireEvent.press(picker().getByRole("button", { name: "Show later years" }));
      await fireEvent.press(picker().getByRole("button", { name: "Choose 2035" }));
      await fireEvent.press(picker().getByRole("button", { name: "Show September 2035" }));
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId("calendar-month-title")).toHaveTextContent("September 2035");
      expect(screen.getByRole("button", { name: /^30 September 2035/u })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
    } finally {
      dimensions.mockRestore();
    }
  });

  it("cancels a draft year and keeps the current month and selection", async () => {
    const load = await renderCalendar();
    await fireEvent.press(screen.getByRole("button", { name: "Choose month and year, January 2024" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose year, 2024" }));
    await fireEvent.press(screen.getByRole("button", { name: "Choose 2025" }));
    await fireEvent.press(screen.getByRole("button", { name: "Close month and year picker" }));
    expect(screen.getByTestId("calendar-month-title")).toHaveTextContent("January 2024");
    expect(load).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Choose month and year, January 2024" }));
    expect(screen.getByRole("button", { name: "Show January 2024" })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
  });

  it("swipes both directions through the existing controller and keeps selected dates date-only", async () => {
    const createPan = Gesture.Pan.bind(Gesture);
    let latestPan: ReturnType<typeof Gesture.Pan> | undefined;
    const panSpy = jest.spyOn(Gesture, "Pan").mockImplementation(() => {
      latestPan = createPan();
      return latestPan;
    });
    try {
      const load = await renderCalendar("2024-01-31", false);
      await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", {
        nativeEvent: { layout: { height: 420, width: 360, x: 0, y: 0 } },
      });
      const swipe = async (dx: number) => {
        const handlers = (latestPan as unknown as { handlers: { onStart(): void; onEnd(event: { translationX: number; translationY: number }): void } }).handlers;
        await act(async () => {
          handlers.onStart();
          handlers.onEnd({ translationX: dx, translationY: 0 });
        });
      };
      await swipe(-100);
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId("calendar-month-title")).toHaveTextContent("February 2024");
      expect(screen.getByRole("button", { name: /29 February 2024/u })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
      await swipe(100);
      await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
      expect(screen.getByTestId("calendar-month-title")).toHaveTextContent("January 2024");
      expect(screen.getByRole("button", { name: /29 January 2024/u })).toHaveProp("accessibilityState", expect.objectContaining({ selected: true }));
    } finally {
      panSpy.mockRestore();
    }
  });
});
