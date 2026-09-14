---
phase: 02-owned-library-and-planning
plan: 13
subsystem: database
tags: [sqlite, custom-exercises, ownership, fts5, idempotency, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Complete metric identity registry and future-only custom metric migration contracts
  - phase: 02-owned-library-and-planning
    provides: Authoritative relational exercise search with same-transaction FTS synchronization and owner visibility preferences
provides:
  - Strict create/edit custom-exercise commands with explicit metric identity, manual Hold fallback, bounded taxonomy/equipment/aliases, expected revisions, and deterministic duplicate warnings
  - Atomic custom source, library, preference, taxonomy, alias, search-term, and FTS persistence through the private serialized writer
  - Revision-safe Favorite, hide/show, fresh custom copy, archive/restore, affected-plan preview, and runnable Archived reference behavior
  - Executable E-28 through E-33 identity, boundary, Unicode, ordering, request replay, rollback, and serialized conflict tests
affects: [library-ui, custom-exercise-editor, plan-editor, phase2-runtime-composition, phase2-verification]

actuals:
  tokens: 40882
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Custom source, library, preference, alias, taxonomy, search-term, and FTS facts change in one serialized transaction
    - Duplicate warnings bind normalized canonical name to complete metric profile/version and overlapping equipment with stable exercise-ID order
    - Archive confirmation binds exercise, preference, plan, day, and occurrence revision facts into one deterministic preview fingerprint
    - Bundled rows expose owner preference mutations and fresh custom copies but no source-field edit path

key-files:
  created:
    - src/domains/library/customExerciseCommands.ts
    - src/domains/library/customExerciseCommands.test.ts
    - src/platform/sqlite/repositories/customExerciseRepository.ts
    - tests/integration/custom-exercise.test.ts
  modified:
    - scripts/run-coverage-gate.mjs

key-decisions:
  - "New custom exercises require a complete registered metric identity; no profile is inferred and absent progression is normalized to explicit manual Hold."
  - "Likely duplicates require normalized-name equality, the same metric profile and contract version, and overlapping equipment; candidates are returned in stable exercise-ID order and creation requires exact create_anyway acknowledgement."
  - "Create replay is reconstructed from committed SQLite source, preference, alias, taxonomy, and search facts after repository recreation; mismatched committed facts fail as an idempotency conflict."
  - "Bundled source rows are immutable: Favorite and hide mutate only owner preferences, while Create custom copy writes a fresh origin=custom identity with null source namespace/upstream ID and no catalog-source row."
  - "Archive and restore change only owner preference state, preserve source/history/plan references, and reject stale exercise, preference, plan, day, occurrence, or preview revisions."

patterns-established:
  - "Ownership pattern: origin predicates classify bundled preference authority separately from custom source-edit authority."
  - "Preview pattern: affected-plan reads cover both retained plan_day_exercises and owned_plan_day_exercises, then hash only bounded IDs, names, and revisions."
  - "Acknowledgement pattern: invalidations are exact stable keys and execute only after the serialized transaction commits."
  - "Integrity pattern: both custom-exercise modules are permanently enforced at 100 percent statements, branches, functions, and lines."

requirements-completed: [LIB-05]

coverage:
  - id: D1
    description: "E-28 through E-33 lock empty/single boundaries, identity collisions, Unicode names, stable duplicate order, exact request replay, rollback, and serialized stale edits."
    requirement: LIB-05
    verification:
      - kind: unit
        ref: "src/domains/library/customExerciseCommands.test.ts#D-17/D-33 custom exercise command contracts"
        status: pass
      - kind: integration
        ref: "tests/integration/custom-exercise.test.ts#LIB-05 custom exercise create/edit repository"
        status: pass
    human_judgment: false
  - id: D2
    description: "Favorite, hide/show, bundled edit rejection, and Create custom copy preserve source authority while synchronizing preference or fresh custom search state atomically."
    requirement: LIB-05
    verification:
      - kind: integration
        ref: "tests/integration/custom-exercise.test.ts#LIB-05 bundled hide and custom copy lifecycle"
        status: pass
    human_judgment: false
  - id: D3
    description: "Revision-bound archive/restore excludes archived exercises from new selection while preserving history and runnable plan references with the literal Archived label."
    requirement: LIB-05
    verification:
      - kind: integration
        ref: "tests/integration/custom-exercise.test.ts#LIB-05 custom archive and restore lifecycle"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false

duration: 53 min
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 13: Custom Exercise Lifecycle Summary

**Explicit-profile custom exercises with deterministic duplicate confirmation, atomic search synchronization, ownership-safe Favorite/hide/copy behavior, and revision-bound archive/restore**

## Performance

- **Duration:** 53 min
- **Started:** 2026-08-18T06:04:59Z
- **Completed:** 2026-08-18T06:57:45Z
- **Tasks:** 2
- **Tracked files changed:** 5
- **Implementation commits:** 4
- **Focused custom-exercise contracts:** 83 passed
- **Merged gate:** 1,116 tests passed across 56 suites
- **Integrity-critical gate:** 44 files at 100% statements, branches, functions, and lines

## Accomplishments

- Added strict custom exercise create/edit inputs with explicit registered metric identity, no load/reps inference, explicit/manual progression validation, Unicode-safe canonical normalization, and bounded aliases/taxonomy/equipment.
- Implemented D-17 duplicate classification by normalized name, metric profile/version, and similar equipment, with stable exercise-ID ordering and exact `create_anyway` candidate acknowledgement.
- Committed custom source rows, owner preferences, aliases, taxonomy, canonical/alias search terms, and trigger-maintained FTS state in the same private FIFO transaction.
- Added persistent Favorite and hide/show preference commands without mutating bundled source fields or search-term facts.
- Added `Create custom copy` as a fresh `origin='custom'` identity with no source namespace, upstream ID, catalog-source row, mutable upstream link, or transferred history.
- Added revision-bound affected-plan previews across retained and owned occurrence graphs, reversible archive/restore, default-selection exclusion, explicit Archived reads, and complete rollback.
- Proved exact create replay after repository recreation, payload-conflict rejection, post-commit-only invalidation, and serialized stale edit rejection.

## Task Commits

1. **Task 1 RED: Explicit custom create contracts** — `332e10a`
2. **Task 1 GREEN: Atomic create-to-search custom exercise path** — `c590e97`
3. **Task 2 RED: Ownership and lifecycle contracts** — `4bc698a`
4. **Task 2 GREEN: Favorite/hide/copy/archive/restore lifecycle** — `3a80a8e`

## Files Created/Modified

- `src/domains/library/customExerciseCommands.ts` — strict create/edit/Favorite/hide/copy/archive/restore command boundaries and preview contracts.
- `src/domains/library/customExerciseCommands.test.ts` — D-17, D-27 through D-29, D-33, validation matrices, acknowledgement timing, and E-28 through E-33 tests.
- `src/platform/sqlite/repositories/customExerciseRepository.ts` — ownership-safe source/preference persistence, duplicate classification, committed-state replay, plan-impact preview, and exact invalidations.
- `tests/integration/custom-exercise.test.ts` — real SQLite create/search, FTS, replay, rollback, ownership, copy, preference, archive/restore, and reference-preservation proof.
- `scripts/run-coverage-gate.mjs` — permanent complete all-metrics coverage enforcement for both new integrity-critical modules.

## Decisions Made

- Metric identity means the complete registered `(profile, contractVersion, exerciseMetricGeneration)` tuple. Creation never infers a profile and defaults only the progression decision to manual Hold.
- Duplicate confirmation is advisory and exact: no automatic rename, merge, source update, or hidden permanent block occurs.
- Search-term writes rely on the existing FTS triggers, so acknowledged custom source state and the derivative index cannot diverge at commit.
- Favorite/hide/archive remain owner preference facts. They do not modify bundled source rows, catalog attribution, taxonomy, aliases, or canonical search terms.
- Archive previews include every affected plan occurrence and bind all relevant revisions; a changed plan or preference invalidates the preview before writes.
- Existing plan and historical session references retain the original exercise ID. Archive changes selection visibility and the literal status label only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Reconstructed create replay from committed SQLite facts**
- **Found during:** Task 2 integrity review.
- **Issue:** Initial exact replay used a process-local receipt map, so restarting the repository could turn a successfully committed create retry into an identity collision.
- **Fix:** Reconstruct exact create replay from committed exercise, library, preference, alias, taxonomy, and search facts; return `already_committed` only when every authoritative value matches and reject drift as an idempotency conflict.
- **Files modified:** `src/platform/sqlite/repositories/customExerciseRepository.ts`, `tests/integration/custom-exercise.test.ts`
- **Verification:** Exact replay passes after closing and reopening the SQLite kernel; changed committed state fails without writes.
- **Committed in:** `3a80a8e`

**2. [Rule 2 - Missing Critical Functionality] Added the explicit Favorite preference lifecycle**
- **Found during:** Task 2 final plan-action audit.
- **Issue:** The first lifecycle expansion implemented hide/archive preference writes but omitted the plan's explicit Favorite/hide/archive same-transaction requirement.
- **Fix:** Added revision-safe Favorite/unfavorite commands on the shared owner preference primitive with exact replay, payload-conflict rejection, source immutability, search-filter visibility, and post-commit invalidations.
- **Files modified:** `src/domains/library/customExerciseCommands.ts`, `src/domains/library/customExerciseCommands.test.ts`, `src/platform/sqlite/repositories/customExerciseRepository.ts`, `tests/integration/custom-exercise.test.ts`
- **Verification:** Favorite on/off, replay, stale revision, missing exercise, filtered search, bundled source-byte preservation, focused coverage, and merged coverage tests pass.
- **Committed in:** `3a80a8e`

**3. [Rule 2 - Missing Critical Functionality] Enforced complete coverage for integrity-critical custom lifecycle modules**
- **Found during:** Task 2 pre-commit project-rule verification.
- **Issue:** Project rules require complete branch coverage for integrity-critical modules, but the new command and repository modules were not yet part of the permanent gate.
- **Fix:** Added both files to `scripts/run-coverage-gate.mjs` and closed all reachable command, ownership, duplicate, replay, preference, copy, archive, and rollback branches with executable tests.
- **Files modified:** `scripts/run-coverage-gate.mjs`, `src/domains/library/customExerciseCommands.test.ts`, `tests/integration/custom-exercise.test.ts`
- **Verification:** `npm run test:coverage -- --runInBand` passes 1,116 tests and reports both modules at 100% statements, branches, functions, and lines.
- **Committed in:** `3a80a8e`

---

**Total deviations:** 3 auto-fixed Rule 2 missing critical controls
**Impact on plan:** All three additions close authority, completeness, and verification gaps required by the written plan and project rules. No package, schema, migration, runtime composition, UI, network, authentication, permanent deletion, or mutable upstream-link scope was added.

## Issues Encountered

- The retained v6 fixture intentionally lacks bundled Squat taxonomy and canonical search rows, so focused tests seed only the authoritative facts needed for Favorite/hide/custom-copy behavior instead of rewriting the historical fixture.
- Legacy exercise equipment may exist only as `exercises.equipment`; duplicate matching accepts exact canonical equipment and the legacy `Body Only` label as similar to `bodyweight`.
- The shell emitted a recurring non-fatal `compdef: _comps: assignment to invalid subscript range` warning after successful commands; it did not affect tests, commits, or artifacts.
- The pre-existing untracked `.gsd/dispatch-isolation-sentinel.json` remained byte-identical and unstaged.

## Known Stubs

None. The changed files contain no TODO/FIXME, skipped tests, placeholder product data, incomplete UI feed, or unrun verification.

## Threat Review

- T-02-02: Names and aliases use bounded Unicode normalization; duplicate and search inputs remain bound data and no raw FTS or SQL text is accepted from commands.
- T-02-03: Bundled fields have no edit path; custom edit predicates require both source and library origins to be `custom`; copies have fresh custom identity and no catalog source.
- T-02-04: Exercise, preference, plan, day, occurrence, and preview revisions are checked inside one serialized transaction before lifecycle writes.
- T-02-05: Every create/edit input requires a registry-supported complete metric identity; no load/reps default or profile inference exists.
- T-02-07: Errors and results expose bounded codes, IDs, revisions, counts, and status labels only; no raw notes, SQL, request text, or target values enter diagnostics.
- No unplanned network endpoint, authentication path, external file access, schema migration, or new trust boundary was introduced.

## Verification

- `npm run test:integration -- --runInBand tests/integration/custom-exercise.test.ts -t "create"` — PASS.
- `npm run test:integration -- --runInBand tests/integration/custom-exercise.test.ts -t "hide|copy|archive|restore"` — PASS.
- `npm run test:unit -- --runInBand src/domains/library/customExerciseCommands.test.ts` — PASS, 61 tests.
- `npm run test:integration -- --runInBand tests/integration/custom-exercise.test.ts` — PASS, 22 tests.
- Focused two-module coverage — PASS, 100% statements, branches, functions, and lines across 83 tests.
- `npm run test:coverage -- --runInBand` — PASS, 1,116 tests; 44 integrity-critical files at 100% all metrics.
- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm run check:boundaries` — PASS.
- Permanent-delete, bundled-source update, catalog-source update, mutable upstream-link, stub, skipped-test, and threat-surface scans — PASS with no findings.
- All four implementation commits exist, delete no tracked files, and contain the required TRAE CLI trailer exactly once.

## User Setup Required

None - no package installation, credentials, external service, schema migration, or manual device action is required.

## Next Phase Readiness

- Library/custom-exercise UI can bind ordinary create, custom edit, Favorite, hide/show, Create custom copy, affected-plan preview, archive, restore, and exact invalidation contracts.
- Plan detail/editor reads can use `listExercisePlanReferences` to retain runnable Archived occurrences without replacing identity or moving history.
- Runtime composition may register `createCustomExerciseRepository` alongside the existing search repository without changing migration ownership.
- `.planning/WINDOWS.md` remains at zero open defects; no stubs, skipped tests, unrun verification, or deferred lifecycle gaps remain.

## Self-Check: PASSED

- All five tracked implementation artifacts and this summary exist.
- Commits `332e10a`, `c590e97`, `4bc698a`, and `3a80a8e` exist and carry the required TRAE CLI trailer exactly once.
- Coverage metadata classifies all three LIB-05 deliverables as auto-covered by passing evidence.
- No tracked files were deleted; migration files and fixtures remain unchanged.
- `.gsd/dispatch-isolation-sentinel.json` remains byte-identical and unstaged.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
