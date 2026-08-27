ALTER TABLE session_exercises
ADD COLUMN effort TEXT CHECK(
  effort IS NULL OR effort IN ('easy', 'on_target', 'hard', 'failed')
);

ALTER TABLE session_exercises
ADD COLUMN effort_recorded_at_ms INTEGER CHECK(
  effort_recorded_at_ms IS NULL OR effort_recorded_at_ms >= 0
);

UPDATE session_exercises
SET effort = 'on_target',
    effort_recorded_at_ms = 2800
WHERE id = 'session-exercise-squat';

PRAGMA user_version = 2;
