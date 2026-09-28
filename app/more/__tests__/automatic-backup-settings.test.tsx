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
});
