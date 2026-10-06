---
phase: 15
slug: workout-parity
status: approved
reviewed_at: 2026-10-06T08:38:27Z
shadcn_initialized: false
preset: none
created: 2026-10-06
presentation_oracle: approved.json revision 18 and approved-hybrid.html
legacy_timing_playback: pending_owner_checkpoint_TIM-01
---

# Phase 15 — Workout Parity UI Design Contract

> Canonical visual and interaction contract for the Workout root, Active Workout, completion, recovery, and preserved deep actions. Generated for planning only; implementation is not authorized by this document.

---

## Authority, Evidence, and Boundary

When sources disagree, apply this order:

1. <code>.planning/v1.2-OWNER-BRIEF.md</code>.
2. Revision 18 in external <code>approved.json</code>.
3. Rendered behavior and source in external <code>approved-hybrid.html</code>.
4. <code>.planning/design/v1.2-SOURCE-PRECEDENCE.md</code>.
5. Phase 15 <code>15-CONTEXT.md</code> and WRK-01 through WRK-36.
6. Shipped SQLite, transaction, recovery, history, metric, and accessibility contracts.
7. Existing presentation only where it does not conflict with the sources above.

Evidence baseline:

| Evidence | Contract use |
|---|---|
| Revision 18 <code>approved.json</code>, SHA-256 <code>b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf</code> | Latest presentation decisions; one active-exercise edge and no current-row stripe |
| <code>approved-hybrid.html</code>, SHA-256 <code>b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96</code> | Exact hierarchy, measurements, labels, states, sheets, and Light/Dark color values |
| <code>design-audit-revision18.md</code>, SHA-256 <code>3d121af24fe92907ab035ab49f50473107043bcd9ea126722d5d2132ece7c048</code> | Confirms the sole 4px exercise edge and removal of the inner current-set marker |
| Light/Dark browser walk and captures in <code>.planning/design/v1.2-browser-evidence/</code> | Confirms Workout root, active overview, warm-up transitions, full rest dock, menus, and theme parity at the 390 × 844 reference viewport |
| Prototype inventory and parity matrix | Maps all 36 WRK requirements to routes, components, source selectors, planned checks, and evidence paths |
| Current native components and shipped tests | Supplies native-only metric, failure, process-death, recovery, completion, and write-back states absent from the illustrative prototype |

Browser evidence proves the planning oracle was exercised. It is not native implementation evidence. Fixture dates, names, weights, results, and Garmin activities are visual examples only and must never become production facts.

### Phase boundary

Included:

- Workout root: scheduled, rest/recovery, no-plan, multi-plan context, Start, Resume, and start alternatives.
- Active Workout: full-session list, disclosure, rows, all nine metric editors, warm-ups, commit-gated completion, rest, add/replace/delete/reorder, trend, plan settings, Undo recovery, and all finish outcomes.
- Completion: complete/partial facts, result and effort summaries, detail/return actions, and explicit default-No plan write-back.
- Recovery and errors for reads, starts, set commits, rest, session edits, completion summary, and write-back.

Excluded:

- Calendar month/focus work, Running authoring, FIT parsing, Garmin transport, and Progress analytics.
- Any in-app Running recorder.
- Any new progression algorithm or automatically accepted target.
- Any product-code, build, release, deployment, or external prototype edit in this planning phase.

---

## Design System

| Property | Value |
|---|---|
| Tool | Repository-owned Expo/React Native component system; no shadcn |
| Preset | Not applicable |
| Component library | Existing native primitives plus Phase 14 shared shell, tokens, sheet/dialog, toast, focus, and appearance contracts |
| Icons | <code>lucide-react-native</code>, 24dp default, 20dp inline, 2dp stroke |
| Interface font | Bundled Archivo variable font supplied by Phase 14 |
| Numeric font | Bundled IBM Plex Mono with tabular numerals |
| Route owners | <code>app/(tabs)/index.tsx</code>, <code>app/workout/[sessionId].tsx</code>, <code>app/completion/[sessionId].tsx</code>, <code>app/exercise-history/[exerciseId].tsx</code> |
| Reused behavior | <code>ActiveWorkoutScreen</code>, <code>SetRow</code>, <code>RestDock</code>, <code>WorkoutStartSheet</code>, <code>WorkoutCompletionScreen</code>, semantic numeric/duration fields, runtime command ports |

Phase 15 consumes Phase 14; it must not create a local theme provider, duplicate root shell, parallel sheet/toast primitives, or route-local semantic token set. Phase 14 is a future implementation dependency, so Phase 15 plans must reference its public token/component contract rather than reimplementing it.

The shadcn initialization gate is not applicable: this is an Expo/React Native application, <code>components.json</code> is absent, and no web component registry is authorized.

---

## Spacing Scale

Declared layout values are multiples of 4 only:

| Token | Value | Phase 15 usage |
|---|---:|---|
| <code>xs</code> | 4dp | Sole active-exercise edge, icon/text gap, progress bar |
| <code>sm</code> | 8dp | Dock gap, compact internal spacing, row-to-row rhythm |
| <code>md</code> | 16dp | Compact screen inset, card/sheet internal padding |
| <code>lg</code> | 24dp | Section separation and medium inset |
| <code>xl</code> | 32dp | Expanded inset and major separation |
| <code>2xl</code> | 48dp | Minimum interactive target and fixed header action columns |
| <code>3xl</code> | 64dp | Maximum section break and safe dock clearance building block |

Control dimensions and source-oracle measurements are not spacing tokens:

| Element | Exact contract |
|---|---|
| Every touch, keyboard, and D-pad target | Minimum 48 × 48dp |
| Workout root reference viewport | 390 × 844; native layout remains responsive, not fixed-size |
| Root top bar | 56dp high; 16dp horizontal action inset |
| Day selector | Five equal columns; 4dp gap; each item at least 56dp high |
| Root content | 16dp horizontal inset; 8dp top inset |
| Root queue row | Minimum 60dp high; 32dp ordinal column |
| Root primary action | Minimum 64dp high; 16dp radius; 16dp horizontal padding |
| Root bottom navigation | 72dp plus bottom safe area; exactly four equal columns |
| Active header | 64dp high; columns 48dp / flexible identity / 48dp |
| Session progress | 4dp high |
| Session scroll | 16dp horizontal inset; sufficient bottom padding to clear the maximum dock and safe area |
| Exercise header | Minimum 80dp; columns 48dp grip / flexible text / 48dp trend / 48dp menu |
| Set header / set row | Minimum 40dp / 60dp; row columns 40dp / flexible Previous / flexible Target or Result / 68dp State |
| Compact action dock | 8dp gap; Add minimum 128dp; both buttons minimum 56dp high |
| Rest dock | Full width; 56dp context row; four equal controls minimum 48dp high with 8dp gaps |
| Bottom sheet | Maximum 80% of available height; 24dp top radius; scrolls independently |
| Editor input / stepper / save | 64dp input; 48dp stepper; 56dp Save |

Use native safe-area insets in addition to these measurements. Do not reproduce browser status-bar or camera assets.

---

## Typography

Phase 15 declares four semantic sizes and exactly two logical weights. Phase 14 calibrates Archivo variable axes once against the source oracle; Phase 15 consumes those tokens.

| Role | Family | Size | Weight | Line height | Usage |
|---|---|---:|---:|---:|---|
| Body / label / numeric row | Archivo or IBM Plex Mono for numbers | 16sp | 400 | 1.35 | Metadata, table labels, row values, helper and status text |
| Exercise / action emphasis | Archivo | 18sp | 700 | 1.2 | Exercise names, queue names, primary row actions |
| Numerical emphasis | IBM Plex Mono | 30sp | 700 | 1.1 | Rest clock and direct editor value |
| Editorial workout title | Archivo variable, condensed | 57sp | 700 logical emphasis | 0.86 | Workout root plan/day identity only |

