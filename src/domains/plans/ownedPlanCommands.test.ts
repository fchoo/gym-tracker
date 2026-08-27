import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type {
  OwnedPlanRepository,
  OwnedPlanRepositoryResult,
  StagedCreateOwnedPlanDraft,
  StagedDuplicateOwnedPlan,
  StagedSaveOwnedPlan,
  StagedSetOwnedPlanArchived,
} from "../../platform/sqlite/repositories/ownedPlanRepository";
import {
  archiveOwnedPlan,
  createOwnedPlanDraft,
  duplicateOwnedPlan,
  OwnedPlanInputError,
  restoreOwnedPlan,
  saveOwnedPlan,
  type OwnedPlanDraftInput,
} from "./ownedPlanCommands";

const sha256 = async (): Promise<string> => "a".repeat(64);

const savedPlan: OwnedPlanDraftInput = {
  id: "plan-strength",
  name: "力量 Plan",
  days: [
    {
      id: "day-upper",
      name: "上肢",
      ordinal: 0,
      occurrences: [
        {
          id: "occurrence-squat",
          exerciseId: "exercise-squat",
          ordinal: 0,
          restSeconds: 90,
          metricIdentity: {
            profile: "load_reps",
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          },
          warmups: [
            {
              id: "warmup-squat",
              ordinal: 0,
              loadGrams: 10_000,
              reps: 5,
            },
          ],
          targets: [
            {
              id: "target-squat",
              ordinal: 0,
              target: {
                profile: "load_reps",
                version: 1,
                loadGrams: 20_000,
                minReps: 8,
                maxReps: 12,
                incrementGrams: 2_500,
                perSide: false,
              },
              units: {
                version: 1,
                load: "grams",
                count: "repetitions",
              },
            },
          ],
          policy: {
            id: "policy-squat",
            kind: "manual_hold",
            policyId: "manual-hold-v1",
            version: 1,
            rule: {
              kind: "manual_hold",
              id: "manual-hold-v1",
              version: 1,
            },
          },
        },
      ],
    },
  ],
};

function committed(
  operation: "create" | "save" | "duplicate" | "archive" | "restore",
  input:
    | StagedCreateOwnedPlanDraft
    | StagedSaveOwnedPlan
    | StagedDuplicateOwnedPlan
    | StagedSetOwnedPlanArchived,
): OwnedPlanRepositoryResult {
  const planId = "newPlanId" in input ? input.newPlanId : input.planId;
  return {
    outcome: "committed",
    operation,
    plan: {
      id: planId,
      name: "name" in input ? input.name : savedPlan.name,
      revision: "expectedRevision" in input
        ? input.expectedRevision + 1
        : 1,
      lifecycle: operation === "archive"
        ? "archived"
        : savedPlan.days[0]!.occurrences.length > 0
          ? "ready"
          : "draft",
      graphStatus: savedPlan.days[0]!.occurrences.length > 0
        ? "valid"
        : "missing_valid_target",
      missingRequirement: null,
      isActive: false,
      hasInProgressWorkout: false,
      days: [],
      scheduleDefaults: null,
    },
    currentWorkoutUnaffected: false,
    invalidations: [
      "library:plans",
      `plan:${planId}`,
    ],
  };
}

function repository(): OwnedPlanRepository {
  return {
    read: jest.fn(async () => null),
    createDraft: jest.fn(async (input: StagedCreateOwnedPlanDraft) =>
      committed("create", input)
    ),
    save: jest.fn(async (input: StagedSaveOwnedPlan) =>
      committed("save", input)
    ),
    duplicate: jest.fn(async (input: StagedDuplicateOwnedPlan) =>
      committed("duplicate", input)
    ),
    archive: jest.fn(async (input: StagedSetOwnedPlanArchived) =>
      committed("archive", input)
    ),
    restore: jest.fn(async (input: StagedSetOwnedPlanArchived) =>
      committed("restore", input)
    ),
  };
}

function planWith(
  mutate: (value: {
    id: string;
    name: string;
    days: Array<{
      id: string;
      name: string;
      ordinal: number;
      occurrences: Array<Record<string, unknown>>;
    }>;
  }) => void,
): OwnedPlanDraftInput {
  const value = structuredClone(savedPlan) as unknown as {
    id: string;
    name: string;
    days: Array<{
      id: string;
      name: string;
      ordinal: number;
      occurrences: Array<Record<string, unknown>>;
    }>;
  };
  mutate(value);
  return value as unknown as OwnedPlanDraftInput;
}

