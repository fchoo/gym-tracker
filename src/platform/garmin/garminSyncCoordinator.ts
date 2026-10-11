import type {
  GarminActivityDiscovery,
  GarminActivitySourcePort,
  GarminSourceEnvelope,
} from "../../domains/activities/garminActivitySourcePort";
import {
  confirmGarminImportDate,
  prepareGarminImport,
  type GarminSha256,
  type ImportedActivityCommandRepository,
} from "../../domains/activities/importCommands";
import {
  GarminImportBoundaryError,
  parseGarminSourceEnvelope,
} from "../../domains/activities/importContracts";
import { GarminCanonicalPayloadError } from "./canonicalGarminPayload";
import type { GarminNativeErrorCode } from "./garminActivityAdapter";
import { GarminActivityNormalizationError } from "./normalizeGarminActivity";
import {
  GARMIN_SYNC_DEFAULT_LIMITS,
  GARMIN_SYNC_HARD_LIMITS,
  type GarminSharedImportRequestFactory,
  type GarminSyncCoordinator,
  type GarminSyncCounts,
  type GarminSyncFailure,
  type GarminSyncFailureCode,
  type GarminSyncImportActivity,
  type GarminSyncLimits,
  type GarminSyncOptions,
  type GarminSyncProgress,
  type GarminSyncResult,
} from "./garminSyncContracts";

const EXTERNAL_ACTIVITY_ID = /^[1-9][0-9]{0,18}$/u;
const CURSOR = /^(?:0|[1-9][0-9]{0,4})$/u;
const ADAPTER_ERROR_CODES: ReadonlySet<GarminNativeErrorCode | "garmin_page_invalid" | "garmin_activity_id_invalid"> = new Set([
  "invalid_credentials",
  "mfa_expired",
  "sign_in_required",
  "data_access_denied",
  "rate_limited",
  "offline",
  "timeout",
  "temporary_failure",
  "malformed_response",
  "stale_generation",
  "operation_rejected",
  "arguments_rejected",
  "garmin_page_invalid",
  "garmin_activity_id_invalid",
]);

type MutableCounts = {
  pages: number;
  discoveredActivities: number;
  attemptedActivities: number;
  newActivities: number;
  unchangedActivities: number;
  reviewActivities: number;
  failedActivities: number;
};

type ConnectionFence = Readonly<{
  accountNamespace: string;
  generation: number;
}>;

class GarminSyncControlError extends Error {
  constructor(readonly code: GarminSyncFailureCode) {
    super(code);
    this.name = "GarminSyncControlError";
  }
}

function emptyCounts(): MutableCounts {
  return {
    pages: 0,
    discoveredActivities: 0,
    attemptedActivities: 0,
    newActivities: 0,
    unchangedActivities: 0,
    reviewActivities: 0,
    failedActivities: 0,
  };
}

function snapshot(counts: MutableCounts): GarminSyncCounts {
  return Object.freeze({ ...counts });
}

function configuredLimits(input?: Partial<GarminSyncLimits>): GarminSyncLimits {
  const limits = { ...GARMIN_SYNC_DEFAULT_LIMITS, ...input };
  if (!Number.isSafeInteger(limits.pageSize) || limits.pageSize < 1 || limits.pageSize > GARMIN_SYNC_HARD_LIMITS.pageSize
    || !Number.isSafeInteger(limits.maxPages) || limits.maxPages < 1 || limits.maxPages > GARMIN_SYNC_HARD_LIMITS.maxPages
    || !Number.isSafeInteger(limits.maxActivities) || limits.maxActivities < 1 || limits.maxActivities > GARMIN_SYNC_HARD_LIMITS.maxActivities) {
    throw new GarminSyncControlError("malformed_response");
  }
  return Object.freeze(limits);
}

function failure(code: GarminSyncFailureCode, retryAfterMs?: number): GarminSyncFailure {
  const retryable = code === "sync_in_progress"
    || code === "rate_limited"
    || code === "offline"
    || code === "timeout"
    || code === "temporary_failure";
  if (code === "rate_limited" && retryAfterMs !== undefined) {
    const bounded = Math.min(
      GARMIN_SYNC_HARD_LIMITS.maxRetryAfterMs,
      Math.max(1_000, retryAfterMs),
    );
    return Object.freeze({ code, retryable, retryAfterMs: bounded });
  }
  return Object.freeze({ code, retryable });
}

