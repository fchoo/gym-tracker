import {
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  getPermissionsAsync,
  scheduleNotificationAsync,
} from "expo-notifications";
import {
  REST_NOTIFICATION_CHANNEL_ID,
} from "../domains/rest";
import {
  DEFAULT_REST_ALERT_PREFERENCES,
  productionRestAlertPreferenceStore,
  type RestAlertPreferences,
} from "../platform/preferences/restAlertPreferenceStore";

export type Phase1NotificationTestAction =
  | "cancel_all"
  | "schedule_late_stale"
  | "inspect"
  | "inspect_permission"
  | "set_sound_vibration"
  | "set_sound_only"
  | "set_vibration_only"
  | "set_silent"
  | "reset_preferences"
  | "foreground_expiry"
  | "background_expiry";

export type Phase1NotificationTestCode =
  | "scheduled_rest_count"
  | "scheduled_rest_removed"
  | "late_stale_scheduled"
  | "preferences_updated"
  | "preferences_reset"
  | "permission_granted"
  | "permission_denied"
  | "foreground_expiry_attempted_once"
  | "background_expiry_scheduled_once"
  | "platform_failure_after_expiry_commit"
  | "runtime_contract_unavailable"
  | "platform_failure";

export type Phase1NotificationTestResult = Readonly<{
  action: Phase1NotificationTestAction;
  code: Phase1NotificationTestCode;
  heading: string;
  body: string;
  scheduledRestCount: number;
}>;

/**
 * Runtime integration contract for Task 2. It must expose only the bounded
 * result code and never session, workout, owner, or device data.
 */
export type NotificationExpiryTestPort = Readonly<{
  exerciseExpiry(
    mode: "foreground" | "background",
  ): Promise<
    | "foreground_expiry_attempted_once"
    | "background_expiry_scheduled_once"
    | "platform_failure_after_expiry_commit"
    | "permission_denied"
    | "runtime_contract_unavailable"
    | "platform_failure"
  >;
}>;

export type Phase1NotificationTestPort = Readonly<{
  list(): ReturnType<typeof getAllScheduledNotificationsAsync>;
  cancel(identifier: string): Promise<void>;
  schedule(
    input: Parameters<typeof scheduleNotificationAsync>[0],
  ): Promise<string>;
  permission(): Promise<"granted" | "denied">;
  preferences: Pick<typeof productionRestAlertPreferenceStore, "read" | "write">;
  expiry?: NotificationExpiryTestPort;
}>;

const productionPort: Phase1NotificationTestPort = {
  list: getAllScheduledNotificationsAsync,
  cancel: cancelScheduledNotificationAsync,
  schedule: scheduleNotificationAsync,
  async permission() {
    const result = await getPermissionsAsync();
    return result.granted ? "granted" : "denied";
  },
  preferences: productionRestAlertPreferenceStore,
};

const preferenceActions: Readonly<Partial<Record<
  Phase1NotificationTestAction,
  RestAlertPreferences
>>> = Object.freeze({
  set_sound_vibration: { soundEnabled: true, vibrationEnabled: true },
  set_sound_only: { soundEnabled: true, vibrationEnabled: false },
  set_vibration_only: { soundEnabled: false, vibrationEnabled: true },
  set_silent: { soundEnabled: false, vibrationEnabled: false },
});

const BACKGROUND_EXPIRY_TEST_IDENTIFIER =
  "notification-test:background-expiry";

function restIdentifier(identifier: string): boolean {
  return identifier.startsWith("rest:");
}

function ownedNotificationTestIdentifier(identifier: string): boolean {
  return restIdentifier(identifier)
    || identifier === BACKGROUND_EXPIRY_TEST_IDENTIFIER;
}

function hasExactPreferences(
  actual: RestAlertPreferences,
  expected: RestAlertPreferences,
): boolean {
  return actual.soundEnabled === expected.soundEnabled
    && actual.vibrationEnabled === expected.vibrationEnabled;
}

async function scheduledRestCount(
  port: Phase1NotificationTestPort,
): Promise<number> {
  return (await port.list()).filter(({ identifier }) => restIdentifier(identifier))
    .length;
}

function result(
  action: Phase1NotificationTestAction,
  code: Phase1NotificationTestCode,
  heading: string,
  body: string,
  scheduledRestCount = 0,
): Phase1NotificationTestResult {
  return Object.freeze({ action, code, heading, body, scheduledRestCount });
}

