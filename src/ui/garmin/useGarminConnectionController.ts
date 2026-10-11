import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  GarminActivitySourcePort,
  GarminConnectionState,
} from "../../domains/activities/garminActivitySourcePort";
import type {
  GarminSyncCoordinator,
  GarminSyncCounts,
  GarminSyncFailure,
  GarminSyncProgress,
  GarminSyncResult,
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

const CONNECTION_ERROR_CODES = new Set<GarminConnectionControllerError["code"]>([
  "invalid_credentials",
  "mfa_expired",
  "sign_in_required",
  "data_access_denied",
  "rate_limited",
  "offline",
  "timeout",
  "temporary_failure",
  "malformed_response",
]);

function controllerError(error: unknown): GarminConnectionControllerError {
  if (error instanceof Error && error.name === "GarminActivityAdapterError") {
    const candidate = error as Error & Readonly<{
      code?: unknown;
      retryAfterMs?: unknown;
      retryable?: unknown;
    }>;
    if (typeof candidate.code === "string"
      && CONNECTION_ERROR_CODES.has(candidate.code as GarminConnectionControllerError["code"])) {
      const retryAfterMs = candidate.code === "rate_limited"
        && Number.isSafeInteger(candidate.retryAfterMs)
        && (candidate.retryAfterMs as number) >= 0
          ? Math.min(900_000, Math.max(1_000, candidate.retryAfterMs as number))
          : undefined;
      return Object.freeze({
        code: candidate.code as GarminConnectionControllerError["code"],
        retryable: candidate.retryable === true
          || candidate.code === "offline"
          || candidate.code === "timeout"
          || candidate.code === "temporary_failure"
          || candidate.code === "rate_limited",
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    }
  }
  return Object.freeze({ code: "temporary_failure", retryable: true });
}

function connectionKind(
  value: GarminConnectionState,
  challengeHandleRef: React.MutableRefObject<string | null>,
): GarminConnectionControllerState["connection"] {
  switch (value.kind) {
    case "disconnected":
      challengeHandleRef.current = null;
      return "disconnected";
    case "connected":
      challengeHandleRef.current = null;
      return "connected";
    case "mfa_required":
      challengeHandleRef.current = value.challenge_handle;
      return "mfa";
  }
}

function committedCount(counts: GarminSyncCounts): number {
  return counts.newActivities + counts.unchangedActivities + counts.reviewActivities;
}

export function useGarminConnectionController(input: GarminConnectionControllerInput) {
  const inputRef = useRef(input);
  inputRef.current = input;
  const mountedRef = useRef(true);
  const connectionGenerationRef = useRef(0);
  const historyGenerationRef = useRef(0);
  const syncGenerationRef = useRef(0);
  const connectionLatchRef = useRef(false);
  const syncLatchRef = useRef(false);
  const passwordRef = useRef("");
  const mfaCodeRef = useRef("");
  const challengeHandleRef = useRef<string | null>(null);
  const [state, setState] = useState<GarminConnectionControllerState>(INITIAL_STATE);

  const clearPassword = useCallback(() => {
    passwordRef.current = "";
    inputRef.current.clearPasswordInput?.();
  }, []);

  const clearMfaCode = useCallback(() => {
    mfaCodeRef.current = "";
    inputRef.current.clearMfaCodeInput?.();
  }, []);

  const loadHistory = useCallback(async (): Promise<boolean> => {
    const generation = ++historyGenerationRef.current;
    setState((current) => ({ ...current, historyStatus: "loading" }));
    try {
      const activities = await inputRef.current.loadActivities();
      if (!mountedRef.current || generation !== historyGenerationRef.current) return false;
      setState((current) => ({
        ...current,
        activities: Object.freeze([...activities]),
        historyStatus: "ready",
        error: current.error?.code === "history_unavailable" ? null : current.error,
      }));
      return true;
    } catch {
      if (!mountedRef.current || generation !== historyGenerationRef.current) return false;
      setState((current) => ({
        ...current,
        historyStatus: "failed",
        error: Object.freeze({ code: "history_unavailable", retryable: true }),
      }));
      return false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const generation = ++connectionGenerationRef.current;
    void inputRef.current.source.connectionState().then((connection) => {
      if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
      setState((current) => ({
        ...current,
        connection: connectionKind(connection, challengeHandleRef),
        error: null,
      }));
    }).catch((error: unknown) => {
      if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
      setState((current) => ({
        ...current,
        connection: "disconnected",
        error: controllerError(error),
      }));
    });
    void loadHistory();
    return () => {
      mountedRef.current = false;
      connectionGenerationRef.current += 1;
      historyGenerationRef.current += 1;
      syncGenerationRef.current += 1;
      connectionLatchRef.current = false;
      syncLatchRef.current = false;
      challengeHandleRef.current = null;
      passwordRef.current = "";
      mfaCodeRef.current = "";
    };
  }, [loadHistory]);

  const openCredentials = useCallback(() => {
    if (connectionLatchRef.current) return;
    challengeHandleRef.current = null;
    passwordRef.current = "";
    mfaCodeRef.current = "";
    setState((current) => ({
      ...current,
      connection: "credentials",
      operation: "idle",
      error: null,
    }));
  }, []);

  const setEmail = useCallback((email: string) => {
    setState((current) => ({ ...current, email }));
  }, []);

  const setPassword = useCallback((password: string) => {
    passwordRef.current = password;
  }, []);

  const submitCredentials = useCallback(async () => {
    if (connectionLatchRef.current || state.connection !== "credentials") return;
    const email = state.email.trim();
    const password = passwordRef.current;
    if (email.length === 0 || password.length === 0) {
      clearPassword();
      setState((current) => ({
        ...current,
        error: Object.freeze({ code: "invalid_credentials", retryable: true }),
      }));
      return;
    }
    connectionLatchRef.current = true;
    const generation = ++connectionGenerationRef.current;
    setState((current) => ({ ...current, operation: "connecting", error: null }));
    try {
      const connection = await inputRef.current.source.login({ email, password });
      if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
      const nextConnection = connectionKind(connection, challengeHandleRef);
      setState((current) => ({
        ...current,
        connection: nextConnection,
        operation: "idle",
        error: nextConnection === "disconnected"
          ? Object.freeze({ code: "sign_in_required", retryable: true })
          : null,
      }));
      if (nextConnection === "connected") await loadHistory();
    } catch (error) {
      if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
      setState((current) => ({
        ...current,
        connection: "credentials",
        operation: "idle",
        error: controllerError(error),
      }));
    } finally {
      clearPassword();
      if (generation === connectionGenerationRef.current) {
        connectionLatchRef.current = false;
        if (mountedRef.current) {
          setState((current) => ({ ...current, operation: "idle" }));
        }
      }
    }
  }, [clearPassword, loadHistory, state.connection, state.email]);

  const setMfaCode = useCallback((code: string) => {
    mfaCodeRef.current = code;
  }, []);

  const submitMfa = useCallback(async () => {
    if (connectionLatchRef.current || state.connection !== "mfa") return;
    const challengeHandle = challengeHandleRef.current;
    const code = mfaCodeRef.current;
    if (challengeHandle === null || code.length === 0) {
      clearMfaCode();
      setState((current) => ({
        ...current,
        error: Object.freeze({ code: "mfa_expired", retryable: true }),
      }));
      return;
    }
    connectionLatchRef.current = true;
    const generation = ++connectionGenerationRef.current;
    setState((current) => ({ ...current, operation: "verifying_mfa", error: null }));
    try {
      const connection = await inputRef.current.source.resumeMfa({ challenge_handle: challengeHandle, code });
      if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
      const nextConnection = connectionKind(connection, challengeHandleRef);
      setState((current) => ({
        ...current,
        connection: nextConnection,
        operation: "idle",
        error: nextConnection === "connected"
          ? null
          : Object.freeze({ code: "mfa_expired", retryable: true }),
      }));
      if (nextConnection === "connected") await loadHistory();
    } catch (error) {
      if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
      setState((current) => ({
        ...current,
        connection: "mfa",
        operation: "idle",
        error: controllerError(error),
      }));
    } finally {
      clearMfaCode();
      if (generation === connectionGenerationRef.current) {
        connectionLatchRef.current = false;
        if (mountedRef.current) {
          setState((current) => ({ ...current, operation: "idle" }));
        }
      }
    }
  }, [clearMfaCode, loadHistory, state.connection]);

  const cancelConnection = useCallback(async () => {
    const shouldInvalidateSession = state.connection === "mfa"
      || state.operation === "connecting"
      || state.operation === "verifying_mfa";
    connectionGenerationRef.current += 1;
    syncGenerationRef.current += 1;
    connectionLatchRef.current = false;
    syncLatchRef.current = false;
    challengeHandleRef.current = null;
    clearPassword();
    clearMfaCode();
    if (shouldInvalidateSession) {
      try {
        await inputRef.current.source.logout();
      } catch {
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            operation: "idle",
            error: Object.freeze({ code: "logout_failed", retryable: true }),
          }));
        }
        return;
      }
    }
    if (mountedRef.current) {
      setState((current) => ({
        ...current,
        connection: "disconnected",
        operation: "idle",
        error: null,
        sync: Object.freeze({ kind: "idle" }),
      }));
    }
  }, [clearMfaCode, clearPassword, state.connection, state.operation]);

  const syncNow = useCallback(async () => {
    if (syncLatchRef.current || state.connection !== "connected") return;
    syncLatchRef.current = true;
    const generation = ++syncGenerationRef.current;
    setState((current) => ({
      ...current,
      operation: "syncing",
      error: null,
      sync: Object.freeze({ kind: "syncing" }),
    }));
    let result: GarminSyncResult | undefined;
    try {
      result = await inputRef.current.coordinator.syncNow({
        isCancelled: () => generation !== syncGenerationRef.current,
        onProgress: (progress) => {
          if (!mountedRef.current || generation !== syncGenerationRef.current) return;
          setState((current) => ({
            ...current,
            sync: Object.freeze({ kind: "syncing", progress }),
          }));
        },
      });
      if (!mountedRef.current || generation !== syncGenerationRef.current) return;
      if ((result.kind === "success" || result.kind === "partial")
        && committedCount(result.counts) > 0) {
        await loadHistory();
      }
      if (!mountedRef.current || generation !== syncGenerationRef.current) return;
      switch (result.kind) {
        case "success":
          setState((current) => ({
            ...current,
            operation: "idle",
            sync: Object.freeze({
              kind: "success",
              counts: result!.counts,
              completedAtMs: inputRef.current.now?.() ?? Date.now(),
            }),
          }));
          break;
        case "partial":
          setState((current) => ({
            ...current,
            operation: "idle",
            sync: Object.freeze({ kind: "partial", counts: result!.counts, failure: result!.failure }),
          }));
          break;
        case "failure":
          setState((current) => ({
            ...current,
            operation: "idle",
            sync: Object.freeze({ kind: "failure", counts: result!.counts, failure: result!.failure }),
          }));
          break;
        case "cancelled":
          setState((current) => ({
            ...current,
            operation: "idle",
            sync: Object.freeze({ kind: "idle" }),
          }));
          break;
      }
    } finally {
      if (generation === syncGenerationRef.current) {
        syncLatchRef.current = false;
        if (mountedRef.current && result === undefined) {
          setState((current) => ({
            ...current,
            operation: "idle",
            sync: Object.freeze({ kind: "idle" }),
            error: Object.freeze({ code: "temporary_failure", retryable: true }),
          }));
        }
      }
    }
  }, [loadHistory, state.connection]);

  const disconnect = useCallback(async () => {
    if (connectionLatchRef.current || state.connection !== "connected") return;
    connectionLatchRef.current = true;
    const generation = ++connectionGenerationRef.current;
    syncGenerationRef.current += 1;
    syncLatchRef.current = false;
    setState((current) => ({ ...current, operation: "disconnecting", error: null }));
    try {
      await inputRef.current.source.logout();
      if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
      challengeHandleRef.current = null;
      setState((current) => ({
        ...current,
        connection: "disconnected",
        operation: "idle",
        error: null,
        sync: Object.freeze({ kind: "idle" }),
      }));
      await loadHistory();
    } catch {
      if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
      setState((current) => ({
        ...current,
        connection: "connected",
        operation: "idle",
        error: Object.freeze({ code: "logout_failed", retryable: true }),
      }));
    } finally {
      clearPassword();
      clearMfaCode();
      if (generation === connectionGenerationRef.current) connectionLatchRef.current = false;
    }
  }, [clearMfaCode, clearPassword, loadHistory, state.connection]);

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return Object.freeze({
    state,
    openCredentials,
    setEmail,
    setPassword,
    submitCredentials,
    setMfaCode,
    submitMfa,
    cancelConnection,
    syncNow,
    disconnect,
    clearError,
  });
}
