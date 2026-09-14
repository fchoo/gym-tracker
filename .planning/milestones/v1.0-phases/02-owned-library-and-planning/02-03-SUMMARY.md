---
phase: 02-owned-library-and-planning
plan: 03
subsystem: scheduling
tags: [localdate, timezone, dst, rotation, weekday, overrides, optimistic-concurrency, tdd]

requires:
  - phase: 01-trustworthy-workout-loop
    provides: Injected Clock seam, pure discriminated state-machine patterns, and immutable workout start local-date facts
provides:
  - Validated LocalDate parsing, ordering, difference, weekday, and calendar-day arithmetic without instant-day math
  - Stored IANA timezone validation and instant-to-LocalDate resolution through Intl formatToParts
  - Pure revision-safe Weekday, Rotation, override, opportunity, Train anyway, and timezone-choice transitions
  - Executable D-42 through D-49 and E-53 through E-58 scheduling traceability
  - Permanent complete-coverage enforcement for all scheduling integrity modules
affects: [schedule-persistence, today, plan-activation, active-workout, calendar, history]

actuals:
  tokens: 13646
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - LocalDate is a validated YYYY-MM-DD calendar value, never an instant
    - Civil-date ordinal arithmetic performs add, difference, compare, and weekday operations without 24-hour milliseconds
    - Intl DateTimeFormat formatToParts is the only instant-to-stored-timezone calendar boundary
    - Every mutable schedule transition requires an expected revision and returns explicit next state plus events
    - Pending schedule facts may transition once; consumed opportunities and overrides remain immutable

key-files:
  created:
    - src/domains/scheduling/localDate.ts
    - src/domains/scheduling/timeZone.ts
    - src/domains/scheduling/localDate.test.ts
    - src/domains/scheduling/scheduleState.ts
    - src/domains/scheduling/scheduleState.test.ts
  modified:
    - scripts/run-coverage-gate.mjs

key-decisions:
  - "LocalDate supports years 0001 through 9999 and uses civil calendar ordinals rather than parsing date-only strings as instants."
  - "Stored timezone text is validated and preserved exactly; only instant conversion uses Intl.DateTimeFormat(...).formatToParts."
  - "Rotation advancement consumes the current opportunity only for scheduled completion, Skip, Advance, or explicit Advance rotation after this workout intent."
  - "Weekday Skip and missed outcomes consume only the dated opportunity; recurring bindings remain outside and unchanged by the pure transition."
  - "A detected device-timezone choice is recorded once per detected zone and applies prospectively from an explicit LocalDate."

patterns-established:
  - "Calendar boundary: parse strict LocalDate components, convert to civil ordinals, and reject movement outside the supported range."
  - "Schedule boundary: validate current state and expected revision before producing any event or next state."
  - "History boundary: consumed opportunities and overrides are terminal immutable facts."
  - "Timezone boundary: preserve the stored zone until an explicit prospective Follow device timezone from today decision."

requirements-completed: [LIB-09]

coverage:
  - id: D1
    description: "Local calendar intent remains stable across midnight, month/year/leap boundaries, spring-forward, fall-back, and stored timezone conversion."
    requirement: LIB-09
    verification:
      - kind: unit
        ref: "src/domains/scheduling/localDate.test.ts#Plan 02-03 LocalDate calendar arithmetic and stored-timezone calendar resolution"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false
  - id: D2
    description: "Weekday, Rotation, override, Train anyway, and timezone transitions are deterministic, revision-safe, and preserve consumed history."
    requirement: LIB-09
    verification:
      - kind: unit
        ref: "src/domains/scheduling/scheduleState.test.ts#D-42 through D-49 and E-54/E-57/E-58 transition tables"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "All D-42 through D-49 and E-53 through E-58 rows are executable and the scheduling modules meet complete all-metrics coverage."
    requirement: LIB-09
    verification:
      - kind: unit
        ref: "npm run test:unit -- --runInBand src/domains/scheduling/localDate.test.ts src/domains/scheduling/scheduleState.test.ts"
        status: pass
      - kind: other
        ref: "scripts/run-coverage-gate.mjs#integrityCriticalFiles"
        status: pass
    human_judgment: false

duration: 18 min
completed: 2026-08-17
status: complete
---

# Phase 02 Plan 03: Calendar-Safe Schedule Semantics Summary

**DST-safe LocalDate utilities and revisioned Weekday/Rotation state transitions now preserve explicit owner intent without silent schedule or history rewrites**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-17T14:00:52Z
- **Completed:** 2026-08-17T14:18:04Z
- **Tasks:** 2
- **Files modified:** 6
- **Implementation commits:** 5
- **Focused scheduling tests:** 81 passed
- **Final repository coverage gate:** 786 tests passed
- **Scheduling module coverage:** 100% statements, branches, functions, and lines

