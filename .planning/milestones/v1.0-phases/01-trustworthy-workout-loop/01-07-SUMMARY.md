---
phase: 01-trustworthy-workout-loop
plan: 07
subsystem: workout
tags: [sqlite, content-fixture, copied-plan, schedule, today, snapshots, expo-router, accessibility]

requires:
  - phase: 01-06
    provides: Complete private SQLite schema, serialized writer, migrations, retained fixtures, effects, and trusted launch vocabulary
provides:
  - Frozen reviewed Full Body Foundation A/B content with canonical SHA-256
  - Atomic bundled import and independently mutable copied-plan activation
  - Two-week weekday schedule with A/B/A then B/A/B bindings
  - Profile-aware load/reps and timed-hold targets, policies, units, and observations
  - Planned, alternate, rest-day, and empty workout starts with immutable session snapshots
  - Source-backed Today read model and accessible/adaptive first-use, schedule, rest, history, suggestion, resume, and failure UI
  - Production runtime that opens, migrates, repairs, and queries SQLite before enabling root actions
affects: [01-08-active-workout, 01-09-rest, 01-10-completion, phase-2-library, schedule-history]

actuals:
  tokens: 45310
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - Canonical versioned JSON content fixture parsed by strict Zod boundary
    - Bundled import plus copied activation in one serialized transaction
    - Profile-neutral JSON target/unit/rule snapshots with retained load/reps columns
    - Explicit two-week weekday schedule bindings that start commands never mutate
    - Runtime generation tokens preventing stale launch completions after retry/unmount
    - Source-backed UI actions refreshing committed Today state without optimistic facts

key-files:
  created:
    - assets/content/full-body-foundation.v1.json
    - src/domains/content/index.ts
    - src/domains/plans/index.ts
    - src/domains/plans/activateStarterPlan.ts
    - src/domains/workout/index.ts
    - src/domains/workout/startWorkout.ts
    - src/platform/sqlite/repositories/plansWorkoutRepository.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - src/ui/screens/TodayScreen.tsx
    - src/ui/components/WorkoutStartSheet.tsx
    - tests/integration/plan-workout-tracer.test.ts
    - src/ui/__tests__/TodayScreen.test.tsx
  modified:
    - src/platform/sqlite/migrations/0001_initial.ts
    - tests/migrations/fixtures/v1-phase1.sql
    - src/testing/contracts/migrationsEffects.contract.ts
    - tests/sqlite-host/migrations-effects.test.ts
    - app/_layout.tsx
    - app/(tabs)/_layout.tsx
    - app/(tabs)/index.tsx
    - src/ui/screens/RootScreens.tsx
    - package.json
    - jest.config.js

key-decisions:
  - "Timed holds use explicit timed_hold targets and manual_hold policies; seconds are never encoded as repetitions."
  - "The unreleased v1 schema was completed with schedule rows plus JSON target/unit/rule/observation snapshots while retaining load/reps scalar columns for the working-set tracer."
  - "Bundled re-import updates bundled rows only; repeated activation returns the existing copied plan and preserves user-edited names, targets, and revisions."
  - "Scheduled, alternate, rest-day, and empty starts create distinct session sources and never change schedule bindings."
  - "The production runtime repairs stale effect claims and overdue rest before the first trusted Today read; stale async launch generations close their own kernels and cannot replace current services."
  - "Action errors preserve current authoritative Today facts and expose only bounded GT-ACTION01 recovery metadata."

patterns-established:
  - "Ownership boundary: one repository transaction imports immutable bundled identities and clones all mutable plan/day/target/policy/schedule facts under copied IDs."
  - "Snapshot boundary: session exercise name/order/profile/rest plus set target/unit/rule version are copied before a workout becomes visible."
  - "Today hierarchy: plan/day and Start precede history; pending suggestions remain separate actions beside unchanged current targets."
  - "Launch boundary: roots remain disabled until open, migration, stale-lease repair, overdue-rest repair, and first Today query complete."

