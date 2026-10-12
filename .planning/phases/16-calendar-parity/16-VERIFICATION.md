---
phase: 16-calendar-parity
verified: 2026-10-12T19:08:21Z
status: gaps_found
host_verdict: failed
score: "18/30 plan must-haves verified"
roadmap_score: "1/5"
requirements_score: "11/23"
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "Calendar presents authoritative current Strength and Running intent/history, including distinct rest, empty, corrected, and removed states."
    status: failed
    reason: "The new range query ignores schedule lifecycle and history overlays, and its fallback maps consumed rest/skipped/advanced Strength opportunities to planned events. Removed or corrected history can therefore remain stale or appear under the wrong date, and a rest day can become a fake planned workout."
    artifacts:
      - path: "src/platform/sqlite/repositories/trainingCalendarRepository.ts"
        issue: "Strength conversion falls through to planned for unsupported consumed outcomes; SQL does not constrain active schedules or join effective history lifecycle/date overlays."
      - path: "tests/sqlite-host/trainingCalendarRepository.test.ts"
        issue: "Mock-query tests omit rest/skipped/inactive/voided/corrected cases and use impossible strength state values, so they do not exercise production schema semantics."
    missing:
      - "Project active schedule intent and effective history facts from the authoritative lifecycle/overlay state."
      - "Represent rest separately from empty and reject skipped/invalid opportunities instead of converting them to planned workouts."
      - "Add real-SQLite coverage for rest, inactive schedule, corrected date, and voided history cases."
  - truth: "Calendar uses the approved full-height root composition and places Info immediately left of Settings."
    status: failed
    reason: "The four bottom roots exist, but month rows have no equal-height/fill behavior, and ScreenHeader renders the two Calendar actions in a default column rather than a horizontal Info-then-Settings group."
    artifacts:
      - path: "src/ui/calendar/CalendarWeekRow.tsx"
        issue: "The row style has no flex growth, so four/five/six-row months do not distribute across the available viewport."
      - path: "src/ui/components/index.ts"
        issue: "headerAction has only marginLeft; React Native View defaults to column layout, so Info is not immediately left of Settings."
    missing:
      - "Equal-height month-row sizing within the available Calendar viewport."
      - "A horizontal 2dp action group preserving Info immediately before Settings."
  - truth: "Calendar status encoding and agenda content are factual and match the approved sport/status contract."
    status: failed
    reason: "Completed chips use generic green fill, Partial chips use a full yellow fill instead of a sport-tinted half fill, and the key repeats non-neutral fills. Agenda result/target copy is a hardcoded category label because the event contract carries no result/target summary."
    artifacts:
      - path: "src/ui/calendar/CalendarWeekRow.tsx"
        issue: "Status backgrounds do not use the current sport tint; Partial has no half-filled treatment."
      - path: "src/ui/screens/CalendarScreen.tsx"
        issue: "Calendar-key Complete/Partial samples use green/yellow backgrounds instead of neutral status samples."
      - path: "src/ui/calendar/CalendarAgenda.tsx"
        issue: "Displays 'Completed result', 'Partial result', or 'Planned target' rather than a source-backed one-line result/target."
      - path: "src/platform/sqlite/repositories/trainingCalendarRepository.ts"
        issue: "CalendarEventFacts has no result/target summary field to drive the agenda."
    missing:
      - "Exact solid/tinted, dotted half-filled, and transparent dashed treatments using sport identity independently from status."
      - "A factual result/target summary in the immutable event projection and agenda."
  - truth: "Focused-week expand/collapse and adjacent-week selection preserve the required measured spatial sequence."
    status: failed
    reason: "The following-week overlay is positioned at the bottom of a capped 260dp grid while the agenda is rendered below that grid, not between the selected and bottom-flush following rows. For a cross-month adjacent selection, the semantic controller enters adjacent-expanding before CalendarScreen applies the pending month/date, so the old month's geometry expands and the new month is applied only after that expansion completes."
    artifacts:
      - path: "src/ui/screens/CalendarScreen.tsx"
        issue: "focusedGridRegion is capped at 260dp and agendaRegion is a later sibling; pending cross-month state is applied only when the transition returns to idle."
      - path: "src/ui/calendar/CalendarMonthViewport.tsx"
        issue: "The following-row destination is the bottom of the grid viewport, not the bottom above navigation with agenda between the rows."
      - path: "src/ui/__tests__/CalendarTransitions.test.tsx"
        issue: "Tests validate the pure controller but never mount the CalendarScreen bridge for a cross-month adjacent transition or assert final row/agenda geometry."
    missing:
      - "Compose the agenda between selected/following overlays across the remaining full height."
      - "Apply/re-measure the pending month/date before expanding the new adjacent week."
      - "Add a mounted cross-month normal/reduced-motion regression that asserts ordered visible state and geometry."
  - truth: "Calendar preserves vertical scrolling and exact focus movement/restoration for keyboard, expansion, collapse, and constrained layouts."
    status: failed
    reason: "The horizontal recognizer yields vertical intent, but Calendar's outer AdaptiveScreen is explicitly non-scrollable and the month viewport contains no vertical ScrollView. Date arrow handlers update selected state without focusing the destination cell; expansion does not move focus to Collapse, and collapse does not restore selected-day focus."
    artifacts:
      - path: "src/ui/screens/CalendarScreen.tsx"
        issue: "Uses scrollable={false}; expand/collapse dispatches do not perform the required focus transfers."
      - path: "src/ui/calendar/CalendarWeekRow.tsx"
        issue: "Date cells have no ref registry or focus call after arrow-key selection."
      - path: "src/ui/__tests__/CalendarTransitions.test.tsx"
        issue: "The test named 'preserves vertical scroll' only proves the pure controller returns unchanged state; it never scrolls a mounted Calendar."
    missing:
      - "A real vertical-scroll owner for landscape/200% month content."
      - "Deterministic destination-cell, Collapse, and selected-cell focus transfer with mounted tests."
