import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

const COMPLETE_ACTIONABLE_EVIDENCE_TEMPLATE = `
  json_extract(NEW.evidence_json, '$.version') = 2
  AND json_type(NEW.evidence_json, '$.rule.id') = 'text'
  AND length(trim(json_extract(NEW.evidence_json, '$.rule.id'))) BETWEEN 1 AND 128
  AND NEW.rule_type = 'load_reps'
  AND json_extract(NEW.evidence_json, '$.rule.id') =
    'load_reps.double_progression.v1'
  AND json_type(NEW.evidence_json, '$.rule.version') = 'integer'
  AND json_extract(NEW.evidence_json, '$.rule.version') = NEW.rule_version
  AND json_extract(NEW.evidence_json, '$.metricIdentity.profile') =
    NEW.metric_profile
  AND json_extract(NEW.evidence_json, '$.metricIdentity.contractVersion') =
    NEW.metric_contract_version
  AND json_extract(NEW.evidence_json, '$.metricIdentity.exerciseMetricGeneration') =
    NEW.exercise_metric_generation
  AND json_type(NEW.evidence_json, '$.source.sessionId') = 'text'
  AND length(trim(json_extract(NEW.evidence_json, '$.source.sessionId'))) >= 1
  AND json_type(NEW.evidence_json, '$.source.sessionExerciseId') = 'text'
  AND length(trim(json_extract(NEW.evidence_json, '$.source.sessionExerciseId'))) >= 1
  AND json_type(NEW.evidence_json, '$.source.sessionRevision') = 'integer'
  AND json_extract(NEW.evidence_json, '$.source.sessionRevision') =
    NEW.source_revision
  AND json_type(NEW.evidence_json, '$.source.setIds') = 'array'
  AND json_array_length(NEW.evidence_json, '$.source.setIds') >= 1
  AND EXISTS (
    SELECT 1
    FROM session_exercises source_exercise
    WHERE source_exercise.id =
          json_extract(NEW.evidence_json, '$.source.sessionExerciseId')
      AND source_exercise.session_id =
          json_extract(NEW.evidence_json, '$.source.sessionId')
      AND source_exercise.exercise_id = NEW.exercise_id
      AND source_exercise.metric_profile = NEW.metric_profile
      AND source_exercise.metric_contract_version =
          NEW.metric_contract_version
      AND source_exercise.exercise_metric_generation =
          NEW.exercise_metric_generation
      AND EXISTS (
        SELECT 1
        FROM workout_sessions source_session
        WHERE source_session.id = source_exercise.session_id
          AND source_session.revision =
              json_extract(NEW.evidence_json, '$.source.sessionRevision')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(NEW.evidence_json, '$.source.setIds') AS source_set
    LEFT JOIN session_sets set_row ON set_row.id = source_set.value
    WHERE typeof(source_set.value) <> 'text'
       OR set_row.session_exercise_id <>
          json_extract(NEW.evidence_json, '$.source.sessionExerciseId')
       OR set_row.set_kind <> 'working'
       OR set_row.metric_profile <> NEW.metric_profile
       OR set_row.metric_contract_version <> NEW.metric_contract_version
       OR set_row.exercise_metric_generation <>
          NEW.exercise_metric_generation
       OR set_row.id IS NULL
  )
  AND json_type(NEW.evidence_json, '$.revisions.source') = 'integer'
  AND json_extract(NEW.evidence_json, '$.revisions.source') =
    NEW.source_revision
  AND json_type(NEW.evidence_json, '$.revisions.target') = 'integer'
  AND json_extract(NEW.evidence_json, '$.revisions.target') =
    NEW.target_revision
  AND json_type(NEW.evidence_json, '$.targetScope') = 'array'
  AND json_array_length(NEW.evidence_json, '$.targetScope') >= 1
  AND EXISTS (
    SELECT 1
    FROM json_each(NEW.evidence_json, '$.targetScope') AS scoped_target
    WHERE scoped_target.type = 'object'
      AND json_type(scoped_target.value, '$.id') = 'text'
      AND json_extract(scoped_target.value, '$.id') =
        NEW.%TARGET_COLUMN%
      AND json_type(scoped_target.value, '$.revision') = 'integer'
      AND json_extract(scoped_target.value, '$.revision') =
        NEW.target_revision
  )
  AND json_type(NEW.evidence_json, '$.currentTarget') = 'object'
  AND json(NEW.current_target_json) =
    json(json_extract(NEW.evidence_json, '$.currentTarget'))
  AND json_type(NEW.evidence_json, '$.proposedTarget') = 'object'
  AND json(NEW.proposed_target_json) =
    json(json_extract(NEW.evidence_json, '$.proposedTarget'))
  AND json_type(NEW.evidence_json, '$.decision') = 'text'
  AND length(trim(json_extract(NEW.evidence_json, '$.decision'))) >= 1
  AND json_type(NEW.evidence_json, '$.reasonCode') = 'text'
  AND length(trim(json_extract(NEW.evidence_json, '$.reasonCode'))) >= 1
  AND json_type(NEW.evidence_json, '$.reason') = 'text'
  AND length(trim(json_extract(NEW.evidence_json, '$.reason'))) >= 1
  AND json_type(NEW.evidence_json, '$.confidence') = 'text'
  AND length(trim(json_extract(NEW.evidence_json, '$.confidence'))) >= 1
  AND json_type(NEW.evidence_json, '$.lifecycle.createdAtMs') = 'integer'
  AND json_extract(NEW.evidence_json, '$.lifecycle.createdAtMs') =
    NEW.created_at_ms
  AND json_extract(NEW.evidence_json, '$.lifecycle.state') = 'pending'
  AND NEW.decided_at_ms IS NULL
`;

