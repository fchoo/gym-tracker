import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createLogicalBackupRepository,
} from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import {
  createLogicalRestoreRepository,
} from "../../src/platform/sqlite/repositories/logicalRestoreRepository";
import {
  createExerciseSearchIndexRepository,
} from "../../src/platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createHistoryProjectionRepository,
} from "../../src/platform/sqlite/repositories/historyProjectionRepository";
import {
  createRestoreReconciliationRepository,
} from "../../src/platform/sqlite/repositories/restoreReconciliationRepository";
import {
  type ExerciseCatalog,
  parseExerciseCatalog,
} from "../../src/domains/content/catalog";
import {
  configureSqliteConnection,
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  createContentRepository,
} from "../../src/platform/sqlite/repositories/contentRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";

const repositoryRoot = join(__dirname, "../..");

class Result<Row extends Record<string, unknown>>
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

class Statement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly (null | number | string | Uint8Array)[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    }
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }

  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new Statement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> { this.database.close(); }
}

const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();
const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) {
    rmSync(directory, { force: true, recursive: true });
  }
  directories.clear();
});

async function open(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-clean-install-restore-"));
  directories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new Connection(new DatabaseSync(databasePath));
  const reader = new Connection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  const recoveryBackup: RecoveryBackupPort = {
    createAndValidate: async (request) => ({
      backupId: "clean-install-restore",
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    }),
  };
  await createMigrationRunner({
    databaseName: databasePath,
    kernel,
    migrations,
    recoveryBackup,
  }).run();
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

async function installApprovedCatalog(
  kernel: SqliteKernel,
  catalog: ExerciseCatalog,
): Promise<void> {
  await createContentRepository(kernel).importAcceptedCatalog({
    catalog,
    expectedInstalled: null,
  });
}

async function bundledAuthoritySnapshot(
  kernel: SqliteKernel,
  exerciseId: string,
): Promise<readonly Record<string, unknown>[]> {
  return kernel.queryAll(
    `SELECT
       source.exercise_id,
       revision.id AS content_revision_id,
       revision.namespace AS content_namespace,
       revision.revision AS content_revision,
       revision.source_commit,
       revision.pack_sha256,
       revision.manifest_sha256,
       revision.license_sha256,
       source.source_namespace,
       source.source_revision,
       source.upstream_id,
       source.availability AS source_availability,
       source.license,
       source.attribution,
       source.legacy_link_status,
       source.linked_upstream_id,
       library.origin AS library_origin,
       library.availability AS library_availability,
       exercise.origin AS exercise_origin,
       exercise.source_namespace AS exercise_source_namespace,
       exercise.upstream_id AS exercise_upstream_id
     FROM exercise_catalog_sources source
     JOIN content_pack_revisions revision
       ON revision.id = source.content_revision_id
     JOIN exercise_library_entries library
       ON library.exercise_id = source.exercise_id
     JOIN exercises exercise
       ON exercise.id = source.exercise_id
     WHERE source.exercise_id = ?`,
    [exerciseId],
  );
}

function extractTemplateXml(source: string, constantName: string): string {
  const pattern = new RegExp(
    "const " + constantName + " = `([\\s\\S]*?)`;",
    "u",
  );
  const match = pattern.exec(source);
  expect(match?.[1]).toBeDefined();
  return match![1]!;
}

function extractXmlSection(xml: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "u");
  const match = pattern.exec(xml);
  expect(match?.[1]).toBeDefined();
  return match![1]!;
}

function countDatabaseExcludes(xml: string): number {
  return [...xml.matchAll(/<exclude domain="database" path="\." \/>/gu)].length;
}

