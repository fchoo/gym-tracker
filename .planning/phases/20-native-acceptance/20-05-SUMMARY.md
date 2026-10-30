---
phase: 20-native-acceptance
plan: "05"
subsystem: performance-measurement
tags: [phase-20, performance, native-evidence, tdd, privacy, benchmarks]
dependency_graph:
  requires:
    - phase: 20-01
      provides: immutable v1.2 run identity and evidence contract
    - phase: 15-workout-parity
      provides: committed-set and dock marker semantics
    - phase: 18-garmin-import
      provides: independently fixed Garmin benchmark baseline contract
    - phase: 19-progress-parity
      provides: source-backed Progress workload and raw-sample pattern
  provides:
    - production-disabled useful-content and authoritative-commit-to-visible-dock marker bridge
    - immutable D20-06 and Phase 12 numeric performance budget registry
    - bounded privacy-safe observation shard retaining raw native samples without verdict fabrication
  affects: [20-08, 20-11, 20-12, native-acceptance, performance-evidence]
tech-stack:
  added: []
  patterns: [production-disabled-monotonic-markers, exact-identity-binding, raw-nearest-rank-p95, observation-only-shards]
key_files:
  created:
    - src/bootstrap/v12AcceptanceBenchmark.ts
    - src/bootstrap/v12AcceptanceBenchmark.test.ts
    - scripts/benchmark-v12-interactions.test.mjs
    - scripts/v12-performance-shard.mjs
  modified:
    - scripts/benchmark-v12-interactions.mjs
decisions:
  - "Performance acceptance remains a later release-native measurement; this plan creates immutable inputs and cannot collect, publish, or assign a final verdict."
  - "Garmin sync/normalization remains REVIEW_REQUIRED until its separately fixed Phase 18 baseline and maximum fixture are supplied; same-run threshold invention is rejected."
  - "Every budget result is recomputed from retained raw samples using sorted ceil(0.95*n)-1, with no averaging, outlier removal, or host/Jest relabelling."
metrics:
  duration: 4m
  completed_date: 2026-10-13
status: complete
actuals:
  tokens: 6596
  tasks: 2
  commits: 5
---

# Phase 20 Plan 05: Production Workload Performance Measurement Summary

Locked release-native, source-backed performance workload contracts for launch, navigation, workout, search, Calendar, Progress, backup/merge, and Garmin observations without measuring a device or fabricating an acceptance verdict.

## Completed Tasks

1. Implemented the test-only marker bridge and initial D20-06 paths.
   - Records monotonic root-switch-to-useful-content and authoritative-set-commit-to-visible-dock endpoints only when enabled for the development-test path.
   - Production-disabled mode keeps no marker state or samples.
   - Locks warm/cold launch, root-switch, dock, ordinary-JS, input/rest, search, Calendar, Progress, Phase 12, and Garmin registry values before any runtime collection.

2. Completed the bounded observation shard and adversarial validator.
   - Requires a source-backed release-native workload: full Calendar, 15,000 sets, 200 corrections, multi-plan history, maximum reviewed Garmin JSON, and the fixed 24 MiB/100,000-row Phase 12 merge fixture.
   - Retains raw latency, frame, missed-frame, refresh-rate, profiler-overhead, memory-growth, and fixture observations.
   - Rejects missing cold runs, insufficient or non-finite samples, changed budgets, source/APK/device/fixture drift, bad Phase 12 dimensions, and Garmin same-run threshold invention.
   - Emits only `REVIEW_REQUIRED` observations and cannot collect native measurements, write `performance.json`, or map an evidence verdict.

## Verification

- `npm run test:unit -- --runInBand src/bootstrap/v12AcceptanceBenchmark.test.ts` — 2 passed.
- `node --test scripts/benchmark-v12-interactions.test.mjs` — 5 passed.
- `git diff --check` — passed.

No Android build, install, adb/emulator/device action, native capture, runtime benchmark, import/backup/restore/merge mutation, push, publish, or deployment was run.

## Task Commits

