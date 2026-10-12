---
phase: 19-progress-parity
reviewed: 2026-10-12T22:08:35Z
depth: deep
files_reviewed: 96
files_reviewed_list:
  - app/(tabs)/progress.tsx
  - app/__native-contracts.tsx
  - app/__tests__/garmin-activity-route.test.tsx
  - app/__tests__/progress-route.test.tsx
  - app/exercise-history/[exerciseId].tsx
  - app/exercise-history/__tests__/exercise-history-route.test.tsx
  - app/garmin/activity/[activityId].tsx
  - app/session/[sessionId].tsx
  - maestro/phase19/progress-parity.yaml
  - package.json
  - scripts/benchmark-phase19-progress.mjs
  - scripts/benchmark-phase19-progress.test.mjs
  - scripts/run-coverage-gate.mjs
  - scripts/run-native-sqlite-contracts.mjs
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
  - src/testing/contracts/progressParity.contract.test.ts
  - src/testing/contracts/progressParity.contract.ts
  - src/testing/contracts/progressUpstreamPorts.contract.test.ts
  - src/testing/contracts/progressUpstreamPorts.contract.ts
  - src/ui/__tests__/BodyweightEditorSheet.test.tsx
  - src/ui/__tests__/BodyweightHistorySheet.test.tsx
  - src/ui/__tests__/ExerciseHistoryScreen.test.tsx
  - src/ui/__tests__/FactualHistoryChart.test.tsx
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
  - tests/sqlite-host/cleanInstallRestore.test.ts
  - tests/sqlite-host/historyRepository.test.ts
  - tests/sqlite-host/logicalMergeRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/phase12BackupBenchmark.host.test.ts
  - tests/sqlite-host/progressRepository.test.ts
findings:
  critical: 13
  warning: 4
  info: 0
  total: 17
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-10-12T22:08:35Z
**Depth:** deep
**Files Reviewed:** 96
**Status:** issues_found

## Summary

Phase 19 is not ship-ready. The review traced all ten plans through current domain projections, SQLite reads, runtime composition, Progress/Exercise-history UI, target and recommendation commands, bodyweight privacy boundaries, logical backup/restore/merge, coverage registration, benchmark production, and evidence verification. Thirteen blocking correctness or evidence-integrity defects and four warnings were verified.

The most consequential defects are: Running ignores the selected date range; capped ascending queries silently discard current facts; current goals are mixed across plan histories and resolved at the latest effort date instead of the current source revision; the runtime adds target aggregates outside the advertised coherent snapshot; All/Strength remain placeholders; recommendation receipts are bypassed by the existing completion flow and dropped by logical merge; source revisions are discarded at the workout-history destination; and the Phase 19 evidence command hard-codes host PASS without consuming test results.

Focused verification was run after review: 3 unit suites / 15 tests, 3 component suites / 28 tests, the SQLite Progress suite / 24 tests, 13 evidence-script tests, and TypeScript typecheck all passed. Those passes do not clear the findings: several tests explicitly assert the incorrect placeholder behavior or check only query text/file existence. `verify:phase19:evidence -- --automated-only` also returned `source_status: PASS` for all 18 PRO records without reading any test result artifact.

The Phase 20-owned native/device status remains correctly `NOT_RUN` and is not itself a finding. Dirty Phase 14 evidence, the untracked `.coverage` file, and unrelated Phase 16 source-gap work were excluded.

## Narrative Findings (AI reviewer)

## Critical / Blocker Issues