requirements-completed: [WORK-01, WORK-02, WORK-03, WORK-04]

coverage:
  - id: D1
    description: "The reviewed Full Body Foundation fixture activates atomically as a separate user-owned copy while bundled content and copied edits remain isolated."
    requirement: WORK-01
    verification:
      - kind: integration
        ref: "tests/integration/plan-workout-tracer.test.ts#Plan 01-07 starter activation"
        status: pass
      - kind: other
        ref: "canonical fixture SHA-256 e4a8af5ffc21052116e10d97b3c9ed3dfbf66b50ae9a1b1e88ae1078278c81fd"
        status: pass
    human_judgment: false
  - id: D2
    description: "Today presents scheduled day, estimate, consistent current targets, latest comparable history, and pending suggestion status from committed source facts."
    requirement: WORK-02
    verification:
      - kind: integration
        ref: "tests/integration/plan-workout-tracer.test.ts#Plan 01-07 Today read model"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/TodayScreen.test.tsx#Plan 01-07 TodayScreen"
        status: pass
    human_judgment: false
  - id: D3
    description: "Scheduled, alternate, rest-day, and empty starts create explicit session sources without silently advancing the two-week weekday schedule."
    requirement: WORK-03
    verification:
      - kind: integration
        ref: "tests/integration/plan-workout-tracer.test.ts#Plan 01-07 workout starts"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/TodayScreen.test.tsx#opens start alternatives without implying schedule advancement"
        status: pass
    human_judgment: false
  - id: D4
    description: "Planned starts persist immutable exercise names, ordering, metric profiles, units, targets, and rule versions for load/reps and timed holds."
    requirement: WORK-04
    verification:
      - kind: integration
        ref: "tests/integration/plan-workout-tracer.test.ts#starts planned session with immutable snapshots"
        status: pass
      - kind: e2e
        ref: "npm run test:sqlite:device -- --manifest artifacts/native/migrations-effects/build.json --suite migrations-effects"
        status: pass
    human_judgment: false

duration: 49 min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 7: Frozen Starter, Copied Activation, and Source-Backed Today Summary

**Reviewed Full Body Foundation content now activates as an independent copied plan, drives a two-week schedule, starts immutable workouts, and renders trustworthy Today evidence from SQLite**

## Performance

- **Duration:** 49 min
- **Started:** 2026-08-16T04:51:26Z
- **Completed:** 2026-08-16T05:40:20Z
- **Tasks:** 2
- **Files changed:** 24
- **Commits:** 3
- **Final tests:** 412 passed

## Accomplishments

- Froze the exact reviewed ten-exercise Full Body Foundation A/B fixture, including integer load targets, timed holds, warm-ups, rests, increments, policy IDs, attribution, and alternating two-week weekday schedule.
- Implemented strict content validation, atomic bundled import, idempotent copied-plan activation, copied-edit preservation, commit rollback, and fail-closed missing-target/empty-day behavior.
- Completed the v1 source schema for profile-aware target/unit/rule/observation snapshots and schedule bindings, with retained and installed Expo SQLite contracts updated to 18 tables.
- Implemented scheduled, alternate, rest-day, and empty workout starts with immutable session exercise/set snapshots and unchanged schedule semantics.
- Delivered source-backed Today states for first use, activation preview, schedule, history, pending suggestions, rest day, active resume, loading, root errors, and safe action retry across compact/medium/expanded widths.
- Wired production launch to the private SQLite kernel, migrations, stale-lease recovery, overdue-rest repair, and first trusted Today query while preventing stale retry/unmount completions from replacing current services.

## Task Commits

1. **RED activation/start contracts:** `b3185bb` — exact fixture, ownership, rollback, schedule stability, all start modes, and immutable snapshot requirements.
2. **Task 1 GREEN:** `3927a2e` — frozen content, completed schema, copied activation, schedule, repository, Today query, and profile-aware workout snapshots.
3. **Task 2 GREEN and hardening:** `afb4467` — source-backed Today UI, start sheet, production runtime, route composition, safe command recovery, and stale-generation protection.

