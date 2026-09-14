---
phase: 02-owned-library-and-planning
plan: 02
subsystem: metrics
tags: [metrics, zod, contracts, comparators, aggregates, exposure, tdd]

requires:
  - phase: 01-trustworthy-workout-loop
    provides: Legacy load_reps V1 grams/repetitions, timed_hold V1 durationSeconds, working-set sources, and deterministic load/reps progression evidence
provides:
  - Complete nine-profile metric registry keyed by profile, contract version, and exercise metric generation
  - Strict versioned target and observation parsing with stable-code failures and legacy byte preservation
  - Deterministic comparator, tie, aggregate, precision, and comparable-exposure contracts
  - Executable E-64 through E-78 traceability for LIB-11 and LIB-12
  - Complete branch coverage for every integrity-critical metric module
affects: [content-packs, starters, active-workout, history, progression, metric-profile-migration]

actuals:
  tokens: 21597
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - Complete metric identity is profile plus contractVersion plus exerciseMetricGeneration
    - Registry-selected schemas define downstream comparator, aggregate, and exposure strategies
    - Atomic observations remain bounded integers while fractional means and rounding stay derived
    - Stable error codes never reflect raw targets or observations

key-files:
  created:
    - src/domains/metrics/contracts.ts
    - src/domains/metrics/observations.ts
    - src/domains/metrics/registry.ts
    - src/domains/metrics/comparators.ts
    - src/domains/metrics/aggregates.ts
    - src/domains/metrics/exposure.ts
    - src/domains/metrics/metricContracts.test.ts
  modified: []

key-decisions:
  - "Metric identity is exactly (profile, contractVersion, exerciseMetricGeneration); generalized consumers never key by profile alone."
  - "Legacy load_reps contract 1 remains loadGrams/reps and timed_hold contract 1 remains durationSeconds; millisecond timed holds are explicit contract 2."
  - "Intervals contract 1 uses the literal plan-authored rounds_then_work comparator and immutable protocol dimensions."
  - "Fixed-distance, fixed-time, and interval aggregates reject mixed protocol populations even when called outside the exposure filter."
  - "Presentation rounding uses decimal formatting so valid maximum safe integers are not corrupted by multiply-divide precision loss."

patterns-established:
  - "Metric boundary: strict Zod parsing occurs before registry values reach persistence or downstream pure logic."
  - "Comparison boundary: profile direction and deterministic timestamp/session/ordinal/set tie order come from one registered strategy."
  - "Aggregate boundary: only completed comparable working-set populations may be supplied, and protocol-specific aggregates fail closed on mixed dimensions."
  - "Exposure boundary: exercise identity, contract version, metric generation, and target-significant dimensions must all match."

requirements-completed: [LIB-11, LIB-12]

coverage:
  - id: D1
    description: "All nine approved metric profiles have strict versioned target and observation contracts, including preserved legacy units and explicit timed-hold milliseconds V2."
    requirement: LIB-12
    verification:
      - kind: unit
        ref: "src/domains/metrics/metricContracts.test.ts#metric identity contracts"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every profile has deterministic better, worse, equal, Best, Last, aggregate, tie, and presentation precision behavior."
    requirement: LIB-11
    verification:
      - kind: unit
        ref: "src/domains/metrics/metricContracts.test.ts#metric comparator contracts"
        status: pass
      - kind: unit
        ref: "src/domains/metrics/metricContracts.test.ts#metric aggregate contracts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Comparable exposure never crosses exercise identity, profile, contract version, metric generation, fixed protocol, variation, assistance equipment, or side boundaries."
    requirement: LIB-11
    verification:
      - kind: unit
        ref: "src/domains/metrics/metricContracts.test.ts#metric exposure contracts"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false

duration: 26 min
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 02: Versioned Metric Contracts Summary

**Nine explicit metric profiles now round-trip through strict versioned targets, observations, comparison, aggregation, precision, and exposure without reinterpreting legacy workout bytes**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-17T13:24:39Z
- **Completed:** 2026-08-17T13:50:00Z
- **Tasks:** 2
- **Files modified:** 7
- **Implementation commits:** 6
- **Final repository coverage gate:** 705 tests passed
- **Metric module coverage:** 100% statements, branches, functions, and lines

## Accomplishments

- Added strict contracts for `load_reps`, `bodyweight_reps`, `added_load_reps`, `assisted_reps`, `timed_hold`, `fixed_distance`, `fixed_time`, `intervals`, and `unscored`.
- Preserved Phase 1 `load_reps` V1 grams/repetitions and `timed_hold` V1 seconds exactly while assigning millisecond timed holds to explicit V2.
- Added deterministic comparator direction, assisted-target qualification, plan-authored interval ordering, stable tie fallback, finite means, presentation-only rounding, and bounded populations.
- Segmented comparable history by exercise identity, profile, contract, metric generation, variation/equipment/side, and fixed or interval protocol.
- Mapped every E-64 through E-78 edge ID to executable LIB-11/LIB-12 tests with complete metric-module coverage.

## Task Commits

