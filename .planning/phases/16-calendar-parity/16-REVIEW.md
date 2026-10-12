---
phase: 16-calendar-parity
reviewed: 2026-10-12T22:56:03Z
depth: deep
files_reviewed: 69
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
  - src/bootstrap/runningPlanRuntime.tsx
  - src/bootstrap/workoutAppRuntime.test.tsx
  - src/bootstrap/workoutAppRuntime.tsx
  - src/domains/history/calendar.test.ts
  - src/domains/history/calendar.ts
  - src/domains/scheduling/localDate.test.ts
  - src/domains/workout/index.ts
  - src/domains/workout/workoutPresentation.ts
  - src/navigation/importedActivityRoute.ts
  - src/navigation/routeOrigin.test.ts
  - src/navigation/routeOrigin.ts
  - src/platform/sqlite/repositories/plansWorkoutRepository.ts
  - src/platform/sqlite/repositories/trainingCalendarRepository.ts
  - src/ui/__tests__/CalendarScreen.test.tsx
  - src/ui/__tests__/CalendarTransitions.test.tsx
  - src/ui/__tests__/ImportedActivityDetailScreen.test.tsx
  - src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx
  - src/ui/__tests__/RunningPlanDetailScreen.test.tsx
  - src/ui/__tests__/SessionDetailScreen.test.tsx
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
  - src/ui/components/WorkoutSessionPresentation.tsx
  - src/ui/components/index.ts
  - src/ui/screens/CalendarScreen.tsx
  - src/ui/screens/ImportedActivityDetailScreen.tsx
  - src/ui/screens/PlannedWorkoutDetailScreen.tsx
  - src/ui/screens/RunningPlanDetailScreen.tsx
  - src/ui/theme/index.ts
  - tests/integration/today-schedule-workout.test.ts
  - tests/sqlite-host/trainingCalendarRepository.real.test.ts
  - tests/sqlite-host/trainingCalendarRepository.test.ts
findings:
  critical: 15
  warning: 7
  info: 0
  total: 22
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-12T22:56:03Z
**Depth:** deep
**Files Reviewed:** 69
**Status:** issues_found

## Summary

Phase 16 still does not meet the required zero-BLOCKER/zero-WARNING result. This re-review found 15 BLOCKER findings and 7 WARNING findings after tracing the final merged code at `704537a9609baaf380485d2e7dcda2ab91955039` through its route adapters, runtime ports, SQLite projections, transition controller, UI composition, diagnostic producer, comparison pipeline, and final verifier.

The prior 14 BLOCKER and 11 WARNING findings were all rechecked. Thirteen are fully closed and twelve remain open or only partially closed; several residuals are restated as more precise current findings below. The merge-only Garmin resolution in `4e8cdebb` preserves Progress `sourceRevision` fencing while keeping Calendar on the narrow read adapter. The root-shell conflict resolution in `704537a9`, including `fd2877c9` and `1d81d74f`, preserves the narrow `useCalendarRangeReadPort` mock. Neither merge reintroduced the original broad-runtime acquisition defect.

Native/device execution itself remains Phase 20-deferred and is not reported as a defect. The evidence findings below are source-level defects that can accept false evidence, cannot emit the declared trace, or will mis-execute a future Phase 20 run.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The final verifier can report PASS while a required case is FAIL and while required artifacts are unverified

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `scripts/verify-v12-native-evidence.mjs:159-172`, `scripts/verify-v12-native-evidence.mjs:241-285`, `scripts/compare-v12-calendar.mjs:94-107`

**Issue:** `validateV12CalendarComparison` correctly derives its own status from `case_results`, but the outer `derivedStatus` ignores both `evidence.comparison.status` and every `comparison.case_results[*].status`; it looks only at comparison records. The artifact walk also omits every `case_results[*].artifact` and the retained APK. The CLI validates the separately loaded comparison file but never compares it with `evidence.comparison`, and it compares the separately loaded manifest with `evidence.manifest` only by `source_tree_sha256`. A direct adversarial probe changed one required case to `FAIL`, set the nested comparison status to `FAIL`, left the top-level status as `PASS`, and `validateV12CalendarEvidence` returned `{"status":"PASS","all_pass":true}`. A complete-looking report can therefore pass with a failed required case, missing case artifacts/APK, or different embedded and retained evidence documents.

