---
phase: 02-owned-library-and-planning
plan: 31
subsystem: rest-alerts
tags: [expo-notifications, expo-haptics, expo-sqlite, react-native, jest, accessibility]
requires:
  - phase: 02-owned-library-and-planning/02-30
    provides: Strict persisted default-on rest-alert preferences and immutable v2 Android notification channels
provides:
  - Discoverable, independently persisted Rest sound and Rest vibration settings on Today
  - Revision-keyed foreground rest-feedback attempts that are atomically queued and durably claimed at most once
  - Development-only deterministic controls and bounded result codes for preference and foreground/background alert evidence
affects: [plan-02-32, plan-02-34, plan-02-35, android-rest-alerts, native-evidence]
actuals:
  tokens: 33576
  tasks: 3
  commits: 13
tech-stack:
  added: []
  patterns:
    - Persist an eligible foreground expiry attempt with the authoritative rest expiry, then claim its enabled modality snapshot before best-effort platform effects.
    - Reconcile a failed optimistic preference write to persisted state and expose a bounded error instead of leaving the UI misleading.
    - Evolve immutable SQLite history through a forward migration; retain the prior migration unchanged.
key-files:
  created:
    - src/ui/components/RestAlertSettingsSheet.tsx
    - src/platform/notifications/expoForegroundRestFeedbackAdapter.ts
    - src/platform/sqlite/foregroundRestFeedbackStore.ts
    - src/platform/sqlite/migrations/0012_foreground_rest_feedback_attempts.ts
    - tests/sqlite-host/foreground-rest-feedback.test.ts
  modified:
    - src/bootstrap/workoutLifecycle.ts
    - src/bootstrap/workoutAppRuntime.tsx
    - src/ui/screens/TodayScreen.tsx
    - app/__notification-test-controls.tsx
    - src/bootstrap/phase1NotificationTestControls.ts
    - src/platform/sqlite/repositories/restRepository.ts
key-decisions:
  - The SQLite rest/workout transition stays authoritative; feedback is derived work queued in the same expiry transaction and platform delivery cannot undo it.
  - A durable claim permits at most one sound/vibration platform-feedback attempt per session and rest revision. A crash or adapter failure after that claim can mean no physical delivery and is not retried as a duplicate.
  - Migration 0011 remains unchanged. Forward-only migration 0012 replaces its legacy consumed representation with per-modality durable attempt rows and seeds old rows as terminal attempted work.
  - Preference writes are optimistic only while pending: a no-op/read-back or rejected write restores the persisted values, and a bounded accessible error is announced.
patterns-established:
  - Background re-entry and launch overdue reconciliation may reconcile notification projections but do not synthesize manual foreground feedback; launch drains only already-pending committed attempts.
  - Development evidence exposes bounded result codes and preference combinations, not raw device, workout, or owner data.
requirements-completed: [LIB-07, LIB-08]
coverage:
  - id: D1
    description: Today exposes accessible independent Rest sound and Rest vibration controls, persists/read-backs their values, reconciles active alerts, and rolls back the display with a bounded error when a write is rejected.
    requirement: LIB-07
    verification:
      - kind: automated_ui
        ref: src/ui/__tests__/TodayScreen.test.tsx#rest-alert settings persistence and rejected-write rollback
        status: pass
      - kind: unit
        ref: src/bootstrap/workoutAppRuntime.test.tsx#rest-alert preference runtime integration
        status: pass
    human_judgment: false
  - id: D2
    description: Eligible foreground rest expiry atomically queues a preference snapshot and allows at most one durably claimed best-effort platform-feedback attempt; launch recovers committed pending work without creating manual feedback for overdue background/launch reconciliation.
    requirement: LIB-08
    verification:
      - kind: unit
        ref: src/bootstrap/workoutLifecycle.test.ts#durable foreground feedback attempts
        status: pass
      - kind: integration
        ref: tests/integration/rest-lifecycle.test.ts#foreground feedback attempt persistence and permission recovery
        status: pass
      - kind: unit
        ref: tests/sqlite-host/foreground-rest-feedback.test.ts#foreground rest feedback attempts
        status: pass
    human_judgment: false
  - id: D3
    description: Development-only controls select all four modality combinations and report bounded foreground/background result codes, including foreground_expiry_attempted_once.
    requirement: LIB-08
    verification:
      - kind: unit
        ref: src/bootstrap/phase1NotificationTestControls.test.ts#runtime foreground-attempt and background-schedule result codes
        status: pass
      - kind: automated_ui
        ref: app/__notification-test-controls.test.tsx#development notification test controls
        status: pass
    human_judgment: false
  - id: D4
    description: An actual Android device audibly plays the enabled rest sound and physically vibrates for an eligible foreground expiry.
    requirement: LIB-08
    verification: []
    human_judgment: true
    rationale: Physical sound and vibration observation requires attended native-device review and is deferred to Plan 02-35 after Plan 02-34 produces the exact-HEAD build.
