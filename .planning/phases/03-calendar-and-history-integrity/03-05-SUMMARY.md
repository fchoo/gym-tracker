---
phase: 03-calendar-and-history-integrity
plan: 05
subsystem: history-lifecycle-evidence
tags: [sqlite, lifecycle, void, restore, evidence, maestro, benchmark]
requires:
  - phase: 03-calendar-and-history-integrity/03-04
    provides: Atomic effective-history mutation, audit, and rebuild infrastructure
provides:
  - Reversible completed-session void/restore lifecycle with Removed sessions management
  - Exact-HEAD automated-only Phase 3 native, Maestro, and benchmark evidence contracts
  - Source compatibility and coverage proof for the Phase 3 production schema
affects: [progress, recovery, release, final-human-gate]
actuals:
  tokens: 17000
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - Void/restore appends lifecycle/audit facts and never deletes original session rows
    - Candidate evidence binds manifest HEAD, source digest, package, APK hash, and automated producer ledgers
key-files:
  created:
    - src/domains/history/historyLifecycleCommands.ts
    - src/ui/screens/RemovedSessionsScreen.tsx
    - scripts/run-phase3-maestro.mjs
    - scripts/benchmark-phase3.mjs
    - scripts/verify-phase3-native-evidence.mjs
  modified:
    - src/platform/sqlite/repositories/historyCommandRepository.ts
    - src/platform/sqlite/repositories/historyRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - package.json
key-decisions:
  - "Remove from history is reversible, confirmation-gated, and excludes voided facts from ordinary history and derivatives."
  - "Phase 3 evidence remains automated-only until the single final physical gate after Phase 5."
patterns-established:
  - "Source compatibility tests retain released migration prefixes while accepting additive future schemas."
requirements-completed: [HIST-07]
coverage:
  - id: D1
    description: Completed sessions can be voided/restored atomically, audited, and excluded from ordinary history without deleting original facts.
    requirement: HIST-07
    verification:
      - kind: integration
        ref: tests/sqlite-host/historyCommandRepository.test.ts and tests/sqlite-host/historyRepository.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Removed sessions surface supports loading, error, empty, populated, and explicit restore confirmation states.
    requirement: HIST-07
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RemovedSessionsScreen.test.tsx
        status: pass
    human_judgment: false
  - id: D3
    description: Phase 3 automated evidence contracts reject stale source/APK identity and cannot claim attended approval.
    requirement: HIST-07
    verification:
      - kind: other
        ref: npm run test:evidence:phase3
        status: pass
    human_judgment: false
  - id: D4
    description: Physical device validation is deferred to the final shared gate without generating approval or terminal-seal material.
    verification: []
    human_judgment: true
    rationale: Final attended Android verification deliberately occurs once after Phase 5 against a signed release candidate.
duration: 2h 30m
completed: 2026-08-25
status: complete
---

# Phase 03 Plan 05: Reversible History Lifecycle and Evidence Summary

**Completed sessions now support explicit reversible removal, while Phase 3 automated evidence is exact-identity bound and deliberately defers physical approval.**

## Accomplishments

- Added confirmation-gated void and restore commands, immutable lifecycle/audit events, and Removed sessions reads without permanent deletion.
- Added Remove from history and Removed sessions UI routes with explicit, accessible recovery safeguards.
- Added Phase 3 native/Maestro/benchmark evidence contracts, source compatibility fixes, and coverage for effective source/projection behavior.

## Task Commits

1. **Task 1: void/restore lifecycle source mutations** — `1416cc1`.
2. **Task 2: Removed sessions UI and runtime integration** — `eac01eb`.
3. **Task 3: exact-HEAD automated evidence and compatibility/coverage gate** — `407b80a`.

## Decisions Made

- Removal is never destructive: it writes effective lifecycle `voided`, preserves the original facts, and permits only explicit restore.
- Native generation, Maestro execution, benchmarks, attended evidence, approval records, and terminal seal remain deferred to the one final Phase 5 release gate.

## Deviations from Plan

### Auto-fixed Issues

1. **Current-schema compatibility:** legacy recommendation inserts lacked required metric identity columns after additive history migrations.
   - **Fix:** wrote the required metric identity values from the authoritative exercise row.
   - **Verification:** integration suites and full coverage gate passed.

2. **Released-test compatibility:** tests hard-coded schema version 12 after Phase 3 added versions 13 and 14.
   - **Fix:** retained the released v12 prefix assertions while allowing additive later migrations.
   - **Verification:** history and integration suites passed without lowering coverage thresholds.

**Total deviations:** 2 auto-fixed compatibility corrections required for current-schema correctness.

## Verification

- `npm run test:evidence:phase3` — passed (2 tests).
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/historyRepository.test.ts tests/sqlite-host/historyCommandRepository.test.ts tests/sqlite-host/historyProjectionRepository.test.ts` — passed (27 tests).
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `git diff --check` — passed.
- Final coverage: statements 90.43%, branches 85.13%, functions 90.02%, lines 90.74%; all integrity-critical files 100%.

## User Setup Required

None.

## Next Phase Readiness

Phase 4 can consume current/updating/unavailable history projections and effective metrics. Physical validation remains intentionally deferred to the final gate.

---
*Phase: 03-calendar-and-history-integrity*
*Completed: 2026-08-25*