**Fix:** Derive the aggregate from the validated nested comparison status and every required case. Include `manifest.apk`, all case-result artifacts, and every nested artifact in the verified set. Parse each retained JSON artifact and require deep canonical equality with its embedded counterpart; require the supplied manifest to equal `evidence.manifest`, not merely share one digest.

### CR-02: The supposed exact Calendar matrix is not enforced or bound to the evidence identity

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `scripts/v12-calendar-case-registry.mjs:23-39`, `scripts/v12-calendar-case-registry.mjs:105-111`, `scripts/compare-v12-calendar.mjs:81-92`, `scripts/compare-v12-calendar.mjs:124-151`, `.planning/phases/16-calendar-parity/16-REFERENCE-MAP.json:16-39`, `scripts/source-tree-digest.mjs:16-17`

**Issue:** The 64 static configurations hard-code `motion: "normal"` and `input: "touch"`; keyboard/D-pad and reduced motion are detached standalone IDs rather than configuration-bound cases. `assertLedger` requires only one Light row, one Dark row, one keyboard-or-D-pad row, and one reduced-motion row. It never requires the ledger to enumerate `V12_CALENDAR_REQUIRED_CASE_IDS`. The checked map still has only 14 portrait captures, no 600/840 capture, no landscape capture, and no D-pad capture. The repository test at `scripts/v12-calendar-comparison.test.mjs:301-326` explicitly accepts a one-capture map as “bound” to the 96-case registry. The map itself lives under `.planning/`, which `sourceTreeSha256` excludes, and no map digest is carried in the manifest, so it can be changed after build without changing the validated source identity.

**Fix:** Define the required configuration/state/input/motion combinations as exact case objects, require a one-to-one ledger/artifact binding for every required case, reject unknown or missing combinations, and include a canonical hash of `16-REFERENCE-MAP.json` in the build/evidence identity.

### CR-03: The native diagnostic source cannot produce the stage evidence its validator requires

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `src/bootstrap/phase16CalendarTestControls.ts:128-180`, `src/bootstrap/phase16CalendarTestControls.ts:307-332`, `scripts/compare-v12-calendar.mjs:48-75`, `maestro/v1.2/calendar.yaml:85-95`, `maestro/v1.2/calendar.yaml:107-166`, `app/(tabs)/calendar.tsx:63-93`, `scripts/benchmark-v12-interactions.mjs:195-228`

**Issue:** The active stage recorder exposes only module-global record functions; there is no production accessor/export for `activeControls.trace()`. Even if a collector supplied a trace, `assertTrace` rejects every `cancel` and `focus` sample and requires 24.9/25/25.1 drag markers for every capture, including key/detail/focus stages. The reduced-motion flow passes `phase16CalendarReducedMotion=true`, but the Calendar route never reads it. `drag-retreat` is two separate completed swipes, and `drag-cancel` is a completed swipe followed by Android Back, so neither exercises the named gesture path. All date IDs/month assertions are fixed to October 2026 while production initializes from the device date. Finally, the performance producer emits at least 200 sample objects as one logcat line, which exceeds Android's per-entry limit and can be truncated before `extractV12CalendarDiagnosticsResult` parses it. These are protocol defects, not missing Phase 20 execution.

**Fix:** Add an identity-bound, nonce-bound file or chunked native export for each stage; define per-stage trace schemas that accept the relevant drag/release/cancel/focus events; seed a deterministic Calendar date/data fixture; wire the reduced-motion parameter; implement real retreat/cancel gestures; and have the Phase 20 runner invoke and verify those exact stage outputs.

### CR-04: Evidence writers follow symlinked parent directories outside the allowed root

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `scripts/v12-calendar-artifacts.mjs:32-47`, `scripts/compare-v12-calendar.mjs:36-41`, `scripts/compare-v12-calendar.mjs:184-203`, `scripts/benchmark-v12-interactions.mjs:202-234`

