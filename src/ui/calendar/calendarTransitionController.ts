import { parseLocalDate } from "../../domains/scheduling";

export type CalendarTitlePanel = "previous" | "current" | "next";
export type CalendarDisplayMode = "month" | "focused";
export type CalendarTransitionPhase = "idle" | "dragging" | "settling" | "adjacent-collapsing" | "adjacent-measuring" | "adjacent-expanding";

export type CalendarTransitionState = Readonly<{
  currentMonthId: string;
  selectedLocalDate: string;
  mode: CalendarDisplayMode;
  phase: CalendarTransitionPhase;
  titlePanel: CalendarTitlePanel;
  dragDx: number;
  epoch: number;
  reducedMotion: boolean;
  pendingSelectedLocalDate: string | null;
  pendingMonthId: string | null;
}>;

export type CalendarMotionCommand =
  | Readonly<{
      kind: "settle-month";
      epoch: number;
      fromOffset: number;
      toOffset: -1 | 0 | 1;
      durationMs: 240;
      easing: readonly [0.22, 0.8, 0.3, 1];
    }>
  | Readonly<{
      kind: "settle-week";
      epoch: number;
      phase: "expand";
      durationMs: 260;
      easing: readonly [0.22, 0.8, 0.3, 1];
      agendaDelayMs: 70;
      agendaDurationMs: 170;
    }>
  | Readonly<{
      kind: "settle-week";
      epoch: number;
      phase: "collapse";
      durationMs: 240;
      easing: readonly [0.4, 0, 0.78, 0.2];
      agendaDelayMs: 0;
      agendaDurationMs: 140;
    }>
  | Readonly<{ kind: "request-back" }>;

export type CalendarTransitionEvent =
  | Readonly<{ type: "drag"; dx: number; dy: number; viewportWidth: number }>
  | Readonly<{ type: "release"; dx: number; dy: number; viewportWidth: number; targetMonthId: string; targetSelectedLocalDate?: string; velocityX?: number }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "invalidate" }>
  | Readonly<{ type: "set-reduced-motion"; reducedMotion: boolean }>
  | Readonly<{ type: "move"; direction: "previous" | "next"; targetMonthId: string; targetSelectedLocalDate?: string }>
  | Readonly<{ type: "jump"; localDate: string }>
  | Readonly<{ type: "settle-complete"; epoch: number }>
  | Readonly<{ type: "expand" }>
  | Readonly<{ type: "collapse" }>
  | Readonly<{ type: "select-date"; localDate: string }>
  | Readonly<{ type: "select-adjacent"; localDate: string; targetMonthId?: string }>
  | Readonly<{ type: "layout-ready" }>
  | Readonly<{ type: "back" }>;

export type CalendarTransitionResult = Readonly<{
  state: CalendarTransitionState;
  commands: readonly CalendarMotionCommand[];
}>;

const EASING = Object.freeze([0.22, 0.8, 0.3, 1] as const);
const COLLAPSE_EASING = Object.freeze([0.4, 0, 0.78, 0.2] as const);
const SETTLE_DURATION_MS = 240 as const;
const SLOP_DP = 7;
const HORIZONTAL_INTENT_RATIO = 1.15;

export class CalendarTransitionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CalendarTransitionError";
  }
}

function assertGeometry(dx: number, dy: number, viewportWidth: number): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    throw new CalendarTransitionError("calendar_transition_invalid_geometry");
  }
}

function assertIdentifier(value: string): void {
  if (value.trim().length === 0) throw new CalendarTransitionError("calendar_transition_invalid_identifier");
}

function freezeState(value: CalendarTransitionState): CalendarTransitionState {
  return Object.freeze(value);
}

function result(state: CalendarTransitionState, commands: readonly CalendarMotionCommand[] = []): CalendarTransitionResult {
  return Object.freeze({ state, commands: Object.freeze([...commands]) });
}

function horizontalIntent(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SLOP_DP && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_INTENT_RATIO;
}

function titlePanel(dx: number, viewportWidth: number): CalendarTitlePanel {
  if (!crossesMonthBoundary(dx, viewportWidth)) return "current";
  return dx < 0 ? "next" : "previous";
}

function reset(state: CalendarTransitionState, incrementEpoch: boolean): CalendarTransitionState {
  return freezeState({
    ...state,
    phase: "idle",
    titlePanel: "current",
    dragDx: 0,
    epoch: incrementEpoch ? state.epoch + 1 : state.epoch,
    pendingSelectedLocalDate: null,
    pendingMonthId: null,
  });
}

