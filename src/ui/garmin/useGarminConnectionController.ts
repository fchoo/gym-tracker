import { useState } from "react";

import type { GarminActivitySourcePort } from "../../domains/activities/garminActivitySourcePort";
import type {
  GarminSyncCoordinator,
  GarminSyncCounts,
  GarminSyncFailure,
  GarminSyncProgress,
} from "../../platform/garmin/garminSyncContracts";

export type GarminActivityListItem = Readonly<{
  activityId: string;
  title: string;
  activityType: string;
  confirmedLocalDate: string;
  summary?: string;
  matchState?: "matched" | "unmatched";
  revisionState?: "accepted" | "needs_review";
}>;

export type GarminConnectionControllerError = Readonly<{
  code:
    | "invalid_credentials"
    | "mfa_expired"
    | "sign_in_required"
    | "data_access_denied"
    | "rate_limited"
    | "offline"
    | "timeout"
    | "temporary_failure"
    | "malformed_response"
    | "logout_failed"
    | "history_unavailable";
  retryable: boolean;
  retryAfterMs?: number;
}>;

export type GarminSyncPresentation =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "syncing"; progress?: GarminSyncProgress }>
  | Readonly<{ kind: "success"; counts: GarminSyncCounts; completedAtMs: number }>
  | Readonly<{ kind: "partial"; counts: GarminSyncCounts; failure: GarminSyncFailure }>
  | Readonly<{ kind: "failure"; counts: GarminSyncCounts; failure: GarminSyncFailure }>;

export type GarminConnectionControllerState = Readonly<{
  connection: "loading" | "disconnected" | "credentials" | "mfa" | "connected";
  operation: "idle" | "connecting" | "verifying_mfa" | "syncing" | "disconnecting";
  email: string;
  activities: readonly GarminActivityListItem[];
  historyStatus: "loading" | "ready" | "failed";
  error: GarminConnectionControllerError | null;
  sync: GarminSyncPresentation;
}>;

export type GarminConnectionControllerInput = Readonly<{
  source: GarminActivitySourcePort;
  coordinator: GarminSyncCoordinator;
  loadActivities(): Promise<readonly GarminActivityListItem[]>;
  clearPasswordInput?(): void;
  clearMfaCodeInput?(): void;
  now?(): number;
}>;

const INITIAL_STATE: GarminConnectionControllerState = Object.freeze({
  connection: "loading",
  operation: "idle",
  email: "",
  activities: Object.freeze([]),
  historyStatus: "loading",
  error: null,
  sync: Object.freeze({ kind: "idle" }),
});

/** Task 18-06-01 RED scaffold. */
export function useGarminConnectionController(_input: GarminConnectionControllerInput) {
  const [state] = useState<GarminConnectionControllerState>(INITIAL_STATE);
  return Object.freeze({
    state,
    openCredentials: () => undefined,
    setEmail: (_value: string) => undefined,
    setPassword: (_value: string) => undefined,
    submitCredentials: async () => undefined,
    setMfaCode: (_value: string) => undefined,
    submitMfa: async () => undefined,
    cancelConnection: async () => undefined,
    syncNow: async () => undefined,
    disconnect: async () => undefined,
    clearError: () => undefined,
  });
}
