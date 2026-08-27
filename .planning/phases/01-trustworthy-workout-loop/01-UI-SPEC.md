---
phase: 1
slug: trustworthy-workout-loop
status: approved
reviewed_at: 2026-08-15T16:57:34Z
shadcn_initialized: false
preset: none
created: 2026-08-16
---

# Phase 1 — UI Design Contract

> Canonical visual and interaction contract for the Trustworthy Workout Loop. The planner and executor must implement this contract without adding later-phase product surfaces.

---

## Contract Authority

This specification preserves the locked decisions in:

1. `.planning/phases/01-trustworthy-workout-loop/01-CONTEXT.md`
2. `.planning/REQUIREMENTS.md`
3. `.planning/ROADMAP.md`
4. `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md`
5. `~/.gstack/projects/gym_tracker/designs/approved-20260815/core-workout-flow.png`
6. `~/.gstack/projects/gym_tracker/designs/system-review-20260815/app-system-reference.png`

Precedence for implementation:

1. Phase boundary and decisions in `01-CONTEXT.md`.
2. Phase 1 requirements and success criteria.
3. This UI contract.
4. Approved mockups for hierarchy and visual direction.

The core-workout mockup is an interaction-hierarchy reference, not final styling. The app-system reference controls the precision-instrument visual direction, card-light surface strategy, typography roles, semantic color use, and dark workout treatment. Where an old mockup label differs from the locked information architecture, use the locked label: root destinations are **Today, Calendar, Library, Progress**.

---

## Phase Boundary

### Included

- Four-destination root shell.
- Intentional Phase 1 empty states for Calendar, Library, and Progress.
- Today first use, copied Full Body Foundation activation, scheduled day, rest day, alternate day, empty workout, comparable history, pending suggestion, and resume entry.
- Focused Active Workout with root navigation hidden.
- Optional warm-ups, working-set value editing, one primary set-completion action, save failure, Retry, eight-second Undo, manual and automatic rest, and interruption recovery.
- Completed, partial, resumable, discarded, skipped-exercise, and zero-set outcomes.
- Completion summary, optional effort, first `load_reps` recommendation decision, and basic session detail.
- Root and local loading, error, offline, notification-denied, resume, paused-rest, and expired-rest states.
- System, Light, and Dark appearance with an explicit accessible selector.
- Compact, medium, and expanded Android width classes.
- 200% text, keyboard, D-pad, focus restoration, meaningful labels, non-color cues, and reduced motion.

### Excluded

- Full plan or exercise library, editors, search, filters, and catalog browsing.
- Calendar month/history correction flows.
- Overall Progress, charts, period controls, and aggregate analytics.
- User-facing backup, restore, or export.
- Completed-session correction, removal, or restore.
- General-purpose exercise detail and trends beyond the basic Phase 1 session result.
- Public release, marketing, social, coaching, Health Connect, Wear OS, or media surfaces.

Calendar, Library, and Progress must be real navigable root destinations, but their Phase 1 content is an intentional empty state rather than a partial implementation of later phases.

---

## Design System

| Property | Contract |
|---|---|
| Tool | Repository-owned React Native theme and primitives |
| Preset | Not applicable |
| Component library | None; do not introduce shadcn, Radix, or a web component system |
| Icon library | Lucide React Native, outlined, `2dp` stroke |
| Interface font | Source Sans 3 |
| Numeric font | IBM Plex Mono with tabular numerals |
| Styling direction | Quiet, high-contrast precision instrument |
| Surface strategy | Card-light continuous canvas with editorial sections |
| Appearance | System by default; explicit Light or Dark override persists |

Bundle only the `400` and `600` font weights used by the contract. Do not synthesize additional weights.

### Visual Principles

- Lead with the next action, then evidence, then explanation.
- Declared focal points:
  - Today: the planned day and `Start {day name}` action draw the eye first.
  - Active Workout: the current exercise, active values, and adjacent `Complete Set {N}` or RestDock form one primary anchor.
  - Completion: the committed outcome and factual session summary lead; the recommendation becomes primary only within its decision surface.
  - Intentional empty roots: the unavailable-state heading and `Go to Today` action lead without previewing later-phase controls.
- Root screens use one continuous canvas.
- Separate sections with headings, spacing, and a hairline divider before adding a container.
- Use bounded surfaces only for a recommendation requiring a decision, a save/database failure, a destructive confirmation, or a self-contained selectable plan row.
- Do not nest cards.
- Do not place every metric in a separate card.
- Do not use decorative pills. Pills are limited to segmented controls, filters in later phases, and compact actionable status.
- Keep one dominant action per section.
- Long exercise names wrap to two lines; the active exercise name is never silently truncated.
- Use no gradients, decorative blobs, emoji decoration, ornamental icon circles, generic wellness copy, or global fitness/readiness scores.

---

## Spacing and Sizing

The fixed layout-spacing scale is `4, 8, 16, 24, 32, 48, 64dp`. Do not introduce intermediate spacing tokens or one-off layout gaps.

| Token | Value | Required Usage |
|---|---:|---|
| `space.1` | `4dp` | Tight icon/text or inline status gap |
| `space.2` | `8dp` | Related controls, compact row content, and tight control clusters |
| `space.4` | `16dp` | Screen horizontal inset, default block padding, and larger related-row gap |
| `space.6` | `24dp` | Section separation |
| `space.8` | `32dp` | Major screen-group separation |
| `space.12` | `48dp` | Large empty-state or pane separation |
| `space.16` | `64dp` | Maximum major breathing room on expanded layouts |

### Sizing Rules

| Element | Contract |
|---|---|
| Minimum interactive target | `48 × 48dp` |
| Primary action | Full available width in its content region; minimum `56dp` high |
| Sticky workout action | Minimum `56dp` high plus safe-area inset |
| Numeric set control | `56–64dp` high at default text size; grows at large text |
| Standard corner radius | `8dp` |
| Emphasized bounded surface | `12dp` |
| Full-round shape | Compact controls and circular icon actions only |
| Divider | One physical pixel or platform hairline |
| Root screen horizontal inset | `16dp` compact; `24dp` medium; `32dp` expanded |
| Readable active-workout width | Maximum `720dp` for current exercise, sets, and dock |

The `48dp`, `56dp`, and `56–64dp` values are control dimensions, not exceptions to the spacing scale.

---

## Typography

The rendered type scale is limited to four font sizes (`14`, `16`, `28`, and `52sp`) and two weights (`400` and `600`). Hierarchy comes from family, size, weight, spacing, and placement rather than additional near-duplicate sizes.

| Token | Family | Size / Line Height | Weight | Usage |
|---|---|---:|---:|---|
| `displayTimer` | IBM Plex Mono | `52 / 56sp` | `600` | Active rest countdown |
| `targetValue` | IBM Plex Mono | `28 / 34sp` | `600` | Current set target and prominent numeric result |
| `screenTitle` | Source Sans 3 | `28 / 34sp` | `600` | Root and focused-route title |
| `sectionTitle` | Source Sans 3 | `16 / 22sp` | `600` | Editorial section heading |
| `body` | Source Sans 3 | `16 / 22sp` | `400` | Primary readable content and instructions |
| `bodyStrong` | Source Sans 3 | `16 / 22sp` | `600` | Exercise names, action labels, and key values |
| `secondary` | Source Sans 3 | `14 / 20sp` | `400` | Supporting history and evidence |
| `label` | Source Sans 3 | `14 / 20sp` | `600` | Uppercase or compact labels; never required body copy |