deferred:
  - truth: "NV-CAL-01..09 native gesture, geometry, focus, and zero-command observations"
    addressed_in: "Phase 20 Plans 20-03 and 20-10"
    evidence: "Native matrix assigns intermediate Calendar execution to Phase 20; current fixture is native_execution=NOT_RUN and REVIEW_REQUIRED."
  - truth: "Fourteen Revision 18 native/reference/overlay/difference/mask comparisons"
    addressed_in: "Phase 20 native visual evidence plans"
    evidence: "16-REFERENCE-MAP.json defines 14 captures; no Phase 16 native Calendar artifacts exist."
  - truth: "DEV-01 Calendar geometry and non-overlapping 48dp targets on required devices/configurations"
    addressed_in: "Phase 20"
    evidence: "Owner approved adaptive-6-to-18dp; technical native evidence remains REVIEW_REQUIRED."
  - truth: "DEV-02 Calendar chip contrast/blended-fill verification in Light, Dark, and System"
    addressed_in: "Phase 20"
    evidence: "The exact Light title token exists, but Calendar-specific native comparison remains REVIEW_REQUIRED."
  - truth: "NV-PERF-07 Calendar content p95 <= 250ms over at least 100 release/profile samples"
    addressed_in: "Phase 20 Plans 20-08, 20-11, and 20-12"
    evidence: "The native matrix explicitly reserves the verdict for Phase 20."
  - truth: "NV-PERF-09 Calendar frame-work p95 <= 16.67ms over at least 100 release/profile sequences"
    addressed_in: "Phase 20 Plans 20-08, 20-11, and 20-12"
    evidence: "Phase 16 provides validator/producer source only and assigns no performance verdict."
  - truth: "Attended Samsung visual, usability, accessibility, and interaction review"
    addressed_in: "Phase 20 Plan 20-12"
    evidence: "ROADMAP Phase 20 success criterion 5 and the Phase 20 checkpoint own attended acceptance."
behavior_unverified_items:
  - truth: "CAL-11 native keyboard/D-pad focus follows civil-date arrow navigation and remains visibly distinct from selection."
    test: "On the Phase 20 identity-bound Android artifact, traverse first/middle/last weeks and a month boundary with arrows/D-pad, then activate with Enter/Space/center."
    expected: "Focus and selected date move to the same destination exactly once, the 3dp ring remains visible with required clearance, and non-gesture month controls remain reachable."
    why_human: "Host tests exercise key handlers and focus props but do not run Android focus traversal or geometry."
---

# Phase 16: Calendar Parity Verification Report

**Phase Goal:** The owner can understand and navigate real Strength and Running intent/history through the approved spatial Calendar, then inspect workout history without Calendar gaining mutation authority.

