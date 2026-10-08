import type { GarminSourceEnvelope } from "./garminActivitySourcePort";
import { canonicalJson, GarminImportBoundaryError, parseGarminSourceEnvelope } from "./importContracts";

export type PreparedGarminImport = Readonly<{ envelope: GarminSourceEnvelope; canonical_payload_json: string }>;
export type GarminImportResult = Readonly<{ kind: "imported" | "replayed" | "revision_review" | "removed" | "conflict"; activityId: string; aggregateRevision: number }>;
export type ConfirmGarminImportInput = Readonly<{ requestId: string; requestSha256: string; activityId: string; expectedAggregateRevision: number; confirmedLocalDate: string; staged: PreparedGarminImport }>;
export type ImportedActivityCommandRepository = Readonly<{ confirmGarminImport(input: ConfirmGarminImportInput): Promise<GarminImportResult> }>;
export type ImportedActivityLifecycleRepository = Readonly<{ changeGarminActivityLifecycle(input: GarminActivityLifecycleInput): Promise<GarminImportResult> }>;
export type GarminActivityLifecycleInput = Readonly<{ operation: "remove" | "restore"; requestId: string; requestSha256: string; activityId: string; expectedAggregateRevision: number; occurredAtMs: number; reason: string }>;

export function prepareGarminImport(
  envelope: GarminSourceEnvelope,
  sha256: (canonicalPayload: string) => string,
): PreparedGarminImport {
  const parsed = parseGarminSourceEnvelope(envelope) as GarminSourceEnvelope;
  const canonical_payload_json = canonicalJson({ normalization_version: parsed.normalization_version, normalized: parsed.normalized });
  const digest = sha256(canonical_payload_json);
  if (digest !== parsed.normalized_json_sha256) throw new GarminImportBoundaryError("garmin_digest_invalid");
  return Object.freeze({ envelope: parsed, canonical_payload_json });
}

export async function changeGarminActivityLifecycle(repository: ImportedActivityLifecycleRepository, input: GarminActivityLifecycleInput): Promise<GarminImportResult> {
  if (!/^[a-f0-9]{64}$/u.test(input.requestSha256) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.activityId) || !Number.isSafeInteger(input.expectedAggregateRevision) || input.expectedAggregateRevision < 1 || !Number.isSafeInteger(input.occurredAtMs) || input.occurredAtMs < 0 || input.reason.length < 1 || input.reason.length > 64) throw new GarminImportBoundaryError("garmin_envelope_invalid");
  return repository.changeGarminActivityLifecycle(input);
}

export async function confirmGarminImportDate(repository: ImportedActivityCommandRepository, input: ConfirmGarminImportInput): Promise<GarminImportResult> {
  if (!/^[a-f0-9]{64}$/u.test(input.requestSha256) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.activityId) || !Number.isSafeInteger(input.expectedAggregateRevision) || input.expectedAggregateRevision < 0 || !/^\d{4}-\d{2}-\d{2}$/u.test(input.confirmedLocalDate)) throw new GarminImportBoundaryError("garmin_envelope_invalid");
  return repository.confirmGarminImport(input);
}
