---
phase: 19
slug: progress-parity
status: approved
reviewed_at: 2026-10-06T17:03:40+08:00
shadcn_initialized: false
preset: none
created: 2026-10-06
source_revision: 18
source_html_sha256: b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96
source_approval_sha256: b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf
---

# Phase 19 — Progress Parity: UI Design Contract

> Canonical visual and interaction contract for PRO-01 through PRO-18. Progress is a factual reading, evidence, and explicit-decision surface. It must never become a second analytics authority, a readiness/composite score, or a source of silent target changes.

---

## Contract Authority and Scope

Apply sources in this order:

1. .planning/v1.2-OWNER-BRIEF.md and the locked D19-01 through D19-07 decisions in 19-CONTEXT.md.
2. .planning/design/v1.2-SOURCE-PRECEDENCE.md.
3. Revision 18 approved.json latest-first, then the rendered approved-hybrid.html at the hashes in frontmatter.
4. REQUIREMENTS.md PRO-01 through PRO-18, the Phase 19 ROADMAP success criteria, and the Phase 19 rows in the prototype inventory/parity matrix.
5. .planning/architecture/v1.2-garmin-import.md for accepted imported-activity semantics.
6. The shipped Phase 4 factual Progress boundary and current native routes/components for behavior Revision 18 does not demonstrate.

Revision 18 is the presentation oracle. SQLite facts, accepted imported-activity payload revisions, effective completed-history revisions, and committed target/recommendation commands are the behavioral authority. The reachable Progress v2 branch supersedes the hidden legacy Progress branch. Prototype fixtures, localStorage, preview-state buttons, hard-coded dates, canned Garmin activities, and toast-only saves are evidence of presentation intent only.

No source conflict is open for this phase:

- C-10 resolves Progress presentation to the reachable All/Strength/Running v2 branch while preserving real evidence and history.
- C-11 replaces simulated/localStorage mutations with validated, revision-checked, exclusive SQLite commands and authoritative read-back.

### Reviewed presentation evidence

| Evidence | Contract use |
|---|---|
| v1.2-browser-evidence/source-manifest.json | Pins Revision 18 JSON, HTML, and focused-audit hashes |
| light-progress-all.png / dark-progress-all.png | All hierarchy, facts, goal line, source explanation, bottom navigation |
| light-progress-strength.png / dark-progress-strength.png | Strength goal, comparable values, status, target line, compact wrapping |
| light-progress-running.png / dark-progress-running.png | Imported-source notice, 2.4 km hierarchy, exact pacing, Running identity |
| v1.2-browser-evidence/serial-walk.json | Reachability and text evidence for all ranges, recommendation, target sheets, bodyweight, ready, sparse, empty, and loading |

Browser evidence proves that the planning oracle was exercised. It does not prove native rendering, accessibility, source correctness, persistence, or release readiness.

### Included

- Progress root with exactly All, Strength, and Running sport tabs.
- Exactly 4 weeks, 12 weeks, and All time ranges.
- Source-backed Latest, Best, Target, Gap, goal line, Evidence, and Next target/planned-next context.
- Factual Strength progress and the existing Exercise history deep route.
- Running best efforts derived only from accepted imported activities at the same distance and time basis.
- Running history, target editing, recommendation review, Progress settings, and optional bodyweight sheets.
- Loading, empty, sparse, More data needed, projection rebuild, partial/missing, read error, mutation error, stale revision, retry, zero/one/many, and long-history states.
- Light, Dark, and System; 200% text; compact/medium/expanded portrait and landscape; keyboard/D-pad; TalkBack; visible focus; reduced motion.

### Excluded and prohibited

- Readiness, fitness, strength, consistency, or other composite scores.
- Predictive guarantees, normative coaching scores, population comparisons, or medical language.
- Smoothed, interpolated, extrapolated, or otherwise invented chart curves or points.
- A zero value standing in for a missing target, effort, source field, bodyweight, or chart point.
- Fixture, scheduled intent, unmatched estimate, or unaccepted source revision being treated as performance evidence.
- Automatic target changes, bodyweight-driven target changes, optimistic target changes, or a recommendation decision inferred from dismissal.
- Invented 10 km or Half Marathon targets.
- Gender or height collection.
- An in-app run recorder or a fifth Running/Garmin root.
- Editing imported activity facts, historical workout facts, or targets from a chart gesture.

---

## Design System

| Property | Contract |
|---|---|
| Tool | Repository-owned React Native visual system established by Phase 14 |
| Preset | Not applicable |
| Component library | Repository components; no shadcn/Radix/Base UI |
| Icon library | Lucide React Native, outlined 2dp stroke, decorative icons hidden from accessibility |
| Interface font | Bundled Archivo variable font, native family ArchivoVariable |
| Numeric font | Bundled IBM Plex Mono with tabular numerals |
| Charts | Existing installed native SVG stack; no new chart dependency |
| Theme | One persisted System/Light/Dark provider shared with all roots and sheets |

The repository has no components.json and is Expo/React Native, so the shadcn initialization and registry gates are not applicable. Phase 19 consumes the Phase 14 tokens and primitives; it must not copy the current pre-v1.2 Source Sans 3 palette or introduce private Progress colors, typography, focus rings, sheet frames, cards, or navigation styling.

### Shared primitives to consume

| Primitive | Phase 19 contract |
|---|---|
| AppRootShell / AppTabs | Keep Progress as the fourth and only Progress root; bottom navigation remains bottom at every width and orientation |
| ScreenHeader | Heading Progress; Body metrics and Settings are supplementary 48dp actions after the heading |
| AdaptiveScreen | One vertical scroll owner, safe-area insets, retained sport/range/scroll state, bottom-navigation clearance |
| FocusablePressable | Touch, Enter, Space, D-pad, TalkBack activation use one handler; busy/disabled blocks duplicate commands |
| BottomSheet | Running history, target, recommendation, Progress settings, and bodyweight surfaces use the shared modal sheet, focus, IME, Back/Escape, scrim, and trigger-return behavior |
| InlineNotice | Sparse, partial, rebuild, stale, and error states use written heading/body/action; a toast is never the only recovery path |
| EmptyState / SkeletonBlock | Stable geometry, explicit next step, no placeholder values or zero charts |
| SemanticToast | Only after authoritative read-back; never acknowledges a write before commit |
| SemanticNumber | IBM Plex Mono, tabular numerals, visible unit, and matching accessibility label |

