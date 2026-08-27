---
phase: 2
slug: owned-library-and-planning
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-17
reviewed_at: 2026-08-17T14:44:38+08:00
---

# Phase 2 — UI Design Contract

> Canonical visual and interaction contract for Owned Library and Planning. The planner and executor must preserve all locked Phase 2 decisions, including the physical-review amendments, the repository-owned React Native design system, and the compact inline workout interaction proven in Phase 1.

---

## Contract Authority

This specification is pre-populated from:

1. `.planning/phases/02-owned-library-and-planning/02-CONTEXT.md`
2. `.planning/PROJECT.md`, including the accepted personal-use v1 assistive-technology scope boundary
3. `.planning/REQUIREMENTS.md` §Library and Planning
4. `.planning/ROADMAP.md` §Phase 2
5. `DESIGN.md`
6. `.planning/phases/01-trustworthy-workout-loop/01-UI-SPEC.md`
7. `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md`
8. `~/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md`
9. `~/.gstack/projects/gym_tracker/designs/system-review-20260815/app-system-reference.png`

Implementation precedence:

1. The phase boundary and decisions `D-01` through `D-67` in `02-CONTEXT.md`,
   including the physical-review amendment, subject only to the D-61
   evidence-semantics erratum below.
2. The accepted personal-use v1 assistive-technology scope decision in `PROJECT.md`.
3. `LIB-01` through `LIB-12` and the Phase 2 roadmap success criteria.
4. This UI contract.
5. `DESIGN.md` and the approved system reference for persistent visual treatment.

The approved system image is a hierarchy and styling reference, not pixel-final production art. Literal labels in `02-CONTEXT.md` override older mockup wording. No unanswered design question remains for this phase.

### D-61 Evidence-Semantics Erratum

For evidence and approval only, D-61's phrase that foreground expiry produces
enabled feedback "exactly once" means **at most one durably claimed eligible
platform-feedback attempt** per session/rest revision. Android tone and haptic
delivery are best-effort: process or adapter failure after the durable claim
may yield no audible or haptic effect, and retrying after that claim would risk
duplicate feedback. SQLite-authoritative timer and workout truth remains
unchanged by every platform outcome. This erratum supersedes only D-61's
physical-delivery implication; it does not weaken the default-on preferences or
the requirement to attempt each enabled modality when eligible.

---

## Phase Boundary

### Included

- The complete Library root with the visible `Plans | Exercises` switch and remembered last-opened section.
- Exercise browsing across at least 300 reviewed exercises, deterministic partial-name and alias search, pagination, filters, Favorites, Recent, origin, visibility, attribution, and unavailable-source states.
- Custom-exercise creation, editing, duplicate warning, explicit metric-profile selection, hiding, archiving, restoring, and future-only metric-profile migration.
- Six original starter templates, including the equipment-heavy Monday–Friday `Gym Body-Part Split`, with deterministic fit ordering, filters, detail, source notes, activation preview, user-owned copying, existing-copy choice, and template-update comparison.
- User-owned plan and day creation, draft state, rename, duplicate, reorder, edit, target configuration, schedule, archive, restore, and replacement flows.
- Weekday and Rotation scheduling, effective-date changes, overrides, rest days, `Repeat`, `Skip`, `Advance`, `Train anyway`, timezone choice, local-midnight behavior, and DST-safe calendar intent.
- All approved metric-profile presentation and inline workout input: load/reps, bodyweight reps, added load/reps, assisted reps, timed hold, fixed distance, fixed time, intervals, and unscored.
- Library, Today, Active Workout, completion, and detail states required to expose those plan and metric contracts.
- Content-pack update summaries and preserved `Unavailable` references.
- Completed working-set correction while the authoritative workout status is
  `in_progress`, as defined by D-63; it preserves later progress, the active
  pointer, and the current rest state.
- Compact, medium, expanded, 200% text, semantic labels, keyboard, D-pad, visible focus and restoration, reduced motion, non-color cues, and minimum `48 × 48dp` targets for every new surface.

### Excluded

- Calendar correction, finalized-session editing/correction, reversible session
  removal, and historical date editing. Completed working-set correction while
  the workout remains `in_progress` is included above; finalized-session
  correction remains Phase 3.
- Overall period analytics, charts, and the complete recommendation lifecycle.
- Backup, restore, CSV export, and public release.
- Permanent deletion of plans or exercises.
- Cross-profile historical conversion or aggregation.
- Automatic plan/template merging, automatic exercise substitution, or automatic target conversion.
- AI plan generation, opaque ranking, social/cloud features, and unlicensed exercise media.

The retired set editor and action dock remain excluded. Active Workout continues to use inline values plus adjacent `Complete` and `Skip` actions inside the shared `SetRow`; `Retry` remains directly below the set list when a save fails.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Repository-owned React Native theme and semantic primitives |
| Preset | Not applicable |
| Component library | None; preserve the manual Expo/React Native system |
| Icon library | Lucide React Native, outlined, `2dp` stroke |
| Interface font | Source Sans 3 |
| Numeric font | IBM Plex Mono with tabular numerals |
| Styling direction | Quiet, high-contrast precision instrument |
| Surface strategy | Card-light continuous canvas with editorial sections |
| Appearance | Existing `System`, `Light`, and `Dark` contract |
| Registries | None |

Do not initialize shadcn, add Radix, add a utility-class design layer, or introduce a parallel component system. Reuse `src/ui/theme`, `AdaptiveScreen`, and the shared components under `src/ui/components`.

### Visual Principles

- Lead with the next useful action, then factual state, then explanation.
- Library must be understandable from the `Plans | Exercises` switch, search, filters, and the section-specific create action.
- Use one continuous `canvas`; separate content with section headings, `24dp` spacing, and hairline dividers.
- Use a bounded `surface` only for a selectable starter/plan row, an explicit decision, a recoverable error, an impact preview, or a destructive confirmation.
- Do not nest cards or turn every plan attribute, metric, filter, or target into a tile.
- Filter chips, segmented choices, compact origin/status labels, and selected taxonomy values are the only pill-like treatments.
- Keep one dominant primary action per section or modal.
- Use literal state labels instead of color-only encoding: `Active`, `Draft`, `Archived`, `Unavailable`, and `Template update available`.
- Long plan, day, and exercise names wrap to two lines in rows and fully in detail/editor headings.
- Do not use gradients, decorative blobs, emoji decoration, ornamental icon circles, generic wellness copy, engagement badges, streak pressure, or global readiness/fitness scores.

---

## Spacing Scale

Declared values are the existing React Native `dp` tokens:

| Token | Value | Usage |
|-------|-------|-------|
| `space.1` | `4dp` | Icon/text gaps and compact status separation |
| `space.2` | `8dp` | Related controls, row metadata, and compact filter groups |
| `space.4` | `16dp` | Compact inset, form field separation, and bounded-surface padding |
| `space.6` | `24dp` | Section separation and medium inset |
| `space.8` | `32dp` | Major layout gaps and expanded inset |
| `space.12` | `48dp` | Empty-state or major pane separation |
| `space.16` | `64dp` | Maximum page-level breathing room |

Exceptions: none for layout spacing. The existing `48dp` minimum target, `56dp` primary action, `56–64dp` numeric control, `8dp` radius, `12dp` emphasized radius, and platform hairline are control dimensions, not spacing tokens.

### Sizing Contract

