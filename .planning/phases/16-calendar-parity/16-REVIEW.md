---
phase: 16-calendar-parity
reviewed: 2026-10-13T04:31:28Z
depth: deep
files_reviewed: 100
files_reviewed_list:
  - app/(tabs)/__tests__/calendar.test.tsx
  - app/(tabs)/__tests__/root-shell.integration.test.tsx
  - app/(tabs)/calendar.tsx
  - app/__tests__/calendar-cross-destination-route.test.tsx
  - app/__tests__/calendar-plan-route.test.tsx
  - app/__tests__/garmin-activity-route.test.tsx
  - app/__tests__/running-plan-route.test.tsx
  - app/__tests__/session-route.test.tsx
  - app/calendar/plan/[occurrenceId].tsx
  - app/garmin/activity/[activityId].tsx
  - app/library/running/[planId].tsx
  - app/session/[sessionId].tsx
  - maestro/v1.2/calendar.yaml
  - package.json
  - scripts/benchmark-v12-interactions.mjs
  - scripts/compare-v12-calendar.mjs
  - scripts/fixtures/v12-calendar-evidence/complete.json
  - scripts/run-coverage-gate.mjs
  - scripts/run-v12-maestro.mjs
  - scripts/v12-calendar-artifacts.mjs
  - scripts/v12-calendar-case-registry.mjs
  - scripts/v12-calendar-comparison.test.mjs
  - scripts/v12-calendar-evidence-coverage.test.mjs
  - scripts/v12-evidence-scripts.test.mjs
  - scripts/verify-v12-native-evidence.mjs
  - src/bootstrap/calendarReadPorts.test.ts
  - src/bootstrap/calendarReadPorts.ts
  - src/bootstrap/phase16CalendarTestControls.test.ts
  - src/bootstrap/phase16CalendarTestControls.ts
  - src/bootstrap/runningPlanRuntime.test.tsx
  - src/bootstrap/runningPlanRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/content/catalog.test.ts
  - src/domains/history/calendar.test.ts
  - src/domains/history/calendar.ts
  - src/domains/plans/planImpactCommands.test.ts
  - src/domains/portability/backupFormat.test.ts
  - src/domains/running/contracts.test.ts
  - src/domains/running/contracts.ts
  - src/domains/scheduling/localDate.test.ts
  - src/domains/workout/index.ts
  - src/domains/workout/sessionDetail.ts
  - src/domains/workout/workoutPresentation.ts
  - src/navigation/importedActivityRoute.ts
  - src/navigation/routeOrigin.test.ts
  - src/navigation/routeOrigin.ts
  - src/platform/sqlite/repositories/plansWorkoutRepository.ts
  - src/platform/sqlite/repositories/runningPlanRepository.ts
  - src/platform/sqlite/repositories/scheduleRepository.ts
  - src/platform/sqlite/repositories/strengthOccurrenceSnapshot.ts
  - src/platform/sqlite/repositories/trainingCalendarRepository.ts
  - src/platform/sqlite/repositories/workoutOutcomeRepository.ts
  - src/testing/contracts/phase19WorkoutOutcomeRepositoryCoverage.test.ts
  - src/ui/__tests__/CalendarScreen.test.tsx
  - src/ui/__tests__/CalendarTransitions.test.tsx
  - src/ui/__tests__/FactualHistoryChart.test.tsx
  - src/ui/__tests__/ImportedActivityDetailScreen.test.tsx
  - src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx
  - src/ui/__tests__/ProgressScreen.test.tsx
  - src/ui/__tests__/RecommendationSurface.test.tsx
  - src/ui/__tests__/RunningHistorySheet.test.tsx
  - src/ui/__tests__/RunningPlanDetailScreen.test.tsx
  - src/ui/__tests__/RunningTargetSheet.test.tsx
  - src/ui/__tests__/SessionDetailScreen.test.tsx
  - src/ui/__tests__/WorkoutSessionPresentation.test.tsx
  - src/ui/calendar/CalendarAgenda.test.tsx
  - src/ui/calendar/CalendarAgenda.tsx
  - src/ui/calendar/CalendarMonthViewport.tsx
  - src/ui/calendar/CalendarReadOnlyWorkout.tsx
  - src/ui/calendar/CalendarRouteAdapters.tsx
  - src/ui/calendar/CalendarWeekRow.tsx
  - src/ui/calendar/calendarPorts.test.ts
  - src/ui/calendar/calendarPorts.ts
  - src/ui/calendar/calendarTransitionController.ts
  - src/ui/calendar/useCurrentLocalDate.test.tsx
  - src/ui/calendar/useCurrentLocalDate.ts
  - src/ui/components/FactualHistoryChart.tsx
  - src/ui/components/RecommendationSurface.tsx
  - src/ui/components/RunningHistorySheet.tsx
  - src/ui/components/RunningSessionFields.tsx
  - src/ui/components/RunningTargetSheet.tsx
  - src/ui/components/WorkoutSessionPresentation.tsx
  - src/ui/components/index.ts
  - src/ui/screens/CalendarScreen.tsx
  - src/ui/screens/ImportedActivityDetailScreen.tsx
  - src/ui/screens/PlannedWorkoutDetailScreen.tsx
  - src/ui/screens/ProgressScreen.tsx
  - src/ui/screens/RunningPlanDetailScreen.tsx
  - src/ui/theme/index.ts
  - tests/integration/custom-exercise.test.ts
  - tests/integration/plan-impact-replacement.test.ts
  - tests/integration/schedule-commands.test.ts
  - tests/integration/starter-activation-repository.test.ts
  - tests/integration/today-schedule-workout.test.ts
  - tests/sqlite-host/historyCommandRepository.test.ts
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/running-plans.test.ts
  - tests/sqlite-host/trainingCalendarRepository.real.test.ts
  - tests/sqlite-host/trainingCalendarRepository.test.ts
