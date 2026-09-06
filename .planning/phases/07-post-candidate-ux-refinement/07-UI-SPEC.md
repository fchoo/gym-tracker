---
phase: 7
slug: post-candidate-ux-refinement
status: approved
shadcn_initialized: false
preset: none
created: 2026-09-06
reviewed_at: 2026-09-06
---

# Phase 7 — Post-Candidate UX Refinement: UI Design Contract

> Canonical visual, interaction, accessibility, copy, and state contract for the owner-directed refinement of the green Phase 6 candidate. This phase simplifies the native Android experience without weakening the local-first authority model.

---

## Contract Authority and Scope

Implementation precedence:

1. Locked owner decisions in `07-CONTEXT.md`, especially UX-11 through UX-22.
2. Phase 7 goal and success criteria in `ROADMAP.md` and the mapped UX requirements in `REQUIREMENTS.md`.
3. This UI contract.
4. Approved Phase 6 UI contract and the existing repository design system for unchanged behaviour.

### Included

- Bottom-navigation selection simplification and Today cleanup.
- One Settings destination, entered from Today with a gear icon.
- Dense, adaptive active-workout SetRow controls; add-row and More-dialog refinement.
- Hard removal of eligible incomplete warm-up and working-set rows, with explicit confirmation.
- Single-active-day plan editing with an unmistakable day switcher; drag ordering for plan and schedule rows with non-gesture alternatives.
- Foreground-only rest-countdown audio cues that respect the existing rest-sound preference.
- Concept-G ascending-bars app icon assets for standard, adaptive, monochrome, and splash use.

### Excluded

- Any change to authoritative workout, schedule, history, recommendation, portability, or notification semantics beyond the explicitly approved remove-row command.
- Replacing SQLite authority with UI state, optimistic deletion, or audio/notification authority.
- A new component framework, shadcn, third-party registry, typeface, icon library, colour palette, cloud feature, or release/promotion action.
- A multi-day expanded editor; one selected day remains the editing model.

### Source-authority rule

The UI must acknowledge a removal, setting change, plan save, or workout completion only after its repository command has committed. SQLite facts remain authoritative; React state, audio playback, notifications, query caches, and visual ordering previews are disposable derivatives. A failure leaves the authoritative values/rows visible and supplies a safe retry path.

## Design System

| Property | Contract |
|---|---|
| Tool | Repository-owned Expo/React Native theme and primitives in `src/ui/theme`, `src/ui/components`, and `AdaptiveScreen` |
| Preset | Not applicable — this is a native Expo/React Native Android app, not web React/shadcn |
| Component library | None; extend the repository-owned primitives only |
| Gesture/runtime libraries | Existing `react-native-gesture-handler` and `react-native-reanimated`; only for long-press reorder and its motion feedback |
| Audio runtime | Add the owner-approved Expo native audio dependency behind a small foreground-only audio port; it is supplementary feedback, never rest authority |
| Icon library | Existing Lucide React Native, outlined at 2dp stroke; add only semantic glyph mappings to the existing `IconAction`/shared-glyph system |
| Interface font | Source Sans 3, bundled weights 400 and 600 only |
| Numeric font | IBM Plex Mono, bundled weights 400 and 600 only, with tabular numerals |
| Direction | Quiet, high-contrast precision instrument: factual, compact, utility-first, and calm |
| Surface strategy | Continuous neutral-grey canvas and independently scannable flat cards only; never nest cards |
| Appearance | System default plus Light and Dark overrides; every new selected, focus, busy, disabled, error, and destructive state works in all three modes |

### Material 3 alignment rules

