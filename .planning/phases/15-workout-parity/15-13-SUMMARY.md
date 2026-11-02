---
phase: 15-workout-parity
plan: "13"
subsystem: performance-evidence
tags: [react-native, expo, rendered-performance, evidence, phase15]
requires:
  - phase: 15-12
    provides: Phase 15 native matrix, exact-identity evidence ledger, and verifier contract
provides:
  - Rendered compact-to-rest benchmark route with a real RestDock frame marker
  - Identity-bound raw numeric measurement schema and exact-APK runner
  - Fail-closed Phase 15 performance evidence validation
affects: [phase-20-native-acceptance, workout-parity-evidence]
actuals:
  tokens: 7430
  tasks: 2
  commits: 3
tech-stack:
  added: []
  patterns:
    - Development-test-only rendered benchmark routes emit raw measurements; host checks validate contracts but do not claim native runtime evidence.
    - Performance evidence derives summary values from raw samples and binds them to the exact retained APK/device identity.
key-files:
  created:
    - src/bootstrap/phase15WorkoutBenchmark.ts
    - app/__phase15-benchmark.tsx
    - scripts/benchmark-phase15-workout.mjs
  modified:
    - scripts/verify-phase15-evidence.mjs
    - scripts/phase15-evidence-scripts.test.mjs
    - package.json
key-decisions:
  - "The benchmark measures the first native layout containing the shipped RestDock after fixture activation and commit markers; it never substitutes a domain invalidation callback."
  - "Raw transition, active JS, long-session render, scroll, and interaction samples are required before derived p95/max summaries are accepted."
  - "Exact-source APK/native/performance acceptance is intentionally deferred to Phase 20's single end-of-all-phases production-APK closure; Phase 15 records no current native PASS."
patterns-established:
  - "Native-performance runner: fail closed on stale HEAD, source digest, APK/install identity, absent device, malformed logs, thresholds, or private fields."
requirements-completed: [WRK-01, WRK-05, WRK-07, WRK-18, WRK-20, WRK-21, WRK-23, WRK-32, WRK-34, WRK-35, WRK-36]
coverage:
  - id: D1
    description: Rendered compact-to-rest benchmark instrumentation, source-backed dock fixtures, and raw measurement validation.
    requirement: WRK-21
    verification:
      - kind: unit
        ref: src/bootstrap/phase15WorkoutBenchmark.test.ts
        status: pass
      - kind: integration
        ref: node --test scripts/benchmark-phase15-workout.test.mjs scripts/phase15-evidence-scripts.test.mjs
        status: pass
      - kind: other
        ref: npm run benchmark:phase15:host
        status: pass
    human_judgment: false
  - id: D2
    description: Exact-source APK/device performance collection and complete native Phase 15 acceptance.
    verification: []
    human_judgment: true
    rationale: Owner directed the single exact-source production-APK closure to Phase 20; no current Phase 15 native evidence was fabricated or accepted.
duration: 4m
completed: 2026-10-10
status: complete
---

# Phase 15 Plan 13: Rendered Workout Benchmark and Deferred Native Closure Summary

**Rendered RestDock benchmark instrumentation with raw, identity-bound numeric evidence and a fail-closed Phase 20 native-acceptance handoff.**

## Performance

- **Duration:** 4m
- **Started:** 2026-10-10T14:36:32Z
- **Completed:** 2026-10-10T14:40:56Z
- **Tasks:** 2/2 implementation tasks complete
- **Files modified:** 10
- **Targeted host benchmark contract:** 100 minimum rendered samples; p95 ≤150 ms; ordinary Active Workout JS task ≤50 ms.

## Accomplishments

- Added a development-test-only benchmark route that renders the shipped `WorkoutActionDock` and `RestDock`, records activation/commit markers, and captures the first RestDock native layout frame.
- Added an exact-identity device runner plus raw measurement schema for rendered transition, Active JS, and representative long-session render/scroll/interaction work.
- Strengthened the final evidence verifier so performance summaries must derive from retained raw samples and remain privacy-safe.
- Recorded the owner-directed Phase 20 final-native closure without generating an APK, installing an app, mutating a device, running the 56-cell matrix, or claiming native PASS evidence.

## Task Commits

1. **Task 1 (RED): Measure the actual rendered compact-to-rest transition** - `282ef95` (`test`)
2. **Task 1 (GREEN): Measure the actual rendered compact-to-rest transition** - `5d0a752` (`feat`)
3. **Task 2: Execute and verify the complete Phase 15 final gate** - `7669d3c` (`docs`, owner-directed Phase 20 deferral tracking)

## Verification

