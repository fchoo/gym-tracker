---
phase: 05-recovery-distribution-and-release
plan: 06
subsystem: csv-portability
tags: [csv, sqlite, expo-file-system, expo-sharing, formula-safety, audit-history]

requires:
  - phase: 05-recovery-distribution-and-release/05-03
    provides: bounded opaque cache/share lifecycle and trusted runtime portability surface
  - phase: 05-recovery-distribution-and-release/05-05
    provides: authoritative corrected/voided history and complete recommendation source facts
provides:
  - fixed version-1 RFC 4180 CSV schema with canonical JSON and locale-independent atomic values
  - overlay-authoritative session/set export plus immutable audit and complete recommendation lifecycle rows
  - bounded deterministic cache-file lifecycle with opaque handles and explicit system sharing
  - accessible Data and recovery CSV states with exact privacy disclosure and duplicate-press latching
affects: [final-release-gate, owner-data-analysis, portability-contract]

actuals:
  tokens: 27288
  tasks: 2
  commits: 10

tech-stack:
  added: []
  patterns: [record-type CSV rows, canonical binary-key JSON, query-only serialized snapshot, opaque share handle]

key-files:
  created:
    - src/domains/portability/csvExport.ts
    - src/platform/sqlite/repositories/csvExportRepository.ts
    - src/platform/files/expoCsvFilePort.ts
  modified:
    - src/bootstrap/workoutAppRuntime.tsx
    - app/more/data-and-recovery.tsx
    - scripts/run-coverage-gate.mjs

key-decisions:
  - "CSV v1 is one fixed record-type table: sessions, exercises, sets, immutable history audit events, and legacy/owned recommendations share one versioned header without Cartesian joins."
  - "An effective history overlay wholly replaces raw session/exercise/set rows; raw facts remain only as original time context, while lifecycle and immutable correction/void/restore audit rows stay separate."
  - "JSON cells are recursively canonicalized with binary code-unit key ordering, and text cells are formula-neutralized after leading whitespace/control detection before RFC 4180 quoting."
  - "CSV creation reads source facts through one serialized query-only snapshot and never mutates SQLite; the cache URI remains private behind a fixed opaque handle."

patterns-established:
  - "Readable export pattern: stable schema and atomic units preserve analysis fidelity while canonical JSON retains complete versioned metric and recommendation context."
  - "Sharing pattern: deterministic cache filename, stale/partial replacement, bounded bytes, opaque handle, and deletion after success, unavailability, or rejection."

requirements-completed: [DATA-07]
coverage:
  - id: D1
    description: Versioned CSV bytes have a fixed header/order, canonical UTF-8 JSON, CRLF termination, invariant numeric/time values, all nine metric profiles, explicit atomic units, and spreadsheet-formula neutralization.
    requirement: DATA-07
    verification:
      - kind: unit
        ref: src/domains/portability/csvExport.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: SQLite exports raw or overlay-authoritative history without mixing them, preserves immutable audit events, and includes legacy/owned recommendations in every lifecycle status without source writes.
    requirement: DATA-07
    verification:
      - kind: integration
        ref: tests/sqlite-host/csvExportRepository.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Deterministic cache output remains bounded and URI-private, replaces stale/partial files, and is deleted after every explicit share outcome.
    requirement: DATA-07
    verification:
      - kind: unit
        ref: src/platform/files/expoCsvFilePort.test.ts
        status: pass
    human_judgment: false
  - id: D4
    description: Data and recovery exposes exact readable-file privacy copy plus non-optimistic preparing, ready, sharing, failure, retry, and duplicate-press states.
    requirement: DATA-07
    verification:
      - kind: automated_ui
        ref: app/more/__tests__/data-and-recovery.test.tsx
        status: pass
    human_judgment: false
  - id: D5
    description: All CSV trust-boundary modules remain permanently enforced at 100 percent statements, branches, functions, and lines.
    requirement: DATA-07
    verification:
      - kind: other
        ref: scripts/run-coverage-gate.mjs
        status: pass
    human_judgment: false

duration: 50m
completed: 2026-08-26
status: complete
---

# Phase 05 Plan 06: Deterministic CSV Export and Sharing Summary

**Owner-readable CSV now preserves authoritative history, audit, metric, and recommendation facts in byte-stable formula-safe rows, then shares them through a bounded URI-private cache lifecycle.**

## Performance

