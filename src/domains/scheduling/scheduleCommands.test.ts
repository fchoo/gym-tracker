import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createHash } from "node:crypto";

import type {
  ActivateOwnedPlanScheduleRepositoryInput,
  ApplyScheduleOpportunityRepositoryInput,
  ChangeScheduleTimeZoneRepositoryInput,
  ConsumeScheduleDateOverrideRepositoryInput,
  ScheduleActionState,
  ScheduleMutationResult,
  ScheduleRepository,
  SaveScheduleVersionRepositoryInput,
  SetScheduleDateOverrideRepositoryInput,
} from "../../platform/sqlite/repositories/scheduleRepository";
import {
  activateOwnedPlanSchedule,
  advanceRotation,
  changeScheduleTimeZone,
  completeScheduledOpportunity,
  consumeScheduleDateOverride,
  createScheduleVersionPreviewToken,
  markWeekdayOpportunityMissed,
  recordTrainAnyway,
  repeatRotation,
  saveScheduleVersion,
  ScheduleCommandInputError,
  setDateOverride,
  skipOpportunity,
  type ActivateOwnedPlanScheduleInput,
  type SaveScheduleVersionInput,
} from "./scheduleCommands";
import { parseLocalDate } from "./localDate";
import { parseStoredTimeZone } from "./timeZone";
import {
  FOLLOW_DEVICE_TIMEZONE_LABEL,
  KEEP_CURRENT_TIMEZONE_LABEL,
} from "./scheduleState";

const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

const currentVersion = {
  id: "schedule-version-1",
  versionNumber: 1,
  effectiveLocalDate: "2026-08-17",
  mode: "rotation" as const,
  timeZone: "Asia/Singapore",
  rotationPointer: 0,
  bindings: [{
    id: "binding-1",
    ordinal: 0,
    planDayId: "plan-day-a",
  }],
};

const nextVersion = {
  effectiveLocalDate: "2026-08-18",
  mode: "weekday" as const,
  timeZone: "Asia/Shanghai",
  bindings: [{
    ordinal: 0,
    weekIndex: 0,
    weekday: "Tuesday" as const,
    planDayId: "plan-day-a",
  }],
};

function committed(
  input: SaveScheduleVersionRepositoryInput,
) {
  return {
    outcome: "committed" as const,
    operation: "save_schedule_version" as const,
    scheduleId: input.scheduleId,
    planId: input.planId,
    scheduleRevision: input.expectedScheduleRevision + 1,
    planRevision: input.expectedPlanRevision + 1,
    version: {
      id: input.versionId,
      versionNumber: 2,
      effectiveLocalDate: input.next.effectiveLocalDate,
      mode: input.next.mode,
      timeZone: input.next.timeZone,
      rotationPointer: null,
      bindings: input.next.bindings.map((binding, ordinal) => ({
        id: input.bindingIds[ordinal]!,
        ...binding,
      })),
    },
    invalidations: [
      `plan:${input.planId}`,
      `schedule:${input.scheduleId}`,
      `schedule:${input.scheduleId}:date:${input.next.effectiveLocalDate}`,
      "today",
    ],
  };
}

function repository(
  overrides: Partial<ScheduleRepository> = {},
): ScheduleRepository {
  return {
    readCommandResult: jest.fn(async () => null),
    activateSchedule: jest.fn(
      async (input: ActivateOwnedPlanScheduleRepositoryInput) => {
        const scheduleId = input.targetSchedule.scheduleId;
        return {
          outcome: "committed",
          operation: "activate_schedule",
          scheduleId,
          planId: input.planId,
          scheduleRevision: input.targetSchedule.kind === "absent"
            ? 1
            : input.targetSchedule.scheduleRevision + 1,
          planRevision: input.expectedPlanRevision + 1,
          version: {
            id: input.versionId,
            versionNumber: input.targetSchedule.kind === "absent"
              ? 1
              : input.targetSchedule.before.versionNumber + 1,
            effectiveLocalDate: input.next.effectiveLocalDate,
            mode: input.next.mode,
            timeZone: input.next.timeZone,
            rotationPointer: input.next.mode === "rotation" ? 0 : null,
            bindings: input.next.bindings.map((binding, ordinal) => ({
              id: input.bindingIds[ordinal]!,
              ...binding,
            })),
          },
          invalidations: [
            `plan:${input.planId}`,
            `schedule:${scheduleId}`,
            `schedule:${scheduleId}:date:${input.next.effectiveLocalDate}`,
            "today",
          ],
        } as const;
      },
    ),
    saveVersion: jest.fn(async (input: SaveScheduleVersionRepositoryInput) =>
      committed(input)
    ),
    readEffectiveOpportunity: jest.fn(async () => null),
    readActionState: jest.fn(async () => null),
    readDateOverride: jest.fn(async () => null),
    readTimeZoneState: jest.fn(async () => null),
    setDateOverride: jest.fn(
      async (input: SetScheduleDateOverrideRepositoryInput) =>
        mutationResult(input),
    ),
    consumeDateOverride: jest.fn(
      async (input: ConsumeScheduleDateOverrideRepositoryInput) =>
        mutationResult(input),
    ),
    applyOpportunityAction: jest.fn(
      async (input: ApplyScheduleOpportunityRepositoryInput) =>
        mutationResult(input),
    ),
    changeTimeZone: jest.fn(
      async (input: ChangeScheduleTimeZoneRepositoryInput) =>
        mutationResult(input),
    ),
    ...overrides,
  };
}

