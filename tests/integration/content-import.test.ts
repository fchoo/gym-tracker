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
  type ExerciseCatalog,
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
  ContentImportError,
  createContentRepository,
  type ContentRepositoryTestObserver,
} from "../../src/platform/sqlite/repositories/contentRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
  type SqliteKernelTestObserver,
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
const runtimes: SqliteKernel[] = [];
const temporaryDirectories = new Set<string>();
const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function createRuntime(
  observer: SqliteKernelTestObserver = {},
): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-content-import-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures/v1-phase1.sql"),
    "utf8",
  ));
  fixtureDatabase.exec(readFileSync(
    join(repositoryRoot, "tests/migrations/fixtures/v3-phase1.sql"),
    "utf8",
  ));
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer }, observer);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
  }).run();
  runtimes.push(kernel);
  return kernel;
}

async function acceptedCatalog(): Promise<ExerciseCatalog> {
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
    sha256,
  });
}

async function nextAcceptedCatalog(
  current: ExerciseCatalog,
  removedExerciseId: string,
): Promise<ExerciseCatalog> {
  const catalog = JSON.parse(readFileSync(
    join(repositoryRoot, "assets/content/exercise-library.v1.json"),
    "utf8",
  )) as Record<string, unknown>;
  const manifest = JSON.parse(readFileSync(
    join(repositoryRoot, "assets/content/exercise-library.v1.manifest.json"),
    "utf8",
  )) as Record<string, unknown>;
  const acceptance = JSON.parse(readFileSync(
    join(
      repositoryRoot,
      "artifacts/review/phase2/exercise-library-acceptance.json",
    ),
    "utf8",
  )) as Record<string, unknown>;
  const metadata = catalog.metadata as Record<string, unknown>;
  const catalogCounts = metadata.counts as typeof current.metadata.counts;
  const manifestCounts = manifest.counts as typeof current.manifest.counts;
  const acceptanceCounts = acceptance.counts as typeof current.acceptance.counts;
  const removed = current.exercises.find(({ id }) => id === removedExerciseId)!;

  metadata.revision = current.metadata.revision + 1;
  catalog.exercises = (catalog.exercises as Array<Record<string, unknown>>)
    .filter(({ id }) => id !== removedExerciseId);
  metadata.counts = {
    ...catalogCounts,
    visible: catalogCounts.visible - 1,
    upstreamIncluded: removed.source.namespace === "gym-tracker.original"
      ? catalogCounts.upstreamIncluded
      : catalogCounts.upstreamIncluded - 1,
    legacyPreserved: removed.source.namespace === "gym-tracker.original"
      ? catalogCounts.legacyPreserved - 1
      : catalogCounts.legacyPreserved,
  };
  manifest.counts = {
    ...manifestCounts,
    visible: manifestCounts.visible - 1,
    upstreamIncluded: removed.source.namespace === "gym-tracker.original"
      ? manifestCounts.upstreamIncluded
      : manifestCounts.upstreamIncluded - 1,
    legacyPreserved: removed.source.namespace === "gym-tracker.original"
      ? manifestCounts.legacyPreserved - 1
      : manifestCounts.legacyPreserved,
  };
  acceptance.counts = {
    ...acceptanceCounts,
    visible: acceptanceCounts.visible - 1,
    upstreamIncluded: removed.source.namespace === "gym-tracker.original"
      ? acceptanceCounts.upstreamIncluded
      : acceptanceCounts.upstreamIncluded - 1,
    legacyPreserved: removed.source.namespace === "gym-tracker.original"
      ? acceptanceCounts.legacyPreserved - 1
      : acceptanceCounts.legacyPreserved,
    linkedLegacyCandidates:
      removed.source.legacyLinkStatus === "link_candidate"
        ? acceptanceCounts.linkedLegacyCandidates - 1
        : acceptanceCounts.linkedLegacyCandidates,
    preservedLegacyOriginals:
      removed.source.legacyLinkStatus === "preserve_original"
        ? acceptanceCounts.preservedLegacyOriginals - 1
        : acceptanceCounts.preservedLegacyOriginals,
  };

  const catalogBytes = `${JSON.stringify(catalog, null, 2)}\n`;
  const packSha256 = await sha256(catalogBytes);
  manifest.packSha256 = packSha256;
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  acceptance.packSha256 = packSha256;
  acceptance.manifestSha256 = await sha256(manifestBytes);
  return parseExerciseCatalog({
    catalogBytes,
    manifestBytes,
    acceptanceBytes: `${JSON.stringify(acceptance, null, 2)}\n`,
    sha256,
  });
}

