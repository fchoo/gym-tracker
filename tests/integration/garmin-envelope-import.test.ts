import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async () => "a".repeat(64),
}));

jest.mock("../../modules/garmin-connect/src", () => ({
  getGarminConnectNativeModule: () => {
    throw new Error("native_module_not_used_by_host_import_test");
  },
}));

import { createGarminImportRuntime } from "../../src/bootstrap/garminImportRuntime";
import { canonicalJson } from "../../src/domains/activities/importContracts";
import type { GarminSourceEnvelope } from "../../src/domains/activities/garminActivitySourcePort";
import { resolveGarminImportRevision } from "../../src/domains/activities/importCommands";
import { confirmRunningActivityMatch } from "../../src/domains/running/activityMatchCommands";
import { normalizeGarminActivity } from "../../src/platform/garmin/normalizeGarminActivity";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createImportedActivityRepository } from "../../src/platform/sqlite/repositories/importedActivityRepository";
import { createLogicalBackupRepository } from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import { createLogicalRestoreRepository } from "../../src/platform/sqlite/repositories/logicalRestoreRepository";
import { createRunningActivityMatchRepository } from "../../src/platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../../src/platform/sqlite/repositories/runningPlanRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync() {
    return this.rows;
  }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }

  async finalizeAsync() {}
}

class Connection implements SqliteConnection {
  constructor(readonly db: DatabaseSync) {}
  async execAsync(sql: string) { this.db.exec(sql); }
  async prepareAsync(sql: string) { return new Statement(this.db.prepare(sql)); }
  async isInTransactionAsync() { return this.db.isTransaction; }
  async closeAsync() { this.db.close(); }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.clear();
});

async function applicationRuntime(input: Readonly<{
  invalidateReads?: () => Promise<void>;
}> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "gym-garmin-envelope-"));
  directories.add(directory);
  const path = join(directory, "gym.db");
  const fixture = new DatabaseSync(path);
  fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8"));
  fixture.close();
  const writer = new Connection(new DatabaseSync(path));
  const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  kernels.push(kernel);
  await createMigrationRunner({
    databaseName: path,
    kernel,
    migrations,
    recoveryBackup: {
      async createAndValidate(request) {
        return {
          backupId: "test",
          databaseName: request.databaseName,
          fromVersion: request.fromVersion,
          toVersion: request.toVersion,
          validated: true as const,
        };
      },
    },
  }).run();
  const services = Object.freeze({
    importedActivities: createImportedActivityRepository(kernel),
  });
  return {
    kernel,
    repository: services.importedActivities,
    runtime: createGarminImportRuntime({
      services,
      sha256,
      assertCurrentGeneration: async () => undefined,
      invalidateReads: input.invalidateReads ?? (async () => undefined),
    }),
  };
}

async function envelope() {
  return normalizeGarminActivity({
    account_namespace: "account-integration",
    external_activity_id: "424242",
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
  }, sha256);
}

function withNormalized(
  source: GarminSourceEnvelope,
  normalized: GarminSourceEnvelope["normalized"],
  externalActivityId = source.external_activity_id,
): GarminSourceEnvelope {
  return Object.freeze({
    ...source,
    external_activity_id: externalActivityId,
    normalized_json_sha256: createHash("sha256")
      .update(canonicalJson({ normalization_version: source.normalization_version, normalized }))
      .digest("hex"),
    normalized,
  });
}

