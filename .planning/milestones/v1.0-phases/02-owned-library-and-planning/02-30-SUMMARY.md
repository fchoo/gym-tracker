---
phase: 02-owned-library-and-planning
plan: 30
subsystem: android-notifications
tags: [expo-notifications, expo-sqlite, android-channels, rest-alerts, preferences, jest]
requires:
  - phase: 01-trustworthy-workout-loop
    provides: SQLite-authoritative rest lifecycle and stable rest:<sessionId> request identity
provides:
  - Strict versioned rest-alert preferences with independent default-on sound and vibration values
  - Immutable v2 Android channels for every sound/vibration combination
  - Preference-aware non-authoritative rest-alert reconciliation with channel mismatch replacement
affects: [plan-02-31, plan-02-34, plan-02-35, android-rest-alerts, native-evidence]
actuals:
  tokens: 8570
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns:
    - Store user alert preferences as one strict versioned record and fall back safely to immutable defaults.
    - Encode immutable Android sound/vibration settings in new channel IDs rather than attempting to mutate prior channels.
    - Treat a notification's selected channel as part of the derived scheduling projection match while SQLite rest facts remain authoritative.
key-files:
  created:
    - src/platform/preferences/restAlertPreferenceStore.ts
    - src/platform/preferences/restAlertPreferenceStore.test.ts
  modified:
    - app.config.ts
    - src/domains/rest/restNotificationPort.ts
    - src/platform/notifications/expoRestNotificationAdapter.ts
    - src/platform/notifications/restNotificationReconciler.ts
    - src/platform/notifications/expoRestNotificationAdapter.test.ts
    - src/platform/notifications/restNotificationReconciler.test.ts
    - src/bootstrap/workoutLifecycle.test.ts
    - src/bootstrap/phase1NotificationTestControls.ts
key-decisions:
  - Android rest alerts use four immutable v2 channels, one per sound/vibration combination, with DEFAULT importance instead of the legacy low-importance channel.
  - The versioned preference record defaults sound and vibration independently to true and never stores permission or workout/rest facts.
  - A scheduled request matches only when its stable identity, SQLite-derived revision/end time, and selected v2 channel all agree; a preference change cancels and replaces only the derived notification projection.
  - Production preference storage loads Expo SQLite KV lazily so non-native host verification retains a safe default-on fallback without changing native persistence behavior.
patterns-established:
  - Platform alert failures return bounded reconciliation outcomes after (or separately from) authoritative SQLite work and cannot roll source facts back.
  - Versioned notification migrations must update development-only controls as well as production configuration so no code path selects an obsolete channel.
requirements-completed: [LIB-07, LIB-08]
coverage:
  - id: D1
    description: Rest sound and vibration preferences persist independently with strict v1 parsing, immutable values, and safe default-on fallbacks.
    requirement: LIB-07
    verification:
      - kind: unit
        ref: src/platform/preferences/restAlertPreferenceStore.test.ts#SQLite rest-alert preference store
        status: pass
    human_judgment: false
  - id: D2
    description: Android rest alerts select a new immutable v2 channel and matching sound/vibration content for all four preference combinations.
    requirement: LIB-08
    verification:
      - kind: unit
        ref: src/platform/notifications/expoRestNotificationAdapter.test.ts#Expo rest notification adapter
        status: pass
      - kind: unit
        ref: src/bootstrap/appConfig.test.ts#Android lifecycle configuration
        status: pass
    human_judgment: false
  - id: D3
    description: Rest-alert reconciliation reads preferences once, repairs stale channel projections, and leaves authoritative rest/session rows unchanged across platform failures.
    requirement: LIB-07
    verification:
      - kind: unit
        ref: src/platform/notifications/restNotificationReconciler.test.ts#Plan 01-09 rest notification reconciliation
        status: pass
      - kind: integration
        ref: tests/integration/rest-lifecycle.test.ts#Plan 01-09 durable notification replay
        status: pass
    human_judgment: false
duration: 12min
completed: 2026-08-22
status: complete
---

# Phase 02 Plan 30: Configurable Android Rest Alerts Summary

**Versioned default-on rest-alert preferences now drive four immutable v2 Android channels and safely reconcile derived rest notifications without changing SQLite workout truth.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-22T08:52:31Z
- **Completed:** 2026-08-22T09:05:28Z
- **Tasks:** 3/3
- **Files modified:** 13

## Accomplishments

- Added a strict v1 SQLite-KV rest-alert preference store with independently persisted default-on sound and vibration controls, immutable reads, malformed-value fallback, and fail-soft storage behavior.
- Replaced every selectable legacy rest channel with four immutable workout-rest-v2 channels using Android DEFAULT importance, selected deterministic content behavior, and the stable rest:<sessionId> request identity.
- Made reconciliation read preferences once, include the selected channel in exact-match detection, and cancel/recreate only stale derived requests while permission, storage, channel, list, cancel, and schedule failures remain non-authoritative.
- Preserved host SQLite lifecycle verification through a lazy Expo KV boundary that safely falls back to default preferences when the native module is unavailable to the Node runner.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add strict persisted rest-alert preferences** - 1f62f27 (test, TDD RED) and a18c86d (feat, TDD GREEN)
2. **Task 2: Introduce immutable versioned Android rest-alert channels** - c9fd015 (feat)
3. **Task 3: Reconcile preferences without making notifications authoritative** - b4adf7b (feat) and a84f45d (fix, verification repair)

