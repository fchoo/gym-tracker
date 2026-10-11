import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

import {
  PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION,
  createPhase18GarminAcceptanceHarness,
  phase18GarminAcceptanceEnabled,
} from "./phase18GarminAcceptance";
import {
  GARMIN_ACCEPTANCE_HOST_CASE_IDS,
  GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS,
} from "./contracts/garminImport.contract";

const HASH = "a".repeat(64);

describe("Phase 18 deterministic acceptance harness", () => {
  it("opens only for the exact non-production profile, suite, and confirmation", () => {
    const exact = {
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "phase18-garmin-acceptance",
      confirmation: PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION,
    };
    expect(phase18GarminAcceptanceEnabled(exact)).toBe(true);
    for (const rejected of [
      { ...exact, buildProfile: "production" },
      { ...exact, buildProfile: "preview" },
      { ...exact, nativeContractsEnabled: false },
      { ...exact, suite: "phase18-garmin-proof" },
      { ...exact, confirmation: "wrong" },
      { ...exact, confirmation: undefined },
    ]) {
      expect(phase18GarminAcceptanceEnabled(rejected)).toBe(false);
    }
  });

  it("runs every host case in ledger order and leaves native proof explicitly deferred", async () => {
    const calls: string[] = [];
    const harness = createPhase18GarminAcceptanceHarness({
      runCase: async (id) => {
        calls.push(id);
        return {
          duration_ms: 2,
          source_digest: HASH,
          match_digest: HASH,
          semantic_state: "ready",
        };
      },
    });

    const result = await harness.run();

    expect(calls).toEqual(GARMIN_ACCEPTANCE_HOST_CASE_IDS);
    expect(result).toEqual({
      schema_version: 1,
      suite: "phase18-garmin-acceptance",
      status: "host-passed-native-deferred",
      host: {
        expected_count: GARMIN_ACCEPTANCE_HOST_CASE_IDS.length,
        passed: GARMIN_ACCEPTANCE_HOST_CASE_IDS.length,
        failed: 0,
        skipped: 0,
        cases: GARMIN_ACCEPTANCE_HOST_CASE_IDS.map((id) => ({
          id,
          status: "passed",
          duration_ms: 2,
          source_digest: HASH,
          match_digest: HASH,
          semantic_state: "ready",
        })),
      },
      native_prerequisites: GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS.map((id) => ({
        id,
        status: "deferred",
      })),
    });
  });

  it("fails closed without skipping later host cases or upgrading native prerequisites", async () => {
    const failedId = GARMIN_ACCEPTANCE_HOST_CASE_IDS[2]!;
    const result = await createPhase18GarminAcceptanceHarness({
      runCase: async (id) => {
        if (id === failedId) throw new Error("private provider payload");
        return { duration_ms: 1, semantic_state: "ready" };
      },
    }).run();

    expect(result.status).toBe("failed");
    expect(result.host.cases).toHaveLength(GARMIN_ACCEPTANCE_HOST_CASE_IDS.length);
    expect(result.host.skipped).toBe(0);
    expect(result.host.cases.find(({ id }) => id === failedId)).toEqual({
      id: failedId,
      status: "failed",
      duration_ms: 0,
      code: "acceptance_case_failed",
    });
    expect(JSON.stringify(result)).not.toMatch(/private provider payload/iu);
    expect(result.native_prerequisites.every(({ status }) => status === "deferred")).toBe(true);
  });

  it("rejects non-finite timings, malformed digests, private semantic text, and unknown result fields", async () => {
    for (const invalid of [
      { duration_ms: Number.NaN, semantic_state: "ready" },
      { duration_ms: 1, source_digest: "wrong", semantic_state: "ready" },
      { duration_ms: 1, semantic_state: "owner@example.invalid" },
      { duration_ms: 1, semantic_state: "ready", raw_json: {} },
    ]) {
      const result = await createPhase18GarminAcceptanceHarness({
        runCase: async () => invalid as never,
      }).run();
      expect(result.status).toBe("failed");
      expect(result.host.cases[0]).toEqual(expect.objectContaining({
        status: "failed",
        code: "acceptance_case_invalid",
      }));
    }
  });

  it("keeps the route source-owned, guarded, synthetic-only, and free of proof relabeling", () => {
    const route = readFileSync("app/__phase18-garmin-acceptance.tsx", "utf8");
    expect(route).toContain("phase18GarminAcceptanceEnabled");
    expect(route).toContain("synthetic-redacted-only");
    expect(route).toContain("host-passed-native-deferred");
    expect(route).not.toMatch(/status:\s*["']passed["']/u);
    expect(route).not.toMatch(/private-account|owner@|123456789/u);
  });
});
