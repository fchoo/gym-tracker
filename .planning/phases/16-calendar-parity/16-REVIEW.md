---
phase: 16-calendar-parity
reviewed: 2026-10-12T19:11:25Z
depth: deep
files_reviewed: 46
files_reviewed_list:
  - app/(tabs)/__tests__/calendar.test.tsx
  - app/(tabs)/calendar.tsx
  - app/__tests__/calendar-cross-destination-route.test.tsx
  - app/__tests__/calendar-plan-route.test.tsx
  - app/__tests__/garmin-activity-route.test.tsx
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
  - scripts/run-coverage-gate.mjs
  - scripts/run-v12-maestro.mjs
  - scripts/v12-calendar-comparison.test.mjs
  - scripts/v12-evidence-scripts.test.mjs
  - scripts/verify-v12-native-evidence.mjs
  - src/bootstrap/phase16CalendarTestControls.test.ts
  - src/bootstrap/phase16CalendarTestControls.ts
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/history/calendar.test.ts
  - src/domains/history/calendar.ts
  - src/domains/scheduling/localDate.test.ts
  - src/domains/scheduling/localDate.ts
  - src/platform/sqlite/repositories/trainingCalendarRepository.ts
  - src/ui/__tests__/CalendarScreen.test.tsx
  - src/ui/__tests__/CalendarTransitions.test.tsx
  - src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx
  - src/ui/__tests__/SessionDetailScreen.test.tsx
  - src/ui/calendar/CalendarAgenda.tsx
  - src/ui/calendar/CalendarMonthViewport.tsx
  - src/ui/calendar/CalendarReadOnlyWorkout.tsx
  - src/ui/calendar/CalendarWeekRow.tsx
  - src/ui/calendar/calendarPorts.test.ts
  - src/ui/calendar/calendarPorts.ts
  - src/ui/calendar/calendarTransitionController.ts
  - src/ui/screens/CalendarScreen.tsx
  - src/ui/screens/ImportedActivityDetailScreen.tsx
  - src/ui/screens/PlannedWorkoutDetailScreen.tsx
  - src/ui/screens/RunningPlanDetailScreen.tsx
  - tests/sqlite-host/trainingCalendarRepository.test.ts
findings:
  critical: 14
  warning: 11
  info: 0
  total: 25
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-12T19:11:25Z
**Depth:** deep
**Files Reviewed:** 46
**Status:** issues_found

## Summary

Phase 16 is not shippable. The deep review found 14 BLOCKER findings and 11 WARNING findings across Calendar authority boundaries, durable route identity, source-fact completeness, accessibility, transition races, privacy, native diagnostic producers, evidence validation, and integrity-critical coverage.

The review used the owner decisions, owner brief, source-precedence contract, all Plans 16-01 through 16-07 and their threat models, the Phase 16 UI-SPEC, the repository engineering invariants, the seven summaries, and the actual Phase 16 merge diffs. Unrelated Phase 19 work and the preserved dirty Phase 14 evidence were excluded. Phase 20-owned native and physical-device execution remains deferred and is not a finding; the evidence findings below concern Phase 16 source that would mis-drive, misclassify, leak, overwrite, or reject that future evidence.

Focused verification passed 9 component suites / 54 tests, 4 unit suites / 108 tests, 1 SQLite-host suite / 4 tests, 12 evidence tests, TypeScript, and the 422-file boundary check. Those passes do not cover the defects below. Exact integrity gates independently failed for localDate.ts and trainingCalendarRepository.ts, and direct Node coverage showed the four Phase 16 evidence scripts at only 76.70% branches.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Calendar-origin routes still acquire mutation-capable runtimes

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** app/(tabs)/calendar.tsx:46; app/session/[sessionId].tsx:95; app/calendar/plan/[occurrenceId].tsx:14; app/library/running/[planId].tsx:12-13; app/garmin/activity/[activityId].tsx:90
**Issue:** The threat model requires a structurally query-only Calendar capability, but every Calendar-origin route first obtains a full runtime containing workout completion, history removal/correction/resume, Running lifecycle/collision, Garmin match, and revision commands. Passing one read method to a child does not remove the authority already held by the route. The CalendarReadPort type test therefore proves only an unused alias, not the production capability boundary.
**Exact evidence:** CalendarRoute assigns useWorkoutAppRuntime() at line 46; SessionDetailRoute does the same before testing origin at lines 95-99; RunningPlanDetailRoute constructs both full runtimes before its Calendar branch; ImportedActivityDetailRoute constructs the full workout runtime at line 90.
**Fix:** Add origin-specific providers/hooks that return frozen narrow read ports, and split route components so the Calendar child can import only those hooks. Keep mutation hooks exclusively inside separately mounted management-origin components. Add compile-time forbidden-member tests against the production route adapters, not a standalone Pick alias.