**Verified:** 2026-10-12T19:08:21Z against branch `fchoo/UX-revamp`, HEAD `968f59a6953fb66ba7e0e0d4d798159090b0abce`

**Status:** `gaps_found`

**Host verdict:** **FAILED — Phase 16 is not implementation-complete.** The real destination and read-only authority seams are present, and native evidence is honestly deferred, but source-visible defects prevent the Calendar goal from being true before Phase 20 begins.

**Re-verification:** No — initial independent verification.

## Scope and Evidence Policy

- SUMMARY claims were used only to locate files and commands. Every verdict below comes from current source, tests, or commands run by this verifier.
- Android builds, ADB, Maestro, device screenshots, visual comparison, attended review, and release/profile performance were deliberately **NOT_RUN**. They remain Phase 20-only and are not counted as Phase 16 failures.
- Existing unrelated Phase 14 edits, `.coverage`, Phase 19 work, and the concurrently-created `16-SECURITY.md` were not modified.
- No override exists and none was inferred.

## Goal Achievement

### ROADMAP Observable Truths

| # | Roadmap truth | Status | Codebase evidence |
|---:|---|---|---|
| 1 | Full-height Monday-first month, stable date/event tracks, two titled events, persistent controls, Info-before-Settings key, non-color status | ✗ FAILED — BLOCKER | Monday-first dates and fixed tracks exist, but rows do not fill the viewport (`CalendarWeekRow.tsx:144-162`), header actions stack vertically (`components/index.ts:649-663,1396-1398`), rest is absent, and chip/key status fills violate the approved encoding (`CalendarWeekRow.tsx:117-129`; `CalendarScreen.tsx:549-561`). |
| 2 | 1:1 three-panel input, inclusive 25% title/settle, cancel/retreat, velocity-independent snap-back, vertical scrolling | ✗ FAILED — BLOCKER | The controller/worklet implementation and tests prove the horizontal threshold semantics (`calendarTransitionController.ts:96-103,169-204`; `CalendarMonthViewport.tsx:193-261`), but the root is `scrollable={false}` and the month viewport has no vertical scroll owner (`CalendarScreen.tsx:371-375`; `CalendarMonthViewport.tsx:278-315`). |
| 3 | Measured selected/following-row morph, reverse collapse, ordered adjacent selection, reduced-motion equivalence | ✗ FAILED — BLOCKER | Geometry is measured, but the following row targets the bottom of a capped grid rather than the bottom above navigation, and cross-month state is applied only after the new expansion command has run against old screen state (`CalendarScreen.tsx:185-200,306-320,404-539,575`; `CalendarMonthViewport.tsx:71-80,294-305`). |
| 4 | One accessible full-width event target routes by real identity to Strength history/preview, Running plan, or Garmin detail | ✓ VERIFIED | `CalendarAgenda.tsx:98-140` owns one pressable per event; `app/(tabs)/calendar.tsx:58-87` dispatches the discriminated IDs; real route components load the exact session/occurrence/plan/activity (`app/session/[sessionId].tsx:89-100`; `app/calendar/plan/[occurrenceId].tsx:7-21`; `app/library/running/[planId].tsx:11-33`; `app/garmin/activity/[activityId].tsx:84-131`). The 4-case cross-route suite passed. |
| 5 | Back restores Calendar context/focus; source states remain truthful; mutation actions stay in management contexts | ✗ FAILED — BLOCKER | Host route tests prove retained month and trigger focus, and detail prop unions remove mutation commands. However, the source query ignores effective history lifecycle/date and converts unsupported Strength outcomes to planned, so stale/removed/rest facts are not truthful (`trainingCalendarRepository.ts:86-109,124-228` versus `historyRepository.ts:854-919`). |

**Roadmap score:** 1/5 verified.

### Plan Must-Have Resolution

