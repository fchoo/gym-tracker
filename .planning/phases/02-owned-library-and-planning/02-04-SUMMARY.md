---
phase: 02-owned-library-and-planning
plan: 04
subsystem: content
tags: [sqlite, content-catalog, migrations, provenance, ownership, atomic-import, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Owner-accepted 310-row catalog, exact acceptance hashes, stable Phase 1 identities, and D-50/D-51 diff semantics from Plan 02-01
  - phase: 01-trustworthy-workout-loop
    provides: Released SQLite migrations 0001-0003, serialized explicit transactions, and immutable plan/session/history facts
provides:
  - Strict runtime parser binding catalog, manifest, source hashes, owner acceptance, counts, identities, relations, and metric contracts before persistence
  - Additive migration 0004 with authoritative catalog provenance, source detail, aliases, taxonomy, owner preference, availability, and normalized search-term tables
  - Atomic bundled-only catalog import with idempotency, typed revision conflicts, exact invalidation scopes, and removals-to-Unavailable retention
  - Retained v2/v3 Phase 1 fixtures and v0-v3 byte-preservation proof without runtime manifest registration
affects: [exercise-search-fts, library-search, custom-exercises, metric-migrations, native-content-contracts]

actuals:
  tokens: 25037
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Accepted content is parsed and hash-verified completely before entering the private serialized SQLite writer
    - Migration 0004 adds an authoritative Library source graph beside released Phase 1 workout tables without widening their metric constraints
    - Bundled catalog writes are origin-scoped and preserve custom, copied, plan-reference, session, observation, and undo-snapshot facts
    - Relational search terms remain authoritative; FTS stays a later rebuildable derivative

key-files:
  created:
    - src/domains/content/catalog.ts
    - src/domains/metrics/index.ts
    - src/platform/sqlite/migrations/0004_content_library.ts
    - src/platform/sqlite/repositories/contentRepository.ts
    - tests/integration/content-import.test.ts
    - tests/migrations/fixtures/v2-phase1.sql
    - tests/migrations/fixtures/v3-phase1.sql
    - tests/sqlite-host/content-library.test.ts
  modified:
    - src/domains/content/catalog.test.ts

key-decisions:
  - "Migration 0004 is additive: exercise_library_entries and source-detail tables become authoritative Library facts while released Phase 1 exercises/session tables remain byte-stable until later metric widening."
  - "The owner-accepted catalog contains zero aliases, so runtime import persists zero alias rows rather than inventing approved facts; the schema and repository still support accepted aliases in later revisions."
  - "Content revision conflicts are checked inside the same serialized transaction, so parallel stale upgrades deterministically produce one commit and one typed conflict."
  - "Normalized search-term uniqueness is per exercise, preserving explicit duplicate-confirmation behavior for later custom exercises while the accepted bundled parser still rejects catalog-wide collisions."
  - "src/platform/sqlite/migrations/index.ts remains unchanged; Plan 02-11 is still the sole final runtime manifest owner."

patterns-established:
  - "Runtime acceptance boundary: parse bytes, recompute pack/manifest SHA-256, validate owner acceptance and every relation, then pass only typed catalog facts to persistence."
  - "Content update boundary: classify the complete pack, then perform revision insert, bundled upserts, taxonomy/search synchronization, and unavailable transitions in one kernel.write transaction."
  - "Removal boundary: missing accepted bundled rows become unavailable while stable identity, attribution, plan references, and historical snapshots remain intact."
  - "Migration ownership boundary: phase migrations may be imported directly by focused tests but are registered only by the designated final manifest plan."

requirements-completed: [LIB-02, LIB-10]

coverage:
  - id: D1
    description: "Only the exact owner-accepted 310-row catalog and matching manifest/source hashes cross the runtime parser boundary."
    requirement: LIB-02
    verification:
      - kind: unit
        ref: "src/domains/content/catalog.test.ts#accepted exercise catalog runtime boundary"
        status: pass
      - kind: other
        ref: "node scripts/run-targeted-check.mjs exercise-library"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 0004 takes retained v0, v1, v2, and v3 databases forward without changing Phase 1 IDs or source/history JSON values."
    requirement: LIB-02
    verification:
      - kind: integration
        ref: "tests/sqlite-host/content-library.test.ts#tracer migrates retained fixtures directly through 0004"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full accepted-pack import and bundled-only upgrades are atomic, idempotent, revision-safe, and retain absent bundled identities as Unavailable."
    requirement: LIB-10
    verification:
      - kind: integration
        ref: "tests/integration/content-import.test.ts#accepted content import repository"
        status: pass
    human_judgment: false
  - id: D4
    description: "Custom/copied rows, plan references, session observations, undo snapshots, and all other historical facts remain unchanged across content updates and rollback failures."
    requirement: LIB-10
    verification:
      - kind: integration
        ref: "tests/integration/content-import.test.ts#marks absent bundled rows unavailable without mutating owned or historical facts"
        status: pass
      - kind: integration
        ref: "tests/integration/content-import.test.ts#rolls source and search rows back when an import step fails"
        status: pass
    human_judgment: false

duration: 38 min
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 04: Accepted Catalog Runtime Import Summary

**Hash-bound runtime catalog parsing, additive SQLite source schema, and atomic bundled-only updates that preserve every owner and historical fact**

## Performance

- **Duration:** 38 min
- **Started:** 2026-08-17T15:19:57Z
- **Completed:** 2026-08-17T15:58:05Z
- **Tasks:** 2
- **Files modified:** 9 implementation/test files
- **Implementation commits:** 4
- **Accepted catalog rows:** 310
- **Retained migration fixtures:** v0, v1, v2, v3
- **Integrity-critical coverage:** 100% statements, branches, functions, and lines for the parser, migration 0004, and content repository

## Accomplishments

- Added a strict async runtime boundary that validates exact catalog/manifest SHA-256 values, owner approval, source hashes, versions, counts, stable ordering, Unicode, taxonomy, source relationships, search identity, and supported metric contracts before any SQLite write.
- Added forward-only additive migration `0004_content_library` with accepted content revisions, authoritative Library entries, source attribution/availability, aliases, normalized taxonomy, owner preferences, and normalized search terms while preserving released Phase 1 rows.
- Implemented full-pack D-50 import and D-51 upgrades in one private serialized `BEGIN IMMEDIATE` transaction with typed optimistic conflicts, idempotent same-pack reruns, exact post-commit invalidation scopes, and absent bundled rows retained as Unavailable.
- Proved custom/copied rows, active plan references, session target/observation JSON, undo snapshots, attribution, stable IDs, and all source facts survive upgrades and injected rollback failures byte-for-byte.
- Kept `src/platform/sqlite/migrations/index.ts` and all approved catalog/review bytes unchanged for their designated owners.

## Task Commits

1. **Task 1 RED:** `7885355` — failing accepted hash/parser, retained migration, and tracer readback contracts.
2. **Task 1 GREEN:** `86ba144` — accepted runtime parser, additive migration 0004, v2/v3 retained fixtures, and v0-v3 host tracer.
3. **Task 2 RED:** `c677b8d` — failing atomic full-import, idempotency, unavailable retention, ownership, history, and rollback contracts.
4. **Task 2 GREEN:** `f534c90` — bundled-only repository, conflict serialization, alias/taxonomy/search synchronization, and complete integrity coverage.

## Files Created/Modified

- `src/domains/content/catalog.ts` — strict accepted catalog, manifest, acceptance, normalization, error, and `ContentUpdateResult` contracts.
- `src/domains/content/catalog.test.ts` — hash drift, malformed/versioned input, E-06 through E-13, source/taxonomy/identity, and accepted-count tests.
- `src/domains/metrics/index.ts` — public metric registry barrel required for cross-domain contract validation.
- `src/platform/sqlite/migrations/0004_content_library.ts` — additive content provenance, source, availability, alias, taxonomy, owner preference, and search-term source schema.
- `src/platform/sqlite/repositories/contentRepository.ts` — complete staged classification and one-transaction bundled-only import/update repository.
- `tests/sqlite-host/content-library.test.ts` — v0-v3 migration, retained byte, schema verifier, and one-row source readback proof.
- `tests/integration/content-import.test.ts` — full pack, idempotency, update, conflict, concurrency, unavailable, ownership, history, and rollback proof.
- `tests/migrations/fixtures/v2-phase1.sql` — released migration-2 delta over immutable v1 source data.
- `tests/migrations/fixtures/v3-phase1.sql` — released migration-2/3 deltas over immutable v1 source data.

## Decisions Made

- The additive Library graph, not Phase 1's constrained workout-facing `exercises` table, holds the complete accepted metric profiles until Plan 02-07 performs the planned forward metric widening.
- The accepted pack's zero aliases remain zero runtime aliases. Synthetic accepted revision tests prove alias synchronization without modifying approved bytes.
- A content revision is identified by catalog namespace, positive revision, and exact pack hash; reusing a revision with different bytes is a typed conflict.
- Upstream removal changes only bundled Library/source availability. No exercise, plan reference, session snapshot, observation, or attribution row is deleted or substituted.
- All accepted-pack diagnostics remain bounded to stable error codes, revisions, counts, hashes, and IDs; raw instructions, workout data, and catalog payloads are never logged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Integrity] Preserved zero accepted aliases instead of inventing catalog facts**
- **Found during:** Task 1
- **Issue:** The plan's narrow tracer described one alias, but the hash-approved 310-row catalog contains zero aliases and approved bytes may not be edited.
- **Fix:** Imported the exact zero-alias catalog, created alias-capable relational schema/repository behavior, and proved alias synchronization with a separately hash-bound synthetic accepted revision.
- **Files modified:** `src/platform/sqlite/migrations/0004_content_library.ts`, `src/platform/sqlite/repositories/contentRepository.ts`, `tests/integration/content-import.test.ts`
- **Verification:** Exact accepted hash check passes; first import has `aliases: 0`; accepted update alias test passes.
- **Committed in:** `f534c90`

