import {
  LOGICAL_BACKUP_FORMAT_VERSION,
  LOGICAL_BACKUP_TABLE_DEFINITIONS,
  LOGICAL_BACKUP_TABLES,
  parseLogicalBackupSnapshot,
  type LogicalBackupRow,
  type LogicalBackupSnapshot,
  type LogicalBackupValue,
} from "../../../domains/portability/backupContracts";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

type LogicalTableName = keyof typeof LOGICAL_BACKUP_TABLE_DEFINITIONS;

export type LogicalBackupRepository = Readonly<{
  collect(input: Readonly<{
    snapshotId: string;
    createdAtMs: number;
  }>): Promise<LogicalBackupSnapshot>;
}>;

export class LogicalBackupRepositoryError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-BACKUP02" as const;

  constructor(readonly code: "logical_backup_collection_failed") {
    super(code);
    this.name = "LogicalBackupRepositoryError";
  }
}

function identifier(value: string): string {
  // Logical table names come from the compile-time registry, whose keys are
  // lowercase underscore identifiers. Keep quoting here so SQL stays stable.
  return '"' + value + '"';
}

function orderBy(table: LogicalTableName): string {
  return LOGICAL_BACKUP_TABLE_DEFINITIONS[table].primaryKey
    .map(identifier)
    .join(", ");
}

function ownedPlanWhere(alias: string): string {
  return "EXISTS (SELECT 1 FROM plans plan WHERE plan.id = "
    + alias + ".plan_id AND plan.origin IN ('custom', 'copied'))";
}

function ownedPlanDayWhere(alias: string): string {
  return "EXISTS (SELECT 1 FROM plan_days day JOIN plans plan ON plan.id = day.plan_id WHERE day.id = "
    + alias + ".plan_day_id AND plan.origin IN ('custom', 'copied'))";
}

function legacyOccurrenceWhere(alias: string): string {
  return "EXISTS (SELECT 1 FROM plan_day_exercises occurrence JOIN plan_days day ON day.id = occurrence.plan_day_id JOIN plans plan ON plan.id = day.plan_id WHERE occurrence.id = "
    + alias + ".plan_day_exercise_id AND plan.origin IN ('custom', 'copied'))";
}

function ownedOccurrenceWhere(alias: string): string {
  return "EXISTS (SELECT 1 FROM owned_plan_day_exercises occurrence JOIN plan_days day ON day.id = occurrence.plan_day_id JOIN plans plan ON plan.id = day.plan_id WHERE occurrence.id = "
    + alias + ".plan_day_exercise_id AND plan.origin IN ('custom', 'copied'))";
}

/**
 * The backup registry is intentionally complete and fail-closed. Adding a
 * source table to the logical contract requires an explicit ownership rule;
 * TypeScript rejects a missing table instead of silently applying an
 * unrestricted query. A literal "1" is used only for tables whose rows are
 * categorically user-owned source facts.
 */
