import {
  canonicalRunningRequestHash,
  createInactiveRunningPlan,
  saveRunningTarget,
  type SaveRunningTargetInput,
} from "../../domains/running/commands";
import { deriveRunningPacing } from "../../domains/progress/runningPacing";
import { projectRelativeStrength } from "../../domains/progress/relativeStrength";
import type { ProgressRunningGoal } from "../../domains/progress/contracts";
import {
  canonicalBodyweightRequestPayload,
  transitionBodyweight,
  validateBodyweightCommand,
} from "../../domains/bodyweight/contracts";
import {
  canonicalRecommendationDecisionRequest,
  validateRecommendationDecisionInput,
} from "../../domains/progression/recommendationCommands";
import { runtimeSha256 } from "../../platform/crypto/runtimeSha256";
import { createMigrationRunner } from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import type { RecoveryBackupPort } from "../../platform/sqlite/recoveryBackup";
import {
  createProgressRepository,
  type ProgressRepository,
  type ProgressRepositoryRead,
} from "../../platform/sqlite/repositories/progressRepository";
import { createRunningPlanRepository } from "../../platform/sqlite/repositories/runningPlanRepository";
import type {
  SqliteKernel,
  SqliteSnapshotKernel,
} from "../../platform/sqlite/sqliteKernel";
import { createExpoMigrationsEffectsContractAdapter } from "./migrationsEffects.contract";

export const PROGRESS_PARITY_CONTRACT_VERSION = 1 as const;

/** Source-owned IDs are consumed unchanged by host and Expo SQLite runners. */
export const PROGRESS_PARITY_CONTRACT_CASES = [
  "progress-pro01-sport-range",
  "progress-pro02-all",
  "progress-pro03-strength",
  "progress-pro04-running",
  "progress-pro05-fixed-goal",
  "progress-pro06-unset-goals",
  "progress-pro07-source-states",
  "progress-pro08-errors",
  "progress-pro09-history-sheet",
  "progress-pro10-exercise-history",
  "progress-pro11-relative-view",
  "progress-pro12-target-editor",
  "progress-pro13-target-persistence",
  "progress-pro14-recommendation",
  "progress-pro15-recommendation-persistence",
  "progress-pro16-settings",
  "progress-pro17-bodyweight-history",
  "progress-pro18-bodyweight-editor",
] as const;

export const PROGRESS_PARITY_REQUIREMENT_BY_CASE = Object.freeze({
  "progress-pro01-sport-range": "PRO-01",
  "progress-pro02-all": "PRO-02",
  "progress-pro03-strength": "PRO-03",
  "progress-pro04-running": "PRO-04",
  "progress-pro05-fixed-goal": "PRO-05",
  "progress-pro06-unset-goals": "PRO-06",
  "progress-pro07-source-states": "PRO-07",
  "progress-pro08-errors": "PRO-08",
  "progress-pro09-history-sheet": "PRO-09",
  "progress-pro10-exercise-history": "PRO-10",
  "progress-pro11-relative-view": "PRO-11",
  "progress-pro12-target-editor": "PRO-12",
  "progress-pro13-target-persistence": "PRO-13",
  "progress-pro14-recommendation": "PRO-14",
  "progress-pro15-recommendation-persistence": "PRO-15",
  "progress-pro16-settings": "PRO-16",
  "progress-pro17-bodyweight-history": "PRO-17",
  "progress-pro18-bodyweight-editor": "PRO-18",
} as const);

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
  requirement: (typeof PROGRESS_PARITY_REQUIREMENT_BY_CASE)[ProgressParityContractCaseId];
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