async function seedOwnedFacts(
  kernel: SqliteKernel,
  bundledExerciseId: string,
): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision)
       VALUES ('clean-owner-bench', NULL, 'custom', NULL, NULL, 'Clean owner bench',
               'load_reps', 1, 1, 'Barbell', 90, 1)`,
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version, exercise_metric_generation,
         availability, revision)
       VALUES ('clean-owner-bench', 'custom', 'Clean owner bench', 'strength',
               'compound', 'load_reps', 1, 1, 'available', 1)`,
    );
    await transaction.execute(
      `INSERT INTO exercise_search_terms
        (exercise_id, kind, ordinal, display_text, normalized_text)
       VALUES ('clean-owner-bench', 'canonical', 0, 'Clean owner bench',
               'clean owner bench')`,
    );
    await transaction.execute(
      `INSERT INTO exercise_owner_preferences
        (exercise_id, favorite, hidden, archived, revision, updated_at_ms)
       VALUES (?, 1, 0, 0, 1, 1)`,
      [bundledExerciseId],
    );
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision, creation_timezone_offset_minutes)
       VALUES ('clean-session', NULL, NULL, 'manual', 'completed',
               '2026-08-24', 'Asia/Singapore', 1724428800000, 1724429160000,
               1, 480)`,
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
         exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, default_rest_seconds, target_revision,
         status, revision)
       VALUES ('clean-session-exercise', 'clean-session', NULL,
               'clean-owner-bench', 0, 'Clean owner bench', 'load_reps', 1,
               1, 90, 1, 'completed', 1)`,
    );
    await transaction.execute(
      `INSERT INTO session_sets
        (id, session_exercise_id, set_kind, ordinal, target_load_grams,
         target_min_reps, target_max_reps, target_json, unit_json, rule_type,
         rule_version, metric_profile, metric_contract_version,
         exercise_metric_generation, observed_json, completed_at_ms, status,
         revision)
       VALUES ('clean-working-set', 'clean-session-exercise', 'working', 0,
               40000, 8, 10,
               '{"version":1,"profile":"load_reps","loadGrams":40000,"minReps":8,"maxReps":10,"incrementGrams":2500,"perSide":false}',
               '{}', 'load_reps', 1, 'load_reps', 1, 1,
               '{"version":1,"profile":"load_reps","loadGrams":40000,"reps":8,"source":"manual"}',
               1724429160000, 'completed', 1)`,
    );
    await transaction.execute(
      `UPDATE portability_restore_state
       SET state = 'rebuild_pending', updated_at_ms = 1
       WHERE id = 1`,
    );
  });
}

async function rebuild(kernel: SqliteKernel, failSearch = false) {
  const search = createExerciseSearchIndexRepository(kernel);
  return createRestoreReconciliationRepository(kernel, {
    history: createHistoryProjectionRepository(kernel),
    nowMs: () => 99,
    search: failSearch
      ? {
          rebuildSearchIndex: async () => { throw new Error("injected_clean_rebuild_failure"); },
          verifyParity: search.verifyParity,
        }
      : search,
  }).reconcileAndRebuild();
}

async function canonicalState(kernel: SqliteKernel): Promise<unknown> {
  const [source, search, history, availability] = await Promise.all([
    createLogicalBackupRepository(kernel).collect({
      createdAtMs: 1,
      snapshotId: "canonical-clean-install",
    }),
    createExerciseSearchIndexRepository(kernel).verifyParity(),
    createHistoryProjectionRepository(kernel).dumpProjectionRows(),
    kernel.queryAll(
      `SELECT exercise_id, availability
       FROM exercise_library_entries
       ORDER BY exercise_id`,
    ),
  ]);
  return { source, search, history, availability };
}

