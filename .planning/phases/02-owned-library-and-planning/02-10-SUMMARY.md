---
phase: 02-owned-library-and-planning
plan: 10
subsystem: workout
tags: [sqlite, metric-profiles, exactly-once, react-native, immutable-snapshots, tdd]

requires:
  - phase: 02-owned-library-and-planning
    provides: Complete nine-profile metric registry and persisted complete metric identity from Plan 02-07
  - phase: 02-owned-library-and-planning
    provides: Final runtime migration manifest and owned plan target graph from Plan 02-11
  - phase: 01-trustworthy-workout-loop
    provides: FIFO writer, expected revisions, immutable session snapshots, inline SetRow, adjacent Complete/Skip, direct Retry, and commit-before-effects
provides:
  - Authoritative complete metric identity across session creation, active reads, draft/complete/skip commands, exact replay, detail, and outcome readback
  - Registry-parsed target and observation adapters for all nine approved profiles plus both timed-hold contract versions
  - Shared descriptor-driven SetRow fields with fixed planned labels, fixed unit suffixes, adjacent Complete/Skip, and direct Retry value retention
  - Plain-language MetricProfileOption with approved examples, comparator explanations, radio semantics, and 48dp targets
  - Real SQLite and component matrices proving snapshot immutability, tamper rejection, warm-up exclusion, and commit-before-acknowledgement
affects: [active-workout, session-detail, workout-outcome, plan-editor, metric-profile-selection, phase3-history]

actuals:
  tokens: 36917
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - Workout command identity is exactly profile plus contract version plus exercise metric generation
    - Session creation snapshots the same target bytes and complete identity parsed by active/detail/outcome reads
    - New-schema rows use strict metric registry parsing while retained Phase 1 schema/JSON bytes have explicit legacy adapters
    - Shared SetRow descriptors define inline fields, labels, suffixes, and immutable planned dimensions without profile-specific screens

key-files:
  created:
    - src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx
    - src/ui/components/MetricProfileOption.tsx
    - tests/integration/cross-profile-workout.test.ts
  modified:
    - src/domains/workout/activeWorkout.ts
    - src/domains/workout/index.ts
    - src/domains/workout/sessionDetail.ts
    - src/domains/workout/setCommands.ts
    - src/platform/sqlite/repositories/plansWorkoutRepository.ts
    - src/platform/sqlite/repositories/workoutRepository.ts
    - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
    - src/ui/components/SetRow.tsx
    - src/ui/screens/ActiveWorkoutScreen.tsx

key-decisions:
  - "Draft, Complete, and Skip carry immutable MetricIdentity; repository writes compare profile, contractVersion, and exerciseMetricGeneration against persisted snapshot rows."
  - "Exact already-completed replay requires the same completion idempotency key, observation JSON bytes, and complete metric identity; changed replay identity fails closed."
  - "Fixed distance, fixed time, and interval protocol dimensions come only from immutable target snapshots and render as labelled non-editable values; owner inputs contain only actual measurements."
  - "Retained Phase 1 databases continue to read legacy load/reps and timed-hold bytes through explicit schema detection while v9 rows use strict registry parsing."
  - "Warm-ups remain load/reps-only, explicitly excluded from records/progression, and absent from all-profile completion counts."

patterns-established:
  - "Identity boundary: plan occurrence/target -> session exercise/set -> command -> detail/outcome all preserve one exact MetricIdentity."
  - "Exactly-once boundary: expected revisions and conditional source writes commit before invalidation, haptics, effects, success state, or Retry acknowledgement."
  - "UI boundary: one shared SetRow owns every profile's fields and actions; profile-specific routes, modals, ValueEditorSheet, and WorkoutActionDock remain absent."
  - "Compatibility boundary: complete-identity schemas are strict; retained released schema/JSON forms are normalized only behind explicit legacy detection."

requirements-completed: [LIB-11, LIB-12]