**2. [Rule 3 - Blocking Issue] Added the metrics public domain barrel required by boundary lint**
- **Found during:** Task 2 broad verification
- **Issue:** The content parser initially imported metric contract internals directly, violating the project's cross-domain boundary rule.
- **Fix:** Added `src/domains/metrics/index.ts` and routed the parser through the public metrics API.
- **Files modified:** `src/domains/metrics/index.ts`, `src/domains/content/catalog.ts`
- **Verification:** `npm run lint` passes across 98 source files.
- **Committed in:** `f534c90`

**3. [Rule 2 - Missing Critical Functionality] Scoped normalized search-term uniqueness per exercise**
- **Found during:** Task 2 hardening
- **Issue:** Global uniqueness would prevent Plan 02-13's explicitly confirmed custom duplicate workflow even though the accepted bundled parser already rejects catalog-wide collisions.
- **Fix:** Enforced normalized uniqueness per exercise in alias/search source tables while retaining parser-level bundled collision rejection.
- **Files modified:** `src/platform/sqlite/migrations/0004_content_library.ts`
- **Verification:** Parser duplicate-collision cases, custom/copy preservation, integration imports, and 100% migration coverage pass.
- **Committed in:** `f534c90`

**Total deviations:** 3 auto-fixed (2 Rule 2, 1 Rule 3)
**Impact on plan:** All changes were required for data integrity, project-boundary compliance, or compatibility with locked later-phase behavior. No catalog bytes, runtime manifest, packages, UI, network surface, or historical migration was changed.

