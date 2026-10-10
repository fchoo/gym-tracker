import type { SqliteKernel } from "../sqliteKernel";
import {
  evaluateRunningReadiness,
  parseRunningPlanAggregate,
  parseRunningGoal,
  parseRunningSessionRevision,
  type RunningPlanAggregate,
  type RunningPlanSession,
  type RunningReadiness,
} from "../../../domains/running/contracts";
import { parseLocalDate, weekdayForLocalDate } from "../../../domains/scheduling/localDate";
import { createScheduleRepository } from "./scheduleRepository";
import type { CreateInactiveRunningPlanInput, SaveRunningSourceGraphInput } from "../../../domains/running/commands";

export type RunningPlanReceipt = Readonly<{
  requestId: string;
  requestSha256: string;
  operation: "create" | "edit" | "copy";
  planId: string;
  expectedPlanRevision: number;
  result: Readonly<Record<string, unknown>>;
  committedAtMs: number;
}>;

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
    async readAggregate(planId: string): Promise<RunningPlanAggregate | null> {
      const [plan] = await kernel.queryAll<{
        id: string;
        name: string;
        revision: number;
        created_at_ms: number;
        is_active: number;
      }>(
        `SELECT plan.id, plan.name, plan.revision, running.created_at_ms, plan.is_active
         FROM plans plan JOIN running_plans running ON running.plan_id = plan.id
         WHERE plan.id = ? AND plan.plan_kind = 'running'`,
        [planId],
      );
      if (plan === undefined) return null;
      const [goalRow] = await kernel.queryAll<{ goal_json: string }>(
        `SELECT goal_json FROM running_goals WHERE plan_id = ?
         ORDER BY revision DESC, created_at_ms DESC, id DESC LIMIT 1`, [planId],
      );
      if (goalRow === undefined) return null;
      const rows = await kernel.queryAll<{
        slot_id: string; slot_root_id: string; weekday: RunningPlanSession["slot"]["weekday"];
        slot_revision: number; ordinal: number; definition_json: string;
      }>(
        `SELECT slot_revision.id AS slot_id, slot_root.id AS slot_root_id, slot_root.weekday,
                slot_revision.revision AS slot_revision, slot_revision.ordinal, session.definition_json
         FROM running_session_slot_roots slot_root
         JOIN running_session_slot_revisions slot_revision
           ON slot_revision.slot_root_id = slot_root.id
          AND slot_revision.revision = (
            SELECT MAX(current_slot.revision) FROM running_session_slot_revisions current_slot
             WHERE current_slot.slot_root_id = slot_root.id
          )
         JOIN running_session_roots session_root ON session_root.id = slot_revision.session_root_id
         JOIN running_session_revisions session
           ON session.id = slot_revision.session_revision_id
          AND session.revision = session_root.current_revision
         WHERE slot_root.plan_id = ?
         ORDER BY slot_root.weekday, slot_revision.ordinal, slot_root.id`, [planId],
      );
      const sessions = rows.map((row) => Object.freeze({
        slot: Object.freeze({ id: row.slot_id, rootId: row.slot_root_id, weekday: row.weekday, revision: row.slot_revision, ordinal: row.ordinal }),
        session: parseRunningSessionRevision(JSON.parse(row.definition_json)),
      }));
      return parseRunningPlanAggregate({
        version: 1, id: plan.id, name: plan.name, revision: plan.revision,
        active: plan.is_active === 1, createdAtMs: plan.created_at_ms,
        goal: parseRunningGoal(JSON.parse(goalRow.goal_json)), sessions,
      });
    },
    async createInactiveAggregate(input: CreateInactiveRunningPlanInput): Promise<RunningPlanAggregate> {
      const aggregate = parseRunningPlanAggregate({ ...input.plan, active: false });
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<{ request_sha256: string; result_json: string }>(
          "SELECT request_sha256, result_json FROM running_plan_receipts WHERE request_id = ?", [input.requestId],
        );
        if (receipt !== undefined) {
          if (receipt.request_sha256 !== input.requestSha256) throw new Error("running_plan_receipt_conflict");
          return parseRunningPlanAggregate((JSON.parse(receipt.result_json) as { aggregate?: unknown }).aggregate);
        }
        const [existing] = await transaction.queryAll<{ id: string }>("SELECT id FROM plans WHERE id = ?", [aggregate.id]);
        if (existing !== undefined) throw new Error("running_plan_revision_conflict");
        await transaction.execute(
          `INSERT INTO plans (id, content_pack_id, origin, source_namespace, upstream_id, name, days_per_week, audience, goal, estimate_minutes, attribution, is_active, revision, plan_kind)
           VALUES (?, NULL, 'custom', NULL, NULL, ?, ?, 'Owner', 'Running', 1, 'Owner-authored', 0, ?, 'running')`,
          [aggregate.id, aggregate.name, Math.max(1, aggregate.goal.trainingDays.length), aggregate.revision],
        );
        await transaction.execute("INSERT INTO plan_days(id, plan_id, ordinal, name, revision) VALUES (?, ?, 0, 'Running schedule anchor', 1)", [
          `${aggregate.id}:anchor`, aggregate.id,
        ]);
        await transaction.execute("INSERT INTO running_plans(plan_id, status, revision, created_at_ms) VALUES (?, 'draft', ?, ?)", [aggregate.id, aggregate.revision, aggregate.createdAtMs]);
        await transaction.execute("INSERT INTO running_goals(id, plan_id, goal_json, revision, created_at_ms) VALUES (?, ?, ?, ?, ?)", [
          aggregate.goal.id, aggregate.id, JSON.stringify(aggregate.goal), aggregate.goal.revision, aggregate.goal.createdAtMs,
        ]);
        for (const { session, slot } of aggregate.sessions) {
          await transaction.execute("INSERT INTO running_session_roots(id, plan_id, session_kind, current_revision, created_at_ms) VALUES (?, ?, ?, ?, ?)", [
            session.rootId, aggregate.id, session.sessionKind, session.revision, session.createdAtMs,
          ]);
          await transaction.execute("INSERT INTO running_session_revisions(id, plan_id, session_kind, revision, definition_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)", [
            session.id, aggregate.id, session.sessionKind, session.revision, JSON.stringify(session), session.createdAtMs,
          ]);
          await transaction.execute("INSERT INTO running_session_slot_roots(id, plan_id, weekday, created_at_ms) VALUES (?, ?, ?, ?)", [
            slot.rootId, aggregate.id, slot.weekday, aggregate.createdAtMs,
          ]);
          await transaction.execute(`INSERT INTO running_session_slot_revisions (id, slot_root_id, revision, ordinal, session_root_id, session_revision_id, created_at_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [slot.id, slot.rootId, slot.revision, slot.ordinal, session.rootId, session.id, aggregate.createdAtMs]);
          await transaction.execute("INSERT INTO running_session_slots(id, plan_id, weekday, ordinal, session_revision_id, revision) VALUES (?, ?, ?, ?, ?, ?)", [
            slot.rootId, aggregate.id, slot.weekday, slot.ordinal, session.id, slot.revision,
          ]);
        }
        await transaction.execute(`INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
           VALUES (?, ?, 'inactive', 1, ?, ?, 'running')`, [
          `${aggregate.id}:schedule`, aggregate.id, aggregate.createdAtMs, aggregate.createdAtMs,
        ]);
        const result = Object.freeze({ aggregate });
        await transaction.execute(`INSERT INTO running_plan_events(id, plan_id, event_type, payload_json, created_at_ms)
           VALUES (?, ?, 'created', ?, ?)`, [`${input.requestId}:event`, aggregate.id, JSON.stringify(result), aggregate.createdAtMs]);
        await transaction.execute(`INSERT INTO running_plan_receipts (request_id, request_sha256, operation, plan_id, expected_plan_revision, result_json, committed_at_ms)
           VALUES (?, ?, 'create', ?, 0, ?, ?)`, [input.requestId, input.requestSha256, aggregate.id, JSON.stringify(result), aggregate.createdAtMs]);
        return aggregate;
      });
    },
    async saveSourceGraph(input: SaveRunningSourceGraphInput): Promise<Readonly<Record<string, unknown>>> {
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<{
          request_sha256: string;
          operation: string;
          plan_id: string;
          expected_plan_revision: number;
          result_json: string;
        }>(
          `SELECT request_sha256, operation, plan_id, expected_plan_revision, result_json
           FROM running_plan_receipts WHERE request_id = ?`,
          [input.requestId],
        );
        if (receipt !== undefined) {
          if (receipt.request_sha256 !== input.requestSha256 || receipt.operation !== input.operation || receipt.plan_id !== input.planId || receipt.expected_plan_revision !== input.expectedPlanRevision) {
            throw new Error("running_plan_receipt_conflict");
          }
          return Object.freeze(JSON.parse(receipt.result_json) as Record<string, unknown>);
        }
        const [plan] = await transaction.queryAll<{ revision: number; plan_kind: string; is_active: number }>(
          "SELECT revision, plan_kind, is_active FROM plans WHERE id = ?",
          [input.planId],
        );
        if (plan === undefined || plan.plan_kind !== "running" || plan.revision !== input.expectedPlanRevision) {
          throw new Error("running_plan_revision_conflict");
        }
        for (const session of input.sessions) {
          const [root] = await transaction.queryAll<{ current_revision: number }>(
            "SELECT current_revision FROM running_session_roots WHERE id = ?", [session.rootId],
          );
          if (root === undefined) {
            await transaction.execute(
              "INSERT INTO running_session_roots(id, plan_id, session_kind, current_revision, created_at_ms) VALUES (?, ?, ?, ?, ?)",
              [session.rootId, input.planId, session.sessionKind, session.revision, session.createdAtMs],
            );
          } else if (session.revision <= root.current_revision) {
            throw new Error("running_session_revision_conflict");
          } else {
            await transaction.execute(
              "UPDATE running_session_roots SET current_revision = ? WHERE id = ? AND current_revision = ?",
              [session.revision, session.rootId, root.current_revision],
            );
          }
          await transaction.execute(
            `INSERT INTO running_session_revisions
              (id, plan_id, session_kind, revision, definition_json, created_at_ms)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [session.id, input.planId, session.sessionKind, session.revision, JSON.stringify(session), session.createdAtMs],
          );
        }
        for (const slot of input.slots) {
          const [root] = await transaction.queryAll<{ id: string }>(
            "SELECT id FROM running_session_slot_roots WHERE id = ?", [slot.rootId],
          );
          if (root === undefined) {
            await transaction.execute(
              "INSERT INTO running_session_slot_roots(id, plan_id, weekday, created_at_ms) VALUES (?, ?, ?, ?)",
              [slot.rootId, input.planId, slot.weekday, input.createdAtMs],
            );
          }
          await transaction.execute(
            `INSERT INTO running_session_slot_revisions
              (id, slot_root_id, revision, ordinal, session_root_id, session_revision_id, created_at_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [slot.id, slot.rootId, slot.revision, slot.ordinal, slot.sessionRootId, slot.sessionRevisionId, input.createdAtMs],
          );
        }
        await transaction.execute(
          "INSERT INTO running_goals(id, plan_id, goal_json, revision, created_at_ms) VALUES (?, ?, ?, ?, ?)",
          [input.goal.id, input.planId, JSON.stringify(input.goal), input.goal.revision, input.goal.createdAtMs],
        );
        const nextRevision = plan.revision + 1;
        const result = Object.freeze({ planId: input.planId, planRevision: nextRevision, active: plan.is_active === 1, sessionRootIds: input.sessions.map((session) => session.rootId), slotRootIds: input.slots.map((slot) => slot.rootId) });
        const changed = await transaction.execute(
          "UPDATE plans SET revision = revision + 1 WHERE id = ? AND revision = ?",
          [input.planId, input.expectedPlanRevision],
        );
        if (changed.changes !== 1) throw new Error("running_plan_revision_conflict");
        await transaction.execute(
          `INSERT INTO running_plan_events(id, plan_id, event_type, payload_json, created_at_ms)
           VALUES (?, ?, ?, ?, ?)`,
          [`${input.requestId}:event`, input.planId, input.operation === "create" ? "created" : input.operation === "copy" ? "copied" : "revised", JSON.stringify(result), input.createdAtMs],
        );
        await transaction.execute(
          `INSERT INTO running_plan_receipts
            (request_id, request_sha256, operation, plan_id, expected_plan_revision, result_json, committed_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [input.requestId, input.requestSha256, input.operation, input.planId, input.expectedPlanRevision, JSON.stringify(result), input.createdAtMs],
        );
        return result;
      });
    },
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
        const recoveryRootId = `${input.recoveryRevisionId}:root`;
        await transaction.execute(
          "INSERT INTO running_session_roots(id, plan_id, session_kind, current_revision, created_at_ms) VALUES (?, ?, 'recovery', 1, ?)",
          [recoveryRootId, input.planId, input.createdAtMs],
        );
        for (const slot of input.slots) await transaction.execute("INSERT INTO running_session_slots(id, plan_id, weekday, ordinal, session_revision_id, revision) VALUES (?, ?, ?, ?, ?, 1)", [slot.id, input.planId, slot.weekday, slot.ordinal, slot.sessionRevisionId]);
        for (const slot of input.slots) {
          await transaction.execute(
            "INSERT INTO running_session_slot_roots(id, plan_id, weekday, created_at_ms) VALUES (?, ?, ?, ?)",
            [slot.id, input.planId, slot.weekday, input.createdAtMs],
          );
          await transaction.execute(
            `INSERT INTO running_session_slot_revisions
              (id, slot_root_id, revision, ordinal, session_root_id, session_revision_id, created_at_ms)
             VALUES (?, ?, 1, ?, ?, ?, ?)`,
            [`${slot.id}:revision:1`, slot.id, slot.ordinal, recoveryRootId, slot.sessionRevisionId, input.createdAtMs],
          );
        }
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
      await createScheduleRepository(kernel).activateRunningSchedule!(input);
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
