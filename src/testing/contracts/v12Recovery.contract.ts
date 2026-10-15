export const V12_RECOVERY_CUT_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "pre-transaction", barrierId: "before-transaction", processState: "runtime-open", acknowledgement: "not-reached", connectivity: "online", firstAttempt: "not-started", provenance: "pre-writer-runtime-open" }),
  Object.freeze({ id: "in-transaction", barrierId: "writer-transaction-open", processState: "writer-open", acknowledgement: "not-reached", connectivity: "online", firstAttempt: "transaction-open", provenance: "in-writer-before-commit" }),
  Object.freeze({ id: "post-commit-before-ack", barrierId: "commit-durable-ack-pending", processState: "writer-open", acknowledgement: "pending", connectivity: "online", firstAttempt: "committed", provenance: "post-commit-command-pending" }),
  Object.freeze({ id: "post-acknowledgement", barrierId: "acknowledgement-observed", processState: "runtime-open", acknowledgement: "observed", connectivity: "online", firstAttempt: "acknowledged", provenance: "post-ack-command-returned" }),
  Object.freeze({ id: "relaunch", barrierId: "relaunch-runtime-open", processState: "relaunch-open", acknowledgement: "observed", connectivity: "online", firstAttempt: "acknowledged", provenance: "relaunch-new-runtime-open" }),
  Object.freeze({ id: "retry", barrierId: "first-attempt-failed", processState: "runtime-open", acknowledgement: "not-reached", connectivity: "online", firstAttempt: "failed", provenance: "retry-after-injected-failure" }),
  Object.freeze({ id: "offline", barrierId: "offline-toggle-before-commit", processState: "writer-open", acknowledgement: "not-reached", connectivity: "toggle-pending", firstAttempt: "transaction-open", provenance: "offline-active-writer-before-commit" }),
  Object.freeze({ id: "recovery", barrierId: "recovery-replay-writer-open", processState: "recovery-writer-open", acknowledgement: "primary-observed", connectivity: "online", firstAttempt: "replay-open", provenance: "recovery-reconciliation-before-commit" }),
] as const);

export const V12_RECOVERY_CUTS = Object.freeze(
  V12_RECOVERY_CUT_DEFINITIONS.map(({ id }) => id),
) as readonly (typeof V12_RECOVERY_CUT_DEFINITIONS)[number]["id"][];

export const V12_RECOVERY_UNCOMMITTED_CUTS = Object.freeze([
  "pre-transaction",
  "in-transaction",
  "retry",
  "offline",
] as const);

export const V12_RECOVERY_SCENARIOS = Object.freeze([
  Object.freeze({ id: "legacy-playback", steps: Object.freeze([
    Object.freeze({ id: "legacy-start", boundaryId: "start", operationId: "legacy-workout-start", receiptKind: "workout-start" }),
    Object.freeze({ id: "legacy-edit", boundaryId: "edit", operationId: "legacy-workout-edit", receiptKind: "workout-edit" }),
  ]) }),
  Object.freeze({ id: "foreground-reconciliation", steps: Object.freeze([
    Object.freeze({ id: "foreground-rest-reconcile", boundaryId: "rest", operationId: "foreground-rest-reconcile", receiptKind: "foreground-rest" }),
  ]) }),
  Object.freeze({ id: "queued-callback", steps: Object.freeze([
    Object.freeze({ id: "queued-set-commit", boundaryId: "commit", operationId: "queued-set-commit", receiptKind: "set-completion" }),
  ]) }),
  Object.freeze({ id: "relaunch", steps: Object.freeze([
    Object.freeze({ id: "relaunch-finish", boundaryId: "finish", operationId: "relaunch-workout-finish", receiptKind: "workout-finish" }),
  ]) }),
  Object.freeze({ id: "restore", steps: Object.freeze([
    Object.freeze({ id: "restore-commit", boundaryId: "restore", operationId: "secure-restore-commit", receiptKind: "secure-restore" }),
    Object.freeze({ id: "restore-import", boundaryId: "import", operationId: "restore-garmin-import", receiptKind: "garmin-import" }),
  ]) }),
  Object.freeze({ id: "merge", steps: Object.freeze([
    Object.freeze({ id: "merge-commit", boundaryId: "merge", operationId: "secure-merge-commit", receiptKind: "secure-merge" }),
    Object.freeze({ id: "merge-match", boundaryId: "match", operationId: "merge-activity-match", receiptKind: "activity-match" }),
  ]) }),
  Object.freeze({ id: "zero-cue", steps: Object.freeze([
    Object.freeze({ id: "zero-cue-start", boundaryId: "start", operationId: "zero-cue-workout-start", receiptKind: "workout-start" }),
    Object.freeze({ id: "zero-cue-edit", boundaryId: "edit", operationId: "zero-cue-workout-edit", receiptKind: "workout-edit" }),
    Object.freeze({ id: "zero-cue-finish", boundaryId: "finish", operationId: "zero-cue-workout-finish", receiptKind: "workout-finish" }),
  ]) }),
  Object.freeze({ id: "between-set-rest-pointer", steps: Object.freeze([
    Object.freeze({ id: "between-set-commit", boundaryId: "commit", operationId: "between-set-commit", receiptKind: "set-completion" }),
    Object.freeze({ id: "between-set-rest", boundaryId: "rest", operationId: "between-set-rest-transition", receiptKind: "rest-transition" }),
  ]) }),
] as const);