## TDD Gate Compliance

- Task 1 RED: `7885355` failed on missing `catalog.ts` and `0004_content_library.ts`.
- Task 1 GREEN: `86ba144` passed the exact tracer command twice before expansion.
- Task 2 RED: `c677b8d` failed on missing `contentRepository.ts`.
- Task 2 GREEN: `f534c90` passed the exact integration suite and all broad regressions.
- No refactor-only commit was required; hardening remained part of the Task 2 GREEN slice.

## Authentication Gates

None.

## Issues Encountered

- The accepted catalog includes `bodyweight_reps` and `fixed_time`, while released Phase 1 `exercises` constrains workout-facing profiles to `load_reps` and `timed_hold`. The planned additive Library source graph preserves the full accepted truth without prematurely widening historical workout tables; Plan 02-07 owns that forward migration.
- A first classification implementation compared taxonomy in SQL row order, causing a metadata-only revision to appear as 309 updates. The comparison was made order-independent and guarded by the D-51 integration case.
- `ctx7` was unavailable and package installation was forbidden, so the installed Expo Crypto 57.0.1 type declarations were used as the version-authoritative digest API reference.
- The shell continues to print the pre-existing `compdef:153: _comps: assignment to invalid subscript range` message. Every invoked command returned its own successful status independently.

