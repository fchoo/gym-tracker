import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import type { SQLInputValue } from "node:sqlite";

import type { GarminRevisionDecisionInput } from "../../../domains/activities/importCommands";
import { prepareGarminImport } from "../../../domains/activities/importCommands";
import { canonicalJson } from "../../../domains/activities/importContracts";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";
import { createImportedActivityRepository } from "./importedActivityRepository";

function queryKernel(rows: readonly Record<string, unknown>[]): SqliteKernel {
  return {
    queryAll: async <Row extends Record<string, unknown>>() => rows as readonly Row[],
  } as unknown as SqliteKernel;
}

function writeKernel(responses: readonly (readonly Record<string, unknown>[])[]): SqliteKernel {
  return {
    write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => {
      const pending = [...responses];
      return command({
        queryAll: async <Row extends Record<string, unknown>>() => (pending.shift() ?? []) as readonly Row[],
        execute: async () => ({ changes: 1, lastInsertRowId: 0 }),
      });
    },
  } as unknown as SqliteKernel;
}

function trackingKernel(responses: readonly (readonly Record<string, unknown>[])[]) {
  const operations: string[] = [];
  const kernel: SqliteKernel = {
    write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => {
      const pending = [...responses];
      return command({
        queryAll: async <Row extends Record<string, unknown>>(sql: string, _parameters?: readonly SQLInputValue[]) => {
          operations.push(`query:${sql}`);
          return (pending.shift() ?? []) as readonly Row[];
        },
        execute: async (sql) => {
          operations.push(`execute:${sql}`);
          return { changes: 1, lastInsertRowId: 0 };
        },
      });
    },
  } as unknown as SqliteKernel;
  return { kernel, operations };
}

const decision: GarminRevisionDecisionInput = Object.freeze({
  action: "keep",
  requestId: "revision-decision",
  requestSha256: "a".repeat(64),
  activityId: "activity-1",
  expectedAggregateRevision: 1,
  proposedRevision: 2,
  expectedProposedSha256: "b".repeat(64),
  occurredAtMs: 1,
});

const normalized = Object.freeze({
  version: 1 as const,
  started_at_ms: 1_700_000_000_000,
  sport: "running" as const,
  subtype: "outdoor",
  distance_meters: 5_000,
  elapsed_ms: 1_500_000,
  laps: [],
});

const envelope = Object.freeze({
  version: 1 as const,
  source_kind: "garmin_connect_account" as const,
  account_namespace: "garmin:abcdefabcdefabcdefabcdefabcdefab",
  external_activity_id: "42",
  normalization_version: 1,
  normalized_json_sha256: createHash("sha256")
    .update(canonicalJson({ normalization_version: 1, normalized }))
    .digest("hex"),
  raw_component_sha256: Object.freeze({
    activity: "a".repeat(64),
    splits: "b".repeat(64),
    details: "c".repeat(64),
  }),
  sample_fidelity: "source_summary" as const,
  normalized,
});

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

const replayCases: ReadonlyArray<Readonly<{
  label: string;
  responses: readonly (readonly Record<string, unknown>[])[];
  kind: "conflict" | "revision_accepted" | "revision_kept" | "replayed";
}>> = [
  { label: "mismatched receipt", responses: [[{ request_sha256: "c".repeat(64), activity_id: "activity-1" }]], kind: "conflict" },
  { label: "accepted replay", responses: [[{ request_sha256: decision.requestSha256, activity_id: decision.activityId }], [{ aggregate_revision: 3 }], [{ action: "accept" }]], kind: "revision_accepted" },
  { label: "kept replay", responses: [[{ request_sha256: decision.requestSha256, activity_id: decision.activityId }], [{ aggregate_revision: 1 }], [{ action: "keep" }]], kind: "revision_kept" },
  { label: "receipt without decision", responses: [[{ request_sha256: decision.requestSha256, activity_id: decision.activityId }], [{ aggregate_revision: 1 }], []], kind: "replayed" },
];

const staleCases: ReadonlyArray<Readonly<{
  label: string;
  responses: readonly (readonly Record<string, unknown>[])[];
}>> = [
  { label: "missing identity", responses: [[], []] },
  { label: "missing proposal", responses: [[{ aggregate_revision: 1, accepted_normalized_sha256: "a".repeat(64) }], []] },
  { label: "stale identity", responses: [[{ aggregate_revision: 2, accepted_normalized_sha256: "a".repeat(64) }], [{ normalized_sha256: decision.expectedProposedSha256, envelope_json: "{}" }]] },
  { label: "changed proposal", responses: [[{ aggregate_revision: 1, accepted_normalized_sha256: "a".repeat(64) }], [{ normalized_sha256: "c".repeat(64), envelope_json: "{}" }]] },
];

