import starterPlansAsset from "../../../assets/content/starter-plans.v2.json";
import starterPlansAcceptanceAsset from "../../../artifacts/review/phase2/starter-plans-acceptance.json";
import {
  activateStarterPlan,
  createStarterPlanActivationConfirmationToken,
  parseAcceptedStarterPlanPack,
  type AcceptedStarterPack,
  type AcceptedStarterTemplate,
  type StarterPlanCopyChoice,
} from "../../domains/plans/activateStarterPlan";
import type {
  InitialScheduleActivationInput,
} from "../../domains/scheduling/activation";
import {
  createMigrationRunner,
} from "../../platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../platform/sqlite/migrations";
import type {
  RecoveryBackupPort,
} from "../../platform/sqlite/recoveryBackup";
import {
  createContentRepository,
} from "../../platform/sqlite/repositories/contentRepository";
import {
  openExerciseSearchFtsContractRuntime,
} from "../../platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createStarterPlanRepository,
} from "../../platform/sqlite/repositories/starterPlanRepository";
import type {
  SqliteKernel,
} from "../../platform/sqlite/sqliteKernel";
import {
  parseAcceptedPhase2Catalog,
  type Phase2ContractCaseMetadata,
} from "./phase2Content.contract";

export const PHASE2_STARTER_CONTRACT_VERSION = 1 as const;

export const PHASE2_STARTER_CASE_IDS = [
  "starter-accepted-six",
  "starter-full-clone",
  "starter-d55-clone",
  "starter-existing-copy-choice",
] as const;

export type Phase2StarterContractCaseId =
  (typeof PHASE2_STARTER_CASE_IDS)[number];

export const PHASE2_STARTER_CASE_METADATA = [
  {
    id: "starter-accepted-six",
    requirement: "LIB-06",
    category: "starter-content",
    edgeIds: [
      "E-34",
      "E-35",
      "E-36",
      "E-37",
      "E-38",
      "E-39",
      "E-40",
      "E-41",
    ],
    sourceTest: "src/domains/plans/activateStarterPlan.test.ts#parses only the exact owner-accepted six-template bytes",
  },
  {
    id: "starter-full-clone",
    requirement: "LIB-07",
    category: "starter-activation",
    edgeIds: ["E-42", "E-43"],
    sourceTest: "tests/integration/starter-activation-repository.test.ts#clones complete accepted graphs for all six templates",
  },
  {
    id: "starter-d55-clone",
    requirement: "LIB-06",
    category: "starter-d55",
    edgeIds: ["E-44"],
    sourceTest: "tests/integration/starter-activation-repository.test.ts#proves D-55 clones five ordered weekday days and 20 weighted occurrences",
  },
  {
    id: "starter-existing-copy-choice",
    requirement: "LIB-07",
    category: "starter-copy-choice",
    edgeIds: ["E-45", "E-46"],
    sourceTest: "tests/integration/starter-activation-repository.test.ts#requires an explicit copy choice and reactivates the selected copy",
  },
] as const satisfies readonly Phase2ContractCaseMetadata<
  Phase2StarterContractCaseId
>[];

