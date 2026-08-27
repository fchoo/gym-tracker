import exerciseCatalogAsset from "../../../assets/content/exercise-library.v1.json";
import exerciseCatalogManifestAsset from "../../../assets/content/exercise-library.v1.manifest.json";
import exerciseCatalogAcceptanceAsset from "../../../artifacts/review/phase2/exercise-library-acceptance.json";
import {
  parseExerciseCatalog,
  type ExerciseCatalog,
} from "../../domains/content/catalog";
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
import type {
  SqliteKernel,
} from "../../platform/sqlite/sqliteKernel";

export const PHASE2_CONTENT_CONTRACT_VERSION = 1 as const;

export const PHASE2_CONTENT_CASE_IDS = [
  "content-accepted-fresh-import",
  "content-retained-v2-upgrade",
  "content-retained-v3-upgrade",
  "content-retained-v4-upgrade",
  "content-d50-d51-update",
  "content-replay-rollback",
] as const;

export type Phase2ContentContractCaseId =
  (typeof PHASE2_CONTENT_CASE_IDS)[number];

export type Phase2ContractRequirement =
  | "LIB-02"
  | "LIB-03"
  | "LIB-04"
  | "LIB-05"
  | "LIB-06"
  | "LIB-07"
  | "LIB-08"
  | "LIB-09"
  | "LIB-10"
  | "LIB-11"
  | "LIB-12";

export type Phase2ContractCaseMetadata<
  CaseId extends string = string,
> = Readonly<{
  id: CaseId;
  requirement: Phase2ContractRequirement;
  category: string;
  edgeIds: readonly `E-${string}`[];
  sourceTest: string;
}>;

export const PHASE2_CONTENT_CASE_METADATA = [
  {
    id: "content-accepted-fresh-import",
    requirement: "LIB-02",
    category: "content-identity",
    edgeIds: ["E-06", "E-07", "E-08", "E-09", "E-10", "E-11", "E-12", "E-13"],
    sourceTest: "tests/integration/content-import.test.ts#imports the complete pack atomically and reruns idempotently",
  },
  {
    id: "content-retained-v2-upgrade",
    requirement: "LIB-10",
    category: "retained-migration",
    edgeIds: ["E-59"],
    sourceTest: "tests/sqlite-host/content-library.test.ts#retained Phase 1 migrations",
  },
  {
    id: "content-retained-v3-upgrade",
    requirement: "LIB-10",
    category: "retained-migration",
    edgeIds: ["E-60"],
    sourceTest: "tests/sqlite-host/content-library.test.ts#retained Phase 1 migrations",
  },
  {
    id: "content-retained-v4-upgrade",
    requirement: "LIB-10",
    category: "retained-migration",
    edgeIds: ["E-61"],
    sourceTest: "tests/sqlite-host/exercise-search-fts.test.ts#migrates the retained v4 fixture without changing source facts",
  },
  {
    id: "content-d50-d51-update",
    requirement: "LIB-10",
    category: "content-update",
    edgeIds: ["E-62"],
    sourceTest: "tests/integration/content-import.test.ts#marks absent bundled rows unavailable without mutating owned or historical facts",
  },
  {
    id: "content-replay-rollback",
    requirement: "LIB-10",
    category: "transaction-integrity",
    edgeIds: ["E-63"],
    sourceTest: "tests/integration/content-import.test.ts#rolls source and search rows back when an import step fails",
  },
] as const satisfies readonly Phase2ContractCaseMetadata<
  Phase2ContentContractCaseId
>[];

