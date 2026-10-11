import {
  confirmGarminImportDate,
  prepareGarminImport,
  type ConfirmGarminImportInput,
  type GarminImportResult,
  type GarminSha256,
  type ImportedActivityCommandRepository,
  type PreparedGarminImport,
} from "../domains/activities/importCommands";
import type { GarminSourceEnvelope } from "../domains/activities/garminActivitySourcePort";

export type GarminImportConfirmation = Omit<
  ConfirmGarminImportInput,
  "staged"
>;

export type GarminImportRuntimeServices = Readonly<{
  /** Created once from the application-owned SqliteKernel during root bootstrap. */
  importedActivities: ImportedActivityCommandRepository;
}>;

export type GarminImportSourceDate = Readonly<{
  sourceLocalDateTime?: string;
  sourceTimeZone?: string;
  sourceUtcOffsetMinutes?: number;
}>;

export type GarminImportPreparedDateProposal = Readonly<{
  kind: "date_confirmation_required";
  staged: PreparedGarminImport;
  date: Readonly<{
    absoluteStartedAtMs: number;
    sourceLocalDateTime?: string;
    sourceTimeZone?: string;
    sourceUtcOffsetMinutes?: number;
  }>;
}>;

export type GarminImportDateDecision =
  | Readonly<{
    kind: "confirmed";
    localDate: string;
    localTime: string;
    timeZone: string;
    utcOffsetMinutes: number;
  }>
  | Readonly<{ kind: "cancelled" | "stale" | "invalid" | "dst_gap" }>;

export type GarminImportDateResult = GarminImportResult | Readonly<{
  kind: "not_committed";
  reason: Exclude<GarminImportDateDecision["kind"], "confirmed">;
}>;

export type GarminImportRuntime = Readonly<{
  prepareEnvelope(input: Readonly<{
    envelope: GarminSourceEnvelope;
    sourceDate: GarminImportSourceDate;
  }>): Promise<GarminImportPreparedDateProposal>;
  confirmPreparedDate(input: Readonly<{
    proposal: GarminImportPreparedDateProposal;
    request: Omit<GarminImportConfirmation, "confirmedLocalDate">;
    decision: GarminImportDateDecision;
  }>): Promise<GarminImportDateResult>;
  commitEnvelope(input: Readonly<{
    envelope: GarminSourceEnvelope;
    confirmation: GarminImportConfirmation;
  }>): Promise<GarminImportResult>;
}>;

/**
 * Framework-light facade over the existing application import service. It owns
 * neither a kernel nor a repository, so Garmin paths cannot open a second
 * SQLite connection or bypass the shared Phase 13 commands.
 */
export function createGarminImportRuntime(input: Readonly<{
  services: GarminImportRuntimeServices;
  sha256: GarminSha256;
  invalidateReads(): Promise<void>;
}>): GarminImportRuntime {
  const commitPrepared = async (
    staged: PreparedGarminImport,
    confirmation: GarminImportConfirmation,
  ): Promise<GarminImportResult> => {
    const result = await confirmGarminImportDate(
      input.services.importedActivities,
      { ...confirmation, staged },
    );
    if (result.kind === "imported") {
      await input.invalidateReads();
    }
    return result;
  };
  return Object.freeze({
    async prepareEnvelope({ envelope, sourceDate }) {
      const staged = await prepareGarminImport(envelope, input.sha256);
      return Object.freeze({
        kind: "date_confirmation_required" as const,
        staged,
        date: Object.freeze({
          absoluteStartedAtMs: staged.envelope.normalized.started_at_ms,
          ...sourceDate,
        }),
      });
    },
    async confirmPreparedDate({ proposal, request, decision }) {
      if (decision.kind !== "confirmed") {
        return Object.freeze({ kind: "not_committed" as const, reason: decision.kind });
      }
      const dateProvenance = Object.freeze({
        absoluteStartedAtMs: proposal.date.absoluteStartedAtMs,
        ...(proposal.date.sourceLocalDateTime === undefined ? {} : { sourceLocalDateTime: proposal.date.sourceLocalDateTime }),
        ...(proposal.date.sourceTimeZone === undefined ? {} : { sourceTimeZone: proposal.date.sourceTimeZone }),
        ...(proposal.date.sourceUtcOffsetMinutes === undefined ? {} : { sourceUtcOffsetMinutes: proposal.date.sourceUtcOffsetMinutes }),
        confirmedLocalDate: decision.localDate,
        confirmedLocalTime: decision.localTime,
        confirmedTimeZone: decision.timeZone,
        confirmedUtcOffsetMinutes: decision.utcOffsetMinutes,
      });
      return commitPrepared(proposal.staged, {
        ...request,
        confirmedLocalDate: decision.localDate,
        dateProvenance,
      });
    },
    async commitEnvelope({ envelope, confirmation }) {
      const staged = await prepareGarminImport(envelope, input.sha256);
      return commitPrepared(staged, confirmation);
    },
  });
}
