import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { createHistoryRepository, type EffectiveSnapshot } from "../../src/platform/sqlite/repositories/historyRepository";
import { projectLoadMetricHistorySeries } from "../../src/domains/history/metricHistory";
import type { SqliteKernel, SqliteReadTransactionExecutor } from "../../src/platform/sqlite/sqliteKernel";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

const target = { version: 1, profile: "load_reps", loadGrams: 40000, minReps: 8, maxReps: 10, incrementGrams: 2500, perSide: false };
const observation = { version: 1, profile: "load_reps", loadGrams: 40000, reps: 8, source: "manual" };

function fixture() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  db.exec(`
    CREATE TABLE workout_sessions(id TEXT PRIMARY KEY, plan_id TEXT, plan_day_id TEXT, source TEXT, status TEXT,
      local_date TEXT, timezone TEXT, started_at_ms INTEGER, completed_at_ms INTEGER,
      creation_timezone_offset_minutes INTEGER DEFAULT 0, revision INTEGER);
    CREATE TABLE plans(id TEXT, name TEXT); CREATE TABLE plan_days(id TEXT, name TEXT);
    CREATE TABLE history_session_overlays(session_id TEXT, effective_revision INTEGER, lifecycle TEXT, snapshot_json TEXT,
      effective_local_date TEXT, effective_timezone TEXT, effective_started_at_ms INTEGER, effective_completed_at_ms INTEGER);
    CREATE TABLE history_audit_events(session_id TEXT, effective_revision INTEGER, event_type TEXT, occurred_at_ms INTEGER);
    CREATE TABLE session_exercises(id TEXT, session_id TEXT, exercise_id TEXT, exercise_name TEXT, status TEXT,
      metric_profile TEXT, metric_contract_version INTEGER, exercise_metric_generation INTEGER);
    CREATE TABLE session_sets(id TEXT, session_exercise_id TEXT, set_kind TEXT, ordinal INTEGER, status TEXT,
      target_json TEXT, observed_json TEXT, completed_at_ms INTEGER);
    CREATE TABLE owned_plan_schedules(id TEXT, lifecycle TEXT);
    CREATE TABLE owned_plan_schedule_opportunities(id TEXT, schedule_id TEXT, outcome TEXT, local_date TEXT);
    CREATE TABLE portable_owner_identity(id INTEGER, owner_namespace TEXT);
    CREATE TABLE bodyweight_entries(id TEXT, owner_id TEXT, current_revision INTEGER, lifecycle TEXT);
    CREATE TABLE bodyweight_entry_events(entry_id TEXT, revision INTEGER, local_date TEXT, grams INTEGER, occurred_at_ms INTEGER);
    CREATE TABLE history_subject_revisions(subject_id TEXT, revision INTEGER);
    CREATE TABLE history_projection_freshness(subject_id TEXT, applied_revision INTEGER);
    CREATE TABLE history_rebuild_effects(subject_id TEXT, status TEXT);
  `);
  const queryAll = async <Row extends Record<string, unknown>>(sql: string, args: readonly unknown[] = []): Promise<readonly Row[]> =>
    db.prepare(sql).all(...args as (null | number | string)[]) as Row[];
  const kernel = { queryAll, readSnapshot: async <T>(read: (executor: SqliteReadTransactionExecutor) => Promise<T>) => {
    db.exec("BEGIN"); try { const result = await read({ queryAll } as SqliteReadTransactionExecutor); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  } } as SqliteKernel;
  const session = (id: string, start: string, localDate: string, timezone = "UTC") => {
    const started = Date.parse(start);
    db.prepare(`INSERT INTO workout_sessions(id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision)
      VALUES (?, 'scheduled_day', 'completed', ?, ?, ?, ?, 1)`).run(id, localDate, timezone, started, started + 60000);
    db.prepare("INSERT INTO session_exercises VALUES (?, ?, 'squat', 'Squat', 'completed', 'load_reps', 1, 1)").run(`${id}-exercise`, id);
    db.prepare("INSERT INTO session_sets VALUES (?, ?, 'working', 0, 'completed', ?, ?, ?)")
      .run(`${id}-set`, `${id}-exercise`, JSON.stringify(target), JSON.stringify(observation), started + 60000);
  };
  const overlay = (id: string, start: string, localDate: string, lifecycle = "active") => {
    const started = Date.parse(start);
    const snapshot: EffectiveSnapshot = { version: 1, session: { id, source: "scheduled_day", status: "completed", planName: null,
      dayName: null, localDate, timezone: "UTC", startedAtMs: started, completedAtMs: started + 60000 }, exercises: [{
      id: `${id}-exercise`, exerciseId: "squat", name: "Squat", ordinal: 0, status: "completed",
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      sets: [{ id: `${id}-set`, kind: "working", ordinal: 0, status: "completed", target, observation, completedAtMs: started + 60000 }],
    }] };
    db.prepare("INSERT INTO history_session_overlays VALUES (?, 2, ?, ?, ?, 'UTC', ?, ?)")
      .run(id, lifecycle, JSON.stringify(snapshot), localDate, started, started + 60000);
  };
  const sourceFacts = () => JSON.stringify(["workout_sessions", "history_session_overlays", "session_sets", "bodyweight_entry_events"]
    .map(table => db.prepare(`SELECT * FROM ${table}`).all()));
  return { db, kernel, session, overlay, sourceFacts };
}