findings:
  critical: 2
  warning: 3
  info: 0
  total: 5
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-13T04:31:28Z
**Depth:** deep
**Files Reviewed:** 100
**Status:** issues_found

## Summary

The current merged `fchoo/UX-revamp` tree at `f152c96502f69b72df074914b2f202182362e268` does not meet the requested zero-BLOCKER/zero-WARNING result. Direct source tracing and adversarial probes found **2 BLOCKER** and **3 WARNING** findings.

All prior 15 BLOCKER and 7 WARNING findings were re-tested. The second-wave data/runtime fixes close CR-06 through CR-15 and WR-01 through WR-06. The privacy, symlink-containment, aggregate-status, retained-JSON, immutable Running/Strength, history-only session, Garmin preservation, adjacent-panel range, focus, retained-state, settle-latch, reduced-motion, compact-layout, current-date, route-reuse, and Previous-fact fixes hold. Prior CR-02 and CR-03 remain open in narrower, directly demonstrated forms, and WR-07 is reopened by the current merged gate.

Native/device execution remains Phase 20-owned and was not counted as a defect. CR-01 and CR-02 below are source-level producer/verifier defects: they can certify an unproved matrix or cannot emit the evidence their own validators require.

The current specialized `16-SECURITY.md` reports 30/30 threats closed. The concurrently refreshed `16-UI-REVIEW.md` separately records 11 visual/accessibility warnings; this report does not duplicate its purely visual fidelity items in the frontmatter count, but it includes the two functional accessibility/reachability defects that also meet code-review warning criteria.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The 96-case evidence matrix can PASS with status-only artifacts that prove no configuration was executed

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `scripts/v12-calendar-case-registry.mjs:24-38`, `scripts/v12-calendar-case-registry.mjs:92-143`, `scripts/compare-v12-calendar.mjs:167-182`, `scripts/verify-v12-native-evidence.mjs:381-388`, `scripts/v12-evidence-scripts.test.mjs:93-145`, `.planning/phases/16-calendar-parity/16-REFERENCE-MAP.json:17-31`

**Issue:** The registry lists 64 appearance/viewport/orientation/font cases, but every one is hard-bound to `input: "touch"` and `motion: "normal"`; keyboard, D-pad, and reduced motion exist only as separate canonical 390×844 Light cases. More importantly, each live `case_results` row is allowed to contain only `id`, `case_sha256`, `status`, `native_execution`, and an artifact descriptor. Its retained JSON contains those same self-declared fields and no measured configuration, trace, screenshot, JUnit case, or source observation. The 14 comparison records remain limited to the checked reference captures, which contain no 600/840, landscape, or D-pad capture.

A direct probe built all 96 rows using only those five allowed fields and `status: "PASS"`; `validateV12CalendarComparison` returned `true`. The repository's own complete-live fixture does the same at `scripts/v12-evidence-scripts.test.mjs:121-127,201-203`, and the final-verifier test accepts it. This permits an all-PASS matrix without evidence that the listed configuration/input/motion cases ran, so the old exact-matrix false-PASS is not closed.

