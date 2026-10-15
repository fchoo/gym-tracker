import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_STAGE_GROUPS,
  V12_CALENDAR_STAGE_IDS,
  deriveV12CalendarStageResult,
  hashV12CalendarObservationBody,
} from "../v12-calendar-observation-contract.mjs";

const HASH = "f".repeat(64);

function factory(order) {
  let sequence = 0;
  const base = 10_000.125 + order * 1_000;
  const event = (kind, fields = {}) => {
    sequence += 1;
    return {
      sequence,
      observed_at_monotonic_ms: base + sequence * 0.413 + sequence * sequence * 0.001,
      callback_generation: Math.max(1, Math.ceil(sequence / 4)),
      kind,
      ...fields,
    };
  };
  return { base, event, last: () => base + sequence * 0.413 + sequence * sequence * 0.001 };
}

function viewport(event, orientation = "portrait") {
  return event("viewport-layout", { width_dp: orientation === "portrait" ? 354 : 764, height_dp: orientation === "portrait" ? 560 : 300, orientation, layout_generation: orientation === "portrait" ? 1 : 2 });
}
function motion(event, reduced = false) { return event("motion", { reduced_motion: reduced }); }
function semantic(event, fields = {}) { return event("semantic", { title: "October 2026", current_month_id: "2026-10", selected_civil_date: "2026-10-15", focused_week_start: null, week_count: 5, ...fields }); }
function state(phase, fields = {}) { return { current_month_id: "2026-10", selected_civil_date: "2026-10-15", mode: "month", phase, title_panel: phase === "dragging" ? "next" : "current", drag_dx_dp: phase === "dragging" ? -88.5 : 0, epoch: phase === "idle" ? 0 : 1, reduced_motion: false, ...fields }; }
function transition(event, trigger, before, after, command_kinds = []) { return event("transition", { trigger, before, after, command_kinds }); }
function pointer(event, callback, phase, dx, owner = "horizontal") { return event("pointer", { callback, phase, x_dp: 300 + dx, y_dp: owner === "horizontal" ? 220 : 280, dx_dp: dx, dy_dp: owner === "horizontal" ? 0 : 60, viewport_width_dp: 354, translation_x_dp: callback === "onTouchesMove" || phase === "down" || phase === "begin" || phase === "finalize-cancel" ? 0 : dx, intent_owner: phase === "down" ? "undetermined" : owner }); }
function rows(event, count = 5) { return Array.from({ length: count }, (_, index) => event("row-layout", { week_start: `${2026 + Math.floor(index / 5)}-${String((index % 5) + 1).padStart(2, "0")}-01`, y_dp: index * 70, height_dp: 70, layout_generation: 1 })); }
function digest(body) { return { ...body, observation_digest_sha256: hashV12CalendarObservationBody(body) }; }

