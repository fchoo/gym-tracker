import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import Constants from "expo-constants";
import * as bridge from "../../src/testing/v12NativeRollbackBridge";
import Route from "../__v12-recovery-archive";

let mockNonce: unknown = "a".repeat(32);
jest.mock("expo-router", () => ({ Redirect: () => null, useLocalSearchParams: () => ({ nonce: mockNonce }) }));
jest.mock("../../src/testing/v12NativeRollbackBridge", () => ({
  rollbackNativeEnabled: (identity: { packageName: string }) => identity.packageName === "com.fchoo.gymtracker.devtest",
  collectNativeRollbackBridge: jest.fn<() => Promise<void>>(),
}));
const execute = jest.mocked(bridge.collectNativeRollbackBridge);
beforeEach(() => {
  mockNonce = "a".repeat(32); execute.mockReset(); execute.mockResolvedValue(undefined);
  Object.assign(Constants, { expoConfig: { android: { package: "com.fchoo.gymtracker.devtest" }, extra: {
    buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance",
  } } });
});
describe("private rollback route", () => {
  it("awaits real bridge and renders only a fixed outcome", async () => {
    const view = await render(<Route />);
    await waitFor(() => expect(view.getByText("Recovery archive verified")).toBeTruthy());
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ suite: "v1.2-acceptance" }), mockNonce);
  });
  it("never logs private failure details", async () => {
    execute.mockRejectedValue(new Error("private rows"));
    const view = await render(<Route />);
    await waitFor(() => expect(view.getByText("Recovery archive failed")).toBeTruthy());
    expect(view.queryByText("private rows")).toBeNull();
  });
  it("denies production and non-scalar nonce", async () => {
    mockNonce = ["a".repeat(32)]; await render(<Route />); expect(execute).not.toHaveBeenCalled();
    mockNonce = "wrong"; await render(<Route />); expect(execute).not.toHaveBeenCalled();
    mockNonce = "a".repeat(32);
    Object.assign(Constants, { expoConfig: { android: { package: "com.fchoo.gymtracker" } } });
    await render(<Route />); expect(execute).not.toHaveBeenCalled();
  });
  it("does not publish a failure view after unmount", async () => {
    let reject!: (error: unknown) => void;
    execute.mockImplementation(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
    const view = await render(<Route />); await view.unmount(); reject(new Error("private")); await Promise.resolve();
  });
  it("does not publish a view update after unmount", async () => {
    let finish!: () => void;
    execute.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = await render(<Route />); await view.unmount(); finish(); await Promise.resolve();
  });
});
