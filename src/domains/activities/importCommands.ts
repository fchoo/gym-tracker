import type { GarminSourceEnvelope } from "./garminActivitySourcePort";
import { canonicalJson, GarminImportBoundaryError, parseGarminSourceEnvelope } from "./importContracts";

export type PreparedGarminImport = Readonly<{
  envelope: GarminSourceEnvelope;
  canonical_envelope_json: string;
  canonical_envelope_sha256: string;
  canonical_payload_json: string;
  canonical_payload_sha256: string;
}>;
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
  assertCurrentGeneration?: () => Promise<void>;
}>;
export type ImportedActivityCommandRepository = Readonly<{ confirmGarminImport(input: ConfirmGarminImportInput): Promise<GarminImportResult> }>;
export type GarminRevisionDecisionInput = Readonly<{
  action: "accept" | "keep";
  requestId: string;
  requestSha256: string;
  activityId: string;
  expectedAggregateRevision: number;
  proposedRevision: number;
  expectedProposedSha256: string;
  occurredAtMs: number;
}>;
export type GarminRevisionDecisionResult = Readonly<{
  kind: "revision_accepted" | "revision_kept" | "replayed" | "conflict";
  activityId: string;
  aggregateRevision: number;
}>;
export type GarminRevisionReview = Readonly<{
  activityId: string;
  acceptedRevision: number;
  proposedRevision: number;
  acceptedNormalizedSha256: string;
  proposedNormalizedSha256: string;
  changedFields: readonly string[];
}>;
export type ImportedActivityRevisionRepository = Readonly<{
  resolveGarminRevision(input: GarminRevisionDecisionInput): Promise<GarminRevisionDecisionResult>;
  listGarminRevisionReviews(): Promise<readonly GarminRevisionReview[]>;
}>;
export type ImportedActivityLifecycleRepository = Readonly<{ changeGarminActivityLifecycle(input: GarminActivityLifecycleInput): Promise<GarminImportResult> }>;
export type GarminActivityLifecycleInput = Readonly<{ operation: "remove" | "restore"; requestId: string; requestSha256: string; activityId: string; expectedAggregateRevision: number; occurredAtMs: number; reason: string }>;

type LocalDateTimeParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}>;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/u;

function utcEpoch(parts: LocalDateTimeParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  return date.getTime();
}

function parseLocalDateTime(value: string): LocalDateTimeParts | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (match === null) return null;
  const parts = Object.freeze({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
    millisecond: Number((match[7] ?? "").padEnd(3, "0")),
  });
  const resolved = new Date(utcEpoch(parts));
  return resolved.getUTCFullYear() === parts.year
    && resolved.getUTCMonth() === parts.month - 1
    && resolved.getUTCDate() === parts.day
    && resolved.getUTCHours() === parts.hour
    && resolved.getUTCMinutes() === parts.minute
    && resolved.getUTCSeconds() === parts.second
    && resolved.getUTCMilliseconds() === parts.millisecond
    ? parts
    : null;
}

function localPartsAtInstant(timeZone: string, absoluteStartedAtMs: number): LocalDateTimeParts | null {
  if (timeZone.trim() !== timeZone || timeZone.length < 1 || timeZone.length > 120) return null;
  try {
    const values = Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(absoluteStartedAtMs)).reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
    return Object.freeze({
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
      second: Number(values.second),
      millisecond: absoluteStartedAtMs % 1_000,
    });
  } catch {
    return null;
  }
}

function sameLocalDateTime(left: LocalDateTimeParts, right: LocalDateTimeParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second
    && left.millisecond === right.millisecond;
}

function validOffset(value: number): boolean {
  return Number.isSafeInteger(value) && value >= -840 && value <= 840;
}

