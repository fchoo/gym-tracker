import type { LogicalBackupSnapshot } from "./backupContracts";
import { validateLogicalRestoreSnapshot, type RestoreCandidateProbePort, type RestoreRetainedReferencePort, type RestoreSchemaPort } from "./restoreCommands";

/** Transport-neutral automatic restore seam: callers supply an already bounded Drive snapshot. */
export type AutomaticPortableRestorePort = Readonly<{
  restore(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
}>;

export function createAutomaticPortableRestorePort(input: Readonly<{
  schema: RestoreSchemaPort; retainedReferences?: RestoreRetainedReferencePort; candidateProbe: RestoreCandidateProbePort;
  localIsEmpty(): Promise<boolean>; claimIsCurrent(): Promise<boolean>;
  restore(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ state: "rebuild_pending" }>>;
  rebuild(): Promise<void>;
}>): AutomaticPortableRestorePort {
  return Object.freeze({
    async restore(snapshot) {
      await validateLogicalRestoreSnapshot(snapshot, input.schema, input.retainedReferences);
      await input.candidateProbe.validateCandidate(snapshot);
      if (!await input.localIsEmpty()) throw new Error("automatic_restore_requires_merge");
      if (!await input.claimIsCurrent()) throw new Error("automatic_restore_claim_stale");
      const result = await input.restore(snapshot);
      await input.rebuild();
      return Object.freeze({ state: result.state === "rebuild_pending" ? "rebuild_pending" as const : "ready" as const });
    },
  });
}
