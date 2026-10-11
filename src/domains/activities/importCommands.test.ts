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
    const staged = await prepareGarminImport(envelope, sha256);
    const provenance = {
      absoluteStartedAtMs: normalized.started_at_ms,
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
});