| Element | Contract |
|---|---|
| Interactive target | Minimum `48 × 48dp` |
| Primary action | Full width of its content region; minimum `56dp` high |
| Search field | Minimum `48dp` high; clear action remains a `48dp` target |
| Segmented option | Minimum `48dp` high; equal visual weight for `Plans` and `Exercises` |
| Filter chip | Minimum `48dp` touch target even when the visible capsule is smaller |
| Row | Minimum `64dp`; grows for wrapped names, alias text, and status |
| Reorder handle | `48dp` target; drag is supplemental to named move actions |
| Standard radius | `8dp` |
| Emphasized decision surface | `12dp` |
| Root horizontal inset | `16dp` compact; `24dp` medium; `32dp` expanded |
| Readable detail/editor width | Maximum `960dp` |
| Active-workout width | Existing maximum `720dp` |

---

## Typography

The rendered system remains limited to four sizes and two weights.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Supporting / label | `14sp` | `400` or `600` | `20sp` |
| Body / section heading | `16sp` | `400` or `600` | `22sp` |
| Screen heading / prominent target | `28sp` | `600` | `34sp` |
| Rest display | `52sp` | `600` | `56sp` |

### Token Usage

| Token | Family | Contract |
|---|---|---|
| `screenTitle` | Source Sans 3 | `28/34sp`, `600`; one route heading |
| `sectionTitle` | Source Sans 3 | `16/22sp`, `600`; editorial section headings |
| `body` | Source Sans 3 | `16/22sp`, `400`; instructions and required explanations |
| `bodyStrong` | Source Sans 3 | `16/22sp`, `600`; plan/day/exercise names and action labels |
| `secondary` | Source Sans 3 | `14/20sp`, `400`; supporting metadata only |
| `label` | Source Sans 3 | `14/20sp`, `600`; compact status, origin, and short uppercase labels |
| `targetValue` | IBM Plex Mono | `28/34sp`, `600`; prominent metric values |
| `displayTimer` | IBM Plex Mono | `52/56sp`, `600`; existing rest timer only |

Rules:

- Required instructions and the only expression of a state never use `secondary`.
- All plan targets, loads, reps, assistance, duration, distance, rounds, dates, and counts use tabular numerals.
- Units may use Source Sans 3 when visually separate; combined target strings use IBM Plex Mono.
- Do not add a smaller caption size for dense taxonomy. Wrap or move metadata instead.
- At 200% text, rows and actions grow vertically; multi-field targets stack rather than shrink.

---

## Color

### 60 / 30 / 10 Allocation

| Role | Light | Dark | Usage |
|------|-------|------|-------|
| Dominant (60%) | `#F6F7F5` | `#0F1214` | Continuous screen canvas |
| Secondary (30%) | `#FFFFFF`, `#EEF1F2` | `#171B1E`, `#20262A` | Inputs, segmented control, selected rows, previews, sheets |
| Accent (10%) | `#155EEF` | `#70A0FF` | Primary action, selected root navigation, selected `Plans | Exercises` state, selected filter state, actionable link text, and focus |
| Destructive | `#B42318` | `#FF746A` | Archive/remove/discard actions, validation failure, and destructive confirmation only |

Accent reserved for: the section-specific primary CTA, active root tab, active segmented option, selected filter values, focused controls, and explicit text links. It is not used for static headings, every tappable row, source labels, or decoration.

### Existing Semantic Tokens

| Token | Light | Dark | Phase 2 Usage |
|---|---|---|---|
| `canvas` | `#F6F7F5` | `#0F1214` | Root and focused-route background |
| `surface` | `#FFFFFF` | `#171B1E` | Decision, preview, sheet, and selected bounded row |
| `surfaceSubtle` | `#EEF1F2` | `#20262A` | Search, filters, form fields, skeletons, segmented controls |
| `textPrimary` | `#171A1C` | `#F4F6F7` | Primary copy |
| `textSecondary` | `#5D656B` | `#AEB7BD` | Supporting facts |
| `divider` | `#C9CED2` | `#394146` | Hairlines and field borders |
| `action` | `#155EEF` | `#70A0FF` | Reserved accent |
| `actionPressed` | `#004EEB` | `#8DB3FF` | Pressed primary action |
| `onAction` | `#FFFFFF` | `#071225` | Content on primary action |
| `completed` | `#1F7A4D` | `#56C88A` | Committed activation/save/restore confirmation only |
| `timerAttention` | `#B54708` | `#FFB45C` | Duplicate warning, schedule impact, unavailable/template update caution |
| `destructive` | `#B42318` | `#FF746A` | Error or destructive action |
| `errorSurface` | `#FEE4E2` | `#3A1C1B` | Save, load, import, or migration failure |
| `focusRing` | `#155EEF` | `#9CBFFF` | External-input focus |

Pair semantic color with text plus an icon, shape, or explicit state label. Normal text meets `4.5:1`; large text and controls meet at least `3:1`. Disabled controls retain readable labels and expose disabled semantics.

---

## Iconography and Motion

### Iconography

- Use Lucide React Native only, at `24dp` by default or `20dp` inline, with `2dp` stroke.
- Required Phase 2 mappings:
  - Search: `Search`
  - Create: `Plus`
  - Filters: `SlidersHorizontal`
  - Favorite / not favorite: `Star` with selected state, not color alone
  - Reorder: `GripVertical`
  - Edit: `Pencil`
  - Duplicate: `Copy`
  - Schedule: `CalendarClock`
  - Archive / restore: `Archive` / `ArchiveRestore`
  - Hide: `EyeOff`
  - Repeat / skip / advance: `Repeat2` / `SkipForward` / `FastForward`
  - Warning: `TriangleAlert`
  - Diff/update: `FileDiff`
- Icon-only controls remain `48 × 48dp` and have explicit accessibility labels.
- Icon-only controls remain `48 × 48dp` and have explicit semantic labels.
- The Library header create icon is labelled `Create plan` in Plans and `Create custom exercise` in Exercises.
- Origin and lifecycle labels are text-first; do not create decorative icon badges for them.

### Motion

| Transition | Standard | Reduced Motion |
|---|---|---|
| `Plans | Exercises` switch | Immediate content replacement with `140ms` opacity | Immediate |
| Filter result update | Direct list update; no item cascade | Same |
| Detail push / sheet | Platform fade/translation | Fade only |
| Reorder | Direct row displacement while dragging; saved order confirms after commit | No animated displacement; named move actions remain |
| Save / activation confirmation | `140ms` state acknowledgement after commit | Immediate |
| Two-pane selection | `140ms` detail opacity | Immediate |

Never use spring bounce, scale animation, parallax, count-up metrics, or celebratory confetti. Search and filter results never animate from zero. No success treatment appears before the source transaction commits.

---

## Information Architecture

### Root and Route Contract

- Keep exactly four roots in the existing order: Today, Calendar, Library, Progress.
- Replace the current Library placeholder at `app/(tabs)/library.tsx`; do not add a fifth root.
- Library opens Plans on first use. Persist only the last opened `Plans | Exercises` section across launches.
- Preserve each section's query, filters, selected row, and scroll position while opening details or switching sections during the running app.
- Reset those transient query/filter/scroll states after full process restart.
- Compact detail and editor flows push onto the Expo Router stack and Back returns to the exact Library state.
- Medium and expanded roots use list/detail panes where room permits. Selecting a row updates the detail pane without losing list position.
- Editor and confirmation sheets trap focus and restore it to the invoking row/action when dismissed.

### Library Header

Visual order:

1. `ScreenHeader` with title `Library` and a section-specific create `IconAction`.
2. Equal-width segmented control labelled exactly `Plans` and `Exercises`.
3. Section search field: `Search plans` or `Search exercises`.
4. Filter summary/actions.
5. Editorial list content.

