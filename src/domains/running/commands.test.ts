import { describe, expect, it, jest } from "@jest/globals";

import {
  canonicalRunningRequestHash,
  RunningCommandError,
  saveRunningSourceGraph,
  type SaveRunningSourceGraphInput,
} from "./commands";

function input(overrides: Partial<SaveRunningSourceGraphInput> = {}): SaveRunningSourceGraphInput {
  const session = {
    version: 1 as const, id: "revision-1", rootId: "root-1", planId: "plan-1", revision: 1,
    createdAtMs: 1, sessionKind: "recovery" as const, contextual: {},
    phases: [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "distance" as const, distanceMeters: 5000 }] }],
  };
  const value = {
    requestId: "request-1", operation: "create" as const, planId: "plan-1", expectedPlanRevision: 1, createdAtMs: 1,
    goal: { version: 1 as const, id: "goal-1", planId: "plan-1", revision: 1, goalDistanceMeters: 5000, trainingDays: ["Monday" as const], createdAtMs: 1 },
    sessions: [session],
    slots: [{ id: "slot-revision-1", rootId: "slot-root-1", weekday: "Monday" as const, revision: 1, ordinal: 0, sessionRootId: "root-1", sessionRevisionId: "revision-1" }],
  };
  return { ...value, requestSha256: canonicalRunningRequestHash(value), ...overrides };
}

describe("Running source graph commands", () => {
  it("uses a canonical hash independent of object key order", () => {
    expect(canonicalRunningRequestHash({ b: [2, 1], a: { y: 2, x: 1 } })).toBe(canonicalRunningRequestHash({ a: { x: 1, y: 2 }, b: [2, 1] }));
  });

  it("stages valid immutable identities once and rejects duplicate same-day ordinals", async () => {
    const repository = { saveSourceGraph: jest.fn(async () => ({ planId: "plan-1", planRevision: 2 })) };
    await expect(saveRunningSourceGraph(repository, input())).resolves.toEqual({ planId: "plan-1", planRevision: 2 });
    expect(repository.saveSourceGraph).toHaveBeenCalledTimes(1);
    await expect(saveRunningSourceGraph(repository, input({ slots: [
      ...input().slots,
      { id: "slot-revision-2", rootId: "slot-root-2", weekday: "Monday", revision: 1, ordinal: 0, sessionRootId: "root-1", sessionRevisionId: "revision-1" },
    ] }))).rejects.toThrow(RunningCommandError);
  });
});
