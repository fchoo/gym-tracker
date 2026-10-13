# Phase 16 — UI Review

**Audited:** 2026-10-13
**Baseline:** .planning/v1.2-OWNER-DECISIONS.md → .planning/v1.2-OWNER-BRIEF.md → .planning/design/v1.2-SOURCE-PRECEDENCE.md → approved Revision 18 approved.json / approved-hybrid.html → 16-UI-SPEC.md
**Source:** fchoo/UX-revamp at 57774f77
**Screenshots:** Not captured — no dev server responded on ports 3000, 5173, or 8080. Native screenshots/device checks remain Phase 20-deferred and were not scored as a Phase 16 defect.
**Scope:** Final re-audit of the 11 warnings in the prior Phase 16 UI review, plus full-height/focused composition, exact typography, status encoding, 48dp/focus behavior, motion/reduced motion, and real query-only destinations. Existing Phase 14/19 worktree changes were excluded and left untouched.

---

## Verdict

**WARNING — the required 24/24 gate is not met.** The merged final fixes close three of the prior 11 warnings: Calendar-origin planned Strength and Running now deterministically prefer Back, the month navigation now implements the contracted 48 / minmax / 76 / 48 structure, and a 360×800 font-scale-2 regression proves all controls remain present and activatable.

Eight source-visible contract deviations remain. Ordinary date cells still have visible borders and an 8dp radius; the today ring still stretches across the date track; the focused heading/Collapse action and agenda rows remain card-like instead of the flat Revision 18 composition; several required Lucide icons remain text glyphs; the Activity key still has no sport swatches; Calendar-origin details still use 18sp/20sp and weight 700 outside the exact type contract; and the empty agenda retains an undeclared 6dp gap. These are current source differences, not missing Phase 20 screenshots.

**Shipping gate:** 0 BLOCKER, 8 WARNING, 0 REGISTRY FLAG. Required zero-warning / 24-of-24 result: **not achieved**.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Exact Calendar, loading/error, rest, factual agenda, and read-only detail copy remains source-backed. |
| 2. Visuals | 2/4 | Full-height/focused structure passes, but date atoms, flat agenda hierarchy, Collapse placement, and icon treatment still diverge from Revision 18. |
| 3. Color | 3/4 | Sport/status fills are correct, but persistent cell/agenda/Today surfaces and missing Activity swatches violate the contracted distribution. |
| 4. Typography | 2/4 | Calendar root is exact; Calendar-origin Strength, Running, and imported-detail seams still introduce 18sp/20sp and weight 700 roles. |
| 5. Spacing | 2/4 | Responsive month controls now pass, but the exact 9dp/28dp/2dp date geometry and declared spacing set are still not fully implemented. |
| 6. Experience Design | 4/4 | Deterministic Back focus, 360dp/font-scale-2 navigation, state coverage, motion, 48dp focus, and query-only routing all have current source and host-test evidence. |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Restore the Calendar atom and flat agenda geometry** — Visible borders on ordinary days, the full-width today track, boxed agenda rows, and a separate full-width Collapse row materially change the Revision 18 hierarchy. Reserve a transparent 1dp cell border, use a 9dp cell radius, center a fixed 28dp date circle, add the 2dp event-track top offset, render paper rows with only a bottom separator, and place a 48dp Lucide Collapse action inside the agenda heading. (CalendarWeekRow.tsx:132-151,203-223; CalendarAgenda.tsx:122-150; CalendarScreen.tsx:656-682,918-943)
2. **Enforce the exact Phase 16 typography through every Calendar-origin destination** — Shared historical Strength disclosures use 18sp/700; status/header seams in Strength, Running, and imported detail use 20sp; some date/value facts use Archivo instead of IBM Plex Mono. Add Calendar-origin typography props or wrappers so these routes use only 11/14/16/22sp, weights 400/800, Archivo for interface text, and IBM Plex Mono for numeric/date facts. (WorkoutSessionPresentation.tsx:86-90; CalendarReadOnlyWorkout.tsx:58-67; PlannedWorkoutDetailScreen.tsx:143-148; RunningPlanDetailScreen.tsx:40-54; ImportedActivityDetailScreen.tsx:130,641-648; theme/index.ts:69-172,185-259)
3. **Finish declared icon, key, and micro-spacing fidelity** — Replace agenda/planned-detail text glyphs with outlined 24dp Lucide Chevron/Check/Dash icons, add the required orange and blue Activity swatches, and replace the empty agenda's undeclared 6dp gap with a declared token or contracted exception. (CalendarAgenda.tsx:135,144-150; PlannedWorkoutDetailScreen.tsx:170-185; CalendarScreen.tsx:887-908; 16-UI-SPEC.md:68,85-130,214-220)

