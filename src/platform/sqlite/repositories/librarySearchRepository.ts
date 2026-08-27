import {
  canonicalizeSearchFilters,
  decodeSearchCursor,
  encodeSearchCursor,
  normalizeSearchText,
  rankExerciseMatch,
  SEARCH_NORMALIZATION_VERSION,
  SEARCH_PAGE_SIZE,
  type CanonicalSearchFilters,
  type SearchCursorRestartReason,
  type SearchCursorValue,
  type SearchFilters,
  type SearchOrigin,
  type SearchRankTier,
  type SearchStrategy,
} from "../../../domains/library/search";
import type {
  SqliteKernel,
} from "../sqliteKernel";

export type LibrarySearchRequest = Readonly<{
  query: string;
  filters?: SearchFilters;
  cursor?: string | null;
}>;

export type LibrarySearchSource = Readonly<{
  namespace: string;
  revision: string;
  license: string;
  attribution: string;
}>;

export type LibrarySearchItem = Readonly<{
  exerciseId: string;
  canonicalName: string;
  canonicalSortKey: string;
  tier: SearchRankTier;
  matchedAlias: Readonly<{
    id: number;
    displayText: string;
    label: string;
  }> | null;
  exerciseType: string;
  origin: SearchOrigin;
  originLabel: "Built-in" | "Custom";
  availability: "available" | "unavailable";
  favorite: boolean;
  hidden: boolean;
  archived: boolean;
  recentAtMs: number | null;
  muscles: readonly string[];
  equipment: readonly string[];
  source: LibrarySearchSource | null;
}>;

export type LibrarySearchDiagnostic = Readonly<{
  code: "exercise_search_ok";
  strategy: SearchStrategy;
  normalizationVersion: typeof SEARCH_NORMALIZATION_VERSION;
  resultCount: number;
  candidateCount: number;
  hasNext: boolean;
  catalogRevision: string;
  durationMs: number;
}>;

export type LibrarySearchPage = Readonly<{
  state: "page";
  items: readonly LibrarySearchItem[];
  nextCursor: string | null;
  diagnostic: LibrarySearchDiagnostic;
}>;

export type LibrarySearchResult =
  | LibrarySearchPage
  | Readonly<{
      state: "restart";
      reason: SearchCursorRestartReason;
    }>;

export type LibrarySearchRepository = Readonly<{
  searchExercises(request: LibrarySearchRequest): Promise<LibrarySearchResult>;
  listRecentExercises(): Promise<readonly LibrarySearchItem[]>;
}>;

export type LibrarySearchRepositoryErrorCode =
  | "exercise_search_candidate_failed"
  | "exercise_search_context_failed"
  | "exercise_search_hydration_failed"
  | "exercise_search_recent_failed";

export class LibrarySearchRepositoryError extends Error {
  readonly kind = "storage" as const;
  readonly retryable = true;
  readonly correlationCode = "GT-SEARCH01" as const;

  constructor(readonly code: LibrarySearchRepositoryErrorCode) {
    super(code);
    this.name = "LibrarySearchRepositoryError";
  }
}

type CatalogContextRow = Readonly<{
  entry_count: number;
  entry_revision_sum: number;
  term_count: number;
  max_term_id: number;
  preference_count: number;
  preference_revision_sum: number;
  taxonomy_count: number;
  source_count: number;
  source_revision_sum: number;
}>;

type RankedCandidateRow = Readonly<{
  exercise_id: string;
  canonical_sort_key: string;
  tier: SearchRankTier;
}>;

type HydratedExerciseRow = Readonly<{
  request_ordinal: number;
  exercise_id: string;
  canonical_name: string;
  canonical_sort_key: string;
  tier: SearchRankTier;
  exercise_type: string;
  origin: SearchOrigin;
  availability: "available" | "unavailable";
  favorite: number;
  hidden: number;
  archived: number;
  recent_at_ms: number | null;
  aliases_json: string;
  muscles_json: string;
  equipment_json: string;
  source_namespace: string | null;
  source_revision: string | null;
  license: string | null;
  attribution: string | null;
}>;