async function probeRequirementOutcome(
  caseId: ProgressParityContractCaseId,
  input: Readonly<{
    repository: ProgressRepository;
    read: ProgressRepositoryRead;
    goal: ProgressRunningGoal;
    pacing: ReturnType<typeof deriveRunningPacing>;
    replayOutcome: string;
  }>,
): Promise<unknown> {
  switch (caseId) {
    case "progress-pro01-sport-range": {
      const periods = await Promise.all((["4_weeks", "12_weeks", "all_time"] as const)
        .map((period) => input.repository.load({
          sport: "Running", period, nowLocalDate: "2026-08-24",
        })));
      invariant(periods.every((result, index) =>
        result.sport === "Running"
        && result.period === (["4_weeks", "12_weeks", "all_time"] as const)[index]),
      "progress_contract_sport_range_invalid");
      return periods.map(({ sport, period, freshness }) => ({ sport, period, freshness }));
    }
    case "progress-pro02-all": {
      const result = await input.repository.load({
        sport: "All", period: "all_time", nowLocalDate: "2026-08-24",
      });
      invariant(result.dashboard?.sport === "All", "progress_contract_all_invalid");
      return { sport: result.dashboard.sport, state: result.dashboard.state };
    }
    case "progress-pro03-strength": {
      const result = await input.repository.load({
        sport: "Strength", period: "all_time", nowLocalDate: "2026-08-24",
      });
      invariant(result.dashboard?.sport === "Strength", "progress_contract_strength_invalid");
      return { sport: result.dashboard.sport, state: result.dashboard.state };
    }
    case "progress-pro04-running":
      invariant(input.goal.latest.durationSeconds === 660, "progress_contract_running_invalid");
      return { distanceMeters: input.goal.distanceMeters, latest: input.goal.latest.durationSeconds };
    case "progress-pro05-fixed-goal":
      invariant(input.pacing.target === "11:00", "progress_contract_fixed_goal_invalid");
      return input.pacing;
    case "progress-pro06-unset-goals": {
      let rejectedMissing = false;
      try {
        deriveRunningPacing({ distanceMeters: 10_000, targetDurationSeconds: 0 });
      } catch {
        rejectedMissing = true;
      }
      invariant(rejectedMissing, "progress_contract_unset_goal_invalid");
      return { missingTargetRejected: true };
    }
    case "progress-pro07-source-states":
      invariant(input.read.dashboard?.state === "sparse", "progress_contract_state_invalid");
      return { state: input.read.dashboard.state };
    case "progress-pro08-errors": {
      const refresh = input.read.refresh;
      invariant(refresh !== undefined
        && input.read.freshness === "current"
        && refresh.automaticRefresh.terminal === "current",
      "progress_contract_refresh_invalid");
      return refresh;
    }
    case "progress-pro09-history-sheet":
      invariant(input.goal.evidenceCount === 1, "progress_contract_history_evidence_invalid");
      return { evidenceCount: input.goal.evidenceCount, sourceRevision: input.goal.latest.sourceRevision };
    case "progress-pro10-exercise-history":
      invariant(input.goal.latest.sourceRevision === 1, "progress_contract_source_revision_invalid");
      return { sourceRevision: input.goal.latest.sourceRevision };
    case "progress-pro11-relative-view": {
      const relative = projectRelativeStrength({
        observation: { localDate: "2026-08-24", loadGrams: 72_000 },
        bodyweightFacts: [{
          factId: "bodyweight-fact", localDate: "2026-08-24", grams: 72_000,
          effectiveAtMs: 1, sourceRevision: 1, lifecycle: "active",
        }],
      });
      invariant(relative?.relativeLoad === 1, "progress_contract_relative_invalid");
      return relative;
    }
    case "progress-pro12-target-editor":
      invariant(input.goal.target?.durationSeconds === 660,
        "progress_contract_target_editor_invalid");
      return { target: input.goal.target.durationSeconds };
    case "progress-pro13-target-persistence":
      invariant(input.replayOutcome === "already_committed",
        "progress_contract_target_replay_invalid");
      return { replayOutcome: input.replayOutcome };
    case "progress-pro14-recommendation": {
      const decision = {
        recommendationId: "recommendation-contract",
        requestId: "recommendation-request",
        decision: "use_target" as const,
        expectedEvidenceVersion: 2,
        expectedSourceRevision: 1,
        expectedTargetRevision: 1,
        decidedAtMs: 1,
      };
      validateRecommendationDecisionInput(decision, "use_target");
      return { decision: decision.decision };
    }
    case "progress-pro15-recommendation-persistence": {
      const decisionRequest = {
        recommendationId: "recommendation-contract",
        requestId: "recommendation-request",
        decision: "keep_current_target",
        expectedEvidenceVersion: 2,
        expectedSourceRevision: 1,
        expectedTargetRevision: 1,
        decidedAtMs: 1,
      } as const;
      const request = canonicalRecommendationDecisionRequest(decisionRequest);
      invariant(request === canonicalRecommendationDecisionRequest(decisionRequest),
        "progress_contract_recommendation_receipt_invalid");
      return { request };
    }
    case "progress-pro16-settings": {
      const payload = canonicalBodyweightRequestPayload({
        operation: "create", ownerId: "owner", grams: 72_000,
      });
      invariant(!/gender|height|score/iu.test(payload), "progress_contract_settings_privacy_invalid");
      return { privacy: "bounded" };
    }
    case "progress-pro17-bodyweight-history":
    case "progress-pro18-bodyweight-editor": {
      const requestSha256 = "b".repeat(64);
      const command = {
        operation: "create" as const,
        requestId: "bodyweight-request",
        requestSha256,
        entryId: "bodyweight-entry",
        ownerId: "owner",
        expectedRevision: 0,
        revisionId: "bodyweight-revision",
        eventId: "bodyweight-event",
        occurredAtMs: 1,
        localDate: "2026-08-24",
        timezone: "Asia/Singapore",
        grams: 72_000,
      };
      validateBodyweightCommand(command, requestSha256);
      const transition = transitionBodyweight(undefined, command, requestSha256);
      invariant(transition.kind === "created" && transition.entry?.grams === 72_000,
        "progress_contract_bodyweight_invalid");
      const entry = transition.entry;
      invariant(entry !== undefined, "progress_contract_bodyweight_entry_missing");
      return caseId === "progress-pro17-bodyweight-history"
        ? { lifecycle: entry.lifecycle, revision: entry.revision }
        : { grams: entry.grams, localDate: entry.localDate };
    }
  }
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
  caseId: ProgressParityContractCaseId,
  requirement: (typeof PROGRESS_PARITY_REQUIREMENT_BY_CASE)[ProgressParityContractCaseId],
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
  const progressRepository = createProgressRepository(snapshotKernel);
  const read = await progressRepository.load({
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
  const requirementProbe = await probeRequirementOutcome(caseId, {
    repository: progressRepository,
    read,
    goal,
    pacing,
    replayOutcome: replay.outcome,
  });

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
        caseId,
        requirement,
        schemaVersion: migrations.at(-1)?.version,
        sourceRevision: goal.latest.sourceRevision,
        goalRevision: sourcePlan.goal.revision,
      })),
      projection: await sha256(canonicalJson({
        caseId,
        requirement,
        state: read.dashboard.state,
        distanceMeters: goal.distanceMeters,
        durationSeconds: goal.latest.durationSeconds,
        targetSeconds: goal.target.durationSeconds,
        pacing,
        requirementProbe,
      })),
      receipt: await sha256(canonicalJson({
        caseId,
        requirement,
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
      const requirement = PROGRESS_PARITY_REQUIREMENT_BY_CASE[id];
      const startedMs = Date.now();
      const runtime = await adapter.createRuntime(id);
      try {
        const output = await runRunningReadTargetReplay(
          id,
          requirement,
          runtime,
          adapter.recoveryBackup,
          adapter.sha256,
        );
        cases.push(Object.freeze({
          id,
          requirement,
          status: "passed",
          code: "progress_contract_case_passed",
          counts: output.counts,
          timings: Object.freeze({ durationMs: Date.now() - startedMs }),
          hashes: output.hashes,
        }));
      } catch (error) {
        cases.push(Object.freeze({
          id,
          requirement,
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
