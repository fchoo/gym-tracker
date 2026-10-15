import {
  CryptoDigestAlgorithm,
  digestStringAsync,
} from "expo-crypto";

const PACKAGE = "com.fchoo.gymtracker.devtest";
const BUILD_PROFILE = "development-test";
const SUITE = "v1.2-acceptance";
export const PHASE20_CALENDAR_FLOW_REVISION = "calendar-flow-r35-real-v1";
export const PHASE20_CALENDAR_RESULT_MARKER = "GYM_TRACKER_V12_DOMAIN_RESULT:";

export const PHASE20_CALENDAR_STAGE_GROUPS = Object.freeze({
  pointer: Object.freeze([
    "drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1",
    "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above",
    "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1",
    "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above",
    "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal",
  ] as const),
  inputInterrupt: Object.freeze(["second-input-interrupt"] as const),
  rowGeometry: Object.freeze([
    "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "adjacent-week",
  ] as const),
  monthGeometry: Object.freeze([
    "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month",
  ] as const),
  pointerRetarget: Object.freeze(["rapid-reverse-input"] as const),
  lifecycle: Object.freeze(["rotation-during-transition", "background-during-transition"] as const),
  reducedMotion: Object.freeze(["reduced-motion"] as const),
  baseline: Object.freeze(["dev-01-padding", "dev-02-light-title"] as const),
});

export const PHASE20_CALENDAR_STAGE_IDS = Object.freeze(
  Object.values(PHASE20_CALENDAR_STAGE_GROUPS).flat(),
);

export type Phase20CalendarStage = (typeof PHASE20_CALENDAR_STAGE_IDS)[number];
export type Phase20CalendarStageGroup = "pointer" | "input-interrupt" | "row-geometry" | "month-geometry" | "pointer-retarget" | "lifecycle" | "reduced-motion" | "baseline";

export type Phase20CalendarRequest = Readonly<{
  stage: Phase20CalendarStage;
  nonce: string;
  flowSha256: string;
  flowRevision: typeof PHASE20_CALENDAR_FLOW_REVISION;
}>;

type NativeContractIdentity = Readonly<{
  packageName: unknown;
  buildProfile: unknown;
  nativeContractsEnabled: unknown;
  suite: unknown;
}>;

type EventIdentity = Readonly<{
  sequence: number;
  observed_at_monotonic_ms: number;
  callback_generation: number;
}>;

type ViewportEvent = EventIdentity & Readonly<{
  kind: "viewport-layout";
  width_dp: number;
  height_dp: number;
  orientation: "portrait" | "landscape";
  layout_generation: number;
}>;

export type Phase20CalendarTransitionSnapshot = Readonly<{
  currentMonthId: string;
  selectedCivilDate: string;
  mode: "month" | "focused";
  phase: "idle" | "dragging" | "settling" | "adjacent-collapsing" | "adjacent-measuring" | "adjacent-expanding";
  titlePanel: "previous" | "current" | "next";
  dragDxDp: number;
  epoch: number;
  reducedMotion: boolean;
}>;

type CompactTransitionState = Readonly<{
  current_month_id: string;
  selected_civil_date: string;
  mode: "month" | "focused";
  phase: Phase20CalendarTransitionSnapshot["phase"];
  title_panel: "previous" | "current" | "next";
  drag_dx_dp: number;
  epoch: number;
  reduced_motion: boolean;
}>;

type TransitionEvent = EventIdentity & Readonly<{
  kind: "transition";
  trigger: string;
  before: CompactTransitionState;
  after: CompactTransitionState;
  command_kinds: readonly string[];
}>;

type PointerEvent = EventIdentity & Readonly<{
  kind: "pointer";
  callback: "onTouchesDown" | "onTouchesMove" | "onBegin" | "onChange" | "onEnd" | "onFinalize";
  phase: "down" | "intent" | "begin" | "change" | "release" | "finalize-release" | "finalize-cancel";
  x_dp: number;
  y_dp: number;
  dx_dp: number;
  dy_dp: number;
  viewport_width_dp: number;
  translation_x_dp: number;
  intent_owner: "undetermined" | "horizontal" | "vertical" | "diagonal";
}>;

