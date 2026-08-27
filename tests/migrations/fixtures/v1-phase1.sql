PRAGMA foreign_keys = ON;

CREATE TABLE content_packs (
  id TEXT PRIMARY KEY NOT NULL,
  namespace TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  source_revision INTEGER NOT NULL CHECK(source_revision >= 0),
  installed_at_ms INTEGER NOT NULL CHECK(installed_at_ms >= 0),
  UNIQUE(namespace, version),
  UNIQUE(namespace, source_revision)
) STRICT;

CREATE TABLE exercises (
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
) STRICT;

CREATE TABLE plans (
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
) STRICT;

CREATE TABLE plan_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode = 'weekday'),
  start_local_date TEXT NOT NULL CHECK(length(start_local_date) = 10),
  timezone TEXT NOT NULL CHECK(length(trim(timezone)) > 0),
  cycle_length_weeks INTEGER NOT NULL CHECK(cycle_length_weeks >= 1),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  UNIQUE(plan_id)
) STRICT;

CREATE TABLE plan_schedule_bindings (
  id TEXT PRIMARY KEY NOT NULL,
  schedule_id TEXT NOT NULL REFERENCES plan_schedules(id) ON DELETE CASCADE,
  week_index INTEGER NOT NULL CHECK(week_index >= 0),
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
  plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  UNIQUE(schedule_id, week_index, weekday)
) STRICT;

CREATE TABLE plan_days (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  UNIQUE(plan_id, ordinal)
) STRICT;

CREATE TABLE plan_day_exercises (
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
) STRICT;

CREATE TABLE plan_warmup_sets (
  id TEXT PRIMARY KEY NOT NULL,
  plan_day_exercise_id TEXT NOT NULL
    REFERENCES plan_day_exercises(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
  reps INTEGER NOT NULL CHECK(reps >= 0),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  UNIQUE(plan_day_exercise_id, ordinal)
) STRICT;

CREATE TABLE plan_working_set_targets (
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
) STRICT;

CREATE TABLE progression_policies (
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
) STRICT;

CREATE TABLE workout_sessions (
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
) STRICT;

CREATE TABLE session_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT,
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
) STRICT;

CREATE TABLE session_sets (
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
) STRICT;

CREATE TABLE session_rest_states (
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
) STRICT;

CREATE TABLE session_undo_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT,
  completed_set_id TEXT NOT NULL REFERENCES session_sets(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  snapshot_version INTEGER NOT NULL CHECK(snapshot_version >= 1),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  undo_until_ms INTEGER NOT NULL CHECK(undo_until_ms >= 0),
  consumed_at_ms INTEGER CHECK(consumed_at_ms IS NULL OR consumed_at_ms >= 0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
) STRICT;

CREATE TABLE progression_recommendations (
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
) STRICT;

CREATE TABLE pending_effects (
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
) STRICT;

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_version INTEGER NOT NULL CHECK(value_version >= 1),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
) STRICT;

CREATE UNIQUE INDEX one_active_workout_session
  ON workout_sessions(status)
  WHERE status = 'in_progress';
CREATE UNIQUE INDEX bundled_exercise_source_identity
  ON exercises(source_namespace, upstream_id)
  WHERE origin = 'bundled';
CREATE UNIQUE INDEX bundled_plan_source_identity
  ON plans(source_namespace, upstream_id)
  WHERE origin = 'bundled';
CREATE UNIQUE INDEX one_unconsumed_undo_snapshot
  ON session_undo_snapshots(completed_set_id)
  WHERE consumed_at_ms IS NULL;
CREATE UNIQUE INDEX one_pending_recommendation
  ON progression_recommendations(plan_working_set_target_id)
  WHERE status = 'pending';
CREATE INDEX ordered_plan_day_exercises
  ON plan_day_exercises(plan_day_id, ordinal);
CREATE INDEX ordered_session_exercises
  ON session_exercises(session_id, ordinal);
CREATE INDEX ordered_session_sets
  ON session_sets(session_exercise_id, set_kind, ordinal);
CREATE INDEX eligible_pending_effects
  ON pending_effects(status, next_attempt_at_ms, created_at_ms);
CREATE INDEX pending_recommendations_by_exercise
  ON progression_recommendations(exercise_id, status, created_at_ms);

INSERT INTO content_packs
  (id, namespace, version, source_revision, installed_at_ms)
VALUES
  ('pack-foundation', 'foundation', 1, 3, 1000);

INSERT INTO exercises
  (id, content_pack_id, origin, source_namespace, upstream_id, name,
   metric_profile, default_rest_seconds, revision)
VALUES
  ('exercise-squat', 'pack-foundation', 'bundled', 'foundation', 'squat',
   'Squat', 'load_reps', 120, 2);

INSERT INTO plans
  (id, content_pack_id, origin, source_namespace, upstream_id, name,
   days_per_week, is_active, revision)
