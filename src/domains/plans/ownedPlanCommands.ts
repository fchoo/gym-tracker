import type {
  OwnedPlanRepository,
  OwnedPlanRepositoryResult,
  StagedCreateOwnedPlanDraft,
  StagedDuplicateOwnedPlan,
  StagedOwnedPlanDay,
  StagedOwnedPlanOccurrence,
  StagedOwnedPlanPolicy,
  StagedOwnedPlanTarget,
  StagedOwnedPlanWarmup,
  StagedSaveOwnedPlan,
  StagedSetOwnedPlanArchived,
} from "../../platform/sqlite/repositories/ownedPlanRepository";
import type {
  MetricIdentity,
  MetricTarget,
} from "../metrics";
import {
  getMetricContract,
  parseMetricTarget,
} from "../metrics";

const IDENTIFIER_MAX_CODE_POINTS = 128;
const NAME_MAX_CODE_POINTS = 120;
const DAY_MAX_COUNT = 100;
const OCCURRENCE_MAX_COUNT = 200;
const SET_MAX_COUNT = 100;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export type OwnedPlanWarmupInput = Readonly<{
  id: string;
  ordinal: number;
  loadGrams: number;
  reps: number;
}>;

export type OwnedPlanTargetInput = Readonly<{
  id: string;
  ordinal: number;
  target: MetricTarget;
  units: Readonly<Record<string, unknown>>;
}>;

export type OwnedPlanPolicyInput = Readonly<{
  id: string;
  kind: "automatic" | "manual_hold" | "plan_authored";
  policyId: string;
  version: number;
  rule: Readonly<Record<string, unknown>>;
}>;

export type OwnedPlanOccurrenceInput = Readonly<{
  id: string;
  exerciseId: string;
  ordinal: number;
  restSeconds: number;
  metricIdentity: MetricIdentity;
  warmups: readonly OwnedPlanWarmupInput[];
  targets: readonly OwnedPlanTargetInput[];
  policy: OwnedPlanPolicyInput;
}>;

export type OwnedPlanDayInput = Readonly<{
  id: string;
  name: string;
  ordinal: number;
  occurrences: readonly OwnedPlanOccurrenceInput[];
}>;

export type OwnedPlanDraftInput = Readonly<{
  id: string;
  name: string;
  days: readonly OwnedPlanDayInput[];
}>;

export type CreateOwnedPlanDraftInput = Readonly<{
  requestId: string;
  planId: string;
  name: string;
  dayId: string;
  dayName: string;
  createdAtMs: number;
}>;

export type SaveOwnedPlanInput = Readonly<{
  requestId: string;
  expectedRevision: number;
  savedAtMs: number;
  plan: OwnedPlanDraftInput;
}>;

export type DuplicateOwnedPlanInput = Readonly<{
  requestId: string;
  sourcePlanId: string;
  expectedRevision: number;
  newPlanId: string;
  name: string;
  duplicatedAtMs: number;
}>;

export type SetOwnedPlanArchivedInput = Readonly<{
  requestId: string;
  planId: string;
  expectedRevision: number;
  updatedAtMs: number;
}>;

export type OwnedPlanInputErrorCode =
  | "owned_plan_days_invalid"
  | "owned_plan_hash_invalid"
  | "owned_plan_identifier_invalid"
  | "owned_plan_identity_invalid"
  | "owned_plan_name_invalid"
  | "owned_plan_occurrence_invalid"
  | "owned_plan_order_invalid"
  | "owned_plan_policy_invalid"
  | "owned_plan_rest_invalid"
  | "owned_plan_revision_invalid"
  | "owned_plan_target_invalid"
  | "owned_plan_time_invalid"
  | "owned_plan_warmup_invalid";

export class OwnedPlanInputError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-PLAN02" as const;

  constructor(readonly code: OwnedPlanInputErrorCode) {
    super(code);
    this.name = "OwnedPlanInputError";
  }
}

