import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../../../src/ui/theme";

const mockBack = jest.fn();
const mockConnect = jest.fn<() => Promise<void>>();
const mockCreateCsvExport = jest.fn<() => Promise<{ exportId: string }>>();
const mockShareCsvExport = jest.fn<(value: { exportId: string }) => Promise<void>>();
const mockDiscardCsvExport = jest.fn<(value: { exportId: string }) => Promise<void>>();
const mockUseCellular = jest.fn<() => Promise<void>>();
const mockRuntime: any = {
  automaticBackup: { status: "not_connected", reason: null, warning: null, lastSuccessfulBackupAtMs: null, primaryAction: "connect", dataUsePolicy: "wifi_and_cellular", recoveryPrompt: null, progressStage: null },
  connectAutomaticBackup: mockConnect,
  requestAutomaticBackupNow: jest.fn(async () => undefined),
  useAutomaticBackupCellularThisTime: mockUseCellular,
  createCsvExport: mockCreateCsvExport,
  shareCsvExport: mockShareCsvExport,
  discardCsvExport: mockDiscardCsvExport,
};

jest.mock("expo-router", () => ({ router: { back: mockBack, push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => mockRuntime,
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
    mockUseCellular.mockReset();
    mockUseCellular.mockResolvedValue(undefined);
    mockRuntime.automaticBackup = { status: "not_connected", reason: null, warning: null, lastSuccessfulBackupAtMs: null, primaryAction: "connect", dataUsePolicy: "wifi_and_cellular", recoveryPrompt: null, progressStage: null };
  });

  it.each([
    ["Checking backup", { status: "restore_pending", progressStage: "Checking backup", reason: null }],
    ["Restoring on this phone", { status: "restoring", progressStage: "Restoring on this phone", reason: null }],
    ["Finishing backup setup", { status: "restoring", progressStage: "Finishing backup setup", reason: null }],
    ["Review merge", { status: "restore_pending", progressStage: null, reason: "merge_review" }],
    ["Backup needs attention", { status: "paused", progressStage: null, reason: "invalid_artifacts" }],
    ["Cloud backup deleted", { status: "paused", progressStage: null, reason: "deleted" }],
    ["Deleting cloud backup", { status: "paused", progressStage: null, reason: "deletion_partial" }],
  ])("renders the production facade state %s", async (label, state) => {
    mockRuntime.automaticBackup = { ...mockRuntime.automaticBackup, ...state, primaryAction: null };
    await render(<AppearanceProvider><DataAndRecoveryRoute /></AppearanceProvider>);
    expect(screen.getByText(label)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Manual encrypted backup" })).toBeOnTheScreen();
  });

  it("requires one-attempt confirmation for a wifi-only manual backup", async () => {
    mockRuntime.automaticBackup = { ...mockRuntime.automaticBackup, status: "idle", primaryAction: "backup_now", dataUsePolicy: "wifi_only" };
    await render(<AppearanceProvider><DataAndRecoveryRoute /></AppearanceProvider>);
    await fireEvent.press(screen.getByRole("button", { name: "Back up now" }));
    expect(screen.getByText(/Use cellular data for this backup/u)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Use cellular this time" }));
    expect(mockUseCellular).toHaveBeenCalledTimes(1);
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
