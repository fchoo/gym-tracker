---
phase: 6
slug: material-3-ux-remediation
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-31
reviewed_at: 2026-08-31T06:44:39Z
---

# Phase 6 — Material 3 UX Remediation: UI Design Contract

> Canonical visual and interaction contract for the Material 3, accessibility, and Progress-runtime repairs reproduced on the exact Phase 5 candidate. This extends the repository-owned precision-instrument system; it does not replace that system with a generic Material theme.

## Contract Authority and Scope

Implementation precedence:

1. 06-CONTEXT.md decisions D-68 through D-82.
2. UX-01 through UX-10 and the Phase 6 success criteria in REQUIREMENTS.md and ROADMAP.md.
3. This UI contract.
4. DESIGN.md and approved Phase 1–5 contracts for unchanged shell, source-authority, accessibility, and release behavior.

Material 3 is the primary authority for component purpose, hierarchy, state feedback, and accessible interaction. The six-row calendar with selectable adjacent-month dates and bidirectional horizontal month swiping are locked product requirements from D-73/D-74. They are layered onto Material 3 date/calendar direction and must not be described as universal Material 3 mandates.

### Included

- Shared Material 3-aligned filter-chip and Search primitives.
- Library filtering, pull-to-refresh, favorite state, and concise browse rows.
- Root Calendar's complete month grid and month navigation.
- One CalendarField dialog for every existing in-app civil-date field.
- Continuous touch-and-hold reorder plus non-gesture alternatives.
- Large-text-safe root navigation, one clear Today secondary-tools route, and Progress recovery presentation.
- Component, native-gesture, accessibility, appearance, and adaptive verification for replacement candidate bytes.

### Excluded

- New information architecture, source-data fields, workout/schedule/progression rules, backup semantics, or release-promotion flow.
- A new component framework, shadcn setup, third-party registry block, font, icon library, chart library, or colour palette.
- Accounts, cloud sync, Health Connect, Wear OS, owner approval, promotion, public tag, and Terminal Seal.

## Design System

| Property | Contract |
|---|---|
| Tool | Repository-owned Expo/React Native theme and primitives in src/ui/theme and src/ui/components |
| Preset | Not applicable — Expo/React Native Android, not a React web/shadcn project |
| Component library | None; extend repository-owned primitives only |
| Gesture/runtime libraries | Installed react-native-gesture-handler ~2.32.0 and react-native-reanimated 4.5.1 for reorder and month navigation |
| Icon library | Existing Lucide React Native 1.31.0, outlined at 2dp stroke except the selected Favorite star fill |
| Interface font | Source Sans 3, bundled weights 400 and 600 only |
| Numeric font | IBM Plex Mono, bundled weights 400 and 600 only, with tabular numerals |
| Direction | Quiet, high-contrast precision instrument: factual, compact, utility-first, and calm |
| Surface strategy | Continuous neutral-grey canvas; flat independently scannable content cards only; never nested cards |
| Appearance | System default plus Light/Dark overrides; every new selected, busy, disabled, and error state works in all three modes |

### Material 3 Alignment Rules

- Material 3 patterns clarify component jobs: filter chips expose selection; Search accepts queries and reports state; date dialogs collect explicit drafts; navigation selects destinations; icon buttons are compact supplementary actions.
- Preserve repository type, spacing, colour, radius, labels, and source-commit semantics. Do not import Material fonts, dynamic-colour APIs, default purple tones, gradients, elevated-card stacks, decorative pills, or Android system-UI lookalikes.
- Reuse and extend shared primitives in src/ui/components/index.ts and src/ui/layout/AdaptiveScreen.tsx. No screen-local lookalikes for Search, filter chips, date selection, pull-to-refresh, or reordering.
- A user-visible state has both a visual treatment and an accessibility state. Colour alone is never sufficient.

### Visual Anchors by Screen

