import {
  projectAutomaticBackupPresentation,
  type AutomaticBackupPresentationInput,
  type AutomaticBackupDataUsePolicy,
  type AutomaticBackupViewModel,
} from "../domains/backup/automaticBackupPresentation";
import type { AutomaticRecoveryCandidate, AutomaticRecoveryCommit, AutomaticRecoveryPreparation } from "../domains/backup/automaticBackupCoordinator";

export type AutomaticBackupRuntimeCommands = Readonly<{
  connect(): Promise<void>;
  deferRestore(): Promise<void>;
  cancelChecking(): Promise<void>;
  checkAgain(): Promise<void>;
  continueRestore(): Promise<void>;
  prepareRecovery(input: Readonly<{ candidate: AutomaticRecoveryCandidate }>): Promise<AutomaticRecoveryPreparation>;
  commitRecovery(input: AutomaticRecoveryCommit): Promise<void>;
  finishSetup(): Promise<void>;
  backupNow(): Promise<void>;
  retryBackup(): Promise<void>;
  useCellularThisTime(): Promise<void>;
  setDataUsePolicy(policy: AutomaticBackupDataUsePolicy): Promise<void>;
  takeOver(): Promise<void>;
  disconnect(): Promise<void>;
  deleteCloudBackup(): Promise<void>;
  finishDeletingCloudBackup(): Promise<void>;
  startNewCloudBackup(): Promise<void>;
}>;

export type AutomaticBackupRuntime = Readonly<{
  current(): AutomaticBackupViewModel;
  start(): Promise<void>;
  refresh(): Promise<void>;
  subscribe(listener: (model: AutomaticBackupViewModel) => void): () => void;
  dispose(): void;
} & {
  [Key in keyof AutomaticBackupRuntimeCommands]: AutomaticBackupRuntimeCommands[Key];
}>;

const unavailable = (): AutomaticBackupViewModel => projectAutomaticBackupPresentation({
  status: "paused",
  mutationGeneration: 0,
  backedUpGeneration: 0,
  nowMs: 0,
  reason: "unavailable",
});

/**
 * Framework-light owner for automatic-backup publications and commands. The
 * root provider alone owns this service; screens receive only its view model.
 */
export function createAutomaticBackupRuntime(input: Readonly<{
  read(): Promise<AutomaticBackupPresentationInput>;
  commands?: AutomaticBackupRuntimeCommands;
  subscribeTransitions?(listener: () => void): () => void;
}>): AutomaticBackupRuntime {
  let model = unavailable();
  let disposed = false;
  let generation = 0;
  let activeCommand: Promise<void> | null = null;
  const listeners = new Set<(next: AutomaticBackupViewModel) => void>();
  const emit = () => { for (const listener of listeners) listener(model); };
  const publish = async () => {
    if (disposed) return;
    const readGeneration = ++generation;
    try {
      const next = projectAutomaticBackupPresentation(await input.read());
      if (!disposed && readGeneration === generation) {
        model = next;
        emit();
      }
    } catch {
      if (!disposed && readGeneration === generation) {
        model = unavailable();
        emit();
      }
    }
  };
  const invoke = <Result>(key: keyof AutomaticBackupRuntimeCommands, ...args: readonly unknown[]): Promise<Result> => {
    if (input.commands === undefined || disposed) {
      if (!disposed) { model = unavailable(); emit(); }
      return Promise.reject(new Error("automatic_backup_unavailable"));
    }
    if (activeCommand !== null) return activeCommand as Promise<Result>;
    const command = input.commands[key] as (...values: readonly unknown[]) => Promise<void>;
    activeCommand = command(...args).then(publish).finally(() => { activeCommand = null; });
    return activeCommand as Promise<Result>;
  };
  const unsubscribe = input.subscribeTransitions?.(() => { void publish(); });
  const runtime: AutomaticBackupRuntime = {
    current: () => model,
    start: publish,
    refresh: publish,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { disposed = true; generation += 1; listeners.clear(); unsubscribe?.(); },
    connect: () => invoke<void>("connect"),
    deferRestore: () => invoke<void>("deferRestore"),
    cancelChecking: () => invoke<void>("cancelChecking"),
    checkAgain: () => invoke<void>("checkAgain"),
    continueRestore: () => invoke<void>("continueRestore"),
    prepareRecovery: (input) => invoke<AutomaticRecoveryPreparation>("prepareRecovery", input),
    commitRecovery: (input) => invoke<void>("commitRecovery", input),
    finishSetup: () => invoke<void>("finishSetup"), backupNow: () => invoke<void>("backupNow"), retryBackup: () => invoke<void>("retryBackup"), useCellularThisTime: () => invoke<void>("useCellularThisTime"), setDataUsePolicy: (policy) => invoke<void>("setDataUsePolicy", policy), takeOver: () => invoke<void>("takeOver"), disconnect: () => invoke<void>("disconnect"), deleteCloudBackup: () => invoke<void>("deleteCloudBackup"), finishDeletingCloudBackup: () => invoke<void>("finishDeletingCloudBackup"), startNewCloudBackup: () => invoke<void>("startNewCloudBackup"),
  };
  return Object.freeze(runtime);
}