function validDateProvenance(
  provenance: GarminImportDateProvenance,
  input: ConfirmGarminImportInput,
): boolean {
  const confirmed = parseLocalDateTime(`${provenance.confirmedLocalDate}T${provenance.confirmedLocalTime}`);
  const confirmedAtInstant = localPartsAtInstant(
    provenance.confirmedTimeZone,
    provenance.absoluteStartedAtMs,
  );
  if (confirmed === null
    || confirmedAtInstant === null
    || !validOffset(provenance.confirmedUtcOffsetMinutes)
    || provenance.absoluteStartedAtMs !== input.staged.envelope.normalized.started_at_ms
    || provenance.confirmedLocalDate !== input.confirmedLocalDate
    || utcEpoch(confirmed) - provenance.confirmedUtcOffsetMinutes * 60_000 !== provenance.absoluteStartedAtMs
    || !sameLocalDateTime(confirmedAtInstant, confirmed)) return false;

  const source = provenance.sourceLocalDateTime === undefined
    ? null
    : parseLocalDateTime(provenance.sourceLocalDateTime);
  if (provenance.sourceLocalDateTime !== undefined && source === null) return false;
  if (provenance.sourceUtcOffsetMinutes !== undefined
    && !validOffset(provenance.sourceUtcOffsetMinutes)) return false;
  if (source !== null && provenance.sourceUtcOffsetMinutes !== undefined
    && utcEpoch(source) - provenance.sourceUtcOffsetMinutes * 60_000 !== provenance.absoluteStartedAtMs) return false;
  if (provenance.sourceTimeZone === undefined) return true;

  const sourceAtInstant = localPartsAtInstant(
    provenance.sourceTimeZone,
    provenance.absoluteStartedAtMs,
  );
  return sourceAtInstant !== null
    && (source === null || sameLocalDateTime(sourceAtInstant, source))
    && (provenance.sourceUtcOffsetMinutes === undefined
      || utcEpoch(sourceAtInstant) - provenance.absoluteStartedAtMs === provenance.sourceUtcOffsetMinutes * 60_000);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export async function prepareGarminImport(
  envelope: GarminSourceEnvelope,
  sha256: GarminSha256,
): Promise<PreparedGarminImport> {
  const parsed = parseGarminSourceEnvelope(envelope) as GarminSourceEnvelope;
  const canonical_envelope_json = canonicalJson(parsed);
  const canonical_payload_json = canonicalJson({ normalization_version: parsed.normalization_version, normalized: parsed.normalized });
  const [canonical_envelope_sha256, canonical_payload_sha256] = await Promise.all([
    sha256(canonical_envelope_json),
    sha256(canonical_payload_json),
  ]);
  if (canonical_payload_sha256 !== parsed.normalized_json_sha256) throw new GarminImportBoundaryError("garmin_digest_invalid");
  return Object.freeze({
    envelope: deepFreeze(parsed),
    canonical_envelope_json,
    canonical_envelope_sha256,
    canonical_payload_json,
    canonical_payload_sha256,
  });
}

export async function changeGarminActivityLifecycle(repository: ImportedActivityLifecycleRepository, input: GarminActivityLifecycleInput): Promise<GarminImportResult> {
  if (!/^[a-f0-9]{64}$/u.test(input.requestSha256) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.activityId) || !Number.isSafeInteger(input.expectedAggregateRevision) || input.expectedAggregateRevision < 1 || !Number.isSafeInteger(input.occurredAtMs) || input.occurredAtMs < 0 || input.reason.length < 1 || input.reason.length > 64) throw new GarminImportBoundaryError("garmin_envelope_invalid");
  return repository.changeGarminActivityLifecycle(input);
}

export async function confirmGarminImportDate(repository: ImportedActivityCommandRepository, input: ConfirmGarminImportInput): Promise<GarminImportResult> {
  const provenance = input.dateProvenance;
  const confirmedDate = parseLocalDateTime(`${input.confirmedLocalDate}T00:00:00`);
  const validProvenance = provenance === undefined || validDateProvenance(provenance, input);
  if (!/^[a-f0-9]{64}$/u.test(input.requestSha256) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.activityId) || !Number.isSafeInteger(input.expectedAggregateRevision) || input.expectedAggregateRevision < 0 || confirmedDate === null || !validProvenance) throw new GarminImportBoundaryError("garmin_envelope_invalid");
  return repository.confirmGarminImport(input);
}

export async function resolveGarminImportRevision(
  repository: ImportedActivityRevisionRepository,
  input: GarminRevisionDecisionInput,
): Promise<GarminRevisionDecisionResult> {
  if (!/^[a-f0-9]{64}$/u.test(input.requestSha256)
    || !/^[a-f0-9]{64}$/u.test(input.expectedProposedSha256)
    || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId)
    || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.activityId)
    || !Number.isSafeInteger(input.expectedAggregateRevision)
    || input.expectedAggregateRevision < 1
    || !Number.isSafeInteger(input.proposedRevision)
    || input.proposedRevision <= input.expectedAggregateRevision
    || !Number.isSafeInteger(input.occurredAtMs)
    || input.occurredAtMs < 0) {
    throw new GarminImportBoundaryError("garmin_envelope_invalid");
  }
  return repository.resolveGarminRevision(input);
}
