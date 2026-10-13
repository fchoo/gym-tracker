---
phase: 19-progress-parity
reviewed: 2026-10-13T07:25:11Z
depth: deep
source_head: 57774f7709c768facc3132c078e2a3495c817a20
files_reviewed: 112
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
  - src/ui/components/BottomSheet.tsx
  - src/ui/components/FactualHistoryChart.tsx
  - src/ui/components/ProgressSettingsSheet.tsx
  - src/ui/components/RecommendationSurface.tsx
  - src/ui/components/RunningHistorySheet.tsx
  - src/ui/components/RunningTargetSheet.tsx
  - src/ui/components/index.ts
  - src/ui/screens/ExerciseHistoryScreen.tsx
  - src/ui/screens/ProgressScreen.tsx
  - src/ui/theme/index.ts
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
  critical: 3
  warning: 2
  info: 0
  total: 5
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-10-13T07:25:11Z
**Depth:** deep
**Files Reviewed:** 112
**Source HEAD:** `57774f7709c768facc3132c078e2a3495c817a20`
**Status:** issues_found

## Summary

The required zero-Critical/Warning gate is not met. The eight findings from the immediately preceding review were re-tested against the final Phase 19 fix chain and are closed at their cited paths. The fresh canonical host collector also passes on the merged tip. Three independently reproducible correctness/data-integrity gaps and two still-open UI contract defects remain.

Native Android, device, Maestro, attended, and release evidence was not run. Those checks remain Phase 20-owned and are not treated as Phase 19 failures.

## Verification Evidence

Fresh verification ran in a clean local clone of exact HEAD `/tmp/gym-phase19-final.uDI3yr/repo`; dependencies were resolved through a read-only `node_modules` symlink. The live worktree was not used for generated evidence.

| Check | Fresh result |
|---|---|
| Canonical host collector | PASS; source HEAD `57774f7709c768facc3132c078e2a3495c817a20`, tree SHA-256 `bad54ebf5056835078a879359f5fd31e87b86030e445ebd9865de9dc4ea6d08c` |
| Retained host manifest | PASS; canonical manifest SHA-256 `6b48e3f69b4f8186d1072d73bd378f94c24b424321f8b4d6b89b20feb9a26ad8` |
| Exact Phase 19 coverage command | 312/312 suites and 4,536/4,536 tests passed; 25 integrity owners; 4 changed-line-scope owners; declared 100% gate passed |
| Focused final-fix tests | 19 suites and 408 tests passed across unit, component, SQLite-host, and integration projects |
| Phase 19 evidence-script tests | 20/20 passed |
| Progress parity host contract | 2/2 Jest tests; 18/18 source-owned requirement cases passed |
| Benchmark | PASS; review-open p95 5.2665 ms, targeted-rebuild max 22.1645 ms, Updating/useful-content observed in 20/20 rebuild samples |
| TypeScript / boundaries / diff check | PASS; boundary scan covered 429 files |
| Native/device execution | `NOT_RUN`, correctly deferred to Phase 20 |

The canonical collector is strong evidence for its registered paths, but it does not exercise the two data-integrity reproductions below or the missing root interactions.

## Prior Finding Re-test Ledger

