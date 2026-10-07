import {
  transitionBodyweight,
  validateBodyweightCommand,
  type BodyweightCommand,
  type BodyweightEntryState,
  type BodyweightTransition,
} from "../../../domains/bodyweight/contracts";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";

type EntryRow = Readonly<{
  id: string;
  owner_id: string;
  current_revision: number;
  lifecycle: "active" | "deleted";
}>;

type MeasurementRow = Readonly<{
  id: string;
  event_id: string;
  local_date: string;
  timezone: string;
  grams: number;
}>;

type ReceiptRow = Readonly<{ request_sha256: string; result_json: string }>;

function receiptTransition(value: string): BodyweightTransition {
  try {
    const parsed = JSON.parse(value) as BodyweightTransition;
    if (parsed.kind === "created" || parsed.kind === "edited" || parsed.kind === "deleted" || parsed.kind === "restored" || parsed.kind === "conflict") {
      return Object.freeze(parsed);
    }
  } catch {
    // The receipt is authoritative source data; malformed content is corruption.
  }
  throw new Error("bodyweight_receipt_invalid");
}

async function loadCurrent(
  transaction: Pick<SqliteTransactionExecutor, "queryAll">,
  entryId: string,
  ownerId: string,
): Promise<BodyweightEntryState | undefined> {
  const [entry] = await transaction.queryAll<EntryRow>(
    "SELECT id, owner_id, current_revision, lifecycle FROM bodyweight_entries WHERE id = ? AND owner_id = ?",
    [entryId, ownerId],
  );
  if (entry === undefined) return undefined;
  const [measurement] = await transaction.queryAll<MeasurementRow>(
    `SELECT id, event_id, local_date, timezone, grams
     FROM bodyweight_entry_events
     WHERE entry_id = ? AND local_date IS NOT NULL
     ORDER BY revision DESC, id DESC LIMIT 1`,
    [entryId],
  );
  if (measurement === undefined) throw new Error("bodyweight_entry_measurement_missing");
  const [latest] = await transaction.queryAll<{ id: string; event_id: string }>(
    "SELECT id, event_id FROM bodyweight_entry_events WHERE entry_id = ? AND revision = ?",
    [entryId, entry.current_revision],
  );
  if (latest === undefined) throw new Error("bodyweight_entry_revision_missing");
  return Object.freeze({
    entryId: entry.id,
    ownerId: entry.owner_id,
    revision: entry.current_revision,
    lifecycle: entry.lifecycle,
    revisionId: latest.id,
    eventId: latest.event_id,
    localDate: measurement.local_date,
    timezone: measurement.timezone,
    grams: measurement.grams,
  });
}

export function createBodyweightRepository(kernel: SqliteKernel) {
  return Object.freeze({
    async commit(input: BodyweightCommand): Promise<BodyweightTransition> {
      validateBodyweightCommand(input);
      return kernel.write(async (transaction) => {
        const [receipt] = await transaction.queryAll<ReceiptRow>(
          "SELECT request_sha256, result_json FROM bodyweight_command_receipts WHERE request_id = ?",
          [input.requestId],
        );
        if (receipt !== undefined) {
          if (receipt.request_sha256 !== input.requestSha256) {
            return Object.freeze({ kind: "conflict", entry: undefined, conflictCode: "entry_exists" });
          }
          return receiptTransition(receipt.result_json);
        }

        const [sameId] = await transaction.queryAll<{ owner_id: string }>(
          "SELECT owner_id FROM bodyweight_entries WHERE id = ?",
          [input.entryId],
        );
        if (sameId !== undefined && sameId.owner_id !== input.ownerId) {
          return Object.freeze({ kind: "conflict", entry: undefined, conflictCode: "entry_exists" });
        }
        const current = await loadCurrent(transaction, input.entryId, input.ownerId);
        const transition = transitionBodyweight(current, input);
        if (transition.kind === "conflict" || transition.entry === undefined) return transition;

        const next = transition.entry;
        if (transition.kind === "created") {
          await transaction.execute(
            "INSERT INTO bodyweight_entries(id, owner_id, current_revision, lifecycle, created_at_ms) VALUES (?, ?, ?, ?, ?)",
            [next.entryId, next.ownerId, next.revision, next.lifecycle, input.occurredAtMs],
          );
        } else {
          const changed = await transaction.execute(
            "UPDATE bodyweight_entries SET current_revision = ?, lifecycle = ? WHERE id = ? AND owner_id = ? AND current_revision = ?",
            [next.revision, next.lifecycle, next.entryId, next.ownerId, input.expectedRevision],
          );
          if (changed.changes !== 1) throw new Error("bodyweight_entry_revision_conflict");
        }
        await transaction.execute(
          `INSERT INTO bodyweight_entry_events
            (id, entry_id, owner_id, revision, event_id, operation, local_date, timezone, grams, occurred_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [input.revisionId, next.entryId, next.ownerId, next.revision, input.eventId, input.operation,
            input.localDate ?? null, input.timezone ?? null, input.grams ?? null, input.occurredAtMs],
        );
        const readBack = await loadCurrent(transaction, input.entryId, input.ownerId);
        if (readBack === undefined || readBack.revision !== next.revision || readBack.lifecycle !== next.lifecycle) {
          throw new Error("bodyweight_post_write_readback_failed");
        }
        const result = Object.freeze({ kind: transition.kind, entry: readBack }) as BodyweightTransition;
        await transaction.execute(
          "INSERT INTO bodyweight_command_receipts(request_id, request_sha256, entry_id, owner_id, result_json, committed_at_ms) VALUES (?, ?, ?, ?, ?, ?)",
          [input.requestId, input.requestSha256, next.entryId, next.ownerId, JSON.stringify(result), input.occurredAtMs],
        );
        return result;
      });
    },
    async history(ownerId: string): Promise<readonly BodyweightEntryState[]> {
      const entries = await kernel.queryAll<EntryRow>(
        "SELECT id, owner_id, current_revision, lifecycle FROM bodyweight_entries WHERE owner_id = ? ORDER BY created_at_ms DESC, id DESC",
        [ownerId],
      );
      return Promise.all(entries.map((entry) => loadCurrent(kernel, entry.id, entry.owner_id)))
        .then((rows) => Object.freeze(rows.filter((row): row is BodyweightEntryState => row !== undefined)));
    },
  });
}
