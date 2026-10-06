# Feature Landscape: Gym Tracker v1.2

**Domain:** Offline-first Android strength training, concurrent Running plans and imported Garmin activity history
**Researched:** 2026-10-06
**Scope:** Source inventory and production-route mapping for planning only. No browser was launched by this researcher; the orchestrator independently verifies rendered behavior.
**Evidence:** Direct inspection of approved revision 18, prototype source, owner brief, current route files and UI components. GSD's generic confidence seam returns LOW for provider=local even with --verified because local is not a registered research provider; this is a tooling/provenance limitation, not proof of runtime behavior. Source findings below are testable hypotheses until independently rendered/native-verified. No external ecosystem claims or current API capabilities are asserted here.

## Recommendation

Build the domain foundation first, then shared presentation and Workout, Calendar and Library, then actual Garmin import/detail before Progress. The prototype is a presentation oracle with simulated persistence. Its side-by-side phones, arbitrary dates, hard-coded activity values, timeout commits and toast-only mutations must not become production data logic. Use the approved composition over existing Material/card/rail defaults, while keeping the shipped SQLite, history, recovery and portability contracts.

The inventory is exhaustive at the screen/route/interaction/state level for this source pass: **172 requirement-bearing entries**, plus **8 excluded/superseded branches**, **170 static control records**, **48 dynamic action occurrences** and **83 token/motion source lines**. [REQUIREMENTS.md](../../REQUIREMENTS.md) gives atomic phase ownership. The machine inventory and parity matrix use the same stable IDs; no count includes decorative status-bar assets as product features.

## Authority and source conflicts

1. Owner planning brief and explicit clarification.
2. approved.json, revision 18 backwards through revision history.
3. Current rendered/source prototype behavior.
4. Earlier v1.2 draft.
5. Existing planning.
6. Existing implementation presentation patterns.

The owner-approved engineering invariants retain authority over every prototype simulation. The [shared source-precedence record](../../design/v1.2-SOURCE-PRECEDENCE.md) governs any interpretation. These are resolutions of existing source precedence, not owner-approved deviations.

| ID | Conflict | Planning resolution |
|---|---|---|
| C-01 | approved.json revision_status and earlier draft still say awaiting owner review / implementation unauthorized. | Owner brief approves revision 18 as planning target and authorizes planning only; no product implementation or external approval-file edit. |
| C-02 | Earlier variants split warm editorial root from dark active view; shipped root is Today and may switch navigation rail at wider widths. | One synchronized Light/Dark/System theme; exactly Workout/Calendar/Library/Progress with approved bottom-navigation composition. No implicit >=840 rail replacement. |
| C-03 | Revision 8 proposed in-app live running, GPS, permission/background recording and pause/finish. | Revision 9 and owner remove run recording. Garmin records; Gym Tracker imports. No recorder feature or fifth root. |
| C-04 | Prototype finishCalendarDrag allows velocity >=0.45 px/ms to settle below 25% distance; owner locks short-drag snap-back. | Use 25% distance as the settle requirement. Title changes at 25% and reverses below it. Short fast drags snap back. The 0.45 source value is evidence of a resolved conflict, not a production threshold. |
| C-05 | Revisions 6-15 and hidden markup show inline legend, status markers, different focus cells, old adjacent collapse-only behavior and nested action buttons. | Revisions 16/17 plus owner require Calendar key sheet, shared top-aligned date/event rows, measured row morph, adjacent collapse-select-expand and single-tap agenda routing. |
| C-06 | Earlier current-set structure had a second yellow stripe inside active exercise. | One continuous active-exercise 4px edge; current row relies on fill, number, clock and Current label. |
| C-07 | Revision 5 cadence and old shipped nested timing/cue controls conflict with revision 7/8 and owner flat timing. | No cadence, rest-between-reps, nested Advanced Timing surface or plan sound/haptic controls. Preserve authoritative legacy facts while exposing approved flat between-set sec controls. |
| C-08 | Hidden Calendar selected-day UI includes Resume/Start/View actions; shipped session detail includes correction/removal/resume. | Calendar-origin detail is strictly read-only, including partial/planned Strength. Preserve deliberate management/correction routes outside that context. |
| C-09 | Old Create plan immediately assumes Strength; running editor returns ACTIVE FUTURE fixture after a create toast. | All create paths open neutral chooser and actual saved plan remains inactive until explicit activation. |
| C-10 | Legacy hidden Progress has consistency-first summary, three-session recommendation evidence and old exercise sheets; pv2 is the reachable view. | Use All/Strength/Running latest/best/target/goal presentation and current pv2 evidence. Do not ship hidden fixture claims; real facts determine evidence and preserved history remains available. |
| C-11 | Prototype uses setTimeout completion, localStorage, fixture FIT parsing, toast-only saves, boolean matching and hard-coded goals/dates. | Carry presentation intent to real commands/read models. SQLite, transaction, validation, identity, recovery and selected-candidate integrity outrank illustrative prototype data mechanics. |
| C-12 | Prototype App Settings omits data/recovery; older docs mention previous fonts and styles. | Preserve shipped deep data/history routes, use current prototype Archivo/IBM Plex Mono and semantic tokens, and extend the approved language to native-only states. |
| C-13 | Revision 2 requires accessible Move up/down; active prototype only has pointer grip handling and treats pointercancel like pointerup. Plan editor Move up/Add exercise have no action handlers. | Implement intended accessible reorder and actual editor actions through existing domain commands; pointer cancellation must not persist a move. Record source gaps without copying them. |
| C-14 | Running-session loader ignores persisted empty arrays, type editors have free text, and plan create/save does not persist entered goal fields into its detail fixture. | Keep real empty session lists, typed validation and persistent goals/session identity. Preserve common fields where compatible; provide native error recovery. |

## Table Stakes

| Feature | Why expected | Complexity | Phase |
|---|---|---|---:|
| Four roots and consistent Light/Dark/System | Owner-approved whole-app presentation | Medium | 14 |
| Immediate Workout identity, Start/Resume and full session preview | Gym-floor orientation and offline workout trust | High | 15 |
| Set-row editing and commit-gated completion/rest | Critical workout loop; preserve all nine metrics | High | 15 |
| Real multi-active plan ownership and independent schedules | Concurrent Strength/Running cannot be a UI-only fiction | High | 13 |
| Shared month/focused Calendar with correct event facts | All schedules and source activities must agree | High | 16 |
| Complete Library creation/edit/activation routes | Existing ownership and future-target semantics remain usable | High | 17 |
| Original-file/FIT imports and confirmed activity matching | Personal-use fallback and source-integrity boundary | High | 18 |
| Honest comparable progress, sparse/empty/error states | No invented performance claims | High | 19 |
| Deep recovery, backup, corrections and migration | Shipped capabilities must survive overhaul | High | 13–17 |
| Real native fidelity/accessibility/performance evidence | Browser source does not prove Android acceptance | High | 20 |

