---
phase: 18-garmin-import
plan: 07
subsystem: garmin-import-runtime
tags: [garmin, sqlite, idempotency, date-provenance, recovery, tdd]
requires:
  - phase: 13-multi-plan-running-foundation
    provides: Shared GarminSourceEnvelope prepare/confirm commands, immutable source facts, receipts, revisions, and match ledger
  - phase: 18-04
    provides: Canonical bounded GarminSourceEnvelope normalization and semantic digests
  - phase: 18-05
    provides: Generation-fenced foreground sync and shared-import orchestration contracts
provides:
  - Application-service Garmin import facade with no kernel or repository ownership
  - Zero-write prepared date proposals and explicit durable date provenance
  - Real-SQLite replay, revision, capacity, rollback, interruption, and match-pinning proof
affects: [18-08, 18-09, 18-11, 18-13, 19-progress, garmin-import]
actuals:
  tokens: 12396
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns: [application-owned service injection, prepare-confirm boundary, discriminated zero-write date decisions, post-prepare generation fence]
key-files:
  created:
    - src/bootstrap/garminImportRuntime.tsx
    - src/bootstrap/garminImportRuntime.test.tsx
  modified:
    - src/domains/activities/importCommands.ts
    - src/platform/sqlite/repositories/importedActivityRepository.ts
    - tests/integration/garmin-envelope-import.test.ts
    - tests/integration/imported-activity-facts.test.ts
key-decisions:
  - "The Garmin runtime accepts the already-created application import service and never opens a SqliteKernel or creates a repository."
  - "Timezone/DST policy remains upstream; the runtime consumes a discriminated decision, keeps every non-confirm outcome zero-write, and sends only confirmed provenance through the shared command."
  - "Every commit rechecks the captured account generation after preparation and invalidates rebuildable reads only after a newly imported result."
patterns-established:
  - "Garmin envelope commits cross only prepareGarminImport and confirmGarminImportDate; the runtime contains no SQL, provider table, or fallback identity path."
  - "Absolute/source/local/offset/zone provenance is stored inside the existing aggregate JSON without a provider-specific schema."
requirements-completed: [GAR-08, GAR-09, GAR-15]
coverage:
  - id: D18-07-SHARED-RUNTIME
    description: One canonical account envelope commits through the existing application import service and shared Phase 13 commands
    requirement: GAR-08
    verification:
      - kind: unit
        ref: src/bootstrap/garminImportRuntime.test.tsx
        status: pass
      - kind: integration
        ref: tests/integration/garmin-envelope-import.test.ts
        status: pass
    human_judgment: false
  - id: D18-07-DATE-CONFIRMATION
    description: Ambiguous dates remain zero-write until explicit provenance is confirmed and durably committed
    requirement: GAR-09
    verification:
      - kind: unit
        ref: src/bootstrap/garminImportRuntime.test.tsx#prepared date and non-confirm decisions
        status: pass
      - kind: integration
        ref: tests/integration/garmin-envelope-import.test.ts#midnight provenance and DST outcomes
        status: pass
    human_judgment: false
  - id: D18-07-RECOVERY-MATRIX
    description: Replay, changed revision, capacity, stale generation, interruption, rollback, and accepted-match pinning preserve authoritative facts
    requirement: GAR-15
    verification:
      - kind: integration
        ref: tests/integration/garmin-envelope-import.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/imported-activity-facts.test.ts
        status: pass
      - kind: other
        ref: npm run typecheck -- --pretty false && npm run check:boundaries
        status: pass
    human_judgment: false
duration: 12m 30s
completed: 2026-10-11
status: complete
---

# Phase 18 Plan 07: Shared Garmin Import Runtime Summary

**One application-owned import service now commits bounded Garmin account envelopes through the shared Phase 13 transaction, with explicit date provenance and replay-safe recovery.**

## Performance

- **Duration:** 12m 30s
- **Started:** 2026-10-11T09:18:01Z
- **Completed:** 2026-10-11T09:30:31Z
- **Tasks:** 3
- **Files modified:** 6
- **Commits:** 6 TDD commits plus this metadata commit

## Accomplishments

- Added a framework-light Garmin import runtime that receives the existing application import service, calls only `prepareGarminImport` and `confirmGarminImportDate`, and has no kernel/repository creation or SQL path.
- Added zero-write prepared-date proposals and discriminated cancel/stale/invalid/DST-gap outcomes, while explicit confirmation durably preserves absolute, source-local, owner-local, offset, and zone provenance.
- Proved exact/concurrent replay, lost acknowledgement, changed source revision, strict external identity, capacity limit+1, forbidden FIT fallback, stale generation, every repository statement cut, precommit rollback, and accepted-match pinning against real SQLite.

## Task Commits