| Plan | Truth | Status | Evidence / reason |
|---|---|---|---|
| 16-01.1 | Consume Phase 13 Calendar reads and Phase 15 facts presenter without recreating them | ✓ VERIFIED | `calendarPorts.ts:1-17`; runtime delegation at `workoutAppRuntime.tsx:3132-3142`. |
| 16-01.2 | Exact immutable/null-on-stale planned Strength loader | ✓ VERIFIED | Exact `Pick` plus route/screen identity validation; focused port/runtime tests pass. |
| 16-01.3 | One semantic controller owns drag/buttons/keyboard/date/focus/cancel/reduced motion | ✗ FAILED | Same-month `moveSelection` changes React date state directly (`CalendarScreen.tsx:168-171,233-244`) rather than updating the controller's selected date; focus moves are outside the controller and incomplete. |
| 16-01.4 | Inclusive 25%; retreat/cancel/fast-short snap-back; no velocity settle | ✓ VERIFIED | Pure controller and focused 100% branch test passed. |
| 16-01.5 | Approved DEV-01/DEV-02 branches are represented | ✓ VERIFIED | Inset formula at `CalendarScreen.tsx:319`; Light/Dark title tokens at `theme/index.ts:212-231`. Native proof remains deferred. |
| 16-02.1 | Monday-first full-height month and persistent controls/header actions | ✗ FAILED | Calendar rows do not expand to equal shares; Info/Settings action container is vertical. |
| 16-02.2 | Every event has correct independent sport/status encoding and complete semantic description | ✗ FAILED | IDs and labels survive, but chip/key fill patterns are wrong and Garmin source namespace is rendered raw. |
| 16-02.3 | Shared tracks plus selected/today/outside/rest/empty semantics | ✗ FAILED | Shared 28/36 tracks, selected/today/outside/empty exist; rest has no model or renderer. |
| 16-02.4 | Loading/refresh/empty/stale/retry are truthful and never invent a workout | ✗ FAILED | Request generation works, but the repository maps rest/skipped/advanced Strength rows to planned and ignores effective history lifecycle/date. |
| 16-02.5 | Incomplete native DEV evidence cannot all-pass | ✓ VERIFIED | Host fixture/verifier returns `REVIEW_REQUIRED`, `all_pass:false`. |
| 16-03.1 | Completed/partial Strength uses Active-shaped immutable facts with all rows | ✓ VERIFIED | `CalendarReadOnlyWorkout.tsx:20-95`; route/detail tests pass. |
| 16-03.2 | Calendar-origin history/preview has no mutation capability | ✓ VERIFIED | Calendar route constructs query-only branches before management props; zero-command route tests pass. |
| 16-03.3 | Planned Strength uses exact occurrence and fabricates no session/result | ✓ VERIFIED | `PlannedWorkoutDetailScreen.tsx:58-119`; route/preview tests pass. |
| 16-03.4 | Correction/revision/retry/Resume/removal remain in management contexts | ✓ VERIFIED | Management branch at `app/session/[sessionId].tsx:102-194`; correction/removed-session suites pass. |
| 16-04.1 | Three panels follow 1:1 and settle one month at inclusive 25% | ✓ VERIFIED | Worklet lines 216-251 plus controller boundary tests and 100% focused coverage. |
| 16-04.2 | Vertical intent scrolls; cancel/retreat/stale completion are safe | ✗ FAILED | Cancel/retreat/stale guards pass, but no vertical month-scroll owner exists. |
| 16-04.3 | Selected/following rows move between measured month and top/bottom positions | ✗ FAILED | Overlay exists, but its bottom is the capped grid viewport and agenda is outside the two rows. |
| 16-04.4 | Adjacent selection and reduced motion have identical ordered semantics | ✗ FAILED | Cross-month normal motion expands old screen geometry before applying the pending month/date; focus handoff is absent. |
| 16-05.1 | Agenda row contains factual title, result/target, sport/status, source, chevron | ✗ FAILED | Result/target is a hardcoded category phrase, not source data (`CalendarAgenda.tsx:44-51,98-139`). |
| 16-05.2 | All four destination discriminants and IDs survive | ✓ VERIFIED | Typed union and route tests cover session, occurrence, plan/session revision, and activity IDs. |
| 16-05.3 | Detail Back restores month/date/week/agenda/focus | ✓ VERIFIED (host) | Calendar snapshot/scroll/focus code at `CalendarScreen.tsx:255-287`; mounted route tests pass. Native focus/scroll is deferred. |
| 16-05.4 | Calendar has no nested or management mutation action | ✓ VERIFIED | One row target; no Calendar command props; zero-command digest test passes. |
| 16-06.1 | Native traces diagnose real gesture/focus behavior | ⏭ DEFERRED | `NOT_RUN`; Phase 20 owns execution. |
| 16-06.2 | Native capture set retains mapped reference/native/diff artifacts | ⏭ DEFERRED | The immutable 14-row map exists; no native Calendar artifacts exist yet. |
| 16-06.3 | Missing/stale/mismatched/unsafe evidence fails closed | ✓ VERIFIED | Evidence/comparison adversarial tests pass; no-argument verifier exits 1. |
| 16-06.4 | Incomplete DEV evidence remains REVIEW_REQUIRED/FAIL | ✓ VERIFIED | Fixture returns `REVIEW_REQUIRED`, `all_pass:false`; no native PASS is present. |
| 16-07.1 | Running/Garmin routes load real destination components and IDs | ✓ VERIFIED | Real route components are imported/mounted in `calendar-cross-destination-route.test.tsx`; suite passes. |
| 16-07.2 | Real destination Back restores Calendar and remains read-only | ✓ VERIFIED (host) | Cross-route tests assert stack Back, trigger focus, source digest stability, and zero mutation commands. |
| 16-07.3 | Final verifier rejects incomplete comparison/DEV evidence | ✓ VERIFIED | `verify-v12-native-evidence.mjs:185-220`; adversarial node tests pass. |
| 16-07.4 | Raw native diagnostics are retained without Phase 16 performance verdicts | ⏭ DEFERRED | Producer/validator source exists, but native diagnostics were not executed; Phase 20 owns collection and verdicts. |

