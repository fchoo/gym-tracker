import type {
  MetricPolicyDecision,
  MetricProfileMigrationResult,
  MigrateCustomExerciseMetricProfileInput,
} from "../../../domains/metrics/migrateCustomExerciseMetricProfile";
import type {
  MetricIdentity,
} from "../../../domains/metrics/contracts";
import {
  metricIdentityKey,
} from "../../../domains/metrics/contracts";
import {
  serializeMetricTarget,
} from "../../../domains/metrics/observations";
import {
  getMetricContract,
} from "../../../domains/metrics/registry";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export type ComparableMetricHistoryEntry = Readonly<{
  sessionId: string;
  setId: string;
  setOrdinal: number;
  completedAtMs: number;
  targetJson: string;
  observationJson: string;
}>;

export interface MetricProfileMigrationRepository {
  migrateCustomExerciseMetricProfile(
    input: MigrateCustomExerciseMetricProfileInput,
  ): Promise<MetricProfileMigrationResult>;
  readComparableHistory(input: Readonly<{
    exerciseId: string;
    identity: MetricIdentity;
  }>): Promise<readonly ComparableMetricHistoryEntry[]>;
}

export type MetricProfileMigrationConflictCode =
  | "metric_profile_active_workout"
  | "metric_profile_custom_required"
  | "metric_profile_exercise_not_found"
  | "metric_profile_exercise_revision_conflict"
  | "metric_profile_idempotency_conflict"
  | "metric_profile_identity_conflict"
  | "metric_profile_policy_decision_incomplete"
  | "metric_profile_policy_revision_conflict"
  | "metric_profile_replacement_incomplete"
  | "metric_profile_target_revision_conflict";

export class MetricProfileMigrationConflictError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-METRIC04" as const;

  constructor(readonly code: MetricProfileMigrationConflictCode) {
    super(code);
    this.name = "MetricProfileMigrationConflictError";
  }
}

type ExerciseRow = Readonly<{
  origin: "bundled" | "copied" | "custom";
  revision: number;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  library_origin: "bundled" | "copied" | "custom" | null;
  library_revision: number | null;
  library_metric_profile: MetricIdentity["profile"] | null;
  library_metric_contract_version: number | null;
  library_exercise_metric_generation: number | null;
}>;