- **Duration:** 50 minutes
- **Started:** 2026-08-26T11:14:08Z
- **Completed:** 2026-08-26T12:03:50Z
- **Tasks:** 2 completed
- **Files modified:** 10

## Accomplishments

- Froze CSV format version 1 with one fixed header and deterministic record ordering for session, exercise, set, history-audit, and recommendation rows.
- Preserved original and effective civil/UTC time context, correction and active/voided lifecycle state, immutable correction/void/restore events, every recommendation status from both target graphs, canonical evidence/target JSON, and all nine metric profiles with explicit atomic-unit columns.
- Added RFC 4180 quoting, one terminal CRLF, recursive binary-key JSON canonicalization, and formula neutralization after leading whitespace/control detection while retaining true numeric negatives.
- Collected all facts through a single serialized query-only SQLite snapshot; an effective overlay wholly replaces raw exercise/set rows and no export failure writes source state.
- Added deterministic bounded UTF-8 cache output, stale and partial cleanup, opaque handles, explicit system sharing, and deletion after success, share unavailability, or share rejection.
- Added generation-scoped opaque handles plus idempotent discard so unshared exports are removed on route unmount, late completion after unmount, or replacement without allowing stale cleanup to delete a newer file.
- Added exact Data and recovery copy and accessible non-optimistic preparing, ready, share, error, retry, and independent duplicate-press latch states.

## Automated Checks

- Task 1 tracer gate — passed: 1 serializer suite with 24 tests and 1 host-SQLite suite with 2 tests at the committed tracer point.
- Final focused CSV verification — passed after the review fix: 3 unit/host suites, 38 tests, with all three CSV trust-boundary modules at 100% statements, branches, functions, and lines.
- Data and recovery component suite — passed after the review fix: 1 suite, 14 tests, including unmount/back cleanup, late completion cleanup, and share-consumed ownership.
- Whole-repository automated gate after the review fix — passed: 134 suites and 2,340 tests.
- Global coverage after the review fix — passed: 90.97% statements, 85.85% branches, 90.30% functions, and 91.15% lines.
- Permanent integrity gate — passed: all 83 registered files at 100% statements, branches, functions, and lines; the serializer, SQLite read model, and file lifecycle each individually recorded 100% for every metric.
- Typecheck, lint, 223-file boundary check, and diff hygiene passed.
- No Android build, emulator/device, Maestro, accessibility, design, signing, publishing, or owner verification was run; Phase 05 Plan 05-07 remains the sole exact-candidate gate.

## Task Commits

1. **Task 1 RED: Freeze CSV contract tests** — `0f6e546` (`test`)
2. **Task 1 GREEN: Implement deterministic factual export** — `0ccc909` (`feat`)
3. **Task 2 RED: Define sharing lifecycle and UI states** — `c98818a` (`test`)
4. **Task 2 GREEN: Wire bounded file sharing and UI** — `972db59` (`feat`)
5. **Integrity registration and focused coverage expansion** — `982a251` (`test`)
6. **Permanent all-branch CSV integrity proof** — `872a23f` (`test`)
7. **Review RED: Reproduce abandoned ready-file cleanup** — `81ace37` (`test`)
8. **Review GREEN: Add generation-safe discard through file/runtime/UI** — `e8fe588` (`fix`)
9. **Share-cleanup retry hardening** — `ef9ce0b` (`fix`)
10. **Externally removed file idempotence coverage** — `6ad532b` (`test`)

## Files Created/Modified

- `src/domains/portability/csvExport.ts` — fixed v1 schema, metric atom projection, canonical JSON, formula-safe RFC serializer.
- `src/platform/sqlite/repositories/csvExportRepository.ts` — serialized query-only source read model with raw/overlay authority and audit/recommendation rows.
- `src/platform/files/expoCsvFilePort.ts` — deterministic bounded cache write/share/delete lifecycle behind an opaque handle.
- `src/bootstrap/workoutAppRuntime.tsx` — typed CSV create/share runtime capabilities using the trusted SQLite and platform seams.
- `app/more/data-and-recovery.tsx` — exact privacy disclosure and explicit create/share state machine.
- `src/domains/portability/csvExport.test.ts`, `tests/sqlite-host/csvExportRepository.test.ts`, `src/platform/files/expoCsvFilePort.test.ts`, and `app/more/__tests__/data-and-recovery.test.tsx` — golden, source-integrity, file-lifecycle, and accessible-state coverage.
- `scripts/run-coverage-gate.mjs` — permanent 100% all-metrics enforcement for all three CSV trust-boundary modules.

