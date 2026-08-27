import type {
  CatalogExercise,
  ContentUpdateResult,
  ExerciseCatalog,
} from "../../../domains/content/catalog";
import {
  normalizeExerciseSearchTextV1,
} from "../../../domains/content/catalog";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";

export type InstalledContentRevision = Readonly<{
  revision: number;
  packSha256: string;
}>;

export type ImportAcceptedCatalogInput = Readonly<{
  catalog: ExerciseCatalog;
  expectedInstalled?: InstalledContentRevision | null;
}>;

export interface ContentRepository {
  importAcceptedCatalog(
    input: ImportAcceptedCatalogInput,
  ): Promise<ContentUpdateResult>;
}

export type ContentRepositoryTestObserver = Readonly<{
  afterSearchTerms?(exerciseId: string): void;
}>;

export type ContentImportErrorCode =
  | "content_origin_conflict"
  | "content_revision_conflict";

export class ContentImportError extends Error {
  readonly kind = "conflict" as const;
  readonly retryable = false;
  readonly correlationCode = "GT-CONTENT01" as const;

  constructor(readonly code: ContentImportErrorCode) {
    super(code);
    this.name = "ContentImportError";
  }
}

type InstalledRow = Readonly<{
  revision: number;
  pack_sha256: string;
}>;

type LibraryRow = Readonly<{
  exercise_id: string;
  origin: "bundled" | "custom" | "copied";
  canonical_name: string;
  exercise_type: string;
  movement_class: string;
  metric_profile: string;
  metric_contract_version: number;
  exercise_metric_generation: number;
  availability: "available" | "unavailable";
}>;

type SourceRow = Readonly<{
  exercise_id: string;
  content_namespace: string;
  source_namespace: string;
  source_revision: string;
  upstream_id: string | null;
  canonical_name: string;
  exercise_type: string;
  movement_class: string;
  metric_profile: string;
  metric_contract_version: number;
  exercise_metric_generation: number;
  availability: "available" | "unavailable";
  license: string;
  attribution: string;
  legacy_link_status: string;
  linked_upstream_id: string | null;
}>;

type AliasRow = Readonly<{
  exercise_id: string;
  ordinal: number;
  display_text: string;
  normalized_text: string;
}>;

type TaxonomyRow = Readonly<{
  exercise_id: string;
  kind: string;
  relation: string;
  ordinal: number;
  slug: string;
}>;

type StagedExercise = Readonly<{
  exercise: CatalogExercise;
  aliases: readonly Readonly<{
    ordinal: number;
    displayText: string;
    normalizedText: string;
  }>[];
  taxonomy: readonly Readonly<{
    kind: "exercise_type" | "movement_class" | "muscle" | "equipment";
    slug: string;
    relation: "type" | "movement" | "primary" | "secondary" | "equipment";
    ordinal: number;
  }>[];
  searchTerms: readonly Readonly<{
    kind: "canonical" | "alias";
    ordinal: number;
    displayText: string;
    normalizedText: string;
  }>[];
}>;

type ImportClassification = Readonly<{
  added: readonly string[];
  updated: readonly string[];
  newlyUnavailable: readonly string[];
}>;

type ImportOutcome =
  | Readonly<{ kind: "conflict"; code: ContentImportErrorCode }>
  | Readonly<{ kind: "result"; result: ContentUpdateResult }>;

const WORKOUT_EXERCISE_DEFAULT_REST_SECONDS = 90;

function contentRevisionId(catalog: ExerciseCatalog): string {
  return `${catalog.metadata.namespace}:${catalog.metadata.revision}`;
}

function workoutProjectionEquipment(exercise: CatalogExercise): string {
  const equipment = exercise.equipment.join(", ");
  return equipment.length === 0 ? "Unspecified" : equipment;
}

