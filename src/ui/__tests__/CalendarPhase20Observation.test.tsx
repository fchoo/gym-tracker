import { fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { View } from "react-native";
import { Gesture } from "react-native-gesture-handler";

import * as Observation from "../../bootstrap/phase20CalendarObservation";
import type { LocalDate } from "../../domains/scheduling";
import { CalendarMonthViewport } from "../calendar/CalendarMonthViewport";
import { createCalendarTransitionState } from "../calendar/calendarTransitionController";

const initial = createCalendarTransitionState({
  currentMonthId: "2026-10",
  selectedLocalDate: "2026-10-15",
  reducedMotion: false,
});

describe("CalendarMonthViewport Phase 20 observation wiring", () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it("records actual gesture-worklet callbacks and measured viewport geometry without driving input", async () => {
    const recordPointer = jest.spyOn(Observation, "recordPhase20CalendarPointer");
    const recordInputAttempt = jest.spyOn(Observation, "recordPhase20CalendarInputAttempt");
    const recordViewport = jest.spyOn(Observation, "recordPhase20CalendarViewport");
    const createPan = Gesture.Pan.bind(Gesture);
    let latestPan: unknown;
    jest.spyOn(Gesture, "Pan").mockImplementation(() => {
      latestPan = createPan();
      return latestPan as ReturnType<typeof Gesture.Pan>;
    });
    const onRelease = jest.fn();

    await render(
      <CalendarMonthViewport
        command={null}
        focusedWeek={null}
        layoutGeneration={7}
        month={"2026-10-01" as LocalDate}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        onPreview={jest.fn()}
        onRelease={onRelease}
        renderMonth={() => <View />}
        renderWeek={() => <View />}
        transition={initial}
      />,
    );
    const viewport = screen.getByTestId("calendar-month-viewport");
    await fireEvent(viewport, "layout", {
      nativeEvent: { layout: { height: 560, width: 354, x: 0, y: 0 } },
    });
    await fireEvent(viewport, "touchStart", {
      nativeEvent: { touches: [{ pageX: 300, pageY: 220 }] },
    });
    const handlers = (latestPan as { handlers: {
      onTouchesDown?: (event: Readonly<{ allTouches: readonly Readonly<{ absoluteX: number; absoluteY: number }>[] }>) => void;
      onTouchesMove?: (event: Readonly<{ allTouches: readonly Readonly<{ absoluteX: number; absoluteY: number }>[] }>, manager: Readonly<{ activate(): void; fail(): void }>) => void;
      onStart?: () => void;
      onChange?: (event: Readonly<{ translationX: number; translationY: number; absoluteX?: number; absoluteY?: number }>) => void;
      onEnd?: (event: Readonly<{ translationX: number; translationY: number; absoluteX?: number; absoluteY?: number }>) => void;
      onFinalize?: (_event: unknown, success: boolean) => void;
    } }).handlers;
    const manager = { activate: jest.fn(), fail: jest.fn() };

    handlers.onTouchesDown?.({ allTouches: [{ absoluteX: 300, absoluteY: 220 }] });
    handlers.onTouchesMove?.({ allTouches: [{ absoluteX: 211.5, absoluteY: 220 }] }, manager);
    expect(handlers.onStart).toEqual(expect.any(Function));
    handlers.onStart?.();
    handlers.onChange?.({ translationX: -88.5, translationY: 0, absoluteX: 211.5, absoluteY: 220 });
    handlers.onEnd?.({ translationX: -88.5, translationY: 0, absoluteX: 211.5, absoluteY: 220 });
    handlers.onFinalize?.({}, true);

    expect(recordViewport).toHaveBeenCalledWith({ widthDp: 354, heightDp: 560, orientation: "portrait", layoutGeneration: 7 });
    expect(recordInputAttempt).toHaveBeenCalledWith({ xDp: 300, yDp: 220, transitionPhase: "idle", callbackGeneration: 0 });
    expect(recordPointer.mock.calls.map(([event]) => event.callback)).toEqual([
      "onTouchesDown", "onTouchesMove", "onBegin", "onChange", "onEnd", "onFinalize",
    ]);
    expect(recordPointer).toHaveBeenCalledWith(expect.objectContaining({
      callback: "onChange",
      dxDp: -88.5,
      viewportWidthDp: 354,
    }));
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("leaves vertical intent to scrolling without cancelling a drag that never activated", async () => {
    const recordPointer = jest.spyOn(Observation, "recordPhase20CalendarPointer");
    const createPan = Gesture.Pan.bind(Gesture);
    let latestPan: unknown;
    jest.spyOn(Gesture, "Pan").mockImplementation(() => {
      latestPan = createPan();
      return latestPan as ReturnType<typeof Gesture.Pan>;
    });

    const onCancel = jest.fn();
    const onRelease = jest.fn();
    await render(
      <CalendarMonthViewport
        command={null}
        focusedWeek={null}
        month={"2026-10-01" as LocalDate}
        onCancel={onCancel}
        onComplete={jest.fn()}
        onPreview={jest.fn()}
        onRelease={onRelease}
        renderMonth={() => <View />}
        renderWeek={() => <View />}
        transition={initial}
      />,
    );
    await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", {
      nativeEvent: { layout: { height: 560, width: 354, x: 0, y: 0 } },
    });
    const handlers = (latestPan as { handlers: {
      onTouchesDown?: (event: Readonly<{ allTouches: readonly Readonly<{ absoluteX: number; absoluteY: number }>[] }>) => void;
      onTouchesMove?: (event: Readonly<{ allTouches: readonly Readonly<{ absoluteX: number; absoluteY: number }>[] }>, manager: Readonly<{ activate(): void; fail(): void }>) => void;
      onFinalize?: (_event: unknown, success: boolean) => void;
    } }).handlers;
    const manager = { activate: jest.fn(), fail: jest.fn() };

    handlers.onTouchesDown?.({ allTouches: [{ absoluteX: 200, absoluteY: 100 }] });
    handlers.onTouchesMove?.({ allTouches: [{ absoluteX: 190, absoluteY: 170 }] }, manager);
    handlers.onFinalize?.({}, false);

    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(recordPointer).toHaveBeenLastCalledWith(expect.objectContaining({
      callback: "onTouchesMove",
      phase: "intent",
      intentOwner: "vertical",
    }));
    expect(recordPointer.mock.calls.some(([event]) => event.callback === "onEnd")).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled();
  });
});