**Plan must-have score:** 18/30 verified; 9 failed; 3 explicitly Phase 20-deferred.

## CAL-01..CAL-23 Coverage

| Requirement | Status | Evidence |
|---|---|---|
| CAL-01 | ✗ FAILED — BLOCKER | Monday-first grid and controls exist, but rows do not fill/equally divide the available height. |
| CAL-02 | ✗ FAILED — BLOCKER | Modal-only key exists; shared header action container stacks Info and Settings vertically rather than Info immediately left of Settings. |
| CAL-03 | ✗ FAILED — BLOCKER | Sport borders/text exist; complete/partial fills and key samples do not implement the required sport-tinted and neutral half-fill semantics. |
| CAL-04 | ✓ VERIFIED (host) | Shared renderer has 28dp date and 36dp event tracks and supplies measured row geometry. Native continuity remains Phase 20. |
| CAL-05 | ✓ VERIFIED | Two visual titles plus `+N`; accessibility label enumerates every full event name/sport/status/source. |
| CAL-06 | ✗ FAILED — BLOCKER | Selected/today/outside/empty exist; rest is neither modeled nor rendered and consumed rest rows fall through as planned workouts. |
| CAL-07 | ✗ FAILED — BLOCKER | Three-panel 1:1 horizontal motion exists; vertical intent is yielded to a non-scrollable month container. |
| CAL-08 | ✓ VERIFIED | Inclusive boundary, retreat, cancel, and velocity-independent short-drag behavior pass focused tests. |
| CAL-09 | ✓ VERIFIED | 240ms `.22/.8/.3/1` command and epoch-fenced completion pass focused tests. |
| CAL-10 | ✓ VERIFIED | Previous/Today/Next remain mounted in both modes; civil month clamping tests pass. |
| CAL-11 | ⚠ REVIEW_REQUIRED — PHASE 20 | Focusable controls, 3dp ring, arrow handlers, and non-gesture controls exist, but actual Android D-pad focus movement/visibility is unexecuted. |
| CAL-12 | ✗ FAILED — BLOCKER | Agenda is outside the selected/following-row viewport; following row is not bottom-flush above navigation. |
| CAL-13 | ✗ FAILED — BLOCKER | Measured reverse animation exists, but collapse does not explicitly restore selected-day focus. |
| CAL-14 | ✗ FAILED — BLOCKER | Cross-month normal motion expands using old month/date geometry before applying pending state. |
| CAL-15 | ✗ FAILED — BLOCKER | Reduced-motion final state differs from the defective normal cross-month wiring; semantic equivalence is not established. |
| CAL-16 | ✗ FAILED — BLOCKER | One full-width target exists, but result/target text is generic rather than source-backed. |
| CAL-17 | ✓ VERIFIED (host) | Real Strength, Running-plan, and Garmin detail routes load by durable IDs; route suite passes. |
| CAL-18 | ✓ VERIFIED | Active-shaped completed/partial facts, disclosures, all set rows, and command-free Calendar props are present and tested. |
| CAL-19 | ✓ VERIFIED | Exact immutable occurrence loader; planned preview has targets, zero completed sets, no session fabrication. |
| CAL-20 | ✓ VERIFIED (host) | Retained month/date/focused mode, agenda offset, event ID, and row focus are wired; mounted route tests cover month and trigger focus. Native proof is Phase 20. |
| CAL-21 | ✗ FAILED — BLOCKER | UI loading/error/retry generation is sound, but the backing projection can publish inactive/voided/rest/skipped facts incorrectly and can show a last-good grid under a different month title. |
| CAL-22 | ✓ VERIFIED | Calendar has no correction/revision/save command; management correction tests pass. |
| CAL-23 | ✓ VERIFIED | Calendar has no Resume/remove command; separate management removal tests pass. The stale removed-event projection defect is captured under CAL-21. |

