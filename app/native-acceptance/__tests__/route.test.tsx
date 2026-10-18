import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

let mockBuildProfile = "development-test";
let mockNativeContractsEnabled = true;
let mockNativeContractSuite = "v1.2-acceptance";
let mockPackageName = "com.fchoo.gymtracker.devtest";
let mockParams: Record<string, string> = {};

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: {
        get package() { return mockPackageName; },
      },
      extra: {
        get buildProfile() { return mockBuildProfile; },
        get nativeContractsEnabled() { return mockNativeContractsEnabled; },
        get nativeContractSuite() { return mockNativeContractSuite; },
      },
    },
  },
}));

jest.mock("expo-router", () => {
  return {
    useLocalSearchParams: () => mockParams,
  };
});

import NativeAcceptanceRoute from "../[shard]";

describe("v1.2 native acceptance route", () => {
  beforeEach(() => {
    mockBuildProfile = "development-test";
    mockNativeContractsEnabled = true;
    mockNativeContractSuite = "v1.2-acceptance";
    mockPackageName = "com.fchoo.gymtracker.devtest";
    mockParams = {
      shard: "multi-plan",
      case: "phase13-migration-failure-cuts",
      fixture: "v12-synthetic-fixtures-r18",
      nonce: "a".repeat(48),
    };
  });

  const validRequests: [string, string, string][] = [
    ["multi-plan", "phase13-tim01-retirement", "Multi-plan and running"],
    ["workout", "workout.completion-writeback", "Workout"],
    ["library-running", "library.metric-profile-migration", "Library and running"],
  ];

  it.each(validRequests)("renders the source-owned %s fixture and native marker", async (shard, caseId, title) => {
    mockParams = { shard, case: caseId, fixture: "v12-synthetic-fixtures-r18", nonce: "a".repeat(48) };

    const view = await render(<NativeAcceptanceRoute />);

    expect(view.getByRole("header", { name: "Native acceptance fixture" }))
      .toBeOnTheScreen();
    expect(view.getByTestId("native-acceptance-stage")).toBeOnTheScreen();
    expect(view.getByText(caseId)).toBeOnTheScreen();
    expect(view.getByText(title)).toBeOnTheScreen();
    expect(view.queryByTestId("native-acceptance-readback")).not.toBeOnTheScreen();
    await act(async () => { fireEvent.press(view.getByTestId("native-acceptance-execute")); });
    expect(view.getByTestId("native-acceptance-readback")).toHaveTextContent("Case verified");
    expect(view.getByTestId("native-acceptance-readback")).toHaveProp(
      "accessibilityLabel", `Case verified ${caseId} ${"a".repeat(48)}`,
    );
    expect(view.queryByTestId("native-acceptance-disabled")).not.toBeOnTheScreen();
  });

  const invalidRequests: readonly (readonly [string, Readonly<Partial<{
    enabled: boolean;
    buildProfile: string;
    packageName: string;
    suite: string;
    shard: string;
    caseId: string;
    fixture: string;
    nonce: string;
  }>>])[] = [
    ["disabled", { enabled: false }],
    ["production build", { buildProfile: "production" }],
    ["wrong package", { packageName: "com.fchoo.gymtracker" }],
    ["wrong suite", { suite: "phase17" }],
    ["unknown shard", { shard: "unknown" }],
    ["unknown case", { caseId: "workout.not-real" }],
    ["wrong fixture", { fixture: "production" }],
    ["missing nonce", { nonce: "" }],
  ];

  it.each(invalidRequests)("fails closed for %s", async (_label, overrides) => {
    mockNativeContractsEnabled = overrides.enabled ?? true;
    mockBuildProfile = overrides.buildProfile ?? "development-test";
    mockNativeContractSuite = overrides.suite ?? "v1.2-acceptance";
    mockParams = {
      shard: overrides.shard ?? "workout",
      case: overrides.caseId ?? "workout.root-identity",
      fixture: overrides.fixture ?? "v12-synthetic-fixtures-r18",
      nonce: overrides.nonce ?? "a".repeat(48),
    };
    mockPackageName = overrides.packageName ?? "com.fchoo.gymtracker.devtest";

    const view = await render(<NativeAcceptanceRoute />);

    expect(view.getByTestId("native-acceptance-disabled")).toBeOnTheScreen();
    expect(view.getByRole("header", { name: "Native acceptance unavailable" }))
      .toBeOnTheScreen();
    expect(view.queryByTestId("native-acceptance-stage")).not.toBeOnTheScreen();
  });
});