type RecentExerciseRow = Readonly<{
  exercise_id: string;
  canonical_sort_key: string;
  recent_at_ms: number;
}>;

type RequestedHydration = Readonly<{
  exerciseId: string;
  canonicalSortKey: string;
  tier: SearchRankTier;
  ordinal: number;
}>;

const CATALOG_CONTEXT_SQL = `
  SELECT
    (SELECT COUNT(*) FROM exercise_library_entries) AS entry_count,
    (SELECT COALESCE(SUM(revision), 0)
       FROM exercise_library_entries) AS entry_revision_sum,
    (SELECT COUNT(*) FROM exercise_search_terms) AS term_count,
    (SELECT COALESCE(MAX(id), 0)
       FROM exercise_search_terms) AS max_term_id,
    (SELECT COUNT(*) FROM exercise_owner_preferences) AS preference_count,
    (SELECT COALESCE(SUM(revision), 0)
       FROM exercise_owner_preferences) AS preference_revision_sum,
    (SELECT COUNT(*) FROM exercise_taxonomy) AS taxonomy_count,
    (SELECT COUNT(*) FROM content_pack_revisions) AS source_count,
    (SELECT COALESCE(SUM(revision), 0)
       FROM content_pack_revisions) AS source_revision_sum
` as const;

const RECENT_CTES = `
  qualified_exposure AS (
    SELECT session_exercise.exercise_id,
           MAX(session_set.completed_at_ms) AS recent_at_ms
    FROM workout_sessions session
    JOIN session_exercises session_exercise
      ON session_exercise.session_id = session.id
    JOIN session_sets session_set
      ON session_set.session_exercise_id = session_exercise.id
    WHERE session.status IN ('completed', 'partial')
      AND session_set.set_kind = 'working'
      AND session_set.status = 'completed'
      AND session_set.completed_at_ms IS NOT NULL
    GROUP BY session_exercise.exercise_id
  ),
  recent_ranked AS (
    SELECT exercise_id,
           recent_at_ms,
           ROW_NUMBER() OVER (
             ORDER BY recent_at_ms DESC, exercise_id
           ) AS recent_ordinal
    FROM qualified_exposure
  ),
  recent_top AS (
    SELECT exercise_id, recent_at_ms
    FROM recent_ranked
    WHERE recent_ordinal <= 10
  )
` as const;

const FILTER_CTES = `
  selected_exercise_type(value) AS (SELECT value FROM json_each(?)),
  selected_muscle(value) AS (SELECT value FROM json_each(?)),
  selected_equipment(value) AS (SELECT value FROM json_each(?)),
  selected_origin(value) AS (SELECT value FROM json_each(?)),
  selected_visibility(value) AS (SELECT value FROM json_each(?)),
  selected_recent(value) AS (SELECT value FROM json_each(?)),
  selected_favorite(value) AS (SELECT value FROM json_each(?))
` as const;

