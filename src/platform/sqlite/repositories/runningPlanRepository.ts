import type { SqliteKernel, SqliteReadTransactionExecutor, SqliteTransactionExecutor } from "../sqliteKernel";
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
import { runningLifecycleToken, type RunningLifecycleAction, type RunningLifecyclePreview } from "../../../domains/running/lifecycle";

export type RunningPlanReceipt = Readonly<{
  requestId: string;
  requestSha256: string;
  operation: "create" | "edit" | "copy" | "activate" | "archive" | "reactivate";
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

export type ConfirmRunningLifecycleInput = Readonly<{
  action: RunningLifecycleAction;
  requestId: string;
  requestSha256: string;
  confirmationToken: string;
  preview: RunningLifecyclePreview;
  committedAtMs: number;
}>;

function lifecycleFromFacts(status: string, isActive: number): RunningPlanAggregate["lifecycle"] {
  if (status === "retired") return "archived";
  return isActive === 1 ? "active" : "inactive";
}

/**
 * Read the readiness facts from the current membership, not the historical
 * `running_plans.status` cache. A slot can be retired by a complete graph save
 * while its old session revision remains deliberately retained for history.
 */
async function readRunningReadiness(
  executor: SqliteReadTransactionExecutor,
  planId: string,
): Promise<RunningReadiness> {
  const [recovery, slots] = await Promise.all([
    executor.queryAll<{ count: number }>(`SELECT COUNT(*) AS count
      FROM running_session_slots slot
      JOIN running_session_roots root ON root.id = (
        SELECT slot_revision.session_root_id
        FROM running_session_slot_revisions slot_revision
        WHERE slot_revision.slot_root_id = slot.id
          AND slot_revision.session_revision_id = slot.session_revision_id
        ORDER BY slot_revision.revision DESC
        LIMIT 1
      )
      JOIN running_session_revisions revision
        ON revision.id = slot.session_revision_id
       AND revision.revision = root.current_revision
      WHERE slot.plan_id = ? AND slot.retired_at_ms IS NULL
        AND revision.session_kind = 'recovery'`, [planId]),
    executor.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM running_session_slots WHERE plan_id = ? AND retired_at_ms IS NULL",
      [planId],
    ),
  ]);
  return evaluateRunningReadiness({
    hasRecoveryRevision: (recovery[0]?.count ?? 0) > 0,
    slotCount: slots[0]?.count ?? 0,
  });
}

async function readRunningLifecyclePreview(
  executor: SqliteReadTransactionExecutor,
  planId: string,
  action: RunningLifecycleAction,
): Promise<RunningLifecyclePreview> {
  const [target] = await executor.queryAll<{
    plan_id: string; plan_name: string; plan_revision: number; plan_active: number;
    running_status: string; schedule_id: string; schedule_revision: number;
  }>(
    `SELECT plan.id AS plan_id, plan.name AS plan_name, plan.revision AS plan_revision,
            plan.is_active AS plan_active, running.status AS running_status,
            schedule.id AS schedule_id, schedule.revision AS schedule_revision
       FROM plans plan
       JOIN running_plans running ON running.plan_id = plan.id
       JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
      WHERE plan.id = ? AND plan.plan_kind = 'running'`,
    [planId],
  );
  if (target === undefined) throw new Error("running_lifecycle_plan_missing");
  const activeRows = await executor.queryAll<{
    plan_id: string; plan_name: string; plan_revision: number; schedule_id: string; schedule_revision: number;
  }>(
    `SELECT plan.id AS plan_id, plan.name AS plan_name, plan.revision AS plan_revision,
            schedule.id AS schedule_id, schedule.revision AS schedule_revision
       FROM plans plan JOIN owned_plan_schedules schedule ON schedule.plan_id = plan.id
      WHERE plan.plan_kind = 'running' AND plan.is_active = 1 AND schedule.lifecycle = 'active'
      ORDER BY plan.id`,
  );
  if (activeRows.length > 1) throw new Error("running_lifecycle_active_state_invalid");
  const [workout] = await executor.queryAll<{ count: number }>(
    "SELECT COUNT(*) AS count FROM workout_sessions WHERE status = 'in_progress'",
  );
  const lifecycle = lifecycleFromFacts(target.running_status, target.plan_active);
  const readiness = action === "activate"
    ? await readRunningReadiness(executor, planId)
    : null;
  if (
    (action === "activate" && (lifecycle !== "inactive" || !readiness?.ready))
    || (action === "archive" && lifecycle === "archived")
    || (action === "reactivate" && lifecycle !== "archived")
  ) throw new Error("running_lifecycle_action_invalid");
  const facts = {
    action,
    planId: target.plan_id,
    planName: target.plan_name,
    expectedPlanRevision: target.plan_revision,
    expectedScheduleRevision: target.schedule_revision,
    lifecycle,
    activeWorkout: (workout?.count ?? 0) > 0,
    activeRunning: activeRows[0] === undefined ? null : Object.freeze({
      planId: activeRows[0].plan_id,
      planName: activeRows[0].plan_name,
      planRevision: activeRows[0].plan_revision,
      scheduleId: activeRows[0].schedule_id,
      scheduleRevision: activeRows[0].schedule_revision,
    }),
  } as const;
  return Object.freeze({ ...facts, confirmationToken: runningLifecycleToken(facts) });
}

