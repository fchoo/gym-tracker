---
phase: 19-progress-parity
reviewed: 2026-10-13T03:58:29Z
depth: deep
source_head: e7eea042779bf0c9b426924f672c494267cccb0f
files_reviewed: 109
files_reviewed_list:
  - app/(tabs)/progress.tsx
  - app/__native-contracts.tsx
  - app/__tests__/garmin-activity-route.test.tsx
  - app/__tests__/progress-route.test.tsx
  - app/__tests__/session-route.test.tsx
  - app/exercise-history/[exerciseId].tsx
  - app/exercise-history/__tests__/exercise-history-route.test.tsx
  - app/garmin/activity/[activityId].tsx
  - app/session/[sessionId].tsx
  - maestro/phase19/progress-parity.yaml
  - package.json
  - scripts/benchmark-phase19-progress.jest.cjs
  - scripts/benchmark-phase19-progress.mjs
  - scripts/benchmark-phase19-progress.test.mjs
  - scripts/phase19-coverage.jest.cjs
  - scripts/phase19-integrity-coverage.json
  - scripts/run-coverage-gate.mjs
  - scripts/run-native-sqlite-contracts.mjs
  - scripts/run-phase19-host-evidence.mjs
  - scripts/run-phase19-host-evidence.test.mjs
  - scripts/run-phase19-native-evidence.mjs
  - scripts/run-phase19-native-evidence.test.mjs
  - scripts/verify-phase19-evidence.mjs
  - scripts/verify-phase19-evidence.test.mjs
  - src/bootstrap/runningPlanRuntime.test.tsx
  - src/bootstrap/runningPlanRuntime.tsx
  - src/bootstrap/trainingFoundationRuntime.test.ts
  - src/bootstrap/trainingFoundationRuntime.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/bodyweight/commands.test.ts
  - src/domains/bodyweight/contracts.test.ts
  - src/domains/bodyweight/contracts.ts
  - src/domains/history/index.ts
  - src/domains/history/metricHistory.test.ts
  - src/domains/history/metricHistory.ts
  - src/domains/portability/backupContracts.test.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/mergePlan.test.ts
  - src/domains/portability/mergePlan.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/progress/contracts.ts
  - src/domains/progress/dashboardProjection.test.ts
  - src/domains/progress/dashboardProjection.ts
  - src/domains/progress/index.ts
  - src/domains/progress/periodProjection.test.ts
  - src/domains/progress/periodProjection.ts
  - src/domains/progress/relativeStrength.test.ts
  - src/domains/progress/relativeStrength.ts
  - src/domains/progress/runningPacing.test.ts
  - src/domains/progress/runningPacing.ts
  - src/domains/progression/index.ts
  - src/domains/progression/recommendationCommands.test.ts
  - src/domains/progression/recommendationCommands.ts
  - src/domains/running/commands.test.ts
  - src/domains/running/commands.ts
  - src/domains/running/contracts.test.ts
  - src/domains/running/contracts.ts
  - src/domains/workout/finishWorkout.ts
  - src/platform/sqlite/migrations/0045_recommendation_decision_receipts.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/historyRepository.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/logicalRestoreRepository.ts
  - src/platform/sqlite/repositories/progressRepository.test.ts
  - src/platform/sqlite/repositories/progressRepository.ts
  - src/platform/sqlite/repositories/runningPlanRepository.ts
  - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
  - src/testing/contracts/phase19HistoryRepositoryCoverage.test.ts
  - src/testing/contracts/phase19IntegrityCoverage.test.ts
  - src/testing/contracts/phase19RunningPlanRepositoryCoverage.test.ts
  - src/testing/contracts/phase19WorkoutOutcomeRepositoryCoverage.test.ts
  - src/testing/contracts/progressParity.contract.test.ts
  - src/testing/contracts/progressParity.contract.ts
  - src/testing/contracts/progressUpstreamPorts.contract.test.ts
  - src/testing/contracts/progressUpstreamPorts.contract.ts
  - src/ui/__tests__/BodyweightEditorSheet.test.tsx
  - src/ui/__tests__/BodyweightHistorySheet.test.tsx
  - src/ui/__tests__/ExerciseHistoryScreen.test.tsx
  - src/ui/__tests__/FactualHistoryChart.test.tsx
  - src/ui/__tests__/Phase19ProgressBenchmark.test.tsx
  - src/ui/__tests__/ProgressScreen.test.tsx
  - src/ui/__tests__/ProgressSettingsSheet.test.tsx
  - src/ui/__tests__/RecommendationSurface.test.tsx
  - src/ui/__tests__/RunningHistorySheet.test.tsx
  - src/ui/__tests__/RunningTargetSheet.test.tsx
  - src/ui/components/BodyweightEditorSheet.tsx
  - src/ui/components/BodyweightHistorySheet.tsx
  - src/ui/components/FactualHistoryChart.tsx
  - src/ui/components/ProgressSettingsSheet.tsx
  - src/ui/components/RecommendationSurface.tsx
  - src/ui/components/RunningHistorySheet.tsx
  - src/ui/components/RunningTargetSheet.tsx
  - src/ui/screens/ExerciseHistoryScreen.tsx
  - src/ui/screens/ProgressScreen.tsx
  - tests/integration/bodyweight-history.test.ts
  - tests/integration/load-reps.test.ts
  - tests/integration/multi-plan-portability.test.ts
  - tests/integration/running-foundation.test.ts
  - tests/integration/starter-activation-repository.test.ts
  - tests/integration/workout-outcomes.test.ts
  - tests/sqlite-host/cleanInstallRestore.test.ts
  - tests/sqlite-host/historyRepository.test.ts
  - tests/sqlite-host/logicalMergeRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/phase12BackupBenchmark.host.test.ts
  - tests/sqlite-host/progressRepository.test.ts
