import {
  type EffectStore,
  type PendingEffect,
  type PendingEffectType,
} from "./effectStore";

export const EFFECT_MAX_ATTEMPTS = 5 as const;
export const EFFECT_LEASE_DURATION_MS = 30_000 as const;
export const EFFECT_RETRY_DELAY_MS = 1_000 as const;

export type EffectFailureKind = "transient" | "permanent";

export class EffectExecutionError extends Error {
  constructor(
    readonly failureKind: EffectFailureKind,
    readonly code: string,
  ) {
    super(code);
    this.name = "EffectExecutionError";
  }
}

export type EffectHandler = (
  effect: PendingEffect,
) => Promise<void>;

export type EffectHandlers = Readonly<
  Record<PendingEffectType, EffectHandler>
>;

export type EffectDrainResult = Readonly<{
  claimed: number;
  completed: number;
  permanentFailures: number;
  retried: number;
  superseded: number;
}>;

type EffectRunnerOptions = Readonly<{
  store: EffectStore;
  effectType?: PendingEffectType;
  currentRevision(
    subjectId: string,
    effectType: PendingEffectType,
  ): Promise<number | null>;
  handlers: EffectHandlers;
  retryDelayMs?: number;
  leaseDurationMs?: number;
}>;

function safeFailure(error: unknown): Readonly<{
  kind: EffectFailureKind;
  code: string;
}> {
  if (error instanceof EffectExecutionError) {
    return {
      kind: error.failureKind,
      code: error.code,
    };
  }
  return {
    kind: "permanent",
    code: "effect_handler_failed",
  };
}

export function createEffectRunner(options: EffectRunnerOptions): Readonly<{
  drain(input: Readonly<{ nowMs: number; limit: number }>): Promise<EffectDrainResult>;
}> {
  const retryDelayMs = options.retryDelayMs ?? EFFECT_RETRY_DELAY_MS;
  const leaseDurationMs = options.leaseDurationMs ?? EFFECT_LEASE_DURATION_MS;

  return Object.freeze({
    async drain(input) {
      const result = {
        claimed: 0,
        completed: 0,
        permanentFailures: 0,
        retried: 0,
        superseded: 0,
      };

      for (let index = 0; index < input.limit; index += 1) {
        const effect = await options.store.claimNext({
          nowMs: input.nowMs,
          leaseDurationMs,
          maxAttempts: EFFECT_MAX_ATTEMPTS,
          ...(options.effectType === undefined
            ? {}
            : { effectType: options.effectType }),
        });
        if (effect === null) {
          break;
        }
        result.claimed += 1;

        const currentRevision = await options.currentRevision(
          effect.subjectId,
          effect.type,
        );
        if (currentRevision !== effect.expectedRevision) {
          await options.store.supersede(
            effect.id,
            "stale_source_revision",
            input.nowMs,
          );
          result.superseded += 1;
          continue;
        }

        try {
          await options.handlers[effect.type](effect);
          await options.store.complete(effect.id, input.nowMs);
          result.completed += 1;
        } catch (error) {
          const failure = safeFailure(error);
          const retryable = failure.kind === "transient"
            && effect.attemptCount < EFFECT_MAX_ATTEMPTS;
          if (retryable) {
            await options.store.retry(
              effect.id,
              failure.code,
              input.nowMs + retryDelayMs * effect.attemptCount,
              input.nowMs,
            );
            result.retried += 1;
          } else {
            await options.store.failPermanently(
              effect.id,
              failure.code,
              input.nowMs,
            );
            result.permanentFailures += 1;
          }
        }
      }

      return result;
    },
  });
}
