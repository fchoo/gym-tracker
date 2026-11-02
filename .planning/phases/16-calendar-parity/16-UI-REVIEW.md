# Phase 16 — UI Review

**Audited:** 2026-10-14
**Baseline:** `.planning/v1.2-OWNER-DECISIONS.md` → `.planning/v1.2-OWNER-BRIEF.md` → `.planning/design/v1.2-SOURCE-PRECEDENCE.md` → approved Revision 18 `approved.json` / `approved-hybrid.html` → `16-UI-SPEC.md`
**Source:** `fchoo/UX-revamp` at `53b3d1a7d936d4024daf51e1f20d1d62814096ed`
**Screenshots:** Not captured — no web dev server responded on ports 3000, 5173, or 8080. Native screenshots/device execution remain Phase 20-only and are not a Phase 16 finding.
**Scope:** Targeted final re-audit of controller-owned same-month date selection plus regression of every prior 24/24 Calendar finding across touch, keyboard, Today, month navigation, focused agenda, expand/collapse, reduced motion, focus, Back, copy, typography, color, spacing, and semantics. Phase 19 source is disjoint and excluded from scoring.

---

## Verdict

**PASS — the required 24/24 clean gate is met.**

Commit `28f77d9e`, merged by `4a3be035`, adds the controller-owned `select-date` event and routes same-month Today/touch/keyboard selection through the same transition publisher used by month and focused transitions. The controller validates the civil date, accepts selection only while idle and within the current month, and publishes no motion command. `CalendarScreen` then mirrors the authoritative controller date into `selectedDateRef` and rendered state through one path.

This keeps the selected cell, focused agenda date/events, later month-clamp source, focus restoration, expand/collapse target, reduced-motion state, and Back behavior synchronized. The relevant source delta changes no copy, layout, typography, color, icon, or spacing declaration, so the previously certified 24/24 visual contract remains intact.

**Gate result:** 0 BLOCKER, 0 WARNING, 0 REGISTRY FLAG.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---:|---|
| 1. Copywriting | 4/4 | No copy changed; exact Calendar state, action, and visible/header Back labels remain intact. |
| 2. Visuals | 4/4 | Controller ownership changes no visual atom or hierarchy; selected cell, agenda, and month title consume synchronized state. |
| 3. Color | 4/4 | Light/Dark semantic tokens, DEV-02 contrast, and restrained accent use remain unchanged and correct. |
| 4. Typography | 4/4 | Calendar surfaces retain the approved 11/14/16/22sp and 400/800 roles through every state. |
| 5. Spacing | 4/4 | DEV-01, targets, key inset, agenda spacing, rail geometry, and focus clearance remain exact. |
| 6. Experience Design | 4/4 | Same-month selection, month clamping, focus, agenda, motion/reduced-motion, expand/collapse, and Back now share authoritative controller state. |

**Overall: 24/24**

---

## Top 3 Priority Fixes

None. No blocker, warning, registry flag, or minor recommendation remains in the Phase 16 UI scope.

---

## Targeted Synchronization Re-audit

