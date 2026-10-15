import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockActivateStarterPlan = jest.fn<(input: unknown) => Promise<unknown>>();
const mockStartWorkout = jest.fn<(input: unknown) => Promise<unknown>>();
const mockCreatePlansWorkoutRepository = jest.fn<(kernel: unknown) => Readonly<{ source: "real-port" }>>(() => ({ source: "real-port" }));

jest.mock("../domains/plans", () => ({
  activateStarterPlan: (input: unknown) => mockActivateStarterPlan(input),
}));
jest.mock("../domains/workout", () => ({
  startWorkout: (input: unknown) => mockStartWorkout(input),
}));
jest.mock("../platform/sqlite/repositories/plansWorkoutRepository", () => ({
  createPlansWorkoutRepository: (kernel: unknown) => mockCreatePlansWorkoutRepository(kernel),
}));

import {
  bootstrapPhase20VisualFixture,
  PHASE20_VISUAL_ACTIVE_SESSION_ID,
  PHASE20_VISUAL_NOW_MS,
  PHASE20_VISUAL_STRENGTH_DAY_ID,
  PHASE20_VISUAL_STRENGTH_PLAN_ID,
  phase20VisualDatabaseName,
} from "./phase20VisualFixtureRuntime";
import type { Phase20VisualRequest } from "./phase20VisualRequest";

function request(state: Phase20VisualRequest["state"]): Phase20VisualRequest {
  return {
    nonce: "a".repeat(32),
    state,
    configuration: "AP-L-C390-P-F100",
    appearance: "Light",
    mode: "capture",
  };
}

describe("Phase 20 visual fixture runtime", () => {
  const execute = jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 }));
  const kernel = {
    write: jest.fn(async (operation: (transaction: { execute: typeof execute }) => Promise<unknown>) => operation({ execute })),
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActivateStarterPlan.mockResolvedValue({
      plan: { id: PHASE20_VISUAL_STRENGTH_PLAN_ID },
      days: [{ id: PHASE20_VISUAL_STRENGTH_DAY_ID }],
    });
    mockStartWorkout.mockResolvedValue({ id: PHASE20_VISUAL_ACTIVE_SESSION_ID });
  });

  it("derives a nonce-scoped database and rejects any non-attested nonce", () => {
    expect(phase20VisualDatabaseName("a".repeat(32)))
      .toBe(`gym-tracker-phase20-visual-${"a".repeat(32)}.db`);
    expect(() => phase20VisualDatabaseName("../../gym-tracker.db"))
      .toThrow("phase20_visual_nonce_invalid");
  });

  it("seeds active Workout through the real activation and start command ports", async () => {
    await bootstrapPhase20VisualFixture(kernel, request("BW-008"));

    expect(mockCreatePlansWorkoutRepository).toHaveBeenCalledWith(kernel);
    expect(mockActivateStarterPlan).toHaveBeenCalledWith(expect.objectContaining({
      repository: { source: "real-port" },
      activatedAtMs: PHASE20_VISUAL_NOW_MS - 3_600_000,
    }));
    expect(mockStartWorkout).toHaveBeenCalledWith({
      repository: { source: "real-port" },
      request: expect.objectContaining({
        mode: "alternate",
        planId: PHASE20_VISUAL_STRENGTH_PLAN_ID,
        planDayId: PHASE20_VISUAL_STRENGTH_DAY_ID,
        startedAtMs: PHASE20_VISUAL_NOW_MS,
      }),
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("development-test.phase20.visual-fixture.v1"),
      [expect.stringContaining('"scenario":"active-overview"'), PHASE20_VISUAL_NOW_MS],
    );
  });

  it("does not manufacture an active workout for non-Active families", async () => {
    await bootstrapPhase20VisualFixture(kernel, request("BW-022"));
    expect(mockActivateStarterPlan).toHaveBeenCalledTimes(1);
    expect(mockStartWorkout).not.toHaveBeenCalled();
  });
});
