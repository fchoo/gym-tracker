import type {
  RunningActivityMatchCandidate,
  RunningActivityMatchInput,
  RunningActivityMatchReadResult,
  RunningActivityMatchResult,
} from "../../../domains/running/activityMatchCommands";
import type { RunningSessionKind } from "../../../domains/running/contracts";
import type { SqliteKernel, SqliteReadTransactionExecutor, SqliteTransactionExecutor } from "../sqliteKernel";

type MatchRow = Readonly<{ activity_id: string; opportunity_id: string; relation_revision: number }>;
type ReceiptRow = Readonly<{ request_sha256: string; activity_id: string; opportunity_id: string; relation_revision: number; result_kind: "matched" | "unmatched" | "reassigned" | "invalidated" }>;
type ActivityRow = Readonly<{ aggregate_revision: number; accepted_normalized_sha256: string; removal_state: "active" | "removed" }>;
type OpportunityRow = Readonly<{
  plan_id: string;
  schedule_id: string;
  schedule_version_id: string;
  schedule_revision: number;
  schedule_lifecycle: "active" | "inactive";
  plan_active: number;
  plan_day_id: string;
  plan_day_revision: number;
  slot_id: string;
  slot_revision_id: string;
  slot_revision: number;
  session_revision_id: string;
  session_revision: number;
  state: "planned" | "fulfilled" | "skipped";
}>;

type CandidateRow = OpportunityRow & Readonly<{
  activity_id: string;
  aggregate_revision: number;
  accepted_normalized_sha256: string;
  opportunity_id: string;
  plan_name: string;
  slot_ordinal: number;
  session_kind: RunningSessionKind;
  definition_json: string;
  local_date: string;
  timezone: string;
  relation_revision: number;
}>;

type CurrentCandidateRow = CandidateRow & Readonly<{
  current_relation_revision: number;
}>;

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

function quantity(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { distanceMeters?: unknown; durationMs?: unknown };
  if (typeof candidate.distanceMeters === "number" && candidate.distanceMeters > 0) {
    return `${candidate.distanceMeters} m`;
  }
  if (typeof candidate.durationMs === "number" && candidate.durationMs > 0) {
    return `${Math.round(candidate.durationMs / 60_000)} min`;
  }
  return null;
}

function targetSummary(definitionJson: string, sessionKind: RunningSessionKind): string {
  try {
    const definition = JSON.parse(definitionJson) as {
      phases?: readonly { steps?: readonly unknown[] }[];
      contextual?: Readonly<Record<string, unknown>>;
      advisoryTarget?: Readonly<{ paceMsPerKm?: number; heartRateZone?: number; rpe?: number }>;
    };
    const work = definition.phases?.flatMap((phase) => phase.steps ?? [])
      .map(quantity).filter((value): value is string => value !== null).join(" + ") ?? "";
    const context = definition.contextual;
    const repetitions = typeof context?.repetitions === "number" ? `${context.repetitions} × ` : "";
    const contextualWork = quantity(context?.work);
    const target = definition.advisoryTarget?.paceMsPerKm !== undefined
      ? `${Math.floor(definition.advisoryTarget.paceMsPerKm / 60_000)}:${String(Math.floor((definition.advisoryTarget.paceMsPerKm % 60_000) / 1000)).padStart(2, "0")} / km`
      : definition.advisoryTarget?.heartRateZone !== undefined
        ? `Z${definition.advisoryTarget.heartRateZone}`
        : definition.advisoryTarget?.rpe !== undefined
          ? `RPE ${definition.advisoryTarget.rpe}`
          : null;
    const facts = [work || (contextualWork === null ? null : `${repetitions}${contextualWork}`), target]
      .filter((value): value is string => value !== null && value.length > 0);
    if (facts.length > 0) return facts.join(" · ");
  } catch {
    // Invalid historical presentation data fails to a truthful bounded label.
  }
  return `${sessionKind === "long_run" ? "Long run" : `${sessionKind[0]!.toUpperCase()}${sessionKind.slice(1)}`} session`;
}

