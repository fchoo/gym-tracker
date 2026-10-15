import {
  V12_RECOVERY_CASES,
  V12_RECOVERY_CUT_DEFINITIONS,
  V12_RECOVERY_CUTS,
  V12_RECOVERY_SCENARIOS,
} from "./contracts/v12Recovery.contract";

const RESULT_PREFIX = "GYM_TRACKER_V12_DOMAIN_RESULT:";
const PROGRESS_PREFIX = "GYM_TRACKER_V12_DOMAIN_PROGRESS:";
const HASH = /^[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{32}$/u;
const caseIds = new Set<string>(V12_RECOVERY_CASES.map(({ id }) => id));
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
  restore_count: number;
  merge_receipt_count: number;
  cue_count: number;
  source_sha256: string;
  receipt_sha256: string;
  effect_sha256: string;
  pointer_sha256: string;
  rest_sha256: string;
  history_sha256: string;
  timing_sha256: string;
  restore_sha256: string;
  merge_receipt_sha256: string;
  cue_sha256: string;
  effect_facts: readonly Readonly<{
    effect_sha256: string;
    type: "reconcile_rest_notification" | "regenerate_load_reps_recommendation";
    subject_sha256: string;
    expected_revision: number;
    status: "pending" | "processing" | "completed" | "superseded" | "permanent_failure";
    attempt_count: number;
    next_attempt_at_ms: number;
    last_error_code: string | null;
  }>[];
  pointer_facts: readonly Readonly<{
    session_sha256: string;
    status: string;
    revision: number;
    active_exercise_sha256: string | null;
    active_set_sha256: string | null;
    committed_set_sha256: string | null;
  }>[];
  rest_facts: readonly Readonly<{
    session_sha256: string;
    status: "idle" | "running" | "paused" | "expired";
    revision: number;
    started_at_ms: number | null;
    ends_at_ms: number | null;
    deadline_at_ms: number | null;
    paused_remaining_ms: number | null;
    expired_at_ms: number | null;
    next_set_sha256: string | null;
  }>[];
  timing_facts: readonly Readonly<{
    session_sha256: string;
    set_sha256: string | null;
    state_version: number;
    revision: number;
    status: "idle" | "running" | "paused" | "stopped" | "expired";
    mode: "per_rep" | "cluster" | null;
    configuration: Readonly<Record<string, unknown>>;
    progress: Readonly<Record<string, unknown>>;
    started_at_ms: number | null;
    next_boundary_at_ms: number | null;
    remaining_ms: number | null;
    stopped_at_ms: number | null;
  }>[];
  history_facts: readonly Readonly<{
    event_sha256: string;
    session_sha256: string;
    effective_revision: number;
    event_type: "correction" | "void" | "restore";
    field_identity: string;
    before_sha256: string;
    after_sha256: string;
    occurred_at_ms: number;
  }>[];
  restore_facts: readonly Readonly<{
    state: "ready" | "rebuild_pending";
    updated_at_ms: number;
  }>[];
  merge_receipt_facts: readonly Readonly<{
    table: "workout_receipts" | "imported_activity_receipts" | "running_activity_match_receipts" | "metric_profile_migration_events";
    receipt_sha256: string;
    request_sha256: string;
    idempotency_sha256: string;
    committed_at_ms: number;
    result: string;
  }>[];
}>;

export type V12RecoveryNativeObservation = Readonly<{
  operation_id: string;
  boundary_ids: readonly string[];
  after_reopen: V12RecoveryDurableSnapshot;
  recovery_code: string;
  after_recovery: V12RecoveryDurableSnapshot;
  retry_code: string;
  after_retry: V12RecoveryDurableSnapshot;
}>;

export type V12RecoveryExecutionIdentity = Readonly<{
  nonce: string;
  caseId: string;
  cutId: string;
  signal: Readonly<{ aborted: boolean }>;
  progress(value: V12RecoveryArmProgress): void;
}>;