- PASS — `node --test scripts/benchmark-phase15-workout.test.mjs scripts/phase15-evidence-scripts.test.mjs` (12 tests)
- PASS — `npm run test:unit -- --runInBand src/bootstrap/phase15WorkoutBenchmark.test.ts` (4 tests)
- PASS — `npm run typecheck`
- PASS — `npm run lint` and `npm run check:boundaries`
- PASS — `npm run benchmark:phase15:host` returned `host-contract-verified` with `minimum_samples=100`, `p95_limit_ms=150`, and `js_task_limit_ms=50`.
- PASS — `.planning/WINDOWS.md` validated after `d9c02b1`: **0 open / 84 fixed**.
- INTENTIONALLY DEFERRED — fresh APK build/install, full native matrix, device mutation, and `verify:phase15:evidence --all` are Phase 20's owner-directed production-APK closure. No stale artifact was treated as current and no native PASS was claimed.

## Files Created/Modified

- `src/bootstrap/phase15WorkoutBenchmark.ts` - Raw measurement schema, marker recorder, percentile calculation, and threshold enforcement.
- `app/__phase15-benchmark.tsx` - Development-test-only rendered compact-to-rest benchmark route using the shipped dock components.
- `scripts/benchmark-phase15-workout.mjs` - Host contract check plus exact-identity native collection runner.
- `scripts/verify-phase15-evidence.mjs` - Requires performance summaries to derive from raw, identity-bound samples.
- `scripts/phase15-evidence-scripts.test.mjs` - Rejects missing, forged, or inconsistent raw performance evidence.
- `package.json` - Adds explicit host and retained-artifact Phase 15 benchmark commands.
- `.planning/phases/15-workout-parity/15-VALIDATION.md` - Documents the Phase 20 final-native closure boundary.
- `.planning/phases/15-workout-parity/deferred-items.md` - Records truthful non-PASS native evidence status and Windows ledger count.

## Decisions Made

- The first native `onLayout` containing the real `RestDock` is the rendered-frame endpoint; the route preserves separate activation and authoritative-commit markers.
- Host validation proves code, raw numeric schema, threshold calculation, and evidence linkage only. It is not device performance evidence.
- The Phase 20 production-APK closure is the sole owner of current exact-source native acceptance for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test correctness] Corrected the p95 boundary fixture**
- **Found during:** Task 1
- **Issue:** One 151 ms sample in 100 samples does not violate a nearest-rank p95 ceiling.
- **Fix:** Made six samples exceed the 150 ms limit so the test exercises the actual p95 rejection path.
- **Files modified:** `src/bootstrap/phase15WorkoutBenchmark.test.ts`
- **Verification:** Scoped unit suite passes.
- **Committed in:** `5d0a752`

**2. [Rule 2 - Missing critical evidence validation] Added raw performance evidence derivation checks**
- **Found during:** Task 1
- **Issue:** The existing Phase 15 verifier accepted only aggregate performance fields, allowing a forged summary without retained raw samples.
- **Fix:** Added exact-identity raw measurement validation, percentile/max derivation checks, privacy scanning, and mutation tests.
- **Files modified:** `scripts/benchmark-phase15-workout.mjs`, `scripts/verify-phase15-evidence.mjs`, `scripts/phase15-evidence-scripts.test.mjs`
- **Verification:** Benchmark and evidence mutation suites pass.
- **Committed in:** `5d0a752`

**Total deviations:** 2 auto-fixed (Rule 1: 1; Rule 2: 1). All changes are direct correctness requirements for the planned performance/evidence feature.

## Owner-Directed Verification Deferral

The latest owner directive supersedes Plan 15-13's immediate full-runtime checkpoint. This execution intentionally did **not** build/install an APK, mutate device state, run the full 56-cell native matrix, run the global full suite, or run final comprehensive evidence verification. The exact-source APK/native/performance gate is deferred to **Phase 20's single end-of-all-phases production-APK closure**. This is neither a missing credential nor an implicit approval.

## Known Stubs

None. The development-test route is deliberately gated by the embedded native-contract suite and is not a production fallback or data source.

## Threat Flags

None. The implementation adds no network, authentication, file-access, or schema trust boundary; it uses synthetic dev-test fixture labels and rejects private data in evidence.

## Next Phase Readiness

Phase 20 can execute `npm run benchmark:phase15` only after it has produced a fresh exact-HEAD retained development-test/prod-closure artifact and chosen the owner-directed single production-APK acceptance flow. Until then, the benchmark infrastructure and host proofs are ready, while native performance/evidence remains explicitly pending.

## Self-Check: PASSED

- Confirmed the benchmark bootstrap, development-test route, runner, and this summary exist.
- Confirmed task commits `282ef95`, `5d0a752`, and `7669d3c` exist in Git history.

---
*Phase: 15-workout-parity*
*Completed: 2026-10-10*
