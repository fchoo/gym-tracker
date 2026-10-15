export const V12_RECOVERY_CUTS = [
  "pre-transaction", "in-transaction", "post-commit-before-ack",
  "post-acknowledgement", "relaunch", "retry", "offline", "recovery",
] as const;

export const V12_RECOVERY_CASES = [
  "legacy-playback", "foreground-reconciliation", "queued-callback", "relaunch",
  "restore", "merge", "zero-cue", "between-set-rest-pointer",
].map((id) => Object.freeze({ id, cuts: V12_RECOVERY_CUTS })) as readonly Readonly<{
  id: string;
  cuts: typeof V12_RECOVERY_CUTS;
}>[];

export type V12RecoveryContractSnapshot = Readonly<{
  sourceCount: number;
  receiptCount: number;
  sourceDigest: string;
  receiptDigest: string;
}>;

export type V12RecoveryContractObservation = Readonly<{
  caseId: string;
  cutId: (typeof V12_RECOVERY_CUTS)[number] | string;
  afterReopen: V12RecoveryContractSnapshot;
  afterRetry: V12RecoveryContractSnapshot;
}>;

export type V12RecoveryContractAdapter = Readonly<{
  observe(
    definition: (typeof V12_RECOVERY_CASES)[number],
    cut: (typeof V12_RECOVERY_CUTS)[number],
  ): Promise<V12RecoveryContractObservation>;
}>;

const SHA256 = /^[a-f0-9]{64}$/u;
const UNCOMMITTED = new Set<string>(["pre-transaction", "in-transaction"]);

function validSnapshot(value: V12RecoveryContractSnapshot): boolean {
  return Number.isSafeInteger(value.sourceCount) && value.sourceCount >= 0
    && Number.isSafeInteger(value.receiptCount) && value.receiptCount >= 0
    && SHA256.test(value.sourceDigest)
    && SHA256.test(value.receiptDigest);
}

function observationPassed(
  observation: V12RecoveryContractObservation,
  caseId: string,
  cutId: string,
): boolean {
  if (observation.caseId !== caseId || observation.cutId !== cutId
    || !validSnapshot(observation.afterReopen)
    || !validSnapshot(observation.afterRetry)) {
    return false;
  }
  const firstCount = UNCOMMITTED.has(cutId) ? 0 : 1;
  if (observation.afterReopen.sourceCount !== firstCount
    || observation.afterReopen.receiptCount !== firstCount
    || observation.afterRetry.sourceCount !== 1
    || observation.afterRetry.receiptCount !== 1) {
    return false;
  }
  return UNCOMMITTED.has(cutId)
    ? observation.afterReopen.sourceDigest !== observation.afterRetry.sourceDigest
      && observation.afterReopen.receiptDigest !== observation.afterRetry.receiptDigest
    : observation.afterReopen.sourceDigest === observation.afterRetry.sourceDigest
      && observation.afterReopen.receiptDigest === observation.afterRetry.receiptDigest;
}

export async function runV12RecoveryContract(
  adapter: V12RecoveryContractAdapter,
) {
  const cases = [] as Array<Readonly<{
    id: string;
    cuts: readonly Readonly<{
      id: string;
      status: "passed" | "failed";
      digest: string;
    }>[];
  }>>;
  for (const definition of V12_RECOVERY_CASES) {
    const cuts = [] as Array<Readonly<{
      id: string;
      status: "passed" | "failed";
      digest: string;
    }>>;
    for (const cut of definition.cuts) {
      try {
        const observation = await adapter.observe(definition, cut);
        const passed = observationPassed(observation, definition.id, cut);
        cuts.push(Object.freeze({
          id: cut,
          status: passed ? "passed" : "failed",
          digest: SHA256.test(observation.afterRetry?.receiptDigest)
            ? observation.afterRetry.receiptDigest
            : "0".repeat(64),
        }));
      } catch {
        cuts.push(Object.freeze({
          id: cut,
          status: "failed",
          digest: "0".repeat(64),
        }));
      }
    }
    cases.push(Object.freeze({ id: definition.id, cuts: Object.freeze(cuts) }));
  }
  const observations = cases.flatMap(({ cuts }) => cuts);
  const passed = observations.filter(({ status }) => status === "passed").length;
  return Object.freeze({
    schemaVersion: 1,
    contractVersion: 2,
    status: passed === observations.length ? "passed" as const : "failed" as const,
    total: observations.length,
    passed,
    failed: observations.length - passed,
    skipped: 0 as const,
    cases: Object.freeze(cases),
  });
}
