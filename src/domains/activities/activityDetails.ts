import { z } from "zod";

import { CanonicalGarminPayloadSchema } from "./importContracts";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const acceptedAggregateSchema = z.object({
  normalized_json_sha256: sha256,
  sample_fidelity: z.enum(["source_summary", "source_laps", "sampled"]),
  fidelity_by_channel: z.object({
    summary: z.literal("source_summary"),
    laps: z.literal("source_laps").optional(),
    route: z.literal("sampled").optional(),
    heart_rate_samples: z.literal("sampled").optional(),
    exact_effort_basis: z.enum(["source_summary", "source_laps", "sampled"]),
  }).optional(),
  confirmed_local_date: localDate,
  normalized: CanonicalGarminPayloadSchema,
});

export type ImportedActivityDetailSourceRow = Readonly<{
  activityId: string;
  aggregateRevision: number;
  acceptedNormalizedSha256: string;
  removalState: "active" | "removed";
  aggregateJson: string;
}>;

export type ImportedActivityDuration = Readonly<{
  label: "Moving" | "Timer";
  value: string;
}>;

export type ImportedActivityPace = Readonly<{
  basis: "Moving time" | "Timer time" | "Elapsed time";
  value: string;
}>;

export type ImportedActivityRoutePoint = Readonly<{
  latitudeE6: number;
  longitudeE6: number;
}>;

export type ImportedActivityRoute =
  | Readonly<{ kind: "available"; segments: readonly (readonly ImportedActivityRoutePoint[])[] }>
  | Readonly<{ kind: "none" | "unavailable" }>;

export type ImportedActivityLap = Readonly<{
  lap: string;
  time?: ImportedActivityPace;
  pace?: ImportedActivityPace;
}>;

export type ImportedActivityFidelity = Readonly<{
  kind: "source_summary" | "source_laps" | "sampled";
  heading: string;
  body: string;
}>;

export type ImportedActivityDetail = Readonly<{
  activityType: string;
  confirmedLocalDate: string;
  startedAtMs?: number;
  distance: string;
  elapsed?: string;
  secondaryDuration?: ImportedActivityDuration;
  averagePace?: ImportedActivityPace;
  route: ImportedActivityRoute;
  averageHeartRate?: string;
  laps: readonly ImportedActivityLap[];
  fidelity: ImportedActivityFidelity;
}>;

export type ImportedActivityDetailProjection =
  | Readonly<{ kind: "ready"; detail: ImportedActivityDetail }>
  | Readonly<{ kind: "removed" }>
  | Readonly<{ kind: "projection_error"; code: "accepted_payload_unavailable" }>;

export type ImportedActivityDetailReadResult =
  | ImportedActivityDetailProjection
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "revision_review" }>;

const LOCAL_ACTIVITY_ID = /^(?:activity|local-activity)-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/u;

export function parseImportedActivityLocalId(value: unknown): string | null {
  return typeof value === "string" && LOCAL_ACTIVITY_ID.test(value)
    ? value
    : null;
}

type DurationSource = Readonly<{
  elapsed_ms?: number | undefined;
  timer_ms?: number | undefined;
  moving_ms?: number | undefined;
}>;