Rules:

- Body copy is never smaller than `16sp`.
- Required instructions and the sole expression of status never use `secondary`.
- Load, repetitions, set counts, elapsed time, countdowns, and duration use IBM Plex Mono with tabular numerals.
- Units remain Source Sans 3 when visually separated from the numeric value; a combined target string may use IBM Plex Mono.
- Exercise names wrap to two lines before truncation.
- At 200% text, numeric groups reflow vertically rather than clip or shrink.
- Do not use all-caps for sentences. All-caps is limited to short `label` roles such as `PLANNED WORKOUT`.

---

## Color

### 60 / 30 / 10 Allocation

| Allocation | Role | Light | Dark | Usage |
|---|---|---|---|---|
| 60% | Dominant canvas | `#F6F7F5` | `#0F1214` | Screen background and uninterrupted reading canvas |
| 30% | Secondary surfaces | `#FFFFFF`, `#EEF1F2` | `#171B1E`, `#20262A` | Bounded decisions, controls, dock, selected/raised regions |
| 10% | Accent | `#155EEF` | `#70A0FF` | Primary action, selected root navigation, actionable link text, selected segmented state, and focus indication only |

Accent is not a general decoration color. Do not use cobalt for static headings, neutral containers, or every tappable row.

### Semantic Tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `canvas` | `#F6F7F5` | `#0F1214` | Root background |
| `surface` | `#FFFFFF` | `#171B1E` | Dock and bounded surface |
| `surfaceSubtle` | `#EEF1F2` | `#20262A` | Inputs, skeletons, segmented controls |
| `textPrimary` | `#171A1C` | `#F4F6F7` | Primary text |
| `textSecondary` | `#5D656B` | `#AEB7BD` | Supporting text |
| `divider` | `#C9CED2` | `#394146` | Hairlines and control borders |
| `action` | `#155EEF` | `#70A0FF` | Reserved accent actions |
| `actionPressed` | `#004EEB` | `#8DB3FF` | Pressed primary action |
| `onAction` | `#FFFFFF` | `#071225` | Text/icon on primary action |
| `completed` | `#1F7A4D` | `#56C88A` | Committed completion and confirmed progress |
| `timerAttention` | `#B54708` | `#FFB45C` | Expired timer and non-destructive caution |
| `destructive` | `#B42318` | `#FF746A` | Destructive action and error icon/text |
| `errorSurface` | `#FEE4E2` | `#3A1C1B` | Save/database failure surface |
| `focusRing` | `#155EEF` | `#9CBFFF` | External-input focus ring |

Rules:

- Green means committed or confirmed completion only.
- Amber means timer attention or non-destructive caution only.
- Red means error or destructive action only.
- Pair every semantic color with text plus an icon, shape, or state label.
- Body text must meet WCAG AA `4.5:1`.
- Large text and non-text controls must meet at least `3:1`.
- Disabled elements retain readable labels and use opacity plus disabled semantics; do not communicate disabled state by low contrast alone.

---

## Iconography and Motion

### Iconography

- Use Lucide icons at `2dp` stroke with a consistent optical size.
- Default icon size is `24dp`; compact inline status may use `20dp`.
- Icon-only actions remain at least `48 × 48dp`.
- Every icon-only action has a programmatic label; familiar icon-only actions do not require redundant visible text.
- Unfamiliar, destructive, and first-use actions include a visible text label.
- Decorative icons and dividers are hidden from accessibility APIs.
- Required mappings:
  - Back: `ArrowLeft`; accessibility label `Go back`
  - More actions: `Ellipsis`
  - Completed: `Check`
  - Timer: `Timer`
  - Paused: `Pause`
  - Resume: `Play`
  - Skip: `SkipForward`
  - Warning/error: `TriangleAlert`
  - Destructive discard: `Trash2`
  - Retry: `RotateCcw`

### Motion

| Transition | Standard Motion | Reduced Motion |
|---|---|---|
| Set commit confirmation | `120–160ms` opacity/state transition plus one short confirmation haptic | Immediate state change; haptic follows user setting |
| Action dock to rest dock | `180–220ms` opacity and short position transition; no bounce or scale | Immediate replacement with opacity only |
| Sheet presentation | Platform-standard translation and fade | Fade only |
| Root tab switch | No decorative page travel | Same |
| Numeric or timer update | Direct value update; no rolling digits | Same |

Do not animate charts from zero, use spring bounce on completion, or delay state acknowledgement for visual effect. No completion styling appears before the source transaction commits.

---

## Information Architecture

### Root Shell

`AppTabs` has exactly four root destinations in this order:

1. Today
2. Calendar
3. Library
4. Progress

Contracts:

- Compact and medium use bottom navigation.
- Expanded may use a navigation rail.
- Every root item has an icon and visible label.
- At 200% text, visible labels may use their same one-word names; never switch to icon-only navigation.
- The shell renders immediately on launch, but root items are disabled until SQLite opens, migrations complete, and the first trusted query succeeds.
- Active Workout is a focused route and hides root navigation at every width.
- Finishing or discarding returns to Today.
- `View workout details` opens basic session detail; Back returns to completion or Today according to route history.
- Android Back dismisses the topmost sheet, then the focused route, then follows root route history. From a root destination, a second Back press exits.

### Shell States

| State | Visual Contract | Interaction Contract |
|---|---|---|
| Boot loading | Shell visible; Today shows fixed-size structured placeholders for title, metadata, action, and exercise rows | Root destinations disabled and announced as unavailable while data is prepared |
| Ready | Selected root destination uses `action` color and selected semantics | All destinations reachable |
| Root database/migration error | Shell remains visible but disabled; content area becomes `RootFailureState` | `Retry opening workout data` is primary; `View diagnostic code` is secondary; no user-facing backup UI in Phase 1 |
| Focused workout | Root navigation absent; workout header and dock clear safe areas | Back first requests a safe leave decision when unsaved or active work exists |

Never render a separately serialized last-known Today snapshot. Skeletons represent shape only and never display stale workout facts.

---

## Intentional Empty Destinations

Each empty root screen retains its real `ScreenHeader`, selected navigation state, and one useful route back to Today. Do not show fake metrics, disabled filters, zero charts, or placeholder editors.

| Destination | Heading | Body | Primary Action |
|---|---|---|---|
| Calendar | `Calendar is not available yet` | `Completed and partial workout dates will appear here in a later phase. Your Phase 1 session details remain available after each workout.` | `Go to Today` |
| Library | `Library is not available yet` | `Full plan and exercise management will arrive in a later phase. Full Body Foundation is available from Today.` | `Go to Today` |
| Progress | `Progress is not available yet` | `Complete workouts now; overall trends and exercise progress will appear here in a later phase.` | `Go to Today` |

Focus order exposes the screen heading first, then body, then the primary action. These destinations do not expose a retry state unless the root data layer itself has failed.

---

## Appearance and Offline Contract

### Appearance Selection

- `More settings and information` on Today opens a sheet headed `Appearance`.
- The sheet presents one accessible radio group with `System`, `Light`, and `Dark`.
- `System` is the default and follows the current Android appearance.
- Choosing `Light` or `Dark` applies and persists that explicit override immediately; choosing `System` clears the override.
- The selected option exposes selected semantics, all three options remain visible at 200% text, and dismissing the sheet restores focus to `More settings and information`.
- Appearance changes preserve the current route, active set, entered values, scroll anchor, and rest state.
- Phase 1 exposes no unrelated settings editor from this sheet.