export type V12RecoveryArmProgress = Readonly<{
  barrier_id: string;
  process_state: string;
  acknowledgement: string;
  connectivity: string;
  first_attempt: string;
  first_attempt_code: string;
  before: V12RecoveryDurableSnapshot;
  after_cut: V12RecoveryDurableSnapshot;
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
    "rest_count", "history_count", "timing_count", "restore_count",
    "merge_receipt_count", "cue_count", "source_sha256", "receipt_sha256",
    "effect_sha256", "pointer_sha256", "rest_sha256", "history_sha256",
    "timing_sha256", "restore_sha256", "merge_receipt_sha256", "cue_sha256",
    "effect_facts", "pointer_facts", "rest_facts", "timing_facts",
    "history_facts", "restore_facts", "merge_receipt_facts",
  ])) {
    return false;
  }
  return [
    value.source_count, value.receipt_count, value.effect_count,
    value.pointer_count, value.rest_count, value.history_count,
    value.timing_count, value.restore_count, value.merge_receipt_count,
    value.cue_count,
  ].every((count) => Number.isSafeInteger(count) && (count as number) >= 0)
    && [
      value.source_sha256, value.receipt_sha256, value.effect_sha256,
      value.pointer_sha256, value.rest_sha256, value.history_sha256,
      value.timing_sha256, value.restore_sha256, value.merge_receipt_sha256,
      value.cue_sha256,
    ].every((digest) => typeof digest === "string" && HASH.test(digest))
    && Array.isArray(value.effect_facts)
    && Array.isArray(value.pointer_facts)
    && Array.isArray(value.rest_facts)
    && Array.isArray(value.timing_facts)
    && Array.isArray(value.history_facts)
    && Array.isArray(value.restore_facts)
    && Array.isArray(value.merge_receipt_facts)
    && value.effect_facts.length === value.effect_count
    && value.pointer_facts.length === value.pointer_count
    && value.rest_facts.length === value.rest_count
    && value.timing_facts.length === value.timing_count
    && value.history_facts.length === value.history_count
    && value.restore_facts.length === value.restore_count
    && value.merge_receipt_facts.length === value.merge_receipt_count;
}

function validObservation(
  value: unknown,
): value is V12RecoveryNativeObservation {
  return isObject(value)
    && exactKeys(value, [
      "operation_id", "boundary_ids", "after_reopen", "recovery_code",
      "after_recovery", "retry_code", "after_retry",
    ])
    && typeof value.operation_id === "string"
    && /^[a-z0-9-]{3,60}$/u.test(value.operation_id)
    && Array.isArray(value.boundary_ids)
    && value.boundary_ids.length > 0
    && value.boundary_ids.every((boundary) => typeof boundary === "string" && /^[a-z0-9-]{3,60}$/u.test(boundary))
    && typeof value.recovery_code === "string"
    && /^[a-z0-9-]{3,60}$/u.test(value.recovery_code)
    && typeof value.retry_code === "string"
    && /^[a-z0-9-]{3,60}$/u.test(value.retry_code)
    && validSnapshot(value.after_reopen)
    && validSnapshot(value.after_recovery)
    && validSnapshot(value.after_retry);
}

function active(signal: Readonly<{ aborted: boolean }>): void {
  if (signal.aborted) {
    throw new Error("v12_recovery_cancelled");
  }
}

function validArmProgress(
  value: V12RecoveryArmProgress,
  caseId: string,
  cutId: string,
): boolean {
  const cut = V12_RECOVERY_CUT_DEFINITIONS.find(({ id }) => id === cutId);
  const scenario = V12_RECOVERY_SCENARIOS.find(({ id }) => id === caseId);
  return cut !== undefined && scenario !== undefined
    && exactKeys(value as unknown as Record<string, unknown>, [
      "barrier_id", "process_state", "acknowledgement", "connectivity",
      "first_attempt", "first_attempt_code", "before", "after_cut",
    ])
    && value.barrier_id === cut.barrierId
    && value.process_state === cut.processState
    && value.acknowledgement === cut.acknowledgement
    && value.connectivity === cut.connectivity
    && value.first_attempt === cut.firstAttempt
    && /^[a-z0-9-]{3,60}$/u.test(value.first_attempt_code)
    && validSnapshot(value.before)
    && validSnapshot(value.after_cut);
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
    progress: (value) => {
      const caseId = input.identity.caseId as string;
      const cutId = input.identity.cutId as string;
      if (!validArmProgress(value, caseId, cutId)) {
        throw new Error("v12_recovery_progress_invalid");
      }
      const scenario = V12_RECOVERY_SCENARIOS.find(({ id }) => id === caseId)!;
      input.emit(`${PROGRESS_PREFIX}${JSON.stringify({
        schema_version: 2,
        nonce: input.identity.nonce,
        sequence: 1,
        kind: "ARMED",
        case_id: caseId,
        cut_id: cutId,
        operation_id: scenario.operationId,
        boundary_ids: scenario.boundaryIds,
        ...value,
      })}`);
    },
  });
  const executor = input.executor ?? nativeExecutor();
  if (input.phase === "arm") {
    await executor.arm(executionIdentity);
    active(input.signal);
    return "armed";
  }

  const observation = await executor.recover(executionIdentity);
  active(input.signal);
  if (!validObservation(observation)) {
    throw new Error("v12_recovery_observation_invalid");
  }
  await executor.cleanup(executionIdentity);
  active(input.signal);
  input.emit(`${RESULT_PREFIX}${JSON.stringify({
    schema_version: 2,
    nonce: executionIdentity.nonce,
    kind: "recovery",
    case_id: executionIdentity.caseId,
    cut_id: executionIdentity.cutId,
    ...observation,
  })}`);
  return "observed";
}
