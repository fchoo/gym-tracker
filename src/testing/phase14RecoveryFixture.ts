type Phase14RecoveryFixtureContract = Readonly<{
  nativeContractsEnabled?: boolean;
  buildProfile?: string | undefined;
  suite?: string | undefined;
}>;

/**
 * A native-evidence-only cancellation path. It never supplies archive bytes,
 * opens a picker, or exposes a mutation-capable handle.
 */
export const PHASE14_RECOVERY_FIXTURE = Object.freeze({
  id: "phase14-recovery-cancel-v1",
  outcome: "cancelled" as const,
});

export function phase14RecoveryFixtureFromNativeContract(
  contract: Phase14RecoveryFixtureContract,
): typeof PHASE14_RECOVERY_FIXTURE | null {
  if (
    contract.nativeContractsEnabled !== true
    || contract.buildProfile !== "development-test"
    || contract.suite !== "phase14"
  ) {
    return null;
  }
  return PHASE14_RECOVERY_FIXTURE;
}

/**
 * The read-only shape deliberately matches the production restore-file port,
 * while deterministically reporting picker cancellation without holding data.
 */
export function createPhase14RecoveryFixtureRestoreFilePort(): Readonly<{
  readSelectedArchiveAtMost(maxBytes: number): Promise<Uint8Array | null>;
}> {
  return Object.freeze({
    async readSelectedArchiveAtMost(_maxBytes: number) {
      return null;
    },
  });
}