function platformFailure(
  action: Phase1NotificationTestAction,
): Phase1NotificationTestResult {
  return result(
    action,
    "platform_failure",
    "Notification test control failed",
    "Platform operation failed. Workout state was not changed.",
  );
}

export async function applyPhase1NotificationTestControlWithPort(
  action: Phase1NotificationTestAction,
  port: Phase1NotificationTestPort,
): Promise<Phase1NotificationTestResult> {
  try {
    const preference = preferenceActions[action];
    if (preference !== undefined) {
      port.preferences.write(preference);
      if (!hasExactPreferences(port.preferences.read(), preference)) {
        return platformFailure(action);
      }
      return result(
        action,
        "preferences_updated",
        "Rest alert preference selected",
        "Rest alert preference · selected",
      );
    }
    if (action === "reset_preferences") {
      port.preferences.write(DEFAULT_REST_ALERT_PREFERENCES);
      if (!hasExactPreferences(
        port.preferences.read(),
        DEFAULT_REST_ALERT_PREFERENCES,
      )) {
        return platformFailure(action);
      }
      return result(
        action,
        "preferences_reset",
        "Rest alert preferences reset",
        "Rest alert preference reset",
      );
    }
    if (action === "inspect_permission") {
      const permission = await port.permission();
      return permission === "granted"
        ? result(action, "permission_granted", "Notifications available", "Notification permission · granted")
        : result(action, "permission_denied", "Notifications unavailable", "Notification permission · denied");
    }
    if (action === "foreground_expiry" || action === "background_expiry") {
      if (port.expiry === undefined) {
        return result(
          action,
          "runtime_contract_unavailable",
          "Expiry test hook unavailable",
          "Runtime integration is required before this expiry test can run.",
        );
      }
      const code = await port.expiry.exerciseExpiry(
        action === "foreground_expiry" ? "foreground" : "background",
      );
      return result(
        action,
        code,
        code === "foreground_expiry_attempted_once"
          ? "Foreground expiry attempt recorded once"
          : code === "background_expiry_scheduled_once"
            ? "Background expiry scheduled once"
            : code === "platform_failure_after_expiry_commit"
              ? "Rest expiry committed; feedback verification failed"
            : code === "platform_failure"
              ? "Expiry test failed"
              : "Expiry test completed",
        code === "platform_failure_after_expiry_commit"
          ? "Authoritative rest expiry committed, but feedback verification failed."
          : `Expiry result · ${code}`,
      );
    }
    if (action === "cancel_all") {
      const identifiers = (await port.list())
        .map(({ identifier }) => identifier)
        .filter(ownedNotificationTestIdentifier);
      await Promise.all(identifiers.map((identifier) => port.cancel(identifier)));
      const remainingOwnedRequests = (await port.list())
        .some(({ identifier }) => ownedNotificationTestIdentifier(identifier));
      if (remainingOwnedRequests) {
        return platformFailure(action);
      }
      return result(
        action,
        "scheduled_rest_removed",
        "Scheduled rest alerts removed",
        "Return to Today to let SQLite repair the missing request.",
      );
    }
    if (action === "schedule_late_stale") {
      await port.schedule({
        identifier: "rest:phase1-late-stale",
        content: {
          title: "Rest ended",
          body: "Development-test stale rest alert",
          data: {
            version: 1,
            sessionId: "stale-session",
            restRevision: 0,
            endsAtMs: Date.now() - 60_000,
          },
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: new Date(Date.now() + 120_000),
          channelId: REST_NOTIFICATION_CHANNEL_ID,
        },
      });
      return result(
        action,
        "late_stale_scheduled",
        "Late stale rest alert scheduled",
        "Return to Today to let the active-session reconciler remove it.",
        await scheduledRestCount(port),
      );
    }
    const count = await scheduledRestCount(port);
    return result(
      action,
      "scheduled_rest_count",
      "Scheduled rest alerts inspected",
      `Scheduled rest alerts · ${count}`,
      count,
    );
  } catch {
    return platformFailure(action);
  }
}

export function applyPhase1NotificationTestControl(
  action: Phase1NotificationTestAction,
  expiry?: NotificationExpiryTestPort,
): Promise<Phase1NotificationTestResult> {
  return applyPhase1NotificationTestControlWithPort(action, {
    ...productionPort,
    ...(expiry === undefined ? {} : { expiry }),
  });
}