- Material 3 informs control purpose, hierarchy, modal focus, selection, status feedback, and accessible interaction. It does not license Material defaults, dynamic colour, purple accents, elevated-card stacks, decorative pills, gradients, or Android system-UI lookalikes.
- Reuse shared `FocusablePressable`, `IconAction`, `ScreenHeader`, `SectionHeader`, `ContentCard`, `ConfirmationSheet`, and `PlanEditorReorderableRow` patterns. No screen-local lookalikes for settings rows, icon actions, confirmation sheets, set actions, or drag handles.
- Icon-only actions always have an explicit spoken label, role, state, 48dp target, visible focus treatment, Enter/Space activation, and D-pad reachability.
- Colour never carries required meaning alone. Use text, icon/shape, selected/checked/busy/disabled state, and live announcement where the state changes.

## Spacing Scale

The existing fixed scale is the only spacing scale. All dimensions are multiples of 4dp.

| Token | Value | Phase 7 use |
|---|---:|---|
| `space.1` | 4dp | Tight status/icon-to-label gap; bar spacing only inside icon artwork if scaled proportionally |
| `space.2` | 8dp | Set-row control gaps, compact settings/list spacing, icon-to-text gap |
| `space.4` | 16dp | Standard card/row inset, settings section internals, dialog actions |
| `space.6` | 24dp | Separate Settings sections and major active-workout sections |
| `space.8` | 32dp | Medium/expanded layout gap |
| `space.12` | 48dp | Major empty-state separation only |
| `space.16` | 64dp | Maximum expanded whitespace only |

| Element | Required sizing and layout contract |
|---|---|
| Interactive control | Minimum 48 × 48dp, including gear, plan, overflow, reset, complete, remove, add, replace, drag handle, and every Settings row/switch target |
| Standard row/card inset | 16dp horizontal; 8dp vertical compact row padding, increasing vertically rather than shrinking targets at large text |
| SetRow at default scale | One horizontal control band with 8dp gaps: ordinal/status, metric fields, Reset, Done, Remove; field widths may be profile-specific but may not reduce below their existing readable minimums |
| SetRow constrained or 200% text | Reflow as ordered wrapped bands inside the same row/card: identity and fields first, then Reset/Done/Remove. Do not overlap, clip, horizontally scroll, or hide a required action. |
| Settings rows | At least 48dp high, 16dp horizontal inset, 8dp copy/control gap; long descriptions wrap and rows grow vertically |
| Reorder rows | At least 48dp high at default scale; 48dp drag target; row grows at large text and never uses horizontal scrolling for required content |
| Modal/sheet | 12dp top radius, 24dp content inset, 16dp action gap; natural content height with `maxHeight: 90%`, vertical scrolling only if necessary |

Exceptions: Android adaptive-icon geometry is pixel-based rather than dp-based; its safe zones are specified under **App icon contract**. No other exceptions.

## Typography

The app retains exactly four rendered text sizes and exactly two weights. Phase 7 adds no type token.

| Role | Family | Size / line height | Weight | Phase 7 use |
|---|---|---:|---:|---|
| Display timer | IBM Plex Mono | 52 / 56sp | 600 | Existing rest countdown only |
| Screen title | Source Sans 3 | 28 / 34sp | 600 | `Settings`, active-workout screen title, confirmation heading |
| Body/control | Source Sans 3 | 16 / 22sp | 400 or 600 | Settings labels, set fields/actions, dialog actions, day names |
| Supporting/compact label | Source Sans 3 | 14 / 20sp | 400 or 600 | Section labels, support copy, concise set state, icon-action context |

Rules:

- `Settings`, section headers, current day name, and active set identity are reading anchors; use 28sp title or 16sp semibold as appropriate.
- Load, reps, durations, set counts, and countdown values use IBM Plex Mono only where numeric alignment materially helps; prose and action labels use Source Sans 3.
- Primary plan/exercise/day names wrap to two lines before ellipsis. Support copy and Settings descriptions wrap fully. A trailing action may move to a following line at 200% text; content must never be clipped merely to preserve a one-line composition.
- At Android 200% text, all Phase 7 labels, buttons, dialogs, settings rows, day switcher rows, and drag controls reflow or grow vertically. Never reduce font scale, clip text, overlap controls, or remove a required action.

## Color

### 60 / 30 / 10 allocation

