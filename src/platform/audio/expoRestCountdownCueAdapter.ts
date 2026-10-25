import {
  useEffect,
  useMemo,
} from "react";
import {
  AppState,
} from "react-native";
import {
  useAudioPlayer,
  type AudioPlayer,
} from "expo-audio";

import type {
  RestCountdownCuePort,
  RestCountdownSoundOwnership,
} from "../../domains/rest/restCountdownCuePort";

import { claimForegroundRestSound } from "./foregroundRestSoundOwnership";

const STATUS_EVENT = "playbackStatusUpdate";

export function useExpoRestCountdownCueAdapter(): RestCountdownCuePort {
  // The route owns these players, so a natural-expiry dock unmount cannot release
  // the final cue. Status listeners avoid rerendering the workout route per tone.
  const shortPlayer = useAudioPlayer(
    require("../../../assets/audio/rest-cue-short.wav"),
  );
  const longPlayer = useAudioPlayer(
    require("../../../assets/audio/rest-cue-long.wav"),
  );

  const playback = useMemo(() => {
    let generation = 0;
    let soundOwnership: ReturnType<typeof claimForegroundRestSound> | undefined;
    const pendingLoads = new Set<() => void>();
    const rewinds = new Map<AudioPlayer, Promise<void>>();

    const rewind = (player: AudioPlayer) => {
      const pending = (async () => player.seekTo(0))();
      rewinds.set(player, pending);
      // Rewind on finish, ahead of the next countdown. A failed preparation is
      // retried by the next request and reported through that request's promise.
      void pending.catch(() => undefined).finally(() => {
        if (rewinds.get(player) === pending) rewinds.delete(player);
      });
      return pending;
    };

    const waitUntilLoaded = (player: AudioPlayer, maxWaitMs: number) =>
      new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          subscription.remove();
          pendingLoads.delete(cancel);
          if (error === undefined) resolve();
          else reject(error);
        };
        const cancel = () => finish();
        const subscription = player.addListener(STATUS_EVENT, (status) => {
          if (status.error) finish(new Error(status.error));
          else if (status.isLoaded) finish();
        });
        const timeout = setTimeout(
          () => finish(new Error("rest_countdown_audio_not_ready")),
          maxWaitMs,
        );
        pendingLoads.add(cancel);
        // Loading may complete between the initial property read and listener.
        if (player.isLoaded) finish();
      });

    const waitForRewind = async (pending: Promise<void>, maxWaitMs: number) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          pending,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error("rest_countdown_audio_seek_timeout")),
              Math.max(0, maxWaitMs),
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    };

    const cancelPendingCues = (clearOwnership = true) => {
      if (clearOwnership) soundOwnership?.clear();
      else soundOwnership?.release();
      soundOwnership = undefined;
      generation += 1;
      for (const cancel of [...pendingLoads]) cancel();
      for (const player of [shortPlayer, longPlayer]) {
        try {
          player.pause();
        } catch {
          // Native teardown cannot block a rest command.
        }
      }
    };

    const replay = async (player: AudioPlayer, maxWaitMs: number) => {
      // A later cue supersedes a late short rather than queuing a catch-up burst.
      const requestGeneration = ++generation;
      for (const cancel of [...pendingLoads]) cancel();
      const requestedAtMs = Date.now();
      try {
        if (!player.isLoaded) await waitUntilLoaded(player, maxWaitMs);
        if (requestGeneration !== generation) return;
        const pendingRewind = rewinds.get(player);
        const neededRewind = pendingRewind ?? (player.currentTime > 0 ? rewind(player) : undefined);
        if (neededRewind !== undefined) {
          await waitForRewind(neededRewind, maxWaitMs - (Date.now() - requestedAtMs));
        }
        if (
          requestGeneration !== generation
          || AppState.currentState !== "active"
        ) return;
        if (Date.now() - requestedAtMs > maxWaitMs) {
          throw new Error("rest_countdown_audio_not_ready");
        }
        // New and pre-rewound players start synchronously; there is no needless
        // async seek at the deadline for the pristine final-tone player.
        player.play();
      } catch (error) {
        if (requestGeneration === generation) throw error;
      }
    };

    return {
      rewind,
      cancelPendingCues,
      port: Object.freeze({
        playShortCue: () => replay(shortPlayer, 350),
        playLongCue: () => replay(longPlayer, 1_000),
        cancelPendingCues: () => cancelPendingCues(),
        claimForegroundRestSound: (input: RestCountdownSoundOwnership) => {
          soundOwnership?.clear();
          const claim = claimForegroundRestSound(input);
          soundOwnership = claim;
          return () => claim.release();
        },
      }),
    };
  }, [longPlayer, shortPlayer]);

  useEffect(() => {
    const subscriptions = [shortPlayer, longPlayer].map((player) =>
      player.addListener(STATUS_EVENT, (status) => {
        if (status.didJustFinish) {
          void playback.rewind(player).catch(() => undefined);
        }
      })
    );
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        playback.cancelPendingCues();
      }
    });
    return () => {
      playback.cancelPendingCues(false);
      appStateSubscription.remove();
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [longPlayer, playback, shortPlayer]);

  return playback.port;
}
