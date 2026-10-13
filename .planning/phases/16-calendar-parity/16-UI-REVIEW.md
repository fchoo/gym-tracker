# Phase 16 — UI Review

**Audited:** 2026-10-14
**Baseline:** `.planning/v1.2-OWNER-DECISIONS.md` → `.planning/v1.2-OWNER-BRIEF.md` → `.planning/design/v1.2-SOURCE-PRECEDENCE.md` → approved Revision 18 `approved.json` / `approved-hybrid.html` → `16-UI-SPEC.md`
**Source:** `fchoo/UX-revamp` at `d97ea569fc6f8671df94f68e64635c55d06864aa`
**Screenshots:** Not captured — no web dev server responded on ports 3000, 5173, or 8080. Native screenshots/device execution remain Phase 20-only and are not a Phase 16 finding.
**Scope:** Final certification of all six pillars and every prior finding across ready/loading/error/missing states, Light/Dark tokens, keyboard/D-pad/focus, 200% text mechanics, reduced motion, minimum targets, semantics, Calendar-origin routes, and the shared BottomSheet focus-clearance refactor.

---

## Verdict

**PASS — the required 24/24 clean gate is met.**

The 24/24 result at `c18b3405` remains valid. Commit `867c369c`, merged by `d97ea569`, centralizes the existing focus-clearance context in the leaf `bottomSheetFocus.ts` module and makes the BottomSheet close action consume that context. Calendar remains unwrapped and therefore retains the exact default 4dp focus clearance with a 3dp focus ring. Scoped consumers can override clearance without reintroducing the `BottomSheet.tsx` → component-barrel cycle.

The close action also retains its Lucide 24dp/2dp icon, 48×48dp target, modal focus registration and traversal, Enter/Space activation, Back/Escape/scrim cancellation, disabled/busy semantics, and Light/Dark theme-driven states.

**Gate result:** 0 BLOCKER, 0 WARNING, 0 REGISTRY FLAG.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | Exact Calendar copy and distinct visible/header Back labels remain correct in every applicable route state. |
| 2. Visuals | 4/4 | Calendar hierarchy, atoms, iconography, key, agenda, read-only details, and the sheet close action match the contract. |
| 3. Color | 4/4 | Light/Dark semantic tokens, DEV-02 contrast, sport/status separation, and theme-aware focus/close states pass. |
| 4. Typography | 4/4 | Calendar-owned surfaces retain the approved 11/14/16/22sp and 400/800 roles through every state. |
| 5. Spacing | 4/4 | DEV-01, 48dp targets, 14dp key inset, 3dp agenda spacing, scalable rail geometry, and default 4dp focus clearance are exact. |
| 6. Experience Design | 4/4 | State, motion, reduced-motion, keyboard/D-pad, focus trap, Back/Escape, routing, and zero-mutation contracts pass. |

**Overall: 24/24**

---

## Top 3 Priority Fixes

None. No blocker, warning, registry flag, or minor recommendation remains in the Phase 16 UI scope.

---

## Prior Finding Re-audit

