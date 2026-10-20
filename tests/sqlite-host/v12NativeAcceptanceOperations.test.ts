import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

import type {
  SqliteConnection,
  SqlitePreparedResult,
  SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  type V12NativeAcceptanceCaseContract,
} from "../../src/testing/contracts/phase15Workout.contract";
import { MULTI_PLAN_RUNNING_CONTRACT_CASES } from "../../src/testing/contracts/multiPlanRunning.contract";
import { createRunningPlanRuntimePort } from "../../src/bootstrap/runningPlanRuntime";
import { createOwnedPlanRuntimePort } from "../../src/bootstrap/ownedPlanRuntime";
import { createCustomExerciseRepository } from "../../src/platform/sqlite/repositories/customExerciseRepository";
import {
  LIBRARY_ACCESSIBILITY_RECOVERY_PROFILE,
  LIBRARY_ACTION_SHEET_CONFIGURATION,
  readLibraryRuntimeSnapshot,
} from "../../src/bootstrap/libraryRuntimeReadPort";
import {
  dispatchV12NativeAcceptanceProductionOperation,
  executeV12NativeAcceptanceReadAction,
  prepareV12NativeAcceptanceProductionOperation,
  type V12NativeAcceptanceRequest,
} from "../../src/testing/v12NativeAcceptanceExecutor";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (null | number | string | Uint8Array)[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  private closed = false;
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }
}

const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
});

async function open(): Promise<SqliteKernel> {
  const connection = new Connection(new DatabaseSync(":memory:"));
  await configureSqliteConnection(connection, { enableWal: false });
  const kernel = createSqliteKernel({ reader: connection, writer: connection });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "v12-native-acceptance-operations-host",
    kernel,
    migrations,
    recoveryBackup: {
      createAndValidate: async (request) => ({
        backupId: "host",
        databaseName: request.databaseName,
        fromVersion: request.fromVersion,
        toVersion: request.toVersion,
        validated: true,
      }),
    },
  }).run();
  return kernel;
}

function requestFor(
  contract: V12NativeAcceptanceCaseContract,
  index: number,
): V12NativeAcceptanceRequest {
  return {
    shard: contract.shard,
    caseId: contract.caseId,
    fixtureId: "v12-synthetic-fixtures-r18",
    title: "V12 source operation audit",
    source: "V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS",
    requirement: contract.requirement,
    action: contract.actionId,
    readback: contract.uiReadback.label,
    sourceProbe: contract.sourceProbe,
    authorityTables: contract.probes.post.tables,
    nonce: `${index.toString(16).padStart(2, "0")}${"d".repeat(46)}`,
  };
}

async function executeSourceContractAudit(
  contract: V12NativeAcceptanceCaseContract,
  index: number,
) {
  const kernel = await open();
  let generated = 0;
  const handlerId = contract.operation.handlerId;
  const runtime = {
    ...(handlerId.startsWith("running-plan.") ? {
      running: createRunningPlanRuntimePort(kernel, {
        nowMs: () => 1_800_000_000_000,
        randomUUID: () => `v12-full-audit-running-${index}-${++generated}`,
        sha256: async (value: string) => createHash("sha256").update(value).digest("hex"),
      }),
    } : {}),
    ...(/^(?:custom-exercise|metric-profile)\./u.test(handlerId) ? {
      customExercises: createCustomExerciseRepository(kernel),
    } : {}),
    ...(handlerId.startsWith("metric-profile.") ? {
      ownedPlans: createOwnedPlanRuntimePort(kernel, {
        nowMs: () => 1_800_000_000_000,
        randomUUID: () => `v12-full-audit-owned-${index}-${++generated}`,
        sha256: async (value: string) => createHash("sha256").update(value).digest("hex"),
      }),
    } : {}),
  };
  const request = requestFor(contract, index);
  const execute = () => executeV12NativeAcceptanceReadAction({
    kernel,
    request,
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
      kernel, contract: operationContract, request: operationRequest, runtime,
    }),
    executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
      kernel, contract: operationContract, request: operationRequest, runtime,
    }),
  });
  try {
    const first = await execute();
    const replay = contract.operation.kind === "repository-mutation"
      ? await execute()
      : undefined;
    return Object.freeze({ first, replay });
  } finally {
    kernels.delete(kernel);
    await kernel.close();
  }
}