| Screen | Primary visual anchor | Supporting hierarchy |
|---|---|---|
| Library | The labelled Search field followed by the visible `Favorite` and `Filters` chip row is the discovery anchor. | Results begin immediately below the chip row; selected chips explain active scope without a permanent summary label. Create actions and pull-to-refresh do not compete with discovery. |
| Calendar | The current month heading and complete six-row date grid are one calendar anchor, with the selected date visibly marked. | Labelled previous/next month buttons flank the heading; selected-date session details follow the grid or occupy the existing secondary pane. |
| Plan editor / reorder | The plan-day or exercise list is the editing anchor; during drag, the held row and live neighbour displacement become the sole transient anchor. | The handle, primary label, compact position, and Move controls remain grouped; `Save Plan Changes` remains the single persistence action and does not compete with a draft reorder. |
| Progress | The selected period control and its source-backed overall result state are the reading anchor. | Progress sections follow in factual order; a loading/error/empty state replaces only the unavailable content region, and `Retry loading progress` becomes primary only in the recoverable error state. |
| Today | The scheduled workout and its existing `Start {day name}` primary action remain the operational anchor. | `Appearance and rest-alert settings` stays in header overflow; `History and data` is a compact secondary route and never competes with starting or resuming today's workout. |

## Spacing Scale

The existing fixed layout scale remains the only spacing scale. All values are multiples of 4dp.

| Token | Value | Phase 6 use |
|---|---:|---|
| space.1 | 4dp | Icon-to-label gaps inside chips and inline states |
| space.2 | 8dp | Chip gaps, search internals, compact rows, dialog actions |
| space.4 | 16dp | Search/filter blocks, standard padding, compact inset |
| space.6 | 24dp | Editorial section separation |
| space.8 | 32dp | Medium/expanded layout gap and major separation |
| space.12 | 48dp | Empty-state or major pane separation |
| space.16 | 64dp | Maximum expanded whitespace only |

| Element | Required sizing and layout contract |
|---|---|
| Interactive target | Minimum 48 × 48dp, including chips, date cells, icon buttons, drag handle, and Move controls |
| Search field | Minimum 48dp high; leading icon, text input, and integrated clear/busy affordance are within one bounded field |
| Filter chip | Minimum 48dp high; 16dp horizontal padding; 8dp chip gap; labels wrap to a new chip row rather than clip |
| Calendar | Seven columns; every day has a 48dp minimum interactive region; no required date is horizontally scrollable |
| Reorder row | At least 48dp high at default scale; 48dp handle and 48dp Move controls; row grows at large text |
| Navigation | Every tab remains at least 48dp high/wide; compact navigation grows into two rows at large text instead of clipping |
| Date dialog | 12dp radius, 16dp padding; vertical scrolling is allowed at short height/large text; grid never needs horizontal scrolling |
| Existing action dimensions | Primary actions remain 56dp high; standard/emphasized radii remain 8dp/12dp |

Exceptions: none. A constrained Calendar grid may reduce surrounding inset only to another declared token value; it must not shrink a day target, create custom spacing, or horizontal-scroll required dates.

## Typography

The app retains exactly four rendered sizes (14, 16, 28, and 52sp) and exactly two weights (400 and 600). Phase 6 creates no type token.

| Role | Family | Size / line height | Weight | Phase 6 use |
|---|---|---:|---:|---|
| Display | IBM Plex Mono | 52 / 56sp | 600 | Existing timer only; not a Phase 6 control size |
| Screen title / selected-date hierarchy | Source Sans 3 | 28 / 34sp | 600 | Root titles and the emphasized draft date in the dialog |
| Body / control label | Source Sans 3 | 16 / 22sp | 400 or 600 | Query text, chips, actions, list primary text, status copy |
| Supporting / compact label | Source Sans 3 | 14 / 20sp | 400 or 600 | Weekday labels, concise browse context, position, short labels |

Rules:

- Required instructions, selected state, error state, and sole status expressions use 16sp body or pair 14sp text with an icon/shape; they never rely only on secondary text.
- Primary exercise/plan names wrap to two lines before truncation. Browse rows never truncate a name merely to preserve provenance or a trailing star.
- At Android 200% text, labels, chips, actions, dialog content, root destinations, and reorder rows reflow or grow vertically. Never reduce the font scale, clip, hide, or split a required label into a clipped fragment.
- Numeric dates/counts use IBM Plex Mono only when presented as numeric values. Prose dates and action labels use Source Sans 3.