| Prior item | Current verdict | Evidence |
|---|---|---|
| Re-review CR-01: durable distance-keyed targets | Closed for normal commits/reloads | `runningPlanRepository.ts:198-208,492-507` resolves current revisions per distance; `running-foundation.test.ts:93-198` saves 2.4 km, 10 km, and Half Marathon through runtime recreation and projects all three. Stale retry remains separately open as CR-01 below. |
| Re-review CR-02: planned-next | Closed | `progressRepository.ts:632-753,953-1022` reads current active future Strength/Running opportunities in the same snapshot; `dashboardProjection.ts:136-153,423-453` validates/selects by sport; real SQLite and root render tests pass. |
| Re-review CR-03: merged receipt coverage failures | Closed | Fresh collector passed `phase19WorkoutOutcomeRepositoryCoverage.test.ts`; the exact gate completed 312 suites / 4,536 tests and published a current hash-bound manifest. |
| Re-review CR-04: stale 23-module ownership | Closed | `phase19-integrity-coverage.json` now owns 25 modules, including `running/contracts.ts` and `finishWorkout.ts`; `run-coverage-gate.mjs:315-430` derives and classifies production changes through current HEAD. |
| Re-review CR-05: proxy review/rebuild benchmarks | Closed | `Phase19ProgressBenchmark.test.tsx:318-385` repeatedly opens/closes the real review surface and drives a real stale projection through enqueue, visible Updating state, effect drain, refresh, and useful content. |
| Re-review WR-01: exact return focus | Closed for the cited controls | Stable token/ref maps cover Strength rows, recommendations, All/Strength hero history/source actions, and Running source rows; focused component assertions pass. Missing controls are separately open as CR-03 below. |
| Re-review WR-02: structural proxy tests | Closed for the cited target behavior | The one-plan multi-distance component fixture and real-SQLite runtime-recreation outcome test replace the invalid two-plan proxy. |
| Re-review WR-03: three-cell facts | Closed | `ProgressScreen.tsx:155-176,457-459,739-746` renders equal horizontal cells normally and stacked cells at 200% font scale/narrow width; both modes pass component assertions. |
| Historical CR-01/CR-03/CR-05: period paging, coherent snapshot, bounded refresh | Closed | Period predicates/paging, target sources and planned-next are in one snapshot, and 250/1000/4000 ms refresh attempts terminate/cancel as tested. |
| Historical CR-02/CR-04/PRO-05/PRO-12: factual hierarchy and target authority | Closed for projection and ordinary persistence | Current goal identity, target-only/sparse states, fixed 2.4 km default, three distance roots, All/Strength/Running heroes, charts, goals, Best efforts, and planned-next are source-backed. Retry and root-action gaps remain below. |
| Historical CR-06/CR-07/CR-08: recommendation receipts, merge retention, exact source revision | Closed at the reviewed paths | Current-schema callers use the shared fenced envelope, both recommendation receipt graphs survive merge tests, and session destinations enforce the requested effective revision. |
| Historical CR-09/CR-10/CR-11/CR-12: evidence, benchmarks, native contract, coverage | Closed for host/source | Fresh retained outputs are hash-bound to current source; real review/rebuild workloads run; the native contract remains fail-closed and Phase 20-deferred; current-tip coverage ownership passes. |
| Historical CR-13 / WR-01 / WR-02: chart direction, equality, semantic sampling, duration | Closed | Comparator-aware Y, `At target`, retained extrema/crossings, complete data pages, and shared hour-aware duration formatting pass focused tests. |
| Historical WR-03 / WR-04 / T-19-08-04: read-back fencing, outcome tests, bodyweight isolation | Closed for cited paths | Superseded decisions cannot toast success; target success requires exact read-back; SHA-256 protected-row digests and real target persistence outcomes pass. |
| Security register T-19-01-01 through T-19-10-05 | Closed at declared source boundaries | Parameterized SQL, source/revision validation, receipt hashing, one-snapshot reads, bounded commands, privacy scanning, and fail-closed artifact validation all re-passed. CR-02 below is an additional portability defect not exercised by the existing keep-both fixture. |

## Narrative Findings (AI reviewer)

## Critical / Blocker Issues

### CR-01: Retrying a changed or reloaded target replays the stale cached command

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/runningPlanRuntime.tsx:84,117-150`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/RunningTargetSheet.tsx:160-165,182-207,229-238`

**Evidence:** The runtime caches the first immutable command solely by `requestId`. On every later call with that ID, line 118 takes the cached command without comparing the new plan revision, distance, time, date, or training days. The sheet intentionally retains the same request ID after both save failure and stale-revision recovery; `reload` updates only `expectedSourceRevision`. A read-only probe called the runtime twice with the same request ID after a simulated compare-and-swap conflict, first with revision 4 / 645,000 ms and then with refreshed revision 5 / 630,000 ms. Both repository calls were exactly `{"expectedPlanRevision":4,"targetDurationMs":645000,"requestId":"same-request"}`.

**Issue:** If another writer wins between the runtime read and repository write, `Reload target` cannot recover: every retry resubmits the old revision and conflicts forever. If storage fails before commit and the owner edits the retained draft, retry can silently submit the earlier target instead of the visible draft. This breaks stale recovery and risks committing the wrong owner-selected target.

**Fix:** Cache a canonical high-level input fingerprint with each command and reuse a cached command only for an identical retry. On a proven pre-commit revision conflict, invalidate the cached command and rotate the sheet's request ID after explicit reload. Reject changed payload reuse rather than silently substituting the first command. Add an outcome test that forces the race between runtime read and repository CAS, reloads revision 5, changes the draft, and asserts the second repository command carries revision 5 and the new target while an exact lost-acknowledgement retry retains the original envelope.

