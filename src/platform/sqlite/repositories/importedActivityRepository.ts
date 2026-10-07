import type { ConfirmGarminImportInput, GarminImportResult } from "../../../domains/activities/importCommands";
import { classifyGarminActivityIdentity } from "../../../domains/activities/activityIdentity";
import type { SqliteKernel } from "../sqliteKernel";

type Receipt = Readonly<{ request_sha256: string; activity_id: string }>;

export function createImportedActivityRepository(kernel: SqliteKernel) {
  return Object.freeze({
    async confirmGarminImport(input: ConfirmGarminImportInput): Promise<GarminImportResult> {
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<Receipt>("SELECT request_sha256, activity_id FROM imported_activity_receipts WHERE id = ?", [input.requestId]);
        if (receipt !== undefined) {
          if (receipt.request_sha256 !== input.requestSha256) return Object.freeze({ kind: "conflict", activityId: input.activityId, aggregateRevision: input.expectedAggregateRevision });
          const [replayed] = await transaction.queryAll<{ aggregate_revision: number; removal_state: "active" | "removed" }>("SELECT aggregate_revision, removal_state FROM imported_activity_identities WHERE activity_id = ?", [receipt.activity_id]);
          if (replayed === undefined) throw new Error("imported_activity_receipt_orphaned");
          return Object.freeze({ kind: replayed.removal_state === "removed" ? "removed" : "replayed", activityId: receipt.activity_id, aggregateRevision: replayed.aggregate_revision });
        }
        const envelope = input.staged.envelope;
        const [existing] = await transaction.queryAll<{ activity_id: string; aggregate_revision: number; accepted_normalized_sha256: string; removal_state: "active" | "removed" }>(
          "SELECT activity_id, aggregate_revision, accepted_normalized_sha256, removal_state FROM imported_activity_identities WHERE source_kind = ? AND account_namespace = ? AND external_activity_id = ?",
          [envelope.source_kind, envelope.account_namespace, envelope.external_activity_id],
        );
        const identityInput = existing === undefined
          ? { identity: { source_kind: envelope.source_kind, account_namespace: envelope.account_namespace, external_activity_id: envelope.external_activity_id }, removed: false, normalized_json_sha256: envelope.normalized_json_sha256 }
          : { identity: { source_kind: envelope.source_kind, account_namespace: envelope.account_namespace, external_activity_id: envelope.external_activity_id }, existing: { source_kind: envelope.source_kind, account_namespace: envelope.account_namespace, external_activity_id: envelope.external_activity_id, accepted_digest: existing.accepted_normalized_sha256 }, removed: existing.removal_state === "removed", normalized_json_sha256: envelope.normalized_json_sha256 };
        const outcome = classifyGarminActivityIdentity(identityInput);
        if (outcome.kind === "duplicate") return Object.freeze({ kind: "replayed", activityId: existing!.activity_id, aggregateRevision: existing!.aggregate_revision });
        if (outcome.kind === "removed") return Object.freeze({ kind: "removed", activityId: existing!.activity_id, aggregateRevision: existing!.aggregate_revision });
        if (outcome.kind !== "new") return Object.freeze({ kind: outcome.kind === "revision_review" ? "revision_review" : "conflict", activityId: existing?.activity_id ?? input.activityId, aggregateRevision: existing?.aggregate_revision ?? 0 });
        if (input.expectedAggregateRevision !== 0) return Object.freeze({ kind: "conflict", activityId: input.activityId, aggregateRevision: 0 });
        const now = envelope.normalized.started_at_ms;
        const aggregate = JSON.stringify({ source_kind: envelope.source_kind, account_namespace: envelope.account_namespace, external_activity_id: envelope.external_activity_id, normalized_json_sha256: envelope.normalized_json_sha256, sample_fidelity: envelope.sample_fidelity, confirmed_local_date: input.confirmedLocalDate, normalized: envelope.normalized });
        await transaction.execute("INSERT INTO imported_activities(id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms) VALUES (?, ?, ?, ?, ?, ?)", [input.activityId, `${envelope.source_kind}:${envelope.account_namespace}`, envelope.external_activity_id, envelope.normalized.started_at_ms, aggregate, now]);
        await transaction.execute("INSERT INTO imported_activity_identities(activity_id, source_kind, account_namespace, external_activity_id, aggregate_revision, accepted_normalized_sha256, removal_state) VALUES (?, ?, ?, ?, 1, ?, 'active')", [input.activityId, envelope.source_kind, envelope.account_namespace, envelope.external_activity_id, envelope.normalized_json_sha256]);
        await transaction.execute("INSERT INTO imported_activity_payloads(id, activity_id, payload_json, sha256) VALUES (?, ?, ?, ?)", [`${input.activityId}:payload:1`, input.activityId, input.staged.canonical_payload_json, envelope.normalized_json_sha256]);
        for (const [kind, value] of Object.entries(envelope.raw_component_sha256)) await transaction.execute("INSERT INTO imported_activity_references(id, activity_id, reference_kind, reference_value) VALUES (?, ?, ?, ?)", [`${input.activityId}:hash:${kind}`, input.activityId, `raw_component_sha256:${kind}`, value]);
        for (const lap of envelope.normalized.laps) await transaction.execute("INSERT INTO imported_activity_laps(id, activity_id, ordinal, lap_json) VALUES (?, ?, ?, ?)", [`${input.activityId}:lap:${lap.ordinal}`, input.activityId, lap.ordinal, JSON.stringify(lap)]);
        for (const [ordinal, sample] of (envelope.normalized.samples ?? []).entries()) await transaction.execute("INSERT INTO imported_activity_chunks(id, activity_id, ordinal, chunk_json) VALUES (?, ?, ?, ?)", [`${input.activityId}:sample:${ordinal}`, input.activityId, ordinal, JSON.stringify(sample)]);
        const result: GarminImportResult = Object.freeze({ kind: "imported", activityId: input.activityId, aggregateRevision: 1 });
        await transaction.execute("INSERT INTO imported_activity_events(id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms) VALUES (?, ?, 1, 'imported', ?, ?)", [`${input.activityId}:imported:1`, input.activityId, JSON.stringify({ normalized_json_sha256: envelope.normalized_json_sha256 }), now]);
        await transaction.execute("INSERT INTO imported_activity_receipts(id, activity_id, request_sha256, committed_at_ms) VALUES (?, ?, ?, ?)", [input.requestId, input.activityId, input.requestSha256, now]);
        // The schema's immutable receipt intentionally has no result column; authoritative read-back derives it.
        return result;
      });
    },
  });
}