---

## Prior 11-Warning Re-audit

| Prior warning | Final result | Exact current evidence |
|---|---|---|
| W-UI-01 — date-cell atoms/today ring | **WARNING — OPEN** | Non-selected cells still use colors.line; cell radius is radius.standard = 8; dateTrack has no 28dp width and aligns content left, so the today border spans the track (CalendarWeekRow.tsx:132-151,203-217; theme/index.ts:43-47). Contract/oracle: transparent base border, 9dp cell, centered 28dp circle (16-UI-SPEC.md:120-130,174-177,191; approved-hybrid.html:1118-1123). |
| W-UI-02 — agenda/Collapse composition | **WARNING — OPEN** | Collapse remains a separate bordered text row after the heading, while agenda events retain full borders and secondary surfaces (CalendarScreen.tsx:656-682,919-921; CalendarAgenda.tsx:122-150). Contract/oracle place a 48dp Collapse icon in the heading and use transparent flat rows with bottom separators (16-UI-SPEC.md:194-200,262-269; approved-hybrid.html:1195-1204). |
| W-UI-03 — icon fidelity | **WARNING — OPEN** | Agenda chevrons and planned Strength disclosure/state marks remain text glyphs rather than the declared Lucide Chevron/Check/Dash set (CalendarAgenda.tsx:135; PlannedWorkoutDetailScreen.tsx:170-185; 16-UI-SPEC.md:68). |
| W-COLOR-01 — surface/accent distribution | **WARNING — OPEN** | Ordinary cells retain visible line borders, agenda rows default to colors.surface, and Today defaults to the filled colors.action surface (CalendarWeekRow.tsx:132-139; CalendarAgenda.tsx:122-125; CalendarScreen.tsx:730-741). Revision 18 uses transparent base borders, paper agenda rows, and a transparent Today background (approved-hybrid.html:1108,1118,1198-1204). |
| W-COLOR-02 — Activity key swatches | **WARNING — OPEN** | ACTIVITY contains colored text only; no orange/blue swatch nodes are rendered (CalendarScreen.tsx:887-893). The contract requires both sport swatches (16-UI-SPEC.md:214-220). |
| W-TYPE-01 — exact 11/14/16/22 Archivo/IBM roles | **WARNING — OPEN** | Root Calendar roles remain exact, but historical Strength inherits workoutTypeScale.bodyStrong at 18sp/700; historical/planned status headers and Calendar-origin Running/imported detail still consume 20sp shared roles (WorkoutSessionPresentation.tsx:86-90; CalendarReadOnlyWorkout.tsx:58-67; PlannedWorkoutDetailScreen.tsx:143-148; RunningPlanDetailScreen.tsx:40-54; ImportedActivityDetailScreen.tsx:130; theme/index.ts:69-172,185-259). Contract permits only 11/14/16/22 and weights 400/800 (16-UI-SPEC.md:132-143). |
| W-SPACE-01 — exact date-cell geometry | **WARNING — OPEN** | Cell radius remains 8 rather than 9, the date circle has no fixed 28dp width/centering, and the event track has gap 2 but no 2dp top offset (CalendarWeekRow.tsx:203-223; theme/index.ts:43-47; 16-UI-SPEC.md:101-130,185-192). |
| W-SPACE-02 — exact month-control columns | **CLOSED** | The merged final fix adds 48dp Previous/Next slots, a flex:1/minWidth:0 title slot, a 76dp Today slot, 3dp gaps, one-line tail ellipsis, and full accessible month text (CalendarScreen.tsx:713-747,929-940). |
| W-SPACE-03 — undeclared 6dp gap | **WARNING — OPEN** | CalendarAgenda empty state still declares gap: 6, outside the reusable 4dp scale and the listed 2/3/10/14/18dp Calendar exceptions (CalendarAgenda.tsx:144-150; 16-UI-SPEC.md:85-116). |
| W-XD-01 — deterministic Back entry focus | **CLOSED** | ScreenHeader now forwards backActionRef; planned Strength focuses it on mount across loading/error/missing/ready; Calendar-origin Running does the same while management mode remains unchanged (components/index.ts:599-668; PlannedWorkoutDetailScreen.tsx:91-95,128-145; RunningPlanDetailScreen.tsx:44-54). |
| W-XD-02 — 360dp/200% portrait navigation | **CLOSED** | The exact source layout above is covered at 360×800 with fontScale 2, including enabled 48/76/48 actions and title ellipsis/accessibility label (CalendarScreen.test.tsx:838-879). |