## Files Created/Modified

- src/platform/preferences/restAlertPreferenceStore.ts - Defines versioned preference parsing, persistence, and safe native/host fallback behavior.
- src/platform/preferences/restAlertPreferenceStore.test.ts - Covers defaults, independent writes, malformed records, storage failures, and unavailable native storage.
- src/domains/rest/restNotificationPort.ts and src/domains/rest/index.ts - Expose v2 channel mapping and preference-aware scheduling metadata.
- app.config.ts and src/bootstrap/appConfig.test.ts - Use the v2 default sound-and-vibration channel.
- src/platform/notifications/expoRestNotificationAdapter.ts and its test - Create/select all four immutable channels and mirror modality choices in scheduled content.
- src/platform/notifications/restNotificationReconciler.ts and its test - Read preferences once, validate values, and replace stale channel projections without changing rest facts.
- src/bootstrap/workoutLifecycle.test.ts - Marks active scheduled fixtures with the expected v2 channel.
- src/bootstrap/phase1NotificationTestControls.ts and its test - Keep development-only stale-alert controls on the v2 default channel.

## Decisions Made

- Four v2 channel IDs represent sound-and-vibration, sound-only, vibration-only, and silent alerts because Android does not allow sound or importance behavior to be reliably mutated on an existing channel.
- The ordinary default is sound enabled and vibration enabled, using a short system tone and [0, 180] vibration pattern with DEFAULT importance.
- Notification metadata includes channelId; missing or mismatched legacy metadata is intentionally non-matching and is repaired through cancel-and-replace.
- Rest preferences remain a bounded UI/platform concern. SQLite session and rest state never derive from, or change because of, a preference/permission/platform failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Host integration could not load Expo SQLite KV at module evaluation time**
- **Found during:** Task 3 verification
- **Issue:** The integration runner is Node-only and failed before executing rest lifecycle tests because expo-sqlite/kv-store emitted an ESM import at the store module's top level.
- **Fix:** Made native SQLite KV construction lazy and cached; when the module is unavailable, the production store returns the same immutable default-on preferences and ignores writes safely.
- **Files modified:** src/platform/preferences/restAlertPreferenceStore.ts, src/platform/preferences/restAlertPreferenceStore.test.ts
- **Verification:** npm run test:integration -- --runInBand tests/integration/rest-lifecycle.test.ts
- **Committed in:** a84f45d

**2. [Rule 2 - Missing Critical] Development notification control still selected the legacy v1 channel**
- **Found during:** Task 3 verification
- **Issue:** The development-only stale-alert control would have continued selecting workout-rest-v1, violating the immutable-v2-only channel migration requirement.
- **Fix:** Routed the control and its assertion through REST_NOTIFICATION_CHANNEL_ID, the v2 sound-and-vibration default.
- **Files modified:** src/bootstrap/phase1NotificationTestControls.ts, src/bootstrap/phase1NotificationTestControls.test.ts
- **Verification:** Focused unit suite passed and a repository scan confirmed no workout-rest-v1 selection remains.
- **Committed in:** a84f45d

---

**Total deviations:** 2 auto-fixed (1 Rule 2 missing critical functionality, 1 Rule 3 blocking issue)
**Impact on plan:** Both fixes were required to uphold the v2-only alert contract and keep the directly affected lifecycle integration testable. No product scope expanded.

## Issues Encountered

- Task 1 RED initially failed because the planned preference store did not yet exist; the test then passed after the bounded versioned implementation was added.
- The Expo notifications test imports emit an expected Expo Go remote-push deprecation warning during the existing development test control suite. It does not affect the local rest-alert adapter assertions or test result.
- No package installation, external authentication, or physical-device action was required.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-31 can wire the persisted controls into Today and add exactly-once foreground feedback using this preference and channel contract.
- Plan 02-34 owns the exact-HEAD Android build; Plan 02-35 alone owns attended physical sound/vibration review. This plan created no attended records, final-verification.json, or terminal-seal artifact and makes no physical verification claim.

## Self-Check: PASSED

- Confirmed all 13 production/test files above and this summary exist on disk.
- Confirmed commits 1f62f27, a18c86d, c9fd015, b4adf7b, and a84f45d exist in Git history and each carries the required Co-authored-by: TRAE CLI <noreply@users.noreply.github.com> trailer.
- Confirmed no tracked files were deleted, no workout-rest-v1 selection remains, and no physical evidence/terminal-seal file was created.
- Confirmed .gsd/dispatch-isolation-sentinel.json remains unstaged with SHA-256 180d0b3d90e0e02f74556b3762c2e7f6a25463b8244cee5e0d4b167cbf44523c.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-22*
