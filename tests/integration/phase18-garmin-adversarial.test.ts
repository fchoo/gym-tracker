import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
  bindPhase18GarminAdversarialDatabaseEvidence,
  runPhase18GarminAdversarialNativeSuite,
} from "../../src/bootstrap/phase18GarminAdversarial";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createImportedActivityRepository } from "../../src/platform/sqlite/repositories/importedActivityRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import type {
  Phase18GarminAdversarialNativeCase,
} from "../../src/testing/phase18GarminAdversarial";
import { PHASE18_GARMIN_ADVERSARIAL_CASE_IDS } from "../../src/testing/phase18GarminAdversarial";

jest.mock("expo-modules-core", () => ({
  requireNativeModule: jest.fn(),
}));

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync() {
    return this.rows;
  }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }

  async finalizeAsync() {}
}

class Connection implements SqliteConnection {
  constructor(readonly db: DatabaseSync) {}
  async execAsync(sql: string) { this.db.exec(sql); }
  async prepareAsync(sql: string) { return new Statement(this.db.prepare(sql)); }
  async isInTransactionAsync() { return this.db.isTransaction; }
  async closeAsync() { this.db.close(); }
}

const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.clear();
});

async function runtime(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-phase18-adversarial-"));
  directories.add(directory);
  const path = join(directory, "gym.db");
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
    recoveryBackup: {
      async createAndValidate(request) {
        return {
          backupId: "phase18-test",
          databaseName: request.databaseName,
          fromVersion: request.fromVersion,
          toVersion: request.toVersion,
          validated: true,
        };
      },
    },
  }).run();
  return kernel;
}

const components = {
  activity: {
    activityId: 424242,
    activityTypeDTO: { typeKey: "running" },
    summaryDTO: {
      startTimeGMT: "2026-10-05T23:30:00.000Z",
      distance: 5_000,
      duration: 1_500,
      elapsedDuration: 1_560,
      movingDuration: 1_475,
    },
  },
  splits: { lapDTOs: [] },
  details: { metricDescriptors: [], activityDetailMetrics: [] },
};

function nativeCase(
  id: Phase18GarminAdversarialNativeCase["id"],
  code: string,
  syncState: string,
  callCount: number,
): Phase18GarminAdversarialNativeCase {
  return {
    id,
    status: "passed",
    provenance: "native-exact-artifact",
    stage: id.toLowerCase().replaceAll("ph18-adv-", "").replaceAll("-", "_"),
    code,
    duration_ms: 1,
    call_count: callCount,
    automatic_retry_count: 0,
    retry_after_ms: 0,
    connection_state: "connected",
    sync_state: syncState,
    session_digest: "1".repeat(64),
    generation_before: 1,
    generation_after: 1,
  };
}

const CODES = [
  "completed", "completed", "completed", "completed", "sign_in_required", "stale_generation",
  "data_access_denied", "rate_limited", "offline", "timeout", "temporary_failure",
  "malformed_response", "malformed_response", "malformed_response", "temporary_failure", "stale_generation",
] as const;
const CALLS = [1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 5, 3] as const;
const CONNECTIONS = [
  "connected", "connected", "connected", "disconnected", "sign-in-required", "disconnected",
  ...Array.from({ length: 10 }, () => "connected"),
] as const;
const SYNC_STATES = [
  "idle", "success", "success", "idle", "idle", "failure-stale-generation",
  "failure-data-access-denied", "failure-rate-limited", "failure-offline", "failure-timeout",
  "failure-temporary-failure", "failure-malformed-response", "failure-malformed-response",
  "failure-malformed-response", "partial-temporary-failure", "failure-stale-generation",
] as const;

function allNativeCases(): readonly Phase18GarminAdversarialNativeCase[] {
  return PHASE18_GARMIN_ADVERSARIAL_CASE_IDS.map((id, index) => ({
    ...nativeCase(id, CODES[index]!, SYNC_STATES[index]!, CALLS[index]!),
    connection_state: CONNECTIONS[index]!,
    retry_after_ms: index === 7 ? 900_000 : 0,
    generation_after: index === 3 || index === 5 ? 2 : 1,
  }));
}

