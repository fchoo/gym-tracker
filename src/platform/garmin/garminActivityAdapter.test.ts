import { describe, expect, it, jest } from "@jest/globals";

import type { GarminSourceEnvelope } from "../../domains/activities/garminActivitySourcePort";
import {
  GarminActivityAdapterError,
  createGarminActivityAdapter,
  type GarminActivityMapper,
  type GarminNativeDriver,
  type GarminNativeErrorCode,
} from "./garminActivityAdapter";

const hash = (character: string) => character.repeat(64);

function envelope(externalActivityId: string): GarminSourceEnvelope {
  return {
    version: 1,
    source_kind: "garmin_connect_account",
    account_namespace: "account-fixture",
    external_activity_id: externalActivityId,
    normalization_version: 1,
    normalized_json_sha256: hash("a"),
    raw_component_sha256: {
      activity: hash("b"),
      splits: hash("c"),
      details: hash("d"),
    },
    sample_fidelity: "source_laps",
    normalized: {
      version: 1,
      started_at_ms: 1_700_000_000_000,
      sport: "running",
      subtype: "outdoor",
      distance_meters: 5_000,
      laps: [{ ordinal: 0, distance_meters: 5_000 }],
    },
  };
}

function fixtures() {
  const calls: Array<Readonly<{ operation: string; input: unknown }>> = [];
  const driver: GarminNativeDriver = {
    connectionState: jest.fn(async () => ({
      status: "ok" as const,
      generation: 0,
      data: { kind: "disconnected" as const },
    })),
    login: jest.fn(async (input) => {
      calls.push({ operation: "login", input });
      return {
        status: "ok" as const,
        generation: 1,
        data: { kind: "mfa_required" as const, challenge_handle: "opaque-challenge" },
      };
    }),
    resumeMfa: jest.fn(async (input) => {
      calls.push({ operation: "resumeMfa", input });
      return {
        status: "ok" as const,
        generation: 1,
        data: { kind: "connected" as const, account_namespace: "account-fixture" },
      };
    }),
    logout: jest.fn(async () => ({
      status: "ok" as const,
      generation: 2,
      data: { kind: "disconnected" as const },
    })),
    getActivities: jest.fn(async (input) => {
      calls.push({ operation: "getActivities", input });
      return {
        status: "ok" as const,
        generation: 1,
        data: { items: [{ activityId: "42", activityType: { typeKey: "running" } }], nextStart: 1 },
      };
    }),
    getActivity: jest.fn(async (input) => {
      calls.push({ operation: "getActivity", input });
      return { status: "ok" as const, generation: 1, data: { activityId: 42 } };
    }),
    getActivitySplits: jest.fn(async (input) => {
      calls.push({ operation: "getActivitySplits", input });
      return { status: "ok" as const, generation: 1, data: { lapDTOs: [] } };
    }),
    getActivityDetails: jest.fn(async (input) => {
      calls.push({ operation: "getActivityDetails", input });
      return { status: "ok" as const, generation: 1, data: { metricDescriptors: [], activityDetailMetrics: [] } };
    }),
  };
  const mapper: GarminActivityMapper = {
    fromSummary: jest.fn((summary) => envelope(String((summary as { activityId: string }).activityId))),
    fromActivity: jest.fn((input: Readonly<{
      external_activity_id: string;
      activity: unknown;
      splits: unknown;
      details: unknown;
    }>) => envelope(input.external_activity_id)),
  };
  return { calls, driver, mapper };
}

const errorCases: Array<[GarminNativeErrorCode, boolean]> = [
  ["invalid_credentials", false],
  ["mfa_expired", false],
  ["sign_in_required", false],
  ["data_access_denied", false],
  ["rate_limited", true],
  ["offline", true],
  ["timeout", true],
  ["temporary_failure", true],
  ["malformed_response", false],
  ["stale_generation", false],
];

