import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { AppearanceProvider } from "../../../src/ui/theme";
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
import DriveBackupPrivacyRoute from "../drive-backup-privacy";
describe("DriveBackupPrivacyRoute", () => {
  it("explains the readable, non-E2EE Drive boundary without an acknowledgement gate", async () => {
    await render(<AppearanceProvider><DriveBackupPrivacyRoute /></AppearanceProvider>);
    expect(screen.getByText("Automatic Drive backups are not end-to-end encrypted.")).toBeOnTheScreen();
    expect(screen.getByText(/readable JSON/u)).toBeOnTheScreen();
    expect(screen.getByText(/drive.file/u)).toBeOnTheScreen();
  });
});