| Allocation | Light | Dark | Usage |
|---|---|---|---|
| Dominant 60% | `canvas #F1F3F4` | `canvas #202124` | Continuous root background and reading space |
| Secondary 30% | `contentCard #FFFFFF`, `surface #F8F9FA`, `surfaceSubtle #E8EAED` | `contentCard #121212`, `surface #171B1E`, `surfaceSubtle #20262A` | Flat settings/content cards, neutral action layers, nav chrome, modal surface |
| Accent 10% | `action #155EEF` | `action #70A0FF` | Selected root-tab icon/label, selected appearance/day state, primary actions, focus ring, explicit navigable text, active drag outline |
| Completed | `completed #1F7A4D` | `completed #56C88A` | Completed set status icon/text only; never delete or ordinary selection |
| Attention | `timerAttention #B54708` | `timerAttention #FFB45C` | Rest-audio unavailable / notification-permission attention only, paired with text and icon |
| Destructive | `#B42318` | `#FF746A` | Remove/discard affordance, destructive confirmation, and recoverable error text/border only |

Accent is reserved for: selected bottom-nav icon and label; gear/plan/overflow focus or pressed state; selected Settings radio/day; active drag outline; primary action; focus ring; and explicitly navigable text. It is not decoration, a general card colour, or an audio-status indicator.

| State | Required visual and semantic treatment |
|---|---|
| Active root tab | Action-coloured icon and label plus `selected` tab state; transparent background and no selected box, outline, fill, or border |
| Focused control | Existing visible 2dp `focusRing` in Light and Dark; focus never depends on selected-state colour |
| Incomplete set | Neutral row, ordinal/current-state summary, editable values, and labelled Reset/Done/Remove glyphs |
| Completed set | Completed icon/text plus existing correction/undo route; no remove glyph |
| Remove pending/busy | Disabled controls and busy state; row remains visible until commit succeeds |
| Drag held | `contentCardSelected` fill, action outline, movement/displacement, and busy/adjustable accessibility state |
| Rest audio unavailable | Attention icon/text with exact copy in the RestDock; timer remains readable and not attention-coloured unless it has actually ended |
| Destructive confirmation | Destructive text/button treatment plus explicit remove/discard words; no colour-only warning |

Normal text meets 4.5:1 contrast; large text and non-text controls meet 3:1 minimum.

## Information Architecture and Visual Hierarchy

### Root navigation and Today

- Root tabs retain their labels, roles, focus ring, 48dp target, compact two-row fallback, and expanded rail behaviour. The selected tab is distinguished **only** by its action-coloured icon and label plus `selected` state. Remove the active-tab highlight box entirely.
- Today remains operationally anchored on the scheduled workout and its existing `Start {day name}` primary action. `Choose another day` and rest-day `Train anyway` stay intact.
- Remove all Today `Repeat`, `Skip`, and `Advance` schedule/rotation actions. Their removal does not alter the existing schedule transition caused by committed workout outcomes.
- Replace Today’s header ellipsis with a 48dp outlined Lucide Settings gear labelled `Settings` and hint `Open Settings`. It is the single entry point to secondary settings/data tools.
- Remove the standalone Today `History and data` action and the in-place Rest-alert/Appearance sheets from Today. Do not leave a duplicate header action or a hidden alternate route.

### Settings page

Route `/more` becomes the screen titled `Settings`; it remains a normal adaptive screen, not a nested modal. The vertical order is fixed:

1. **Appearance** — a radio group of `System`, `Light`, and `Dark`; current selection has radio/selected state, check icon, action outline, and non-colour label.
2. **Rest alerts** — `Rest sound` and `Rest vibration` 48dp switch rows. `Rest sound` support text is `Plays short beeps at 3, 2, and 1 seconds and a longer beep when rest ends.` `Rest vibration` retains its existing terminal-alert meaning.
3. **History and data** — description `Restore a completed workout that was removed from ordinary history.` and `Removed sessions` route action.
4. **Data and recovery** — description `Create a secure backup, restore a previous backup, or export readable CSV data.` and `Data and recovery` route action.

