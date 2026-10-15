import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";

import {
  V12_CALENDAR_FLOW_REVISION,
  V12_CALENDAR_CHUNK_MARKER,
  V12_CALENDAR_STAGE_GROUPS,
  V12_CALENDAR_STAGE_IDS,
  analyzeV12CalendarScreenshot,
  createV12CalendarDriverReceipt,
  deriveV12CalendarStageResult,
  encodeV12CalendarTerminalMarkerChunks,
  hashV12CalendarObservationBody,
  selectV12CalendarTerminalMarker,
  validateV12CalendarStageCoverage,
} from "./v12-calendar-observation-contract.mjs";
import { createV12CalendarObservationFixture } from "./testing/v12-calendar-observation-fixture.mjs";

const NONCE = "b".repeat(32);
const FLOW_SHA = "a".repeat(64);
const HASH = "c".repeat(64);

function event(sequence, kind, fields = {}) {
  return {
    sequence,
    observed_at_monotonic_ms: 8_421.125 + sequence * 0.437 + ((sequence * sequence * sequence) % 11) * 0.0037,
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
    event(4, "pointer", { callback: "onTouchesDown", phase: "down", x_dp: 300, y_dp: 220, dx_dp: 0, dy_dp: 0, viewport_width_dp: 354, intent_owner: "undetermined" }),
    event(5, "pointer", { callback: "onTouchesMove", phase: "intent", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, intent_owner: "horizontal" }),
    event(6, "pointer", { callback: "onBegin", phase: "begin", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, intent_owner: "horizontal" }),
    event(7, "pointer", { callback: "onChange", phase: "change", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, intent_owner: "horizontal" }),
    event(10, "pointer", { callback: "onEnd", phase: "release", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, intent_owner: "horizontal" }),
    event(12, "pointer", { callback: "onFinalize", phase: "finalize-release", x_dp: 211.5, y_dp: 220, dx_dp: -88.5, dy_dp: 0, viewport_width_dp: 354, intent_owner: "horizontal" }),
  ];
  const body = {
    schema_version: 1,
    id,
    group: "pointer",
    started_at_monotonic_ms: 8_420.125,
    completed_at_monotonic_ms: event(16, "unused").observed_at_monotonic_ms,
    viewport: viewport(1),
    pointer_events,
    rendered_panel_samples: [event(8, "rendered-panel", { viewport_x_dp: 18, previous_x_dp: -424.5, current_x_dp: -70.5, next_x_dp: 283.5, width_dp: 354 })],
    transition_events: [
      transition(9, "drag", state("idle"), state("dragging")),
      transition(11, "release", state("dragging"), state("settling", { current_month_id: "2026-11", selected_civil_date: "2026-11-15" }), ["settle-month"]),
      transition(15, "settle-complete", state("settling", { current_month_id: "2026-11", selected_civil_date: "2026-11-15" }), state("idle", { current_month_id: "2026-11", selected_civil_date: "2026-11-15", epoch: 1 })),
    ],
    semantic_samples: [semantic(3), semantic(16, { title: "November 2026", current_month_id: "2026-11", selected_civil_date: "2026-11-15", week_count: 6 })],
    callback_events: [event(14, "callback", { callback: "month-settle", epoch: 1 })],
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
    driver: createV12CalendarDriverReceipt(stage.id),
    screenshotSha256: HASH,
    traceSha256: hashV12CalendarObservationBody(stage),
  });
}

test("the production Calendar contract owns the exact 35-stage order and stage-specific schema groups", () => {
  assert.equal(V12_CALENDAR_STAGE_IDS.length, 35);
  assert.deepEqual(Object.values(V12_CALENDAR_STAGE_GROUPS).flat(), V12_CALENDAR_STAGE_IDS);
  assert.deepEqual(Object.keys(V12_CALENDAR_STAGE_GROUPS), ["pointer", "input_interrupt", "row_geometry", "month_geometry", "lifecycle", "reduced_motion", "baseline"]);
});