### Phase-owned components

| Component/surface | Contract |
|---|---|
| ProgressScreen | Existing route owner; gains sport tabs, retained range, factual All/Strength/Running content, and all read states |
| Progress goal hero | One primary goal/evidence task, not a dashboard of decorative stat cards |
| FactualHistoryChart | Straight segments between real comparable points, separate target line, visible text summary and data equivalent |
| RunningHistorySheet | Proposed source-backed same-distance effort detail and history data |
| ExerciseHistoryScreen | Existing deep route; preserves effective metric identities, source sessions, Back, and adds eligible Load/Relative presentation |
| RunningTargetSheet | Proposed validated source-target editor with draft retention and committed read-back |
| RecommendationSurface | Existing evidence/revision-fenced surface restyled to Revision 18 hierarchy and exact actions |
| BodyweightHistorySheet / BodyweightEditorSheet | Proposed optional dated-fact history/editor with explicit two-step deletion |

---

## Spacing Scale

Only these reusable spacing values are allowed:

| Token | Value | Usage |
|---|---:|---|
| space.1 | 4dp | Inline label/icon gaps, chart label offset, compact status spacing |
| space.2 | 8dp | Control gaps, compact row internals, fact-cell padding |
| space.4 | 16dp | Compact content inset, component padding, section body gap |
| space.6 | 24dp | Medium inset and section separation |
| space.8 | 32dp | Expanded inset and major layout gap |
| space.12 | 48dp | Minimum interactive dimension and major empty-state separation |
| space.16 | 64dp | Maximum section separation and bottom-nav/sheet clearance |

Template-permitted exceptions are limited to two exact, owner-approved Revision 18 Progress component measurements:

| Exception | Oracle evidence | Rationale |
|---|---|---|
| 3dp segmented-control inner gap | approved-hybrid.html H:1426, selector .pv2-sport-switch,.pv2-range-switch, exact source gap:3px | Preserve the approved narrow separation between the three equal sport/range choices without promoting 3dp into the reusable spacing scale. |
| 18dp hero top separation | approved-hybrid.html H:1430, selector .pv2-hero, exact source margin-top:18px | Preserve the approved transition from selectors to the primary 2dp hero rule without promoting 18dp into the reusable spacing scale. |

These values are component-local exceptions, not new tokens. Do not silently round them to 4dp/16dp or reuse them elsewhere. Other Revision 18 measurements such as the 13dp segmented radius, 58dp hero header, 70dp list row, 142dp chart, 82% sheet cap, 24dp sheet top corners, and 68% black scrim are component geometry rather than spacing tokens. The 3dp focus outline and 3dp outline offset at approved-hybrid.html H:122–126 are focus-indicator geometry, not layout spacing and not a spacing-scale exception.

### Progress geometry

| Element | Required geometry |
|---|---|
| Compact content inset | 16dp |
| Medium content inset | 24dp |
| Expanded content inset | 32dp |
| Sport/range control | Three equal columns; 48dp minimum per item; 3dp inner gap; 13dp container radius |
| Hero | 2dp primary-text top rule; 18dp top separation; no outer decorative card |
| Hero fact row | Three equal cells for Latest, Best, Target with 1dp dividers; Gap remains explicit in the status/summary line |
| History chart | Full content width; 142dp normal height; may grow for 200% labels; never horizontally scroll |
| Goal line | 2dp yellow dashed line, 7dp dash / 5dp gap, labelled Goal plus value |
| Source/list row | At least 70dp; title and supporting evidence wrap; trailing disclosure owns a separate 48dp target |
| Sheet | Bottom anchored; max 82% keyboard-safe height; scrollable body; 24dp top corners; 1dp top border |
| Focus | 3dp blue visible outline with 3dp outline offset, per approved-hybrid.html H:122–126; focus-indicator geometry only, not spacing; must not be clipped by segmented containers or sheets |

---

## Typography

Exactly four sizes and two weights are declared by the shared v1.2 system:

| Role | Family | Size | Weight | Line Height | Phase 19 usage |
|---|---|---:|---:|---:|---|
| Supporting / mono | Archivo or IBM Plex Mono | 14sp | 400 | 20sp | Source type, dates, units, evidence counts, compact metadata |
| Body / control | Archivo or IBM Plex Mono | 16sp | 400 | 22sp | Body copy, tabs, ranges, inputs, row supporting text, numeric facts |
| Heading / action | Archivo | 20sp | 800 | 24sp | Progress title, hero/section/sheet headings, action labels |
| Editorial display | Archivo variable condensed | 57sp | 800 | Shared Workout-root identity only; not used inside Progress |

Rules:

- The only weights are 400 and 800. Do not introduce 500, 600, 700, 750, 810, or 850 equivalents from prototype CSS.
- IBM Plex Mono is reserved for data-like text: dates, elapsed time, pace, splits, weights, reps, bodyweight, counts, target values, Gap values, and chart/table values.
- Prose, tabs, buttons, headings, status text, and labels use Archivo.
- Numeric values always retain their units visually and in accessibility output. Never expose a bare 62.5, 11:00, or 0.24 without context.
- User-owned exercise/source labels and dynamic evidence wrap; consequential copy is never ellipsized.

---

## Color

### 60 / 30 / 10 allocation