1. **Task 20-05-01 RED:** `dd4444b1` — marker and locked-budget test specification.
2. **Task 20-05-01 GREEN:** `81b7c2ef` — production-disabled marker bridge and initial validator.
3. **Task 20-05-02 RED:** `f14df58d` — complete shard/workload contract specification.
4. **Task 20-05-02 GREEN:** `7097b8fd` — bounded observation-only performance shard.
5. **Task 20-05-02 hardening:** `82b169b4` — release-native source-backed workload binding and adversarial identity coverage.

## Files Created/Modified

- `src/bootstrap/v12AcceptanceBenchmark.ts` — development-test-only monotonic marker port.
- `src/bootstrap/v12AcceptanceBenchmark.test.ts` — marker ordering and production-disabled tests.
- `scripts/benchmark-v12-interactions.mjs` — immutable D20-06/Phase 12 budget registry, identity validation, and deferred collector boundary.
- `scripts/benchmark-v12-interactions.test.mjs` — raw sample, identity, cold-run, source-backing, and Garmin adversarial coverage.
- `scripts/v12-performance-shard.mjs` — privacy-safe observation-only shard producer and validator.

## Decisions Made

- Native performance evidence must be source-backed release-native data tied to the exact source tree, retained/installed APK, hashed device, and hashed fixture; Jest or host timing cannot be relabelled.
- Numeric performance summaries use raw arrays, maxima, and deterministic nearest-rank p95; the shard never averages p95 values or drops outliers.
- Garmin performance is an explicit `REVIEW_REQUIRED` dependency on the Phase 18 exact-artifact baseline, rather than an inferred local limit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used a disposable parent-workspace dependency symlink for focused tests**
- **Found during:** Task 20-05-01 RED verification.
- **Issue:** The isolated worktree did not contain `node_modules`, so Jest could not run the requested RED test.
- **Fix:** Created a temporary symlink to the existing parent-workspace dependency directory, ran only the planned tests, then removed the symlink before close-out.
- **Files modified:** None tracked.
- **Verification:** All focused Jest and Node tests passed after the test-only dependency path was available.

**2. [Rule 2 - Missing critical functionality] Bound observations to the complete reviewed source workload**
- **Found during:** Task 20-05-02 adversarial hardening.
- **Issue:** Raw numeric arrays and identity alone could be supplied from a narrower workload, leaving the required full Calendar/history/Garmin/merge representativeness implicit.
- **Fix:** Added an exact source-backed workload descriptor and fail-closed validation for the reviewed maximum fixture profile.
- **Files modified:** `scripts/benchmark-v12-interactions.mjs`, `scripts/benchmark-v12-interactions.test.mjs`, `scripts/v12-performance-shard.mjs`.
- **Verification:** Five script tests pass, including source-backing, cold-run, identity, and Garmin-limit adversaries.
- **Committed in:** `82b169b4`.

## Issues Encountered

- The worktree initially lacked local dependencies. The temporary symlink described above restored only the requested focused test environment and was removed afterward.

## Authentication Gates

None.

## Known Stubs

None. Deferred native collection and the Garmin `REVIEW_REQUIRED` state are explicit authority boundaries, not placeholder timings or fabricated evidence.

## Threat Surface Scan

No new endpoint, authentication path, schema, file output, or native execution surface was added. The marker-to-benchmark, raw-sample tampering, and bounded-workload trust boundaries from the plan threat model are covered by exact identity, literal budget, raw-array, and observation-only validation.

## Next Phase Readiness

Later Phase 20 measurement plans can supply exact release-native observations to this immutable contract. They must retain all raw samples and identities, provide the separately fixed Garmin baseline, and must not use this host tooling to claim a final PASS/FAIL verdict.

## Self-Check: PASSED

- All five declared performance source/test files exist.
- All five TDD task commits exist: `dd4444b1`, `81b7c2ef`, `f14df58d`, `7097b8fd`, and `82b169b4`.
- Focused Jest and Node verification passed; no tracked deletion, stub marker, or generated dependency symlink remains.
