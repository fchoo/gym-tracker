---
phase: 17
slug: library-running-plans
status: approved
reviewed_at: 2026-10-06T08:50:16Z
shadcn_initialized: false
preset: none
created: 2026-10-06
---

# Phase 17 — Library & Running Plans UI Design Contract

> Canonical visual and interaction contract for LIB-01 through LIB-36. Revision 18 is the presentation oracle; shipped SQLite, revision, history, recovery, and bundled-versus-user-owned boundaries remain authoritative.

---

## Source Contract

Apply sources in this order when details conflict:

1. `.planning/v1.2-OWNER-BRIEF.md`.
2. External `approved.json`, revision 18 latest-first.
3. External `approved-hybrid.html` rendered behavior and exact copy.
4. `.planning/design/v1.2-SOURCE-PRECEDENCE.md`.
5. Phase 17 CONTEXT, LIB-01 through LIB-36, prototype inventory/parity matrix, and `.planning/architecture/v1.2-multi-active-plans.md`.
6. Existing native implementation patterns for preserved routes.

Locked outcomes:

- The Library owns two remembered views: `Plans` and `Exercises`. Each view retains its own search query, filters, favorites, scroll offset, selected detail, and focus return target.
- Every `Create plan` entry opens the same neutral Strength/Running chooser, including the true-empty Plans state.
- Creation, duplication, starter copy, and import never activate a plan. Activation is a separate reviewed confirmation against current plan and schedule revisions.
- Strength routes and their integrity/recovery behavior remain available. Phase 17 restyles and reconnects them; it does not replace them with prototype-only state.
- Running plans use stable plan/session identities and immutable prospective revisions. Multiple sessions on the same weekday remain separate, stably ordered slots.
- Garmin connection remains optional and contextual. It never creates, activates, or auto-completes a plan.
- No gender, height, in-app run recorder, coaching guarantee, or medical/readiness judgment appears in Phase 17.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Project-native Expo/React Native design system inherited from Phase 14; no shadcn |
| Preset | Not applicable — this is an Android-first React Native project, not React web/Next.js/Vite |
| Component library | Project `src/ui` primitives: adaptive screen, editorial rows, fields, notices, skeletons, sheets/dialogs, confirmation sheets, and toasts |
| Icon library | `lucide-react-native`; icons are decorative when an adjacent label already names the action |
| Fonts | Bundled Archivo variable for interface text; bundled IBM Plex Mono for factual values, counts, status tags, times, distances, and compact day labels |
| Theme | Persisted `System`, `Light`, and `Dark`, consuming the Phase 14 semantic token implementation |

Phase 17 must not fork a Library-only theme or keep the shipped Source Sans/old Material palette. The Phase 14 visual-shell tokens are a hard dependency. Controls use the shared field, sheet, toast, focus, reduced-motion, and bottom-navigation components.

### Shape and control constants

| Token | Value | Contract |
|-------|-------|----------|
| Minimum target | 48dp | Every row action, icon action, tab, chip, reorder command, and sheet action |
| Standard field / toolbar action | 56dp minimum height | Search, filter, actions, select, text input, and primary submit |
| Deep-route header | 64dp minimum height | Back, kicker, title, trailing balance slot; safe-area added separately |
| List row | 88dp minimum | Plan/exercise/session rows grow with text and never clip |
| Active plan row | 120dp minimum | Identity, summary, next item, and disclosure |
| Radius small / medium / large | 8dp / 12dp / 16dp | Chips and inner controls / fields and rows / primary grouped surfaces |
| Divider | 1dp | Flat editorial sections; do not wrap every item in a card |
| Active-plan edge | 4dp | Orange structural marker; status text still names `Active` |
| Focus ring | 3dp blue with 3dp exterior offset | Visible for keyboard/D-pad focus in both themes |

---

## Spacing Scale

Declared layout values are multiples of four:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4dp | Tab inset, inline icon/text gap, compact status spacing |
| sm | 8dp | Paired actions, chips, row metadata gaps |
| md | 16dp | Screen gutters at 360–599dp, fields, list content, sheet content |
| lg | 24dp | Section separation and wide-screen gutters |
| xl | 32dp | Major form/list separation |
| 2xl | 48dp | Empty-state and major section breathing room |
| 3xl | 64dp | Header track and page-level breaks |

Exceptions: none for layout spacing. Safe-area insets and keyboard insets are additive environment values, not spacing tokens. The component heights above are geometry tokens, not spacing exceptions.

---

## Typography

Phase 17 inherits the Phase 14 shared type tokens exactly and declares no private sizes, weights, font aliases, or line heights. Android font scaling remains enabled.

| Shared Phase 14 role | Family | Size | Weight | Line Height | Phase 17 usage |
|----------------------|--------|------|--------|-------------|----------------|
| Supporting / mono | Archivo or IBM Plex Mono | 14sp | 400 | 20sp | Secondary facts, compact metadata, dates, times, distances, paces, counts, ordinals |
| Body / control | Archivo or IBM Plex Mono | 16sp | 400 | 22sp | Body copy, root-nav labels, inputs, status copy, ordinary factual values |
| Heading / action | Archivo | 20sp | 800 | 24sp | Route/section identity, chooser question, empty-state heading, primary action labels |
| Editorial display | Archivo variable, condensed width axis | 57sp | 800 | 49sp | Shared token remains available only for the Workout-root identity; Phase 17 does not use it |

The only actual font weights are 400 and 800. IBM Plex Mono always uses its packaged `IBMPlexMono_400Regular` face with tabular numerals; emphasis switches to Archivo 800 rather than introducing any additional mono weight. Use IBM Plex Mono only for data-like text. Prose, buttons, plan names, session names, and status phrases use Archivo.

Body line height is 1.375 (`22/16`); heading/action line height is 1.2 (`24/20`). Do not use all caps for normal buttons. Short status tags such as `ACTIVE`, `INACTIVE`, `STARTER`, `NEW PLAN`, and `STRUCTURED SESSION` use Archivo 800; `GYM` and `RUN` are compact identity labels, not a third typography role.

