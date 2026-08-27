import type {
  DayRemovalRepositoryPreview,
  ExerciseReplacementCommittedResult,
  ExerciseReplacementOccurrenceFacts,
  ExerciseReplacementRepositoryPreview,
  PlanImpactCommittedResult,
  PlanImpactRepository,
} from "../../platform/sqlite/repositories/planImpactRepository";
import type {
  MetricIdentity,
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

const IDENTIFIER_MAX_CODE_POINTS = 128;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PREVIEW_TOKEN_PATTERN = /^plan-impact-v1:[a-f0-9]{64}$/u;

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
