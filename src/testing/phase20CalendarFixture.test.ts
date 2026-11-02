import { describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async () => "d".repeat(64),
}));

import {
  createPhase20CalendarFixtureReadPort,
  emitPhase20CalendarProbeReceipt,
  PHASE20_CALENDAR_PROBE_RECEIPT_MARKER,
  phase20CalendarFixtureRequestFromNativeContract,
  phase20CalendarImportedActivityDetail,
  phase20CalendarProbeReceiptRequestFromNativeContract,
} from "./phase20CalendarFixture";

const identity = {
  packageName: "com.fchoo.gymtracker.devtest",
  buildProfile: "development-test",
  nativeContractsEnabled: true,
  suite: "v1.2-acceptance",
  fixtureId: "v12-calendar-isolated-facts-v1",
  nonce: "b".repeat(32),
  requirementsSha256: "a".repeat(64),
} as const;

describe("Phase 20 Calendar fixture", () => {
  it("accepts only the isolated native identity and emits one nonce-bound probe receipt", async () => {
    expect(phase20CalendarFixtureRequestFromNativeContract(identity)).toBe(true);
    const request = phase20CalendarProbeReceiptRequestFromNativeContract({
      ...identity,
      flowSha256: identity.requirementsSha256,
      fixtureSourceSha256: "c".repeat(64),
      requirementId: "CAL-17",
      evidenceId: "calendar.agenda-routing",
      probeId: "imported-running-destination",
      status: "PASS",
    });
    const lines: string[] = [];
    expect(await emitPhase20CalendarProbeReceipt(request, (line) => lines.push(line))).toBe(true);
    expect(await emitPhase20CalendarProbeReceipt(request, (line) => lines.push(line))).toBe(false);
    expect(lines).toHaveLength(1);
    const receipt = JSON.parse(lines[0]!.slice(PHASE20_CALENDAR_PROBE_RECEIPT_MARKER.length));
    expect(receipt).toMatchObject({ nonce: identity.nonce, requirement_id: "CAL-17", probe_id: "imported-running-destination", status: "PASS" });
    expect(receipt.receipt_sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("uses accepted local Garmin identity and deterministic load-error retries without inventing sessions", async () => {
    expect(phase20CalendarImportedActivityDetail("activity-v12-garmin-outdoor")).toMatchObject({ kind: "ready", detail: { activityType: "Outdoor run", distance: "5.00 km" } });
    expect(phase20CalendarImportedActivityDetail("v12-garmin-outdoor")).toEqual({ kind: "missing" });

    const retry = createPhase20CalendarFixtureReadPort("retry-retains-date");
    const input = { startLocalDate: "2026-10-01", endLocalDateExclusive: "2026-12-01" };
    await expect(retry.loadCalendarRange(input)).resolves.toMatchObject({ events: expect.any(Array) });
    await expect(retry.loadCalendarRange(input)).rejects.toThrow("phase20_calendar_fixture_retry_error");
    await expect(retry.loadCalendarRange(input)).resolves.toMatchObject({ events: expect.any(Array) });

    const empty = createPhase20CalendarFixtureReadPort("no-invented-session");
    await expect(empty.loadCalendarRange(input)).resolves.toEqual({ events: [], days: [] });
  });
});
