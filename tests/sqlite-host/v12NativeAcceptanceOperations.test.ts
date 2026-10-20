import { afterEach, describe, expect, it } from "@jest/globals";
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
import { V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS } from "../../src/testing/contracts/phase15Workout.contract";
import { createRunningPlanRuntimePort } from "../../src/bootstrap/runningPlanRuntime";
import { createOwnedPlanRuntimePort } from "../../src/bootstrap/ownedPlanRuntime";
import { createCustomExerciseRepository } from "../../src/platform/sqlite/repositories/customExerciseRepository";
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

describe("v1.2 Workout and Library production operation registry", () => {
  it("delegates Phase 13 cases to their source-owned production contract", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(({ shard, caseId }) => (
      shard === "multi-plan" && caseId === "phase13-migration-failure-cuts"
    ))!;
    await expect(dispatchV12NativeAcceptanceProductionOperation({ kernel, contract }))
      .resolves.toMatchObject({ result: "committed", facts: { outcome: "committed", committed_effects: 1 } });
  });

  it("executes every exact projection against schema 45 and refuses all 55 empty mutation receipts", async () => {
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
          const unresolvedProductionCommands = new Set([
            "workout.offline-recovery",
          ]);
          const expectedFailure = unresolvedProductionCommands.has(contract.caseId)
            ? "v12_native_acceptance_mutation_receipt_missing"
            : "v12_native_acceptance_request_required";
          if (!messages.includes(expectedFailure)) {
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
        "library.plan-groups", "library.owned-summary", "library.editor-draft-guards", "library.load-error-recovery", "workout.plan-after-workout",
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
