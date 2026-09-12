import {
  renderHook,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  useAudioPlayer,
} from "expo-audio";

import {
  useExpoRestCountdownCueAdapter,
} from "./expoRestCountdownCueAdapter";

const SHORT_CUE_ASSET = require("../../../assets/audio/rest-cue-short.wav");
const LONG_CUE_ASSET = require("../../../assets/audio/rest-cue-long.wav");

jest.mock("expo-audio", () => ({
  useAudioPlayer: jest.fn(),
}));

const mockedUseAudioPlayer = jest.mocked(useAudioPlayer);

describe("Expo rest countdown cue adapter", () => {
  it("creates hook-owned players and replays the short and long cues without throwing", async () => {
    const shortPlayer = {
      seekTo: jest.fn(),
      play: jest.fn(),
    };
    const longPlayer = {
      seekTo: jest.fn(),
      play: jest.fn(),
    };
    mockedUseAudioPlayer
      .mockReturnValueOnce(shortPlayer as never)
      .mockReturnValueOnce(longPlayer as never);

    const rendered = await renderHook(() => useExpoRestCountdownCueAdapter());

    await expect(rendered.result.current.playShortCue()).resolves.toBeUndefined();
    await expect(rendered.result.current.playLongCue()).resolves.toBeUndefined();

    expect(mockedUseAudioPlayer).toHaveBeenCalledTimes(2);
    expect(mockedUseAudioPlayer).toHaveBeenNthCalledWith(1, SHORT_CUE_ASSET);
    expect(mockedUseAudioPlayer).toHaveBeenNthCalledWith(2, LONG_CUE_ASSET);
    expect(shortPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(shortPlayer.play).toHaveBeenCalledTimes(1);
    expect(longPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
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

  it("surfaces a player failure to the observing UI without changing rest authority", async () => {
    const failedPlayer = {
      seekTo: jest.fn(() => {
        throw new Error("audio_unavailable");
      }),
      play: jest.fn(),
    };
    mockedUseAudioPlayer
      .mockReturnValueOnce(failedPlayer as never)
      .mockReturnValueOnce({ seekTo: jest.fn(), play: jest.fn() } as never);

    const rendered = await renderHook(() => useExpoRestCountdownCueAdapter());

    await expect(rendered.result.current.playShortCue()).rejects.toThrow(
      "audio_unavailable",
    );
    expect(failedPlayer.play).not.toHaveBeenCalled();
  });
});
