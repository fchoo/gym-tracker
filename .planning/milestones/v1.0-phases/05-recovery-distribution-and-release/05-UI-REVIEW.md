# Whole-app Material 3 UX Review — Phase 05 release candidate

**Audited:** 2026-08-31
**Baseline:** DESIGN.md; approved Phase 1–5 UI contracts/context; current implemented source; exact installed candidate APK; official Material 3 guidance in the matrix below
**Scope:** Entire implemented Gym Tracker app, not only Phase 5
**Runtime evidence:** Captured from `com.fchoo.gymtracker` 0.1.0 on `emulator-5554` (Android 16, 1080 x 2400, 420 dpi) under `.planning/ui-reviews/material3-runtime-20260831/`. Each referenced PNG has a matching UI Automator XML hierarchy. Samsung `R5CW12NVRPE` was not enumerated during this fresh pass, so no new Samsung screenshots are claimed.
**Supersession:** Fresh whole-app Material 3 re-audit replacing the prior Phase 5 source-only review.
**APK identity:** The installed emulator APK was pulled back and independently verified as SHA-256 `3383558069db759a0fe781c0a68f349423576a3953507dbae787df6aba99febd`, matching the supplied final candidate.
**Release status:** Promotion is paused.

## Executive verdict

The app has a coherent repository-owned foundation: approved Source Sans 3 and IBM Plex Mono weights are centralized, spacing/radius/target tokens exist, the four-root shell is explicit, and many loading/error/empty/transaction states are thoughtfully modelled. That foundation does not make the current UI Material 3-conformant. High-salience Library discovery and calendar controls are custom approximations that miss requested M3 behavior. These are normal-task defects, not edge-case polish.

Live evidence confirms the highest-impact problems. A filter value changes its accessibility `checked` state but remains visually indistinguishable, while the summary is black on the dark canvas. A horizontal swipe leaves the calendar on the same month, and adjacent-month cells remain blank. Selected Favorite changes to a green outline instead of a filled green star. Browse rows devote multiple lines to source/revision/license text. The reorder UI splits handle, label, position, and arrows across a tall multi-line row. The date-picker dialog is an oversized custom grid with stacked text navigation. At 200% font scale, bottom-navigation labels wrap and clip. Progress repeatedly opens in its error state and remains there after Retry on the exact candidate. Today also presents both an overflow icon and a large redundant `More` button.

Source inspection explains the reported behavior: filter choices have no selected-state styling and the summary is an unthemed Text node; Search is implemented as plain TextInput; the calendar renders only the active month and has button-only navigation; reorder performs one move on release rather than continuous touch-and-hold drag; selected Favorite has no fill; and Library has a permanent refresh button without pull-to-refresh.

## Pillar scores

| Pillar | Score | Key finding |
|---|---:|---|
| 1. Copywriting | 2/4 | Factual state copy is strong, but generic/filter copy, source/version browse metadata, and refresh/search wording conflict with the current product request. |
| 2. Visuals | 2/4 | Shell/card hierarchy is coherent, but filters, Search, calendar, favorite state, and reorder rows visibly diverge from the requested M3 patterns. |
| 3. Color | 2/4 | Theme tokens are centralized, yet the filter summary bypasses theme colors and selected filter/favorite states lack adequate visible differentiation. |
| 4. Typography | 2/4 | Approved families and weights are centralized, but 200% text clips root-navigation labels and dense metadata dominates exercise rows. |
| 5. Spacing | 2/4 | Most targets use the required rhythm, but crowded filter actions, fixed calendar cells, and reorder wrapping need redesign/device proof. |
| 6. Experience Design | 1/4 | Core discovery interactions lack M3 filter/search/calendar/refresh/drag behavior, and Progress repeatedly fails on the exact candidate. |

**Overall: 11/24**

This is intentionally adversarial. Release promotion must remain paused until P0/P1 findings are resolved and a rebuilt exact APK receives attended Samsung/emulator, accessibility, adaptive, and visual verification.

## Material 3 component-conformance matrix

