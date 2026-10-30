---
phase: 19-progress-parity
plan: 06
subsystem: running-target-authority
tags: [typescript, react-native, sqlite, running, targets, receipts, revisions, jest]
requires:
  - phase: 17-library-running-plans
    provides: one authoritative distance-keyed Running source aggregate and runtime port
  - phase: 19-progress-parity
    plan: 02
    provides: snapshot-safe Running Progress reads
provides:
  - A revision-bound Running target sheet shared through the existing Library and Progress source authority
  - Replay-safe target commits with canonical validation, exclusive receipt writes, and committed read-back
  - Draft-preserving invalid, stale, storage, and read-back recovery states
affects: [19-09, 19-10, phase-20]
actuals:
  tokens: 12524
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns:
    - "Use the existing distance-keyed Running goal aggregate and immutable receipt graph for target edits; never introduce a Progress target store."
    - "Retain the request envelope per draft so retry and replay use the same canonical receipt ID."
    - "A target mutation is successful only after the repository commit and an authoritative aggregate read-back agree on the goal revision."
key-files:
  created:
    - src/ui/components/RunningTargetSheet.tsx
    - src/ui/__tests__/RunningTargetSheet.test.tsx
  modified:
    - src/domains/running/commands.ts
    - src/domains/running/commands.test.ts
    - src/platform/sqlite/repositories/runningPlanRepository.ts
    - src/bootstrap/runningPlanRuntime.tsx
    - src/bootstrap/runningPlanRuntime.test.tsx
    - tests/integration/running-foundation.test.ts
key-decisions:
  - "Running targets remain revisions of the existing running_goals/source aggregate, so Library, detail, and Progress consume one source of truth."
  - "Target receipt replay delegates to the existing immutable source graph receipt transaction and reports already_committed only for the exact canonical request payload."
  - "The sheet owns distance-local drafts and recovery focus, while BottomSheet continues to own modal cancellation and invoking-focus restoration."
patterns-established:
  - "Validate canonical target values and Monday-first training-day order before a target command reaches SQLite."
  - "Keep the target request ID stable across recoverable storage failures; use a new request only for a semantically new draft."
requirements-completed: [PRO-12, PRO-13]
coverage:
  - id: D1
    description: "One Running target sheet saves the canonical target through the shared source runtime while keeping the benchmark read-only and dismissal write-free."
    requirement: PRO-12
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RunningTargetSheet.test.tsx
        status: pass
      - kind: unit
        ref: src/bootstrap/runningPlanRuntime.test.tsx
        status: pass
    human_judgment: false
  - id: D2
    description: "Target validation, receipt replay, changed-payload rejection, stale revisions, and source history are proven against the shared Running source authority."
    requirement: PRO-13
    verification:
      - kind: unit
        ref: src/domains/running/commands.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/running-foundation.test.ts
        status: pass
      - kind: other
        ref: npm run test:coverage -- --runInBand
        status: fail
    human_judgment: true
    rationale: "The full repository-wide strict coverage gate is below its configured thresholds despite the focused target tests passing; follow-up coverage work requires review."
  - id: D3
    description: "Invalid, stale, storage, and missing-read-back outcomes retain the full draft, preserve retry/reload recovery, and prevent premature success feedback."
    requirement: PRO-13
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/RunningTargetSheet.test.tsx
        status: pass
      - kind: unit
        ref: src/bootstrap/runningPlanRuntime.test.tsx
        status: pass
    human_judgment: false
duration: 22 min
completed: 2026-10-12
status: complete
---

# Phase 19 Plan 06: Authoritative Running Target Editor Summary

**Running now has one draft-preserving target editor whose commits, revisions, receipts, and read-back stay authoritative for Library, plan detail, and Progress.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-10-12T16:25:52Z
- **Completed:** 2026-10-12T16:48:04Z
- **Tasks:** 3/3
- **Files modified:** 8 implementation/test files

## Accomplishments

- Added `RunningTargetSheet`, a `BottomSheet`-based editor with a fixed target field order, read-only current benchmark, a persisted/default 2.4 km `11:00` target, per-distance drafts, Monday-first available days, validation focus, and zero-write dismissal.
- Added `saveRunningTarget` to the shared Running command/runtime path. It validates canonical target values before SQL, fence-checks the expected source revision, persists through the existing exclusive receipt/source graph transaction, and succeeds only after exact authoritative aggregate read-back.
- Proved target receipt replay, changed-payload conflict, stale revision rejection, immutable source history, invalid input rejection, retry receipt stability, and read-back failure recovery with real SQLite, unit, runtime, and component tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Save one explicit 2.4 km target from the sheet through the shared Running command** - `fe74ec32` (test RED) and `1ebcee1d` (feat)
2. **Task 2: Enforce target validation, receipt replay, revision conflict, and atomic source consistency** - `0746fa8b` (test RED) and `8006376e` (feat)
3. **Task 3: Preserve target drafts through invalid, stale, storage, and read-back failures** - `84fe4ffd` (feat)

