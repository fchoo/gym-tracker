import type { GarminSourceEnvelope } from "../../domains/activities/garminActivitySourcePort";
import {
  CanonicalGarminPayloadSchema,
  parseGarminSourceEnvelope,
  type CanonicalGarminPayload,
} from "../../domains/activities/importContracts";
import {
  canonicalizeGarminPayload,
  hashCanonicalGarminPayload,
  type GarminPayloadSha256,
} from "./canonicalGarminPayload";

export const GARMIN_NORMALIZATION_VERSION = 1 as const;

const ACCOUNT_NAMESPACE = /^[A-Za-z0-9._:-]{1,128}$/u;
const EXTERNAL_ACTIVITY_ID = /^[1-9][0-9]{0,18}$/u;
const REVIEWED_METRIC_KEYS = new Set([
  "sumElapsedDuration",
  "sumDistance",
  "directHeartRate",
]);

type PlainRecord = Record<string, unknown>;

export type NormalizeGarminActivityInput = Readonly<{
  account_namespace: string;
  external_activity_id: string;
  activity: unknown;
  splits: unknown;
  details: unknown;
}>;

export class GarminActivityNormalizationError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;

  constructor(readonly code: "garmin_source_invalid" | "garmin_sport_unsupported") {
    super(code);
    this.name = "GarminActivityNormalizationError";
  }
}

function invalid(): never {
  throw new GarminActivityNormalizationError("garmin_source_invalid");
}

function record(value: unknown): PlainRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as PlainRecord;
}

function optionalArray(value: unknown, maximum: number): readonly unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maximum) invalid();
  return value;
}

function sourceNumber(source: PlainRecord, key: string): number | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number") invalid();
  return value;
}

function boundedInteger(value: number, maximum: number): number {
  if (value < 0 || value > maximum) invalid();
  return value;
}

function secondsToMilliseconds(source: PlainRecord, key: string): number | undefined {
  const value = sourceNumber(source, key);
  if (value === undefined) return undefined;
  return boundedInteger(Math.round(value * 1_000), 31_536_000_000);
}

function meters(source: PlainRecord, key: string): number | undefined {
  const value = sourceNumber(source, key);
  if (value === undefined) return undefined;
  return boundedInteger(Math.round(value), 100_000_000);
}

function heartRate(source: PlainRecord, key: string): number | undefined {
  const value = sourceNumber(source, key);
  if (value === undefined) return undefined;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 300) invalid();
  return rounded;
}

function assignIfPresent<T extends object, K extends string, V>(target: T, key: K, value: V | undefined): asserts target is T & Record<K, V> {
  if (value !== undefined) Object.assign(target, { [key]: value });
}

function parseUtcTimestamp(value: unknown): number {
  if (typeof value !== "string") invalid();
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z?$/u.exec(value);
  if (iso === null) invalid();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText] = iso;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const millisecond = millisecondText === undefined ? 0 : Number(millisecondText);
  const timestamp = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!, millisecond);
  const date = new Date(timestamp);
  const expected = [year, month! - 1, day, hour, minute, second];
  const actual = [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  if (actual.some((part, index) => part !== expected[index])) invalid();
  return timestamp;
}

function normalizeActivityId(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) invalid();
    return String(value);
  }
  if (typeof value === "string" && EXTERNAL_ACTIVITY_ID.test(value)) return value;
  return invalid();
}

function normalizeSubtype(typeKey: unknown): "outdoor" | "treadmill" {
  if (typeKey === "running") return "outdoor";
  if (typeKey === "treadmill_running") return "treadmill";
  throw new GarminActivityNormalizationError("garmin_sport_unsupported");
}

function projectSummary(summary: PlainRecord): PlainRecord {
  const projected: PlainRecord = { startTimeGMT: summary.startTimeGMT };
  for (const key of ["startTimeLocal", "timeZoneId", "distance", "duration", "elapsedDuration", "movingDuration", "averageHR"] as const) {
    if (summary[key] !== undefined && summary[key] !== null) projected[key] = summary[key];
  }
  return projected;
}

