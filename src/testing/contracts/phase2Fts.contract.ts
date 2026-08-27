import {
  exerciseSearchFtsMigration,
} from "../../platform/sqlite/migrations/0005_exercise_search_fts";
import {
  createExerciseSearchIndexRepository,
  openExerciseSearchFtsContractRuntime,
} from "../../platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  type SqliteKernel,
  type SqliteKernelTestObserver,
} from "../../platform/sqlite/sqliteKernel";

export const PHASE2_FTS_CONTRACT_VERSION = 1 as const;

export const PHASE2_FTS_CASE_IDS = [
  "sqlite-fts5-capability",
  "trigram-substring",
  "short-query-relational-bound",
  "punctuation-unicode-bound-match",
  "source-trigger-rollback",
  "stable-id-parity",
  "integrity-check",
  "idempotent-rebuild",
] as const;

export type Phase2FtsContractCaseId =
  (typeof PHASE2_FTS_CASE_IDS)[number];

export type Phase2FtsContractRuntime = Readonly<{
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

export interface Phase2FtsContractAdapter {
  createRuntime(
    caseId: Phase2FtsContractCaseId,
    observer?: SqliteKernelTestObserver,
  ): Promise<Phase2FtsContractRuntime>;
}

export type Phase2FtsContractCaseResult = Readonly<{
  id: Phase2FtsContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type Phase2FtsContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PHASE2_FTS_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Phase2FtsContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type ContractCase = (runtime: Phase2FtsContractRuntime) => Promise<void>;

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
  return "phase2_fts_contract_failed";
}

function normalizeContractSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function boundMatchPhrase(value: string): string {
  const normalized = normalizeContractSearchText(value);
  invariant(
    [...normalized].length >= 3 && [...normalized].length <= 120,
    "phase2_fts_match_query_out_of_bounds",
  );
  return `"${normalized.replaceAll("\"", "\"\"")}"`;
}

async function createSourceAndIndex(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `CREATE TABLE exercise_search_terms (
        id INTEGER PRIMARY KEY NOT NULL,
        exercise_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('canonical', 'alias')),
        ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
        display_text TEXT NOT NULL CHECK(
          length(trim(display_text)) BETWEEN 1 AND 120
        ),
        normalized_text TEXT NOT NULL CHECK(
          length(trim(normalized_text)) BETWEEN 1 AND 120
        ),
        UNIQUE(exercise_id, kind, ordinal),
        UNIQUE(exercise_id, normalized_text)
      ) STRICT`,
    );
    await exerciseSearchFtsMigration.up(transaction);
    await exerciseSearchFtsMigration.verify(transaction);
  });
}

async function insertTerm(
  kernel: SqliteKernel,
  input: Readonly<{
    id: number;
    exerciseId: string;
    text: string;
    kind?: "canonical" | "alias";
    ordinal?: number;
  }>,
): Promise<void> {
  const normalizedText = normalizeContractSearchText(input.text);
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercise_search_terms
        (id, exercise_id, kind, ordinal, display_text, normalized_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.exerciseId,
        input.kind ?? "canonical",
        input.ordinal ?? 0,
        input.text,
        normalizedText,
      ],
    );
  });
}

async function matchIds(
  kernel: SqliteKernel,
  query: string,
  limit = 30,
): Promise<readonly number[]> {
  invariant(
    Number.isInteger(limit) && limit >= 1 && limit <= 30,
    "phase2_fts_page_limit_out_of_bounds",
  );
  const rows = await kernel.queryAll<{ id: number }>(
    `SELECT rowid AS id
     FROM exercise_search_terms_fts
     WHERE normalized_text MATCH ?
     ORDER BY rowid
     LIMIT ?`,
    [boundMatchPhrase(query), limit],
  );
  return rows.map(({ id }) => id);
}

async function relationalShortQueryIds(
  kernel: SqliteKernel,
  query: string,
): Promise<readonly number[]> {
  const normalized = normalizeContractSearchText(query);
  invariant(
    [...normalized].length >= 1 && [...normalized].length <= 2,
    "phase2_fts_short_query_out_of_bounds",
  );
  const escaped = normalized
    .replaceAll("!", "!!")
    .replaceAll("%", "!%")
    .replaceAll("_", "!_");
  const rows = await kernel.queryAll<{ id: number }>(
    `SELECT id
     FROM exercise_search_terms
     WHERE normalized_text LIKE '%' || ? || '%' ESCAPE '!'
     ORDER BY id
     LIMIT 30`,
    [escaped],
  );
  return rows.map(({ id }) => id);
}