test("a real pointer observation is validated and its status is derived only by host assertions", () => {
  const result = derive();
  assert.equal(result.status, "PASS");
  assert.equal(result.observation.id, "drag-forward-release-exact");
  assert.ok(result.assertion_results.length >= 5);
  assert.ok(result.assertion_results.every(({ passed }) => passed));
  assert.deepEqual(Object.keys(result), ["id", "order", "status", "observation", "driver", "capture_measurement", "assertion_results", "terminal_marker_sha256", "screenshot_sha256", "trace_sha256"]);
  assert.doesNotMatch(JSON.stringify(result.observation), /expected|\bPASS\b|\bstatus\b|synthetic/u);
});

test("host validation distinguishes every commanded threshold and exact release outcome", () => {
  for (const [id, ratio, changed] of [
    ["drag-forward-10", 0.1, false],
    ["drag-forward-24_9", 0.249, false],
    ["drag-forward-25", 0.25, true],
    ["drag-forward-25_1", 0.251, true],
  ]) {
    const stage = structuredClone(pointerStage(id));
    const dx = -354 * ratio;
    for (const sample of stage.pointer_events) if (["onTouchesMove", "onBegin", "onChange", "onEnd", "onFinalize"].includes(sample.callback)) {
      sample.x_dp = 300 + dx; sample.dx_dp = dx;
    }
    stage.rendered_panel_samples[0].previous_x_dp = 18 - 354 + dx;
    stage.rendered_panel_samples[0].current_x_dp = 18 + dx;
    stage.rendered_panel_samples[0].next_x_dp = 18 + 354 + dx;
    stage.transition_events[0].after.drag_dx_dp = dx;
    stage.transition_events[0].after.title_panel = changed ? "next" : "current";
    stage.transition_events[1].before.drag_dx_dp = dx;
    stage.transition_events[1].before.title_panel = changed ? "next" : "current";
    if (!changed) {
      stage.transition_events[1].after.current_month_id = "2026-10";
      stage.transition_events[1].after.selected_civil_date = "2026-10-15";
      stage.transition_events[2].before.current_month_id = "2026-10";
      stage.transition_events[2].before.selected_civil_date = "2026-10-15";
      stage.transition_events[2].after.current_month_id = "2026-10";
      stage.transition_events[2].after.selected_civil_date = "2026-10-15";
      stage.semantic_samples[1] = semantic(16);
    }
    delete stage.observation_digest_sha256;
    stage.observation_digest_sha256 = hashV12CalendarObservationBody(stage);
    assert.equal(derive(stage).status, "PASS", id);
    const wrongCommand = structuredClone(createV12CalendarDriverReceipt(id));
    wrongCommand.sequences[0].points[1].dx_ratio += 0.01;
    assert.throws(() => deriveV12CalendarStageResult({ marker: marker(stage), expected: { nonce: NONCE, flowSha256: FLOW_SHA, stageId: id, order: V12_CALENDAR_STAGE_IDS.indexOf(id) }, driver: wrongCommand, screenshotSha256: HASH, traceSha256: hashV12CalendarObservationBody(stage) }), /calendar_observation_driver_invalid/u);
  }
});

test("host validation rejects duplicate callbacks, modeled clocks, and wrong month semantics", () => {
  const mutations = [
    (stage) => { stage.pointer_events.splice(4, 0, structuredClone(stage.pointer_events[3])); stage.pointer_events[4].sequence = 8; },
    (stage) => {
      const events = [stage.viewport, stage.motion, ...stage.pointer_events, ...stage.transition_events, ...stage.semantic_samples, ...stage.callback_events].sort((a, b) => a.sequence - b.sequence);
      events.forEach((entry, index) => { entry.observed_at_monotonic_ms = 1000 + index * index; });
      stage.started_at_monotonic_ms = 999; stage.completed_at_monotonic_ms = events.at(-1).observed_at_monotonic_ms;
    },
    (stage) => { stage.semantic_samples[1] = semantic(16); },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const stage = structuredClone(pointerStage()); mutate(stage);
    delete stage.observation_digest_sha256; stage.observation_digest_sha256 = hashV12CalendarObservationBody(stage);
    if (index === 2) assert.equal(derive(stage).status, "FAIL");
    else assert.throws(() => derive(stage), /calendar_observation_/u);
  }
});

