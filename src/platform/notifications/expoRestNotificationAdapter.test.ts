import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as Notifications from "expo-notifications";
import {
  Linking,
} from "react-native";

import {
  REST_NOTIFICATION_CHANNEL_ID,
  REST_NOTIFICATION_CHANNEL_IDS,
} from "../../domains/rest";
import {
  createExpoRestNotificationAdapter,
} from "./expoRestNotificationAdapter";

jest.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

const expo = Notifications as jest.Mocked<typeof Notifications>;

describe("Expo rest notification adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [
      "sound and vibration",
      { soundEnabled: true, vibrationEnabled: true },
      REST_NOTIFICATION_CHANNEL_IDS.soundVibration,
      { sound: "default", enableVibrate: true, vibrationPattern: [0, 180] },
    ],
    [
      "sound only",
      { soundEnabled: true, vibrationEnabled: false },
      REST_NOTIFICATION_CHANNEL_IDS.soundOnly,
      { sound: "default", enableVibrate: false, vibrationPattern: null },
    ],
    [
      "vibration only",
      { soundEnabled: false, vibrationEnabled: true },
      REST_NOTIFICATION_CHANNEL_IDS.vibrationOnly,
      { sound: null, enableVibrate: true, vibrationPattern: [0, 180] },
    ],
    [
      "silent",
      { soundEnabled: false, vibrationEnabled: false },
      REST_NOTIFICATION_CHANNEL_IDS.silent,
      { sound: null, enableVibrate: false, vibrationPattern: null },
    ],
  ])("creates a distinct immutable v2 channel for %s", async (
    _label,
    preferences,
    channelId,
    expectedChannel,
  ) => {
    expo.setNotificationChannelAsync.mockResolvedValueOnce(null);
    await createExpoRestNotificationAdapter().ensureChannel(preferences);
    expect(expo.setNotificationChannelAsync).toHaveBeenCalledWith(
      channelId,
      expect.objectContaining({
        name: "Workout rest",
        importance: Notifications.AndroidImportance.DEFAULT,
        showBadge: false,
        ...expectedChannel,
      }),
    );
  });

  it("defaults channel creation to sound and vibration", async () => {
    expo.setNotificationChannelAsync.mockResolvedValueOnce(null);

    await createExpoRestNotificationAdapter().ensureChannel();

    expect(expo.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
    expect(expo.setNotificationChannelAsync).toHaveBeenCalledWith(
      REST_NOTIFICATION_CHANNEL_IDS.soundVibration,
      {
        name: "Workout rest",
        description: "Background alerts when a workout rest period ends",
        importance: Notifications.AndroidImportance.DEFAULT,
        showBadge: false,
        enableLights: false,
        sound: "default",
        enableVibrate: true,
        vibrationPattern: [0, 180],
      },
    );
  });

  it("maps granted, denied, and undetermined permission states", async () => {
    expo.getPermissionsAsync
      .mockResolvedValueOnce({
        status: "granted",
        granted: true,
        canAskAgain: false,
      } as never)
      .mockResolvedValueOnce({
        status: "undetermined",
        granted: false,
        canAskAgain: true,
      } as never)
      .mockResolvedValueOnce({
        status: "denied",
        granted: false,
        canAskAgain: true,
      } as never);
    const adapter = createExpoRestNotificationAdapter();
    await expect(adapter.permission()).resolves.toBe("granted");
    await expect(adapter.permission()).resolves.toBe("undetermined");
    await expect(adapter.permission()).resolves.toBe("denied");
  });

  it("falls back to canAskAgain only when Expo omits a known status", async () => {
    expo.getPermissionsAsync
      .mockResolvedValueOnce({
        granted: false,
        canAskAgain: false,
      } as never)
      .mockResolvedValueOnce({
        granted: false,
        canAskAgain: true,
      } as never);
    const adapter = createExpoRestNotificationAdapter();

    await expect(adapter.permission()).resolves.toBe("denied");
    await expect(adapter.permission()).resolves.toBe("undetermined");
  });

  it.each([
    [
      "sound and vibration",
      { soundEnabled: true, vibrationEnabled: true },
      REST_NOTIFICATION_CHANNEL_ID,
      "default",
      [0, 180],
    ],
    [
      "sound only",
      { soundEnabled: true, vibrationEnabled: false },
      REST_NOTIFICATION_CHANNEL_IDS.soundOnly,
      "default",
      [],
    ],
    [
      "vibration only",
      { soundEnabled: false, vibrationEnabled: true },
      REST_NOTIFICATION_CHANNEL_IDS.vibrationOnly,
      false,
      [0, 180],
    ],
    [
      "silent",
      { soundEnabled: false, vibrationEnabled: false },
      REST_NOTIFICATION_CHANNEL_IDS.silent,
      false,
      [],
    ],
  ])("schedules stable versioned alert content for %s", async (
    _label,
    preferences,
    channelId,
    sound,
    vibrate,
  ) => {
    expo.scheduleNotificationAsync.mockResolvedValueOnce("rest:session-1");
    await expect(createExpoRestNotificationAdapter().schedule({
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
      preferences,
    })).resolves.toBe("rest:session-1");
    expect(expo.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "rest:session-1",
      content: expect.objectContaining({
        title: "Rest complete",
        data: {
          version: 1,
          sessionId: "session-1",
          restRevision: 3,
          endsAtMs: 100_000,
        },
        sound,
        vibrate,
      }),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: 100_000,
        channelId,
      },
    });
  });

  it("defaults scheduled alerts to sound and vibration", async () => {
    expo.scheduleNotificationAsync.mockResolvedValueOnce("rest:session-1");

    await expect(createExpoRestNotificationAdapter().schedule({
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
    })).resolves.toBe("rest:session-1");

    expect(expo.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(expo.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "rest:session-1",
      content: {
        title: "Rest complete",
        body: "Your next working set is ready.",
        data: {
          version: 1,
          sessionId: "session-1",
          restRevision: 3,
          endsAtMs: 100_000,
        },
        sound: "default",
        vibrate: [0, 180],
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: 100_000,
        channelId: REST_NOTIFICATION_CHANNEL_IDS.soundVibration,
      },
    });
  });

  it("lists valid and malformed rest requests for deterministic cleanup", async () => {
    expo.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      {
        identifier: "rest:session-1",
        content: {
          data: {
            version: 1,
            sessionId: "session-1",
            restRevision: 3,
            endsAtMs: 100_000,
          },
        },
        trigger: null,
      },
      {
        identifier: "rest:session-2",
        content: {
          data: {
            version: 1,
            sessionId: "session-2",
            restRevision: 4,
            endsAtMs: 120_000,
          },
        },
        trigger: {
          type: "date",
          channelId: REST_NOTIFICATION_CHANNEL_IDS.soundOnly,
        },
      },
      {
        identifier: "rest:session-1:malformed",
        content: { data: { version: 9 } },
        trigger: null,
      },
      {
        identifier: "unrelated",
        content: { data: {} },
        trigger: null,
      },
    ] as never);
    await expect(createExpoRestNotificationAdapter().listScheduled())
      .resolves.toEqual([
        {
          identifier: "rest:session-1",
          sessionId: "session-1",
          restRevision: 3,
          endsAtMs: 100_000,
          channelId: null,
        },
        {
          identifier: "rest:session-2",
          sessionId: "session-2",
          restRevision: 4,
          endsAtMs: 120_000,
          channelId: REST_NOTIFICATION_CHANNEL_IDS.soundOnly,
        },
        {
          identifier: "rest:session-1:malformed",
          sessionId: null,
          restRevision: null,
          endsAtMs: null,
          channelId: null,
        },
      ]);
  });

  it("cancels requests, requests permission after channel creation, and opens settings", async () => {
    expo.setNotificationChannelAsync.mockResolvedValueOnce(null);
    expo.requestPermissionsAsync.mockResolvedValueOnce({
      granted: true,
    } as never);
    expo.cancelScheduledNotificationAsync.mockResolvedValueOnce();
    jest.spyOn(Linking, "openSettings").mockResolvedValueOnce();
    const adapter = createExpoRestNotificationAdapter();

    await expect(adapter.requestPermission()).resolves.toBe("granted");
    expect(expo.setNotificationChannelAsync.mock.invocationCallOrder[0])
      .toBeLessThan(expo.requestPermissionsAsync.mock.invocationCallOrder[0]!);
    await adapter.cancel("rest:session-1");
    expect(expo.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "rest:session-1",
    );
    await adapter.openSettings();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it("surfaces platform failures for the reconciler to handle fail-soft", async () => {
    const adapter = createExpoRestNotificationAdapter();
    expo.setNotificationChannelAsync.mockRejectedValueOnce(
      new Error("channel_failed"),
    );
    expo.scheduleNotificationAsync.mockRejectedValueOnce(
      new Error("schedule_failed"),
    );

    await expect(adapter.ensureChannel({
      soundEnabled: true,
      vibrationEnabled: true,
    })).rejects.toThrow("channel_failed");
    await expect(adapter.schedule({
      identifier: "rest:session-1",
      sessionId: "session-1",
      restRevision: 3,
      endsAtMs: 100_000,
      preferences: { soundEnabled: true, vibrationEnabled: true },
    })).rejects.toThrow("schedule_failed");
  });
});