type TimeBasis = Readonly<{
  basis: ImportedActivityPace["basis"];
  milliseconds: number;
}>;

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.round(milliseconds / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${totalMinutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  return meters >= 1_000
    ? `${(meters / 1_000).toFixed(2)} km`
    : `${meters} m`;
}

function displaySecondaryDuration(source: DurationSource): ImportedActivityDuration | undefined {
  if (source.moving_ms !== undefined) {
    return Object.freeze({ label: "Moving", value: formatDuration(source.moving_ms) });
  }
  if (source.timer_ms !== undefined) {
    return Object.freeze({ label: "Timer", value: formatDuration(source.timer_ms) });
  }
  return undefined;
}

function positiveTimeBasis(source: DurationSource): TimeBasis | undefined {
  if (source.moving_ms !== undefined && source.moving_ms > 0) {
    return Object.freeze({ basis: "Moving time", milliseconds: source.moving_ms });
  }
  if (source.timer_ms !== undefined && source.timer_ms > 0) {
    return Object.freeze({ basis: "Timer time", milliseconds: source.timer_ms });
  }
  if (source.elapsed_ms !== undefined && source.elapsed_ms > 0) {
    return Object.freeze({ basis: "Elapsed time", milliseconds: source.elapsed_ms });
  }
  return undefined;
}

function paceFor(distanceMeters: number | undefined, source: DurationSource): ImportedActivityPace | undefined {
  const basis = positiveTimeBasis(source);
  if (distanceMeters === undefined || distanceMeters <= 0 || basis === undefined) return undefined;
  const millisecondsPerKilometer = basis.milliseconds / (distanceMeters / 1_000);
  return Object.freeze({
    basis: basis.basis,
    value: `${formatDuration(millisecondsPerKilometer)}/km`,
  });
}

function activityType(subtype: string): string {
  if (subtype === "outdoor") return "Outdoor run";
  if (subtype === "treadmill") return "Treadmill run";
  return subtype
    .split(/[_-]+/u)
    .filter((part) => part.length > 0)
    .map((part, index) => index === 0 ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part)
    .join(" ");
}

function routeSegments(
  subtype: string,
  route: z.infer<typeof CanonicalGarminPayloadSchema>["route"],
): ImportedActivityRoute {
  if (subtype === "treadmill") return Object.freeze({ kind: "none" });
  if (route === undefined) return Object.freeze({ kind: "unavailable" });
  const segments: ImportedActivityRoutePoint[][] = [];
  let current: ImportedActivityRoutePoint[] = [];
  let priorElapsed: number | undefined;
  const closeSegment = () => {
    if (current.length >= 2) segments.push(current);
    current = [];
    priorElapsed = undefined;
  };
  for (const point of route) {
    const valid = point.latitude_e6 >= -90_000_000
      && point.latitude_e6 <= 90_000_000
      && point.longitude_e6 >= -180_000_000
      && point.longitude_e6 <= 180_000_000;
    const elapsedMovesBackward = point.elapsed_ms !== undefined
      && priorElapsed !== undefined
      && point.elapsed_ms < priorElapsed;
    if (!valid || elapsedMovesBackward) {
      closeSegment();
      if (!valid) continue;
    }
    current.push(Object.freeze({
      latitudeE6: point.latitude_e6,
      longitudeE6: point.longitude_e6,
    }));
    priorElapsed = point.elapsed_ms;
  }
  closeSegment();
  return segments.length === 0
    ? Object.freeze({ kind: "unavailable" })
    : Object.freeze({
      kind: "available",
      segments: Object.freeze(segments.map((segment) => Object.freeze(segment))),
    });
}

function fidelity(kind: ImportedActivityFidelity["kind"]): ImportedActivityFidelity {
  switch (kind) {
    case "source_laps":
      return Object.freeze({
        kind,
        heading: "Source laps",
        body: "Lap and summary facts come from accepted source fields.",
      });
    case "source_summary":
      return Object.freeze({
        kind,
        heading: "Source summary",
        body: "Summary facts come from accepted source fields.",
      });
    case "sampled":
      return Object.freeze({
        kind,
        heading: "Sampled data",
        body: "Sampled positions and charts cannot prove exact arbitrary-distance best efforts.",
      });
  }
}

function parseAcceptedAggregate(row: ImportedActivityDetailSourceRow) {
  if (!Number.isSafeInteger(row.aggregateRevision) || row.aggregateRevision < 1
    || !sha256.safeParse(row.acceptedNormalizedSha256).success) {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(row.aggregateJson);
  } catch {
    return null;
  }
  const parsed = acceptedAggregateSchema.safeParse(decoded);
  if (!parsed.success
    || parsed.data.normalized_json_sha256 !== row.acceptedNormalizedSha256) {
    return null;
  }
  return parsed.data;
}

export function projectImportedActivityDetail(
  row: ImportedActivityDetailSourceRow,
): ImportedActivityDetailProjection {
  if (row.removalState === "removed") return Object.freeze({ kind: "removed" });
  const aggregate = parseAcceptedAggregate(row);
  if (aggregate === null) {
    return Object.freeze({ kind: "projection_error", code: "accepted_payload_unavailable" });
  }
  const normalized = aggregate.normalized;
  const laps = normalized.laps.map((lap) => {
    const time = positiveTimeBasis(lap);
    const pace = paceFor(lap.distance_meters, lap);
    return Object.freeze({
      lap: String(lap.ordinal + 1),
      ...(time === undefined ? {} : {
        time: Object.freeze({ basis: time.basis, value: formatDuration(time.milliseconds) }),
      }),
      ...(pace === undefined ? {} : { pace }),
    });
  });
  const detail: ImportedActivityDetail = Object.freeze({
    activityType: activityType(normalized.subtype),
    confirmedLocalDate: aggregate.confirmed_local_date,
    startedAtMs: normalized.started_at_ms,
    distance: formatDistance(normalized.distance_meters),
    ...(normalized.elapsed_ms === undefined ? {} : { elapsed: formatDuration(normalized.elapsed_ms) }),
    ...(displaySecondaryDuration(normalized) === undefined
      ? {}
      : { secondaryDuration: displaySecondaryDuration(normalized)! }),
    ...(paceFor(normalized.distance_meters, normalized) === undefined
      ? {}
      : { averagePace: paceFor(normalized.distance_meters, normalized)! }),
    route: routeSegments(normalized.subtype, normalized.route),
    ...(normalized.average_heart_rate_bpm === undefined
      ? {}
      : { averageHeartRate: `${normalized.average_heart_rate_bpm} bpm` }),
    laps: Object.freeze(laps),
    fidelity: fidelity(aggregate.sample_fidelity),
  });
  return Object.freeze({ kind: "ready", detail });
}