The create action changes with the selected section and never opens an ambiguous mixed-content menu.

---

## Library — Plans

### Default Browse

With no plan search, render sections in this exact order:

1. `Active Plan`
2. `My Plans`
3. `Starter Plans`

`Active Plan` shows at most one plan because exactly one plan schedule can be active. The row includes plan name, `Active`, schedule mode, next day, and the next local schedule opportunity. If none is active, show quiet inline copy `No active plan` plus the primary action `Choose a starter plan`; do not fabricate an empty plan card.

Focal anchor: the `Active Plan` row is the strongest visual anchor when present. When no plan is active, `Choose a starter plan` becomes the strongest visual anchor; `My Plans` and `Starter Plans` remain subordinate editorial sections.

`My Plans` contains user-owned copied and created plans. Each row shows:

- Plan name.
- `Draft`, `Archived`, or inactive state when applicable.
- Day count.
- Schedule summary or `Not scheduled`.
- Exact validation reason under an invalid `Draft`.
- `Template update available` when a source template has changed.

`Starter Plans` contains the six immutable templates:

1. Full Body Foundation
2. Upper / Lower
3. Push / Pull / Legs
4. Minimal Equipment Full Body
5. Strength + Conditioning
6. Gym Body-Part Split

Each starter row shows goal, experience, days per week, required equipment, estimated duration, and a one-sentence `Why this fits` explanation when it ranks as a fit.

### Plan Search and Filters

- Plan search filters by normalized plan name without changing ownership.
- Preserve section grouping in search results: active match, owned matches, then starter matches.
- Starter fit ranking remains deterministic from Goal, Experience, and available Equipment. Recommended fits appear first with `Why this fits`; all remaining templates follow in stable original template order. Stable template order also breaks fit ties.
- Starter filters are optional and combinable: `Goal`, `Experience`, `Days per week`, and `Equipment`.
- Expose one exact `Clear filters` action.
- Archived owned plans are excluded by default and exposed through a `Visibility` filter.
- Search/filter state is section-local and follows the running-app preservation contract.

### Plan Detail

Plan detail uses editorial sections, not attribute tiles:

1. Identity and lifecycle: name, origin, `Active` / `Draft` / `Archived`.
2. Goal, experience, equipment, estimated duration.
3. Schedule summary.
4. Ordered days and exercises.
5. Progression summary.
6. Source notes or copied-template attribution.
7. Actions appropriate to ownership.

Bundled starter detail is read-only and offers `Activate plan`. User-owned detail offers `Edit plan`, `Edit schedule`, `Duplicate plan`, and `Archive plan` or `Restore plan`. The currently active plan also exposes schedule status before secondary lifecycle actions.

### Starter Activation

Selecting `Activate plan` opens a confirmation preview that shows:

- Goal.
- Experience.
- Equipment.
- Estimated duration.
- Every day and ordered exercise.
- Metric type for every exercise.
- Suggested schedule.
- Progression summary.
- Source notes.
- Start date, defaulting to today and editable.
- Preselected `Weekday` or `Rotation`, with permission to switch and edit bindings.

The preview commits only after the primary action `Activate plan`.

If the starter already has user-owned copies, show the copies with their names, active/inactive state, and last schedule summary. Require one explicit choice:

- `Reactivate existing copy`
- `Create another copy`

Never silently choose a copy.

Activating or switching:

- Creates or selects a user-owned copy.
- Marks its schedule active.
- Keeps the previous user-owned plan and schedule state but marks that prior schedule inactive.
- Does not reset or archive the previous plan.

If a workout is in progress, replace activation controls with the explanation `Finish the current workout before switching plans.` and exact actions `Resume`, `Finish partial`, and `Discard`. Plan switching remains blocked until the workout resolves.

### Template Updates

`Template update available` opens a source-to-current diff grouped by days, exercises, targets, schedule defaults, and progression policies. Existing copies remain unchanged. The only adoption action is `Create new copy`; it creates another independent copy for comparison and leaves the current copy intact.

---

## Library — Exercises

### Default Browse

With no exercise query or filters, render these exact sections:

1. `Favorites`
2. `Recent`
3. `All Exercises`

Focal anchor: the search field is the first visual anchor and the exercise result list is the second. Section labels, filters, and create actions support discovery without competing with search or the rows.

`Favorites` contains explicit owner-starred exercises. `Recent` contains at most ten unique exercises ordered by the latest completed working-set exposure in a completed or partial session. Opening or selecting an exercise never changes Recent.

When Favorites or Recent has zero rows, keep its section heading and show one quiet line:

- `No favorites yet`
- `No recent exercises yet`

These compact section empties do not replace `All Exercises`.

### Search

- Placeholder and semantic label: `Search exercises`.
- Search is live, case-insensitive, punctuation-safe, and debounced `100–150ms`.
- Clearing the query clears result state immediately.
- Return pages of 30 rows; use a visible `Load more exercises` action rather than infinite-scroll-only discovery.
- Relevance order is exact canonical-name match, canonical-name prefix, alias exact/prefix, then remaining normalized partial matches.
- Stable alphabetical canonical name and stable exercise ID break ties.
- Favorites and recency never outrank text relevance.
- When an alias caused the match, show the canonical name first and exact secondary copy `Matched alias: {alias}`.
- Search results use one `Results` section; do not mix them into Favorites/Recent.

### Filters

Exercise filters:

- Exercise type.
- Muscle group.
- Equipment.
- Origin.
- Visibility.
- Recent use.
- Favorite status.

Combination rule:

- OR within one taxonomy category.
- AND across categories.

Show active values as removable filter chips and provide one exact `Clear filters` action. `Visibility` defaults to active content. Archived custom exercises, hidden exercises, and unavailable built-ins are excluded by default and reachable through explicit visibility values. `Unavailable` is a distinct visibility value.

### Exercise Row

Extend the shared `ExerciseRow` treatment rather than creating a parallel visual language. A Library row may show:

- Canonical exercise name.
- `Matched alias: …` when applicable.
- Exercise type and one concise equipment/muscle summary.
- Compact `Built-in` or `Custom` origin only when origin distinguishes nearby results or an origin filter is active.
- `Archived` or `Unavailable` when applicable.
- Favorite action with label `Add {name} to favorites` or `Remove {name} from favorites`.

The row itself opens detail. Favorite is a separate accessible row action, does not trigger row navigation, and does not alter search relevance.

### Exercise Detail

Detail sections:

1. Canonical name and lifecycle state.
2. Aliases.
3. Type, movement classification, muscles, equipment.
4. Plain-language metric profile with example.
5. Default rest, units, equipment increment, instructions, and progression policy when present.
6. Working-set `Best`, `Average`, and `Last`, segmented by metric-profile version.
7. Source pack, revision, license, attribution, and unavailable status.
8. Ownership-appropriate actions.

Bundled exercises:

- Can be favorited or hidden.
- Cannot be edited in place.
- Offer exact action `Create custom copy`.

Custom exercises:

- Offer `Edit exercise`, `Hide exercise` / `Show exercise`, `Archive exercise`, and `Restore exercise` as appropriate.
- Phase 2 offers no permanent delete.

An `Unavailable` built-in remains readable from existing plan/history references and explicit filter results. Show why it cannot be added to a new plan, preserve attribution, and offer no automatic replacement.

### Hide and Show

`Hide exercise` is available for built-in and custom exercises. Hiding:

- Excludes the exercise from default discovery and new plan selection.
- Preserves source or custom ownership, Favorites, existing plan references, and history.
- Keeps the exercise reachable through the explicit `Hidden` Visibility filter.
- Offers exact action `Show exercise` from detail.