findings:
  critical: 5
  warning: 3
  info: 0
  total: 8
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-10-13T03:58:29Z
**Depth:** deep
**Files Reviewed:** 109
**Source HEAD:** `e7eea042779bf0c9b426924f672c494267cccb0f`
**Status:** issues_found

## Summary

The required zero-Critical/Warning gate is not met. Current merged `fchoo/UX-revamp` has five BLOCKER findings and three Warnings.

This re-review read the prior review/fix/security/UI/verification artifacts, the owner decisions/brief/source precedence/Phase 19 context and UI contract, both second-wave branches (`agent-phase19-fix-data` and `agent-phase19-fix-evidence`), both merge commits, the three-file data-merge conflict resolution, and the later Phase 16 merge wherever it touched shared Phase 19 runtime/repository code. Revision 18 JSON/HTML still match the UI-SPEC hashes exactly. Native/device execution remains correctly Phase 20-owned and `NOT_RUN`.

Several important fixes are real: selected-period Running reads and 501-row paging are coherent; target sources moved into the same SQLite snapshot; bounded refresh is live; recommendation decisions use durable receipts and superseded feedback is fenced; both receipt graphs survive merge; exact workout source revisions reach the destination; protected bodyweight digests hash row bytes; chart semantic sampling, direction, equality, duration formatting, and target-toast fencing are corrected; future native evidence rehashes retained bytes and expands motion/input observations.

The merged result is still not clean. Distance-specific Running targets are not durably independent, planned-next context remains absent, the fresh hash-bound host collector fails its coverage command, the 23-module ownership range predates the second-wave fixes, and two benchmark labels do not measure the production operations they claim. The clean-clone full run passed 311/312 suites and 4,506/4,509 tests; the three failures are all in the merged Phase 19 workout-outcome coverage contract.

## Verification Evidence

Fresh verification ran in a clean detached clone of current HEAD at `/tmp/gym-phase19-rereview.NshkbO/repo`; it used the workspace dependency installation without modifying this worktree.

| Check | Fresh result |
|---|---|
| Phase 19 evidence/native/verifier source tests | 18/18 passed |
| Progress parity host contract | 2/2 Jest tests passed; all 18 requirement cases reported passed |
| Production-workload benchmark command | Executed and reported `passed`; semantic validity caveat is CR-05 |
| Exact Phase 19 coverage command | **FAILED**: 311/312 suites passed; 4,506/4,509 tests passed |
| TypeScript | Passed |
| Boundary scan | Passed across 429 files |
| `git diff --check` | Passed |
| Native/device execution | `NOT_RUN`, Phase 20-deferred as required |
| Hash-bound host manifest | **Not produced** because the coverage command failed |

