import type {
  CustomExerciseDuplicateDecision,
  CustomExerciseMovementClass,
  CustomExerciseProgression,
  CustomExerciseType,
} from "../../../domains/library/customExerciseCommands";
import type {
  MetricIdentity,
} from "../../../domains/metrics";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export type StagedCustomExerciseAlias = Readonly<{
  displayText: string;
  normalizedText: string;
}>;

type StagedCustomExerciseCommon = Readonly<{
  requestId: string;
  exerciseId: string;
  name: string;
  normalizedName: string;
  aliases: readonly StagedCustomExerciseAlias[];
  exerciseType: CustomExerciseType;
  movementClass: CustomExerciseMovementClass;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: readonly string[];
  metricIdentity: MetricIdentity;
  defaultRestSeconds: number;
  progression: CustomExerciseProgression;
}>;

export type StagedCreateCustomExercise = StagedCustomExerciseCommon & Readonly<{
  duplicateDecision?: CustomExerciseDuplicateDecision;
  createdAtMs: number;
}>;

export type StagedEditCustomExercise = StagedCustomExerciseCommon & Readonly<{
  expectedExerciseRevision: number;
  editedAtMs: number;
}>;

export type StagedSetExerciseHidden = Readonly<{
  requestId: string;
  exerciseId: string;
  expectedPreferenceRevision: number | null;
  hidden: boolean;
  updatedAtMs: number;
}>;

export type StagedSetExerciseFavorite = Readonly<{
  requestId: string;
  exerciseId: string;
  expectedPreferenceRevision: number | null;
  favorite: boolean;
  updatedAtMs: number;
}>;

export type StagedCreateCustomCopy = Readonly<{
  requestId: string;
  sourceExerciseId: string;
  expectedSourceRevision: number;
  exerciseId: string;
  name: string;
  normalizedName: string;
  createdAtMs: number;
}>;

export type PreviewCustomExerciseArchiveInput = Readonly<{
  exerciseId: string;
  expectedExerciseRevision: number;
}>;

export type StagedSetCustomExerciseArchived = Readonly<{
  requestId: string;
  exerciseId: string;
  expectedExerciseRevision: number;
  expectedPreferenceRevision: number | null;
  previewRevision: string;
  archived: boolean;
  updatedAtMs: number;
}>;

export type CustomExerciseSnapshot = Readonly<{
  requestId: string;
  exerciseId: string;
  name: string;
  normalizedName: string;
  aliases: readonly StagedCustomExerciseAlias[];
  exerciseType: CustomExerciseType;
  movementClass: CustomExerciseMovementClass;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: readonly string[];
  metricIdentity: MetricIdentity;
  defaultRestSeconds: number;
  revision: number;
}>;

export type CustomExerciseMutationResult = Readonly<{
  outcome: "committed" | "already_committed";
  exercise: CustomExerciseSnapshot;
  progression: CustomExerciseProgression;
  invalidations: readonly string[];
}>;

export type CustomExerciseCopyResult = CustomExerciseMutationResult;

export type CustomExerciseHiddenResult = Readonly<{
  outcome: "committed" | "already_committed";
  exerciseId: string;
  hidden: boolean;
  preferenceRevision: number;
  invalidations: readonly string[];
}>;

export type CustomExerciseFavoriteResult = Readonly<{
  outcome: "committed" | "already_committed";
  exerciseId: string;
  favorite: boolean;
  preferenceRevision: number;
  invalidations: readonly string[];
}>;

export type CustomExerciseArchiveOccurrence = Readonly<{
  occurrenceId: string;
  occurrenceRevision: number;
  dayId: string;
  dayName: string;
}>;

export type CustomExerciseArchiveAffectedPlan = Readonly<{
  planId: string;
  planName: string;
  planRevision: number;
  occurrences: readonly CustomExerciseArchiveOccurrence[];
}>;

export type CustomExerciseArchivePreview = Readonly<{
  exerciseId: string;
  exerciseRevision: number;
  preferenceRevision: number | null;
  previewRevision: string;
  affectedPlans: readonly CustomExerciseArchiveAffectedPlan[];
}>;

export type CustomExerciseArchiveMutationResult = Readonly<{
  outcome: "committed" | "already_committed";
  exerciseId: string;
  archived: boolean;
  preferenceRevision: number;
  affectedPlanIds: readonly string[];
  invalidations: readonly string[];
}>;

export type ExercisePlanReference = Readonly<{
  planId: string;
  planName: string;
  dayId: string;
  dayName: string;
  occurrenceId: string;
  statusLabel: "Archived" | null;
  runnable: true;
}>;

export type CustomExerciseDuplicateCandidate = Readonly<{
  exerciseId: string;
  canonicalName: string;
  metricIdentity: MetricIdentity;
  equipment: readonly string[];
}>;

export type CustomExerciseConflictCode =
  | "custom_exercise_already_exists"
  | "custom_exercise_duplicate_confirmation_invalid"
  | "custom_exercise_duplicate_confirmation_required"
  | "custom_exercise_idempotency_conflict"
  | "custom_exercise_not_found"
  | "custom_exercise_preference_revision_conflict"
  | "custom_exercise_preview_revision_conflict"
  | "custom_exercise_revision_conflict"
  | "custom_exercise_source_inconsistent"
  | "custom_exercise_source_read_only"
  | "custom_exercise_copy_source_required";

export class CustomExerciseConflictError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-LIBRARY03" as const;

  constructor(
    readonly code: CustomExerciseConflictCode,
    readonly candidates: readonly CustomExerciseDuplicateCandidate[] = [],
  ) {
    super(code);
    this.name = "CustomExerciseConflictError";
  }
}

export type CustomExerciseRepository = Readonly<{
  createCustomExercise(
    input: StagedCreateCustomExercise,
  ): Promise<CustomExerciseMutationResult>;
  editCustomExercise(
    input: StagedEditCustomExercise,
  ): Promise<CustomExerciseMutationResult>;
  setExerciseHidden(
    input: StagedSetExerciseHidden,
  ): Promise<CustomExerciseHiddenResult>;
  setExerciseFavorite(
    input: StagedSetExerciseFavorite,
  ): Promise<CustomExerciseFavoriteResult>;
  createCustomCopy(
    input: StagedCreateCustomCopy,
  ): Promise<CustomExerciseCopyResult>;
  previewCustomExerciseArchive(
    input: PreviewCustomExerciseArchiveInput,
  ): Promise<CustomExerciseArchivePreview>;
  setCustomExerciseArchived(
    input: StagedSetCustomExerciseArchived,
  ): Promise<CustomExerciseArchiveMutationResult>;
  listExercisePlanReferences(
    exerciseId: string,
  ): Promise<readonly ExercisePlanReference[]>;
}>;

