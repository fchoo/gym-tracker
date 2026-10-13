---
phase: 19-progress-parity
reviewed: 2026-10-13T13:31:32Z
depth: deep
source_head: efb0e4ba99763d01645dbc055e8c2a870384a9a8
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
  warning: 0
  info: 0
  total: 3
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-10-13T13:31:32Z
**Depth:** deep
**Files Reviewed:** 112
**Source HEAD:** `efb0e4ba99763d01645dbc055e8c2a870384a9a8`
**Phase 19 final fix merge:** `24d6109dd1090906ea8000811894e1bb74f2b55d`
**Status:** issues_found

## Summary

The required zero-Critical/BLOCKER/Warning gate is not met. Three current-source correctness defects reproduce on the merged branch: edited target retries can become request-identity locked, production All-goal ordering systematically gives Running a finite ordering record while Strength falls back to the end, and activating an All active-goal row changes sport without moving focus to the selected sport tab.

The canonical current-HEAD host collector passes its registered cases, including the current 25-owner integrity gate. That evidence closes the embedded Running merge, multi-distance persistence, planned-next, receipt, benchmark, segmented/hero, sheet-cap, and typography findings listed below. It does not exercise any of the three failing reproductions, so it cannot close them.

Native Android, device, Maestro, attended, visual, and release evidence remains `NOT_RUN` and Phase 20-owned. It is not counted as a Phase 19 finding.

## Narrative Findings (AI reviewer)

### Verification Evidence

Fresh verification ran in the isolated clean clone `/tmp/gym-phase19-definitive.P7LIo0/repo` at exact current HEAD. Dependencies resolved through a disposable `node_modules` symlink; the live worktree's user-owned Phase 14 and coverage changes were not used or modified.

| Check | Fresh result |
|---|---|
| Canonical host collector | PASS; source HEAD `efb0e4ba99763d01645dbc055e8c2a870384a9a8`; tree SHA-256 `e448e60984e876a8dcf0c737107b472fec4508c4441864f3ac740a32f1a2c71d` |
| Retained host manifest | PASS; canonical manifest SHA-256 `b055a99d2bbf259f146c854f104e73006324ccc4ae24e2a9a5f8e86005816682`; producer SHA-256 `d0e20f03c2184e6d5c717c7d57de1fa3e06433558a8ffaa186cdb64509c94de1` |
| Evidence-script contracts | 18/18 passed; zero failed/skipped/todo |
| Progress parity host contract | 2/2 Jest tests passed; ordered PRO-01 through PRO-18 records retained |
| Exact Phase 19 coverage command | 312/312 suites and 4,610/4,610 tests passed; 25 integrity owners; 4 changed-line-scope owners; statements/branches/functions/lines all met 100% |
| Production benchmark | PASS; useful-content max 8.461 ms; review-open p95 3.919 ms; targeted-rebuild max 18.665 ms; Updating and useful content observed in 20/20 rebuild samples; query rows capped at 500 |
| TypeScript / boundaries / diff check | PASS; boundary scan covered 429 files |
| Adversarial focused repros | 3/3 reproduced the current defects below |
| Native/device execution | `NOT_RUN` / `REVIEW_REQUIRED`, correctly deferred to Phase 20 |

### Critical / Blocker Issues

#### CR-01: Editing a retained target after a non-CAS failure permanently reuses the failed request identity

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/runningPlanRuntime.tsx:133`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/RunningTargetSheet.tsx:163`

**Motivating code:**

- `runningPlanRuntime.tsx:134-138` rejects a reused request ID when the visible payload fingerprint changes.
- `runningPlanRuntime.tsx:169` caches the first command; `:174-180` invalidates it only for the two revision-conflict messages.
- `RunningTargetSheet.tsx:163-168` changes the draft without rotating its request identity.
- `RunningTargetSheet.tsx:189-190` reuses the retained ID, and `:210-211` maps the resulting identity conflict back to the same generic save error.

**Exact reproducer:**

1. Render the real `RunningTargetSheet` with the real `createRunningPlanRuntimePort`, plan revision 4, and target 11:00.
2. Enter 10:45 and make the repository command throw `running_target_storage_failed` before commit.
3. Keep the sheet open, change the retained draft to 10:30, and press `Save target` again.
4. Observed in the isolated Jest probe: the repository save mock remains at exactly one call, the 10:30 draft remains visible, and `Target was not saved` returns. The second attempt is rejected in the runtime as `running_target_request_identity_conflict`.
5. Focused output: `PASS ... cannot submit an edited retained draft after an unclassified pre-commit failure`.

An exact unchanged retry remains correct and stale-CAS reload now rotates identity, but the owner-visible promise says to review the retained draft and try again. Editing that draft makes retry impossible until the sheet is discarded/remounted, losing the retained recovery path.

**Fix:** Store the draft fingerprint with `requestIdsRef`. Reuse the ID only while the canonical draft fingerprint is unchanged; allocate a new ID when the owner edits any request field after an attempt. If the first ambiguous attempt actually committed, the new request's old revision must fail CAS and route through authoritative reload. Add one combined sheet/runtime outcome test for pre-commit failure → edit → new request, while retaining the existing exact lost-acknowledgement replay test.

#### CR-02: Production All ordering never supplies factual ordering metadata for Strength goals

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/progress/dashboardProjection.ts:34`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/platform/sqlite/repositories/progressRepository.ts:1062`

**Motivating code:**

- `dashboardProjection.ts:34-40` compares `sourceOrder` before target date or any other tie-break.
- `dashboardProjection.ts:72-87` can use declared ordering only when a matching `ProgressGoalRevision` exists; otherwise the fallback at `:48-69` assigns `Number.MAX_SAFE_INTEGER`.
- `progressRepository.ts:1066-1074` passes `dashboardFacts.goals` as the declared goal set. That set is built only from `running_goals`; Strength receives history facts but no cross-sport ordering record.
- Therefore every current Running target gets a finite SQL-derived order and every Strength candidate gets the fallback maximum. `dashboardProjection.ts:494-504` then selects Running first whenever both sports are present.