coverage:
  - id: D1
    description: "All nine approved profiles and both timed-hold contracts round-trip through authoritative session creation, active read, draft, complete, skip, detail, and outcome adapters with immutable target and identity bytes."
    requirement: LIB-11
    verification:
      - kind: integration
        ref: "tests/integration/cross-profile-workout.test.ts#authoritative cross-profile workout adapters"
        status: pass
      - kind: other
        ref: "npm run test:integration -- --runInBand tests/integration/cross-profile-workout.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every profile uses shared inline fields, fixed planned labels and unit suffixes, adjacent Complete/Skip, and direct Retry that preserves entered values without retired or profile-specific surfaces."
    requirement: LIB-12
    verification:
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx#active workout metric profiles"
        status: pass
      - kind: automated_ui
        ref: "src/ui/__tests__/ActiveWorkoutScreen.test.tsx#Plan 01-08 ActiveWorkoutScreen"
        status: pass
    human_judgment: false
  - id: D3
    description: "Complete and Skip reject changed snapshot generation, exact replay is idempotent, warm-ups stay excluded, and all post-commit callbacks observe committed source state."
    requirement: LIB-11
    verification:
      - kind: integration
        ref: "tests/integration/cross-profile-workout.test.ts#rejects a matching profile with a different snapshot generation"
        status: pass
      - kind: integration
        ref: "tests/integration/complete-set.test.ts#Plan 01-08 exactly-once completeSet and Undo"
        status: pass
      - kind: other
        ref: "npm run test:coverage -- --runInBand"
        status: pass
    human_judgment: false

duration: 43 min
completed: 2026-08-18
status: complete
---

# Phase 02 Plan 10: Authoritative All-Profile Workout Summary

**Nine-profile immutable workout snapshots with registry-validated commands, exactly-once complete/skip/retry, lossless detail/outcome readback, and one shared inline SetRow**

## Performance

- **Duration:** 43 min
- **Started:** 2026-08-18T08:16:26Z
- **Completed:** 2026-08-18T08:59:03Z
- **Tasks:** 3
- **Tracked files changed:** 19
- **Implementation/test commits:** 7
- **Merged gate:** 1,214 tests passed across 61 suites
- **Global coverage:** 95.66% statements, 94.20% branches, 94.90% functions, 95.90% lines
- **Integrity-critical gate:** 47 files at 100% statements, branches, functions, and lines

## Accomplishments

- Replaced two-profile active workout contracts with the authoritative registry-backed target/observation union and complete persisted metric identity.
- Snapshotted profile, contract version, generation, exact target JSON, units, and active policy identity into every v9 session exercise/set while preserving released Phase 1 schema behavior.
- Bound draft, Complete, Skip, and exact replay to persisted complete identity plus expected revisions; changed generation or replay bytes fail closed before mutation.
- Preserved JSON-only measurements for cardio/protocol/unscored profiles and legacy scalar repetition columns for load/bodyweight/added/assisted profiles without cross-profile reinterpretation.
- Added metric-aware lossless session detail/outcome target and observation values plus neutral top-working-set selection through the existing registry comparator.
- Extended the one shared `SetRow` across all nine profiles with fixed suffixes, immutable planned distance/time/protocol labels, adjacent Complete/Skip, direct Retry, retained values, 48dp controls, and focus styles.
- Added `MetricProfileOption` with the exact nine approved names, examples, comparison explanations, and accessible radio behavior.
- Proved all-profile Complete/Skip/Retry, immutable snapshots, warm-up exclusion, commit-before-callbacks, legacy compatibility, and tamper rejection in real SQLite and component matrices.

## Task Commits

1. **Task 1 RED: Persisted added-load tracer** — `e2d6974`
2. **Task 1 GREEN: Registry-backed active read and shared SetRow tracer** — `b119c37`
3. **Task 2 RED: All-profile command and SQLite adapter contracts** — `3f425ff`
4. **Task 2 GREEN: Session creation, commands, exact replay, detail, and outcome adapters** — `46d2a9f`
5. **Task 3 RED: All-profile shared UI and Retry matrix** — `a185b78`
6. **Task 3 GREEN: Descriptor-driven SetRow and MetricProfileOption** — `892031d`
7. **Coverage deviation fix: Completed metric semantic boundaries** — `822c81d`

