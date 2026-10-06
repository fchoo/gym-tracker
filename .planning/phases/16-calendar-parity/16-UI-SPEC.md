---
phase: 16
slug: calendar-parity
status: approved
reviewed_at: 2026-10-06T16:45:49+08:00
shadcn_initialized: false
preset: none
created: 2026-10-06
prototype_revision: 18
prototype_html_sha256: b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96
owner_checkpoints_open:
  - DEV-01
  - DEV-02
---

# Phase 16 — Calendar Parity UI Design Contract

> Canonical visual and interaction contract for the full-height Calendar, focused-week morph, compact agenda, and Calendar-origin read-only detail routes. Generated for planning and execution; final approval remains with the UI checker and the two explicit owner checkpoints below.

---

## Contract Authority

Apply sources in this order. A lower source may explain implementation context but may not override a higher source.

1. `.planning/v1.2-OWNER-BRIEF.md`.
2. `.planning/design/v1.2-SOURCE-PRECEDENCE.md`.
3. External `approved.json`, Revision 18 latest-first.
4. Rendered and source behavior in external `approved-hybrid.html`, SHA-256 `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`.
5. `.planning/phases/16-calendar-parity/16-CONTEXT.md`, CAL-01 through CAL-23, the prototype inventory/parity matrix, browser evidence, and native verification matrix.
6. Existing implementation patterns, only where they do not conflict with items 1–5.

The current `CalendarScreen` is an implementation seam, not the visual oracle. Its Sunday-first grid, fixed 72dp swipe distance, glyph-only events, existing Source Sans 3 theme, and direct mutable session-detail route are superseded for this phase. Phase 14 is expected to supply the shared Revision 18 shell, Archivo assets/tokens, root header, bottom navigation, modal sheet, focus treatment, and appearance state before Phase 16 consumes them.

No unexplained difference from the oracle is permitted. Necessary native, accessibility, domain, transaction, or performance differences require a specific deviation-register entry and owner decision.

## Phase Boundary

### Included

- Monday-first month Calendar that consumes every available pixel between the shared root header and fixed four-root bottom navigation.
- Calendar header actions, persistent month navigation, Calendar key dialog, date/event grid, focused-week morph, adjacent-week sequence, and reduced-motion equivalent.
- Compact agenda rows and routing by durable event identity.
- Calendar-origin completed/partial Strength history detail, planned Strength occurrence preview, planned Running plan routing, and imported Running Garmin routing.
- Source-backed loading, empty, partial, stale/error, retry, missing occurrence, overflow, interrupted gesture, and detail-return states.
- Light, Dark, System, 360/390/600/840dp-equivalent portrait, corresponding landscape, 100%/200% text, touch, keyboard, D-pad, visible focus, and Back/Escape behavior.

### Excluded

- Correct workout, revision history editing, Resume workout, Remove from history, or any other source mutation from a Calendar-origin detail.
- Automatic activity matching, automatic completion, invented sessions/results, or implicit plan activation.
- A fifth root, inline Calendar legend, per-day status icons, nested agenda actions, direct adjacent-week teleport, crossfade-only week replacement, or velocity-based month settling.
- Product implementation, builds, release work, or acceptance of DEV-01/DEV-02 in this specification.

## Design System

| Property | Contract | Source / implementation note |
|---|---|---|
| Tool | Repository-owned Expo / React Native design system | No shadcn; shadcn gate is not applicable to this native stack. |
| Component library | Repository components plus React Native primitives | Extend shared components; do not add a parallel Calendar-only component kit. |
| Gesture / motion | `react-native-gesture-handler` 2.32, Reanimated 4.5, Worklets 0.10 | Already pinned; pointer tracking and row geometry stay on the UI thread where possible. |
| Icons | Lucide React Native, outlined, 24dp, 2dp stroke | Info, Settings, Previous, Next, Collapse, Chevron, Check, and Dash; decorative icons are accessibility-hidden. |
| Interface font | Archivo variable | Phase 14 dependency; bundle locally. No network font fetch and no Source Sans fallback in parity captures. |
| Numeric font | IBM Plex Mono | Dates, weekday labels, set numbers, previous/target/result values; tabular numerals. |
| Weights | Regular 400 and emphasis 800 only | The native two-weight contract replaces ad hoc 700/750/850 declarations. Verify Archivo variable metrics against the Revision 18 oracle; any material mismatch enters the deviation register. |
| Shared primitives | Root header, `IconAction`, focusable pressable, modal bottom sheet, inline notice, skeleton, four-root navigation | Reuse Phase 14 behavior for 48dp targets, 2dp focus, scrim, modal focus, Back, safe areas, and appearance. |

## Owner Decision Checkpoints — Open and Non-Defaulting

Neither checkpoint is accepted by this UI-SPEC. The planner must put the checkpoint before affected implementation, present the two options with an identical fixture/theme/viewport comparison, record the owner's selection and date in `.planning/design/v1.2-DEVIATIONS.md`, and only then implement that branch. Unaffected work may continue.

