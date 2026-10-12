import { expect, test } from "@jest/globals";

import {
  createPhase16CalendarTestControls,
  phase16CalendarStageFromNativeContract,
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
