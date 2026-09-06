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

jest.mock("expo-audio", () => ({
  useAudioPlayer: jest.fn(),
}));

const mockedUseAudioPlayer = jest.mocked(useAudioPlayer);

describe("Expo rest countdown cue adapter", () => {
  it("creates local hook-owned players and replays the short and long cues without throwing", async () => {
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

    const rendered = renderHook(() => useExpoRestCountdownCueAdapter());

    await expect(rendered.result.current.playShortCue()).resolves.toBeUndefined();
    await expect(rendered.result.current.playLongCue()).resolves.toBeUndefined();

    expect(mockedUseAudioPlayer).toHaveBeenCalledTimes(2);
    expect(shortPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(shortPlayer.play).toHaveBeenCalledTimes(1);
    expect(longPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(longPlayer.play).toHaveBeenCalledTimes(1);
  });

  it("contains a player failure so playback cannot become rest authority", async () => {
    const failedPlayer = {
      seekTo: jest.fn(() => {
        throw new Error("audio_unavailable");
      }),
      play: jest.fn(),
    };
    mockedUseAudioPlayer
      .mockReturnValueOnce(failedPlayer as never)
      .mockReturnValueOnce({ seekTo: jest.fn(), play: jest.fn() } as never);

    const rendered = renderHook(() => useExpoRestCountdownCueAdapter());

    await expect(rendered.result.current.playShortCue()).resolves.toBeUndefined();
    expect(failedPlayer.play).not.toHaveBeenCalled();
  });
});
