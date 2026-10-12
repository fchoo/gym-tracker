import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { readFileSync } from "node:fs";

import {
  PHASE18_GARMIN_PROOF_CASE_IDS,
  PHASE18_GARMIN_PROOF_CONFIRMATION,
  createPhase18GarminProofHarness,
  phase18GarminProofEnabled,
} from "./phase18GarminProof";
import type { GarminConnectionState } from "../domains/activities/garminActivitySourcePort";
import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";

const HASH = "a".repeat(64);

function ok(generation: number, data: unknown) {
  return { status: "ok", generation, data } as const;
}

function fixture() {
  const authPort = {
    login: jest.fn(async (): Promise<GarminConnectionState> => ({
      kind: "connected" as const,
      account_namespace: "private-account-namespace",
      generation: 1,
    })),
    resumeMfa: jest.fn(async (): Promise<GarminConnectionState> => ({
      kind: "connected" as const,
      account_namespace: "private-account-namespace",
      generation: 1,
    })),
  };
  const nativePort = {
    sessionRecordState: jest.fn<GarminConnectNativeModule["sessionRecordState"]>()
      .mockResolvedValueOnce({ present: true, version: 1, sha256: "1".repeat(64) })
      .mockResolvedValueOnce({ present: true, version: 1, sha256: "2".repeat(64) }),
    forceRefreshForTest: jest.fn(async () => ok(2, {
      kind: "connected",
      account_namespace: "private-account-namespace",
    })),
    restoreSession: jest.fn(async () => ok(2, {
      kind: "connected",
      account_namespace: "private-account-namespace",
    })),
    getActivities: jest.fn(async () => ok(2, {
      items: [{ activityId: "123456789", privateLabel: "private-running-title" }],
    })),
    getActivity: jest.fn(async () => ok(2, {
      activityId: "123456789",
      averageHeartRate: 151,
    })),
    getActivitySplits: jest.fn(async () => ok(2, [{ distance: 1_000 }])),
    getActivityDetails: jest.fn(async () => ok(2, {
      route: [{ latitude: 1, longitude: 2 }],
    })),
  };
  let now = 1_000;
  return {
    authPort,
    nativePort,
    harness: createPhase18GarminProofHarness({
      authPort,
      nativePort,
      now: () => now++,
      sha256: async () => HASH,
    }),
  };
}

