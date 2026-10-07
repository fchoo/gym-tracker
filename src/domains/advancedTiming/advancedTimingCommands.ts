import {
  OFF_ADVANCED_TIMING_CONFIG,
  parseAdvancedTimingConfig,
  type AdvancedTimingConfigV1,
} from "./advancedTimingConfig";
import type { AdvancedTimingStateV1 } from "./advancedTimingState";

export type AdvancedTimingCommandResult = Readonly<{
  state: AdvancedTimingStateV1;
  sessionRevision: number;
  invalidationScopes: readonly [
    readonly ["active-workout", string],
    readonly ["today"],
  ];
}>;

export type AdvancedTimingRevisionInput = Readonly<{
  sessionId: string;
  sessionSetId: string;
  expectedSessionRevision: number;
  expectedAdvancedTimingRevision: number;
  nowMs: number;
}>;

export type UpdateSessionExerciseAdvancedTimingInput = Readonly<{
  sessionId: string;
  sessionExerciseId: string;
  expectedSessionRevision: number;
  expectedSessionExerciseRevision: number;
  config: AdvancedTimingConfigV1;
  nowMs: number;
}>;

export type UpdateSessionSetAdvancedTimingInput = Readonly<{
  sessionId: string;
  sessionSetId: string;
  expectedSessionRevision: number;
  expectedSetRevision: number;
  override: AdvancedTimingConfigV1 | null;
  nowMs: number;
}>;

export interface AdvancedTimingRepository {
  updateSessionExerciseAdvancedTiming(
    input: UpdateSessionExerciseAdvancedTimingInput,
  ): Promise<AdvancedTimingCommandResult>;
  updateSessionSetAdvancedTiming(
    input: UpdateSessionSetAdvancedTimingInput,
  ): Promise<AdvancedTimingCommandResult>;
  configureAdvancedTiming(input: AdvancedTimingRevisionInput & Readonly<{
    config: AdvancedTimingConfigV1;
  }>): Promise<AdvancedTimingCommandResult>;
  startAdvancedTiming(input: AdvancedTimingRevisionInput & Readonly<{
    config: AdvancedTimingConfigV1;
  }>): Promise<AdvancedTimingCommandResult>;
  beginAdvancedTimingClusterGap(input: AdvancedTimingRevisionInput): Promise<AdvancedTimingCommandResult>;
  skipAdvancedTimingClusterGap(input: AdvancedTimingRevisionInput): Promise<AdvancedTimingCommandResult>;
  pauseAdvancedTiming(input: AdvancedTimingRevisionInput): Promise<AdvancedTimingCommandResult>;
  resumeAdvancedTiming(input: AdvancedTimingRevisionInput): Promise<AdvancedTimingCommandResult>;
  reconcileAdvancedTiming(input: AdvancedTimingRevisionInput & Readonly<{
    foregroundSinceMs: number;
  }>): Promise<AdvancedTimingCommandResult & Readonly<{ cue: AdvancedTimingCue | null }>>;
  stopAdvancedTiming(input: AdvancedTimingRevisionInput): Promise<AdvancedTimingCommandResult>;
}

/**
 * TIM-01 intentionally makes persisted cadence/cluster settings inert.  The
 * parser still owns historical readability; this boundary owns the policy that
 * no new runtime snapshot may inherit an advisory playback mode.
 */
export function retireAdvancedTiming(
  _config: AdvancedTimingConfigV1,
): typeof OFF_ADVANCED_TIMING_CONFIG {
  return OFF_ADVANCED_TIMING_CONFIG;
}

export class AdvancedTimingCommandError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;

  constructor() {
    super("advanced_timing_command_invalid");
    this.name = "AdvancedTimingCommandError";
  }
}

function validIdentifier(value: string): boolean {
  return value.trim().length > 0 && value.length <= 256;
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validate(input: AdvancedTimingRevisionInput): void {
  if (
    !validIdentifier(input.sessionId)
    || !validIdentifier(input.sessionSetId)
    || !validRevision(input.expectedSessionRevision)
    || !validRevision(input.expectedAdvancedTimingRevision)
    || !validTime(input.nowMs)
  ) throw new AdvancedTimingCommandError();
}

function validateSessionExerciseInput(
  input: UpdateSessionExerciseAdvancedTimingInput,
): void {
  if (
    !validIdentifier(input.sessionId)
    || !validIdentifier(input.sessionExerciseId)
    || !validRevision(input.expectedSessionRevision)
    || !validRevision(input.expectedSessionExerciseRevision)
    || !validTime(input.nowMs)
  ) throw new AdvancedTimingCommandError();
}

function validateSessionSetInput(
  input: UpdateSessionSetAdvancedTimingInput,
): void {
  if (
    !validIdentifier(input.sessionId)
    || !validIdentifier(input.sessionSetId)
    || !validRevision(input.expectedSessionRevision)
    || !validRevision(input.expectedSetRevision)
    || !validTime(input.nowMs)
  ) throw new AdvancedTimingCommandError();
}

function retiredResult(input: AdvancedTimingRevisionInput): AdvancedTimingCommandResult {
  return Object.freeze({
    state: Object.freeze({
      version: 1,
      state: "idle",
      revision: input.expectedAdvancedTimingRevision,
      targetSessionSetId: null,
    }),
    sessionRevision: input.expectedSessionRevision,
    invalidationScopes: [["active-workout", input.sessionId], ["today"]],
  });
}

export async function updateSessionExerciseAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: UpdateSessionExerciseAdvancedTimingInput;
}>): Promise<AdvancedTimingCommandResult> {
  validateSessionExerciseInput(input.input);
  parseAdvancedTimingConfig(input.input.config);
  return input.repository.updateSessionExerciseAdvancedTiming({
    ...input.input,
    config: retireAdvancedTiming(input.input.config),
  });
}

export async function updateSessionSetAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: UpdateSessionSetAdvancedTimingInput;
}>): Promise<AdvancedTimingCommandResult> {
  validateSessionSetInput(input.input);
  if (input.input.override !== null) parseAdvancedTimingConfig(input.input.override);
  return input.repository.updateSessionSetAdvancedTiming({
    ...input.input,
    override: null,
  });
}

export async function startAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput & Readonly<{ config: AdvancedTimingConfigV1 }>;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  parseAdvancedTimingConfig(input.input.config);
  return retiredResult(input.input);
}

export async function configureAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput & Readonly<{ config: AdvancedTimingConfigV1 }>;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  parseAdvancedTimingConfig(input.input.config);
  return input.repository.configureAdvancedTiming({
    ...input.input,
    config: retireAdvancedTiming(input.input.config),
  });
}

export function pauseAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return Promise.resolve(retiredResult(input.input));
}

export function beginAdvancedTimingClusterGap(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return Promise.resolve(retiredResult(input.input));
}

export function skipAdvancedTimingClusterGap(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return Promise.resolve(retiredResult(input.input));
}

export function resumeAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return Promise.resolve(retiredResult(input.input));
}

export function reconcileAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput & Readonly<{ foregroundSinceMs: number }>;
}>): Promise<AdvancedTimingCommandResult & Readonly<{ cue: null }>> {
  validate(input.input);
  if (!validTime(input.input.foregroundSinceMs) || input.input.foregroundSinceMs > input.input.nowMs) {
    throw new AdvancedTimingCommandError();
  }
  return Promise.resolve(Object.freeze({ ...retiredResult(input.input), cue: null }));
}

export function stopAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return Promise.resolve(retiredResult(input.input));
}