async function assertRunningActivePair(transaction: SqliteTransactionExecutor): Promise<void> {
  const rows = await transaction.queryAll<{ plan_id: string; schedule_id: string }>(
    `SELECT plan.id AS plan_id, schedule.id AS schedule_id
       FROM plans plan LEFT JOIN owned_plan_schedules schedule
         ON schedule.plan_id = plan.id AND schedule.lifecycle = 'active'
      WHERE plan.plan_kind = 'running' AND plan.is_active = 1`,
  );
  if (rows.length > 1 || rows.some((row) => !row.schedule_id)) {
    throw new Error("running_lifecycle_active_state_invalid");
  }
}

export function createRunningPlanRepository(kernel: SqliteKernel) {
  return Object.freeze({
    async readAggregate(planId: string): Promise<RunningPlanAggregate | null> {
      const [plan] = await kernel.queryAll<{
        id: string;
        name: string;
        revision: number;
        created_at_ms: number;
        is_active: number;
        status: string;
      }>(
        `SELECT plan.id, plan.name, plan.revision, running.created_at_ms, plan.is_active, running.status
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
         JOIN running_session_slots current_slot
           ON current_slot.id = slot_root.id
          AND current_slot.plan_id = slot_root.plan_id
          AND current_slot.retired_at_ms IS NULL
         WHERE slot_root.plan_id = ?
         ORDER BY slot_root.weekday, slot_revision.ordinal, slot_root.id`, [planId],
      );
      const sessions = rows.map((row) => Object.freeze({
        slot: Object.freeze({ id: row.slot_id, rootId: row.slot_root_id, weekday: row.weekday, revision: row.slot_revision, ordinal: row.ordinal }),
        session: parseRunningSessionRevision(JSON.parse(row.definition_json)),
      }));
      return parseRunningPlanAggregate({
        version: 1, id: plan.id, name: plan.name, revision: plan.revision,
        active: plan.is_active === 1,
        lifecycle: lifecycleFromFacts(plan.status, plan.is_active),
        createdAtMs: plan.created_at_ms,
        goal: parseRunningGoal(JSON.parse(goalRow.goal_json)), sessions,
      });
    },
    async previewLifecycle(planId: string, action: RunningLifecycleAction): Promise<RunningLifecyclePreview> {
      return kernel.readSnapshot === undefined
        ? readRunningLifecyclePreview(kernel, planId, action)
        : kernel.readSnapshot((transaction) => readRunningLifecyclePreview(transaction, planId, action));
    },
    async confirmLifecycle(input: ConfirmRunningLifecycleInput): Promise<Readonly<{ planId: string; lifecycle: RunningPlanAggregate["lifecycle"] }>> {
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<{
          request_sha256: string; operation: string; result_json: string;
        }>("SELECT request_sha256, operation, result_json FROM running_plan_receipts WHERE request_id = ?", [input.requestId]);
        if (receipt !== undefined) {
          if (receipt.request_sha256 !== input.requestSha256 || receipt.operation !== input.action) {
            throw new Error("running_lifecycle_receipt_conflict");
          }
          return Object.freeze(JSON.parse(receipt.result_json) as { planId: string; lifecycle: RunningPlanAggregate["lifecycle"] });
        }
        const expectedToken = runningLifecycleToken({
          action: input.preview.action, planId: input.preview.planId, planName: input.preview.planName,
          expectedPlanRevision: input.preview.expectedPlanRevision,
          expectedScheduleRevision: input.preview.expectedScheduleRevision,
          lifecycle: input.preview.lifecycle, activeWorkout: input.preview.activeWorkout,
          activeRunning: input.preview.activeRunning,
        });
        if (input.action !== input.preview.action || input.confirmationToken !== expectedToken || input.confirmationToken !== input.preview.confirmationToken) {
          throw new Error("running_lifecycle_preview_invalid");
        }
        const fresh = await readRunningLifecyclePreview(transaction, input.preview.planId, input.action);
        if (fresh.confirmationToken !== input.confirmationToken) {
          throw new Error("running_lifecycle_preview_stale");
        }
        if (fresh.activeWorkout) throw new Error("running_lifecycle_active_workout_blocked");
        let lifecycle: RunningPlanAggregate["lifecycle"];
        if (input.action === "activate") {
          const current = fresh.activeRunning;
          if (current !== null && current.planId !== fresh.planId) {
            const retiredPlan = await transaction.execute(
              "UPDATE plans SET is_active = 0, revision = revision + 1 WHERE id = ? AND revision = ? AND is_active = 1",
              [current.planId, current.planRevision],
            );
            const retiredSchedule = await transaction.execute(
              `UPDATE owned_plan_schedules SET lifecycle = 'inactive', revision = revision + 1,
                 deactivated_at_ms = ? WHERE id = ? AND revision = ? AND lifecycle = 'active'`,
              [input.committedAtMs, current.scheduleId, current.scheduleRevision],
            );
            if (retiredPlan.changes !== 1 || retiredSchedule.changes !== 1) throw new Error("running_lifecycle_preview_stale");
          }
          const activatedPlan = await transaction.execute(
            "UPDATE plans SET is_active = 1, revision = revision + 1 WHERE id = ? AND revision = ? AND is_active = 0",
            [fresh.planId, fresh.expectedPlanRevision],
          );
          const activatedSchedule = await transaction.execute(
            `UPDATE owned_plan_schedules SET lifecycle = 'active', revision = revision + 1,
               activated_at_ms = ?, deactivated_at_ms = NULL
             WHERE plan_id = ? AND revision = ? AND lifecycle = 'inactive'`,
            [input.committedAtMs, fresh.planId, fresh.expectedScheduleRevision],
          );
          if (activatedPlan.changes !== 1 || activatedSchedule.changes !== 1) throw new Error("running_lifecycle_preview_stale");
          lifecycle = "active";
        } else if (input.action === "archive") {
          if (fresh.lifecycle === "active") {
            const deactivatedPlan = await transaction.execute(
              "UPDATE plans SET is_active = 0, revision = revision + 1 WHERE id = ? AND revision = ? AND is_active = 1",
              [fresh.planId, fresh.expectedPlanRevision],
            );
            const deactivatedSchedule = await transaction.execute(
              `UPDATE owned_plan_schedules SET lifecycle = 'inactive', revision = revision + 1,
                 deactivated_at_ms = ? WHERE plan_id = ? AND revision = ? AND lifecycle = 'active'`,
              [input.committedAtMs, fresh.planId, fresh.expectedScheduleRevision],
            );
            if (deactivatedPlan.changes !== 1 || deactivatedSchedule.changes !== 1) throw new Error("running_lifecycle_preview_stale");
          } else {
            const archivedPlan = await transaction.execute(
              "UPDATE plans SET revision = revision + 1 WHERE id = ? AND revision = ? AND is_active = 0",
              [fresh.planId, fresh.expectedPlanRevision],
            );
            if (archivedPlan.changes !== 1) throw new Error("running_lifecycle_preview_stale");
          }
          const status = await transaction.execute(
            "UPDATE running_plans SET status = 'retired', revision = revision + 1 WHERE plan_id = ? AND status != 'retired'",
            [fresh.planId],
          );
          if (status.changes !== 1) throw new Error("running_lifecycle_preview_stale");
          lifecycle = "archived";
        } else {
          const restoredPlan = await transaction.execute(
            "UPDATE plans SET revision = revision + 1 WHERE id = ? AND revision = ? AND is_active = 0",
            [fresh.planId, fresh.expectedPlanRevision],
          );
          const status = await transaction.execute(
            "UPDATE running_plans SET status = 'ready', revision = revision + 1 WHERE plan_id = ? AND status = 'retired'",
            [fresh.planId],
          );
          if (restoredPlan.changes !== 1 || status.changes !== 1) throw new Error("running_lifecycle_preview_stale");
          lifecycle = "inactive";
        }
        await assertRunningActivePair(transaction);
        const result = Object.freeze({ planId: fresh.planId, lifecycle });
        await transaction.execute(
          "INSERT INTO running_plan_events(id, plan_id, event_type, payload_json, created_at_ms) VALUES (?, ?, ?, ?, ?)",
          [`${input.requestId}:event`, fresh.planId, input.action === "activate" ? "activated" : input.action === "archive" ? "archived" : "reactivated", JSON.stringify({ preview: input.preview, result }), input.committedAtMs],
        );
        await transaction.execute(
          `INSERT INTO running_plan_receipts
            (request_id, request_sha256, operation, plan_id, expected_plan_revision, result_json, committed_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [input.requestId, input.requestSha256, input.action, fresh.planId, fresh.expectedPlanRevision, JSON.stringify(result), input.committedAtMs],
        );
        return result;
      });
    },
    async createInactiveAggregate(input: CreateInactiveRunningPlanInput): Promise<RunningPlanAggregate> {
      const aggregate = parseRunningPlanAggregate({ ...input.plan, active: false, lifecycle: "inactive" });
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
        const initialStatus = aggregate.sessions.some((entry) => entry.session.sessionKind === "recovery")
          && aggregate.sessions.length > 0 ? "ready" : "draft";
        await transaction.execute("INSERT INTO running_plans(plan_id, status, revision, created_at_ms) VALUES (?, ?, ?, ?)", [aggregate.id, initialStatus, aggregate.revision, aggregate.createdAtMs]);
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
          const replay = JSON.parse(receipt.result_json) as Record<string, unknown>;
          return Object.freeze(input.targetCommand === true
            ? { ...replay, outcome: "already_committed" }
            : replay);
        }
        const [plan] = await transaction.queryAll<{ revision: number; plan_kind: string; is_active: number; status: string }>(
          `SELECT plan.revision, plan.plan_kind, plan.is_active, running.status
           FROM plans plan JOIN running_plans running ON running.plan_id = plan.id WHERE plan.id = ?`,
          [input.planId],
        );
        if (plan === undefined || plan.plan_kind !== "running" || plan.revision !== input.expectedPlanRevision) {
          throw new Error("running_plan_revision_conflict");
        }
        for (const session of input.sessions) {
          const [root] = await transaction.queryAll<{ current_revision: number; plan_id: string }>(
            "SELECT current_revision, plan_id FROM running_session_roots WHERE id = ?", [session.rootId],
          );
          if (root === undefined) {
            await transaction.execute(
              "INSERT INTO running_session_roots(id, plan_id, session_kind, current_revision, created_at_ms) VALUES (?, ?, ?, ?, ?)",
              [session.rootId, input.planId, session.sessionKind, session.revision, session.createdAtMs],
            );
          } else if (root.plan_id !== input.planId || session.revision < root.current_revision) {
            throw new Error("running_session_revision_conflict");
          } else if (session.revision === root.current_revision) {
            const [current] = await transaction.queryAll<{ id: string }>(
              "SELECT id FROM running_session_revisions WHERE id = ? AND plan_id = ? AND revision = ?",
              [session.id, input.planId, session.revision],
            );
            if (current === undefined) throw new Error("running_session_revision_conflict");
            continue;
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
        if (input.completeMembership === true) {
          await transaction.execute(
            `UPDATE running_session_slots SET ordinal = ordinal + 1000000
             WHERE plan_id = ? AND retired_at_ms IS NULL`,
            [input.planId],
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
          const current = await transaction.execute(
            `UPDATE running_session_slots
                SET weekday = ?, ordinal = ?, session_revision_id = ?, revision = ?, retired_at_ms = NULL
              WHERE id = ? AND plan_id = ?`,
            [slot.weekday, slot.ordinal, slot.sessionRevisionId, slot.revision, slot.rootId, input.planId],
          );
          if (current.changes === 0) {
            await transaction.execute(
              `INSERT INTO running_session_slots
                (id, plan_id, weekday, ordinal, session_revision_id, revision, retired_at_ms)
               VALUES (?, ?, ?, ?, ?, ?, NULL)`,
              [slot.rootId, input.planId, slot.weekday, slot.ordinal, slot.sessionRevisionId, slot.revision],
            );
          }
        }
        if (input.completeMembership === true) {
          await transaction.execute(
            `UPDATE running_session_slots SET retired_at_ms = ?
             WHERE plan_id = ? AND retired_at_ms IS NULL AND ordinal >= 1000000`,
            [input.createdAtMs, input.planId],
          );
        }
        await transaction.execute(
          "INSERT INTO running_goals(id, plan_id, goal_json, revision, created_at_ms) VALUES (?, ?, ?, ?, ?)",
          [input.goal.id, input.planId, JSON.stringify(input.goal), input.goal.revision, input.goal.createdAtMs],
        );
        const persistedGoal = input.targetCommand !== true ? undefined : await (async () => {
          const [targetReadBack] = await transaction.queryAll<{ goal_json: string }>(
            "SELECT goal_json FROM running_goals WHERE id = ? AND plan_id = ? AND revision = ?",
            [input.goal.id, input.planId, input.goal.revision],
          );
          if (targetReadBack === undefined) throw new Error("running_target_readback_missing");
          return parseRunningGoal(JSON.parse(targetReadBack.goal_json));
        })();
        const nextRevision = plan.revision + 1;
        const result = Object.freeze({
          planId: input.planId,
          planRevision: nextRevision,
          active: plan.is_active === 1,
          sessionRootIds: input.sessions.map((session) => session.rootId),
          slotRootIds: input.slots.map((slot) => slot.rootId),
          ...(persistedGoal === undefined ? {} : {
            outcome: "committed" as const,
            targetRevision: persistedGoal.revision,
            target: persistedGoal,
          }),
        });
        const changed = await transaction.execute(
          "UPDATE plans SET revision = revision + 1 WHERE id = ? AND revision = ?",
          [input.planId, input.expectedPlanRevision],
        );
        if (changed.changes !== 1) throw new Error("running_plan_revision_conflict");
        if (plan.status !== "retired") {
          const readiness = await readRunningReadiness(transaction, input.planId);
          const status = readiness.ready ? "ready" : "draft";
          await transaction.execute(
            "UPDATE running_plans SET status = ?, revision = revision + 1 WHERE plan_id = ? AND status != ?",
            [status, input.planId, status],
          );
        }
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
      return readRunningReadiness(kernel, planId);
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
           WHERE plan_id = ? AND weekday = ? AND retired_at_ms IS NULL ORDER BY ordinal, id`,
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
