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
  previewDayRemoval,
  previewExerciseReplacement,
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
    removePlanDayWithImpact: jest.fn(),
    replacePlanExercise: jest.fn(),
  };
});

const mockedCreateRepository = jest.mocked(createOwnedPlanRepository);
const mockedPreviewDayRemoval = jest.mocked(previewDayRemoval);
const mockedRemovePlanDayWithImpact = jest.mocked(removePlanDayWithImpact);
const mockedPreviewExerciseReplacement = jest.mocked(
  previewExerciseReplacement,
);
const mockedReplacePlanExercise = jest.mocked(replacePlanExercise);

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
});