## Color

### 60 / 30 / 10 Allocation

| Allocation | Light | Dark | Usage |
|---|---|---|---|
| Dominant 60% | canvas #F1F3F4 | canvas #202124 | Continuous root background and reading space |
| Secondary 30% | contentCard #FFFFFF, surface #F8F9FA, surfaceSubtle #E8EAED | contentCard #121212, surface #171B1E, surfaceSubtle #20262A | Flat cards, Search/filter/date surfaces, neutral state layers, navigation chrome |
| Accent 10% | action #155EEF | action #70A0FF | Primary actions, selected navigation, selected segmented state, selected filter check/border, focus, navigable text |
| Destructive | #B42318 | #FF746A | Error/destructive text, icon, border, and action only |

| State | Required visual and semantic treatment |
|---|---|
| Unselected filter chip | surface background, divider outline, primary label, no check icon |
| Selected filter chip | contentCardSelected background, action outline and check icon, primary label, selected/checked accessibility state |
| Pressed chip/list/icon action | Existing surfaceSubtle or contentCardPressed state layer; no scale or bounce |
| Focused external-input control | Existing 2dp focusRing visible in Light and Dark |
| Favorite active | Filled Lucide Star in approved green contentCardStatusCompleted, visible Favorite chip label or selected programmatic state |
| Favorite inactive | Outlined star in card text colour and Not favorite programmatic state |
| Adjacent-month day | Same touch target and day-state markers; textSecondary date label unless selected |
| Disabled date/control | Readable textSecondary, disabled semantics, muted surface/outline; not opacity alone |
| Busy | Neutral skeleton or in-field progress plus busy state; never fake a zero result |
| Error | errorSurface plus destructive icon/text/border and safe copy; preserve unaffected content |

The green favorite fill is the D-71 localized exception to the normal green-as-completion rule. It must be paired with a star shape and accessible state, never colour alone. Normal text meets 4.5:1; large text and non-text controls meet 3:1 minimum.

Accent is reserved for the listed action/selection functions. Do not use blue as decoration, green alone to signal favorite, or red for an ordinary empty state.

## Shared Component Inventory

| Primitive / surface | Required contract | Consumers |
|---|---|---|
| M3FilterChip | Compact 48dp filter choice with label, optional semantic icon, selected check, visible selected container, pressed/focus/disabled states, and selected programmatic state | Library visible filter row and full taxonomy surface |
| M3SearchField | One bounded search field with leading Search icon, visible/accessible label, integrated clear only for non-empty query, IME search behaviour, and busy/empty/error/result semantics | Library plans, Library exercises, Progress exercises, owned-plan picker |
| CalendarMonthGrid | Fixed six-row × seven-column civil-date grid with weekday headings, selectable subdued adjacent dates, non-colour state markers, selected state, labelled month buttons | Root Calendar and CalendarField dialog |
| CalendarFieldDialog | Modal with private draft, selected-date hierarchy, bounds-aware complete grid, swipe/button parity, `Keep Original Date`/`Apply Date`, focus trap/restore, LocalDate-only values | Every existing CalendarField consumer |
| ReorderableListRow | Continuous long-press drag from 48dp handle, live displacement, explicit Move up/down controls, keyboard/D-pad/accessibility actions, normal/large-text layouts | Plan day and plan exercise ordering |
| AdaptiveScreen refresh extension | Owning scroll surface supports pull-to-refresh without replacing current content, filters, query, or retry behaviour | Library |
| AppTabs adaptive navigation | Selected indicator/state, bottom bar at normal scale, two-row compact mode when necessary, expanded rail | All root destinations |
| Today secondary tools entry | Compact labelled route to History and data/recovery, distinct from appearance/rest-alert settings | Today |

No new parallel TextInput, calendar grid, filter row, drag handle, refresh action, or icon-button styling is permitted on an affected screen.

## Interaction Contracts

### Library discovery: filters, favorite, browse rows, and refresh

#### Filters