| Prior finding | Final result | Current evidence |
|---|---|---|
| Stale Garmin Calendar-origin Back assertion | **CLOSED** | The route test activates `Back to Calendar agenda` and passes (`app/__tests__/garmin-activity-route.test.tsx:138-150`). |
| Missing historical visible action copy | **CLOSED** | Missing historical detail renders visible `Back to Calendar`; its header remains `Back to Calendar agenda` (`src/ui/calendar/CalendarRouteAdapters.tsx:23-53`). |
| Missing planned Strength visible action copy | **CLOSED** | Planned missing state renders visible `Back to Calendar`; loading/error/ready/missing headers retain `Back to Calendar agenda` (`src/ui/screens/PlannedWorkoutDetailScreen.tsx:130-145`). |
| Missing Running visible action copy | **CLOSED** | Calendar-mode missing Running detail renders visible `Back to Calendar`; its header remains `Back to Calendar agenda` (`src/ui/screens/RunningPlanDetailScreen.tsx:44-54`). |
| Invalid Calendar Running visible action copy | **CLOSED** | Invalid Calendar routes use visible `Back to Calendar`, Calendar heading typography, deterministic Back focus, and the contextual header label (`app/library/running/[planId].tsx:19-81`). |
| Calendar-origin header Back label | **CLOSED** | Historical, planned Strength, Running, invalid Running, and imported-activity headers all expose `Back to Calendar agenda` (`src/ui/calendar/CalendarReadOnlyWorkout.tsx:43-58`; `src/ui/calendar/CalendarRouteAdapters.tsx:23-43`; `src/ui/screens/ImportedActivityDetailScreen.tsx:114-149`). |
| 20sp/16sp typography leaks | **CLOSED** | `calendarTypeScale` remains exactly 11/14/16/22sp and 400/800; Calendar key, non-ready destination headings, and historical/planned exercise names use the 22sp heading role (`src/ui/theme/index.ts:146-186`; `src/ui/components/WorkoutSessionPresentation.tsx:89-99`). |
| 14dp key inset / 3dp agenda spacing / 62dp minimum scaling | **CLOSED** | Calendar retains the 14dp sheet inset; agenda detail/metadata retain 3dp separation; the 5dp rail stretches from a 62dp minimum (`src/ui/screens/CalendarScreen.tsx:882-924`; `src/ui/components/BottomSheet.tsx:203-205,426-459`; `src/ui/calendar/CalendarAgenda.tsx:160-169`). |
| BottomSheet barrel cycle | **CLOSED** | `BottomSheet.tsx` imports the focus hooks directly from `bottomSheetFocus.ts` and does not import `./index`; boundary checks pass (`src/ui/components/BottomSheet.tsx:23-30`; `src/ui/components/bottomSheetFocus.ts:1-33`). |
| BottomSheet focus-clearance inheritance | **CLOSED** | The leaf context defaults to `sizes.focusClearance` (4dp); both `FocusablePressable` and the local close action consume it. Tests prove default 4dp and a scoped 3dp override while preserving the 3dp ring (`src/ui/components/bottomSheetFocus.ts:18-28`; `src/ui/components/index.ts:232-260`; `src/ui/components/BottomSheet.tsx:66-147`; `src/ui/components/BottomSheet.test.tsx:149-180`). |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — exact state and navigation wording is present.** Root/Today/key copy, agenda counts, empty/rest text, loading/updating/error/retry text, read-only statuses/footer, missing-detail copy, and Collapse match the approved contract (`src/ui/screens/CalendarScreen.tsx:608-750,751-775,882-923`; `src/ui/calendar/CalendarAgenda.tsx:72-108`; `src/ui/calendar/CalendarReadOnlyWorkout.tsx:49-67,115-117`).
- **PASS — visible and structural Back labels remain deliberately distinct.** Missing historical/planned/Running actions say `Back to Calendar`; Calendar-origin headers say `Back to Calendar agenda`. Generic `Go back` remains confined to management/default routes (`src/ui/calendar/CalendarRouteAdapters.tsx:37-53`; `src/ui/screens/PlannedWorkoutDetailScreen.tsx:130-145`; `src/ui/screens/RunningPlanDetailScreen.tsx:49-54`; `app/library/running/[planId].tsx:19-81`; `src/ui/screens/ImportedActivityDetailScreen.tsx:128-149`).
- **PASS — scoped generic-label scan is clean.** No `Submit`, `Click Here`, bare `OK`, bare `Cancel`, or bare `Save` occurs in the Phase 16 Calendar UI surface.

### Pillar 2: Visuals (4/4)