export type Phase2StarterContractRuntime = Readonly<{
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

export interface Phase2StarterContractAdapter {
  createRuntime(
    caseId: Phase2StarterContractCaseId,
  ): Promise<Phase2StarterContractRuntime>;
  sha256(value: string): Promise<string>;
}

export type Phase2StarterContractCaseResult = Readonly<{
  id: Phase2StarterContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type Phase2StarterContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PHASE2_STARTER_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Phase2StarterContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type ContractCase = (
  runtime: Phase2StarterContractRuntime,
  adapter: Phase2StarterContractAdapter,
) => Promise<void>;

function invariant(value: unknown, code: string): asserts value {
  if (!value) {
    throw new Error(code);
  }
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "phase2_starter_contract_failed";
}

function prettyBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const recoveryBackup: RecoveryBackupPort = {
  async createAndValidate(request) {
    return {
      backupId: `phase2-starter-${request.fromVersion}-${request.toVersion}`,
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    };
  },
};

async function prepareRuntime(
  kernel: SqliteKernel,
  adapter: Phase2StarterContractAdapter,
): Promise<AcceptedStarterPack> {
  await createMigrationRunner({
    databaseName: "phase2-starter.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  const catalog = await parseAcceptedPhase2Catalog(adapter.sha256);
  await createContentRepository(kernel).importAcceptedCatalog({
    catalog,
    expectedInstalled: null,
  });
  return parseAcceptedStarterPlanPack({
    starterPackBytes: prettyBytes(starterPlansAsset),
    acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
    sha256: adapter.sha256,
  });
}

function scheduleForTemplate(
  template: AcceptedStarterTemplate,
): InitialScheduleActivationInput {
  if (template.scheduleSuggestion.mode === "rotation") {
    return {
      startLocalDate: "2026-08-24",
      timeZone: "Asia/Singapore",
      mode: "rotation",
      bindings: template.scheduleSuggestion.rotation.map(
        (planDaySourceId, ordinal) => ({
          planDaySourceId,
          ordinal,
        }),
      ),
    };
  }
  const suggestion = template.scheduleSuggestion;
  return {
    startLocalDate: "2026-08-24",
    timeZone: "Asia/Singapore",
    mode: "weekday",
    bindings: suggestion.cycleWeeks.flatMap(
      (week, weekIndex) => week.map((binding, ordinal) => ({
        planDaySourceId: binding.dayId,
        ordinal: suggestion.cycleWeeks
          .slice(0, weekIndex)
          .reduce((count, value) => count + value.length, 0) + ordinal,
        weekIndex,
        weekday: binding.weekday,
      })),
    ),
  };
}

async function activate(
  kernel: SqliteKernel,
  adapter: Phase2StarterContractAdapter,
  pack: AcceptedStarterPack,
  input: Readonly<{
    templateId: string;
    requestId: string;
    activatedAtMs: number;
    expectedActiveScheduleRevision: number | null;
    copyChoice?: StarterPlanCopyChoice | null;
    startLocalDate?: string;
  }>,
) {
  const template = pack.templates.find(({ id }) => id === input.templateId);
  invariant(template !== undefined, "phase2_starter_template_missing");
  const baseSchedule = scheduleForTemplate(template);
  const schedule = {
    ...baseSchedule,
    startLocalDate: input.startLocalDate ?? baseSchedule.startLocalDate,
  } as InitialScheduleActivationInput;
  const copyChoice = input.copyChoice ?? null;
  const confirmationToken = createStarterPlanActivationConfirmationToken({
    assetSha256: pack.assetSha256,
    templateId: template.id,
    templateRevision: template.revision,
    ...schedule,
    bindings: schedule.bindings as never,
    copyChoice,
  });
  return activateStarterPlan({
    kind: "accepted",
    starterPackBytes: prettyBytes(starterPlansAsset),
    acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
    sha256: adapter.sha256,
    repository: createStarterPlanRepository(kernel),
    requestId: input.requestId,
    activatedAtMs: input.activatedAtMs,
    expectedActiveScheduleRevision: input.expectedActiveScheduleRevision,
    confirmationToken,
    templateId: template.id,
    templateRevision: template.revision,
    ...schedule,
    bindings: schedule.bindings as never,
    copyChoice,
  });
}

const contractCases: Record<Phase2StarterContractCaseId, ContractCase> = {
  async "starter-accepted-six"({ kernel }, adapter) {
    const pack = await prepareRuntime(kernel, adapter);
    const profiles = new Set(pack.templates.flatMap(({ days }) =>
      days.flatMap(({ exercises }) =>
        exercises.map(({ metricIdentity }) => metricIdentity.profile)
      )
    ));
    invariant(
      pack.templates.length === 6
      && pack.templates.map(({ id }) => id).join(",")
        === [
          "full-body-foundation",
          "upper-lower",
          "push-pull-legs",
          "minimal-equipment-full-body",
          "strength-conditioning",
          "gym-body-part-split",
        ].join(",")
      && pack.templates.flatMap(({ days }) => days).length === 20
      && pack.templates.flatMap(({ days }) =>
        days.flatMap(({ exercises }) => exercises)
      ).length === 69
      && profiles.size === 9,
      "phase2_starter_accepted_six_invalid",
    );
  },

  async "starter-full-clone"({ kernel }, adapter) {
    const pack = await prepareRuntime(kernel, adapter);
    const result = await activate(kernel, adapter, pack, {
      templateId: "full-body-foundation",
      requestId: "phase2-starter-full-clone",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const [counts] = await kernel.queryAll<{
      days: number;
      occurrences: number;
      targets: number;
      policies: number;
      source_maps: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM plan_days
         WHERE plan_id = ?) AS days,
        (SELECT COUNT(*) FROM owned_plan_day_exercises occurrence
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         WHERE day.plan_id = ?) AS occurrences,
        (SELECT COUNT(*) FROM owned_plan_working_set_targets target
         JOIN owned_plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         WHERE day.plan_id = ?) AS targets,
        (SELECT COUNT(*) FROM owned_plan_progression_policies policy
         JOIN owned_plan_day_exercises occurrence
           ON occurrence.id = policy.plan_day_exercise_id
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         WHERE day.plan_id = ?) AS policies,
        (SELECT COUNT(*) FROM owned_plan_occurrence_sources source
         JOIN owned_plan_day_exercises occurrence
           ON occurrence.id = source.plan_day_exercise_id
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         WHERE day.plan_id = ?) AS source_maps`,
      Array.from({ length: 5 }, () => result.plan.id),
    );
    const template = pack.templates.find(
      ({ id }) => id === "full-body-foundation",
    )!;
    const expectedOccurrences = template.days.reduce(
      (count, day) => count + day.exercises.length,
      0,
    );
    const expectedTargets = template.days.reduce(
      (count, day) => count + day.exercises.reduce(
        (dayCount, exercise) => dayCount + exercise.target.plannedSets,
        0,
      ),
      0,
    );
    const sourceBefore = await kernel.queryAll(
      `SELECT template_json FROM starter_plan_sources
       WHERE template_id = 'full-body-foundation'`,
    );
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE plans SET name = 'Owner edited copy', revision = revision + 1
         WHERE id = ?`,
        [result.plan.id],
      )
    );
    const sourceAfter = await kernel.queryAll(
      `SELECT template_json FROM starter_plan_sources
       WHERE template_id = 'full-body-foundation'`,
    );
    invariant(
      counts?.days === template.days.length
      && counts.occurrences === expectedOccurrences
      && counts.targets === expectedTargets
      && counts.policies === expectedOccurrences
      && counts.source_maps === expectedOccurrences
      && JSON.stringify(sourceAfter) === JSON.stringify(sourceBefore),
      "phase2_starter_full_clone_invalid",
    );
  },

  async "starter-d55-clone"({ kernel }, adapter) {
    const pack = await prepareRuntime(kernel, adapter);
    const result = await activate(kernel, adapter, pack, {
      templateId: "gym-body-part-split",
      requestId: "phase2-starter-d55",
      activatedAtMs: 1_787_027_201_000,
      expectedActiveScheduleRevision: null,
    });
    const occurrences = await kernel.queryAll<{
      day_name: string;
      metric_profile: string;
    }>(
      `SELECT day.name AS day_name, occurrence.metric_profile
       FROM plan_days day
       JOIN owned_plan_day_exercises occurrence
         ON occurrence.plan_day_id = day.id
       WHERE day.plan_id = ?
       ORDER BY day.ordinal, occurrence.ordinal`,
      [result.plan.id],
    );
    invariant(
      result.days.map(({ name }) => name).join(",")
        === "Chest,Back,Shoulders,Legs,Arms"
      && result.schedule.version.mode === "weekday"
      && result.schedule.version.bindings.map((binding) =>
        "weekday" in binding ? binding.weekday : ""
      ).join(",") === "Monday,Tuesday,Wednesday,Thursday,Friday"
      && occurrences.length === 20
      && occurrences.every(({ metric_profile }) =>
        metric_profile === "load_reps"
      )
      && occurrences.map(({ day_name }) => day_name).join(",")
        === [
          ...Array.from({ length: 4 }, () => "Chest"),
          ...Array.from({ length: 4 }, () => "Back"),
          ...Array.from({ length: 4 }, () => "Shoulders"),
          ...Array.from({ length: 4 }, () => "Legs"),
          ...Array.from({ length: 4 }, () => "Arms"),
        ].join(","),
      "phase2_starter_d55_invalid",
    );
  },

  async "starter-existing-copy-choice"({ kernel }, adapter) {
    const pack = await prepareRuntime(kernel, adapter);
    const first = await activate(kernel, adapter, pack, {
      templateId: "full-body-foundation",
      requestId: "phase2-starter-choice-first",
      activatedAtMs: 1_787_027_202_000,
      expectedActiveScheduleRevision: null,
    });
    let missingChoiceRejected = false;
    try {
      await activate(kernel, adapter, pack, {
        templateId: "full-body-foundation",
        requestId: "phase2-starter-choice-missing",
        activatedAtMs: 1_787_027_203_000,
        expectedActiveScheduleRevision: first.schedule.revision,
      });
    } catch {
      missingChoiceRejected = true;
    }
    const second = await activate(kernel, adapter, pack, {
      templateId: "full-body-foundation",
      requestId: "phase2-starter-choice-create-another",
      activatedAtMs: 1_787_027_204_000,
      expectedActiveScheduleRevision: first.schedule.revision,
      copyChoice: { type: "create_another" },
    });
    const alternate = await activate(kernel, adapter, pack, {
      templateId: "upper-lower",
      requestId: "phase2-starter-choice-alternate",
      activatedAtMs: 1_787_027_205_000,
      expectedActiveScheduleRevision: second.schedule.revision,
    });
    const [firstCurrent] = await kernel.queryAll<{
      plan_revision: number;
      schedule_revision: number;
    }>(
      `SELECT plan.revision AS plan_revision,
              schedule.revision AS schedule_revision
       FROM plans plan
       JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
       WHERE plan.id = ?`,
      [first.plan.id],
    );
    invariant(firstCurrent !== undefined, "phase2_starter_copy_missing");
    const reactivated = await activate(kernel, adapter, pack, {
      templateId: "full-body-foundation",
      requestId: "phase2-starter-choice-reactivate",
      activatedAtMs: 1_787_027_206_000,
      expectedActiveScheduleRevision: alternate.schedule.revision,
      startLocalDate: "2026-08-25",
      copyChoice: {
        type: "reactivate_existing",
        planId: first.plan.id,
        expectedPlanRevision: firstCurrent.plan_revision,
        expectedScheduleRevision: firstCurrent.schedule_revision,
      },
    });
    invariant(
      missingChoiceRejected
      && second.plan.id !== first.plan.id
      && reactivated.plan.id === first.plan.id
      && reactivated.schedule.version.versionNumber === 2,
      "phase2_starter_copy_choice_invalid",
    );
  },
};

export async function createExpoPhase2StarterContractAdapter(
  runId: string,
): Promise<Phase2StarterContractAdapter> {
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  return {
    async createRuntime(caseId) {
      return openExerciseSearchFtsContractRuntime(
        `phase2-starter-${runId}-${caseId}.db`,
      );
    },
    sha256: (value) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  };
}

export async function runPhase2StarterContract(
  adapter: Phase2StarterContractAdapter,
): Promise<Phase2StarterContractResult> {
  const startedAt = new Date().toISOString();
  const results: Phase2StarterContractCaseResult[] = [];
  for (const caseId of PHASE2_STARTER_CASE_IDS) {
    const caseStartedAt = Date.now();
    let runtime: Phase2StarterContractRuntime | undefined;
    try {
      runtime = await adapter.createRuntime(caseId);
      await contractCases[caseId](runtime, adapter);
      results.push({
        id: caseId,
        status: "passed",
        durationMs: Date.now() - caseStartedAt,
      });
    } catch (error) {
      results.push({
        id: caseId,
        status: "failed",
        durationMs: Date.now() - caseStartedAt,
        errorCode: safeErrorCode(error),
      });
    } finally {
      await runtime?.close().catch(() => undefined);
    }
  }
  const passed = results.filter(({ status }) => status === "passed").length;
  const failed = results.length - passed;
  return {
    schemaVersion: 1,
    contractVersion: PHASE2_STARTER_CONTRACT_VERSION,
    status: failed === 0 ? "passed" : "failed",
    total: results.length,
    passed,
    failed,
    skipped: 0,
    cases: results,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export function assertPhase2StarterContractResult(
  input: unknown,
): asserts input is Phase2StarterContractResult {
  const result = input as Partial<Phase2StarterContractResult> | null;
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  if (
    result?.schemaVersion !== 1
    || result.contractVersion !== PHASE2_STARTER_CONTRACT_VERSION
    || result.status !== "passed"
    || result.total !== PHASE2_STARTER_CASE_IDS.length
    || result.passed !== PHASE2_STARTER_CASE_IDS.length
    || result.failed !== 0
    || result.skipped !== 0
    || cases.length !== PHASE2_STARTER_CASE_IDS.length
    || cases.some((contractCase, index) =>
      contractCase.id !== PHASE2_STARTER_CASE_IDS[index]
      || contractCase.status !== "passed"
      || contractCase.errorCode !== undefined
      || !Number.isFinite(contractCase.durationMs)
      || contractCase.durationMs < 0
    )
  ) {
    throw new Error("phase2_starter_contract_result_invalid");
  }
}