### CR-02: Untrusted origin parameters fail open to management authority

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** app/session/[sessionId].tsx:35-41; app/library/running/[planId].tsx:7-24; app/garmin/activity/[activityId].tsx:43-63; src/ui/screens/ImportedActivityDetailScreen.tsx:507-528
**Issue:** Only the exact string calendar selects read-only mode. Array, malformed, and unknown origin values fall through to management in the session and Running routes. Garmin is worse: parseGarminRootOrigin normalizes every unknown value to workout before validRouteContext runs, so an invalid origin can expose Match and revision actions. ImportedActivityDetailScreen also omits mode from the useMemo dependency list, so a reused screen can retain management actions after changing to Calendar mode.
**Fix:** Parse raw route parameters with a strict discriminated parser that returns invalid for arrays and unknown values. Permit management only for an explicitly accepted management origin (or an intentional absent-origin route contract), render a missing/error state for invalid input, and include mode in the detail-screen memo dependencies.

### CR-03: Planned Running drops the durable session revision identity

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** app/(tabs)/calendar.tsx:72-78; app/library/running/[planId].tsx:14-32; app/__tests__/calendar-cross-destination-route.test.tsx:303-317
**Issue:** Calendar correctly passes both planId and sessionId, but RunningPlanDetailRoute does not read sessionId and loads only the current plan aggregate. A stale or mismatched scheduled revision therefore opens the current plan instead of a source-backed missing state or the intended scheduled session. The “real route” test supplies sessionId but asserts only loadPlan(planId), masking the stale-identity defect.
**Fix:** Parse and validate both identifiers, load the exact session revision under the stated plan, and fail closed if plan/session membership or revision is stale. Render or focus the exact planned Running session. Extend the route test to assert the loader receives both IDs and rejects a mismatched revision.

### CR-04: Calendar agenda and rest behavior are placeholder-only

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** src/platform/sqlite/repositories/trainingCalendarRepository.ts:10-36; src/ui/calendar/CalendarAgenda.tsx:44-84
**Issue:** The source range exposes no result/target summary and no day-kind/rest fact. CalendarAgenda consequently renders hardcoded placeholders such as Completed result, Partial result, and Planned target instead of the required source-backed one-line fact. Every zero-event date is rendered as No workout, so a planned rest day is indistinguishable from a truly empty date and can never show the locked Recovery is the plan state.
**Fix:** Extend the existing bounded SQLite projection with a typed, validated display summary and explicit day kind (event/rest/empty), sourced from authoritative plan/session/import facts. Render those values verbatim and cover rest versus empty with real SQLite contract tests. Do not infer either value from status strings in the UI.

### CR-05: Internal Garmin account namespaces leak into UI, accessibility, and screenshots

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** src/platform/sqlite/repositories/trainingCalendarRepository.ts:204-216; src/ui/calendar/CalendarAgenda.tsx:98-137; tests/sqlite-host/trainingCalendarRepository.test.ts:35-73
**Issue:** Imported events copy the database source field directly into sourceLabel. Production stores that field as garmin_connect_account:<account_namespace>; the repository test explicitly expects garmin_connect_account:owner-a. Calendar then renders and speaks this raw identifier, leaking an internal owner/account namespace into the UI and any visual/accessibility evidence.
**Fix:** Project a fixed user-facing provider label such as Garmin while retaining source/account identity only in non-presentational typed fields. Add negative assertions that UI strings, accessibility labels, screenshots, traces, and evidence JSON contain neither source_kind nor account_namespace.

