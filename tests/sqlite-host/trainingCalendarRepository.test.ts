import { describe, expect, it, jest } from "@jest/globals";

import { createTrainingCalendarRepository } from "../../src/platform/sqlite/repositories/trainingCalendarRepository";
import type { SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

function runningDefinition(
  id: string,
  planId: string,
  kind: "long_run" | "recovery" | "tempo",
): string {
  return JSON.stringify({
    version: 1,
    id,
    rootId: `${id}-root`,
    planId,
    sessionKind: kind,
    revision: 1,
    createdAtMs: 1,
    phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }],
    advisoryTarget: { rpe: 4 },
    contextual: kind === "long_run" ? { finish: "easy_throughout" }
      : kind === "tempo" ? { format: "continuous", work: { durationMs: 60_000 } } : {},
  });
}

function plannedStrengthSnapshot(input: Readonly<{
  occurrenceId: string;
  opportunityRevision: number;
  targetCount: number;
  dayName?: string;
}>): string {
  return JSON.stringify({
    occurrenceId: input.occurrenceId,
    planId: "strength-plan",
    planName: "Full body progression, week 12",
    planDayId: "strength-day",
    dayName: input.dayName ?? "Full body A",
    scheduleId: "strength-schedule",
    scheduleVersionId: "strength-v1",
    localDate: "2026-11-01",
    timezone: "America/New_York",
    sourceRevisions: { plan: 1, day: 1, schedule: 1, opportunity: input.opportunityRevision },
    exercises: [{
      id: "strength-exercise",
      exerciseId: "squat",
      exerciseName: "Squat",
      ordinal: 0,
      targets: Array.from({ length: input.targetCount }, (_, ordinal) => ({
        id: `target-${ordinal}`,
        ordinal,
        targetJson: JSON.stringify({ version: 1, profile: "load_reps", loadGrams: 50_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false }),
        unitJson: "{}",
        previousObservationJson: null,
      })),
    }],
  });
}

