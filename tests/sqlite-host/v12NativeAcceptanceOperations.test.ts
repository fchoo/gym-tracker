import { afterEach, describe, expect, it } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

import type {
  SqliteConnection,
  SqliteParameter,
  SqlitePreparedResult,
  SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteReadTransactionExecutor,
  type SqliteTransactionExecutor,
} from "../../src/platform/sqlite/sqliteKernel";
import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  type V12NativeAcceptanceCaseContract,
} from "../../src/testing/contracts/phase15Workout.contract";
import {
  MULTI_PLAN_RUNNING_CONTRACT_CASES,
  runMultiPlanRunningContractCase,
} from "../../src/testing/contracts/multiPlanRunning.contract";
import { createRunningPlanRuntimePort } from "../../src/bootstrap/runningPlanRuntime";
import { createOwnedPlanRuntimePort } from "../../src/bootstrap/ownedPlanRuntime";
import { createCustomExerciseRepository } from "../../src/platform/sqlite/repositories/customExerciseRepository";
import { createWorkoutRepository } from "../../src/platform/sqlite/repositories/workoutRepository";
import { completeSet } from "../../src/domains/workout/setCommands";
import {
  LIBRARY_ACCESSIBILITY_RECOVERY_PROFILE,
  LIBRARY_ACTION_SHEET_CONFIGURATION,
  readLibraryRuntimeSnapshot,
} from "../../src/bootstrap/libraryRuntimeReadPort";
import {
  dispatchV12NativeAcceptanceProductionOperation,
  executeV12NativeAcceptanceReadAction,
  prepareV12NativeAcceptanceProductCase,
  prepareV12NativeAcceptanceProductionOperation,
  readV12NativeAcceptanceReceipt,
  type V12NativeAcceptanceRequest,
} from "../../src/testing/v12NativeAcceptanceExecutor";
import { V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY } from "../../src/testing/v12NativeAcceptanceProductRegistry";

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

/**
 * Runs an acceptance handler against the migrated host database while corrupting
 * one read boundary.  The writer and every non-faulted read remain the real
 * SQLite kernel, so these cases prove the executor rejects a bad authoritative
 * readback rather than relying on a synthetic handler result.
 */
function faultedReadKernel(
  base: SqliteKernel,
  intercept: (
    sql: string,
    parameters: readonly SqliteParameter[],
    read: () => Promise<readonly unknown[]>,
  ) => Promise<readonly unknown[]>,
): SqliteKernel {
  const queryAll = async <Row,>(
    sql: string,
    parameters: readonly SqliteParameter[] = [],
  ): Promise<readonly Row[]> => intercept(
    sql,
    parameters,
    () => base.queryAll(sql, parameters) as Promise<readonly unknown[]>,
  ) as Promise<readonly Row[]>;
  return {
    queryAll,
    readSnapshot: async <Result,>(read: (transaction: SqliteReadTransactionExecutor) => Promise<Result>) => base.readSnapshot!(async (transaction) => {
      const snapshotQueryAll = async <Row,>(
        sql: string,
        parameters: readonly SqliteParameter[] = [],
      ): Promise<readonly Row[]> => intercept(
        sql,
        parameters,
        () => transaction.queryAll(sql, parameters) as Promise<readonly unknown[]>,
      ) as Promise<readonly Row[]>;
      return read({ queryAll: snapshotQueryAll });
    }),
    write: async <Result,>(command: (transaction: SqliteTransactionExecutor) => Promise<Result>) => base.write(async (transaction) => {
      const writeQueryAll = async <Row,>(
        sql: string,
        parameters: readonly SqliteParameter[] = [],
      ): Promise<readonly Row[]> => intercept(
        sql,
        parameters,
        () => transaction.queryAll(sql, parameters) as Promise<readonly unknown[]>,
      ) as Promise<readonly Row[]>;
      return command({ ...transaction, queryAll: writeQueryAll });
    }),
  } as SqliteKernel;
}