function adapterFailureCode(code: GarminNativeErrorCode | "garmin_page_invalid" | "garmin_activity_id_invalid"): GarminSyncFailureCode {
  switch (code) {
    case "sign_in_required":
    case "data_access_denied":
    case "rate_limited":
    case "offline":
    case "timeout":
    case "temporary_failure":
    case "malformed_response":
    case "stale_generation":
      return code;
    case "invalid_credentials":
    case "mfa_expired":
      return "sign_in_required";
    case "operation_rejected":
    case "arguments_rejected":
    case "garmin_page_invalid":
    case "garmin_activity_id_invalid":
      return "malformed_response";
  }
}

function reduceFailure(error: unknown): GarminSyncFailure {
  if (error instanceof GarminSyncControlError) return failure(error.code);
  if (error instanceof Error && error.name === "GarminActivityAdapterError") {
    const candidate = error as Error & Readonly<{ code?: unknown; retryAfterMs?: unknown }>;
    if (typeof candidate.code === "string" && ADAPTER_ERROR_CODES.has(candidate.code as GarminNativeErrorCode)) {
      const retryAfterMs = Number.isSafeInteger(candidate.retryAfterMs) && (candidate.retryAfterMs as number) >= 0
        ? candidate.retryAfterMs as number
        : undefined;
      return failure(adapterFailureCode(candidate.code as GarminNativeErrorCode), retryAfterMs);
    }
  }
  if (error instanceof GarminActivityNormalizationError
    || error instanceof GarminCanonicalPayloadError
    || error instanceof GarminImportBoundaryError) {
    return failure("malformed_response");
  }
  return failure("temporary_failure");
}

function terminal(counts: MutableCounts, error: GarminSyncFailure): GarminSyncResult {
  const handled = counts.newActivities + counts.unchangedActivities + counts.reviewActivities;
  return handled > 0
    ? Object.freeze({ kind: "partial", counts: snapshot(counts), failure: error })
    : Object.freeze({ kind: "failure", counts: snapshot(counts), failure: error });
}

function emit(options: GarminSyncOptions, kind: GarminSyncProgress["kind"], counts: MutableCounts): void {
  options.onProgress?.(Object.freeze({ kind, counts: snapshot(counts) }));
}

function validateSummary(
  value: GarminActivityDiscovery,
  fence: ConnectionFence,
  seenActivityIds: Set<string>,
): string {
  const summary = value;
  if (!EXTERNAL_ACTIVITY_ID.test(summary.external_activity_id)
    || summary.account_namespace !== fence.accountNamespace
    || seenActivityIds.has(summary.external_activity_id)) {
    throw new GarminSyncControlError("malformed_response");
  }
  seenActivityIds.add(summary.external_activity_id);
  return summary.external_activity_id;
}

function validateEnvelope(
  value: GarminSourceEnvelope,
  externalActivityId: string,
  fence: ConnectionFence,
): GarminSourceEnvelope {
  const envelope = parseGarminSourceEnvelope(value) as GarminSourceEnvelope;
  if (envelope.external_activity_id !== externalActivityId
    || envelope.account_namespace !== fence.accountNamespace) {
    throw new GarminSyncControlError("malformed_response");
  }
  return envelope;
}

async function captureConnection(source: GarminActivitySourcePort): Promise<ConnectionFence> {
  const state = await source.connectionState();
  if (state.kind !== "connected") throw new GarminSyncControlError("sign_in_required");
  return Object.freeze({
    accountNamespace: state.account_namespace,
    generation: state.generation,
  });
}

async function assertCurrentConnection(
  source: GarminActivitySourcePort,
  expected: ConnectionFence,
): Promise<void> {
  const current = await source.connectionState();
  if (current.kind !== "connected"
    || current.generation !== expected.generation
    || current.account_namespace !== expected.accountNamespace) {
    throw new GarminSyncControlError("stale_generation");
  }
}

function nextCursor(value: string | undefined, prior: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!CURSOR.test(value)) throw new GarminSyncControlError("malformed_response");
  const numeric = Number(value);
  const priorNumeric = prior === undefined ? -1 : Number(prior);
  if (numeric > GARMIN_SYNC_HARD_LIMITS.maxCursor || numeric <= priorNumeric) {
    throw new GarminSyncControlError("malformed_response");
  }
  return value;
}

