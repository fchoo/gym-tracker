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
  /** Release preserves only a short natural-expiry grace; cancel clears immediately. */
  claimForegroundRestSound?(input: RestCountdownSoundOwnership): () => void;
}
