import type {
  DayRemovalRepositoryPreview,
  ExerciseReplacementCommittedResult,
  ExerciseReplacementOccurrenceFacts,
  ExerciseReplacementRepositoryPreview,
  PlanImpactCommittedResult,
  PlanImpactRepository,
} from "../../platform/sqlite/repositories/planImpactRepository";
import type {
  AdvancedTimingConfigV1,
} from "../advancedTiming";
import {
  OFF_ADVANCED_TIMING_CONFIG,
} from "../advancedTiming";
import type {
  ApplySessionExerciseEditsToPlanInput as StagedSessionExerciseEditsToPlanInput,
  SessionExerciseEditsToPlanResult,
} from "../../platform/sqlite/repositories/ownedPlanRepository";
import type {
  MetricIdentity,
  MetricTarget,
} from "../metrics";
import {
  addLocalDays,
  compareLocalDates,
  localDateAtInstant,
  parseLocalDate,
  parseStoredTimeZone,
  type LocalDate,
} from "../scheduling";

export type PlanImpactCommandResult = PlanImpactCommittedResult;
export type ExerciseReplacementCommandResult =
  ExerciseReplacementCommittedResult;

export type SessionExerciseWriteBackTarget = Readonly<{
  ordinal: number;
  target: MetricTarget;
  units: Readonly<Record<string, unknown>>;
  advancedTimingOverride?: AdvancedTimingConfigV1 | null;
}>;

export type SessionExerciseWriteBackWarmup = Readonly<{
  ordinal: number;
  loadGrams: number;
  reps: number;
  advancedTimingOverride?: AdvancedTimingConfigV1 | null;
}>;

export type SessionExerciseWriteBackComposition = Readonly<{
  source: "manual" | "planned";
  sessionExerciseId: string;
  sourceOccurrenceId: string | null;
  exerciseId: string;
  ordinal: number;
  restSeconds: number;
  metricIdentity: MetricIdentity;
  advancedTimingDefault?: AdvancedTimingConfigV1;
  warmups: readonly SessionExerciseWriteBackWarmup[];
  targets: readonly SessionExerciseWriteBackTarget[];
  policy: Readonly<{
    kind: "automatic" | "manual_hold" | "plan_authored";
    policyId: string;
    version: number;
    rule: Readonly<Record<string, unknown>>;
  }>;
}>;

export type SessionExerciseEditsForPlanFacts = Readonly<{
  session: Readonly<{
    id: string;
    planId: string | null;
    planDayId: string | null;
    planName: string | null;
    dayName: string | null;
    revision: number;
    source: "scheduled_day" | "alternate_day" | "rest_day" | "empty" | "manual";
    status: "completed" | "partial" | "discarded" | "zero_sets" | "in_progress";
    modifiedFromPlan: boolean;
  }> ;
  day: Readonly<{
    id: string;
    name: string;
    planId: string;
    planRevision: number;
    occurrences: readonly Readonly<{
      occurrenceId: string;
      exerciseId: string;
      ordinal: number;
      restSeconds: number;
      metricIdentity: MetricIdentity;
      advancedTimingDefault?: AdvancedTimingConfigV1;
      warmups: readonly SessionExerciseWriteBackWarmup[];
      targets: readonly SessionExerciseWriteBackTarget[];
      policy: SessionExerciseWriteBackComposition["policy"];
    }>[];
  }> ;
  sessionExercises: readonly Readonly<{
    sessionExerciseId: string;
    exerciseId: string;
    displayOrdinal: number;
    sourceOccurrenceId: string | null;
    restSeconds: number;
    metricIdentity: MetricIdentity;
    advancedTimingDefault?: AdvancedTimingConfigV1;
    warmups?: readonly SessionExerciseWriteBackWarmup[];
    targets: readonly SessionExerciseWriteBackTarget[];
  }>[];
  edits: readonly Readonly<{
    operation: "replace_exercise" | "remove_exercise";
    subjectSessionExerciseId: string;
    replacementSessionExerciseId: string | null;
  }>[];
}>;

export type SessionExerciseEditsForPlanReader = Readonly<{
  readSessionExerciseEditsForPlan(input: Readonly<{
    sessionId: string;
  }>): Promise<SessionExerciseEditsForPlanFacts | null>;
}>;

export type SessionExerciseEditsForPlanRepository =
  & SessionExerciseEditsForPlanReader
  & Readonly<{
  applySessionExerciseEditsToPlan(
    input: StagedSessionExerciseEditsToPlanInput,
  ): Promise<SessionExerciseEditsToPlanResult>;
  readSessionExerciseEditsToPlanResult(input: Readonly<{
    requestId: string;
    requestSha256: string;
  }>): Promise<SessionExerciseEditsToPlanResult | null>;
}>;

