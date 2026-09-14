---
phase: 01-trustworthy-workout-loop
plan: 09
subsystem: rest
tags: [rest, notifications, sqlite, lifecycle, process-death, maestro, accessibility, android]

requires:
  - phase: 01-08
    provides: Exactly-once set completion, persisted drafts, active pointers, timestamp rest seed, and transactional Undo
provides:
  - Versioned timestamp-derived idle, running, paused, and expired rest state
  - Revision-checked manual start, pause, resume, minus/plus 15 seconds, skip, and expiry commands
  - Atomic source-state and coalesced notification-reconciliation effect writes
  - Stable Android rest notification adapter and SQLite-authoritative reconciler
  - Launch, foreground, permission, post-commit, Undo, finish, and discard reconciliation seams
  - Accessible adjacent RestDock with threshold-only announcements and denied-permission guidance
  - Exact-HEAD installed-APK evidence for rotation and running/paused process-death recovery
affects: [01-10-completion, notifications, process-death-recovery, phase-1-verification]

actuals:
  tasks: 2
  commits: 6
  files: 28

tech-stack:
  added: []
  patterns:
    - Persist timestamps or paused remaining duration, never a decrementing countdown
    - Stable notification request ID rest:<sessionId> with versioned revision payload
    - SQLite desired state is authoritative; platform notification state is disposable
    - Relevant durable effects drain through a filtered outbox path without claiming unrelated work
    - Route lifecycle generations rehydrate source state without replacing the visible screen with a skeleton

key-files:
  created:
    - src/domains/rest/restState.ts
    - src/domains/rest/restCommands.ts
    - src/domains/rest/restNotificationPort.ts
    - src/platform/sqlite/repositories/restRepository.ts
    - src/platform/notifications/expoRestNotificationAdapter.ts
    - src/platform/notifications/restNotificationReconciler.ts
    - src/bootstrap/workoutLifecycle.ts
    - src/ui/components/RestDock.tsx
    - tests/integration/rest-lifecycle.test.ts
    - maestro/lifecycle/rest-recovery.yaml
    - scripts/record-rest-lifecycle-evidence.mjs
    - scripts/verify-rest-lifecycle-evidence.mjs
  modified:
    - src/bootstrap/workoutAppRuntime.tsx
    - app/workout/[sessionId].tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx
    - src/platform/sqlite/effects/effectRunner.ts
    - src/platform/sqlite/effects/effectStore.ts
    - app.config.ts
    - scripts/assert-generated-android.mjs

key-decisions:
  - "Every rest command carries expected session and rest revisions; source state and one reconciliation effect commit atomically before acknowledgement."
  - "Automatic rest exists only when another active working set or configured between-exercise rest exists; manual rest uses the immutable current-exercise snapshot duration."
  - "Notification identity is exactly rest:<sessionId> with payload version, sessionId, restRevision, and endsAtMs."
  - "Permission denial, malformed or stale requests, scheduler failure, and late delivery are non-authoritative outcomes that never change workout truth."
  - "Expo permission status is authoritative; canAskAgain is not used to reinterpret a denied Android permission."
  - "Rotation is supported by app configuration and generated-manifest assertions; exact-alarm permissions remain forbidden."

patterns-established:
  - "Rest truth boundary: derive running remaining time from endsAtMs and injected nowMs; persist remainingMs only while paused."
  - "Notification repair boundary: compare fresh SQLite desired state with all scheduled rest requests, then keep one matching request or cancel/replace deterministically."
  - "Lifecycle boundary: launch, foreground, permission, and committed command triggers call the same idempotent reconciler."
  - "Recovery evidence boundary: native contracts and Maestro results must match current HEAD, source-tree digest, retained APK digest, installed package bytes, and device metadata."

requirements-completed: [WORK-11, WORK-12, WORK-13, WORK-14, WORK-15]