At 200% text, row and header heights expand; body and action copy wraps. Plan names may wrap to two visual lines in repeated collection rows when the full accessible name remains available, and fully reflow on detail routes. Never truncate an error, destructive consequence, confirmation phrase, recovery instruction, or primary action. Never reduce or horizontally transform type to preserve a fixed-height prototype screenshot.

---

## Color

### 60 / 30 / 10 composition

| Role | Light | Dark | Usage |
|------|-------|------|-------|
| Dominant (60%) | Paper `#FFFAF0` | Dark `#080808` | Root, deep-route and sheet background |
| Secondary (30%) | Bone `#F4F0E6`; surface `#F0EADF` | Surface `#151515`; raised `#202020` | Segmented control bed, fields, pressed/raised regions, bottom navigation |
| Accent (10%) | Orange `#D97820`, on-accent `#281306` | Orange `#D97820`, on-accent `#281306` | `Create plan`, primary creation actions, active Strength/plan edge, selected Library underline |
| Primary text | `#0D0C0A` | `#F7F7F2` | Titles, actions and values |
| Secondary text | `#655F56` | `#AAA9A2` | Supporting copy and metadata |
| Divider | `#CEC6B8` | `#333330` | Flat row and section separation |
| Running semantic | `#195FAE` on `#DCE9F9` | `#71AAFF` on `#14243B` | Running status tags, day labels, schedule/session identity, focus ring |
| Success / active | `#166B4C` on `#DCECDF` | `#72DF92` on `#14271A` | Active status, next item, committed success |
| Attention | `#8D5D00` on `#FFF0C2` | `#F0C84B` on `#2A2410` | Revision/stale warning only |
| Destructive | `#B42318` on `#FEE4E2` | `#FF8279` on `#3A1C1B` | Archive/delete confirmations and destructive inline notices only |

Accent is reserved for creation CTAs, selected Library navigation, Strength/active structural edges, and deliberate primary confirmation. It is not the color of every link, row, field, or icon. Running blue identifies sport/context; green identifies active/success; destructive red never substitutes for a generic error or inactive state.

Small Light-theme text must not use `#D97820` as its only signal because the measured contrast is insufficient. Keep critical labels in primary text and use orange as a non-text edge/fill with adjacent words. Phase 17 does not independently approve the pending Phase 14 accessible Strength-title token decision.

All statuses include words, icons, border/fill patterns, or `aria`/accessibility state; color is never the sole carrier.

---

## Visual Composition

### Library root

- Keep the shared four-destination bottom navigation: `Workout`, `Calendar`, `Library`, `Progress`. `Library` is selected with the orange underline. Never substitute a rail at 840dp.
- Use a warm paper/dark-instrument flat editorial surface, not a grid of elevated Material cards.
- Place the `Plans` / `Exercises` segmented control first. Selected state uses inverse text/surface, not accent alone.
- Keep a sticky tools block directly below it: search takes remaining width; Filter and Library actions are 56dp square. The filter badge shows the number of active filters and is absent at zero.
- Root content scrolls under the sticky tools block and remains above bottom navigation plus safe area.
- Section headings use a strong baseline rule, title on the left, count on the right.
- Active plans use a 4dp orange left edge, name, frequency/equipment, `Next · …`, and one disclosure action. `My Plans` and `Starter Plans` use flat 88dp rows.
- Exercise rows show name, `tracking · profile · equipment`, and a separate 48dp favorite toggle. The full row opens detail; favorite does not trigger row navigation.

### Deep routes and forms

- Deep routes are full-height Library-owned routes, not modal cards. Header columns are 48dp Back / flexible kicker-title / 48dp balance. Back label is `Back to Library` or the immediate parent editor.
- Intro blocks show status tag, identity/heading, and one concise explanation. Facts use two-column flat rows; at 200% text they stack label above value.
- Primary and secondary actions are stacked, full width, and at least 56dp. Destructive actions remain visually separated below non-destructive actions.
- Forms are one logical column at compact widths. At 600dp and wider, related short fields may use two columns only when reading and keyboard order remains left-to-right, top-to-bottom. Session preview and Save stay full width.
- Do not add fixed bottom docks that obscure the last field. The scroll view adds keyboard and navigation insets.

---

## Information Architecture and Route Contract

### Root and preserved Strength/exercise routes

| Destination | Route | Required interaction |
|-------------|-------|----------------------|
| Library root | `app/(tabs)/library.tsx` | Remember Plans/Exercises state independently and restore scroll/focus on detail return |
| Neutral chooser | `app/library/plan/create.tsx` | Every `Create plan` entry lands here; Back returns to its exact origin |
| Strength creation | `app/library/plan/create-strength.tsx` | Collect `Plan name` and `First day`, then open the real editor; save inactive |
| Owned plan summary | `app/library/plan/[planId]/index.tsx` | Status, schedule, history, source, training days, then actions |
| Strength plan editor | `app/library/plan/[planId]/edit.tsx` | Preserve day/exercise/set/all metric target editing, move/add/remove, draft guards, explicit save |
| Schedule editor | `app/library/plan/[planId]/schedule.tsx` | Future weekday/rotation bindings, selected state, effective-date impact, `Save schedule` |
| Exercise replacement | `app/library/plan/[planId]/replace/[occurrenceId].tsx` | Occurrence/all-occurrences scope, compatible metric, targets, refreshed impact preview |
| Plan-day removal | `app/library/plan/[planId]/day/[dayId]/remove.tsx` | Replacement/remove binding, effective date, active-workout guard |
| Starter detail | `app/library/starter/[templateId].tsx` | Immutable source/equipment/schedule/training-day preview |
| Starter activate/update | `app/library/starter/[templateId]/activate.tsx` | Actual affected schedule preview; preserve existing update query and `Create new copy` |
| Exercise detail | `app/library/exercise/[exerciseId].tsx` | Bundled/custom identity, instructions, tracking, equipment, last result, plan usage |
| Exercise create | `app/library/exercise/create.tsx` | `Name`, `Tracking`, `Equipment`; successful commit opens detail |
| Exercise copy/edit/migrate | `app/library/exercise/[exerciseId]/edit.tsx?mode=copy` and `?mode=metric` | Preserve future-target impact, policy choice, confirmation, current-workout guard |

