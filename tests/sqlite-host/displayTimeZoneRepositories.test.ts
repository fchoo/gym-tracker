import { afterEach, expect, it } from "@jest/globals";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { migrations } from "../../src/platform/sqlite/migrations";
import type { SqliteKernel, SqliteReadTransactionExecutor, SqliteTransactionExecutor } from "../../src/platform/sqlite/sqliteKernel";
import { createTrainingCalendarRepository } from "../../src/platform/sqlite/repositories/trainingCalendarRepository";
import { createProgressRepository } from "../../src/platform/sqlite/repositories/progressRepository";
import { captureStrengthOccurrenceSnapshot } from "../../src/platform/sqlite/repositories/strengthOccurrenceSnapshot";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const instant = (value: string) => Date.parse(value);
const allSubject = 'history-subject/v1:["period","all"]';
const target = { version: 1, profile: "load_reps", loadGrams: 40_000, minReps: 8, maxReps: 10, incrementGrams: 2_500, perSide: false };
const observation = { version: 1, profile: "load_reps", loadGrams: 40_000, reps: 9, source: "manual" };

async function fixture() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  db.exec("PRAGMA foreign_keys = ON");
  const reader = {
    async queryAll<Row>(sql: string, parameters: readonly SQLInputValue[] = []) { return db.prepare(sql).all(...parameters) as Row[]; },
    async queryFirst<Row>(sql: string, parameters: readonly SQLInputValue[] = []) { return (db.prepare(sql).get(...parameters) ?? null) as Row | null; },
  } as SqliteReadTransactionExecutor;
  const transaction = { ...reader, async execute(sql: string, parameters: readonly SQLInputValue[] = []) {
    const statement = db.prepare(sql);
    if (statement.columns().length > 0) { statement.all(...parameters); return { changes: 0, lastInsertRowId: 0 }; }
    const result = statement.run(...parameters); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  } } as unknown as SqliteTransactionExecutor;
  for (const migration of migrations) await migration.up(transaction);
  const kernel = { ...reader, readSnapshot: async <Result>(read: (r: SqliteReadTransactionExecutor) => Promise<Result>) => read(reader) } as SqliteKernel;
  return { db, kernel, transaction };
}

function sourceSnapshot(db: DatabaseSync) {
  const tables = ["workout_sessions", "history_session_overlays", "owned_plan_schedule_opportunities", "imported_activities",
    "imported_activity_identities", "imported_activity_current_lifecycle", "running_activity_current_matches",
    "history_projection_period_inputs", "history_projection_comparable_exposures", "bodyweight_entries", "bodyweight_entry_events"];
  return JSON.stringify(Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()])));
}

function imported(db: DatabaseSync, id: string, sourceDate: string, startedAt: string, removed = false) {
  const ms = instant(startedAt);
  const aggregate = JSON.stringify({ confirmed_local_date: sourceDate, sample_fidelity: "source_summary", normalized: {
    sport: "running", subtype: "outdoor", source_time_zone: "UTC", distance_meters: 2_400, elapsed_ms: 660_000, duration_ms: 660_000,
  } });
  db.prepare("INSERT INTO imported_activities(id,source,source_activity_id,started_at_ms,aggregate_json,imported_at_ms) VALUES (?,'garmin',?,?,?,?)").run(id, `${id}-external`, ms, aggregate, ms);
  db.prepare("INSERT INTO imported_activity_identities(activity_id,source_kind,account_namespace,external_activity_id,aggregate_revision,accepted_normalized_sha256,removal_state) VALUES (?,'garmin_connect_account','fixture-account',?,1,?,?)").run(id, `${id}-external`, "a".repeat(64), removed ? "removed" : "active");
  db.prepare("INSERT INTO imported_activity_events(id,activity_id,aggregate_revision,event_type,payload_json,created_at_ms) VALUES (?,?,1,?,'{}',?)").run(`${id}-event`, id, removed ? "removed" : "imported", ms);
  db.prepare("INSERT INTO imported_activity_current_lifecycle(activity_id,aggregate_revision,removal_state,lifecycle_event_id) VALUES (?,1,?,?)").run(id, removed ? "removed" : "active", `${id}-event`);
}