Rules:

- The two logical weights are regular 400 and emphasis 700. Do not create route-local intermediate semantic weights.
- The source uses variable Archivo width/weight; Phase 14 must calibrate the bundled native face so the 57sp title matches the reference without substituting Source Sans 3.
- Exercise names use 18sp emphasis, wrap normally, and show the full name over at most two lines at normal text scale.
- At 200% text, remove the two-line clamp before truncating required content; headers and rows grow vertically.
- IBM Plex Mono is mandatory for ordinals, loads, reps, durations, distances, rounds, countdowns, and tabular values.
- Sheet/dialog titles and primary actions use the 18sp emphasis role. Do not shrink text to preserve a one-line layout; reflow metadata, controls, and action groups instead.

---

## Color

### 60 / 30 / 10 allocation

| Allocation | Light | Dark | Usage |
|---|---|---|---|
| Dominant 60% | Paper <code>#FFFAF0</code> | Paper <code>#080808</code> | Root/active canvas and uninterrupted reading surface |
| Secondary 30% | Bone <code>#F4F0E6</code>, surface <code>#F0EADF</code>, raised <code>#FFFAF0</code> | Bone/surface <code>#151515</code>, raised <code>#202020</code> | Exercise sections, sheets, inputs, dock, selected/raised regions |
| Accent 10% | Orange <code>#D97820</code> with on-accent <code>#281306</code> | Orange <code>#D97820</code> with on-accent <code>#281306</code> | Workout-root Start action, queue ordinals, selected root underline only |

Accent is reserved for the Workout-root Start action, queue ordinals, and selected Workout navigation underline. It is not applied to every interactive element or to static headings.

### Semantic tokens

| Token | Light | Dark | Reserved use |
|---|---|---|---|
| Primary text | <code>#0D0C0A</code> | <code>#F7F7F2</code> | Primary copy and inverse active-dock actions |
| Secondary text | <code>#655F56</code> | <code>#AAA9A2</code> | Supporting copy only |
| Divider | <code>#CEC6B8</code> | <code>#333330</code> | Hairlines, card borders, input borders |
| Completed | <code>#166B4C</code> on <code>#DCECDF</code> | <code>#72DF92</code> on <code>#14271A</code> | Committed row, check, saved/offline state only |
| Current / rest | <code>#8D5D00</code> on <code>#FFF0C2</code> | <code>#F0C84B</code> on <code>#2A2410</code> | Current row, active-exercise edge, clock, Resting/Rest paused |
| Focus / trend / warm-up | <code>#195FAE</code> on <code>#DCE9F9</code> | <code>#71AAFF</code> on <code>#14243B</code> | Visible focus, trend, selected editor, warm-up ordinal, progress |
| Destructive source token | <code>#FF8279</code> | <code>#FF8279</code> | Destructive icon/border and confirmation emphasis only |
| Toast | <code>#FFFAF0</code> / border <code>#CEC6B8</code> / text <code>#0D0C0A</code> | <code>#202020</code> / border <code>#3D423E</code> / text <code>#F7F7F2</code> | Theme-aware top feedback |

Color rules:

- One active exercise gets one continuous 4dp yellow edge. No set row gets a left edge.
- Completed, current, planned, skipped, error, selected, and disabled states always include text plus icon/shape/state semantics; color is never the sole cue.
- Green appears only after the authoritative transaction commits.
- Amber/yellow never means committed.
- The raw prototype destructive token must pass native text/non-text contrast before use. If it cannot, the executor must register the exact accessibility deviation and obtain owner acceptance; it may not silently substitute a Material red.
- Body text meets WCAG AA 4.5:1; large text and non-text controls meet at least 3:1.

---

## Exact Screen Composition

### Workout root

Primary focal point: the real plan/day identity and its Start or Resume action. The full exercise preview is evidence beneath that decision; contextual Running/Garmin actions are tertiary.

Visual order is fixed:

1. Phase 14 root top bar: visible title <code>Workout</code>; Settings at the far right.
2. Mono context line: week, weekday, and local date from the selected real occurrence.
3. Five-item training-day selector with selected state and roving keyboard focus.
4. Editorial plan/day identity.
5. Truthful exercise/set/time summary.
6. Full vertically scrollable exercise preview in persisted order.
7. Contextual Running block headed <code>ALSO SCHEDULED</code>, when a Running occurrence exists, with <code>View plan</code> and <code>Sync Garmin</code>. Never show <code>Start Run</code>.
8. Sticky primary Start/Resume zone above the four-root navigation.
9. Phase 14 bottom navigation in the exact order Workout, Calendar, Library, Progress.

The selected day changes preview only. It must not advance a rotation, consume an occurrence, mutate a schedule, or replace the authoritative recovered session.

| Root state | Required presentation | Action contract |
|---|---|---|
| Loading | Fixed-shape placeholders matching context, title, summary, at least three preview rows, and action zone; no stale facts | No workout mutation action until trusted read succeeds |
| Scheduled Strength | Real identity, summary, and all exercises | <code>Start {day name}</code> |
| Recovered in-progress | Real plan/day/session identity, current exercise/set, rest state if any | <code>Resume workout</code>; this is the only primary workout action |
| Rest/recovery day | <code>Rest day</code>, <code>No workout planned</code>, next factual context | Disabled <code>Nothing scheduled</code>; alternate/empty start remains available from explicit start alternatives |
| No active plan | <code>Choose your starting plan</code> and factual activation entry | <code>Use Full Body Foundation</code> or the current real starter path |
| Empty workout entry | No invented plan/day | <code>Start empty workout</code> from the start sheet only |
| Read error | <code>Workout data could not be opened. Your saved data was not changed.</code> plus correlation code | <code>Retry opening workout data</code> |
| Start failure | Keep the same root facts and selection | <code>Workout was not started</code>; <code>Your saved data was not changed. Try again.</code>; <code>Retry starting workout</code> |

### Start alternatives

Sheet title: <code>Start a workout</code>.

Body: <code>Alternate, rest-day, and empty workouts do not advance your schedule. Completing the scheduled workout advances it.</code>

Actions, in order:

1. <code>Start {scheduled day}</code>, when applicable.
2. Other real plan days as <code>Start {day name}</code>.
3. <code>Start empty workout</code>.
4. <code>Return to Workout</code>.

<code>Return to Workout</code>, scrim, Escape, and Android Back make no mutation and restore focus to the invoking action.

### Active Workout

Primary focal point: the current set row and the mutually exclusive Complete or Rest dock. Workout identity remains persistent context; editing, trend, settings, and session-management actions remain secondary.

The screen is one scan-first, vertically scrollable session:

- Sticky header: Back, centered real plan/day identity, literal <code>Active · saved offline</code> or a truthful recovery/save state, and one 48dp action labelled <code>Open Plan settings</code>.
- 4dp session progress immediately under the header; working sets only.
- Scroll content: reorder hint, committed/total working count, then every exercise in persisted display order.
- Exactly the current exercise is expanded on entry. Other exercises may be expanded/collapsed without changing the active pointer.
- Sticky bottom region is mutually exclusive: compact Add/Complete row, full-width rest dock, or final <code>Finish workout</code>.
- Root navigation is never visible during Active Workout.
- Back returns to the owning Workout root/plan context without discarding the active session. Unsaved editor draft stays in the editor until Save or dismissal; dismissal leaves source facts unchanged.

### Exercise header and disclosure