test("settlement proof rejects wrong epochs, duplicate callbacks, and duplicate completion navigation", () => {
  const wrongEpoch = structuredClone(pointerStage());
  wrongEpoch.callback_events[0].epoch = 2;
  delete wrongEpoch.observation_digest_sha256;
  wrongEpoch.observation_digest_sha256 = hashV12CalendarObservationBody(wrongEpoch);
  assert.throws(() => derive(wrongEpoch), /calendar_observation_settle_contract_invalid/u);

  const wrongKind = structuredClone(pointerStage());
  wrongKind.callback_events[0].callback = "week-settle";
  delete wrongKind.observation_digest_sha256;
  wrongKind.observation_digest_sha256 = hashV12CalendarObservationBody(wrongKind);
  assert.throws(() => derive(wrongKind), /calendar_observation_settle_contract_invalid/u);

  const duplicateCallback = structuredClone(pointerStage());
  duplicateCallback.callback_events[0] = {
    ...duplicateCallback.callback_events[0],
    sequence: 13,
    observed_at_monotonic_ms: event(13, "unused").observed_at_monotonic_ms,
  };
  duplicateCallback.callback_events.push(event(14, "callback", { callback: "month-settle", epoch: 1 }));
  duplicateCallback.transition_events[2].sequence = 15;
  duplicateCallback.transition_events[2].observed_at_monotonic_ms = event(15, "unused").observed_at_monotonic_ms;
  duplicateCallback.semantic_samples[1].sequence = 16;
  duplicateCallback.semantic_samples[1].observed_at_monotonic_ms = event(16, "unused").observed_at_monotonic_ms;
  duplicateCallback.completed_at_monotonic_ms = duplicateCallback.semantic_samples[1].observed_at_monotonic_ms;
  delete duplicateCallback.observation_digest_sha256;
  duplicateCallback.observation_digest_sha256 = hashV12CalendarObservationBody(duplicateCallback);
  assert.throws(() => derive(duplicateCallback), /calendar_observation_settle_contract_invalid/u);

  const duplicateCompletion = structuredClone(pointerStage());
  duplicateCompletion.transition_events.push(transition(
    16,
    "settle-complete",
    state("settling", { current_month_id: "2026-11", selected_civil_date: "2026-11-15", epoch: 1 }),
    state("idle", { current_month_id: "2026-11", selected_civil_date: "2026-11-15", epoch: 1 }),
  ));
  duplicateCompletion.semantic_samples[1].sequence = 17;
  duplicateCompletion.semantic_samples[1].observed_at_monotonic_ms = event(17, "unused").observed_at_monotonic_ms;
  duplicateCompletion.completed_at_monotonic_ms = duplicateCompletion.semantic_samples[1].observed_at_monotonic_ms;
  delete duplicateCompletion.observation_digest_sha256;
  duplicateCompletion.observation_digest_sha256 = hashV12CalendarObservationBody(duplicateCompletion);
  assert.throws(() => derive(duplicateCompletion), /calendar_observation_settle_contract_invalid/u);
});