function sourceDateEvidence(summary: PlainRecord, startedAtMs: number): Readonly<{
  sourceLocalDateTime?: string;
  sourceTimeZone?: string;
  sourceUtcOffsetMinutes?: number;
}> {
  const localValue = summary.startTimeLocal;
  const zoneValue = summary.timeZoneId;
  if (zoneValue !== undefined && zoneValue !== null
    && (typeof zoneValue !== "string"
      || !/^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/u.test(zoneValue)
      || zoneValue.length > 120)) invalid();
  if (localValue === undefined || localValue === null) {
    return zoneValue === undefined || zoneValue === null
      ? Object.freeze({})
      : Object.freeze({ sourceTimeZone: zoneValue as string });
  }
  if (typeof localValue !== "string") invalid();
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/u.exec(localValue);
  if (match === null) invalid();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondsText] = match;
  const milliseconds = millisecondsText === undefined
    ? 0
    : Number(millisecondsText.padEnd(3, "0"));
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const localAsUtcMs = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!, milliseconds);
  const date = new Date(localAsUtcMs);
  if ([date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .some((part, index) => part !== [year, month! - 1, day, hour, minute, second][index])) invalid();
  const offsetMinutes = (localAsUtcMs - startedAtMs) / 60_000;
  if (!Number.isSafeInteger(offsetMinutes) || offsetMinutes < -840 || offsetMinutes > 840) invalid();
  const canonicalLocal = `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}${milliseconds === 0 ? "" : `.${String(milliseconds).padStart(3, "0")}`}`;
  return Object.freeze({
    sourceLocalDateTime: canonicalLocal,
    ...(zoneValue === undefined || zoneValue === null ? {} : { sourceTimeZone: zoneValue as string }),
    sourceUtcOffsetMinutes: offsetMinutes,
  });
}

function normalizeLaps(splits: PlainRecord): Readonly<{
  normalized: CanonicalGarminPayload["laps"];
  projected: readonly PlainRecord[];
}> {
  const sourceLaps = optionalArray(splits.lapDTOs, 1_000);
  const normalized: CanonicalGarminPayload["laps"][number][] = [];
  const projected: PlainRecord[] = [];
  for (let ordinal = 0; ordinal < sourceLaps.length; ordinal += 1) {
    const source = record(sourceLaps[ordinal]);
    const lapIndex = sourceNumber(source, "lapIndex");
    if (lapIndex !== undefined && lapIndex !== ordinal + 1) invalid();
    const lap: Record<string, number> = { ordinal };
    assignIfPresent(lap, "elapsed_ms", secondsToMilliseconds(source, "elapsedDuration"));
    assignIfPresent(lap, "timer_ms", secondsToMilliseconds(source, "duration"));
    assignIfPresent(lap, "moving_ms", secondsToMilliseconds(source, "movingDuration"));
    assignIfPresent(lap, "distance_meters", meters(source, "distance"));
    assignIfPresent(lap, "average_heart_rate_bpm", heartRate(source, "averageHR"));
    if (Object.keys(lap).length === 1) invalid();
    normalized.push(lap as CanonicalGarminPayload["laps"][number]);
    const sourceProjection: PlainRecord = {};
    for (const key of ["lapIndex", "distance", "duration", "elapsedDuration", "movingDuration", "averageHR"] as const) {
      if (source[key] !== undefined && source[key] !== null) sourceProjection[key] = source[key];
    }
    projected.push(sourceProjection);
  }
  return { normalized, projected };
}

function metricDescriptors(details: PlainRecord): Readonly<{
  projected: readonly Readonly<{ key: string; metricsIndex: number }>[];
  reviewed: ReadonlyMap<string, number>;
}> {
  const sourceDescriptors = optionalArray(details.metricDescriptors, 128);
  const projected: Array<Readonly<{ key: string; metricsIndex: number }>> = [];
  const reviewed = new Map<string, number>();
  const indexes = new Set<number>();
  const keys = new Set<string>();
  for (const sourceDescriptor of sourceDescriptors) {
    const source = record(sourceDescriptor);
    const key = source.key;
    const index = source.metricsIndex;
    if (typeof key !== "string" || key.length < 1 || key.length > 64
      || !Number.isSafeInteger(index) || (index as number) < 0 || (index as number) >= 128
      || keys.has(key) || indexes.has(index as number)) invalid();
    keys.add(key);
    indexes.add(index as number);
    projected.push({ key, metricsIndex: index as number });
    if (REVIEWED_METRIC_KEYS.has(key)) reviewed.set(key, index as number);
  }
  return { projected, reviewed };
}

