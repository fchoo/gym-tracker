import { describe, expect, it, jest } from "@jest/globals";

import { createTrainingCalendarRepository } from "../../src/platform/sqlite/repositories/trainingCalendarRepository";
import type { SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

describe("training calendar repository", () => {
  it("returns bounded, separately addressable source events without mutating source facts", async () => {
    const queryAll = jest.fn(async (sql: string, _parameters?: readonly unknown[]) => {
      if (sql.includes("owned_plan_schedule_opportunities")) return [{
        id: "strength-occurrence", schedule_id: "strength-schedule", schedule_version_id: "strength-v1",
        plan_id: "strength-plan", local_date: "2026-11-01", timezone: "America/New_York",
        revision: 2, state: "pending", outcome: null,
      }];
      if (sql.includes("running_opportunities")) return [{
        id: "running-slot-a", schedule_id: "running-schedule", schedule_version_id: "running-v2",
        plan_id: "running-plan", slot_id: "slot-a", session_revision_id: "revision-a",
        local_date: "2026-11-01", timezone: "Australia/Sydney", state: "planned",
      }, {
        id: "running-slot-b", schedule_id: "running-schedule", schedule_version_id: "running-v2",
        plan_id: "running-plan", slot_id: "slot-b", session_revision_id: "revision-b",
        local_date: "2026-11-01", timezone: "Australia/Sydney", state: "planned",
      }];
      return [{
        id: "imported-run", started_at_ms: 1_793_491_200_000,
        aggregate_json: JSON.stringify({ confirmed_local_date: "2026-11-01", normalized: { sport: "running" } }),
      }];
    });
    const kernel = { queryAll } as unknown as SqliteKernel;

    const result = await createTrainingCalendarRepository(kernel).loadRange({
      startLocalDate: "2026-11-01",
      endLocalDateExclusive: "2026-11-02",
    });

    expect(result.events.map((event) => event.id)).toEqual([
      "strength-occurrence", "running-slot-a", "running-slot-b", "imported-run",
    ]);
    expect(result.events.map((event) => event.source)).toEqual([
      "strength", "running", "running", "imported_activity",
    ]);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(queryAll).toHaveBeenCalledTimes(3);
    expect(queryAll.mock.calls.every(([, parameters]) => Array.isArray(parameters))).toBe(true);
  });
});
