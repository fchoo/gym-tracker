import { afterEach, describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type {
  SqliteConnection,
  SqlitePreparedResult,
  SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";
import {
  runV12NativeAcceptanceCompletionWriteback,
} from "../../src/testing/v12NativeAcceptanceCompletionWriteback";

class Result<Row extends Record<string, unknown>>
implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync(): Promise<readonly Row[]> {
    return this.rows;
  }
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
    return new Result(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  private closed = false;

  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }
}

const kernels = new Set<SqliteKernel>();
const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
});

async function migratedKernel(): Promise<SqliteKernel> {
  const connection = new Connection(new DatabaseSync(":memory:"));
  await configureSqliteConnection(connection, { enableWal: false });
  const kernel = createSqliteKernel({ reader: connection, writer: connection });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "v12-completion-writeback-host",
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

describe("v1.2 completion write-back production acceptance helper", () => {
  it("commits one nonce-bound source mutation then replays the identical durable receipt", async () => {
    const kernel = await migratedKernel();
    const proof = await runV12NativeAcceptanceCompletionWriteback({
      kernel,
      nonce: "c".repeat(48),
      sha256,
    });

    expect(proof).toMatchObject({
      schema_version: 1,
      case_id: "workout.completion-writeback",
      first: {
        outcome: "committed",
        authoritative_source: {
          table: "owned_plan_day_exercises",
        },
      },
      replay: {
        outcome: "already_committed",
        committed_effects: 0,
        authoritative_source: {
          table: "owned_plan_day_exercises",
        },
      },
    });
    expect(proof.first.committed_effects).toBeGreaterThanOrEqual(1);
    expect(proof.request.request_id).toBe(proof.receipt.receipt_id);
    expect(proof.first.durable_receipt_sha256)
      .toBe(proof.replay.durable_receipt_sha256);
    expect(proof.first.authoritative_source)
      .toEqual(proof.replay.authoritative_source);
    expect(proof.first.authoritative_source.plan_revision)
      .toBe(proof.seed_plan_revision + 1);

    await expect(kernel.queryAll(
      `SELECT request_id, request_sha256, result_revision
       FROM owned_plan_mutation_requests
       WHERE request_id = ?`,
      [proof.request.request_id],
    )).resolves.toEqual([{
      request_id: proof.request.request_id,
      request_sha256: proof.request.request_sha256,
      result_revision: proof.first.authoritative_source.plan_revision,
    }]);

    const serialized = JSON.stringify(proof);
    expect(serialized).not.toMatch(
      /(?:bodyweight|device|filename|heart|payload|private|route|sql)/iu,
    );
  });

  it("keeps action authority in the production runtime without generic proof scans", () => {
    const source = readFileSync(
      require.resolve(
        "../../src/testing/v12NativeAcceptanceCompletionWriteback",
      ),
      "utf8",
    );

    expect(source).toContain("createOwnedPlanRuntimePort");
    expect(source).toContain("applySessionExerciseEdits");
    expect(source).not.toMatch(/COUNT\s*\(/iu);
    expect(source).not.toContain("app_settings");
    expect(source).not.toContain("INSERT INTO owned_plan_mutation_requests");
    expect(source).not.toMatch(/console\.(?:debug|error|info|log|warn)/u);
  });
});
