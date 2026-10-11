import type { GarminSourceEnvelope } from "../../domains/activities/garminActivitySourcePort";
import type {
  GarminImportResult,
  PreparedGarminImport,
} from "../../domains/activities/importCommands";

export const GARMIN_SYNC_DEFAULT_LIMITS = Object.freeze({
  pageSize: 20,
  maxPages: 5,
  maxActivities: 100,
});

export const GARMIN_SYNC_HARD_LIMITS = Object.freeze({
  pageSize: 50,
  maxPages: 100,
  maxActivities: 1_000,
  maxCursor: 10_000,
  maxRetryAfterMs: 900_000,
});

export type GarminSyncLimits = Readonly<{
  pageSize: number;
  maxPages: number;
  maxActivities: number;
}>;

export type GarminSyncCounts = Readonly<{
  pages: number;
  discoveredActivities: number;
  attemptedActivities: number;
  newActivities: number;
  unchangedActivities: number;
  reviewActivities: number;
  failedActivities: number;
}>;

export type GarminSyncFailureCode =
  | "sync_in_progress"
  | "sign_in_required"
  | "data_access_denied"
  | "rate_limited"
  | "offline"
  | "timeout"
  | "temporary_failure"
  | "malformed_response"
  | "stale_generation"
  | "import_conflict";

export type GarminSyncFailure = Readonly<{
  code: GarminSyncFailureCode;
  retryable: boolean;
  retryAfterMs?: number;
}>;

export type GarminSyncProgress =
  | Readonly<{ kind: "page"; counts: GarminSyncCounts }>
  | Readonly<{ kind: "activity"; counts: GarminSyncCounts }>
  | Readonly<{ kind: "committed"; counts: GarminSyncCounts }>;

export type GarminSyncResult =
  | Readonly<{ kind: "success"; counts: GarminSyncCounts }>
  | Readonly<{ kind: "partial"; counts: GarminSyncCounts; failure: GarminSyncFailure }>
  | Readonly<{ kind: "failure"; counts: GarminSyncCounts; failure: GarminSyncFailure }>
  | Readonly<{ kind: "cancelled"; counts: GarminSyncCounts }>;

export type GarminSyncOptions = Readonly<{
  isCancelled?: () => boolean;
  onProgress?: (progress: GarminSyncProgress) => void;
}>;

export type GarminSyncImportActivity = (
  envelope: GarminSourceEnvelope,
  assertCurrentGeneration: () => Promise<void>,
) => Promise<GarminImportResult>;

export type GarminSharedImportRequest = Readonly<{
  requestId: string;
  requestSha256: string;
  activityId: string;
  expectedAggregateRevision: number;
  confirmedLocalDate: string;
}>;

export type GarminSharedImportRequestFactory = (
  prepared: PreparedGarminImport,
) => GarminSharedImportRequest | Promise<GarminSharedImportRequest>;

export type GarminSyncCoordinator = Readonly<{
  syncNow(options?: GarminSyncOptions): Promise<GarminSyncResult>;
}>;
