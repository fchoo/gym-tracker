import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Platform } from "react-native";
import { createExactRestAlarmAccessPort } from "./exactAlarmAccess";

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
