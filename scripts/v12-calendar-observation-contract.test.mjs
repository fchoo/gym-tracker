import assert from "node:assert/strict";
import test from "node:test";

import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_STAGE_GROUPS,
  V12_CALENDAR_STAGE_IDS,
  deriveV12CalendarStageResult,
  hashV12CalendarObservationBody,
  selectV12CalendarTerminalMarker,
  validateV12CalendarStageCoverage,
} from "./v12-calendar-observation-contract.mjs";

const NONCE = "b".repeat(32);
const FLOW_SHA = "a".repeat(64);
const HASH = "c".repeat(64);

function event(sequence, kind, fields = {}) {
  return {
    sequence,
    observed_at_monotonic_ms: 8_421.125 + sequence * 0.437,
    callback_generation: Math.max(1, Math.ceil(sequence / 3)),
    kind,
    ...fields,
  };
}

const viewport = (sequence = 1, orientation = "portrait") => event(sequence, "viewport-layout", {
  width_dp: orientation === "portrait" ? 354 : 764,
  height_dp: orientation === "portrait" ? 560 : 300,
  orientation,
  layout_generation: orientation === "portrait" ? 1 : 2,
});
const motion = (sequence = 2, reduced = false) => event(sequence, "motion", { reduced_motion: reduced });
const semantic = (sequence, fields = {}) => event(sequence, "semantic", {
  title: "October 2026",
  current_month_id: "2026-10",
  selected_civil_date: "2026-10-15",
  focused_week_start: null,
  week_count: 5,
  ...fields,
});
const state = (phase, fields = {}) => ({
  current_month_id: "2026-10",
  selected_civil_date: "2026-10-15",
  mode: "month",
  phase,
  title_panel: phase === "dragging" ? "next" : "current",
  drag_dx_dp: phase === "dragging" ? -88.5 : 0,
  epoch: phase === "idle" ? 0 : 1,
  reduced_motion: false,
  ...fields,
});
const transition = (sequence, trigger, before, after, command_kinds = []) => event(sequence, "transition", {
  trigger, before, after, command_kinds,
});

function withDigest(body) {
  return { ...body, observation_digest_sha256: hashV12CalendarObservationBody(body) };
}

function pointerStage(id = "drag-forward-release-exact") {
  const pointer_events = [
    event(4, "pointer", { callback: "onTouchesDown", phase: "down", x_dp: 300, y_dp: 220, dx_dp: 0, dy_dp: 0, viewport_width_dp: 354, translation_x_dp: 0, intent_owner: "undetermined" }),
    event(5, "pointer", { callback: "onTouchesMove", phase: "intent", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, translation_x_dp: 0, intent_owner: "horizontal" }),
    event(6, "pointer", { callback: "onBegin", phase: "begin", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, translation_x_dp: 0, intent_owner: "horizontal" }),
    event(7, "pointer", { callback: "onChange", phase: "change", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, translation_x_dp: -88.5, intent_owner: "horizontal" }),
    event(9, "pointer", { callback: "onEnd", phase: "release", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, translation_x_dp: -88.5, intent_owner: "horizontal" }),
    event(11, "pointer", { callback: "onFinalize", phase: "finalize-release", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, translation_x_dp: -88.5, intent_owner: "horizontal" }),
  ];
  const body = {
    schema_version: 1,
    id,
    group: "pointer",
    started_at_monotonic_ms: 8_420.125,
    completed_at_monotonic_ms: event(15, "unused").observed_at_monotonic_ms,
    viewport: viewport(1),
    pointer_events,
    transition_events: [
      transition(8, "drag", state("idle"), state("dragging")),
      transition(10, "release", state("dragging"), state("settling", { current_month_id: "2026-11", selected_civil_date: "2026-11-15" }), ["settle-month"]),
      transition(14, "settle-complete", state("settling", { current_month_id: "2026-11", selected_civil_date: "2026-11-15" }), state("idle", { current_month_id: "2026-11", selected_civil_date: "2026-11-15", epoch: 1 })),
    ],
    semantic_samples: [semantic(3), semantic(15, { title: "November 2026", current_month_id: "2026-11", selected_civil_date: "2026-11-15", week_count: 6 })],
    callback_events: [event(13, "callback", { callback: "month-settle", epoch: 1 })],
    focus_events: [],
    motion: motion(2),
  };
  return withDigest(body);
}

