import { afterEach, describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../platform/sqlite/connection";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { migrations } from "../platform/sqlite/migrations";
import { createSqliteKernel, type SqliteKernel } from "../platform/sqlite/sqliteKernel";
import {
  V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS,
  type V12NativeAcceptanceCaseContract,
} from "./contracts/phase15Workout.contract";
import {
  V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY,
  assertV12NativeAcceptanceAuthorityReaderRegistry,
} from "./v12NativeAcceptanceAuthorityReaders";

const sourceOwned = V12_NATIVE_ACCEPTANCE_CASE_CONTRACTS.filter(({ shard }) => shard !== "multi-plan");
const kernels = new Set<SqliteKernel>();

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

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
});

async function openMigratedKernel(): Promise<SqliteKernel> {
  const connection = new Connection(new DatabaseSync(":memory:"));
  await configureSqliteConnection(connection, { enableWal: false });
  const kernel = createSqliteKernel({ reader: connection, writer: connection });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "v12-authority-readers-host",
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

const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

describe("v1.2 native acceptance case-specific authority readers", () => {
  it("registers one independently callable reader for all 33 reads and all 55 mutation postconditions", () => {
    expect(sourceOwned.filter(({ operation }) => operation.kind === "repository-read")).toHaveLength(33);
    expect(sourceOwned.filter(({ operation }) => operation.kind === "repository-mutation")).toHaveLength(55);
    expect(Object.keys(V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY)).toHaveLength(88);
    expect(assertV12NativeAcceptanceAuthorityReaderRegistry()).toBe(true);

    const functions = new Set<unknown>();
    for (const contract of sourceOwned) {
      const reader = V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY[contract.operation.id];
      expect(reader).toMatchObject({
        operationId: contract.operation.id,
        caseId: contract.caseId,
        operationKind: contract.operation.kind,
        authorityTables: contract.probes.post.tables,
      });
      expect(typeof reader?.read).toBe("function");
      expect(functions.has(reader?.read)).toBe(false);
      functions.add(reader?.read);
      if (contract.operation.kind === "repository-mutation") {
        expect(reader?.queries.every(({ sql }) => !/\bLIKE\s+\?/iu.test(sql))).toBe(true);
      }
    }
  });

  it("fails closed for missing readers, reordered declarations, generic SQL, and zero-row mutation success", () => {
    const [first, second] = sourceOwned;
    const withoutFirst = Object.fromEntries(Object.entries(V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY)
      .filter(([operationId]) => operationId !== first!.operation.id));
    expect(() => assertV12NativeAcceptanceAuthorityReaderRegistry(sourceOwned, withoutFirst))
      .toThrow("v12_native_acceptance_authority_reader_count_invalid");

    const reordered = [
      second!,
      first!,
      ...sourceOwned.slice(2),
    ];
    expect(() => assertV12NativeAcceptanceAuthorityReaderRegistry(reordered))
      .toThrow("v12_native_acceptance_authority_reader_order_invalid");

    const generic = {
      ...V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY,
      [first!.operation.id]: {
        ...V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY[first!.operation.id]!,
        queries: [{ sql: "SELECT COUNT(*) AS count FROM plans", parameterKeys: [] }],
      },
    };
    expect(() => assertV12NativeAcceptanceAuthorityReaderRegistry(sourceOwned, generic))
      .toThrow("v12_native_acceptance_authority_reader_query_invalid");

    const mutation = sourceOwned.find(({ operation }) => operation.kind === "repository-mutation")!;
    const original = V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY[mutation.operation.id]!;
    const permissive = {
      ...V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY,
      [mutation.operation.id]: { ...original, allowZeroRows: true },
    };
    expect(() => assertV12NativeAcceptanceAuthorityReaderRegistry(
      sourceOwned,
      permissive as unknown as typeof V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY,
    ))
      .toThrow("v12_native_acceptance_authority_reader_zero_row_invalid");
  });

  it("rejects a contract whose authority projection order drifts", () => {
    const contract = sourceOwned.find(({ probes }) => probes.post.tables.length > 1)!;
    const replacement: V12NativeAcceptanceCaseContract = {
      ...contract,
      probes: {
        ...contract.probes,
        post: { ...contract.probes.post, tables: [...contract.probes.post.tables].reverse() },
      },
    };
    const drifted = sourceOwned.map((entry) => entry === contract ? replacement : entry);
    expect(() => assertV12NativeAcceptanceAuthorityReaderRegistry(drifted))
      .toThrow("v12_native_acceptance_authority_reader_projection_invalid");
  });

  it("prepares every exact projection against the real migrated SQLite host and rejects empty mutation proofs", async () => {
    const kernel = await openMigratedKernel();
    for (const [index, contract] of sourceOwned.entries()) {
      const reader = V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY[contract.operation.id]!;
      const nonce = index.toString(16).padStart(2, "0") + "a".repeat(46);
      let failure: unknown;
      try {
        await reader.read({
          query: kernel,
          request: { caseId: contract.caseId, fixtureId: "v12-synthetic-fixtures-r18", nonce },
          sha256,
        });
      } catch (error) {
        failure = error;
      }
      if (contract.operation.kind === "repository-mutation") {
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toBe("v12_native_acceptance_authority_reader_postcondition_missing");
      } else if (failure !== undefined) {
        expect(`${contract.caseId}:${(failure as Error).message}:${String((failure as Error & { cause?: unknown }).cause ?? "")}`)
          .toBe(`${contract.caseId}:v12_native_acceptance_authority_reader_postcondition_missing:`);
      }
    }
  });

  it("returns only a bounded digest proof from a positive production-schema projection", async () => {
    const kernel = await openMigratedKernel();
    await kernel.write((transaction) => transaction.execute(
      `INSERT INTO app_settings
        (key, value_version, value_json, revision, updated_at_ms)
       VALUES ('library.section', 1, '{"section":"exercises"}', 1, 1)`,
    ));
    const contract = sourceOwned.find(({ caseId }) => caseId === "library.remembered-state")!;
    const proof = await V12_NATIVE_ACCEPTANCE_AUTHORITY_READER_REGISTRY[contract.operation.id]!.read({
      query: kernel,
      request: {
        caseId: contract.caseId,
        fixtureId: "v12-synthetic-fixtures-r18",
        nonce: "f".repeat(48),
      },
      sha256,
    });

    expect(proof).toEqual({
      schemaVersion: 1,
      operationId: contract.operation.id,
      caseId: contract.caseId,
      operationKind: "repository-read",
      authorityTables: ["app_settings"],
      projectionRowCount: 1,
      projectionSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      receiptId: null,
    });
    expect(JSON.stringify(proof)).not.toContain("exercises");
  });
});