- Appearance is a top-level section, not a button inside Rest alerts. The old `Appearance` sheet and old `Close rest alerts` action do not appear in the Settings hierarchy.
- Settings rows are factual and quiet: heading, one supporting sentence only where useful, then a labelled action or switch. Use flat cards or bounded sections; do not create a card inside a card.
- Loading Rest settings shows shape-preserving two-row skeletons with `Loading rest alert settings` busy state. Existing persisted values are not reset to defaults while a refresh is in flight.
- A Rest-settings persistence failure uses the attention heading `Rest alert setting was not saved` and body `Your saved rest alert setting was not changed. Try the switch again.` The affected switch returns to its authoritative persisted value. Re-invoking the same labelled `Rest sound` or `Rest vibration` switch is the retry path; no separate Retry button is shown.
- If Android notification permission is denied, keep the existing bounded attention content: heading `Background rest alerts are off`, body `Your in-app timer stays accurate. Allow notifications in Android settings for background rest alerts.`, action `Open notification settings`.

### Active workout detail

- Header hierarchy: Back; current exercise context/title; a 48dp plan glyph labelled `Today's plan`; one 48dp overflow glyph labelled `More workout actions`. The plan glyph must be visually distinct from the ellipsis. There is exactly one ellipsis/overflow control.
- Render no top notice banner above the target or set sections. Remove rest-resumed, warm-up-added, revealed-set, and other transient top notices; do not move them into a second banner. The selected/current set and RestDock already carry the relevant live state.
- The target remains the first content anchor. Then `Warm-ups`, then `Working sets`; each section header has one aligned trailing 48dp Plus glyph (`Add warm-up` or `Add working set`).
- Remove `Copy warm-up` entirely. Add warm-up reuses the immediately preceding warm-up observation; add working set reuses the immediately preceding working-set observation. If that section has no prior row, use its existing source/default observation. The new row is not acknowledged until its insert commits.

### SetRow anatomy and states

At default text scale and a normal compact width, every editable incomplete SetRow has exactly one horizontal control band in this reading order:

`set identity/status → metric value field(s) → Reset → Done → Remove`

- `Reset` is an outlined reset/rotate glyph labelled `Reset warm-up W{n}` or `Reset set {n}`. It restores the editable row to its plan-default/current source values and persists through the existing value-update path; it does not complete, skip, or remove the row.
- `Done` is the existing check glyph labelled `Complete warm-up W{n}` or `Complete set {n}`. It remains disabled for non-active working sets, busy rows, or invalid values. Value persistence completes before the command can acknowledge the set.
- `Remove` is a trash glyph labelled `Remove warm-up W{n}` or `Remove set {n}`. It replaces Skip everywhere in Phase 7. It is available only for non-completed warm-ups and working sets, including an incomplete legacy skipped row if one is encountered. It never invokes a skip command or creates a skipped row.
- Completed rows retain their status, correction, and undo path. They have no Remove action because committed workout facts remain immutable on this surface.
- Value-source glyphs, if present, remain after the fields but before Reset. At default width they stay within the one control band; under constraint they join the ordered action band rather than creating a detached action dock.
- Profile-specific fixed/protocol context, validation error, source choice, save feedback, and correction controls may occupy an ordered supporting line below the band. These do not change the required location of editable values, Reset, Done, and Remove.
- At 200% text or when the band cannot keep every 48dp target/readable field, reflow in the same reading order into vertical bands. The component must show all required controls without horizontal scrolling, overlap, clipped labels, or a smaller target.

#### Remove confirmation and commit feedback

Tapping Remove opens a consequential `ConfirmationSheet`; it must focus its cancel action and restore focus to the invoking Remove glyph on cancellation/failure. Use exact copy:

| Row | Heading | Body | Cancel | Confirm |
|---|---|---|---|---|
| Warm-up W{n} | `Remove warm-up W{n}?` | `This warm-up will be removed from this workout. This cannot be undone.` | `Keep warm-up` | `Remove warm-up` |
| Working set {n} | `Remove set {n}?` | `This set will be removed from this workout. This cannot be undone.` | `Keep set` | `Remove set` |

- The confirm button is destructive and busy/disabled while the remove command is in flight. Do not optimistically remove the row.
- On committed success, remove the row, announce `{Warm-up W{n}|Set {n}} removed`, update the source-backed progress/total/history view, and focus the next available row of the same section; if none remains, focus that section’s Add glyph.
- On recoverable failure, leave the row and values unchanged; render the inline alert `Set could not be removed. Your workout was not changed. Try again.` or `Warm-up could not be removed. Your workout was not changed. Try again.` The retry is the original Remove action after the error is announced.
- The command must recalculate active-workout progress and the history snapshot in the serialized SQLite write before the UI announces success.

### More workout actions

- The overflow opens the sheet titled `More workout actions`, focuses the first available action, traps modal accessibility, and restores focus to the overflow glyph when dismissed. Android Back and backdrop dismissal are allowed; there is no `Close` action.
- It contains only, in this order: `Finish workout` when eligible; `Finish as partial`; `Discard workout`. Preserve their existing confirmation and completed/partial semantics.
- Remove `Save zero-set workout`, `Finish workout later`, and `Close` completely.
- The sheet takes only its natural content height plus its 24dp padding/16dp gaps. It may scroll above 90% viewport height; it must not reserve a fixed trailing empty area.

### Plan editing, day switching, and schedule ordering

- Plan day and exercise reorder rows retain a leading 48dp long-press handle. Remove visual Up/Down buttons and all visible `Position {x} of {y}` copy.
- Default row hierarchy is handle → primary name and concise support text → trailing action. In an exercise row, Replace becomes a 48dp right-aligned glyph labelled `Replace {exercise name}`; it is not a full-width text button. At 200% text it may move below the label group while retaining its target and logical order.
- The drag handle has a shape, label, and hint: `Reorder {label}` and `Touch and hold to drag. Use accessibility actions to move this item.` While held it shows selected fill, action outline, and live neighbour displacement. Standard motion may animate for 140–200ms; reduced motion changes position without displacement animation but keeps reordering functional.
- Every drag has an equivalent non-gesture route: TalkBack adjustable `Move up`/`Move down` actions, plus keyboard/D-pad focus on the handle with Enter/Space activation and Shift+Arrow Up/Down move commands. These alternatives commit only the draft order and never restore visible Up/Down icon buttons.
- In the owned-plan editor, `Days` is an explicit day switcher: every day is a visible labelled selectable row with day name and exercise count, selected state, 48dp target, and keyboard/D-pad focus. Selecting a day immediately changes the single editor below to that day; no all-days dense editor is introduced. The selected day name is the `Day editor` context.
- Selecting/reordering a day keeps the selected day by stable ID; if a removed day was selected, select the nearest surviving day. Long names wrap; every day remains reachable without horizontal scrolling.
- Apply the same long-press drag/accessible-alternative contract to **both** Weekday and Rotation rows in starter-plan activation and owned-plan schedule editing. Weekday still exposes its weekday radio choice; dragging changes only binding order. Do not show ordinal text as a substitute for drag feedback.
- Plan edits, day/exercise reorders, and schedule reorders are drafts until the existing explicit `Save Plan Changes` or activation confirmation commits. On save failure, show heading `Plan changes could not be saved`, body `Your draft is still here. Your existing plan was not changed.`, and the specifically labelled recovery action `Retry saving plan changes`. Preserve the unsaved draft and leave the authoritative existing plan and schedule unchanged; never claim an order changed authoritatively before commit.

### Rest countdown audio

