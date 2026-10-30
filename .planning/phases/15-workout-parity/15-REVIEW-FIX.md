---
phase: 15-workout-parity
fixed_at: 2026-10-10T17:16:48Z
review_path: .planning/phases/15-workout-parity/15-REVIEW.md
iteration: 8
findings_in_scope: 16
fixed: 16
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-10-10T17:16:48Z  
**Source review:** `.planning/phases/15-workout-parity/15-REVIEW.md`  
**Iteration:** 8

**Summary:**

- Cumulative code findings: 16 (3 iteration-one fixes, 3 iteration-two fixes, 2 iteration-three warning fixes, 3 iteration-four warning fixes, 1 post-review SQLite-host schema-36 closure, 2 iteration-six critical fixes, 1 iteration-seven critical fix, 1 iteration-eight critical fix)
- Fixed: 16
- Skipped: 0

## Iteration 1 Resolutions

| Finding | Resolution | Commit |
|---|---|---|
| CR-01 | Removed retired advanced-timing runtime surface. | `1d9f5246` |
| CR-02 | Wired Active Workout preference and flat-timing flows. | `bac0b97a` |
| CR-03 | Added retained-artifact hash and report binding. | `3a4486b9` |

## Iteration 2 Resolutions

### CR-01: Retained-artifact verifier accepts symlink traversal outside its evidence root

**Files modified:** `scripts/verify-phase15-evidence.mjs`, `scripts/phase15-evidence-scripts.test.mjs`  
**Commit:** `4f11ca58`

**Applied fix:** Resolves the real evidence root, rejects every symbolic-link path segment, and requires the artifact's real path to remain below that root. Added report and case-receipt escape mutations whose external bytes have valid replacement hashes.

### CR-02: Per-setting save actions persist unrelated unsaved plan preference edits

**Files modified:** `app/workout/[sessionId].tsx`, `app/__tests__/workout-route.test.tsx`, `src/ui/components/WorkoutPlanSettingsSheet.tsx`, `src/ui/__tests__/WorkoutPlanSettingsSheet.test.tsx`  
**Commit:** `b1d4b502` (test mock type follow-up: `cb5b3fec`)

**Applied fix:** Each button now submits only its confirmed field. The route reads the latest authoritative preference before writing, merges only that field, retries once from a reload after conflict, reads back the saved source, and leaves unrelated sheet drafts local.

### WR-01: Roving tab focus disappears when the selected occurrence falls after the fifth preview

**Files modified:** `src/ui/components/WorkoutDaySelector.tsx`, `src/ui/__tests__/WorkoutDaySelector.test.tsx`  
**Commit:** `bc79284f`

**Applied fix:** The five-item window is centered/clamped around selection, including six-plus item inputs; exactly one item remains selected and focusable. Selected previews also use the blue selection surface and focus border.

## Iteration 3 Resolutions

### WR-01: Phase 2 attended-preview mutation coverage no longer follows the current workout controls

**Files modified:** `app/__tests__/phase2-attended-preview.test.tsx`  
**Commit:** `219d5f30`

**Applied fix:** Migrated add-mutation coverage to the scoped `Add set` sheet and its `Add warm-up set` / `Add working set` actions while retaining cardinality, pending/busy, and duplicate-submit assertions. Updated adjacent completed-set and disclosure expectations to the current editor controls, and removed the retired warm-up-removal preview assertion because no current accessible route invokes that handler.

### WR-02: Metric-profile tests assert controls that the new disclosure/editor UI no longer renders

**Files modified:** `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx`  
**Commit:** `47a321fe`

**Applied fix:** Uses `Return to Workout` to test cancellation and expands the completed exercise disclosure before opening its set editor. The revision-fenced correction command and absence of advanced-timing controls remain asserted.

## Iteration 4 Resolutions

### WR-01: Retired timing UI leaves an executable Phase 10 evidence contract broken

**Files modified:** `scripts/phase10-evidence-scripts.test.mjs`, `scripts/run-phase10-maestro.mjs`  
**Commit:** `9f5f10cd`

**Applied fix:** Retired the deleted advanced-timing Maestro flow from the executable Phase 10 contract while retaining its artifact/manifest validation and historical evidence IDs. The evidence now asserts TIM-01 retirement: no active advanced-timing runtime API, no timing-cue dispatch, and no deprecated timing UI exports or screen content.

