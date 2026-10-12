import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";

import { canonicalJson } from "./importContracts";
import {
  changeGarminActivityLifecycle,
  confirmGarminImportDate,
  prepareGarminImport,
  resolveGarminImportRevision,
  type GarminRevisionDecisionInput,
  type ImportedActivityCommandRepository,
  type ImportedActivityLifecycleRepository,
  type ImportedActivityRevisionRepository,
} from "./importCommands";

const normalized = { version: 1 as const, started_at_ms: 1_700_000_000_000, sport: "running" as const, subtype: "outdoor", distance_meters: 5000, elapsed_ms: 1_500_000, laps: [] };
const envelope = { version: 1 as const, source_kind: "garmin_connect_account" as const, account_namespace: "owner-a", external_activity_id: "42", normalization_version: 1, normalized_json_sha256: createHash("sha256").update(canonicalJson({ normalization_version: 1, normalized })).digest("hex"), raw_component_sha256: { activity: "a".repeat(64), splits: "b".repeat(64), details: "c".repeat(64) }, sample_fidelity: "source_summary" as const, normalized };
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

async function stagedAt(absoluteStartedAtMs: number) {
  const normalizedAtInstant = { ...normalized, started_at_ms: absoluteStartedAtMs };
  return prepareGarminImport({
    ...envelope,
    normalized: normalizedAtInstant,
    normalized_json_sha256: createHash("sha256")
      .update(canonicalJson({ normalization_version: 1, normalized: normalizedAtInstant }))
      .digest("hex"),
  }, sha256);
}

