PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE plans (
  id TEXT PRIMARY KEY NOT NULL,
  content_pack_id TEXT,
  origin TEXT NOT NULL CHECK(origin IN ('bundled', 'custom', 'copied')),
  source_namespace TEXT,
  upstream_id TEXT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  days_per_week INTEGER NOT NULL CHECK(days_per_week >= 1),
  audience TEXT NOT NULL CHECK(length(trim(audience)) > 0),
  goal TEXT NOT NULL CHECK(length(trim(goal)) > 0),
  estimate_minutes INTEGER NOT NULL CHECK(estimate_minutes >= 1),
  attribution TEXT NOT NULL CHECK(length(trim(attribution)) > 0),
  is_active INTEGER NOT NULL CHECK(is_active IN (0, 1)),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  CHECK(
    (origin = 'custom' AND source_namespace IS NULL AND upstream_id IS NULL)
    OR
    (origin IN ('bundled', 'copied')
     AND source_namespace IS NOT NULL
     AND upstream_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE plan_days (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  UNIQUE(plan_id, ordinal)
) STRICT;

CREATE TABLE exercise_library_entries (
  exercise_id TEXT PRIMARY KEY NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('bundled', 'custom', 'copied')),
  canonical_name TEXT NOT NULL CHECK(length(trim(canonical_name)) > 0),
  normalized_name TEXT NOT NULL CHECK(length(trim(normalized_name)) > 0),
  exercise_type TEXT NOT NULL,
  metric_profile TEXT NOT NULL,
  metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
  exercise_metric_generation INTEGER NOT NULL
    CHECK(exercise_metric_generation >= 1),
  availability TEXT NOT NULL CHECK(
    availability IN ('available', 'unavailable')
  ),
  source_revision INTEGER NOT NULL CHECK(source_revision >= 1),
  license TEXT NOT NULL,
  attribution TEXT NOT NULL,
  instructions_json TEXT NOT NULL CHECK(json_valid(instructions_json)),
  default_rest_seconds INTEGER NOT NULL CHECK(default_rest_seconds >= 0),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms)
) STRICT;

CREATE TABLE plan_day_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  exercise_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  between_exercise_rest_seconds INTEGER,
  metric_profile TEXT NOT NULL,
  metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
  exercise_metric_generation INTEGER NOT NULL
    CHECK(exercise_metric_generation >= 1),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  UNIQUE(plan_day_id, ordinal),
  UNIQUE(plan_day_id, exercise_id)
) STRICT;

