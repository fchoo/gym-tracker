import {
  canonicalScheduleCollisionRequest,
  createScheduleCollisionPreviewToken,
  type CommitScheduleCollisionChoiceInput,
  type ScheduleCollisionChoice,
  type ScheduleCollisionPreview,
} from "../../../domains/scheduling/collisionCommands";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";

export type ScheduleCollisionCommandResult = Readonly<{
  outcome: "committed" | "already_committed";
  outcomeId: string;
  choice: ScheduleCollisionChoice;
  invalidations: readonly string[];
}>;

export class ScheduleCollisionRepositoryError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-COLLISION01" as const;
  constructor(readonly code: "schedule_collision_preview_conflict" | "schedule_collision_revision_conflict" | "schedule_collision_request_identity_conflict" | "schedule_collision_reference_invalid") {
    super(code);
    this.name = "ScheduleCollisionRepositoryError";
  }
}

type Sha256 = (value: string) => Promise<string>;
type ReceiptRow = Readonly<{ request_sha256: string; result_json: string }>;

function invalidations(preview: ScheduleCollisionPreview): readonly string[] {
  return Object.freeze([
    `schedule:${preview.running.scheduleId}`,
    `schedule:${preview.running.scheduleId}:date:${preview.running.localDate}`,
    `schedule:${preview.strength.scheduleId}`,
    `schedule:${preview.strength.scheduleId}:date:${preview.strength.localDate}`,
    "today",
  ]);
}

function resultFor(input: CommitScheduleCollisionChoiceInput, outcomeId: string, outcome: "committed" | "already_committed"): ScheduleCollisionCommandResult {
  return Object.freeze({ outcome, outcomeId, choice: input.choice, invalidations: invalidations(input.preview) });
}

async function readReceipt(executor: Pick<SqliteKernel, "queryAll"> | SqliteTransactionExecutor, requestId: string): Promise<ReceiptRow | null> {
  const [row] = await executor.queryAll<ReceiptRow>(
    "SELECT request_sha256, result_json FROM schedule_collision_receipts WHERE request_id = ?",
    [requestId],
  );
  return row ?? null;
}

async function assertCurrent(transaction: SqliteTransactionExecutor, preview: ScheduleCollisionPreview): Promise<void> {
  const [strength] = await transaction.queryAll<Readonly<{ id: string }>>(
    `SELECT opportunity.id
     FROM owned_plan_schedule_opportunities opportunity
     JOIN owned_plan_schedules schedule ON schedule.id = opportunity.schedule_id
     WHERE opportunity.id = ? AND opportunity.schedule_id = ? AND schedule.revision = ?
       AND opportunity.local_date = ? AND opportunity.state = 'pending' AND opportunity.revision = ?`,
    [preview.strength.occurrenceId, preview.strength.scheduleId, preview.strength.scheduleRevision, preview.strength.localDate, preview.strength.occurrenceRevision],
  );
  const [running] = await transaction.queryAll<Readonly<{ id: string }>>(
    `SELECT opportunity.id
     FROM running_opportunities opportunity
     JOIN owned_plan_schedules schedule ON schedule.id = opportunity.schedule_id
     WHERE opportunity.id = ? AND opportunity.schedule_id = ? AND schedule.revision = ?
       AND opportunity.schedule_version_id = ? AND opportunity.local_date = ?
       AND opportunity.state = 'planned'`,
    [preview.running.occurrenceId, preview.running.scheduleId, preview.running.scheduleRevision, preview.running.scheduleVersionId, preview.running.localDate],
  );
  if (strength === undefined || running === undefined) {
    throw new ScheduleCollisionRepositoryError("schedule_collision_revision_conflict");
  }
}