### Running routes

| Destination | Route | Required interaction |
|-------------|-------|----------------------|
| Running create | `app/library/running/create.tsx` | Goal, benchmark provenance, availability and structured sessions; save inactive |
| Running detail | `app/library/running/[planId].tsx` | Status, goal/pacing/schedule, persisted weekly sessions, Garmin/match context, edit/activate/conflict actions |
| Running plan editor | `app/library/running/[planId]/edit.tsx` | Edit goal inputs and stable ordered session list; explicit save |
| Running session create | `app/library/running/[planId]/session/new.tsx` | Choose one of seven typed sessions; blank contextual fields, no fixture restoration |
| Running session edit | `app/library/running/[planId]/session/[sessionId].tsx` | Edit stable identity/revision, delete with confirmation, preserve common fields on type change |

The implementation may encode create as a reserved route parameter instead of `/new`, but it must remain a deep-linkable route and must not fabricate a persisted session ID before commit.

Back/Escape returns one route level, preserves committed Library state, and restores focus to the launching row/action. Switching to another root closes the Library deep stack; returning to Library restores the remembered root view rather than reopening a stale transient form.

---

## Library Root Interaction Contract

### Plans view

1. Render `Active Plans`, `My Plans`, and `Starter Plans` in that order; omit a group only when its filtered result count is zero.
2. Active Strength and Running plans coexist and remain separately labeled. Each shows frequency/equipment and its real next scheduled item.
3. Search placeholder is `Search plans`. Search covers plan name, schedule, equipment, and sport/source identity.
4. Plan filters are `Plan source` (`All`, `My plans`, `Starter`) and `Days per week` (`Any` plus actual stored counts). A Running identity must not be lost merely because the prototype's old fixture used a separate `running` kind.
5. Clearing filters keeps the search query and announces `Filters cleared. Search preserved.` Clearing search keeps filters.
6. `Create plan` appears after populated groups and in the true-empty state; both invoke the neutral chooser.

### Exercises view

1. Search placeholder is `Search exercises`. Search covers name, metric/tracking, profile, equipment, and custom/built-in identity.
2. Without search/filters, render `Favorites`, `Recent`, and `All Exercises` with counts. The same exercise may appear in more than one factual group; each row resolves to the same stable exercise identity.
3. With search or filters, render one `Search results` group.
4. Exercise filters are `Equipment` (`Any` and available equipment values) and `Saved` (`All exercises`, `Favorites only`).
5. Favorite toggles update their own pressed state and all duplicate row presentations without moving focus or opening detail.

### Library actions sheet

| Action | Supporting copy/state | Result |
|--------|-----------------------|--------|
| `Create plan` | `Strength or Running` | Close sheet and open neutral chooser |
| `Create exercise` | `+` | Close sheet and open custom-exercise create route |
| `Import plan` | `Later` | Disabled/inert; accessibility label says `Import plan, unavailable, Later`; never show success |

The sheet traps focus, opens on its first enabled action, closes with Back/Escape/scrim/Close, and restores focus to the Library actions button.

### Exercise content-update review and dismiss

This is the bundled exercise-content update state from LIB-23. It is separate from starter-template updates and never edits a custom exercise, owned/copied plan, plan reference, completed workout, or historical snapshot.

#### Updated state

- Render one completed-tone inline notice after Search and before Filters/results. It uses the shared flat notice surface and does not displace the remembered Plans/Exercises selection.
- Heading: `Exercise library updated`
- Body: `{added} added · {updated} updated · {unavailable} unavailable`
- Actions: `Review changes` and `Dismiss exercise library update`
- The notice appears only when at least one count is non-zero and the exact content revision plus pack SHA-256 has not been dismissed.
- `Review changes` opens the review sheet without changing the selected Library view, query, filters, favorites, selected row, scroll offset, or any open form draft.
- `Dismiss exercise library update` hides only this notice for the exact revision/hash. It does not roll back, delete, hide, accept, or otherwise mutate bundled/custom content or history. After the notice leaves the tree, focus moves to the Library search field for the current view. A later revision/hash may show a new notice.

#### Review sheet

- Sheet heading: `Exercise library changes`
- Summary: `{added} added · {updated} updated · {unavailable} unavailable`
- Integrity body: `Custom exercises, copied plans, existing plan references, and historical snapshots are unchanged.`
- Action: `Close changes`
- The sheet uses the shared modal/sheet frame, scrolls at 200% text and in landscape, traps focus, and focuses the heading on open so the summary is announced before the action.
- Back/Escape/scrim and `Close changes` close only the review sheet. Focus returns to `Review changes`; Library state and drafts remain intact. Reviewing does not implicitly dismiss the notice.

#### Update failure

- Heading: `Exercise content could not be updated`
- Body: `Exercise content could not be updated. The previous library is still available.`
- Action: `Retry updating exercise content`
- Keep the previous bundled content and every user-owned fact visible. Retry re-runs only the content-update check; it does not reload/reset the Library root, clear a draft, or mutate history. Focus moves to the error heading when it appears and returns to `Retry updating exercise content` when retry remains necessary.

---

## Neutral Plan Chooser and True Empty State

The neutral chooser uses this exact hierarchy and copy:

- Kicker: `Plans`
- Route title: `Create plan`
- Status: `NEW PLAN`
- Heading: `What are you training for?`
- Body: `Choose the plan structure first. Creating a plan does not activate it.`
- Strength label: `Strength`
- Strength description: `Exercises, sets, targets, and a gym schedule.`
- Running label: `Running`
- Running description: `Distance and time goal, benchmark, and structured weekly sessions.`
- Footer: `Garmin connection is optional after a Running plan is created. Imported activities never create or activate a plan automatically.`

