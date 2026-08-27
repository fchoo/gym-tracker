import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  historyIntegrityMigration,
} from "../../src/platform/sqlite/migrations/0013_history_integrity";
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

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
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

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
    this.database.close();
  }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function open(
  databasePath: string,
  migrationsToRun = migrations,
): Promise<SqliteKernel> {
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "history-integrity",
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    }),
  };
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: migrationsToRun,
    recoveryBackup,
  }).run();
  kernels.push(kernel);
  return kernel;
}

describe("history integrity migration", () => {
  it("upgrades a v12 session without rewriting its source facts and locks audit rows", async () => {
    expect(historyIntegrityMigration).toMatchObject({
      version: 13,
      name: "history-integrity",
      kind: "additive",
    });
    expect(migrations.map(({ version }) => version)).toContain(13);

    const directory = mkdtempSync(join(tmpdir(), "gym-history-v12-"));
    directories.add(directory);
    const databasePath = join(directory, "gym-tracker.db");
    const v12 = await open(
      databasePath,
      migrations.filter(({ version }) => version < 13),
    );
    await v12.write((transaction) => transaction.execute(
      "INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, revision) VALUES (?, NULL, NULL, 'manual', 'completed', '2026-08-24', 'Asia/Singapore', ?, ?, 7)",
      ["session-1", 1_724_428_800_000, 1_724_429_160_000],
    ));
    await v12.close();
    kernels.splice(kernels.indexOf(v12), 1);

    const upgraded = await open(databasePath);
    await expect(upgraded.queryAll(
      "SELECT local_date, timezone, started_at_ms, completed_at_ms, revision, creation_timezone_offset_minutes FROM workout_sessions WHERE id = 'session-1'",
    )).resolves.toEqual([{
      local_date: "2026-08-24",
      timezone: "Asia/Singapore",
      started_at_ms: 1_724_428_800_000,
      completed_at_ms: 1_724_429_160_000,
      revision: 7,
      creation_timezone_offset_minutes: 480,
    }]);

    await upgraded.write((transaction) => transaction.execute(
      "INSERT INTO history_audit_events (id, session_id, effective_revision, event_type, field_identity, before_json, after_json, occurred_at_ms) VALUES (?, ?, 1, 'correction', 'session.note', 'null', json_quote('fixed'), 1)",
      ["audit-1", "session-1"],
    ));
    await expect(upgraded.write((transaction) => transaction.execute(
      "UPDATE history_audit_events SET after_json = json_quote('rewritten') WHERE id = 'audit-1'",
    ))).rejects.toThrow();
    await expect(upgraded.write((transaction) => transaction.execute(
      "DELETE FROM history_audit_events WHERE id = 'audit-1'",
    ))).rejects.toThrow();
  });
});
