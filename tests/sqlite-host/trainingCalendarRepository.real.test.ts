import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  SqliteConnection,
  SqlitePreparedResult,
  SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createTrainingCalendarRepository } from "../../src/platform/sqlite/repositories/trainingCalendarRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) rmSync(directory, { force: true, recursive: true });
  directories.clear();
});

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-training-calendar-"));
  directories.add(directory);
  const path = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(path));
  const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup: {
      async createAndValidate(request) {
        return { backupId: "training-calendar", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const };
      },
    },
  }).run();
  kernels.push(kernel);
  return kernel;
}

async function seedStrengthIntent(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(`INSERT INTO plans
      (id, origin, name, days_per_week, is_active, revision, plan_kind)
      VALUES ('strength-plan', 'custom', 'Full body plan', 3, 1, 1, 'strength'),
             ('inactive-strength-plan', 'custom', 'Old strength plan', 2, 0, 1, 'strength')`);
    await transaction.execute(`INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
      VALUES ('strength-day', 'strength-plan', 0, 'Full body A', 1),
             ('inactive-strength-day', 'inactive-strength-plan', 0, 'Old day', 1)`);
    await transaction.execute(`INSERT INTO exercise_library_entries
      (exercise_id, origin, canonical_name, exercise_type, movement_class,
       metric_profile, metric_contract_version, exercise_metric_generation,
       availability, revision)
      VALUES ('squat', 'custom', 'Squat', 'strength', 'compound',
              'load_reps', 1, 1, 'available', 1)`);
    await transaction.execute(`INSERT INTO owned_plan_day_exercises
      (id, plan_day_id, exercise_id, ordinal, between_exercise_rest_seconds,
       metric_profile, metric_contract_version, exercise_metric_generation, revision)
      VALUES ('strength-exercise', 'strength-day', 'squat', 0, 90,
              'load_reps', 1, 1, 1)`);
    await transaction.execute(`INSERT INTO owned_plan_working_set_targets
      (id, plan_day_exercise_id, ordinal, target_json, unit_json,
       metric_profile, metric_contract_version, exercise_metric_generation, revision)
      VALUES ('strength-target', 'strength-exercise', 0,
              '{"version":1,"profile":"load_reps","loadGrams":50000,"minReps":5,"maxReps":5,"incrementGrams":2500,"perSide":false}',
              '{}', 'load_reps', 1, 1, 1)`);
    await transaction.execute(`INSERT INTO owned_plan_schedules
      (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
      VALUES ('strength-schedule', 'strength-plan', 'active', 1, 1, NULL, 'strength'),
             ('inactive-strength-schedule', 'inactive-strength-plan', 'inactive', 1, 1, 2, 'strength')`);
    await transaction.execute(`INSERT INTO owned_plan_schedule_versions
      (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms)
      VALUES ('strength-version', 'strength-schedule', 1, '2026-11-01', 'weekday', 'Asia/Singapore', NULL, 1),
             ('inactive-strength-version', 'inactive-strength-schedule', 1, '2026-11-01', 'weekday', 'Asia/Singapore', NULL, 1)`);
    await transaction.execute(`INSERT INTO owned_plan_schedule_opportunities
      (id, schedule_id, schedule_version_id, local_date, source, plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
      VALUES ('strength-planned', 'strength-schedule', 'strength-version', '2026-11-01', 'weekday', 'strength-day', 'pending', NULL, NULL, 1, NULL),
             ('strength-rest', 'strength-schedule', 'strength-version', '2026-11-02', 'override', NULL, 'consumed', 'rest_day', NULL, 1, 2),
             ('strength-skipped', 'strength-schedule', 'strength-version', '2026-11-03', 'weekday', 'strength-day', 'consumed', 'skipped', NULL, 1, 3),
             ('strength-advanced', 'strength-schedule', 'strength-version', '2026-11-04', 'weekday', 'strength-day', 'consumed', 'advanced', NULL, 1, 4),
             ('inactive-planned', 'inactive-strength-schedule', 'inactive-strength-version', '2026-11-05', 'weekday', 'inactive-strength-day', 'pending', NULL, NULL, 1, NULL)`);
  });
}

