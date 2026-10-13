---
phase: 16-calendar-parity
reviewed: 2026-10-13T17:13:07Z
depth: deep
files_reviewed: 109
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
  - scripts/fixtures/v12-calendar-comparison/complete.json
  - scripts/fixtures/v12-calendar-evidence/complete.json
  - scripts/phase19-integrity-coverage.json
  - scripts/run-coverage-gate.mjs
  - scripts/run-v12-maestro.mjs
  - scripts/v12-calendar-artifacts.mjs
  - scripts/v12-calendar-case-evidence.mjs
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
  - src/domains/scheduling/localDate.ts
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
  - src/ui/__tests__/foundation.test.tsx
  - src/ui/calendar/CalendarAgenda.test.tsx
  - src/ui/calendar/CalendarAgenda.tsx
  - src/ui/calendar/CalendarDisclosureChevron.tsx
  - src/ui/calendar/CalendarMonthViewport.tsx
  - src/ui/calendar/CalendarReadOnlyWorkout.tsx
  - src/ui/calendar/CalendarRouteAdapters.tsx
  - src/ui/calendar/CalendarWeekRow.tsx
  - src/ui/calendar/calendarPorts.test.ts
  - src/ui/calendar/calendarPorts.ts
  - src/ui/calendar/calendarTransitionController.ts
  - src/ui/calendar/useCurrentLocalDate.test.tsx
  - src/ui/calendar/useCurrentLocalDate.ts
  - src/ui/components/BottomSheet.test.tsx
  - src/ui/components/BottomSheet.tsx
  - src/ui/components/bottomSheetFocus.ts
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
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-13T17:13:07Z
**Depth:** deep/final
**Files Reviewed:** 109
**Source:** `fchoo/UX-revamp` at `d97ea569fc6f8671df94f68e64635c55d06864aa`
**Status:** clean

## Verdict

The required zero-finding gate is **met**.

- Critical: **0**
- BLOCKER: **0**
- Warning: **0**
- Info: **0**
- Total: **0**

All three warnings from the `b4150a2a` review remain closed: the Garmin Calendar-origin assertion uses the exact header label, missing-detail primary actions retain their distinct approved copy, and the scoped runtime import graph has zero cycles. The sole `c18b3405` warning also reproduces as closed. Commit `867c369c`, merged without conflict by `d97ea569`, moves the focus-clearance context into the existing leaf module; both `FocusablePressable` and the frame-owned BottomSheet Close action consume the same hook; the 4dp default and Progress-scoped 3dp override are both asserted.

All requested type, boundary, evidence, privacy, focused-test, runtime-import, and repository-wide coverage gates pass at the exact reviewed HEAD. No new source, test, security, authority, accessibility, motion, typography, iconography, spacing, or integrity finding was found.

The 96-case evidence boundary remains source-byte-backed and fail-closed. The exact registry has 96 cases and 64 static configurations, expands to 554 input/motion observations, and resolves to 1,662/1,662 unique opaque trace, measurement, and PNG paths. The 51-test evidence suite rejects traversal, symlink, privacy-field/path, missing-byte, malformed-PNG, unordered-trace, arbitrary-wrapper, stale-hash, and status-only evidence attacks.

Native Android/device execution, screenshots, physical focus/geometry, and release/profile performance remain Phase 20-only. They were not run and are not counted as Phase 16 findings.

## Narrative Findings (AI reviewer)

No findings.

## The `c18b3405` Warning

| Prior warning | Current disposition | Exact current-HEAD evidence |
|---|---|---|
| WR-01: leaf-local BottomSheet Close bypassed scoped focus clearance | **CLOSED** | `FocusClearanceContext`, `FocusClearanceProvider`, and `useFocusClearance` now live in `bottomSheetFocus.ts:18-29`; `FocusablePressable` consumes the hook at `index.ts:243-246`, and `BottomSheetCloseAction` consumes it at `BottomSheet.tsx:73-76,129-134`. `BottomSheet.test.tsx:149-179` proves both the 4dp default and provider-scoped 3dp result. The leaf remains acyclic. |

