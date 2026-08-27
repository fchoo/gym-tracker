import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

const METRIC_PROFILES_SQL = [
  "load_reps",
  "bodyweight_reps",
  "added_load_reps",
  "assisted_reps",
  "timed_hold",
  "fixed_distance",
  "fixed_time",
  "intervals",
  "unscored",
].map((profile) => `'${profile}'`).join(", ");

const METRIC_IDENTITY_CHECK = `(
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)`;

export const OWNED_RECOMMENDATION_SCHEMA_STATEMENTS = [
  `ALTER TABLE session_sets
   ADD COLUMN source_owned_plan_working_set_target_id TEXT
     REFERENCES owned_plan_working_set_targets(id) ON DELETE SET NULL
     DEFERRABLE INITIALLY DEFERRED`,
  `CREATE INDEX session_sets_by_owned_target
   ON session_sets(source_owned_plan_working_set_target_id)
   WHERE source_owned_plan_working_set_target_id IS NOT NULL`,
  `CREATE TRIGGER session_sets_target_graph_insert
   BEFORE INSERT ON session_sets
   WHEN NEW.source_plan_working_set_target_id IS NOT NULL
    AND NEW.source_owned_plan_working_set_target_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'session_set_target_graph_conflict');
   END`,
  `CREATE TRIGGER session_sets_target_graph_update
   BEFORE UPDATE OF
     source_plan_working_set_target_id,
     source_owned_plan_working_set_target_id
   ON session_sets
   WHEN NEW.source_plan_working_set_target_id IS NOT NULL
    AND NEW.source_owned_plan_working_set_target_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'session_set_target_graph_conflict');
   END`,
  `CREATE TRIGGER session_sets_owned_target_identity_insert
   BEFORE INSERT ON session_sets
   WHEN NEW.source_owned_plan_working_set_target_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM session_exercises session_exercise
      JOIN owned_plan_working_set_targets target
        ON target.id = NEW.source_owned_plan_working_set_target_id
      JOIN owned_plan_day_exercises occurrence
        ON occurrence.id = target.plan_day_exercise_id
      WHERE session_exercise.id = NEW.session_exercise_id
        AND session_exercise.exercise_id = occurrence.exercise_id
        AND NEW.metric_profile = target.metric_profile
        AND NEW.metric_contract_version = target.metric_contract_version
        AND NEW.exercise_metric_generation =
          target.exercise_metric_generation
    )
   BEGIN
     SELECT RAISE(ABORT, 'session_set_owned_target_identity_invalid');
   END`,
  `CREATE TRIGGER session_sets_owned_target_identity_update
   BEFORE UPDATE OF
     session_exercise_id,
     source_owned_plan_working_set_target_id,
     metric_profile,
     metric_contract_version,
     exercise_metric_generation
   ON session_sets
   WHEN NEW.source_owned_plan_working_set_target_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM session_exercises session_exercise
      JOIN owned_plan_working_set_targets target
        ON target.id = NEW.source_owned_plan_working_set_target_id
      JOIN owned_plan_day_exercises occurrence
        ON occurrence.id = target.plan_day_exercise_id
      WHERE session_exercise.id = NEW.session_exercise_id
        AND session_exercise.exercise_id = occurrence.exercise_id
        AND NEW.metric_profile = target.metric_profile
        AND NEW.metric_contract_version = target.metric_contract_version
        AND NEW.exercise_metric_generation =
          target.exercise_metric_generation
    )
   BEGIN
     SELECT RAISE(ABORT, 'session_set_owned_target_identity_invalid');
   END`,
  `CREATE TABLE owned_progression_recommendations (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    owned_plan_working_set_target_id TEXT NOT NULL
      REFERENCES owned_plan_working_set_targets(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    rule_type TEXT NOT NULL CHECK(rule_type IN (${METRIC_PROFILES_SQL})),
    rule_version INTEGER NOT NULL CHECK(rule_version >= 1),
    evidence_version INTEGER NOT NULL CHECK(evidence_version >= 1),
    evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
    current_target_json TEXT NOT NULL CHECK(json_valid(current_target_json)),
    proposed_target_json TEXT NOT NULL CHECK(json_valid(proposed_target_json)),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN (${METRIC_PROFILES_SQL})),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    status TEXT NOT NULL CHECK(
      status IN ('pending', 'accepted', 'rejected', 'invalidated', 'superseded')
    ),
    source_revision INTEGER NOT NULL CHECK(source_revision >= 1),
    target_revision INTEGER NOT NULL CHECK(target_revision >= 1),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    decided_at_ms INTEGER CHECK(decided_at_ms IS NULL OR decided_at_ms >= 0),
    CHECK(${METRIC_IDENTITY_CHECK})
  ) STRICT`,
  `CREATE TRIGGER owned_recommendations_identity_insert
   BEFORE INSERT ON owned_progression_recommendations
   WHEN NOT EXISTS (
     SELECT 1
     FROM owned_plan_working_set_targets target
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.id = target.plan_day_exercise_id
     WHERE target.id = NEW.owned_plan_working_set_target_id
       AND occurrence.exercise_id = NEW.exercise_id
       AND target.metric_profile = NEW.metric_profile
       AND target.metric_contract_version = NEW.metric_contract_version
       AND target.exercise_metric_generation =
         NEW.exercise_metric_generation
   )
   BEGIN
     SELECT RAISE(ABORT, 'owned_recommendation_identity_invalid');
   END`,
  `CREATE TRIGGER owned_recommendations_identity_update
   BEFORE UPDATE OF
     exercise_id,
     owned_plan_working_set_target_id,
     metric_profile,
     metric_contract_version,
     exercise_metric_generation
   ON owned_progression_recommendations
   WHEN NOT EXISTS (
     SELECT 1
     FROM owned_plan_working_set_targets target
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.id = target.plan_day_exercise_id
     WHERE target.id = NEW.owned_plan_working_set_target_id
       AND occurrence.exercise_id = NEW.exercise_id
       AND target.metric_profile = NEW.metric_profile
       AND target.metric_contract_version = NEW.metric_contract_version
       AND target.exercise_metric_generation =
         NEW.exercise_metric_generation
   )
   BEGIN
     SELECT RAISE(ABORT, 'owned_recommendation_identity_invalid');
   END`,
  `CREATE UNIQUE INDEX one_pending_owned_recommendation
   ON owned_progression_recommendations(owned_plan_working_set_target_id)
   WHERE status = 'pending'`,
  `CREATE INDEX owned_recommendations_by_exercise
   ON owned_progression_recommendations(
     exercise_id,
     status,
     created_at_ms
   )`,
] as const;

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