| Role | Light | Dark | Reserved usage |
|---|---|---|---|
| Dominant 60% | paper #FFFAF0 | paper #080808 | Root canvas, chart ground, continuous reading space, bottom navigation |
| Secondary 30% | bone #F4F0E6; surface #F0EADF; raised #FFFAF0 | surface #151515; raised #202020 | Segmented controls, sheets, restrained rows, skeletons, neutral state layers |
| Accent 10% | orange #D97820; blue #195FAE | orange #D97820; blue #71AAFF | Orange only for selected-root underline and Strength identity; blue only for focus, selected choices, navigable emphasis, and Running identity |
| Destructive | #B42318 | dangerSource #FF8279 | Bodyweight deletion and destructive failure emphasis only |

Green and yellow are semantic states, not decorative accents. Green indicates source-backed success/on-track/completed states and actual history lines where Revision 18 uses them. Yellow indicates attention/review and the goal line. Every semantic color has adjacent text and/or border/pattern; color is never the only meaning.

### Exact semantic token map

| Token | Light | Dark | Contract |
|---|---|---|---|
| paper | #FFFAF0 | #080808 | Main canvas and bottom navigation |
| bone | #F4F0E6 | #151515 | Surrounding/secondary surface |
| ink / text | #0D0C0A | #F7F7F2 | Primary content and inverse controls |
| quiet / muted | #655F56 | #AAA9A2 | Supporting copy only |
| clay | #D8C3AB | #6D665C | Warm neutral detail |
| surface | #F0EADF | #151515 | Rows, segmented controls, neutral fields |
| raised | #FFFAF0 | #202020 | Sheets/dialogs/toasts |
| line / lightLine | #CEC6B8 | #333330 | Rules, chart guides, borders, cell dividers |
| orange | #D97820 | #D97820 | Strength identity and selected-root underline only |
| orangeDark | #281306 | #281306 | Text on orange fill only |
| green / greenBg | #166B4C / #DCECDF | #72DF92 / #14271A | On track, gap closing, completed decision/result |
| yellow / yellowBg | #8D5D00 / #FFF0C2 | #F0C84B / #2A2410 | Goal line, More data needed, Needs review, stale attention |
| blue / blueBg | #195FAE / #DCE9F9 | #71AAFF / #14243B | Running source identity, links, focus, selected input/control |
| toastBg / toastBorder | #FFFAF0 / #CEC6B8 | #202020 / #3D423E | Shared toast surface |
| toastText / toastAccent | #0D0C0A / #166B4C | #F7F7F2 / #72DF92 | Shared toast copy and committed-success leading bar |

Accent is reserved for: selected Progress root underline; Strength/Running identity; visible focus; selected tabs/ranges/day choices; and source/detail links. Semantic green is reserved for the actual factual history line and source-backed success/on-track status; semantic yellow is reserved for the separate goal line and attention states. Accent must not fill every row, every button, or decorative cards.

---

## Progress Information Architecture

### Root order

The scroll content order is fixed:

1. Progress heading.
2. Body metrics and Settings supplementary actions.
3. All / Strength / Running tablist.
4. 4 weeks / 12 weeks / All time range group.
5. Read-state notice when loading, rebuilding, stale, partial, or failed.
6. One primary goal hero or a truthful empty state.
7. Evidence/source disclosure associated with the hero.
8. Sport-specific goal, review, best-effort, or exercise rows.
9. Source-backed Next target or planned-next context, when it exists.
10. Persistent four-root bottom navigation outside the scroll owner.

The page must not open with a generic score, consistency percentage, streak, heat map, or card grid. At normal compact width, the first viewport must retain the heading, supplementary actions, both selectors, hero heading/status, summary, and at least the Latest/Best/Target row. The chart can continue below the fold.

### Sport and range controls

- Sport labels are exactly All, Strength, Running. They are a tablist with one selected tab, roving tab stop, Left/Right arrow movement, Home/End support, and selected state announced.
- Range labels are exactly 4 weeks, 12 weeks, All time. They form a single-select group with one pressed item, roving Left/Right movement, Home/End support, and visible selected state.
- Sport and range selections persist independently through sheet open/close, deep-route return, theme change, source retry, rebuild, and root switching.
- Changing sport or range cancels/ignores obsolete reads. The previous final data must not be relabelled under the new selection.
- Focus stays on the chosen tab/range after activation. Returning from a detail restores the exact invoking hero/row.

### Comparable-fact definitions

| Label | Required meaning |
|---|---|
| Latest | Most recent accepted comparable durable fact inside the selected range |
| Best | Comparator-defined best accepted fact inside the same metric/distance and time basis; Running elapsed-time best is the lowest valid time |
| Target | Current persisted target effective for the same metric/distance; otherwise Target unset or em dash |
| Gap | Signed/plain-language difference between Best and Target only when units, identity, revision, and comparator are compatible |
| Goal line | Separate persisted Target value across dates for which that target revision was effective; never retroactively redraw prior history as though a newer target existed |
| Evidence | Count and source type plus links to the durable workouts/imported activities and accepted source revision used by the displayed fact |
| Next target | Current persisted next target or pending evidence-backed recommendation only; never inferred from a curve |
| Planned next | A real persisted future plan opportunity only; absent when no eligible source fact exists |

If any pair is not comparable, do not calculate the pair or its Gap. Show the available fact, label the missing/incompatible fact, and explain why. Missing values are never zero.

### All

- The focal heading is Nearest active goal, chosen from persisted active targets plus comparable durable history. The selection rule is deterministic and testable; it is not a combined fitness score.
- Show Latest, Best, Target, and a written Gap status/summary for that one goal. If no comparable goal exists, render the All empty state.
- Personal history opens the correct Running history sheet or Strength Exercise history route.
- Active goals rows include the persisted target, factual Best/Latest, written status, and sport identity. Activating a row selects the corresponding sport and retains the current range.
- Evidence names all source facts used by the hero. Do not aggregate Strength and Running into one chart line.
- Planned next appears only for source-backed future occurrences and identifies the sport/activity. If absent, omit the section; do not use prototype fixture wording.