- On Library Exercises, render Search first and one compact visible chip row before results. Favorite is a standalone one-tap chip and always directly reachable; Filters opens the full taxonomy surface.
- The taxonomy surface is a bottom sheet on compact width and accessible dialog on medium/expanded width. It opens at Exercise filters, moves focus to the heading, traps modal accessibility, and restores focus to Filters when dismissed.
- Taxonomy options reuse M3FilterChip under factual group headings such as Type, Muscle group, Equipment, Origin, Visibility, and Recent use. Changes are draft-only inside the surface. `Show results` applies them; `Keep Current Filters` abandons the draft and retains the currently applied filters.
- Applied selections remain visible in the owning row as selected chips. Tapping a selected chip removes it. Do not reserve space for No filters selected, N filters selected, or an unthemed filter summary.
- A selected chip changes background, outline, and check icon and exposes selected/checked state. It is visually distinguishable in System, Light, and Dark without depending only on colour.
- Favorite selected has the filled approved-green star, Favorite label, selected semantics, and the selected-chip treatment. Inactive has an outlined star and Not favorite state.
- Preserve filter semantics: values within a category OR together; non-empty categories AND together. Applying/removing/clearing filters never changes source rows.

#### Search

- M3SearchField is the only search control used by Library plans, Library exercises, Progress exercises, and owned-plan picker. Its visual/programmatic labels are Search plans, Search exercises, and Search plan exercises.
- Anatomy is fixed: leading outlined Search icon; editable text; integrated trailing clear button only when a query exists; in-field busy indicator only while that surface searches/loads. A detached circular clear button is prohibited.
- Input uses Android IME Search and Enter/Space activation, exposes busy while work is in flight, and does not trap focus. Clear resets only the query, keeps focus and keyboard in the field, and returns to its correct unfiltered/initial result state.
- Do not introduce suggestions, recent queries, remote search, or invented debounce copy. The primitive displays only source-backed states from the owning view model.

#### Browse rows and favorite control

- Exercise browse, Favorites, and Recent rows show primary name; matched alias if present; concise type/muscles/equipment or availability context; then a stable trailing Favorite action.
- Browse rows omit source namespace, revision, license, and attribution entirely. Exercise Detail remains the only complete-provenance surface.
- The trailing Favorite action is 48dp and exposes Add {name} to favorites or Remove {name} from favorites. It disables only while that exact preference command is busy and does not navigate.
- The main row is separately labelled and opens Exercise Detail. Its spoken context retains useful status but does not repeat visually omitted provenance.

#### Pull-to-refresh

- Remove the permanent Refresh Library action. Pull-to-refresh belongs to the owning Library scroll surface; filter/search controls remain attached and results stay visible while refresh runs.
- Refresh indicator appears only during owner-initiated refresh. It exposes busy state and announces result once. It does not clear query, filters, selected item, section, or current results.
- Refresh failure preserves current results/filters and shows an inline notice with Retry Library refresh. Retry is absent before failure. Initial Library-load failure remains the distinct Retry Library state.

### Root Calendar

- Render exactly 42 civil-date cells every month: seven weekday headings plus a stable six-row × seven-column grid. Adjacent-month dates fill leading/trailing cells; blank placeholders are prohibited.
- Adjacent dates remain selectable. Selecting one updates selected LocalDate, moves visible month to that date's month, refreshes selected-date sessions, and preserves LocalDate/timezone behaviour.
- Current-day, selected-day, completed, partial, manual, and planned-not-completed retain existing factual meanings. Pair every state colour with existing glyph/icon/text and spoken state; no day state is colour-only.
- Selected date uses action-coloured outline plus selected surface and selected semantics. Adjacent dates use subdued secondary text but retain the target size.
- Month header has 48dp buttons labelled with destination months, such as Show September 2026 and Show July 2026. They remain keyboard, D-pad, TalkBack, and reduced-motion alternatives.
- Swipe left shows next month; swipe right shows previous. Buttons and swipe have identical transitions: retain selected day number where valid, otherwise select the target month's last valid civil day.
- Standard motion may slide directionally for 200ms. Reduced motion changes immediately with opacity acknowledgement; swipe remains functional.
- Loading uses stable month/session skeletons. Recoverable read error says Calendar could not be loaded, Your workout history was not changed. Try loading Calendar again., and Retry Calendar. A selected day without sessions says No sessions on {long date}.