## Differentiators

| Feature | Value | Complexity | Dependencies |
|---|---|---|---|
| Warm editorial root plus compact active-set hierarchy | Fast scan and one-handed control | Medium | Shared tokens, reliable session identity |
| Calendar week-row morph and titled adjacent events | Maintains location while revealing agenda | High | Real layout measurements and gesture state |
| Structured seven-type Running plans | Specific, editable workout purpose without a recorder | High | Typed running sessions and independent schedules |
| Garmin imports alongside local Strength | Unified factual history with source provenance | High | Durable imports, dedupe, explicit matching |
| Latest/best/target/goal-line progression | Clear personal evidence and owner-controlled change | High | Comparable metrics and accepted targets |
| Optional bodyweight-relative views | Useful measurement without demographic/profile expansion | Medium | Dated bodyweight facts; no target side effects |

## Anti-Features

| Do not build | Reason | Use instead |
|---|---|---|
| In-app live outdoor/treadmill run recorder | Superseded by revision 9 and owner lock | Garmin records; actual FIT/approved API imports |
| Profile/Garmin/Running fifth root | Violates four-root contract | Contextual plan/sync/detail routes |
| Cadence, rest-between-reps, nested Advanced Timing UI | Explicitly removed presentation | Flat between-set rest with sec units |
| Plan-owned sound/haptic choices | Device/system ownership | Settings/rest-alert controls |
| Automatic goal acceptance, activity match or plan activation | Violates explicit owner decision | Confirmed, idempotent commands |
| Readiness/composite score or invented finish targets | Unsupported by source facts | Comparable personal history; unset targets |
| New plan import behind Later | Prototype placeholder has no implementation contract | Keep explicit unavailable entry |
| Review-wrapper demo buttons in product | Test harness controls | Fixtures and diagnostic-only state injection |
| Implicit >=840dp navigation rail substitution | Owner requires prototype bottom-nav composition | Same four roots at every width |

## Exact label, token and motion evidence

`H:L` means approved-hybrid.html line L; the complete CSS declarations and control labels are retained in the machine inventory. These are source values, not a license to copy HTML pixel units blindly where native accessibility demands a reviewed adjustment.

| Surface | Exact source contract | Evidence / interpretation |
|---|---|---|
| Fonts | Archivo variable width 75..125, weight 400..900; IBM Plex Mono 500/600 | H:10,98,151; native bundle and metric parity required |
| Dark canvas/surfaces/text | #080808 / #151515 / #202020; #f7f7f2; muted #aaa9a2; line #333330 | H:40–65 |
| Light canvas/surface/text | #fffaf0 / #f0eadf; #0d0c0a; muted #655f56; line #cec6b8 | H:67–93 |
| Semantic state colors | Dark green #72df92, yellow #f0c84b, blue #71aaff; Light #166b4c/#8d5d00/#195fae | H:54–65,81–92; backgrounds preserve contrast roles |
| Sport color | Strength --orange #d97820; Running --blue | H:18,1129–1130 |
| Current marker | Active exercise 4px left edge; no inner current stripe | H:533; revision 18 |
| Touch/focus | button min-height 48px; focus outline 3px blue, offset 3px | H:119–132; native >=48dp required |
| Set table | Set / Previous / Target / State; Completed / Current / Planned | H:2137–2204 |
| Add-set menu | Add warm-up set / Add working set; fixture hints 40 kg / Use target | H:1854–1855; hints must use real target context |
| Save/completion | Save set values; Save committed set edit; Complete warm-up Wn; Complete set n; Saving set…; Workout complete | H:2205–2224,2335–2337 |
| Rest | Resting / Rest paused; −15 / +15 / Pause / Resume / Skip | H:1810–1823,2729–2744; source +15 clamps at 900 seconds |
| Timing | Between-set rest / Default rest / sec; increments 1.25, 2.5, 5 | H:1910–1932; numeric step 15, min 0 |
| Set editor steps | Source weight ±2.5 kg, reps ±1, duration ±5 sec | H:1837–1842,2327–2333; source increment preference is not wired into stepper |
| Calendar cells | 28px date track, 36px event track; 3px padding + 1px border gives 4px top inset; min row 70px | H:1117–1128; stable measured row height H:1180 |
| Calendar event fills | Complete 14% tint; Partial 18% tint over first half, dotted 2px; Planned transparent dashed 2px | H:1131–1133; neutral legend uses 16%/22% |
| Calendar gesture claim | 7px intent slop; horizontal requires abs(dx)>=1.15×abs(dy); clamp ±panel width | H:3247–3267 |
| Calendar settle | Title/settle at >=25% width; source velocity fallback >=0.45 px/ms is overridden | H:3267–3289; C-04 governs production |
| Month transition | 240ms cubic-bezier(.22,.8,.3,1); 320ms completion fallback | H:1115,3136,3158 |
| Week expansion | 260ms cubic-bezier(.22,.8,.3,1); agenda 170ms ease after 70ms; cleanup 340ms | H:1186–1188,3057 |
| Week collapse/adjacent | 240ms cubic-bezier(.4,0,.78,.2); agenda fade 140ms; completion 280ms; adjacent re-entry gap 70ms | H:1191–1194,3070,3094 |
| Reduced motion | Transitions 0.01ms globally, no month transition; skip row morph and zero adjacent delay | H:1588–1591,3050,3063,3094 |
| Reorder | Active grip drag activates at 8px displacement | H:2698; source pointercancel behavior not production contract |
| Toast | top 82px active/Garmin, 104px root; opacity/translate 150ms; source dwell 2300/2400/2500ms | H:1523–1556,2033–2038,2820–2825,3694 |
| Non-production timing | Set commit delay 420ms; simulated Garmin sync 650ms | H:2276,3709; replace with real transaction/transport completion |
| Running goal | 2.4 km in 11:00; 4:35/km; 1:50/400 m; 0:55/200 m | Owner; revision 8; H:3586 |

## Reachable prototype and preserved native inventory

Origin meanings: `prototype_source` = an entry/handler exists in current source (rendered verification is separate); `prototype_present_unwired` = visible intent lacks real behavior; `required_native` = preserved or owner-required state not fully demonstrated; `required_domain` = prerequisite rather than a screen. Every row below has one owning phase. Concrete routes/components and test plans are in the machine inventory/parity matrix.