### Strength

- The focal hero is one persisted primary Strength goal with comparable completed working-set history. Show Latest, Best, Target, written Gap, goal line, Evidence, and source-backed status such as On track, Maintaining, or More data needed.
- Comparable identity includes exercise identity, metric profile/version/generation, units, comparator, effective revision, and completed working-set eligibility. Warm-ups, incompatible metric generations, voided history, and uncommitted sets never enter the trend.
- Needs review appears only for a pending evidence/revision-fenced recommendation. The row shows exercise, Current value, Proposed value, concise evidence, and the Review target action.
- Exercise progress rows show exercise name, Latest, Target or Target unset, written status, and disclosure. They open the existing Exercise history route, not an editable duplicate.
- Non-load/duration metrics use their native units and comparator. Load/Relative is never offered for time, distance, interval, assistance-only, or unscored metrics.

### Running

- Begin with the persistent evidence notice: Running facts and best efforts come from accepted imported Garmin activities or owner-imported FIT files. Matching never completes a scheduled workout without confirmation.
- The primary 2.4 km hero uses only accepted imported activities with a valid same-distance effort and documented elapsed-time basis. Unmatched accepted activities may contribute factual history but never imply plan adherence.
- Show Latest, Best, Target, written Gap, separate goal line, Evidence, derived pacing, Running goals, Best efforts, and source-backed Next target/planned-next content.
- The default 2.4 km target is fixed at 11:00. Its exact derived display is Pace 4:35/km, 400 m 1:50, and 200 m 0:55.
- 10 km and Half Marathon Target remain unset until an owner edit commits. Their rows say Set target or Target unset. An absent effort says No effort recorded. Neither target nor effort plots as zero.
- Best efforts are grouped by exact distance and documented time basis. Each row shows imported effort count, Best or No effort, and opens Running history. Mixed distances, scheduled intent, unmatched estimates, invalid/removed imports, and unaccepted source revisions are excluded.
- Imported source correction/revision changes invalidate/rebuild affected projections. While rebuilding, suppress final values rather than showing an old result as current.

---

## Chart and Evidence Contract

Every chart is supporting evidence, never the authority.

### Visual marks

- Draw one straight polyline through accepted comparable facts in chronological order. Do not use spline smoothing, generated intermediate points, regression lines, projected tails, forecast bands, or decorative trend curves.
- A one-point history renders one labelled point only and the written status More data needed; do not draw a line or directional status.
- No-point history renders the defined empty state and no axes/path pretending to contain zero.
- Missing points remain gaps. Do not join across an invalid, removed, incompatible, or unavailable fact as though it existed.
- Actual facts use the Revision 18 green line with outlined points. Running identity and source navigation remain blue; they do not recolor the factual line. The persisted target uses a separate dashed yellow line labelled Goal plus its exact value.
- Running time uses an explicit Faster is lower on the clock explanation. Strength uses the comparator for the metric; do not assume higher is better for every profile.
- If long histories require sampling, use a deterministic display projection that retains first, last, Best, Latest, local extrema, target crossings, and source IDs. Sampling is rebuildable; it never changes the accessible data or durable facts.

### Text and data equivalents

Each chart must expose all three:

1. A concise visible summary naming Latest, Best, Target, Gap, range, metric/distance, and evidence count.
2. A programmatic chart label naming metric/distance, selected range, point count, direction semantics, and whether a goal line exists.
3. A visible Show history data disclosure that renders an ordered table/list from the same query.

The history data equivalent contains:

| Column | Contract |
|---|---|
| Date | Owner-local factual date plus source time-zone provenance when relevant |
| Value | Exact observation and unit; no normalized unlabeled number |
| Target at date | Effective target revision or Target unset |
| Source | Workout or imported activity identity with an Open source action |
| Evidence status | Accepted/current, corrected effective fact, or other explicit eligible state |

Decorative gridlines and points are hidden from accessibility. The data equivalent is not generated from SVG coordinates; both chart and table consume the same typed factual series.

---

## Detail and Sheet Contracts

### Running history sheet

- Heading is <distance> best efforts.
- The hero shows Best and Target <time>, or Target unset.
- The chart and Show history data equivalent follow the shared chart contract.
- Copy is Best efforts compare elapsed time at the same distance. Faster is lower on the clock.
- Evidence rows open the imported activity detail for the exact accepted payload revision used. Removing/correcting an activity returns to the same distance/range and triggers rebuild.
- No efforts: No effort recorded / Import or accept a <distance> effort to establish a benchmark. No zero result is plotted.
- Close, Back, Escape, and scrim make no changes and restore focus to the invoking hero/best-effort row.

### Exercise history route

- Preserve route app/exercise-history/[exerciseId] with Back returning to the invoking Strength hero/row and retained sport/range/scroll.
- Heading is Exercise history; exercise name follows. Show comparable completed personal history only.
- Show Latest, Best, Target, Gap, goal line, history data, metric identity, effective revision, and source workout links.
- Loading, empty, read error/retry, source-session absence, one/many metric segment, correction, and long-history states remain explicit.
- Load / Relative appears only when the metric is load-based and a valid dated bodyweight exists for each calculation basis. Relative values disclose Using <kg> kg from <date>.
- If a historical point uses a different eligible bodyweight basis, each data row names the dated basis used. Do not retroactively divide all history by the latest entry unless the domain contract explicitly defines that reviewed behavior.
- Relative presentation is a view transform only. It never writes a Strength target or recommendation.

### Running target sheet

Order is fixed:

1. Heading Running target and close action.
2. Distance: 2.4 km, 10 km, Half Marathon.
3. Target time using mm:ss or hh:mm:ss.
4. Optional target date.
5. Current benchmark, read-only.
6. Available training days, Monday through Sunday.
7. Calculated pacing guides do not predict or guarantee an outcome.
8. Discard target changes and Save target.