### WR-02: Unit tooling guard rejects the Phase 15 production action dock

**Files modified:** `src/domains/shared/tooling.test.ts`  
**Commit:** `e500879a`

**Applied fix:** Removed `WorkoutActionDock.tsx` from the obsolete-module guard and renamed the assertion to cover only the retired `ValueEditorSheet.tsx`. Existing action-dock component tests remain the behavioral coverage for the active dock.

### WR-03: Logical-merge local-won test relies on a hash tie-break instead of creating a local-won fixture

**Files modified:** `tests/sqlite-host/logicalMergeRepository.test.ts`  
**Commit:** `d1b45635`

**Applied fix:** Made the local fixture definitively newer (`modifiedAtMs: 21` versus archive `20`), so the test covers the freshness-based `local_won` branch instead of an equal-freshness digest tie-break.

## Iteration 5 Resolution

### Post-review: SQLite-host schema-36 migration contract regressions

**Files modified:** `tests/sqlite-host/migrations-effects.test.ts`, `tests/sqlite-host/phase12BackupBenchmark.host.test.ts`, `tests/sqlite-host/cleanInstallRestore.test.ts`, `src/bootstrap/phase12BackupBenchmark.ts`  
**Commit:** `8bca51cd`

**Applied fix:** Advanced only latest-schema upgrade, clean-install backup, and maximum benchmark contracts from schema 35 to 36. The migration suite now proves the v36 rest-default receipt table and `session_exercises.default_rest_seconds_is_override` column; the benchmark proves the fully migrated current schema and keeps its exact serialized-size sentinel. Iteration 6 updates that sentinel to `23,242,083` bytes when the logical receipt table becomes portable. Frozen historical migration-prefix fixtures remain at their explicit schema cutoffs.

## Iteration 6 Resolutions

### CR-01: Fixed-distance and fixed-time editors initialize the wrong draft field

**Files modified:** `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx`  
**Commit:** `ea8028cb`

**Applied fix:** Verified the corrected `draftFor()` mapping now initializes the rendered/persisted field for both profiles. Added profile regressions that open and save the existing fixed-distance duration and fixed-time distance unchanged, then persist a normal edit for each.

### CR-02: Schema-36 receipt records are omitted from backup and logical merge

**Files modified:** `src/domains/portability/backupContracts.ts`, `src/domains/portability/mergePlan.ts`, `src/domains/portability/restoreCommands.ts`, `src/platform/sqlite/repositories/logicalBackupRepository.ts`, `src/platform/sqlite/repositories/logicalRestoreRepository.ts`, `src/platform/sqlite/repositories/logicalMergeRepository.ts`, and portability/SQLite-host regression tests  
**Commit:** `ffdcb4ed`

**Applied fix:** Registered the immutable rest-default receipt in the schema-36 logical backup contract, portable merge classification, restore foreign-key graph and ordering, restore trigger suspension, and session merge aggregate/readback/delete trigger flow. Updated the maximum SQLite backup fixture’s exact serialized-size sentinel to `23,242,083` bytes for the new portable table. Host coverage now invokes the production default-rest command to create the receipt, then verifies backup/restore preservation plus full-plan archive-wins replacement without foreign-key failure, retaining the immutable request hash and canonical result payload.

## Iteration 7 Resolution

### CR-01: Fixed-time editor rejects a valid zero-distance observation

**Files modified:** `src/ui/components/WorkoutSetEditorSheet.tsx`, `src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx`  
**Commit:** `cf3156e2`

**Applied fix:** Aligned fixed-time editor input and serialization with `FixedTimeObservationV1Schema`: distance is now a nonnegative safe integer, including zero. The editor still rejects negative, fractional, and malformed input. Regression coverage saves an existing zero-distance observation unchanged, then persists a positive edit. The only other fixed-time `distanceMeters < 1` predicate is the separately tested completed-set command guard, which intentionally rejects zero only when marking a set completed.

## Iteration 8 Resolution

### CR-01: Portable merge does not remap schema-36 rest-default receipt identity or result references

**Files modified:** `src/domains/portability/mergePlan.ts`, `src/domains/portability/mergePlan.test.ts`, `tests/sqlite-host/logicalMergeRepository.test.ts`  
**Commit:** `27e0d7b4`

