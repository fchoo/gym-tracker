import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import Phase14SourceStateProofRoute from "../__phase14-source-state-proof";

let mockBuildProfile = "development-test";
let mockNativeContractsEnabled = true;
let mockNativeContractSuite = "phase14";
let mockLaunchState = "trusted";
const mockCollectPhase14SourceStateProof = jest.fn(async () => ({
  digest_sha256: "a".repeat(64),
  table_count: 48,
  row_count: 321,
  schema_version: 30,
}));

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

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    collectPhase14SourceStateProof: mockCollectPhase14SourceStateProof,
    launchState: mockLaunchState,
  }),
}));

describe("Phase14SourceStateProofRoute", () => {
  beforeEach(() => {
    mockBuildProfile = "development-test";
    mockNativeContractsEnabled = true;
    mockNativeContractSuite = "phase14";
    mockLaunchState = "trusted";
    mockCollectPhase14SourceStateProof.mockReset();
    mockCollectPhase14SourceStateProof.mockResolvedValue({
      digest_sha256: "a".repeat(64),
      table_count: 48,
      row_count: 321,
      schema_version: 30,
    });
  });

  it("waits for the runtime to become trusted before collecting", async () => {
    mockLaunchState = "booting";
    const rendered = await render(<Phase14SourceStateProofRoute />);

    expect(screen.getByText("PHASE14_SOURCE_STATE_PROOF_PENDING")).toBeOnTheScreen();
    expect(mockCollectPhase14SourceStateProof).not.toHaveBeenCalled();

    mockLaunchState = "trusted";
    await act(async () => {
      rendered.rerender(<Phase14SourceStateProofRoute />);
    });

    expect(await screen.findByText(
      `PHASE14_SOURCE_STATE_PROOF digest_sha256=${"a".repeat(64)} table_count=48 row_count=321 schema_version=30`,
    )).toBeOnTheScreen();
    expect(mockCollectPhase14SourceStateProof).toHaveBeenCalledTimes(1);
  });

  it("renders only the bounded aggregate semantic proof for the exact development-test suite", async () => {
    await render(<Phase14SourceStateProofRoute />);

    expect(await screen.findByText(
      `PHASE14_SOURCE_STATE_PROOF digest_sha256=${"a".repeat(64)} table_count=48 row_count=321 schema_version=30`,
    )).toBeOnTheScreen();
    expect(mockCollectPhase14SourceStateProof).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/rows|tables|sql|path|private/iu);
  });

  it.each([
    ["production", true, "phase14"],
    ["development-test", false, "phase14"],
    ["development-test", true, "phase13"],
  ])("redirects unless all three native proof gates match", async (
    buildProfile,
    nativeContractsEnabled,
    nativeContractSuite,
  ) => {
    mockBuildProfile = buildProfile;
    mockNativeContractsEnabled = nativeContractsEnabled;
    mockNativeContractSuite = nativeContractSuite;

    await render(<Phase14SourceStateProofRoute />);

    expect(screen.getByTestId("redirect-_")).toBeOnTheScreen();
    expect(mockCollectPhase14SourceStateProof).not.toHaveBeenCalled();
  });

  it("reports a fixed error marker without exposing runtime failure details", async () => {
    mockCollectPhase14SourceStateProof.mockRejectedValueOnce(
      new Error("private row /data/user/0/com.fchoo.gymtracker.devtest/databases/app.db"),
    );

    await render(<Phase14SourceStateProofRoute />);

    expect(await screen.findByText("PHASE14_SOURCE_STATE_PROOF_ERROR"))
      .toBeOnTheScreen();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/private row|\/data\/user/iu);
  });
});