## Files Created/Modified

- `src/domains/workout/activeWorkout.ts` — authoritative all-profile targets/observations, complete identity on exercises/sets, and identity-bound command inputs.
- `src/domains/workout/index.ts` — public metric-profile-complete workout exports and Today types.
- `src/domains/workout/setCommands.ts` — registry-backed draft/completion validation with preserved Phase 1 zero-draft behavior.
- `src/domains/workout/sessionDetail.ts` — lossless metric identity, target, and observation detail contracts.
- `src/platform/sqlite/repositories/plansWorkoutRepository.ts` — schema-aware v9 session snapshot creation with complete target/policy identity.
- `src/platform/sqlite/repositories/workoutRepository.ts` — strict all-profile active parsing, exact identity guards, exact replay, and legacy adapters.
- `src/platform/sqlite/repositories/workoutOutcomeRepository.ts` — metric-aware detail/outcome parsing and top-set selection.
- `src/ui/components/MetricProfileOption.tsx` — approved plain-language selector with examples, comparator copy, and radio semantics.
- `src/ui/components/SetRow.tsx` — shared descriptor-driven fields, fixed labels/suffixes, adjacent actions, and retained values.
- `src/ui/screens/ActiveWorkoutScreen.tsx` — immutable identity passed through existing draft/complete/skip/Retry commands.
- `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx` — 20 persisted-read, all-profile UI, Retry, and selector cases.
- `tests/integration/cross-profile-workout.test.ts` — real SQLite all-profile snapshot, draft, complete, replay, skip, detail, outcome, warm-up, and tamper proof.

## Decisions Made

