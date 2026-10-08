const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_GRAMS = 1_000_000;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

export type BodyweightOperation = "create" | "edit" | "delete" | "restore";
export type BodyweightLifecycle = "active" | "deleted";

export type BodyweightCommand = Readonly<{
  operation: BodyweightOperation;
  requestId: string;
  requestSha256: string;
  entryId: string;
  ownerId: string;
  expectedRevision: number;
  revisionId: string;
  eventId: string;
  occurredAtMs: number;
  localDate?: string | undefined;
  timezone?: string | undefined;
  grams?: number | undefined;
}>;

export type BodyweightEntryState = Readonly<{
  entryId: string;
  ownerId: string;
  revision: number;
  lifecycle: BodyweightLifecycle;
  revisionId: string;
  eventId: string;
  localDate: string;
  timezone: string;
  grams: number;
}>;

export type BodyweightTransition = Readonly<{
  kind: "created" | "edited" | "deleted" | "restored" | "conflict";
  entry: BodyweightEntryState | undefined;
  conflictCode?: "entry_exists" | "entry_missing" | "stale_revision" | "lifecycle_conflict";
}>;

export type BodyweightCommandErrorCode =
  | "bodyweight_command_identity_invalid"
  | "bodyweight_command_hash_invalid"
  | "bodyweight_command_revision_invalid"
  | "bodyweight_command_measurement_invalid";

export class BodyweightCommandError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-BODYWEIGHT01" as const;

  constructor(readonly code: BodyweightCommandErrorCode) {
    super(code);
    this.name = "BodyweightCommandError";
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right, "en")).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalBodyweightRequestPayload(value: unknown): string {
  return stableJson(value);
}

function validTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function measurementRequired(input: BodyweightCommand): boolean {
  return input.operation === "create" || input.operation === "edit" || input.operation === "restore";
}

export function validateBodyweightCommand(
  input: BodyweightCommand,
  expectedRequestSha256: string,
): void {
  if (!IDENTIFIER.test(input.requestId) || !IDENTIFIER.test(input.entryId) || !IDENTIFIER.test(input.ownerId) || !IDENTIFIER.test(input.revisionId) || !IDENTIFIER.test(input.eventId)) {
    throw new BodyweightCommandError("bodyweight_command_identity_invalid");
  }
  if (!SHA256.test(input.requestSha256) || expectedRequestSha256 !== input.requestSha256) {
    throw new BodyweightCommandError("bodyweight_command_hash_invalid");
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !Number.isSafeInteger(input.occurredAtMs) || input.occurredAtMs < 0) {
    throw new BodyweightCommandError("bodyweight_command_revision_invalid");
  }
  if (measurementRequired(input)) {
    const { localDate, timezone, grams } = input;
    if (typeof localDate !== "string" || typeof timezone !== "string" || typeof grams !== "number" || !Number.isSafeInteger(grams) || grams < 1 || grams > MAX_GRAMS) {
      throw new BodyweightCommandError("bodyweight_command_measurement_invalid");
    }
    if (!validLocalDate(localDate)) {
      throw new BodyweightCommandError("bodyweight_command_measurement_invalid");
    }
    if (!validTimezone(timezone)) throw new BodyweightCommandError("bodyweight_command_measurement_invalid");
  } else if (input.localDate !== undefined || input.timezone !== undefined || input.grams !== undefined) {
    throw new BodyweightCommandError("bodyweight_command_measurement_invalid");
  }
}

function nextEntry(input: BodyweightCommand, lifecycle: BodyweightLifecycle, revision: number): BodyweightEntryState {
  return Object.freeze({
    entryId: input.entryId,
    ownerId: input.ownerId,
    revision,
    lifecycle,
    revisionId: input.revisionId,
    eventId: input.eventId,
    localDate: input.localDate!,
    timezone: input.timezone!,
    grams: input.grams!,
  });
}

export function transitionBodyweight(
  current: BodyweightEntryState | undefined,
  input: BodyweightCommand,
  expectedRequestSha256: string,
): BodyweightTransition {
  validateBodyweightCommand(input, expectedRequestSha256);
  if (input.operation === "create") {
    if (current !== undefined) return Object.freeze({ kind: "conflict", entry: current, conflictCode: "entry_exists" });
    if (input.expectedRevision !== 0) return Object.freeze({ kind: "conflict", entry: current, conflictCode: "stale_revision" });
    return Object.freeze({ kind: "created", entry: nextEntry(input, "active", 1) });
  }
  if (current === undefined) return Object.freeze({ kind: "conflict", entry: current, conflictCode: "entry_missing" });
  if (current.entryId !== input.entryId || current.ownerId !== input.ownerId || current.revision !== input.expectedRevision) {
    return Object.freeze({ kind: "conflict", entry: current, conflictCode: "stale_revision" });
  }
  if (input.operation === "edit") {
    if (current.lifecycle !== "active") return Object.freeze({ kind: "conflict", entry: current, conflictCode: "lifecycle_conflict" });
    return Object.freeze({ kind: "edited", entry: nextEntry(input, "active", current.revision + 1) });
  }
  if (input.operation === "delete") {
    if (current.lifecycle !== "active") return Object.freeze({ kind: "conflict", entry: current, conflictCode: "lifecycle_conflict" });
    return Object.freeze({ kind: "deleted", entry: Object.freeze({ ...current, revision: current.revision + 1, lifecycle: "deleted", revisionId: input.revisionId, eventId: input.eventId }) });
  }
  if (current.lifecycle !== "deleted") return Object.freeze({ kind: "conflict", entry: current, conflictCode: "lifecycle_conflict" });
  return Object.freeze({ kind: "restored", entry: nextEntry(input, "active", current.revision + 1) });
}
