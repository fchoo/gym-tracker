# Phase 16 — UI Review

**Audited:** 2026-10-13
**Baseline:** `.planning/v1.2-OWNER-DECISIONS.md` → `.planning/v1.2-OWNER-BRIEF.md` → `.planning/design/v1.2-SOURCE-PRECEDENCE.md` → approved Revision 18 `approved.json` / `approved-hybrid.html` → `16-UI-SPEC.md`
**Source:** `fchoo/UX-revamp` at `efb0e4ba99763d01645dbc055e8c2a870384a9a8`
**Screenshots:** Not captured — no web dev server responded on ports 3000, 5173, or 8080. Native screenshots, physical focus/geometry, and release/profile checks remain Phase 20-deferred and do not reduce this score.
**Scope:** Definitive code-and-host-test re-audit of the current merged Phase 16 source, including every prior warning and the owner-requested date/Today/agenda/Collapse geometry, exact typography, icons, key swatches, spacing, 360dp at font scale 2, focus/48dp behavior, composition, motion, status encoding, and Calendar-origin details.

---

## Verdict

**WARNING — the required 24/24 gate is not met.** The final UI-fix commits close the date atom, Today treatment, flat-row surface, month-control, declared agenda/planned icons, Activity swatch presence, empty-state gap, ready-detail typography, planned/Running Back focus, and 360dp/font-scale-2 warnings covered by their regression tests.

The current merged source still has five contract-level warning findings: the focused agenda and Calendar-key atoms do not match the Revision 18 geometry; historical set-state marks are text glyphs rather than the declared Lucide icons; Calendar-key and non-ready Calendar detail headings still resolve to the shared 20sp typography outside the exact four-size contract; and historical loading/error/missing routes do not deterministically focus Back while exercise disclosures swap icons immediately instead of using the specified 160ms rotation.