## Decisions Made

- Record types share one header rather than joining independent one-to-many facts, preventing Cartesian duplication while keeping one analyzable file.
- Overlay presence selects the effective snapshot wholesale. Restore remains an immutable audit event, never a third lifecycle value.
- Recommendation JSON is retained canonically even when legacy evidence does not match the latest actionable schema; bounded fields are extracted tolerantly without dropping the source evidence.
- CSV remains readable, unencrypted, and non-restorable. The UI explicitly says it is not password-protected and requires a separate user share action.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added direct cache lifecycle tests**
- **Found during:** Task 2
- **Issue:** Component tests could not prove bounded writes, stale/partial deletion, URI containment, or cleanup after each share outcome.
- **Fix:** Added a dedicated Expo CSV file-port suite covering the production SDK 57 adapter and every cleanup branch.
- **Files modified:** `src/platform/files/expoCsvFilePort.test.ts`
- **Verification:** Focused unit suite and permanent integrity gate passed.
- **Committed in:** `c98818a`, `972db59`, `872a23f`

**2. [Rule 2 - Missing Critical] Registered every new CSV trust-boundary module in the permanent integrity gate**
- **Found during:** Final automated review
- **Issue:** The new serializer, source read model, and file lifecycle initially passed global coverage but were absent from the explicit 100% integrity allowlist.
- **Fix:** Added all three modules and closed every remaining raw/overlay/evidence/file-error branch.
- **Files modified:** `scripts/run-coverage-gate.mjs`, CSV focused test files
- **Verification:** Permanent gate passed with 83 files at 100% across statements, branches, functions, and lines.
- **Committed in:** `982a251`, `872a23f`

**3. [Rule 1 - Bug] Removed abandoned readable CSV files without replacement races**
- **Found during:** Independent post-plan review
- **Issue:** A CSV that reached `ready_to_share` remained in cache if the user navigated away without sharing; the fixed handle also could not distinguish stale cleanup from a newer replacement.
- **Fix:** Added generation-scoped opaque handles, idempotent `discardCsv`, route unmount/late-completion cleanup, share ownership transfer, and fail-closed in-flight share replacement handling.
- **Files modified:** `src/platform/files/expoCsvFilePort.ts`, `src/bootstrap/workoutAppRuntime.tsx`, `app/more/data-and-recovery.tsx`, and focused tests
- **Verification:** 38 focused unit/host tests, 14 component tests, typecheck, lint, boundaries, diff hygiene, and focused 100% all-metrics coverage passed.
- **Committed in:** `81ace37`, `e8fe588`, `ef9ce0b`, `6ad532b`

---

**Total deviations:** 3 auto-fixed (one Rule 1 bug and two Rule 2 correctness/proof additions).

**Impact on plan:** All three additions enforce the existing DATA-07 correctness and file-safety contract without broadening product behavior.

## Issues Encountered

- Context7 was unavailable, so the checked-in Expo SDK 57 type declarations and the existing production backup adapter were used as version-specific API authority.
- The repository review found the initial integrity allowlist gap; focused branch enumeration closed it before completion.
- Independent post-plan review found that abandoning a ready CSV left readable bytes in cache; TDD added an idempotent generation-safe discard lifecycle before final closure.
- `state.advance-plan` could not parse this repository's customized Current Position prose; the other GSD handlers succeeded and the equivalent narrow position/progress fields were updated directly.

## Known Stubs

None.

## Review Concerns

No unresolved Plan 05-06 code concerns. The repository still emits its pre-existing Expo Go remote-notification warning during tests; it is unrelated to CSV and does not fail any gate. Native/device and attended judgments are intentionally deferred to Plan 05-07.

## User Setup Required

None.

## Next Phase Readiness

- DATA-07 is source-complete and fully automated.
- Plan 05-07 can bind this export path to the single exact signed candidate and perform all deferred native/device/accessibility/design/owner verification without rebuilding approved bytes.

## Self-Check: PASSED

- All created production files and the canonical summary exist.
- All six Plan 05-06 task/integrity commits are present in repository history.
- Focused CSV coverage and the permanent repository coverage gate passed after the final code change.

---
*Phase: 05-recovery-distribution-and-release*
*Completed: 2026-08-26*
