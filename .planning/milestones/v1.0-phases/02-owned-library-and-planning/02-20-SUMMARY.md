---
phase: 02-owned-library-and-planning
plan: 20
subsystem: testing
tags: [expo-sqlite, native-contracts, migrations, content, search, metrics, starters, owned-plans, schedules, tdd]

requires:
  - phase: 01-trustworthy-workout-loop
    provides: Private FIFO BEGIN IMMEDIATE kernel, Phase 1 native route/runner, retained migration semantics, and bounded machine results
  - phase: 02-owned-library-and-planning
    provides: Accepted content/starter bytes, final ordered migration manifest, metrics, owned/custom repositories, plan-impact commands, and schedule persistence from Plans 02-06 through 02-18
provides:
  - Twenty-nine globally unique shared Phase 2 native cases across content, search, metrics, starters, plans/custom exercises, and schedules
  - Complete source-owned E-01 through E-78 metadata with LIB requirement, category, and focused source-test references
  - Distinct development-test native suites plus one aggregate phase2 suite with exact exported-ID-derived counts
  - Strict evidence-runner validation that rejects unsupported suites, duplicate/drifted IDs, failed/skipped cases, and extra raw payload fields
affects: [02-21-exact-apk-evidence, native-sqlite-contracts, phase2-verification, release-evidence]

actuals:
  tokens: 45148
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - Shared native cases exercise production domain/repository paths through a private SQLite kernel rather than accepting SQL or arbitrary payloads
    - Aggregate totals concatenate exported source-owned case IDs; no Phase 2 count is hardcoded
    - Final migration-manifest ownership remains in Plan 02-11 while contracts consume the ordered 1,2,3,4,5,6,8,9 export read-only
    - Machine results expose only case IDs, status, counts, bounded error codes, and timing

key-files:
  created:
    - src/testing/contracts/phase2Content.contract.ts
    - src/testing/contracts/phase2Search.contract.ts
    - src/testing/contracts/phase2Metrics.contract.ts
    - src/testing/contracts/phase2Starter.contract.ts
    - src/testing/contracts/phase2Plan.contract.ts
    - src/testing/contracts/phase2Schedule.contract.ts
    - src/testing/contracts/phase2Content.contract.test.ts
    - src/testing/contracts/phase2Metrics.contract.test.ts
    - src/testing/contracts/phase2Shared.contract.test.ts
  modified:
    - app/__native-contracts.tsx
    - scripts/run-native-sqlite-contracts.mjs

key-decisions:
  - "The aggregate phase2 suite contains exactly the six Plan 02-20 modules and 29 unique source-owned cases; the existing eight-case phase2-fts prerequisite remains a separate preserved suite."
  - "Every native case uses a fresh database and the production parser, migration, domain, or repository path; contract-local seeds create authoritative source rows, not probe-only shadow behavior."
  - "The route and runner derive all Phase 2 totals from exported IDs and reject unsupported suite names instead of falling back to a generic ten-case expectation."
  - "Plan 02-11 remains the sole writer of src/platform/sqlite/migrations/index.ts; Plan 02-20 consumes the exact final manifest without editing it."

patterns-established:
  - "Contract metadata pattern: unique case ID plus requirement, category, edge IDs, and focused source-test reference."
  - "Aggregate runner pattern: concatenate exact module results, require zero failed/skipped cases, then emit the same bounded result schema."
  - "Retained migration pattern: create authoritative prior-version facts, advance through the exported migration slice, and compare source/JSON bytes before and after."

requirements-completed: [LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-11, LIB-12]

coverage:
  - id: D1
    description: "Accepted content, retained v2/v3/v4 upgrades, D-50/D-51 updates, punctuation-safe search, rank/page bounds, FTS parity, rebuild, and rollback execute through shared host/native adapters."
    requirement: LIB-10
    verification:
      - kind: unit
        ref: "src/testing/contracts/phase2Content.contract.test.ts#Phase 2 shared content and search contracts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Final-manifest metrics, all nine profiles, accepted six starters with exact D-55, Library preference, owned/custom lifecycle, plan impact, and complete schedule semantics execute through shared cases."
    requirement: LIB-11
    verification:
      - kind: unit
        ref: "src/testing/contracts/phase2Metrics.contract.test.ts#Phase 2 remaining shared native contracts"
        status: pass
    human_judgment: false
  - id: D3
    description: "One aggregate Phase 2 route exposes 29 unique cases with complete E-01 through E-78 metadata and strict source-derived result validation."
    requirement: LIB-09
    verification:
      - kind: unit
        ref: "src/testing/contracts/phase2Shared.contract.test.ts#Phase 2 aggregate shared native contracts"
        status: pass
      - kind: other
        ref: "node --check scripts/run-native-sqlite-contracts.mjs"
        status: pass
    human_judgment: false

