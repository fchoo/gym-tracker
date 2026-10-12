import { expect, jest, test } from "@jest/globals";

import {
  clearPhase16CalendarTestControls,
  configurePhase16CalendarTestControls,
  createPhase16CalendarDiagnosticsProducer,
  createPhase16CalendarTestControls,
  phase16CalendarDiagnosticsRequestFromNativeContract,
  phase16CalendarStageFromNativeContract,
  recordPhase16CalendarCancel,
  recordPhase16CalendarDrag,
  recordPhase16CalendarFocus,
  recordPhase16CalendarRelease,
} from "./phase16CalendarTestControls";

const developmentIdentity = {
  packageName: "com.fchoo.gymtracker.devtest",
  buildProfile: "development-test",
  nativeContractsEnabled: true,
  suite: "phase16-calendar",
} as const;

test("Phase 16 Calendar controls require the exact development-test identity and bounded stage", () => {
  expect(phase16CalendarStageFromNativeContract({ ...developmentIdentity, stage: "drag-forward-25" })).toBe("drag-forward-25");
  expect(phase16CalendarStageFromNativeContract({ ...developmentIdentity, packageName: "com.fchoo.gymtracker", stage: "drag-forward-25" })).toBeNull();
  expect(phase16CalendarStageFromNativeContract({ ...developmentIdentity, buildProfile: "production", stage: "drag-forward-25" })).toBeNull();
  expect(phase16CalendarStageFromNativeContract({ ...developmentIdentity, nativeContractsEnabled: false, stage: "drag-forward-25" })).toBeNull();
  expect(phase16CalendarStageFromNativeContract({ ...developmentIdentity, suite: "phase15-workout", stage: "drag-forward-25" })).toBeNull();
  expect(phase16CalendarStageFromNativeContract({ ...developmentIdentity, stage: undefined })).toBeNull();
  expect(phase16CalendarStageFromNativeContract({ ...developmentIdentity, stage: "real-user-calendar" })).toBeNull();
  expect(createPhase16CalendarTestControls({ ...developmentIdentity, stage: "unknown" })).toBeNull();
});

test("Phase 16 Calendar controls retain deterministic synthetic diagnostics only", () => {
  const controls = createPhase16CalendarTestControls({
    ...developmentIdentity,
    stage: "drag-forward-25",
    nowMs: (() => { let now = 1_800_000_000_000; return () => ++now; })(),
  });
  expect(controls).not.toBeNull();
  controls?.recordDrag({ dx: -90, viewportWidth: 360, transformX: -90, semanticOffset: 0, titleOffset: 1 });
  controls?.recordFocus({ selected: { y: 112, height: 64 }, following: { y: 176, height: 64 }, destination: { selectedY: 0, followingY: 296 } });
  expect(controls?.trace()).toEqual(expect.objectContaining({
    stage: "drag-forward-25",
    synthetic: true,
    samples: [
      expect.objectContaining({ kind: "drag", elapsedMs: 1, semanticOffset: 0, titleOffset: 1 }),
      expect.objectContaining({ kind: "focus", focusRingWidthDp: 3, focusClearanceDp: 4 }),
    ],
  }));
  expect(JSON.stringify(controls?.trace())).not.toMatch(/sessionId|eventId|token|email|serial|2026-/u);

  const legacyInputControls = createPhase16CalendarTestControls({
    ...developmentIdentity,
    stage: "drag-forward-release-exact",
    nowMs: (() => { let now = 1_800_000_010_000; return () => ++now; })(),
  });
  legacyInputControls?.recordDrag({ dx: -90, viewportWidth: 360, transformX: -90, semanticMonth: "2026-10", titleMonth: "2026-11" });
  legacyInputControls?.recordRelease({ dx: -90, viewportWidth: 360, semanticMonth: "2026-11", titleMonth: "2026-11" });
  expect(legacyInputControls?.trace().samples.map(({ semanticOffset, titleOffset }) => [semanticOffset, titleOffset])).toEqual([[0, 1], [1, 1]]);
});