function contractFor(caseId: string): V12NativeAcceptanceCaseContract {
  const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find((entry) => entry.caseId === caseId);
  if (contract === undefined) throw new Error(`missing v12 contract: ${caseId}`);
  return contract;
}

async function prepareHostCase(
  kernel: SqliteKernel,
  contract: V12NativeAcceptanceCaseContract,
  index: number,
): Promise<V12NativeAcceptanceRequest> {
  const request = requestFor(contract, index);
  await prepareV12NativeAcceptanceProductionOperation({ kernel, contract, request });
  return request;
}

async function expectRejectsExactly(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if ((error as Error).message !== message) {
      const cause = (error as Error).cause;
      const causeMessage = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`expected ${message} but received ${(error as Error).message} cause ${causeMessage}`);
    }
    expect((error as Error).cause).toBeUndefined();
    return;
  }
  throw new Error(`expected rejection: ${message}`);
}

async function expectRejectsWithExactCause(promise: Promise<unknown>, message: string, causeMessage: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(message);
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error).message).toBe(causeMessage);
    return;
  }
  throw new Error(`expected rejection: ${message}`);
}

function failReadOnMatch(
  needle: string,
  errorRows: readonly unknown[] = [],
  target = 1,
): (
  sql: string,
  parameters: readonly SqliteParameter[],
  read: () => Promise<readonly unknown[]>,
) => Promise<readonly unknown[]> {
  let matches = 0;
  return async (sql, _parameters, read) => {
    const rows = await read();
    if (!sql.includes(needle)) return rows;
    matches += 1;
    return matches === target ? errorRows : rows;
  };
}

async function dispatchPreparedHostCase(input: Readonly<{
  caseId: string;
  index: number;
  intercept: Parameters<typeof faultedReadKernel>[1];
  runtime?: Parameters<typeof dispatchV12NativeAcceptanceProductionOperation>[0]["runtime"];
}>): Promise<unknown> {
  const kernel = await open();
  const contract = contractFor(input.caseId);
  const request = await prepareHostCase(kernel, contract, input.index);
  return dispatchV12NativeAcceptanceProductionOperation({
    kernel: faultedReadKernel(kernel, input.intercept),
    contract,
    request,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });
}