const FILTER_PREDICATES = `
  AND (
    NOT EXISTS (SELECT 1 FROM selected_exercise_type)
    OR EXISTS (
      SELECT 1
      FROM selected_exercise_type selected
      WHERE selected.value = entry.exercise_type
    )
  )
  AND (
    NOT EXISTS (SELECT 1 FROM selected_muscle)
    OR EXISTS (
      SELECT 1
      FROM exercise_taxonomy taxonomy
      JOIN selected_muscle selected ON selected.value = taxonomy.slug
      WHERE taxonomy.exercise_id = entry.exercise_id
        AND taxonomy.kind = 'muscle'
    )
  )
  AND (
    NOT EXISTS (SELECT 1 FROM selected_equipment)
    OR EXISTS (
      SELECT 1
      FROM exercise_taxonomy taxonomy
      JOIN selected_equipment selected ON selected.value = taxonomy.slug
      WHERE taxonomy.exercise_id = entry.exercise_id
        AND taxonomy.kind = 'equipment'
    )
  )
  AND (
    NOT EXISTS (SELECT 1 FROM selected_origin)
    OR EXISTS (
      SELECT 1
      FROM selected_origin selected
      WHERE selected.value = entry.origin
    )
  )
  AND (
    (
      NOT EXISTS (SELECT 1 FROM selected_visibility)
      AND entry.availability = 'available'
      AND COALESCE(preference.hidden, 0) = 0
      AND COALESCE(preference.archived, 0) = 0
    )
    OR EXISTS (
      SELECT 1
      FROM selected_visibility selected
      WHERE
        (
          selected.value = 'available'
          AND entry.availability = 'available'
          AND COALESCE(preference.hidden, 0) = 0
          AND COALESCE(preference.archived, 0) = 0
        )
        OR (
          selected.value = 'unavailable'
          AND entry.availability = 'unavailable'
        )
        OR (
          selected.value = 'hidden'
          AND COALESCE(preference.hidden, 0) = 1
        )
        OR (
          selected.value = 'archived'
          AND COALESCE(preference.archived, 0) = 1
        )
    )
  )
  AND (
    NOT EXISTS (SELECT 1 FROM selected_recent)
    OR EXISTS (
      SELECT 1
      FROM selected_recent selected
      WHERE CAST(selected.value AS INTEGER) =
        CASE WHEN recent.exercise_id IS NULL THEN 0 ELSE 1 END
    )
  )
  AND (
    NOT EXISTS (SELECT 1 FROM selected_favorite)
    OR EXISTS (
      SELECT 1
      FROM selected_favorite selected
      WHERE CAST(selected.value AS INTEGER) = COALESCE(preference.favorite, 0)
    )
  )
` as const;

const RANK_EXPRESSION = `
  CASE
    WHEN canonical.normalized_text = ? THEN 0
    WHEN canonical.normalized_text LIKE ? || '%' ESCAPE '!' THEN 1
    WHEN EXISTS (
      SELECT 1
      FROM exercise_search_terms alias_term
      WHERE alias_term.exercise_id = entry.exercise_id
        AND alias_term.kind = 'alias'
        AND (
          alias_term.normalized_text = ?
          OR alias_term.normalized_text LIKE ? || '%' ESCAPE '!'
        )
    ) THEN 2
    ELSE 3
  END
` as const;