export type Phase2ContentContractRuntime = Readonly<{
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

export interface Phase2ContentContractAdapter {
  createRuntime(
    caseId: Phase2ContentContractCaseId,
  ): Promise<Phase2ContentContractRuntime>;
  sha256(value: string): Promise<string>;
}

export type Phase2ContentContractCaseResult = Readonly<{
  id: Phase2ContentContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type Phase2ContentContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PHASE2_CONTENT_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Phase2ContentContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type ContractCase = (
  runtime: Phase2ContentContractRuntime,
  adapter: Phase2ContentContractAdapter,
) => Promise<void>;

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
  return "phase2_content_contract_failed";
}

function prettyBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

export function parseAcceptedPhase2Catalog(
  sha256: (value: string) => Promise<string>,
): Promise<ExerciseCatalog> {
  return parseExerciseCatalog({
    catalogBytes: prettyBytes(exerciseCatalogAsset),
    manifestBytes: prettyBytes(exerciseCatalogManifestAsset),
    acceptanceBytes: prettyBytes(exerciseCatalogAcceptanceAsset),
    sha256,
  });
}

async function migrateThrough(
  kernel: SqliteKernel,
  version: 1 | 2 | 3 | 4 | 5,
): Promise<void> {
  await createMigrationRunner({
    databaseName: `phase2-content-v${version}`,
    kernel,
    migrations: migrations.filter((migration) => migration.version <= version),
  }).run();
}

async function userVersion(kernel: SqliteKernel): Promise<number> {
  const [row] = await kernel.queryAll<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version ?? -1;
}

async function assertRetainedUpgrade(
  runtime: Phase2ContentContractRuntime,
  retainedVersion: 2 | 3 | 4,
): Promise<void> {
  await migrateThrough(runtime.kernel, 1);
  await runtime.kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO content_packs
        (id, namespace, version, source_revision, installed_at_ms)
       VALUES ('phase2-retained-pack', 'phase2.retained', 1, 1, 1)`,
    );
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, equipment, default_rest_seconds, revision)
       VALUES ('phase2-retained-exercise', 'phase2-retained-pack', 'bundled',
               'phase2.retained', 'retained-upstream',
               'Retained Contract Exercise', 'load_reps', 'barbell', 90, 1)`,
    );
  });
  await migrateThrough(runtime.kernel, retainedVersion);
  const before = await runtime.kernel.queryAll<{
    id: string;
    name: string;
    metric_profile: string;
  }>(
    "SELECT id, name, metric_profile FROM exercises ORDER BY id",
  );
  invariant(
    before.length === 1
    && before[0]?.id === "phase2-retained-exercise",
    "phase2_content_retained_source_missing",
  );
  await migrateThrough(runtime.kernel, 5);
  const after = await runtime.kernel.queryAll<{
    id: string;
    name: string;
    metric_profile: string;
  }>(
    "SELECT id, name, metric_profile FROM exercises ORDER BY id",
  );
  const version = await userVersion(runtime.kernel);
  invariant(
    version === 5,
    "phase2_content_retained_version_invalid",
  );
  invariant(
    JSON.stringify(after) === JSON.stringify(before),
    "phase2_content_retained_source_changed",
  );
  const library = await runtime.kernel.queryAll<{
    exercise_id: string;
    origin: string;
  }>(
    `SELECT exercise_id, origin FROM exercise_library_entries
     WHERE exercise_id = 'phase2-retained-exercise'`,
  );
  invariant(
    library.length === 1 && library[0]?.origin === "bundled",
    "phase2_content_retained_library_missing",
  );
}

async function createAcceptedUpdate(
  current: ExerciseCatalog,
  adapter: Phase2ContentContractAdapter,
): Promise<ExerciseCatalog> {
  const catalog = structuredClone(exerciseCatalogAsset) as Record<string, unknown>;
  const manifest = structuredClone(
    exerciseCatalogManifestAsset,
  ) as Record<string, unknown>;
  const acceptance = structuredClone(
    exerciseCatalogAcceptanceAsset,
  ) as Record<string, unknown>;
  const exercises = catalog.exercises as Array<Record<string, unknown>>;
  const removed = current.exercises.find(({ source }) =>
    source.namespace !== "gym-tracker.original"
  )!;
  const changed = exercises.find(({ id }) => id !== removed.id)!;
  changed.aliases = ["Contract-only accepted alias"];
  catalog.exercises = exercises.filter(({ id }) => id !== removed.id);

  const metadata = catalog.metadata as Record<string, unknown>;
  metadata.revision = current.metadata.revision + 1;
  const catalogCounts = metadata.counts as Record<string, number>;
  const manifestCounts = manifest.counts as Record<string, number>;
  const acceptanceCounts = acceptance.counts as Record<string, number>;
  for (const counts of [catalogCounts, manifestCounts, acceptanceCounts]) {
    counts.visible = (counts.visible ?? 0) - 1;
    counts.upstreamIncluded = (counts.upstreamIncluded ?? 0) - 1;
  }

  const catalogBytes = prettyBytes(catalog);
  const packSha256 = await adapter.sha256(catalogBytes);
  manifest.packSha256 = packSha256;
  const manifestBytes = prettyBytes(manifest);
  acceptance.packSha256 = packSha256;
  acceptance.manifestSha256 = await adapter.sha256(manifestBytes);
  return parseExerciseCatalog({
    catalogBytes,
    manifestBytes,
    acceptanceBytes: prettyBytes(acceptance),
    sha256: adapter.sha256,
  });
}