describe("imported activity repository defensive branches", () => {
  it("projects an empty diff when retained aggregate JSON has no normalized object", async () => {
    const repository = createImportedActivityRepository(queryKernel([{
      activity_id: "activity-1",
      aggregate_revision: 1,
      accepted_normalized_sha256: "a".repeat(64),
      accepted_aggregate_json: "{}",
      proposed_revision: 2,
      normalized_sha256: "b".repeat(64),
      proposed_aggregate_json: "{}",
    }]));
    await expect(repository.listGarminRevisionReviews()).resolves.toEqual([{
      activityId: "activity-1",
      acceptedRevision: 1,
      proposedRevision: 2,
      acceptedNormalizedSha256: "a".repeat(64),
      proposedNormalizedSha256: "b".repeat(64),
      changedFields: [],
    }]);
  });

  it.each(replayCases)("returns $label without mutating", async ({ responses, kind }) => {
    const repository = createImportedActivityRepository(writeKernel(responses));
    await expect(repository.resolveGarminRevision(decision)).resolves.toMatchObject({ kind });
  });

  it.each(staleCases)("fails closed for $label during revision resolution", async ({ responses }) => {
    const repository = createImportedActivityRepository(writeKernel([[], ...responses]));
    await expect(repository.resolveGarminRevision(decision)).resolves.toMatchObject({ kind: "conflict" });
  });

  it("replays an open revision proposal with the authoritative accepted revision", async () => {
    const staged = await prepareGarminImport(envelope, sha256);
    const repository = createImportedActivityRepository(writeKernel([
      [{ request_sha256: "d".repeat(64), activity_id: "activity-1" }],
      [{ aggregate_revision: 1 }],
      [{ proposed_revision: 3 }],
    ]));

    await expect(repository.confirmGarminImport({
      requestId: "request-1",
      requestSha256: "d".repeat(64),
      activityId: "activity-1",
      expectedAggregateRevision: 1,
      confirmedLocalDate: "2026-10-07",
      staged,
    })).resolves.toEqual({
      kind: "revision_review",
      activityId: "activity-1",
      aggregateRevision: 1,
    });
  });

  it.each([
    {
      label: "source kind mutation",
      mutate: (staged: Awaited<ReturnType<typeof prepareGarminImport>>) => ({
        ...staged,
        envelope: {
          ...staged.envelope,
          source_kind: "garmin_connect_account_mutated" as never,
        },
      }),
    },
    {
      label: "account namespace mutation",
      mutate: (staged: Awaited<ReturnType<typeof prepareGarminImport>>) => ({
        ...staged,
        envelope: {
          ...staged.envelope,
          account_namespace: "garmin:mutated-account",
        },
      }),
    },
    {
      label: "external activity id mutation",
      mutate: (staged: Awaited<ReturnType<typeof prepareGarminImport>>) => ({
        ...staged,
        envelope: {
          ...staged.envelope,
          external_activity_id: "99",
        },
      }),
    },
    {
      label: "normalized payload mutation",
      mutate: (staged: Awaited<ReturnType<typeof prepareGarminImport>>) => ({
        ...staged,
        envelope: {
          ...staged.envelope,
          normalized: {
            ...staged.envelope.normalized,
            distance_meters: 5_001,
          },
        },
      }),
    },
  ])("rejects $label before any repository query or write occurs", async ({ mutate }) => {
    const staged = await prepareGarminImport(envelope, sha256);
    const mutated = mutate(staged);
    const { kernel, operations } = trackingKernel([]);
    const repository = createImportedActivityRepository(kernel);

    await expect(repository.confirmGarminImport({
      requestId: "request-2",
      requestSha256: "e".repeat(64),
      activityId: "activity-2",
      expectedAggregateRevision: 0,
      confirmedLocalDate: "2026-10-07",
      staged: mutated,
    })).resolves.toEqual({
      kind: "conflict",
      activityId: "activity-2",
      aggregateRevision: 0,
    });
    expect(operations).toEqual([]);
  });
});