## The Three `b4150a2a` Warnings

| Prior warning | Current disposition | Exact current-HEAD evidence |
|---|---|---|
| WR-01: missing-state copy conflated with the Calendar header label | **CLOSED** | Headers retain `Back to Calendar agenda`; missing historical, planned Strength, and Running actions use `Back to Calendar`. The dedicated 5-suite reproduction passes 48/48 tests. |
| WR-02: stale Garmin route assertion expected `Go back` | **CLOSED** | `app/__tests__/garmin-activity-route.test.tsx:149` now queries `Back to Calendar agenda`; its isolated suite passes 29/29 and stack Back remains asserted. |
| WR-03: `BottomSheet.tsx → index.ts → BottomSheet.tsx` runtime cycle | **CLOSED** | `BottomSheet.tsx` no longer imports `./index`; its isolated suite passes 13/13, including the final focus regression. The 109-file graph contains 104 JS/TS modules, 235 unique runtime edges, and 0 cycles. |

## Complete Historical-Finding Reconciliation

Every prior code-review finding is accounted for below. Repeated findings are grouped by lineage; every historical identifier remains explicit.

| Historical finding IDs | Disposition at `d97ea569` | Current evidence |
|---|---|---|
| `b0d0e706` CR-01 broad mutation authority | **CLOSED** | Calendar composition still receives frozen query-only range/session/occurrence/activity/Running ports; route tests prove mutation runtimes are not acquired. |
| `b0d0e706` CR-02 untrusted origin fails open | **CLOSED** | Origin, return-token, local-ID, and revision parsers reject arrays, blanks, unknown roots, provider identifiers, and malformed values before routing. |
| `b0d0e706` CR-03 / `8e01ca78` CR-06 mutable Running revision | **CLOSED** | Scheduled Running reads remain pinned to `(planId, sessionRevisionId)` and fail closed on mismatch; current unit, route, and SQLite tests pass. |
| `b0d0e706` CR-04 placeholder agenda/rest facts | **CLOSED** | SQLite-backed event, rest, empty, and agenda projections remain covered by current focused and repository suites. |
| `b0d0e706` CR-05 Garmin account namespace leakage | **CLOSED** | UI/accessibility output remains the bounded `Garmin` source label; privacy-schema and path tests pass. |
| `b0d0e706` CR-06 / `8e01ca78` CR-13 second-drag settle race | **CLOSED** | The UI-thread latch closes before bridge completion and epoch/idempotency guards retain one terminal transition. |
| `b0d0e706` CR-07 / `8e01ca78` CR-15 compact and 200%-text clipping | **CLOSED at source/host level** | Scale-aware row/agenda minima, vertical scrolling, and mounted compact/text-scale tests pass. Physical geometry remains Phase 20-only. |
| `b0d0e706` CR-08 unavailable diagnostic route parameter | **CLOSED** | Scalar route parameters and source identity are parsed and gated in the executable diagnostic path. |
| `b0d0e706` CR-09 / `8e01ca78` CR-03 / `e2e5f928` CR-02 diagnostic producer mismatch | **CLOSED at source/host level** | Viewport-relative stages, continuous retreat/cancel traces, deterministic elapsed order, 100/100 collectors, and chunked output pass all evidence tests. |
| `b0d0e706` CR-10 / `8e01ca78` CR-02 / `e2e5f928` CR-01 / `31f54e8f` CR-01 / `f0c63c44` CR-01 incomplete or self-certified 96-case evidence | **CLOSED** | Exact IDs and bindings are registry-owned; all trace/measurement/PNG source bytes are loaded, parsed or decoded, size-checked, rehashed, and tied to run/case/input/motion/source-tree identity. Status-only and arbitrary support data fail. |
| `b0d0e706` CR-11 live comparison rejected | **CLOSED** | Host-deferred and live-executed schemas are separated; checked live verifier coverage reaches PASS while the checked host fixture remains honestly `REVIEW_REQUIRED`. |
| `b0d0e706` CR-12 / `8e01ca78` CR-05 / `f0c63c44` CR-02 privacy and path escape | **CLOSED** | Canonical source-owned paths, run-ID grammar, exact-key schemas, parent symlink rejection, and privacy-bearing path/payload rejection pass. |
| `b0d0e706` CR-13 / `8e01ca78` CR-01 / `31f54e8f` CR-01 descriptor loss, overwrite, and arbitrary support bytes | **CLOSED** | Exclusive writes, immutable journals, retained descriptor bytes, canonical JSON, nested capture verification, and stale/replaced-byte rejection pass. |
| `b0d0e706` CR-14 / `8e01ca78` WR-07 / `e2e5f928` WR-01 / `31f54e8f` WR-01 repository or integrity coverage red | **CLOSED** | Exact repository coverage passes 312/312 suites and 4,622/4,622 tests; all 158 integrity-critical files are 100% in all four metrics. |
| `b0d0e706` WR-01 / `f0c63c44` WR-02 status visuals and glyph icons | **CLOSED** | Sport/status treatments remain distinct and Calendar historical states use 24dp, 2dp-stroke Lucide icons with hidden decorative semantics. |
| `b0d0e706` WR-02 same-day order destroyed | **CLOSED** | Stable source grouping/order tests pass. |
| `b0d0e706` WR-03 / `8e01ca78` CR-11 return-focus refresh race | **CLOSED** | Restoration waits for matching authoritative refresh and falls back to the selected date when the event disappears. |
| `b0d0e706` WR-04 read failure reported as missing | **CLOSED** | Missing and retryable error states remain distinct and retain the exact retry identity. |
| `b0d0e706` WR-05 planned Strength target/stale load | **CLOSED** | Canonical metric parsing and request-generation fencing remain covered. |
| `b0d0e706` WR-06 layout generation not fenced | **CLOSED** | Invalidation generations advance and stale measurements are rejected. |
| `b0d0e706` WR-07 / `f0c63c44` WR-01 month-row fill and agenda geometry | **CLOSED** | Rows flex; agenda fade consumes timing; exact 3dp/4dp/3dp content spacing and stretching 5dp rail with 62dp minimum remain asserted. |
| `b0d0e706` WR-08 / `f0c63c44` WR-05 keyboard, detail entry focus, and disclosure motion | **CLOSED** | Calendar details focus Back in all states; one Lucide chevron rotates 160ms and resolves immediately under reduced motion; keyboard/D-pad tests pass. Shared sheet Close focus clearance is also restored by `867c369c`. |
| `b0d0e706` WR-09 / `8e01ca78` WR-03 stale Today | **CLOSED** | Bounded active polling and foreground refresh cover midnight, wall-clock, and timezone changes. |
| `b0d0e706` WR-10 impossible technical FAIL state | **CLOSED** | Complete failed deviation evidence requires a valid `FAIL` classification and reason code. |
| `b0d0e706` WR-11 evidence validators below integrity coverage | **CLOSED** | Seven evidence helpers and `phase16CalendarTestControls.ts` pass their exact focused 100% coverage gates. |
| `8e01ca78` CR-04 symlinked parent traversal | **CLOSED** | Writer and verifier adversarial tests reject linked parents. |
| `8e01ca78` CR-07 mutable/inactive planned Strength provenance | **CLOSED** | Append-only frozen occurrence snapshots and active/current revision fences pass. |
| `8e01ca78` CR-08 non-history Calendar session | **CLOSED** | Calendar reads admit only active completed/partial history. |
| `8e01ca78` CR-09 matched Garmin activity suppression | **CLOSED** | Valid imported history survives inactive or out-of-range plan membership. |
| `8e01ca78` CR-10 incomplete adjacent range | **CLOSED** | Read range includes complete previous/current/next panels and the following week. |
| `8e01ca78` CR-12 retained/requested month split | **CLOSED** | One coherent last-good title/grid/selection snapshot renders while replacement interactions remain inert. |
| `8e01ca78` CR-14 reduced-motion destination loss | **CLOSED** | Every transition state resolves to the pending destination when reduced motion changes. |
| `8e01ca78` WR-01 placeholder Running target | **CLOSED** | Calendar and detail share immutable revision readback and one formatter. |
| `8e01ca78` WR-02 Garmin entry focus | **CLOSED** | Calendar-origin imported activity states focus Back; management stays heading-first. |
| `8e01ca78` WR-04 missing idempotent settle fallback | **CLOSED** | UI callback and epoch-checked timeout converge on one completion. |
| `8e01ca78` WR-05 stale management-route entity | **CLOSED** | Visible state is keyed by current entity/revision and stale actions disappear during replacement. |
| `8e01ca78` WR-06 fabricated Previous value | **CLOSED** | Historical/planned DTOs carry immutable previous observations through shared formatting. |
| `e2e5f928` WR-02 planned Strength/Running initial Back focus | **CLOSED** | Mounted loading/error/missing/ready states retain deterministic Back focus. |
| `e2e5f928` WR-03 360dp/font-scale-2 month controls | **CLOSED** | The fixed/flexible/fixed/fixed track and constrained title preserve all four controls in mounted tests. |
| `31f54e8f` CR-02 screen-relative 24.9% gesture | **CLOSED** | The producer uses measured Calendar viewport width and validates both 360dp and 390dp threshold traces. |
| `f0c63c44` WR-03 Calendar typography roles | **CLOSED** | Calendar non-ready headings and historical exercise names use the approved Calendar-specific roles. |
| `f0c63c44` WR-04 Calendar key swatch/status geometry | **CLOSED** | 24×8 sport swatches and 22×13 status samples retain exact styles and labels. |
| `b4150a2a` WR-01 / `b4150a2a` WR-02 / `b4150a2a` WR-03 | **CLOSED** | See the dedicated three-warning reproduction table above. |
| `c18b3405` WR-01 BottomSheet scoped focus clearance | **CLOSED** | See the dedicated c18 warning reproduction table above; source, focused tests, coverage registry, and runtime graph all agree. |

