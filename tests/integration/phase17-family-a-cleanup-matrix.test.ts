import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: "com.fchoo.gymtracker.devtest" },
      extra: {
        buildProfile: "development-test",
        nativeContractsEnabled: true,
        nativeContractSuite: "phase17",
      },
    },
  },
}));
jest.mock("expo-crypto", () => {
  let sequence = 0;
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA256" },
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) =>
      require("node:crypto").createHash("sha256").update(value).digest("hex")),
    randomUUID: jest.fn(() => `phase17-runtime-${++sequence}`),
  };
});

import type { SqliteConnection, SqlitePreparedResult, SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createLogicalBackupRepository } from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import { createOwnedPlanRuntimePort } from "../../src/bootstrap/ownedPlanRuntime";
import { createPhase17ActionEnvelopeSource, phase17ActionEnvelopePlan, type Phase17ActionEnvelopeContext } from "../../src/bootstrap/phase17ActionEnvelope";
import { cleanupPhase17FamilyAManifest, createPhase17FamilyACleanupManifest, materializePhase17FamilyACleanupManifest } from "../../src/bootstrap/phase17FamilyACleanup";
import { createPhase17FixtureProtocol } from "../../src/bootstrap/phase17NativeFixture";
import { createCustomExerciseRepository } from "../../src/platform/sqlite/repositories/customExerciseRepository";
import { createCustomExercise, setExerciseFavorite } from "../../src/domains/library/customExerciseCommands";
import { PHASE17_CASE_ACTION_CONTRACTS } from "../../src/testing/contracts/phase17LibraryRunning.contract";

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
const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) rmSync(directory, { force: true, recursive: true });
  directories.clear();
});

async function migratedKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-phase17-family-a-"));
  directories.add(directory);
  const path = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(path);
  fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8"));
  fixture.close();
  const writer = new Connection(new DatabaseSync(path));
  const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: path,
    kernel,
    migrations,
    recoveryBackup: { async createAndValidate(request) {
      return { backupId: "phase17-matrix", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const };
    } },
  }).run();
  return kernel;
}

async function logicalDigest(kernel: SqliteKernel): Promise<Readonly<{ digest: string; snapshot: unknown }>> {
  const snapshot = await createLogicalBackupRepository(kernel).collect({ snapshotId: "phase17-family-a", createdAtMs: 1 });
  expect(snapshot.version).toBe(8);
  return Object.freeze({ digest: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), snapshot });
}