export function createGarminSharedImportCommitter(input: Readonly<{
  repository: ImportedActivityCommandRepository;
  sha256: GarminSha256;
  requestFor: GarminSharedImportRequestFactory;
}>): GarminSyncImportActivity {
  return async (envelope, assertCurrentGeneration) => {
    const staged = await prepareGarminImport(envelope, input.sha256);
    const request = await input.requestFor(staged);
    await assertCurrentGeneration();
    return confirmGarminImportDate(input.repository, { ...request, staged });
  };
}

export function createGarminSyncCoordinator(input: Readonly<{
  source: GarminActivitySourcePort;
  importActivity: GarminSyncImportActivity;
  limits?: Partial<GarminSyncLimits>;
}>): GarminSyncCoordinator {
  const limits = configuredLimits(input.limits);
  let active = false;

  return Object.freeze({
    async syncNow(options: GarminSyncOptions = {}): Promise<GarminSyncResult> {
      const counts = emptyCounts();
      if (active) {
        return Object.freeze({
          kind: "failure",
          counts: snapshot(counts),
          failure: failure("sync_in_progress"),
        });
      }
      active = true;
      try {
        const fence = await captureConnection(input.source);
        const seenActivityIds = new Set<string>();
        let cursor: string | undefined;

        for (let pageIndex = 0; pageIndex < limits.maxPages; pageIndex += 1) {
          if (options.isCancelled?.() === true) {
            return Object.freeze({ kind: "cancelled", counts: snapshot(counts) });
          }
          if (pageIndex > 0) await assertCurrentConnection(input.source, fence);
          const page = await input.source.listRunningSummaries({
            ...(cursor === undefined ? {} : { cursor }),
            limit: limits.pageSize,
          });
          if (!Array.isArray(page.items) || page.items.length > limits.pageSize) {
            throw new GarminSyncControlError("malformed_response");
          }
          counts.pages += 1;
          const remaining = limits.maxActivities - counts.discoveredActivities;
          const selected = page.items.slice(0, remaining);
          counts.discoveredActivities += selected.length;
          emit(options, "page", counts);

          for (const summary of selected) {
            if (options.isCancelled?.() === true) {
              return Object.freeze({ kind: "cancelled", counts: snapshot(counts) });
            }
            counts.attemptedActivities += 1;
            emit(options, "activity", counts);
            try {
              const externalActivityId = validateSummary(summary, fence, seenActivityIds);
              await assertCurrentConnection(input.source, fence);
              const envelope = validateEnvelope(
                await input.source.readActivity(externalActivityId),
                externalActivityId,
                fence,
              );
              if (options.isCancelled?.() === true) {
                return Object.freeze({ kind: "cancelled", counts: snapshot(counts) });
              }
              await assertCurrentConnection(input.source, fence);
              const result = await input.importActivity(
                envelope,
                () => assertCurrentConnection(input.source, fence),
              );
              switch (result.kind) {
                case "imported":
                  counts.newActivities += 1;
                  break;
                case "replayed":
                case "removed":
                  counts.unchangedActivities += 1;
                  break;
                case "revision_review":
                  counts.reviewActivities += 1;
                  break;
                case "date_confirmation_required":
                  counts.failedActivities += 1;
                  return terminal(counts, failure("date_confirmation_required"));
                case "conflict":
                  counts.failedActivities += 1;
                  return terminal(counts, failure("import_conflict"));
              }
              emit(options, "committed", counts);
            } catch (error) {
              counts.failedActivities += 1;
              return terminal(counts, reduceFailure(error));
            }
          }

          if (counts.discoveredActivities >= limits.maxActivities) {
            return Object.freeze({ kind: "success", counts: snapshot(counts) });
          }
          const resolvedCursor = nextCursor(page.next_cursor, cursor);
          if (resolvedCursor === undefined) {
            return Object.freeze({ kind: "success", counts: snapshot(counts) });
          }
          cursor = resolvedCursor;
        }
        return Object.freeze({ kind: "success", counts: snapshot(counts) });
      } catch (error) {
        return terminal(counts, reduceFailure(error));
      } finally {
        active = false;
      }
    },
  });
}