- Respect the persisted `Rest sound` setting. When it is On and the app is foregrounded, emit one short neutral beep as the persisted/timestamp-derived countdown first reaches 3, 2, and 1 seconds, then one longer beep at 0. Do not replay a threshold during a render, do not backfill missed beeps after resume, and do not beep while paused, skipped, or backgrounded.
- Audio does not start, pause, resume, expire, or correct rest. The persisted timer, visible `MM:SS`, existing spoken status, and notification reconciliation remain authoritative. The terminal beep is supplementary to—not a replacement for—`Rest ended`.
- No permanent audio banner appears during normal countdown. `Rest sound` support copy in Settings describes the behaviour; its On/Off state remains the authoritative user-visible status.
- If playback initialization or a cue fails, show one bounded attention message in the RestDock for that rest: heading `Countdown sound unavailable`; body `The timer is still accurate. Keep watching the countdown.` Do not block controls, alter rest state, or show a modal. A later rest may try audio again.
- `Rest sound` Off suppresses all Phase 7 in-app beeps without changing the existing Android background-notification channel policy.

### App icon contract — Concept G

The icon is a simple “grow stronger” mark: exactly three upright rounded bars, baseline-aligned and ascending from left to right. It uses the app’s blue tri-tone—deep blue `#0B3A75`, action blue `#155EEF`, and light blue `#70A0FF`—on a flat pale background `#F6F8FB`. No text, dumbbell, arrow, grid, gloss, gradient, shadow, outline, or decorative geometry is allowed.

| Asset | Required output |
|---|---|
| `icon.png` | 1024 × 1024px opaque standard icon. Pale background; centered three-bar mark within the central 640 × 640px area, with equal bar width/gap, softly rounded corners, shared baseline, and clearly ascending heights. |
| `android-icon-background.png` | 512 × 512px fully opaque flat `#F6F8FB`; no guide lines or visible safe-zone artwork. |
| `android-icon-foreground.png` | 512 × 512px RGBA. Transparent outside the mark. Keep all three bars inside the centered 256 × 256px adaptive safe zone (`x/y 128–384`); no important pixels outside it. |
| `android-icon-monochrome.png` | 432 × 432px RGBA. One solid, tintable three-bar silhouette with transparent outside; keep the silhouette inside the centered 216 × 216px safe zone (`x/y 108–324`). |
| `splash-icon.png` | 228 × 213px RGBA rendering of the same centered three-bar mark; transparent outside, no text or separate splash motif. |

The bar ordering itself, not colour alone, communicates progression. Inspect the actual generated PNGs at their configured dimensions and in Android adaptive masking before candidate build.

## Copywriting Contract

| Element | Exact copy |
|---|---|
| Today primary CTA | `Start {day name}` |
| Today secondary start | `Choose another day` |
| Today settings entry | `Settings` |
| Settings title | `Settings` |
| Settings sections | `Appearance`; `Rest alerts`; `History and data`; `Data and recovery` |
| Appearance choices | `System`; `Light`; `Dark` |
| Rest sound help | `Plays short beeps at 3, 2, and 1 seconds and a longer beep when rest ends.` |
| Add controls | `Add warm-up`; `Add working set` |
| Active header actions | `Today's plan`; `More workout actions` |
| More dialog heading/actions | `More workout actions`; `Finish workout`; `Finish as partial`; `Discard workout` |
| Remove warm-up confirmation | `Remove warm-up W{n}?` / `This warm-up will be removed from this workout. This cannot be undone.` / `Keep warm-up` / `Remove warm-up` |
| Remove-set confirmation | `Remove set {n}?` / `This set will be removed from this workout. This cannot be undone.` / `Keep set` / `Remove set` |
| Remove success | `Warm-up W{n} removed`; `Set {n} removed` |
| Remove failure | `Warm-up could not be removed. Your workout was not changed. Try again.`; `Set could not be removed. Your workout was not changed. Try again.` |
| Rest-audio failure | `Countdown sound unavailable` / `The timer is still accurate. Keep watching the countdown.` |
| Plan-save failure | `Plan changes could not be saved` / `Your draft is still here. Your existing plan was not changed.` / `Retry saving plan changes` |
| Rest-alert-setting failure | `Rest alert setting was not saved` / `Your saved rest alert setting was not changed. Try the switch again.` / Re-invoke the same labelled `Rest sound` or `Rest vibration` switch after it reverts to the authoritative persisted value. |
| Empty warm-ups | `No warm-ups yet` / `Add a warm-up to record preparation sets.` |
| Empty working sets | `No working sets yet` / `Add a working set to continue this exercise.` |
| Drag affordance | `Reorder {label}` / `Touch and hold to drag. Use accessibility actions to move this item.` |
| Replace glyph | `Replace {exercise name}` |
| Day switcher state | `{day name}. {n} exercises` |