async function validInput(
  overrides: Partial<SaveScheduleVersionInput> = {},
): Promise<SaveScheduleVersionInput> {
  const base = {
    requestId: "save-schedule-1",
    scheduleId: "schedule-1",
    planId: "plan-1",
    expectedScheduleRevision: 1,
    expectedPlanRevision: 7,
    todayLocalDate: "2026-08-18",
    savedAtMs: 1_787_027_200_000,
    before: currentVersion,
    next: nextVersion,
  };
  return {
    ...base,
    confirmationToken: await createScheduleVersionPreviewToken({
      sha256,
      preview: {
        scheduleId: base.scheduleId,
        planId: base.planId,
        expectedScheduleRevision: base.expectedScheduleRevision,
        expectedPlanRevision: base.expectedPlanRevision,
        before: base.before,
        after: base.next,
      },
    }),
    ...overrides,
  };
}

async function validActivationInput(
  overrides: Partial<ActivateOwnedPlanScheduleInput> = {},
): Promise<ActivateOwnedPlanScheduleInput> {
  const base = {
    requestId: "activate-schedule-1",
    planId: "plan-1",
    expectedPlanRevision: 7,
    expectedActivePair: {
      kind: "pair" as const,
      planId: "plan-active",
      planRevision: 8,
      scheduleId: "schedule-active",
      scheduleRevision: 4,
    },
    targetSchedule: {
      kind: "absent" as const,
      scheduleId: "schedule-new",
    },
    todayLocalDate: "2026-08-18",
    activatedAtMs: 1_787_027_200_000,
    next: nextVersion,
  };
  return {
    ...base,
    confirmationToken: await createScheduleVersionPreviewToken({
      sha256,
      preview: {
        planId: base.planId,
        expectedPlanRevision: base.expectedPlanRevision,
        expectedActivePair: base.expectedActivePair,
        targetSchedule: base.targetSchedule,
        after: base.next,
      },
    }),
    ...overrides,
  };
}

