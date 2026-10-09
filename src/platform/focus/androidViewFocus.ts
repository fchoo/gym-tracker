import Constants from "expo-constants";
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
  const diagnosticEnabled = Constants.expoConfig?.extra?.buildProfile === "development-test"
    && Constants.expoConfig.extra.nativeContractSuite === "phase14";
  try {
    const native = bridge ?? requireAndroidViewFocusModule();
    const focused = await native.requestFocus(nativeID) === true;
    if (diagnosticEnabled) {
      console.info(`[phase14-focus] completed=${focused}`);
    }
    return focused;
  } catch {
    if (diagnosticEnabled) {
      console.info("[phase14-focus] module-error");
    }
    return false;
  }
}