Voice is factual, calm, local-first, and evidence-led. Do not introduce wellness, readiness, medical, motivational, or judgemental claims.

## Accessibility and Adaptation

- Every new/changed target has a name, role, selected/checked/busy/disabled state where applicable, 48dp minimum target, visible 2dp focus ring, Enter/Space activation, and D-pad reachability.
- Focus follows visible reading order. Today: title → scheduled workout → start actions → Settings. Settings: title → Appearance → Rest alerts → History and data → Data and recovery. Active workout: header → target → Warm-ups → Working sets → RestDock.
- The remove sheet and More sheet are modal to accessibility, initially focus their first safe control, restore focus to the invoking control, and support Android Back. Destructive confirm/cancel labels state the exact outcome.
- Icon-only Reset, Done, Remove, Add, Settings, plan, More, Replace, and reorder controls have semantic labels. Decorative icon SVGs are hidden from accessibility.
- Incomplete/completed/remove/busy/drag/audio-failure states pair visual treatment with programmatic state and textual/live feedback. Audio is never the only cue for timer completion.
- Do not make an action available only through swipe, long press, drag, or touch. All ordering actions have accessibility and physical-keyboard alternatives; all icon actions have labelled focusable controls.
- Preserve compact `<600dp`, medium `600–839dp`, and expanded `≥840dp` layouts. At 200% text, Settings, set rows, day switcher, schedule rows, sheets, and root nav wrap/grow or switch mode; none clip, overlap, collapse below 48dp, or disappear.
- Validate System, Light, and Dark, TalkBack, keyboard/D-pad, reduce motion, large text, safe-area, and offline operation.

## Required Verification Evidence

Every changed behaviour receives a regression test in the task that implements it. Tests do not replace the fresh-candidate and repeated Samsung N4 gate.

| Surface | Automated contract | Native/attended evidence |
|---|---|---|
| Root nav and Today | Selected tab has action icon/label + selected state and no selected box; gear route is unique; repeat/skip/advance absent; start routes unchanged | 200% text, D-pad/TalkBack, compact/expanded navigation, Samsung safe area |
| Settings IA | Exact section order/copy; Appearance top-level radio state; rest-loading/error/denied states; routes and focus order | Light/Dark/System, TalkBack, long text, Android settings return path |
| SetRow density | Default single band contains fields/Reset/Done/Remove; profile variants; 48dp targets; 200% ordered reflow; no Skip | Emulator + Samsung common-width ergonomics, TalkBack labels, keyboard/D-pad focus |
| Remove command and sheet | Incomplete only; exact confirm/failure/success copy; no optimistic deletion; completion remains unremovable; repository progress/history update only after commit | Failure injection and repeated Samsung remove/cancel/commit journey |
| More dialog | Exact retained action list; deleted actions absent; natural content height; modal focus/Back restore | Samsung bottom-sheet height and accessibility review |
| Plan/day/schedule ordering | No visual up/down or position copy; long-press displacement; Weekday and Rotation parity; Shift+Arrow and TalkBack move alternatives; drafts persist only on save | Emulator reduced-motion/200%/keyboard and Samsung touch-hold review |
| Rest audio | One short 3/2/1 cue and one long zero cue per foreground rest when enabled; off/paused/background/error behaviour; rest facts unchanged | Physical-device audible check, denied notification and audio-failure fallback |
| App icon | Exact dimensions, alpha/background/safe zones, tri-tone/silhouette parity, config references, and reproducible CNG output | Android launcher adaptive mask, themed monochrome icon, splash, and Samsung visual review |