## Files Created/Modified

- `assets/content/full-body-foundation.v1.json` — exact reviewed A/B program and schedule source.
- `src/domains/content/index.ts` — strict content boundary and profile-specific fixture contract.
- `src/domains/plans/activateStarterPlan.ts` — validated atomic activation command.
- `src/domains/workout/startWorkout.ts` — validated explicit workout-start command.
- `src/platform/sqlite/repositories/plansWorkoutRepository.ts` — bundled/copy ownership, schedules, Today queries, comparable history, and snapshots.
- `src/platform/sqlite/migrations/0001_initial.ts` — timed holds, schedule rows, profile-neutral snapshots, and observations.
- `src/bootstrap/workoutAppRuntime.tsx` — production open/migrate/repair/query lifecycle and command refresh.
- `src/ui/screens/TodayScreen.tsx` — approved Today hierarchy and all source-backed states.
- `src/ui/components/WorkoutStartSheet.tsx` — scheduled/alternate/empty choices with explicit non-advancement copy.
- `tests/integration/plan-workout-tracer.test.ts` — 38 content, ownership, schedule, start, snapshot, history, suggestion, and corruption cases.
- `src/ui/__tests__/TodayScreen.test.tsx` — 11 Today state, semantics, action-order, and adaptive cases.

## Decisions Made

- The reviewed timed-hold exercises remain genuine duration observations with manual progression; only load/reps targets participate in Phase 1 double progression.
- Schedule persistence uses one copied `plan_schedules` row plus explicit week/weekday/day bindings, making rest-day and alternate starts observable without mutating schedule position.
- Content import and copied activation share one transaction. Existing copied rows are returned rather than silently replaced, even after the bundled source is refreshed.
- Production Today uses a purpose-built runtime provider rather than optimistic query state. Every mutation refreshes committed read models; failed actions retain current facts.
- Retry/unmount increments a generation token. Any stale open, migration, query, success, or error completion is ignored and its kernel is closed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Completed profile-aware Phase 1 schema**
- **Found during:** Task 1 fixture materialization
- **Issue:** The prior v1 schema accepted only `load_reps`, but the approved fixture includes Plank and Side Plank as timed holds and requires immutable units/rule snapshots.
- **Fix:** Added `timed_hold`, `manual_hold`, profile-neutral target/unit/rule/observation JSON, plan metadata, and schedule tables while retaining scalar load/reps columns.
- **Files modified:** initial migration, retained v1 fixture, migration contracts/tests, repository.
- **Verification:** 129 host migration/kernel tests; actual Expo SQLite migration preflight and kernel suite; all new integrity modules at 100%.
- **Committed in:** `3927a2e`

**2. [Rule 1 - Bug] Prevented stale launch generations from winning after retry**
- **Found during:** Task 2 lifecycle coverage
- **Issue:** An older asynchronous open/migration/query could complete after retry and replace current services.
- **Fix:** Added generation checks after every asynchronous launch stage; stale kernels close themselves and never update state/services.
- **Files modified:** runtime provider and lifecycle tests.
- **Verification:** stale success and stale error tests for open, migration, and query; runtime module at 100% statements/branches/functions/lines.
- **Committed in:** `afb4467`

**3. [Rule 2 - Missing Critical] Preserved trusted launch repairs and safe action recovery**
- **Found during:** Final architecture review
- **Issue:** New production composition needed stale-effect reset and overdue-rest repair before Today, and route command rejections needed bounded UI recovery.
- **Fix:** Added lease/rest preparation, safe `GT-ACTION01` state, contained route promises, and authoritative-state preservation.
- **Files modified:** runtime, Today UI, route, tests.
- **Verification:** production-adapter test, action-error UI/runtime tests, full merged suite, and native migration evidence.
- **Committed in:** `afb4467`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical integrity safeguards).
**Impact on plan:** All changes were required to implement the reviewed fixture and trusted source-backed flow correctly. No Phase 2 catalog/editor, broad progression engine, package addition, or network/account scope was introduced.