const SEARCH_SQL_BY_STRATEGY: Readonly<Record<SearchStrategy, string>> =
  Object.freeze({
    empty: `
      WITH
      ${RECENT_CTES},
      ${FILTER_CTES},
      candidate_exercises AS (
        SELECT exercise_id FROM exercise_library_entries
      ),
      ranked AS (
        SELECT entry.exercise_id,
               canonical.normalized_text AS canonical_sort_key,
               3 AS tier
        FROM candidate_exercises candidate
        JOIN exercise_library_entries entry
          ON entry.exercise_id = candidate.exercise_id
        JOIN exercise_search_terms canonical
          ON canonical.exercise_id = entry.exercise_id
         AND canonical.kind = 'canonical'
        LEFT JOIN exercise_owner_preferences preference
          ON preference.exercise_id = entry.exercise_id
        LEFT JOIN recent_top recent
          ON recent.exercise_id = entry.exercise_id
        WHERE 1 = 1
        ${FILTER_PREDICATES}
      ),
      cursor_input(has_cursor, tier, canonical_sort_key, exercise_id) AS (
        VALUES (?, ?, ?, ?)
      )
      SELECT ranked.exercise_id,
             ranked.canonical_sort_key,
             ranked.tier
      FROM ranked
      CROSS JOIN cursor_input cursor
      WHERE cursor.has_cursor = 0
         OR (ranked.tier, ranked.canonical_sort_key, ranked.exercise_id)
            > (cursor.tier, cursor.canonical_sort_key, cursor.exercise_id)
      ORDER BY ranked.tier, ranked.canonical_sort_key, ranked.exercise_id
      LIMIT ?
    `,
    relational: `
      WITH
      ${RECENT_CTES},
      ${FILTER_CTES},
      candidate_exercises AS (
        SELECT DISTINCT exercise_id
        FROM exercise_search_terms
        WHERE normalized_text LIKE '%' || ? || '%' ESCAPE '!'
      ),
      ranked AS (
        SELECT entry.exercise_id,
               canonical.normalized_text AS canonical_sort_key,
               ${RANK_EXPRESSION} AS tier
        FROM candidate_exercises candidate
        JOIN exercise_library_entries entry
          ON entry.exercise_id = candidate.exercise_id
        JOIN exercise_search_terms canonical
          ON canonical.exercise_id = entry.exercise_id
         AND canonical.kind = 'canonical'
        LEFT JOIN exercise_owner_preferences preference
          ON preference.exercise_id = entry.exercise_id
        LEFT JOIN recent_top recent
          ON recent.exercise_id = entry.exercise_id
        WHERE 1 = 1
        ${FILTER_PREDICATES}
      ),
      cursor_input(has_cursor, tier, canonical_sort_key, exercise_id) AS (
        VALUES (?, ?, ?, ?)
      )
      SELECT ranked.exercise_id,
             ranked.canonical_sort_key,
             ranked.tier
      FROM ranked
      CROSS JOIN cursor_input cursor
      WHERE cursor.has_cursor = 0
         OR (ranked.tier, ranked.canonical_sort_key, ranked.exercise_id)
            > (cursor.tier, cursor.canonical_sort_key, cursor.exercise_id)
      ORDER BY ranked.tier, ranked.canonical_sort_key, ranked.exercise_id
      LIMIT ?
    `,
    trigram: `
      WITH
      ${RECENT_CTES},
      ${FILTER_CTES},
      candidate_exercises AS (
        SELECT DISTINCT source.exercise_id
        FROM exercise_search_terms_fts fts
        JOIN exercise_search_terms source ON source.id = fts.rowid
        WHERE exercise_search_terms_fts MATCH ?
      ),
      ranked AS (
        SELECT entry.exercise_id,
               canonical.normalized_text AS canonical_sort_key,
               ${RANK_EXPRESSION} AS tier
        FROM candidate_exercises candidate
        JOIN exercise_library_entries entry
          ON entry.exercise_id = candidate.exercise_id
        JOIN exercise_search_terms canonical
          ON canonical.exercise_id = entry.exercise_id
         AND canonical.kind = 'canonical'
        LEFT JOIN exercise_owner_preferences preference
          ON preference.exercise_id = entry.exercise_id
        LEFT JOIN recent_top recent
          ON recent.exercise_id = entry.exercise_id
        WHERE 1 = 1
        ${FILTER_PREDICATES}
      ),
      cursor_input(has_cursor, tier, canonical_sort_key, exercise_id) AS (
        VALUES (?, ?, ?, ?)
      )
      SELECT ranked.exercise_id,
             ranked.canonical_sort_key,
             ranked.tier
      FROM ranked
      CROSS JOIN cursor_input cursor
      WHERE cursor.has_cursor = 0
         OR (ranked.tier, ranked.canonical_sort_key, ranked.exercise_id)
            > (cursor.tier, cursor.canonical_sort_key, cursor.exercise_id)
      ORDER BY ranked.tier, ranked.canonical_sort_key, ranked.exercise_id
      LIMIT ?
    `,
  });