**Reconciliation:** 3 closed, 8 open.

---

## Requested Contract Checks

| Contract check | Final result | Evidence |
|---|---|---|
| Date cell / today ring / agenda / Collapse geometry | **WARNING** | W-UI-01, W-UI-02, and W-SPACE-01 remain source-visible. |
| Exact 11/14/16/22 Archivo + IBM roles/weights | **WARNING** | Root tokens are exact, but Calendar-origin detail seams still use 18sp/700 and 20sp roles; see W-TYPE-01. |
| Deterministic Back focus | **CLOSED** | Shared Back refs and mounted preferred-focus tests cover planned Strength and Calendar-origin Running loading/error/missing/ready states (PlannedWorkoutDetailScreen.test.tsx:37-74; RunningPlanDetailScreen.test.tsx:44-60). |
| 360dp fontScale 2 navigation | **CLOSED** | Exact four-slot source layout and mounted 360×800/fontScale-2 regression pass (CalendarScreen.tsx:713-747,929-940; CalendarScreen.test.tsx:838-879). |
| Full-height month / focused composition | **CLOSED** | Month rows share remaining height; focused composition is selected week → absolute agenda → following week; scale-aware minimum height preserves agenda reachability (CalendarWeekRow.tsx:84-90,223; CalendarMonthViewport.tsx:107-155,469-526). |
| Status colors and non-color encoding | **CLOSED for event/status semantics; WARNING for surrounding color fidelity** | Complete is 14% sport tint, Partial is dotted with 18% half-fill, Planned is transparent/dashed, status-key samples are neutral, and accessible labels state sport/status (CalendarWeekRow.tsx:154-194; CalendarScreen.tsx:895-907). W-COLOR-01/02 remain. |
| 48dp targets and visible focus | **CLOSED at source/host level** | Shared targets use sizes.minimumTarget = 48; focus uses a 3dp outline with 4dp offset; 360dp controls remain non-overlapping and enabled (theme/index.ts:49-63; components/index.ts:298-325; CalendarWeekRow.tsx:203-223; CalendarScreen.test.tsx:838-879). Native appearance remains Phase 20-owned. |
| Motion and reduced motion | **CLOSED** | Inclusive distance-only 25%, 240/260/170/140ms timings, agenda delay, settle fencing, and reduced-motion destination preservation remain implemented (calendarTransitionController.ts:18-44,118-146,170-205,210-238,247-315; CalendarMonthViewport.tsx:261-336). |
| Query-only details and return focus | **CLOSED** | Session, occurrence, scheduled Running revision, and imported activity use narrow read adapters and durable IDs; the cross-destination suite proves zero mutation commands and restored agenda-row focus (CalendarRouteAdapters.tsx:38-177; app/(tabs)/calendar.tsx:100-130; calendar-cross-destination-route.test.tsx:313-353,375-503). |
| Native screenshots/device proof | **PHASE 20 DEFERRED — NOT SCORED** | No native screenshot, physical focus, or device geometry absence reduced a pillar. |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — exact source-led copy remains complete.** Root/action/key strings, loading/updating/error/retry, empty/rest, read-only status, unavailable states, and Back copy match the contract (CalendarScreen.tsx:606-629,656-682,713-755,880-910; CalendarAgenda.tsx:71-80; CalendarRouteAdapters.tsx:21-35,76-87; PlannedWorkoutDetailScreen.tsx:128-148).
- **PASS — no generic-label regression.** Scoped string scan found no Submit, Click Here, bare OK, bare Cancel, or bare Save label in the audited Phase 16 surfaces.
- **PASS — summaries remain factual.** Agenda rows render repository-provided displaySummary, while rest and empty states remain distinct (CalendarAgenda.tsx:71-80,94-136).