async function updatedAcceptedCatalog(
  current: ExerciseCatalog,
  options: Readonly<{
    incrementRevision: boolean;
    exerciseId?: string;
  }>,
): Promise<ExerciseCatalog> {
  const catalog = JSON.parse(readFileSync(
    join(repositoryRoot, "assets/content/exercise-library.v1.json"),
    "utf8",
  )) as Record<string, unknown>;
  const manifest = JSON.parse(readFileSync(
    join(repositoryRoot, "assets/content/exercise-library.v1.manifest.json"),
    "utf8",
  )) as Record<string, unknown>;
  const acceptance = JSON.parse(readFileSync(
    join(
      repositoryRoot,
      "artifacts/review/phase2/exercise-library-acceptance.json",
    ),
    "utf8",
  )) as Record<string, unknown>;
  const metadata = catalog.metadata as Record<string, unknown>;
  metadata.revision = options.incrementRevision
    ? current.metadata.revision + 1
    : current.metadata.revision;
  const exercise = (catalog.exercises as Array<Record<string, unknown>>)
    .find(({ id }) => id === (options.exerciseId ?? current.exercises[0]!.id))!;
  exercise.aliases = ["Accepted runtime alias"];
  const catalogBytes = `${JSON.stringify(catalog, null, 2)}\n`;
  const packSha256 = await sha256(catalogBytes);
  manifest.packSha256 = packSha256;
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  acceptance.packSha256 = packSha256;
  acceptance.manifestSha256 = await sha256(manifestBytes);
  return parseExerciseCatalog({
    catalogBytes,
    manifestBytes,
    acceptanceBytes: `${JSON.stringify(acceptance, null, 2)}\n`,
    sha256,
  });
}

async function catalogSourceSnapshot(
  kernel: SqliteKernel,
): Promise<Readonly<Record<string, readonly Record<string, unknown>[]>>> {
  return {
    revisions: await kernel.queryAll(
      "SELECT * FROM content_pack_revisions ORDER BY id",
    ),
    library: await kernel.queryAll(
      "SELECT * FROM exercise_library_entries ORDER BY exercise_id",
    ),
    sources: await kernel.queryAll(
      "SELECT * FROM exercise_catalog_sources ORDER BY exercise_id",
    ),
    aliases: await kernel.queryAll(
      "SELECT * FROM exercise_aliases ORDER BY exercise_id, ordinal",
    ),
    taxonomyTerms: await kernel.queryAll(
      "SELECT * FROM taxonomy_terms ORDER BY kind, slug",
    ),
    taxonomy: await kernel.queryAll(
      `SELECT * FROM exercise_taxonomy
       ORDER BY exercise_id, kind, relation, ordinal`,
    ),
    searchTerms: await kernel.queryAll(
      "SELECT * FROM exercise_search_terms ORDER BY exercise_id, kind, ordinal",
    ),
  };
}