export type SessionExerciseEditsForPlanPreview = Readonly<{
  kind: "session_exercise_edits";
  sourceSessionId: string;
  sourceSessionRevision: number;
  planId: string;
  planName: string;
  planDayId: string;
  dayName: string;
  expectedPlanRevision: number;
  currentWorkoutUnaffected: true;
  previewToken: string;
  composition: readonly SessionExerciseWriteBackComposition[];
}>;

export type ApplySessionExerciseEditsToPlanInput = Readonly<{
  requestId: string;
  sourceSessionId: string;
  expectedPlanRevision: number;
  previewToken: string;
  composition: readonly SessionExerciseWriteBackComposition[];
}>;

const IDENTIFIER_MAX_CODE_POINTS = 128;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PREVIEW_TOKEN_PATTERN = /^plan-impact-v1:[a-f0-9]{64}$/u;
const SESSION_WRITE_BACK_PREVIEW_TOKEN_PATTERN = /^session-writeback-v1:[a-f0-9]{64}$/u;

export type DayRemovalPreview = Readonly<{
  kind: "day_removal";
  planId: string;
  planName: string;
  planRevision: number;
  dayId: string;
  dayName: string;
  dayRevision: number;
  currentWorkoutUnaffected: boolean;
  restructuringBlocked: boolean;
  previewToken: string;
  schedule: Readonly<{
    id: string;
    revision: number;
    versionId: string;
    versionNumber: number;
    effectiveLocalDate: string;
    mode: "weekday" | "rotation";
    timeZone: string;
  }> | null;
  affectedBindings: readonly Readonly<{
    id: string;
    label: string;
    planDayId: string;
  }>[];
  affectedDates: readonly Readonly<{
    id: string;
    label: string;
    localDate: string;
    revision: number;
  }>[];
  replacementDays: readonly Readonly<{
    id: string;
    name: string;
    revision: number;
  }>[];
  earliestEffectiveLocalDate: string;
}>;

export type RemovePlanDayWithImpactInput = Readonly<{
  requestId: string;
  planId: string;
  dayId: string;
  expectedPlanRevision: number;
  expectedScheduleRevision: number;
  previewToken: string;
  choice:
    | Readonly<{
        kind: "replacement_day";
        replacementDayId: string;
      }>
    | Readonly<{ kind: "remove_binding" }>
    | Readonly<{
        kind: "effective_date";
        effectiveLocalDate: string;
      }>;
}>;

export type ExerciseReplacementCandidate = Readonly<{
  exerciseId: string;
  name: string;
  metricIdentity: MetricIdentity;
  exerciseRevision: number;
  libraryRevision: number;
  compatible: boolean;
}>;

export type ExerciseReplacementPreview = Readonly<{
  kind: "exercise_replacement";
  planId: string;
  planName: string;
  planRevision: number;
  sourceOccurrenceId: string;
  sourceExerciseId: string;
  sourceExerciseName: string;
  sourceMetricIdentity: MetricIdentity;
  currentWorkoutUnaffected: boolean;
  previewToken: string;
  candidates: readonly ExerciseReplacementCandidate[];
  occurrences: readonly ExerciseReplacementOccurrenceFacts[];
}>;

export type ReplacePlanExerciseInput = Readonly<{
  requestId: string;
  planId: string;
  sourceOccurrenceId: string;
  expectedPlanRevision: number;
  previewToken: string;
  scope: "this_occurrence" | "all_occurrences";
  replacementExerciseId: string;
  review: Readonly<{
    targets: boolean;
    warmups: boolean;
    rest: boolean;
    progression: boolean;
    historyImmutable: boolean;
  }>;
  occurrences: readonly ExerciseReplacementOccurrenceFacts[];
}>;

export type PlanImpactInputErrorCode =
  | "plan_impact_date_invalid"
  | "plan_impact_day_invalid"
  | "plan_impact_hash_invalid"
  | "plan_impact_identifier_invalid"
  | "plan_impact_plan_invalid"
  | "plan_impact_preview_stale"
  | "plan_impact_occurrences_incomplete"
  | "plan_impact_review_incomplete"
  | "plan_impact_replacement_incompatible"
  | "plan_impact_replacement_invalid"
  | "plan_impact_revision_invalid"
  | "plan_impact_schedule_invalid"
  | "plan_impact_workout_active";

export class PlanImpactInputError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-PLAN04" as const;

  constructor(readonly code: PlanImpactInputErrorCode) {
    super(code);
    this.name = "PlanImpactInputError";
  }
}

type Sha256 = (value: string) => Promise<string>;

type PreviewContext = Readonly<{
  repository: PlanImpactRepository;
  sha256: Sha256;
  nowMs(): number;
}>;

type CommandContext = PreviewContext & Readonly<{
  invalidate(keys: readonly string[]): Promise<void>;
}>;

