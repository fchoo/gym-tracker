import type { SqliteKernel } from "../sqliteKernel";
import { evaluateRunningReadiness, type RunningReadiness } from "../../../domains/running/contracts";
import { parseLocalDate, weekdayForLocalDate } from "../../../domains/scheduling/localDate";
import { createScheduleRepository } from "./scheduleRepository";

export type RunningSlotInput = Readonly<{ id: string; weekday: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday"; ordinal: number; sessionRevisionId: string }>;
export type RunningOpportunity = Readonly<{
  id: string;
  slotId: string;
  ordinal: number;
  localDate: string;
  timezone: string;
}>;

export type CreateInactiveMinimumRunningPlanInput = Readonly<{
  planId: string;
  planName: string;
  anchorDayId: string;
  scheduleId: string;
  scheduleVersionId: string;
  scheduleBindingId: string;
  createdAtMs: number;
  effectiveLocalDate: string;
  timezone: string;
  recoveryRevisionId: string;
  slots: readonly RunningSlotInput[];
}>;

export function createRunningPlanRepository(kernel: SqliteKernel) {
  return Object.freeze({
    async readiness(planId: string): Promise<RunningReadiness> {
      const [revision, slots] = await Promise.all([
        kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM running_session_revisions WHERE plan_id = ? AND session_kind = 'recovery'", [planId]),
        kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM running_session_slots WHERE plan_id = ?", [planId]),
      ]);
      return evaluateRunningReadiness({ hasRecoveryRevision: (revision[0]?.count ?? 0) > 0, slotCount: slots[0]?.count ?? 0 });
    },
    async createInactiveMinimum(input: CreateInactiveMinimumRunningPlanInput): Promise<void> {
      const readiness = evaluateRunningReadiness({ hasRecoveryRevision: true, slotCount: input.slots.length });
      if (!readiness.ready) throw new Error("running_plan_not_ready");
      await kernel.write(async (transaction) => {
        await transaction.execute(
          `INSERT INTO plans
            (id, content_pack_id, origin, source_namespace, upstream_id, name,
             days_per_week, audience, goal, estimate_minutes, attribution,
             is_active, revision, plan_kind)
           VALUES (?, NULL, 'custom', NULL, NULL, ?, 1, 'Owner', 'Running',
             1, 'Owner-authored', 0, 1, 'running')`,
          [input.planId, input.planName],
        );
        await transaction.execute(
          "INSERT INTO plan_days (id, plan_id, ordinal, name, revision) VALUES (?, ?, 0, 'Running schedule anchor', 1)",
          [input.anchorDayId, input.planId],
        );
        await transaction.execute("INSERT INTO running_plans(plan_id, status, revision, created_at_ms) VALUES (?, 'ready', 1, ?)", [input.planId, input.createdAtMs]);
        await transaction.execute("INSERT INTO running_session_revisions(id, plan_id, session_kind, revision, definition_json, created_at_ms) VALUES (?, ?, 'recovery', 1, '{}', ?)", [input.recoveryRevisionId, input.planId, input.createdAtMs]);
        for (const slot of input.slots) await transaction.execute("INSERT INTO running_session_slots(id, plan_id, weekday, ordinal, session_revision_id, revision) VALUES (?, ?, ?, ?, ?, 1)", [slot.id, input.planId, slot.weekday, slot.ordinal, slot.sessionRevisionId]);
        await transaction.execute(
          `INSERT INTO owned_plan_schedules
            (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
           VALUES (?, ?, 'inactive', 1, ?, ?, 'running')`,
          [input.scheduleId, input.planId, input.createdAtMs, input.createdAtMs],
        );
        await transaction.execute(
          `INSERT INTO owned_plan_schedule_versions
            (id, schedule_id, version_number, effective_local_date, mode,
             timezone, rotation_pointer, created_at_ms)
           VALUES (?, ?, 1, ?, 'weekday', ?, NULL, ?)`,
          [input.scheduleVersionId, input.scheduleId, input.effectiveLocalDate, input.timezone, input.createdAtMs],
        );
        await transaction.execute(
          `INSERT INTO owned_plan_schedule_bindings
            (id, schedule_version_id, mode, ordinal, week_index, weekday, plan_day_id)
           VALUES (?, ?, 'weekday', 0, 0, 'Monday', ?)`,
          [input.scheduleBindingId, input.scheduleVersionId, input.anchorDayId],
        );
      });
    },
    async activateMinimum(input: Readonly<{
      planId: string;
      scheduleId: string;
      expectedPlanRevision: number;
      expectedScheduleRevision: number;
      activatedAtMs: number;
    }>): Promise<void> {
      const activateRunningSchedule = createScheduleRepository(kernel).activateRunningSchedule;
      if (activateRunningSchedule === undefined) throw new Error("running_schedule_activation_unavailable");
      await activateRunningSchedule(input);
    },
    async materializeOccurrences(input: Readonly<{
      planId: string;
      scheduleId: string;
      scheduleVersionId: string;
      localDate: string;
      timezone: string;
      createdAtMs: number;
      occurrenceIds: readonly string[];
    }>): Promise<readonly RunningOpportunity[]> {
      return kernel.write(async (transaction) => {
        const [schedule] = await transaction.queryAll<{
          plan_id: string;
          plan_kind: string;
          lifecycle: string;
        }>(
          "SELECT plan_id, plan_kind, lifecycle FROM owned_plan_schedules WHERE id = ?",
          [input.scheduleId],
        );
        if (
          schedule === undefined || schedule.plan_id !== input.planId
          || schedule.plan_kind !== "running" || schedule.lifecycle !== "active"
        ) throw new Error("running_schedule_not_active");
        const weekday = weekdayForLocalDate(parseLocalDate(input.localDate));
        const matchingSlots = await transaction.queryAll<{
          id: string;
          ordinal: number;
          session_revision_id: string;
        }>(
          `SELECT id, ordinal, session_revision_id FROM running_session_slots
           WHERE plan_id = ? AND weekday = ? ORDER BY ordinal, id`,
          [input.planId, weekday],
        );
        if (matchingSlots.length !== input.occurrenceIds.length) throw new Error("running_occurrence_identity_invalid");
        const occurrences: RunningOpportunity[] = [];
        for (const [index, slot] of matchingSlots.entries()) {
          const id = input.occurrenceIds[index]!;
          await transaction.execute(
            `INSERT INTO running_opportunities
              (id, plan_id, schedule_id, schedule_version_id, slot_id, local_date,
               timezone, session_revision_id, state, created_at_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)`,
            [id, input.planId, input.scheduleId, input.scheduleVersionId, slot.id,
              input.localDate, input.timezone, slot.session_revision_id, input.createdAtMs],
          );
          occurrences.push(Object.freeze({ id, slotId: slot.id, ordinal: slot.ordinal, localDate: input.localDate, timezone: input.timezone }));
        }
        return Object.freeze(occurrences);
      });
    },
  });
}