### Shared date dialog

- Every existing CalendarField opens CalendarFieldDialog; no screen-local date picker remains. It is a consequential modal dialog, not a transient menu.
- Order: heading Select date; factual private-draft date such as Monday, 31 August 2026; compact month header with labelled previous/next buttons; weekday headings; complete bounded six-row grid; optional `Use Default Date`; trailing `Keep Original Date` and `Apply Date` actions.
- Grid always includes adjacent-month cells. Dates outside min/max remain visible but disabled and programmatically disabled. In-bounds adjacent dates stay selectable and update visible month when tapped.
- Swipe changes only displayed month. Tapping a valid date changes private draft. `Apply Date` is enabled only for a valid in-bounds draft and commits exactly that LocalDate. `Keep Original Date`, Android Back, and modal dismiss retain the original field value and make no write.
- Never parse date-only strings through JavaScript Date, convert LocalDate through an instant, alter bounds, or change timezone policy. Forward the civil-date string only after `Apply Date`.
- Open moves focus to heading; dialog traps accessibility; dismissal restores focus to trigger. Arrow keys move one/seven civil days; Enter/Space selects focused valid date; labelled month buttons remain available.
- At 200% text/short height, content may scroll vertically but grid remains complete and horizontally visible. Weekday visual abbreviations may collapse to one letter only at constraint; full weekday label remains programmatic. No required date/action clips or hides behind horizontal scrolling.

### Plan-day and exercise reordering

- Normal-text row has three horizontal regions: 48dp touch-and-hold handle; flexible primary/content region with label and compact position; 48dp explicit Move up/down controls. Regions do not fragment into separate stacked panels at normal scale.
- Handle is the sole touch-drag affordance. Long press starts continuous vertical drag; held row follows finger and neighbouring rows visibly displace throughout. Draft order changes only after valid drop, never from a release-threshold one-step move.
- While dragging, item uses raised/subtle surface and clear displacement. No spring, bounce, scale, or decorative shadow. Standard motion uses a short position transition; reduced motion changes order immediately while retaining direct manipulation and final-position announcement.
- Move up/down remain visible at every width and expose Move {label} up / Move {label} down. Handle also exposes equivalent adjustable/increment/decrement accessibility actions and keyboard activation.
- Drag, button, D-pad, keyboard, and screen-reader actions result in the same in-memory draft. `Save Plan Changes` remains the sole persistence action; drag never silently saves, mutates active snapshots, or bypasses revisions/conflicts.
- At 200% text, controls may reflow below content, but handle, position, both Move controls, and full primary label remain visible/reachable/unclipped.

### Root navigation, Today, and Progress

- Keep root order Today, Calendar, Library, Progress. Normal compact/medium uses bottom navigation; expanded may use existing rail.
- Selected root item uses accent plus visible selected indicator/state and selected semantics; unselected items retain icon and visible label. Selected state is not colour-only.
- When four full labels cannot fit in one compact bottom row at the current text scale/width, use two rows with two destinations each above safe area. Every destination keeps icon and full one-word label on one readable line. This is mandatory at Android 200% rather than clipping, icon-only navigation, horizontal scroll, or smaller font.
- Navigation grows to content and safe-area inset; root content/sticky actions clear it. Focus order remains Today, Calendar, Library, Progress.
- Keep Today header overflow exclusively for Appearance and rest-alert settings. Replace full-width generic More with compact History and data route to existing More (History and Data and recovery). The two controls have distinct labels, destinations, hints, and purposes.
- Diagnose and correct the Progress runtime cause before visual changes. Normal content renders only from a source-backed view model and never fabricates metrics, hides source/projection errors, or presents stale projections as final.
- Progress failure copy remains Progress could not be loaded, Your saved workouts and targets were not changed., and Retry loading progress. Recoverable retry returns to normal loading, empty, sparse, or populated state. Normal empty/sparse/updating states retain Phase 4 factual wording. Progress search uses M3SearchField.

