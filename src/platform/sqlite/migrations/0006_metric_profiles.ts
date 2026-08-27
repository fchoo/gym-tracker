import {
  listMetricContracts,
} from "../../../domains/metrics/registry";
import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

const METRIC_PROFILES_SQL = [
  "'load_reps'",
  "'bodyweight_reps'",
  "'added_load_reps'",
  "'assisted_reps'",
  "'timed_hold'",
  "'fixed_distance'",
  "'fixed_time'",
  "'intervals'",
  "'unscored'",
].join(", ");

const POLICY_TYPES_SQL = [
  METRIC_PROFILES_SQL,
  "'manual_hold'",
].join(", ");

const METRIC_IDENTITY_CHECK = `(
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)`;

const TARGET_JSON_CHECK = `(
  (
    target_json = '{}'
    AND metric_profile IN ('load_reps', 'timed_hold')
    AND metric_contract_version = 1
    AND exercise_metric_generation = 1
  )
  OR
  (
    json_extract(target_json, '$.profile') = metric_profile
    AND json_extract(target_json, '$.version') = metric_contract_version
  )
)`;

const OBSERVATION_JSON_CHECK = `(
  observed_json IS NULL
  OR (
    observed_json = '{}'
    AND metric_profile IN ('load_reps', 'timed_hold')
    AND metric_contract_version = 1
    AND exercise_metric_generation = 1
  )
  OR (
    json_extract(observed_json, '$.profile') = metric_profile
    AND json_extract(observed_json, '$.version') = metric_contract_version
  )
)`;

const TABLES_TO_RENAME = [
  "exercises",
  "plan_day_exercises",
  "plan_warmup_sets",
  "plan_working_set_targets",
  "progression_policies",
  "workout_sessions",
  "session_exercises",
  "session_sets",
  "session_rest_states",
  "session_undo_snapshots",
  "progression_recommendations",
] as const;

