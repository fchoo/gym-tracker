import type {
  SqliteKernel,
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

export type HistoryProjectionEffectStore = Readonly<{
  claimNext(input: Readonly<{
    nowMs: number;
    leaseDurationMs: number;
    maxAttempts: number;
  }>): Promise<StoredHistoryProjectionEffect | null>;
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
  return Object.freeze({
    async claimNext(input) {
      return kernel.write(async (transaction) => {
        const [candidate] = await transaction.queryAll<{ id: string }>(
          `SELECT id
           FROM history_rebuild_effects
           WHERE status = 'pending'
             AND next_attempt_at_ms <= ?
             AND attempt_count < ?
           ORDER BY next_attempt_at_ms, created_at_ms, id
           LIMIT 1`,
          [input.nowMs, input.maxAttempts],
        );
        if (candidate === undefined) {
          return null;
        }
        const result = await transaction.execute(
          `UPDATE history_rebuild_effects
           SET status = 'processing',
               attempt_count = attempt_count + 1,
               claimed_at_ms = ?,
               lease_expires_at_ms = ?,
               last_error_code = NULL,
               updated_at_ms = ?
           WHERE id = ? AND status = 'pending'`,
          [
            input.nowMs,
            input.nowMs + input.leaseDurationMs,
            input.nowMs,
            candidate.id,
          ],
        );
        if (result.changes !== 1) {
          return null;
        }
        const [row] = await transaction.queryAll<ProjectionEffectRow>(
          `SELECT ${EFFECT_COLUMNS}
           FROM history_rebuild_effects
           WHERE id = ?`,
          [candidate.id],
        );
        return toStoredHistoryProjectionEffect(row!);
      });
    },

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

    complete: (id, nowMs) => transition(kernel, id, "completed", null, nowMs),
    supersede: (id, errorCode, nowMs) => transition(
      kernel,
      id,
      "superseded",
      safeCode(errorCode),
      nowMs,
    ),
    async retry(input) {
      await kernel.write(async (transaction) => {
        await transaction.execute(
          `UPDATE history_rebuild_effects
           SET status = 'pending',
               next_attempt_at_ms = ?,
               claimed_at_ms = NULL,
               lease_expires_at_ms = NULL,
               last_error_code = ?,
               updated_at_ms = ?
           WHERE id = ? AND status = 'processing'`,
          [
            input.nextAttemptAtMs,
            safeCode(input.errorCode),
            input.nowMs,
            input.id,
          ],
        );
      });
    },
    failPermanently: (id, errorCode, nowMs) => transition(
      kernel,
      id,
      "permanent_failure",
      safeCode(errorCode),
      nowMs,
    ),
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
      const effects: StoredHistoryProjectionEffect[] = [];
      for (let index = 0; index < drainInput.limit; index += 1) {
        const effect = await input.store.claimNext({
          nowMs: drainInput.nowMs,
          leaseDurationMs,
          maxAttempts: HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS,
        });
        if (effect === null) {
          break;
        }
        result.claimed += 1;
        effects.push(effect);
      }

      const settleFailure = async (
        effect: StoredHistoryProjectionEffect,
        error: unknown,
      ): Promise<void> => {
        const reason = failure(normalizeRebuildError(error));
        if (
          reason.kind === "transient"
          && effect.attemptCount < HISTORY_PROJECTION_EFFECT_MAX_ATTEMPTS
        ) {
          await input.store.retry({
            id: effect.id,
            errorCode: reason.code,
            nextAttemptAtMs: drainInput.nowMs
              + retryDelayMs * effect.attemptCount,
            nowMs: drainInput.nowMs,
          });
          result.retried += 1;
        } else {
          await input.store.failPermanently(
            effect.id,
            reason.code,
            drainInput.nowMs,
          );
          result.permanentFailures += 1;
        }
      };

      if (input.repository.rebuildSubjects !== undefined && effects.length > 0) {
        let outcomes;
        try {
          outcomes = await input.repository.rebuildSubjects({
            subjects: effects.map((effect) => ({
              subjectId: effect.subjectId,
              expectedRevision: effect.expectedRevision,
            })),
            nowMs: drainInput.nowMs,
          });
          if (outcomes.length !== effects.length) {
            throw new HistoryProjectionEffectError(
              "permanent",
              "history_projection_batch_outcome_invalid",
            );
          }
        } catch (error) {
          for (const effect of effects) {
            await settleFailure(effect, error);
          }
          return Object.freeze(result);
        }
        for (let index = 0; index < effects.length; index += 1) {
          const effect = effects[index]!;
          const outcome = outcomes[index]!;
          try {
            if (
              outcome.subjectId !== effect.subjectId
              || outcome.expectedRevision !== effect.expectedRevision
            ) {
              throw new HistoryProjectionEffectError(
                "permanent",
                "history_projection_batch_outcome_invalid",
              );
            }
            if (outcome.result === "stale") {
              await input.store.supersede(
                effect.id,
                "stale_source_revision",
                drainInput.nowMs,
              );
              result.superseded += 1;
            } else {
              await input.store.complete(effect.id, drainInput.nowMs);
              result.completed += 1;
            }
          } catch {
            // Projection rows already committed. Leave a failed terminal write
            // processing so its lease can be recovered safely on a later trigger.
          }
        }
        return Object.freeze(result);
      }

      for (const effect of effects) {
        const currentRevision = await input.repository.currentRevision(effect.subjectId);
        if (currentRevision !== effect.expectedRevision) {
          await input.store.supersede(
            effect.id,
            "stale_source_revision",
            drainInput.nowMs,
          );
          result.superseded += 1;
          continue;
        }
        try {
          const applied = await input.repository.rebuildSubject({
            subjectId: effect.subjectId,
            expectedRevision: effect.expectedRevision,
            nowMs: drainInput.nowMs,
          });
          if (applied === "stale") {
            await input.store.supersede(
              effect.id,
              "stale_source_revision",
              drainInput.nowMs,
            );
            result.superseded += 1;
            continue;
          }
          await input.store.complete(effect.id, drainInput.nowMs);
          result.completed += 1;
        } catch (error) {
          await settleFailure(effect, error);
        }
      }
      return Object.freeze(result);
    },
  });
}
