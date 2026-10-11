import type {
  ConfirmGarminImportInput,
  GarminImportResult,
  GarminRevisionDecisionInput,
  GarminRevisionDecisionResult,
  GarminRevisionReview,
} from "../../../domains/activities/importCommands";
import {
  canonicalJson,
  parseGarminSourceEnvelope,
} from "../../../domains/activities/importContracts";
import type { GarminActivityLifecycleInput } from "../../../domains/activities/importCommands";
import { classifyGarminActivityIdentity } from "../../../domains/activities/activityIdentity";
import { runtimeSha256 } from "../../crypto/runtimeSha256";
import type { SqliteKernel } from "../sqliteKernel";

type Receipt = Readonly<{ request_sha256: string; activity_id: string }>;

function aggregateJson(input: ConfirmGarminImportInput): string {
  const envelope = input.staged.envelope;
  const dateProvenance = input.dateProvenance;
  return JSON.stringify({
    source_kind: envelope.source_kind,
    account_namespace: envelope.account_namespace,
    external_activity_id: envelope.external_activity_id,
    normalized_json_sha256: envelope.normalized_json_sha256,
    sample_fidelity: envelope.sample_fidelity,
    ...(envelope.fidelity_by_channel === undefined ? {} : { fidelity_by_channel: envelope.fidelity_by_channel }),
    confirmed_local_date: input.confirmedLocalDate,
    ...(dateProvenance === undefined ? {} : {
      date_provenance: {
        absolute_started_at_ms: dateProvenance.absoluteStartedAtMs,
        ...(dateProvenance.sourceLocalDateTime === undefined ? {} : { source_local_date_time: dateProvenance.sourceLocalDateTime }),
        ...(dateProvenance.sourceTimeZone === undefined ? {} : { source_time_zone: dateProvenance.sourceTimeZone }),
        ...(dateProvenance.sourceUtcOffsetMinutes === undefined ? {} : { source_utc_offset_minutes: dateProvenance.sourceUtcOffsetMinutes }),
        confirmed_local_date: dateProvenance.confirmedLocalDate,
        confirmed_local_time: dateProvenance.confirmedLocalTime,
        confirmed_time_zone: dateProvenance.confirmedTimeZone,
        confirmed_utc_offset_minutes: dateProvenance.confirmedUtcOffsetMinutes,
      },
    }),
    normalized: envelope.normalized,
  });
}