type CommandContext = Readonly<{
  repository: OwnedPlanRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  sha256(value: string): Promise<string>;
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

function validName(value: string): boolean {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && codePointLength(value) <= NAME_MAX_CODE_POINTS;
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validOrdinal(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validPositive(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function validNonnegative(value: number): boolean {
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

async function requestSha256(
  sha256: (value: string) => Promise<string>,
  value: unknown,
): Promise<string> {
  const digest = await sha256(stableJson(value));
  if (!SHA256_PATTERN.test(digest)) {
    throw new OwnedPlanInputError("owned_plan_hash_invalid");
  }
  return digest;
}

function assertIdentifiersUnique(
  identifiers: readonly string[],
): void {
  if (
    identifiers.some((value) => !validIdentifier(value))
    || new Set(identifiers).size !== identifiers.length
  ) {
    throw new OwnedPlanInputError("owned_plan_identity_invalid");
  }
}

function assertContiguousOrdinals(
  values: readonly Readonly<{ ordinal: number }>[],
): void {
  if (
    values.some(({ ordinal }, index) =>
      !validOrdinal(ordinal) || ordinal !== index
    )
  ) {
    throw new OwnedPlanInputError("owned_plan_order_invalid");
  }
}

function stageWarmups(
  values: readonly OwnedPlanWarmupInput[],
): readonly StagedOwnedPlanWarmup[] {
  if (!Array.isArray(values) || values.length > SET_MAX_COUNT) {
    throw new OwnedPlanInputError("owned_plan_warmup_invalid");
  }
  assertIdentifiersUnique(values.map(({ id }) => id));
  assertContiguousOrdinals(values);
  return Object.freeze(values.map((value) => {
    if (
      !validNonnegative(value.loadGrams)
      || !validPositive(value.reps)
    ) {
      throw new OwnedPlanInputError("owned_plan_warmup_invalid");
    }
    return Object.freeze({ ...value });
  }));
}

function stageTargets(
  identity: MetricIdentity,
  values: readonly OwnedPlanTargetInput[],
): readonly StagedOwnedPlanTarget[] {
  if (
    !Array.isArray(values)
    || values.length === 0
    || values.length > SET_MAX_COUNT
  ) {
    throw new OwnedPlanInputError("owned_plan_target_invalid");
  }
  assertIdentifiersUnique(values.map(({ id }) => id));
  assertContiguousOrdinals(values);
  return Object.freeze(values.map((value) => {
    let target: MetricTarget;
    try {
      target = parseMetricTarget(identity, value.target);
    } catch {
      throw new OwnedPlanInputError("owned_plan_target_invalid");
    }
    if (!isRecord(value.units) || Object.keys(value.units).length === 0) {
      throw new OwnedPlanInputError("owned_plan_target_invalid");
    }
    return Object.freeze({
      id: value.id,
      ordinal: value.ordinal,
      target: Object.freeze({ ...target }),
      units: Object.freeze({ ...value.units }),
    });
  }));
}

function stagePolicy(
  value: OwnedPlanPolicyInput,
): StagedOwnedPlanPolicy {
  if (
    !validIdentifier(value.id)
    || !validIdentifier(value.policyId)
    || !validPositive(value.version)
    || ![
      "automatic",
      "manual_hold",
      "plan_authored",
    ].includes(value.kind)
    || !isRecord(value.rule)
    || Object.keys(value.rule).length === 0
  ) {
    throw new OwnedPlanInputError("owned_plan_policy_invalid");
  }
  return Object.freeze({
    ...value,
    rule: Object.freeze({ ...value.rule }),
  });
}

function stageOccurrence(
  value: OwnedPlanOccurrenceInput,
): StagedOwnedPlanOccurrence {
  if (
    !validIdentifier(value.id)
    || !validIdentifier(value.exerciseId)
    || !validOrdinal(value.ordinal)
    || !validNonnegative(value.restSeconds)
    || value.restSeconds > 86_400
  ) {
    throw new OwnedPlanInputError(
      validNonnegative(value.restSeconds)
        ? "owned_plan_occurrence_invalid"
        : "owned_plan_rest_invalid",
    );
  }
  let identity: MetricIdentity;
  try {
    identity = getMetricContract(value.metricIdentity).identity;
  } catch {
    throw new OwnedPlanInputError("owned_plan_occurrence_invalid");
  }
  return Object.freeze({
    id: value.id,
    exerciseId: value.exerciseId,
    ordinal: value.ordinal,
    restSeconds: value.restSeconds,
    metricIdentity: Object.freeze({ ...identity }),
    warmups: stageWarmups(value.warmups),
    targets: stageTargets(identity, value.targets),
    policy: stagePolicy(value.policy),
  });
}

function stageDays(
  values: readonly OwnedPlanDayInput[],
): readonly StagedOwnedPlanDay[] {
  if (
    !Array.isArray(values)
    || values.length === 0
    || values.length > DAY_MAX_COUNT
  ) {
    throw new OwnedPlanInputError("owned_plan_days_invalid");
  }
  assertIdentifiersUnique(values.map(({ id }) => id));
  assertContiguousOrdinals(values);
  const allIdentifiers: string[] = [];
  const days = values.map((day: OwnedPlanDayInput) => {
    if (
      !validIdentifier(day.id)
      || !validName(day.name)
      || !Array.isArray(day.occurrences)
      || day.occurrences.length > OCCURRENCE_MAX_COUNT
    ) {
      throw new OwnedPlanInputError("owned_plan_days_invalid");
    }
    assertIdentifiersUnique(day.occurrences.map(({ id }) => id));
    assertContiguousOrdinals(day.occurrences);
    const occurrences: readonly StagedOwnedPlanOccurrence[] =
      day.occurrences.map((occurrence) => stageOccurrence(occurrence));
    for (const occurrence of occurrences) {
      allIdentifiers.push(
        occurrence.id,
        ...occurrence.warmups.map(({ id }) => id),
        ...occurrence.targets.map(({ id }) => id),
        occurrence.policy.id,
      );
    }
    return Object.freeze({
      id: day.id,
      name: day.name,
      ordinal: day.ordinal,
      occurrences: Object.freeze(occurrences),
    });
  });
  assertIdentifiersUnique([
    ...values.map(({ id }) => id),
    ...allIdentifiers,
  ]);
  return Object.freeze(days);
}

async function postCommit(
  context: CommandContext,
  result: OwnedPlanRepositoryResult,
): Promise<OwnedPlanRepositoryResult> {
  if (result.outcome === "committed") {
    await context.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

export async function createOwnedPlanDraft(
  context: CommandContext & Readonly<{
    input: CreateOwnedPlanDraftInput;
  }>,
): Promise<OwnedPlanRepositoryResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.planId)
    || !validIdentifier(value.dayId)
  ) {
    throw new OwnedPlanInputError("owned_plan_identifier_invalid");
  }
  if (!validName(value.name) || !validName(value.dayName)) {
    throw new OwnedPlanInputError("owned_plan_name_invalid");
  }
  if (!validTime(value.createdAtMs)) {
    throw new OwnedPlanInputError("owned_plan_time_invalid");
  }
  const canonical = Object.freeze({
    operation: "create" as const,
    ...value,
  });
  const staged: StagedCreateOwnedPlanDraft = Object.freeze({
    ...value,
    requestSha256: await requestSha256(context.sha256, canonical),
  });
  return postCommit(context, await context.repository.createDraft(staged));
}

export async function saveOwnedPlan(
  context: CommandContext & Readonly<{
    input: SaveOwnedPlanInput;
  }>,
): Promise<OwnedPlanRepositoryResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.plan.id)
  ) {
    throw new OwnedPlanInputError("owned_plan_identifier_invalid");
  }
  if (!validRevision(value.expectedRevision)) {
    throw new OwnedPlanInputError("owned_plan_revision_invalid");
  }
  if (!validTime(value.savedAtMs)) {
    throw new OwnedPlanInputError("owned_plan_time_invalid");
  }
  if (!validName(value.plan.name)) {
    throw new OwnedPlanInputError("owned_plan_name_invalid");
  }
  const days = stageDays(value.plan.days);
  const canonical = Object.freeze({
    operation: "save" as const,
    requestId: value.requestId,
    planId: value.plan.id,
    name: value.plan.name,
    expectedRevision: value.expectedRevision,
    savedAtMs: value.savedAtMs,
    days,
  });
  const staged: StagedSaveOwnedPlan = Object.freeze({
    ...canonical,
    requestSha256: await requestSha256(context.sha256, canonical),
  });
  return postCommit(context, await context.repository.save(staged));
}

export async function duplicateOwnedPlan(
  context: CommandContext & Readonly<{
    input: DuplicateOwnedPlanInput;
  }>,
): Promise<OwnedPlanRepositoryResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.sourcePlanId)
    || !validIdentifier(value.newPlanId)
    || value.sourcePlanId === value.newPlanId
  ) {
    throw new OwnedPlanInputError("owned_plan_identifier_invalid");
  }
  if (!validName(value.name)) {
    throw new OwnedPlanInputError("owned_plan_name_invalid");
  }
  if (!validRevision(value.expectedRevision)) {
    throw new OwnedPlanInputError("owned_plan_revision_invalid");
  }
  if (!validTime(value.duplicatedAtMs)) {
    throw new OwnedPlanInputError("owned_plan_time_invalid");
  }
  const canonical = Object.freeze({
    operation: "duplicate" as const,
    ...value,
  });
  const staged: StagedDuplicateOwnedPlan = Object.freeze({
    ...value,
    requestSha256: await requestSha256(context.sha256, canonical),
  });
  return postCommit(context, await context.repository.duplicate(staged));
}

