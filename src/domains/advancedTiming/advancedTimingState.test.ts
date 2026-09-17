import {
  AdvancedTimingStateTransitionError,
  pauseAdvancedTimingState,
  reconcileAdvancedTimingState,
  resumeAdvancedTimingState,
  startAdvancedTimingState,
  stopAdvancedTimingState,
  type AdvancedTimingStateV1,
} from "./advancedTimingState";

const perRep = {
  version: 1 as const,
  mode: "per_rep" as const,
  intervalMs: 1_000,
  cueChannels: "haptic" as const,
};

const idle: AdvancedTimingStateV1 = {
  version: 1,
  state: "idle",
  revision: 2,
  targetSessionSetId: null,
};

describe("AdvancedTimingStateV1", () => {
  it("starts only a per-rep cadence from an inactive state", () => {
    expect(startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_000,
    })).toEqual({
      version: 1,
      state: "running",
      mode: "per_rep",
      revision: 3,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      intervalMs: 1_000,
      startedAtMs: 10_000,
      nextBoundaryAtMs: 11_000,
      nextRepetitionIndex: 1,
    });

    expect(() => startAdvancedTimingState({
      current: idle,
      config: { version: 1, mode: "off" },
      sessionSetId: "set-1",
      nowMs: 10_000,
    })).toThrow("advanced_timing_config_not_per_rep");
    expect(() => startAdvancedTimingState({
      current: { ...idle, targetSessionSetId: "unexpected" } as unknown as AdvancedTimingStateV1,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_000,
    })).toThrow("advanced_timing_state_invalid");
  });

  it("reconciles one foreground boundary without deriving a decrementing clock", () => {
    const running = startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    expect(reconcileAdvancedTimingState({
      state: running,
      nowMs: 10_999,
      foregroundSinceMs: 10_000,
    })).toEqual({ state: running, cue: null, skippedBoundaryCount: 0 });
    expect(reconcileAdvancedTimingState({
      state: running,
      nowMs: 11_001,
      foregroundSinceMs: 10_000,
    })).toEqual({
      state: {
        ...running,
        revision: 4,
        nextBoundaryAtMs: 12_000,
        nextRepetitionIndex: 2,
      },
      cue: { repetitionIndex: 1, boundaryAtMs: 11_000 },
      skippedBoundaryCount: 0,
    });
  });

  it("skips missed background cadence instead of replaying it on foreground", () => {
    const running = startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    expect(reconcileAdvancedTimingState({
      state: running,
      nowMs: 20_050,
      foregroundSinceMs: 20_000,
    })).toEqual({
      state: {
        ...running,
        revision: 4,
        nextBoundaryAtMs: 21_000,
        nextRepetitionIndex: 11,
      },
      cue: { repetitionIndex: 10, boundaryAtMs: 20_000 },
      skippedBoundaryCount: 9,
    });
  });

  it("reports only the latest boundary crossed while foreground and advances revision once", () => {
    const running = startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 0,
    });
    expect(reconcileAdvancedTimingState({
      state: running,
      nowMs: 5_050,
      foregroundSinceMs: 2_500,
    })).toEqual({
      state: {
        ...running,
        revision: 4,
        nextBoundaryAtMs: 6_000,
        nextRepetitionIndex: 6,
      },
      cue: { repetitionIndex: 5, boundaryAtMs: 5_000 },
      skippedBoundaryCount: 4,
    });
  });

  it("pauses, resumes, and stops through independent revisions", () => {
    const running = startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    const paused = pauseAdvancedTimingState(running, 10_400);
    expect(paused).toEqual({
      version: 1,
      state: "paused",
      mode: "per_rep",
      revision: 4,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      intervalMs: 1_000,
      remainingMs: 600,
      nextRepetitionIndex: 1,
    });
    const resumed = resumeAdvancedTimingState(paused, 20_000);
    expect(resumed).toEqual({
      ...running,
      revision: 5,
      startedAtMs: 20_000,
      nextBoundaryAtMs: 20_600,
    });
    expect(stopAdvancedTimingState(resumed, 20_100)).toEqual({
      version: 1,
      state: "stopped",
      mode: "per_rep",
      revision: 6,
      targetSessionSetId: "set-1",
      stoppedAtMs: 20_100,
      nextRepetitionIndex: 1,
    });
  });

  it("rejects invalid transitions, identifiers, revisions, and clock values", () => {
    const running = startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    expect(() => startAdvancedTimingState({
      current: running,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_001,
    })).toThrow("advanced_timing_already_active");
    expect(() => pauseAdvancedTimingState(idle, 1)).toThrow("advanced_timing_not_running");
    expect(() => resumeAdvancedTimingState(running, 1)).toThrow("advanced_timing_not_paused");
    expect(() => stopAdvancedTimingState(idle, 1)).toThrow("advanced_timing_not_active");
    expect(() => reconcileAdvancedTimingState({
      state: running,
      nowMs: 10,
      foregroundSinceMs: 11,
    })).toThrow("advanced_timing_time_invalid");
    expect(() => startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "",
      nowMs: 1,
    })).toThrow(AdvancedTimingStateTransitionError);
  });
});
import {
  describe,
  expect,
  it,
} from "@jest/globals";