type TargetRow = Readonly<{
  graph: "legacy" | "owned";
  id: string;
  plan_day_exercise_id: string;
  revision: number;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type OccurrenceRow = Readonly<{
  graph: "legacy" | "owned";
  id: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

type PolicyRow = Readonly<{
  graph: "legacy" | "owned";
  id: string;
  plan_day_exercise_id: string;
  revision: number;
}>;

type MigrationEventRow = Readonly<{
  request_json: string;
  result_json: string;
}>;

type StagedReplacement = Readonly<{
  targetId: string;
  expectedTargetRevision: number;
  targetJson: string;
  unitJson: string;
}>;

type StagedPolicy = Readonly<{
  planDayExerciseId: string;
  expectedPolicyRevision: number | null;
  policyKind: "automatic" | "manual_hold";
  policyType: string;
  policyVersion: number;
  ruleJson: string;
}>;

type StagedMigration = Readonly<{
  replacements: readonly StagedReplacement[];
  policies: readonly StagedPolicy[];
  requestJson: string;
}>;

type TransactionOutcome =
  | Readonly<{
      kind: "conflict";
      code: MetricProfileMigrationConflictCode;
    }>
  | Readonly<{
      kind: "result";
      result: MetricProfileMigrationResult;
    }>;

function identityFromRow(row: Readonly<{
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>): MetricIdentity {
  return {
    profile: row.metric_profile,
    contractVersion: row.metric_contract_version,
    exerciseMetricGeneration: row.exercise_metric_generation,
  };
}

function sameIdentity(
  row: Readonly<{
    metric_profile: MetricIdentity["profile"];
    metric_contract_version: number;
    exercise_metric_generation: number;
  }>,
  identity: MetricIdentity,
): boolean {
  return metricIdentityKey(identityFromRow(row)) === metricIdentityKey(identity);
}

function exactIds(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.join("\u0000") === right.join("\u0000");
}

function serializeUnit(unit: Readonly<Record<string, unknown>>): string {
  const serialized = JSON.stringify(unit);
  if (serialized === undefined) {
    throw new TypeError("metric_profile_replacement_invalid");
  }
  return serialized;
}

function stagePolicy(
  decision: MetricPolicyDecision,
): StagedPolicy {
  if (decision.policy.kind === "manual_hold") {
    return {
      planDayExerciseId: decision.planDayExerciseId,
      expectedPolicyRevision: decision.expectedPolicyRevision,
      policyKind: "manual_hold",
      policyType: "manual_hold",
      policyVersion: decision.policy.version,
      ruleJson: JSON.stringify({
        version: decision.policy.version,
        progression: "manual",
      }),
    };
  }
  return {
    planDayExerciseId: decision.planDayExerciseId,
    expectedPolicyRevision: decision.expectedPolicyRevision,
    policyKind: "automatic",
    policyType: decision.policy.profile,
    policyVersion: decision.policy.version,
    ruleJson: JSON.stringify(decision.policy.rule),
  };
}

function stageMigration(
  input: MigrateCustomExerciseMetricProfileInput,
): StagedMigration {
  getMetricContract(input.fromIdentity);
  getMetricContract(input.toIdentity);
  if (
    input.toIdentity.exerciseMetricGeneration
    !== input.fromIdentity.exerciseMetricGeneration + 1
  ) {
    throw new TypeError("metric_profile_generation_invalid");
  }
  const replacements = input.replacements.map((replacement) => ({
      targetId: replacement.targetId,
      expectedTargetRevision: replacement.expectedTargetRevision,
      targetJson: serializeMetricTarget(
        input.toIdentity,
        replacement.target,
      ),
      unitJson: serializeUnit(replacement.unit),
    }));
  const policies = input.policyDecisions.map(stagePolicy);
  return {
    replacements,
    policies,
    requestJson: JSON.stringify({
      exerciseId: input.exerciseId,
      expectedExerciseRevision: input.expectedExerciseRevision,
      fromIdentity: input.fromIdentity,
      toIdentity: input.toIdentity,
      replacements: replacements.map((replacement) => ({
        targetId: replacement.targetId,
        expectedTargetRevision: replacement.expectedTargetRevision,
        targetJson: replacement.targetJson,
        unitJson: replacement.unitJson,
      })).sort((left, right) => left.targetId.localeCompare(right.targetId)),
      policies: policies.map((policy) => ({
        planDayExerciseId: policy.planDayExerciseId,
        expectedPolicyRevision: policy.expectedPolicyRevision,
        policyKind: policy.policyKind,
        policyType: policy.policyType,
        policyVersion: policy.policyVersion,
        ruleJson: policy.ruleJson,
      })).sort((left, right) =>
        left.planDayExerciseId.localeCompare(right.planDayExerciseId)
      ),
      acknowledgedHistoryImmutable: input.acknowledgedHistoryImmutable,
      migratedAtMs: input.migratedAtMs,
    }),
  };
}

function conflict(
  code: MetricProfileMigrationConflictCode,
): TransactionOutcome {
  return { kind: "conflict", code };
}

function parseCommittedResult(
  event: MigrationEventRow,
  staged: StagedMigration,
): TransactionOutcome {
  if (event.request_json !== staged.requestJson) {
    return conflict("metric_profile_idempotency_conflict");
  }
  const parsed = JSON.parse(event.result_json) as MetricProfileMigrationResult;
  return {
    kind: "result",
    result: {
      ...parsed,
      outcome: "already_committed",
    },
  };
}

async function readExercise(
  transaction: SqliteTransactionExecutor,
  exerciseId: string,
): Promise<ExerciseRow | undefined> {
  const [exercise] = await transaction.queryAll<ExerciseRow>(
    `SELECT e.origin, e.revision, e.metric_profile,
            e.metric_contract_version, e.exercise_metric_generation,
            library.origin AS library_origin,
            library.revision AS library_revision,
            library.metric_profile AS library_metric_profile,
            library.metric_contract_version
              AS library_metric_contract_version,
            library.exercise_metric_generation
              AS library_exercise_metric_generation
     FROM exercises e
     LEFT JOIN exercise_library_entries library
       ON library.exercise_id = e.id
     WHERE e.id = ?`,
    [exerciseId],
  );
  return exercise;
}

async function classifyMigration(
  transaction: SqliteTransactionExecutor,
  input: MigrateCustomExerciseMetricProfileInput,
  staged: StagedMigration,
): Promise<Readonly<{
  occurrences: readonly OccurrenceRow[];
  targets: readonly TargetRow[];
  policies: readonly PolicyRow[];
}> | TransactionOutcome> {
  const [event] = await transaction.queryAll<MigrationEventRow>(
    `SELECT request_json, result_json
     FROM metric_profile_migration_events
     WHERE idempotency_key = ?`,
    [input.idempotencyKey],
  );
  if (event !== undefined) {
    return parseCommittedResult(event, staged);
  }

  const exercise = await readExercise(transaction, input.exerciseId);
  if (exercise === undefined || exercise.library_origin === null) {
    return conflict("metric_profile_exercise_not_found");
  }
  if (exercise.origin !== "custom" || exercise.library_origin !== "custom") {
    return conflict("metric_profile_custom_required");
  }
  if (
    exercise.revision !== input.expectedExerciseRevision
    || exercise.library_revision !== input.expectedExerciseRevision
  ) {
    return conflict("metric_profile_exercise_revision_conflict");
  }
  if (
    !sameIdentity(exercise, input.fromIdentity)
    || exercise.library_metric_profile !== input.fromIdentity.profile
    || exercise.library_metric_contract_version
      !== input.fromIdentity.contractVersion
    || exercise.library_exercise_metric_generation
      !== input.fromIdentity.exerciseMetricGeneration
  ) {
    return conflict("metric_profile_identity_conflict");
  }

  const [active] = await transaction.queryAll<{ id: string }>(
    `SELECT session.id
     FROM workout_sessions session
     JOIN session_exercises exercise
       ON exercise.session_id = session.id
     WHERE session.status = 'in_progress'
       AND exercise.exercise_id = ?
     LIMIT 1`,
    [input.exerciseId],
  );
  if (active !== undefined) {
    return conflict("metric_profile_active_workout");
  }

  const occurrences = await transaction.queryAll<OccurrenceRow>(
    `SELECT graph, occurrence_id AS id, metric_profile,
            metric_contract_version, exercise_metric_generation
     FROM (
       SELECT 'legacy' AS graph, id AS occurrence_id, metric_profile,
              metric_contract_version, exercise_metric_generation
       FROM plan_day_exercises
       WHERE exercise_id = ?
       UNION ALL
       SELECT 'owned' AS graph, id AS occurrence_id, metric_profile,
              metric_contract_version, exercise_metric_generation
       FROM owned_plan_day_exercises
       WHERE exercise_id = ?
     )
     ORDER BY occurrence_id, graph`,
    [input.exerciseId, input.exerciseId],
  );
  if (!exactIds(
      occurrences.map(({ id }) => id),
      staged.policies.map(({ planDayExerciseId }) => planDayExerciseId),
    )) {
    return conflict("metric_profile_policy_decision_incomplete");
  }

  const targets = await transaction.queryAll<TargetRow>(
    `SELECT graph, target_id AS id, plan_day_exercise_id, revision,
            metric_profile, metric_contract_version,
            exercise_metric_generation
     FROM (
       SELECT 'legacy' AS graph, target.id AS target_id,
              target.plan_day_exercise_id, target.revision,
              target.metric_profile, target.metric_contract_version,
              target.exercise_metric_generation
       FROM plan_working_set_targets target
       JOIN plan_day_exercises occurrence
         ON occurrence.id = target.plan_day_exercise_id
       WHERE occurrence.exercise_id = ?
       UNION ALL
       SELECT 'owned' AS graph, target.id AS target_id,
              target.plan_day_exercise_id, target.revision,
              target.metric_profile, target.metric_contract_version,
              target.exercise_metric_generation
       FROM owned_plan_working_set_targets target
       JOIN owned_plan_day_exercises occurrence
         ON occurrence.id = target.plan_day_exercise_id
       WHERE occurrence.exercise_id = ?
     )
     ORDER BY target_id, graph`,
    [input.exerciseId, input.exerciseId],
  );
  if (!exactIds(
      targets.map(({ id }) => id),
      staged.replacements.map(({ targetId }) => targetId),
    )) {
    return conflict("metric_profile_replacement_incomplete");
  }
  const replacementById = new Map(
    staged.replacements.map((replacement) => [
      replacement.targetId,
      replacement,
    ]),
  );
  if (
    targets.some(({ id, revision }) =>
      replacementById.get(id)?.expectedTargetRevision !== revision
    )
  ) {
    return conflict("metric_profile_target_revision_conflict");
  }

  const policies = await transaction.queryAll<PolicyRow>(
    `SELECT graph, policy_id AS id, plan_day_exercise_id, revision
     FROM (
       SELECT 'legacy' AS graph, policy.id AS policy_id,
              policy.plan_day_exercise_id, policy.revision
       FROM progression_policies policy
       JOIN plan_day_exercises occurrence
         ON occurrence.id = policy.plan_day_exercise_id
       WHERE occurrence.exercise_id = ?
         AND policy.status = 'active'
       UNION ALL
       SELECT 'owned' AS graph, policy.id AS policy_id,
              policy.plan_day_exercise_id, policy.revision
       FROM owned_plan_progression_policies policy
       JOIN owned_plan_day_exercises occurrence
         ON occurrence.id = policy.plan_day_exercise_id
       WHERE occurrence.exercise_id = ?
         AND policy.status = 'active'
     )
     ORDER BY policy_id, graph`,
    [input.exerciseId, input.exerciseId],
  );
  const policyByOccurrence = new Map(
    policies.map((policy) => [policy.plan_day_exercise_id, policy]),
  );
  if (staged.policies.some((decision) => {
    const existing = policyByOccurrence.get(decision.planDayExerciseId);
    return existing === undefined
      ? decision.expectedPolicyRevision !== null
      : decision.expectedPolicyRevision !== existing.revision;
  })) {
    return conflict("metric_profile_policy_revision_conflict");
  }
  return { occurrences, targets, policies };
}

async function applyMigration(
  transaction: SqliteTransactionExecutor,
  input: MigrateCustomExerciseMetricProfileInput,
  staged: StagedMigration,
  classification: Readonly<{
    occurrences: readonly OccurrenceRow[];
    targets: readonly TargetRow[];
    policies: readonly PolicyRow[];
  }>,
): Promise<MetricProfileMigrationResult> {
  const legacyRecommendationRows = await transaction.queryAll<{ id: string }>(
    `SELECT id
     FROM progression_recommendations
     WHERE exercise_id = ?
       AND status = 'pending'
     ORDER BY id`,
    [input.exerciseId],
  );
  const ownedRecommendationSupport = await transaction.queryAll<{
    supported: 0 | 1;
  }>(
    `SELECT EXISTS(
       SELECT 1
       FROM sqlite_master
       WHERE type = 'table' AND name = 'owned_progression_recommendations'
     ) AS supported`,
  );
  const ownedRecommendationsSupported =
    ownedRecommendationSupport[0]!.supported === 1;
  const ownedRecommendationRows = ownedRecommendationsSupported
    ? await transaction.queryAll<{ id: string }>(
        `SELECT id
         FROM owned_progression_recommendations
         WHERE exercise_id = ?
           AND status = 'pending'
         ORDER BY id`,
        [input.exerciseId],
      )
    : [];
  const invalidatedRecommendationIds = [
    ...legacyRecommendationRows,
    ...ownedRecommendationRows,
  ].map(({ id }) => id).sort();
  const pendingEffectRows = await transaction.queryAll<{ id: string }>(
    `SELECT effect.id
     FROM pending_effects effect
     WHERE effect.effect_type = 'regenerate_load_reps_recommendation'
       AND effect.status IN ('pending', 'processing')
       AND EXISTS (
         SELECT 1
         FROM session_exercises exercise
         WHERE exercise.session_id = effect.subject_id
           AND exercise.exercise_id = ?
       )
     ORDER BY effect.id`,
    [input.exerciseId],
  );
  const invalidatedEffectIds = pendingEffectRows.map(({ id }) => id);
  const invalidatedPolicyIds = classification.policies.map(({ id }) => id)
    .sort();
  const legacyPolicyIds = classification.policies
    .filter(({ graph }) => graph === "legacy")
    .map(({ id }) => id)
    .sort();
  const migratedTargetIds = classification.targets.map(({ id }) => id).sort();

  if (invalidatedRecommendationIds.length > 0) {
    for (const table of [
      "progression_recommendations",
      ...(ownedRecommendationsSupported
        ? ["owned_progression_recommendations"]
        : []),
    ]) {
      await transaction.execute(
        `UPDATE ${table}
         SET status = 'invalidated',
             decided_at_ms = ?
         WHERE exercise_id = ?
           AND status = 'pending'`,
        [input.migratedAtMs, input.exerciseId],
      );
    }
  }
  if (legacyPolicyIds.length > 0) {
    await transaction.execute(
      `UPDATE progression_policies
       SET status = 'invalidated',
           invalidated_at_ms = ?,
           revision = revision + 1
       WHERE id IN (${legacyPolicyIds.map(() => "?").join(", ")})
         AND status = 'active'`,
      [input.migratedAtMs, ...legacyPolicyIds],
    );
  }
  if (invalidatedEffectIds.length > 0) {
    await transaction.execute(
      `UPDATE pending_effects
       SET status = 'superseded',
           claimed_at_ms = NULL,
           lease_expires_at_ms = NULL,
           last_error_code = 'metric_profile_migrated',
           updated_at_ms = ?
       WHERE id IN (${invalidatedEffectIds.map(() => "?").join(", ")})
         AND status IN ('pending', 'processing')`,
      [input.migratedAtMs, ...invalidatedEffectIds],
    );
  }

  const occurrenceGraph = new Map(
    classification.occurrences.map(({ id, graph }) => [id, graph]),
  );
  for (const policy of staged.policies) {
    if (occurrenceGraph.get(policy.planDayExerciseId) === "owned") {
      await transaction.execute(
        `INSERT INTO owned_plan_progression_policies
          (id, plan_day_exercise_id, policy_kind, policy_id, policy_version,
           rule_json, metric_profile, metric_contract_version,
           exercise_metric_generation, status, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)
         ON CONFLICT(plan_day_exercise_id) DO UPDATE SET
           id = excluded.id,
           policy_kind = excluded.policy_kind,
           policy_id = excluded.policy_id,
           policy_version = excluded.policy_version,
           rule_json = excluded.rule_json,
           metric_profile = excluded.metric_profile,
           metric_contract_version = excluded.metric_contract_version,
           exercise_metric_generation =
             excluded.exercise_metric_generation,
           status = 'active',
           revision = owned_plan_progression_policies.revision + 1`,
        [
          `${input.idempotencyKey}:policy:${policy.planDayExerciseId}`,
          policy.planDayExerciseId,
          policy.policyKind,
          policy.policyType,
          policy.policyVersion,
          policy.ruleJson,
          input.toIdentity.profile,
          input.toIdentity.contractVersion,
          input.toIdentity.exerciseMetricGeneration,
        ],
      );
    } else {
      await transaction.execute(
        `INSERT INTO progression_policies
          (id, plan_day_exercise_id, policy_type, policy_version, rule_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, status, invalidated_at_ms, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, 1)`,
        [
          `${input.idempotencyKey}:policy:${policy.planDayExerciseId}`,
          policy.planDayExerciseId,
          policy.policyType,
          policy.policyVersion,
          policy.ruleJson,
          input.toIdentity.profile,
          input.toIdentity.contractVersion,
          input.toIdentity.exerciseMetricGeneration,
        ],
      );
    }
  }

  const targetGraph = new Map(
    classification.targets.map(({ id, graph }) => [id, graph]),
  );
  for (const replacement of staged.replacements) {
    const table = targetGraph.get(replacement.targetId) === "owned"
      ? "owned_plan_working_set_targets"
      : "plan_working_set_targets";
    await transaction.execute(
      `UPDATE ${table}
       SET target_json = ?,
           unit_json = ?,
           metric_profile = ?,
           metric_contract_version = ?,
           exercise_metric_generation = ?,
           revision = revision + 1
       WHERE id = ?`,
      [
        replacement.targetJson,
        replacement.unitJson,
        input.toIdentity.profile,
        input.toIdentity.contractVersion,
        input.toIdentity.exerciseMetricGeneration,
        replacement.targetId,
      ],
    );
  }
  await transaction.execute(
    `UPDATE plan_day_exercises
     SET metric_profile = ?,
         metric_contract_version = ?,
         exercise_metric_generation = ?,
         revision = revision + 1
     WHERE exercise_id = ?`,
    [
      input.toIdentity.profile,
      input.toIdentity.contractVersion,
      input.toIdentity.exerciseMetricGeneration,
      input.exerciseId,
    ],
  );
  await transaction.execute(
    `UPDATE owned_plan_day_exercises
     SET metric_profile = ?,
         metric_contract_version = ?,
         exercise_metric_generation = ?,
         revision = revision + 1
     WHERE exercise_id = ?`,
    [
      input.toIdentity.profile,
      input.toIdentity.contractVersion,
      input.toIdentity.exerciseMetricGeneration,
      input.exerciseId,
    ],
  );
  await transaction.execute(
    `UPDATE exercises
     SET metric_profile = ?,
         metric_contract_version = ?,
         exercise_metric_generation = ?,
         revision = revision + 1
     WHERE id = ?`,
    [
      input.toIdentity.profile,
      input.toIdentity.contractVersion,
      input.toIdentity.exerciseMetricGeneration,
      input.exerciseId,
    ],
  );
  await transaction.execute(
    `UPDATE exercise_library_entries
     SET metric_profile = ?,
         metric_contract_version = ?,
         exercise_metric_generation = ?,
         revision = revision + 1
     WHERE exercise_id = ?`,
    [
      input.toIdentity.profile,
      input.toIdentity.contractVersion,
      input.toIdentity.exerciseMetricGeneration,
      input.exerciseId,
    ],
  );
  await transaction.execute(
    `INSERT INTO exercise_metric_baselines
      (exercise_id, metric_profile, metric_contract_version,
       exercise_metric_generation, status, established_at_ms)
     VALUES (?, ?, ?, ?, 'awaiting_comparable_observation', ?)`,
    [
      input.exerciseId,
      input.toIdentity.profile,
      input.toIdentity.contractVersion,
      input.toIdentity.exerciseMetricGeneration,
      input.migratedAtMs,
    ],
  );

  const result: MetricProfileMigrationResult = {
    outcome: "committed",
    exerciseId: input.exerciseId,
    exerciseRevision: input.expectedExerciseRevision + 1,
    metricIdentity: input.toIdentity,
    migratedTargetIds,
    invalidatedRecommendationIds,
    invalidatedPolicyIds,
    baselineStatus: "awaiting_comparable_observation",
  };
  await transaction.execute(
    `INSERT INTO metric_profile_migration_events
      (idempotency_key, exercise_id, from_metric_profile,
       from_metric_contract_version, from_exercise_metric_generation,
       to_metric_profile, to_metric_contract_version,
       to_exercise_metric_generation, migrated_target_count,
       invalidated_recommendation_count, invalidated_policy_count,
       invalidated_effect_count, exercise_revision, request_json, result_json,
       acknowledged_history_immutable, migrated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      input.idempotencyKey,
      input.exerciseId,
      input.fromIdentity.profile,
      input.fromIdentity.contractVersion,
      input.fromIdentity.exerciseMetricGeneration,
      input.toIdentity.profile,
      input.toIdentity.contractVersion,
      input.toIdentity.exerciseMetricGeneration,
      migratedTargetIds.length,
      invalidatedRecommendationIds.length,
      invalidatedPolicyIds.length,
      invalidatedEffectIds.length,
      result.exerciseRevision,
      staged.requestJson,
      JSON.stringify(result),
      input.migratedAtMs,
    ],
  );
  return result;
}

export function createMetricRepository(
  kernel: SqliteKernel,
): MetricProfileMigrationRepository {
  return Object.freeze({
    async migrateCustomExerciseMetricProfile(
      input: MigrateCustomExerciseMetricProfileInput,
    ) {
      const staged = stageMigration(input);
      const outcome = await kernel.write(async (transaction) => {
        const classification = await classifyMigration(
          transaction,
          input,
          staged,
        );
        if ("kind" in classification) {
          return classification;
        }
        return {
          kind: "result" as const,
          result: await applyMigration(
            transaction,
            input,
            staged,
            classification,
          ),
        };
      });
      if (outcome.kind === "conflict") {
        throw new MetricProfileMigrationConflictError(outcome.code);
      }
      return outcome.result;
    },
    async readComparableHistory(input: Readonly<{
      exerciseId: string;
      identity: MetricIdentity;
    }>) {
      getMetricContract(input.identity);
      return kernel.queryAll<ComparableMetricHistoryEntry>(
        `SELECT session.id AS sessionId,
                set_row.id AS setId,
                set_row.ordinal AS setOrdinal,
                set_row.completed_at_ms AS completedAtMs,
                set_row.target_json AS targetJson,
                set_row.observed_json AS observationJson
         FROM workout_sessions session
         JOIN session_exercises exercise
           ON exercise.session_id = session.id
         JOIN session_sets set_row
           ON set_row.session_exercise_id = exercise.id
         WHERE exercise.exercise_id = ?
           AND exercise.metric_profile = ?
           AND exercise.metric_contract_version = ?
           AND exercise.exercise_metric_generation = ?
           AND set_row.metric_profile = exercise.metric_profile
           AND set_row.metric_contract_version
             = exercise.metric_contract_version
           AND set_row.exercise_metric_generation
             = exercise.exercise_metric_generation
           AND session.status IN ('completed', 'partial')
           AND set_row.set_kind = 'working'
           AND set_row.status = 'completed'
           AND set_row.completed_at_ms IS NOT NULL
           AND set_row.observed_json IS NOT NULL
           AND (
             SELECT COUNT(*)
             FROM session_sets planned
             WHERE planned.session_exercise_id = exercise.id
               AND planned.set_kind = 'working'
           ) > 0
           AND (
             SELECT COUNT(*)
             FROM session_sets completed
             WHERE completed.session_exercise_id = exercise.id
               AND completed.set_kind = 'working'
               AND completed.status = 'completed'
           ) = (
             SELECT COUNT(*)
             FROM session_sets planned
             WHERE planned.session_exercise_id = exercise.id
               AND planned.set_kind = 'working'
           )
         ORDER BY set_row.completed_at_ms DESC,
                  session.id,
                  set_row.ordinal,
                  set_row.id`,
        [
          input.exerciseId,
          input.identity.profile,
          input.identity.contractVersion,
          input.identity.exerciseMetricGeneration,
        ],
      );
    },
  });
}
