import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react-native";
import React from "react";

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

jest.mock("../platform/sqlite/repositories/runningPlanRepository", () => ({
  createRunningPlanRepository: () => ({ readAggregate: mockReadAggregate, readScheduledAggregate: mockReadScheduledAggregate, saveSourceGraph: mockSaveRunningSourceGraph, previewLifecycle: mockPreviewLifecycle, confirmLifecycle: mockConfirmLifecycle }),
}));
jest.mock("../platform/sqlite/repositories/scheduleCollisionRepository", () => ({
  createScheduleCollisionRepository: () => ({
    preview: mockPreviewCollision,
    previewForRunningPlan: mockPreviewCollisionForPlan,
    confirm: mockConfirmCollision,
  }),
}));
jest.mock("../domains/running/commands", () => ({
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
} from "./runningPlanRuntime";

function runningSession(planId: string) {
  return {
    slot: { id: "recovery-slot-v1", rootId: "recovery-slot", weekday: "Monday" as const, revision: 1, ordinal: 0 },
    session: {
      version: 1 as const, id: "recovery-v1", rootId: "recovery", planId,
      sessionKind: "recovery" as const, revision: 1, createdAtMs: 1,
      phases: [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "duration" as const, durationMs: 60_000 }] }],
      advisoryTarget: { rpe: 4 }, contextual: {},
    },
  };
}