const opportunityFactsSql = `SELECT opportunity.plan_id, opportunity.schedule_id,
  opportunity.schedule_version_id, schedule.revision AS schedule_revision,
  schedule.lifecycle AS schedule_lifecycle, plan.is_active AS plan_active,
  plan_day.id AS plan_day_id, plan_day.revision AS plan_day_revision,
  opportunity.slot_id, slot_revision.id AS slot_revision_id,
  slot_revision.revision AS slot_revision,
  opportunity.session_revision_id, session.revision AS session_revision,
  opportunity.state
  FROM running_opportunities opportunity
  JOIN plans plan ON plan.id = opportunity.plan_id AND plan.plan_kind = 'running'
  JOIN owned_plan_schedules schedule ON schedule.id = opportunity.schedule_id
  JOIN owned_plan_schedule_versions schedule_version
    ON schedule_version.id = opportunity.schedule_version_id
   AND schedule_version.schedule_id = schedule.id
  JOIN plan_days plan_day ON plan_day.id = (
    SELECT anchor.id FROM plan_days anchor
    WHERE anchor.plan_id = opportunity.plan_id
    ORDER BY anchor.ordinal, anchor.id LIMIT 1
  )
  JOIN running_session_slot_revisions slot_revision ON slot_revision.id = (
    SELECT pinned_slot.id FROM running_session_slot_revisions pinned_slot
    WHERE pinned_slot.slot_root_id = opportunity.slot_id
      AND pinned_slot.session_revision_id = opportunity.session_revision_id
      AND pinned_slot.created_at_ms <= opportunity.created_at_ms
    ORDER BY pinned_slot.revision DESC, pinned_slot.id DESC LIMIT 1
  )
  JOIN running_session_revisions session ON session.id = opportunity.session_revision_id`;

