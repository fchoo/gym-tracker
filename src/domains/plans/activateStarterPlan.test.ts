import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACCEPTED_STARTER_ACCEPTANCE_SHA256,
  ACCEPTED_STARTER_ASSET_SHA256,
  AcceptedStarterPlanActivationError,
  activateStarterPlan,
  createStarterPlanCopy,
  createStarterPlanActivationConfirmationToken,
  parseAcceptedStarterPlanPack,
  type AcceptedStarterPlanActivation,
  type AcceptedStarterPlanCopy,
  type AcceptedStarterPlanRepository,
} from "./activateStarterPlan";

const repositoryRoot = join(__dirname, "../../..");
const starterPackBytes = readFileSync(
  join(repositoryRoot, "assets/content/starter-plans.v2.json"),
  "utf8",
);
const acceptanceBytes = readFileSync(
  join(
    repositoryRoot,
    "artifacts/review/phase2/starter-plans-acceptance.json",
  ),
  "utf8",
);

const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

type MutableOccurrence = {
  id: string;
  ordinal: number;
  metricIdentity: Record<string, unknown>;
  catalogMetricIdentity: Record<string, unknown>;
  target: Record<string, unknown>;
  warmups: unknown;
  policy: Record<string, unknown>;
  metricOverride: Record<string, unknown> | null;
  substitutionDecision: Record<string, unknown>;
};

type MutableDay = {
  id: string;
  ordinal: number;
  displayName: string;
  exercises: MutableOccurrence[];
};

type MutableTemplate = {
  id: string;
  displayName: string;
  days: MutableDay[];
  scheduleSuggestion: Record<string, unknown>;
  sourceNotes: Array<Record<string, unknown>>;
};

type MutablePack = {
  schemaVersion: number;
  metadata: {
    counts: Record<string, number>;
  };
  templates: MutableTemplate[];
};

type MutableAcceptance = {
  reviewedAt: string;
  counts: Record<string, number>;
};

function mutablePack(): MutablePack {
  return JSON.parse(starterPackBytes) as MutablePack;
}

function mutableAcceptance(): MutableAcceptance {
  return JSON.parse(acceptanceBytes) as MutableAcceptance;
}

async function expectHashValidSemanticRejection(
  mutate: (input: Readonly<{
    pack: MutablePack;
    acceptance: MutableAcceptance;
  }>) => void,
): Promise<void> {
  const pack = mutablePack();
  const acceptance = mutableAcceptance();
  mutate({ pack, acceptance });
  const mutatedPackBytes = JSON.stringify(pack);
  const mutatedAcceptanceBytes = JSON.stringify(acceptance);
  const error = await activationError(() =>
    parseAcceptedStarterPlanPack({
      starterPackBytes: mutatedPackBytes,
      acceptanceBytes: mutatedAcceptanceBytes,
      sha256: async (value) => (
        value === mutatedPackBytes
          ? ACCEPTED_STARTER_ASSET_SHA256
          : ACCEPTED_STARTER_ACCEPTANCE_SHA256
      ),
    })
  );
  expect(error.code).toBe("starter_pack_invalid");
}

function committedActivation(): AcceptedStarterPlanActivation {
  return {
    outcome: "committed",
    plan: {
      id: "owned-plan-1",
      name: "Full Body Foundation",
      sourceTemplateId: "full-body-foundation",
      sourceRevision: 2,
      isActive: true,
      revision: 1,
    },
    days: [
      {
        id: "owned-day-a",
        sourceDayId: "full-body-a",
        name: "Full Body A",
        ordinal: 0,
        occurrenceCount: 5,
      },
      {
        id: "owned-day-b",
        sourceDayId: "full-body-b",
        name: "Full Body B",
        ordinal: 1,
        occurrenceCount: 5,
      },
    ],
    schedule: {
      id: "owned-schedule-1",
      lifecycle: "active",
      revision: 1,
      version: {
        id: "owned-schedule-version-1",
        versionNumber: 1,
        effectiveLocalDate: "2026-08-24",
        mode: "weekday",
        timeZone: "Asia/Singapore",
        bindings: [
          {
            planDayId: "owned-day-a",
            sourcePlanDayId: "full-body-a",
            ordinal: 0,
            weekIndex: 0,
            weekday: "Monday",
          },
          {
            planDayId: "owned-day-b",
            sourcePlanDayId: "full-body-b",
            ordinal: 1,
            weekIndex: 0,
            weekday: "Wednesday",
          },
        ],
      },
    },
    invalidationScopes: [
      { scope: "library-plans" },
      { scope: "today" },
    ],
  };
}

