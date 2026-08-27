export const REMOVE_FROM_HISTORY_CONFIRMATION =
  "remove_from_history" as const;
export const RESTORE_HISTORY_CONFIRMATION =
  "restore_history" as const;

export type VoidHistorySessionInput = Readonly<{
  sessionId: string;
  expectedEffectiveRevision: number;
  confirmation: string;
  nowMs: number;
}>;

export type RestoreHistorySessionInput = VoidHistorySessionInput;

export type HistoryLifecycleResult = Readonly<{
  effectiveRevision: number;
  lifecycle: "active" | "voided";
}>;

export interface HistoryLifecycleRepository {
  voidSession(input: VoidHistorySessionInput): Promise<HistoryLifecycleResult>;
  restoreSession(input: RestoreHistorySessionInput): Promise<HistoryLifecycleResult>;
}

function validCommand(input: Readonly<{
  sessionId: string;
  expectedEffectiveRevision: number;
  nowMs: number;
}>): boolean {
  return input.sessionId.trim() !== ""
    && Number.isSafeInteger(input.expectedEffectiveRevision)
    && input.expectedEffectiveRevision >= 0
    && Number.isSafeInteger(input.nowMs)
    && input.nowMs >= 0;
}

export function removeHistorySession(input: Readonly<{
  repository: HistoryLifecycleRepository;
  command: VoidHistorySessionInput;
}>): Promise<HistoryLifecycleResult> {
  if (input.command.confirmation !== REMOVE_FROM_HISTORY_CONFIRMATION) {
    throw new TypeError("history_remove_confirmation_required");
  }
  if (!validCommand(input.command)) {
    throw new TypeError("history_remove_input_invalid");
  }
  return input.repository.voidSession(input.command);
}

export function restoreHistorySession(input: Readonly<{
  repository: HistoryLifecycleRepository;
  command: RestoreHistorySessionInput;
}>): Promise<HistoryLifecycleResult> {
  if (input.command.confirmation !== RESTORE_HISTORY_CONFIRMATION) {
    throw new TypeError("history_restore_confirmation_required");
  }
  if (!validCommand(input.command)) {
    throw new TypeError("history_restore_input_invalid");
  }
  return input.repository.restoreSession(input.command);
}