function stageExercise(exercise: CatalogExercise): StagedExercise {
  const aliases = exercise.aliases.map((displayText, ordinal) => ({
    ordinal,
    displayText,
    normalizedText: normalizeExerciseSearchTextV1(displayText),
  }));
  const taxonomy: StagedExercise["taxonomy"][number][] = [
    {
      kind: "exercise_type",
      slug: exercise.exerciseType,
      relation: "type",
      ordinal: 0,
    },
    {
      kind: "movement_class",
      slug: exercise.movementClass,
      relation: "movement",
      ordinal: 0,
    },
    ...exercise.primaryMuscles.map((slug, ordinal) => ({
      kind: "muscle" as const,
      slug,
      relation: "primary" as const,
      ordinal,
    })),
    ...exercise.secondaryMuscles.map((slug, ordinal) => ({
      kind: "muscle" as const,
      slug,
      relation: "secondary" as const,
      ordinal,
    })),
    ...exercise.equipment.map((slug, ordinal) => ({
      kind: "equipment" as const,
      slug,
      relation: "equipment" as const,
      ordinal,
    })),
  ];
  return {
    exercise,
    aliases,
    taxonomy,
    searchTerms: [
      {
        kind: "canonical",
        ordinal: 0,
        displayText: exercise.canonicalName,
        normalizedText: normalizeExerciseSearchTextV1(exercise.canonicalName),
      },
      ...aliases.map((alias) => ({
        kind: "alias" as const,
        ...alias,
      })),
    ],
  };
}

function stageCatalog(catalog: ExerciseCatalog): readonly StagedExercise[] {
  return catalog.exercises.map(stageExercise);
}

function arrayMap<Row extends { exercise_id: string }>(
  rows: readonly Row[],
): ReadonlyMap<string, readonly Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const values = grouped.get(row.exercise_id) ?? [];
    values.push(row);
    grouped.set(row.exercise_id, values);
  }
  return grouped;
}

function sourceMatches(source: SourceRow, exercise: CatalogExercise): boolean {
  return JSON.stringify([
    source.source_namespace,
    source.source_revision,
    source.upstream_id,
    source.canonical_name,
    source.exercise_type,
    source.movement_class,
    source.metric_profile,
    source.metric_contract_version,
    source.exercise_metric_generation,
    source.availability,
    source.license,
    source.attribution,
    source.legacy_link_status,
    source.linked_upstream_id,
  ]) === JSON.stringify([
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
  ]);
}

function libraryMatches(
  library: LibraryRow,
  exercise: CatalogExercise,
): boolean {
  return JSON.stringify([
    library.origin,
    library.canonical_name,
    library.exercise_type,
    library.movement_class,
    library.metric_profile,
    library.metric_contract_version,
    library.exercise_metric_generation,
    library.availability,
  ]) === JSON.stringify([
    "bundled",
    exercise.canonicalName,
    exercise.exerciseType,
    exercise.movementClass,
    exercise.metricIdentity.profile,
    exercise.metricIdentity.contractVersion,
    exercise.metricIdentity.exerciseMetricGeneration,
    "available",
  ]);
}

function aliasesMatch(
  existing: readonly AliasRow[],
  staged: StagedExercise,
): boolean {
  return JSON.stringify(existing) === JSON.stringify(
    staged.aliases.map((alias) => ({
      exercise_id: staged.exercise.id,
      ordinal: alias.ordinal,
      display_text: alias.displayText,
      normalized_text: alias.normalizedText,
    })),
  );
}

function taxonomyMatches(
  existing: readonly TaxonomyRow[],
  staged: StagedExercise,
): boolean {
  const existingKeys = existing.map((row) => [
    row.kind,
    row.relation,
    row.ordinal,
    row.slug,
  ].join(":")).sort();
  const stagedKeys = staged.taxonomy.map((row) => [
    row.kind,
    row.relation,
    row.ordinal,
    row.slug,
  ].join(":")).sort();
  return existingKeys.length === stagedKeys.length
    && existingKeys.every((key, index) => key === stagedKeys[index]);
}

function installedMatchesExpected(
  installed: InstalledRow | undefined,
  expected: InstalledContentRevision | null,
): boolean {
  if (expected === null) {
    return installed === undefined;
  }
  return installed?.revision === expected.revision
    && installed.pack_sha256 === expected.packSha256;
}

async function readInstalled(
  transaction: SqliteTransactionExecutor,
  namespace: string,
): Promise<InstalledRow | undefined> {
  const [installed] = await transaction.queryAll<InstalledRow>(
    `SELECT revision, pack_sha256
     FROM content_pack_revisions
     WHERE namespace = ?
     ORDER BY revision DESC
     LIMIT 1`,
    [namespace],
  );
  return installed;
}