- **PASS — source-level composition remains Revision 18-complete.** The root header, persistent 48/flexible/76/48 month controls, Monday-first grid, focused selected/agenda/following sequence, heading-contained Collapse action, flat agenda rows, modal-only key, and Active-shaped read-only details preserve the required hierarchy (`src/ui/screens/CalendarScreen.tsx:608-749,759-924`; `src/ui/calendar/CalendarMonthViewport.tsx:492-535`).
- **PASS — Calendar and sheet iconography is exact.** Cells retain fixed date/event tracks and status treatments; Info, Settings, Previous, Next, Collapse, agenda Chevron, detail Check/Minus/Chevron, and BottomSheet close use Lucide icons with the declared geometry (`src/ui/calendar/CalendarWeekRow.tsx:108-223`; `src/ui/calendar/CalendarReadOnlyWorkout.tsx:99-109`; `src/ui/calendar/CalendarDisclosureChevron.tsx:41-56`; `src/ui/components/BottomSheet.tsx:102-147`).

### Pillar 3: Color (4/4)

- **PASS — Light/Dark tokens and DEV-02 remain exact.** Light uses paper `#FFFAF0`, blue `#195FAE`, and Strength title `#9B470B`; Dark uses paper `#080808`, blue `#71AAFF`, and Strength title `#D97820`. Orange borders/rails/swatches remain `#D97820` in both (`src/ui/theme/index.ts:275-297`; `src/ui/calendar/CalendarWeekRow.tsx:154-191`; `src/ui/screens/CalendarScreen.tsx:895-920`).
- **PASS — the sheet close action is theme-safe.** Pressed background, border, focus outline, and icon foreground resolve through `surfaceSubtle`, `divider`, `focusRing`, and `textPrimary`; no duplicate local palette was introduced (`src/ui/components/BottomSheet.tsx:123-145`).
- **PASS — semantic distribution remains restrained.** The scoped Calendar/detail source retains 44 `textSecondary`, 38 `textPrimary`, 7 divider and 5 line references versus 8 blue, 3 orange, 3 completed and 2 `calendarStrengthTextLight` references. Phase 16-owned UI has no hardcoded color literal; the shared sheet retains only the approved scrim literal.

### Pillar 4: Typography (4/4)

- **PASS — the exact four-size/two-weight contract remains intact.** `calendarTypeScale` defines 11/14/16/22sp with 400/800, 14/20/22/26sp line heights, Archivo, and IBM Plex Mono tabular numerals (`src/ui/theme/index.ts:146-186`).
- **PASS — ready/loading/error/missing paths retain Calendar roles.** Calendar key, historical and planned Strength states, Running states, imported activity states, and exercise headings use Calendar overrides where shared components otherwise use 20sp (`src/ui/screens/CalendarScreen.tsx:882-920`; `src/ui/calendar/CalendarRouteAdapters.tsx:23-106`; `src/ui/screens/PlannedWorkoutDetailScreen.tsx:130-190`; `src/ui/screens/RunningPlanDetailScreen.tsx:40-54`; `src/ui/screens/ImportedActivityDetailScreen.tsx:44-54,128-175,380-430`; `src/ui/components/WorkoutSessionPresentation.tsx:89-99`).
- **PASS — 200% text remains enabled and mechanically accommodated.** No Calendar text disables scaling; agenda/detail copy wraps and track/row minimums grow from `fontScale` (`src/ui/calendar/CalendarWeekRow.tsx:39-49,182-194`; `src/ui/calendar/CalendarAgenda.tsx:133-139`; `src/ui/calendar/CalendarMonthViewport.tsx:64-70`).

### Pillar 5: Spacing (4/4)