duration: 27 min
completed: 2026-08-19
status: complete
---

# Phase 02 Plan 20: Shared Phase 2 Native Contract Suite Summary

**Twenty-nine source-owned Expo SQLite-compatible cases covering six persistent domains, all 78 edge IDs, strict bounded evidence routing, and one exact-count aggregate Phase 2 suite**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-18T18:27:59Z
- **Completed:** 2026-08-18T18:54:54Z
- **Tasks:** 3
- **Tracked implementation files changed:** 11
- **Implementation commits:** 6
- **Shared Phase 2 cases:** 29 total, 29 unique
- **Edge ledger:** E-01 through E-78 complete
- **Broad behavior regression:** 1,463 tests passed across 78 suites

## Accomplishments

- Added shared content and search contracts that parse exact owner-accepted catalog bytes, migrate fresh and retained databases, import 310 reviewed exercises, preserve custom/copied authority, execute bounded punctuation/alias/rank/page queries, and prove FTS parity, integrity, rebuild, replay, and rollback.
- Added shared metrics, starter, plan/custom, and schedule contracts that consume the final migration manifest through v9, preserve legacy metric bytes, round-trip every approved profile, activate all six accepted starters, prove exact D-55 clone behavior, persist owner lifecycle commands, produce Plan 02-18 impact previews, and retain immutable history on stale writes.
- Added source-owned metadata for every case and complete E-01 through E-78 traceability with requirement/category/source-test links.
- Expanded the guarded development-test route to distinct `phase2-content`, `phase2-search`, `phase2-metrics`, `phase2-starter`, `phase2-plan`, and `phase2-schedule` suites plus aggregate `phase2`, while preserving `sqlite-kernel`, `migrations-effects`, and `phase2-fts`.
- Hardened the evidence runner to derive every expected case list from source, reject duplicate or unsupported suites, require exact keys and ordered IDs, and refuse failed/skipped/drifted results.

## Task Commits

1. **Task 1 RED: Shared content/search contracts** — `e7267a0`
2. **Task 1 GREEN: Packaged content/search implementation** — `7ed2a71`
3. **Task 2 RED: Remaining domain contracts and edge ledger** — `d89763b`
4. **Task 2 GREEN: Metrics/starters/plans/schedules implementation** — `ccfac03`
5. **Task 3 RED: Aggregate route/runner contracts** — `98ecb5d`
6. **Task 3 GREEN: Aggregate Phase 2 native suite** — `e20cd0d`

## Files Created/Modified

- `src/testing/contracts/phase2Content.contract.ts` — accepted catalog import, retained v2/v3/v4 migration, D-50/D-51 update, replay, and rollback cases.
- `src/testing/contracts/phase2Search.contract.ts` — alias/punctuation, short-query, rank/page, parity, integrity, rebuild, and rollback cases.
- `src/testing/contracts/phase2Metrics.contract.ts` — final manifest, retained v5/v6 bytes, all-profile comparator/aggregate, and metric migration rollback cases.
- `src/testing/contracts/phase2Starter.contract.ts` — exact accepted six-template, full clone, D-55, and existing-copy choice cases.
- `src/testing/contracts/phase2Plan.contract.ts` — Library preference, custom lifecycle, owned aggregate lifecycle, and plan-impact preview/rollback cases.
- `src/testing/contracts/phase2Schedule.contract.ts` — Weekday/Rotation versions, actions/overrides, midnight/DST/timezone, and revision rollback cases.
- `src/testing/contracts/phase2Content.contract.test.ts` — matched content/search host wrapper and strict result/route contracts.
- `src/testing/contracts/phase2Metrics.contract.test.ts` — matched remaining-domain host wrapper, unique-ID gate, final-manifest gate, and complete edge metadata gate.
- `src/testing/contracts/phase2Shared.contract.test.ts` — aggregate count, duplicate-ID, E-01 through E-78, suite registration, and bounded-output gate.
- `app/__native-contracts.tsx` — distinct and aggregate guarded development-test route execution with exported-ID-derived totals.
- `scripts/run-native-sqlite-contracts.mjs` — source-derived suite manifests and strict exact-result validation.

## Decisions Made

- Kept `phase2-fts` separate because it is the already-proven eight-case prerequisite suite; aggregate `phase2` contains only the six Plan 02-20 domain modules.
- Used exact accepted assets for content and starters, then contract-local authoritative custom rows only where alias, ownership, or replacement semantics require owner-created facts.
- Used final-schema source tables and production repositories for all persistent behavior; no arbitrary SQL parameter or raw product payload crosses the native route.
- Preserved the final runtime migration manifest and package scripts byte-for-byte; exact APK execution remains Plan 02-21 scope.