describe("D-40/D-41 schedule version commands", () => {
  it("stages and invalidates the confirmed initial activation exactly once", async () => {
    const target = repository();
    const invalidate = jest.fn(async () => undefined);
    const input = await validActivationInput();

    const result = await activateOwnedPlanSchedule({
      repository: target,
      invalidate,
      sha256,
      input,
    });

    expect(target.activateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "activate_schedule",
        requestId: input.requestId,
        requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        planId: input.planId,
        expectedPlanRevision: 7,
        expectedActivePair: input.expectedActivePair,
        targetSchedule: input.targetSchedule,
        next: nextVersion,
        versionId: expect.stringContaining("schedule-version:"),
        bindingIds: [expect.stringContaining("schedule-binding:")],
      }),
    );
    expect(result).toMatchObject({ operation: "activate_schedule" });
    expect(invalidate).toHaveBeenCalledWith(result.invalidations);
  });

  it.each([
    {
      name: "identifier",
      mutate: (input: ActivateOwnedPlanScheduleInput) => ({
        ...input,
        targetSchedule: {
          kind: "absent" as const,
          scheduleId: "",
        },
      }),
      code: "schedule_identifier_invalid",
    },
    {
      name: "plan revision",
      mutate: (input: ActivateOwnedPlanScheduleInput) => ({
        ...input,
        expectedPlanRevision: 0,
      }),
      code: "schedule_revision_invalid",
    },
    {
      name: "target schedule revision",
      mutate: (input: ActivateOwnedPlanScheduleInput) => ({
        ...input,
        targetSchedule: {
          kind: "inactive" as const,
          scheduleId: "schedule-inactive",
          scheduleRevision: 0,
          before: currentVersion,
        },
      }),
      code: "schedule_revision_invalid",
    },
    {
      name: "active schedule revision",
      mutate: (input: ActivateOwnedPlanScheduleInput) => ({
        ...input,
        expectedActivePair: {
          kind: "pair" as const,
          planId: "plan-active",
          planRevision: 8,
          scheduleId: "schedule-active",
          scheduleRevision: 0,
        },
      }),
      code: "schedule_revision_invalid",
    },
    {
      name: "active plan revision",
      mutate: (input: ActivateOwnedPlanScheduleInput) => ({
        ...input,
        expectedActivePair: {
          kind: "pair" as const,
          planId: "plan-active",
          planRevision: 0,
          scheduleId: "schedule-active",
          scheduleRevision: 4,
        },
      }),
      code: "schedule_revision_invalid",
    },
    {
      name: "activation time",
      mutate: (input: ActivateOwnedPlanScheduleInput) => ({
        ...input,
        activatedAtMs: -1,
      }),
      code: "schedule_time_invalid",
    },
    {
      name: "preview token",
      mutate: (input: ActivateOwnedPlanScheduleInput) => ({
        ...input,
        confirmationToken: "schedule-preview-v1:stale",
      }),
      code: "schedule_preview_conflict",
    },
    {
      name: "empty initial bindings",
      mutate: (input: ActivateOwnedPlanScheduleInput) => ({
        ...input,
        next: {
          effectiveLocalDate: "2026-08-18",
          mode: "rotation" as const,
          timeZone: "Asia/Singapore",
          bindings: [],
        },
      }),
      code: "schedule_bindings_invalid",
    },
  ])("rejects invalid activation $name before mutation", async ({
    mutate,
    code,
  }) => {
    const target = repository();

    await expect(activateOwnedPlanSchedule({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: mutate(await validActivationInput()),
    })).rejects.toMatchObject({ code });
    expect(target.activateSchedule).not.toHaveBeenCalled();
  });

  it("binds the complete before/after/effective LocalDate preview and invalidates only after commit", async () => {
    const target = repository();
    const invalidate = jest.fn(async () => undefined);
    const input = await validInput();

    const result = await saveScheduleVersion({
      repository: target,
      invalidate,
      sha256,
      input,
    });

    expect(target.saveVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: input.requestId,
        requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        scheduleId: input.scheduleId,
        planId: input.planId,
        expectedScheduleRevision: 1,
        expectedPlanRevision: 7,
        before: currentVersion,
        next: nextVersion,
        versionId: expect.stringContaining("schedule-version:"),
        bindingIds: [expect.stringContaining("schedule-binding:")],
      }),
    );
    expect(result.version.bindings).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(result.invalidations);
  });

  it("does not invalidate when the FIFO transaction rejects the save", async () => {
    const failure = new Error("schedule_revision_conflict");
    const target = repository({
      saveVersion: jest.fn(async () => {
        throw failure;
      }),
    });
    const invalidate = jest.fn(async () => undefined);

    await expect(saveScheduleVersion({
      repository: target,
      invalidate,
      sha256,
      input: await validInput(),
    })).rejects.toBe(failure);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("keeps the committed save authoritative when cache invalidation fails", async () => {
    const target = repository();

    await expect(saveScheduleVersion({
      repository: target,
      invalidate: async () => {
        throw new Error("cache_unavailable");
      },
      sha256,
      input: await validInput(),
    })).resolves.toMatchObject({ outcome: "committed" });
  });

  it("does not invalidate an already committed save replay", async () => {
    const target = repository({
      saveVersion: jest.fn(async (input: SaveScheduleVersionRepositoryInput) => ({
        ...committed(input),
        outcome: "already_committed" as const,
      })),
    });
    const invalidate = jest.fn(async () => undefined);

    await saveScheduleVersion({
      repository: target,
      invalidate,
      sha256,
      input: await validInput(),
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "backdated effective LocalDate",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        next: { ...nextVersion, effectiveLocalDate: "2026-08-17" },
      }),
      code: "schedule_effective_local_date_invalid",
    },
    {
      name: "invalid Unicode timezone",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        next: { ...nextVersion, timeZone: "亚洲/不存在" },
      }),
      code: "schedule_timezone_invalid",
    },
    {
      name: "non-contiguous binding order",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        next: {
          ...nextVersion,
          bindings: [{ ...nextVersion.bindings[0]!, ordinal: 1 }],
        },
      }),
      code: "schedule_bindings_invalid",
    },
    {
      name: "stale preview token",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        confirmationToken: "schedule-preview-v1:stale",
      }),
      code: "schedule_preview_conflict",
    },
  ])("rejects $name before repository mutation", async ({ mutate, code }) => {
    const target = repository();
    const error = saveScheduleVersion({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: mutate(await validInput()),
    }).catch((caught: unknown) => caught);

    await expect(error).resolves.toMatchObject({
      constructor: ScheduleCommandInputError,
      code,
    });
    expect(target.saveVersion).not.toHaveBeenCalled();
  });

  it("accepts an explicit empty Rotation state without inventing a binding", async () => {
    const target = repository();
    const initial = await validInput({
      next: {
        effectiveLocalDate: "2026-08-18",
        mode: "rotation",
        timeZone: "Asia/Singapore",
        bindings: [],
      },
    });
    const empty = {
      ...initial,
      confirmationToken: await createScheduleVersionPreviewToken({
        sha256,
        preview: {
          scheduleId: initial.scheduleId,
          planId: initial.planId,
          expectedScheduleRevision: initial.expectedScheduleRevision,
          expectedPlanRevision: initial.expectedPlanRevision,
          before: initial.before,
          after: initial.next,
        },
      }),
    };

    await saveScheduleVersion({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: empty,
    });

    expect(target.saveVersion).toHaveBeenCalledWith(
      expect.objectContaining({ bindingIds: [] }),
    );
  });

  it("stages a non-empty Rotation binding in stable ordinal order", async () => {
    const target = repository();
    const initial = await validInput({
      next: {
        effectiveLocalDate: "2026-08-18",
        mode: "rotation",
        timeZone: "Asia/Singapore",
        bindings: [{ ordinal: 0, planDayId: "plan-day-a" }],
      },
    });
    const input = {
      ...initial,
      confirmationToken: await createScheduleVersionPreviewToken({
        sha256,
        preview: {
          scheduleId: initial.scheduleId,
          planId: initial.planId,
          expectedScheduleRevision: initial.expectedScheduleRevision,
          expectedPlanRevision: initial.expectedPlanRevision,
          before: initial.before,
          after: initial.next,
        },
      }),
    };

    await saveScheduleVersion({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input,
    });

    expect(target.saveVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        next: {
          effectiveLocalDate: "2026-08-18",
          mode: "rotation",
          timeZone: "Asia/Singapore",
          rotationPointer: 0,
          bindings: [{ ordinal: 0, planDayId: "plan-day-a" }],
        },
      }),
    );
  });
});