| Component / guidance | Current implementation | Gap / verdict | Recommendation | Source |
|---|---|---|---|---|
| Filter chips | Library FilterSheet uses checkbox-role pressable rows; active values use SecondaryAction rows (LibraryScreen.tsx:932-1090,1672-1726). | BLOCKER/P0: not M3 filter chips; selection has no visible visual state; Favorite is buried in sheet. | Use visible/removable M3 filter chips and a standalone Favorite chip; preserve overflow sheet for taxonomy. | https://m3.material.io/components/chips/guidelines |
| Search | Bare TextInput in Library and Progress; generic PlanEditorTextField in owned-plan exercise picker (LibraryScreen.tsx:382-435; ProgressScreen.tsx:533-562; OwnedPlanEditorScreen.tsx:1227-1236). Live Library uses a labelled outline field plus a detached circular X control. | WARNING/P1: no shared M3 Search container, leading icon, or consistent clear/suggestion behavior. | Build one Search primitive and use it across Library, Progress, and picker. | https://m3.material.io/components/search/overview |
| Date picker | Custom Modal with month buttons, fixed grid, Confirm/Cancel (CalendarField.tsx:394-591). | WARNING/P1: civil-date safety is good, but visual hierarchy and interaction do not match the requested M3/Google Calendar-inspired pattern. | Use M3 dialog hierarchy; add the user-contract adjacent days and swipe behavior with button alternatives. | https://m3.material.io/components/date-pickers/overview |
| Calendar/list | Root calendar inserts leading blanks then current-month days only (CalendarScreen.tsx:160-209); sessions are cards below. | BLOCKER/P0 against the user contract: incomplete grid and no horizontal month swipe. These behaviors are product requirements, not claimed as universal M3 mandates. | Six-row adjacent-month grid and horizontal pager with labelled previous/next buttons. | https://m3.material.io/components/date-pickers/overview |
| Lists | Plans, exercises, sessions and progress rows use pressable/card surfaces (LibraryScreen.tsx:650-750; PlanEditorFields.tsx:155-223). | WARNING/P1: browse rows carry excessive metadata and compound actions. | Keep primary item plus concise supporting context and stable trailing actions; remove source/version from browse. | https://m3.material.io/components/lists/guidelines |
| Navigation bar/rail | Custom AppTabs changes from bottom to left rail at expanded width (components/index.ts:1027-1144; tabs/_layout.tsx:14-43). | BLOCKER/P0 accessibility: at 200% font scale, `Calendar`, `Library`, and `Progress` wrap and clip inside the fixed bottom bar. | Make the compact navigation bar large-text-safe; validate selected indicator, safe area, labels, and target sizes at supported scales. | https://m3.material.io/components/navigation-bar/overview |
| Switch | Rest settings expose switch semantics (RestAlertSettingsSheet and tests). Live light-mode track/thumb state is legible. | WARNING/P2: disabled, focus, dark, TalkBack, and high-text states remain unverified. | Verify M3 state layers and 48dp targets on the rebuilt exact APK. | https://m3.material.io/components/switch/overview |
| Icon buttons | IconAction supplies labels, 48dp minimum, 24dp Lucide icon, 2dp stroke (components/index.ts:378-460; theme/index.ts:49-59). | WARNING/P1: live selected Favorite is a green outline only, not the requested filled star. | Use an M3 selected state layer and fill selected Favorite green. | https://m3.material.io/components/icon-buttons/overview |
| Menus | No shared M3 menu primitive; choices are custom sheets/radio/action rows. | WARNING/P2: no automatic defect, but interaction consistency is weak. | Use menus for short choices and dialogs/sheets for consequential/multi-select flows. | https://m3.material.io/components/menus/overview |
| Dialogs/sheets | Custom React Native Modal surfaces provide focus flags and restoration (components/index.ts:819-1025; CalendarField.tsx:394-591). Live date picker uses stacked text month controls, a large empty header area, and a dense custom calendar. | WARNING/P1: hierarchy, action layout, and interaction do not match the requested M3 date-picker experience. | Normalize to M3 dialog/bottom-sheet patterns and validate Back/IME/focus/200% fit. | https://m3.material.io/components/dialogs/overview |
| Progress indicators | SkeletonBlock and custom ProgressTrend/table (ProgressScreen.tsx:655-730; ProgressTrend.tsx). The exact production candidate repeatedly renders `Progress could not be loaded`, including after Retry. | BLOCKER/P0 functional UX: the normal Progress surface is unavailable in this runtime state; root cause is outside this visual audit. | Diagnose/fix the load failure before visual polish, then verify loading, empty, sparse, chart, and recommendation states. | https://m3.material.io/components/progress-indicators/overview |
| Pull-to-refresh | Permanent Refresh Library button; AdaptiveScreen has no RefreshControl (LibraryScreen.tsx:1492-1522,1696-1701; AdaptiveScreen.tsx:163-177). | WARNING/P1: functional but not the most intuitive list-owned interaction. | Add pull-to-refresh; retain labelled retry only after failure. | https://m3.material.io/components/pull-to-refresh/overview |
| Accessibility | Shared labels, Enter/Space, focus outlines, modal flags, and state announcements exist (components/index.ts:83-101,198-247; DESIGN.md). | BLOCKER/P0: live 200% text clips root-navigation labels; filter selected state has no visible cue. TalkBack, D-pad, contrast measurement, and physical-device evidence remain open. | Fix large-text navigation and visible state first; then run exact-candidate TalkBack/D-pad/contrast/target audit and retain button alternatives for gestures. | https://m3.material.io/foundations/accessible-design/overview |