const HYDRATE_SQL = `
  WITH
  ${RECENT_CTES},
  requested AS (
    SELECT
      CAST(json_extract(value, '$.ordinal') AS INTEGER) AS request_ordinal,
      json_extract(value, '$.exerciseId') AS exercise_id,
      json_extract(value, '$.canonicalSortKey') AS canonical_sort_key,
      CAST(json_extract(value, '$.tier') AS INTEGER) AS tier
    FROM json_each(?)
  )
  SELECT requested.request_ordinal,
         entry.exercise_id,
         entry.canonical_name,
         requested.canonical_sort_key,
         requested.tier,
         entry.exercise_type,
         entry.origin,
         entry.availability,
         COALESCE(preference.favorite, 0) AS favorite,
         COALESCE(preference.hidden, 0) AS hidden,
         COALESCE(preference.archived, 0) AS archived,
         recent.recent_at_ms,
         COALESCE((
           SELECT json_group_array(json_object(
             'id', alias.id,
             'displayText', alias.display_text,
             'normalizedText', alias.normalized_text
           ))
           FROM exercise_aliases alias
           WHERE alias.exercise_id = entry.exercise_id
           ORDER BY alias.normalized_text, alias.id
         ), '[]') AS aliases_json,
         COALESCE((
           SELECT json_group_array(taxonomy.slug)
           FROM exercise_taxonomy taxonomy
           WHERE taxonomy.exercise_id = entry.exercise_id
             AND taxonomy.kind = 'muscle'
           ORDER BY taxonomy.relation, taxonomy.ordinal, taxonomy.slug
         ), '[]') AS muscles_json,
         COALESCE((
           SELECT json_group_array(taxonomy.slug)
           FROM exercise_taxonomy taxonomy
           WHERE taxonomy.exercise_id = entry.exercise_id
             AND taxonomy.kind = 'equipment'
           ORDER BY taxonomy.ordinal, taxonomy.slug
         ), '[]') AS equipment_json,
         source.source_namespace,
         source.source_revision,
         source.license,
         source.attribution
  FROM requested
  JOIN exercise_library_entries entry
    ON entry.exercise_id = requested.exercise_id
  LEFT JOIN exercise_owner_preferences preference
    ON preference.exercise_id = entry.exercise_id
  LEFT JOIN recent_top recent
    ON recent.exercise_id = entry.exercise_id
  LEFT JOIN exercise_catalog_sources source
    ON source.exercise_id = entry.exercise_id
  ORDER BY requested.request_ordinal
` as const;

const LIST_RECENT_SQL = `
  WITH
  ${RECENT_CTES}
  SELECT entry.exercise_id,
         canonical.normalized_text AS canonical_sort_key,
         recent.recent_at_ms
  FROM recent_top recent
  JOIN exercise_library_entries entry
    ON entry.exercise_id = recent.exercise_id
  JOIN exercise_search_terms canonical
    ON canonical.exercise_id = entry.exercise_id
   AND canonical.kind = 'canonical'
  LEFT JOIN exercise_owner_preferences preference
    ON preference.exercise_id = entry.exercise_id
  WHERE entry.availability = 'available'
    AND COALESCE(preference.hidden, 0) = 0
    AND COALESCE(preference.archived, 0) = 0
  ORDER BY recent.recent_at_ms DESC, entry.exercise_id
  LIMIT 10
` as const;

function escapeLike(value: string): string {
  return value
    .replaceAll("!", "!!")
    .replaceAll("%", "!%")
    .replaceAll("_", "!_");
}

function boundMatchPhrase(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function catalogRevision(row: CatalogContextRow): string {
  return [
    row.entry_count,
    row.entry_revision_sum,
    row.term_count,
    row.max_term_id,
    row.preference_count,
    row.preference_revision_sum,
    row.taxonomy_count,
    row.source_count,
    row.source_revision_sum,
  ].join(":");
}

function filterParameters(filters: CanonicalSearchFilters): readonly string[] {
  return [
    JSON.stringify(filters.exerciseTypes),
    JSON.stringify(filters.muscles),
    JSON.stringify(filters.equipment),
    JSON.stringify(filters.origins),
    JSON.stringify(filters.visibility),
    JSON.stringify(filters.recent),
    JSON.stringify(filters.favorite),
  ];
}

function candidateParameters(input: Readonly<{
  strategy: SearchStrategy;
  normalizedQuery: string;
  filters: CanonicalSearchFilters;
  cursor: SearchCursorValue | null;
}>): readonly (number | string)[] {
  const parameters: Array<number | string> = [
    ...filterParameters(input.filters),
  ];
  const strategyParameters: Readonly<Record<
    SearchStrategy,
    readonly string[]
  >> = {
    empty: [],
    relational: [
      escapeLike(input.normalizedQuery),
      input.normalizedQuery,
      escapeLike(input.normalizedQuery),
      input.normalizedQuery,
      escapeLike(input.normalizedQuery),
    ],
    trigram: [
      boundMatchPhrase(input.normalizedQuery),
      input.normalizedQuery,
      escapeLike(input.normalizedQuery),
      input.normalizedQuery,
      escapeLike(input.normalizedQuery),
    ],
  };
  parameters.push(...strategyParameters[input.strategy]);
  parameters.push(
    input.cursor === null ? 0 : 1,
    input.cursor?.tier ?? 0,
    input.cursor?.canonicalSortKey ?? "",
    input.cursor?.exerciseId ?? "",
    SEARCH_PAGE_SIZE + 1,
  );
  return parameters;
}

function parseStringArray(value: string): readonly string[] {
  const parsed = JSON.parse(value) as unknown;
  if (
    !Array.isArray(parsed)
    || parsed.some((entry) => typeof entry !== "string")
  ) {
    throw new LibrarySearchRepositoryError(
      "exercise_search_hydration_failed",
    );
  }
  return Object.freeze([...parsed]);
}

function parseAliases(value: string): readonly Readonly<{
  id: number;
  displayText: string;
  normalizedText: string;
}>[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new LibrarySearchRepositoryError(
      "exercise_search_hydration_failed",
    );
  }
  return Object.freeze(parsed.map((entry) => {
    const candidate = typeof entry === "string"
      ? JSON.parse(entry) as Record<string, unknown>
      : entry as Record<string, unknown>;
    if (
      typeof candidate !== "object"
      || candidate === null
      || !Number.isSafeInteger(candidate.id)
      || typeof candidate.displayText !== "string"
      || typeof candidate.normalizedText !== "string"
    ) {
      throw new LibrarySearchRepositoryError(
        "exercise_search_hydration_failed",
      );
    }
    return Object.freeze({
      id: candidate.id as number,
      displayText: candidate.displayText,
      normalizedText: candidate.normalizedText,
    });
  }));
}

