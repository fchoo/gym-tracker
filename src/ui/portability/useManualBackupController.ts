import { useCallback, useEffect, useRef, useState } from "react";

import type {
  RuntimeMergePreflightResult,
  RuntimeRestoreCommitResult,
  RuntimeRestorePreflightResult,
  RuntimeSecureBackupArchive,
} from "../../bootstrap/workoutAppRuntime";

export type ManualBackupState =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "preparing" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "ready_to_share"; archive: RuntimeSecureBackupArchive }>
  | Readonly<{ kind: "sharing" }>
  | Readonly<{ kind: "failed"; correlationCode: "GT-BACKUP04" }>
  | Readonly<{ kind: "share_failed"; correlationCode: "GT-BACKUP04" }>;

export type ManualRestoreState =
  | Readonly<{ kind: "ready" | "opening" | "cancelled" | "restoring" | "restored" | "rebuild_pending" }>
  | Readonly<{ kind: "review"; token: string; preview: Extract<RuntimeRestorePreflightResult, { outcome: "ready" }>["preview"] }>
  | Readonly<{ kind: "failed"; heading: "Backup could not be opened" | "Restore could not be completed"; message: string }>;

export type ManualMergeState =
  | Readonly<{ kind: "ready" | "opening" | "cancelled" | "merging" | "merged" | "rebuild_pending" }>
  | Readonly<{ kind: "review"; token: string; preview: Extract<RuntimeMergePreflightResult, { outcome: "ready" }>["preview"] }>
  | Readonly<{ kind: "failed"; heading: "Backup could not be opened" | "Merge could not be completed"; message: string }>;

export type ManualBackupControllerInput = Readonly<{
  createSecureBackup(input: Readonly<{ password: string; signal?: AbortSignal }>): Promise<RuntimeSecureBackupArchive>;
  shareSecureBackup(archive: RuntimeSecureBackupArchive): Promise<void>;
  discardSecureBackup(archive: RuntimeSecureBackupArchive): Promise<void>;
  preflightSecureRestore(input: Readonly<{ password: string }>): Promise<RuntimeRestorePreflightResult>;
  commitSecureRestore(input: Readonly<{ token: string; confirmation: string }>): Promise<RuntimeRestoreCommitResult>;
  invalidateSecureRestorePreflight(token: string): void;
  preflightSecureMerge(input: Readonly<{ password: string }>): Promise<RuntimeMergePreflightResult>;
  commitSecureMerge(input: Readonly<{ token: string; confirmation: string }>): Promise<RuntimeRestoreCommitResult>;
  invalidateSecureMergePreflight(token: string): void;
  retryRestoreRebuild(): Promise<RuntimeRestoreCommitResult>;
  onRestoreReview?(): void;
  onMergeReview?(): void;
}>;

function restoreFailure(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "restore_archive_unsupported_version") return "This backup format is not supported. Your current saved data was not changed.";
  if (code === "restore_archive_limit_exceeded") return "This backup is too large to open safely. Your current saved data was not changed.";
  if (code === "restore_commit_failed") return "Your current saved data was kept.";
  return "Your current saved data was not changed.";
}

function mergeFailure(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "merge_archive_requires_v2") return "Use Restore clean for this older backup. Your current saved data was not changed.";
  if (code === "merge_archive_limit_exceeded") return "This backup is too large to open safely. Your current saved data was not changed.";
  if (code === "merge_commit_failed") return "Your current saved data was kept.";
  return "Your current saved data was not changed.";
}