**Issue:** Writer paths are checked lexically with `path.resolve`/`startsWith`, while only the final input file is checked with `lstatSync`. A symlinked parent below the repository or temporary root is followed by `mkdirSync`/`writeFileSync`, allowing a caller or checked-out symlink to create Calendar evidence outside the approved root. A direct probe created `root/linked -> outside`, called `createExclusiveDirectory(root/linked/escaped)`, and confirmed that `outside/escaped` was created. Exclusive file creation prevents overwrite but does not prevent the traversal.

**Fix:** Resolve and validate every existing path segment against a canonical root before creating directories, reject symlink ancestors, create the final directory/file relative to a verified directory handle where supported, and add parent-symlink tests for comparison, diagnostics, and run-journal writes.

### CR-05: The evidence privacy boundary still accepts personal data in allowed path fields

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `scripts/verify-v12-native-evidence.mjs:40-44`, `scripts/verify-v12-native-evidence.mjs:175-192`, `scripts/compare-v12-calendar.mjs:133-146`

**Issue:** Exact-key validation rejects extra privacy-bearing fields but applies no privacy-safe grammar to allowed `path` values. A direct probe changed `artifacts.report.path` to `fixtures/Alice-private-rehab-session.json`; `validateV12CalendarEvidence` accepted it. The same gap exists for manifest APK paths, functional/route/case artifacts, comparison artifacts, and reference paths, so names, dates, account IDs, or route IDs can still leak through evidence filenames even though the prior CR-12 fix claims an allowlisted privacy boundary.

**Fix:** Validate every retained path against source-owned, non-personal path templates or opaque generated IDs, and add adversarial tests for PII in every descriptor value, not only for unknown object keys.

### CR-06: Planned Running routes still resolve against the current plan instead of the scheduled immutable revision

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `src/platform/sqlite/repositories/trainingCalendarRepository.ts:316-347`, `src/bootstrap/calendarReadPorts.ts:62-74`, `src/platform/sqlite/repositories/runningPlanRepository.ts:197-220`

**Issue:** Calendar events carry the immutable `running_opportunities.session_revision_id`, but `loadScheduledSessionPlan` calls `loadPlan(planId)`, whose SQL selects only each slot root's latest revision and the session root's current revision. Editing a Running session leaves the existing opportunity pinned to its old immutable revision, so the Calendar event remains visible but opening it returns `null` once that revision is no longer current. The fix test uses an in-memory aggregate that already contains the requested revision and never exercises this production call chain.

**Fix:** Add a query-only repository method that loads the exact `planId + sessionRevisionId` (preferably also the occurrence ID and schedule-version identity) from immutable revision tables, then build the Calendar DTO from that row. Cover an opportunity pinned to revision 1 after the plan's current slot advances to revision 2.

### CR-07: Planned Strength detail is neither active-only nor immutable to the scheduled occurrence

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `src/platform/sqlite/repositories/plansWorkoutRepository.ts:575-646`, `src/platform/sqlite/repositories/ownedPlanRepository.ts:1348-1380`

**Issue:** `loadPlannedStrengthOccurrence` checks only `opportunity.state = 'pending'` and plan-kind columns. It does not require the plan/schedule to remain active and does not compare any stored occurrence provenance with the current plan/day/schedule revisions. It then joins mutable plan/day/exercise/target tables and reports their current revisions as if they were the occurrence's source revisions. Because owned-plan edits update those rows in place, an inactive or changed schedule can still return a preview whose names and targets differ from the materialized Calendar occurrence.

**Fix:** Enforce active plan/schedule/current-version membership and bind the occurrence to stored plan/day/schedule/target revision facts. If those immutable facts are unavailable, add the required persisted snapshot/provenance rather than relabeling current rows as source revisions; return `null` on any mismatch and add real-SQLite inactive/revised-plan tests.

