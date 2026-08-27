export const SEARCH_NORMALIZATION_VERSION = 1 as const;
export const SEARCH_CURSOR_VERSION = 1 as const;
export const SEARCH_PAGE_SIZE = 30 as const;
export const SEARCH_QUERY_MAX_CODE_POINTS = 120 as const;

const FILTER_GROUP_MAX_VALUES = 32;
const FILTER_VALUE_MAX_CODE_POINTS = 80;
const BASE64_URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export type SearchStrategy = "empty" | "relational" | "trigram";
export type SearchOrigin = "bundled" | "copied" | "custom";
export type SearchVisibility =
  | "archived"
  | "available"
  | "hidden"
  | "unavailable";

export type SearchFilters = Readonly<{
  exerciseTypes?: readonly string[];
  muscles?: readonly string[];
  equipment?: readonly string[];
  origins?: readonly SearchOrigin[];
  visibility?: readonly SearchVisibility[];
  recent?: readonly boolean[];
  favorite?: readonly boolean[];
}>;

export type CanonicalSearchFilters = Readonly<{
  exerciseTypes: readonly string[];
  muscles: readonly string[];
  equipment: readonly string[];
  origins: readonly SearchOrigin[];
  visibility: readonly SearchVisibility[];
  recent: readonly boolean[];
  favorite: readonly boolean[];
}>;

export type NormalizedSearchText = Readonly<{
  version: typeof SEARCH_NORMALIZATION_VERSION;
  text: string;
  codePointLength: number;
  strategy: SearchStrategy;
}>;

export type SearchAlias = Readonly<{
  id: number;
  displayText: string;
  normalizedText: string;
}>;

export type SearchRankTier = 0 | 1 | 2 | 3;

export type SearchRank = Readonly<{
  exerciseId: string;
  canonicalName: string;
  canonicalSortKey: string;
  tier: SearchRankTier;
  matchedAlias: Readonly<{
    id: number;
    displayText: string;
    label: string;
  }> | null;
}>;

export type SearchRankInput = Readonly<{
  exerciseId: string;
  canonicalName: string;
  aliases: readonly SearchAlias[];
  normalizedQuery: string;
  favorite?: boolean;
  recentAtMs?: number | null;
  candidatePrecision?: number;
}>;

export type SearchCursorValue = Readonly<{
  tier: SearchRankTier;
  canonicalSortKey: string;
  exerciseId: string;
}>;

export type SearchCursorContext = Readonly<{
  normalizedQuery: string;
  filters: CanonicalSearchFilters;
  catalogRevision: string;
  normalizationVersion: number;
}>;

export type SearchCursorRestartReason =
  | "invalid"
  | "query_changed"
  | "filters_changed"
  | "catalog_changed"
  | "normalization_changed";

export type SearchCursorResult =
  | Readonly<{ state: "valid"; value: SearchCursorValue }>
  | Readonly<{ state: "restart"; reason: SearchCursorRestartReason }>;

type CursorPayload = Readonly<{
  v: typeof SEARCH_CURSOR_VERSION;
  n: number;
  q: string;
  f: string;
  c: string;
  t: SearchRankTier;
  k: string;
  i: string;
}>;

type CursorEnvelope = Readonly<{
  p: CursorPayload;
  s: string;
}>;

export type SearchContractErrorCode =
  | "search_alias_invalid"
  | "search_cursor_invalid"
  | "search_filter_invalid"
  | "search_no_match"
  | "search_query_invalid"
  | "search_query_too_long";

export class SearchContractError extends Error {
  readonly kind = "validation" as const;
  readonly retryable = false;

  constructor(readonly code: SearchContractErrorCode) {
    super(code);
    this.name = "SearchContractError";
  }
}

function codePointLength(value: string): number {
  return [...value].length;
}

export function normalizeSearchText(value: string): NormalizedSearchText {
  if (typeof value !== "string") {
    throw new SearchContractError("search_query_invalid");
  }
  if (codePointLength(value) > SEARCH_QUERY_MAX_CODE_POINTS) {
    throw new SearchContractError("search_query_too_long");
  }
  const text = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
  const length = codePointLength(text);
  if (length > SEARCH_QUERY_MAX_CODE_POINTS) {
    throw new SearchContractError("search_query_too_long");
  }
  return Object.freeze({
    version: SEARCH_NORMALIZATION_VERSION,
    text,
    codePointLength: length,
    strategy: length === 0
      ? "empty"
      : length <= 2
        ? "relational"
        : "trigram",
  });
}

function canonicalTextValues(
  values: readonly string[] | undefined,
): readonly string[] {
  if (values !== undefined && !Array.isArray(values)) {
    throw new SearchContractError("search_filter_invalid");
  }
  const canonical = [...new Set(values ?? [])].sort();
  if (
    canonical.length > FILTER_GROUP_MAX_VALUES
    || canonical.some((value) =>
      typeof value !== "string"
      || value.length === 0
      || codePointLength(value) > FILTER_VALUE_MAX_CODE_POINTS
      || value !== value.trim()
    )
  ) {
    throw new SearchContractError("search_filter_invalid");
  }
  return Object.freeze(canonical);
}