## Accomplishments

- Added strict `YYYY-MM-DD` LocalDate values with calendar component validation, civil-date add/difference/compare arithmetic, weekday resolution, supported-range checks, and no date-only instant parsing.
- Added exact stored IANA timezone validation and `Intl.DateTimeFormat(...).formatToParts` conversion that survives local midnight, spring-forward, fall-back, leap, month, and year boundaries.
- Added pure expected-revision transitions for scheduled Rotation completion, Repeat, Skip, Advance, alternate/rest/empty Train anyway intent, weekday completion/skip/missed outcomes, one pending override, immutable consumed facts, and prospective timezone choices.
- Made every D-42 through D-49 and E-53 through E-58 rule executable in named tables with stable redacted conflict codes and neutral `Planned but not completed` wording.
- Enrolled all scheduling production modules in the repository's permanent 100% all-metrics integrity gate.

## Task Commits

1. **Task 1 RED:** `1e33432` — failing LocalDate, midnight, DST, ordering, and stored-timezone boundary tables.
2. **Task 1 GREEN:** `1627913` — strict LocalDate arithmetic and stored-timezone conversion with complete coverage.
3. **Task 2 RED:** `f48199e` — failing Weekday, Rotation, override, repeated/concurrent intent, and timezone-choice tables.
4. **Task 2 GREEN:** `325c756` — deterministic schedule state/event transitions with typed conflicts and immutable terminal facts.
5. **Integrity hardening:** `0ae011a` — fail-closed rotation validation and permanent complete-coverage enrollment.

## Files Created/Modified

- `src/domains/scheduling/localDate.ts` — branded LocalDate, strict parser, civil ordinal conversion, add/difference/compare, and weekday operations.
- `src/domains/scheduling/timeZone.ts` — branded stored timezone, IANA validation, bounded instant validation, and `formatToParts` calendar context.
- `src/domains/scheduling/localDate.test.ts` — 42 month/year/leap/midnight/DST/range/order cases covering D-47/D-48 and E-53/E-55/E-56.
- `src/domains/scheduling/scheduleState.ts` — pure opportunity, Rotation, Weekday, override, Train anyway, and timezone-choice state transitions.
- `src/domains/scheduling/scheduleState.test.ts` — 39 transition and conflict cases covering D-42 through D-49 and E-54/E-57/E-58.
- `scripts/run-coverage-gate.mjs` — permanent all-metrics enforcement for the three scheduling production modules.

## Decisions Made

- LocalDate arithmetic uses a proleptic Gregorian civil-day ordinal algorithm. JavaScript `Date` is used only after validating an instant and only for `Intl` timezone formatting.
- LocalDate values are bounded to `0001-01-01` through `9999-12-31`; movement outside that range fails with `local_date_out_of_range`.
- Validated timezone text is preserved exactly rather than canonicalized, satisfying stored-intent and encoding stability.
- Non-advancing `Train anyway` records an explicit event and revision without consuming the current opportunity. Explicit advancement consumes it as `advanced`.
- An empty Rotation schedule permits only non-advancing `Train anyway`; Repeat, Skip, Advance, completion, and explicit advancement fail closed.
- Device-timezone choices use the exact labels `Follow device timezone from today` and `Keep current timezone`, record the effective LocalDate, and reject repeated decisions for the same detected zone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Rejected ECMAScript-invalid instant magnitudes**
- **Found during:** Task 1 complete-coverage verification.
- **Issue:** Safe-integer validation alone permits values outside JavaScript `Date`'s valid time range, which could produce invalid formatter input.
- **Fix:** Added an explicit `8_640_000_000_000_000` maximum instant bound before constructing `Date`.
- **Files modified:** `src/domains/scheduling/timeZone.ts`, `src/domains/scheduling/localDate.test.ts`
- **Verification:** Invalid maximum-safe-integer test plus 100% timezone coverage.
- **Committed in:** `1627913`

**2. [Rule 1 - Bug] Corrected strict Jest table and thrown-error assertions**
- **Found during:** Task 1 and Task 2 type/behavior verification.
- **Issue:** Readonly tuple callback inference failed strict TypeScript, and the E-58 row initially matched the throwing function rather than the captured typed conflict.
- **Fix:** Replaced the affected tuple rows with named object rows and captured the thrown conflict for structural assertions.
- **Files modified:** `src/domains/scheduling/localDate.test.ts`, `src/domains/scheduling/scheduleState.test.ts`
- **Verification:** `npm run typecheck` and both focused suites.
- **Committed in:** `1627913`, `325c756`