function marker(stage = pointerStage()) {
  return {
    schema_version: 1,
    nonce: NONCE,
    kind: "calendar",
    flow_sha256: FLOW_SHA,
    flow_revision: V12_CALENDAR_FLOW_REVISION,
    stage,
  };
}

function derive(stage = pointerStage()) {
  return deriveV12CalendarStageResult({
    marker: marker(stage),
    expected: { nonce: NONCE, flowSha256: FLOW_SHA, stageId: stage.id, order: V12_CALENDAR_STAGE_IDS.indexOf(stage.id) },
    screenshotSha256: HASH,
    traceSha256: hashV12CalendarObservationBody(stage),
  });
}

test("the production Calendar contract owns the exact 35-stage order and six real schema groups", () => {
  assert.equal(V12_CALENDAR_STAGE_IDS.length, 35);
  assert.deepEqual(Object.values(V12_CALENDAR_STAGE_GROUPS).flat(), V12_CALENDAR_STAGE_IDS);
  assert.deepEqual(Object.keys(V12_CALENDAR_STAGE_GROUPS), ["pointer", "row_geometry", "month_geometry", "lifecycle", "reduced_motion", "baseline"]);
});

test("a real pointer observation is validated and its status is derived only by host assertions", () => {
  const result = derive();
  assert.equal(result.status, "PASS");
  assert.equal(result.observation.id, "drag-forward-release-exact");
  assert.ok(result.assertion_results.length >= 5);
  assert.ok(result.assertion_results.every(({ passed }) => passed));
  assert.deepEqual(Object.keys(result), ["id", "order", "status", "observation", "assertion_results", "screenshot_sha256", "trace_sha256"]);
  assert.doesNotMatch(JSON.stringify(result.observation), /expected|\bPASS\b|\bstatus\b|synthetic/u);
});

test("a structurally real threshold miss becomes FAIL instead of trusting a requested expected outcome", () => {
  const stage = structuredClone(pointerStage());
  for (const sample of stage.pointer_events) {
    if (sample.callback === "onChange" || sample.callback === "onEnd" || sample.callback === "onFinalize") {
      sample.x_dp = 212.5;
      sample.dx_dp = -87.5;
      sample.translation_x_dp = -87.5;
    }
  }
  delete stage.observation_digest_sha256;
  stage.observation_digest_sha256 = hashV12CalendarObservationBody(stage);
  const result = derive(stage);
  assert.equal(result.status, "FAIL");
  assert.equal(result.assertion_results.find(({ id }) => id === "exact-threshold")?.passed, false);
});

test("the validator rejects sequential fake clocks, missing callbacks, generic labels, and request echoes", () => {
  for (const mutate of [
    (stage) => {
      const events = [stage.viewport, stage.motion, ...stage.pointer_events, ...stage.transition_events, ...stage.semantic_samples, ...stage.callback_events];
      events.sort((left, right) => left.sequence - right.sequence).forEach((entry, index) => { entry.observed_at_monotonic_ms = index + 1; });
      stage.started_at_monotonic_ms = 0;
      stage.completed_at_monotonic_ms = events.length;
    },
    (stage) => { stage.pointer_events = stage.pointer_events.filter(({ callback }) => callback !== "onChange"); },
    (stage) => { stage.semantic_samples[0].title = "visible"; },
    (stage) => { stage.expected_outcome = stage.id; },
  ]) {
    const stage = structuredClone(pointerStage());
    mutate(stage);
    delete stage.observation_digest_sha256;
    stage.observation_digest_sha256 = hashV12CalendarObservationBody(stage);
    assert.throws(() => derive(stage), /calendar_observation_/u);
  }
});