describe("Garmin import commands", () => {
  it("prepares only digest-verified canonical evidence and stages a revision-fenced request", async () => {
    const staged = await prepareGarminImport(envelope, sha256);
    const repository = { confirmGarminImport: jest.fn(async () => ({ kind: "imported" as const, activityId: "local-1", aggregateRevision: 1 })) };
    await expect(confirmGarminImportDate(repository, { requestId: "request-1", requestSha256: "d".repeat(64), activityId: "local-1", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-07", staged })).resolves.toEqual({ kind: "imported", activityId: "local-1", aggregateRevision: 1 });
    expect(repository.confirmGarminImport).toHaveBeenCalledTimes(1);
  });

  it("rejects a canonical field changed after hashing before the writer", async () => {
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "local-1",
        aggregateRevision: 1,
      })),
    };
    await expect(prepareGarminImport({
      ...envelope,
      normalized: { ...envelope.normalized, distance_meters: 5001 },
    }, sha256)).rejects.toThrow("garmin_digest_invalid");
    expect(repository.confirmGarminImport).not.toHaveBeenCalled();
  });
  it("requires explicit revision-fenced owner removal or restoration", async () => {
    const repository = { changeGarminActivityLifecycle: jest.fn(async () => ({ kind: "removed" as const, activityId: "local-1", aggregateRevision: 1 })) };
    await expect(changeGarminActivityLifecycle(repository, { operation: "remove", requestId: "remove-1", requestSha256: "e".repeat(64), activityId: "local-1", expectedAggregateRevision: 1, occurredAtMs: 1, reason: "owner_request" })).resolves.toMatchObject({ kind: "removed" });
  });

  it("rejects every malformed import and lifecycle boundary before its repository", async () => {
    const importer: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "local-1",
        aggregateRevision: 1,
      })),
    };
    const lifecycle: ImportedActivityLifecycleRepository = {
      changeGarminActivityLifecycle: jest.fn(async () => ({
        kind: "removed" as const,
        activityId: "local-1",
        aggregateRevision: 1,
      })),
    };
    const staged = await prepareGarminImport(envelope, sha256);
    await expect(confirmGarminImportDate(importer, { requestId: "bad request", requestSha256: "d".repeat(64), activityId: "local-1", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-07", staged })).rejects.toThrow("garmin_envelope_invalid");
    await expect(confirmGarminImportDate(importer, { requestId: "request-1", requestSha256: "D".repeat(64), activityId: "local-1", expectedAggregateRevision: -1, confirmedLocalDate: "2026-10-7", staged })).rejects.toThrow("garmin_envelope_invalid");
    await expect(changeGarminActivityLifecycle(lifecycle, { operation: "restore", requestId: "restore-1", requestSha256: "e".repeat(64), activityId: "local-1", expectedAggregateRevision: 0, occurredAtMs: -1, reason: "" })).rejects.toThrow("garmin_envelope_invalid");
    await expect(changeGarminActivityLifecycle(lifecycle, { operation: "remove", requestId: "remove-1", requestSha256: "e".repeat(64), activityId: "local-1", expectedAggregateRevision: 1, occurredAtMs: 1, reason: "x".repeat(65) })).rejects.toThrow("garmin_envelope_invalid");
    expect(importer.confirmGarminImport).not.toHaveBeenCalled();
    expect(lifecycle.changeGarminActivityLifecycle).not.toHaveBeenCalled();
  });

  it("validates revision decisions before forwarding them to the repository", async () => {
    const repository: ImportedActivityRevisionRepository = {
      listGarminRevisionReviews: jest.fn(async () => []),
      resolveGarminRevision: jest.fn(async (input: GarminRevisionDecisionInput) => ({
        kind: input.action === "accept" ? "revision_accepted" as const : "revision_kept" as const,
        activityId: input.activityId,
        aggregateRevision: input.proposedRevision,
      })),
    };
    const valid = {
      action: "accept" as const,
      requestId: "revision-1",
      requestSha256: "a".repeat(64),
      activityId: "local-1",
      expectedAggregateRevision: 1,
      proposedRevision: 2,
      expectedProposedSha256: "b".repeat(64),
      occurredAtMs: 1,
    };

    await expect(resolveGarminImportRevision(repository, valid)).resolves.toMatchObject({
      kind: "revision_accepted",
    });
    await expect(resolveGarminImportRevision(repository, {
      ...valid,
      proposedRevision: 1,
    })).rejects.toThrow("garmin_envelope_invalid");
    expect(repository.resolveGarminRevision).toHaveBeenCalledTimes(1);
  });

  it("rejects each invalid optional source timezone and offset provenance field", async () => {
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "local-1",
        aggregateRevision: 1,
      })),
    };
    const absoluteStartedAtMs = Date.parse("2026-10-07T00:00:00.000Z");
    const staged = await stagedAt(absoluteStartedAtMs);
    const provenance = {
      absoluteStartedAtMs,
      confirmedLocalDate: "2026-10-07",
      confirmedLocalTime: "08:00:00",
      confirmedTimeZone: "Asia/Singapore",
      confirmedUtcOffsetMinutes: 480,
      sourceLocalDateTime: "2026-10-07T08:00:00",
      sourceTimeZone: "Asia/Singapore",
      sourceUtcOffsetMinutes: 480,
    };
    const invalidProvenance = [
      { ...provenance, sourceTimeZone: " Asia/Singapore" },
      { ...provenance, sourceTimeZone: "" },
      { ...provenance, sourceTimeZone: "x".repeat(121) },
      { ...provenance, sourceUtcOffsetMinutes: 841 },
      { ...provenance, sourceLocalDateTime: "2026-02-30T08:00:00" },
      {
        absoluteStartedAtMs,
        confirmedLocalDate: provenance.confirmedLocalDate,
        confirmedLocalTime: provenance.confirmedLocalTime,
        confirmedTimeZone: provenance.confirmedTimeZone,
        confirmedUtcOffsetMinutes: provenance.confirmedUtcOffsetMinutes,
        sourceLocalDateTime: "2026-10-07T09:00:00",
        sourceUtcOffsetMinutes: 480,
      },
      {
        absoluteStartedAtMs,
        confirmedLocalDate: provenance.confirmedLocalDate,
        confirmedLocalTime: provenance.confirmedLocalTime,
        confirmedTimeZone: provenance.confirmedTimeZone,
        confirmedUtcOffsetMinutes: provenance.confirmedUtcOffsetMinutes,
        sourceLocalDateTime: "2026-10-07T09:00:00",
        sourceTimeZone: "Asia/Singapore",
      },
      {
        absoluteStartedAtMs,
        confirmedLocalDate: provenance.confirmedLocalDate,
        confirmedLocalTime: provenance.confirmedLocalTime,
        confirmedTimeZone: provenance.confirmedTimeZone,
        confirmedUtcOffsetMinutes: provenance.confirmedUtcOffsetMinutes,
        sourceTimeZone: "Asia/Singapore",
        sourceUtcOffsetMinutes: 420,
      },
    ];

    for (const dateProvenance of invalidProvenance) {
      await expect(confirmGarminImportDate(repository, {
        requestId: "request-provenance",
        requestSha256: "c".repeat(64),
        activityId: "local-1",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-07",
        staged,
        dateProvenance,
      })).rejects.toThrow("garmin_envelope_invalid");
    }
    expect(repository.confirmGarminImport).not.toHaveBeenCalled();
  });

  it("accepts coherent complete, zone-only, and offset-only source provenance", async () => {
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "local-source-provenance",
        aggregateRevision: 1,
      })),
    };
    const absoluteStartedAtMs = Date.parse("2026-10-07T00:00:00.125Z");
    const staged = await stagedAt(absoluteStartedAtMs);
    const confirmed = {
      absoluteStartedAtMs,
      confirmedLocalDate: "2026-10-07",
      confirmedLocalTime: "08:00:00.125",
      confirmedTimeZone: "Asia/Singapore",
      confirmedUtcOffsetMinutes: 480,
    };
    const sourceVariants = [
      { sourceLocalDateTime: "2026-10-07T08:00:00.125", sourceTimeZone: "Asia/Singapore", sourceUtcOffsetMinutes: 480 },
      { sourceTimeZone: "Asia/Singapore" },
      { sourceLocalDateTime: "2026-10-07T08:00:00.125", sourceUtcOffsetMinutes: 480 },
      { sourceLocalDateTime: "2026-10-07T08:00:00.125" },
    ];

    for (const [index, source] of sourceVariants.entries()) {
      await expect(confirmGarminImportDate(repository, {
        requestId: `request-source-provenance-${index}`,
        requestSha256: "7".repeat(64),
        activityId: "local-source-provenance",
        expectedAggregateRevision: 0,
        confirmedLocalDate: confirmed.confirmedLocalDate,
        staged,
        dateProvenance: { ...confirmed, ...source },
      })).resolves.toMatchObject({ kind: "imported" });
    }
    expect(repository.confirmGarminImport).toHaveBeenCalledTimes(sourceVariants.length);
  });

  it.each([
    ["impossible calendar date", "2026-02-30", "12:00:00", "UTC", 0, Date.parse("2026-03-02T12:00:00.000Z")],
    ["out-of-range clock time", "2026-10-07", "24:00:00", "UTC", 0, Date.parse("2026-10-08T00:00:00.000Z")],
    ["unknown IANA zone", "2026-10-07", "12:00:00", "Mars/Olympus", 0, Date.parse("2026-10-07T12:00:00.000Z")],
    ["zone offset mismatch", "2026-10-07", "08:00:00", "Asia/Singapore", 420, Date.parse("2026-10-07T01:00:00.000Z")],
    ["DST gap", "2026-03-08", "02:30:00", "America/New_York", -300, Date.parse("2026-03-08T07:30:00.000Z")],
  ] as Array<[string, string, string, string, number, number]>) (
    "rejects %s provenance before the repository boundary",
    async (_label, confirmedLocalDate, confirmedLocalTime, confirmedTimeZone, confirmedUtcOffsetMinutes, absoluteStartedAtMs) => {
      const repository: ImportedActivityCommandRepository = {
        confirmGarminImport: jest.fn(async () => ({
          kind: "imported" as const,
          activityId: "local-invalid-provenance",
          aggregateRevision: 1,
        })),
      };
      const staged = await stagedAt(absoluteStartedAtMs);

      await expect(confirmGarminImportDate(repository, {
        requestId: "request-invalid-provenance",
        requestSha256: "9".repeat(64),
        activityId: "local-invalid-provenance",
        expectedAggregateRevision: 0,
        confirmedLocalDate,
        staged,
        dateProvenance: {
          absoluteStartedAtMs,
          confirmedLocalDate,
          confirmedLocalTime,
          confirmedTimeZone,
          confirmedUtcOffsetMinutes,
        },
      })).rejects.toThrow("garmin_envelope_invalid");
      expect(repository.confirmGarminImport).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["earlier daylight offset", -240, Date.parse("2026-11-01T05:30:00.000Z")],
    ["later standard offset", -300, Date.parse("2026-11-01T06:30:00.000Z")],
  ] as Array<[string, number, number]>) (
    "accepts the %s choice for an overlapping local time",
    async (_label, confirmedUtcOffsetMinutes, absoluteStartedAtMs) => {
      const repository: ImportedActivityCommandRepository = {
        confirmGarminImport: jest.fn(async () => ({
          kind: "imported" as const,
          activityId: "local-overlap",
          aggregateRevision: 1,
        })),
      };
      const staged = await stagedAt(absoluteStartedAtMs);

      await expect(confirmGarminImportDate(repository, {
        requestId: `request-overlap-${Math.abs(confirmedUtcOffsetMinutes)}`,
        requestSha256: "8".repeat(64),
        activityId: "local-overlap",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-11-01",
        staged,
        dateProvenance: {
          absoluteStartedAtMs,
          confirmedLocalDate: "2026-11-01",
          confirmedLocalTime: "01:30:00",
          confirmedTimeZone: "America/New_York",
          confirmedUtcOffsetMinutes,
        },
      })).resolves.toMatchObject({ kind: "imported" });
      expect(repository.confirmGarminImport).toHaveBeenCalledTimes(1);
    },
  );
});