### Offline Behavior

- The shell, plan activation, Today reads, workout start, value selection, set commit, Undo, rest, finish, recommendation decision, and session detail behave identically in airplane mode.
- Do not show a generic offline banner, degraded-data state, sign-in prompt, network spinner, or disabled workout action; these Phase 1 paths are local.
- Airplane-mode changes do not reset navigation, dismiss sheets, clear entered values, or alter the authoritative set/rest state.
- Notification permission or delivery failure uses the declared non-blocking notification state; it is never presented as a network failure.

---

## Component Inventory

No screen may create a parallel visual treatment when one of these components can express the interaction.

| Component | Exact Contract |
|---|---|
| `AppTabs` | Four root destinations; selected, pressed, focused, disabled, compact-bottom, medium-bottom, and expanded-rail variants |
| `ScreenHeader` | One `screenTitle`, optional eyebrow/context, Back or root title, and at most one `IconAction` group |
| `SectionHeader` | `sectionTitle`, optional supporting text, optional trailing text action; never a card title wrapper by itself |
| `PrimaryAction` | Full-width cobalt action, minimum `56dp`, visible verb + object label, pressed/focused/disabled/busy states |
| `SecondaryAction` | Bordered or text action, minimum `48dp`, neutral surface; destructive variant uses red text only where action is destructive |
| `IconAction` | `48dp` target, outlined icon, explicit accessibility label and hint |
| `ExerciseRow` | Exercise name, comparable history, change/evidence, fixed-position `Next target`, and optional actionable `Review suggestion` |
| `PlanActivationRow` | Bounded selectable Full Body Foundation summary with days/week, goal, equipment, and first-day preview |
| `TargetValue` | Prominent IBM Plex Mono value plus fixed unit/rep semantics |
| `SetRow` | Warm-up or working kind/index, direct fixed-unit fields, inline source shortcuts, explicit status, and adjacent Complete/Skip actions; row indicator is not a completion button |
| `RestDock` | Running or paused countdown, next target, `−15 sec`, `Pause rest`/`Resume rest`, `+15 sec`, `Skip rest`, and `Undo completed set` status |
| `InlineNotice` | Resume, expired rest, notification denial, first-history, or non-blocking status; icon + heading/body; not a generic card |
| `RecommendationSurface` | Evidence, rule, current target, proposed target, and explicit accept/keep actions |
| `MetricSummary` | Editorial label/value pair; horizontal only when it fits, otherwise vertical; never a dashboard tile grid |
| `EmptyState` | Left-aligned heading, reason, one primary action, at most one secondary action |
| `ConfirmationSheet` | Focus-trapped destructive or explicit-outcome confirmation; neutral cancel first in focus order |
| `AppearanceSheet` | `System`, `Light`, and `Dark` radio group; selected semantics; explicit overrides persist; close restores invoking focus |
| `StartupReadinessGate` | Trusted-start notification readiness with enable/settings and continue-without-alerts actions |
| `WorkoutStartSheet` | Scheduled day, choose another day, and start empty options without silently advancing schedule |
| `SessionDetailExercise` | Exercise result, warm-ups separated, working sets, top set, total reps, and status |
| `RootFailureState` | Plain-language failure, `Retry opening workout data`, diagnostic disclosure, and correlation code |
| `SkeletonBlock` | Fixed-size neutral shape matching final layout; hidden from accessibility tree |

---

## Startup Readiness

- SQLite open, migrations, the first trusted query, and launch reconciliation complete before readiness is shown.
- If notification permission is `undetermined`, show `Set up workout alerts`, explain that only background rest alerts need permission, and offer `Enable notifications` plus `Continue without alerts`.
- If notification permission is denied, offer `Open notification settings` plus `Continue without alerts`.
- Continuing without alerts never blocks Today, workout start, inline set editing, set completion, rest correctness, or any offline feature.
- Do not request exact-alarm permission, network access, account setup, or unrelated system settings.
- After permission is granted or the user continues, render the current route without another readiness prompt in that mounted app process.

---

## Today Screen

### Hierarchy

Today is understandable from the plan title, Start action, and next targets alone.

1. `ScreenHeader`
   - Title: `Today`
   - Top-right: `More` icon action with accessibility label `More settings and information`
   - Activating `More settings and information` opens the Phase 1 `AppearanceSheet`
2. Active-workout resume banner, when applicable.
3. Planned workout section.
   - Label: `PLANNED WORKOUT`
   - Day name, such as `Full Body A`
   - Metadata: `{exercise count} exercises · about {estimated minutes} min`
4. Primary action: `Start {day name}`
5. Secondary action: `Choose another day`
6. `TODAY IN CONTEXT` section.
7. Exercise rows in planned order.

The primary Start action must remain before the exercise history list and within the initial compact viewport for the normal scheduled state.

### Exercise Row

Visible order:

1. Exercise name.
2. Latest comparable history:
   - `Last 60 kg · 8 / 8 / 7 · +1 rep`, or
   - `First recorded session`.
3. Right-aligned or trailing `NEXT TARGET`.
4. Target value, such as `60 kg × 8`.
5. `Review suggestion` only when a pending recommendation exists.

Semantic label order:

`{exercise name}. Next target {target}. Last comparable result {history}. {change}. {recommendation state}.`

The current target remains visible and unchanged until the owner explicitly accepts a recommendation.

### Today States

| State | Required UI | Primary Action |
|---|---|---|
| Loading | Fixed placeholders for plan title, metadata, Start action, and at least three exercise rows | None until trusted query succeeds |
| No active plan | Heading `Choose your starting plan`; one `PlanActivationRow` for Full Body Foundation; preview states `3 days per week`, `General strength and consistency`, required equipment, and first day | `Use Full Body Foundation` |
| Plan activation preview | Explain that activation creates a personal copy and starts its schedule; show first day exercises | `Activate Full Body Foundation` |
| Scheduled day, no history | Normal hierarchy; every exercise says `First recorded session`; plan defaults are the next targets | `Start {day name}` |
| Scheduled day, history | Normal hierarchy with latest comparable results and change | `Start {day name}` |
| Pending suggestion | `Review suggestion` appears beside the current target; opening shows evidence and proposed target | Start remains primary |
| Rest day | Heading `Rest day`; body shows next scheduled workout and date | `Train anyway` |
| Active workout exists | `Workout in progress` notice names current exercise, set, and timer state | `Resume workout` |
| Root error | `Workout data could not be opened. Your saved data was not changed.` plus correlation code disclosure | `Retry opening workout data` |

### Start Alternatives

`Choose another day` and `Train anyway` open `WorkoutStartSheet`:

- `Start {scheduled day}` when applicable.
- `Choose a plan day`.
- `Start empty workout`.

Starting a different day or empty workout must state `This will not advance your schedule unless you explicitly mark the planned day complete or skipped.` The sheet does not expose later-phase schedule editing.

If a workout is already active, attempting any start action opens:

- Heading: `Workout in progress`
- Body: `Resume the current workout, save it as partial, or discard it before starting another.`
- Actions:
  1. `Resume workout`
  2. `Finish as partial`
  3. `Discard workout`

---

## Active Workout

