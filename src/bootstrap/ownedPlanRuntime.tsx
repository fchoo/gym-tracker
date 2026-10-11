import type {
  MetricIdentity,
} from "../domains/metrics";
import {
  applySessionExerciseEditsToPlan,
  archiveOwnedPlan,
  createOwnedPlanDraft,
  duplicateOwnedPlan,
  previewDayRemoval,
  previewExerciseReplacement,
  previewSessionExerciseEditsForPlan,
  removePlanDayWithImpact,
  replacePlanExercise,
  restoreOwnedPlan,
  saveOwnedPlan,
  type DayRemovalPreview,
  type ExerciseReplacementCommandResult,
  type ExerciseReplacementPreview,
  type ApplySessionExerciseEditsToPlanInput,
  type SessionExerciseEditsForPlanPreview,
  type OwnedPlanDraftInput,
  type RemovePlanDayWithImpactInput,
  type ReplacePlanExerciseInput,
} from "../domains/plans";
import type {
  SqliteKernel,
} from "../platform/sqlite";
import {
  createOwnedPlanRepository,
  type OwnedPlanRepositoryResult,
  type OwnedPlanSnapshot,
  type SessionExerciseEditsToPlanResult,
} from "../platform/sqlite/repositories/ownedPlanRepository";
import {
  createPlanImpactRepository,
  type PlanImpactCommittedResult,
} from "../platform/sqlite/repositories/planImpactRepository";

export type OwnedPlanRuntimeExerciseOption = Readonly<{
  id: string;
  name: string;
  metricIdentity: MetricIdentity;
  defaultRestSeconds: number;
}>;

