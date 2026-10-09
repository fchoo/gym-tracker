import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../../src/ui/theme";
import Phase14ToastProofRoute from "../__phase14-toast-proof";

let mockNativeContractsEnabled = true;
let mockBuildProfile = "development-test";
let mockNativeContractSuite = "phase14";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        get buildProfile() {
          return mockBuildProfile;
        },
        get nativeContractsEnabled() {
          return mockNativeContractsEnabled;
        },
        get nativeContractSuite() {
          return mockNativeContractSuite;
        },
      },
    },
  },
}));

jest.mock("expo-router", () => ({
  Redirect: ({ href }: Readonly<{ href: string }>) => {
    const { View } = require("react-native") as typeof import("react-native");
    return <View testID={`redirect-${href.replace(/\//gu, "_")}`} />;
  },
}));

describe("Phase14ToastProofRoute", () => {
  beforeEach(() => {
    mockNativeContractsEnabled = true;
    mockBuildProfile = "development-test";
    mockNativeContractSuite = "phase14";
  });

  it("shows a real toast host, reports when the toast mounts, and keeps the background control interactive during the dwell", async () => {
    await render(
      <AppearanceProvider>
        <Phase14ToastProofRoute />
      </AppearanceProvider>,
    );

    expect(await screen.findByText("Toast proof active")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Phase 14 toast proof" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Waiting for toast host")).toBeOnTheScreen();
    expect(screen.getByText("Background control idle")).toBeOnTheScreen();

    await act(async () => {
      screen.getByTestId("semantic-toast").props.onLayout({
        nativeEvent: { layout: { height: 52, width: 240, x: 0, y: 72 } },
      });
    });

    expect(screen.getByText("Toast host mounted")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Tap background control" }));

    expect(screen.getByText("Background control activated")).toBeOnTheScreen();
    expect(screen.getByText("Toast proof active")).toBeOnTheScreen();
  });

  it("redirects when the packaged Phase 14 native contract is disabled", async () => {
    mockNativeContractsEnabled = false;

    await render(
      <AppearanceProvider>
        <Phase14ToastProofRoute />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("redirect-_")).toBeOnTheScreen();
  });
});