describe("History phone-timezone presentation", () => {
  it("includes an instant shifted into another month without changing original/effective source dates", async () => {
    const f = fixture(); f.session("month-edge", "2026-02-28T16:30:00Z", "2026-02-28");
    const before = f.sourceFacts();
    const repository = createHistoryRepository(f.kernel, { displayTimeZone: () => "Asia/Singapore" });
    const result = await repository.loadCalendarMonth({ month: "2026-03-01", selectedDate: "2026-03-01", today: "2026-03-02" });
    expect(result.sessions.map(session => session.id)).toEqual(["month-edge"]);
    expect(result.sessions[0]?.displayLocalDate).toBe("2026-03-01");
    expect(result.sessions[0]?.original.localDate).toBe("2026-02-28");
    expect(result.sessions[0]?.effective.localDate).toBe("2026-02-28");
    expect(result.days[0]?.localDate).toBe("2026-03-01");
    expect(f.sourceFacts()).toBe(before);
    expect((await createHistoryRepository(f.kernel).loadCalendarMonth({ month: "2026-02-01", selectedDate: "2026-02-28", today: "2026-02-28" })).sessions[0])
      .not.toHaveProperty("displayLocalDate");
  });

  it("rereads the current display timezone on the next load", async () => {
    const f = fixture(); f.session("zone-change", "2026-05-01T00:30:00Z", "2026-05-01");
    let zone = "Asia/Singapore";
    const repository = createHistoryRepository(f.kernel, { displayTimeZone: () => zone });
    expect((await repository.loadCalendarMonth({ month: "2026-05-01", selectedDate: "2026-05-01", today: "2026-05-01" })).sessions[0]?.displayTimeZone).toBe(zone);
    zone = "America/Los_Angeles";
    const result = await repository.loadCalendarMonth({ month: "2026-04-01", selectedDate: "2026-04-30", today: "2026-04-30" });
    expect(result.sessions[0]?.displayLocalDate).toBe("2026-04-30");
    expect(result.sessions[0]?.effective.startedAtMs).toBe(Date.parse("2026-05-01T00:30:00Z"));
  });

  it("groups exact epoch boundaries across a 23-hour DST day", async () => {
    const f = fixture();
    for (const [id, instant] of [["before", "2026-03-08T04:59:59.999Z"], ["start", "2026-03-08T05:00:00Z"],
      ["last", "2026-03-09T03:59:59.999Z"], ["next", "2026-03-09T04:00:00Z"]]) f.session(id!, instant!, instant!.slice(0, 10));
    const before = f.sourceFacts();
    const result = await createHistoryRepository(f.kernel, { displayTimeZone: () => "America/New_York" })
      .loadCalendarMonth({ month: "2026-03-01", selectedDate: "2026-03-08", today: "2026-03-08" });
    expect(result.sessions.map(session => session.id)).toEqual(["last", "start"]);
    expect(f.sourceFacts()).toBe(before);
  });

  it("uses the corrected effective instant for month selection while keeping both source revisions", async () => {
    const f = fixture(); f.session("corrected", "2026-01-31T23:00:00Z", "2026-01-31");
    f.overlay("corrected", "2026-02-28T18:00:00Z", "2026-02-28");
    const before = f.sourceFacts();
    const result = await createHistoryRepository(f.kernel, { displayTimeZone: () => "Asia/Singapore" })
      .loadCalendarMonth({ month: "2026-03-01", selectedDate: "2026-03-01", today: "2026-03-01" });
    expect(result.sessions[0]?.original.localDate).toBe("2026-01-31");
    expect(result.sessions[0]?.effective.localDate).toBe("2026-02-28");
    expect(result.sessions[0]?.effective.revision).toBe(2);
    expect(result.sessions[0]?.displayLocalDate).toBe("2026-03-01");
    expect(f.sourceFacts()).toBe(before);
  });

  it("uses session start for raw/corrected metric display and retains dated target/bodyweight basis", async () => {
    const f = fixture(); f.session("raw", "2026-02-28T16:30:00Z", "2026-02-28");
    f.session("corrected-metric", "2026-02-27T12:00:00Z", "2026-02-27");
    f.overlay("corrected-metric", "2026-02-28T17:00:00Z", "2026-02-28");
    f.db.exec("INSERT INTO portable_owner_identity VALUES (1, 'owner'); INSERT INTO bodyweight_entries VALUES ('weight', 'owner', 1, 'active');");
    f.db.prepare("INSERT INTO bodyweight_entry_events VALUES ('weight', 1, '2026-02-28', 80000, ?)").run(Date.parse("2026-02-28T00:00:00Z"));
    const before = f.sourceFacts();
    const result = await createHistoryRepository(f.kernel, { displayTimeZone: () => "Asia/Singapore" }).loadExerciseMetricHistory({ exerciseId: "squat" });
    const sets = result.segments.flatMap(segment => segment.comparableSets);
    expect(sets).toHaveLength(2);
    expect(sets.every(set => set.localDate === "2026-02-28" && set.displayLocalDate === "2026-03-01")).toBe(true);
    expect(sets.every(set => set.relativeStrength?.basis.localDate === "2026-02-28" && set.targetAtDate?.profile === "load_reps")).toBe(true);
    expect(projectLoadMetricHistorySeries(result.segments[0]!, "relative")?.points.every(point => point.localDate === "2026-03-01" && point.targetAtDate === 0.5)).toBe(true);
    expect(f.sourceFacts()).toBe(before);
  });

  it("adds the removed-session effective display instant without altering the removal timestamp", async () => {
    const f = fixture(); f.session("removed", "2026-02-28T16:30:00Z", "2026-02-28");
    f.overlay("removed", "2026-02-28T17:00:00Z", "2026-02-28", "voided");
    f.db.prepare("INSERT INTO history_audit_events VALUES ('removed', 2, 'void', ?)").run(Date.parse("2026-03-02T01:00:00Z"));
    const before = f.sourceFacts();
    const result = await createHistoryRepository(f.kernel, { displayTimeZone: () => "Asia/Singapore" }).listRemovedSessions();
    expect(result[0]?.localDate).toBe("2026-02-28");
    expect(result[0]?.displayLocalDate).toBe("2026-03-01");
    expect(result[0]?.startedAtMs).toBe(Date.parse("2026-02-28T17:00:00Z"));
    expect(result[0]?.removedAtMs).toBe(Date.parse("2026-03-02T01:00:00Z"));
    expect(f.sourceFacts()).toBe(before);
  });
});
