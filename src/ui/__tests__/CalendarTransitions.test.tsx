import { describe, expect, it } from "@jest/globals";

import {
  CalendarTransitionError,
  clampMonthDrag,
  createCalendarTransitionState,
  crossesMonthBoundary,
  transitionCalendar,
} from "../calendar/calendarTransitionController";
import { calendarPanelTranslate } from "../calendar/CalendarMonthViewport";

const initial = (reducedMotion = false) => createCalendarTransitionState({
  currentMonthId: "2026-11",
  selectedLocalDate: "2026-11-01",
  reducedMotion,
});

describe("Calendar semantic transitions", () => {
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
    const focused = transitionCalendar(expanded.state, { type: "settle-complete", epoch: 1 }).state;
    const adjacent = transitionCalendar(focused, { type: "select-adjacent", localDate: "2026-11-08" });
    expect(adjacent.state).toMatchObject({
      mode: "month", selectedLocalDate: "2026-11-08", phase: "adjacent-collapsing",
    });
    expect(adjacent.commands[0]).toMatchObject({ kind: "settle-week", phase: "collapse" });
    const expanding = transitionCalendar(adjacent.state, { type: "settle-complete", epoch: 2 });
    expect(expanding.state).toMatchObject({ mode: "focused", phase: "adjacent-expanding" });
    expect(expanding.commands[0]).toMatchObject({ kind: "settle-week", phase: "expand" });
    const stable = transitionCalendar(expanding.state, { type: "settle-complete", epoch: 3 }).state;
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
    expect(verticalRelease.commands[0]).toMatchObject({ fromOffset: 0, toOffset: 0 });

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