type ExerciseRow = Readonly<{
  origin: "bundled" | "copied" | "custom";
  name: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  equipment: string;
  default_rest_seconds: number;
  revision: number;
  library_origin: "bundled" | "copied" | "custom" | null;
  canonical_name: string | null;
  exercise_type: CustomExerciseType | null;
  movement_class: CustomExerciseMovementClass | null;
  library_metric_profile: MetricIdentity["profile"] | null;
  library_metric_contract_version: number | null;
  library_exercise_metric_generation: number | null;
  library_revision: number | null;
}>;

type DuplicateRow = Readonly<{
  exercise_id: string;
  canonical_name: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  equipment_json: string;
}>;

type PreferenceRow = Readonly<{
  favorite: number;
  hidden: number;
  archived: number;
  revision: number;
  updated_at_ms: number;
}>;

type AliasRow = Readonly<{
  display_text: string;
  normalized_text: string;
}>;

type TaxonomyRow = Readonly<{
  kind: "equipment" | "exercise_type" | "movement_class" | "muscle";
  slug: string;
  relation: "equipment" | "movement" | "primary" | "secondary" | "type";
  ordinal: number;
}>;

type SearchTermRow = Readonly<{
  kind: "alias" | "canonical";
  ordinal: number;
  display_text: string;
  normalized_text: string;
}>;

type PlanReferenceRow = Readonly<{
  plan_id: string;
  plan_name: string;
  plan_revision: number;
  day_id: string;
  day_name: string;
  occurrence_id: string;
  occurrence_revision: number;
}>;

type ResultEnvelope = Readonly<{
  requestId: string;
  kind: "create" | "edit";
  payload: string;
  result: CustomExerciseMutationResult;
}>;

type TransactionOutcome =
  | Readonly<{
      kind: "conflict";
      code: CustomExerciseConflictCode;
      candidates?: readonly CustomExerciseDuplicateCandidate[];
    }>
  | Readonly<{
      kind: "result";
      result: CustomExerciseMutationResult;
    }>;

type CustomExerciseConflictOutcome = Extract<
  TransactionOutcome,
  { kind: "conflict" }
>;

type QueryExecutor = Pick<SqliteKernel, "queryAll">;

const receipts = new WeakMap<SqliteKernel, Map<string, ResultEnvelope>>();

type LifecycleReceipt<Result> = Readonly<{
  payload: string;
  result: Result;
}>;

const hiddenReceipts = new WeakMap<
  SqliteKernel,
  Map<string, LifecycleReceipt<CustomExerciseHiddenResult>>
>();
const favoriteReceipts = new WeakMap<
  SqliteKernel,
  Map<string, LifecycleReceipt<CustomExerciseFavoriteResult>>
>();
const copyReceipts = new WeakMap<
  SqliteKernel,
  Map<string, LifecycleReceipt<CustomExerciseCopyResult>>
>();
const archiveReceipts = new WeakMap<
  SqliteKernel,
  Map<string, LifecycleReceipt<CustomExerciseArchiveMutationResult>>
