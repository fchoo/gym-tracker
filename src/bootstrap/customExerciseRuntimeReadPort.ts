import {
  formatMetricDuration,
} from "../domains/metrics/aggregates";
import type {
  MetricIdentity,
  MetricTarget,
} from "../domains/metrics";
import {
  parseMetricTargetJson,
} from "../domains/metrics";
import type {
  CustomExerciseRepository,
  ExercisePlanReference,
} from "../platform/sqlite/repositories/customExerciseRepository";
import type {
  SqliteKernel,
} from "../platform/sqlite";

export type CustomExerciseRuntimeDetail = Readonly<{
  exerciseId: string;
  name: string;
  origin: "bundled" | "custom" | "copied";
  originLabel: "Built-in" | "Custom";
  exerciseType: string;
  movementClass: string;
  aliases: readonly string[];
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: readonly string[];
  metricIdentity: MetricIdentity;
  defaultRestSeconds: number;
  availability: "available" | "unavailable";
  favorite: boolean;
  hidden: boolean;
  archived: boolean;
  exerciseRevision: number;
  preferenceRevision: number | null;
  source: Readonly<{
    namespace: string;
    revision: string;
    license: string;
    attribution: string;
  }> | null;
  references: readonly ExercisePlanReference[];
}>;

export type CustomExerciseRuntimeMigration = Readonly<{
  exerciseId: string;
  exerciseName: string;
  exerciseRevision: number;
  fromIdentity: MetricIdentity;
  activeWorkoutSessionId: string | null;
  occurrences: readonly Readonly<{
    graph: "legacy" | "owned";
    planId: string;
    planName: string;
    dayId: string;
    dayName: string;
    occurrenceId: string;
    occurrenceRevision: number;
    policyRevision: number | null;
    targets: readonly Readonly<{
      targetId: string;
      targetRevision: number;
      ordinal: number;
      currentTarget: string;
    }>[];
  }>[];
}>;

export type CustomExerciseReadServices = Readonly<{
  customExerciseRepository: Pick<
    CustomExerciseRepository,
    "listExercisePlanReferences"
  >;
  kernel: SqliteKernel;
}>;

type CustomExerciseDetailRow = Readonly<{
  exercise_id: string;
  origin: "bundled" | "custom" | "copied";
  canonical_name: string;
  exercise_type: string;
  movement_class: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
  availability: "available" | "unavailable";
  default_rest_seconds: number;
  exercise_revision: number;
  library_revision: number;
  favorite: number | null;
  hidden: number | null;
  archived: number | null;
  preference_revision: number | null;
  source_namespace: string | null;
  source_revision: string | null;
  license: string | null;
  attribution: string | null;
}>;

type CustomExerciseTaxonomyRow = Readonly<{
  kind: "equipment" | "exercise_type" | "movement_class" | "muscle";
  relation: "equipment" | "movement" | "primary" | "secondary" | "type";
  slug: string;
  ordinal: number;
}>;

type CustomExerciseAliasRow = Readonly<{
  display_text: string;
}>;

type CustomExerciseActiveWorkoutRow = Readonly<{
  session_id: string;
}>;

type CustomExerciseMigrationOccurrenceRow = Readonly<{
  graph: "legacy" | "owned";
  plan_id: string;
  plan_name: string;
  day_id: string;
  day_name: string;
  occurrence_id: string;
  occurrence_revision: number;
  policy_revision: number | null;
}>;

