import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type {
  OwnedPlanRepository,
  OwnedPlanRepositoryResult,
  OwnedPlanSnapshot,
  StagedCreateOwnedPlanDraft,
  StagedDuplicateOwnedPlan,
  StagedSaveOwnedPlan,
  StagedSetOwnedPlanArchived,
} from "../platform/sqlite/repositories/ownedPlanRepository";
import {
  createOwnedPlanRepository,
} from "../platform/sqlite/repositories/ownedPlanRepository";
import {
  applySessionExerciseEditsToPlan,
  previewDayRemoval,
  previewExerciseReplacement,
  previewSessionExerciseEditsForPlan,
  removePlanDayWithImpact,
  replacePlanExercise,
} from "../domains/plans";
import type {
  SqliteKernel,
} from "../platform/sqlite";
import {
  createOwnedPlanRuntimePort,
} from "./ownedPlanRuntime";

jest.mock("../platform/sqlite/repositories/ownedPlanRepository", () => {
  const actual = jest.requireActual<
    typeof import("../platform/sqlite/repositories/ownedPlanRepository")
  >("../platform/sqlite/repositories/ownedPlanRepository");
  return {
    ...actual,
    createOwnedPlanRepository: jest.fn(),
  };
});

jest.mock("../domains/plans", () => {
  const actual = jest.requireActual<
    typeof import("../domains/plans")
  >("../domains/plans");
  return {
    ...actual,
    previewDayRemoval: jest.fn(),
    previewExerciseReplacement: jest.fn(),
    previewSessionExerciseEditsForPlan: jest.fn(),
    removePlanDayWithImpact: jest.fn(),
    replacePlanExercise: jest.fn(),
    applySessionExerciseEditsToPlan: jest.fn(),
  };
});

const mockedCreateRepository = jest.mocked(createOwnedPlanRepository);
const mockedPreviewDayRemoval = jest.mocked(previewDayRemoval);
const mockedRemovePlanDayWithImpact = jest.mocked(removePlanDayWithImpact);
const mockedPreviewExerciseReplacement = jest.mocked(
  previewExerciseReplacement,
);
const mockedReplacePlanExercise = jest.mocked(replacePlanExercise);
const mockedPreviewSessionExerciseEditsForPlan = jest.mocked(
  previewSessionExerciseEditsForPlan,
);
const mockedApplySessionExerciseEditsToPlan = jest.mocked(
  applySessionExerciseEditsToPlan,
);

const snapshot: OwnedPlanSnapshot = {
  id: "plan-owner",
  name: "Owner Strength",
  revision: 1,
  lifecycle: "draft",
  graphStatus: "missing_valid_target",
  missingRequirement:
    "Add at least one exercise with valid targets before scheduling or activating.",
  isActive: false,
  hasInProgressWorkout: false,
  days: [{
    id: "day-owner",
    name: "Strength Day",
    ordinal: 0,
    occurrences: [],
  }],
  scheduleDefaults: null,
};

function result(
  operation: "archive" | "create" | "duplicate" | "restore" | "save",
): OwnedPlanRepositoryResult {
  return {
    outcome: "committed",
    operation,
    plan: snapshot,
    currentWorkoutUnaffected: false,
    invalidations: ["library:plans", "plan:plan-owner"],
  };
}

function repository(): jest.Mocked<OwnedPlanRepository> {
  return {
    read: jest.fn(async () => snapshot),
    readSessionExerciseEditsForPlan: jest.fn(async () => null),
    applySessionExerciseEditsToPlan: jest.fn(async () => {
      throw new Error("unexpected_session_write_back");
    }),
    readSessionExerciseEditsToPlanResult: jest.fn(async () => null),
    createDraft: jest.fn(async () => result("create")),
    save: jest.fn(async () => result("save")),
    duplicate: jest.fn(async () => result("duplicate")),
    archive: jest.fn(async () => result("archive")),
    restore: jest.fn(async () => result("restore")),
  };
}

