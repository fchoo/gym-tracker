---
phase: 16-calendar-parity
fixed_at: 2026-10-13T03:05:44Z
review_path: .planning/phases/16-calendar-parity/16-REVIEW.md
iteration: 1
findings_in_scope: 17
fixed: 17
skipped: 0
status: all_fixed
base: 8e01ca7870872bd217721e468d95c415ea511c13
head: f02cafdc59e10c3b4dfc2e9fc11f043b32e31caa
branch: agent-phase16-fix2-runtime
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-10-13T03:05:44Z
**Source review:** `.planning/phases/16-calendar-parity/16-REVIEW.md`
**Iteration:** 1
**Execution checkout:** isolated worktree `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p16-fix2-runtime-live`

**Summary:**

- Findings in scope: 17
- Fixed: 17
- Skipped: 0
- Atomic source/test commits: 17
- Native/device execution: not run, as required; Phase 20 remains the native evidence owner
- Prohibited evidence scripts, maps, fixtures, Phase 19 files, Phase 14 files, review artifacts, and shared tracking files modified: none

## Fixed Issues

### CR-06: Scheduled Running destinations resolved through mutable current membership

**Status:** fixed: requires human verification
**Files modified:** `src/bootstrap/calendarReadPorts.test.ts`, `src/bootstrap/calendarReadPorts.ts`, `src/bootstrap/runningPlanRuntime.tsx`, `src/platform/sqlite/repositories/runningPlanRepository.ts`, `tests/sqlite-host/running-plans.test.ts`
**Commit:** `151571c6`
**Applied fix:** Added an exact scheduled-session aggregate read that resolves the immutable session revision and slot revision referenced by the Calendar destination. A real-SQLite regression advances the current revision to r2 and proves a Calendar route for r1 still reads r1 without falling through to mutable membership.

### CR-07: Planned Strength destinations were mutable and not restricted to active pending occurrences

**Status:** fixed: requires human verification
**Files modified:** `app/__tests__/calendar-cross-destination-route.test.tsx`, `src/bootstrap/workoutAppRuntime.test.tsx`, `src/domains/workout/index.ts`, `src/platform/sqlite/repositories/plansWorkoutRepository.ts`, `src/platform/sqlite/repositories/scheduleRepository.ts`, `src/platform/sqlite/repositories/strengthOccurrenceSnapshot.ts`, `src/platform/sqlite/repositories/trainingCalendarRepository.ts`, `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx`, `src/ui/calendar/calendarPorts.test.ts`, `tests/integration/today-schedule-workout.test.ts`, `tests/sqlite-host/trainingCalendarRepository.real.test.ts`, `tests/sqlite-host/trainingCalendarRepository.test.ts`
**Commit:** `87752957`
**Applied fix:** Captured immutable planned Strength occurrence facts in the existing append-only schedule-event store, avoiding a schema or backup-format migration. Reads now require an active schedule, active plan, pending occurrence, exact opportunity/source revisions, a valid frozen snapshot, and non-empty canonical targets. Override materialization captures the post-revision snapshot before the occurrence can be routed.

### CR-08: Calendar session deep links accepted removed or non-historical sessions as complete