## Contract and Visual Re-Audit

- **Agenda and layout:** Monday-first month/focused grids, adjacent-week sequence, top-aligned agenda rows, exact source-order preservation, 14dp Calendar-key inset, 3dp detail/metadata gaps, 4dp metadata/secondary gap, and 62dp scalable rail minimum remain in source and tests.
- **Typography:** Calendar heading, body, metadata, chip, and historical exercise-name roles match `16-UI-SPEC.md`; the prior 20sp/16sp leaks remain absent.
- **Icons and semantics:** Required Lucide 24dp/2dp icons, hidden decorative glyphs, status text plus non-color treatment, accessible names/roles/states, and 48dp minimum actions remain asserted.
- **Focus and input:** Calendar root/detail focus, exact trigger restoration, modal trapping, Back/Escape/scrim cancellation, arrow/Home/End/Enter/Space paths, 4dp Calendar focus clearance, and the shared Progress 3dp BottomSheet override all pass.
- **Motion:** Inclusive 25% settling, second-touch protection, epoch/idempotent completion, 160ms disclosure rotation, cancellation, and reduced-motion terminal semantics remain covered.
- **Authority and privacy:** Calendar-origin destinations remain query-only and identity-bounded. Evidence schemas remain exact-key, canonical-path, source-byte-backed, privacy-rejecting, and fail-closed.