Neither choice is preselected or visually promoted. Strength uses a `GYM` identity; Running uses `RUN`; both rows have equal height, disclosure, focus treatment, and target size.

True empty Plans is distinct from a filtered/search zero result:

- Heading: `No plans yet`
- Body: `Create a strength or running plan to get started.`
- CTA: `Create plan`

No-match state:

- Heading: `No matches`
- Plans body: `No plan matches your search and current filters.`
- Exercises body: `No exercise matches your search and current filters.`
- CTA: `Clear search and filters`

The true empty state is derived from zero persisted plans before filtering. It must never be reachable only through a fixture flag.

---

## Creation, Duplication, Activation, and Archive Boundaries

| Operation | Commit result | Next UI state |
|-----------|---------------|---------------|
| Create Strength | New user-owned inactive draft/ready plan | Owned plan detail with `INACTIVE`; no schedule replaced |
| Create Running | New user-owned inactive Running profile and ordered sessions, including zero sessions | Running detail with `INACTIVE`; optional Garmin link shown after success |
| Duplicate | Fresh identities and inactive lifecycle | New owned detail; original and history unchanged |
| Save starter editable copy | Inactive owned copy | Owned detail; starter remains immutable |
| Preview starter activation | No mutation | Name the current affected Strength plan/schedule and incoming copy |
| Activate / Reactivate | Only after explicit confirmation using current plan/schedule revisions | Commit success changes status; stale preview returns to reviewed preview |
| Archive | Future visibility/activation changes only | History and completed occurrences remain reachable; offer Reactivate where allowed |

Activation is never embedded in a creation submit label. Use `Create plan`, `Create running plan`, or `Save running plan` for structure; use `Preview activation` then `Activate plan` for activation.

An activation preview names the incoming plan, sport, currently active same-sport plan/schedule if any, and which future dates change. It states that the other sport remains unchanged. The UI consumes Phase 13 domain results and must not invent its own same-sport cardinality rule.

### Starter-template update route

An owned plan row with an accepted starter revision exposes a separate action labeled `Template update available`; its accessible name is `Template update available for {owned plan name}`. It opens the preserved route `app/library/starter/[templateId]/activate.tsx?mode=update&ownedPlanId={ownedPlanId}`. It never opens the starter-activation flow or updates the existing copy in place.

The route retains the originating Library view, query, filters, selected row, scroll offset, and any unrelated screen-local draft. Back from every state returns to the same owned-plan row and focuses its `Template update available` action.

| State | Exact visual/copy contract | Actions, focus, Back, and mutation |
|-------|----------------------------|------------------------------------|
| Loading | Header `Template update`; five shared skeleton blocks: one 96dp summary block and four 72dp comparison blocks | Announce `Loading template update`; do not focus skeletons. Back returns to the retained Library row; no mutation. |
| No update | Heading `No template update available`; body `Your copy already reflects the accepted template revision available on this device.` | Focus the notice heading when loading resolves. No create action. Back returns to Library; owned plan, draft, schedule, and history remain unchanged. |
| Load error | Heading `Template update could not be loaded`; body `Template update could not be loaded. Your existing copy was not changed.` | Action `Retry loading template update`. Focus the heading on appearance, then the contextual retry action. Back remains available and causes no mutation. |
| Comparison ready | Heading `Template update available`; body `{owned plan name} stays unchanged. A new independent copy is created for comparison.` | Focus the route heading first, then expose the complete comparison in reading order and primary `Create new copy`. Back retains the current copy, Library state, and every draft/history fact. |
| Create failure | Heading `New copy could not be created`; body `A new copy could not be created. Your existing copy was not changed.` | Action `Retry creating new copy`; keep the reviewed comparison and focus the error heading. Retry uses a fresh revision check and never alters the existing copy. |
| Success | Heading `New copy created`; body `{owned plan name} remains unchanged. The new {template display name} copy is inactive and ready for comparison.` | Focus `New copy created`, remove create/retry actions, and keep Back available. Back returns to the preserved Library state; the new inactive copy may appear as a distinct row. Existing history remains attached to the original copy. |

#### Current-versus-template comparison

- Group by source section in accepted-template order. Each section has a 20sp/800 Archivo heading and flat divider-separated change rows.
- Every row carries one explicit kind tag: `Added`, `Removed`, `Changed`, or `Unchanged`; color is supplementary.
- `Changed` rows render two labeled values: `Current copy` and `Accepted template`. `Added` renders `Current copy: Not present`; `Removed` renders `Accepted template: Not present`. `Unchanged` still names both equal values so review is not inferred from color.
- Long details wrap without truncation. The route scrolls as one document; the header stays available and the final action remains reachable above navigation/keyboard insets.
- The comparison is read-only. There are no per-row accept toggles, `Update existing`, activation, or history-rewrite actions.

#### Reviewed confirmation

Pressing `Create new copy` opens a confirmation sheet before any command runs:

- Heading: `Create a new copy?`
- Body: `{owned plan name} stays unchanged. A new inactive {template display name} copy will be created from the accepted template for comparison.`
- Confirm: `Create new copy`
- Cancel: `Keep reviewing`

The sheet traps focus and initially focuses its heading. Back/Escape closes only the confirmation and restores focus to the comparison's `Create new copy` action. Confirm changes its busy label to `Creating new copy…`, prevents duplicate submission, uses the reviewed owned/template revisions, and commits only a fresh inactive identity. It never mutates or activates the current copy, its schedule, its draft, or any completed history.

---

## Running Plan Create and Goal Form

### Goal and availability fields

Render fields in this order:

| Field | Control | Requirement |
|-------|---------|-------------|
| `Goal distance` | Select plus custom-distance option if supplied by the domain | Required, positive distance with persisted unit; prototype values include `2.4 km`, `10 km`, `Half Marathon` |
| `Target time` | Duration field | Required, positive `HH:MM:SS` or `MM:SS`; normalized preview shown without changing the draft text before save |
| `Current benchmark` | Read-only fact selector/summary | Show value, provenance (`Imported activity`, `Personal history`, or `Manual`), and recorded date; do not fabricate a benchmark |
| `Target date (optional)` | Date field | Empty is valid; a supplied date must be a real future local date |
| `Runs per week` | Integer selector | Required, positive, and no greater than selected available days unless multiple same-day slots are explicitly present |
| `Available days` | Monday-first multi-select | At least one required for a schedulable plan; 48dp targets and explicit selected state |
| `Long-run day` | Single select from available days | Optional until a Long run session exists; required and consistent when one does |
| `Current weekly distance (optional)` | Decimal distance plus unit | Positive when supplied; descriptive source fact only, never a generated prescription |

Section heading is `Goal and weekly sessions`. Supporting copy is `Set the outcome, then choose the purpose and structure of each run.` Summary tiles are `Sessions` / `{N} / week` and `Schedule` / ordered unique weekday labels or `Not set`.

The primary CTA is `Create running plan` in create mode and `Save running plan` in edit mode. On success announce `{Running plan created|Running plan saved}. Activation stays separate.` and open Running detail. Do not offer auto-activation in the success message.

### Goal validation

- Validate on blur and submit. Keep the entered draft visible; place one concise error below the field and link it through native accessibility descriptions.
- First invalid submit focuses the first invalid field and announces `Running plan needs attention.`
- `Target time` rejects zero, impossible clock segments, non-numeric text, and overflow; exact error: `Enter a valid target time.`
- `Goal distance` rejects zero/negative/missing unit; exact error: `Enter a valid goal distance.`
- Date error: `Choose a future target date or leave it blank.`
- Availability mismatch: `Choose enough available days for {N} weekly sessions, or add another ordered session to a selected day.`
- Benchmark absence is not an error. Show `No benchmark recorded` and allow creation without inventing a value.

---

## Running Session List, Stable Order, and Lifecycle

- The committed list is the sole source for the detail/editor weekly structure. Never repopulate prototype defaults after deletion, reload, backup restore, query failure, or empty save.
- Each row shows weekday, workout type, derived summary, and disclosure. Group visually by persisted order, not by an unstable sort of title/type.
- Persist stable session identity and immutable revision. A weekday change or reorder creates a prospective schedule version; past occurrences and matches keep the earlier session revision.
- Multiple rows on one weekday are valid. Preserve explicit `slot_ordinal` order across reopen, backup/restore, and list/detail projections. Do not collapse them into a map keyed only by weekday.
- Pointer drag uses a visible handle and only begins after deliberate press/drag. Keyboard/D-pad and TalkBack expose `Move earlier` and `Move later`; announce `{type} moved to position {N} of {count}`.
- While reordering, render the lifted row and insertion marker; auto-scroll within the list. Cancel restores the committed order. Save failure keeps the draft order visibly pending and offers `Retry saving plan`.
- Delete requires confirmation. On success, focus the next row, previous row, or `Add session` if none remain.

True empty session list:

- Heading: `No sessions yet`
- Body: `Add a Recovery, Long run, Progression, Tempo, Intervals, Hills, or Fartlek session.`
- CTA: `Add session`

The final deletion must produce this state after reopen. It must not restore Recovery/Intervals/Long run fixture rows.

---

## Typed Running Session Editor

### Common contract

All seven types use:

1. `Workout type`
2. `Day`
3. `Warm-up`
4. `Cool-down`
5. Only the contextual fields listed below
6. `Session preview`
7. `Save session`

Intro copy is `Configure only the steps this workout needs.` Changing Workout type preserves Day, Warm-up, and Cool-down. Keep an in-memory contextual draft per type during the current edit so switching away and back does not erase typed values; only the selected type is persisted on Save.

Warm-up/Cool-down are optional structured duration or distance values, never generic prose blobs. A zero value is displayed as `None` after save. The preview updates from locally valid fields and uses the exact persisted units; it never pretends an invalid draft is committed.

### Contextual field matrix

| Type | Fields shown | Preview grammar |
|------|--------------|-----------------|
| `Recovery` | `Volume (time or distance)`; `Easy target (pace, HR zone, or RPE)` | `{volume} · {easy target}` |
| `Long run` | `Volume (time or distance)`; `Effort target`; `Finish` = `Easy throughout`, `Steady finish`, or `Progression finish` | `{volume} · {finish}` |
| `Progression` | `Total volume`; `Stages`; `Start target`; `Finish target` | `{volume} · {N} stages · {start} → {finish}` |
| `Tempo` | `Format` = `Continuous` or `Tempo repeats`; `Work duration / distance`; `Intensity target`; and, only for Tempo repeats, `Repeats` plus `Recovery` | Continuous: `{work} continuous · {target}`; repeats: `{N} × {work} · {recovery}` |
| `Intervals` | `Repeats`; `Work duration / distance`; `Recovery`; `Pace, HR zone, or RPE target` | `{N} × {work} · {recovery}` plus target on the next metadata line |
| `Hills` | `Repeats`; `Uphill duration / distance`; `Return recovery`; `Effort target` | `{N} × {uphill} · {return recovery}` |
| `Fartlek` | `Style` = `Structured` or `Unstructured`; Structured shows `Surges / repeats`, `Fast segment`, `Easy float / recovery`, `Effort target`; Unstructured shows `Surges / repeats`, `Fast cue`, `Easy recovery cue`, `Effort target` | Structured: `{N} × {fast} / {easy}`; Unstructured: `{N} surges · {fast cue} / {easy cue}` |

Intensity mode is explicit: `Pace`, `HR zone`, or `RPE`. Pace requires distance/time units, HR zone is one of Z1–Z5, and RPE is 1–10. Advisory labels never promise the goal or infer medical safety.

### Session validation

