---
phase: 19-progress-parity
reviewed: 2026-10-13T17:21:29Z
depth: deep
source_head: d97ea569fc6f8671df94f68e64635c55d06864aa
files_reviewed: 132
files_reviewed_list:
  - app/(tabs)/progress.tsx
  - app/__native-contracts.tsx
  - app/__tests__/calendar-cross-destination-route.test.tsx
  - app/__tests__/garmin-activity-route.test.tsx
  - app/__tests__/progress-route.test.tsx
  - app/__tests__/running-plan-route.test.tsx
  - app/__tests__/session-route.test.tsx
  - app/exercise-history/[exerciseId].tsx
  - app/exercise-history/__tests__/exercise-history-route.test.tsx
  - app/garmin/activity/[activityId].tsx
  - app/library/running/[planId].tsx
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
  - src/ui/__tests__/CalendarScreen.test.tsx
  - src/ui/__tests__/ExerciseHistoryScreen.test.tsx
  - src/ui/__tests__/FactualHistoryChart.test.tsx
  - src/ui/__tests__/ImportedActivityDetailScreen.test.tsx
  - src/ui/__tests__/Phase19ProgressBenchmark.test.tsx
  - src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx
  - src/ui/__tests__/ProgressScreen.test.tsx
  - src/ui/__tests__/ProgressSettingsSheet.test.tsx
  - src/ui/__tests__/RecommendationSurface.test.tsx
  - src/ui/__tests__/RunningHistorySheet.test.tsx
  - src/ui/__tests__/RunningPlanDetailScreen.test.tsx
  - src/ui/__tests__/RunningTargetSheet.test.tsx
  - src/ui/__tests__/SessionDetailScreen.test.tsx
  - src/ui/__tests__/foundation.test.tsx
  - src/ui/calendar/CalendarAgenda.test.tsx
  - src/ui/calendar/CalendarAgenda.tsx
  - src/ui/calendar/CalendarDisclosureChevron.tsx
  - src/ui/calendar/CalendarRouteAdapters.tsx
  - src/ui/components/BodyweightEditorSheet.tsx
  - src/ui/components/BodyweightHistorySheet.tsx
  - src/ui/components/BottomSheet.test.tsx
  - src/ui/components/BottomSheet.tsx
  - src/ui/components/bottomSheetFocus.ts
  - src/ui/components/FactualHistoryChart.tsx
  - src/ui/components/ProgressSettingsSheet.tsx
  - src/ui/components/RecommendationSurface.tsx
  - src/ui/components/RunningHistorySheet.tsx
  - src/ui/components/RunningTargetSheet.tsx
  - src/ui/components/WorkoutSessionPresentation.tsx
  - src/ui/components/index.ts
  - src/ui/screens/CalendarScreen.tsx
  - src/ui/screens/ExerciseHistoryScreen.tsx
  - src/ui/screens/ImportedActivityDetailScreen.tsx
  - src/ui/screens/PlannedWorkoutDetailScreen.tsx
  - src/ui/screens/ProgressScreen.tsx
  - src/ui/screens/RunningPlanDetailScreen.tsx
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
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---
# Phase 19: Code Review Report

**Reviewed:** 2026-10-13T17:21:29Z
**Depth:** deep
**Files Reviewed:** 132
**Source HEAD:** `d97ea569fc6f8671df94f68e64635c55d06864aa`
**Final certification merge:** `d97ea569fc6f8671df94f68e64635c55d06864aa`
**Status:** clean

## Summary

All reviewed files meet quality standards. No issues found.

The required zero-Critical/BLOCKER/Warning gate is met. The shared focus context is now leaf-owned, both barrel focusables and the BottomSheet frame consume the same scoped clearance, the component barrel remains acyclic, and `bottomSheetFocus.ts` is exactly classified as presentation-only by the current-head registry. All 33 historical findings remain closed.

Native Android, device, Maestro, attended, visual, and release evidence remains `NOT_RUN` and Phase 20-owned. The retained automated report therefore remains `REVIEW_REQUIRED` with `source_status: PASS`; this planned native deferral is not a Phase 19 code finding.

## Narrative Findings (AI reviewer)

### Verification Evidence