async function readCandidates(
  executor: SqliteReadTransactionExecutor,
  activityId: string,
): Promise<RunningActivityMatchReadResult> {
  const [activity] = await executor.queryAll<ActivityRow & Readonly<{
    activity_id: string;
    matched_opportunity_id: string | null;
    current_relation_revision: number | null;
    latest_relation_revision: number;
  }>>(`SELECT identity.activity_id, identity.aggregate_revision,
      identity.accepted_normalized_sha256,
      COALESCE(lifecycle.removal_state, identity.removal_state) AS removal_state,
      current.opportunity_id AS matched_opportunity_id,
      current.relation_revision AS current_relation_revision,
      COALESCE((SELECT MAX(event.relation_revision)
        FROM running_activity_match_events event
        WHERE event.activity_id = identity.activity_id), 0) AS latest_relation_revision
    FROM imported_activity_identities identity
    LEFT JOIN imported_activity_current_lifecycle lifecycle
      ON lifecycle.activity_id = identity.activity_id
    LEFT JOIN running_activity_current_matches current
      ON current.activity_id = identity.activity_id
    WHERE identity.activity_id = ?`, [activityId]);
  if (activity === undefined) return Object.freeze({ kind: "missing", activityId });
  if (activity.removal_state !== "active") {
    return Object.freeze({ kind: "activity_unavailable", activityId });
  }
  if (activity.matched_opportunity_id !== null && activity.current_relation_revision !== null) {
    const [current] = await executor.queryAll<CurrentCandidateRow>(`${opportunityFactsSql.replace("SELECT opportunity.plan_id", `SELECT
      ? AS activity_id, ? AS aggregate_revision, ? AS accepted_normalized_sha256,
      opportunity.id AS opportunity_id, plan.name AS plan_name,
      slot_revision.ordinal AS slot_ordinal, session.session_kind,
      session.definition_json, opportunity.local_date, opportunity.timezone,
      ? AS relation_revision, ? AS current_relation_revision, opportunity.plan_id`)}
      WHERE opportunity.id = ?`, [
      activityId,
      activity.aggregate_revision,
      activity.accepted_normalized_sha256,
      activity.latest_relation_revision,
      activity.current_relation_revision,
      activity.matched_opportunity_id,
    ]);
    const alternatives = await executor.queryAll<CandidateRow>(`${opportunityFactsSql.replace("SELECT opportunity.plan_id", `SELECT
      ? AS activity_id, ? AS aggregate_revision, ? AS accepted_normalized_sha256,
      opportunity.id AS opportunity_id, plan.name AS plan_name,
      slot_revision.ordinal AS slot_ordinal, session.session_kind,
      session.definition_json, opportunity.local_date, opportunity.timezone,
      ? AS relation_revision, opportunity.plan_id`)}
      LEFT JOIN running_activity_current_matches occupied
        ON occupied.opportunity_id = opportunity.id
      WHERE opportunity.state = 'planned'
        AND schedule.lifecycle = 'active'
        AND plan.is_active = 1
        AND occupied.opportunity_id IS NULL
      ORDER BY opportunity.local_date, slot_revision.ordinal, opportunity.id`, [
      activityId,
      activity.aggregate_revision,
      activity.accepted_normalized_sha256,
      activity.latest_relation_revision,
    ]);
    if (current === undefined) {
      return Object.freeze({
        kind: "activity_unavailable",
        activityId,
      });
    }
    const toCandidate = (row: CandidateRow): RunningActivityMatchCandidate => Object.freeze({
      activityId: row.activity_id,
      expectedActivityRevision: row.aggregate_revision,
      expectedAcceptedPayloadSha256: row.accepted_normalized_sha256,
      opportunityId: row.opportunity_id,
      expectedOpportunityRevision: 1,
      planId: row.plan_id,
      planName: row.plan_name,
      scheduleId: row.schedule_id,
      scheduleVersionId: row.schedule_version_id,
      expectedScheduleRevision: row.schedule_revision,
      planDayId: row.plan_day_id,
      expectedPlanDayRevision: row.plan_day_revision,
      slotId: row.slot_id,
      slotRevisionId: row.slot_revision_id,
      expectedSlotRevision: row.slot_revision,
      slotOrdinal: row.slot_ordinal,
      sessionRevisionId: row.session_revision_id,
      expectedSessionRevision: row.session_revision,
      sessionKind: row.session_kind,
      localDate: row.local_date,
      localTime: null,
      timezone: row.timezone,
      targetSummary: targetSummary(row.definition_json, row.session_kind),
      state: "planned",
      expectedRelationRevision: row.relation_revision,
    });
    return Object.freeze({
      kind: "already_matched",
      activityId,
      currentCandidate: toCandidate(current),
      candidates: Object.freeze(alternatives.map((row) => toCandidate(row))),
      opportunityId: activity.matched_opportunity_id,
      relationRevision: activity.current_relation_revision,
    });
  }
  const rows = await executor.queryAll<CandidateRow>(`${opportunityFactsSql.replace("SELECT opportunity.plan_id", `SELECT
    ? AS activity_id, ? AS aggregate_revision, ? AS accepted_normalized_sha256,
    opportunity.id AS opportunity_id, plan.name AS plan_name,
    slot_revision.ordinal AS slot_ordinal, session.session_kind,
    session.definition_json, opportunity.local_date, opportunity.timezone,
    ? AS relation_revision, opportunity.plan_id`)}
    LEFT JOIN running_activity_current_matches occupied
      ON occupied.opportunity_id = opportunity.id
    WHERE opportunity.state = 'planned'
      AND schedule.lifecycle = 'active'
      AND plan.is_active = 1
      AND occupied.opportunity_id IS NULL
    ORDER BY opportunity.local_date, slot_revision.ordinal, opportunity.id`, [
    activityId,
    activity.aggregate_revision,
    activity.accepted_normalized_sha256,
    activity.latest_relation_revision,
  ]);
  if (rows.length === 0) return Object.freeze({ kind: "no_candidates", activityId });
  const candidates = rows.map((row): RunningActivityMatchCandidate => Object.freeze({
    activityId: row.activity_id,
    expectedActivityRevision: row.aggregate_revision,
    expectedAcceptedPayloadSha256: row.accepted_normalized_sha256,
    opportunityId: row.opportunity_id,
    expectedOpportunityRevision: 1,
    planId: row.plan_id,
    planName: row.plan_name,
    scheduleId: row.schedule_id,
    scheduleVersionId: row.schedule_version_id,
    expectedScheduleRevision: row.schedule_revision,
    planDayId: row.plan_day_id,
    expectedPlanDayRevision: row.plan_day_revision,
    slotId: row.slot_id,
    slotRevisionId: row.slot_revision_id,
    expectedSlotRevision: row.slot_revision,
    slotOrdinal: row.slot_ordinal,
    sessionRevisionId: row.session_revision_id,
    expectedSessionRevision: row.session_revision,
    sessionKind: row.session_kind,
    localDate: row.local_date,
    localTime: null,
    timezone: row.timezone,
    targetSummary: targetSummary(row.definition_json, row.session_kind),
    state: "planned",
    expectedRelationRevision: row.relation_revision,
  }));
  return Object.freeze({ kind: "ready", activityId, candidates: Object.freeze(candidates) });
}

