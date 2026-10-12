import { readFileSync } from "node:fs";
import { describe, expect, it, jest } from "@jest/globals";

import {
  PHASE18_GARMIN_ADVERSARIAL_CASE_IDS,
  PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION,
  assertPhase18GarminAdversarialRunNonce,
  collectPhase18GarminAdversarialNativeObservations,
  phase18GarminAdversarialEnabled,
} from "./phase18GarminAdversarial";

const CODES = [
  "completed", "completed", "completed", "completed", "sign_in_required", "stale_generation",
  "data_access_denied", "rate_limited", "offline", "timeout", "temporary_failure",
  "malformed_response", "malformed_response", "malformed_response", "temporary_failure", "stale_generation",
] as const;
const CALLS = [1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3] as const;
const CONNECTIONS = [
  "connected", "connected", "connected", "disconnected", "sign-in-required", "disconnected",
  ...Array.from({ length: 10 }, () => "connected"),
] as const;
const SYNC_STATES = [
  "idle", "success", "success", "idle", "idle", "failure-stale-generation",
  "failure-data-access-denied", "failure-rate-limited", "failure-offline", "failure-timeout",
  "failure-temporary-failure", "failure-malformed-response", "failure-malformed-response",
  "failure-malformed-response", "partial-temporary-failure", "failure-stale-generation",
] as const;
const BUILD_IDENTITY = {
  currentHead: "a".repeat(40),
  currentSourceTreeSha256: "b".repeat(64),
  currentPythonLockSha256: "c".repeat(64),
};
const DEVICE_IDENTITY = "f".repeat(64);

function rawReport() {
  return {
    schema_version: 1,
    suite: "phase18-garmin-adversarial",
    status: "passed",
    runtime_identity: {
      retainedApkSha256: "d".repeat(64),
      retainedSignatureSha256: "e".repeat(64),
      deviceIdentitySha256: DEVICE_IDENTITY,
    },
    source_components: {
      activity: {
        activityId: 424242,
        activityTypeDTO: { typeKey: "running" },
        summaryDTO: {
          startTimeGMT: "2026-10-05T23:30:00.000Z",
          distance: 5_000,
          duration: 1_500,
          elapsedDuration: 1_560,
          movingDuration: 1_475,
        },
      },
      splits: { lapDTOs: [] },
      details: { metricDescriptors: [], activityDetailMetrics: [] },
    },
    cases: PHASE18_GARMIN_ADVERSARIAL_CASE_IDS.map((id, index) => {
      const generationBefore = index === 3 || index === 5 ? 1 : 1;
      const generationAfter = index === 3 || index === 5 ? 2 : generationBefore;
      const session = index === 0 ? "1" : index < 3 ? "2" : index < 6 ? "3" : "4";
      return {
        id,
        status: "passed",
        provenance: "native-exact-artifact",
        stage: id.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_"),
        code: CODES[index],
        duration_ms: index + 1,
        call_count: CALLS[index],
        automatic_retry_count: 0,
        retry_after_ms: index === 7 ? 900_000 : 0,
        connection_state: CONNECTIONS[index],
        sync_state: SYNC_STATES[index],
        session_digest: session.repeat(64),
        generation_before: generationBefore,
        generation_after: generationAfter,
      };
    }),
  };
}