async function classifyImport(
  transaction: SqliteTransactionExecutor,
  catalog: ExerciseCatalog,
  staged: readonly StagedExercise[],
): Promise<ImportClassification | ContentImportErrorCode> {
  const [libraryRows, sourceRows, aliasRows, taxonomyRows] = await Promise.all([
    transaction.queryAll<LibraryRow>(
      `SELECT exercise_id, origin, canonical_name, exercise_type,
              movement_class, metric_profile, metric_contract_version,
              exercise_metric_generation, availability
       FROM exercise_library_entries`,
    ),
    transaction.queryAll<SourceRow>(
      `SELECT ecs.exercise_id, cpr.namespace AS content_namespace,
              ecs.source_namespace, ecs.source_revision, ecs.upstream_id,
              ecs.canonical_name, ecs.exercise_type, ecs.movement_class,
              ecs.metric_profile, ecs.metric_contract_version,
              ecs.exercise_metric_generation, ecs.availability, ecs.license,
              ecs.attribution, ecs.legacy_link_status,
              ecs.linked_upstream_id
       FROM exercise_catalog_sources ecs
       JOIN content_pack_revisions cpr ON cpr.id = ecs.content_revision_id`,
    ),
    transaction.queryAll<AliasRow>(
      `SELECT exercise_id, ordinal, display_text, normalized_text
       FROM exercise_aliases
       ORDER BY exercise_id, ordinal`,
    ),
    transaction.queryAll<TaxonomyRow>(
      `SELECT exercise_id, kind, relation, ordinal, slug
       FROM exercise_taxonomy
       ORDER BY exercise_id, kind, relation, ordinal`,
    ),
  ]);
  const libraryById = new Map(
    libraryRows.map((row) => [row.exercise_id, row]),
  );
  const sourceById = new Map(
    sourceRows.map((row) => [row.exercise_id, row]),
  );
  const sourceIdentityByKey = new Map(
    sourceRows
      .filter(({ upstream_id }) => upstream_id !== null)
      .map((row) => [
        `${row.source_namespace}:${row.upstream_id}`,
        row.exercise_id,
      ]),
  );
  const aliasesById = arrayMap(aliasRows);
  const taxonomyById = arrayMap(taxonomyRows);
  const incomingIds = new Set(staged.map(({ exercise }) => exercise.id));
  const added: string[] = [];
  const updated: string[] = [];

  for (const row of staged) {
    const library = libraryById.get(row.exercise.id);
    const source = sourceById.get(row.exercise.id);
    const sourceIdentityExerciseId = row.exercise.source.upstreamId === null
      ? undefined
      : sourceIdentityByKey.get([
          row.exercise.source.namespace,
          row.exercise.source.upstreamId,
        ].join(":"));
    if (
      library !== undefined
      && library.origin !== "bundled"
    ) {
      return "content_origin_conflict";
    }
    if (
      sourceIdentityExerciseId !== undefined
      && sourceIdentityExerciseId !== row.exercise.id
    ) {
      return "content_origin_conflict";
    }
    if (
      source !== undefined
      && source.content_namespace !== catalog.metadata.namespace
    ) {
      return "content_origin_conflict";
    }
    if (source === undefined) {
      added.push(row.exercise.id);
      continue;
    }
    if (
      library === undefined
      || !libraryMatches(library, row.exercise)
      || !sourceMatches(source, row.exercise)
      || !aliasesMatch(aliasesById.get(row.exercise.id) ?? [], row)
      || !taxonomyMatches(taxonomyById.get(row.exercise.id)!, row)
    ) {
      updated.push(row.exercise.id);
    }
  }

  const newlyUnavailable = sourceRows
    .filter((source) =>
      source.content_namespace === catalog.metadata.namespace
      && source.availability === "available"
      && !incomingIds.has(source.exercise_id)
    )
    .map(({ exercise_id }) => exercise_id)
    .sort();
  return { added, updated, newlyUnavailable };
}