### Hierarchy

Active Workout is understandable from the exercise name, inline active values, adjacent row actions, and timer alone.

1. Focused `ScreenHeader`
   - Back
   - Eyebrow: `EXERCISE {current} OF {total}`
   - Exercise name
   - `More workout actions`
2. Resume, expired-rest, notification, or save-status `InlineNotice` when present.
3. `TODAY'S TARGET`
   - Prominent target, such as `60 kg × 8`
   - `Last workout` evidence
4. Warm-up section.
5. Working-set section.
6. `RestDock`, when active, directly below the active work region and above the bottom safe area.

Root navigation is never visible.

### Set Rows

#### Warm-ups

- Labels are `W1`, `W2`, and so on.
- Controls are full-size, not chips.
- Every incomplete row shows direct load and repetitions fields with fixed `kg` and `reps` suffixes.
- `Complete warm-up W{N}` and `Skip warm-up W{N}` share one adjacent action row.
- Section actions are `Add warm-up` and `Copy previous warm-up`.
- Warm-ups remain visible after completion and in session detail.
- Warm-up completion never starts progression logic and never increments working-set completion.

#### Working Sets

- Labels are `1`, `2`, `3`, and so on.
- Exactly one incomplete row is visually active.
- Load and repetitions are direct inline fields with fixed `kg` and `reps` suffixes.
- Timed holds expose one direct duration field with a fixed `sec` suffix.
- Available Recommended, Last workout, and Plan default values are inline shortcuts in that order; selecting one persists it but never completes the set.
- `Complete Set {N}` and `Skip Set {N}` share one adjacent action row. Only the authoritative active working set exposes enabled completion and skip actions.
- `Add working set` clones the last working-set target and current values into a session-only manual set. It does not mutate the copied plan target or create progression evidence by itself.
- Skipping the active working set is an atomic source fact, advances to the next working set, and does not start rest.
- Status marker variants:
  - Planned/inactive: hollow neutral circle plus `Not completed` semantics.
  - Active: focus/outline treatment plus `Current set` semantics.
  - Committed: check icon plus green and `Completed` semantics.
  - Skipped: neutral text plus explicit `Skipped working set {N}` semantics.
  - Saving: no completed icon; row stays active and its completion action reads `Saving set…`.
- Status markers never complete a set.

Set-row semantic label:

`Working set {index} of {count}. Planned {planned load} for {planned reps}. Current values {actual load} for {actual reps}. {completion state}.`

### Inline Set Action State Machine

| State | Visible Contract | Interaction |
|---|---|---|
| Ready | Active row actions `Complete Set {N}` and `Skip Set {N}` | Touch, Enter, or Space invokes the same command |
| Validation error | Values remain; inline message names the invalid field; row actions remain visible | Focus remains with the invalid inline field |
| Draft saving | `Saving values…`; completion or skip waits for the serialized draft write and then uses the latest revisions | Rapid field edits cannot race each other or completion |
| Committing | Completion label `Saving set…`; no green, check, haptic, advancement, rest, or notification yet | Duplicate input is ignored; both row actions expose disabled state |
| Committed, next work without rest | Row receives committed state; next row becomes active; polite announcement | Next row enables `Complete Set {next}` and `Skip Set {next}` |
| Committed, rest required | Rest dock appears only after commit; short haptic if enabled; Undo appears for eight seconds | Rest state derives from persisted timestamps |
| Save failed | Error surface; exact primary label `Set not saved · Retry`; body `Your values are still here. The set was not completed and rest did not start.` | Primary retries with the inline values still visible |
| Final working set | Row action remains `Complete Set {N}` | After committed save, route to exercise effort or workout finish as applicable |

The save-failed notice persists across backgrounding and process death because the source set remains incomplete. Navigation away requires the explicit `Finish workout later` path; ordinary Back does not silently discard entered values.

### Completion Input Equivalence

The following must call the same idempotent completion command:

- Touch on `Complete Set {N}`.
- Enter on the focused action.
- Space on the focused action.

Rapid repeated activation commits at most once. The UI must not simulate completion while a duplicate request is rejected.

---

## Rest Contract

### Automatic and Manual Entry

- Automatic rest starts only after a committed working set when another working set exists or the plan explicitly defines between-exercise rest.
- The final working set of an exercise advances without automatic rest unless between-exercise rest is configured.
- `More workout actions` includes `Start rest` using the current exercise's configured rest duration even without a just-completed set.
- Notification permission never controls whether rest starts or remains correct.

### Rest Dock

Running state:

- Label: `RESTING · NEXT: SET {N} AT {target}`
- Countdown: IBM Plex Mono `displayTimer`
- Controls in logical order:
  1. `−15 sec`
  2. `Pause rest`
  3. `+15 sec`
  4. `Skip rest`
- At normal font scale, all four controls occupy one equal-width row. Labels may wrap inside their own controls rather than pushing a control to a second row.
- Footer while available: `Set {previous} saved · Undo set ({seconds} sec)`

Paused state:

- Label: `REST PAUSED · NEXT: SET {N} AT {target}`
- Static remaining duration.
- Controls: `−15 sec`, `Resume rest`, `+15 sec`, `Skip rest`.
- No future rest notification remains scheduled.

Expired state:

- Inline notice: `Rest ended {elapsed} ago · working set {N} is ready`
- `timerAttention` icon/color plus text.
- The active row returns to `Complete Set {N}`.
- Acknowledging the notice or completing the set transitions persisted rest to idle.

Skipped state:

- Rest dock immediately returns to `Complete Set {N}` after the skip commits.
- Polite announcement: `Rest skipped. Working set {N} is ready.`

### Timer Semantics

- Remaining time is always derived from persisted timestamps.
- The timer exposes the remaining time through its meaningful label when focused.
- Do not update a live announcement every second.
- Each rest control has an explicit action label.
- D-pad order follows visual order.
- Undo is reachable after the four primary rest controls and before content behind the dock.

### Notification Denial

Show a non-blocking `InlineNotice`:

- Heading: `Background rest alerts are off`
- Body: `The in-app timer stays accurate. You can allow notifications from Android settings.`
- Secondary action: `Open notification settings`

The notice does not cover the timer or replace the completion/rest controls.

---

## Resume and Interruption States

Resume UI is explicit; Active Workout never shows a generic spinner after session creation.

| Persisted State | Exact Message | Result |
|---|---|---|
| Incomplete active set | `Workout resumed · {exercise}, working set {N}` | Values, focusable fields, active row, and scroll region restore |
| Running rest | `Rest resumed: {mm:ss} remaining · next is working set {N}` | Running RestDock displays timestamp-derived value |
| Paused rest | `Rest paused: {mm:ss} remaining · next is working set {N}` | Paused RestDock restores without scheduling an alert |
| Expired while inactive | `Rest ended {elapsed} ago · working set {N} is ready` | Active set and adjacent row actions are available |
| Save failed before interruption | `Set not saved` notice plus inline Retry | Entered values remain; no set advancement or rest |
| Notification arrived late | No special success state; derive current state from timestamps | Stale notification cannot alter or rewind workout state |
| Rotation | No notice unless state meaning changed | Focused field, current set, entered values, scroll anchor, and rest state remain |
| Reboot then launch | Same resume/expired rules | Do not imply alerts were guaranteed during reboot |

After hydration, focus moves to:

1. The resume notice heading, then
2. The active set's first editable value or the RestDock countdown for external input.