const contractCases: Record<Phase2ContentContractCaseId, ContractCase> = {
  async "content-accepted-fresh-import"({ kernel }, adapter) {
    await migrateThrough(kernel, 5);
    const catalog = await parseAcceptedPhase2Catalog(adapter.sha256);
    const result = await createContentRepository(kernel).importAcceptedCatalog({
      catalog,
      expectedInstalled: null,
    });
    const [counts] = await kernel.queryAll<{
      library_count: number;
      source_count: number;
      search_count: number;
      revision_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM exercise_library_entries) AS library_count,
         (SELECT COUNT(*) FROM exercise_catalog_sources) AS source_count,
         (SELECT COUNT(*) FROM exercise_search_terms) AS search_count,
         (SELECT COUNT(*) FROM content_pack_revisions) AS revision_count`,
    );
    const parity = await createExerciseSearchIndexRepository(kernel)
      .verifyParity();
    invariant(
      catalog.exercises.length === 310
      && result.added === 310
      && result.updated === 0
      && result.newlyUnavailable === 0
      && result.packSha256 === catalog.acceptance.packSha256
      && counts?.library_count === 310
      && counts.source_count === 310
      && counts.search_count >= 310
      && counts.revision_count === 1
      && parity.exact,
      "phase2_content_fresh_import_invalid",
    );
  },

  async "content-retained-v2-upgrade"(runtime) {
    await assertRetainedUpgrade(runtime, 2);
  },

  async "content-retained-v3-upgrade"(runtime) {
    await assertRetainedUpgrade(runtime, 3);
  },

  async "content-retained-v4-upgrade"(runtime) {
    await assertRetainedUpgrade(runtime, 4);
  },

  async "content-d50-d51-update"({ kernel }, adapter) {
    await migrateThrough(kernel, 5);
    const catalog = await parseAcceptedPhase2Catalog(adapter.sha256);
    const repository = createContentRepository(kernel);
    await repository.importAcceptedCatalog({
      catalog,
      expectedInstalled: null,
    });
    await kernel.write(async (transaction) => {
      for (const [id, origin] of [
        ["phase2-contract-custom", "custom"],
        ["phase2-contract-copied", "copied"],
      ] as const) {
        await transaction.execute(
          `INSERT INTO exercise_library_entries
            (exercise_id, origin, canonical_name, exercise_type,
             movement_class, metric_profile, metric_contract_version,
             exercise_metric_generation, availability, revision)
           VALUES (?, ?, ?, 'strength', 'compound', 'load_reps', 1, 1,
                   'available', 7)`,
          [id, origin, `${origin} retained`],
        );
      }
    });
    const ownedBefore = await kernel.queryAll(
      `SELECT * FROM exercise_library_entries
       WHERE origin IN ('custom', 'copied') ORDER BY exercise_id`,
    );
    const update = await createAcceptedUpdate(catalog, adapter);
    const result = await repository.importAcceptedCatalog({
      catalog: update,
      expectedInstalled: {
        revision: catalog.metadata.revision,
        packSha256: catalog.acceptance.packSha256,
      },
    });
    const unavailable = await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM exercise_catalog_sources
       WHERE availability = 'unavailable'`,
    );
    const ownedAfter = await kernel.queryAll(
      `SELECT * FROM exercise_library_entries
       WHERE origin IN ('custom', 'copied') ORDER BY exercise_id`,
    );
    invariant(
      result.updated === 1
      && result.newlyUnavailable === 1
      && unavailable[0]?.count === 1
      && JSON.stringify(ownedAfter) === JSON.stringify(ownedBefore),
      "phase2_content_update_invalid",
    );
  },

  async "content-replay-rollback"({ kernel }, adapter) {
    await migrateThrough(kernel, 5);
    const catalog = await parseAcceptedPhase2Catalog(adapter.sha256);
    const repository = createContentRepository(kernel);
    const first = await repository.importAcceptedCatalog({
      catalog,
      expectedInstalled: null,
    });
    const replay = await repository.importAcceptedCatalog({ catalog });
    const before = await kernel.queryAll(
      `SELECT exercise_id, canonical_name, revision
       FROM exercise_library_entries ORDER BY exercise_id`,
    );
    const update = await createAcceptedUpdate(catalog, adapter);
    let failed = false;
    try {
      await createContentRepository(kernel, {
        afterSearchTerms() {
          throw new Error("phase2_content_injected_failure");
        },
      }).importAcceptedCatalog({
        catalog: update,
        expectedInstalled: {
          revision: catalog.metadata.revision,
          packSha256: catalog.acceptance.packSha256,
        },
      });
    } catch {
      failed = true;
    }
    const after = await kernel.queryAll(
      `SELECT exercise_id, canonical_name, revision
       FROM exercise_library_entries ORDER BY exercise_id`,
    );
    invariant(
      first.added === 310
      && replay.added === 0
      && replay.updated === 0
      && replay.newlyUnavailable === 0
      && replay.invalidationScopes.length === 0
      && failed
      && JSON.stringify(after) === JSON.stringify(before),
      "phase2_content_replay_rollback_invalid",
    );
  },
};

