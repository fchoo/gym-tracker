import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { createProductionPhase18GarminProofHarness } from "../../src/bootstrap/phase18GarminProof";
import Phase18GarminProofRoute from "../__phase18-garmin-proof";

type ProofHarness = ReturnType<typeof createProductionPhase18GarminProofHarness>;
type CapturedRef = { current: unknown };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function captureProofRefs(): CapturedRef[] {
  const refs: CapturedRef[] = [];
  const useRef = React.useRef;
  jest.spyOn(React, "useRef").mockImplementation(((initialValue: unknown) => {
    const ref = useRef(initialValue) as CapturedRef;
    if (!refs.includes(ref)) refs.push(ref);
    return ref;
  }) as typeof React.useRef);
  return refs;
}

function requiredProofRefs(refs: readonly CapturedRef[]) {
  const passwordInput = refs[0];
  const mfaInput = refs[1];
  const password = refs[2];
  const mfaCode = refs[3];
  const challenge = refs[4];
  if (passwordInput === undefined || mfaInput === undefined
    || password === undefined || mfaCode === undefined
    || challenge === undefined) {
    throw new Error("phase18_proof_secret_refs_missing");
  }
  return { challenge, mfaCode, mfaInput, password, passwordInput };
}

function spyOnNativeClear(ref: CapturedRef) {
  const input = ref.current as { clear?: () => void } | null;
  if (input === null || typeof input.clear !== "function") {
    throw new Error("phase18_proof_native_input_ref_missing");
  }
  return jest.spyOn(input as { clear(): void }, "clear");
}

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
        nativeContractSuite: "v1.2-acceptance",
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

    await rendered.unmount();
    resolveLogin({
      cases: [{ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }],
      next: { kind: "mfa", challengeHandle: "late-private-challenge" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("ends the login secret scope before a held activity read and cancels late read output", async () => {
    const refs = captureProofRefs();
    const read = deferred<Awaited<ReturnType<ProofHarness["readOneActivity"]>>>();
    mockLogin.mockResolvedValue({
      cases: [{ id: "PH18-LOGIN", status: "passed", duration_ms: 1 }],
      next: "read",
    });
    mockReadOneActivity.mockImplementation(() => read.promise);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await render(<Phase18GarminProofRoute />);
    const proofRefs = requiredProofRefs(refs);
    const passwordNativeClear = spyOnNativeClear(proofRefs.passwordInput);
    await fireEvent.changeText(screen.getByLabelText("Garmin email"), "owner@example.invalid");
    await fireEvent.changeText(screen.getByLabelText("Garmin password"), "held-login-password");
    passwordNativeClear.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in to Garmin proof" }));

    await waitFor(() => expect(mockReadOneActivity).toHaveBeenCalledTimes(1));
    expect(passwordNativeClear).toHaveBeenCalledTimes(1);
    expect(proofRefs.password.current).toBe("");
    expect(proofRefs.mfaCode.current).toBe("");
    expect(proofRefs.challenge.current).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Cancel Garmin proof" }));
    expect(await screen.findByText("cancelled")).toBeOnTheScreen();
    await act(async () => {
      read.resolve({
        id: "PH18-READ",
        status: "passed",
        duration_ms: 1,
        count: 1,
        result_sha256: "b".repeat(64),
      });
      await read.promise;
    });

    expect(screen.getByText("cancelled")).toBeOnTheScreen();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("PH18-READ");
    log.mockRestore();
  });

  it("ends the MFA secret scope before a held activity read and suppresses output after unmount", async () => {
    const refs = captureProofRefs();
    const read = deferred<Awaited<ReturnType<ProofHarness["readOneActivity"]>>>();
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
    mockReadOneActivity.mockImplementation(() => read.promise);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    const rendered = await render(<Phase18GarminProofRoute />);
    const proofRefs = requiredProofRefs(refs);
    const passwordNativeClear = spyOnNativeClear(proofRefs.passwordInput);
    await fireEvent.changeText(screen.getByLabelText("Garmin email"), "owner@example.invalid");
    await fireEvent.changeText(screen.getByLabelText("Garmin password"), "held-mfa-password");
    passwordNativeClear.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in to Garmin proof" }));
    expect(await screen.findByText("mfa")).toBeOnTheScreen();
    expect(passwordNativeClear).toHaveBeenCalledTimes(1);

    const mfaNativeClear = spyOnNativeClear(proofRefs.mfaInput);
    await fireEvent.changeText(screen.getByLabelText("Garmin MFA code"), "654321");
    mfaNativeClear.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Continue Garmin proof" }));

    await waitFor(() => expect(mockReadOneActivity).toHaveBeenCalledTimes(1));
    expect(mfaNativeClear).toHaveBeenCalledTimes(1);
    expect(proofRefs.password.current).toBe("");
    expect(proofRefs.mfaCode.current).toBe("");
    expect(proofRefs.challenge.current).toBeNull();
    expect(log).toHaveBeenCalledTimes(2);

    await rendered.unmount();
    await act(async () => {
      read.resolve({
        id: "PH18-READ",
        status: "passed",
        duration_ms: 1,
        count: 1,
        result_sha256: "c".repeat(64),
      });
      await read.promise;
    });

    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("PH18-READ");
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