function codePointLength(value: string): number {
  return [...value].length;
}

function validIdentifier(value: string): boolean {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && codePointLength(value) <= IDENTIFIER_MAX_CODE_POINTS;
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    );
    return `{${entries.map(([key, entry]) =>
      `${JSON.stringify(key)}:${stableJson(entry)}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function digest(sha256: Sha256, value: unknown): Promise<string> {
  const result = await sha256(stableJson(value));
  if (!SHA256_PATTERN.test(result)) {
    throw new PlanImpactInputError("plan_impact_hash_invalid");
  }
  return result;
}

function repositoryPreviewFacts(
  value: DayRemovalRepositoryPreview,
): DayRemovalRepositoryPreview {
  return Object.freeze({
    ...value,
    affectedOverrides: Object.freeze(
      value.affectedOverrides.map((entry) => Object.freeze({ ...entry })),
    ),
    replacementDays: Object.freeze(
      value.replacementDays.map((entry) => Object.freeze({ ...entry })),
    ),
    schedule: value.schedule === null
      ? null
      : Object.freeze({
          ...value.schedule,
          version: Object.freeze({
            ...value.schedule.version,
            bindings: Object.freeze(
              value.schedule.version.bindings.map((binding) =>
                Object.freeze({ ...binding })
              ),
            ),
          }),
        }),
  });
}

async function previewToken(
  sha256: Sha256,
  facts: DayRemovalRepositoryPreview,
): Promise<string> {
  return `plan-impact-v1:${await digest(sha256, {
    version: 1,
    operation: "day_removal",
    facts,
  })}`;
}

function earliestEffectiveLocalDate(
  schedule: NonNullable<DayRemovalRepositoryPreview["schedule"]>,
  nowMs: number,
): LocalDate {
  if (!validTime(nowMs)) {
    throw new PlanImpactInputError("plan_impact_date_invalid");
  }
  const today = localDateAtInstant(
    nowMs,
    parseStoredTimeZone(schedule.version.timeZone),
  );
  const currentEffective = parseLocalDate(
    schedule.version.effectiveLocalDate,
  );
  return compareLocalDates(today, currentEffective) === 1
    ? today
    : addLocalDays(currentEffective, 1);
}