async function upsertContentRevision(
  transaction: SqliteTransactionExecutor,
  catalog: ExerciseCatalog,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO content_pack_revisions
      (id, namespace, revision, source_commit, pack_sha256,
       manifest_sha256, license_sha256, review_status, accepted_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?)`,
    [
      contentRevisionId(catalog),
      catalog.metadata.namespace,
      catalog.metadata.revision,
      catalog.metadata.source.commit,
      catalog.acceptance.packSha256,
      catalog.acceptance.manifestSha256,
      catalog.acceptance.licenseSha256,
      Date.parse(catalog.acceptance.reviewedAt),
    ],
  );
}

async function markUnavailable(
  transaction: SqliteTransactionExecutor,
  exerciseId: string,
): Promise<void> {
  const library = await transaction.execute(
    `UPDATE exercise_library_entries
     SET availability = 'unavailable', revision = revision + 1
     WHERE exercise_id = ? AND origin = 'bundled'`,
    [exerciseId],
  );
  const source = await transaction.execute(
    `UPDATE exercise_catalog_sources
     SET availability = 'unavailable', revision = revision + 1
     WHERE exercise_id = ?`,
    [exerciseId],
  );
  if (library.changes !== 1 || source.changes !== 1) {
    throw new Error("content_unavailable_update_failed");
  }
}

async function upsertLibraryEntry(
  transaction: SqliteTransactionExecutor,
  catalog: ExerciseCatalog,
  exercise: CatalogExercise,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO exercise_library_entries
      (exercise_id, origin, canonical_name, exercise_type, movement_class,
       metric_profile, metric_contract_version, exercise_metric_generation,
       availability, revision)
     VALUES (?, 'bundled', ?, ?, ?, ?, ?, ?, 'available', ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       canonical_name = excluded.canonical_name,
       exercise_type = excluded.exercise_type,
       movement_class = excluded.movement_class,
       metric_profile = excluded.metric_profile,
       metric_contract_version = excluded.metric_contract_version,
       exercise_metric_generation = excluded.exercise_metric_generation,
       availability = excluded.availability,
       revision = excluded.revision
     WHERE exercise_library_entries.origin = 'bundled'`,
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
}

async function supportsWorkoutExerciseProjection(
  transaction: SqliteTransactionExecutor,
): Promise<boolean> {
  const support = await transaction.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM pragma_table_info('exercises')
     WHERE name IN (
       'metric_contract_version',
       'exercise_metric_generation'
     )`,
  );
  return support[0]!.count === 2;
}

async function ensureWorkoutExerciseProjection(
  transaction: SqliteTransactionExecutor,
  catalog: ExerciseCatalog,
  exercise: CatalogExercise,
): Promise<void> {
  const inserted = await transaction.execute(
    `INSERT INTO exercises
      (id, content_pack_id, origin, source_namespace, upstream_id, name,
       metric_profile, metric_contract_version, exercise_metric_generation,
       equipment, default_rest_seconds, revision)
     VALUES (?, NULL, 'bundled', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [
      exercise.id,
      exercise.source.namespace,
      exercise.source.upstreamId ?? exercise.id,
      exercise.canonicalName,
      exercise.metricIdentity.profile,
      exercise.metricIdentity.contractVersion,
      exercise.metricIdentity.exerciseMetricGeneration,
      workoutProjectionEquipment(exercise),
      WORKOUT_EXERCISE_DEFAULT_REST_SECONDS,
      catalog.metadata.revision,
    ],
  );
  if (inserted.changes === 1) {
    return;
  }
  const [existing] = await transaction.queryAll<{
    origin: string;
    metric_profile: string;
    metric_contract_version: number;
    exercise_metric_generation: number;
  }>(
    `SELECT origin, metric_profile, metric_contract_version,
            exercise_metric_generation
     FROM exercises
     WHERE id = ?`,
    [exercise.id],
  );
  const expected = {
    origin: "bundled",
    metric_profile: exercise.metricIdentity.profile,
    metric_contract_version: exercise.metricIdentity.contractVersion,
    exercise_metric_generation:
      exercise.metricIdentity.exerciseMetricGeneration,
  };
  if (JSON.stringify(existing) !== JSON.stringify(expected)) {
    throw new Error("content_workout_projection_conflict");
  }
  await transaction.execute(
    `UPDATE exercises
     SET source_namespace = ?,
         upstream_id = ?,
         name = ?,
         equipment = ?,
         default_rest_seconds = CASE
           WHEN default_rest_seconds = 0 THEN ?
           ELSE default_rest_seconds
         END,
         revision = ?
     WHERE id = ?`,
    [
      exercise.source.namespace,
      exercise.source.upstreamId ?? exercise.id,
      exercise.canonicalName,
      workoutProjectionEquipment(exercise),
      WORKOUT_EXERCISE_DEFAULT_REST_SECONDS,
      catalog.metadata.revision,
      exercise.id,
    ],
  );
}