async function seedStrengthHistory(kernel: SqliteKernel): Promise<void> {
  const target = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 50_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false });
  const observation = JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 50_000, reps: 5, source: "manual" });
  const correctedSnapshot = {
    version: 1,
    session: {
      id: "corrected-session", source: "scheduled_day", status: "partial",
      planId: "strength-plan", planDayId: "strength-day", planName: "Full body plan", dayName: "Corrected Full body A",
      localDate: "2026-11-07", timezone: "Asia/Singapore", startedAtMs: 10, completedAtMs: 20, ownerNote: null,
    },
    exercises: [{
      id: "corrected-exercise", exerciseId: "squat", name: "Squat", ordinal: 0, status: "active",
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, effort: null,
      sets: [
        { id: "corrected-set-1", kind: "working", ordinal: 0, status: "completed", target: JSON.parse(target), observation: JSON.parse(observation), completedAtMs: 20 },
        { id: "corrected-set-2", kind: "working", ordinal: 1, status: "planned", target: JSON.parse(target), completedAtMs: null },
      ],
    }],
  };
  await kernel.write(async (transaction) => {
    await transaction.execute(`INSERT INTO exercises
      (id, origin, name, metric_profile, metric_contract_version, exercise_metric_generation,
       equipment, default_rest_seconds, revision)
      VALUES ('squat', 'custom', 'Squat', 'load_reps', 1, 1, 'Barbell', 90, 1)`);
    await transaction.execute(`INSERT INTO workout_sessions
      (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision)
      VALUES ('corrected-session', 'strength-plan', 'strength-day', 'scheduled_day', 'completed', '2026-11-06', 'Asia/Singapore', 10, 20, 1),
             ('voided-session', 'strength-plan', 'strength-day', 'scheduled_day', 'completed', '2026-11-08', 'Asia/Singapore', 30, 40, 1)`);
    for (const sessionId of ["corrected-session", "voided-session"] as const) {
      await transaction.execute(`INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, exercise_name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         default_rest_seconds, target_revision, status, revision)
        VALUES (?, ?, NULL, 'squat', 0, 'Squat', 'load_reps', 1, 1, 90, 1, 'completed', 1)`,
      [`${sessionId}-exercise`, sessionId]);
      await transaction.execute(`INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal, target_load_grams, target_min_reps,
         target_max_reps, target_json, unit_json, rule_type, rule_version,
         metric_profile, metric_contract_version, exercise_metric_generation,
         observed_json, completed_at_ms, status, revision)
        VALUES (?, ?, 'working', 0, 50000, 5, 5, ?, '{}', 'load_reps', 1,
                'load_reps', 1, 1, ?, 20, 'completed', 1)`,
      [`${sessionId}-set`, `${sessionId}-exercise`, target, observation]);
    }
    await transaction.execute(`INSERT INTO owned_plan_schedule_opportunities
      (id, schedule_id, schedule_version_id, local_date, source, plan_day_id, state, outcome, session_id, revision, consumed_at_ms)
      VALUES ('strength-completed', 'strength-schedule', 'strength-version', '2026-11-06', 'weekday', 'strength-day', 'consumed', 'completed', 'corrected-session', 1, 20),
             ('strength-voided', 'strength-schedule', 'strength-version', '2026-11-08', 'weekday', 'strength-day', 'consumed', 'completed', 'voided-session', 1, 40)`);
    for (const [sessionId, opportunityId] of [["corrected-session", "strength-completed"], ["voided-session", "strength-voided"]] as const) {
      await transaction.execute(`INSERT INTO workout_session_schedule_links
        (workout_session_id, opportunity_id, plan_id, plan_day_id, schedule_id,
         schedule_version_id, local_date, timezone, plan_revision, day_revision,
         schedule_revision, opportunity_revision, created_at_ms)
        VALUES (?, ?, 'strength-plan', 'strength-day', 'strength-schedule',
                'strength-version', ?, 'Asia/Singapore', 1, 1, 1, 1, 50)`,
      [sessionId, opportunityId, sessionId === "corrected-session" ? "2026-11-06" : "2026-11-08"]);
    }
    await transaction.execute(`INSERT INTO history_session_overlays
      (session_id, effective_revision, lifecycle, snapshot_json, effective_local_date,
       effective_timezone, effective_started_at_ms, effective_completed_at_ms, created_at_ms, updated_at_ms)
      VALUES ('corrected-session', 2, 'active', ?, '2026-11-07', 'Asia/Singapore', 10, 20, 50, 51),
             ('voided-session', 2, 'voided', '{}', '2026-11-08', 'Asia/Singapore', 30, 40, 50, 51)`,
    [JSON.stringify(correctedSnapshot)]);
  });
}