function bindingLabel(
  mode: "weekday" | "rotation",
  binding: Readonly<{
    ordinal: number;
    weekIndex: number | null;
    weekday: string | null;
  }>,
): string {
  return mode === "weekday"
    ? `Week ${(binding.weekIndex ?? 0) + 1} · ${binding.weekday ?? "Unassigned"}`
    : `Rotation position ${binding.ordinal + 1}`;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function localDateLabel(value: string): string {
  const localDate = parseLocalDate(value);
  return DATE_FORMATTER.format(new Date(`${localDate}T00:00:00.000Z`));
}

function sameMetricIdentity(
  left: MetricIdentity,
  right: MetricIdentity,
): boolean {
  return left.profile === right.profile
    && left.contractVersion === right.contractVersion
    && left.exerciseMetricGeneration === right.exerciseMetricGeneration;
}

function replacementPreviewFacts(
  value: ExerciseReplacementRepositoryPreview,
): ExerciseReplacementRepositoryPreview {
  return Object.freeze({
    ...value,
    sourceMetricIdentity: Object.freeze({ ...value.sourceMetricIdentity }),
    candidates: Object.freeze(value.candidates.map((candidate) =>
      Object.freeze({
        ...candidate,
        metricIdentity: Object.freeze({ ...candidate.metricIdentity }),
      })
    )),
    occurrences: Object.freeze(value.occurrences.map((occurrence) =>
      Object.freeze({
        ...occurrence,
        warmups: Object.freeze(occurrence.warmups.map((warmup) =>
          Object.freeze({ ...warmup })
        )),
        targets: Object.freeze(occurrence.targets.map((target) =>
          Object.freeze({
            ...target,
            target: Object.freeze({ ...target.target }),
            units: Object.freeze({ ...target.units }),
          })
        )),
        policy: Object.freeze({
          ...occurrence.policy,
          rule: Object.freeze({ ...occurrence.policy.rule }),
        }),
      })
    )),
  });
}

async function replacementPreviewToken(
  sha256: Sha256,
  facts: ExerciseReplacementRepositoryPreview,
): Promise<string> {
  return `plan-impact-v1:${await digest(sha256, {
    version: 1,
    operation: "exercise_replacement",
    facts,
  })}`;
}

function sameTargets(
  left: readonly SessionExerciseWriteBackTarget[],
  right: readonly SessionExerciseWriteBackTarget[],
): boolean {
  const normalize = (values: readonly SessionExerciseWriteBackTarget[]) =>
    values.map((target) => ({
      ...target,
      advancedTimingOverride: target.advancedTimingOverride ?? null,
    }));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function sameWarmups(
  left: readonly SessionExerciseWriteBackWarmup[],
  right: readonly SessionExerciseWriteBackWarmup[],
): boolean {
  const normalize = (values: readonly SessionExerciseWriteBackWarmup[]) =>
    values.map((warmup) => ({
      ...warmup,
      advancedTimingOverride: warmup.advancedTimingOverride ?? null,
    }));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function timingConfig(
  value: AdvancedTimingConfigV1 | undefined,
): AdvancedTimingConfigV1 {
  return value ?? OFF_ADVANCED_TIMING_CONFIG;
}

function timingOverride(
  value: AdvancedTimingConfigV1 | null | undefined,
): AdvancedTimingConfigV1 | null {
  return value ?? null;
}

function manualPolicy(
  identity: MetricIdentity,
): SessionExerciseWriteBackComposition["policy"] {
  const policyId = `${identity.profile}.manual_hold.v1`;
  return Object.freeze({
    kind: "manual_hold",
    policyId,
    version: 1,
    rule: Object.freeze({
      kind: "manual_hold",
      id: policyId,
      version: 1,
    }),
  });
}

export function canonicalizeSessionExerciseEditsForPlan(
  facts: SessionExerciseEditsForPlanFacts,
): readonly SessionExerciseWriteBackComposition[] | null {
  const { session, day } = facts;
  if (
    session.status !== "completed"
    || session.source !== "scheduled_day"
    || !session.modifiedFromPlan
    || session.planId === null
    || session.planDayId === null
    || session.planName === null
    || session.dayName === null
    || session.planId !== day.planId
    || session.planDayId !== day.id
  ) {
    return null;
  }
  const removed = new Set(facts.edits.map(({ subjectSessionExerciseId }) =>
    subjectSessionExerciseId
  ));
  const replacements = new Set(facts.edits.flatMap(({ replacementSessionExerciseId }) =>
    replacementSessionExerciseId === null ? [] : [replacementSessionExerciseId]
  ));
  const occurrenceById = new Map(
    day.occurrences.map((occurrence) => [occurrence.occurrenceId, occurrence]),
  );
  const composition = facts.sessionExercises
    .filter(({ sessionExerciseId }) => !removed.has(sessionExerciseId))
    .sort((left, right) =>
      left.displayOrdinal - right.displayOrdinal
      || left.sessionExerciseId.localeCompare(right.sessionExerciseId)
    )
    .map((exercise, ordinal): SessionExerciseWriteBackComposition | null => {
      const source = exercise.sourceOccurrenceId === null
        ? null
        : occurrenceById.get(exercise.sourceOccurrenceId);
      const isManual = source === null || replacements.has(exercise.sessionExerciseId);
      if (
        !isManual
        && (
          source === undefined
          || source.exerciseId !== exercise.exerciseId
          || !sameMetricIdentity(source.metricIdentity, exercise.metricIdentity)
        )
      ) {
        return null;
      }
      return Object.freeze({
        source: isManual ? "manual" : "planned",
        sessionExerciseId: exercise.sessionExerciseId,
        sourceOccurrenceId: isManual ? null : exercise.sourceOccurrenceId,
        exerciseId: exercise.exerciseId,
        ordinal,
        restSeconds: isManual ? exercise.restSeconds : source!.restSeconds,
        metricIdentity: Object.freeze({ ...exercise.metricIdentity }),
        advancedTimingDefault: Object.freeze({
          ...timingConfig(
            exercise.advancedTimingDefault ?? source?.advancedTimingDefault,
          ),
        }),
        warmups: Object.freeze((isManual
          ? exercise.warmups ?? []
          : source!.warmups).map((warmup) => {
          const sessionWarmup = exercise.warmups?.find(({ ordinal: index }) =>
            index === warmup.ordinal
          );
          return Object.freeze({
            ...warmup,
            advancedTimingOverride: timingOverride(
              sessionWarmup?.advancedTimingOverride
                ?? warmup.advancedTimingOverride,
            ),
          });
        }
        )),
        targets: Object.freeze((isManual
          ? exercise.targets
          : source!.targets).map((target) => {
          const sessionTarget = exercise.targets.find(({ ordinal: index }) =>
            index === target.ordinal
          );
          return Object.freeze({
            ordinal: target.ordinal,
            target: Object.freeze({ ...target.target }),
            units: Object.freeze({ ...target.units }),
            advancedTimingOverride: timingOverride(
              sessionTarget?.advancedTimingOverride
                ?? target.advancedTimingOverride,
            ),
          });
        })),
        policy: isManual
          ? manualPolicy(exercise.metricIdentity)
          : Object.freeze({
              ...source!.policy,
              rule: Object.freeze({ ...source!.policy.rule }),
            }),
      });
    });
  return composition.some((entry) => entry === null)
    ? null
    : Object.freeze(composition as readonly SessionExerciseWriteBackComposition[]);
}

function compositionMatchesDay(
  composition: readonly SessionExerciseWriteBackComposition[],
  day: SessionExerciseEditsForPlanFacts["day"],
): boolean {
  return composition.length === day.occurrences.length
    && composition.every((entry, index) => {
      const occurrence = day.occurrences[index];
      return occurrence !== undefined
        && entry.source === "planned"
        && entry.sourceOccurrenceId === occurrence.occurrenceId
        && entry.exerciseId === occurrence.exerciseId
        && entry.ordinal === occurrence.ordinal
        && entry.restSeconds === occurrence.restSeconds
        && sameMetricIdentity(entry.metricIdentity, occurrence.metricIdentity)
        && JSON.stringify(timingConfig(entry.advancedTimingDefault))
          === JSON.stringify(timingConfig(occurrence.advancedTimingDefault))
        && sameWarmups(entry.warmups, occurrence.warmups)
        && sameTargets(entry.targets, occurrence.targets);
    });
}

async function sessionWriteBackPreviewToken(
  sha256: Sha256,
  facts: SessionExerciseEditsForPlanFacts,
  composition: readonly SessionExerciseWriteBackComposition[],
): Promise<string> {
  return `session-writeback-v1:${await digest(sha256, {
    version: 1,
    operation: "session_exercise_edits",
    source: {
      sessionId: facts.session.id,
      sessionRevision: facts.session.revision,
      planId: facts.session.planId,
      planDayId: facts.session.planDayId,
      status: facts.session.status,
      source: facts.session.source,
      modifiedFromPlan: facts.session.modifiedFromPlan,
      dayId: facts.day.id,
      dayName: facts.day.name,
      dayPlanId: facts.day.planId,
      planRevision: facts.day.planRevision,
    },
    composition,
  })}`;
}

export async function previewSessionExerciseEditsForPlan(
  context: Readonly<{
    repository: SessionExerciseEditsForPlanReader;
    sha256: Sha256;
    input: Readonly<{ sessionId: string }>;
  }>,
): Promise<SessionExerciseEditsForPlanPreview | null> {
  if (!validIdentifier(context.input.sessionId)) {
    throw new PlanImpactInputError("plan_impact_identifier_invalid");
  }
  const facts = await context.repository.readSessionExerciseEditsForPlan({
    sessionId: context.input.sessionId,
  });
  if (facts === null) {
    return null;
  }
  const composition = canonicalizeSessionExerciseEditsForPlan(facts);
  if (composition === null || compositionMatchesDay(composition, facts.day)) {
    return null;
  }
  const { session, day } = facts;
  return Object.freeze({
    kind: "session_exercise_edits",
    sourceSessionId: session.id,
    sourceSessionRevision: session.revision,
    planId: session.planId!,
    planName: session.planName!,
    planDayId: session.planDayId!,
    dayName: session.dayName!,
    expectedPlanRevision: day.planRevision,
    currentWorkoutUnaffected: true,
    previewToken: await sessionWriteBackPreviewToken(
      context.sha256,
      facts,
      composition,
    ),
    composition,
  });
}

export async function applySessionExerciseEditsToPlan(
  context: Readonly<{
    repository: SessionExerciseEditsForPlanRepository;
    sha256: Sha256;
    nowMs(): number;
    invalidate(keys: readonly string[]): Promise<void>;
    input: ApplySessionExerciseEditsToPlanInput;
  }>,
): Promise<SessionExerciseEditsToPlanResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.sourceSessionId)
  ) {
    throw new PlanImpactInputError("plan_impact_identifier_invalid");
  }
  if (!validRevision(value.expectedPlanRevision)) {
    throw new PlanImpactInputError("plan_impact_revision_invalid");
  }
  if (!SESSION_WRITE_BACK_PREVIEW_TOKEN_PATTERN.test(value.previewToken)) {
    throw new PlanImpactInputError("plan_impact_preview_stale");
  }
  const replayCanonical = Object.freeze({
    operation: "session_exercise_edits" as const,
    requestId: value.requestId,
    sourceSessionId: value.sourceSessionId,
    expectedPlanRevision: value.expectedPlanRevision,
    previewToken: value.previewToken,
    composition: value.composition,
  });
  const replay = await context.repository.readSessionExerciseEditsToPlanResult({
    requestId: value.requestId,
    requestSha256: await digest(context.sha256, replayCanonical),
  });
  if (replay !== null) {
    return replay;
  }
  const facts = await context.repository.readSessionExerciseEditsForPlan({
    sessionId: value.sourceSessionId,
  });
  const composition = facts === null
    ? null
    : canonicalizeSessionExerciseEditsForPlan(facts);
  if (
    facts === null
    || composition === null
    || facts.day.planRevision !== value.expectedPlanRevision
    || JSON.stringify(composition) !== JSON.stringify(value.composition)
    || value.previewToken !== await sessionWriteBackPreviewToken(
      context.sha256,
      facts,
      composition,
    )
  ) {
    throw new PlanImpactInputError("plan_impact_preview_stale");
  }
  // canonicalizeSessionExerciseEditsForPlan already rejects absent plan identity.
  const planId = facts.session.planId!;
  const planDayId = facts.session.planDayId!;
  const committedAtMs = context.nowMs();
  if (!validTime(committedAtMs)) {
    throw new PlanImpactInputError("plan_impact_date_invalid");
  }
  const canonical = Object.freeze({
    ...replayCanonical,
    sourceSessionRevision: facts.session.revision,
    planId,
    planDayId,
    composition,
  });
  const result = await context.repository.applySessionExerciseEditsToPlan({
    ...canonical,
    requestSha256: await digest(context.sha256, replayCanonical),
    committedAtMs,
  });
  if (result.outcome !== "committed") {
    return result;
  }
  await context.invalidate(result.invalidations).catch(() => undefined);
  return result;
}

