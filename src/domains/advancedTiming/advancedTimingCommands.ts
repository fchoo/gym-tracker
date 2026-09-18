import {
  parseAdvancedTimingConfig,
  type AdvancedTimingConfigV1,
} from "./advancedTimingConfig";
import type {
  AdvancedTimingCue,
  AdvancedTimingStateV1,
} from "./advancedTimingState";

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

export async function updateSessionExerciseAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: UpdateSessionExerciseAdvancedTimingInput;
}>): Promise<AdvancedTimingCommandResult> {
  validateSessionExerciseInput(input.input);
  const config = parseAdvancedTimingConfig(input.input.config);
  return input.repository.updateSessionExerciseAdvancedTiming({
    ...input.input,
    config,
  });
}

export async function updateSessionSetAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: UpdateSessionSetAdvancedTimingInput;
}>): Promise<AdvancedTimingCommandResult> {
  validateSessionSetInput(input.input);
  const override = input.input.override === null
    ? null
    : parseAdvancedTimingConfig(input.input.override);
  return input.repository.updateSessionSetAdvancedTiming({
    ...input.input,
    override,
  });
}

export async function startAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput & Readonly<{ config: AdvancedTimingConfigV1 }>;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  const config = parseAdvancedTimingConfig(input.input.config);
  if (config.mode === "off") throw new AdvancedTimingCommandError();
  return input.repository.startAdvancedTiming({ ...input.input, config });
}

export async function configureAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput & Readonly<{ config: AdvancedTimingConfigV1 }>;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  const config = parseAdvancedTimingConfig(input.input.config);
  return input.repository.configureAdvancedTiming({ ...input.input, config });
}

export function pauseAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return input.repository.pauseAdvancedTiming(input.input);
}

export function beginAdvancedTimingClusterGap(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return input.repository.beginAdvancedTimingClusterGap(input.input);
}

export function skipAdvancedTimingClusterGap(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return input.repository.skipAdvancedTimingClusterGap(input.input);
}

export function resumeAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return input.repository.resumeAdvancedTiming(input.input);
}

export function reconcileAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput & Readonly<{ foregroundSinceMs: number }>;
}>): Promise<AdvancedTimingCommandResult & Readonly<{ cue: AdvancedTimingCue | null }>> {
  validate(input.input);
  if (!validTime(input.input.foregroundSinceMs) || input.input.foregroundSinceMs > input.input.nowMs) {
    throw new AdvancedTimingCommandError();
  }
  return input.repository.reconcileAdvancedTiming(input.input);
}

export function stopAdvancedTiming(input: Readonly<{
  repository: AdvancedTimingRepository;
  input: AdvancedTimingRevisionInput;
}>): Promise<AdvancedTimingCommandResult> {
  validate(input.input);
  return input.repository.stopAdvancedTiming(input.input);
}