export function createImportedActivityRepository(kernel: SqliteKernel) {
  const sha256 = runtimeSha256;
  return Object.freeze({
    async listGarminRevisionReviews(): Promise<readonly GarminRevisionReview[]> {
      const rows = await kernel.queryAll<{
        activity_id: string;
        aggregate_revision: number;
        accepted_normalized_sha256: string;
        accepted_aggregate_json: string;
        proposed_revision: number;
        normalized_sha256: string;
        proposed_aggregate_json: string;
      }>(`SELECT identity.activity_id, identity.aggregate_revision,
                 identity.accepted_normalized_sha256,
                 activity.aggregate_json AS accepted_aggregate_json,
                 proposal.proposed_revision, proposal.normalized_sha256,
                 proposal.envelope_json AS proposed_aggregate_json
            FROM imported_activity_revision_proposals proposal
            JOIN imported_activity_identities identity ON identity.activity_id = proposal.activity_id
            JOIN imported_activities activity ON activity.id = proposal.activity_id
            LEFT JOIN imported_activity_revision_decisions decision
              ON decision.activity_id = proposal.activity_id
             AND decision.proposed_revision = proposal.proposed_revision
           WHERE decision.request_id IS NULL
           ORDER BY proposal.activity_id, proposal.proposed_revision`);
      return Object.freeze(rows.map((row) => {
        const accepted = JSON.parse(row.accepted_aggregate_json) as Readonly<{ normalized?: Record<string, unknown> }>;
        const proposed = JSON.parse(row.proposed_aggregate_json) as Readonly<{ normalized?: Record<string, unknown> }>;
        const acceptedFacts = accepted.normalized ?? {};
        const proposedFacts = proposed.normalized ?? {};
        const changedFields = [...new Set([...Object.keys(acceptedFacts), ...Object.keys(proposedFacts)])]
          .filter((key) => canonicalJson(acceptedFacts[key]) !== canonicalJson(proposedFacts[key]))
          .sort();
        return Object.freeze({
          activityId: row.activity_id,
          acceptedRevision: row.aggregate_revision,
          proposedRevision: row.proposed_revision,
          acceptedNormalizedSha256: row.accepted_normalized_sha256,
          proposedNormalizedSha256: row.normalized_sha256,
          changedFields: Object.freeze(changedFields),
        });
      }));
    },
    async resolveGarminRevision(input: GarminRevisionDecisionInput): Promise<GarminRevisionDecisionResult> {
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<Receipt>(
          "SELECT request_sha256, activity_id FROM imported_activity_receipts WHERE id = ?",
          [input.requestId],
        );
        if (receipt !== undefined) {
          if (receipt.request_sha256 !== input.requestSha256 || receipt.activity_id !== input.activityId) {
            return Object.freeze({ kind: "conflict", activityId: input.activityId, aggregateRevision: input.expectedAggregateRevision });
          }
          const [identity] = await transaction.queryAll<{ aggregate_revision: number }>(
            "SELECT aggregate_revision FROM imported_activity_identities WHERE activity_id = ?",
            [receipt.activity_id],
          );
          const aggregateRevision = identity?.aggregate_revision ?? input.expectedAggregateRevision;
          const [decision] = await transaction.queryAll<{ action: "accept" | "keep" }>(
            "SELECT action FROM imported_activity_revision_decisions WHERE request_id = ?",
            [input.requestId],
          );
          return Object.freeze({
            kind: decision?.action === "accept" ? "revision_accepted" : decision?.action === "keep" ? "revision_kept" : "replayed",
            activityId: input.activityId,
            aggregateRevision: decision?.action === "accept" ? aggregateRevision : aggregateRevision,
          });
        }
        const [identity] = await transaction.queryAll<{
          aggregate_revision: number;
          accepted_normalized_sha256: string;
        }>(
          "SELECT aggregate_revision, accepted_normalized_sha256 FROM imported_activity_identities WHERE activity_id = ?",
          [input.activityId],
        );
        const [proposal] = await transaction.queryAll<{
          normalized_sha256: string;
          envelope_json: string;
        }>(
          `SELECT proposal.normalized_sha256, proposal.envelope_json
             FROM imported_activity_revision_proposals proposal
             LEFT JOIN imported_activity_revision_decisions decision
               ON decision.activity_id = proposal.activity_id
              AND decision.proposed_revision = proposal.proposed_revision
            WHERE proposal.activity_id = ? AND proposal.proposed_revision = ?
              AND decision.request_id IS NULL`,
          [input.activityId, input.proposedRevision],
        );
        if (identity === undefined
          || proposal === undefined
          || identity.aggregate_revision !== input.expectedAggregateRevision
          || proposal.normalized_sha256 !== input.expectedProposedSha256) {
          return Object.freeze({ kind: "conflict", activityId: input.activityId, aggregateRevision: identity?.aggregate_revision ?? 0 });
        }
        if (input.action === "accept") {
          await transaction.execute(
            "UPDATE imported_activities SET aggregate_json = ? WHERE id = ?",
            [proposal.envelope_json, input.activityId],
          );
          await transaction.execute(
            "UPDATE imported_activity_identities SET aggregate_revision = ?, accepted_normalized_sha256 = ? WHERE activity_id = ? AND aggregate_revision = ?",
            [input.proposedRevision, proposal.normalized_sha256, input.activityId, input.expectedAggregateRevision],
          );
          await transaction.execute(
            "UPDATE imported_activity_current_lifecycle SET aggregate_revision = ? WHERE activity_id = ? AND aggregate_revision = ?",
            [input.proposedRevision, input.activityId, input.expectedAggregateRevision],
          );
        }
        await transaction.execute(
          `INSERT INTO imported_activity_revision_decisions
            (request_id, request_sha256, activity_id, proposed_revision, action, decided_at_ms)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [input.requestId, input.requestSha256, input.activityId, input.proposedRevision, input.action, input.occurredAtMs],
        );
        await transaction.execute(
          "INSERT INTO imported_activity_receipts(id, activity_id, request_sha256, committed_at_ms) VALUES (?, ?, ?, ?)",
          [input.requestId, input.activityId, input.requestSha256, input.occurredAtMs],
        );
        return Object.freeze({
          kind: input.action === "accept" ? "revision_accepted" : "revision_kept",
          activityId: input.activityId,
          aggregateRevision: input.action === "accept" ? input.proposedRevision : input.expectedAggregateRevision,
        });
      });
    },
    async changeGarminActivityLifecycle(input: GarminActivityLifecycleInput): Promise<GarminImportResult> {
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<Receipt>("SELECT request_sha256, activity_id FROM imported_activity_receipts WHERE id = ?", [input.requestId]);
        if (receipt !== undefined) return receipt.request_sha256 === input.requestSha256 ? Object.freeze({ kind: input.operation === "remove" ? "removed" : "replayed", activityId: receipt.activity_id, aggregateRevision: input.expectedAggregateRevision }) : Object.freeze({ kind: "conflict", activityId: input.activityId, aggregateRevision: input.expectedAggregateRevision });
        const [identity] = await transaction.queryAll<{ aggregate_revision: number; removal_state: "active" | "removed" }>("SELECT aggregate_revision, removal_state FROM imported_activity_current_lifecycle WHERE activity_id = ?", [input.activityId]);
        if (identity === undefined || identity.aggregate_revision !== input.expectedAggregateRevision) return Object.freeze({ kind: "conflict", activityId: input.activityId, aggregateRevision: identity?.aggregate_revision ?? 0 });
        if ((input.operation === "remove" && identity.removal_state === "removed") || (input.operation === "restore" && identity.removal_state !== "removed")) return Object.freeze({ kind: input.operation === "remove" ? "removed" : "conflict", activityId: input.activityId, aggregateRevision: identity.aggregate_revision });
        const eventType = input.operation === "remove" ? "removed" : "restored";
        await transaction.execute("INSERT INTO imported_activity_events(id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)", [`${input.requestId}:event`, input.activityId, identity.aggregate_revision, eventType, JSON.stringify({ reason: input.reason }), input.occurredAtMs]);
        if (input.operation === "remove") {
          await transaction.execute("INSERT INTO imported_activity_removal_events(id, activity_id, removed_at_ms, reason) VALUES (?, ?, ?, ?)", [`${input.requestId}:removal`, input.activityId, input.occurredAtMs, input.reason]);
          const [match] = await transaction.queryAll<{ opportunity_id: string; relation_revision: number; schedule_id: string; schedule_version_id: string; slot_id: string; session_revision_id: string }>(`SELECT current.opportunity_id, current.relation_revision, opportunity.schedule_id, opportunity.schedule_version_id, opportunity.slot_id, opportunity.session_revision_id FROM running_activity_current_matches current JOIN running_opportunities opportunity ON opportunity.id = current.opportunity_id WHERE current.activity_id = ?`, [input.activityId]);
          if (match !== undefined) {
            const eventId = `${input.requestId}:match-invalidated`;
            await transaction.execute("DELETE FROM running_activity_current_matches WHERE activity_id = ?", [input.activityId]);
            await transaction.execute("INSERT INTO running_activity_match_events(id, activity_id, opportunity_id, prior_opportunity_id, action, activity_revision, opportunity_revision, prior_relation_revision, relation_revision, request_sha256, created_at_ms) VALUES (?, ?, ?, ?, 'invalidated', ?, 1, ?, ?, ?, ?)", [eventId, input.activityId, match.opportunity_id, match.opportunity_id, identity.aggregate_revision, match.relation_revision, match.relation_revision + 1, input.requestSha256, input.occurredAtMs]);
            await transaction.execute("INSERT INTO running_activity_match_receipts(request_id, request_sha256, activity_id, opportunity_id, relation_revision, result_kind, committed_at_ms) VALUES (?, ?, ?, ?, ?, 'invalidated', ?)", [`${input.requestId}:match`, input.requestSha256, input.activityId, match.opportunity_id, match.relation_revision + 1, input.occurredAtMs]);
            await transaction.execute("INSERT INTO imported_activity_match_invalidations(id, activity_id, aggregate_revision, reason, created_at_ms) VALUES (?, ?, ?, 'activity_removed', ?)", [`${input.requestId}:invalidate`, input.activityId, identity.aggregate_revision, input.occurredAtMs]);
          }
        }
        await transaction.execute("UPDATE imported_activity_current_lifecycle SET removal_state = ?, lifecycle_event_id = ? WHERE activity_id = ? AND aggregate_revision = ?", [input.operation === "remove" ? "removed" : "active", `${input.requestId}:event`, input.activityId, identity.aggregate_revision]);
        await transaction.execute("INSERT INTO imported_activity_receipts(id, activity_id, request_sha256, committed_at_ms) VALUES (?, ?, ?, ?)", [input.requestId, input.activityId, input.requestSha256, input.occurredAtMs]);
        return Object.freeze({ kind: input.operation === "remove" ? "removed" : "replayed", activityId: input.activityId, aggregateRevision: identity.aggregate_revision });
      });
    },
    async confirmGarminImport(input: ConfirmGarminImportInput): Promise<GarminImportResult> {
      return kernel.write(async (transaction) => {
        const reparsedEnvelope = parseGarminSourceEnvelope(input.staged.envelope);
        const canonicalPayloadJson = canonicalJson({
          normalization_version: reparsedEnvelope.normalization_version,
          normalized: reparsedEnvelope.normalized,
        });
        if (canonicalPayloadJson !== input.staged.canonical_payload_json) {
          return Object.freeze({
            kind: "conflict",
            activityId: input.activityId,
            aggregateRevision: input.expectedAggregateRevision,
          });
        }
        const canonicalDigest = await sha256(canonicalPayloadJson);
        if (canonicalDigest !== reparsedEnvelope.normalized_json_sha256) {
          return Object.freeze({
            kind: "conflict",
            activityId: input.activityId,
            aggregateRevision: input.expectedAggregateRevision,
          });
        }
        const [receipt] = await transaction.queryAll<Receipt>("SELECT request_sha256, activity_id FROM imported_activity_receipts WHERE id = ?", [input.requestId]);
        if (receipt !== undefined) {
          if (receipt.request_sha256 !== input.requestSha256) return Object.freeze({ kind: "conflict", activityId: input.activityId, aggregateRevision: input.expectedAggregateRevision });
          const [identity] = await transaction.queryAll<{ aggregate_revision: number }>(
            "SELECT aggregate_revision FROM imported_activity_identities WHERE activity_id = ?",
            [receipt.activity_id],
          );
          const [proposal] = await transaction.queryAll<{ proposed_revision: number }>(
            `SELECT proposal.proposed_revision
               FROM imported_activity_revision_proposals proposal
               LEFT JOIN imported_activity_revision_decisions decision
                 ON decision.activity_id = proposal.activity_id
                AND decision.proposed_revision = proposal.proposed_revision
              WHERE proposal.activity_id = ?
                AND (proposal.request_id = ? OR proposal.normalized_sha256 = ?)
                AND decision.request_id IS NULL`,
            [receipt.activity_id, input.requestId, input.staged.envelope.normalized_json_sha256],
          );
          if (proposal !== undefined) {
            return Object.freeze({
              kind: "revision_review",
              activityId: receipt.activity_id,
              aggregateRevision: identity?.aggregate_revision ?? input.expectedAggregateRevision,
            });
          }
          const [replayed] = await transaction.queryAll<{ aggregate_revision: number; removal_state: "active" | "removed" }>(`SELECT identity.aggregate_revision,
            COALESCE(lifecycle.removal_state, identity.removal_state) AS removal_state
            FROM imported_activity_identities identity
            LEFT JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = identity.activity_id
            WHERE identity.activity_id = ?`, [receipt.activity_id]);
          if (replayed === undefined) throw new Error("imported_activity_receipt_orphaned");
          return Object.freeze({ kind: replayed.removal_state === "removed" ? "removed" : "replayed", activityId: receipt.activity_id, aggregateRevision: replayed.aggregate_revision });
        }
        const envelope = reparsedEnvelope;
        const [existing] = await transaction.queryAll<{ activity_id: string; aggregate_revision: number; accepted_normalized_sha256: string; removal_state: "active" | "removed" }>(
          `SELECT identity.activity_id, identity.aggregate_revision, identity.accepted_normalized_sha256,
                  COALESCE(lifecycle.removal_state, identity.removal_state) AS removal_state
             FROM imported_activity_identities identity
             LEFT JOIN imported_activity_current_lifecycle lifecycle ON lifecycle.activity_id = identity.activity_id
            WHERE identity.source_kind = ? AND identity.account_namespace = ? AND identity.external_activity_id = ?`,
          [envelope.source_kind, envelope.account_namespace, envelope.external_activity_id],
        );
        const identityInput = existing === undefined
          ? { identity: { source_kind: envelope.source_kind, account_namespace: envelope.account_namespace, external_activity_id: envelope.external_activity_id }, removed: false, normalized_json_sha256: envelope.normalized_json_sha256 }
          : { identity: { source_kind: envelope.source_kind, account_namespace: envelope.account_namespace, external_activity_id: envelope.external_activity_id }, existing: { source_kind: envelope.source_kind, account_namespace: envelope.account_namespace, external_activity_id: envelope.external_activity_id, accepted_digest: existing.accepted_normalized_sha256 }, removed: existing.removal_state === "removed", normalized_json_sha256: envelope.normalized_json_sha256 };
        const outcome = classifyGarminActivityIdentity(identityInput);
        if (outcome.kind === "duplicate") return Object.freeze({ kind: "replayed", activityId: existing!.activity_id, aggregateRevision: existing!.aggregate_revision });
        if (outcome.kind === "removed") return Object.freeze({ kind: "removed", activityId: existing!.activity_id, aggregateRevision: existing!.aggregate_revision });
        if (outcome.kind === "revision_review") {
          const activityId = existing!.activity_id;
          const now = envelope.normalized.started_at_ms;
          const [priorProposal] = await transaction.queryAll<{ proposed_revision: number }>(
            `SELECT proposal.proposed_revision
               FROM imported_activity_revision_proposals proposal
               LEFT JOIN imported_activity_revision_decisions decision
                 ON decision.activity_id = proposal.activity_id
                AND decision.proposed_revision = proposal.proposed_revision
              WHERE proposal.activity_id = ? AND proposal.normalized_sha256 = ?
                AND decision.request_id IS NULL`,
            [activityId, envelope.normalized_json_sha256],
          );
          if (priorProposal === undefined) {
            const [latest] = await transaction.queryAll<{ proposed_revision: number }>(
              "SELECT MAX(proposed_revision) AS proposed_revision FROM imported_activity_revision_proposals WHERE activity_id = ?",
              [activityId],
            );
            const proposedRevision = Math.max(existing!.aggregate_revision, latest?.proposed_revision ?? 1) + 1;
            await transaction.execute(
              "INSERT INTO imported_activity_payloads(id, activity_id, payload_json, sha256) VALUES (?, ?, ?, ?)",
              [`${activityId}:payload:${proposedRevision}`, activityId, input.staged.canonical_payload_json, envelope.normalized_json_sha256],
            );
            for (const [kind, value] of Object.entries(envelope.raw_component_sha256)) {
              await transaction.execute(
                "INSERT INTO imported_activity_references(id, activity_id, reference_kind, reference_value) VALUES (?, ?, ?, ?)",
                [`${activityId}:proposal:${proposedRevision}:hash:${kind}`, activityId, `proposed_revision:${proposedRevision}:raw_component_sha256:${kind}`, value],
              );
            }
            await transaction.execute(
              `INSERT INTO imported_activity_revision_proposals
                (request_id, request_sha256, activity_id, proposed_revision,
                 normalized_sha256, envelope_json, confirmed_local_date, created_at_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [input.requestId, input.requestSha256, activityId, proposedRevision,
                envelope.normalized_json_sha256, aggregateJson(input), input.confirmedLocalDate, now],
            );
          }
          await transaction.execute(
            "INSERT INTO imported_activity_receipts(id, activity_id, request_sha256, committed_at_ms) VALUES (?, ?, ?, ?)",
            [input.requestId, activityId, input.requestSha256, now],
          );
          return Object.freeze({
            kind: "revision_review",
            activityId,
            aggregateRevision: existing!.aggregate_revision,
          });
        }
        if (outcome.kind !== "new") return Object.freeze({ kind: "conflict", activityId: existing?.activity_id ?? input.activityId, aggregateRevision: existing?.aggregate_revision ?? 0 });
        if (input.expectedAggregateRevision !== 0) return Object.freeze({ kind: "conflict", activityId: input.activityId, aggregateRevision: 0 });
        const now = envelope.normalized.started_at_ms;
        const aggregate = aggregateJson(input);
        await transaction.execute("INSERT INTO imported_activities(id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES (?, ?, ?, ?, ?, ?)", [input.activityId, `${envelope.source_kind}:${envelope.account_namespace}`, envelope.external_activity_id, envelope.normalized.started_at_ms, aggregate, now]);
        await transaction.execute("INSERT INTO imported_activity_identities(activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES (?, ?, ?, ?, 1, ?, 'active')", [input.activityId, envelope.source_kind, envelope.account_namespace, envelope.external_activity_id, envelope.normalized_json_sha256]);
        await transaction.execute("INSERT INTO imported_activity_payloads(id, activity_id, payload_json, sha256) VALUES (?, ?, ?, ?)", [`${input.activityId}:payload:1`, input.activityId, input.staged.canonical_payload_json, envelope.normalized_json_sha256]);
        for (const [kind, value] of Object.entries(envelope.raw_component_sha256)) await transaction.execute("INSERT INTO imported_activity_references(id, activity_id, reference_kind, reference_value) VALUES (?, ?, ?, ?)", [`${input.activityId}:hash:${kind}`, input.activityId, `raw_component_sha256:${kind}`, value]);
        for (const lap of envelope.normalized.laps) await transaction.execute("INSERT INTO imported_activity_laps(id, activity_id, ordinal, lap_json) VALUES (?, ?, ?, ?)", [`${input.activityId}:lap:${lap.ordinal}`, input.activityId, lap.ordinal, JSON.stringify(lap)]);
        for (const [ordinal, sample] of (envelope.normalized.samples ?? []).entries()) await transaction.execute("INSERT INTO imported_activity_chunks(id, activity_id, ordinal, chunk_json) VALUES (?, ?, ?, ?)", [`${input.activityId}:sample:${ordinal}`, input.activityId, ordinal, JSON.stringify(sample)]);
        const result: GarminImportResult = Object.freeze({ kind: "imported", activityId: input.activityId, aggregateRevision: 1 });
        await transaction.execute("INSERT INTO imported_activity_events(id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES (?, ?, 1, 'imported', ?, ?)", [`${input.activityId}:imported:1`, input.activityId, JSON.stringify({ normalized_json_sha256: envelope.normalized_json_sha256 }), now]);
        await transaction.execute("INSERT INTO imported_activity_current_lifecycle(activity_id, aggregate_revision, removal_state, lifecycle_event_id) VALUES (?, 1, 'active', ?)", [input.activityId, `${input.activityId}:imported:1`]);
        await transaction.execute("INSERT INTO imported_activity_receipts(id, activity_id, request_sha256, committed_at_ms) VALUES (?, ?, ?, ?)", [input.requestId, input.activityId, input.requestSha256, now]);
        // The schema's immutable receipt intentionally has no result column; authoritative read-back derives it.
        return result;
      });
    },
  });
}