Fresh verification ran in the isolated clone `/tmp/gym-phase19-cert.1CmiGV/repo` at exact current HEAD. Dependencies resolved through a disposable `node_modules` symlink; the live worktree's user-owned planning/evidence changes were not used or modified. The tracked source tree remained clean.

| Check | Final result |
|---|---|
| Exact source identity | HEAD `d97ea569fc6f8671df94f68e64635c55d06864aa`; tree SHA-256 `0a4cc9223f17ccb1519217292f463cb62ee461668892e7e99308ea4dc1ebff5c` |
| Complete evidence-script contracts | PASS; 20/20, zero failed/skipped/todo |
| Exact Phase 19 integrity coverage | PASS; 312/312 suites and 4,622/4,622 tests; 25 owners plus four changed-line scopes at 100% statements/branches/functions/lines |
| Canonical host collector | PASS; all seven commands exit 0 and are retained |
| Retained verifier | PASS; `source_status: PASS`, exact HEAD/tree rebound, all 18 PRO records host PASS, native `NOT_RUN` |
| Canonical manifest identity | canonical JSON SHA-256 `9f05440a5a05a13beea3c930593d101a2c2d057c000f86c15c7108bb6cfbd2f4`; retained file-byte SHA-256 `f7835bf48c681c8e7557a0b01075d2aaf0fed925d7d016b609dc06c66f3aac87` |
| Producer/verifier identity | collector SHA-256 `d0e20f03c2184e6d5c717c7d57de1fa3e06433558a8ffaa186cdb64509c94de1`; verifier SHA-256 `01817924ef27952bff246d448e07100daefab157b8f17b60db05479dfae7599b` |
| Progress contract | PASS; 2/2 Jest tests and ordered PRO-01 through PRO-18; result SHA-256 `b54f8515e7d1251bea77e50a3f04f86b46b10e07ca143f8f2dee841c7d52a395` |
| Fix5 regressions | PASS; 6/6 suites and 105/105 tests |
| Scoped focus repair | PASS; 2/2 suites and 46/46 focused tests |
| Production benchmark | PASS; useful-content max 7.784 ms; review-open p95 4.543 ms; targeted-rebuild max 26.150 ms; range-query p95 4.215 ms; chart-render p95 0.150 ms; JS-task max 0.095 ms; exact 20/100/20/100/20/100 samples; query cap 500; result SHA-256 `d3814aa6ebe65496eb3dc919878a64017975d3d19c4557167b97fc3a6e8a697c` |
| TypeScript / boundaries / diff check | PASS; boundary scan covered 430 files |
| Dependency/security audit | PASS; no npm advisories; no production hardcoded secret, `eval`, unsafe HTML, `shell: true`, or variable shell execution found |
| Portability | PASS in the exact full matrix: planner, logical merge/restore, backup/restore, clean-install restore, receipt graphs, and multi-plan portability |
| Native/device execution | `NOT_RUN` / Phase 20-owned |

### Canonical Collector Command Ledger

| Command | Verdict | Retained stdout SHA-256 |
|---|---|---|
| 01 `evidence-tests` | PASS; 18/18 embedded tests | `28bf3b875f44671b4c554a38a65ebabcf8687541ef922568b57e03d00be72763` |
| 02 `progress-contract` | PASS; 2/2 tests | `ad5041414338223be9b2b5af0d92856a0f6b2740cbfcdf972e95777907fbc6` |
| 03 `benchmark` | PASS | `c5d6146d2bbb7cc818ce9d085fffc1e60495d1b094b4fb2b9174eb419776ef8a` |
| 04 `coverage` | PASS; 25 owners/four scopes at 100% | `68d05720b16ba9ddb373f9c903c69f8dbe7ad127694c2b74f3cdd8738a114d30` |
| 05 `typecheck` | PASS | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| 06 `boundaries` | PASS; 430 files | `67847fe23627d7ada605af63e2d47457a7e4ef78e62ab5867103e1378366b67e` |
| 07 `diff-check` | PASS | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

### Historical / Final Finding Reproduction Ledger