Header order is fixed: 48dp grip, name/metadata disclosure, 48dp trend, 48dp menu.

- Name: full text; two lines maximum at normal scale; no collision with trend/menu targets.
- Current metadata: <code>{target} · set {working ordinal}/{working total}</code> or <code>{target} · warm-up W{ordinal}</code>.
- Non-current metadata: <code>{target} · {completed}/{total} complete</code>.
- Header tap, Enter, and Space toggle disclosure; trend and menu do not toggle it.
- Accessible name includes exercise name, target, current/non-current status, working progress, and Expand/Collapse result.
- When the final set commits, collapse that exercise only after the authoritative result, open the next current exercise, preserve scroll/focus identity, and announce the transition.

---

## Set Table and Row State Contract

Column order is fixed: <code>Set</code>, <code>Previous</code>, <code>Target</code> (or committed <code>Result</code> where factual), <code>State</code>.

| State | Visual contract | Semantic contract | Interaction |
|---|---|---|---|
| Warm-up planned | <code>W1</code>, <code>W2</code> in blue; neutral row; dash state | <code>Warm-up W{N} … Planned</code> | Entire row opens the compatible editor |
| Working planned | <code>01</code>, <code>02</code>; neutral row; dash | <code>Working set {N} … Planned</code> | Entire row opens editor; not completable unless current |
| Current | Amber fill, highlighted ordinal, clock, literal accessible <code>Current</code>; no left stripe | <code>{kind} {N} … Current. Edit values.</code> | Entire row opens editor; dock owns completion |
| Saving | Values remain, row stays current, no green/check/advance/rest | <code>Saving set…</code>, busy and disabled completion | Duplicate completion is ignored |
| Completed | Green fill, check, literal <code>Completed</code>; committed result shown | <code>{kind} {N} … Completed. Edit values.</code> | Entire row opens committed-edit editor |
| Skipped / history-preserved | Neutral treatment, explicit skipped icon/text | <code>Skipped</code> and retained completed evidence where applicable | Not selected as current; protected facts remain available |
| Selected for editing | Existing state plus 2dp blue focus/selection outline | Selected/expanded editor relation | No source mutation before Save |
| Save failed | Current state and entered draft stay visible; error notice is adjacent/top, never under dock | Assertive heading, retry action, no completed announcement | <code>Set not saved · Retry</code> repeats the same bounded command |

Warm-ups:

- Always precede working sets.
- Number independently as W1, W2, and onward.
- New warm-up inserts after existing warm-ups and before the first working set.
- Warm-up completion advances without between-set rest.
- Warm-ups never enter the working-set progress numerator or denominator.

Working sets:

- Number independently as 01, 02, and onward.
- Alone drive session progress and between-set rest.
- The active pointer and current exercise survive edits, reorder, backgrounding, process death, and authoritative reload.

Tap any planned, current, or completed set row to edit. There is no separate visible Edit button.

---

## Metric Editor Contract

All editors are native Phase 14 bottom sheets, keyboard-safe, maximum 80% height, independently scrollable, and focus-trapped. Focus enters the sheet heading, then fields, then Save; dismissal restores the row. Direct numeric inputs show fixed units, reject negative values, and never encode one metric as another.

Editor heading:

- Planned/current: <code>Edit {exercise name}</code>.
- Completed: <code>Edit committed {exercise name}</code>.

Context: <code>{Warm-up WN | Working set N} · changes apply only after Save.</code>

Save:

- Planned/current: <code>Save set values</code>.
- Completed: <code>Save committed set edit</code>.
- Close, scrim, Escape, or Android Back leaves authoritative facts unchanged.

| Metric profile | Visible fields and fixed context | Input / step contract | Validation |
|---|---|---|---|
| <code>load_reps</code> | Load <code>kg</code> + Reps <code>reps</code> | Decimal load; −/+ uses selected 1.25/2.5/5kg increment; integer reps −/+1 | <code>Enter a valid load.</code>; <code>Enter valid repetitions.</code> |
| <code>bodyweight_reps</code> | Fixed <code>Bodyweight · {variation}</code> + Reps | Integer reps −/+1 | At least 1; <code>Enter valid repetitions.</code> |
| <code>added_load_reps</code> | Added load <code>kg</code> + Reps | Decimal load −/+ selected increment; integer reps −/+1 | Same nonnegative load/reps rules |
| <code>assisted_reps</code> | Fixed <code>Assistance equipment · {id}</code>; Assistance <code>kg assist</code> + Reps | Decimal assistance uses target decrement; integer reps −/+1 | <code>Enter valid assistance.</code>; <code>Enter valid repetitions.</code> |
| <code>timed_hold</code> | Duration only, <code>sec</code>; no load/reps field | Direct duration plus −/+5 seconds | <code>Enter a valid duration.</code> |
| <code>fixed_distance</code> | Fixed <code>Planned distance · {meters} m</code>; Actual duration | Time-style duration input; seconds are canonical | Duration greater than 0; <code>Enter a valid duration.</code> |
| <code>fixed_time</code> | Fixed <code>Planned duration · {seconds} sec</code>; Actual distance <code>m</code> | Integer meters | At least 1m; <code>Enter a valid distance.</code> |
| <code>intervals</code> | Fixed protocol summary; Completed rounds + Completed work duration | Integer rounds; time-style duration | Nonnegative; <code>Enter valid completed work.</code> |
| <code>unscored</code> | <code>Completion only · no performance ranking</code> | No numeric field | Save records completion only |

Where shipped facts exist, the editor may expose source choices in this order: <code>Recommended</code>, <code>Last workout</code>, <code>Plan default</code>. Choosing one updates the draft only; Save remains mandatory.

Direct entry and steppers are both required for load/reps/timed fields. At 200% text, two-column fields stack to one column and the software keyboard must not cover the active field or Save action.

---

## Add Set, Session Editing, and Menus

### Add set menu

The per-exercise <code>+ Add set</code> opens exactly:

1. <code>Add warm-up set</code>.
2. <code>Add working set</code>.

No other set kind appears. The action remains scoped to the invoking exercise. A failed add leaves order and pointer unchanged and offers <code>Retry add warm-up</code> or <code>Retry add working set</code>.

### Exercise menu

The exercise overflow contains only:

1. <code>Timing</code>: one flat <code>Between-set rest</code> nonnegative number with explicit <code>sec</code>; step 15 seconds; persists immediately through the real command.
2. <code>Replace exercise</code>.
3. <code>Delete exercise</code>.

Trend is a separate 48dp icon action and never appears in this menu.

Delete is a two-activation destructive action. First activation changes only the action label to <code>Confirm delete {exercise name}</code>; second activation invokes the command. Dismissal resets the label and makes no mutation. If completed facts require the domain to retain the original as skipped, explain: <code>This exercise has completed sets. They will be retained and this exercise will be marked Skipped, not deleted.</code>

### Plan settings

The workout-level menu opens <code>Plan settings</code> with:

- Real plan/day identity and schedule summary.
- <code>Default rest</code> with explicit <code>sec</code>.
- <code>Weight increment</code> choices exactly <code>1.25</code>, <code>2.5</code>, <code>5</code>.
- <code>Sound and haptic cues remain controlled by device settings.</code>
- <code>Edit plan after workout</code> with trailing context <code>Schedule</code>.
- <code>Workout actions</code>, opening the preserved session-outcome sheet below. This native-only row keeps required outcomes reachable without adding another header icon or changing the exercise menu.

Changing the increment changes the entry preference only; it does not rewrite current targets, completed facts, or future plan data without the separate write-back flow.

#### Between-set rest persistence states

The exercise <code>Between-set rest</code> and plan <code>Default rest</code> controls use the same state model. The field always distinguishes the authoritative saved value from the editable draft.

