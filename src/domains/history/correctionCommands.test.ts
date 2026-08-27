import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  correctHistorySession,
  type HistoryCorrectionRepository,
} from "./correctionCommands";
import type {
  HistoryCorrectionSnapshot,
} from "./correctionContracts";

const snapshot: HistoryCorrectionSnapshot = {
  version: 1,
  session: {
    id: "session-1",
    source: "manual",
    status: "completed",
    planId: null,
    planDayId: null,
    planName: null,
    dayName: null,
    localDate: "2026-08-24",
    timezone: "Asia/Singapore",
    startedAtMs: 1_724_428_800_000,
    completedAtMs: 1_724_429_160_000,
    ownerNote: null,
  },
  exercises: [],
};

function repository(): HistoryCorrectionRepository {
  return {
    loadCorrectionSession: async () => ({
      effectiveRevision: 0,
      snapshot,
      auditEvents: [],
    }),
    listAvailableCorrectionExercises: async () => [],
    correctSession: jest.fn(async (input: Parameters<
      HistoryCorrectionRepository["correctSession"]
    >[0]) => ({
      effectiveRevision: input.expectedEffectiveRevision + 1,
      snapshot: input.next,
    })),
  };
}

describe("correctHistorySession", () => {
  it("passes the complete revision-checked command to the typed repository", async () => {
    const port = repository();
    const command = {
      base: snapshot,
      expectedEffectiveRevision: 4,
      next: {
        ...snapshot,
        session: { ...snapshot.session, ownerNote: "Corrected" },
      },
      nowMs: 1_724_429_170_000,
    };

    await expect(correctHistorySession({ repository: port, command }))
      .resolves.toEqual(expect.objectContaining({ effectiveRevision: 5 }));
    expect(port.correctSession).toHaveBeenCalledWith(command);
  });

  it("rejects invalid command metadata before a repository write", () => {
    const port = repository();
    expect(() => correctHistorySession({
      repository: port,
      command: {
        base: snapshot,
        expectedEffectiveRevision: -1,
        next: snapshot,
        nowMs: 1,
      },
    })).toThrow("history_correction_command_invalid");
    expect(port.correctSession).not.toHaveBeenCalled();
  });
});
