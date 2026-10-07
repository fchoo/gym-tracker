-- Synthetic, non-personal schema-27 baseline for Phase 13 migration tests.
PRAGMA foreign_keys = ON;
PRAGMA user_version = 27;

CREATE TABLE portable_owner_identity (
  id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
  owner_namespace TEXT NOT NULL CHECK(length(owner_namespace) = 32)
) STRICT;

CREATE TABLE plans (
  id TEXT PRIMARY KEY NOT NULL,
  origin TEXT NOT NULL CHECK(origin = 'custom'),
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK(is_active IN (0, 1)),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  portable_id TEXT NOT NULL CHECK(length(portable_id) = 32)
) STRICT;

CREATE TABLE owned_plan_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL UNIQUE REFERENCES plans(id),
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active', 'inactive')),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  activated_at_ms INTEGER NOT NULL CHECK(activated_at_ms >= 0),
  portable_id TEXT NOT NULL CHECK(length(portable_id) = 32)
) STRICT;

CREATE TABLE workout_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT REFERENCES plans(id),
  source TEXT NOT NULL CHECK(source IN ('scheduled', 'manual')),
  status TEXT NOT NULL CHECK(status IN ('in_progress', 'partial', 'completed')),
  local_date TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  portable_id TEXT NOT NULL CHECK(length(portable_id) = 32)
) STRICT;

CREATE TABLE session_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id),
  exercise_name TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  revision INTEGER NOT NULL CHECK(revision >= 1)
) STRICT;

CREATE TABLE session_sets (
  id TEXT PRIMARY KEY NOT NULL,
  session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id),
  set_kind TEXT NOT NULL CHECK(set_kind IN ('working', 'warmup')),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  status TEXT NOT NULL CHECK(status IN ('planned', 'completed')),
  completed_at_ms INTEGER,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  UNIQUE(session_exercise_id, ordinal)
) STRICT;

CREATE TABLE session_advanced_timing_states (
  session_id TEXT NOT NULL REFERENCES workout_sessions(id),
  session_set_id TEXT NOT NULL REFERENCES session_sets(id),
  status TEXT NOT NULL CHECK(status IN ('ready', 'running', 'paused', 'stopped', 'expired', 'gap')),
  mode TEXT NOT NULL CHECK(mode IN ('per_rep', 'cluster')),
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  progress_json TEXT NOT NULL CHECK(json_valid(progress_json)),
  PRIMARY KEY(session_id, session_set_id)
) STRICT;

CREATE TABLE automatic_backup_state (
  id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
  environment TEXT NOT NULL CHECK(environment = 'production'),
  connection_generation INTEGER NOT NULL CHECK(connection_generation >= 0),
  mutation_generation INTEGER NOT NULL CHECK(mutation_generation >= 0),
  backed_up_generation INTEGER NOT NULL CHECK(backed_up_generation >= 0 AND backed_up_generation <= mutation_generation)
) STRICT;

CREATE TRIGGER v27_completed_set_immutable
BEFORE UPDATE ON session_sets FOR EACH ROW
WHEN OLD.status = 'completed'
BEGIN SELECT RAISE(ABORT, 'completed_set_immutable'); END;

INSERT INTO portable_owner_identity VALUES
  (1, '0123456789abcdef0123456789abcdef');
INSERT INTO plans VALUES
  ('plan-strength-legacy', 'custom', 'Strength legacy', 1, 7, '11111111111111111111111111111111');
INSERT INTO owned_plan_schedules VALUES
  ('schedule-strength-legacy', 'plan-strength-legacy', 'active', 5, 1700000000000, '22222222222222222222222222222222');
INSERT INTO workout_sessions VALUES
  ('session-completed', 'plan-strength-legacy', 'scheduled', 'completed', '2026-10-01', 1700000000100, 1700000000200, 3, '33333333333333333333333333333333'),
  ('session-in-progress', 'plan-strength-legacy', 'scheduled', 'in_progress', '2026-10-02', 1700000000300, NULL, 2, '44444444444444444444444444444444'),
  ('session-partial', 'plan-strength-legacy', 'scheduled', 'partial', '2026-10-02', 1700000000400, 1700000000500, 2, '55555555555555555555555555555555');
INSERT INTO session_exercises VALUES
  ('exercise-completed', 'session-completed', 'Synthetic press', 0, 2),
  ('exercise-recovery', 'session-in-progress', 'Synthetic row', 0, 1);
INSERT INTO session_sets VALUES
  ('set-completed', 'exercise-completed', 'working', 0, 'completed', 1700000000200, 2),
  ('set-recovery', 'exercise-recovery', 'working', 0, 'planned', NULL, 1);
INSERT INTO session_advanced_timing_states VALUES
  ('session-in-progress', 'set-recovery', 'ready', 'per_rep', '{"version":1,"mode":"per_rep"}', '{}'),
  ('session-partial', 'set-completed', 'running', 'per_rep', '{"version":1,"mode":"per_rep"}', '{"next":1}'),
  ('session-completed', 'set-completed', 'paused', 'cluster', '{"version":1,"mode":"cluster"}', '{"remaining":1}'),
  ('session-completed', 'set-recovery', 'stopped', 'cluster', '{"version":1,"mode":"cluster"}', '{}'),
  ('session-partial', 'set-recovery', 'expired', 'per_rep', '{"version":1,"mode":"per_rep"}', '{}'),
  ('session-in-progress', 'set-completed', 'gap', 'cluster', '{"version":1,"mode":"cluster"}', '{}');
INSERT INTO automatic_backup_state VALUES (1, 'production', 3, 9, 7);
