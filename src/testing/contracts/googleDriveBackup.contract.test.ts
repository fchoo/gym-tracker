import { describe, expect, it } from "@jest/globals";
import { GOOGLE_DRIVE_BACKUP_CONTRACT_CASE_IDS, runGoogleDriveBackupContract } from "./googleDriveBackup.contract";

describe("google Drive backup contract", () => {
  it("keeps the host registry and fake-port matrix source-owned", async () => {
    const result = await runGoogleDriveBackupContract();
    expect(result.status).toBe("passed");
    expect(result.cases.map((entry) => entry.id)).toEqual(GOOGLE_DRIVE_BACKUP_CONTRACT_CASE_IDS);
  });
});