### Phase 13: Multi-active, running and import domain foundation

| Inventory / requirement | Screen | Interaction or state contract | Origin |
|---|---|---|---|
| domain.multi-active / DOM-01 | Plan activation | Support multiple active owned Strength and Running plans with independent schedules; migrate the shipped one-active-plan assumptions without bypassing repository rules. | required_domain |
| domain.activation-separate / DOM-02 | Plan creation | Persist new plan structure in an inactive state; creation, import, duplication and editing must not activate it implicitly. | required_domain |
| domain.migrate-existing / DOM-03 | Existing installations | Migrate existing plans, sessions and schedules transactionally while preserving identifiers, workout recovery state and authoritative completed history. | required_domain |
| domain.schedule-independent / DOM-04 | Scheduling | Resolve each plan's dates and rotation independently with explicit timezone/effective-date ownership; aggregate all eligible occurrences for Workout and Calendar. | required_domain |
| domain.schedule-collision / DOM-05 | Schedule conflict | Represent overlapping plan occurrences and apply explicit Move run, Move strength or Keep both decisions without rewriting historical facts. | required_domain |
| domain.workout-selection / DOM-06 | Workout selection | Choose the intended scheduled occurrence when several plans are active and preserve the existing single recovered in-progress workout authority. | required_domain |
| domain.running-structure / DOM-07 | Structured Running | Persist Recovery, Long run, Progression, Tempo, Intervals, Hills and Fartlek sessions with common and contextual steps, order and stable identities. | required_domain |
| domain.running-targets / DOM-08 | Running goal facts | Persist distance, optional owner-selected time/date, benchmark provenance and available training days; keep 10 km and Half Marathon times unset until explicitly chosen. | required_domain |
| domain.advisory-intensity / DOM-09 | Running advisory targets | Preserve pace, heart-rate-zone and RPE targets as advisory session fields without guaranteeing an outcome or collecting gender or height. | required_domain |
| domain.import-source-facts / DOM-10 | Imported activities | Persist activity source, external ID, content hash, timestamps, sport subtype, distance, elapsed/moving time, available HR, route and lap facts as source evidence. | required_domain |
| domain.import-idempotency / DOM-11 | Import duplicate handling | Deduplicate repeat sync and manual import using external Garmin activity identity and content hash, including FIT-to-API and API-to-FIT order. | required_domain |
| domain.matching-confirmed / DOM-12 | Activity matching | Require explicit owner confirmation of the selected scheduled occurrence before creating a durable activity match; import alone never completes or activates a plan. | required_domain |
| domain.rebuildable-projections / DOM-13 | Calendar and Progress facts | Build Calendar aggregation and comparable Running best-effort/goal views from durable facts with replayable projections and truthful missing/sparse states. | required_domain |
| domain.bodyweight-facts / DOM-14 | Bodyweight history | Persist optional dated bodyweight entries, edits and deletions for relative-strength views only; entries never alter workout targets. | required_domain |
| domain.backup-merge / DOM-15 | Data portability | Extend backup, restore and merge to all multi-plan, Running, imported-activity, match, goal and bodyweight facts and identities without duplicate creation. | required_domain |
| domain.offline-transaction / DOM-16 | Workout source authority | Keep workouts fully offline and acknowledge edits/completion only after exclusive transactions commit; notifications and UI feedback follow durable results. | required_domain |
| domain.history-integrity / DOM-17 | History revisions | Preserve correction revisions, remove/restore tombstones, metric identities, original snapshots and explicit recommendation acceptance across the new multi-plan model. | required_domain |

### Phase 14: Shared visual system, root shell and settings

| Inventory / requirement | Screen | Interaction or state contract | Origin |
|---|---|---|---|
| shell.four-roots / SHL-01 | Root shell | Expose exactly Workout, Calendar, Library and Progress in a shared root shell, preserving bottom navigation composition at all target widths. | prototype_source |
| shell.root-state / SHL-02 | Root navigation | Switch destinations in place with correct selected state, heading focus, deep-route exit and retained destination-specific state. | prototype_source |
| shell.appearance / SHL-03 | App Settings | Open App Settings from the root header and synchronize Light, Dark and System appearance across the four roots, Active Workout, sheets and dialogs; persist the choice and react to system changes. Garmin-specific appearance closure is owned by GAR-16 after its contextual route exists. | prototype_source |
| shell.tokens / SHL-04 | Shared visual language | Reproduce approved semantic colors, Archivo variable typography, IBM Plex Mono numerical text, spacing, borders and density using bundled native assets and shared tokens. | prototype_source |
| shell.sheets / SHL-05 | Shared dialogs and sheets | Use contextual bottom sheets with scrim, close/back dismissal, focus entry/trap/restoration and keyboard-safe content, preserving each surface's individual actions. | prototype_source |
| shell.toasts / SHL-06 | Feedback | Place theme-aware semantic toasts below top bars, clear of the command/rest dock; preserve accessible status announcements. | prototype_source |
| shell.launch / SHL-07 | Bootstrap | Preserve loading, trusted, failure/retry and notification-permission/continue-without-alerts startup states in the new visual shell. | required_native |
| shell.rest-alerts / SHL-08 | Settings / Rest alerts | Keep Rest sound, Rest vibration and notification settings reachable under device settings, outside plan timing. | required_native |
| shell.settings-deep-links / SHL-09 | Settings / History and data | Keep Removed sessions and Data and recovery reachable from Settings even though the prototype's App Settings only demonstrates appearance. | required_native |
| shell.removed-sessions / SHL-10 | Removed sessions | Preserve loading, empty, error/retry, restore confirmation, busy/failure and successful restoration of removed history. | required_native |
| shell.data-recovery / SHL-11 | Data and recovery | Preserve automatic-backup status/recovery and CSV export, preparing/sharing/cancel/error/retry states with accessible navigation into backup settings. | required_native |
| shell.automatic-backup / SHL-12 | Automatic backup settings | Preserve Google connection/disconnection confirmation, network preference, stale-writer takeover, partial deletion recovery, new-backup confirmation and privacy route. | required_native |
| shell.manual-backup / SHL-13 | Manual encrypted backup | Preserve encrypted export plus restore/merge preflight, exact confirmation, cancel, progress, failure/retry and rebuild-pending recovery flows. | required_native |

### Phase 15: Workout, Active Workout and completion

