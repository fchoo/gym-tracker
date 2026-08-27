import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
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
  parseExerciseCatalog,
} from "../../src/domains/content/catalog";
import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  initialMigration,
} from "../../src/platform/sqlite/migrations/0001_initial";
import {
  outcomeEffortMigration,
} from "../../src/platform/sqlite/migrations/0002_outcome_effort";
import {
  exerciseHistoryIndexMigration,
} from "../../src/platform/sqlite/migrations/0003_exercise_history_index";
import {
  contentLibraryMigration,
} from "../../src/platform/sqlite/migrations/0004_content_library";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteTransactionExecutor,
} from "../../src/platform/sqlite/sqliteKernel";

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

const repositoryRoot = join(__dirname, "../..");
const migrations = [
  initialMigration,
  outcomeEffortMigration,
  exerciseHistoryIndexMigration,
  contentLibraryMigration,
] as const;
const temporaryDirectories = new Set<string>();
const runtimes: SqliteKernel[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function createRuntime(fixtureName = "v0-empty.sql"): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-content-library-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  const fixtureSql = readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures", fixtureName),
    "utf8",
  );
  if (fixtureName === "v2-phase1.sql" || fixtureName === "v3-phase1.sql") {
    fixtureDatabase.exec(readFileSync(
      join(
        repositoryRoot,
        "tests/migrations/fixtures",
        "v1-phase1.sql",
      ),
      "utf8",
    ));
  }
  fixtureDatabase.exec(fixtureSql);
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  runtimes.push(kernel);
  return kernel;
}

async function acceptedCatalog() {
  return parseExerciseCatalog({
    catalogBytes: readFileSync(
      join(repositoryRoot, "assets/content/exercise-library.v1.json"),
      "utf8",
    ),
    manifestBytes: readFileSync(
      join(repositoryRoot, "assets/content/exercise-library.v1.manifest.json"),
      "utf8",
    ),
    acceptanceBytes: readFileSync(
      join(
        repositoryRoot,
        "artifacts/review/phase2/exercise-library-acceptance.json",
      ),
      "utf8",
    ),
    sha256: async (value) =>
      createHash("sha256").update(value).digest("hex"),
  });
}