function canonicalEnumValues<Value extends string>(
  values: readonly Value[] | undefined,
  allowed: ReadonlySet<string>,
): readonly Value[] {
  const canonical = canonicalTextValues(values) as readonly Value[];
  if (canonical.some((value) => !allowed.has(value))) {
    throw new SearchContractError("search_filter_invalid");
  }
  return canonical;
}

function canonicalBooleanValues(
  values: readonly boolean[] | undefined,
): readonly boolean[] {
  if (
    (values !== undefined && !Array.isArray(values))
    || (values ?? []).some((value) => typeof value !== "boolean")
  ) {
    throw new SearchContractError("search_filter_invalid");
  }
  return Object.freeze(
    [...new Set(values ?? [])].sort((left, right) =>
      Number(left) - Number(right)
    ),
  );
}

export function canonicalizeSearchFilters(
  filters: SearchFilters,
): CanonicalSearchFilters {
  if (
    typeof filters !== "object"
    || filters === null
    || Array.isArray(filters)
  ) {
    throw new SearchContractError("search_filter_invalid");
  }
  return Object.freeze({
    exerciseTypes: canonicalTextValues(filters.exerciseTypes),
    muscles: canonicalTextValues(filters.muscles),
    equipment: canonicalTextValues(filters.equipment),
    origins: canonicalEnumValues(
      filters.origins,
      new Set<SearchOrigin>(["bundled", "copied", "custom"]),
    ),
    visibility: canonicalEnumValues(
      filters.visibility,
      new Set<SearchVisibility>([
        "archived",
        "available",
        "hidden",
        "unavailable",
      ]),
    ),
    recent: canonicalBooleanValues(filters.recent),
    favorite: canonicalBooleanValues(filters.favorite),
  });
}

function aliasQuality(
  normalizedText: string,
  normalizedQuery: string,
): 0 | 1 | 2 | null {
  if (normalizedText === normalizedQuery) {
    return 0;
  }
  if (normalizedText.startsWith(normalizedQuery)) {
    return 1;
  }
  return normalizedText.includes(normalizedQuery) ? 2 : null;
}

function selectAlias(
  aliases: readonly SearchAlias[],
  normalizedQuery: string,
): Readonly<{
  alias: SearchAlias;
  quality: 0 | 1 | 2;
}> | null {
  const candidates = aliases.flatMap((alias) => {
    if (
      !Number.isSafeInteger(alias.id)
      || alias.id < 0
      || alias.displayText.trim().length === 0
      || alias.normalizedText !== normalizeSearchText(alias.displayText).text
    ) {
      throw new SearchContractError("search_alias_invalid");
    }
    const quality = aliasQuality(alias.normalizedText, normalizedQuery);
    return quality === null ? [] : [{ alias, quality }];
  });
  return candidates.sort((left, right) =>
    left.quality - right.quality
    || left.alias.normalizedText.localeCompare(
      right.alias.normalizedText,
      "en",
    )
    || left.alias.id - right.alias.id
  )[0] ?? null;
}

