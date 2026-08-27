import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import * as Notifications from "expo-notifications";

import {
  applyPhase1NotificationTestControl,
  applyPhase1NotificationTestControlWithPort,
  type Phase1NotificationTestPort,
} from "./phase1NotificationTestControls";
import {
  REST_NOTIFICATION_CHANNEL_ID,
} from "../domains/rest";
import type {
  RestAlertPreferences,
} from "../platform/preferences/restAlertPreferenceStore";

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

const expo = Notifications as jest.Mocked<typeof Notifications>;

type TestNotificationPort = Phase1NotificationTestPort & Readonly<{
  cancel: jest.MockedFunction<Phase1NotificationTestPort["cancel"]>;
  schedule: jest.MockedFunction<Phase1NotificationTestPort["schedule"]>;
  preferences: Readonly<{
    read: jest.MockedFunction<() => RestAlertPreferences>;
    write: jest.MockedFunction<(preferences: RestAlertPreferences) => void>;
  }>;
}>;

function port(
  identifiers: readonly string[],
  initialPreferences: RestAlertPreferences = {
    soundEnabled: true,
    vibrationEnabled: true,
  },
): TestNotificationPort {
  const scheduledIdentifiers = [...identifiers];
  let preferences: RestAlertPreferences = initialPreferences;
  return {
    list: jest.fn(async () =>
      scheduledIdentifiers.map((identifier) => ({ identifier })) as never
    ),
    cancel: jest.fn(async (identifier: string) => {
      const index = scheduledIdentifiers.indexOf(identifier);
      if (index >= 0) {
        scheduledIdentifiers.splice(index, 1);
      }
    }),
    schedule: jest.fn(async () => "rest:phase1-late-stale"),
    permission: jest.fn(async (): Promise<"granted"> => "granted"),
    preferences: {
      read: jest.fn(() => preferences),
      write: jest.fn((next: RestAlertPreferences) => {
        preferences = next;
      }),
    },
  };
}

