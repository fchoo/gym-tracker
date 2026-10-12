import {
  canonicalRunningRequestHash,
  createInactiveRunningPlan,
  saveRunningTarget,
  type SaveRunningTargetInput,
} from "../../domains/running/commands";
import { deriveRunningPacing } from "../../domains/progress/runningPacing";
import { runtimeSha256 } from "../../platform/crypto/runtimeSha256";
import { createMigrationRunner } from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import type { RecoveryBackupPort } from "../../platform/sqlite/recoveryBackup";
import { createProgressRepository } from "../../platform/sqlite/repositories/progressRepository";
import { createRunningPlanRepository } from "../../platform/sqlite/repositories/runningPlanRepository";
import type {
  SqliteKernel,
  SqliteSnapshotKernel,
} from "../../platform/sqlite/sqliteKernel";
import { createExpoMigrationsEffectsContractAdapter } from "./migrationsEffects.contract";

export const PROGRESS_PARITY_CONTRACT_VERSION = 1 as const;

/** Source-owned IDs are consumed unchanged by host and Expo SQLite runners. */
export const PROGRESS_PARITY_CONTRACT_CASES = [
  "progress-running-read-target-replay",
] as const;

export type ProgressParityContractCaseId =
  (typeof PROGRESS_PARITY_CONTRACT_CASES)[number];

type ProgressParityRuntime = Readonly<{
  databaseName: string;
  kernel: SqliteKernel;
  recoveryBackup?: RecoveryBackupPort;
  close(): Promise<void>;
}>;

export type ProgressParityContractAdapter = Readonly<{
  createRuntime(databaseKey: string): Promise<ProgressParityRuntime>;
  recoveryBackup: RecoveryBackupPort;
  cleanup?(): Promise<void>;
  sha256(value: string): Promise<string>;
}>;

type ProgressParityCounts = Readonly<{
  snapshots: number;
  runningFacts: number;
  goalRevisions: number;
  receiptRows: number;
  receiptReplays: number;
}>;

type ProgressParityHashes = Readonly<{
  source: string;
  projection: string;
  receipt: string;
}>;

export type ProgressParityContractCaseResult = Readonly<{
  id: ProgressParityContractCaseId;
  status: "passed" | "failed";
  code: "progress_contract_case_passed" | "progress_contract_case_failed";
  counts: ProgressParityCounts;
  timings: Readonly<{ durationMs: number }>;
  hashes: ProgressParityHashes;
  errorCode?: string;
}>;

export type ProgressParityContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PROGRESS_PARITY_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly ProgressParityContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

const EMPTY_COUNTS: ProgressParityCounts = Object.freeze({
  snapshots: 0,
  runningFacts: 0,
  goalRevisions: 0,
  receiptRows: 0,
  receiptReplays: 0,
});
const EMPTY_HASHES: ProgressParityHashes = Object.freeze({
  source: "0".repeat(64),
  projection: "0".repeat(64),
  receipt: "0".repeat(64),
});