CREATE TABLE plan_working_set_targets (
  id TEXT PRIMARY KEY NOT NULL,
  plan_day_exercise_id TEXT NOT NULL
    REFERENCES plan_day_exercises(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
  min_reps INTEGER NOT NULL CHECK(min_reps >= 0),
  max_reps INTEGER NOT NULL CHECK(max_reps >= min_reps),
  target_json TEXT NOT NULL CHECK(json_valid(target_json)),
  unit_json TEXT NOT NULL CHECK(json_valid(unit_json)),
  metric_profile TEXT NOT NULL,
  metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
  exercise_metric_generation INTEGER NOT NULL
    CHECK(exercise_metric_generation >= 1),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  UNIQUE(plan_day_exercise_id, ordinal)
) STRICT;

CREATE TABLE owned_plan_day_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  exercise_id TEXT NOT NULL
    REFERENCES exercise_library_entries(exercise_id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  between_exercise_rest_seconds INTEGER NOT NULL CHECK(
    between_exercise_rest_seconds >= 0
  ),
  metric_profile TEXT NOT NULL,
  metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
  exercise_metric_generation INTEGER NOT NULL
    CHECK(exercise_metric_generation >= 1),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  UNIQUE(plan_day_id, ordinal)
) STRICT;

CREATE TABLE owned_plan_warmup_sets (
  id TEXT PRIMARY KEY NOT NULL,
  plan_day_exercise_id TEXT NOT NULL
    REFERENCES owned_plan_day_exercises(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
  reps INTEGER NOT NULL CHECK(reps >= 1),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  UNIQUE(plan_day_exercise_id, ordinal)
) STRICT;

CREATE TABLE owned_plan_working_set_targets (
  id TEXT PRIMARY KEY NOT NULL,
  plan_day_exercise_id TEXT NOT NULL
    REFERENCES owned_plan_day_exercises(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  target_json TEXT NOT NULL CHECK(json_valid(target_json)),
  unit_json TEXT NOT NULL CHECK(json_valid(unit_json)),
  metric_profile TEXT NOT NULL,
  metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
  exercise_metric_generation INTEGER NOT NULL
    CHECK(exercise_metric_generation >= 1),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  UNIQUE(plan_day_exercise_id, ordinal)
) STRICT;

CREATE TABLE owned_plan_progression_policies (
  id TEXT PRIMARY KEY NOT NULL,
  plan_day_exercise_id TEXT NOT NULL UNIQUE
    REFERENCES owned_plan_day_exercises(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  policy_kind TEXT NOT NULL CHECK(
    policy_kind IN ('automatic', 'manual_hold', 'plan_authored')
  ),
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK(policy_version >= 1),
  rule_json TEXT NOT NULL CHECK(json_valid(rule_json)),
  metric_profile TEXT NOT NULL,
  metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
  exercise_metric_generation INTEGER NOT NULL
    CHECK(exercise_metric_generation >= 1),
  status TEXT NOT NULL CHECK(status = 'active'),
  revision INTEGER NOT NULL CHECK(revision >= 1)
) STRICT;

CREATE TABLE owned_plan_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL UNIQUE REFERENCES plans(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active', 'inactive')),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  activated_at_ms INTEGER NOT NULL CHECK(activated_at_ms >= 0),
  deactivated_at_ms INTEGER,
  CHECK(
    (lifecycle = 'active' AND deactivated_at_ms IS NULL)
    OR
    (lifecycle = 'inactive' AND deactivated_at_ms IS NOT NULL)
  )
) STRICT;

CREATE TABLE owned_plan_schedule_versions (
  id TEXT PRIMARY KEY NOT NULL,
  schedule_id TEXT NOT NULL
    REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  version_number INTEGER NOT NULL CHECK(version_number >= 1),
  effective_local_date TEXT NOT NULL CHECK(length(effective_local_date) = 10),
  mode TEXT NOT NULL CHECK(mode IN ('weekday', 'rotation')),
  timezone TEXT NOT NULL CHECK(length(trim(timezone)) > 0),
  rotation_pointer INTEGER,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
  UNIQUE(schedule_id, version_number),
  UNIQUE(schedule_id, effective_local_date)
) STRICT;

CREATE TABLE owned_plan_schedule_bindings (
  id TEXT PRIMARY KEY NOT NULL,
  schedule_version_id TEXT NOT NULL
    REFERENCES owned_plan_schedule_versions(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  mode TEXT NOT NULL CHECK(mode IN ('weekday', 'rotation')),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  week_index INTEGER,
  weekday TEXT,
  plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  UNIQUE(schedule_version_id, ordinal),
  UNIQUE(schedule_version_id, week_index, weekday)
) STRICT;

CREATE TABLE workout_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT REFERENCES plans(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  plan_day_id TEXT REFERENCES plan_days(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  local_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  active_session_exercise_id TEXT,
  active_set_id TEXT,
  revision INTEGER NOT NULL
) STRICT;

CREATE TABLE session_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE RESTRICT,
  source_plan_day_exercise_id TEXT,
  exercise_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  metric_profile TEXT NOT NULL,
  metric_contract_version INTEGER NOT NULL,
  exercise_metric_generation INTEGER NOT NULL,
  default_rest_seconds INTEGER NOT NULL,
  target_revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL
) STRICT;

INSERT INTO exercise_library_entries VALUES
  ('exercise-squat', 'bundled', 'Back Squat', 'back squat', 'strength',
   'load_reps', 1, 1, 'available', 1, 'MIT', 'Retained fixture',
   '[]', 120, 0, 0),
  ('exercise-plank', 'bundled', 'Plank', 'plank', 'strength',
   'timed_hold', 1, 1, 'available', 1, 'MIT', 'Retained fixture',
   '[]', 60, 0, 0);

INSERT INTO plans VALUES
  ('retained-plan', NULL, 'copied', 'gym-tracker.starter-plans',
   'full-body-foundation', 'Retained Active Plan', 1, 'Owner',
   'General strength', 30, 'Retained fixture', 1, 4);

INSERT INTO plan_days VALUES
  ('retained-day', 'retained-plan', 0, 'Full Body', 2);

INSERT INTO owned_plan_day_exercises VALUES
  ('retained-occurrence', 'retained-day', 'exercise-squat', 0, 90,
   'load_reps', 1, 1, 2);

INSERT INTO owned_plan_working_set_targets VALUES
  ('retained-target', 'retained-occurrence', 0,
   '{"profile":"load_reps","version":1,"loadGrams":20000,"minReps":8,"maxReps":12}',
   '{"version":1,"load":"grams","count":"repetitions"}',
   'load_reps', 1, 1, 2);

INSERT INTO owned_plan_progression_policies VALUES
  ('retained-policy', 'retained-occurrence', 'manual_hold', 'manual-hold-v1',
   1, '{"kind":"manual_hold","id":"manual-hold-v1","version":1}',
   'load_reps', 1, 1, 'active', 2);

INSERT INTO owned_plan_schedules VALUES
  ('retained-schedule', 'retained-plan', 'active', 3, 100, NULL);

INSERT INTO owned_plan_schedule_versions VALUES
  ('retained-schedule:version:1', 'retained-schedule', 1, '2026-08-18',
   'weekday', 'Asia/Singapore', NULL, 100);

INSERT INTO owned_plan_schedule_bindings VALUES
  ('retained-binding', 'retained-schedule:version:1', 'weekday', 0, 0,
   'Monday', 'retained-day');

CREATE UNIQUE INDEX one_active_owned_schedule
ON owned_plan_schedules(lifecycle)
WHERE lifecycle = 'active';

CREATE UNIQUE INDEX one_active_owned_plan
ON plans(is_active)
WHERE is_active = 1;

COMMIT;
PRAGMA foreign_keys = ON;
PRAGMA user_version = 8;