describe("RunningPlanRuntimePort", () => {
  beforeEach(() => {
    mockReadAggregate.mockReset();
    mockReadScheduledAggregate.mockReset();
    mockCreateInactiveRunningPlan.mockReset();
    mockSaveRunningSourceGraph.mockReset();
    mockSaveRunningTarget.mockReset();
    mockPreviewLifecycle.mockReset();
    mockConfirmLifecycle.mockReset();
    mockPreviewCollision.mockReset();
    mockPreviewCollisionForPlan.mockReset();
    mockConfirmCollision.mockReset();
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

  it("rejects changed target input that reuses a committed request identity", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2_400, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const readBack = { ...plan, revision: 5, goal: { ...plan.goal, id: "goal-3", revision: 3, targetDurationMs: 645_000 } };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValue(readBack);
    mockSaveRunningTarget.mockResolvedValueOnce({ outcome: "committed" });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });

    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "changed-request", expectedSourceRevision: 4,
      goalDistanceMeters: 2_400, targetDurationMs: 645_000, trainingDays: ["Monday"],
    })).resolves.toMatchObject({ outcome: "committed" });
    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "changed-request", expectedSourceRevision: 4,
      goalDistanceMeters: 2_400, targetDurationMs: 630_000, trainingDays: ["Monday"],
    })).rejects.toThrow("running_target_request_identity_conflict");
    expect(mockSaveRunningTarget).toHaveBeenCalledTimes(1);
  });

  it("rebases a changed target after a proven pre-commit revision conflict", async () => {
    const plan4 = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2_400, targetDurationMs: 660_000, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const plan5 = { ...plan4, revision: 5, goal: { ...plan4.goal, id: "goal-3", revision: 3, targetDurationMs: 645_000 } };
    const readBack = { ...plan5, revision: 6, goal: { ...plan5.goal, id: "goal-4", revision: 4, targetDurationMs: 630_000 } };
    mockReadAggregate.mockResolvedValueOnce(plan4).mockResolvedValueOnce(plan5).mockResolvedValueOnce(readBack);
    mockSaveRunningTarget
      .mockRejectedValueOnce(new Error("running_target_revision_conflict"))
      .mockResolvedValueOnce({ outcome: "committed" });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });

    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "rebased-request", expectedSourceRevision: 4,
      goalDistanceMeters: 2_400, targetDurationMs: 645_000, trainingDays: ["Monday"],
    })).rejects.toThrow("running_target_revision_conflict");
    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "rebased-request", expectedSourceRevision: 5,
      goalDistanceMeters: 2_400, targetDurationMs: 630_000, trainingDays: ["Monday"],
    })).resolves.toMatchObject({ outcome: "committed", plan: { revision: 6 } });
    expect(mockSaveRunningTarget).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      expectedPlanRevision: 5,
      expectedGoalRevision: 3,
      goal: expect.objectContaining({ targetDurationMs: 630_000 }),
    }));
  });

  it("invalidates a cached target command after a plan revision conflict", async () => {
    const plan4 = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2_400, targetDurationMs: 660_000, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const plan5 = { ...plan4, revision: 5, goal: { ...plan4.goal, id: "goal-3", revision: 3, targetDurationMs: 645_000 } };
    const readBack = { ...plan5, revision: 6, goal: { ...plan5.goal, id: "goal-4", revision: 4, targetDurationMs: 630_000 } };
    mockReadAggregate.mockResolvedValueOnce(plan4).mockResolvedValueOnce(plan5).mockResolvedValueOnce(readBack);
    mockSaveRunningTarget
      .mockRejectedValueOnce(new Error("running_plan_revision_conflict"))
      .mockResolvedValueOnce({ outcome: "committed" });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });

    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "plan-conflict", expectedSourceRevision: 4,
      goalDistanceMeters: 2_400, targetDurationMs: 645_000, trainingDays: ["Monday"],
    })).rejects.toThrow("running_plan_revision_conflict");
    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "plan-conflict", expectedSourceRevision: 5,
      goalDistanceMeters: 2_400, targetDurationMs: 630_000, trainingDays: ["Monday"],
    })).resolves.toMatchObject({ plan: { revision: 6 } });
  });

  it("retains an exact target envelope after an unclassified rejection", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2_400, targetDurationMs: 660_000, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const readBack = { ...plan, revision: 5, goal: { ...plan.goal, id: "goal-3", revision: 3, targetDurationMs: 645_000 } };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValueOnce(readBack);
    mockSaveRunningTarget
      .mockRejectedValueOnce("unknown_storage_failure")
      .mockResolvedValueOnce({ outcome: "already_committed" });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });
    const input = {
      planId: "running", requestId: "unknown-failure", expectedSourceRevision: 4,
      goalDistanceMeters: 2_400, targetDurationMs: 645_000, trainingDays: ["Monday" as const],
    };

    await expect(runtime.saveRunningTarget(input)).rejects.toBe("unknown_storage_failure");
    await expect(runtime.saveRunningTarget(input)).resolves.toMatchObject({ outcome: "already_committed" });
    expect(mockReadAggregate).toHaveBeenCalledTimes(2);
  });

  it("commits an owner-selected distance revision on the authoritative Running goal", async () => {
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 4, active: true as const, lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-2", planId: "running", revision: 2, goalDistanceMeters: 2_400, targetDurationMs: 660_000, trainingDays: ["Monday" as const], createdAtMs: 1 }, sessions: [],
    };
    const tenKilometreTarget = { ...plan.goal, id: "goal-3", revision: 1, goalDistanceMeters: 10_000, targetDurationMs: 3_600_000 };
    const readBack = { ...plan, revision: 5, currentTargets: [plan.goal, tenKilometreTarget] };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValueOnce(readBack);
    mockSaveRunningTarget.mockResolvedValue({ outcome: "committed", target: readBack.goal });
    const runtime = createRunningPlanRuntimePort({} as never, { nowMs: () => 2, randomUUID: () => "uuid", sha256: async () => "a".repeat(64) });

    await expect(runtime.saveRunningTarget({
      planId: "running", requestId: "target-distance", expectedSourceRevision: 4,
      goalDistanceMeters: 10_000, targetDurationMs: 3_600_000, trainingDays: ["Monday"],
    })).resolves.toEqual({ outcome: "committed", plan: readBack });
    expect(mockSaveRunningTarget).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      expectedGoalRevision: 0,
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

  it("revises one existing session while retaining the other immutable source member", async () => {
    const recovery = runningSession("running");
    const sibling = {
      slot: { ...recovery.slot, id: "tempo-slot-v1", rootId: "tempo-slot", ordinal: 1 },
      session: {
        ...recovery.session,
        id: "tempo-v1",
        rootId: "tempo",
        sessionKind: "tempo" as const,
        contextual: { format: "continuous" as const, work: { durationMs: 600_000 } },
      },
    };
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 3, active: true as const,
      lifecycle: "active" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-1", planId: "running", revision: 1, goalDistanceMeters: 5000, trainingDays: ["Monday" as const], createdAtMs: 1 },
      sessions: [recovery, sibling],
    };
    const readBack = { ...plan, revision: 4 };
    mockReadAggregate.mockResolvedValueOnce(plan).mockResolvedValueOnce(readBack);
    mockSaveRunningSourceGraph.mockResolvedValue({ planId: "running", planRevision: 4 });
    const runtime = createRunningPlanRuntimePort({} as never, {
      nowMs: () => 4,
      randomUUID: () => "uuid",
      sha256: async () => "a".repeat(64),
    });

    await expect(runtime.saveSession({
      planId: "running",
      expectedPlanRevision: 3,
      requestId: "edit-recovery",
      sessionRootId: "recovery",
      expectedSessionRevision: 1,
      slotRootId: "recovery-slot",
      expectedSlotRevision: 1,
      session: {
        sessionKind: "recovery",
        weekday: "Thursday",
        phases: recovery.session.phases,
        advisoryTarget: { rpe: 3 },
        contextual: {},
      },
    })).resolves.toEqual({ plan: readBack, sessionRootId: "recovery" });
    expect(mockSaveRunningSourceGraph).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sessions: [
        expect.objectContaining({ rootId: "recovery", revision: 2 }),
        sibling.session,
      ],
      slots: [
        expect.objectContaining({ rootId: "recovery-slot", revision: 2, weekday: "Thursday" }),
        expect.objectContaining({ rootId: "tempo-slot", revision: 2, sessionRevisionId: "tempo-v1" }),
      ],
    }));
  });

  it("rejects stale or missing authoritative readbacks across mutation boundaries", async () => {
    const runtime = createRunningPlanRuntimePort({} as never, {
      nowMs: () => 5,
      randomUUID: () => "uuid",
      sha256: async () => "a".repeat(64),
    });
    const plan = {
      id: "running", version: 1 as const, name: "Running", revision: 1, active: false as const,
      lifecycle: "inactive" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-1", planId: "running", revision: 1, goalDistanceMeters: 5000, trainingDays: ["Monday" as const], createdAtMs: 1 },
      sessions: [runningSession("running")],
    };

    mockCreateInactiveRunningPlan.mockResolvedValue(plan);
    mockReadAggregate.mockResolvedValueOnce(null);
    await expect(runtime.createInactivePlan({ plan: plan as never })).rejects.toThrow("running_plan_readback_missing");

    mockReadAggregate.mockResolvedValueOnce(null);
    await expect(runtime.savePlan(plan)).rejects.toThrow("running_plan_revision_conflict");

    const session = {
      sessionKind: "recovery" as const,
      weekday: "Monday" as const,
      phases: plan.sessions[0]!.session.phases,
      advisoryTarget: { rpe: 4 },
      contextual: {},
    };
    mockReadAggregate.mockResolvedValueOnce(null);
    await expect(runtime.saveSession({
      planId: "running",
      expectedPlanRevision: 1,
      requestId: "missing-plan",
      session,
    })).rejects.toThrow("running_plan_revision_conflict");

    mockReadAggregate.mockResolvedValueOnce(plan);
    await expect(runtime.saveSession({
      planId: "running",
      expectedPlanRevision: 1,
      requestId: "stale-session",
      sessionRootId: "recovery",
      expectedSessionRevision: 2,
      slotRootId: "recovery-slot",
      expectedSlotRevision: 1,
      session,
    })).rejects.toThrow("running_session_revision_conflict");

    const preview = {
      action: "activate" as const,
      planId: "running",
      planName: "Running",
      expectedPlanRevision: 1,
      expectedScheduleRevision: 1,
      lifecycle: "inactive" as const,
      activeWorkout: false,
      activeRunning: null,
      confirmationToken: "running-lifecycle-preview-v1:missing-readback",
    };
    mockConfirmLifecycle.mockResolvedValue({ planId: "running", lifecycle: "active" });
    mockReadAggregate.mockResolvedValueOnce(null);
    await expect(runtime.confirmLifecycle({
      action: "activate",
      preview,
      requestId: "missing-lifecycle-readback",
    })).rejects.toThrow("running_lifecycle_readback_missing");
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

  it("forwards exact reads, complete plan saves, collisions, and both provider capabilities", async () => {
    const current = {
      id: "running", version: 1 as const, name: "Running", revision: 1,
      active: false as const, lifecycle: "inactive" as const, createdAtMs: 1,
      goal: { version: 1 as const, id: "goal-1", planId: "running", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday" as const], createdAtMs: 1 },
      sessions: [runningSession("running")],
    };
    const saved = { ...current, revision: 2, name: "Saved Running" };
    mockReadAggregate
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(saved)
      .mockResolvedValue(saved);
    mockReadScheduledAggregate.mockResolvedValue(saved);
    mockSaveRunningSourceGraph.mockResolvedValue({ planId: "running", planRevision: 2 });
    mockPreviewCollision.mockResolvedValue({ confirmationToken: "collision" });
    mockPreviewCollisionForPlan.mockResolvedValue({ confirmationToken: "collision-plan" });
    mockConfirmCollision.mockResolvedValue({ kind: "committed" });
    const runtime = createRunningPlanRuntimePort({} as never, {
      nowMs: () => 2,
      randomUUID: () => "uuid",
      sha256: async () => "a".repeat(64),
    });

    await expect(runtime.loadPlan("running")).resolves.toBe(current);
    await expect(runtime.loadScheduledSessionPlan("running", "recovery-v1")).resolves.toBe(saved);
    await expect(runtime.savePlan({ ...current, name: "Saved Running" })).resolves.toBe(saved);
    await expect(runtime.previewScheduleCollision({} as never)).resolves.toEqual({ confirmationToken: "collision" });
    await expect(runtime.previewScheduleCollisionForPlan("running")).resolves.toEqual({ confirmationToken: "collision-plan" });
    await expect(runtime.commitScheduleCollisionChoice({} as never)).resolves.toEqual({ kind: "committed" });

    const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <RunningPlanRuntimeProvider runtime={runtime}>{children}</RunningPlanRuntimeProvider>
    );
    const runningHook = await renderHook(() => useRunningPlanRuntime(), { wrapper });
    const calendarHook = await renderHook(() => useCalendarRunningPlanReadPort(), { wrapper });
    expect(runningHook.result.current).toBe(runtime);
    expect(calendarHook.result.current)
      .toEqual({ loadScheduledSessionPlan: runtime.loadScheduledSessionPlan });
    await expect(renderHook(() => useRunningPlanRuntime())).rejects.toThrow("running_plan_runtime_unavailable");
    await expect(renderHook(() => useCalendarRunningPlanReadPort())).rejects.toThrow("calendar_running_plan_read_port_unavailable");
  });
});