| Path | Result | Evidence |
|---|---|---|
| Same-month touch selection | **PASS** | Day activation calls `moveSelection`, which dispatches `select-date`; the following expand reads the synchronously updated controller ref (`src/ui/screens/CalendarScreen.tsx:468-484,825-838`). |
| Same-month keyboard selection | **PASS** | Arrow movement dispatches through the same `moveSelection` path, stores the pending focus date, and restores focus only after controller/render publication (`src/ui/screens/CalendarScreen.tsx:468-484,557-564,823-840`). |
| Same-month Today | **PASS** | Today dispatches `select-date` instead of mutating local render state directly (`src/ui/screens/CalendarScreen.tsx:450-465`). The regression proves August 31 becomes the source for the September clamp to September 30 (`src/ui/__tests__/CalendarScreen.test.tsx:259-278`). |
| Month navigation | **PASS** | Previous/Next calculate their target from `selectedDateRef`, which is updated from controller publication; clamped selection and month title therefore remain aligned (`src/ui/screens/CalendarScreen.tsx:365-407,431-448`). |
| Focused agenda | **PASS** | `visibleSelectedDate` drives selected week, agenda heading, source-day lookup, and event filtering from the same rendered date (`src/ui/screens/CalendarScreen.tsx:577-605,648-705`). |
| Expand/collapse | **PASS** | Same-month selection updates controller state before expand; collapse restores focus from the synchronized selected-date ref (`src/ui/screens/CalendarScreen.tsx:654-684,823-875`; `src/ui/calendar/calendarTransitionController.ts:277-291`). |
| Reduced motion | **PASS** | `select-date` is command-free and stable in either motion preference; existing reduced-motion transition paths preserve the same destination without timers or translation (`src/ui/calendar/calendarTransitionController.ts:213-241,287-323`; `src/ui/__tests__/CalendarTransitions.test.tsx:594-606`). |
| Back and cancellation | **PASS** | Back still dismisses key, cancels unstable motion, collapses focused mode, then delegates root history; selected state is neither independently mutated nor lost (`src/ui/screens/CalendarScreen.tsx:486-493`; `src/ui/calendar/calendarTransitionController.ts:320-323`; `src/ui/__tests__/CalendarScreen.test.tsx:184-236`). |
| Controller validation | **PASS** | `select-date` parses a real civil date, rejects out-of-month selection and non-idle races, and returns immutable state with no command (`src/ui/calendar/calendarTransitionController.ts:287-292`; `src/ui/__tests__/CalendarTransitions.test.tsx:569-592`). |

---

## Prior Finding Regression

| Prior finding | Final result | Current evidence |
|---|---|---|
| Calendar-origin header Back label | **PASS** | Historical, planned Strength, Running, invalid Running, and imported-activity headers retain `Back to Calendar agenda`. |
| Missing-state visible action copy | **PASS** | Historical, planned Strength, Running, and invalid Running missing actions retain visible `Back to Calendar`. |
| Exact Calendar typography | **PASS** | `calendarTypeScale` remains 11/14/16/22sp with only 400/800; no changed source touches type tokens or rendered styles. |
| Exact Calendar spacing | **PASS** | DEV-01, 14dp key inset, 3dp agenda spacing, 62dp-minimum stretch rail, 48dp targets and 4dp focus clearance remain unchanged. |
| Color and status encoding | **PASS** | DEV-02, Light/Dark roles, sport colors and solid/dotted/dashed status patterns remain unchanged. |
| Motion and reduced motion | **PASS** | 1:1 drag, inclusive 25% settle, 240/260/240ms timings, adjacent sequencing, cancellation and reduced-motion equivalence remain green. |
| Focus and keyboard/D-pad | **PASS** | Arrow navigation, pending focus, Collapse focus, agenda return focus, modal focus trap and Back/Escape behavior remain green. |
| BottomSheet barrel/focus-clearance contract | **PASS** | The sheet remains leaf-safe and preserves default/scoped focus clearance, 3dp ring, Lucide close icon, 48dp target and keyboard/Back semantics. |

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

- **PASS — no copy changed in the targeted delta.** The only production edits replace direct same-month state mutation with a semantic controller event. Existing root/Today/key, loading/updating/error/retry, empty/rest, read-only, missing-state, Collapse, and Back wording remains exact (`src/ui/screens/CalendarScreen.tsx:450-484`; diff `d97ea569..53b3d1a7`).
- **PASS — visible and structural Back labels remain distinct.** Missing actions retain `Back to Calendar`; Calendar-origin header controls retain `Back to Calendar agenda`. Generic `Go back` remains management-only.

### Pillar 2: Visuals (4/4)

- **PASS — no visual source changed.** The delta contains no JSX hierarchy, style, icon, color, type, or geometry edit; it changes only event dispatch and transition state (`src/ui/calendar/calendarTransitionController.ts:56-60,287-292`; `src/ui/screens/CalendarScreen.tsx:450-484`).
- **PASS — selected-state rendering is more coherent.** The same authoritative date now drives cell selection, focused-week composition, agenda title/count/events, and subsequent month clamping (`src/ui/screens/CalendarScreen.tsx:370-407,577-605,648-705,807-879`).

### Pillar 3: Color (4/4)

- **PASS — semantic palette is unchanged.** Light/Dark paper, surface, line, text, Running/action blue, Strength orange/DEV-02 title, completion, caution and focus roles remain centralized (`src/ui/theme/index.ts:275-297`).
- **PASS — no color regression entered the delta.** Phase 16-owned UI contains no hardcoded color literal; sport/status independence and the prior 60/30/10 distribution remain unchanged.