**Requirement score:** 11/23 verified; 11 failed; 1 Phase 20 review-required.

## Required Artifacts

| Artifact group | L1 Exists | L2 Substantive | L3 Wired | L4 Data flow | Status |
|---|---:|---:|---:|---:|---|
| Four-root tabs and Calendar route (`app/(tabs)/_layout.tsx`, `calendar.tsx`) | Yes | Yes | Yes | Query prop wired | ✓ VERIFIED |
| Calendar read port/runtime bridge | Yes | Yes | Yes | Real repository delegate | ✓ VERIFIED |
| `trainingCalendarRepository.ts` | Yes | Yes | Yes | Real SQLite queries | ✗ FAILED — authoritative lifecycle/outcome semantics incomplete |
| `CalendarScreen` / `CalendarWeekRow` / `CalendarMonthViewport` | Yes | Yes | Yes | Real range events render | ✗ FAILED — layout, rest/status, scroll, focus, and cross-month defects |
| `CalendarAgenda.tsx` | Yes | Yes | Yes | Real event IDs flow | ✗ FAILED — factual result/target absent |
| Strength history and planned-preview routes | Yes | Yes | Yes | Exact source loaders | ✓ VERIFIED |
| Running and Garmin destination routes | Yes | Yes | Yes | Real route screens/loaders | ✓ VERIFIED (host) |
| Evidence verifier/comparator/diagnostic source | Yes | Yes | Yes | Host fixture only | ✓ VERIFIED fail-closed; native outputs deferred |

The generic `verify.artifacts` helper reported false “missing export” results for several TypeScript files because PLAN frontmatter uses YAML list syntax. Manual source inspection confirms the exports exist. Likewise, two regex-based key-link misses were cleared manually: `app/session/[sessionId].tsx:39-100` performs the Calendar origin branch, and `CalendarMonthViewport.tsx:133-178,231-259` schedules transition callbacks through `scheduleOnRN`.

## Key Link and Data-Flow Verification

| From | To | Status | Details |
|---|---|---|---|
| Four-root tabs | Calendar route | ✓ WIRED | Exactly Workout, Calendar, Library, Progress are registered at `app/(tabs)/_layout.tsx:167-187`; bottom tab position is fixed at lines 139,173. |
| Calendar route | runtime range read | ✓ WIRED | `app/(tabs)/calendar.tsx:110-126` passes `runtime.loadCalendarRange`. |
| Runtime | training Calendar repository | ✓ FLOWING | `workoutAppRuntime.tsx:3132-3142` delegates to the foundation port; repository performs three bounded SQLite reads. Semantic filtering is defective as noted above. |
| Calendar screen | month/week/agenda | ✓ WIRED | `CalendarScreen.tsx:404-539` uses the shared row, viewport, and agenda components. |
| Gesture worklet | semantic controller | ✓ WIRED | UI-thread pointer values cross to React only through bounded callbacks; controller tests pass. |
| Agenda event | real destination route | ✓ WIRED | Exhaustive discriminated switch in `app/(tabs)/calendar.tsx:58-87`; real destination route test passes. |
| Calendar session route | immutable workout presenter | ✓ FLOWING | Query-only `getSessionDetail` branch renders `CalendarReadOnlyWorkout`, which adapts to `WorkoutSessionPresentation`. |
| Planned Strength route | exact occurrence loader | ✓ FLOWING | Exact route scalar is passed to `loadPlannedStrengthOccurrence`; mismatches/mutable results fail closed. |
| Evidence fixture | final verifier | ✓ FAIL-CLOSED | Independent command returned `status=REVIEW_REQUIRED`, `all_pass=false`; invoking the verifier without a live manifest exited 1. |