## Files Created/Modified

- `src/ui/components/RunningTargetSheet.tsx` - Revision-bound target form, per-distance draft retention, retry/reload states, and explicit discard semantics.
- `src/ui/__tests__/RunningTargetSheet.test.tsx` - Component proof for defaults, validation, stale/reload recovery, stable retry receipts, and dismissal.
- `src/domains/running/commands.ts` - Canonical target validation and shared source command construction.
- `src/domains/running/commands.test.ts` - Target date, duration, and weekday-order validation proof before source writes.
- `src/platform/sqlite/repositories/runningPlanRepository.ts` - Target results projected from the existing immutable source graph receipt transaction.
- `src/bootstrap/runningPlanRuntime.tsx` - UI-facing save port with request-envelope retry retention and required read-back acknowledgement.
- `src/bootstrap/runningPlanRuntime.test.tsx` - Runtime request and missing-read-back coverage.
- `tests/integration/running-foundation.test.ts` - Real SQLite target commit, replay, receipt conflict, stale revision, and history proof.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/RunningTargetSheet.test.tsx` - passed (1 suite, 5 tests).
- `npm run test:unit -- --runInBand src/domains/running/commands.test.ts src/bootstrap/runningPlanRuntime.test.tsx` - passed (2 suites, 8 tests).
- `npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts` - passed (1 suite, 13 tests).
- `npm run typecheck` - passed.
- `npm run check:boundaries` - passed (`Boundary check passed (406 files)`).
- Focused strict coverage tests passed, but their runner correctly failed its repository-wide global gate because the deliberately focused test selection does not cover the whole repository.
- `npm run test:coverage -- --runInBand` completed with repository-wide coverage below configured thresholds: lines 89.51%/90%, statements 88.19%/90%, functions 87.08%/90%, branches 84.85%/85%. This is an unresolved verification failure, not a passing strict-coverage result.

## Decisions Made

- Reused `running_goals` revisions and the `running_plan_receipts` source graph rather than creating a target table or a Progress-local store. This keeps one per-sport/source authority across all consumers.
- Used target-specific projections from the receipt transaction: exact receipt/payload replays return `already_committed`; changed payloads and stale expected revisions fail closed.
- Kept the sheet's retry ID with each distance draft. A recoverable write fault sends the original receipt envelope again, while a new semantic edit receives a new request ID.
- Replaced a boundary-violating cross-domain date-helper import with local deterministic date validation in the Running command module; the boundary checker then passed without adding a cross-domain dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed a forbidden cross-domain date-helper import**

- **Found during:** Task 2 (target validation and source consistency)
- **Issue:** A direct import of the scheduling-local date helper made `npm run check:boundaries` fail with `cross-domain internal import`.
- **Fix:** Kept deterministic owner-local date validation within `src/domains/running/commands.ts`, avoiding a forbidden dependency while preserving the required invalid-date fence.
- **Files modified:** `src/domains/running/commands.ts`
- **Verification:** `npm run check:boundaries` passed after the change.
- **Committed in:** `8006376e` (part of Task 2)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The adjustment preserved the plan's validation requirement and the repository's domain-boundary contract without widening source ownership.

## Issues Encountered

- The full strict coverage run remains under the repository-wide configured thresholds. Target-specific component, unit, integration, type, and boundary checks pass, but this plan does not claim the global coverage gate passed. The shortfall includes legacy/unrelated paths outside the target-specific behavior; expanding those branches would exceed this plan's owned files and the user's explicit scope.
- The cross-phase `.planning/WINDOWS.md` ledger and state/roadmap/requirements files were intentionally not changed because this execution was explicitly limited to the plan's owned implementation files and `19-06-SUMMARY.md`.

## Known Stubs

None. The sheet's nullable target values represent an unset target for non-2.4 km distances; no placeholder or mock target is rendered as authoritative data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Library, plan detail, and Progress can use the same committed source target revision without a separate target store or optimistic root mutation.
- Follow-up verification should restore the repository-wide strict coverage threshold before shipping; no source schema, tracking, native, or report work was included here.

## Self-Check: PASSED

- All eight declared implementation/test files exist and are committed in `fe74ec32`, `1ebcee1d`, `0746fa8b`, `8006376e`, and `84fe4ffd`.
- The scoped diff from `5db77a8ee3e1d61b0909997c9e8e782e084ab794` contains only the eight declared implementation/test files before this summary; no tracked file deletion, schema change, network endpoint, auth path, file-access surface, or unresolved UI stub was introduced.

---
*Phase: 19-progress-parity*
*Completed: 2026-10-12*
