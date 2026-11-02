export interface HapticsPort {
  committed(): Promise<void>;
  cue(): Promise<void>;
}