**3. [Rule 2 - Missing Critical Functionality] Failed closed on malformed non-advancing Rotation state**
- **Found during:** Final invariant review.
- **Issue:** The first implementation validated current Rotation state only when an action advanced or repeated, allowing a non-advancing `Train anyway` event to carry malformed pointer/opportunity state forward.
- **Fix:** Added state validation before every Rotation action while retaining the valid empty-schedule non-advancing exception.
- **Files modified:** `src/domains/scheduling/scheduleState.ts`, `src/domains/scheduling/scheduleState.test.ts`
- **Verification:** Three malformed-state regression rows and complete schedule-state coverage.
- **Committed in:** `0ae011a`

**4. [Rule 2 - Missing Critical Functionality] Added scheduling modules to the permanent integrity gate**
- **Found during:** Plan-level verification against `.trae/rules/rules.md`.
- **Issue:** Focused coverage was complete, but future repository coverage runs did not yet require the new integrity-critical modules to remain at 100%.
- **Fix:** Added LocalDate, timezone, and schedule-state modules to `integrityCriticalFiles` and removed one newly unreachable redundant guard.
- **Files modified:** `scripts/run-coverage-gate.mjs`, `src/domains/scheduling/scheduleState.ts`
- **Verification:** Full repository coverage gate passed with 786 tests and 31/31 integrity-critical files at 100% all metrics.
- **Committed in:** `0ae011a`

---

**Total deviations:** 4 auto-fixed (1 Rule 1 bug, 3 Rule 2 critical correctness/verification gaps)
**Impact on plan:** All fixes strengthen fail-closed scheduling and continuous verification without adding persistence, UI, or architectural scope.

## TDD Gate Compliance

- RED gate for Task 1: `1e33432` failed because `localDate.ts` and `timeZone.ts` did not exist.
- GREEN gate for Task 1: `1627913` passed all LocalDate/timezone rows and the tracer feedback gate.
- RED gate for Task 2: `f48199e` failed because `scheduleState.ts` did not exist.
- GREEN gate for Task 2: `325c756` passed every schedule transition table.
- Later hardening remained test-backed in `0ae011a`; no refactor-only commit was necessary.

## Issues Encountered

- Strict Jest typing treats `as const` tuple rows as readonly unions that do not always match callback parameter inference; named object rows preserve literal types cleanly.
- The first focused coverage run exposed redundant or untested defensive paths. Public conflict rows were added for real failure seams, while one unreachable duplicate guard was removed.
- The shell emits a pre-existing `compdef:153: _comps: assignment to invalid subscript range` message before npm commands, but every command continues under the pinned Node/npm toolchain and exits according to its actual test/type/lint result.

## Known Stubs

None.

## Threat Model Verification

- **T-02-04 schedule revision tampering:** every mutable transition validates `expectedRevision`; E-57/E-58 prove repeated and concurrent stale commands return `schedule_revision_conflict`.
- **T-02-05 silent advancement/timezone reinterpretation:** advancement emits explicit events, alternate/rest/empty training does not advance without explicit intent, LocalDate math excludes millisecond days, and stored timezone choices are prospective.
- **T-02-07 schedule error disclosure:** transition and validation errors expose stable codes and calendar identifiers only; no observations, SQL, or owner-entered payloads are included.
- No new network endpoint, authentication path, file access pattern, persistence schema, or external trust boundary was introduced.

## User Setup Required

None - no package installation, service configuration, or external credentials required.

## Verification

- `npm run test:unit -- --runInBand src/domains/scheduling/localDate.test.ts` — 42 tests passed.
- `npm run test:unit -- --runInBand src/domains/scheduling/scheduleState.test.ts` — 39 tests passed.
- Combined focused scheduling suites — 81 tests passed.
- Focused scheduling coverage — 100% statements, branches, functions, and lines across all three production modules.
- `npm run typecheck` — passed.
- `npm run lint` — boundary check passed for 94 files.
- `npm run test:coverage -- --runInBand` — 786 tests passed; global thresholds and 31 integrity-critical all-metrics gates passed.
- D-42 through D-49 and E-53 through E-58 enumeration — passed.
- Date-arithmetic prohibition scan, neutral-copy scan, stub/skip scan, and threat-surface scan — passed.

## Next Phase Readiness

- Schedule persistence can now store explicit source facts around deterministic pure transitions instead of embedding calendar semantics in repositories.
- Today, activation, and workout outcome flows can consume LocalDate/stored-timezone values and append returned events without duplicating transition rules.
- No blockers, known stubs, open broken-window entries, or new threat flags remain.

## Self-Check: PASSED

- All five created scheduling files and the modified coverage gate exist.
- All five TDD/implementation/hardening commits exist in repository history.
- Summary frontmatter records the measured actuals and completed `LIB-09` requirement.
- D-42 through D-49 and E-53 through E-58 are present in executable tests.
- TDD history contains two RED commits followed by two GREEN commits.
- Broken-windows ledger reports zero open entries.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-17*