async function removeIndexedTerm(
  kernel: SqliteKernel,
  input: Readonly<{ id: number; normalizedText: string }>,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercise_search_terms_fts(
        exercise_search_terms_fts,
        rowid,
        normalized_text
      )
      VALUES ('delete', ?, ?)`,
      [input.id, input.normalizedText],
    );
  });
}

const contractCases: Record<Phase2FtsContractCaseId, ContractCase> = {
  async "sqlite-fts5-capability"({ kernel }) {
    const [capability] = await kernel.queryAll<{
      sqlite_version: string;
      fts5_enabled: number;
    }>(
      `SELECT sqlite_version() AS sqlite_version,
              sqlite_compileoption_used('ENABLE_FTS5') AS fts5_enabled`,
    );
    invariant(
      typeof capability?.sqlite_version === "string"
      && /^\d+\.\d+\.\d+$/u.test(capability.sqlite_version),
      "phase2_fts_sqlite_version_missing",
    );
    invariant(
      capability.fts5_enabled === 1,
      "phase2_fts_compile_option_missing",
    );
    await createSourceAndIndex(kernel);
  },

  async "trigram-substring"({ kernel }) {
    await createSourceAndIndex(kernel);
    await insertTerm(kernel, {
      id: 101,
      exerciseId: "exercise-trigram",
      text: "cable crossover",
    });
    invariant(
      (await matchIds(kernel, "cross")).join(",") === "101",
      "phase2_fts_trigram_substring_missing",
    );
  },

  async "short-query-relational-bound"({ kernel }) {
    await createSourceAndIndex(kernel);
    await insertTerm(kernel, {
      id: 201,
      exerciseId: "exercise-short-one",
      text: "a",
    });
    await insertTerm(kernel, {
      id: 202,
      exerciseId: "exercise-short-two",
      text: "ab",
    });
    await insertTerm(kernel, {
      id: 203,
      exerciseId: "exercise-short-three",
      text: "abc",
    });
    invariant(
      (await relationalShortQueryIds(kernel, "a")).join(",")
        === "201,202,203",
      "phase2_fts_one_code_point_mismatch",
    );
    invariant(
      (await relationalShortQueryIds(kernel, "ab")).join(",") === "202,203",
      "phase2_fts_two_code_point_mismatch",
    );
    invariant(
      (await matchIds(kernel, "abc")).join(",") === "203",
      "phase2_fts_three_code_point_mismatch",
    );
  },

  async "punctuation-unicode-bound-match"({ kernel }) {
    await createSourceAndIndex(kernel);
    await insertTerm(kernel, {
      id: 301,
      exerciseId: "exercise-safe-match",
      text: "Café press-and/hold (quote): safe",
    });
    for (const query of ["café", "press-", "and", "\"quote\"", ":safe"]) {
      invariant(
        (await matchIds(kernel, query)).join(",") === "301",
        "phase2_fts_bound_match_mismatch",
      );
    }
  },

  async "source-trigger-rollback"({ kernel }) {
    await createSourceAndIndex(kernel);
    await insertTerm(kernel, {
      id: 401,
      exerciseId: "exercise-rollback",
      text: "cable crossover",
    });
    invariant(
      (await matchIds(kernel, "cross")).join(",") === "401",
      "phase2_fts_insert_trigger_missing",
    );

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE exercise_search_terms
         SET display_text = ?, normalized_text = ?
         WHERE id = ?`,
        ["cable fly", "cable fly", 401],
      );
    });
    invariant(
      (await matchIds(kernel, "cross")).length === 0
      && (await matchIds(kernel, "fly")).join(",") === "401",
      "phase2_fts_update_trigger_mismatch",
    );

    let rolledBack = false;
    try {
      await kernel.write(async (transaction) => {
        await transaction.execute(
          `UPDATE exercise_search_terms
           SET display_text = ?, normalized_text = ?
           WHERE id = ?`,
          ["must rollback", "must rollback", 401],
        );
        throw new Error("phase2_fts_injected_transaction_failure");
      });
    } catch {
      rolledBack = true;
    }
    invariant(rolledBack, "phase2_fts_rollback_not_triggered");
    invariant(
      (await matchIds(kernel, "fly")).join(",") === "401"
      && (await matchIds(kernel, "rollback")).length === 0,
      "phase2_fts_rollback_leaked",
    );

    await kernel.write(async (transaction) => {
      await transaction.execute(
        "DELETE FROM exercise_search_terms WHERE id = ?",
        [401],
      );
    });
    invariant(
      (await matchIds(kernel, "fly")).length === 0,
      "phase2_fts_delete_trigger_mismatch",
    );
  },

  async "stable-id-parity"({ kernel }) {
    await createSourceAndIndex(kernel);
    for (const [id, text] of [
      [501, "a"],
      [502, "ab"],
      [503, "abc"],
      [504, "precision independent"],
    ] as const) {
      await insertTerm(kernel, {
        id,
        exerciseId: `exercise-parity-${id}`,
        text,
      });
    }
    const parity = await createExerciseSearchIndexRepository(kernel)
      .verifyParity();
    invariant(
      parity.exact
      && parity.sourceTermCount === 4
      && parity.indexedTermCount === 4
      && parity.missingSourceTermIds.length === 0
      && parity.extraIndexedTermIds.length === 0,
      "phase2_fts_stable_id_parity_failed",
    );
  },

  async "integrity-check"({ kernel }) {
    await createSourceAndIndex(kernel);
    await insertTerm(kernel, {
      id: 601,
      exerciseId: "exercise-integrity",
      text: "integrity source",
    });
    const repository = createExerciseSearchIndexRepository(kernel);
    invariant(
      (await repository.verifyParity()).exact,
      "phase2_fts_initial_integrity_failed",
    );
    await removeIndexedTerm(kernel, {
      id: 601,
      normalizedText: "integrity source",
    });
    const drift = await repository.verifyParity();
    invariant(
      !drift.exact
      && !drift.integrityOk
      && drift.missingSourceTermIds.join(",") === "601",
      "phase2_fts_integrity_drift_not_detected",
    );
  },

  async "idempotent-rebuild"({ kernel }) {
    await createSourceAndIndex(kernel);
    await insertTerm(kernel, {
      id: 701,
      exerciseId: "exercise-rebuild-a",
      text: "rebuild alpha",
    });
    await insertTerm(kernel, {
      id: 702,
      exerciseId: "exercise-rebuild-b",
      text: "rebuild beta",
    });
    await removeIndexedTerm(kernel, {
      id: 701,
      normalizedText: "rebuild alpha",
    });

    const repository = createExerciseSearchIndexRepository(kernel);
    invariant(
      !(await repository.verifyParity()).exact,
      "phase2_fts_rebuild_fixture_not_drifted",
    );
    const first = await repository.rebuildSearchIndex();
    const second = await repository.rebuildSearchIndex();
    invariant(
      first.exact
      && second.exact
      && first.sourceTermCount === 2
      && second.indexedTermCount === 2
      && (await matchIds(kernel, "alpha")).join(",") === "701"
      && (await matchIds(kernel, "beta")).join(",") === "702",
      "phase2_fts_rebuild_not_idempotent",
    );
  },
};