function committedCopy(): AcceptedStarterPlanCopy {
  const activation = committedActivation();
  return {
    outcome: "committed",
    sourceOwnedPlanId: "legacy-plan",
    plan: {
      ...activation.plan,
      isActive: false,
    },
    days: activation.days,
    schedule: {
      ...activation.schedule,
      lifecycle: "inactive",
    },
    invalidationScopes: [
      { scope: "library-plans" },
      { scope: "plan-detail", planId: activation.plan.id },
    ],
  };
}

function repository(): AcceptedStarterPlanRepository & Readonly<{
  activateAcceptedStarterPlan: jest.Mock;
  createAcceptedStarterPlanCopy: jest.Mock;
}> {
  return {
    activateAcceptedStarterPlan: jest.fn(async () => committedActivation()),
    createAcceptedStarterPlanCopy: jest.fn(async () => committedCopy()),
  };
}

function activationInput(
  acceptedRepository: AcceptedStarterPlanRepository,
  overrides: Record<string, unknown> = {},
) {
  const preview = {
    assetSha256: ACCEPTED_STARTER_ASSET_SHA256,
    templateId: "full-body-foundation",
    templateRevision: 2,
    startLocalDate: "2026-08-24",
    timeZone: "Asia/Singapore",
    mode: "weekday" as const,
    bindings: [
      {
        planDaySourceId: "full-body-a",
        ordinal: 0,
        weekIndex: 0,
        weekday: "Monday" as const,
      },
      {
        planDaySourceId: "full-body-b",
        ordinal: 1,
        weekIndex: 0,
        weekday: "Wednesday" as const,
      },
    ],
    copyChoice: null,
  };
  return {
    kind: "accepted" as const,
    starterPackBytes,
    acceptanceBytes,
    sha256,
    repository: acceptedRepository,
    requestId: "activation-request-1",
    activatedAtMs: 1_787_027_200_000,
    expectedActiveScheduleRevision: null,
    confirmationToken:
      createStarterPlanActivationConfirmationToken(preview),
    ...preview,
    ...overrides,
  };
}

function copyInput(
  acceptedRepository: AcceptedStarterPlanRepository,
  overrides: Record<string, unknown> = {},
) {
  const activation = activationInput(acceptedRepository);
  return {
    starterPackBytes,
    acceptanceBytes,
    sha256,
    repository: acceptedRepository,
    requestId: "copy-request-1",
    createdAtMs: activation.activatedAtMs,
    sourceOwnedPlanId: "legacy-plan",
    expectedSourcePlanRevision: 1,
    expectedActiveScheduleRevision: null,
    templateId: activation.templateId,
    templateRevision: activation.templateRevision,
    startLocalDate: activation.startLocalDate,
    timeZone: activation.timeZone,
    mode: activation.mode,
    bindings: activation.bindings,
    ...overrides,
  };
}

function activationError(
  action: () => Promise<unknown>,
): Promise<AcceptedStarterPlanActivationError> {
  return action().then(
    () => {
      throw new Error("expected_accepted_starter_activation_error");
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(AcceptedStarterPlanActivationError);
      return error as AcceptedStarterPlanActivationError;
    },
  );
}

