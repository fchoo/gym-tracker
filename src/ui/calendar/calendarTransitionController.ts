export type CalendarTitlePanel = "previous" | "current" | "next";
export type CalendarDisplayMode = "month" | "focused";
export type CalendarTransitionPhase = "idle" | "dragging" | "settling" | "adjacent-collapsing" | "adjacent-expanding";

export type CalendarTransitionState = Readonly<{
  currentMonthId: string;
  selectedLocalDate: string;
  mode: CalendarDisplayMode;
  phase: CalendarTransitionPhase;
  titlePanel: CalendarTitlePanel;
  dragDx: number;
  epoch: number;
  reducedMotion: boolean;
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
      phase: "expand" | "collapse";
      durationMs: 240;
      easing: readonly [0.22, 0.8, 0.3, 1];
    }>
  | Readonly<{ kind: "request-back" }>;

export type CalendarTransitionEvent =
  | Readonly<{ type: "drag"; dx: number; dy: number; viewportWidth: number }>
  | Readonly<{ type: "release"; dx: number; dy: number; viewportWidth: number; targetMonthId: string; velocityX?: number }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "move"; direction: "previous" | "next"; targetMonthId: string }>
  | Readonly<{ type: "settle-complete"; epoch: number }>
  | Readonly<{ type: "expand" }>
  | Readonly<{ type: "collapse" }>
  | Readonly<{ type: "select-adjacent"; localDate: string }>
  | Readonly<{ type: "back" }>;

export type CalendarTransitionResult = Readonly<{
  state: CalendarTransitionState;
  commands: readonly CalendarMotionCommand[];
}>;

const EASING = Object.freeze([0.22, 0.8, 0.3, 1] as const);
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
  });
}

function settleWeek(state: CalendarTransitionState, phase: "expand" | "collapse", next: CalendarTransitionState): CalendarTransitionResult {
  if (next.reducedMotion) return result(freezeState({ ...next, phase: "idle" }));
  return result(next, [Object.freeze({ kind: "settle-week", epoch: next.epoch, phase, durationMs: SETTLE_DURATION_MS, easing: EASING })]);
}

function settleMonth(
  state: CalendarTransitionState,
  input: Readonly<{ targetMonthId: string; fromOffset: number; toOffset: -1 | 0 | 1 }>,
): CalendarTransitionResult {
  assertIdentifier(input.targetMonthId);
  const next = freezeState({
    ...state,
    currentMonthId: input.toOffset === 0 ? state.currentMonthId : input.targetMonthId,
    phase: state.reducedMotion ? "idle" : "settling",
    titlePanel: "current",
    dragDx: 0,
    epoch: state.epoch + 1,
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
      const dragDx = clampMonthDrag(event.dx, event.viewportWidth);
      const committed = horizontalIntent(event.dx, event.dy) && crossesMonthBoundary(dragDx, event.viewportWidth);
      return settleMonth(state, {
        targetMonthId: event.targetMonthId,
        fromOffset: dragDx / event.viewportWidth,
        toOffset: committed ? (dragDx < 0 ? -1 : 1) : 0,
      });
    }
    case "cancel":
      return result(reset(state, true));
    case "move":
      if (state.phase !== "idle") return result(state);
      return settleMonth(state, {
        targetMonthId: event.targetMonthId,
        fromOffset: 0,
        toOffset: event.direction === "next" ? -1 : 1,
      });
    case "settle-complete":
      if (event.epoch !== state.epoch) return result(state);
      if (state.phase === "adjacent-collapsing") {
        const next = freezeState({ ...state, mode: "focused", phase: state.reducedMotion ? "idle" : "adjacent-expanding", epoch: state.epoch + 1 });
        return settleWeek(state, "expand", next);
      }
      if (state.phase === "settling" || state.phase === "adjacent-expanding") return result(reset(state, false));
      return result(state);
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
    case "select-adjacent": {
      assertIdentifier(event.localDate);
      if (state.phase !== "idle") return result(state);
      if (state.mode === "month") return result(freezeState({ ...state, selectedLocalDate: event.localDate }));
      const next = freezeState({
        ...state,
        selectedLocalDate: event.localDate,
        mode: state.reducedMotion ? "focused" : "month",
        phase: state.reducedMotion ? "idle" : "adjacent-collapsing",
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