- **PASS — DEV-01 and minimum targets remain exact.** The inset formula yields seven non-overlapping 48dp cells at 360dp and caps at 18dp from 390dp upward (`src/ui/calendar/CalendarMonthViewport.tsx:56-62`; `src/ui/calendar/CalendarWeekRow.tsx:203-223`).
- **PASS — Calendar geometry remains exact.** Month controls use 48/flexible/76/48 slots with 3dp gaps; cells retain 3dp vertical/2dp horizontal padding and 2dp event/row gaps; agenda rows retain 5dp/flexible/24dp columns, 10dp gaps/padding, 82dp minimum height, 3dp text separation, and a stretchable 62dp-minimum rail (`src/ui/screens/CalendarScreen.tsx:715-749,932-959`; `src/ui/calendar/CalendarAgenda.tsx:160-169`).
- **PASS — focus geometry remains correct after centralization.** The shared default is a 3dp focus ring with 4dp clearance, Calendar uses that default, and scoped consumers can override only the clearance (`src/ui/theme/index.ts:49-63`; `src/ui/components/bottomSheetFocus.ts:18-28`; `src/ui/components/BottomSheet.test.tsx:149-180`).

### Pillar 6: Experience Design (4/4)

- **PASS — state coverage remains complete.** Initial loading, retained refresh, error/retry, empty/rest, overflow, stale/missing identity, exact retry identity, disabled authoritative replacement, real destination routes, zero Calendar mutation authority, and return-state/focus restoration remain implemented (`src/ui/screens/CalendarScreen.tsx:292-363,486-564,577-605,648-705,750-880`; `src/ui/calendar/CalendarRouteAdapters.tsx:59-198`; `app/(tabs)/calendar.tsx:100-130`).
- **PASS — input and motion alternatives remain deterministic.** Arrow navigation, Enter/Space, touch/D-pad press, Back/Escape, 7dp/1.15 intent arbitration, 1:1 drag, inclusive 25% distance-only settle, cancellation, stale-epoch fencing, measured expansion/collapse, adjacent-week order, runtime reduced motion, and 160ms disclosure rotation remain intact (`src/ui/calendar/CalendarWeekRow.tsx:108-131`; `src/ui/calendar/calendarTransitionController.ts:66-70,170-315`; `src/ui/calendar/CalendarMonthViewport.tsx:269-355,357-475`; `src/ui/calendar/CalendarDisclosureChevron.tsx:7-56`).
- **PASS — BottomSheet close behavior survives the leaf refactor.** The close action participates in focus trapping, inherits default/scoped clearance, exposes button/disabled/busy state, ignores activation while disabled, supports Enter/Space, and shares the frame-owned close path for touch, Modal Back, Escape, and scrim with trigger-focus restoration (`src/ui/components/BottomSheet.tsx:66-147,203-237,260-366,378-468`; `src/ui/components/BottomSheet.test.tsx:82-180,240-475`).

---

## Audit Trail and Verification

- Current audited HEAD: `d97ea569fc6f8671df94f68e64635c55d06864aa`.
- Prior certified baseline: `c18b3405707c9b7118e278648baea074ab4c90f4`, **24/24**.
- Current delta inspected: `867c369c` (focus-clearance context centralization), merged by `d97ea569`; no Phase 16 contract or oracle file changed.
- Revision 18 hashes re-verified: `approved-hybrid.html` = `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`; `approved.json` = `b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf`.
- Screenshot-safety gate: `.planning/ui-reviews/.gitignore` covers PNG/WebP/JPEG/GIF/BMP/TIFF; no file change was needed.
- Dev-server detection: ports 3000, 5173, and 8080 returned `000`; no web screenshots were captured. Native capture/device execution is Phase 20-only and unscored.
- Targeted UI/route/sheet verification: **18 suites, 237 tests passed**.
- Civil-date/event unit verification: **2 suites, 52 tests passed**.
- TypeScript: `npm run typecheck` passed.
- Boundaries: `npm run check:boundaries` passed across **430 files**.
- Static checks: BottomSheet has no `./index` import; Calendar uses default 4dp clearance; scoped 3dp inheritance is covered; generic Calendar copy, hardcoded Phase 16 colors, and disabled text scaling scans are clean.
- Registry audit: skipped as required — `components.json` is absent, `shadcn_initialized` is false, and the UI-SPEC declares no third-party registries.