### Pillar 4: Typography (4/4)

- **PASS — typography is unchanged and exact.** Calendar remains on the approved 11/14/16/22sp and 400/800 roles with Archivo/IBM Plex Mono (`src/ui/theme/index.ts:146-186`).
- **PASS — 200% mechanics remain enabled.** No text-scaling override was introduced; existing scaled track, month-control and agenda tests remain green.

### Pillar 5: Spacing (4/4)

- **PASS — geometry is unchanged.** DEV-01 adaptive inset, 48dp targets, 2/3/10/14/18dp Calendar exceptions, 28/36 tracks, agenda rail and focus clearance remain untouched.
- **PASS — synchronized state does not add layout work.** `select-date` emits no motion command and updates only immutable semantic state; layout measurements and spacing remain owned by the existing viewport and row components (`src/ui/calendar/calendarTransitionController.ts:287-292`).

### Pillar 6: Experience Design (4/4)

- **PASS — same-month selection has one authority.** Touch, keyboard and same-month Today dispatch `select-date`; controller publication updates the rendered selected date/ref, so agenda, focus, expand/collapse and later month clamping cannot drift (`src/ui/screens/CalendarScreen.tsx:365-407,450-484`).
- **PASS — invalid and concurrent input fails closed.** Civil-date parsing rejects invalid dates; out-of-month and non-idle `select-date` events are no-ops (`src/ui/calendar/calendarTransitionController.ts:287-292`).
- **PASS — all prior interaction contracts remain green.** Month drag, Today across months, focused Previous/Today/Next, reduced motion, Back priority, stale completion fencing, return refresh/focus and immutable destination routing all pass their focused suites.

---

## Audit Trail and Verification

- Current audited HEAD: `53b3d1a7d936d4024daf51e1f20d1d62814096ed`.
- Prior certified baseline: `d97ea569fc6f8671df94f68e64635c55d06864aa`, **24/24**.
- Phase 16 source delta inspected: `28f77d9e`, merged by `4a3be035`. Concurrent Phase 19 source is disjoint and excluded from scoring.
- No Phase 16 owner/spec/oracle file changed.
- Revision 18 hashes re-verified: `approved-hybrid.html` = `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`; `approved.json` = `b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf`.
- Screenshot-safety gate: `.planning/ui-reviews/.gitignore` covers PNG/WebP/JPEG/GIF/BMP/TIFF; no file change was needed.
- Dev-server detection: ports 3000, 5173, and 8080 returned `000`; no web screenshots were captured. Native capture/device execution is Phase 20-only and unscored.
- Targeted UI/route/sheet verification: **18 suites, 239 tests passed**.
- Civil-date/event unit verification: **2 suites, 52 tests passed**.
- TypeScript: `npm run typecheck` passed.
- Boundaries: `npm run check:boundaries` passed across **430 files**.
- Static checks: source diff check passed; no Phase 16 color literals or disabled text scaling; registry audit skipped because `components.json` is absent and the UI-SPEC declares no third-party registries.

The Garmin route suite emits its known React test-environment `act(...)` console diagnostic, but all assertions pass; this is not a product UI finding. Native screenshots, physical keyboard/D-pad focus, device-only geometry, and release/profile performance remain explicitly owned by Phase 20.

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

### Phase 16 implementation

- `app/(tabs)/calendar.tsx`
- `app/session/[sessionId].tsx`
- `app/calendar/plan/[occurrenceId].tsx`
- `app/library/running/[planId].tsx`
- `app/garmin/activity/[activityId].tsx`
- `src/domains/history/calendar.ts`
- `src/domains/scheduling/localDate.ts`
- `src/ui/screens/CalendarScreen.tsx`
- `src/ui/calendar/calendarTransitionController.ts`
- `src/ui/calendar/CalendarMonthViewport.tsx`
- `src/ui/calendar/CalendarWeekRow.tsx`
- `src/ui/calendar/CalendarAgenda.tsx`
- `src/ui/calendar/CalendarDisclosureChevron.tsx`
- `src/ui/calendar/CalendarReadOnlyWorkout.tsx`
- `src/ui/calendar/CalendarRouteAdapters.tsx`
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