| State | Visible contract | Accessibility and value preservation |
|---|---|---|
| Current | Input displays the authoritative value; supporting text <code>Saved rest · {saved seconds} sec</code> | Input name is <code>{Exercise | Default} between-set rest seconds</code>; value announces <code>{saved seconds} seconds, saved</code> |
| Draft changed | Input displays <code>{draft seconds}</code>; supporting text remains <code>Saved rest · {saved seconds} sec</code> | Announce <code>{draft seconds} seconds entered. Saved value is {saved seconds} seconds.</code>; do not mutate the authoritative value |
| Save pending | Input retains <code>{draft seconds}</code>; status <code>Saving rest…</code>; the field and retry action are busy/disabled | Announce busy once; duplicate writes are suppressed; current sets, targets, and active rest are unchanged |
| Saved | Input becomes the new authoritative value; status <code>Rest saved · {saved seconds} sec</code> | Polite live announcement; no toast may cover the dock |
| Exercise save failed | Heading <code>Exercise rest was not saved</code>; body <code>Your saved between-set rest is still {saved seconds} sec. The entered {draft seconds} sec is still here.</code> | Keep the draft in the input and expose <code>Retry saving exercise rest</code>; dismissal restores the saved value |
| Plan save failed | Heading <code>Default rest was not saved</code>; body <code>Your saved default rest is still {saved seconds} sec. The entered {draft seconds} sec is still here.</code> | Keep the draft in the input and expose <code>Retry saving default rest</code>; dismissal restores the saved value |
| Retry pending | Retain <code>{draft seconds}</code> and show <code>Saving rest…</code> again | Reuse the same bounded request identity; success enters Saved, repeat failure returns to the matching failure state without replacing the authoritative value |

Changing a default never changes an already-running/paused rest. A recovered dock continues from its persisted deadline or paused remainder; the new default applies only when the domain starts a later eligible rest.

#### Weight-increment persistence states

The visible choices remain exactly <code>1.25</code>, <code>2.5</code>, and <code>5</code>. Each button has the accessible name <code>{value} kilograms</code>, role radio, and checked/selected state. The selected row also renders literal text <code>{value} kg · Selected</code>; color or border alone is insufficient.

| State | Visible contract | Accessibility and value preservation |
|---|---|---|
| Current | The authoritative choice is selected and labelled <code>{saved value} kg · Selected</code> | Radio state is checked; announce <code>{saved value} kilograms, saved and selected</code> |
| Draft changed | The chosen draft has focus and <code>{draft value} kg · Selected</code>; supporting text <code>Saved increment · {saved value} kg</code> remains | Announce <code>{draft value} kilograms selected. Saved value is {saved value} kilograms.</code>; current target rows do not change |
| Save pending | Draft remains selected; status <code>Saving weight increment…</code>; all three choices are busy/disabled | Duplicate writes are suppressed; authoritative preference and workout values remain unchanged |
| Saved | New authoritative choice remains selected; status <code>Weight increment saved as {saved value} kilograms.</code> | Polite live announcement |
| Save failed | Heading <code>Weight increment was not saved</code>; body <code>Your saved increment is still {saved value} kilograms. {draft value} kilograms remains selected for retry.</code> | Expose <code>Retry saving weight increment</code>; <code>Return to Workout</code> restores the saved selection |
| Retry pending | Draft remains selected and status returns to <code>Saving weight increment…</code> | Reuse the same bounded request identity; success enters Saved, repeat failure retains both saved and draft values |

These controls never rewrite plan targets, active set values, committed results, or history. A failure never presents the draft as saved.

### Exercise picker

- Sheet heading: <code>Add exercise</code> or <code>Choose exercise</code> for replacement.
- Search label: <code>Search exercises</code>.
- Single-select rows show full exercise name and metric/equipment context.
- Add confirmation: <code>Add {exercise name}</code>.
- Replace confirmation: <code>Replace with {exercise name}</code>.
- Empty: <code>No exercises found</code> — <code>Try a different search or clear a filter.</code>
- Loading preserves sheet geometry and disables confirmation.
- Search and picker scroll independently; keyboard must not hide results or confirmation.

### Reorder

- Each exercise exposes a 48dp grip. Drag activates after 8dp movement.
- A cancelled pointer/gesture never submits a reorder.
- Reorder mode exposes <code>Move {exercise name} up</code> and <code>Move {exercise name} down</code>. Impossible endpoints are disabled.
- Touch drag and accessible fallback call the same revision-checked command.
- While committing, repeated moves are disabled and the current exercise/set identity does not change.
- Success announces <code>{exercise name} moved to {position} of {total}</code>.
- Failure: <code>Exercise could not be reordered</code> — <code>Your workout order was not changed. Try again from the latest workout.</code> with <code>Retry reordering exercise</code>.

---

## Command Dock and Rest

### Ready / saving / failed

The compact dock is one row:

| Left | Right |
|---|---|
| <code>+ Add exercise</code> | <code>Complete warm-up W{N}</code> or <code>Complete set {N}</code> |

Completion states:

| State | Right action |
|---|---|
| Ready | Exact current warm-up/working label |
| Commit in flight | <code>Saving set…</code>; busy/disabled; no optimistic check, progress, rest, collapse, haptic, or next pointer |
| Failed | <code>Set not saved · Retry</code>; same entered values and current row remain |
| No current set | Compact row is replaced by full-width <code>Finish workout</code> |

### Rest dock

A committed working set that requires rest replaces the entire compact row with one full-width dock. Do not collapse the dock and do not keep Add/Complete visible behind it.

| Element | Exact contract |
|---|---|
| Status | <code>RESTING</code> or <code>REST PAUSED</code> |
| Context | <code>{exercise name} · working set {N} next</code> |
| Clock | <code>MM:SS</code>, IBM Plex Mono 30sp, tabular; visible update is not announced every second |
| Controls | <code>−15</code>, <code>Pause</code>/<code>Resume</code>, <code>+15</code>, <code>Skip</code> |
| Accessible labels | <code>Subtract 15 seconds from rest</code>, <code>Pause rest</code>/<code>Resume rest</code>, <code>Add 15 seconds to rest</code>, <code>Skip rest</code> |
| Bounds | Never below 0; plus is capped by the durable domain limit |
| Expiry/Skip | Return to ready Add/Complete dock and announce <code>Rest complete. Next set ready.</code> or <code>Rest skipped. Next set ready.</code>; never complete a set |

Rest state is derived from the authoritative deadline/paused remainder and revision. Backgrounding, process death, offline restart, clock correction, or theme change must not reset it. Device-owned sound/haptic cues remain non-blocking; cue failure renders <code>Countdown sound unavailable</code> without changing the timer or set.

Top toasts sit below the active header and above scrolling content; they never cover the dock. Contextual Undo uses the transient message <code>Set {N} saved · Undo set ({seconds} sec)</code> with action <code>Undo completed set</code>. Undo is never a permanent fifth dock control.

---

## Trend

The dedicated trend action opens a bottom sheet with:

- Heading <code>{exercise name} trend</code>.
- Summary.
- Accessible chart labelled <code>Exercise performance over six sessions</code> with a written description.
- Facts in order: <code>Recent</code>, <code>Best</code>, <code>Change</code>.
- Up to six comparable session rows in reverse chronological order.

If comparable evidence is absent, show <code>Not enough comparable history yet</code> and explain that the current workout is unchanged. Never fabricate a point, best, change, or comparison across incompatible metric profiles.

---

## Finish, Completion, Partial, and Recovery

### Session outcome sheet

