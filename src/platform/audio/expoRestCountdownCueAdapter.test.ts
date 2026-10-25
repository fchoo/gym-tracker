import { act, render, renderHook } from "@testing-library/react-native";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AppState, type AppStateStatus } from "react-native";
import { setAudioModeAsync, useAudioPlayer, type AudioStatus } from "expo-audio";
import { useExpoRestCountdownCueAdapter } from "./expoRestCountdownCueAdapter";
import { RestDock } from "../../ui/components/RestDock";
import { AppearanceProvider } from "../../ui/theme";

const SHORT_CUE_ASSET = require("../../../assets/audio/rest-cue-short.wav");
const LONG_CUE_ASSET = require("../../../assets/audio/rest-cue-long.wav");
const COUNTDOWN_ASSET = require("../../../assets/audio/rest-countdown.wav");

jest.mock("expo-audio", () => ({ useAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn(async () => undefined) }));
const mockedUseAudioPlayer = jest.mocked(useAudioPlayer);
const mockedSetAudioMode = jest.mocked(setAudioModeAsync);

function cuePlayer() {
  const listeners = new Set<(status: Partial<AudioStatus>) => void>();
  const player = {
    isLoaded: true,
    currentTime: 0,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn<() => Promise<void>>(async () => { player.currentTime = 0; }),
    addListener: jest.fn((_event: string, listener: (status: Partial<AudioStatus>) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }),
    emit: (status: Partial<AudioStatus>) => {
      if (status.isLoaded !== undefined) player.isLoaded = status.isLoaded;
      for (const listener of [...listeners]) listener(status);
    },
  };
  return player;
}

// Media3 keeps playWhenReady after STATE_ENDED. A seek then starts playback
// again unless pause() first clears that intent. Plain play() call counts miss
// this native replay because no second JS play() call is needed.
function androidCuePlayer(durationMs: number) {
  const player = cuePlayer();
  let playWhenReady = false;
  let end: ReturnType<typeof setTimeout> | undefined;
  let playing = false;
  const audibleStarts: number[] = [];
  const start = () => {
    playing = true;
    audibleStarts.push(Date.now());
    end = setTimeout(() => {
      playing = false;
      player.currentTime = durationMs / 1_000;
      player.emit({ didJustFinish: true, playing: false });
    }, durationMs);
  };
  player.play.mockImplementation(() => {
    playWhenReady = true;
    start();
  });
  player.pause.mockImplementation(() => {
    playWhenReady = false;
    playing = false;
    clearTimeout(end);
  });
  player.seekTo.mockImplementation(async () => {
    clearTimeout(end);
    player.currentTime = 0;
    if (playWhenReady) start();
  });
  return Object.defineProperties(player, {
    playing: { get: () => playing },
    audibleStarts: { value: audibleStarts },
  }) as typeof player & { readonly playing: boolean; readonly audibleStarts: number[] };
}

let restoreAppState: () => void;
let appStateListener: jest.SpiedFunction<typeof AppState.addEventListener>;
beforeEach(() => {
  mockedUseAudioPlayer.mockReset();
  mockedSetAudioMode.mockReset().mockResolvedValue(undefined);
  appStateListener = jest.spyOn(AppState, "addEventListener").mockImplementation(() => ({ remove: jest.fn() }));
  const descriptor = Object.getOwnPropertyDescriptor(AppState, "currentState");
  Object.defineProperty(AppState, "currentState", { configurable: true, value: "active" });
  restoreAppState = () => {
    if (descriptor) Object.defineProperty(AppState, "currentState", descriptor);
    else Reflect.deleteProperty(AppState, "currentState");
  };
});
afterEach(() => { appStateListener.mockRestore(); restoreAppState(); jest.useRealTimers(); });