/** UI-owned Phase 11 GTBK state machine. It fences late work and invalidates preflight tokens. */
export function useManualBackupController(input: ManualBackupControllerInput) {
  const inputRef = useRef(input); inputRef.current = input;
  const mounted = useRef(true);
  const backupLatch = useRef(false), restoreLatch = useRef(false), mergeLatch = useRef(false);
  const backupGeneration = useRef(0), restoreGeneration = useRef(0), mergeGeneration = useRef(0);
  const backupAbort = useRef<AbortController | null>(null);
  const backupHandle = useRef<RuntimeSecureBackupArchive | null>(null);
  const restoreToken = useRef<string | null>(null), mergeToken = useRef<string | null>(null);
  const [backupState, setBackupState] = useState<ManualBackupState>({ kind: "ready" });
  const [restoreState, setRestoreState] = useState<ManualRestoreState>({ kind: "ready" });
  const [mergeState, setMergeState] = useState<ManualMergeState>({ kind: "ready" });

  const createBackup = useCallback(async (password: string) => {
    if (!password || backupLatch.current) return;
    backupLatch.current = true; const generation = ++backupGeneration.current; const controller = new AbortController(); backupAbort.current = controller;
    setBackupState({ kind: "preparing" });
    try { const archive = await inputRef.current.createSecureBackup({ password, signal: controller.signal });
      if (!mounted.current || generation !== backupGeneration.current) { await inputRef.current.discardSecureBackup(archive).catch(() => undefined); return; }
      const prior = backupHandle.current; backupHandle.current = archive; if (prior) await inputRef.current.discardSecureBackup(prior).catch(() => undefined);
      setBackupState({ kind: "ready_to_share", archive });
    } catch { if (mounted.current && generation === backupGeneration.current) setBackupState({ kind: "failed", correlationCode: "GT-BACKUP04" });
    } finally { if (generation === backupGeneration.current) { backupAbort.current = null; backupLatch.current = false; } }
  }, []);
  const cancelBackup = useCallback(() => { if (backupState.kind !== "preparing") return; ++backupGeneration.current; backupAbort.current?.abort(); backupAbort.current = null; backupLatch.current = false; setBackupState({ kind: "cancelled" }); }, [backupState.kind]);
  const shareBackup = useCallback(async (archive: RuntimeSecureBackupArchive) => {
    if (backupLatch.current) return; backupLatch.current = true; const generation = ++backupGeneration.current; if (backupHandle.current?.archiveId === archive.archiveId) backupHandle.current = null; setBackupState({ kind: "sharing" });
    try { await inputRef.current.shareSecureBackup(archive); if (mounted.current && generation === backupGeneration.current) setBackupState({ kind: "ready" });
    } catch { if (mounted.current && generation === backupGeneration.current) setBackupState({ kind: "share_failed", correlationCode: "GT-BACKUP04" });
    } finally { if (generation === backupGeneration.current) backupLatch.current = false; }
  }, []);
  const preflightRestore = useCallback(async (password: string) => {
    if (!password || restoreLatch.current) return; restoreLatch.current = true; const generation = ++restoreGeneration.current; const old = restoreToken.current; restoreToken.current = null; if (old) inputRef.current.invalidateSecureRestorePreflight(old); setRestoreState({ kind: "opening" });
    try { const result = await inputRef.current.preflightSecureRestore({ password }); if (!mounted.current || generation !== restoreGeneration.current) { if (result.outcome === "ready") inputRef.current.invalidateSecureRestorePreflight(result.token); return; }
      if (result.outcome === "cancelled") setRestoreState({ kind: "cancelled" }); else { restoreToken.current = result.token; setRestoreState({ kind: "review", token: result.token, preview: result.preview }); inputRef.current.onRestoreReview?.(); }
    } catch (error) { if (mounted.current && generation === restoreGeneration.current) setRestoreState({ kind: "failed", heading: "Backup could not be opened", message: restoreFailure(error) });
    } finally { if (generation === restoreGeneration.current) restoreLatch.current = false; }
  }, []);
  const commitRestore = useCallback(async (confirmation: string) => {
    if (restoreState.kind !== "review" || confirmation !== "REPLACE" || restoreLatch.current) return; restoreLatch.current = true; const token = restoreState.token; restoreToken.current = null; const generation = restoreGeneration.current; setRestoreState({ kind: "restoring" });
    try { const result = await inputRef.current.commitSecureRestore({ token, confirmation: "REPLACE" }); if (mounted.current && generation === restoreGeneration.current) setRestoreState(result.state === "ready" ? { kind: "restored" } : { kind: "rebuild_pending" });
    } catch (error) { if (mounted.current && generation === restoreGeneration.current) setRestoreState({ kind: "failed", heading: "Restore could not be completed", message: restoreFailure(error) });
    } finally { if (generation === restoreGeneration.current) restoreLatch.current = false; }
  }, [restoreState]);
  const cancelRestore = useCallback(() => { if (restoreState.kind !== "review") return; inputRef.current.invalidateSecureRestorePreflight(restoreState.token); restoreToken.current = null; ++restoreGeneration.current; setRestoreState({ kind: "cancelled" }); }, [restoreState]);
  const preflightMerge = useCallback(async (password: string) => {
    if (!password || mergeLatch.current) return; mergeLatch.current = true; const generation = ++mergeGeneration.current; const old = mergeToken.current; mergeToken.current = null; if (old) inputRef.current.invalidateSecureMergePreflight(old); setMergeState({ kind: "opening" });
    try { const result = await inputRef.current.preflightSecureMerge({ password }); if (!mounted.current || generation !== mergeGeneration.current) { if (result.outcome === "ready") inputRef.current.invalidateSecureMergePreflight(result.token); return; }
      if (result.outcome === "cancelled") setMergeState({ kind: "cancelled" }); else { mergeToken.current = result.token; setMergeState({ kind: "review", token: result.token, preview: result.preview }); inputRef.current.onMergeReview?.(); }
    } catch (error) { if (mounted.current && generation === mergeGeneration.current) setMergeState({ kind: "failed", heading: "Backup could not be opened", message: mergeFailure(error) });
    } finally { if (generation === mergeGeneration.current) mergeLatch.current = false; }
  }, []);
  const commitMerge = useCallback(async (confirmation: string) => {
    if (mergeState.kind !== "review" || confirmation !== "MERGE" || mergeLatch.current) return; mergeLatch.current = true; const token = mergeState.token; mergeToken.current = null; const generation = mergeGeneration.current; setMergeState({ kind: "merging" });
    try { const result = await inputRef.current.commitSecureMerge({ token, confirmation: "MERGE" }); if (mounted.current && generation === mergeGeneration.current) setMergeState(result.state === "ready" ? { kind: "merged" } : { kind: "rebuild_pending" });
    } catch (error) { if (mounted.current && generation === mergeGeneration.current) setMergeState({ kind: "failed", heading: "Merge could not be completed", message: mergeFailure(error) });
    } finally { if (generation === mergeGeneration.current) mergeLatch.current = false; }
  }, [mergeState]);
  const cancelMerge = useCallback(() => { if (mergeState.kind !== "review") return; inputRef.current.invalidateSecureMergePreflight(mergeState.token); mergeToken.current = null; ++mergeGeneration.current; setMergeState({ kind: "cancelled" }); }, [mergeState]);
  const retryRestoreRebuild = useCallback(async () => { if (restoreState.kind !== "rebuild_pending" || restoreLatch.current) return; restoreLatch.current = true; setRestoreState({ kind: "restoring" }); try { const result = await inputRef.current.retryRestoreRebuild(); if (mounted.current) setRestoreState(result.state === "ready" ? { kind: "restored" } : { kind: "rebuild_pending" }); } finally { restoreLatch.current = false; } }, [restoreState]);
  const retryMergeRebuild = useCallback(async () => { if (mergeState.kind !== "rebuild_pending" || mergeLatch.current) return; mergeLatch.current = true; setMergeState({ kind: "merging" }); try { const result = await inputRef.current.retryRestoreRebuild(); if (mounted.current) setMergeState(result.state === "ready" ? { kind: "merged" } : { kind: "rebuild_pending" }); } finally { mergeLatch.current = false; } }, [mergeState]);
  useEffect(() => () => { mounted.current = false; ++backupGeneration.current; backupAbort.current?.abort(); const archive = backupHandle.current; backupHandle.current = null; if (archive) void inputRef.current.discardSecureBackup(archive).catch(() => undefined); ++restoreGeneration.current; if (restoreToken.current) inputRef.current.invalidateSecureRestorePreflight(restoreToken.current); ++mergeGeneration.current; if (mergeToken.current) inputRef.current.invalidateSecureMergePreflight(mergeToken.current); }, []);
  return { backupState, restoreState, mergeState, createBackup, cancelBackup, shareBackup, retryBackup: () => setBackupState({ kind: "ready" }), preflightRestore, commitRestore, cancelRestore, preflightMerge, commitMerge, cancelMerge, retryRestoreRebuild, retryMergeRebuild } as const;
}