**Fix:** Make each case artifact carry and validate the exact source-owned binding plus immutable producer evidence: measured appearance/OS scheme, viewport/orientation/font scale, input, motion, state/route ID, execution timestamps, and references to the relevant trace/JUnit/capture hashes. Derive case status from those validated artifacts instead of accepting a supplied status. Cover required input/motion combinations across the mandated configuration set, and add a negative test showing that 96 status-only JSON files cannot pass the final verifier.

### CR-02: The checked Maestro and diagnostic producers cannot emit the traces/sample counts their validators require

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `maestro/v1.2/calendar.yaml:86-96`, `scripts/run-v12-maestro.mjs:33-63`, `src/ui/calendar/CalendarMonthViewport.tsx:380-420`, `src/bootstrap/phase16CalendarTestControls.ts:151-187`, `scripts/compare-v12-calendar.mjs:105-155`, `scripts/benchmark-v12-interactions.mjs:245-279`, `src/ui/screens/CalendarScreen.tsx:287-320`

**Issue:** The producer and validator still disagree on real stage behavior. Threshold samples are emitted at the first UI event that crosses 10/24.9/25/25.1%, using the event's actual `dx`, while the validator demands equality to the requested ratio within `0.00001`; normal event quantization and the Maestro screen-percentage versus inner-viewport width make that equality non-deterministic. Multiple thresholds crossed in one frame also schedule multiple `Date.now()`-based records that must have strictly increasing millisecond timestamps, so a valid fast gesture can throw `phase16_calendar_diagnostic_clock_invalid`.

The `drag-retreat` flow is two completed `swipe` gestures, but its validator requires one trace that crosses 25% and has exactly one below-threshold release. `drag-cancel` is a completed swipe followed by Android Back; `recordPhase16CalendarCancel` runs only when the gesture finalizes without `onEnd`, so that flow does not generate the required cancel sample. The tests avoid these paths by constructing idealized traces directly.

The performance launcher has the same producer gap: it clears logcat, launches the route once, and only polls logcat. The screen records one query per range load and records an interaction only after a real committed drag → expand → collapse sequence. Nothing in the launcher drives 100 reloads or 100 interactions, so its default request cannot reach `exportResult()`. A bounded direct probe confirmed the only ADB calls are `logcat -c`, one `am start`, and `logcat -d`, ending in `v12_calendar_diagnostics_result_missing`.

**Fix:** Implement a stage driver that performs one continuous retreat gesture and a real pointer-cancel path, records commanded marker identity separately from measured `dx`, and uses a monotonic high-resolution clock or sequence-derived timestamp that cannot collide. Make the Phase 20 collector explicitly drive the required query refreshes and 100 complete interaction sequences before awaiting export. Add integration tests that feed traces produced by the real control/gesture path into `validateV12CalendarStageTrace`; do not hand-construct the accepted trace.

## Warnings

### WR-01: The declared repository coverage gate is red after the Phase 16/19 merge

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `package.json:49`, `package.json:94`, `src/testing/contracts/phase19WorkoutOutcomeRepositoryCoverage.test.ts:63-149`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:425-482`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2716-2760`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2938-3024`

**Issue:** The exact declared command, run with coverage output redirected outside the worktree, completed 312 suites and 4,509 tests but failed deterministically: 311 suites/4,506 tests passed and all three tests in `phase19WorkoutOutcomeRepositoryCoverage.test.ts` failed. The merged test doubles no longer model the two-table receipt capability check, the missing-identity test bypasses the validator and never supplies a pending recommendation, and the retained-fence expectation still expects `superseded` even though current completion fills the retained fences and correctly follows the `rejected` path. Global metrics exceed the declared thresholds (90.40% statements, 86.62% branches, 90.63% functions, 91.64% lines), but the command exits non-zero, so `ci:pr` remains red. An isolated rerun reproduces 3/3 failures.

**Fix:** Reconcile the Phase 19 coverage fixtures with the merged receipt contract: return `{ count: 2 }` for the capability probe, return table-specific receipt rows, supply a pending recommendation when exercising post-validation branches, and update the retained-fence expectation to the intended `rejected` result (or change production behavior if `superseded` is the actual contract). Re-run the exact repository-wide command; do not weaken thresholds or omit the suite.

### WR-02: Planned Strength and Calendar-origin Running details do not move initial focus to Back

**Classification:** WARNING
**Confidence:** 9/10
**Files:** `src/ui/screens/PlannedWorkoutDetailScreen.tsx:123-190`, `src/ui/screens/RunningPlanDetailScreen.tsx:44-53`, `src/ui/components/index.ts:599-670`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:362-372`