## Behavioral Spot-Checks

| Check | Result | Status |
|---|---|---|
| 9 Calendar/detail/cross-route component suites | 46/46 tests passed | ✓ PASS |
| Root-shell four-root/settings integration | 2/2 tests passed | ✓ PASS |
| Correction and removed-session management suites | 20/20 tests passed | ✓ PASS |
| Calendar port component suite | 2/2 tests passed | ✓ PASS |
| Calendar civil/history/control unit suites | 51/51 tests passed | ✓ PASS |
| Workout runtime unit suite | 57/57 tests passed | ✓ PASS |
| Training Calendar repository host suite | 4/4 tests passed | ✓ PASS, but fixture-only lifecycle coverage is insufficient |
| Evidence/comparison node suites | 12/12 tests passed | ✓ PASS |
| Transition controller focused coverage | 100% statements/branches/functions/lines | ✓ PASS |
| Phase 16 control focused coverage | 100% statements/branches/functions/lines | ✓ PASS |
| TypeScript | `npm run typecheck` exit 0 | ✓ PASS |
| Boundary check | `npm run check:boundaries` exit 0 across 422 files | ✓ PASS |
| Host evidence fixture | `REVIEW_REQUIRED`, `all_pass:false`, 9 native cases, 8 route journeys, 14 comparisons | ✓ PASS (correct non-closure) |
| Live evidence verifier without manifest | exits 1: `v12_calendar_evidence_argument_invalid` | ✓ PASS (fail-closed) |

Unique targeted test count: **194 passed, 0 failed**. No full workspace run was needed; no server, Android build, emulator, device, or external service was started.

## Test Quality Audit

| Test area | Active / skipped | Strongest assertion | Verdict |
|---|---:|---|---|
| `CalendarTransitions.test.tsx` | 9 / 0 | Behavioral pure-state transitions | PASS for controller only; cannot prove native layout/scroll. |
| `CalendarScreen.test.tsx` | 6 / 0 | Mounted component state and route callback | INSUFFICIENT for rest, chip fills, row geometry, cross-month adjacent flow, focus transfer, and vertical scrolling. |
| `trainingCalendarRepository.test.ts` | 4 / 0 | Value assertions over mocked query rows | **INSUFFICIENT / fixture-only reliance**: no real schema, schedule lifecycle, rest/skipped outcome, correction overlay, or voided history case. |
| Cross-destination route tests | 4 / 0 | Multi-route mounted workflow with mocked router/loaders | PASS for host route/authority; native focus/stack behavior remains Phase 20. |
| Evidence/comparison tests | 12 / 0 | Adversarial rejection/value checks | PASS for fail-closed host contract; intentionally no native PASS. |

- Disabled requirement tests: **0**.
- Circular expected-value generation: **0**. Temporary file writes in the evidence tests exercise path/hash rejection and do not generate a passing oracle from product output.
- Misleading test name: `CalendarTransitions.test.tsx:73-79` says it “preserves vertical scroll,” but only asserts that the pure controller ignores a vertical gesture; it never mounts a scroll container.
- The phase validation ledger is stale: `16-VALIDATION.md` remains `status: draft`, `nyquist_compliant: false`, `wave_0_complete: false`, with all task rows pending. This is traceability debt, not the basis for the implementation failures above.

## Probe Execution

No `probe-*.sh` is declared by the Phase 16 plans/summaries and no conventional Phase 16 probe exists. Probe execution: **SKIPPED (no probe contract)**.

## Phase 20 Deferred — Explicitly Not Phase 16 Failures

