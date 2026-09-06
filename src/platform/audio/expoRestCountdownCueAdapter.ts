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
  await player.seekTo(0);
  player.play();
}

export function useExpoRestCountdownCueAdapter(): RestCountdownCuePort {
  const shortPlayer = useAudioPlayer(
    require("../../../assets/audio/rest-cue-short.wav"),
  );
  const longPlayer = useAudioPlayer(
    require("../../../assets/audio/rest-cue-long.wav"),
  );

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