Interaction rules:

- Opening copies the current source revision into a draft. Switching Distance loads that distance's persisted draft/current target and benchmark; it never clones another distance's target.
- 2.4 km opens at 11:00 unless a later explicit owner target revision exists. 10 km and Half Marathon open with an empty Target time until explicitly set.
- Current benchmark is never editable. If absent it says No benchmark yet.
- Target time must parse to at least 1:00. Invalid time says Enter a valid target time. Invalid target date says Enter a valid target date. The draft remains intact.
- Save target becomes busy and blocks duplicates. Nothing outside the sheet changes before commit and authoritative reload.
- Discard target changes, Back, Escape, close, or scrim discards only the uncommitted draft and restores the invoking row.
- Save failure and stale revision retain every draft value and provide the defined recovery action.

### Recommendation review sheet

- Heading Review target.
- Context line is <exercise> · personal completed history only.
- Show Current and Proposed values side by side at normal width, stacked at 200% text or when either value wraps.
- Evidence is a list of exact completed-history statements and includes named rule/version, effective source revision, and Open source when available.
- The final evidence statement is No automatic change without confirmation.
- Actions are exactly Keep target unchanged and Use target.
- Opening, dismissal, Back, Escape, and scrim do not decide. No action is preselected.
- Once either action starts, both actions are disabled and the selected label exposes busy state. The result is shown only after exclusive commit and authoritative read-back.
- A duplicate tap/replayed request settles once. A stale/superseded recommendation is not applied and does not reappear from a fixture rerender.
- Historical accepted/kept/superseded review records remain readable and have no active mutation controls.

### Progress settings sheet

- Heading Progress settings.
- Intro is Personal history is the benchmark. No readiness or composite score is calculated.
- Bodyweight history is the first action.
- Privacy text is Bodyweight is optional, used only for relative strength views, and never changes targets automatically. Gender and height are not collected.
- Prototype-only Running data preview controls are excluded from production. Ready/sparse/empty/loading are supplied by typed source fixtures/tests, not owner-facing settings.

### Bodyweight history sheet

- Heading Bodyweight.
- Privacy text is Bodyweight is optional, used only for bodyweight-relative views, and never changes workout targets automatically.
- Empty: No bodyweight entries / Add one only if bodyweight-relative strength is useful to you. Nothing else in Progress depends on it. / Add first entry.
- Populated: latest dated value and entry count, Add entry, reverse-chronological dated values, Edit bodyweight entry, and Delete bodyweight entry.
- First Delete bodyweight entry changes that row into an explicit confirmation state: Delete bodyweight entry? / This removes the <date> entry. Strength targets will not change. / Keep bodyweight entry / Delete bodyweight entry.
- Confirmation is row-specific. Back, Escape, sheet close, Keep bodyweight entry, or selecting another row clears the pending confirmation without deletion.
- During delete, preserve row/date/value and disable duplicate actions. Remove the row only after commit and authoritative reload.

### Bodyweight editor sheet

- Heading Add bodyweight or Edit bodyweight entry.
- Fields are Date and Bodyweight, kg.
- Bodyweight accepts 20.0 through 400.0 kg in 0.1 kg increments. Date must be a valid owner-local calendar date and cannot be later than today.
- Supporting copy is Optional measurement. It never changes workout targets automatically.
- Actions are Discard bodyweight changes and Save entry.
- Validation error is Enter a valid date and bodyweight from 20.0 to 400.0 kg. Draft values and focus remain.
- Save is commit-gated and idempotent. Edit changes only the selected fact through a revision-checked command. A failed save keeps the editor open and the draft intact.

---

## State Contract

Sport and range controls, Progress heading, supplementary actions, and bottom navigation remain stable in every read state unless startup authority itself is unavailable.

| State | Visual and copy contract | Data/interaction contract |
|---|---|---|
| Loading | Stable hero/list skeletons plus one Loading progress busy announcement; no numeric placeholders | Retain selected sport/range; hide decorative skeletons from accessibility; ignore obsolete read completion |
| Ready | Full source-backed hero, chart, Evidence, details, and eligible Next target/planned-next content | All values come from one current projection/source revision set |
| Overall empty | No progress history yet / Completed Strength history and accepted Running efforts will appear here after you train or import an activity. / Refresh progress | No chart, Gap, direction, or default effort |
| Strength empty | No comparable Strength history yet / Complete comparable working sets to establish personal history. / Refresh progress | Persisted targets may be listed as Target with no Latest/Best; no zero point |
| Running empty | No imported running efforts yet / Goals can remain saved, but no zero chart or direction is shown until a Garmin or FIT activity is imported. | Show persisted goal rows; omit best-effort chart/direction |
| Sparse: one fact | More data needed / One comparable result is not enough to call a trend. | One labelled point only; show Latest=Best if true; no directional line or fabricated history |
| Sparse: target only | Target saved / Complete or import a comparable result to calculate Best and Gap. | Show Target and Target unset/missing facts; no goal-to-zero line |
| Missing target | Target unset and Set target | Existing factual efforts remain visible; no goal line or Gap |
| Missing effort | No effort recorded | Persisted target may remain; no zero effort or best |
| Partial source fact | Unavailable or em dash plus a written reason/basis | Do not infer missing pace, distance, time, HR, bodyweight, or source identity |
| Rebuild pending | Updating progress / Saved history is being recalculated. Results refresh automatically. / Refresh progress | Suppress unreliable final values/links; retain sport/range; poll/refresh typed projection only |
| Source read error | Progress could not be loaded / Your saved workouts and targets were not changed. Retry loading progress. / Retry loading progress | Retain sport/range and last stable navigation context; do not present stale values as current |
| History detail error | History could not be loaded / Your saved history was not changed. Retry loading this history. / Retry history | Keep sheet/route identity and Back |
| Target validation error | Enter a valid target time. or Enter a valid target date. | Preserve draft and focus first invalid field |
| Target save failure | Target was not saved / Your current target is unchanged. Review the draft and try again. / Retry saving target | Keep sheet/draft/source revision; no optimistic root update |
| Target stale revision | Target changed since this sheet opened / Review the latest target before saving again. / Reload target | Never overwrite newer fact; preserve old draft for comparison |
| Recommendation busy | Keep target unchanged and Use target remain visible; selected command announces Saving decision | Disable both; one request ID; no optimistic target |
| Recommendation failure | Target decision was not saved / Your current target is unchanged. Review the evidence and try again. / Retry target decision | Preserve recommendation/evidence; reload on retry |
| Recommendation stale | Recommendation no longer applies / The current target was not changed. Progress was reloaded from saved facts. / Review current target | No mutation; old recommendation does not return as pending |
| Bodyweight empty | Exact Bodyweight empty copy and Add first entry | Relative toggle absent |
| Bodyweight save/delete failure | Bodyweight entry was not saved/deleted / Your saved bodyweight history and workout targets were not changed. / Retry saving entry or Retry deleting entry | Preserve editor/confirmation and authoritative list |
| Long history | Same row anatomy and stable chronological order | Virtualize/sample visual marks only; full data equivalent and sources remain |

