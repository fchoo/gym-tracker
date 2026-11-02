import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  PHASE14_RECOVERY_FIXTURE,
  createPhase14RecoveryFixtureRestoreFilePort,
  phase14RecoveryFixtureFromNativeContract,
} from "./phase14RecoveryFixture";

describe("Phase 14 recovery fixture", () => {
  it("enables only for the embedded Phase 14 development-test contract", () => {
    expect(phase14RecoveryFixtureFromNativeContract({
      nativeContractsEnabled: true,
      buildProfile: "development-test",
      suite: "phase14",
    })).toBe(PHASE14_RECOVERY_FIXTURE);

    for (const input of [
      { nativeContractsEnabled: false, buildProfile: "development-test", suite: "phase14" },
      { nativeContractsEnabled: true, buildProfile: "production", suite: "phase14" },
      { nativeContractsEnabled: true, buildProfile: "development-test", suite: "phase11" },
      { nativeContractsEnabled: true, buildProfile: "development-test", suite: "phase12" },
      { nativeContractsEnabled: true, buildProfile: "development-test", suite: undefined },
    ]) {
      expect(phase14RecoveryFixtureFromNativeContract(input)).toBeNull();
    }
  });

  it("is a fixed privacy-safe cancellation fixture with no persistent data authority", async () => {
    expect(PHASE14_RECOVERY_FIXTURE).toEqual({
      id: "phase14-recovery-cancel-v1",
      outcome: "cancelled",
    });
    expect(Object.isFrozen(PHASE14_RECOVERY_FIXTURE)).toBe(true);
    expect(JSON.stringify(PHASE14_RECOVERY_FIXTURE)).not.toMatch(/@|\/|password|token|archive|path|user|account/iu);

    const port = createPhase14RecoveryFixtureRestoreFilePort();
    await expect(port.readSelectedArchiveAtMost(1)).resolves.toBeNull();
    await expect(port.readSelectedArchiveAtMost(Number.MAX_SAFE_INTEGER)).resolves.toBeNull();
    expect("writeArchive" in port).toBe(false);
    expect("deleteArchive" in port).toBe(false);
    expect(Object.isFrozen(port)).toBe(true);
  });
});
