import {
  useCallback,
  useMemo,
} from "react";
import {
  useAudioPlayer,
} from "expo-audio";

import type {
  RestCountdownCuePort,
} from "../../domains/rest/restCountdownCuePort";

type CuePlayer = Readonly<{
  seekTo(seconds: number): Promise<void>;
  play(): void;
}>;

async function replayCue(player: CuePlayer): Promise<void> {
  try {
    await player.seekTo(0);
    player.play();
  } catch {
    // Countdown playback is supplementary feedback and must never affect rest.
  }
}

export function useExpoRestCountdownCueAdapter(): RestCountdownCuePort {
  const shortPlayer = useAudioPlayer(null);
  const longPlayer = useAudioPlayer(null);

  const playShortCue = useCallback(
    () => replayCue(shortPlayer),
    [shortPlayer],
  );
  const playLongCue = useCallback(
    () => replayCue(longPlayer),
    [longPlayer],
  );

  return useMemo(
    () => Object.freeze({ playShortCue, playLongCue }),
    [playLongCue, playShortCue],
  );
}