Hide/show is a reversible visibility preference, not archive and never a source-row edit. Hidden rows reached through management filters cannot be added to a plan until shown.

---

## Custom Exercise Contract

### Create and Edit Form

The form uses the explicit primary action `Save exercise`; no field writes on blur or debounce.

Required:

- `Name`
- `Exercise type`
- `Metric profile`

Optional:

- Primary and secondary muscles.
- Equipment.
- Default rest.
- Unit.
- Equipment increment.
- Instructions.
- Progression policy.

No metric profile is preselected. The owner must explicitly choose one of the nine profiles. If no progression policy is configured, show and save `Hold / manual decision`.

### Metric Profile Choices

Each option shows a plain-language name, example input, and comparison behavior:

| Profile | Example | Comparison explanation |
|---|---|---|
| `Load + reps` | `60 kg × 8` | Higher completed load wins; ties use more reps |
| `Bodyweight reps` | `Bodyweight × 12` | More completed reps wins |
| `Added load + reps` | `BW + 10 kg × 8` | Higher added load wins; ties use more reps |
| `Assisted reps` | `20 kg assist × 8` | Lower assistance meeting the target wins; ties use more reps |
| `Timed hold` | `45 sec` | Longer completed duration wins |
| `Fixed distance` | `2 km in 12 min` | Faster completed time for the same planned distance wins |
| `Fixed time` | `2.4 km in 12 min` | Greater distance for the same planned duration wins |
| `Rounds / intervals` | `6 rounds · 30 sec work` | Uses the plan-authored comparator for the same protocol |
| `Mobility / unscored` | `Completed` | Completion only; no performance ranking |

### Duplicate Warning

When normalized name plus similar metric/equipment indicates a likely duplicate:

- Keep all entered values.
- Show heading `Similar exercises already exist`.
- List each existing match with name, origin, metric, and equipment.
- Offer `Review existing exercise` and `Create anyway`.
- Creation proceeds only after explicit `Create anyway`; the warning is not a hard block.

### Dirty Editor

Leaving any dirty plan, day, target, schedule, or exercise editor opens one confirmation with the exact actions:

1. `Save changes`
2. `Discard`
3. `Keep editing`

`Save changes` validates and commits the whole edit atomically. If validation fails, remain in the editor, focus the error summary, and move focus to the first invalid field on request. `Discard` restores the last committed values.

### Archive and Restore

Archiving a custom exercise shows affected plan names and occurrences before confirmation. Primary destructive action: `Archive exercise`. Body: `This removes the exercise from new selection. Existing plans remain runnable and show Archived until you restore or replace it.`

After commit:

- New selection excludes it.
- Existing plans retain it with exact `Archived` label.
- Detail offers `Restore exercise`.

No permanent delete action is shown.

---

## Metric-Profile Migration

Changing a used custom exercise's profile is a distinct future-only migration flow, not an ordinary picker save.

### Entry and Blocking

- If any active workout snapshot uses the exercise, disable migration and show `Finish the current workout before changing this metric profile.`
- Ordinary non-structural exercise edits may continue where safe.

### Migration Steps

1. Choose the new profile; show old and new examples and comparison behavior.
2. List every affected future plan target grouped by plan and day.
3. Require valid replacement defaults for every occurrence. Never infer cross-profile values.
4. Require a compatible progression policy or explicit `Hold / manual decision`.
5. Review the complete before/after migration.

Before final save, show:

`Future plan targets will use the new metric profile. Completed workouts, the current exercise identity, and historical observations will not change. History remains separated by metric-profile version. Pending suggestions that no longer apply will be removed.`

Primary action: `Save profile change`.

This action is one-way for discarded future target contracts. The confirmation must state that another explicit migration would be required to change back. It must not imply that old future targets can be reconstructed.

After commit:

- Historical observations stay immutable.
- `Best`, `Average`, `Last`, and comparable exposure are separated by profile version.
- Incompatible pending recommendations are invalidated.
- Incompatible progression policies are replaced only by the reviewed new policy or manual Hold.
- The next comparable exposure begins a fresh baseline.

---

## Plan and Day Editing

Plan, day, target, exercise, and schedule forms use the explicit primary actions `Save plan`, `Save day`, `Save target`, `Save exercise`, and `Save schedule`, respectively. Field blur, input debounce, section navigation, and reordering update only the in-memory draft; they never persist source facts independently. Each noun-specific save validates the complete editor draft and commits it atomically in one transaction.

### Create My Own

Exact entry label: `Create my own`.

First step contains:

- `Plan name`
- `First day name`

Primary action: `Create draft`.

The committed result is an explicit inactive draft and opens the new day editor. A draft may contain one named empty day. Until at least one day contains an exercise with valid targets:

- Show exact `Draft` label.
- Show exact missing requirement, for example `Add at least one exercise with valid targets before scheduling this plan.`
- Disable `Schedule` and `Activate`.
- Keep the disabled reason visible; do not rely on disabled styling alone.

### Plan Editor

Plan fields:

- Name.
- Goal.
- Description.
- Experience.
- Equipment.
- Estimated duration.
- Ordered days.
- Schedule defaults.
- Source notes for copied plans.

Day rows show name, exercise count, estimated duration, and order. Actions: edit, duplicate, reorder, and remove. All plan-graph edits remain draft state until `Save plan` commits the whole validated graph; a focused day editor uses `Save day` and commits its complete validated day draft atomically.

### Day Editor

A day contains:

- Day name.
- Ordered exercises.
- Per-occurrence target.
- Optional warm-ups.
- Working-set count.
- Profile-appropriate target values.
- Rest duration.
- Progression policy.
- Equipment increment.
- Optional notes.

Adding an exercise opens the searchable Exercise Library selector with current search/filter behavior. `Unavailable` and archived exercises are excluded from new selection.

### Reorder

- Show a visible drag handle.
- Expose accessible `Move up` and `Move down` actions for each movable day/exercise.
- Movement changes only the local draft.
- Persist order only with the containing editor's `Save plan` or `Save day` action.
- Show visible position feedback after the move, such as `Bench Press moved to 2 of 5`.

### Duplicate

`Duplicate plan` previews that days, exercise order, targets, warm-ups, rest, policies, and schedule defaults will be copied into fresh user-owned identities. Primary action: `Create duplicate`.

The duplicate:

- Is independent.
- Is inactive.
- Opens in detail/edit state after commit.
- Does not alter the source plan or active schedule.

### Active and In-Progress Editing

- The active plan may be edited while no workout is running.
- Future-facing changes commit atomically.
- Preserve the active schedule unless a structural change requires schedule-impact review.
- If an in-progress workout uses the plan, show exact notice `Current workout is unaffected`.
- Immutable workout snapshots permit safe non-schedule edits.
- Block only structural changes that require restructuring the active schedule until the workout resolves.

### Remove Day

Removing a day with active schedule bindings opens a schedule-impact preview. Before `Save plan`, require one explicit outcome:

- Replace the binding with another day.
- Remove the binding.
- Apply the structural change from a chosen effective local date.

Do not save until all affected bindings have a valid choice. The confirmation uses `Remove day` and names the affected schedule dates/bindings.

### Archive Plan

`Archive plan` is reversible and never permanent deletion. If active, require another plan/schedule outcome before archive. After commit, exclude it from default My Plans and offer `Restore plan` through Visibility filters.

---

## Exercise Replacement

Replacing an exercise occurrence:

- Shows metric-profile-compatible exercises first.
- Never claims that compatibility means historical comparability.
- Requires explicit review of target, warm-ups, rest, and progression.
- Never infers replacement values or migrates history.

