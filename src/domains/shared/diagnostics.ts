import { AppErrorKind } from "./errors";

export type DiagnosticEntry = Readonly<{
  timestampMs: number;
  operation: string;
  category: AppErrorKind;
  code: string;
  correlationCode: string;
  revision?: number;
  durationMs?: number;
  attempt?: number;
}>;

export type BoundedDiagnosticsOptions = Readonly<{
  maxEntries?: number;
  maxStringLength?: number;
}>;

type SafeDiagnosticEntry = {
  timestampMs: number;
  operation: string;
  category: AppErrorKind;
  code: string;
  correlationCode: string;
  revision?: number;
  durationMs?: number;
  attempt?: number;
};

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_MAX_STRING_LENGTH = 64;

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Diagnostic limits must be positive safe integers");
  }

  return value;
}

function normalizeInteger(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function truncate(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

export class BoundedDiagnostics {
  private readonly entries: SafeDiagnosticEntry[] = [];
  private readonly maxEntries: number;
  private readonly maxStringLength: number;

  constructor(options: BoundedDiagnosticsOptions = {}) {
    this.maxEntries = normalizeLimit(options.maxEntries, DEFAULT_MAX_ENTRIES);
    this.maxStringLength = normalizeLimit(
      options.maxStringLength,
      DEFAULT_MAX_STRING_LENGTH,
    );
  }

  record(entry: DiagnosticEntry): void {
    const safeEntry: SafeDiagnosticEntry = {
      timestampMs: normalizeInteger(entry.timestampMs) ?? 0,
      operation: truncate(entry.operation, this.maxStringLength),
      category: entry.category,
      code: truncate(entry.code, this.maxStringLength),
      correlationCode: truncate(entry.correlationCode, this.maxStringLength),
    };
    const revision = normalizeInteger(entry.revision);
    const durationMs = normalizeInteger(entry.durationMs);
    const attempt = normalizeInteger(entry.attempt);

    if (revision !== undefined) {
      safeEntry.revision = revision;
    }
    if (durationMs !== undefined) {
      safeEntry.durationMs = durationMs;
    }
    if (attempt !== undefined) {
      safeEntry.attempt = attempt;
    }

    this.entries.push(safeEntry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  serialize(): string {
    return JSON.stringify(this.entries);
  }
}
