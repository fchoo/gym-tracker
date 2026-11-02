---
phase: 09
slug: in-workout-exercise-editing
status: approved
shadcn_initialized: false
preset: none
created: 2026-09-16
reviewed_at: 2026-09-16T00:00:00Z
---

# Phase 09 — UI Design Contract

> Visual and interaction contract for the existing native active-workout overview. This phase extends the locked Phase 8 overview; it does not introduce a web, dashboard, or new visual system.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — native project component system |
| Preset | not applicable |
| Component library | repository-owned React Native Material 3 primitives (`AdaptiveScreen`, `ContentCard`, `FocusablePressable`, `PrimaryAction`, `SecondaryAction`, `ConfirmationSheet`, `InlineNotice`, `M3SearchField`, `M3FilterChip`) |
| Icon library | `lucide-react-native`; 24dp standard icon, 20dp inline icon |
| Font | Source Sans 3 for interface copy; IBM Plex Mono for numeric targets/observations |

**Existing-system rule:** reuse `src/ui/theme/index.ts` and existing components. Do not add shadcn, Tailwind, browser layout, arbitrary hex values, a parallel token set, or a new picker framework. All actions remain React Native controls wired to the runtime command boundary, never SQL.

**Phase surface:** retain the single `AdaptiveScreen` scroll owner, sticky workout identity header, all-exercises-inline overview, active-set entry anchor, inline one-tap `Complete`, and unchanged RestDock. Exercise editing occurs inside the existing overview rows; `Add exercise` remains the existing pinned end-of-list action.

**Primary focal point:** the current workout identity and the currently active set are the first visual priority on entry. Anchor the scroll to the active set, keep the current workout identity in the sticky header, and preserve its inline one-tap `Complete` action as the dominant workout-path control. Exercise editing is secondary to this completion path.

---

## Spacing Scale

Declared values (existing `space`; multiples of 4 only):

| Token | Value | Usage in Phase 09 |
|-------|-------|-------------------|
| xs | 4px | label/icon separation and dense status copy |
| sm | 8px | card-internal gaps, control padding, row separation |
| md | 16px | default overview/action spacing and horizontal compact inset |
| lg | 24px | sheet padding, overview section separation, medium inset |
| xl | 32px | expanded inset and two-pane gap where the existing shell permits it |
| 2xl | 48px | minimum touch-target dimension; major separation only |
| 3xl | 64px | dock scroll clearance only; reuse `AdaptiveScreen` behavior |

Exceptions: none. Every interactive exercise header, overflow trigger, picker row, confirmation action, drag handle, and Move control has a minimum 48dp by 48dp target, even at font scale 2.

---

## Typography

Use only existing interface type roles; numeric observations and targets continue to use the existing IBM Plex Mono roles. The contract uses exactly four sizes and two weights.

| Role | Size | Weight | Line Height | Phase 09 use |
|------|------|--------|-------------|--------------|
| Supporting label | 14px | 600 | 20px | `Added`, `Skipped`, menu labels, helper and confirmation labels |
| Body | 16px | 400 | 22px | explanatory copy, row summaries, picker supporting text |
| Section/action | 16px | 600 | 22px | exercise names, action labels, confirmation actions |
| Screen title | 28px | 600 | 34px | inherited `Workout` screen header only |

Do not introduce a display type style for exercise editing. Status is always written as text (`Added`, `Skipped`, `Modified from plan`) and is never communicated by color alone. At font scale 2, copy wraps and the scroll surface grows vertically; controls do not clip, overlap, or lose their 48dp target.

---

## Color

Use `themes.light` / `themes.dark` semantic tokens only; System appearance continues to resolve through `AppearanceProvider`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `canvas` — light `#F1F3F4`, dark `#202124` | overview background, sticky header/dock background |
| Secondary (30%) | `contentCard` — light `#FFFFFF`, dark `#121212`; `surface` for sheets | exercise/set cards, picker card, overflow and confirmation sheets |
| Accent (10%) | `action` — light `#155EEF`, dark `#70A0FF` | selected picker-row outline, focused/primary committed actions, focus ring semantics |
| Destructive | `destructive` — light `#B42318`, dark `#FF746A` | Remove action and destructive confirmation emphasis only |