The Garmin activity route suite emits its known React test-environment `act(...)` console diagnostic, but all assertions pass; this is not a product UI finding. Native screenshots, physical keyboard/D-pad focus, device-only geometry, and release/profile performance remain explicitly owned by Phase 20.

---

## Files Audited

### Authority and phase records

- `.planning/v1.2-OWNER-DECISIONS.md`
- `.planning/v1.2-OWNER-BRIEF.md`
- `.planning/design/v1.2-SOURCE-PRECEDENCE.md`
- `.planning/phases/16-calendar-parity/16-CONTEXT.md`
- `.planning/phases/16-calendar-parity/16-UI-SPEC.md`
- `.planning/phases/16-calendar-parity/16-01-PLAN.md` through `16-07-PLAN.md`
- `.planning/phases/16-calendar-parity/16-01-SUMMARY.md` through `16-07-SUMMARY.md`
- Prior `.planning/phases/16-calendar-parity/16-UI-REVIEW.md`
- External Revision 18 `approved.json` and `approved-hybrid.html`

### Current implementation and routes

- `app/(tabs)/calendar.tsx`
- `app/session/[sessionId].tsx`
- `app/calendar/plan/[occurrenceId].tsx`
- `app/library/running/[planId].tsx`
- `app/garmin/activity/[activityId].tsx`
- `src/domains/history/calendar.ts`
- `src/domains/scheduling/localDate.ts`
- `src/navigation/routeOrigin.ts`
- `src/navigation/importedActivityRoute.ts`
- `src/ui/screens/CalendarScreen.tsx`
- `src/ui/calendar/calendarPorts.ts`
- `src/ui/calendar/calendarTransitionController.ts`
- `src/ui/calendar/CalendarMonthViewport.tsx`
- `src/ui/calendar/CalendarWeekRow.tsx`
- `src/ui/calendar/CalendarAgenda.tsx`
- `src/ui/calendar/CalendarDisclosureChevron.tsx`
- `src/ui/calendar/CalendarReadOnlyWorkout.tsx`
- `src/ui/calendar/CalendarRouteAdapters.tsx`
- `src/ui/calendar/useCurrentLocalDate.ts`
- `src/ui/screens/PlannedWorkoutDetailScreen.tsx`
- `src/ui/screens/RunningPlanDetailScreen.tsx`
- `src/ui/screens/ImportedActivityDetailScreen.tsx`
- `src/ui/components/WorkoutSessionPresentation.tsx`
- `src/ui/components/BottomSheet.tsx`
- `src/ui/components/bottomSheetFocus.ts`
- `src/ui/components/index.ts`
- `src/ui/theme/index.ts`

### Focused tests

- `src/ui/__tests__/CalendarScreen.test.tsx`
- `src/ui/__tests__/CalendarTransitions.test.tsx`
- `src/ui/calendar/CalendarAgenda.test.tsx`
- `src/ui/calendar/calendarPorts.test.ts`
- `src/ui/calendar/useCurrentLocalDate.test.tsx`
- `src/ui/components/BottomSheet.test.tsx`
- `src/ui/__tests__/foundation.test.tsx`
- `src/ui/__tests__/WorkoutSessionPresentation.test.tsx`
- `src/ui/__tests__/SessionDetailScreen.test.tsx`
- `src/ui/__tests__/PlannedWorkoutDetailScreen.test.tsx`
- `src/ui/__tests__/RunningPlanDetailScreen.test.tsx`
- `src/ui/__tests__/ImportedActivityDetailScreen.test.tsx`
- `app/(tabs)/__tests__/calendar.test.tsx`
- `app/__tests__/session-route.test.tsx`
- `app/__tests__/calendar-plan-route.test.tsx`
- `app/__tests__/calendar-cross-destination-route.test.tsx`
- `app/__tests__/running-plan-route.test.tsx`
- `app/__tests__/garmin-activity-route.test.tsx`

---

## Recommendation Count

- Priority fixes: 0
- Minor recommendations: 0
- Blockers: 0
- Warnings: 0
- Registry flags: 0
