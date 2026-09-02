import type {
  SqliteKernel,
} from "../sqliteKernel";
import {
  SqliteStorageError,
} from "../sqliteKernel";
import {
  EFFECT_COLUMNS,
  toStoredHistoryProjectionEffect,
  type HistoryProjectionRepository,
  type ProjectionEffectRow,
  type StoredHistoryProjectionEffect,
} from "../repositories/historyProjectionRepository";

export const HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS = 5 as const;
export const HISTORY_PROJECTION_EFFECT_LEASE_DURATION_MS = 30_000 as const;
export const HISTORY_PROJECTION_EFFECT_RETRY_DELAY_MS = 1_000 as const;

export class HistoryProjectionEffectError extends Error {
  constructor(
    readonly kind: "transient" | "permanent",
    readonly code: string,
  ) {
    super(code);
  }
}

export type HistoryProjectionEffectSettlement = Readonly<
  | { id: string; outcome: "completed" }
  | { id: string; outcome: "superseded"; errorCode: string }
  | {
      id: string;
      outcome: "retry";
      errorCode: string;
      nextAttemptAtMs: number;
    }
  | { id: string; outcome: "permanent_failure"; errorCode: string }
>;

export type HistoryProjectionEffectStore = Readonly<{
  claimNext(input: Readonly<{
    nowMs: number;
    leaseDurationMs: number;
    maxAttempts: number;
  }>): Promise<StoredHistoryProjectionEffect | null>;
  claimBatch?: ((input: Readonly<{
    nowMs: number;
    leaseDurationMs: number;
    maxAttempts: number;
    limit: number;
  }>) => Promise<readonly StoredHistoryProjectionEffect[]>) | undefined;
  resetExpiredClaims(nowMs: number): Promise<number>;
  complete(id: string, nowMs: number): Promise<void>;
  supersede(id: string, errorCode: string, nowMs: number): Promise<void>;
  retry(input: Readonly<{
    id: string;
    errorCode: string;
    nextAttemptAtMs: number;
    nowMs: number;
  }>): Promise<void>;
  failPermanently(id: string, errorCode: string, nowMs: number): Promise<void>;
  settleBatch?: ((input: Readonly<{
    settlements: readonly HistoryProjectionEffectSettlement[];
    nowMs: number;
  }>) => Promise<void>) | undefined;
  findById(id: string): Promise<StoredHistoryProjectionEffect | null>;
}>;

function safeCode(value: string): string {
  return /^[A-Za-z0-9_:-]{3,80}$/u.test(value)
    ? value
    : "history_projection_effect_failed";
}

