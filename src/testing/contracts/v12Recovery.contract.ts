export const V12_RECOVERY_CUT_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "pre-transaction", barrierId: "before-transaction", processState: "route-open", acknowledgement: "not-reached", connectivity: "online", firstAttempt: "not-started" }),
  Object.freeze({ id: "in-transaction", barrierId: "writer-transaction-open", processState: "writer-open", acknowledgement: "not-reached", connectivity: "online", firstAttempt: "transaction-open" }),
  Object.freeze({ id: "post-commit-before-ack", barrierId: "commit-durable-ack-pending", processState: "writer-open", acknowledgement: "lost", connectivity: "online", firstAttempt: "committed-ack-lost" }),
  Object.freeze({ id: "post-acknowledgement", barrierId: "acknowledgement-observed", processState: "route-open", acknowledgement: "observed", connectivity: "online", firstAttempt: "acknowledged" }),
  Object.freeze({ id: "relaunch", barrierId: "replay-process-open", processState: "replay-open", acknowledgement: "observed", connectivity: "online", firstAttempt: "acknowledged" }),
  Object.freeze({ id: "retry", barrierId: "first-attempt-failed", processState: "route-open", acknowledgement: "not-reached", connectivity: "online", firstAttempt: "failed" }),
  Object.freeze({ id: "offline", barrierId: "post-boundary-offline", processState: "route-open", acknowledgement: "observed", connectivity: "switch-offline", firstAttempt: "acknowledged" }),
  Object.freeze({ id: "recovery", barrierId: "domain-reconciliation-pending", processState: "recovery-open", acknowledgement: "observed", connectivity: "online", firstAttempt: "acknowledged" }),
] as const);

export const V12_RECOVERY_CUTS = Object.freeze(
  V12_RECOVERY_CUT_DEFINITIONS.map(({ id }) => id),
) as readonly (typeof V12_RECOVERY_CUT_DEFINITIONS)[number]["id"][];

export const V12_RECOVERY_SCENARIOS = Object.freeze([
  Object.freeze({ id: "legacy-playback", operationId: "tim01-legacy-playback", boundaryIds: Object.freeze(["start", "edit"] as const) }),
  Object.freeze({ id: "foreground-reconciliation", operationId: "tim01-foreground-reconciliation", boundaryIds: Object.freeze(["rest"] as const) }),
  Object.freeze({ id: "queued-callback", operationId: "tim01-queued-callback", boundaryIds: Object.freeze(["commit"] as const) }),
  Object.freeze({ id: "relaunch", operationId: "workout-relaunch-replay", boundaryIds: Object.freeze(["finish"] as const) }),
  Object.freeze({ id: "restore", operationId: "secure-restore", boundaryIds: Object.freeze(["restore", "import"] as const) }),
  Object.freeze({ id: "merge", operationId: "secure-merge", boundaryIds: Object.freeze(["merge", "match"] as const) }),
  Object.freeze({ id: "zero-cue", operationId: "tim01-zero-cue", boundaryIds: Object.freeze(["start", "edit", "finish"] as const) }),
  Object.freeze({ id: "between-set-rest-pointer", operationId: "workout-rest-set-pointer", boundaryIds: Object.freeze(["commit", "rest"] as const) }),
] as const);

export const V12_RECOVERY_CASES = V12_RECOVERY_SCENARIOS.map((scenario) => (
  Object.freeze({ ...scenario, cuts: V12_RECOVERY_CUTS })
));

export type V12RecoveryContractSnapshot = Readonly<{
  sourceCount: number;
  receiptCount: number;
  effectCount: number;
  pointerCount: number;
  restCount: number;
  historyCount: number;
  timingCount: number;
  restoreCount: number;
  mergeReceiptCount: number;
  cueCount: number;
  sourceDigest: string;
  receiptDigest: string;
  effectDigest: string;
  pointerDigest: string;
  restDigest: string;
  historyDigest: string;
  timingDigest: string;
  restoreDigest: string;
  mergeReceiptDigest: string;
  cueDigest: string;
}>;