## Issues Encountered

- The original schema contract was too narrow for the already-approved timed holds. Because v1 is unreleased, the schema and retained fixture were revised together and re-proven on host and actual Expo SQLite.
- A focused native preflight was started before final lifecycle hardening finished; the build manifest ultimately matched final implementation HEAD `afb4467`, so the completed artifact remained authoritative.
- The final shell wrapper command used zsh’s reserved `status` variable after all test commands had already passed. The captured log confirms every suite and coverage gate passed.

## Native Evidence

- **Implementation HEAD:** `afb44670857ea551870317051847da6ab24dc5f7`
- **Source-tree SHA-256:** `5c88c15346c4015e3f1ff241254436a48a12dae9258b2fca7dfbb4f9648818ff`
- **APK:** `artifacts/native/migrations-effects/gym-tracker-migrations-effects-devtest.apk`
- **APK size:** 251,738,259 bytes
- **APK SHA-256:** `b0696c8ff079d1c8c628d09f2edfaf3bcdf6277d3ac602ec87f20611953b433d`
- **Alignment:** 16 KiB verified
- **Installed bytes:** Exact SHA-256 match
- **Package:** `com.fchoo.gymtracker.devtest`
- **Device:** `emulator-5554`, Android 16/API 36, `arm64-v8a`, `sdk_gphone64_arm64`
- **Migration/effects preflight:** PASS, including updated 18-table schema assertion
- **SQLite kernel:** 10 passed, 0 unsuccessful, 0 skipped
- **Evidence verifier:** PASS against current source, retained APK, installed package, and live device

## Test Evidence

- `npm run test:unit -- --runInBand` — PASS, 201/201.
- `npm run test:components -- --runInBand` — PASS, 44/44.
- `npm run test:sqlite:host -- --runInBand` — PASS, 129/129.
- `npm run test:integration -- --runInBand` — PASS, 38/38.
- `npm run test:coverage -- --runInBand` — PASS, 412/412; 99.33% statements, 97.7% branches, 97.71% functions, 99.41% lines.
- New content, plan/workout command, repository, migration, and runtime modules — 100% statements, branches, functions, and lines.
- `npm run android:devtest:fresh -- --suite migrations-effects` — PASS.
- `npm run test:sqlite:device -- --manifest artifacts/native/migrations-effects/build.json --suite migrations-effects` — PASS.
- `node scripts/verify-native-evidence.mjs artifacts/native/migrations-effects/result.json` — PASS.

## Authentication Gates

None.

## Known Stubs

- The focused Active Workout route still renders its Phase 1 skeleton; Plan 01-08 owns persisted drafts, values, warm-ups, set completion, Retry, and Undo.
- Recommendation review is visible as a distinct Today action, but its decision surface remains owned by Plan 01-10.

## Threat Flags

None. Content tampering, ownership overwrite, start-mode mutation, stale launch generations, action disclosure, and source/APK identity all have tested mitigations.

## Next Phase Readiness

- Plan 01-08 can read fully materialized active sessions containing warm-up/working sets, load/reps or timed-hold snapshots, active pointers, and revisions.
- Plan 01-09 can rely on startup stale-lease and overdue-rest repair plus immutable exercise rest durations.
- Plan 01-10 can derive completion/history/recommendation evidence from immutable profile-aware snapshots and copied target revisions.
- No blocker remains for the working-set tracer.

## Self-Check: PASSED

- All declared Plan 01-07 source, asset, integration, UI, retained-fixture, and runtime artifacts exist.
- All three plan commits exist with the required trailer exactly once.
- The frozen fixture digest, 412-test merged suite, 100% new integrity-module coverage, installed API 36 schema preflight, ten native kernel cases, source digest, APK digest, and installed bytes all verify.
- Generated native trees remain untracked and absent after the build.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