- Complete metric identity is required on every active set command. Profile equality alone is insufficient because historical generations and timed-hold versions must never be reinterpreted.
- Session targets and observations remain the exact registry contract objects. Legacy scalar columns are compatibility projections, not alternate sources of truth.
- A completed-set retry returns `already_completed` only when idempotency key, observation JSON, and identity match the committed row exactly.
- Fixed distance stores the planned distance in the target and accepts only actual duration; fixed time stores planned duration and accepts only actual distance; intervals keep immutable protocol fields and accept only completed rounds/work.
- Unscored completion uses the same Complete/Skip actions without a synthetic value editor or performance ranking.
- The existing direct Retry notice remains below the working-set list and reuses the original command bytes; no optimistic success, rest, haptic, or advancement occurs before commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved retained Phase 1 schema and JSON compatibility**
- **Found during:** Task 2 Phase 1 exactly-once/outcome regression verification.
- **Issue:** The first complete-identity session query selected occurrence identity columns on v1 schema, and strict v9 parsers rejected released recommendation/outcome JSON forms that intentionally lacked complete identity or carried legacy extra fields.
- **Fix:** Added explicit schema detection, kept v1 reads on released exercise profile columns, normalized only legacy load/reps and timed-hold recommendation/outcome bytes, and retained strict registry parsing for complete-identity rows.
- **Files modified:** `src/platform/sqlite/repositories/plansWorkoutRepository.ts`, `src/platform/sqlite/repositories/workoutRepository.ts`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`
- **Verification:** `tests/integration/complete-set.test.ts` and `tests/integration/workout-outcomes.test.ts` pass alongside the all-profile v9 matrix.
- **Committed in:** `46d2a9f`

**2. [Rule 2 - Missing Critical Functionality] Restored complete integrity coverage for completed metric semantics**
- **Found during:** Plan-level merged coverage gate.
- **Issue:** New valid-schema but incomplete completion branches for unscored `false`, fixed-time zero distance, and interval zero work were behaviorally rejected but not individually tested, leaving integrity-critical `setCommands.ts` below the mandatory 100% gate.
- **Fix:** Added direct pre-repository tests for all three incomplete completion semantics.
- **Files modified:** `src/domains/workout/setCommands.test.ts`
- **Verification:** `npm run test:coverage -- --runInBand` passes 1,214 tests with all 47 integrity-critical files at 100% statements, branches, functions, and lines.
- **Committed in:** `822c81d`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 compatibility bug, 1 Rule 2 integrity-test requirement)
**Impact on plan:** Both fixes preserve released exactly-once behavior and enforce project coverage rules. No package, schema migration, endpoint, auth path, profile-specific route/modal, or unrelated feature was added.

## Issues Encountered

- The first merged coverage run passed all 1,211 behavior tests and global thresholds but correctly failed the integrity-critical gate for new `setCommands.ts` semantic branches; focused tests raised the final gate to 1,214 passing tests and 100% all metrics.
- The shell emitted a recurring non-fatal `compdef: _comps: assignment to invalid subscript range` warning after successful commands; it did not affect tests, commits, or artifacts.
- The pre-existing untracked `.gsd/dispatch-isolation-sentinel.json` remained unstaged and byte-identical.

## Known Stubs

None. Changed files contain no TODO/FIXME, skipped tests, placeholder product data, unconnected empty UI values, or unrun verification.

## Threat Review

- T-02-04: FIFO writes, expected session/set revisions, conditional source updates, and exact replay identity remain the duplicate/tamper defense; UI busy state is not trusted for correctness.
- T-02-05: Every generalized adapter compares complete `(profile, contractVersion, exerciseMetricGeneration)` identity and parses v9 targets/observations through the selected registry contract.
- T-02-07: Validation exposes stable field-safe codes and never logs or returns observation payloads, raw SQL, or owner-entered values in diagnostics.
- No new network endpoint, authentication path, file-access pattern, migration, or external trust boundary was introduced.

## Verification

- `npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx` — PASS, 20 tests.
- `npm run test:integration -- --runInBand tests/integration/cross-profile-workout.test.ts` — PASS, 3 tests.
- `npm run test:unit -- --runInBand src/domains/workout/setCommands.test.ts` — PASS, 28 tests.
- `npm run test:components -- --runInBand src/ui/__tests__/ActiveWorkoutScreen.test.tsx src/ui/__tests__/WorkoutCompletionScreen.test.tsx` — PASS, 34 tests.
- `npm run test:integration -- --runInBand tests/integration/complete-set.test.ts tests/integration/workout-outcomes.test.ts` — PASS, 17 tests.
- `npm run test:coverage -- --runInBand` — PASS, 1,214 tests across 61 suites; 47 integrity-critical files at 100% all metrics.
- `npm run typecheck` — PASS.
- Changed-file boundary, stub, skipped-test, retired-surface, forbidden-copy, profile-route/modal, threat-surface, commit-trailer, deletion, and sentinel scans — PASS.

## User Setup Required

None - no package installation, credentials, external service, or manual device action is required.

## Next Phase Readiness

- Library/plan UI can use `MetricProfileOption` for explicit selection while active workouts continue deriving fields only from immutable versioned contracts.
- Phase 3 history can consume lossless `SessionDetail` identity, target, and observation values without reverse-engineering profile-specific strings.
- All approved starter-plan metric profiles now run through the Phase 1 exactly-once workout interaction without retired editors or docks.
- `.planning/WINDOWS.md` records both execution deviations as fixed; open defect count remains zero.

## Self-Check: PASSED

- All 12 authoritative plan artifacts and this summary exist.
- Commits `e2d6974`, `b119c37`, `3f425ff`, `46d2a9f`, `a185b78`, `892031d`, and `822c81d` exist and carry the required TRAE CLI trailer exactly once.
- Coverage metadata classifies all three LIB-11/LIB-12 deliverables as auto-covered by passing evidence.
- No tracked files were deleted; no stub, skipped test, retired surface, profile route/modal, threat flag, or open broken-window entry remains.
- `.gsd/dispatch-isolation-sentinel.json` remains unstaged and byte-identical.

---
*Phase: 02-owned-library-and-planning*
*Completed: 2026-08-18*