describe("v1.2 Workout and Library production operation registry", () => {
  it("audits all 55 fresh mutations/replays and all 33 case-specific reads on fresh migrated SQLite", async () => {
    const sourceOwned = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ shard }) => shard !== "multi-plan");
    const mutations = sourceOwned.filter(({ operation }) => operation.kind === "repository-mutation");
    const reads = sourceOwned.filter(({ operation }) => operation.kind === "repository-read");
    expect(sourceOwned).toHaveLength(88);
    expect(mutations).toHaveLength(55);
    expect(reads).toHaveLength(33);

    const receiptIds = new Set<string>();
    for (const [index, contract] of sourceOwned.entries()) {
      let audit: Awaited<ReturnType<typeof executeSourceContractAudit>>;
      try {
        audit = await executeSourceContractAudit(contract, index + 128);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`v12_native_acceptance_source_contract_audit_failed:${contract.caseId}:${detail}`);
      }
      const { first, replay } = audit;
      expect(first.source_receipt).toMatchObject({
        operation_id: contract.operation.id,
        operation_handler_id: contract.operation.handlerId,
        operation_postcondition_id: contract.operation.postcondition.id,
      });
      if (contract.operation.kind === "repository-read") {
        expect(first.source_receipt).toMatchObject({
          operation_result: "read",
          command_receipt_id: null,
          command_outcome: null,
          committed_effects: 0,
        });
        expect(first.source_receipt.pre.facts_sha256).toBe(first.source_receipt.post.facts_sha256);
        continue;
      }
      expect(first.source_receipt).toMatchObject({
        operation_result: "committed",
        command_outcome: "committed",
      });
      expect(first.source_receipt.committed_effects).toBeGreaterThanOrEqual(1);
      expect(first.source_receipt.command_receipt_id).toEqual(expect.any(String));
      expect(first.source_receipt.pre.facts_sha256).not.toBe(first.source_receipt.post.facts_sha256);
      expect(replay?.source_receipt).toMatchObject({
        operation_result: "committed",
        command_outcome: "already_committed",
        committed_effects: 0,
        command_receipt_id: first.source_receipt.command_receipt_id,
      });
      expect(receiptIds.has(first.source_receipt.command_receipt_id!)).toBe(false);
      receiptIds.add(first.source_receipt.command_receipt_id!);
    }
    expect(receiptIds.size).toBe(55);
  }, 180_000);

  it("delegates each Phase 13 case through the full source-owned wrapper", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ shard, caseId }) => (
      shard === "multi-plan" && caseId === "phase13-migration-failure-cuts"
    ))!;
    const runWrapper = jest.fn(async () => ({
      schemaVersion: 1 as const, contractVersion: 1 as const, status: "passed" as const,
      total: 13, passed: 13, failed: 0, skipped: 0 as const,
      cases: MULTI_PLAN_RUNNING_CONTRACT_CASES.map((id) => ({ id, status: "passed" as const, durationMs: 1 })),
      startedAt: "2026-10-01T00:00:00.000Z", finishedAt: "2026-10-01T00:00:01.000Z",
    }));
    await expect(dispatchV12NativeAcceptanceProductionOperation({
      kernel,
      contract,
      request: {
        shard: contract.shard, caseId: contract.caseId, fixtureId: "v12-synthetic-fixtures-r18",
        title: "Phase 13", source: "MULTI_PLAN_RUNNING_CONTRACT_CASES", requirement: contract.requirement,
        action: contract.actionId, readback: contract.uiReadback.label, sourceProbe: contract.sourceProbe,
        authorityTables: contract.probes.post.tables, nonce: `01${"a".repeat(46)}`,
      },
      runtime: { multiPlan: { runWrapper } },
    })).resolves.toMatchObject({
      result: "committed",
      facts: { outcome: "committed", committed_effects: 1, authoritative_readback: {
        status: "passed", total: 13, passed: 13, case: { id: contract.caseId, status: "passed" },
      } },
    });
    expect(runWrapper).toHaveBeenCalledTimes(1);
    await expect(dispatchV12NativeAcceptanceProductionOperation({ kernel, contract }))
      .rejects.toThrow("v12_native_acceptance_request_required");
  });

  it("executes every exact projection against schema 46 and refuses all 55 empty mutation receipts", async () => {
    const kernel = await open();
    const sourceOwned = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ shard }) => shard !== "multi-plan");
    expect(sourceOwned).toHaveLength(88);
    expect(sourceOwned.filter(({ operation }) => operation.kind === "repository-mutation")).toHaveLength(55);

    for (const contract of sourceOwned) {
      const execution = dispatchV12NativeAcceptanceProductionOperation({ kernel, contract });
      if (contract.operation.kind === "repository-mutation") {
        try {
          await execution;
          throw new Error(`${contract.caseId}:unexpected_success`);
        } catch (error) {
          const messages: string[] = [];
          let current: unknown = error;
          while (current instanceof Error) {
            messages.push(current.message);
            current = current.cause;
          }
          if (!messages.includes("v12_native_acceptance_request_required")) {
            throw new Error(`${contract.caseId}:${messages.join(":")}`);
          }
        }
      } else if ([
        "workout.root-identity", "workout.day-switch", "workout.scheduled-rest-empty",
        "workout.start-resume", "workout.active-layout", "workout.active-back",
        "workout.exercise-disclosure", "workout.active-indicator", "workout.set-states",
        "workout.complete-failure", "workout.readonly-presentation", "workout.accessibility", "workout.performance",
        "workout.trend",
        "workout.completion-review",
        "library.exercise-search", "library.builtin-exercise", "library.remembered-state", "library.neutral-plan-chooser",
        "library.plan-groups", "library.actions-sheet", "library.accessibility-recovery", "library.owned-summary", "library.editor-draft-guards", "library.load-error-recovery", "workout.plan-after-workout",
        "workout.warmup-order", "workout.completion-collapse", "workout.exercise-menu",
        "workout.timing-flat", "workout.rest-dock",
      ].includes(contract.caseId) || contract.operation.handlerId.startsWith("running-plan.")) {
        await expect(execution).rejects.toThrow("v12_native_acceptance_request_required");
      } else {
        await expect(execution).rejects.toThrow("v12_native_acceptance_postcondition_failed");
      }
    }
  });

  it("uses the real Running command port for a nonce-bound goal mutation and its exact replay", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ caseId }) => caseId === "library.running-goal-edit")!;
    const request: V12NativeAcceptanceRequest = {
      shard: "library-running",
      caseId: contract.caseId,
      fixtureId: "v12-synthetic-fixtures-r18",
      title: "Library and running",
      source: "PHASE17_CASE_ACTION_CONTRACTS",
      requirement: contract.requirement,
      action: contract.actionId,
      readback: contract.uiReadback.label,
      sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables,
      nonce: "b".repeat(48),
    };
    let id = 0;
    const runtime = createRunningPlanRuntimePort(kernel, {
      nowMs: () => 1_800_000_000_000,
      randomUUID: () => `host-${++id}`,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    });

    const execute = () => executeV12NativeAcceptanceReadAction({
      kernel,
      request,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest, runtime: { running: runtime },
      }),
      executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest, runtime: { running: runtime },
      }),
    });
    const first = await execute();
    const replay = await execute();

    expect(first.source_receipt).toMatchObject({ command_outcome: "committed", committed_effects: 1 });
    expect(replay.source_receipt).toMatchObject({ command_outcome: "already_committed", committed_effects: 0 });
    expect(first.source_receipt.command_receipt_id).toBe(replay.source_receipt.command_receipt_id);
    expect(first.source_receipt.command_receipt_id).toContain(request.nonce);
  });

  it("executes Workout starter and active-set commands with nonce-bound production state", async () => {
    const cases = [
      "workout.start-alternate",
      "workout.row-edit",
      "workout.duration-editor",
      "workout.all-metrics",
      "workout.add-set",
      "workout.complete-commit",
      "workout.rest-controls",
      "workout.rest-recovery",
      "workout.add-exercise",
      "workout.reorder",
      "workout.replace-exercise",
      "workout.delete-exercise",
      "workout.undo",
      "workout.plan-increment",
      "workout.outcomes",
      "workout.completion-writeback",
      "workout.timing-policy",
      "workout.appearance",
      "library.starter-activation",
      "library.starter-detail",
      "library.template-update",
      "library.true-no-plans",
      "library.create-strength",
      "library.owned-lifecycle",
      "library.plan-editor",
      "library.schedule-editor",
      "library.replacement-impact",
      "library.day-removal-impact",
      "library.running-conflict",
    ];
    for (const [index, caseId] of cases.entries()) {
      const kernel = await open();
      const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find((entry) => entry.caseId === caseId)!;
      const request: V12NativeAcceptanceRequest = {
        shard: contract.shard, caseId, fixtureId: "v12-synthetic-fixtures-r18",
        title: "Workout", source: "PHASE15_REQUIRED_CASES",
        requirement: contract.requirement, action: contract.actionId,
        readback: contract.uiReadback.label, sourceProbe: contract.sourceProbe,
        authorityTables: contract.probes.post.tables,
        nonce: `${index.toString(16).padStart(2, "0")}${"a".repeat(46)}`,
      };
      const execute = () => executeV12NativeAcceptanceReadAction({
        kernel, request,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
        prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest,
        }),
        executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest,
        }),
      });
      const first = await execute();
      const replay = await execute();
      expect(first.source_receipt).toMatchObject({ command_outcome: "committed", committed_effects: 1 });
      expect(replay.source_receipt).toMatchObject({
        command_outcome: "already_committed", committed_effects: 0,
        command_receipt_id: first.source_receipt.command_receipt_id,
      });
    }
  });

  it("loads the Workout trend through the history repository on a completed production session", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ caseId }) => caseId === "workout.trend")!;
    const request: V12NativeAcceptanceRequest = {
      shard: contract.shard, caseId: contract.caseId, fixtureId: "v12-synthetic-fixtures-r18",
      title: "Workout", source: "PHASE15_REQUIRED_CASES", requirement: contract.requirement,
      action: contract.actionId, readback: contract.uiReadback.label, sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables, nonce: `ee${"a".repeat(46)}`,
    };
    const result = await executeV12NativeAcceptanceReadAction({
      kernel, request,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
      }),
      executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
      }),
    });
    expect(result.source_receipt).toMatchObject({ operation_result: "read", command_receipt_id: null, committed_effects: 0 });
  });

  it("loads bundled exercise instructions through the production content repository", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ caseId }) => caseId === "library.builtin-exercise")!;
    const request: V12NativeAcceptanceRequest = {
      shard: contract.shard, caseId: contract.caseId, fixtureId: "v12-synthetic-fixtures-r18",
      title: "Library", source: "PHASE17_CASE_ACTION_CONTRACTS", requirement: contract.requirement,
      action: contract.actionId, readback: contract.uiReadback.label, sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables, nonce: `ef${"a".repeat(46)}`,
    };
    const result = await executeV12NativeAcceptanceReadAction({
      kernel, request,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
      }),
      executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
      }),
    });
    expect(result.source_receipt).toMatchObject({ operation_result: "read", command_receipt_id: null, committed_effects: 0 });
  });

  it("reads the persisted Library section through its production preference port", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ caseId }) => caseId === "library.remembered-state")!;
    const request: V12NativeAcceptanceRequest = {
      shard: contract.shard, caseId: contract.caseId, fixtureId: "v12-synthetic-fixtures-r18",
      title: "Library", source: "PHASE17_CASE_ACTION_CONTRACTS", requirement: contract.requirement,
      action: contract.actionId, readback: contract.uiReadback.label, sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables, nonce: `f1${"a".repeat(46)}`,
    };
    const result = await executeV12NativeAcceptanceReadAction({
      kernel, request,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
      }),
      executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
      }),
    });
    expect(result.source_receipt).toMatchObject({ operation_result: "read", command_receipt_id: null, committed_effects: 0 });
  });

  it("projects Library actions and accessibility recovery from the production runtime boundary", async () => {
    for (const [index, caseId] of ["library.actions-sheet", "library.accessibility-recovery"].entries()) {
      const kernel = await open();
      const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find((entry) => entry.caseId === caseId)!;
      const request: V12NativeAcceptanceRequest = {
        shard: contract.shard, caseId, fixtureId: "v12-synthetic-fixtures-r18",
        title: "Library", source: "PHASE17_CASE_ACTION_CONTRACTS", requirement: contract.requirement,
        action: contract.actionId, readback: contract.uiReadback.label, sourceProbe: contract.sourceProbe,
        authorityTables: contract.probes.post.tables, nonce: `${(0xfa + index).toString(16)}${"a".repeat(46)}`,
      };
      await prepareV12NativeAcceptanceProductionOperation({ kernel, contract, request });
      const operation = await dispatchV12NativeAcceptanceProductionOperation({ kernel, contract, request });
      expect(operation).toMatchObject({ result: "read" });
      const snapshot = await readLibraryRuntimeSnapshot({
        kernel, nowMs: () => 1_800_000_000_000, starterPlans: [], templates: [],
      });
      expect(snapshot).toMatchObject({
        sectionPreference: { section: "exercises" }, plans: { owned: [expect.any(Object)] },
      });
      expect(snapshot.exerciseFilterOptions.exerciseTypes.length).toBeGreaterThan(0);
      expect(LIBRARY_ACTION_SHEET_CONFIGURATION.actions).toEqual([
        { id: "create-plan", label: "Create plan", tone: "primary", enabled: true },
        { id: "create-exercise", label: "Create exercise", tone: "secondary", enabled: true },
        { id: "import-plan", label: "Import plan, unavailable, Later", tone: "secondary", enabled: false },
      ]);
      const result = await executeV12NativeAcceptanceReadAction({
        kernel, request,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
        prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest,
        }),
        executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest,
        }),
      });
      expect(result.source_receipt).toMatchObject({ operation_result: "read", command_receipt_id: null, committed_effects: 0 });
      if (caseId === "library.accessibility-recovery") {
        expect(LIBRARY_ACCESSIBILITY_RECOVERY_PROFILE).toMatchObject({
          actionSheetTestId: "library-actions-sheet-frame",
          focusRestore: "library-actions-trigger", minimumTouchTargetDp: 48, respectsReducedMotion: true,
        });
      }
    }
  });

  it("reads an absent owned-plan creation target through the owned-plan repository", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ caseId }) => caseId === "library.neutral-plan-chooser")!;
    const request: V12NativeAcceptanceRequest = {
      shard: contract.shard, caseId: contract.caseId, fixtureId: "v12-synthetic-fixtures-r18",
      title: "Library", source: "PHASE17_CASE_ACTION_CONTRACTS", requirement: contract.requirement,
      action: contract.actionId, readback: contract.uiReadback.label, sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables, nonce: `f0${"a".repeat(46)}`,
    };
    const result = await executeV12NativeAcceptanceReadAction({
      kernel, request,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
      }),
      executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
      }),
    });
    expect(result.source_receipt).toMatchObject({ operation_result: "read", command_receipt_id: null, committed_effects: 0 });
  });

  it("runs every Running Family B contract through a case-owned production command or projection", async () => {
    const contracts = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ caseId }) => (
      caseId.startsWith("library.running-") && caseId !== "library.running-conflict"
    ));
    expect(contracts).toHaveLength(14);

    for (const [index, contract] of contracts.entries()) {
      const kernel = await open();
      let id = 0;
      const runtime = createRunningPlanRuntimePort(kernel, {
        nowMs: () => 1_800_000_000_000,
        randomUUID: () => `family-b-${index}-${++id}`,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      });
      const request: V12NativeAcceptanceRequest = {
        shard: "library-running",
        caseId: contract.caseId,
        fixtureId: "v12-synthetic-fixtures-r18",
        title: "Library and running",
        source: "PHASE17_CASE_ACTION_CONTRACTS",
        requirement: contract.requirement,
        action: contract.actionId,
        readback: contract.uiReadback.label,
        sourceProbe: contract.sourceProbe,
        authorityTables: contract.probes.post.tables,
        nonce: `${index.toString(16).padStart(2, "0")}${"c".repeat(46)}`,
      };
      const execute = () => executeV12NativeAcceptanceReadAction({
        kernel,
        request,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
        prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest, runtime: { running: runtime },
        }),
        executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest, runtime: { running: runtime },
        }),
      });
      const first = await execute();
      if (contract.operation.kind === "repository-read") {
        expect(first.source_receipt).toMatchObject({ command_receipt_id: null, command_outcome: null, committed_effects: 0 });
      } else {
        expect(first.source_receipt).toMatchObject({ command_outcome: "committed", committed_effects: 1 });
        const replay = await execute();
        expect(replay.source_receipt).toMatchObject({
          command_outcome: "already_committed",
          committed_effects: 0,
          command_receipt_id: first.source_receipt.command_receipt_id,
        });
      }
    }
  });

  it("uses the custom-exercise repository to commit and replay a nonce-bound favorite mutation", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ caseId }) => caseId === "library.exercise-favorites")!;
    const request: V12NativeAcceptanceRequest = {
      shard: "library-running",
      caseId: contract.caseId,
      fixtureId: "v12-synthetic-fixtures-r18",
      title: "Library and running",
      source: "PHASE17_CASE_ACTION_CONTRACTS",
      requirement: contract.requirement,
      action: contract.actionId,
      readback: contract.uiReadback.label,
      sourceProbe: contract.sourceProbe,
      authorityTables: contract.probes.post.tables,
      nonce: "d".repeat(48),
    };
    const execute = () => executeV12NativeAcceptanceReadAction({
      kernel,
      request,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
        runtime: { customExercises: createCustomExerciseRepository(kernel) },
      }),
      executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
        kernel, contract: operationContract, request: operationRequest,
        runtime: { customExercises: createCustomExerciseRepository(kernel) },
      }),
    });

    const first = await execute();
    const replay = await execute();
    expect(first.source_receipt).toMatchObject({ command_outcome: "committed", committed_effects: 1 });
    expect(replay.source_receipt).toMatchObject({
      command_outcome: "already_committed",
      committed_effects: 0,
      command_receipt_id: first.source_receipt.command_receipt_id,
    });
  });

  it("runs the remaining custom-exercise command handlers with one receipt per nonce", async () => {
    const ids = [
      "library.create-exercise",
      "library.custom-exercise-edit",
      "library.custom-exercise-hide",
      "library.custom-exercise-unhide",
      "library.custom-exercise-copy-bundled",
      "library.custom-exercise",
      "library.custom-exercise-archive",
      "library.custom-exercise-reactivate",
    ];
    for (const [index, caseId] of ids.entries()) {
      const kernel = await open();
      const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find((entry) => entry.caseId === caseId)!;
      const request: V12NativeAcceptanceRequest = {
        shard: "library-running", caseId, fixtureId: "v12-synthetic-fixtures-r18",
        title: "Library and running", source: "PHASE17_CASE_ACTION_CONTRACTS",
        requirement: contract.requirement, action: contract.actionId, readback: contract.uiReadback.label,
        sourceProbe: contract.sourceProbe, authorityTables: contract.probes.post.tables,
        nonce: `${index.toString(16).padStart(2, "0")}${"e".repeat(46)}`,
      };
      const execute = () => executeV12NativeAcceptanceReadAction({
        kernel,
        request,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
        prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest,
          runtime: { customExercises: createCustomExerciseRepository(kernel) },
        }),
        executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest,
          runtime: { customExercises: createCustomExerciseRepository(kernel) },
        }),
      });
      const first = await execute();
      const replay = await execute();
      expect(first.source_receipt).toMatchObject({ command_outcome: "committed", committed_effects: 1 });
      expect(replay.source_receipt).toMatchObject({
        command_outcome: "already_committed", committed_effects: 0,
        command_receipt_id: first.source_receipt.command_receipt_id,
      });
    }
  });

  it("migrates each metric-profile acceptance case with a nonce-bound production event and replay", async () => {
    const ids = ["library.copy-metric-migration", "library.metric-profile-migration"];
    for (const [index, caseId] of ids.entries()) {
      const kernel = await open();
      let generated = 0;
      const ownedPlans = createOwnedPlanRuntimePort(kernel, {
        nowMs: () => 1_800_000_000_000,
        randomUUID: () => `metric-${index}-${++generated}`,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      });
      const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find((entry) => entry.caseId === caseId)!;
      const request: V12NativeAcceptanceRequest = {
        shard: "library-running", caseId, fixtureId: "v12-synthetic-fixtures-r18",
        title: "Library and running", source: "PHASE17_CASE_ACTION_CONTRACTS",
        requirement: contract.requirement, action: contract.actionId, readback: contract.uiReadback.label,
        sourceProbe: contract.sourceProbe, authorityTables: contract.probes.post.tables,
        nonce: `${index.toString(16).padStart(2, "0")}${"f".repeat(46)}`,
      };
      const runtime = {
        customExercises: createCustomExerciseRepository(kernel),
        ownedPlans,
      };
      const execute = () => executeV12NativeAcceptanceReadAction({
        kernel,
        request,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
        prepareOperation: ({ contract: operationContract, request: operationRequest }) => prepareV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest, runtime,
        }),
        executeOperation: ({ contract: operationContract, request: operationRequest }) => dispatchV12NativeAcceptanceProductionOperation({
          kernel, contract: operationContract, request: operationRequest, runtime,
        }),
      });
      const first = await execute();
      const replay = await execute();
      expect(first.source_receipt).toMatchObject({ command_outcome: "committed", committed_effects: 1 });
      expect(replay.source_receipt).toMatchObject({
        command_outcome: "already_committed", committed_effects: 0,
        command_receipt_id: first.source_receipt.command_receipt_id,
      });
    }
  });
});