1. **18-07-01 RED — shared-envelope tracer:** `6c8d449d`
2. **18-07-01 GREEN — app-owned shared import facade:** `98450411`
3. **18-07-02 RED — date-confirmation matrix:** `fef16c86`
4. **18-07-02 GREEN — durable explicit date provenance:** `23aaf044`
5. **18-07-03 RED — recovery/revision/capacity matrix:** `007b316c`
6. **18-07-03 GREEN — post-prepare generation fence:** `20dc570e`

## Files Created/Modified

- `src/bootstrap/garminImportRuntime.tsx` — shared-service facade, prepared date proposals, zero-write outcomes, confirmation, generation recheck, and post-commit invalidation.
- `src/bootstrap/garminImportRuntime.test.tsx` — 8 focused unit cases for command routing, failure isolation, date decisions, and generation fencing.
- `src/domains/activities/importCommands.ts` — additive confirmed provenance contract and shared boundary validation.
- `src/platform/sqlite/repositories/importedActivityRepository.ts` — existing aggregate JSON now retains confirmed date provenance without a new table or command.
- `tests/integration/garmin-envelope-import.test.ts` — 11 real-SQLite envelope/runtime cases covering commit, replay, dates, identity, revision, capacity, and match stability.
- `tests/integration/imported-activity-facts.test.ts` — 4 shared repository cases including all nine statement cuts and precommit interruption rollback.

## Decisions Made

- The runtime depends on an injected `importedActivities` service created by the root application from its sole `SqliteKernel`; Garmin code cannot open a second database or invent a provider repository.
- Date calculations and DST validity remain with the upstream policy boundary. The runtime receives a discriminated result and calls persistence only for `confirmed`.
- Date provenance is additive data inside the existing immutable aggregate JSON. This preserves source and owner choices without creating a Garmin-specific table or migration.
- Rebuildable reads are invalidated only for `imported`; replay, revision-review, conflict, remove-state observation, and non-confirmed date outcomes perform no redundant invalidation.

## Verification

- `src/bootstrap/garminImportRuntime.test.tsx` — 8 passed.
- `tests/integration/garmin-envelope-import.test.ts` plus `tests/integration/imported-activity-facts.test.ts` — 15 passed against real SQLite.
- `npm run typecheck -- --pretty false` — passed.
- `npm run check:boundaries` — passed across 385 files.

No full SQLite-host/global test or coverage matrix, native/device/APK action, visual/accessibility/performance run, live Garmin account request, release, push, PR, publication, or deployment was performed. The schema-27 `dirty_since_ms` global debt remains deferred to Phase 20.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Preserved confirmed date provenance through the existing shared aggregate**
- **Found during:** Task 18-07-02
- **Issue:** The shared confirmation input carried only `confirmedLocalDate`, so the plan-required absolute/source/local/offset/zone provenance would have been dropped after the runtime returned.
- **Fix:** Added an optional validated provenance object to the existing shared command and serialized it into the existing imported-activity aggregate JSON. No table, migration, repository, or provider-specific command was added.
- **Files modified:** `src/domains/activities/importCommands.ts`, `src/platform/sqlite/repositories/importedActivityRepository.ts`, `src/bootstrap/garminImportRuntime.tsx`
- **Verification:** Named runtime unit/date integration suites, strict type check, and boundary check passed.
- **Committed in:** `23aaf044`

---

**Total deviations:** 1 auto-fixed (1 Rule 2).
**Impact on plan:** The adjustment was required for T-18-07-03 and the explicit durability criterion. It remained additive and provider-independent, with no persistence-model expansion.

## Issues Encountered

- The direct type gate found two test-only annotation gaps and one readonly limit-fixture mismatch. The fixtures were typed to the existing command/Zod contracts; runtime behavior did not change.
- This owner-selected Orca linked worktree remained on the explicitly requested `fchoo/UX-revamp` branch. Cwd and branch drift checks ran before every commit.

## Authentication Gates

None. No Garmin credentials, MFA, account access, external provider call, or secret-bearing input was used.

## Known Stubs

None. Empty arrays/sets found by the stub scan are synthetic test fixtures or test collectors, not UI data sources or production placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 18-08/18-09 can consume committed activity identities and accepted revisions without provider-specific persistence or fuzzy matching.
- Later Garmin UI/runtime composition can inject this facade from the root application service graph while retaining the one-kernel boundary.
- Native/account/device evidence and comprehensive host acceptance remain deferred to Phase 20 exactly as authorized.
- Dirty Phase 14 evidence files and untracked `14-VERIFICATION.md` remain untouched and unstaged.

## Self-Check: PASSED

Verified all six declared plan files and this summary exist, all six TDD commits are reachable with the required co-author trailer, and all three coverage deliverables classify as automatically proven by passing evidence.

---
*Phase: 18-garmin-import*
*Completed: 2026-10-11*
