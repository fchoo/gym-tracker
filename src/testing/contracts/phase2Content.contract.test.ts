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
  readFileSync,
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
  type SqliteKernel,
} from "../../platform/sqlite/sqliteKernel";
import {
  assertPhase2ContentContractResult,
  PHASE2_CONTENT_CASE_IDS,
  PHASE2_CONTENT_CASE_METADATA,
  runPhase2ContentContract,
  type Phase2ContentContractAdapter,
} from "./phase2Content.contract";
import {
  assertPhase2SearchContractResult,
  PHASE2_SEARCH_CASE_IDS,
  PHASE2_SEARCH_CASE_METADATA,
  runPhase2SearchContract,
  type Phase2SearchContractAdapter,
} from "./phase2Search.contract";

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

function createHostAdapter(): Phase2ContentContractAdapter
  & Phase2SearchContractAdapter {
  return {
    async createRuntime() {
      const directory = mkdtempSync(join(tmpdir(), "gym-phase2-contract-"));
      const databasePath = join(directory, "contract.db");
      const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
      const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
      await configureSqliteConnection(writer, { enableWal: true });
      await configureSqliteConnection(reader, { enableWal: false });
      const kernel = createSqliteKernel({ reader, writer });
      return {
        kernel,
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

function validResult(caseIds: readonly string[]) {
  return {
    schemaVersion: 1,
    contractVersion: 1,
    status: "passed",
    total: caseIds.length,
    passed: caseIds.length,
    failed: 0,
    skipped: 0,
    cases: caseIds.map((id) => ({
      id,
      status: "passed",
      durationMs: 0,
    })),
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(1).toISOString(),
  };
}

describe("Phase 2 shared content and search contracts", () => {
  it("exports source-owned unique case IDs and edge metadata", () => {
    const allIds = [
      ...PHASE2_CONTENT_CASE_IDS,
      ...PHASE2_SEARCH_CASE_IDS,
    ];

    expect(new Set(allIds).size).toBe(allIds.length);
    expect(PHASE2_CONTENT_CASE_METADATA.map(({ id }) => id))
      .toEqual(PHASE2_CONTENT_CASE_IDS);
    expect(PHASE2_SEARCH_CASE_METADATA.map(({ id }) => id))
      .toEqual(PHASE2_SEARCH_CASE_IDS);
    expect(PHASE2_CONTENT_CASE_METADATA.flatMap(({ edgeIds }) => edgeIds))
      .toEqual(expect.arrayContaining([
        "E-06",
        "E-13",
        "E-59",
        "E-63",
      ]));
    expect(PHASE2_SEARCH_CASE_METADATA.flatMap(({ edgeIds }) => edgeIds))
      .toEqual(expect.arrayContaining([
        "E-14",
        "E-20",
        "E-27",
      ]));
  });

  it("runs accepted content and punctuation-safe alias search on host SQLite", async () => {
    const adapter = createHostAdapter();
    const content = await runPhase2ContentContract(adapter);
    const search = await runPhase2SearchContract(adapter);

    expect(content.cases.filter(({ status }) => status === "failed"))
      .toEqual([]);
    expect(content).toMatchObject({
      status: "passed",
      total: PHASE2_CONTENT_CASE_IDS.length,
      passed: PHASE2_CONTENT_CASE_IDS.length,
      failed: 0,
      skipped: 0,
    });
    expect(content.cases.map(({ id }) => id)).toEqual(
      PHASE2_CONTENT_CASE_IDS,
    );
    expect(search.cases.filter(({ status }) => status === "failed"))
      .toEqual([]);
    expect(search).toMatchObject({
      status: "passed",
      total: PHASE2_SEARCH_CASE_IDS.length,
      passed: PHASE2_SEARCH_CASE_IDS.length,
      failed: 0,
      skipped: 0,
    });
    expect(search.cases.map(({ id }) => id)).toEqual(PHASE2_SEARCH_CASE_IDS);
    expect(() => assertPhase2ContentContractResult(content)).not.toThrow();
    expect(() => assertPhase2SearchContractResult(search)).not.toThrow();
  });

  it.each([
    {
      label: "content failure",
      assertion: assertPhase2ContentContractResult,
      caseIds: PHASE2_CONTENT_CASE_IDS,
    },
    {
      label: "search failure",
      assertion: assertPhase2SearchContractResult,
      caseIds: PHASE2_SEARCH_CASE_IDS,
    },
  ])("rejects $label, skipped, and raw-payload results", ({
    assertion,
    caseIds,
  }) => {
    const failed = {
      ...validResult(caseIds),
      status: "failed",
      passed: caseIds.length - 1,
      failed: 1,
    };
    const skipped = {
      ...validResult(caseIds),
      skipped: 1,
    };
    const rawPayload = {
      ...validResult(caseIds),
      catalog: { exercises: [] },
    };

    expect(() => assertion(failed)).toThrow();
    expect(() => assertion(skipped)).toThrow();
    expect(() => assertion(rawPayload)).toThrow();
  });

  it("registers source-derived content and search suites without weakening prior suites", () => {
    const repositoryRoot = join(__dirname, "../../..");
    const route = readFileSync(
      join(repositoryRoot, "app/__native-contracts.tsx"),
      "utf8",
    );
    const runner = readFileSync(
      join(repositoryRoot, "scripts/run-native-sqlite-contracts.mjs"),
      "utf8",
    );

    for (const suite of [
      "sqlite-kernel",
      "migrations-effects",
      "phase2-fts",
      "phase2-content",
      "phase2-search",
    ]) {
      expect(route).toContain(suite);
    }
    expect(route).toContain("PHASE2_CONTENT_CASE_IDS.length");
    expect(route).toContain("PHASE2_SEARCH_CASE_IDS.length");
    expect(runner).toContain("PHASE2_CONTENT_CASE_IDS");
    expect(runner).toContain("PHASE2_SEARCH_CASE_IDS");
    expect(runner).not.toMatch(/phase2-(?:content|search)'\\s*\\?\\s*\\d+/u);
  });

  it("keeps adapters on the private kernel instead of raw SQL payloads", () => {
    const adapter = createHostAdapter();
    expect(adapter.createRuntime).toEqual(expect.any(Function));
    expect(
      Object.keys(adapter).filter((key) => /sql|payload/iu.test(key)),
    ).toEqual([]);
    expectTypeOfKernel(createSqliteKernel);
  });
});

function expectTypeOfKernel(
  value: (
    input: Readonly<{ reader: SqliteConnection; writer: SqliteConnection }>,
  ) => SqliteKernel,
): void {
  expect(value).toEqual(expect.any(Function));
}
