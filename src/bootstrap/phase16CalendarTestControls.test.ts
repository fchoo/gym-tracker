import { expect, jest, test } from "@jest/globals";

import {
  clearPhase16CalendarTestControls,
  configurePhase16CalendarTestControls,
  createPhase16CalendarTestControls,
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
  expect(phase16CalendarStageFromNativeContract({ ...developmentIdentity, stage: "real-user-calendar" })).toBeNull();
});

test("Phase 16 Calendar controls retain deterministic synthetic diagnostics only", () => {
  const controls = createPhase16CalendarTestControls({
    ...developmentIdentity,
    stage: "drag-forward-25",
    nowMs: (() => { let now = 1_800_000_000_000; return () => ++now; })(),
  });
  expect(controls).not.toBeNull();
  controls?.recordDrag({ dx: -90, viewportWidth: 360, transformX: -90, semanticMonth: "2026-10", titleMonth: "2026-11" });
  controls?.recordFocus({ selected: { y: 112, height: 64 }, following: { y: 176, height: 64 }, destination: { selectedY: 0, followingY: 296 } });
  expect(controls?.trace()).toEqual(expect.objectContaining({
    stage: "drag-forward-25",
    synthetic: true,
    samples: [
      expect.objectContaining({ kind: "drag", timestampMs: 1_800_000_000_001 }),
      expect.objectContaining({ kind: "focus", focusRingWidthDp: 3, focusClearanceDp: 4 }),
    ],
  }));
  expect(JSON.stringify(controls?.trace())).not.toMatch(/sessionId|eventId|token|email|serial/u);
});

test("Phase 16 Calendar controls reject unsafe samples and retain no global recorder outside exact identity", () => {
  let now = 1_800_000_000_000;
  const controls = createPhase16CalendarTestControls({ ...developmentIdentity, stage: "drag-cancel", nowMs: () => now });
  expect(controls).not.toBeNull();
  expect(() => controls?.recordDrag({ dx: Number.NaN, viewportWidth: 360, transformX: 0, semanticMonth: "2026-10", titleMonth: "2026-10" })).toThrow("phase16_calendar_diagnostic_number_invalid");
  expect(() => controls?.recordDrag({ dx: 0, viewportWidth: 360, transformX: 0, semanticMonth: "October", titleMonth: "2026-10" })).toThrow("phase16_calendar_diagnostic_month_invalid");
  now = 1_600_000_000_000;
  expect(() => controls?.recordCancel()).toThrow("phase16_calendar_diagnostic_clock_invalid");

  let clock = 1_800_000_100_000;
  const dateNow = jest.spyOn(Date, "now").mockImplementation(() => ++clock);
  try {
    configurePhase16CalendarTestControls({ ...developmentIdentity, stage: "drag-cancel" });
    recordPhase16CalendarDrag({ dx: 0, viewportWidth: 360, transformX: 0, semanticMonth: "2026-10", titleMonth: "2026-10" });
    recordPhase16CalendarRelease({ dx: 0, viewportWidth: 360, semanticMonth: "2026-10", titleMonth: "2026-10" });
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