export type V12RecoveryContractObservation = Readonly<{
  caseId: string;
  cutId: (typeof V12_RECOVERY_CUTS)[number] | string;
  operationId: string;
  boundaryIds: readonly string[];
  barrierId: string;
  firstAttempt: string;
  before: V12RecoveryContractSnapshot;
  afterCut: V12RecoveryContractSnapshot;
  afterReopen: V12RecoveryContractSnapshot;
  recoveryCode: string;
  afterRecovery: V12RecoveryContractSnapshot;
  retryCode: string;
  afterRetry: V12RecoveryContractSnapshot;
  receiptDigest: string;
}>;

export type V12RecoveryContractAdapter = Readonly<{
  observe(
    definition: (typeof V12_RECOVERY_CASES)[number],
    cut: (typeof V12_RECOVERY_CUTS)[number],
  ): Promise<V12RecoveryContractObservation>;
}>;

const SHA256 = /^[a-f0-9]{64}$/u;
const UNCOMMITTED = new Set<string>(["pre-transaction", "in-transaction", "retry"]);

function validSnapshot(value: V12RecoveryContractSnapshot): boolean {
  return [value.sourceCount, value.receiptCount, value.effectCount, value.pointerCount,
    value.restCount, value.historyCount, value.timingCount, value.restoreCount,
    value.mergeReceiptCount, value.cueCount]
    .every((count) => Number.isSafeInteger(count) && count >= 0)
    && [value.sourceDigest, value.receiptDigest, value.effectDigest,
      value.pointerDigest, value.restDigest, value.historyDigest,
      value.timingDigest, value.restoreDigest, value.mergeReceiptDigest,
      value.cueDigest].every((digest) => SHA256.test(digest));
}

function sameSnapshot(left: V12RecoveryContractSnapshot, right: V12RecoveryContractSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function observationPassed(
  observation: V12RecoveryContractObservation,
  caseId: string,
  cutId: string,
): boolean {
  const scenario = V12_RECOVERY_SCENARIOS.find(({ id }) => id === caseId);
  const cut = V12_RECOVERY_CUT_DEFINITIONS.find(({ id }) => id === cutId);
  if (scenario === undefined || cut === undefined
    || observation.caseId !== caseId || observation.cutId !== cutId
    || observation.operationId !== scenario.operationId
    || JSON.stringify(observation.boundaryIds) !== JSON.stringify(scenario.boundaryIds)
    || observation.barrierId !== cut.barrierId
    || observation.firstAttempt !== cut.firstAttempt
    || !validSnapshot(observation.before)
    || !validSnapshot(observation.afterCut)
    || !validSnapshot(observation.afterReopen)
    || !validSnapshot(observation.afterRecovery)
    || !validSnapshot(observation.afterRetry)) {
    return false;
  }
  const expectedReopen = UNCOMMITTED.has(cutId) ? observation.before : observation.afterCut;
  return sameSnapshot(observation.afterReopen, expectedReopen)
    && (cutId === "recovery"
      ? observation.recoveryCode !== "not-required"
      : observation.recoveryCode === "not-required"
        && sameSnapshot(observation.afterRecovery, observation.afterReopen))
    && /^[a-z0-9-]{3,60}$/u.test(observation.retryCode)
    && SHA256.test(observation.receiptDigest)
    && observation.afterRetry.cueCount === 0
    && observation.afterRetry.restoreCount === 1
    && (UNCOMMITTED.has(cutId)
      ? !sameSnapshot(observation.afterRetry, observation.before)
      : true);
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
  const receipts = new Set<string>();
  for (const definition of V12_RECOVERY_CASES) {
    const cuts = [] as Array<Readonly<{
      id: string;
      status: "passed" | "failed";
      digest: string;
    }>>;
    for (const cut of definition.cuts) {
      try {
        const observation = await adapter.observe(definition, cut);
        const passed = observationPassed(observation, definition.id, cut)
          && !receipts.has(observation.receiptDigest);
        receipts.add(observation.receiptDigest);
        cuts.push(Object.freeze({
          id: cut,
          status: passed ? "passed" : "failed",
          digest: SHA256.test(observation.receiptDigest)
            ? observation.receiptDigest
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
