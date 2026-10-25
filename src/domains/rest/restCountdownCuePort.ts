/** Best-effort foreground cues; rest timestamps and commands remain authoritative. */
export interface RestCountdownCuePort {
  playShortCue(): Promise<void>;
  playLongCue(): Promise<void>;
  /** Invalidate playback still waiting for loading or a seek after a user/lifecycle change. */
  cancelPendingCues?(): void;
}