test("cancel ends with the actual cancelled callback and rejects a fabricated pointer-up", () => {
  const stage = structuredClone(pointerStage("drag-cancel"));
  stage.pointer_events = stage.pointer_events.slice(0, 2).concat([
    event(6, "pointer", { callback: "onFinalize", phase: "finalize-cancel", x_dp: 290, y_dp: 280, dx_dp: -10, dy_dp: 60, viewport_width_dp: 354, translation_x_dp: 0, intent_owner: "vertical" }),
  ]);
  stage.transition_events = [transition(7, "cancel", state("idle"), state("idle", { epoch: 1 }))];
  stage.semantic_samples = [semantic(3), semantic(8)];
  stage.callback_events = [];
  stage.completed_at_monotonic_ms = stage.semantic_samples[1].observed_at_monotonic_ms;
  delete stage.observation_digest_sha256;
  stage.observation_digest_sha256 = hashV12CalendarObservationBody(stage);
  assert.equal(derive(stage).status, "PASS");

  const malformed = structuredClone(stage);
  malformed.pointer_events.push(event(7, "pointer", { callback: "onEnd", phase: "release", x_dp: 290, y_dp: 280, dx_dp: -10, dy_dp: 60, viewport_width_dp: 354, translation_x_dp: -10, intent_owner: "vertical" }));
  malformed.completed_at_monotonic_ms = malformed.pointer_events.at(-1).observed_at_monotonic_ms;
  delete malformed.observation_digest_sha256;
  malformed.observation_digest_sha256 = hashV12CalendarObservationBody(malformed);
  assert.throws(() => derive(malformed), /calendar_observation_cancel_invalid/u);
});

test("row geometry rejects duplicated fixed bounds", () => {
  const rows = [0, 70, 140, 210, 280].map((y, index) => event(index + 2, "row-layout", {
    week_start: `2026-10-${String(index * 7 + 1).padStart(2, "0")}`,
    y_dp: y,
    height_dp: 70,
    layout_generation: 1,
  }));
  const body = {
    schema_version: 1,
    id: "week-expand-middle-row",
    group: "row-geometry",
    started_at_monotonic_ms: 8_420.125,
    completed_at_monotonic_ms: event(12, "unused").observed_at_monotonic_ms,
    viewport: viewport(1),
    row_measurements: rows,
    transition_events: [
      transition(8, "expand", state("idle"), state("settling", { mode: "focused" }), ["settle-week"]),
      transition(10, "settle-complete", state("settling", { mode: "focused" }), state("idle", { mode: "focused", epoch: 1 })),
    ],
    semantic_samples: [semantic(11, { focused_week_start: "2026-10-12" })],
    callback_events: [event(9, "callback", { callback: "week-settle", epoch: 1 })],
    focus_events: [event(12, "focus", { identity: "calendar-collapse-day" })],
    motion: motion(7),
  };
  assert.equal(derive(withDigest(body)).status, "PASS");

  const fixed = structuredClone(body);
  fixed.row_measurements.forEach((row) => { row.y_dp = 0; });
  assert.throws(() => derive(withDigest(fixed)), /calendar_observation_row_geometry_invalid/u);
});

test("terminal selection rejects pre-stage and duplicate nonce markers", () => {
  const line = `GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify(marker())}`;
  assert.equal(selectV12CalendarTerminalMarker({ beforeLogs: "", afterLogs: line, nonce: NONCE, flowSha256: FLOW_SHA, stageId: "drag-forward-release-exact" }).stage.id, "drag-forward-release-exact");
  assert.throws(() => selectV12CalendarTerminalMarker({ beforeLogs: line, afterLogs: line, nonce: NONCE, flowSha256: FLOW_SHA, stageId: "drag-forward-release-exact" }), /calendar_observation_pre_stage_marker/u);
  assert.throws(() => selectV12CalendarTerminalMarker({ beforeLogs: "", afterLogs: `${line}\n${line}`, nonce: NONCE, flowSha256: FLOW_SHA, stageId: "drag-forward-release-exact" }), /calendar_observation_marker_duplicate/u);
});

test("coverage rejects missing, duplicate, reordered, and missing-group stage results", () => {
  const complete = V12_CALENDAR_STAGE_IDS.map((id, order) => ({ id, order, group: Object.entries(V12_CALENDAR_STAGE_GROUPS).find(([, ids]) => ids.includes(id))?.[0] }));
  assert.equal(validateV12CalendarStageCoverage(complete), true);
  assert.throws(() => validateV12CalendarStageCoverage(complete.slice(1)), /calendar_observation_stage_coverage_invalid/u);
  assert.throws(() => validateV12CalendarStageCoverage(complete.map((entry, index) => index === 1 ? complete[0] : entry)), /calendar_observation_stage_coverage_invalid/u);
  assert.throws(() => validateV12CalendarStageCoverage(complete.map((entry) => entry.group === "baseline" ? { ...entry, group: "pointer" } : entry)), /calendar_observation_stage_coverage_invalid/u);
});