function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "progress_contract_case_failed";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function seedAcceptedRunningFact(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO imported_activities
        (id, source, source_activity_id, started_at_ms, aggregate_json, imported_at_ms)
       VALUES ('progress-contract-activity', 'garmin', 'progress-contract-external',
               200, ?, 200)`,
      [JSON.stringify({
        confirmed_local_date: "2026-08-24",
        sample_fidelity: "source_summary",
        normalized: { distance_meters: 2_400, elapsed_ms: 660_000 },
      })],
    );
    await transaction.execute(
      `INSERT INTO imported_activity_identities
        (activity_id, source_kind, account_namespace, external_activity_id,
         aggregate_revision, accepted_normalized_sha256, removal_state)
       VALUES ('progress-contract-activity', 'garmin_connect_account',
               'synthetic-contract-owner', 'progress-contract-external',
               1, ?, 'active')`,
      ["a".repeat(64)],
    );
    await transaction.execute(
      `INSERT INTO imported_activity_events
        (id, activity_id, aggregate_revision, event_type, payload_json, created_at_ms)
       VALUES ('progress-contract-imported', 'progress-contract-activity', 1,
               'imported', '{}', 200)`,
    );
    await transaction.execute(
      `INSERT INTO imported_activity_current_lifecycle
        (activity_id, aggregate_revision, removal_state, lifecycle_event_id)
       VALUES ('progress-contract-activity', 1, 'active', 'progress-contract-imported')`,
    );
  });
}

async function runRunningReadTargetReplay(
  runtime: ProgressParityRuntime,
  recoveryBackup: RecoveryBackupPort,
  sha256: ProgressParityContractAdapter["sha256"],
): Promise<Readonly<{
  counts: ProgressParityCounts;
  hashes: ProgressParityHashes;
}>> {
  await createMigrationRunner({
    databaseName: runtime.databaseName,
    kernel: runtime.kernel,
    migrations,
    recoveryBackup: runtime.recoveryBackup ?? recoveryBackup,
  }).run();

  const running = createRunningPlanRepository(runtime.kernel);
  const sourcePlan = Object.freeze({
    version: 1 as const,
    id: "progress-contract-plan",
    name: "Synthetic Progress contract",
    revision: 1,
    createdAtMs: 100,
    goal: Object.freeze({
      version: 1 as const,
      id: "progress-contract-goal-r1",
      planId: "progress-contract-plan",
      revision: 1,
      goalDistanceMeters: 2_400,
      targetDurationMs: 660_000,
      trainingDays: ["Monday" as const],
      createdAtMs: 100,
    }),
    sessions: Object.freeze([]),
  });
  const createEnvelope = {
    requestId: "progress-contract-create",
    plan: sourcePlan,
  };
  await createInactiveRunningPlan(running, {
    ...createEnvelope,
    requestSha256: canonicalRunningRequestHash(createEnvelope),
  });
  await seedAcceptedRunningFact(runtime.kernel);

  let snapshots = 0;
  invariant(runtime.kernel.readSnapshot !== undefined, "progress_snapshot_kernel_required");
  const snapshotKernel = {
    ...runtime.kernel,
    readSnapshot: async <Result>(
      operation: Parameters<NonNullable<SqliteSnapshotKernel["readSnapshot"]>>[0],
    ): Promise<Result> => {
      snapshots += 1;
      return runtime.kernel.readSnapshot!(operation) as Promise<Result>;
    },
  } as SqliteSnapshotKernel;
  const read = await createProgressRepository(snapshotKernel).load({
    sport: "Running",
    period: "all_time",
    nowLocalDate: "2026-08-24",
  });
  invariant(read.dashboard?.sport === "Running", "progress_running_projection_missing");
  const goal = read.dashboard.goals[0];
  invariant(read.dashboard.state === "sparse" && read.dashboard.goals.length === 1,
    "progress_running_projection_invalid");
  invariant(goal?.distanceMeters === 2_400
    && goal.latest.durationSeconds === 660
    && goal.latest.sourceRevision === 1
    && goal.target?.durationSeconds === 660,
  "progress_running_facts_invalid");
  const pacing = deriveRunningPacing({
    distanceMeters: goal.distanceMeters,
    targetDurationSeconds: goal.target.durationSeconds,
  });
  invariant(pacing.target === "11:00" && pacing.pacePerKm === "4:35/km"
    && pacing.per400m === "1:50/400 m" && pacing.per200m === "0:55/200 m",
  "progress_running_pacing_invalid");

  const targetBase = {
    requestId: "progress-contract-target-save",
    planId: sourcePlan.id,
    expectedPlanRevision: 1,
    expectedGoalRevision: 1,
    savedAtMs: 300,
    goal: {
      ...sourcePlan.goal,
      id: "progress-contract-goal-r2",
      revision: 2,
      trainingDays: ["Monday", "Thursday"] as SaveRunningTargetInput["goal"]["trainingDays"],
      createdAtMs: 300,
    },
  };
  const targetInput: SaveRunningTargetInput = {
    ...targetBase,
    requestSha256: canonicalRunningRequestHash(targetBase),
  };
  await saveRunningTarget(running, targetInput); // Commit succeeds; acknowledgement is lost.
  const replay = await saveRunningTarget(running, targetInput);
  invariant(replay.outcome === "already_committed", "progress_target_replay_invalid");
  const [goalCount, receiptCount, readBack] = await Promise.all([
    runtime.kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM running_goals WHERE plan_id = ?",
      [sourcePlan.id],
    ),
    runtime.kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM running_plan_receipts WHERE request_id = ?",
      [targetInput.requestId],
    ),
    running.readAggregate(sourcePlan.id),
  ]);
  invariant(goalCount[0]?.count === 2 && receiptCount[0]?.count === 1
    && readBack?.revision === 2 && readBack.goal.revision === 2,
  "progress_target_readback_invalid");

  return Object.freeze({
    counts: Object.freeze({
      snapshots,
      runningFacts: goal.evidenceCount,
      goalRevisions: goalCount[0].count,
      receiptRows: receiptCount[0].count,
      receiptReplays: 1,
    }),
    hashes: Object.freeze({
      source: await sha256(canonicalJson({
        schemaVersion: migrations.at(-1)?.version,
        sourceRevision: goal.latest.sourceRevision,
        goalRevision: sourcePlan.goal.revision,
      })),
      projection: await sha256(canonicalJson({
        state: read.dashboard.state,
        distanceMeters: goal.distanceMeters,
        durationSeconds: goal.latest.durationSeconds,
        targetSeconds: goal.target.durationSeconds,
        pacing,
      })),
      receipt: await sha256(canonicalJson({
        outcome: replay.outcome,
        planRevision: readBack.revision,
        goalRevision: readBack.goal.revision,
        receiptRows: receiptCount[0].count,
      })),
    }),
  });
}

export async function createExpoProgressParityContractAdapter(
  runId: string,
): Promise<ProgressParityContractAdapter> {
  const base = await createExpoMigrationsEffectsContractAdapter(
    `progress-parity-${runId}`,
  );
  return Object.freeze({
    createRuntime: base.createRuntime,
    recoveryBackup: base.recoveryBackup,
    ...(base.cleanup === undefined ? {} : { cleanup: base.cleanup }),
    sha256: runtimeSha256,
  });
}

export async function runProgressParityContract(
  runIdOrAdapter: string | ProgressParityContractAdapter,
): Promise<ProgressParityContractResult> {
  const startedAt = new Date().toISOString();
  const adapter = typeof runIdOrAdapter === "string"
    ? await createExpoProgressParityContractAdapter(runIdOrAdapter)
    : runIdOrAdapter;
  const cases: ProgressParityContractCaseResult[] = [];
  try {
    for (const id of PROGRESS_PARITY_CONTRACT_CASES) {
      const startedMs = Date.now();
      const runtime = await adapter.createRuntime(id);
      try {
        const output = await runRunningReadTargetReplay(
          runtime,
          adapter.recoveryBackup,
          adapter.sha256,
        );
        cases.push(Object.freeze({
          id,
          status: "passed",
          code: "progress_contract_case_passed",
          counts: output.counts,
          timings: Object.freeze({ durationMs: Date.now() - startedMs }),
          hashes: output.hashes,
        }));
      } catch (error) {
        cases.push(Object.freeze({
          id,
          status: "failed",
          code: "progress_contract_case_failed",
          counts: EMPTY_COUNTS,
          timings: Object.freeze({ durationMs: Date.now() - startedMs }),
          hashes: EMPTY_HASHES,
          errorCode: safeErrorCode(error),
        }));
      } finally {
        await runtime.close();
      }
    }
  } finally {
    await adapter.cleanup?.();
  }
  const passed = cases.filter(({ status }) => status === "passed").length;
  return Object.freeze({
    schemaVersion: 1,
    contractVersion: PROGRESS_PARITY_CONTRACT_VERSION,
    status: passed === cases.length ? "passed" : "failed",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    skipped: 0,
    cases: Object.freeze(cases),
    startedAt,
    finishedAt: new Date().toISOString(),
  });
}