export function rankExerciseMatch(input: SearchRankInput): SearchRank {
  const normalizedQuery = normalizeSearchText(input.normalizedQuery).text;
  if (normalizedQuery.length === 0) {
    throw new SearchContractError("search_no_match");
  }
  const canonicalSortKey = normalizeSearchText(input.canonicalName).text;
  const canonicalQuality = aliasQuality(canonicalSortKey, normalizedQuery);
  const selectedAlias = selectAlias(input.aliases, normalizedQuery);
  let tier: SearchRankTier;
  let aliasCausedMatch = false;
  if (canonicalQuality === 0) {
    tier = 0;
  } else if (canonicalQuality === 1) {
    tier = 1;
  } else if (
    selectedAlias?.quality === 0
    || selectedAlias?.quality === 1
  ) {
    tier = 2;
    aliasCausedMatch = true;
  } else if (canonicalQuality === 2) {
    tier = 3;
  } else if (selectedAlias?.quality === 2) {
    tier = 3;
    aliasCausedMatch = true;
  } else {
    throw new SearchContractError("search_no_match");
  }
  return Object.freeze({
    exerciseId: input.exerciseId,
    canonicalName: input.canonicalName,
    canonicalSortKey,
    tier,
    matchedAlias: aliasCausedMatch && selectedAlias !== null
      ? Object.freeze({
          id: selectedAlias.alias.id,
          displayText: selectedAlias.alias.displayText,
          label: `Matched alias: ${selectedAlias.alias.displayText}`,
        })
      : null,
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    );
    return `{${entries.map(([key, entry]) =>
      `${JSON.stringify(key)}:${stableJson(entry)}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPart(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    hash ^= codePoint;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= codePoint >>> 16;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function validationSignature(value: string): string {
  return [
    hashPart(value, 0x811c9dc5),
    hashPart(value, 0x9e3779b9),
    hashPart(value, 0x85ebca6b),
    hashPart(value, 0xc2b2ae35),
  ].join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += BASE64_URL_ALPHABET[first >>> 2];
    encoded += BASE64_URL_ALPHABET[
      ((first & 0b11) << 4) | ((second ?? 0) >>> 4)
    ];
    if (second !== undefined) {
      encoded += BASE64_URL_ALPHABET[
        ((second & 0b1111) << 2) | ((third ?? 0) >>> 6)
      ];
    }
    if (third !== undefined) {
      encoded += BASE64_URL_ALPHABET[third & 0b111111];
    }
  }
  return encoded;
}

function base64UrlToBytes(encoded: string): Uint8Array {
  if (
    encoded.length === 0
    || encoded.length % 4 === 1
    || /[^A-Za-z0-9_-]/u.test(encoded)
  ) {
    throw new SearchContractError("search_cursor_invalid");
  }
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 4) {
    const first = BASE64_URL_ALPHABET.indexOf(encoded[index]!);
    const second = BASE64_URL_ALPHABET.indexOf(encoded[index + 1]!);
    const thirdCharacter = encoded[index + 2];
    const fourthCharacter = encoded[index + 3];
    const third = thirdCharacter === undefined
      ? 0
      : BASE64_URL_ALPHABET.indexOf(thirdCharacter);
    const fourth = fourthCharacter === undefined
      ? 0
      : BASE64_URL_ALPHABET.indexOf(fourthCharacter);
    bytes.push((first << 2) | (second >>> 4));
    if (thirdCharacter !== undefined) {
      bytes.push(((second & 0b1111) << 4) | (third >>> 2));
    }
    if (fourthCharacter !== undefined) {
      bytes.push(((third & 0b11) << 6) | fourth);
    }
  }
  return Uint8Array.from(bytes);
}

function encodeOpaque(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeOpaque(value: string): string {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
    base64UrlToBytes(value),
  );
  if (encodeOpaque(decoded) !== value) {
    throw new SearchContractError("search_cursor_invalid");
  }
  return decoded;
}

function filterFingerprint(filters: CanonicalSearchFilters): string {
  return validationSignature(stableJson(filters));
}

function queryFingerprint(normalizedQuery: string): string {
  return validationSignature(normalizedQuery);
}

function validRankTier(value: unknown): value is SearchRankTier {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function parseEnvelope(value: string): CursorEnvelope {
  const envelope = JSON.parse(decodeOpaque(value)) as Partial<CursorEnvelope>;
  const payload = envelope.p as Partial<CursorPayload> | undefined;
  if (
    payload === undefined
    || payload.v !== SEARCH_CURSOR_VERSION
    || !Number.isSafeInteger(payload.n)
    || typeof payload.q !== "string"
    || typeof payload.f !== "string"
    || typeof payload.c !== "string"
    || !validRankTier(payload.t)
    || typeof payload.k !== "string"
    || typeof payload.i !== "string"
    || payload.k.length === 0
    || payload.i.length === 0
    || typeof envelope.s !== "string"
    || envelope.s !== validationSignature(stableJson(payload))
  ) {
    throw new SearchContractError("search_cursor_invalid");
  }
  return {
    p: payload as CursorPayload,
    s: envelope.s,
  };
}

export function encodeSearchCursor(input: Readonly<{
  context: SearchCursorContext;
  last: SearchCursorValue;
}>): string {
  if (
    !validRankTier(input.last.tier)
    || input.last.canonicalSortKey.length === 0
    || input.last.exerciseId.length === 0
  ) {
    throw new SearchContractError("search_cursor_invalid");
  }
  const payload: CursorPayload = {
    v: SEARCH_CURSOR_VERSION,
    n: input.context.normalizationVersion,
    q: queryFingerprint(input.context.normalizedQuery),
    f: filterFingerprint(input.context.filters),
    c: input.context.catalogRevision,
    t: input.last.tier,
    k: input.last.canonicalSortKey,
    i: input.last.exerciseId,
  };
  return encodeOpaque(stableJson({
    p: payload,
    s: validationSignature(stableJson(payload)),
  }));
}

export function decodeSearchCursor(
  cursor: string,
  context: SearchCursorContext,
): SearchCursorResult {
  let payload: CursorPayload;
  try {
    payload = parseEnvelope(cursor).p;
  } catch {
    return { state: "restart", reason: "invalid" };
  }
  if (payload.n !== context.normalizationVersion) {
    return { state: "restart", reason: "normalization_changed" };
  }
  if (payload.q !== queryFingerprint(context.normalizedQuery)) {
    return { state: "restart", reason: "query_changed" };
  }
  if (payload.f !== filterFingerprint(context.filters)) {
    return { state: "restart", reason: "filters_changed" };
  }
  if (payload.c !== context.catalogRevision) {
    return { state: "restart", reason: "catalog_changed" };
  }
  return {
    state: "valid",
    value: Object.freeze({
      tier: payload.t,
      canonicalSortKey: payload.k,
      exerciseId: payload.i,
    }),
  };
}