async function confirmTransaction(
  transaction: SqliteTransactionExecutor,
  input: CommitScheduleCollisionChoiceInput,
  requestSha256: string,
  expectedToken: string,
): Promise<ScheduleCollisionCommandResult> {
  const receipt = await readReceipt(transaction, input.requestId);
  if (receipt !== null) {
    if (receipt.request_sha256 !== requestSha256) throw new ScheduleCollisionRepositoryError("schedule_collision_request_identity_conflict");
    const parsed = JSON.parse(receipt.result_json) as ScheduleCollisionCommandResult;
    return Object.freeze({ ...parsed, outcome: "already_committed" });
  }
  if (input.preview.confirmationToken !== expectedToken) throw new ScheduleCollisionRepositoryError("schedule_collision_preview_conflict");
  if (input.preview.running.localDate !== input.preview.strength.localDate) throw new ScheduleCollisionRepositoryError("schedule_collision_reference_invalid");
  await assertCurrent(transaction, input.preview);
  const outcomeId = `schedule-collision:${requestSha256}`;
  const movedLocalDate = input.choice === "keep_both"
    ? null
    : input.choice === "move_running" ? input.preview.running.movedLocalDate : input.preview.strength.movedLocalDate;
  const result = resultFor(input, outcomeId, "committed");
  await transaction.execute(
    `INSERT INTO schedule_collision_outcomes
      (id, request_id, request_sha256, choice, strength_opportunity_id, strength_schedule_id,
       strength_schedule_revision, strength_opportunity_revision, running_opportunity_id,
       running_schedule_id, running_schedule_revision, running_opportunity_revision,
       shared_local_date, moved_local_date, confirmation_token, committed_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [outcomeId, input.requestId, requestSha256, input.choice,
      input.preview.strength.occurrenceId, input.preview.strength.scheduleId,
      input.preview.strength.scheduleRevision, input.preview.strength.occurrenceRevision,
      input.preview.running.occurrenceId, input.preview.running.scheduleId,
      input.preview.running.scheduleRevision, input.preview.running.occurrenceRevision,
      input.preview.running.localDate, movedLocalDate, input.preview.confirmationToken, input.committedAtMs],
  );
  const selectedKind = input.choice === "keep_both" ? "none" : input.choice === "move_running" ? "running" : "strength";
  const selectedOpportunityId = selectedKind === "none" ? null : selectedKind === "running" ? input.preview.running.occurrenceId : input.preview.strength.occurrenceId;
  await transaction.execute(
    `INSERT INTO schedule_collision_projections
      (outcome_id, selected_kind, selected_opportunity_id, effective_local_date, moved_local_date, acknowledged, rebuilt_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [outcomeId, selectedKind, selectedOpportunityId, input.preview.running.localDate, movedLocalDate, selectedKind === "none" ? 1 : 0, input.committedAtMs],
  );
  await transaction.execute(
    `INSERT INTO schedule_collision_receipts (request_id, request_sha256, outcome_id, result_json, committed_at_ms)
     VALUES (?, ?, ?, ?, ?)`,
    [input.requestId, requestSha256, outcomeId, JSON.stringify(result), input.committedAtMs],
  );
  return result;
}

export type ScheduleCollisionRepository = Readonly<{
  confirm(input: CommitScheduleCollisionChoiceInput): Promise<ScheduleCollisionCommandResult>;
  preview(input: Omit<ScheduleCollisionPreview, "confirmationToken">): Promise<ScheduleCollisionPreview>;
  previewForRunningPlan(planId: string): Promise<ScheduleCollisionPreview | null>;
  rebuildProjection(): Promise<void>;
}>;

export function createScheduleCollisionRepository(kernel: SqliteKernel, sha256: Sha256): ScheduleCollisionRepository {
  return Object.freeze({
    async preview(input) {
      return Object.freeze({ ...input, confirmationToken: await createScheduleCollisionPreviewToken({ preview: input, sha256 }) });
    },
    async previewForRunningPlan(planId) {
      const [row] = await kernel.queryAll<Readonly<{
        running_id: string; running_plan_id: string; running_plan_name: string; running_schedule_id: string;
        running_version_id: string; running_schedule_revision: number; running_local_date: string;
        strength_id: string; strength_plan_id: string; strength_plan_name: string; strength_schedule_id: string;
        strength_version_id: string; strength_schedule_revision: number; strength_opportunity_revision: number;
      }>>(
        `SELECT running.id AS running_id, running.plan_id AS running_plan_id, running_plan.name AS running_plan_name,
                running.schedule_id AS running_schedule_id, running.schedule_version_id AS running_version_id,
                running_schedule.revision AS running_schedule_revision, running.local_date AS running_local_date,
                strength.id AS strength_id, strength_plan.id AS strength_plan_id, strength_plan.name AS strength_plan_name,
                strength.schedule_id AS strength_schedule_id, strength_schedule_version.id AS strength_version_id,
                strength_schedule.revision AS strength_schedule_revision, strength.revision AS strength_opportunity_revision
         FROM running_opportunities running
         JOIN plans running_plan ON running_plan.id = running.plan_id
         JOIN owned_plan_schedules running_schedule ON running_schedule.id = running.schedule_id
         JOIN owned_plan_schedule_opportunities strength ON strength.local_date = running.local_date AND strength.state = 'pending'
         JOIN owned_plan_schedules strength_schedule ON strength_schedule.id = strength.schedule_id AND strength_schedule.plan_kind = 'strength'
         JOIN plans strength_plan ON strength_plan.id = strength_schedule.plan_id
         JOIN owned_plan_schedule_versions strength_schedule_version ON strength_schedule_version.schedule_id = strength.schedule_id
         WHERE running.plan_id = ? AND running.state = 'planned'
           AND strength_schedule_version.effective_local_date <= running.local_date
         ORDER BY running.local_date, strength_schedule_version.version_number DESC, running.id, strength.id
         LIMIT 1`,
        [planId],
      );
      if (row === undefined) return null;
      const movedLocalDate = new Date(`${row.running_local_date}T00:00:00.000Z`);
      movedLocalDate.setUTCDate(movedLocalDate.getUTCDate() + 1);
      const nextDate = movedLocalDate.toISOString().slice(0, 10);
      return this.preview({
        running: { occurrenceId: row.running_id, planId: row.running_plan_id, planName: row.running_plan_name, scheduleId: row.running_schedule_id, scheduleVersionId: row.running_version_id, scheduleRevision: row.running_schedule_revision, occurrenceRevision: 1, localDate: row.running_local_date, movedLocalDate: nextDate },
        strength: { occurrenceId: row.strength_id, planId: row.strength_plan_id, planName: row.strength_plan_name, scheduleId: row.strength_schedule_id, scheduleVersionId: row.strength_version_id, scheduleRevision: row.strength_schedule_revision, occurrenceRevision: row.strength_opportunity_revision, localDate: row.running_local_date, movedLocalDate: nextDate },
      });
    },
    async confirm(input) {
      const requestSha256 = await sha256(canonicalScheduleCollisionRequest(input));
      const expectedToken = await createScheduleCollisionPreviewToken({
        preview: { running: input.preview.running, strength: input.preview.strength }, sha256,
      });
      try {
        return await kernel.write((transaction) => confirmTransaction(transaction, input, requestSha256, expectedToken));
      } catch (error) {
        const cause = (error as { cause?: unknown })?.cause;
        if (cause instanceof ScheduleCollisionRepositoryError) throw cause;
        throw error;
      }
    },
    async rebuildProjection() {
      await kernel.write(async (transaction) => {
        await transaction.execute("DELETE FROM schedule_collision_projections");
        await transaction.execute(`INSERT INTO schedule_collision_projections
          (outcome_id, selected_kind, selected_opportunity_id, effective_local_date, moved_local_date, acknowledged, rebuilt_at_ms)
          SELECT id,
            CASE choice WHEN 'move_running' THEN 'running' WHEN 'move_strength' THEN 'strength' ELSE 'none' END,
            CASE choice WHEN 'move_running' THEN running_opportunity_id WHEN 'move_strength' THEN strength_opportunity_id ELSE NULL END,
            shared_local_date, moved_local_date, CASE choice WHEN 'keep_both' THEN 1 ELSE 0 END, committed_at_ms
          FROM schedule_collision_outcomes`);
      });
    },
  });
}