## User-reported issue mapping

| # | Requirement | Evidence / verdict | Severity / priority | Remediation | Screenshot |
|---:|---|---|---|---|---|
| 1 | Filters respond; no black-on-dark summary; M3 chips; standalone Favorite. | Live: choosing Powerlifting changes UI Automator `checked=false` to `checked=true`, but the row remains visually identical; dark Library renders `No filters selected` in black; Favorite remains buried in the sheet. This confirms perceived non-response, not a missing state mutation. | BLOCKER / P0 | Shared filter chips, visible selected state, themed summary or remove it, standalone Favorite chip. | `06-library-filters.png`, `07-library-filter-selected.png`, `13-library-dark.png` |
| 2 | All search inputs use M3 Search. | Source confirms three divergent text-field paths. Live Library shows a plain outlined field plus detached circular clear button and no leading search icon. | WARNING / P1 | One shared M3 Search with leading icon, clear, focus/busy/suggestion states. | `03-library.png`, `05-library-exercises.png` |
| 3 | Calendar adjacent days and horizontal left/right swipe. | Live root calendar leaves leading/trailing cells blank. A left swipe leaves `August 2026` unchanged; source has button-only navigation. | BLOCKER / P0 | Complete six-row grid, horizontal paging, button alternatives, selected-date preservation. | `02-calendar.png`, `calendar-before-swipe.xml`, `calendar-after-swipe.xml` |
| 4 | Touch-and-hold drag reorder; one-row icons/label; up/down buttons instead of switches. | Live plan editor stacks a tall drag handle beside a multi-line label/position/arrows layout. Source PanResponder makes one move on release after a threshold, not continuous displacement. | WARNING / P1 | Real drag displacement with 48dp handle plus explicit up/down; responsive same-row trailing actions. | `17-plan-editor-dark.png` |
| 5 | Cleaner Google Calendar/M3 date-picker dialog. | Live picker is a tall custom modal with stacked `Previous month`/`Next month` text buttons, blank leading cells, and oversized actions. | WARNING / P1 | M3 dialog structure, selected-date header, adjacent days, swipe/button parity. | `19-date-picker-dark.png` |
| 6 | Explain Refresh Library; prefer pull-to-refresh. | Live permanent `Refresh Library` is crowded beside Filter/summary; source confirms no RefreshControl, while explicit retry states already exist. | WARNING / P1 | Pull-to-refresh; keep retry in error notice and remove permanent row button. | `03-library.png`, `05-library-exercises.png` |
| 7 | Selected Favorite star filled green. | Live selected Favorite becomes a green outline and border but remains unfilled, matching source. | WARNING / P1 | Fill selected Star with approved completed green and retain label/state. | `15-library-favorite-selected-dark.png` |
| 8 | Remove source/version metadata from exercise list. | Live browse rows devote two to three lines to namespace, full revision hash, license, and attribution. | WARNING / P1 | Keep provenance only in Exercise detail/disclosure. | `14-library-exercise-row-dark.png`, `15-library-favorite-selected-dark.png` |