Failure recovery is persistent inline content. A transient toast may reinforce a committed success but must never be the only failure, stale, or retry presentation.

---

## Copywriting Contract

Dynamic placeholders are factual values read from the current source revision. They are not fixture defaults.

| Element | Exact copy |
|---|---|
| Phase primary mutation CTA | Save target |
| Root title | Progress |
| Supplementary actions | Body metrics; Settings |
| Sport tabs | All; Strength; Running |
| Ranges | 4 weeks; 12 weeks; All time |
| All hero | Nearest active goal |
| Fact labels | Latest; Best; Target; Gap |
| Chart labels | Personal history; Open history; Goal <value>; Show history data; Hide history data |
| Evidence labels | Evidence; Open source; Workout source; Imported activity |
| Next context | Next target; Planned next |
| Strength sections | Needs review; Exercise progress; Personal history |
| Running sections | Running goals; Best efforts; Garmin imported |
| 2.4 km pacing | 2.4 km; 11:00; Pace 4:35/km; 400 m 1:50; 200 m 0:55 |
| Unset goals | Set target; Target unset; No effort recorded |
| Sparse | More data needed; One comparable result is not enough to call a trend. |
| No score explanation | Direction is based only on comparable completed personal history. No readiness or composite score is produced. |
| Running evidence notice | Running facts and best efforts come from accepted imported Garmin activities or owner-imported FIT files. Matching never completes a scheduled workout without confirmation. |
| Running empty | No imported running efforts yet; Goals can remain saved, but no zero chart or direction is shown until a Garmin or FIT activity is imported. |
| Overall empty | No progress history yet; Completed Strength history and accepted Running efforts will appear here after you train or import an activity.; Refresh progress |
| Strength empty | No comparable Strength history yet; Complete comparable working sets to establish personal history.; Refresh progress |
| Loading | Loading progress |
| Rebuild | Updating progress; Saved history is being recalculated. Results refresh automatically.; Refresh progress |
| Read error | Progress could not be loaded; Your saved workouts and targets were not changed. Retry loading progress.; Retry loading progress |
| History sheet | <distance> best efforts; Best efforts compare elapsed time at the same distance. Faster is lower on the clock. |
| No history effort | No effort recorded; Import or accept a <distance> effort to establish a benchmark. No zero result is plotted. |
| Relative view | Load; Relative; Using <kg> kg from <date>; Bodyweight-relative strength is a view only and never changes targets. |
| Target sheet | Running target; Distance; Target time; Optional target date; Current benchmark; Available training days; No benchmark yet; Discard target changes; Save target |
| Target disclaimer | Calculated pacing guides do not predict or guarantee an outcome. |
| Target validation | Enter a valid target time.; Enter a valid target date. |
| Target save error | Target was not saved; Your current target is unchanged. Review the draft and try again.; Retry saving target |
| Target stale | Target changed since this sheet opened; Review the latest target before saving again.; Reload target |
| Recommendation | Review target; <exercise> · personal completed history only; Current; Proposed; No automatic change without confirmation; Keep target unchanged; Use target |
| Recommendation failure | Target decision was not saved; Your current target is unchanged. Review the evidence and try again.; Retry target decision |
| Recommendation stale | Recommendation no longer applies; The current target was not changed. Progress was reloaded from saved facts.; Review current target |
| Progress settings | Progress settings; Personal history is the benchmark. No readiness or composite score is calculated.; Bodyweight history |
| Bodyweight privacy | Bodyweight is optional, used only for relative strength views, and never changes targets automatically. Gender and height are not collected. |
| Bodyweight empty | No bodyweight entries; Add one only if bodyweight-relative strength is useful to you. Nothing else in Progress depends on it.; Add first entry |
| Bodyweight actions | Add entry; Edit bodyweight entry; Delete bodyweight entry; Keep bodyweight entry |
| Bodyweight confirmation | Delete bodyweight entry?; This removes the <date> entry. Strength targets will not change. |
| Bodyweight editor | Add bodyweight; Edit bodyweight entry; Date; Bodyweight, kg; Optional measurement. It never changes workout targets automatically.; Discard bodyweight changes; Save entry |
| Bodyweight validation | Enter a valid date and bodyweight from 20.0 to 400.0 kg. |
| Bodyweight mutation error | Bodyweight entry was not saved.; Bodyweight entry was not deleted.; Your saved bodyweight history and workout targets were not changed. |
| Committed target toast | <distance> target saved. |
| Committed recommendation toast | Current <exercise> target kept.; <exercise> target updated to <target>. |
| Committed bodyweight toast | Bodyweight entry saved.; Bodyweight entry deleted. |

