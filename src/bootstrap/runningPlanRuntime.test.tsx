import { describe, expect, it, jest } from "@jest/globals";

const mockReadAggregate = jest.fn<any>();
const mockCreateInactiveRunningPlan = jest.fn<any>();
const mockSaveRunningSourceGraph = jest.fn<any>();

jest.mock("../platform/sqlite/repositories/runningPlanRepository", () => ({
  createRunningPlanRepository: () => ({ readAggregate: mockReadAggregate, saveSourceGraph: mockSaveRunningSourceGraph }),
}));
jest.mock("../domains/running/commands", () => ({
  createInactiveRunningPlan: (...arguments_: unknown[]) => mockCreateInactiveRunningPlan(...arguments_),
  saveRunningSourceGraph: (...arguments_: unknown[]) => mockSaveRunningSourceGraph(...arguments_),
  canonicalRunningRequestHash: () => "b".repeat(64),
}));

import { createRunningPlanRuntimePort } from "./runningPlanRuntime";

describe("RunningPlanRuntimePort", () => {
  it("returns only the authoritative aggregate read after a successful create command", async () => {
    const committed = { id: "running", version: 1 as const, name: "Running", revision: 1, active: false as const, createdAtMs: 1, goal: {}, sessions: [] };
    const authoritative = { ...committed, name: "Authoritative Running" };
    mockCreateInactiveRunningPlan.mockResolvedValue(committed); mockReadAggregate.mockResolvedValue(authoritative);
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 1, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });
    await expect(runtime.createInactivePlan({ plan: committed as never })).resolves.toEqual(authoritative);
    expect(mockReadAggregate).toHaveBeenCalledWith("running");
  });

  it("allocates identities only inside an authoritative session commit and returns committed readback", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 1, active: false as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-1", planId: "running", revision: 1, goalDistanceMeters: 5000, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const readBack = { ...plan, revision: 2, sessions: [{ slot: { id: "slot-revision:uuid", rootId: "running-slot:uuid", weekday: "Monday" as const, revision: 1, ordinal: 0 }, session: { version: 1 as const, id: "running-session-revision:uuid", rootId: "running-session:uuid", planId: "running", sessionKind: "recovery" as const, revision: 1, createdAtMs: 2, phases: [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "distance" as const, distanceMeters: 5000 }] }], advisoryTarget: { rpe: 4 }, contextual: {} } }] };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValueOnce(readBack);
    mockSaveRunningSourceGraph.mockResolvedValue({ planId: "running", planRevision: 2 });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });
    await expect(runtime.saveSession({
      planId: "running", expectedPlanRevision: 1, requestId: "request-1",
      session: { sessionKind: "recovery", weekday: "Monday", phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "distance", distanceMeters: 5000 }] }], advisoryTarget: { rpe: 4 }, contextual: {} },
    })).resolves.toEqual({ plan: readBack, sessionRootId: "running-session:uuid" });
    expect(mockSaveRunningSourceGraph).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      expectedPlanRevision: 1,
      sessions: [expect.objectContaining({ rootId: "running-session:uuid", revision: 1 })],
      slots: [expect.objectContaining({ rootId: "running-slot:uuid", ordinal: 0 })],
    }));
  });
});