function completeActionableEvidence(targetColumn: string): string {
  return COMPLETE_ACTIONABLE_EVIDENCE_TEMPLATE.replace(
    '%TARGET_COLUMN%',
    targetColumn,
  );
}

export const PROGRESSION_EVIDENCE_SCHEMA_STATEMENTS = [
  `CREATE TRIGGER progression_recommendations_actionable_evidence_insert
   BEFORE INSERT ON progression_recommendations
   WHEN NEW.status = 'pending'
     AND NEW.evidence_version >= 2
     AND (
       NEW.evidence_version <> 2
       OR NOT (${completeActionableEvidence("plan_working_set_target_id")})
     )
   BEGIN
     SELECT RAISE(ABORT, 'progression_recommendation_evidence_incomplete');
   END`,
  `CREATE TRIGGER progression_recommendations_actionable_evidence_update
   BEFORE UPDATE OF
     exercise_id,
     plan_working_set_target_id,
     rule_type,
     rule_version,
     evidence_version,
     evidence_json,
     current_target_json,
     proposed_target_json,
     metric_profile,
     metric_contract_version,
     exercise_metric_generation,
     status,
     source_revision,
     target_revision,
     created_at_ms
   ON progression_recommendations
   WHEN NEW.status = 'pending'
     AND NEW.evidence_version >= 2
     AND (
       NEW.evidence_version <> 2
       OR NOT (${completeActionableEvidence("plan_working_set_target_id")})
     )
   BEGIN
     SELECT RAISE(ABORT, 'progression_recommendation_evidence_incomplete');
   END`,
  `CREATE TRIGGER owned_progression_recommendations_actionable_evidence_insert
   BEFORE INSERT ON owned_progression_recommendations
   WHEN NEW.status = 'pending'
     AND NEW.evidence_version >= 2
     AND (
       NEW.evidence_version <> 2
       OR NOT (${completeActionableEvidence("owned_plan_working_set_target_id")})
     )
   BEGIN
     SELECT RAISE(ABORT, 'owned_progression_recommendation_evidence_incomplete');
   END`,
  `CREATE TRIGGER owned_progression_recommendations_actionable_evidence_update
   BEFORE UPDATE OF
     exercise_id,
     owned_plan_working_set_target_id,
     rule_type,
     rule_version,
     evidence_version,
     evidence_json,
     current_target_json,
     proposed_target_json,
     metric_profile,
     metric_contract_version,
     exercise_metric_generation,
     status,
     source_revision,
     target_revision,
     created_at_ms
   ON owned_progression_recommendations
   WHEN NEW.status = 'pending'
     AND NEW.evidence_version >= 2
     AND (
       NEW.evidence_version <> 2
       OR NOT (${completeActionableEvidence("owned_plan_working_set_target_id")})
     )
   BEGIN
     SELECT RAISE(ABORT, 'owned_progression_recommendation_evidence_incomplete');
   END`,
] as const;

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

export const progressionEvidenceMigration: Migration = Object.freeze({
  version: 15,
  name: "progression-evidence",
  kind: "additive",
  async up(transaction) {
    await executeAll(transaction, PROGRESSION_EVIDENCE_SCHEMA_STATEMENTS);
  },
  async verify(transaction) {
    const rows = await transaction.queryAll<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'trigger'
         AND name LIKE '%progression_recommendations_actionable_evidence%'
       ORDER BY name`,
    );
    const names = new Set(rows.map(({ name }) => name));
    for (const required of [
      "progression_recommendations_actionable_evidence_insert",
      "progression_recommendations_actionable_evidence_update",
      "owned_progression_recommendations_actionable_evidence_insert",
      "owned_progression_recommendations_actionable_evidence_update",
    ]) {
      if (!names.has(required)) {
        throw new Error("progression_evidence_schema_incomplete");
      }
    }
  },
});
