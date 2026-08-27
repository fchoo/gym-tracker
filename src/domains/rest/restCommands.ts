import type {
  RestStateV1,
} from "./restState";
import type {
  RestAlertPreferences,
} from "./restNotificationPort";

export type RestCommandResult = Readonly<{
  state: RestStateV1;
  sessionRevision: number;
  invalidationScopes: readonly [
    readonly ["active-workout", string],
    readonly ["today"],
  ];
}>;

export type RestRevisionInput = Readonly<{
  sessionId: string;
  expectedSessionRevision: number;
  expectedRestRevision: number;
  nowMs: number;
}>;

export type AdjustRestInput = RestRevisionInput & Readonly<{
  deltaMs: -15_000 | 15_000;
}>;

export type RestContext = Readonly<{
  state: RestStateV1;
  sessionRevision: number;
}>;

export interface RestRepository {
  getRestState(sessionId: string): Promise<RestStateV1>;
  getRestContext(sessionId: string): Promise<RestContext | null>;
  listActiveSessionIds(): Promise<readonly string[]>;
  currentRestRevision(sessionId: string): Promise<number | null>;
  startManualRest(input: RestRevisionInput): Promise<RestCommandResult>;
  pauseRest(input: RestRevisionInput): Promise<RestCommandResult>;
  resumeRest(input: RestRevisionInput): Promise<RestCommandResult>;
  adjustRest(input: AdjustRestInput): Promise<RestCommandResult>;
  skipRest(input: RestRevisionInput): Promise<RestCommandResult>;
  expireRest(input: RestRevisionInput): Promise<RestCommandResult>;
  expireRestWithForegroundFeedback?(
    input: RestRevisionInput & Readonly<{ preferences: RestAlertPreferences }>,
  ): Promise<RestCommandResult>;
}

export class RestCommandError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;

  constructor(readonly code: string) {
    super(code);
    this.name = "RestCommandError";
  }
}

export function startManualRest(input: Readonly<{
  repository: RestRepository;
  input: RestRevisionInput;
}>): Promise<RestCommandResult> {
  return input.repository.startManualRest(input.input);
}

export function pauseRest(input: Readonly<{
  repository: RestRepository;
  input: RestRevisionInput;
}>): Promise<RestCommandResult> {
  return input.repository.pauseRest(input.input);
}

export function resumeRest(input: Readonly<{
  repository: RestRepository;
  input: RestRevisionInput;
}>): Promise<RestCommandResult> {
  return input.repository.resumeRest(input.input);
}

export function adjustRest(input: Readonly<{
  repository: RestRepository;
  input: AdjustRestInput;
}>): Promise<RestCommandResult> {
  return input.repository.adjustRest(input.input);
}

export function skipRest(input: Readonly<{
  repository: RestRepository;
  input: RestRevisionInput;
}>): Promise<RestCommandResult> {
  return input.repository.skipRest(input.input);
}

export function expireRest(input: Readonly<{
  repository: RestRepository;
  input: RestRevisionInput;
}>): Promise<RestCommandResult> {
  return input.repository.expireRest(input.input);
}

export function expireRestWithForegroundFeedback(input: Readonly<{
  repository: RestRepository;
  input: RestRevisionInput & Readonly<{ preferences: RestAlertPreferences }>;
}>): Promise<RestCommandResult> {
  if (input.repository.expireRestWithForegroundFeedback === undefined) {
    throw new Error("foreground_rest_expiry_unavailable");
  }
  return input.repository.expireRestWithForegroundFeedback(input.input);
}