function toItem(
  row: HydratedExerciseRow,
  normalizedQuery: string,
): LibrarySearchItem {
  const aliases = parseAliases(row.aliases_json);
  const rank = normalizedQuery.length === 0
    ? {
        exerciseId: row.exercise_id,
        canonicalName: row.canonical_name,
        canonicalSortKey: row.canonical_sort_key,
        tier: 3 as const,
        matchedAlias: null,
      }
    : rankExerciseMatch({
        exerciseId: row.exercise_id,
        canonicalName: row.canonical_name,
        aliases,
        normalizedQuery,
      });
  if (
    rank.tier !== row.tier
    || rank.canonicalSortKey !== row.canonical_sort_key
  ) {
    throw new LibrarySearchRepositoryError(
      "exercise_search_hydration_failed",
    );
  }
  const sourceValues = [
    row.source_namespace,
    row.source_revision,
    row.license,
    row.attribution,
  ];
  if (
    sourceValues.some((value) => value === null)
    && !sourceValues.every((value) => value === null)
  ) {
    throw new LibrarySearchRepositoryError(
      "exercise_search_hydration_failed",
    );
  }
  return Object.freeze({
    exerciseId: row.exercise_id,
    canonicalName: row.canonical_name,
    canonicalSortKey: row.canonical_sort_key,
    tier: row.tier,
    matchedAlias: rank.matchedAlias,
    exerciseType: row.exercise_type,
    origin: row.origin,
    originLabel: row.origin === "bundled" ? "Built-in" : "Custom",
    availability: row.availability,
    favorite: row.favorite === 1,
    hidden: row.hidden === 1,
    archived: row.archived === 1,
    recentAtMs: row.recent_at_ms,
    muscles: parseStringArray(row.muscles_json),
    equipment: parseStringArray(row.equipment_json),
    source: row.source_namespace === null
      ? null
      : Object.freeze({
          namespace: row.source_namespace,
          revision: row.source_revision as string,
          license: row.license as string,
          attribution: row.attribution as string,
        }),
  });
}

async function hydrate(
  kernel: SqliteKernel,
  requested: readonly RequestedHydration[],
  normalizedQuery: string,
): Promise<readonly LibrarySearchItem[]> {
  if (requested.length === 0) {
    return [];
  }
  let rows: readonly HydratedExerciseRow[];
  try {
    rows = await kernel.queryAll<HydratedExerciseRow>(
      HYDRATE_SQL,
      [JSON.stringify(requested)],
    );
  } catch {
    throw new LibrarySearchRepositoryError(
      "exercise_search_hydration_failed",
    );
  }
  if (
    rows.length !== requested.length
    || rows.some((row, index) =>
      row.request_ordinal !== index
      || row.exercise_id !== requested[index]?.exerciseId
    )
  ) {
    throw new LibrarySearchRepositoryError(
      "exercise_search_hydration_failed",
    );
  }
  return Object.freeze(rows.map((row) => toItem(row, normalizedQuery)));
}