function settleWeek(state: CalendarTransitionState, phase: "expand" | "collapse", next: CalendarTransitionState): CalendarTransitionResult {
  if (next.reducedMotion) return result(freezeState({ ...next, phase: "idle" }));
  return result(next, [phase === "expand"
    ? Object.freeze({ kind: "settle-week" as const, epoch: next.epoch, phase, durationMs: 260 as const, easing: EASING, agendaDelayMs: 70 as const, agendaDurationMs: 170 as const })
    : Object.freeze({ kind: "settle-week" as const, epoch: next.epoch, phase, durationMs: SETTLE_DURATION_MS, easing: COLLAPSE_EASING, agendaDelayMs: 0 as const, agendaDurationMs: 140 as const })]);
}

function settleMonth(
  state: CalendarTransitionState,
  input: Readonly<{ targetMonthId: string; targetSelectedLocalDate?: string; fromOffset: number; toOffset: -1 | 0 | 1 }>,
): CalendarTransitionResult {
  assertIdentifier(input.targetMonthId);
  if (input.targetSelectedLocalDate !== undefined) assertIdentifier(input.targetSelectedLocalDate);
  const next = freezeState({
    ...state,
    currentMonthId: input.toOffset === 0 ? state.currentMonthId : input.targetMonthId,
    selectedLocalDate: input.toOffset === 0 ? state.selectedLocalDate : input.targetSelectedLocalDate ?? state.selectedLocalDate,
    phase: state.reducedMotion ? "idle" : "settling",
    titlePanel: "current",
    dragDx: 0,
    epoch: state.epoch + 1,
    pendingSelectedLocalDate: null,
    pendingMonthId: null,
  });
  if (next.reducedMotion) return result(next);
  return result(next, [Object.freeze({
    kind: "settle-month", epoch: next.epoch, fromOffset: input.fromOffset, toOffset: input.toOffset,
    durationMs: SETTLE_DURATION_MS, easing: EASING,
  })]);
}

export function createCalendarTransitionState(input: Readonly<{
  currentMonthId: string;
  selectedLocalDate: string;
  reducedMotion: boolean;
}>): CalendarTransitionState {
  assertIdentifier(input.currentMonthId);
  assertIdentifier(input.selectedLocalDate);
  return freezeState({
    currentMonthId: input.currentMonthId,
    selectedLocalDate: input.selectedLocalDate,
    mode: "month",
    phase: "idle",
    titlePanel: "current",
    dragDx: 0,
    epoch: 0,
    reducedMotion: input.reducedMotion,
    pendingSelectedLocalDate: null,
    pendingMonthId: null,
  });
}

/** Inclusive 25% distance-only settle predicate. */
export function crossesMonthBoundary(dx: number, viewportWidth: number): boolean {
  assertGeometry(dx, 0, viewportWidth);
  return Math.abs(dx) >= viewportWidth * 0.25;
}

/** One viewport is the largest visual displacement Calendar accepts. */
export function clampMonthDrag(dx: number, viewportWidth: number): number {
  assertGeometry(dx, 0, viewportWidth);
  return Math.max(-viewportWidth, Math.min(viewportWidth, dx));
}