### CR-06: A second drag can strand Calendar permanently in settling

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** src/ui/calendar/CalendarMonthViewport.tsx:133-150; src/ui/calendar/CalendarMonthViewport.tsx:193-260; src/ui/calendar/calendarTransitionController.ts:193-205
**Issue:** While a month settle is active, a second pan is still enabled. Its onBegin increments completionEpoch and cancels pointerX, invalidating the only completion callback. The pure controller correctly ignores the second release because phase is settling, but onFinalize skips cancellation after released becomes true. No callback returns the controller to idle, leaving Calendar stuck and navigation disabled.
**Fix:** Mirror the controller phase into a UI-thread settle latch. Fail a new gesture without cancelling the current animation while non-idle, or explicitly dispatch an epoch-fenced cancel that returns both UI and semantic state to one stable panel. Add a viewport-level test that begins a real second gesture during withTiming and proves the original settle completes exactly once.

### CR-07: 200% text and constrained-height layouts clip Calendar content with no scroll escape

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** src/ui/calendar/CalendarWeekRow.tsx:108-161; src/ui/screens/CalendarScreen.tsx:371-426
**Issue:** Date and event tracks are fixed to 28, 17, and 36dp while text scaling remains enabled, and the root AdaptiveScreen is explicitly non-scrollable. At 200% text or short landscape height, event titles and dates clip inside fixed-height containers and the month region cannot scroll, violating the owner’s required 200% text/landscape accessibility contract.
**Fix:** Use font-scale-aware minimum heights (not fixed heights), measure scaled content, and provide a vertical scroll owner for the month/focused region while composing the horizontal gesture with it. Add component tests with fontScale 2 and short landscape dimensions that prove all actions and full semantic labels remain reachable.

### CR-08: Android diagnostic controls cannot receive the Maestro stage

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** app/(tabs)/calendar.tsx:47-49; maestro/v1.2/calendar.yaml:6-8; src/bootstrap/phase16CalendarTestControls.ts:87-99
**Issue:** Maestro supplies phase16CalendarStage through an Expo Router deep link, but CalendarRoute reads browser globalThis.location instead of useLocalSearchParams. React Native Android does not populate browser location from Expo Router navigation, so phase16Stage remains undefined and the exact identity gate always disables the recorder.
**Fix:** Read the scalar route parameter through Expo Router, reject arrays/unknown stages, and pass it to the gated controls. Add a route test that drives the actual deep-link parameter seam and proves production identity remains disabled.

### CR-09: The native diagnostic producers do not exercise or emit the claimed evidence

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** maestro/v1.2/calendar.yaml:9-34; src/ui/calendar/CalendarMonthViewport.tsx:221-231; scripts/compare-v12-calendar.mjs:35-42; scripts/benchmark-v12-interactions.mjs:194-225
**Issue:** All 10%, 24.9%, 25%, 25.1%, release, retreat, rapid, rotation, and background forward stages execute the same 50%-to-25% swipe. All week-row variants tap the optional viewport rather than a deterministic date. No rotation/background operation exists. Drag traces also set semanticMonth equal to titleMonth at preview threshold, while the product contract says only the title previews and semantic selection stays current until release; the comparator incorrectly enforces equality. Finally, the benchmark waits for GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_RESULT, but no app source parses phase16CalendarDiagnostics or emits that marker. These commands cannot produce truthful stage-specific or performance evidence when Phase 20 invokes them.
**Fix:** Implement one deterministic action and assertion per stage, address concrete date/test IDs, perform real rotate/background/cancel actions, keep preview title and committed semantic month separate, expose a bounded trace export, and implement the gated in-app diagnostics producer/marker consumed by the benchmark. Tests must validate behavior, not merely that stage names occur in source text.

### CR-10: The reference-map validator permits an incomplete matrix to reach PASS

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** scripts/compare-v12-calendar.mjs:46-74; scripts/verify-v12-native-evidence.mjs:164-183
**Issue:** assertLedger requires only one Light row, one Dark row, one keyboard-or-D-pad row, and one reduced-motion row. The checked map therefore validates with only widths 360/390, portrait orientation, and touch/keyboard inputs: no 600/840 widths, landscape, D-pad, or the required loading/refresh/empty/rest/error/overflow state matrix. validateComparison derives PASS solely from whatever IDs happen to be in that incomplete map, so Phase 20 can produce all_pass without verifying the owner-required matrix.
**Exact evidence:** Direct validation returned valid:true with widths [390,360], orientations [portrait], inputs [touch,keyboard], and 14 captures.
**Fix:** Define a source-owned exact case registry covering every required theme, OS scheme, width, orientation, font scale, motion mode, input mode, state, and route. Require an exact cross-product/case set and bind every map entry to a known registry ID before PASS is possible.