## Verification Evidence

| Command or probe | Exact result |
|---|---|
| `git rev-parse HEAD` | PASS: `d97ea569fc6f8671df94f68e64635c55d06864aa` before the review write. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run check:boundaries` | PASS, 430 files checked. |
| Focused Phase 16 unit command with `--runTestsByPath` | PASS, 4/4 suites and 56/56 tests. |
| Focused Calendar/Running/history data command with `--runTestsByPath` | PASS, 4/4 suites and 73/73 tests. |
| Focused Calendar/detail/route UI command with `--runTestsByPath` | PASS, 16/16 suites and 184/184 tests. The existing non-failing React `act(...)` diagnostic is emitted by the Garmin route suite. |
| Focused shared Progress/foundation command with `--runTestsByPath` | PASS, 2/2 suites and 84/84 tests. |
| Stale-Garmin-label reproducer | PASS, 1/1 suite and 29/29 tests. |
| Missing-action-copy reproducer | PASS, 5/5 suites and 48/48 tests. |
| BottomSheet cycle/focus/keyboard/geometry suite | PASS, 1/1 suite and 13/13 tests, including exact 4dp default and provider-scoped 3dp focus clearance. |
| Phase 19 registry unit suite | PASS, 1/1 suite and 1/1 test; JSON probe confirms exactly one reviewed-exclusion entry for `src/ui/components/bottomSheetFocus.ts`. |
| `npm run test:evidence:v12:calendar` | PASS, 51/51 tests; 0 failed, cancelled, skipped, or todo. |
| `npm run test:coverage:v12:calendar -- --coverageDirectory <temporary-directory>` | PASS; 51/51 Node evidence tests plus 17/17 Calendar-control tests; all seven evidence helpers are 100% lines/branches/functions and `phase16CalendarTestControls.ts` is 100% statements/branches/functions/lines. |
| `npm run verify:v12:calendar -- --fixture scripts/fixtures/v12-calendar-evidence/complete.json` | PASS, exit 0; exact result `REVIEW_REQUIRED`, `all_pass:false`, 9 native cases, 8 route journeys, 14 comparisons. This is the required host-only outcome. |
| Exact source-registry probe | PASS: 96 required cases, 64 static configurations, 554 input/motion observations, 1,662 source paths, 1,662 unique source paths. |
| Exact repository `npm run test:coverage -- --runInBand --coverageDirectory <temporary-directory>` | PASS, 312/312 suites and 4,622/4,622 tests; 0 snapshots; global 92.53% statements, 88.68% branches, 92.50% functions, 93.65% lines; 158 integrity-critical files at 100% statements/branches/functions/lines; `changed_line_scope_files:0`. |
| TypeScript runtime import-graph probe over the declared review scope | PASS: 109 files, 104 JS/TS modules, 235 unique runtime edges, 0 cycles. |
| BottomSheet scoped-focus source reproducer | PASS: barrel import absent; leaf default uses the shared token; leaf exports provider and hook; both close action and `FocusablePressable` consume the hook; Progress provides 3dp; tests assert default 4dp and scoped 3dp; registry classifies the leaf exactly once. |
| Focused privacy/path command | PASS, 6/6 tests; 0 failed, cancelled, skipped, or todo. |
| `git diff --check c18b3405707c9b7118e278648baea074ab4c90f4..HEAD` | PASS. |
| Fix lineage and merge checks | PASS: `867c369c` is an ancestor of HEAD; `git show --remerge-diff d97ea569` is empty. |
| Revision 18 authority hashes | PASS: `approved-hybrid.html` SHA-256 `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`; `approved.json` SHA-256 `b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf`. |
| Native/device commands | NOT RUN by design; Phase 20-only and excluded from finding counts. |

## Required Gate

**MET:** 0 Critical, 0 BLOCKER, 0 Warning, 0 Info. All historical findings, including the sole `c18b3405` warning, reproduce as closed. No source fix was made in this review.

---

_Reviewed: 2026-10-13T17:13:07Z_

_Reviewer: TRAE (`gstack-review` discipline)_

_Depth: deep/final_