const CREATE_WIDENED_TABLES = [
  `CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    content_pack_id TEXT REFERENCES content_packs(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    origin TEXT NOT NULL CHECK(origin IN ('bundled', 'custom', 'copied')),
    source_namespace TEXT,
    upstream_id TEXT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN (${METRIC_PROFILES_SQL})),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    equipment TEXT NOT NULL DEFAULT 'Unspecified'
      CHECK(length(trim(equipment)) > 0),
    default_rest_seconds INTEGER NOT NULL CHECK(default_rest_seconds >= 0),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK(${METRIC_IDENTITY_CHECK}),
    CHECK(
      (origin = 'custom' AND source_namespace IS NULL AND upstream_id IS NULL)
      OR
      (origin IN ('bundled', 'copied')
       AND source_namespace IS NOT NULL
       AND upstream_id IS NOT NULL)
    ),
    UNIQUE(id, metric_profile, metric_contract_version,
           exercise_metric_generation)
  ) STRICT`,
  `CREATE TABLE plan_day_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    exercise_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    between_exercise_rest_seconds INTEGER CHECK(
      between_exercise_rest_seconds IS NULL
      OR between_exercise_rest_seconds >= 0
    ),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN (${METRIC_PROFILES_SQL})),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK(${METRIC_IDENTITY_CHECK}),
    UNIQUE(plan_day_id, ordinal),
    UNIQUE(plan_day_id, exercise_id),
    UNIQUE(id, metric_profile, metric_contract_version,
           exercise_metric_generation),
    FOREIGN KEY(
      exercise_id,
      metric_profile,
      metric_contract_version,
      exercise_metric_generation
    ) REFERENCES exercises(
      id,
      metric_profile,
      metric_contract_version,
      exercise_metric_generation
    ) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
  ) STRICT`,
  `CREATE TABLE plan_warmup_sets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL
      REFERENCES plan_day_exercises(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
    reps INTEGER NOT NULL CHECK(reps >= 0),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(plan_day_exercise_id, ordinal)
  ) STRICT`,
  `CREATE TABLE plan_working_set_targets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
    min_reps INTEGER NOT NULL CHECK(min_reps >= 0),
    max_reps INTEGER NOT NULL CHECK(max_reps >= min_reps),
    target_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(target_json)),
    unit_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(unit_json)),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN (${METRIC_PROFILES_SQL})),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK(${METRIC_IDENTITY_CHECK}),
    CHECK(${TARGET_JSON_CHECK}),
    UNIQUE(plan_day_exercise_id, ordinal),
    UNIQUE(id, metric_profile, metric_contract_version,
           exercise_metric_generation),
    FOREIGN KEY(
      plan_day_exercise_id,
      metric_profile,
      metric_contract_version,
      exercise_metric_generation
    ) REFERENCES plan_day_exercises(
      id,
      metric_profile,
      metric_contract_version,
      exercise_metric_generation
    ) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
  ) STRICT`,
  `CREATE TABLE progression_policies (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL,
    policy_type TEXT NOT NULL CHECK(policy_type IN (${POLICY_TYPES_SQL})),
    policy_version INTEGER NOT NULL CHECK(policy_version >= 1),
    rule_json TEXT NOT NULL CHECK(json_valid(rule_json)),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN (${METRIC_PROFILES_SQL})),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active', 'invalidated')),
    invalidated_at_ms INTEGER CHECK(
      invalidated_at_ms IS NULL OR invalidated_at_ms >= 0
    ),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK(${METRIC_IDENTITY_CHECK}),
    CHECK(
      (status = 'active' AND invalidated_at_ms IS NULL)
      OR
      (status = 'invalidated' AND invalidated_at_ms IS NOT NULL)
    ),
    FOREIGN KEY(plan_day_exercise_id)
      REFERENCES plan_day_exercises(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED
  ) STRICT`,
  `CREATE TABLE workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    plan_day_id TEXT REFERENCES plan_days(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    source TEXT NOT NULL CHECK(
      source IN ('scheduled_day', 'alternate_day', 'rest_day', 'empty', 'manual')
    ),
    status TEXT NOT NULL CHECK(
      status IN (
        'in_progress',
        'completed',
        'partial',
        'discarded',
        'voided',
        'manual_visit',
        'zero_sets'
      )
    ),
    local_date TEXT NOT NULL CHECK(length(local_date) = 10),
    timezone TEXT NOT NULL CHECK(length(trim(timezone)) > 0),
    started_at_ms INTEGER NOT NULL CHECK(started_at_ms >= 0),
    completed_at_ms INTEGER CHECK(
      completed_at_ms IS NULL OR completed_at_ms >= started_at_ms
    ),
    active_session_exercise_id TEXT
      REFERENCES session_exercises(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED,
    active_set_id TEXT REFERENCES session_sets(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED,
    revision INTEGER NOT NULL CHECK(revision >= 0)
  ) STRICT`,
  `CREATE TABLE session_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL
      REFERENCES workout_sessions(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    source_plan_day_exercise_id TEXT
      REFERENCES plan_day_exercises(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    exercise_name TEXT NOT NULL CHECK(length(trim(exercise_name)) > 0),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN (${METRIC_PROFILES_SQL})),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    default_rest_seconds INTEGER NOT NULL CHECK(default_rest_seconds >= 0),
    target_revision INTEGER NOT NULL CHECK(target_revision >= 0),
    status TEXT NOT NULL CHECK(status IN ('planned', 'active', 'completed', 'skipped')),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    effort TEXT CHECK(
      effort IS NULL OR effort IN ('easy', 'on_target', 'hard', 'failed')
    ),
    effort_recorded_at_ms INTEGER CHECK(
      effort_recorded_at_ms IS NULL OR effort_recorded_at_ms >= 0
    ),
    CHECK(${METRIC_IDENTITY_CHECK}),
    UNIQUE(session_id, ordinal),
    UNIQUE(id, metric_profile, metric_contract_version,
           exercise_metric_generation)
  ) STRICT`,
  `CREATE TABLE session_sets (
    id TEXT PRIMARY KEY NOT NULL,
    session_exercise_id TEXT NOT NULL,
    set_kind TEXT NOT NULL CHECK(set_kind IN ('warmup', 'working')),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    source_plan_working_set_target_id TEXT
      REFERENCES plan_working_set_targets(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED,
    target_load_grams INTEGER NOT NULL CHECK(target_load_grams >= 0),
    target_min_reps INTEGER NOT NULL CHECK(target_min_reps >= 0),
    target_max_reps INTEGER NOT NULL CHECK(target_max_reps >= target_min_reps),
    target_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(target_json)),
    unit_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(unit_json)),
    rule_type TEXT NOT NULL DEFAULT 'load_reps'
      CHECK(rule_type IN (${POLICY_TYPES_SQL})),
    rule_version INTEGER NOT NULL DEFAULT 1 CHECK(rule_version >= 1),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN (${METRIC_PROFILES_SQL})),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    observed_load_grams INTEGER CHECK(
      observed_load_grams IS NULL OR observed_load_grams >= 0
    ),
    observed_reps INTEGER CHECK(observed_reps IS NULL OR observed_reps >= 0),
    observed_json TEXT CHECK(
      observed_json IS NULL OR json_valid(observed_json)
    ),
    status TEXT NOT NULL CHECK(status IN ('planned', 'draft', 'completed', 'skipped')),
    draft_updated_at_ms INTEGER CHECK(
      draft_updated_at_ms IS NULL OR draft_updated_at_ms >= 0
    ),
    completed_at_ms INTEGER CHECK(
      completed_at_ms IS NULL OR completed_at_ms >= 0
    ),
    completion_idempotency_key TEXT UNIQUE,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK(${METRIC_IDENTITY_CHECK}),
    CHECK(${TARGET_JSON_CHECK}),
    CHECK(${OBSERVATION_JSON_CHECK}),
    UNIQUE(session_exercise_id, set_kind, ordinal),
    FOREIGN KEY(
      session_exercise_id,
      metric_profile,
      metric_contract_version,
      exercise_metric_generation
    ) REFERENCES session_exercises(
      id,
      metric_profile,
      metric_contract_version,
      exercise_metric_generation
    ) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
  ) STRICT`,
  `CREATE TABLE session_rest_states (
    session_id TEXT PRIMARY KEY NOT NULL
      REFERENCES workout_sessions(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    state_version INTEGER NOT NULL CHECK(state_version = 1),
    status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'paused', 'expired')),
    started_at_ms INTEGER CHECK(started_at_ms IS NULL OR started_at_ms >= 0),
    ends_at_ms INTEGER CHECK(ends_at_ms IS NULL OR ends_at_ms >= 0),
    remaining_ms INTEGER CHECK(remaining_ms IS NULL OR remaining_ms >= 0),
    expired_at_ms INTEGER CHECK(expired_at_ms IS NULL OR expired_at_ms >= 0),
    next_set_id TEXT REFERENCES session_sets(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK(
      (status = 'idle'
       AND started_at_ms IS NULL
       AND ends_at_ms IS NULL
       AND remaining_ms IS NULL
       AND expired_at_ms IS NULL)
      OR
      (status = 'running'
       AND started_at_ms IS NOT NULL
       AND ends_at_ms IS NOT NULL
       AND remaining_ms IS NULL
       AND expired_at_ms IS NULL)
      OR
      (status = 'paused'
       AND started_at_ms IS NULL
       AND ends_at_ms IS NULL
       AND remaining_ms IS NOT NULL
       AND expired_at_ms IS NULL)
      OR
      (status = 'expired'
       AND started_at_ms IS NULL
       AND ends_at_ms IS NULL
       AND remaining_ms IS NULL
       AND expired_at_ms IS NOT NULL)
    )
  ) STRICT`,
  `CREATE TABLE session_undo_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL
      REFERENCES workout_sessions(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    completed_set_id TEXT NOT NULL
      REFERENCES session_sets(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    idempotency_key TEXT NOT NULL UNIQUE,
    snapshot_version INTEGER NOT NULL CHECK(snapshot_version >= 1),
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
    undo_until_ms INTEGER NOT NULL CHECK(undo_until_ms >= 0),
    consumed_at_ms INTEGER CHECK(consumed_at_ms IS NULL OR consumed_at_ms >= 0),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE progression_recommendations (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    plan_working_set_target_id TEXT NOT NULL
      REFERENCES plan_working_set_targets(id) ON DELETE RESTRICT
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
    source_revision INTEGER NOT NULL CHECK(source_revision >= 0),
    target_revision INTEGER NOT NULL CHECK(target_revision >= 0),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    decided_at_ms INTEGER CHECK(decided_at_ms IS NULL OR decided_at_ms >= 0),
    CHECK(${METRIC_IDENTITY_CHECK})
  ) STRICT`,
] as const;