### CR-11: The final verifier rejects every legitimate live PASS comparison

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** scripts/compare-v12-calendar.mjs:132-136; scripts/verify-v12-native-evidence.mjs:290-310
**Issue:** validateV12CalendarComparison accepts only the host precursor envelope REVIEW_REQUIRED + NOT_RUN + phase20_deferred. The live verifier first accepts EXECUTED/PASS evidence, then loads its comparison artifact and calls that host-only validator, which necessarily throws v12_calendar_result_invalid. A complete Phase 20 run can never pass the CLI that is supposed to verify it.
**Fix:** Version a shared comparison schema supporting both host-deferred and live-executed modes. In live mode require EXECUTED, derive PASS/FAIL/REVIEW_REQUIRED from constituent records, bind it to the same manifest/run identity, and verify all referenced bytes. Add an end-to-end CLI test that writes a complete live artifact set and invokes executeV12CalendarEvidenceVerifier.

### CR-12: Evidence privacy validation accepts workout names and durable activity IDs

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** scripts/verify-v12-native-evidence.mjs:65-80; scripts/benchmark-v12-interactions.mjs:38-52
**Issue:** The recursive privacy scanner rejects only a short keyword list. Personal workout titles, plan names, local dates, activity IDs, account namespaces, and route identities pass. A direct adversarial check added workout_name: Alice private rehab session and activity_id: garmin-owner-real-id-123 to a route journey; validateV12CalendarEvidence still returned a valid REVIEW_REQUIRED result. Live evidence can therefore retain personal workout data despite the deterministic-synthetic privacy contract.
**Fix:** Validate evidence against strict allowlisted schemas and synthetic fixture IDs rather than a keyword denylist. Reject unknown fields and any raw product strings/identifiers; permit only hashes, bounded counts, enums, geometry, timings, and approved synthetic labels. Add adversarial cases for every sensitive identifier class.

### CR-13: Comparison records lose descriptors and existing evidence can be overwritten

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** scripts/compare-v12-calendar.mjs:13-14; scripts/compare-v12-calendar.mjs:77-80; scripts/compare-v12-calendar.mjs:100-128
**Issue:** canonical uses a top-level replacer-key array. Nested artifact objects therefore serialize as empty objects; a direct reproduction produced reference:{} and native:{} instead of their path/hash descriptors. artifact and output-directory writes also use default overwrite semantics, so rerunning into an existing run directory silently replaces supposedly immutable evidence.
**Fix:** Use a recursive stable JSON serializer that preserves every nested key. Create a unique immutable run directory, fail if it exists, and write every artifact with exclusive creation. Parse and rehash each persisted comparison record in tests so in-memory objects cannot hide malformed on-disk bytes.

### CR-14: Phase 16 leaves registered integrity-critical files below 100%

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** scripts/run-coverage-gate.mjs:147-156; scripts/run-coverage-gate.mjs:238-245; src/domains/scheduling/localDate.test.ts:26-127; tests/sqlite-host/trainingCalendarRepository.test.ts:6-178
**Issue:** localDate.ts and trainingCalendarRepository.ts are both in the integrity-critical registry and were modified by Phase 16. Their exact focused gates fail: localDate.ts is 97.56% statements, 91.48% branches, 97.53% lines; trainingCalendarRepository.ts is 92.59% statements and 89.85% branches. The repository suite also mocks queryAll instead of executing the new SQL against real SQLite, so SQL semantics are not proven.
**Fix:** Add all missing month-count/range, malformed title/source/status, imported JSON, Running filtering, and ordering branches; use a real temporary SQLite schema/fixture for repository SQL. Keep the files in the integrity registry and require statements/branches/functions/lines all equal 100 before Phase 16 can close.

## Warnings

### WR-01: Event status visuals contradict the locked sport/status encoding

**Classification:** WARNING
**Confidence:** 10/10
**File:** src/ui/calendar/CalendarWeekRow.tsx:117-160
**Issue:** Complete events use green fill and partial events use solid yellow fill. The contract requires the current sport’s tint, a half-filled partial pattern, and neutral status meaning independent of sport. Imported/matched events also fall into the complete visual branch while agenda/accessibility call them Imported/Matched, statuses absent from the Calendar key.
**Fix:** Model activity source/match state separately from the three visual statuses. Render sport-tinted complete/partial/planned treatments, implement an actual half-fill for partial, and keep the key, agenda text, day label, and chip semantics consistent.

