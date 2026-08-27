import {
  normalizeSearchText,
  SEARCH_PAGE_SIZE,
} from "../../domains/library/search";
import {
  createMigrationRunner,
} from "../../platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../platform/sqlite/migrations";
import {
  createContentRepository,
} from "../../platform/sqlite/repositories/contentRepository";
import {
  createExerciseSearchIndexRepository,
  openExerciseSearchFtsContractRuntime,
} from "../../platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createLibrarySearchRepository,
} from "../../platform/sqlite/repositories/librarySearchRepository";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../../platform/sqlite/sqliteKernel";
import {
  parseAcceptedPhase2Catalog,
  type Phase2ContractCaseMetadata,
} from "./phase2Content.contract";

export const PHASE2_SEARCH_CONTRACT_VERSION = 1 as const;

export const PHASE2_SEARCH_CASE_IDS = [
  "search-accepted-punctuation-alias",
  "search-fts-trigram-short-query",
  "search-rank-and-page",
  "search-parity-integrity",
  "search-idempotent-rebuild",
  "search-source-rollback",
] as const;

export type Phase2SearchContractCaseId =
  (typeof PHASE2_SEARCH_CASE_IDS)[number];

export const PHASE2_SEARCH_CASE_METADATA = [
  {
    id: "search-accepted-punctuation-alias",
    requirement: "LIB-03",
    category: "normalization-alias",
    edgeIds: ["E-14", "E-15", "E-16", "E-17", "E-18", "E-19"],
    sourceTest: "tests/integration/exercise-search.test.ts#returns an alias-caused tracer with canonical row and D-15 attribution",
  },
  {
    id: "search-fts-trigram-short-query",
    requirement: "LIB-04",
    category: "fts-bounds",
    edgeIds: ["E-20", "E-21", "E-22"],
    sourceTest: "tests/sqlite-host/exercise-search-fts.test.ts#covers E-20 through E-27 bounds and derivative repair cases",
  },
  {
    id: "search-rank-and-page",
    requirement: "LIB-03",
    category: "rank-pagination",
    edgeIds: ["E-23", "E-24"],
    sourceTest: "tests/integration/exercise-search.test.ts#returns stable nonduplicated thirty-row keyset pages",
  },
  {
    id: "search-parity-integrity",
    requirement: "LIB-04",
    category: "fts-parity",
    edgeIds: ["E-25"],
    sourceTest: "tests/integration/exercise-search.test.ts#restores FTS parity without changing authoritative relational results",
  },
  {
    id: "search-idempotent-rebuild",
    requirement: "LIB-04",
    category: "fts-rebuild",
    edgeIds: ["E-26"],
    sourceTest: "tests/sqlite-host/exercise-search-fts.test.ts#covers E-20 through E-27 bounds and derivative repair cases",
  },
  {
    id: "search-source-rollback",
    requirement: "LIB-04",
    category: "transaction-integrity",
    edgeIds: ["E-27"],
    sourceTest: "tests/integration/exercise-search.test.ts#rolls failed source writes back and fails page hydration with a safe code",
  },
] as const satisfies readonly Phase2ContractCaseMetadata<
  Phase2SearchContractCaseId
>[];