function pointerBody(id, order) {
  const { base, event, last } = factory(order); const view = viewport(event); const movement = []; const inputAttempts = [];
  const backwards = id.startsWith("drag-backward");
  const token = /-(10|24_9|25|25_1)$/u.exec(id)?.[1] ?? /release-(below|exact|above)$/u.exec(id)?.[1];
  const ratio = token === "10" || id === "drag-fast-subthreshold" ? 0.1 : token === "24_9" || token === "below" ? 0.249 : token === "25" || token === "exact" ? 0.25 : 0.251;
  const dx = (backwards ? 1 : -1) * ratio * 354;
  const motionSample = motion(event); const semanticBefore = semantic(event);
  const cancelled = ["drag-cancel", "drag-vertical", "drag-diagonal"].includes(id);
  if (cancelled) {
    const owner = id === "drag-diagonal" ? "diagonal" : "vertical";
    movement.push(pointer(event, "onTouchesDown", "down", 0));
    movement.push(pointer(event, "onTouchesMove", "intent", -10, owner));
    movement.push(pointer(event, "onFinalize", "finalize-cancel", -10, owner));
    const transitions = [transition(event, "cancel", state("idle"), state("idle", { epoch: 1 }))];
    const semantics = [semanticBefore, semantic(event)];
    return digest({ schema_version: 1, id, group: "pointer", started_at_monotonic_ms: base, completed_at_monotonic_ms: last(), viewport: view, pointer_events: movement, transition_events: transitions, semantic_samples: semantics, callback_events: [], focus_events: [], motion: motionSample });
  }
  const transitions = [];
  const addGesture = (gestureDx) => {
    movement.push(pointer(event, "onTouchesDown", "down", 0));
    movement.push(pointer(event, "onTouchesMove", "intent", gestureDx));
    movement.push(pointer(event, "onBegin", "begin", gestureDx));
    movement.push(pointer(event, "onChange", "change", gestureDx));
    transitions.push(transition(event, "drag", state("idle"), state("dragging", { drag_dx_dp: gestureDx, title_panel: Math.abs(gestureDx) >= 88.5 ? (gestureDx < 0 ? "next" : "previous") : "current" })));
    movement.push(pointer(event, "onEnd", "release", gestureDx));
    transitions.push(transition(event, "release", state("dragging", { drag_dx_dp: gestureDx }), state("settling"), ["settle-month"]));
    movement.push(pointer(event, "onFinalize", "finalize-release", gestureDx));
  };
  if (id === "drag-retreat") {
    movement.push(pointer(event, "onTouchesDown", "down", 0));
    movement.push(pointer(event, "onTouchesMove", "intent", -90));
    movement.push(pointer(event, "onBegin", "begin", -90));
    movement.push(pointer(event, "onChange", "change", -90));
    transitions.push(transition(event, "drag", state("idle"), state("dragging", { drag_dx_dp: -90, title_panel: "next" })));
    movement.push(pointer(event, "onChange", "change", -35.4));
    transitions.push(transition(event, "drag", state("dragging", { drag_dx_dp: -90 }), state("dragging", { drag_dx_dp: -35.4, title_panel: "current" })));
    movement.push(pointer(event, "onEnd", "release", -35.4));
    transitions.push(transition(event, "release", state("dragging", { drag_dx_dp: -35.4, title_panel: "current" }), state("settling"), ["settle-month"]));
    movement.push(pointer(event, "onFinalize", "finalize-release", -35.4));
  } else {
    if (id === "second-input-interrupt") inputAttempts.push(event("input-attempt", { callback: "onTouchStart", x_dp: 300, y_dp: 220, transition_phase: "idle" }));
    addGesture(dx);
    if (id === "second-input-interrupt") inputAttempts.push(event("input-attempt", { callback: "onTouchStart", x_dp: 300, y_dp: 220, transition_phase: "settling" }));
    if (id === "rapid-reverse-input") addGesture(89);
  }
  const callbackEvents = [event("callback", { callback: "month-settle", epoch: 1 })];
  transitions.push(transition(event, "settle-complete", state("settling"), state("idle", { epoch: 1 })));
  const committed = id !== "drag-retreat" && Math.abs(dx) >= 88.5;
  const semanticAfter = semantic(event, committed ? { title: backwards ? "September 2026" : "November 2026", current_month_id: backwards ? "2026-09" : "2026-11", selected_civil_date: backwards ? "2026-09-15" : "2026-11-15", week_count: 6 } : {});
  const common = { schema_version: 1, id, group: id === "rapid-reverse-input" ? "pointer-retarget" : id === "second-input-interrupt" ? "input-interrupt" : "pointer", started_at_monotonic_ms: base, completed_at_monotonic_ms: last(), viewport: view, pointer_events: movement, transition_events: transitions, semantic_samples: [semanticBefore, semanticAfter], callback_events: callbackEvents, motion: motionSample };
  return digest(id === "second-input-interrupt" ? { ...common, input_attempts: inputAttempts } : { ...common, focus_events: [] });
}