Accent reserved for: `Add exercise` / chosen-exercise confirmation, active primary actions, selected library exercise border/state, visible keyboard/D-pad focus ring, and existing active-set affordances. It is not a general exercise-status indicator.

Completed and skipped history may retain the established `completed` / `contentCardStatusCompleted` semantic treatment, but each must also have its literal text status and a status icon with an accessibility-hidden duplicate icon. Error uses `errorSurface` plus `destructive` and a written error heading/body; it is never color-only.

---

## Component and Interaction Contract

### Overview exercise rows

- Render every session exercise in persisted display order as one scrollable list with its inline warm-up and working-set rows. Preserve active-set anchoring on entry and the active set's inline `Complete` action.
- Each exercise header remains a 48dp minimum `FocusablePressable`, with a semantic button role, exact accessible name containing exercise name, literal status, completed/total working-set summary, and expand/collapse state. Retain visible 2dp `focusRing` focus treatment.
- Existing collapsed summaries use text/icon non-color cues. A skipped original remains in the ordered overview/history with literal `Skipped`; its retained completed observation remains visible and editable only through the pre-existing completed-set correction flow. It is excluded from remaining-work counts and cannot become the next active fallback.
- An owner-added row retains literal `Added` text, a non-color status cue, its default single working set, and its end-of-list position until a later reorder. Added work is manual-only; do not imply planned progression.
- The existing `+ Add exercise` action stays at the list end, below the final exercise section and above any existing dock clearance. It is not moved to a floating dashboard action or the sticky header.

### Per-exercise overflow

- Add a 48dp minimum, visible-focus `⋯` button to every eligible exercise header. Accessible name: `<exercise name> exercise actions`; role `button`; state exposes `expanded` while its menu is open.
- Open the existing native bottom-sheet/menu treatment, not a browser menu. Move focus to the first menu item; on dismissal restore focus to the initiating overflow button. `Escape` / Android back dismisses without mutation.
- The menu items are exactly `Replace exercise` and `Remove exercise`. Keep future timing/superset actions out of this phase. Reorder remains the separately locked session action and must use its own drag-first / Move up / Move down contract.
- `Replace exercise` opens the reviewed single-select library picker. `Remove exercise` opens the destructive confirmation; neither mutates the row at menu-open time. Menu rows support touch, Enter, Space, D-pad activation, role/name/state, and disabled/busy state.

### Single-select library picker

- Reuse the reviewed Material 3 search/filter components and available-library data; do not create a second library or multi-select flow. Search field label is `Search exercises`; result count and no-results state use existing `M3SearchField` semantics.
- Selecting a candidate is a single choice. Its row has role `radio`, accessible name `<exercise name>`, state `checked`, literal `Selected` text when selected, and a selected semantic surface/border. Selecting another candidate clears the prior selection.
- The confirmation action uses the selected exercise name: `Replace with <exercise name>` for replacement and `Add <exercise name>` for the existing add flow. Disable it until exactly one choice exists and during the in-flight request.
- Replacement receives its own default metric target scheme and fresh snapshot. After an authoritative committed result, close the picker, show the returned overview order, keep the replacement in the original display position, and move focus/scroll to the replacement header only after it is rendered. Use `animated: !reduceMotion`; never animate when reduced motion is enabled.

### Replace and Remove history boundary

| Case | Visible result | Required copy / semantics |
|------|----------------|---------------------------|
| Replace with no completed set | Original disappears after the authoritative result; replacement appears at that display position | No provisional row is presented as skipped. The replacement is a new exercise with its own default scheme. |
| Replace with completed history | Original stays visible as `Skipped`; completed observation stays visible; replacement appears at the same display position | The picker/confirmation context states that completed history is retained and the original is marked `Skipped`. Text plus skipped icon make this distinguishable without color. |
| Remove with no completed set | Original disappears only after confirmation and authoritative result | Confirmation explicitly identifies the exercise; no historical-skipped label is shown for the removed provisional row. |
| Remove with completed history | Original stays visible as `Skipped`; completed observation remains visible; remaining-work count excludes it | Exact confirmation heading: `Remove exercise`. Body: `This exercise has completed sets. They will be retained and this exercise will be marked Skipped, not deleted.` |