const rotationActionState: ScheduleActionState = {
  scheduleId: "schedule-1",
  planId: "plan-1",
  scheduleRevision: 4,
  planRevision: 7,
  localDate: parseLocalDate("2026-08-18"),
  version: {
    id: "schedule-version-1",
    versionNumber: 1,
    effectiveLocalDate: "2026-08-17",
    mode: "rotation",
    timeZone: "Asia/Singapore",
    rotationPointer: 0,
    bindings: [
      { id: "binding-a", ordinal: 0, planDayId: "plan-day-a" },
      { id: "binding-b", ordinal: 1, planDayId: "plan-day-b" },
    ],
  },
  rotationState: {
    version: 1,
    mode: "rotation",
    revision: 4,
    bindings: ["plan-day-a", "plan-day-b"],
    pointer: 0,
    currentOpportunity: {
      version: 1,
      state: "pending",
      id: "opportunity-1",
      source: "rotation",
      localDate: parseLocalDate("2026-08-18"),
      planDayId: "plan-day-a",
      revision: 1,
    },
  },
  opportunity: {
    version: 1,
    state: "pending",
    id: "opportunity-1",
    source: "rotation",
    localDate: parseLocalDate("2026-08-18"),
    planDayId: "plan-day-a",
    revision: 1,
  },
};

const weekdayActionState: ScheduleActionState = {
  ...rotationActionState,
  version: {
    ...rotationActionState.version,
    mode: "weekday",
    rotationPointer: null,
    bindings: [{
      id: "binding-a",
      ordinal: 0,
      weekIndex: 0,
      weekday: "Tuesday",
      planDayId: "plan-day-a",
    }],
  },
  rotationState: null,
  opportunity: {
    version: 1,
    state: "pending",
    id: "opportunity-1",
    source: "weekday",
    localDate: parseLocalDate("2026-08-18"),
    planDayId: "plan-day-a",
    revision: 1,
  },
};

function mutationResult(
  input:
    | ApplyScheduleOpportunityRepositoryInput
    | ChangeScheduleTimeZoneRepositoryInput
    | ConsumeScheduleDateOverrideRepositoryInput
    | SetScheduleDateOverrideRepositoryInput,
): ScheduleMutationResult {
  return {
    outcome: "committed",
    operation: input.operation,
    scheduleId: input.scheduleId,
    planId: input.planId,
    scheduleRevision: input.expectedScheduleRevision + 1,
    planRevision: input.expectedPlanRevision
      + (input.operation === "change_timezone" && input.nextVersion !== null
        ? 1
        : 0),
    localDate: input.localDate,
    invalidations: [
      `schedule:${input.scheduleId}`,
      `schedule:${input.scheduleId}:date:${input.localDate}`,
    ],
  };
}

function actionRepository(
  state: ScheduleActionState,
): ScheduleRepository {
  return repository({
    readActionState: jest.fn(async () => state),
    applyOpportunityAction: jest.fn(
      async (input: ApplyScheduleOpportunityRepositoryInput) =>
        mutationResult(input),
    ),
  });
}

function actionContext(target: ScheduleRepository) {
  return {
    repository: target,
    invalidate: jest.fn(async () => undefined),
    sha256,
  };
}

const commonActionInput = {
  requestId: "schedule-action-1",
  scheduleId: "schedule-1",
  planId: "plan-1",
  expectedScheduleRevision: 4,
  expectedPlanRevision: 7,
  instantMs: Date.UTC(2026, 7, 18, 4),
  occurredAtMs: 1_787_027_200_000,
};

describe("D-42/D-43 persisted Rotation command orchestration", () => {
  it.each([
    {
      name: "Repeat holds the pointer",
      command: repeatRotation,
      eventType: "rotation_repeated",
      consumed: null,
      toPointer: 0,
    },
    {
      name: "Skip consumes the opportunity and advances",
      command: skipOpportunity,
      eventType: "rotation_skipped",
      consumed: "skipped",
      toPointer: 1,
    },
    {
      name: "Advance consumes the opportunity without a workout",
      command: advanceRotation,
      eventType: "rotation_advanced",
      consumed: "advanced",
      toPointer: 1,
    },
  ])("$name", async ({ command, eventType, consumed, toPointer }) => {
    const target = actionRepository(rotationActionState);
    const context = actionContext(target);

    const result = await command({
      ...context,
      input: commonActionInput,
    });

    expect(target.applyOpportunityAction).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedScheduleRevision: 4,
        transition: expect.objectContaining({
          consumed: consumed === null
            ? null
            : expect.objectContaining({ outcome: consumed }),
          events: [expect.objectContaining({
            type: eventType,
            toPointer,
          })],
        }),
      }),
    );
    expect(context.invalidate).toHaveBeenCalledWith(result.invalidations);
  });

  it("scheduled completion keeps the session start LocalDate and advances", async () => {
    const target = actionRepository(rotationActionState);

    await completeScheduledOpportunity({
      ...actionContext(target),
      input: {
        ...commonActionInput,
        requestId: "complete-scheduled",
        sessionId: "session-1",
        sessionLocalDate: "2026-08-18",
        planDayId: "plan-day-a",
      },
    });

    expect(target.applyOpportunityAction).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: expect.objectContaining({
          consumed: expect.objectContaining({
            outcome: "completed",
            sessionId: "session-1",
            localDate: "2026-08-18",
          }),
          events: [expect.objectContaining({
            type: "rotation_completed",
            toPointer: 1,
          })],
        }),
      }),
    );
  });

  it.each([
    {
      workout: { kind: "plan_day" as const, planDayId: "plan-day-b" },
      advanceRotation: false,
      consumed: null,
      toPointer: 0,
    },
    {
      workout: { kind: "rest_day" as const, planDayId: null },
      advanceRotation: true,
      consumed: "advanced",
      toPointer: 1,
    },
    {
      workout: { kind: "empty" as const, planDayId: null },
      advanceRotation: false,
      consumed: null,
      toPointer: 0,
    },
  ])(
    "D-43 persists $workout.kind with explicit advance=$advanceRotation",
    async ({ workout, advanceRotation: shouldAdvance, consumed, toPointer }) => {
      const target = actionRepository(rotationActionState);

      await recordTrainAnyway({
        ...actionContext(target),
        input: {
          ...commonActionInput,
          requestId: `train-${workout.kind}-${shouldAdvance}`,
          workout,
          advanceRotation: shouldAdvance,
        },
      });

      expect(target.applyOpportunityAction).toHaveBeenCalledWith(
        expect.objectContaining({
          transition: expect.objectContaining({
            consumed: consumed === null
              ? null
              : expect.objectContaining({ outcome: consumed }),
            events: [expect.objectContaining({
              type: "train_anyway",
              rotationAdvanced: shouldAdvance,
              toPointer,
            })],
          }),
        }),
      );
    },
  );
});

