import { describe, expect, it } from "@jest/globals";
import { MULTI_PLAN_RUNNING_CONTRACT_CASES } from "./multiPlanRunning.contract";

describe("multi-plan Running lifecycle contract", () => {
  it("keeps immutable, unique case IDs for every Phase 13 lifecycle boundary", () => {
    expect(new Set(MULTI_PLAN_RUNNING_CONTRACT_CASES).size).toBe(MULTI_PLAN_RUNNING_CONTRACT_CASES.length);
    expect(MULTI_PLAN_RUNNING_CONTRACT_CASES).toContain("phase13-tim01-retirement");
    expect(MULTI_PLAN_RUNNING_CONTRACT_CASES).toContain("phase13-merge-rebuild");
  });
});
