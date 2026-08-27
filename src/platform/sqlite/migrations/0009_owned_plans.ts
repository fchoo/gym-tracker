import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export const OWNED_PLAN_MISSING_VALID_TARGET_CODE =
  "owned_plan_missing_valid_target" as const;
export const OWNED_PLAN_MISSING_VALID_TARGET_REASON =
  "Add at least one exercise with valid targets before scheduling or activating." as const;

const SHA256_CHECK = `(
  length(request_sha256) = 64
  AND request_sha256 NOT GLOB '*[^a-f0-9]*'
)`;

const VALID_TARGET_EXISTS = `(EXISTS (
  SELECT 1
  FROM owned_plan_day_exercises occurrence
  JOIN owned_plan_working_set_targets target
    ON target.plan_day_exercise_id = occurrence.id
  JOIN plan_days day ON day.id = occurrence.plan_day_id
  WHERE day.plan_id = plan.id
    AND target.metric_profile = occurrence.metric_profile
    AND target.metric_contract_version = occurrence.metric_contract_version
    AND target.exercise_metric_generation =
      occurrence.exercise_metric_generation
)
OR EXISTS (
  SELECT 1
  FROM plan_day_exercises occurrence
  JOIN plan_working_set_targets target
    ON target.plan_day_exercise_id = occurrence.id
  JOIN plan_days day ON day.id = occurrence.plan_day_id
  WHERE day.plan_id = plan.id
    AND target.metric_profile = occurrence.metric_profile
    AND target.metric_contract_version = occurrence.metric_contract_version
    AND target.exercise_metric_generation =
      occurrence.exercise_metric_generation
))`;

export const OWNED_PLAN_SCHEMA_STATEMENTS = [
  `CREATE TABLE owned_plan_aggregate_states (
    plan_id TEXT PRIMARY KEY NOT NULL
      REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    lifecycle TEXT NOT NULL CHECK(
      lifecycle IN ('draft', 'ready', 'archived')
    ),
    graph_status TEXT NOT NULL CHECK(
      graph_status IN ('missing_valid_target', 'valid')
    ),
    missing_requirement_code TEXT CHECK(
      missing_requirement_code IS NULL
      OR missing_requirement_code = '${OWNED_PLAN_MISSING_VALID_TARGET_CODE}'
    ),
    missing_requirement TEXT CHECK(
      missing_requirement IS NULL
      OR missing_requirement =
        '${OWNED_PLAN_MISSING_VALID_TARGET_REASON}'
    ),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
    archived_at_ms INTEGER CHECK(
      archived_at_ms IS NULL OR archived_at_ms >= created_at_ms
    ),
    CHECK(
      (
        graph_status = 'missing_valid_target'
        AND lifecycle IN ('draft', 'archived')
        AND missing_requirement_code =
          '${OWNED_PLAN_MISSING_VALID_TARGET_CODE}'
        AND missing_requirement =
          '${OWNED_PLAN_MISSING_VALID_TARGET_REASON}'
      )
      OR
      (
        graph_status = 'valid'
        AND lifecycle IN ('ready', 'archived')
        AND missing_requirement_code IS NULL
        AND missing_requirement IS NULL
      )
    ),
    CHECK(
      (lifecycle = 'archived' AND archived_at_ms IS NOT NULL)
      OR
      (lifecycle <> 'archived' AND archived_at_ms IS NULL)
    )
  ) STRICT`,
  `CREATE TABLE owned_plan_mutation_requests (
    request_id TEXT PRIMARY KEY NOT NULL CHECK(
      length(trim(request_id)) BETWEEN 1 AND 128
    ),
    request_sha256 TEXT NOT NULL CHECK(${SHA256_CHECK}),
    operation TEXT NOT NULL CHECK(
      operation IN ('create', 'save', 'duplicate', 'archive', 'restore')
    ),
    source_plan_id TEXT
      REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    result_plan_id TEXT NOT NULL
      REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    expected_revision INTEGER CHECK(
      expected_revision IS NULL OR expected_revision >= 1
    ),
    result_revision INTEGER NOT NULL CHECK(result_revision >= 1),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0),
    CHECK(
      (operation = 'create'
       AND source_plan_id IS NULL
       AND expected_revision IS NULL)
      OR
      (operation = 'duplicate'
       AND source_plan_id IS NOT NULL
       AND expected_revision IS NOT NULL)
      OR
      (operation IN ('save', 'archive', 'restore')
       AND source_plan_id = result_plan_id
       AND expected_revision IS NOT NULL)
    )
  ) STRICT`,
  `INSERT INTO owned_plan_aggregate_states
    (plan_id, lifecycle, graph_status, missing_requirement_code,
     missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
   SELECT plan.id,
          CASE WHEN ${VALID_TARGET_EXISTS} THEN 'ready' ELSE 'draft' END,
          CASE
            WHEN ${VALID_TARGET_EXISTS} THEN 'valid'
            ELSE 'missing_valid_target'
          END,
          CASE
            WHEN ${VALID_TARGET_EXISTS} THEN NULL
            ELSE '${OWNED_PLAN_MISSING_VALID_TARGET_CODE}'
          END,
          CASE
            WHEN ${VALID_TARGET_EXISTS} THEN NULL
            ELSE '${OWNED_PLAN_MISSING_VALID_TARGET_REASON}'
          END,
          0,
          0,
          NULL
   FROM plans plan
   WHERE plan.origin IN ('custom', 'copied')`,
  `CREATE INDEX owned_plan_lifecycle_order
   ON owned_plan_aggregate_states(lifecycle, updated_at_ms, plan_id)`,
  `CREATE INDEX owned_plan_mutation_by_result
   ON owned_plan_mutation_requests(
     result_plan_id,
     result_revision,
     committed_at_ms
   )`,
  `CREATE TRIGGER owned_plan_state_requires_owned_origin
   BEFORE INSERT ON owned_plan_aggregate_states
   WHEN NOT EXISTS (
     SELECT 1
     FROM plans
     WHERE id = NEW.plan_id
       AND origin IN ('custom', 'copied')
   )
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_origin_required');
   END`,
  `CREATE TRIGGER owned_plan_requests_immutable_update
   BEFORE UPDATE ON owned_plan_mutation_requests
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_request_immutable');
   END`,
  `CREATE TRIGGER owned_plan_requests_immutable_delete
   BEFORE DELETE ON owned_plan_mutation_requests
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_request_immutable');
   END`,
  `CREATE TRIGGER owned_plans_no_permanent_delete
   BEFORE DELETE ON plans
   WHEN OLD.origin IN ('custom', 'copied')
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_permanent_delete_forbidden');
   END`,
  `CREATE TRIGGER owned_plan_days_no_permanent_delete
   BEFORE DELETE ON plan_days
   WHEN EXISTS (
     SELECT 1
     FROM owned_plan_aggregate_states
     WHERE plan_id = OLD.plan_id
   )
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_day_permanent_delete_forbidden');
   END`,
  `CREATE TRIGGER owned_plan_occurrences_no_permanent_delete
   BEFORE DELETE ON owned_plan_day_exercises
   WHEN EXISTS (
     SELECT 1
     FROM plan_days day
     JOIN owned_plan_aggregate_states state ON state.plan_id = day.plan_id
     WHERE day.id = OLD.plan_day_id
   )
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_occurrence_permanent_delete_forbidden');
   END`,
  `CREATE TRIGGER owned_plan_warmups_no_permanent_delete
   BEFORE DELETE ON owned_plan_warmup_sets
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_warmup_permanent_delete_forbidden');
   END`,
  `CREATE TRIGGER owned_plan_targets_no_permanent_delete
   BEFORE DELETE ON owned_plan_working_set_targets
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_target_permanent_delete_forbidden');
   END`,
  `CREATE TRIGGER owned_plan_policies_no_permanent_delete
   BEFORE DELETE ON owned_plan_progression_policies
   BEGIN
     SELECT RAISE(ABORT, 'owned_plan_policy_permanent_delete_forbidden');
   END`,
] as const;