| ID | Current / oracle behavior | Closest accessibility adaptation | Required owner checkpoint |
|---|---|---|---|
| DEV-01 | **Current implementation baseline unless/until owner accepts a change:** the approved Revision 18 oracle uses 18dp horizontal inset and 2dp date-cell gaps (`.app-destination`, H:1092-1096; `.cal-month-panel`, H:1117). At a 360dp content width this produces 44.5625dp-wide date cells, below the non-overlapping 48dp target requirement. The 18dp inset and 2dp gap are nevertheless owner-approved presentation values, not deviations. | **Proposed only:** Calendar-only horizontal inset `min(18, max(0, (safeWidth - 348) / 2))` dp: 6dp at 360 and 18dp at 390. Keep the owner-approved 2dp gaps, 28/36 tracks, event content, row morph geometry, and non-overlapping hit bounds. | Owner chooses **Keep current/oracle 18dp** or **Accept closest 6→18dp adaptation**. Until acceptance is recorded, implement/spec/compare against 18dp; do not select 6dp as the baseline and do not silently enlarge hit areas across neighboring dates. The known 360dp target failure remains visible and pending. |
| DEV-02 | Light Strength event-title text and border are `#D97820`: measured contrast is 3.03:1 on `#FFFAF0` and 2.56:1 on selected `#DCE9F9`. Dark remains readable. | Light theme only: use `#9B470B` for Strength title text, retaining `#D97820` for border/rail/sport swatch and all status patterns. Measured contrast is 6.12:1 on paper and 5.17:1 on selected fill. Dark remains unchanged. | Owner chooses **Oracle orange title** or **Closest dark-orange title adaptation**. Test complete/partial tint blends before acceptance. |

Until each decision is recorded, comparison fixtures must support the current/oracle branch and the proposed adaptation branch, and the affected accessibility acceptance row remains pending. For DEV-01, current/oracle 18dp remains the implementation baseline; for DEV-02, current/oracle `#D97820` remains the implementation baseline. The spec must never describe either proposed adaptation as approved.

## Spacing Scale

The template permits declared component-specific exceptions. The reusable layout scale remains multiples of four only; Revision 18's exact Calendar paddings and gaps are separately declared below. Because the owner approved Revision 18 as the presentation oracle, the oracle-derived 2/3/10/14/18dp values are owner-approved component-specific exceptions. They are not proposed deviations and must not be rounded onto the reusable scale. `H:{line}` below means the immutable external `approved-hybrid.html` identified by the frontmatter SHA-256.

| Token | Value | Calendar usage |
|---|---:|---|
| `space.1` | 4dp | Tight icon/text gap; effective date-number top inset |
| `space.2` | 8dp | Related metadata, compact controls, card gaps |
| `space.4` | 16dp | Standard compact content inset and sheet text inset |
| `space.6` | 24dp | Section separation and medium layout inset |
| `space.8` | 32dp | Expanded layout separation |
| `space.12` | 48dp | Minimum interactive target and large empty-state separation |
| `space.16` | 64dp | Maximum intentional page-level separation |

### Owner-approved component-specific spacing exceptions

| Exact value | Prototype selector / source | Contracted use | Why it remains exact |
|---:|---|---|---|
| 2dp | `.cal-month-panel` H:1117; `.cal-focused-week, .cal-next-week` H:1179 | Horizontal and vertical gap between date cells in month, selected-week and adjacent-week rows | Keeps all three modes on the same seven-column geometry so measured rows can morph without a spacing jump. |
| 2dp | `.cal-day` H:1118 | Horizontal inner padding of every date cell | Preserves compact event-title width and date/event alignment across month and focused rows. |
| 2dp | `.cal-events` H:1127 | Gap between stacked event chips and top offset inside the 36dp event track | Fits two 17dp event chips into the locked event track and keeps zero/one/two-event dates aligned. |
| 2dp | `.topbar-actions` H:276 | Gap between Calendar Info and App Settings | Makes Info immediately precede Settings without creating a visually detached action group. |
| 3dp | `.cal-month-nav` H:1106 | Gap between Previous, month title, Today and Next grid columns | Preserves the approved 48/minmax/76/48 control composition at compact width. |
| 3dp | `.cal-day` H:1118 | Vertical inner padding of every date cell | Border plus padding yields the locked effective 4dp top inset without moving selected/today dates. |
| 3dp | `.cal-agenda-detail` H:1201; `.cal-agenda-meta` H:1202 | Vertical separation from agenda title to result/target and row gap within metadata | Maintains compact 82dp agenda density while keeping title, result/target and source visually distinct. |
| 10dp | `.app-destination` H:1092-1096 | Top padding between shared root header and Calendar month navigation | Preserves the oracle's root-to-Calendar rhythm while the month viewport still fills the remaining height. |
| 10dp | `.cal-agenda-head` H:1195; `.cal-agenda-row` H:1198; `.cal-detail-summary` H:1213 | Agenda heading gap; agenda content-column gap and vertical padding; read-only summary gap | Keeps agenda rows compact, separates the sport rail from text, and preserves date/total summary balance. |
| 14dp | `.cal-detail-scroll` H:1211; `.cal-readonly-exercise-header` H:1216 | Read-only detail horizontal inset and exercise-header leading inset | Aligns read-only exercise/set facts with the Active-shaped detail hierarchy without introducing a card-within-card offset. |
| 14dp | Shared `.sheet` H:797-810 | Calendar key sheet horizontal content padding | Aligns heading, explanatory copy and Activity/Status groups with the approved modal sheet composition. |
| 18dp | `.app-destination` H:1092-1096; shared `.topbar` H:268-274 | Calendar left/right content inset and root-header left/right inset | This is the exact owner-approved Revision 18 composition and remains the Phase 16 baseline at every width unless DEV-01 is explicitly accepted. |

These values are local Calendar/component measurements, not additions to `space.*`. In particular, **18dp is the baseline**. DEV-01's adaptive 6dp value exists only as a pending comparison proposal; it must not appear in production styles, implementation acceptance criteria, or default test fixtures before owner acceptance.

### Border, stroke and fixed structural geometry — not spacing

