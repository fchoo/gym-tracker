import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react-native";
import { createExpoV12AcceptanceSqliteContractAdapter, runV12AcceptanceSqliteContracts, type V12AcceptanceSqliteContractResult } from "../../src/testing/contracts/v12Acceptance.contract";

let mockParams: { runId?: string; suite?: string } = {};
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams, Redirect: () => null }));
jest.mock("expo-notifications", () => ({ AndroidImportance: { DEFAULT: 3 }, setNotificationHandler: jest.fn() }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {
  nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance", buildProfile: "development-test",
} } } }));
jest.mock("../../src/testing/contracts/v12Acceptance.contract", () => {
  const actual = jest.requireActual<typeof import("../../src/testing/contracts/v12Acceptance.contract")>("../../src/testing/contracts/v12Acceptance.contract");
  return { ...actual, createExpoV12AcceptanceSqliteContractAdapter: jest.fn(), runV12AcceptanceSqliteContracts: jest.fn() };
});

const originalSuite = process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;
process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE = "v1.2-acceptance";
const NativeSqliteContractsScreen = (require("../__native-contracts") as typeof import("../__native-contracts")).default;
afterAll(() => {
  if (originalSuite === undefined) delete process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE;
  else process.env.EXPO_PUBLIC_NATIVE_CONTRACT_SUITE = originalSuite;
});

const fixture: V12AcceptanceSqliteContractResult = {
  schemaVersion: 1, contractVersion: 1, status: "passed", total: 1, passed: 1, failed: 0, skipped: 0,
  cases: [{ id: "fresh-migration", status: "passed", code: "v12_acceptance_case_passed",
    counts: { sourceCases: 1 }, sourceFacts: [{ registry: "sqlite-kernel", cases: [{ id: "connection-configuration", status: "passed" }] }] }],
};
const marker = "GYM_TRACKER_SQLITE_CONTRACT_RESULT:";
function machineResult() {
  const text = screen.getByText(/^GYM_TRACKER_SQLITE_CONTRACT_RESULT:/).props.children as string;
  return JSON.parse(decodeURIComponent(text.slice(marker.length))) as { runId: string; result: V12AcceptanceSqliteContractResult };
}

describe("native contract rendered execution identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.mocked(createExpoV12AcceptanceSqliteContractAdapter).mockResolvedValue({} as never);
  });
  afterEach(async () => { await cleanup(); jest.restoreAllMocks(); });

  it("keeps a completed result bound to its actual nonce after route parameters change", async () => {
    const original = `v12-${"b".repeat(32)}`;
    mockParams = { runId: original, suite: "v1.2-acceptance" };
    jest.mocked(runV12AcceptanceSqliteContracts).mockResolvedValue(fixture);
    const view = await render(<NativeSqliteContractsScreen />);
    await waitFor(() => expect(machineResult().runId).toBe(original));
    mockParams = { runId: `v12-${"c".repeat(32)}`, suite: "v1.2-acceptance" };
    await view.rerender(<NativeSqliteContractsScreen />);
    expect(machineResult()).toEqual({ runId: original, result: fixture });
    expect(runV12AcceptanceSqliteContracts).toHaveBeenCalledTimes(1);
  });

  it("retains the dispatch identity when parameters change while work is pending", async () => {
    const original = `v12-${"d".repeat(32)}`;
    let finish!: (result: V12AcceptanceSqliteContractResult) => void;
    const pending = new Promise<V12AcceptanceSqliteContractResult>(resolve => { finish = resolve; });
    mockParams = { runId: original, suite: "v1.2-acceptance" };
    jest.mocked(runV12AcceptanceSqliteContracts).mockReturnValue(pending);
    const view = await render(<NativeSqliteContractsScreen />);
    await waitFor(() => expect(runV12AcceptanceSqliteContracts).toHaveBeenCalledTimes(1));
    mockParams = { runId: `v12-${"e".repeat(32)}`, suite: "v1.2-acceptance" };
    await view.rerender(<NativeSqliteContractsScreen />);
    await act(async () => { finish(fixture); await pending; });
    await waitFor(() => expect(machineResult()).toEqual({ runId: original, result: fixture }));
    expect(runV12AcceptanceSqliteContracts).toHaveBeenCalledTimes(1);
  });

  it("keeps an omitted-ID fallback stable through completion-driven rerenders", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1_700);
    let finish!: (result: V12AcceptanceSqliteContractResult) => void;
    const pending = new Promise<V12AcceptanceSqliteContractResult>(resolve => { finish = resolve; });
    mockParams = { suite: "v1.2-acceptance" };
    jest.mocked(runV12AcceptanceSqliteContracts).mockReturnValue(pending);
    const view = await render(<NativeSqliteContractsScreen />);
    await waitFor(() => expect(runV12AcceptanceSqliteContracts).toHaveBeenCalledTimes(1));
    clock.mockReturnValue(8_000);
    await act(async () => { finish(fixture); await pending; });
    await waitFor(() => expect(machineResult()).toEqual({ runId: "native-1700", result: fixture }));
    clock.mockReturnValue(9_000);
    await view.rerender(<NativeSqliteContractsScreen />);
    expect(machineResult().runId).toBe("native-1700");
    expect(runV12AcceptanceSqliteContracts).toHaveBeenCalledTimes(1);
  });
});