export const ownedRecommendationsMigration: Migration = Object.freeze({
  version: 10,
  name: "owned-recommendations",
  kind: "additive",
  async up(transaction) {
    await executeAll(transaction, OWNED_RECOMMENDATION_SCHEMA_STATEMENTS);
  },
  async verify(transaction) {
    const columns = await transaction.queryAll<{ name: string }>(
      "PRAGMA table_info(session_sets)",
    );
    if (!columns.some(({ name }) =>
      name === "source_owned_plan_working_set_target_id"
    )) {
      throw new Error("owned_recommendation_session_schema_incomplete");
    }
    const schema = await transaction.queryAll<{
      name: string;
      type: "index" | "table" | "trigger";
    }>(
      `SELECT name, type
       FROM sqlite_master
       WHERE name IN (
         'owned_progression_recommendations',
         'one_pending_owned_recommendation',
         'owned_recommendations_by_exercise',
         'session_sets_by_owned_target',
         'session_sets_target_graph_insert',
         'session_sets_target_graph_update',
         'session_sets_owned_target_identity_insert',
         'session_sets_owned_target_identity_update',
         'owned_recommendations_identity_insert',
         'owned_recommendations_identity_update'
       )
       ORDER BY type, name`,
    );
    for (const [name, type] of [
      ["owned_progression_recommendations", "table"],
      ["one_pending_owned_recommendation", "index"],
      ["owned_recommendations_by_exercise", "index"],
      ["session_sets_by_owned_target", "index"],
      ["session_sets_target_graph_insert", "trigger"],
      ["session_sets_target_graph_update", "trigger"],
      ["session_sets_owned_target_identity_insert", "trigger"],
      ["session_sets_owned_target_identity_update", "trigger"],
      ["owned_recommendations_identity_insert", "trigger"],
      ["owned_recommendations_identity_update", "trigger"],
    ] as const) {
      if (!schema.some((entry) =>
        entry.name === name && entry.type === type
      )) {
        throw new Error("owned_recommendation_schema_incomplete");
      }
    }
    const [invalid] = await transaction.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM (
         SELECT 1
         FROM owned_progression_recommendations recommendation
         JOIN owned_plan_working_set_targets target
           ON target.id = recommendation.owned_plan_working_set_target_id
         JOIN owned_plan_day_exercises occurrence
           ON occurrence.id = target.plan_day_exercise_id
         WHERE recommendation.status = 'pending'
           AND (
             recommendation.exercise_id <> occurrence.exercise_id
             OR recommendation.metric_profile <> target.metric_profile
             OR recommendation.metric_contract_version <>
               target.metric_contract_version
             OR recommendation.exercise_metric_generation <>
               target.exercise_metric_generation
           )
         UNION ALL
         SELECT 1
         FROM session_sets
         WHERE source_plan_working_set_target_id IS NOT NULL
           AND source_owned_plan_working_set_target_id IS NOT NULL
       )`,
    );
    if (invalid === undefined || invalid.count !== 0) {
      throw new Error("owned_recommendation_identity_invalid");
    }
  },
});
