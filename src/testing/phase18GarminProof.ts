import type {
  GarminActivitySourcePort,
  GarminConnectionState,
} from "../domains/activities/garminActivitySourcePort";
import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";

export const PHASE18_GARMIN_PROOF_CONFIRMATION =
  "VERIFY-PHASE18-GARMIN-REAL-ACCOUNT";
export const PHASE18_GARMIN_PROOF_RESULT_MARKER =
  "GYM_TRACKER_PHASE18_GARMIN_PROOF_RESULT:";

export const PHASE18_GARMIN_PROOF_CASE_IDS = Object.freeze([
  "PH18-PKG",
  "PH18-LOGIN",
  "PH18-MFA",
  "PH18-READ",
  "PH18-RESTART",
  "PH18-REFRESH",
  "PH18-PRIVACY",
] as const);

export type Phase18GarminProofCaseId =
  typeof PHASE18_GARMIN_PROOF_CASE_IDS[number];

const HASH = /^[a-f0-9]{64}$/u;
const ACTIVITY_ID = /^[1-9][0-9]{0,18}$/u;
const SAFE_FAILURE_CODES = new Set([
  "arguments_rejected",
  "data_access_denied",
  "invalid_credentials",
  "malformed_response",
  "mfa_expired",
  "offline",
  "operation_rejected",
  "rate_limited",
  "sign_in_required",
  "stale_generation",
  "temporary_failure",
  "timeout",
]);

type Phase18AuthPort = Pick<
  GarminActivitySourcePort,
  "login" | "resumeMfa"
>;

type Phase18NativePort = Pick<
  GarminConnectNativeModule,
  | "restoreSession"
  | "forceRefreshForTest"
  | "sessionRecordState"
  | "getActivities"
  | "getActivity"
  | "getActivitySplits"
  | "getActivityDetails"
>;

export type Phase18PassedCase = Readonly<{
  id: Phase18GarminProofCaseId;
  status: "passed";
  duration_ms: number;
  count?: number;
  result_sha256?: string;
  outcome?: "completed" | "not_requested";
}>;

export type Phase18TechnicalReviewCase = Readonly<{
  id: Phase18GarminProofCaseId;
  status: "TECHNICAL_REVIEW_REQUIRED";
  duration_ms: number;
  code: string;
}>;

export type Phase18GarminProofCase =
  | Phase18PassedCase
  | Phase18TechnicalReviewCase;

export function phase18GarminProofEnabled(input: Readonly<{
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  confirmation?: unknown;
}>): boolean {
  return input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === "phase18-garmin-proof"
    && input.confirmation === PHASE18_GARMIN_PROOF_CONFIRMATION;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("malformed_response");
  }
  return value as Record<string, unknown>;
}

function safeGeneration(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("malformed_response");
  }
  return value as number;
}

function nativeSuccess(value: unknown): Readonly<{
  generation: number;
  data: unknown;
}> {
  const result = record(value);
  if (result.status === "error") {
    const error = record(result.error);
    throw new Error(
      typeof error.code === "string" && SAFE_FAILURE_CODES.has(error.code)
        ? error.code
        : "temporary_failure",
    );
  }
  if (result.status !== "ok") throw new Error("malformed_response");
  return Object.freeze({
    generation: safeGeneration(result.generation),
    data: result.data,
  });
}

function connected(value: unknown): number {
  const result = nativeSuccess(value);
  const data = record(result.data);
  if (data.kind !== "connected") throw new Error("sign_in_required");
  return result.generation;
}

function activityId(summary: unknown): string {
  const item = record(summary);
  const candidate = item.activityId ?? item.activity_id;
  const normalized = typeof candidate === "number"
    ? String(candidate)
    : candidate;
  if (typeof normalized !== "string" || !ACTIVITY_ID.test(normalized)) {
    throw new Error("malformed_response");
  }
  return normalized;
}

function duration(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor(end - start));
}

function failureCode(error: unknown): string {
  if (error !== null && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && SAFE_FAILURE_CODES.has(code)) return code;
  }
  if (error instanceof Error && SAFE_FAILURE_CODES.has(error.message)) {
    return error.message;
  }
  return "temporary_failure";
}

function technicalReview(
  id: Phase18GarminProofCaseId,
  startedAt: number,
  finishedAt: number,
  error: unknown,
): Phase18TechnicalReviewCase {
  return Object.freeze({
    id,
    status: "TECHNICAL_REVIEW_REQUIRED",
    duration_ms: duration(startedAt, finishedAt),
    code: failureCode(error),
  });
}

function assertHash(value: string): string {
  if (!HASH.test(value)) throw new Error("malformed_response");
  return value;
}

function sessionRecord(value: unknown): Readonly<{ version: number; sha256: string }> {
  const state = record(value);
  if (state.present !== true || !Number.isSafeInteger(state.version)
    || (state.version as number) < 1 || typeof state.sha256 !== "string") {
    throw new Error("sign_in_required");
  }
  return Object.freeze({ version: state.version as number, sha256: assertHash(state.sha256) });
}

