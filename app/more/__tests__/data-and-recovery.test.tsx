import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import {
  AppearanceProvider,
} from "../../../src/ui/theme";
import type {
  RuntimeCsvExport,
  RuntimeMergePreflightResult,
  RuntimeRestoreCommitResult,
  RuntimeRestorePreflightResult,
  RuntimeSecureBackupArchive,
  RuntimeBackupMetadata,
} from "../../../src/bootstrap/workoutAppRuntime";

const mockBack = jest.fn();
const mockCreateSecureBackup = jest.fn<(input: Readonly<{
  password: string;
  signal?: AbortSignal;
}>) => Promise<RuntimeSecureBackupArchive>>();
const mockShareSecureBackup = jest.fn<(
  archive: RuntimeSecureBackupArchive,
) => Promise<void>>();
const mockDiscardSecureBackup = jest.fn<(
  archive: RuntimeSecureBackupArchive,
) => Promise<void>>();
const mockPreflightSecureRestore = jest.fn<(input: Readonly<{
  password: string;
}>) => Promise<RuntimeRestorePreflightResult>>();
const mockCommitSecureRestore = jest.fn<(input: Readonly<{
  confirmation: string;
  token: string;
}>) => Promise<RuntimeRestoreCommitResult>>();
const mockInvalidateSecureRestorePreflight = jest.fn<(token: string) => void>();
const mockPreflightSecureMerge = jest.fn<(input: Readonly<{
  password: string;
}>) => Promise<RuntimeMergePreflightResult>>();
const mockCommitSecureMerge = jest.fn<(input: Readonly<{
  confirmation: string;
  token: string;
}>) => Promise<RuntimeRestoreCommitResult>>();
const mockInvalidateSecureMergePreflight = jest.fn<(token: string) => void>();
const mockRetryRestoreRebuild = jest.fn<() => Promise<RuntimeRestoreCommitResult>>();
const mockCreateCsvExport = jest.fn<() => Promise<RuntimeCsvExport>>();
const mockShareCsvExport = jest.fn<(handle: RuntimeCsvExport) => Promise<void>>();
const mockDiscardCsvExport = jest.fn<(handle: RuntimeCsvExport) => Promise<void>>();
let mockLatestBackup: RuntimeBackupMetadata | null = null;

jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
}));

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    createSecureBackup: mockCreateSecureBackup,
    shareSecureBackup: mockShareSecureBackup,
    discardSecureBackup: mockDiscardSecureBackup,
    preflightSecureRestore: mockPreflightSecureRestore,
    commitSecureRestore: mockCommitSecureRestore,
    invalidateSecureRestorePreflight: mockInvalidateSecureRestorePreflight,
    preflightSecureMerge: mockPreflightSecureMerge,
    commitSecureMerge: mockCommitSecureMerge,
    invalidateSecureMergePreflight: mockInvalidateSecureMergePreflight,
    retryRestoreRebuild: mockRetryRestoreRebuild,
    createCsvExport: mockCreateCsvExport,
    shareCsvExport: mockShareCsvExport,
    discardCsvExport: mockDiscardCsvExport,
    latestBackup: mockLatestBackup,
  }),
}));

import DataAndRecoveryRoute from "../data-and-recovery";

async function renderRoute() {
  return render(
    <AppearanceProvider>
      <DataAndRecoveryRoute />
    </AppearanceProvider>,
  );
}

