export type AutomaticBackupStatus = "not_connected" | "idle" | "backup_pending" | "backing_up" | "restore_pending" | "restoring" | "paused";
export type AutomaticBackupDataUsePolicy = "wifi_and_cellular" | "wifi_only";
export type AutomaticBackupProgressStage = "Checking backup" | "Restoring on this phone" | "Finishing backup setup";
export type AutomaticBackupRecoveryPrompt = Readonly<{
  kind: "latest" | "previous" | "update_required";
  producedAtMs?: number;
  previousProducedAtMs?: number;
}>;
export type AutomaticBackupViewModel = Readonly<{
  status: AutomaticBackupStatus;
  accountLabel: string | null;
  lastSuccessfulBackupAtMs: number | null;
  dataUsePolicy: AutomaticBackupDataUsePolicy;
  warning: "changes_not_backed_up_24h" | null;
  recoveryPrompt: AutomaticBackupRecoveryPrompt | null;
  progressStage: AutomaticBackupProgressStage | null;
  reason: "stale_writer" | "update_required" | "restore_required" | "unavailable" | null;
  primaryAction: "connect" | "backup_now" | "retry" | "continue_restore" | "check_again" | "finish_setup" | null;
}>;
export type AutomaticBackupPresentationInput = Readonly<{
  status: AutomaticBackupStatus;
  accountLabel?: string | null;
  lastSuccessfulBackupAtMs?: number | null;
  mutationGeneration: number;
  backedUpGeneration: number;
  pendingSinceMs?: number | null;
  nowMs: number;
  dataUsePolicy?: AutomaticBackupDataUsePolicy;
  recoveryPrompt?: AutomaticBackupRecoveryPrompt | null;
  progressStage?: AutomaticBackupProgressStage | null;
  reason?: AutomaticBackupViewModel["reason"];
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Projects only owner-safe, bounded state. Transport identifiers and errors never cross this boundary. */
export function projectAutomaticBackupPresentation(input: AutomaticBackupPresentationInput): AutomaticBackupViewModel {
  const dataUsePolicy = input.dataUsePolicy ?? "wifi_and_cellular";
  const hasPendingWork = input.mutationGeneration > input.backedUpGeneration;
  const warning = hasPendingWork && input.pendingSinceMs !== null && input.pendingSinceMs !== undefined
    && input.nowMs - input.pendingSinceMs >= DAY_MS ? "changes_not_backed_up_24h" as const : null;
  const prompt = input.recoveryPrompt ?? null;
  const reason = input.reason ?? (input.status === "restore_pending" ? "restore_required" : null);
  const primaryAction = input.status === "not_connected" ? "connect"
    : reason === "update_required" ? "check_again"
      : input.progressStage === "Finishing backup setup" ? "finish_setup"
        : input.status === "restore_pending" ? "continue_restore"
          : input.status === "backup_pending" || input.status === "paused" ? "retry"
            : input.status === "idle" ? "backup_now" : null;
  return Object.freeze({
    status: input.status,
    accountLabel: input.accountLabel?.trim() || null,
    lastSuccessfulBackupAtMs: input.lastSuccessfulBackupAtMs ?? null,
    dataUsePolicy,
    warning,
    recoveryPrompt: prompt,
    progressStage: input.progressStage ?? null,
    reason,
    primaryAction,
  });
}
