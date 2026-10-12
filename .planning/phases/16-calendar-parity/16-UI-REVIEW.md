# Phase 16 — UI Review

**Audited:** 2026-10-13
**Baseline:** `.planning/v1.2-OWNER-DECISIONS.md` → `.planning/v1.2-OWNER-BRIEF.md` → `.planning/design/v1.2-SOURCE-PRECEDENCE.md` → approved Revision 18 `approved.json` / `approved-hybrid.html` → `16-UI-SPEC.md`
**Screenshots:** Not captured — no dev server responded on ports 3000, 5173, or 8080. Native screenshots/device checks remain Phase 20-deferred and were not scored as a Phase 16 defect.
**Scope:** Calendar root, month, focused agenda, event chips, Calendar-origin real destinations, Back/return focus, and Phase 16-owned host evidence only. Phase 19 and preserved Phase 14 dirty evidence were excluded.

---

## Verdict

**BLOCK — Phase 16 does not meet its host-verifiable UI contract.** The source and host tests prove strong transition semantics and safe destination authority, but they also prove material visual/accessibility divergence: the focused composition is ordered incorrectly, the month rows do not fill the viewport, 200% text and compact landscape cannot reflow/scroll, status fills use the wrong color model, and the Strength details are not the contracted Active-shaped layouts.

This block is based on current source structure, not on absent Phase 20 native evidence.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 3/4 | Core Calendar/key/loading/error/empty/read-only strings match, but agenda detail text is generic rather than factual and the contracted rest-day copy has no reachable Calendar state. |
| 2. Visuals | 1/4 | Focused mode puts both week rows above the agenda, month rows do not expand to fill the viewport, and Strength destinations are not Active-shaped. |
| 3. Color | 2/4 | Theme and DEV-02 tokens exist, but completed/partial chips and key samples use green/yellow fills instead of sport-tinted or neutral status treatments. |
| 4. Typography | 2/4 | The implementation uses 20sp headings and 14sp dates/weekdays instead of 22sp/16sp, and numeric Calendar text does not use IBM Plex Mono. |
| 5. Spacing | 2/4 | DEV-01 insets, 2dp gaps, and 48dp minima are present, but vertical row distribution and focused spatial ordering violate the full-height contract. |
| 6. Experience Design | 1/4 | Fixed-height tracks plus a non-scrollable root break 200% text/compact landscape, focused month controls bypass the ordered transition, and focus-clearance PASS data is synthetic rather than implemented proof. |

**Overall: 11/24**

---

## Top 3 Priority Fixes