No source, shared tracking, Phase 14, Phase 16, commit, push, deployment, APK, emulator, device, or Maestro mutation was performed by this review.

## Prior Finding Re-test Ledger

| Prior item | Current verdict | Evidence |
|---|---|---|
| CR-01 period scope / oldest-500 truncation | Closed | Window predicates and snapshot-local paging are in `progressRepository.ts:193-207,456-537`; 501-row behavior passes. |
| CR-02 active/current target authority | Partially closed | Active lifecycle/current revision filtering exists, but distance-specific current targets are not preserved (CR-01). |
| CR-03 post-snapshot target composition | Closed | `runningTargetSources` is loaded inside the repository snapshot at `progressRepository.ts:793-867`; runtime delegates directly. |
| CR-04 All/Strength/Running hierarchy | Partially closed | Heroes/charts/goals/best efforts now render, but planned-next remains absent (CR-02). |
| CR-05 metadata-only refresh | Closed | The screen schedules/cancels 250/1000/4000 ms attempts at `ProgressScreen.tsx:411-434`. |
| CR-06 receipt bypass | Implementation closed | All callers share `commitRecommendationDecision`; current-schema repository paths persist/replay receipts. Fresh proof remains blocked by CR-03/CR-04. |
| CR-07 merge drops receipts | Closed | Both receipt graphs are materialized/remapped at `mergePlan.ts:1549-1595` with planner and real-SQLite tests. |
| CR-08 source revision discarded | Closed | Route validation and one-snapshot exact-revision read are present at `app/session/[sessionId].tsx:182-216` and `workoutOutcomeRepository.ts:2419-2454`. |
| CR-09 hard-coded host PASS | Open | Host PASS now requires retained artifacts, but the fresh collector cannot produce a manifest because coverage fails (CR-03). |
| CR-10 toy benchmark | Open | Real repository/components are imported, but timed review-open and rebuild samples are still substitutes (CR-05). |
| CR-11 opaque native hashes | Closed for source contract | Explicit 64 configurations x 8 motion/input observations per requirement, retained artifacts, schema validation, and recomputed hashes are present; execution remains Phase 20 `NOT_RUN`. |
| CR-12 incomplete exact-coverage ownership | Open | Fresh gate fails and the ownership range ends before second-wave fixes (CR-03/CR-04). |
| CR-13 chart direction/equality | Closed | Comparator-aware Y and `At target` are tested. |
| WR-01 semantic sampling loss | Closed | Mandatory extrema/crossings may exceed the nominal cap and complete data pages remain available. |
| WR-02 duration mismatch | Closed | Shared formatter covers 59:59, 1:00:00, and 23:59:59. |
| WR-03 obsolete read-back toast | Closed | Matching root target/recommendation read-back is required before toast. |
| WR-04 placeholder/proxy tests | Open | Outcome coverage improved, but invalid multi-plan proxies and merge-skew coverage tests remain (WR-02). |
| PRO-05 fixed 2.4 km target | Open after another distance save | The parser seeds 11:00, but the single current-goal model replaces its current distance (CR-01). |
| PRO-12 editable distance | Open | UI drafts switch, but committed targets are not independently reloadable by distance (CR-01). |
| T-19-08-04 bodyweight isolation | Closed | SHA-256 covers exact protected target/recommendation/import/session/set rows, not counts. |
| T-19-03-02 screen analytics boundary | Closed | Gap/pacing/comparator results are prepared below the screen; the screen formats presentation only. |
| T-19-07-02 / T-19-07-04 / T-19-09-02 | Closed in implementation | Durable receipts and superseded/non-success feedback fencing are present. |
| T-19-10-04 bounded execution | Closed | Benchmark subprocesses, native operations/ADB, output bytes, samples, and restoration are bounded. |
| UI exact focus return / 48dp source actions | Partially closed | Source actions are 48dp; some Strength/All return tokens still cannot restore the exact invoking control (WR-01). |
| UI root factual geometry | Open | Root hero facts remain a vertical text stack instead of three equal cells (WR-03). |