Scope choices use exact labels:

- `This occurrence`
- `All occurrences in this plan`

Show an impact preview listing every affected day and occurrence before `Save replacement`. Existing sessions and snapshots are unchanged.

---

## Schedule Contract

### Initial Setup

Activation preselects the starter's suggested `Weekday` or `Rotation` mode and bindings. The owner may change:

- Start date, defaulting to today.
- Mode.
- Weekday bindings or rotation order.
- Rest-day bindings.
- Schedule timezone.

The schedule is not active until the activation confirmation commits.

### Weekday Mode

- Each plan day binds to selected local weekdays in the stored schedule timezone.
- Unbound weekdays are explicit rest days.
- Skip for a weekday records an explicit skipped opportunity for that local date only.
- Skip never moves the workout or removes a recurring binding.
- Missed opportunities show exact label `Planned but not completed`.
- Missed opportunities do not carry forward, become skipped automatically, or block later plan days.

### Rotation Mode

- Show the ordered plan days and current pointer.
- Completing the currently scheduled rotation day advances automatically.
- Exact actions:
  - `Repeat` keeps the current pointer.
  - `Skip` records an explicit skipped opportunity and advances.
  - `Advance` moves the pointer without creating a workout.
- Each action opens a concise before/after confirmation naming the current and next day.

### Date Override

A local date may have exactly one effective override:

- Another plan day.
- `Rest day`.
- Explicit `Skip`.

Replacing a pending override requires confirmation and shows old/new values. A consumed override is immutable; the UI labels it `Used` and offers no edit control. Later intent requires a new explicit action on another eligible date.

### Train Anyway

On a rest day or when choosing another workout, `Train anyway` offers:

- Next planned day.
- Choose another plan day.
- Start empty workout.

Training another day or an empty workout does not alter schedule bindings or the rotation pointer. In Rotation mode, expose an unchecked explicit choice `Advance rotation after this workout`. The owner must select it; never default it on.

### Later Schedule Changes

Every later schedule edit shows:

- `Before`.
- `After`.
- `Effective date`, defaulting to today.
- Stored schedule timezone.

Primary action: `Save schedule`.

Copy: `This change applies from the selected effective date. Earlier dates, sessions, planned opportunities, and history will not change.`

No schedule edit silently rewrites prior dates or facts.

### Local Date, Midnight, DST, and Timezone

- A workout remains attached to its start local date if it crosses midnight. Completion screens and later schedule state must not move or split it.
- Weekday intent is displayed from local date and weekday in the stored schedule timezone.
- DST may change an instant but never the displayed intended calendar day.
- On device-timezone change, preserve the stored timezone and prompt once with exact actions:
  - `Follow device timezone from today`
  - `Keep current timezone`
- Show both timezone names and state that accepted change is prospective. Prior local dates remain unchanged.

---

## Metric Presentation and Active Workout

### Compact Target Strings

Every exercise context row uses the exact label `Next target` in the same position.

| Profile | Display |
|---|---|
| Load + reps | `60 kg × 8` |
| Bodyweight reps | `Bodyweight × 12` |
| Added load + reps | `BW + 10 kg × 8` |
| Assisted reps | `20 kg assist × 8` |
| Timed hold | `45 sec` |
| Fixed distance | `2 km in 12 min` |
| Fixed time | `2.4 km in 12 min` |
| Rounds / intervals | `6 rounds · 30 sec work` |
| Mobility / unscored | `Complete` |

### Best, Average, Last

Working sets only:

| Profile | Best | Average | Last |
|---|---|---|---|
| Load + reps | Highest load; ties use more reps | Mean load and mean reps, separately labelled | Final completed working set |
| Bodyweight reps | Highest reps | Mean reps | Final completed working set |
| Added load + reps | Highest added load; ties use more reps | Mean added load and mean reps | Final completed working set |
| Assisted reps | Lowest assistance meeting target; ties use more reps | Mean assistance and mean reps | Final completed working set |
| Timed hold | Longest duration | Mean duration | Final completed working set |
| Fixed distance | Fastest completed time for equal planned distance | Mean completed time | Most recent completed effort |
| Fixed time | Greatest distance for equal planned duration | Mean distance | Most recent completed effort |
| Rounds / intervals | Most work under the plan comparator for identical `protocolId` | Mean completed rounds and work | Final completed interval/round |
| Mobility / unscored | Completion only | `Not applicable` | Most recent completion |

Never compare or aggregate across metric-profile versions. When an exercise has multiple versions, show a version-labelled selector such as `Current profile` and `Previous profile`; default to current and explain that histories are separate.

### Rounding

- Loads and assistance use configured display precision.
- Repetition and round averages show at most one decimal place.
- Durations show whole seconds below ten minutes and `mm:ss` at or above ten minutes.
- Distances use configured unit precision.
- Ties are resolved by the profile comparator and then stable timestamp/ID order; UI never invents a winner.
- `Not applicable` is used instead of `0` where a metric has no average.

### Comparable Exposure Explanation

Where history is absent or incomparable, show one of:

- `No history yet`
- `No comparable history for this target`
- `New baseline for this metric profile`

Comparable exposure requires the same exercise identity and profile version, plus:

- Same planned distance for Fixed distance.
- Same planned duration for Fixed time.
- Same immutable protocol for Rounds / intervals.
- Completion history only for Mobility / unscored.

### Inline SetRow Extension

Extend the existing `SetRow`; do not add a separate set editor sheet or action dock.

| Profile | Inline fields |
|---|---|
| Load + reps | Load and reps |
| Bodyweight reps | Reps |
| Added load + reps | Added load and reps |
| Assisted reps | Assistance and reps |
| Timed hold | Duration |
| Fixed distance | Fixed distance plus actual duration |
| Fixed time | Fixed duration plus actual distance |
| Rounds / intervals | Completed rounds and completed work for the immutable protocol |
| Mobility / unscored | Completion state only |

Contracts:

- Fixed planned values remain labelled and non-editable inside the active snapshot.
- Units are fixed suffixes, never free text.
- Current input, source shortcuts, `Complete`, and `Skip` remain adjacent within each row.
- Multi-field layouts stack at 200% text.
- Save failure preserves entered values and shows `Retry` directly below the set list.
- No completion, advancement, rest, haptic, or success color appears before commit.
- Warm-ups stay explicitly excluded from records and progression.

---

## Adaptive Layout

### Width Classes

| Class | Width | Library | Editor |
|---|---:|---|---|
| Compact | `<600dp` | Switch, search, filters, then one list; detail pushes | Plan list, day list, and editor use separate routes |
| Medium | `600–839dp` | List plus optional detail pane; bottom tabs | Day list and selected editor may share two panes |
| Expanded | `≥840dp` | Root rail permitted; stable list left and detail right | Day list left, selected day/target editor right |

### Pane Rules

- Primary list remains at least `320dp` wide.
- Detail/editor is constrained to `960dp` readable width.
- At large text, collapse two panes before shrinking controls or clipping copy.
- The create action, search, filters, and current section remain in the list pane.
- In two-pane layouts, Back from a nested editor closes the editor before leaving Library.
- Active Workout remains centered within `720dp`; Phase 2 planning work does not move Complete/Skip or RestDock into a side pane.

### Safe Area and Keyboard

- Header clears status bar and cutouts.
- Bottom actions and sheets clear gesture/navigation bars.
- Forms scroll the focused field above the software keyboard.
- Rotation preserves draft values, focused field, selected row/day, query, filters, and scroll anchor.

---

## Accessibility and Focus