| Inventory / requirement | Screen | Interaction or state contract | Origin |
|---|---|---|---|
| workout.root-identity / WRK-01 | Workout root | Present the workout identity, summary, full scrollable exercise preview and Start/Resume action before secondary controls. | prototype_source |
| workout.day-switch / WRK-02 | Workout root / day selector | Select real plan-day previews with selected state and keyboard alternatives without silently advancing schedule rotation. | prototype_source |
| workout.scheduled-rest-empty / WRK-03 | Workout root states | Handle scheduled, rest/recovery and no-plan states with truthful action availability; retain starting-plan activation and empty-workout entry. | required_native |
| workout.start-alternate / WRK-04 | Workout start sheet | Preserve explicit scheduled-day, alternate-day and Start empty workout choices with cancel and focus restoration. | required_native |
| workout.start-resume / WRK-05 | Workout root / active recovery | Start the selected occurrence and resume the exact saved active session after background or process death; display recovered context and retry failed reads/starts. | required_native |
| workout.context-running / WRK-06 | Workout root / Running | Provide View plan and Sync Garmin contextual actions for Running alongside Strength, backed by actual independent active schedules. | prototype_source |
| workout.active-layout / WRK-07 | Active Workout | Render a full vertically scrollable exercise list with workout identity, working-set progress and compact per-exercise metadata. | prototype_source |
| workout.active-back / WRK-08 | Active Workout / back | Return from the active workout to its plan/root context without discarding the active session. | prototype_present_unwired |
| workout.exercise-disclosure / WRK-09 | Active Workout / exercises | Expand/collapse each exercise by header tap or Enter/Space, retain full long names up to two lines, and keep trend/menu targets separate. | prototype_source |
| workout.active-indicator / WRK-10 | Active Workout / current exercise | Use one continuous 4px yellow active-exercise edge; current set uses amber fill, highlighted number, clock and Current label with no second stripe. | prototype_source |
| workout.set-states / WRK-11 | Set table | Show Set, Previous, Target and State with completed check/green, current clock/amber and planned dash/neutral states. | prototype_source |
| workout.row-edit / WRK-12 | Set editor | Open editing by tapping any planned, current or committed row; changes apply only after Save and closing leaves facts unchanged. | prototype_source |
| workout.load-reps-editor / WRK-13 | Set editor / load and reps | Provide thumb-friendly kg/reps steppers and direct numeric input with units, nonnegative validation and explicit Save set values / Save committed set edit. | prototype_source |
| workout.duration-editor / WRK-14 | Set editor / duration | Use a duration-only editor for timed sets with sec labels and five-second decrement/increment controls. | prototype_source |
| workout.all-metrics / WRK-15 | Set editor / preserved metric profiles | Retain load_reps, bodyweight_reps, added_load_reps, assisted_reps, timed_hold, fixed_distance, fixed_time, intervals and unscored facts and compatible editors. | required_native |
| workout.warmup-order / WRK-16 | Active Workout / warm-ups | Place warm-ups before working sets with independent W1/W2 and 01/02 ordinals; exclude warm-ups from working-set progress. | prototype_source |
| workout.add-set / WRK-17 | Add set menu | Offer only Add warm-up set and Add working set from each exercise's + Add set menu; append warm-ups after existing warm-ups and before working sets. | prototype_source |
| workout.complete-commit / WRK-18 | Completion action | Pair Add exercise with Complete set in one compact dock row; show Saving set… and suppress duplicate taps until the real commit result arrives. | prototype_source |
| workout.complete-failure / WRK-19 | Completion failure | On failed set save, preserve the current row and entered values and expose Set not saved · Retry without false completion feedback. | required_native |
| workout.completion-collapse / WRK-20 | Exercise completion | After the final set commits, collapse its exercise and reveal the next current exercise; warm-up completion advances without between-set rest. | prototype_source |
| workout.rest-dock / WRK-21 | Rest dock | Replace completion controls with a full-width rest dock showing Resting/Rest paused, countdown and next-set context. | prototype_source |
| workout.rest-controls / WRK-22 | Rest dock controls | Provide −15, +15, Pause/Resume and Skip with accessible labels; expiry or skip restores the ready action without completing a set. | prototype_source |
| workout.rest-recovery / WRK-23 | Rest recovery | Recover the authoritative rest deadline/pause state and device-owned cues across backgrounding, process death and offline restart. | required_native |
| workout.trend / WRK-24 | Exercise trend sheet | Open trend via a dedicated icon and show Recent, Best, Change, six-session history and an accessible chart from comparable facts. | prototype_source |
| workout.exercise-menu / WRK-25 | Exercise menu | Limit exercise overflow to flat between-set timing, Replace exercise and Delete exercise; keep trend separate. | prototype_source |
| workout.timing-flat / WRK-26 | Exercise/plan timing | Use explicit sec controls for between-set rest and plan default rest; persist changes immediately without cadence, rest-between-reps, nested Advanced Timing or sound/haptic plan controls. | prototype_source |
| workout.plan-increment / WRK-27 | Plan settings | Show plan identity and 1.25/2.5/5 weight-increment choices with saved selection; preserve the distinction between increment preference and existing set targets. | prototype_source |
| workout.plan-after-workout / WRK-28 | Plan settings / deferred edit | Keep Edit plan after workout reachable and route to the real editor after the active session boundary, preserving schedule/history rules. | prototype_present_unwired |
| workout.add-exercise / WRK-29 | Exercise picker / add | Open the global Add exercise picker, search available exercises, choose an exercise and add it to the active session with loading/error/retry handling. | prototype_source |
| workout.replace-exercise / WRK-30 | Exercise picker / replace | Replace the chosen exercise through a contextual picker while retaining valid committed facts and requiring the domain's compatibility/impact rules. | prototype_source |
| workout.delete-exercise / WRK-31 | Exercise deletion | Require a second explicit Confirm delete action before removing an exercise and preserve committed source history and safe next-current selection. | prototype_source |
| workout.reorder / WRK-32 | Exercise reorder | Support grip drag and accessible Move up/Move down alternatives while preserving current exercise/set identity; cancelled gestures must not commit a reorder. | prototype_source |
| workout.undo / WRK-33 | Active Workout / Undo | Preserve shipped undo/edit-removal recovery through contextual feedback without adding a persistent Undo control to the approved compact dock. | required_native |
| workout.outcomes / WRK-34 | Workout actions / finish | Preserve Finish workout, Finish as partial, Finish workout later, zero-set save and Discard workout with confirmation and error/retry states. | required_native |
| workout.completion-review / WRK-35 | Workout completion | Preserve complete/partial summary, per-exercise results/effort, modified-from-plan status, details/return actions and failed-summary retry. | required_native |
| workout.completion-writeback / WRK-36 | Completion / plan write-back | Keep plan-change write-back explicit with preview/accept/cancel and failed-write retry; finishing never silently changes future targets. | required_native |

