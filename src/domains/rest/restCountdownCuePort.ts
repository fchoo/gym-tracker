export interface RestCountdownCuePort {
  playShortCue(): Promise<void>;
  playLongCue(): Promise<void>;
}
