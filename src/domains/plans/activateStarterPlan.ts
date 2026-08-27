import type { FullBodyFoundation } from "../content";
import {
  METRIC_PROFILES,
  MetricIdentitySchema,
  parseMetricTarget,
  type MetricIdentity,
  type MetricTarget,
} from "../metrics";
import {
  validateInitialScheduleActivation,
  type InitialScheduleActivation,
  type InitialScheduleActivationInput,
  type InitialRotationScheduleBinding,
  type InitialWeekdayScheduleBinding,
} from "../scheduling";
import type {
  PlansRepository,
  StarterActivation,
} from "./index";

export type LegacyActivateStarterPlanInput = Readonly<{
  fixture: FullBodyFoundation;
  repository: PlansRepository;
  activatedAtMs: number;
  startLocalDate: string;
  timezone: string;
}>;

export const ACCEPTED_STARTER_ASSET_SHA256 =
  "8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4";
export const ACCEPTED_STARTER_ACCEPTANCE_SHA256 =
  "22052f2e1dbda90122d141e5d2888a3e7579d77c92be395a36bd5fb1ebe3f2e5";
export const ACCEPTED_STARTER_NAMESPACE =
  "gym-tracker.starter-plans" as const;

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type StarterWeekday = (typeof WEEKDAYS)[number];

export type AcceptedStarterWarmup = Readonly<{
  ordinal: number;
  loadGrams: number;
  reps: number;
}>;

export type AcceptedStarterPolicy = Readonly<{
  kind: "automatic" | "manual_hold" | "plan_authored";
  id: string;
  version: number;
  decisionRule: string;
  reviewStatus: "pending_owner_acceptance";
}>;

export type AcceptedStarterOccurrence = Readonly<{
  id: string;
  ordinal: number;
  exerciseId: string;
  catalogName: string;
  metricIdentity: MetricIdentity;
  target: MetricTarget & Readonly<{ plannedSets: number }>;
  warmups: readonly AcceptedStarterWarmup[];
  restSeconds: number;
  policy: AcceptedStarterPolicy;
  contentRationale: string;
  catalogMetricIdentity: MetricIdentity;
  metricOverride: Readonly<{
    fromCatalog: MetricIdentity;
    toPlanOccurrence: MetricIdentity;
    rationale: string;
    reviewStatus: "pending_owner_acceptance";
  }> | null;
}>;

export type AcceptedStarterDay = Readonly<{
  id: string;
  ordinal: number;
  displayName: string;
  exercises: readonly AcceptedStarterOccurrence[];
}>;

export type AcceptedStarterWeekdaySuggestion = Readonly<{
  mode: "weekday";
  cycleWeeks: readonly (readonly Readonly<{
    weekday: StarterWeekday;
    dayId: string;
  }>[])[];
}>;

export type AcceptedStarterRotationSuggestion = Readonly<{
  mode: "rotation";
  rotation: readonly string[];
}>;

export type AcceptedStarterTemplate = Readonly<{
  id: string;
  revision: number;
  ordinal: number;
  displayName: string;
  goal: string;
  experience: string;
  audience: string;
  equipment: readonly string[];
  estimatedDurationMinutes: number;
  daysPerWeek: number;
  scheduleSuggestion:
    | AcceptedStarterWeekdaySuggestion
    | AcceptedStarterRotationSuggestion;
  progressionSummary: string;
  sourceNotes: readonly Readonly<{
    id: string;
    text: string;
    provenance: string;
    reviewStatus: "pending_owner_acceptance";
  }>[];
  days: readonly AcceptedStarterDay[];
  sourceJson: string;
}>;

export type AcceptedStarterPack = Readonly<{
  assetSha256: typeof ACCEPTED_STARTER_ASSET_SHA256;
  acceptanceSha256: typeof ACCEPTED_STARTER_ACCEPTANCE_SHA256;
  namespace: typeof ACCEPTED_STARTER_NAMESPACE;
  revision: 2;
  acceptedAtMs: number;
  templates: readonly AcceptedStarterTemplate[];
}>;

export type StarterPlanCopyChoice =
  | Readonly<{ type: "create_another" }>
  | Readonly<{
      type: "reactivate_existing";
      planId: string;
      expectedPlanRevision: number;
      expectedScheduleRevision: number;
    }>;

