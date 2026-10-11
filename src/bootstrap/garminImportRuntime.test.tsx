import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";

import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";

import { canonicalJson } from "../domains/activities/importContracts";
import type {
  ConfirmGarminImportInput,
  GarminImportResult,
  ImportedActivityCommandRepository,
} from "../domains/activities/importCommands";
import type { GarminSourceEnvelope } from "../domains/activities/garminActivitySourcePort";
import {
  __garminImportRuntimeTestOnly,
  createGarminImportRuntime,
  createGarminRootRuntime,
  parseGarminRootOrigin,
  requireGarminAccountNamespace,
  useGarminImportRuntime,
} from "./garminImportRuntime";

let mockGarminNativeModule: GarminConnectNativeModule;
jest.mock("../../modules/garmin-connect/src", () => ({
  getGarminConnectNativeModule: () => mockGarminNativeModule,
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async () => "a".repeat(64),
}));

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

function envelopeWithSourceDate(input: Readonly<{
  sourceLocalDateTime: string;
  sourceUtcOffsetMinutes?: number;
}>): GarminSourceEnvelope {
  const source = envelope();
  const normalized = Object.freeze({
    ...source.normalized,
    source_local_date_time: input.sourceLocalDateTime,
    ...(input.sourceUtcOffsetMinutes === undefined
      ? {}
      : { source_utc_offset_minutes: input.sourceUtcOffsetMinutes }),
  });
  return Object.freeze({
    ...source,
    normalized,
    normalized_json_sha256: createHash("sha256")
      .update(canonicalJson({ normalization_version: source.normalization_version, normalized }))
      .digest("hex"),
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
      restoreSession: jest.fn(async () => ({
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
      listRunningSummaries: jest.fn(async () => ({
        items: [{
          account_namespace: sourceEnvelope.account_namespace,
          external_activity_id: sourceEnvelope.external_activity_id,
        }],
      })),
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
      restoreSession: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      login: jest.fn(async () => ({ kind: "disconnected" as const })),
      resumeMfa: jest.fn(async () => ({ kind: "disconnected" as const })),
      logout: jest.fn(async () => undefined),
      listRunningSummaries: jest.fn(async () => ({
        items: [{
          account_namespace: sourceEnvelope.account_namespace,
          external_activity_id: sourceEnvelope.external_activity_id,
        }],
      })),
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

  it("requires explicit date confirmation instead of committing a phone-zone-derived date", async () => {
    const sourceEnvelope = envelope();
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "must-not-commit",
        aggregateRevision: 1,
      })),
    };
    const source = {
      connectionState: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      restoreSession: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      login: jest.fn(async () => ({ kind: "disconnected" as const })),
      resumeMfa: jest.fn(async () => ({ kind: "disconnected" as const })),
      logout: jest.fn(async () => undefined),
      listRunningSummaries: jest.fn(async () => ({
        items: [{
          account_namespace: sourceEnvelope.account_namespace,
          external_activity_id: sourceEnvelope.external_activity_id,
        }],
      })),
      readActivity: jest.fn(async () => sourceEnvelope),
    };
    const runtime = createGarminRootRuntime({
      enforceSourceDatePolicy: true,
      loadActivities: async () => [],
      requestFor: async () => ({
        requestId: "date-policy-request",
        requestSha256: "d".repeat(64),
        activityId: "date-policy-activity",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-06-20",
      }),
      services: { importedActivities: repository },
      sha256,
      source,
    });

    await expect(runtime.coordinator.syncNow()).resolves.toMatchObject({
      kind: "failure",
      failure: { code: "date_confirmation_required" },
    });
    expect(repository.confirmGarminImport).not.toHaveBeenCalled();
  });

  it.each<readonly [330 | -90, "UTC-01:30" | "UTC+05:30"]>([
    [-90, "UTC-01:30"],
    [330, "UTC+05:30"],
  ])("derives %s-minute source offsets as %s without consulting the phone zone", async (offset, expectedZone) => {
    const sourceEnvelope = envelopeWithSourceDate({
      sourceLocalDateTime: "2026-06-20T08:00:00",
      sourceUtcOffsetMinutes: offset,
    });
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({
        kind: "imported" as const,
        activityId: `activity-${String(offset)}`,
        aggregateRevision: 1,
      })),
    };
    const source = {
      connectionState: async () => ({ kind: "connected" as const, account_namespace: sourceEnvelope.account_namespace, generation: 1 }),
      restoreSession: async () => ({ kind: "connected" as const, account_namespace: sourceEnvelope.account_namespace, generation: 1 }),
      login: async () => ({ kind: "disconnected" as const }),
      resumeMfa: async () => ({ kind: "disconnected" as const }),
      logout: async () => undefined,
      listRunningSummaries: async () => ({ items: [{
        account_namespace: sourceEnvelope.account_namespace,
        external_activity_id: sourceEnvelope.external_activity_id,
      }] }),
      readActivity: async () => sourceEnvelope,
    };
    const runtime = createGarminRootRuntime({
      enforceSourceDatePolicy: true,
      loadActivities: async () => [],
      requestFor: async () => ({
        requestId: `request-${String(offset)}`,
        requestSha256: "9".repeat(64),
        activityId: `activity-${String(offset)}`,
        expectedAggregateRevision: 0,
        confirmedLocalDate: "ignored",
      }),
      services: { importedActivities: repository },
      sha256,
      source,
    });

    await expect(runtime.coordinator.syncNow()).resolves.toMatchObject({ kind: "success" });
    expect(repository.confirmGarminImport).toHaveBeenCalledWith(expect.objectContaining({
      confirmedLocalDate: "2026-06-20",
      dateProvenance: expect.objectContaining({ confirmedTimeZone: expectedZone }),
    }));
    await expect(runtime.loadLastSuccessfulSync()).resolves.toBeNull();
    await expect(runtime.saveLastSuccessfulSync({
      attemptId: "attempt",
      completedAtMs: 1,
      counts: {
        pages: 1,
        discoveredActivities: 1,
        attemptedActivities: 1,
        newActivities: 1,
        unchangedActivities: 0,
        reviewActivities: 0,
        failedActivities: 0,
      },
    })).resolves.toBeUndefined();
  });

  it("requires confirmation when source local time has no bounded offset", async () => {
    const sourceEnvelope = envelopeWithSourceDate({ sourceLocalDateTime: "2026-06-20T08:00:00" });
    const repository: ImportedActivityCommandRepository = {
      confirmGarminImport: jest.fn(async () => ({ kind: "conflict" as const, activityId: "unused", aggregateRevision: 0 })),
    };
    const runtime = createGarminRootRuntime({
      enforceSourceDatePolicy: true,
      loadActivities: async () => [],
      requestFor: async () => ({
        requestId: "request-local-only",
        requestSha256: "8".repeat(64),
        activityId: "activity-local-only",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "ignored",
      }),
      services: { importedActivities: repository },
      sha256,
      source: {
        connectionState: async () => ({ kind: "connected" as const, account_namespace: sourceEnvelope.account_namespace, generation: 1 }),
        restoreSession: async () => ({ kind: "connected" as const, account_namespace: sourceEnvelope.account_namespace, generation: 1 }),
        login: async () => ({ kind: "disconnected" as const }),
        resumeMfa: async () => ({ kind: "disconnected" as const }),
        logout: async () => undefined,
        listRunningSummaries: async () => ({ items: [{
          account_namespace: sourceEnvelope.account_namespace,
          external_activity_id: sourceEnvelope.external_activity_id,
        }] }),
        readActivity: async () => sourceEnvelope,
      },
    });

    await expect(runtime.coordinator.syncNow()).resolves.toMatchObject({
      kind: "failure",
      failure: { code: "date_confirmation_required" },
    });
    expect(repository.confirmGarminImport).not.toHaveBeenCalled();
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
      restoreSession: jest.fn(async () => ({
        kind: "connected" as const,
        account_namespace: sourceEnvelope.account_namespace,
        generation: 1,
      })),
      login: jest.fn(async () => ({ kind: "disconnected" as const })),
      resumeMfa: jest.fn(async () => ({ kind: "disconnected" as const })),
      logout: jest.fn(async () => undefined),
      listRunningSummaries: jest.fn(async () => ({
        items: [{
          account_namespace: sourceEnvelope.account_namespace,
          external_activity_id: sourceEnvelope.external_activity_id,
        }],
      })),
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
        sourceTimeZone: "Asia/Singapore",
        sourceUtcOffsetMinutes: 480,
      }),
    });

    expect(proposal).toMatchObject({
      kind: "date_confirmation_required",
      date: {
        absoluteStartedAtMs: source.normalized.started_at_ms,
        sourceLocalDateTime: "2026-06-20T00:30:00",
        sourceTimeZone: "Asia/Singapore",
        sourceUtcOffsetMinutes: 480,
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
        sourceTimeZone: "Asia/Singapore",
        sourceUtcOffsetMinutes: 480,
        confirmedLocalDate: "2026-06-20",
        confirmedLocalTime: "00:30:00",
        confirmedTimeZone: "Asia/Singapore",
        confirmedUtcOffsetMinutes: 480,
      },
    });
    expect(invalidateReads).toHaveBeenCalledTimes(1);

    const noSourceProposal = await runtime.prepareEnvelope({
      envelope: source,
      sourceDate: Object.freeze({}),
    });
    await expect(__garminImportRuntimeTestOnly.createProductionRequestFactory(sha256)(noSourceProposal.staged))
      .resolves.toMatchObject({ confirmedLocalDate: "date-confirmation-required" });
    await expect(runtime.confirmPreparedDate({
      proposal: noSourceProposal,
      request: {
        requestId: "request-date-no-source",
        requestSha256: "e".repeat(64),
        activityId: "activity-date-no-source",
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

  it("parses every supported contextual origin and defaults unknown input to Workout", () => {
    expect(parseGarminRootOrigin("calendar")).toBe("calendar");
    expect(parseGarminRootOrigin("library")).toBe("library");
    expect(parseGarminRootOrigin("progress")).toBe("progress");
    expect(parseGarminRootOrigin("workout")).toBe("workout");
    expect(parseGarminRootOrigin(undefined)).toBe("workout");
    expect(requireGarminAccountNamespace("synthetic-runtime")).toBe("synthetic-runtime");
    expect(() => requireGarminAccountNamespace(null)).toThrow("sign_in_required");
  });

  it("composes the production hook through the packaged module and default digest/request factories", async () => {
    let nativeGeneration = 1;
    let nativeConnected = true;
    const productionAccountNamespace = "garmin:0123456789abcdef0123456789abcdef";
    const summary = (activityId: number | string) => ({
      activityId,
      activityTypeDTO: { typeKey: "running" },
      summaryDTO: {
        startTimeGMT: "2026-06-20T00:00:00.000Z",
        startTimeLocal: "2026-06-20T08:00:00",
        timeZoneId: "Asia/Singapore",
        distance: 5_000,
        duration: 1_500,
        elapsedDuration: 1_560,
        movingDuration: 1_475,
      },
    });
    const discovery = (activityId: number | string) => ({
      activityId,
      activityType: { typeKey: "running" },
    });
    mockGarminNativeModule = {
      runtimeInfo: jest.fn(async () => undefined),
      runAdversarialSuite: jest.fn(async () => undefined),
      forceRefreshForTest: jest.fn(async () => undefined),
      sessionRecordState: jest.fn(async () => undefined),
      restoreSession: jest.fn(async () => ({
        status: "ok",
        generation: nativeGeneration,
        data: { kind: "connected", account_namespace: productionAccountNamespace },
      })),
      connectionState: jest.fn(async () => ({
        status: "ok",
        generation: nativeGeneration,
        data: nativeConnected
          ? { kind: "connected", account_namespace: productionAccountNamespace }
          : { kind: "disconnected" },
      })),
      login: jest.fn(async () => {
        nativeGeneration = 2;
        return {
          status: "ok",
          generation: nativeGeneration,
          data: { kind: "mfa_required", challenge_handle: "synthetic-challenge" },
        };
      }),
      resumeMfa: jest.fn(async () => ({
        status: "ok",
        generation: nativeGeneration,
        data: { kind: "connected", account_namespace: productionAccountNamespace },
      })),
      logout: jest.fn(async () => {
        nativeGeneration = 3;
        nativeConnected = false;
        return {
          status: "ok",
          generation: nativeGeneration,
          data: { kind: "disconnected" },
        };
      }),
      getActivities: jest.fn(async () => ({
        status: "ok",
        generation: nativeGeneration,
        data: { items: [discovery(18_001), discovery("18002")] },
      })),
      getActivity: jest.fn(async ({ externalActivityId }) => ({
        status: "ok",
        generation: nativeGeneration,
        data: summary(externalActivityId),
      })),
      getActivitySplits: jest.fn(async () => ({
        status: "ok",
        generation: nativeGeneration,
        data: { lapDTOs: [] },
      })),
      getActivityDetails: jest.fn(async () => ({
        status: "ok",
        generation: nativeGeneration,
        data: { metricDescriptors: [], activityDetailMetrics: [] },
      })),
    };
    const application = {
      confirmGarminImport: jest.fn(async (input: ConfirmGarminImportInput) => ({
        kind: "imported" as const,
        activityId: input.activityId,
        aggregateRevision: 1,
      })),
      loadGarminActivities: jest.fn(async () => []),
      loadLastGarminSync: jest.fn(async () => null),
      saveLastGarminSync: jest.fn(async () => undefined),
    };
    const rendered = await renderHook(() => useGarminImportRuntime({ application }));

    await act(async () => {
      await expect(rendered.result.current.source.restoreSession()).resolves.toMatchObject({ kind: "connected" });
      await expect(rendered.result.current.source.connectionState()).resolves.toMatchObject({ kind: "connected" });
      await expect(rendered.result.current.source.login({ email: "synthetic", password: "synthetic" }))
        .resolves.toMatchObject({ kind: "mfa_required" });
      await expect(rendered.result.current.source.resumeMfa({
        challenge_handle: "synthetic-challenge",
        code: "000000",
      })).resolves.toMatchObject({ kind: "connected" });
      await expect(rendered.result.current.coordinator.syncNow()).resolves.toMatchObject({
        kind: "success",
        counts: { newActivities: 2 },
      });
      await expect(rendered.result.current.loadActivities()).resolves.toEqual([]);
      await expect(rendered.result.current.loadLastSuccessfulSync()).resolves.toBeNull();
      await rendered.result.current.saveLastSuccessfulSync({
        attemptId: "garmin-sync:1:1:0",
        completedAtMs: 1,
        counts: {
          pages: 1,
          discoveredActivities: 0,
          attemptedActivities: 0,
          newActivities: 0,
          unchangedActivities: 0,
          reviewActivities: 0,
          failedActivities: 0,
        },
      });
      await rendered.result.current.source.logout();
      await expect(rendered.result.current.source.connectionState())
        .resolves.toEqual({ kind: "disconnected" });
    });
    expect(mockGarminNativeModule.restoreSession).toHaveBeenCalledTimes(1);
    expect(application.confirmGarminImport).toHaveBeenCalledTimes(2);
    expect(application.loadLastGarminSync).toHaveBeenCalledTimes(1);
    expect(application.saveLastGarminSync).toHaveBeenCalledTimes(1);
    expect(application.confirmGarminImport).toHaveBeenCalledWith(expect.objectContaining({
      confirmedLocalDate: "2026-06-20",
      dateProvenance: {
        absoluteStartedAtMs: Date.UTC(2026, 5, 20),
        sourceLocalDateTime: "2026-06-20T08:00:00",
        sourceTimeZone: "Asia/Singapore",
        sourceUtcOffsetMinutes: 480,
        confirmedLocalDate: "2026-06-20",
        confirmedLocalTime: "08:00:00",
        confirmedTimeZone: "Asia/Singapore",
        confirmedUtcOffsetMinutes: 480,
      },
    }));
    expect(mockGarminNativeModule.getActivityDetails).toHaveBeenCalledWith({
      externalActivityId: "18002",
      maxchart: 2_000,
      maxpoly: 4_000,
    });
    await rendered.unmount();
  });

  it("rejects malformed packaged summary identities before normalization", async () => {
    for (const value of [null, { activityId: 0 }, { activityId: "bad" }]) {
      mockGarminNativeModule = {
        runtimeInfo: jest.fn(async () => undefined),
        runAdversarialSuite: jest.fn(async () => undefined),
        forceRefreshForTest: jest.fn(async () => undefined),
        sessionRecordState: jest.fn(async () => undefined),
        restoreSession: jest.fn(async () => undefined),
        connectionState: jest.fn(async () => ({
          status: "ok",
          generation: 1,
          data: {
            kind: "connected",
            account_namespace: "garmin:0123456789abcdef0123456789abcdef",
          },
        })),
        login: jest.fn(async () => undefined),
        resumeMfa: jest.fn(async () => undefined),
        logout: jest.fn(async () => undefined),
        getActivities: jest.fn(async () => ({
          status: "ok",
          generation: 1,
          data: { items: [value] },
        })),
        getActivity: jest.fn(async () => undefined),
        getActivitySplits: jest.fn(async () => undefined),
        getActivityDetails: jest.fn(async () => undefined),
      };
      const rendered = await renderHook(() => useGarminImportRuntime({
        application: {
          confirmGarminImport: jest.fn(async () => ({
            kind: "conflict" as const,
            activityId: "unused",
            aggregateRevision: 0,
          })),
          loadGarminActivities: jest.fn(async () => []),
          loadLastGarminSync: jest.fn(async () => null),
          saveLastGarminSync: jest.fn(async () => undefined),
        },
      }));
      await rendered.result.current.source.connectionState();
      await expect(rendered.result.current.source.listRunningSummaries({ limit: 1 }))
        .rejects.toThrow("malformed_response");
      await rendered.unmount();
    }
  });

  it("honors explicitly injected hook source, digest, and request factory", async () => {
    const source = {
      connectionState: jest.fn(async () => ({ kind: "disconnected" as const })),
      restoreSession: jest.fn(async () => ({ kind: "disconnected" as const })),
      login: jest.fn(async () => ({ kind: "disconnected" as const })),
      resumeMfa: jest.fn(async () => ({ kind: "disconnected" as const })),
      logout: jest.fn(async () => undefined),
      listRunningSummaries: jest.fn(async () => ({ items: [] })),
      readActivity: jest.fn(async () => envelope()),
    };
    const requestFor = jest.fn(async () => ({
      requestId: "unused-request",
      requestSha256: "f".repeat(64),
      activityId: "unused-activity",
      expectedAggregateRevision: 0,
      confirmedLocalDate: "2026-06-20",
    }));
    const rendered = await renderHook(() => useGarminImportRuntime({
      application: {
        confirmGarminImport: jest.fn(async () => ({
          kind: "conflict" as const,
          activityId: "unused",
          aggregateRevision: 0,
        })),
        loadGarminActivities: jest.fn(async () => []),
        loadLastGarminSync: jest.fn(async () => null),
        saveLastGarminSync: jest.fn(async () => undefined),
      },
      source,
      sha256,
      requestFor,
    }));
    expect(rendered.result.current.source).toBe(source);
    await expect(rendered.result.current.coordinator.syncNow()).resolves.toMatchObject({
      kind: "failure",
      failure: { code: "sign_in_required" },
    });
    await rendered.unmount();
  });
});