async function seedRunningMatch(kernel: SqliteKernel, activityId: string): Promise<void> {
  const plans = createRunningPlanRepository(kernel);
  await kernel.write((transaction) => transaction.execute(
    "UPDATE workout_sessions SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms), active_session_exercise_id = NULL, active_set_id = NULL WHERE status = 'in_progress'",
  ));
  await kernel.write((transaction) => transaction.execute(
    "INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind) VALUES ('envelope-strength-schedule', 'plan-copy', 'active', 1, 1, NULL, 'strength')",
  ));
  await plans.createInactiveMinimum({
    planId: "envelope-running-plan",
    planName: "Running",
    anchorDayId: "envelope-running-anchor",
    scheduleId: "envelope-running-schedule",
    scheduleVersionId: "envelope-running-version",
    scheduleBindingId: "envelope-running-binding",
    createdAtMs: 1_000,
    effectiveLocalDate: "2026-10-05",
    timezone: "Asia/Singapore",
    recoveryRevisionId: "envelope-running-session-v1",
    slots: [{
      id: "envelope-running-slot",
      weekday: "Monday",
      ordinal: 0,
      sessionRevisionId: "envelope-running-session-v1",
    }],
  });
  await plans.activateMinimum({
    planId: "envelope-running-plan",
    scheduleId: "envelope-running-schedule",
    expectedPlanRevision: 1,
    expectedScheduleRevision: 1,
    activatedAtMs: 2_000,
  });
  await plans.materializeOccurrences({
    planId: "envelope-running-plan",
    scheduleId: "envelope-running-schedule",
    scheduleVersionId: "envelope-running-version",
    localDate: "2026-10-05",
    timezone: "Asia/Singapore",
    createdAtMs: 3_000,
    occurrenceIds: ["envelope-running-opportunity"],
  });
  const [activity] = await kernel.queryAll<{ accepted_normalized_sha256: string }>("SELECT accepted_normalized_sha256 FROM imported_activity_identities WHERE activity_id = ?", [activityId]);
  if (activity === undefined) throw new Error("accepted_activity_missing");
  await confirmRunningActivityMatch(createRunningActivityMatchRepository(kernel), {
    requestId: "envelope-running-match",
    requestSha256: "f".repeat(64),
    action: "match",
    activityId,
    expectedActivityRevision: 1,
    expectedAcceptedPayloadSha256: activity.accepted_normalized_sha256,
    opportunityId: "envelope-running-opportunity",
    expectedOpportunityRevision: 1,
    expectedRelationRevision: 0,
    planId: "envelope-running-plan",
    scheduleId: "envelope-running-schedule",
    scheduleVersionId: "envelope-running-version",
    expectedScheduleRevision: 2,
    planDayId: "envelope-running-anchor",
    expectedPlanDayRevision: 1,
    slotId: "envelope-running-slot",
    slotRevisionId: "envelope-running-slot:revision:1",
    expectedSlotRevision: 1,
    sessionRevisionId: "envelope-running-session-v1",
    expectedSessionRevision: 1,
    occurredAtMs: 4_000,
  });
}