async function setArchived(
  context: CommandContext & Readonly<{
    input: SetOwnedPlanArchivedInput;
  }>,
  archived: boolean,
): Promise<OwnedPlanRepositoryResult> {
  const value = context.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.planId)
  ) {
    throw new OwnedPlanInputError("owned_plan_identifier_invalid");
  }
  if (!validRevision(value.expectedRevision)) {
    throw new OwnedPlanInputError("owned_plan_revision_invalid");
  }
  if (!validTime(value.updatedAtMs)) {
    throw new OwnedPlanInputError("owned_plan_time_invalid");
  }
  const operation = archived ? "archive" as const : "restore" as const;
  const canonical = Object.freeze({
    operation,
    ...value,
  });
  const staged: StagedSetOwnedPlanArchived = Object.freeze({
    ...value,
    archived,
    requestSha256: await requestSha256(context.sha256, canonical),
  });
  return postCommit(
    context,
    archived
      ? await context.repository.archive(staged)
      : await context.repository.restore(staged),
  );
}

export function archiveOwnedPlan(
  context: CommandContext & Readonly<{
    input: SetOwnedPlanArchivedInput;
  }>,
): Promise<OwnedPlanRepositoryResult> {
  return setArchived(context, true);
}

export function restoreOwnedPlan(
  context: CommandContext & Readonly<{
    input: SetOwnedPlanArchivedInput;
  }>,
): Promise<OwnedPlanRepositoryResult> {
  return setArchived(context, false);
}
