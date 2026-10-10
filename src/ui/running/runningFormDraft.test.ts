import { describe, expect, it } from "@jest/globals";

import {
  RUNNING_SESSION_KINDS,
  addRunningSessionDraft,
  deleteRunningSessionDraft,
  makeRunningSessionDraft,
  reorderRunningSessionDraft,
  validateRunningPlanDraft,
  type RunningPlanDraft,
} from "./runningFormDraft";

const draft: RunningPlanDraft = {
  version: 1, id: "running", name: "Running", revision: 1, createdAtMs: 1,
  goal: { version: 1, id: "goal", planId: "running", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday"], createdAtMs: 1 },
  sessions: [],
};

describe("Running plan local draft", () => {
  it("keeps zero sessions valid and keeps two same-day slots distinct and ordered", () => {
    expect(validateRunningPlanDraft(draft)).toBeNull();
    const recovery = makeRunningSessionDraft({ id: "recovery-v1", rootId: "recovery", slotId: "slot-a-v1", slotRootId: "slot-a", planId: "running", kind: "recovery", weekday: "Monday", ordinal: 0, createdAtMs: 1 });
    const tempo = makeRunningSessionDraft({ id: "tempo-v1", rootId: "tempo", slotId: "slot-b-v1", slotRootId: "slot-b", planId: "running", kind: "tempo", weekday: "Monday", ordinal: 1, createdAtMs: 1 });
    const withTwo = addRunningSessionDraft(addRunningSessionDraft(draft, recovery), tempo);
    const reordered = reorderRunningSessionDraft(withTwo, ["slot-b", "slot-a"]);
    expect(reordered.sessions.map((entry) => [entry.session.sessionKind, entry.slot.ordinal])).toEqual([["tempo", 0], ["recovery", 1]]);
    expect(deleteRunningSessionDraft(reordered, "slot-a").sessions).toHaveLength(1);
    expect(deleteRunningSessionDraft(deleteRunningSessionDraft(reordered, "slot-a"), "slot-b").sessions).toEqual([]);
  });

  it("constructs every approved kind as a typed local draft before any write", () => {
    const allKinds = RUNNING_SESSION_KINDS.map((kind, ordinal) => makeRunningSessionDraft({
      id: `${kind}-v1`, rootId: `${kind}-root`, slotId: `${kind}-slot-v1`, slotRootId: `${kind}-slot`,
      planId: "running", kind, weekday: "Monday", ordinal, createdAtMs: 1,
    }));
    const complete = allKinds.reduce(addRunningSessionDraft, draft);
    expect(validateRunningPlanDraft(complete)).toBeNull();
    expect(complete.sessions.map((entry) => entry.session.sessionKind)).toEqual(RUNNING_SESSION_KINDS);
  });
});
