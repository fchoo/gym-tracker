---
phase: 17
plan: "07"
subsystem: library-exercises
tags: [library, exercise-detail, sqlite, content-catalog, metric-migration]
requires: [17-01]
provides: [source-backed-bundled-instructions, ownership-aware-exercise-detail]
affects: [library, custom-exercises, content-import, exercise-search]
tech-stack:
  added: [SQLite migration 37]
  patterns: [accepted-catalog provenance, fail-closed bundled detail projection]
key-files:
  created: [src/platform/sqlite/migrations/0037_exercise_instruction_sets.ts]
  modified: [src/domains/content/catalog.ts, src/platform/sqlite/repositories/contentRepository.ts, src/bootstrap/customExerciseRuntimeReadPort.ts, src/ui/screens/ExerciseDetailScreen.tsx]
decisions:
  - Bundled instruction steps are accepted catalog facts with source provenance; custom and copied exercises intentionally have none.
  - Linked legacy entries cite their existing approved upstream source; preserved legacy entries retain Original Gym Tracker provenance.
metrics:
  duration: 45m
  completed: 2026-10-11
status: complete
actuals:
  tokens: 67632
  tasks: 3
  commits: 4
---

# Phase 17 Plan 07: Source-backed exercise detail and ownership lifecycle Summary

Bundled exercise detail now reads accepted, provenance-bound instruction steps from SQLite while retaining custom ownership, copy, archival, and metric-migration boundaries.

## Completed Work

- Added catalog schema v2 instruction steps and provenance to all 310 bundled rows, refreshed manifest/acceptance hashes, and rejected empty or malformed instruction content.
- Added migration 37 and the `exercise_instruction_sets` read model; imports are atomic, idempotent, upgrade-safe, and leave user-owned exercises without fabricated instructions.
- Exposed the new data through the authoritative custom-exercise runtime detail read port, failing closed if a bundled row is missing or malformed.
- Rendered sourced instructions in bundled exercise detail and verified that user-owned exercise details do not display invented bundled instructions.
- Re-ran custom create/edit/archive/copy and metric-migration integration coverage, retaining active-workout, stale-revision, confirmation, retry, and immutable-history guards.
- Added migration 37 to the integrity-critical 100% coverage gate.

## Verification

- `npm run test:unit -- --runInBand src/domains/content/catalog.test.ts`
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/content-library.test.ts`
- `npm run test:integration -- --runInBand tests/integration/content-import.test.ts`
- `npm run test:components -- --runInBand src/ui/__tests__/CustomExerciseScreens.test.tsx`
- `npm run test:integration -- --runInBand tests/integration/custom-exercise.test.ts tests/integration/metric-profile-migration.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run check:boundaries`
- `npm run test:unit -- --runInBand src/domains/shared/tooling.test.ts`

`npm run test:coverage -- --runInBand` was started with the new migration in the integrity gate; its four-project run did not return a final result in the execution harness. Focused catalog, repository, migration, component, and integration verification above passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Repaired the source-backed bundled exercise-instructions model.**

- **Found during:** Task 1
- **Issue:** LIB-19 required instructions, but the accepted catalog, SQLite content tables, importer, and authoritative detail read path contained no instruction field. Rendering a UI fixture or fallback would have violated the SQLite-authoritative and bundled-versus-user-owned contracts.
- **Fix:** Added validated catalog instruction steps with provenance, refreshed acceptance hashes, added forward-only SQLite migration 37 and importer projection, and made bundled detail reads fail closed when that data is absent or malformed.
- **Files modified:** Catalog assets/parser, `contentRepository`, migration 37, detail read port, detail screen, and focused tests.
- **Commit:** `8b557100`

## Known Stubs

None.

## Self-Check: PASSED

- Source-backed catalog, migration, repository, runtime read port, and exercise detail files exist.
- Commits `8b557100`, `3df9c62b`, `9da793a1`, and `7ba6b7de` exist on `fchoo/UX-revamp`.
