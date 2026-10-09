import { Platform } from "react-native";

import type { AndroidViewFocusNativeModule } from "../../../modules/android-view-focus/src";

function requireAndroidViewFocusModule(): AndroidViewFocusNativeModule {
  const { requireNativeModule } = require("expo-modules-core") as typeof import("expo-modules-core");
  return requireNativeModule<AndroidViewFocusNativeModule>("AndroidViewFocus");
}

/** Requests keyboard focus from Android's native view hierarchy, or fails closed. */
export async function requestAndroidViewFocus(
  nativeID: string,
  bridge?: AndroidViewFocusNativeModule,
): Promise<boolean> {
  if (Platform.OS !== "android" || nativeID.trim().length === 0) {
    return false;
  }
  try {
    const native = bridge ?? requireAndroidViewFocusModule();
    return await native.requestFocus(nativeID) === true;
  } catch {
    return false;
  }
}