Do not steal focus repeatedly on timer ticks or query refresh.

---

## Workout Outcome Actions

`More workout actions` may contain:

- `Start rest`
- `Skip exercise`
- `Finish workout`
- `Finish as partial`
- `Finish workout later`
- `Discard workout`

Show only actions valid for the current state.

### Skip Exercise

Confirmation:

- Heading: `Skip {exercise name}?`
- Body: `This exercise will be marked skipped for this workout. Completed sets stay recorded.`
- Primary neutral action: `Keep exercise`
- Destructive/secondary action: `Skip exercise`
- Optional reason remains optional and is not required to proceed.

### Finish as Partial

Confirmation:

- Heading: `Save partial workout?`
- Body: `You completed {completed exercises} of {planned exercises} exercises and {completed working sets} working sets. You can resume later when this session remains valid.`
- Primary neutral action: `Keep training`
- Confirm action: `Save partial workout`

Partial status is always the result of this explicit action, never an inferred percentage threshold.

### Finish with Zero Working Sets

Confirmation:

- Heading: `Finish without working sets?`
- Body: `This workout will be saved with zero completed working sets.`
- Primary neutral action: `Keep training`
- Confirm action: `Save zero-set workout`

### Discard

Confirmation:

- Heading: `Discard workout?`
- Body: `This ends the workout and marks it discarded. It cannot be resumed.`
- Primary neutral action: `Keep workout`
- Destructive action: `Discard workout`

Destructive confirmations trap focus. Initial focus is on the neutral action, with heading, consequence, neutral action, then destructive action in semantic order.

---

## Completion Screen

### States

| State | Contract |
|---|---|
| Calculating | Session is already committed; show short fixed-size placeholders only for derived summary/recommendation |
| Completed | Heading `Workout complete`; show actual completed counts and duration |
| Partial | Heading `Workout saved`; status line `Partial · {completed exercises} of {planned exercises} exercises` |
| Derived-summary error | Keep committed completion visible; show `Workout saved. Some summary details could not be calculated.` and `Retry summary` |
| Recommendation pending decision | Current future target remains unchanged; show evidence and explicit accept/keep actions |
| Recommendation unavailable | Explain baseline or missing evidence; provide Return/View actions without empty metric cards |

### Hierarchy

1. `ScreenHeader`
   - `Workout complete` or `Workout saved`
   - Committed check icon for completed/partial saved state
2. Session context:
   - Plan/day name
   - Completed or Partial status
3. Editorial `MetricSummary` group:
   - Duration
   - Exercises completed as actual `{N}/{M}`
   - Working sets completed
4. Exercise results in performed order:
   - Exercise name
   - Top working set
   - Total working repetitions
   - Change versus latest comparable visit
   - Warm-ups excluded from these values
5. Optional effort prompt for each completed comparable exercise.
6. `RecommendationSurface`.
7. Next actions.

At 200% text, the metric group becomes one vertical list. It never overflows into clipped columns.

### Effort Prompt

Heading:

`How did {exercise name} feel?`

Options:

- Easy
- On target
- Hard
- Failed

Supporting text:

`Optional · skip without blocking completion`

The four options are full `48dp` controls, not small chips. At compact width or 200% text they wrap into a two-column or one-column layout while preserving reading order. Missing effort can result in a factual Hold recommendation; it never erases performance.

### First Progression Path

For the locked example `8 / 8 / 7 at 60 kg`, show:

- Label: `NEXT TARGET`
- Heading: `Repeat 60 kg next time`
- Evidence: `You completed 8 / 8 / 7 at 60 kg. One more repetition completes the range.`
- Rule: `Increase only after every working set reaches 8 reps and effort is Easy or On target.`
- Proposed target: `60 kg · aim for 8 / 8 / 8`
- Primary action: `Use this target next time`
- Secondary action: `Choose another target`

Acceptance is transactional and explicit. Until acceptance commits, the current target remains unchanged. If the proposed target equals the current load but changes the repetition aim, the copy still frames it as repeating the load and adding reps.

### Completion Actions

- `View workout details`
- `Return to Today`

After recommendation acceptance or dismissal, `Return to Today` is the dominant next action. Viewing details is available without forcing a recommendation decision.

---

## Basic Session Detail

Phase 1 session detail is read-only except for a valid `Resume workout` action. It does not expose correction, removal from history, plan editing, notes editing, or full exercise trends.

### Hierarchy

1. `ScreenHeader`
   - Back
   - Title `Workout details`
   - Session status: `In progress`, `Completed`, `Partial`, `Discarded`, or `Removed from history`
   - Session source: planned day, `Empty workout`, or `Manual visit`
2. Session summary:
   - Full Body Foundation / day name or Empty workout
   - Local date and start time
   - Duration
   - Exercises: `{completed}/{planned} ({percent}%)` when planned count is non-zero
   - Working sets: `{completed}/{planned} ({percent}%)` when planned count is non-zero
3. Exercise sections:
   - Immutable exercise name
   - Exercise status
   - Top working set
   - Total working reps
   - Effort when recorded
   - Warm-ups under a separately labelled `Warm-ups` subsection
   - Working sets under `Working sets`
4. Recommendation decision status:
   - `Accepted`, `Kept current target`, or `No recommendation`
5. Valid action:
   - `Resume workout` only when the session is resumable.

Set rows in session detail announce set kind, index, actual load/reps, and completion status. Completed sessions preserve `N/N (100%)` formatting. Partial and zero-set sessions show actual counts and never round up to completion.

### Status Vocabulary

| Fact | Visible Contract | Phase 1 Interaction |
|---|---|---|
| In-progress session | `In progress` plus `Resume workout` when still resumable | Created and resumable in Phase 1 |
| Completed session | `Completed` | Created in Phase 1 |
| Partial session | `Partial` plus actual counts | Created only by explicit Phase 1 action |
| Discarded session | `Discarded` | Created only after destructive Phase 1 confirmation |
| Manual source | `Manual visit` | Read-only reserved state; no manual-visit creation flow in Phase 1 |
| Skipped exercise | Exercise-level `Skipped` | Created by the Phase 1 skip-exercise action |
| Zero working sets | `Zero working sets` plus actual zero counts | Created only by explicit Phase 1 confirmation |
| Voided session | `Removed from history` | Read-only reserved state; no remove or restore action in Phase 1 |

Manual visits and voided sessions are distinguishable if encountered in retained fixtures or diagnostics, but their creation/removal flows remain deferred. Do not expose Phase 3 correction, removal, or restore actions.

---

## Copywriting Contract

Voice is calm, factual, evidence-first, and non-moralizing. Lead with the next action. Do not use streak-loss, shame, medical diagnosis, or generic motivational language.