### Phase 16: Calendar and read-only detail

| Inventory / requirement | Screen | Interaction or state contract | Origin |
|---|---|---|---|
| calendar.month / CAL-01 | Calendar month | Fill the area above bottom navigation with a Monday-first month grid and persistent Previous, month title, Today and Next controls. | prototype_source |
| calendar.calendar-key / CAL-02 | Calendar key sheet | Place the info action immediately left of App Settings and show Activity and Status groups in a Calendar key sheet, with no inline legend. | prototype_source |
| calendar.event-encoding / CAL-03 | Calendar event appearance | Use orange Strength and blue Running, solid/tinted Complete, dotted half-filled Partial and transparent dashed Planned, with neutral status samples. | prototype_source |
| calendar.date-grid / CAL-04 | Calendar date geometry | Use shared month/focused date/event cells with 28px date and 36px event tracks, stable effective 4px top inset and measured row-height continuity. | prototype_source |
| calendar.events-titles / CAL-05 | Calendar event chips | Show up to two compact titled events per date in selected and adjacent weeks, preserving full names/statuses in day accessibility labels. | prototype_source |
| calendar.today-selection / CAL-06 | Calendar selection | Distinguish selected date, today, outside-month dates, rest day and empty dates without changing event status semantics. | prototype_source |
| calendar.drag-follow / CAL-07 | Calendar drag | Keep clipped previous/current/next month panels following horizontal pointer movement one-to-one, clamped to one panel, while vertical intent scrolls normally. | prototype_source |
| calendar.threshold / CAL-08 | Calendar drag settle | Change the visible title at 25% width, revert immediately below the threshold or on cancel, and settle only at or beyond 25%; shorter drags snap back even when fast. | prototype_source |
| calendar.month-motion / CAL-09 | Calendar month animation | Preserve the 240ms month-settle motion and cubic-bezier(.22,.8,.3,1), with completion handling that avoids stale selection or duplicate navigation. | prototype_source |
| calendar.month-navigation / CAL-10 | Calendar month controls | Keep previous/next/Today controls usable in both month and focused views, preserving/clamping selected day and returning to today's actual local date. | prototype_source |
| calendar.keyboard / CAL-11 | Calendar keyboard | Provide visible-focus arrow navigation and activation for date cells plus non-gesture month controls. | prototype_source |
| calendar.expand-week / CAL-12 | Calendar expanded agenda | Animate the selected month row to the top and its following row to the bottom, retain a single Monday-first weekday header, and reveal compact agenda rows. | prototype_source |
| calendar.collapse-week / CAL-13 | Calendar collapse | Reverse both focused rows to their measured month positions before showing month mode and restoring selected-day focus. | prototype_source |
| calendar.adjacent-week / CAL-14 | Calendar adjacent week | On adjacent-week date selection, collapse to month, select/focus the new date, then expand its week with events preserved. | prototype_source |
| calendar.reduced-motion / CAL-15 | Calendar reduced motion | Keep identical selected dates, navigation sequence and agenda content when reduced motion removes row movement and month transitions. | prototype_source |
| calendar.agenda / CAL-16 | Calendar agenda rows | Use one full-width tap target per event with title, one-line result/target, sport/status, source and chevron; remove nested Resume/View/Match actions. | prototype_source |
| calendar.agenda-routing / CAL-17 | Calendar agenda navigation | Route Strength to read-only workout detail, planned Running to Running plan, and imported Running to Garmin activity detail using real entity identities. | prototype_source |
| calendar.readonly-history / CAL-18 | Calendar / workout history | Render Active-shaped full-height completed/partial workout detail with exercise disclosure, all set rows and result/state semantics, but no edit/complete/reorder/settings mutation. | prototype_source |
| calendar.planned-preview / CAL-19 | Calendar / planned Strength | Render planned Strength as a read-only plan-occurrence preview without inventing a session ID, completed set or result. | prototype_source |
| calendar.detail-return / CAL-20 | Calendar detail return | Preserve agenda date, expanded week and triggering-row focus on detail Back, and expose expand/collapse controls for each historical exercise. | prototype_source |
| calendar.calendar-load-error / CAL-21 | Calendar loading/error | Add source-backed loading, empty, stale-projection/error and retry states that retain the selected date and never display invented sessions. | required_native |
| calendar.history-deep-correction / CAL-22 | Preserved workout correction | Keep deliberate Correct workout, revision history, draft validation, stale-revision conflict and save/retry in the existing correction route, outside Calendar's read-only detail context. | required_native |
| calendar.history-management / CAL-23 | Preserved workout management | Keep intentional Resume workout and Remove from history/confirmation reachable from a separate management context while Calendar history stays read-only. | required_native |

### Phase 17: Library, plan creation and structured Running