type InputAttemptEvent = EventIdentity & Readonly<{
  kind: "input-attempt";
  callback: "onTouchStart";
  x_dp: number;
  y_dp: number;
  transition_phase: Phase20CalendarTransitionSnapshot["phase"];
}>;

type SemanticEvent = EventIdentity & Readonly<{
  kind: "semantic";
  title: string;
  current_month_id: string;
  selected_civil_date: string;
  focused_week_start: string | null;
  week_count: number;
}>;

type RowLayoutEvent = EventIdentity & Readonly<{
  kind: "row-layout";
  week_start: string;
  y_dp: number;
  height_dp: number;
  layout_generation: number;
}>;

type CallbackEvent = EventIdentity & Readonly<{
  kind: "callback";
  callback: "month-settle" | "week-settle";
  epoch: number;
}>;

type FocusEvent = EventIdentity & Readonly<{
  kind: "focus";
  identity: string;
}>;

type LifecycleEvent = EventIdentity & Readonly<{
  kind: "lifecycle";
  event: "app-state" | "orientation";
  value: "active" | "background" | "inactive" | "portrait" | "landscape";
}>;

type MotionEvent = EventIdentity & Readonly<{
  kind: "motion";
  reduced_motion: boolean;
}>;

type BaselineEvent = EventIdentity & Readonly<{
  kind: "baseline";
  measurement: Readonly<Record<string, string | number>>;
}>;

type ObservationEvent = ViewportEvent | TransitionEvent | PointerEvent | InputAttemptEvent | SemanticEvent | RowLayoutEvent | CallbackEvent | FocusEvent | LifecycleEvent | MotionEvent | BaselineEvent;
type ObservationPayload = ObservationEvent extends infer Event
  ? Event extends EventIdentity ? Omit<Event, keyof EventIdentity> : never
  : never;

export type Phase20CalendarObservationCollector = Readonly<{
  recordViewport(input: Readonly<{ widthDp: number; heightDp: number; orientation: "portrait" | "landscape"; layoutGeneration: number }>): void;
  recordPointer(input: Readonly<{ callback: PointerEvent["callback"]; phase: PointerEvent["phase"]; xDp: number; yDp: number; dxDp: number; dyDp: number; viewportWidthDp: number; translationXDp: number; intentOwner: PointerEvent["intent_owner"]; callbackGeneration: number }>): void;
  recordInputAttempt(input: Readonly<{ xDp: number; yDp: number; transitionPhase: Phase20CalendarTransitionSnapshot["phase"]; callbackGeneration: number }>): void;
  recordTransition(input: Readonly<{ trigger: string; before: Phase20CalendarTransitionSnapshot; after: Phase20CalendarTransitionSnapshot; commandKinds: readonly string[] }>): void;
  recordSemantic(input: Readonly<{ title: string; currentMonthId: string; selectedCivilDate: string; focusedWeekStart: string | null; weekCount: number; callbackGeneration: number }>): void;
  recordWeekLayout(input: Readonly<{ weekStart: string; yDp: number; heightDp: number; layoutGeneration: number }>): void;
  recordCallback(input: Readonly<{ callback: CallbackEvent["callback"]; epoch: number; callbackGeneration: number }>): void;
  recordFocus(input: Readonly<{ identity: string; callbackGeneration: number }>): void;
  recordLifecycle(input: Readonly<{ event: LifecycleEvent["event"]; value: LifecycleEvent["value"]; callbackGeneration: number }>): void;
  recordMotion(input: Readonly<{ reducedMotion: boolean }>): void;
  recordBaseline(input:
    | Readonly<{ kind: "adaptive-padding"; safeWidthDp: number; horizontalInsetDp: number; viewportWidthDp: number }>
    | Readonly<{ kind: "light-strength-title"; colorScheme: "light" | "dark"; strengthTitleColor: string }>): void;
  flush(): Promise<void>;
}>;

const SHA256 = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const COLOR = /^#[A-F0-9]{6}$/u;
const stages = new Set<string>(PHASE20_CALENDAR_STAGE_IDS);

function safeNumber(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error("phase20_calendar_number_invalid");
  return value;
}

function safeGeneration(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("phase20_calendar_generation_invalid");
  return value;
}

function safeDate(value: string): string {
  if (!DATE.test(value)) throw new Error("phase20_calendar_date_invalid");
  return value;
}