### CR-01: Running ignores the selected range and truncates All-time to the oldest 500 rows

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/platform/sqlite/repositories/progressRepository.ts:416`

**Evidence:** `loadDashboardFacts(executor)` receives neither `period` nor `nowLocalDate`. Its activity and goal queries have no range predicate, sort ascending, and apply `LIMIT ?` at lines 423-441. The caller invokes it unchanged at line 772. By contrast, the range test only inspects `history_projection_period_inputs`, `history_projection_comparable_exposures`, and `owned_plan_schedule_opportunities` (`tests/sqlite-host/progressRepository.test.ts:626-635`), never the imported-activity dashboard query.

**Issue:** Running 4 weeks, 12 weeks, and All time all project the same imported activities. Once more than 500 accepted activities or goal revisions exist, the ascending cap retains the oldest rows and drops the newest rows, so Latest, Best, current goal history, and evidence counts can be wrong. This violates D19-01/D19-02, PRO-01/04/09, and the complete-data/source-equivalence contract.

**Fix:** Pass an explicit `[startLocalDate, endLocalDate]` window into `loadDashboardFacts`, apply both bounds before materialization, and page All-time deterministically to completion (or expose a real cursor/page contract). Never use an ascending hard cap as semantic truncation. Add tests with facts outside each range and at least 501 rows proving the newest fact/revision remains visible and the complete data equivalent stays complete.

### CR-02: Running goal authority loses active-plan identity, current targets, and target-only states

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/platform/sqlite/repositories/progressRepository.ts:436`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/progress/dashboardProjection.ts:59`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:187`

**Evidence:** The repository selects every row from `running_goals` without joining plan lifecycle/active state and drops `plan_id` when constructing `ProgressGoalRevision` (lines 436-500). `targetAt` then filters only by sport/distance/time and both `target` and `targetAtDate` are resolved at `latest.startedAtMs` (dashboardProjection lines 59-76 and 116-120). `runningProjection` returns before projecting saved targets when no eligible activity exists (lines 79-90). The UI falls back to any non-2.4 km goal but still renders the heading `2.4 km goal` (ProgressScreen lines 187-200).

**Issue:** Archived/inactive plan targets can override the active Running plan; a target committed after the latest run is not shown as the current Target; saved target-only goals disappear when no effort exists; and a lone 10 km/Half Marathon effort is mislabeled as 2.4 km. A successful target save can therefore toast success while the hero continues to display an older target.

**Fix:** Carry stable plan/goal-root identity and lifecycle into `ProgressGoalRevision`; select current targets only from the authoritative current/active source aggregate; resolve `currentTarget` independently from `targetAtDate`; project target-only rows even with zero efforts; and derive every heading from `distanceLabel(goal.distanceMeters)`. Add active/inactive multi-plan, post-latest target revision, target-only, and non-2.4-only tests.

### CR-03: Runtime target composition occurs after the coherent SQLite snapshot

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/workoutAppRuntime.tsx:3230`

**Evidence:** `loadProgress` awaits `progressRepository.load(input)` at line 3236, then separately queries `running_goals`/`plans` and calls `runningPlans.loadPlan` at lines 3240-3258 before attaching `runningTargetSources`.

**Issue:** A writer can commit between the repository snapshot and these later reads. The dashboard can show one target revision while target rows/editor drafts come from another revision, directly violating the one-snapshot authority asserted by Plans 19-02 and 19-09.

**Fix:** Include only the typed editor source metadata needed by Progress inside the repository's existing `readSnapshot`, or create one higher-level snapshot operation that reads dashboard facts and source aggregates through the same executor. Add a writer-race test at the runtime boundary, not only inside `createProgressRepository`.

### CR-04: All and Strength parity is still placeholder UI/data, not PRO-02/PRO-03

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/progress/contracts.ts:254`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:248`

**Evidence:** `ProgressAllDashboardProjection` carries only `primaryGoal`; `ProgressStrengthDashboardProjection` carries only raw `facts` (contracts lines 254-264). The All UI renders Target plus the fixed sentence “More data needed before Latest, Best, and Gap are comparable”; Strength renders only a fact count and `Target unavailable` for every exercise (ProgressScreen lines 248-268). The component test explicitly expects that placeholder (`ProgressScreen.test.tsx:225-247`).

**Issue:** Ready All and Strength views cannot render required Latest, Best, Target, Gap, target-at-date goal line, Evidence/source links, factual status, active goals, planned-next context, or the root factual chart/data equivalent. The implementation claims parity while omitting the core owner-visible behavior.

**Fix:** Extend the discriminated projections with fully typed, presentation-ready comparable goal/series/evidence/status fields; populate them from the same snapshot; render `FactualHistoryChart` and source actions on the root; and replace placeholder tests with exact PRO-02/03 ready/sparse/target-only cases.

### CR-05: The bounded automatic refresh contract is metadata-only

**Classification:** BLOCKER
**Confidence:** 9/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/platform/sqlite/repositories/progressRepository.ts:184`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:22`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:316`

