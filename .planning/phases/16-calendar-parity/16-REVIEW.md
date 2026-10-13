---
phase: 16-calendar-parity
reviewed: 2026-10-13T07:16:07Z
depth: deep
files_reviewed: 101
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
  - scripts/phase19-integrity-coverage.json
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
  warning: 1
  info: 0
  total: 3
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-13T07:16:07Z
**Depth:** deep
**Files Reviewed:** 101
**Status:** issues_found

## Summary

The final merged `fchoo/UX-revamp` tree at `57774f7709c768facc3132c078e2a3495c817a20` does **not** meet the required zero-BLOCKER/zero-WARNING result. Direct source tracing and executable probes found **2 BLOCKER** and **1 WARNING** findings.

The final Back-focus and 360dp/font-scale-2 fixes hold. The Phase 19 receipt suite now passes all five tests. All previously closed authority, privacy-path, symlink, immutable Running/Strength/history, Garmin, range, focus, retained-state, transition, reduced-motion, current-date, route-reuse, and Previous-fact findings remain closed. The surviving failures are narrower than the prior report: the 96-case verifier now rejects status-only rows but still accepts arbitrary support bytes plus self-declared aggregate counts; the 24.9% Maestro stage still executes above the actual inset viewport threshold; and the final Phase 19 merge leaves the declared repository-wide coverage gate red.

Native Android/device execution remains Phase 20-owned and is not counted as a defect. CR-01 and CR-02 are source-level producer/verifier defects demonstrable entirely on the host.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The final verifier PASSes a 96-case matrix whose support artifacts contain no case evidence

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `scripts/compare-v12-calendar.mjs:232-266`, `scripts/compare-v12-calendar.mjs:281-314`, `scripts/verify-v12-native-evidence.mjs:246-260`, `scripts/verify-v12-native-evidence.mjs:279-295`, `scripts/verify-v12-native-evidence.mjs:380-382`, `scripts/v12-evidence-scripts.test.mjs:97-137`, `scripts/v12-evidence-scripts.test.mjs:191-200`, `scripts/v12-evidence-scripts.test.mjs:247-252`, `scripts/v12-evidence-scripts.test.mjs:420-460`

**Issue:** The status-only shape is correctly rejected, but its replacement is still self-attested. Each case JSON declares `passed`, `failed`, `skipped`, `sample_count`, exact binding, producer name, and timestamps. The validator derives PASS from those counters and validates only the support descriptors' paths and hashes. The final verifier rehashes the four support files but never parses the JUnit XML, trace JSON, measurement JSON, or capture manifest and never correlates an individual input/motion execution with the declared case binding.

The repository contains no non-test producer for `v12-calendar-native-case/v1`, `functional.junit.xml`, `trace.json`, `measurement.json`, or `capture-manifest.json`. Its own passing final-verifier test writes every support artifact as arbitrary bytes (`bounded:<path>`) and then receives `{ status: "PASS", all_pass: true }`. This proves the matrix can still certify 96 cases without one real functional result, trace, measurement, or capture.

**Reproduction:** From repository root:

```bash
rg -n "v12-calendar-native-case/v1|functional\.junit\.xml|capture-manifest\.json|case-support" . \
  --glob '!node_modules/**' --glob '!coverage/**' --glob '!.planning/**'
node --test --test-name-pattern='final CLI verifier accepts a complete live comparison' \
  scripts/v12-evidence-scripts.test.mjs
```

The search returns only validators and test fixture builders. The test passes while `writeDescriptor` supplies arbitrary non-evidence bytes for all case-support files.

**Fix:** Implement a production case-evidence producer. Give each support artifact a source-owned schema containing the exact case hash, run/source/device identity, measured configuration, state, input, motion, timestamps, and individual outcomes. Parse and canonical-compare every support artifact in the final verifier, reconcile per-combination records against `binding.measured.input_motion`, derive counters from parsed records, and reject arbitrary or aggregate-only support bytes. Add a negative final-verifier test that keeps all current hashes/counters valid but replaces support content with `bounded:<path>`.