describe("D-44 override persistence commands", () => {
  it("creates and confirmed-replaces one pending override", async () => {
    const target = repository({
      readDateOverride: jest.fn(async () => null),
      setDateOverride: jest.fn(
        async (input: SetScheduleDateOverrideRepositoryInput) =>
          mutationResult(input),
      ),
    });

    await setDateOverride({
      ...actionContext(target),
      input: {
        requestId: "override-create",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        expectedOverrideRevision: 0,
        overrideId: "override-1",
        localDate: "2026-08-19",
        replacement: { kind: "plan_day", planDayId: "plan-day-b" },
        occurredAtMs: 1_787_027_200_000,
      },
    });

    expect(target.setDateOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: {
          next: expect.objectContaining({
            state: "pending",
            revision: 1,
            selection: { kind: "plan_day", planDayId: "plan-day-b" },
          }),
          events: [expect.objectContaining({ type: "override_created" })],
        },
      }),
    );
  });

  it("passes explicit confirmation when replacing a pending override", async () => {
    const pending = {
      version: 1 as const,
      state: "pending" as const,
      id: "override-1",
      revision: 1,
      localDate: parseLocalDate("2026-08-19"),
      selection: { kind: "rest_day" as const },
    };
    const target = repository({
      readDateOverride: jest.fn(async () => pending),
      setDateOverride: jest.fn(
        async (input: SetScheduleDateOverrideRepositoryInput) =>
          mutationResult(input),
      ),
    });

    await setDateOverride({
      ...actionContext(target),
      input: {
        requestId: "override-replace",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        expectedOverrideRevision: 1,
        overrideId: "override-1",
        localDate: "2026-08-19",
        replacement: { kind: "skip" },
        confirmation: "replace_pending_override",
        occurredAtMs: 1_787_027_200_001,
      },
    });

    expect(target.setDateOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: {
          next: expect.objectContaining({
            revision: 2,
            selection: { kind: "skip" },
          }),
          events: [expect.objectContaining({ type: "override_replaced" })],
        },
      }),
    );
  });

  it("consumes a pending override and leaves terminal facts immutable", async () => {
    const pending = {
      version: 1 as const,
      state: "pending" as const,
      id: "override-1",
      revision: 1,
      localDate: parseLocalDate("2026-08-19"),
      selection: { kind: "rest_day" as const },
    };
    const target = repository({
      readDateOverride: jest.fn(async () => pending),
      consumeDateOverride: jest.fn(
        async (input: ConsumeScheduleDateOverrideRepositoryInput) =>
          mutationResult(input),
      ),
    });

    await consumeScheduleDateOverride({
      ...actionContext(target),
      input: {
        requestId: "override-consume",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        expectedOverrideRevision: 1,
        overrideId: "override-1",
        localDate: "2026-08-19",
        opportunityId: "override-opportunity-1",
        occurredAtMs: 1_787_027_200_000,
      },
    });

    expect(target.consumeDateOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: {
          next: expect.objectContaining({
            state: "consumed",
            opportunityId: "override-opportunity-1",
          }),
          events: [expect.objectContaining({ type: "override_consumed" })],
        },
      }),
    );
  });
});

describe("D-45 through D-48 persisted Weekday commands", () => {
  it("Skip consumes only the dated Weekday opportunity", async () => {
    const target = actionRepository(weekdayActionState);

    await skipOpportunity({
      ...actionContext(target),
      input: commonActionInput,
    });

    expect(target.applyOpportunityAction).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: {
          next: expect.objectContaining({
            source: "weekday",
            localDate: "2026-08-18",
            outcome: "skipped",
          }),
          events: [expect.objectContaining({ type: "weekday_skipped" })],
        },
      }),
    );
  });

  it("marks an earlier due date Planned but not completed", async () => {
    const target = actionRepository({
      ...weekdayActionState,
      localDate: parseLocalDate("2026-08-17"),
      opportunity: {
        ...weekdayActionState.opportunity!,
        localDate: parseLocalDate("2026-08-17"),
      },
    });

    await markWeekdayOpportunityMissed({
      ...actionContext(target),
      input: {
        ...commonActionInput,
        requestId: "weekday-missed",
        observedLocalDate: "2026-08-18",
      },
    });

    expect(target.applyOpportunityAction).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: {
          next: expect.objectContaining({
            outcome: "planned_not_completed",
          }),
          events: [expect.objectContaining({
            type: "weekday_missed",
            label: "Planned but not completed",
          })],
        },
      }),
    );
  });
});

