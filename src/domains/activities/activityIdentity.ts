export type GarminActivityIdentity = Readonly<{ source_kind: "garmin_connect_account"; account_namespace: string; external_activity_id: string }>;
export type ExistingGarminActivityIdentity = GarminActivityIdentity & Readonly<{ accepted_digest: string }>;
export type GarminIdentityOutcome = Readonly<{ kind: "new" | "duplicate" | "revision_review" | "review" | "conflict" | "removed" }>;

/** Account/external identity is authoritative. Digests distinguish immutable revisions, never fuzzy-merge. */
export function classifyGarminActivityIdentity(input: Readonly<{ identity: GarminActivityIdentity; existing?: ExistingGarminActivityIdentity; removed: boolean; normalized_json_sha256: string }>): GarminIdentityOutcome {
  if (input.existing === undefined) return Object.freeze({ kind: "new" });
  if (input.existing.source_kind !== input.identity.source_kind || input.existing.account_namespace !== input.identity.account_namespace || input.existing.external_activity_id !== input.identity.external_activity_id) return Object.freeze({ kind: "conflict" });
  if (input.removed) return Object.freeze({ kind: "removed" });
  return Object.freeze({ kind: input.existing.accepted_digest === input.normalized_json_sha256 ? "duplicate" : "revision_review" });
}