export type AcceptedScheduleBinding =
  | Readonly<{
      planDayId: string;
      sourcePlanDayId: string;
      ordinal: number;
      weekIndex: number;
      weekday: StarterWeekday;
    }>
  | Readonly<{
      planDayId: string;
      sourcePlanDayId: string;
      ordinal: number;
    }>;

export type AcceptedStarterPlanActivation = Readonly<{
  outcome: "committed";
  plan: Readonly<{
    id: string;
    name: string;
    sourceTemplateId: string;
    sourceRevision: number;
    isActive: true;
    revision: number;
  }>;
  days: readonly Readonly<{
    id: string;
    sourceDayId: string;
    name: string;
    ordinal: number;
    occurrenceCount: number;
  }>[];
  schedule: Readonly<{
    id: string;
    lifecycle: "active";
    revision: number;
    version: Readonly<{
      id: string;
      versionNumber: number;
      effectiveLocalDate: string;
      mode: "weekday" | "rotation";
      timeZone: string;
      bindings: readonly AcceptedScheduleBinding[];
    }>;
  }>;
  invalidationScopes: readonly (
    | Readonly<{ scope: "library-plans" | "today" }>
    | Readonly<{ scope: "plan-detail"; planId: string }>
  )[];
}>;

export type AcceptedStarterPlanCopy = Readonly<{
  outcome: "committed";
  sourceOwnedPlanId: string;
  plan: Readonly<{
    id: string;
    name: string;
    sourceTemplateId: string;
    sourceRevision: number;
    isActive: false;
    revision: number;
  }>;
  days: AcceptedStarterPlanActivation["days"];
  schedule: Readonly<{
    id: string;
    lifecycle: "inactive";
    revision: number;
    version: AcceptedStarterPlanActivation["schedule"]["version"];
  }>;
  invalidationScopes: readonly (
    | Readonly<{ scope: "library-plans" }>
    | Readonly<{ scope: "plan-detail"; planId: string }>
  )[];
}>;

export type AcceptedStarterPlanRepositoryInput = Readonly<{
  pack: AcceptedStarterPack;
  template: AcceptedStarterTemplate;
  assetSha256: typeof ACCEPTED_STARTER_ASSET_SHA256;
  requestId: string;
  requestSha256: string;
  activatedAtMs: number;
  expectedActiveScheduleRevision: number | null;
  copyChoice: StarterPlanCopyChoice | null;
  schedule: InitialScheduleActivation;
}>;

export type AcceptedStarterPlanCopyRepositoryInput = Readonly<{
  pack: AcceptedStarterPack;
  template: AcceptedStarterTemplate;
  assetSha256: typeof ACCEPTED_STARTER_ASSET_SHA256;
  requestId: string;
  requestSha256: string;
  createdAtMs: number;
  sourceOwnedPlanId: string;
  expectedSourcePlanRevision: number;
  expectedActiveScheduleRevision: number | null;
  schedule: InitialScheduleActivation;
}>;

export interface AcceptedStarterPlanRepository {
  activateAcceptedStarterPlan(
    input: AcceptedStarterPlanRepositoryInput,
  ): Promise<AcceptedStarterPlanActivation>;
  createAcceptedStarterPlanCopy(
    input: AcceptedStarterPlanCopyRepositoryInput,
  ): Promise<AcceptedStarterPlanCopy>;
}

export type AcceptedActivateStarterPlanInput =
  & Readonly<{
    kind: "accepted";
    starterPackBytes: string;
    acceptanceBytes: string;
    sha256(value: string): Promise<string>;
    repository: AcceptedStarterPlanRepository;
    requestId: string;
    activatedAtMs: number;
    expectedActiveScheduleRevision: number | null;
    confirmationToken: string;
    templateId: string;
    templateRevision: number;
    copyChoice: StarterPlanCopyChoice | null;
  }>
  & InitialScheduleActivationInput;

export type ActivateStarterPlanInput =
  | LegacyActivateStarterPlanInput
  | AcceptedActivateStarterPlanInput;

export type AcceptedCreateStarterPlanCopyInput =
  & Readonly<{
    starterPackBytes: string;
    acceptanceBytes: string;
    sha256(value: string): Promise<string>;
    repository: AcceptedStarterPlanRepository;
    requestId: string;
    createdAtMs: number;
    sourceOwnedPlanId: string;
    expectedSourcePlanRevision: number;
    expectedActiveScheduleRevision: number | null;
    templateId: string;
    templateRevision: number;
  }>
  & InitialScheduleActivationInput;