describe("clean install logical restore", () => {
  it("restores source facts and rebuilt derivatives onto a clean host database without database backup contamination", async () => {
    const catalog = await acceptedCatalog();
    const bundledExercise = catalog.exercises.find(({ source }) =>
      source.upstreamId !== null
    );
    expect(bundledExercise).toBeDefined();
    const bundledExerciseId = bundledExercise!.id;

    const original = await open();
    await installApprovedCatalog(original, catalog);
    const originalBundledAuthority = await bundledAuthoritySnapshot(
      original,
      bundledExerciseId,
    );
    expect(originalBundledAuthority).toEqual([{
      exercise_id: bundledExerciseId,
      content_revision_id: `${catalog.metadata.namespace}:${catalog.metadata.revision}`,
      content_namespace: catalog.metadata.namespace,
      content_revision: catalog.metadata.revision,
      source_commit: catalog.metadata.source.commit,
      pack_sha256: catalog.acceptance.packSha256,
      manifest_sha256: catalog.acceptance.manifestSha256,
      license_sha256: catalog.acceptance.licenseSha256,
      source_namespace: bundledExercise!.source.namespace,
      source_revision: bundledExercise!.source.sourceRevision,
      upstream_id: bundledExercise!.source.upstreamId,
      source_availability: "available",
      license: bundledExercise!.source.license,
      attribution: bundledExercise!.source.attribution,
      legacy_link_status: bundledExercise!.source.legacyLinkStatus,
      linked_upstream_id: bundledExercise!.source.linkedUpstreamId,
      library_origin: "bundled",
      library_availability: "available",
      exercise_origin: "bundled",
      exercise_source_namespace: bundledExercise!.source.namespace,
      exercise_upstream_id: bundledExercise!.source.upstreamId,
    }]);
    await seedOwnedFacts(original, bundledExerciseId);
    await expect(rebuild(original)).resolves.toMatchObject({
      outcome: "rebuilt",
      state: "ready",
    });
    const archive = await createLogicalBackupRepository(original).collect({
      createdAtMs: 1,
      snapshotId: "clean-install-archive",
    });
    expect(archive.tables.exercise_owner_preferences).toEqual([{
      archived: 0,
      exercise_id: bundledExerciseId,
      favorite: 1,
      hidden: 0,
      revision: 1,
      updated_at_ms: 1,
    }]);
    expect(archive.tables.exercises).toEqual([expect.objectContaining({
      id: "clean-owner-bench",
      origin: "custom",
    })]);
    expect(archive.tables.exercises).not.toContainEqual(
      expect.objectContaining({ id: bundledExerciseId }),
    );
    expect(archive.tables.exercise_library_entries).not.toContainEqual(
      expect.objectContaining({ exercise_id: bundledExerciseId }),
    );
    expect(archive.catalogReferences).toContainEqual({
      kind: "exercise",
      sourceNamespace: bundledExercise!.source.namespace,
      sourceRevision: bundledExercise!.source.sourceRevision,
      upstreamId: bundledExercise!.source.upstreamId!,
    });
    const expected = await canonicalState(original);

    const clean = await open();
    await installApprovedCatalog(clean, catalog);
    const cleanBundledAuthorityBeforeRestore = await bundledAuthoritySnapshot(
      clean,
      bundledExerciseId,
    );
    expect(cleanBundledAuthorityBeforeRestore).toEqual(originalBundledAuthority);
    await expect(createLogicalBackupRepository(clean).collect({
      createdAtMs: 1,
      snapshotId: "clean-install-empty-owner-state",
    })).resolves.toEqual({
      version: 1,
      snapshotId: "clean-install-empty-owner-state",
      createdAtMs: 1,
      schemaVersion: 16,
      manifest: {
        catalogReferenceCount: 0,
        rowCounts: expect.any(Object),
        totalRows: 0,
      },
      tables: expect.any(Object),
      catalogReferences: [],
    });
    const cleanOwnerState = await createLogicalBackupRepository(clean).collect({
      createdAtMs: 1,
      snapshotId: "clean-install-empty-owner-state-verify",
    });
    expect(
      Object.values(cleanOwnerState.manifest.rowCounts).every((count) => count === 0),
    ).toBe(true);
    await expect(createLogicalRestoreRepository(clean, { nowMs: () => 2 })
      .restore(archive)).resolves.toEqual({ state: "rebuild_pending" });
    await expect(rebuild(clean, true)).resolves.toMatchObject({
      outcome: "retryable_failure",
      state: "rebuild_pending",
    });
    await expect(rebuild(clean)).resolves.toMatchObject({
      outcome: "rebuilt",
      state: "ready",
    });
    await expect(bundledAuthoritySnapshot(clean, bundledExerciseId))
      .resolves.toEqual(cleanBundledAuthorityBeforeRestore);
    await expect(canonicalState(clean)).resolves.toEqual(expected);

    const backupPlugin = readFileSync(
      join(process.cwd(), "plugins/withAndroidBackupRules.ts"),
      "utf8",
    );
    const fullBackupXml = extractTemplateXml(backupPlugin, "fullBackupContent");
    const dataExtractionXml = extractTemplateXml(
      backupPlugin,
      "dataExtractionRules",
    );
    const cloudBackupXml = extractXmlSection(dataExtractionXml, "cloud-backup");
    const deviceTransferXml = extractXmlSection(
      dataExtractionXml,
      "device-transfer",
    );

    expect(fullBackupXml).toContain("<full-backup-content>");
    expect(cloudBackupXml).toContain('<exclude domain="database" path="." />');
    expect(deviceTransferXml).toContain('<exclude domain="database" path="." />');
    expect(countDatabaseExcludes(fullBackupXml)).toBe(1);
    expect(countDatabaseExcludes(cloudBackupXml)).toBe(1);
    expect(countDatabaseExcludes(deviceTransferXml)).toBe(1);
  });
});