describe("D-49 prospective timezone command", () => {
  it("records the exact owner choice and a complete prospective version", async () => {
    const target = repository({
      readTimeZoneState: jest.fn(async () => ({
        scheduleId: "schedule-1",
        planId: "plan-1",
        scheduleRevision: 4,
        planRevision: 7,
        version: rotationActionState.version,
        state: {
          version: 1 as const,
          revision: 4,
          timeZone: parseStoredTimeZone("Asia/Singapore"),
          lastDeviceTimeZoneDecision: null,
        },
      })),
      changeTimeZone: jest.fn(
        async (input: ChangeScheduleTimeZoneRepositoryInput) =>
          mutationResult(input),
      ),
    });

    await changeScheduleTimeZone({
      ...actionContext(target),
      input: {
        requestId: "timezone-follow",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-18",
        choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
        occurredAtMs: 1_787_027_200_000,
      },
    });

    expect(target.changeTimeZone).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: {
          next: expect.objectContaining({
            timeZone: "America/New_York",
            lastDeviceTimeZoneDecision: expect.objectContaining({
              choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
              effectiveLocalDate: "2026-08-18",
            }),
          }),
          events: [expect.objectContaining({ type: "timezone_followed" })],
        },
        nextVersion: expect.objectContaining({
          effectiveLocalDate: "2026-08-18",
          timeZone: "America/New_York",
          bindings: rotationActionState.version.bindings.map(
            ({ id: _id, ...binding }) => binding,
          ),
        }),
      }),
    );
  });

  it("rejects following a timezone on the current version's effective date", async () => {
    const target = repository({
      readTimeZoneState: jest.fn(async () => ({
        scheduleId: "schedule-1",
        planId: "plan-1",
        scheduleRevision: 4,
        planRevision: 7,
        version: {
          ...rotationActionState.version,
          effectiveLocalDate: "2026-08-18",
        },
        state: {
          version: 1 as const,
          revision: 4,
          timeZone: parseStoredTimeZone("Asia/Singapore"),
          lastDeviceTimeZoneDecision: null,
        },
      })),
    });

    await expect(changeScheduleTimeZone({
      ...actionContext(target),
      input: {
        requestId: "timezone-same-day",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-18",
        choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
        occurredAtMs: 1_787_027_200_000,
      },
    })).rejects.toMatchObject({
      code: "schedule_effective_local_date_invalid",
    });
    expect(target.changeTimeZone).not.toHaveBeenCalled();
  });
});