## Motion

| Interaction | Standard motion | Reduced motion |
|---|---|---|
| Filter/favorite selection | Existing 140ms opacity/state acknowledgement after source-backed result | Immediate acknowledgement |
| Search clear/result change | Direct content replacement; no ornamental motion | Same |
| Calendar month swipe | Directional 200ms position + opacity | Immediate month change with opacity acknowledgement |
| Date selection | Direct selected-state update | Same |
| Date dialog | Existing platform translation/fade | Fade only |
| Reorder drag | Direct tracking with short neighbouring-row transition | Direct tracking with immediate displacement |
| Pull-to-refresh | Platform progress only during active request | Same |

State acknowledgement never waits for decoration. No required action is gesture-only. Optional haptics follow a resolved source operation or successful drop; haptics never prove uncommitted source state.

## Copywriting Contract

| Element | Copy |
|---|---|
| Primary CTA | Exact contextual commit labels: `Show results` applies filter drafts; `Apply Date` commits a valid private date draft; `Save Plan Changes` persists plan-editor drafts. Existing root workout actions remain unchanged. |
| Filter overflow trigger | Filters |
| Filter overflow heading | Exercise filters |
| Filter draft actions | Show results / Keep Current Filters |
| Standalone favorite chip | Favorite; accessible inactive state Not favorite |
| Search labels | Search plans / Search exercises / Search plan exercises |
| Search no results | No matching plans / Try a different plan name. ; No matching exercises / Try a different exercise name. |
| Picker no results | No plan exercises match / Try another exercise name or metric profile. |
| Refresh failure | Library refresh failed / Library could not be refreshed. Your current content, selection, search, and filters are unchanged. / Retry Library refresh |
| Calendar read failure | Calendar could not be loaded / Your workout history was not changed. Try loading Calendar again. / Retry Calendar |
| Empty selected day | No sessions on {long date} |
| Date dialog | Select date / optional Use Default Date / Keep Original Date / Apply Date |
| Reorder fallback | Move {label} up / Move {label} down |
| Reorder persistence | Save Plan Changes |
| Today secondary tools | History and data |
| Progress failure | Progress could not be loaded / Your saved workouts and targets were not changed. / Retry loading progress |
| Destructive confirmation | No new destructive action. Existing destructive confirmation and typed-phrase contracts remain unchanged. |

Voice is factual, calm, local-first, and evidence-led. Do not introduce wellness, readiness, medical, or judgemental copy.

## Accessibility and Adaptation

- Every modified chip, Search affordance, date cell, tab, drag handle, Move control, row action, and retry action has name, role, state, 48dp target, visible 2dp focus ring, Enter/Space activation, and D-pad reachability.
- Focus follows visible reading order: title, Search, filters, result/error/empty, list. Dialog/sheet starts at heading and restores to invoker. Clear search retains input focus; close filter/date surface returns focus to trigger.
- Favorite, selected filter/tab/date, busy Search/refresh, disabled date, and errors have text/icon/shape or state companion. No required fact is colour-only.
- Required actions never rely only on swipe, long press, drag, or pull. Month buttons, Move controls/actions, failure Retry, and keyboard/D-pad alternatives remain present.
- Preserve compact below 600dp, medium 600–839dp, expanded 840dp or above. Medium/expanded Calendar may use a second detail pane but keeps one logical reading order.
- Validate System/Light/Dark and Android 200% text on every affected root/dialog. Content wraps/reflows or navigation changes mode; it never clips, overlaps, shrinks below scale, or disappears.

## Required Verification Evidence

Every changed behaviour receives a regression test in the same task. Tests do not replace the replacement-candidate attended gate.