function safeMonth(value: string): string {
  if (!MONTH.test(value)) throw new Error("phase20_calendar_month_invalid");
  return value;
}

function stageGroup(stage: Phase20CalendarStage): Phase20CalendarStageGroup {
  if ((PHASE20_CALENDAR_STAGE_GROUPS.pointer as readonly string[]).includes(stage)) return "pointer";
  if ((PHASE20_CALENDAR_STAGE_GROUPS.inputInterrupt as readonly string[]).includes(stage)) return "input-interrupt";
  if ((PHASE20_CALENDAR_STAGE_GROUPS.rowGeometry as readonly string[]).includes(stage)) return "row-geometry";
  if ((PHASE20_CALENDAR_STAGE_GROUPS.monthGeometry as readonly string[]).includes(stage)) return "month-geometry";
  if ((PHASE20_CALENDAR_STAGE_GROUPS.pointerRetarget as readonly string[]).includes(stage)) return "pointer-retarget";
  if ((PHASE20_CALENDAR_STAGE_GROUPS.lifecycle as readonly string[]).includes(stage)) return "lifecycle";
  if ((PHASE20_CALENDAR_STAGE_GROUPS.reducedMotion as readonly string[]).includes(stage)) return "reduced-motion";
  return "baseline";
}

export function phase20CalendarRequestFromNativeContract(input: NativeContractIdentity & Readonly<{
  stage: unknown;
  nonce: unknown;
  flowSha256: unknown;
  flowRevision: unknown;
}>): Phase20CalendarRequest | null {
  if (input.packageName !== PACKAGE
    || input.buildProfile !== BUILD_PROFILE
    || input.nativeContractsEnabled !== true
    || input.suite !== SUITE
    || typeof input.stage !== "string"
    || !stages.has(input.stage)
    || typeof input.nonce !== "string"
    || !NONCE.test(input.nonce)
    || typeof input.flowSha256 !== "string"
    || !SHA256.test(input.flowSha256)
    || input.flowRevision !== PHASE20_CALENDAR_FLOW_REVISION) return null;
  return Object.freeze({
    stage: input.stage as Phase20CalendarStage,
    nonce: input.nonce,
    flowSha256: input.flowSha256,
    flowRevision: PHASE20_CALENDAR_FLOW_REVISION,
  });
}

export function phase20CalendarInitialDate(stage: Phase20CalendarStage): string {
  if (stage === "month-year-boundary") return "2026-12-15";
  if (stage === "leap-february") return "2028-02-29";
  if (stage === "four-row-month") return "2021-02-15";
  if (stage === "six-row-month") return "2026-08-15";
  if (stage === "week-expand-first-row") return "2026-10-01";
  if (stage === "week-expand-last-row") return "2026-10-31";
  return "2026-10-15";
}

function compactState(state: Phase20CalendarTransitionSnapshot) {
  safeMonth(state.currentMonthId);
  safeDate(state.selectedCivilDate);
  safeGeneration(state.epoch);
  return Object.freeze({
    current_month_id: state.currentMonthId,
    selected_civil_date: state.selectedCivilDate,
    mode: state.mode,
    phase: state.phase,
    title_panel: state.titlePanel,
    drag_dx_dp: safeNumber(state.dragDxDp),
    epoch: state.epoch,
    reduced_motion: state.reducedMotion,
  });
}

function uniqueRows(events: readonly ObservationEvent[]): readonly RowLayoutEvent[] {
  const byWeek = new Map<string, RowLayoutEvent>();
  for (const event of events) if (event.kind === "row-layout") byWeek.set(event.week_start, event);
  return Object.freeze([...byWeek.values()].sort((left, right) => left.y_dp - right.y_dp));
}

function hasTransition(events: readonly ObservationEvent[], trigger: string, afterPhase?: string): boolean {
  return events.some((event) => event.kind === "transition" && event.trigger === trigger
    && (afterPhase === undefined || event.after.phase === afterPhase));
}