const COPY_WIDENED_ROWS = [
  `INSERT INTO exercises
    (id, content_pack_id, origin, source_namespace, upstream_id, name,
     metric_profile, metric_contract_version, exercise_metric_generation,
     equipment, default_rest_seconds, revision)
   SELECT id, content_pack_id, origin, source_namespace, upstream_id, name,
          metric_profile, 1, 1, equipment, default_rest_seconds, revision
   FROM exercises_v5`,
  `INSERT INTO plan_day_exercises
    (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
     metric_profile, metric_contract_version, exercise_metric_generation,
     revision)
   SELECT pde.id, pde.plan_day_id, pde.exercise_id, pde.ordinal,
          pde.between_exercise_rest_seconds, e.metric_profile, 1, 1,
          pde.revision
   FROM plan_day_exercises_v5 pde
   JOIN exercises_v5 e ON e.id = pde.exercise_id`,
  `INSERT INTO plan_warmup_sets
    (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
   SELECT id, plan_day_exercise_id, ordinal, load_grams, reps, revision
   FROM plan_warmup_sets_v5`,
  `INSERT INTO plan_working_set_targets
    (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
     target_json, unit_json, metric_profile, metric_contract_version,
     exercise_metric_generation, revision)
   SELECT target.id, target.plan_day_exercise_id, target.ordinal,
          target.load_grams, target.min_reps, target.max_reps,
          target.target_json, target.unit_json, pde.metric_profile, 1, 1,
          target.revision
   FROM plan_working_set_targets_v5 target
   JOIN plan_day_exercises pde ON pde.id = target.plan_day_exercise_id`,
  `INSERT INTO progression_policies
    (id, plan_day_exercise_id, policy_type, policy_version, rule_json,
     metric_profile, metric_contract_version, exercise_metric_generation,
     status, invalidated_at_ms, revision)
   SELECT policy.id, policy.plan_day_exercise_id, policy.policy_type,
          policy.policy_version, policy.rule_json, pde.metric_profile, 1, 1,
          'active', NULL, policy.revision
   FROM progression_policies_v5 policy
   JOIN plan_day_exercises pde ON pde.id = policy.plan_day_exercise_id`,
  `INSERT INTO workout_sessions
    (id, plan_id, plan_day_id, source, status, local_date, timezone,
     started_at_ms, completed_at_ms, active_session_exercise_id,
     active_set_id, revision)
   SELECT id, plan_id, plan_day_id, source, status, local_date, timezone,
          started_at_ms, completed_at_ms, active_session_exercise_id,
          active_set_id, revision
   FROM workout_sessions_v5`,
  `INSERT INTO session_exercises
    (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
     exercise_name, metric_profile, metric_contract_version,
     exercise_metric_generation, default_rest_seconds, target_revision,
     status, revision, effort, effort_recorded_at_ms)
   SELECT id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
          exercise_name, metric_profile, 1, 1, default_rest_seconds,
          target_revision, status, revision, effort, effort_recorded_at_ms
   FROM session_exercises_v5`,
  `INSERT INTO session_sets
    (id, session_exercise_id, set_kind, ordinal,
     source_plan_working_set_target_id, target_load_grams, target_min_reps,
     target_max_reps, target_json, unit_json, rule_type, rule_version,
     metric_profile, metric_contract_version, exercise_metric_generation,
     observed_load_grams, observed_reps, observed_json, status,
     draft_updated_at_ms, completed_at_ms, completion_idempotency_key,
     revision)
   SELECT set_row.id, set_row.session_exercise_id, set_row.set_kind,
          set_row.ordinal, set_row.source_plan_working_set_target_id,
          set_row.target_load_grams, set_row.target_min_reps,
          set_row.target_max_reps, set_row.target_json, set_row.unit_json,
          set_row.rule_type, set_row.rule_version, exercise.metric_profile,
          exercise.metric_contract_version,
          exercise.exercise_metric_generation, set_row.observed_load_grams,
          set_row.observed_reps, set_row.observed_json, set_row.status,
          set_row.draft_updated_at_ms, set_row.completed_at_ms,
          set_row.completion_idempotency_key, set_row.revision
   FROM session_sets_v5 set_row
   JOIN session_exercises exercise
     ON exercise.id = set_row.session_exercise_id`,
  `INSERT INTO session_rest_states
    (session_id, state_version, status, started_at_ms, ends_at_ms,
     remaining_ms, expired_at_ms, next_set_id, revision)
   SELECT session_id, state_version, status, started_at_ms, ends_at_ms,
          remaining_ms, expired_at_ms, next_set_id, revision
   FROM session_rest_states_v5`,
  `INSERT INTO session_undo_snapshots
    (id, session_id, completed_set_id, idempotency_key, snapshot_version,
     snapshot_json, undo_until_ms, consumed_at_ms, created_at_ms)
   SELECT id, session_id, completed_set_id, idempotency_key, snapshot_version,
          snapshot_json, undo_until_ms, consumed_at_ms, created_at_ms
   FROM session_undo_snapshots_v5`,
  `INSERT INTO progression_recommendations
    (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
     evidence_version, evidence_json, current_target_json,
     proposed_target_json, metric_profile, metric_contract_version,
     exercise_metric_generation, status, source_revision, target_revision,
     created_at_ms, decided_at_ms)
   SELECT recommendation.id, recommendation.exercise_id,
          recommendation.plan_working_set_target_id,
          recommendation.rule_type, recommendation.rule_version,
          recommendation.evidence_version, recommendation.evidence_json,
          recommendation.current_target_json,
          recommendation.proposed_target_json, target.metric_profile,
          target.metric_contract_version, target.exercise_metric_generation,
          recommendation.status, recommendation.source_revision,
          recommendation.target_revision, recommendation.created_at_ms,
          recommendation.decided_at_ms
   FROM progression_recommendations_v5 recommendation
   JOIN plan_working_set_targets target
     ON target.id = recommendation.plan_working_set_target_id`,
] as const;