<code>Workout actions</code> in Plan settings opens a native sheet containing only applicable outcomes:

- <code>Finish workout</code> when no active set remains.
- <code>Reorder exercises</code> / <code>Done reordering</code>.
- <code>Finish as partial</code>.
- <code>Finish workout later</code>.
- <code>Discard workout</code>.

<code>Finish workout later</code> leaves the durable session resumable and returns to Workout. It does not create a completion fact, reset rest, or discard drafts already committed.

### Confirmations

| Outcome | Heading | Body | Return action | Confirm |
|---|---|---|---|---|
| Zero completed working sets | <code>Finish without working sets?</code> | <code>This workout will be saved with zero completed working sets.</code> | <code>Keep training</code> | <code>Save zero-set workout</code> |
| Partial | <code>Save partial workout?</code> | <code>You completed {completed exercises} of {planned exercises} exercises and {completed working sets} working sets. You can resume later when this session remains valid.</code> | <code>Keep training</code> | <code>Save partial workout</code> |
| Discard | <code>Discard workout?</code> | <code>This ends the workout and marks it discarded. It cannot be resumed.</code> | <code>Keep workout</code> | <code>Discard workout</code> |

<code>Return to Workout</code>, Back, or scrim leaves the session active. Confirm stays busy/disabled until the authoritative result.

### Outcome pending, failure, and retry states

Every outcome is commit-gated. While pending, keep the Active Workout visible under the modal, keep the invoking confirmation open, show the exact pending label below, mark both confirm and return actions busy/disabled, and suppress duplicate commands. No completion screen, discarded state, or root navigation transition occurs before the authoritative result.

| Operation | Pending label | Failure heading | Failure body | Retry action |
|---|---|---|---|---|
| Finish completed workout | <code>Finishing workout…</code> | <code>Workout was not finished</code> | <code>Your workout is still active. Your completed sets and rest are unchanged. Try finishing again.</code> | <code>Retry finishing workout</code> |
| Save partial workout | <code>Saving partial workout…</code> | <code>Partial workout was not saved</code> | <code>Your workout is still active. Your completed sets and current rest are unchanged. Try saving the partial workout again.</code> | <code>Retry saving partial workout</code> |
| Finish workout later | <code>Saving workout for later…</code> | <code>Workout was not saved for later</code> | <code>You are still in the active workout. Your saved sets and rest are unchanged. Try again or keep training.</code> | <code>Retry saving workout for later</code> |
| Save zero-set workout | <code>Saving zero-set workout…</code> | <code>Zero-set workout was not saved</code> | <code>The workout is still active with zero completed working sets. Try saving it again or keep training.</code> | <code>Retry saving zero-set workout</code> |
| Discard workout | <code>Discarding workout…</code> | <code>Workout was not discarded</code> | <code>The workout is still active. No saved set or history fact was removed. Try again or keep the workout.</code> | <code>Retry discarding workout</code> |

On failure, the confirmation becomes an error sheet with the same operation context. The first focused action is the retry action; <code>Return to Workout</code> is second and closes the sheet without mutation. A timeout or unknown result must first reload the authoritative session; never guess whether Finish/Partial/Later/Zero-set/Discard committed.

### Completion screen

| State | Exact contract |
|---|---|
| Complete | Eyebrow <code>WORKOUT SAVED</code>; title <code>Workout complete</code> |
| Partial | Eyebrow <code>PARTIAL SAVED</code>; title <code>Workout saved</code>; <code>Partial · {completed} of {planned} exercises</code> |
| Context | Real plan/day or source label; literal <code>Modified from plan</code> when true |
| Metrics | <code>Duration</code>, <code>Exercises</code>, <code>Working sets</code> |
| Results | <code>Exercise results</code>; factual top working set, total working reps when compatible, and <code>Warm-ups excluded</code> |
| Effort | For applicable load/reps exercises only: <code>How did {exercise} feel?</code>; <code>Easy</code>, <code>On target</code>, <code>Hard</code>, <code>Failed</code>; optional and non-blocking |
| Empty results | <code>No exercise summary yet</code> — <code>No completed comparable exercise results are available for this session.</code> |
| Summary failure | <code>Summary needs another try</code> — <code>Workout saved. Some summary details could not be calculated.</code>; <code>Retry summary</code> |
| Actions | <code>View workout details</code>; primary <code>Return to Today</code> |

### Plan write-back

Write-back is explicit and default-No:

- Heading: <code>Save these changes to the plan?</code>
- Body: <code>You changed this workout from its plan. Save these changes to {plan name} · {day name}?</code>
- Focused/default primary: <code>Keep plan as-is</code>.
- Affirmative secondary: <code>Save changes to plan</code>.
- Failure heading: <code>Changes were not saved to the plan</code>.
- Failure body: <code>Your completed workout is safe. Try again or keep the plan as-is.</code>
- Retry: <code>Retry saving changes</code>.

The sheet opens with <code>Keep plan as-is</code> focused. It remains the first focus target after validation failure, write failure, app foregrounding, or a screen-reader re-entry. <code>Save changes to plan</code> is never the default action.

#### Concrete change preview

The preview is a vertical list of factual change rows. Every row contains:

1. Exercise name as a heading.
2. <code>Current plan</code> and the current stored target.
3. <code>Proposed</code> and the workout-derived proposed target.
4. A separately visible unit/metric label; units are never inferred from column position.

| Metric | Example current row | Example proposed row | Unit label |
|---|---|---|---|
| Load + reps | <code>Current plan · 80 kg × 5</code> | <code>Proposed · 82.5 kg × 5</code> | <code>kg × reps</code> |
| Bodyweight reps | <code>Current plan · Bodyweight × 10</code> | <code>Proposed · Bodyweight × 12</code> | <code>reps</code> |
| Added load + reps | <code>Current plan · BW + 10 kg × 8</code> | <code>Proposed · BW + 12.5 kg × 8</code> | <code>added kg × reps</code> |
| Assisted reps | <code>Current plan · 25 kg assist × 8</code> | <code>Proposed · 22.5 kg assist × 8</code> | <code>assistance kg × reps</code> |
| Timed hold | <code>Current plan · 45 sec</code> | <code>Proposed · 50 sec</code> | <code>sec</code> |
| Fixed distance | <code>Current plan · 2000 m</code> | <code>Proposed · 2500 m</code>, only when that exact change exists in the domain preview | <code>m</code> |
| Fixed time | <code>Current plan · 720 sec</code> | <code>Proposed · 660 sec</code>, only when that exact change exists in the domain preview | <code>sec</code> |
| Intervals | <code>Current plan · 6 rounds · 30 sec work</code> | Factual proposed protocol summary | <code>rounds · sec work · sec rest</code> |
| Unscored | No target write-back row | No proposed performance value | <code>completion only</code> |

Only rows whose authoritative current and proposed targets differ are listed. Do not convert a result into a proposal in presentation code, compare formatted strings, or offer unsupported metric changes.

Overflow contract:

- The preview body scrolls within the shared 80%-maximum sheet; the heading and action footer remain reachable without horizontal scrolling.
- At 200% text and on narrow/landscape viewports, each row stacks in order Exercise → Current plan → Proposed → Unit.
- Long exercise names wrap fully; numeric value and unit remain together.
- A long preview renders every changed row; it does not summarize hidden differences as “and more.”

No-difference contract:

- Heading: <code>No plan changes to review</code>.
- Body: <code>This workout does not change future targets. Keep the plan as-is.</code>
- Only action: <code>Keep plan as-is</code>, focused.
- Do not show or enable <code>Save changes to plan</code>.

Finishing never silently modifies future targets. Closing the prompt and <code>Keep plan as-is</code> preserve the completion and leave the plan untouched.

