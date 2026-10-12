import { describe, expect, it, jest } from "@jest/globals";

import { createTrainingCalendarRepository } from "../../src/platform/sqlite/repositories/trainingCalendarRepository";
import type { SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

describe("training calendar repository", () => {
  it("projects all durable calendar destinations with full source facts from one bounded snapshot", async () => {
    const queryAll = jest.fn(async (sql: string, _parameters?: readonly unknown[]) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [
        {
          id: "strength-planned", schedule_id: "strength-schedule", schedule_version_id: "strength-v1",
          plan_id: "strength-plan", plan_name: "Full body progression, week 12", local_date: "2026-11-01",
          timezone: "America/New_York", revision: 2, state: "pending", outcome: null,
          plan_day_id: "strength-day", plan_day_name: "Full body A", schedule_lifecycle: "active",
          session_id: null, session_status: null, snapshot_json: null,
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
      if (sql.includes("running_opportunities")) return [{
        id: "running-slot", schedule_id: "running-schedule", schedule_version_id: "running-v2",
        plan_id: "running-plan", plan_name: "Autumn half marathon build", slot_id: "slot-a",
        session_revision_id: "running-session-revision", session_kind: "long_run",
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
      if (sql.includes("running_opportunities")) return [{
        id: "running-slot-a", schedule_id: "running-schedule", schedule_version_id: "running-v2",
        plan_id: "running-plan", plan_name: "Autumn half marathon build", slot_id: "slot-a",
        session_revision_id: "revision-a", session_kind: "recovery",
        local_date: "2026-11-01", timezone: "Australia/Sydney", state: "planned",
      }, {
        id: "running-slot-b", schedule_id: "running-schedule", schedule_version_id: "running-v2",
        plan_id: "running-plan", plan_name: "Autumn half marathon build", slot_id: "slot-b",
        session_revision_id: "revision-b", session_kind: "tempo",
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
      if (sql.includes("running_opportunities")) return [];
      return [{
        id: "stale-imported-run", source: "garmin_connect_account:owner-a", source_kind: "garmin_connect_account",
        account_namespace: "owner-a", external_activity_id: "external-stale", started_at_ms: 1,
        aggregate_json: JSON.stringify({
          confirmed_local_date: "2026-11-01",
          normalized: { sport: "running", subtype: "outdoor", source_time_zone: "America/New_York", distance_meters: 5_000 },
        }),
        opportunity_id: "missing-running-opportunity",
      }];
    });
    const kernel = { queryAll } as unknown as SqliteKernel;

    await expect(createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    })).resolves.toEqual({
      events: [],
      days: [{ localDate: "2026-11-01", kind: "empty", restSummary: null }],
    });
  });

  it("uses snapshot reads, rejects inverted bounds, and refuses malformed imported dates", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [];
      if (sql.includes("running_opportunities")) return [];
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
});