function pointerReady(stage: Phase20CalendarStage, events: readonly ObservationEvent[]): boolean {
  const pointers = events.filter((event): event is PointerEvent => event.kind === "pointer");
  const callbacks = new Set(pointers.map(({ callback }) => callback));
  if (!callbacks.has("onTouchesDown") || !callbacks.has("onFinalize")) return false;
  if (["drag-cancel", "drag-vertical", "drag-diagonal"].includes(stage)) {
    return pointers.at(-1)?.phase === "finalize-cancel"
      && !pointers.some(({ callback }) => callback === "onEnd")
      && (hasTransition(events, "cancel") || hasTransition(events, "invalidate"));
  }
  if (!["onBegin", "onChange", "onEnd"].every((callback) => callbacks.has(callback as PointerEvent["callback"]))) return false;
  const finalized = pointers.filter(({ phase }) => phase === "finalize-release").length;
  if (stage === "rapid-reverse-input" && finalized < 2) return false;
  if (stage === "drag-retreat") {
    const changes = pointers.filter(({ callback }) => callback === "onChange");
    const release = pointers.filter(({ callback }) => callback === "onEnd").at(-1);
    if (!changes.some(({ dx_dp, viewport_width_dp }) => Math.abs(dx_dp) >= viewport_width_dp * 0.25)
      || release === undefined || Math.abs(release.dx_dp) >= release.viewport_width_dp * 0.25) return false;
  }
  if (!hasTransition(events, "release")) return false;
  return hasTransition(events, "settle-complete", "idle")
    && events.filter((event) => event.kind === "semantic").length >= 2;
}

function rowReady(stage: Phase20CalendarStage, events: readonly ObservationEvent[]): boolean {
  const semantics = events.filter((event): event is SemanticEvent => event.kind === "semantic");
  const focus = events.some((event) => event.kind === "focus");
  const settled = events.some((event) => event.kind === "callback" && event.callback === "week-settle")
    && hasTransition(events, "settle-complete", "idle");
  if (uniqueRows(events).length < 2 || !focus || !settled || !semantics.some(({ focused_week_start }) => focused_week_start !== null)) return false;
  if (stage !== "adjacent-week") return hasTransition(events, "expand");
  const triggers = events.filter((event): event is TransitionEvent => event.kind === "transition").map(({ trigger }) => trigger);
  return ["expand", "settle-complete", "select-adjacent", "settle-complete", "layout-ready", "settle-complete"]
    .every((trigger, index, required) => triggers.indexOf(trigger, index === 0 ? 0 : triggers.indexOf(required[index - 1]!) + 1) >= 0);
}

function monthReady(stage: Phase20CalendarStage, events: readonly ObservationEvent[]): boolean {
  const semantic = events.filter((event): event is SemanticEvent => event.kind === "semantic").at(-1);
  const rows = uniqueRows(events);
  if (semantic === undefined || rows.length !== semantic.week_count) return false;
  if (stage === "month-year-boundary") {
    const boundary = events.find((event): event is TransitionEvent => event.kind === "transition"
      && event.before.current_month_id.slice(0, 4) !== event.after.current_month_id.slice(0, 4));
    return boundary !== undefined && hasTransition(events, "settle-complete", "idle")
      && semantic.current_month_id === boundary.after.current_month_id;
  }
  if (stage === "leap-february") return semantic.selected_civil_date.endsWith("-02-29");
  const expectedRows = stage === "four-row-month" ? 4 : stage === "five-row-month" ? 5 : 6;
  return rows.length === expectedRows;
}

function lifecycleReady(stage: Phase20CalendarStage, events: readonly ObservationEvent[]): boolean {
  const lifecycle = events.filter((event): event is LifecycleEvent => event.kind === "lifecycle");
  if (stage === "rotation-during-transition") {
    const orientations = lifecycle.filter(({ event }) => event === "orientation");
    const secondOrientation = orientations.at(-1);
    const viewports = events.filter((event): event is ViewportEvent => event.kind === "viewport-layout");
    const latestViewport = viewports.at(-1);
    return new Set(orientations.map(({ value }) => value)).size >= 2
      && new Set(viewports.map(({ orientation }) => orientation)).size >= 2
      && secondOrientation !== undefined && latestViewport !== undefined
      && events.some((event) => event.kind === "transition" && event.trigger === "invalidate"
        && event.sequence > secondOrientation.sequence && event.sequence > latestViewport.sequence);
  }
  const background = lifecycle.find((event) => event.event === "app-state" && event.value !== "active");
  const resumed = lifecycle.find((event) => event.event === "app-state" && event.value === "active"
    && (background === undefined || event.sequence > background.sequence));
  return background !== undefined && resumed !== undefined
    && events.some((event) => event.kind === "transition" && event.trigger === "invalidate"
      && event.sequence > background.sequence && event.sequence < resumed.sequence);
}

