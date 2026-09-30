import type { LogicalBackupSnapshot } from "./backupContracts";
import { validateLogicalRestoreSnapshot, type RestoreCandidateProbePort, type RestoreRetainedReferencePort, type RestoreSchemaPort } from "./restoreCommands";
import type { PortableMergePlan, PortableMergePlanSnapshot } from "./mergePlan";

/** Transport-neutral automatic restore seam: callers supply an already bounded Drive snapshot. */
export type AutomaticPortableRestorePort = Readonly<{
  restore(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
}>;

export function createAutomaticPortableRestorePort(input: Readonly<{
  schema: RestoreSchemaPort; retainedReferences?: RestoreRetainedReferencePort; candidateProbe: RestoreCandidateProbePort;
  isWorkoutActive(): boolean | Promise<boolean>;
  localIsEmpty(): Promise<boolean>; claimIsCurrent(): Promise<boolean>;
  restore(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ state: "rebuild_pending" }>>;
  rebuild(): Promise<void>;
}>): AutomaticPortableRestorePort {
  return Object.freeze({
    async restore(snapshot) {
      if (await input.isWorkoutActive()) throw new Error("automatic_restore_workout_active");
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

/** Drive-only merge seam. It deliberately accepts no archive bytes, password, or picker handle. */
export type AutomaticPortableMergePort = Readonly<{
  preflight(snapshot: LogicalBackupSnapshot, grant?: Readonly<{ token: string }>): Promise<Readonly<{ token: string }>>;
  commit(token: string): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
}>;

export function createAutomaticPortableMergePort(input: Readonly<{
  schema: RestoreSchemaPort; retainedReferences?: RestoreRetainedReferencePort; candidateProbe: RestoreCandidateProbePort;
  isWorkoutActive(): boolean | Promise<boolean>; local(): Promise<PortableMergePlanSnapshot>;
  archive(snapshot: LogicalBackupSnapshot): PortableMergePlanSnapshot;
  build(input: Readonly<{ archive: PortableMergePlanSnapshot; local: PortableMergePlanSnapshot }>): Promise<PortableMergePlan>;
  fingerprint(): Promise<string>; issue(value: Readonly<{ plan: PortableMergePlan; fingerprint: string; grant?: string }>): string;
  consume(token: string): Readonly<{ plan: PortableMergePlan; fingerprint: string; grant?: string }> | null;
  commitPlan(input: Readonly<{ plan: PortableMergePlan; fingerprint: string; grant?: string }>): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
  rebuild(): Promise<void>;
}>): AutomaticPortableMergePort {
  return Object.freeze({
    async preflight(snapshot, grant) {
      if (await input.isWorkoutActive()) throw new Error("automatic_merge_workout_active");
      await validateLogicalRestoreSnapshot(snapshot, input.schema, input.retainedReferences);
      await input.candidateProbe.validateCandidate(snapshot);
      const plan = await input.build({ archive: input.archive(snapshot), local: await input.local() });
      const pending = { plan, fingerprint: await input.fingerprint(), ...(grant === undefined ? {} : { grant: grant.token }) };
      return Object.freeze({ token: input.issue(pending) });
    },
    async commit(token) {
      if (await input.isWorkoutActive()) throw new Error("automatic_merge_workout_active");
      const pending = input.consume(token); if (pending === null) throw new Error("automatic_merge_token_invalid");
      const result = await input.commitPlan(pending); await input.rebuild(); return result;
    },
  });
}
