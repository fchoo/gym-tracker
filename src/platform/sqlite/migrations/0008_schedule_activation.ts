import type {
  Migration,
} from "../migrationRunner";
import type {
  SqliteTransactionExecutor,
} from "../sqliteKernel";

const SHA256_CHECK = `(
  length(asset_sha256) = 64
  AND asset_sha256 NOT GLOB '*[^a-f0-9]*'
)`;

export const SCHEDULE_ACTIVATION_SCHEMA_STATEMENTS = [
  `CREATE TABLE starter_plan_sources (
    source_namespace TEXT NOT NULL CHECK(
      length(trim(source_namespace)) BETWEEN 1 AND 120
    ),
    template_id TEXT NOT NULL CHECK(
      length(trim(template_id)) BETWEEN 1 AND 128
    ),
    source_revision INTEGER NOT NULL CHECK(source_revision >= 1),
    asset_sha256 TEXT NOT NULL CHECK(${SHA256_CHECK}),
    display_name TEXT NOT NULL CHECK(
      length(trim(display_name)) BETWEEN 1 AND 120
    ),
    template_json TEXT NOT NULL CHECK(json_valid(template_json)),
    accepted_at_ms INTEGER NOT NULL CHECK(accepted_at_ms >= 0),
    PRIMARY KEY(source_namespace, template_id, source_revision),
    UNIQUE(source_namespace, template_id, asset_sha256)
  ) STRICT, WITHOUT ROWID`,
  `CREATE TABLE owned_plan_starter_sources (
    plan_id TEXT PRIMARY KEY NOT NULL
      REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    source_namespace TEXT NOT NULL,
    template_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL CHECK(source_revision >= 1),
    asset_sha256 TEXT NOT NULL CHECK(${SHA256_CHECK}),
    cloned_day_count INTEGER NOT NULL CHECK(cloned_day_count >= 1),
    cloned_occurrence_count INTEGER NOT NULL
      CHECK(cloned_occurrence_count >= 1),
    cloned_at_ms INTEGER NOT NULL CHECK(cloned_at_ms >= 0),
    FOREIGN KEY(source_namespace, template_id, source_revision)
      REFERENCES starter_plan_sources(
        source_namespace,
        template_id,
        source_revision
      ) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
  ) STRICT`,
  `CREATE TABLE owned_plan_day_sources (
    plan_day_id TEXT PRIMARY KEY NOT NULL
      REFERENCES plan_days(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    plan_id TEXT NOT NULL
      REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    source_day_id TEXT NOT NULL CHECK(
      length(trim(source_day_id)) BETWEEN 1 AND 128
    ),
    source_ordinal INTEGER NOT NULL CHECK(source_ordinal >= 1),
    UNIQUE(plan_id, source_day_id),
    UNIQUE(plan_id, source_ordinal)
  ) STRICT`,
  `CREATE TABLE owned_plan_day_exercises (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_id TEXT NOT NULL
      REFERENCES plan_days(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    exercise_id TEXT NOT NULL
      REFERENCES exercise_library_entries(exercise_id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    between_exercise_rest_seconds INTEGER NOT NULL CHECK(
      between_exercise_rest_seconds >= 0
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
    revision INTEGER NOT NULL CHECK(revision >= 1),
    UNIQUE(plan_day_id, ordinal)
  ) STRICT`,
  `CREATE TABLE owned_plan_warmup_sets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL
      REFERENCES owned_plan_day_exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    load_grams INTEGER NOT NULL CHECK(load_grams >= 0),
    reps INTEGER NOT NULL CHECK(reps >= 1),
    revision INTEGER NOT NULL CHECK(revision >= 1),
    UNIQUE(plan_day_exercise_id, ordinal)
  ) STRICT`,
  `CREATE TABLE owned_plan_working_set_targets (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL
      REFERENCES owned_plan_day_exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    target_json TEXT NOT NULL CHECK(json_valid(target_json)),
    unit_json TEXT NOT NULL CHECK(json_valid(unit_json)),
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
    revision INTEGER NOT NULL CHECK(revision >= 1),
    UNIQUE(plan_day_exercise_id, ordinal)
  ) STRICT`,
  `CREATE TABLE owned_plan_progression_policies (
    id TEXT PRIMARY KEY NOT NULL,
    plan_day_exercise_id TEXT NOT NULL UNIQUE
      REFERENCES owned_plan_day_exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    policy_kind TEXT NOT NULL CHECK(
      policy_kind IN ('automatic', 'manual_hold', 'plan_authored')
    ),
    policy_id TEXT NOT NULL CHECK(
      length(trim(policy_id)) BETWEEN 1 AND 128
    ),
    policy_version INTEGER NOT NULL CHECK(policy_version >= 1),
    rule_json TEXT NOT NULL CHECK(json_valid(rule_json)),
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
    status TEXT NOT NULL CHECK(status = 'active'),
    revision INTEGER NOT NULL CHECK(revision >= 1)
  ) STRICT`,
  `CREATE TABLE owned_plan_occurrence_sources (
    plan_day_exercise_id TEXT PRIMARY KEY NOT NULL
      REFERENCES owned_plan_day_exercises(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    plan_day_id TEXT NOT NULL
      REFERENCES plan_days(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    source_occurrence_id TEXT NOT NULL CHECK(
      length(trim(source_occurrence_id)) BETWEEN 1 AND 128
    ),
    source_exercise_id TEXT NOT NULL CHECK(
      length(trim(source_exercise_id)) BETWEEN 1 AND 128
    ),
    source_ordinal INTEGER NOT NULL CHECK(source_ordinal >= 1),
    catalog_metric_profile TEXT NOT NULL CHECK(
      catalog_metric_profile IN (
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
    catalog_metric_contract_version INTEGER NOT NULL CHECK(
      catalog_metric_contract_version >= 1
    ),
    catalog_exercise_metric_generation INTEGER NOT NULL CHECK(
      catalog_exercise_metric_generation >= 1
    ),
    metric_override_json TEXT CHECK(
      metric_override_json IS NULL OR json_valid(metric_override_json)
    ),
    content_rationale TEXT NOT NULL CHECK(
      length(trim(content_rationale)) BETWEEN 1 AND 600
    ),
    UNIQUE(plan_day_id, source_occurrence_id),
    UNIQUE(plan_day_id, source_ordinal)
  ) STRICT`,
  `CREATE TABLE starter_plan_activation_requests (
    request_id TEXT PRIMARY KEY NOT NULL CHECK(
      length(trim(request_id)) BETWEEN 1 AND 128
    ),
    request_sha256 TEXT NOT NULL CHECK(
      length(request_sha256) = 64
      AND request_sha256 NOT GLOB '*[^a-f0-9]*'
    ),
    source_namespace TEXT NOT NULL,
    template_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL CHECK(source_revision >= 1),
    expected_active_schedule_revision INTEGER CHECK(
      expected_active_schedule_revision IS NULL
      OR expected_active_schedule_revision >= 1
    ),
    choice TEXT NOT NULL CHECK(
      choice IN ('initial', 'reactivate_existing', 'create_another')
    ),
    selected_plan_id TEXT
      REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    result_plan_id TEXT NOT NULL
      REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    result_schedule_id TEXT NOT NULL
      REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    committed_at_ms INTEGER NOT NULL CHECK(committed_at_ms >= 0),
    FOREIGN KEY(source_namespace, template_id, source_revision)
      REFERENCES starter_plan_sources(
        source_namespace,
        template_id,
        source_revision
      ) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
    CHECK(
      (choice = 'reactivate_existing' AND selected_plan_id IS NOT NULL)
      OR
      (choice IN ('initial', 'create_another') AND selected_plan_id IS NULL)
    )
  ) STRICT`,
  `CREATE TABLE owned_plan_schedules (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL UNIQUE
      REFERENCES plans(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active', 'inactive')),
    revision INTEGER NOT NULL CHECK(revision >= 1),
    activated_at_ms INTEGER NOT NULL CHECK(activated_at_ms >= 0),
    deactivated_at_ms INTEGER CHECK(
      deactivated_at_ms IS NULL OR deactivated_at_ms >= activated_at_ms
    ),
    CHECK(
      (lifecycle = 'active' AND deactivated_at_ms IS NULL)
      OR
      (lifecycle = 'inactive' AND deactivated_at_ms IS NOT NULL)
    )
  ) STRICT`,
  `CREATE TABLE owned_plan_schedule_versions (
    id TEXT PRIMARY KEY NOT NULL,
    schedule_id TEXT NOT NULL
      REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    version_number INTEGER NOT NULL CHECK(version_number >= 1),
    effective_local_date TEXT NOT NULL CHECK(
      length(effective_local_date) = 10
      AND effective_local_date GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    mode TEXT NOT NULL CHECK(mode IN ('weekday', 'rotation')),
    timezone TEXT NOT NULL CHECK(
      length(trim(timezone)) BETWEEN 1 AND 120
    ),
    rotation_pointer INTEGER CHECK(
      rotation_pointer IS NULL OR rotation_pointer >= 0
    ),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    CHECK(
      (mode = 'weekday' AND rotation_pointer IS NULL)
      OR
      (mode = 'rotation' AND rotation_pointer IS NOT NULL)
    ),
    UNIQUE(schedule_id, version_number),
    UNIQUE(schedule_id, effective_local_date)
  ) STRICT`,
  `CREATE TABLE owned_plan_schedule_bindings (
    id TEXT PRIMARY KEY NOT NULL,
    schedule_version_id TEXT NOT NULL
      REFERENCES owned_plan_schedule_versions(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    mode TEXT NOT NULL CHECK(mode IN ('weekday', 'rotation')),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    week_index INTEGER CHECK(week_index IS NULL OR week_index >= 0),
    weekday TEXT CHECK(
      weekday IS NULL
      OR weekday IN (
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
      )
    ),
    plan_day_id TEXT NOT NULL
      REFERENCES plan_days(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    CHECK(
      (mode = 'weekday' AND week_index IS NOT NULL AND weekday IS NOT NULL)
      OR
      (mode = 'rotation' AND week_index IS NULL AND weekday IS NULL)
    ),
    UNIQUE(schedule_version_id, ordinal),
    UNIQUE(schedule_version_id, week_index, weekday)
  ) STRICT`,
  `CREATE TABLE owned_plan_schedule_overrides (
    id TEXT PRIMARY KEY NOT NULL,
    schedule_id TEXT NOT NULL
      REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    local_date TEXT NOT NULL CHECK(length(local_date) = 10),
    selection_kind TEXT NOT NULL CHECK(
      selection_kind IN ('plan_day', 'rest_day', 'skip')
    ),
    plan_day_id TEXT
      REFERENCES plan_days(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    state TEXT NOT NULL CHECK(state IN ('pending', 'consumed')),
    revision INTEGER NOT NULL CHECK(revision >= 1),
    consumed_opportunity_id TEXT,
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    consumed_at_ms INTEGER CHECK(
      consumed_at_ms IS NULL OR consumed_at_ms >= created_at_ms
    ),
    CHECK(
      (selection_kind = 'plan_day' AND plan_day_id IS NOT NULL)
      OR
      (selection_kind IN ('rest_day', 'skip') AND plan_day_id IS NULL)
    ),
    CHECK(
      (state = 'pending'
       AND consumed_opportunity_id IS NULL
       AND consumed_at_ms IS NULL)
      OR
      (state = 'consumed'
       AND consumed_opportunity_id IS NOT NULL
       AND consumed_at_ms IS NOT NULL)
    ),
    UNIQUE(schedule_id, local_date)
  ) STRICT`,
  `CREATE TABLE owned_plan_schedule_opportunities (
    id TEXT PRIMARY KEY NOT NULL,
    schedule_id TEXT NOT NULL
      REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    schedule_version_id TEXT NOT NULL
      REFERENCES owned_plan_schedule_versions(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    local_date TEXT NOT NULL CHECK(length(local_date) = 10),
    source TEXT NOT NULL CHECK(source IN ('weekday', 'rotation', 'override')),
    plan_day_id TEXT
      REFERENCES plan_days(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    state TEXT NOT NULL CHECK(state IN ('pending', 'consumed')),
    outcome TEXT CHECK(
      outcome IS NULL
      OR outcome IN (
        'completed',
        'skipped',
        'planned_not_completed',
        'advanced',
        'rest_day'
      )
    ),
    session_id TEXT
      REFERENCES workout_sessions(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    consumed_at_ms INTEGER CHECK(consumed_at_ms IS NULL OR consumed_at_ms >= 0),
    CHECK(
      (state = 'pending'
       AND outcome IS NULL
       AND session_id IS NULL
       AND consumed_at_ms IS NULL)
      OR
      (state = 'consumed'
       AND outcome IS NOT NULL
       AND consumed_at_ms IS NOT NULL)
    ),
    CHECK(
      (outcome = 'completed' AND session_id IS NOT NULL)
      OR
      (outcome IS NULL)
      OR
      (outcome <> 'completed' AND session_id IS NULL)
    ),
    UNIQUE(schedule_id, local_date, source)
  ) STRICT`,
  `CREATE TABLE owned_plan_schedule_events (
    id TEXT PRIMARY KEY NOT NULL,
    schedule_id TEXT NOT NULL
      REFERENCES owned_plan_schedules(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED,
    event_type TEXT NOT NULL CHECK(
      length(trim(event_type)) BETWEEN 1 AND 80
      AND event_type NOT GLOB '*[^a-z0-9_]*'
    ),
    local_date TEXT CHECK(local_date IS NULL OR length(local_date) = 10),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    schedule_revision INTEGER NOT NULL CHECK(schedule_revision >= 1),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0)
  ) STRICT`,
  `INSERT INTO owned_plan_schedules
    (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
   SELECT schedule.id,
          schedule.plan_id,
          CASE WHEN plan.is_active = 1 THEN 'active' ELSE 'inactive' END,
          MAX(schedule.revision, 1),
          0,
          CASE WHEN plan.is_active = 1 THEN NULL ELSE 0 END
   FROM plan_schedules schedule
   JOIN plans plan ON plan.id = schedule.plan_id`,
  `INSERT INTO owned_plan_schedule_versions
    (id, schedule_id, version_number, effective_local_date, mode, timezone,
     rotation_pointer, created_at_ms)
   SELECT schedule.id || ':version:1',
          schedule.id,
          1,
          schedule.start_local_date,
          schedule.mode,
          schedule.timezone,
          NULL,
          0
   FROM plan_schedules schedule`,
  `INSERT INTO owned_plan_schedule_bindings
    (id, schedule_version_id, mode, ordinal, week_index, weekday, plan_day_id)
   SELECT binding.id || ':owned',
          binding.schedule_id || ':version:1',
          'weekday',
          ROW_NUMBER() OVER (
            PARTITION BY binding.schedule_id
            ORDER BY binding.week_index, binding.weekday, binding.id
          ) - 1,
          binding.week_index,
          CASE binding.weekday
            WHEN 1 THEN 'Monday'
            WHEN 2 THEN 'Tuesday'
            WHEN 3 THEN 'Wednesday'
            WHEN 4 THEN 'Thursday'
            WHEN 5 THEN 'Friday'
            WHEN 6 THEN 'Saturday'
            WHEN 7 THEN 'Sunday'
          END,
          binding.plan_day_id
   FROM plan_schedule_bindings binding`,
  `CREATE UNIQUE INDEX one_active_owned_schedule
   ON owned_plan_schedules(lifecycle)
   WHERE lifecycle = 'active'`,
  `CREATE UNIQUE INDEX one_active_owned_plan
   ON plans(is_active)
   WHERE is_active = 1`,
  `CREATE INDEX owned_schedule_version_effective_date
   ON owned_plan_schedule_versions(schedule_id, effective_local_date)`,
  `CREATE INDEX owned_schedule_opportunity_local_date
   ON owned_plan_schedule_opportunities(schedule_id, local_date, state)`,
  `CREATE INDEX owned_schedule_event_order
   ON owned_plan_schedule_events(schedule_id, schedule_revision, created_at_ms)`,
  `CREATE TRIGGER starter_plan_sources_immutable_update
   BEFORE UPDATE ON starter_plan_sources
   BEGIN
     SELECT RAISE(ABORT, 'starter_plan_source_immutable');
   END`,
  `CREATE TRIGGER starter_plan_sources_immutable_delete
   BEFORE DELETE ON starter_plan_sources
   BEGIN
     SELECT RAISE(ABORT, 'starter_plan_source_immutable');
   END`,
  `CREATE TRIGGER owned_starter_sources_immutable_update
   BEFORE UPDATE ON owned_plan_starter_sources
   BEGIN
     SELECT RAISE(ABORT, 'owned_starter_source_immutable');
   END`,
  `CREATE TRIGGER owned_starter_sources_immutable_delete
   BEFORE DELETE ON owned_plan_starter_sources
   BEGIN
     SELECT RAISE(ABORT, 'owned_starter_source_immutable');
   END`,
  `CREATE TRIGGER owned_day_sources_immutable_update
   BEFORE UPDATE ON owned_plan_day_sources
   BEGIN
     SELECT RAISE(ABORT, 'owned_day_source_immutable');
   END`,
  `CREATE TRIGGER owned_day_sources_immutable_delete
   BEFORE DELETE ON owned_plan_day_sources
   BEGIN
     SELECT RAISE(ABORT, 'owned_day_source_immutable');
   END`,
  `CREATE TRIGGER owned_occurrence_sources_immutable_update
   BEFORE UPDATE ON owned_plan_occurrence_sources
   BEGIN
     SELECT RAISE(ABORT, 'owned_occurrence_source_immutable');
   END`,
  `CREATE TRIGGER owned_occurrence_sources_immutable_delete
   BEFORE DELETE ON owned_plan_occurrence_sources
   BEGIN
     SELECT RAISE(ABORT, 'owned_occurrence_source_immutable');
   END`,
  `CREATE TRIGGER activation_requests_immutable_update
   BEFORE UPDATE ON starter_plan_activation_requests
   BEGIN
     SELECT RAISE(ABORT, 'activation_request_immutable');
   END`,
  `CREATE TRIGGER activation_requests_immutable_delete
   BEFORE DELETE ON starter_plan_activation_requests
   BEGIN
     SELECT RAISE(ABORT, 'activation_request_immutable');
   END`,
  `CREATE TRIGGER schedule_versions_immutable_update
   BEFORE UPDATE ON owned_plan_schedule_versions
   BEGIN
     SELECT RAISE(ABORT, 'schedule_version_immutable');
   END`,
  `CREATE TRIGGER schedule_versions_immutable_delete
   BEFORE DELETE ON owned_plan_schedule_versions
   BEGIN
     SELECT RAISE(ABORT, 'schedule_version_immutable');
   END`,
  `CREATE TRIGGER schedule_bindings_immutable_update
   BEFORE UPDATE ON owned_plan_schedule_bindings
   BEGIN
     SELECT RAISE(ABORT, 'schedule_binding_immutable');
   END`,
  `CREATE TRIGGER schedule_bindings_immutable_delete
   BEFORE DELETE ON owned_plan_schedule_bindings
   BEGIN
     SELECT RAISE(ABORT, 'schedule_binding_immutable');
   END`,
  `CREATE TRIGGER consumed_overrides_immutable_update
   BEFORE UPDATE ON owned_plan_schedule_overrides
   WHEN OLD.state = 'consumed'
   BEGIN
     SELECT RAISE(ABORT, 'consumed_override_immutable');
   END`,
  `CREATE TRIGGER consumed_overrides_immutable_delete
   BEFORE DELETE ON owned_plan_schedule_overrides
   WHEN OLD.state = 'consumed'
   BEGIN
     SELECT RAISE(ABORT, 'consumed_override_immutable');
   END`,
  `CREATE TRIGGER consumed_opportunities_immutable_update
   BEFORE UPDATE ON owned_plan_schedule_opportunities
   WHEN OLD.state = 'consumed'
   BEGIN
     SELECT RAISE(ABORT, 'consumed_opportunity_immutable');
   END`,
  `CREATE TRIGGER consumed_opportunities_immutable_delete
   BEFORE DELETE ON owned_plan_schedule_opportunities
   WHEN OLD.state = 'consumed'
   BEGIN
     SELECT RAISE(ABORT, 'consumed_opportunity_immutable');
   END`,
  `CREATE TRIGGER schedule_events_immutable_update
   BEFORE UPDATE ON owned_plan_schedule_events
   BEGIN
     SELECT RAISE(ABORT, 'schedule_event_immutable');
   END`,
  `CREATE TRIGGER schedule_events_immutable_delete
   BEFORE DELETE ON owned_plan_schedule_events
   BEGIN
     SELECT RAISE(ABORT, 'schedule_event_immutable');
   END`,
] as const;