- Repeats and stages are whole numbers; repeats must be at least 1 and Progression stages at least 2.
- Duration/distance values must be positive and include a unit. Recovery may be `None` only where Continuous Tempo makes recovery inapplicable.
- Start and finish targets are required for Progression and remain independently labeled.
- Every selected type's visible contextual fields are required except Warm-up/Cool-down. Hidden fields are neither validated nor persisted.
- Submit focuses the first invalid visible field. Summary copy is `{Workout type} session needs attention.`
- Save uses expected session/plan revision. While committing, CTA becomes `Saving session…`, is disabled against duplicate submission, and retains all fields.

Destructive confirmation:

- Heading: `Delete {Workout type} session?`
- Body: `This removes the session from future versions of this plan. Past occurrences and matched activities stay unchanged.`
- Cancel: `Keep session`
- Confirm: `Delete session`

---

## Running Detail and Collision Contract

Running detail shows, in order:

1. Status tag (`ACTIVE`, `INACTIVE`, `ARCHIVED`; `FUTURE` may accompany an active future schedule).
2. Goal identity and non-guarantee description.
3. Target pace and available derived splits from the saved target; omit unavailable facts rather than showing zero.
4. Independent schedule.
5. `Weekly structure`, one row per persisted stable session slot.
6. Context actions: `Sync Garmin / match activity`, `Edit running plan`, activation action when inactive, and collision entry when the domain reports one.

Collision sheet uses actual returned plans/dates. Prototype example copy is retained as the grammar:

- Title: `{weekday} conflict`
- Body: `{running session} and {strength session} overlap. Choose a calendar arrangement; no medical judgment is made.`
- `Move run` / actual future date
- `Move strength` / actual future date
- `Keep both` / actual shared date

Selecting a choice opens a review confirmation showing old and new dates for both opportunities. Primary CTA is `Confirm schedule change`; cancel is `Keep current schedule`. Stale confirmation reloads the preview and says `Schedule changed while you were reviewing. Check the latest dates and choose again.` No choice auto-completes, skips, or suppresses either sport.

---

## State and Feedback Contract

| State | Presentation | Interaction/focus |
|-------|--------------|-------------------|
| Initial loading | Skeletons match segmented control/tools plus 3–5 row shapes; deep routes use intro/fact/action skeletons | Announce `Loading Library` once; do not autofocus skeletons |
| Populated | Flat grouped rows, factual counts, stored identities and next items | Preserve scroll, search, filters, selected tab and return focus |
| Root query failure | Heading `Library could not be loaded`; body `Your plans and exercises were not changed. Try again.`; CTA `Retry loading Library` | Keep selected tab/query/filter state and focus `Retry loading Library` |
| Pull-to-refresh | Keep current content and show non-blocking progress | Refresh failure keeps stale content and shows `Library could not refresh. Your current results are still shown.` with action `Retry refreshing Library` |
| No matches | Use exact no-match copy from the chooser section | Clear action resets search and current-view filters only |
| True no plans | Use exact `No plans yet` copy | CTA opens neutral chooser |
| Missing/deleted detail | Heading `{Plan|Exercise|Session} not found`; body `This item is no longer available.`; CTA `Back to Library` or `Back to running plan` | Restore focus to a valid parent target |
| Partial/incomplete draft | Keep all entered fields; inline errors below affected fields; top notice summarizes | First invalid field receives focus on submit |
| Save in flight | Keep content visible; busy label (`Saving plan…`, `Saving session…`) and block duplicate submit only | Back requests confirmation; do not clear draft |
| Save failure | Heading `Save failed`; body `{Plan|Running plan|Session|Exercise} could not be saved. Your edits are still here. Try again.`; contextual CTA `Retry saving plan`, `Retry saving session`, or `Retry saving exercise` | Draft and reorder positions remain; focus the error heading, then the noun-specific retry action |
| Revision conflict | Heading `Review the latest version`; body `This item changed since you opened it. Your edits are still here.`; actions `Review latest` and `Keep editing` | Never silently overwrite; rebase requires a fresh preview |
| Empty Running sessions | Exact `No sessions yet` state | Focus `Add session` after final delete |
| Reorder | Lifted row, insertion marker, position announcement | Drag, Move earlier/later, Escape/cancel, and focus restoration all supported |
| Success | Theme-aware top toast below header; factual committed result | Announce once; never cover bottom navigation or focused field |

Prototype fixture defaults, dates, activities, and the 2.4 km example are presentation inputs only, except for the separately approved 2.4 km target contract. Loading/error recovery never writes fixture rows to SQLite.

---

## Draft, Back, and Destructive Actions

### Unsaved changes

Use the existing exact plan-editor confirmation:

- Heading: `Save changes?`
- Body: `Your edits are still here. Choose whether to save the complete plan, discard the local draft, or keep editing.`
- Actions: `Save changes`, `Discard changes`, `Keep editing`

Apply the same three-way behavior to Running plan and session drafts, always using the contextual alternate label `Discard changes`. A screen-local draft is not represented as committed data. If a domain-provided recoverable draft exists after process death, offer `Resume recovered draft` / `Discard recovered draft`; do not merge it silently with a newer committed revision.

### Exact destructive/confirmation copy

| Action | Heading | Body | Confirm / Cancel |
|--------|---------|------|------------------|
| Duplicate plan | `Duplicate {plan name}?` | `Days, exercise order, targets, warm-ups, rest, policies, and schedule defaults are copied into fresh identities. The duplicate stays inactive.` | `Create duplicate` / `Keep editing` |
| Archive plan | `Archive {plan name}?` | `The plan will leave the default Library view. Its history is unchanged, and you can restore it later.` | `Archive plan` / `Keep editing` |
| Archive custom exercise | `Archive {exercise name}?` | `The exercise leaves pickers. Existing plan links and completed history remain unchanged.` | `Archive exercise` / `Keep exercise` |
| Hide built-in exercise | `Hide {exercise name} from pickers?` | `The bundled exercise and completed history stay unchanged. You can restore the preference later.` | `Hide from pickers` / `Keep visible` |
| Delete Running session | `Delete {Workout type} session?` | `This removes the session from future versions of this plan. Past occurrences and matched activities stay unchanged.` | `Delete session` / `Keep session` |
| Activate plan | `Activate {plan name}?` | Generated from the current reviewed affected-schedule preview; name the same-sport replacement and state that the other sport is unchanged | `Activate plan` / `Keep current plans` |
| Collision change | `Confirm schedule change?` | Show both actual before/after dates and state that neither workout is completed or skipped | `Confirm schedule change` / `Keep current schedule` |