function ready(stage: Phase20CalendarStage, group: Phase20CalendarStageGroup, events: readonly ObservationEvent[]): boolean {
  const hasViewport = events.some((event) => event.kind === "viewport-layout");
  const hasSemantic = events.some((event) => event.kind === "semantic");
  const hasMotion = events.some((event) => event.kind === "motion");
  if (!hasViewport || !hasSemantic || !hasMotion) return false;
  if (group === "pointer" || group === "pointer-retarget") return pointerReady(stage, events);
  if (group === "input-interrupt") return pointerReady(stage, events)
    && events.filter((event) => event.kind === "input-attempt").length >= 2;
  if (group === "row-geometry") return rowReady(stage, events);
  if (group === "month-geometry") return monthReady(stage, events);
  if (group === "lifecycle") return lifecycleReady(stage, events);
  if (group === "reduced-motion") return events.some((event) => event.kind === "motion" && event.reduced_motion)
    && uniqueRows(events).length >= 2 && hasTransition(events, "expand") && events.some((event) => event.kind === "focus");
  const semantic = events.filter((event): event is SemanticEvent => event.kind === "semantic").at(-1);
  return semantic !== undefined && uniqueRows(events).length === semantic.week_count
    && events.some((event) => event.kind === "baseline" && (
    stage === "dev-01-padding" ? event.measurement.kind === "adaptive-padding" : event.measurement.kind === "light-strength-title"
    ));
}

function stageBody(stage: Phase20CalendarStage, group: Phase20CalendarStageGroup, startedAt: number, completedAt: number, events: readonly ObservationEvent[]) {
  const base = { schema_version: 1, id: stage, group, started_at_monotonic_ms: startedAt, completed_at_monotonic_ms: completedAt } as const;
  const viewportEvents = events.filter((event): event is ViewportEvent => event.kind === "viewport-layout");
  const transitions = events.filter((event): event is TransitionEvent => event.kind === "transition");
  const semantics = events.filter((event): event is SemanticEvent => event.kind === "semantic");
  const callbacks = events.filter((event): event is CallbackEvent => event.kind === "callback");
  const focus = events.filter((event): event is FocusEvent => event.kind === "focus");
  const motion = events.filter((event): event is MotionEvent => event.kind === "motion");
  if (group === "pointer" || group === "pointer-retarget") return Object.freeze({ ...base, viewport: viewportEvents.at(-1), pointer_events: events.filter((event): event is PointerEvent => event.kind === "pointer"), transition_events: transitions, semantic_samples: semantics, callback_events: callbacks, focus_events: focus, motion: motion.at(-1) });
  if (group === "input-interrupt") return Object.freeze({ ...base, viewport: viewportEvents.at(-1), pointer_events: events.filter((event): event is PointerEvent => event.kind === "pointer"), input_attempts: events.filter((event): event is InputAttemptEvent => event.kind === "input-attempt"), transition_events: transitions, semantic_samples: semantics, callback_events: callbacks, motion: motion.at(-1) });
  if (group === "row-geometry") return Object.freeze({ ...base, viewport: viewportEvents.at(-1), row_measurements: uniqueRows(events), transition_events: transitions, semantic_samples: semantics, callback_events: callbacks, focus_events: focus, motion: motion.at(-1) });
  if (group === "month-geometry") return Object.freeze({ ...base, viewport: viewportEvents.at(-1), row_measurements: uniqueRows(events), transition_events: transitions, semantic_samples: semantics, motion: motion.at(-1) });
  if (group === "lifecycle") return Object.freeze({ ...base, viewport_events: viewportEvents, lifecycle_events: events.filter((event): event is LifecycleEvent => event.kind === "lifecycle"), transition_events: transitions, semantic_samples: semantics, callback_events: callbacks, motion_events: motion });
  if (group === "reduced-motion") return Object.freeze({ ...base, viewport: viewportEvents.at(-1), row_measurements: uniqueRows(events), transition_events: transitions, semantic_samples: semantics, callback_events: callbacks, focus_events: focus, motion_events: motion });
  const requiredMeasurement = stage === "dev-01-padding" ? "adaptive-padding" : "light-strength-title";
  return Object.freeze({
    ...base,
    viewport: viewportEvents.at(-1),
    row_measurements: uniqueRows(events),
    baseline_measurements: events.filter((event): event is BaselineEvent => (
      event.kind === "baseline" && event.measurement.kind === requiredMeasurement
    )),
    semantic_samples: semantics,
    motion: motion.at(-1),
  });
}