async function seedImportedActivity(kernel: SqliteKernel): Promise<void> {
  const sha256 = "a".repeat(64);
  const aggregate = JSON.stringify({
    normalized_json_sha256: sha256,
    sample_fidelity: "source_summary",
    confirmed_local_date: "2026-11-01",
    normalized: {
      version: 1,
      started_at_ms: 100,
      source_time_zone: "Asia/Singapore",
      sport: "running",
      subtype: "outdoor",
      distance_meters: 5_000,
      elapsed_ms: 1_560_000,
      laps: [],
    },
  });
  await kernel.write(async (transaction) => {
    await transaction.execute(`INSERT INTO imported_activities
      (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms)
      VALUES ('activity-local-1', 'garmin_connect_account:private-owner', 'external-private-1', 100, ?, 101)`, [aggregate]);
    await transaction.execute(`INSERT INTO imported_activity_identities
      (activity_id, source_kind, account_namespace, external_activity_id,
       aggregate_revision, accepted_normalized_sha256, removal_state)
      VALUES ('activity-local-1', 'garmin_connect_account', 'private-owner', 'external-private-1', 1, ?, 'active')`, [sha256]);
    await transaction.execute(`INSERT INTO imported_activity_events
      (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms)
      VALUES ('activity-event-1', 'activity-local-1', 1, 'imported', '{}', 101)`);
    await transaction.execute(`INSERT INTO imported_activity_current_lifecycle
      (activity_id, aggregate_revision, removal_state, lifecycle_event_id)
      VALUES ('activity-local-1', 1, 'active', 'activity-event-1')`);
  });
}

