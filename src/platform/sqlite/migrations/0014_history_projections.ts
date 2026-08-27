import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export const HISTORY_PROJECTION_SCHEMA_STATEMENTS = [
  `CREATE TABLE history_projection_record_candidates (
    subject_id TEXT NOT NULL
      REFERENCES history_subject_revisions(subject_id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    exercise_id TEXT NOT NULL,
    identity_key TEXT NOT NULL,
    comparator_key TEXT NOT NULL,
    session_id TEXT NOT NULL,
    local_date TEXT NOT NULL CHECK(length(local_date) = 10),
    set_id TEXT NOT NULL,
    set_ordinal INTEGER NOT NULL CHECK(set_ordinal >= 0),
    completed_at_ms INTEGER NOT NULL CHECK(completed_at_ms >= 0),
    target_json TEXT NOT NULL CHECK(json_valid(target_json)),
    observation_json TEXT NOT NULL CHECK(json_valid(observation_json)),
    PRIMARY KEY(subject_id, set_id)
  ) STRICT`,
  `CREATE TABLE history_projection_comparable_exposures (
    subject_id TEXT NOT NULL
      REFERENCES history_subject_revisions(subject_id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    exercise_id TEXT NOT NULL,
    identity_key TEXT NOT NULL,
    comparator_key TEXT NOT NULL,
    session_id TEXT NOT NULL,
    local_date TEXT NOT NULL CHECK(length(local_date) = 10),
    set_id TEXT NOT NULL,
    set_ordinal INTEGER NOT NULL CHECK(set_ordinal >= 0),
    completed_at_ms INTEGER NOT NULL CHECK(completed_at_ms >= 0),
    target_json TEXT NOT NULL CHECK(json_valid(target_json)),
    observation_json TEXT NOT NULL CHECK(json_valid(observation_json)),
    PRIMARY KEY(subject_id, set_id)
  ) STRICT`,
  `CREATE TABLE history_projection_metric_aggregates (
    subject_id TEXT NOT NULL
      REFERENCES history_subject_revisions(subject_id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    exercise_id TEXT NOT NULL,
    identity_key TEXT NOT NULL,
    comparator_key TEXT NOT NULL,
    reference_target_json TEXT NOT NULL CHECK(json_valid(reference_target_json)),
    aggregate_json TEXT NOT NULL CHECK(json_valid(aggregate_json)),
    PRIMARY KEY(subject_id, exercise_id, identity_key, comparator_key,
                reference_target_json)
  ) STRICT`,
  `CREATE TABLE history_projection_period_inputs (
    subject_id TEXT NOT NULL
      REFERENCES history_subject_revisions(subject_id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    local_date TEXT NOT NULL CHECK(length(local_date) = 10),
    completed_exercises INTEGER NOT NULL CHECK(completed_exercises >= 0),
    planned_exercises INTEGER NOT NULL CHECK(planned_exercises >= 0),
    completed_working_sets INTEGER NOT NULL CHECK(completed_working_sets >= 0),
    planned_working_sets INTEGER NOT NULL CHECK(planned_working_sets >= 0),
    comparable_exposure_count INTEGER NOT NULL
      CHECK(comparable_exposure_count >= 0),
    PRIMARY KEY(subject_id, local_date)
  ) STRICT`,
  `CREATE TABLE history_projection_recommendation_scopes (
    subject_id TEXT NOT NULL
      REFERENCES history_subject_revisions(subject_id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    scope_id TEXT NOT NULL,
    PRIMARY KEY(subject_id, scope_id)
  ) STRICT`,
  `CREATE INDEX history_projection_records_by_metric
   ON history_projection_record_candidates
      (exercise_id, identity_key, comparator_key, completed_at_ms)`,
  `CREATE INDEX history_projection_exposures_by_metric
   ON history_projection_comparable_exposures
      (exercise_id, identity_key, comparator_key, completed_at_ms)`,
  `CREATE INDEX history_projection_period_inputs_by_date
   ON history_projection_period_inputs(local_date)`,
] as const;

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

export const historyProjectionsMigration: Migration = Object.freeze({
  version: 14,
  name: "history-projections",
  kind: "additive",
  async up(transaction) {
    await executeAll(transaction, HISTORY_PROJECTION_SCHEMA_STATEMENTS);
  },
  async verify(transaction) {
    const rows = await transaction.queryAll<{
      type: "index" | "table";
      name: string;
    }>(
      `SELECT type, name
       FROM sqlite_master
       WHERE name LIKE 'history_projection_%'
       ORDER BY name`,
    );
    const available = new Set(rows.map(({ type, name }) => `${type}:${name}`));
    for (const required of [
      "table:history_projection_record_candidates",
      "table:history_projection_comparable_exposures",
      "table:history_projection_metric_aggregates",
      "table:history_projection_period_inputs",
      "table:history_projection_recommendation_scopes",
      "index:history_projection_records_by_metric",
      "index:history_projection_exposures_by_metric",
      "index:history_projection_period_inputs_by_date",
    ]) {
      if (!available.has(required)) {
        throw new Error("history_projection_schema_incomplete");
      }
    }
  },
});