### WR-02: Final sorting destroys source-defined same-day order

**Classification:** WARNING
**Confidence:** 10/10
**File:** src/platform/sqlite/repositories/trainingCalendarRepository.ts:195-226
**Issue:** SQL orders Running rows by slot_id and imported rows by started_at_ms, but the final array is re-sorted by source and opaque event ID. This discards within-source schedule/chronological order even though the UI claims to preserve Phase 13 source order.
**Fix:** Carry an explicit source-order key (slot ordinal/start time/query index) and perform one stable merge, or preserve each query’s established order while grouping dates. Assert exact output order rather than arrayContaining in the repository test.

### WR-03: Return focus races the authoritative refresh and can focus a removed row

**Classification:** WARNING
**Confidence:** 10/10
**File:** src/ui/screens/CalendarScreen.tsx:255-287
**Issue:** Return handling starts a refresh and immediately schedules focus on the old row map in the next animation frame. If the event was removed while detail was open, the stale row is focused before the query resolves, then unmounts; focus is lost. The fallback is the Collapse control, not the selected date required by the contract.
**Fix:** Wait for the matching refresh generation and post-layout membership check before restoring scroll/focus. Focus the returned event only if it remains in the authoritative selected-date range; otherwise focus the selected date cell and announce the missing refresh state.

### WR-04: Session read failures are misreported as missing with no retry

**Classification:** WARNING
**Confidence:** 10/10
**File:** app/session/[sessionId].tsx:60-86
**Issue:** Every getSessionDetail rejection sets missing=true. Offline, SQLite, corruption, and transient projection errors therefore show “removed or changed” and offer only Back, contrary the required source-backed error/retry state.
**Fix:** Preserve distinct loading, missing, and retryable-error results at the read-port boundary. Only a typed not-found result should show unavailable; retain the exact session ID for Retry on other failures.

### WR-05: Planned Strength accepts unknown targets and can publish stale loads

**Classification:** WARNING
**Confidence:** 10/10
**File:** src/ui/screens/PlannedWorkoutDetailScreen.tsx:11-80
**Issue:** Any JSON object with a string profile passes hasTargets and renders the placeholder Planned target, including malformed or unsupported profiles. Supported project profiles such as added-load, assisted, fixed-distance, fixed-time, intervals, and unscored are not formatted. The async load also has no mounted/request-generation guard, so a late result for a previous occurrence can overwrite a newer route.
**Fix:** Parse with the canonical workout target schema and reuse the exhaustive target presenter. Reject unknown/invalid profiles. Add an epoch or effect cleanup guard keyed by occurrenceId and retry generation before publishing ready/missing/error.

### WR-06: Layout-generation fencing is declared but not implemented

**Classification:** WARNING
**Confidence:** 10/10
**Files:** src/ui/screens/CalendarScreen.tsx:289-318; src/ui/calendar/CalendarMonthViewport.tsx:152-178
**Issue:** week geometry stores generation: layoutGeneration.current, but that ref is never incremented or checked. Rotation/font/background can therefore start from stale coordinates. If either geometry is missing, the viewport calls onComplete and advances semantic focus instead of cancelling/re-measuring as the threat model requires.
**Fix:** Increment layout generation on every viewport/font/orientation invalidation, clear or reject older measurements, and resume only after both current-generation rows are measured. Missing geometry must cancel/re-measure, not complete the transition.

### WR-07: Month rows do not fill the viewport and agenda timing fields are unused

**Classification:** WARNING
**Confidence:** 10/10
**Files:** src/ui/calendar/CalendarWeekRow.tsx:144-162; src/ui/calendar/CalendarMonthViewport.tsx:58-80; src/ui/screens/CalendarScreen.tsx:504-540
**Issue:** Month rows have no vertical flex/equal-share layout, so four/five/six rows retain natural content height rather than filling the area above navigation. settle-week carries agenda delay/duration, but only row progress is animated; CalendarScreen mounts/unmounts the agenda immediately when mode changes, so the required delayed reveal/fade never occurs.
**Fix:** Place rows in an equal-share month container using measured row heights/minimums, and drive agenda opacity/mount timing from the same epoch-fenced command while preserving immediate factual state for reduced motion.