test("Phase 16 Calendar controls reject unsafe samples and retain no global recorder outside exact identity", () => {
  let now = 1_800_000_000_000;
  const controls = createPhase16CalendarTestControls({ ...developmentIdentity, stage: "drag-cancel", nowMs: () => now });
  expect(controls).not.toBeNull();
  expect(() => controls?.recordDrag({ dx: Number.NaN, viewportWidth: 360, transformX: 0, semanticOffset: 0, titleOffset: 0 })).toThrow("phase16_calendar_diagnostic_number_invalid");
  expect(() => controls?.recordDrag({ dx: 100_001, viewportWidth: 360, transformX: 0, semanticOffset: 0, titleOffset: 0 })).toThrow("phase16_calendar_diagnostic_number_invalid");
  expect(() => controls?.recordDrag({ dx: 0, viewportWidth: 360, transformX: 0, semanticOffset: 2, titleOffset: 0 })).toThrow("phase16_calendar_diagnostic_offset_invalid");
  expect(() => controls?.recordDrag({ dx: 0, viewportWidth: 360, transformX: 0, semanticMonth: "October", titleMonth: "2026-10" })).toThrow("phase16_calendar_diagnostic_month_invalid");
  expect(() => controls?.recordDrag({ dx: 0, viewportWidth: 360, transformX: 0, semanticMonth: "2026-13", titleMonth: "2026-10" })).toThrow("phase16_calendar_diagnostic_month_invalid");
  now = 1_600_000_000_000;
  expect(() => controls?.recordCancel()).toThrow("phase16_calendar_diagnostic_clock_invalid");

  let clock = 1_800_000_100_000;
  const dateNow = jest.spyOn(Date, "now").mockImplementation(() => ++clock);
  try {
    configurePhase16CalendarTestControls({ ...developmentIdentity, stage: "drag-cancel" });
    recordPhase16CalendarDrag({ dx: 0, viewportWidth: 360, transformX: 0, semanticOffset: 0, titleOffset: 0 });
    recordPhase16CalendarRelease({ dx: 0, viewportWidth: 360, semanticOffset: 0, titleOffset: 0 });
    recordPhase16CalendarFocus({ selected: { y: 0, height: 64 }, following: { y: 64, height: 64 }, destination: { selectedY: 0, followingY: 296 } });
    recordPhase16CalendarCancel();
    clearPhase16CalendarTestControls();
  } finally {
    dateNow.mockRestore();
  }
  configurePhase16CalendarTestControls({ ...developmentIdentity, packageName: "com.fchoo.gymtracker", stage: "drag-cancel" });
  expect(() => recordPhase16CalendarCancel()).not.toThrow();
  clearPhase16CalendarTestControls();
});

test("Phase 16 diagnostics request and producer export only bounded aggregate native samples", () => {
  const request = phase16CalendarDiagnosticsRequestFromNativeContract({
    ...developmentIdentity,
    enabled: "true",
    querySamples: "100",
    interactionSamples: "100",
  });
  expect(request).toEqual({ querySamples: 100, interactionSamples: 100 });
  expect(phase16CalendarDiagnosticsRequestFromNativeContract({
    ...developmentIdentity,
    packageName: "com.fchoo.gymtracker",
    enabled: "true",
    querySamples: "100",
    interactionSamples: "100",
  })).toBeNull();
  for (const input of [
    { ...developmentIdentity, enabled: "false", querySamples: "100", interactionSamples: "100" },
    { ...developmentIdentity, enabled: "true", querySamples: ["100"], interactionSamples: "100" },
    { ...developmentIdentity, enabled: "true", querySamples: "100", interactionSamples: ["100"] },
    { ...developmentIdentity, enabled: "true", querySamples: "99", interactionSamples: "100" },
    { ...developmentIdentity, enabled: "true", querySamples: "100", interactionSamples: "501" },
  ] as const) expect(phase16CalendarDiagnosticsRequestFromNativeContract(input)).toBeNull();
  expect(createPhase16CalendarDiagnosticsProducer({ ...developmentIdentity, request: null, emitLine: () => undefined })).toBeNull();

  const emitted: string[] = [];
  const producer = createPhase16CalendarDiagnosticsProducer({
    ...developmentIdentity,
    request,
    emitLine: (line) => emitted.push(line),
  });
  expect(producer).not.toBeNull();
  for (let index = 0; index < 100; index += 1) {
    producer?.recordQuery({ durationMs: index + 1, eventCount: 2, planCount: 1, importedCount: 1 });
    producer?.recordInteraction({ frameWorkMs: [1, 2], missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0.1 });
  }
  const raw = producer?.exportResult();
  expect(raw).toEqual(expect.objectContaining({
    producer: "v12-calendar-native-diagnostics/v1",
    native_execution: "EXECUTED",
    query_samples: expect.any(Array),
    interaction_samples: expect.any(Array),
  }));
  expect(emitted).toEqual([
    `GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_RESULT:${JSON.stringify(raw)}`,
  ]);
  expect(() => producer?.exportResult()).toThrow("phase16_calendar_diagnostics_exported");
});

