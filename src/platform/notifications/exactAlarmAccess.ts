import { Platform } from "react-native";
import type { AndroidExactRestAlarmNativeModule } from "../../../modules/android-view-focus/src";

export type ExactRestAlarmAccess = "not_required" | "allowed" | "denied" | "unavailable";
export interface ExactRestAlarmAccessPort {
  read(): ExactRestAlarmAccess;
  openSettings(): Promise<boolean>;
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
  });
}
