# Phase 16 — UI Review

**Audited:** 2026-10-13
**Baseline:** `.planning/v1.2-OWNER-DECISIONS.md` → `.planning/v1.2-OWNER-BRIEF.md` → `.planning/design/v1.2-SOURCE-PRECEDENCE.md` → approved Revision 18 `approved.json` / `approved-hybrid.html` → `16-UI-SPEC.md`
**Source:** `fchoo/UX-revamp` at `f152c96502f69b72df074914b2f202182362e268`
**Screenshots:** Not captured — no dev server responded on ports 3000, 5173, or 8080. Native screenshots/device checks remain Phase 20-deferred and were not scored as a Phase 16 defect.
**Scope:** Calendar root, month/focused agenda, event/key semantics, Calendar-origin destinations, Back/focus behavior, current first/second-wave fixes, and host-verifiable Phase 16 evidence. Existing Phase 14/19 worktree changes were excluded and left untouched.

---

## Verdict

**WARNING — the 24/24 gate is not met.** All prior task-blocking UI findings are closed in current source: full-height/focused composition, 200%/compact-landscape scrolling, sport/status fills, factual/rest summaries, Active-shaped Strength facts, 25% and reduced-motion semantics, real query-only routes, and Calendar return focus now have implementation and host-test evidence. No current issue blocks Calendar task completion.

The implementation still diverges from the approved visual contract in source-verifiable ways. Base date cells are visibly outlined instead of border-reserved/transparent, the today ring is a full-width left-aligned track instead of a centered 28dp circle, focused heading/Collapse and agenda rows do not match the flat Revision 18 composition, Calendar-origin Strength detail still introduces 18sp/20sp and weight 700, and planned Strength/Running detail does not deterministically move entry focus to Back. These are not Phase 20 screenshot absences; they are current source differences.