| Inventory / requirement | Screen | Interaction or state contract | Origin |
|---|---|---|---|
| library.views / LIB-01 | Library root | Remember Plans/Exercises selection with independent search, filters, favorites and detail-return state. | prototype_source |
| library.plans-groups / LIB-02 | Library / Plans | Present Active Plans, My Plans and Starter Plans with owned/inactive/starter/Running identity, next scheduled item and grouped counts. | prototype_source |
| library.search-filters / LIB-03 | Library search and filters | Search each view, clear query separately, apply filter counts and preserve query when clearing filters; distinguish No matches from true no-plan state. | prototype_source |
| library.exercise-lists / LIB-04 | Library / Exercises | Show Favorites, Recent and All Exercises with per-exercise favorite toggles and searchable metric/equipment context. | prototype_source |
| library.actions-menu / LIB-05 | Library actions | Provide Create plan and Create exercise from the Library actions sheet; keep Import plan explicitly unavailable/Later rather than implying a working importer. | prototype_source |
| library.plan-type-chooser / LIB-06 | Create plan chooser | Route every Create plan entry, including true empty Plans, to one neutral Strength/Running chooser explaining that creation does not activate. | prototype_source |
| library.empty-plans / LIB-07 | Library / empty Plans | Show No plans yet and Create a strength or running plan to get started with the same chooser action. | prototype_source |
| library.owned-detail / LIB-08 | Owned plan detail | Add a plan summary route with active/inactive status, schedule, history, source and training days before editing actions. | prototype_source |
| library.owned-actions / LIB-09 | Owned plan actions | Provide Edit plan, Edit schedule, Duplicate, Archive plan/confirmation and Reactivate plan with preserved history and explicit activation. | prototype_source |
| library.starter-detail / LIB-10 | Starter detail | Retain immutable starter preview, source/equipment/schedule/training days, Preview activation and Save editable copy. | prototype_source |
| library.starter-activation / LIB-11 | Starter activation | Preview the actual affected schedules and create/activate a reviewed owned copy only on confirmation; Save without activating stays inactive. | prototype_source |
| library.template-update / LIB-12 | Starter template update | Keep template-update comparison and Create new copy reachable through the existing activation update query route, preserving previous owned history. | required_native |
| library.create-strength / LIB-13 | Strength creation | Collect Plan name and First day, continue to the real editor, and save the draft without activation. | prototype_source |
| library.plan-editor / LIB-14 | Strength plan editor | Preserve day/exercise/set/metric target editing, add/move/remove actions and explicit save while applying the approved compact editor presentation. | prototype_source |
| library.editor-draft-guards / LIB-15 | Plan editor recovery | Preserve unsaved-change confirmation, save failure/retry, revision conflict, archive/duplicate confirmations and immutable completed history. | required_native |
| library.schedule-editor / LIB-16 | Schedule editor | Edit future weekday bindings with selected-day state and Save schedule, preserving real effective-date, rotation and multi-plan ownership rules. | prototype_source |
| library.replacement-impact / LIB-17 | Plan exercise replacement | Retain occurrence/all-occurrences scope, compatible metric selection, target review and refreshed impact preview before saving replacement. | required_native |
| library.day-removal-impact / LIB-18 | Plan day removal | Retain removal impact, replacement binding/remove binding, effective date and current-workout guard before deleting a plan day. | required_native |
| library.builtin-exercise / LIB-19 | Built-in exercise detail | Show exercise instructions, tracking, equipment, last result and plan usage with favorite and Hide from pickers actions while preserving bundled facts. | prototype_source |
| library.custom-exercise / LIB-20 | Custom exercise detail/edit | Show custom identity and manual progression; edit name/tracking/equipment through the real editor and archive explicitly. | prototype_source |
| library.create-exercise / LIB-21 | Create exercise | Create a local custom exercise with valid Name, Tracking and Equipment fields, then open its detail; preserve all supported metric-profile choices. | prototype_source |
| library.copy-metric-migration / LIB-22 | Exercise copy/metric migration | Preserve existing edit?mode=copy and edit?mode=metric routes, future-target impact, policy choice, confirmation and active-workout guard. | required_native |
| library.library-load-errors / LIB-23 | Library source states | Preserve loading, query failure/retry, refresh failure, deleted/missing detail and content-update review/dismiss states in all Library flows. | required_native |
| library.running-detail / LIB-24 | Running plan detail | Show saved goal/pacing/schedule and derived weekly sessions with Sync Garmin / match activity, Edit running plan and collision entry points. | prototype_source |
| library.running-create / LIB-25 | Running creation | Open Running creation from the chooser with goal, benchmark and structured sessions; save inactive and make Garmin connection optional afterward. | prototype_source |
| library.running-goal-edit / LIB-26 | Running plan editor | Edit goal distance/time and weekly sessions, validate invalid goal input, and persist edits that the detail and Progress can read. | prototype_source |
| library.running-session-common / LIB-27 | Running session editor | Add/edit a session with Workout type, Day, Warm-up, Cool-down, Session preview and Save session; preserve common fields when changing type. | prototype_source |
| library.running-recovery / LIB-28 | Running / Recovery | Expose Volume (time or distance) and Easy target (pace, HR zone, or RPE) for Recovery sessions. | prototype_source |
| library.running-long / LIB-29 | Running / Long run | Expose volume, Effort target and Easy throughout/Steady finish/Progression finish options for Long run. | prototype_source |
| library.running-progression / LIB-30 | Running / Progression | Expose Total volume, Stages, Start target and Finish target for Progression sessions. | prototype_source |
| library.running-tempo / LIB-31 | Running / Tempo | Expose Continuous/Tempo repeats format, Repeats, Work duration/distance, Recovery and Intensity target for Tempo. | prototype_source |
| library.running-intervals / LIB-32 | Running / Intervals | Expose Repeats, Work duration/distance, Recovery and pace/HR-zone/RPE target for Intervals. | prototype_source |
| library.running-hills / LIB-33 | Running / Hills | Expose Repeats, Uphill duration/distance, Return recovery and Effort target for Hills. | prototype_source |
| library.running-fartlek / LIB-34 | Running / Fartlek | Expose Structured/Unstructured style, Surges/repeats, Fast segment or cue, Easy float/recovery and Effort target. | prototype_source |
| library.running-session-lifecycle / LIB-35 | Running session lifecycle | Persist session addition, edit, deletion and order; preserve a truly empty saved session list and provide error/retry without restoring fixture defaults. | required_native |
| library.running-conflict / LIB-36 | Running / schedule conflict | Offer Move run, Move strength and Keep both with actual future-date choices, explicit confirmation and persisted outcomes. | prototype_source |

### Phase 18: Garmin sync, FIT and activity detail

