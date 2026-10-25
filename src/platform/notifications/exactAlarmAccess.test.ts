import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { createExactRestAlarmAccessPort } from "./exactAlarmAccess";

jest.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: jest.fn(), scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

const os = Object.getOwnPropertyDescriptor(Platform, "OS");
const version = Object.getOwnPropertyDescriptor(Platform, "Version");
const platform = (value: string, sdk: number) => {
  Object.defineProperty(Platform, "OS", { configurable: true, value });
  Object.defineProperty(Platform, "Version", { configurable: true, value: sdk });
};
afterEach(() => {
  if (os) Object.defineProperty(Platform, "OS", os);
  if (version) Object.defineProperty(Platform, "Version", version);
});
describe("exact rest alarm access", () => {
  it("replaces only valid future rest alarms with the same deadline, content, and channel after access is granted", async () => {
    platform("android", 36);
    const future = Date.now() + 60_000;
    const content = { title: "Rest complete", subtitle: null, body: "Next set is ready", categoryIdentifier: null, badge: null, data: { version: 1, sessionId: "session", restRevision: 7, endsAtMs: future }, sound: "custom", vibrationPattern: [] };
    const valid = { identifier: "rest:session", content, trigger: { channelId: "workout-rest-v3-sound-only" } };
    jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([
      valid,
      { ...valid, identifier: "unrelated" },
      { ...valid, content: { ...content, data: { ...content.data, endsAtMs: Date.now() - 1 } } },
      { ...valid, content: { ...content, data: { ...content.data, version: 2 } } },
      { ...valid, trigger: {} },
    ] as never);
    const port = createExactRestAlarmAccessPort({ canScheduleExactRestAlarm: () => true, openExactRestAlarmSettings: async () => true });
    await port.refreshPendingAlarms();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "rest:session", content: { title: content.title, subtitle: null, body: content.body, data: content.data, sound: "custom", vibrate: [] },
      trigger: { type: "date", date: future, channelId: "workout-rest-v3-sound-only" },
    });
  });

  it("leaves native schedules alone while exact access is denied", async () => {
    platform("android", 36);
    jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockClear();
    const port = createExactRestAlarmAccessPort({ canScheduleExactRestAlarm: () => false, openExactRestAlarmSettings: async () => true });
    await port.refreshPendingAlarms();
    expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });

  it("requires special access only on Android 31 and later", async () => {
    const native = { canScheduleExactRestAlarm: jest.fn(() => false), openExactRestAlarmSettings: jest.fn(async () => true) };
    const port = createExactRestAlarmAccessPort(native);
    for (const [os, sdk] of [["ios", 36], ["android", 30]] as const) {
      platform(os, sdk);
      expect(port.read()).toBe("not_required");
      expect(await port.openSettings()).toBe(false);
    }
    expect(native.canScheduleExactRestAlarm).not.toHaveBeenCalled();
    expect(native.openExactRestAlarmSettings).not.toHaveBeenCalled();
  });
  it("reads current OS access and opens its screen only on explicit action", async () => {
    platform("android", 36);
    const native = { canScheduleExactRestAlarm: jest.fn(() => false), openExactRestAlarmSettings: jest.fn(async () => true) };
    const port = createExactRestAlarmAccessPort(native);
    expect(port.read()).toBe("denied");
    expect(native.openExactRestAlarmSettings).not.toHaveBeenCalled();
    expect(await port.openSettings()).toBe(true);
    native.canScheduleExactRestAlarm.mockReturnValue(true);
    expect(port.read()).toBe("allowed");
  });
  it("contains unavailable native bindings and settings failures", async () => {
    platform("android", 36);
    const port = createExactRestAlarmAccessPort({
      canScheduleExactRestAlarm: () => { throw new Error("missing"); },
      openExactRestAlarmSettings: async () => { throw new Error("unavailable"); },
    });
    expect(port.read()).toBe("unavailable");
    expect(await port.openSettings()).toBe(false);
  });
});
