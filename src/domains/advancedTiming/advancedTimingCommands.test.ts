import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  beginAdvancedTimingClusterGap,
  configureAdvancedTiming,
  pauseAdvancedTiming,
  reconcileAdvancedTiming,
  resumeAdvancedTiming,
  retireAdvancedTiming,
  skipAdvancedTimingClusterGap,
  startAdvancedTiming,
  stopAdvancedTiming,
  updateSessionExerciseAdvancedTiming,
  updateSessionSetAdvancedTiming,
  type AdvancedTimingRepository,
} from "./advancedTimingCommands";

const idleResult = {
  state: { version: 1 as const, state: "idle" as const, revision: 0, targetSessionSetId: null },
  sessionRevision: 1,
  invalidationScopes: [["active-workout", "session-1"], ["today"]] as const,
};

function repository(): AdvancedTimingRepository {
  return {
    updateSessionExerciseAdvancedTiming: async () => idleResult,
    updateSessionSetAdvancedTiming: async () => idleResult,
    configureAdvancedTiming: async () => idleResult,
    startAdvancedTiming: async () => idleResult,
    beginAdvancedTimingClusterGap: async () => idleResult,
    skipAdvancedTimingClusterGap: async () => idleResult,
    pauseAdvancedTiming: async () => idleResult,
    resumeAdvancedTiming: async () => idleResult,
    reconcileAdvancedTiming: async () => ({ ...idleResult, cue: null }),
    stopAdvancedTiming: async () => idleResult,
  };
}

const revisionInput = {
  sessionId: "session-1",
  sessionSetId: "set-1",
  expectedSessionRevision: 1,
  expectedAdvancedTimingRevision: 0,
  nowMs: 1_000,
};

describe("TIM-01 advanced timing retirement boundary", () => {
  it("turns every new or restored timing snapshot into an inert off snapshot", () => {
    expect(retireAdvancedTiming({
      version: 1,
      mode: "per_rep",
      intervalMs: 1_000,
      cueChannels: "both",
    })).toEqual({ version: 1, mode: "off" });
    expect(retireAdvancedTiming({
      version: 1,
      mode: "cluster",
      groupSizes: [2, 2],
      intraRestMs: 1_000,
      cueChannels: "haptic",
    })).toEqual({ version: 1, mode: "off" });
    expect(retireAdvancedTiming({ version: 1, mode: "off" })).toEqual({
      version: 1,
      mode: "off",
    });
  });

  it("returns inert results for every retired playback command", async () => {
    const target = repository();
    await expect(startAdvancedTiming({ repository: target, input: {
      ...revisionInput, config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "both" },
    } })).resolves.toEqual(idleResult);
    await expect(configureAdvancedTiming({ repository: target, input: {
      ...revisionInput, config: { version: 1, mode: "cluster", groupSizes: [2, 2], intraRestMs: 1_000, cueChannels: "haptic" },
    } })).resolves.toEqual(idleResult);
    for (const command of [
      pauseAdvancedTiming,
      beginAdvancedTimingClusterGap,
      skipAdvancedTimingClusterGap,
      resumeAdvancedTiming,
      stopAdvancedTiming,
    ]) {
      await expect(command({ repository: target, input: revisionInput }))
        .resolves.toEqual(idleResult);
    }
    await expect(reconcileAdvancedTiming({ repository: target, input: {
      ...revisionInput, foregroundSinceMs: 999,
    } })).resolves.toEqual({ ...idleResult, cue: null });
  });

  it("normalizes retired authoring to off and null", async () => {
    const target = repository();
    await expect(updateSessionExerciseAdvancedTiming({ repository: target, input: {
      sessionId: "session-1", sessionExerciseId: "exercise-1",
      expectedSessionRevision: 1, expectedSessionExerciseRevision: 1, nowMs: 1,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "audio" },
    } })).resolves.toEqual(idleResult);
    await expect(updateSessionSetAdvancedTiming({ repository: target, input: {
      sessionId: "session-1", sessionSetId: "set-1",
      expectedSessionRevision: 1, expectedSetRevision: 1, nowMs: 1,
      override: { version: 1, mode: "cluster", groupSizes: [2, 2], intraRestMs: 1_000, cueChannels: "both" },
    } })).resolves.toEqual(idleResult);
    await expect(updateSessionSetAdvancedTiming({ repository: target, input: {
      sessionId: "session-1", sessionSetId: "set-1",
      expectedSessionRevision: 1, expectedSetRevision: 1, nowMs: 1, override: null,
    } })).resolves.toEqual(idleResult);
  });

  it.each([
    { sessionId: "" },
    { sessionSetId: "" },
    { expectedSessionRevision: -1 },
    { expectedAdvancedTimingRevision: -1 },
    { nowMs: -1 },
  ])("rejects malformed retired playback input %#", async (change) => {
    expect(() => pauseAdvancedTiming({
      repository: repository(), input: { ...revisionInput, ...change },
    })).toThrow("advanced_timing_command_invalid");
  });

  it.each([
    { sessionId: "" },
    { sessionExerciseId: "" },
    { expectedSessionRevision: -1 },
    { expectedSessionExerciseRevision: -1 },
    { nowMs: -1 },
  ])("rejects malformed retired exercise authoring input %#", async (change) => {
    await expect(updateSessionExerciseAdvancedTiming({ repository: repository(), input: {
      sessionId: "session-1", sessionExerciseId: "exercise-1",
      expectedSessionRevision: 1, expectedSessionExerciseRevision: 1, nowMs: 1,
      config: { version: 1, mode: "off" }, ...change,
    } })).rejects.toThrow("advanced_timing_command_invalid");
  });

  it.each([
    { sessionId: "" },
    { sessionSetId: "" },
    { expectedSessionRevision: -1 },
    { expectedSetRevision: -1 },
    { nowMs: -1 },
  ])("rejects malformed retired set authoring input %#", async (change) => {
    await expect(updateSessionSetAdvancedTiming({ repository: repository(), input: {
      sessionId: "session-1", sessionSetId: "set-1",
      expectedSessionRevision: 1, expectedSetRevision: 1, nowMs: 1,
      override: null, ...change,
    } })).rejects.toThrow("advanced_timing_command_invalid");
  });

  it.each([-1, 1_001])("rejects invalid foreground boundary %i", async (foregroundSinceMs) => {
    expect(() => reconcileAdvancedTiming({ repository: repository(), input: {
      ...revisionInput, foregroundSinceMs,
    } })).toThrow("advanced_timing_command_invalid");
  });
});