export function createLibrarySearchRepository(
  kernel: SqliteKernel,
): LibrarySearchRepository {
  return Object.freeze({
    async searchExercises(
      request: LibrarySearchRequest,
    ): Promise<LibrarySearchResult> {
      const startedAt = Date.now();
      const normalized = normalizeSearchText(request.query);
      const filters = canonicalizeSearchFilters(request.filters ?? {});
      let contextRow: CatalogContextRow | undefined;
      try {
        [contextRow] = await kernel.queryAll<CatalogContextRow>(
          CATALOG_CONTEXT_SQL,
        );
      } catch {
        throw new LibrarySearchRepositoryError(
          "exercise_search_context_failed",
        );
      }
      if (contextRow === undefined) {
        throw new LibrarySearchRepositoryError(
          "exercise_search_context_failed",
        );
      }
      const revision = catalogRevision(contextRow);
      const context = {
        normalizedQuery: normalized.text,
        filters,
        catalogRevision: revision,
        normalizationVersion: SEARCH_NORMALIZATION_VERSION,
      } as const;
      let cursor: SearchCursorValue | null = null;
      if (request.cursor !== undefined && request.cursor !== null) {
        const decoded = decodeSearchCursor(request.cursor, context);
        if (decoded.state === "restart") {
          return decoded;
        }
        cursor = decoded.value;
      }

      let candidates: readonly RankedCandidateRow[];
      try {
        candidates = await kernel.queryAll<RankedCandidateRow>(
          SEARCH_SQL_BY_STRATEGY[normalized.strategy],
          candidateParameters({
            strategy: normalized.strategy,
            normalizedQuery: normalized.text,
            filters,
            cursor,
          }),
        );
      } catch {
        throw new LibrarySearchRepositoryError(
          "exercise_search_candidate_failed",
        );
      }
      const pageCandidates = candidates.slice(0, SEARCH_PAGE_SIZE);
      const requested = pageCandidates.map((candidate, ordinal) => ({
        exerciseId: candidate.exercise_id,
        canonicalSortKey: candidate.canonical_sort_key,
        tier: candidate.tier,
        ordinal,
      }));
      const items = await hydrate(kernel, requested, normalized.text);
      const hasNext = candidates.length > SEARCH_PAGE_SIZE;
      const last = pageCandidates.at(-1);
      const nextCursor = hasNext && last !== undefined
        ? encodeSearchCursor({
            context,
            last: {
              tier: last.tier,
              canonicalSortKey: last.canonical_sort_key,
              exerciseId: last.exercise_id,
            },
          })
        : null;
      return Object.freeze({
        state: "page",
        items,
        nextCursor,
        diagnostic: Object.freeze({
          code: "exercise_search_ok",
          strategy: normalized.strategy,
          normalizationVersion: SEARCH_NORMALIZATION_VERSION,
          resultCount: items.length,
          candidateCount: candidates.length,
          hasNext,
          catalogRevision: revision,
          durationMs: Math.max(0, Date.now() - startedAt),
        }),
      });
    },

    async listRecentExercises(): Promise<readonly LibrarySearchItem[]> {
      let recent: readonly RecentExerciseRow[];
      try {
        recent = await kernel.queryAll<RecentExerciseRow>(LIST_RECENT_SQL);
      } catch {
        throw new LibrarySearchRepositoryError(
          "exercise_search_recent_failed",
        );
      }
      const requested = recent.map((row, ordinal) => ({
        exerciseId: row.exercise_id,
        canonicalSortKey: row.canonical_sort_key,
        tier: 3 as const,
        ordinal,
      }));
      return hydrate(kernel, requested, "");
    },
  });
}
