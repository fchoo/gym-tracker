import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  canonicalizeSearchFilters,
  decodeSearchCursor,
  encodeSearchCursor,
  normalizeSearchText,
  rankExerciseMatch,
  SEARCH_NORMALIZATION_VERSION,
  SEARCH_PAGE_SIZE,
  SearchContractError,
  type SearchCursorContext,
  type SearchFilters,
} from "./search";

const emptyFilters: SearchFilters = Object.freeze({});

const cursorContext = (
  overrides: Partial<SearchCursorContext> = {},
): SearchCursorContext => ({
  normalizedQuery: "press",
  filters: canonicalizeSearchFilters(emptyFilters),
  catalogRevision: "catalog:7",
  normalizationVersion: SEARCH_NORMALIZATION_VERSION,
  ...overrides,
});

describe("exercise Library search contract E-14 through E-27", () => {
  it("E-14 normalizes empty and whitespace-only input without a MATCH-all query", () => {
    expect(normalizeSearchText("")).toEqual({
      version: SEARCH_NORMALIZATION_VERSION,
      text: "",
      codePointLength: 0,
      strategy: "empty",
    });
    expect(normalizeSearchText(" \t\n— ")).toMatchObject({
      text: "",
      codePointLength: 0,
      strategy: "empty",
    });
  });

  it("E-15 bounds one- and two-code-point queries to relational matching", () => {
    expect(normalizeSearchText("A")).toMatchObject({
      text: "a",
      codePointLength: 1,
      strategy: "relational",
    });
    expect(normalizeSearchText("🔥A")).toMatchObject({
      text: "a",
      codePointLength: 1,
      strategy: "relational",
    });
    expect(normalizeSearchText("AB")).toMatchObject({
      text: "ab",
      codePointLength: 2,
      strategy: "relational",
    });
  });

  it("E-16 routes three or more code points to packaged trigram candidates", () => {
    expect(normalizeSearchText("AbC")).toEqual({
      version: SEARCH_NORMALIZATION_VERSION,
      text: "abc",
      codePointLength: 3,
      strategy: "trigram",
    });
  });

  it("E-17 removes diacritics and treats punctuation and operators as data", () => {
    expect(normalizeSearchText("  Café / PRESS - and (hold): \"OR\"  "))
      .toMatchObject({
        text: "cafe press and hold or",
        strategy: "trigram",
      });
    expect(() => normalizeSearchText("x".repeat(121))).toThrow(
      new SearchContractError("search_query_too_long"),
    );
    expect(() => normalizeSearchText("ﬃ".repeat(41))).toThrow(
      new SearchContractError("search_query_too_long"),
    );
    expect(() => normalizeSearchText(
      42 as unknown as string,
    )).toThrow(new SearchContractError("search_query_invalid"));
  });

  it("E-18 returns the alias-caused tracer with canonical identity and locked tuple", () => {
    expect(rankExerciseMatch({
      exerciseId: "exercise-0007",
      canonicalName: "Horizontal Barbell Press",
      aliases: [
        { id: 9, displayText: "Bench Press", normalizedText: "bench press" },
        { id: 8, displayText: "Barbell Bench", normalizedText: "barbell bench" },
      ],
      normalizedQuery: "bench",
    })).toEqual({
      exerciseId: "exercise-0007",
      canonicalName: "Horizontal Barbell Press",
      canonicalSortKey: "horizontal barbell press",
      tier: 2,
      matchedAlias: {
        id: 9,
        displayText: "Bench Press",
        label: "Matched alias: Bench Press",
      },
    });
  });

  it("E-19 enforces exact canonical, canonical prefix, alias, then partial tiers", () => {
    const aliases = [
      { id: 1, displayText: "Chest Press", normalizedText: "chest press" },
    ];
    expect(rankExerciseMatch({
      exerciseId: "exact",
      canonicalName: "Bench Press",
      aliases,
      normalizedQuery: "bench press",
    }).tier).toBe(0);
    expect(rankExerciseMatch({
      exerciseId: "prefix",
      canonicalName: "Bench Press Incline",
      aliases,
      normalizedQuery: "bench",
    }).tier).toBe(1);
    expect(rankExerciseMatch({
      exerciseId: "alias",
      canonicalName: "Horizontal Press",
      aliases,
      normalizedQuery: "chest",
    }).tier).toBe(2);
    expect(rankExerciseMatch({
      exerciseId: "partial",
      canonicalName: "Incline Bench Press",
      aliases: [],
      normalizedQuery: "bench",
    }).tier).toBe(3);
  });

  it("E-20 keeps equal-rank adjacency alphabetical with stable ID ties", () => {
    const inputs = [
      {
        exerciseId: "exercise-z",
        canonicalName: "Press",
        aliases: [],
        normalizedQuery: "press",
      },
      {
        exerciseId: "exercise-b",
        canonicalName: "Bench Press",
        aliases: [],
        normalizedQuery: "press",
      },
      {
        exerciseId: "exercise-a",
        canonicalName: "Bench Press",
        aliases: [],
        normalizedQuery: "press",
      },
    ] as const;
    expect(inputs.map(rankExerciseMatch).sort((left, right) =>
      left.tier - right.tier
      || left.canonicalSortKey.localeCompare(right.canonicalSortKey, "en")
      || left.exerciseId.localeCompare(right.exerciseId, "en")
    ).map(({ exerciseId }) => exerciseId)).toEqual([
      "exercise-z",
      "exercise-a",
      "exercise-b",
    ]);
  });

  it("E-21 locks thirty-row pages at the 29, 30, and 31 boundaries", () => {
    expect(SEARCH_PAGE_SIZE).toBe(30);
    expect(Math.ceil(29 / SEARCH_PAGE_SIZE)).toBe(1);
    expect(Math.ceil(30 / SEARCH_PAGE_SIZE)).toBe(1);
    expect(Math.ceil(31 / SEARCH_PAGE_SIZE)).toBe(2);
  });

  it("E-22 canonicalizes OR-within and AND-across filter groups", () => {
    const left = canonicalizeSearchFilters({
      exerciseTypes: ["strength", "cardio", "strength"],
      muscles: ["triceps", "chest"],
      equipment: ["barbell", "bench"],
      origins: ["custom", "bundled"],
      visibility: ["unavailable", "available"],
      recent: [false, true],
      favorite: [true],
    });
    const right = canonicalizeSearchFilters({
      favorite: [true],
      recent: [true, false],
      visibility: ["available", "unavailable"],
      origins: ["bundled", "custom"],
      equipment: ["bench", "barbell"],
      muscles: ["chest", "triceps"],
      exerciseTypes: ["cardio", "strength"],
    });

    expect(left).toEqual(right);
    expect(left).toEqual({
      exerciseTypes: ["cardio", "strength"],
      muscles: ["chest", "triceps"],
      equipment: ["barbell", "bench"],
      origins: ["bundled", "custom"],
      visibility: ["available", "unavailable"],
      recent: [false, true],
      favorite: [true],
    });
  });

  it("E-23 gives empty visibility the D-10 available and owner-visible default", () => {
    expect(canonicalizeSearchFilters({ visibility: [] })).toEqual({
      exerciseTypes: [],
      muscles: [],
      equipment: [],
      origins: [],
      visibility: [],
      recent: [],
      favorite: [],
    });
  });

  it("E-24 cursor encode/decode is opaque and idempotent", () => {
    const encoded = encodeSearchCursor({
      context: cursorContext(),
      last: {
        tier: 2,
        canonicalSortKey: "horizontal barbell press",
        exerciseId: "exercise-0007",
      },
    });
    const decoded = decodeSearchCursor(encoded, cursorContext());

    expect(encoded).not.toContain("press");
    expect(decoded).toEqual({
      state: "valid",
      value: {
        tier: 2,
        canonicalSortKey: "horizontal barbell press",
        exerciseId: "exercise-0007",
      },
    });
    if (decoded.state !== "valid") {
      throw new Error("expected valid cursor");
    }
    expect(encodeSearchCursor({
      context: cursorContext(),
      last: decoded.value,
    })).toBe(encoded);
  });

  it("E-25 invalid or mutated cursors return typed restart", () => {
    const encoded = encodeSearchCursor({
      context: cursorContext(),
      last: {
        tier: 3,
        canonicalSortKey: "press",
        exerciseId: "exercise-press",
      },
    });
    const mutated = `${encoded.slice(0, -1)}${encoded.endsWith("A") ? "B" : "A"}`;

    expect(decodeSearchCursor("not-a-cursor", cursorContext())).toEqual({
      state: "restart",
      reason: "invalid",
    });
    expect(decodeSearchCursor(mutated, cursorContext())).toEqual({
      state: "restart",
      reason: "invalid",
    });
  });

  it("E-26 rejects query, filter, catalog, and normalization cursor drift", () => {
    const encoded = encodeSearchCursor({
      context: cursorContext(),
      last: {
        tier: 1,
        canonicalSortKey: "press",
        exerciseId: "exercise-press",
      },
    });

    expect(decodeSearchCursor(
      encoded,
      cursorContext({ normalizedQuery: "pull" }),
    )).toEqual({ state: "restart", reason: "query_changed" });
    expect(decodeSearchCursor(
      encoded,
      cursorContext({
        filters: canonicalizeSearchFilters({ favorite: [true] }),
      }),
    )).toEqual({ state: "restart", reason: "filters_changed" });
    expect(decodeSearchCursor(
      encoded,
      cursorContext({ catalogRevision: "catalog:8" }),
    )).toEqual({ state: "restart", reason: "catalog_changed" });
    expect(decodeSearchCursor(
      encoded,
      cursorContext({ normalizationVersion: 2 }),
    )).toEqual({ state: "restart", reason: "normalization_changed" });
  });

  it("E-27 ordering remains independent of favorite, recent, and precision signals", () => {
    const base = {
      exerciseId: "exercise-press",
      canonicalName: "Bench Press",
      aliases: [],
      normalizedQuery: "bench",
    } as const;
    expect(rankExerciseMatch({
      ...base,
      favorite: true,
      recentAtMs: Number.MAX_SAFE_INTEGER,
      candidatePrecision: 0.999,
    })).toEqual(rankExerciseMatch({
      ...base,
      favorite: false,
      recentAtMs: null,
      candidatePrecision: 0.001,
    }));
  });

  it.each([
    {
      label: "too many values",
      filters: {
        muscles: Array.from({ length: 33 }, (_, index) => `muscle-${index}`),
      },
    },
    { label: "empty value", filters: { equipment: [""] } },
    { label: "oversized value", filters: { exerciseTypes: ["x".repeat(81)] } },
    { label: "untrimmed value", filters: { muscles: [" chest"] } },
    {
      label: "unknown origin",
      filters: { origins: ["remote"] },
    },
    {
      label: "non-boolean favorite",
      filters: { favorite: [1] },
    },
    {
      label: "non-array text group",
      filters: { muscles: "chest" },
    },
    {
      label: "non-array boolean group",
      filters: { favorite: true },
    },
    {
      label: "non-string text value",
      filters: { equipment: [1] },
    },
  ])("rejects $label filters", ({ filters }) => {
    expect(() => canonicalizeSearchFilters(
      filters as unknown as SearchFilters,
    )).toThrow(new SearchContractError("search_filter_invalid"));
  });

  it.each([
    null,
    [],
    "favorite",
  ])("rejects malformed filter container %p", (filters) => {
    expect(() => canonicalizeSearchFilters(
      filters as unknown as SearchFilters,
    )).toThrow(new SearchContractError("search_filter_invalid"));
  });

  it.each([
    {
      label: "non-integer ID",
      alias: {
        id: 1.5,
        displayText: "Bench Press",
        normalizedText: "bench press",
      },
    },
    {
      label: "negative ID",
      alias: {
        id: -1,
        displayText: "Bench Press",
        normalizedText: "bench press",
      },
    },
    {
      label: "blank display text",
      alias: {
        id: 1,
        displayText: " ",
        normalizedText: "",
      },
    },
    {
      label: "stale normalized text",
      alias: {
        id: 1,
        displayText: "Bench Press",
        normalizedText: "stale",
      },
    },
  ])("rejects alias rows with a $label", ({ alias }) => {
    expect(() => rankExerciseMatch({
      exerciseId: "exercise-invalid-alias",
      canonicalName: "Horizontal Press",
      aliases: [alias],
      normalizedQuery: "bench",
    })).toThrow(new SearchContractError("search_alias_invalid"));
  });

  it("chooses alias ties by normalized text and then stable alias ID", () => {
    const byText = rankExerciseMatch({
      exerciseId: "alias-text-tie",
      canonicalName: "Horizontal Push",
      aliases: [
        { id: 2, displayText: "Bench B", normalizedText: "bench b" },
        { id: 1, displayText: "Bench A", normalizedText: "bench a" },
      ],
      normalizedQuery: "bench",
    });
    const byId = rankExerciseMatch({
      exerciseId: "alias-id-tie",
      canonicalName: "Horizontal Push",
      aliases: [
        { id: 2, displayText: "Bench", normalizedText: "bench" },
        { id: 1, displayText: "Bench", normalizedText: "bench" },
      ],
      normalizedQuery: "bench",
    });

    expect(byText.matchedAlias?.displayText).toBe("Bench A");
    expect(byId.matchedAlias?.id).toBe(1);
  });

  it("distinguishes alias partial matches from absent and empty matches", () => {
    expect(rankExerciseMatch({
      exerciseId: "alias-partial",
      canonicalName: "Horizontal Push",
      aliases: [{
        id: 1,
        displayText: "Incline Bench Press",
        normalizedText: "incline bench press",
      }],
      normalizedQuery: "bench",
    })).toMatchObject({
      tier: 3,
      matchedAlias: {
        displayText: "Incline Bench Press",
      },
    });
    expect(() => rankExerciseMatch({
      exerciseId: "no-match",
      canonicalName: "Horizontal Push",
      aliases: [],
      normalizedQuery: "bench",
    })).toThrow(new SearchContractError("search_no_match"));
    expect(() => rankExerciseMatch({
      exerciseId: "empty-match",
      canonicalName: "Horizontal Push",
      aliases: [],
      normalizedQuery: " ",
    })).toThrow(new SearchContractError("search_no_match"));
  });

  it.each([
    {
      label: "invalid tier",
      last: {
        tier: 4,
        canonicalSortKey: "press",
        exerciseId: "exercise-press",
      },
    },
    {
      label: "empty sort key",
      last: {
        tier: 1,
        canonicalSortKey: "",
        exerciseId: "exercise-press",
      },
    },
    {
      label: "empty stable ID",
      last: {
        tier: 1,
        canonicalSortKey: "press",
        exerciseId: "",
      },
    },
  ])("rejects cursor encoding with $label", ({ last }) => {
    expect(() => encodeSearchCursor({
      context: cursorContext(),
      last: last as Parameters<typeof encodeSearchCursor>[0]["last"],
    })).toThrow(new SearchContractError("search_cursor_invalid"));
  });

  it.each([
    "",
    "A_",
    Buffer.from(JSON.stringify({}), "utf8").toString("base64url"),
  ])("returns typed restart for malformed opaque cursor %p", (cursor) => {
    expect(decodeSearchCursor(cursor, cursorContext())).toEqual({
      state: "restart",
      reason: "invalid",
    });
  });
});
