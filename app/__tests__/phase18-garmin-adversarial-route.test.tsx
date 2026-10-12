import { cleanup, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import Phase18GarminAdversarialRoute from "../__phase18-garmin-adversarial";

const CONFIRMATION = "VERIFY-PHASE18-GARMIN-ADVERSARIAL";
const NONCE = "0123456789abcdef0123456789abcdef";
const DEVICE_IDENTITY_SHA256 = "f".repeat(64);
type CollectAdversarialReport = typeof import("../../src/testing/phase18GarminAdversarial")["runPhase18GarminAdversarialNativeSuite"];
let mockParams: Readonly<{
  confirmation?: unknown;
  nonce?: unknown;
  device_identity_sha256?: unknown;
}> = {
  confirmation: CONFIRMATION,
  nonce: NONCE,
  device_identity_sha256: DEVICE_IDENTITY_SHA256,
};
const mockCollect = jest.fn<CollectAdversarialReport>();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        buildProfile: "development-test",
        nativeContractsEnabled: true,
        nativeContractSuite: "phase18-garmin-adversarial",
        phase18GarminAdversarialBuildIdentity: {
          currentHead: "a".repeat(40),
          currentSourceTreeSha256: "b".repeat(64),
          currentPythonLockSha256: "c".repeat(64),
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
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/testing/phase18GarminAdversarial", () => {
  const actual = jest.requireActual<typeof import("../../src/testing/phase18GarminAdversarial")>(
    "../../src/testing/phase18GarminAdversarial",
  );
  return {
    ...actual,
    runPhase18GarminAdversarialNativeSuite: (...args: Parameters<CollectAdversarialReport>) => mockCollect(...args),
  };
});

describe("Phase18GarminAdversarialRoute", () => {
  beforeEach(() => {
    mockParams = {
      confirmation: CONFIRMATION,
      nonce: NONCE,
      device_identity_sha256: DEVICE_IDENTITY_SHA256,
    };
    mockCollect.mockReset();
    mockCollect.mockResolvedValue({
      status: "passed",
      run_nonce: NONCE,
      cases: [{
        id: "PH18-ADV-RESTORE",
        status: "passed",
        provenance: "native-exact-artifact",
        stage: "restore",
        code: "completed",
        duration_ms: 1,
        call_count: 1,
        automatic_retry_count: 0,
        retry_after_ms: 0,
        source_write_count: 0,
        connection_state: "connected",
        sync_state: "idle",
        session_digest: "1".repeat(64),
        history_digest: "2".repeat(64),
        source_digest: "3".repeat(64),
        match_digest: "4".repeat(64),
        generation_before: 1,
        generation_after: 1,
      }],
      current_identity: {
        currentHead: "a".repeat(40),
        currentSourceTreeSha256: "b".repeat(64),
        currentPythonLockSha256: "c".repeat(64),
        retainedApkSha256: "d".repeat(64),
        retainedSignatureSha256: "e".repeat(64),
        deviceIdentitySha256: "f".repeat(64),
      },
    });
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it("passes the exact URI nonce to the producer and logs it only in the report envelope", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    render(<Phase18GarminAdversarialRoute />);

    await waitFor(() => expect(screen.getByText("passed")).toBeOnTheScreen());
    expect(mockCollect).toHaveBeenCalledWith(
      undefined,
      expect.any(Object),
      NONCE,
      DEVICE_IDENTITY_SHA256,
    );
    const emitted = log.mock.calls.map(([line]) => String(line));
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).not.toContain(NONCE);
    const reportLine = emitted[1];
    expect(reportLine).toBeDefined();
    expect(reportLine?.match(new RegExp(NONCE, "gu"))).toHaveLength(1);
    expect(JSON.parse(reportLine!.split("REPORT:")[1]!)).toEqual(
      expect.objectContaining({ run_nonce: NONCE }),
    );
  });

  it.each([
    undefined,
    "short",
    "A".repeat(32),
    [NONCE],
  ])("redirects without invoking native code for invalid nonce %p", async (nonce) => {
    mockParams = { confirmation: CONFIRMATION, nonce, device_identity_sha256: DEVICE_IDENTITY_SHA256 };
    const rendered = await render(<Phase18GarminAdversarialRoute />);

    expect(rendered.getByTestId("redirect-_")) .toBeOnTheScreen();
    expect(mockCollect).not.toHaveBeenCalled();
  });

  it.each([undefined, "short", "F".repeat(64), [DEVICE_IDENTITY_SHA256]])(
    "redirects without invoking native code for invalid device identity %p",
    async (deviceIdentitySha256) => {
      mockParams = {
        confirmation: CONFIRMATION,
        nonce: NONCE,
        device_identity_sha256: deviceIdentitySha256,
      };
      const rendered = await render(<Phase18GarminAdversarialRoute />);

      expect(rendered.getByTestId("redirect-_")) .toBeOnTheScreen();
      expect(mockCollect).not.toHaveBeenCalled();
    },
  );
});