### Pillar 2: Visuals (2/4)

- **PASS — full-height/focused reading order is structurally correct.** Equal-share month rows and selected-week/agenda/following-week overlays preserve the approved composition (CalendarWeekRow.tsx:84-90,223; CalendarMonthViewport.tsx:107-155,469-526).
- **WARNING W-UI-01 — date atoms and today ring remain incorrect.** Ordinary borders, 8dp radius, and a full-width left-aligned date track differ from the transparent 9dp cell and centered 28dp ring.
- **WARNING W-UI-02 — focused agenda remains card-like and mis-composed.** Collapse is outside the heading; rows use full borders, gaps, and secondary surfaces instead of a flat paper list.
- **WARNING W-UI-03 — icon treatment remains incomplete.** Agenda/planned-detail Chevron and Dash states use font glyphs instead of the declared outlined Lucide set.

### Pillar 3: Color (3/4)

- **PASS — core semantic encoding is correct.** Scoped source has no hardcoded hex/RGB literals outside the theme. Complete/Partial/Planned derive from the current sport color, and the status key is neutral (CalendarWeekRow.tsx:154-191; CalendarScreen.tsx:895-907).
- **Scan distribution:** textSecondary 41 uses, textPrimary 38, line/divider 7 each, blue 6, surface 4, orange 2. The semantic palette is used consistently, but role assignment is not fully faithful.
- **WARNING W-COLOR-01 — dominant/secondary/action surface roles are misplaced.** Base borders, boxed surface agenda rows, and filled Today overstate the 30%/10% layers.
- **WARNING W-COLOR-02 — Activity lacks the required orange/blue swatches.** Colored words alone do not match the key composition.

### Pillar 4: Typography (2/4)

- **PASS — Calendar root tokens are exact.** calendarTypeScale defines 11/14/16/22sp at 400/800, with IBM Plex Mono numeric dates/weekdays and Archivo interface roles (theme/index.ts:132-172; CalendarScreen.tsx:628,659-660,718-727,770; CalendarWeekRow.tsx:143-190).
- **WARNING W-TYPE-01 — destination typography still violates the exact contract.** Scoped role scan still finds workoutTypeScale.bodyStrong/secondary plus shared screenTitle/sectionTitle. Their definitions introduce 18sp/700 and 20sp, and several dates/value facts stay on Archivo body roles instead of IBM Plex Mono (theme/index.ts:69-130,185-259).

### Pillar 5: Spacing (2/4)

- **PASS — the final month-control fix is exact.** 48/minmax/76/48 slots, 3dp gaps, shrink-safe title, and 200% portrait regression close W-SPACE-02.
- **PASS — full-height and adaptive inset remain correct.** DEV-01 is computed as min(18, max(0, (safeWidth - 348) / 2)); scaled track and agenda minima create vertical overflow instead of shrinking controls (CalendarScreen.tsx:603-604,762-768; CalendarMonthViewport.tsx:56-62,469-490).
- **WARNING W-SPACE-01 — local date geometry is still wrong.** 8dp radius, unbounded date track, and missing 2dp event top offset remain.
- **WARNING W-SPACE-03 — undeclared spacing remains.** Empty agenda uses gap: 6.

### Pillar 6: Experience Design (4/4)

- **PASS — all prior experience warnings are closed.** Back is deterministic on every Calendar-origin detail path covered by the final fix, and 360dp/font-scale-2 month navigation has a concrete source layout and mounted regression.
- **PASS — interaction and state coverage is broad.** Loading, retained refresh, error/retry, empty/rest, missing details, disabled replacement states, focus restoration, exact threshold/cancel/settle, compact-height overflow, and reduced motion are present and tested.
- **PASS — routes remain real and query-only.** The Calendar route carries durable IDs into narrow read adapters; Calendar mode exposes no edit/start/resume/remove/lifecycle commands, and return state restores the triggering agenda row.
- **PASS — focused verification is green.** 11 component/route suites and 121 tests passed. One existing non-failing React act warning was emitted by the Garmin route harness.