### CR-08: Calendar session deep links accept removed and non-historical session states as “Complete”

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `src/ui/calendar/CalendarRouteAdapters.tsx:52-87`, `src/ui/calendar/CalendarReadOnlyWorkout.tsx:11-13`, `src/domains/workout/outcomes.ts:1-11`, `src/platform/sqlite/repositories/workoutOutcomeRepository.ts:1773-1808`

**Issue:** The Calendar adapter marks every successful `getSessionDetail` result ready without requiring `completed` or `partial`. `CalendarReadOnlyWorkout` maps every status other than `partial` to `Complete`. A valid Calendar-origin deep link can therefore show an in-progress, discarded, voided, manual-visit, or zero-set session as a completed Calendar workout. Removed sessions are especially concrete: `loadSessionDetail` deliberately returns a synthesized detail for a voided session instead of throwing not-found.

**Fix:** Introduce a Calendar-specific history read result that requires an active effective-history lifecycle and a `completed | partial` status. Return the documented unavailable state for every other status, and add deep-link tests for in-progress, voided, discarded, manual-visit, and zero-set IDs.

### CR-09: A valid matched Garmin activity disappears when its linked opportunity is not in the current active range

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `src/platform/sqlite/repositories/trainingCalendarRepository.ts:316-397`

**Issue:** `matchedOpportunityIds` is built from every imported row before the imported row is validated. Planned Running rows are then suppressed by that set, but an imported activity with a match is emitted only if the corresponding opportunity also survived the active-schedule/date-bounded `runningRows` query. A valid imported activity is therefore silently dropped when its matched opportunity is on another date, its schedule was later deactivated, or its related row is malformed; a malformed import can also hide an otherwise valid planned Running event.

**Fix:** Read match metadata independently of the visible active-plan range, validate the imported projection first, and suppress a planned Running row only when a valid matched activity will replace that exact occurrence. Preserve the imported historical activity even when the associated schedule is no longer active, and add real-SQLite cross-date/deactivated/malformed-match cases.

### CR-10: Previous and next drag panels render outside the queried source range

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `src/ui/screens/CalendarScreen.tsx:171-176`, `src/ui/calendar/CalendarMonthViewport.tsx:204-205`, `src/ui/calendar/CalendarMonthViewport.tsx:409-420`, `src/ui/__tests__/CalendarScreen.test.tsx:191-194`

**Issue:** The range request covers the current month grid plus one following week. The viewport simultaneously renders complete previous, current, and next month panels from that one range. The existing August test proves the request is only `2026-07-27..<2026-09-14`; the July preview begins on June 29 and the September preview runs through October 4. Most event/rest facts in both adjacent panels are therefore rendered as empty during the required 1:1 drag.

**Fix:** Query one bounded range spanning the first date of the previous panel through the final date/following-week requirement of the next panel, or maintain separately generation-fenced ranges for all three panels. Add events near both outer boundaries and assert they remain visible throughout preview and settle.

### CR-11: Calendar focus events either skip refresh or replay an obsolete detail-return snapshot

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `app/(tabs)/calendar.tsx:94-135`, `src/ui/screens/CalendarScreen.tsx:459-509`, `src/ui/screens/CalendarScreen.tsx:645-658`

**Issue:** Every focus after the first increments `returnFocusGeneration`, but `CalendarScreen` returns immediately when no agenda detail has ever set `calendarReturnRef`, so returning from Workout/Library/Progress does not refresh Calendar after source changes. Once a detail has been opened, the opposite failure appears: `calendarReturnRef.current` is never cleared after restoration, so every later tab focus restores that old month/date/mode/event and can jump the owner away from their current Calendar position.

**Fix:** Treat route focus and detail-return restoration as separate events. Always refresh on root refocus, consume and clear a one-shot detail-return token after applying it, and restore spatial state only when the current focus event carries that token. Add root-tab return tests both before any detail visit and after navigating away from a previously restored detail.

### CR-12: Retained-refresh presentation and interaction use different month identities

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `src/ui/screens/CalendarScreen.tsx:281-327`, `src/ui/screens/CalendarScreen.tsx:395-448`, `src/ui/screens/CalendarScreen.tsx:537-607`, `src/ui/screens/CalendarScreen.tsx:672-814`