export type Phase2SearchContractRuntime = Readonly<{
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

export interface Phase2SearchContractAdapter {
  createRuntime(
    caseId: Phase2SearchContractCaseId,
  ): Promise<Phase2SearchContractRuntime>;
  sha256(value: string): Promise<string>;
}

export type Phase2SearchContractCaseResult = Readonly<{
  id: Phase2SearchContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type Phase2SearchContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PHASE2_SEARCH_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Phase2SearchContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type ContractCase = (
  runtime: Phase2SearchContractRuntime,
  adapter: Phase2SearchContractAdapter,
) => Promise<void>;

type SearchSeed = Readonly<{
  id: string;
  name: string;
  aliases?: readonly string[];
  favorite?: boolean;
}>;

const RESULT_KEYS = [
  "cases",
  "contractVersion",
  "failed",
  "finishedAt",
  "passed",
  "schemaVersion",
  "skipped",
  "startedAt",
  "status",
  "total",
] as const;

const CASE_RESULT_KEYS = [
  "durationMs",
  "errorCode",
  "id",
  "status",
] as const;

function invariant(value: unknown, code: string): asserts value {
  if (!value) {
    throw new Error(code);
  }
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "phase2_search_contract_failed";
}

function sameKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const allowed = expected.filter((key) =>
    key !== "errorCode" || "errorCode" in value
  ).sort();
  return actual.length === allowed.length
    && actual.every((key, index) => key === allowed[index]);
}

async function migrateSearch(kernel: SqliteKernel): Promise<void> {
  await createMigrationRunner({
    databaseName: "phase2-search",
    kernel,
    migrations: migrations.filter((migration) => migration.version <= 5),
  }).run();
}

async function insertSearchSeedInTransaction(
  transaction: SqliteTransactionExecutor,
  seed: SearchSeed,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO exercise_library_entries
      (exercise_id, origin, canonical_name, exercise_type, movement_class,
       metric_profile, metric_contract_version, exercise_metric_generation,
       availability, revision)
     VALUES (?, 'custom', ?, 'strength', 'compound', 'load_reps', 1, 1,
             'available', 1)`,
    [seed.id, seed.name],
  );
  await transaction.execute(
    `INSERT INTO exercise_search_terms
      (exercise_id, kind, ordinal, display_text, normalized_text)
     VALUES (?, 'canonical', 0, ?, ?)`,
    [seed.id, seed.name, normalizeSearchText(seed.name).text],
  );
  for (const [ordinal, alias] of (seed.aliases ?? []).entries()) {
    await transaction.execute(
      `INSERT INTO exercise_aliases
        (exercise_id, ordinal, display_text, normalized_text)
       VALUES (?, ?, ?, ?)`,
      [seed.id, ordinal, alias, normalizeSearchText(alias).text],
    );
    await transaction.execute(
      `INSERT INTO exercise_search_terms
        (exercise_id, kind, ordinal, display_text, normalized_text)
       VALUES (?, 'alias', ?, ?, ?)`,
      [seed.id, ordinal, alias, normalizeSearchText(alias).text],
    );
  }
  if (seed.favorite) {
    await transaction.execute(
      `INSERT INTO exercise_owner_preferences
        (exercise_id, favorite, hidden, archived, revision, updated_at_ms)
       VALUES (?, 1, 0, 0, 1, 1)`,
      [seed.id],
    );
  }
}

async function insertSearchSeed(
  kernel: SqliteKernel,
  seed: SearchSeed,
): Promise<void> {
  await kernel.write((transaction) =>
    insertSearchSeedInTransaction(transaction, seed)
  );
}

function requirePage(
  result: Awaited<
    ReturnType<ReturnType<typeof createLibrarySearchRepository>["searchExercises"]>
  >,
) {
  invariant(result.state === "page", "phase2_search_page_missing");
  return result;
}

async function removeIndexedTerm(
  kernel: SqliteKernel,
  input: Readonly<{ id: number; normalizedText: string }>,
): Promise<void> {
  await kernel.write((transaction) =>
    transaction.execute(
      `INSERT INTO exercise_search_terms_fts(
        exercise_search_terms_fts, rowid, normalized_text
      ) VALUES ('delete', ?, ?)`,
      [input.id, input.normalizedText],
    )
  );
}

const contractCases: Record<Phase2SearchContractCaseId, ContractCase> = {
  async "search-accepted-punctuation-alias"({ kernel }, adapter) {
    await migrateSearch(kernel);
    const catalog = await parseAcceptedPhase2Catalog(adapter.sha256);
    await createContentRepository(kernel).importAcceptedCatalog({
      catalog,
      expectedInstalled: null,
    });
    await insertSearchSeed(kernel, {
      id: "phase2-search-punctuation-alias",
      name: "Horizontal Barbell Press",
      aliases: ["Café / Bench (Press): OR"],
    });
    const sourceCount = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM exercise_catalog_sources",
    );
    const page = requirePage(
      await createLibrarySearchRepository(kernel).searchExercises({
        query: "café / bench (press): OR",
      }),
    );
    invariant(
      sourceCount[0]?.count === 310
      && page.items.length === 1
      && page.items[0]?.exerciseId === "phase2-search-punctuation-alias"
      && page.items[0].canonicalName === "Horizontal Barbell Press"
      && page.items[0].matchedAlias?.label
        === "Matched alias: Café / Bench (Press): OR"
      && page.diagnostic.strategy === "trigram"
      && !("query" in page.diagnostic),
      "phase2_search_alias_tracer_invalid",
    );
  },

  async "search-fts-trigram-short-query"({ kernel }) {
    await migrateSearch(kernel);
    const [capability] = await kernel.queryAll<{ fts5_enabled: number }>(
      "SELECT sqlite_compileoption_used('ENABLE_FTS5') AS fts5_enabled",
    );
    await insertSearchSeed(kernel, {
      id: "phase2-search-short",
      name: "ABC Café Press",
    });
    const repository = createLibrarySearchRepository(kernel);
    const one = requirePage(await repository.searchExercises({ query: "a" }));
    const two = requirePage(await repository.searchExercises({ query: "ab" }));
    const three = requirePage(await repository.searchExercises({ query: "abc" }));
    invariant(
      capability?.fts5_enabled === 1
      && one.diagnostic.strategy === "relational"
      && two.diagnostic.strategy === "relational"
      && three.diagnostic.strategy === "trigram"
      && one.items[0]?.exerciseId === "phase2-search-short"
      && two.items[0]?.exerciseId === "phase2-search-short"
      && three.items[0]?.exerciseId === "phase2-search-short",
      "phase2_search_short_query_invalid",
    );
  },

  async "search-rank-and-page"({ kernel }) {
    await migrateSearch(kernel);
    for (const seed of [
      { id: "rank-exact", name: "Press" },
      { id: "rank-prefix", name: "Press Machine" },
      {
        id: "rank-alias",
        name: "Horizontal Push",
        aliases: ["Press Variation"],
        favorite: true,
      },
      { id: "rank-partial", name: "Bench Press" },
    ] as const) {
      await insertSearchSeed(kernel, seed);
    }
    for (let ordinal = 0; ordinal < 31; ordinal += 1) {
      await insertSearchSeed(kernel, {
        id: `page-${String(ordinal).padStart(2, "0")}`,
        name: `Page Marker ${String(ordinal).padStart(2, "0")}`,
      });
    }
    const repository = createLibrarySearchRepository(kernel);
    const ranked = requirePage(await repository.searchExercises({
      query: "press",
    }));
    const first = requirePage(await repository.searchExercises({
      query: "page",
    }));
    invariant(first.nextCursor !== null, "phase2_search_page_cursor_missing");
    const second = requirePage(await repository.searchExercises({
      query: "page",
      cursor: first.nextCursor,
    }));
    const ids = [
      ...first.items.map(({ exerciseId }) => exerciseId),
      ...second.items.map(({ exerciseId }) => exerciseId),
    ];
    invariant(
      JSON.stringify(ranked.items.slice(0, 4).map(({ exerciseId, tier }) => [
        exerciseId,
        tier,
      ])) === JSON.stringify([
        ["rank-exact", 0],
        ["rank-prefix", 1],
        ["rank-alias", 2],
        ["rank-partial", 3],
      ])
      && first.items.length === SEARCH_PAGE_SIZE
      && second.items.length === 1
      && new Set(ids).size === 31,
      "phase2_search_rank_page_invalid",
    );
  },

  async "search-parity-integrity"({ kernel }) {
    await migrateSearch(kernel);
    await insertSearchSeed(kernel, {
      id: "phase2-search-integrity",
      name: "Integrity Cable Crossover",
    });
    const [term] = await kernel.queryAll<{
      id: number;
      normalized_text: string;
    }>(
      `SELECT id, normalized_text FROM exercise_search_terms
       WHERE exercise_id = ?`,
      ["phase2-search-integrity"],
    );
    invariant(term !== undefined, "phase2_search_integrity_term_missing");
    const index = createExerciseSearchIndexRepository(kernel);
    invariant(
      (await index.verifyParity()).exact,
      "phase2_search_initial_parity_invalid",
    );
    await removeIndexedTerm(kernel, {
      id: term.id,
      normalizedText: term.normalized_text,
    });
    const drift = await index.verifyParity();
    invariant(
      !drift.exact
      && !drift.integrityOk
      && drift.missingSourceTermIds.includes(term.id),
      "phase2_search_integrity_drift_missing",
    );
  },

  async "search-idempotent-rebuild"({ kernel }) {
    await migrateSearch(kernel);
    await insertSearchSeed(kernel, {
      id: "phase2-search-rebuild",
      name: "Rebuild Alpha Press",
    });
    const [term] = await kernel.queryAll<{
      id: number;
      normalized_text: string;
    }>(
      `SELECT id, normalized_text FROM exercise_search_terms
       WHERE exercise_id = ?`,
      ["phase2-search-rebuild"],
    );
    invariant(term !== undefined, "phase2_search_rebuild_term_missing");
    await removeIndexedTerm(kernel, {
      id: term.id,
      normalizedText: term.normalized_text,
    });
    const index = createExerciseSearchIndexRepository(kernel);
    const first = await index.rebuildSearchIndex();
    const second = await index.rebuildSearchIndex();
    const page = requirePage(
      await createLibrarySearchRepository(kernel).searchExercises({
        query: "alpha",
      }),
    );
    invariant(
      first.exact
      && second.exact
      && page.items[0]?.exerciseId === "phase2-search-rebuild",
      "phase2_search_rebuild_invalid",
    );
  },

  async "search-source-rollback"({ kernel }) {
    await migrateSearch(kernel);
    await insertSearchSeed(kernel, {
      id: "phase2-search-prior",
      name: "Safe Prior Press",
    });
    const before = await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY id",
    );
    let failed = false;
    try {
      await kernel.write(async (transaction) => {
        await insertSearchSeedInTransaction(transaction, {
          id: "phase2-search-rollback",
          name: "Sensitive Rollback Query",
        });
        throw new Error("phase2_search_injected_failure");
      });
    } catch {
      failed = true;
    }
    const after = await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY id",
    );
    const page = requirePage(
      await createLibrarySearchRepository(kernel).searchExercises({
        query: "rollback",
      }),
    );
    invariant(
      failed
      && page.items.length === 0
      && JSON.stringify(after) === JSON.stringify(before),
      "phase2_search_rollback_invalid",
    );
  },
};

export async function createExpoPhase2SearchContractAdapter(
  runId: string,
): Promise<Phase2SearchContractAdapter> {
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  return {
    async createRuntime(caseId) {
      return openExerciseSearchFtsContractRuntime(
        `phase2-search-${runId}-${caseId}.db`,
      );
    },
    sha256: (value) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  };
}

export async function runPhase2SearchContract(
  adapter: Phase2SearchContractAdapter,
): Promise<Phase2SearchContractResult> {
  const startedAt = new Date().toISOString();
  const results: Phase2SearchContractCaseResult[] = [];
  for (const caseId of PHASE2_SEARCH_CASE_IDS) {
    const caseStartedAt = Date.now();
    let runtime: Phase2SearchContractRuntime | undefined;
    try {
      runtime = await adapter.createRuntime(caseId);
      await contractCases[caseId](runtime, adapter);
      results.push({
        id: caseId,
        status: "passed",
        durationMs: Date.now() - caseStartedAt,
      });
    } catch (error) {
      results.push({
        id: caseId,
        status: "failed",
        durationMs: Date.now() - caseStartedAt,
        errorCode: safeErrorCode(error),
      });
    } finally {
      await runtime?.close().catch(() => undefined);
    }
  }
  const passed = results.filter(({ status }) => status === "passed").length;
  const failed = results.length - passed;
  return {
    schemaVersion: 1,
    contractVersion: PHASE2_SEARCH_CONTRACT_VERSION,
    status: failed === 0 ? "passed" : "failed",
    total: results.length,
    passed,
    failed,
    skipped: 0,
    cases: results,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export function assertPhase2SearchContractResult(
  input: unknown,
): asserts input is Phase2SearchContractResult {
  const result = input as Partial<Phase2SearchContractResult> | null;
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  const validCases = cases.length === PHASE2_SEARCH_CASE_IDS.length
    && cases.every((contractCase, index) => (
      typeof contractCase === "object"
      && contractCase !== null
      && sameKeys(
        contractCase as unknown as Readonly<Record<string, unknown>>,
        CASE_RESULT_KEYS,
      )
      && contractCase.id === PHASE2_SEARCH_CASE_IDS[index]
      && contractCase.status === "passed"
      && typeof contractCase.durationMs === "number"
      && contractCase.durationMs >= 0
      && contractCase.errorCode === undefined
    ));
  if (
    result === null
    || !sameKeys(
      result as unknown as Readonly<Record<string, unknown>>,
      RESULT_KEYS,
    )
    || result.schemaVersion !== 1
    || result.contractVersion !== PHASE2_SEARCH_CONTRACT_VERSION
    || result.status !== "passed"
    || result.total !== PHASE2_SEARCH_CASE_IDS.length
    || result.passed !== PHASE2_SEARCH_CASE_IDS.length
    || result.failed !== 0
    || result.skipped !== 0
    || !validCases
    || typeof result.startedAt !== "string"
    || Number.isNaN(Date.parse(result.startedAt))
    || typeof result.finishedAt !== "string"
    || Number.isNaN(Date.parse(result.finishedAt))
  ) {
    throw new Error("phase2_search_contract_result_invalid");
  }
}
