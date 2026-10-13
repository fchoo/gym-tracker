import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react-native";
import React from "react";

const mockReadAggregate = jest.fn<any>();
const mockCreateInactiveRunningPlan = jest.fn<any>();
const mockSaveRunningSourceGraph = jest.fn<any>();
const mockPreviewLifecycle = jest.fn<any>();
const mockConfirmLifecycle = jest.fn<any>();
const mockSaveRunningTarget = jest.fn<any>();

jest.mock("../platform/sqlite/repositories/runningPlanRepository", () => ({
  createRunningPlanRepository: () => ({ readAggregate: mockReadAggregate, saveSourceGraph: mockSaveRunningSourceGraph, previewLifecycle: mockPreviewLifecycle, confirmLifecycle: mockConfirmLifecycle }),
}));
jest.mock("../domains/running/commands", () => ({
  createInactiveRunningPlan: (...arguments_: unknown[]) => mockCreateInactiveRunningPlan(...arguments_),
  saveRunningSourceGraph: (...arguments_: unknown[]) => mockSaveRunningSourceGraph(...arguments_),
  saveRunningTarget: (...arguments_: unknown[]) => mockSaveRunningTarget(...arguments_),
  canonicalRunningRequestHash: () => "b".repeat(64),
}));

import {
  RunningPlanRuntimeProvider,
  createRunningPlanRuntimePort,
  useCalendarRunningPlanReadPort,
  useRunningPlanRuntime,
} from "./runningPlanRuntime";