## Deviations from Plan

None - plan implementation executed as written.

## Issues Encountered

- The project-wide coverage run passed all 1,463 tests and every integrity-critical file threshold, but the pre-existing global function coverage total remains `89.92%` against `90%`. This exact concern was already present in `STATE.md` before Plan 02-20 and remains assigned to Plan 02-21; it is recorded in `deferred-items.md` and was not suppressed or changed here.
- Jest emits the existing non-fatal Expo Go remote-notification warning when wrappers import `workoutAppRuntime.tsx`; all focused and broad suites pass.
- The shell emits the existing non-fatal `compdef: _comps: assignment to invalid subscript range` warning after successful commands.

## Known Stubs

None. Changed implementation and test files contain no TODO/FIXME, skipped tests, placeholder product values, unconnected empty data, or unrun verification.

## Threat Review

- T-02-01: Content cases recompute exact accepted catalog, manifest, acceptance, source, and license boundaries before import; D-50/D-51 mutation remains one private serialized transaction.
- T-02-02: Search cases use fixed bounded queries and production prepared-query repositories; route and runner accept suite names only, never search text or raw SQL.
- T-02-03: Plan/custom cases preserve bundled authority, create fresh owner IDs, require exact revisions/previews, and verify stale writes leave source facts unchanged.
- T-02-04: Retained migration fixtures, exact final manifest order, expected revisions, immutable events/receipts, and rollback are exercised without modifying migration ownership.
- T-02-05: Metric and schedule cases preserve complete metric identity, legacy seconds, immutable history, LocalDate intent, prospective timezone versions, and explicit schedule events.
- T-02-06: Search parity uses the production shadow-ID integrity/rebuild path and leaves relational source rows authoritative.
- T-02-07: Native output contains only case IDs, status, counts, bounded error codes, and timing; strict validators reject extra product payload fields.
- No unplanned network endpoint, authentication path, package, schema migration, production route, or external file-access surface was introduced.

## Verification

- `npm run test:unit -- --runInBand src/testing/contracts/phase2Content.contract.test.ts` — PASS, 6 tests.
- `npm run test:unit -- --runInBand src/testing/contracts/phase2Metrics.contract.test.ts` — PASS, 4 tests and all 17 remaining-domain cases.
- `npm run test:unit -- --runInBand src/testing/contracts/phase2Content.contract.test.ts src/testing/contracts/phase2Metrics.contract.test.ts src/testing/contracts/phase2Shared.contract.test.ts` — PASS, 14 tests.
- `npm run typecheck` — PASS.
- `npm run lint` / `npm run check:boundaries` — PASS, 155 files.
- `npm run test:all` behavior suites — PASS: unit 832, components 191, host SQLite 189, integration 251; 1,463 total across 78 suites.
- `npm run test:coverage -- --runInBand` — all 1,463 tests and integrity-critical thresholds PASS; pre-existing global functions gate remains 89.92% vs 90% and is deferred to Plan 02-21.
- Runner syntax, 29-case uniqueness, E-01 through E-78 completeness, exact commit trailers, protected manifest/package files, no-deletion, no-stub, no-skipped-test, bounded-output, and sentinel scans — PASS.
- Final APK build and installed aggregate execution intentionally not run; Plan 02-21 owns the single exact-HEAD build and installed evidence.

## User Setup Required

None - no package, credential, external service, or manual configuration is required.

## Next Phase Readiness

- Plan 02-21 can build one exact development-test APK and run aggregate `phase2` with 29 source-derived cases plus the preserved Phase 1 and `phase2-fts` suites.
- The runner now rejects unsupported suites, duplicate case IDs, count/order drift, extra payload fields, and any non-passing or skipped case.
- Every requirement LIB-02 through LIB-12 and every edge E-01 through E-78 has source-owned automated traceability.
- `.gsd/dispatch-isolation-sentinel.json` remains byte-identical and untouched.

## Self-Check: PASSED

- All 11 implementation/test artifacts and this summary exist.
- Commits `e7267a0`, `7ed2a71`, `d89763b`, `ccfac03`, `98ecb5d`, and `e20cd0d` exist and carry the required TRAE CLI trailer exactly once.
- The six exported modules contain 29 total unique case IDs and complete E-01 through E-78 metadata.
- No tracked file was deleted; `package.json`, `package-lock.json`, and `src/platform/sqlite/migrations/index.ts` remain unchanged.
- `.gsd/dispatch-isolation-sentinel.json` retains SHA-256 `180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c`.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-19*