| Inventory / requirement | Screen | Interaction or state contract | Origin |
|---|---|---|---|
| garmin.entry / GAR-01 | Garmin contextual route | Open Garmin contextually from Workout, Running plan or imported Calendar activity, preserving only the four app roots. | prototype_source |
| garmin.header / GAR-02 | Garmin header | Keep Garmin Sync on one line in a stable three-column header with appearance flush right and an inert back placeholder at Garmin's root. | prototype_source |
| garmin.not-connected / GAR-03 | Garmin disconnected | Show Garmin not connected with Connect Garmin and Import FIT fallback, making available operations truthful when API access is unavailable. | prototype_source |
| garmin.consent / GAR-04 | Garmin connection | Implement consented authorization through an approved Garmin Activity API integration with OAuth2 PKCE and cancel/error/denied/expired/revoked recovery; do not ship simulated consent as real. | required_native |
| garmin.connected / GAR-05 | Garmin connected account | Show connection/consented-access/last-sync facts, activity list and durable dedupe receipt status with Sync now, Import FIT and Revoke. | prototype_source |
| garmin.sync-states / GAR-06 | Garmin sync | Show busy Syncing Garmin activities, successful import/no-duplicates feedback, and Sync could not complete with Try again/Import FIT while previous facts remain. | prototype_source |
| garmin.revoke / GAR-07 | Garmin revocation | Revoke/disconnect activity access without deleting imported history; reflect the real provider result and permit later reconnection. | prototype_source |
| garmin.fit-import / GAR-08 | FIT import | Use a native original-file picker and actual FIT parsing/preview, supporting personal use without Garmin program approval. | required_native |
| garmin.fit-errors / GAR-09 | FIT error/recovery | Handle unsupported, malformed, oversized, truncated and duplicate files, cancelled selection and interrupted import without partial source facts or lost prior activities. | required_native |
| garmin.activity-outdoor / GAR-10 | Outdoor activity detail | Show imported outdoor elapsed/moving time, distance/pace facts, optional route and spaced Average heart rate label/value when present. | prototype_source |
| garmin.activity-treadmill / GAR-11 | Treadmill activity detail | Show No route for treadmill activity plus distance/time/pace/laps and available source facts; never invent a route. | prototype_source |
| garmin.laps / GAR-12 | Garmin lap table | Display Lap, Time and Pace columns from imported lap semantics with accessible row/column labels and honest missing values. | prototype_source |
| garmin.match-candidates / GAR-13 | Activity matching | Open Match to scheduled workout, show candidate identities and select one candidate without completing anything yet. | prototype_source |
| garmin.match-confirm / GAR-14 | Activity confirmation | Persist exactly the selected candidate only on Confirm match; Leave unmatched/Back performs no match, and failed/stale confirmation preserves the activity. | required_native |
| garmin.detail-recovery / GAR-15 | Imported activity recovery | Provide loading, missing activity, parse/projection error and retry states with correct Back behavior and no fabricated detail. | required_native |
| garmin.appearance / GAR-16 | Garmin appearance | Use the same persisted Light/Dark/System appearance controls as App Settings, with synchronized selection and dismiss/focus restoration. | prototype_source |

### Phase 19: Progress and personal goals

| Inventory / requirement | Screen | Interaction or state contract | Origin |
|---|---|---|---|
| progress.sport-range / PRO-01 | Progress navigation | Provide All, Strength and Running tabs plus 4 weeks, 12 weeks and All time ranges with selected/accessibility state and keyboard alternatives. | prototype_source |
| progress.all / PRO-02 | Progress / All | Show nearest active goal with Latest, Best, Target and personal-history goal line, active goals and planned-next context from real comparable facts. | prototype_source |
| progress.strength / PRO-03 | Progress / Strength | Show primary strength goal, gap/status, Needs review and exercise-progress rows using comparable completed history. | prototype_source |
| progress.running / PRO-04 | Progress / Running | Show latest/best/target/gap, goal-line trend, running goals, best efforts and derived pacing from imported activities. | prototype_source |
| progress.fixed-goal / PRO-05 | Running pacing | Keep the default 2.4 km goal at 11:00 with 4:35/km, 1:50/400 m and 0:55/200 m; derive changes only from explicit owner-selected targets. | prototype_source |
| progress.unset-goals / PRO-06 | Running goal empty target | Keep 10 km and Half Marathon target times unset until chosen; show Set target/Target unset and No effort recorded without plotting zero. | prototype_source |
| progress.running-source-states / PRO-07 | Running data states | Provide ready, sparse, empty and loading presentations: one effort says More data needed, missing imports show no zero chart, loading communicates busy. | prototype_source |
| progress.progress-errors / PRO-08 | Progress recovery | Provide source-loading failure/retry and stale/rebuilding projection states without losing current sport/range or reporting unreliable results. | required_native |
| progress.history-sheet / PRO-09 | Progress history sheet | Open primary chart/exercise/best-effort details with an accessible history chart, separate goal line and clear empty state. | prototype_source |
| progress.exercise-history-route / PRO-10 | Exercise history deep route | Preserve the existing exercise-history route, comparable metric facts, source sessions, empty/error/loading states and return navigation. | required_native |
| progress.relative-view / PRO-11 | Strength relative view | Offer Load/Relative only when a valid optional bodyweight exists for a load metric; disclose its measurement basis and never change targets. | prototype_source |
| progress.target-editor / PRO-12 | Running target sheet | Edit Distance, Target time, Optional target date and Available training days while showing a read-only Current benchmark and explicit Save target/Cancel. | prototype_source |
| progress.target-persistence / PRO-13 | Running target validation | Persist validated target edits to source facts; reject invalid time/date without losing draft and keep plan/detail/Progress goal displays consistent. | required_native |
| progress.recommendation / PRO-14 | Recommendation review sheet | Show Review target with Current/Proposed values, personal-history evidence and Keep current/Use target choices. | prototype_source |
| progress.recommendation-persistence / PRO-15 | Recommendation decision recovery | Persist acceptance/keep decisions once with revision checks; keep failure/retry visible and prevent a dismissed recommendation reappearing from a fixture rerender. | required_native |
| progress.progress-settings / PRO-16 | Progress settings | Keep Body metrics/Settings and Bodyweight history reachable; explain personal history and optional measurements without collecting gender/height or creating a score. | prototype_source |
| progress.bodyweight-history / PRO-17 | Bodyweight history | Show optional empty/bodyweight history with Add first entry/Add entry, dated values, Edit and two-step Delete/Confirm. | prototype_source |
| progress.bodyweight-editor / PRO-18 | Bodyweight editor | Provide dated kg input with Add/Edit, Save entry/Cancel, error feedback and persistence; enforce reviewed valid measurement/date bounds. | prototype_source |

### Phase 20: Native acceptance, accessibility and performance

| Inventory / requirement | Screen | Interaction or state contract | Origin |
|---|---|---|---|
| verification.parity / VER-01 | All screens | Verify every inventory route/interaction/state against its mapped requirement and native implementation with recorded evidence and no unmapped route. | required_native |
| verification.themes / VER-02 | Appearance matrix | Compare native screenshots against approved Light and Dark and verify System transitions on all root, detail and sheet surfaces. | required_native |
| verification.viewports / VER-03 | Responsive geometry | Verify 360×800, 390×844, 600×960 and 840×1080-equivalent viewports plus landscape without loss of required actions or changing the four-root composition. | required_native |
| verification.text-accessibility / VER-04 | Text and touch accessibility | Verify required actions at 200% text, minimum 48dp touch targets, semantic labels and meaningful non-color state encoding. | required_native |
| verification.keyboard-focus / VER-05 | Keyboard and modal focus | Verify keyboard/D-pad movement, visible focus, Back/Escape, focus restoration and keyboard-safe editing across all sheets and deep routes. | required_native |
| verification.reduced-motion / VER-06 | Reduced motion | Verify Calendar and other transitions keep identical destination/state semantics with motion disabled. | required_native |
| verification.sqlite-migration / VER-07 | Migration and portability acceptance | Run real SQLite migration, backup/restore/merge, idempotency and historical-revision tests with old and new multi-plan databases. | required_native |
| verification.offline-recovery / VER-08 | Offline and process death | Verify offline strength workouts and process-death recovery at start/edit/commit/rest/finish/import/match boundaries, distinguishing committed and uncommitted work. | required_native |
| verification.calendar-gestures / VER-09 | Calendar native gestures | Verify native 1:1 drag, 25% title/settle boundary, short-fast snap-back, vertical intent, expand/collapse/adjacent-week continuity and cancel. | required_native |
| verification.garmin-import / VER-10 | Garmin acceptance | Verify actual FIT imports, transport-order duplicate suppression, optional source facts and explicit selected-candidate matching; gate API acceptance on real approval/access. | required_native |
| verification.performance / VER-11 | Performance gates | Preserve or improve existing p95 interaction and launch budgets with the full calendar, large histories, long active sessions and representative import loads. | required_native |
| verification.physical-review / VER-12 | Attended Android review | Record owner-attended Samsung visual/usability/accessibility acceptance in addition to automated evidence. | required_native |
| verification.release-readiness / VER-13 | Release readiness | Prepare signed personal-use Android release verification, recovery/rollback evidence and a complete parity/deviation review before any later release authorization. | required_native |