const REQUIRED_TABLES = [
  "owned_plan_aggregate_states",
  "owned_plan_mutation_requests",
] as const;

const REQUIRED_TRIGGERS = [
  "owned_plan_requests_immutable_delete",
  "owned_plan_requests_immutable_update",
  "owned_plan_state_requires_owned_origin",
  "owned_plan_days_no_permanent_delete",
  "owned_plan_occurrences_no_permanent_delete",
  "owned_plan_policies_no_permanent_delete",
  "owned_plan_targets_no_permanent_delete",
  "owned_plan_warmups_no_permanent_delete",
  "owned_plans_no_permanent_delete",
] as const;

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

export const ownedPlansMigration: Migration = Object.freeze({
  version: 9,
  name: "owned-plans",
  kind: "additive",
  async up(transaction) {
    await executeAll(transaction, OWNED_PLAN_SCHEMA_STATEMENTS);
  },
  async verify(transaction) {
    const schema = await transaction.queryAll<{
      name: string;
      type: "table" | "trigger";
    }>(
      `SELECT name, type
       FROM sqlite_master
       WHERE type IN ('table', 'trigger')
       ORDER BY type, name`,
    );
    if (
      REQUIRED_TABLES.some((required) =>
        !schema.some(({ name, type }) =>
          type === "table" && name === required
        )
      )
      || REQUIRED_TRIGGERS.some((required) =>
        !schema.some(({ name, type }) =>
          type === "trigger" && name === required
        )
      )
    ) {
      throw new Error("owned_plan_schema_incomplete");
    }

    const [coverage] = await transaction.queryAll<{
      owned_count: number;
      state_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*)
          FROM plans
          WHERE origin IN ('custom', 'copied')) AS owned_count,
         (SELECT COUNT(*)
          FROM owned_plan_aggregate_states) AS state_count`,
    );
    if (
      coverage === undefined
      || coverage.owned_count !== coverage.state_count
    ) {
      throw new Error("owned_plan_state_coverage_invalid");
    }

    const [invalid] = await transaction.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM owned_plan_aggregate_states state
       JOIN plans plan ON plan.id = state.plan_id
       WHERE plan.origin NOT IN ('custom', 'copied')
          OR (state.graph_status = 'valid'
              AND state.missing_requirement IS NOT NULL)
          OR (state.graph_status = 'missing_valid_target'
              AND state.missing_requirement <>
                '${OWNED_PLAN_MISSING_VALID_TARGET_REASON}')`,
    );
    if (invalid === undefined || invalid.count !== 0) {
      throw new Error("owned_plan_state_invalid");
    }
  },
});
