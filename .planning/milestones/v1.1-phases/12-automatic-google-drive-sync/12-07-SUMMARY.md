---
phase: 12-automatic-google-drive-sync
plan: 07
subsystem: backup-scheduling
tags: [android, network, wifi-policy, cellular, expo-module]
dependency_graph:
  requires:
    - phase: 12-06
      provides: fenced writer authority and restart-safe takeover
  provides:
    - privacy-safe Android network classification
    - policy-aware scheduler admission
    - one-attempt cellular override request
  affects: [12-08-recovery, automatic-backup-settings]
tech-stack:
  added: [repository-local Expo Android module]
  patterns:
    - platform bridge returns only a bounded non-identifying enum
    - scheduler retains blocked requests without consuming retry or dirty-generation state
key-files:
  created:
    - modules/network-classifier/src/index.ts
    - modules/network-classifier/android/src/main/java/expo/modules/networkclassifier/NetworkClassifierModule.kt
  modified:
    - src/domains/backup/automaticBackupScheduler.ts
    - src/bootstrap/productionAutomaticBackupRuntime.ts
key-decisions:
  - "Validated unmetered Wi-Fi is the only wifi-only admission; cellular, metered, unknown, and unavailable remain pending."
  - "The cellular override is represented by a distinct single scheduler request and never mutates the saved policy."
requirements-completed: [DATA-10]
actuals:
  tokens: 5759
  tasks: 3
  commits: 5
coverage:
  - id: D1
    description: Android exposes only a privacy-safe four-value network class.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: modules/network-classifier/src/index.test.ts#network classifier bridge
        status: pass
      - kind: other
        ref: npm run verify:cng
        status: pass
    human_judgment: false
  - id: D2
    description: Saved any-network and wifi-only policy control scheduler admission without blocking workout callers.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: src/domains/backup/automaticBackupScheduler.test.ts#enforces saved network policy without consuming blocked work
        status: pass
    human_judgment: false
  - id: D3
    description: Cellular consent admits exactly one manual attempt and leaves wifi-only persisted.
    requirement: DATA-10
    verification:
      - kind: unit
        ref: src/domains/backup/automaticBackupScheduler.test.ts#consumes a cellular override for exactly one manual attempt
        status: pass
    human_judgment: false
metrics:
  duration: "35m"
  completed_date: 2026-09-30
  tasks_completed: 3
  files_changed: 13
status: complete
---

# Phase 12 Plan 07: Network Policy Scheduling Summary

A privacy-safe Android connectivity classifier now drives saved Wi-Fi policy and a one-attempt cellular override inside the existing fire-and-forget backup scheduler.

## Delivered

- Added a local Expo Android module with `ACCESS_NETWORK_STATE` only and no external package dependency.
- Classified current validated connectivity as `wifi`, `cellular_or_metered`, `unavailable`, or `unknown` without retaining or logging identifiers.
- Read the saved data-use policy and current network class for every scheduler attempt.
- Split manual, retry, and cellular-confirmed request intents while preserving single-flight/coalescing and the generation-based 24-hour warning.

## Verification

- Focused classifier, scheduler, production composition, and presentation suites passed.
- Focused classifier/scheduler coverage: 9/9 tests and 100% statements, branches, functions, and lines.
- `npm run typecheck` and `npm run lint`: passed.
- `npm run verify:cng`: two clean development-test Android generations matched; package/toolchain and local-module autolinking passed.

## Task Commits

1. **Task 1: Add Android network classifier** - `5709d20` (RED), `a38f0b2` (GREEN), `d4eb70f` (bridge coverage)
2. **Task 2: Enforce persisted policy** - `c58f36f` (RED), `bfb8d25` (GREEN)
3. **Task 3: Separate manual/retry/cellular intents** - implemented and verified in `bfb8d25`; existing generation-based presentation tests continue to cover the 24-hour warning.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking test configuration] Included local module TypeScript tests in the unit project**
- **Found during:** Task 1.
- **Issue:** Jest roots/testMatch excluded repository-local Expo module tests.
- **Fix:** Added `modules` to roots and the module test glob to the unit project.
- **Files modified:** `jest.config.js`.
- **Committed in:** `5709d20`.

**Total deviations:** 1 auto-fixed (Rule 3).

## Known Stubs

None.

## Self-Check: PASSED

- Confirmed all five Plan 12-07 commits and created module files exist.
- Confirmed focused integrity coverage is exactly 100%.
- Confirmed two clean CNG generations match and leave no generated Android tree behind.

---
*Phase: 12-automatic-google-drive-sync*
*Completed: 2026-09-30*