Native audio dependency and icon/config changes require `verify:cng`, the full matrix, clean Android generation/build, fresh candidate bytes, and the repeated N4 review. Release approval, promotion, public release, and Terminal Seal remain separate explicit actions.

## UI Considerations

Applicable state considerations resolved: 8 explicit, 5 backstop, 0 unresolved. Empty/error copy lives in **Copywriting Contract**; this table records state coverage and evidence expectations.

| Category | Element(s) | Status | Resolution / reason |
|---|---|---|---|
| empty | Warm-up and working-set collections | ✅ covered | Empty sections show the documented heading/body and their aligned Add glyph; they never render a blank action area. |
| loading | Settings rest preferences; active workout command rows | ✅ covered | Rest preferences retain shape-preserving skeletons; action rows expose busy and preserve authoritative values/rows. |
| error | Remove command; rest-audio port; rest-setting save; plan/day/schedule save | ✅ covered | Exact safe copy preserves workout/timer truth; a failed rest setting reverts and retries through the same labelled switch; a failed plan save preserves the draft, leaves the authoritative plan/schedule unchanged, and exposes `Retry saving plan changes`. |
| populated | Settings, active set list, day switcher, schedule list | ✅ covered | Fixed hierarchy and source-backed selection/order; no fabricated zero state or duplicate route. |
| partial | Incomplete versus completed set rows; current selected day | ✅ covered | Incomplete rows may remove; completed rows retain correction; selected-day editor is singular and stable by ID. |
| overflow | Set rows, Settings support copy, day/schedule rows, More dialog | ✅ covered | Ordered wrapping/vertical growth or bounded vertical scroll; no required horizontal scroll or clipped target. |
| zero-one-many | Set lists, plan days, schedule bindings | ✅ covered | Exact empty states; singular/plural counts use the source-backed count and every item remains focusable/reorderable where allowed. |
| long-text | Day/exercise names, Settings descriptions, action labels | ✅ covered | Names wrap to two lines before ellipsis; descriptions wrap; actions reflow at 200% rather than disappear. |
| loading | Drag preview and native audio initialisation | 🧪 backstop | Gesture/audio tests prove held-state feedback and ensure audio startup never blocks or changes rest truth. |
| partial | Audio threshold crossings after foreground/resume | 🧪 backstop | Held-out/device test proves no missed-threshold backfill, duplicate beep, or audio-driven rest transition. |
| overflow | Default-width single-row SetRow | 🧪 backstop | Component plus native 200% test proves required controls are one band when fit and safely ordered when not. |
| populated | Adaptive and monochrome icon assets | 🧪 backstop | CNG and launcher visual test prove safe-zone survival under masks and tinted silhouette parity. |
| long-text | Keyboard/D-pad/accessibility reorder alternatives | 🧪 backstop | Held-out assistive test proves focus/order/action discoverability without visible Up/Down buttons. |

## Registry Safety

| Registry / source | Blocks used | Safety gate |
|---|---|---|
| Repository-owned React Native components | Existing theme, components, adaptive layout, confirmation, reorder primitives | Existing source/test review; shared primitives only |
| Lucide React Native | Existing and added semantic glyphs such as Settings, Trash, Replace, plan, More, status | Existing dependency; every icon-only control has a programmatic label |
| Expo native audio dependency | Direct pinned package dependency for foreground cue port only | Package/config/source review plus CNG reproducibility and native matrix; no registry block |
| shadcn / third-party registries | None | Not applicable — no `components.json`, no web/shadcn stack, and no registry block introduced; confirmed 2026-09-06 |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-09-06
