import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";

import { canonicalJson } from "./importContracts";
import {
  changeGarminActivityLifecycle,
  confirmGarminImportDate,
  prepareGarminImport,
  type ImportedActivityCommandRepository,
  type ImportedActivityLifecycleRepository,
} from "./importCommands";

const normalized = { version: 1 as const, started_at_ms: 1_700_000_000_000, sport: "running" as const, subtype: "outdoor", distance_meters: 5000, elapsed_ms: 1_500_000, laps: [] };
const envelope = { version: 1 as const, source_kind: "garmin_connect_account" as const, account_namespace: "owner-a", external_activity_id: "42", normalization_version: 1, normalized_json_sha256: createHash("sha256").update(canonicalJson({ normalization_version: 1, normalized })).digest("hex"), raw_component_sha256: { activity: "a".repeat(64), splits: "b".repeat(64), details: "c".repeat(64) }, sample_fidelity: "source_summary" as const, normalized };

describe("Garmin import commands", () => {
  it("prepares only digest-verified canonical evidence and stages a revision-fenced request", async () => {
    const staged = prepareGarminImport(envelope);
    const repository = { confirmGarminImport: jest.fn(async () => ({ kind: "imported" as const, activityId: "local-1", aggregateRevision: 1 })) };
    await expect(confirmGarminImportDate(repository, { requestId: "request-1", requestSha256: "d".repeat(64), activityId: "local-1", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-07", staged })).resolves.toEqual({ kind: "imported", activityId: "local-1", aggregateRevision: 1 });
    expect(repository.confirmGarminImport).toHaveBeenCalledTimes(1);
  });

  it("rejects a digest mismatch before the writer", () => {
    expect(() => prepareGarminImport({ ...envelope, normalized_json_sha256: "0".repeat(64) })).toThrow("garmin_digest_invalid");
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
    const staged = prepareGarminImport(envelope);
    await expect(confirmGarminImportDate(importer, { requestId: "bad request", requestSha256: "d".repeat(64), activityId: "local-1", expectedAggregateRevision: 0, confirmedLocalDate: "2026-10-07", staged })).rejects.toThrow("garmin_envelope_invalid");
    await expect(confirmGarminImportDate(importer, { requestId: "request-1", requestSha256: "D".repeat(64), activityId: "local-1", expectedAggregateRevision: -1, confirmedLocalDate: "2026-10-7", staged })).rejects.toThrow("garmin_envelope_invalid");
    await expect(changeGarminActivityLifecycle(lifecycle, { operation: "restore", requestId: "restore-1", requestSha256: "e".repeat(64), activityId: "local-1", expectedAggregateRevision: 0, occurredAtMs: -1, reason: "" })).rejects.toThrow("garmin_envelope_invalid");
    await expect(changeGarminActivityLifecycle(lifecycle, { operation: "remove", requestId: "remove-1", requestSha256: "e".repeat(64), activityId: "local-1", expectedAggregateRevision: 1, occurredAtMs: 1, reason: "x".repeat(65) })).rejects.toThrow("garmin_envelope_invalid");
    expect(importer.confirmGarminImport).not.toHaveBeenCalled();
    expect(lifecycle.changeGarminActivityLifecycle).not.toHaveBeenCalled();
  });
});
