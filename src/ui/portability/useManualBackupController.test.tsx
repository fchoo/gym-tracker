import { act, fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";

import { useManualBackupController } from "./useManualBackupController";

function Harness(props: Parameters<typeof useManualBackupController>[0]) {
  const controller = useManualBackupController(props);
  return <>
    <Text testID="backup">{controller.backupState.kind}</Text>
    <Pressable testID="create" onPress={() => { void controller.createBackup("secret"); }} />
    <Pressable testID="cancel" onPress={controller.cancelBackup} />
  </>;
}

const base = () => ({
  createSecureBackup: jest.fn(async () => ({ archiveId: "archive", createdAtMs: 1, displayName: "backup.gtbk" })),
  shareSecureBackup: jest.fn(async () => undefined),
  discardSecureBackup: jest.fn(async () => undefined),
  preflightSecureRestore: jest.fn(async () => ({ outcome: "cancelled" as const })),
  commitSecureRestore: jest.fn(async () => ({ state: "ready" as const })),
  invalidateSecureRestorePreflight: jest.fn(),
  preflightSecureMerge: jest.fn(async () => ({ outcome: "cancelled" as const })),
  commitSecureMerge: jest.fn(async () => ({ state: "ready" as const })),
  invalidateSecureMergePreflight: jest.fn(),
  retryRestoreRebuild: jest.fn(async () => ({ state: "ready" as const })),
});

describe("useManualBackupController", () => {
  it("aborts preparation and disposes a late archive instead of publishing it", async () => {
    let resolve: ((value: { archiveId: string; createdAtMs: number; displayName: string }) => void) | undefined;
    const input = base();
    input.createSecureBackup.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = await render(<Harness {...input} />);
    await act(async () => { fireEvent.press(view.getByTestId("create")); await Promise.resolve(); });
    expect(view.getByTestId("backup").children).toEqual(["preparing"]);
    fireEvent.press(view.getByTestId("cancel"));
    await act(async () => { resolve?.({ archiveId: "late", createdAtMs: 1, displayName: "late.gtbk" }); });
    expect(input.discardSecureBackup).toHaveBeenCalledWith(expect.objectContaining({ archiveId: "late" }));
    expect(view.getByTestId("backup").children).toEqual(["cancelled"]);
  });
});
