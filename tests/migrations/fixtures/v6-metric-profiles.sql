/* WARNING: Script requires that SQLITE_DBCONFIG_DEFENSIVE be disabled */
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE content_packs (
  id TEXT PRIMARY KEY NOT NULL,
  namespace TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  source_revision INTEGER NOT NULL CHECK(source_revision >= 0),
  installed_at_ms INTEGER NOT NULL CHECK(installed_at_ms >= 0),
  UNIQUE(namespace, version),
  UNIQUE(namespace, source_revision)
) STRICT;
INSERT INTO content_packs VALUES('pack-foundation','foundation',1,3,1000);
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
INSERT INTO plans VALUES('plan-bundled','pack-foundation','bundled','foundation','full-body-foundation','Full Body Foundation',3,'Unspecified','Unspecified',1,'Unspecified',0,4);
INSERT INTO plans VALUES('plan-copy',NULL,'copied','foundation','full-body-foundation','Full Body Foundation',3,'Unspecified','Unspecified',1,'Unspecified',1,7);
INSERT INTO plans VALUES('plan-hold',NULL,'custom',NULL,NULL,'Hold Practice',1,'Owner','Control',10,'Owner-authored',0,2);
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
INSERT INTO plan_days VALUES('plan-day-copy','plan-copy',0,'Full Body A',2);
INSERT INTO plan_days VALUES('plan-day-hold','plan-hold',0,'Hold Day',2);
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
INSERT INTO pending_effects VALUES('effect-rest','reconcile_rest_notification',1,'{"version":1,"sessionId":"session-active","restRevision":5}','rest-session-active-r5','session-active',5,'pending',0,2600,NULL,NULL,NULL,2600,2600);
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_version INTEGER NOT NULL CHECK(value_version >= 1),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
) STRICT;
INSERT INTO app_settings VALUES('appearance',1,'{"preference":"System"}',1,1000);
INSERT INTO app_settings VALUES('selected_copied_plan',1,'{"planId":"plan-copy"}',1,1000);
CREATE TABLE content_pack_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  namespace TEXT NOT NULL CHECK(length(trim(namespace)) BETWEEN 1 AND 120),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  source_commit TEXT NOT NULL CHECK(
    length(source_commit) BETWEEN 1 AND 120
  ),
  pack_sha256 TEXT NOT NULL CHECK(
    length(pack_sha256) = 64
    AND pack_sha256 NOT GLOB '*[^a-f0-9]*'
  ),
  manifest_sha256 TEXT NOT NULL CHECK(
    length(manifest_sha256) = 64
    AND manifest_sha256 NOT GLOB '*[^a-f0-9]*'
  ),
  license_sha256 TEXT NOT NULL CHECK(
    length(license_sha256) = 64
    AND license_sha256 NOT GLOB '*[^a-f0-9]*'
  ),
  review_status TEXT NOT NULL CHECK(review_status = 'accepted'),
  accepted_at_ms INTEGER NOT NULL CHECK(accepted_at_ms >= 0),
  UNIQUE(namespace, revision),
  UNIQUE(namespace, pack_sha256)
) STRICT;
CREATE TABLE exercise_library_entries (
  exercise_id TEXT PRIMARY KEY NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('bundled', 'custom', 'copied')),
  canonical_name TEXT NOT NULL CHECK(
    length(trim(canonical_name)) BETWEEN 1 AND 120
  ),
  exercise_type TEXT NOT NULL CHECK(
    exercise_type IN (
      'strength',
      'olympic_weightlifting',
      'stretching',
      'cardio',
      'plyometrics',
      'strongman',
      'powerlifting',
      'unspecified'
    )
  ),
  movement_class TEXT NOT NULL CHECK(
    movement_class IN ('compound', 'isolation', 'unspecified')
  ),
  metric_profile TEXT NOT NULL CHECK(
    metric_profile IN (
      'load_reps',
      'bodyweight_reps',
      'added_load_reps',
      'assisted_reps',
      'timed_hold',
      'fixed_distance',
      'fixed_time',
      'intervals',
      'unscored'
    )
  ),
  metric_contract_version INTEGER NOT NULL CHECK(
    metric_contract_version >= 1
  ),
  exercise_metric_generation INTEGER NOT NULL CHECK(
    exercise_metric_generation >= 1
  ),
  availability TEXT NOT NULL CHECK(
    availability IN ('available', 'unavailable')
  ),
  revision INTEGER NOT NULL CHECK(revision >= 0)
) STRICT;
INSERT INTO exercise_library_entries VALUES('exercise-squat','bundled','Squat','unspecified','unspecified','load_reps',1,1,'available',2);
INSERT INTO exercise_library_entries VALUES('exercise-plank','custom','Plank','strength','compound','timed_hold',1,1,'available',3);
CREATE TABLE exercise_catalog_sources (
  exercise_id TEXT PRIMARY KEY NOT NULL
    REFERENCES exercise_library_entries(exercise_id) ON DELETE RESTRICT,
  content_revision_id TEXT NOT NULL
    REFERENCES content_pack_revisions(id) ON DELETE RESTRICT,
  source_namespace TEXT NOT NULL CHECK(
    length(trim(source_namespace)) BETWEEN 1 AND 120
  ),
  source_revision TEXT NOT NULL CHECK(
    length(trim(source_revision)) BETWEEN 1 AND 120
  ),
  upstream_id TEXT,
  canonical_name TEXT NOT NULL CHECK(
    length(trim(canonical_name)) BETWEEN 1 AND 120
  ),
  exercise_type TEXT NOT NULL CHECK(
    exercise_type IN (
      'strength',
      'olympic_weightlifting',
      'stretching',
      'cardio',
      'plyometrics',
      'strongman',
      'powerlifting'
    )
  ),
  movement_class TEXT NOT NULL CHECK(
    movement_class IN ('compound', 'isolation')
  ),
  metric_profile TEXT NOT NULL CHECK(
    metric_profile IN (
      'load_reps',
      'bodyweight_reps',
      'added_load_reps',
      'assisted_reps',
      'timed_hold',
      'fixed_distance',
      'fixed_time',
      'intervals',
      'unscored'
    )
  ),
  metric_contract_version INTEGER NOT NULL CHECK(
    metric_contract_version >= 1
  ),
  exercise_metric_generation INTEGER NOT NULL CHECK(
    exercise_metric_generation >= 1
  ),
  availability TEXT NOT NULL CHECK(
    availability IN ('available', 'unavailable')
  ),
  license TEXT NOT NULL CHECK(length(trim(license)) BETWEEN 1 AND 120),
  attribution TEXT NOT NULL CHECK(
    length(trim(attribution)) BETWEEN 1 AND 240
  ),
  legacy_link_status TEXT NOT NULL CHECK(
    legacy_link_status IN (
      'not_applicable',
      'link_candidate',
      'preserve_original'
    )
  ),
  linked_upstream_id TEXT,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  CHECK(
    (
      source_namespace = 'gym-tracker.original'
      AND upstream_id IS NULL
      AND legacy_link_status IN ('link_candidate', 'preserve_original')
      AND (
        (legacy_link_status = 'link_candidate'
         AND linked_upstream_id IS NOT NULL)
        OR
        (legacy_link_status = 'preserve_original'
         AND linked_upstream_id IS NULL)
      )
    )
    OR
    (
      source_namespace <> 'gym-tracker.original'
      AND upstream_id IS NOT NULL
      AND legacy_link_status = 'not_applicable'
      AND linked_upstream_id IS NULL
    )
  ),
  UNIQUE(source_namespace, upstream_id)
) STRICT;
CREATE TABLE exercise_aliases (
  id INTEGER PRIMARY KEY NOT NULL,
  exercise_id TEXT NOT NULL
    REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  display_text TEXT NOT NULL CHECK(
    length(trim(display_text)) BETWEEN 1 AND 120
  ),
  normalized_text TEXT NOT NULL CHECK(
    length(trim(normalized_text)) BETWEEN 1 AND 120
  ),
  UNIQUE(exercise_id, ordinal),
  UNIQUE(exercise_id, normalized_text)
) STRICT;
CREATE TABLE taxonomy_terms (
  kind TEXT NOT NULL CHECK(
    kind IN ('exercise_type', 'movement_class', 'muscle', 'equipment')
  ),
  slug TEXT NOT NULL CHECK(
    length(slug) BETWEEN 1 AND 80
    AND slug = lower(slug)
    AND slug NOT GLOB '*[^a-z0-9_-]*'
  ),
  display_name TEXT NOT NULL CHECK(
    length(trim(display_name)) BETWEEN 1 AND 120
  ),
  PRIMARY KEY(kind, slug)
) STRICT, WITHOUT ROWID;
CREATE TABLE exercise_taxonomy (
  exercise_id TEXT NOT NULL
    REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  relation TEXT NOT NULL CHECK(
    relation IN ('type', 'movement', 'primary', 'secondary', 'equipment')
  ),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  PRIMARY KEY(exercise_id, kind, relation, ordinal),
  UNIQUE(exercise_id, kind, slug),
  FOREIGN KEY(kind, slug) REFERENCES taxonomy_terms(kind, slug)
    ON DELETE RESTRICT,
  CHECK(
    (kind = 'exercise_type' AND relation = 'type')
    OR (kind = 'movement_class' AND relation = 'movement')
    OR (kind = 'muscle' AND relation IN ('primary', 'secondary'))
    OR (kind = 'equipment' AND relation = 'equipment')
  )
) STRICT, WITHOUT ROWID;
CREATE TABLE exercise_owner_preferences (
  exercise_id TEXT PRIMARY KEY NOT NULL
    REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0, 1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
) STRICT;
CREATE TABLE exercise_search_terms (
  id INTEGER PRIMARY KEY NOT NULL,
  exercise_id TEXT NOT NULL
    REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('canonical', 'alias')),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  display_text TEXT NOT NULL CHECK(
    length(trim(display_text)) BETWEEN 1 AND 120
  ),
  normalized_text TEXT NOT NULL CHECK(
    length(trim(normalized_text)) BETWEEN 1 AND 120
  ),
  UNIQUE(exercise_id, kind, ordinal),
  UNIQUE(exercise_id, normalized_text)
) STRICT;
INSERT INTO exercise_search_terms VALUES(1001,'exercise-plank','canonical',0,'Plank','plank');
CREATE VIRTUAL TABLE exercise_search_terms_fts USING fts5(
  normalized_text,
  content = 'exercise_search_terms',
  content_rowid = 'id',
  tokenize = 'trigram'
);
INSERT INTO exercise_search_terms_fts(exercise_search_terms_fts)
VALUES ('rebuild');
CREATE TABLE exercises (
    id TEXT PRIMARY KEY NOT NULL,
    content_pack_id TEXT REFERENCES content_packs(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    origin TEXT NOT NULL CHECK(origin IN ('bundled', 'custom', 'copied')),
    source_namespace TEXT,
    upstream_id TEXT,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    equipment TEXT NOT NULL DEFAULT 'Unspecified'
      CHECK(length(trim(equipment)) > 0),
    default_rest_seconds INTEGER NOT NULL CHECK(default_rest_seconds >= 0),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK((
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)),
    CHECK(
      (origin = 'custom' AND source_namespace IS NULL AND upstream_id IS NULL)
      OR
      (origin IN ('bundled', 'copied')
       AND source_namespace IS NOT NULL
       AND upstream_id IS NOT NULL)
    ),
    UNIQUE(id, metric_profile, metric_contract_version,
           exercise_metric_generation)
  ) STRICT;
INSERT INTO exercises VALUES('exercise-squat','pack-foundation','bundled','foundation','squat','Squat','load_reps',1,1,'Unspecified',120,2);
INSERT INTO exercises VALUES('exercise-plank',NULL,'custom',NULL,NULL,'Plank','timed_hold',1,1,'Bodyweight',60,3);
CREATE TABLE plan_day_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_id TEXT NOT NULL REFERENCES plan_days(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    exercise_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    between_exercise_rest_seconds INTEGER CHECK(
      between_exercise_rest_seconds IS NULL
      OR between_exercise_rest_seconds >= 0
    ),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK((
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)),
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
  ) STRICT;
INSERT INTO plan_day_exercises VALUES('plan-day-exercise-squat','plan-day-copy','exercise-squat',0,120,'load_reps',1,1,3);
INSERT INTO plan_day_exercises VALUES('plan-day-exercise-plank','plan-day-hold','exercise-plank',0,60,'timed_hold',1,1,5);
CREATE TABLE plan_warmup_sets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL
      REFERENCES plan_day_exercises(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
    reps INTEGER NOT NULL CHECK(reps >= 0),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    UNIQUE(plan_day_exercise_id, ordinal)
  ) STRICT;
INSERT INTO plan_warmup_sets VALUES('warmup-target-1','plan-day-exercise-squat',0,20000,5,1);
CREATE TABLE plan_working_set_targets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
    min_reps INTEGER NOT NULL CHECK(min_reps >= 0),
    max_reps INTEGER NOT NULL CHECK(max_reps >= min_reps),
    target_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(target_json)),
    unit_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(unit_json)),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK((
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)),
    CHECK((
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
)),
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
  ) STRICT;
