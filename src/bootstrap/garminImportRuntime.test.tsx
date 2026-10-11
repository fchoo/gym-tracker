import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";

import { canonicalJson } from "../domains/activities/importContracts";
import type {
  ConfirmGarminImportInput,
  GarminImportResult,
  ImportedActivityCommandRepository,
} from "../domains/activities/importCommands";
import type { GarminSourceEnvelope } from "../domains/activities/garminActivitySourcePort";
import {
  createGarminImportRuntime,
  createGarminRootRuntime,
} from "./garminImportRuntime";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

function envelope(): GarminSourceEnvelope {
  const normalized = {
    version: 1 as const,
    started_at_ms: 1_781_891_400_000,
    sport: "running" as const,
    subtype: "outdoor",
    distance_meters: 5_000,
    elapsed_ms: 1_560_000,
    timer_ms: 1_500_000,
    moving_ms: 1_475_000,
    laps: [],
  };
  return Object.freeze({
    version: 1,
    source_kind: "garmin_connect_account",
    account_namespace: "account-runtime",
    external_activity_id: "424242",
    normalization_version: 1,
    normalized_json_sha256: createHash("sha256")
      .update(canonicalJson({ normalization_version: 1, normalized }))
      .digest("hex"),
    raw_component_sha256: Object.freeze({
      activity: "a".repeat(64),
      splits: "b".repeat(64),
      details: "c".repeat(64),
    }),
    sample_fidelity: "source_summary",
    normalized: Object.freeze(normalized),
  });
}