- Every route has one screen heading; editorial sections use heading semantics.
- `Plans | Exercises` exposes a labelled two-option tab/segmented control with selected state.
- Search fields have semantic labels that include section and purpose.
- Filter controls expose selected-value count and the OR-within/AND-across behavior as visible help text and semantic metadata.
- Result rows expose semantic labels containing canonical name, alias match if any, origin/status when relevant, taxonomy summary, and favorite state.
- Plan rows expose semantic labels containing plan name, active/draft/archive state, schedule summary, and day count.
- A favorite row action is separately focusable and never causes row navigation.
- Loading skeletons and decorative icons are not focusable.
- All actions are reachable by touch, keyboard, and D-pad.
- Enter and Space invoke the same command as touch.
- Drag is never the only reorder method; `Move up` and `Move down` are mandatory.
- No required action is swipe-only, long-press-only, or color-only.
- Visible focus uses at least a `2dp` `focusRing`.
- Modal sheets contain keyboard/D-pad focus and restore focus to the invoking control on dismiss.
- Validation provides an error summary plus inline field messages. Focus moves to the summary when a noun-specific save action fails validation.
- Disabled `Schedule`, `Activate`, or migration actions expose disabled semantics and a visible reason.
- At 200% text, action labels wrap, rows grow, filters reflow, and no required action moves behind horizontal scrolling.
- `Unavailable`, `Archived`, `Draft`, `Active`, and update states always have text labels in addition to color/icon treatment.

---

## Component Inventory

### Reuse and Extend

| Component | Phase 2 Contract |
|---|---|
| `AppTabs` | Preserve four-root shell and selected Library state |
| `AdaptiveScreen` | Apply compact/medium/expanded list/detail and editor layouts |
| `ScreenHeader` | Library/detail/editor title, Back, and one section-specific create/action group |
| `SectionHeader` | Active/My/Starter and Favorites/Recent/All headings |
| `PrimaryAction` | One explicit verb + object action per section/sheet |
| `SecondaryAction` | Filter clearing, alternate outcomes, restore, and non-primary commands |
| `IconAction` | Search clear, create, favorite, more, and Back with explicit labels |
| `ExerciseRow` | Extend with Library variant, alias/origin/status, and separate favorite action |
| `PlanActivationRow` | Generalize to starter and owned Plan rows without nested cards |
| `InlineNotice` | Draft reason, current workout snapshot, update summary, warning, and non-blocking status |
| `EmptyState` | Search, ownership, and load failure states with one primary action |
| `ConfirmationSheet` | Activation, dirty leave, archive, remove day, override replacement, and migration review |
| `SkeletonBlock` | Destination-specific Library and editor placeholders |
| `SetRow` | Extend inline observation fields to all nine profiles |
| `WorkoutStartSheet` | Preserve alternate day, rest-day, empty workout, and explicit rotation advancement |
| `RecommendationSurface` | Preserve explicit future-target decisions; profile-incompatible suggestions invalidate |

### New Shared Primitives

| Component | Exact Contract |
|---|---|
| `SegmentedControl` | Equal-width `Plans | Exercises` or `Weekday | Rotation`; selected semantics; no horizontal scroll |
| `SearchField` | Label, input, clear control, busy state, punctuation-safe error state |
| `FilterBar` | Filter action, removable selected chips, exact `Clear filters` |
| `FilterSheet` | Grouped multi-select values, explicit combination help, `Show results`, focus restoration |
| `PlanRow` | Active/owned/starter variants using one row vocabulary |
| `LibraryExerciseRow` | A configured `ExerciseRow` variant, not a parallel visual style |
| `FormField` | Label, optional help, control, required/optional state, inline error |
| `MetricProfileOption` | Plain-language name, example, and comparator explanation |
| `ReorderableRow` | Drag handle plus `Move up` / `Move down`, visible position feedback |
| `ImpactPreview` | Named before/after changes and affected plans/days/schedule facts |
| `ScheduleBindingEditor` | Mode-specific weekday bindings or rotation order with effective date/timezone |
| `PaginationFooter` | `Load more exercises`, loading, retry, and end count |

No screen may create a local variant solely for different styling.

---

## Copywriting Contract

### Primary and Empty/Error Copy

| Element | Copy |
|---------|------|
| Plans create CTA | `Create my own` |
| Exercises create CTA | `Create custom exercise` |
| Starter activation CTA | `Activate plan` |
| Plan editor CTA | `Save plan` |
| Day editor CTA | `Save day` |
| Target editor CTA | `Save target` |
| Exercise editor CTA | `Save exercise` |
| Schedule editor CTA | `Save schedule` |
| No active plan heading | `Choose a starter plan` |
| No active plan body | `Review a starter plan or create your own. Nothing is scheduled until you confirm it.` |
| No personal plans | `No personal plans yet` |
| No favorites | `No favorites yet` |
| No recent exercises | `No recent exercises yet` |
| Exercise search empty heading | `No exercises match` |
| Exercise search empty body | `Try another name or alias, or clear filters to see all available exercises.` |
| Plan search empty heading | `No plans match` |
| Plan search empty body | `Try another plan name or clear filters.` |
| Library load error | `Library could not be loaded. Your plans and exercises were not changed. Try again.` |
| Search page error | `More exercises could not be loaded. Your current results and filters are unchanged.` |
| Save error | `{Item} could not be saved. Your edits are still here. Try again.` |
| Activation error | `Plan could not be activated. Your current active plan and schedule are unchanged.` |
| Content update error | `Exercise content could not be updated. The previous library is still available.` |
| Draft missing requirement | `Add at least one exercise with valid targets before scheduling this plan.` |
| Alias match | `Matched alias: {alias}` |
| In-progress edit notice | `Current workout is unaffected` |
| Missed weekday | `Planned but not completed` |
| Template change | `Template update available` |
| Source unavailable | `Unavailable` |

### Confirmation Copy

| Action | Heading | Required Body / Actions |
|---|---|---|
| Dirty leave | `Save changes?` | Actions exactly `Save changes`, `Discard`, `Keep editing` |
| Switch plan with workout | `Finish the current workout first` | `Resume`, `Finish partial`, `Discard` |
| Archive plan | `Archive {plan name}?` | `The plan will leave the default Library view. Its history is unchanged, and you can restore it later.` |
| Archive exercise | `Archive {exercise name}?` | `This removes the exercise from new selection. Existing plans remain runnable and show Archived until you restore or replace it.` |
| Remove day | `Remove {day name}?` | Name every schedule binding and require replacement, removal, or effective date |
| Replace override | `Replace this date override?` | Show current and replacement state; consumed overrides have no edit action |
| Metric migration | `Change metric profile?` | State future-only migration, immutable history, recommendation invalidation, and one-way target replacement |
| Duplicate warning | `Similar exercises already exist` | Actions `Review existing exercise`, `Create anyway` |
| Replace exercise | `Review replacement` | Scope choices `This occurrence`, `All occurrences in this plan`; show target/warm-up/rest/progression impact |

### Content Update Summary

After a validated atomic content-pack update, show a non-blocking Library notice:

- Heading: `Exercise library updated`
- Body: `{added} added · {updated} updated · {unavailable} unavailable`
- Action: `Review changes`

Dismissal does not undo the update. The notice never blocks Library use. Custom exercises, copied plans, existing plan references, and historical snapshots remain unchanged; only validated bundled rows are added, updated, or marked unavailable.

### Voice

- Calm, factual, local-first, and explicit.
- Say what will change and what will not change.
- Prefer `Repeat`, `Hold`, `Ready to increase`, `Try again when ready`, and `Consider a lighter target`.
- Never imply AI ranking, automatic coaching, fatigue, injury, weakness, or moral failure.
- Never say a save succeeded until the transaction commits.