## Shipped deep routes versus proposed additions

| Route family | Existing source | v1.2 mapping |
|---|---|---|
| Workout roots | app/(tabs)/index.tsx, calendar.tsx, library.tsx, progress.tsx | Keep route identity; root title Today becomes Workout |
| Workout and completion | app/workout/[sessionId].tsx; app/completion/[sessionId].tsx | Preserve outcome/recovery contracts; apply new presentation |
| Session detail/correction | app/session/[sessionId].tsx; app/session/[sessionId]/correct.tsx | Explicit read-only Calendar context, separate deliberate management/correction access |
| Exercise history | app/exercise-history/[exerciseId].tsx | Preserve deep histories; approved trend sheets can share read models |
| Owned plan | app/library/plan/[planId]/edit.tsx and schedule.tsx | Add owned summary before editor; keep deep editors |
| Plan creation | app/library/plan/create.tsx | Neutral chooser; Strength creation routed to proposed create-strength.tsx |
| Impact review | app/library/plan/[planId]/replace/[occurrenceId].tsx; day/[dayId]/remove.tsx | Preserve compatibility, scope, effective-date and stale-preview checks |
| Starter | app/library/starter/[templateId].tsx; [templateId]/activate.tsx | Preserve activation and update query mode with ownedPlanId |
| Exercise | app/library/exercise/[exerciseId].tsx; create.tsx; [exerciseId]/edit.tsx | Preserve custom edit, mode=copy and mode=metric migrations |
| Settings/data | app/more/index.tsx; data-and-recovery.tsx; automatic-backup-settings.tsx; manual-encrypted-backup.tsx; drive-backup-privacy.tsx; removed-sessions.tsx | Preserve reachable deep capabilities absent in appearance-only prototype |
| Planned Strength | No existing session for an unstarted occurrence | Proposed app/calendar/plan/[occurrenceId].tsx; never invent session ID |
| Running plans | No current running-specific route files | Proposed app/library/running/create.tsx; [planId].tsx; [planId]/edit.tsx; [planId]/session/[sessionId].tsx |
| Garmin imports | No current Garmin route files | Proposed app/garmin/index.tsx; import.tsx; activity/[activityId].tsx; match/[activityId].tsx |

Proposed filenames are integration targets, not created product files. Exact additions may be aligned by the architecture plan while preserving the inventory IDs and requirement ownership. Diagnostic routes beginning app/__ remain engineering harnesses, not consumer navigation.

## Feature dependencies and phase ordering

```text
13 multi-plan + Running + import identities + backup migration
  -> 14 shared shell/tokens/settings
  -> 15 source-backed Workout/Active/completion
  -> 16 aggregated Calendar/read-only history
  -> 17 Library chooser/editors/structured Running
  -> 18 real Garmin/FIT ingestion and confirmed matching
  -> 19 Progress driven by imported facts
  -> 20 native fidelity/accessibility/performance/recovery acceptance
```

Presentation work can be decomposed by surface after domain/read-model contracts stabilize; Phase 19 must consume Phase 18 import facts. Phase 20 validates the full system and does not postpone component/domain tests from earlier phases.

## Prototype gaps to handle explicitly

- Current source has no browser route router: root and deep layers are JS state/overlays, while active/Garmin examples are separate presentation phones. Convert conceptual navigation into native routes with return context.
- Start action and active header Back are fixture/unwired behaviors; actual selected workout/occurrence identity must drive native navigation.
- Active set commit uses 420ms timeout and no demonstrated failure path. Real transaction failure/retry/recovery remain required.
- Exercise drag has no accessible Move up/down control despite revision 2 intent; cancelled drag can currently reorder. Owner accessibility and integrity rules govern.
- Old Library detail sheet handlers are intercepted by the later capture-phase deep router. Hidden Progress sheets and hidden Calendar selected-day controls are not current product paths.
- Deep plan save/duplicate/activation and some favorite/archive actions only toast or alter a fixture object; real commands must persist and update lists.
- The Running loader restores defaults after an empty saved array; final-session deletion must stay empty in production.
- FIT input loads a fixture without parsing bytes. Matching stores only a boolean and ignores the selected candidate. Those source mechanics are explicitly superseded by real parsing/identity/confirmation requirements.
- Prototype review-state toggles expose sparse/empty/loading/error demonstrations; native states must arise from actual read/transport conditions.
- The last prototype keydown handler refers to Calendar symbols from a separate IIFE; source scope suggests an Escape defect. Orchestrator browser observations decide the rendered evidence; no prototype file is changed here.
- Bodyweight 20–400kg bounds and specific font/animation units are source evidence requiring native validation, not medical recommendations.

## Sources

- Owner: ../../v1.2-OWNER-BRIEF.md; ../../design/v1.2-SOURCE-PRECEDENCE.md.
- /Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved.json; last_iteration 2026-10-06T02:46:05Z, revision 18. SHA-256 b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf.
- /Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/approved-hybrid.html. SHA-256 b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96.
- /Users/bytedance/.gstack/projects/fchoo-gym-tracker/designs/push-inspired-workout-20261001/design-audit-revision18/design-audit-revision18.md (focused active edge review only).
- Current app route files and src/ui/screens/components/theme in the designated worktree, inspected 2026-10-06. Source findings are not native execution evidence.
- Earlier draft consulted only as lower-priority background; no prototype or product source edited.