describe("training calendar repository", () => {
  it("projects all durable calendar destinations with full source facts from one bounded snapshot", async () => {
    const queryAll = jest.fn(async (sql: string, _parameters?: readonly unknown[]) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [
        {
          id: "strength-planned", schedule_id: "strength-schedule", schedule_version_id: "strength-v1",
          plan_id: "strength-plan", plan_name: "Full body progression, week 12", local_date: "2026-11-01",
          timezone: "America/New_York", revision: 2, state: "pending", outcome: null,
          plan_active: 1, plan_revision: 1, plan_day_id: "strength-day", plan_day_name: "Full body A", day_revision: 1,
          schedule_lifecycle: "active", schedule_revision: 1,
          session_id: null, session_status: null, snapshot_json: null, planned_snapshot_json: plannedStrengthSnapshot({ occurrenceId: "strength-planned", opportunityRevision: 2, targetCount: 3 }),
          completed_working_sets: 0, planned_working_sets: 0, planned_target_sets: 3,
        },
        {
          id: "strength-completed", schedule_id: "strength-schedule", schedule_version_id: "strength-v1",
          plan_id: "strength-plan", plan_name: "Full body progression, week 12", local_date: "2026-11-01",
          timezone: "America/New_York", revision: 3, state: "consumed", outcome: "completed",
          plan_day_id: "strength-day", plan_day_name: "Full body A", schedule_lifecycle: "active",
          session_id: "completed-session", session_status: "completed", snapshot_json: null,
          completed_working_sets: 3, planned_working_sets: 3, planned_target_sets: 3,
        },
        {
          id: "strength-partial", schedule_id: "strength-schedule", schedule_version_id: "strength-v1",
          plan_id: "strength-plan", plan_name: "Full body progression, week 12", local_date: "2026-11-01",
          timezone: "America/New_York", revision: 4, state: "consumed", outcome: "completed",
          plan_day_id: "strength-day", plan_day_name: "Full body A", schedule_lifecycle: "active",
          session_id: "partial-session", session_status: "partial", snapshot_json: null,
          completed_working_sets: 2, planned_working_sets: 3, planned_target_sets: 3,
        },
      ];
      if (sql.includes("FROM running_opportunities opportunity")) return [{
        id: "running-slot", schedule_id: "running-schedule", schedule_version_id: "running-v2",
        plan_id: "running-plan", plan_name: "Autumn half marathon build", slot_id: "slot-a",
        session_revision_id: "running-session-revision", session_kind: "long_run",
        definition_json: runningDefinition("running-session-revision", "running-plan", "long_run"),
        local_date: "2026-11-01", timezone: "Australia/Sydney", state: "planned",
      }];
      return [{
        id: "imported-run", source: "garmin_connect_account:owner-a", source_kind: "garmin_connect_account",
        account_namespace: "owner-a", external_activity_id: "external-1", started_at_ms: 1_793_491_200_000,
        aggregate_json: JSON.stringify({
          confirmed_local_date: "2026-11-01",
          normalized: { sport: "running", subtype: "outdoor", source_time_zone: "Europe/London", distance_meters: 5_000, elapsed_ms: 1_560_000 },
        }),
        opportunity_id: null,
        matched_schedule_id: null, matched_schedule_version_id: null,
        matched_plan_id: null, matched_slot_id: null,
      }];
    });
    const kernel = { queryAll } as unknown as SqliteKernel;

    const result = await createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "strength-planned", title: "Full body A", displaySummary: "Full body A · 3 working sets planned", sourceLabel: "Strength",
        sport: "strength", status: "planned", localDate: "2026-11-01", timeZone: "America/New_York",
        destination: { kind: "occurrence", occurrenceId: "strength-planned" },
      }),
      expect.objectContaining({
        id: "strength-completed", title: "Full body A", displaySummary: "3 of 3 working sets completed", sport: "strength", status: "completed",
        destination: { kind: "session", sessionId: "completed-session" },
      }),
      expect.objectContaining({
        id: "strength-partial", title: "Full body A", displaySummary: "2 of 3 working sets completed", sport: "strength", status: "partial",
        destination: { kind: "session", sessionId: "partial-session" },
      }),
      expect.objectContaining({
        id: "running-slot", title: "Autumn half marathon build", sourceLabel: "Long run",
        sport: "running", status: "planned", localDate: "2026-11-01", timeZone: "Australia/Sydney",
        destination: { kind: "plan", planId: "running-plan", sessionId: "running-session-revision" },
      }),
      expect.objectContaining({
        id: "imported-run", title: "Outdoor run", sourceLabel: "Garmin",
        sourceIdentity: { sourceKind: "garmin_connect_account", accountNamespace: "owner-a", externalActivityId: "external-1" },
        sport: "running", status: "imported", localDate: "2026-11-01", timeZone: "Europe/London",
        destination: { kind: "activity", activityId: "imported-run" },
      }),
    ]));
    expect(Object.isFrozen(result.events)).toBe(true);
    for (const event of result.events) {
      expect(Object.isFrozen(event)).toBe(true);
      expect(Object.isFrozen((event as unknown as { destination: unknown }).destination)).toBe(true);
    }
    expect(queryAll).toHaveBeenCalledTimes(3);
    expect(queryAll.mock.calls.every(([, parameters]) => Array.isArray(parameters))).toBe(true);
  });

  it("overlays a current imported activity onto its matched Running slot without duplication", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [];
      if (sql.includes("FROM running_opportunities opportunity")) return [{
        id: "running-slot-a", schedule_id: "running-schedule", schedule_version_id: "running-v2",
        plan_id: "running-plan", plan_name: "Autumn half marathon build", slot_id: "slot-a",
        session_revision_id: "revision-a", session_kind: "recovery",
        definition_json: runningDefinition("revision-a", "running-plan", "recovery"),
        local_date: "2026-11-01", timezone: "Australia/Sydney", state: "planned",
      }, {
        id: "running-slot-b", schedule_id: "running-schedule", schedule_version_id: "running-v2",
        plan_id: "running-plan", plan_name: "Autumn half marathon build", slot_id: "slot-b",
        session_revision_id: "revision-b", session_kind: "tempo",
        definition_json: runningDefinition("revision-b", "running-plan", "tempo"),
        local_date: "2026-11-01", timezone: "Australia/Sydney", state: "planned",
      }];
      return [{
        id: "imported-run", source: "garmin_connect_account:owner-a", source_kind: "garmin_connect_account",
        account_namespace: "owner-a", external_activity_id: "external-1", started_at_ms: 1_793_491_200_000,
        aggregate_json: JSON.stringify({
          confirmed_local_date: "2026-11-01",
          normalized: { sport: "running", subtype: "treadmill", source_time_zone: "Australia/Sydney", distance_meters: 5_000, elapsed_ms: 1_560_000 },
        }),
        opportunity_id: "running-slot-a",
        matched_schedule_id: "running-schedule", matched_schedule_version_id: "running-v2",
        matched_plan_id: "running-plan", matched_slot_id: "slot-a",
      }];
    });
    const kernel = { queryAll } as unknown as SqliteKernel;

    const result = await createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "imported-run", title: "Treadmill run", sourceLabel: "Garmin",
        sourceIdentity: { sourceKind: "garmin_connect_account", accountNamespace: "owner-a", externalActivityId: "external-1" },
        status: "matched", scheduleId: "running-schedule", scheduleVersionId: "running-v2",
        planId: "running-plan", slotId: "slot-a", destination: { kind: "activity", activityId: "imported-run" },
      }),
      expect.objectContaining({ id: "running-slot-b", destination: { kind: "plan", planId: "running-plan", sessionId: "revision-b" } }),
    ]));
    expect(result.events.some(({ id }) => id === "running-slot-a")).toBe(false);
    expect(result.events).toHaveLength(2);
  });

  it("fails closed when a completed Strength opportunity lacks a durable session identity", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [{
        id: "stale-completed-strength", schedule_id: "strength-schedule", schedule_version_id: "strength-v1",
        plan_id: "strength-plan", plan_name: "Strength plan", local_date: "2026-11-01", timezone: "America/New_York",
        plan_day_id: "strength-day", plan_day_name: "Strength day", schedule_lifecycle: "active",
        revision: 2, state: "consumed", outcome: "completed", session_id: null, session_status: null,
        snapshot_json: null, completed_working_sets: 0, planned_working_sets: 0, planned_target_sets: 1,
      }];
      if (sql.includes("FROM running_opportunities opportunity")) return [];
      return [{
        id: "stale-imported-run", source: "garmin_connect_account:owner-a", source_kind: "garmin_connect_account",
        account_namespace: "owner-a", external_activity_id: "external-stale", started_at_ms: 1,
        aggregate_json: JSON.stringify({
          confirmed_local_date: "2026-11-01",
          normalized: { sport: "running", subtype: "outdoor", source_time_zone: "America/New_York", distance_meters: 5_000 },
        }),
        opportunity_id: "missing-running-opportunity",
        matched_schedule_id: null, matched_schedule_version_id: null,
        matched_plan_id: null, matched_slot_id: null,
      }];
    });
    const kernel = { queryAll } as unknown as SqliteKernel;

    await expect(createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    })).resolves.toEqual({
      events: [expect.objectContaining({
        id: "stale-imported-run",
        status: "imported",
        scheduleId: null,
      })],
      days: [{ localDate: "2026-11-01", kind: "events", restSummary: null }],
    });
  });

  it("uses snapshot reads, rejects inverted bounds, and refuses malformed imported dates", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [];
      if (sql.includes("FROM running_opportunities opportunity")) return [];
      return [{
        id: "malformed-import", source: "garmin", source_kind: "garmin_connect_account",
        account_namespace: "owner-a", external_activity_id: "external-malformed", started_at_ms: 1,
        aggregate_json: "not-json", opportunity_id: "missing-opportunity",
      }, {
        id: "non-date-import", source: "garmin", source_kind: "garmin_connect_account",
        account_namespace: "owner-a", external_activity_id: "external-non-date", started_at_ms: 2,
        aggregate_json: JSON.stringify({ confirmed_local_date: 3 }), opportunity_id: null,
      }];
    });
    const readSnapshot = jest.fn(async (read: (reader: { queryAll: typeof queryAll }) => Promise<unknown>) => read({ queryAll }));
    const kernel = { queryAll, readSnapshot } as unknown as SqliteKernel;
    const repository = createTrainingCalendarRepository(kernel);

    await expect(repository.loadRange({
      startLocalDate: "2026-11-02",
      endLocalDateExclusive: "2026-11-01",
    })).rejects.toThrow("training_calendar_range_invalid");
    await expect(repository.loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    })).resolves.toEqual({
      events: [],
      days: [{ localDate: "2026-11-01", kind: "empty", restSummary: null }],
    });
    expect(readSnapshot).toHaveBeenCalledTimes(1);
  });

  it("fails the whole projection when an effective history snapshot is malformed", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [{
        id: "bad-overlay", schedule_id: "schedule", schedule_version_id: "version", plan_id: "plan",
        plan_name: "Plan", plan_day_id: "day", plan_day_name: "Day", schedule_lifecycle: "active",
        local_date: "2026-11-01", timezone: "UTC", revision: 1, state: "consumed", outcome: "completed",
        session_id: "session", session_status: "completed", snapshot_json: "not-json",
        completed_working_sets: 1, planned_working_sets: 1, planned_target_sets: 1,
      }];
      return [];
    });

    await expect(createTrainingCalendarRepository({ queryAll } as unknown as SqliteKernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    })).rejects.toThrow("training_calendar_effective_snapshot_invalid");
  });

  it("fails closed across malformed source rows while covering factual fallbacks", async () => {
    const snapshot = (sessionId: string, planName: string | null, dayName: string | null) => JSON.stringify({
      version: 1,
      session: {
        id: sessionId, source: "scheduled_day", status: "completed", planId: "plan", planDayId: "day",
        planName, dayName, localDate: "2026-11-01", timezone: "UTC", startedAtMs: 1, completedAtMs: 2, ownerNote: null,
      },
      exercises: [],
    });
    const baseStrength = {
      schedule_id: "schedule", schedule_version_id: "version", plan_id: "plan", plan_name: "Plan",
      plan_active: 1, plan_revision: 1, plan_day_id: "day", plan_day_name: "Day", day_revision: 1,
      schedule_lifecycle: "active", schedule_revision: 1, local_date: "2026-11-01",
      timezone: "UTC", revision: 1, state: "pending", outcome: null, session_id: null, session_status: null,
      snapshot_json: null, planned_snapshot_json: null, completed_working_sets: 0, planned_working_sets: 1, planned_target_sets: 1,
    } as const;
    const baseRunning = {
      schedule_id: "running-schedule", schedule_version_id: "running-version", plan_id: "running-plan",
      plan_name: "Running", slot_id: "slot", session_revision_id: "revision", session_kind: "recovery",
      definition_json: runningDefinition("revision", "running-plan", "recovery"),
      local_date: "2026-11-01", timezone: "UTC", state: "planned",
    } as const;
    const imported = (id: string, overrides: Readonly<Record<string, unknown>>) => ({
      id, source_kind: "garmin_connect_account", account_namespace: "owner", external_activity_id: `external-${id}`,
      started_at_ms: 1, opportunity_id: null,
      aggregate_json: JSON.stringify({ confirmed_local_date: "2026-11-01", normalized: { sport: "running", subtype: "outdoor", distance_meters: 999 } }),
      ...overrides,
    });
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [
        { ...baseStrength, id: "blank-plan", plan_name: " " },
        { ...baseStrength, id: "inactive", schedule_lifecycle: "inactive" },
        { ...baseStrength, id: "raw-single", plan_day_name: null, state: "consumed", outcome: "completed", session_id: "raw-session", session_status: "completed", completed_working_sets: 1 },
        { ...baseStrength, id: "mismatch", state: "consumed", outcome: "completed", session_id: "expected-session", session_status: "completed", snapshot_json: snapshot("other-session", "Corrected", "Corrected day") },
        { ...baseStrength, id: "overlay-plan", state: "consumed", outcome: "completed", session_id: "overlay-plan", session_status: "completed", snapshot_json: snapshot("overlay-plan", "Corrected plan", null) },
        { ...baseStrength, id: "overlay-source", state: "consumed", outcome: "completed", session_id: "overlay-source", session_status: "completed", snapshot_json: snapshot("overlay-source", null, null) },
        { ...baseStrength, id: "planned-fallback", plan_day_name: null },
        { ...baseStrength, id: "snapshot-mismatch", planned_snapshot_json: plannedStrengthSnapshot({ occurrenceId: "another-occurrence", opportunityRevision: 1, targetCount: 1 }) },
      ];
      if (sql.includes("FROM running_opportunities opportunity")) return [
        { ...baseRunning, id: "fulfilled", state: "fulfilled" },
        { ...baseRunning, id: "blank-running-plan", plan_name: " " },
        { ...baseRunning, id: "blank-running-revision", session_revision_id: " " },
        { ...baseRunning, id: "blank-running-kind", session_kind: "__", definition_json: "{}" },
        { ...baseRunning, id: "identity-mismatch", definition_json: runningDefinition("another-revision", "running-plan", "recovery") },
        { ...baseRunning, id: "invalid-running-json", definition_json: "{" },
      ];
      return [
        imported("small-distance", {}),
        imported("blank-subtype", { aggregate_json: JSON.stringify({ confirmed_local_date: "2026-11-01", normalized: { sport: "running", subtype: "__", distance_meters: 5_000 } }) }),
        imported("bad-source-kind", { source_kind: "manual" }),
        imported("blank-account", { account_namespace: " " }),
        imported("blank-external", { external_activity_id: " " }),
      ];
    });

    const result = await createTrainingCalendarRepository({ queryAll } as unknown as SqliteKernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    });

    expect(result.events.map(({ id }) => id)).toEqual([
      "raw-single", "overlay-plan", "overlay-source", "small-distance",
    ]);
    expect(result.events.map(({ title }) => title)).toEqual([
      "Plan", "Corrected plan", "Plan", "Outdoor run",
    ]);
    expect(result.events.at(-1)?.displaySummary).toBe("999 m");
  });
});