function normalizeSamples(details: PlainRecord, descriptors: ReadonlyMap<string, number>): Readonly<{
  normalized: NonNullable<CanonicalGarminPayload["samples"]>;
  projected: readonly Readonly<{ metrics: readonly (number | null)[] }>[];
}> {
  const sourceSamples = optionalArray(details.activityDetailMetrics, 2_000);
  if (sourceSamples.length > 0 && descriptors.size === 0) invalid();
  const normalized: NonNullable<CanonicalGarminPayload["samples"]>[number][] = [];
  const projected: Array<Readonly<{ metrics: readonly (number | null)[] }>> = [];
  for (const sourceSample of sourceSamples) {
    const metricsValue = record(sourceSample).metrics;
    if (!Array.isArray(metricsValue) || metricsValue.length > 128) invalid();
    const metrics = metricsValue.map((value) => {
      if (value === null) return null;
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) invalid();
      return value;
    });
    projected.push({ metrics });
    const sample: Record<string, number> = {};
    const elapsedIndex = descriptors.get("sumElapsedDuration");
    const distanceIndex = descriptors.get("sumDistance");
    const heartRateIndex = descriptors.get("directHeartRate");
    if (elapsedIndex !== undefined && metrics[elapsedIndex] !== undefined && metrics[elapsedIndex] !== null) {
      assignIfPresent(sample, "elapsed_ms", secondsToMilliseconds({ value: metrics[elapsedIndex] }, "value"));
    }
    if (distanceIndex !== undefined && metrics[distanceIndex] !== undefined && metrics[distanceIndex] !== null) {
      assignIfPresent(sample, "distance_meters", meters({ value: metrics[distanceIndex] }, "value"));
    }
    if (heartRateIndex !== undefined && metrics[heartRateIndex] !== undefined && metrics[heartRateIndex] !== null) {
      assignIfPresent(sample, "heart_rate_bpm", heartRate({ value: metrics[heartRateIndex] }, "value"));
    }
    if (Object.keys(sample).length > 0) normalized.push(sample as NonNullable<CanonicalGarminPayload["samples"]>[number]);
  }
  return { normalized, projected };
}

function normalizeRoute(details: PlainRecord, subtype: "outdoor" | "treadmill"): Readonly<{
  normalized: NonNullable<CanonicalGarminPayload["route"]>;
  projected?: Readonly<{ polyline: readonly PlainRecord[] }>;
}> {
  const geoValue = details.geoPolylineDTO;
  if (geoValue === undefined || geoValue === null) return { normalized: [] };
  const geo = record(geoValue);
  const sourcePoints = optionalArray(geo.polyline, 4_000);
  const projected: PlainRecord[] = [];
  const normalized: NonNullable<CanonicalGarminPayload["route"]>[number][] = [];
  for (const sourcePoint of sourcePoints) {
    const source = record(sourcePoint);
    const latitude = sourceNumber(source, "lat");
    const longitude = sourceNumber(source, "lon");
    if (latitude === undefined || longitude === undefined || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) invalid();
    const projection: PlainRecord = { lat: latitude, lon: longitude };
    if (source.elapsedDuration !== undefined && source.elapsedDuration !== null) projection.elapsedDuration = source.elapsedDuration;
    projected.push(projection);
    if (subtype === "outdoor") {
      const point: Record<string, number> = {
        latitude_e6: Math.round(latitude * 1_000_000),
        longitude_e6: Math.round(longitude * 1_000_000),
      };
      assignIfPresent(point, "elapsed_ms", secondsToMilliseconds(source, "elapsedDuration"));
      normalized.push(point as NonNullable<CanonicalGarminPayload["route"]>[number]);
    }
  }
  return { normalized, projected: { polyline: projected } };
}

function lastSampleDistance(samples: NonNullable<CanonicalGarminPayload["samples"]>): number | undefined {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const distance = samples[index]?.distance_meters;
    if (distance !== undefined) return distance;
  }
  return undefined;
}

function hasDurationEvidence(value: Readonly<{
  elapsed_ms?: number | undefined;
  timer_ms?: number | undefined;
  moving_ms?: number | undefined;
}>): boolean {
  return [value.elapsed_ms, value.timer_ms, value.moving_ms].some((duration) => duration !== undefined);
}