### WR-08: Custom keyboard handlers suppress required activation/focus behavior

**Classification:** WARNING
**Confidence:** 9/10
**Files:** src/ui/screens/CalendarScreen.tsx:506-520; src/ui/calendar/CalendarReadOnlyWorkout.tsx:35-49
**Issue:** Supplying onKeyDown replaces FocusablePressable’s default Enter/Space activation. The Collapse control handles only Escape, so keyboard activation is lost. CalendarReadOnlyWorkout also never requests initial focus on Back despite the locked detail-focus contract.
**Fix:** Delegate unhandled keys to the shared activation helper or explicitly handle Enter, Space, and Select as onPress. Give the read-only route a Back ref and focus it after mount/layout, with a component regression for hardware keyboard/D-pad behavior.

### WR-09: Today becomes stale when Calendar remains mounted across midnight

**Classification:** WARNING
**Confidence:** 9/10
**File:** app/(tabs)/calendar.tsx:50-57
**Issue:** The local date is computed during render with no midnight or AppState refresh. If Calendar remains mounted overnight without another state update, Today continues selecting yesterday, violating “today’s actual local date.”
**Fix:** Use the shared clock/local-civil-date hook and schedule the next local-midnight update; refresh on foreground/timezone change and test the midnight boundary with a fake clock.

### WR-10: DEV-01/DEV-02 technical FAIL is an impossible evidence state

**Classification:** WARNING
**Confidence:** 10/10
**File:** scripts/verify-v12-native-evidence.mjs:144-157
**Issue:** ALLOWED_RESULTS includes FAIL, but validateDeviations rejects FAIL whether evidence_complete is false (only REVIEW_REQUIRED allowed) or true (only PASS + accepted_deviation allowed). The derived FAIL branch for deviations is unreachable, so a measured adaptation failure cannot be represented or aggregated.
**Fix:** Define explicit transition rules: incomplete → REVIEW_REQUIRED; complete passing → PASS/accepted_deviation; complete failing → FAIL with evidence hashes and measured reason. Add direct tests for DEV failure in both aggregate derivation and CLI verification.

### WR-11: Evidence validators are not held to integrity-critical coverage

**Classification:** WARNING
**Confidence:** 10/10
**Files:** scripts/benchmark-v12-interactions.mjs:1-238; scripts/compare-v12-calendar.mjs:1-164; scripts/run-v12-maestro.mjs:1-69; scripts/verify-v12-native-evidence.mjs:1-320; scripts/run-coverage-gate.mjs:58-102
**Issue:** These files enforce high-severity evidence tampering, privacy, classification, and identity boundaries, but unlike Phase 18 evidence code they are absent from a 100% Node coverage gate. Direct Node coverage is only 81.54% lines, 76.70% branches, and 87.50% functions; the untested CLI/live branches contain several defects above.
**Fix:** Add Phase 16 evidence files/tests to an exact Node experimental-coverage registry at 100% lines/branches/functions, including live CLI assembly, failed deviations, privacy schema rejection, immutable writes, malformed persisted records, and complete matrix validation.

## Verification Evidence

- PASS: focused Phase 16 component suites — 9 suites, 54 tests.
- PASS: focused Phase 16 unit suites — 4 suites, 108 tests.
- PASS: focused training Calendar repository suite — 1 suite, 4 tests.
- PASS: evidence/comparison suites — 12 tests.
- PASS: npm run typecheck.
- PASS: npm run check:boundaries — 422 files.
- PASS: phase16CalendarTestControls.ts exact coverage — 100/100/100/100.
- PASS: calendarTransitionController.ts exact coverage — 100/100/100/100.
- FAIL: localDate.ts integrity gate — 97.56% statements, 91.48% branches, 100% functions, 97.53% lines.
- FAIL: trainingCalendarRepository.ts integrity gate — 92.59% statements, 89.85% branches, 100% functions, 100% lines.
- FAIL: Phase 16 evidence-script coverage — 81.54% lines, 76.70% branches, 87.50% functions.
- NOT RUN by design: Android build, ADB, Maestro, screenshots, native comparisons, physical-device review, and release/profile performance. These remain Phase 20-owned and were not counted as findings.

---

_Reviewed: 2026-10-12T19:11:25Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