The phase primary mutation CTA is Save target. Other primary actions are contextual and use the exact nouns above. Do not use generic Submit, OK, Done, Success, Apply, or Continue labels.

The only destructive action owned by Phase 19 is Delete bodyweight entry. It requires the separate row-specific confirmation state above. Target replacement is consequential but not destructive: it remains revision-checked and requires explicit Save target or Use target. Dismissal never mutates.

---

## Responsive, Accessibility, Focus, and Motion

### Width, orientation, and 200% text

- Verify 360×800, 390×844, 600×960, and 840×1080-equivalent layouts plus portrait and landscape. The four-item navigation remains at the bottom; no rail substitution is allowed.
- Compact uses one column. Medium/expanded may place one factual detail/data region beside another only when reading and focus order remain root order and every control/copy item is preserved.
- At 200% text, supplementary actions wrap below the heading; sport/range labels wrap within growing controls; the Latest/Best/Target cells may stack into a 2×2/vertical facts layout with Gap; status pills become inline text blocks; Current/Proposed stacks; tables become labelled row cards.
- No required action, unit, evidence line, target, error, or confirmation copy is clipped, scaled down, icon-only, or hidden behind bottom navigation, a sheet footer, or the IME.
- Landscape keeps the header and bottom navigation in safe areas and gives root/sheet content one vertical scroll owner. Charts use available width and never force horizontal page scrolling.
- Long exercise names, target values, source labels, rule versions, and errors wrap. A trailing disclosure owns a separate 48dp column and never overlaps copy.

### Keyboard, D-pad, TalkBack, and focus

- Focus order follows heading, Body metrics, Settings, sport tabs, ranges, notice, hero facts/chart/data, Evidence, sport sections, then bottom navigation.
- Root entry focuses Progress. Sport change focuses the selected tab. Range change retains the selected range control. Deep-route Back and every sheet dismissal restore the exact invoking control.
- Sport and range groups support Left/Right and Home/End. Day choices support Left/Right with wrapping and preserve pressed state. Enter/Space activates the focused item.
- Sheets move focus to the semantic heading, then close, fields, body, and footer actions. Background content is inaccessible/inert. Back/Escape equals the surface's safe dismissal action and never saves.
- Target/bodyweight validation focuses the first invalid field. Save failures retain focus in the sheet; stale errors focus the notice/recovery action.
- After bodyweight deletion, focus moves to the next row's Edit bodyweight entry action, the previous row if last, or Add first entry when the list becomes empty.
- Every icon-only close/settings action has a specific accessible name. Selected, pressed, busy, disabled, expanded, and live-region state is programmatic.
- Charts never rely on gesture exploration alone. TalkBack reads the visible summary and data equivalent, not hundreds of decorative SVG marks.
- Focus uses the shared 3dp blue outline in Light and Dark and is never clipped by segmented controls, charts, rows, sheets, or bottom navigation.

### Motion

- Standard tab/range/content and sheet changes use shared restrained 150–240ms opacity/position motion only; no chart-path drawing, bounce, scale, confetti, or score animation.
- Reduced motion removes translation, animated scrolling, and chart drawing while preserving destination, selection, values, focus, busy state, commit callbacks, and data-table availability.
- Loading/rebuild indicators must not use rapid flashing or motion as their only meaning.

---

## UI Considerations

The complete Phase 19 inventory/parity set was reviewed: 18/18 PRO rows, comprising 14 prototype-source surfaces and 4 required-native integrity/recovery surfaces. Applicable state considerations resolved: 19 covered, 6 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|---|---|---|---|
| empty | All/Strength/Running root collections and charts | ✅ covered | Use the exact sport-specific empty heading/body/action; preserve sport/range; targets may remain visible; no zero chart, default effort, Gap, or direction. |
| empty | Running/Strength history detail | ✅ covered | No effort/comparable history renders written next step and no visual mark; Back/close remains available. |
| empty | Bodyweight history | ✅ covered | Exact No bodyweight entries copy plus Add first entry; Relative is absent and no other Progress surface depends on bodyweight. |
| loading | Progress root and detail reads | ✅ covered | Stable skeleton geometry, one Loading progress announcement, selected sport/range retained, no numeric placeholders. |
| loading | Target/recommendation/bodyweight commands | ✅ covered | Preserve reviewed facts/draft/row, expose busy, disable duplicates, and do not update root/history before committed read-back. |
| error | Root/detail reads | ✅ covered | Written problem + unchanged-facts assurance + action-specific Retry; selected sport/range and Back remain. |
| error | Target/recommendation/bodyweight commands | ✅ covered | Preserve draft/evidence/confirmation, distinguish stale from failure, and provide persistent retry/reload rather than toast-only failure. |
| populated | All | ✅ covered | One nearest factual goal, Latest/Best/Target/Gap, goal line, Evidence, active goals, and only source-backed planned-next content. |
| populated | Strength | ✅ covered | Comparable completed working sets, Needs review, Exercise progress, evidence/source links, and effective target revisions only. |
| populated | Running | ✅ covered | Accepted same-distance imports, exact fixed 2.4 km pacing, unset 10 km/HM targets, best efforts, evidence, and no plan-adherence inference. |
| partial | Missing/incompatible facts | ✅ covered | Unavailable, Target unset, No effort recorded, or em dash plus reason; missing fields and incompatible identities never become zero/comparable. |
| partial | Sparse one-point history | ✅ covered | One point, Latest/Best if factual, More data needed, and no line/direction/invented curve. |
| overflow | Root lists and long histories | ✅ covered | One vertical scroll owner, fixed bottom navigation, stable row anatomy/order, deterministic chart sampling only, full data/source equivalent retained. |
| overflow | Sheets/forms/data tables | ✅ covered | Keyboard-safe 82% cap, scroll body, reachable heading/close/footer, labelled-row adaptation, and no background activation. |
| zero-one-many | Goals, efforts, exercises, evidence, bodyweight | ✅ covered | Zero uses exact empty copy, one uses singular effort/entry/source, many uses count and stable order without changing row meaning. |
| long-text | Exercise/source/rule/target labels | 🧪 backstop | Native long-string and 200% captures must prove wrap, intact units, stable 48dp trailing targets, and no ellipsis of source identity/consequence. |
| long-text | Error/evidence/privacy/confirmation copy | 🧪 backstop | Native reflow and focus traversal must show full consequential text and recovery actions without clipping. |
| chart-equivalence | Every Strength/Running visual trend | ✅ covered | Straight source series plus separate goal line; visible summary and Show history data use the same typed series; missing/sparse rules are explicit. |
| retained-state | Root, detail, retry, rebuild, theme | ✅ covered | Sport/range/scroll/invoking-control persist until the owner changes them or source identity explicitly invalidates the detail. |
| destructive | Bodyweight deletion | ✅ covered | Row-specific Delete bodyweight entry → consequence → Keep bodyweight entry/Delete bodyweight entry; no write on dismiss; committed reload before removal. |
| 200%-text | Root, rows, charts, sheets, forms, nav | 🧪 backstop | Android font-scale 2.0 at required widths must prove every label/unit/action/data equivalent remains readable and reachable with >=48dp targets. |
| landscape | Root and all five sheet/detail families | 🧪 backstop | Native landscape captures must prove bottom navigation remains bottom, one scroll owner, full chart/data access, and no IME/footer overlap. |
| keyboard/D-pad | Tabs, ranges, rows, chart disclosures, forms, sheets | 🧪 backstop | Hardware-keyboard/D-pad evidence must prove group arrows, Enter/Space, Back/Escape, no background activation, and logical order. |
| focus | Root/deep/sheet/mutation transition graph | 🧪 backstop | Automated focus assertions plus native evidence must prove entry, invalid-field targeting, exact trigger return, and stable fallback after deletion. |
| reduced-motion | Tabs, ranges, charts, sheets, notices | ✅ covered | Same source state, values, commands, data equivalent, and focus without translation, animated scroll, or chart drawing. |

