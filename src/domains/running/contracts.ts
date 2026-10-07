export type RunningSessionKind = "recovery" | "long_run" | "progression" | "tempo" | "intervals" | "hills" | "fartlek";

export type RunningReadiness = Readonly<{ ready: boolean; reason: "ready" | "missing_recovery" | "missing_slots" }>;

/** The first activation gate is intentionally strict and deliberately small. */
export function evaluateRunningReadiness(input: Readonly<{
  hasRecoveryRevision: boolean;
  slotCount: number;
}>): RunningReadiness {
  if (!input.hasRecoveryRevision) return Object.freeze({ ready: false, reason: "missing_recovery" });
  if (!Number.isSafeInteger(input.slotCount) || input.slotCount < 1) return Object.freeze({ ready: false, reason: "missing_slots" });
  return Object.freeze({ ready: true, reason: "ready" });
}