## Narrative Findings (AI reviewer)

## Critical / Blocker Issues

### CR-01: Saving one Running distance replaces the current target for every other distance

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/runningPlanRuntime.tsx:125-150`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/RunningTargetSheet.tsx:79-90`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/platform/sqlite/repositories/progressRepository.ts:481-488`

**Evidence:** `saveRunningTarget` copies the aggregate's single `current.goal` and overwrites `goalDistanceMeters` before writing one newer goal revision. The Progress query marks only the latest goal row for the entire plan as `is_current`, not the latest row per distance. `draftFrom` can reload only the aggregate's current distance; another distance gets the hard-coded 2.4 km fallback or an empty draft rather than its last committed target.

**Issue:** A real sequence such as save 2.4 km, save 10 km, reopen 2.4 km loses the committed 2.4 km value as a current owner target. Saving Half Marathon then displaces 10 km in the same way. This violates D19-04/PRO-05/PRO-12 and makes the three-distance editor appear independent only until reload.

**Fix:** Model distance-keyed current target roots/revisions under the one active Running plan. Saving one distance must compare-and-swap only that distance root while preserving the other two current targets. Read all three current distance targets into the aggregate/editor and add a real-SQLite sequence test that saves 2.4 km -> 10 km -> Half Marathon, reopens after each commit/process recreation, and proves all prior values/revisions remain current.

### CR-02: Planned-next context is still absent from the Progress contract and render path

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/progress/contracts.ts:258-320`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/platform/sqlite/repositories/progressRepository.ts:824-831`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:313-360`

**Evidence:** The All, Strength, and Running dashboard projection types expose goals/history but no `plannedNext` or equivalent source-backed future opportunity. The repository reads only `owned_plan_schedule_opportunities` with `state = 'consumed'`. Neither All, Strength, nor Running renders `Planned next`/`Next target` from an eligible future source fact.

**Issue:** ROADMAP success criterion 2, PRO-02, D19-02, and the Phase 19 UI contract require planned-next context when a real future opportunity exists. The earlier CR-04 fix completed much of the factual hierarchy but did not implement this required branch.

**Fix:** Add a typed planned-next union carrying sport, source opportunity identity/revision, local date, and display facts from the same snapshot. Query eligible active future occurrences, project them without fixture inference, render the exact optional section on All/Strength/Running, and cover present/absent/stale/incompatible cases.

### CR-03: The fresh hash-bound host evidence collector fails on merged receipt-coverage tests

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/testing/contracts/phase19WorkoutOutcomeRepositoryCoverage.test.ts:63-123`

**Evidence:** On clean current HEAD, `run-phase19-host-evidence.mjs --automated-only` failed `phase19_host_command_failed:coverage:exit_1`. The full exact run reported 311/312 suites and 4,506/4,509 tests passing. The three failures are merge-skew between the evidence branch's test and the data branch's final receipt behavior: expected `recommendation_request_identity_conflict` but got `recommendation_decision_conflict`; expected `recommendation_request_identity_missing` but got `recommendation_decision_conflict`; expected `superseded` but got `rejected`.

**Issue:** No fresh host manifest or hash-bound source PASS exists for merged HEAD. The earlier all-fixed report's 100%/PASS evidence was branch-local and does not survive the actual merge.

**Fix:** Decide the final current-schema/legacy receipt contract from the owner and migration authority, then reconcile the repository and test doubles to that contract. Ensure mocks represent table support accurately, cover duplicate cross-graph receipts and deterministic legacy replay, rerun the complete collector, and retain a manifest bound to current HEAD/tree/output hashes.

### CR-04: The 23-module coverage manifest excludes second-wave integrity changes

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/scripts/phase19-integrity-coverage.json:4-38`

**Evidence:** The manifest ends its ownership range at `diff_head: 134b0db7`, before the evidence/data fixes and their merge. Its changed-line scopes for `workoutAppRuntime.tsx` and `workoutOutcomeRepository.ts` therefore omit the later receipt/source-revision branches. `src/domains/running/contracts.ts`, which gained the authoritative 2.4 km default during the data fix, is neither required nor a reviewed exclusion. The static drift test compares only the old range and passes despite this omission.

