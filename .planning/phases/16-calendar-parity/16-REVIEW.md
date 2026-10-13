---
phase: 16-calendar-parity
reviewed: 2026-10-13T13:35:55Z
depth: deep
files_reviewed: 104
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
  warning: 5
  info: 0
  total: 7
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-13T13:35:55Z
**Depth:** deep
**Files Reviewed:** 104
**Source:** `fchoo/UX-revamp` at `efb0e4ba99763d01645dbc055e8c2a870384a9a8`
**Status:** issues_found

## Summary

The required zero-BLOCKER/zero-WARNING result is **not achieved**. The final merged tree has **2 BLOCKER** and **5 WARNING** findings.

The latest fixes do close the prior viewport-threshold failure, repository-wide whole-file coverage failure, query-only authority defects, merge-conflict risks, and most visual regressions. The remaining blockers are in the new 96-case support-evidence producer/verifier: it can derive PASS from caller-authored claims without retaining or hashing the referenced capture bytes, and its write path accepts an unvalidated traversal-bearing `run_id`. The five warnings are the source-visible UI contract gaps independently reproduced against the approved Revision 18 oracle and `16-UI-SPEC.md`.

Native Android/device execution remains Phase 20-owned. No missing APK, Maestro run, screenshot set, physical focus result, or release/profile measurement was treated as a Phase 16 defect.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The 96-case support layer still self-certifies evidence that does not exist

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `scripts/v12-calendar-case-evidence.mjs:105-140`, `scripts/v12-calendar-case-evidence.mjs:143-167`, `scripts/verify-v12-native-evidence.mjs:283-321`, `scripts/v12-evidence-scripts.test.mjs:101-110`, `scripts/v12-evidence-scripts.test.mjs:258-286`, `scripts/v12-evidence-scripts.test.mjs:573-586`

**Issue:** The replacement for the status-only 96-case ledger is structured, but its proof remains caller-authored. Functional PASS is derived from caller-supplied `expected` and `actual` booleans; trace PASS is derived from caller-supplied `expected_sha256` and `actual_sha256`; measurement PASS is derived from caller-supplied `minimum`, `maximum`, and `value`; and capture PASS is derived from two caller-supplied hashes. Trace sample sequence and elapsed-time ordering are not validated. Most importantly, the final verifier rehashes each `capture-manifest.json` wrapper but never resolves, reads, sizes, or hashes the capture files named inside that manifest.

The repository's passing live-verifier test constructs capture paths at `scripts/v12-evidence-scripts.test.mjs:110`, writes only the four support wrappers and case JSON at lines 258-265, writes the separate 14 comparison artifacts at lines 267-286, and still expects final PASS at lines 573-586. Therefore a complete 96-case result can claim successful captures whose referenced files do not exist.

**Exact reproducer:** Run the repository's positive live-verifier case, then inspect what its materializer writes:

```bash
node --test --test-name-pattern='final CLI verifier accepts a complete live comparison' scripts/v12-evidence-scripts.test.mjs
rg -n 'captures/\$\{|writeDescriptor\(root, record\.artifact|writeDescriptor\(root, record\.artifacts' scripts/v12-evidence-scripts.test.mjs
```

The test passes. The source creates nested capture descriptors at line 110, but lines 258-286 write only support wrappers, case JSON, and the separate 14 comparison artifacts. A direct one-case call to `createV12CalendarCaseEvidenceBundle` plus `validateV12CalendarCaseSupportBytes` returned:

```json
{"capture_summary":{"passed":8,"failed":0,"skipped":0,"sample_count":8},"referenced_capture":"does-not-exist/0.png","capture_exists":false}
```

A second executed probe supplied two trace samples with duplicate `sequence: 1`, decreasing `elapsed_ms` values `9 → 1`, fabricated equal hashes, and privacy-bearing nonexistent capture paths. The producer still returned `trace.passed: 8` and `capture.passed: 8`.

**Fix:** Make source-owned expectations part of the case registry rather than accepting both sides of each assertion from the caller. Require exact increasing trace sequence/timestamps. Constrain each nested capture path to an exact run/case/input/motion template, include every referenced capture in `evidenceArtifactDescriptors`, and resolve/read/rehash/size-check those bytes before deriving PASS. Add a final-CLI negative test that deletes one nested capture and another that supplies duplicate/non-monotonic trace samples.

