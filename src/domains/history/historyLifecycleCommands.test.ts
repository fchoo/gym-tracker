import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  REMOVE_FROM_HISTORY_CONFIRMATION,
  RESTORE_HISTORY_CONFIRMATION,
  removeHistorySession,
  restoreHistorySession,
  type HistoryLifecycleRepository,
  type RestoreHistorySessionInput,
  type VoidHistorySessionInput,
} from "./historyLifecycleCommands";

function repository(): HistoryLifecycleRepository {
  return {
    voidSession: jest.fn(async (input: VoidHistorySessionInput) => ({
      effectiveRevision: input.expectedEffectiveRevision + 1,
      lifecycle: "voided" as const,
    })),
    restoreSession: jest.fn(async (input: RestoreHistorySessionInput) => ({
      effectiveRevision: input.expectedEffectiveRevision + 1,
      lifecycle: "active" as const,
    })),
  };
}

describe("history lifecycle commands", () => {
  it("passes explicit revision-checked remove and restore requests to the typed repository", async () => {
    const port = repository();
    const remove = {
      sessionId: "session-1",
      expectedEffectiveRevision: 7,
      confirmation: REMOVE_FROM_HISTORY_CONFIRMATION,
      nowMs: 1_724_429_170_000,
    };
    const restore = {
      sessionId: "session-1",
      expectedEffectiveRevision: 8,
      confirmation: RESTORE_HISTORY_CONFIRMATION,
      nowMs: 1_724_429_180_000,
    };

    await expect(removeHistorySession({ repository: port, command: remove }))
      .resolves.toEqual({ effectiveRevision: 8, lifecycle: "voided" });
    await expect(restoreHistorySession({ repository: port, command: restore }))
      .resolves.toEqual({ effectiveRevision: 9, lifecycle: "active" });
    expect(port.voidSession).toHaveBeenCalledWith(remove);
    expect(port.restoreSession).toHaveBeenCalledWith(restore);
  });

  it("rejects malformed confirmation and revision metadata before a source mutation", () => {
    const port = repository();

    expect(() => removeHistorySession({
      repository: port,
      command: {
        sessionId: "session-1",
        expectedEffectiveRevision: 7,
        confirmation: "remove",
        nowMs: 1,
      },
    })).toThrow("history_remove_confirmation_required");
    expect(() => restoreHistorySession({
      repository: port,
      command: {
        sessionId: "",
        expectedEffectiveRevision: -1,
        confirmation: RESTORE_HISTORY_CONFIRMATION,
        nowMs: -1,
      },
    })).toThrow("history_restore_input_invalid");
    expect(port.voidSession).not.toHaveBeenCalled();
    expect(port.restoreSession).not.toHaveBeenCalled();
  });
});
