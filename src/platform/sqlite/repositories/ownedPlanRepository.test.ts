import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  type SqliteKernel,
} from "../sqliteKernel";
import {
  createOwnedPlanRepository,
} from "./ownedPlanRepository";

describe("owned-plan session write-back facts", () => {
  it("returns null when a concurrent read snapshot no longer contains the selected plan day", async () => {
    const plan = {
      id: "plan-owner",
      origin: "custom",
      name: "Owner Plan",
      days_per_week: 1,
      audience: "Owner",
      goal: "Strength",
      estimate_minutes: 30,
      attribution: "Owner-authored",
      is_active: 1,
      revision: 3,
      lifecycle: "ready",
      graph_status: "valid",
      missing_requirement: null,
    };
    const kernel = {
      async write() {
        throw new Error("write_not_expected");
      },
      async queryAll<Row extends Record<string, unknown>>(sql: string) {
        if (sql.includes("FROM workout_sessions session")) {
          return [{
            id: "session-owner",
            plan_id: "plan-owner",
            plan_day_id: "day-owner",
            plan_name: "Owner Plan",
            day_name: "Day A",
            revision: 2,
            source: "scheduled_day",
            status: "completed",
            modified_from_plan: 1,
          }] as unknown as readonly Row[];
        }
        if (sql.includes("FROM plans plan")) {
          return [plan] as unknown as readonly Row[];
        }
        if (sql.includes("FROM plan_days") && sql.includes("WHERE id = ?")) {
          return [{ id: "day-owner", name: "Day A" }] as unknown as readonly Row[];
        }
        if (sql.includes("COUNT(*) AS count")) {
          return [{ count: 0 }] as unknown as readonly Row[];
        }
        return [] as readonly Row[];
      },
      async connectionConfiguration() {
        throw new Error("configuration_not_expected");
      },
      async close() {},
    } as SqliteKernel;

    await expect(createOwnedPlanRepository(kernel).readSessionExerciseEditsForPlan({
      sessionId: "session-owner",
    })).resolves.toBeNull();
  });

  it("rejects a bundled plan before reconstructing write-back facts", async () => {
    const kernel = {
      async write() {
        throw new Error("write_not_expected");
      },
      async queryAll<Row extends Record<string, unknown>>(sql: string) {
        if (sql.includes("FROM workout_sessions session")) {
          return [{
            id: "session-bundled",
            plan_id: "plan-bundled",
            plan_day_id: "day-bundled",
            plan_name: "Bundled Plan",
            day_name: "Bundled Day",
            revision: 1,
            source: "scheduled_day",
            status: "completed",
            modified_from_plan: 0,
          }] as unknown as readonly Row[];
        }
        if (sql.includes("FROM plans plan")) {
          return [{
            id: "plan-bundled",
            origin: "bundled",
            name: "Bundled Plan",
            days_per_week: 1,
            audience: "Unspecified",
            goal: "Unspecified",
            estimate_minutes: 30,
            attribution: "Fixture",
            is_active: 0,
            revision: 1,
            lifecycle: "ready",
            graph_status: "valid",
            missing_requirement: null,
          }] as unknown as readonly Row[];
        }
        return [] as readonly Row[];
      },
      async connectionConfiguration() {
        throw new Error("configuration_not_expected");
      },
      async close() {},
    } as SqliteKernel;

    await expect(createOwnedPlanRepository(kernel).readSessionExerciseEditsForPlan({
      sessionId: "session-bundled",
    })).resolves.toBeNull();
  });
});