coverage:
  - id: D1
    description: "Automatic rest is timestamp-derived and supports pause, resume, minus/plus 15 seconds, skip, and explicit expiry."
    requirement: WORK-11
    verification:
      - kind: unit
        ref: "src/domains/rest/restState.test.ts#Plan 01-09 timestamp-derived rest state"
        status: pass
      - kind: integration
        ref: "tests/integration/rest-lifecycle.test.ts#persists pause, resume, adjust, skip, and explicit expiry"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/RestDock.test.tsx#invokes pause, adjust, skip, and resume through explicit controls"
        status: pass
    human_judgment: false
  - id: D2
    description: "Manual rest starts at a valid Active Workout point using the immutable exercise rest duration."
    requirement: WORK-12
    verification:
      - kind: integration
        ref: "tests/integration/rest-lifecycle.test.ts#starts manual rest from the immutable exercise duration"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#Plan 01-09 manual rest"
        status: pass
    human_judgment: false
  - id: D3
    description: "One idempotent reconciler repairs stable Android notification state from SQLite after every supported trigger."
    requirement: WORK-13
    verification:
      - kind: unit
        ref: "src/platform/notifications/restNotificationReconciler.test.ts#Plan 01-09 rest notification reconciliation"
        status: pass
      - kind: unit
        ref: "src/bootstrap/workoutLifecycle.test.ts#Plan 01-09 workout lifecycle"
        status: pass
      - kind: integration
        ref: "tests/integration/rest-lifecycle.test.ts#Plan 01-09 durable notification replay"
        status: pass
    human_judgment: false
  - id: D4
    description: "Denied, missing, late, stale, malformed, or failed platform notifications remain non-authoritative while in-app time stays correct."
    requirement: WORK-14
    verification:
      - kind: unit
        ref: "src/platform/notifications/expoRestNotificationAdapter.test.ts#maps granted, denied, and undetermined permission states"
        status: pass
      - kind: unit
        ref: "src/platform/notifications/restNotificationReconciler.test.ts#returns non-authoritative denied and platform-failure outcomes"
        status: pass
      - kind: device
        ref: "artifacts/native/rest-lifecycle/lifecycle-result.json#notification permission denied remains non-blocking"
        status: pass
    human_judgment: false
  - id: D5
    description: "Rotation and Android process death restore entered values, active set, and running or paused rest from SQLite."
    requirement: WORK-15
    verification:
      - kind: native_contract
        ref: "artifacts/native/rest-lifecycle/result.json"
        status: pass
      - kind: device
        ref: "artifacts/native/rest-lifecycle/lifecycle-result.json"
        status: pass
      - kind: device
        ref: "artifacts/native/rest-lifecycle/maestro.xml#Rest recovery through rotation and process death"
        status: pass
    human_judgment: false

duration: 89 min
completed: 2026-08-16
status: complete
---

# Phase 1 Plan 9: Recoverable Rest and Notifications Summary

**Timestamp-derived rest, SQLite-authoritative Android notification repair, accessible controls, and exact-APK rotation/process-death recovery now complete the interruption-safe workout tracer**

## Performance

- **Duration:** 89 min
- **Started:** 2026-08-16T06:49:19Z
- **Completed:** 2026-08-16T08:18:00Z
- **Tasks:** 2
- **Files modified:** 28
- **Implementation commits:** 6
- **Final host tests:** 475 passed

## Accomplishments

- Added a complete rest state machine that persists timestamps or paused duration, derives countdown truth from an injected clock, clamps adjustments safely, and rejects stale revisions or invalid transitions.
- Added atomic manual start, pause, resume, adjust, skip, expiry, and post-set automatic rest commands with one coalesced durable reconciliation effect.
- Implemented a stable Expo Notifications adapter and desired-state reconciler that cleans malformed, duplicate, stale, and late requests without granting the scheduler authority over source facts.
- Wired launch, foreground, permission, post-commit, Undo, finish, and discard seams through the same filtered reconciliation path.
- Delivered a RestDock with adjacent next-target context, four full-size controls, Undo placement, threshold-only announcements, large-text wrapping, reduced-motion compatibility, and calm denied-permission guidance.
- Proved denied-notification behavior, rotation, exact entered values, running rest recovery, paused rest recovery, and skip after process death against the installed exact-HEAD development-test APK.

## Task Commits

1. **Task 1:** `ce1e5ae` — persisted timestamp-derived rest, revision-safe commands, repository writes, RestDock, and tests.
2. **Task 2:** `c0a8f13` — stable notification adapter/reconciler, lifecycle triggers, filtered effect drain, route rehydration, and tests.
3. **Evidence tooling:** `ccdf69d` — exact-HEAD lifecycle evidence recorder and strict verifier.
4. **Lifecycle path correction:** `c3d1427` — deterministic rest-day and semantic-scroll Maestro route.
5. **Large-text correction:** `452bcd3` — warm-up heading and actions preserve hierarchy at 200% text.
6. **Permission correction:** `3f8e938` — Expo status remains authoritative and Android denial is tested non-blockingly.

## Decisions Made

- Persisted rest never ticks in SQLite. Running rest stores `startedAtMs` and `endsAtMs`; paused rest stores `remainingMs`.
- A rest command validates both expected workout-session revision and rest revision, then writes state plus one coalesced outbox effect in the same transaction.
- The reconciler schedules at most one request named `rest:<sessionId>` and validates payload version, session, revision, and end timestamp.
- A denied or failed notification result leaves the durable effect retryable; a later grant drains that same source-backed work.
- Lifecycle refresh increments a route generation and rehydrates current source state without flashing a loading skeleton over the active workout.
- App orientation is `default` so approved rotation recovery is possible; generated Android output fails verification if portrait lock or either exact-alarm permission appears.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored approved rotation behavior**
- **Found during:** Generated-native review
- **Issue:** `orientation: portrait` contradicted the required rotation recovery contract.
- **Fix:** Changed app orientation to `default` and added source/generated assertions that reject portrait lock.
- **Verification:** app-config unit tests, generated Android assertions, passing landscape/portrait Maestro step.
- **Committed in:** `c0a8f13`

**2. [Rule 1 - Bug] Preserved warm-up hierarchy at large text**
- **Found during:** Installed-APK Maestro review
- **Issue:** Warm-up actions squeezed the heading into one-character lines at the emulator's large-text setting.
- **Fix:** Moved actions below the heading while retaining reading and focus order.
- **Verification:** ActiveWorkoutScreen large-text component proof and successful final device flow.
- **Committed in:** `452bcd3`