const DROP_LEGACY_TABLES = [
  "progression_recommendations_v5",
  "session_undo_snapshots_v5",
  "session_rest_states_v5",
  "session_sets_v5",
  "session_exercises_v5",
  "workout_sessions_v5",
  "progression_policies_v5",
  "plan_warmup_sets_v5",
  "plan_working_set_targets_v5",
  "plan_day_exercises_v5",
  "exercises_v5",
] as const;

const CREATE_METRIC_SUPPORT = [
  `CREATE TABLE metric_profile_migration_events (
    idempotency_key TEXT PRIMARY KEY NOT NULL
      CHECK(length(trim(idempotency_key)) BETWEEN 1 AND 128),
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    from_metric_profile TEXT NOT NULL
      CHECK(from_metric_profile IN (${METRIC_PROFILES_SQL})),
    from_metric_contract_version INTEGER NOT NULL
      CHECK(from_metric_contract_version >= 1),
    from_exercise_metric_generation INTEGER NOT NULL
      CHECK(from_exercise_metric_generation >= 1),
    to_metric_profile TEXT NOT NULL
      CHECK(to_metric_profile IN (${METRIC_PROFILES_SQL})),
    to_metric_contract_version INTEGER NOT NULL
      CHECK(to_metric_contract_version >= 1),
    to_exercise_metric_generation INTEGER NOT NULL
      CHECK(to_exercise_metric_generation >= 1),
    migrated_target_count INTEGER NOT NULL CHECK(migrated_target_count >= 0),
    invalidated_recommendation_count INTEGER NOT NULL
      CHECK(invalidated_recommendation_count >= 0),
    invalidated_policy_count INTEGER NOT NULL
      CHECK(invalidated_policy_count >= 0),
    invalidated_effect_count INTEGER NOT NULL
      CHECK(invalidated_effect_count >= 0),
    exercise_revision INTEGER NOT NULL CHECK(exercise_revision >= 0),
    request_json TEXT NOT NULL CHECK(json_valid(request_json)),
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    acknowledged_history_immutable INTEGER NOT NULL
      CHECK(acknowledged_history_immutable = 1),
    migrated_at_ms INTEGER NOT NULL CHECK(migrated_at_ms >= 0),
    CHECK(
      to_exercise_metric_generation
      = from_exercise_metric_generation + 1
    ),
    UNIQUE(exercise_id, to_exercise_metric_generation)
  ) STRICT`,
  `CREATE TABLE exercise_metric_baselines (
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    metric_profile TEXT NOT NULL CHECK(metric_profile IN (${METRIC_PROFILES_SQL})),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    status TEXT NOT NULL CHECK(status = 'awaiting_comparable_observation'),
    established_at_ms INTEGER NOT NULL CHECK(established_at_ms >= 0),
    CHECK(${METRIC_IDENTITY_CHECK}),
    PRIMARY KEY(exercise_id, exercise_metric_generation)
  ) STRICT, WITHOUT ROWID`,
  `CREATE UNIQUE INDEX bundled_exercise_source_identity
   ON exercises(source_namespace, upstream_id)
   WHERE origin = 'bundled'`,
  `CREATE UNIQUE INDEX one_active_workout_session
   ON workout_sessions(status)
   WHERE status = 'in_progress'`,
  `CREATE UNIQUE INDEX one_unconsumed_undo_snapshot
   ON session_undo_snapshots(completed_set_id)
   WHERE consumed_at_ms IS NULL`,
  `CREATE UNIQUE INDEX one_pending_recommendation
   ON progression_recommendations(plan_working_set_target_id)
   WHERE status = 'pending'`,
  `CREATE UNIQUE INDEX one_active_progression_policy_type
   ON progression_policies(plan_day_exercise_id, policy_type)
   WHERE status = 'active'`,
  `CREATE INDEX ordered_plan_day_exercises
   ON plan_day_exercises(plan_day_id, ordinal)`,
  `CREATE INDEX ordered_session_exercises
   ON session_exercises(session_id, ordinal)`,
  `CREATE INDEX ordered_session_sets
   ON session_sets(session_exercise_id, set_kind, ordinal)`,
  `CREATE INDEX pending_recommendations_by_exercise
   ON progression_recommendations(exercise_id, status, created_at_ms)`,
  `CREATE INDEX exercise_history
   ON session_exercises(
     exercise_id,
     metric_profile,
     metric_contract_version,
     exercise_metric_generation,
     session_id
   )`,
] as const;