**Shipping gate:** 0 BLOCKER, 11 WARNING findings. Required zero-WARNING / 24-of-24 result: **not achieved**.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Exact Calendar, loading/error, rest, factual agenda, and dynamic read-only detail copy is source-backed. |
| 2. Visuals | 2/4 | Core full-height/focused composition is fixed, but date atoms, flat agenda hierarchy, Collapse placement, and some icons still diverge from Revision 18. |
| 3. Color | 3/4 | Sport/status fills and neutral status key are correct; persistent cell/agenda surfaces and the Activity key still misuse or omit contracted roles. |
| 4. Typography | 2/4 | Calendar root uses the exact 11/14/16/22 Archivo/IBM scale, but Calendar-origin Strength detail still renders 18sp/20sp and weight 700. |
| 5. Spacing | 2/4 | Full-height distribution and adaptive inset are fixed, but several exact local geometries and the month-control/focused-heading structures are not implemented. |
| 6. Experience Design | 3/4 | Motion, source states, routes, authority, and return focus are strong; deterministic Back entry focus and 200%-text portrait month controls remain incomplete. |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **Restore the Calendar atom and flat-list geometry** — Visible borders on every day, a full-width left-aligned today track, boxed secondary-surface agenda rows, and a separate full-width Collapse row materially change Revision 18's hierarchy. Use a transparent reserved cell border and 9dp radius; center a 28dp today/date ring; restore the 2dp event-track top offset; render agenda rows on paper with a bottom separator only; place a 48dp Lucide Collapse action inside the agenda heading. (`src/ui/calendar/CalendarWeekRow.tsx:132-151`, `src/ui/calendar/CalendarWeekRow.tsx:203-223`, `src/ui/calendar/CalendarAgenda.tsx:122-150`, `src/ui/screens/CalendarScreen.tsx:652-678`)
2. **Enforce the Phase 16 type contract through Calendar-origin Strength details** — The root now uses the approved type scale, but historical exercise disclosures inherit 18sp/700 from `workoutTypeScale` and historical/planned status headings inherit 20sp. Add Calendar-specific typography overrides/props to the shared facts presenter and use only 11/14/16/22sp with weights 400/800 and IBM Plex Mono for numeric values. (`src/ui/components/WorkoutSessionPresentation.tsx:86-90`, `src/ui/calendar/CalendarReadOnlyWorkout.tsx:58-67`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx:138-143`, `src/ui/theme/index.ts:92-97`, `src/ui/theme/index.ts:192-202`, UI spec `:132-145`)
3. **Finish deterministic focus and 200%-text navigation behavior** — Planned Strength and Calendar-origin Running screens render a shared Back action but never focus it; the month title also has no constrained/flexible slot or ellipsis at 360dp/200% text. Expose a Back ref from `ScreenHeader`, focus it on Calendar-origin mount/non-ready states, implement the exact `48 / minmax / 76 / 48` month-control layout, and add a 360×800 font-scale-2 regression. (`src/ui/screens/PlannedWorkoutDetailScreen.tsx:123-190`, `src/ui/screens/RunningPlanDetailScreen.tsx:44-53`, `src/ui/components/index.ts:656-670`, `src/ui/screens/CalendarScreen.tsx:709-726`, `src/ui/screens/CalendarScreen.tsx:907`)

---

## Requested Contract Checks

| Contract check | Current result | Evidence |
|---|---|---|
| Full-height month / focused composition | **CLOSED** | Month rows use equal `flex: 1`; the scroll container derives minimum height from row count; focused overlays are ordered selected week → agenda → following week and position the latter at the viewport bottom (`CalendarWeekRow.tsx:84-90,223`; `CalendarMonthViewport.tsx:118-152,437-494`). |
| Font scale 2 / compact landscape scroll | **CLOSED for vertical content; WARNING for portrait controls** | Track minima scale from font scale and the month/focused region has a vertical `ScrollView`; 200% compact-height tests assert 50dp/66dp tracks and a reachable agenda row (`CalendarWeekRow.tsx:39-49`; `CalendarMonthViewport.tsx:437-459`; `CalendarScreen.test.tsx:809-865`). The month-control row itself remains unconstrained at 360dp/200% (`CalendarScreen.tsx:709-726,907`). |
| Sport/status fills and key | **PARTIAL** | Complete is a 14% sport tint, Partial a dotted 18% half-fill, Planned transparent/dashed, and status-key samples are neutral (`CalendarWeekRow.tsx:154-191`; `CalendarScreen.tsx:873-886`). The Activity key has colored words but no required orange/blue swatches (`CalendarScreen.tsx:866-871`; UI spec `:214-220`). |
| Exact typography/fonts | **WARNING** | Root Calendar roles correctly use `calendarTypeScale` and IBM Plex Mono (`theme/index.ts:132-172`; `CalendarScreen.tsx:624-625,711,749`), but Calendar-origin detail still consumes 18sp/700 and 20sp roles outside the exact contract (`WorkoutSessionPresentation.tsx:86-90`; `CalendarReadOnlyWorkout.tsx:59`; `PlannedWorkoutDetailScreen.tsx:140`). |
| Active-shaped Strength details | **CLOSED structurally** | Historical and planned details now show dynamic source titles, progress, exercise disclosures, Previous/Result-or-Target/State columns, all set rows, and no mutation commands (`CalendarReadOnlyWorkout.tsx:28-105`; `PlannedWorkoutDetailScreen.tsx:66-72,133-187`). Typography remains separately open. |
| Focus clearance and transfers | **PARTIAL** | Shared focus renders 3dp with 4dp offset and Calendar expand/collapse/detail-return transfers are tested (`components/index.ts:298-325`; `CalendarScreen.tsx:523-559`; `CalendarScreen.test.tsx:428-454`). Planned Strength and Calendar-origin Running do not explicitly focus Back on entry (`PlannedWorkoutDetailScreen.tsx:123-190`; `RunningPlanDetailScreen.tsx:44-53`). |
| Info immediately before Settings | **CLOSED** | Two 48dp Lucide actions are supplied in Info→Settings order; the shared action container is horizontal with a 2dp gap (`CalendarScreen.tsx:603-626`; `components/index.ts:667-670,1403-1408`; `CalendarScreen.test.tsx:389-425`). |
| Rest and factual summaries | **CLOSED** | The SQLite projection carries immutable factual summaries and rest-day records; agenda renders `displaySummary` and exact recovery copy rather than category placeholders (`trainingCalendarRepository.ts:163-200,225-291,470-486`; `CalendarAgenda.tsx:71-80,94-136`). |
| Inclusive 25% motion / reduced motion | **CLOSED** | Settle remains distance-only `>= 25%`; 240/260/170/140ms timings and agenda delay are consumed; reduced motion preserves the destination without travel (`calendarTransitionController.ts:18-44,118-146,170-205,210-238,274-309`; `CalendarMonthViewport.tsx:287-331,373-420`). |
| Real query-only destinations and return focus | **CLOSED** | Session, occurrence, Running plan/session revision, and imported activity route to real adapters by durable identity; Calendar stores and restores month/date/mode/offset/event focus after an authoritative refresh (`app/(tabs)/calendar.tsx:97-126`; `CalendarRouteAdapters.tsx:38-175`; `CalendarScreen.tsx:490-544`). The real-route suite passed. |
| Native/device screenshots | **PHASE 20 DEFERRED — NOT SCORED** | The checked fixture remains honestly `REVIEW_REQUIRED`, `all_pass:false`; absence of native evidence did not lower any pillar. |

---

## Prior BLOCK / FLAG Reconciliation

| Prior finding | Re-audit disposition | Current evidence |
|---|---|---|
| Generic agenda result/target copy | **CLOSED** | `event.displaySummary` is rendered and spoken; source-specific Strength, Running, and Garmin summaries are built in the repository (`CalendarAgenda.tsx:97,130-133`; `trainingCalendarRepository.ts:154-156,163-200,256-288,430-446`). |
| Rest state/copy unreachable | **CLOSED** | Range days now distinguish `events`, `rest`, and `empty`; rest renders a dash plus `Recovery is the plan` and factual summary (`trainingCalendarRepository.ts:470-486`; `CalendarWeekRow.tsx:93-104,194`; `CalendarAgenda.tsx:71-80`). |
| Generic ready Strength headings | **CLOSED** | Historical title comes from day/plan; planned readiness requires non-empty plan/day/exercise names and renders the day name (`CalendarReadOnlyWorkout.tsx:28-34,56`; `PlannedWorkoutDetailScreen.tsx:66-72,133-141`). |
| Focused hierarchy reversed | **CLOSED** | Selected/following overlays bracket the absolute agenda region (`CalendarMonthViewport.tsx:105-152,475-490`). |
| Month rows not full-height | **CLOSED** | Rows use equal flex shares and the panel/viewport fill available height (`CalendarWeekRow.tsx:84-90,223`; `CalendarMonthViewport.tsx:453-504`). |
| Week rows faded instead of agenda | **CLOSED** | Row overlays retain opacity; only `agendaOpacity` is animated using command delay/duration (`CalendarMonthViewport.tsx:136-152,287-323`). |
| Strength details not Active-shaped | **CLOSED structurally** | Disclosures and four-column facts are present in historical/planned details (`CalendarReadOnlyWorkout.tsx:72-102`; `PlannedWorkoutDetailScreen.tsx:148-184`). |
| Info rendered as text `i` | **CLOSED** | Shared 24dp Lucide `info` action is used (`CalendarScreen.tsx:607-614`; `components/index.ts:527-596`). |
| Complete/Partial used green/yellow status fills | **CLOSED** | Status geometry now mixes the current sport color (`CalendarWeekRow.tsx:154-181`). |
| Calendar-key status samples used green/yellow | **CLOSED** | Status samples use neutral primary text with 14%/18% fill (`CalendarScreen.tsx:873-886`). |
| Calendar root used 20sp/14sp and non-mono dates | **CLOSED at root** | Root headings are 22sp and weekdays/dates are 16sp IBM Plex Mono (`theme/index.ts:132-172`; `CalendarScreen.tsx:711,749`; `CalendarWeekRow.tsx:143-151`). |
| Fixed 28/17/36 tracks clipped 200% text | **CLOSED** | Track values are minimums derived from font scale (`CalendarWeekRow.tsx:39-49,143-163`). |
| Vertical distribution/focused 260dp cap | **CLOSED** | Hard cap is gone; row-count and agenda minima drive a scrollable viewport (`CalendarMonthViewport.tsx:54-60,437-459`). |
| No 4dp focus clearance in source | **CLOSED at source level** | Shared `FocusablePressable` applies `outlineWidth: 3` and `outlineOffset: 4` when focused (`components/index.ts:298-325`; `theme/index.ts:49-63`). Native appearance remains Phase 20. |
| Focused Previous/Today/Next bypassed ordered transition | **CLOSED** | Focused controls dispatch `select-adjacent`, then controller runs collapse → selection/measurement → expansion (`CalendarScreen.tsx:426-460`; `calendarTransitionController.ts:247-309`). |
| Normal motion ignored agenda timing / reduced-motion mismatch | **CLOSED** | Agenda delay/duration now drive opacity, and runtime reduced-motion changes preserve pending destination (`CalendarMonthViewport.tsx:287-331`; `calendarTransitionController.ts:210-238`). |
| Focus-clearance fixture claimed unproved PASS | **CLOSED** | Evidence remains fail-closed; host fixture validation returns `REVIEW_REQUIRED`, `all_pass:false`. Phase 20 owns native focus measurement. |
| Real route/return-focus authority incomplete | **CLOSED** | Real route adapters use read ports only and the route journey suite proves unchanged IDs, zero commands, and Calendar row restoration (`CalendarRouteAdapters.tsx:38-175`; `CalendarScreen.tsx:490-544`). |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — source-led copy is complete.** Calendar title/actions/key, loading/updating/error/retry, empty date, rest date, read-only states, and missing-detail strings match the contract (`CalendarScreen.tsx:603-626,652-697,727-734,858-887`; `CalendarAgenda.tsx:71-80`; `CalendarRouteAdapters.tsx:21-35,76-87`; `PlannedWorkoutDetailScreen.tsx:123-141`).
- **PASS — summaries are factual rather than generic.** Agenda rows render repository-produced `displaySummary`; no `Completed result`, `Partial result`, or `Planned target` placeholder remains (`CalendarAgenda.tsx:94-136`; `CalendarAgenda.test.tsx:20-40`).
- **PASS — ready detail titles are factual.** Historical detail prefers source day/plan and planned detail rejects blank source names before rendering (`CalendarReadOnlyWorkout.tsx:28-34`; `PlannedWorkoutDetailScreen.tsx:66-72,133-141`).

### Pillar 2: Visuals (2/4)

- **PASS — the former structural blockers are closed.** Equal-height month rows and selected-week/agenda/following-week overlays now implement the required full-height reading order (`CalendarWeekRow.tsx:84-90,223`; `CalendarMonthViewport.tsx:105-152,437-494`).
- **WARNING W-UI-01 — date-cell visual atoms still do not match the oracle.** Non-selected cells set `borderColor: colors.line` instead of reserving a transparent 1dp border; cell radius is shared 8dp rather than 9dp; the today/date track stretches across the cell and left-aligns its number because it has no 28dp width/centering constraint (`CalendarWeekRow.tsx:132-151,203-215`; `theme/index.ts:43-47`). Revision 18 and the approved spec require a transparent base border and a centered 28dp date circle (`16-UI-SPEC.md:120-129,170-177,185-192`; Revision 18 `approved-hybrid.html:1118-1123`).
- **WARNING W-UI-02 — focused agenda hierarchy is still card-like and mis-composed.** The Collapse control is a separate bordered full-width row after the heading rather than the 48dp icon inside the heading, and every agenda event is a fully bordered secondary-surface card instead of a flat paper row with a bottom separator (`CalendarScreen.tsx:652-678`; `CalendarAgenda.tsx:122-150`). This differs from the contracted heading and flat row anatomy (`16-UI-SPEC.md:194-200,255-269`; Revision 18 `approved-hybrid.html:1195-1205`).
- **WARNING W-UI-03 — icon fidelity is incomplete.** Planned Strength disclosures use text glyphs `⌄`/`›`, and set state uses a text dash, instead of the declared outlined Lucide Chevron/Dash treatment (`PlannedWorkoutDetailScreen.tsx:154-180`; UI spec `:65-69`).

### Pillar 3: Color (3/4)

- **PASS — the core palette and status model are corrected.** Phase 16 UI source contains no hardcoded hex/RGB literals; it consumes semantic theme colors. Complete uses 14% sport tint, Partial uses a dotted 18% half-fill, Planned is transparent/dashed, and the key status samples are neutral (`CalendarWeekRow.tsx:154-191`; `CalendarScreen.tsx:873-886`; `theme/index.ts:261-281`).
- **WARNING W-COLOR-01 — surface/accent distribution still differs from the approved 60/30/10 treatment.** Every ordinary day has a visible line border, agenda rows always use `colors.surface`, and Today is a filled action surface; Revision 18 leaves base day borders and Today backgrounds transparent and keeps agenda rows on the dominant paper surface (`CalendarWeekRow.tsx:132-139`; `CalendarAgenda.tsx:122-125`; `CalendarScreen.tsx:718-724`; Revision 18 `approved-hybrid.html:1108,1118,1198-1204`).
- **WARNING W-COLOR-02 — the Activity key omits its swatches.** It renders only orange/blue text labels, while the contract requires an orange Strength swatch and blue Running swatch (`CalendarScreen.tsx:866-871`; `16-UI-SPEC.md:214-220`). Status remains understandable without color, so this is not a blocker.

### Pillar 4: Typography (2/4)

- **PASS — root Calendar typography is exact.** The dedicated scale defines only 11/14/16/22sp at weights 400/800, with Archivo for interface text and IBM Plex Mono for dates/weekdays/set values; root use is wired and tested (`theme/index.ts:132-172`; `CalendarScreen.tsx:624-625,655-659,711,749`; `CalendarWeekRow.tsx:143-190`; `CalendarScreen.test.tsx:389-410`).
- **WARNING W-TYPE-01 — Calendar-origin Strength detail breaks the exact scale.** Historical exercise names inherit `workoutTypeScale.bodyStrong` at 18sp/700, while historical and planned read-only status headings use `typeScale.sectionTitle` at 20sp/800 (`WorkoutSessionPresentation.tsx:86-90`; `CalendarReadOnlyWorkout.tsx:58-67`; `PlannedWorkoutDetailScreen.tsx:138-143`; `theme/index.ts:92-97,192-202,241-251`). The approved Phase 16 contract permits only 11/14/16/22sp and weights 400/800 (`16-UI-SPEC.md:132-145`).
- **PASS — numeric facts use IBM Plex Mono.** Dates, weekdays, Previous, Result/Target, and set numbers use `calendarTypeScale.numeric` (`CalendarWeekRow.tsx:143-151`; `CalendarReadOnlyWorkout.tsx:89-98`; `PlannedWorkoutDetailScreen.tsx:172-180`).

### Pillar 5: Spacing (2/4)

- **PASS — the former full-height and responsive-spacing blockers are closed.** DEV-01 is exact, rows share remaining height, and scale-aware minimums drive vertical overflow (`CalendarScreen.tsx:579-601,741-761`; `CalendarWeekRow.tsx:39-49,84-90`; `CalendarMonthViewport.tsx:437-459`).
- **WARNING W-SPACE-01 — exact date-cell geometry is not carried through.** The approved 9dp cell radius is rounded to shared 8dp, the 28dp date circle has no fixed/minimum width or centering, and the event track has 2dp chip gaps but no required 2dp top offset (`CalendarWeekRow.tsx:203-223`; `theme/index.ts:43-47`; UI spec `:91-129,185-192`).
- **WARNING W-SPACE-02 — month controls do not implement the exact four-column contract.** They use a generic flex row with `space-between`, while the title has no flexible constrained slot; the contract requires `48dp / minmax(0,1fr) / 76dp / 48dp` with 3dp gaps (`CalendarScreen.tsx:709-726,907`; `16-UI-SPEC.md:185-188`).
- **WARNING W-SPACE-03 — undeclared/local row spacing remains.** `CalendarAgenda` uses `gap: 6` for its empty state even though reusable spacing is multiples of four and Calendar exceptions are 2/3/10/14/18dp (`CalendarAgenda.tsx:144-151`; `16-UI-SPEC.md:85-116`).

### Pillar 6: Experience Design (3/4)

- **PASS — state and interaction coverage is strong.** Loading/retained refresh/error/retry, empty/rest, exact 25% drag, cancellation, settle fallback, reduced motion, focused control sequencing, source refresh, and stale-result fencing are implemented (`CalendarScreen.tsx:287-358,365-479,572-599,727-735`; `calendarTransitionController.ts:170-315`; `CalendarMonthViewport.tsx:256-435`).
- **PASS — destinations are real and query-only.** All four destination kinds route by durable identity through narrow read adapters; Calendar stores and restores exact spatial/scroll/event focus after authoritative refresh (`app/(tabs)/calendar.tsx:97-126`; `CalendarRouteAdapters.tsx:38-175`; `CalendarScreen.tsx:490-544`).
- **WARNING W-XD-01 — Back entry focus is not deterministic on every Calendar-origin destination.** Completed/partial Strength and imported Garmin explicitly focus Back, but planned Strength and Calendar-origin Running only render `ScreenHeader backAction`; `ScreenHeader` neither accepts nor forwards a Back ref (`CalendarReadOnlyWorkout.tsx:29,38-52`; `ImportedActivityDetailScreen.tsx:491-498`; `PlannedWorkoutDetailScreen.tsx:123-190`; `RunningPlanDetailScreen.tsx:44-53`; `components/index.ts:599-670`). This leaves a source-level gap against `16-UI-SPEC.md:368-370` rather than a mere missing device screenshot.
- **WARNING W-XD-02 — 200% portrait month navigation lacks an overflow strategy.** Vertical month/focused content now scrolls correctly, but the 22sp month title is an unconstrained `Text` among fixed controls in a `space-between` row; there is no `numberOfLines`, shrink/min-width, or exact grid slot for 360dp at font scale 2 (`CalendarScreen.tsx:709-726,907`; UI spec `:202-208`). Existing coverage exercises font scale 2 only at 800×360 (`CalendarScreen.test.tsx:809-865`).
- **PASS — native deferral remains honest.** The host evidence fixture validates as `REVIEW_REQUIRED`, `all_pass:false`, with 9 native cases, 8 route journeys, and 14 comparisons. Phase 20-only native geometry, screenshot, focus, and performance execution was not converted into a Phase 16 deduction.

---

## Audit Trail and Verification

- Prior UI review: commit `b0d0e706`, **11/24**, with source-level BLOCK/FLAG findings.
- Current audited HEAD: `f152c965` on `fchoo/UX-revamp`.
- First-wave spatial/visual fixes confirmed reachable, including `34469139`, `4792920c`, `9101262f`, `8008fb0e`, and `fac51d3a`; merge `704537a9` is an ancestor of HEAD.
- Second-wave runtime/data/evidence fixes confirmed reachable through `f02cafdc`; merge `e7eea042` and closure record `51e33379` are ancestors of HEAD.
- Screenshot-safety gate passed: `.planning/ui-reviews/.gitignore` ignores PNG/WebP/JPEG/GIF/BMP/TIFF.
- Dev-server detection: ports 3000, 5173, and 8080 all returned no response; no screenshots were captured.
- Focused component/route gate: **11 suites, 114 tests passed**. One existing non-failing React `act(...)` warning was emitted by the Garmin route test harness.
- Calendar unit gate: **3 suites, 58 tests passed**.
- Calendar SQLite gate: **2 suites, 10 tests passed**.
- Evidence/comparison gate: **41 tests passed**.
- Host evidence verifier: `REVIEW_REQUIRED`, `all_pass:false`, 9 native cases, 8 route journeys, 14 comparisons — correct Phase 20 handoff behavior.
- `npm run typecheck`: **PASS**.
- `npm run check:boundaries`: **PASS**, 429 files.
- Registry audit: not applicable — `components.json` is absent and `16-UI-SPEC.md` declares no third-party registries.

Green host checks prove the covered state/route contracts. They do not override the untested or source-visible visual/type/focus discrepancies above.

---

## Files Audited

### Authority and prior audit

- `.planning/v1.2-OWNER-DECISIONS.md`
- `.planning/v1.2-OWNER-BRIEF.md`
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md`
- `.planning/phases/16-calendar-parity/16-CONTEXT.md`
- `.planning/phases/16-calendar-parity/16-UI-SPEC.md`
- `.planning/phases/16-calendar-parity/16-REFERENCE-MAP.json`
- `.planning/phases/16-calendar-parity/16-01-PLAN.md` through `16-07-PLAN.md`
- `.planning/phases/16-calendar-parity/16-01-SUMMARY.md` through `16-07-SUMMARY.md`
- `.planning/phases/16-calendar-parity/16-REVIEW.md`
- `.planning/phases/16-calendar-parity/16-REVIEW-FIX.md`
- Previous `.planning/phases/16-calendar-parity/16-UI-REVIEW.md`
- External approved Revision 18 `approved.json` (SHA-256 `b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf`)
- External approved Revision 18 `approved-hybrid.html` (SHA-256 `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`)

### Current implementation and routes

- `app/(tabs)/calendar.tsx`
- `app/session/[sessionId].tsx`
- `app/calendar/plan/[occurrenceId].tsx`
- `app/library/running/[planId].tsx`
- `app/garmin/activity/[activityId].tsx`
- `src/ui/screens/CalendarScreen.tsx`
- `src/ui/calendar/CalendarMonthViewport.tsx`
- `src/ui/calendar/CalendarWeekRow.tsx`
- `src/ui/calendar/CalendarAgenda.tsx`
- `src/ui/calendar/CalendarReadOnlyWorkout.tsx`
- `src/ui/calendar/CalendarRouteAdapters.tsx`
- `src/ui/calendar/calendarTransitionController.ts`
- `src/ui/calendar/calendarPorts.ts`
- `src/ui/screens/PlannedWorkoutDetailScreen.tsx`
- `src/ui/screens/RunningPlanDetailScreen.tsx`
- `src/ui/screens/ImportedActivityDetailScreen.tsx`
- `src/ui/components/WorkoutSessionPresentation.tsx`
- `src/ui/components/index.ts`
- `src/ui/theme/index.ts`
- `src/ui/layout/AdaptiveScreen.tsx`
- `src/platform/sqlite/repositories/trainingCalendarRepository.ts`

### Tests and evidence contracts

- `src/ui/__tests__/CalendarScreen.test.tsx`
- `src/ui/__tests__/CalendarTransitions.test.tsx`
- `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx`
- `src/ui/__tests__/SessionDetailScreen.test.tsx`
- `src/ui/__tests__/RunningPlanDetailScreen.test.tsx`
- `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx`
- `src/ui/calendar/CalendarAgenda.test.tsx`
- `src/ui/calendar/useCurrentLocalDate.test.tsx`
- `app/(tabs)/__tests__/calendar.test.tsx`
- `app/__tests__/calendar-plan-route.test.tsx`
- `app/__tests__/calendar-cross-destination-route.test.tsx`
- `app/__tests__/garmin-activity-route.test.tsx`
- `tests/sqlite-host/trainingCalendarRepository.test.ts`
- `tests/sqlite-host/trainingCalendarRepository.real.test.ts`
- `scripts/compare-v12-calendar.mjs`
- `scripts/verify-v12-native-evidence.mjs`
- `scripts/v12-calendar-comparison.test.mjs`
- `scripts/v12-evidence-scripts.test.mjs`
- `scripts/v12-calendar-evidence-coverage.test.mjs`
- `scripts/fixtures/v12-calendar-evidence/complete.json`

---

## Recommendation Count

- Priority fixes: 3
- Additional warnings: 8
- Blockers: 0