The zero-completed Remove confirmation also uses heading `Remove exercise`, destructive `Remove exercise` confirm action, and a cancel action that leaves the workout unchanged. Do not claim permanence beyond the actual committed outcome; no result/status changes before the runtime command returns.

### Reorder and completion/write-back continuity

- Reorder uses the existing Material 3 drag-first pattern on overview exercise rows, plus explicit accessible fallback buttons named `Move <exercise> up` and `Move <exercise> down`. Disable impossible endpoints and any repeated in-flight move. On success, announce `<exercise> moved to <n> of <total>` in text/live region.
- Reorder alters presentation/display order only. It never visually reclassifies completed or skipped history as new data, and it preserves the currently open/active row identity.
- After a finished, edited owned-plan workout only, show exact heading `Save these changes to the plan?`. Body: `You changed this workout from its plan. Save these changes to <plan and day>?` The focused/default action is `Keep plan as-is`; secondary affirmative action is `Save changes to plan`.
- Dismissal or `Keep plan as-is` leaves the completed session durable and the plan untouched. `Save changes to plan` stays disabled/busy while its aggregate preview/apply is in flight; a stale/failed request retains the completed workout, changes no plan row, and gives a retry plus keep-session-only path. This prompt never appears for empty, unplanned, non-owned, unedited, or edit-then-restored sessions.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | `Add exercise` at list end; after selection `Add <exercise name>` or `Replace with <exercise name>` |
| Overflow actions | `Replace exercise`; `Remove exercise` |
| Picker heading / search | `Choose exercise`; `Search exercises` |
| Empty picker state | `No exercises found` — `Try a different search or clear a filter.` |
| Picker/load error | `Library could not be loaded` — `Your workout was not changed. Try again.` with `Retry loading exercises` |
| Add mutation error | `Exercise was not added` — `Your workout was not changed. Try again from the latest workout.` with `Retry adding exercise` |
| Replace mutation error | `Exercise could not be replaced` — `Your workout was not changed. Try again from the latest workout.` with `Retry replacing exercise` |
| Remove mutation error | `Exercise could not be removed` — `Your workout was not changed. Try again from the latest workout.` with `Retry removing exercise` |
| Committed-refresh failure | `Exercise changed. Reload workout` — `The exercise change was saved, but the latest workout could not be loaded. Return to Today and reopen this workout.` |
| Skipped history label | `Skipped` |
| History-preserving destructive message | `This exercise has completed sets. They will be retained and this exercise will be marked Skipped, not deleted.` |
| Destructive confirmation | `Remove exercise`: cancel `Keep exercise`; confirm `Remove exercise` |
| Write-back heading | `Save these changes to the plan?` |
| Write-back default / affirmative | `Keep plan as-is` (default and focused); `Save changes to plan` |
| Write-back failure | `Changes were not saved to the plan` — `Your completed workout is safe. Try again or keep the plan as-is.` with `Retry saving changes` |

---

## Accessibility and Responsive Contract

- All new controls expose exact role, accessible name, state (`expanded`, `checked`, `busy`, `disabled`, and selection where applicable), visible 2dp focus ring, and text/icon non-color cues. All have 48dp minimum touch and D-pad target size.
- Touch, Enter, Space, semantic `activate`, hardware D-pad focus/activation, Android back, and screen-reader activation produce the same command path. A busy or disabled action is not focusable and cannot submit twice.
- Compact (<600), medium (600–839), and expanded (>=840) forms reuse `AdaptiveScreen`: 16/24/32px horizontal inset respectively; do not introduce dashboard panes. On expanded width, active workout content remains constrained to the existing readable 720px width.
- Validate every new state in System, Light, and Dark appearance; contrast and focus use existing semantic theme tokens.
- At font scale 2, exercise names, long filtered exercise names, status labels, confirmation body, and write-back choices wrap without truncating actionable text; the vertical list scrolls rather than clipping.
- Reduced motion sets scroll/reorder/replacement positional transitions to non-animated while preserving state feedback and focus movement.
- Process death/relaunch must rehydrate the committed overview outcome: removed provisional row absent; skipped original and completed observation present; replacement/order/add origin present; modified-from-plan cue and subsequent write-back eligibility correct. Do not render an optimistic local result as durable.

