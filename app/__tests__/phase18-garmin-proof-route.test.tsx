import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { createProductionPhase18GarminProofHarness } from "../../src/bootstrap/phase18GarminProof";
import Phase18GarminProofRoute from "../__phase18-garmin-proof";

type ProofHarness = ReturnType<typeof createProductionPhase18GarminProofHarness>;

const CONFIRMATION = "VERIFY-PHASE18-GARMIN-REAL-ACCOUNT";
let mockParams: Readonly<{ confirmation?: string; operation?: string }> = {
  confirmation: CONFIRMATION,
  operation: "login",
};
const mockLogin = jest.fn<ProofHarness["login"]>();
const mockResumeMfa = jest.fn<ProofHarness["resumeMfa"]>();
const mockReadOneActivity = jest.fn<ProofHarness["readOneActivity"]>();
const mockRestoreAndRefresh = jest.fn<ProofHarness["restoreAndRefresh"]>();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        buildProfile: "development-test",
        nativeContractsEnabled: true,
        nativeContractSuite: "phase18-garmin-proof",
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

jest.mock("../../src/bootstrap/phase18GarminProof", () => ({
  createProductionPhase18GarminProofHarness: () => ({
    login: mockLogin,
    resumeMfa: mockResumeMfa,
    readOneActivity: mockReadOneActivity,
    restoreAndRefresh: mockRestoreAndRefresh,
  }),
}));

describe("Phase18GarminProofRoute secret lifetime", () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockParams = { confirmation: CONFIRMATION, operation: "login" };
    mockLogin.mockReset();
    mockResumeMfa.mockReset();
    mockReadOneActivity.mockReset();
    mockRestoreAndRefresh.mockReset();
    mockReadOneActivity.mockResolvedValue({
      id: "PH18-READ",
      status: "passed",
      duration_ms: 1,
      count: 1,
      result_sha256: "a".repeat(64),
    });
  });

  it("keeps password, MFA code, and challenge handle out of rendered snapshots", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    mockLogin.mockResolvedValue({
      cases: [{ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }],
      next: { kind: "mfa", challengeHandle: "private-challenge-handle" },
    });
    mockResumeMfa.mockResolvedValue({
      cases: [{
        id: "PH18-MFA",
        status: "passed",
        duration_ms: 1,
        outcome: "completed",
      }],
      next: "read",
    });

    await render(<Phase18GarminProofRoute />);
    await fireEvent.changeText(screen.getByLabelText("Garmin email"), "owner@example.invalid");
    await fireEvent.changeText(screen.getByLabelText("Garmin password"), "private-password");

    expect(screen.getByLabelText("Garmin password").props.value).toBeUndefined();
    expect(JSON.stringify(screen.toJSON())).not.toContain("private-password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in to Garmin proof" }));
    expect(await screen.findByText("mfa")).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText("Garmin MFA code"), "123456");
    expect(screen.getByLabelText("Garmin MFA code").props.value).toBeUndefined();
    expect(JSON.stringify(screen.toJSON())).not.toContain("123456");
    await fireEvent.press(screen.getByRole("button", { name: "Continue Garmin proof" }));
    expect(await screen.findByText("complete")).toBeOnTheScreen();

    const rendered = JSON.stringify(screen.toJSON());
    const emitted = JSON.stringify(log.mock.calls);
    expect(rendered).not.toMatch(/private-password|123456|private-challenge-handle/u);
    expect(emitted).not.toMatch(/private-password|123456|private-challenge-handle/u);
    log.mockRestore();
  });

  it("clears and invalidates pending credentials on cancel and unmount", async () => {
    let resolveLogin!: (value: Awaited<ReturnType<ProofHarness["login"]>>) => void;
    mockLogin.mockImplementation(() => new Promise((resolve) => {
      resolveLogin = resolve;
    }));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const rendered = await render(<Phase18GarminProofRoute />);

    await fireEvent.changeText(screen.getByLabelText("Garmin email"), "owner@example.invalid");
    await fireEvent.changeText(screen.getByLabelText("Garmin password"), "cancelled-password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in to Garmin proof" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel Garmin proof" }));
    expect(await screen.findByText("cancelled")).toBeOnTheScreen();
    expect(JSON.stringify(screen.toJSON())).not.toContain("cancelled-password");

    rendered.unmount();
    resolveLogin({
      cases: [{ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }],
      next: { kind: "mfa", challengeHandle: "late-private-challenge" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("fails closed without retaining a rejected password", async () => {
    mockLogin.mockRejectedValue(new Error("private-password-from-provider"));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await render(<Phase18GarminProofRoute />);
    await fireEvent.changeText(screen.getByLabelText("Garmin email"), "owner@example.invalid");
    await fireEvent.changeText(screen.getByLabelText("Garmin password"), "rejected-password");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in to Garmin proof" }));

    expect(await screen.findByText("technical_review_required")).toBeOnTheScreen();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(
      /rejected-password|private-password-from-provider/u,
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /rejected-password|private-password-from-provider/u,
    );
    log.mockRestore();
  });
});