**Evidence:** The repository returns `maxAttempts` and backoff values (250/1000/4000 ms), but `ProgressSnapshot` omits the `refresh` field and the screen effect performs exactly one read per dependency change (lines 316-318). Updating UI says “Results refresh automatically” while exposing only manual Refresh (lines 379-380). The test asserts only the manual second call (`ProgressScreen.test.tsx:250-259`).

**Issue:** A projection that becomes current without another runtime generation/focus event can remain indefinitely on Updating. The declared bounded retry/backoff behavior is unreachable.

**Fix:** Thread `ProgressRefreshMetadata` through the runtime/screen, schedule exactly the declared bounded attempts while the active request remains updating, cancel attempts on selection/unmount, and stop at current/unavailable. Test timer progression, cancellation, and terminal behavior.

### CR-06: Recommendation exactly-once receipts are bypassed by the existing completion flow

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/bootstrap/workoutAppRuntime.tsx:4693`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2515`

**Evidence:** `acceptWorkoutRecommendation` and `keepWorkoutTarget`, used by `app/completion/[sessionId].tsx`, submit only `recommendationId` and a fresh `decidedAtMs` (runtime lines 4693-4714). The repository reads/writes receipts only when `explicitDecisionEnvelope(input)` is true; otherwise `commit` is `Promise.resolve(result)` (repository lines 2519-2561 and 2735-2777). The newer Progress-only path uses an in-memory request map that is cleared when services close (`workoutAppRuntime.tsx:2285-2322`).

**Issue:** PRO-15's shared decision command is not actually shared. Lost acknowledgement/retry from the completion flow conflicts after the first commit instead of replaying the committed result, and process relaunch loses the Progress request envelope as well.

**Fix:** Remove the optional legacy envelope at the mutation boundary. Route every Keep/Use caller through one receipt-fenced command constructor, persist/recover the pending request envelope when relaunch replay is required, and test acknowledgement loss from both Progress and completion routes.

### CR-07: Logical merge validates recommendation receipts, then silently drops them

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/domains/portability/mergePlan.ts:1519`

**Evidence:** Aggregate closure validates that both receipt tables reference recommendations (`logicalMergeRepository.ts:418-451`), but `mergePlan` maps `progression_recommendations` and `owned_progression_recommendations` and immediately returns at lines 1519-1538. It never adds `progression_recommendation_decision_receipts` or `owned_progression_recommendation_decision_receipts` to `tables`. Tests seed both receipt tables (`logicalMergeRepository.test.ts:690,708`) but assert only closure, not retained output.

**Issue:** Backup/restore can carry decision receipts, but merge drops them. After merge, a previously committed request loses its replay/audit fact and can conflict or be reissued incorrectly.

**Fix:** Map each receipt table with remapped `recommendation_id`; resolve `request_id` collisions under keep-both; rewrite/validate bounded `result_json` recommendation identities; include rows in the aggregate; and add end-to-end merge assertions proving both receipts survive duplicate/archive-won/local-won/keep-both paths.

### CR-08: Exercise-history source revision is discarded by the destination route

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/app/exercise-history/[exerciseId].tsx:84`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/app/session/[sessionId].tsx:148`

**Evidence:** Exercise history pushes both `sessionId` and `sourceRevision` (lines 90-101), but `SessionDetailRoute` parses only `sessionId` and `origin` and opens `ManagementSessionDetailRoute` with the ID alone (session route lines 148-170).

**Issue:** “Open source” does not prove or enforce the effective revision displayed in history. If the workout is corrected between read and navigation, the user silently sees a different revision while the UI claims an exact source link.

**Fix:** Parse and validate the positive source revision for Progress-origin routes, load the exact effective history revision (or fail closed with rebuilding/unavailable), and add a destination-level route test for match, mismatch, correction, and removed source states.

### CR-09: The evidence verifier hard-codes every host requirement to PASS

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/scripts/verify-phase19-evidence.mjs:20`

