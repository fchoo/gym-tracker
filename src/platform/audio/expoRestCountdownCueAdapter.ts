import {
  useEffect,
  useMemo,
} from "react";
import {
  AppState,
} from "react-native";
import {
  useAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";

import type {
  RestCountdownCuePort,
  RestCountdownSoundOwnership,
} from "../../domains/rest/restCountdownCuePort";

import { claimForegroundRestSound } from "./foregroundRestSoundOwnership";

const STATUS_EVENT = "playbackStatusUpdate";
const SEQUENCE_PREROLL_MS = 300;

export function useExpoRestCountdownCueAdapter(): RestCountdownCuePort {
  // The route owns these players, so a natural-expiry dock unmount cannot release
  // the final cue. Status listeners avoid rerendering the workout route per tone.
  const shortPlayer = useAudioPlayer(
    require("../../../assets/audio/rest-cue-short.wav"),
  );
  const longPlayer = useAudioPlayer(
    require("../../../assets/audio/rest-cue-long.wav"),
  );
  const sequencePlayer = useAudioPlayer(
    require("../../../assets/audio/rest-countdown.wav"),
  );

  const playback = useMemo(() => {
    let generation = 0;
    let countdownGeneration = 0;
    const countdownTimers = new Set<ReturnType<typeof setTimeout>>();
    let soundOwnership: ReturnType<typeof claimForegroundRestSound> | undefined;
    const pendingLoads = new Set<() => void>();
    const rewinds = new Map<AudioPlayer, Promise<void>>();
    let audioModeReady = false;
    let audioModePreparation: Promise<void> | undefined;
    const trace = (event: string, player?: AudioPlayer, fields: Record<string, unknown> = {}) => {
      if (!__DEV__) return;
      let native: Record<string, unknown> = {};
      try {
        if (player !== undefined) native = {
          cue: player === shortPlayer ? "short" : player === longPlayer ? "long" : "sequence",
          isLoaded: player.isLoaded, currentTime: player.currentTime, playing: player.playing,
        };
      } catch { native = { snapshotUnavailable: true }; }
      console.trace("GT_REST_CUE", JSON.stringify({ event, generation, countdownGeneration, appState: AppState.currentState, ...native, ...fields }));
    };
    const prepareAudioMode = () => {
      audioModePreparation ??= (async () => {
        trace("audio-mode-prepare");
        // Expo's native Android default requests transient focus per tone.
        // Explicit mixing keeps short cues alongside music without repeated
        // focus acquisition/abandonment. Background completion uses its alarm.
        // https://docs.expo.dev/versions/latest/sdk/audio/#audiomode
        await setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: true });
        audioModeReady = true;
        trace("audio-mode-ready");
      })();
      return audioModePreparation;
    };

    const rewind = (player: AudioPlayer) => {
      const preparing = rewinds.get(player);
      trace("rewind-request", player, { alreadyPending: preparing !== undefined });
      if (preparing !== undefined) return preparing;
      const pending = (async () => {
        // Media3 retains playWhenReady at STATE_ENDED. Seeking while that intent
        // is set restarts the cue without another play() call, so pause first.
        player.pause();
        trace("rewind-paused", player);
        await player.seekTo(0);
        trace("rewind-done", player);
      })();
      rewinds.set(player, pending);
      // Rewind on finish, ahead of the next countdown. A failed preparation is
      // retried by the next request and reported through that request's promise.
      void pending.catch(() => { trace("rewind-failed", player); }).finally(() => {
        if (rewinds.get(player) === pending) rewinds.delete(player);
      });
      return pending;
    };

    const waitUntilLoaded = (player: AudioPlayer, maxWaitMs: number) =>
      new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          trace("load-finished", player, { failed: error !== undefined });
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
        trace("load-wait", player, { maxWaitMs });
        // Loading may complete between the initial property read and listener.
        if (player.isLoaded) finish();
      });

    const waitForRewind = async (pending: Promise<void>, maxWaitMs: number, failure = "rest_countdown_audio_seek_timeout") => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          pending,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error(failure)),
              Math.max(0, maxWaitMs),
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    };

    const cancelCountdown = (reason: string) => {
      trace("schedule-cancel", undefined, { reason, timerCount: countdownTimers.size });
      countdownGeneration += 1;
      for (const timer of countdownTimers) clearTimeout(timer);
      countdownTimers.clear();
    };

    const cancelPendingCues = (clearOwnership = true, reason = "port-cancel") => {
      trace("playback-cancel", undefined, { reason, pendingLoads: pendingLoads.size, clearOwnership });
      cancelCountdown(reason);
      if (clearOwnership) soundOwnership?.clear();
      else soundOwnership?.release();
      soundOwnership = undefined;
      generation += 1;
      for (const cancel of [...pendingLoads]) cancel();
      for (const player of [shortPlayer, longPlayer, sequencePlayer]) {
        try {
          player.pause();
        } catch {
          // Native teardown cannot block a rest command.
        }
      }
    };

    const replay = async (player: AudioPlayer, maxWaitMs: number, offsetSeconds = 0) => {
      // A later cue supersedes a late short rather than queuing a catch-up burst.
      const requestGeneration = ++generation;
      for (const cancel of [...pendingLoads]) cancel();
      const requestedAtMs = Date.now();
      trace("request", player, { requestGeneration, maxWaitMs, offsetSeconds });
      try {
        if (!audioModeReady) {
          await waitForRewind(prepareAudioMode(), maxWaitMs, "rest_countdown_audio_mode_timeout");
          if (requestGeneration !== generation) return;
        }
        // Supersede audible playback as well as pending loads/seeks. The native
        // players share the audio session and must never play over each other.
        shortPlayer.pause();
        longPlayer.pause();
        sequencePlayer.pause();
        trace("exclusive-pause-done", player, { requestGeneration });
        // Android's isLoaded getter excludes STATE_ENDED. Prepare the position
        // first: waiting for readiness before this seek can never ready an
        // ended player when its finish event has not reached JS yet.
        const pendingRewind = rewinds.get(player);
        const neededRewind = pendingRewind ?? (player.currentTime > 0 ? rewind(player) : undefined);
        if (neededRewind !== undefined) {
          await waitForRewind(neededRewind, maxWaitMs - (Date.now() - requestedAtMs));
        }
        if (offsetSeconds > 0 && requestGeneration === generation) {
          await waitForRewind(player.seekTo(offsetSeconds), maxWaitMs - (Date.now() - requestedAtMs));
        }
        if (requestGeneration !== generation) {
          trace("request-superseded-after-seek", player, { requestGeneration });
          return;
        }
        if (!player.isLoaded) {
          await waitUntilLoaded(player, Math.max(0, maxWaitMs - (Date.now() - requestedAtMs)));
        }
        if (
          requestGeneration !== generation
          || AppState.currentState !== "active"
        ) {
          trace("request-cancelled-before-play", player, { requestGeneration });
          return;
        }
        if (Date.now() - requestedAtMs > maxWaitMs) {
          throw new Error("rest_countdown_audio_not_ready");
        }
        // New and pre-rewound players start synchronously; there is no needless
        // async seek at the deadline for the pristine final-tone player.
        player.play();
        trace("played", player, { requestGeneration, requestElapsedMs: Date.now() - requestedAtMs });
      } catch (error) {
        trace("failed", player, {
          requestGeneration, requestElapsedMs: Date.now() - requestedAtMs,
          failure: error instanceof Error && error.message.startsWith("rest_countdown_audio_") ? error.message : "native_error",
        });
        if (requestGeneration === generation) throw error;
      }
    };

    return {
      rewind,
      trace,
      prepareAudioMode,
      cancelPendingCues,
      port: Object.freeze({
        playShortCue: () => replay(shortPlayer, 350),
        playLongCue: () => replay(longPlayer, 1_000),
        cancelPendingCues: () => cancelPendingCues(),
        scheduleCountdown: (input: Parameters<NonNullable<RestCountdownCuePort["scheduleCountdown"]>>[0]) => {
          cancelCountdown("schedule-replaced");
          const scheduleGeneration = countdownGeneration;
          const scheduledAtMs = input.nowMs();
          const emitted = new Set(input.emitted);
          let sequenceStarted = false;
          // The output path needs a short silent lead-in before its first
          // pulse. Start that single track early; cue/expiry callbacks remain
          // on the saved deadline, and every timer shares cancellation.
          for (const seconds of [2, 1] as const) {
            const startAtMs = input.endsAtMs - seconds * 1_000 - SEQUENCE_PREROLL_MS;
            if (startAtMs <= scheduledAtMs || emitted.has(seconds) || emitted.has(0)
              || (seconds === 2 && emitted.has(1))) continue;
            const timer = setTimeout(() => {
              countdownTimers.delete(timer);
              if (sequenceStarted || scheduleGeneration !== countdownGeneration
                || AppState.currentState !== "active" || input.nowMs() - startAtMs > 350) return;
              sequenceStarted = true;
              if (__DEV__) trace("sequence-preroll", sequencePlayer, { seconds, latenessMs: input.nowMs() - startAtMs });
              // Tail offset 1.0 keeps 300ms silence before the second pulse at
              // position 1.3, aligning it with deadline minus one second.
              void replay(sequencePlayer, 350, seconds === 1 ? 1 : 0).catch(() => {
                if (scheduleGeneration === countdownGeneration) input.onError();
              });
            }, startAtMs - scheduledAtMs);
            countdownTimers.add(timer);
          }
          if (__DEV__) trace("schedule", undefined, { remainingMs: input.endsAtMs - scheduledAtMs, emitted: [...emitted] });
          for (const seconds of [2, 1, 0] as const) {
            const dueAtMs = input.endsAtMs - seconds * 1_000;
            // Manual adjustments and foreground return never backfill tones.
            if (dueAtMs <= scheduledAtMs || emitted.has(seconds)) {
              if (__DEV__) trace("schedule-skip", undefined, { seconds, alreadyEmitted: emitted.has(seconds), dueInMs: dueAtMs - scheduledAtMs });
              continue;
            }
            if (__DEV__) trace("schedule-arm", undefined, { seconds, dueInMs: dueAtMs - scheduledAtMs });
            const timer = setTimeout(() => {
              countdownTimers.delete(timer);
              if (__DEV__) trace("schedule-fire", undefined, { seconds, scheduleGeneration, latenessMs: input.nowMs() - dueAtMs });
              if (scheduleGeneration !== countdownGeneration
                || AppState.currentState !== "active") {
                if (__DEV__) trace("schedule-superseded-or-inactive", undefined, { seconds, scheduleGeneration });
                return;
              }
              // A stalled JS turn skips a stale short instead of playing a
              // burst at expiry. The final cue still gets its bounded attempt.
              if (seconds !== 0 && input.nowMs() - dueAtMs > 350) {
                if (__DEV__) trace("schedule-late-short-skipped", undefined, { seconds });
                return;
              }
              emitted.add(seconds);
              input.onCue(seconds);
              // One prepared PCM track carries both short tones and the final
              // long tone. Later deadlines only update the ledger/expiry, so
              // they never stop/restart native playback between pulses.
              if (sequenceStarted) return;
              // A late mount never starts a sequence without its silent lead
              // or backfills an earlier short. Its final long remains valid.
              if (seconds !== 0) return;
              void replay(longPlayer, 1_000)
                .catch(() => {
                  if (scheduleGeneration === countdownGeneration) input.onError();
                });
            }, Math.max(0, dueAtMs - scheduledAtMs));
            countdownTimers.add(timer);
          }
          return () => {
            if (__DEV__) trace("schedule-lease-release", undefined, { scheduleGeneration, remainingMs: input.endsAtMs - input.nowMs() });
            // Parent expiry can remove the dock in the same turn as the final
            // deadline. Retain that route-owned callback and any loading wait.
            if (scheduleGeneration === countdownGeneration && input.nowMs() < input.endsAtMs) {
              cancelPendingCues(true, "lease-before-deadline");
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
  }, [longPlayer, sequencePlayer, shortPlayer]);

  useEffect(() => {
    // Prepare once when the workout route mounts, ahead of its first deadline.
    void playback.prepareAudioMode().catch(() => { playback.trace("audio-mode-failed"); });
    const subscriptions = [shortPlayer, longPlayer, sequencePlayer].map((player) =>
      player.addListener(STATUS_EVENT, (status) => {
        if (__DEV__ && (status.didJustFinish || status.playing !== undefined)) playback.trace("native-status", player, {
          didJustFinish: status.didJustFinish, reportedPlaying: status.playing,
          reportedIsLoaded: status.isLoaded, reportedCurrentTime: status.currentTime, reportedError: Boolean(status.error),
        });
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
        playback.cancelPendingCues(true, `app-state-${state}`);
      }
    });
    return () => {
      playback.cancelPendingCues(false, "adapter-unmount");
      appStateSubscription.remove();
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [longPlayer, playback, sequencePlayer, shortPlayer]);

  return playback.port;
}
