import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  ImpactFeedbackStyle,
  impactAsync,
} from "expo-haptics";

import {
  createExpoHapticsAdapter,
} from "./expoHapticsAdapter";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "light",
  },
  impactAsync: jest.fn(),
}));

const mockedImpact = impactAsync as jest.MockedFunction<typeof impactAsync>;

describe("Expo haptics adapter", () => {
  it("uses light committed feedback and treats platform failure as non-blocking", async () => {
    mockedImpact.mockResolvedValueOnce();
    await expect(
      createExpoHapticsAdapter().committed(),
    ).resolves.toBeUndefined();
    expect(mockedImpact).toHaveBeenLastCalledWith(ImpactFeedbackStyle.Light);

    mockedImpact.mockRejectedValueOnce(new Error("haptics_unavailable"));
    await expect(
      createExpoHapticsAdapter().committed(),
    ).resolves.toBeUndefined();
  });
});