export function createPhase18GarminProofHarness(input: Readonly<{
  authPort: Phase18AuthPort;
  nativePort: Phase18NativePort;
  sha256(value: string): Promise<string>;
  now?: () => number;
}>) {
  const now = input.now ?? Date.now;

  async function readCase(
    id: "PH18-READ" | "PH18-REFRESH",
  ): Promise<Phase18GarminProofCase> {
    const startedAt = now();
    try {
      const page = nativeSuccess(await input.nativePort.getActivities({
        start: 0,
        limit: 1,
        activityType: "running",
      }));
      const pageData = record(page.data);
      if (!Array.isArray(pageData.items) || pageData.items.length !== 1) {
        throw new Error("malformed_response");
      }
      const externalActivityId = activityId(pageData.items[0]);
      const activity = nativeSuccess(await input.nativePort.getActivity({
        externalActivityId,
      }));
      const splits = nativeSuccess(await input.nativePort.getActivitySplits({
        externalActivityId,
      }));
      const details = nativeSuccess(await input.nativePort.getActivityDetails({
        externalActivityId,
        maxchart: 2_000,
        maxpoly: 4_000,
      }));
      if (
        activity.generation !== page.generation
        || splits.generation !== page.generation
        || details.generation !== page.generation
      ) {
        throw new Error("stale_generation");
      }
      const digest = assertHash(await input.sha256(JSON.stringify({
        activity: activity.data,
        splits: splits.data,
        details: details.data,
      })));
      return Object.freeze({
        id,
        status: "passed",
        duration_ms: duration(startedAt, now()),
        count: 1,
        result_sha256: digest,
      });
    } catch (error) {
      return technicalReview(id, startedAt, now(), error);
    }
  }

  return Object.freeze({
    async login(credentials: Readonly<{ email: string; password: string }>) {
      const startedAt = now();
      try {
        const state: GarminConnectionState = await input.authPort.login(
          credentials,
        );
        const loginCase: Phase18PassedCase = Object.freeze({
          id: "PH18-LOGIN",
          status: "passed",
          duration_ms: duration(startedAt, now()),
        });
        if (state.kind === "mfa_required") {
          return Object.freeze({
            next: Object.freeze({
              kind: "mfa" as const,
              challengeHandle: state.challenge_handle,
            }),
            cases: Object.freeze([loginCase]),
          });
        }
        if (state.kind !== "connected") throw new Error("sign_in_required");
        return Object.freeze({
          next: "read" as const,
          cases: Object.freeze([
            loginCase,
            Object.freeze({
              id: "PH18-MFA" as const,
              status: "passed" as const,
              duration_ms: 0,
              outcome: "not_requested" as const,
            }),
          ]),
        });
      } catch (error) {
        return Object.freeze({
          next: "halt" as const,
          cases: Object.freeze([
            technicalReview("PH18-LOGIN", startedAt, now(), error),
          ]),
        });
      }
    },

    async resumeMfa(challengeHandle: string, code: string) {
      const startedAt = now();
      try {
        const state = await input.authPort.resumeMfa({
          challenge_handle: challengeHandle,
          code,
        });
        if (state.kind !== "connected") throw new Error("mfa_expired");
        return Object.freeze({
          next: "read" as const,
          cases: Object.freeze([
            Object.freeze({
              id: "PH18-MFA" as const,
              status: "passed" as const,
              duration_ms: duration(startedAt, now()),
              outcome: "completed" as const,
            }),
          ]),
        });
      } catch (error) {
        return Object.freeze({
          next: "halt" as const,
          cases: Object.freeze([
            technicalReview("PH18-MFA", startedAt, now(), error),
          ]),
        });
      }
    },

    async readOneActivity() {
      return readCase("PH18-READ");
    },

    async restoreAndRefresh(): Promise<readonly Phase18GarminProofCase[]> {
      const startedAt = now();
      try {
        connected(await input.nativePort.restoreSession());
      } catch (error) {
        return Object.freeze([
          technicalReview("PH18-RESTART", startedAt, now(), error),
        ]);
      }
      const restartCase: Phase18PassedCase = Object.freeze({
        id: "PH18-RESTART",
        status: "passed",
        duration_ms: duration(startedAt, now()),
      });
      const refreshStarted = now();
      try {
        const before = sessionRecord(await input.nativePort.sessionRecordState());
        connected(await input.nativePort.forceRefreshForTest());
        const after = sessionRecord(await input.nativePort.sessionRecordState());
        if (before.sha256 === after.sha256) throw new Error("stale_generation");
        const refreshCase: Phase18PassedCase = Object.freeze({
          id: "PH18-REFRESH",
          status: "passed",
          duration_ms: duration(refreshStarted, now()),
          count: 1,
          result_sha256: assertHash(await input.sha256(JSON.stringify({ before, after }))),
        });
        return Object.freeze([restartCase, refreshCase]);
      } catch (error) {
        return Object.freeze([
          restartCase,
          technicalReview("PH18-REFRESH", refreshStarted, now(), error),
        ]);
      }
    },
  });
}