### CR-02: The new evidence producer permits `run_id` path traversal outside the evidence namespace

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `scripts/v12-calendar-case-evidence.mjs:83-102`, `scripts/v12-calendar-case-evidence.mjs:260-283`, `scripts/v12-calendar-artifacts.mjs:52-89`

**Issue:** `validateExecution` validates package, profile, hashes, and timestamps but never validates `execution.run_id`. `v12CalendarCaseEvidencePaths` interpolates that value directly into a path, and `produceV12CalendarCaseEvidence` writes it relative to the repository root. The generic containment helper prevents escape from the repository, but it does not confine this producer to `artifacts/native/v1.2/<valid-run-id>`. A traversal-bearing run ID can therefore create the supposedly immutable evidence tree under any new directory inside the checkout. The nested capture path validator also accepts arbitrary normalized names such as `captures/Alice-private-rehab-0.png`, reopening the privacy-bearing filename channel after the last security audit.

**Exact reproducer:** The raw path construction is directly observable with:

```bash
node --input-type=module --eval 'import { v12CalendarCaseEvidencePaths } from "./scripts/v12-calendar-case-evidence.mjs"; console.log(v12CalendarCaseEvidencePaths({case_sha256:"a".repeat(64)}, "../../../rogue").functional)'
```

It prints `artifacts/native/v1.2/../../../rogue/case-support/aaaa.../functional.junit.xml`. An executed full producer probe using that run ID observed:

```json
{"accepted_run_id":"../../../rogue","artifact_path":"artifacts/native/v1.2/../../../rogue/cases/29196803389a7c4b7ef22fa2d519b8c3668585c14b5c9728fa85945788d67f1f.json","escaped_path_exists":true,"escaped_path":"rogue/cases/29196803389a7c4b7ef22fa2d519b8c3668585c14b5c9728fa85945788d67f1f.json"}
```

A separate executed validation probe accepted `captures/Alice-private-rehab-0.png` and derived eight passing capture records.

**Fix:** Validate `run_id` with the same `^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$` contract before path construction, require the supplied case to deep-equal its registry entry, root writes at the canonical run directory rather than the repository root, and validate nested capture paths against a source-owned opaque template before writing or accepting them.

## Warnings

### WR-01: Focused agenda rows still do not match the approved geometry

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `src/ui/calendar/CalendarAgenda.tsx:123-150`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:262-269`

**Issue:** Revision 18 requires a top-aligned `5dp / content / 24dp` row with 10dp vertical padding and a 62dp inset sport rail. The current row centers all children, puts vertical padding only on the copy column, and stretches the rail across the full 82dp minimum row. This is a source-visible geometry mismatch even though the row is now flat and has only a bottom separator.

**Exact reproducer:** `rg -n 'rail: \{ alignSelf: "stretch"|row: \{ alignItems: "center"' src/ui/calendar/CalendarAgenda.tsx`

**Fix:** Top-align the row, apply the contracted 10dp row padding, make the rail 5×62dp with 2dp radius, and keep the trailing 24dp Chevron aligned to the top grid cell. Add style assertions for alignment, padding, rail dimensions, and radius.

### WR-02: Calendar historical set states still use text glyphs instead of the declared icons

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `src/ui/calendar/CalendarReadOnlyWorkout.tsx:91-99`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:68`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:268`

**Issue:** The final icon fix converted agenda and planned-detail marks to Lucide components, but completed/partial historical rows still render literal `✓ Complete` and `— Not completed` text. The approved contract requires the shared outlined 24dp icon family with 2dp strokes, paired with semantic text.

**Exact reproducer:** `rg -n '✓ Complete|— Not completed' src/ui/calendar/CalendarReadOnlyWorkout.tsx`

**Fix:** Render decorative Lucide `Check`/`Minus` icons at 24dp and 2dp stroke beside visible or screen-reader state text, and add component assertions for both completed and incomplete rows.

### WR-03: Calendar-owned non-ready and modal headings still use the forbidden 20sp shared scale

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `src/ui/components/BottomSheet.tsx:331-341`, `src/ui/components/index.ts:654-660`, `src/ui/components/index.ts:756-768`, `src/ui/calendar/CalendarRouteAdapters.tsx:21-35`, `src/ui/calendar/CalendarRouteAdapters.tsx:76-85`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx:129-136`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:132-143`

**Issue:** The Phase 16 contract permits only 11/14/16/22sp and weights 400/800. Ready detail views now use `calendarTypeScale`, but the Calendar key still inherits `BottomSheet`'s 20sp `typeScale.screenTitle`; historical and planned Strength loading/error/missing headers omit `titleStyle`; and their `EmptyState` headings inherit 20sp `typeScale.sectionTitle`. The final typography fix therefore closes only the ready paths.

**Exact reproducer:** `rg -n 'typeScale\.(screenTitle|sectionTitle)|<ScreenHeader backAction=\{onBack\}.*title="Workout (details|preview)"' src/ui/components/BottomSheet.tsx src/ui/components/index.ts src/ui/calendar/CalendarRouteAdapters.tsx src/ui/screens/PlannedWorkoutDetailScreen.tsx`

**Fix:** Add scoped heading/body style overrides to `BottomSheet` and `EmptyState`, pass `calendarTypeScale.heading` to every Calendar-origin `ScreenHeader`, and add loading/error/missing/key assertions that reject 20sp and any weight other than 400/800.

### WR-04: Calendar-key swatches and status samples remain off-oracle

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `src/ui/screens/CalendarScreen.tsx:890-915`, `src/ui/screens/CalendarScreen.tsx:926-949`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:214-220`