describe("accepted starter activation boundary", () => {
  it("parses only the exact owner-accepted six-template bytes", async () => {
    const accepted = await parseAcceptedStarterPlanPack({
      starterPackBytes,
      acceptanceBytes,
      sha256,
    });

    expect(await sha256(starterPackBytes)).toBe(
      ACCEPTED_STARTER_ASSET_SHA256,
    );
    expect(await sha256(acceptanceBytes)).toBe(
      ACCEPTED_STARTER_ACCEPTANCE_SHA256,
    );
    expect(accepted.templates).toHaveLength(6);
    expect(accepted.templates.map(({ id }) => id)).toEqual([
      "full-body-foundation",
      "upper-lower",
      "push-pull-legs",
      "minimal-equipment-full-body",
      "strength-conditioning",
      "gym-body-part-split",
    ]);
    expect(accepted.templates.flatMap(({ days }) => days)).toHaveLength(20);
    expect(
      accepted.templates.flatMap(({ days }) =>
        days.flatMap(({ exercises }) => exercises)
      ),
    ).toHaveLength(69);
  });

  it("creates an inactive independent copy without an activation confirmation token", async () => {
    const acceptedRepository = repository();
    const result = await createStarterPlanCopy(copyInput(acceptedRepository));

    expect(result.plan.isActive).toBe(false);
    expect(result.schedule.lifecycle).toBe("inactive");
    expect(acceptedRepository.createAcceptedStarterPlanCopy)
      .toHaveBeenCalledWith(expect.objectContaining({
        sourceOwnedPlanId: "legacy-plan",
        expectedSourcePlanRevision: 1,
        template: expect.objectContaining({ id: "full-body-foundation" }),
      }));
    expect(acceptedRepository.activateAcceptedStarterPlan)
      .not.toHaveBeenCalled();
  });

  it.each([
    { requestId: "" },
    { sourceOwnedPlanId: "" },
    { createdAtMs: 1.5 },
    { createdAtMs: -1 },
    { expectedSourcePlanRevision: 1.5 },
    { expectedSourcePlanRevision: 0 },
    { expectedActiveScheduleRevision: 1.5 },
    { expectedActiveScheduleRevision: 0 },
  ])("rejects invalid inactive-copy command input %#", async (overrides) => {
    const acceptedRepository = repository();
    const error = await activationError(() =>
      createStarterPlanCopy(copyInput(acceptedRepository, overrides))
    );

    expect(error.code).toBe("starter_activation_input_invalid");
    expect(acceptedRepository.createAcceptedStarterPlanCopy)
      .not.toHaveBeenCalled();
  });

  it("rejects inactive-copy template, revision, binding, and digest mismatches", async () => {
    const acceptedRepository = repository();
    const missingTemplate = await activationError(() =>
      createStarterPlanCopy(copyInput(acceptedRepository, {
        templateId: "missing-template",
      }))
    );
    expect(missingTemplate.code).toBe("starter_template_not_found");

    const staleRevision = await activationError(() =>
      createStarterPlanCopy(copyInput(acceptedRepository, {
        templateRevision: 1,
      }))
    );
    expect(staleRevision.code).toBe("starter_revision_mismatch");

    const unknownBinding = await activationError(() =>
      createStarterPlanCopy(copyInput(acceptedRepository, {
        bindings: [{
          planDaySourceId: "unknown-day",
          ordinal: 0,
          weekIndex: 0,
          weekday: "Monday",
        }],
      }))
    );
    expect(unknownBinding.code).toBe("starter_activation_input_invalid");

    let digestCall = 0;
    const invalidDigest = await activationError(() =>
      createStarterPlanCopy(copyInput(acceptedRepository, {
        sha256: async () => {
          digestCall += 1;
          if (digestCall === 1) {
            return ACCEPTED_STARTER_ASSET_SHA256;
          }
          if (digestCall === 2) {
            return ACCEPTED_STARTER_ACCEPTANCE_SHA256;
          }
          return "invalid";
        },
      }))
    );
    expect(invalidDigest.code).toBe("starter_activation_input_invalid");
    expect(acceptedRepository.createAcceptedStarterPlanCopy)
      .not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "mutated starter asset",
      starterBytes: starterPackBytes.replace(
        "Full Body Foundation",
        "Changed Body Foundation",
      ),
      acceptedBytes: acceptanceBytes,
      code: "starter_asset_hash_mismatch",
    },
    {
      name: "mutated owner acceptance",
      starterBytes: starterPackBytes,
      acceptedBytes: acceptanceBytes.replace(
        "\"reviewerResponse\": \"approved\"",
        "\"reviewerResponse\": \"rejected\"",
      ),
      code: "starter_acceptance_hash_mismatch",
    },
  ])("rejects $name before repository work", async ({
    starterBytes,
    acceptedBytes,
    code,
  }) => {
    const error = await activationError(() =>
      parseAcceptedStarterPlanPack({
        starterPackBytes: starterBytes,
        acceptanceBytes: acceptedBytes,
        sha256,
      })
    );
    expect(error.code).toBe(code);
  });

  it("rejects hash-valid semantic corruption at every accepted graph layer", async () => {
    const corruptions: readonly Readonly<{
      name: string;
      mutate(input: Readonly<{
        pack: MutablePack;
        acceptance: MutableAcceptance;
      }>): void;
    }>[] = [
      {
        name: "malformed metric identity",
        mutate: ({ pack }) => {
          pack.templates[0]!.days[0]!.exercises[0]!.metricIdentity = {
            profile: "unknown",
            contractVersion: 1,
            exerciseMetricGeneration: 1,
          };
        },
      },
      {
        name: "missing planned set count",
        mutate: ({ pack }) => {
          delete pack.templates[0]!.days[0]!.exercises[0]!.target
            .plannedSets;
        },
      },
      {
        name: "invalid target contract",
        mutate: ({ pack }) => {
          pack.templates[0]!.days[0]!.exercises[0]!.target.minReps = 0;
        },
      },
      {
        name: "non-array warmups",
        mutate: ({ pack }) => {
          pack.templates[0]!.days[0]!.exercises[0]!.warmups = null;
        },
      },
      {
        name: "invalid warmup",
        mutate: ({ pack }) => {
          pack.templates[0]!.days[0]!.exercises[0]!.warmups = [{
            ordinal: 2,
            loadGrams: 20_000,
            reps: 8,
          }];
        },
      },
      {
        name: "invalid policy",
        mutate: ({ pack }) => {
          pack.templates[0]!.days[0]!.exercises[0]!.policy.id = "bad id";
        },
      },
      {
        name: "undeclared occurrence override",
        mutate: ({ pack }) => {
          pack.templates[0]!.days[0]!.exercises[0]!
            .catalogMetricIdentity.profile = "timed_hold";
        },
      },
      {
        name: "invalid override metadata",
        mutate: ({ pack }) => {
          const occurrence = pack.templates
            .flatMap(({ days }) => days)
            .flatMap(({ exercises }) => exercises)
            .find(({ metricOverride }) => metricOverride !== null)!;
          occurrence.metricOverride!.rationale = "";
        },
      },
      {
        name: "mismatched override identity",
        mutate: ({ pack }) => {
          const occurrence = pack.templates
            .flatMap(({ days }) => days)
            .flatMap(({ exercises }) => exercises)
            .find(({ metricOverride }) => metricOverride !== null)!;
          (
            occurrence.metricOverride!.fromCatalog as Record<string, unknown>
          ).profile = "timed_hold";
        },
      },
      {
        name: "invalid occurrence",
        mutate: ({ pack }) => {
          pack.templates[0]!.days[0]!.exercises[0]!.id = "bad id";
        },
      },
      {
        name: "empty day graph",
        mutate: ({ pack }) => {
          pack.templates[0]!.days = [];
        },
      },
      {
        name: "invalid day",
        mutate: ({ pack }) => {
          pack.templates[0]!.days[0]!.displayName = "";
        },
      },
      {
        name: "non-object schedule suggestion",
        mutate: ({ pack }) => {
          pack.templates[0]!.scheduleSuggestion = null as never;
        },
      },
      {
        name: "invalid Rotation suggestion",
        mutate: ({ pack }) => {
          pack.templates[2]!.scheduleSuggestion.rotation = [];
        },
      },
      {
        name: "unknown schedule mode",
        mutate: ({ pack }) => {
          pack.templates[0]!.scheduleSuggestion.mode = "calendar";
        },
      },
      {
        name: "empty Weekday week",
        mutate: ({ pack }) => {
          pack.templates[0]!.scheduleSuggestion.cycleWeeks = [[]];
        },
      },
      {
        name: "invalid Weekday binding",
        mutate: ({ pack }) => {
          const weeks = pack.templates[0]!.scheduleSuggestion
            .cycleWeeks as Array<Array<Record<string, unknown>>>;
          weeks[0]![0]!.dayId = "missing-day";
        },
      },
      {
        name: "empty source notes",
        mutate: ({ pack }) => {
          pack.templates[0]!.sourceNotes = [];
        },
      },
      {
        name: "invalid source note",
        mutate: ({ pack }) => {
          pack.templates[0]!.sourceNotes[0]!.id = "bad id";
        },
      },
      {
        name: "invalid template",
        mutate: ({ pack }) => {
          pack.templates[0]!.displayName = "";
        },
      },
      {
        name: "invalid pack envelope",
        mutate: ({ pack }) => {
          pack.schemaVersion = 3;
        },
      },
      {
        name: "invalid acceptance time",
        mutate: ({ acceptance }) => {
          acceptance.reviewedAt = "not-a-date";
        },
      },
      {
        name: "count mismatch",
        mutate: ({ pack }) => {
          pack.metadata.counts.exercises = 68;
        },
      },
      {
        name: "D-55 day drift",
        mutate: ({ pack }) => {
          pack.templates[5]!.days[0]!.displayName = "Push";
        },
      },
    ];

    for (const corruption of corruptions) {
      await expectHashValidSemanticRejection(corruption.mutate);
    }
  });

  it("rejects malformed hash-valid JSON at the parser boundary", async () => {
    const error = await activationError(() =>
      parseAcceptedStarterPlanPack({
        starterPackBytes: "{",
        acceptanceBytes,
        sha256: async (value) => (
          value === "{"
            ? ACCEPTED_STARTER_ASSET_SHA256
            : ACCEPTED_STARTER_ACCEPTANCE_SHA256
        ),
      })
    );
    expect(error.code).toBe("starter_pack_invalid");
  });

  it("binds confirmation to editable schedule and explicit copy choice", () => {
    const base = {
      assetSha256: ACCEPTED_STARTER_ASSET_SHA256,
      templateId: "full-body-foundation",
      templateRevision: 2,
      startLocalDate: "2026-08-24",
      timeZone: "Asia/Singapore",
      mode: "rotation" as const,
      bindings: [
        { planDaySourceId: "full-body-a", ordinal: 0 },
        { planDaySourceId: "full-body-b", ordinal: 1 },
      ],
      copyChoice: null,
    };
    expect(createStarterPlanActivationConfirmationToken(base)).not.toBe(
      createStarterPlanActivationConfirmationToken({
        ...base,
        startLocalDate: "2026-08-25",
      }),
    );
    expect(createStarterPlanActivationConfirmationToken(base)).not.toBe(
      createStarterPlanActivationConfirmationToken({
        ...base,
        copyChoice: { type: "create_another" },
      }),
    );
    expect(createStarterPlanActivationConfirmationToken(base)).not.toBe(
      createStarterPlanActivationConfirmationToken({
        ...base,
        copyChoice: {
          type: "reactivate_existing",
          planId: "owned-plan-1",
          expectedPlanRevision: 2,
          expectedScheduleRevision: 2,
        },
      }),
    );
  });

  it("passes a complete confirmed command to the repository", async () => {
    const acceptedRepository = repository();
    const result = await activateStarterPlan(
      activationInput(acceptedRepository),
    );

    expect(result).toEqual(committedActivation());
    expect(acceptedRepository.activateAcceptedStarterPlan).toHaveBeenCalledTimes(
      1,
    );
    expect(acceptedRepository.activateAcceptedStarterPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        assetSha256: ACCEPTED_STARTER_ASSET_SHA256,
        template: expect.objectContaining({
          id: "full-body-foundation",
          revision: 2,
        }),
        requestId: "activation-request-1",
        requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        expectedActiveScheduleRevision: null,
        copyChoice: null,
        schedule: expect.objectContaining({
          mode: "weekday",
          startLocalDate: "2026-08-24",
          timeZone: "Asia/Singapore",
        }),
      }),
    );
  });

  it.each([
    {
      name: "missing confirmation",
      overrides: { confirmationToken: "" },
      code: "starter_confirmation_invalid",
    },
    {
      name: "stale confirmation after date edit",
      overrides: { startLocalDate: "2026-08-25" },
      code: "starter_confirmation_invalid",
    },
    {
      name: "wrong accepted template revision",
      overrides: { templateRevision: 1 },
      code: "starter_revision_mismatch",
    },
    {
      name: "unknown accepted template",
      overrides: { templateId: "missing-template" },
      code: "starter_template_not_found",
    },
    {
      name: "unsafe activation timestamp",
      overrides: { activatedAtMs: Number.MAX_SAFE_INTEGER + 1 },
      code: "starter_activation_input_invalid",
    },
    {
      name: "empty request identity",
      overrides: { requestId: "" },
      code: "starter_activation_input_invalid",
    },
    {
      name: "invalid expected revision",
      overrides: { expectedActiveScheduleRevision: 0 },
      code: "starter_activation_input_invalid",
    },
    {
      name: "binding to a day outside the accepted template",
      overrides: {
        bindings: [
          {
            planDaySourceId: "missing-day",
            ordinal: 0,
            weekIndex: 0,
            weekday: "Monday",
          },
        ],
      },
      code: "starter_activation_input_invalid",
    },
  ])("rejects $name before repository work", async ({ overrides, code }) => {
    const acceptedRepository = repository();
    const error = await activationError(() =>
      activateStarterPlan(activationInput(acceptedRepository, overrides))
    );
    expect(error.code).toBe(code);
    expect(acceptedRepository.activateAcceptedStarterPlan).not.toHaveBeenCalled();
  });

  it("rejects a digest port that returns a non-SHA request identity", async () => {
    const acceptedRepository = repository();
    const input = activationInput(acceptedRepository);
    let digestCall = 0;
    const error = await activationError(() =>
      activateStarterPlan({
        ...input,
        sha256: async () => {
          digestCall += 1;
          if (digestCall === 1) {
            return ACCEPTED_STARTER_ASSET_SHA256;
          }
          if (digestCall === 2) {
            return ACCEPTED_STARTER_ACCEPTANCE_SHA256;
          }
          return "invalid";
        },
      })
    );
    expect(error.code).toBe("starter_activation_input_invalid");
    expect(acceptedRepository.activateAcceptedStarterPlan).not.toHaveBeenCalled();
  });
});