---

## Requirement and Evidence Traceability

| Requirement | Contract location | Planned evidence |
|---|---|---|
| PRO-01 | Sport and range controls; keyboard/focus | progress.sport-range.json |
| PRO-02 | All; comparable-fact definitions | progress.all.json |
| PRO-03 | Strength; Exercise history route | progress.strength.json |
| PRO-04 | Running; chart/evidence contract | progress.running.json |
| PRO-05 | Running exact 2.4 km target/pacing | progress.fixed-goal.json |
| PRO-06 | Running unset targets and missing effort | progress.unset-goals.json |
| PRO-07 | Loading/empty/sparse/More data needed states | progress.running-source-states.json |
| PRO-08 | Rebuild/read-error/stale recovery | progress.progress-errors.json |
| PRO-09 | Running history sheet and chart data equivalent | progress.history-sheet.json |
| PRO-10 | Existing Exercise history route | progress.exercise-history-route.json |
| PRO-11 | Eligible Load/Relative disclosure | progress.relative-view.json |
| PRO-12 | Running target sheet | progress.target-editor.json |
| PRO-13 | Target validation, commit, stale/failure recovery | progress.target-persistence.json |
| PRO-14 | Recommendation review sheet | progress.recommendation.json |
| PRO-15 | Recommendation commit/revision recovery | progress.recommendation-persistence.json |
| PRO-16 | Progress settings and prohibited data/scores | progress.progress-settings.json |
| PRO-17 | Bodyweight empty/history/delete confirmation | progress.bodyweight-history.json |
| PRO-18 | Bodyweight editor/validation/persistence | progress.bodyweight-editor.json |

Native acceptance must additionally record Light/Dark/System, 360×800, 390×844, 600×960, 840×1080-equivalent, landscape, 200% text, TalkBack, keyboard/D-pad, focus, and reduced-motion evidence. Browser evidence confirms Revision 18 hierarchy and source reachability only; it is not native proof.

---

## Registry Safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| shadcn official | none | Not applicable — Expo/React Native project with no components.json |
| Third-party UI registries | none | Not applicable — no registry block may enter Phase 19 |

No new chart/UI package is authorized. Existing native SVG and repository components are reused. Any later dependency request requires normal dependency, license, bundle, accessibility, and security review outside this UI contract.

---

## Researcher Six-Dimension Self-Check

| Dimension | Verdict | Evidence |
|---|---|---|
| 1 Copywriting | PASS | Exact sport/range, factual labels, fixed/unset target copy, loading/empty/sparse/rebuild/error/retry, and noun-specific Open history, Review target, Keep target unchanged, Discard target changes, and bodyweight edit/delete/discard/keep actions are declared. |
| 2 Visuals | PASS | Root hierarchy, All/Strength/Running anatomy, chart/goal/evidence/next-target rules, details/sheets, source states, responsive layouts, and interaction/focus behavior are prescriptive. |
| 3 Color | PASS | Exact Phase 14 Light/Dark tokens, 60/30/10 allocation, semantic reservations, non-color status text, goal-line separation, and destructive-only color are explicit. |
| 4 Typography | PASS | Exactly four sizes and two weights are declared; Archivo and IBM Plex Mono roles, line heights, units, and wrapping rules are fixed. |
| 5 Spacing | PASS | The reusable scale is exactly 4, 8, 16, 24, 32, 48, and 64dp; oracle-backed 3dp segmented gap and 18dp hero separation are cited local exceptions; 3dp outline/offset is separately classified as focus geometry. |
| 6 Registry Safety | PASS | Manual React Native system declared; shadcn and third-party registries are unused; no new chart dependency is authorized. |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved by gsd-ui-checker; explicit owner and external gates remain open where documented.