### CR-02: Keep-both portability produces internally inconsistent Running plans

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/portability/mergePlan.ts:1181-1232,1367-1417`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/running/contracts.ts:307-327`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/portability/mergePlan.test.ts:2336-2385`

**Evidence:** `mappedRows` rewrites relational columns and primary keys only. The Running-plan loop sends `running_goals` through that generic mapper, so a keep-both collision changes row `id` and `plan_id` but leaves `goal_json.id` and `goal_json.planId` unchanged. The existing “retains the complete running graph” test uses a row without `goal_json` and an insert operation with no collision, so it cannot detect the defect. A read-only planner probe on current HEAD produced:

```text
row_id=merge_running_goals_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_0
row_plan_id=merged-plan
goal_json.id=goal
goal_json.planId=archive-plan
```

Passing that retained row through the production `readRunningPlanAggregate` path deterministically throws `RunningBoundaryError:running_goal_invalid` at the `goal.planId !== aggregate.id` check. The same generic loop also leaves embedded identities in Running session definitions, event payloads, and receipt results unexamined.

**Issue:** A valid keep-both logical merge can commit a relationally valid but unreadable Running source graph. Distance-keyed targets may appear present in the archive/merge counts yet become unusable after restore, violating portability and creating silent data-loss risk at the application boundary.

**Fix:** Add schema-aware Running row rewriters before materialization. Remap and validate embedded plan/goal/session/slot identities in `goal_json`, `definition_json`, event payloads, and receipt results; preserve or deliberately invalidate/reissue hashes according to the receipt contract. Add a real-SQLite keep-both collision test with all three distance targets, commit the merge, recreate the repository, and assert every current target plus session is readable under the remapped plan.

### CR-03: Required Progress root drill-downs are still rendered as inert text

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:247-256,381-390`

**Evidence:** The Running `Best efforts` section maps all three rows to plain `Text`, so none can open its distance-bound history. The All `Active goals` section also maps every row to plain `Text`, so only the separate primary-goal button can switch sport. When All selects a Running primary goal, its `FactualHistoryChart` receives neither `onOpenSource` nor `registerSourceAction`; the chart therefore renders `Source unavailable` for otherwise source-backed activity rows. The exact source/focus wiring added by `1520b701` exists for All-Strength and Strength, not this All-Running branch.

**Issue:** Phase 19 plan 19-09 requires every hero/row to open the correct history/source surface and return to the exact invoker. The UI-SPEC separately requires All active-goal rows to select their sport and Running Best-effort rows to open Running history. These user journeys are absent, so the prior hierarchy and exact-focus findings are not fully closed despite the focused tests passing.

**Fix:** Render each Active goal and Best effort as a 48dp `FocusablePressable`, route each distance to its matching Running history, and pass source callbacks plus stable identity/revision return-token refs to the All-Running chart. Add outcome tests that press every row/source action, assert the exact route/distance/revision, return, and verify focus on the precise invoking control while sport/range/scroll remain unchanged.

## Warnings

### WR-01: The approved 3dp focus offset is still implemented as 4dp

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/theme/index.ts:49-63`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/index.ts:190-201,312-323`

**Issue:** Phase 19 UI-SPEC lines 141, 157, and 526 require a 3dp outline with a 3dp offset and explicitly prohibit rounding that geometry to the shared 4dp spacing scale. `sizes.focusClearance` remains `4`, and shared Phase 19 focusables consume that value directly. This is the prior UI focus-geometry finding unchanged in source.

**Fix:** Set the shared focus-offset token to the approved 3dp value after checking Phase 14 consumers, or introduce an approved focus-geometry token that Phase 19 controls use. Keep the 3dp outline and add source/native assertions that focused segmented controls, rows, and sheets are not clipped.

### WR-02: The 82% sheet cap still excludes the header and safe-area inset

**Classification:** WARNING
**Confidence:** 9/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/BottomSheet.tsx:306-365,388-403`

**Issue:** The approved 82% cap is applied only to the child `ScrollView` (`styles.scroll.maxHeight`). The enclosing frame has no portrait max-height, then adds the header and bottom safe-area padding. A Phase 19 sheet can therefore exceed the specified surface cap before 200% text and keyboard avoidance are considered. The source defect is independent of deferred native screenshot evidence.

**Fix:** Apply the 82% viewport cap to the complete sheet frame, or compute the body maximum after subtracting header and safe-area insets. Retain the compact-landscape calculation and add host geometry assertions; Phase 20 should then confirm 200% text, keyboard, and landscape behavior on device.

---

_Reviewed: 2026-10-13T07:25:11Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