export type AcceptedStarterPlanActivationErrorCode =
  | "starter_acceptance_hash_mismatch"
  | "starter_acceptance_invalid"
  | "starter_activation_input_invalid"
  | "starter_asset_hash_mismatch"
  | "starter_confirmation_invalid"
  | "starter_pack_invalid"
  | "starter_revision_mismatch"
  | "starter_template_not_found";

export class AcceptedStarterPlanActivationError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-ACTIVATE02" as const;

  constructor(readonly code: AcceptedStarterPlanActivationErrorCode) {
    super(code);
    this.name = "AcceptedStarterPlanActivationError";
  }
}

type ParseAcceptedStarterPlanPackInput = Readonly<{
  starterPackBytes: string;
  acceptanceBytes: string;
  sha256(value: string): Promise<string>;
}>;

type RawStarterPack = Readonly<{
  schemaVersion: unknown;
  metadata?: Record<string, unknown>;
  templates?: unknown;
}>;

type RawAcceptance = Readonly<{
  schemaVersion?: unknown;
  accepted?: unknown;
  reviewer?: unknown;
  reviewerResponse?: unknown;
  reviewedAt?: unknown;
  assetSha256?: unknown;
  counts?: Record<string, unknown>;
}>;

function parseJson(
  bytes: string,
  code: "starter_acceptance_invalid" | "starter_pack_invalid",
): unknown {
  try {
    return JSON.parse(bytes);
  } catch {
    throw new AcceptedStarterPlanActivationError(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validBoundedText(value: unknown, maximum = 240): value is string {
  return typeof value === "string"
    && value.trim() === value
    && value.length >= 1
    && value.length <= maximum;
}

function validIdentifier(value: unknown): value is string {
  return validBoundedText(value, 128) && IDENTIFIER_PATTERN.test(value);
}

function validPolicyIdentifier(value: unknown): value is string {
  return validBoundedText(value, 128)
    && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(value);
}

function validPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function validNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function invalidPack(): never {
  throw new AcceptedStarterPlanActivationError("starter_pack_invalid");
}

function parseMetricIdentityValue(input: unknown): MetricIdentity {
  const result = MetricIdentitySchema.safeParse(input);
  if (!result.success) {
    return invalidPack();
  }
  return result.data;
}

function parseTarget(
  identity: MetricIdentity,
  input: unknown,
): MetricTarget & Readonly<{ plannedSets: number }> {
  if (!isRecord(input) || !validPositiveInteger(input.plannedSets)) {
    return invalidPack();
  }
  const { plannedSets, ...targetInput } = input;
  let target: MetricTarget;
  try {
    target = parseMetricTarget(identity, targetInput);
  } catch {
    return invalidPack();
  }
  return {
    ...target,
    plannedSets,
  };
}

function parseWarmups(input: unknown): readonly AcceptedStarterWarmup[] {
  if (!Array.isArray(input)) {
    return invalidPack();
  }
  return input.map((raw, index) => {
    if (
      !isRecord(raw)
      || raw.ordinal !== index + 1
      || !validNonnegativeInteger(raw.loadGrams)
      || !validPositiveInteger(raw.reps)
    ) {
      return invalidPack();
    }
    return {
      ordinal: raw.ordinal,
      loadGrams: raw.loadGrams,
      reps: raw.reps,
    };
  });
}

function parsePolicy(input: unknown): AcceptedStarterPolicy {
  if (
    !isRecord(input)
    || !["automatic", "manual_hold", "plan_authored"].includes(
      String(input.kind),
    )
    || !validPolicyIdentifier(input.id)
    || !validPositiveInteger(input.version)
    || !validBoundedText(input.decisionRule, 600)
    || input.reviewStatus !== "pending_owner_acceptance"
  ) {
    return invalidPack();
  }
  return {
    kind: input.kind as AcceptedStarterPolicy["kind"],
    id: input.id,
    version: input.version,
    decisionRule: input.decisionRule,
    reviewStatus: input.reviewStatus,
  };
}

function parseMetricOverride(
  input: unknown,
  catalogIdentity: MetricIdentity,
  occurrenceIdentity: MetricIdentity,
): AcceptedStarterOccurrence["metricOverride"] {
  if (input === null) {
    if (
      JSON.stringify(catalogIdentity) !== JSON.stringify(occurrenceIdentity)
    ) {
      return invalidPack();
    }
    return null;
  }
  if (
    !isRecord(input)
    || !validBoundedText(input.rationale, 600)
    || input.reviewStatus !== "pending_owner_acceptance"
  ) {
    return invalidPack();
  }
  const fromCatalog = parseMetricIdentityValue(input.fromCatalog);
  const toPlanOccurrence = parseMetricIdentityValue(input.toPlanOccurrence);
  if (
    JSON.stringify(fromCatalog) !== JSON.stringify(catalogIdentity)
    || JSON.stringify(toPlanOccurrence) !== JSON.stringify(occurrenceIdentity)
  ) {
    return invalidPack();
  }
  return {
    fromCatalog,
    toPlanOccurrence,
    rationale: input.rationale,
    reviewStatus: input.reviewStatus,
  };
}

function parseOccurrence(
  input: unknown,
  expectedOrdinal: number,
  occurrenceIds: Set<string>,
): AcceptedStarterOccurrence {
  if (
    !isRecord(input)
    || !validIdentifier(input.id)
    || occurrenceIds.has(input.id)
    || input.ordinal !== expectedOrdinal
    || !validBoundedText(input.exerciseId)
    || !validBoundedText(input.catalogName)
    || !validNonnegativeInteger(input.restSeconds)
    || !validBoundedText(input.contentRationale, 600)
    || !isRecord(input.substitutionDecision)
    || input.substitutionDecision.status !== "no_substitution"
    || !Array.isArray(input.substitutionDecision.substitutions)
    || input.substitutionDecision.substitutions.length !== 0
  ) {
    return invalidPack();
  }
  occurrenceIds.add(input.id);
  const metricIdentity = parseMetricIdentityValue(input.metricIdentity);
  const catalogMetricIdentity = parseMetricIdentityValue(
    input.catalogMetricIdentity,
  );
  return {
    id: input.id,
    ordinal: input.ordinal,
    exerciseId: input.exerciseId,
    catalogName: input.catalogName,
    metricIdentity,
    target: parseTarget(metricIdentity, input.target),
    warmups: parseWarmups(input.warmups),
    restSeconds: input.restSeconds,
    policy: parsePolicy(input.policy),
    contentRationale: input.contentRationale,
    catalogMetricIdentity,
    metricOverride: parseMetricOverride(
      input.metricOverride,
      catalogMetricIdentity,
      metricIdentity,
    ),
  };
}

function parseDays(input: unknown): readonly AcceptedStarterDay[] {
  if (!Array.isArray(input) || input.length === 0) {
    return invalidPack();
  }
  const dayIds = new Set<string>();
  const occurrenceIds = new Set<string>();
  return input.map((raw, index) => {
    if (
      !isRecord(raw)
      || !validIdentifier(raw.id)
      || dayIds.has(raw.id)
      || raw.ordinal !== index + 1
      || !validBoundedText(raw.displayName)
      || !Array.isArray(raw.exercises)
      || raw.exercises.length === 0
    ) {
      return invalidPack();
    }
    dayIds.add(raw.id);
    return {
      id: raw.id,
      ordinal: raw.ordinal,
      displayName: raw.displayName,
      exercises: raw.exercises.map((occurrence, occurrenceIndex) =>
        parseOccurrence(occurrence, occurrenceIndex + 1, occurrenceIds)
      ),
    };
  });
}

function parseScheduleSuggestion(
  input: unknown,
  dayIds: ReadonlySet<string>,
): AcceptedStarterTemplate["scheduleSuggestion"] {
  if (!isRecord(input)) {
    return invalidPack();
  }
  if (input.mode === "rotation") {
    if (
      !Array.isArray(input.rotation)
      || input.rotation.length === 0
      || input.rotation.some((dayId) =>
        !validIdentifier(dayId) || !dayIds.has(dayId)
      )
      || new Set(input.rotation).size !== input.rotation.length
    ) {
      return invalidPack();
    }
    return {
      mode: input.mode,
      rotation: input.rotation as string[],
    };
  }
  if (
    input.mode !== "weekday"
    || !Array.isArray(input.cycleWeeks)
    || input.cycleWeeks.length === 0
  ) {
    return invalidPack();
  }
  const cycleWeeks = input.cycleWeeks.map((rawWeek) => {
    if (!Array.isArray(rawWeek) || rawWeek.length === 0) {
      return invalidPack();
    }
    const weekdays = new Set<string>();
    return rawWeek.map((rawBinding) => {
      if (
        !isRecord(rawBinding)
        || !WEEKDAYS.includes(rawBinding.weekday as StarterWeekday)
        || weekdays.has(String(rawBinding.weekday))
        || !validIdentifier(rawBinding.dayId)
        || !dayIds.has(rawBinding.dayId)
      ) {
        return invalidPack();
      }
      weekdays.add(rawBinding.weekday as string);
      return {
        weekday: rawBinding.weekday as StarterWeekday,
        dayId: rawBinding.dayId,
      };
    });
  });
  return {
    mode: input.mode,
    cycleWeeks,
  };
}

function parseSourceNotes(
  input: unknown,
): AcceptedStarterTemplate["sourceNotes"] {
  if (!Array.isArray(input) || input.length === 0) {
    return invalidPack();
  }
  return input.map((raw) => {
    if (
      !isRecord(raw)
      || !validIdentifier(raw.id)
      || !validBoundedText(raw.text, 600)
      || !validIdentifier(raw.provenance)
      || raw.reviewStatus !== "pending_owner_acceptance"
    ) {
      return invalidPack();
    }
    return {
      id: raw.id,
      text: raw.text,
      provenance: raw.provenance,
      reviewStatus: raw.reviewStatus,
    };
  });
}

function parseTemplate(
  input: unknown,
  expectedOrdinal: number,
  templateIds: Set<string>,
): AcceptedStarterTemplate {
  if (
    !isRecord(input)
    || !validIdentifier(input.id)
    || templateIds.has(input.id)
    || input.revision !== 2
    || input.ordinal !== expectedOrdinal
    || !validBoundedText(input.displayName)
    || !validBoundedText(input.goal, 240)
    || !validIdentifier(input.experience)
    || !validBoundedText(input.audience, 240)
    || !Array.isArray(input.equipment)
    || input.equipment.some((value) => !validIdentifier(value))
    || !validPositiveInteger(input.estimatedDurationMinutes)
    || !validPositiveInteger(input.daysPerWeek)
    || !validBoundedText(input.progressionSummary, 600)
    || input.reviewStatus !== "pending_owner_acceptance"
    || input.authorityStatus !== "candidate_not_accepted"
  ) {
    return invalidPack();
  }
  templateIds.add(input.id);
  const days = parseDays(input.days);
  return {
    id: input.id,
    revision: input.revision,
    ordinal: input.ordinal,
    displayName: input.displayName,
    goal: input.goal,
    experience: input.experience,
    audience: input.audience,
    equipment: input.equipment as string[],
    estimatedDurationMinutes: input.estimatedDurationMinutes,
    daysPerWeek: input.daysPerWeek,
    scheduleSuggestion: parseScheduleSuggestion(
      input.scheduleSuggestion,
      new Set(days.map(({ id }) => id)),
    ),
    progressionSummary: input.progressionSummary,
    sourceNotes: parseSourceNotes(input.sourceNotes),
    days,
    sourceJson: JSON.stringify(input),
  };
}

function assertPackSemantics(
  packInput: unknown,
  acceptanceInput: unknown,
): Readonly<{
  acceptedAtMs: number;
  templates: readonly AcceptedStarterTemplate[];
}> {
  if (
    !isRecord(packInput)
    || packInput.schemaVersion !== 2
    || !isRecord(packInput.metadata)
    || packInput.metadata.namespace !== ACCEPTED_STARTER_NAMESPACE
    || packInput.metadata.revision !== 2
    || !isRecord(packInput.metadata.counts)
    || !Array.isArray(packInput.templates)
    || !isRecord(acceptanceInput)
    || acceptanceInput.schemaVersion !== 2
    || acceptanceInput.accepted !== true
    || acceptanceInput.reviewer !== "owner"
    || acceptanceInput.reviewerResponse !== "approved"
    || acceptanceInput.assetSha256 !== ACCEPTED_STARTER_ASSET_SHA256
    || !validBoundedText(acceptanceInput.reviewedAt)
    || !isRecord(acceptanceInput.counts)
  ) {
    return invalidPack();
  }
  const acceptedAtMs = Date.parse(acceptanceInput.reviewedAt);
  if (!Number.isSafeInteger(acceptedAtMs) || acceptedAtMs < 0) {
    return invalidPack();
  }
  const templateIds = new Set<string>();
  const templates = packInput.templates.map((template, index) =>
    parseTemplate(template, index + 1, templateIds)
  );
  const days = templates.flatMap(({ days: templateDays }) => templateDays);
  const occurrences = days.flatMap(({ exercises }) => exercises);
  const profiles = new Set(
    occurrences.map(({ metricIdentity }) => metricIdentity.profile),
  );
  const expectedCounts = {
    templates: templates.length,
    days: days.length,
    exercises: occurrences.length,
    profiles: profiles.size,
  };
  const acceptedCounts = acceptanceInput.counts;
  const packCounts = packInput.metadata.counts;
  if (
    templates.length !== 6
    || expectedCounts.days !== 20
    || expectedCounts.exercises !== 69
    || expectedCounts.profiles !== METRIC_PROFILES.length
    || packCounts.templates !== expectedCounts.templates
    || packCounts.days !== expectedCounts.days
    || packCounts.exercises !== expectedCounts.exercises
    || packCounts.profiles !== expectedCounts.profiles
    || packCounts.substitutions !== 0
    || packCounts.unresolved !== 0
    || packCounts.inferred !== 0
    || acceptedCounts.templates !== expectedCounts.templates
    || acceptedCounts.days !== expectedCounts.days
    || acceptedCounts.exerciseDecisions !== expectedCounts.exercises
    || acceptedCounts.profiles !== expectedCounts.profiles
    || acceptedCounts.substitutions !== 0
    || acceptedCounts.unresolved !== 0
    || acceptedCounts.inferred !== 0
  ) {
    return invalidPack();
  }

  const bodyPart = templates.find(({ id }) => id === "gym-body-part-split");
  if (
    bodyPart === undefined
    || bodyPart.scheduleSuggestion.mode !== "weekday"
    || bodyPart.days.map(({ displayName }) => displayName).join("|")
      !== "Chest|Back|Shoulders|Legs|Arms"
    || bodyPart.days.some(({ exercises }) => exercises.length !== 4)
    || bodyPart.days.flatMap(({ exercises }) => exercises).some(
      ({ metricIdentity, metricOverride }) =>
        metricIdentity.profile !== "load_reps" || metricOverride !== null,
    )
  ) {
    return invalidPack();
  }
  return { acceptedAtMs, templates };
}

export async function parseAcceptedStarterPlanPack(
  input: ParseAcceptedStarterPlanPackInput,
): Promise<AcceptedStarterPack> {
  const [assetSha256, acceptanceSha256] = await Promise.all([
    input.sha256(input.starterPackBytes),
    input.sha256(input.acceptanceBytes),
  ]);
  if (assetSha256 !== ACCEPTED_STARTER_ASSET_SHA256) {
    throw new AcceptedStarterPlanActivationError(
      "starter_asset_hash_mismatch",
    );
  }
  if (acceptanceSha256 !== ACCEPTED_STARTER_ACCEPTANCE_SHA256) {
    throw new AcceptedStarterPlanActivationError(
      "starter_acceptance_hash_mismatch",
    );
  }
  const packInput = parseJson(input.starterPackBytes, "starter_pack_invalid");
  const acceptanceInput = parseJson(
    input.acceptanceBytes,
    "starter_acceptance_invalid",
  );
  const { acceptedAtMs, templates } = assertPackSemantics(
    packInput as RawStarterPack,
    acceptanceInput as RawAcceptance,
  );
  return {
    assetSha256: ACCEPTED_STARTER_ASSET_SHA256,
    acceptanceSha256: ACCEPTED_STARTER_ACCEPTANCE_SHA256,
    namespace: ACCEPTED_STARTER_NAMESPACE,
    revision: 2,
    acceptedAtMs,
    templates,
  };
}

type ConfirmationPreview = Readonly<{
  assetSha256: string;
  templateId: string;
  templateRevision: number;
  startLocalDate: string;
  timeZone: string;
  mode: "weekday" | "rotation";
  bindings:
    | readonly InitialWeekdayScheduleBinding[]
    | readonly InitialRotationScheduleBinding[];
  copyChoice: StarterPlanCopyChoice | null;
}>;

function canonicalCopyChoice(
  copyChoice: StarterPlanCopyChoice | null,
): unknown {
  if (copyChoice === null || copyChoice.type === "create_another") {
    return copyChoice;
  }
  return {
    type: copyChoice.type,
    planId: copyChoice.planId,
    expectedPlanRevision: copyChoice.expectedPlanRevision,
    expectedScheduleRevision: copyChoice.expectedScheduleRevision,
  };
}

function canonicalPreview(input: ConfirmationPreview): unknown {
  return {
    assetSha256: input.assetSha256,
    templateId: input.templateId,
    templateRevision: input.templateRevision,
    startLocalDate: input.startLocalDate,
    timeZone: input.timeZone,
    mode: input.mode,
    bindings: input.bindings.map((binding) => ({ ...binding })),
    copyChoice: canonicalCopyChoice(input.copyChoice),
  };
}

export function createStarterPlanActivationConfirmationToken(
  input: ConfirmationPreview,
): string {
  return `starter-confirmation:v1:${JSON.stringify(canonicalPreview(input))}`;
}

function validRequestInput(input: AcceptedActivateStarterPlanInput): boolean {
  return validBoundedText(input.requestId, 128)
    && Number.isSafeInteger(input.activatedAtMs)
    && input.activatedAtMs >= 0
    && (
      input.expectedActiveScheduleRevision === null
      || (
        Number.isSafeInteger(input.expectedActiveScheduleRevision)
        && input.expectedActiveScheduleRevision >= 1
      )
    );
}

function canonicalRequest(
  input: AcceptedActivateStarterPlanInput,
  schedule: InitialScheduleActivation,
): string {
  return JSON.stringify({
    requestId: input.requestId,
    activatedAtMs: input.activatedAtMs,
    expectedActiveScheduleRevision: input.expectedActiveScheduleRevision,
    preview: canonicalPreview({
      assetSha256: ACCEPTED_STARTER_ASSET_SHA256,
      templateId: input.templateId,
      templateRevision: input.templateRevision,
      startLocalDate: schedule.startLocalDate,
      timeZone: schedule.timeZone,
      mode: schedule.mode,
      bindings: schedule.bindings,
      copyChoice: input.copyChoice,
    }),
  });
}

async function activateAcceptedStarterPlan(
  input: AcceptedActivateStarterPlanInput,
): Promise<AcceptedStarterPlanActivation> {
  if (!validRequestInput(input)) {
    throw new AcceptedStarterPlanActivationError(
      "starter_activation_input_invalid",
    );
  }
  const pack = await parseAcceptedStarterPlanPack({
    starterPackBytes: input.starterPackBytes,
    acceptanceBytes: input.acceptanceBytes,
    sha256: input.sha256,
  });
  const template = pack.templates.find(({ id }) => id === input.templateId);
  if (template === undefined) {
    throw new AcceptedStarterPlanActivationError(
      "starter_template_not_found",
    );
  }
  if (input.templateRevision !== template.revision) {
    throw new AcceptedStarterPlanActivationError(
      "starter_revision_mismatch",
    );
  }
  const schedule = validateInitialScheduleActivation({
    startLocalDate: input.startLocalDate,
    timeZone: input.timeZone,
    mode: input.mode,
    bindings: input.bindings as never,
  } as InitialScheduleActivationInput);
  const templateDayIds = new Set(template.days.map(({ id }) => id));
  if (
    schedule.bindings.some(({ planDaySourceId }) =>
      !templateDayIds.has(planDaySourceId)
    )
  ) {
    throw new AcceptedStarterPlanActivationError(
      "starter_activation_input_invalid",
    );
  }
  const confirmationToken = createStarterPlanActivationConfirmationToken({
    assetSha256: pack.assetSha256,
    templateId: template.id,
    templateRevision: template.revision,
    startLocalDate: schedule.startLocalDate,
    timeZone: schedule.timeZone,
    mode: schedule.mode,
    bindings: schedule.bindings,
    copyChoice: input.copyChoice,
  });
  if (input.confirmationToken !== confirmationToken) {
    throw new AcceptedStarterPlanActivationError(
      "starter_confirmation_invalid",
    );
  }
  const requestSha256 = await input.sha256(canonicalRequest(input, schedule));
  if (!SHA256_PATTERN.test(requestSha256)) {
    throw new AcceptedStarterPlanActivationError(
      "starter_activation_input_invalid",
    );
  }
  return input.repository.activateAcceptedStarterPlan({
    pack,
    template,
    assetSha256: pack.assetSha256,
    requestId: input.requestId,
    requestSha256,
    activatedAtMs: input.activatedAtMs,
    expectedActiveScheduleRevision: input.expectedActiveScheduleRevision,
    copyChoice: input.copyChoice,
    schedule,
  });
}

export async function createStarterPlanCopy(
  input: AcceptedCreateStarterPlanCopyInput,
): Promise<AcceptedStarterPlanCopy> {
  if (
    !validBoundedText(input.requestId, 128)
    || !validBoundedText(input.sourceOwnedPlanId, 128)
    || !Number.isSafeInteger(input.createdAtMs)
    || input.createdAtMs < 0
    || !Number.isSafeInteger(input.expectedSourcePlanRevision)
    || input.expectedSourcePlanRevision < 1
    || (
      input.expectedActiveScheduleRevision !== null
      && (
        !Number.isSafeInteger(input.expectedActiveScheduleRevision)
        || input.expectedActiveScheduleRevision < 1
      )
    )
  ) {
    throw new AcceptedStarterPlanActivationError(
      "starter_activation_input_invalid",
    );
  }
  const pack = await parseAcceptedStarterPlanPack({
    starterPackBytes: input.starterPackBytes,
    acceptanceBytes: input.acceptanceBytes,
    sha256: input.sha256,
  });
  const template = pack.templates.find(({ id }) => id === input.templateId);
  if (template === undefined) {
    throw new AcceptedStarterPlanActivationError(
      "starter_template_not_found",
    );
  }
  if (input.templateRevision !== template.revision) {
    throw new AcceptedStarterPlanActivationError(
      "starter_revision_mismatch",
    );
  }
  const schedule = validateInitialScheduleActivation({
    startLocalDate: input.startLocalDate,
    timeZone: input.timeZone,
    mode: input.mode,
    bindings: input.bindings as never,
  } as InitialScheduleActivationInput);
  const templateDayIds = new Set(template.days.map(({ id }) => id));
  if (
    schedule.bindings.some(({ planDaySourceId }) =>
      !templateDayIds.has(planDaySourceId)
    )
  ) {
    throw new AcceptedStarterPlanActivationError(
      "starter_activation_input_invalid",
    );
  }
  const requestSha256 = await input.sha256(JSON.stringify({
    requestId: input.requestId,
    createdAtMs: input.createdAtMs,
    sourceOwnedPlanId: input.sourceOwnedPlanId,
    expectedSourcePlanRevision: input.expectedSourcePlanRevision,
    expectedActiveScheduleRevision: input.expectedActiveScheduleRevision,
    preview: canonicalPreview({
      assetSha256: pack.assetSha256,
      templateId: template.id,
      templateRevision: template.revision,
      startLocalDate: schedule.startLocalDate,
      timeZone: schedule.timeZone,
      mode: schedule.mode,
      bindings: schedule.bindings,
      copyChoice: null,
    }),
  }));
  if (!SHA256_PATTERN.test(requestSha256)) {
    throw new AcceptedStarterPlanActivationError(
      "starter_activation_input_invalid",
    );
  }
  return input.repository.createAcceptedStarterPlanCopy({
    pack,
    template,
    assetSha256: pack.assetSha256,
    requestId: input.requestId,
    requestSha256,
    createdAtMs: input.createdAtMs,
    sourceOwnedPlanId: input.sourceOwnedPlanId,
    expectedSourcePlanRevision: input.expectedSourcePlanRevision,
    expectedActiveScheduleRevision: input.expectedActiveScheduleRevision,
    schedule,
  });
}

function activateLegacyStarterPlan(
  input: LegacyActivateStarterPlanInput,
): Promise<StarterActivation> {
  if (
    !Number.isSafeInteger(input.activatedAtMs)
    || input.activatedAtMs < 0
    || !LOCAL_DATE_PATTERN.test(input.startLocalDate)
    || input.timezone.trim().length === 0
  ) {
    throw new TypeError("starter_activation_invalid");
  }
  return input.repository.activateStarterPlan({
    fixture: input.fixture,
    activatedAtMs: input.activatedAtMs,
    startLocalDate: input.startLocalDate,
    timezone: input.timezone,
  });
}

export function activateStarterPlan(
  input: AcceptedActivateStarterPlanInput,
): Promise<AcceptedStarterPlanActivation>;
export function activateStarterPlan(
  input: LegacyActivateStarterPlanInput,
): Promise<StarterActivation>;
export function activateStarterPlan(
  input: ActivateStarterPlanInput,
): Promise<StarterActivation | AcceptedStarterPlanActivation> {
  return "kind" in input
    ? activateAcceptedStarterPlan(input)
    : activateLegacyStarterPlan(input);
}