export const LOGICAL_BACKUP_TABLE_FILTERS = Object.freeze({
  app_settings: "1",
  exercise_owner_preferences: "1",
  exercises: "origin IN ('custom', 'copied')",
  exercise_library_entries: "EXISTS (SELECT 1 FROM exercises exercise WHERE exercise.id = exercise_library_entries.exercise_id AND exercise.origin IN ('custom', 'copied'))",
  exercise_aliases: "EXISTS (SELECT 1 FROM exercises exercise WHERE exercise.id = exercise_aliases.exercise_id AND exercise.origin IN ('custom', 'copied'))",
  exercise_search_terms: "EXISTS (SELECT 1 FROM exercises exercise WHERE exercise.id = exercise_search_terms.exercise_id AND exercise.origin IN ('custom', 'copied'))",
  exercise_taxonomy: "EXISTS (SELECT 1 FROM exercises exercise WHERE exercise.id = exercise_taxonomy.exercise_id AND exercise.origin IN ('custom', 'copied'))",
  taxonomy_terms: "EXISTS (SELECT 1 FROM exercise_taxonomy taxonomy JOIN exercises exercise ON exercise.id = taxonomy.exercise_id WHERE taxonomy.kind = taxonomy_terms.kind AND taxonomy.slug = taxonomy_terms.slug AND exercise.origin IN ('custom', 'copied'))",
  metric_profile_migration_events: "EXISTS (SELECT 1 FROM exercises exercise WHERE exercise.id = metric_profile_migration_events.exercise_id AND exercise.origin IN ('custom', 'copied'))",
  exercise_metric_baselines: "EXISTS (SELECT 1 FROM exercises exercise WHERE exercise.id = exercise_metric_baselines.exercise_id AND exercise.origin IN ('custom', 'copied'))",
  plans: "origin IN ('custom', 'copied')",
  plan_schedules: ownedPlanWhere("plan_schedules"),
  plan_schedule_bindings: "EXISTS (SELECT 1 FROM plan_schedules schedule JOIN plans plan ON plan.id = schedule.plan_id WHERE schedule.id = plan_schedule_bindings.schedule_id AND plan.origin IN ('custom', 'copied'))",
  plan_days: ownedPlanWhere("plan_days"),
  plan_day_exercises: ownedPlanDayWhere("plan_day_exercises"),
  plan_warmup_sets: legacyOccurrenceWhere("plan_warmup_sets"),
  plan_working_set_targets: legacyOccurrenceWhere("plan_working_set_targets"),
  progression_policies: legacyOccurrenceWhere("progression_policies"),
  progression_recommendations: "EXISTS (SELECT 1 FROM plan_working_set_targets target JOIN plan_day_exercises occurrence ON occurrence.id = target.plan_day_exercise_id JOIN plan_days day ON day.id = occurrence.plan_day_id JOIN plans plan ON plan.id = day.plan_id WHERE target.id = progression_recommendations.plan_working_set_target_id AND plan.origin IN ('custom', 'copied'))",
  owned_plan_aggregate_states: ownedPlanWhere("owned_plan_aggregate_states"),
  owned_plan_mutation_requests: "EXISTS (SELECT 1 FROM plans plan WHERE plan.id = owned_plan_mutation_requests.result_plan_id AND plan.origin IN ('custom', 'copied')) OR EXISTS (SELECT 1 FROM plans plan WHERE plan.id = owned_plan_mutation_requests.source_plan_id AND plan.origin IN ('custom', 'copied'))",
  owned_plan_starter_sources: ownedPlanWhere("owned_plan_starter_sources"),
  owned_plan_day_sources: ownedPlanWhere("owned_plan_day_sources"),
  owned_plan_day_exercises: ownedPlanDayWhere("owned_plan_day_exercises"),
  owned_plan_warmup_sets: ownedOccurrenceWhere("owned_plan_warmup_sets"),
  owned_plan_working_set_targets: ownedOccurrenceWhere("owned_plan_working_set_targets"),
  owned_plan_progression_policies: ownedOccurrenceWhere("owned_plan_progression_policies"),
  owned_plan_occurrence_sources: ownedOccurrenceWhere("owned_plan_occurrence_sources"),
  owned_plan_schedules: ownedPlanWhere("owned_plan_schedules"),
  owned_plan_schedule_versions: "EXISTS (SELECT 1 FROM owned_plan_schedules schedule JOIN plans plan ON plan.id = schedule.plan_id WHERE schedule.id = owned_plan_schedule_versions.schedule_id AND plan.origin IN ('custom', 'copied'))",
  owned_plan_schedule_bindings: "EXISTS (SELECT 1 FROM owned_plan_schedule_versions version JOIN owned_plan_schedules schedule ON schedule.id = version.schedule_id JOIN plans plan ON plan.id = schedule.plan_id WHERE version.id = owned_plan_schedule_bindings.schedule_version_id AND plan.origin IN ('custom', 'copied'))",
  owned_plan_schedule_overrides: "EXISTS (SELECT 1 FROM owned_plan_schedules schedule JOIN plans plan ON plan.id = schedule.plan_id WHERE schedule.id = owned_plan_schedule_overrides.schedule_id AND plan.origin IN ('custom', 'copied'))",
  owned_plan_schedule_opportunities: "EXISTS (SELECT 1 FROM owned_plan_schedules schedule JOIN plans plan ON plan.id = schedule.plan_id WHERE schedule.id = owned_plan_schedule_opportunities.schedule_id AND plan.origin IN ('custom', 'copied'))",
  owned_plan_schedule_events: "EXISTS (SELECT 1 FROM owned_plan_schedules schedule JOIN plans plan ON plan.id = schedule.plan_id WHERE schedule.id = owned_plan_schedule_events.schedule_id AND plan.origin IN ('custom', 'copied'))",
  starter_plan_activation_requests: "EXISTS (SELECT 1 FROM plans plan WHERE plan.id = starter_plan_activation_requests.result_plan_id AND plan.origin IN ('custom', 'copied'))",
  workout_sessions: "1",
  session_exercises: "1",
  session_sets: "1",
  session_rest_states: "1",
  session_undo_snapshots: "1",
  history_session_overlays: "1",
  history_audit_events: "1",
  owned_progression_recommendations: "EXISTS (SELECT 1 FROM owned_plan_working_set_targets target JOIN owned_plan_day_exercises occurrence ON occurrence.id = target.plan_day_exercise_id JOIN plan_days day ON day.id = occurrence.plan_day_id JOIN plans plan ON plan.id = day.plan_id WHERE target.id = owned_progression_recommendations.owned_plan_working_set_target_id AND plan.origin IN ('custom', 'copied'))",
} satisfies Readonly<Record<LogicalTableName, string>>);

function whereClause(table: LogicalTableName): string {
  return LOGICAL_BACKUP_TABLE_FILTERS[table];
}

function tableQuery(table: LogicalTableName): string {
  const quoted = identifier(table);
  return "SELECT * FROM " + quoted + " WHERE " + whereClause(table)
    + " ORDER BY " + orderBy(table);
}