**Issue:** During a new-month load or error, `visibleMonth` and `visibleSelectedDate` revert to the last-good values, but Previous/Next/Today calculations and date handlers continue to use the requested `month` and `selectedDateRef`. The screen can therefore show “August 2026” while its Previous/Next controls are computed from September; tapping a displayed August date is treated as a cross-month transition from September. The focused test at `CalendarScreen.test.tsx:487-529` verifies the old title remains visible but never exercises those still-enabled controls or date cells.

**Fix:** Keep one explicit displayed snapshot identity and derive title, controls, grid, selection, handlers, and return state from it. Either disable all grid/navigation interaction while an authoritative replacement range is loading, as the UI-SPEC permits, or keep the requested state entirely separate until its matching range commits. Roll back or clearly retain a failed target before accepting further navigation.

### CR-13: The second-drag settle race remains on the UI thread

**Classification:** BLOCKER
**Confidence:** 9/10
**File:** `src/ui/calendar/CalendarMonthViewport.tsx:289-365`

**Issue:** The new `panEnabled` shared value is updated only by a React effect after the JS-thread transition reaches `settling`. `onEnd` does not close the latch before `scheduleOnRN(onRelease)`. A second touch that begins in that interval still sees `panEnabled.value === true`; its `onBegin` increments `completionEpoch` and cancels `pointerX`, and its eventual finalize can invalidate the first settle callback. The test at `CalendarTransitions.test.tsx:68-94` mounts an already-settling prop and therefore does not exercise the release-to-rerender race described by the original CR-06.

**Fix:** Close a UI-thread ownership/settle latch synchronously in `onEnd` before crossing to JS, leave the current animation epoch untouched for rejected gestures, and reopen the latch only from the matching completion/cancel path. Add a handler-level test that starts the second touch before the React settling render.

### CR-14: Changing reduced-motion during an adjacent-week transition drops the requested destination

**Classification:** BLOCKER
**Confidence:** 10/10
**File:** `src/ui/calendar/calendarTransitionController.ts:210-221`, `src/ui/calendar/calendarTransitionController.ts:267-292`

**Issue:** `select-adjacent` stores the target in `pendingSelectedLocalDate`/`pendingMonthId`, but `set-reduced-motion` unconditionally clears both fields while leaving the already-collapsed `mode: "month"`. A direct reducer replay from focused `2026-10-31` toward `2026-11-01` produced `adjacent-collapsing` with the pending November destination, then toggling reduced motion returned idle October month mode with both pending fields null. This violates the required normal/reduced semantic equivalence and loses the user's selection.

**Fix:** When reduced motion changes during an adjacent transition, deterministically finish the pending collapse/select/expand destination (or explicitly restore the prior focused state) before clearing pending fields. Add transition tests for toggling both directions in `adjacent-collapsing`, `adjacent-measuring`, and `adjacent-expanding`.

### CR-15: The compact-height focused layout reserves no usable space for agenda rows

**Classification:** BLOCKER
**Confidence:** 10/10
**Files:** `src/ui/calendar/CalendarMonthViewport.tsx:127-143`, `src/ui/calendar/CalendarMonthViewport.tsx:384-405`, `src/ui/screens/CalendarScreen.tsx:616-661`, `src/ui/screens/CalendarScreen.tsx:855-858`

**Issue:** Focused-mode minimum height is only two row heights plus 110dp. The absolute agenda space between those rows is therefore 110dp, but its fixed children already require at least 62dp heading + 48dp collapse action + two 10dp gaps = 130dp before the agenda list receives any height. At 200% text the two rows grow to 122dp each while the same 110dp agenda allowance remains. On the exact constrained layouts the scroll fix targets, event rows can be clipped to zero height inside the viewport's `overflow: "hidden"`.

**Fix:** Derive the focused minimum from both row heights plus the measured/worst-case agenda header, in-heading Collapse control, gaps, and at least one 82dp agenda row (or the full empty state). Match the specified single agenda-heading row, then add compact-landscape and 200%-text tests that scroll to and activate every agenda item.