**Applied fix:** Registered `workout_session_exercise_rest_default_receipts` as a collision-safe immutable child keyed by `request_id`, using the existing occupied-ID allocator. Added a fail-closed result rewrite that accepts only the canonical v1 rest-default result shape and remaps `sessionId` and `sessionExerciseId` while preserving `request_sha256` and all immutable source facts. Domain and real SQLite-host coverage now exercise independent portable sessions sharing physical session/exercise IDs plus a colliding deterministic rest-default receipt ID; the merge remaps the receipt primary key and foreign keys, retains the request hash, and writes `result_json` with the same mapped identities. The existing archive-wins expectation now correctly names the mapped session ID in `result_json`.

## Verification

Verification ran in the **main checkout** because `workflow.use_worktrees=false`.

- `node --check scripts/run-phase10-maestro.mjs` and `node --check scripts/phase10-evidence-scripts.test.mjs` — passed.
- `node --test scripts/phase10-evidence-scripts.test.mjs` — passed, 6 tests.
- `npm run test:unit -- --runInBand --silent src/domains/shared/tooling.test.ts` — passed, 25 tests.
- `npm run test:sqlite:host -- --runInBand --silent tests/sqlite-host/logicalMergeRepository.test.ts` — passed, 105 tests.
- `npm run test:unit -- --runInBand --silent` — passed, 117 suites / 1,968 tests.
- `npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/phase12BackupBenchmark.host.test.ts tests/sqlite-host/cleanInstallRestore.test.ts` — passed, 3 suites / 203 tests.
- `npm run test:sqlite:host -- --runInBand --silent` — passed (full SQLite-host project; the runner reported its long-running logical-merge suite, 46.27 s).
- `npm run typecheck` — passed.
- `npm run lint` and `npm run check:boundaries` — passed (341 files).
- `git diff --check HEAD` — passed.
- Iteration 6: `npm run test:components -- --runInBand --silent src/ui/__tests__/WorkoutSetEditorSheet.test.tsx src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx` — passed, 28 tests.
- Iteration 6: `npm run test:unit -- --runInBand --silent src/domains/portability/backupContracts.test.ts src/domains/portability/restoreCommands.test.ts` — passed, 126 tests.
- Iteration 6: `npm run test:sqlite:host -- --runInBand --silent tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts tests/sqlite-host/logicalMergeRepository.test.ts` — passed; includes real schema-36 backup, restore, and archive-wins replacement coverage.
- Iteration 6: `npm run test:sqlite:host -- --runInBand --silent` — passed (full SQLite-host project; logical merge completed in 43.88 s).
- Iteration 6: `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `git diff --check HEAD` — passed.
- Iteration 7: `npm run test:components -- --runInBand --silent src/ui/__tests__/ActiveWorkoutMetricProfiles.test.tsx src/ui/__tests__/WorkoutSetEditorSheet.test.tsx` — passed, 2 suites / 32 tests.
- Iteration 7: `npm run test:unit -- --runInBand --silent src/domains/metrics/metricContracts.test.ts src/domains/workout/setCommands.test.ts` — passed, 2 suites / 145 tests.
- Iteration 7: `npm run typecheck` — passed.
- Iteration 7: `npm run lint` and `npm run check:boundaries` — passed (341 files).
- Iteration 7: `git diff --check 14f656b8^..HEAD -- . ':!.planning/'` — passed.
- Iteration 8: `npm run test:unit -- --runInBand --silent src/domains/portability/mergePlan.test.ts` — passed, 78 tests.
- Iteration 8: `npm run test:sqlite:host -- --runInBand --silent tests/sqlite-host/logicalMergeRepository.test.ts` — passed, 106 tests.
- Iteration 8: `npm run test:sqlite:host -- --runInBand --silent tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts` — passed, 2 suites / 36 tests.
- Iteration 8: `npm run test:sqlite:host -- --runInBand --silent` — passed (full SQLite-host project; logical merge completed in 44.88 s).
- Iteration 8: `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `git diff --check` — passed (341 files).

No global all-project/native checkpoint, APK build, native matrix, push, PR, or deploy was run. The pre-existing Phase 14 evidence changes and untracked `14-VERIFICATION.md` were preserved and were not staged in any commit. This report is intentionally uncommitted for the orchestrator.

---

_Fixed: 2026-10-10T17:16:48Z_  
_Fixer: TRAE CLI (gsd-code-fixer)_  
_Iteration: 8_