describe("D-21 through D-25 owned-plan aggregate commands", () => {
  it("creates an explicit inactive Unicode draft with one named empty day", async () => {
    const target = repository();
    const invalidate = jest.fn(async () => undefined);

    const result = await createOwnedPlanDraft({
      repository: target,
      invalidate,
      sha256,
      input: {
        requestId: "create-plan-1",
        planId: "plan-1",
        name: "力量计划 🏋️",
        dayId: "day-1",
        dayName: "上肢 Día α",
        createdAtMs: 100,
      },
    });

    expect(target.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "create-plan-1",
        planId: "plan-1",
        name: "力量计划 🏋️",
        dayId: "day-1",
        dayName: "上肢 Día α",
        requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
    expect(result).toMatchObject({
      outcome: "committed",
      plan: {
      id: "plan-1",
      isActive: false,
      },
    });
    expect(invalidate).toHaveBeenCalledWith(result.invalidations);
  });

  it("stages one complete graph and preserves explicit stable order", async () => {
    const target = repository();

    await saveOwnedPlan({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-plan-1",
        expectedRevision: 1,
        savedAtMs: 200,
        plan: savedPlan,
      },
    });

    expect(target.save).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: savedPlan.id,
        name: savedPlan.name,
        expectedRevision: 1,
        days: [
          expect.objectContaining({
            id: "day-upper",
            ordinal: 0,
            occurrences: [
              expect.objectContaining({
                id: "occurrence-squat",
                ordinal: 0,
                targets: [
                  expect.objectContaining({
                    id: "target-squat",
                    ordinal: 0,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  });

  it.each([
    {
      name: "blank plan name",
      plan: { ...savedPlan, name: " " },
      code: "owned_plan_name_invalid",
    },
    {
      name: "no named days",
      plan: { ...savedPlan, days: [] },
      code: "owned_plan_days_invalid",
    },
    {
      name: "non-contiguous day order",
      plan: {
        ...savedPlan,
        days: [{ ...savedPlan.days[0]!, ordinal: 1 }],
      },
      code: "owned_plan_order_invalid",
    },
    {
      name: "duplicate graph identity",
      plan: {
        ...savedPlan,
        days: [
          savedPlan.days[0]!,
          {
            ...savedPlan.days[0]!,
            name: "Duplicate",
            ordinal: 1,
          },
        ],
      },
      code: "owned_plan_identity_invalid",
    },
    {
      name: "target identity mismatch",
      plan: {
        ...savedPlan,
        days: [{
          ...savedPlan.days[0]!,
          occurrences: [{
            ...savedPlan.days[0]!.occurrences[0]!,
            targets: [{
              ...savedPlan.days[0]!.occurrences[0]!.targets[0]!,
              target: {
                profile: "timed_hold",
                version: 1,
                durationSeconds: 30,
              },
            }],
          }],
        }],
      },
      code: "owned_plan_target_invalid",
    },
  ])("rejects $name before repository work", async ({ plan, code }) => {
    const target = repository();

    await expect(saveOwnedPlan({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-invalid",
        expectedRevision: 1,
        savedAtMs: 200,
        plan: plan as OwnedPlanDraftInput,
      },
    })).rejects.toMatchObject({ code });
    expect(target.save).not.toHaveBeenCalled();
  });

  it("does not invalidate dirty process-local edits before aggregate Save", () => {
    const dirty = {
      ...savedPlan,
      name: "Dirty local name",
      days: [{
        ...savedPlan.days[0]!,
        name: "Dirty local day",
      }],
    };

    expect(dirty.name).toBe("Dirty local name");
    expect(dirty.days[0]!.name).toBe("Dirty local day");
    expect(savedPlan.name).toBe("力量 Plan");
    expect(savedPlan.days[0]!.name).toBe("上肢");
  });

  it.each([
    {
      name: "oversized warmup list",
      plan: planWith((value) => {
        value.days[0]!.occurrences[0]!.warmups = Array.from(
          { length: 101 },
          (_, ordinal) => ({
            id: `warmup-${ordinal}`,
            ordinal,
            loadGrams: 0,
            reps: 1,
          }),
        );
      }),
      code: "owned_plan_warmup_invalid",
    },
    {
      name: "invalid warmup values",
      plan: planWith((value) => {
        value.days[0]!.occurrences[0]!.warmups = [{
          id: "warmup-invalid",
          ordinal: 0,
          loadGrams: -1,
          reps: 0,
        }];
      }),
      code: "owned_plan_warmup_invalid",
    },
    {
      name: "missing targets",
      plan: planWith((value) => {
        value.days[0]!.occurrences[0]!.targets = [];
      }),
      code: "owned_plan_target_invalid",
    },
    {
      name: "empty target units",
      plan: planWith((value) => {
        value.days[0]!.occurrences[0]!.targets = [{
          ...value.days[0]!.occurrences[0]!.targets as object[],
        }];
        const target = value.days[0]!.occurrences[0]!
          .targets as Array<Record<string, unknown>>;
        target[0] = {
          ...structuredClone(
            savedPlan.days[0]!.occurrences[0]!.targets[0]!,
          ),
          units: {},
        };
      }),
      code: "owned_plan_target_invalid",
    },
    {
      name: "invalid policy",
      plan: planWith((value) => {
        value.days[0]!.occurrences[0]!.policy = {
          id: "",
          kind: "manual_hold",
          policyId: "",
          version: 0,
          rule: {},
        };
      }),
      code: "owned_plan_policy_invalid",
    },
    {
      name: "negative rest",
      plan: planWith((value) => {
        value.days[0]!.occurrences[0]!.restSeconds = -1;
      }),
      code: "owned_plan_rest_invalid",
    },
    {
      name: "excessive rest",
      plan: planWith((value) => {
        value.days[0]!.occurrences[0]!.restSeconds = 86_401;
      }),
      code: "owned_plan_occurrence_invalid",
    },
    {
      name: "unsupported metric identity",
      plan: planWith((value) => {
        value.days[0]!.occurrences[0]!.metricIdentity = {
          profile: "timed_hold",
          contractVersion: 99,
          exerciseMetricGeneration: 1,
        };
      }),
      code: "owned_plan_occurrence_invalid",
    },
    {
      name: "invalid day",
      plan: planWith((value) => {
        value.days[0]!.name = "";
      }),
      code: "owned_plan_days_invalid",
    },
  ])("rejects $name as a complete aggregate", async ({ plan, code }) => {
    const target = repository();
    await expect(saveOwnedPlan({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-malformed-graph",
        expectedRevision: 1,
        savedAtMs: 1,
        plan,
      },
    })).rejects.toMatchObject({ code });
  });

  it("rejects a malformed request digest and tolerates invalidation failure after commit", async () => {
    const target = repository();
    await expect(createOwnedPlanDraft({
      repository: target,
      invalidate: async () => undefined,
      sha256: async () => "invalid",
      input: {
        requestId: "bad-hash",
        planId: "bad-hash-plan",
        name: "Bad Hash",
        dayId: "bad-hash-day",
        dayName: "Day",
        createdAtMs: 1,
      },
    })).rejects.toMatchObject({ code: "owned_plan_hash_invalid" });

    await expect(createOwnedPlanDraft({
      repository: target,
      invalidate: async () => {
        throw new Error("derivative_failed");
      },
      sha256,
      input: {
        requestId: "invalidation-failure",
        planId: "invalidation-plan",
        name: "Committed Plan",
        dayId: "invalidation-day",
        dayName: "Day",
        createdAtMs: 1,
      },
    })).resolves.toMatchObject({ outcome: "committed" });
  });
});

describe("D-26 through D-31 owned-plan lifecycle commands", () => {
  it("duplicates through one noun-specific aggregate repository call", async () => {
    const target = repository();

    await duplicateOwnedPlan({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-plan-1",
        sourcePlanId: savedPlan.id,
        expectedRevision: 2,
        newPlanId: "plan-strength-copy",
        name: "力量 Plan Copy",
        duplicatedAtMs: 300,
      },
    });

    expect(target.duplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePlanId: savedPlan.id,
        expectedRevision: 2,
        newPlanId: "plan-strength-copy",
        requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
  });

  it("archives and restores without exposing a delete command", async () => {
    const target = repository();

    await archiveOwnedPlan({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "archive-plan-1",
        planId: savedPlan.id,
        expectedRevision: 2,
        updatedAtMs: 400,
      },
    });
    await restoreOwnedPlan({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "restore-plan-1",
        planId: savedPlan.id,
        expectedRevision: 3,
        updatedAtMs: 500,
      },
    });

    expect(target.archive).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true }),
    );
    expect(target.restore).toHaveBeenCalledWith(
      expect.objectContaining({ archived: false }),
    );
    expect(Object.keys(target)).not.toContain("delete");
  });

  it("returns schedule impact without post-commit invalidation", async () => {
    const target = repository();
    const invalidate = jest.fn(async () => undefined);
    jest.mocked(target.save).mockResolvedValueOnce({
      outcome: "requires_schedule_impact",
      code: "requires_schedule_impact",
      planId: savedPlan.id,
      expectedRevision: 2,
      activeScheduleId: "schedule-1",
      invalidations: [],
    });

    const result = await saveOwnedPlan({
      repository: target,
      invalidate,
      sha256,
      input: {
        requestId: "save-impact",
        expectedRevision: 2,
        savedAtMs: 600,
        plan: {
          ...savedPlan,
          days: [{
            ...savedPlan.days[0]!,
            id: "replacement-day",
          }],
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "requires_schedule_impact",
      code: "requires_schedule_impact",
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("rejects unsafe request, revision, identity, and time values", async () => {
    const target = repository();

    for (const action of [
      () => duplicateOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "",
          sourcePlanId: savedPlan.id,
          expectedRevision: 1,
          newPlanId: "copy",
          name: "Copy",
          duplicatedAtMs: 1,
        },
      }),
      () => archiveOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "archive",
          planId: savedPlan.id,
          expectedRevision: -1,
          updatedAtMs: 1,
        },
      }),
      () => restoreOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "restore",
          planId: savedPlan.id,
          expectedRevision: 1,
          updatedAtMs: Number.NaN,
        },
      }),
    ]) {
      await expect(action()).rejects.toBeInstanceOf(OwnedPlanInputError);
    }
  });

  it.each([
    {
      name: "create identifier",
      action: (target: OwnedPlanRepository) => createOwnedPlanDraft({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "",
          planId: "plan",
          name: "Plan",
          dayId: "day",
          dayName: "Day",
          createdAtMs: 1,
        },
      }),
      code: "owned_plan_identifier_invalid",
    },
    {
      name: "create name",
      action: (target: OwnedPlanRepository) => createOwnedPlanDraft({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "create",
          planId: "plan",
          name: "",
          dayId: "day",
          dayName: "Day",
          createdAtMs: 1,
        },
      }),
      code: "owned_plan_name_invalid",
    },
    {
      name: "create time",
      action: (target: OwnedPlanRepository) => createOwnedPlanDraft({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "create",
          planId: "plan",
          name: "Plan",
          dayId: "day",
          dayName: "Day",
          createdAtMs: -1,
        },
      }),
      code: "owned_plan_time_invalid",
    },
    {
      name: "save identifier",
      action: (target: OwnedPlanRepository) => saveOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "",
          expectedRevision: 1,
          savedAtMs: 1,
          plan: savedPlan,
        },
      }),
      code: "owned_plan_identifier_invalid",
    },
    {
      name: "save revision",
      action: (target: OwnedPlanRepository) => saveOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "save",
          expectedRevision: 0,
          savedAtMs: 1,
          plan: savedPlan,
        },
      }),
      code: "owned_plan_revision_invalid",
    },
    {
      name: "save time",
      action: (target: OwnedPlanRepository) => saveOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "save",
          expectedRevision: 1,
          savedAtMs: -1,
          plan: savedPlan,
        },
      }),
      code: "owned_plan_time_invalid",
    },
    {
      name: "duplicate name",
      action: (target: OwnedPlanRepository) => duplicateOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "duplicate",
          sourcePlanId: "source",
          expectedRevision: 1,
          newPlanId: "copy",
          name: "",
          duplicatedAtMs: 1,
        },
      }),
      code: "owned_plan_name_invalid",
    },
    {
      name: "duplicate revision",
      action: (target: OwnedPlanRepository) => duplicateOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "duplicate",
          sourcePlanId: "source",
          expectedRevision: 0,
          newPlanId: "copy",
          name: "Copy",
          duplicatedAtMs: 1,
        },
      }),
      code: "owned_plan_revision_invalid",
    },
    {
      name: "duplicate time",
      action: (target: OwnedPlanRepository) => duplicateOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "duplicate",
          sourcePlanId: "source",
          expectedRevision: 1,
          newPlanId: "copy",
          name: "Copy",
          duplicatedAtMs: -1,
        },
      }),
      code: "owned_plan_time_invalid",
    },
    {
      name: "lifecycle identifier",
      action: (target: OwnedPlanRepository) => archiveOwnedPlan({
        repository: target,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "",
          planId: "plan",
          expectedRevision: 1,
          updatedAtMs: 1,
        },
      }),
      code: "owned_plan_identifier_invalid",
    },
  ])("rejects invalid $name fields", async ({ action, code }) => {
    await expect(action(repository())).rejects.toMatchObject({ code });
  });
});