export async function createExpoPhase2ContentContractAdapter(
  runId: string,
): Promise<Phase2ContentContractAdapter> {
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  return {
    async createRuntime(caseId) {
      return openExerciseSearchFtsContractRuntime(
        `phase2-content-${runId}-${caseId}.db`,
      );
    },
    sha256: (value) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  };
}

export async function runPhase2ContentContract(
  adapter: Phase2ContentContractAdapter,
): Promise<Phase2ContentContractResult> {
  const startedAt = new Date().toISOString();
  const results: Phase2ContentContractCaseResult[] = [];
  for (const caseId of PHASE2_CONTENT_CASE_IDS) {
    const caseStartedAt = Date.now();
    let runtime: Phase2ContentContractRuntime | undefined;
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
    contractVersion: PHASE2_CONTENT_CONTRACT_VERSION,
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

export function assertPhase2ContentContractResult(
  input: unknown,
): asserts input is Phase2ContentContractResult {
  const result = input as Partial<Phase2ContentContractResult> | null;
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  const validCases = cases.length === PHASE2_CONTENT_CASE_IDS.length
    && cases.every((contractCase, index) => (
      typeof contractCase === "object"
      && contractCase !== null
      && sameKeys(
        contractCase as unknown as Readonly<Record<string, unknown>>,
        CASE_RESULT_KEYS,
      )
      && contractCase.id === PHASE2_CONTENT_CASE_IDS[index]
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
    || result.contractVersion !== PHASE2_CONTENT_CONTRACT_VERSION
    || result.status !== "passed"
    || result.total !== PHASE2_CONTENT_CASE_IDS.length
    || result.passed !== PHASE2_CONTENT_CASE_IDS.length
    || result.failed !== 0
    || result.skipped !== 0
    || !validCases
    || typeof result.startedAt !== "string"
    || Number.isNaN(Date.parse(result.startedAt))
    || typeof result.finishedAt !== "string"
    || Number.isNaN(Date.parse(result.finishedAt))
  ) {
    throw new Error("phase2_content_contract_result_invalid");
  }
}