function strength(db: DatabaseSync, id: string, sourceDate: string, startedAt: string, correctedAt?: string) {
  const ms = instant(startedAt);
  const effectiveMs = correctedAt === undefined ? ms : instant(correctedAt);
  db.prepare("INSERT INTO plans(id,origin,name,days_per_week,is_active,revision,plan_kind) VALUES (?,'custom','Fixture strength',2,?,1,'strength')").run(`${id}-plan`, id === "corrected" ? 0 : 1);
  db.prepare("INSERT INTO plan_days(id,plan_id,ordinal,name,revision) VALUES (?,?,0,'Fixture day',1)").run(`${id}-day`, `${id}-plan`);
  db.prepare("INSERT INTO exercises(id,origin,name,metric_profile,metric_contract_version,exercise_metric_generation,equipment,default_rest_seconds,revision) VALUES (?,'custom','Fixture press','load_reps',1,1,'Barbell',60,1)").run(`${id}-exercise`);
  db.prepare("INSERT INTO owned_plan_schedules(id,plan_id,lifecycle,revision,activated_at_ms,deactivated_at_ms,plan_kind) VALUES (?,?,?,1,1,?,'strength')").run(`${id}-schedule`, `${id}-plan`, id === "corrected" ? "inactive" : "active", id === "corrected" ? 2 : null);
  db.prepare("INSERT INTO owned_plan_schedule_versions(id,schedule_id,version_number,effective_local_date,mode,timezone,rotation_pointer,created_at_ms) VALUES (?,?,1,'2026-01-01','weekday','UTC',NULL,1)").run(`${id}-version`, `${id}-schedule`);
  db.prepare("INSERT INTO workout_sessions(id,plan_id,plan_day_id,source,status,local_date,timezone,started_at_ms,completed_at_ms,revision) VALUES (?,?,?,'scheduled_day','completed',?,'UTC',?,?,1)").run(id, `${id}-plan`, `${id}-day`, sourceDate, ms, ms + 5_000);
  db.prepare("INSERT INTO session_exercises(id,session_id,source_plan_day_exercise_id,exercise_id,ordinal,exercise_name,metric_profile,metric_contract_version,exercise_metric_generation,default_rest_seconds,target_revision,status,revision) VALUES (?,?,NULL,?,0,'Fixture press','load_reps',1,1,60,1,'completed',1)").run(`${id}-session-exercise`, id, `${id}-exercise`);
  db.prepare("INSERT INTO session_sets(id,session_exercise_id,set_kind,ordinal,target_load_grams,target_min_reps,target_max_reps,target_json,unit_json,rule_type,rule_version,metric_profile,metric_contract_version,exercise_metric_generation,observed_json,completed_at_ms,status,revision) VALUES (?,?,'working',0,40000,8,10,?,'{}','load_reps',1,'load_reps',1,1,?,?,'completed',1)").run(`${id}-set`, `${id}-session-exercise`, JSON.stringify(target), JSON.stringify(observation), ms + 5_000);
  db.prepare("INSERT INTO owned_plan_schedule_opportunities(id,schedule_id,schedule_version_id,local_date,source,plan_day_id,state,outcome,session_id,revision,consumed_at_ms) VALUES (?,?,?,?,'weekday',?,'consumed','completed',?,1,?)").run(`${id}-opportunity`, `${id}-schedule`, `${id}-version`, sourceDate, `${id}-day`, id, ms + 5_000);
  if (correctedAt !== undefined) {
    const snapshot = { version: 1, session: { id, source: "scheduled_day", status: "completed", planId: `${id}-plan`, planDayId: `${id}-day`, planName: "Fixture strength", dayName: "Corrected day", localDate: sourceDate, timezone: "UTC", startedAtMs: effectiveMs, completedAtMs: effectiveMs + 5_000, ownerNote: null },
      exercises: [{ id: `${id}-session-exercise`, exerciseId: `${id}-exercise`, name: "Fixture press", ordinal: 0, status: "completed", metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, effort: null,
        sets: [{ id: `${id}-set`, kind: "working", ordinal: 0, status: "completed", target, observation, completedAtMs: effectiveMs + 5_000 }] }] };
    db.prepare("INSERT INTO history_session_overlays(session_id,effective_revision,lifecycle,snapshot_json,effective_local_date,effective_timezone,effective_started_at_ms,effective_completed_at_ms,created_at_ms,updated_at_ms) VALUES (?,2,'active',?,?,'UTC',?,?,1,2)").run(id, JSON.stringify(snapshot), sourceDate, effectiveMs, effectiveMs + 5_000);
  }
  const subject = `history-subject/v1:["exercise_metric","${id}-exercise","load_reps:1:1","identity"]`;
  for (const subjectId of [allSubject, subject]) {
    db.prepare("INSERT INTO history_subject_revisions(subject_id,revision,updated_at_ms) VALUES (?,1,1) ON CONFLICT DO NOTHING").run(subjectId);
    db.prepare("INSERT INTO history_projection_freshness(subject_id,applied_revision,updated_at_ms) VALUES (?,1,1) ON CONFLICT(subject_id) DO UPDATE SET applied_revision=1").run(subjectId);
  }
  db.prepare("INSERT INTO history_projection_comparable_exposures(subject_id,exercise_id,identity_key,comparator_key,session_id,local_date,set_id,set_ordinal,completed_at_ms,target_json,observation_json) VALUES (?,?,'load_reps:1:1','identity',?,?,?,0,?,?,?)").run(subject, `${id}-exercise`, id, sourceDate, `${id}-set`, effectiveMs + 5_000, JSON.stringify(target), JSON.stringify(observation));
  db.prepare("INSERT INTO history_projection_period_inputs(subject_id,local_date,completed_exercises,planned_exercises,completed_working_sets,planned_working_sets,comparable_exposure_count) VALUES (?,?,1,1,1,1,1) ON CONFLICT DO NOTHING").run(allSubject, sourceDate);
}