describe("Phase 18 Garmin adversarial SQLite evidence", () => {
  it("emits the real sixteen-case report with nonce only at the envelope", async () => {
    const kernel = await runtime();
    const deviceIdentitySha256 = "f".repeat(64);
    const nativeReport = {
      schema_version: 1,
      suite: "phase18-garmin-adversarial",
      status: "passed",
      runtime_identity: {
        retainedApkSha256: "d".repeat(64),
        retainedSignatureSha256: "e".repeat(64),
        deviceIdentitySha256,
      },
      source_components: components,
      cases: allNativeCases().map((entry, index) => ({
        ...entry,
        session_digest: (index === 0 ? "1" : index < 3 ? "2" : index < 6 ? "3" : "4").repeat(64),
      })),
    };
    const report = await runPhase18GarminAdversarialNativeSuite(
      { runAdversarialSuite: async () => nativeReport } as never,
      {
        currentHead: "a".repeat(40),
        currentSourceTreeSha256: "b".repeat(64),
        currentPythonLockSha256: "c".repeat(64),
      },
      "0".repeat(32),
      deviceIdentitySha256,
      async () => ({ kernel, close: async () => undefined }),
      sha256,
    );

    expect(report.status).toBe("passed");
    expect(report.cases).toHaveLength(16);
    expect(report).not.toHaveProperty("source_components");
    expect(report.run_nonce).toBe("0".repeat(32));
    expect(JSON.stringify(report).match(/0{32}/gu)).toHaveLength(1);
    expect(JSON.stringify(report)).not.toMatch(/device_serial|"serial"/iu);
    expect(report.cases[2]!.source_write_count).toBeGreaterThan(0);
  });

  it("binds writes and pre/post digests from the production coordinator and SQLite writer", async () => {
    const kernel = await runtime();
    const rows = await bindPhase18GarminAdversarialDatabaseEvidence({
      kernel,
      sourceComponents: components,
      sha256,
      nativeCases: allNativeCases(),
    });

    expect(rows).toHaveLength(16);
    const read = rows[2]!;
    expect(read).toMatchObject({ status: "passed" });
    expect(read.source_write_count).toBeGreaterThan(0);
    expect(read.history_digest_after).not.toBe(read.history_digest_before);
    expect(read.source_digest_after).not.toBe(read.source_digest_before);
    expect(read.match_digest_after).toBe(read.match_digest_before);
    for (const [index, row] of rows.entries()) {
      if (index === 2) continue;
      expect(row).toMatchObject({ status: "passed", source_write_count: 0 });
      expect(row.history_digest_after).toBe(row.history_digest_before);
      expect(row.source_digest_after).toBe(row.source_digest_before);
      expect(row.match_digest_after).toBe(row.match_digest_before);
    }
    await expect(kernel.queryAll<{ activities: number; matches: number }>(`SELECT
      (SELECT count(*) FROM imported_activities) AS activities,
      (SELECT count(*) FROM running_activity_current_matches) AS matches`))
      .resolves.toEqual([{ activities: 2, matches: 1 }]);
  });

  it("fails when a writer reports success without a SQLite commit", async () => {
    const kernel = await runtime();
    await expect(bindPhase18GarminAdversarialDatabaseEvidence({
      kernel,
      sourceComponents: components,
      sha256,
      nativeCases: [nativeCase("PH18-ADV-READ", "completed", "success", 4)],
      repositoryFactory: () => ({
        confirmGarminImport: async () => ({
          kind: "imported" as const,
          activityId: "not-written",
          aggregateRevision: 1,
        }),
      }) as never,
    })).rejects.toThrow("phase18_garmin_generation_fence_invalid");
  });

  it("fails when a writer bypasses the generation fence and mutates SQLite", async () => {
    const kernel = await runtime();
    await expect(bindPhase18GarminAdversarialDatabaseEvidence({
      kernel,
      sourceComponents: components,
      sha256,
      nativeCases: [nativeCase("PH18-ADV-READ", "completed", "success", 4)],
      repositoryFactory: (candidateKernel) => {
        const actual = createImportedActivityRepository(candidateKernel);
        return {
          confirmGarminImport: (input: Parameters<typeof actual.confirmGarminImport>[0]) => {
            const { assertCurrentGeneration: _ignored, ...withoutFence } = input;
            return actual.confirmGarminImport(withoutFence);
          },
        } as never;
      },
    })).rejects.toThrow("phase18_garmin_generation_fence_invalid");
  });
});