**Evidence:** `evidenceRecord` assigns `host: { status: "PASS" }` unconditionally (lines 20-32). `validateSourceRegistry` checks only count/order, task-ID syntax, and that referenced files exist (lines 156-170). The CLI then emits `source_status: "PASS"` without running or reading typecheck, lint, boundaries, Jest, coverage, benchmark, or native-contract results (lines 174-209 and 255-264).

**Issue:** A broken or entirely unrun Phase 19 host suite still produces 18/18 host PASS records. This happened during review: the command reported PASS despite the verified PRO-02/03/04 defects above.

**Fix:** Replace static PASS declarations with source-bound retained result manifests for each required command/case, verify exit status and canonical artifact hashes, join exact test/case IDs rather than filenames, and fail closed when any result is absent/stale/failing.

### CR-10: The benchmark reports production budgets from a toy stand-in

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/scripts/benchmark-phase19-progress.mjs:171`

**Evidence:** The measured runtime creates private `progress_facts`/`progress_reviews` tables and a hand-written `load` function (lines 171-256). Production code is only executed once as an ignored-output Jest preflight (lines 258-270). “targeted rebuild” is `setImmediate` plus the same toy load, and “chart render” is object mapping plus `JSON.stringify` (lines 289-371). The command nevertheless emits `status: "passed"`; review observed sub-millisecond “useful content” and “review open” samples.

**Issue:** None of the named numbers measures the production repository/runtime/UI/rebuild path it claims to budget. Regressions in snapshot assembly, React rendering, or rebuild orchestration cannot fail this gate.

**Fix:** Measure real `createProgressRepository`/runtime projection and actual chart/review component work over synthetic source facts in the production schema. Emit distinct host-query, host-render, and native metrics; do not call a toy query “useful content.” Retain raw production case IDs and source hashes.

### CR-11: Future native PASS accepts opaque driver claims and hash-shaped strings

**Classification:** BLOCKER
**Confidence:** 9/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/scripts/run-phase19-native-evidence.mjs:149`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/scripts/verify-phase19-evidence.mjs:212`

**Evidence:** The 64 configuration rows merely attach arrays of all motion/input modes; they do not cross-product or record each mode (native runner lines 149-161). Execution accepts `driver.runRow(row)` when it returns `status: PASS` plus six 64-hex strings, without reading or hashing retained captures/traces (lines 273-316). The verifier again validates only schema/order/hash regex and caller-supplied expected identity (verify lines 212-244).

**Issue:** A driver can return fabricated hashes, omit reduced-motion/keyboard/D-pad subcases, and still promote all 1,152 rows to PASS. This is not a complaint that native execution is deferred; it is a defect in the code that will certify Phase 20 evidence.

**Fix:** Make motion/input modes explicit result dimensions (or require per-mode observation records), require retained artifact paths, recompute every hash from those artifacts, independently recompute source/APK/installed/device identities, and validate semantic/focus/viewport/target/performance schemas rather than hash shape alone.

### CR-12: The “exact 100%” registry omits the core recommendation transaction and runtime seams

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/scripts/run-coverage-gate.mjs:116`

**Evidence:** The 19-file Phase 19 registry includes the command wrapper and portability repositories but omits changed `workoutOutcomeRepository.ts` (the receipt/CAS transaction), `workoutAppRuntime.tsx` (fence/read-back/retry composition), and `runningPlanRuntime.tsx` (target commit/read-back) (lines 116-136). `workoutOutcomeRepository.ts` is not present in the global integrity registry either.