function sortCandidates(
  candidates: readonly ExerciseReplacementRepositoryPreview["candidates"][number][],
  sourceIdentity: MetricIdentity,
): readonly ExerciseReplacementCandidate[] {
  return Object.freeze(candidates
    .map((candidate) => Object.freeze({
      ...candidate,
      metricIdentity: Object.freeze({ ...candidate.metricIdentity }),
      compatible: sameMetricIdentity(
        candidate.metricIdentity,
        sourceIdentity,
      ),
    }))
    .sort((left, right) =>
      Number(right.compatible) - Number(left.compatible)
      || left.name.localeCompare(right.name, "en")
      || left.exerciseId.localeCompare(right.exerciseId, "en")
    ));
}

async function buildReplacementPreview(
  sha256: Sha256,
  facts: ExerciseReplacementRepositoryPreview,
): Promise<ExerciseReplacementPreview> {
  const currentFacts = replacementPreviewFacts(facts);
  return Object.freeze({
    kind: "exercise_replacement",
    planId: currentFacts.planId,
    planName: currentFacts.planName,
    planRevision: currentFacts.planRevision,
    sourceOccurrenceId: currentFacts.sourceOccurrenceId,
    sourceExerciseId: currentFacts.sourceExerciseId,
    sourceExerciseName: currentFacts.sourceExerciseName,
    sourceMetricIdentity: currentFacts.sourceMetricIdentity,
    currentWorkoutUnaffected: currentFacts.hasInProgressWorkout,
    previewToken: await replacementPreviewToken(sha256, currentFacts),
    candidates: sortCandidates(
      currentFacts.candidates,
      currentFacts.sourceMetricIdentity,
    ),
    occurrences: currentFacts.occurrences,
  });
}