export async function normalizeGarminActivity(
  input: NormalizeGarminActivityInput,
  sha256: GarminPayloadSha256,
): Promise<GarminSourceEnvelope> {
  if (!ACCOUNT_NAMESPACE.test(input.account_namespace) || !EXTERNAL_ACTIVITY_ID.test(input.external_activity_id)) invalid();
  canonicalizeGarminPayload(input.activity);
  canonicalizeGarminPayload(input.splits);
  canonicalizeGarminPayload(input.details);

  const activity = record(input.activity);
  if (normalizeActivityId(activity.activityId) !== input.external_activity_id) invalid();
  const activityType = record(activity.activityTypeDTO);
  const subtype = normalizeSubtype(activityType.typeKey);
  const summary = record(activity.summaryDTO);
  const laps = normalizeLaps(record(input.splits));
  const details = record(input.details);
  const descriptors = metricDescriptors(details);
  const samples = normalizeSamples(details, descriptors.reviewed);
  const route = normalizeRoute(details, subtype);
  const summaryDistance = meters(summary, "distance");
  const sampledDistance = lastSampleDistance(samples.normalized);
  const distanceMeters = summaryDistance ?? sampledDistance;
  if (distanceMeters === undefined) invalid();
  const startedAtMs = parseUtcTimestamp(summary.startTimeGMT);
  const dateEvidence = sourceDateEvidence(summary, startedAtMs);

  const normalizedCandidate: Record<string, unknown> = {
    version: 1,
    started_at_ms: startedAtMs,
    sport: "running",
    subtype,
    distance_meters: distanceMeters,
  };
  assignIfPresent(normalizedCandidate, "source_local_date_time", dateEvidence.sourceLocalDateTime);
  assignIfPresent(normalizedCandidate, "source_time_zone", dateEvidence.sourceTimeZone);
  assignIfPresent(normalizedCandidate, "source_utc_offset_minutes", dateEvidence.sourceUtcOffsetMinutes);
  assignIfPresent(normalizedCandidate, "elapsed_ms", secondsToMilliseconds(summary, "elapsedDuration"));
  assignIfPresent(normalizedCandidate, "timer_ms", secondsToMilliseconds(summary, "duration"));
  assignIfPresent(normalizedCandidate, "moving_ms", secondsToMilliseconds(summary, "movingDuration"));
  assignIfPresent(normalizedCandidate, "average_heart_rate_bpm", heartRate(summary, "averageHR"));
  normalizedCandidate.laps = laps.normalized;
  if (samples.normalized.length > 0) normalizedCandidate.samples = samples.normalized;
  if (route.normalized.length > 0) normalizedCandidate.route = route.normalized;
  const normalized = CanonicalGarminPayloadSchema.parse(normalizedCandidate);

  const activityProjection = {
    activityId: activity.activityId,
    activityTypeDTO: { typeKey: activityType.typeKey },
    summaryDTO: projectSummary(summary),
  };
  const splitsProjection = { lapDTOs: laps.projected };
  const detailsProjection: PlainRecord = {
    metricDescriptors: descriptors.projected,
    activityDetailMetrics: samples.projected,
  };
  if (route.projected !== undefined) detailsProjection.geoPolylineDTO = route.projected;
  const [activityDigest, splitsDigest, detailsDigest, normalizedDigest] = await Promise.all([
    hashCanonicalGarminPayload(activityProjection, sha256),
    hashCanonicalGarminPayload(splitsProjection, sha256),
    hashCanonicalGarminPayload(detailsProjection, sha256),
    hashCanonicalGarminPayload({ normalization_version: GARMIN_NORMALIZATION_VERSION, normalized }, sha256),
  ]);
  const exactEffortBasis = laps.normalized.length > 0
    ? "source_laps" as const
    : summaryDistance === undefined ? "sampled" as const : "source_summary" as const;
  const hasSampledChannels = samples.normalized.length > 0 || route.normalized.length > 0;

  return parseGarminSourceEnvelope({
    version: 1,
    source_kind: "garmin_connect_account",
    account_namespace: input.account_namespace,
    external_activity_id: input.external_activity_id,
    normalization_version: GARMIN_NORMALIZATION_VERSION,
    normalized_json_sha256: normalizedDigest,
    raw_component_sha256: {
      activity: activityDigest,
      splits: splitsDigest,
      details: detailsDigest,
    },
    sample_fidelity: hasSampledChannels ? "sampled" : exactEffortBasis,
    fidelity_by_channel: {
      summary: "source_summary",
      ...(laps.normalized.length === 0 ? {} : { laps: "source_laps" }),
      ...(route.normalized.length === 0 ? {} : { route: "sampled" }),
      ...(samples.normalized.some((sample) => sample.heart_rate_bpm !== undefined)
        ? { heart_rate_samples: "sampled" }
        : {}),
      exact_effort_basis: exactEffortBasis,
    },
    normalized,
  }) as GarminSourceEnvelope;
}

export function isExactGarminEffortEligible(
  envelope: GarminSourceEnvelope,
  distanceMeters: number,
): boolean {
  const exactEffortBasis = envelope.fidelity_by_channel?.exact_effort_basis
    ?? envelope.sample_fidelity;
  if (!Number.isSafeInteger(distanceMeters) || distanceMeters <= 0 || exactEffortBasis === "sampled") return false;
  if (hasDurationEvidence(envelope.normalized) && envelope.normalized.distance_meters === distanceMeters) return true;
  return exactEffortBasis === "source_laps" && envelope.normalized.laps.some((lap) =>
    lap.distance_meters === distanceMeters
    && hasDurationEvidence(lap));
}
