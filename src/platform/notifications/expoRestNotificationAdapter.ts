import * as Notifications from "expo-notifications";
import {
  Linking,
} from "react-native";

import {
  REST_NOTIFICATION_CHANNEL_ID,
  REST_NOTIFICATION_CHANNEL_IDS,
  type RestAlertPreferences,
  type RestNotificationPermission,
  type RestNotificationPort,
} from "../../domains/rest";
import {
  parseRestNotificationPayload,
} from "./restNotificationReconciler";

const REST_VIBRATION_PATTERN = [0, 180] as const;
const DEFAULT_REST_ALERT_PREFERENCES: RestAlertPreferences = Object.freeze({
  soundEnabled: true,
  vibrationEnabled: true,
});

function channelIdFor(
  preferences: RestAlertPreferences,
): string {
  if (preferences.soundEnabled) {
    return preferences.vibrationEnabled
      ? REST_NOTIFICATION_CHANNEL_IDS.soundVibration
      : REST_NOTIFICATION_CHANNEL_IDS.soundOnly;
  }
  return preferences.vibrationEnabled
    ? REST_NOTIFICATION_CHANNEL_IDS.vibrationOnly
    : REST_NOTIFICATION_CHANNEL_IDS.silent;
}

function channelInputFor(preferences: RestAlertPreferences) {
  return {
    name: "Workout rest",
    description: "Background alerts when a workout rest period ends",
    importance: Notifications.AndroidImportance.DEFAULT,
    showBadge: false,
    enableLights: false,
    sound: preferences.soundEnabled ? "default" : null,
    enableVibrate: preferences.vibrationEnabled,
    vibrationPattern: preferences.vibrationEnabled
      ? [...REST_VIBRATION_PATTERN]
      : null,
  };
}

function permissionValue(status: Readonly<{
  status?: string;
  granted?: boolean;
  canAskAgain?: boolean;
}>): RestNotificationPermission {
  if (status.status === "granted" || status.granted === true) {
    return "granted";
  }
  if (status.status === "denied") {
    return "denied";
  }
  if (status.status === "undetermined") {
    return "undetermined";
  }
  return status.canAskAgain === false ? "denied" : "undetermined";
}

export function createExpoRestNotificationAdapter(): RestNotificationPort {
  const adapter: RestNotificationPort = {
    async ensureChannel(preferences = DEFAULT_REST_ALERT_PREFERENCES) {
      await Notifications.setNotificationChannelAsync(
        channelIdFor(preferences),
        channelInputFor(preferences),
      );
    },

    async permission() {
      return permissionValue(await Notifications.getPermissionsAsync());
    },

    async requestPermission() {
      await adapter.ensureChannel({
        soundEnabled: true,
        vibrationEnabled: true,
      });
      return permissionValue(await Notifications.requestPermissionsAsync());
    },

    async listScheduled() {
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      return requests.flatMap((request) => {
        const payload = parseRestNotificationPayload(request.content.data);
        if (payload === null && !request.identifier.startsWith("rest:")) {
          return [];
        }
        return [{
          identifier: request.identifier,
          sessionId: payload?.sessionId ?? null,
          restRevision: payload?.restRevision ?? null,
          endsAtMs: payload?.endsAtMs ?? null,
          channelId: (
            typeof request.trigger === "object"
            && request.trigger !== null
            && "channelId" in request.trigger
            && typeof request.trigger.channelId === "string"
          ) ? request.trigger.channelId : null,
        }];
      });
    },

    cancel: (identifier) =>
      Notifications.cancelScheduledNotificationAsync(identifier),

    schedule: (request) => {
      const preferences = request.preferences ?? DEFAULT_REST_ALERT_PREFERENCES;
      const channelId = channelIdFor(preferences);
      return Notifications.scheduleNotificationAsync({
        identifier: request.identifier,
        content: {
          title: "Rest complete",
          body: "Your next working set is ready.",
          data: {
            version: 1,
            sessionId: request.sessionId,
            restRevision: request.restRevision,
            endsAtMs: request.endsAtMs,
          },
          sound: preferences.soundEnabled ? "default" : false,
          vibrate: preferences.vibrationEnabled
            ? [...REST_VIBRATION_PATTERN]
            : [],
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: request.endsAtMs,
          channelId,
        },
      });
    },

    openSettings: () => Linking.openSettings(),
  };
  return Object.freeze(adapter);
}