export function createPhase20CalendarObservationCollector(input: Readonly<{
  request: Phase20CalendarRequest | null;
  now?: () => number;
  sha256?: (value: string) => Promise<string>;
  emitLine?: (line: string) => void;
}>): Phase20CalendarObservationCollector | null {
  if (input.request === null) return null;
  const now = input.now ?? (() => globalThis.performance?.now() ?? Date.now());
  const digest = input.sha256 ?? ((value: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value));
  const emitLine = input.emitLine ?? ((line: string) => console.info(line));
  const request = input.request;
  const group = stageGroup(request.stage);
  const startedAt = safeNumber(now());
  let previousTimestamp = startedAt;
  let sequence = 0;
  let terminal: Promise<void> | null = null;
  let emitted = false;
  const events: ObservationEvent[] = [];

  const append = (callbackGeneration: number, value: ObservationPayload) => {
    if (emitted || terminal !== null) return;
    const observedAt = safeNumber(now());
    if (observedAt <= previousTimestamp) throw new Error("phase20_calendar_clock_non_monotonic");
    previousTimestamp = observedAt;
    sequence += 1;
    events.push(Object.freeze({
      sequence,
      observed_at_monotonic_ms: observedAt,
      callback_generation: safeGeneration(callbackGeneration),
      ...value,
    }) as unknown as ObservationEvent);
    if (!ready(request.stage, group, events)) return;
    const completedAt = observedAt;
    const body = stageBody(request.stage, group, startedAt, completedAt, Object.freeze([...events]));
    terminal = Promise.resolve(digest(JSON.stringify(body))).then((observationDigest) => {
      if (!SHA256.test(observationDigest)) throw new Error("phase20_calendar_digest_invalid");
      emitLine(`${PHASE20_CALENDAR_RESULT_MARKER}${JSON.stringify({
        schema_version: 1,
        nonce: request.nonce,
        kind: "calendar",
        flow_sha256: request.flowSha256,
        flow_revision: request.flowRevision,
        stage: Object.freeze({ ...body, observation_digest_sha256: observationDigest }),
      })}`);
      emitted = true;
    });
    void terminal.catch(() => undefined);
  };

  return Object.freeze({
    recordViewport: (value) => append(value.layoutGeneration, {
      kind: "viewport-layout",
      width_dp: safeNumber(value.widthDp),
      height_dp: safeNumber(value.heightDp),
      orientation: value.orientation,
      layout_generation: safeGeneration(value.layoutGeneration),
    }),
    recordPointer: (value) => append(value.callbackGeneration, {
      kind: "pointer",
      callback: value.callback,
      phase: value.phase,
      x_dp: safeNumber(value.xDp),
      y_dp: safeNumber(value.yDp),
      dx_dp: safeNumber(value.dxDp),
      dy_dp: safeNumber(value.dyDp),
      viewport_width_dp: safeNumber(value.viewportWidthDp),
      translation_x_dp: safeNumber(value.translationXDp),
      intent_owner: value.intentOwner,
    }),
    recordInputAttempt: (value) => append(value.callbackGeneration, {
      kind: "input-attempt",
      callback: "onTouchStart",
      x_dp: safeNumber(value.xDp),
      y_dp: safeNumber(value.yDp),
      transition_phase: value.transitionPhase,
    }),
    recordTransition: (value) => append(value.after.epoch, {
      kind: "transition",
      trigger: value.trigger,
      before: compactState(value.before),
      after: compactState(value.after),
      command_kinds: Object.freeze([...value.commandKinds]),
    }),
    recordSemantic: (value) => append(value.callbackGeneration, {
      kind: "semantic",
      title: value.title,
      current_month_id: safeMonth(value.currentMonthId),
      selected_civil_date: safeDate(value.selectedCivilDate),
      focused_week_start: value.focusedWeekStart === null ? null : safeDate(value.focusedWeekStart),
      week_count: safeGeneration(value.weekCount),
    }),
    recordWeekLayout: (value) => append(value.layoutGeneration, {
      kind: "row-layout",
      week_start: safeDate(value.weekStart),
      y_dp: safeNumber(value.yDp),
      height_dp: safeNumber(value.heightDp),
      layout_generation: safeGeneration(value.layoutGeneration),
    }),
    recordCallback: (value) => append(value.callbackGeneration, {
      kind: "callback",
      callback: value.callback,
      epoch: safeGeneration(value.epoch),
    }),
    recordFocus: (value) => append(value.callbackGeneration, {
      kind: "focus",
      identity: value.identity,
    }),
    recordLifecycle: (value) => append(value.callbackGeneration, {
      kind: "lifecycle",
      event: value.event,
      value: value.value,
    }),
    recordMotion: (value) => append(0, {
      kind: "motion",
      reduced_motion: value.reducedMotion,
    }),
    recordBaseline: (value) => {
      if (value.kind === "light-strength-title" && !COLOR.test(value.strengthTitleColor)) {
        throw new Error("phase20_calendar_color_invalid");
      }
      append(0, {
        kind: "baseline",
        measurement: value.kind === "adaptive-padding"
          ? Object.freeze({ kind: value.kind, safe_width_dp: safeNumber(value.safeWidthDp), horizontal_inset_dp: safeNumber(value.horizontalInsetDp), viewport_width_dp: safeNumber(value.viewportWidthDp) })
          : Object.freeze({ kind: value.kind, color_scheme: value.colorScheme, strength_title_color: value.strengthTitleColor }),
      });
    },
    flush: async () => { if (terminal !== null) await terminal; },
  });
}