describe("RunningPlanRuntimePort", () => {
  beforeEach(() => {
    mockReadAggregate.mockReset();
    mockCreateInactiveRunningPlan.mockReset();
    mockSaveRunningSourceGraph.mockReset();
    mockSaveRunningTarget.mockReset();
    mockPreviewLifecycle.mockReset();
    mockConfirmLifecycle.mockReset();
  });

  it("returns only the authoritative aggregate read after a successful create command", async () => {
    const committed = { id: "running", version: 1 as const, name: "Running", revision: 1, active: false as const, createdAtMs: 1, goal: {}, sessions: [] };
    const authoritative = { ...committed, name: "Authoritative Running" };
    mockCreateInactiveRunningPlan.mockResolvedValue(committed); mockReadAggregate.mockResolvedValue(authoritative);
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 1, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });
    await expect(runtime.createInactivePlan({ plan: committed as never })).resolves.toEqual(authoritative);
    expect(mockReadAggregate).toHaveBeenCalledWith("running");
  });

  it("keeps one target request envelope, then acknowledges only a committed target readback", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2400, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const readBack = { ...plan, revision: 5, goal: { ...plan.goal, id: "goal-3", revision: 3, targetDurationMs: 660_000 } };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValueOnce(readBack);
    mockSaveRunningTarget.mockResolvedValue({ outcome: "committed", planId: "running", sourceRevision: 5, targetRevision: 3, target: readBack.goal });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });
    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "target-request", expectedSourceRevision: 4,
      goalDistanceMeters: 2400, targetDurationMs: 660_000, trainingDays: ["Monday"],
    })).resolves.toEqual({ outcome: "committed", plan: readBack });
    expect(mockSaveRunningTarget).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      requestId: "target-request", expectedPlanRevision: 4, expectedGoalRevision: 2,
      goal: expect.objectContaining({ id: "running-goal-revision:uuid", revision: 3, targetDurationMs: 660_000 }),
    }));
  });

  it("does not acknowledge a target mutation when its authoritative readback is absent", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2400, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValueOnce(null);
    mockSaveRunningTarget.mockResolvedValue({ outcome: "committed", planId: "running", sourceRevision: 5, targetRevision: 3 });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });
    await expect(runtime.saveRunningTarget({ planId: "running", requestId: "target-readback", expectedSourceRevision: 4, goalDistanceMeters: 2400, targetDurationMs: 660_000, trainingDays: ["Monday"] })).rejects.toThrow("running_target_readback_missing");
  });

  it("rejects stale target requests and replays an already committed envelope", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2400, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });
    mockReadAggregate.mockResolvedValueOnce(null);
    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "stale", expectedSourceRevision: 4,
      goalDistanceMeters: 2400, targetDurationMs: 660_000, trainingDays: ["Monday"],
    })).rejects.toThrow("running_target_revision_conflict");

    const readBack = { ...plan, revision: 5, goal: { ...plan.goal, revision: 3, id: "goal-3" } };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValue(readBack);
    mockSaveRunningTarget
      .mockResolvedValueOnce({ outcome: "committed" })
      .mockResolvedValueOnce({ outcome: "already_committed" });
    const input = {
      planId: "running", requestId: "replay", expectedSourceRevision: 4,
      goalDistanceMeters: 2400, targetDurationMs: 660_000, trainingDays: ["Monday" as const],
    };
    await expect(runtime.saveRunningTarget(input)).resolves.toMatchObject({ outcome: "committed" });
    await expect(runtime.saveRunningTarget(input)).resolves.toMatchObject({ outcome: "already_committed" });
  });

  it("commits an owner-selected distance revision on the authoritative Running goal", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2_400, targetDurationMs: 660_000, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const readBack = { ...plan, revision: 5, goal: { ...plan.goal, id: "goal-3", revision: 3, goalDistanceMeters: 10_000, targetDurationMs: 3_600_000 } };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValueOnce(readBack);
    mockSaveRunningTarget.mockResolvedValue({ outcome: "committed", target: readBack.goal });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });

    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "target-distance", expectedSourceRevision: 4,
      goalDistanceMeters: 10_000, targetDurationMs: 3_600_000, trainingDays: ["Monday"],
    })).resolves.toEqual({ outcome: "committed", plan: readBack });
    expect(mockSaveRunningTarget).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      goal: expect.objectContaining({ goalDistanceMeters: 10_000, targetDurationMs: 3_600_000 }),
    }));
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
      sessions: expect.arrayContaining([expect.objectContaining({ rootId: "running-session:uuid", revision: 1 })]),
      slots: [expect.objectContaining({ rootId: "running-slot:uuid", ordinal: 0 })],
    }));
    const command = mockSaveRunningSourceGraph.mock.calls[0]?.[1] as { sessions: readonly Record<string, unknown>[] };
    expect(command.sessions[0]).not.toHaveProperty("weekday");
  });

  it("reuses a review envelope on lifecycle retry and returns only authoritative lifecycle readback", async () => {
    const preview = {
      action: "activate" as const, planId: "running", planName: "Running", expectedPlanRevision: 1,
      expectedScheduleRevision: 1, lifecycle: "inactive" as const, activeWorkout: false,
      activeRunning: null, confirmationToken: "running-lifecycle-preview-v1:test",
    };
    const readBack = {
      id: "running", version: 1 as const, name: "Running", revision: 2, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-1", planId: "running", revision: 1, goalDistanceMeters: 5000, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    mockPreviewLifecycle.mockResolvedValue(preview);
    mockConfirmLifecycle.mockResolvedValue({ planId: "running", lifecycle: "active" });
    mockReadAggregate.mockResolvedValue(readBack);
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });
    await expect(runtime.previewLifecycle("running", "activate")).resolves.toEqual(preview);
    await expect(runtime.confirmLifecycle({ action: "activate", preview, requestId: "lifecycle-request" })).resolves.toEqual(readBack);
    await expect(runtime.confirmLifecycle({ action: "activate", preview: { ...preview, confirmationToken: "ignored-on-retry" }, requestId: "lifecycle-request" })).resolves.toEqual(readBack);
    expect(mockConfirmLifecycle).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "activate", requestId: "lifecycle-request", preview,
    }));
  });

  it("provides both runtime contexts and fails closed outside the provider", async () => {
    const runtime = createRunningPlanRuntimePort({} as never, {
      nowMs: () => 1,
      randomUUID: () => "uuid",
      sha256: async () => "a".repeat(64),
    });
    const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <RunningPlanRuntimeProvider runtime={runtime}>{children}</RunningPlanRuntimeProvider>
    );
    const running = await renderHook(() => useRunningPlanRuntime(), { wrapper });
    expect(running.result.current).toBe(runtime);
    const calendar = await renderHook(() => useCalendarRunningPlanReadPort(), { wrapper });
    mockReadAggregate.mockResolvedValue({
      id: "running",
      sessions: [{ session: { id: "session-r1", planId: "running" } }],
    });
    await expect(calendar.result.current.loadScheduledSessionPlan("running", "session-r1"))
      .resolves.toMatchObject({ id: "running" });
    await expect(renderHook(() => useRunningPlanRuntime())).rejects.toThrow(
      "running_plan_runtime_unavailable",
    );
    await expect(renderHook(() => useCalendarRunningPlanReadPort())).rejects.toThrow(
      "calendar_running_plan_read_port_unavailable",
    );
  });
});