---

## Interaction State Matrix

| Surface | Loading | Empty | Error | Populated | Partial / Special |
|---|---|---|---|---|---|
| Library shell | Fixed header, segment, search, filters, and row skeletons | Section-specific state below stable controls | Preserve selected segment; retry without clearing transient state | Selected section and list/detail behavior | Process restart preserves only selected section |
| Plans | Row skeletons in Active/My/Starter shapes | `Choose a starter plan`; My Plans remains empty; starters remain available | Preserve search/filters and show Retry | Active, owned, and six starters | Draft, archived, active, template-update, in-progress block |
| Exercises | Search and 6–10 row skeletons | `No exercises match`; Favorites/Recent compact empties | Preserve query/filters/current page; Retry | Favorites, Recent, All or relevance-ranked Results | Hidden, archived, unavailable, alias match, page-load retry |
| Exercise detail | Stable heading and section skeletons | No history uses `No history yet` | Preserve list and retry detail | Taxonomy, profile, Best/Average/Last, attribution | Multiple profile versions, unavailable source |
| Plan editor | Field/day skeletons only on initial load | One named empty day allowed in Draft | Preserve edits and show summary/inline errors | Valid editable plan graph | Dirty leave, schedule impact, current-workout notice |
| Schedule editor | Existing schedule remains visible under loading overlay | No schedule means inactive plan setup | Preserve current schedule and draft | Weekday or Rotation before/after | Pending/consumed override, timezone prompt, DST/midnight explanation |
| Metric migration | Affected target list skeleton after profile choice | No affected targets proceeds to policy/review | Preserve entered replacements and retry | Complete old/new review | Blocked by workout; historical versions segmented |
| Content update | No blocking full-screen state | Not applicable | Prior pack remains usable | Non-blocking added/updated/unavailable summary | Unavailable sources preserved |
| Active Workout | Existing persisted session state | Not applicable | Values retained; inline Retry below set list | Profile-specific inline fields | 200% stacking; no retired editor/dock |

---

## Physical-Review Amendment — 2026-08-22

This amendment supersedes conflicting earlier visual and interaction language in
this UI contract. In particular, it supersedes the card-light Library direction
and the time-limited completed-set Undo presentation.

### Global Surface Direction

- Default light presentation uses a neutral grey canvas with black or
  near-black cards and high-contrast card content.
- Library plan, starter-plan, and exercise items use flat, independently
  scannable cards. Do not nest cards.
- Preserve `System`, `Light`, and `Dark`; the exact dark-mode inverse and token
  values remain implementation discretion subject to contrast and OLED review.
- Card rows place their action cluster at the right edge. Controls sharing a row
  have the same visible height.

### Input Controls

- Dates are selected through an accessible in-app calendar, never typed into a
  free-form date field.
- Durations use an accessible time-style control and are never typed into a
  free-form duration field. Duration controls do not satisfy the separate
  time-of-day obligation in D-57: Plans 02-33/02-34 must inventory every
  editable D-57 field and either prove the time-of-day selector or prove that no
  such Phase 2 field exists.
- Count, load, distance, and other number-only values open a number or decimal
  keypad appropriate to their precision.
- Implement these controls with current project dependencies and React Native
  primitives; no package installation is approved.

### Glyph and Status Actions

- Use accessible glyph controls for `Move up`, `Move down`, Complete set, Skip
  set, Complete warm-up, Skip warm-up, Plan default/reset, Add set, Add warm-up,
  Copy warm-up, Pause/Resume rest, and Skip rest where compact icon treatment
  improves scanning.
- Every glyph retains an exact accessible name, visible focused state, keyboard
  and D-pad activation, and a minimum `48 × 48dp` target.
- Completed and skipped sets place distinct circle glyphs at the top-right of
  the set card and expose the state as text to assistive technology. A compact
  visible status tag may reinforce but never replace the semantic label.
- Remove visible `Excluded from records and progression` copy from each warm-up
  row. Preserve warm-up exclusion in domain behavior and verification.

### Active Workout

- Keep the workout/exercise header sticky while set content scrolls.
- Add a `Today's plan` surface that lists every exercise in workout order with
  completed, current, planned, and skipped states. Each row can open that
  exercise for review without silently changing the authoritative active
  pointer.
- `Add warm-up`, `Copy warm-up`, and `Add working set` use glyph controls,
  produce a persisted row on the current schema, move focus/scroll to that row,
  and expose an inline retryable failure rather than failing silently.
- A completed working set remains editable while its workout is still active.
  Editing saves through a revision-checked command and preserves later
  set/exercise progress and the current rest state. Finalized-session correction
  remains Phase 3.
- Remove the eight-second Undo countdown/expiry UI; do not use whole-session
  snapshot rollback as the completed-set editing mechanism.

### Rest Surface

- The timer can collapse and expand, and the remaining time stays visible in
  both states.
- Controls appear in this exact order: `Skip`, `Pause`/`Resume`, `−15`, `+15`.
- Skip and Pause/Resume use glyphs with accessible names.
- Skipping rest returns directly to the ready state; do not show a `Rest
  skipped` notice.
- Rest completion defaults to one short tone plus one haptic vibration. Sound
  and vibration are independently configurable.

### Adaptive Navigation and Evidence

- At expanded width, configure the navigator itself for a left tab bar; do not
  paint rail visuals onto a bottom-tab layout.
- Compact and medium widths retain bottom tabs.
- Recheck compact, medium, expanded, landscape, 200% text, keyboard/D-pad,
  focus restoration, reduced motion, non-color semantics, and `48dp` targets.
- Any implementation of this amendment requires a new exact-HEAD APK and full
  regenerated automated/physical evidence.

### Canonical Surface Inventory

<!-- phase2-ledger:v1 name=ui-surfaces -->

This inventory is the source-owned surface key for the physical-review
amendment. It supplements, rather than changes, the accepted starter assets:
the wording correction from five to six templates does not alter any accepted
starter bytes. Columns are fixed in this exact order: `surface_id`, `ownership`,
`remediation_cases`, `evidence_responsibility`. Entries are sorted by
`surface_id`. The exact delimiter for multi-ID `remediation_cases` is `, `
(U+002C COMMA followed by U+0020 SPACE); it is an exact-ID foreign-key list
into the remediation-case ledger in `02-VALIDATION.md`, with unique values.

