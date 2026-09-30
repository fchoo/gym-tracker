import { phase12BackupFixtureInput, type Phase12BackupFixture } from "../bootstrap/phase12BackupTestControls";

export const PHASE12_FIXTURE_IDS = Object.freeze([
  "disconnected", "no_cloud", "backup_pending", "backing_up", "backed_up", "auth_attention",
  "checking", "restoring", "finishing", "restore_required", "merge_review", "previous_available",
  "update_required", "invalid_artifacts", "pending_24h", "stale_writer", "deleted", "deletion_partial",
] as const satisfies readonly Phase12BackupFixture[]);

/** Bounded synthetic state only; no account, token, Drive ID, or production namespace is present. */
export const PHASE12_AUTOMATIC_BACKUP_FIXTURES = Object.freeze(Object.fromEntries(
  PHASE12_FIXTURE_IDS.map((fixture) => [fixture, phase12BackupFixtureInput(fixture)]),
)) as Readonly<Record<Phase12BackupFixture, ReturnType<typeof phase12BackupFixtureInput>>>;

export function phase12FixtureInput(fixture: Phase12BackupFixture) {
  return phase12BackupFixtureInput(fixture);
}