const REQUIRED_TABLES = [
  "owned_plan_day_sources",
  "owned_plan_day_exercises",
  "owned_plan_occurrence_sources",
  "owned_plan_progression_policies",
  "owned_plan_schedule_bindings",
  "owned_plan_schedule_events",
  "owned_plan_schedule_opportunities",
  "owned_plan_schedule_overrides",
  "owned_plan_schedule_versions",
  "owned_plan_schedules",
  "owned_plan_starter_sources",
  "owned_plan_warmup_sets",
  "owned_plan_working_set_targets",
  "starter_plan_activation_requests",
  "starter_plan_sources",
] as const;

async function executeAll(
  transaction: SqliteTransactionExecutor,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await transaction.execute(statement);
  }
}

export const scheduleActivationMigration: Migration = Object.freeze({
  version: 8,
  name: "schedule-activation",
  kind: "additive",
  async up(transaction) {
    await executeAll(transaction, SCHEDULE_ACTIVATION_SCHEMA_STATEMENTS);
  },
  async verify(transaction) {
    const tables = await transaction.queryAll<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
       ORDER BY name`,
    );
    if (
      REQUIRED_TABLES.some((required) =>
        !tables.some(({ name }) => name === required)
      )
    ) {
      throw new Error("schedule_activation_schema_incomplete");
    }

    const [activeCount] = await transaction.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedules
       WHERE lifecycle = 'active'`,
    );
    if (activeCount === undefined || activeCount.count > 1) {
      throw new Error("schedule_activation_active_count_invalid");
    }
  },
});