### Recovery truth

- Reopen the exact saved session identity, committed set facts, draft values that have a durable draft record, active exercise/set pointer, plan/schedule provenance, and between-set rest.
- A failed refresh after a committed mutation must distinguish “command did not commit” from “command committed but latest view failed.”
- Committed-refresh message: <code>{change} saved. Reload workout</code> — <code>The change was saved, but the latest workout could not be loaded. Return to Workout and reopen this session.</code>
- No recovery state may infer completion from a toast, timer expiry, animation, or stale UI cache.
- Offline is normal. Do not show a generic offline warning or disable any workout-critical-path action.

---

## Legacy Cadence / Cluster Owner Checkpoint

<code>TIM-01</code> is unresolved and blocks any runtime playback retirement decision.

Locked now:

- No cadence, per-rep pacing, rest-between-reps, cluster-gap, nested Advanced Timing, or plan sound/haptic authoring UI appears anywhere in Workout, set editors, exercise menus, plan settings, recovery, or completion.
- Preserve schema-21/27 configuration, resolved snapshots, state rows, target ownership, backup/restore parsing, committed sets, active pointer, plan/schedule provenance, and between-set rest.
- Do not delete, rewrite, normalize, or present old timing facts as off merely because the authoring UI is hidden.
- Flat between-set rest with explicit <code>sec</code> is a different supported feature and remains visible.

Pending owner checkpoint before implementation may disable hidden authoring, foreground reconciliation, queued callbacks, and playback. Until that checkpoint is accepted, plans must not claim that playback retirement is approved.

If the owner approves the proposed retirement policy, the compatibility notice is exactly:

<code>Repetition and cluster cues are no longer available. Saved sets and between-set rest are preserved.</code>

If zero-cue behavior cannot be proven across foreground, queued callback, relaunch, restore, and merge while rest recovery still works, block cutover and retain the old recovery path. Do not ship a UI-only retirement.

---

## Copywriting Contract

| Element | Exact copy |
|---|---|
| Root primary | <code>Start {day name}</code> or <code>Resume workout</code> |
| Root no action | <code>Nothing scheduled</code> |
| Non-mutating sheet return | <code>Return to Workout</code>; this is the only generic sheet-dismissal label in Phase 15 |
| Running context | <code>ALSO SCHEDULED</code>; <code>View plan</code>; <code>Sync Garmin</code> |
| Active identity | <code>Active · saved offline</code> |
| Reorder hint | <code>Hold ⠿ to reorder</code> |
| Set columns | <code>Set</code>; <code>Previous</code>; <code>Target</code>/<code>Result</code>; <code>State</code> |
| Set states | <code>Completed</code>; <code>Current</code>; <code>Planned</code>; <code>Skipped</code>; <code>Saving set…</code> |
| Set Save | <code>Save set values</code>; <code>Save committed set edit</code> |
| Set failure | <code>Set not saved</code> — <code>Your values are still here. The set was not completed and rest did not start.</code>; <code>Set not saved · Retry</code> |
| Add set | <code>Add warm-up set</code>; <code>Add working set</code> |
| Compact dock | <code>+ Add exercise</code>; <code>Complete warm-up W{N}</code>/<code>Complete set {N}</code> |
| Rest | <code>RESTING</code>/<code>REST PAUSED</code>; <code>−15</code>; <code>Pause</code>/<code>Resume</code>; <code>+15</code>; <code>Skip</code> |
| Rest setting state | <code>Saved rest · {saved seconds} sec</code>; <code>Saving rest…</code>; <code>Rest saved · {saved seconds} sec</code> |
| Rest setting failures | <code>Exercise rest was not saved</code> / <code>Default rest was not saved</code>; retained saved/draft body from the persistence-state table; <code>Retry saving exercise rest</code> / <code>Retry saving default rest</code> |
| Increment state | <code>{value} kg · Selected</code>; <code>Saved increment · {saved value} kg</code>; <code>Saving weight increment…</code>; <code>Weight increment saved as {saved value} kilograms.</code> |
| Increment failure | <code>Weight increment was not saved</code> — <code>Your saved increment is still {saved value} kilograms. {draft value} kilograms remains selected for retry.</code>; <code>Retry saving weight increment</code> |
| Exercise menu | <code>Timing</code>; <code>Replace exercise</code>; <code>Delete exercise</code> |
| Delete confirmation | <code>Confirm delete {exercise name}</code> |
| Picker | <code>Choose exercise</code>; <code>Search exercises</code>; <code>Add {exercise name}</code>; <code>Replace with {exercise name}</code> |
| Picker empty | <code>No exercises found</code> — <code>Try a different search or clear a filter.</code> |
| Add failure | <code>Exercise was not added</code> — <code>Your workout was not changed. Try again from the latest workout.</code>; <code>Retry adding exercise</code> |
| Replace failure | <code>Exercise could not be replaced</code> — <code>Your workout was not changed. Try again from the latest workout.</code>; <code>Retry replacing exercise</code> |
| Delete failure | <code>Exercise could not be removed</code> — <code>Your workout was not changed. Try again from the latest workout.</code>; <code>Retry removing exercise</code> |
| Reorder failure | <code>Exercise could not be reordered</code> — <code>Your workout order was not changed. Try again from the latest workout.</code>; <code>Retry reordering exercise</code> |
| Finish actions | <code>Finish workout</code>; <code>Finish as partial</code>; <code>Finish workout later</code>; <code>Discard workout</code> |
| Finish failure | <code>Workout was not finished</code> — <code>Your workout is still active. Your completed sets and rest are unchanged. Try finishing again.</code>; <code>Retry finishing workout</code> |
| Partial failure | <code>Partial workout was not saved</code> — <code>Your workout is still active. Your completed sets and current rest are unchanged. Try saving the partial workout again.</code>; <code>Retry saving partial workout</code> |
| Save-later failure | <code>Workout was not saved for later</code> — <code>You are still in the active workout. Your saved sets and rest are unchanged. Try again or keep training.</code>; <code>Retry saving workout for later</code> |
| Zero-set failure | <code>Zero-set workout was not saved</code> — <code>The workout is still active with zero completed working sets. Try saving it again or keep training.</code>; <code>Retry saving zero-set workout</code> |
| Discard failure | <code>Workout was not discarded</code> — <code>The workout is still active. No saved set or history fact was removed. Try again or keep the workout.</code>; <code>Retry discarding workout</code> |
| Completion actions | <code>View workout details</code>; <code>Return to Today</code> |
| Plan-change preview | <code>Current plan</code>; <code>Proposed</code>; explicit metric/unit; <code>Keep plan as-is</code> focused; <code>Save changes to plan</code> |
| No plan difference | <code>No plan changes to review</code> — <code>This workout does not change future targets. Keep the plan as-is.</code>; only <code>Keep plan as-is</code> |
| Write-back failure | <code>Changes were not saved to the plan</code> — <code>Your completed workout is safe. Try again or keep the plan as-is.</code>; <code>Retry saving changes</code> |

Voice is factual, calm, local-first, and commit-aware. Never use praise, shame, streak, readiness, fatigue, injury, or inferred performance language.

---

## Responsive, Input, and Accessibility Contract

### Compact, medium, expanded, landscape

- Compact under 600dp: one column; 16dp page inset; bottom navigation on Workout root.
- Medium 600–839dp: 24dp inset; active session remains one vertically ordered primary region.
- Expanded 840dp and above: 32dp inset; Phase 14 still keeps bottom navigation per D14-01; no rail substitution.
- Active Workout content is centered and capped at 720dp. Dock spans the same content region and never moves to a distant side pane.
- Landscape retains the sticky header and dock, gives remaining height to the one session scroll owner, and keeps the current row plus primary dock action reachable. Sheets use available width/height without becoming a two-pane dashboard.

