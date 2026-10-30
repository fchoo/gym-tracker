---
phase: 19-progress-parity
plan: 02
subsystem: progress-sqlite-runtime
tags: [typescript, sqlite, progress, running, snapshots, jest]
requires:
  - phase: 19-01
    provides: typed factual All/Strength/Running projection contracts
provides:
  - One source-coherent SQLite snapshot for each selected Progress read
  - Frozen sport-specific dashboard data through the runtime boundary
  - Bounded source evidence reads and terminal automatic-refresh metadata
affects: [19-03, 19-04, 19-05, 19-09, 19-10, phase-20]
actuals:
  tokens: 8765
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - "Pass the single readSnapshot transaction executor to every repository reader."
    - "Expose Progress only as a typed sport dashboard; never pass source rows or provider payloads to the runtime."
    - "Bind SQLite range filters before materialization and cap all-time evidence reads."
key-files:
  created: []
  modified:
    - src/domains/progress/contracts.ts
    - src/platform/sqlite/repositories/progressRepository.ts
    - tests/sqlite-host/progressRepository.test.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - src/bootstrap/workoutAppRuntime.test.tsx
key-decisions:
  - "Every Progress request reads freshness, effective history, imported Running facts, targets, recommendations, planned occurrences, and bodyweight from one SQLite readSnapshot."
  - "The runtime sport path omits sourceFacts and returns the frozen dashboard union with opaque revision-bearing evidence identities."
  - "Automatic refresh has three bounded backoff attempts and terminates at current or unavailable; range predicates and all-time caps prevent unbounded materialization."
patterns-established:
  - "Repository read coherence is a transaction-boundary property, not an end-of-read revision recheck."
  - "Unavailable and updating projections fail closed with coarse diagnostics and no final values or source links."
requirements-completed: [PRO-02, PRO-03, PRO-04, PRO-07, PRO-08]
coverage:
  - id: D1
    description: "One coherent Running Progress snapshot crosses the typed runtime boundary without exposing storage or provider payloads."
    requirement: PRO-04
    verification:
      - kind: integration
        ref: tests/sqlite-host/progressRepository.test.ts#loads a Running dashboard through exactly one source-coherent SQLite snapshot
        status: pass
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx#exposes factual progress only through the trusted runtime boundary
        status: pass
    human_judgment: false
  - id: D2
    description: "Accepted current imports, rebuild suppression, bounded date queries, and terminal refresh state stay factual and privacy-safe."
    requirement: PRO-07
    verification:
      - kind: integration
        ref: tests/sqlite-host/progressRepository.test.ts#accepted revision, range predicate, and unavailable refresh cases
        status: pass
      - kind: other
        ref: npm run test:coverage
        status: pass
    human_judgment: false
duration: 15 min
completed: 2026-10-12
status: complete
---

# Phase 19 Plan 02: Snapshot-Safe Progress Runtime Summary

**Progress now reads one coherent SQLite snapshot, projects a frozen All/Strength/Running dashboard through the runtime, and terminates refresh while bounding history evidence.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-12T16:06:46Z
- **Completed:** 2026-10-12T16:21:36Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Replaced the Progress repository's cross-transaction reads with a single `readSnapshot`, including freshness, effective source history, imports, recommendations, occurrences, and optional bodyweight facts.
- Added the typed, frozen All/Strength/Running dashboard capability to the runtime; the sport-aware result excludes storage handles, source rows, credentials, route/chart samples, and raw provider payloads.
- Bound four-week and twelve-week queries in SQLite, capped all-time evidence, and added a three-attempt terminal refresh contract for current, updating, and unavailable states.
- Proved the race boundary, accepted-versus-removed Running revisions, privacy boundary, query predicates, source-write-free reads, and rebuild termination against real SQLite.

## Task Commits

Each task was committed atomically:

1. **Task 1: Load one accepted Running view through one SQLite snapshot and the runtime port** - `a594adb7` (test RED) and `e7d98965` (feat)
2. **Task 2: Expand one-snapshot reads across All/Strength/Running, ranges, rebuild, and bounded refresh** - `40d065b0` (feat)

## Files Created/Modified

- `src/domains/progress/contracts.ts` - Refresh metadata for typed, bounded Progress reload behavior.
- `src/platform/sqlite/repositories/progressRepository.ts` - Single-snapshot coherent reads, factual dashboard assembly, range predicates, source limits, and coarse fail-closed states.
- `tests/sqlite-host/progressRepository.test.ts` - Real SQLite snapshot, accepted-revision, privacy, range, rebuild, and refresh proofs.
- `src/bootstrap/workoutAppRuntime.tsx` - Narrow sport-aware runtime Progress port backed by the repository snapshot capability.
- `src/bootstrap/workoutAppRuntime.test.tsx` - Runtime boundary proof for frozen dashboard data and absent source payloads.

## Verification

- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/progressRepository.test.ts` - passed (1 suite, 22 tests).
- `npm run test:unit -- --runInBand src/bootstrap/workoutAppRuntime.test.tsx` - passed (1 suite, 55 tests).
- `npm run typecheck` - passed.
- `npm run check:boundaries` - passed (405 files).
- `npm run test:coverage` - passed across components, integration, sqlite-host, and unit projects.
- Scoped diff from `02c764ae127d27e447b7b8b3f66fedc672285a34` contains only the five declared implementation/test files plus this summary.

## Decisions Made

- One snapshot is the only valid coherence boundary; a final revision reread cannot repair a mixed read.
- Sport-aware runtime results expose only immutable projection facts and opaque evidence identities. Legacy source facts remain internal to the pre-existing non-sport path until the planned UI migration consumes the dashboard capability.
- Refresh orchestration is event/generation-driven; its fallback is finite and reports `current` or `unavailable` rather than polling indefinitely.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The runtime fallback wrapper for lightweight test kernels required a TSX-safe method declaration; corrected before the Task 1 feature commit. No product behavior or scope changed.

## Known Stubs

None. Nullable values in the repository are fail-closed parsing and availability guards; no placeholder data reaches the Progress dashboard.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19 presentation plans can request a selected sport/range from the runtime without adding screen SQL, parsing imported payloads, or relabelling stale results.
- Phase 20 native/device/attended acceptance remains intentionally out of scope.

## Self-Check: PASSED

- All five declared implementation/test files exist and are committed in `a594adb7`, `e7d98965`, and `40d065b0`.
- Scoped diff is limited to the declared files; no tracked file deletion, schema change, network endpoint, auth path, file-access surface, skipped test, or unresolved stub was introduced.

---
*Phase: 19-progress-parity*
*Completed: 2026-10-12*
