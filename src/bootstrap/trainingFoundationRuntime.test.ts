import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { createTrainingFoundationRuntimePort } from "./trainingFoundationRuntime";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import { createTrainingCalendarRepository } from "../platform/sqlite/repositories/trainingCalendarRepository";
import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";

jest.mock("../platform/sqlite/repositories/plansWorkoutRepository", () => ({
  createPlansWorkoutRepository: jest.fn(),
}));
jest.mock("../platform/sqlite/repositories/trainingCalendarRepository", () => ({
  createTrainingCalendarRepository: jest.fn(),
}));

describe("training foundation runtime port", () => {
  it("delegates planned occurrence, Today, and Calendar reads without mutation", async () => {
    const loadPlannedStrengthOccurrence = jest.fn(async () => null);
    const loadRange = jest.fn(async (input: Readonly<{
      startLocalDate: string;
      endLocalDateExclusive: string;
    }>) => ({
      startLocalDate: input.startLocalDate,
      endLocalDateExclusive: input.endLocalDateExclusive,
      events: [],
    }));
    jest.mocked(createPlansWorkoutRepository).mockReturnValue({
      loadPlannedStrengthOccurrence,
    } as never);
    jest.mocked(createTrainingCalendarRepository).mockReturnValue({ loadRange } as never);

    const port = createTrainingFoundationRuntimePort({} as SqliteKernel);
    await expect(port.loadPlannedStrengthOccurrence("occurrence-1")).resolves.toBeNull();
    await expect(port.loadToday("2026-10-07")).resolves.toMatchObject({ events: [] });
    await expect(port.loadCalendarRange({
      startLocalDate: "2026-10-01",
      endLocalDateExclusive: "2026-11-01",
    })).resolves.toMatchObject({ events: [] });

    expect(loadPlannedStrengthOccurrence).toHaveBeenCalledWith("occurrence-1");
    expect(loadRange).toHaveBeenNthCalledWith(1, {
      startLocalDate: "2026-10-07",
      endLocalDateExclusive: "2026-10-08",
    });
    expect(loadRange).toHaveBeenNthCalledWith(2, {
      startLocalDate: "2026-10-01",
      endLocalDateExclusive: "2026-11-01",
    });
  });

  it("fails closed when the planned occurrence loader is unavailable", () => {
    jest.mocked(createPlansWorkoutRepository).mockReturnValue({} as never);
    expect(() => createTrainingFoundationRuntimePort({} as SqliteKernel))
      .toThrow("planned_strength_occurrence_loader_unavailable");
  });
});