| Surface | Automated contract | Native/attended evidence |
|---|---|---|
| Filters/favorite/browse rows | Light/Dark selected visual + accessibility state, standalone Favorite, removal/clear, browse provenance absent, Detail provenance retained, favorite fill/state | Emulator Light/Dark and Samsung touch evidence of visibly responsive chips and filled selected star |
| Shared Search | Same primitive in four consumers; leading icon; integrated clear; IME/Enter; busy/empty/result/error; focus after clear | Emulator keyboard/D-pad and TalkBack in Library, Progress, picker |
| Library refresh | Pull preserves section/query/filter/results; permanent action absent; failure-only retry | Emulator pull gesture and Samsung ergonomics |
| Root Calendar | 42 cells including adjacent days; adjacent selection changes month; swipe/buttons equivalent; state labels remain | Emulator swipe + keyboard/D-pad; Samsung horizontal swipe/OLED Light-Dark |
| Date dialog | Private draft; Keep Original Date/Back unchanged; Apply Date commits valid LocalDate only; bounds disabled; complete grid; swipe/buttons; focus restore | Emulator IME/200% and Samsung touch review |
| Reorder | Continuous held-item displacement; buttons/accessibility equivalent; no persistence before Save; 200% reflow | Emulator gesture/reduced-motion and Samsung touch-hold ergonomics |
| Navigation/Today | 200% full labels/targets/focus; two-row switch as needed; only distinct settings and History/data routes | Emulator 200%, keyboard/D-pad, TalkBack; Samsung safe-area/OLED |
| Progress | Reproduce prior failure; normal empty/populated after root-cause repair; transient Retry recovers without source/projection drift | Exact replacement APK on emulator and Samsung |

Phase output is replacement Android candidate bytes only. Candidate build/sign/install, owner approval, promotion, public release, and Terminal Seal remain outside this contract and use the existing explicit release gate.

## UI Considerations

Applicable state considerations resolved: 7 explicit, 4 backstop, 0 unresolved. Empty/error copy lives above; these rows record state coverage and evidence expectations.

| Category | Element(s) | Status | Resolution / reason |
|---|---|---|---|
| empty | Library/Progress search results; selected Calendar date | ✅ covered | Query/date-specific exact copy renders; no blank list or fabricated zero analytics. |
| loading | Library refresh/load, Search, Calendar, Progress | ✅ covered | Skeletons preserve initial geometry; busy state preserves existing results/query where content exists. |
| error | Library, Calendar, Progress | ✅ covered | Safe source-preservation copy plus exact labelled Retry only when recoverable. |
| populated | Library, Calendar, Progress | ✅ covered | Concise factual hierarchy, state labels, detail navigation, source-backed figures; no provenance clutter/fake analytics. |
| partial | Calendar states and bounded date dialog | ✅ covered | Partial is explicit; disabled bounds remain visible/uncommittable while valid adjacent dates are selectable. |
| overflow | Chips, browse rows, calendar/dialog, 200% navigation | ✅ covered | Chips wrap; names wrap; no required calendar horizontal scroll; navigation becomes two rows. |
| zero-one-many | Result/session lists | ✅ covered | Zero has exact next-step copy; one/many preserve factual row hierarchy/count wording from view model. |
| long-text | Labels, date hierarchy, navigation | 🧪 backstop | Component + 200% native evidence verifies reflow, targets, and no clipped required control. |
| loading | Continuous reorder | 🧪 backstop | Gesture evidence proves held item is visibly moving and neighbours displace before drop; no release-only move. |
| overflow | Date dialog at 200%/short height | 🧪 backstop | Native evidence verifies complete reachable grid/actions, keyboard/D-pad order, focus restore. |
| populated | Favorite/filter state | 🧪 backstop | Light/Dark emulator + Samsung evidence proves filled/outlined star and non-colour selected cues distinguish states. |

## Registry Safety

| Registry / source | Blocks used | Safety gate |
|---|---|---|
| Repository-owned React Native components | Existing theme, components, AdaptiveScreen, installed gesture libraries | Existing source/test review; shared primitives only |
| Lucide React Native | Existing Search, Check, Star, calendar/navigation, Move, status icons | Existing dependency; every icon-only control has programmatic label |
| shadcn / third-party registries | None | Not applicable — no components.json, no web/shadcn stack, no registry block declared or introduced; confirmed 2026-08-31 |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-08-31T06:44:39Z