const REQUIRED_TABLE_COLUMNS = {
  exercises: [
    "metric_profile",
    "metric_contract_version",
    "exercise_metric_generation",
  ],
  plan_day_exercises: [
    "metric_profile",
    "metric_contract_version",
    "exercise_metric_generation",
  ],
  plan_working_set_targets: [
    "metric_profile",
    "metric_contract_version",
    "exercise_metric_generation",
    "target_json",
  ],
  progression_policies: [
    "metric_profile",
    "metric_contract_version",
    "exercise_metric_generation",
  ],
  progression_recommendations: [
    "metric_profile",
    "metric_contract_version",
    "exercise_metric_generation",
  ],
  session_exercises: [
    "metric_profile",
    "metric_contract_version",
    "exercise_metric_generation",
  ],
  session_sets: [
    "metric_profile",
    "metric_contract_version",
    "exercise_metric_generation",
    "target_json",
    "observed_json",
  ],
} as const;

export function assertMetricProfileRegistryPairs(
  definitions = listMetricContracts(),
): void {
  const actual = definitions
    .map(({ profile, contractVersion }) => `${profile}:${contractVersion}`)
    .sort();
  const expected = [
    "added_load_reps:1",
    "assisted_reps:1",
    "bodyweight_reps:1",
    "fixed_distance:1",
    "fixed_time:1",
    "intervals:1",
    "load_reps:1",
    "timed_hold:1",
    "timed_hold:2",
    "unscored:1",
  ];
  if (
    actual.length !== expected.length
    || actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error("metric_profile_registry_schema_mismatch");
  }
}

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