it("Calendar uses phone-zone month bounds and grouping without changing imported source identity or dates", async () => {
  const { db, kernel } = await fixture();
  imported(db, "enters-month", "2026-10-31", "2026-10-31T20:00:00Z");
  imported(db, "leaves-month", "2026-11-30", "2026-11-30T17:00:00Z");
  imported(db, "removed", "2026-11-01", "2026-10-31T20:00:00Z", true);
  const before = sourceSnapshot(db);
  const input = { startLocalDate: "2026-11-01", endLocalDateExclusive: "2026-12-01" };
  const repo = createTrainingCalendarRepository(kernel);
  expect((await repo.loadRange(input)).events.map(event => event.id)).toEqual(["leaves-month"]);
  const result = await repo.loadRange({ ...input, displayTimeZone: "Asia/Singapore" });
  expect(result.events.map(event => [event.id, event.localDate])).toEqual([["enters-month", "2026-11-01"]]);
  expect(result.events[0]).toMatchObject({ sourceLabel: "Garmin", destination: { kind: "activity", activityId: "enters-month" }, sourceIdentity: { accountNamespace: "fixture-account", externalActivityId: "enters-month-external" } });
  expect(sourceSnapshot(db)).toBe(before);
});

it("Calendar respects western previous-day grouping and the 23-hour DST day upper boundary", async () => {
  const { db, kernel } = await fixture();
  imported(db, "west", "2026-11-01", "2026-11-01T03:00:00Z");
  imported(db, "dst-last", "2026-03-09", "2026-03-09T03:59:59Z");
  imported(db, "dst-next", "2026-03-09", "2026-03-09T04:00:00Z");
  const repo = createTrainingCalendarRepository(kernel);
  expect((await repo.loadRange({ startLocalDate: "2026-10-31", endLocalDateExclusive: "2026-11-01", displayTimeZone: "America/Los_Angeles" })).events.map(event => [event.id, event.localDate])).toEqual([["west", "2026-10-31"]]);
  expect((await repo.loadRange({ startLocalDate: "2026-03-08", endLocalDateExclusive: "2026-03-09", displayTimeZone: "America/New_York" })).events.map(event => [event.id, event.localDate])).toEqual([["dst-last", "2026-03-08"]]);
});

