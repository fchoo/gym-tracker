CREATE VIRTUAL TABLE exercise_search_terms_fts USING fts5(
  normalized_text,
  content = 'exercise_search_terms',
  content_rowid = 'id',
  tokenize = 'trigram'
);

CREATE TRIGGER exercise_search_terms_fts_ai
AFTER INSERT ON exercise_search_terms
BEGIN
  INSERT INTO exercise_search_terms_fts(rowid, normalized_text)
  VALUES (new.id, new.normalized_text);
END;

CREATE TRIGGER exercise_search_terms_fts_ad
AFTER DELETE ON exercise_search_terms
BEGIN
  INSERT INTO exercise_search_terms_fts(
    exercise_search_terms_fts,
    rowid,
    normalized_text
  )
  VALUES ('delete', old.id, old.normalized_text);
END;

CREATE TRIGGER exercise_search_terms_fts_au
AFTER UPDATE OF normalized_text ON exercise_search_terms
BEGIN
  INSERT INTO exercise_search_terms_fts(
    exercise_search_terms_fts,
    rowid,
    normalized_text
  )
  VALUES ('delete', old.id, old.normalized_text);
  INSERT INTO exercise_search_terms_fts(rowid, normalized_text)
  VALUES (new.id, new.normalized_text);
END;

INSERT INTO exercise_search_terms_fts(exercise_search_terms_fts)
VALUES ('rebuild');

INSERT INTO exercises
  (id, content_pack_id, origin, source_namespace, upstream_id, name,
   metric_profile, equipment, default_rest_seconds, revision)
VALUES
  ('exercise-plank', NULL, 'custom', NULL, NULL, 'Plank',
   'timed_hold', 'Bodyweight', 60, 3);

INSERT INTO exercise_library_entries
  (exercise_id, origin, canonical_name, exercise_type, movement_class,
   metric_profile, metric_contract_version, exercise_metric_generation,
   availability, revision)
VALUES
  ('exercise-plank', 'custom', 'Plank', 'strength', 'compound',
   'timed_hold', 1, 1, 'available', 3);

INSERT INTO exercise_search_terms
  (id, exercise_id, kind, ordinal, display_text, normalized_text)
VALUES
  (1001, 'exercise-plank', 'canonical', 0, 'Plank', 'plank');

INSERT INTO plans
  (id, content_pack_id, origin, source_namespace, upstream_id, name,
   days_per_week, audience, goal, estimate_minutes, attribution,
   is_active, revision)
VALUES
  ('plan-hold', NULL, 'custom', NULL, NULL, 'Hold Practice',
   1, 'Owner', 'Control', 10, 'Owner-authored', 0, 2);

INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
VALUES ('plan-day-hold', 'plan-hold', 0, 'Hold Day', 2);

INSERT INTO plan_day_exercises
  (id, plan_day_id, exercise_id, ordinal,
   between_exercise_rest_seconds, revision)
VALUES
  ('plan-day-exercise-plank', 'plan-day-hold', 'exercise-plank', 0, 60, 5);

INSERT INTO plan_working_set_targets
  (id, plan_day_exercise_id, ordinal, load_grams, min_reps, max_reps,
   target_json, unit_json, revision)
VALUES
  ('working-target-plank', 'plan-day-exercise-plank', 0, 0, 0, 0,
   '{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}',
   '{"version":1,"duration":"seconds"}', 6);

INSERT INTO progression_policies
  (id, plan_day_exercise_id, policy_type, policy_version, rule_json, revision)
VALUES
  ('policy-plank', 'plan-day-exercise-plank', 'manual_hold', 1,
   '{"version":1,"progression":"manual"}', 4);

INSERT INTO workout_sessions
  (id, plan_id, plan_day_id, source, status, local_date, timezone,
   started_at_ms, completed_at_ms, active_session_exercise_id, active_set_id,
   revision)
VALUES
  ('session-plank-completed', 'plan-hold', 'plan-day-hold', 'scheduled_day',
   'completed', '2026-08-17', 'Asia/Singapore', 5000, 9000, NULL, NULL, 3);

INSERT INTO session_exercises
  (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
   exercise_name, metric_profile, default_rest_seconds, target_revision,
   status, revision)
VALUES
  ('session-exercise-plank', 'session-plank-completed',
   'plan-day-exercise-plank', 'exercise-plank', 0, 'Plank', 'timed_hold',
   60, 6, 'completed', 3);

INSERT INTO session_sets
  (id, session_exercise_id, set_kind, ordinal,
   source_plan_working_set_target_id, target_load_grams, target_min_reps,
   target_max_reps, target_json, unit_json, rule_type, rule_version,
   observed_load_grams, observed_reps, observed_json, status,
   draft_updated_at_ms, completed_at_ms, completion_idempotency_key, revision)
VALUES
  ('set-plank-completed', 'session-exercise-plank', 'working', 0,
   'working-target-plank', 0, 0, 0,
   '{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}',
   '{"version":1,"duration":"seconds"}', 'manual_hold', 1,
   NULL, NULL,
   '{"version":1,"profile":"timed_hold","durationSeconds":43,"source":"manual"}',
   'completed', 7000, 8000, 'complete-plank-1', 2);

PRAGMA user_version = 5;
