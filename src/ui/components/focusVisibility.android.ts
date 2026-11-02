import type { AndroidNavigationKeyNativeModule } from "../../../modules/android-view-focus/src";

let lastPointerNavigationEpoch: number | null = null;

function navigationKeyEpoch(): number {
  try {
    const { requireNativeModule } = require("expo-modules-core") as typeof import("expo-modules-core");
    const epoch = requireNativeModule<AndroidNavigationKeyNativeModule>("AndroidViewFocus")
      .getNavigationKeyEpoch();
    return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
  } catch {
    // An older native binary cannot provide navigation input. Keep touch focus clear.
    return 0;
  }
}

export function markPointerFocusModality(): void {
  lastPointerNavigationEpoch = navigationKeyEpoch();
}

export function markKeyboardFocusModality(): void {
  lastPointerNavigationEpoch = null;
}

export function shouldShowFocusRing(): boolean {
  // Native focus can arrive from Tab/D-pad before any JavaScript key event.
  // requestFocus and preferred-focus restoration never advance this epoch.
  return lastPointerNavigationEpoch === null
    || navigationKeyEpoch() > lastPointerNavigationEpoch;
}
