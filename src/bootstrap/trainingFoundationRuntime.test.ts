import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { createTrainingFoundationRuntimePort } from "./trainingFoundationRuntime";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import { createTrainingCalendarRepository } from "../platform/sqlite/repositories/trainingCalendarRepository";
import { createBodyweightRepository } from "../platform/sqlite/repositories/bodyweightRepository";
import { commitBodyweightCommand } from "../domains/bodyweight/commands";
import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";

jest.mock("../platform/sqlite/repositories/plansWorkoutRepository", () => ({
  createPlansWorkoutRepository: jest.fn(),
}));
jest.mock("../platform/sqlite/repositories/trainingCalendarRepository", () => ({
  createTrainingCalendarRepository: jest.fn(),
}));
jest.mock("../platform/sqlite/repositories/bodyweightRepository", () => ({
  createBodyweightRepository: jest.fn(),
}));
jest.mock("../domains/bodyweight/commands", () => ({
  commitBodyweightCommand: jest.fn(),
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

  it("exposes only receipt-fenced bodyweight history and mutations", async () => {
    const loadPlannedStrengthOccurrence = jest.fn(async () => null);
    const loadRange = jest.fn(async () => ({
      startLocalDate: "2026-10-07",
      endLocalDateExclusive: "2026-10-08",
      events: [],
    }));
    const history = jest.fn(async () => []);
    const command = {
      operation: "create" as const,
      requestId: "bodyweight-request-1",
      requestSha256: "a".repeat(64),
      entryId: "bodyweight-entry-1",
      ownerId: "owner-1",
      expectedRevision: 0,
      revisionId: "bodyweight-revision-1",
      eventId: "bodyweight-event-1",
      occurredAtMs: 1_790_000_000_000,
      localDate: "2026-10-07",
      timezone: "Asia/Singapore",
      grams: 62_500,
    };
    jest.mocked(createPlansWorkoutRepository).mockReturnValue({
      loadPlannedStrengthOccurrence,
    } as never);
    jest.mocked(createTrainingCalendarRepository).mockReturnValue({ loadRange } as never);
    jest.mocked(createBodyweightRepository).mockReturnValue({ history, commit: jest.fn() } as never);
    jest.mocked(commitBodyweightCommand).mockResolvedValue({ kind: "created", entry: undefined });

    const port = createTrainingFoundationRuntimePort({} as SqliteKernel);
    await expect(port.loadBodyweightHistory("owner-1")).resolves.toEqual([]);
    await expect(port.commitBodyweight(command)).resolves.toEqual({ kind: "created", entry: undefined });

    expect(history).toHaveBeenCalledWith("owner-1");
    expect(commitBodyweightCommand).toHaveBeenCalledWith(
      expect.objectContaining({ commit: expect.any(Function) }),
      command,
      expect.any(Function),
    );
  });
});
