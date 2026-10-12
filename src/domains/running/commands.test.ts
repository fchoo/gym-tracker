import { describe, expect, it, jest } from "@jest/globals";

import {
  canonicalRunningRequestHash,
  createInactiveRunningPlan,
  RunningCommandError,
  saveRunningSourceGraph,
  saveRunningTarget,
  type SaveRunningSourceGraphInput,
  type SaveRunningTargetInput,
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

  it("rejects invalid command fences, source graph identities, and slot ordering", async () => {
    const repository = { saveSourceGraph: jest.fn(async () => ({})) };
    const valid = input();
    await expect(saveRunningSourceGraph(repository, input({ requestId: "", requestSha256: "0".repeat(64) }))).rejects.toThrow("running_command_identity_invalid");
    await expect(saveRunningSourceGraph(repository, input({ requestSha256: "A".repeat(64) }))).rejects.toThrow("running_command_hash_invalid");
    await expect(saveRunningSourceGraph(repository, input({ expectedPlanRevision: -1 }))).rejects.toThrow("running_command_revision_invalid");
    await expect(saveRunningSourceGraph(repository, {
      ...valid,
      goal: {
        version: 1,
        id: "goal-1",
        planId: "other-plan",
        revision: 1,
        goalDistanceMeters: 5000,
        trainingDays: ["Monday"],
        createdAtMs: 1,
      },
    })).rejects.toThrow("running_command_identity_invalid");
    await expect(saveRunningSourceGraph(repository, {
      ...valid,
      sessions: valid.sessions.map((session) => ({ ...session, planId: "other-plan" })),
    })).rejects.toThrow("running_command_identity_invalid");
    await expect(saveRunningSourceGraph(repository, {
      ...valid,
      slots: valid.slots.map((slot) => ({ ...slot, rootId: "slot-root-1", sessionRootId: "missing" })),
    })).rejects.toThrow("running_command_identity_invalid");
    await expect(saveRunningSourceGraph(repository, {
      ...valid,
      slots: valid.slots.map((slot) => ({ ...slot, revision: 0 })),
    })).rejects.toThrow("running_command_order_invalid");
    expect(repository.saveSourceGraph).not.toHaveBeenCalled();
  });

  it("rejects malformed, nonfuture, or noncanonical target drafts before any source write", async () => {
    const repository = { saveSourceGraph: jest.fn(async () => ({})) };
    const base = {
      requestId: "target-request", planId: "plan-1", expectedPlanRevision: 2,
      expectedGoalRevision: 1, savedAtMs: new Date(2026, 0, 2, 12).getTime(),
      goal: {
        version: 1 as const, id: "goal-2", planId: "plan-1", revision: 2,
        goalDistanceMeters: 2400, targetDurationMs: 660_000,
        targetLocalDate: "2026-01-03", trainingDays: ["Monday" as const, "Thursday" as const],
        createdAtMs: new Date(2026, 0, 2, 12).getTime(),
      },
    };
    const input: SaveRunningTargetInput = { ...base, requestSha256: canonicalRunningRequestHash(base) };
    await expect(saveRunningTarget(repository, input)).resolves.toEqual({});
    await expect(saveRunningTarget(repository, {
      ...input, goal: { ...input.goal, targetLocalDate: "2026-02-31" },
    })).rejects.toThrow("running_target_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, goal: { ...input.goal, targetLocalDate: "2026-01-02" },
    })).rejects.toThrow("running_target_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, goal: { ...input.goal, trainingDays: ["Thursday", "Monday"] },
    })).rejects.toThrow("running_target_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, requestId: "", requestSha256: "0".repeat(64),
    })).rejects.toThrow("running_command_identity_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, planId: "", requestSha256: "0".repeat(64),
    })).rejects.toThrow("running_command_hash_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, expectedPlanRevision: 0,
    })).rejects.toThrow("running_command_revision_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, goal: { ...input.goal, planId: "other-plan" },
    })).rejects.toThrow("running_target_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, goal: { ...input.goal, revision: 3 },
    })).rejects.toThrow("running_target_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, goal: { ...input.goal, targetDurationMs: 59_999 },
    })).rejects.toThrow("running_target_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, goal: { ...input.goal, targetLocalDate: "not-a-date" },
    })).rejects.toThrow("running_goal_invalid");
    await expect(saveRunningTarget(repository, {
      ...input, goal: { ...input.goal, targetLocalDate: undefined },
    })).resolves.toEqual({});
    expect(repository.saveSourceGraph).toHaveBeenCalledTimes(2);
  });

  it("validates inactive-plan receipt identity before delegation", async () => {
    const repository = {
      createInactiveAggregate: jest.fn(async (value: { plan: unknown }) => value.plan as never),
      readAggregate: jest.fn(async () => null),
    };
    const plan = {
      version: 1 as const,
      id: "inactive-plan",
      name: "Inactive",
      revision: 1,
      createdAtMs: 1,
      goal: {
        version: 1 as const,
        id: "inactive-goal",
        planId: "inactive-plan",
        revision: 1,
        goalDistanceMeters: 2_400,
        trainingDays: ["Monday" as const],
        createdAtMs: 1,
      },
      sessions: [],
    };
    await expect(createInactiveRunningPlan(repository, {
      requestId: "",
      requestSha256: "0".repeat(64),
      plan,
    })).rejects.toThrow("running_command_hash_invalid");
    await expect(createInactiveRunningPlan(repository, {
      requestId: "inactive-create",
      requestSha256: "a".repeat(64),
      plan,
    })).resolves.toMatchObject({ id: "inactive-plan", active: false, lifecycle: "inactive" });
  });
});