1. **Task 1 RED:** `31b0307` — failing all-profile identity, boundary, encoding, and legacy-byte tests.
2. **Task 1 GREEN:** `192bee0` — complete versioned metric identities, strict schemas, parsers, and registry.
3. **Task 2 RED:** `18dbca8` — failing comparator, aggregate, tie, precision, and exposure tables.
4. **Task 2 GREEN:** `e112bea` — comparator, aggregate, presentation, and exposure implementations with complete coverage.
5. **Task 2 REFACTOR:** `66d4b0f` — removed an unreachable registry runtime guard after executable completeness proof.
6. **Protocol correctness:** `d9c581c` — rejected mixed fixed-distance and fixed-time aggregate populations.

## Files Created/Modified

- `src/domains/metrics/contracts.ts` — nine profile names, complete identity, strict target/observation schemas, strategy IDs, and stable boundary errors.
- `src/domains/metrics/observations.ts` — safe JSON parsing, strict target/observation parsing, and lossless serialization.
- `src/domains/metrics/registry.ts` — ten explicit contracts covering nine profiles and timed-hold V1/V2.
- `src/domains/metrics/comparators.ts` — profile direction, assisted target qualification, interval policy, stable Best/Last tie fallback.
- `src/domains/metrics/aggregates.ts` — bounded finite means, protocol rejection, presentation-only precision, and duration formatting.
- `src/domains/metrics/exposure.ts` — eligible population and D-37 comparable-exposure predicate.
- `src/domains/metrics/metricContracts.test.ts` — 92 tests covering every identity, profile, E-64..E-78, tie, precision, and exposure boundary.

## Decisions Made

- The registry definition is the authoritative source for supported contracts; downstream functions consume its registered strategy IDs after strict parsing.
- Timed hold contract version, not profile name, determines whether source duration is seconds or milliseconds.
- `rounds_then_work` is the only intervals V1 comparator; unsupported policy IDs fail target parsing rather than reaching comparison.
- Aggregate functions independently reject mixed fixed-distance, fixed-time, and interval protocols so callers cannot bypass exposure comparability.
- Owner-facing metric logic returns factual values and neutral stable codes only; it does not infer fatigue, injury, weakness, health, worth, or moral failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved maximum safe integers during presentation rounding**
- **Found during:** Task 2 complete-coverage verification.
- **Issue:** Multiply-round-divide rounding changed `Number.MAX_SAFE_INTEGER` by one gram.
- **Fix:** Switched presentation rounding to fixed-decimal conversion, leaving source aggregates unchanged.
- **Files modified:** `src/domains/metrics/aggregates.ts`, `src/domains/metrics/metricContracts.test.ts`
- **Verification:** Maximum-value presentation test plus 100% metric coverage.
- **Committed in:** `e112bea`

**2. [Rule 2 - Missing Critical Functionality] Rejected unsupported interval comparator identities**
- **Found during:** Task 2 branch-coverage review.
- **Issue:** A bounded string allowed unregistered interval comparator IDs to enter targets.
- **Fix:** Made contract V1 accept only literal `rounds_then_work`; unknown policies now fail with `metric_target_invalid`.
- **Files modified:** `src/domains/metrics/contracts.ts`, `src/domains/metrics/metricContracts.test.ts`
- **Verification:** Invalid-policy and protocol-mismatch comparator tests.
- **Committed in:** `e112bea`

**3. [Rule 2 - Missing Critical Functionality] Enforced fixed-protocol aggregation at the aggregate seam**
- **Found during:** Final invariant review after repository verification.
- **Issue:** Direct aggregate callers could average fixed-distance or fixed-time observations from different planned protocols without passing through exposure filtering.
- **Fix:** Added aggregate-level equality checks for distance and duration with regression tests.
- **Files modified:** `src/domains/metrics/aggregates.ts`, `src/domains/metrics/metricContracts.test.ts`
- **Verification:** Focused RED/GREEN regression, typecheck, boundary check, 92 metric tests, and 100% metric coverage.
- **Committed in:** `d9c581c`

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 2 Rule 2 critical correctness gaps)
**Impact on plan:** All fixes strengthen the required deterministic and fail-closed metric boundary without expanding product scope.

## Issues Encountered

- The integrity-critical coverage gate initially measured incomplete branch coverage because strict parser guarantees were redundantly rechecked in downstream strategy code. Unreachable checks were removed, real public failure paths received explicit tests, and all six metric modules reached 100% across every metric.
- A final shell wrapper used zsh's read-only `status` variable after a successful coverage run. The wrapper was rerun with a safe variable; the test result itself remained green.

## Known Stubs

None.

## User Setup Required

None - no external services or package installation required.

## Verification

- `npm run test:unit -- --runInBand` — 413 tests passed on final committed implementation.
- `npm run typecheck` — passed.
- `npm run lint` — boundary check passed for 91 files.
- `npm run test:coverage -- --runInBand` — 705 tests passed; repository integrity gate passed.
- Focused metric coverage — 92 tests passed; 100% statements, branches, functions, and lines.
- E-64 through E-78, all nine profile names, both timed-hold contracts, and all TDD commits were enumerated successfully.

## Next Phase Readiness

- Persistence, starter fixtures, active workout adapters, history, and progression can now consume one authoritative metric identity and strategy registry.
- No blockers, known stubs, open broken-window entries, or new network/auth/file/schema threat surfaces remain.

## Self-Check: PASSED

- All seven created metric files exist.
- All six implementation/TDD commits exist.
- Summary frontmatter parses and lists both completed requirements.
- Stub, threat-surface, and broken-windows checks are clean.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-17*
