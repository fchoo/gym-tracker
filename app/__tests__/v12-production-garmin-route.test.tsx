import { render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

let mockBuildProfile = "development-test";
let mockNativeContractsEnabled = true;
let mockNativeContractSuite = "v1.2-acceptance";
let mockParams: Readonly<Record<string, string>>;
const mockCollectV12ProductionGarminDomain = jest.fn<
  (...args: readonly unknown[]) => Promise<Readonly<{ status: "PASS" }>>
>(async () => ({ status: "PASS" }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: "com.fchoo.gymtracker.devtest" },
      extra: {
        get buildProfile() { return mockBuildProfile; },
        get nativeContractsEnabled() { return mockNativeContractsEnabled; },
        get nativeContractSuite() { return mockNativeContractSuite; },
      },
    },
  },
}));

jest.mock("expo-router", () => ({
  Redirect: () => {
    const { View } = require("react-native") as typeof import("react-native");
    return <View testID="garmin-evidence-disabled" />;
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/bootstrap/v12ProductionGarminDomain", () => {
  const actual = jest.requireActual("../../src/bootstrap/v12ProductionGarminDomain") as object;
  return {
    ...actual,
    collectV12ProductionGarminDomain: (...args: readonly unknown[]) =>
      mockCollectV12ProductionGarminDomain(...args),
  };
});

import V12ProductionGarminRoute from "../__v12-production-garmin";

describe("v1.2 production Garmin evidence route", () => {
  beforeEach(() => {
    mockBuildProfile = "development-test";
    mockNativeContractsEnabled = true;
    mockNativeContractSuite = "v1.2-acceptance";
    mockParams = {
      confirmation: "VERIFY-V12-DOMAIN",
      mode: "execute",
      nonce: "a".repeat(32),
    };
    mockCollectV12ProductionGarminDomain.mockClear();
  });

  it("renders and starts the loaded Garmin evidence branch", async () => {
    await render(<V12ProductionGarminRoute />);

    expect(screen.getByRole("header", { name: "Garmin native observation" }))
      .toBeOnTheScreen();
    await waitFor(() => expect(mockCollectV12ProductionGarminDomain)
      .toHaveBeenCalledTimes(1));
  });

  it("renders the disabled branch without starting Garmin collection", async () => {
    mockBuildProfile = "production";

    await render(<V12ProductionGarminRoute />);

    expect(screen.getByTestId("garmin-evidence-disabled")).toBeOnTheScreen();
    expect(mockCollectV12ProductionGarminDomain).not.toHaveBeenCalled();
  });
});
