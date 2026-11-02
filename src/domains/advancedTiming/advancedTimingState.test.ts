import {
  AdvancedTimingStateTransitionError,
  beginClusterGapState,
  pauseAdvancedTimingState,
  reconcileAdvancedTimingState,
  resumeAdvancedTimingState,
  skipClusterGapState,
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

const cluster = {
  version: 1 as const,
  mode: "cluster" as const,
  groupSizes: [3, 3, 3] as const,
  intraRestMs: 20_000,
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

  it("starts a cluster set as one target row with explicit group readiness", () => {
    expect(startAdvancedTimingState({
      current: idle,
      config: cluster,
      sessionSetId: "set-1",
      nowMs: 10_000,
    })).toEqual({
      version: 1,
      state: "cluster_ready",
      mode: "cluster",
      revision: 3,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 0,
    });
  });

  it("runs, pauses, resumes, skips, and rejects final cluster gaps", () => {
    const ready = startAdvancedTimingState({
      current: idle,
      config: cluster,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    const gap = beginClusterGapState(ready, 30_000);
    expect(gap).toEqual({
      version: 1,
      state: "cluster_gap_running",
      mode: "cluster",
      revision: 4,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 0,
      gapStartedAtMs: 30_000,
      gapEndsAtMs: 50_000,
    });
    const paused = pauseAdvancedTimingState(gap, 40_000);
    expect(paused).toEqual({
      version: 1,
      state: "cluster_gap_paused",
      mode: "cluster",
      revision: 5,
      targetSessionSetId: "set-1",
      cueChannels: "haptic",
      groupSizes: [3, 3, 3],
      intraRestMs: 20_000,
      currentGroupIndex: 0,
      remainingMs: 10_000,
    });
    const resumed = resumeAdvancedTimingState(paused, 60_000);
    expect(resumed).toEqual({
      ...gap,
      revision: 6,
      gapStartedAtMs: 60_000,
      gapEndsAtMs: 70_000,
    });
    const secondReady = skipClusterGapState(resumed);
    expect(secondReady).toEqual({
      ...ready,
      revision: 7,
      currentGroupIndex: 1,
    });
    const thirdReady = skipClusterGapState(beginClusterGapState(secondReady, 90_000));
    expect(thirdReady).toEqual({
      ...ready,
      revision: 9,
      currentGroupIndex: 2,
    });
    expect(() => beginClusterGapState(thirdReady, 100_000))
      .toThrow("advanced_timing_cluster_complete");
    expect(() => skipClusterGapState(ready))
      .toThrow("advanced_timing_cluster_gap_not_active");
    expect(() => beginClusterGapState(gap, 100_000))
      .toThrow("advanced_timing_cluster_not_ready");
  });

  it("reconciles cluster gaps from absolute timestamps without replaying missed cues", () => {
    const ready = startAdvancedTimingState({
      current: idle,
      config: cluster,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    const gap = beginClusterGapState(ready, 30_000);
    expect(reconcileAdvancedTimingState({
      state: gap,
      nowMs: 49_999,
      foregroundSinceMs: 30_000,
    })).toEqual({ state: gap, cue: null, skippedBoundaryCount: 0 });
    expect(reconcileAdvancedTimingState({
      state: gap,
      nowMs: 50_000,
      foregroundSinceMs: 49_000,
    })).toEqual({
      state: {
        ...ready,
        revision: 5,
        currentGroupIndex: 1,
      },
      cue: { repetitionIndex: 2, boundaryAtMs: 50_000 },
      skippedBoundaryCount: 0,
    });
    expect(reconcileAdvancedTimingState({
      state: gap,
      nowMs: 70_000,
      foregroundSinceMs: 50_001,
    })).toEqual({
      state: {
        ...ready,
        revision: 5,
        currentGroupIndex: 1,
      },
      cue: null,
      skippedBoundaryCount: 1,
    });
  });

  it("stops cluster progress without completing the recorded set", () => {
    const ready = startAdvancedTimingState({
      current: idle,
      config: cluster,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    expect(stopAdvancedTimingState(ready, 20_000)).toEqual({
      version: 1,
      state: "stopped",
      mode: "cluster",
      revision: 4,
      targetSessionSetId: "set-1",
      stoppedAtMs: 20_000,
      currentGroupIndex: 0,
    });
    expect(stopAdvancedTimingState(beginClusterGapState(ready, 30_000), 40_000))
      .toEqual({
        version: 1,
        state: "stopped",
        mode: "cluster",
        revision: 5,
        targetSessionSetId: "set-1",
        stoppedAtMs: 40_000,
        currentGroupIndex: 1,
      });
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

  it("handles stopped restarts, zero-remaining pauses, and a paused stop", () => {
    const running = startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    const pausedAtBoundary = pauseAdvancedTimingState(running, 11_000);
    if (pausedAtBoundary.state !== "paused") {
      throw new Error("advanced_timing_pause_state_invalid");
    }
    expect(pausedAtBoundary.remainingMs).toBe(0);
    expect(stopAdvancedTimingState(pausedAtBoundary, 11_001)).toEqual({
      version: 1,
      state: "stopped",
      mode: "per_rep",
      revision: 5,
      targetSessionSetId: "set-1",
      stoppedAtMs: 11_001,
      nextRepetitionIndex: 1,
    });
    const stopped: AdvancedTimingStateV1 = {
      version: 1,
      state: "stopped",
      mode: "per_rep",
      revision: 5,
      targetSessionSetId: "set-1",
      stoppedAtMs: 11_001,
      nextRepetitionIndex: 1,
    };
    expect(startAdvancedTimingState({
      current: stopped,
      config: perRep,
      sessionSetId: "set-2",
      nowMs: 20_000,
    })).toEqual(expect.objectContaining({
      state: "running",
      revision: 6,
      targetSessionSetId: "set-2",
    }));
  });

  it("advances missed boundaries without a cue when none crossed while foreground", () => {
    const running = startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 10_000,
    });
    expect(reconcileAdvancedTimingState({
      state: running,
      nowMs: 20_050,
      foregroundSinceMs: 20_001,
    })).toEqual({
      state: {
        ...running,
        revision: 4,
        nextBoundaryAtMs: 21_000,
        nextRepetitionIndex: 11,
      },
      cue: null,
      skippedBoundaryCount: 10,
    });
    const stopped: AdvancedTimingStateV1 = {
      version: 1,
      state: "stopped",
      mode: "per_rep",
      revision: 4,
      targetSessionSetId: "set-1",
      stoppedAtMs: 20_050,
      nextRepetitionIndex: 11,
    };
    expect(reconcileAdvancedTimingState({
      state: stopped,
      nowMs: 20_051,
      foregroundSinceMs: 20_051,
    })).toEqual({ state: stopped, cue: null, skippedBoundaryCount: 0 });
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
    expect(() => startAdvancedTimingState({
      current: { ...idle, revision: -1 },
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 1,
    })).toThrow("advanced_timing_state_invalid");
    expect(() => startAdvancedTimingState({
      current: { ...idle, revision: 1.5 },
      config: perRep,
      sessionSetId: "set-1",
      nowMs: 1,
    })).toThrow("advanced_timing_state_invalid");
    expect(() => startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "x".repeat(257),
      nowMs: 1,
    })).toThrow("advanced_timing_target_invalid");
    expect(() => startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: -1,
    })).toThrow("advanced_timing_time_invalid");
    expect(() => startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "set-1",
      nowMs: Number.POSITIVE_INFINITY,
    })).toThrow("advanced_timing_time_invalid");
  });

  it("characterizes every legacy cadence and cluster state as an exact round-trippable fact", () => {
    const running = startAdvancedTimingState({
      current: idle,
      config: perRep,
      sessionSetId: "legacy-set",
      nowMs: 10_000,
    });
    const clusterReady = startAdvancedTimingState({
      current: idle,
      config: cluster,
      sessionSetId: "legacy-set",
      nowMs: 10_000,
    });
    const clusterGap = beginClusterGapState(clusterReady, 20_000);
    const states: readonly AdvancedTimingStateV1[] = [
      idle,
      running,
      pauseAdvancedTimingState(running, 10_500),
      stopAdvancedTimingState(running, 10_750),
      clusterReady,
      clusterGap,
      pauseAdvancedTimingState(clusterGap, 20_500),
      stopAdvancedTimingState(clusterGap, 20_750),
    ];

    for (const state of states) {
      const serialized = JSON.stringify(state);
      const recovered = JSON.parse(serialized) as AdvancedTimingStateV1;
      expect(recovered).toEqual(state);
      expect(JSON.stringify(recovered)).toBe(serialized);
    }

    expect(states.map((state) => state.state)).toEqual([
      "idle", "running", "paused", "stopped", "cluster_ready",
      "cluster_gap_running", "cluster_gap_paused", "stopped",
    ]);
  });
});
import {
  describe,
  expect,
  it,
} from "@jest/globals";

