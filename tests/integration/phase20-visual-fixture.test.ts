import { createHash } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, value: string) => {
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    return createHash("sha256").update(value).digest("hex");
  },
}));
jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  createProductionWorkoutAppRuntimeDependencies: () => {
    throw new Error("runtime_factory_not_used_by_sqlite_fixture_test");
  },
}));

import exerciseCatalogAsset from "../../assets/content/exercise-library.v1.json";
import exerciseCatalogManifestAsset from "../../assets/content/exercise-library.v1.manifest.json";
import exerciseCatalogAcceptanceAsset from "../../artifacts/review/phase2/exercise-library-acceptance.json";
import { parseExerciseCatalog } from "../../src/domains/content/catalog";
import { configureSqliteConnection, type SqliteConnection, type SqlitePreparedResult, type SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createContentRepository } from "../../src/platform/sqlite/repositories/contentRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import {
  bootstrapPhase20VisualFixture,
  PHASE20_VISUAL_ACTIVE_SESSION_ID,
} from "../../src/testing/phase20VisualFixtureRuntime";
import type { Phase20VisualRequest } from "../../src/testing/phase20VisualRequest";

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}

const directories = new Set<string>();
const kernels: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(kernels.splice(0).map((kernel) => kernel.close()));
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.clear();
});

async function migratedKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-phase20-visual-"));
  directories.add(directory);
  const databasePath = join(directory, "fixture.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  kernels.push(kernel);
  await createMigrationRunner({
    databaseName: databasePath,
    kernel,
    migrations,
    recoveryBackup: {
      async createAndValidate(input) {
        return { backupId: "phase20-test", databaseName: input.databaseName, fromVersion: input.fromVersion, toVersion: input.toVersion, validated: true as const };
      },
    },
  }).run();
  const bytes = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const catalog = await parseExerciseCatalog({
    catalogBytes: bytes(exerciseCatalogAsset),
    manifestBytes: bytes(exerciseCatalogManifestAsset),
    acceptanceBytes: bytes(exerciseCatalogAcceptanceAsset),
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
  });
  await createContentRepository(kernel).importAcceptedCatalog({ catalog });
  return kernel;
}

function request(state: Phase20VisualRequest["state"]): Phase20VisualRequest {
  return { nonce: "a".repeat(32), state, configuration: "AP-L-C390-P-F100", appearance: "Light", mode: "capture" };
}

describe("Phase 20 SQLite visual fixtures", () => {
  it("creates the active Workout scenario through the production session graph", async () => {
    const kernel = await migratedKernel();
    await bootstrapPhase20VisualFixture(kernel, request("BW-017"));
    await expect(kernel.queryAll<{ id: string; status: string }>(
      "SELECT id, status FROM workout_sessions WHERE id = ?",
      [PHASE20_VISUAL_ACTIVE_SESSION_ID],
    )).resolves.toEqual([{ id: PHASE20_VISUAL_ACTIVE_SESSION_ID, status: "in_progress" }]);
    await expect(kernel.queryAll<{ status: string }>(
      "SELECT status FROM session_rest_states WHERE session_id = ?",
      [PHASE20_VISUAL_ACTIVE_SESSION_ID],
    )).resolves.toEqual([{ status: "running" }]);
  });

  const activeCases: Array<[Phase20VisualRequest["state"], number, "running" | "paused" | null, number | null]> = [
    ["BW-015", 0, null, null],
    ["BW-016", 1, null, null],
    ["BW-017", 2, "running", 90_000],
    ["BW-018", 2, "paused", 90_000],
    ["BW-019", 2, "paused", 105_000],
    ["BW-020", 2, "running", 104_000],
    ["BW-021", 2, null, null],
  ];

  it.each(activeCases)("seeds the exact Active sequence for %s", async (state, completedWorking, restStatus, remainingMs) => {
    const kernel = await migratedKernel();
    await bootstrapPhase20VisualFixture(kernel, request(state));
    const [sets] = await kernel.queryAll<{ completed: number }>(
      `SELECT COUNT(*) AS completed FROM session_sets set_row
       JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id
       WHERE exercise.session_id = ? AND set_row.set_kind = 'working' AND set_row.status = 'completed'`,
      [PHASE20_VISUAL_ACTIVE_SESSION_ID],
    );
    expect(sets?.completed).toBe(completedWorking);
    const rest = await kernel.queryAll<{ status: string; remaining_ms: number | null; ends_at_ms: number | null }>(
      "SELECT status, remaining_ms, ends_at_ms FROM session_rest_states WHERE session_id = ?",
      [PHASE20_VISUAL_ACTIVE_SESSION_ID],
    );
    if (restStatus === null) expect(rest).toEqual([]);
    else {
      expect(rest[0]?.status).toBe(restStatus);
      const actualRemaining = rest[0]?.remaining_ms ?? ((rest[0]?.ends_at_ms ?? 0) - 1_790_818_860_000);
      expect(actualRemaining).toBe(remainingMs);
    }
  });

  it("creates Calendar, Library/Running, Progress, and Garmin source families in real schema tables", async () => {
    for (const [state, assertions] of [
      ["BW-022", [["owned_plan_schedule_opportunities", 1], ["running_opportunities", 2]]],
      ["BW-034", [["running_session_roots", 7], ["exercise_library_entries", 311]]],
      ["BW-061", [["workout_sessions", 1], ["imported_activities", 2]]],
      ["BW-092", [["imported_activities", 2], ["running_opportunities", 2]]],
    ] as const) {
      const kernel = await migratedKernel();
      await bootstrapPhase20VisualFixture(kernel, request(state));
      for (const [table, minimum] of assertions) {
        const [row] = await kernel.queryAll<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
        expect(row?.count).toBeGreaterThanOrEqual(minimum);
      }
      await kernel.close();
      kernels.splice(kernels.indexOf(kernel), 1);
    }
  });

  it("seeds the named Calendar dates and Progress empty, sparse, loading and six-effort contexts", async () => {
    const calendar = await migratedKernel();
    await bootstrapPhase20VisualFixture(calendar, request("BW-032"));
    await expect(calendar.queryAll<{ local_date: string }>(
      "SELECT local_date FROM owned_plan_schedule_opportunities ORDER BY local_date",
    )).resolves.toEqual([{ local_date: "2026-10-07" }, { local_date: "2026-10-12" }]);

    for (const [state, count] of [["BW-085", 0], ["BW-087", 1], ["BW-089", 0], ["BW-091", 6]] as const) {
      const kernel = await migratedKernel();
      await bootstrapPhase20VisualFixture(kernel, request(state));
      const [row] = await kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM imported_activities");
      expect(row?.count).toBe(count);
      await kernel.close();
      kernels.splice(kernels.indexOf(kernel), 1);
    }
  });
});