| Prior report | ID / original classification | Current verdict | Current-HEAD proof |
|---|---|---|---|
| `8e01ca78` | CR-01 / BLOCKER — Running range and 500-row truncation | **CLOSED** | Real SQLite range/paging outcome at `tests/sqlite-host/progressRepository.test.ts:607` passes in the current full run. |
| `8e01ca78` | CR-02 / BLOCKER — Running goal authority and target-only state | **CLOSED** | Current-target/lifecycle projection at `dashboardProjection.test.ts:232`; target-only source rendering at `ProgressScreen.test.tsx:317`. |
| `8e01ca78` | CR-03 / BLOCKER — target composition outside snapshot | **CLOSED** | Exact one-snapshot read and same-snapshot target source at `progressRepository.test.ts:533,655`. |
| `8e01ca78` | CR-04 / BLOCKER — All/Strength placeholders | **CLOSED** | Typed Strength comparators at `dashboardProjection.test.ts:280,324`; factual root rendering at `ProgressScreen.test.tsx:317`. |
| `8e01ca78` | CR-05 / BLOCKER — refresh metadata only | **CLOSED** | Bounded 250/1000/4000 ms progression and cancellation at `ProgressScreen.test.tsx:376,421`. |
| `8e01ca78` | CR-06 / BLOCKER — recommendation receipts bypassed | **CLOSED** | Deterministic receipt fencing for bare/current callers at `phase19WorkoutOutcomeRepositoryCoverage.test.ts:1244`; integration matrix passes. |
| `8e01ca78` | CR-07 / BLOCKER — recommendation receipts dropped by merge | **CLOSED** | Both receipt graphs remap at `mergePlan.test.ts:2567`; real-SQLite owned-plan receipt merge at `logicalMergeRepository.test.ts:2415`. |
| `8e01ca78` | CR-08 / BLOCKER — source revision discarded by route | **CLOSED** | Destination match/mismatch validation at `session-route.test.tsx:171-209`; corrected/removed facts at `workout-outcomes.test.ts:1724`. |
| `8e01ca78` | CR-09 / BLOCKER — evidence verifier hard-coded PASS | **CLOSED for cited behavior** | Retained host bytes are rehashed at `verify-phase19-evidence.test.mjs:264`; the current canonical collector and retained verifier pass against exact HEAD. |
| `8e01ca78` | CR-10 / BLOCKER — toy benchmark | **CLOSED** | Production repository/UI workload contract at `benchmark-phase19-progress.test.mjs:138`; current benchmark passes exact bounded samples. |
| `8e01ca78` | CR-11 / BLOCKER — opaque native claims | **CLOSED for source contract** | Build identity/retained-byte/path checks at `run-phase19-native-evidence.test.mjs:149,167,246,275`; execution remains deferred. |
| `8e01ca78` | CR-12 / BLOCKER — coverage registry omits owners | **CLOSED** | Current-head classification passes 20/20 evidence tests; all changed production modules are required owners or explicit reviewed exclusions. |
| `8e01ca78` | CR-13 / BLOCKER — chart direction/equality | **CLOSED** | Comparator-aware Y and exact `At target` at `FactualHistoryChart.test.tsx:122`. |
| `8e01ca78` | WR-01 / WARNING — semantic visual points dropped | **CLOSED** | 241 required extrema/crossings remain unsampled at `FactualHistoryChart.test.tsx:82`. |
| `8e01ca78` | WR-02 / WARNING — hour duration mismatch | **CLOSED** | Shared boundary formatting at `FactualHistoryChart.test.tsx:142`. |
| `8e01ca78` | WR-03 / WARNING — obsolete target success toast | **CLOSED** | Exact committed read-back and retained recovery at `ProgressScreen.test.tsx:598,645`; superseded decisions remain non-success at `:728`. |
| `8e01ca78` | WR-04 / WARNING — placeholder/structural tests | **CLOSED** | Real SQLite, component interaction, receipt, merge, and route outcome suites pass in the 4,622-test current matrix. |
| `f152c965` | CR-01 / BLOCKER — one Running distance replaces all | **CLOSED** | Runtime recreation preserves 2.4 km, 10 km, and Half Marathon at `running-foundation.test.ts:95`. |
| `f152c965` | CR-02 / BLOCKER — planned-next absent | **CLOSED** | Same-snapshot current opportunities at `progressRepository.test.ts:717`; all three roots render them at `ProgressScreen.test.tsx:160`. |
| `f152c965` | CR-03 / BLOCKER — collector fails receipt coverage | **CLOSED for receipt fixture** | Workout outcome receipt coverage and the current canonical collector both pass. |
| `f152c965` | CR-04 / BLOCKER — coverage manifest excludes second wave | **CLOSED** | The exact `CalendarDisclosureChevron.tsx` exclusion passes both independent registry assertions and allows coverage collection to start. |
| `f152c965` | CR-05 / BLOCKER — benchmark labels stand-ins as production | **CLOSED** | Production workload assertion at `benchmark-phase19-progress.test.mjs:138`; current result is source-hashed and bounded. |
| `f152c965` | WR-01 / WARNING — deep-route focus not exact | **CLOSED** | Running/Strength/All source and row return focus at `ProgressScreen.test.tsx:570,948,984`. |
| `f152c965` | WR-02 / WARNING — multi-distance/coverage structural proxies | **CLOSED** | Real SQLite persistence at `running-foundation.test.ts:95` and current focused outcome suites replace the proxies. |
| `f152c965` | WR-03 / WARNING — hero facts vertical | **CLOSED** | Row/stack adaptation at `ProgressScreen.test.tsx:868`. |
| `31f54e8f` | CR-01 / BLOCKER — stale cached target command | **CLOSED** | Exact replay/conflict/rebase tests at `runningPlanRuntime.test.tsx:108,154,182`; sheet reload at `RunningTargetSheet.test.tsx:189`. |
| `31f54e8f` | CR-02 / BLOCKER — keep-both Running graph unreadable | **CLOSED** | Every embedded identity remaps at `mergePlan.test.ts:2397`; committed aggregate is readable at `logicalMergeRepository.test.ts:2469`. |
| `31f54e8f` | CR-03 / BLOCKER — root drill-downs inert | **CLOSED** | Every Best-effort/active-goal/source path at `ProgressScreen.test.tsx:475,501`. |
| `31f54e8f` | WR-01 / WARNING — focus offset 4dp | **CLOSED** | Progress scopes `FocusClearanceProvider` to 3dp and selector semantics pass at `ProgressScreen.test.tsx:232`. |
| `31f54e8f` | WR-02 / WARNING — 82% cap excludes frame | **CLOSED** | Complete surface cap asserted at `RunningTargetSheet.test.tsx:60` and `BottomSheet.test.tsx:322`. |
| `f0c63c44` | CR-01 / BLOCKER — edited retained retry identity lock | **CLOSED** | Combined real sheet/runtime regression at `runningPlanRuntime.test.tsx:226`; exact unchanged replay remains covered at `:205`. |
| `f0c63c44` | CR-02 / BLOCKER — Strength missing cross-sport order | **CLOSED** | Production real-SQLite Strength-first/Running-first/fallback outcomes at `progressRepository.test.ts:1448`. |
| `f0c63c44` | CR-03 / BLOCKER — active-goal focus dropped | **CLOSED** | Selected destination tab, preferred focus, and retained range at `ProgressScreen.test.tsx:282`. |