let activeCollector: Phase20CalendarObservationCollector | null = null;

export function configurePhase20CalendarObservationCollector(input: Parameters<typeof createPhase20CalendarObservationCollector>[0]): void {
  activeCollector = createPhase20CalendarObservationCollector(input);
}

export function clearPhase20CalendarObservationCollector(): void {
  activeCollector = null;
}

export const recordPhase20CalendarViewport = (input: Parameters<Phase20CalendarObservationCollector["recordViewport"]>[0]) => activeCollector?.recordViewport(input);
export const recordPhase20CalendarPointer = (input: Parameters<Phase20CalendarObservationCollector["recordPointer"]>[0]) => activeCollector?.recordPointer(input);
export const recordPhase20CalendarInputAttempt = (input: Parameters<Phase20CalendarObservationCollector["recordInputAttempt"]>[0]) => activeCollector?.recordInputAttempt(input);
export const recordPhase20CalendarTransition = (input: Parameters<Phase20CalendarObservationCollector["recordTransition"]>[0]) => activeCollector?.recordTransition(input);
export const recordPhase20CalendarSemantic = (input: Parameters<Phase20CalendarObservationCollector["recordSemantic"]>[0]) => activeCollector?.recordSemantic(input);
export const recordPhase20CalendarWeekLayout = (input: Parameters<Phase20CalendarObservationCollector["recordWeekLayout"]>[0]) => activeCollector?.recordWeekLayout(input);
export const recordPhase20CalendarCallback = (input: Parameters<Phase20CalendarObservationCollector["recordCallback"]>[0]) => activeCollector?.recordCallback(input);
export const recordPhase20CalendarFocus = (input: Parameters<Phase20CalendarObservationCollector["recordFocus"]>[0]) => activeCollector?.recordFocus(input);
export const recordPhase20CalendarLifecycle = (input: Parameters<Phase20CalendarObservationCollector["recordLifecycle"]>[0]) => activeCollector?.recordLifecycle(input);
export const recordPhase20CalendarMotion = (input: Parameters<Phase20CalendarObservationCollector["recordMotion"]>[0]) => activeCollector?.recordMotion(input);
export const recordPhase20CalendarBaseline = (input: Parameters<Phase20CalendarObservationCollector["recordBaseline"]>[0]) => activeCollector?.recordBaseline(input);