async function syncWorkoutExerciseProjection(
  transaction: SqliteTransactionExecutor,
  catalog: ExerciseCatalog,
  staged: readonly StagedExercise[],
): Promise<void> {
  if (!await supportsWorkoutExerciseProjection(transaction)) {
    return;
  }
  for (const row of staged) {
    await ensureWorkoutExerciseProjection(
      transaction,
      catalog,
      row.exercise,
    );
  }
}

async function upsertCatalogSource(
  transaction: SqliteTransactionExecutor,
  catalog: ExerciseCatalog,
  exercise: CatalogExercise,
): Promise<void> {
  await transaction.execute(
    `INSERT INTO exercise_catalog_sources
      (exercise_id, content_revision_id, source_namespace, source_revision,
       upstream_id, canonical_name, exercise_type, movement_class,
       metric_profile, metric_contract_version, exercise_metric_generation,
       availability, license, attribution, legacy_link_status,
       linked_upstream_id, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       content_revision_id = excluded.content_revision_id,
       source_namespace = excluded.source_namespace,
       source_revision = excluded.source_revision,
       upstream_id = excluded.upstream_id,
       canonical_name = excluded.canonical_name,
       exercise_type = excluded.exercise_type,
       movement_class = excluded.movement_class,
       metric_profile = excluded.metric_profile,
       metric_contract_version = excluded.metric_contract_version,
       exercise_metric_generation = excluded.exercise_metric_generation,
       availability = excluded.availability,
       license = excluded.license,
       attribution = excluded.attribution,
       legacy_link_status = excluded.legacy_link_status,
       linked_upstream_id = excluded.linked_upstream_id,
       revision = excluded.revision`,
    [
      exercise.id,
      contentRevisionId(catalog),
      exercise.source.namespace,
      exercise.source.sourceRevision,
      exercise.source.upstreamId,
      exercise.canonicalName,
      exercise.exerciseType,
      exercise.movementClass,
      exercise.metricIdentity.profile,
      exercise.metricIdentity.contractVersion,
      exercise.metricIdentity.exerciseMetricGeneration,
      exercise.source.license,
      exercise.source.attribution,
      exercise.source.legacyLinkStatus,
      exercise.source.linkedUpstreamId,
      catalog.metadata.revision,
    ],
  );
}

async function replaceTaxonomy(
  transaction: SqliteTransactionExecutor,
  staged: StagedExercise,
): Promise<void> {
  await transaction.execute(
    "DELETE FROM exercise_taxonomy WHERE exercise_id = ?",
    [staged.exercise.id],
  );
  for (const taxonomy of staged.taxonomy) {
    await transaction.execute(
      `INSERT INTO taxonomy_terms (kind, slug, display_name)
       VALUES (?, ?, ?)
       ON CONFLICT(kind, slug) DO NOTHING`,
      [taxonomy.kind, taxonomy.slug, taxonomy.slug],
    );
    await transaction.execute(
      `INSERT INTO exercise_taxonomy
        (exercise_id, kind, slug, relation, ordinal)
       VALUES (?, ?, ?, ?, ?)`,
      [
        staged.exercise.id,
        taxonomy.kind,
        taxonomy.slug,
        taxonomy.relation,
        taxonomy.ordinal,
      ],
    );
  }
}

async function syncAliases(
  transaction: SqliteTransactionExecutor,
  staged: StagedExercise,
): Promise<void> {
  for (const alias of staged.aliases) {
    await transaction.execute(
      `INSERT INTO exercise_aliases
        (exercise_id, ordinal, display_text, normalized_text)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(exercise_id, ordinal) DO UPDATE SET
         display_text = excluded.display_text,
         normalized_text = excluded.normalized_text`,
      [
        staged.exercise.id,
        alias.ordinal,
        alias.displayText,
        alias.normalizedText,
      ],
    );
  }
  await transaction.execute(
    `DELETE FROM exercise_aliases
     WHERE exercise_id = ? AND ordinal >= ?`,
    [staged.exercise.id, staged.aliases.length],
  );
}

