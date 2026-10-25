import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockNavigationKeyEpoch = jest.fn<() => number>(() => 0);
jest.mock("expo-modules-core", () => ({
  requireNativeModule: () => ({ getNavigationKeyEpoch: mockNavigationKeyEpoch }),
}));

import {
  markKeyboardFocusModality,
  markPointerFocusModality,
  shouldShowFocusRing,
} from "./focusVisibility.android";

describe("Android native navigation focus visibility", () => {
  beforeEach(() => {
    mockNavigationKeyEpoch.mockReset().mockReturnValue(7);
    markKeyboardFocusModality();
  });

  it.each(["Activity Tab", "modal D-pad"])(
    "recovers visible focus from %s without a JavaScript key callback",
    () => {
      markPointerFocusModality();
      expect(shouldShowFocusRing()).toBe(false);
      // Native dispatch advances before it moves focus; no JS key handler runs.
      mockNavigationKeyEpoch.mockReturnValue(8);
      expect(shouldShowFocusRing()).toBe(true);
    },
  );

  it("keeps programmatic touch restoration clear despite earlier native navigation", () => {
    mockNavigationKeyEpoch.mockReturnValue(31);
    markPointerFocusModality();
    expect(shouldShowFocusRing()).toBe(false);
    // requestFocus/hasTVPreferredFocus do not dispatch a navigation key.
    expect(shouldShowFocusRing()).toBe(false);
    mockNavigationKeyEpoch.mockReturnValue(32);
    expect(shouldShowFocusRing()).toBe(true);
    markPointerFocusModality();
    expect(shouldShowFocusRing()).toBe(false);
    expect(shouldShowFocusRing()).toBe(false);
  });
});