function mapValue(value: unknown): LogicalBackupValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  throw new LogicalBackupRepositoryError("logical_backup_collection_failed");
}

function mapRow(row: Record<string, unknown>): LogicalBackupRow {
  const result: Record<string, LogicalBackupValue> = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = mapValue(value);
  }
  return Object.freeze(result);
}

async function collectTables(
  transaction: SqliteTransactionExecutor,
): Promise<LogicalBackupSnapshot["tables"]> {
  const tables: Record<string, readonly LogicalBackupRow[]> = {};
  for (const table of LOGICAL_BACKUP_TABLES) {
    const rows = await transaction.queryAll(tableQuery(table as LogicalTableName));
    tables[table] = Object.freeze(rows.map(mapRow));
  }
  return Object.freeze(tables);
}

type CatalogReferenceRow = Readonly<{
  kind: "exercise" | "plan";
  source_namespace: string;
  upstream_id: string;
  source_revision: string;
}>;

async function collectCatalogReferences(
  transaction: SqliteTransactionExecutor,
): Promise<LogicalBackupSnapshot["catalogReferences"]> {
  const rows = await transaction.queryAll<CatalogReferenceRow>(
    "SELECT 'exercise' AS kind, source.source_namespace, COALESCE(source.upstream_id, source.linked_upstream_id) AS upstream_id, source.source_revision FROM exercise_catalog_sources source WHERE source.exercise_id IN (SELECT exercise_id FROM exercise_owner_preferences UNION SELECT exercise_id FROM session_exercises UNION SELECT occurrence.exercise_id FROM plan_day_exercises occurrence JOIN plan_days day ON day.id = occurrence.plan_day_id JOIN plans plan ON plan.id = day.plan_id WHERE plan.origin IN ('custom', 'copied') UNION SELECT occurrence.exercise_id FROM owned_plan_day_exercises occurrence JOIN plan_days day ON day.id = occurrence.plan_day_id JOIN plans plan ON plan.id = day.plan_id WHERE plan.origin IN ('custom', 'copied')) AND COALESCE(source.upstream_id, source.linked_upstream_id) IS NOT NULL UNION SELECT 'plan' AS kind, source.source_namespace, source.template_id AS upstream_id, CAST(source.source_revision AS TEXT) AS source_revision FROM owned_plan_starter_sources source JOIN plans plan ON plan.id = source.plan_id WHERE plan.origin IN ('custom', 'copied') UNION SELECT 'plan' AS kind, request.source_namespace, request.template_id AS upstream_id, CAST(request.source_revision AS TEXT) AS source_revision FROM starter_plan_activation_requests request JOIN plans plan ON plan.id = request.result_plan_id WHERE plan.origin IN ('custom', 'copied') ORDER BY kind, source_namespace, upstream_id, source_revision",
  );
  const references = new Map<string, LogicalBackupSnapshot["catalogReferences"][number]>();
  for (const row of rows) {
    const reference = Object.freeze({
      kind: row.kind,
      sourceNamespace: row.source_namespace,
      upstreamId: row.upstream_id,
      sourceRevision: row.source_revision,
    });
    if (reference.sourceNamespace.trim().length === 0
      || reference.upstreamId.trim().length === 0
      || reference.sourceRevision.trim().length === 0) {
      throw new LogicalBackupRepositoryError("logical_backup_collection_failed");
    }
    references.set(JSON.stringify([
      reference.kind,
      reference.sourceNamespace,
      reference.upstreamId,
      reference.sourceRevision,
    ]), reference);
  }
  return Object.freeze([...references.values()]);
}

export function createLogicalBackupRepository(
  kernel: SqliteKernel,
): LogicalBackupRepository {
  return Object.freeze({
    async collect(input) {
      try {
        return await kernel.write(async (transaction) => {
          const [schema] = await transaction.queryAll<{ user_version: number }>(
            "PRAGMA user_version",
          );
          if (schema === undefined || !Number.isSafeInteger(schema.user_version)) {
            throw new LogicalBackupRepositoryError("logical_backup_collection_failed");
          }
          const tables = await collectTables(transaction);
          const catalogReferences = await collectCatalogReferences(transaction);
          const rowCounts = Object.fromEntries(
            LOGICAL_BACKUP_TABLES.map((table) => [table, tables[table]!.length]),
          );
          return parseLogicalBackupSnapshot({
            version: LOGICAL_BACKUP_FORMAT_VERSION,
            snapshotId: input.snapshotId,
            createdAtMs: input.createdAtMs,
            schemaVersion: schema.user_version,
            manifest: {
              catalogReferenceCount: catalogReferences.length,
              rowCounts,
              totalRows: Object.values(rowCounts).reduce(
                (total, count) => total + count,
                0,
              ),
            },
            tables,
            catalogReferences,
          });
        });
      } catch {
        throw new LogicalBackupRepositoryError("logical_backup_collection_failed");
      }
    },
  });
}