| Geometry | Prototype selector / source | Contract |
|---:|---|---|
| 1dp | `.cal-day` H:1118 | Transparent base cell border reserves selected-state geometry without layout shift. |
| 2dp | `.cal-number` and `.cal-day.today .cal-number` H:1122–1123 | Today ring; it does not change the 28dp date-track position. |
| 1dp / 2dp | `.cal-event-chip` H:1128; `.completed`, `.partial`, `.planned` H:1131–1133 | Complete uses 1dp solid; Partial uses 2dp dotted; Planned uses 2dp dashed. These strokes encode status and are not spacing tokens. |
| 1dp | `.cal-focused-week, .cal-next-week` H:1179; `.cal-agenda-row` H:1198; `.cal-detail-footer` H:1222 | Hairline row/section separators. |
| 2dp | `.cal-agenda-head` H:1195 | Primary-text divider below the focused agenda heading. |
| 5dp | `.cal-agenda-row` and `.cal-agenda-edge` H:1198-1200 | Fixed sport-identity rail width; this is structural/color encoding, not a layout-spacing token. |
| 2dp | Shared native focus contract in `DESIGN.md` | Visible hardware keyboard/D-pad focus outline, independent of selected/today borders. |

All non-date interactive controls are at least 48×48dp. Day targets are governed only by DEV-01; no overlapping expanded hit slop is allowed. Under the required current/oracle 18dp baseline, the known 360dp day width remains 44.5625dp and therefore keeps the DEV-01 accessibility row open. That known issue does not authorize the 6dp adaptation.

## Typography

Exactly four sizes and two weights are permitted in Phase 16:

| Role | Family | Size | Weight | Line height | Usage |
|---|---|---:|---:|---:|---|
| Event chip | Archivo | 11sp | 800 | 14sp | One-line month/focused event titles; visual ellipsis only |
| Metadata | Archivo | 14sp | 400 | 20sp | Agenda sport/status/source and secondary evidence |
| Body / controls | Archivo or IBM Plex Mono for numeric content | 16sp | 400 or 800 | 22sp | Weekdays, dates, body, controls, set values, legend items |
| Heading | Archivo | 22sp | 800 | 26sp | Month title, agenda date, sheet/detail titles, exercise names |

Body line-height is 1.375 (`16/22`); heading line-height is 1.18 (`22/26`). Event labels use `-0.04em` tracking; headings use `-0.025em`. The native 22sp title token covers the prototype's 21–22px Calendar headings as the single allowed heading size; overlay comparison must confirm equivalent hierarchy. Text scaling remains enabled through 200%; no fixed-height text container may clip scaled text.

## Color Contract

The Calendar uses the Phase 14 Revision 18 semantic palette, not the existing pre-v1.2 grey palette.

| Role | Light | Dark | Usage |
|---|---|---|---|
| Dominant surface (60%) | `paper #FFFAF0` | `paper #080808` | Root, month, focused week, agenda and full-height details |
| Secondary surface (30%) | `surface #F0EADF`; `raised #FFFAF0`; `line #CEC6B8` | `surface #151515`; `raised #202020`; `line #333330` | Read-only exercise groups, pressed rows, modal sheet, borders |
| Primary text | `#0D0C0A` | `#F7F7F2` | Headings, date numbers, primary copy |
| Muted text | `#655F56` | `#AAA9A2` | Weekdays, outside dates, metadata, secondary copy |
| Running / action accent (part of ≤10%) | `#195FAE`, background `#DCE9F9` | `#71AAFF`, background `#14243B` | Running event borders/text/rails; Today; selected date; month actions; focus remains separately visible |
| Strength accent (part of ≤10%) | `#D97820` border/rail/swatch; title governed by DEV-02 | `#D97820` | Strength identity only; never completion status |
| Completion semantic | `#166B4C`, background `#DCECDF` | `#72DF92`, background `#14271A` | Read-only committed set checks/progress, not sport identity |
| Caution semantic | `#8D5D00`, background `#FFF0C2` | `#F0C84B`, background `#2A2410` | Partial/detail caution only when paired with text/shape |
| Destructive | `#B42318` | `#FF8279` | Separate history-management confirmation only; no destructive Calendar action |
| Focus ring | 2dp high-contrast blue, shared Phase 14 token | 2dp high-contrast blue, shared Phase 14 token | Hardware keyboard/D-pad focus; not replaced by selected state |

Accent is reserved for Running identity, Strength identity, selected/today/focus treatment, the selected Calendar bottom-nav underline, and actionable Today/navigation text. Status is never encoded by a second sport-like hue.

### Event and date encodings

| Meaning | Visual encoding | Required textual / semantic encoding |
|---|---|---|
| Strength | Orange title/border in cells; 5dp orange agenda rail | Say `Strength` in agenda metadata and day accessible label |
| Running | Blue title/border in cells; 5dp blue agenda rail | Say `Running` in agenda metadata and day accessible label |
| Complete | 1dp solid border plus 14% current-sport tint | Say `Complete` |
| Partial | 2dp dotted border plus left 50% at 18% current-sport tint | Say `Partial` |
| Planned | 2dp dashed border, transparent fill | Say `Planned` |
| Selected date | Blue outline, blue-tinted fill, selected semantics | `selected: true`; append `selected` to spoken summary |
| Today | 2dp ring around the 28dp date number | Append `today`; may coexist with selected/event states |
| Outside month | Muted text at 50% opacity | Append `outside month`; remains selectable |
| Rest | Muted en dash in the event track | Say `Rest day` / `No workout`; never imply missing data |
| Empty date | Blank event track | Say `No workout`; visually distinct from rest by absence of dash |