**Issue:** The added Activity swatches are 12×12 squares with no radius, while Revision 18 uses 24×8 bars with 2dp radius. The Status group wraps each label inside the bordered/tinted sample instead of rendering the fixed 22×13 swatch beside the label. Presence and color tests pass, but the exact key composition does not.

**Exact reproducer:** `rg -n 'activitySwatch:|statusKey:|calendar-key-(strength|running)-swatch' src/ui/screens/CalendarScreen.tsx`

**Fix:** Render separate 24×8 rounded Activity swatches and 22×13 status swatches beside their labels, preserving neutral status coloring and the wrapping three-item layout. Assert dimensions, radius, and label/swatch separation.

### WR-05: Historical detail entry focus and disclosure motion remain incomplete

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `src/ui/calendar/CalendarRouteAdapters.tsx:21-35`, `src/ui/calendar/CalendarRouteAdapters.tsx:76-85`, `src/ui/components/WorkoutSessionPresentation.tsx:70-93`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx:160-193`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:241-251`, `.planning/phases/16-calendar-parity/16-UI-SPEC.md:362-372`

**Issue:** Ready historical details focus Back through `CalendarReadOnlyWorkout`, but loading, error, and missing historical-session branches create `ScreenHeader` without a Back ref or focus effect. The historical and planned exercise disclosures also swap `ChevronRight`/`ChevronDown` immediately; the required 160ms rotation and immediate reduced-motion branch are absent.

**Exact reproducer:** `rg -n '<ScreenHeader backAction=\{onBack\} title="Workout details"|ChevronDown|ChevronRight|withTiming|duration:\s*160' src/ui/calendar/CalendarRouteAdapters.tsx src/ui/components/WorkoutSessionPresentation.tsx src/ui/screens/PlannedWorkoutDetailScreen.tsx`

**Fix:** Share one Calendar detail shell that owns a Back ref and focuses it in loading/error/missing/ready states. Render one Chevron and animate its rotation for 160ms in normal motion, with an immediate final transform under reduced motion; cover both historical and planned disclosures.

## Prior Finding Reconciliation

### Initial deep review at `b0d0e706`

