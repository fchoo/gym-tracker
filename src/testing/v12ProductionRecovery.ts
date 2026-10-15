import {
  V12_RECOVERY_CASES,
  V12_RECOVERY_CUTS,
} from "./contracts/v12Recovery.contract";

const RESULT_PREFIX = "GYM_TRACKER_V12_DOMAIN_RESULT:";
const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const caseIds = new Set(V12_RECOVERY_CASES.map(({ id }) => id));
const cutIds = new Set<string>(V12_RECOVERY_CUTS);

export type V12ProductionRecoveryIdentity = Readonly<{
  packageName?: unknown;
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  nonce?: unknown;
  caseId?: unknown;
  cutId?: unknown;
}>;

export type V12RecoveryDurableSnapshot = Readonly<{
  source_count: number;
  receipt_count: number;
  effect_count: number;
  pointer_count: number;
  rest_count: number;
  history_count: number;
  timing_count: number;
  source_sha256: string;
  receipt_sha256: string;
  effect_sha256: string;
  pointer_sha256: string;
  rest_sha256: string;
  history_sha256: string;
  timing_sha256: string;
}>;

export type V12RecoveryNativeObservation = Readonly<{
  operation_id: string;
  after_reopen: V12RecoveryDurableSnapshot;
  retry_code: string;
  after_retry: V12RecoveryDurableSnapshot;
}>;

export type V12RecoveryExecutionIdentity = Readonly<{
  nonce: string;
  caseId: string;
  cutId: string;
  signal: Readonly<{ aborted: boolean }>;
}>;

export type V12ProductionRecoveryExecutor = Readonly<{
  arm(input: V12RecoveryExecutionIdentity): Promise<void>;
  recover(input: V12RecoveryExecutionIdentity): Promise<V12RecoveryNativeObservation>;
  cleanup(input: V12RecoveryExecutionIdentity): Promise<void>;
}>;

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validSnapshot(value: unknown): value is V12RecoveryDurableSnapshot {
  if (!isObject(value) || !exactKeys(value, [
    "source_count", "receipt_count", "effect_count", "pointer_count",
    "rest_count", "history_count", "timing_count", "source_sha256", "receipt_sha256",
    "effect_sha256", "pointer_sha256", "rest_sha256", "history_sha256",
    "timing_sha256",
  ])) {
    return false;
  }
  return [
    value.source_count, value.receipt_count, value.effect_count,
    value.pointer_count, value.rest_count, value.history_count,
    value.timing_count,
  ].every((count) => Number.isSafeInteger(count) && (count as number) >= 0)
    && [
      value.source_sha256, value.receipt_sha256, value.effect_sha256,
      value.pointer_sha256, value.rest_sha256, value.history_sha256,
      value.timing_sha256,
    ].every((digest) => typeof digest === "string" && HASH.test(digest));
}

function validObservation(
  value: unknown,
): value is V12RecoveryNativeObservation {
  return isObject(value)
    && exactKeys(value, [
      "operation_id", "after_reopen", "retry_code", "after_retry",
    ])
    && typeof value.operation_id === "string"
    && /^[a-z0-9-]{3,60}$/u.test(value.operation_id)
    && typeof value.retry_code === "string"
    && /^[a-z0-9-]{3,60}$/u.test(value.retry_code)
    && validSnapshot(value.after_reopen)
    && validSnapshot(value.after_retry);
}

function active(signal: Readonly<{ aborted: boolean }>): void {
  if (signal.aborted) {
    throw new Error("v12_recovery_cancelled");
  }
}

export function v12ProductionRecoveryEnabled(
  value: V12ProductionRecoveryIdentity,
): boolean {
  return value.packageName === "com.fchoo.gymtracker.devtest"
    && value.buildProfile === "development-test"
    && value.nativeContractsEnabled === true
    && value.suite === "v1.2-acceptance"
    && typeof value.nonce === "string"
    && NONCE.test(value.nonce)
    && typeof value.caseId === "string"
    && caseIds.has(value.caseId)
    && typeof value.cutId === "string"
    && cutIds.has(value.cutId);
}

function nativeExecutor(): V12ProductionRecoveryExecutor {
  const {
    createV12ProductionRecoveryNativeExecutor,
  } = require("./v12ProductionRecoveryNative") as typeof import("./v12ProductionRecoveryNative");
  return createV12ProductionRecoveryNativeExecutor();
}

export async function collectV12ProductionRecoveryPhase(input: Readonly<{
  identity: V12ProductionRecoveryIdentity;
  phase: "arm" | "recover";
  emit(line: string): void;
  signal: Readonly<{ aborted: boolean }>;
  executor?: V12ProductionRecoveryExecutor;
}>): Promise<"armed" | "observed"> {
  if (!v12ProductionRecoveryEnabled(input.identity)) {
    throw new Error("v12_recovery_disabled");
  }
  active(input.signal);
  const executionIdentity: V12RecoveryExecutionIdentity = Object.freeze({
    nonce: input.identity.nonce as string,
    caseId: input.identity.caseId as string,
    cutId: input.identity.cutId as string,
    signal: input.signal,
  });
  const executor = input.executor ?? nativeExecutor();
  if (input.phase === "arm") {
    await executor.arm(executionIdentity);
    active(input.signal);
    return "armed";
  }

  const observation = await executor.recover(executionIdentity);
  try {
    active(input.signal);
    if (!validObservation(observation)) {
      throw new Error("v12_recovery_observation_invalid");
    }
    input.emit(`${RESULT_PREFIX}${JSON.stringify({
      schema_version: 1,
      nonce: executionIdentity.nonce,
      kind: "recovery",
      case_id: executionIdentity.caseId,
      cut_id: executionIdentity.cutId,
      ...observation,
    })}`);
    return "observed";
  } finally {
    await executor.cleanup(executionIdentity);
  }
}