async function seedRunningIntent(kernel: SqliteKernel): Promise<void> {
  const sessionDefinition = (id: string, kind: "recovery" | "tempo") => JSON.stringify({
    version: 1, id, rootId: `${kind}-root`, planId: "running-plan", sessionKind: kind,
    revision: 1, createdAtMs: 1,
    phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }],
    contextual: kind === "tempo" ? { format: "continuous", work: { durationMs: 60_000 } } : {},
  });
  await kernel.write(async (transaction) => {
    await transaction.execute(`INSERT INTO plans
      (id, origin, name, days_per_week, is_active, revision, plan_kind)
      VALUES ('running-plan', 'custom', '10K plan', 2, 1, 1, 'running'),
             ('inactive-running-plan', 'custom', 'Old Running plan', 1, 0, 1, 'running')`);
    await transaction.execute(`INSERT INTO running_plans (plan_id, status, revision, created_at_ms)
      VALUES ('running-plan', 'ready', 1, 1), ('inactive-running-plan', 'ready', 1, 1)`);
    await transaction.execute(`INSERT INTO running_session_revisions
      (id, plan_id, session_kind, revision, definition_json, created_at_ms)
      VALUES ('recovery-revision', 'running-plan', 'recovery', 1, ?, 1),
             ('tempo-revision', 'running-plan', 'tempo', 1, ?, 1),
             ('inactive-revision', 'inactive-running-plan', 'recovery', 1, ?, 1)`,
    [sessionDefinition("recovery-revision", "recovery"), sessionDefinition("tempo-revision", "tempo"), JSON.stringify({
      version: 1, id: "inactive-revision", rootId: "inactive-root", planId: "inactive-running-plan", sessionKind: "recovery",
      revision: 1, createdAtMs: 1, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], contextual: {},
    })]);
    await transaction.execute(`INSERT INTO running_session_slots
      (id, plan_id, weekday, ordinal, session_revision_id, revision, retired_at_ms)
      VALUES ('z-slot', 'running-plan', 'Monday', 0, 'recovery-revision', 1, NULL),
             ('a-slot', 'running-plan', 'Monday', 1, 'tempo-revision', 1, NULL),
             ('inactive-slot', 'inactive-running-plan', 'Monday', 0, 'inactive-revision', 1, NULL)`);
    await transaction.execute(`INSERT INTO owned_plan_schedules
      (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
      VALUES ('running-schedule', 'running-plan', 'active', 1, 1, NULL, 'running'),
             ('inactive-running-schedule', 'inactive-running-plan', 'inactive', 1, 1, 2, 'running')`);
    await transaction.execute(`INSERT INTO owned_plan_schedule_versions
      (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms)
      VALUES ('running-version', 'running-schedule', 1, '2026-11-01', 'weekday', 'Asia/Singapore', NULL, 1),
             ('inactive-running-version', 'inactive-running-schedule', 1, '2026-11-01', 'weekday', 'Asia/Singapore', NULL, 1)`);
    await transaction.execute(`INSERT INTO running_opportunities
      (id, plan_id, schedule_id, schedule_version_id, slot_id, local_date, timezone, session_revision_id, state, created_at_ms)
      VALUES ('running-z-first', 'running-plan', 'running-schedule', 'running-version', 'z-slot', '2026-11-01', 'Asia/Singapore', 'recovery-revision', 'planned', 1),
             ('running-a-second', 'running-plan', 'running-schedule', 'running-version', 'a-slot', '2026-11-01', 'Asia/Singapore', 'tempo-revision', 'planned', 1),
             ('running-inactive', 'inactive-running-plan', 'inactive-running-schedule', 'inactive-running-version', 'inactive-slot', '2026-11-01', 'Asia/Singapore', 'inactive-revision', 'planned', 1)`);
  });
}