| Prior finding | Final disposition |
|---|---|
| CR-01 broad runtime authority | Closed: Calendar routes consume frozen range/session/occurrence/activity/Running read ports; route tests prove broad runtime hooks and mutation commands are not reached. |
| CR-02 origin parameters fail open | Closed: scalar/origin parsers reject arrays, blanks, and unknown values before management routing. |
| CR-03 Running revision identity dropped | Closed: `loadScheduledSessionPlan(planId, sessionRevisionId)` resolves the pinned revision and fails closed on mismatch. |
| CR-04 placeholder agenda/rest facts | Closed: source-backed summaries and explicit event/rest/empty day facts flow from SQLite to the agenda. |
| CR-05 Garmin namespace leak | Closed at the UI boundary: the visible label is fixed to `Garmin`; internal account identity is not presented. |
| CR-06 second drag strands settle | Closed: the UI-thread latch closes before the JS bridge and completion is epoch/idempotency fenced. |
| CR-07 200%/compact clipping | Closed for the previously reported source behavior: track and agenda minima scale and the viewport has a vertical scroll owner. Native appearance remains Phase 20. |
| CR-08 diagnostic route parameter unavailable | Closed: Expo Router scalar parameters are parsed and identity-gated. |
| CR-09 diagnostic producers do not exercise stages | Closed for Phase 16 source: bounded in-app viewport-relative drivers, continuous retreat/cancel, 100/100 drive commands, and chunked output exist. Native execution remains Phase 20. |
| CR-10 incomplete matrix | Closed: the registry requires the exact ordered 96-case set and 554 input/motion observation records. |
| CR-11 live comparison rejected | Closed: host-deferred and live-executed schemas are separated and the live CLI test reaches PASS. |
| CR-12 evidence privacy | Regressed in the post-audit nested capture schema; see current CR-01/CR-02. |
| CR-13 descriptor loss/overwrite | Closed for wrapper records: recursive canonical JSON, exclusive writes, and symlink checks pass. Nested capture bytes remain unverified under current CR-01. |
| CR-14 integrity-critical coverage | Closed: the final exact gate reports all 158 registered files at 100% statements/branches/functions/lines. |
| WR-01 status visual semantics | Closed: sport-tinted complete/partial/planned treatments and neutral status colors are present. |
| WR-02 same-day source order | Closed: stable date/source grouping preserves source order and tests assert it. |
| WR-03 return-focus race | Closed: restoration waits for the matching authoritative refresh and falls back to the selected date if the event disappeared. |
| WR-04 read errors misreported as missing | Closed: missing and retryable error states are distinct. |
| WR-05 planned target parsing/stale load | Closed: canonical metric parsing and request generation fencing are present. |
| WR-06 layout generation not enforced | Closed: invalidation increments generations and stale measurements are rejected. |
| WR-07 rows do not fill / agenda timing unused | Closed for the original defect: rows flex and agenda opacity consumes the command timing. Current exact agenda geometry is WR-01. |
| WR-08 keyboard/focus handlers | Partially closed; current historical non-ready focus and disclosure-motion gaps are WR-05. |
| WR-09 stale Today | Closed: bounded active polling and foreground refresh cover clock/timezone changes. |
| WR-10 technical FAIL impossible | Closed: complete failed deviation evidence has a valid `FAIL` path and reason code. |
| WR-11 evidence helper coverage | Closed: all seven evidence helpers and Calendar controls pass 100% line/branch/function coverage. |

### Re-review at `8e01ca78`

| Prior finding | Final disposition |
|---|---|
| CR-01 outer aggregate false-PASS / missing retained artifacts | Closed for declared wrapper artifacts and aggregate derivation; current CR-01 covers the unverified nested evidence. |
| CR-02 exact matrix identity | Closed for the exact 96 case IDs, source/map identity, and required input/motion expansion; current CR-01 covers self-oracling case content. |
| CR-03 native stage/diagnostic producer mismatch | Closed at source level by viewport-relative in-app stages, continuous retreat/cancel, deterministic elapsed ordering, a bounded 100/100 driver, and chunked output. |
| CR-04 symlinked parent traversal | Closed for the registered artifact writers and verifier. |
| CR-05 privacy in allowed paths | Regressed only in the newly added nested capture path field; see current CR-02. |
| CR-06 scheduled Running mutable revision | Closed with exact revision reads and real-SQLite coverage. |
| CR-07 planned Strength mutable/inactive provenance | Closed with append-only snapshots and active/current revision fences. |
| CR-08 non-history Calendar session | Closed with Calendar-only completed/partial active-history reads. |
| CR-09 matched Garmin suppression | Closed; valid imported history survives inactive/out-of-range plan membership. |
| CR-10 incomplete adjacent range | Closed; the range spans complete previous/current/next panels plus the following week. |
| CR-11 root/detail refocus | Closed for stale restoration and root refresh. |
| CR-12 mixed retained/requested month identity | Closed; one coherent last-good snapshot is rendered and interactions are disabled during replacement. |
| CR-13 UI-thread settle race | Closed by the synchronous UI-thread latch and handler-level regression. |
| CR-14 reduced-motion destination loss | Closed across adjacent-collapsing/measuring/expanding states. |
| CR-15 compact focused agenda | Closed for reachability via scale-aware minimum allocation and vertical scrolling. |
| WR-01 Running target placeholder | Closed with immutable revision readback and the shared formatter. |
| WR-02 Garmin entry focus | Closed for all imported-activity states. |
| WR-03 active timezone/clock drift | Closed by active polling plus foreground refresh. |
| WR-04 missing settle fallback | Closed by an epoch-checked JS fallback de-duplicated with the UI callback. |
| WR-05 stale management detail reuse | Closed with entity/revision-keyed visible state. |
| WR-06 fabricated Previous facts | Closed with immutable previous observations and shared formatting. |
| WR-07 declared CI coverage red | Closed by the current repository-wide whole-file gate. |