1. **Rebuild the month/focused spatial composition** — The current focused screen cannot match Revision 18 because the following week is bottom-aligned inside a capped top viewport and the agenda is rendered afterward. Make month rows flex equally through the available height; in focused mode render selected week → agenda → following week, with the following row flush above bottom navigation. Keep row opacity at 1 during travel and apply the specified agenda fade delay/duration. Route Previous/Today/Next in focused mode through collapse → select → expand. (`src/ui/screens/CalendarScreen.tsx:404`, `src/ui/screens/CalendarScreen.tsx:504`, `src/ui/screens/CalendarScreen.tsx:575`, `src/ui/calendar/CalendarMonthViewport.tsx:58`)
2. **Make Calendar geometry truly text-scale and landscape responsive** — Replace `height: 28/17/36` with scale-aware minimums, let rows/chips grow at 200%, and provide vertical scrolling when the chrome plus six 48dp rows exceed available height. Add host layout assertions for font scale 2.0 and compact landscape; retain the exact 48dp non-overlapping target arithmetic at 360/390. (`src/ui/calendar/CalendarWeekRow.tsx:145`, `src/ui/screens/CalendarScreen.tsx:371`)
3. **Restore prototype color/detail fidelity** — Tint Complete/Partial chips from the current sport color, keep key status samples neutral, and replace the flat/generic Strength detail tables with the contracted Active-shaped exercise disclosures and four-column set rows. Extend the planned-occurrence facts contract to carry display names/previous values rather than rendering `Exercise N`. (`src/ui/calendar/CalendarWeekRow.tsx:117`, `src/ui/screens/CalendarScreen.tsx:548`, `src/ui/calendar/CalendarReadOnlyWorkout.tsx:48`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx:97`)

---

## Named Contract Checks

| Contract check | Result | Evidence |
|---|---|---|
| Fixed top date track | **FLAG** | The 28dp date and 36dp event tracks are top-anchored at 100% (`CalendarWeekRow.tsx:145-157`), but fixed `height` values contradict the requirement that they become minimums and grow at 200% (`16-UI-SPEC.md:191-192`). |
| 25% bidirectional month transitions | **PASS** | Inclusive distance-only `>= 25%` is centralized (`calendarTransitionController.ts:169-172`), applied in both drag directions (`CalendarMonthViewport.tsx:216-251`), and covered for next/previous, retreat, cancellation, and velocity independence (`CalendarTransitions.test.tsx:30-69`, `CalendarTransitions.test.tsx:185-190`). |
| Readable chips / full-width agenda actions | **FLAG** | Chips retain readable titles and two-event overflow; agenda rows are one 82dp-minimum target with no nested actions (`CalendarAgenda.tsx:98-140`). Fixed 17dp chip height can clip scaled text, and agenda result/target copy is generic (`CalendarAgenda.tsx:44-51`). |
| 3dp focus | **PASS with evidence caveat** | Shared `FocusablePressable` renders a 3dp outline (`src/ui/components/index.ts:315-321`; `src/ui/theme/index.ts:48-61`), and the real-route host test restores preferred focus (`calendar-cross-destination-route.test.tsx:292-328`). No source implements the claimed 4dp clearance. |
| 48dp targets | **PASS by host-source geometry** | DEV-01 formula is implemented (`CalendarScreen.tsx:319-320`); 360dp yields exactly 48dp cells after 6dp sides and six 2dp gaps, while 390dp yields ~48.86dp. Day, Info, Today, Back, and collapse controls have 48dp minima (`CalendarWeekRow.tsx:145-152`, `CalendarScreen.tsx:573-586`, `CalendarReadOnlyWorkout.tsx:98-103`). Native hit-bound proof remains Phase 20. |
| 200% text | **BLOCK** | The date, chip, and event tracks use fixed heights (`CalendarWeekRow.tsx:155-157`), the Calendar root explicitly disables scrolling (`CalendarScreen.tsx:371-375`), and there is no `fontScale` branch in Phase 16 Calendar source/tests. Required text will clip or make dates unreachable. |
| Light / Dark / System | **PASS at source-contract level** | The shared provider resolves Light/Dark/System and listens for system changes (`src/ui/theme/index.ts:299-311`, `src/ui/theme/index.ts:331-385`); Phase 16 consumes semantic tokens. Color-role fidelity still fails as described in Pillar 3. |
| Reduced motion | **PASS for semantic state; FLAG for normal-motion fidelity** | Reduced motion skips settle commands while preserving destinations (`calendarTransitionController.ts:117-145`, `calendarTransitionController.ts:209-220`). Normal focused motion does not use the command's agenda fade timing and fades the week overlays themselves (`CalendarMonthViewport.tsx:71-77`, `CalendarMonthViewport.tsx:152-178`). |
| Real read-only destinations | **PASS for routes/authority; BLOCK for Strength visual fidelity** | Host journeys load real Strength, Running, and Garmin destinations and prove zero mutation (`calendar-cross-destination-route.test.tsx:351-478`). Running and Garmin hide management actions, but completed/planned Strength details are flat generic stacks rather than the required Active-shaped hierarchy. |
| Return focus | **PASS for host interaction** | Calendar stores month/date/mode/scroll/event identity and restores the invoking row after Back (`CalendarScreen.tsx:122-128`, `CalendarScreen.tsx:255-287`); the real-route host test verifies preferred focus (`calendar-cross-destination-route.test.tsx:321-328`). |

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **PASS — Core copy contract is implemented.** `Calendar`, `Today`, key labels/introduction, `Updating Calendar`, load error/retry, empty agenda, read-only statuses, unavailable states, and Back labels match the UI spec (`CalendarScreen.tsx:322-400`, `CalendarScreen.tsx:541-563`, `CalendarAgenda.tsx:79-90`, `PlannedWorkoutDetailScreen.tsx:82-104`, `CalendarReadOnlyWorkout.tsx:35-60`).
- **FLAG — Agenda rows substitute category placeholders for source facts.** `Completed result`, `Partial result`, and `Planned target` are hardcoded instead of displaying the contracted one-line actual result/target (`CalendarAgenda.tsx:44-51`, UI spec `:263`). This weakens the compact row's information hierarchy.
- **FLAG — Rest-day language is unreachable.** The contract requires `Recovery is the plan` plus the schedule summary, but `CalendarRange` carries events only and zero events always become `No workout` (`src/ui/calendar/calendarPorts.ts:6-14`, `src/domains/history/calendar.ts:54-68`, `CalendarAgenda.tsx:79-85`). Rest and empty therefore collapse into one meaning.
- **FLAG — Strength destination headings are generic.** Completed/partial history uses `Workout details`, and planned Strength uses `Workout preview`; neither surfaces the factual workout/plan name shown by Revision 18 (`CalendarReadOnlyWorkout.tsx:39-59`, `PlannedWorkoutDetailScreen.tsx:97-115`).

### Pillar 2: Visuals (1/4)

- **BLOCK — Focused hierarchy is structurally reversed.** The approved composition is selected week at top, agenda in the middle, and following week at the bottom. Current source caps the entire grid/overlay region at 260dp and renders `agendaRegion` after it (`CalendarScreen.tsx:404-539`, `CalendarScreen.tsx:572-576`). `CalendarMonthViewport` bottom-aligns the following row inside that capped region (`CalendarMonthViewport.tsx:58-80`, `:294-303`), so both week rows sit above the agenda rather than bracketing it.
- **BLOCK — Month mode is not full-height.** `CalendarWeekRow` has no vertical flex/equal-row rule (`CalendarWeekRow.tsx:144-162`). Rows keep natural content height instead of taking equal shares of the remaining viewport, leaving unused space on tall screens and diverging from Revision 18's full-height month (`16-UI-SPEC.md:185-192`).
- **FLAG — Week morph loses spatial continuity.** The source month rows are hidden while overlay opacity animates from 0→1 or 1→0 (`CalendarScreen.tsx:446-480`, `CalendarMonthViewport.tsx:71-77`). Revision 18 moves opaque measured rows and fades the agenda, not the rows themselves. The command's `agendaDelayMs`/`agendaDurationMs` are never consumed.
- **BLOCK — Strength read-only destinations are not Active-shaped.** Historical sets render as four vertically stacked text nodes per row, with a one-string pseudo-header (`CalendarReadOnlyWorkout.tsx:75-86`, `:98-103`). Planned detail flattens all targets, labels exercises as `Exercise N`, and has no exercise disclosures or workout title (`PlannedWorkoutDetailScreen.tsx:92-126`). This materially diverges from the approved exercise-card/four-column detail.
- **FLAG — The Calendar Info action is a text `i`, not the specified 24dp outlined Lucide icon.** (`CalendarScreen.tsx:327-342`; UI spec `:68`).

### Pillar 3: Color (2/4)

- **PASS — Palette and owner-approved Strength title token exist.** Light uses `#9B470B` for Strength title text while retaining `#D97820`; Dark resolves Strength text to `#D97820` (`src/ui/theme/index.ts:211-231`). Light/Dark/System resolution is centralized.
- **FLAG — Status fill is incorrectly encoded as green/yellow.** Completed chips use `greenBg`; partial chips use `yellowBg`, regardless of sport (`CalendarWeekRow.tsx:117-130`). The contract requires the current sport's 14%/18% tint while solid/dotted/dashed geometry carries status (`16-UI-SPEC.md:166-179`). This adds a competing completion hue and breaks the sport/status role split.
- **FLAG — Calendar key status samples are not neutral.** The Complete and Partial samples hardcode green/yellow translucent backgrounds (`CalendarScreen.tsx:574-583`) even though the key must use neutral primary-text samples. The colors are also hardcoded instead of semantic theme mixing.
- **PASS — Selected/today and sport rails use semantic blue/orange roles.** Selected cells, today rings, agenda rails, and action accents use shared tokens (`CalendarWeekRow.tsx:95-130`, `CalendarAgenda.tsx:126-139`).

### Pillar 4: Typography (2/4)

- **FLAG — The exact four-size contract is not implemented.** Phase 16 requires 11/14/16/22sp; the shared scale supplies 14/16/20sp, while chips override to 11sp (`src/ui/theme/index.ts:84-119`, `CalendarWeekRow.tsx:155-157`). Month/detail headings are 20sp instead of 22sp, and dates/weekdays use 14sp instead of 16sp (`CalendarScreen.tsx:378-418`, `CalendarWeekRow.tsx:105-106`).
- **FLAG — Calendar numeric roles use the interface font.** Dates and weekday labels consume `typeScale.label`, whose family is Archivo/interface, not IBM Plex Mono (`src/ui/theme/index.ts:114-119`, `CalendarWeekRow.tsx:105-106`, `CalendarScreen.tsx:418`). This loses the prototype's tabular numeric rhythm.
- **PASS — Calendar-owned explicit weights remain within 400/800.** Chips use 800, and shared body/emphasis roles use 400/800. No extra Phase 16 weight was introduced.
- **BLOCK (cross-pillar accessibility) — Fixed track heights cannot contain 200% text.** `height: 28`, `height: 17`, and `height: 36` are not scale-aware minimums (`CalendarWeekRow.tsx:155-157`).

### Pillar 5: Spacing (2/4)

- **PASS — DEV-01 and compact cell spacing are implemented exactly at source level.** The adaptive inset formula is exact (`CalendarScreen.tsx:319-320`); cells use 2dp horizontal spacing and 3dp vertical padding (`CalendarWeekRow.tsx:145-162`); agenda rows use the contracted 5dp rail, 10dp gap/padding, and 82dp minimum (`CalendarAgenda.tsx:148-155`).
- **PASS — Required touch minima are present.** Day cells and all explicit Calendar actions are at least 48dp (`CalendarWeekRow.tsx:145-152`, `CalendarScreen.tsx:573-586`, `CalendarReadOnlyWorkout.tsx:98-103`).
- **FLAG — Vertical distribution does not follow the spacing/geometry contract.** Month week rows do not use equal flex shares, and focused mode uses a hard `maxHeight: 260` instead of deriving selected/agenda/following regions from available height (`CalendarScreen.tsx:571-589`).
- **FLAG — Focus clearance is not implemented.** `FocusablePressable` sets a 3dp outline but no 4dp outline offset/clearance (`src/ui/components/index.ts:315-321`). With 2dp day gaps and viewport clipping, the ring can collide with adjacent cells or be clipped. Phase 20 measurement remains deferred, but the source does not encode the claimed clearance.

### Pillar 6: Experience Design (1/4)

- **BLOCK — 200% text and compact landscape can make dates/actions unreachable.** Calendar opts out of `AdaptiveScreen` scrolling (`CalendarScreen.tsx:371-375`), `CalendarMonthViewport` clips overflow (`CalendarMonthViewport.tsx:311-315`), and day tracks are fixed-height. The required landscape fallback scroll and 2.0 text reflow are absent from source and host tests.
- **FLAG — Month controls in focused mode bypass the required sequence.** `navigateMonth` always dispatches a direct `move` (`CalendarScreen.tsx:207-218`); `transitionCalendar` settles the month without collapsing/re-expanding when `mode === "focused"` (`calendarTransitionController.ts:221-228`). The contract requires focused Previous/Today/Next to use the ordered adjacent-week transition.
- **PASS — Bidirectional drag behavior is well implemented.** The UI thread follows pointer displacement 1:1, the title switches at the inclusive threshold in both directions, velocity cannot settle, vertical intent is yielded, and stale completions are epoch-fenced (`CalendarMonthViewport.tsx:193-275`, `calendarTransitionController.ts:181-245`).
- **PASS — Source-backed loading/error/retained refresh and deterministic reduced-motion semantics are present.** (`CalendarScreen.tsx:136-166`, `:395-424`; `calendarTransitionController.ts:117-145`, `:209-220`).
- **PASS — Real route authority is safe.** Completed/partial Strength, planned Strength, planned Running, and imported Running load real destinations by durable identity; Calendar-origin Running/Garmin screens suppress management actions; Back restores the invoking Calendar row. The 51 focused component tests and 51 focused unit tests passed.
- **FLAG — The evidence fixture asserts visual focus clearance it does not prove.** Host route rows are marked `PASS` with `focus.clearance_dp: 4` (`scripts/fixtures/v12-calendar-evidence/complete.json:44-52`), while the route test only checks preferred focus plus the 3dp token (`calendar-cross-destination-route.test.tsx:321-328`) and the shared source has no 4dp offset. The aggregate correctly remains `REVIEW_REQUIRED`, but this field must not be treated as visual PASS evidence.
- **PASS — Native deferral is honestly represented overall.** The fixture is `host_only_fixture: true`, all nine native cases are `NOT_RUN`/`REVIEW_REQUIRED`, DEV-01/02 technical evidence is incomplete, and `all_pass` is false (`scripts/fixtures/v12-calendar-evidence/complete.json:1-42`, `:55-81`). Missing Phase 20 execution is therefore not a Phase 16 warning by itself.

---

## Verification Performed

- `npm run test:components -- --runInBand ...Phase 16 Calendar suites...` — **PASS**, 8 suites / 51 tests.
- `npm run test:unit -- --runInBand src/domains/scheduling/localDate.test.ts src/domains/history/calendar.test.ts src/bootstrap/phase16CalendarTestControls.test.ts` — **PASS**, 3 suites / 51 tests.
- `npm run test:evidence:v12:calendar` — **PASS**, 12 tests; verifies fail-closed `REVIEW_REQUIRED`/`NOT_RUN` behavior.
- `node scripts/verify-v12-native-evidence.mjs --fixture scripts/fixtures/v12-calendar-evidence/complete.json` — **PASS as contract validation**, result `REVIEW_REQUIRED`, `all_pass: false`, 9 native cases / 8 route journeys / 14 comparisons.
- `npm run typecheck` — **PASS**.
- `npm run check:boundaries` — **PASS**, 422 files.

These green checks do not upgrade visual findings that the suites do not assert.

---

## Files Audited

### Authority and prototype

- `.planning/v1.2-OWNER-DECISIONS.md`
- `.planning/v1.2-OWNER-BRIEF.md`
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md`
- `.planning/phases/16-calendar-parity/16-CONTEXT.md`
- `.planning/phases/16-calendar-parity/16-UI-SPEC.md`
- `.planning/phases/16-calendar-parity/16-REFERENCE-MAP.json`
- `.planning/phases/16-calendar-parity/16-01-PLAN.md` through `16-07-PLAN.md`
- `.planning/phases/16-calendar-parity/16-01-SUMMARY.md` through `16-07-SUMMARY.md`
- External approved Revision 18 `approved.json` and `approved-hybrid.html` (SHA-256 verified as `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`)
- Tracked Revision 18 Calendar reference images under `.planning/design/v1.2-browser-evidence/`

### Phase 16 implementation and destinations

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
- `src/ui/calendar/calendarTransitionController.ts`
- `src/ui/calendar/calendarPorts.ts`
- `src/ui/screens/PlannedWorkoutDetailScreen.tsx`
- `src/ui/screens/RunningPlanDetailScreen.tsx`
- `src/ui/screens/ImportedActivityDetailScreen.tsx`
- `src/domains/history/calendar.ts`
- `src/domains/scheduling/localDate.ts`
- `src/platform/sqlite/repositories/trainingCalendarRepository.ts`
- Shared Phase 14 dependencies consumed by Calendar: `src/ui/theme/index.ts`, `src/ui/components/index.ts`, `src/ui/layout/AdaptiveScreen.tsx`, and `src/ui/components/BottomSheet.tsx`

### Host tests and evidence contracts

- `src/ui/__tests__/CalendarScreen.test.tsx`
- `src/ui/__tests__/CalendarTransitions.test.tsx`
- `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx`
- `src/ui/__tests__/SessionDetailScreen.test.tsx`
- `app/(tabs)/__tests__/calendar.test.tsx`
- `app/__tests__/calendar-plan-route.test.tsx`
- `app/__tests__/calendar-cross-destination-route.test.tsx`
- `app/__tests__/garmin-activity-route.test.tsx`
- `src/domains/history/calendar.test.ts`
- `src/domains/scheduling/localDate.test.ts`
- `src/bootstrap/phase16CalendarTestControls.ts` and test
- `scripts/compare-v12-calendar.mjs`
- `scripts/verify-v12-native-evidence.mjs`
- `scripts/v12-calendar-comparison.test.mjs`
- `scripts/v12-evidence-scripts.test.mjs`
- `scripts/fixtures/v12-calendar-evidence/complete.json`

`components.json` is absent and the approved UI spec declares no third-party registries; registry safety auditing is not applicable.
