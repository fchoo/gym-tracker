import {
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  createHash,
} from "node:crypto";
import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../platform/sqlite/connection";
import {
  createSqliteKernel,
} from "../../platform/sqlite/sqliteKernel";
import {
  PHASE2_CONTENT_CASE_IDS,
  PHASE2_CONTENT_CASE_METADATA,
} from "./phase2Content.contract";
import {
  PHASE2_METRICS_CASE_IDS,
  PHASE2_METRICS_CASE_METADATA,
  runPhase2MetricsContract,
  type Phase2MetricsContractAdapter,
} from "./phase2Metrics.contract";
import {
  PHASE2_PLAN_CASE_IDS,
  PHASE2_PLAN_CASE_METADATA,
  runPhase2PlanContract,
  type Phase2PlanContractAdapter,
} from "./phase2Plan.contract";
import {
  PHASE2_SCHEDULE_CASE_IDS,
  PHASE2_SCHEDULE_CASE_METADATA,
  runPhase2ScheduleContract,
  type Phase2ScheduleContractAdapter,
} from "./phase2Schedule.contract";
import {
  PHASE2_SEARCH_CASE_IDS,
  PHASE2_SEARCH_CASE_METADATA,
} from "./phase2Search.contract";
import {
  PHASE2_STARTER_CASE_IDS,
  PHASE2_STARTER_CASE_METADATA,
  runPhase2StarterContract,
  type Phase2StarterContractAdapter,
} from "./phase2Starter.contract";

class NodePreparedResult<Row extends Record<string, unknown>>
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

class NodePreparedStatement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new NodePreparedResult(
        0,
        0,
        this.statement.all(...parameters) as Row[],
      );
    }
    const result = this.statement.run(...parameters);
    return new NodePreparedResult(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new NodePreparedStatement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

type RemainingAdapter =
  & Phase2MetricsContractAdapter
  & Phase2StarterContractAdapter
  & Phase2PlanContractAdapter
  & Phase2ScheduleContractAdapter;

function createHostAdapter(): RemainingAdapter {
  return {
    async createRuntime() {
      const directory = mkdtempSync(join(tmpdir(), "gym-phase2-shared-"));
      const databasePath = join(directory, "contract.db");
      const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
      const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
      await configureSqliteConnection(writer, { enableWal: true });
      await configureSqliteConnection(reader, { enableWal: false });
      const kernel = createSqliteKernel({ reader, writer });
      const preferences = new Map<string, string>();
      return {
        kernel,
        preferenceStorage: {
          getItemSync: (key) => preferences.get(key) ?? null,
          setItemSync: (key, value) => {
            preferences.set(key, value);
          },
          removeItemSync: (key) => preferences.delete(key),
        },
        async close() {
          await kernel.close();
          rmSync(directory, { force: true, recursive: true });
        },
      };
    },
    async sha256(value) {
      return createHash("sha256").update(value).digest("hex");
    },
  };
}

describe("Phase 2 remaining shared native contracts", () => {
  it("exports globally unique source-owned case IDs", () => {
    const caseIds = [
      ...PHASE2_CONTENT_CASE_IDS,
      ...PHASE2_SEARCH_CASE_IDS,
      ...PHASE2_METRICS_CASE_IDS,
      ...PHASE2_STARTER_CASE_IDS,
      ...PHASE2_PLAN_CASE_IDS,
      ...PHASE2_SCHEDULE_CASE_IDS,
    ];

    expect(new Set(caseIds).size).toBe(caseIds.length);
  });

  it("maps every E-01 through E-78 edge with requirement, category, and source test", () => {
    const metadata = [
      ...PHASE2_CONTENT_CASE_METADATA,
      ...PHASE2_SEARCH_CASE_METADATA,
      ...PHASE2_METRICS_CASE_METADATA,
      ...PHASE2_STARTER_CASE_METADATA,
      ...PHASE2_PLAN_CASE_METADATA,
      ...PHASE2_SCHEDULE_CASE_METADATA,
    ];
    const mapped = new Set(metadata.flatMap(({ edgeIds }) => edgeIds));

    expect([...mapped].sort()).toEqual(
      Array.from({ length: 78 }, (_, index) =>
        `E-${String(index + 1).padStart(2, "0")}`
      ),
    );
    for (const entry of metadata) {
      const requirementIds = "applicableRequirementIds" in entry
        ? entry.applicableRequirementIds
        : [entry.requirement];
      for (const requirementId of requirementIds) {
        expect(requirementId).toMatch(/^LIB-(?:0[2-9]|1[0-2])$/u);
      }
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry.sourceTest).toMatch(/\.test\.tsx?#/u);
    }
  });

  it("runs metrics, six starters, owned/custom plans, and schedules on host SQLite", async () => {
    const adapter = createHostAdapter();
    const results = await Promise.all([
      runPhase2MetricsContract(adapter),
      runPhase2StarterContract(adapter),
      runPhase2PlanContract(adapter),
      runPhase2ScheduleContract(adapter),
    ]);

    for (const result of results) {
      expect(result.cases.filter(({ status }) => status === "failed"))
        .toEqual([]);
      expect(result).toMatchObject({
        status: "passed",
        passed: result.total,
        failed: 0,
        skipped: 0,
      });
    }
  });

  it("reports every plan case boundary to the optional native observer", async () => {
    const observedCaseIds: string[] = [];
    const result = await runPhase2PlanContract({
      ...createHostAdapter(),
      onCaseStart: (caseId) => observedCaseIds.push(caseId),
    });

    expect(result.status).toBe("passed");
    expect(observedCaseIds).toEqual(PHASE2_PLAN_CASE_IDS);
  });

  it("preserves the Phase 2 migration prefix while allowing additive later migrations", () => {
    const manifest = require("../../platform/sqlite/migrations") as {
      migrations: readonly Readonly<{ version: number }>[];
    };
    const versions = manifest.migrations.map(({ version }) => version);
    expect(versions.slice(0, 11)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      8,
      9,
      10,
      11,
      12,
    ]);
    expect(versions.at(-1)).toBeGreaterThanOrEqual(12);
  });
});