### Security / Evidence / Coverage / UI / Portability Re-test

- **Security:** All 41 registered threats retain their source closure. The final changes move a numeric focus-clearance context into a leaf module, re-export its provider, consume it from existing presentation controls, and classify that leaf. They add no external-input, SQL-write, logging, secret, command-execution, authorization, transaction, receipt, projection, or evidence-authority boundary. Dependency audit and static scans pass.
- **Evidence and coverage:** Evidence contracts, exact coverage, all seven collector commands, canonical manifest validation, and independent retained verification pass at the same HEAD/tree. All 18 PRO source records are host PASS; no native claim is manufactured.
- **UI:** `FocusClearanceProvider` and `useFocusClearance` share one leaf context. Progress-scoped 3dp clearance reaches both existing `FocusablePressable` controls and the BottomSheet close action, while the global default remains 4dp. The barrel cycle remains absent. Focused suites pass 46/46.
- **Portability:** Running keep-both remapping, recommendation receipt graphs, logical backup/restore/merge, clean-install restore, and multi-plan portability all pass in the exact 4,622-test matrix.

### Native Deferral

Android/Gradle/APK, adb, emulator/device, Maestro, native screenshots, native benchmark, and attended review remain `NOT_RUN` and Phase 20-owned. No native PASS is inferred from host tests.

---

_Reviewed: 2026-10-13T17:21:29Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