type CustomExerciseMigrationTargetRow = Readonly<{
  graph: "legacy" | "owned";
  occurrence_id: string;
  target_id: string;
  target_revision: number;
  ordinal: number;
  target_json: string;
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>;

function customExerciseIdentity(row: Readonly<{
  metric_profile: MetricIdentity["profile"];
  metric_contract_version: number;
  exercise_metric_generation: number;
}>): MetricIdentity {
  return Object.freeze({
    profile: row.metric_profile,
    contractVersion: row.metric_contract_version,
    exerciseMetricGeneration: row.exercise_metric_generation,
  });
}

function formatCustomTarget(target: MetricTarget): string {
  switch (target.profile) {
    case "load_reps":
      return `${target.loadGrams / 1_000} kg · ${target.minReps}–${target.maxReps} reps`;
    case "bodyweight_reps":
      return `${target.minReps}–${target.maxReps} reps · ${target.variationId}`;
    case "added_load_reps":
      return `+${target.addedLoadGrams / 1_000} kg · ${target.minReps}–${target.maxReps} reps`;
    case "assisted_reps":
      return `${target.assistanceGrams / 1_000} kg assist · ${target.minReps}–${target.maxReps} reps`;
    case "timed_hold":
      return target.version === 1
        ? `${target.durationSeconds} sec`
        : formatMetricDuration(target.durationMs);
    case "fixed_distance":
      return `${target.plannedDistanceMeters} m`;
    case "fixed_time":
      return formatMetricDuration(target.plannedDurationMs);
    case "intervals":
      return `${target.plannedRounds} rounds · ${formatMetricDuration(target.workIntervalMs)} work · ${formatMetricDuration(target.restIntervalMs)} rest`;
    case "unscored":
      return "Completed";
  }
}

export async function readCustomExerciseDetail(
  services: CustomExerciseReadServices,
  exerciseId: string,
): Promise<CustomExerciseRuntimeDetail | null> {
  const [row] = await services.kernel.queryAll<CustomExerciseDetailRow>(
    `SELECT entry.exercise_id, entry.origin, entry.canonical_name,
            entry.exercise_type, entry.movement_class,
            entry.metric_profile, entry.metric_contract_version,
            entry.exercise_metric_generation, entry.availability,
            source.default_rest_seconds,
            source.revision AS exercise_revision,
            entry.revision AS library_revision,
            preference.favorite, preference.hidden, preference.archived,
            preference.revision AS preference_revision,
            catalog.source_namespace, catalog.source_revision,
            catalog.license, catalog.attribution
     FROM exercise_library_entries entry
     JOIN exercises source ON source.id = entry.exercise_id
     LEFT JOIN exercise_owner_preferences preference
       ON preference.exercise_id = entry.exercise_id
     LEFT JOIN exercise_catalog_sources catalog
       ON catalog.exercise_id = entry.exercise_id
     WHERE entry.exercise_id = ?`,
    [exerciseId],
  );
  if (row === undefined) {
    return null;
  }
  if (
    row.origin === "custom"
    && row.exercise_revision !== row.library_revision
  ) {
    throw new Error("custom_exercise_revision_inconsistent");
  }
  const [aliases, taxonomy, references] = await Promise.all([
    services.kernel.queryAll<CustomExerciseAliasRow>(
      `SELECT display_text
       FROM exercise_aliases
       WHERE exercise_id = ?
       ORDER BY ordinal, id`,
      [exerciseId],
    ),
    services.kernel.queryAll<CustomExerciseTaxonomyRow>(
      `SELECT kind, relation, slug, ordinal
       FROM exercise_taxonomy
       WHERE exercise_id = ?
       ORDER BY kind, relation, ordinal, slug`,
      [exerciseId],
    ),
    services.customExerciseRepository.listExercisePlanReferences(exerciseId),
  ]);
  return Object.freeze({
    exerciseId: row.exercise_id,
    name: row.canonical_name,
    origin: row.origin,
    originLabel: row.origin === "bundled" ? "Built-in" : "Custom",
    exerciseType: row.exercise_type,
    movementClass: row.movement_class,
    aliases: Object.freeze(aliases.map(({ display_text }) => display_text)),
    primaryMuscles: Object.freeze(taxonomy
      .filter(({ kind, relation }) =>
        kind === "muscle" && relation === "primary"
      )
      .map(({ slug }) => slug)),
    secondaryMuscles: Object.freeze(taxonomy
      .filter(({ kind, relation }) =>
        kind === "muscle" && relation === "secondary"
      )
      .map(({ slug }) => slug)),
    equipment: Object.freeze(taxonomy
      .filter(({ kind }) => kind === "equipment")
      .map(({ slug }) => slug)),
    metricIdentity: customExerciseIdentity(row),
    defaultRestSeconds: row.default_rest_seconds,
    availability: row.availability,
    favorite: row.favorite === 1,
    hidden: row.hidden === 1,
    archived: row.archived === 1,
    exerciseRevision: row.exercise_revision,
    preferenceRevision: row.preference_revision,
    source: row.source_namespace === null
      ? null
      : Object.freeze({
          namespace: row.source_namespace,
          revision: row.source_revision!,
          license: row.license!,
          attribution: row.attribution!,
        }),
    references: Object.freeze([...references]),
  });
}

export async function readCustomExerciseMigration(
  services: CustomExerciseReadServices,
  exerciseId: string,
): Promise<CustomExerciseRuntimeMigration | null> {
  const detail = await readCustomExerciseDetail(services, exerciseId);
  if (detail === null || detail.origin !== "custom") {
    return null;
  }
  const [[active], occurrences, targets] = await Promise.all([
    services.kernel.queryAll<CustomExerciseActiveWorkoutRow>(
      `SELECT session.id AS session_id
       FROM workout_sessions session
       JOIN session_exercises exercise
         ON exercise.session_id = session.id
       WHERE session.status = 'in_progress'
         AND exercise.exercise_id = ?
       ORDER BY session.started_at_ms, session.id
       LIMIT 1`,
      [exerciseId],
    ),
    services.kernel.queryAll<CustomExerciseMigrationOccurrenceRow>(
      `SELECT graph, plan_id, plan_name, day_id, day_name,
              occurrence_id, occurrence_revision, policy_revision
       FROM (
         SELECT 'legacy' AS graph, plan.id AS plan_id,
                plan.name AS plan_name, day.id AS day_id,
                day.name AS day_name, occurrence.id AS occurrence_id,
                occurrence.revision AS occurrence_revision,
                policy.revision AS policy_revision
         FROM plan_day_exercises occurrence
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         JOIN plans plan ON plan.id = day.plan_id
         LEFT JOIN progression_policies policy
           ON policy.plan_day_exercise_id = occurrence.id
          AND policy.status = 'active'
         WHERE occurrence.exercise_id = ?
         UNION ALL
         SELECT 'owned' AS graph, plan.id AS plan_id,
                plan.name AS plan_name, day.id AS day_id,
                day.name AS day_name, occurrence.id AS occurrence_id,
                occurrence.revision AS occurrence_revision,
                policy.revision AS policy_revision
         FROM owned_plan_day_exercises occurrence
         JOIN plan_days day ON day.id = occurrence.plan_day_id
         JOIN plans plan ON plan.id = day.plan_id
         LEFT JOIN owned_plan_progression_policies policy
           ON policy.plan_day_exercise_id = occurrence.id
          AND policy.status = 'active'
         WHERE occurrence.exercise_id = ?
       )
       ORDER BY plan_name, day_name, occurrence_id, graph`,
      [exerciseId, exerciseId],
    ),
    services.kernel.queryAll<CustomExerciseMigrationTargetRow>(
      `SELECT graph, occurrence_id, target_id, target_revision, ordinal,
              target_json, metric_profile, metric_contract_version,
              exercise_metric_generation
       FROM (
         SELECT 'legacy' AS graph, occurrence.id AS occurrence_id,
                target.id AS target_id,
                target.revision AS target_revision, target.ordinal,
                target.target_json, target.metric_profile,
                target.metric_contract_version,
                target.exercise_metric_generation
         FROM plan_working_set_targets target
         JOIN plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         WHERE occurrence.exercise_id = ?
         UNION ALL
         SELECT 'owned' AS graph, occurrence.id AS occurrence_id,
                target.id AS target_id,
                target.revision AS target_revision, target.ordinal,
                target.target_json, target.metric_profile,
                target.metric_contract_version,
                target.exercise_metric_generation
         FROM owned_plan_working_set_targets target
         JOIN owned_plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         WHERE occurrence.exercise_id = ?
       )
       ORDER BY occurrence_id, ordinal, target_id, graph`,
      [exerciseId, exerciseId],
    ),
  ]);
  return Object.freeze({
    exerciseId: detail.exerciseId,
    exerciseName: detail.name,
    exerciseRevision: detail.exerciseRevision,
    fromIdentity: detail.metricIdentity,
    activeWorkoutSessionId: active?.session_id ?? null,
    occurrences: Object.freeze(occurrences.map((occurrence) =>
      Object.freeze({
        graph: occurrence.graph,
        planId: occurrence.plan_id,
        planName: occurrence.plan_name,
        dayId: occurrence.day_id,
        dayName: occurrence.day_name,
        occurrenceId: occurrence.occurrence_id,
        occurrenceRevision: occurrence.occurrence_revision,
        policyRevision: occurrence.policy_revision,
        targets: Object.freeze(targets
          .filter(({ occurrence_id }) =>
            occurrence_id === occurrence.occurrence_id
          )
          .map((target) => {
            const identity = customExerciseIdentity(target);
            return Object.freeze({
              targetId: target.target_id,
              targetRevision: target.target_revision,
              ordinal: target.ordinal,
              currentTarget: formatCustomTarget(
                parseMetricTargetJson(identity, target.target_json),
              ),
            });
          })),
      })
    )),
  });
}

export function createCustomExerciseRuntimeReadPort(
  services: CustomExerciseReadServices,
) {
  return Object.freeze({
    loadExercise: (exerciseId: string) =>
      readCustomExerciseDetail(services, exerciseId),
    loadMigration: (exerciseId: string) =>
      readCustomExerciseMigration(services, exerciseId),
  });
}