test("Phase 16 diagnostics producer rejects incomplete, overflowing, and malformed aggregates", () => {
  const request = { querySamples: 100, interactionSamples: 100 } as const;
  const producer = createPhase16CalendarDiagnosticsProducer({ ...developmentIdentity, request, emitLine: () => undefined });
  expect(() => producer?.exportResult()).toThrow("phase16_calendar_diagnostics_incomplete");
  expect(() => producer?.recordQuery({ durationMs: -1, eventCount: 0, planCount: 0, importedCount: 0 })).toThrow("phase16_calendar_diagnostics_duration_invalid");
  expect(() => producer?.recordQuery({ durationMs: 1, eventCount: -1, planCount: 0, importedCount: 0 })).toThrow("phase16_calendar_diagnostics_count_invalid");
  expect(() => producer?.recordQuery({ durationMs: 1, eventCount: 1, planCount: 0.5, importedCount: 0 })).toThrow("phase16_calendar_diagnostics_count_invalid");
  expect(() => producer?.recordQuery({ durationMs: 1, eventCount: 10_001, planCount: 0, importedCount: 0 })).toThrow("phase16_calendar_diagnostics_count_invalid");
  expect(() => producer?.recordInteraction({ frameWorkMs: [], missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0 })).toThrow("phase16_calendar_diagnostics_frame_count_invalid");
  expect(() => producer?.recordInteraction({ frameWorkMs: Array.from({ length: 10_001 }, () => 1), missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0 })).toThrow("phase16_calendar_diagnostics_frame_count_invalid");
  expect(() => producer?.recordInteraction({ frameWorkMs: [Number.NaN], missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0 })).toThrow("phase16_calendar_diagnostics_duration_invalid");

  for (let index = 0; index < 100; index += 1) {
    producer?.recordQuery({ durationMs: 1, eventCount: 0, planCount: 0, importedCount: 0 });
    producer?.recordInteraction({ frameWorkMs: [1], missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0 });
  }
  expect(() => producer?.recordQuery({ durationMs: 1, eventCount: 0, planCount: 0, importedCount: 0 })).toThrow("phase16_calendar_diagnostics_query_overflow");
  expect(() => producer?.recordInteraction({ frameWorkMs: [1], missedFrames: 0, refreshRateHz: 60, profilerOverheadMs: 0 })).toThrow("phase16_calendar_diagnostics_interaction_overflow");
});

test("Phase 16 Calendar controls reject repeated timestamps and a trace buffer beyond its bounded capacity", () => {
  const repeatedTimestamp = createPhase16CalendarTestControls({
    ...developmentIdentity,
    stage: "drag-cancel",
    nowMs: () => 1_800_000_000_000,
  });
  repeatedTimestamp?.recordCancel();
  expect(() => repeatedTimestamp?.recordCancel()).toThrow("phase16_calendar_diagnostic_clock_invalid");

  let now = 1_800_000_100_000;
  const boundedTrace = createPhase16CalendarTestControls({
    ...developmentIdentity,
    stage: "drag-cancel",
    nowMs: () => ++now,
  });
  for (let index = 0; index < 64; index += 1) boundedTrace?.recordCancel();
  expect(() => boundedTrace?.recordCancel()).toThrow("phase16_calendar_diagnostic_overflow");
});
