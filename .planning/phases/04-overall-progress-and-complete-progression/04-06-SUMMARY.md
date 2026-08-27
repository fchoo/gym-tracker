---
phase: 04-overall-progress-and-complete-progression
plan: 06
subsystem: progress
tags: [sqlite, progression, recommendations, accessibility, evidence]

requires:
  - phase: 04-overall-progress-and-complete-progression
    provides: validated recommendation evidence and revision-fenced decision commands
  - phase: 03-calendar-and-history-integrity
    provides: disposable projection freshness and rebuild subject revisions
provides:
  - source-backed pending and historical recommendation review across Today and Progress
  - coarse, source-safe rebuild diagnostics for unavailable or updating projections
  - exact-candidate automated-only Phase 4 Maestro, benchmark, and evidence contracts
affects: [phase-05-release, final-native-attended-gate]

key-files:
  created:
    - scripts/run-phase4-maestro.mjs
    - scripts/benchmark-phase4.mjs
    - scripts/verify-phase4-native-evidence.mjs
    - scripts/phase4-evidence-scripts.test.mjs
    - src/ui/__tests__/RecommendationSurface.test.tsx
  modified:
    - src/platform/sqlite/repositories/progressRepository.ts
    - src/ui/screens/ProgressScreen.tsx
    - src/ui/screens/TodayScreen.tsx
    - app/(tabs)/index.tsx
    - app/(tabs)/progress.tsx

key-decisions:
  - "Today may show a quiet pending-review indicator but never substitutes a proposal for the accepted current target."
  - "A stale or unavailable progress read clears prior pending-review UI state; projections remain SQLite-authoritative."
  - "Rebuild diagnostics disclose only all-period or exercise-metric scope, never source-row, session, target, or recommendation identifiers."
  - "Accepted, rejected, invalidated, and superseded records remain readable history with no decision controls."
  - "Phase 4 scripts validate exact candidate identity but fail closed until the final shared native gate; they cannot generate approval or Terminal Seal evidence."

requirements-completed: [PROG-03, PROG-04, PROG-05, PROG-09, PROG-10, PROG-11]

status: complete
---

# Phase 4 Plan 06: Recommendation Review and Automated Evidence Summary

**Progress now presents persisted recommendation evidence without optimistic target changes, and its automated evidence contracts cannot impersonate a native or attended approval.**

## Accomplishments

- Extended the SQLite-backed Progress read with validated recommendation evidence, pending-only attention, historical lifecycle records, and coarse freshness diagnostics. Invalid, legacy, incomplete, or unsupported recommendation rows remain excluded from actionable review facts.
- Added a quiet Today indicator for a pending review on the matching exercise. The accepted target remains displayed, and stale/unavailable/rejected reads clear any prior indicator rather than displaying cached review state.
- Added the complete Progress review flow: source navigation, current/proposed targets, rule/version, confidence, evidence reason, committed accept/keep commands, runtime refresh, and clear superseded/conflict messaging.
- Added read-only target review history for accepted, rejected, invalidated, and superseded evidence, including explicit at-review-time target labels so historical facts cannot be mistaken for the current target.
- Added automated-only Phase 4 candidate contracts for Maestro flow coverage, bounded progress query benchmarks, and evidence aggregation. The scripts require exact candidate identity and reject attended, physical, approval, output, and Terminal Seal options.
- Repaired two source-review findings before closeout: stale Today review state now clears; rebuild diagnostics and non-pending lifecycle history are visible. A route fixture was also updated for the extended projection contract.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/RecommendationSurface.test.tsx src/ui/__tests__/TodayScreen.test.tsx src/ui/__tests__/ProgressScreen.test.tsx 'app/(tabs)/__tests__/index.test.tsx'` — passed, 4 suites / 61 tests before the final review additions.
- `npm run test:components -- --runInBand app/__tests__/progress-route.test.tsx` — passed.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts` — passed, 12 tests, including an accepted review retained after the real decision advances its live target revision.
- `npm run test:evidence:phase4` — passed, 2 tests.
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed; 206 files.
- Complete unit and component runs passed: 59 suites / 1,010 tests and 29 suites / 396 tests.
- Current full coverage report: 90.65% statements, 85.18% branches, 90.27% functions, and 90.95% lines. All 69 integrity-critical files are 100% for statements, branches, functions, and lines.
- `git diff --check` — passed.

The standard Expo Go remote-push warning and the shell `compdef` warning appeared during tests; neither changed test status.

## Deferred Verification

Android/native generation, emulator or device execution, Maestro production, performance sampling, attended accessibility/design review, final approval, and Terminal Seal creation remain deferred to the single shared Phase 5 release gate. No candidate artifact, approval evidence, or Terminal Seal was generated by this plan.

## Next Phase Readiness

- Phase 4 is automated-source complete and ready to enter Phase 5: Recovery, Distribution, and Release.
- The final release gate must validate one exact-HEAD candidate across the accumulated Phase 2, Phase 3, Phase 4, and Phase 5 scenarios before any human approval is recorded.

---

*Phase: 04-overall-progress-and-complete-progression*
*Plan: 06*
*Completed: 2026-08-25*
