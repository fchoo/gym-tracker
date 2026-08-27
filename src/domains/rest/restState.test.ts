import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  adjustRestState,
  expireRestState,
  pauseRestState,
  remainingRestMs,
  resumeRestState,
  skipRestState,
  startRestState,
  type RestStateV1,
} from "./restState";

const running: RestStateV1 = {
  version: 1,
  state: "running",
  revision: 3,
  startedAtMs: 10_000,
  endsAtMs: 100_000,
  nextSetId: "set-2",
};

describe("Plan 01-09 timestamp-derived rest state", () => {
  it("derives remaining time from timestamps without persisting a counter", () => {
    expect(remainingRestMs(running, 40_000)).toBe(60_000);
    expect(remainingRestMs(running, 100_000)).toBe(0);
    expect(remainingRestMs({
      version: 1,
      state: "paused",
      revision: 4,
      remainingMs: 45_000,
      nextSetId: "set-2",
    }, 999_999)).toBe(45_000);
    expect(remainingRestMs({
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    }, 40_000)).toBe(0);
  });

  it("pauses from the injected clock and resumes with fresh timestamps", () => {
    expect(pauseRestState(running, 40_000)).toEqual({
      version: 1,
      state: "paused",
      revision: 4,
      remainingMs: 60_000,
      nextSetId: "set-2",
    });
    expect(resumeRestState({
      version: 1,
      state: "paused",
      revision: 4,
      remainingMs: 60_000,
      nextSetId: "set-2",
    }, 50_000)).toEqual({
      version: 1,
      state: "running",
      revision: 5,
      startedAtMs: 50_000,
      endsAtMs: 110_000,
      nextSetId: "set-2",
    });
  });

  it("adjusts running and paused rest by 15 seconds and clamps at expiry", () => {
    expect(adjustRestState(running, 40_000, 15_000)).toEqual({
      ...running,
      revision: 4,
      endsAtMs: 115_000,
    });
    expect(adjustRestState({
      version: 1,
      state: "paused",
      revision: 4,
      remainingMs: 20_000,
      nextSetId: "set-2",
    }, 50_000, -15_000)).toEqual({
      version: 1,
      state: "paused",
      revision: 5,
      remainingMs: 5_000,
      nextSetId: "set-2",
    });
    expect(adjustRestState({
      version: 1,
      state: "paused",
      revision: 4,
      remainingMs: 10_000,
      nextSetId: "set-2",
    }, 50_000, -15_000)).toEqual({
      version: 1,
      state: "expired",
      revision: 5,
      expiredAtMs: 50_000,
      nextSetId: "set-2",
    });
  });

  it("expires only due running rest and rejects invalid transitions", () => {
    expect(expireRestState(running, 100_000)).toEqual({
      version: 1,
      state: "expired",
      revision: 4,
      expiredAtMs: 100_000,
      nextSetId: "set-2",
    });
    expect(() => expireRestState(running, 99_999)).toThrow(
      "rest_not_due",
    );
    expect(() => pauseRestState({
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    }, 1)).toThrow("rest_not_running");
    expect(() => resumeRestState(running, 1)).toThrow("rest_not_paused");
    expect(() => adjustRestState(running, 1, 1)).toThrow(
      "rest_adjustment_invalid",
    );
  });

  it("starts from idle or expired state and rejects invalid clocks, durations, and active rest", () => {
    expect(startRestState({
      current: {
        version: 1,
        state: "expired",
        revision: 4,
        expiredAtMs: 90_000,
        nextSetId: "set-2",
      },
      nowMs: 100_000,
      durationMs: 30_000,
      nextSetId: "set-3",
    })).toEqual({
      version: 1,
      state: "running",
      revision: 5,
      startedAtMs: 100_000,
      endsAtMs: 130_000,
      nextSetId: "set-3",
    });
    expect(() => remainingRestMs(running, -1)).toThrow("rest_time_invalid");
    expect(() => startRestState({
      current: running,
      nowMs: 1,
      durationMs: 30_000,
      nextSetId: "set-3",
    })).toThrow("rest_already_active");
    expect(() => startRestState({
      current: {
        version: 1,
        state: "idle",
        revision: 0,
        nextSetId: null,
      },
      nowMs: 1,
      durationMs: 0,
      nextSetId: "set-1",
    })).toThrow("rest_duration_invalid");
  });

  it("expires when pausing or resuming at zero and rejects non-active skip", () => {
    expect(pauseRestState(running, 100_000)).toEqual({
      version: 1,
      state: "expired",
      revision: 4,
      expiredAtMs: 100_000,
      nextSetId: "set-2",
    });
    expect(resumeRestState({
      version: 1,
      state: "paused",
      revision: 4,
      remainingMs: 0,
      nextSetId: "set-2",
    }, 100_000)).toEqual({
      version: 1,
      state: "expired",
      revision: 5,
      expiredAtMs: 100_000,
      nextSetId: "set-2",
    });
    expect(() => adjustRestState({
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    }, 1, 15_000)).toThrow("rest_not_adjustable");
    expect(() => expireRestState({
      version: 1,
      state: "paused",
      revision: 1,
      remainingMs: 1,
      nextSetId: "set-2",
    }, 1)).toThrow("rest_not_running");
    expect(() => skipRestState({
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    })).toThrow("rest_not_active");
    expect(skipRestState(running)).toEqual({
      version: 1,
      state: "idle",
      revision: 4,
      nextSetId: null,
    });
  });
});