async function renderAdapter(shortPlayer = cuePlayer(), longPlayer = cuePlayer(), sequencePlayer = cuePlayer()) {
  let playerIndex = 0;
  mockedUseAudioPlayer.mockImplementation(() =>
    ([shortPlayer, longPlayer, sequencePlayer][playerIndex++ % 3]) as never
  );
  const rendered = await renderHook(() => useExpoRestCountdownCueAdapter());
  return { rendered, shortPlayer, longPlayer, sequencePlayer };
}

describe("Expo rest countdown cue adapter", () => {
  it("plays the complete 2660ms countdown once without inter-tone player restarts", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const sequence = androidCuePlayer(2_660);
    const { rendered, shortPlayer, longPlayer } = await renderAdapter(cuePlayer(), cuePlayer(), sequence);
    const onCue = jest.fn();
    rendered.result.current.scheduleCountdown!({ endsAtMs: 14_000, nowMs: () => Date.now(), emitted: new Set(), onCue, onError: jest.fn() });
    await act(async () => { await jest.advanceTimersByTimeAsync(8_000); });
    expect(sequence.audibleStarts).toEqual([11_700]);
    expect(sequence.play).toHaveBeenCalledTimes(1);
    expect(shortPlayer.play).not.toHaveBeenCalled();
    expect(longPlayer.play).not.toHaveBeenCalled();
    expect(sequence.playing).toBe(false);
    expect(onCue.mock.calls).toEqual([[2], [1], [0]]);
    expect(mockedUseAudioPlayer).toHaveBeenNthCalledWith(3, COUNTDOWN_ASSET);
    await rendered.unmount();
  });

  it("starts only the remaining sequence tail when rest begins inside the last two seconds", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(12_500);
    const { rendered, sequencePlayer, shortPlayer, longPlayer } = await renderAdapter();
    const starts: number[] = [];
    sequencePlayer.play.mockImplementation(() => { starts.push(Date.now()); });
    const onCue = jest.fn();
    rendered.result.current.scheduleCountdown!({ endsAtMs: 14_000, nowMs: () => Date.now(), emitted: new Set(), onCue, onError: jest.fn() });
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
    expect(sequencePlayer.seekTo).toHaveBeenCalledWith(1);
    expect(starts).toEqual([12_700]);
    expect(sequencePlayer.play).toHaveBeenCalledTimes(1);
    expect(onCue.mock.calls).toEqual([[1], [0]]);
    expect(shortPlayer.play).not.toHaveBeenCalled();
    expect(longPlayer.play).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it("does not backfill a short when the silent preparation window has already elapsed", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(12_900);
    const { rendered, sequencePlayer, longPlayer } = await renderAdapter();
    rendered.result.current.scheduleCountdown!({ endsAtMs: 14_000, nowMs: () => Date.now(), emitted: new Set(), onCue: jest.fn(), onError: jest.fn() });
    await act(async () => { await jest.advanceTimersByTimeAsync(2_000); });
    expect(sequencePlayer.play).not.toHaveBeenCalled();
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it("cuts the active sequence immediately on a manual change and cannot emit its old final tone", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const sequence = androidCuePlayer(2_660);
    const { rendered } = await renderAdapter(cuePlayer(), cuePlayer(), sequence);
    const onCue = jest.fn();
    rendered.result.current.scheduleCountdown!({ endsAtMs: 14_000, nowMs: () => Date.now(), emitted: new Set(), onCue, onError: jest.fn() });
    await act(async () => { await jest.advanceTimersByTimeAsync(2_100); });
    expect(sequence.playing).toBe(true);
    rendered.result.current.cancelPendingCues?.();
    expect(sequence.playing).toBe(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(4_000); });
    expect(onCue.mock.calls).toEqual([[2]]);
    expect(sequence.audibleStarts).toEqual([11_700]);
    await rendered.unmount();
  });

  it("the composed PCM contains two identical shorts and one long with exact silent gaps", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const root = join(__dirname, "../../..");
    const sequence = readFileSync(join(root, "assets/audio/rest-countdown.wav"));
    const short = readFileSync(join(root, "assets/audio/rest-cue-short.wav")).subarray(44);
    const long = readFileSync(join(root, "assets/audio/rest-cue-long.wav")).subarray(44);
    const pcm = sequence.subarray(44);
    const secondBytes = sequence.readUInt32LE(28);
    const prerollBytes = secondBytes * 0.3;
    expect(sequence.readUInt32LE(40) / secondBytes).toBeCloseTo(2.66, 5);
    expect(pcm.subarray(0, prerollBytes).every((value) => value === 0)).toBe(true);
    expect(pcm.subarray(prerollBytes, prerollBytes + short.length).equals(short)).toBe(true);
    expect(pcm.subarray(prerollBytes + short.length, prerollBytes + secondBytes).every((value) => value === 0)).toBe(true);
    expect(pcm.subarray(prerollBytes + secondBytes, prerollBytes + secondBytes + short.length).equals(short)).toBe(true);
    expect(pcm.subarray(prerollBytes + secondBytes + short.length, prerollBytes + secondBytes * 2).every((value) => value === 0)).toBe(true);
    expect(pcm.subarray(prerollBytes + secondBytes * 2).equals(long)).toBe(true);
  });

  it("prepares mixing before any audible cue so short sounds never interrupt workout music", async () => {
    let prepare!: () => void;
    mockedSetAudioMode.mockImplementation(() => new Promise<void>((resolve) => { prepare = resolve; }));
    const { rendered, shortPlayer, longPlayer } = await renderAdapter();
    expect(mockedSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockedSetAudioMode).toHaveBeenCalledWith({ interruptionMode: "mixWithOthers", playsInSilentMode: true });
    const short = rendered.result.current.playShortCue();
    expect(shortPlayer.play).not.toHaveBeenCalled();
    prepare();
    await short;
    expect(shortPlayer.play).toHaveBeenCalledTimes(1);
    await rendered.result.current.playLongCue();
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
    await rendered.rerender(undefined);
    expect(mockedSetAudioMode).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it("does not play a pending cue after cancellation while audio mode is being prepared", async () => {
    let prepare!: () => void;
    mockedSetAudioMode.mockImplementation(() => new Promise<void>((resolve) => { prepare = resolve; }));
    const { rendered, shortPlayer } = await renderAdapter();
    const short = rendered.result.current.playShortCue();
    rendered.result.current.cancelPendingCues?.();
    prepare();
    await short;
    expect(shortPlayer.play).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it("contains failed or stalled audio mode preparation without playing a cue", async () => {
    jest.useFakeTimers();
    mockedSetAudioMode.mockRejectedValueOnce(new Error("mode_unavailable"));
    const first = await renderAdapter();
    await expect(first.rendered.result.current.playShortCue()).rejects.toThrow("mode_unavailable");
    expect(first.shortPlayer.play).not.toHaveBeenCalled();
    await first.rendered.unmount();
    mockedSetAudioMode.mockImplementationOnce(() => new Promise(() => undefined));
    const second = await renderAdapter();
    const cue = second.rendered.result.current.playShortCue().then(() => undefined, (error: unknown) => error);
    await act(async () => { await jest.advanceTimersByTimeAsync(350); });
    expect(await cue).toEqual(new Error("rest_countdown_audio_mode_timeout"));
    expect(second.shortPlayer.play).not.toHaveBeenCalled();
    await second.rendered.unmount();
  });

  it("plays deadline cues once on a nonaligned clock independently of display renders", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_025);
    const shortPlayer = androidCuePlayer(120);
    const longPlayer = androidCuePlayer(360);
    const sequencePlayer = androidCuePlayer(2_660);
    const { rendered } = await renderAdapter(shortPlayer, longPlayer, sequencePlayer);
    const onCue = jest.fn();
    const onError = jest.fn();
    rendered.result.current.scheduleCountdown!({ endsAtMs: 14_567, nowMs: () => Date.now(), emitted: new Set(), onCue, onError });
    await act(async () => { await jest.advanceTimersByTimeAsync(8_000); });
    expect(sequencePlayer.audibleStarts).toEqual([12_267]);
    expect(shortPlayer.audibleStarts).toEqual([]);
    expect(longPlayer.audibleStarts).toEqual([]);
    expect(onCue.mock.calls).toEqual([[2], [1], [0]]);
    expect(onError).not.toHaveBeenCalled();
    expect(sequencePlayer.playing).toBe(false);
    await rendered.unmount();
  });

  it("retains a final cue loading at the deadline after the natural dock lease releases", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const longPlayer = cuePlayer();
    longPlayer.isLoaded = false;
    const { rendered } = await renderAdapter(cuePlayer(), longPlayer);
    const release = rendered.result.current.scheduleCountdown!({ endsAtMs: 13_000, nowMs: () => Date.now(), emitted: new Set([2, 1]), onCue: jest.fn(), onError: jest.fn() });
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
    release();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
      longPlayer.emit({ isLoaded: true });
    });
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it("cancels superseded deadlines, preserves emitted history, and never backfills after manual adjustments", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const { rendered, shortPlayer, longPlayer, sequencePlayer } = await renderAdapter();
    const emitted = new Set<number>();
    const schedule = (endsAtMs: number) => rendered.result.current.scheduleCountdown!({
      endsAtMs, nowMs: () => Date.now(), emitted,
      onCue: (seconds) => { emitted.add(seconds); }, onError: jest.fn(),
    });
    const oldRelease = schedule(100_000);
    for (const deadline of [85_000, 70_000, 55_000, 40_000, 25_000]) {
      rendered.result.current.cancelPendingCues?.();
      schedule(deadline);
      oldRelease();
    }
    await act(async () => { await jest.advanceTimersByTimeAsync(13_000); });
    expect(sequencePlayer.play).toHaveBeenCalledTimes(1);
    rendered.result.current.cancelPendingCues?.();
    schedule(40_000);
    await act(async () => { await jest.advanceTimersByTimeAsync(16_000); });
    expect(sequencePlayer.play).toHaveBeenCalledTimes(2);
    expect(sequencePlayer.seekTo).toHaveBeenCalledWith(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(1_000); });
    expect(longPlayer.play).not.toHaveBeenCalled();
    rendered.result.current.cancelPendingCues?.();
    schedule(Date.now() + 500);
    expect(shortPlayer.play).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(1_000); });
    expect(longPlayer.play).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it("cancels scheduled cues on background and only schedules future cues on foreground return", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    let change: ((state: AppStateStatus) => void) | undefined;
    appStateListener.mockImplementation((_event, listener) => { change = listener; return { remove: jest.fn() }; });
    const sequencePlayer = androidCuePlayer(2_660);
    const { rendered, shortPlayer, longPlayer } = await renderAdapter(cuePlayer(), cuePlayer(), sequencePlayer);
    const schedule = () => rendered.result.current.scheduleCountdown!({ endsAtMs: 14_000, nowMs: () => Date.now(), emitted: new Set(), onCue: jest.fn(), onError: jest.fn() });
    schedule();
    change?.("background");
    await act(async () => { await jest.advanceTimersByTimeAsync(3_500); });
    expect(shortPlayer.play).not.toHaveBeenCalled();
    change?.("active");
    schedule();
    expect(shortPlayer.play).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(1_000); });
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it("keeps exact final playback when the parent removes the expired dock before its render effects", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(96_000);
    const sequencePlayer = androidCuePlayer(2_660);
    const { rendered, shortPlayer, longPlayer } = await renderAdapter(cuePlayer(), cuePlayer(), sequencePlayer);
    const dock = await render(createElement(AppearanceProvider, null,
      createElement(RestDock, {
        state: { version: 1, state: "running", revision: 3, startedAtMs: 96_000, endsAtMs: 100_000, nextSetId: "next" },
        sessionId: "scheduled-rest",
        nowMs: () => Date.now(),
        nextSetIndex: 2,
        nextTarget: "60 kg × 8",
        notificationPermission: "granted",
        restSoundEnabled: true,
        countdownCue: rendered.result.current,
        onAdjust: jest.fn(), onExpired: jest.fn(), onOpenSettings: jest.fn(),
        onPause: jest.fn(), onResume: jest.fn(), onSkip: jest.fn(),
      }),
    ));
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await dock.unmount();
    });
    expect(sequencePlayer.play).toHaveBeenCalledTimes(1);
    expect(sequencePlayer.playing).toBe(true);
    expect(longPlayer.play).not.toHaveBeenCalled();
    expect(shortPlayer.play).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
    expect(sequencePlayer.playing).toBe(false);
    await rendered.unmount();
  });

  it("produces exactly two 120ms shorts and one 360ms long, then silence on Android", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    const shortPlayer = androidCuePlayer(120);
    const longPlayer = androidCuePlayer(360);
    const { rendered } = await renderAdapter(shortPlayer, longPlayer);
    const port = rendered.result.current;
    await port.playShortCue();
    await act(async () => { jest.advanceTimersByTime(1_000); });
    await port.playShortCue();
    await act(async () => { jest.advanceTimersByTime(1_000); });
    await port.playLongCue();
    await act(async () => { jest.advanceTimersByTime(3_500); });
    expect(shortPlayer.audibleStarts).toEqual([10_000, 11_000]);
    expect(longPlayer.audibleStarts).toEqual([12_000]);
    expect(shortPlayer.playing).toBe(false);
    expect(longPlayer.playing).toBe(false);
    await rendered.unmount();
  });

  it("stops an audible short before starting a final cue during a compressed deadline", async () => {
    jest.useFakeTimers();
    const shortPlayer = androidCuePlayer(120);
    const longPlayer = androidCuePlayer(360);
    const { rendered } = await renderAdapter(shortPlayer, longPlayer);
    await rendered.result.current.playShortCue();
    jest.advanceTimersByTime(60);
    await rendered.result.current.playLongCue();
    expect(shortPlayer.playing).toBe(false);
    expect(longPlayer.playing).toBe(true);
    await rendered.unmount();
  });

  it("ignores a delayed finish from a cancelled countdown while its next short is playing", async () => {
    jest.useFakeTimers();
    const shortPlayer = androidCuePlayer(120);
    const { rendered } = await renderAdapter(shortPlayer);
    await rendered.result.current.playShortCue();
    jest.advanceTimersByTime(40);
    rendered.result.current.cancelPendingCues?.();
    rendered.result.current.cancelPendingCues?.();
    shortPlayer.currentTime = 0.04;
    await rendered.result.current.playShortCue();
    const seeks = shortPlayer.seekTo.mock.calls.length;
    shortPlayer.emit({ didJustFinish: true, playing: false });
    expect(shortPlayer.seekTo).toHaveBeenCalledTimes(seeks);
    expect(shortPlayer.playing).toBe(true);
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(shortPlayer.audibleStarts).toHaveLength(2);
    expect(shortPlayer.playing).toBe(false);
    await rendered.unmount();
  });

  it("prepares an ended native player before waiting for readiness when its finish event is delayed", async () => {
    jest.useFakeTimers();
    const shortPlayer = cuePlayer();
    const { rendered } = await renderAdapter(shortPlayer);
    await rendered.result.current.playShortCue();
    // Expo's synchronous Android isLoaded getter is false at STATE_ENDED,
    // although its finish-event status reports isLoaded:true. JS may not have
    // received that event by the next cue request.
    shortPlayer.currentTime = 0.12;
    shortPlayer.isLoaded = false;
    shortPlayer.seekTo.mockImplementation(async () => {
      shortPlayer.currentTime = 0;
      shortPlayer.emit({ isLoaded: true });
    });
    const next = rendered.result.current.playShortCue().then(() => true, () => false);
    await act(async () => { await jest.advanceTimersByTimeAsync(350); });
    expect(await next).toBe(true);
    expect(shortPlayer.play).toHaveBeenCalledTimes(2);
    await rendered.unmount();
  });

  it("starts a loaded final player synchronously without waiting for an unnecessary seek", async () => {
    const { rendered, shortPlayer, longPlayer } = await renderAdapter();
    longPlayer.seekTo.mockImplementation(() => new Promise(() => undefined));
    const final = rendered.result.current.playLongCue();
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
    expect(longPlayer.seekTo).not.toHaveBeenCalled();
    await final;
    await rendered.result.current.playShortCue();
    expect(shortPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockedUseAudioPlayer).toHaveBeenNthCalledWith(1, SHORT_CUE_ASSET);
    expect(mockedUseAudioPlayer).toHaveBeenNthCalledWith(2, LONG_CUE_ASSET);
    await rendered.unmount();
  });

  it("rewinds completed cues ahead of the next rest and keeps its route-owned port stable", async () => {
    const { rendered, longPlayer } = await renderAdapter();
    const port = rendered.result.current;
    await port.playLongCue();
    longPlayer.currentTime = 0.36;
    await act(async () => { longPlayer.emit({ didJustFinish: true }); });
    expect(longPlayer.seekTo).toHaveBeenCalledTimes(1);
    await rendered.rerender(undefined);
    expect(rendered.result.current).toBe(port);
    await port.playLongCue();
    expect(longPlayer.play).toHaveBeenCalledTimes(2);
    expect(longPlayer.seekTo).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it("waits for readiness and cancels stale shorts when the final cue arrives", async () => {
    const shortPlayer = cuePlayer();
    shortPlayer.isLoaded = false;
    const { rendered, longPlayer } = await renderAdapter(shortPlayer);
    const short = rendered.result.current.playShortCue();
    await rendered.result.current.playLongCue();
    await short;
    shortPlayer.emit({ isLoaded: true });
    expect(shortPlayer.play).not.toHaveBeenCalled();
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it("plays a final cue once when its player finishes loading within the bounded window", async () => {
    const longPlayer = cuePlayer();
    longPlayer.isLoaded = false;
    const { rendered } = await renderAdapter(cuePlayer(), longPlayer);
    const final = rendered.result.current.playLongCue();
    expect(longPlayer.play).not.toHaveBeenCalled();
    longPlayer.emit({ isLoaded: true });
    await final;
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
    await rendered.unmount();
  });

  it("cancels a pending seek after a manual or preference change", async () => {
    const { rendered, shortPlayer } = await renderAdapter();
    shortPlayer.currentTime = 0.12;
    let finishSeek!: () => void;
    shortPlayer.seekTo.mockImplementation(() => new Promise<void>((resolve) => { finishSeek = resolve; }));
    const short = rendered.result.current.playShortCue();
    rendered.result.current.cancelPendingCues?.();
    finishSeek();
    await short;
    expect(shortPlayer.play).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it("reports a seek timeout without replaying a short outside its cue window", async () => {
    jest.useFakeTimers();
    const { rendered, shortPlayer } = await renderAdapter();
    shortPlayer.currentTime = 0.12;
    let finishSeek!: () => void;
    shortPlayer.seekTo.mockImplementation(() => new Promise<void>((resolve) => { finishSeek = resolve; }));
    const short = expect(rendered.result.current.playShortCue()).rejects.toThrow("rest_countdown_audio_seek_timeout");
    jest.advanceTimersByTime(500);
    finishSeek();
    await short;
    expect(shortPlayer.play).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it("reports a stalled final replay as an audio failure rather than silently dropping it", async () => {
    jest.useFakeTimers();
    const { rendered, longPlayer } = await renderAdapter();
    longPlayer.currentTime = 0.36;
    longPlayer.seekTo.mockImplementation(() => new Promise(() => undefined));
    const final = expect(rendered.result.current.playLongCue()).rejects.toThrow("rest_countdown_audio_seek_timeout");
    jest.advanceTimersByTime(1_000);
    await final;
    expect(longPlayer.play).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it("contains bounded readiness failures and native playback failures", async () => {
    jest.useFakeTimers();
    const longPlayer = cuePlayer();
    longPlayer.isLoaded = false;
    const { rendered, shortPlayer } = await renderAdapter(cuePlayer(), longPlayer);
    const final = expect(rendered.result.current.playLongCue()).rejects.toThrow("rest_countdown_audio_not_ready");
    jest.advanceTimersByTime(1_000);
    await final;
    shortPlayer.play.mockImplementation(() => { throw new Error("audio_unavailable"); });
    await expect(rendered.result.current.playShortCue()).rejects.toThrow("audio_unavailable");
    expect(longPlayer.play).not.toHaveBeenCalled();
    await rendered.unmount();
  });

  it("cancels readiness and pauses active cues when the app backgrounds or the route unmounts", async () => {
    let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
    appStateListener.mockImplementation((_event, listener) => {
      onAppStateChange = listener;
      return { remove: jest.fn() };
    });
    {
      const longPlayer = cuePlayer();
      longPlayer.isLoaded = false;
      const { rendered, shortPlayer } = await renderAdapter(cuePlayer(), longPlayer);
      const final = rendered.result.current.playLongCue();
      onAppStateChange?.("background");
      longPlayer.emit({ isLoaded: true });
      await final;
      expect(longPlayer.play).not.toHaveBeenCalled();
      expect(shortPlayer.pause).toHaveBeenCalled();
      longPlayer.isLoaded = false;
      const next = rendered.result.current.playLongCue();
      await rendered.unmount();
      longPlayer.emit({ isLoaded: true });
      await next;
      expect(longPlayer.play).not.toHaveBeenCalled();
    }
  });

  it("contains native loading errors and pause failures without leaving a playable request", async () => {
    const longPlayer = cuePlayer();
    longPlayer.isLoaded = false;
    const { rendered } = await renderAdapter(cuePlayer(), longPlayer);
    const final = expect(rendered.result.current.playLongCue()).rejects.toThrow("decoder_failure");
    longPlayer.emit({ error: "decoder_failure" });
    await final;
    longPlayer.pause.mockImplementation(() => { throw new Error("released_player"); });
    expect(() => rendered.result.current.cancelPendingCues?.()).not.toThrow();
    await rendered.unmount();
  });

  it("keeps the deterministic PCM assets distinct and source-controlled", () => {
    const {
      readFileSync,
    } = require("node:fs") as typeof import("node:fs");
    const {
      createHash,
    } = require("node:crypto") as typeof import("node:crypto");
    const {
      join,
    } = require("node:path") as typeof import("node:path");

    const root = join(__dirname, "../../..");
    const shortCue = readFileSync(join(root, "assets/audio/rest-cue-short.wav"));
    const longCue = readFileSync(join(root, "assets/audio/rest-cue-long.wav"));
    const waveDuration = (cue: Buffer) => cue.readUInt32LE(40) / cue.readUInt32LE(28);

    for (const cue of [shortCue, longCue]) {
      expect(cue.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(cue.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(cue.readUInt16LE(20)).toBe(1);
      expect(cue.readUInt16LE(22)).toBe(1);
      expect(cue.readUInt32LE(24)).toBe(44_100);
      expect(cue.readUInt16LE(34)).toBe(16);
    }
    expect(waveDuration(shortCue)).toBeCloseTo(0.12, 5);
    expect(waveDuration(longCue)).toBeCloseTo(0.36, 5);
    expect(createHash("sha256").update(shortCue).digest("hex"))
      .toBe("da524aae3129620ba8cca4fd6bd18010feff8b03d07a0dc3f5043d7280037410");
    expect(createHash("sha256").update(longCue).digest("hex"))
      .toBe("d9d9b12ca269b3d3dd269a8d6079c839266500a7b76cfcfeeee95b4a0d8938a8");
  });

});