describe("Phase 18 Garmin native observation contract", () => {
  it("requires exact route guard values including nonce and host identity digest", () => {
    const exact = {
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "v1.2-acceptance",
      confirmation: PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION,
      operation: "collect-adversarial",
      nonce: "0".repeat(32),
      deviceIdentitySha256: DEVICE_IDENTITY,
    };
    expect(phase18GarminAdversarialEnabled(exact)).toBe(true);
    for (const changed of [
      { ...exact, buildProfile: "production" },
      { ...exact, nativeContractsEnabled: false },
      { ...exact, suite: "phase18-garmin-adversarial" },
      { ...exact, confirmation: "wrong" },
      { ...exact, operation: "wrong" },
      { ...exact, nonce: "short" },
      { ...exact, nonce: "A".repeat(32) },
      { ...exact, nonce: ["0".repeat(32)] },
      { ...exact, deviceIdentitySha256: "short" },
    ]) expect(phase18GarminAdversarialEnabled(changed)).toBe(false);
  });

  it("keeps the installed route on the native plus SQLite producer", () => {
    const route = readFileSync("app/__phase18-garmin-adversarial.tsx", "utf8");
    expect(route).toContain("phase18GarminAdversarialEnabled");
    expect(route).toContain("src/bootstrap/phase18GarminAdversarial");
    expect(route).toContain("runPhase18GarminAdversarialNativeSuite");
    expect(route).not.toMatch(/GARMIN_EMAIL|GARMIN_PASSWORD|GARMIN_MFA/iu);
  });

  it("accepts bounded native observations without fabricated database evidence", async () => {
    const runAdversarialSuite = jest.fn(async () => rawReport());
    const observed = await collectPhase18GarminAdversarialNativeObservations({
      runAdversarialSuite,
    } as never, BUILD_IDENTITY, DEVICE_IDENTITY);

    expect(runAdversarialSuite).toHaveBeenCalledWith({
      confirmation: PHASE18_GARMIN_ADVERSARIAL_CONFIRMATION,
      deviceIdentitySha256: DEVICE_IDENTITY,
    });
    expect(observed.status).toBe("passed");
    expect(observed.cases).toHaveLength(16);
    expect(observed.currentIdentity.deviceIdentitySha256).toBe(DEVICE_IDENTITY);
    for (const entry of observed.cases) {
      expect(entry).not.toHaveProperty("source_write_count");
      expect(entry).not.toHaveProperty("history_digest");
      expect(entry).not.toHaveProperty("source_digest");
      expect(entry).not.toHaveProperty("match_digest");
    }
  });

  it("rejects malformed native observations, identity drift, and database claims", async () => {
    const exact = rawReport();
    const invalid = [
      { ...exact, source_components: { activity: {}, splits: {} } },
      { ...exact, source_components: { ...exact.source_components, details: { url: "https://invalid.test" } } },
      { ...exact, runtime_identity: { ...exact.runtime_identity, deviceIdentitySha256: "0".repeat(64) } },
      { ...exact, cases: exact.cases.map((entry, index) => index === 2 ? { ...entry, call_count: 3 } : entry) },
      { ...exact, cases: exact.cases.map((entry, index) => index === 0 ? { ...entry, source_write_count: 0 } : entry) },
      { ...exact, cases: exact.cases.map((entry, index) => index === 0 ? { ...entry, raw_json: "private" } : entry) },
    ];
    for (const report of invalid) {
      await expect(collectPhase18GarminAdversarialNativeObservations({
        runAdversarialSuite: async () => report,
      } as never, BUILD_IDENTITY, DEVICE_IDENTITY)).rejects.toThrow(
        "phase18_garmin_native_report_invalid",
      );
    }
  });

  it("fails before native execution for malformed host identity and report nonce", async () => {
    const runAdversarialSuite = jest.fn(async () => rawReport());
    for (const identity of [undefined, "short", "F".repeat(64)]) {
      await expect(collectPhase18GarminAdversarialNativeObservations({
        runAdversarialSuite,
      } as never, BUILD_IDENTITY, identity)).rejects.toThrow(
        "phase18_garmin_adversarial_device_identity_invalid",
      );
    }
    expect(runAdversarialSuite).not.toHaveBeenCalled();
    for (const nonce of [undefined, "short", "A".repeat(32)]) {
      expect(() => assertPhase18GarminAdversarialRunNonce(nonce)).toThrow(
        "phase18_garmin_adversarial_nonce_invalid",
      );
    }
  });
});