export async function previewExerciseReplacement(
  context: Readonly<{
    repository: PlanImpactRepository;
    sha256: Sha256;
    input: Readonly<{ planId: string; occurrenceId: string }>;
  }>,
): Promise<ExerciseReplacementPreview> {
  if (
    !validIdentifier(context.input.planId)
    || !validIdentifier(context.input.occurrenceId)
  ) {
    throw new PlanImpactInputError("plan_impact_identifier_invalid");
  }
  const facts = await context.repository.readExerciseReplacement(
    context.input,
  );
  if (facts === null) {
    throw new PlanImpactInputError("plan_impact_replacement_invalid");
  }
  return buildReplacementPreview(context.sha256, facts);
}

async function buildPreview(
  context: PreviewContext,
  facts: DayRemovalRepositoryPreview,
): Promise<DayRemovalPreview> {
  const currentFacts = repositoryPreviewFacts(facts);
  const schedule = currentFacts.schedule;
  if (schedule === null) {
    throw new PlanImpactInputError("plan_impact_schedule_invalid");
  }
  const effectiveLocalDate = earliestEffectiveLocalDate(
    schedule,
    context.nowMs(),
  );
  return Object.freeze({
    kind: "day_removal",
    planId: currentFacts.planId,
    planName: currentFacts.planName,
    planRevision: currentFacts.planRevision,
    dayId: currentFacts.dayId,
    dayName: currentFacts.dayName,
    dayRevision: currentFacts.dayRevision,
    currentWorkoutUnaffected: currentFacts.hasInProgressWorkout,
    restructuringBlocked: currentFacts.hasInProgressWorkout,
    previewToken: await previewToken(context.sha256, currentFacts),
    schedule: Object.freeze({
      id: schedule.id,
      revision: schedule.revision,
      versionId: schedule.version.id,
      versionNumber: schedule.version.versionNumber,
      effectiveLocalDate: schedule.version.effectiveLocalDate,
      mode: schedule.version.mode,
      timeZone: schedule.version.timeZone,
    }),
    affectedBindings: Object.freeze(
      schedule.version.bindings
        .filter(({ planDayId }) => planDayId === currentFacts.dayId)
        .map((binding) => Object.freeze({
          id: binding.id,
          label: bindingLabel(schedule.version.mode, binding),
          planDayId: binding.planDayId,
        })),
    ),
    affectedDates: Object.freeze(currentFacts.affectedOverrides.map(
      (entry) => Object.freeze({
        ...entry,
        label: localDateLabel(entry.localDate),
      }),
    )),
    replacementDays: currentFacts.replacementDays,
    earliestEffectiveLocalDate: effectiveLocalDate,
  });
}