export function createRunningActivityMatchRepository(kernel: SqliteKernel) {
  return Object.freeze({
    async readCandidates(activityId: string): Promise<RunningActivityMatchReadResult> {
      return kernel.readSnapshot === undefined
        ? readCandidates(kernel, activityId)
        : kernel.readSnapshot((transaction) => readCandidates(transaction, activityId));
    },
    async confirm(input: RunningActivityMatchInput): Promise<RunningActivityMatchResult> {
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<ReceiptRow>("SELECT request_sha256, activity_id, opportunity_id, relation_revision, result_kind FROM running_activity_match_receipts WHERE request_id = ?", [input.requestId]);
        if (receipt !== undefined) {
          return receipt.request_sha256 === input.requestSha256
            ? result("replayed", receipt.activity_id, receipt.opportunity_id, receipt.relation_revision)
            : result("conflict", input.activityId, input.opportunityId, input.expectedRelationRevision);
        }
        const [activity] = await transaction.queryAll<ActivityRow>(`SELECT identity.aggregate_revision,
          identity.accepted_normalized_sha256,
          COALESCE(lifecycle.removal_state, identity.removal_state) AS removal_state
          FROM imported_activity_identities identity
          LEFT JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = identity.activity_id
          WHERE identity.activity_id = ?`, [input.activityId]);
        const [opportunity] = await transaction.queryAll<OpportunityRow>(`${opportunityFactsSql} WHERE opportunity.id = ?`, [input.opportunityId]);
        if (activity === undefined || opportunity === undefined
          || activity.aggregate_revision !== input.expectedActivityRevision
          || activity.accepted_normalized_sha256 !== input.expectedAcceptedPayloadSha256
          || activity.removal_state !== "active"
          || input.expectedOpportunityRevision !== 1
          || opportunity.plan_id !== input.planId
          || opportunity.state !== "planned"
          || opportunity.plan_active !== 1
          || opportunity.schedule_lifecycle !== "active"
          || opportunity.schedule_id !== input.scheduleId
          || opportunity.schedule_version_id !== input.scheduleVersionId
          || opportunity.schedule_revision !== input.expectedScheduleRevision
          || opportunity.plan_day_id !== input.planDayId
          || opportunity.plan_day_revision !== input.expectedPlanDayRevision
          || opportunity.slot_id !== input.slotId
          || opportunity.slot_revision_id !== input.slotRevisionId
          || opportunity.slot_revision !== input.expectedSlotRevision
          || opportunity.session_revision_id !== input.sessionRevisionId
          || opportunity.session_revision !== input.expectedSessionRevision) {
          return result("conflict", input.activityId, input.opportunityId, input.expectedRelationRevision);
        }
        const [currentByActivity] = await transaction.queryAll<MatchRow>("SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches WHERE activity_id = ?", [input.activityId]);
        const [currentByOpportunity] = await transaction.queryAll<MatchRow>("SELECT activity_id, opportunity_id, relation_revision FROM running_activity_current_matches WHERE opportunity_id = ?", [input.opportunityId]);
        const [latest] = await transaction.queryAll<{ relation_revision: number }>("SELECT relation_revision FROM running_activity_match_events WHERE activity_id = ? ORDER BY relation_revision DESC, id DESC LIMIT 1", [input.activityId]);
        const actualRelationRevision = latest?.relation_revision ?? 0;
        if (actualRelationRevision !== input.expectedRelationRevision) return result("conflict", input.activityId, input.opportunityId, actualRelationRevision);
        if (
          (input.action === "unmatch" && input.expectedCurrentOpportunityId !== input.opportunityId)
          || (input.action === "reassign" && input.expectedCurrentOpportunityId === input.opportunityId)
        ) return result("conflict", input.activityId, input.opportunityId, actualRelationRevision);
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