---

## Accessibility, Responsive, Keyboard, and Focus Contract

### Text, touch, and semantics

- Verify at Android font scale 2.0. Required actions remain reachable with no horizontal clipping, overlap, or text-only icon ambiguity.
- Every target is at least 48×48dp. Adjacent favorite/disclosure/reorder targets retain an 8dp visual gap or non-overlapping hit bounds.
- Tabs expose tab role, selected state, and position. Filters expose pressed state and the active-filter count. Status tags have spoken equivalents.
- Favorite toggles say `Add {exercise} to favorites` or `Remove {exercise} from favorites`.
- Reorder actions expose item name, current position, total, `Move earlier`, and `Move later`.
- Decorative chevrons, drag grips, and status edges are hidden from assistive technology.

### Keyboard / D-pad

- Left/Right moves between Plans and Exercises; Enter/Space activates. Search, Filter, and Actions follow in reading order.
- Tab/Shift+Tab or D-pad traverses one logical action per row. Enter opens detail; favorite is a separate stop.
- Sheets/dialogs trap focus. Back/Escape closes the top layer only and restores the launching control.
- Deep-route Back restores the exact row/CTA and scroll offset. After deletion, focus the next logical row or empty-state CTA.
- Form submit with errors focuses the first invalid visible field. Save failure focuses the notice heading; `Retry saving plan`, `Retry saving session`, or `Retry saving exercise` returns focus to that surface's submit action after success.
- Pointer drag is never the sole reorder mechanism. Escape cancels an active reorder without mutation.

### Keyboard-safe forms

- Focused fields scroll above the software keyboard with 16dp breathing room.
- Keyboard opening never covers validation text, session preview, or the active Save action; the user can scroll to each.
- `Next` advances in visual/semantic order. The final field uses `Done` but does not bypass validation or commit automatically.

### Viewports and landscape

- Verify 360×800, 390×844, 600×960, 840×1080-equivalent, and landscape.
- Preserve the four-item bottom navigation at all widths. Do not auto-substitute a rail or fifth destination.
- At 600dp+, center detail/form content to a readable maximum of 720dp; fact-heavy summaries may use up to 960dp. Root grouping/count order remains unchanged.
- In landscape, sticky tools and deep header remain visible, content scrolls vertically, and all actions remain above bottom navigation/safe area. Do not compress the session list beside a form if it changes reading or focus order.
- Long plan/exercise names wrap without colliding with favorite, disclosure, or reorder controls. Full names remain in accessibility labels.

### Motion

- Use short shared Phase 14 transitions for route/sheet entry, list insertion, and reorder. Reduced Motion removes positional animation but preserves the same destination, focus, and committed state.
- Never animate validation text in a way that shifts a focused field off-screen. A toast is supplementary; it is not the only confirmation of a durable state change.

---

## Copywriting Contract

| Element | Exact copy |
|---------|------------|
| Root primary CTA | `Create plan` |
| Empty state heading | `No plans yet` |
| Empty state body | `Create a strength or running plan to get started.` |
| No-match heading | `No matches` |
| Plan no-match body | `No plan matches your search and current filters.` |
| Exercise no-match body | `No exercise matches your search and current filters.` |
| Neutral chooser heading | `What are you training for?` |
| Neutral chooser boundary | `Choose the plan structure first. Creating a plan does not activate it.` |
| Strength choice | `Strength` — `Exercises, sets, targets, and a gym schedule.` |
| Running choice | `Running` — `Distance and time goal, benchmark, and structured weekly sessions.` |
| Running editor heading | `Goal and weekly sessions` |
| Running editor body | `Set the outcome, then choose the purpose and structure of each run.` |
| Running create CTA | `Create running plan` |
| Running edit CTA | `Save running plan` |
| Session intro | `Configure only the steps this workout needs.` |
| Session CTA | `Save session` |
| Empty sessions heading | `No sessions yet` |
| Empty sessions body | `Add a Recovery, Long run, Progression, Tempo, Intervals, Hills, or Fartlek session.` |
| Root load error | `Library could not be loaded` — `Your plans and exercises were not changed. Try again.` |
| Root load retry | `Retry loading Library` |
| Refresh retry | `Retry refreshing Library` |
| Save error | `Save failed` — `{item} could not be saved. Your edits are still here. Try again.` |
| Save retries | `Retry saving plan`; `Retry saving session`; `Retry saving exercise` |
| Unsaved draft alternate | `Discard changes` |
| Revision conflict | `Review the latest version` — `This item changed since you opened it. Your edits are still here.` |
| Exercise content update | `Exercise library updated` — `{added} added · {updated} updated · {unavailable} unavailable` |
| Exercise content review | `Exercise library changes` — `Custom exercises, copied plans, existing plan references, and historical snapshots are unchanged.` |
| Exercise content failure | `Exercise content could not be updated` — `Exercise content could not be updated. The previous library is still available.` |
| Exercise content actions | `Review changes`; `Dismiss exercise library update`; `Close changes`; `Retry updating exercise content` |
| Template no-update | `No template update available` — `Your copy already reflects the accepted template revision available on this device.` |
| Template comparison | `Template update available` — `{owned plan name} stays unchanged. A new independent copy is created for comparison.` |
| Template load error | `Template update could not be loaded` — `Template update could not be loaded. Your existing copy was not changed.` |
| Template load retry | `Retry loading template update` |
| Template create confirmation | `Create a new copy?` — `{owned plan name} stays unchanged. A new inactive {template display name} copy will be created from the accepted template for comparison.` |
| Template create error | `New copy could not be created` — `A new copy could not be created. Your existing copy was not changed.` |
| Template create actions | `Create new copy`; `Keep reviewing`; `Retry creating new copy` |
| Template success | `New copy created` — `{owned plan name} remains unchanged. The new {template display name} copy is inactive and ready for comparison.` |
| Filters footer | `Filters never clear your search.` |
| Filter-clear announcement | `Filters cleared. Search preserved.` |
| Import placeholder | `Import plan` — `Later` |
| Collision disclaimer | `Choose a calendar arrangement; no medical judgment is made.` |