| Element | Exact Copy |
|---|---|
| Scheduled primary CTA | `Start {day name}` |
| Plan activation heading | `Choose your starting plan` |
| Plan activation CTA | `Activate Full Body Foundation` |
| No comparable history | `First recorded session` |
| Rest day heading | `Rest day` |
| Rest day CTA | `Train anyway` |
| Active session entry | `Resume workout` |
| Set completion | `Complete Set {N}` |
| Save busy | `Saving set…` |
| Save error action | `Set not saved · Retry` |
| Save error body | `Your values are still here. The set was not completed and rest did not start.` |
| Running rest | `RESTING · NEXT: SET {N} AT {target}` |
| Paused rest | `REST PAUSED · NEXT: SET {N} AT {target}` |
| Running resume | `Rest resumed: {mm:ss} remaining · next is working set {N}` |
| Expired rest | `Rest ended {elapsed} ago · working set {N} is ready` |
| Completed heading | `Workout complete` |
| Partial heading | `Workout saved` |
| Partial factual status | `Workout saved with {N} of {M} exercises` |
| Hold recommendation | `Repeat {load} next time` |
| Hold evidence | `You completed {set results}. One more repetition completes the range.` |
| Root failure | `Workout data could not be opened. Your saved data was not changed.` |
| Root failure action | `Retry opening workout data` |
| Notification denied heading | `Background rest alerts are off` |
| Notification denied body | `The in-app timer stays accurate. You can allow notifications from Android settings.` |
| Empty Calendar | `Calendar is not available yet` |
| Empty Library | `Library is not available yet` |
| Empty Progress | `Progress is not available yet` |
| Destructive confirmation | `Discard workout?` / `This ends the workout and marks it discarded. It cannot be resumed.` |

Preferred progression language:

- `Repeat`
- `Hold`
- `Ready to increase`
- `Try again when ready`
- `Consider a lighter target`

Avoid in narrative copy:

- `Behind`
- `Weak`
- `Streak lost`
- Claims of fatigue, injury, overtraining, or readiness.

The locked effort choice `Failed` remains an input label; do not reuse it as judgmental narrative copy.

---

## Interaction State Matrix

| Feature | Loading | Empty / First Use | Error | Success | Partial / Interrupted |
|---|---|---|---|---|---|
| Root shell | Immediate shell plus structured Today placeholders; tabs disabled | Not applicable | Disabled shell plus root failure content | Selected destination available | Hydration restores route from trusted source state |
| Today | Fixed plan/action/row skeletons | Full Body Foundation activation or Rest day | Root Retry and diagnostic code | Plan, Start, targets, comparable history | Resume banner with exercise/set/rest state |
| Intentional empty roots | Heading/body/action render directly | Phase-specific intentional empty state | Root error only | `Go to Today` works | Not applicable |
| Active Workout | Persisted state restoration; never generic spinner | Not applicable after session creation | Values remain; inline Retry appears below the set list | Commit, advance, Undo, then rest or next set | Explicit resume, paused rest, expired rest, finish later |
| Value editor | No full-screen loading; source rows may show fixed placeholders briefly | Manual remains available when no history source exists | Preserve current values; retry source read or continue Manual | Selected values return to active row | Sheet dismissal restores invoking focus |
| Set completion | `Saving set…`, no optimistic success | Not applicable | `Set not saved · Retry`; no rest/advance/haptic | Committed check, haptic, Undo, rest/next | Duplicate activation ignored; process restart restores incomplete set |
| Rest | Persisted timestamp calculation | Manual rest available | Notification failure is non-blocking; timer remains correct | Running/paused/skip controls | Resume, denied notifications, late notification, expired while inactive |
| Finish | Command progress only after explicit action | Zero-set confirmation | Preserve active session and offer Retry | Completed or Partial committed outcome | Finish later remains resumable when valid |
| Completion | Short derived-summary skeleton after commit | Not applicable | Session stays saved; retry derived summary | Metrics, effort, recommendation, next action | Actual partial counts; no inferred completion |
| Session detail | Fixed summary and exercise placeholders | Zero-set state explains actual outcome | Retry detail read; committed session remains intact | Read-only summary and sets | Resume only when valid |

---

## Responsive Contract

### Width Classes

| Class | Width | Shell | Content |
|---|---:|---|---|
| Compact | `< 600dp` | Bottom tabs | Single column |
| Medium | `600–839dp` | Bottom tabs | Main column plus optional adjacent context |
| Expanded | `≥ 840dp` | Navigation rail permitted | Two-pane roots; centered workout |

### Shell and Today

#### Compact

- One column.
- Plan heading, metadata, Start action, then context list.
- `16dp` horizontal inset.
- Bottom navigation spans the safe width.

#### Medium

- Primary planned-workout region remains first.
- Today context may occupy a second region only when the Start action remains visually dominant.
- `24dp` outer inset and `24dp` pane gap.
- Bottom navigation remains.

#### Expanded

- Optional navigation rail.
- Primary plan/action pane is `320–400dp`.
- Context pane consumes remaining readable width.
- `32dp` outer inset and `32dp` pane gap.
- No content stretches into unreadably long rows.

### Active Workout

- Compact: one column with inline set values and adjacent Complete/Skip actions; RestDock or final Finish may become sticky when active.
- Medium and expanded: current exercise, set rows, and any RestDock/final Finish remain centered in a maximum `720dp` column.
- Secondary history may appear beside the active column only when it does not separate active row actions or RestDock from current work.
- Active row actions, RestDock, and final Finish never move to a side rail or distant pane.
- Set completion and rest controls remain at least `48dp` at every width.
- Compact landscape reduces major gaps from `32dp` to `24dp` and section gaps from `24dp` to `16dp` before reducing any control dimension.

### Completion and Session Detail

- Compact: one editorial column.
- Medium: summary and exercise results may form two regions, but reading order remains summary then results.
- Expanded: maximum content width `960dp`; recommendation remains within the primary reading column.
- At large text, all classes revert to a single logical flow if two panes cannot preserve reading order and target size.

### Safe Areas and Rotation

- Header clears display cutouts and status bar.
- Sticky docks clear gesture navigation and software navigation bars.
- Sheets and numeric input remain visible above the software keyboard.
- Rotation preserves focused field, active set, entered values, scroll anchor, and rest state.
- No essential action relies on portrait-only placement.

---

## 200% Text Contract

- Support Android font scaling through 200% without clipping, overlap, marquee, or hidden required copy.
- Primary and secondary actions grow vertically; labels wrap instead of shrinking.
- Bottom navigation retains icon plus visible one-word label.
- `MetricSummary` groups stack vertically.
- Four effort controls become two columns or one column.
- Rest controls preserve one equal-width visual row. At large text, labels wrap within their own growing 48dp-or-taller controls; the row must not overlap or hide any action.
- The timer remains fully visible; its container grows and the next-target label wraps.
- Exercise names wrap before truncation.
- Secondary context moves below primary content.
- Sticky dock content may grow and scroll with the screen only if the primary action remains visible above the safe area; never place the primary action behind an internal horizontal scroller.
- At 200%, verify the longest Phase 1 strings, including `Set not saved · Retry`, `Activate Full Body Foundation`, and the expired-rest message.

---

## Accessibility Semantics

### Screen and Section Semantics

- Every route exposes one screen heading.
- Section headings use heading semantics where supported.
- On route entry, announce the screen title before content.
- Skeletons, decorative icons, and dividers are hidden.
- Do not merge an entire screen into one semantic node.

### Component Semantics