describe("Garmin envelope import boundary", () => {
  it("commits one normalized envelope through the existing application import service", async () => {
    const { kernel, runtime } = await applicationRuntime();
    const source = await envelope();
    const input = {
      envelope: source,
      confirmation: {
        requestId: "request-envelope",
        requestSha256: "d".repeat(64),
        activityId: "activity-envelope",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    };

    await expect(runtime.commitEnvelope(input)).resolves.toEqual({
      kind: "imported",
      activityId: "activity-envelope",
      aggregateRevision: 1,
    });
    await expect(kernel.queryAll<{
      activity_id: string;
      request_sha256: string;
      confirmed_local_date: string;
    }>(`SELECT receipt.activity_id, receipt.request_sha256,
              json_extract(activity.aggregate_json, '$.confirmed_local_date') AS confirmed_local_date
         FROM imported_activity_receipts receipt
         JOIN imported_activities activity ON activity.id = receipt.activity_id
        WHERE receipt.id = ?`, [input.confirmation.requestId])).resolves.toEqual([{
      activity_id: input.confirmation.activityId,
      request_sha256: input.confirmation.requestSha256,
      confirmed_local_date: input.confirmation.confirmedLocalDate,
    }]);
    expect(source).not.toHaveProperty("fit_sha256");
    expect(source.normalized).toMatchObject({
      sport: "running",
      subtype: "outdoor",
      distance_meters: 5_000,
      elapsed_ms: 1_560_000,
      timer_ms: 1_500_000,
      moving_ms: 1_475_000,
    });
  });

  it("replays a committed receipt after acknowledgement is lost without a second dirty advance", async () => {
    let acknowledgements = 0;
    const { kernel, runtime } = await applicationRuntime({
      invalidateReads: async () => {
        acknowledgements += 1;
        throw new Error("acknowledgement_lost");
      },
    });
    const input = {
      envelope: await envelope(),
      confirmation: {
        requestId: "request-lost-ack",
        requestSha256: "e".repeat(64),
        activityId: "activity-lost-ack",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    };

    await expect(runtime.commitEnvelope(input)).rejects.toThrow("acknowledgement_lost");
    const [afterCommit] = await kernel.queryAll<{ mutation_generation: number }>(
      "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
    );
    await expect(runtime.commitEnvelope(input)).resolves.toEqual({
      kind: "replayed",
      activityId: input.confirmation.activityId,
      aggregateRevision: 1,
    });
    const [afterReplay] = await kernel.queryAll<{ mutation_generation: number }>(
      "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
    );

    expect(acknowledgements).toBe(1);
    expect(afterReplay).toEqual(afterCommit);
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT count(*) AS count FROM imported_activity_receipts WHERE id = ?",
      [input.confirmation.requestId],
    )).resolves.toEqual([{ count: 1 }]);
  });

  it("prepares ambiguous source time without writes and persists explicit midnight provenance on confirmation", async () => {
    const { kernel, runtime } = await applicationRuntime();
    const proposal = await runtime.prepareEnvelope({
      envelope: await envelope(),
      sourceDate: Object.freeze({
        sourceLocalDateTime: "2026-10-06T00:30:00",
      }),
    });

    expect(proposal.kind).toBe("date_confirmation_required");
    await expect(kernel.queryAll<{ activities: number; receipts: number }>(
      `SELECT (SELECT count(*) FROM imported_activities) AS activities,
              (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ activities: 0, receipts: 0 }]);

    const request = {
      requestId: "request-midnight",
      requestSha256: "2".repeat(64),
      activityId: "activity-midnight",
      expectedAggregateRevision: 0,
    };
    const decision = Object.freeze({
      kind: "confirmed" as const,
      localDate: "2026-10-06",
      localTime: "00:30:00",
      timeZone: "Asia/Singapore",
      utcOffsetMinutes: 480,
    });

    await expect(runtime.confirmPreparedDate({ proposal, request, decision })).resolves.toMatchObject({
      kind: "imported",
      activityId: request.activityId,
    });
    await expect(kernel.queryAll<{ date_provenance: string }>(
      "SELECT json_extract(aggregate_json, '$.date_provenance') AS date_provenance FROM imported_activities WHERE id = ?",
      [request.activityId],
    )).resolves.toEqual([{
      date_provenance: JSON.stringify({
        absolute_started_at_ms: proposal.date.absoluteStartedAtMs,
        source_local_date_time: "2026-10-06T00:30:00",
        confirmed_local_date: "2026-10-06",
        confirmed_local_time: "00:30:00",
        confirmed_time_zone: "Asia/Singapore",
        confirmed_utc_offset_minutes: 480,
      }),
    }]);

    await expect(runtime.confirmPreparedDate({ proposal, request, decision })).resolves.toMatchObject({
      kind: "replayed",
      activityId: request.activityId,
    });

    const zoneOnlyEnvelope = await envelope();
    const zoneOnlyProposal = await runtime.prepareEnvelope({
      envelope: withNormalized(zoneOnlyEnvelope, zoneOnlyEnvelope.normalized, "424243"),
      sourceDate: Object.freeze({
        sourceTimeZone: "Asia/Singapore",
        sourceUtcOffsetMinutes: 480,
      }),
    });
    await expect(runtime.confirmPreparedDate({
      proposal: zoneOnlyProposal,
      request: {
        requestId: "request-zone-only",
        requestSha256: "8".repeat(64),
        activityId: "activity-zone-only",
        expectedAggregateRevision: 0,
      },
      decision,
    })).resolves.toMatchObject({ kind: "imported" });
  });

  it.each([
    ["cancelled", "America/New_York"],
    ["stale", "Asia/Singapore"],
    ["invalid", "Australia/Lord_Howe"],
    ["dst_gap", "America/New_York"],
  ] as Array<[
    "cancelled" | "stale" | "invalid" | "dst_gap",
    string,
  ]>)("keeps %s date outcomes zero-write regardless of phone zone %s", async (reason, phoneZone) => {
    const { kernel, runtime } = await applicationRuntime();
    const proposal = await runtime.prepareEnvelope({
      envelope: await envelope(),
      sourceDate: Object.freeze({
        sourceLocalDateTime: "2026-03-08T02:30:00",
        sourceTimeZone: phoneZone,
      }),
    });

    await expect(runtime.confirmPreparedDate({
      proposal,
      request: {
        requestId: `request-${reason}`,
        requestSha256: "3".repeat(64),
        activityId: `activity-${reason}`,
        expectedAggregateRevision: 0,
      },
      decision: Object.freeze({ kind: reason }),
    })).resolves.toEqual({ kind: "not_committed", reason });
    await expect(kernel.queryAll<{ activities: number; receipts: number }>(
      `SELECT (SELECT count(*) FROM imported_activities) AS activities,
              (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ activities: 0, receipts: 0 }]);
  });

  it("serializes concurrent exact repeats into one import and one receipt replay", async () => {
    const { kernel, runtime } = await applicationRuntime();
    const input = {
      envelope: await envelope(),
      confirmation: {
        requestId: "request-concurrent",
        requestSha256: "5".repeat(64),
        activityId: "activity-concurrent",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    };

    const results = await Promise.all([
      runtime.commitEnvelope(input),
      runtime.commitEnvelope(input),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["imported", "replayed"]);
    await expect(kernel.queryAll<{ activities: number; payloads: number; receipts: number }>(
      `SELECT (SELECT count(*) FROM imported_activities) AS activities,
              (SELECT count(*) FROM imported_activity_payloads) AS payloads,
              (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ activities: 1, payloads: 1, receipts: 1 }]);
  });

  it("revalidates the connection generation after a queued import acquires the writer", async () => {
    const { kernel, repository } = await applicationRuntime();
    let releaseWriter!: () => void;
    let writerAcquired!: () => void;
    let repositoryEntered!: () => void;
    const writerGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const writerAcquiredGate = new Promise<void>((resolve) => {
      writerAcquired = resolve;
    });
    const repositoryEnteredGate = new Promise<void>((resolve) => {
      repositoryEntered = resolve;
    });
    const heldWrite = kernel.write(async () => {
      writerAcquired();
      await writerGate;
    });
    await writerAcquiredGate;

    let connectionGeneration = 1;
    const runtime = createGarminImportRuntime({
      services: {
        importedActivities: {
          confirmGarminImport(input) {
            const pending = repository.confirmGarminImport(input);
            repositoryEntered();
            return pending;
          },
        },
      },
      sha256,
      assertCurrentGeneration: async () => {
        if (connectionGeneration !== 1) throw new Error("stale_generation");
      },
      invalidateReads: async () => undefined,
    });
    const queuedImport = runtime.commitEnvelope({
      envelope: await envelope(),
      confirmation: {
        requestId: "request-queued-generation",
        requestSha256: "4".repeat(64),
        activityId: "activity-queued-generation",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    });
    await repositoryEnteredGate;

    connectionGeneration = 2;
    releaseWriter();
    await heldWrite;

    await expect(queuedImport).rejects.toThrow("stale_generation");
    await expect(kernel.queryAll<{ activities: number; receipts: number }>(
      `SELECT (SELECT count(*) FROM imported_activities) AS activities,
              (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ activities: 0, receipts: 0 }]);
  });

  it("keeps accepted facts and the current match pinned when the same source identity changes", async () => {
    const { kernel, repository, runtime } = await applicationRuntime();
    const accepted = await envelope();
    const acceptedInput = {
      envelope: accepted,
      confirmation: {
        requestId: "request-accepted",
        requestSha256: "6".repeat(64),
        activityId: "activity-accepted",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    };
    await runtime.commitEnvelope(acceptedInput);
    await seedRunningMatch(kernel, acceptedInput.confirmation.activityId);
    const revised = withNormalized(accepted, Object.freeze({
      ...accepted.normalized,
      distance_meters: accepted.normalized.distance_meters + 1,
    }));

    await expect(runtime.commitEnvelope({
      envelope: revised,
      confirmation: {
        ...acceptedInput.confirmation,
        requestId: "request-revised",
        requestSha256: "7".repeat(64),
      },
    })).resolves.toEqual({
      kind: "revision_review",
      activityId: acceptedInput.confirmation.activityId,
      aggregateRevision: 1,
    });
    await expect(kernel.queryAll<{
      accepted_normalized_sha256: string;
      payloads: number;
      proposals: number;
      receipts: number;
      matched_activity_revision: number;
      opportunity_id: string;
    }>(`SELECT identity.accepted_normalized_sha256,
              (SELECT count(*) FROM imported_activity_payloads WHERE activity_id = identity.activity_id) AS payloads,
              (SELECT count(*) FROM imported_activity_revision_proposals WHERE activity_id = identity.activity_id) AS proposals,
              (SELECT count(*) FROM imported_activity_receipts WHERE activity_id = identity.activity_id) AS receipts,
              event.activity_revision AS matched_activity_revision,
              current.opportunity_id
         FROM imported_activity_identities identity
         JOIN running_activity_current_matches current ON current.activity_id = identity.activity_id
         JOIN running_activity_match_events event ON event.id = current.event_id
        WHERE identity.activity_id = ?`, [acceptedInput.confirmation.activityId])).resolves.toEqual([{
      accepted_normalized_sha256: accepted.normalized_json_sha256,
      payloads: 2,
      proposals: 1,
      receipts: 2,
      matched_activity_revision: 1,
      opportunity_id: "envelope-running-opportunity",
    }]);

    await expect(runtime.commitEnvelope({
      envelope: revised,
      confirmation: {
        ...acceptedInput.confirmation,
        requestId: "request-revised",
        requestSha256: "7".repeat(64),
      },
    })).resolves.toMatchObject({ kind: "revision_review" });
    await expect(runtime.commitEnvelope({
      envelope: revised,
      confirmation: {
        ...acceptedInput.confirmation,
        requestId: "request-revised-second-receipt",
        requestSha256: "8".repeat(64),
      },
    })).resolves.toMatchObject({ kind: "revision_review" });
    await expect(kernel.queryAll<{ proposals: number; payloads: number; receipts: number }>(
      `SELECT
         (SELECT count(*) FROM imported_activity_revision_proposals) AS proposals,
         (SELECT count(*) FROM imported_activity_payloads) AS payloads,
         (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ proposals: 1, payloads: 2, receipts: 3 }]);

    await expect(repository.listGarminRevisionReviews()).resolves.toEqual([
      expect.objectContaining({
        activityId: acceptedInput.confirmation.activityId,
        acceptedRevision: 1,
        proposedRevision: 2,
        acceptedNormalizedSha256: accepted.normalized_json_sha256,
        proposedNormalizedSha256: revised.normalized_json_sha256,
        changedFields: ["distance_meters"],
      }),
    ]);
    const keepDecision = {
      action: "keep",
      requestId: "request-keep-revision-2",
      requestSha256: "4".repeat(64),
      activityId: acceptedInput.confirmation.activityId,
      expectedAggregateRevision: 1,
      proposedRevision: 2,
      expectedProposedSha256: revised.normalized_json_sha256,
      occurredAtMs: 10,
    } as const;
    await expect(resolveGarminImportRevision(repository, keepDecision))
      .resolves.toMatchObject({ kind: "revision_kept", aggregateRevision: 1 });
    await expect(resolveGarminImportRevision(repository, keepDecision))
      .resolves.toMatchObject({ kind: "revision_kept", aggregateRevision: 1 });
    await expect(resolveGarminImportRevision(repository, {
      ...keepDecision,
      requestSha256: "8".repeat(64),
    })).resolves.toMatchObject({ kind: "conflict" });
    await expect(repository.listGarminRevisionReviews()).resolves.toEqual([]);

    const acceptedRevision = withNormalized(accepted, Object.freeze({
      ...accepted.normalized,
      distance_meters: accepted.normalized.distance_meters + 2,
    }));
    await runtime.commitEnvelope({
      envelope: acceptedRevision,
      confirmation: {
        ...acceptedInput.confirmation,
        requestId: "request-revision-3",
        requestSha256: "5".repeat(64),
      },
    });
    const acceptDecision = {
      action: "accept",
      requestId: "request-accept-revision-3",
      requestSha256: "3".repeat(64),
      activityId: acceptedInput.confirmation.activityId,
      expectedAggregateRevision: 1,
      proposedRevision: 3,
      expectedProposedSha256: acceptedRevision.normalized_json_sha256,
      occurredAtMs: 11,
    } as const;
    await expect(resolveGarminImportRevision(repository, acceptDecision))
      .resolves.toMatchObject({ kind: "revision_accepted", aggregateRevision: 3 });
    await expect(resolveGarminImportRevision(repository, acceptDecision))
      .resolves.toMatchObject({ kind: "revision_accepted", aggregateRevision: 3 });
    await expect(resolveGarminImportRevision(repository, {
      ...acceptDecision,
      requestId: acceptedInput.confirmation.requestId,
      requestSha256: acceptedInput.confirmation.requestSha256,
    })).resolves.toMatchObject({ kind: "replayed", aggregateRevision: 3 });
    await expect(kernel.queryAll<{
      aggregate_revision: number;
      accepted_normalized_sha256: string;
      matched_activity_revision: number;
      aggregate_json: string;
    }>(`SELECT identity.aggregate_revision, identity.accepted_normalized_sha256,
              event.activity_revision AS matched_activity_revision,
              activity.aggregate_json
         FROM imported_activity_identities identity
         JOIN imported_activities activity ON activity.id = identity.activity_id
         JOIN running_activity_current_matches current ON current.activity_id = identity.activity_id
         JOIN running_activity_match_events event ON event.id = current.event_id
        WHERE identity.activity_id = ?`, [acceptedInput.confirmation.activityId])).resolves.toEqual([
      expect.objectContaining({
        aggregate_revision: 3,
        accepted_normalized_sha256: acceptedRevision.normalized_json_sha256,
        matched_activity_revision: 1,
        aggregate_json: expect.stringContaining(`"normalized_json_sha256":"${acceptedRevision.normalized_json_sha256}"`),
      }),
    ]);
  });

  it("does not merge a distinct external identity by equal digest, date, title, or distance", async () => {
    const { kernel, runtime } = await applicationRuntime();
    const first = await envelope();
    const second = withNormalized(first, first.normalized, "different-external-id");
    await runtime.commitEnvelope({
      envelope: first,
      confirmation: {
        requestId: "request-distinct-a",
        requestSha256: "8".repeat(64),
        activityId: "activity-distinct-a",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    });

    await expect(runtime.commitEnvelope({
      envelope: second,
      confirmation: {
        requestId: "request-distinct-b",
        requestSha256: "9".repeat(64),
        activityId: "activity-distinct-b",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    })).resolves.toMatchObject({ kind: "imported", activityId: "activity-distinct-b" });
    await expect(kernel.queryAll<{ count: number }>(
      "SELECT count(*) AS count FROM imported_activity_identities",
    )).resolves.toEqual([{ count: 2 }]);
  });

  it("restores an unresolved revision proposal and its factual diff from logical backup", async () => {
    const sourceRuntime = await applicationRuntime();
    const accepted = await envelope();
    await sourceRuntime.runtime.commitEnvelope({
      envelope: accepted,
      confirmation: {
        requestId: "proposal-backup-accepted",
        requestSha256: "a".repeat(64),
        activityId: "activity-proposal-backup",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    });
    const revised = withNormalized(accepted, {
      ...accepted.normalized,
      distance_meters: accepted.normalized.distance_meters + 50,
    });
    await sourceRuntime.runtime.commitEnvelope({
      envelope: revised,
      confirmation: {
        requestId: "proposal-backup-revised",
        requestSha256: "b".repeat(64),
        activityId: "activity-proposal-backup",
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      },
    });
    const backup = await createLogicalBackupRepository(sourceRuntime.kernel).collect({
      snapshotId: "proposal-backup",
      createdAtMs: 20,
    });
    expect(backup.tables.imported_activity_revision_proposals).toHaveLength(1);

    const restoredRuntime = await applicationRuntime();
    await createLogicalRestoreRepository(restoredRuntime.kernel, { nowMs: () => 21 }).restore(backup);
    await expect(createImportedActivityRepository(restoredRuntime.kernel).listGarminRevisionReviews())
      .resolves.toEqual([
        expect.objectContaining({
          activityId: "activity-proposal-backup",
          proposedNormalizedSha256: revised.normalized_json_sha256,
          changedFields: ["distance_meters"],
        }),
      ]);
  });

  it("rejects capacity limit plus one and FIT/hash fallback shapes before any source write", async () => {
    const { kernel, runtime } = await applicationRuntime();
    const source = await envelope();
    const overCapacity = withNormalized(source, {
      ...source.normalized,
      laps: Array.from({ length: 1_001 }, (_, ordinal) => ({
        ordinal,
        elapsed_ms: ordinal + 1,
      })),
    });
    const fitFallback = Object.freeze({
      ...source,
      fit_sha256: "a".repeat(64),
    }) as unknown as GarminSourceEnvelope;
    const confirmation = {
      requestId: "request-capacity",
      requestSha256: "a".repeat(64),
      activityId: "activity-capacity",
      expectedAggregateRevision: 0,
      confirmedLocalDate: "2026-10-06",
    };

    await expect(runtime.commitEnvelope({ envelope: overCapacity, confirmation })).rejects.toThrow("garmin_envelope_invalid");
    await expect(runtime.commitEnvelope({
      envelope: fitFallback,
      confirmation: { ...confirmation, requestId: "request-fit-fallback" },
    })).rejects.toThrow("garmin_envelope_invalid");
    await expect(kernel.queryAll<{ activities: number; receipts: number }>(
      `SELECT (SELECT count(*) FROM imported_activities) AS activities,
              (SELECT count(*) FROM imported_activity_receipts) AS receipts`,
    )).resolves.toEqual([{ activities: 0, receipts: 0 }]);
  });
});
