import {
  type SqliteKernel,
  type SqliteTransactionExecutor,
} from "../sqliteKernel";

export const PENDING_EFFECT_TYPES = [
  "reconcile_rest_notification",
  "regenerate_load_reps_recommendation",
] as const;

export type PendingEffectType = (typeof PENDING_EFFECT_TYPES)[number];

export type PendingEffectStatus =
  | "pending"
  | "processing"
  | "completed"
  | "superseded"
  | "permanent_failure";

export type PendingEffect = Readonly<{
  id: string;
  type: PendingEffectType;
  payloadVersion: number;
  payload: unknown;
  idempotencyKey: string;
  subjectId: string;
  expectedRevision: number;
  status: PendingEffectStatus;
  attemptCount: number;
  nextAttemptAtMs: number;
  claimedAtMs: number | null;
  leaseExpiresAtMs: number | null;
  lastErrorCode: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}>;

export type EnqueuePendingEffectInput = Readonly<{
  id: string;
  type: PendingEffectType;
  payloadVersion: number;
  payload: unknown;
  idempotencyKey: string;
  subjectId: string;
  expectedRevision: number;
  nowMs: number;
}>;

type PendingEffectRow = Readonly<{
  id: string;
  effect_type: PendingEffectType;
  payload_version: number;
  payload_json: string;
  idempotency_key: string;
  subject_id: string;
  expected_revision: number;
  status: PendingEffectStatus;
  attempt_count: number;
  next_attempt_at_ms: number;
  claimed_at_ms: number | null;
  lease_expires_at_ms: number | null;
  last_error_code: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}>;

const EFFECT_COLUMNS = `
  id,
  effect_type,
  payload_version,
  payload_json,
  idempotency_key,
  subject_id,
  expected_revision,
  status,
  attempt_count,
  next_attempt_at_ms,
  claimed_at_ms,
  lease_expires_at_ms,
  last_error_code,
  created_at_ms,
  updated_at_ms
`;

function toPendingEffect(row: PendingEffectRow): PendingEffect {
  return {
    id: row.id,
    type: row.effect_type,
    payloadVersion: row.payload_version,
    payload: JSON.parse(row.payload_json) as unknown,
    idempotencyKey: row.idempotency_key,
    subjectId: row.subject_id,
    expectedRevision: row.expected_revision,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAtMs: row.next_attempt_at_ms,
    claimedAtMs: row.claimed_at_ms,
    leaseExpiresAtMs: row.lease_expires_at_ms,
    lastErrorCode: row.last_error_code,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export async function enqueuePendingEffect(
  transaction: SqliteTransactionExecutor,
  input: EnqueuePendingEffectInput,
): Promise<"inserted" | "coalesced"> {
  const result = await transaction.execute(
    `INSERT INTO pending_effects
      (id, effect_type, payload_version, payload_json, idempotency_key,
       subject_id, expected_revision, status, attempt_count,
       next_attempt_at_ms, claimed_at_ms, lease_expires_at_ms,
       last_error_code, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, NULL, NULL, ?, ?)
     ON CONFLICT DO NOTHING`,
    [
      input.id,
      input.type,
      input.payloadVersion,
      JSON.stringify(input.payload),
      input.idempotencyKey,
      input.subjectId,
      input.expectedRevision,
      input.nowMs,
      input.nowMs,
      input.nowMs,
    ],
  );
  return result.changes === 1 ? "inserted" : "coalesced";
}

export type ClaimOptions = Readonly<{
  nowMs: number;
  leaseDurationMs: number;
  maxAttempts: number;
  effectType?: PendingEffectType;
}>;

export interface EffectStore {
  claimNext(options: ClaimOptions): Promise<PendingEffect | null>;
  resetExpiredClaims(nowMs: number): Promise<number>;
  complete(id: string, nowMs: number): Promise<void>;
  supersede(id: string, errorCode: string, nowMs: number): Promise<void>;
  retry(
    id: string,
    errorCode: string,
    nextAttemptAtMs: number,
    nowMs: number,
  ): Promise<void>;
  failPermanently(id: string, errorCode: string, nowMs: number): Promise<void>;
  findById(id: string): Promise<PendingEffect | null>;
}

async function transition(
  kernel: SqliteKernel,
  id: string,
  status: Exclude<PendingEffectStatus, "pending" | "processing">,
  errorCode: string | null,
  nowMs: number,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `UPDATE pending_effects
       SET status = ?,
           claimed_at_ms = NULL,
           lease_expires_at_ms = NULL,
           last_error_code = ?,
           updated_at_ms = ?
       WHERE id = ? AND status = 'processing'`,
      [status, errorCode, nowMs, id],
    );
  });
}