---

## Audit Trail and Verification

- Prior UI review baseline: source f152c965, **16/24**, 0 blockers and 11 warnings.
- Current audited HEAD: 57774f77 on fchoo/UX-revamp.
- Final fixes inspected: 7719bfce (Back focus) and e2e0aa7a (month navigation / 360dp fontScale 2), merged by 2d0e9eb9.
- Screenshot-safety gate passed: .planning/ui-reviews/.gitignore already ignores PNG/WebP/JPEG/GIF/BMP/TIFF.
- Dev-server detection: ports 3000, 5173, and 8080 returned no response; no web screenshots were captured.
- Focused component/route gate: **11 suites, 121 tests passed**.
- Static scan: no generic CTA regression and no hardcoded color literal in scoped Phase 16 UI implementation files.
- Registry audit: not applicable — components.json is absent, shadcn_initialized is false, and 16-UI-SPEC.md declares no third-party registries.
- Native screenshots, physical focus/geometry, and release/profile checks remain Phase 20-deferred without penalty.

Green host checks prove covered structure, state, route, and interaction contracts. They do not override the eight source-visible visual/type/spacing discrepancies above.

---

## Files Audited

### Authority and prior audit

- .planning/v1.2-OWNER-DECISIONS.md
- .planning/v1.2-OWNER-BRIEF.md
- .planning/design/v1.2-SOURCE-PRECEDENCE.md
- .planning/phases/16-calendar-parity/16-CONTEXT.md
- .planning/phases/16-calendar-parity/16-UI-SPEC.md
- .planning/phases/16-calendar-parity/16-01-PLAN.md through 16-07-PLAN.md
- .planning/phases/16-calendar-parity/16-01-SUMMARY.md through 16-07-SUMMARY.md
- .planning/phases/16-calendar-parity/16-REVIEW-FIX.md
- Previous .planning/phases/16-calendar-parity/16-UI-REVIEW.md
- External approved Revision 18 approved.json (SHA-256 b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf)
- External approved Revision 18 approved-hybrid.html (SHA-256 b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96)
- External design-audit-revision18/design-audit-revision18.md

### Current implementation and routes

- app/(tabs)/calendar.tsx
- src/ui/screens/CalendarScreen.tsx
- src/ui/calendar/CalendarMonthViewport.tsx
- src/ui/calendar/CalendarWeekRow.tsx
- src/ui/calendar/CalendarAgenda.tsx
- src/ui/calendar/CalendarReadOnlyWorkout.tsx
- src/ui/calendar/CalendarRouteAdapters.tsx
- src/ui/calendar/calendarTransitionController.ts
- src/ui/screens/PlannedWorkoutDetailScreen.tsx
- src/ui/screens/RunningPlanDetailScreen.tsx
- src/ui/screens/ImportedActivityDetailScreen.tsx
- src/ui/components/WorkoutSessionPresentation.tsx
- src/ui/components/index.ts
- src/ui/theme/index.ts

### Tests

- src/ui/__tests__/CalendarScreen.test.tsx
- src/ui/__tests__/CalendarTransitions.test.tsx
- src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx
- src/ui/__tests__/RunningPlanDetailScreen.test.tsx
- src/ui/__tests__/SessionDetailScreen.test.tsx
- src/ui/__tests__/ImportedActivityDetailScreen.test.tsx
- src/ui/calendar/CalendarAgenda.test.tsx
- app/(tabs)/__tests__/calendar.test.tsx
- app/__tests__/calendar-plan-route.test.tsx
- app/__tests__/calendar-cross-destination-route.test.tsx
- app/__tests__/garmin-activity-route.test.tsx

---

## Recommendation Count

- Priority fixes: 3
- Source-level warnings: 8
- Additional warnings beyond the top three grouped fixes: 5
- Blockers: 0
- Registry flags: 0
