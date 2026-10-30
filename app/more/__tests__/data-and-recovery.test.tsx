import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../../../src/ui/theme";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockRequestAndroidViewFocus = jest.fn<(nativeID: string) => Promise<boolean>>();
let mockFocusEffect: (() => void) | undefined;
const mockConnect = jest.fn<() => Promise<void>>();
const mockCreateCsvExport = jest.fn<() => Promise<{ exportId: string }>>();
const mockShareCsvExport = jest.fn<(value: { exportId: string }) => Promise<void>>();
const mockDiscardCsvExport = jest.fn<(value: { exportId: string }) => Promise<void>>();
const mockUseCellular = jest.fn<() => Promise<void>>();
const mockBackupNow = jest.fn<() => Promise<void>>();
const mockDismissCellular = jest.fn<() => Promise<void>>();
const mockPrepareAutomaticRecovery = jest.fn<(input: { candidate: "latest" | "previous" }) => Promise<any>>();
const mockCommitAutomaticRecovery = jest.fn<() => Promise<void>>();
const mockCancelAutomaticRecovery = jest.fn<() => Promise<void>>();
const mockRuntime: any = {
  automaticBackup: { status: "not_connected", reason: null, warning: null, lastSuccessfulBackupAtMs: null, primaryAction: "connect", dataUsePolicy: "wifi_and_cellular", recoveryPrompt: null, progressStage: null },
  connectAutomaticBackup: mockConnect,
  requestAutomaticBackupNow: mockBackupNow,
  cancelAutomaticBackupCheck: jest.fn(async () => undefined),
  dismissAutomaticBackupCellularConfirmation: mockDismissCellular,
  useAutomaticBackupCellularThisTime: mockUseCellular,
  reviewAutomaticRecovery: mockPrepareAutomaticRecovery,
  commitAutomaticRecovery: mockCommitAutomaticRecovery,
  cancelAutomaticRecovery: mockCancelAutomaticRecovery,
  createCsvExport: mockCreateCsvExport,
  shareCsvExport: mockShareCsvExport,
  discardCsvExport: mockDiscardCsvExport,
};

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (href: string) => mockPush(href),
  },
  useFocusEffect: (effect: () => void) => { mockFocusEffect = effect; },
  useLocalSearchParams: () => ({}),
}));
jest.mock("../../../src/bootstrap/androidViewFocus", () => ({
  requestAndroidViewFocus: (nativeID: string) => mockRequestAndroidViewFocus(nativeID),
}));
jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => mockRuntime,
}));

import DataAndRecoveryRoute from "../data-and-recovery";

describe("DataAndRecoveryRoute", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockRequestAndroidViewFocus.mockReset();
    mockRequestAndroidViewFocus.mockResolvedValue(true);
    mockFocusEffect = undefined;
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
    mockBackupNow.mockReset();
    mockBackupNow.mockResolvedValue(undefined);
    mockDismissCellular.mockReset();
    mockDismissCellular.mockResolvedValue(undefined);
    mockPrepareAutomaticRecovery.mockReset();
    mockPrepareAutomaticRecovery.mockResolvedValue({ kind: "empty_direct", attemptId: "attempt" });
    mockCommitAutomaticRecovery.mockReset();
    mockCommitAutomaticRecovery.mockResolvedValue(undefined);
    mockCancelAutomaticRecovery.mockReset();
    mockCancelAutomaticRecovery.mockResolvedValue(undefined);
    mockRuntime.automaticBackup = { status: "not_connected", reason: null, warning: null, lastSuccessfulBackupAtMs: null, primaryAction: "connect", dataUsePolicy: "wifi_and_cellular", recoveryPrompt: null, progressStage: null };
  });

  it("prepares an explicit previous candidate and confirms a reviewed merge", async () => {
    mockRuntime.automaticBackup = {
      ...mockRuntime.automaticBackup,
      status: "restore_pending",
      primaryAction: "continue_restore",
      recoveryPrompt: { kind: "latest", producedAtMs: 2, previousProducedAtMs: 1 },
    };
    mockPrepareAutomaticRecovery.mockResolvedValueOnce({
      kind: "merge",
      attemptId: "merge-attempt",
      token: "merge-token",
      ownerSummary: "A different backup identity",
      adoptionRequired: true,
    });
    await render(<AppearanceProvider><DataAndRecoveryRoute /></AppearanceProvider>);

    await fireEvent.press(screen.getByRole("button", { name: "Use previous backup" }));
    expect(mockPrepareAutomaticRecovery).toHaveBeenCalledWith({ candidate: "previous" });
    expect(screen.getByRole("header", { name: "Review cloud merge" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Merge workouts" }));
    expect(mockCommitAutomaticRecovery).toHaveBeenCalledWith({
      kind: "merge",
      attemptId: "merge-attempt",
      confirmation: "MERGE",
      adoptIdentity: true,
    });
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

  it("submits a normal manual request under Wi-Fi-only without guessing the network", async () => {
    mockRuntime.automaticBackup = { ...mockRuntime.automaticBackup, status: "idle", primaryAction: "backup_now", dataUsePolicy: "wifi_only" };
    const route = await render(<AppearanceProvider><DataAndRecoveryRoute /></AppearanceProvider>);
    await fireEvent.press(route.getByRole("button", { name: "Back up now" }));
    expect(mockBackupNow).toHaveBeenCalledTimes(1);
    expect(route.queryByText(/Use cellular data for this backup/u)).not.toBeOnTheScreen();
  });

  it("renders cellular confirmation only after the scheduler requests it", async () => {
    mockRuntime.automaticBackup = { ...mockRuntime.automaticBackup, reason: "cellular_confirmation_required" };
    await render(<AppearanceProvider><DataAndRecoveryRoute /></AppearanceProvider>);
    expect(screen.getByText(/Use cellular data for this backup/u)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Use cellular this time" }));
    expect(mockUseCellular).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockDismissCellular).toHaveBeenCalledTimes(1);
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

  it("restores exact nested-route origin focus when the recovery hub resumes", async () => {
    await render(<AppearanceProvider><DataAndRecoveryRoute /></AppearanceProvider>);
    const automatic = screen.getByRole("button", { name: "Automatic backup settings" });
    const manual = screen.getByRole("button", { name: "Manual encrypted backup" });

    expect(automatic.props.nativeID).toBe("data-recovery-automatic-backup-settings");
    expect(manual.props.nativeID).toBe("data-recovery-manual-encrypted-backup");

    await fireEvent.press(automatic);
    expect(mockPush).toHaveBeenCalledWith("/more/automatic-backup-settings");
    await act(async () => { mockFocusEffect?.(); });
    expect(mockRequestAndroidViewFocus)
      .toHaveBeenLastCalledWith("data-recovery-automatic-backup-settings");

    await fireEvent.press(manual);
    expect(mockPush).toHaveBeenCalledWith("/more/manual-encrypted-backup");
    await act(async () => { mockFocusEffect?.(); });
    expect(mockRequestAndroidViewFocus)
      .toHaveBeenLastCalledWith("data-recovery-manual-encrypted-backup");
  });
});