| surface_id | ownership | remediation_cases | evidence_responsibility |
|---|---|---|---|
| UI-02-ALERT-SETTINGS | Today rest sound/vibration preferences and bounded channel guidance | RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH, RC-02-ALERT-FG-ATTEMPT-ONCE, RC-02-ALERT-BG-DELIVERY-NONAUTH | Host proofs from Plans 02-30/02-31; exact-HEAD native and attended proof remains pending. |
| UI-02-CALENDAR | Civil-date selection and confirmation | RC-02-DATE-CALENDAR | Plan 02-23 host proof; exact-HEAD native/emulator review remains pending. |
| UI-02-DURATION | Confirmed duration selection plus a separate audit of D-57 time-of-day scope | RC-02-DURATION-NUMERIC, RC-02-TIME-OF-DAY-SCOPE | Plan 02-24 supplies duration host proof; Plans 02-33/02-34 own the time-of-day source audit and any resulting exact-HEAD evidence. |
| UI-02-GLOBAL-CARD | Shared visual card role outside Library | RC-02-CARDS | Plan 02-26 host proof; exact-HEAD visual review remains pending. |
| UI-02-LIBRARY-EXERCISE-CARD | Flat exercise-card families | RC-02-CARDS | Plan 02-25 host proof; exact-HEAD visual review remains pending. |
| UI-02-LIBRARY-PLAN-CARD | Flat active, owned, and starter plan cards | RC-02-CARDS | Plan 02-25 host proof; exact-HEAD visual review remains pending. |
| UI-02-NUMERIC | Integer and decimal metric inputs | RC-02-DURATION-NUMERIC | Plan 02-24 host proof; exact-HEAD native/emulator review remains pending. |
| UI-02-REST-DOCK | Collapsible timer and ordered controls | RC-02-REST-DOCK | Plan 02-29 host proof; exact-HEAD native/emulator/Samsung review remains pending. |
| UI-02-ROOT-NAV | Compact/medium tabs and expanded left rail | RC-02-NAV-LEFT-RAIL | Plan 02-22 host proof; exact-HEAD emulator/Samsung adaptive review remains pending. |
| UI-02-SET-CARD | Set state, glyph, alignment, and warm-up exclusion presentation | RC-02-GLYPH-ACTION-GEOMETRY, RC-02-SET-STATUS, RC-02-WARMUP-EXCLUSION-COPY | Plan 02-28 host proof; exact-HEAD native/emulator review remains pending. |
| UI-02-SET-MUTATIONS | Add/copy/retry/focus and active correction operations | RC-02-LATEST-SCHEMA-ADD-COPY, RC-02-RETRY-FOCUS, RC-02-ACTIVE-CORRECTION | Plans 02-27/02-28 host proof; exact-HEAD native/emulator/Samsung review remains pending. |
| UI-02-STICKY-HEADER | Persistent active workout/exercise identity | RC-02-STICKY-IDENTITY | Plan 02-28 supplies the implementation summary; focused host layout-hierarchy proof and exact-HEAD attended review remain pending. |
| UI-02-TODAYS-PLAN | Active workout overview and non-mutating review | RC-02-TODAYS-PLAN | Plan 02-28 host proof; exact-HEAD native/emulator/Samsung review remains pending. |

Foreground alert semantics deliberately do not guarantee physical delivery: an
eligible foreground expiry can make at most one durably claimed best-effort
platform-feedback attempt. A post-claim process or adapter failure may yield no
physical effect, and retrying it would violate the no-duplicate contract.

---

## UI Considerations

Probe evidence: the original UI considerations remain resolved; the
physical-review amendment adds explicit gap-closure criteria for Library cards,
specialized input controls, active-workout editing/navigation, rest controls,
and the expanded navigation rail.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| Empty | Plans, Exercises, detail history, editors | ✅ covered | Use the exact empty-state and compact section-empty copy in the Copywriting Contract; never replace controls with generic `No data`. |
| Loading | Library, details, editors, pagination | ✅ covered | Render destination-specific fixed skeletons that match final shape, preserve stable controls, and expose no stale facts. |
| Error | Load, search page, save, activate, content update | ✅ covered | Preserve queries, filters, committed data, and unsaved edits; show the exact recovery copy and Retry path. |
| Populated | Grouped plans, default exercises, search results, details | ✅ covered | Use editorial sections, deterministic row ordering, bounded pagination, and two-pane detail where width permits. |
| Partial | Drafts, affected migrations, archived/unavailable references, interrupted page load | ✅ covered | Keep valid partial content visible with literal state labels, exact missing requirements, and disabled-action reasons. |
| Overflow | Long lists, filters, names, editor graphs | ✅ covered | Vertically scroll lists/forms, paginate exercises, wrap names, reflow filters, and never hide required actions behind horizontal scrolling. |
| Zero / one / many | Active plan, Favorites, Recent, search results, days, occurrences | ✅ covered | Active Plan supports zero or one only; Recent caps at ten; result lists paginate by 30; counts use correct singular/plural copy. |
| Long text | Names, aliases, attribution, source notes, validation, impact previews | ✅ covered | Names wrap to two lines in rows and fully in details; explanations reflow at 200%; attribution/source notes are never clipped. |

---

## Decision Coverage

| Decisions | UI Contract |
|---|---|
| D-01–D-05 | Single active schedule, explicit existing-copy choice, preserved inactive schedule, workout switch block, editable activation preview |
| D-06–D-10 | Remembered segment, exact section ordering, transient-state preservation/reset, visibility filters |
| D-11–D-17 | Exact ranking, Recent definition, separate favorite action, filter boolean logic, attribution, alias text, duplicate warning |
| D-18–D-22 | Deterministic starter fit, four filters, complete preview, `Create my own`, explicit Draft validity |
| D-23–D-32 | Explicit noun-specific atomic saves, locked `Save changes` dirty-leave action, accessible reorder, full duplication, bundled/custom ownership, archive/restore, affected-plan preview, snapshot-safe edits, day-binding impact |
| D-33–D-39 | Explicit nine-profile choice, future-only migration, workout block, required replacement defaults, version-separated history, progression invalidation, immutable-history explanation |
| D-40–D-46 | Suggested initial schedule, prospective before/after edits, Repeat/Skip/Advance, explicit rotation advance after alternate training, one override per date, weekday skip, planned-not-completed |
| D-47–D-49 | Start-date authority across midnight, timezone-resolved weekday/DST intent, one-time prospective timezone prompt |
| D-50–D-54 | Atomic update summary, preserved Unavailable references, compatible-first explicit replacement, occurrence scope, independent template-update copy |
| D-55 | `Gym Body-Part Split`: Monday–Friday Chest / Back / Shoulders / Legs / Arms, four weighted equipment-first exercises per day, editable accepted defaults, and no bodyweight occurrence or substitution |
| D-56–D-67 | Grey canvas and black cards, semantic date/time/number controls, accessible glyph actions/status, collapsible rest controls and alerts, current-schema add-set repair, Today's plan, active-session completed-set editing, sticky workout header, true expanded rail, and exact-HEAD evidence renewal |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | Not applicable; React Native manual design system |
| Third-party registries | none | No registry code permitted by this contract |

No registry vetting is required because no registry or third-party UI block is declared.

---

## Verification Contract

The planner must include focused component/device evidence for:

- First launch into Plans and persistence of the last selected `Plans | Exercises` section.
- Query/filter/scroll preservation during detail navigation and section switches, plus transient reset after process restart.
- Exercise search ranking, alias copy, punctuation, 30-row pagination, filter boolean behavior, Favorites, and Recent.
- Zero, one, and many rows; long names; long source notes; 200% text.
- Custom create/edit, duplicate warning, bundled `Create custom copy`, hide, archive, and restore.
- All nine metric options, input formats, Best/Average/Last labels, rounding, version separation, and incomparable history.
- Starter fit, filtering, complete preview, existing-copy choice, activation, and in-progress workout block.
- Plan draft, noun-specific explicit atomic saves, locked `Save changes` dirty leave, reorder with drag and named actions, duplicate, day removal impact, archive, and restore.
- Weekday/Rotation setup, effective-date edit, Repeat/Skip/Advance, override replacement/immutability, Train anyway, midnight, DST, and timezone prompt.
- Content-pack success summary, failure retaining the prior pack, Unavailable references, replacement scopes, and template diff/new copy.
- Compact, medium, expanded, landscape, 200% text, semantic labels, keyboard, D-pad, visible focus, focus restoration, non-color states, minimum targets, and reduced motion.
- Phase 1 regression: Active Workout retains inline `SetRow` values/actions and direct Retry; no set editor or action dock returns.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-08-17T14:44:38+08:00
