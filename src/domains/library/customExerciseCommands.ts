import type {
  CustomExerciseArchiveMutationResult,
  CustomExerciseArchivePreview,
  CustomExerciseCopyResult,
  CustomExerciseFavoriteResult,
  CustomExerciseHiddenResult,
  CustomExerciseMutationResult,
  CustomExerciseRepository,
  StagedCreateCustomCopy,
  StagedCreateCustomExercise,
  StagedEditCustomExercise,
  StagedSetCustomExerciseArchived,
  StagedSetExerciseFavorite,
  StagedSetExerciseHidden,
} from "../../platform/sqlite/repositories/customExerciseRepository";
import type {
  MetricIdentity,
} from "../metrics";
import {
  getMetricContract,
} from "../metrics";
import {
  normalizeSearchText,
} from "./search";

const NAME_MAX_CODE_POINTS = 120;
const ALIAS_MAX_COUNT = 16;
const TAXONOMY_MAX_COUNT = 20;
const EQUIPMENT_MAX_COUNT = 12;
const IDENTIFIER_MAX_CODE_POINTS = 128;
const SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;

export const CUSTOM_EXERCISE_TYPES = [
  "strength",
  "olympic_weightlifting",
  "stretching",
  "cardio",
  "plyometrics",
  "strongman",
  "powerlifting",
] as const;

export type CustomExerciseType = (typeof CUSTOM_EXERCISE_TYPES)[number];
export type CustomExerciseMovementClass = "compound" | "isolation";

export type CustomExerciseDuplicateDecision = Readonly<{
  type: "create_anyway";
  candidateExerciseIds: readonly string[];
}>;

export type CustomExerciseProgression =
  | Readonly<{
      kind: "manual_hold";
      version: 1;
    }>
  | Readonly<{
      kind: "metric";
      profile: MetricIdentity["profile"];
      version: number;
      rule: Readonly<Record<string, unknown>>;
    }>;

export type CreateCustomExerciseInput = Readonly<{
  requestId: string;
  exerciseId: string;
  name: string;
  aliases: readonly string[];
  exerciseType: CustomExerciseType;
  movementClass: CustomExerciseMovementClass;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: readonly string[];
  metricIdentity: MetricIdentity;
  defaultRestSeconds: number;
  progression?: CustomExerciseProgression;
  duplicateDecision?: CustomExerciseDuplicateDecision;
  createdAtMs: number;
}>;

export type EditCustomExerciseInput = Omit<
  CreateCustomExerciseInput,
  "createdAtMs" | "duplicateDecision"
> & Readonly<{
  expectedExerciseRevision: number;
  editedAtMs: number;
}>;

export type SetExerciseHiddenInput = Readonly<{
  requestId: string;
  exerciseId: string;
  expectedPreferenceRevision: number | null;
  hidden: boolean;
  updatedAtMs: number;
}>;

export type SetExerciseFavoriteInput = Readonly<{
  requestId: string;
  exerciseId: string;
  expectedPreferenceRevision: number | null;
  favorite: boolean;
  updatedAtMs: number;
}>;

export type CreateCustomCopyInput = Readonly<{
  requestId: string;
  sourceExerciseId: string;
  expectedSourceRevision: number;
  exerciseId: string;
  name: string;
  createdAtMs: number;
}>;

export type PreviewCustomExerciseArchiveInput = Readonly<{
  exerciseId: string;
  expectedExerciseRevision: number;
}>;

export type SetCustomExerciseArchivedInput = Readonly<{
  requestId: string;
  exerciseId: string;
  expectedExerciseRevision: number;
  expectedPreferenceRevision: number | null;
  previewRevision: string;
  updatedAtMs: number;
}>;

export type CustomExerciseInputErrorCode =
  | "custom_exercise_alias_invalid"
  | "custom_exercise_copy_identity_invalid"
  | "custom_exercise_equipment_invalid"
  | "custom_exercise_identifier_invalid"
  | "custom_exercise_metric_identity_required"
  | "custom_exercise_name_invalid"
  | "custom_exercise_preview_invalid"
  | "custom_exercise_progression_invalid"
  | "custom_exercise_rest_invalid"
  | "custom_exercise_revision_invalid"
  | "custom_exercise_taxonomy_invalid"
  | "custom_exercise_time_invalid"
  | "custom_exercise_type_invalid";

export class CustomExerciseInputError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-LIBRARY02" as const;

  constructor(readonly code: CustomExerciseInputErrorCode) {
    super(code);
    this.name = "CustomExerciseInputError";
  }
}

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
  return Number.isSafeInteger(value) && value >= 0;
}