Calendar key status swatches are neutral primary-text color: solid/tinted Complete, dotted/half-filled Partial, dashed/transparent Planned. This keeps activity color and status pattern independent.

## Full-Height Calendar Geometry

### Root and month mode

1. Keep the shared 57dp root header above the Calendar. Header order is route heading, flexible spacer, 48dp Info, then 48dp App Settings with the owner-approved 2dp component gap listed above. Info is visible only on Calendar and is immediately left of Settings.
2. Keep the shared four-root bottom navigation fixed and safe-area aware. Calendar content ends immediately above it; never introduce a rail at expanded width without an accepted deviation.
3. Calendar content uses the current/oracle 10dp top and 18dp left/right component padding (`.app-destination`, H:1092-1096), then forms a column filling all remaining height: 52dp month navigation, 34dp Monday-first weekday header, then a clipped month viewport with `flex: 1`. The 18dp inset remains exact at 360dp and every other width unless DEV-01 is accepted.
4. Month navigation columns are `48dp / minmax(0,1fr) / 76dp / 48dp` with the owner-approved 3dp component gap listed above. Order and visible labels are Previous icon, `{Month YYYY}`, `Today`, Next icon. All four remain visible in month and focused modes.
5. Render only the number of complete Monday-first weeks required by the month: four, five, or six. Every row takes an equal share of the remaining viewport with a normal-motion minimum of 70dp when height allows. Adjacent dates complete the first/last week.
6. The track contains previous/current/next panels, each one viewport wide. Only the current panel is interactive/accessible; preview panels are clipped, inert and hidden from accessibility.
7. At font scale 1.0, a day uses two exact top-anchored tracks: 28dp date and 36dp events. It uses the owner-approved 3dp vertical/2dp horizontal component padding, 9dp radius, reserved transparent 1dp base border, and overflow clipping. One/two/no events never move the date number. At font scale 2.0 these values become minimums and the tracks/row grow to the scaled content while retaining the same top alignment.
8. At font scale 1.0, the event track contains at most two 17dp one-line chips separated by the owner-approved 2dp component gap. If more than two events exist, preserve the first two titles and place a compact `+N` count in the second line's trailing space without adding a third row; if width cannot hold both title and count, the second visual title ellipsizes first. The day accessible label still enumerates every event. At font scale 2.0 chips grow vertically with their scaled text and the month content region scrolls when required.

### Focused mode

1. The month navigation and single Monday-first weekday header remain unchanged.
2. The selected week uses the exact measured month-row height and moves from its measured month Y to the top position. The immediately following week uses the same row height and moves from its measured month Y to the bottom, flush above bottom navigation.
3. Selected and adjacent rows reuse the exact date cell/event chip component and 28/36 tracks. Both show up to two titled events, including representative `Full B`, `Easy`, `6×400`, `Tread`, `Tempo`, and `Long` labels.
4. Between those rows, the agenda owns remaining height. Its heading is at least 62dp with a 2dp primary-text bottom rule; the event list scrolls vertically when it exceeds available height. The adjacent row stays bottom-flush and never scrolls out as part of agenda content.
5. The heading contains full localized date, plural-safe event count, and a 48dp Collapse control. No redundant `Next week` label appears.

### Landscape, wide layouts and 200% text

- Preserve bottom navigation and the same reading order at every required width; do not substitute a side rail or two-pane Calendar.
- At 600dp and 840dp-equivalent widths the calendar remains a centered full-height single composition. Extra width increases day width; it does not move agenda/detail into a side panel.
- In landscape, keep header, persistent month controls, weekday header, and bottom navigation visible. If 48dp date targets plus chrome exceed vertical space, the month/focused content region scrolls vertically while horizontal month drag remains available; no row may shrink below 48dp and no horizontal overflow is allowed.
- At 200% text, header/month navigation controls grow vertically and labels wrap where needed. Month title may use one-line ellipsis only after preserving Previous/Today/Next 48dp targets. Event chips remain one line with visual ellipsis because the full event name/status is in the day label. Agenda rows, dialog copy, error notices, and detail rows grow vertically and wrap without truncating required actions.
- Rotation preserves visible month, selected date, focused/month mode, agenda scroll anchor, active detail, invoking focus identity, and any in-progress pointer cancellation result. Re-measure all row/viewport coordinates after layout.

## Calendar Key Dialog

| Property | Contract |
|---|---|
| Trigger | 48×48dp Info icon; accessible name `Open Calendar key`; immediately left of App Settings |
| Presentation | Shared modal bottom sheet with scrim, top grabber, rounded top corners, safe-area padding and maximum 82% height |
| Heading | `Calendar key` with 48dp Close action named `Close Calendar key` |
| Intro | `Color identifies the activity. Fill and border style identify its status.` |
| Activity group | Uppercase `ACTIVITY`; orange Strength swatch and blue Running swatch |
| Status group | Uppercase `STATUS`; neutral Complete, Partial and Planned swatches in one wrapping row/grid |
| Accessibility | On open, move focus to modal heading; modal accessibility is trapped; Back/Escape, Close or scrim dismiss; restore focus to Info |
| Constraint | No inline legend in month/focused content; no status meaning depends on swatch color |

## Gesture and Motion State Machine

### Horizontal month drag