| Component | Role and Label Contract |
|---|---|
| Root tab | Tab role, visible name, selected/disabled state |
| Primary/Secondary action | Button role, visible label, disabled/busy state |
| Exercise row | Button only if opening detail/suggestion; compound label in name-target-history-recommendation order |
| Value control | Button or adjustable role with set index, field name, current value, and unit |
| Set status | Text/image semantics only; never button semantics |
| Complete Set | Button plus custom accessibility action `Complete current set` |
| Countdown | Timer label with current remaining duration; no per-second live updates |
| Rest controls | Buttons labelled `Subtract 15 seconds from rest`, `Pause rest`, `Resume rest`, `Add 15 seconds to rest`, `Skip rest` |
| Undo | Button labelled `Undo completed set`; hint includes remaining availability |
| Effort choice | Radio option semantics with selected state |
| Recommendation decision | Buttons that state effect: `Use this target next time` and `Keep current target` or `Choose another target` |
| Confirmation sheet | Modal semantics, heading, consequence, and focus trap |

### Live Regions

Use polite announcements for:

- `Set {N} completed.`
- `Rest started for {duration}.`
- `Rest skipped. Working set {N} is ready.`
- `Rest ended. Working set {N} is ready.`
- `Set not saved. Your values are unchanged.`
- `Workout saved as completed.`
- `Workout saved as partial.`
- `Target updated for next time.`

Do not announce timer ticks, skeleton changes, decorative color changes, or query refreshes.

### Focus Restoration

- Opening a sheet moves focus to its heading.
- Dismissing a sheet restores focus to the invoking control.
- After a committed set with no rest, focus moves to the next active set's first value control.
- After a committed set with rest, focus moves to the countdown heading.
- After Retry fails, focus remains on the Retry action and announces the failure once.
- After Retry succeeds, normal committed focus behavior applies.
- Returning from background does not steal focus until hydration determines the authoritative state.
- Back from session detail restores focus to `View workout details`.

### Keyboard and D-pad

- Every interactive element is reachable without touch.
- Focus order follows visible top-to-bottom, left-to-right hierarchy.
- `Enter` and `Space` activate the focused action.
- D-pad arrows move through set values, adjacent row actions, rest controls, and secondary actions without trapping focus.
- There are no swipe-only, long-press-only, drag-only, or timing-dependent required actions.
- The eight-second Undo action remains a normal reachable button; expiry is time-based, but basic correction is later-phase scope.
- Visible focus ring uses `focusRing`, minimum `2dp`, and at least `3:1` contrast.
- Volume buttons are never remapped.

---

## Non-Color and Reduced-Motion Contract

- Committed completion uses check icon, `Completed` text/semantics, and optional haptic in addition to green.
- Current set uses position, label, and outline in addition to color.
- Timer attention uses timer/warning icon and explicit ended text in addition to amber.
- Save errors use explanatory text, error icon, and Retry in addition to red.
- Destructive actions use a confirmation title and consequence, not color alone.
- Reduced motion removes position movement, spring, bounce, and scale.
- Haptics can be disabled without losing visible or spoken confirmation.
- Notification denial never removes in-app timer truth.

---

## Loading and Error Contracts

### Loading

- Root shell appears immediately.
- Skeleton dimensions match final content to prevent layout shift.
- Skeleton blocks use `surfaceSubtle` and do not pulse under reduced motion.
- Active Workout restores persisted state and may show a static hydration placeholder only within exact content slots; never replace the route with a generic spinner.
- Completion may show a short derived-summary skeleton only after the committed workout state is visible.

### Root Failure

`RootFailureState`:

- Heading: `Workout data could not be opened`
- Body: `Your saved data was not changed. Try again.`
- Primary: `Retry opening workout data`
- Secondary disclosure: `View diagnostic code`
- Diagnostic display: bounded correlation code and error category only; never raw SQL, parameters, notes, set payloads, secrets, or file content.

Tabs remain visible but disabled. Phase 1 does not expose backup/restore UI.

### Local Read Failure

For Today, completion summary, or session detail:

- Preserve stable navigation and already committed outcome.
- State what failed, what remains safe, and what action retries.
- Use a specific retry label for the failed read, such as `Retry workout summary` or `Retry workout details`.
- Never replace a committed workout with an error page.
- Never infer retryability from raw message text; render actions from typed error metadata.

### Set Save Failure

This is the highest-priority local error:

- Entered values remain.
- Active set does not advance.
- No committed icon, haptic, rest, Undo, or notification appears.
- Inline Retry replaces the failed row's normal completion action.
- Retry is the dominant action.
- `Edit values` and `Finish workout later` remain available.

---

## Approved Mockup Mapping

| Contract Area | Primary Reference | Required Interpretation |
|---|---|---|
| Today action hierarchy | `core-workout-flow.png`, panel 1 | Plan/day and Start action precede exercise context |
| Active set hierarchy | `core-workout-flow.png`, panel 2 | Exercise, target, active set, adjacent Complete/Skip, and one rest state |
| Completion and progression | `core-workout-flow.png`, panel 3 | Factual summary, optional effort, evidence-backed next target, explicit acceptance |
| Precision-instrument shell | `app-system-reference.png`, Today | Card-light canvas, cobalt primary action, consistent `Next target` rows |
| Active workout dark mode | `app-system-reference.png`, Active Workout | Dark semantic tokens, centered active work, mono numerals, bounded rest dock |
| Root navigation | `app-system-reference.png` | Today, Calendar, Library, Progress; selected destination uses cobalt |

Do not copy these mockup artifacts literally where they conflict with the contract:

- Do not use old `Plans` and `Exercises` root tabs; use `Library`.
- Do not keep root navigation visible in Active Workout.
- Do not treat rough grayscale borders or card density as final styling.
- Do not implement full Library or Progress content in Phase 1.
- Do not acknowledge completion before transaction commit.

---

## UI Considerations

Applicable state considerations resolved: 17 covered, 0 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution |
|---|---|---|---|
| Empty | Calendar, Library, Progress | ✅ covered | Each root has exact intentional empty copy and one route to Today |
| Empty | Today first use | ✅ covered | Full Body Foundation activation is the only Phase 1 starter choice |
| Empty | No comparable history | ✅ covered | Exercise row says `First recorded session`, never zero metrics |
| Zero | Workout outcome | ✅ covered | Zero working sets require explicit confirmation and retain zero-set status |
| One | Active set | ✅ covered | Exactly one incomplete working-set row is visually active |
| Many | Exercise and set rows | ✅ covered | Ordered lists use dividers and spacing; no nested card stack |
| Partial | Workout outcome | ✅ covered | Explicit partial confirmation and actual `{N}/{M}` counts |
| Loading | Root, Today, completion, detail | ✅ covered | Fixed-size structured placeholders preserve hierarchy |
| Error | Root database/migration | ✅ covered | Disabled shell, Retry, and redacted diagnostic disclosure |
| Error | Set save | ✅ covered | Values persist; no advancement/rest; exact inline Retry |
| Resume | Set/rest/process death | ✅ covered | Exact resumed, paused, expired, and failed-save messages |
| Overflow | Long exercise names and evidence | ✅ covered | Two-line wrap by default; no active-name truncation; large text reflows |
| Long text | 200% Android font scale | ✅ covered | Controls grow, panes collapse, metric/rest layouts stack |
| Input modes | Touch, keyboard, D-pad | ✅ covered | Shared actions, logical focus order, focus ring, no gesture-only control |
| Appearance | System, Light, Dark | ✅ covered | Accessible radio group, persisted explicit override, state-preserving update |
| Offline | Airplane-mode workout loop | ✅ covered | Local paths remain fully enabled with no generic degraded state |
| Reserved status | Manual visit, voided session | ✅ covered | Distinct read-only labels without Phase 3 mutation actions |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| shadcn official | None | Not applicable; React Native project and shadcn is not initialized |
| Third-party registries | None | No registry code permitted by this contract |

