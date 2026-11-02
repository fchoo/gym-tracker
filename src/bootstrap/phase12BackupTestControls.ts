import { projectAutomaticBackupPresentation, type AutomaticBackupPresentationInput, type AutomaticBackupViewModel } from "../domains/backup/automaticBackupPresentation";

export type Phase12BackupFixture = "disconnected" | "no_cloud" | "backup_pending" | "backing_up" | "backed_up" | "auth_attention" | "checking" | "restoring" | "finishing" | "restore_required" | "merge_review" | "previous_available" | "update_required" | "invalid_artifacts" | "pending_24h" | "stale_writer" | "deleted" | "deletion_partial";

const allowed = new Set<Phase12BackupFixture>(["disconnected", "no_cloud", "backup_pending", "backing_up", "backed_up", "auth_attention", "checking", "restoring", "finishing", "restore_required", "merge_review", "previous_available", "update_required", "invalid_artifacts", "pending_24h", "stale_writer", "deleted", "deletion_partial"]);
const NOW = 1_790_591_564_000;
const HOUR = 60 * 60 * 1000;
const fixtures: Readonly<Record<Phase12BackupFixture, AutomaticBackupPresentationInput>> = Object.freeze({
  disconnected: { status: "not_connected", mutationGeneration: 0, backedUpGeneration: 0, nowMs: NOW },
  no_cloud: { status: "backup_pending", mutationGeneration: 1, backedUpGeneration: 0, nowMs: NOW, reason: "no_cloud" },
  backup_pending: { status: "backup_pending", mutationGeneration: 2, backedUpGeneration: 1, nowMs: NOW },
  backing_up: { status: "backing_up", mutationGeneration: 2, backedUpGeneration: 1, nowMs: NOW },
  backed_up: { status: "idle", mutationGeneration: 2, backedUpGeneration: 2, nowMs: NOW },
  auth_attention: { status: "paused", mutationGeneration: 2, backedUpGeneration: 1, nowMs: NOW, reason: "authentication_required" },
  checking: { status: "restore_pending", mutationGeneration: 2, backedUpGeneration: 0, nowMs: NOW, progressStage: "Checking backup" },
  restoring: { status: "restoring", mutationGeneration: 2, backedUpGeneration: 0, nowMs: NOW, progressStage: "Restoring on this phone" },
  finishing: { status: "restoring", mutationGeneration: 2, backedUpGeneration: 0, nowMs: NOW, progressStage: "Finishing backup setup" },
  restore_required: { status: "restore_pending", mutationGeneration: 4, backedUpGeneration: 0, nowMs: NOW, recoveryPrompt: { kind: "latest", producedAtMs: NOW - HOUR } },
  merge_review: { status: "restore_pending", mutationGeneration: 4, backedUpGeneration: 0, nowMs: NOW, reason: "merge_review", recoveryPrompt: { kind: "latest", producedAtMs: NOW - HOUR } },
  previous_available: { status: "restore_pending", mutationGeneration: 4, backedUpGeneration: 0, nowMs: NOW, recoveryPrompt: { kind: "previous", producedAtMs: NOW - HOUR, previousProducedAtMs: NOW - 2 * HOUR } },
  update_required: { status: "restore_pending", mutationGeneration: 4, backedUpGeneration: 0, nowMs: NOW, reason: "update_required", recoveryPrompt: { kind: "update_required", producedAtMs: NOW - HOUR } },
  invalid_artifacts: { status: "paused", mutationGeneration: 4, backedUpGeneration: 0, nowMs: NOW, reason: "invalid_artifacts" },
  pending_24h: { status: "backup_pending", mutationGeneration: 4, backedUpGeneration: 2, pendingSinceMs: NOW - 24 * HOUR, lastSuccessfulBackupAtMs: NOW - 25 * HOUR, nowMs: NOW },
  stale_writer: { status: "paused", mutationGeneration: 4, backedUpGeneration: 2, nowMs: NOW, reason: "stale_writer" },
  deleted: { status: "paused", mutationGeneration: 0, backedUpGeneration: 0, nowMs: NOW, reason: "deleted" },
  deletion_partial: { status: "paused", mutationGeneration: 0, backedUpGeneration: 0, nowMs: NOW, reason: "deletion_partial" },
});

/**
 * Development-test parser only. It deliberately requires the embedded native
 * contract identity as well as the suite/fixture pair: query strings, deep
 * links, and environment variables cannot enable fakes in production.
 */
export function phase12BackupFixtureFromNativeContract(input: Readonly<{
  suite: string | undefined;
  fixture: string | undefined;
  nativeContractsEnabled?: boolean;
  buildProfile?: string | undefined;
}>): Phase12BackupFixture | null {
  if (input.nativeContractsEnabled !== true || input.buildProfile !== "development-test" || input.suite !== "phase12" || input.fixture === undefined || !allowed.has(input.fixture as Phase12BackupFixture)) return null;
  return input.fixture as Phase12BackupFixture;
}

export function phase12BackupFixtureViewModel(fixture: Phase12BackupFixture): AutomaticBackupViewModel {
  return projectAutomaticBackupPresentation(fixtures[fixture]);
}

export function phase12BackupFixtureInput(fixture: Phase12BackupFixture): AutomaticBackupPresentationInput {
  return fixtures[fixture];
}