export function createEffectStore(kernel: SqliteKernel): EffectStore {
  const store: EffectStore = {
    async claimNext(options: ClaimOptions) {
      return kernel.write(async (transaction) => {
        const [candidate] = await transaction.queryAll<{ id: string }>(
          `SELECT id
           FROM pending_effects
           WHERE status = 'pending'
             AND (? IS NULL OR effect_type = ?)
             AND next_attempt_at_ms <= ?
             AND attempt_count < ?
           ORDER BY next_attempt_at_ms, created_at_ms, id
           LIMIT 1`,
          [
            options.effectType ?? null,
            options.effectType ?? null,
            options.nowMs,
            options.maxAttempts,
          ],
        );
        if (candidate === undefined) {
          return null;
        }

        const result = await transaction.execute(
          `UPDATE pending_effects
           SET status = 'processing',
               attempt_count = attempt_count + 1,
               claimed_at_ms = ?,
               lease_expires_at_ms = ?,
               last_error_code = NULL,
               updated_at_ms = ?
           WHERE id = ? AND status = 'pending'`,
          [
            options.nowMs,
            options.nowMs + options.leaseDurationMs,
            options.nowMs,
            candidate.id,
          ],
        );
        if (result.changes !== 1) {
          return null;
        }
        const [row] = await transaction.queryAll<PendingEffectRow>(
          `SELECT ${EFFECT_COLUMNS} FROM pending_effects WHERE id = ?`,
          [candidate.id],
        );
        return toPendingEffect(row!);
      });
    },

    async resetExpiredClaims(nowMs: number) {
      return kernel.write(async (transaction) => {
        const result = await transaction.execute(
          `UPDATE pending_effects
           SET status = 'pending',
               claimed_at_ms = NULL,
               lease_expires_at_ms = NULL,
               last_error_code = 'stale_claim_recovered',
               updated_at_ms = ?
           WHERE status = 'processing'
             AND lease_expires_at_ms <= ?`,
          [nowMs, nowMs],
        );
        return result.changes;
      });
    },

    complete: (id: string, nowMs: number) =>
      transition(kernel, id, "completed", null, nowMs),

    supersede: (id: string, errorCode: string, nowMs: number) =>
      transition(kernel, id, "superseded", errorCode, nowMs),

    async retry(
      id: string,
      errorCode: string,
      nextAttemptAtMs: number,
      nowMs: number,
    ) {
      await kernel.write(async (transaction) => {
        await transaction.execute(
          `UPDATE pending_effects
           SET status = 'pending',
               next_attempt_at_ms = ?,
               claimed_at_ms = NULL,
               lease_expires_at_ms = NULL,
               last_error_code = ?,
               updated_at_ms = ?
           WHERE id = ? AND status = 'processing'`,
          [nextAttemptAtMs, errorCode, nowMs, id],
        );
      });
    },

    failPermanently: (id: string, errorCode: string, nowMs: number) =>
      transition(kernel, id, "permanent_failure", errorCode, nowMs),

    async findById(id: string) {
      const [row] = await kernel.queryAll<PendingEffectRow>(
        `SELECT ${EFFECT_COLUMNS} FROM pending_effects WHERE id = ?`,
        [id],
      );
      return row === undefined ? null : toPendingEffect(row);
    },
  };
  return Object.freeze(store);
}