Lucide React Native is an icon dependency, not a component registry. Dependency selection and pinning must follow the Phase 1 stack and lockfile process.

---

## Visual QA Checklist

### Shell and Hierarchy

- [ ] Today, Calendar, Library, Progress appear in the locked order with visible labels.
- [ ] Active Workout hides root navigation at compact, medium, and expanded widths.
- [ ] Appearance offers System, Light, and Dark; explicit overrides persist without resetting workout state.
- [ ] Airplane mode leaves every Phase 1 workout action enabled and does not show a generic offline state.
- [ ] Today shows plan/day, Start action, then context; Start is visible before normal compact scrolling.
- [ ] Intentional empty tabs contain no fake metrics, disabled future controls, or generic `No data`.
- [ ] Android Back dismisses sheet, route, then root/exit in the locked order.

### Tokens and Visual Direction

- [ ] Source Sans 3 and IBM Plex Mono render with only approved weights.
- [ ] Numeric values use tabular mono numerals.
- [ ] Light and Dark screenshots use exact semantic tokens.
- [ ] Cobalt appears only on action, selection, links, and focus.
- [ ] Green, amber, and red each include non-color status cues.
- [ ] Root surfaces remain card-light with no nested cards or dashboard mosaic.
- [ ] Corners are `8dp` standard and `12dp` emphasized, not uniformly oversized.
- [ ] Icons use one outlined family and consistent `2dp` stroke.

### Today

- [ ] Loading skeleton matches final title, metadata, action, and row dimensions.
- [ ] First use shows only Full Body Foundation within Phase 1.
- [ ] Every exercise row places `Next target` consistently.
- [ ] No-history rows say `First recorded session`.
- [ ] Pending suggestion does not replace the current target.
- [ ] Rest day offers `Train anyway` without silently advancing schedule.
- [ ] Active session offers `Resume workout`.

### Active Workout

- [ ] Warm-up rows are full-size `W` rows and remain available for review after completion.
- [ ] Warm-up exclusion copy is visible and warm-ups never appear in working-set metrics.
- [ ] Warm-up and working-set rows use the same direct-value and adjacent Complete/Skip pattern.
- [ ] `Add warm-up` and `Add working set` create source-backed session rows; added working sets remain session-only.
- [ ] Exactly one working set is visually active.
- [ ] Row status marker is not a completion button.
- [ ] `Complete Set {N}` and `Skip Set {N}` are adjacent on the authoritative active row.
- [ ] Completion/skip actions and all rest controls meet `48dp`; completion remains `56dp`.
- [ ] Saving state shows no completion color, icon, haptic, rest, Undo, or advancement.
- [ ] Failure injection preserves values and shows `Set not saved · Retry`.
- [ ] Retry success follows the normal committed path.
- [ ] Undo remains visible and operable for eight seconds.

### Rest and Recovery

- [ ] Running, paused, skipped, and expired states match the contract.
- [ ] Countdown remains correct after backgrounding, rotation, process death, and relaunch.
- [ ] Resume and expired messages use actual persisted/timestamp-derived state.
- [ ] Notification denial leaves the in-app timer fully usable.
- [ ] Late/stale notifications do not alter UI truth.
- [ ] Manual `Start rest` is available from workout actions.

### Completion and Detail

- [ ] Completed and Partial headings and counts are factual.
- [ ] Completion uses duration, exercise count, working-set count, top set, total reps, and comparable change.
- [ ] Effort input is optional and does not block leaving completion.
- [ ] `8 / 8 / 7 at 60 kg` recommends repeating `60 kg` and aiming for `8 / 8 / 8`.
- [ ] Recommendation shows evidence, rule, proposed target, and explicit action.
- [ ] Current target remains unchanged until acceptance commits.
- [ ] Basic session detail is read-only except valid Resume; no Phase 3 correction/removal actions appear.
- [ ] Completed counts preserve `N/N (100%)` formatting.

### Adaptive Layout

- [ ] Compact portrait and landscape preserve action adjacency and safe areas.
- [ ] Medium retains bottom tabs and keeps Start/current workout primary.
- [ ] Expanded may use rail/two panes but keeps active work and dock centered together.
- [ ] At 200% text, no required copy clips or marquee-scrolls.
- [ ] At 200% text, metrics stack and rest controls wrap in logical order.
- [ ] Long active exercise names remain visible.
- [ ] Software keyboard does not cover numeric inputs or sheet actions.

### Accessibility and Input

- [ ] Every route has one announced screen heading.
- [ ] Exercise rows announce name, next target, history, change, and suggestion state in order.
- [ ] Set rows announce kind, index, planned value, actual value, and completion state.
- [ ] Countdown does not announce every second.
- [ ] Completion and errors use polite live regions.
- [ ] All icon-only actions have explicit labels.
- [ ] Sheets trap focus and restore it to the invoking control.
- [ ] Touch, Enter, Space, and D-pad share the same set command.
- [ ] Visible focus ring meets `3:1`.
- [ ] No required action is gesture-only, long-press-only, or drag-only.
- [ ] Reduced motion removes position, bounce, scale, and chart-style interpolation.

### Anti-Slop

- [ ] No purple or blue-purple gradient.
- [ ] No ornamental colored icon circles.
- [ ] No centered-everything layout.
- [ ] No decorative pills for static labels.
- [ ] No generic wellness or guilt copy.
- [ ] No aggregate kilogram-volume headline or global fitness/readiness score.

---

## Requirements Traceability

| Requirement | UI Contract Evidence |
|---|---|
| FOUND-01 | Offline-first shell and workout UI has no account/network dependency |
| FOUND-02 | Four root destinations; focused workout hides navigation |
| FOUND-07 | Exact precision-instrument tokens, typography, components, System/Light/Dark |
| FOUND-08 | Compact/medium/expanded layout and dock-adjacency rules |
| FOUND-09 | 200% text, keyboard/D-pad, logical focus, meaningful labels, reduced motion, non-color, `48dp` targets |
| WORK-01 | Full Body Foundation activation explicitly creates a personal copy |
| WORK-02 | Today hierarchy includes scheduled day, estimate, target, comparable history, suggestion state |
| WORK-03 | Scheduled, alternate, rest-day, and empty start paths without silent schedule advancement |
| WORK-05 | Value editor exposes Recommended, Last workout, Plan default, and Manual |
| WORK-06 | Full-size warm-up states and explicit analytic exclusion |
| WORK-07 | Single active-row Complete action and equivalent touch/keyboard/D-pad command |
| WORK-08 | No success, advancement, haptic, rest, or notification UI before commit |
| WORK-09 | Exact save failure and inline Retry with values preserved |
| WORK-10 | Eight-second reachable Undo |
| WORK-11 | Running/paused/expired rest with `−15`, Pause/Resume, `+15`, Skip |
| WORK-12 | Manual `Start rest` in workout actions |
| WORK-13/14 | Notification denial/late states remain non-authoritative |
| WORK-15 | Explicit set/rest/process-death recovery states |
| WORK-16/17 | In-progress, completed, partial, discarded, manual-visit, skipped-exercise, zero-set, and voided/Removed contracts; only in-scope Phase 1 transitions are actionable |
| WORK-18 | Factual completion, effort, recommendation, details, and next action |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved — `2026-08-15T16:57:34Z`