export type V12RecoveryScenarioStep = (typeof V12_RECOVERY_SCENARIOS)[number]["steps"][number];
export const V12_RECOVERY_STEPS = Object.freeze(
  V12_RECOVERY_SCENARIOS.reduce<V12RecoveryScenarioStep[]>(
    (all, scenario) => [...all, ...scenario.steps],
    [],
  ),
);

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
  receiptKinds: readonly string[];
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
  stepId: string;
  cutId: (typeof V12_RECOVERY_CUTS)[number] | string;
  operationId: string;
  boundaryId: string;
  receiptKind: string;
  barrierId: string;
  barrierProvenance: string;
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
    step: V12RecoveryScenarioStep,
    cut: (typeof V12_RECOVERY_CUTS)[number],
  ): Promise<V12RecoveryContractObservation>;
}>;

const SHA256 = /^[a-f0-9]{64}$/u;
const UNCOMMITTED = new Set<string>(V12_RECOVERY_UNCOMMITTED_CUTS);
const COMMITTED = new Set<string>(["post-commit-before-ack", "post-acknowledgement", "relaunch"]);

function validSnapshot(value: V12RecoveryContractSnapshot): boolean {
  return [value.sourceCount, value.receiptCount, value.effectCount, value.pointerCount,
    value.restCount, value.historyCount, value.timingCount, value.restoreCount,
    value.mergeReceiptCount, value.cueCount]
    .every((count) => Number.isSafeInteger(count) && count >= 0)
    && [value.sourceDigest, value.receiptDigest, value.effectDigest,
      value.pointerDigest, value.restDigest, value.historyDigest,
      value.timingDigest, value.restoreDigest, value.mergeReceiptDigest,
      value.cueDigest].every((digest) => SHA256.test(digest))
    && Array.isArray(value.receiptKinds)
    && value.receiptKinds.every((kind) => /^[a-z0-9-]{3,40}$/u.test(kind));
}

function sameSnapshot(left: V12RecoveryContractSnapshot, right: V12RecoveryContractSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function observationPassed(
  observation: V12RecoveryContractObservation,
  caseId: string,
  stepId: string,
  cutId: string,
): boolean {
  const scenario = V12_RECOVERY_SCENARIOS.find(({ id }) => id === caseId);
  const step = scenario?.steps.find(({ id }) => id === stepId);
  const cut = V12_RECOVERY_CUT_DEFINITIONS.find(({ id }) => id === cutId);
  if (scenario === undefined || step === undefined || cut === undefined
    || observation.caseId !== caseId || observation.cutId !== cutId
    || observation.stepId !== step.id
    || observation.operationId !== step.operationId
    || observation.boundaryId !== step.boundaryId
    || observation.receiptKind !== step.receiptKind
    || observation.barrierId !== cut.barrierId
    || observation.barrierProvenance !== cut.provenance
    || observation.firstAttempt !== cut.firstAttempt
    || !validSnapshot(observation.before)
    || !validSnapshot(observation.afterCut)
    || !validSnapshot(observation.afterReopen)
    || !validSnapshot(observation.afterRecovery)
    || !validSnapshot(observation.afterRetry)) {
    return false;
  }
  const expectedReopen = UNCOMMITTED.has(cutId) ? observation.before : observation.afterCut;
  const stepReceipts = observation.afterRetry.receiptKinds.filter((kind) => kind === step.receiptKind);
  return sameSnapshot(observation.afterReopen, expectedReopen)
    && (cutId === "recovery"
      ? observation.recoveryCode !== "not-required"
      : observation.recoveryCode === "not-required"
        && sameSnapshot(observation.afterRecovery, observation.afterReopen))
    && /^[a-z0-9-]{3,60}$/u.test(observation.retryCode)
    && SHA256.test(observation.receiptDigest)
    && observation.afterRetry.cueCount === 0
    && observation.afterRetry.restoreCount === 1
    && stepReceipts.length === 1
    && (UNCOMMITTED.has(cutId)
      ? observation.afterRetry.receiptCount === observation.before.receiptCount + 1
      : COMMITTED.has(cutId)
        ? sameSnapshot(observation.afterRetry, observation.afterReopen)
        : observation.afterRetry.receiptCount === observation.afterReopen.receiptCount);
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
    for (const step of definition.steps) {
      for (const cut of definition.cuts) {
        try {
          const observation = await adapter.observe(definition, step, cut);
          const passed = observationPassed(observation, definition.id, step.id, cut)
          && !receipts.has(observation.receiptDigest);
          receipts.add(observation.receiptDigest);
          cuts.push(Object.freeze({
            id: `${step.id}:${cut}`,
            status: passed ? "passed" : "failed",
            digest: SHA256.test(observation.receiptDigest)
              ? observation.receiptDigest
              : "0".repeat(64),
          }));
        } catch {
          cuts.push(Object.freeze({
            id: `${step.id}:${cut}`,
            status: "failed",
            digest: "0".repeat(64),
          }));
        }
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