## Confirmed source defects

### S-01 — Filter selection is semantically updated but visually inert (BLOCKER/P0)

FilterSheet toggles draft state and exposes checked accessibility state, but its style only uses divider color and never reads option.selected (LibraryScreen.tsx:1061-1081). The main summary is a bare Text node (1679-1683), creating a black-on-dark risk. This is source evidence for the reported non-response.

### S-02 — Filter architecture is not M3 chip architecture (WARNING/P1)

Active values are SecondaryAction rows labelled Remove ..., while options are checkbox rows. M3 filter chips should expose selected/filter state compactly and removably; Favorite is not easy access (LibraryScreen.tsx:245-282,1018-1087,1717-1725).

### S-03 — Search is not a shared M3 Search component (WARNING/P1)

Library, Progress, and owned-plan picker use divergent plain text-field paths without a leading Search affordance or unified state treatment (LibraryScreen.tsx:382-435; ProgressScreen.tsx:533-562; OwnedPlanEditorScreen.tsx:1227-1236).

### S-04 — Calendar grid is incomplete and button-only (BLOCKER/P0)

Root calendar renders leading blanks and current-month dates only; it omits adjacent days and has no swipe (CalendarScreen.tsx:160-209,318-370). CalendarField also has only month buttons (CalendarField.tsx:434-489).

### S-05 — Reorder gesture is one-step release, not continuous drag (WARNING/P1)

PanResponder invokes one move action at release when dy crosses 24px; it does not track a held item or direct displacement (PlanEditorFields.tsx:141-153). Named actions are a good fallback, but the visible action group is separate from label content (197-220).

### S-06 — Browse rows expose source/version metadata (WARNING/P1)

Exercise browse rows show namespace, revision, license and attribution (LibraryScreen.tsx:701-710), contrary to the requested concise exercise list.

### S-07 — Favorite is not filled when selected (WARNING/P1)

Selected branch changes color/border only; Star has no fill prop (LibraryScreen.tsx:731-746).

### S-08 — Permanent refresh button replaces pull-to-refresh (WARNING/P1)

Library places Refresh Library beside Filter/summary/Clear, while AdaptiveScreen has no RefreshControl (LibraryScreen.tsx:1492-1522,1672-1703; AdaptiveScreen.tsx:163-177).

### S-09 — Custom date picker needs M3 visual rework (WARNING/P1)

CalendarField is civil-date-safe but its generic Modal/grid does not provide the requested M3/Google Calendar-like hierarchy (CalendarField.tsx:394-591).

## Confirmed runtime defects

### R-01 — Filter selection has no visible selected treatment (BLOCKER/P0)

On the exact production APK, tapping `Exercise type · Powerlifting` changes its UI Automator state from `checked=false` to `checked=true`, while before/after screenshots remain visually indistinguishable. The interaction therefore works semantically but appears nonresponsive to a sighted user. Evidence: `06-library-filters.*`, `07-library-filter-selected.*`.

### R-02 — Filter summary is unreadable in dark mode (BLOCKER/P0)

`No filters selected` renders black directly on the dark canvas. The adjacent buttons are themed correctly, which makes the unthemed summary especially obvious. Evidence: `13-library-dark.*`.

### R-03 — Calendar is incomplete and does not swipe (BLOCKER/P0)

The August 2026 grid begins with six blank cells before day 1 and ends after day 31 instead of filling the grid with adjacent-month dates. A leftward horizontal swipe did not change `August 2026`; the before/after accessibility hierarchies retained the same month. Evidence: `02-calendar.*`, `calendar-before-swipe.xml`, `calendar-after-swipe.xml`.

### R-04 — Exercise rows are dominated by provenance metadata (WARNING/P1)

Each browse card renders the full source namespace, 40-character revision, MIT license, and copyright line. Four items already consume nearly a full screen, reducing scan speed for the primary task of choosing an exercise. Evidence: `14-library-exercise-row-dark.*`.

### R-05 — Selected Favorite is outline-only (WARNING/P1)