export async function previewDayRemoval(
  context: PreviewContext & Readonly<{
    input: Readonly<{ planId: string; dayId: string }>;
  }>,
): Promise<DayRemovalPreview> {
  if (
    !validIdentifier(context.input.planId)
    || !validIdentifier(context.input.dayId)
  ) {
    throw new PlanImpactInputError("plan_impact_identifier_invalid");
  }
  const facts = await context.repository.readDayRemoval(context.input);
  if (facts === null) {
    throw new PlanImpactInputError("plan_impact_day_invalid");
  }
  return buildPreview(context, facts);
}

function commandEffectiveLocalDate(
  preview: DayRemovalPreview,
  choice: RemovePlanDayWithImpactInput["choice"],
): LocalDate {
  const earliest = parseLocalDate(preview.earliestEffectiveLocalDate);
  if (choice.kind !== "effective_date") {
    return earliest;
  }
  let selected: LocalDate;
  try {
    selected = parseLocalDate(choice.effectiveLocalDate);
  } catch {
    throw new PlanImpactInputError("plan_impact_date_invalid");
  }
  if (compareLocalDates(selected, earliest) === -1) {
    throw new PlanImpactInputError("plan_impact_date_invalid");
  }
  return selected;
}

async function postCommit(
  context: CommandContext,
  result: PlanImpactCommittedResult,
): Promise<PlanImpactCommittedResult> {
  if (result.outcome === "committed") {
    await context.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

export async function removePlanDayWithImpact(
  context: CommandContext & Readonly<{
    input: RemovePlanDayWithImpactInput;
  }>,
): Promise<PlanImpactCommittedResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.planId)
    || !validIdentifier(value.dayId)
  ) {
    throw new PlanImpactInputError("plan_impact_identifier_invalid");
  }
  if (
    !validRevision(value.expectedPlanRevision)
    || !validRevision(value.expectedScheduleRevision)
  ) {
    throw new PlanImpactInputError("plan_impact_revision_invalid");
  }
  if (!PREVIEW_TOKEN_PATTERN.test(value.previewToken)) {
    throw new PlanImpactInputError("plan_impact_preview_stale");
  }
  if (
    value.choice.kind === "replacement_day"
    && !validIdentifier(value.choice.replacementDayId)
  ) {
    throw new PlanImpactInputError("plan_impact_replacement_invalid");
  }
  const replacementDayId = value.choice.kind === "replacement_day"
    ? value.choice.replacementDayId
    : null;
  const committedAtMs = context.nowMs();
  if (!validTime(committedAtMs)) {
    throw new PlanImpactInputError("plan_impact_date_invalid");
  }
  const requestedEffectiveLocalDate = value.choice.kind === "effective_date"
    ? value.choice.effectiveLocalDate
    : null;
  const replayCanonical = Object.freeze({
    operation: "remove_plan_day_with_impact" as const,
    requestId: value.requestId,
    planId: value.planId,
    dayId: value.dayId,
    expectedPlanRevision: value.expectedPlanRevision,
    expectedScheduleRevision: value.expectedScheduleRevision,
    previewToken: value.previewToken,
    choice: value.choice.kind === "effective_date"
      ? Object.freeze({ kind: "effective_date" as const })
      : value.choice,
    requestedEffectiveLocalDate,
  });
  const requestSha256 = await digest(context.sha256, replayCanonical);
  const replay = await context.repository.readCommandResult({
    requestId: value.requestId,
    requestSha256,
  });
  if (replay !== null) {
    return replay;
  }
  const facts = await context.repository.readDayRemoval({
    planId: value.planId,
    dayId: value.dayId,
  });
  if (facts === null) {
    throw new PlanImpactInputError("plan_impact_day_invalid");
  }
  const currentPreview = await buildPreview(context, facts);
  if (
    currentPreview.previewToken !== value.previewToken
    || currentPreview.planRevision !== value.expectedPlanRevision
    || currentPreview.schedule?.revision !== value.expectedScheduleRevision
  ) {
    throw new PlanImpactInputError("plan_impact_preview_stale");
  }
  if (currentPreview.restructuringBlocked) {
    throw new PlanImpactInputError("plan_impact_workout_active");
  }
  if (
    replacementDayId !== null
    && !currentPreview.replacementDays.some(
      ({ id }) => id === replacementDayId,
    )
  ) {
    throw new PlanImpactInputError("plan_impact_replacement_invalid");
  }
  const effectiveLocalDate = commandEffectiveLocalDate(
    currentPreview,
    value.choice,
  );
  const canonicalChoice = value.choice.kind === "effective_date"
    ? Object.freeze({ kind: "effective_date" as const })
    : value.choice;
  const canonical = Object.freeze({
    ...replayCanonical,
    choice: canonicalChoice,
    effectiveLocalDate,
  });
  return postCommit(context, await context.repository.applyDayRemoval({
    ...canonical,
    requestSha256,
    committedAtMs,
    expectedPreview: repositoryPreviewFacts(facts),
  }));
}

