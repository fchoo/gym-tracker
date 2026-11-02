import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { View } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";

import type { LocalDate } from "../../domains/scheduling";
import {
  clearPhase16CalendarTestControls,
  configurePhase16CalendarTestControls,
  readPhase16CalendarActiveTrace,
} from "../../bootstrap/phase16CalendarTestControls";

import {
  CalendarTransitionError,
  clampMonthDrag,
  createCalendarTransitionState,
  crossesMonthBoundary,
  transitionCalendar,
} from "../calendar/calendarTransitionController";
import {
  calendarMonthPanEnabled,
  calendarPanelTranslate,
  calendarViewportWidthForSafeWidth,
  calendarWeekGeometryForGeneration,
  CalendarMonthViewport,
  calendarAgendaMotion,
  calendarDragDiagnosticMonths,
  calendarFocusedAgendaMinimumHeight,
} from "../calendar/CalendarMonthViewport";
import { calendarTrackMetrics } from "../calendar/CalendarWeekRow";

const initial = (reducedMotion = false) => createCalendarTransitionState({
  currentMonthId: "2026-11",
  selectedLocalDate: "2026-11-01",
  reducedMotion,
});

describe("Calendar semantic transitions", () => {
  it("grows fixed-top Calendar tracks at 200 percent text without shrinking the target", () => {
    expect(calendarTrackMetrics(1)).toEqual({ chipMinHeight: 17, dateTrackMinHeight: 28, eventTrackMinHeight: 36, rowMinHeight: 70 });
    expect(calendarTrackMetrics(2)).toEqual({ chipMinHeight: 32, dateTrackMinHeight: 50, eventTrackMinHeight: 66, rowMinHeight: 122 });
    expect(calendarFocusedAgendaMinimumHeight(1)).toBe(234);
    expect(calendarFocusedAgendaMinimumHeight(2)).toBe(374);
  });

  it("keeps week rows opaque and applies the contract timing only to the agenda", () => {
    expect(calendarAgendaMotion({ phase: "expand", agendaDelayMs: 70, agendaDurationMs: 170 })).toEqual({ delayMs: 70, durationMs: 170, opacity: 1 });
    expect(calendarAgendaMotion({ phase: "collapse", agendaDelayMs: 0, agendaDurationMs: 140 })).toEqual({ delayMs: 0, durationMs: 140, opacity: 0 });
  });

  it("previews only the title month while drag semantics remain committed", () => {
    const current = "2026-11-01" as LocalDate;
    const previous = "2026-10-01" as LocalDate;
    const next = "2026-12-01" as LocalDate;
    expect(calendarDragDiagnosticMonths(current, previous, next, 1)).toEqual({ semanticMonth: "2026-11", titleMonth: "2026-12" });
    expect(calendarDragDiagnosticMonths(current, previous, next, -1)).toEqual({ semanticMonth: "2026-11", titleMonth: "2026-10" });
    expect(calendarDragDiagnosticMonths(current, previous, next, 0)).toEqual({ semanticMonth: "2026-11", titleMonth: "2026-11" });
  });

  it("keeps a second pan from invalidating an active settle", () => {
    expect(calendarMonthPanEnabled("idle")).toBe(true);
    expect(calendarMonthPanEnabled("dragging")).toBe(true);
    expect(calendarMonthPanEnabled("settling")).toBe(false);
    expect(calendarMonthPanEnabled("adjacent-collapsing")).toBe(false);
    expect(calendarMonthPanEnabled("adjacent-measuring")).toBe(false);
    expect(calendarMonthPanEnabled("adjacent-expanding")).toBe(false);
  });

  it("accepts only row geometry measured for the current layout generation", () => {
    const current = Object.freeze({ y: 96, height: 72, generation: 4 });
    expect(calendarWeekGeometryForGeneration(current, 4)).toBe(current);
    expect(calendarWeekGeometryForGeneration(current, 5)).toBeNull();
    expect(calendarWeekGeometryForGeneration(null, 4)).toBeNull();
  });

  it("mounts the viewport with its pan disabled for the full settle lifetime", async () => {
    const createPan = Gesture.Pan.bind(Gesture);
    let latestPan: unknown;
    const panSpy = jest.spyOn(Gesture, "Pan").mockImplementation(() => {
      latestPan = createPan();
      return latestPan as ReturnType<typeof Gesture.Pan>;
    });
    const settling = Object.freeze({ ...initial(), phase: "settling" as const });

    await render(
      <CalendarMonthViewport
        command={null}
        focusedWeek={null}
        month={"2026-11-01" as LocalDate}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        onPreview={jest.fn()}
        onRelease={jest.fn()}
        renderMonth={() => <View />}
        renderWeek={() => <View />}
        transition={settling}
      />,
    );

    expect((latestPan as { config: { enabled?: boolean } }).config.enabled).toBe(false);
    panSpy.mockRestore();
  });

  it("closes the UI-thread settle latch before a second touch can cancel completion", async () => {
    const createPan = Gesture.Pan.bind(Gesture);
    let latestPan: unknown;
    const panSpy = jest.spyOn(Gesture, "Pan").mockImplementation(() => {
      latestPan = createPan();
      return latestPan as ReturnType<typeof Gesture.Pan>;
    });
    const onComplete = jest.fn();
    const onRelease = jest.fn();
    const common = {
      command: null,
      focusedWeek: null,
      month: "2026-11-01" as LocalDate,
      onCancel: jest.fn(),
      onComplete,
      onPreview: jest.fn(),
      onRelease,
      renderMonth: () => <View />,
      renderWeek: () => <View />,
    } as const;
    const rendered = await render(<CalendarMonthViewport {...common} transition={initial()} />);
    await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", {
      nativeEvent: { layout: { height: 500, width: 400, x: 0, y: 0 } },
    });
    const handlers = (latestPan as { handlers: {
      onStart?: () => void;
      onEnd?: (event: Readonly<{ translationX: number; translationY: number }>, success: boolean) => void;
    } }).handlers;

    handlers.onStart?.();
    handlers.onEnd?.({ translationX: -100, translationY: 0 }, true);
    handlers.onStart?.();
    handlers.onEnd?.({ translationX: -140, translationY: 0 }, true);

    expect(onRelease).toHaveBeenCalledTimes(1);
    await rendered.rerender(
      <CalendarMonthViewport
        {...common}
        command={{ kind: "settle-month", epoch: 1, fromOffset: -0.25, toOffset: -1, durationMs: 240, easing: [0.22, 0.8, 0.3, 1] }}
        transition={Object.freeze({ ...initial(), currentMonthId: "2026-12", phase: "settling" as const, epoch: 1 })}
      />,
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(1);
    panSpy.mockRestore();
  });

  it("falls back after a lost settle callback and ignores its late duplicate", async () => {
    jest.useFakeTimers();
    let animationCompletion: ((finished: boolean) => void) | undefined;
    const timing = jest.spyOn(Reanimated, "withTiming").mockImplementation((toValue, _config, callback) => {
      animationCompletion = callback;
      return toValue as never;
    });
    const onComplete = jest.fn();
    try {
      const common = {
        focusedWeek: null,
        month: "2026-11-01" as LocalDate,
        onCancel: jest.fn(),
        onComplete,
        onPreview: jest.fn(),
        onRelease: jest.fn(),
        renderMonth: () => <View />,
        renderWeek: () => <View />,
        transition: Object.freeze({ ...initial(), currentMonthId: "2026-12", phase: "settling" as const, epoch: 1 }),
      } as const;
      const rendered = await render(<CalendarMonthViewport {...common} command={null} />);
      await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", {
        nativeEvent: { layout: { height: 500, width: 400, x: 0, y: 0 } },
      });
      await rendered.rerender(
        <CalendarMonthViewport
          {...common}
          command={{ kind: "settle-month", epoch: 1, fromOffset: -0.25, toOffset: -1, durationMs: 240, easing: [0.22, 0.8, 0.3, 1] }}
        />,
      );
      expect(onComplete).not.toHaveBeenCalled();

      jest.advanceTimersByTime(272);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(1);
      animationCompletion?.(true);
      expect(onComplete).toHaveBeenCalledTimes(1);
      rendered.unmount();
    } finally {
      timing.mockRestore();
      jest.useRealTimers();
    }
  });

  it("delivers one week-settle navigation for one active epoch across effect replays", async () => {
    const onComplete = jest.fn();
    const common = {
      focusedWeek: {
        selectedDates: ["2026-11-02" as LocalDate],
        followingDates: ["2026-11-09" as LocalDate],
        selectedGeometry: { y: 70, height: 70, generation: 0 },
        followingGeometry: { y: 140, height: 70, generation: 0 },
      },
      month: "2026-11-01" as LocalDate,
      onCancel: jest.fn(),
      onComplete,
      onPreview: jest.fn(),
      onRelease: jest.fn(),
      renderMonth: () => <View />,
      renderWeek: () => <View />,
      transition: Object.freeze({ ...initial(), mode: "focused" as const, phase: "settling" as const, epoch: 1 }),
    } as const;
    const command = { kind: "settle-week", epoch: 1, phase: "expand", durationMs: 260, easing: [0.22, 0.8, 0.3, 1], agendaDelayMs: 70, agendaDurationMs: 170 } as const;
    const rendered = await render(<CalendarMonthViewport {...common} command={command} />);
    await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", {
      nativeEvent: { layout: { height: 500, width: 400, x: 0, y: 0 } },
    });
    await rendered.rerender(<CalendarMonthViewport {...common} command={command} />);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(1);
  });

  it("arbitrates touch intent, publishes drag markers, and cancels an unfinished gesture", async () => {
    const createPan = Gesture.Pan.bind(Gesture);
    let latestPan: unknown;
    const panSpy = jest.spyOn(Gesture, "Pan").mockImplementation(() => {
      latestPan = createPan();
      return latestPan as ReturnType<typeof Gesture.Pan>;
    });
    const onCancel = jest.fn();
    const onPreview = jest.fn();
    await render(
      <CalendarMonthViewport
        command={null}
        focusedWeek={null}
        month={"2026-11-01" as LocalDate}
        onCancel={onCancel}
        onComplete={jest.fn()}
        onPreview={onPreview}
        onRelease={jest.fn()}
        renderMonth={() => <View />}
        renderWeek={() => <View />}
        transition={initial()}
      />,
    );
    await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", {
      nativeEvent: { layout: { height: 500, width: 400, x: 0, y: 0 } },
    });
    const handlers = (latestPan as { handlers: {
      onTouchesDown?: (event: Readonly<{ allTouches: readonly Readonly<{ absoluteX: number; absoluteY: number }>[] }>) => void;
      onTouchesMove?: (event: Readonly<{ allTouches: readonly Readonly<{ absoluteX: number; absoluteY: number }>[] }>, manager: Readonly<{ activate(): void; fail(): void }>) => void;
      onStart?: () => void;
      onChange?: (event: Readonly<{ translationX: number }>) => void;
      onFinalize?: () => void;
    } }).handlers;
    const manager = { activate: jest.fn(), fail: jest.fn() };
    handlers.onTouchesDown?.({ allTouches: [{ absoluteX: 200, absoluteY: 100 }] });
    handlers.onTouchesMove?.({ allTouches: [{ absoluteX: 210, absoluteY: 101 }] }, manager);
    expect(manager.activate).toHaveBeenCalledTimes(1);
    handlers.onTouchesDown?.({ allTouches: [{ absoluteX: 200, absoluteY: 100 }] });
    handlers.onTouchesMove?.({ allTouches: [{ absoluteX: 202, absoluteY: 110 }] }, manager);
    expect(manager.fail).toHaveBeenCalledTimes(1);
    handlers.onStart?.();
    handlers.onChange?.({ translationX: -100 });
    expect(onPreview).toHaveBeenCalledWith(-100, 400);
    handlers.onFinalize?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
    panSpy.mockRestore();
  });

  it.each([
    ["drag-retreat", ["drag", "drag", "release"]],
    ["drag-cancel", ["drag", "cancel"]],
  ] as ["drag-retreat" | "drag-cancel", readonly ("drag" | "release" | "cancel")[]][])("drives %s through the mounted gesture callbacks as one trace", async (diagnosticStage, expectedKinds) => {
    const now = 1_800_000_000_000;
    configurePhase16CalendarTestControls({
      packageName: "com.fchoo.gymtracker.devtest",
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "phase16-calendar",
      stage: diagnosticStage,
      nowMs: () => now,
      traceNonce: `p16trace-${diagnosticStage}`,
      emitLine: () => undefined,
    });
    const onCancel = jest.fn();
    const onPreview = jest.fn();
    const onRelease = jest.fn();
    try {
      await render(
        <CalendarMonthViewport
          command={null}
          diagnosticStage={diagnosticStage}
          focusedWeek={null}
          month={"2026-11-01" as LocalDate}
          onCancel={onCancel}
          onComplete={jest.fn()}
          onPreview={onPreview}
          onRelease={onRelease}
          renderMonth={() => <View />}
          renderWeek={() => <View />}
          transition={initial()}
        />,
      );
      await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", {
        nativeEvent: { layout: { height: 500, width: 400, x: 0, y: 0 } },
      });
      const trace = readPhase16CalendarActiveTrace();
      expect(trace?.samples.map(({ kind }) => kind)).toEqual(expectedKinds);
      expect(trace?.samples.map(({ elapsedMs }) => elapsedMs)).toEqual(expectedKinds.map((_, index) => index));
      const validator = pathToFileURL(path.resolve("scripts/compare-v12-calendar.mjs")).href;
      expect(execFileSync(process.execPath, [
        "--input-type=module",
        "--eval",
        `import { validateV12CalendarStageTrace } from ${JSON.stringify(validator)}; process.stdout.write(String(validateV12CalendarStageTrace(JSON.parse(process.argv[2]))));`,
        path.resolve("package.json"),
        JSON.stringify(trace),
      ], { encoding: "utf8" })).toBe("true");
      if (diagnosticStage === "drag-retreat") {
        expect(onPreview).toHaveBeenNthCalledWith(1, -100.4, 400);
        expect(onPreview).toHaveBeenNthCalledWith(2, -40, 400);
        expect(onRelease).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
      } else {
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onRelease).not.toHaveBeenCalled();
      }
    } finally {
      clearPhase16CalendarTestControls();
    }
  });

  it.each(([360, 390] as const).flatMap((safeWidth) => ([
    "drag-forward-24_9",
    "drag-forward-25",
    "drag-forward-25_1",
    "drag-backward-24_9",
    "drag-backward-25",
    "drag-backward-25_1",
  ] as const).map((diagnosticStage) => [safeWidth, diagnosticStage] as const)))(
    "drives %sdp %s against the actual inset viewport",
    async (safeWidth, diagnosticStage) => {
      const viewportWidth = calendarViewportWidthForSafeWidth(safeWidth);
      expect(viewportWidth).toBe(safeWidth === 360 ? 348 : 354);
      configurePhase16CalendarTestControls({
        packageName: "com.fchoo.gymtracker.devtest",
        buildProfile: "development-test",
        nativeContractsEnabled: true,
        suite: "phase16-calendar",
        stage: diagnosticStage,
        nowMs: () => 1_800_000_000_000,
        traceNonce: `p16trace-${diagnosticStage.replaceAll("_", "-")}-${safeWidth}`,
        emitLine: () => undefined,
      });
      const rendered = await render(
        <CalendarMonthViewport
          command={null}
          diagnosticStage={diagnosticStage}
          focusedWeek={null}
          month={"2026-11-01" as LocalDate}
          onCancel={jest.fn()}
          onComplete={jest.fn()}
          onPreview={jest.fn()}
          onRelease={jest.fn()}
          renderMonth={() => <View />}
          renderWeek={() => <View />}
          transition={initial()}
        />,
      );
      await fireEvent(rendered.getByTestId("calendar-month-viewport"), "layout", {
        nativeEvent: { layout: { height: 500, width: viewportWidth, x: 0, y: 0 } },
      });
      const trace = readPhase16CalendarActiveTrace();
      expect(trace?.samples.map(({ kind }) => kind)).toEqual(["drag", "release"]);
      const validator = pathToFileURL(path.resolve("scripts/compare-v12-calendar.mjs")).href;
      expect(execFileSync(process.execPath, [
        "--input-type=module",
        "--eval",
        `import { validateV12CalendarStageTrace } from ${JSON.stringify(validator)}; process.stdout.write(String(validateV12CalendarStageTrace(JSON.parse(process.argv[2]))));`,
        path.resolve("package.json"),
        JSON.stringify(trace),
      ], { encoding: "utf8" })).toBe("true");
      clearPhase16CalendarTestControls();
    },
  );

  it("records one bounded interaction sample only after a committed drag expands and collapses", async () => {
    const createPan = Gesture.Pan.bind(Gesture);
    let latestPan: unknown;
    const panSpy = jest.spyOn(Gesture, "Pan").mockImplementation(() => {
      latestPan = createPan();
      return latestPan as ReturnType<typeof Gesture.Pan>;
    });
    const onInteractionDiagnosticComplete = jest.fn();
    const onInteractionDiagnosticStart = jest.fn();
    const common = {
      agenda: <View />,
      focusedWeek: {
        selectedDates: ["2026-11-02" as LocalDate],
        followingDates: ["2026-11-09" as LocalDate],
        selectedGeometry: { y: 70, height: 70, generation: 0 },
        followingGeometry: { y: 140, height: 70, generation: 0 },
      },
      month: "2026-11-01" as LocalDate,
      onCancel: jest.fn(),
      onComplete: jest.fn(),
      onInteractionDiagnosticComplete,
      onInteractionDiagnosticStart,
      onPreview: jest.fn(),
      onRelease: jest.fn(),
      renderMonth: () => <View />,
      renderWeek: () => <View />,
      weekCount: 5,
    } as const;
    const rendered = await render(<CalendarMonthViewport {...common} command={null} transition={initial()} />);
    await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", { nativeEvent: { layout: { height: 500, width: 400, x: 0, y: 0 } } });
    const handlers = (latestPan as { handlers: { onStart?: () => void; onEnd?: (event: Readonly<{ translationX: number; translationY: number }>, success: boolean) => void } }).handlers;
    handlers.onStart?.();
    handlers.onEnd?.({ translationX: -100, translationY: 0 }, true);

    const expanding = Object.freeze({ ...initial(), mode: "focused" as const, phase: "settling" as const, epoch: 1 });
    await rendered.rerender(<CalendarMonthViewport {...common} command={{ kind: "settle-week", epoch: 1, phase: "expand", durationMs: 260, easing: [0.22, 0.8, 0.3, 1], agendaDelayMs: 70, agendaDurationMs: 170 }} transition={expanding} />);
    const collapsing = Object.freeze({ ...expanding, mode: "month" as const, epoch: 2 });
    await rendered.rerender(<CalendarMonthViewport {...common} command={{ kind: "settle-week", epoch: 2, phase: "collapse", durationMs: 240, easing: [0.4, 0, 0.78, 0.2], agendaDelayMs: 0, agendaDurationMs: 140 }} transition={collapsing} />);

    expect(onInteractionDiagnosticStart).toHaveBeenCalledTimes(1);
    expect(onInteractionDiagnosticComplete).toHaveBeenCalledTimes(1);
    panSpy.mockRestore();
  });

  it("maps every panel to measured width plus the clamped pointer displacement", () => {
    const width = 400;

    for (const dx of [-100, -99.6, 99.6, 100, 100.4, -100.4]) {
      const clamped = clampMonthDrag(dx, width);
      expect(calendarPanelTranslate(0, dx, width)).toBe(clamped);
      expect(calendarPanelTranslate(-1, dx, width)).toBe(-width + clamped);
      expect(calendarPanelTranslate(1, dx, width)).toBe(width + clamped);
    }

    expect(crossesMonthBoundary(-99.6, width)).toBe(false);
    expect(crossesMonthBoundary(-100, width)).toBe(true);
    expect(crossesMonthBoundary(100, width)).toBe(true);
    expect(crossesMonthBoundary(100.4, width)).toBe(true);
  });

  it("uses inclusive distance-only month settling with a one-panel clamp and immediate preview title", () => {
    const state = initial();
    const preview = transitionCalendar(state, {
      type: "drag", dx: -600, dy: 0, viewportWidth: 400,
    });
    expect(preview.state).toMatchObject({ phase: "dragging", dragDx: -400, titlePanel: "next" });
    expect(preview.commands).toEqual([]);
    expect(clampMonthDrag(-600, 400)).toBe(-400);
    expect(clampMonthDrag(600, 400)).toBe(400);
    expect(crossesMonthBoundary(-100, 400)).toBe(true);
    expect(crossesMonthBoundary(-99.6, 400)).toBe(false);

    const settled = transitionCalendar(preview.state, {
      type: "release", dx: -100, dy: 0, viewportWidth: 400, targetMonthId: "2026-12",
    });
    expect(settled.state).toMatchObject({ currentMonthId: "2026-12", phase: "settling", titlePanel: "current" });
    expect(settled.commands).toEqual([{
      kind: "settle-month", epoch: 1, fromOffset: -0.25, toOffset: -1, durationMs: 240, easing: [0.22, 0.8, 0.3, 1],
    }]);
  });

  it("snaps back below threshold regardless of a caller-provided velocity and restores the title on retreat or cancellation", () => {
    const preview = transitionCalendar(initial(), { type: "drag", dx: -100, dy: 0, viewportWidth: 400 });
    const retreat = transitionCalendar(preview.state, { type: "drag", dx: -99.6, dy: 0, viewportWidth: 400 });
    expect(retreat.state).toMatchObject({ dragDx: -99.6, titlePanel: "current" });
    const shortRelease = transitionCalendar(retreat.state, {
      type: "release", dx: -40, dy: 0, viewportWidth: 400, targetMonthId: "2026-12", velocityX: -9999,
    });
    expect(shortRelease.state).toMatchObject({ phase: "settling", currentMonthId: "2026-11", titlePanel: "current" });
    expect(shortRelease.commands).toEqual([{
      kind: "settle-month", epoch: 1, fromOffset: -0.1, toOffset: 0, durationMs: 240, easing: [0.22, 0.8, 0.3, 1],
    }]);
    const cancelled = transitionCalendar(transitionCalendar(initial(), { type: "drag", dx: -100, dy: 0, viewportWidth: 400 }).state, { type: "cancel" });
    expect(cancelled).toEqual({
      state: expect.objectContaining({ phase: "idle", dragDx: 0, titlePanel: "current", epoch: 1 }), commands: [],
    });
  });

  it("claims horizontal intent only after 7dp slop, preserves vertical scroll, and rejects invalid geometry", () => {
    expect(transitionCalendar(initial(), { type: "drag", dx: 6.9, dy: 0, viewportWidth: 400 }).state).toEqual(initial());
    expect(transitionCalendar(initial(), { type: "drag", dx: 100, dy: 100, viewportWidth: 400 }).state).toEqual(initial());
    expect(() => transitionCalendar(initial(), { type: "drag", dx: Number.NaN, dy: 0, viewportWidth: 400 }))
      .toThrow(CalendarTransitionError);
    expect(() => clampMonthDrag(1, 0)).toThrow("calendar_transition_invalid_geometry");
  });

  it("leaves vertical releases unowned and cancels stale motion when runtime reduced motion changes", () => {
    expect(transitionCalendar(initial(), { type: "set-reduced-motion", reducedMotion: false }))
      .toEqual({ state: initial(), commands: [] });
    const samePreferenceWhileDragging = Object.freeze({ ...initial(), phase: "dragging" as const });
    expect(transitionCalendar(samePreferenceWhileDragging, { type: "set-reduced-motion", reducedMotion: false }).state)
      .toMatchObject({ phase: "idle", reducedMotion: false, epoch: 1 });

    const vertical = transitionCalendar(initial(), {
      type: "release", dx: 0, dy: 120, viewportWidth: 400, targetMonthId: "2026-12",
    });
    expect(vertical).toEqual({ state: initial(), commands: [] });

    const settling = transitionCalendar(initial(), {
      type: "move", direction: "next", targetMonthId: "2026-12",
    });
    const reconfigured = transitionCalendar(settling.state, {
      type: "set-reduced-motion", reducedMotion: true,
    });
    expect(reconfigured).toEqual({
      state: expect.objectContaining({ currentMonthId: "2026-12", phase: "idle", reducedMotion: true, epoch: 2 }),
      commands: [],
    });
    expect(transitionCalendar(reconfigured.state, { type: "settle-complete", epoch: 1 }))
      .toEqual({ state: reconfigured.state, commands: [] });
  });

  it.each([true, false])(
    "preserves the adjacent destination when reduced motion changes to %s in every phase",
    (reducedMotion) => {
      const expanded = transitionCalendar(initial(), { type: "expand" });
      const focused = transitionCalendar(expanded.state, { type: "settle-complete", epoch: 1 }).state;
      const collapsing = transitionCalendar(focused, {
        type: "select-adjacent",
        localDate: "2026-12-01",
        targetMonthId: "2026-12",
      }).state;
      const measuring = transitionCalendar(collapsing, {
        type: "settle-complete",
        epoch: collapsing.epoch,
      }).state;
      const expanding = transitionCalendar(measuring, { type: "layout-ready" }).state;

      for (const state of [collapsing, measuring, expanding]) {
        expect(transitionCalendar(state, {
          type: "set-reduced-motion",
          reducedMotion,
        })).toEqual({
          state: expect.objectContaining({
            currentMonthId: "2026-12",
            selectedLocalDate: "2026-12-01",
            reducedMotion,
            mode: "focused",
            phase: "idle",
            pendingMonthId: null,
            pendingSelectedLocalDate: null,
          }),
          commands: [],
        });
      }
    },
  );

  it("carries an explicit target date through a month settle and delays adjacent cross-month selection", () => {
    const moved = transitionCalendar(initial(), {
      type: "release",
      dx: -100,
      dy: 0,
      viewportWidth: 400,
      targetMonthId: "2026-12",
      targetSelectedLocalDate: "2026-12-01",
    });
    expect(moved.state).toMatchObject({ currentMonthId: "2026-12", selectedLocalDate: "2026-12-01" });
    expect(transitionCalendar(initial(), {
      type: "move", direction: "next", targetMonthId: "2026-12", targetSelectedLocalDate: "2026-12-01",
    }).state).toMatchObject({ currentMonthId: "2026-12", selectedLocalDate: "2026-12-01" });

    const expanded = transitionCalendar(initial(), { type: "expand" });
    const focused = transitionCalendar(expanded.state, { type: "settle-complete", epoch: 1 }).state;
    const adjacent = transitionCalendar(focused, {
      type: "select-adjacent", localDate: "2026-12-01", targetMonthId: "2026-12",
    });
    expect(adjacent.state).toMatchObject({
      currentMonthId: "2026-11",
      selectedLocalDate: "2026-11-01",
      pendingMonthId: "2026-12",
      pendingSelectedLocalDate: "2026-12-01",
    });
    const measuring = transitionCalendar(adjacent.state, { type: "settle-complete", epoch: 2 });
    expect(measuring).toEqual({
      state: expect.objectContaining({
        currentMonthId: "2026-12",
        selectedLocalDate: "2026-12-01",
        mode: "month",
        phase: "adjacent-measuring",
      }),
      commands: [],
    });
    expect(transitionCalendar(measuring.state, { type: "layout-ready" }).state)
      .toMatchObject({ currentMonthId: "2026-12", selectedLocalDate: "2026-12-01", phase: "adjacent-expanding" });
  });

  it("owns same-month date selection in the transition state and validates the civil date", () => {
    const selected = transitionCalendar(initial(), { type: "select-date", localDate: "2026-11-30" });
    expect(selected).toEqual({
      state: expect.objectContaining({ selectedLocalDate: "2026-11-30", currentMonthId: "2026-11", mode: "month", phase: "idle" }),
      commands: [],
    });
    expect(() => transitionCalendar(initial(), { type: "select-date", localDate: "2026-02-30" }))
      .toThrow("local_date_invalid");
    expect(transitionCalendar(initial(), { type: "select-date", localDate: "2026-12-01" }))
      .toEqual({ state: initial(), commands: [] });

    const settling = transitionCalendar(initial(), { type: "move", direction: "next", targetMonthId: "2026-12" });
    expect(transitionCalendar(settling.state, { type: "select-date", localDate: "2026-12-12" }))
      .toEqual({ state: settling.state, commands: [] });

    const expanded = transitionCalendar(selected.state, { type: "expand" });
    const focused = transitionCalendar(expanded.state, { type: "settle-complete", epoch: expanded.state.epoch }).state;
    const collapsed = transitionCalendar(focused, { type: "collapse" });
    const month = transitionCalendar(collapsed.state, { type: "settle-complete", epoch: collapsed.state.epoch }).state;
    expect(transitionCalendar(month, {
      type: "move", direction: "next", targetMonthId: "2026-12", targetSelectedLocalDate: "2026-12-30",
    }).state)
      .toMatchObject({ currentMonthId: "2026-12", selectedLocalDate: "2026-12-30" });
  });

  it("publishes completion only for the current epoch and resolves reduced motion with the same destination but no motion command", () => {
    const settling = transitionCalendar(initial(), {
      type: "move", direction: "next", targetMonthId: "2026-12",
    });
    expect(transitionCalendar(settling.state, { type: "settle-complete", epoch: 0 })).toEqual({ state: settling.state, commands: [] });
    expect(transitionCalendar(settling.state, { type: "settle-complete", epoch: 1 }).state).toMatchObject({ phase: "idle", currentMonthId: "2026-12" });

    const reduced = transitionCalendar(initial(true), { type: "move", direction: "next", targetMonthId: "2026-12" });
    expect(reduced).toEqual({
      state: expect.objectContaining({ currentMonthId: "2026-12", phase: "idle", epoch: 1 }), commands: [],
    });
  });

  it("orders adjacent focus as collapse, month selection, then expansion, and gives Back cancellation priority", () => {
    const expanded = transitionCalendar(initial(), { type: "expand" });
    expect(expanded.state).toMatchObject({ mode: "focused", phase: "settling" });
    expect(expanded.commands).toEqual([expect.objectContaining({
      kind: "settle-week", phase: "expand", durationMs: 260, easing: [0.22, 0.8, 0.3, 1],
    })]);
    const focused = transitionCalendar(expanded.state, { type: "settle-complete", epoch: 1 }).state;
    const collapsed = transitionCalendar(focused, { type: "collapse" });
    expect(collapsed.commands).toEqual([expect.objectContaining({
      kind: "settle-week", phase: "collapse", durationMs: 240, easing: [0.4, 0, 0.78, 0.2],
    })]);
    const adjacent = transitionCalendar(focused, { type: "select-adjacent", localDate: "2026-11-08" });
    expect(adjacent.state).toMatchObject({
      mode: "month", selectedLocalDate: "2026-11-01", pendingSelectedLocalDate: "2026-11-08", phase: "adjacent-collapsing",
    });
    expect(adjacent.commands[0]).toMatchObject({ kind: "settle-week", phase: "collapse" });
    const measuring = transitionCalendar(adjacent.state, { type: "settle-complete", epoch: 2 });
    expect(measuring.state).toMatchObject({ mode: "month", selectedLocalDate: "2026-11-08", phase: "adjacent-measuring" });
    expect(measuring.commands).toEqual([]);
    const expanding = transitionCalendar(measuring.state, { type: "layout-ready" });
    expect(expanding.state).toMatchObject({ mode: "focused", selectedLocalDate: "2026-11-08", phase: "adjacent-expanding" });
    expect(expanding.commands[0]).toMatchObject({ kind: "settle-week", phase: "expand" });
    const stable = transitionCalendar(expanding.state, { type: "settle-complete", epoch: expanding.state.epoch }).state;
    expect(stable).toMatchObject({ mode: "focused", phase: "idle" });
    expect(transitionCalendar(stable, { type: "back" }).state).toMatchObject({ mode: "month", phase: "settling" });

    const dragging = transitionCalendar(initial(), { type: "drag", dx: -100, dy: 0, viewportWidth: 400 }).state;
    expect(transitionCalendar(dragging, { type: "back" })).toEqual({
      state: expect.objectContaining({ mode: "month", phase: "idle", titlePanel: "current" }), commands: [],
    });
    expect(transitionCalendar(initial(), { type: "back" }).commands).toEqual([{ kind: "request-back" }]);
  });

  it("fails closed or ignores every invalid and superseded transition without widening Calendar authority", () => {
    expect(() => createCalendarTransitionState({ currentMonthId: "", selectedLocalDate: "2026-11-01", reducedMotion: false }))
      .toThrow("calendar_transition_invalid_identifier");
    expect(() => transitionCalendar(initial(), { type: "select-adjacent", localDate: " " }))
      .toThrow("calendar_transition_invalid_identifier");

    const previous = transitionCalendar(initial(), {
      type: "release", dx: 100, dy: 0, viewportWidth: 400, targetMonthId: "2026-10",
    });
    expect(previous.commands[0]).toMatchObject({ fromOffset: 0.25, toOffset: 1 });
    expect(transitionCalendar(initial(), { type: "drag", dx: 100, dy: 0, viewportWidth: 400 }).state)
      .toMatchObject({ titlePanel: "previous" });
    const verticalRelease = transitionCalendar(initial(), {
      type: "release", dx: 0, dy: 100, viewportWidth: 400, targetMonthId: "2026-12",
    });
    expect(verticalRelease).toEqual({ state: initial(), commands: [] });

    const settling = transitionCalendar(initial(), { type: "move", direction: "previous", targetMonthId: "2026-10" });
    expect(transitionCalendar(settling.state, { type: "drag", dx: -100, dy: 0, viewportWidth: 400 })).toEqual({ state: settling.state, commands: [] });
    expect(transitionCalendar(settling.state, {
      type: "release", dx: -100, dy: 0, viewportWidth: 400, targetMonthId: "2026-12",
    })).toEqual({ state: settling.state, commands: [] });
    expect(transitionCalendar(settling.state, { type: "move", direction: "next", targetMonthId: "2026-12" })).toEqual({ state: settling.state, commands: [] });
    expect(transitionCalendar(initial(), { type: "settle-complete", epoch: 0 })).toEqual({ state: initial(), commands: [] });

    const expanded = transitionCalendar(initial(), { type: "expand" });
    const focused = transitionCalendar(expanded.state, { type: "settle-complete", epoch: 1 }).state;
    expect(transitionCalendar(focused, { type: "expand" })).toEqual({ state: focused, commands: [] });
    expect(transitionCalendar(initial(), { type: "collapse" })).toEqual({ state: initial(), commands: [] });
    expect(transitionCalendar(initial(), { type: "select-adjacent", localDate: "2026-11-02" }).state)
      .toMatchObject({ mode: "month", selectedLocalDate: "2026-11-02" });
    expect(transitionCalendar(expanded.state, { type: "select-adjacent", localDate: "2026-11-02" }))
      .toEqual({ state: expanded.state, commands: [] });
    expect(transitionCalendar(initial(), { type: "layout-ready" })).toEqual({ state: initial(), commands: [] });

    const reducedExpanded = transitionCalendar(initial(true), { type: "expand" });
    expect(reducedExpanded).toEqual({ state: expect.objectContaining({ mode: "focused", phase: "idle" }), commands: [] });
    expect(transitionCalendar(reducedExpanded.state, { type: "collapse" }))
      .toEqual({ state: expect.objectContaining({ mode: "month", phase: "idle" }), commands: [] });
    expect(transitionCalendar(reducedExpanded.state, { type: "select-adjacent", localDate: "2026-11-08" }))
      .toEqual({ state: expect.objectContaining({ mode: "focused", selectedLocalDate: "2026-11-08", phase: "idle" }), commands: [] });
    const reducedAdjacent = Object.freeze({ ...reducedExpanded.state, phase: "adjacent-collapsing" as const });
    expect(transitionCalendar(reducedAdjacent, { type: "settle-complete", epoch: reducedAdjacent.epoch }))
      .toEqual({ state: expect.objectContaining({ mode: "focused", phase: "idle" }), commands: [] });
  });
});
