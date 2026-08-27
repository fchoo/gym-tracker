import type {
  Migration,
} from "../migrationRunner";

export const CONTENT_LIBRARY_SCHEMA_STATEMENTS = [
  `CREATE TABLE content_pack_revisions (
    id TEXT PRIMARY KEY NOT NULL,
    namespace TEXT NOT NULL CHECK(length(trim(namespace)) BETWEEN 1 AND 120),
    revision INTEGER NOT NULL CHECK(revision >= 1),
    source_commit TEXT NOT NULL CHECK(
      length(source_commit) BETWEEN 1 AND 120
    ),
    pack_sha256 TEXT NOT NULL CHECK(
      length(pack_sha256) = 64
      AND pack_sha256 NOT GLOB '*[^a-f0-9]*'
    ),
    manifest_sha256 TEXT NOT NULL CHECK(
      length(manifest_sha256) = 64
      AND manifest_sha256 NOT GLOB '*[^a-f0-9]*'
    ),
    license_sha256 TEXT NOT NULL CHECK(
      length(license_sha256) = 64
      AND license_sha256 NOT GLOB '*[^a-f0-9]*'
    ),
    review_status TEXT NOT NULL CHECK(review_status = 'accepted'),
    accepted_at_ms INTEGER NOT NULL CHECK(accepted_at_ms >= 0),
    UNIQUE(namespace, revision),
    UNIQUE(namespace, pack_sha256)
  ) STRICT`,
  `CREATE TABLE exercise_library_entries (
    exercise_id TEXT PRIMARY KEY NOT NULL,
    origin TEXT NOT NULL CHECK(origin IN ('bundled', 'custom', 'copied')),
    canonical_name TEXT NOT NULL CHECK(
      length(trim(canonical_name)) BETWEEN 1 AND 120
    ),
    exercise_type TEXT NOT NULL CHECK(
      exercise_type IN (
        'strength',
        'olympic_weightlifting',
        'stretching',
        'cardio',
        'plyometrics',
        'strongman',
        'powerlifting',
        'unspecified'
      )
    ),
    movement_class TEXT NOT NULL CHECK(
      movement_class IN ('compound', 'isolation', 'unspecified')
    ),
    metric_profile TEXT NOT NULL CHECK(
      metric_profile IN (
        'load_reps',
        'bodyweight_reps',
        'added_load_reps',
        'assisted_reps',
        'timed_hold',
        'fixed_distance',
        'fixed_time',
        'intervals',
        'unscored'
      )
    ),
    metric_contract_version INTEGER NOT NULL CHECK(
      metric_contract_version >= 1
    ),
    exercise_metric_generation INTEGER NOT NULL CHECK(
      exercise_metric_generation >= 1
    ),
    availability TEXT NOT NULL CHECK(
      availability IN ('available', 'unavailable')
    ),
    revision INTEGER NOT NULL CHECK(revision >= 0)
  ) STRICT`,
  `INSERT INTO exercise_library_entries
    (exercise_id, origin, canonical_name, exercise_type, movement_class,
     metric_profile, metric_contract_version, exercise_metric_generation,
     availability, revision)
   SELECT id, origin, name, 'unspecified', 'unspecified', metric_profile,
          1, 1, 'available', revision
   FROM exercises`,
  `CREATE TABLE exercise_catalog_sources (
    exercise_id TEXT PRIMARY KEY NOT NULL
      REFERENCES exercise_library_entries(exercise_id) ON DELETE RESTRICT,
    content_revision_id TEXT NOT NULL
      REFERENCES content_pack_revisions(id) ON DELETE RESTRICT,
    source_namespace TEXT NOT NULL CHECK(
      length(trim(source_namespace)) BETWEEN 1 AND 120
    ),
    source_revision TEXT NOT NULL CHECK(
      length(trim(source_revision)) BETWEEN 1 AND 120
    ),
    upstream_id TEXT,
    canonical_name TEXT NOT NULL CHECK(
      length(trim(canonical_name)) BETWEEN 1 AND 120
    ),
    exercise_type TEXT NOT NULL CHECK(
      exercise_type IN (
        'strength',
        'olympic_weightlifting',
        'stretching',
        'cardio',
        'plyometrics',
        'strongman',
        'powerlifting'
      )
    ),
    movement_class TEXT NOT NULL CHECK(
      movement_class IN ('compound', 'isolation')
    ),
    metric_profile TEXT NOT NULL CHECK(
      metric_profile IN (
        'load_reps',
        'bodyweight_reps',
        'added_load_reps',
        'assisted_reps',
        'timed_hold',
        'fixed_distance',
        'fixed_time',
        'intervals',
        'unscored'
      )
    ),
    metric_contract_version INTEGER NOT NULL CHECK(
      metric_contract_version >= 1
    ),
    exercise_metric_generation INTEGER NOT NULL CHECK(
      exercise_metric_generation >= 1
    ),
    availability TEXT NOT NULL CHECK(
      availability IN ('available', 'unavailable')
    ),
    license TEXT NOT NULL CHECK(length(trim(license)) BETWEEN 1 AND 120),
    attribution TEXT NOT NULL CHECK(
      length(trim(attribution)) BETWEEN 1 AND 240
    ),
    legacy_link_status TEXT NOT NULL CHECK(
      legacy_link_status IN (
        'not_applicable',
        'link_candidate',
        'preserve_original'
      )
    ),
    linked_upstream_id TEXT,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    CHECK(
      (
        source_namespace = 'gym-tracker.original'
        AND upstream_id IS NULL
        AND legacy_link_status IN ('link_candidate', 'preserve_original')
        AND (
          (legacy_link_status = 'link_candidate'
           AND linked_upstream_id IS NOT NULL)
          OR
          (legacy_link_status = 'preserve_original'
           AND linked_upstream_id IS NULL)
        )
      )
      OR
      (
        source_namespace <> 'gym-tracker.original'
        AND upstream_id IS NOT NULL
        AND legacy_link_status = 'not_applicable'
        AND linked_upstream_id IS NULL
      )
    ),
    UNIQUE(source_namespace, upstream_id)
  ) STRICT`,
  `CREATE TABLE exercise_aliases (
    id INTEGER PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL
      REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    display_text TEXT NOT NULL CHECK(
      length(trim(display_text)) BETWEEN 1 AND 120
    ),
    normalized_text TEXT NOT NULL CHECK(
      length(trim(normalized_text)) BETWEEN 1 AND 120
    ),
    UNIQUE(exercise_id, ordinal),
    UNIQUE(exercise_id, normalized_text)
  ) STRICT`,
  `CREATE TABLE taxonomy_terms (
    kind TEXT NOT NULL CHECK(
      kind IN ('exercise_type', 'movement_class', 'muscle', 'equipment')
    ),
    slug TEXT NOT NULL CHECK(
      length(slug) BETWEEN 1 AND 80
      AND slug = lower(slug)
      AND slug NOT GLOB '*[^a-z0-9_-]*'
    ),
    display_name TEXT NOT NULL CHECK(
      length(trim(display_name)) BETWEEN 1 AND 120
    ),
    PRIMARY KEY(kind, slug)
  ) STRICT, WITHOUT ROWID`,
  `CREATE TABLE exercise_taxonomy (
    exercise_id TEXT NOT NULL
      REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    slug TEXT NOT NULL,
    relation TEXT NOT NULL CHECK(
      relation IN ('type', 'movement', 'primary', 'secondary', 'equipment')
    ),
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    PRIMARY KEY(exercise_id, kind, relation, ordinal),
    UNIQUE(exercise_id, kind, slug),
    FOREIGN KEY(kind, slug) REFERENCES taxonomy_terms(kind, slug)
      ON DELETE RESTRICT,
    CHECK(
      (kind = 'exercise_type' AND relation = 'type')
      OR (kind = 'movement_class' AND relation = 'movement')
      OR (kind = 'muscle' AND relation IN ('primary', 'secondary'))
      OR (kind = 'equipment' AND relation = 'equipment')
    )
  ) STRICT, WITHOUT ROWID`,
  `CREATE TABLE exercise_owner_preferences (
    exercise_id TEXT PRIMARY KEY NOT NULL
      REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
    favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)),
    hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0, 1)),
    archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
    revision INTEGER NOT NULL CHECK(revision >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE exercise_search_terms (
    id INTEGER PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL
      REFERENCES exercise_library_entries(exercise_id) ON DELETE CASCADE,
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
  `CREATE INDEX exercise_library_by_origin_visibility
   ON exercise_library_entries(origin, availability, canonical_name, exercise_id)`,
  `CREATE INDEX exercise_catalog_by_revision
   ON exercise_catalog_sources(content_revision_id, availability, exercise_id)`,
  `CREATE INDEX exercise_taxonomy_filter
   ON exercise_taxonomy(kind, slug, exercise_id)`,
  `CREATE INDEX exercise_search_terms_by_exercise
   ON exercise_search_terms(exercise_id, kind, ordinal)`,
] as const;

const REQUIRED_CONTENT_LIBRARY_TABLES = [
  "content_pack_revisions",
  "exercise_aliases",
  "exercise_catalog_sources",
  "exercise_library_entries",
  "exercise_owner_preferences",
  "exercise_search_terms",
  "exercise_taxonomy",
  "taxonomy_terms",
] as const;

export const contentLibraryMigration: Migration = Object.freeze({
  version: 4,
  name: "content-library",
  kind: "additive",
  async up(transaction) {
    for (const statement of CONTENT_LIBRARY_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction) {
    const tables = await transaction.queryAll<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    );
    if (
      REQUIRED_CONTENT_LIBRARY_TABLES.some((required) =>
        !tables.some(({ name }) => name === required),
      )
    ) {
      throw new Error("content_library_schema_incomplete");
    }

    const [sourceCount] = await transaction.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM exercises",
    );
    const [libraryCount] = await transaction.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM exercise_library_entries",
    );
    if (sourceCount!.count !== libraryCount!.count) {
      throw new Error("content_library_seed_incomplete");
    }
  },
});