describe("v1.2 Workout and Library production operation registry", () => {
  it("fails closed when real SQLite reads violate executor fixture and mutation postconditions", async () => {
    const cases = [
      {
        caseId: "workout.complete-failure",
        error: "v12_native_acceptance_workout_metric_draft_precondition_missing",
        intercept: async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
          const rows = await read();
          return sql.includes("set_row.metric_profile")
            ? (rows as readonly Record<string, unknown>[]).map((row) => ({ ...row, metric_profile: "load_reps" }))
            : rows;
        },
      },
      {
        caseId: "workout.complete-failure",
        error: "v12_native_acceptance_workout_complete_failure_fixture_invalid",
        intercept: async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
          const rows = await read();
          return sql.includes("SELECT status, observed_json, completion_idempotency_key FROM session_sets")
            ? (rows as readonly Record<string, unknown>[]).map((row) => ({ ...row, status: "completed" }))
            : rows;
        },
      },
      {
        caseId: "workout.duration-editor",
        error: "v12_native_acceptance_workout_metric_draft_activation_failed",
        intercept: async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
          const rows = await read();
          if (sql.includes("SELECT active_session_exercise_id, active_set_id FROM workout_sessions")) {
            return (rows as readonly Record<string, unknown>[]).map((row) => ({ ...row, active_session_exercise_id: "wrong-active-exercise" }));
          }
          return sql.includes("LEFT JOIN session_exercises exercise")
            ? (rows as readonly Record<string, unknown>[]).map((row) => ({ ...row, exercise_id: null, exercise_revision: null }))
            : rows;
        },
      },
      {
        caseId: "workout.appearance",
        error: "v12_native_acceptance_appearance_preference_postcondition_failed",
        intercept: async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
          const rows = await read();
          return sql.includes("SELECT value_json FROM app_settings WHERE key = ? LIMIT 1")
            ? [{ value_json: JSON.stringify("Light") }]
            : rows;
        },
      },
      {
        caseId: "workout.timing-policy",
        error: "v12_native_acceptance_handler_execution_failed",
        intercept: (() => {
          let preferenceReads = 0;
          return async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
            const rows = await read();
            if (!sql.includes("SELECT value_json, revision FROM app_settings WHERE key = ?")) return rows;
            preferenceReads += 1;
            return preferenceReads === 4
              ? [{ value_json: JSON.stringify({ version: 1, planId: "wrong", defaultRestSeconds: 30, weightIncrementGrams: 2500 }), revision: 99 }]
              : rows;
          };
        })(),
      },
      {
        caseId: "workout.complete-commit",
        error: "v12_native_acceptance_workout_complete_postcondition_failed",
        intercept: async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
          const rows = await read();
          if (sql.includes("set_row.completion_idempotency_key IS NOT NULL")) return [];
          return sql.includes("WHERE completion_idempotency_key = ?")
            ? (rows as readonly Record<string, unknown>[]).map((row) => ({ ...row, status: "planned" }))
            : rows;
        },
      },
    ] as const;

    for (const [index, fault] of cases.entries()) {
      const kernel = await open();
      const contract = contractFor(fault.caseId);
      const request = await prepareHostCase(kernel, contract, 32 + index);
      await expect(dispatchV12NativeAcceptanceProductionOperation({
        kernel: faultedReadKernel(kernel, fault.intercept),
        contract,
        request,
      })).rejects.toThrow(fault.error);
    }
  }, 180_000);

  it("executes the first complete-set callback on SQLite instead of taking only the replay path", async () => {
    const kernel = await open();
    const contract = contractFor("workout.complete-commit");
    const request = await prepareHostCase(kernel, contract, 80);
    const result = await dispatchV12NativeAcceptanceProductionOperation({
      kernel: faultedReadKernel(kernel, async (sql, _parameters, read) => (
        sql.includes("set_row.completion_idempotency_key IS NOT NULL") ? [] : read()
      )),
      contract,
      request,
    });
    expect(result).toMatchObject({ result: "committed", facts: { outcome: "committed" } });
  }, 90_000);


  it("fails exact late SQLite read guards after valid acceptance setup", async () => {
    const cases = [
      {
        caseId: "workout.rest-recovery",
        error: "v12_native_acceptance_workout_rest_precondition_missing",
        intercept: failReadOnMatch("LEFT JOIN session_rest_states rs ON rs.session_id = ws.id", [], 3),
      },
      {
        caseId: "workout.add-exercise",
        error: "v12_native_acceptance_workout_fixture_session_missing",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 2),
      },
      {
        caseId: "workout.completion-review",
        error: "v12_native_acceptance_workout_read_precondition_missing",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 2),
      },
      {
        caseId: "workout.readonly-presentation",
        error: "v12_native_acceptance_workout_read_precondition_missing",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 2),
      },
      {
        caseId: "workout.trend",
        error: "v12_native_acceptance_workout_fixture_session_missing",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 2),
      },
      {
        caseId: "workout.plan-increment",
        error: "v12_native_acceptance_plan_increment_session_missing",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 3),
      },
      {
        caseId: "workout.outcomes",
        error: "v12_native_acceptance_workout_finish_partial_precondition_missing",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 2),
      },
      {
        caseId: "workout.start-alternate",
        error: "v12_native_acceptance_workout_start_postcondition_failed",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 2),
      },
      {
        caseId: "workout.rest-controls",
        error: "v12_native_acceptance_workout_rest_precondition_missing",
        intercept: failReadOnMatch("LEFT JOIN session_rest_states rs ON rs.session_id = ws.id", [], 3),
      },
      {
        caseId: "workout.undo",
        error: "v12_native_acceptance_workout_undo_receipt_missing",
        intercept: failReadOnMatch("FROM session_undo_snapshots", [], 2),
      },

      {
        caseId: "workout.complete-failure",
        error: "v12_native_acceptance_workout_complete_failure_fixture_invalid",
        intercept: async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
          const rows = await read();
          return sql.includes("SELECT status, observed_json, completion_idempotency_key FROM session_sets")
            ? (rows as readonly Record<string, unknown>[]).map((row) => ({ ...row, status: "draft", observed_json: null, completion_idempotency_key: null }))
            : rows;
        },
      },
      {
        caseId: "workout.delete-exercise",
        error: "v12_native_acceptance_workout_fixture_session_missing",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 3),
      },
      {
        caseId: "workout.undo",
        error: "v12_native_acceptance_workout_fixture_session_missing",
        intercept: failReadOnMatch("WHERE plan_id = ? AND started_at_ms = ? AND source = 'alternate_day'", [], 3),
      },
      {
        caseId: "workout.rest-controls",
        error: "v12_native_acceptance_workout_fixture_session_missing",
        intercept: failReadOnMatch("SELECT id, revision FROM workout_sessions WHERE id = ? AND status = 'in_progress'", [], 1),
      },
      {
        caseId: "workout.complete-commit",
        error: "v12_native_acceptance_workout_metric_precondition_missing",
        intercept: async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
          const rows = await read();
          return sql.includes("set_row.metric_profile")
            ? (rows as readonly Record<string, unknown>[]).map((row) => ({ ...row, metric_profile: "unscored" }))
            : rows;
        },
      },
    ] as const;

    for (const [offset, fault] of cases.entries()) {
      await expectRejectsExactly(dispatchPreparedHostCase({
        caseId: fault.caseId,
        index: 96 + offset,
        intercept: fault.intercept,
      }), fault.error);
    }
  }, 240_000);

  it("fails exact late SQLite receipt and postcondition replay guards", async () => {
    const cases = [
      {
        caseId: "library.owned-lifecycle",
        error: "v12_native_acceptance_owned_plan_archive_postcondition_failed",
        intercept: failReadOnMatch("FROM owned_plan_mutation_requests", [], 3),
      },
      {
        caseId: "library.plan-editor",
        error: "v12_native_acceptance_owned_plan_save_postcondition_failed",
        intercept: failReadOnMatch("FROM owned_plan_mutation_requests", [], 3),
      },
      {
        caseId: "library.schedule-editor",
        error: "v12_native_acceptance_schedule_receipt_invalid",
        intercept: failReadOnMatch("FROM owned_plan_schedule_events", [], 3),
      },
      {
        caseId: "library.starter-detail",
        error: "v12_native_acceptance_starter_editable_copy_postcondition_failed",
        intercept: failReadOnMatch("FROM owned_plan_mutation_requests", [], 3),
      },
      {
        caseId: "library.template-update",
        error: "v12_native_acceptance_starter_template_copy_postcondition_failed",
        intercept: failReadOnMatch("FROM owned_plan_mutation_requests", [], 3),
      },

      {
        caseId: "workout.outcomes",
        error: "v12_native_acceptance_workout_finish_partial_postcondition_failed",
        intercept: async (sql: string, _parameters: readonly SqliteParameter[], read: () => Promise<readonly unknown[]>) => {
          const rows = await read();
          return sql.includes("FROM workout_receipts") && sql.includes("WHERE id = ?")
            ? (rows as readonly Record<string, unknown>[]).map((row) => ({ ...row, request_sha256: "0".repeat(64) }))
            : rows;
        },
      },
      {
        caseId: "workout.rest-controls",
        error: "v12_native_acceptance_workout_rest_adjust_postcondition_failed",
        intercept: failReadOnMatch("LEFT JOIN session_rest_states rs ON rs.session_id = ws.id", [{
          session_revision: 4,
          status: "paused",
          started_at_ms: null,
          ends_at_ms: null,
          remaining_ms: 1,
          expired_at_ms: null,
          next_set_id: null,
          rest_revision: 2,
        }], 6),
      },
    ] as const;

    for (const [offset, fault] of cases.entries()) {
      await expectRejectsExactly(dispatchPreparedHostCase({
        caseId: fault.caseId,
        index: 112 + offset,
        intercept: fault.intercept,
      }), fault.error);
    }
  }, 240_000);

  it("executes custom exercise commands when owner preference snapshots are absent", async () => {
    const cases = [
      "library.exercise-favorites",
      "library.custom-exercise-hide",
      "library.custom-exercise-archive",
    ] as const;
    for (const [offset, caseId] of cases.entries()) {
      const kernel = await open();
      const contract = contractFor(caseId);
      const runtime = { customExercises: createCustomExerciseRepository(kernel) };
      const request = requestFor(contract, 120 + offset);
      await prepareV12NativeAcceptanceProductionOperation({ kernel, contract, request, runtime });
      let preferenceReads = 0;
      await expectRejectsWithExactCause(dispatchV12NativeAcceptanceProductionOperation({
        kernel: faultedReadKernel(kernel, async (sql, _parameters, read) => {
          const rows = await read();
          if (!sql.includes("SELECT favorite, revision FROM exercise_owner_preferences WHERE exercise_id = ?")) return rows;
          preferenceReads += 1;
          return preferenceReads === 1 ? [] : rows;
        }),
        contract,
        request,
        runtime,
      }), "v12_native_acceptance_handler_execution_failed", "custom_exercise_preference_revision_conflict");
    }
  }, 120_000);

  it("audits all 55 fresh mutations/replays and all 33 case-specific reads on fresh migrated SQLite", async () => {
    const sourceOwned = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ shard }) => shard !== "multi-plan");
    const mutations = sourceOwned.filter(({ operation }) => operation.kind === "repository-mutation");
    const reads = sourceOwned.filter(({ operation }) => operation.kind === "repository-read");
    expect(sourceOwned).toHaveLength(88);
    expect(mutations).toHaveLength(55);
    expect(reads).toHaveLength(33);

    const receiptIds = new Set<string>();
    const behaviorallyExecutedCaseIds = new Set<string>();
    for (const [index, contract] of sourceOwned.entries()) {
      let audit: Awaited<ReturnType<typeof executeSourceContractAudit>>;
      try {
        audit = await executeSourceContractAudit(contract, index + 128);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`v12_native_acceptance_source_contract_audit_failed:${contract.caseId}:${detail}`);
      }
      const { first, replay } = audit;
      behaviorallyExecutedCaseIds.add(contract.caseId);
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

    const productDefinitions = V12_NATIVE_ACCEPTANCE_PRODUCT_REGISTRY.filter(
      ({ interaction }) => interaction !== "domain-observation",
    );
    expect(productDefinitions).toHaveLength(88);
    const semanticCallbackGroups = new Map<string, string>();
    for (const definition of productDefinitions) {
      const owner = JSON.stringify({
        canonicalOperation: definition.canonicalOperation,
        callbackSource: definition.callbackSource,
        callbackOwnerToken: definition.callbackOwnerToken,
      });
      const existing = semanticCallbackGroups.get(definition.callbackGroup);
      expect(existing === undefined || existing === owner).toBe(true);
      semanticCallbackGroups.set(definition.callbackGroup, owner);
    }
    const behaviorallyCoveredGroups = new Set(productDefinitions
      .filter(({ caseId }) => behaviorallyExecutedCaseIds.has(caseId))
      .map(({ callbackGroup }) => callbackGroup));
    expect([...behaviorallyCoveredGroups].sort()).toEqual([...semanticCallbackGroups.keys()].sort());
  }, 180_000);

  it("retains pre-action evidence and reads a mutation receipt without dispatching again", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(
      ({ caseId }) => caseId === "workout.outcomes",
    )!;
    const request = requestFor(contract, 224);
    const hash = async (value: string) => createHash("sha256").update(value).digest("hex");
    const prepared = await prepareV12NativeAcceptanceProductCase({
      kernel,
      request,
      sha256: hash,
      prepareOperation: ({ contract: operationContract, request: operationRequest }) =>
        prepareV12NativeAcceptanceProductionOperation({
          kernel,
          contract: operationContract,
          request: operationRequest,
        }),
    });
    const productAction = await dispatchV12NativeAcceptanceProductionOperation({
      kernel,
      contract,
      request,
    });
    expect(productAction).toMatchObject({ result: "committed" });
    const readOnlyKernel = Object.freeze({
      ...kernel,
      write: async () => {
        throw new Error("read_only_receipt_write_forbidden");
      },
    }) as SqliteKernel;

    const readbacks = await readV12NativeAcceptanceReceipt({
      kernel: readOnlyKernel,
      request,
      preparedProductCase: prepared,
      sha256: hash,
    });

    expect(readbacks.source_receipt).toMatchObject({
      case_id: request.caseId,
      operation_result: "committed",
      command_outcome: "committed",
      committed_effects: 1,
      pre: prepared.pre,
    });
    expect(readbacks.source_receipt.command_receipt_id)
      .toMatch(/^\{"id":"finish-partial:/u);
  });

  it("drives WRK-19 through the normal Complete Set command and proves the failed draft is unchanged", async () => {
    const kernel = await open();
    const contract = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.find(
      ({ caseId }) => caseId === "workout.complete-failure",
    )!;
    const request = requestFor(contract, 225);
    const hash = async (value: string) => createHash("sha256").update(value).digest("hex");
    const prepared = await prepareV12NativeAcceptanceProductCase({
      kernel,
      request,
      sha256: hash,
      prepareOperation: ({ contract: operationContract, request: operationRequest }) =>
        prepareV12NativeAcceptanceProductionOperation({
          kernel,
          contract: operationContract,
          request: operationRequest,
        }),
    });
    const [session] = await kernel.queryAll<Readonly<{ id: string }>>(
      "SELECT id FROM workout_sessions WHERE status = 'in_progress' ORDER BY started_at_ms DESC LIMIT 1",
    );
    if (session === undefined) throw new Error("wrk19_session_missing");
    const repository = createWorkoutRepository(kernel);
    const view = await repository.getActiveWorkout(session.id);
    const activeSet = view.currentExercise.workingSets.find(({ id }) => id === view.activeSetId);
    if (activeSet?.observation?.profile !== "unscored") throw new Error("wrk19_draft_missing");
    expect(activeSet.observation).toMatchObject({ completed: false, source: "manual" });
    const before = await kernel.queryAll(
      `SELECT session.id, session.active_set_id, session.revision AS session_revision,
              set_row.id AS set_id, set_row.status, set_row.observed_json,
              set_row.completion_idempotency_key, set_row.revision AS set_revision,
              rest.status AS rest_status, rest.revision AS rest_revision
       FROM workout_sessions session
       JOIN session_sets set_row ON set_row.id = session.active_set_id
       LEFT JOIN session_rest_states rest ON rest.session_id = session.id
       WHERE session.id = ?`,
      [session.id],
    );

    await expect(completeSet({
      repository,
      haptics: { committed: async () => undefined, cue: async () => undefined },
      invalidate: async () => undefined,
      drainEffects: async () => undefined,
      input: {
        sessionId: session.id,
        setId: activeSet.id,
        expectedSessionRevision: view.revision,
        expectedSetRevision: activeSet.revision,
        completionIdempotencyKey: `complete_${session.id}_${activeSet.id}_${activeSet.revision}`,
        metricIdentity: activeSet.metricIdentity,
        observation: activeSet.observation,
        completedAtMs: 1_800_000_004_000,
      },
    })).rejects.toThrow("metric_observation_invalid");
    expect(await kernel.queryAll(
      `SELECT session.id, session.active_set_id, session.revision AS session_revision,
              set_row.id AS set_id, set_row.status, set_row.observed_json,
              set_row.completion_idempotency_key, set_row.revision AS set_revision,
              rest.status AS rest_status, rest.revision AS rest_revision
       FROM workout_sessions session
       JOIN session_sets set_row ON set_row.id = session.active_set_id
       LEFT JOIN session_rest_states rest ON rest.session_id = session.id
       WHERE session.id = ?`,
      [session.id],
    )).toEqual(before);

    const readOnlyKernel = Object.freeze({
      ...kernel,
      write: async () => { throw new Error("wrk19_receipt_write_forbidden"); },
    }) as SqliteKernel;
    const readbacks = await readV12NativeAcceptanceReceipt({
      kernel: readOnlyKernel,
      request,
      preparedProductCase: prepared,
      sha256: hash,
    });
    expect(readbacks.source_receipt).toMatchObject({
      case_id: "workout.complete-failure",
      operation_result: "read",
      command_receipt_id: null,
      command_outcome: null,
      committed_effects: 0,
      pre: prepared.pre,
    });
    expect(readbacks.source_receipt.post.facts_sha256).toBe(prepared.pre.facts_sha256);
  });

  it("prepares and reads all 13 Phase 13 durable domain observations without a UI dispatch", async () => {
    const kernel = await open();
    const contracts = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ shard }) => shard === "multi-plan");
    expect(contracts.map(({ caseId }) => caseId)).toEqual(MULTI_PLAN_RUNNING_CONTRACT_CASES);

    for (const [index, contract] of contracts.entries()) {
      const request = requestFor(contract, 32 + index);
      const domainObservationAdapter = {
        async runCase(caseId: (typeof MULTI_PLAN_RUNNING_CONTRACT_CASES)[number]) {
          const domainKernel = await open();
          try {
            await runMultiPlanRunningContractCase(caseId, domainKernel, {
              // The portable-merge implementation has its own focused host
              // integration suite; this bridge consumes only its pass/fail
              // authority while every other case executes here directly.
              runPortableMergeContract: async () => ({ status: "passed" as const, failed: 0 }),
            });
          } finally {
            kernels.delete(domainKernel);
            await domainKernel.close();
          }
        },
      };
      const prepared = await prepareV12NativeAcceptanceProductCase({
        kernel,
        request,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
        prepareOperation: ({ contract: operationContract, request: operationRequest }) =>
          prepareV12NativeAcceptanceProductionOperation({
            kernel,
            contract: operationContract,
            request: operationRequest,
            runtime: { domainObservationAdapter },
          }),
      });
      const readOnlyKernel = Object.freeze({
        ...kernel,
        write: async () => {
          throw new Error("domain_observation_receipt_write_forbidden");
        },
      }) as SqliteKernel;
      const readback = await readV12NativeAcceptanceReceipt({
        kernel: readOnlyKernel,
        request,
        preparedProductCase: prepared,
        sha256: async (value) => createHash("sha256").update(value).digest("hex"),
      });

      expect(prepared.pre.facts_sha256).toBe(readback.source_receipt.post.facts_sha256);
      expect(readback.source_receipt).toMatchObject({
        case_id: contract.caseId,
        operation_id: contract.operation.id,
        operation_result: "committed",
        command_outcome: "already_committed",
        committed_effects: 0,
      });
      expect(readback.source_receipt.command_receipt_id).toContain(`:${contract.caseId}:${request.nonce}`);
      expect(readback.ui_readback).toMatchObject({ case_id: contract.caseId });
    }

    const observationRows = await kernel.queryAll<Readonly<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM app_settings WHERE key LIKE 'development-test.v12.phase13-domain-observation.v1:%'",
    );
    expect(observationRows).toHaveLength(1);
    expect(observationRows[0]?.count).toBe(13);
  }, 180_000);

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