After selection, the star stroke and container border turn green and accessibility changes to `Favorite`, but the star remains hollow. Evidence: `15-library-favorite-selected-dark.*`.

### R-06 — Reorder layout is tall and fragmented (WARNING/P1)

The live plan editor places a tall six-dot handle in one column and stacks exercise name, count, ordinal, up, and down controls in another. It does not meet the requested single-line hierarchy; source confirms the gesture only commits a one-position move after release. Evidence: `17-plan-editor-dark.*`.

### R-07 — Date picker hierarchy diverges from Material 3 (WARNING/P1)

The live modal uses separate stacked text buttons for previous/next month, leaves adjacent-month cells blank, and gives large full-width rows to default/cancel/confirm actions. It is usable, but not the requested Google Calendar/Material 3 dialog. Evidence: `19-date-picker-dark.*`.

### R-08 — Root navigation breaks at 200% text (BLOCKER/P0)

At Android font scale 2.0, `Calendar`, `Library`, and `Progress` wrap into clipped fragments inside the fixed-height bottom bar. The scale was restored to 1.0 immediately after capture. Evidence: `20-today-font-200.*`.

### R-09 — Progress remains unavailable after Retry (BLOCKER/P0)

Progress opened in `Progress could not be loaded` on repeated visits and remained in the same state after pressing `Retry loading progress`, including after activating the starter plan. This is reproducible on the exact production candidate; this visual audit does not claim a root cause. Evidence: `04-progress.*`, `22-progress-recheck-dark.*`, `23-progress-after-retry-dark.*`.

### R-10 — Today duplicates the More affordance (WARNING/P1)

Today shows an overflow icon in the header for appearance/rest-alert settings and a full-width `More` button directly below it for the More route. The same generic label represents two different destinations and consumes prime vertical space. Evidence: `01-today.*`, `20-today-font-200.*`.

### Runtime strengths observed

- The four root destinations remain identifiable and selected state uses both color and icon context at normal scale.
- More and Data and recovery use clear grouping, readable caution copy, explicit disabled states, and large targets (`09-more.*`, `10-data-and-recovery.*`).
- Rest-alert settings use understandable switch states and a clear notification-permission recovery action (`11-settings-sheet.*`).
- The Appearance sheet provides System/Light/Dark radio semantics and visibly selected state (`12-appearance-sheet.*`).
- The installed package and candidate hash were independently verified before the live audit.

## Human follow-up required

- Repeat representative screenshots and touch ergonomics on Samsung `R5CW12NVRPE`; it was not connected during this fresh pass.
- Verify TalkBack reading order, focus restoration, D-pad/keyboard focus, measured contrast, target sizes, IME, rotation, and reduced motion.
- Re-test the rebuilt app at 200% text across every root screen, dialog, active workout/rest dock, history/correction, and recovery flow; only Today/root navigation received a fresh 200% capture here.
- Verify true continuous touch-and-hold drag and pull-to-refresh after implementation.
- Diagnose Progress load failure separately before treating its visual states as reviewed.

## Surface-by-surface result

| Surface | Result |
|---|---|
| Today/onboarding | Live Today is coherent at normal scale, but duplicate `More` affordances add ambiguity and the root navigation clips at 200% text. WARNING/P1 plus BLOCKER/P0. |
| Active workout/rest | Profile-aware fields, commit/retry/correction and rest actions exist; sticky dock, timer contrast, notification, and large-text fit need attended validation. WARNING/P2. |
| Calendar/month/history | Factual sessions and state labels exist, but incomplete grid/no swipe is BLOCKER/P0. |
| Session correction/removed | Explicit correction, restore/remove confirmation and factual states exist; dialog/list density and focus require runtime validation. WARNING/P2. |
| Library Plans/Exercises | Live light/dark evidence confirms invisible selected filters, black dark-mode summary, non-M3 Search, outline-only selected star, provenance clutter, and crowded refresh placement. BLOCKER/P0 plus WARNING/P1. |
| Starter plans/activation | Schedule and source-note preview is present; custom choice surfaces require M3/device validation. WARNING/P2. |
| Owned plan/editor/replacement | Explicit save and impact preview are strong; live reorder rows are fragmented and source confirms no continuous drag. WARNING/P1. |
| Schedule/date fields | Local-date contract and accessible trigger are good; live picker visual hierarchy/navigation need M3 rework. WARNING/P1. |
| Progress | Exact candidate repeatedly remains in the recoverable error state after Retry; normal content could not be visually audited. BLOCKER/P0. |
| More/data recovery | Runtime strengths observed in grouping, copy, disabled states, and targets; native picker/share and TalkBack remain P2 follow-up items. |
| Global Material system | Central tokens/shared labels are strengths; root navigation fails 200% text and custom controls need M3 convergence. BLOCKER/P0 plus WARNING/P1. |