export function transitionCalendar(
  state: CalendarTransitionState,
  event: CalendarTransitionEvent,
): CalendarTransitionResult {
  switch (event.type) {
    case "drag": {
      assertGeometry(event.dx, event.dy, event.viewportWidth);
      if (state.phase !== "idle" && state.phase !== "dragging") return result(state);
      if (!horizontalIntent(event.dx, event.dy)) return result(state);
      const dragDx = clampMonthDrag(event.dx, event.viewportWidth);
      return result(freezeState({ ...state, phase: "dragging", dragDx, titlePanel: titlePanel(dragDx, event.viewportWidth) }));
    }
    case "release": {
      assertGeometry(event.dx, event.dy, event.viewportWidth);
      if (state.phase !== "idle" && state.phase !== "dragging") return result(state);
      if (state.phase === "idle" && !horizontalIntent(event.dx, event.dy)) return result(state);
      const dragDx = clampMonthDrag(event.dx, event.viewportWidth);
      const committed = crossesMonthBoundary(dragDx, event.viewportWidth);
      return settleMonth(state, {
        targetMonthId: event.targetMonthId,
        ...(event.targetSelectedLocalDate === undefined ? {} : { targetSelectedLocalDate: event.targetSelectedLocalDate }),
        fromOffset: dragDx / event.viewportWidth,
        toOffset: committed ? (dragDx < 0 ? -1 : 1) : 0,
      });
    }
    case "cancel":
    case "invalidate":
      return result(reset(state, true));
    case "set-reduced-motion":
      if (state.reducedMotion === event.reducedMotion && state.phase === "idle") return result(state);
      if (state.phase === "adjacent-collapsing"
        || state.phase === "adjacent-measuring"
        || state.phase === "adjacent-expanding") {
        return result(freezeState({
          ...state,
          currentMonthId: state.pendingMonthId ?? state.currentMonthId,
          selectedLocalDate: state.pendingSelectedLocalDate ?? state.selectedLocalDate,
          reducedMotion: event.reducedMotion,
          mode: "focused",
          phase: "idle",
          titlePanel: "current",
          dragDx: 0,
          epoch: state.epoch + 1,
          pendingSelectedLocalDate: null,
          pendingMonthId: null,
        }));
      }
      return result(freezeState({
        ...state,
        reducedMotion: event.reducedMotion,
        phase: "idle",
        titlePanel: "current",
        dragDx: 0,
        epoch: state.epoch + 1,
        pendingSelectedLocalDate: null,
        pendingMonthId: null,
      }));
    case "move":
      if (state.phase !== "idle") return result(state);
      return settleMonth(state, {
        targetMonthId: event.targetMonthId,
        ...(event.targetSelectedLocalDate === undefined ? {} : { targetSelectedLocalDate: event.targetSelectedLocalDate }),
        fromOffset: 0,
        toOffset: event.direction === "next" ? -1 : 1,
      });
    case "jump": {
      if (state.phase !== "idle") return result(state);
      const localDate = parseLocalDate(event.localDate);
      // Direct selection replaces all three panels without showing an unrelated
      // adjacent month on the way to a distant year. Invalidate older callbacks.
      return result(freezeState({
        ...reset(state, true),
        currentMonthId: localDate.slice(0, 7),
        selectedLocalDate: localDate,
        mode: "month",
      }));
    }
    case "settle-complete":
      if (event.epoch !== state.epoch) return result(state);
      if (state.phase === "adjacent-collapsing") {
        const next = freezeState({
          ...state,
          currentMonthId: state.pendingMonthId ?? state.currentMonthId,
          selectedLocalDate: state.pendingSelectedLocalDate ?? state.selectedLocalDate,
          pendingSelectedLocalDate: null,
          pendingMonthId: null,
          mode: state.reducedMotion ? "focused" : "month",
          phase: state.reducedMotion ? "idle" : "adjacent-measuring",
          epoch: state.epoch + 1,
        });
        return result(next);
      }
      if (state.phase === "settling" || state.phase === "adjacent-expanding") return result(reset(state, false));
      return result(state);
    case "layout-ready": {
      if (state.phase !== "adjacent-measuring") return result(state);
      const next = freezeState({
        ...state,
        mode: "focused",
        phase: "adjacent-expanding",
        epoch: state.epoch + 1,
      });
      return settleWeek(state, "expand", next);
    }
    case "expand": {
      if (state.phase !== "idle" || state.mode === "focused") return result(state);
      const next = freezeState({ ...state, mode: "focused", phase: state.reducedMotion ? "idle" : "settling", epoch: state.epoch + 1 });
      return settleWeek(state, "expand", next);
    }
    case "collapse": {
      if (state.phase !== "idle" || state.mode === "month") return result(state);
      const next = freezeState({ ...state, mode: "month", phase: state.reducedMotion ? "idle" : "settling", epoch: state.epoch + 1 });
      return settleWeek(state, "collapse", next);
    }
    case "select-date": {
      const localDate = parseLocalDate(event.localDate);
      if (state.phase !== "idle") return result(state);
      if (localDate.slice(0, 7) !== state.currentMonthId) return result(state);
      return result(freezeState({ ...state, selectedLocalDate: localDate }));
    }
    case "select-adjacent": {
      assertIdentifier(event.localDate);
      if (event.targetMonthId !== undefined) assertIdentifier(event.targetMonthId);
      if (state.phase !== "idle") return result(state);
      if (state.mode === "month") return result(freezeState({ ...state, selectedLocalDate: event.localDate }));
      if (state.reducedMotion) {
        return result(freezeState({
          ...state,
          currentMonthId: event.targetMonthId ?? state.currentMonthId,
          selectedLocalDate: event.localDate,
          pendingSelectedLocalDate: null,
          pendingMonthId: null,
          mode: "focused",
          phase: "idle",
          epoch: state.epoch + 1,
        }));
      }
      const next = freezeState({
        ...state,
        pendingSelectedLocalDate: event.localDate,
        pendingMonthId: event.targetMonthId === undefined || event.targetMonthId === state.currentMonthId ? null : event.targetMonthId,
        mode: "month",
        phase: "adjacent-collapsing",
        epoch: state.epoch + 1,
      });
      return settleWeek(state, "collapse", next);
    }
    case "back":
      if (state.phase !== "idle") return result(reset(state, true));
      if (state.mode === "focused") return transitionCalendar(state, { type: "collapse" });
      return result(state, [Object.freeze({ kind: "request-back" })]);
  }
}