**Gate result:** 0 BLOCKER, 5 WARNING findings, 0 REGISTRY FLAG. Required zero-warning / 24-of-24 result: **not achieved**.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Exact Calendar, state, retry, agenda, and read-only wording is present; the scoped generic-label scan is clean. |
| 2. Visuals | 3/4 | Core date/Today/Collapse composition is repaired, but agenda/key micro-composition and historical state icons still diverge from the contract/oracle. |
| 3. Color | 4/4 | Theme roles, DEV-02, sport/status separation, transparent base surfaces, and neutral status samples are correctly sourced. |
| 4. Typography | 3/4 | Ready surfaces use the exact Calendar scale, but the Calendar key and several non-ready detail headings still inherit 20sp shared headings. |
| 5. Spacing | 3/4 | Date cells, month controls, adaptive inset, and prior 6dp gap are fixed; agenda rails and key swatches retain non-oracle geometry. |
| 6. Experience Design | 3/4 | Core state, motion, routing, focus-return, and 360dp behavior pass, but historical non-ready Back focus and 160ms disclosure motion remain absent. |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **Apply Calendar typography to every rendered state** — Calendar-key and loading/error/missing detail headings render at shared `typeScale.screenTitle` / `typeScale.sectionTitle` 20sp, outside the required 11/14/16/22sp set. Add scoped typography overrides to `BottomSheet` and `EmptyState`, and pass `calendarTypeScale.heading` to every Calendar-origin `ScreenHeader`; add tests for key, loading, error, and missing states. (`src/ui/components/BottomSheet.tsx:339`, `src/ui/components/index.ts:658`, `src/ui/components/index.ts:764`, `src/ui/calendar/CalendarRouteAdapters.tsx:21-35`, `src/ui/calendar/CalendarRouteAdapters.tsx:76-85`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx:129-136`)
2. **Finish exact agenda and key geometry** — The agenda row uses centered flex layout with an 82dp full-height rail instead of the contracted top-aligned `5dp / content / 24dp` composition with 10dp row padding and a 62dp inset rail; Activity swatches are 12×12 squares instead of Revision 18's 24×8, 2dp-radius bars. Match the source geometry and strengthen the tests beyond presence/color. (`src/ui/calendar/CalendarAgenda.tsx:123-150`, `src/ui/screens/CalendarScreen.tsx:927-949`, `approved-hybrid.html:1144-1150`, `approved-hybrid.html:1195-1204`)
3. **Complete detail icon, motion, and entry-focus fidelity** — Replace historical `✓` / `—` state glyphs with 24dp, 2dp-stroke Lucide Check/Dash; animate disclosure chevrons through the required 160ms rotation with immediate reduced-motion behavior; and pass/focus a Back ref in historical loading/error/missing branches. (`src/ui/calendar/CalendarReadOnlyWorkout.tsx:38-40`, `src/ui/calendar/CalendarReadOnlyWorkout.tsx:91-99`, `src/ui/components/WorkoutSessionPresentation.tsx:70-93`, `src/ui/screens/PlannedWorkoutDetailScreen.tsx:160-193`, `src/ui/calendar/CalendarRouteAdapters.tsx:21-35`, `src/ui/calendar/CalendarRouteAdapters.tsx:76-85`)

---

## Prior 11-Warning Re-audit

| Prior warning | Final result | Current evidence |
|---|---|---|
| W-UI-01 — date-cell atoms / Today ring | **CLOSED** | Ordinary cells reserve a transparent 1dp border and use 9dp radius; the Today ring is centered at 28dp; the event track has its 2dp top offset. (`CalendarWeekRow.tsx:132-153`, `CalendarWeekRow.tsx:203-223`) |
| W-UI-02 — agenda / Collapse composition | **PARTIAL** | Collapse is now a 48dp Lucide action inside the heading, and event rows are transparent with only a bottom divider. Row alignment/padding and rail height still differ from the contracted Revision 18 grid. (`CalendarScreen.tsx:658-684`, `CalendarAgenda.tsx:123-150`) |
| W-UI-03 — Lucide icon fidelity | **PARTIAL** | Agenda Chevron and planned-detail Chevron/Dash are now Lucide 24dp/2dp. Historical set states still render text `✓` / `—`, and disclosure icons swap without the specified rotation. (`CalendarAgenda.tsx:136`, `PlannedWorkoutDetailScreen.tsx:175-194`, `CalendarReadOnlyWorkout.tsx:91-99`) |
| W-COLOR-01 — surface/accent distribution | **CLOSED** | Ordinary cells, Today, and agenda rows are transparent at rest; pressed feedback uses a secondary surface. (`CalendarWeekRow.tsx:132-139`, `CalendarAgenda.tsx:123-126`, `CalendarScreen.tsx:731-744`) |
| W-COLOR-02 — Activity key swatches | **CLOSED for color/presence** | Orange Strength and blue Running swatches are rendered from semantic tokens. Exact shape/size remains under the spacing finding. (`CalendarScreen.tsx:890-900`) |
| W-TYPE-01 — exact Calendar typography | **PARTIAL** | Ready Calendar and Calendar-origin detail facts now use `calendarTypeScale`, Archivo, and IBM Plex Mono correctly, but shared key/non-ready headings still introduce 20sp. (`theme/index.ts:146-186`, `CalendarReadOnlyWorkout.tsx:54-105`, `PlannedWorkoutDetailScreen.tsx:144-193`, `RunningPlanDetailScreen.tsx:40-54`, `ImportedActivityDetailScreen.tsx:44-54`) |
| W-SPACE-01 — exact date-cell geometry | **CLOSED** | 9dp cell radius, centered 28dp date ring, 2dp chip gap/top offset, and 2dp row gaps now match the contract. (`CalendarWeekRow.tsx:203-223`) |
| W-SPACE-02 — exact month-control columns | **CLOSED** | The source retains 48 / flex-minmax / 76 / 48 slots, 3dp gaps, and shrink-safe title ellipsis. (`CalendarScreen.tsx:715-749`, `CalendarScreen.tsx:939-950`) |
| W-SPACE-03 — undeclared 6dp gap | **CLOSED** | The empty agenda now uses `space[1]` (4dp), not an undeclared 6dp value. (`CalendarAgenda.tsx:145-150`) |
| W-XD-01 — deterministic planned / Running Back focus | **CLOSED** | Planned Strength and Calendar-origin Running preserve Back as the preferred target in loading, error, missing, and ready states. (`PlannedWorkoutDetailScreen.tsx:92-96`, `RunningPlanDetailScreen.tsx:44-54`; focused tests pass.) |
| W-XD-02 — 360dp / 200% month controls | **CLOSED** | The 360×800/fontScale-2 regression proves the 48/76/48 actions remain present, enabled, and activatable while the title ellipsizes semantically. (`CalendarScreen.test.tsx:864-906`) |

**Reconciliation:** 8 closed, 3 partially closed. The historical non-ready focus gap is an additional current-source finding exposed by the final full audit.

---

## Requested Contract Checks

| Contract check | Final result | Evidence |
|---|---|---|
| Date / Today geometry | **PASS** | Transparent 1dp base border, 9dp cell radius, centered 28dp Today ring, and 2dp event offset are implemented and regression-tested. (`CalendarWeekRow.tsx:132-153`, `CalendarScreen.test.tsx:432-450`) |
| Agenda / Collapse geometry | **WARNING** | Heading-contained 48dp Collapse and flat row surfaces pass; exact row alignment/padding/rail geometry remains different. (`CalendarScreen.tsx:658-684`, `CalendarAgenda.tsx:123-150`, `16-UI-SPEC.md:262-269`) |
| Exact fonts / sizes / weights | **WARNING** | Bundled Archivo/IBM fonts and ready-state 11/14/16/22sp, 400/800 roles pass; shared key/non-ready headings still render at 20sp. (`theme/index.ts:18-31`, `theme/index.ts:146-186`, `BottomSheet.tsx:339`, `components/index.ts:764`) |
| Lucide icons / Activity swatches / gaps | **WARNING** | Named agenda, planned-detail, Collapse, Info, Settings, Previous, and Next icons are Lucide and the 6dp gap is gone; historical state glyphs and exact swatch shape remain divergent. (`CalendarAgenda.tsx:1-2`, `PlannedWorkoutDetailScreen.tsx:1-3`, `CalendarScreen.tsx:608-631`, `CalendarScreen.tsx:888-949`) |
| 360dp / fontScale 2 | **PASS at source/host level** | DEV-01 computes 6dp at 360; date/event tracks scale; controls retain 48/76/48 geometry; compact-height agenda remains reachable. (`CalendarMonthViewport.tsx:56-69`, `CalendarScreen.test.tsx:835-939`) |
| Focus / 48dp | **WARNING** | Date, month, Collapse, agenda and ready-detail targets use ≥48dp plus the 3dp/4dp focus contract. Historical session loading/error/missing branches do not assign a Back ref or preferred focus. (`components/index.ts:239-336`, `CalendarRouteAdapters.tsx:21-35`, `CalendarRouteAdapters.tsx:76-85`, `16-UI-SPEC.md:364-370`) |
| Composition / motion / status / details | **WARNING** | Full-height month/focused composition, 1:1 drag, inclusive 25%, exact month/week timings, reduced-motion state order, status patterns, durable query-only destinations, and return focus pass. The separate 160ms disclosure rotation is not implemented. (`calendarTransitionController.ts:66-70`, `calendarTransitionController.ts:118-146`, `CalendarMonthViewport.tsx:269-344`, `WorkoutSessionPresentation.tsx:70-93`, `16-UI-SPEC.md:241-251`) |
| Native screenshots/device proof | **PHASE 20 DEFERRED — NOT SCORED** | No deduction is applied for absent native screenshots, physical focus checks, or device-only geometry/performance evidence. |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — exact source-led wording is intact.** Calendar title/actions/key copy, loading/updating/error/retry, empty/rest, event counts, read-only statuses, unavailable states, and Back labels match `16-UI-SPEC.md:299-326` in the implemented surfaces (`CalendarScreen.tsx:608-631`, `CalendarScreen.tsx:658-703`, `CalendarAgenda.tsx:72-80`, `CalendarRouteAdapters.tsx:21-35`, `PlannedWorkoutDetailScreen.tsx:129-149`).
- **PASS — no generic CTA regression.** The scoped scan found no `Submit`, `Click Here`, bare `OK`, bare `Cancel`, or bare `Save` labels.
- **PASS — factual summaries remain source-backed.** Agenda text consumes `displaySummary` and `sourceLabel`; rest and empty states remain distinct (`CalendarAgenda.tsx:72-80`, `CalendarAgenda.tsx:95-136`).

### Pillar 2: Visuals (3/4)

- **PASS — the main Calendar hierarchy is materially corrected.** The full-height month/focused ordering, exact date atom, transparent Today action, heading-contained Collapse, flat event rows, and named Lucide agenda/planned-detail icons now match the intended hierarchy (`CalendarWeekRow.tsx:132-195`, `CalendarScreen.tsx:658-749`, `CalendarAgenda.tsx:123-150`, `PlannedWorkoutDetailScreen.tsx:159-197`).
- **WARNING W-VIS-01 — agenda and key micro-composition is still not oracle-exact.** Revision 18 uses top-aligned agenda columns with 10dp row padding, a 62dp inset rail, and 24×8 rounded sport swatches. Current rows center content, apply vertical padding only to the copy column, stretch the rail to at least 82dp, and render 12×12 square swatches (`CalendarAgenda.tsx:145-150`, `CalendarScreen.tsx:927-949`; oracle `approved-hybrid.html:1144-1150`, `approved-hybrid.html:1195-1204`).
- **WARNING W-VIS-02 — historical set-state marks do not use the declared icon set.** The read-only historical table emits `✓ Complete` / `— Not completed` as text instead of decorative Lucide Check/Dash icons plus semantic labels (`CalendarReadOnlyWorkout.tsx:91-99`; contract `16-UI-SPEC.md:68`, `16-UI-SPEC.md:268`).

### Pillar 3: Color (4/4)

- **PASS — semantic palette and role separation are correct.** DEV-02 resolves Light Strength title to `#9B470B` while retaining `#D97820` for the sport border/rail/swatch; Dark retains `#D97820`. Running uses the blue role, selected/Today/action use blue, and status uses solid/dotted/dashed treatment rather than a second sport hue (`theme/index.ts:275-297`, `CalendarWeekRow.tsx:154-191`, `CalendarScreen.tsx:890-915`).
- **PASS — prior surface overuse is closed.** Ordinary cells, Today, and agenda rows are transparent at rest and use semantic pressed surfaces only during interaction (`CalendarWeekRow.tsx:132-139`, `CalendarAgenda.tsx:123-126`, `CalendarScreen.tsx:731-744`).
- **Distribution scan:** 51 `textSecondary`, 49 `textPrimary`, 11 `divider`, 7 `line`, 8 `blue`, 4 `orange`, 4 `completed`, 4 `surface`, and 2 `blueBg` references across the audited files. No hardcoded color literal exists in Phase 16-owned UI files; the only scoped shared literal is the approved modal scrim in `BottomSheet.tsx:380`.

### Pillar 4: Typography (3/4)

- **PASS — the corrected ready surfaces use the exact families and roles.** `calendarTypeScale` contains only 11/14/16/22sp and 400/800 with Archivo and IBM Plex Mono; Calendar dates, month headings, historical Strength, planned Strength, Calendar-origin Running, and Calendar-origin imported facts now select those roles (`theme/index.ts:146-186`, `CalendarReadOnlyWorkout.tsx:54-105`, `PlannedWorkoutDetailScreen.tsx:144-193`, `RunningPlanDetailScreen.tsx:40-54`, `ImportedActivityDetailScreen.tsx:44-54`, `ImportedActivityDetailScreen.tsx:128-175`).
- **WARNING W-TYPE-01 — the exact four-size rule is not applied to every Calendar-owned state.** The Calendar key heading uses `BottomSheet`'s 20sp `typeScale.screenTitle`; historical and planned Strength loading/error/missing headers omit the available Calendar title override; their `EmptyState` headings use 20sp `typeScale.sectionTitle`. That is source-visible use of an undeclared Phase 16 size (`BottomSheet.tsx:331-341`, `components/index.ts:654-660`, `components/index.ts:756-768`, `CalendarRouteAdapters.tsx:21-35`, `CalendarRouteAdapters.tsx:76-85`, `PlannedWorkoutDetailScreen.tsx:129-136`; contract `16-UI-SPEC.md:132-143`).

### Pillar 5: Spacing (3/4)

- **PASS — the high-risk Calendar geometry now matches.** DEV-01 computes the approved adaptive inset; 360dp gives seven non-overlapping 48dp day targets with 2dp gaps; month navigation is 48 / flexible / 76 / 48 with 3dp gaps; date cells use 3dp vertical and 2dp horizontal padding, 9dp radius, 28dp date tracks, and 2dp event gaps/offsets (`CalendarMonthViewport.tsx:56-69`, `CalendarWeekRow.tsx:203-223`, `CalendarScreen.tsx:715-749`, `CalendarScreen.tsx:939-952`).
- **PASS — the undeclared 6dp gap is removed.** Empty agenda content now uses the 4dp `space[1]` token (`CalendarAgenda.tsx:145-150`).
- **WARNING W-SPACE-04 — agenda/key dimensions remain off-oracle.** Current 82dp full-height rails and 12×12 square sport swatches do not match the 62dp inset agenda rail and 24×8, 2dp-radius sport swatches in Revision 18 (`CalendarAgenda.tsx:145-150`, `CalendarScreen.tsx:927-949`; oracle `approved-hybrid.html:1144-1150`, `approved-hybrid.html:1198-1204`).

### Pillar 6: Experience Design (3/4)

- **PASS — core interaction/state coverage is strong.** Source and tests cover loading, retained refresh, errors/retry, empty/rest, stale/missing identities, disabled authoritative replacement, exact 25% distance-only month settling, 7dp/1.15 intent arbitration, first/middle/last measured row morph, adjacent collapse → select/focus → expand, reduced-motion equivalence, duplicate-settle fencing, real query-only destinations, and agenda return focus (`calendarTransitionController.ts:66-70`, `calendarTransitionController.ts:170-315`, `CalendarMonthViewport.tsx:241-355`, `CalendarRouteAdapters.tsx:38-177`).
- **PASS — the requested host checks are green.** The re-audit ran 11 focused component/route suites with 134/134 tests passing, two civil-date/event unit suites with 52/52 tests passing, the Today hook suite with 2/2 tests passing, TypeScript, and the 429-file boundary check. The Garmin route suite emitted the existing non-failing React `act(...)` warning.
- **WARNING W-XD-03 — detail focus and disclosure motion are incomplete.** Planned Strength, Running, imported activity, and ready historical details focus Back, but historical session loading/error/missing branches construct `ScreenHeader` without a Back ref and therefore do not establish the required initial Back focus. Historical and planned exercise disclosures also replace right/down icons immediately; no 160ms rotation or reduced-motion branch exists (`CalendarRouteAdapters.tsx:21-35`, `CalendarRouteAdapters.tsx:76-85`, `WorkoutSessionPresentation.tsx:70-93`, `PlannedWorkoutDetailScreen.tsx:160-193`; contract `16-UI-SPEC.md:241-251`, `16-UI-SPEC.md:362-372`).

---

## Audit Trail and Verification

- Prior UI review baseline: source `57774f77`, **17/24**, 0 blockers, 8 open warnings.
- Current audited HEAD: `efb0e4ba99763d01645dbc055e8c2a870384a9a8` on `fchoo/UX-revamp`.
- UI fixes inspected: `df151e3f` (date atoms), `5f2adbb4` (agenda/Collapse), `e9c574cc` (icons/key), and `9b6b4699` (Calendar detail typography), merged by `efb0e4ba`.
- Screenshot-safety gate: existing `.planning/ui-reviews/.gitignore` covers PNG/WebP/JPEG/GIF/BMP/TIFF.
- Dev-server detection: ports 3000, 5173, and 8080 returned no response; no web screenshots were captured.
- Focused component/route verification: **11 suites, 134 tests passed**.
- Civil-date/event unit verification: **2 suites, 52 tests passed**.
- Current-date hook verification: **1 suite, 2 tests passed**.
- Static verification: TypeScript passed; boundary policy passed for 429 files; scoped generic-label scan returned zero matches; scoped Phase 16 UI hardcoded-color scan returned zero matches.
- Registry audit: not applicable — `components.json` is absent, `shadcn_initialized` is false, and `16-UI-SPEC.md` declares no third-party registries.
- Native screenshots/device proof: Phase 20-deferred by owner instruction and not scored here.

Passing tests establish the covered host contracts. They do not erase the source-visible typography, geometry, icon, focus, or disclosure-motion differences listed above.

---

## Files Audited

### Authority and implementation records

- `.planning/v1.2-OWNER-DECISIONS.md`
- `.planning/v1.2-owner-decisions.json`
- `.planning/v1.2-OWNER-BRIEF.md`
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md`
- `.planning/design/v1.2-DEVIATIONS.md`
- `.planning/phases/16-calendar-parity/16-CONTEXT.md`
- `.planning/phases/16-calendar-parity/16-UI-SPEC.md`
- `.planning/phases/16-calendar-parity/16-01-PLAN.md` through `16-07-PLAN.md`
- `.planning/phases/16-calendar-parity/16-01-SUMMARY.md` through `16-07-SUMMARY.md`
- `.planning/phases/16-calendar-parity/16-REVIEW-FIX.md`
- Previous `.planning/phases/16-calendar-parity/16-UI-REVIEW.md`
- External Revision 18 `approved.json` (SHA-256 `b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf`)
- External Revision 18 `approved-hybrid.html` (SHA-256 `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`)
- External `design-audit-revision18.md`

### Current implementation and routes

- `app/(tabs)/calendar.tsx`
- `src/ui/screens/CalendarScreen.tsx`
- `src/ui/calendar/CalendarMonthViewport.tsx`
- `src/ui/calendar/CalendarWeekRow.tsx`
- `src/ui/calendar/CalendarAgenda.tsx`
- `src/ui/calendar/CalendarReadOnlyWorkout.tsx`
- `src/ui/calendar/CalendarRouteAdapters.tsx`
- `src/ui/calendar/calendarTransitionController.ts`
- `src/ui/calendar/useCurrentLocalDate.ts`
- `src/ui/screens/PlannedWorkoutDetailScreen.tsx`
- `src/ui/screens/RunningPlanDetailScreen.tsx`
- `src/ui/screens/ImportedActivityDetailScreen.tsx`
- `src/ui/components/WorkoutSessionPresentation.tsx`
- `src/ui/components/BottomSheet.tsx`
- `src/ui/components/index.ts`
- `src/ui/theme/index.ts`
- `app/_layout.tsx`

### Tests

- `src/domains/scheduling/localDate.test.ts`
- `src/domains/history/calendar.test.ts`
- `src/ui/calendar/useCurrentLocalDate.test.tsx`
- `src/ui/__tests__/CalendarScreen.test.tsx`
- `src/ui/__tests__/CalendarTransitions.test.tsx`
- `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx`
- `src/ui/__tests__/RunningPlanDetailScreen.test.tsx`
- `src/ui/__tests__/SessionDetailScreen.test.tsx`
- `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx`
- `src/ui/calendar/CalendarAgenda.test.tsx`
- `app/(tabs)/__tests__/calendar.test.tsx`
- `app/__tests__/calendar-plan-route.test.tsx`
- `app/__tests__/calendar-cross-destination-route.test.tsx`
- `app/__tests__/garmin-activity-route.test.tsx`

---

## Recommendation Count

- Priority fixes: 3
- Source-level warning findings: 5
- Additional warnings beyond the three grouped priority fixes: 2
- Blockers: 0
- Registry flags: 0
