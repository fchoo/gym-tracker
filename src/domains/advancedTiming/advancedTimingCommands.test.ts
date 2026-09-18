import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  AdvancedTimingCommandError,
  type AdvancedTimingCommandResult,
  beginAdvancedTimingClusterGap,
  configureAdvancedTiming,
  pauseAdvancedTiming,
  reconcileAdvancedTiming,
  resumeAdvancedTiming,
  skipAdvancedTimingClusterGap,
  startAdvancedTiming,
  stopAdvancedTiming,
  updateSessionExerciseAdvancedTiming,
  updateSessionSetAdvancedTiming,
  type AdvancedTimingRepository,
} from "./advancedTimingCommands";
import { AdvancedTimingConfigError } from "./advancedTimingConfig";
import type { AdvancedTimingStateV1 } from "./advancedTimingState";

const idle: AdvancedTimingStateV1 = {
  version: 1,
  state: "idle",
  revision: 0,
  targetSessionSetId: null,
};

type RepositoryDouble = AdvancedTimingRepository & Readonly<{
  configureAdvancedTiming: jest.MockedFunction<AdvancedTimingRepository["configureAdvancedTiming"]>;
  startAdvancedTiming: jest.MockedFunction<AdvancedTimingRepository["startAdvancedTiming"]>;
  beginAdvancedTimingClusterGap: jest.MockedFunction<AdvancedTimingRepository["beginAdvancedTimingClusterGap"]>;
  skipAdvancedTimingClusterGap: jest.MockedFunction<AdvancedTimingRepository["skipAdvancedTimingClusterGap"]>;
  pauseAdvancedTiming: jest.MockedFunction<AdvancedTimingRepository["pauseAdvancedTiming"]>;
  resumeAdvancedTiming: jest.MockedFunction<AdvancedTimingRepository["resumeAdvancedTiming"]>;
  reconcileAdvancedTiming: jest.MockedFunction<AdvancedTimingRepository["reconcileAdvancedTiming"]>;
  stopAdvancedTiming: jest.MockedFunction<AdvancedTimingRepository["stopAdvancedTiming"]>;
}>;

function repository(): RepositoryDouble {
  const result: AdvancedTimingCommandResult = {
    state: idle,
    sessionRevision: 4,
    invalidationScopes: [["active-workout", "session-1"], ["today"]] as const,
  };
  return {
    updateSessionExerciseAdvancedTiming: jest.fn<AdvancedTimingRepository["updateSessionExerciseAdvancedTiming"]>(
      async () => result,
    ),
    updateSessionSetAdvancedTiming: jest.fn<AdvancedTimingRepository["updateSessionSetAdvancedTiming"]>(
      async () => result,
    ),
    configureAdvancedTiming: jest.fn<AdvancedTimingRepository["configureAdvancedTiming"]>(async () => result),
    startAdvancedTiming: jest.fn<AdvancedTimingRepository["startAdvancedTiming"]>(async () => result),
    beginAdvancedTimingClusterGap: jest.fn<AdvancedTimingRepository["beginAdvancedTimingClusterGap"]>(async () => result),
    skipAdvancedTimingClusterGap: jest.fn<AdvancedTimingRepository["skipAdvancedTimingClusterGap"]>(async () => result),
    pauseAdvancedTiming: jest.fn<AdvancedTimingRepository["pauseAdvancedTiming"]>(async () => result),
    resumeAdvancedTiming: jest.fn<AdvancedTimingRepository["resumeAdvancedTiming"]>(async () => result),
    reconcileAdvancedTiming: jest.fn<AdvancedTimingRepository["reconcileAdvancedTiming"]>(async () => ({ ...result, cue: null })),
    stopAdvancedTiming: jest.fn<AdvancedTimingRepository["stopAdvancedTiming"]>(async () => result),
  };
}