**Issue:** Even after the three failing tests are repaired, the gate can claim 23 modules at exact coverage without measuring all second-wave authority code it is supposed to certify. This is the same false-confidence class as prior CR-12, exposed by the parallel-branch merge.

**Fix:** Extend the ownership range through the merged Phase 19 fix tip (or derive it from an explicit commit manifest), classify every production source changed by both fix branches and merge resolutions, and include the Running target parser plus all post-review receipt/source-revision lines. Make the drift test fail when commits after `diff_head` touch an unclassified integrity owner.

### CR-05: The benchmark still labels formatting and an ordinary read as review-open and rebuild timings

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/__tests__/Phase19ProgressBenchmark.test.tsx:294-325`

**Evidence:** The test opens `RecommendationSurface` once before timing, then records all 100 `review_open_ms` samples by calling only `recommendationTargetText` twice. It records `targeted_rebuild_ms` by awaiting `setImmediate` and a normal `repository.load`; no stale projection, rebuild runner, Updating UI, or terminal refresh is exercised. The fresh result's 0.025 ms review-open p95 confirms the measured operation is string formatting, not opening/rendering the review.

**Issue:** The benchmark imports real production code but two named budgets still do not measure the production work they claim. Regressions in review-sheet opening or rebuild-to-useful-content can pass unchanged, so prior CR-10 is only partially fixed.

**Fix:** Time the actual state transition and committed render for recommendation review across isolated samples, and drive a real stale subject through rebuild scheduling, Updating presentation, projection application, and terminal useful content. Hash the exact fixture/result, keep bounded samples/timeouts, and name any remaining pure projection measurements honestly.

## Warnings

### WR-01: Strength/All deep-route return does not restore the exact invoking source/history control

**Classification:** WARNING
**Confidence:** 9/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:313-351`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:436-453`

**Issue:** Strength/All chart source navigation emits `progress:<sport>:<period>:source:<session>`, but the return handler recognizes only exercise, recommendation, Running source, target, and history tokens. The hero's Open history control is not registered separately; an exercise return resolves to the lower exercise-row ref when one exists, not the exact hero invoker, and All has no matching row ref. This leaves part of the owner-mandated exact focus graph unresolved.

**Fix:** Give every hero/history/source invoker a stable token and ref keyed by surface + source identity/revision, register chart source actions for Strength/All, and add return tests that assert focus on the exact pressed control rather than another control for the same exercise.

### WR-02: Multi-distance and coverage tests still use structural proxies that cannot prove production behavior

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/__tests__/RunningTargetSheet.test.tsx:78-109`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/__tests__/ProgressScreen.test.tsx:710-746`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/testing/contracts/phase19IntegrityCoverage.test.ts:390-401`

**Issue:** The sheet test proves only in-memory draft switching with a mocked save. The screen test supplies two active Running source plans, while production `loadRunningTargetSources` rejects more than one. The coverage drift test inspects only the old manifest range. These green proxies allowed CR-01 and CR-04 to survive.

**Fix:** Replace them with current-schema real-SQLite/runtime outcomes: one active plan, three distance-specific persisted targets across reload, exact current-row projection after each save, and coverage classification through the merged fix tip.

### WR-03: Root Latest/Best/Target facts still render as a vertical stack instead of the approved three-cell hierarchy

**Classification:** WARNING
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:190-205`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:663-674`

**Issue:** `factRow` has no row direction, equal-cell wrappers, or per-cell dividers. Its three direct `Text` children therefore stack vertically at normal width. The owner-approved contract requires three equal Latest/Best/Target cells in the first viewport, stacking only for 200% text/narrow adaptation. This prior UI finding remains unchanged in source.

**Fix:** Reuse a fact-cell component with `flexDirection: "row"`, equal `flex: 1` cells and 1dp separators at normal text, then switch to the approved stacked adaptation at 200% text/landscape constraints. Assert both layouts in component tests.

---

_Reviewed: 2026-10-13T03:58:29Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