describe("Phase 1 notification scheduler controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [
      true,
      {
        action: "inspect_permission",
        code: "permission_granted",
        heading: "Notifications available",
        body: "Notification permission · granted",
        scheduledRestCount: 0,
      },
    ],
    [
      false,
      {
        action: "inspect_permission",
        code: "permission_denied",
        heading: "Notifications unavailable",
        body: "Notification permission · denied",
        scheduledRestCount: 0,
      },
    ],
  ] as const)(
    "maps Expo permission granted=%s through the production notification wrapper",
    async (...[granted, expected]) => {
      expo.getPermissionsAsync.mockResolvedValueOnce({ granted } as never);

      await expect(
        applyPhase1NotificationTestControl("inspect_permission"),
      ).resolves.toEqual(expected);
      expect(expo.getPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(expo.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
      expect(expo.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
      expect(expo.scheduleNotificationAsync).not.toHaveBeenCalled();
    },
  );

  it("inspects only the bounded count of stable rest identifiers", async () => {
    const scheduler = port([
      "other",
      "rest:session-b",
      "rest:session-a",
    ]);

    await expect(
      applyPhase1NotificationTestControlWithPort("inspect", scheduler),
    ).resolves
      .toEqual({
        action: "inspect",
        code: "scheduled_rest_count",
        heading: "Scheduled rest alerts inspected",
        body: "Scheduled rest alerts · 2",
        scheduledRestCount: 2,
      });
  });

  it("cancels every owned rest or background-probe request and leaves unrelated work alone", async () => {
    const scheduler = port([
      "other",
      "notification-test:another-probe",
      "rest:session-a",
      "notification-test:background-expiry",
      "rest:session-b",
    ]);

    await expect(
      applyPhase1NotificationTestControlWithPort("cancel_all", scheduler),
    ).resolves
      .toMatchObject({
        code: "scheduled_rest_removed",
        heading: "Scheduled rest alerts removed",
        scheduledRestCount: 0,
      });
    expect(scheduler.cancel.mock.calls.flat()).toEqual([
      "rest:session-a",
      "notification-test:background-expiry",
      "rest:session-b",
    ]);
    await expect(scheduler.list()).resolves.toEqual([
      { identifier: "other" },
      { identifier: "notification-test:another-probe" },
    ]);
  });

  it("returns a bounded platform failure when an owned request remains after cleanup verification", async () => {
    const scheduler = port([
      "rest:session-a",
      "notification-test:background-expiry",
    ]);
    scheduler.cancel.mockImplementation(async () => undefined);

    await expect(
      applyPhase1NotificationTestControlWithPort("cancel_all", scheduler),
    ).resolves.toEqual({
      action: "cancel_all",
      code: "platform_failure",
      heading: "Notification test control failed",
      body: "Platform operation failed. Workout state was not changed.",
      scheduledRestCount: 0,
    });
    expect(scheduler.cancel).toHaveBeenCalledWith("rest:session-a");
    expect(scheduler.cancel).toHaveBeenCalledWith(
      "notification-test:background-expiry",
    );
  });

  it("returns a bounded platform failure when cancellation fails", async () => {
    const scheduler = port(["notification-test:background-expiry"]);
    scheduler.cancel.mockRejectedValueOnce(new Error("cancel failed"));

    await expect(
      applyPhase1NotificationTestControlWithPort("cancel_all", scheduler),
    ).resolves.toMatchObject({
      action: "cancel_all",
      code: "platform_failure",
      heading: "Notification test control failed",
      body: "Platform operation failed. Workout state was not changed.",
    });
  });

  it("schedules a versioned late stale payload through Expo", async () => {
    const scheduler = port(["rest:phase1-late-stale"]);

    await expect(
      applyPhase1NotificationTestControlWithPort(
        "schedule_late_stale",
        scheduler,
      ),
    ).resolves.toMatchObject({
      code: "late_stale_scheduled",
      heading: "Late stale rest alert scheduled",
      scheduledRestCount: 1,
    });
    expect(scheduler.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "rest:phase1-late-stale",
        content: expect.objectContaining({
          data: expect.objectContaining({
            version: 1,
            sessionId: "stale-session",
            restRevision: 0,
          }),
        }),
        trigger: expect.objectContaining({
          type: "date",
          channelId: REST_NOTIFICATION_CHANNEL_ID,
        }),
      }),
    );
  });

  it("selects all four preferences only after an exact readback", async () => {
    const cases = [
      ["set_sound_vibration", { soundEnabled: true, vibrationEnabled: true }],
      ["set_sound_only", { soundEnabled: true, vibrationEnabled: false }],
      ["set_vibration_only", { soundEnabled: false, vibrationEnabled: true }],
      ["set_silent", { soundEnabled: false, vibrationEnabled: false }],
    ] as const;

    for (const [action, expected] of cases) {
      const scheduler = port([]);
      await expect(
        applyPhase1NotificationTestControlWithPort(action, scheduler),
      ).resolves.toMatchObject({
        action,
        code: "preferences_updated",
        body: expect.stringMatching(/^Rest alert preference · /u),
      });
      expect(scheduler.preferences.write).toHaveBeenCalledWith(expected);
      expect(scheduler.preferences.read).toHaveBeenCalledTimes(1);
    }
  });

  it("resets rest-alert preferences to the default sound and vibration state", async () => {
    const scheduler = port([]);

    await expect(
      applyPhase1NotificationTestControlWithPort("reset_preferences", scheduler),
    ).resolves.toMatchObject({
      code: "preferences_reset",
      body: "Rest alert preference reset",
    });
    expect(scheduler.preferences.write).toHaveBeenCalledWith({
      soundEnabled: true,
      vibrationEnabled: true,
    });
    expect(scheduler.preferences.read).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "set_sound_only",
      { soundEnabled: true, vibrationEnabled: false },
      { soundEnabled: true, vibrationEnabled: true },
    ],
    [
      "reset_preferences",
      { soundEnabled: true, vibrationEnabled: true },
      { soundEnabled: false, vibrationEnabled: false },
    ],
  ] as const)(
    "returns a bounded platform failure when %s performs a no-op write",
    async (...[action, expected, initialPreferences]) => {
      const scheduler = port([], initialPreferences);
      scheduler.preferences.write.mockImplementation(() => undefined);

      await expect(
        applyPhase1NotificationTestControlWithPort(action, scheduler),
      ).resolves.toEqual({
        action,
        code: "platform_failure",
        heading: "Notification test control failed",
        body: "Platform operation failed. Workout state was not changed.",
        scheduledRestCount: 0,
      });
      expect(scheduler.preferences.write).toHaveBeenCalledWith(expected);
      expect(scheduler.preferences.read).toHaveBeenCalledTimes(1);
    },
  );

  it("returns a bounded platform failure when a preference write rejects", async () => {
    const scheduler = port([]);
    scheduler.preferences.write.mockImplementation(() => {
      throw new Error("write rejected");
    });

    await expect(
      applyPhase1NotificationTestControlWithPort("set_vibration_only", scheduler),
    ).resolves.toMatchObject({
      action: "set_vibration_only",
      code: "platform_failure",
      heading: "Notification test control failed",
      body: "Platform operation failed. Workout state was not changed.",
    });
    expect(scheduler.preferences.read).not.toHaveBeenCalled();
  });

  it("returns a bounded platform failure when preference readback mismatches", async () => {
    const scheduler = port([]);
    scheduler.preferences.read.mockReturnValue({
      soundEnabled: false,
      vibrationEnabled: false,
    });

    await expect(
      applyPhase1NotificationTestControlWithPort("set_sound_only", scheduler),
    ).resolves.toMatchObject({
      action: "set_sound_only",
      code: "platform_failure",
      heading: "Notification test control failed",
      body: "Platform operation failed. Workout state was not changed.",
    });
    expect(scheduler.preferences.read).toHaveBeenCalledTimes(1);
  });

  it.each(["foreground_expiry", "background_expiry"] as const)(
    "returns a bounded integration result for %s when the safe runtime hook is unavailable",
    async (action) => {
      await expect(
        applyPhase1NotificationTestControlWithPort(action, port([])),
      ).resolves.toMatchObject({
        action,
        code: "runtime_contract_unavailable",
        heading: "Expiry test hook unavailable",
      });
    },
  );

  it("reports the runtime's bounded foreground-attempt and background-schedule result codes", async () => {
    const scheduler = port([]);
    const expiry = {
      exerciseExpiry: jest.fn(async (mode: "foreground" | "background") => (
        mode === "foreground"
          ? "foreground_expiry_attempted_once" as const
          : "background_expiry_scheduled_once" as const
      )),
    };
    const runtimePort = { ...scheduler, expiry };

    await expect(
      applyPhase1NotificationTestControlWithPort("foreground_expiry", runtimePort),
    ).resolves.toMatchObject({
      code: "foreground_expiry_attempted_once",
      heading: "Foreground expiry attempt recorded once",
      body: "Expiry result · foreground_expiry_attempted_once",
    });
    await expect(
      applyPhase1NotificationTestControlWithPort("background_expiry", runtimePort),
    ).resolves.toMatchObject({
      code: "background_expiry_scheduled_once",
      body: "Expiry result · background_expiry_scheduled_once",
    });
    expect(expiry.exerciseExpiry).toHaveBeenNthCalledWith(1, "foreground");
    expect(expiry.exerciseExpiry).toHaveBeenNthCalledWith(2, "background");
  });

  it("reports the bounded post-commit expiry failure without denying committed rest state", async () => {
    const scheduler = port([]);
    const runtimePort = {
      ...scheduler,
      expiry: {
        exerciseExpiry: jest.fn(async () =>
          "platform_failure_after_expiry_commit" as const),
      },
    };

    await expect(
      applyPhase1NotificationTestControlWithPort("foreground_expiry", runtimePort),
    ).resolves.toEqual({
      action: "foreground_expiry",
      code: "platform_failure_after_expiry_commit",
      heading: "Rest expiry committed; feedback verification failed",
      body: "Authoritative rest expiry committed, but feedback verification failed.",
      scheduledRestCount: 0,
    });
  });
});