test("a structurally real threshold miss becomes FAIL instead of trusting a requested expected outcome", () => {
  const stage = structuredClone(pointerStage());
  for (const sample of stage.pointer_events) {
    if (sample.callback === "onChange" || sample.callback === "onEnd" || sample.callback === "onFinalize") {
      sample.x_dp = 212.5;
      sample.dx_dp = -87.5;
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
  const stage = structuredClone(createV12CalendarObservationFixture("drag-cancel", V12_CALENDAR_STAGE_IDS.indexOf("drag-cancel"), FLOW_SHA, NONCE).observation);
  const result = derive(stage);
  assert.equal(result.status, "PASS");
  assert.equal(result.assertion_results.find(({ id }) => id === "cancel-reset-rendered-zero")?.passed, true);
  assert.equal(result.assertion_results.find(({ id }) => id === "cancel-semantics-unchanged")?.passed, true);

  const malformed = structuredClone(stage);
  const prior = [...malformed.pointer_events, ...malformed.rendered_panel_samples, ...malformed.transition_events, ...malformed.semantic_samples]
    .sort((left, right) => left.sequence - right.sequence).at(-1);
  malformed.pointer_events.push({ ...event(prior.sequence + 1, "pointer", { callback: "onEnd", phase: "release", x_dp: 236.28, y_dp: 220, dx_dp: -63.72, dy_dp: 0, viewport_width_dp: 354, intent_owner: "horizontal" }), observed_at_monotonic_ms: prior.observed_at_monotonic_ms + 0.731 });
  malformed.completed_at_monotonic_ms = malformed.pointer_events.at(-1).observed_at_monotonic_ms;
  delete malformed.observation_digest_sha256;
  malformed.observation_digest_sha256 = hashV12CalendarObservationBody(malformed);
  assert.throws(() => derive(malformed), /calendar_observation_cancel_invalid/u);
});

test("collapse proves the inverse morph endpoint and selected-day focus restoration", () => {
  const stage = structuredClone(createV12CalendarObservationFixture("week-collapse-middle-row", V12_CALENDAR_STAGE_IDS.indexOf("week-collapse-middle-row"), FLOW_SHA, NONCE).observation);
  const result = derive(stage);
  assert.equal(result.assertion_results.find(({ id }) => id === "inverse-morph-endpoint")?.passed, true);
  assert.equal(result.assertion_results.find(({ id }) => id === "selected-day-focus-restored")?.passed, true);

  stage.focus_events[0].identity = "calendar-collapse-day";
  delete stage.observation_digest_sha256;
  stage.observation_digest_sha256 = hashV12CalendarObservationBody(stage);
  assert.equal(derive(stage).status, "FAIL");
});

test("reduced motion contains separate normal and runtime-toggled callback sequences", () => {
  const stage = structuredClone(createV12CalendarObservationFixture("reduced-motion", V12_CALENDAR_STAGE_IDS.indexOf("reduced-motion"), FLOW_SHA, NONCE).observation);
  const result = derive(stage);
  assert.ok(stage.callback_events.length >= 2);
  assert.equal(result.assertion_results.find(({ id }) => id === "normal-reduced-callback-comparison")?.passed, true);

  stage.callback_events = stage.callback_events.slice(0, 1);
  delete stage.observation_digest_sha256;
  stage.observation_digest_sha256 = hashV12CalendarObservationBody(stage);
  assert.throws(() => derive(stage), /calendar_observation_settle_contract_invalid/u);
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
    completed_at_monotonic_ms: event(14, "unused").observed_at_monotonic_ms,
    viewport: viewport(1),
    row_measurements: rows,
    rendered_overlay_samples: [
      event(13, "rendered-overlay", { phase: "expand", progress: 0, reduced_motion: false, selected_y_dp: 140, following_y_dp: 210, selected_month_y_dp: 140, following_month_y_dp: 210, viewport_height_dp: 560 }),
      event(14, "rendered-overlay", { phase: "expand", progress: 1, reduced_motion: false, selected_y_dp: 0, following_y_dp: 490, selected_month_y_dp: 140, following_month_y_dp: 210, viewport_height_dp: 560 }),
    ],
    transition_events: [
      transition(8, "expand", state("idle"), state("settling", { mode: "focused" }), ["settle-week"]),
      transition(10, "settle-complete", state("settling", { mode: "focused" }), state("idle", { mode: "focused", epoch: 1 })),
    ],
    semantic_samples: [semantic(11, { focused_week_start: "2026-10-15" })],
    callback_events: [event(9, "callback", { callback: "week-settle", epoch: 1 })],
    focus_events: [event(12, "focus", { identity: "calendar-collapse-day" })],
    motion: motion(7),
  };
  assert.equal(derive(withDigest(body)).status, "PASS");

  const fixed = structuredClone(body);
  fixed.row_measurements.forEach((row) => { row.y_dp = 0; });
  assert.throws(() => derive(withDigest(fixed)), /calendar_observation_row_geometry_invalid/u);
});

test("DEV-02 is derived from screenshot pixels and contrast, never a theme token echo", () => {
  const image = new PNG({ width: 2, height: 1 });
  image.data.set([155, 71, 11, 255, 255, 255, 255, 255]);
  const measured = analyzeV12CalendarScreenshot("dev-02-light-title", PNG.sync.write(image));
  assert.equal(measured.source, "screenshot-pixels");
  assert.deepEqual(measured.observed_rgb, [155, 71, 11]);
  assert.ok(measured.contrast_ratio >= 4.5);
  assert.throws(() => deriveV12CalendarStageResult({
    marker: marker(pointerStage()), expected: { nonce: NONCE, flowSha256: FLOW_SHA, stageId: "drag-forward-release-exact", order: V12_CALENDAR_STAGE_IDS.indexOf("drag-forward-release-exact") },
    driver: createV12CalendarDriverReceipt("drag-forward-release-exact"), captureMeasurement: { source: "theme-token", value: "#9B470B" }, screenshotSha256: HASH,
    traceSha256: hashV12CalendarObservationBody(pointerStage()),
  }), /calendar_observation_/u);
});

test("terminal selection rejects pre-stage and duplicate nonce markers", () => {
  const lines = encodeV12CalendarTerminalMarkerChunks(marker(), 300);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => line.startsWith(V12_CALENDAR_CHUNK_MARKER)));
  assert.equal(selectV12CalendarTerminalMarker({ beforeLogs: "", afterLogs: lines.join("\n"), nonce: NONCE, flowSha256: FLOW_SHA, stageId: "drag-forward-release-exact" }).stage.id, "drag-forward-release-exact");
  assert.throws(() => selectV12CalendarTerminalMarker({ beforeLogs: lines[0], afterLogs: lines.join("\n"), nonce: NONCE, flowSha256: FLOW_SHA, stageId: "drag-forward-release-exact" }), /calendar_observation_pre_stage_marker/u);
  for (const changed of [
    lines.slice(0, -1),
    [...lines, lines[0]],
    [lines[1], lines[0], ...lines.slice(2)],
    lines.map((line, index) => index === 0 ? line.replace(/"payload_sha256":"[a-f0-9]{64}"/u, `"payload_sha256":"${"0".repeat(64)}"`) : line),
    lines.map((line, index) => index === 0 ? line.replace(`"nonce":"${NONCE}"`, `"nonce":"${"c".repeat(32)}"`) : line),
  ]) {
    assert.throws(() => selectV12CalendarTerminalMarker({ beforeLogs: "", afterLogs: changed.join("\n"), nonce: NONCE, flowSha256: FLOW_SHA, stageId: "drag-forward-release-exact" }), /calendar_observation_(?:chunk|marker)/u);
  }
  const legacy = `GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify(marker())}`;
  assert.throws(() => selectV12CalendarTerminalMarker({ beforeLogs: "", afterLogs: legacy, nonce: NONCE, flowSha256: FLOW_SHA, stageId: "drag-forward-release-exact" }), /calendar_observation_marker_missing/u);
});

test("coverage rejects missing, duplicate, reordered, and missing-group stage results", () => {
  const complete = V12_CALENDAR_STAGE_IDS.map((id, order) => ({ id, order, group: Object.entries(V12_CALENDAR_STAGE_GROUPS).find(([, ids]) => ids.includes(id))?.[0] }));
  assert.equal(validateV12CalendarStageCoverage(complete), true);
  assert.throws(() => validateV12CalendarStageCoverage(complete.slice(1)), /calendar_observation_stage_coverage_invalid/u);
  assert.throws(() => validateV12CalendarStageCoverage(complete.map((entry, index) => index === 1 ? complete[0] : entry)), /calendar_observation_stage_coverage_invalid/u);
  assert.throws(() => validateV12CalendarStageCoverage(complete.map((entry) => entry.group === "baseline" ? { ...entry, group: "pointer" } : entry)), /calendar_observation_stage_coverage_invalid/u);
});