function rowBody(id, order) {
  const { base, event, last } = factory(order); const view = viewport(event); const measuredRows = rows(event); const motionSample = motion(event);
  const first = id === "week-expand-first-row" ? measuredRows[0].week_start : id === "week-expand-last-row" ? measuredRows.at(-1).week_start : measuredRows[2].week_start;
  const transitions = [];
  transitions.push(transition(event, "expand", state("idle"), state("settling", { mode: "focused" }), ["settle-week"]));
  const callbacks = [event("callback", { callback: "week-settle", epoch: 1 })];
  transitions.push(transition(event, "settle-complete", state("settling", { mode: "focused" }), state("idle", { mode: "focused", epoch: 1 })));
  if (id === "adjacent-week") {
    transitions.push(transition(event, "select-adjacent", state("idle", { mode: "focused", epoch: 1 }), state("adjacent-collapsing", { epoch: 2 }), ["settle-week"]));
    callbacks.push(event("callback", { callback: "week-settle", epoch: 2 }));
    transitions.push(transition(event, "settle-complete", state("adjacent-collapsing", { epoch: 2 }), state("adjacent-measuring", { epoch: 3 })));
    transitions.push(transition(event, "layout-ready", state("adjacent-measuring", { epoch: 3 }), state("adjacent-expanding", { mode: "focused", epoch: 4 }), ["settle-week"]));
    callbacks.push(event("callback", { callback: "week-settle", epoch: 4 }));
    transitions.push(transition(event, "settle-complete", state("adjacent-expanding", { mode: "focused", epoch: 4 }), state("idle", { mode: "focused", epoch: 4 })));
  }
  const semantics = [semantic(event, { focused_week_start: first })];
  const focus = [event("focus", { identity: "calendar-collapse-day" })];
  return digest({ schema_version: 1, id, group: "row-geometry", started_at_monotonic_ms: base, completed_at_monotonic_ms: last(), viewport: view, row_measurements: measuredRows, transition_events: transitions, semantic_samples: semantics, callback_events: callbacks, focus_events: focus, motion: motionSample });
}

function monthBody(id, order) {
  const { base, event, last } = factory(order); const view = viewport(event); const count = id === "four-row-month" ? 4 : id === "six-row-month" ? 6 : 5; const measuredRows = rows(event, count); const motionSample = motion(event); const transitions = [];
  let semanticSample = semantic(event, { week_count: count });
  if (id === "leap-february") semanticSample = semantic(event, { title: "February 2028", current_month_id: "2028-02", selected_civil_date: "2028-02-29", week_count: count });
  if (id === "month-year-boundary") {
    transitions.push(transition(event, "move", state("idle", { current_month_id: "2026-12", selected_civil_date: "2026-12-15" }), state("settling", { current_month_id: "2027-01", selected_civil_date: "2027-01-15" }), ["settle-month"]));
    semanticSample = semantic(event, { title: "January 2027", current_month_id: "2027-01", selected_civil_date: "2027-01-15", week_count: count });
  }
  return digest({ schema_version: 1, id, group: "month-geometry", started_at_monotonic_ms: base, completed_at_monotonic_ms: last(), viewport: view, row_measurements: measuredRows, transition_events: transitions, semantic_samples: [semanticSample], motion: motionSample });
}

function lifecycleBody(id, order) {
  const { base, event, last } = factory(order); const views = [viewport(event)]; const motionEvents = [motion(event)]; const semantics = [semantic(event)]; const transitions = [];
  const lifecycle = [];
  if (id === "rotation-during-transition") {
    lifecycle.push(event("lifecycle", { event: "orientation", value: "portrait" }));
    lifecycle.push(event("lifecycle", { event: "orientation", value: "landscape" }));
    views.push(viewport(event, "landscape"));
    transitions.push(transition(event, "invalidate", state("settling"), state("idle", { epoch: 2 })));
  } else {
    lifecycle.push(event("lifecycle", { event: "app-state", value: "background" }));
    transitions.push(transition(event, "invalidate", state("settling"), state("idle", { epoch: 2 })));
    lifecycle.push(event("lifecycle", { event: "app-state", value: "active" }));
  }
  semantics.push(semantic(event));
  return digest({ schema_version: 1, id, group: "lifecycle", started_at_monotonic_ms: base, completed_at_monotonic_ms: last(), viewport_events: views, lifecycle_events: lifecycle, transition_events: transitions, semantic_samples: semantics, callback_events: [], motion_events: motionEvents });
}

