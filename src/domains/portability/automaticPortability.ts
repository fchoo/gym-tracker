import type { LogicalBackupSnapshot } from "./backupContracts";
import type { AutomaticNamespaceAdoptionCommit, AutomaticNamespaceAdoptionGrant } from "./mergeCommands";
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
  preflight(snapshot: LogicalBackupSnapshot): Promise<Readonly<{ token: string; adoptionRequired: boolean }>>;
  commit(token: string, grant?: AutomaticNamespaceAdoptionGrant): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
}>;

type PendingAutomaticMerge = Readonly<{
  plan: PortableMergePlan;
  fingerprint: string;
  adoption?: Readonly<Pick<AutomaticNamespaceAdoptionCommit,
    "oldNamespace" | "newNamespace" | "remoteSnapshotSha256">>;
}>;

function namespace(snapshot: PortableMergePlanSnapshot): string | null {
  const row = snapshot.tables.portable_owner_identity?.[0];
  return typeof row?.owner_namespace === "string" ? row.owner_namespace : null;
}

function withNamespace(snapshot: PortableMergePlanSnapshot, ownerNamespace: string): PortableMergePlanSnapshot {
  return Object.freeze({
    ...snapshot,
    tables: Object.freeze({
      ...snapshot.tables,
      portable_owner_identity: Object.freeze([{ id: 1, owner_namespace: ownerNamespace }]),
    }),
  });
}

export function createAutomaticPortableMergePort(input: Readonly<{
  schema: RestoreSchemaPort; retainedReferences?: RestoreRetainedReferencePort; candidateProbe: RestoreCandidateProbePort;
  isWorkoutActive(): boolean | Promise<boolean>; local(): Promise<PortableMergePlanSnapshot>;
  archive(snapshot: LogicalBackupSnapshot): PortableMergePlanSnapshot;
  build(input: Readonly<{ archive: PortableMergePlanSnapshot; local: PortableMergePlanSnapshot }>): Promise<PortableMergePlan>;
  fingerprint(): Promise<string>; snapshotDigest?(snapshot: LogicalBackupSnapshot): Promise<string>;
  nowMs?(): number;
  issue(value: PendingAutomaticMerge): string;
  consume(token: string): PendingAutomaticMerge | null;
  commitPlan(input: Readonly<{ plan: PortableMergePlan; fingerprint: string; adoption?: AutomaticNamespaceAdoptionCommit }>): Promise<Readonly<{ state: "ready" | "rebuild_pending" }>>;
  rebuild(): Promise<void>;
}>): AutomaticPortableMergePort {
  return Object.freeze({
    async preflight(snapshot) {
      if (await input.isWorkoutActive()) throw new Error("automatic_merge_workout_active");
      await validateLogicalRestoreSnapshot(snapshot, input.schema, input.retainedReferences);
      await input.candidateProbe.validateCandidate(snapshot);
      const local = await input.local();
      const archive = input.archive(snapshot);
      const oldNamespace = namespace(local);
      const newNamespace = namespace(archive);
      const adoptionRequired = oldNamespace !== null && newNamespace !== null
        && oldNamespace !== newNamespace;
      const plan = await input.build({
        archive: adoptionRequired ? withNamespace(archive, oldNamespace) : archive,
        local,
      });
      const fingerprint = await input.fingerprint();
      const adoption = adoptionRequired
        ? Object.freeze({
          oldNamespace: oldNamespace!,
          newNamespace: newNamespace!,
          remoteSnapshotSha256: await input.snapshotDigest?.(snapshot)
            ?? (() => { throw new Error("automatic_merge_snapshot_digest_missing"); })(),
        })
        : undefined;
      const pending = { plan, fingerprint, ...(adoption === undefined ? {} : { adoption }) };
      return Object.freeze({ token: input.issue(pending), adoptionRequired });
    },
    async commit(token, grant) {
      if (await input.isWorkoutActive()) throw new Error("automatic_merge_workout_active");
      const pending = input.consume(token); if (pending === null) throw new Error("automatic_merge_token_invalid");
      if (pending.adoption !== undefined && grant === undefined) throw new Error("automatic_merge_adoption_grant_required");
      if (pending.adoption === undefined && grant !== undefined) throw new Error("automatic_merge_adoption_grant_unexpected");
      if (grant !== undefined && (!Number.isSafeInteger(grant.connectionGeneration)
        || grant.connectionGeneration < 0
        || !Number.isSafeInteger(grant.expiresAtMs)
        || grant.expiresAtMs < (input.nowMs?.() ?? Date.now()))) {
        throw new Error("automatic_merge_adoption_grant_invalid");
      }
      const adoption = pending.adoption === undefined || grant === undefined
        ? undefined
        : Object.freeze({ ...pending.adoption, ...grant, localFingerprint: pending.fingerprint });
      const result = await input.commitPlan({
        plan: pending.plan,
        fingerprint: pending.fingerprint,
        ...(adoption === undefined ? {} : { adoption }),
      });
      await input.rebuild(); return result;
    },
  });
}