describe("owned plan runtime port", () => {
  it("maps eligible exercises and composes every aggregate command", async () => {
    const ownedRepository = repository();
    mockedCreateRepository.mockReturnValue(ownedRepository);
    const queryAll = jest.fn(async () => [{
      exercise_id: "exercise-squat",
      canonical_name: "Back Squat",
      metric_profile: "load_reps",
      metric_contract_version: 1,
      exercise_metric_generation: 1,
      default_rest_seconds: 90,
    }]);
    const kernel = {
      queryAll,
    } as unknown as SqliteKernel;
    let uuid = 0;
    const nowMs = jest.fn(() => 42_000);
    const randomUUID = jest.fn(() => {
      uuid += 1;
      return `uuid-${uuid}`;
    });
    const sha256 = jest.fn(async () => "a".repeat(64));
    const runtime = createOwnedPlanRuntimePort(kernel, {
      nowMs,
      randomUUID,
      sha256,
    });

    expect(runtime.createId("owned-plan")).toBe("owned-plan:uuid-1");
    await expect(runtime.loadPlan("plan-owner")).resolves.toBe(snapshot);
    expect(ownedRepository.read).toHaveBeenCalledWith("plan-owner");

    await expect(runtime.listExercises()).resolves.toEqual([{
      id: "exercise-squat",
      name: "Back Squat",
      metricIdentity: {
        profile: "load_reps",
        contractVersion: 1,
        exerciseMetricGeneration: 1,
      },
      defaultRestSeconds: 90,
    }]);
    expect(queryAll).toHaveBeenCalledWith(
      expect.stringContaining("entry.availability = 'available'"),
    );

    await runtime.createDraft({
      name: "Owner Strength",
      dayName: "Strength Day",
    });
    expect(ownedRepository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "owned-plan-create:uuid-2",
        planId: "owned-plan:uuid-3",
        dayId: "owned-plan-day:uuid-4",
        name: "Owner Strength",
        dayName: "Strength Day",
        createdAtMs: 42_000,
        requestSha256: "a".repeat(64),
      }),
    );

    await runtime.savePlan({
      expectedRevision: 1,
      plan: {
        id: "plan-owner",
        name: "Owner Strength",
        days: snapshot.days,
      },
    });
    expect(ownedRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "owned-plan-save:uuid-5",
        expectedRevision: 1,
        savedAtMs: 42_000,
        requestSha256: "a".repeat(64),
      }),
    );

    await runtime.duplicatePlan({
      sourcePlanId: "plan-owner",
      expectedRevision: 1,
      name: "Owner Strength Copy",
    });
    expect(ownedRepository.duplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "owned-plan-duplicate:uuid-6",
        sourcePlanId: "plan-owner",
        newPlanId: "owned-plan:uuid-7",
        expectedRevision: 1,
        name: "Owner Strength Copy",
        duplicatedAtMs: 42_000,
        requestSha256: "a".repeat(64),
      }),
    );

    await runtime.archivePlan({
      planId: "plan-owner",
      expectedRevision: 1,
    });
    expect(ownedRepository.archive).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "owned-plan-archive:uuid-8",
        planId: "plan-owner",
        expectedRevision: 1,
        updatedAtMs: 42_000,
        archived: true,
        requestSha256: "a".repeat(64),
      }),
    );

    await runtime.restorePlan({
      planId: "plan-owner",
      expectedRevision: 2,
    });
    expect(ownedRepository.restore).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "owned-plan-restore:uuid-9",
        planId: "plan-owner",
        expectedRevision: 2,
        updatedAtMs: 42_000,
        archived: false,
        requestSha256: "a".repeat(64),
      }),
    );
    expect(sha256).toHaveBeenCalledTimes(5);
    expect(nowMs).toHaveBeenCalledTimes(5);
  });

  it("forwards schedule-impact and replacement capabilities with post-commit invalidation", async () => {
    mockedCreateRepository.mockReturnValue(repository());
    mockedPreviewDayRemoval.mockResolvedValue({ preview: "day" } as never);
    mockedPreviewExerciseReplacement.mockResolvedValue({
      preview: "replacement",
    } as never);
    mockedRemovePlanDayWithImpact.mockImplementation(async (input) => {
      await input.invalidate([]);
      return { outcome: "committed" } as never;
    });
    mockedReplacePlanExercise.mockImplementation(async (input) => {
      await input.invalidate([]);
      return { outcome: "committed" } as never;
    });
    const nowMs = jest.fn(() => 42_000);
    const sha256 = jest.fn(async () => "b".repeat(64));
    const runtime = createOwnedPlanRuntimePort(
      { queryAll: jest.fn(async () => []) } as unknown as SqliteKernel,
      {
        nowMs,
        randomUUID: () => "impact-uuid",
        sha256,
      },
    );

    await expect(runtime.previewDayRemoval({
      planId: "plan-owner",
      dayId: "day-owner",
    })).resolves.toEqual({ preview: "day" });
    await expect(runtime.removeDayWithImpact({
      planId: "plan-owner",
    } as never)).resolves.toEqual({ outcome: "committed" });
    await expect(runtime.previewExerciseReplacement({
      planId: "plan-owner",
      occurrenceId: "occurrence-owner",
    })).resolves.toEqual({ preview: "replacement" });
    await expect(runtime.replaceExercise({
      planId: "plan-owner",
    } as never)).resolves.toEqual({ outcome: "committed" });

    expect(mockedPreviewDayRemoval).toHaveBeenCalledWith(expect.objectContaining({
      input: {
        planId: "plan-owner",
        dayId: "day-owner",
      },
      nowMs,
      sha256,
    }));
    expect(mockedRemovePlanDayWithImpact).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { planId: "plan-owner" },
        invalidate: expect.any(Function),
        nowMs,
        sha256,
      }),
    );
    expect(mockedPreviewExerciseReplacement).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          planId: "plan-owner",
          occurrenceId: "occurrence-owner",
        },
        sha256,
      }),
    );
    expect(mockedReplacePlanExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { planId: "plan-owner" },
        invalidate: expect.any(Function),
        sha256,
      }),
    );
  });

  it("exposes dedicated session write-back preview and apply without using replacement calls", async () => {
    mockedReplacePlanExercise.mockClear();
    const ownedRepository = repository();
    mockedCreateRepository.mockReturnValue(ownedRepository);
    mockedPreviewSessionExerciseEditsForPlan.mockResolvedValue({
      kind: 'session_exercise_edits',
      sourceSessionId: 'session-1',
      sourceSessionRevision: 4,
      planId: 'plan-owner',
      planName: 'Owner Strength',
      planDayId: 'day-owner',
      dayName: 'Strength Day',
      expectedPlanRevision: 1,
      currentWorkoutUnaffected: true,
      previewToken: `session-writeback-v1:${'a'.repeat(64)}`,
      composition: [],
      changes: [],
    });
    mockedApplySessionExerciseEditsToPlan.mockResolvedValue({
      outcome: 'committed',
      operation: 'session_exercise_edits',
      planId: 'plan-owner',
      planRevision: 2,
      sourceSessionId: 'session-1',
      currentWorkoutUnaffected: true,
      invalidations: ['library:plans', 'plan:plan-owner'],
    });
    const runtime = createOwnedPlanRuntimePort(
      { queryAll: jest.fn(async () => []) } as unknown as SqliteKernel,
      {
        nowMs: () => 42_000,
        randomUUID: () => 'writeback-uuid',
        sha256: async () => 'b'.repeat(64),
      },
    );

    await expect(runtime.previewSessionExerciseEdits({ sessionId: 'session-1' }))
      .resolves.toMatchObject({ sourceSessionId: 'session-1' });
    await expect(runtime.applySessionExerciseEdits({
      sourceSessionId: 'session-1',
      expectedPlanRevision: 1,
      previewToken: `session-writeback-v1:${'a'.repeat(64)}`,
      composition: [],
    })).resolves.toMatchObject({ outcome: 'committed', planRevision: 2 });

    expect(mockedPreviewSessionExerciseEditsForPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: ownedRepository,
        input: { sessionId: 'session-1' },
      }),
    );
    expect(mockedApplySessionExerciseEditsToPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          requestId: `session-writeback:session-writeback-v1:${'a'.repeat(64)}`,
          sourceSessionId: 'session-1',
          expectedPlanRevision: 1,
        }),
      }),
    );
    expect(mockedReplacePlanExercise).not.toHaveBeenCalled();
  });

  it("returns committed plan state through the next stateless plan load", async () => {
    const ownedRepository = repository();
    const committedPlan = {
      ...snapshot,
      revision: 2,
    };
    ownedRepository.read.mockResolvedValue(committedPlan);
    mockedCreateRepository.mockReturnValue(ownedRepository);
    mockedApplySessionExerciseEditsToPlan.mockResolvedValue({
      outcome: "committed",
      operation: "session_exercise_edits",
      planId: "plan-owner",
      planRevision: 2,
      sourceSessionId: "session-1",
      currentWorkoutUnaffected: true,
      invalidations: ["library:plans", "plan:plan-owner"],
    });
    const runtime = createOwnedPlanRuntimePort(
      { queryAll: jest.fn(async () => []) } as unknown as SqliteKernel,
      {
        nowMs: () => 42_000,
        randomUUID: () => "writeback-uuid",
        sha256: async () => "b".repeat(64),
      },
    );

    await runtime.applySessionExerciseEdits({
      sourceSessionId: "session-1",
      expectedPlanRevision: 1,
      previewToken: `session-writeback-v1:${"a".repeat(64)}`,
      composition: [],
    });

    await expect(runtime.loadPlan("plan-owner")).resolves.toEqual(
      committedPlan,
    );
    expect(ownedRepository.read).toHaveBeenCalledWith("plan-owner");
  });

  it("reuses a preview-bound request identity for an exact apply retry", async () => {
    mockedApplySessionExerciseEditsToPlan.mockClear();
    mockedCreateRepository.mockReturnValue(repository());
    mockedApplySessionExerciseEditsToPlan
      .mockResolvedValueOnce({
        outcome: "committed",
        operation: "session_exercise_edits",
        planId: "plan-owner",
        planRevision: 2,
        sourceSessionId: "session-1",
        currentWorkoutUnaffected: true,
        invalidations: [],
      })
      .mockResolvedValueOnce({
        outcome: "already_committed",
        operation: "session_exercise_edits",
        planId: "plan-owner",
        planRevision: 2,
        sourceSessionId: "session-1",
        currentWorkoutUnaffected: true,
        invalidations: [],
      });
    const previewToken = `session-writeback-v1:${"a".repeat(64)}`;
    const runtime = createOwnedPlanRuntimePort(
      { queryAll: jest.fn(async () => []) } as unknown as SqliteKernel,
      {
        nowMs: () => 42_000,
        randomUUID: jest
          .fn(() => "first-uuid")
          .mockReturnValueOnce("first-uuid")
          .mockReturnValueOnce("second-uuid"),
        sha256: async () => "b".repeat(64),
      },
    );
    const input = {
      sourceSessionId: "session-1",
      expectedPlanRevision: 1,
      previewToken,
      composition: [],
    } as const;

    await expect(runtime.applySessionExerciseEdits(input)).resolves
      .toMatchObject({ outcome: "committed" });
    await expect(runtime.applySessionExerciseEdits(input)).resolves
      .toMatchObject({ outcome: "already_committed" });

    const requestIds = mockedApplySessionExerciseEditsToPlan.mock.calls.map(
      ([context]) => context.input.requestId,
    );
    expect(requestIds).toEqual([
      `session-writeback:${previewToken}`,
      `session-writeback:${previewToken}`,
    ]);
  });

  it("suppresses a duplicate in-flight aggregate apply", async () => {
    mockedApplySessionExerciseEditsToPlan.mockClear();
    mockedCreateRepository.mockReturnValue(repository());
    let release: (() => void) | undefined;
    mockedApplySessionExerciseEditsToPlan.mockImplementation(() =>
      new Promise((resolve) => {
        release = () => resolve({
          outcome: 'committed',
          operation: 'session_exercise_edits',
          planId: 'plan-owner',
          planRevision: 2,
          sourceSessionId: 'session-1',
          currentWorkoutUnaffected: true,
          invalidations: [],
        });
      })
    );
    const runtime = createOwnedPlanRuntimePort(
      { queryAll: jest.fn(async () => []) } as unknown as SqliteKernel,
      {
        nowMs: () => 42_000,
        randomUUID: () => 'writeback-uuid',
        sha256: async () => 'b'.repeat(64),
      },
    );
    const input = {
      sourceSessionId: 'session-1',
      expectedPlanRevision: 1,
      previewToken: `session-writeback-v1:${'a'.repeat(64)}`,
      composition: [],
    } as const;
    const first = runtime.applySessionExerciseEdits(input);
    await expect(runtime.applySessionExerciseEdits(input))
      .rejects.toThrow('session_write_back_apply_in_flight');
    release?.();
    await expect(first).resolves.toMatchObject({ outcome: 'committed' });
    expect(mockedApplySessionExerciseEditsToPlan).toHaveBeenCalledTimes(1);
  });
});