export async function createExpoPhase2FtsContractAdapter(
  runId: string,
): Promise<Phase2FtsContractAdapter> {
  return {
    async createRuntime(caseId, observer = {}) {
      const databaseName = `phase2-fts-${runId}-${caseId}.db`;
      return openExerciseSearchFtsContractRuntime(databaseName, observer);
    },
  };
}

export async function runPhase2FtsContract(
  adapter: Phase2FtsContractAdapter,
): Promise<Phase2FtsContractResult> {
  const startedAt = new Date().toISOString();
  const results: Phase2FtsContractCaseResult[] = [];

  for (const caseId of PHASE2_FTS_CASE_IDS) {
    const caseStartedAt = Date.now();
    let runtime: Phase2FtsContractRuntime | undefined;
    try {
      runtime = await adapter.createRuntime(caseId);
      await contractCases[caseId](runtime);
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
    contractVersion: PHASE2_FTS_CONTRACT_VERSION,
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

export function assertPhase2FtsContractResult(
  input: unknown,
): asserts input is Phase2FtsContractResult {
  const result = input as Partial<Phase2FtsContractResult> | null;
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  const validCases = cases.length === PHASE2_FTS_CASE_IDS.length
    && cases.every((contractCase, index) => (
      contractCase !== null
      && typeof contractCase === "object"
      && contractCase.id === PHASE2_FTS_CASE_IDS[index]
      && contractCase.status === "passed"
      && typeof contractCase.durationMs === "number"
      && contractCase.durationMs >= 0
    ));
  if (
    result?.schemaVersion !== 1
    || result.contractVersion !== PHASE2_FTS_CONTRACT_VERSION
    || result.status !== "passed"
    || result.total !== PHASE2_FTS_CASE_IDS.length
    || result.passed !== PHASE2_FTS_CASE_IDS.length
    || result.failed !== 0
    || result.skipped !== 0
    || !validCases
    || typeof result.startedAt !== "string"
    || Number.isNaN(Date.parse(result.startedAt))
    || typeof result.finishedAt !== "string"
    || Number.isNaN(Date.parse(result.finishedAt))
  ) {
    throw new Error("phase2_fts_contract_result_invalid");
  }
}