export type OwnedPlanRuntimePort = Readonly<{
  createDraft(input: Readonly<{
    name: string;
    dayName: string;
    requestId?: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  /** Native-contract fixture escape hatch; production UI never supplies IDs. */
  createFixtureDraft(input: Readonly<{
    requestId: string;
    planId: string;
    dayId: string;
    name: string;
    dayName: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  loadPlan(planId: string): Promise<OwnedPlanSnapshot | null>;
  listExercises(): Promise<readonly OwnedPlanRuntimeExerciseOption[]>;
  savePlan(input: Readonly<{
    expectedRevision: number;
    plan: OwnedPlanDraftInput;
    requestId?: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  duplicatePlan(input: Readonly<{
    sourcePlanId: string;
    expectedRevision: number;
    name: string;
    requestId?: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  archivePlan(input: Readonly<{
    planId: string;
    expectedRevision: number;
    requestId?: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  restorePlan(input: Readonly<{
    planId: string;
    expectedRevision: number;
    requestId?: string;
  }>): Promise<OwnedPlanRepositoryResult>;
  previewDayRemoval(input: Readonly<{
    planId: string;
    dayId: string;
  }>): Promise<DayRemovalPreview>;
  removeDayWithImpact(
    input: RemovePlanDayWithImpactInput,
  ): Promise<PlanImpactCommittedResult>;
  previewExerciseReplacement(input: Readonly<{
    planId: string;
    occurrenceId: string;
  }>): Promise<ExerciseReplacementPreview>;
  replaceExercise(
    input: ReplacePlanExerciseInput,
  ): Promise<ExerciseReplacementCommandResult>;
  previewSessionExerciseEdits(input: Readonly<{
    sessionId: string;
  }>): Promise<SessionExerciseEditsForPlanPreview | null>;
  applySessionExerciseEdits(
    input: Omit<ApplySessionExerciseEditsToPlanInput, "requestId">,
  ): Promise<SessionExerciseEditsToPlanResult>;
  createId(kind: string): string;
}>;

type ExerciseRow = Readonly<{
  exercise_id: string;
  canonical_name: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  default_rest_seconds: number;
}>;

export function createOwnedPlanRuntimePort(
  kernel: SqliteKernel,
  dependencies: Readonly<{
    nowMs(): number;
    randomUUID(): string;
    sha256(value: string): Promise<string>;
  }>,
): OwnedPlanRuntimePort {
  const repository = createOwnedPlanRepository(kernel);
  const impactRepository = createPlanImpactRepository(kernel, {});
  const createId = (kind: string) => `${kind}:${dependencies.randomUUID()}`;
  const commandContext = {
    repository,
    invalidate: async () => undefined,
    sha256: dependencies.sha256,
  };
  const inFlightSessionApplies = new Set<string>();

  return Object.freeze({
    createId,
    loadPlan: (planId) => repository.read(planId),
    listExercises: async () => {
      const rows = await kernel.queryAll<ExerciseRow>(
        `SELECT entry.exercise_id, entry.canonical_name,
                entry.metric_profile, entry.metric_contract_version,
                entry.exercise_metric_generation,
                exercise.default_rest_seconds
         FROM exercise_library_entries entry
         JOIN exercises exercise ON exercise.id = entry.exercise_id
         LEFT JOIN exercise_owner_preferences preference
           ON preference.exercise_id = entry.exercise_id
         WHERE entry.availability = 'available'
           AND COALESCE(preference.hidden, 0) = 0
           AND COALESCE(preference.archived, 0) = 0
         ORDER BY entry.canonical_name, entry.exercise_id`,
      );
      return Object.freeze(rows.map((row) => Object.freeze({
        id: row.exercise_id,
        name: row.canonical_name,
        metricIdentity: Object.freeze({
          profile: row.metric_profile,
          contractVersion: row.metric_contract_version,
          exerciseMetricGeneration: row.exercise_metric_generation,
        }),
        defaultRestSeconds: row.default_rest_seconds,
      })));
    },
    createDraft: (input) => {
      const createdAtMs = dependencies.nowMs();
      return createOwnedPlanDraft({
        ...commandContext,
        input: {
          requestId: input.requestId ?? createId("owned-plan-create"),
          planId: createId("owned-plan"),
          name: input.name,
          dayId: createId("owned-plan-day"),
          dayName: input.dayName,
          createdAtMs,
        },
      });
    },
    createFixtureDraft: (input) => createOwnedPlanDraft({
      ...commandContext,
      input: { ...input, createdAtMs: dependencies.nowMs() },
    }),
    savePlan: (input) =>
      saveOwnedPlan({
        ...commandContext,
        input: {
          requestId: input.requestId ?? createId("owned-plan-save"),
          expectedRevision: input.expectedRevision,
          plan: input.plan,
          savedAtMs: dependencies.nowMs(),
        },
      }),
    duplicatePlan: (input) =>
      duplicateOwnedPlan({
        ...commandContext,
        input: {
          requestId: input.requestId ?? createId("owned-plan-duplicate"),
          sourcePlanId: input.sourcePlanId,
          expectedRevision: input.expectedRevision,
          newPlanId: createId("owned-plan"),
          name: input.name,
          duplicatedAtMs: dependencies.nowMs(),
        },
      }),
    archivePlan: (input) =>
      archiveOwnedPlan({
        ...commandContext,
        input: {
          requestId: input.requestId ?? createId("owned-plan-archive"),
          planId: input.planId,
          expectedRevision: input.expectedRevision,
          updatedAtMs: dependencies.nowMs(),
        },
      }),
    restorePlan: (input) =>
      restoreOwnedPlan({
        ...commandContext,
        input: {
          requestId: input.requestId ?? createId("owned-plan-restore"),
          planId: input.planId,
          expectedRevision: input.expectedRevision,
          updatedAtMs: dependencies.nowMs(),
        },
      }),
    previewDayRemoval: (input) =>
      previewDayRemoval({
        repository: impactRepository,
        sha256: dependencies.sha256,
        nowMs: dependencies.nowMs,
        input,
      }),
    removeDayWithImpact: (input) =>
      removePlanDayWithImpact({
        repository: impactRepository,
        sha256: dependencies.sha256,
        invalidate: async () => undefined,
        nowMs: dependencies.nowMs,
        input,
      }),
    previewExerciseReplacement: (input) =>
      previewExerciseReplacement({
        repository: impactRepository,
        sha256: dependencies.sha256,
        input,
      }),
    replaceExercise: (input) =>
      replacePlanExercise({
        repository: impactRepository,
        sha256: dependencies.sha256,
        invalidate: async () => undefined,
        nowMs: dependencies.nowMs,
        input,
      }),
    previewSessionExerciseEdits: (input) =>
      previewSessionExerciseEditsForPlan({
        repository,
        sha256: dependencies.sha256,
        input,
      }),
    async applySessionExerciseEdits(input) {
      const key = `${input.sourceSessionId}:${input.previewToken}`;
      if (inFlightSessionApplies.has(key)) {
        throw new Error("session_write_back_apply_in_flight");
      }
      inFlightSessionApplies.add(key);
      try {
        return await applySessionExerciseEditsToPlan({
          repository,
          sha256: dependencies.sha256,
          nowMs: dependencies.nowMs,
          invalidate: async () => undefined,
          input: {
            ...input,
            requestId: `session-writeback:${input.previewToken}`,
          },
        });
      } finally {
        inFlightSessionApplies.delete(key);
      }
    },
  });
}