describe("content library migration and accepted catalog", () => {
  it("rejects incomplete schema and retained-row seeding during verification", async () => {
    const incompleteTransaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      queryAll: async <Row extends Record<string, unknown>>() => [] as Row[],
    };
    await expect(
      contentLibraryMigration.verify(incompleteTransaction),
    ).rejects.toThrow("content_library_schema_incomplete");

    const tableNames = [
      "content_pack_revisions",
      "exercise_aliases",
      "exercise_catalog_sources",
      "exercise_library_entries",
      "exercise_owner_preferences",
      "exercise_search_terms",
      "exercise_taxonomy",
      "taxonomy_terms",
    ];
    let queryIndex = 0;
    const mismatchedSeedTransaction: SqliteTransactionExecutor = {
      execute: async () => ({ changes: 0, lastInsertRowId: 0 }),
      async queryAll<Row extends Record<string, unknown>>() {
        const result = queryIndex === 0
          ? tableNames.map((name) => ({ name }))
          : queryIndex === 1
            ? [{ count: 1 }]
            : [{ count: 0 }];
        queryIndex += 1;
        return result as unknown as Row[];
      },
    };
    await expect(
      contentLibraryMigration.verify(mismatchedSeedTransaction),
    ).rejects.toThrow("content_library_seed_incomplete");
  });

  it.each([
    "v0-empty.sql",
    "v1-phase1.sql",
    "v2-phase1.sql",
    "v3-phase1.sql",
  ])("tracer: migrates retained %s directly through 0004", async (fixtureName) => {
    const kernel = await createRuntime(fixtureName);
    const before = {
      exercises: await kernel.queryAll<Record<string, unknown>>(
        "SELECT * FROM exercises ORDER BY id",
      ).catch(() => []),
      plans: await kernel.queryAll<Record<string, unknown>>(
        "SELECT * FROM plans ORDER BY id",
      ).catch(() => []),
      targets: await kernel.queryAll<Record<string, unknown>>(
        "SELECT * FROM plan_working_set_targets ORDER BY id",
      ).catch(() => []),
      sessionExercises: await kernel.queryAll<Record<string, unknown>>(
        `SELECT id, session_id, source_plan_day_exercise_id, exercise_id,
                ordinal, exercise_name, metric_profile,
                default_rest_seconds, target_revision, status, revision
         FROM session_exercises
         ORDER BY id`,
      ).catch(() => []),
      sessionSets: await kernel.queryAll<Record<string, unknown>>(
        "SELECT * FROM session_sets ORDER BY id",
      ).catch(() => []),
      undo: await kernel.queryAll<Record<string, unknown>>(
        "SELECT * FROM session_undo_snapshots ORDER BY id",
      ).catch(() => []),
    };

    const result = await createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel,
      migrations,
    }).run();

    expect(result.currentVersion).toBe(4);
    expect(await kernel.queryAll("PRAGMA foreign_key_check")).toEqual([]);
    expect({
      exercises: await kernel.queryAll(
        "SELECT * FROM exercises ORDER BY id",
      ),
      plans: await kernel.queryAll("SELECT * FROM plans ORDER BY id"),
      targets: await kernel.queryAll(
        "SELECT * FROM plan_working_set_targets ORDER BY id",
      ),
      sessionExercises: await kernel.queryAll(
        `SELECT id, session_id, source_plan_day_exercise_id, exercise_id,
                ordinal, exercise_name, metric_profile,
                default_rest_seconds, target_revision, status, revision
         FROM session_exercises
         ORDER BY id`,
      ),
      sessionSets: await kernel.queryAll(
        "SELECT * FROM session_sets ORDER BY id",
      ),
      undo: await kernel.queryAll(
        "SELECT * FROM session_undo_snapshots ORDER BY id",
      ),
    }).toEqual(before);
  });

  it("tracer: imports one accepted bundled exercise with attribution and taxonomy", async () => {
    const kernel = await createRuntime("v1-phase1.sql");
    await createMigrationRunner({
      databaseName: "gym-tracker.db",
      kernel,
      migrations,
    }).run();
    const catalog = await acceptedCatalog();
    const exercise = catalog.exercises.find(({ id }) =>
      id === "5f140001-7e35-4a6d-9100-000000000001"
    )!;

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, revision)
         VALUES (?, 'bundled', ?, ?, ?, ?, ?, ?, 'available', ?)`,
        [
          exercise.id,
          exercise.canonicalName,
          exercise.exerciseType,
          exercise.movementClass,
          exercise.metricIdentity.profile,
          exercise.metricIdentity.contractVersion,
          exercise.metricIdentity.exerciseMetricGeneration,
          catalog.metadata.revision,
        ],
      );
      await transaction.execute(
        `INSERT INTO content_pack_revisions
          (id, namespace, revision, source_commit, pack_sha256,
           manifest_sha256, license_sha256, review_status, accepted_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `${catalog.metadata.namespace}:${catalog.metadata.revision}`,
          catalog.metadata.namespace,
          catalog.metadata.revision,
          catalog.metadata.source.commit,
          catalog.acceptance.packSha256,
          catalog.acceptance.manifestSha256,
          catalog.acceptance.licenseSha256,
          "accepted",
          Date.parse(catalog.acceptance.reviewedAt),
        ],
      );
      await transaction.execute(
        `INSERT INTO exercise_catalog_sources
          (exercise_id, content_revision_id, source_namespace, source_revision,
           upstream_id, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, license, attribution,
           legacy_link_status, linked_upstream_id, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          exercise.id,
          `${catalog.metadata.namespace}:${catalog.metadata.revision}`,
          exercise.source.namespace,
          exercise.source.sourceRevision,
          exercise.source.upstreamId,
          exercise.canonicalName,
          exercise.exerciseType,
          exercise.movementClass,
          exercise.metricIdentity.profile,
          exercise.metricIdentity.contractVersion,
          exercise.metricIdentity.exerciseMetricGeneration,
          "available",
          exercise.source.license,
          exercise.source.attribution,
          exercise.source.legacyLinkStatus,
          exercise.source.linkedUpstreamId,
          catalog.metadata.revision,
        ],
      );
      for (const [ordinal, muscle] of exercise.primaryMuscles.entries()) {
        await transaction.execute(
          `INSERT INTO taxonomy_terms (kind, slug, display_name)
           VALUES ('muscle', ?, ?)
           ON CONFLICT(kind, slug) DO NOTHING`,
          [muscle, muscle],
        );
        await transaction.execute(
          `INSERT INTO exercise_taxonomy
            (exercise_id, kind, slug, relation, ordinal)
           VALUES (?, 'muscle', ?, 'primary', ?)`,
          [exercise.id, muscle, ordinal],
        );
      }
      await transaction.execute(
        `INSERT INTO exercise_search_terms
          (exercise_id, kind, ordinal, display_text, normalized_text)
         VALUES (?, 'canonical', 0, ?, ?)`,
        [exercise.id, exercise.canonicalName, "back squat"],
      );
    });

    expect(await kernel.queryAll(
      `SELECT ecs.exercise_id, ecs.canonical_name, ecs.availability,
              ecs.license, ecs.attribution,
              COUNT(DISTINCT et.slug) AS taxonomy_count,
              COUNT(DISTINCT est.id) AS search_term_count
       FROM exercise_catalog_sources ecs
       JOIN exercise_taxonomy et ON et.exercise_id = ecs.exercise_id
       JOIN exercise_search_terms est ON est.exercise_id = ecs.exercise_id
       WHERE ecs.exercise_id = ?
       GROUP BY ecs.exercise_id`,
      [exercise.id],
    )).toEqual([{
      attribution: "Original Gym Tracker program",
      availability: "available",
      canonical_name: "Back Squat",
      exercise_id: exercise.id,
      license: "Original",
      search_term_count: 1,
      taxonomy_count: 2,
    }]);
  });
});