**Issue:** The owner contract requires every Calendar-origin read-only detail to start focus at Back. Completed/partial Strength and imported Garmin now do this, but planned Strength and Calendar-origin Running only render `ScreenHeader backAction`; `ScreenHeader` exposes a title ref but no Back-action ref, and neither screen has a mount focus effect. Keyboard/D-pad users can therefore enter these two destinations without the deterministic Back focus guaranteed by CAL-17/CAL-20.

**Fix:** Add a Back-action ref to `ScreenHeader`, forward it to the Back `IconAction`, and focus it on Calendar-origin mount for ready, loading, error, and missing states. Add mounted focus assertions for both planned Strength and Calendar Running routes.

### WR-03: The 200% portrait month-control row has no constrained title slot or overflow behavior

**Classification:** WARNING
**Confidence:** 9/10
**Files:** `src/ui/screens/CalendarScreen.tsx:703-726`, `src/ui/screens/CalendarScreen.tsx:907`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:202-208`

**Issue:** The contract requires Previous, month title, Today, and Next to remain reachable at 200% text, with a `48 / minmax(0,1fr) / 76 / 48` composition and title ellipsis only after preserving the controls. The implementation uses a generic `space-between` row; the 22sp title has no flex/min-width constraint or `numberOfLines`. Existing 200% coverage exercises a compact landscape viewport, not the required 360×800 portrait control row. Long localized month labels can crowd or displace the fixed controls.

**Fix:** Implement the specified four-column layout, constrain the title cell with `minWidth: 0`/`flex: 1`, add one-line ellipsis plus a full accessibility label, and add a 360×800/font-scale-2 mounted test proving all four controls remain visible and activatable.

## Prior-Finding Reconciliation

| Prior finding | Current disposition | Evidence |
|---|---|---|
| CR-01 outer verifier false-PASS / missing retained artifacts | Resolved | Aggregate status now consumes comparison and case statuses; APK/case/comparison artifacts are rehashed and retained JSON is compared canonically. Adversarial evidence suite passes. |
| CR-02 exact Calendar matrix | **Open** | Restated as current CR-01: exact IDs are present, but status-only case artifacts prove no execution/configuration. |
| CR-03 native trace/diagnostic source | **Open** | Restated as current CR-02: source-to-validator stage mismatches and the undriven 100/100 collector remain. |
| CR-04 symlinked evidence parents | Resolved | Ancestor checks plus `O_EXCL|O_NOFOLLOW`; direct symlink tests pass. |
| CR-05 privacy in allowed path fields | Resolved | Every descriptor path is constrained to a source-owned exact template; privacy-path tests pass. |
| CR-06 scheduled Running revision | Resolved | Exact historical session revision read survives current slot advancement; real-SQLite test passes. |
| CR-07 planned Strength provenance | Resolved | Append-only occurrence snapshot, active/current provenance checks, immutable target/Previous facts, and stale/inactive tests pass. |
| CR-08 non-history Calendar session | Resolved | Calendar-only read admits only active completed/partial history; route and real-SQLite tests pass. |
| CR-09 matched Garmin visibility | Resolved | Imported history is validated before suppression and survives inactive/out-of-range opportunity membership; real-SQLite tests pass. |
| CR-10 adjacent panel range | Resolved | Query covers complete previous/current/next panels plus following week; outer-boundary mounted test passes. |
| CR-11 root/detail refocus | Resolved | Root refocus always refreshes; detail state is consumed once after fresh membership proof. |
| CR-12 retained month identity | Resolved | Last-good title/grid/selection/handlers remain coherent and inert during replacement. |
| CR-13 UI-thread settle race | Resolved | `panEnabled` closes synchronously in `onEnd`; handler-level second-touch test passes. |
| CR-14 reduced-motion destination loss | Resolved | Every adjacent phase settles to the pending destination when motion changes; controller matrix passes. |
| CR-15 compact focused agenda | Resolved | Scale-aware row and agenda minima reserve one usable agenda row; compact 200% test passes. |
| WR-01 Running target placeholders | Resolved | Shared persisted Running readback feeds Calendar and Running detail. |
| WR-02 Garmin Back focus | Resolved | Calendar mode focuses Back; management remains heading-first. |
| WR-03 active civil date | Resolved | Bounded active polling plus foreground refresh handles midnight, wall-clock, and timezone changes. |
| WR-04 settle fallback | Resolved | Epoch-checked timeout and UI callback converge on one completion. |
| WR-05 reused management routes | Resolved | Session/activity state is keyed to the current entity/revision and old actions disappear during replacement. |
| WR-06 Previous facts | Resolved | Historical and planned DTOs carry immutable prior observations through shared formatters. |
| WR-07 declared coverage gate | **Open** | Restated as current WR-01: current merged tree fails 3 deterministic tests. |

## Second-Wave and Merge Audit Trail

- Prior review baseline: `704537a9609baaf380485d2e7dcda2ab91955039`.
- Evidence fixes inspected: `dd71a6b6`, `2352c4a4`, `27e7cc2a`, `bc85cac8`, `59c342b3`, plus integration test `436f3311`; merged by `b5f23158` without conflict.
- Runtime/data/UI fixes inspected: `151571c6`, `fe0b950b`, `66ae5658`, `efdb259d`, `610bca41`, `5a21acfd`, `5c823e4a`, `8c6af741`, `edc45efc`, `5925ca65`, `678544bd`, `74cfa0df`, `7c3c4de8`, `80408ae1`, `87752957`, `8e137e47`, `f02cafdc`, plus closure record `51e33379`.
- Interleaved Phase 19 merges inspected: `2d901a84` was conflict-free; `54afb23a` resolved three test/contract overlaps. Final Phase 16 merge `e7eea042` resolved six overlaps in session routing, runtime ports, Running repository reads, and workout outcomes.
- `git show --remerge-diff e7eea042` confirms the merge retained both `getCalendarSessionDetail` and Progress `getSessionDetailAtRevision`, both current and scheduled Running reads, and both route-reuse and Progress-revision tests. No conflict markers remain.
- Current documentation-only HEAD `f152c965` changes Phase 16/19 audit artifacts but no reviewed source.

## Verification Evidence

- PASS: `npm run typecheck`.
- PASS: `npm run check:boundaries`; 429 files checked.
- PASS: focused Phase 16 component/route tests; 10 suites / 130 tests.
- PASS: focused Phase 16 unit tests; 3 suites / 76 tests.
- PASS: focused Calendar/Running/history SQLite tests; 4 suites / 28 tests.
- PASS: focused schedule/plan/Today integration tests; 3 suites / 95 tests.
- PASS: merged Progress component compatibility; 6 suites / 67 tests.
- PASS: Phase 16 evidence tests; 41 tests.
- PASS: exact Phase 16 evidence/control coverage; six evidence helpers plus Calendar controls at 100% lines/branches/functions/statements.
- PASS: `git diff --check 704537a9..f152c965`.
- FAIL: repository-wide `npm run test:coverage -- --runInBand`; 311/312 suites and 4,506/4,509 tests passed, but 3 deterministic Phase 19 receipt-coverage tests failed. Coverage itself was 90.40% statements, 86.62% branches, 90.63% functions, and 91.64% lines.
- PROBE: a live comparison containing all 96 required case IDs but only `id`, `case_sha256`, `status`, `native_execution`, and artifact descriptors was accepted (`accepted: true`).
- PROBE: the diagnostic launcher issued only log clear, one route launch, and log polling before `v12_calendar_diagnostics_result_missing`; it issued no query-repeat or interaction-driving command.

## Related Specialized Reports

- `16-SECURITY.md` at the merged source commit reports `SECURED`, 30/30 threats closed. This review's matrix/trace findings concern evidence truth and executability, not a newly discovered owner-data disclosure or production authorization path.
- The current `16-UI-REVIEW.md` records 0 blockers and 11 visual/accessibility warnings. Its purely visual fidelity findings remain in that specialized report; WR-02 and WR-03 above are duplicated only because they affect keyboard/D-pad reachability in executable code.
- The older `16-VERIFICATION.md` was read as a failure inventory, not as current truth. Its source-visible data/layout gaps are closed except for the evidence producer/verifier issues restated above.

## Phase 20 Deferred Native Evidence

Android build/install, ADB/Maestro execution, screenshots, visual comparison, physical focus/geometry checks, and release/profile performance verdicts remain Phase 20-owned. Their absence is not a finding. The checked host fixture remains `native_execution: NOT_RUN`, `status: REVIEW_REQUIRED`, and `all_pass: false`.

---

_Reviewed: 2026-10-13T04:31:28Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
