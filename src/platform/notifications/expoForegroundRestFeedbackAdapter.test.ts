import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as Notifications from "expo-notifications";
import {
  impactAsync,
} from "expo-haptics";

import {
  createExpoForegroundRestFeedbackAdapter,
  installForegroundRestNotificationHandler,
} from "./expoForegroundRestFeedbackAdapter";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(),
}));

describe("Expo foreground rest feedback adapter", () => {
  it("installs a sound-enabled foreground handler and emits a sound-only immediate request", async () => {
    const adapter = createExpoForegroundRestFeedbackAdapter();

    await adapter.playTone({ sessionId: "session-1" });

    expect(Notifications.setNotificationHandler).toHaveBeenCalledWith({
      handleNotification: expect.any(Function),
    });
    const calls = (Notifications.setNotificationHandler as unknown as {
      mock: { calls: unknown[][] };
    }).mock.calls;
    const registration = calls[0]![0] as {
      handleNotification: () => Promise<unknown>;
    };
    const handler = registration.handleNotification;
    await expect(handler()).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: expect.objectContaining({
        sound: "default",
        vibrate: [],
      }),
      trigger: { channelId: "workout-rest-v2-sound-only" },
    });
  });

  it("registers the global foreground handler once across adapter instances", () => {
    installForegroundRestNotificationHandler();
    installForegroundRestNotificationHandler();

    expect(Notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it("propagates haptic rejection to the lifecycle diagnostic boundary", async () => {
    (impactAsync as jest.MockedFunction<typeof impactAsync>)
      .mockRejectedValueOnce(new Error("haptics_unavailable"));

    await expect(createExpoForegroundRestFeedbackAdapter().vibrate())
      .rejects.toThrow("haptics_unavailable");
  });
});
