import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  AdvancedTimingCommandError,
  type AdvancedTimingCommandResult,
  pauseAdvancedTiming,
  reconcileAdvancedTiming,
  resumeAdvancedTiming,
  startAdvancedTiming,
  stopAdvancedTiming,
  type AdvancedTimingRepository,
} from "./advancedTimingCommands";
import type { AdvancedTimingStateV1 } from "./advancedTimingState";

const idle: AdvancedTimingStateV1 = {
  version: 1,
  state: "idle",
  revision: 0,
  targetSessionSetId: null,
};

type RepositoryDouble = AdvancedTimingRepository & Readonly<{
  startAdvancedTiming: jest.MockedFunction<AdvancedTimingRepository["startAdvancedTiming"]>;
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
    startAdvancedTiming: jest.fn<AdvancedTimingRepository["startAdvancedTiming"]>(async () => result),
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
    await expect(startAdvancedTiming({ repository: port, input: { ...revision, config: perRep } })).resolves.toMatchObject({ sessionRevision: 4 });
    await expect(pauseAdvancedTiming({ repository: port, input: revision })).resolves.toMatchObject({ state: idle });
    await expect(resumeAdvancedTiming({ repository: port, input: revision })).resolves.toMatchObject({ state: idle });
    await expect(reconcileAdvancedTiming({ repository: port, input: { ...revision, foregroundSinceMs: 9_000 } })).resolves.toMatchObject({ cue: null });
    await expect(stopAdvancedTiming({ repository: port, input: revision })).resolves.toMatchObject({ state: idle });
    expect(port.startAdvancedTiming).toHaveBeenCalledWith({ ...revision, config: perRep });
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