**Issue:** The gate can truthfully print 100/100/100/100 while the most integrity-sensitive Phase 19 branches are outside collection. The summary's claim that all Phase 19 integrity modules are exact is false.

**Fix:** Define the registry from the actual Phase 19 integrity diff/ownership manifest, add the omitted transaction/runtime modules, require explicit reviewed exclusions, and test that every receipt/revision/commit-before-ack module is covered.

### CR-13: Strength history charts visually invert “higher is better” and mislabel equality

**Classification:** BLOCKER
**Confidence:** 9/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/FactualHistoryChart.tsx:210`

**Evidence:** Y is always proportional to `(value - minimum)`, so larger values render lower on screen regardless of `fasterIsLower` (lines 210-217 and 304-308). Strength passes `fasterIsLower: false` and the label “Higher comparable load is better.” Gap copy uses only `<`/`>`; equality falls into `slower` or `lower` (`FactualHistoryChart.tsx:263-292`).

**Issue:** Improving Strength results trend downward while the text says higher is better, and an exact target match is announced as “0 … lower/slower.” The chart is misleading even though the table retains factual values.

**Fix:** Transform Y according to comparator direction (better values visually move consistently), handle equality as `At target`, and add higher-is-better/equal-target visual and copy tests.

## Warnings

### WR-01: Visual sampling can discard required extrema and target crossings

**Classification:** WARNING
**Confidence:** 9/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/FactualHistoryChart.tsx:124`

**Issue:** When required first/last/best/local-extrema/target-crossing indexes exceed 120, the overflow branch preserves only first/last/best and fills remaining slots in chronological order (lines 124-142). Later extrema/crossings are dropped despite the UI contract requiring all of them. The full data list remains intact, limiting this to the visual evidence projection.

**Fix:** Treat every required semantic index as non-droppable; if required points exceed the nominal cap, raise the cap for that series or apply an explicit deterministic priority that the contract approves and discloses.

### WR-02: Root duration formatting disagrees with the target editor for hour-long goals

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:69`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/components/RunningTargetSheet.tsx:44`

**Issue:** The editor accepts/formats `hh:mm:ss`, but the root formatter always emits total minutes (`5400` seconds becomes `90:00`). The same committed target therefore has different owner-visible forms across editor, root, and history.

**Fix:** Use one shared duration formatter that emits `h:mm:ss` when hours are nonzero and cover 59:59, 1:00:00, and near-24-hour boundaries.

### WR-03: Target success toast can fire after an obsolete root read

**Classification:** WARNING
**Confidence:** 9/10
**File:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/screens/ProgressScreen.tsx:430`

**Issue:** `onSaved` awaits `readProgress(false)` but ignores its nullable obsolete result, then always enqueues “target saved” (lines 430-435). The recommendation path correctly rejects an obsolete read at lines 350-363. A sport/range change during save can therefore leave the root unrefreshed while presenting the success toast.

**Fix:** Require a non-null, matching authoritative Progress read before the root-level toast; otherwise keep the committed-but-refresh-failed inline recovery state and retry the read without resubmitting the command.

### WR-04: Tests encode placeholder behavior and structural proxies instead of contract outcomes

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/src/ui/__tests__/ProgressScreen.test.tsx:225`; `/Users/bytedance/orca/workspaces/gym_tracker/UX-revamp/tests/sqlite-host/progressRepository.test.ts:601`

**Issue:** Component tests require `Target unavailable` for ready Strength and accept static, non-actionable unset goal rows (lines 225-247). Repository range tests assert only that three legacy SQL strings contain `local_date >= ?` (lines 601-636), not that Running results differ by range. These tests pass while PRO-01/02/03/04 are broken.

**Fix:** Replace proxy assertions with owner-visible end-to-end outcomes: exact period-specific facts, active/current target selection, target-only states, All/Strength factual fields, 501-row correctness, and destination source-revision fencing. Keep structural SQL assertions only as secondary checks.

---

_Reviewed: 2026-10-12T22:08:35Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
