import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Platform } from "react-native";

import { requestAndroidViewFocus } from "./androidViewFocus";

const originalPlatformOS = Platform.OS;

function setPlatformOS(os: typeof Platform.OS): void {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: os,
  });
}

describe("Android view focus bridge", () => {
  afterEach(() => {
    setPlatformOS(originalPlatformOS);
  });

  it("requests native focus by stable nativeID on Android", async () => {
    setPlatformOS("android");
    const bridge = {
      requestFocus: jest.fn(async () => true),
    };

    await expect(requestAndroidViewFocus("root-settings-trigger-library", bridge))
      .resolves.toBe(true);
    expect(bridge.requestFocus).toHaveBeenCalledWith(
      "root-settings-trigger-library",
    );
  });

  it("fails closed outside Android, for invalid IDs, and on bridge failure", async () => {
    const bridge = {
      requestFocus: jest.fn(async () => true),
    };

    setPlatformOS("ios");
    await expect(requestAndroidViewFocus("root-settings-trigger-index", bridge))
      .resolves.toBe(false);
    expect(bridge.requestFocus).not.toHaveBeenCalled();

    setPlatformOS("android");
    await expect(requestAndroidViewFocus("   ", bridge)).resolves.toBe(false);
    await expect(requestAndroidViewFocus("root-settings-trigger-index", {
      requestFocus: jest.fn(async () => {
        throw new Error("native module unavailable");
      }),
    })).resolves.toBe(false);
    await expect(requestAndroidViewFocus("root-settings-trigger-index"))
      .resolves.toBe(false);
  });
});