| Evidence row | Phase 16 state | Required Phase 20 action | Status |
|---|---|---|---|
| NV-CAL-01..09 | Host controller/routes exist; no native trace artifacts | Execute the full intermediate gesture/geometry/focus/authority matrix on one identity-bound Android artifact | `NOT_RUN` / `REVIEW_REQUIRED` |
| 14 Revision 18 comparison captures | Immutable map exists; host synthetic comparator only | Capture native pixels and retain reference/native/overlay/difference/mask/record hashes | `NOT_RUN` / `REVIEW_REQUIRED` |
| DEV-01 | Adaptive formula exists in source | Measure 360/390 safe-width insets and non-overlapping 48dp targets across required configurations | `REVIEW_REQUIRED` |
| DEV-02 | `#9B470B` Light title and `#D97820` sport role exist | Measure Calendar-specific complete/partial/planned blended-fill contrast in Light/Dark/System | `REVIEW_REQUIRED` |
| NV-PERF-07 | Diagnostic producer/validator source exists | Collect at least 100 release/profile source-backed Calendar samples and decide p95 ≤250ms | `NOT_RUN` / `REVIEW_REQUIRED` |
| NV-PERF-09 | Diagnostic producer/validator source exists | Collect at least 100 complete release/profile drag/expand/collapse sequences and decide p95 ≤16.67ms | `NOT_RUN` / `REVIEW_REQUIRED` |
| Attended Samsung review | No observation claimed | Record Phase 20 visual/usability/accessibility/interaction observations against the unchanged artifact | `NOT_RUN` / `REVIEW_REQUIRED` |

The handoff is correctly fail-closed: `scripts/fixtures/v12-calendar-evidence/complete.json:4-8,34-42,55-56,79-82` remains host-only, `NOT_RUN`, and `REVIEW_REQUIRED`; `verify-v12-native-evidence.mjs:185-220` cannot derive PASS from those rows. The present Maestro file is only a stage registry—many named threshold/morph stages share generic commands—so it must not be mistaken for executed or complete native proof. Phase 20 Plans 20-03 and 20-10 explicitly own the executable Calendar contract/shard and native run.

## Decision Coverage

The automated decision-coverage helper returned a non-blocking parse warning (`could-not-parse`, 0/0). Manual review found:

| Decision | Result |
|---|---|
| D16-01 | FAILED in full-height/action ordering; modal-only key and Monday-first ordering exist. |
| D16-02 | FAILED in exact status fill/pattern implementation; sport text/borders exist. |
| D16-03 | FAILED because rest is absent and focused layout is incorrect; fixed tracks/titles exist. |
| D16-04 | FAILED as a whole because vertical scroll is absent; 1:1/25%/cancel behavior is implemented. |
| D16-05 | FAILED because the focused composition does not place the following row bottom-flush around the agenda. |
| D16-06 | FAILED for normal-motion cross-month adjacency; reduced-motion final-state logic exists. |
| D16-07 | VERIFIED for one-target real destination routing; factual agenda result/target is incomplete. |
| D16-08 | VERIFIED for host read-only authority and detail-return focus; intra-Calendar collapse focus remains a gap. |
| DEV-01 | Source branch present; native evidence deferred to Phase 20. |
| DEV-02 | Source token present; Calendar-specific native evidence deferred to Phase 20. |

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|---|---|---|---|
| `trainingCalendarRepository.test.ts` | Fixture-only source preconditions | 🛑 BLOCKER | Tests pass with mocked rows that do not enforce the real state/lifecycle schema, hiding rest/void/correction defects. |
| `CalendarTransitions.test.tsx` | Assertion scope narrower than test title | ⚠ WARNING | “Preserves vertical scroll” proves only non-claim by the state reducer. |
| `CalendarScreen.test.tsx` | Missing negative/layout cases | ⚠ WARNING | Green tests do not exercise the failing full-height, status-fill, rest, cross-month, or focus paths. |
| `maestro/v1.2/calendar.yaml` | Stage-label coverage without stage-specific execution | ⚠ WARNING / PHASE 20 | Multiple 10/24.9/25/25.1/release/retreat stages share one generic swipe; row stages use an optional viewport tap. This cannot be treated as native evidence. |

No unreferenced `TBD`, `FIXME`, or `XXX` markers and no skipped requirement-linked tests were found.

## Gaps Summary

Phase 16 has substantive implementation and strong host coverage around the pure 25% transition controller, immutable route identities, real destination screens, read-only capability separation, and fail-closed evidence status. The phase goal is nevertheless not achieved because the displayed Calendar can misrepresent authoritative data, misses required status/rest semantics, does not implement the approved full-height focused composition, mishandles cross-month adjacent expansion, and lacks the required scroll/focus wiring.

These are Phase 16 source defects, not Phase 20 evidence gaps. Fix them and add focused regressions before using Phase 20 native acceptance to validate geometry, device focus, visual fidelity, and performance.

---

_Verified: 2026-10-12T19:08:21Z_
_Verifier: TRAE (independent gsd-verifier)_
