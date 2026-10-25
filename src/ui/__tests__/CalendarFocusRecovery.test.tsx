import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { View } from "react-native";
import * as Reanimated from "react-native-reanimated";
import { CalendarMonthViewport } from "../calendar/CalendarMonthViewport";
import { createCalendarTransitionState } from "../calendar/calendarTransitionController";

describe("Calendar focused day completion", () => {
  it("does not restart a week transition just because its parent supplies a new completion callback", async () => {
    const timing = jest.spyOn(Reanimated, "withTiming");
    const animatedRefs: Array<ReturnType<typeof Reanimated.useAnimatedRef>> = [];
    let refIndex = 0;
    const stableNativeRefs = jest.spyOn(Reanimated, "useAnimatedRef").mockImplementation(() => {
      const index = refIndex++ % 6;
      return animatedRefs[index] ?? (animatedRefs[index] = { current: null } as ReturnType<typeof Reanimated.useAnimatedRef>);
    });
    try {
      const command = { kind: "settle-week", phase: "collapse", epoch: 5, durationMs: 240, easing: [0.4, 0, 0.78, 0.2], agendaDelayMs: 0, agendaDurationMs: 140 } as const;
      const props = {
        command, focusedWeek: { selectedDates: ["2026-10-26"], followingDates: ["2026-11-02"], selectedGeometry: { y: 280, height: 70, generation: 0 }, followingGeometry: null },
        month: "2026-10-01", onCancel: jest.fn(), onPreview: jest.fn(), onRelease: jest.fn(),
        renderMonth: () => <View />, renderWeek: () => <View />,
        transition: { ...createCalendarTransitionState({ currentMonthId: "2026-10", selectedLocalDate: "2026-10-31", reducedMotion: false }), mode: "month", phase: "settling", epoch: 5 },
      } as const;
      const rendered = await render(<CalendarMonthViewport {...props} onComplete={jest.fn()} />);
      const animations = timing.mock.calls.length;
      await rendered.rerender(<CalendarMonthViewport {...props} onComplete={jest.fn()} />);
      expect(timing.mock.calls.length).toBe(animations);
    } finally { timing.mockRestore(); stableNativeRefs.mockRestore(); }
  });
  it("completes an expansion at the last month row when the following row has no month measurement", async () => {
    const completed = jest.fn();
    const command = { kind: "settle-week", phase: "expand", epoch: 4, durationMs: 260, easing: [0.22, 0.8, 0.3, 1], agendaDelayMs: 70, agendaDurationMs: 170 } as const;
    await render(<CalendarMonthViewport
      command={command}
      focusedWeek={{ selectedDates: ["2026-10-26"], followingDates: ["2026-11-02"], selectedGeometry: { y: 280, height: 70, generation: 0 }, followingGeometry: null }}
      month="2026-10-01"
      onCancel={jest.fn()} onComplete={completed} onPreview={jest.fn()} onRelease={jest.fn()}
      renderMonth={() => <View />} renderWeek={() => <View />}
      transition={{ ...createCalendarTransitionState({ currentMonthId: "2026-10", selectedLocalDate: "2026-10-31", reducedMotion: false }), mode: "focused", phase: "settling", epoch: 4 }}
    />);
    await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 500 } } });
    expect(completed).toHaveBeenCalledWith(4);
  });
});
