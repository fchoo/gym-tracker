export const ADVANCED_TIMING_MIN_INTERVAL_MS = 100 as const;
export const ADVANCED_TIMING_MAX_INTERVAL_MS = 60_000 as const;
export const ADVANCED_TIMING_MAX_CLUSTER_GROUPS = 12 as const;
export const ADVANCED_TIMING_MAX_CLUSTER_TOTAL_REPS = 100 as const;

export type AdvancedTimingCueChannels = "haptic" | "audio" | "both";

export type AdvancedTimingConfigV1 =
  | Readonly<{
      version: 1;
      mode: "off";
    }>
  | Readonly<{
      version: 1;
      mode: "per_rep";
      intervalMs: number;
      cueChannels: AdvancedTimingCueChannels;
    }>
  | Readonly<{
      version: 1;
      mode: "cluster";
      groupSizes: readonly number[];
      intraRestMs: number;
      cueChannels: AdvancedTimingCueChannels;
    }>;

export class AdvancedTimingConfigError extends Error {
  constructor() {
    super("advanced_timing_config_invalid");
    this.name = "AdvancedTimingConfigError";
  }
}

function positiveSafeInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= ADVANCED_TIMING_MIN_INTERVAL_MS
    && value <= maximum;
}

function positiveClusterReps(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function cueChannels(value: unknown): value is AdvancedTimingCueChannels {
  return value === "haptic" || value === "audio" || value === "both";
}

export function parseAdvancedTimingConfig(value: unknown): AdvancedTimingConfigV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AdvancedTimingConfigError();
  }
  const source = value as Record<string, unknown>;
  if (source.version !== 1) throw new AdvancedTimingConfigError();
  if (source.mode === "off" && Object.keys(source).length === 2) {
    return Object.freeze({ version: 1, mode: "off" });
  }
  if (
    source.mode === "per_rep"
    && Object.keys(source).length === 4
    && positiveSafeInteger(source.intervalMs, ADVANCED_TIMING_MAX_INTERVAL_MS)
    && cueChannels(source.cueChannels)
  ) {
    return Object.freeze({
      version: 1,
      mode: "per_rep",
      intervalMs: source.intervalMs,
      cueChannels: source.cueChannels,
    });
  }
  if (
    source.mode === "cluster"
    && Object.keys(source).length === 5
    && Array.isArray(source.groupSizes)
    && source.groupSizes.length >= 2
    && source.groupSizes.length <= ADVANCED_TIMING_MAX_CLUSTER_GROUPS
    && source.groupSizes.every(positiveClusterReps)
    && source.groupSizes.reduce((total, reps) => total + reps, 0) <= ADVANCED_TIMING_MAX_CLUSTER_TOTAL_REPS
    && positiveSafeInteger(source.intraRestMs, ADVANCED_TIMING_MAX_INTERVAL_MS)
    && cueChannels(source.cueChannels)
  ) {
    return Object.freeze({
      version: 1,
      mode: "cluster",
      groupSizes: Object.freeze([...source.groupSizes]),
      intraRestMs: source.intraRestMs,
      cueChannels: source.cueChannels,
    });
  }
  throw new AdvancedTimingConfigError();
}