it("Calendar groups original/effective strength starts but keeps pending schedule dates civil", async () => {
  const { db, kernel, transaction } = await fixture();
  strength(db, "original", "2026-10-31", "2026-10-31T20:00:00Z");
  strength(db, "corrected", "2026-10-30", "2026-10-30T10:00:00Z", "2026-10-31T21:00:00Z");
  db.exec("INSERT INTO exercise_library_entries(exercise_id,origin,canonical_name,exercise_type,movement_class,metric_profile,metric_contract_version,exercise_metric_generation,availability,revision) VALUES ('original-exercise','custom','Fixture press','strength','compound','load_reps',1,1,'available',1)");
  db.prepare("INSERT INTO owned_plan_day_exercises(id,plan_day_id,exercise_id,ordinal,between_exercise_rest_seconds,metric_profile,metric_contract_version,exercise_metric_generation,revision) VALUES ('planned-exercise','original-day','original-exercise',0,60,'load_reps',1,1,1)").run();
  db.prepare("INSERT INTO owned_plan_working_set_targets(id,plan_day_exercise_id,ordinal,target_json,unit_json,metric_profile,metric_contract_version,exercise_metric_generation,revision) VALUES ('planned-target','planned-exercise',0,?,'{}','load_reps',1,1,1)").run(JSON.stringify(target));
  db.prepare("INSERT INTO owned_plan_schedule_opportunities(id,schedule_id,schedule_version_id,local_date,source,plan_day_id,state,outcome,session_id,revision,consumed_at_ms) VALUES ('planned','original-schedule','original-version','2026-11-01','weekday','original-day','pending',NULL,NULL,1,NULL)").run();
  await captureStrengthOccurrenceSnapshot(transaction, "planned", 1);
  const before = sourceSnapshot(db);
  const result = await createTrainingCalendarRepository(kernel).loadRange({ startLocalDate: "2026-11-01", endLocalDateExclusive: "2026-11-02", displayTimeZone: "Asia/Singapore" });
  expect(result.events.map(event => [event.id, event.localDate, event.status]).sort()).toEqual([["corrected-opportunity", "2026-11-01", "completed"], ["original-opportunity", "2026-11-01", "completed"], ["planned", "2026-11-01", "planned"]]);
  expect(sourceSnapshot(db)).toBe(before);
});

it("Calendar suppresses a matched civil plan even when its imported display day is outside the loaded month", async () => {
  const { db, kernel } = await fixture();
  imported(db, "matched", "2026-11-01", "2026-11-01T03:00:00Z");
  const definition = JSON.stringify({ version: 1, id: "running-revision", rootId: "running-root", planId: "running-plan", sessionKind: "recovery", revision: 1, createdAtMs: 1, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], contextual: {} });
  db.exec("INSERT INTO plans(id,origin,name,days_per_week,is_active,revision,plan_kind) VALUES ('running-plan','custom','Fixture running',2,1,1,'running'); INSERT INTO running_plans(plan_id,status,revision,created_at_ms) VALUES ('running-plan','ready',1,1); INSERT INTO owned_plan_schedules(id,plan_id,lifecycle,revision,activated_at_ms,plan_kind) VALUES ('running-schedule','running-plan','active',1,1,'running'); INSERT INTO owned_plan_schedule_versions(id,schedule_id,version_number,effective_local_date,mode,timezone,rotation_pointer,created_at_ms) VALUES ('running-version','running-schedule',1,'2026-01-01','weekday','UTC',NULL,1)");
  db.prepare("INSERT INTO running_session_revisions(id,plan_id,session_kind,revision,definition_json,created_at_ms) VALUES ('running-revision','running-plan','recovery',1,?,1)").run(definition);
  db.exec("INSERT INTO running_session_slots(id,plan_id,weekday,ordinal,session_revision_id,revision) VALUES ('running-slot','running-plan','Monday',0,'running-revision',1); INSERT INTO running_opportunities(id,plan_id,schedule_id,schedule_version_id,slot_id,local_date,timezone,session_revision_id,state,created_at_ms) VALUES ('running-opportunity','running-plan','running-schedule','running-version','running-slot','2026-11-01','UTC','running-revision','planned',1)");
  db.prepare("INSERT INTO running_activity_match_events(id,activity_id,opportunity_id,action,activity_revision,opportunity_revision,prior_relation_revision,relation_revision,request_sha256,created_at_ms) VALUES ('match-event','matched','running-opportunity','matched',1,1,0,1,?,1)").run("a".repeat(64));
  db.exec("INSERT INTO running_activity_current_matches(opportunity_id,activity_id,relation_revision,event_id) VALUES ('running-opportunity','matched',1,'match-event')");
  const before = sourceSnapshot(db);
  const repo = createTrainingCalendarRepository(kernel);
  expect((await repo.loadRange({ startLocalDate: "2026-11-01", endLocalDateExclusive: "2026-12-01", displayTimeZone: "America/Los_Angeles" })).events).toEqual([]);
  expect((await repo.loadRange({ startLocalDate: "2026-10-31", endLocalDateExclusive: "2026-11-01", displayTimeZone: "America/Los_Angeles" })).events[0]).toMatchObject({ status: "matched", localDate: "2026-10-31", scheduleId: "running-schedule", slotId: "running-slot" });
  expect(sourceSnapshot(db)).toBe(before);
});

