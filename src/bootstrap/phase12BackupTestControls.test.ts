import { expect, test } from "@jest/globals";
import { phase12BackupFixtureFromNativeContract } from "./phase12BackupTestControls";

test("Phase 12 controls reject production and unknown fixture activation", () => {
  expect(phase12BackupFixtureFromNativeContract({ suite: "phase12", fixture: "restore_required", nativeContractsEnabled: false, buildProfile: "production" })).toBeNull();
  expect(phase12BackupFixtureFromNativeContract({ suite: "production", fixture: "restore_required", nativeContractsEnabled: true, buildProfile: "development-test" })).toBeNull();
  expect(phase12BackupFixtureFromNativeContract({ suite: "phase12", fixture: "real-account", nativeContractsEnabled: true, buildProfile: "development-test" })).toBeNull();
  expect(phase12BackupFixtureFromNativeContract({ suite: "phase12", fixture: "restore_required", nativeContractsEnabled: true, buildProfile: "development-test" })).toBe("restore_required");
});