duration: 1h 25m
completed: 2026-08-22
status: complete
---

# Phase 02 Plan 31: Rest-Alert Settings and Durable Foreground Feedback Summary

**Today now owns accessible, independently persisted rest sound and vibration controls, while eligible foreground expiry records one durable, best-effort feedback attempt without making platform effects authoritative.**

## Performance

- **Duration:** 1h 25m
- **Started:** 2026-08-22T19:58:50+08:00
- **Completed:** 2026-08-22T21:24:01+08:00
- **Tasks:** 3/3
- **Files modified:** 32 implementation/test files

## Accomplishments

- Added a discoverable Rest alerts sheet beside Today’s appearance controls, with independently named/stateful `Rest sound` and `Rest vibration` switches, default-on read-back, notification-settings guidance, and accessible failure feedback.
- Added revision-keyed foreground feedback work: authoritative expiry atomically enqueues the enabled sound/vibration snapshot, a durable claim allows at most one platform attempt, and failures leave SQLite workout/rest truth intact.
- Replaced the original consumption-only feedback representation through forward migration `0012_foreground_rest_feedback_attempts.ts`; migration `0011_foreground_rest_feedback.ts` remains unchanged and legacy rows become terminal attempted rows.
- Added development-only deterministic controls for all preference combinations and bounded foreground/background outcomes, including `foreground_expiry_attempted_once`; no production route exposes them.

## Task Commits

Implementation and review repairs were committed atomically:

1. **Task 1: Add revision-keyed, durably claimed foreground feedback attempts** - `d21b361` (feat), `9fb9b77` (contract correction), and `c08575f` (durable-attempt repair)
2. **Task 2: Add accessible rest-alert settings to Today** - `db47597` (feat), `4ecd6d3` (production route wiring), `06e07f4` (UI-state hardening), and `127ceef` (failed-write reconciliation)
3. **Task 3: Extend deterministic native notification controls** - `9730836` (feat), `3394d2c` (runtime bridge), `96eb612` and `28dbfc9` (background/foreground result-code repairs), and `5648576` (persisted preference-write verification)

**Review metadata:** `3f4b53e` enables isolated executor worktrees; `9fb9b77` also corrects the plan’s feedback-delivery wording before the durable-attempt implementation.

## Files Created/Modified

- `src/ui/components/RestAlertSettingsSheet.tsx`, `src/ui/screens/TodayScreen.tsx`, and `src/bootstrap/workoutAppRuntime.tsx` - render, persist, read back, and error-reconcile the independent Today settings.
- `src/bootstrap/workoutLifecycle.ts` and `src/platform/sqlite/foregroundRestFeedbackStore.ts` - enqueue/claim the derived foreground feedback operation without altering authoritative rest facts.
- `src/platform/sqlite/migrations/0011_foreground_rest_feedback.ts` and `src/platform/sqlite/migrations/0012_foreground_rest_feedback_attempts.ts` - preserve the original v11 migration and add the forward v12 attempt-state migration.
- `src/platform/notifications/expoForegroundRestFeedbackAdapter.ts` - invokes enabled Expo tone/haptic effects after the durable claim.
- `app/__notification-test-controls.tsx` and `src/bootstrap/phase1NotificationTestControls.ts` - provide development-only deterministic evidence controls and bounded codes.
- `src/bootstrap/workoutLifecycle.test.ts`, `src/bootstrap/workoutAppRuntime.test.tsx`, `src/ui/__tests__/TodayScreen.test.tsx`, `tests/integration/rest-lifecycle.test.ts`, and `tests/sqlite-host/foreground-rest-feedback.test.ts` - cover preference state, durable attempt semantics, error handling, and migration behavior.

## Decisions Made