describe("Phase 17 Family A cleanup matrix", () => {
  it("runs a migrated schema-42 runtime-host Family A mutation through setup, labelled action, authoritative probe, cleanup, and v8 logical-backup restoration", async () => {
    const kernel = await migratedKernel();
    let sequence = 0;
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const ownedPlans = createOwnedPlanRuntimePort(kernel, {
      nowMs: () => 1_794_225_600_000,
      randomUUID: () => `phase17-host-${++sequence}`,
      sha256,
    });
    const customExercises = createCustomExerciseRepository(kernel);
    const envelope = createPhase17ActionEnvelopeSource({
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
      identity: () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }),
      store: {
        read: async () => {
          const [row] = await kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", ["development-test.phase17.action-envelope.v1"]);
          return row === undefined ? null : JSON.parse(row.value_json) as Phase17ActionEnvelopeContext;
        },
        write: async (value) => {
          await kernel.write((transaction) => transaction.execute(
            `INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms)
             VALUES (?, 1, ?, 1, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
               revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms`,
            ["development-test.phase17.action-envelope.v1", JSON.stringify(value), 1_794_225_600_000],
          ));
        },
        clear: async (value) => {
          const result = await kernel.write((transaction) => transaction.execute(
            "DELETE FROM app_settings WHERE key = ? AND value_json = ?",
            ["development-test.phase17.action-envelope.v1", JSON.stringify(value)],
          ));
          if (result.changes !== 1) throw new Error("phase17_matrix_envelope_clear_failed");
        },
      },
    });
    const protocol = createPhase17FixtureProtocol({
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
      createToken: () => `phase17:matrix-token-${String(++sequence).padStart(16, "0")}`,
      adapter: {
        baselineDigest: async () => (await logicalDigest(kernel)).digest,
        canonicalHash: async (value) => sha256(JSON.stringify(value)),
        selectorSchema: () => ({ selectors: ["ownedPlanId", "customExerciseId"], actionInputs: ["phase17ActionReceiptId"] }),
        seed: async ({ caseId, fixtureToken }) => {
          const planId = `phase17:owned-plan:${fixtureToken.slice("phase17:".length)}`;
          const exerciseId = `phase17:custom:${fixtureToken.slice("phase17:".length)}`;
          const plan = await ownedPlans.createFixtureDraft({ requestId: `phase17:fixture:owned-plan-create:${fixtureToken.slice("phase17:".length)}:setup`, planId, dayId: `phase17:owned-plan-day:${fixtureToken.slice("phase17:".length)}`, name: `Matrix ${caseId}`, dayName: "Fixture" });
          if (plan.outcome === "requires_schedule_impact") throw new Error("phase17_matrix_setup_failed");
          await createCustomExercise({ repository: customExercises, invalidate: async () => undefined, input: {
            requestId: `phase17:fixture:custom-exercise-create:${fixtureToken.slice("phase17:".length)}:setup`, exerciseId, name: `Matrix ${caseId}`, aliases: ["Matrix"], exerciseType: "strength", movementClass: "compound", primaryMuscles: ["quadriceps"], secondaryMuscles: [], equipment: ["barbell"], metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, defaultRestSeconds: 60, createdAtMs: 1_794_225_600_000,
          } });
          const facts = { caseId, fixtureToken, planId, exerciseId, action: "exercise-favorite" };
          return { selectors: { ownedPlanId: planId, customExerciseId: exerciseId }, actionInputs: { phase17ActionReceiptId: `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action` }, expectedPreState: { ...facts, receipt: "absent" }, expectedPostState: { ...facts, receipt: "present" }, actionReceiptId: `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action` };
        },
        probe: async ({ caseId, fixtureToken, selectors }) => {
          const requestId = `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
          const receipts = await kernel.queryAll<{ request_id: string }>("SELECT request_id FROM custom_exercise_mutation_receipts WHERE request_id = ?", [requestId]);
          const preferences = await kernel.queryAll<{ exercise_id: string }>("SELECT exercise_id FROM exercise_owner_preferences WHERE exercise_id = ? AND favorite = 1", [selectors.customExerciseId!]);
          if (receipts.length !== 1 || preferences.length !== 1) throw new Error("phase17_matrix_probe_failed");
          const facts = { caseId, fixtureToken, planId: selectors.ownedPlanId!, exerciseId: selectors.customExerciseId!, action: "exercise-favorite", receipt: "present" };
          return { rowCount: 1, identityHash: await sha256(JSON.stringify(facts)), facts };
        },
        cleanup: async ({ caseId, fixtureToken, selectors }) => cleanupPhase17FamilyAManifest(kernel, createPhase17FamilyACleanupManifest(caseId, fixtureToken, { ownedPlanId: selectors.ownedPlanId!, customExerciseId: selectors.customExerciseId! })),
        finalizeCleanup: async ({ caseId, fixtureToken }) => envelope.clear({ caseId, fixtureToken }),
      },
    });
    const before = await logicalDigest(kernel);
    const fixture = await protocol.setup("library.exercise-favorites");
    await envelope.activate({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, envelopes: phase17ActionEnvelopePlan(fixture.caseId, fixture.fixtureToken), cleanupManifest: createPhase17FamilyACleanupManifest(fixture.caseId, fixture.fixtureToken, { ownedPlanId: fixture.selectors.ownedPlanId!, customExerciseId: fixture.selectors.customExerciseId! }) });
    const requestId = await envelope.claim({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, label: "exercise-favorite" });
    if (requestId === null) throw new Error("phase17_matrix_action_request_missing");
    const [preference] = await kernel.queryAll<{ revision: number }>("SELECT revision FROM exercise_owner_preferences WHERE exercise_id = ?", [fixture.selectors.customExerciseId!]);
    await setExerciseFavorite({ repository: customExercises, invalidate: async () => undefined, input: { requestId, exerciseId: fixture.selectors.customExerciseId!, expectedPreferenceRevision: preference?.revision ?? null, favorite: true, updatedAtMs: 1_794_225_600_000 } });
    await expect(protocol.probe({
      caseId: fixture.caseId,
      fixtureToken: fixture.fixtureToken,
      sourceTable: fixture.sourceTable,
    })).resolves.toMatchObject({ verdict: "matched", expectedPostStateHash: fixture.expectedPostStateHash });
    await envelope.assertConsumed({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken });
    await envelope.updateCleanupManifest({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, cleanupManifest: await materializePhase17FamilyACleanupManifest(kernel, createPhase17FamilyACleanupManifest(fixture.caseId, fixture.fixtureToken, { ownedPlanId: fixture.selectors.ownedPlanId!, customExerciseId: fixture.selectors.customExerciseId! })) });
    let cleanup: Awaited<ReturnType<typeof protocol.cleanup>>;
    try {
      cleanup = await protocol.cleanup({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken });
    } catch (error) {
      throw new Error(`phase17_matrix_cleanup_failed:${String(error)}:${String((error as Error & { cause?: unknown }).cause)}`);
    }
    expect(cleanup).toMatchObject({ verdict: "restored", baselineDigest: fixture.baselineDigest });
    const after = await logicalDigest(kernel);
    expect(after.digest).toBe(before.digest);
    expect(after.snapshot).toEqual(before.snapshot);
  });
});