async function transition(
  kernel: SqliteKernel,
  id: string,
  status: "completed" | "superseded" | "permanent_failure",
  errorCode: string | null,
  nowMs: number,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `UPDATE history_rebuild_effects
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

export function createHistoryProjectionEffectStore(
  kernel: SqliteKernel,
): HistoryProjectionEffectStore {
  async function claimBatch(input: Readonly<{
    nowMs: number;
    leaseDurationMs: number;
    maxAttempts: number;
    limit: number;
  }>): Promise<readonly StoredHistoryProjectionEffect[]> {
    if (input.limit <= 0) {
      return Object.freeze([]);
    }
    return kernel.write(async (transaction) => {
      const candidates = await transaction.queryAll<{ id: string }>(
        `SELECT id
         FROM history_rebuild_effects
         WHERE status = 'pending'
           AND next_attempt_at_ms <= ?
           AND attempt_count < ?
         ORDER BY next_attempt_at_ms, created_at_ms, id
         LIMIT ?`,
        [input.nowMs, input.maxAttempts, input.limit],
      );
      if (candidates.length === 0) {
        return Object.freeze([]);
      }
      const ids = candidates.map(({ id }) => id);
      const placeholders = ids.map(() => "?").join(", ");
      const claimed = await transaction.execute(
        `UPDATE history_rebuild_effects
         SET status = 'processing',
             attempt_count = attempt_count + 1,
             claimed_at_ms = ?,
             lease_expires_at_ms = ?,
             last_error_code = NULL,
             updated_at_ms = ?
         WHERE id IN (${placeholders}) AND status = 'pending'`,
        [
          input.nowMs,
          input.nowMs + input.leaseDurationMs,
          input.nowMs,
          ...ids,
        ],
      );
      if (claimed.changes !== ids.length) {
        throw new Error("history_projection_claim_conflict");
      }
      const rows = await transaction.queryAll<ProjectionEffectRow>(
        `SELECT ${EFFECT_COLUMNS}
         FROM history_rebuild_effects
         WHERE id IN (${placeholders})`,
        ids,
      );
      const rowById = new Map(rows.map((row) => [row.id, row]));
      return Object.freeze(ids.map((id) => {
        const row = rowById.get(id);
        if (row === undefined) {
          throw new Error("history_projection_claim_missing");
        }
        return toStoredHistoryProjectionEffect(row);
      }));
    });
  }

  async function settleBatch(input: Readonly<{
    settlements: readonly HistoryProjectionEffectSettlement[];
    nowMs: number;
  }>): Promise<void> {
    if (input.settlements.length === 0) {
      return;
    }
    await kernel.write(async (transaction) => {
      for (const settlement of input.settlements) {
        const status = settlement.outcome === "retry"
          ? "pending"
          : settlement.outcome;
        const errorCode = settlement.outcome === "completed"
          ? null
          : safeCode(settlement.errorCode);
        const nextAttemptAtMs = settlement.outcome === "retry"
          ? settlement.nextAttemptAtMs
          : null;
        const updated = await transaction.execute(
          `UPDATE history_rebuild_effects
           SET status = ?,
               next_attempt_at_ms = COALESCE(?, next_attempt_at_ms),
               claimed_at_ms = NULL,
               lease_expires_at_ms = NULL,
               last_error_code = ?,
               updated_at_ms = ?
           WHERE id = ? AND status = 'processing'`,
          [status, nextAttemptAtMs, errorCode, input.nowMs, settlement.id],
        );
        if (updated.changes !== 1) {
          throw new Error("history_projection_terminal_conflict");
        }
      }
    });
  }

  return Object.freeze({
    async claimNext(input) {
      return (await claimBatch({ ...input, limit: 1 }))[0] ?? null;
    },
    claimBatch,

    async resetExpiredClaims(nowMs) {
      return kernel.write(async (transaction) => {
        const recovered = await transaction.execute(
          `UPDATE history_rebuild_effects
           SET status = 'pending',
               claimed_at_ms = NULL,
               lease_expires_at_ms = NULL,
               last_error_code = 'stale_claim_recovered',
               updated_at_ms = ?
           WHERE status = 'processing'
             AND lease_expires_at_ms <= ?
             AND attempt_count < ?`,
          [nowMs, nowMs, HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS],
        );
        const exhausted = await transaction.execute(
          `UPDATE history_rebuild_effects
           SET status = 'permanent_failure',
               claimed_at_ms = NULL,
               lease_expires_at_ms = NULL,
               last_error_code = 'history_projection_attempts_exhausted',
               updated_at_ms = ?
           WHERE status = 'processing'
             AND lease_expires_at_ms <= ?
             AND attempt_count >= ?`,
          [nowMs, nowMs, HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS],
        );
        return recovered.changes + exhausted.changes;
      });
    },

    complete: (id, nowMs) => settleBatch({
      settlements: [{ id, outcome: "completed" }],
      nowMs,
    }),
    supersede: (id, errorCode, nowMs) => transition(
      kernel,
      id,
      "superseded",
      safeCode(errorCode),
      nowMs,
    ),
    retry: (input) => settleBatch({
      settlements: [{
        id: input.id,
        outcome: "retry",
        errorCode: input.errorCode,
        nextAttemptAtMs: input.nextAttemptAtMs,
      }],
      nowMs: input.nowMs,
    }),
    failPermanently: (id, errorCode, nowMs) => transition(
      kernel,
      id,
      "permanent_failure",
      safeCode(errorCode),
      nowMs,
    ),
    settleBatch,
    async findById(id) {
      const [row] = await kernel.queryAll<ProjectionEffectRow>(
        `SELECT ${EFFECT_COLUMNS}
         FROM history_rebuild_effects
         WHERE id = ?`,
        [id],
      );
      return row === undefined ? null : toStoredHistoryProjectionEffect(row);
    },
  });
}

export type HistoryProjectionEffectDrainResult = Readonly<{
  claimed: number;
  completed: number;
  permanentFailures: number;
  retried: number;
  superseded: number;
}>;

function failure(error: unknown): Readonly<{
  kind: "transient" | "permanent";
  code: string;
}> {
  if (error instanceof HistoryProjectionEffectError) {
    return { kind: error.kind, code: safeCode(error.code) };
  }
  return { kind: "permanent", code: "history_projection_effect_failed" };
}

function normalizeRebuildError(error: unknown): unknown {
  if (error instanceof HistoryProjectionEffectError) {
    return error;
  }
  if (error instanceof SqliteStorageError && error.retryable) {
    return new HistoryProjectionEffectError("transient", error.code);
  }
  if (error instanceof Error) {
    const nested = typeof error === "object"
      && error !== null
      && "cause" in error
      && error.cause instanceof Error
      ? error.cause.message
      : error.message;
    return new HistoryProjectionEffectError(
      "permanent",
      nested.replace(/[^A-Za-z0-9_:-]/gu, "_").slice(0, 80),
    );
  }
  return error;
}

export function createHistoryProjectionEffectRunner(input: Readonly<{
  repository: HistoryProjectionRepository;
  store: HistoryProjectionEffectStore;
  retryDelayMs?: number;
  leaseDurationMs?: number;
}>): Readonly<{
  drain(input: Readonly<{
    nowMs: number;
    limit: number;
  }>): Promise<HistoryProjectionEffectDrainResult>;
}> {
  const retryDelayMs = input.retryDelayMs ?? HISTORY_PROJECTION_EFFECT_RETRY_DELAY_MS;
  const leaseDurationMs = input.leaseDurationMs
    ?? HISTORY_PROJECTION_EFFECT_LEASE_DURATION_MS;
  return Object.freeze({
    async drain(drainInput) {
      const result = {
        claimed: 0,
        completed: 0,
        permanentFailures: 0,
        retried: 0,
        superseded: 0,
      };
      const claimInput = {
        nowMs: drainInput.nowMs,
        leaseDurationMs,
        maxAttempts: HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS,
      };
      const effects: readonly StoredHistoryProjectionEffect[] =
        input.store.claimBatch === undefined
          ? await (async () => {
            const claimed: StoredHistoryProjectionEffect[] = [];
            for (let index = 0; index < drainInput.limit; index += 1) {
              const effect = await input.store.claimNext(claimInput);
              if (effect === null) {
                break;
              }
              claimed.push(effect);
            }
            return Object.freeze(claimed);
          })()
          : await input.store.claimBatch({
            ...claimInput,
            limit: drainInput.limit,
          });
      result.claimed = effects.length;

      type Counter = Exclude<keyof typeof result, "claimed">;
      type PlannedSettlement = Readonly<{
        settlement: HistoryProjectionEffectSettlement;
        counter: Counter;
      }>;
      const failureSettlement = (
        effect: StoredHistoryProjectionEffect,
        error: unknown,
      ): PlannedSettlement => {
        const reason = failure(normalizeRebuildError(error));
        if (
          reason.kind === "transient"
          && effect.attemptCount < HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS
        ) {
          return {
            settlement: {
              id: effect.id,
              outcome: "retry",
              errorCode: reason.code,
              nextAttemptAtMs: drainInput.nowMs
                + retryDelayMs * effect.attemptCount,
            },
            counter: "retried",
          };
        }
        return {
          settlement: {
            id: effect.id,
            outcome: "permanent_failure",
            errorCode: reason.code,
          },
          counter: "permanentFailures",
        };
      };
      const applySettlements = async (
        planned: readonly PlannedSettlement[],
      ): Promise<void> => {
        if (planned.length === 0) {
          return;
        }
        if (input.store.settleBatch !== undefined) {
          try {
            await input.store.settleBatch({
              settlements: planned.map(({ settlement }) => settlement),
              nowMs: drainInput.nowMs,
            });
          } catch {
            return;
          }
          for (const { counter } of planned) {
            result[counter] += 1;
          }
          return;
        }
        for (const { settlement, counter } of planned) {
          try {
            switch (settlement.outcome) {
              case "completed":
                await input.store.complete(settlement.id, drainInput.nowMs);
                break;
              case "superseded":
                await input.store.supersede(
                  settlement.id,
                  settlement.errorCode,
                  drainInput.nowMs,
                );
                break;
              case "retry":
                await input.store.retry({
                  id: settlement.id,
                  errorCode: settlement.errorCode,
                  nextAttemptAtMs: settlement.nextAttemptAtMs,
                  nowMs: drainInput.nowMs,
                });
                break;
              case "permanent_failure":
                await input.store.failPermanently(
                  settlement.id,
                  settlement.errorCode,
                  drainInput.nowMs,
                );
                break;
            }
            result[counter] += 1;
          } catch {
            // Projection work may already be committed. Preserve processing so
            // lease recovery can retry the terminal write on a later trigger.
          }
        }
      };
      const rebuildIndividually = async (): Promise<void> => {
        const planned: PlannedSettlement[] = [];
        for (const effect of effects) {
          try {
            const currentRevision = await input.repository.currentRevision(
              effect.subjectId,
            );
            const applied = currentRevision === effect.expectedRevision
              ? await input.repository.rebuildSubject({
                subjectId: effect.subjectId,
                expectedRevision: effect.expectedRevision,
                nowMs: drainInput.nowMs,
              })
              : "stale" as const;
            planned.push(applied === "stale"
              ? {
                settlement: {
                  id: effect.id,
                  outcome: "superseded",
                  errorCode: "stale_source_revision",
                },
                counter: "superseded",
              }
              : {
                settlement: { id: effect.id, outcome: "completed" },
                counter: "completed",
              });
          } catch (error) {
            planned.push(failureSettlement(effect, error));
          }
        }
        await applySettlements(planned);
      };

      if (input.repository.rebuildSubjects !== undefined && effects.length > 0) {
        try {
          const outcomes = await input.repository.rebuildSubjects({
            subjects: effects.map((effect) => ({
              subjectId: effect.subjectId,
              expectedRevision: effect.expectedRevision,
            })),
            nowMs: drainInput.nowMs,
          });
          if (
            outcomes.length !== effects.length
            || outcomes.some((outcome, index) => (
              outcome.subjectId !== effects[index]!.subjectId
              || outcome.expectedRevision !== effects[index]!.expectedRevision
            ))
          ) {
            throw new HistoryProjectionEffectError(
              "permanent",
              "history_projection_batch_outcome_invalid",
            );
          }
          await applySettlements(outcomes.map((outcome, index) => (
            outcome.result === "stale"
              ? {
                settlement: {
                  id: effects[index]!.id,
                  outcome: "superseded",
                  errorCode: "stale_source_revision",
                },
                counter: "superseded",
              }
              : {
                settlement: {
                  id: effects[index]!.id,
                  outcome: "completed",
                },
                counter: "completed",
              }
          )));
          return Object.freeze(result);
        } catch {
          await rebuildIndividually();
          return Object.freeze(result);
        }
      }

      await rebuildIndividually();
      return Object.freeze(result);
    },
  });
}
