import { z } from "zod";

const id = z.string().min(1).max(128).refine((value) => value.trim() === value);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const ms = z.number().int().safe().nonnegative().max(31_536_000_000);
const nonnegative = z.number().int().safe().nonnegative().max(100_000_000);
const boundedText = z.string().min(1).max(512);
const coordinate = z.number().int().safe().min(-180_000_000).max(180_000_000);

const lap = z.strictObject({ ordinal: z.number().int().min(0).max(999), elapsed_ms: ms.optional(), timer_ms: ms.optional(), moving_ms: ms.optional(), distance_meters: nonnegative.optional(), average_heart_rate_bpm: z.number().int().min(1).max(300).optional() }).refine((entry) => Object.keys(entry).length > 1);
const sample = z.strictObject({ elapsed_ms: ms.optional(), distance_meters: nonnegative.optional(), heart_rate_bpm: z.number().int().min(1).max(300).optional(), latitude_e6: coordinate.optional(), longitude_e6: coordinate.optional() }).refine((entry) => Object.keys(entry).length > 0);
const routePoint = z.strictObject({ latitude_e6: coordinate, longitude_e6: coordinate, elapsed_ms: ms.optional() });

export const CanonicalGarminPayloadSchema = z.strictObject({
  version: z.literal(1),
  started_at_ms: z.number().int().safe().nonnegative(),
  source_local_date_time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/u).optional(),
  source_time_zone: z.string().min(1).max(120).regex(/^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/u).optional(),
  source_utc_offset_minutes: z.number().int().min(-840).max(840).optional(),
  sport: z.literal("running"),
  subtype: boundedText,
  distance_meters: nonnegative,
  elapsed_ms: ms.optional(),
  timer_ms: ms.optional(),
  moving_ms: ms.optional(),
  average_heart_rate_bpm: z.number().int().min(1).max(300).optional(),
  laps: z.array(lap).max(1000),
  samples: z.array(sample).max(2000).optional(),
  route: z.array(routePoint).max(4000).optional(),
}).superRefine((payload, context) => {
  if (new Set(payload.laps.map((entry) => entry.ordinal)).size !== payload.laps.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "lap_ordinals_unique" });
});

export type CanonicalGarminPayload = z.infer<typeof CanonicalGarminPayloadSchema>;

const envelope = z.strictObject({
  version: z.literal(1), source_kind: z.literal("garmin_connect_account"), account_namespace: id,
  external_activity_id: id, normalization_version: z.number().int().min(1).max(100),
  normalized_json_sha256: hash, raw_component_sha256: z.strictObject({ activity: hash, splits: hash, details: hash }),
  sample_fidelity: z.enum(["source_summary", "source_laps", "sampled"]), normalized: CanonicalGarminPayloadSchema,
});

export class GarminImportBoundaryError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-GARMIN01" as const;
  constructor(readonly code: "garmin_envelope_invalid" | "garmin_digest_invalid") { super(code); this.name = "GarminImportBoundaryError"; }
}

export function parseGarminSourceEnvelope(input: unknown) {
  const parsed = envelope.safeParse(input);
  if (!parsed.success) throw new GarminImportBoundaryError("garmin_envelope_invalid");
  return parsed.data;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