### CR-02: The 24.9% Maestro stages still execute above the real 25% viewport threshold

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `maestro/v1.2/calendar.yaml:16-19`, `maestro/v1.2/calendar.yaml:31-34`, `src/ui/screens/CalendarScreen.tsx:603-604`, `src/ui/screens/CalendarScreen.tsx:757-768`, `src/ui/calendar/CalendarMonthViewport.tsx:378-415`, `scripts/compare-v12-calendar.mjs:139-165`, `src/bootstrap/phase16CalendarTestControls.test.ts:52-68`, `scripts/v12-calendar-comparison.test.mjs:374-383`

**Issue:** Maestro expresses `70% → 45.1%` against the whole screen, but Calendar decides the inclusive threshold against the narrower month viewport. At 390dp, the source-applied 18dp Calendar insets produce a 354dp viewport. The supposed 24.9% command therefore measures `97.11 / 354 = 27.4322%`, commits the next panel, and emits next-month semantics. The validator correctly requires the 24.9% stage to remain at semantic/title offset 0, so the trace it receives from the real layout is rejected.

The new unit tests avoid this mismatch: they hand-construct a 24.9% trace with current-panel offsets and perturb a 100dp fixture by only 0.4dp. They do not feed Maestro's screen-relative geometry through the mounted inset layout.

**Reproduction:** The host probe using the source geometry returns exit 1:

```bash
node --input-type=module --eval '
import { validateV12CalendarStageTrace } from "./scripts/compare-v12-calendar.mjs";
const screenWidth=390, viewportWidth=354;
const trace={schemaVersion:1,stage:"drag-forward-24_9",traceNonce:"p16trace-probe-249",
sourceIdentity:{packageName:"com.fchoo.gymtracker.devtest",buildProfile:"development-test",suite:"phase16-calendar"},synthetic:true,
samples:[
{kind:"drag",commandedRatio:0.1,dx:-39,viewportWidth,transformX:-39,semanticOffset:0,titleOffset:0,elapsedMs:0,synthetic:true},
{kind:"drag",commandedRatio:0.249,dx:-97.11,viewportWidth,transformX:-97.11,semanticOffset:1,titleOffset:1,elapsedMs:1,synthetic:true},
{kind:"release",commandedRatio:0.249,dx:-97.11,viewportWidth,semanticOffset:1,titleOffset:1,elapsedMs:2,synthetic:true}]};
try { validateV12CalendarStageTrace(trace); } catch (error) {
  console.log(error.message, Math.abs(trace.samples[1].dx)/viewportWidth); process.exit(1);
}'
```

Observed: `v12_calendar_trace_stage_semantic_invalid 0.27432203389830506`.

**Fix:** Drive threshold stages in month-viewport coordinates, not screen percentages. A source-owned in-app stage driver can issue exact viewport-relative 10/24.9/25/25.1 markers through the mounted gesture callbacks, or the Phase 20 collector can measure the viewport bounds and inject coordinates relative to them. Add an integration test that converts the actual 360dp and 390dp insets into stage coordinates and feeds the emitted trace to `validateV12CalendarStageTrace`; do not hand-construct semantic offsets.

## Warnings

### WR-01: The declared repository-wide coverage gate is still red after the final Phase 19 merge

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `package.json:49-50`, `scripts/phase19-integrity-coverage.json:6-40`, `scripts/run-coverage-gate.mjs:127-180`, `scripts/run-coverage-gate.mjs:640-678`, `src/testing/contracts/phase19WorkoutOutcomeRepositoryCoverage.test.ts:63-187`

**Issue:** The Phase 19 receipt repair itself is closed: the focused suite passes 5/5. The exact repository-wide command nevertheless exits 1 on current HEAD after all **312 suites / 4,536 tests pass**. Global coverage exceeds the declared thresholds (90.46% statements, 86.71% branches, 90.70% functions, 91.71% lines), but the integrity gate reports:

- `src/bootstrap/runningPlanRuntime.tsx`: 97.08% statements / 97.10% branches / 96.15% functions / 98.90% lines
- `src/bootstrap/workoutAppRuntime.tsx`: 70.85% / 57.10% / 77.49% / 72.77%
- `src/platform/sqlite/repositories/workoutOutcomeRepository.ts`: 87.51% / 81.63% / 97.35% / 87.29%

The Phase 19 manifest explicitly marks these files as changed-line scope, but `run-coverage-gate.mjs` honors that policy only when `--focus-phase19` is present. The normal `npm run test:coverage` path treats them as whole-file 100% owners and fails.

**Reproduction:** Isolate output outside the worktree and run:

```bash
coverage_dir=$(mktemp -d /tmp/gym-review-coverage.XXXXXX)
npm run test:coverage -- --runInBand --coverageDirectory "$coverage_dir"
```

Observed final error: `integrity_critical_coverage_failed` with the twelve metric failures above.

**Fix:** Restore one coherent contract for the declared repository-wide gate. Either honor the manifest's `changed_line_scope` in the normal gate as well as focused Phase 19 mode, with tests proving both invocations enforce the same owned lines, or add behavior-bearing coverage that brings all three whole files to 100%. Keep the existing global thresholds and integrity declarations intact.

## Verified Closures

- **WR-02 planned Back focus:** resolved. `ScreenHeader` forwards `backActionRef`; planned Strength and Calendar-origin Running focus it without changing management focus. The relevant component suites pass loading, error, missing, and ready states.
- **WR-03 360dp/fontScale-2 controls:** resolved. Calendar now uses `48 / minmax(0,1fr) / 76 / 48`, a shrink-safe one-line title, full accessibility label, and reachable fixed actions. The 360×800/font-scale-2 mounted regression passes.
- **Receipt coverage after Phase 19:** resolved at test level. `phase19WorkoutOutcomeRepositoryCoverage.test.ts` passes 5/5, including two-table capability detection, retained receipts, public-envelope validation, deterministic legacy fences, and both graph tables.
- **Authority:** resolved. Calendar route composition receives frozen, query-only range/session/occurrence/activity/Running ports; Calendar-origin destination adapters expose facts plus Back and do not acquire management mutation runtimes.
- **Privacy and filesystem containment:** resolved. Exact-key schemas, source-owned path templates, parent-segment symlink rejection, `O_EXCL|O_NOFOLLOW`, retained-byte hashing, and privacy/path adversarial tests all pass. CR-01 concerns missing semantic validation of allowed support bytes, not a renewed personal-data path.
- **Immutability and source truth:** resolved. Scheduled Running resolves the pinned session revision; planned Strength reads an append-only deep-frozen occurrence snapshot and rejects stale/inactive provenance; Calendar session reads admit only active completed/partial history; matched Garmin history survives inactive/out-of-range intent; corrected/voided/rest facts remain authoritative.
- **Historical UI/runtime defects:** adjacent-panel range, root/detail refocus, retained month identity, UI-thread settle latch, reduced-motion destination, compact focused agenda, current civil date, idempotent settle fallback, route reuse, factual Running targets, and Previous facts remain covered and pass in the full run.
- **Specialized reports:** `16-SECURITY.md` remains 30/30 closed. The committed UI report was used to re-test its functional focus/reachability items; purely visual oracle differences are not reclassified as code-review warnings under the workflow's no-style-preference rule.

## Prior-Finding Reconciliation

