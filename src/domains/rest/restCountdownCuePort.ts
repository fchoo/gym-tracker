export type RestCountdownSoundOwnership = Readonly<{
  sessionId: string;
  restRevision: number;
  endsAtMs: number;
}>;

/** Best-effort foreground cues; rest timestamps and commands remain authoritative. */
export interface RestCountdownCuePort {
  playShortCue(): Promise<void>;
  playLongCue(): Promise<void>;
  /** Invalidate playback still waiting for loading or a seek after a user/lifecycle change. */
  cancelPendingCues?(): void;
  /** Route-owned deadlines survive removal of a naturally expired dock. */
  scheduleCountdown?(input: Readonly<{
    endsAtMs: number;
    nowMs: () => number;
    emitted: ReadonlySet<number>;
    onCue: (remainingSeconds: 2 | 1 | 0) => void;
    onError: () => void;
  }>): () => void;
  /** Release preserves only a short natural-expiry grace; cancel clears immediately. */
  claimForegroundRestSound?(input: RestCountdownSoundOwnership): () => void;
}
