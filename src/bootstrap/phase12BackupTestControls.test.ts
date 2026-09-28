import { expect, test } from "@jest/globals";
import { phase12BackupFixtureFromNativeContract } from "./phase12BackupTestControls";

test("Phase 12 controls reject production and unknown fixture activation", () => {
  expect(phase12BackupFixtureFromNativeContract({ suite: "production", fixture: "restore_required" })).toBeNull();
  expect(phase12BackupFixtureFromNativeContract({ suite: "phase12", fixture: "real-account" })).toBeNull();
  expect(phase12BackupFixtureFromNativeContract({ suite: "phase12", fixture: "restore_required" })).toBe("restore_required");
});