Native acceptance must cover every row below. Each row is exercised in Light and Dark, plus System resolving once to each appearance; at 100% and 200% text; with touch and keyboard/D-pad; and with standard and reduced motion. The 390 × 844 row also receives the Revision 18 overlay comparison.

| Viewport | Class / orientation | Required evidence |
|---|---|---|
| 360 × 800 | Compact portrait | Workout root, long five-day labels, full exercise list, compact dock, full rest dock, every sheet, completion, and plan preview fit without horizontal scroll |
| 390 × 844 | Reference portrait | Direct Revision 18 hierarchy/spacing/state comparison for root, active overview, editor, warm-ups, rest, menus, and Light/Dark |
| 600 × 960 | Medium portrait | 24dp inset, one primary active-work region, centered dock, no automatic rail |
| 840 × 1080 | Expanded portrait equivalent | 32dp inset, active content capped at 720dp, four-root bottom navigation retained, no distant side-pane action |
| 800 × 360 | Compact landscape | Sticky header/dock and current row remain reachable; session content and sheets scroll vertically; keyboard cannot cover Save |
| 960 × 600 | Medium landscape | Same reading/focus order as portrait; plan-change rows stack before any horizontal overflow |
| 1080 × 840 | Expanded landscape equivalent | Active work remains a single centered region; no rail substitution; completion and preview actions remain adjacent to their content |

Across the matrix, capture at minimum: scheduled root, rest/no-plan root, recovered session, all three set states, one long two-line exercise name, each metric-editor shape, Save failure, full rest/running/paused/failed states, add/replace/delete/reorder, partial and complete summaries, long plan-change preview, no-difference preview, and an outcome retry.

### 200% text

- Headers, rows, buttons, notices, and sheets grow vertically.
- Exercise name clamp is relaxed before required content is truncated.
- Set-table columns may reflow into labelled value groups while preserving the semantic order Set → Previous → Target/Result → State.
- Compact Add/Complete may stack vertically only when two buttons cannot each preserve 48dp targets and full labels; Add remains first and Complete remains dominant.
- Rest context and clock may occupy separate lines; the four controls wrap into two rows without horizontal scrolling.
- Metric fields stack one per row; unit remains visually bound to its value.
- Bottom navigation retains all four visible one-word labels.
- No required action, unit, status, or error message is ellipsized.

### Keyboard, D-pad, screen reader

- Focus order follows visual order; every control supports touch, Enter, Space, semantic activate, and D-pad.
- Day selector uses Arrow Left/Right plus Home/End and roving focus.
- Each route has one heading. Sheets focus their heading, trap modal focus, support Escape/Android Back, and restore the invoking control.
- Visible focus is at least 2dp using the blue focus token and is never clipped.
- State announcements are polite except destructive/commit failure headings, which are assertive. Timer ticks are never announced; announce only meaningful thresholds and expiry.
- Grip drag has Move up/down alternatives. No required action is drag-only, swipe-only, or long-press-only.
- Icons are decorative when visible text/accessible labels already carry meaning.

Exact icon-control labels:

| Icon/control | Accessible label | State/hint contract |
|---|---|---|
| Workout root Settings gear | <code>Open App Settings</code> | Exposes expanded when the settings sheet is open |
| Active header Back arrow | <code>Back to Workout</code> | Hint: <code>Returns to Workout without ending this active session.</code> |
| Active header ellipsis | <code>Open Plan settings</code> | Exposes expanded and controls the Plan settings sheet |
| Exercise grip | <code>Reorder {exercise name}</code> | Hint: <code>Drag, or use Move up and Move down actions.</code> |
| Exercise trend | <code>View {exercise name} trend</code> | Opens the trend sheet without toggling disclosure |
| Exercise ellipsis | <code>Open {exercise name} menu</code> | Exposes expanded and controls the exercise menu sheet |
| Exercise disclosure | <code>{exercise name}. {status and progress}. {Expand | Collapse} exercise.</code> | Exposes expanded; Enter/Space equals tap |
| Any sheet close X | <code>Return to Workout</code> | Set editor adds hint <code>Entered changes will not be saved.</code>; restores invoking row/control |
| Completed check | Hidden from accessibility | Row label includes <code>Completed</code> |
| Current clock | Hidden from accessibility | Row label includes <code>Current</code> |
| Planned dash | Hidden from accessibility | Row label includes <code>Planned</code> |
| Rest minus | <code>Subtract 15 seconds from rest</code> | Disabled at the lower bound |
| Rest pause/play | <code>Pause rest</code> / <code>Resume rest</code> | Exposes pressed only while paused |
| Rest plus | <code>Add 15 seconds to rest</code> | Disabled at the domain upper bound |
| Rest skip | <code>Skip rest</code> | Does not complete a set |
| Reorder fallback arrows | <code>Move {exercise name} up</code> / <code>Move {exercise name} down</code> | Impossible endpoint is disabled |
| Contextual Undo | <code>Undo completed set</code> | Announces the remaining undo window in adjacent text |

Visible-text controls keep their literal text as the accessible name. Their companion icons are hidden from accessibility so names are not duplicated.

### Reduced motion

- Set commit state change is immediate; no positional travel, spring, bounce, scale, or celebratory animation.
- Dock replacement uses opacity only and never delays command acknowledgement.
- Sheet presentation uses fade only.
- Automatic reveal uses non-animated scroll while still moving focus to the authoritative next exercise/set.
- Timer and numeric updates remain direct.

---

## UI Considerations

