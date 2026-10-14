import { describe, expect, it } from "@jest/globals";

import {
  V12_CALENDAR_ACCEPTANCE_CASES,
  runV12CalendarAcceptanceContract,
} from "./v12CalendarAcceptance.contract";

const observation = Object.freeze({
  sourceDigest: "a".repeat(64),
  nativeExecution: "NOT_RUN",
  samples: [
    { timestampMs: 1, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "November 2026", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "2026-11-01", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar-day-2026-11-01", motion: "normal" },
    { timestampMs: 2, widthDp: 400, dxDp: -100, dyDp: 0, intentOwner: "horizontal", translationDp: -100, title: "November 2026", selectedCivilDate: "2026-11-01", generation: 1, focusedWeek: "2026-11-01", rowBounds: [0, 64], callbackCount: 1, focusIdentity: "calendar-day-2026-11-01", motion: "normal" },
  ],
});

describe("v1.2 Calendar native-acceptance contract", () => {
  it("keeps NV-CAL-01 through NV-CAL-09 as an observation-only registry", () => {
    expect(V12_CALENDAR_ACCEPTANCE_CASES.map(({ id }) => id)).toEqual([
      "NV-CAL-01", "NV-CAL-02", "NV-CAL-03", "NV-CAL-04", "NV-CAL-05",
      "NV-CAL-06", "NV-CAL-07", "NV-CAL-08", "NV-CAL-09",
    ]);
    expect(V12_CALENDAR_ACCEPTANCE_CASES.every(({ disposition }) => disposition === "observe-only")).toBe(true);
  });

  it("accepts monotonic intermediate geometry with inclusive 25 percent semantics but no PASS verdict", () => {
    expect(runV12CalendarAcceptanceContract(observation)).toEqual({ status: "NOT_RUN", caseCount: 9 });
  });

  it("fails closed for final-only, non-monotonic, stale, wrong-boundary, and mutated traces", () => {
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [observation.samples[0]!] })).toThrow("calendar_intermediate_samples_required");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...observation.samples[0], timestampMs: 2 }, { ...observation.samples[1], timestampMs: 1 }] })).toThrow("calendar_timestamp_non_monotonic");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: observation.samples.map((sample) => ({ ...sample, generation: 0 })) })).toThrow("calendar_generation_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: observation.samples.map((sample) => ({ ...sample, dxDp: -99.5, translationDp: -99.5 })) })).toThrow("calendar_threshold_boundary_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, nativeExecution: "PASS" as unknown as "NOT_RUN" })).toThrow("calendar_execution_invalid");
  });

  it("rejects malformed source and every required intermediate sample field", () => {
    const first = observation.samples[0]!;
    const second = observation.samples[1]!;
    expect(() => runV12CalendarAcceptanceContract({ ...observation, sourceDigest: "bad" })).toThrow("calendar_source_digest_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: null as unknown as [] })).toThrow("calendar_intermediate_samples_required");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, timestampMs: Number.NaN }, second] })).toThrow("calendar_timestamp_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, widthDp: 0 }, second] })).toThrow("calendar_translation_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, dxDp: "bad" }, second] })).toThrow("calendar_dx_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, dyDp: "bad" }, second] })).toThrow("calendar_dy_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, translationDp: "bad" }, second] })).toThrow("calendar_translation_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, intentOwner: "bad" }, second] })).toThrow("calendar_intent_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, title: " " }, second] })).toThrow("calendar_title_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, selectedCivilDate: "bad" }, second] })).toThrow("calendar_date_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, rowBounds: [0] }, second] })).toThrow("calendar_row_bounds_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, callbackCount: 0 }, second] })).toThrow("calendar_callback_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [first, { ...second, callbackCount: 0 }] })).toThrow("calendar_callback_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, generation: 2 }, { ...second, generation: 1 }] })).toThrow("calendar_generation_stale");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, callbackCount: 2 }, { ...second, callbackCount: 1 }] })).toThrow("calendar_callback_stale");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, focusIdentity: " " }, second] })).toThrow("calendar_focus_identity_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [{ ...first, motion: "bad" }, second] })).toThrow("calendar_motion_invalid");
    expect(() => runV12CalendarAcceptanceContract({ ...observation, samples: [null as unknown as typeof first, second] })).toThrow("calendar_sample_invalid");
  });
});
