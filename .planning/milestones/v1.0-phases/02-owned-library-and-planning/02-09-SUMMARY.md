---
phase: 02-owned-library-and-planning
plan: 09
subsystem: database
tags: [sqlite, fts5, trigram, search, keyset-pagination, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Authoritative content-library rows, taxonomy, aliases, owner preferences, and accepted source attribution
  - phase: 02-owned-library-and-planning
    provides: Packaged FTS5 trigram prerequisite with source-synchronized terms, parity, integrity check, and repair
provides:
  - Versioned Unicode normalization, D-11 ranking, D-14 filter canonicalization, explicit alias causes, and opaque context-bound cursors
  - Fixed prepared relational and trigram candidate search with authoritative relational filters, ranking, hydration, and thirty-row keysets
  - Exact Recent and Favorite semantics, bounded diagnostics, source attribution, and derivative repair parity proof
affects: [library-ui, custom-exercises, plan-editor, phase2-runtime-composition, phase2-verification]

actuals:
  tokens: 24073
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - FTS supplies only bound trigram candidate IDs; relational rows determine visibility, filters, rank, aliases, attribution, and hydration
    - Short queries use bounded relational LIKE while three-or-more-code-point queries use a fully quoted bound trigram MATCH phrase
    - Opaque keyset cursors bind normalization version, query, canonical filters, catalog fingerprint, rank tuple, and stable exercise ID
    - Search diagnostics expose only strategy, counts, versions, duration, and bounded codes

key-files:
  created:
    - src/domains/library/search.ts
    - src/domains/library/search.test.ts
    - src/platform/sqlite/repositories/librarySearchRepository.ts
    - tests/integration/exercise-search.test.ts
  modified:
    - scripts/run-coverage-gate.mjs

key-decisions:
  - "D-11 product rank is computed from authoritative normalized canonical and alias rows only; FTS/BM25, Favorite, Recent, row ID, and candidate precision never affect ordering."
  - "D-10 visibility defaults require available, non-hidden, non-archived rows; explicit visibility values use OR within the group and combine with every other non-empty filter group by AND."
  - "Recent is the ten latest unique exercises with completed working sets in completed or partial sessions; warm-ups, drafts, in-progress/manual visits, and mere selection are excluded."
  - "Catalog cursor invalidation uses a read-only relational fingerprint over entry, term, preference, taxonomy, and accepted source revision facts."
  - "Search reads execute no source writes, return bounded diagnostic codes on failure, and rely on the existing private writer only for explicit FTS repair."

patterns-established:
  - "Prepared search pattern: fixed strategy SQL plus JSON-bound canonical filter groups, relational rank tuple, keyset cutoff, and ID-first hydration."
  - "Cursor restart pattern: invalid encoding or query/filter/catalog/normalization drift returns a typed restart result rather than accepting an offset."
  - "Integrity pattern: search domain and repository modules remain permanently enumerated at 100% statements, branches, functions, and lines."

requirements-completed: [LIB-03, LIB-04]

coverage:
  - id: D1
    description: "E-14 through E-27 lock bounded normalization, punctuation/operator handling, canonical and alias ranking, filter canonicalization, page boundaries, stable ties, and typed cursor restart behavior."
    requirement: LIB-03
    verification:
      - kind: unit
        ref: "src/domains/library/search.test.ts#exercise Library search contract E-14 through E-27"
        status: pass
    human_judgment: false
  - id: D2
    description: "Prepared relational/trigram search returns deterministic nonduplicated pages with D-10 through D-16 filters, alias causes, attribution, Recent, Favorite, rollback, and repair parity."
    requirement: LIB-04
    verification:
      - kind: integration
        ref: "tests/integration/exercise-search.test.ts#LIB-03/LIB-04 authoritative exercise search repository"
        status: pass
    human_judgment: false
  - id: D3
    description: "The complete merged host suite passes with both search modules enforced at 100% statements, branches, functions, and lines."
    requirement: LIB-04
    verification:
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
      - kind: other
        ref: "npm run typecheck && npm run check:boundaries"
        status: pass
    human_judgment: false

duration: 26m
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 09: Authoritative Exercise Search Summary

**Prepared short-query and trigram candidate search with relational D-11 ranking, D-14 filters, exact Recent/Favorite semantics, and context-bound thirty-row keyset cursors**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-18T05:33:41Z
- **Completed:** 2026-08-18T05:59:01Z
- **Tasks:** 2
- **Tracked files changed:** 5
- **Implementation commits:** 4
- **Focused final verification:** 38 unit contracts and 27 integration contracts passed
- **Merged host gate:** 1,033 tests passed across 54 suites
- **Integrity-critical gate:** 42 files at 100% statements, branches, functions, and lines

## Accomplishments

- Added E-14 through E-27 pure contracts for Unicode normalization, one/two/three-code-point strategy selection, punctuation and operator words as bound data, exact canonical/alias rank tiers, deterministic alias causes, 29/30/31 page boundaries, stable ties, and cursor drift.
- Added fixed prepared SQL for empty, bounded relational, and trigram candidate paths while keeping relational entries, search terms, preferences, taxonomy, source attribution, and completed exposures authoritative.
- Implemented D-10 through D-16 behavior: default visibility exclusion, OR-within/AND-across filters, explicit `Matched alias: …`, compact origin labels, source attribution, top-ten Recent, persistent Favorite, and no engagement relevance boost.
- Added opaque thirty-row keyset cursors bound to normalization, query, canonical filters, catalog fingerprint, rank, canonical sort key, and stable exercise ID; malformed or stale cursors return typed restart results.
- Proved FTS drift and rebuild do not mutate authoritative search terms or change repaired relational results, and ensured failure diagnostics never carry raw query text, SQL, or bound parameters.

## Task Commits

1. **Task 1 RED:** `ec442e1` — failing E-14 through E-27 deterministic search contracts.
2. **Task 1 GREEN:** `330e028` — versioned normalization, D-11 rank, D-14 filters, alias causes, and opaque cursor codec.
3. **Task 2 RED:** `9a97bae` — failing authoritative repository, keyset, Recent/Favorite, rollback, and repair cases.
4. **Task 2 GREEN:** `6541be3` — fixed prepared search repository, relational hydration, bounded diagnostics, and permanent coverage enforcement.

## Files Created/Modified

- `src/domains/library/search.ts` — bounded normalization, canonical filters, deterministic rank tuple, alias cause selection, and cursor encode/decode contracts.
- `src/domains/library/search.test.ts` — E-14 through E-27 tables plus validation, alias tie, malformed cursor, and runtime boundary cases.
- `src/platform/sqlite/repositories/librarySearchRepository.ts` — fixed prepared candidate queries, relational filters/rank, keyset hydration, Recent, attribution, and safe errors.
- `tests/integration/exercise-search.test.ts` — real SQLite search/filter/page/repair/rollback coverage plus scripted corruption and failure matrices.
- `scripts/run-coverage-gate.mjs` — permanent all-metrics 100% enforcement for the search domain and repository.

## Decisions Made

- Kept FTS derivative and ranking-independent: no BM25, product ranking, Favorite boost, Recent boost, source-order boost, or raw MATCH interpolation.
- Used bound JSON arrays with `json_each` for canonical OR-within filter values, avoiding dynamic placeholder or SQL-fragment generation.
- Computed the keyset rank before hydration and fetched one extra candidate to determine `nextCursor`, then hydrated exactly the complete page IDs.
- Treated `copied` origin as the user-facing `Custom` label because only bundled rows are built-in source content.
- Kept cursor signing validation-local and deterministic because it protects pagination integrity rather than an authorization boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected prepared candidate parameter ordering**
- **Found during:** Task 2 first GREEN integration run
- **Issue:** Parameters were initially assembled by conceptual query section, but SQLite binds anonymous placeholders in lexical SQL order, beginning with filter CTEs.
- **Fix:** Bound filter, strategy candidate, rank, cursor, and limit parameters in the exact fixed-statement placeholder order.
- **Files modified:** `src/platform/sqlite/repositories/librarySearchRepository.ts`
- **Verification:** All short/trigram/filter/keyset integration cases and the merged 1,033-test gate pass.
- **Committed in:** `6541be3`

**2. [Rule 2 - Missing Critical] Hardened raw runtime input bounds before SQL**
- **Found during:** Task 2 threat-register review
- **Issue:** TypeScript callers were bounded after normalization, but malformed runtime filter containers and normalization-expanding raw text also needed fail-closed validation.
- **Fix:** Validate raw code-point length before NFKD expansion and reject non-string queries, malformed filter objects, non-array groups, invalid enum values, and non-boolean flags.
- **Files modified:** `src/domains/library/search.ts`, `src/domains/library/search.test.ts`
- **Verification:** Focused search coverage remains 100% across all four metrics.
- **Committed in:** `6541be3`

**3. [Rule 2 - Missing Critical] Added permanent integrity-critical coverage enforcement**
- **Found during:** Task 2 pre-commit rule verification
- **Issue:** Project rules require complete branch coverage for integrity-critical modules, but the new search modules were not yet enumerated.
- **Fix:** Added both modules to `scripts/run-coverage-gate.mjs` and added reachable negative-path coverage rather than exclusions.
- **Files modified:** `scripts/run-coverage-gate.mjs`, both search test files
- **Verification:** The merged gate reports 42 integrity-critical files at 100% statements, branches, functions, and lines.
- **Committed in:** `6541be3`

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 2 Rule 2 missing critical)
**Impact on plan:** All fixes were required for correct prepared binding, trust-boundary validation, and the project's non-negotiable integrity gate; no product scope was added.