describe("Garmin import runtime", () => {
  it("composes one source, coordinator, shared commit, and durable history reader", async () => {
    const sourceEnvelope = envelope();
    const durableActivities: Array<Readonly<{
      activityId: string;
      title: string;
      activityType: string;
      confirmedLocalDate: string;
    }>> = [];
    const operations: string[] = [];
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async (input: ConfirmGarminImportInput) => {
        operations.push("shared-commit");
        durableActivities.push(Object.freeze({
          activityId: input.activityId,
          title: "Morning run",
          activityType: "Running",
          confirmedLocalDate: input.confirmedLocalDate,
        }));
        return Object.freeze({
          kind: "imported" as const,
          activityId: input.activityId,
          aggregateRevision: 1,
        });
      }),
    };
    const source = {
      connectionState: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      login: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      resumeMfa: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      logout: jest.fn(async () => undefined),
      listRunningSummaries: jest.fn(async () => ({ items: [sourceEnvelope] })),
      readActivity: jest.fn(async () => sourceEnvelope),
    };
    const runtime = createGarminRootRuntime({
      loadActivities: async () => Object.freeze([...durableActivities]),
      requestFor: async () => Object.freeze({
        requestId: "garmin-root-request",
        requestSha256: "d".repeat(64),
        activityId: "activity-root-01",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-06-20",
      }),
      services: Object.freeze({ importedActivities: repository }),
      sha256,
      source,
    });

    await expect(runtime.loadActivities()).resolves.toEqual([]);
    await expect(runtime.coordinator.syncNow()).resolves.toMatchObject({
      kind: "success",
      counts: { newActivities: 1 },
    });
    await expect(runtime.loadActivities()).resolves.toEqual([
      expect.objectContaining({ activityId: "activity-root-01" }),
    ]);
    expect(operations).toEqual(["shared-commit"]);
    expect(source.readActivity).toHaveBeenCalledWith("424242");
  });

  it("keeps the accepted row and marks it for review when the source revision changes", async () => {
    const accepted = Object.freeze({
      activityId: "activity-root-01",
      title: "Morning run",
      activityType: "Running",
      confirmedLocalDate: "2026-06-20",
      revisionState: "accepted" as const,
    });
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => Object.freeze({
        kind: "revision_review" as const,
        activityId: accepted.activityId,
        aggregateRevision: 1,
      })),
    };
    const sourceEnvelope = envelope();
    const source = {
      connectionState: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      login: jest.fn(async () => ({ kind: "disconnected" as const })),
      resumeMfa: jest.fn(async () => ({ kind: "disconnected" as const })),
      logout: jest.fn(async () => undefined),
      listRunningSummaries: jest.fn(async () => ({ items: [sourceEnvelope] })),
      readActivity: jest.fn(async () => sourceEnvelope),
    };
    const runtime = createGarminRootRuntime({
      loadActivities: async () => [accepted],
      requestFor: async () => Object.freeze({
        requestId: "garmin-root-revision",
        requestSha256: "e".repeat(64),
        activityId: accepted.activityId,
        expectedAggregateRevision: 0,
        confirmedLocalDate: accepted.confirmedLocalDate,
      }),
      services: Object.freeze({ importedActivities: repository }),
      sha256,
      source,
    });

    await expect(runtime.coordinator.syncNow()).resolves.toMatchObject({
      kind: "success",
      counts: { reviewActivities: 1 },
    });
    await expect(runtime.loadActivities()).resolves.toEqual([
      { ...accepted, revisionState: "needs_review" },
    ]);
  });

  it("replays a lost acknowledgement after remount without duplicating durable history", async () => {
    const durableActivities: Array<Readonly<{
      activityId: string;
      title: string;
      activityType: string;
      confirmedLocalDate: string;
    }>> = [];
    let acknowledgementLost = true;
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async (input: ConfirmGarminImportInput) => {
        if (durableActivities.length === 0) {
          durableActivities.push(Object.freeze({
            activityId: input.activityId,
            title: "Morning run",
            activityType: "Running",
            confirmedLocalDate: input.confirmedLocalDate,
          }));
        }
        if (acknowledgementLost) {
          acknowledgementLost = false;
          throw new Error("post_commit_acknowledgement_lost");
        }
        return Object.freeze({
          kind: "replayed" as const,
          activityId: input.activityId,
          aggregateRevision: 1,
        });
      }),
    };
    const sourceEnvelope = envelope();
    const source = {
      connectionState: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      login: jest.fn(async () => ({ kind: "disconnected" as const })),
      resumeMfa: jest.fn(async () => ({ kind: "disconnected" as const })),
      logout: jest.fn(async () => undefined),
      listRunningSummaries: jest.fn(async () => ({ items: [sourceEnvelope] })),
      readActivity: jest.fn(async () => sourceEnvelope),
    };
    const createRuntime = () => createGarminRootRuntime({
      loadActivities: async () => Object.freeze([...durableActivities]),
      requestFor: async () => Object.freeze({
        requestId: "garmin-root-stable-receipt",
        requestSha256: "f".repeat(64),
        activityId: "activity-root-01",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-06-20",
      }),
      services: Object.freeze({ importedActivities: repository }),
      sha256,
      source,
    });

    await expect(createRuntime().coordinator.syncNow()).resolves.toMatchObject({ kind: "failure" });
    const remounted = createRuntime();
    await expect(remounted.loadActivities()).resolves.toHaveLength(1);
    await expect(remounted.coordinator.syncNow()).resolves.toMatchObject({
      kind: "success",
      counts: { unchangedActivities: 1 },
    });
    await expect(remounted.loadActivities()).resolves.toHaveLength(1);
  });

  it("prepares the exact envelope and invalidates reads only after the committed result", async () => {
    const events: string[] = [];
    const committed: GarminImportResult = Object.freeze({
      kind: "imported",
      activityId: "activity-runtime",
      aggregateRevision: 1,
    });
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async (input: ConfirmGarminImportInput) => {
        events.push("committed");
        expect(input.staged.envelope).toEqual(envelopeValue);
        expect(input.staged.canonical_payload_json).toBe(
          canonicalJson({
            normalization_version: 1,
            normalized: envelopeValue.normalized,
          }),
        );
        return committed;
      }),
    };
    const envelopeValue = envelope();
    const runtime = createGarminImportRuntime({
      services: Object.freeze({ importedActivities: repository }),
      sha256,
      assertCurrentGeneration: async () => undefined,
      invalidateReads: async () => {
        events.push("invalidated");
      },
    });

    await expect(runtime.commitEnvelope({
      envelope: envelopeValue,
      confirmation: {
        requestId: "request-runtime",
        requestSha256: "d".repeat(64),
        activityId: "activity-runtime",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-06-20",
      },
    })).resolves.toBe(committed);

    expect(repository.confirmGarminImport).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["committed", "invalidated"]);
  });

  it("does not reach persistence or invalidation when shared preparation rejects the envelope", async () => {
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "activity-runtime",
        aggregateRevision: 1,
      })),
    };
    const invalidateReads = jest.fn(async () => undefined);
    const runtime = createGarminImportRuntime({
      services: Object.freeze({ importedActivities: repository }),
      sha256,
      assertCurrentGeneration: async () => undefined,
      invalidateReads,
    });

    await expect(runtime.commitEnvelope({
      envelope: { ...envelope(), normalized_json_sha256: "0".repeat(64) },
      confirmation: {
        requestId: "request-runtime",
        requestSha256: "d".repeat(64),
        activityId: "activity-runtime",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-06-20",
      },
    })).rejects.toThrow("garmin_digest_invalid");

    expect(repository.confirmGarminImport).not.toHaveBeenCalled();
    expect(invalidateReads).not.toHaveBeenCalled();
  });

  it("prepares an ambiguous source date without writing and confirms owner-selected provenance through the shared command", async () => {
    const source = envelope();
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "activity-date",
        aggregateRevision: 1,
      })),
    };
    const invalidateReads = jest.fn(async () => undefined);
    const runtime = createGarminImportRuntime({
      services: Object.freeze({ importedActivities: repository }),
      sha256,
      assertCurrentGeneration: async () => undefined,
      invalidateReads,
    });

    const proposal = await runtime.prepareEnvelope({
      envelope: source,
      sourceDate: Object.freeze({
        sourceLocalDateTime: "2026-06-20T00:30:00",
      }),
    });

    expect(proposal).toMatchObject({
      kind: "date_confirmation_required",
      date: {
        absoluteStartedAtMs: source.normalized.started_at_ms,
        sourceLocalDateTime: "2026-06-20T00:30:00",
      },
    });
    expect(repository.confirmGarminImport).not.toHaveBeenCalled();
    expect(invalidateReads).not.toHaveBeenCalled();

    await expect(runtime.confirmPreparedDate({
      proposal,
      request: {
        requestId: "request-date",
        requestSha256: "f".repeat(64),
        activityId: "activity-date",
        expectedAggregateRevision: 0,
      },
      decision: Object.freeze({
        kind: "confirmed",
        localDate: "2026-06-20",
        localTime: "00:30:00",
        timeZone: "Asia/Singapore",
        utcOffsetMinutes: 480,
      }),
    })).resolves.toMatchObject({ kind: "imported" });

    expect(repository.confirmGarminImport).toHaveBeenCalledWith({
      requestId: "request-date",
      requestSha256: "f".repeat(64),
      activityId: "activity-date",
      expectedAggregateRevision: 0,
      confirmedLocalDate: "2026-06-20",
      staged: proposal.staged,
      dateProvenance: {
        absoluteStartedAtMs: source.normalized.started_at_ms,
        sourceLocalDateTime: "2026-06-20T00:30:00",
        confirmedLocalDate: "2026-06-20",
        confirmedLocalTime: "00:30:00",
        confirmedTimeZone: "Asia/Singapore",
        confirmedUtcOffsetMinutes: 480,
      },
    });
    expect(invalidateReads).toHaveBeenCalledTimes(1);
  });

  it.each(["cancelled", "stale", "invalid", "dst_gap"] as const)(
    "keeps %s date decisions outside persistence",
    async (reason) => {
      const repository: ImportedActivityCommandRepository = {
        confirmGarminImport: jest.fn(async () => ({
          kind: "imported" as const,
          activityId: "activity-date",
          aggregateRevision: 1,
        })),
      };
      const invalidateReads = jest.fn(async () => undefined);
      const runtime = createGarminImportRuntime({
        services: Object.freeze({ importedActivities: repository }),
        sha256,
        assertCurrentGeneration: async () => undefined,
        invalidateReads,
      });
      const proposal = await runtime.prepareEnvelope({
        envelope: envelope(),
        sourceDate: Object.freeze({}),
      });

      await expect(runtime.confirmPreparedDate({
        proposal,
        request: {
          requestId: `request-${reason}`,
          requestSha256: "1".repeat(64),
          activityId: `activity-${reason}`,
          expectedAggregateRevision: 0,
        },
        decision: Object.freeze({ kind: reason }),
      })).resolves.toEqual({ kind: "not_committed", reason });

      expect(repository.confirmGarminImport).not.toHaveBeenCalled();
      expect(invalidateReads).not.toHaveBeenCalled();
    },
  );

  it("rechecks the captured connection generation after preparation and before persistence", async () => {
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "activity-stale-generation",
        aggregateRevision: 1,
      })),
    };
    const invalidateReads = jest.fn(async () => undefined);
    const assertCurrentGeneration = jest.fn(async () => {
      throw new Error("stale_generation");
    });
    const runtime = createGarminImportRuntime({
      services: Object.freeze({ importedActivities: repository }),
      sha256,
      assertCurrentGeneration,
      invalidateReads,
    });

    await expect(runtime.commitEnvelope({
      envelope: envelope(),
      confirmation: {
        requestId: "request-stale-generation",
        requestSha256: "4".repeat(64),
        activityId: "activity-stale-generation",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-06-20",
      },
    })).rejects.toThrow("stale_generation");

    expect(assertCurrentGeneration).toHaveBeenCalledTimes(1);
    expect(repository.confirmGarminImport).not.toHaveBeenCalled();
    expect(invalidateReads).not.toHaveBeenCalled();
  });
});