Applicable state considerations resolved: 37 covered, 9 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|---|---|---|---|
| empty | Workout root, no active plan | ✅ covered | Show starting-plan entry and explicit empty-workout path; never invent a scheduled workout. |
| empty | Active workout, zero exercises | ✅ covered | Show <code>Empty workout in progress</code>, Add, zero-set save, finish later, and discard. |
| empty | Exercise picker | ✅ covered | Use the exact no-results copy; confirmation is absent. |
| empty | Completion results | ✅ covered | Use <code>No exercise summary yet</code> and retain completion actions. |
| empty | Trend | ✅ covered | State that comparable history is insufficient; no fabricated chart points. |
| loading | Workout root trusted read | ✅ covered | Fixed-shape placeholders contain no stale facts and expose no mutation. |
| loading | Start / Resume | ✅ covered | Primary action is busy/disabled; selected occurrence and root facts remain visible. |
| loading | Set Save / Complete | ✅ covered | Row remains current with values; dock says <code>Saving set…</code>; duplicate input is suppressed. |
| loading | Add/replace/delete/reorder | ✅ covered | Invoking context remains visible; actions expose busy/disabled and do not optimistically reorder/remove. |
| loading | Picker and trend | ✅ covered | Preserve sheet geometry; disable confirmation until real content is ready. |
| loading | Completion summary/write-back | ✅ covered | Durable completion remains visible while derived summary/write-back is busy. |
| loading | Rest and increment settings | ✅ covered | Draft and saved values remain distinguishable while the bounded write/retry is pending; repeat input is suppressed. |
| error | Root/start/read | ✅ covered | Saved-data assurance and exact retry path; no invented fallback facts. |
| error | Set commit | ✅ covered | Preserve entered values/current pointer; exact Retry; no false completion/rest. |
| error | Rest command/cue | ✅ covered | Keep authoritative prior rest; retry command or show non-blocking cue failure. |
| error | Rest and increment settings | ✅ covered | Scope-specific headings/bodies preserve both authoritative and draft values and expose exact retry actions. |
| error | Session edits | ✅ covered | Operation-specific unchanged-workout message and retry; committed-refresh failure is distinct. |
| error | Workout outcomes | ✅ covered | Finish, partial, later, zero-set, and discard each have a distinct pending label, failure heading/body, and retry action. |
| error | Completion summary | ✅ covered | Completion remains saved; Retry summary affects only derivation. |
| error | Plan write-back | ✅ covered | Completion remains saved and plan remains unchanged; default-No and Retry stay available. |
| populated | Workout root | ✅ covered | Identity/action precede full preview; Running context follows Strength. |
| populated | Full active session | ✅ covered | Every exercise remains in one scroll owner with current disclosure and fixed dock. |
| populated | Set row state | ✅ covered | Planned/current/completed/skipped/saving each has text, icon, color, and command behavior. |
| populated | Rest | ✅ covered | Full-width dock shows status, next-set context, clock, and all four controls. |
| populated | Completion | ✅ covered | Factual context, metrics, results/effort, modified state, details, and return actions. |
| populated | Plan-change preview | ✅ covered | Each changed exercise shows Current plan, Proposed, and explicit units from the authoritative preview; Keep plan as-is receives focus. |
| empty | Plan-change preview | ✅ covered | No differences renders the exact no-change heading/body and only focused Keep plan as-is. |
| partial | Mixed completed/planned rows | ✅ covered | Preserve each row's source state; one current pointer; no aggregate state hides incomplete work. |
| partial | Saved partial workout | ✅ covered | Explicit partial heading and real counts; no false 100% or completed label. |
| partial | History-preserving replace/delete | ✅ covered | Retain completed facts as Skipped when required and exclude them from remaining work. |
| partial | Missing previous/target fact | ✅ covered | Render an em dash or explicit unavailable text; never copy another metric or invent a value. |
| zero-one-many | Exercises | ✅ covered | Zero uses empty-session contract; one/many use the same section model and persisted order. |
| zero-one-many | Warm-up and working rows | ✅ covered | Separate ordinal domains remain correct for zero/one/many of each kind. |
| zero-one-many | Picker/trend sessions | ✅ covered | Zero has exact empty copy; one/many remain scrollable and single-select/comparable. |
| overflow | Full active list | ✅ covered | One vertical scroll owner plus measured dock clearance; no nested horizontal list. |
| overflow | Sheets and keyboard | ✅ covered | Max-height scroll plus keyboard avoidance keeps heading, fields, and Save reachable. |
| overflow | Long plan-change preview | 🧪 backstop | All change rows remain in the 80%-maximum vertical sheet; actions stay reachable and rows stack at 200%/landscape without horizontal scroll. |
| overflow | Rest and action controls | 🧪 backstop | Native visual tests at 360dp, landscape, and 200% verify wrap without lost controls or horizontal scrolling. |
| overflow | Reorder | ✅ covered | Drag plus Move up/down; first/last bounds; cancel never commits. |
| long-text | Plan/day and exercise names | 🧪 backstop | Standard scale uses two-line exercise names; 200% relaxes clamp and visual tests verify no action collision. |
| long-text | Dynamic buttons and confirmations | 🧪 backstop | Labels wrap and targets grow; destructive names and plan/day names remain complete. |
| long-text | Metric/unit groups | 🧪 backstop | Fields stack and units remain attached at 200%; no numeric shrink or clipping. |
| long-text | Completion/error copy | 🧪 backstop | Completion, partial, retry, and write-back sheets scroll and retain full text/focus order. |
| overflow | Light/Dark/System parity | 🧪 backstop | Native screenshots at all target widths verify the same hierarchy and semantic states. |
| populated | Process-death recovery | 🧪 backstop | Native relaunch evidence verifies exact session/pointer/rest/values and no duplicate command. |
| populated | Legacy timing compatibility | 🧪 backstop | TIM-01 proof must cover foreground, queued callback, relaunch, restore, and merge before any playback retirement. |

---

## Prohibitions

Do not:

- Add a fifth root, Profile/Running/Garmin tab, automatic rail, or in-app run recorder.
- Add cadence, rep pacing, rest-between-reps, cluster gaps, nested Advanced Timing, timing indicators, or plan sound/haptic controls.
- Add a second current-set stripe, per-row structural edge, decorative progress marker, or color-only state.
- Add a visible Edit button to set rows.
- Collapse the rest dock, retain Add/Complete behind it, or place Undo as a permanent dock control.
- Put Trend inside the exercise menu.
- Add actions to the exercise menu beyond Timing, Replace exercise, and Delete exercise.
- Add set types beyond warm-up and working.
- Count warm-ups as working progress or start between-set rest after a warm-up.
- Acknowledge set completion, change row to green, collapse an exercise, advance focus, start rest, or play success feedback before commit.
- Mutate schedule rotation from a day preview.
- Optimistically remove/reorder/replace protected facts.
- Silently write workout changes back to the plan.
- Use localStorage, fixture values, UI caches, timers, or animation completion as source truth.
- Invent historical values, trend points, Garmin facts, or summary percentages.
- Fork Phase 14 tokens, fonts, bottom sheets, toasts, focus, or appearance behavior.
- Substitute generic Material cards, chips, menus, colors, or motion when the oracle specifies another composition.

---

## WRK Traceability

| Requirements | Contract sections |
|---|---|
| WRK-01–06 | Workout root; Start alternatives; root loading/error/recovery |
| WRK-07–11 | Active composition; exercise disclosure; row state and sole-edge contract |
| WRK-12–15 | Metric editor contract and all nine metric profiles |
| WRK-16–20 | Warm-up/working ordering, Add set, commit-gated dock, failure, final-set collapse |
| WRK-21–23 | Full-width rest dock, controls, deadline/pause recovery, device-owned cues |
| WRK-24–28 | Trend, exact exercise menu, flat sec timing, plan increment, post-workout edit |
| WRK-29–33 | Picker add/replace/delete, reorder/accessibility, contextual Undo |
| WRK-34–36 | Finish/partial/later/discard, completion summary, default-No write-back |

All 36 parity rows remain <code>pending_implementation</code>; this draft specifies their UI contracts but does not claim native evidence.

---

## Registry Safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| shadcn official | none | Not applicable — Expo/React Native, no <code>components.json</code> |
| Third-party registry | none | No third-party registry or block is permitted in this phase |

---

## Six-Dimension Self-Check

| Dimension | Result | Evidence in this contract |
|---|---|---|
| 1. Copywriting | PASS | <code>Return to Workout</code> replaces generic dismissal copy; Finish/Partial/Later/Zero-set/Discard and setting writes each have exact pending, failure, and retry copy. |
| 2. Visuals | PASS | Workout/Active composition, one-edge hierarchy, warm-ups, row/dock/rest states, saved-versus-draft settings, plan-change rows, exact icon labels, and the seven-viewport matrix are explicit. |
| 3. Color | PASS | 60/30/10 allocation and Light/Dark semantic tokens are exact; accent reservations, state meanings, and contrast gate are explicit. |
| 4. Typography | PASS | Four semantic sizes and two logical weights are declared; Archivo/IBM Plex Mono roles and isolated numerical measurements are explicit. |
| 5. Spacing | PASS | Multiples-of-4 scale, one 80%-maximum sheet contract, 48dp targets, safe-area, 200%, landscape, keyboard rules, and the full viewport matrix are explicit. |
| 6. Registry safety | PASS | Native component system only; shadcn and third-party registries are not applicable. |

Self-check does not approve implementation. <code>TIM-01</code> remains a separate owner checkpoint.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved by gsd-ui-checker; explicit owner and external gates remain open where documented.