INSERT INTO plan_working_set_targets VALUES('working-target-1','plan-day-exercise-squat',0,40000,6,8,'{}','{}','load_reps',1,1,7);
INSERT INTO plan_working_set_targets VALUES('working-target-plank','plan-day-exercise-plank',0,0,0,0,'{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}','{"version":1,"duration":"seconds"}','timed_hold',1,1,6);
CREATE TABLE progression_policies (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL,
    policy_type TEXT NOT NULL CHECK(policy_type IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored', 'manual_hold')),
    policy_version INTEGER NOT NULL CHECK(policy_version >= 1),
    rule_json TEXT NOT NULL CHECK(json_valid(rule_json)),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active', 'invalidated')),
    invalidated_at_ms INTEGER CHECK(
      invalidated_at_ms IS NULL OR invalidated_at_ms >= 0
    ),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    CHECK((
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)),
    CHECK(
      (status = 'active' AND invalidated_at_ms IS NULL)
      OR
      (status = 'invalidated' AND invalidated_at_ms IS NOT NULL)
    ),
    FOREIGN KEY(plan_day_exercise_id)
      REFERENCES plan_day_exercises(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED
  ) STRICT;
INSERT INTO progression_policies VALUES('policy-1','plan-day-exercise-squat','load_reps',1,'{"version":1,"incrementGrams":2500}','load_reps',1,1,'active',NULL,1);
INSERT INTO progression_policies VALUES('policy-plank','plan-day-exercise-plank','manual_hold',1,'{"version":1,"progression":"manual"}','timed_hold',1,1,'active',NULL,4);
CREATE TABLE workout_sessions (
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
  ) STRICT;
INSERT INTO workout_sessions VALUES('session-active','plan-copy','plan-day-copy','scheduled_day','in_progress','2026-08-16','Asia/Singapore',2000,NULL,'session-exercise-squat','set-draft',9);
INSERT INTO workout_sessions VALUES('session-plank-completed','plan-hold','plan-day-hold','scheduled_day','completed','2026-08-17','Asia/Singapore',5000,9000,NULL,NULL,3);
CREATE TABLE session_exercises (
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
    metric_profile TEXT NOT NULL CHECK(metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
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
    CHECK((
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)),
    UNIQUE(session_id, ordinal),
    UNIQUE(id, metric_profile, metric_contract_version,
           exercise_metric_generation)
  ) STRICT;
INSERT INTO session_exercises VALUES('session-exercise-squat','session-active','plan-day-exercise-squat','exercise-squat',0,'Squat','load_reps',1,1,120,7,'active',4,'on_target',2800);
INSERT INTO session_exercises VALUES('session-exercise-plank','session-plank-completed','plan-day-exercise-plank','exercise-plank',0,'Plank','timed_hold',1,1,60,6,'completed',3,NULL,NULL);
CREATE TABLE session_sets (
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
      CHECK(rule_type IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored', 'manual_hold')),
    rule_version INTEGER NOT NULL DEFAULT 1 CHECK(rule_version >= 1),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
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
    CHECK((
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)),
    CHECK((
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
)),
    CHECK((
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
)),
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
  ) STRICT;
INSERT INTO session_sets VALUES('set-completed','session-exercise-squat','working',0,NULL,40000,6,8,'{}','{}','load_reps',1,'load_reps',1,1,40000,8,NULL,'completed',2500,2600,'complete-set-1',2);
INSERT INTO session_sets VALUES('set-draft','session-exercise-squat','working',1,NULL,40000,6,8,'{}','{}','load_reps',1,'load_reps',1,1,40000,7,NULL,'draft',2700,NULL,NULL,3);
INSERT INTO session_sets VALUES('set-plank-completed','session-exercise-plank','working',0,'working-target-plank',0,0,0,'{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}','{"version":1,"duration":"seconds"}','manual_hold',1,'timed_hold',1,1,NULL,NULL,'{"version":1,"profile":"timed_hold","durationSeconds":43,"source":"manual"}','completed',7000,8000,'complete-plank-1',2);
CREATE TABLE session_rest_states (
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
  ) STRICT;
INSERT INTO session_rest_states VALUES('session-active',1,'running',2600,122600,NULL,NULL,'set-draft',5);
CREATE TABLE session_undo_snapshots (
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
  ) STRICT;
INSERT INTO session_undo_snapshots VALUES('undo-1','session-active','set-completed','undo-complete-set-1',1,'{"version":1,"activeSetId":"set-completed","restStatus":"idle"}',10600,NULL,2600);
CREATE TABLE progression_recommendations (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    plan_working_set_target_id TEXT NOT NULL
      REFERENCES plan_working_set_targets(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    rule_type TEXT NOT NULL CHECK(rule_type IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
    rule_version INTEGER NOT NULL CHECK(rule_version >= 1),
    evidence_version INTEGER NOT NULL CHECK(evidence_version >= 1),
    evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
    current_target_json TEXT NOT NULL CHECK(json_valid(current_target_json)),
    proposed_target_json TEXT NOT NULL CHECK(json_valid(proposed_target_json)),
    metric_profile TEXT NOT NULL CHECK(metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
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
    CHECK((
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
))
  ) STRICT;
INSERT INTO progression_recommendations VALUES('recommendation-1','exercise-squat','working-target-1','load_reps',1,1,'{"sets":["8","8","8"]}','{"loadGrams":40000,"reps":8}','{"loadGrams":42500,"reps":6}','load_reps',1,1,'pending',2,7,3000,NULL);
CREATE TABLE metric_profile_migration_events (
    idempotency_key TEXT PRIMARY KEY NOT NULL
      CHECK(length(trim(idempotency_key)) BETWEEN 1 AND 128),
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    from_metric_profile TEXT NOT NULL
      CHECK(from_metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
    from_metric_contract_version INTEGER NOT NULL
      CHECK(from_metric_contract_version >= 1),
    from_exercise_metric_generation INTEGER NOT NULL
      CHECK(from_exercise_metric_generation >= 1),
    to_metric_profile TEXT NOT NULL
      CHECK(to_metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
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
  ) STRICT;
CREATE TABLE exercise_metric_baselines (
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    metric_profile TEXT NOT NULL CHECK(metric_profile IN ('load_reps', 'bodyweight_reps', 'added_load_reps', 'assisted_reps', 'timed_hold', 'fixed_distance', 'fixed_time', 'intervals', 'unscored')),
    metric_contract_version INTEGER NOT NULL CHECK(metric_contract_version >= 1),
    exercise_metric_generation INTEGER NOT NULL
      CHECK(exercise_metric_generation >= 1),
    status TEXT NOT NULL CHECK(status = 'awaiting_comparable_observation'),
    established_at_ms INTEGER NOT NULL CHECK(established_at_ms >= 0),
    CHECK((
  (metric_profile = 'timed_hold' AND metric_contract_version IN (1, 2))
  OR
  (metric_profile <> 'timed_hold' AND metric_contract_version = 1)
)),
    PRIMARY KEY(exercise_id, exercise_metric_generation)
  ) STRICT, WITHOUT ROWID;
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
CREATE UNIQUE INDEX bundled_plan_source_identity
  ON plans(source_namespace, upstream_id)
  WHERE origin = 'bundled';
CREATE INDEX eligible_pending_effects
  ON pending_effects(status, next_attempt_at_ms, created_at_ms);
CREATE INDEX exercise_library_by_origin_visibility
ON exercise_library_entries(
  origin,
  availability,
  canonical_name,
  exercise_id
);
CREATE INDEX exercise_catalog_by_revision
ON exercise_catalog_sources(
  content_revision_id,
  availability,
  exercise_id
);
CREATE INDEX exercise_taxonomy_filter
ON exercise_taxonomy(kind, slug, exercise_id);
CREATE INDEX exercise_search_terms_by_exercise
ON exercise_search_terms(exercise_id, kind, ordinal);
CREATE UNIQUE INDEX bundled_exercise_source_identity
   ON exercises(source_namespace, upstream_id)
   WHERE origin = 'bundled';
CREATE UNIQUE INDEX one_active_workout_session
   ON workout_sessions(status)
   WHERE status = 'in_progress';
CREATE UNIQUE INDEX one_unconsumed_undo_snapshot
   ON session_undo_snapshots(completed_set_id)
   WHERE consumed_at_ms IS NULL;
CREATE UNIQUE INDEX one_pending_recommendation
   ON progression_recommendations(plan_working_set_target_id)
   WHERE status = 'pending';
CREATE UNIQUE INDEX one_active_progression_policy_type
   ON progression_policies(plan_day_exercise_id, policy_type)
   WHERE status = 'active';
CREATE INDEX ordered_plan_day_exercises
   ON plan_day_exercises(plan_day_id, ordinal);
CREATE INDEX ordered_session_exercises
   ON session_exercises(session_id, ordinal);
CREATE INDEX ordered_session_sets
   ON session_sets(session_exercise_id, set_kind, ordinal);
CREATE INDEX pending_recommendations_by_exercise
   ON progression_recommendations(exercise_id, status, created_at_ms);
CREATE INDEX exercise_history
   ON session_exercises(
     exercise_id,
     metric_profile,
     metric_contract_version,
     exercise_metric_generation,
     session_id
   );
COMMIT;
PRAGMA user_version = 6;
