import { describe, expect, it, jest } from "@jest/globals";

import { createProgressRepository } from "./progressRepository";
import type { SqliteKernel } from "../sqliteKernel";

describe("progress repository factual source reads", () => {
  it("returns source-linked Running, goal, and current bodyweight facts without inventing zeroes", async () => {
    const queryAll = jest.fn(async (sql: string) => {
      if (sql.includes("FROM imported_activities activity")) return [{
        id: "activity-1", started_at_ms: 1_793_491_200_000,
        aggregate_json: JSON.stringify({ confirmed_local_date: "2026-11-01", normalized: { distance_meters: 5_000, duration_ms: 1_500_000 } }),
        opportunity_id: "opportunity-1",
      }];
      if (sql.includes("FROM running_goals")) return [{
        id: "goal-1", plan_id: "plan-1", revision: 1,
        goal_json: JSON.stringify({ version: 1, id: "goal-1", planId: "plan-1", revision: 1, goalDistanceMeters: 5_000, trainingDays: ["Monday"], createdAtMs: 1 }),
      }];
      if (sql.includes("FROM bodyweight_entries entry")) return [{
        id: "bodyweight-1", owner_id: "owner-1", current_revision: 2,
        local_date: "2026-11-01", timezone: "Asia/Singapore", grams: 72_100,
      }];
      return [];
    });
    const kernel = { queryAll } as unknown as SqliteKernel;

    const result = await createProgressRepository(kernel).load({
      period: "week",
      nowLocalDate: "2026-11-02",
    });

    expect(result).toMatchObject({
      freshness: "current",
      sourceFacts: {
        running: {
          kind: "available",
          activities: [{ id: "activity-1", opportunityId: "opportunity-1", distanceMeters: 5_000, durationMs: 1_500_000 }],
          goals: [{ id: "goal-1", planId: "plan-1" }],
        },
        bodyweight: {
          kind: "available",
          entries: [{ id: "bodyweight-1", grams: 72_100 }],
        },
      },
    });
    expect(queryAll.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE/u.test(sql as string))).toHaveLength(0);
  });
});