## Warnings

### WR-01: Planned Running agenda rows still do not show a source-backed target

**Classification:** WARNING
**Confidence:** 10/10
**File:** `src/platform/sqlite/repositories/trainingCalendarRepository.ts:244-254`

**Issue:** The query selects only `session_kind` and emits `"Tempo session planned"`/`"Recovery session planned"`. It never reads the immutable `definition_json` or advisory target, so CAL-16's one-line result/target remains a category placeholder for Running sessions.

**Fix:** Select and parse the pinned session revision's definition and use the shared Running target/readback formatter to produce a bounded factual summary; reject malformed definitions and cover pace, HR-zone, RPE, duration/distance, and structured-session cases.

### WR-02: Calendar-origin Garmin detail focuses the heading instead of Back

**Classification:** WARNING
**Confidence:** 10/10
**File:** `src/ui/screens/ImportedActivityDetailScreen.tsx:100-123`, `src/ui/screens/ImportedActivityDetailScreen.tsx:473-506`

**Issue:** The screen always focuses `headingRef` on mount. In Calendar mode the UI-SPEC requires initial focus on Back, but `DetailHeader` exposes no ref for its Back action. The route is read-only now, yet its keyboard/D-pad entry focus remains wrong.

**Fix:** Add a Back-action ref and focus it when `mode === "calendar"`; retain the existing heading focus for management origins if that is their contract. Add a mounted Calendar-origin focus assertion.

### WR-03: Today can still become stale after an active timezone or wall-clock change

**Classification:** WARNING
**Confidence:** 9/10
**File:** `src/ui/calendar/useCurrentLocalDate.ts:14-25`, `src/ui/calendar/useCurrentLocalDate.ts:53-67`

**Issue:** The hook now refreshes at the initially calculated local midnight and on AppState foreground events, but it has no active-session timezone/clock-change signal. If the device timezone changes while the app remains active, the existing timer still targets midnight in the old zone and the Today marker/action can remain on the wrong civil date.

**Fix:** Subscribe to the platform timezone/time-change signal where available, or add a bounded periodic civil-date check while active and reschedule midnight whenever the zone/offset changes. Add an active timezone-change test, not only a foreground test.

### WR-04: Month settling still has no idempotent completion fallback

**Classification:** WARNING
**Confidence:** 10/10
**File:** `src/ui/calendar/CalendarMonthViewport.tsx:217-234`

**Issue:** The UI-SPEC requires the 240ms settle to use a completion listener plus an idempotent fallback. The implementation relies only on the Reanimated callback. If that callback is lost without a layout/AppState invalidation, the controller remains `settling` and all month input remains disabled.

**Fix:** Arm a JS-side epoch-checked fallback slightly after the settle duration, clear it on normal completion/unmount/cancel, and prove duplicate callback delivery cannot navigate twice.

### WR-05: Management detail routes can retain stale entity data while route parameters change

**Classification:** WARNING
**Confidence:** 9/10
**Files:** `app/garmin/activity/[activityId].tsx:65-99`, `app/session/[sessionId].tsx:51-75`

**Issue:** Both effects fence late promises, but neither clears the previous ready detail when a new valid ID starts loading. If Expo Router reuses the dynamic route component, the prior entity remains actionable during the new read. On Garmin, Match uses the new `activityId` while revision actions use the old rendered review, so the visible facts and command target can disagree.

**Fix:** Store the loaded identity with the state and render actions only when it matches the current route identity, or synchronously transition to an identity-keyed loading state before exposing any action. Add rerender tests that change IDs while the second promise is pending.

### WR-06: Read-only detail rows fabricate an always-empty Previous column