it("Progress running filters timestamp windows and rereads the factory display timezone without rewriting raw facts", async () => {
  const { db, kernel } = await fixture();
  imported(db, "window-edge", "2026-10-04", "2026-10-04T20:00:00Z");
  imported(db, "future-edge", "2026-11-01", "2026-11-01T17:00:00Z");
  let zone = "Asia/Singapore";
  const repo = createProgressRepository(kernel, { displayTimeZone: () => zone });
  const before = sourceSnapshot(db);
  const first = await repo.load({ sport: "Running", period: "4_weeks", nowLocalDate: "2026-11-01" });
  expect(first.dashboard?.sport).toBe("Running");
  if (first.dashboard?.sport !== "Running") throw new Error("running dashboard required");
  expect(first.dashboard.goals.flatMap(goal => goal.history.map(point => [point.effort.activityId, point.effort.localDate]))).toEqual([["window-edge", "2026-10-05"]]);
  zone = "UTC";
  const second = await repo.load({ sport: "Running", period: "4_weeks", nowLocalDate: "2026-11-01" });
  if (second.dashboard?.sport !== "Running") throw new Error("running dashboard required");
  expect(second.dashboard.goals.flatMap(goal => goal.history.map(point => point.effort.activityId))).toEqual(["future-edge"]);
  const raw = await repo.load({ period: "all", nowLocalDate: "2026-11-01", displayTimeZone: "Asia/Singapore" });
  expect(raw.sourceFacts?.running.activities.find(activity => activity.id === "window-edge")?.localDate).toBe("2026-10-04");
  expect(sourceSnapshot(db)).toBe(before);
});

it("Progress strength display uses effective start bounds while cached projections and bodyweight civil facts stay unchanged", async () => {
  const { db, kernel } = await fixture();
  strength(db, "strength", "2026-10-04", "2026-10-03T20:00:00Z", "2026-10-04T20:00:00Z");
  db.exec("INSERT INTO bodyweight_entries(id,owner_id,current_revision,lifecycle,created_at_ms) VALUES ('weight','fixture-owner',1,'active',1); INSERT INTO bodyweight_entry_events(id,entry_id,owner_id,revision,event_id,operation,local_date,timezone,grams,occurred_at_ms) VALUES ('weight-event','weight','fixture-owner',1,'weight-source','create','2026-10-04','UTC',70000,1)");
  const before = sourceSnapshot(db);
  const repo = createProgressRepository(kernel);
  const base = await repo.load({ sport: "Strength", period: "4_weeks", nowLocalDate: "2026-11-01" });
  const display = await repo.load({ sport: "Strength", period: "4_weeks", nowLocalDate: "2026-11-01", displayTimeZone: "Asia/Singapore" });
  expect(display.projection).toEqual(base.projection);
  if (display.dashboard?.sport !== "Strength") throw new Error("strength dashboard required");
  expect(display.dashboard.facts.map(fact => [fact.sessionId, fact.localDate])).toEqual([["strength", "2026-10-05"]]);
  const raw = await repo.load({ period: "all", nowLocalDate: "2026-11-01", displayTimeZone: "Asia/Singapore" });
  expect(raw.sourceFacts?.bodyweight.entries[0]?.localDate).toBe("2026-10-04");
  expect(sourceSnapshot(db)).toBe(before);
});