describe("schedule command validation and replay boundaries", () => {
  it("rejects an invalid SHA-256 implementation", async () => {
    await expect(createScheduleVersionPreviewToken({
      sha256: async () => "not-a-sha256",
      preview: {
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 1,
        expectedPlanRevision: 1,
        before: currentVersion,
        after: nextVersion,
      },
    })).rejects.toMatchObject({ code: "schedule_hash_invalid" });
  });

  it.each([
    {
      name: "invalid identifier",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        requestId: "",
      }),
      code: "schedule_identifier_invalid",
    },
    {
      name: "invalid revision",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        expectedPlanRevision: 0,
      }),
      code: "schedule_revision_invalid",
    },
    {
      name: "invalid save time",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        savedAtMs: -1,
      }),
      code: "schedule_time_invalid",
    },
    {
      name: "invalid LocalDate",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        todayLocalDate: "2026-02-30",
      }),
      code: "schedule_effective_local_date_invalid",
    },
    {
      name: "invalid weekday slot",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        next: {
          ...nextVersion,
          bindings: [{
            ...nextVersion.bindings[0]!,
            weekIndex: -1,
          }],
        },
      }),
      code: "schedule_bindings_invalid",
    },
    {
      name: "duplicate weekday slot",
      mutate: (input: SaveScheduleVersionInput): SaveScheduleVersionInput => ({
        ...input,
        next: {
          ...nextVersion,
          bindings: [
            nextVersion.bindings[0]!,
            {
              ...nextVersion.bindings[0]!,
              ordinal: 1,
              planDayId: "plan-day-b",
            },
          ],
        },
      }),
      code: "schedule_bindings_invalid",
    },
  ])("rejects save input with $name", async ({ mutate, code }) => {
    const target = repository();

    await expect(saveScheduleVersion({
      repository: target,
      invalidate: async () => undefined,
      sha256,
      input: mutate(await validInput()),
    })).rejects.toMatchObject({ code });
    expect(target.saveVersion).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "invalid identifier",
      input: { ...commonActionInput, requestId: "" },
      code: "schedule_identifier_invalid",
    },
    {
      name: "invalid revision",
      input: { ...commonActionInput, expectedScheduleRevision: 0 },
      code: "schedule_revision_invalid",
    },
    {
      name: "invalid occurred time",
      input: { ...commonActionInput, occurredAtMs: -1 },
      code: "schedule_time_invalid",
    },
    {
      name: "invalid instant",
      input: { ...commonActionInput, instantMs: -1 },
      code: "schedule_time_invalid",
    },
  ])("rejects mutation input with $name", async ({ input, code }) => {
    const target = actionRepository(rotationActionState);

    await expect(repeatRotation({
      ...actionContext(target),
      input,
    })).rejects.toMatchObject({ code });
    expect(target.applyOpportunityAction).not.toHaveBeenCalled();
  });

  it("returns an exact replay without re-reading mutable state", async () => {
    const replay: ScheduleMutationResult = {
      outcome: "already_committed",
      operation: "repeat_rotation",
      scheduleId: "schedule-1",
      planId: "plan-1",
      scheduleRevision: 5,
      planRevision: 7,
      localDate: parseLocalDate("2026-08-18"),
      invalidations: [],
    };
    const target = repository({
      readCommandResult: jest.fn(async () => replay),
    });
    const invalidate = jest.fn(async () => undefined);

    await expect(repeatRotation({
      repository: target,
      invalidate,
      sha256,
      input: commonActionInput,
    })).resolves.toEqual(replay);
    expect(target.readActionState).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("rejects replay from a different operation", async () => {
    const target = repository({
      readCommandResult: jest.fn(async () => ({
        outcome: "already_committed" as const,
        operation: "set_date_override" as const,
        scheduleId: "schedule-1",
        planId: "plan-1",
        scheduleRevision: 5,
        planRevision: 7,
        localDate: parseLocalDate("2026-08-18"),
        invalidations: [],
      })),
    });

    await expect(repeatRotation({
      ...actionContext(target),
      input: commonActionInput,
    })).rejects.toMatchObject({ code: "schedule_action_invalid" });
  });

  it("rejects missing or mismatched action state", async () => {
    const target = repository({
      readActionState: jest.fn(async () => null),
    });
    await expect(skipOpportunity({
      ...actionContext(target),
      input: commonActionInput,
    })).rejects.toMatchObject({ code: "schedule_state_unavailable" });

    const mismatch = repository({
      readActionState: jest.fn(async () => ({
        ...rotationActionState,
        planId: "different-plan",
      })),
    });
    await expect(skipOpportunity({
      ...actionContext(mismatch),
      input: commonActionInput,
    })).rejects.toMatchObject({ code: "schedule_state_unavailable" });
  });

  it("rejects Weekday-only actions in Rotation and Rotation-only actions in Weekday", async () => {
    await expect(markWeekdayOpportunityMissed({
      ...actionContext(actionRepository(rotationActionState)),
      input: {
        ...commonActionInput,
        observedLocalDate: "2026-08-19",
      },
    })).rejects.toMatchObject({ code: "schedule_action_invalid" });
    await expect(repeatRotation({
      ...actionContext(actionRepository(weekdayActionState)),
      input: commonActionInput,
    })).rejects.toMatchObject({ code: "schedule_action_invalid" });
    await expect(skipOpportunity({
      ...actionContext(actionRepository({
        ...weekdayActionState,
        opportunity: null,
      })),
      input: commonActionInput,
    })).rejects.toMatchObject({ code: "schedule_action_invalid" });
  });

  it("completes a Weekday opportunity using the session start LocalDate", async () => {
    const target = actionRepository(weekdayActionState);

    await completeScheduledOpportunity({
      ...actionContext(target),
      input: {
        ...commonActionInput,
        sessionId: "session-weekday",
        sessionLocalDate: "2026-08-18",
        planDayId: "plan-day-a",
      },
    });

    expect(target.applyOpportunityAction).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: {
          next: expect.objectContaining({
            source: "weekday",
            outcome: "completed",
            sessionId: "session-weekday",
          }),
          events: [expect.objectContaining({ type: "weekday_completed" })],
        },
      }),
    );
  });

  it.each([
    {
      name: "completion identifier",
      run: () => completeScheduledOpportunity({
        ...actionContext(actionRepository(rotationActionState)),
        input: {
          ...commonActionInput,
          sessionId: "",
          sessionLocalDate: "2026-08-18",
          planDayId: "plan-day-a",
        },
      }),
      code: "schedule_identifier_invalid",
    },
    {
      name: "train-anyway plan day",
      run: () => recordTrainAnyway({
        ...actionContext(actionRepository(rotationActionState)),
        input: {
          ...commonActionInput,
          workout: { kind: "plan_day" as const, planDayId: "" },
          advanceRotation: false,
        },
      }),
      code: "schedule_identifier_invalid",
    },
    {
      name: "override input",
      run: () => setDateOverride({
        ...actionContext(repository()),
        input: {
          requestId: "override-invalid",
          scheduleId: "schedule-1",
          planId: "plan-1",
          expectedScheduleRevision: 4,
          expectedPlanRevision: 7,
          expectedOverrideRevision: -1,
          overrideId: "override-1",
          localDate: "2026-08-19",
          replacement: { kind: "skip" as const },
          occurredAtMs: 100,
        },
      }),
      code: "schedule_action_invalid",
    },
    {
      name: "consume input",
      run: () => consumeScheduleDateOverride({
        ...actionContext(repository()),
        input: {
          requestId: "override-consume-invalid",
          scheduleId: "schedule-1",
          planId: "plan-1",
          expectedScheduleRevision: 4,
          expectedPlanRevision: 7,
          expectedOverrideRevision: 0,
          overrideId: "override-1",
          localDate: "2026-08-19",
          opportunityId: "opportunity-1",
          occurredAtMs: 100,
        },
      }),
      code: "schedule_action_invalid",
    },
  ])("rejects invalid $name", async ({ run, code }) => {
    await expect(Promise.resolve().then(run)).rejects.toMatchObject({ code });
  });

  it("replays override and timezone commands before reading mutable state", async () => {
    const replay: ScheduleMutationResult = {
      outcome: "already_committed",
      operation: "set_date_override",
      scheduleId: "schedule-1",
      planId: "plan-1",
      scheduleRevision: 5,
      planRevision: 7,
      localDate: parseLocalDate("2026-08-19"),
      invalidations: [],
    };
    const overrideTarget = repository({
      readCommandResult: jest.fn(async () => replay),
    });
    await expect(setDateOverride({
      ...actionContext(overrideTarget),
      input: {
        requestId: "override-replay",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        expectedOverrideRevision: 0,
        overrideId: "override-1",
        localDate: "2026-08-19",
        replacement: { kind: "skip" },
        occurredAtMs: 100,
      },
    })).resolves.toEqual(replay);
    expect(overrideTarget.readDateOverride).not.toHaveBeenCalled();

    const consumeReplay = { ...replay, operation: "consume_date_override" as const };
    const consumeTarget = repository({
      readCommandResult: jest.fn(async () => consumeReplay),
    });
    await expect(consumeScheduleDateOverride({
      ...actionContext(consumeTarget),
      input: {
        requestId: "consume-replay",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        expectedOverrideRevision: 1,
        overrideId: "override-1",
        localDate: "2026-08-19",
        opportunityId: "opportunity-1",
        occurredAtMs: 100,
      },
    })).resolves.toEqual(consumeReplay);
    expect(consumeTarget.readDateOverride).not.toHaveBeenCalled();

    const timezoneReplay = {
      ...replay,
      operation: "change_timezone" as const,
      localDate: parseLocalDate("2026-08-20"),
    };
    const timezoneTarget = repository({
      readCommandResult: jest.fn(async () => timezoneReplay),
    });
    await expect(changeScheduleTimeZone({
      ...actionContext(timezoneTarget),
      input: {
        requestId: "timezone-replay",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-20",
        choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
        occurredAtMs: 100,
      },
    })).resolves.toEqual(timezoneReplay);
    expect(timezoneTarget.readTimeZoneState).not.toHaveBeenCalled();
  });

  it("rejects consuming a missing override", async () => {
    await expect(consumeScheduleDateOverride({
      ...actionContext(repository()),
      input: {
        requestId: "consume-missing",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        expectedOverrideRevision: 1,
        overrideId: "override-1",
        localDate: "2026-08-19",
        opportunityId: "opportunity-1",
        occurredAtMs: 100,
      },
    })).rejects.toMatchObject({ code: "schedule_state_unavailable" });
  });

  it("keeps the current timezone without appending a version", async () => {
    const target = repository({
      readTimeZoneState: jest.fn(async () => ({
        scheduleId: "schedule-1",
        planId: "plan-1",
        scheduleRevision: 4,
        planRevision: 7,
        version: rotationActionState.version,
        state: {
          version: 1 as const,
          revision: 4,
          timeZone: parseStoredTimeZone("Asia/Singapore"),
          lastDeviceTimeZoneDecision: null,
        },
      })),
      changeTimeZone: jest.fn(
        async (input: ChangeScheduleTimeZoneRepositoryInput) =>
          mutationResult(input),
      ),
    });

    await changeScheduleTimeZone({
      ...actionContext(target),
      input: {
        requestId: "timezone-keep",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-18",
        choice: KEEP_CURRENT_TIMEZONE_LABEL,
        occurredAtMs: 100,
      },
    });

    expect(target.changeTimeZone).toHaveBeenCalledWith(
      expect.objectContaining({
        nextVersion: null,
        versionId: null,
        bindingIds: [],
        transition: expect.objectContaining({
          events: [expect.objectContaining({ type: "timezone_kept" })],
        }),
      }),
    );
  });

  it("clones complete Weekday bindings into a prospective timezone version", async () => {
    const target = repository({
      readTimeZoneState: jest.fn(async () => ({
        scheduleId: "schedule-1",
        planId: "plan-1",
        scheduleRevision: 4,
        planRevision: 7,
        version: weekdayActionState.version,
        state: {
          version: 1 as const,
          revision: 4,
          timeZone: parseStoredTimeZone("Asia/Singapore"),
          lastDeviceTimeZoneDecision: null,
        },
      })),
      changeTimeZone: jest.fn(
        async (input: ChangeScheduleTimeZoneRepositoryInput) =>
          mutationResult(input),
      ),
    });

    await changeScheduleTimeZone({
      ...actionContext(target),
      input: {
        requestId: "timezone-weekday",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-18",
        choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
        occurredAtMs: 100,
      },
    });

    expect(target.changeTimeZone).toHaveBeenCalledWith(
      expect.objectContaining({
        nextVersion: {
          effectiveLocalDate: "2026-08-18",
          mode: "weekday",
          timeZone: "America/New_York",
          bindings: [{
            ordinal: 0,
            weekIndex: 0,
            weekday: "Tuesday",
            planDayId: "plan-day-a",
          }],
        },
      }),
    );
  });

  it("rejects a missing timezone state", async () => {
    await expect(changeScheduleTimeZone({
      ...actionContext(repository()),
      input: {
        requestId: "timezone-missing",
        scheduleId: "schedule-1",
        planId: "plan-1",
        expectedScheduleRevision: 4,
        expectedPlanRevision: 7,
        detectedDeviceTimeZone: "America/New_York",
        effectiveLocalDate: "2026-08-20",
        choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
        occurredAtMs: 100,
      },
    })).rejects.toMatchObject({ code: "schedule_state_unavailable" });
  });
});