**Classification:** WARNING
**Confidence:** 10/10
**Files:** `src/domains/workout/workoutPresentation.ts:106-115`, `src/ui/calendar/CalendarReadOnlyWorkout.tsx:89-99`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx:146-156`

**Issue:** The required Active-shaped tables include `Previous`, but historical mapping hardcodes `previous: null` and planned preview hardcodes `—` for every row. Existing prior observations are therefore displayed as absent even when history exists.

**Fix:** Extend the query-only Calendar DTOs with the same immutable previous-value source used by Active Workout, format it through the shared presenter, and reserve `—` for a verified no-previous-fact state. Add positive and absent-history tests.

### WR-07: The repository's declared CI coverage gate is red on the reviewed tree

**Classification:** WARNING
**Confidence:** 10/10
**File:** `package.json:49`, `package.json:94`

**Issue:** `npm run test:coverage -- --runInBand` executed all 310 suites and all 4,408 tests passed, but the command exited 1 because global statements were 88.24%, functions 87.16%, and lines 89.59% against the declared 90% thresholds. `ci:pr` invokes this exact failing script, so the current merged tree cannot pass its declared PR gate even though the targeted Phase 16 gates are green.

**Fix:** Add behavior-bearing coverage for the newly introduced branches and reconcile concurrent Phase 19 additions until the existing global thresholds pass. Do not lower the thresholds merely to turn the gate green.

## Prior-Finding Reconciliation

| Prior finding | Current disposition | Current evidence |
|---|---|---|
| CR-01 broad runtime authority | Resolved | Narrow provider contexts and route adapter components are used; Calendar route tests show the full runtime hooks are not called. |
| CR-02 origin fail-open | Resolved | `parseCalendarRouteOrigin` rejects arrays/unknown origins and Calendar branches mount before management hooks. |
| CR-03 Running revision identity | Still open | See current CR-06; production still resolves through current aggregate membership. |
| CR-04 placeholder facts/rest | Partially resolved | Strength/import summaries and rest/empty exist; Running target detail remains incomplete (WR-01), and matched imports can disappear (CR-09). |
| CR-05 Garmin namespace leak | Resolved | UI/accessibility render fixed `Garmin`; private source identity stays non-presentational. |
| CR-06 second-drag settle | Still open | See current CR-13; the UI-thread latch closes only after a JS render/effect. |
| CR-07 200%/landscape clipping | Still open | Row tracks now scale and a vertical scroller exists, but focused minimum geometry still starves the agenda; see CR-15. |
| CR-08 Router diagnostic params | Resolved | Expo Router scalar parsing and stage allowlisting are present. |
| CR-09 diagnostic stages/producer | Still open | See current CR-03. |
| CR-10 exact evidence matrix | Still open | See current CR-02. |
| CR-11 live comparison schema | Still open | Shared schema exists, but the outer verifier still accepts false PASS; see CR-01. |
| CR-12 evidence privacy | Still open | Object keys are allowlisted, but descriptor values remain an exfiltration channel; see CR-05. |
| CR-13 descriptor preservation/overwrite | Partially resolved | Recursive canonical JSON and exclusive files are fixed; writer containment still follows symlinked parents (CR-04). |
| CR-14 integrity coverage | Resolved | LocalDate, repository, control, and six evidence helper gates all reached exact 100% in focused runs. |
| WR-01 status visual semantics | Resolved | Sport-tinted solid/half-filled/dashed treatments and neutral key samples are present. |
| WR-02 source order | Resolved | SQL order is retained by the stable date/source grouping; focused tests assert exact order. |
| WR-03 return-focus race | Resolved for the original race | Focus now waits for the matching refresh generation and membership check; stale snapshot reuse is a separate current defect (CR-11). |
| WR-04 read failure classification | Resolved | Typed not-found and retryable read failures render separate states. |
| WR-05 target parsing/stale promise | Resolved | Canonical metric schemas and request generation guards are present. |
| WR-06 layout generation | Resolved for resize/background invalidation | Generation checks and remeasurement exist. |
| WR-07 row fill/agenda timing | Partially resolved | Rows flex and agenda opacity uses command timing; compact focused minimum remains invalid (CR-15). |
| WR-08 keyboard/focus | Partially resolved | Collapse activation and Strength Back focus are fixed; Calendar-origin Garmin still focuses the heading (WR-02). |
| WR-09 current local date | Still open | Midnight and foreground refresh exist, but active timezone/clock changes remain unhandled (WR-03). |
| WR-10 deviation FAIL state | Resolved | Complete technical failures now validate as `FAIL` with a measured reason code. |
| WR-11 evidence coverage | Resolved | The six Phase 16 evidence helpers and Calendar controls pass exact 100% line/branch/function coverage. |

## Re-review Audit Trail

Baseline: `b0d0e706f8c0e163ded22a1ab7fd1f8b5e44fd53`
Reviewed HEAD: `704537a9609baaf380485d2e7dcda2ab91955039`

All 34 Phase 16 non-merge fix/test commits reachable after the baseline were inspected:

- Evidence branch: `64afa675`, `e2b3d9b`, `0e04946e`, `d2a577d6`, `42aad30e`, `5563d646`, `431f675a`.
- Authority/data branch: `e1dbb9b4`, `8fe27dda`, `6a64981c`, `ad11d0ec`, `acf948ba`, `99e9acf0`, `811efb12`, `09c47245`, `720f4d25`, `c0700d7c`, `f06c58c7`, `16729894`.
- Spatial/runtime branch: `c4349b5b`, `bfb664fb`, `391de532`, `34469139`, `4792920c`, `9101262f`, `8008fb0e`, `2147b29b`, `7158ec30`, `2157577a`, `6714114f`, `5d084c4b`, `1d81d74f`, `fac51d3a`.
- Root-shell compatibility: `fd2877c9`.

The integration merges `4d81efae`, `4e8cdebb`, and `704537a9` were reviewed separately. `git show --remerge-diff 4e8cdebb` confirms that the Garmin conflict resolution preserved both strict Calendar-origin adapters and Progress `sourceRevision` validation. `git show --remerge-diff 704537a9` confirms that the root-shell conflict retained the frozen narrow Calendar read-port mock.

Additional call-chain dependencies inspected included the Running aggregate repository, workout-detail repository, schedule-collision projection, metric schemas, `AdaptiveScreen`, Garmin root-origin contract, and source-tree digest implementation.

## Verification Evidence

- PASS: `npm run typecheck`.
- PASS: `npm run check:boundaries` across 428 files.
- PASS: focused Phase 16 components/routes, 16 suites / 115 tests.
- PASS: focused Phase 16 unit tests, 4 suites / 60 tests.
- PASS: focused Calendar SQLite tests, 2 suites / 9 tests.
- PASS: focused schedule/workout integration, 1 suite / 19 tests.
- PASS: Phase 16 evidence tests, 36 tests.
- PASS: exact integrity coverage for `localDate.ts` and `trainingCalendarRepository.ts`, 100/100/100/100.
- PASS: exact Phase 16 evidence-helper and control coverage, 100/100/100/100.
- PASS: `git diff --check b0d0e706..HEAD`.
- FAIL: repository-wide `npm run test:coverage -- --runInBand`; all 310 suites / 4,408 tests passed, but the command exited 1 at 88.24% statements, 85.09% branches, 87.16% functions, and 89.59% lines against the declared 90% global thresholds.
- PROBE: a required comparison case was changed to `FAIL` while nested comparison status was set to `FAIL`; the outer verifier still returned `PASS` and `all_pass: true`.
- PROBE: `fixtures/Alice-private-rehab-session.json` was accepted as an evidence artifact path.
- PROBE: an output directory below a symlinked parent escaped the supplied root and was created in the external target.
- PROBE: toggling reduced motion during an adjacent transition discarded the pending November destination and returned idle in October month mode.

## Phase 20 Deferred Native Evidence

Android build/install, ADB/Maestro execution, screenshots, visual comparison, real-device focus/geometry checks, and release/profile performance remain Phase 20-owned. Their absence is not counted above. No current artifact claims those operations were completed; the checked fixture remains `host_only_fixture: true`, `native_execution: NOT_RUN`, `status: REVIEW_REQUIRED`, and `all_pass: false`.

---

_Reviewed: 2026-10-12T22:56:03Z_
_Reviewer: TRAE (gsd-code-reviewer)_
_Depth: deep_