**Status:** fixed: requires human verification
**Files modified:** `app/__tests__/session-route.test.tsx`, `src/bootstrap/calendarReadPorts.test.ts`, `src/bootstrap/calendarReadPorts.ts`, `src/bootstrap/workoutAppRuntime.tsx`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`, `src/ui/calendar/CalendarRouteAdapters.tsx`, `tests/sqlite-host/historyCommandRepository.test.ts`
**Commit:** `fe0b950b`
**Applied fix:** Introduced a Calendar-only lifecycle-filtered history detail read. Calendar routes now reject removed, in-progress, draft, and otherwise non-historical identities instead of rendering them as complete, while management history behavior remains unchanged.

### CR-09: A matched Garmin activity disappeared when its linked opportunity was outside the active range

**Status:** fixed: requires human verification
**Files modified:** `src/platform/sqlite/repositories/trainingCalendarRepository.ts`, `tests/sqlite-host/trainingCalendarRepository.real.test.ts`
**Commit:** `66ae5658`
**Applied fix:** Decoupled imported-history visibility from active-range opportunity membership. A valid matched Garmin activity remains visible with its immutable match facts even when the linked opportunity is outside the requested range; malformed match metadata still fails closed and cannot suppress the activity.

### CR-10: Adjacent Calendar panels queried an incomplete source range

**Status:** fixed: requires human verification
**Files modified:** `src/ui/__tests__/CalendarScreen.test.tsx`, `src/ui/screens/CalendarScreen.tsx`
**Commit:** `610bca41`
**Applied fix:** Calendar range planning now includes the complete outer weeks required by both adjacent panels rather than only the visible month boundaries. Mounted regressions assert events at both outer edges remain present in previews.

### CR-11: Focus did not always refresh and could restore an obsolete detail snapshot

**Status:** fixed: requires human verification
**Files modified:** `src/ui/__tests__/CalendarScreen.test.tsx`, `src/ui/screens/CalendarScreen.tsx`
**Commit:** `5a21acfd`
**Applied fix:** Separated root-focus refresh from one-shot detail-return restoration. Every root focus refreshes authoritative data; detail return state is consumed once and restores focus only after the matching refresh proves the destination still exists. Later focus events cannot reapply stale detail state or overwrite the owner's newer month.

### CR-12: Retained grid, title, and interaction month identities could diverge during replacement

**Status:** fixed: requires human verification
**Files modified:** `src/ui/__tests__/CalendarScreen.test.tsx`, `src/ui/calendar/CalendarMonthViewport.tsx`, `src/ui/calendar/CalendarWeekRow.tsx`, `src/ui/screens/CalendarScreen.tsx`
**Commit:** `5c823e4a`
**Applied fix:** Retained month rendering now uses one coherent snapshot identity for title, grid, selection, and interaction. Stale retained cells are inert while authoritative replacement is pending, and rollback preserves the last complete month rather than mixing identities.

### CR-13: A second drag could cancel a transition before JS observed settlement

**Status:** fixed: requires human verification
**Files modified:** `src/ui/__tests__/CalendarTransitions.test.tsx`, `src/ui/calendar/CalendarMonthViewport.tsx`
**Commit:** `8c6af741`
**Applied fix:** Added a UI-thread settlement latch that closes when the first drag commits and remains closed through completion. Mounted gesture regressions prove a second drag cannot steal or cancel the committed settle while JS is still catching up.

### CR-14: Reduced-motion changes discarded an adjacent destination

**Status:** fixed: requires human verification
**Files modified:** `src/ui/__tests__/CalendarTransitions.test.tsx`, `src/ui/calendar/calendarTransitionController.ts`
**Commit:** `edc45efc`
**Applied fix:** Reduced-motion transitions now preserve and immediately settle the already-selected adjacent destination instead of resetting to the source month. The pure controller remains exact 100/100/100/100 under focused coverage.

### CR-15: Compact-height focused layout did not reserve usable agenda space

**Status:** fixed: requires human verification
**Files modified:** `src/ui/__tests__/CalendarScreen.test.tsx`, `src/ui/__tests__/CalendarTransitions.test.tsx`, `src/ui/calendar/CalendarMonthViewport.tsx`
**Commit:** `5925ca65`
**Applied fix:** Focused layout now computes a scale-aware minimum agenda allocation and lets the month area yield vertical space under compact height and 200% text. Mounted regressions assert a reachable agenda row instead of a mathematically present but unusable region.

### WR-01: Running Calendar rows exposed placeholders instead of source-backed targets

**Status:** fixed: requires human verification
**Files modified:** `src/domains/running/contracts.test.ts`, `src/domains/running/contracts.ts`, `src/platform/sqlite/repositories/trainingCalendarRepository.ts`, `src/ui/components/RunningSessionFields.tsx`, `tests/sqlite-host/trainingCalendarRepository.real.test.ts`
**Commit:** `efdb259d`
**Applied fix:** Added a shared bounded readback formatter for every Running session kind, SI work quantity, advisory target, and contextual variant. Calendar rows and Running detail now derive the same factual target summary from the immutable session definition.

### WR-02: Calendar-origin Garmin detail initially focused the heading instead of Back

**Status:** fixed: requires human verification
**Files modified:** `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx`, `src/ui/screens/ImportedActivityDetailScreen.tsx`
**Commit:** `678544bd`
**Applied fix:** Calendar mode now sends initial accessible focus to Back while management mode preserves heading-first behavior. Mounted focus regressions cover both origins.

### WR-03: Today did not refresh for timezone or wall-clock changes while active

**Status:** fixed: requires human verification
**Files modified:** `src/ui/calendar/useCurrentLocalDate.test.tsx`, `src/ui/calendar/useCurrentLocalDate.ts`
**Commit:** `74cfa0df`
**Applied fix:** Added bounded one-minute active civil-date polling using the current runtime timezone, preserving foreground refresh and cleaning up timers. Tests cover midnight, wall-clock changes, timezone changes, inactive periods, and resume.

### WR-04: Settle fallback could dispatch duplicate completion

**Status:** fixed: requires human verification
**Files modified:** `src/ui/__tests__/CalendarTransitions.test.tsx`, `src/ui/calendar/CalendarMonthViewport.tsx`
**Commit:** `7c3c4de8`
**Applied fix:** Made the JS settlement fallback idempotent with the UI-thread completion path. Repeated callbacks, fallback completion, and normal animation completion converge on one destination dispatch.

### WR-05: Reused management routes exposed stale entity state after parameter changes

**Status:** fixed: requires human verification
**Files modified:** `app/__tests__/garmin-activity-route.test.tsx`, `app/__tests__/session-route.test.tsx`, `app/garmin/activity/[activityId].tsx`, `app/session/[sessionId].tsx`
**Commit:** `80408ae1`
**Applied fix:** Management route state is now keyed to the current entity identity, and Garmin revision-review state also includes the source revision. Rerender tests change route parameters while the replacement promise is pending and prove old actions/details are not exposed.

### WR-06: Read-only detail rows fabricated an always-empty Previous column

**Status:** fixed: requires human verification
**Files modified:** `src/domains/workout/sessionDetail.ts`, `src/domains/workout/workoutPresentation.ts`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`, `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx`, `src/ui/__tests__/WorkoutSessionPresentation.test.tsx`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx`, `tests/sqlite-host/historyCommandRepository.test.ts`
**Commit:** `8e137e47`
**Applied fix:** Query-only history and planned occurrence DTOs now carry immutable previous observations. A shared presenter formats them with the metric contract; `—` is reserved for a verified absent prior fact. Positive and absent-history regressions cover both read-only surfaces.

### WR-07: The declared repository coverage gate was red

**Status:** fixed
**Files modified:** `src/bootstrap/runningPlanRuntime.test.tsx`, `src/bootstrap/workoutAppRuntime.test.tsx`, `src/domains/content/catalog.test.ts`, `src/domains/plans/planImpactCommands.test.ts`, `src/domains/portability/backupFormat.test.ts`, `src/domains/running/contracts.test.ts`, `src/domains/running/contracts.ts`, `src/platform/sqlite/repositories/strengthOccurrenceSnapshot.ts`, `src/platform/sqlite/repositories/trainingCalendarRepository.ts`, `src/ui/__tests__/CalendarScreen.test.tsx`, `src/ui/__tests__/CalendarTransitions.test.tsx`, `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx`, `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx`, `src/ui/__tests__/RunningPlanDetailScreen.test.tsx`, `src/ui/calendar/CalendarAgenda.test.tsx`, `src/ui/calendar/useCurrentLocalDate.test.tsx`, `tests/integration/custom-exercise.test.ts`, `tests/integration/plan-impact-replacement.test.ts`, `tests/integration/schedule-commands.test.ts`, `tests/integration/starter-activation-repository.test.ts`, `tests/integration/today-schedule-workout.test.ts`, `tests/sqlite-host/migrations-effects.test.ts`, `tests/sqlite-host/running-plans.test.ts`, `tests/sqlite-host/trainingCalendarRepository.test.ts`
**Commit:** `f02cafdc`
**Applied fix:** Added behavior-bearing runtime, mounted UI, route, source-contract, repository-race, real-SQLite, and fail-closed migration coverage. Removed one unreachable post-parse guard whose non-empty invariant is already enforced by the immutable Strength snapshot parser. Thresholds and integrity declarations were not weakened. The exact declared command now passes global thresholds and all 154 integrity-critical files.

## Skipped Issues

None — all findings in scope were fixed and committed atomically.

## Verification

All verification ran in the isolated worktree `/Users/bytedance/Documents/personal/gym_tracker/.trae/worktrees/p16-fix2-runtime-live`, not in the main/orchestrator checkout.

| Gate | Result | Evidence |
|---|---|---|
| TypeScript | PASS | `npm run typecheck` |
| Boundary policy | PASS | `npm run check:boundaries`; 429 files checked |
| Declared repository coverage | PASS | `npm run test:coverage -- --runInBand`; 310/310 suites, 4,467/4,467 tests |
| Global coverage | PASS | Statements 90.19%, branches 86.43%, functions 90.50%, lines 91.45% against existing 90/85/90/90 thresholds |
| Integrity allowlist | PASS | 154/154 integrity-critical files at 100% statements, branches, functions, and lines |
| Phase 16 focused integrity | PASS | `localDate.ts`, `trainingCalendarRepository.ts`, `phase16CalendarTestControls.ts`, and `calendarTransitionController.ts` at 100/100/100/100; 5 suites / 86 tests |
| Phase 16 evidence helper coverage | PASS | 36 Node tests; all six helpers at 100% lines, branches, and functions; Calendar controls 6/6 at 100/100/100/100 |
| Mounted Calendar screen | PASS | 19/19 mounted component tests, including focus refresh, retained identity, adjacent range, Today, compact-height agenda, Back arbitration, and diagnostics |
| Real-SQLite and integration behavior | PASS | Included in the exact four-project coverage run; immutable Running/Strength, Garmin visibility, schedule, workout, route, receipt-race, and Progress suites all passed |
| Diff hygiene | PASS | `git diff --check` before WR-07 commit; no whitespace errors |
| Base ancestry | PASS | Base `8e01ca7870872bd217721e468d95c415ea511c13` is an ancestor of head `f02cafdc59e10c3b4dfc2e9fc11f043b32e31caa` |

The full Jest run emitted existing non-failing Expo Go notification and React `act(...)` harness warnings. They did not fail any suite or gate and were not converted into suppressed output.

## Scope and Preservation Checks

- Preserved the first-review fixes and Progress revision behavior; Progress repository, route, screen, and parity suites passed in the final four-project run.
- Added no schema migration and changed no backup format for planned Strength snapshots; the implementation uses the existing immutable `owned_plan_schedule_events` authority.
- Did not modify Phase 16 native evidence scripts, maps, fixtures, Maestro flows, Phase 19 files, Phase 14 files, the review report, shared tracking, or the orchestrator checkout.
- Did not run Android builds, ADB, Maestro, device focus, screenshots, or other native execution.
- Did not push, create a PR, merge, or deploy.
- Every fix commit ends with `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`.

## Native/Human Verification Boundary

Host automation proves source selection, identity fencing, state transitions, mounted interaction contracts, real-SQLite persistence, route reuse, and declared coverage. Per the task boundary, native validation remains required for physical gesture feel, device accessibility focus, compact landscape geometry at platform font scaling, animation timing, screenshots, and visual fidelity. Those checks are intentionally not represented as executed here.

---

_Fixed: 2026-10-13T03:05:44Z_
_Fixer: TRAE (gsd-code-fixer)_
_Iteration: 1_