| State / event | Contract |
|---|---|
| Pointer down | Capture start X/Y and the measured content viewport width. Do not change selection or title. |
| Intent undecided | Use the oracle's 7dp slop. If vertical displacement becomes dominant, permanently yield this gesture to vertical scrolling. Claim horizontal only when `abs(dx) >= abs(dy) × 1.15`. |
| Horizontal drag | Previous/current/next track translation equals pointer `dx` one-to-one, clamped to `[-viewportWidth, +viewportWidth]`. Apply no easing, spring, resistance or scale while the pointer is down. |
| Preview boundary | Compute `abs(dx) >= viewportWidth × 0.25` with an inclusive `>=` comparison. At the boundary, immediately announce/show the adjacent month title; moving below it immediately restores the current title. Do not mutate selected date or source data during preview. |
| Release below 25% | Snap to current panel; current title is restored. This applies even to a very fast short drag. |
| Release at/above 25% | Settle exactly one month in drag direction. Never skip multiple months. Preserve selected day when valid and clamp to the last civil day of a shorter month. |
| Velocity | Must not participate in settle. The prototype's stale `0.45 px/ms` fallback is conflict C-04 and is explicitly forbidden. |
| Cancel / interrupt | Pointer cancel, Back takeover, rotation, backgrounding, or loss of gesture ownership returns to the last stable panel/title with no navigation. |
| Concurrency | Ignore/reject a second drag while settling; latest valid navigation completion wins; stale callbacks cannot overwrite the selected month/date or fire duplicate change events. |

Non-gesture Previous, Next and Today controls expose the identical destination/state semantics. Today resolves the actual current local civil date, switches month if required, then selects that date. These controls remain usable in focused mode through the ordered adjacent-week transition.

### Motion timings

| Transition | Normal motion | Reduced motion |
|---|---|---|
| Month settle and snap-back | 240ms, `cubic-bezier(.22,.8,.3,1)`; completion listener plus idempotent fallback | Immediate panel/title/state update; no translation |
| Week expand | Selected and following rows: 260ms, `cubic-bezier(.22,.8,.3,1)` from measured month coordinates; agenda heading/list fade 170ms ease after 70ms | Same semantic state order in the next render frame; no row travel/fade wait |
| Week collapse | Both rows: 240ms, `cubic-bezier(.4,0,.78,.2)` to measured month coordinates; agenda fades 140ms ease; complete after geometry is stable | Immediate return to month geometry and focus |
| Adjacent-week switch | Collapse → select/focus in month → 70ms spatial pause → expand the new week | Collapse semantics → selection/focus → immediate expansion; no timer-dependent intermediate state |
| Exercise disclosure | 160ms chevron rotation only; content appears/disappears without layout spring | Immediate chevron/content state |

Never use spring, bounce, overshoot, scale, crossfade-only week replacement, or motion that delays factual state. Toggling reduced motion while mounted resolves to the same deterministic destination and clears obsolete timers/animations.

## Component and Interaction Inventory

| Surface | Required composition and behavior |
|---|---|
| Calendar root header | `Calendar`; Info; App Settings. Route heading receives root-entry focus when entered by keyboard/D-pad. |
| Month controls | 48dp Previous, month/year heading with polite preview updates, 76dp Today, 48dp Next. Keyboard and pointer invoke the same transition controller. |
| Day cell | Full-cell button/gridcell; date, rest marker or up to two decorative chips; selected semantic state. Single tap/Enter/Space expands that date. |
| Focused week | Same day cells, selected week at top and following week at bottom. Selecting a day in selected week refreshes the middle agenda without collapsing. |
| Adjacent week | Same cell visuals; selecting a date runs collapse → select/focus → expand, including dates in an adjacent month. |
| Agenda heading | Full date, plural-safe event count or `No workout`, and Collapse. |
| Agenda row | One full-width target, minimum 82dp; columns `5dp rail / content / 24dp chevron`, 10dp gaps/padding. Content order: title; one-line result/target; `Sport · status`; source. No nested controls. |
| Calendar key | Shared modal sheet described above. |
| Completed/partial Strength detail | Full-height Active-shaped read-only route: Back, title, `{Complete|Partial} · read only`, progress strip, date, `N of N sets`, exercise disclosures and every set row. |
| Planned Strength preview | Same shape, title, `Planned preview · read only`, `0 of N sets`, Previous/Target/State columns and Planned dashes. It is keyed by occurrence identity and must not fabricate a session ID. |
| Historical exercise disclosure | Minimum 72dp header, exercise name, target, `N/N complete`, 48dp chevron; expanded by default; toggle only changes disclosure state. |
| Read-only set row | Columns `Set / Previous / Result|Target / State`; IBM Plex Mono values; Complete check, Planned dash, or `Not completed` semantic label. No editable field or press action. |
| Error/retry notice | Full-width semantic notice in the retained Calendar context; Retry is a 48dp minimum action. |

## Requirement Traceability

| Requirements | Contract section(s) |
|---|---|
| CAL-01, CAL-04, CAL-05, CAL-06 | Full-Height Calendar Geometry; Color Contract; State Contract |
| CAL-02, CAL-03 | Calendar Key Dialog; Event and date encodings |
| CAL-07, CAL-08, CAL-09 | Gesture and Motion State Machine — Horizontal month drag / Motion timings |
| CAL-10, CAL-11 | Full-Height Calendar Geometry; Accessibility, Keyboard and Focus |
| CAL-12, CAL-13, CAL-14, CAL-15 | Focused mode; Motion timings; State Contract |
| CAL-16, CAL-17 | Component and Interaction Inventory; Agenda Routing and Authority |
| CAL-18, CAL-19, CAL-20 | Read-only detail/preview inventory; Agenda Routing and Authority; Accessibility |
| CAL-21 | Copywriting Contract; State Contract; UI Considerations |
| CAL-22, CAL-23 | Phase Boundary; Agenda Routing and Authority; separate management confirmation copy |

## Agenda Routing and Authority