function reducedMotionBody(id, order) {
  const { base, event, last } = factory(order); const view = viewport(event); const measuredRows = rows(event); const motionEvents = [motion(event, true)];
  const transitions = [transition(event, "expand", state("idle", { reduced_motion: true }), state("idle", { mode: "focused", epoch: 1, reduced_motion: true }))];
  const semantics = [semantic(event, { focused_week_start: measuredRows[2].week_start })]; const focus = [event("focus", { identity: "calendar-collapse-day" })];
  return digest({ schema_version: 1, id, group: "reduced-motion", started_at_monotonic_ms: base, completed_at_monotonic_ms: last(), viewport: view, row_measurements: measuredRows, transition_events: transitions, semantic_samples: semantics, callback_events: [], focus_events: focus, motion_events: motionEvents });
}

function baselineBody(id, order) {
  const { base, event, last } = factory(order); const view = viewport(event); const measuredRows = rows(event); const motionSample = motion(event); const semantics = [semantic(event)];
  if (id === "dev-01-padding") view.width_dp = 348;
  const measurement = id === "dev-01-padding"
    ? event("baseline", { measurement: { kind: "adaptive-padding", safe_width_dp: 360, horizontal_inset_dp: 6, viewport_width_dp: 348 } })
    : event("baseline", { measurement: { kind: "light-strength-title", color_scheme: "light", strength_title_color: "#9B470B" } });
  return digest({ schema_version: 1, id, group: "baseline", started_at_monotonic_ms: base, completed_at_monotonic_ms: last(), viewport: view, row_measurements: measuredRows, baseline_measurements: [measurement], semantic_samples: semantics, motion: motionSample });
}

export function createV12CalendarObservationFixture(stageId, order, flowSha256, nonce = order.toString(16).padStart(32, "0")) {
  let stage;
  if (V12_CALENDAR_STAGE_GROUPS.pointer.includes(stageId) || V12_CALENDAR_STAGE_GROUPS.input_interrupt.includes(stageId) || V12_CALENDAR_STAGE_GROUPS.pointer_retarget.includes(stageId)) stage = pointerBody(stageId, order);
  else if (V12_CALENDAR_STAGE_GROUPS.row_geometry.includes(stageId)) stage = rowBody(stageId, order);
  else if (V12_CALENDAR_STAGE_GROUPS.month_geometry.includes(stageId)) stage = monthBody(stageId, order);
  else if (V12_CALENDAR_STAGE_GROUPS.lifecycle.includes(stageId)) stage = lifecycleBody(stageId, order);
  else if (V12_CALENDAR_STAGE_GROUPS.reduced_motion.includes(stageId)) stage = reducedMotionBody(stageId, order);
  else stage = baselineBody(stageId, order);
  const marker = { schema_version: 1, nonce, kind: "calendar", flow_sha256: flowSha256, flow_revision: V12_CALENDAR_FLOW_REVISION, stage };
  return deriveV12CalendarStageResult({ marker, expected: { nonce, flowSha256, stageId, order }, screenshotSha256: HASH, traceSha256: hashV12CalendarObservationBody(stage) });
}

export function createV12CalendarMarkerFixture(stageId, order, flowSha256, nonce = order.toString(16).padStart(32, "0")) {
  return {
    schema_version: 1,
    nonce,
    kind: "calendar",
    flow_sha256: flowSha256,
    flow_revision: V12_CALENDAR_FLOW_REVISION,
    stage: createV12CalendarObservationFixture(stageId, order, flowSha256, nonce).observation,
  };
}

export function createV12CalendarObservationResult(flowSha256) {
  const stages = V12_CALENDAR_STAGE_IDS.map((id, order) => createV12CalendarObservationFixture(id, order, flowSha256));
  return { flow_sha256: flowSha256, flow_revision: V12_CALENDAR_FLOW_REVISION, stages, junit_cases: stages.map(({ id, order, status }) => ({ id, order, status })) };
}