describe("advanced timing command boundary", () => {
  const perRep = {
    version: 1 as const,
    mode: "per_rep" as const,
    intervalMs: 1_000,
    cueChannels: "haptic" as const,
  };

  it("delegates each revision-checked command to the separate repository", async () => {
    const port = repository();
    const revision = {
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 4,
      expectedAdvancedTimingRevision: 2,
      nowMs: 10_000,
    };
    await expect(configureAdvancedTiming({ repository: port, input: { ...revision, config: perRep } })).resolves.toMatchObject({ sessionRevision: 4 });
    await expect(updateSessionExerciseAdvancedTiming({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionExerciseId: "exercise-1",
        expectedSessionRevision: 4,
        expectedSessionExerciseRevision: 3,
        nowMs: 10_000,
        config: perRep,
      },
    })).resolves.toMatchObject({ sessionRevision: 4 });
    await expect(updateSessionSetAdvancedTiming({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 4,
        expectedSetRevision: 3,
        nowMs: 10_000,
        override: perRep,
      },
    })).resolves.toMatchObject({ sessionRevision: 4 });
    await expect(updateSessionSetAdvancedTiming({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 4,
        expectedSetRevision: 3,
        nowMs: 10_000,
        override: null,
      },
    })).resolves.toMatchObject({ sessionRevision: 4 });
    await expect(startAdvancedTiming({ repository: port, input: { ...revision, config: perRep } })).resolves.toMatchObject({ sessionRevision: 4 });
    await expect(beginAdvancedTimingClusterGap({ repository: port, input: revision })).resolves.toMatchObject({ state: idle });
    await expect(skipAdvancedTimingClusterGap({ repository: port, input: revision })).resolves.toMatchObject({ state: idle });
    await expect(pauseAdvancedTiming({ repository: port, input: revision })).resolves.toMatchObject({ state: idle });
    await expect(resumeAdvancedTiming({ repository: port, input: revision })).resolves.toMatchObject({ state: idle });
    await expect(reconcileAdvancedTiming({ repository: port, input: { ...revision, foregroundSinceMs: 9_000 } })).resolves.toMatchObject({ cue: null });
    await expect(stopAdvancedTiming({ repository: port, input: revision })).resolves.toMatchObject({ state: idle });
    expect(port.configureAdvancedTiming).toHaveBeenCalledWith({ ...revision, config: perRep });
    expect(port.updateSessionExerciseAdvancedTiming).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionExerciseId: "exercise-1",
      expectedSessionRevision: 4,
      expectedSessionExerciseRevision: 3,
      nowMs: 10_000,
      config: perRep,
    });
    expect(port.updateSessionSetAdvancedTiming).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 4,
      expectedSetRevision: 3,
      nowMs: 10_000,
      override: perRep,
    });
    expect(port.updateSessionSetAdvancedTiming).toHaveBeenCalledWith({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 4,
      expectedSetRevision: 3,
      nowMs: 10_000,
      override: null,
    });
    expect(port.startAdvancedTiming).toHaveBeenCalledWith({ ...revision, config: perRep });
    expect(port.beginAdvancedTimingClusterGap).toHaveBeenCalledWith(revision);
    expect(port.skipAdvancedTimingClusterGap).toHaveBeenCalledWith(revision);
    expect(port.reconcileAdvancedTiming).toHaveBeenCalledWith({ ...revision, foregroundSinceMs: 9_000 });
  });

  it("rejects malformed command inputs before repository mutation", async () => {
    const port = repository();
    const valid = {
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 4,
      expectedAdvancedTimingRevision: 2,
      nowMs: 10_000,
    };
    await expect(startAdvancedTiming({
      repository: port,
      input: { ...valid, config: { version: 1, mode: "off" } },
    })).rejects.toThrow(AdvancedTimingCommandError);
    await expect(configureAdvancedTiming({
      repository: port,
      input: { ...valid, config: { version: 1, mode: "off" } },
    })).resolves.toMatchObject({ sessionRevision: 4 });
    await expect(updateSessionExerciseAdvancedTiming({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionExerciseId: "",
        expectedSessionRevision: 4,
        expectedSessionExerciseRevision: 2,
        nowMs: 10_000,
        config: perRep,
      },
    })).rejects.toThrow("advanced_timing_command_invalid");
    await expect(updateSessionSetAdvancedTiming({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 4,
        expectedSetRevision: 2,
        nowMs: 10_000,
        override: { version: 1, mode: "off", extra: true } as never,
      },
    })).rejects.toThrow(AdvancedTimingConfigError);
    await expect(updateSessionSetAdvancedTiming({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionSetId: "set-1",
        expectedSessionRevision: 4,
        expectedSetRevision: -1,
        nowMs: 10_000,
        override: null,
      },
    })).rejects.toThrow("advanced_timing_command_invalid");
    expect(() => pauseAdvancedTiming({
      repository: port,
      input: { ...valid, expectedSessionRevision: -1 },
    })).toThrow("advanced_timing_command_invalid");
    expect(() => reconcileAdvancedTiming({
      repository: port,
      input: { ...valid, foregroundSinceMs: 10_001 },
    })).toThrow("advanced_timing_command_invalid");
    expect(port.pauseAdvancedTiming).not.toHaveBeenCalled();
  });
});

