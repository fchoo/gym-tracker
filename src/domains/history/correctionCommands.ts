import type {
  HistoryCorrectionSnapshot,
} from "./correctionContracts";

export type HistoryAuditEvent = Readonly<{
  id: string;
  effectiveRevision: number;
  eventType: "correction" | "void" | "restore";
  fieldIdentity: string;
  before: unknown;
  after: unknown;
  occurredAtMs: number;
}>;

export type AvailableCorrectionExercise = Readonly<{
  exerciseId: string;
  name: string;
  metricIdentity: HistoryCorrectionSnapshot["exercises"][number]["metricIdentity"];
}>;

export type HistoryCorrectionEditorState = Readonly<{
  effectiveRevision: number;
  snapshot: HistoryCorrectionSnapshot;
  auditEvents: readonly HistoryAuditEvent[];
}>;

export type CorrectHistorySessionInput = Readonly<{
  base: HistoryCorrectionSnapshot;
  expectedEffectiveRevision: number;
  next: HistoryCorrectionSnapshot;
  nowMs: number;
}>;

export type CorrectHistorySessionResult = Readonly<{
  effectiveRevision: number;
  snapshot: HistoryCorrectionSnapshot;
}>;

export class HistoryCorrectionConflictError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = true;

  constructor(readonly code = "history_correction_conflict") {
    super(code);
    this.name = "HistoryCorrectionConflictError";
  }
}

export interface HistoryCorrectionRepository {
  loadCorrectionSession(sessionId: string): Promise<HistoryCorrectionEditorState>;
  listAvailableCorrectionExercises(): Promise<readonly AvailableCorrectionExercise[]>;
  correctSession(input: CorrectHistorySessionInput): Promise<CorrectHistorySessionResult>;
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

/**
 * The app-facing command boundary. Repositories still validate the complete
 * effective snapshot under their serialized writer immediately before commit.
 */
export function correctHistorySession(input: Readonly<{
  repository: HistoryCorrectionRepository;
  command: CorrectHistorySessionInput;
}>): Promise<CorrectHistorySessionResult> {
  const { command } = input;
  if (
    !validRevision(command.expectedEffectiveRevision)
    || !validTime(command.nowMs)
  ) {
    throw new TypeError("history_correction_command_invalid");
  }
  return input.repository.correctSession(command);
}