### Later final-gate findings

| Prior finding | Final disposition |
|---|---|
| `e2e5f928` CR-01 status-only 96-case evidence | Partially closed: wrapper content is now parsed and canonical, but current CR-01 proves the evidence remains self-oracling and can omit referenced capture bytes. |
| `e2e5f928` CR-02 commanded markers, retreat/cancel, and 100/100 collector | Closed: mounted viewport-relative traces pass at 360/390 and diagnostic collection is actively driven. |
| `e2e5f928` WR-01 shared coverage failure | Closed: all 312 suites / 4,610 tests pass and all 158 integrity files reach 100% in the exact repository gate. |
| `e2e5f928` WR-02 planned/Running Back focus | Closed. |
| `e2e5f928` WR-03 360dp/font-scale-2 controls | Closed. |
| `31f54e8f` CR-01 arbitrary support bytes | Partially closed: arbitrary wrapper bytes are rejected, but current CR-01 proves canonical self-authored support plus missing nested captures still PASSes. |
| `31f54e8f` CR-02 screen-relative 24.9% gesture | Closed: the source-owned driver uses measured viewport width and both 360dp/390dp traces validate. |
| `31f54e8f` WR-01 whole-file coverage | Closed: no changed-line exception is used in the normal gate and all 158 integrity files are at 100%. |

### UI and security artifacts

- The final `16-UI-REVIEW.md` reports 0 blockers and 5 warnings. All five are reproduced as WR-01 through WR-05 above; the earlier 11-warning UI ledger is reconciled there as 8 closed and 3 partially closed.
- The current `16-SECURITY.md` records 30/30 threats closed at `e7eea042`. The post-audit case-evidence module was added by `032d4b7f`; current CR-01 and CR-02 reopen the evidence tampering/path/privacy concerns represented by T-16-06-02, T-16-06-04, and T-16-07-03. The remaining threat IDs are closed by current source/tests, with T-16-02-04 retained as the documented accepted low risk.
- The original `16-VERIFICATION.md` five implementation gap families are closed at the source/host level except for the exact UI contract remnants in WR-01 through WR-05. Its native-only rows remain Phase 20-deferred.

## Verification Evidence

- PASS: `npm run typecheck`.
- PASS: `npm run check:boundaries`; 429 files.
- PASS: `npm run test:evidence:v12:calendar`; 48/48 tests.
- PASS: `npm run test:coverage:v12:calendar -- --coverageDirectory <tmp>`; seven evidence helpers at 100% lines/branches/functions plus `phase16CalendarTestControls.ts` at 100% statements/branches/functions/lines.
- PASS: focused Phase 16 unit tests; 3 suites / 69 tests.
- PASS: focused Calendar/detail/route component tests; 13 suites / 160 tests.
- PASS: focused Calendar/Running/history SQLite tests; 4 suites / 28 tests.
- PASS: repository-wide `npm run test:coverage -- --runInBand --coverageDirectory <tmp>`; 312/312 suites, 4,610/4,610 tests; global 92.51% statements, 88.68% branches, 92.49% functions, 93.64% lines; all 158 integrity-critical files at 100% statements/branches/functions/lines.
- PASS: runtime import-graph scan across 99 scoped JS/TS modules; no runtime cycles after excluding type-only imports.
- PASS: `git diff --check 31f54e8f..HEAD` and `git diff --check 24d6109d..HEAD`.
- PASS: final Phase 16 and Phase 19 fix tips are ancestors of HEAD; both merge commits have empty `--remerge-diff` output, so no conflict-resolution delta altered either side.
- FAIL: case-support adversarial probes accepted nonexistent/private capture paths, duplicate/non-monotonic trace samples, and an escaping run ID while deriving PASS records; see CR-01 and CR-02.
- NOT RUN by design: Android build/install, ADB/Maestro execution, screenshots, device focus/geometry, and release/profile performance. These remain Phase 20-owned.

---

_Reviewed: 2026-10-13T13:35:55Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