Copy uses direct verbs and factual consequences. Do not use `smart`, `optimal`, `recommended`, `guaranteed`, or health/readiness claims for schedule or intensity choices.

---

## UI Considerations

Applicable state considerations resolved: 8 covered, 0 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Plans list, filtered results, Running session list, missing detail, template update | ✅ covered | True zero persisted plans uses `No plans yet`; filtered zero uses `No matches`; deleting the final session persists `No sessions yet`; missing identities use the documented missing-detail state; a current starter copy uses `No template update available` without a create action. |
| loading | Library root, deep details, forms, submit controls, template update | ✅ covered | Shape-matched skeletons preserve page geometry; template update uses its exact five-block skeleton; stale content remains during refresh; submitting keeps the draft visible and exposes a contextual busy label without duplicate mutation. |
| error | Query, refresh, content update, template update, validation, save, revision conflict, reorder | ✅ covered | Each failure has exact copy, a noun-specific retry/review path, and a no-data-loss rule; previous Library content, current plan copies, drafts, schedules, and history remain unchanged. |
| populated | Plan groups, exercise groups, details, weekly sessions, update comparison | ✅ covered | Typical populated state uses flat grouped rows with counts, source identities, factual metadata, stable ordered session projections, and a complete current-versus-template comparison before copy creation. |
| partial | Incomplete drafts, optional benchmark/date/distance, stale refresh, content-update failure | ✅ covered | Draft fields remain visible with field-specific errors; optional facts show honest absence; refresh/update failure retains the last committed Library and never converts a partial result into fixture data. |
| overflow | Long lists, forms, names, instructions, review/comparison sheets | ✅ covered | Vertical scrolling, safe-area/keyboard insets, growing rows, two-line compact names, fully wrapping template differences, reflowing details, and bounded sticky regions prevent clipping at all target viewports. |
| zero-one-many | Plan groups, exercise duplicates across factual groups, same-day Running slots | ✅ covered | Group counts and layout cover zero/one/many; multiple same-day sessions remain separately addressable rows ordered by stable slot ordinal. |
| long-text | Plan/exercise names, source text, errors, session summaries, action labels | ✅ covered | Compact names wrap to two lines without control collision; details and errors fully reflow; accessibility labels always retain the full untruncated value. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | Not applicable — Expo/React Native project; confirmed 2026-10-06 |
| Third-party registries | none | No registry code enters this contract; confirmed 2026-10-06 |

No registry vetting is required. Reuse only project-native components and declared npm dependencies; no design block is authorized by this UI-SPEC.

---

## Traceability

| Contract area | Primary source |
|---------------|----------------|
| Remembered Plans/Exercises, groups, search/filter/favorite/actions | LIB-01–LIB-07; Revision 18 HTML lines 1680–1758 and 3319–3401 |
| Neutral chooser, create/activate separation | D17-02–D17-03; LIB-06–LIB-13; approved.json revision 12 |
| Preserved Strength/starter/exercise routes | LIB-08–LIB-23; prototype inventory and parity matrix |
| Exercise content update review/dismiss and starter-template comparison/copy | LIB-12 and LIB-23; `LibraryScreen`, `TemplateUpdateScreen`, and `StarterPlans` state tests |
| Running goal and profile inputs | D17-04; LIB-24–LIB-26; owner brief `Library and Running` |
| Seven contextual session forms | D17-05; LIB-27–LIB-34; approved.json revision 11; Revision 18 HTML session field matrix |
| Empty persistence, stable identity/order, same-day slots | D17-06–D17-07; LIB-35; multi-active ADR session revisions and `slot_ordinal` |
| Collision choices | D17-08; LIB-36; Revision 18 conflict sheet; Phase 13 collision commands |
| Responsive/accessibility/focus | Owner brief verification matrix; VER-03–VER-06; Phase 14 shell dependency |

---

## Six-Dimension Author Self-Check

- [x] **Dimension 1 — Copywriting: PASS.** Primary, empty, no-match, loading/error, validation, content/template update, collision, confirmation, destructive, and noun-specific retry/discard copy is explicit and action-oriented.
- [x] **Dimension 2 — Visuals: PASS.** Library hierarchy, update notice/review sheet, starter current-versus-template comparison, flat editorial rows, neutral chooser, full-height deep routes, typed Running forms, responsive behavior, and all requested interaction states are prescribed.
- [x] **Dimension 3 — Color: PASS.** Exact Light/Dark tokens, 60/30/10 usage, sport/success/attention/destructive semantics, and non-color encoding are declared; insufficient Light orange text is not relied on.
- [x] **Dimension 4 — Typography: PASS.** Phase 17 inherits Phase 14's exact four sizes and only weights 400/800; IBM Plex Mono is 400-only for facts, Archivo 800 owns emphasis, and no private scale remains.
- [x] **Dimension 5 — Spacing: PASS.** The 4/8/16/24/32/48/64 scale, target/control geometry, safe areas, keyboard insets, landscape, and wide-screen limits are explicit.
- [x] **Dimension 6 — Registry Safety: PASS.** shadcn and third-party registries are not applicable; the contract is limited to native project components and declared dependencies.

**Approval:** approved by gsd-ui-checker; explicit owner and external gates remain open where documented.