describe("Phase 18 guarded Garmin proof", () => {
  it("keeps proof secrets out of React state and controlled input props", () => {
    const route = readFileSync("app/__phase18-garmin-proof.tsx", "utf8");
    const secretInput = (label: string) => {
      const start = route.indexOf(`accessibilityLabel="${label}"`);
      const end = route.indexOf("/>", start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return route.slice(start, end);
    };

    expect(route).not.toMatch(
      /const\s+\[(?:password|mfaCode|challengeHandle),[^\]]+\]\s*=\s*React\.useState/u,
    );
    expect(secretInput("Garmin password")).not.toMatch(/\bvalue=/u);
    expect(secretInput("Garmin MFA code")).not.toMatch(/\bvalue=/u);
  });

  it("clears native proof inputs and every private secret ref on all lifecycle exits", () => {
    const route = readFileSync("app/__phase18-garmin-proof.tsx", "utf8");

    expect(route).toMatch(/passwordInputRef\.current\?\.clear\(\)/u);
    expect(route).toMatch(/mfaCodeInputRef\.current\?\.clear\(\)/u);
    expect(route).toMatch(/passwordRef\.current\s*=\s*""/u);
    expect(route).toMatch(/mfaCodeRef\.current\s*=\s*""/u);
    expect(route).toMatch(/challengeHandleRef\.current\s*=\s*null/u);
    expect(route).toMatch(/finally\s*\{[^}]*clearPassword/u);
    expect(route).toMatch(/finally\s*\{[^}]*clearMfa/u);
    expect(route).toMatch(/return\s*\(\)\s*=>\s*\{[^}]*clearAllSecrets/u);
    expect(route).toContain("accessibilityLabel=\"Cancel Garmin proof\"");
  });

  it("keeps the exact seven-case native proof order", () => {
    expect(PHASE18_GARMIN_PROOF_CASE_IDS).toEqual([
      "PH18-PKG",
      "PH18-LOGIN",
      "PH18-MFA",
      "PH18-READ",
      "PH18-RESTART",
      "PH18-REFRESH",
      "PH18-PRIVACY",
    ]);
  });

  it("opens only for the exact development-test profile, suite, and confirmation", () => {
    const exact = {
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "phase18-garmin-proof",
      confirmation: PHASE18_GARMIN_PROOF_CONFIRMATION,
    };
    expect(phase18GarminProofEnabled(exact)).toBe(true);
    for (const input of [
      { ...exact, buildProfile: "production" },
      { ...exact, nativeContractsEnabled: false },
      { ...exact, suite: "phase18" },
      { ...exact, confirmation: "wrong-confirmation" },
      { ...exact, confirmation: undefined },
    ]) {
      expect(phase18GarminProofEnabled(input)).toBe(false);
    }
  });

  it("records login and an unrequested MFA case without retaining foreground secrets", async () => {
    const { authPort, harness } = fixture();
    const result = await harness.login({
      email: "owner@example.invalid",
      password: "never-persist-this",
    });

    expect(result).toEqual({
      next: "read",
      cases: [
        { id: "PH18-LOGIN", status: "passed", duration_ms: 1 },
        {
          id: "PH18-MFA",
          status: "passed",
          duration_ms: 0,
          outcome: "not_requested",
        },
      ],
    });
    expect(authPort.login).toHaveBeenCalledWith({
      email: "owner@example.invalid",
      password: "never-persist-this",
    });
    expect(JSON.stringify(result.cases)).not.toMatch(
      /owner|password|credential|email|token|account/iu,
    );
  });

  it("keeps an MFA challenge internal and emits only a bounded completion case", async () => {
    const { authPort, harness } = fixture();
    authPort.login.mockResolvedValueOnce({
      kind: "mfa_required",
      challenge_handle: "opaque-challenge-handle-0001",
      generation: 1,
    });
    const login = await harness.login({
      email: "owner@example.invalid",
      password: "never-persist-this",
    });
    expect(login.cases).toEqual([
      { id: "PH18-LOGIN", status: "passed", duration_ms: 1 },
    ]);
    expect(login.next).toEqual({
      kind: "mfa",
      challengeHandle: "opaque-challenge-handle-0001",
    });

    const result = await harness.resumeMfa(
      "opaque-challenge-handle-0001",
      "123456",
    );
    expect(result).toEqual({
      next: "read",
      cases: [{
        id: "PH18-MFA",
        status: "passed",
        duration_ms: 1,
        outcome: "completed",
      }],
    });
    expect(JSON.stringify(result.cases)).not.toMatch(
      /123456|challenge|code|token|account/iu,
    );
  });

  it("performs the fixed bounded read and exposes only count, timing, and a digest", async () => {
    const { nativePort, harness } = fixture();
    const result = await harness.readOneActivity();

    expect(result).toEqual({
      id: "PH18-READ",
      status: "passed",
      duration_ms: 1,
      count: 1,
      result_sha256: HASH,
    });
    expect(nativePort.getActivities).toHaveBeenCalledWith({
      start: 0,
      limit: 1,
      activityType: "running",
    });
    expect(nativePort.getActivity).toHaveBeenCalledWith({
      externalActivityId: "123456789",
    });
    expect(nativePort.getActivitySplits).toHaveBeenCalledWith({
      externalActivityId: "123456789",
    });
    expect(nativePort.getActivityDetails).toHaveBeenCalledWith({
      externalActivityId: "123456789",
      maxchart: 2_000,
      maxpoly: 4_000,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /123456789|private|heart|route|latitude|longitude/iu,
    );
  });

  it("restores the encrypted native session before the second bounded read", async () => {
    const { nativePort, harness } = fixture();
    const result = await harness.restoreAndRefresh();

    expect(result).toEqual([
      { id: "PH18-RESTART", status: "passed", duration_ms: 1 },
      {
        id: "PH18-REFRESH",
        status: "passed",
        duration_ms: 1,
        count: 1,
        result_sha256: HASH,
      },
    ]);
    expect(nativePort.restoreSession).toHaveBeenCalledTimes(1);
    expect(nativePort.forceRefreshForTest).toHaveBeenCalledTimes(1);
    expect(nativePort.sessionRecordState).toHaveBeenCalledTimes(2);
  });

  it("collapses unknown failures to a bounded technical-review result", async () => {
    const { nativePort, harness } = fixture();
    nativePort.getActivities.mockRejectedValueOnce(
      new Error("private URL token activity 123456789"),
    );

    const result = await harness.readOneActivity();
    expect(result).toEqual({
      id: "PH18-READ",
      status: "TECHNICAL_REVIEW_REQUIRED",
      duration_ms: 1,
      code: "temporary_failure",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|url|token|activity 123456789/iu,
    );
  });
});