function validOptionalRevision(value: number | null): boolean {
  return value === null || validRevision(value);
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validBoundedText(value: string): boolean {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && codePointLength(value) <= NAME_MAX_CODE_POINTS;
}

function stageAliases(
  aliases: readonly string[],
  normalizedName: string,
): StagedCreateCustomExercise["aliases"] {
  if (!Array.isArray(aliases) || aliases.length > ALIAS_MAX_COUNT) {
    throw new CustomExerciseInputError("custom_exercise_alias_invalid");
  }
  const staged = aliases.map((displayText) => {
    if (!validBoundedText(displayText)) {
      throw new CustomExerciseInputError("custom_exercise_alias_invalid");
    }
    return Object.freeze({
      displayText,
      normalizedText: normalizeSearchText(displayText).text,
    });
  });
  const normalized = staged.map(({ normalizedText }) => normalizedText);
  if (
    normalized.some((value) => value.length === 0 || value === normalizedName)
    || new Set(normalized).size !== normalized.length
  ) {
    throw new CustomExerciseInputError("custom_exercise_alias_invalid");
  }
  return Object.freeze(staged);
}

function stageSlugs(
  values: readonly string[],
  options: Readonly<{
    code: "custom_exercise_equipment_invalid"
      | "custom_exercise_taxonomy_invalid";
    maximum: number;
    required: boolean;
  }>,
): readonly string[] {
  if (
    !Array.isArray(values)
    || values.length > options.maximum
    || (options.required && values.length === 0)
    || values.some((value) =>
      typeof value !== "string"
      || value.length > 80
      || !SLUG_PATTERN.test(value)
    )
    || new Set(values).size !== values.length
  ) {
    throw new CustomExerciseInputError(options.code);
  }
  return Object.freeze([...values]);
}

function stageProgression(
  progression: CustomExerciseProgression | undefined,
  identity: MetricIdentity,
): CustomExerciseProgression {
  if (progression === undefined) {
    return Object.freeze({
      kind: "manual_hold",
      version: 1,
    });
  }
  if (
    progression.kind === "manual_hold"
    && progression.version === 1
  ) {
    return Object.freeze({ ...progression });
  }
  if (
    progression.kind !== "metric"
    || progression.profile !== identity.profile
    || !Number.isSafeInteger(progression.version)
    || progression.version < 1
    || typeof progression.rule !== "object"
    || progression.rule === null
    || Array.isArray(progression.rule)
    || Object.keys(progression.rule).length === 0
  ) {
    throw new CustomExerciseInputError(
      "custom_exercise_progression_invalid",
    );
  }
  return Object.freeze({
    ...progression,
    rule: Object.freeze({ ...progression.rule }),
  });
}

function stageCommon(
  input: CreateCustomExerciseInput | EditCustomExerciseInput,
): Omit<
  StagedCreateCustomExercise,
  "createdAtMs" | "duplicateDecision"
> {
  if (
    !validIdentifier(input.requestId)
    || !validIdentifier(input.exerciseId)
  ) {
    throw new CustomExerciseInputError(
      "custom_exercise_identifier_invalid",
    );
  }
  if (!validBoundedText(input.name)) {
    throw new CustomExerciseInputError("custom_exercise_name_invalid");
  }
  if (
    !CUSTOM_EXERCISE_TYPES.includes(input.exerciseType)
    || (
      input.movementClass !== "compound"
      && input.movementClass !== "isolation"
    )
  ) {
    throw new CustomExerciseInputError("custom_exercise_type_invalid");
  }
  if (
    typeof input.metricIdentity !== "object"
    || input.metricIdentity === null
  ) {
    throw new CustomExerciseInputError(
      "custom_exercise_metric_identity_required",
    );
  }
  getMetricContract(input.metricIdentity);
  if (
    !Number.isSafeInteger(input.defaultRestSeconds)
    || input.defaultRestSeconds < 0
    || input.defaultRestSeconds > 86_400
  ) {
    throw new CustomExerciseInputError("custom_exercise_rest_invalid");
  }

  const normalizedName = normalizeSearchText(input.name).text;
  const primaryMuscles = stageSlugs(input.primaryMuscles, {
    code: "custom_exercise_taxonomy_invalid",
    maximum: TAXONOMY_MAX_COUNT,
    required: true,
  });
  const secondaryMuscles = stageSlugs(input.secondaryMuscles, {
    code: "custom_exercise_taxonomy_invalid",
    maximum: TAXONOMY_MAX_COUNT,
    required: false,
  });
  if (secondaryMuscles.some((slug) => primaryMuscles.includes(slug))) {
    throw new CustomExerciseInputError("custom_exercise_taxonomy_invalid");
  }
  const equipment = stageSlugs(input.equipment, {
    code: "custom_exercise_equipment_invalid",
    maximum: EQUIPMENT_MAX_COUNT,
    required: true,
  });

  return Object.freeze({
    requestId: input.requestId,
    exerciseId: input.exerciseId,
    name: input.name,
    normalizedName,
    aliases: stageAliases(input.aliases, normalizedName),
    exerciseType: input.exerciseType,
    movementClass: input.movementClass,
    primaryMuscles,
    secondaryMuscles,
    equipment,
    metricIdentity: Object.freeze({ ...input.metricIdentity }),
    defaultRestSeconds: input.defaultRestSeconds,
    progression: stageProgression(input.progression, input.metricIdentity),
  });
}

function stageDuplicateDecision(
  decision: CustomExerciseDuplicateDecision | undefined,
): CustomExerciseDuplicateDecision | undefined {
  if (decision === undefined) {
    return undefined;
  }
  if (
    decision.type !== "create_anyway"
    || !Array.isArray(decision.candidateExerciseIds)
    || decision.candidateExerciseIds.length === 0
    || decision.candidateExerciseIds.some((value) => !validIdentifier(value))
    || new Set(decision.candidateExerciseIds).size
      !== decision.candidateExerciseIds.length
  ) {
    throw new CustomExerciseInputError(
      "custom_exercise_identifier_invalid",
    );
  }
  return Object.freeze({
    type: "create_anyway",
    candidateExerciseIds: Object.freeze([
      ...decision.candidateExerciseIds,
    ]),
  });
}

export async function createCustomExercise(input: Readonly<{
  repository: CustomExerciseRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  input: CreateCustomExerciseInput;
}>): Promise<CustomExerciseMutationResult> {
  if (!validTime(input.input.createdAtMs)) {
    throw new CustomExerciseInputError("custom_exercise_time_invalid");
  }
  const common = stageCommon(input.input);
  const duplicateDecision = stageDuplicateDecision(
    input.input.duplicateDecision,
  );
  const staged: StagedCreateCustomExercise = Object.freeze({
    ...common,
    ...(duplicateDecision === undefined ? {} : { duplicateDecision }),
    createdAtMs: input.input.createdAtMs,
  });
  const result = await input.repository.createCustomExercise(staged);
  if (result.outcome === "committed") {
    await input.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

export async function editCustomExercise(input: Readonly<{
  repository: CustomExerciseRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  input: EditCustomExerciseInput;
}>): Promise<CustomExerciseMutationResult> {
  if (!validRevision(input.input.expectedExerciseRevision)) {
    throw new CustomExerciseInputError(
      "custom_exercise_revision_invalid",
    );
  }
  if (!validTime(input.input.editedAtMs)) {
    throw new CustomExerciseInputError("custom_exercise_time_invalid");
  }
  const staged: StagedEditCustomExercise = Object.freeze({
    ...stageCommon(input.input),
    expectedExerciseRevision: input.input.expectedExerciseRevision,
    editedAtMs: input.input.editedAtMs,
  });
  const result = await input.repository.editCustomExercise(staged);
  if (result.outcome === "committed") {
    await input.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

function validatePreferenceBase(input: Readonly<{
  requestId: string;
  exerciseId: string;
  expectedPreferenceRevision: number | null;
  updatedAtMs: number;
}>): void {
  if (
    !validIdentifier(input.requestId)
    || !validIdentifier(input.exerciseId)
  ) {
    throw new CustomExerciseInputError(
      "custom_exercise_identifier_invalid",
    );
  }
  if (!validOptionalRevision(input.expectedPreferenceRevision)) {
    throw new CustomExerciseInputError(
      "custom_exercise_revision_invalid",
    );
  }
  if (!validTime(input.updatedAtMs)) {
    throw new CustomExerciseInputError("custom_exercise_time_invalid");
  }
}

function stagePreferenceInput(
  input: SetExerciseHiddenInput,
): StagedSetExerciseHidden {
  validatePreferenceBase(input);
  if (typeof input.hidden !== "boolean") {
    throw new CustomExerciseInputError(
      "custom_exercise_identifier_invalid",
    );
  }
  return Object.freeze({ ...input });
}

export async function setExerciseHidden(input: Readonly<{
  repository: CustomExerciseRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  input: SetExerciseHiddenInput;
}>): Promise<CustomExerciseHiddenResult> {
  const result = await input.repository.setExerciseHidden(
    stagePreferenceInput(input.input),
  );
  if (result.outcome === "committed") {
    await input.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

export async function setExerciseFavorite(input: Readonly<{
  repository: CustomExerciseRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  input: SetExerciseFavoriteInput;
}>): Promise<CustomExerciseFavoriteResult> {
  validatePreferenceBase(input.input);
  if (typeof input.input.favorite !== "boolean") {
    throw new CustomExerciseInputError(
      "custom_exercise_identifier_invalid",
    );
  }
  const staged: StagedSetExerciseFavorite = Object.freeze({
    ...input.input,
  });
  const result = await input.repository.setExerciseFavorite(staged);
  if (result.outcome === "committed") {
    await input.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

export async function createCustomCopy(input: Readonly<{
  repository: CustomExerciseRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  input: CreateCustomCopyInput;
}>): Promise<CustomExerciseCopyResult> {
  const value = input.input;
  if (
    !validIdentifier(value.requestId)
    || !validIdentifier(value.sourceExerciseId)
    || !validIdentifier(value.exerciseId)
  ) {
    throw new CustomExerciseInputError(
      "custom_exercise_identifier_invalid",
    );
  }
  if (value.sourceExerciseId === value.exerciseId) {
    throw new CustomExerciseInputError(
      "custom_exercise_copy_identity_invalid",
    );
  }
  if (!validRevision(value.expectedSourceRevision)) {
    throw new CustomExerciseInputError(
      "custom_exercise_revision_invalid",
    );
  }
  if (!validBoundedText(value.name)) {
    throw new CustomExerciseInputError("custom_exercise_name_invalid");
  }
  if (!validTime(value.createdAtMs)) {
    throw new CustomExerciseInputError("custom_exercise_time_invalid");
  }
  const staged: StagedCreateCustomCopy = Object.freeze({
    ...value,
    normalizedName: normalizeSearchText(value.name).text,
  });
  const result = await input.repository.createCustomCopy(staged);
  if (result.outcome === "committed") {
    await input.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

export function previewCustomExerciseArchive(input: Readonly<{
  repository: CustomExerciseRepository;
  input: PreviewCustomExerciseArchiveInput;
}>): Promise<CustomExerciseArchivePreview> {
  if (!validIdentifier(input.input.exerciseId)) {
    throw new CustomExerciseInputError(
      "custom_exercise_identifier_invalid",
    );
  }
  if (!validRevision(input.input.expectedExerciseRevision)) {
    throw new CustomExerciseInputError(
      "custom_exercise_revision_invalid",
    );
  }
  return input.repository.previewCustomExerciseArchive(input.input);
}

function stageArchiveInput(
  input: SetCustomExerciseArchivedInput,
  archived: boolean,
): StagedSetCustomExerciseArchived {
  if (
    !validIdentifier(input.requestId)
    || !validIdentifier(input.exerciseId)
  ) {
    throw new CustomExerciseInputError(
      "custom_exercise_identifier_invalid",
    );
  }
  if (
    !validRevision(input.expectedExerciseRevision)
    || !validOptionalRevision(input.expectedPreferenceRevision)
  ) {
    throw new CustomExerciseInputError(
      "custom_exercise_revision_invalid",
    );
  }
  if (
    typeof input.previewRevision !== "string"
    || input.previewRevision.length < 1
    || input.previewRevision.length > 128
  ) {
    throw new CustomExerciseInputError("custom_exercise_preview_invalid");
  }
  if (!validTime(input.updatedAtMs)) {
    throw new CustomExerciseInputError("custom_exercise_time_invalid");
  }
  return Object.freeze({
    ...input,
    archived,
  });
}

async function setArchived(input: Readonly<{
  repository: CustomExerciseRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  input: SetCustomExerciseArchivedInput;
  archived: boolean;
}>): Promise<CustomExerciseArchiveMutationResult> {
  const result = await input.repository.setCustomExerciseArchived(
    stageArchiveInput(input.input, input.archived),
  );
  if (result.outcome === "committed") {
    await input.invalidate(result.invalidations).catch(() => undefined);
  }
  return result;
}

export function archiveCustomExercise(input: Readonly<{
  repository: CustomExerciseRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  input: SetCustomExerciseArchivedInput;
}>): Promise<CustomExerciseArchiveMutationResult> {
  return setArchived({ ...input, archived: true });
}

export function restoreCustomExercise(input: Readonly<{
  repository: CustomExerciseRepository;
  invalidate(keys: readonly string[]): Promise<void>;
  input: SetCustomExerciseArchivedInput;
}>): Promise<CustomExerciseArchiveMutationResult> {
  return setArchived({ ...input, archived: false });
}
