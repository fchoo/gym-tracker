import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { AndroidExactRestAlarmNativeModule } from "../../../modules/android-view-focus/src";
import { parseRestNotificationPayload } from "./restNotificationReconciler";

export type ExactRestAlarmAccess = "not_required" | "allowed" | "denied" | "unavailable";
export interface ExactRestAlarmAccessPort {
  read(): ExactRestAlarmAccess;
  openSettings(): Promise<boolean>;
  refreshPendingAlarms(): Promise<void>;
}

export function createExactRestAlarmAccessPort(bridge?: AndroidExactRestAlarmNativeModule): ExactRestAlarmAccessPort {
  const required = () => Platform.OS === "android" && Number(Platform.Version) >= 31;
  const native = () => bridge ?? (require("expo-modules-core") as typeof import("expo-modules-core"))
    .requireNativeModule<AndroidExactRestAlarmNativeModule>("AndroidViewFocus");
  const read = (): ExactRestAlarmAccess => {
      if (!required()) return "not_required";
      try { return native().canScheduleExactRestAlarm() === true ? "allowed" : "denied"; }
      catch { return "unavailable"; }
  };
  return Object.freeze({
    read,
    openSettings: async () => {
      if (!required()) return false;
      try { return await native().openExactRestAlarmSettings() === true; }
      catch { return false; }
    },
    refreshPendingAlarms: async () => {
      if (read() !== "allowed") return;
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const request of scheduled) {
        const payload = parseRestNotificationPayload(request.content.data);
        if (payload === null || request.identifier !== `rest:${payload.sessionId}`
          || payload.endsAtMs <= Date.now()) continue;
        const trigger = request.trigger;
        const channelId = typeof trigger === "object" && trigger !== null && "channelId" in trigger
          && typeof trigger.channelId === "string" ? trigger.channelId : undefined;
        if (channelId === undefined) continue;
        // Expo returns output content (nullable badge/sound and
        // vibrationPattern), which differs from scheduling input. Preserve
        // rest presentation and channel preferences while normalizing that
        // serialization back to valid input fields.
        const output = request.content as Notifications.NotificationContent & Notifications.NotificationContentAndroid;
        const content: Notifications.NotificationContentInput = {
          title: output.title, subtitle: output.subtitle, body: output.body,
          sound: output.sound ?? false,
          ...(output.data === undefined ? {} : { data: output.data }),
          ...(typeof output.badge === "number" ? { badge: output.badge } : {}),
          ...(output.vibrationPattern === undefined ? {} : { vibrate: output.vibrationPattern }),
          ...(output.color === undefined ? {} : { color: output.color }),
          ...(output.priority === undefined ? {} : { priority: output.priority }),
          ...(output.categoryIdentifier === null ? {} : { categoryIdentifier: output.categoryIdentifier }),
        };
        // Replace the native derivative under its stable identifier. Do not
        // cancel first: a failed replacement must leave the pending alert.
        await Notifications.scheduleNotificationAsync({
          identifier: request.identifier,
          content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: payload.endsAtMs, channelId },
        });
      }
    },
  });
}