**3. [Rule 1 - Bug] Honored Android's denied notification status**
- **Found during:** Installed-APK denial flow
- **Issue:** Inferring state from `canAskAgain` could map an authoritative denied status back to undetermined.
- **Fix:** Made Expo SDK 57 `status` authoritative and kept the prompt dismissal optional in Maestro.
- **Verification:** adapter status matrix, denied-to-granted replay integration, visible denied guidance in the final device flow.
- **Committed in:** `3f8e938`

**4. [Rule 3 - Blocking] Made lifecycle evidence deterministic**
- **Found during:** Maestro execution
- **Issue:** Sunday resolved to a rest day, the working-set editor began below the fold, and the Android permission sheet could cover the rest controls.
- **Fix:** Followed `Rest day → Train anyway`, used semantic `scrollUntilVisible`, and optionally denied the platform sheet.
- **Verification:** final 1/1 Maestro flow passed in 3m23s.
- **Committed in:** `c3d1427`, `3f8e938`

---

**Total deviations:** 4 auto-fixed (3 correctness bugs, 1 blocking evidence path).
**Impact on plan:** All changes enforce approved lifecycle, accessibility, and evidence contracts. No progression, history, library, or new dependency scope was pulled forward.

## Issues Encountered

- Expo start rewrites `.gitignore` and `expo-env.d.ts`; those known incidental changes were restored before strict source-digest verification.
- A Metro process started before the final permission correction served a stale bundle. Restarting Metro and rebuilding the exact-HEAD APK prevented stale JavaScript from entering the evidence set.
- The shell's login completion emits a harmless `compdef` warning; all commands and gates completed normally.

## User Setup Required

None - notification denial is non-blocking and notification permission can be granted later from Android settings.

## Test Evidence

- `npm run typecheck` — PASS.
- `npm run lint` — PASS, boundary check across 66 files.
- `npm run check:boundaries` — PASS, boundary check across 66 files.
- `npm run test:all` — PASS, 475/475.
- Coverage — PASS: 93.32% statements, 88.6% branches, 91.73% functions, 93.83% lines.
- `npm run test:sqlite:device -- --manifest artifacts/native/rest-lifecycle/build.json --suite sqlite-kernel` — PASS, 10/10.
- `node scripts/verify-native-evidence.mjs artifacts/native/rest-lifecycle/result.json` — PASS.
- `maestro test --format junit --output artifacts/native/rest-lifecycle/maestro.xml maestro/lifecycle/rest-recovery.yaml` — PASS, 1/1 in 3m23s.
- `node scripts/verify-rest-lifecycle-evidence.mjs artifacts/native/rest-lifecycle/lifecycle-result.json` — PASS.

## Native Evidence

- **Source HEAD:** `3f8e93805b6c08da7a56a946430da615f8e8efd0`
- **Source-tree SHA-256:** `90d7eca82d62892a345e6fa5b29c1c813ef3e5161a1185faaa00a1376f6b81a9`
- **APK SHA-256:** `92b0e1b060044cb507c7c97cc19f3e726f700b8f8bd71e7c73514d310d77bd57`
- **APK bytes:** `251738259`
- **Package:** `com.fchoo.gymtracker.devtest`
- **Device:** `emulator-5554`, Android 16/API 36, `arm64-v8a`
- **Build manifest:** `artifacts/native/rest-lifecycle/build.json`
- **SQLite contracts:** `artifacts/native/rest-lifecycle/result.json`
- **Maestro JUnit:** `artifacts/native/rest-lifecycle/maestro.xml`
- **Lifecycle result:** `artifacts/native/rest-lifecycle/lifecycle-result.json`

## Threat Flags

None. Stale revisions, repeated lifecycle triggers, malformed/stale notification payloads, permission denial, platform failure, duplicate requests, late expiry, process death, and installed-byte drift have tested mitigations. Exact-alarm permissions remain absent.

## Next Phase Readiness

- Plan 01-10 can finish, partially finish, resume, discard, and summarize sessions while calling the existing rest cancellation/reconciliation seam after source commit.
- Committed working observations, warm-up exclusion, exact source target IDs, exercise-level effort seam, and filtered outbox work are ready for the first deterministic recommendation path.
- The final Phase 1 tracer can reuse exact-APK native contracts and lifecycle evidence without changing notification authority.
- Physical-device Argon2 timing calibration remains an explicit Plan 01-10 checkpoint and is not replaced by emulator evidence.

## Self-Check: PASSED

- Every declared rest, notification, lifecycle, repository, UI, test, native flow, and evidence artifact exists.
- All six implementation/evidence commits contain the required TRAE trailer exactly once.
- The current worktree is clean; generated `android/`, `ios/`, and native build lock directories are absent.
- Host tests, typecheck, boundaries, ten native SQLite contracts, installed APK byte match, Maestro lifecycle flow, and exact source/APK evidence verification all pass.

---
*Phase: 01-trustworthy-workout-loop*
*Completed: 2026-08-16*