async function verifyColumns(
  transaction: SqliteTransactionExecutor,
): Promise<void> {
  for (const [table, requiredColumns] of Object.entries(
    REQUIRED_TABLE_COLUMNS,
  )) {
    const columns = await transaction.queryAll<{ name: string }>(
      `PRAGMA table_info(${table})`,
    );
    if (
      requiredColumns.some((required) =>
        !columns.some(({ name }) => name === required)
      )
    ) {
      throw new Error("metric_profile_schema_incomplete");
    }
  }
}

async function verifyIdentityRows(
  transaction: SqliteTransactionExecutor,
): Promise<void> {
  for (const table of Object.keys(REQUIRED_TABLE_COLUMNS)) {
    const [invalid] = await transaction.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM ${table}
       WHERE metric_contract_version < 1
          OR exercise_metric_generation < 1
          OR NOT (${METRIC_IDENTITY_CHECK})`,
    );
    if (invalid!.count !== 0) {
      throw new Error("metric_profile_identity_invalid");
    }
  }
}

export const metricProfilesMigration: Migration = Object.freeze({
  version: 6,
  name: "metric-profiles",
  kind: "destructive",
  async up(transaction) {
    assertMetricProfileRegistryPairs();
    await transaction.execute("PRAGMA defer_foreign_keys = ON");
    for (const table of TABLES_TO_RENAME) {
      await transaction.execute(`ALTER TABLE ${table} RENAME TO ${table}_v5`);
    }
    await executeAll(transaction, CREATE_WIDENED_TABLES);
    await executeAll(transaction, COPY_WIDENED_ROWS);
    await transaction.execute(
      `UPDATE workout_sessions_v5
       SET active_session_exercise_id = NULL,
           active_set_id = NULL`,
    );
    for (const table of DROP_LEGACY_TABLES) {
      await transaction.execute(`DROP TABLE ${table}`);
    }
    await executeAll(transaction, CREATE_METRIC_SUPPORT);
  },
  async verify(transaction) {
    await verifyColumns(transaction);
    await verifyIdentityRows(transaction);
    const requiredTables = [
      "exercise_metric_baselines",
      "metric_profile_migration_events",
    ];
    const tables = await transaction.queryAll<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
       ORDER BY name`,
    );
    if (
      requiredTables.some((required) =>
        !tables.some(({ name }) => name === required)
      )
    ) {
      throw new Error("metric_profile_support_schema_incomplete");
    }
  },
});
