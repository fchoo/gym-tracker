import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, renderHook, waitFor } from "@testing-library/react-native";
import React from "react";

import { RunningTargetSheet } from "../../src/ui/components/RunningTargetSheet";
import { AppearanceProvider } from "../../src/ui/theme";

const mockReadAggregate = jest.fn<any>();
const mockReadScheduledAggregate = jest.fn<any>();
const mockCreateInactiveRunningPlan = jest.fn<any>();
const mockSaveRunningSourceGraph = jest.fn<any>();
const mockPreviewLifecycle = jest.fn<any>();
const mockConfirmLifecycle = jest.fn<any>();
const mockSaveRunningTarget = jest.fn<any>();
const mockPreviewCollision = jest.fn<any>();
const mockPreviewCollisionForPlan = jest.fn<any>();
const mockConfirmCollision = jest.fn<any>();

jest.mock("../../src/platform/sqlite/repositories/runningPlanRepository", () => ({
  createRunningPlanRepository: () => ({ readAggregate: mockReadAggregate, readScheduledAggregate: mockReadScheduledAggregate, saveSourceGraph: mockSaveRunningSourceGraph, previewLifecycle: mockPreviewLifecycle, confirmLifecycle: mockConfirmLifecycle }),
}));
jest.mock("../../src/platform/sqlite/repositories/scheduleCollisionRepository", () => ({
  createScheduleCollisionRepository: () => ({
    preview: mockPreviewCollision,
    previewForRunningPlan: mockPreviewCollisionForPlan,
    confirm: mockConfirmCollision,
  }),
}));
jest.mock("../../src/domains/running/commands", () => ({
  createInactiveRunningPlan: (...arguments_: unknown[]) => mockCreateInactiveRunningPlan(...arguments_),
  saveRunningSourceGraph: (...arguments_: unknown[]) => mockSaveRunningSourceGraph(...arguments_),
  saveRunningTarget: (...arguments_: unknown[]) => mockSaveRunningTarget(...arguments_),
  canonicalRunningRequestHash: () => "b".repeat(64),
}));

import {
  createRunningPlanRuntimePort,
  RunningPlanRuntimeProvider,
  useCalendarRunningPlanReadPort,
  useRunningPlanRuntime,
} from "../../src/bootstrap/runningPlanRuntime";

describe("running target closeout retry identity", () => {
  it("retries the same target request when training days are reordered without mutating the caller's draft", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2_400, trainingDays: ["Monday" as const, "Thursday" as const], createdAtMs: 1 },
      createdAtMs: 1, sessions: [],
    };
    const readBack = { ...plan, revision: 5, goal: { ...plan.goal, id: "goal-3", revision: 3, targetDurationMs: 645_000 } };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValueOnce(readBack);
    mockSaveRunningTarget.mockRejectedValueOnce(new Error("temporary_storage_failure"))
      .mockResolvedValueOnce({ outcome: "already_committed" });
    const runtime = createRunningPlanRuntimePort({} as never, {
      nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64),
    });
    const trainingDays = ["Thursday" as const, "Monday" as const];
    const input = {
      planId: "running", requestId: "reordered-days", expectedSourceRevision: 4,
      goalDistanceMeters: 2_400, targetDurationMs: 645_000, trainingDays,
    };

    await expect(runtime.saveRunningTarget(input)).rejects.toThrow("temporary_storage_failure");
    await expect(runtime.saveRunningTarget({ ...input, trainingDays: ["Monday", "Thursday"] }))
      .resolves.toEqual({ outcome: "already_committed", plan: readBack });

    expect(trainingDays).toEqual(["Thursday", "Monday"]);
    expect(mockSaveRunningTarget.mock.calls[1]?.[1]).toBe(mockSaveRunningTarget.mock.calls[0]?.[1]);
    expect(mockReadAggregate).toHaveBeenCalledTimes(2);
  });
});