## Known Stubs

None.

## Threat Model Verification

- **T-02-01 accepted-content tampering:** pack and manifest bytes are recomputed and compared to the owner acceptance record; pinned source hashes and all cross-file facts are validated before writes.
- **T-02-03 ownership tampering:** conflicting custom/copied app IDs, foreign source namespaces, and duplicate upstream identities produce typed conflicts; SQL updates only bundled Library/source rows.
- **T-02-04 revision tampering:** same revision/different hash and stale expected revision are typed conflicts inside the serialized transaction; parallel stale updates produce one commit and one rejection.
- **T-02-07 diagnostic disclosure:** production code emits no raw catalog, workout, observation, SQL parameter, or instruction payload.
- No new network endpoint, authentication path, external file access path, dependency, or unplanned trust boundary was introduced.

## User Setup Required

None - no package installation, credentials, external services, runtime network access, or manual migration registration required.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — boundary check passed across 98 files.
- `npm run test:unit -- --runInBand` — 512/512 passed.
- `npm run test:components -- --runInBand` — 89/89 passed.
- `npm run test:sqlite:host -- --runInBand` — 139/139 passed.
- `npm run test:integration -- --runInBand` — 81/81 passed.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/content-library.test.ts -t "tracer"` — retained v0-v3 plus one accepted row passed; tracer was also rerun immediately after Task 1 commit before expansion.
- `npm run test:integration -- --runInBand tests/integration/content-import.test.ts` — 11/11 passed.
- Targeted Jest coverage — `catalog.ts`, `0004_content_library.ts`, and `contentRepository.ts` each passed 100% statements, branches, functions, and lines.
- `node scripts/run-targeted-check.mjs exercise-library` — generator/diff/acceptance hash contract passed unchanged.
- Protected-file check — no diff to `src/platform/sqlite/migrations/index.ts`, approved content assets, or review/acceptance artifacts.
- Broken-windows ledger — 0 open, 0 waived, 10 fixed entries after recording and resolving all plan deviations.

## Next Phase Readiness

- Plan 02-06 can build external-content FTS directly over authoritative `exercise_search_terms`.
- Plan 02-07 can widen workout-facing metric constraints while consuming the full Library metric identity already stored by 0004.
- Plan 02-09 can query availability, taxonomy, owner preferences, attribution, canonical terms, and aliases relationally.
- Plan 02-13 can create confirmed custom duplicates because search-term uniqueness is scoped per exercise.
- Plan 02-11 remains the sole runtime migration-manifest owner. No blocker, stub, skipped test, open broken window, or unrun verification remains.

## Self-Check: PASSED

- All nine implementation/test files exist.
- All four TDD/task commits exist and contain the required TRAE co-author trailer exactly once.
- Exact task commands, broad regressions, targeted catalog verification, protected-file checks, and complete integrity coverage passed from committed HEAD.
- Approved catalog bytes and `src/platform/sqlite/migrations/index.ts` are unchanged.
- `.gsd/dispatch-isolation-sentinel.json` remains untracked and untouched.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-17*