| Historical finding | Current disposition |
|---|---|
| CR-01 outer aggregate false-PASS / unverified retained bytes | Resolved for aggregate status, retained JSON equality, APK/case descriptor hashing, and path containment. The distinct support-content gap is current CR-01. |
| CR-02 exact Calendar matrix | **Open as current CR-01.** Status-only rows fail, but aggregate counters plus arbitrary support bytes still PASS. |
| CR-03 diagnostic producer/trace source | **Open as current CR-02.** Retreat/cancel and 100/100 collection are implemented; the 24.9% screen/viewport mismatch remains. |
| CR-04 symlinked evidence parents | Resolved; adversarial writer/verifier tests pass. |
| CR-05 personal data in allowed evidence paths | Resolved; exact path-template attacks fail. |
| CR-06 scheduled Running mutable revision | Resolved; exact historical revision read and real-SQLite regression pass. |
| CR-07 planned Strength mutable/inactive provenance | Resolved; frozen snapshot and active/current revision fences pass. |
| CR-08 non-history Calendar session | Resolved; only active completed/partial history is admitted. |
| CR-09 matched Garmin suppression | Resolved; valid imported history survives inactive/out-of-range membership. |
| CR-10 incomplete adjacent panels | Resolved; outer-boundary range regression passes. |
| CR-11 root/detail refocus | Resolved; root refresh and one-shot detail restoration remain separated. |
| CR-12 retained month identity | Resolved; title/grid/selection/handlers remain coherent and inert during replacement. |
| CR-13 second-drag settle race | Resolved; UI-thread latch and handler-level test pass. |
| CR-14 reduced-motion destination loss | Resolved; destination-preserving controller matrix passes. |
| CR-15 compact focused agenda | Resolved; scale-aware reachable agenda regression passes. |
| WR-01 factual Running targets | Resolved; immutable session readback is shared by Calendar and detail. |
| WR-02 Garmin Back focus | Resolved. |
| WR-03 active civil date | Resolved; active polling and foreground refresh tests pass. |
| WR-04 duplicate settle fallback | Resolved; epoch-checked completion is idempotent. |
| WR-05 reused management routes | Resolved; entity/revision-keyed replacement tests pass. |
| WR-06 Previous facts | Resolved; immutable historical/planned observations render through shared formatters. |
| WR-07 / later WR-01 declared coverage gate | **Open as current WR-01.** Receipt tests are fixed, but the merged repository-wide gate still exits 1. |
| Final WR-02 planned Strength/Running Back focus | Resolved by `7719bfce`; mounted states pass. |
| Final WR-03 360dp/fontScale-2 month controls | Resolved by `e2e0aa7a`; mounted geometry/reachability test passes. |

## Verification Evidence

- PASS: `npm run typecheck`.
- PASS: `npm run check:boundaries`; 429 files.
- PASS: `npm run test:evidence:v12:calendar`; 45/45 tests.
- PASS: `npm run test:coverage:v12:calendar -- --coverageDirectory <tmp>`; six evidence helpers and Calendar controls at 100% statements/branches/functions/lines; 45 Node tests plus 17 Jest tests.
- PASS: focused Phase 19 receipt coverage; 1 suite / 5 tests.
- PASS at test level: repository-wide Jest execution; 312/312 suites and 4,536/4,536 tests.
- FAIL at declared gate level: repository-wide coverage command exits 1 with `integrity_critical_coverage_failed` for three shared Phase 19 files.
- FAIL probe: 390dp screen-relative 24.9% stage validates at 27.4322% of the 354dp month viewport and throws `v12_calendar_trace_stage_semantic_invalid`.
- FALSE-PASS probe: the checked final-verifier test receives PASS while all 384 case-support files contain only arbitrary `bounded:<path>` bytes.
- PASS: `git diff --check f152c965..57774f77`.
- PASS: all final Phase 16 fixes (`1f2287b0`, `4256aeb4`, `7719bfce`, `e2e0aa7a`) and the Phase 19 receipt fix (`8269cc5f`) are ancestors of HEAD; both final merge remerge-diffs are conflict-free.

## Phase 20 Deferred Native Evidence

Android build/install, ADB/Maestro execution, screenshots, physical focus/geometry checks, visual comparison, and release/profile verdicts remain Phase 20-owned and were not run or counted as findings. The checked host fixture remains honestly `NOT_RUN`, `REVIEW_REQUIRED`, and `all_pass: false`.

---

_Reviewed: 2026-10-13T07:16:07Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