describe("training calendar repository with real SQLite", () => {
  it("projects active intent, distinguishes rest from empty, and rejects consumed non-events", async () => {
    const kernel = await open();
    await seedStrengthIntent(kernel);
    await seedImportedActivity(kernel);

    const result = await createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-06",
    });

    expect(result.events.map(({ id }) => id)).toEqual(["strength-planned", "activity-local-1"]);
    expect(result.events[0]).toMatchObject({
      displaySummary: "Full body A · 1 working set planned",
      destination: { kind: "occurrence", occurrenceId: "strength-planned" },
    });
    expect(result.days).toEqual([
      { localDate: "2026-11-01", kind: "events", restSummary: null },
      { localDate: "2026-11-02", kind: "rest", restSummary: "Full body plan. Nothing to resume or review." },
      { localDate: "2026-11-03", kind: "empty", restSummary: null },
      { localDate: "2026-11-04", kind: "empty", restSummary: null },
      { localDate: "2026-11-05", kind: "empty", restSummary: null },
    ]);
    expect(result.events[1]).toMatchObject({
      sourceLabel: "Garmin",
      displaySummary: "5.00 km · 26:00",
      sourceIdentity: {
        sourceKind: "garmin_connect_account",
        accountNamespace: "private-owner",
        externalActivityId: "external-private-1",
      },
    });
  });

  it("uses corrected effective history dates and summaries while excluding voided history", async () => {
    const kernel = await open();
    await seedStrengthIntent(kernel);
    await seedStrengthHistory(kernel);

    const result = await createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-06",
      endLocalDateExclusive: "2026-11-09",
    });

    expect(result.events).toEqual([
      expect.objectContaining({
        id: "strength-completed",
        localDate: "2026-11-07",
        status: "partial",
        title: "Corrected Full body A",
        displaySummary: "1 of 2 working sets completed",
        destination: { kind: "session", sessionId: "corrected-session" },
      }),
    ]);
    expect(result.events.some(({ id }) => id === "strength-voided")).toBe(false);
    expect(result.days.map(({ kind }) => kind)).toEqual(["empty", "events", "empty"]);
  });

  it("preserves source-defined Running slot order and excludes inactive schedule intent", async () => {
    const kernel = await open();
    await seedRunningIntent(kernel);

    const result = await createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    });

    expect(result.events.map(({ id }) => id)).toEqual(["running-z-first", "running-a-second"]);
    expect(result.events.map(({ displaySummary }) => displaySummary)).toEqual([
      "Recovery session planned",
      "Tempo session planned",
    ]);
  });

  it("keeps matched Garmin history outside the active range and lets malformed imports leave planned intent visible", async () => {
    const kernel = await open();
    await seedRunningIntent(kernel);
    await seedImportedActivity(kernel);
    await kernel.write(async (transaction) => {
      await transaction.execute(`INSERT INTO running_opportunities
        (id, plan_id, schedule_id, schedule_version_id, slot_id, local_date,
         timezone, session_revision_id, state, created_at_ms)
        VALUES ('running-outside-range', 'running-plan', 'running-schedule',
                'running-version', 'z-slot', '2026-10-31', 'Asia/Singapore',
                'recovery-revision', 'planned', 1)`);
      await transaction.execute(`INSERT INTO running_activity_match_events
        (id, activity_id, opportunity_id, prior_opportunity_id, action,
         activity_revision, opportunity_revision, prior_relation_revision,
         relation_revision, request_sha256, created_at_ms)
        VALUES ('match-outside', 'activity-local-1', 'running-outside-range', NULL,
                'matched', 1, 1, 0, 1, ?, 200)`, ["b".repeat(64)]);
      await transaction.execute(`INSERT INTO running_activity_current_matches
        (opportunity_id, activity_id, relation_revision, event_id)
        VALUES ('running-outside-range', 'activity-local-1', 1, 'match-outside')`);

      const malformed = JSON.stringify({
        confirmed_local_date: "2026-11-01",
        normalized: { sport: "running" },
      });
      await transaction.execute(`INSERT INTO imported_activities
        (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms)
        VALUES ('activity-malformed', 'garmin_connect_account:private-owner',
                'external-malformed', 300, ?, 301)`, [malformed]);
      await transaction.execute(`INSERT INTO imported_activity_identities
        (activity_id, source_kind, account_namespace, external_activity_id,
         aggregate_revision, accepted_normalized_sha256, removal_state)
        VALUES ('activity-malformed', 'garmin_connect_account', 'private-owner',
                'external-malformed', 1, ?, 'active')`, ["c".repeat(64)]);
      await transaction.execute(`INSERT INTO imported_activity_events
        (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms)
        VALUES ('activity-event-malformed', 'activity-malformed', 1, 'imported', '{}', 301)`);
      await transaction.execute(`INSERT INTO imported_activity_current_lifecycle
        (activity_id, aggregate_revision, removal_state, lifecycle_event_id)
        VALUES ('activity-malformed', 1, 'active', 'activity-event-malformed')`);
      await transaction.execute(`INSERT INTO running_activity_match_events
        (id, activity_id, opportunity_id, prior_opportunity_id, action,
         activity_revision, opportunity_revision, prior_relation_revision,
         relation_revision, request_sha256, created_at_ms)
        VALUES ('match-malformed', 'activity-malformed', 'running-a-second', NULL,
                'matched', 1, 1, 0, 1, ?, 302)`, ["d".repeat(64)]);
      await transaction.execute(`INSERT INTO running_activity_current_matches
        (opportunity_id, activity_id, relation_revision, event_id)
        VALUES ('running-a-second', 'activity-malformed', 1, 'match-malformed')`);
    });

    const result = await createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    });

    expect(result.events.map(({ id }) => id)).toEqual([
      "running-z-first",
      "running-a-second",
      "activity-local-1",
    ]);
    expect(result.events[2]).toMatchObject({
      status: "matched",
      scheduleId: "running-schedule",
      scheduleVersionId: "running-version",
      planId: "running-plan",
      slotId: "z-slot",
      destination: { kind: "activity", activityId: "activity-local-1" },
    });
  });
});
