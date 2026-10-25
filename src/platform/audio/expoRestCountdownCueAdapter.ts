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
    let countdownGeneration = 0;
    const countdownTimers = new Set<ReturnType<typeof setTimeout>>();
    let soundOwnership: ReturnType<typeof claimForegroundRestSound> | undefined;
    const pendingLoads = new Set<() => void>();
    const rewinds = new Map<AudioPlayer, Promise<void>>();

    const rewind = (player: AudioPlayer) => {
      const preparing = rewinds.get(player);
      if (preparing !== undefined) return preparing;
      const pending = (async () => {
        // Media3 retains playWhenReady at STATE_ENDED. Seeking while that intent
        // is set restarts the cue without another play() call, so pause first.
        player.pause();
        await player.seekTo(0);
      })();
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

    const cancelCountdown = () => {
      countdownGeneration += 1;
      for (const timer of countdownTimers) clearTimeout(timer);
      countdownTimers.clear();
    };

    const cancelPendingCues = (clearOwnership = true) => {
      cancelCountdown();
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
        // Supersede audible playback as well as pending loads/seeks. Two native
        // players share the audio session and must never play over each other.
        shortPlayer.pause();
        longPlayer.pause();
        // Android's isLoaded getter excludes STATE_ENDED. Prepare the position
        // first: waiting for readiness before this seek can never ready an
        // ended player when its finish event has not reached JS yet.
        const pendingRewind = rewinds.get(player);
        const neededRewind = pendingRewind ?? (player.currentTime > 0 ? rewind(player) : undefined);
        if (neededRewind !== undefined) {
          await waitForRewind(neededRewind, maxWaitMs - (Date.now() - requestedAtMs));
        }
        if (requestGeneration !== generation) return;
        if (!player.isLoaded) {
          await waitUntilLoaded(player, Math.max(0, maxWaitMs - (Date.now() - requestedAtMs)));
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
        scheduleCountdown: (input: Parameters<NonNullable<RestCountdownCuePort["scheduleCountdown"]>>[0]) => {
          cancelCountdown();
          const scheduleGeneration = countdownGeneration;
          const scheduledAtMs = input.nowMs();
          const emitted = new Set(input.emitted);
          for (const seconds of [2, 1, 0] as const) {
            const dueAtMs = input.endsAtMs - seconds * 1_000;
            // Manual adjustments and foreground return never backfill tones.
            if (dueAtMs <= scheduledAtMs || emitted.has(seconds)) continue;
            const timer = setTimeout(() => {
              countdownTimers.delete(timer);
              if (scheduleGeneration !== countdownGeneration
                || AppState.currentState !== "active") return;
              // A stalled JS turn skips a stale short instead of playing a
              // burst at expiry. The final cue still gets its bounded attempt.
              if (seconds !== 0 && input.nowMs() - dueAtMs > 350) return;
              emitted.add(seconds);
              input.onCue(seconds);
              void replay(seconds === 0 ? longPlayer : shortPlayer, seconds === 0 ? 1_000 : 350)
                .catch(() => {
                  if (scheduleGeneration === countdownGeneration) input.onError();
                });
            }, Math.max(0, dueAtMs - scheduledAtMs));
            countdownTimers.add(timer);
          }
          return () => {
            // Parent expiry can remove the dock in the same turn as the final
            // deadline. Retain that route-owned callback and any loading wait.
            if (scheduleGeneration === countdownGeneration && input.nowMs() < input.endsAtMs) {
              cancelPendingCues();
            }
          };
        },
        claimForegroundRestSound: (input: RestCountdownSoundOwnership) => {
          // A consecutive rest may begin before the previous deadline's queued
          // notification arrives. Retain only its bounded natural-expiry grace.
          soundOwnership?.release();
          const claim = claimForegroundRestSound(input);
          soundOwnership = claim;
          return () => {
            claim.release();
            if (soundOwnership === claim) soundOwnership = undefined;
          };
        },
      }),
    };
  }, [longPlayer, shortPlayer]);

  useEffect(() => {
    const subscriptions = [shortPlayer, longPlayer].map((player) =>
      player.addListener(STATUS_EVENT, (status) => {
        // A finish event can reach JS after a cancelled cue has been replayed.
        // Read native truth before rewinding so that event cannot seek the new
        // playback back to zero or cut it off.
        if (status.didJustFinish && !player.playing && player.currentTime > 0) {
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