- The durable contract is **at most one platform-feedback attempt**, not exactly-once physical sound/vibration delivery. Claiming happens before the best-effort adapters, so a crash or adapter failure after claim may result in no physical delivery; no duplicate is synthesized later.
- Only an eligible continuously foreground expiry (or an explicit deterministic test path) creates manual feedback work. Launch recovers already-pending committed work, while background re-entry and launch overdue reconciliation do not create it.
- Preferences are a persisted UI/platform projection. A rejected write explicitly reverts the visible switches to the last persisted values and announces a bounded error; timer and SQLite state remain usable.
- No package was installed. Existing Expo Notifications and Haptics integrations remain the platform boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The original consumption marker could not express a durable per-modality attempt state**
- **Found during:** Task 1 review repair
- **Issue:** The v11 consumption marker did not retain enough state to distinguish queued, claimed, and completed modality attempts or provide correct launch recovery.
- **Fix:** Added forward migration `0012_foreground_rest_feedback_attempts.ts`, preserved `0011` unchanged, migrated legacy rows to terminal attempted state, and updated the store/lifecycle/runtime contracts.
- **Files modified:** `src/platform/sqlite/migrations/0012_foreground_rest_feedback_attempts.ts`, `src/platform/sqlite/foregroundRestFeedbackStore.ts`, lifecycle/runtime sources and focused tests.
- **Verification:** Focused lifecycle/runtime, host SQLite, and integration feedback-attempt coverage passed.
- **Committed in:** `c08575f`

**2. [Rule 2 - Missing Critical] Optimistic rest-alert settings could remain visually incorrect after a failed persistence write**
- **Found during:** Task 2 review repair
- **Issue:** The UI needed to restore persisted preferences and surface a bounded failure rather than retain an uncommitted switch state.
- **Fix:** Re-read/reconciled persisted preferences after no-op or rejected writes and announced an accessible error.
- **Files modified:** `src/bootstrap/workoutAppRuntime.tsx`, `src/ui/components/RestAlertSettingsSheet.tsx`, `src/ui/screens/TodayScreen.tsx`, and focused tests.
- **Verification:** Today and runtime rejected-write regression coverage passed.
- **Committed in:** `127ceef`

**3. [Rule 2 - Missing Critical] Deterministic controls needed result-code alignment for foreground and background evidence**
- **Found during:** Task 3 review repair
- **Issue:** The test-control probe had stale/ambiguous background handling and a foreground result-code mismatch.
- **Fix:** Kept background expiry non-synthesizing, aligned the foreground result to `foreground_expiry_attempted_once`, and verified preference writes through the runtime boundary.
- **Files modified:** `src/bootstrap/phase1NotificationTestControls.ts`, its tests, and `app/__notification-test-controls.test.tsx`.
- **Verification:** Focused test-control and runtime suites passed.
- **Committed in:** `96eb612`, `5648576`, and `28dbfc9`

---

**Total deviations:** 3 auto-fixed (3 Rule 2 missing-critical review repairs)
**Impact on plan:** The repairs tightened the planned durability, rollback, and deterministic-evidence contracts without widening product scope.

## Issues Encountered

- The existing Expo Notifications test imports emit the expected Expo Go remote-push deprecation warning. It does not change the focused assertions or test result.
- Final aggregate verification passed: typecheck and lint, plus 62 unit, 22 component, 42 host-SQLite, and 6 integration tests. An independent rereview after the preference-rollback repair was CLEAN.
- No package installation, Android build, device action, or attended physical observation occurred in this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-32 can trace this implementation against the full D-56..D-67/G-02 evidence ledger, including the implemented-but-not-physically-observed rest-feedback behavior.
- Plan 02-34 owns an exact-HEAD Android build. Plan 02-35 owns the attended native sound/vibration observation; this summary intentionally does not claim that evidence.

## Self-Check: PASSED

- Confirmed this summary describes the current main-equivalent implementation at `127ceef`, including all 13 Plan 02-31 implementation/review commits after `d21b361^`; each Plan 02-31 commit carries the required `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>` trailer.
- Confirmed `0011_foreground_rest_feedback.ts` is unchanged and forward migration `0012_foreground_rest_feedback_attempts.ts` is present in the migration manifest.
- Confirmed the final aggregate gate passed: typecheck, lint, 62 unit tests, 22 component tests, 42 host-SQLite tests, and 6 integration tests; the independent rereview after the preference-rollback repair was CLEAN. The only reported Expo output is the expected remote-push deprecation warning.
- Confirmed requirements-completed is exactly `[LIB-07, LIB-08]`, no packages were added, and no build/device/attended evidence is claimed.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-22*
