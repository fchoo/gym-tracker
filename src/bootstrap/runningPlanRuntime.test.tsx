import { describe, expect, it, jest } from "@jest/globals";

const mockReadAggregate = jest.fn<any>();
const mockCreateInactiveRunningPlan = jest.fn<any>();

jest.mock("../platform/sqlite/repositories/runningPlanRepository", () => ({
  createRunningPlanRepository: () => ({ readAggregate: mockReadAggregate }),
}));
jest.mock("../domains/running/commands", () => ({
  createInactiveRunningPlan: (...arguments_: unknown[]) => mockCreateInactiveRunningPlan(...arguments_),
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
});