## Issues Encountered

- The retained v5 fixture already contains a completed Plank exposure, so global Recent correctly includes it; query-filtered Recent intersects that top-ten set and returns nine `Recent Exercise` rows.
- Strict Jest tuple typing required named table cases for readonly parameter compatibility.

## Known Stubs

None.

## Threat Flags

None. The only new trust surface is the planned owner-text/filter-to-SQL/FTS boundary, covered by fixed prepared templates, pre-normalization bounds, quoted bound MATCH data, relational authority, typed cursor restart, and bounded diagnostics.

## User Setup Required

None - no packages, external services, credentials, or manual configuration required.

## Next Phase Readiness

- Library and custom-exercise UI plans can consume stable `LibrarySearchItem`, source attribution, alias cause, Favorite, Recent, and cursor restart contracts.
- Runtime composition can register `createLibrarySearchRepository` alongside the already-proven FTS repair repository without changing migration ownership.
- `.planning/WINDOWS.md` remains at zero open defects; no stubs, skipped tests, unrun verification, or raw search diagnostics remain.

## Self-Check: PASSED

- All four implementation/test artifacts and the coverage-gate update exist.
- Commits `ec442e1`, `330e028`, `9a97bae`, and `6541be3` exist in Git history.
- Coverage metadata classifies all three deliverables as auto-covered by passing evidence.
- `.gsd/dispatch-isolation-sentinel.json` remains byte-identical to its initial SHA-256.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