VALUES
  ('plan-bundled', 'pack-foundation', 'bundled', 'foundation',
   'full-body-foundation', 'Full Body Foundation', 3, 0, 4),
  ('plan-copy', NULL, 'copied', 'foundation', 'full-body-foundation',
   'Full Body Foundation', 3, 1, 7);

INSERT INTO plan_days
  (id, plan_id, ordinal, name, revision)
VALUES
  ('plan-day-copy', 'plan-copy', 0, 'Full Body A', 2);

INSERT INTO plan_day_exercises
  (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds, revision)
VALUES
  ('plan-day-exercise-squat', 'plan-day-copy', 'exercise-squat', 0, 120, 3);

INSERT INTO plan_warmup_sets
  (id, plan_day_exercise_id, ordinal, load_grams, reps, revision)
VALUES
  ('warmup-target-1', 'plan-day-exercise-squat', 0, 20000, 5, 1);

INSERT INTO plan_working_set_targets
  (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps, revision)
VALUES
  ('working-target-1', 'plan-day-exercise-squat', 0, 40000, 6, 8, 7);

INSERT INTO progression_policies
  (id, plan_day_exercise_id, policy_type, policy_version, rule_json, revision)
VALUES
  ('policy-1', 'plan-day-exercise-squat', 'load_reps', 1,
   '{"version":1,"incrementGrams":2500}', 1);

INSERT INTO workout_sessions
  (id, plan_id, plan_day_id, source, status, local_date, timezone,
   started_at_ms, completed_at_ms, active_session_exercise_id, active_set_id,
   revision)
VALUES
  ('session-active', 'plan-copy', 'plan-day-copy', 'scheduled_day',
   'in_progress', '2026-08-16', 'Asia/Singapore', 2000, NULL, NULL, NULL, 9);

INSERT INTO session_exercises
  (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
   exercise_name, metric_profile, default_rest_seconds, target_revision,
   status, revision)
VALUES
  ('session-exercise-squat', 'session-active', 'plan-day-exercise-squat',
   'exercise-squat', 0, 'Squat', 'load_reps', 120, 7, 'active', 4);

INSERT INTO session_sets
  (id, session_exercise_id, set_kind, ordinal, target_load_grams,
   target_min_reps, target_max_reps, observed_load_grams, observed_reps,
   status, draft_updated_at_ms, completed_at_ms, completion_idempotency_key,
   revision)
VALUES
  ('set-completed', 'session-exercise-squat', 'working', 0, 40000, 6, 8,
   40000, 8, 'completed', 2500, 2600, 'complete-set-1', 2),
  ('set-draft', 'session-exercise-squat', 'working', 1, 40000, 6, 8,
   40000, 7, 'draft', 2700, NULL, NULL, 3);

UPDATE workout_sessions
SET active_session_exercise_id = 'session-exercise-squat',
    active_set_id = 'set-draft'
WHERE id = 'session-active';

INSERT INTO session_rest_states
  (session_id, state_version, status, started_at_ms, ends_at_ms, remaining_ms,
   expired_at_ms, next_set_id, revision)
VALUES
  ('session-active', 1, 'running', 2600, 122600, NULL, NULL, 'set-draft', 5);

INSERT INTO session_undo_snapshots
  (id, session_id, completed_set_id, idempotency_key, snapshot_version,
   snapshot_json, undo_until_ms, consumed_at_ms, created_at_ms)
VALUES
  ('undo-1', 'session-active', 'set-completed', 'undo-complete-set-1', 1,
   '{"version":1,"activeSetId":"set-completed","restStatus":"idle"}',
   10600, NULL, 2600);

INSERT INTO progression_recommendations
  (id, exercise_id, plan_working_set_target_id, rule_type, rule_version,
   evidence_version, evidence_json, current_target_json, proposed_target_json,
   status, source_revision, target_revision, created_at_ms, decided_at_ms)
VALUES
  ('recommendation-1', 'exercise-squat', 'working-target-1', 'load_reps', 1,
   1, '{"sets":["8","8","8"]}', '{"loadGrams":40000,"reps":8}',
   '{"loadGrams":42500,"reps":6}', 'pending', 2, 7, 3000, NULL);

INSERT INTO pending_effects
  (id, effect_type, payload_version, payload_json, idempotency_key, subject_id,
   expected_revision, status, attempt_count, next_attempt_at_ms, claimed_at_ms,
   lease_expires_at_ms, last_error_code, created_at_ms, updated_at_ms)
VALUES
  ('effect-rest', 'reconcile_rest_notification', 1,
   '{"version":1,"sessionId":"session-active","restRevision":5}',
   'rest-session-active-r5', 'session-active', 5, 'pending', 0, 2600,
   NULL, NULL, NULL, 2600, 2600);

INSERT INTO app_settings
  (key, value_version, value_json, revision, updated_at_ms)
VALUES
  ('appearance', 1, '{"preference":"System"}', 1, 1000),
  ('selected_copied_plan', 1, '{"planId":"plan-copy"}', 1, 1000);

PRAGMA user_version = 1;
