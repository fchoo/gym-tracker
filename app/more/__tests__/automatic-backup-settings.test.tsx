import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../../../src/ui/theme";

const mockRuntime = {
  automaticBackup: { accountLabel: "owner@example.com", dataUsePolicy: "wifi_only" as const, status: "idle", reason: null as null },
  setAutomaticBackupDataUsePolicy: jest.fn<() => Promise<void>>(),
  disconnectAutomaticBackup: jest.fn<() => Promise<void>>(),
  deleteAutomaticCloudBackup: jest.fn<() => Promise<void>>(),
  connectAutomaticBackup: jest.fn<() => Promise<void>>(),
  takeOverAutomaticBackup: jest.fn<() => Promise<void>>(),
  finishDeletingAutomaticCloudBackup: jest.fn<() => Promise<void>>(),
  startNewAutomaticCloudBackup: jest.fn<() => Promise<void>>(),
};
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({ useWorkoutAppRuntime: () => mockRuntime }));
import AutomaticBackupSettingsRoute from "../automatic-backup-settings";

describe("AutomaticBackupSettingsRoute", () => {
  beforeEach(() => { for (const value of Object.values(mockRuntime)) if (typeof value === "function") { value.mockReset(); value.mockResolvedValue(undefined); } });
  it("keeps policy, disconnect, and typed deletion distinct", async () => {
    await render(<AppearanceProvider><AutomaticBackupSettingsRoute /></AppearanceProvider>);
    expect(screen.getByText("owner@example.com")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Any connection" }));
    expect(mockRuntime.setAutomaticBackupDataUsePolicy).toHaveBeenCalledWith("wifi_and_cellular");
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Google Drive" }));
    expect(screen.getByText(/cloud backups remain in Drive/u)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Google Drive" }));
    expect(mockRuntime.disconnectAutomaticBackup).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Delete cloud backup…" }));
    const confirmation = screen.getByLabelText("Type DELETE to delete cloud backup");
    await fireEvent.changeText(confirmation, "DELETE");
    await fireEvent.press(screen.getByRole("button", { name: "Delete cloud backup" }));
    expect(mockRuntime.deleteAutomaticCloudBackup).toHaveBeenCalledTimes(1);
  });
  it("shows only the state-specific stale writer, partial deletion, and restart actions", async () => {
    mockRuntime.automaticBackup = { accountLabel: "owner@example.com", dataUsePolicy: "wifi_only", status: "paused", reason: "stale_writer" } as never;
    const stale = await render(<AppearanceProvider><AutomaticBackupSettingsRoute /></AppearanceProvider>);
    expect(screen.getByRole("button", { name: "Use this phone for backup…" })).toBeOnTheScreen();
    await stale.unmount();

    mockRuntime.automaticBackup = { accountLabel: "owner@example.com", dataUsePolicy: "wifi_only", status: "paused", reason: "deletion_partial" } as never;
    const partial = await render(<AppearanceProvider><AutomaticBackupSettingsRoute /></AppearanceProvider>);
    expect(screen.getByRole("button", { name: "Finish deleting cloud backup" })).toBeOnTheScreen();
    await partial.unmount();

    mockRuntime.automaticBackup = { accountLabel: null, dataUsePolicy: "wifi_only", status: "paused", reason: "restore_required" } as never;
    const restart = await render(<AppearanceProvider><AutomaticBackupSettingsRoute /></AppearanceProvider>);
    await fireEvent.press(restart.getByRole("button", { name: "Start a new cloud backup…" }));
    expect(await restart.findByRole("button", { name: "Start a new cloud backup" })).toBeOnTheScreen();
  });
});
