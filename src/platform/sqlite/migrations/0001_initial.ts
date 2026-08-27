import {
  type Migration,
} from "../migrationRunner";

export const INITIAL_SCHEMA_STATEMENTS = [
  `CREATE TABLE content_packs (
    id TEXT PRIMARY KEY NOT NULL,
    namespace TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version >= 1),
    source_revision INTEGER NOT NULL CHECK(source_revision >= 0),
    installed_at_ms INTEGER NOT NULL CHECK(installed_at_ms >= 0),
    UNIQUE(namespace, version),
    UNIQUE(namespace, source_revision)
  ) STRICT`,
  `CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    content_pack_id TEXT REFERENCES content_packs(id) ON DELETE RESTRICT,
    origin TEXT NOT NULL CHECK(origin IN ('bundled', 'custom', 'copied')),
    source_namespace TEXT,
    upstream_id TEXT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    metric_profile TEXT NOT NULL CHECK(
      metric_profile IN ('load_reps', 'timed_hold')
    ),
    equipment TEXT NOT NULL DEFAULT 'Unspecified'
      CHECK(length(trim(equipment)) > 0),
    default_rest_seconds INTEGER NOT NULL CHECK(default_rest_seconds >= 0),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK(
      (origin = 'custom' AND source_namespace IS NULL AND upstream_id IS NULL)
      OR
      (origin IN ('bundled', 'copied')
       AND source_namespace IS NOT NULL
       AND upstream_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE TABLE plans (
    id TEXT PRIMARY KEY NOT NULL,
    content_pack_id TEXT REFERENCES content_packs(id) ON DELETE RESTRICT,
    origin TEXT NOT NULL CHECK(origin IN ('bundled', 'custom', 'copied')),
    source_namespace TEXT,
    upstream_id TEXT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    days_per_week INTEGER NOT NULL CHECK(days_per_week >= 1),
    audience TEXT NOT NULL DEFAULT 'Unspecified'
      CHECK(length(trim(audience)) > 0),
    goal TEXT NOT NULL DEFAULT 'Unspecified' CHECK(length(trim(goal)) > 0),
    estimate_minutes INTEGER NOT NULL DEFAULT 1 CHECK(estimate_minutes >= 1),
    attribution TEXT NOT NULL DEFAULT 'Unspecified'
      CHECK(length(trim(attribution)) > 0),
    is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0, 1)),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK(
      (origin = 'custom' AND source_namespace IS NULL AND upstream_id IS NULL)
      OR
      (origin IN ('bundled', 'copied')
       AND source_namespace IS NOT NULL
       AND upstream_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE TABLE plan_schedules (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK(mode = 'weekday'),
    start_local_date TEXT NOT NULL CHECK(length(start_local_date) = 10),
    timezone TEXT NOT NULL CHECK(length(trim(timezone)) > 0),
    cycle_length_weeks INTEGER NOT NULL CHECK(cycle_length_weeks >= 1),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(plan_id)
  ) STRICT`,
  `CREATE TABLE plan_schedule_bindings (
    id TEXT PRIMARY KEY NOT NULL,
    schedule_id TEXT NOT NULL REFERENCES plan_schedules(id) ON DELETE CASCADE,
    week_index INTEGER NOT NULL CHECK(week_index >= 0),
    weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
    plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(schedule_id, week_index, weekday)
  ) STRICT`,
  `CREATE TABLE plan_days (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(plan_id, ordinal)
  ) STRICT`,
  `CREATE TABLE plan_day_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    between_exercise_rest_seconds INTEGER CHECK(
      between_exercise_rest_seconds IS NULL
      OR between_exercise_rest_seconds >= 0
    ),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(plan_day_id, ordinal),
    UNIQUE(plan_day_id, exercise_id)
  ) STRICT`,
  `CREATE TABLE plan_warmup_sets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL
      REFERENCES plan_day_exercises(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
    reps INTEGER NOT NULL CHECK(reps >= 0),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(plan_day_exercise_id, ordinal)
  ) STRICT`,
  `CREATE TABLE plan_working_set_targets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL
      REFERENCES plan_day_exercises(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
    min_reps INTEGER NOT NULL CHECK(min_reps >= 0),
    max_reps INTEGER NOT NULL CHECK(max_reps >= min_reps),
    target_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(target_json)),
    unit_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(unit_json)),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(plan_day_exercise_id, ordinal)
  ) STRICT`,
  `CREATE TABLE progression_policies (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL
      REFERENCES plan_day_exercises(id) ON DELETE CASCADE,
    policy_type TEXT NOT NULL CHECK(
      policy_type IN ('load_reps', 'manual_hold')
    ),
    policy_version INTEGER NOT NULL CHECK(policy_version >= 1),
    rule_json TEXT NOT NULL CHECK(json_valid(rule_json)),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(plan_day_exercise_id, policy_type)
  ) STRICT`,
  `CREATE TABLE workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT REFERENCES plans(id) ON DELETE RESTRICT,
    plan_day_id TEXT REFERENCES plan_days(id) ON DELETE RESTRICT,
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
      REFERENCES session_exercises(id) ON DELETE SET NULL,
    active_set_id TEXT REFERENCES session_sets(id) ON DELETE SET NULL,
    revision INTEGER NOT NULL CHECK(revision >= 0)
  ) STRICT`,
  `CREATE TABLE session_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL
      REFERENCES workout_sessions(id) ON DELETE RESTRICT,
    source_plan_day_exercise_id TEXT
      REFERENCES plan_day_exercises(id) ON DELETE SET NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    exercise_name TEXT NOT NULL CHECK(length(trim(exercise_name)) > 0),
    metric_profile TEXT NOT NULL CHECK(
      metric_profile IN ('load_reps', 'timed_hold')
    ),
    default_rest_seconds INTEGER NOT NULL CHECK(default_rest_seconds >= 0),
    target_revision INTEGER NOT NULL CHECK(target_revision >= 0),
    status TEXT NOT NULL CHECK(status IN ('planned', 'active', 'completed', 'skipped')),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(session_id, ordinal)
  ) STRICT`,
  `CREATE TABLE session_sets (
    id TEXT PRIMARY KEY NOT NULL,
    session_exercise_id TEXT NOT NULL
      REFERENCES session_exercises(id) ON DELETE RESTRICT,
    set_kind TEXT NOT NULL CHECK(set_kind IN ('warmup', 'working')),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    source_plan_working_set_target_id TEXT
      REFERENCES plan_working_set_targets(id) ON DELETE SET NULL,
    target_load_grams INTEGER NOT NULL CHECK(target_load_grams >= 0),
    target_min_reps INTEGER NOT NULL CHECK(target_min_reps >= 0),
    target_max_reps INTEGER NOT NULL CHECK(target_max_reps >= target_min_reps),
    target_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(target_json)),
    unit_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(unit_json)),
    rule_type TEXT NOT NULL DEFAULT 'load_reps' CHECK(
      rule_type IN ('load_reps', 'manual_hold')
    ),
    rule_version INTEGER NOT NULL DEFAULT 1 CHECK(rule_version >= 1),
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
    UNIQUE(session_exercise_id, set_kind, ordinal)
  ) STRICT`,
  `CREATE TABLE session_rest_states (
    session_id TEXT PRIMARY KEY NOT NULL
      REFERENCES workout_sessions(id) ON DELETE RESTRICT,
    state_version INTEGER NOT NULL CHECK(state_version = 1),
    status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'paused', 'expired')),
    started_at_ms INTEGER CHECK(started_at_ms IS NULL OR started_at_ms >= 0),
    ends_at_ms INTEGER CHECK(ends_at_ms IS NULL OR ends_at_ms >= 0),
    remaining_ms INTEGER CHECK(remaining_ms IS NULL OR remaining_ms >= 0),
    expired_at_ms INTEGER CHECK(expired_at_ms IS NULL OR expired_at_ms >= 0),
    next_set_id TEXT REFERENCES session_sets(id) ON DELETE SET NULL,
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
      REFERENCES workout_sessions(id) ON DELETE RESTRICT,
    completed_set_id TEXT NOT NULL
      REFERENCES session_sets(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL UNIQUE,
    snapshot_version INTEGER NOT NULL CHECK(snapshot_version >= 1),
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
    undo_until_ms INTEGER NOT NULL CHECK(undo_until_ms >= 0),
    consumed_at_ms INTEGER CHECK(consumed_at_ms IS NULL OR consumed_at_ms >= 0),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE progression_recommendations (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    plan_working_set_target_id TEXT NOT NULL
      REFERENCES plan_working_set_targets(id) ON DELETE RESTRICT,
    rule_type TEXT NOT NULL CHECK(rule_type IN ('load_reps')),
    rule_version INTEGER NOT NULL CHECK(rule_version >= 1),
    evidence_version INTEGER NOT NULL CHECK(evidence_version >= 1),
    evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
    current_target_json TEXT NOT NULL CHECK(json_valid(current_target_json)),
    proposed_target_json TEXT NOT NULL CHECK(json_valid(proposed_target_json)),
    status TEXT NOT NULL CHECK(
      status IN ('pending', 'accepted', 'rejected', 'invalidated', 'superseded')
    ),
    source_revision INTEGER NOT NULL CHECK(source_revision >= 0),
    target_revision INTEGER NOT NULL CHECK(target_revision >= 0),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    decided_at_ms INTEGER CHECK(decided_at_ms IS NULL OR decided_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE pending_effects (
    id TEXT PRIMARY KEY NOT NULL,
    effect_type TEXT NOT NULL CHECK(
      effect_type IN ('reconcile_rest_notification', 'regenerate_load_reps_recommendation')
    ),
    payload_version INTEGER NOT NULL CHECK(payload_version >= 1),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    idempotency_key TEXT NOT NULL UNIQUE,
    subject_id TEXT NOT NULL,
    expected_revision INTEGER NOT NULL CHECK(expected_revision >= 0),
    status TEXT NOT NULL CHECK(
      status IN ('pending', 'processing', 'completed', 'superseded', 'permanent_failure')
    ),
    attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
    next_attempt_at_ms INTEGER NOT NULL CHECK(next_attempt_at_ms >= 0),
    claimed_at_ms INTEGER CHECK(claimed_at_ms IS NULL OR claimed_at_ms >= 0),
    lease_expires_at_ms INTEGER CHECK(
      lease_expires_at_ms IS NULL OR lease_expires_at_ms >= 0
    ),
    last_error_code TEXT CHECK(
      last_error_code IS NULL
      OR (
        length(last_error_code) BETWEEN 3 AND 80
        AND last_error_code NOT GLOB '*[^A-Za-z0-9_:-]*'
      )
    ),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
    CHECK(
      (status = 'processing'
       AND claimed_at_ms IS NOT NULL
       AND lease_expires_at_ms IS NOT NULL)
      OR
      (status <> 'processing'
       AND claimed_at_ms IS NULL
       AND lease_expires_at_ms IS NULL)
    ),
    UNIQUE(effect_type, subject_id, expected_revision)
  ) STRICT`,
  `CREATE TABLE app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_version INTEGER NOT NULL CHECK(value_version >= 1),
    value_json TEXT NOT NULL CHECK(json_valid(value_json)),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
  ) STRICT`,
  `CREATE UNIQUE INDEX one_active_workout_session
   ON workout_sessions(status)
   WHERE status = 'in_progress'`,
  `CREATE UNIQUE INDEX bundled_exercise_source_identity
   ON exercises(source_namespace, upstream_id)
   WHERE origin = 'bundled'`,
  `CREATE UNIQUE INDEX bundled_plan_source_identity
   ON plans(source_namespace, upstream_id)
   WHERE origin = 'bundled'`,
  `CREATE UNIQUE INDEX one_unconsumed_undo_snapshot
   ON session_undo_snapshots(completed_set_id)
   WHERE consumed_at_ms IS NULL`,
  `CREATE UNIQUE INDEX one_pending_recommendation
   ON progression_recommendations(plan_working_set_target_id)
   WHERE status = 'pending'`,
  `CREATE INDEX ordered_plan_day_exercises
   ON plan_day_exercises(plan_day_id, ordinal)`,
  `CREATE INDEX ordered_session_exercises
   ON session_exercises(session_id, ordinal)`,
  `CREATE INDEX ordered_session_sets
   ON session_sets(session_exercise_id, set_kind, ordinal)`,
  `CREATE INDEX eligible_pending_effects
   ON pending_effects(status, next_attempt_at_ms, created_at_ms)`,
  `CREATE INDEX pending_recommendations_by_exercise
   ON progression_recommendations(exercise_id, status, created_at_ms)`,
] as const;

export const initialMigration: Migration = Object.freeze({
  version: 1,
  name: "initial",
  kind: "additive",
  async up(transaction) {
    for (const statement of INITIAL_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction) {
    const tables = await transaction.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    );
    const requiredTables = [
      "app_settings",
      "content_packs",
      "exercises",
      "pending_effects",
      "plan_day_exercises",
      "plan_days",
      "plan_schedule_bindings",
      "plan_schedules",
      "plan_warmup_sets",
      "plan_working_set_targets",
      "plans",
      "progression_policies",
      "progression_recommendations",
      "session_exercises",
      "session_rest_states",
      "session_sets",
      "session_undo_snapshots",
      "workout_sessions",
    ];
    if (
      requiredTables.some((required) =>
        !tables.some(({ name }) => name === required),
      )
    ) {
      throw new Error("initial_schema_incomplete");
    }
  },
});