## Implementation sequence (do not implement during audit)

1. **Library P0 repair:** shared M3 filter chips; visible selected states; themed summary; standalone Favorite; source/version removal; filled green Favorite; focused tests for light/dark/keyboard.
2. **Shared Search P1:** one Search primitive with leading icon, clear, focus/busy/suggestion states; replace Library, Progress, and owned-plan picker.
3. **Calendar P0/P1:** complete adjacent-month six-row grid; horizontal month pager plus labelled buttons; M3/Google Calendar-like CalendarField dialog; preserve LocalDate/bounds/focus.
4. **Ordering P1:** real continuous touch-and-hold drag with 48dp handle; explicit up/down fallback; responsive same-row label/actions; save only draft until explicit save.
5. **Global accessibility and defects:** make root navigation safe at 200% text; remove/rename duplicate Today `More`; diagnose/fix Progress loading; then validate NavigationBar/Rail, switches, dialogs/sheets, icon buttons, progress, scrim/elevation/shape/motion, and safe areas.
6. **Refresh/global M3:** add pull-to-refresh with explicit failure retry and verify its semantics, loading indicator, and list scroll interaction.
7. **Release gate:** close all P0/P1 findings, rebuild, pull-back/hash-verify the exact APK, and bind attended emulator plus Samsung visual/accessibility/adaptive evidence to that same candidate. This audit is not release approval.

## Files audited

- AGENTS.md, .trae/rules/rules.md, DESIGN.md
- Phase 01–05 UI-SPEC.md and CONTEXT.md files
- Phase 05 SUMMARY.md and PLAN.md files 05-01 through 05-07
- src/ui/theme/index.ts; src/ui/components/index.ts; CalendarField.tsx; PlanEditorFields.tsx; ProgressTrend.tsx; RestAlertSettingsSheet.tsx; RestDock.tsx; ScheduleBindingEditor.tsx; WorkoutStartSheet.tsx
- src/ui/layout/AdaptiveScreen.tsx
- source screens Today, ActiveWorkout, Calendar, Library, Progress, OwnedPlanEditor, ExerciseEditor, ExerciseReplacement, ScheduleEditor, StarterPlanDetail, StarterActivation, SessionDetail, SessionCorrection, RemovedSessions, ExerciseDetail, ExerciseHistory, WorkoutCompletion
- app/_layout.tsx; app/(tabs)/_layout.tsx and root routes; app/more/index.tsx; app/more/data-and-recovery.tsx
- relevant src/ui tests, Maestro phase5 flows, and release/evidence scripts for intended runtime gate context
- The two historical paths named by rules were absent: /Users/bytedance/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md and /Users/bytedance/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md. DESIGN.md and phase contracts were used instead.

## Registry safety

No components.json was found; shadcn/third-party registry audit does not apply.

## Official Material 3 references

- Chips: https://m3.material.io/components/chips/guidelines
- Search: https://m3.material.io/components/search/overview
- Date pickers: https://m3.material.io/components/date-pickers/overview
- Lists: https://m3.material.io/components/lists/guidelines
- Navigation bar: https://m3.material.io/components/navigation-bar/overview
- Switch: https://m3.material.io/components/switch/overview
- Icon buttons: https://m3.material.io/components/icon-buttons/overview
- Menus: https://m3.material.io/components/menus/overview
- Dialogs: https://m3.material.io/components/dialogs/overview
- Progress indicators: https://m3.material.io/components/progress-indicators/overview
- Pull to refresh: https://m3.material.io/components/pull-to-refresh/overview
- Accessible design: https://m3.material.io/foundations/accessible-design/overview