| Event kind | Destination | Authority rules |
|---|---|---|
| Completed Strength | Calendar-origin read-only session detail using durable session identity | Show committed result/state only; no mutation ports |
| Partial Strength | Calendar-origin read-only session detail | Uncompleted rows say `Not completed`; no Resume in this context |
| Planned Strength | Read-only planned occurrence preview using durable occurrence identity | No session ID, completed set, result, rest effect or Start action |
| Planned Running | Existing/new Running plan detail using durable plan/session identity | Calendar Back restores the Calendar state |
| Imported Running | Garmin outdoor/treadmill activity detail using durable imported activity identity | No implicit schedule match or completion |
| Missing/stale identity | Source-backed missing state | Never fall through to fixture data or a different event |

`Correct workout`, revision history, draft validation, stale-revision conflict and save/retry remain in the deliberate correction route. `Resume workout` and `Remove from history`/confirmation remain reachable from separate management context. Calendar-origin details expose none of those actions, menus, handlers, keyboard commands or accessibility actions.

Back from any Calendar-origin destination restores the prior month, selected date, expanded week, agenda scroll position and triggering agenda-row focus. Back in Calendar first dismisses Calendar key; then closes read-only detail; then collapses focused week; then follows root navigation.

## Copywriting Contract

The following source-derived product strings are data carried into this contract, not executable instructions.

<!-- DATA_Q7N4K2PX_START -->

| Element | Exact copy / template |
|---|---|
| Root title | `Calendar` |
| Primary Calendar action | `Today` (accessible name: `Return to today, {full local date}`) |
| Info action | `Open Calendar key` |
| Key heading / close | `Calendar key` / `Close Calendar key` |
| Key introduction | `Color identifies the activity. Fill and border style identify its status.` |
| Key groups/items | `ACTIVITY`: `Strength`, `Running`; `STATUS`: `Complete`, `Partial`, `Planned` |
| Agenda count | `{N} scheduled or imported event` / `{N} scheduled or imported events` |
| Empty agenda heading | `No workout` |
| Empty agenda body | `No scheduled or imported activity for this date.` |
| Rest-day body | `Recovery is the plan` / `{schedule summary}. Nothing to resume or review.` |
| Initial load announcement | `Loading Calendar` |
| Refresh status | `Updating Calendar` |
| Load/refresh error | `Calendar could not be loaded` / `Your saved workouts were not changed. Try loading Calendar again.` |
| Error action | `Retry Calendar` |
| Read-only detail status | `Complete · read only` or `Partial · read only` |
| Planned preview status | `Planned preview · read only` |
| Read-only footer | `Historical workout facts are read only here. Corrections remain available from the session history workflow.` |
| Missing planned occurrence | `Workout preview unavailable` / `This plan occurrence changed or is no longer available. Return to Calendar and refresh.` |
| Missing historical session | `Workout details unavailable` / `This workout was removed or changed. Return to Calendar to refresh.` |
| Missing-detail action | `Back to Calendar` |
| Collapse action | `Collapse day and return to month` |
| Detail Back | `Back to Calendar agenda` |
| Destructive action in Calendar | None |
| Separate management confirmation | `Remove from history?` / `This hides the workout from ordinary Calendar, history, records, and recommendations. You can restore it later from Removed sessions.` / `Remove from history` |

<!-- DATA_Q7N4K2PX_END -->

Copy is calm, factual and source-led. Do not use success language before data is loaded, imply that a planned workout occurred, or describe a partial workout as resumable from Calendar.

## State Contract

| State | Visual contract | Interaction / data contract |
|---|---|---|
| Initial loading | Keep route header, Info/Settings and month-control geometry; use non-interactive stable skeletons for month and agenda. No event-shaped fake content. | Announce `Loading Calendar`; selection/month intent is retained; skeletons are hidden from accessibility and static under reduced motion. |
| Refresh/loading new month | Keep the last-good grid and selection visible with a compact `Updating Calendar` status; disable duplicate settle/navigation only while the request is authoritative. | Never clear to an invented empty month; cancellation/stale response cannot overwrite the newest request. |
| Populated month | Render four/five/six equal rows, every sport/status combination, selected/today/outside semantics, and all source events. | Calendar is a projection only; rendering/navigation performs no source mutation. |
| Entire month has zero events | Keep the complete month grid, Today and navigation. Dates remain selectable. | Selected date opens the exact empty agenda; do not add a fake global CTA or metric. |
| Empty selected date | Focused week remains visible; agenda shows exact `No workout` copy. | Collapse, adjacent dates and month controls remain available. |
| Rest date | Show a muted dash in event track and factual recovery copy. | Do not treat as query-empty and do not offer Retry/Start. |
| One event | One chip in the fixed 36dp track; one agenda row; singular count. | Entire agenda row activates one destination. |
| Two events | Two stacked 17dp chips; two agenda rows in source order; plural count. | Full labels/statuses are present in the day accessible name. |
| More than two events | Preserve two-chip capacity plus `+N`; agenda lists all events and scrolls. | Do not silently drop, merge or reorder identities. |
| Partial event/detail | Dotted half-filled chip; agenda says Partial; incomplete set rows say `Not completed`. | Calendar detail has no Resume/Correct/Remove action. |
| Planned Strength | Dashed transparent chip; preview shows targets and Planned dashes, `0 of N sets`. | No session/result fabrication and no Start action. |
| Long title/source | Cell chip is one line with ellipsis; agenda/detail wraps; exercise name wraps before truncation. | Full untruncated value is in the accessible label. |
| Stale projection/query error | Retain last-good month, selected date and focused state; place semantic error/retry notice without replacing navigation. | Retry uses the same query identity; saved source facts remain untouched. |
| Missing/removed detail | Full-height missing state with Back; no empty exercise card. | Return restores Calendar and refreshes projection; never route to a different record. |
| Gesture below threshold/cancel | Track/title return to current month through standard snap or immediate reduced-motion state. | No selection, navigation callback or source change. |
| Interrupted settle/morph | Return to or complete one deterministic stable state; no half-positioned rows. | Latest valid transition wins; re-measure after layout/background return. |
| Dialog open | Scrim, Calendar key sheet, modal heading focus. | Grid is inaccessible/inert; dismiss restores Info focus. |
| Detail disclosure collapsed | Exercise header and summary remain; set body removed; chevron indicates collapsed state. | `expanded: false`; no data is discarded. |