describe("accepted content import repository", () => {
  it("imports the complete pack atomically and reruns idempotently", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const repository = createContentRepository(kernel);

    const first = await repository.importAcceptedCatalog({
      catalog,
      expectedInstalled: null,
    });
    const repeated = await repository.importAcceptedCatalog({ catalog });

    expect(first).toEqual(expect.objectContaining({
      outcome: "committed",
      revision: 1,
      packSha256: catalog.acceptance.packSha256,
      added: 310,
      updated: 0,
      newlyUnavailable: 0,
    }));
    expect(first.invalidationScopes).toHaveLength(311);
    expect(first.invalidationScopes[0]).toEqual({
      scope: "exercise-library",
    });
    expect(repeated).toEqual({
      outcome: "committed",
      revision: 1,
      packSha256: catalog.acceptance.packSha256,
      added: 0,
      updated: 0,
      newlyUnavailable: 0,
      invalidationScopes: [],
    });
    expect(await kernel.queryAll(
      `SELECT
         (SELECT COUNT(*) FROM exercise_catalog_sources) AS sources,
         (SELECT COUNT(*) FROM exercise_search_terms) AS search_terms,
         (SELECT COUNT(*) FROM exercise_aliases) AS aliases`,
    )).toEqual([{
      aliases: 0,
      search_terms: 310,
      sources: 310,
    }]);
  });

  it("returns a typed conflict when the expected installed revision drifts", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const repository = createContentRepository(kernel);
    await repository.importAcceptedCatalog({ catalog });
    const before = await catalogSourceSnapshot(kernel);

    await expect(repository.importAcceptedCatalog({
      catalog,
      expectedInstalled: {
        revision: 99,
        packSha256: "0".repeat(64),
      },
    })).rejects.toEqual(expect.objectContaining({
      code: "content_revision_conflict",
      kind: "conflict",
      retryable: false,
    } satisfies Partial<ContentImportError>));
    expect(await catalogSourceSnapshot(kernel)).toEqual(before);
  });

  it("rejects an accepted catalog ID already owned by a custom row", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const collision = catalog.exercises[0]!;
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, revision)
         VALUES (?, 'custom', 'Owned collision', 'strength', 'compound',
                 'load_reps', 1, 1, 'available', 1)`,
        [collision.id],
      ),
    );
    const before = await catalogSourceSnapshot(kernel);

    await expect(createContentRepository(kernel).importAcceptedCatalog({
      catalog,
      expectedInstalled: null,
    })).rejects.toEqual(expect.objectContaining({
      code: "content_origin_conflict",
      kind: "conflict",
      retryable: false,
    } satisfies Partial<ContentImportError>));
    expect(await catalogSourceSnapshot(kernel)).toEqual(before);
  });

  it("rejects a bundled source identity already attached to another app ID", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const collision = catalog.exercises.find(({ source }) =>
      source.upstreamId !== null
    )!;
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO content_pack_revisions
          (id, namespace, revision, source_commit, pack_sha256,
           manifest_sha256, license_sha256, review_status, accepted_at_ms)
         VALUES ('foreign:1', 'foreign', 1, 'foreign', ?, ?, ?, 'accepted', 1)`,
        ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
      );
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, revision)
         VALUES ('foreign-app-id', 'bundled', 'Foreign', 'strength',
                 'compound', 'load_reps', 1, 1, 'available', 1)`,
      );
      await transaction.execute(
        `INSERT INTO exercise_catalog_sources
          (exercise_id, content_revision_id, source_namespace, source_revision,
           upstream_id, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, license, attribution,
           legacy_link_status, linked_upstream_id, revision)
         VALUES ('foreign-app-id', 'foreign:1', ?, ?, ?, 'Foreign', 'strength',
                 'compound', 'load_reps', 1, 1, 'available', 'MIT', 'Foreign',
                 'not_applicable', NULL, 1)`,
        [
          collision.source.namespace,
          collision.source.sourceRevision,
          collision.source.upstreamId,
        ],
      );
    });
    const before = await catalogSourceSnapshot(kernel);

    await expect(createContentRepository(kernel).importAcceptedCatalog({
      catalog,
      expectedInstalled: null,
    })).rejects.toEqual(expect.objectContaining({
      code: "content_origin_conflict",
    }));
    expect(await catalogSourceSnapshot(kernel)).toEqual(before);
  });

  it("updates changed rows and synchronizes accepted aliases", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const repository = createContentRepository(kernel);
    await repository.importAcceptedCatalog({ catalog });
    const changedExerciseId = catalog.exercises[0]!.id;
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO exercise_aliases
          (exercise_id, ordinal, display_text, normalized_text)
         VALUES (?, 0, 'Stale alias', 'stale alias')`,
        [changedExerciseId],
      ),
    );
    const updatedCatalog = await updatedAcceptedCatalog(catalog, {
      incrementRevision: true,
      exerciseId: changedExerciseId,
    });

    const result = await repository.importAcceptedCatalog({
      catalog: updatedCatalog,
      expectedInstalled: {
        revision: catalog.metadata.revision,
        packSha256: catalog.acceptance.packSha256,
      },
    });

    expect(result).toEqual(expect.objectContaining({
      added: 0,
      updated: 1,
      newlyUnavailable: 0,
    }));
    expect(await kernel.queryAll(
      `SELECT ea.display_text, ea.normalized_text, est.kind
       FROM exercise_aliases ea
       JOIN exercise_search_terms est
         ON est.exercise_id = ea.exercise_id
        AND est.kind = 'alias'
        AND est.ordinal = ea.ordinal
       WHERE ea.exercise_id = ?`,
      [changedExerciseId],
    )).toEqual([{
      display_text: "Accepted runtime alias",
      kind: "alias",
      normalized_text: "accepted runtime alias",
    }]);
  });

  it("rejects a different pack reusing the installed revision", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const repository = createContentRepository(kernel);
    await repository.importAcceptedCatalog({ catalog });
    const reusedRevision = await updatedAcceptedCatalog(catalog, {
      incrementRevision: false,
    });

    await expect(repository.importAcceptedCatalog({
      catalog: reusedRevision,
    })).rejects.toEqual(expect.objectContaining({
      code: "content_revision_conflict",
    }));
  });

  it("rejects an existing source row from another catalog namespace", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const repository = createContentRepository(kernel);
    await repository.importAcceptedCatalog({ catalog });
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE content_pack_revisions
         SET namespace = 'foreign-catalog'
         WHERE namespace = ?`,
        [catalog.metadata.namespace],
      ),
    );
    const updatedCatalog = await updatedAcceptedCatalog(catalog, {
      incrementRevision: true,
    });

    await expect(repository.importAcceptedCatalog({
      catalog: updatedCatalog,
    })).rejects.toEqual(expect.objectContaining({
      code: "content_origin_conflict",
    }));
  });

  it("marks absent bundled rows unavailable without mutating owned or historical facts", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const repository = createContentRepository(kernel);
    await repository.importAcceptedCatalog({ catalog });
    const removed = catalog.exercises.find(({ metricIdentity }) =>
      metricIdentity.profile === "load_reps"
    )!;
    const beforeHistory = await kernel.queryAll(
      `SELECT ss.id, ss.target_json, ss.observed_json, ss.revision,
              su.snapshot_json
       FROM session_sets ss
       LEFT JOIN session_undo_snapshots su
         ON su.completed_set_id = ss.id
       ORDER BY ss.id`,
    );

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO exercises
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           metric_profile, equipment, default_rest_seconds, revision)
         VALUES (?, NULL, 'bundled', ?, ?, ?, 'load_reps', ?, 90, 1)`,
        [
          removed.id,
          removed.source.namespace,
          removed.source.upstreamId,
          removed.canonicalName,
          removed.equipment.join(", "),
        ],
      );
      await transaction.execute(
        `INSERT INTO plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, revision)
         VALUES ('retained-catalog-reference', 'plan-day-copy', ?, 1, 90, 1)`,
        [removed.id],
      );
      await transaction.execute(
        `INSERT INTO exercise_library_entries
          (exercise_id, origin, canonical_name, exercise_type, movement_class,
           metric_profile, metric_contract_version,
           exercise_metric_generation, availability, revision)
         VALUES
           ('custom-owned', 'custom', 'Custom Owned', 'strength', 'compound',
            'load_reps', 1, 1, 'available', 7),
           ('copied-owned', 'copied', 'Copied Owned', 'strength', 'compound',
            'load_reps', 1, 1, 'available', 9)`,
      );
    });
    const ownedBefore = await kernel.queryAll(
      `SELECT * FROM exercise_library_entries
       WHERE origin IN ('custom', 'copied')
       ORDER BY exercise_id`,
    );
    const sourceBefore = await kernel.queryAll(
      `SELECT license, attribution, source_namespace, source_revision
       FROM exercise_catalog_sources
       WHERE exercise_id = ?`,
      [removed.id],
    );
    const nextCatalog = await nextAcceptedCatalog(catalog, removed.id);

    const result = await repository.importAcceptedCatalog({
      catalog: nextCatalog,
      expectedInstalled: {
        revision: catalog.metadata.revision,
        packSha256: catalog.acceptance.packSha256,
      },
    });

    expect(result).toEqual(expect.objectContaining({
      added: 0,
      newlyUnavailable: 1,
      revision: 2,
      updated: 0,
    }));
    expect(await kernel.queryAll(
      `SELECT availability FROM exercise_library_entries
       WHERE exercise_id = ?`,
      [removed.id],
    )).toEqual([{ availability: "unavailable" }]);
    expect(await kernel.queryAll(
      `SELECT availability, license, attribution, source_namespace,
              source_revision
       FROM exercise_catalog_sources
       WHERE exercise_id = ?`,
      [removed.id],
    )).toEqual([{
      availability: "unavailable",
      ...sourceBefore[0],
    }]);
    expect(await kernel.queryAll(
      `SELECT exercise_id FROM plan_day_exercises
       WHERE id = 'retained-catalog-reference'`,
    )).toEqual([{ exercise_id: removed.id }]);
    expect(await kernel.queryAll(
      `SELECT * FROM exercise_library_entries
       WHERE origin IN ('custom', 'copied')
       ORDER BY exercise_id`,
    )).toEqual(ownedBefore);
    expect(await kernel.queryAll(
      `SELECT ss.id, ss.target_json, ss.observed_json, ss.revision,
              su.snapshot_json
       FROM session_sets ss
       LEFT JOIN session_undo_snapshots su
         ON su.completed_set_id = ss.id
       ORDER BY ss.id`,
    )).toEqual(beforeHistory);
  });

  it("rolls source and search rows back when an import step fails", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const before = await catalogSourceSnapshot(kernel);
    const observer: ContentRepositoryTestObserver = {
      afterSearchTerms(exerciseId) {
        if (exerciseId === catalog.exercises[4]!.id) {
          throw new Error("injected_after_search_terms");
        }
      },
    };
    const repository = createContentRepository(kernel, observer);

    await expect(repository.importAcceptedCatalog({
      catalog,
      expectedInstalled: null,
    })).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
    });
    expect(await catalogSourceSnapshot(kernel)).toEqual(before);
  });

  it("fails closed when an unavailable source row is not bundled-owned", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const repository = createContentRepository(kernel);
    await repository.importAcceptedCatalog({ catalog });
    const removed = catalog.exercises.find(({ metricIdentity }) =>
      metricIdentity.profile === "load_reps"
    )!;
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE exercise_library_entries
         SET origin = 'custom'
         WHERE exercise_id = ?`,
        [removed.id],
      ),
    );
    const nextCatalog = await nextAcceptedCatalog(catalog, removed.id);
    const before = await catalogSourceSnapshot(kernel);

    await expect(repository.importAcceptedCatalog({
      catalog: nextCatalog,
    })).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
    });
    expect(await catalogSourceSnapshot(kernel)).toEqual(before);
  });

  it("serializes parallel upgrades so one stale expected revision conflicts", async () => {
    const kernel = await createRuntime();
    const catalog = await acceptedCatalog();
    const repository = createContentRepository(kernel);
    await repository.importAcceptedCatalog({ catalog });
    const removed = catalog.exercises.find(({ metricIdentity }) =>
      metricIdentity.profile === "load_reps"
    )!;
    const nextCatalog = await nextAcceptedCatalog(catalog, removed.id);
    const input = {
      catalog: nextCatalog,
      expectedInstalled: {
        revision: catalog.metadata.revision,
        packSha256: catalog.acceptance.packSha256,
      },
    } as const;

    const results = await Promise.allSettled([
      repository.importAcceptedCatalog(input),
      repository.importAcceptedCatalog(input),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({
          code: "content_revision_conflict",
          kind: "conflict",
        }),
      }),
    ]);
    expect(await kernel.queryAll(
      `SELECT revision, pack_sha256
       FROM content_pack_revisions
       WHERE namespace = ?
       ORDER BY revision`,
      [catalog.metadata.namespace],
    )).toEqual([
      {
        pack_sha256: catalog.acceptance.packSha256,
        revision: 1,
      },
      {
        pack_sha256: nextCatalog.acceptance.packSha256,
        revision: 2,
      },
    ]);
  });
});
