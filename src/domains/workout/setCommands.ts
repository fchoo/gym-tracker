import type {
  ActiveWorkoutRepository,
  AddWorkingSetInput,
  AddWarmupInput,
  CompleteSetInput,
  CompleteSetResult,
  CompleteWarmupInput,
  CopyPreviousWarmupInput,
  RemoveSetResult,
  RemoveWarmupInput,
  RemoveWorkingSetInput,
  ReviseCompletedSetInput,
  SetObservation,
  SkipWorkingSetInput,
  SkipWarmupInput,
  UpdateActiveSetDraftInput,
  UpdateWarmupDraftInput,
} from "./activeWorkout";
import {
  parseMetricObservation,
  type MetricIdentity,
} from "../metrics";
import type {
  HapticsPort,
} from "./hapticsPort";

const IDENTIFIER_MAX_LENGTH = 128;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function validIdentifier(value: string): boolean {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && [...value].length <= IDENTIFIER_MAX_LENGTH;
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateRemoveInput(
  input: RemoveWarmupInput | RemoveWorkingSetInput,
): void {
  if (!validIdentifier(input.requestId)
    || !validIdentifier(input.sessionId)
    || !validIdentifier(input.setId)) {
    throw new TypeError("remove_set_identifier_invalid");
  }
  if (!SHA256_PATTERN.test(input.requestSha256)) {
    throw new TypeError("remove_set_hash_invalid");
  }
  if (!validRevision(input.expectedSessionRevision)
    || !validRevision(input.expectedSetRevision)) {
    throw new TypeError("remove_set_revision_invalid");
  }
  if (!validTime(input.removedAtMs)) {
    throw new TypeError("remove_set_time_invalid");
  }
}

function validateObservation(
  identity: MetricIdentity,
  observation: SetObservation,
  requireCompletedValue: boolean,
): void {
  if (observation.profile === "load_reps" && observation.version !== 1) {
    throw new TypeError("unsupported_observation_version");
  }
  if (observation.profile === "load_reps") {
    if (
      Number.isSafeInteger(observation.loadGrams)
      && observation.loadGrams >= 0
      && Number.isSafeInteger(observation.reps)
      && observation.reps === 0
      && !requireCompletedValue
    ) {
      return;
    }
  }
  if (
    observation.profile === "timed_hold"
    && observation.version === 1
    && Number.isSafeInteger(observation.durationSeconds)
    && observation.durationSeconds === 0
    && !requireCompletedValue
  ) {
    return;
  }
  try {
    parseMetricObservation(identity, observation);
  } catch {
    if (observation.profile === "load_reps") {
      throw new TypeError("invalid_load_reps_observation");
    }
    if (observation.profile === "timed_hold" && observation.version === 1) {
      throw new TypeError("invalid_timed_hold_observation");
    }
    throw new TypeError("metric_observation_invalid");
  }
  if (
    requireCompletedValue
    && (
      (observation.profile === "unscored" && !observation.completed)
      || (observation.profile === "fixed_time"
        && observation.distanceMeters < 1)
      || (observation.profile === "intervals"
        && observation.completedRounds < 1
        && observation.completedWorkMs < 1)
    )
  ) {
    throw new TypeError("metric_observation_invalid");
  }
}

export async function updateActiveSetDraft(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: UpdateActiveSetDraftInput;
}>) {
  validateObservation(
    input.input.metricIdentity,
    input.input.observation,
    false,
  );
  return input.repository.updateActiveSetDraft(input.input);
}

export async function updateWarmupDraft(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: UpdateWarmupDraftInput;
}>) {
  validateObservation({
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  }, input.input.observation, false);
  return input.repository.updateWarmupDraft(input.input);
}

export async function addWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: AddWarmupInput;
}>) {
  validateObservation({
    profile: "load_reps",
    contractVersion: 1,
    exerciseMetricGeneration: 1,
  }, input.input.observation, false);
  return input.repository.addWarmup(input.input);
}

export async function addWorkingSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: AddWorkingSetInput;
}>) {
  return input.repository.addWorkingSet(input.input);
}

/** @deprecated The UI no longer exposes this legacy command. */
export async function copyPreviousWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: CopyPreviousWarmupInput;
}>) {
  return input.repository.copyPreviousWarmup(input.input);
}

export async function completeWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: CompleteWarmupInput;
}>) {
  return input.repository.completeWarmup(input.input);
}

export async function skipWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: SkipWarmupInput;
}>) {
  return input.repository.skipWarmup(input.input);
}

export async function skipWorkingSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: SkipWorkingSetInput;
}>) {
  return input.repository.skipWorkingSet(input.input);
}

export async function removeWarmup(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: RemoveWarmupInput;
}>): Promise<RemoveSetResult> {
  validateRemoveInput(input.input);
  if (input.repository.removeWarmup === undefined) {
    throw new TypeError("remove_warmup_unavailable");
  }
  return input.repository.removeWarmup(input.input);
}

export async function removeWorkingSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: RemoveWorkingSetInput;
}>): Promise<RemoveSetResult> {
  validateRemoveInput(input.input);
  if (input.repository.removeWorkingSet === undefined) {
    throw new TypeError("remove_working_set_unavailable");
  }
  return input.repository.removeWorkingSet(input.input);
}

export async function completeSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  haptics: HapticsPort;
  invalidate(): Promise<void>;
  drainEffects(): Promise<void>;
  input: CompleteSetInput;
}>): Promise<CompleteSetResult> {
  validateObservation(
    input.input.metricIdentity,
    input.input.observation,
    true,
  );
  const result = await input.repository.completeSet(input.input);
  if (result.outcome === "committed") {
    await input.invalidate().catch(() => undefined);
    await input.haptics.committed().catch(() => undefined);
    await input.drainEffects().catch(() => undefined);
  }
  return result;
}

export async function reviseCompletedSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: ReviseCompletedSetInput;
}>) {
  if (input.input.correctionIdempotencyKey.trim().length === 0) {
    throw new TypeError("invalid_correction_idempotency_key");
  }
  validateObservation(
    input.input.metricIdentity,
    input.input.observation,
    true,
  );
  return input.repository.reviseCompletedSet(input.input);
}