**Exact reproducer:**

A production-shaped `projectProgressDashboard` input with two current Strength facts, one current Running target, and no synthetic Strength entry in `goals` returns:

```text
primaryGoal.sport = Running
activeGoals = [Running, Strength]
```

This remains true with the Running target dated `2027-12-31` and `sourceOrder: 99`; the current unit test passes only because it manually injects a Strength `ProgressGoalRevision` that the repository never produces. Focused output: `PASS ... always places a production-shaped Running declaration before Strength`.

**Fix:** Produce one typed, persisted cross-sport ordering record for every eligible Strength and Running goal inside the same Progress snapshot. Match Strength records by stable goal/target identity, not a test-only synthetic declaration, and apply the settled ordering to those records before selecting `primaryGoal`. Replace or supplement the pure unit fixture with a real-SQLite All read containing both sports and assert the intended primary goal and complete ordered list.

#### CR-03: Activating an All active-goal row drops keyboard/D-pad focus

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:204`

**Motivating code:**

- `ProgressScreen.tsx:218-224` makes each Active goal row actionable, but activation only calls `onSelectSport`.
- The handler at `:691` closes local surfaces and calls `setSport(next)`; it does not focus the selected sport tab.
- The segmented-control ref map and focus call are private to keyboard movement within `SegmentedControls` at `:99-106`, so an external active-goal activation cannot request tab focus.
- The invoked row unmounts when the sport root replaces All, leaving no deterministic focus owner.

**Exact reproducer:**

1. Render All with a Strength active-goal row.
2. Press `Open Strength active goal Bench Press`.
3. The Strength tab becomes selected, but its `hasTVPreferredFocus` remains absent/false.
4. Focused output: `PASS ... drops focus instead of moving it to the selected sport tab`.

This violates the approved source contract that a sport change focuses the selected tab. Native Phase 20 evidence is deferred, but the missing source focus call is already deterministic and host-reproducible.

**Fix:** Add an explicit external focus request to `SegmentedControls` (for example, a value plus request version or a hoisted ref map). Active-goal activation should retain range, set sport, then focus the selected tab after the render commits. Extend the existing Active goals component test to require both selected state and exact preferred/accessibility focus.

### Historical / Final Finding Reproduction Ledger

| Required area | Current verdict | Direct evidence |
|---|---|---|
| Stale target retries | **OPEN — CR-01** | CAS reload rotates the sheet ID and classified conflicts invalidate the runtime cache, but edited retained drafts after non-CAS failures reuse the old ID and cannot submit. |
| Embedded Running merge identities | **CLOSED** | `rewriteRunningPayload` remaps plan, goal, session revision/root, slot revision/root, arrays, aggregate targets, events, and receipt results. Pure planner test `mergePlan.test.ts:2397` and real-SQLite readable keep-both test `logicalMergeRepository.test.ts:2469` passed in the 4,610-test gate. |
| Drill-down / exact focus | **PARTIAL — CR-03** | Running Best-effort rows, All Running history/source, Strength history/source, recommendations, target sheets, and bodyweight invokers have exact refs and passing tests. All Active goal sport selection still drops focus. |
| Factual goal ordering | **OPEN — CR-02** | Array-position selection was replaced, but production provides ordering declarations only for Running. The Strength ordering branch is exercised only by a synthetic unit input. |
| Segmented / hero UI | **CLOSED** | One 13dp segmented frame with 3dp internal geometry is present; root charts suppress duplicate summary facts; current component assertions passed. |
| Sheet / focus / typography | **PARTIAL — CR-03 only** | Full sheet frame has the 82% cap; Progress scopes an exact 3dp focus clearance; declared Archivo/IBM Plex Mono data roles and 14/16/20 sizes are used. The remaining source focus loss is CR-03. |
| Multi-distance targets | **CLOSED** | Real SQLite runtime recreation preserves independent 2.4 km, 10 km, and Half Marathon targets (`running-foundation.test.ts:95`), and the root projects all three. |
| Planned-next | **CLOSED** | Current active Strength/Running future opportunities are queried in the same snapshot and projected deterministically; repository and projection tests passed. |
| Recommendation receipt coverage | **CLOSED** | Current completion/Keep/Use callers use the receipt-fenced path; merged coverage fixture passes; current collector ran 312 suites / 4,610 tests without stale receipt assertions. |
| Benchmark / evidence | **CLOSED for host/source** | Fresh retained command bytes, source/producer/result hashes, real review open/close, real rebuild enqueue/drain/refresh, bounded worker/output/query samples, and privacy validation all passed. Native remains Phase 20-owned. |
| 25-owner integrity coverage | **CLOSED** | Current-tip manifest classifies every changed production TS/TSX module; 25 required owners and four changed-line scopes passed 100% statements/branches/functions/lines. |
| Registered Phase 19 security threats | **CLOSED** | All 41 registered threats remain mitigated or explicitly accepted at the reviewed boundaries; current static injection/secret/eval scans and the fresh host collector found no new security finding. |

### Test-Gate Gap

The host manifest reports PASS for all 18 PRO records because those records map to existing broad tests. None executes:

- non-CAS target failure → owner edits retained draft → retry;
- production repository All input with both sports and no test-only Strength ordering declaration;
- Active goal activation → selected sport tab receives exact focus.

The fixes should add these outcomes to the source-owned contract, not only as isolated regression tests, so future green manifests cannot miss the same defects.

---

_Reviewed: 2026-10-13T13:31:32Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