describe("Garmin activity adapter", () => {
  it("keeps MFA on the same generation and exposes no secret fields", async () => {
    const { calls, driver, mapper } = fixtures();
    const adapter = createGarminActivityAdapter({ driver, mapper });

    const pending = await adapter.login({ email: "owner", password: "synthetic-secret" });
    expect(pending).toEqual({ kind: "mfa_required", challenge_handle: "opaque-challenge", generation: 1 });

    const connected = await adapter.resumeMfa({ challenge_handle: "opaque-challenge", code: "123456" });
    expect(connected).toEqual({ kind: "connected", account_namespace: "account-fixture", generation: 1 });
    expect(JSON.stringify([pending, connected])).not.toMatch(/password|123456|synthetic-secret|token|traceback|https?:/iu);
    expect(calls.map(({ operation }) => operation)).toEqual(["login", "resumeMfa"]);
  });

  it("maps one bounded Running page and one complete activity through the typed driver", async () => {
    const { calls, driver, mapper } = fixtures();
    const adapter = createGarminActivityAdapter({ driver, mapper });
    await adapter.login({ email: "owner", password: "synthetic-secret" });
    await adapter.resumeMfa({ challenge_handle: "opaque-challenge", code: "123456" });

    const page = await adapter.listRunningSummaries({ cursor: "0", limit: 1 });
    const activity = await adapter.readActivity("42");

    expect(page).toEqual({ items: [envelope("42")], next_cursor: "1" });
    expect(activity).toEqual(envelope("42"));
    expect(calls).toContainEqual({
      operation: "getActivities",
      input: { start: 0, limit: 1, activityType: "running" },
    });
    expect(calls).toContainEqual({
      operation: "getActivityDetails",
      input: { externalActivityId: "42", maxchart: 2_000, maxpoly: 4_000 },
    });
    expect(mapper.fromActivity).toHaveBeenCalledWith({
      external_activity_id: "42",
      activity: { activityId: 42 },
      splits: { lapDTOs: [] },
      details: { metricDescriptors: [], activityDetailMetrics: [] },
    });
  });

  it.each([
    ["empty cursor", { cursor: "", limit: 1 }],
    ["negative cursor", { cursor: "-1", limit: 1 }],
    ["non-integer cursor", { cursor: "1.5", limit: 1 }],
    ["zero limit", { cursor: "0", limit: 0 }],
    ["oversized limit", { cursor: "0", limit: 51 }],
  ])("rejects %s before the native page call", async (_label, input) => {
    const { driver, mapper } = fixtures();
    const adapter = createGarminActivityAdapter({ driver, mapper });

    await expect(adapter.listRunningSummaries(input)).rejects.toThrow("garmin_page_invalid");
    expect(driver.getActivities).not.toHaveBeenCalled();
  });

  it.each(["", "0", "-1", "1.5", "activity/42", "1".repeat(20)])(
    "rejects malformed external activity id %p before native reads",
    async (externalActivityId) => {
      const { driver, mapper } = fixtures();
      const adapter = createGarminActivityAdapter({ driver, mapper });

      await expect(adapter.readActivity(externalActivityId)).rejects.toThrow("garmin_activity_id_invalid");
      expect(driver.getActivity).not.toHaveBeenCalled();
      expect(driver.getActivitySplits).not.toHaveBeenCalled();
      expect(driver.getActivityDetails).not.toHaveBeenCalled();
    },
  );

  it.each(errorCases)("preserves the distinct %s failure without leaking native detail", async (code, retryable) => {
    const { driver: baseDriver, mapper } = fixtures();
    const driver: GarminNativeDriver = {
      ...baseDriver,
      getActivity: jest.fn(async () => ({
        status: "error",
        error: {
          code,
          retryAfterMs: code === "rate_limited" ? 9_999_999 : undefined,
          detail: "synthetic-secret and a private endpoint",
        },
      })),
    };
    const adapter = createGarminActivityAdapter({ driver, mapper });
    await adapter.login({ email: "owner", password: "synthetic-secret" });
    await adapter.resumeMfa({ challenge_handle: "opaque-challenge", code: "123456" });

    const error = await adapter.readActivity("42").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GarminActivityAdapterError);
    expect(error).toMatchObject({ code, retryable });
    if (code === "rate_limited") expect(error).toMatchObject({ retryAfterMs: 900_000 });
    expect(JSON.stringify(error)).not.toMatch(/synthetic-secret|private endpoint|traceback|https?:/iu);
    expect(driver.getActivity).toHaveBeenCalledTimes(1);
    expect(driver.getActivitySplits).not.toHaveBeenCalled();
  });

  it("maps unknown error codes and thrown native failures to one bounded temporary failure", async () => {
    const { driver: baseDriver, mapper } = fixtures();
    const unknownDriver: GarminNativeDriver = {
      ...baseDriver,
      getActivity: jest.fn(async () => ({
        status: "error",
        error: { code: "private_provider_failure", detail: "synthetic-secret" },
      })),
    };
    const thrownDriver: GarminNativeDriver = {
      ...baseDriver,
      getActivity: jest.fn(async () => {
        throw new Error("synthetic-secret traceback at private endpoint");
      }),
    };

    for (const driver of [unknownDriver, thrownDriver]) {
      const adapter = createGarminActivityAdapter({ driver, mapper });
      await adapter.login({ email: "owner", password: "synthetic-secret" });
      await adapter.resumeMfa({ challenge_handle: "opaque-challenge", code: "123456" });
      const error = await adapter.readActivity("42").catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "temporary_failure", retryable: true });
      expect(JSON.stringify(error)).not.toMatch(/synthetic-secret|private_provider_failure|traceback|https?:/iu);
    }
  });

  it("rejects stale generations and secret-bearing response shapes before mapping", async () => {
    const { driver: baseDriver, mapper } = fixtures();
    const staleDriver: GarminNativeDriver = {
      ...baseDriver,
      getActivity: jest.fn(async () => ({ status: "ok", generation: 0, data: { activityId: 42 } })),
    };
    const unsafeDriver: GarminNativeDriver = {
      ...baseDriver,
      getActivity: jest.fn(async () => ({ status: "ok", generation: 1, data: { token: "synthetic-secret" } })),
    };

    for (const [driver, code] of [[staleDriver, "stale_generation"], [unsafeDriver, "malformed_response"]] as const) {
      const adapter = createGarminActivityAdapter({ driver, mapper });
      await adapter.login({ email: "owner", password: "synthetic-secret" });
      await adapter.resumeMfa({ challenge_handle: "opaque-challenge", code: "123456" });
      await expect(adapter.readActivity("42")).rejects.toMatchObject({ code });
      expect(driver.getActivitySplits).not.toHaveBeenCalled();
    }
  });
});