---

## UI Considerations

Applicable state considerations resolved: 18 covered, 6 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| populated | Overview exercise collection | ✅ covered | Render all persisted exercises inline in display order; active set stays anchored and `Complete` remains inline. |
| partial | Overview rows with history-preserving replace/remove | ✅ covered | A skipped original retains literal `Skipped` plus completed observation; replacement is rendered separately in the same display position. |
| overflow | Overview exercise collection | ✅ covered | One `AdaptiveScreen` vertical `ScrollView` owns scrolling; list-end Add action and dock clearance remain reachable. |
| zero-one-many | Overview exercise collection | ✅ covered | Empty overview shows Add with no set rows; one/many render the same section model in persisted display order. |
| long-text | Exercise names, status summaries, confirmation and write-back copy | 🧪 backstop | Component/native visual evidence at font scale 2 verifies wrap/reflow with no clipped action or target below 48dp. |
| loading | Library picker | ✅ covered | Reuse existing Material 3 loading/skeleton/search treatment; picker actions remain unavailable until a selectable result is ready. |
| empty | Library picker search results | ✅ covered | Render `No exercises found` with `Try a different search or clear a filter.`; selection/confirmation is absent. |
| error | Library picker load | ✅ covered | Render `Library could not be loaded` with unchanged-workout assurance and `Retry loading exercises`. |
| error | Add/replace/remove command result | ✅ covered | Keep the authoritative prior overview; render operation-specific `Retry adding exercise`, `Retry replacing exercise`, or `Retry removing exercise`, or distinct committed-refresh recovery when the mutation did commit. |
| loading | Overflow, confirmation, picker confirm, reorder and write-back controls | ✅ covered | In-flight action exposes busy/disabled and blocks repeat submission until authoritative result. |
| error | Completed write-back apply | ✅ covered | Preserve completed workout and unchanged plan; render `Retry saving changes` / `Keep plan as-is` path. |
| overflow | Overflow menu and confirmation sheet | ✅ covered | Native bottom sheet scrolls to max 90%; focus moves into the menu and returns to initiator on dismissal. |
| long-text | Overflow actions and picker/confirmation controls | 🧪 backstop | Component evidence verifies exact names remain available through compact/medium/expanded and font scale 2 layouts. |
| partial | Selection picker | ✅ covered | Exactly zero or one candidate is selected; selected status is literal text and radio `checked` state. |
| zero-one-many | Picker results | ✅ covered | Search reports result count; zero uses the documented empty state; many remain scrollable with one radio selection. |
| overflow | Skipped-history visual treatment | 🧪 backstop | Native relaunch evidence proves `Skipped` and retained completed observation remain visible, while skipped work is excluded from remaining/active fallback. |
| loading | Reorder/replacement result transition | 🧪 backstop | In-flight tests prove duplicate activation is blocked; authoritative view then controls order, focus, and reduced-motion scroll. |
| error | Runtime conflict/stale result | 🧪 backstop | Component/native evidence proves no optimistic row mutation and supplies the documented latest-workout retry/recovery route. |
| populated | Finish write-back prompt eligibility | 🧪 backstop | Integration/native evidence proves prompt only after a durably divergent completed owned-plan session, with default No and process-relaunch persistence. |
| long-text | `Modified from plan` and write-back status | ✅ covered | Literal text accompanies semantic color/status treatment and wraps in the existing completion summary. |
| loading | Reduced-motion and relaunch path | ✅ covered | Motion is derived from `useAppTheme().reduceMotion`; persisted results are re-read after relaunch rather than animated from local state. |
| overflow | Reorder control set | ✅ covered | Drag is available for touch; `Move <exercise> up/down` provides D-pad/screen-reader fallback and disabled endpoints. |
| error | Destructive confirmation cancellation | ✅ covered | Cancel/dismiss restores initiating focus and leaves the overview unchanged; confirm is the sole destructive command path. |
| populated | Completed/undo-protected history | ✅ covered | Completed correction remains the existing correct-or-undo interaction; Phase 09 does not expose destructive deletion for that history. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — project is Expo/React Native and has no `components.json` |
| third-party | none | not applicable — no third-party UI registry/block may enter this phase |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-09-16