## Accessibility, Keyboard and Focus

- Every required target is at least 48×48dp and non-overlapping, subject to the unresolved DEV-01 choice for date columns. Pressed, selected and 2dp visible focus states are distinct.
- Each date is one focusable button/gridcell with selected state and an accessible label in this order: full local civil date; today; outside month; rest/empty or event count; every full event name, sport, status and source; selected. Visual chips are accessibility-hidden to avoid duplicate announcements.
- Monday-first weekday labels are visible but not separate focus stops. The Calendar grid itself has a `Calendar month grid` label and the month heading names the current panel.
- ArrowLeft/ArrowRight move one civil day; ArrowUp/ArrowDown move seven days. Crossing a panel boundary updates month and preserves focus on the destination date. Enter, Space and D-pad center perform the same action as a single tap. Previous, Today and Next provide a complete non-gesture path.
- Direct date expansion moves focus to `Collapse day and return to month`, matching the oracle. Adjacent-week re-expansion focuses the newly selected date. Collapse restores the selected month-cell focus. Agenda routing stores and restores the triggering row.
- Calendar key moves focus to its heading, traps modal navigation, closes on Back/Escape/Close/scrim, and returns focus to Info. The underlying Calendar is inert while open.
- Read-only detail starts focus at Back. Exercise disclosures expose exact name, expanded state and controlled region. Set rows are grouped read-only facts, not controls.
- Status is always text plus border/fill/shape. Sport is text plus color/rail. Selected and focus indicators remain visible independently of color perception.
- At 200% text, required actions stay visible/reachable; modal and detail content scroll vertically; no horizontal text scroll is introduced; units and numbers remain adjacent and readable.
- Touch exploration/screen-reader semantics must remain correct, but this phase does not expand the project boundary to mandatory switch-scanning acceptance beyond the owner brief.

## Performance and Evidence Contract

- Calendar month plus selected-date content: p95 ≤250ms over at least 100 representative source-backed samples.
- Proposed Phase 16 adoption of NV-PERF-09: at 60Hz, UI frame-work p95 ≤16.67ms over at least 100 complete drag/expand/collapse sequences, with raw missed-frame counts, refresh rate and profiler overhead retained. This is a proposed verification gate from the native matrix, not evidence already passed.
- Verify 1:1 drag at 10%, 24.9%, 25%, and 25.1% in both directions; release below/exactly/above threshold; high-velocity sub-threshold release; retreat below threshold; pointer cancel; vertical/diagonal intent.
- Verify first/middle/last selected rows, month-boundary adjacent weeks, December↔January, leap February, and four/five/six-row months.
- Verify normal/reduced motion, runtime motion toggle, rapid repeated taps, reverse during settle, second drag, rotation/background/cancel, and stale callback suppression.
- Component tests prove roles/copy/routing/controller decisions. Native timestamped geometry/semantic traces and intermediate captures are mandatory for drag and row morph; final screenshots or Jest animation mocks alone do not pass.
- Compare the identical fixture/theme/viewport against Revision 18 in Light and Dark. Retain reference/native captures plus overlays/differences. Any unexplained difference blocks parity.
- Run the full appearance/viewport/orientation/font/input matrix from the native verification contract, including System under both OS schemes, 360×800, 390×844, 600×960, 840×1080 equivalents and corresponding landscapes, text 1.0/2.0, touch/keyboard/D-pad.
- Navigation and detail disclosure must produce zero source mutation commands, set completions, rest effects, correction saves, removals or implicit matches.

## UI Considerations

Applicable state considerations resolved: 30 explicit, 0 backstop, 0 unresolved. Element kinds were reviewed as Calendar grid (`list-collection`, `nav`, `interactive-control`), agenda/detail collections (`list-collection`, `interactive-control`, `static-content`), Calendar key (`static-content`, `interactive-control`), and month/detail status surfaces (`static-content`).

