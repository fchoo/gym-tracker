import type { GarminSourceEnvelope } from "./garminActivitySourcePort";
import { canonicalJson, GarminImportBoundaryError, parseGarminSourceEnvelope } from "./importContracts";

export type PreparedGarminImport = Readonly<{ envelope: GarminSourceEnvelope; canonical_payload_json: string }>;
export type GarminSha256 = (canonicalPayload: string) => Promise<string>;
export type GarminImportResult = Readonly<{ kind: "imported" | "replayed" | "revision_review" | "removed" | "conflict"; activityId: string; aggregateRevision: number }>;
export type GarminImportDateProvenance = Readonly<{
  absoluteStartedAtMs: number;
  sourceLocalDateTime?: string;
  sourceTimeZone?: string;
  sourceUtcOffsetMinutes?: number;
  confirmedLocalDate: string;
  confirmedLocalTime: string;
  confirmedTimeZone: string;
  confirmedUtcOffsetMinutes: number;
}>;
export type ConfirmGarminImportInput = Readonly<{
  requestId: string;
  requestSha256: string;
  activityId: string;
  expectedAggregateRevision: number;
  confirmedLocalDate: string;
  staged: PreparedGarminImport;
  dateProvenance?: GarminImportDateProvenance;
}>;
export type ImportedActivityCommandRepository = Readonly<{ confirmGarminImport(input: ConfirmGarminImportInput): Promise<GarminImportResult> }>;
export type ImportedActivityLifecycleRepository = Readonly<{ changeGarminActivityLifecycle(input: GarminActivityLifecycleInput): Promise<GarminImportResult> }>;
export type GarminActivityLifecycleInput = Readonly<{ operation: "remove" | "restore"; requestId: string; requestSha256: string; activityId: string; expectedAggregateRevision: number; occurredAtMs: number; reason: string }>;

export async function prepareGarminImport(
  envelope: GarminSourceEnvelope,
  sha256: GarminSha256,
): Promise<PreparedGarminImport> {
  const parsed = parseGarminSourceEnvelope(envelope) as GarminSourceEnvelope;
  const canonical_payload_json = canonicalJson({ normalization_version: parsed.normalization_version, normalized: parsed.normalized });
  const digest = await sha256(canonical_payload_json);
  if (digest !== parsed.normalized_json_sha256) throw new GarminImportBoundaryError("garmin_digest_invalid");
  return Object.freeze({ envelope: parsed, canonical_payload_json });
}

export async function changeGarminActivityLifecycle(repository: ImportedActivityLifecycleRepository, input: GarminActivityLifecycleInput): Promise<GarminImportResult> {
  if (!/^[a-f0-9]{64}$/u.test(input.requestSha256) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.activityId) || !Number.isSafeInteger(input.expectedAggregateRevision) || input.expectedAggregateRevision < 1 || !Number.isSafeInteger(input.occurredAtMs) || input.occurredAtMs < 0 || input.reason.length < 1 || input.reason.length > 64) throw new GarminImportBoundaryError("garmin_envelope_invalid");
  return repository.changeGarminActivityLifecycle(input);
}

export async function confirmGarminImportDate(repository: ImportedActivityCommandRepository, input: ConfirmGarminImportInput): Promise<GarminImportResult> {
  const provenance = input.dateProvenance;
  const validOffset = (value: number) => Number.isSafeInteger(value) && value >= -840 && value <= 840;
  const validProvenance = provenance === undefined || (
    provenance.absoluteStartedAtMs === input.staged.envelope.normalized.started_at_ms
    && provenance.confirmedLocalDate === input.confirmedLocalDate
    && /^\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/u.test(provenance.confirmedLocalTime)
    && provenance.confirmedTimeZone.trim() === provenance.confirmedTimeZone
    && provenance.confirmedTimeZone.length >= 1
    && provenance.confirmedTimeZone.length <= 120
    && validOffset(provenance.confirmedUtcOffsetMinutes)
    && (provenance.sourceLocalDateTime === undefined || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/u.test(provenance.sourceLocalDateTime))
    && (provenance.sourceTimeZone === undefined || (
      provenance.sourceTimeZone.trim() === provenance.sourceTimeZone
      && provenance.sourceTimeZone.length >= 1
      && provenance.sourceTimeZone.length <= 120
    ))
    && (provenance.sourceUtcOffsetMinutes === undefined || validOffset(provenance.sourceUtcOffsetMinutes))
  );
  if (!/^[a-f0-9]{64}$/u.test(input.requestSha256) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.activityId) || !Number.isSafeInteger(input.expectedAggregateRevision) || input.expectedAggregateRevision < 0 || !/^\d{4}-\d{2}-\d{2}$/u.test(input.confirmedLocalDate) || !validProvenance) throw new GarminImportBoundaryError("garmin_envelope_invalid");
  return repository.confirmGarminImport(input);
}