describe("DataAndRecoveryRoute", () => {
  beforeEach(() => {
    mockLatestBackup = null;
    mockBack.mockReset();
    mockCreateSecureBackup.mockReset();
    mockCreateSecureBackup.mockResolvedValue({
      archiveId: "backup-1",
      createdAtMs: 1_789_977_000_000,
      displayName: "backup-1.gtbk",
    });
    mockShareSecureBackup.mockReset();
    mockShareSecureBackup.mockResolvedValue(undefined);
    mockDiscardSecureBackup.mockReset();
    mockDiscardSecureBackup.mockResolvedValue(undefined);
    mockPreflightSecureRestore.mockReset();
    mockPreflightSecureRestore.mockResolvedValue({
      outcome: "ready", token: "opaque-token", preview: {
        sourceFormatVersion: 1,
        createdAtMs: 1_786_853_900_000,
        replacementCounts: { app_settings: 1, exercises: 2, plans: 3, workout_sessions: 4 },
        references: { internalSnapshotReferences: 0, requiredLocalBundled: { available: 1, unavailable: 0 }, catalogReferences: { available: 1, unavailable: 1 } },
      },
    });
    mockCommitSecureRestore.mockReset();
    mockCommitSecureRestore.mockResolvedValue({ state: "ready" });
    mockInvalidateSecureRestorePreflight.mockReset();
    mockPreflightSecureMerge.mockReset();
    mockPreflightSecureMerge.mockResolvedValue({
      outcome: "ready",
      token: "merge-token",
      preview: {
        mode: "merge",
        sourceFormatVersion: 2,
        inserted: 5,
        duplicates: 4,
        archiveWon: 3,
        localWon: 2,
        keptBoth: 1,
        remapped: 6,
        conflicts: 0,
      },
    });
    mockCommitSecureMerge.mockReset();
    mockCommitSecureMerge.mockResolvedValue({ state: "ready" });
    mockInvalidateSecureMergePreflight.mockReset();
    mockRetryRestoreRebuild.mockReset();
    mockRetryRestoreRebuild.mockResolvedValue({ state: "ready" });
    mockCreateCsvExport.mockReset();
    mockCreateCsvExport.mockResolvedValue({ exportId: "csv-v1" });
    mockShareCsvExport.mockReset();
    mockShareCsvExport.mockResolvedValue(undefined);
    mockDiscardCsvExport.mockReset();
    mockDiscardCsvExport.mockResolvedValue(undefined);
  });

  it("requires matching passwords and exposes each visibility control by state", async () => {
    await renderRoute();

    expect(screen.getByRole("header", { name: "Data and recovery" }))
      .toBeOnTheScreen();
    expect(screen.getByLabelText("Latest backup: Never exported"))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Create secure backup" }))
      .toBeDisabled();

    await fireEvent.changeText(
      screen.getByLabelText("Backup password"),
      "password",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "different",
    );
    expect(screen.getByText("Passwords do not match.")).toBeOnTheScreen();

    await fireEvent.press(screen.getAllByRole("button", { name: "Show password" })[0]!);
    expect(screen.getByRole("button", { name: "Hide password" }).props
      .accessibilityHint).toBe("Password visible");

    await fireEvent.changeText(
      screen.getByLabelText("Confirm password"),
      "password",
    );
    expect(screen.getByRole("button", { name: "Create secure backup" }))
      .toBeEnabled();
  });

  it("shows latest backup metadata without exposing archive internals", async () => {
    mockLatestBackup = {
      archiveId: "private-archive-id",
      createdAtMs: 1_789_977_000_000,
      displayName: "backup-2026-09-21.gtbk",
    };

    await renderRoute();

    expect(screen.getByLabelText("Latest backup: backup-2026-09-21.gtbk, 2026-09-21T07:50:00.000Z"))
      .toBeOnTheScreen();
    expect(screen.queryByText("private-archive-id")).not.toBeOnTheScreen();
  });

  it("creates before showing the explicit share action, then clears the completed archive after sharing", async () => {
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Backup password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");

    await fireEvent.press(screen.getByRole("button", { name: "Create secure backup" }));

    await waitFor(() => expect(mockCreateSecureBackup).toHaveBeenCalledWith({
      password: "password",
      signal: expect.objectContaining({ aborted: false }),
    }));
    expect(await screen.findByText("Secure backup ready")).toBeOnTheScreen();
    expect(mockShareSecureBackup).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Share backup" }));
    await waitFor(() => expect(mockShareSecureBackup).toHaveBeenCalledWith(expect.objectContaining({
      archiveId: "backup-1",
    })));
    await waitFor(() => expect(screen.queryByText("Secure backup ready"))
      .not.toBeOnTheScreen());
  });

  it("uses a distinct latched sharing state without returning to password entry", async () => {
    let resolveShare: (() => void) | undefined;
    mockShareSecureBackup.mockImplementationOnce(() => new Promise((resolve) => {
      resolveShare = resolve;
    }));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Backup password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Create secure backup" }));
    await screen.findByText("Secure backup ready");

    const shareButton = screen.getByRole("button", { name: "Share backup" });
    await fireEvent.press(shareButton);
    await fireEvent.press(shareButton);

    expect(mockShareSecureBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Opening share options")).toBeOnTheScreen();
    expect(screen.queryByText("Preparing secure backup")).not.toBeOnTheScreen();
    expect(screen.queryByLabelText("Backup password")).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Create secure backup" }))
      .not.toBeOnTheScreen();

    await act(async () => {
      resolveShare?.();
    });
  });

  it("shows a safe share-specific failure and requires creating a fresh backup", async () => {
    mockShareSecureBackup.mockRejectedValueOnce(new Error("file:///private/backup.gtbk"));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Backup password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Create secure backup" }));
    await screen.findByText("Secure backup ready");
    await fireEvent.press(screen.getByRole("button", { name: "Share backup" }));

    expect(await screen.findByText("Backup could not be shared")).toBeOnTheScreen();
    expect(screen.getByText("Your saved workouts and plans were not changed. Create a new backup to try again."))
      .toBeOnTheScreen();
    expect(screen.queryByText("Backup could not be created")).not.toBeOnTheScreen();
    expect(screen.queryByText("file:///private/backup.gtbk")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Create another backup" }));
    expect(screen.getByLabelText("Backup password")).toBeOnTheScreen();
  });

  it("cancels backup preparation immediately and discards a stale late archive", async () => {
    let resolveCreate: ((archive: RuntimeSecureBackupArchive) => void) | undefined;
    let receivedSignal: AbortSignal | undefined;
    mockCreateSecureBackup.mockImplementationOnce((input) => {
      receivedSignal = input.signal;
      return new Promise((resolve) => { resolveCreate = resolve; });
    });
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Backup password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");
    const createButton = screen.getByRole("button", { name: "Create secure backup" });

    await fireEvent.press(createButton);
    await fireEvent.press(createButton);

    expect(mockCreateSecureBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Preparing secure backup")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel backup" }));
    expect(receivedSignal?.aborted).toBe(true);
    expect(screen.getByText("Backup creation cancelled.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Backup password")).toBeOnTheScreen();

    await act(async () => {
      resolveCreate?.({
        archiveId: "late-backup",
        createdAtMs: 1_789_977_000_000,
        displayName: "late-backup.gtbk",
      });
    });

    await waitFor(() => expect(mockDiscardSecureBackup).toHaveBeenCalledWith(expect.objectContaining({
      archiveId: "late-backup",
    })));
    expect(screen.queryByText("Secure backup ready")).not.toBeOnTheScreen();
    expect(screen.queryByText("Backup could not be created")).not.toBeOnTheScreen();
    expect(mockShareSecureBackup).not.toHaveBeenCalled();
  });

  it("discards a ready unshared backup when the route unmounts", async () => {
    const route = await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Backup password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Create secure backup" }));
    await screen.findByText("Secure backup ready");

    route.unmount();

    await waitFor(() => expect(mockDiscardSecureBackup).toHaveBeenCalledWith(expect.objectContaining({
      archiveId: "backup-1",
    })));
    expect(mockShareSecureBackup).not.toHaveBeenCalled();
  });

  it("shows only the safe failure copy and allows a retry after export failure", async () => {
    mockCreateSecureBackup.mockRejectedValueOnce(new Error("sensitive native path"));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Backup password"), "password");
    await fireEvent.changeText(screen.getByLabelText("Confirm password"), "password");

    await fireEvent.press(screen.getByRole("button", { name: "Create secure backup" }));

    expect(await screen.findByText("Backup could not be created")).toBeOnTheScreen();
    expect(screen.getByText(
      "Your saved workouts and plans were not changed. Check available storage and try again.",
    )).toBeOnTheScreen();
    expect(screen.queryByText("sensitive native path")).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "Create secure backup" }))
      .toBeDisabled();
  });

  it("cancels selection without writing and keeps the picker action accessible", async () => {
    mockPreflightSecureRestore.mockResolvedValueOnce({ outcome: "cancelled" });
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Restore password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Restore clean" }));

    expect(await screen.findByText("No backup was selected")).toBeOnTheScreen();
    expect(mockCommitSecureRestore).not.toHaveBeenCalled();
  });

  it("invalidates a restore preflight that completes after the route unmounts", async () => {
    let resolvePreflight: ((result: RuntimeRestorePreflightResult) => void) | undefined;
    mockPreflightSecureRestore.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePreflight = resolve;
    }));
    const route = await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Restore password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Restore clean" }));

    await act(async () => {
      route.unmount();
      resolvePreflight?.({
        outcome: "ready",
        token: "late-token",
        preview: {
          sourceFormatVersion: 1,
          createdAtMs: 1_786_853_900_000,
          replacementCounts: {},
          references: { internalSnapshotReferences: 0, requiredLocalBundled: { available: 0, unavailable: 0 }, catalogReferences: { available: 0, unavailable: 0 } },
        },
      });
    });

    await waitFor(() => expect(mockInvalidateSecureRestorePreflight)
      .toHaveBeenCalledWith("late-token"));
    expect(mockCommitSecureRestore).not.toHaveBeenCalled();
  });

  it("reviews bounded counts, requires exact REPLACE, and latches duplicate restore presses", async () => {
    let resolveCommit: ((value: RuntimeRestoreCommitResult) => void) | undefined;
    mockCommitSecureRestore.mockImplementationOnce(() => new Promise((resolve) => { resolveCommit = resolve; }));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Restore password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Restore clean" }));

    expect(await screen.findByRole("header", { name: "Review restore clean" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Source format version: 1")).toBeOnTheScreen();
    expect(screen.getByLabelText("Backup created: 2026-08-16T04:18:20.000Z")).toBeOnTheScreen();
    expect(screen.getByLabelText("Plans: 3")).toBeOnTheScreen();
    expect(screen.getByLabelText("Custom exercises: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Sessions: 4")).toBeOnTheScreen();
    expect(screen.getByLabelText("Settings: 1")).toBeOnTheScreen();
    expect(screen.getByLabelText("Catalog references available: 1")).toBeOnTheScreen();
    expect(screen.getByLabelText("Catalog references unavailable: 1")).toBeOnTheScreen();
    const previewFacts = [
      "Source format version: 1",
      "Backup created: 2026-08-16T04:18:20.000Z",
      "Plans: 3",
      "Custom exercises: 2",
      "Sessions: 4",
      "Settings: 1",
      "Catalog references available: 1",
      "Catalog references unavailable: 1",
    ].map((label) => screen.getByLabelText(label));
    expect(screen.container.queryAll((node) => node.props.role === "list", { includeSelf: true }))
      .toHaveLength(1);
    expect(previewFacts).toHaveLength(8);
    expect(previewFacts.every((fact) => fact.props.accessible === true)).toBe(true);
    expect(previewFacts.every((fact) => fact.props.accessibilityRole === "text")).toBe(true);
    expect(screen.queryByText("Plans: 3 · Custom exercises: 2 · Sessions: 4 · Settings: 1"))
      .not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Restore backup" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Type REPLACE to continue"), "replace");
    expect(screen.getByRole("button", { name: "Restore backup" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Type REPLACE to continue"), "REPLACE");
    const button = screen.getByRole("button", { name: "Restore backup" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockCommitSecureRestore).toHaveBeenCalledTimes(1);
    expect(mockCommitSecureRestore).toHaveBeenCalledWith({ token: "opaque-token", confirmation: "REPLACE" });
    await act(async () => {
      resolveCommit?.({ state: "ready" });
    });
    expect(await screen.findByText("Backup restored. Search and progress are ready.")).toBeOnTheScreen();
  });

  it("cancels restore clean review and invalidates the active restore token", async () => {
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Restore password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Restore clean" }));
    await screen.findByRole("header", { name: "Review restore clean" });

    await fireEvent.press(screen.getByRole("button", { name: "Cancel restore clean" }));

    expect(mockInvalidateSecureRestorePreflight).toHaveBeenCalledWith("opaque-token");
    expect(mockCommitSecureRestore).not.toHaveBeenCalled();
    expect(screen.getByText("No backup was selected")).toBeOnTheScreen();
  });

  it("keeps derivative-dependent success unavailable and offers retry when rebuilding remains pending", async () => {
    mockCommitSecureRestore.mockResolvedValueOnce({ state: "rebuild_pending" });
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Restore password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Restore clean" }));
    await screen.findByText("Review restore clean");
    await fireEvent.changeText(screen.getByLabelText("Type REPLACE to continue"), "REPLACE");
    await fireEvent.press(screen.getByRole("button", { name: "Restore backup" }));

    expect(await screen.findByText("Backup restored. Recalculating search and progress.")).toBeOnTheScreen();
    expect(screen.queryByText("Backup restored. Search and progress are ready.")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry rebuild" })).toBeOnTheScreen();
    expect(screen.getByTestId("restore-rebuild-retry-action")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Retry rebuild" }));
    await waitFor(() => expect(mockRetryRestoreRebuild).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Backup restored. Search and progress are ready.")).toBeOnTheScreen();
  });

  it("keeps wrong-password-or-tampered and transaction errors to safe copy", async () => {
    mockPreflightSecureRestore.mockRejectedValueOnce(Object.assign(new Error("secret archive path"), { code: "restore_archive_unavailable" }));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Restore password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Restore clean" }));
    expect(await screen.findByText("Backup could not be opened")).toBeOnTheScreen();
    expect(screen.getByText("Your current saved data was not changed.")).toBeOnTheScreen();
    expect(screen.queryByText("secret archive path")).not.toBeOnTheScreen();
  });

  it("retries a restore failure through fresh selection and preflight without reusing its token", async () => {
    mockPreflightSecureRestore
      .mockResolvedValueOnce({
        outcome: "ready",
        token: "first-token",
        preview: {
          sourceFormatVersion: 1,
          createdAtMs: 1_786_853_900_000,
          replacementCounts: { app_settings: 1 },
          references: { internalSnapshotReferences: 0, requiredLocalBundled: { available: 0, unavailable: 0 }, catalogReferences: { available: 0, unavailable: 0 } },
        },
      })
      .mockResolvedValueOnce({
        outcome: "ready",
        token: "second-token",
        preview: {
          sourceFormatVersion: 1,
          createdAtMs: 1_786_853_900_000,
          replacementCounts: { app_settings: 1 },
          references: { internalSnapshotReferences: 0, requiredLocalBundled: { available: 0, unavailable: 0 }, catalogReferences: { available: 0, unavailable: 0 } },
        },
      });
    mockCommitSecureRestore.mockRejectedValueOnce(Object.assign(new Error("private database exception"), { code: "restore_commit_failed" }));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Restore password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Restore clean" }));
    await screen.findByText("Review restore clean");
    await fireEvent.changeText(screen.getByLabelText("Type REPLACE to continue"), "REPLACE");
    await fireEvent.press(screen.getByRole("button", { name: "Restore backup" }));

    expect(await screen.findByText("Restore could not be completed")).toBeOnTheScreen();
    expect(screen.getByText("Your current saved data was kept.")).toBeOnTheScreen();
    expect(screen.queryByText("private database exception")).not.toBeOnTheScreen();
    expect(screen.queryByText("Backup restored. Recalculating search and progress.")).not.toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText("Restore password"), "new-password");
    await fireEvent.press(screen.getByRole("button", { name: "Try restore clean again" }));
    await screen.findByRole("header", { name: "Review restore clean" });
    expect(mockPreflightSecureRestore).toHaveBeenNthCalledWith(1, { password: "password" });
    expect(mockPreflightSecureRestore).toHaveBeenNthCalledWith(2, { password: "new-password" });
    expect(screen.getByRole("button", { name: "Restore backup" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Type REPLACE to continue"), "REPLACE");
    await fireEvent.press(screen.getByRole("button", { name: "Restore backup" }));
    await waitFor(() => expect(mockCommitSecureRestore).toHaveBeenCalledTimes(2));
    expect(mockCommitSecureRestore).toHaveBeenNthCalledWith(1, { token: "first-token", confirmation: "REPLACE" });
    expect(mockCommitSecureRestore).toHaveBeenNthCalledWith(2, { token: "second-token", confirmation: "REPLACE" });
  });

  it("cancels merge selection without writing and keeps the merge action accessible", async () => {
    mockPreflightSecureMerge.mockResolvedValueOnce({ outcome: "cancelled" });
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Merge password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Import / merge backup" }));

    expect(await screen.findByText("Merge cancelled. No changes have been made.")).toBeOnTheScreen();
    expect(mockCommitSecureMerge).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Import / merge backup" }))
      .toBeDisabled();
  });

  it("invalidates a merge preflight that completes after the route unmounts", async () => {
    let resolvePreflight: ((result: RuntimeMergePreflightResult) => void) | undefined;
    mockPreflightSecureMerge.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePreflight = resolve;
    }));
    const route = await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Merge password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Import / merge backup" }));

    await act(async () => {
      route.unmount();
      resolvePreflight?.({
        outcome: "ready",
        token: "late-merge-token",
        preview: {
          mode: "merge",
          sourceFormatVersion: 2,
          inserted: 0,
          duplicates: 0,
          archiveWon: 0,
          localWon: 0,
          keptBoth: 0,
          remapped: 0,
          conflicts: 0,
        },
      });
    });

    await waitFor(() => expect(mockInvalidateSecureMergePreflight)
      .toHaveBeenCalledWith("late-merge-token"));
    expect(mockCommitSecureMerge).not.toHaveBeenCalled();
  });

  it("reviews merge counts, requires exact MERGE, and latches duplicate merge presses", async () => {
    let resolveCommit: ((value: RuntimeRestoreCommitResult) => void) | undefined;
    mockCommitSecureMerge.mockImplementationOnce(() => new Promise((resolve) => { resolveCommit = resolve; }));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Merge password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Import / merge backup" }));

    expect(await screen.findByRole("header", { name: "Review merge" })).toBeOnTheScreen();
    expect(screen.getByText("No changes have been made yet.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Records inserted: 5")).toBeOnTheScreen();
    expect(screen.getByLabelText("Duplicates unchanged: 4")).toBeOnTheScreen();
    expect(screen.getByLabelText("Archive wins: 3")).toBeOnTheScreen();
    expect(screen.getByLabelText("Local wins: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Kept both: 1")).toBeOnTheScreen();
    expect(screen.getByLabelText("Remapped IDs: 6")).toBeOnTheScreen();
    expect(screen.getByLabelText("Conflicts: 0")).toBeOnTheScreen();
    expect(screen.getByText(
      "Newer sessions and corrections win. Existing settings stay. Different custom exercises and plans are kept by identity.",
    )).toBeOnTheScreen();
    expect(screen.container.queryAll((node) => node.props.role === "list", { includeSelf: true }))
      .toHaveLength(1);
    expect(screen.getByRole("button", { name: "Merge backup" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Type MERGE to continue"), "merge");
    expect(screen.getByRole("button", { name: "Merge backup" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Type MERGE to continue"), "MERGE");
    const button = screen.getByRole("button", { name: "Merge backup" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockCommitSecureMerge).toHaveBeenCalledTimes(1);
    expect(mockCommitSecureMerge).toHaveBeenCalledWith({ token: "merge-token", confirmation: "MERGE" });
    await act(async () => {
      resolveCommit?.({ state: "ready" });
    });
    expect(await screen.findByText("Merge complete. Search and progress are ready.")).toBeOnTheScreen();
  });

  it("cancels merge review and invalidates the active merge token", async () => {
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Merge password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Import / merge backup" }));
    await screen.findByRole("header", { name: "Review merge" });

    await fireEvent.press(screen.getByRole("button", { name: "Cancel merge" }));

    expect(mockInvalidateSecureMergePreflight).toHaveBeenCalledWith("merge-token");
    expect(mockCommitSecureMerge).not.toHaveBeenCalled();
    expect(screen.getByText("Merge cancelled. No changes have been made.")).toBeOnTheScreen();
  });

  it("guides old backups to restore clean without leaking merge-open failures", async () => {
    mockPreflightSecureMerge.mockRejectedValueOnce(Object.assign(new Error("private archive v1 path"), {
      code: "merge_archive_requires_v2",
    }));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Merge password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Import / merge backup" }));

    expect(await screen.findByText("Backup could not be opened")).toBeOnTheScreen();
    expect(screen.getByText("Use Restore clean for this older backup. Your current saved data was not changed."))
      .toBeOnTheScreen();
    expect(screen.queryByText("private archive v1 path")).not.toBeOnTheScreen();
    expect(mockCommitSecureMerge).not.toHaveBeenCalled();
  });

  it("keeps merge transaction failures to safe copy and retries through a fresh preflight token", async () => {
    mockPreflightSecureMerge
      .mockResolvedValueOnce({
        outcome: "ready",
        token: "first-merge-token",
        preview: {
          mode: "merge",
          sourceFormatVersion: 2,
          inserted: 1,
          duplicates: 0,
          archiveWon: 0,
          localWon: 0,
          keptBoth: 0,
          remapped: 0,
          conflicts: 0,
        },
      })
      .mockResolvedValueOnce({
        outcome: "ready",
        token: "second-merge-token",
        preview: {
          mode: "merge",
          sourceFormatVersion: 2,
          inserted: 1,
          duplicates: 0,
          archiveWon: 0,
          localWon: 0,
          keptBoth: 0,
          remapped: 0,
          conflicts: 0,
        },
      });
    mockCommitSecureMerge.mockRejectedValueOnce(Object.assign(new Error("private sqlite stack"), {
      code: "merge_commit_failed",
    }));
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Merge password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Import / merge backup" }));
    await screen.findByRole("header", { name: "Review merge" });
    await fireEvent.changeText(screen.getByLabelText("Type MERGE to continue"), "MERGE");
    await fireEvent.press(screen.getByRole("button", { name: "Merge backup" }));

    expect(await screen.findByText("Merge could not be completed")).toBeOnTheScreen();
    expect(screen.getByText("Your current saved data was kept.")).toBeOnTheScreen();
    expect(screen.queryByText("private sqlite stack")).not.toBeOnTheScreen();
    expect(screen.queryByText("Merge saved. Recalculating search and progress.")).not.toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText("Merge password"), "new-password");
    await fireEvent.press(screen.getByRole("button", { name: "Try merge again" }));
    await screen.findByRole("header", { name: "Review merge" });
    expect(mockPreflightSecureMerge).toHaveBeenNthCalledWith(1, { password: "password" });
    expect(mockPreflightSecureMerge).toHaveBeenNthCalledWith(2, { password: "new-password" });
    expect(screen.getByRole("button", { name: "Merge backup" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Type MERGE to continue"), "MERGE");
    await fireEvent.press(screen.getByRole("button", { name: "Merge backup" }));
    await waitFor(() => expect(mockCommitSecureMerge).toHaveBeenCalledTimes(2));
    expect(mockCommitSecureMerge).toHaveBeenNthCalledWith(1, { token: "first-merge-token", confirmation: "MERGE" });
    expect(mockCommitSecureMerge).toHaveBeenNthCalledWith(2, { token: "second-merge-token", confirmation: "MERGE" });
  });

  it("keeps merge success pending until rebuild retry completes", async () => {
    mockCommitSecureMerge.mockResolvedValueOnce({ state: "rebuild_pending" });
    await renderRoute();
    await fireEvent.changeText(screen.getByLabelText("Merge password"), "password");
    await fireEvent.press(screen.getByRole("button", { name: "Import / merge backup" }));
    await screen.findByRole("header", { name: "Review merge" });
    await fireEvent.changeText(screen.getByLabelText("Type MERGE to continue"), "MERGE");
    await fireEvent.press(screen.getByRole("button", { name: "Merge backup" }));

    expect(await screen.findByText("Merge saved. Recalculating search and progress.")).toBeOnTheScreen();
    expect(screen.queryByText("Merge complete. Search and progress are ready.")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry rebuild" })).toBeOnTheScreen();
    expect(screen.getByTestId("merge-rebuild-retry-action")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Retry rebuild" }));
    await waitFor(() => expect(mockRetryRestoreRebuild).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Merge complete. Search and progress are ready.")).toBeOnTheScreen();
  });

  it("shows the exact readable CSV warning and latches duplicate export/share presses", async () => {
    let resolveCreate: ((value: RuntimeCsvExport) => void) | undefined;
    mockCreateCsvExport.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    await renderRoute();

    expect(screen.getAllByText("Export CSV")).toHaveLength(2);
    expect(screen.getByText(
      "CSV is a readable spreadsheet file. Share it only with people you trust.",
    )).toBeOnTheScreen();
    expect(screen.getByText(
      "It is not password-protected and includes historical, audit, recommendation, and decision data.",
    )).toBeOnTheScreen();
    const exportButton = screen.getByRole("button", { name: "Export CSV" });
    await fireEvent.press(exportButton);
    await fireEvent.press(exportButton);
    expect(mockCreateCsvExport).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Preparing CSV export")).toBeOnTheScreen();

    await act(async () => {
      resolveCreate?.({ exportId: "csv-v1" });
    });
    expect(await screen.findByText("CSV export ready")).toBeOnTheScreen();

    let resolveShare: (() => void) | undefined;
    mockShareCsvExport.mockImplementationOnce(() => new Promise((resolve) => { resolveShare = resolve; }));
    const shareButton = screen.getByRole("button", { name: "Share CSV" });
    await fireEvent.press(shareButton);
    await fireEvent.press(shareButton);
    expect(mockShareCsvExport).toHaveBeenCalledTimes(1);
    expect(mockShareCsvExport).toHaveBeenCalledWith({ exportId: "csv-v1" });
    await act(async () => {
      resolveShare?.();
    });
    await waitFor(() => expect(screen.queryByText("CSV export ready"))
      .not.toBeOnTheScreen());
  });

  it("shows safe retryable CSV failures without leaking paths or claiming success", async () => {
    mockCreateCsvExport.mockRejectedValueOnce(new Error("/private/cache/export.csv"));
    await renderRoute();
    await fireEvent.press(screen.getByRole("button", { name: "Export CSV" }));

    expect(await screen.findByText("CSV export could not be created")).toBeOnTheScreen();
    expect(screen.getByText("Your saved data was not changed.")).toBeOnTheScreen();
    expect(screen.queryByText("/private/cache/export.csv")).not.toBeOnTheScreen();
    expect(screen.queryByText("CSV export ready")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Try CSV export again" }));
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeOnTheScreen();
  });

  it("handles unavailable or rejected sharing as a safe terminal file-lifecycle failure", async () => {
    let resolveCreate: ((value: RuntimeCsvExport) => void) | undefined;
    mockCreateCsvExport.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    mockShareCsvExport.mockRejectedValueOnce(new Error("content://private/export.csv"));
    await renderRoute();
    await fireEvent.press(screen.getByRole("button", { name: "Export CSV" }));
    await act(async () => {
      resolveCreate?.({ exportId: "csv-v1" });
    });
    await screen.findByText("CSV export ready");
    await fireEvent.press(screen.getByRole("button", { name: "Share CSV" }));

    expect(await screen.findByText("CSV could not be shared")).toBeOnTheScreen();
    expect(screen.getByText("Your saved data was not changed.")).toBeOnTheScreen();
    expect(screen.queryByText("content://private/export.csv")).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Share CSV" })).not.toBeOnTheScreen();
    expect(mockDiscardCsvExport).toHaveBeenCalledWith({ exportId: "csv-v1" });
  });

  it("discards a ready unshared CSV when Back unmounts the route", async () => {
    let resolveCreate: ((value: RuntimeCsvExport) => void) | undefined;
    mockCreateCsvExport.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const route = await renderRoute();
    await fireEvent.press(screen.getByRole("button", { name: "Export CSV" }));
    await act(async () => {
      resolveCreate?.({ exportId: "csv-v1" });
    });
    await screen.findByText("CSV export ready");

    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    route.unmount();

    expect(mockBack).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockDiscardCsvExport).toHaveBeenCalledWith({
      exportId: "csv-v1",
    }));
    expect(mockShareCsvExport).not.toHaveBeenCalled();
  });

  it("discards a CSV that finishes after the route has already unmounted", async () => {
    let resolveCreate: ((handle: RuntimeCsvExport) => void) | undefined;
    mockCreateCsvExport.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const route = await renderRoute();
    await fireEvent.press(screen.getByRole("button", { name: "Export CSV" }));

    route.unmount();
    resolveCreate?.({ exportId: "csv-v1-late" } as RuntimeCsvExport);

    await waitFor(() => expect(mockDiscardCsvExport).toHaveBeenCalledWith({
      exportId: "csv-v1-late",
    }));
  });

  it("does not discard the handle already consumed by sharing", async () => {
    let resolveCreate: ((value: RuntimeCsvExport) => void) | undefined;
    mockCreateCsvExport.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const route = await renderRoute();
    await fireEvent.press(screen.getByRole("button", { name: "Export CSV" }));
    await act(async () => {
      resolveCreate?.({ exportId: "csv-v1" });
    });
    await screen.findByText("CSV export ready");
    await fireEvent.press(screen.getByRole("button", { name: "Share CSV" }));
    await waitFor(() => expect(mockShareCsvExport).toHaveBeenCalledTimes(1));

    route.unmount();
    expect(mockDiscardCsvExport).not.toHaveBeenCalled();
  });
});
