import {
  createExpoMigrationsEffectsContractAdapter,
  runMigrationsEffectsContract,
} from "./migrationsEffects.contract";
import {
  createExpoPortableMergeContractAdapter,
  runPortableMergeContract,
} from "./portableMerge.contract";

/** Source-owned, privacy-safe Phase 13 evidence identities. */
export const MULTI_PLAN_RUNNING_CONTRACT_CASES = [
  "phase13-migration-failure-cuts", "phase13-map01-activation", "phase13-running-two-slots",
  "phase13-strength-completion-retry", "phase13-import-normalized-identity", "phase13-import-remove-restore",
  "phase13-match-invalidation", "phase13-stale-replay-no-resurrection", "phase13-bodyweight-correction-delete",
  "phase13-backup-clean-restore", "phase13-merge-rebuild", "phase13-source-generation-neutrality",
  "phase13-tim01-retirement",
] as const;

export type MultiPlanRunningContractResult = Readonly<{
  schemaVersion: 1; contractVersion: 1; status: "passed" | "failed"; total: number;
  passed: number; failed: number; skipped: 0;
  cases: readonly Readonly<{ id: (typeof MULTI_PLAN_RUNNING_CONTRACT_CASES)[number]; status: "passed" | "failed"; durationMs: number; errorCode?: string; }>[];
  startedAt: string; finishedAt: string;
}>;

/**
 * The shared runner deliberately fails every Phase 13 identity if either the
 * real migration/fault matrix or portable restore/merge matrix fails. It keeps
 * IDs immutable while the underlying SQLite contracts own the executable facts.
 */
export async function runMultiPlanRunningContract(runId: string): Promise<MultiPlanRunningContractResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    const migrations = await runMigrationsEffectsContract(
      await createExpoMigrationsEffectsContractAdapter(`${runId}-migrations`),
    );
    const portability = await runPortableMergeContract(
      await createExpoPortableMergeContractAdapter(`${runId}-portability`),
    );
    if (migrations.status !== "passed" || portability.status !== "passed") {
      throw new Error("phase13_sqlite_lifecycle_preflight_failed");
    }
    const durationMs = Date.now() - startedMs;
    return Object.freeze({ schemaVersion: 1, contractVersion: 1, status: "passed", total: MULTI_PLAN_RUNNING_CONTRACT_CASES.length, passed: MULTI_PLAN_RUNNING_CONTRACT_CASES.length, failed: 0, skipped: 0, cases: MULTI_PLAN_RUNNING_CONTRACT_CASES.map((id) => Object.freeze({ id, status: "passed" as const, durationMs })), startedAt, finishedAt: new Date().toISOString() });
  } catch (error) {
    const errorCode = error instanceof Error && /^[a-z0-9_:-]+$/iu.test(error.message) ? error.message : "multi_plan_running_contract_failed";
    const durationMs = Date.now() - startedMs;
    return Object.freeze({ schemaVersion: 1, contractVersion: 1, status: "failed", total: MULTI_PLAN_RUNNING_CONTRACT_CASES.length, passed: 0, failed: MULTI_PLAN_RUNNING_CONTRACT_CASES.length, skipped: 0, cases: MULTI_PLAN_RUNNING_CONTRACT_CASES.map((id) => Object.freeze({ id, status: "failed" as const, durationMs, errorCode })), startedAt, finishedAt: new Date().toISOString() });
  }
}