>();

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    );
    return `{${entries.map(([key, entry]) =>
      `${JSON.stringify(key)}:${stableJson(entry)}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPart(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    hash ^= codePoint;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= codePoint >>> 16;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function revisionFingerprint(value: unknown): string {
  const serialized = stableJson(value);
  return [
    hashPart(serialized, 0x811c9dc5),
    hashPart(serialized, 0x9e3779b9),
    hashPart(serialized, 0x85ebca6b),
    hashPart(serialized, 0xc2b2ae35),
  ].join("");
}

function exactValues(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function replayLifecycle<Result extends { outcome: string }>(
  store: WeakMap<SqliteKernel, Map<string, LifecycleReceipt<Result>>>,
  kernel: SqliteKernel,
  requestId: string,
  input: unknown,
): Result | null {
  const receipt = store.get(kernel)?.get(requestId);
  if (receipt === undefined) {
    return null;
  }
  if (receipt.payload !== stableJson(input)) {
    throw new CustomExerciseConflictError(
      "custom_exercise_idempotency_conflict",
    );
  }
  return Object.freeze({
    ...receipt.result,
    outcome: "already_committed",
  }) as Result;
}

function rememberLifecycle<Result>(
  store: WeakMap<SqliteKernel, Map<string, LifecycleReceipt<Result>>>,
  kernel: SqliteKernel,
  requestId: string,
  input: unknown,
  committed: Result,
): void {
  const byRequest = store.get(kernel)
    ?? new Map<string, LifecycleReceipt<Result>>();
  byRequest.set(requestId, Object.freeze({
    payload: stableJson(input),
    result: committed,
  }));
  store.set(kernel, byRequest);
}

function invalidations(exerciseId: string): readonly string[] {
  return Object.freeze([
    "library:exercises",
    `exercise:${exerciseId}`,
  ]);
}

function lifecycleInvalidations(
  exerciseId: string,
  planIds: readonly string[],
): readonly string[] {
  return Object.freeze([
    ...invalidations(exerciseId),
    ...planIds.map((planId) => `plan:${planId}`),
  ]);
}

function snapshot(
  input: StagedCreateCustomExercise | StagedEditCustomExercise,
  revision: number,
): CustomExerciseSnapshot {
  return Object.freeze({
    requestId: input.requestId,
    exerciseId: input.exerciseId,
    name: input.name,
    normalizedName: input.normalizedName,
    aliases: Object.freeze(input.aliases.map((alias) =>
      Object.freeze({ ...alias })
    )),
    exerciseType: input.exerciseType,
    movementClass: input.movementClass,
    primaryMuscles: Object.freeze([...input.primaryMuscles]),
    secondaryMuscles: Object.freeze([...input.secondaryMuscles]),
    equipment: Object.freeze([...input.equipment]),
    metricIdentity: Object.freeze({ ...input.metricIdentity }),
    defaultRestSeconds: input.defaultRestSeconds,
    revision,
  });
}

function result(
  input: StagedCreateCustomExercise | StagedEditCustomExercise,
  revision: number,
): CustomExerciseMutationResult {
  return Object.freeze({
    outcome: "committed",
    exercise: snapshot(input, revision),
    progression: input.progression,
    invalidations: invalidations(input.exerciseId),
  });
}

function receiptReplay(
  kernel: SqliteKernel,
  kind: ResultEnvelope["kind"],
  input: StagedCreateCustomExercise | StagedEditCustomExercise,
): TransactionOutcome | null {
  const receipt = receipts.get(kernel)?.get(input.requestId);
  if (receipt === undefined) {
    return null;
  }
  const payload = stableJson(input);
  if (receipt.kind !== kind || receipt.payload !== payload) {
    return {
      kind: "conflict",
      code: "custom_exercise_idempotency_conflict",
    };
  }
  return {
    kind: "result",
    result: Object.freeze({
      ...receipt.result,
      outcome: "already_committed",
    }),
  };
}

async function readExercise(
  transaction: QueryExecutor,
  exerciseId: string,
): Promise<ExerciseRow | undefined> {
  const [row] = await transaction.queryAll<ExerciseRow>(
    `SELECT exercise.origin, exercise.name, exercise.metric_profile,
            exercise.metric_contract_version,
            exercise.exercise_metric_generation, exercise.equipment,
            exercise.default_rest_seconds, exercise.revision,
            library.origin AS library_origin,
            library.canonical_name, library.exercise_type,
            library.movement_class,
            library.metric_profile AS library_metric_profile,
            library.metric_contract_version
              AS library_metric_contract_version,
            library.exercise_metric_generation
              AS library_exercise_metric_generation,
            library.revision AS library_revision
     FROM exercises exercise
     LEFT JOIN exercise_library_entries library
       ON library.exercise_id = exercise.id
     WHERE exercise.id = ?`,
    [exerciseId],
  );
  return row;
}

async function readPreference(
  transaction: QueryExecutor,
  exerciseId: string,
): Promise<PreferenceRow | undefined> {
  const [row] = await transaction.queryAll<PreferenceRow>(
    `SELECT favorite, hidden, archived, revision, updated_at_ms
     FROM exercise_owner_preferences
     WHERE exercise_id = ?`,
    [exerciseId],
  );
  return row;
}

async function readSearchTerms(
  transaction: QueryExecutor,
  exerciseId: string,
): Promise<readonly SearchTermRow[]> {
  return transaction.queryAll<SearchTermRow>(
    `SELECT kind, ordinal, display_text, normalized_text
     FROM exercise_search_terms
     WHERE exercise_id = ?
     ORDER BY CASE kind WHEN 'canonical' THEN 0 ELSE 1 END, ordinal`,
    [exerciseId],
  );
}

function preferenceRevisionMatches(
  preference: PreferenceRow | undefined,
  expectedRevision: number | null,
): boolean {
  return expectedRevision === null
    ? preference === undefined
    : preference?.revision === expectedRevision;
}

async function writePreference(
  transaction: SqliteTransactionExecutor,
  input: Readonly<{
    exerciseId: string;
    preference: PreferenceRow | undefined;
    favorite?: boolean;
    hidden?: boolean;
    archived?: boolean;
    updatedAtMs: number;
  }>,
): Promise<number> {
  if (input.preference === undefined) {
    await transaction.execute(
      `INSERT INTO exercise_owner_preferences
        (exercise_id, favorite, hidden, archived, revision, updated_at_ms)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [
        input.exerciseId,
        input.favorite === true ? 1 : 0,
        input.hidden === true ? 1 : 0,
        input.archived === true ? 1 : 0,
        input.updatedAtMs,
      ],
    );
    return 1;
  }
  await transaction.execute(
    `UPDATE exercise_owner_preferences
     SET favorite = ?,
         hidden = ?,
         archived = ?,
         revision = revision + 1,
         updated_at_ms = ?
     WHERE exercise_id = ? AND revision = ?`,
    [
      input.favorite === undefined
        ? input.preference.favorite
        : input.favorite
          ? 1
          : 0,
      input.hidden === undefined
        ? input.preference.hidden
        : input.hidden
          ? 1
          : 0,
      input.archived === undefined
        ? input.preference.archived
        : input.archived
          ? 1
          : 0,
      input.updatedAtMs,
      input.exerciseId,
      input.preference.revision,
    ],
  );
  return input.preference.revision + 1;
}

async function readAliases(
  transaction: QueryExecutor,
  exerciseId: string,
): Promise<readonly StagedCustomExerciseAlias[]> {
  const rows = await transaction.queryAll<AliasRow>(
    `SELECT display_text, normalized_text
     FROM exercise_aliases
     WHERE exercise_id = ?
     ORDER BY ordinal, id`,
    [exerciseId],
  );
  return Object.freeze(rows.map((row) => Object.freeze({
    displayText: row.display_text,
    normalizedText: row.normalized_text,
  })));
}

async function readTaxonomy(
  transaction: QueryExecutor,
  exerciseId: string,
): Promise<readonly TaxonomyRow[]> {
  return transaction.queryAll<TaxonomyRow>(
    `SELECT kind, slug, relation, ordinal
     FROM exercise_taxonomy
     WHERE exercise_id = ?
     ORDER BY kind, relation, ordinal, slug`,
    [exerciseId],
  );
}

function taxonomyValues(
  rows: readonly TaxonomyRow[],
  kind: TaxonomyRow["kind"],
  relation: TaxonomyRow["relation"],
): readonly string[] {
  return Object.freeze(rows
    .filter((row) => row.kind === kind && row.relation === relation)
    .sort((left, right) => left.ordinal - right.ordinal)
    .map(({ slug }) => slug));
}

async function readPlanReferenceRows(
  transaction: QueryExecutor,
  exerciseId: string,
): Promise<readonly PlanReferenceRow[]> {
  return transaction.queryAll<PlanReferenceRow>(
    `SELECT plan.id AS plan_id,
            plan.name AS plan_name,
            plan.revision AS plan_revision,
            day.id AS day_id,
            day.name AS day_name,
            occurrence.id AS occurrence_id,
            occurrence.revision AS occurrence_revision
     FROM plan_day_exercises occurrence
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     JOIN plans plan ON plan.id = day.plan_id
     WHERE occurrence.exercise_id = ?
     UNION ALL
     SELECT plan.id AS plan_id,
            plan.name AS plan_name,
            plan.revision AS plan_revision,
            day.id AS day_id,
            day.name AS day_name,
            occurrence.id AS occurrence_id,
            occurrence.revision AS occurrence_revision
     FROM owned_plan_day_exercises occurrence
     JOIN plan_days day ON day.id = occurrence.plan_day_id
     JOIN plans plan ON plan.id = day.plan_id
     WHERE occurrence.exercise_id = ?
     ORDER BY plan_id, day_id, occurrence_id`,
    [exerciseId, exerciseId],
  );
}

function affectedPlans(
  rows: readonly PlanReferenceRow[],
): readonly CustomExerciseArchiveAffectedPlan[] {
  const grouped = new Map<string, {
    planId: string;
    planName: string;
    planRevision: number;
    occurrences: CustomExerciseArchiveOccurrence[];
  }>();
  for (const row of rows) {
    const group = grouped.get(row.plan_id) ?? {
      planId: row.plan_id,
      planName: row.plan_name,
      planRevision: row.plan_revision,
      occurrences: [],
    };
    group.occurrences.push(Object.freeze({
      occurrenceId: row.occurrence_id,
      occurrenceRevision: row.occurrence_revision,
      dayId: row.day_id,
      dayName: row.day_name,
    }));
    grouped.set(row.plan_id, group);
  }
  return Object.freeze([...grouped.values()].map((plan) => Object.freeze({
    planId: plan.planId,
    planName: plan.planName,
    planRevision: plan.planRevision,
    occurrences: Object.freeze(plan.occurrences),
  })));
}

function archivePreview(
  exerciseId: string,
  exerciseRevision: number,
  preferenceRevision: number | null,
  plans: readonly CustomExerciseArchiveAffectedPlan[],
): CustomExerciseArchivePreview {
  const facts = {
    exerciseId,
    exerciseRevision,
    preferenceRevision,
    affectedPlans: plans,
  };
  return Object.freeze({
    ...facts,
    previewRevision: revisionFingerprint(facts),
  });
}

function isConflictOutcome(
  value: CustomExerciseArchivePreview | CustomExerciseConflictOutcome,
): value is CustomExerciseConflictOutcome {
  return "kind" in value;
}

async function readArchivePreview(
  transaction: QueryExecutor,
  input: PreviewCustomExerciseArchiveInput,
): Promise<CustomExerciseArchivePreview | CustomExerciseConflictOutcome> {
  const exercise = await readExercise(transaction, input.exerciseId);
  if (exercise === undefined || exercise.library_origin === null) {
    return {
      kind: "conflict",
      code: "custom_exercise_not_found",
    };
  }
  if (
    exercise.origin !== "custom"
    || exercise.library_origin !== "custom"
  ) {
    return {
      kind: "conflict",
      code: "custom_exercise_source_read_only",
    };
  }
  if (
    exercise.revision !== input.expectedExerciseRevision
    || exercise.library_revision !== input.expectedExerciseRevision
  ) {
    return {
      kind: "conflict",
      code: "custom_exercise_revision_conflict",
    };
  }
  const preference = await readPreference(transaction, input.exerciseId);
  const plans = affectedPlans(
    await readPlanReferenceRows(transaction, input.exerciseId),
  );
  return archivePreview(
    input.exerciseId,
    exercise.revision,
    preference?.revision ?? null,
    plans,
  );
}

function parseStringArray(value: string): readonly string[] {
  return Object.freeze([...(JSON.parse(value) as string[])]);
}

function duplicateEquipmentKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === "bodyweight"
      || normalized === "body only"
      || normalized === "body-only"
    ? "body-only"
    : normalized;
}

async function likelyDuplicates(
  transaction: SqliteTransactionExecutor,
  input: StagedCreateCustomExercise,
): Promise<readonly CustomExerciseDuplicateCandidate[]> {
  const rows = await transaction.queryAll<DuplicateRow>(
    `SELECT entry.exercise_id,
            entry.canonical_name,
            entry.metric_profile,
            entry.metric_contract_version,
            entry.exercise_metric_generation,
            COALESCE((
              SELECT json_group_array(taxonomy.slug)
              FROM exercise_taxonomy taxonomy
              WHERE taxonomy.exercise_id = entry.exercise_id
                AND taxonomy.kind = 'equipment'
              ORDER BY taxonomy.ordinal, taxonomy.slug
            ), '[]') AS equipment_json
     FROM exercise_library_entries entry
     JOIN exercise_search_terms canonical
       ON canonical.exercise_id = entry.exercise_id
      AND canonical.kind = 'canonical'
     WHERE canonical.normalized_text = ?
       AND entry.metric_profile = ?
       AND entry.metric_contract_version = ?
       AND entry.availability = 'available'
     ORDER BY canonical.normalized_text, entry.exercise_id`,
    [
      input.normalizedName,
      input.metricIdentity.profile,
      input.metricIdentity.contractVersion,
    ],
  );
  const requestedEquipment = new Set(
    input.equipment.map(duplicateEquipmentKey),
  );
  const candidates: CustomExerciseDuplicateCandidate[] = [];
  for (const row of rows) {
    let equipment = parseStringArray(row.equipment_json);
    if (equipment.length === 0) {
      const [source] = await transaction.queryAll<{ equipment: string }>(
        "SELECT equipment FROM exercises WHERE id = ?",
        [row.exercise_id],
      );
      equipment = source?.equipment === undefined
        ? []
        : Object.freeze(source.equipment.split(",")
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0));
    }
    if (
      equipment.some((value) =>
        requestedEquipment.has(duplicateEquipmentKey(value))
      )
    ) {
      candidates.push(Object.freeze({
        exerciseId: row.exercise_id,
        canonicalName: row.canonical_name,
        metricIdentity: Object.freeze({
          profile: row.metric_profile,
          contractVersion: row.metric_contract_version,
          exerciseMetricGeneration: row.exercise_metric_generation,
        }),
        equipment,
      }));
    }
  }
  return Object.freeze(candidates);
}

function classifyDuplicateDecision(
  input: StagedCreateCustomExercise,
  candidates: readonly CustomExerciseDuplicateCandidate[],
): TransactionOutcome | null {
  if (candidates.length === 0) {
    return null;
  }
  const candidateIds = candidates.map(({ exerciseId }) => exerciseId);
  if (input.duplicateDecision === undefined) {
    return {
      kind: "conflict",
      code: "custom_exercise_duplicate_confirmation_required",
      candidates,
    };
  }
  if (
    !exactValues(
      input.duplicateDecision.candidateExerciseIds,
      candidateIds,
    )
  ) {
    return {
      kind: "conflict",
      code: "custom_exercise_duplicate_confirmation_invalid",
      candidates,
    };
  }
  return null;
}

async function insertSourceRows(
  transaction: SqliteTransactionExecutor,
  input: StagedCreateCustomExercise,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO exercises
      (id, content_pack_id, origin, source_namespace, upstream_id, name,
       metric_profile, metric_contract_version,
       exercise_metric_generation, equipment, default_rest_seconds, revision)
     VALUES (?, NULL, 'custom', NULL, NULL, ?, ?, ?, ?, ?, ?, 1)`,
    [
      input.exerciseId,
      input.name,
      input.metricIdentity.profile,
      input.metricIdentity.contractVersion,
      input.metricIdentity.exerciseMetricGeneration,
      input.equipment.join(", "),
      input.defaultRestSeconds,
    ],
  );
  await transaction.execute(
    `INSERT INTO exercise_library_entries
      (exercise_id, origin, canonical_name, exercise_type, movement_class,
       metric_profile, metric_contract_version, exercise_metric_generation,
       availability, revision)
     VALUES (?, 'custom', ?, ?, ?, ?, ?, ?, 'available', 1)`,
    [
      input.exerciseId,
      input.name,
      input.exerciseType,
      input.movementClass,
      input.metricIdentity.profile,
      input.metricIdentity.contractVersion,
      input.metricIdentity.exerciseMetricGeneration,
    ],
  );
  await transaction.execute(
    `INSERT INTO exercise_owner_preferences
      (exercise_id, favorite, hidden, archived, revision, updated_at_ms)
     VALUES (?, 0, 0, 0, 1, ?)`,
    [input.exerciseId, input.createdAtMs],
  );
}

async function replaceAliases(
  transaction: SqliteTransactionExecutor,
  exerciseId: string,
  aliases: readonly StagedCustomExerciseAlias[],
): Promise<void> {
  await transaction.execute(
    "DELETE FROM exercise_aliases WHERE exercise_id = ?",
    [exerciseId],
  );
  for (const [ordinal, alias] of aliases.entries()) {
    await transaction.execute(
      `INSERT INTO exercise_aliases
        (exercise_id, ordinal, display_text, normalized_text)
       VALUES (?, ?, ?, ?)`,
      [
        exerciseId,
        ordinal,
        alias.displayText,
        alias.normalizedText,
      ],
    );
  }
}

async function insertTaxonomyTerm(
  transaction: SqliteTransactionExecutor,
  exerciseId: string,
  kind: "equipment" | "exercise_type" | "movement_class" | "muscle",
  slug: string,
  relation: "equipment" | "movement" | "primary" | "secondary" | "type",
  ordinal: number,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO taxonomy_terms(kind, slug, display_name)
     VALUES (?, ?, ?)
     ON CONFLICT(kind, slug) DO NOTHING`,
    [kind, slug, slug],
  );
  await transaction.execute(
    `INSERT INTO exercise_taxonomy
      (exercise_id, kind, slug, relation, ordinal)
     VALUES (?, ?, ?, ?, ?)`,
    [exerciseId, kind, slug, relation, ordinal],
  );
}

async function replaceTaxonomy(
  transaction: SqliteTransactionExecutor,
  input: StagedCreateCustomExercise | StagedEditCustomExercise,
): Promise<void> {
  await transaction.execute(
    "DELETE FROM exercise_taxonomy WHERE exercise_id = ?",
    [input.exerciseId],
  );
  await insertTaxonomyTerm(
    transaction,
    input.exerciseId,
    "exercise_type",
    input.exerciseType,
    "type",
    0,
  );
  await insertTaxonomyTerm(
    transaction,
    input.exerciseId,
    "movement_class",
    input.movementClass,
    "movement",
    0,
  );
  for (const [ordinal, slug] of input.primaryMuscles.entries()) {
    await insertTaxonomyTerm(
      transaction,
      input.exerciseId,
      "muscle",
      slug,
      "primary",
      ordinal,
    );
  }
  for (const [ordinal, slug] of input.secondaryMuscles.entries()) {
    await insertTaxonomyTerm(
      transaction,
      input.exerciseId,
      "muscle",
      slug,
      "secondary",
      ordinal,
    );
  }
  for (const [ordinal, slug] of input.equipment.entries()) {
    await insertTaxonomyTerm(
      transaction,
      input.exerciseId,
      "equipment",
      slug,
      "equipment",
      ordinal,
    );
  }
}

async function replaceSearchTerms(
  transaction: SqliteTransactionExecutor,
  input: StagedCreateCustomExercise | StagedEditCustomExercise,
): Promise<void> {
  await transaction.execute(
    "DELETE FROM exercise_search_terms WHERE exercise_id = ?",
    [input.exerciseId],
  );
  await transaction.execute(
    `INSERT INTO exercise_search_terms
      (exercise_id, kind, ordinal, display_text, normalized_text)
     VALUES (?, 'canonical', 0, ?, ?)`,
    [input.exerciseId, input.name, input.normalizedName],
  );
  for (const [ordinal, alias] of input.aliases.entries()) {
    await transaction.execute(
      `INSERT INTO exercise_search_terms
        (exercise_id, kind, ordinal, display_text, normalized_text)
       VALUES (?, 'alias', ?, ?, ?)`,
      [
        input.exerciseId,
        ordinal,
        alias.displayText,
        alias.normalizedText,
      ],
    );
  }
}

async function applyCreate(
  transaction: SqliteTransactionExecutor,
  input: StagedCreateCustomExercise,
): Promise<CustomExerciseMutationResult> {
  await insertSourceRows(transaction, input);
  await replaceAliases(transaction, input.exerciseId, input.aliases);
  await replaceTaxonomy(transaction, input);
  await replaceSearchTerms(transaction, input);
  return result(input, 1);
}

function exactAliases(
  existing: readonly StagedCustomExerciseAlias[],
  requested: readonly StagedCustomExerciseAlias[],
): boolean {
  return existing.length === requested.length
    && existing.every((alias, index) =>
      alias.displayText === requested[index]?.displayText
      && alias.normalizedText === requested[index]?.normalizedText
    );
}

function taxonomyKeys(rows: readonly TaxonomyRow[]): readonly string[] {
  return rows.map((row) => [
    row.kind,
    row.relation,
    row.ordinal,
    row.slug,
  ].join(":")).sort();
}

function requestedTaxonomyKeys(
  input: StagedCreateCustomExercise,
): readonly string[] {
  return [
    `exercise_type:type:0:${input.exerciseType}`,
    `movement_class:movement:0:${input.movementClass}`,
    ...input.primaryMuscles.map((slug, ordinal) =>
      `muscle:primary:${ordinal}:${slug}`
    ),
    ...input.secondaryMuscles.map((slug, ordinal) =>
      `muscle:secondary:${ordinal}:${slug}`
    ),
    ...input.equipment.map((slug, ordinal) =>
      `equipment:equipment:${ordinal}:${slug}`
    ),
  ].sort();
}

function searchTermsMatch(
  rows: readonly SearchTermRow[],
  input: StagedCreateCustomExercise,
): boolean {
  const expected: readonly SearchTermRow[] = [
    {
      kind: "canonical",
      ordinal: 0,
      display_text: input.name,
      normalized_text: input.normalizedName,
    },
    ...input.aliases.map((alias, ordinal) => ({
      kind: "alias" as const,
      ordinal,
      display_text: alias.displayText,
      normalized_text: alias.normalizedText,
    })),
  ];
  return rows.length === expected.length
    && rows.every((row, index) =>
      row.kind === expected[index]?.kind
      && row.ordinal === expected[index]?.ordinal
      && row.display_text === expected[index]?.display_text
      && row.normalized_text === expected[index]?.normalized_text
    );
}

async function committedCreateReplay(
  transaction: SqliteTransactionExecutor,
  existing: ExerciseRow,
  input: StagedCreateCustomExercise,
): Promise<TransactionOutcome> {
  const [preference, aliases, taxonomy, searchTerms] = await Promise.all([
    readPreference(transaction, input.exerciseId),
    readAliases(transaction, input.exerciseId),
    readTaxonomy(transaction, input.exerciseId),
    readSearchTerms(transaction, input.exerciseId),
  ]);
  const requestedTaxonomy = requestedTaxonomyKeys(input);
  const existingTaxonomy = taxonomyKeys(taxonomy);
  const matches =
    existing.origin === "custom"
    && existing.library_origin === "custom"
    && existing.name === input.name
    && existing.canonical_name === input.name
    && existing.exercise_type === input.exerciseType
    && existing.movement_class === input.movementClass
    && existing.metric_profile === input.metricIdentity.profile
    && existing.metric_contract_version
      === input.metricIdentity.contractVersion
    && existing.exercise_metric_generation
      === input.metricIdentity.exerciseMetricGeneration
    && existing.library_metric_profile === input.metricIdentity.profile
    && existing.library_metric_contract_version
      === input.metricIdentity.contractVersion
    && existing.library_exercise_metric_generation
      === input.metricIdentity.exerciseMetricGeneration
    && existing.equipment === input.equipment.join(", ")
    && existing.default_rest_seconds === input.defaultRestSeconds
    && existing.revision === 1
    && existing.library_revision === 1
    && preference?.favorite === 0
    && preference?.hidden === 0
    && preference.archived === 0
    && preference.revision === 1
    && preference.updated_at_ms === input.createdAtMs
    && exactAliases(aliases, input.aliases)
    && exactValues(existingTaxonomy, requestedTaxonomy)
    && searchTermsMatch(searchTerms, input);
  if (!matches) {
    return {
      kind: "conflict",
      code: "custom_exercise_idempotency_conflict",
    };
  }
  return {
    kind: "result",
    result: Object.freeze({
      ...result(input, 1),
      outcome: "already_committed",
    }),
  };
}

async function applyCustomCopy(
  transaction: SqliteTransactionExecutor,
  source: ExerciseRow,
  input: StagedCreateCustomCopy,
): Promise<CustomExerciseCopyResult> {
  const taxonomy = await readTaxonomy(
    transaction,
    input.sourceExerciseId,
  );
  const primaryMuscles = taxonomyValues(taxonomy, "muscle", "primary");
  const equipmentTaxonomy = taxonomyValues(
    taxonomy,
    "equipment",
    "equipment",
  );
  const equipment = equipmentTaxonomy.length > 0
    ? equipmentTaxonomy
    : Object.freeze(source.equipment.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0));
  if (primaryMuscles.length === 0) {
    throw new Error("custom_exercise_copy_source_incomplete");
  }
  const staged: StagedCreateCustomExercise = Object.freeze({
    requestId: input.requestId,
    exerciseId: input.exerciseId,
    name: input.name,
    normalizedName: input.normalizedName,
    aliases: await readAliases(transaction, input.sourceExerciseId),
    exerciseType: source.exercise_type!,
    movementClass: source.movement_class!,
    primaryMuscles,
    secondaryMuscles: taxonomyValues(taxonomy, "muscle", "secondary"),
    equipment,
    metricIdentity: Object.freeze({
      profile: source.metric_profile,
      contractVersion: source.metric_contract_version,
      exerciseMetricGeneration: source.exercise_metric_generation,
    }),
    defaultRestSeconds: source.default_rest_seconds,
    progression: Object.freeze({
      kind: "manual_hold",
      version: 1,
    }),
    createdAtMs: input.createdAtMs,
  });
  return applyCreate(transaction, staged);
}

function identityMatches(
  row: ExerciseRow,
  input: StagedEditCustomExercise,
): boolean {
  return row.metric_profile === input.metricIdentity.profile
    && row.metric_contract_version
      === input.metricIdentity.contractVersion
    && row.exercise_metric_generation
      === input.metricIdentity.exerciseMetricGeneration
    && row.library_metric_profile === input.metricIdentity.profile
    && row.library_metric_contract_version
      === input.metricIdentity.contractVersion
    && row.library_exercise_metric_generation
      === input.metricIdentity.exerciseMetricGeneration;
}

async function applyEdit(
  transaction: SqliteTransactionExecutor,
  input: StagedEditCustomExercise,
): Promise<CustomExerciseMutationResult> {
  await transaction.execute(
    `UPDATE exercises
     SET name = ?, equipment = ?, default_rest_seconds = ?,
         revision = revision + 1
     WHERE id = ? AND origin = 'custom' AND revision = ?`,
    [
      input.name,
      input.equipment.join(", "),
      input.defaultRestSeconds,
      input.exerciseId,
      input.expectedExerciseRevision,
    ],
  );
  await transaction.execute(
    `UPDATE exercise_library_entries
     SET canonical_name = ?, exercise_type = ?, movement_class = ?,
         revision = revision + 1
     WHERE exercise_id = ? AND origin = 'custom' AND revision = ?`,
    [
      input.name,
      input.exerciseType,
      input.movementClass,
      input.exerciseId,
      input.expectedExerciseRevision,
    ],
  );
  await replaceAliases(transaction, input.exerciseId, input.aliases);
  await replaceTaxonomy(transaction, input);
  await replaceSearchTerms(transaction, input);
  await transaction.execute(
    `INSERT INTO exercise_owner_preferences
      (exercise_id, favorite, hidden, archived, revision, updated_at_ms)
     VALUES (?, 0, 0, 0, 1, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       updated_at_ms = excluded.updated_at_ms`,
    [input.exerciseId, input.editedAtMs],
  );
  return result(input, input.expectedExerciseRevision + 1);
}

function rememberReceipt(
  kernel: SqliteKernel,
  kind: ResultEnvelope["kind"],
  input: StagedCreateCustomExercise | StagedEditCustomExercise,
  committed: CustomExerciseMutationResult,
): void {
  const byRequest = receipts.get(kernel) ?? new Map<string, ResultEnvelope>();
  byRequest.set(input.requestId, Object.freeze({
    requestId: input.requestId,
    kind,
    payload: stableJson(input),
    result: committed,
  }));
  receipts.set(kernel, byRequest);
}

function throwConflict(outcome: Extract<
  TransactionOutcome,
  { kind: "conflict" }
>): never {
  throw new CustomExerciseConflictError(
    outcome.code,
    outcome.candidates ?? [],
  );
}

export function createCustomExerciseRepository(
  kernel: SqliteKernel,
): CustomExerciseRepository {
  return Object.freeze({
    async createCustomExercise(input) {
      const replay = receiptReplay(kernel, "create", input);
      if (replay !== null) {
        if (replay.kind === "conflict") {
          return throwConflict(replay);
        }
        return replay.result;
      }
      const outcome = await kernel.write<TransactionOutcome>(
        async (transaction) => {
          const existing = await readExercise(
            transaction,
            input.exerciseId,
          );
          if (existing !== undefined) {
            return committedCreateReplay(transaction, existing, input);
          }
          const candidates = await likelyDuplicates(transaction, input);
          const duplicateConflict = classifyDuplicateDecision(
            input,
            candidates,
          );
          if (duplicateConflict !== null) {
            return duplicateConflict;
          }
          return {
            kind: "result",
            result: await applyCreate(transaction, input),
          };
        },
      );
      if (outcome.kind === "conflict") {
        return throwConflict(outcome);
      }
      rememberReceipt(kernel, "create", input, outcome.result);
      return outcome.result;
    },

    async editCustomExercise(input) {
      const replay = receiptReplay(kernel, "edit", input);
      if (replay !== null) {
        if (replay.kind === "conflict") {
          return throwConflict(replay);
        }
        return replay.result;
      }
      const outcome = await kernel.write<TransactionOutcome>(
        async (transaction) => {
          const exercise = await readExercise(
            transaction,
            input.exerciseId,
          );
          if (exercise === undefined || exercise.library_origin === null) {
            return {
              kind: "conflict",
              code: "custom_exercise_not_found",
            };
          }
          if (
            exercise.origin !== "custom"
            || exercise.library_origin !== "custom"
          ) {
            return {
              kind: "conflict",
              code: "custom_exercise_source_read_only",
            };
          }
          if (
            exercise.revision !== input.expectedExerciseRevision
            || exercise.library_revision
              !== input.expectedExerciseRevision
          ) {
            return {
              kind: "conflict",
              code: "custom_exercise_revision_conflict",
            };
          }
          if (!identityMatches(exercise, input)) {
            return {
              kind: "conflict",
              code: "custom_exercise_source_inconsistent",
            };
          }
          return {
            kind: "result",
            result: await applyEdit(transaction, input),
          };
        },
      );
      if (outcome.kind === "conflict") {
        return throwConflict(outcome);
      }
      rememberReceipt(kernel, "edit", input, outcome.result);
      return outcome.result;
    },

    async setExerciseHidden(input) {
      const replay = replayLifecycle(
        hiddenReceipts,
        kernel,
        input.requestId,
        input,
      );
      if (replay !== null) {
        return replay;
      }
      const outcome = await kernel.write<
        | Readonly<{
            kind: "conflict";
            code: CustomExerciseConflictCode;
          }>
        | Readonly<{
            kind: "result";
            result: CustomExerciseHiddenResult;
          }>
      >(async (transaction) => {
        const exercise = await readExercise(
          transaction,
          input.exerciseId,
        );
        if (exercise === undefined || exercise.library_origin === null) {
          return {
            kind: "conflict",
            code: "custom_exercise_not_found",
          };
        }
        const preference = await readPreference(
          transaction,
          input.exerciseId,
        );
        if (!preferenceRevisionMatches(
            preference,
            input.expectedPreferenceRevision,
          )) {
          return {
            kind: "conflict",
            code: "custom_exercise_preference_revision_conflict",
          };
        }
        const preferenceRevision = await writePreference(transaction, {
          exerciseId: input.exerciseId,
          preference,
          hidden: input.hidden,
          updatedAtMs: input.updatedAtMs,
        });
        return {
          kind: "result",
          result: Object.freeze({
            outcome: "committed",
            exerciseId: input.exerciseId,
            hidden: input.hidden,
            preferenceRevision,
            invalidations: invalidations(input.exerciseId),
          }),
        };
      });
      if (outcome.kind === "conflict") {
        throw new CustomExerciseConflictError(outcome.code);
      }
      rememberLifecycle(
        hiddenReceipts,
        kernel,
        input.requestId,
        input,
        outcome.result,
      );
      return outcome.result;
    },

    async setExerciseFavorite(input) {
      const replay = replayLifecycle(
        favoriteReceipts,
        kernel,
        input.requestId,
        input,
      );
      if (replay !== null) {
        return replay;
      }
      const outcome = await kernel.write<
        | Readonly<{
            kind: "conflict";
            code: CustomExerciseConflictCode;
          }>
        | Readonly<{
            kind: "result";
            result: CustomExerciseFavoriteResult;
          }>
      >(async (transaction) => {
        const exercise = await readExercise(
          transaction,
          input.exerciseId,
        );
        if (exercise === undefined || exercise.library_origin === null) {
          return {
            kind: "conflict",
            code: "custom_exercise_not_found",
          };
        }
        const preference = await readPreference(
          transaction,
          input.exerciseId,
        );
        if (!preferenceRevisionMatches(
            preference,
            input.expectedPreferenceRevision,
          )) {
          return {
            kind: "conflict",
            code: "custom_exercise_preference_revision_conflict",
          };
        }
        const preferenceRevision = await writePreference(transaction, {
          exerciseId: input.exerciseId,
          preference,
          favorite: input.favorite,
          updatedAtMs: input.updatedAtMs,
        });
        return {
          kind: "result",
          result: Object.freeze({
            outcome: "committed",
            exerciseId: input.exerciseId,
            favorite: input.favorite,
            preferenceRevision,
            invalidations: invalidations(input.exerciseId),
          }),
        };
      });
      if (outcome.kind === "conflict") {
        throw new CustomExerciseConflictError(outcome.code);
      }
      rememberLifecycle(
        favoriteReceipts,
        kernel,
        input.requestId,
        input,
        outcome.result,
      );
      return outcome.result;
    },

    async createCustomCopy(input) {
      const replay = replayLifecycle(
        copyReceipts,
        kernel,
        input.requestId,
        input,
      );
      if (replay !== null) {
        return replay;
      }
      const outcome = await kernel.write<
        | Readonly<{
            kind: "conflict";
            code: CustomExerciseConflictCode;
          }>
        | Readonly<{
            kind: "result";
            result: CustomExerciseCopyResult;
          }>
      >(async (transaction) => {
        if (await readExercise(transaction, input.exerciseId) !== undefined) {
          return {
            kind: "conflict",
            code: "custom_exercise_already_exists",
          };
        }
        const source = await readExercise(
          transaction,
          input.sourceExerciseId,
        );
        if (source === undefined || source.library_origin === null) {
          return {
            kind: "conflict",
            code: "custom_exercise_not_found",
          };
        }
        if (
          source.origin !== "bundled"
          || source.library_origin !== "bundled"
        ) {
          return {
            kind: "conflict",
            code: "custom_exercise_copy_source_required",
          };
        }
        if (
          source.revision !== input.expectedSourceRevision
          || source.library_revision !== input.expectedSourceRevision
        ) {
          return {
            kind: "conflict",
            code: "custom_exercise_revision_conflict",
          };
        }
        return {
          kind: "result",
          result: await applyCustomCopy(transaction, source, input),
        };
      });
      if (outcome.kind === "conflict") {
        throw new CustomExerciseConflictError(outcome.code);
      }
      rememberLifecycle(
        copyReceipts,
        kernel,
        input.requestId,
        input,
        outcome.result,
      );
      return outcome.result;
    },

    async previewCustomExerciseArchive(input) {
      const preview = await readArchivePreview(kernel, input);
      if (isConflictOutcome(preview)) {
        return throwConflict(preview);
      }
      return preview;
    },

    async setCustomExerciseArchived(input) {
      const replay = replayLifecycle(
        archiveReceipts,
        kernel,
        input.requestId,
        input,
      );
      if (replay !== null) {
        return replay;
      }
      const outcome = await kernel.write<
        | Readonly<{
            kind: "conflict";
            code: CustomExerciseConflictCode;
          }>
        | Readonly<{
            kind: "result";
            result: CustomExerciseArchiveMutationResult;
          }>
      >(async (transaction) => {
        const preview = await readArchivePreview(transaction, {
          exerciseId: input.exerciseId,
          expectedExerciseRevision: input.expectedExerciseRevision,
        });
        if (isConflictOutcome(preview)) {
          return {
            kind: "conflict",
            code: preview.code,
          };
        }
        if (
          preview.preferenceRevision
            !== input.expectedPreferenceRevision
        ) {
          return {
            kind: "conflict",
            code: "custom_exercise_preference_revision_conflict",
          };
        }
        if (preview.previewRevision !== input.previewRevision) {
          return {
            kind: "conflict",
            code: "custom_exercise_preview_revision_conflict",
          };
        }
        const preference = await readPreference(
          transaction,
          input.exerciseId,
        );
        const preferenceRevision = await writePreference(transaction, {
          exerciseId: input.exerciseId,
          preference,
          archived: input.archived,
          updatedAtMs: input.updatedAtMs,
        });
        const affectedPlanIds = Object.freeze(
          preview.affectedPlans.map(({ planId }) => planId),
        );
        return {
          kind: "result",
          result: Object.freeze({
            outcome: "committed",
            exerciseId: input.exerciseId,
            archived: input.archived,
            preferenceRevision,
            affectedPlanIds,
            invalidations: lifecycleInvalidations(
              input.exerciseId,
              affectedPlanIds,
            ),
          }),
        };
      });
      if (outcome.kind === "conflict") {
        throw new CustomExerciseConflictError(outcome.code);
      }
      rememberLifecycle(
        archiveReceipts,
        kernel,
        input.requestId,
        input,
        outcome.result,
      );
      return outcome.result;
    },

    async listExercisePlanReferences(exerciseId) {
      const [preference, rows] = await Promise.all([
        readPreference(kernel, exerciseId),
        readPlanReferenceRows(kernel, exerciseId),
      ]);
      const statusLabel = preference?.archived === 1
        ? "Archived" as const
        : null;
      return Object.freeze(rows.map((row) => Object.freeze({
        planId: row.plan_id,
        planName: row.plan_name,
        dayId: row.day_id,
        dayName: row.day_name,
        occurrenceId: row.occurrence_id,
        statusLabel,
        runnable: true as const,
      })));
    },
  });
}
