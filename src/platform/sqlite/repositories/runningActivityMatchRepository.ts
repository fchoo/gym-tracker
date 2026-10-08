import type {
  RunningActivityMatchInput,
  RunningActivityMatchResult,
} from "../../../domains/running/activityMatchCommands";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";

type MatchRow = Readonly<{ activity_id: string; opportunity_id: string; relation_revision: number }>;
type ReceiptRow = Readonly<{ request_sha256: string; activity_id: string; opportunity_id: string; relation_revision: number; result_kind: "matched" | "unmatched" | "reassigned" | "invalidated" }>;
type ActivityRow = Readonly<{ aggregate_revision: number; removal_state: "active" | "removed" }>;
type OpportunityRow = Readonly<{ plan_id: string; schedule_id: string; schedule_version_id: string; slot_id: string; session_revision_id: string; state: "planned" | "fulfilled" | "skipped" }>;

function result(kind: RunningActivityMatchResult["kind"], activityId: string, opportunityId: string, relationRevision: number): RunningActivityMatchResult {
  return Object.freeze({ kind, activityId, opportunityId, relationRevision });
}

async function assertOneToOne(transaction: SqliteTransactionExecutor): Promise<void> {
  const [row] = await transaction.queryAll<{ invalid: number }>(`SELECT EXISTS (
    SELECT activity_id FROM running_activity_current_matches GROUP BY activity_id HAVING count(*) > 1
    UNION ALL
    SELECT opportunity_id FROM running_activity_current_matches GROUP BY opportunity_id HAVING count(*) > 1
  ) AS invalid`);
  if (row?.invalid !== 0) throw new Error("running_activity_current_match_one_to_one_invalid");
}

export function createRunningActivityMatchRepository(kernel: SqliteKernel) {
  return Object.freeze({
    async confirm(input: RunningActivityMatchInput): Promise<RunningActivityMatchResult> {
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<ReceiptRow>("SELECT request_sha256, activity_id, opportunity_id, relation_revision, result_kind FROM running_activity_match_receipts WHERE request_id = ?", [input.requestId]);
        if (receipt !== undefined) {
          return receipt.request_sha256 === input.requestSha256
            ? result("replayed", receipt.activity_id, receipt.opportunity_id, receipt.relation_revision)
            : result("conflict", input.activityId, input.opportunityId, input.expectedRelationRevision);
        }
        const [activity] = await transaction.queryAll<ActivityRow>(`SELECT identity.aggregate_revision,
          COALESCE(lifecycle.removal_state, identity.removal_state) AS removal_state
          FROM imported_activity_identities identity
          LEFT JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = identity.activity_id
          WHERE identity.activity_id = ?`, [input.activityId]);
        const [opportunity] = await transaction.queryAll<OpportunityRow>("SELECT plan_id, schedule_id, schedule_version_id, slot_id, session_revision_id, state FROM running_opportunities WHERE id = ?", [input.opportunityId]);
        if (activity === undefined || opportunity === undefined || activity.aggregate_revision !== input.expectedActivityRevision || activity.removal_state !== "active" || opportunity.state !== "planned" || opportunity.schedule_id !== input.scheduleId || opportunity.schedule_version_id !== input.scheduleVersionId || opportunity.slot_id !== input.slotId || opportunity.session_revision_id !== input.sessionRevisionId) {
          return result("conflict", input.activityId, input.opportunityId, input.expectedRelationRevision);
        }
        const [currentByActivity] = await transaction.queryAll<MatchRow>("SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches WHERE activity_id = ?", [input.activityId]);
        const [currentByOpportunity] = await transaction.queryAll<MatchRow>("SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches WHERE opportunity_id = ?", [input.opportunityId]);
        const current = currentByActivity ?? currentByOpportunity;
        if ((current?.relation_revision ?? 0) !== input.expectedRelationRevision) return result("conflict", input.activityId, input.opportunityId, current?.relation_revision ?? 0);
        if (input.action === "match" && (currentByActivity !== undefined || currentByOpportunity !== undefined)) return result("conflict", input.activityId, input.opportunityId, input.expectedRelationRevision);
        if (input.action !== "match" && (currentByActivity === undefined || currentByActivity.opportunity_id !== input.expectedCurrentOpportunityId)) return result("conflict", input.activityId, input.opportunityId, input.expectedRelationRevision);
        if (input.action === "reassign" && currentByOpportunity !== undefined && currentByOpportunity.activity_id !== input.activityId) return result("conflict", input.activityId, input.opportunityId, input.expectedRelationRevision);

        const relationRevision = input.expectedRelationRevision + 1;
        const eventId = `${input.requestId}:event`;
        const action = input.action === "match" ? "matched" : input.action === "unmatch" ? "unmatched" : "reassigned";
        if (input.action === "match" || input.action === "reassign") {
          if (currentByActivity !== undefined) await transaction.execute("DELETE FROM running_activity_current_matches WHERE activity_id = ?", [input.activityId]);
          await transaction.execute("INSERT INTO running_activity_current_matches(opportunity_id, activity_id, relation_revision, event_id) VALUES (?, ?, ?, ?)", [input.opportunityId, input.activityId, relationRevision, eventId]);
        } else {
          await transaction.execute("DELETE FROM running_activity_current_matches WHERE activity_id = ?", [input.activityId]);
        }
        await transaction.execute(`INSERT INTO running_activity_match_events
          (id, activity_id, opportunity_id, prior_opportunity_id, action, activity_revision, opportunity_revision, prior_relation_revision, relation_revision, request_sha256, created_at_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [eventId, input.activityId, input.opportunityId, currentByActivity?.opportunity_id ?? null, action, input.expectedActivityRevision, input.expectedOpportunityRevision, input.expectedRelationRevision, relationRevision, input.requestSha256, input.occurredAtMs]);
        await transaction.execute("INSERT INTO running_activity_match_receipts(request_id, request_sha256, activity_id, opportunity_id, relation_revision, result_kind, committed_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)", [input.requestId, input.requestSha256, input.activityId, input.opportunityId, relationRevision, action, input.occurredAtMs]);
        await assertOneToOne(transaction);
        return result(action, input.activityId, input.opportunityId, relationRevision);
      });
    },
  });
}