async function syncSearchTerms(
  transaction: SqliteTransactionExecutor,
  staged: StagedExercise,
): Promise<void> {
  for (const term of staged.searchTerms) {
    await transaction.execute(
      `INSERT INTO exercise_search_terms
        (exercise_id, kind, ordinal, display_text, normalized_text)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(exercise_id, kind, ordinal) DO UPDATE SET
         display_text = excluded.display_text,
         normalized_text = excluded.normalized_text`,
      [
        staged.exercise.id,
        term.kind,
        term.ordinal,
        term.displayText,
        term.normalizedText,
      ],
    );
  }
  await transaction.execute(
    `DELETE FROM exercise_search_terms
     WHERE exercise_id = ? AND kind = 'alias' AND ordinal >= ?`,
    [staged.exercise.id, staged.aliases.length],
  );
}

async function writeCatalog(
  transaction: SqliteTransactionExecutor,
  catalog: ExerciseCatalog,
  staged: readonly StagedExercise[],
  classification: ImportClassification,
  observer: ContentRepositoryTestObserver,
): Promise<void> {
  await upsertContentRevision(transaction, catalog);
  for (const exerciseId of classification.newlyUnavailable) {
    await markUnavailable(transaction, exerciseId);
  }
  for (const row of staged) {
    await upsertLibraryEntry(transaction, catalog, row.exercise);
    await upsertCatalogSource(transaction, catalog, row.exercise);
    await syncAliases(transaction, row);
    await replaceTaxonomy(transaction, row);
    await syncSearchTerms(transaction, row);
    observer.afterSearchTerms?.(row.exercise.id);
  }
  await syncWorkoutExerciseProjection(transaction, catalog, staged);
}

function updateResult(
  catalog: ExerciseCatalog,
  classification: ImportClassification,
): ContentUpdateResult {
  const changedExerciseIds = [
    ...classification.added,
    ...classification.updated,
    ...classification.newlyUnavailable,
  ].sort();
  return {
    outcome: "committed",
    revision: catalog.metadata.revision,
    packSha256: catalog.acceptance.packSha256,
    added: classification.added.length,
    updated: classification.updated.length,
    newlyUnavailable: classification.newlyUnavailable.length,
    invalidationScopes: [
      { scope: "exercise-library" },
      ...changedExerciseIds.map((exerciseId) => ({
        scope: "exercise-detail" as const,
        exerciseId,
      })),
    ],
  };
}

export function createContentRepository(
  kernel: SqliteKernel,
  observer: ContentRepositoryTestObserver = {},
): ContentRepository {
  return Object.freeze({
    async importAcceptedCatalog(
      input: ImportAcceptedCatalogInput,
    ): Promise<ContentUpdateResult> {
      const staged = stageCatalog(input.catalog);
      const outcome: ImportOutcome = await kernel.write(async (transaction) => {
        const installed = await readInstalled(
          transaction,
          input.catalog.metadata.namespace,
        );
        if (
          input.expectedInstalled !== undefined
          && !installedMatchesExpected(installed, input.expectedInstalled)
        ) {
          return {
            kind: "conflict",
            code: "content_revision_conflict",
          };
        }
        if (installed !== undefined) {
          if (
            installed.revision === input.catalog.metadata.revision
            && installed.pack_sha256 === input.catalog.acceptance.packSha256
          ) {
            await syncWorkoutExerciseProjection(
              transaction,
              input.catalog,
              staged,
            );
            return {
              kind: "result",
              result: {
                outcome: "committed",
                revision: input.catalog.metadata.revision,
                packSha256: input.catalog.acceptance.packSha256,
                added: 0,
                updated: 0,
                newlyUnavailable: 0,
                invalidationScopes: [],
              },
            };
          }
          if (input.catalog.metadata.revision <= installed.revision) {
            return {
              kind: "conflict",
              code: "content_revision_conflict",
            };
          }
        }

        const classification = await classifyImport(
          transaction,
          input.catalog,
          staged,
        );
        if (typeof classification === "string") {
          return { kind: "conflict", code: classification };
        }
        await writeCatalog(
          transaction,
          input.catalog,
          staged,
          classification,
          observer,
        );
        return {
          kind: "result",
          result: updateResult(input.catalog, classification),
        };
      });
      if (outcome.kind === "conflict") {
        throw new ContentImportError(outcome.code);
      }
      return outcome.result;
    },
  });
}