| Category | Element(s) | Status | Resolution / reason |
|---|---|---|---|
| empty | Month projection | ✅ covered | A zero-event month retains the complete navigable date grid; no fixture events or global CTA are inserted. |
| empty | Selected-date agenda | ✅ covered | Focused week remains and the agenda renders the exact documented `No workout` copy. |
| empty | Read-only detail | ✅ covered | Missing/removed occurrence/session uses a dedicated source-backed missing state and Back action, not a blank detail shell. |
| loading | Month grid | ✅ covered | Stable, non-interactive, accessibility-hidden skeletons preserve Calendar chrome and approximate grid geometry. |
| loading | Refresh/month navigation | ✅ covered | Last-good projection and selection remain visible with `Updating Calendar`; stale responses cannot replace the newest state. |
| loading | Read-only detail | ✅ covered | Detail retains route header/Back and uses stable factual-row skeletons; no fake values. |
| error | Month/agenda query | ✅ covered | Error copy and `Retry Calendar` retain last-good month, selected date and focused state. |
| error | Missing/stale detail | ✅ covered | Dedicated unavailable copy returns to Calendar and refreshes; it never substitutes another entity. |
| error | Interrupted gesture/motion | ✅ covered | Cancel/rotation/background resolves to one stable panel/week with current semantic title/focus. |
| populated | Month grid | ✅ covered | All sport/status combinations, selected/today/outside/rest and four/five/six rows use fixed geometry. |
| populated | Agenda | ✅ covered | Each source event receives one compact full-width row in source order and routes by durable identity. |
| populated | Read-only detail | ✅ covered | Every historical exercise and set fact is shown with disclosure and complete/not-completed semantics. |
| partial | Calendar event | ✅ covered | Partial uses dotted half-fill plus the text `Partial`; sport color remains independent. |
| partial | Workout history | ✅ covered | Committed sets retain results and incomplete rows say `Not completed`; no Resume appears. |
| partial | Projection failure | ✅ covered | Last-good content may remain visible as stale only with an explicit error/updating notice; stale and fresh are not visually conflated. |
| overflow | Event chips | ✅ covered | Two-chip visual capacity with `+N`; full event list and accessible label preserve all events. |
| overflow | Agenda | ✅ covered | Middle agenda scrolls vertically while selected/adjacent week context and bottom navigation remain anchored. |
| overflow | Detail | ✅ covered | Full-height detail scrolls vertically; headers/Back remain reachable; nested horizontal scrolling is forbidden. |
| overflow | Calendar key | ✅ covered | Sheet scrolls within 82% max height and safe areas; group items wrap without clipping. |
| zero-one-many | Day events | ✅ covered | Zero is blank/rest as applicable, one uses one chip/singular count, two stack, many use overflow plus complete agenda. |
| zero-one-many | Agenda rows | ✅ covered | No row, one row and many rows keep identical hierarchy and plural-safe event count. |
| zero-one-many | Exercise/set history | ✅ covered | Zero/missing uses unavailable state; one/many disclosures and all set rows preserve source order. |
| long-text | Month title | ✅ covered | Preserve control targets; one-line ellipsis is allowed after month/year semantics remain accessible. |
| long-text | Event title | ✅ covered | Cell chip ellipsizes visually; day label contains full event name/status/source. |
| long-text | Agenda title/metadata | ✅ covered | Rows grow and wrap at 200%; one-line result/target may ellipsize only with full accessible value. |
| long-text | Exercise name | ✅ covered | Disclosure header grows and wraps before truncation; chevron remains a 48dp target. |
| long-text | Dialog/error copy | ✅ covered | Text wraps and sheet/page scrolls vertically; no fixed-height clipping. |
| long-text | Numeric values/units | ✅ covered | IBM Plex Mono tabular values remain grouped with units and reflow as a unit at 200%. |
| overflow | Landscape month | ✅ covered | Content region may scroll vertically to preserve ≥48dp rows, fixed tracks and persistent chrome; no horizontal overflow. |
| populated | Calendar key | ✅ covered | Activity and Status groups are both present; neutral status samples and explanatory text are complete in Light/Dark. |

Open-domain considerations are also resolved: local/offline query errors are source-backed; motion/reduced motion has identical semantics; keyboard/D-pad has complete alternatives; orientation and 200% text preserve state and hierarchy; full event names are semantic even where visual chips abbreviate.

## Registry Safety

| Registry / package | Blocks or capabilities used | Safety gate |
|---|---|---|
| shadcn | None | Not applicable; native Expo/React Native project and no `components.json` |
| Repository UI | Shared header, icon action, focusable pressable, modal sheet, notice, skeleton, root navigation | Existing local source; reuse rather than copying a parallel implementation |
| Lucide React Native 1.31.0 | Existing outlined navigation/status icons | Already pinned; decorative instances hidden and icon actions labelled |
| Gesture Handler 2.32 / Reanimated 4.5 / Worklets 0.10 | Existing gesture and UI-thread motion primitives | Already pinned; no new registry or remote block |
| Third-party registries | None | No third-party registry content enters this contract |

## Six-Dimension Researcher Self-Check

This is a pre-checker self-assessment; it does not upgrade frontmatter from `draft` and does not accept DEV-01/DEV-02.

- [x] **Dimension 1 — Copywriting: PASS.** CTA, key, loading, empty, rest, error/retry, read-only, missing-detail and separate destructive-management copy are exact and actionable.
- [x] **Dimension 2 — Visuals: PASS.** Full-height month/focused geometry, 28/36 tracks, two-event capacity, dialog, agenda, detail, Light/Dark, wide/landscape/200% behavior and all intermediate motion states are prescriptive.
- [x] **Dimension 3 — Color: PASS with owner checkpoints open.** 60/30/10 roles, exact palette, sport/status separation and non-color semantics are declared; DEV-02 is explicitly not accepted.
- [x] **Dimension 4 — Typography: PASS.** Exactly four sizes, two weights, line heights, bundled families, tabular numerals, long-text and 200% behavior are declared.
- [x] **Dimension 5 — Spacing: PASS with owner checkpoint open.** The seven-value 4dp scale is separate from the owner-approved, source-referenced 2/3/10/14/18dp Calendar exceptions and from border/stroke geometry. The exact 18dp oracle inset remains the baseline; only DEV-01's adaptive 6dp alternative is proposed and unaccepted.
- [x] **Dimension 6 — Registry Safety: PASS.** No shadcn or third-party registry blocks; only inspected, pinned native packages and repository components are permitted.

**Researcher verdict:** Ready for `gsd-ui-checker`. Final approval remains pending checker verification and the two recorded owner decisions before their affected implementation work.