function exactOccurrenceIds(
  expected: readonly ExerciseReplacementOccurrenceFacts[],
  actual: readonly ExerciseReplacementOccurrenceFacts[],
): boolean {
  return expected.length === actual.length
    && expected.every((occurrence, index) =>
      occurrence.occurrenceId === actual[index]?.occurrenceId
    );
}

export async function replacePlanExercise(
  context: CommandContext & Readonly<{
    input: ReplacePlanExerciseInput;
  }>,
): Promise<ExerciseReplacementCommandResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.planId)
    || !validIdentifier(value.sourceOccurrenceId)
    || !validIdentifier(value.replacementExerciseId)
  ) {
    throw new PlanImpactInputError("plan_impact_identifier_invalid");
  }
  if (!validRevision(value.expectedPlanRevision)) {
    throw new PlanImpactInputError("plan_impact_revision_invalid");
  }
  if (!PREVIEW_TOKEN_PATTERN.test(value.previewToken)) {
    throw new PlanImpactInputError("plan_impact_preview_stale");
  }
  if (
    !value.review.targets
    || !value.review.warmups
    || !value.review.rest
    || !value.review.progression
    || !value.review.historyImmutable
  ) {
    throw new PlanImpactInputError("plan_impact_review_incomplete");
  }
  const committedAtMs = context.nowMs();
  if (!validTime(committedAtMs)) {
    throw new PlanImpactInputError("plan_impact_date_invalid");
  }
  const replay = await context.repository.readCommittedExerciseReplacement({
    planId: value.planId,
    expectedPlanRevision: value.expectedPlanRevision,
    replacementExerciseId: value.replacementExerciseId,
    occurrences: value.occurrences,
  });
  if (replay !== null) {
    return replay;
  }
  const facts = await context.repository.readExerciseReplacement({
    planId: value.planId,
    occurrenceId: value.sourceOccurrenceId,
  });
  if (facts === null) {
    throw new PlanImpactInputError("plan_impact_replacement_invalid");
  }
  const preview = await buildReplacementPreview(context.sha256, facts);
  if (
    preview.previewToken !== value.previewToken
    || preview.planRevision !== value.expectedPlanRevision
  ) {
    throw new PlanImpactInputError("plan_impact_preview_stale");
  }
  const candidate = preview.candidates.find(
    ({ exerciseId }) => exerciseId === value.replacementExerciseId,
  );
  if (candidate === undefined || !candidate.compatible) {
    throw new PlanImpactInputError(
      "plan_impact_replacement_incompatible",
    );
  }
  const expectedOccurrences = value.scope === "this_occurrence"
    ? preview.occurrences.filter(({ occurrenceId }) =>
        occurrenceId === value.sourceOccurrenceId
      )
    : preview.occurrences;
  if (
    !exactOccurrenceIds(expectedOccurrences, value.occurrences)
    || JSON.stringify(expectedOccurrences)
      !== JSON.stringify(value.occurrences)
  ) {
    throw new PlanImpactInputError(
      "plan_impact_occurrences_incomplete",
    );
  }
  const canonical = Object.freeze({
    operation: "replace_plan_exercise" as const,
    ...value,
    review: Object.freeze({ ...value.review }),
    occurrences: Object.freeze(value.occurrences),
  });
  const result = await context.repository.applyExerciseReplacement({
    ...canonical,
    requestSha256: await digest(context.sha256, canonical),
    sourceExerciseId: preview.sourceExerciseId,
    expectedPreview: replacementPreviewFacts(facts),
    committedAtMs,
  });
  await context.invalidate(result.invalidations).catch(() => undefined);
  return result;
}
