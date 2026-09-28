import type { AutomaticBackupPresentationInput } from "../domains/backup/automaticBackupPresentation";
import type { Phase12BackupFixture } from "../bootstrap/phase12BackupTestControls";

const NOW = 1_790_591_564_000;
const HOUR = 60 * 60 * 1000;

/** Bounded synthetic state only; no account, token, Drive ID, or production namespace is present. */
export const PHASE12_AUTOMATIC_BACKUP_FIXTURES: Readonly<Record<Phase12BackupFixture, AutomaticBackupPresentationInput>> = Object.freeze({
  disconnected: { status: "not_connected", mutationGeneration: 0, backedUpGeneration: 0, nowMs: NOW },
  no_cloud: { status: "backup_pending", mutationGeneration: 1, backedUpGeneration: 0, nowMs: NOW },
  restore_required: { status: "restore_pending", mutationGeneration: 4, backedUpGeneration: 0, nowMs: NOW, recoveryPrompt: { kind: "latest", producedAtMs: NOW - HOUR } },
  previous_available: { status: "restore_pending", mutationGeneration: 4, backedUpGeneration: 0, nowMs: NOW, recoveryPrompt: { kind: "previous", producedAtMs: NOW - HOUR, previousProducedAtMs: NOW - 2 * HOUR } },
  update_required: { status: "restore_pending", mutationGeneration: 4, backedUpGeneration: 0, nowMs: NOW, reason: "update_required", recoveryPrompt: { kind: "update_required", producedAtMs: NOW - HOUR } },
  pending_24h: { status: "backup_pending", mutationGeneration: 4, backedUpGeneration: 2, pendingSinceMs: NOW - 24 * HOUR, lastSuccessfulBackupAtMs: NOW - 25 * HOUR, nowMs: NOW },
  stale_writer: { status: "paused", mutationGeneration: 4, backedUpGeneration: 2, nowMs: NOW, reason: "stale_writer" },
  deleted: { status: "paused", mutationGeneration: 0, backedUpGeneration: 0, nowMs: NOW, reason: "restore_required" },
});

export function phase12FixtureInput(fixture: Phase12BackupFixture): AutomaticBackupPresentationInput {
  return PHASE12_AUTOMATIC_BACKUP_FIXTURES[fixture];
}
