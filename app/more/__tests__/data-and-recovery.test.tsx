import { render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../../../src/ui/theme";

const mockBack = jest.fn();
const mockConnect = jest.fn<() => Promise<void>>();
const mockCreateCsvExport = jest.fn<() => Promise<{ exportId: string }>>();
const mockShareCsvExport = jest.fn<(value: { exportId: string }) => Promise<void>>();
const mockDiscardCsvExport = jest.fn<(value: { exportId: string }) => Promise<void>>();

jest.mock("expo-router", () => ({ router: { back: mockBack, push: jest.fn() } }));
jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    automaticBackup: { status: "not_connected", reason: null, warning: null, lastSuccessfulBackupAtMs: null, primaryAction: "connect" },
    connectAutomaticBackup: mockConnect,
    createCsvExport: mockCreateCsvExport,
    shareCsvExport: mockShareCsvExport,
    discardCsvExport: mockDiscardCsvExport,
  }),
}));

import DataAndRecoveryRoute from "../data-and-recovery";

describe("DataAndRecoveryRoute", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(undefined);
    mockCreateCsvExport.mockReset();
    mockCreateCsvExport.mockResolvedValue({ exportId: "csv-1" });
    mockShareCsvExport.mockReset();
    mockShareCsvExport.mockResolvedValue(undefined);
    mockDiscardCsvExport.mockReset();
    mockDiscardCsvExport.mockResolvedValue(undefined);
  });

  it("keeps automatic proof, manual recovery navigation, and direct CSV action separate", async () => {
    await render(<AppearanceProvider><DataAndRecoveryRoute /></AppearanceProvider>);
    expect(screen.getByRole("header", { name: "Data and recovery" })).toBeOnTheScreen();
    expect(screen.getByText("Not connected")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Connect Google Drive" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Manual encrypted backup" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Export CSV" }).props.accessibilityHint).toBe("Creates a readable spreadsheet file that is not password-protected");
    expect(screen.queryByText("Create secure backup")).not.toBeOnTheScreen();
  });
});
