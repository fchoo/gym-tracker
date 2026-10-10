# Requirements: Gym Tracker v1.2

**Final owner decisions (2026-10-07):** MAP-01, TIM-01, DEV-01 and DEV-02 are
approved in `.planning/v1.2-OWNER-DECISIONS.md`. Garmin sync uses bundled
python-garminconnect inside the standalone Android APK, reading activity JSON.
No runtime AI agents, desktop bridge, partner-program access, broker or FIT
decoder is required by this milestone. Native proof and data fidelity remain
implementation checks. No product decision remains open.

**Milestone:** PUSH-inspired UI/UX overhaul with multi-plan Running and imported activity foundations
**Status:** Final planning contract; all feature checkboxes remain unexecuted. This turn finalizes plans only.
**Baseline:** Owner planning contract, approved.json revision 18 latest-first, approved-hybrid.html source SHA-256 `b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96`.

## Contract and traceability

The owner contract in [.planning/v1.2-OWNER-BRIEF.md](v1.2-OWNER-BRIEF.md) and [source precedence](design/v1.2-SOURCE-PRECEDENCE.md) govern this plan. Every requirement has exactly one phase owner. Domain invariants belong to Phase 13; downstream UI requirements consume those invariants without duplicating ownership. Phase 18 supplies real imported facts before Phase 19 Progress. The [prototype inventory](design/v1.2-prototype-inventory.json) carries stable inventory IDs, source references, proposed/existing production targets and planned checks; the parity matrix will link these same IDs to implementation evidence. No requirement is complete before implementation and verification.

Exactly four roots: **Workout, Calendar, Library, Progress**. Preserve SQLite authority, exclusive commit gating, offline workouts, history revisions, explicit recommendation acceptance, idempotent imports, recovery and portability. No Profile/Running/Garmin fifth tab, in-app run recorder, per-rep cadence, demographic collection or invented fitness score. Prototype-only fixture buttons and simulated mechanics are not product behavior.

## v1.2 Requirements

### Phase 13: One-per-sport plan, running and import domain foundation

- [x] **DOM-01**: Support at most one active owned Strength plan and at most one active owned Running plan concurrently, with independent schedules; enforce per-sport uniqueness through the real repository/schema migration.
- [x] **DOM-02**: Persist new plan structure in an inactive state; creation, import, duplication and editing must not activate it implicitly.
- [x] **DOM-03**: Migrate existing plans, sessions and schedules transactionally while preserving identifiers, workout recovery state and authoritative completed history.
- [x] **DOM-04**: Resolve each plan's dates and rotation independently with explicit timezone/effective-date ownership; aggregate all eligible occurrences for Workout and Calendar.
- [x] **DOM-05**: Represent overlapping plan occurrences and apply explicit Move run, Move strength or Keep both decisions without rewriting historical facts.
- [x] **DOM-06**: Choose the intended scheduled occurrence when several plans are active and preserve the existing single recovered in-progress workout authority.
- [x] **DOM-07**: Persist Recovery, Long run, Progression, Tempo, Intervals, Hills and Fartlek sessions with common and contextual steps, order and stable identities.
- [x] **DOM-08**: Persist distance, optional owner-selected time/date, benchmark provenance and available training days; keep 10 km and Half Marathon times unset until explicitly chosen.
- [x] **DOM-09**: Preserve pace, heart-rate-zone and RPE targets as advisory session fields without guaranteeing an outcome or collecting gender or height.
- [x] **DOM-10**: Persist account-scoped Garmin external identity, versioned normalized JSON content digest, raw response provenance/hashes, timestamps, sport subtype, independent time bases, distance, and available HR/route/laps; retain sampling metadata and leave fit_sha256 absent without an original FIT.
- [x] **DOM-11**: Deduplicate repeat, interrupted, reordered and restored JSON sync using account-scoped external Garmin identity and canonical content digest; exclude fetch timestamps from content identity, stage changed source revisions, and never resurrect removed activities automatically.
- [x] **DOM-12**: Require explicit owner confirmation of the selected scheduled occurrence before creating a durable activity match; import alone never completes or activates a plan.
- [x] **DOM-13**: Build Calendar aggregation and comparable Running effort/goal views from durable accepted facts with replayable projections; only eligible source-reported summary/lap evidence supports exact-distance efforts, while downsampled chart data produces no invented effort and missing evidence stays sparse.
- [x] **DOM-14**: Persist optional dated bodyweight entries, edits and deletions for relative-strength views only; entries never alter workout targets.
- [x] **DOM-15**: Extend backup, restore and merge to all multi-plan, Running, imported-activity, match, goal and bodyweight facts and identities without duplicate creation.
- [x] **DOM-16**: Keep workouts fully offline and acknowledge edits/completion only after exclusive transactions commit; notifications and UI feedback follow durable results.
- [x] **DOM-17**: Preserve correction revisions, remove/restore tombstones, metric identities, original snapshots and explicit recommendation acceptance across the new multi-plan model.

### Phase 14: Shared visual system, root shell and settings

- [x] **SHL-01**: Expose exactly Workout, Calendar, Library and Progress in a shared root shell, preserving bottom navigation composition at all target widths.
- [x] **SHL-02**: Switch destinations in place with correct selected state, heading focus, deep-route exit and retained destination-specific state.
- [x] **SHL-03**: Open App Settings from the root header and synchronize Light, Dark and System appearance across the four roots, Active Workout, sheets and dialogs; persist the choice and react to system changes. Garmin-specific appearance closure is owned by GAR-16 after its contextual route exists.
- [x] **SHL-04**: Reproduce approved semantic colors, Archivo variable typography, IBM Plex Mono numerical text, spacing, borders and density using bundled native assets and shared tokens.
- [x] **SHL-05**: Use contextual bottom sheets with scrim, close/back dismissal, focus entry/trap/restoration and keyboard-safe content, preserving each surface's individual actions.
- [x] **SHL-06**: Place theme-aware semantic toasts below top bars, clear of the command/rest dock; preserve accessible status announcements.
- [x] **SHL-07**: Preserve loading, trusted, failure/retry and notification-permission/continue-without-alerts startup states in the new visual shell.
- [x] **SHL-08**: Keep Rest sound, Rest vibration and notification settings reachable under device settings, outside plan timing.
- [x] **SHL-09**: Keep Removed sessions and Data and recovery reachable from Settings even though the prototype's App Settings only demonstrates appearance.
- [x] **SHL-10**: Preserve loading, empty, error/retry, restore confirmation, busy/failure and successful restoration of removed history.
- [x] **SHL-11**: Preserve automatic-backup status/recovery and CSV export, preparing/sharing/cancel/error/retry states with accessible navigation into backup settings.
- [x] **SHL-12**: Preserve Google connection/disconnection confirmation, network preference, stale-writer takeover, partial deletion recovery, new-backup confirmation and privacy route.
- [x] **SHL-13**: Preserve encrypted export plus restore/merge preflight, exact confirmation, cancel, progress, failure/retry and rebuild-pending recovery flows.

### Phase 15: Workout, Active Workout and completion

- [x] **WRK-01**: Present the workout identity, summary, full scrollable exercise preview and Start/Resume action before secondary controls.
- [x] **WRK-02**: Select real plan-day previews with selected state and keyboard alternatives without silently advancing schedule rotation.
- [x] **WRK-03**: Handle scheduled, rest/recovery and no-plan states with truthful action availability; retain starting-plan activation and empty-workout entry.
- [x] **WRK-04**: Preserve explicit scheduled-day, alternate-day and Start empty workout choices with cancel and focus restoration.
- [x] **WRK-05**: Start the selected occurrence and resume the exact saved active session after background or process death; display recovered context and retry failed reads/starts.
- [x] **WRK-06**: Provide View plan and Sync Garmin contextual actions for Running alongside Strength, backed by actual independent active schedules.
- [x] **WRK-07**: Render a full vertically scrollable exercise list with workout identity, working-set progress and compact per-exercise metadata.
- [x] **WRK-08**: Return from the active workout to its plan/root context without discarding the active session.
- [x] **WRK-09**: Expand/collapse each exercise by header tap or Enter/Space, retain full long names up to two lines, and keep trend/menu targets separate.
- [x] **WRK-10**: Use one continuous 4px yellow active-exercise edge; current set uses amber fill, highlighted number, clock and Current label with no second stripe.
- [x] **WRK-11**: Show Set, Previous, Target and State with completed check/green, current clock/amber and planned dash/neutral states.
- [x] **WRK-12**: Open editing by tapping any planned, current or committed row; changes apply only after Save and closing leaves facts unchanged.
- [x] **WRK-13**: Provide thumb-friendly kg/reps steppers and direct numeric input with units, nonnegative validation and explicit Save set values / Save committed set edit.
- [x] **WRK-14**: Use a duration-only editor for timed sets with sec labels and five-second decrement/increment controls.
- [x] **WRK-15**: Retain load_reps, bodyweight_reps, added_load_reps, assisted_reps, timed_hold, fixed_distance, fixed_time, intervals and unscored facts and compatible editors.
- [x] **WRK-16**: Place warm-ups before working sets with independent W1/W2 and 01/02 ordinals; exclude warm-ups from working-set progress.
- [x] **WRK-17**: Offer only Add warm-up set and Add working set from each exercise's + Add set menu; append warm-ups after existing warm-ups and before working sets.
- [x] **WRK-18**: Pair Add exercise with Complete set in one compact dock row; show Saving set… and suppress duplicate taps until the real commit result arrives.
- [x] **WRK-19**: On failed set save, preserve the current row and entered values and expose Set not saved · Retry without false completion feedback.
- [x] **WRK-20**: After the final set commits, collapse its exercise and reveal the next current exercise; warm-up completion advances without between-set rest.
- [x] **WRK-21**: Replace completion controls with a full-width rest dock showing Resting/Rest paused, countdown and next-set context.
- [x] **WRK-22**: Provide −15, +15, Pause/Resume and Skip with accessible labels; expiry or skip restores the ready action without completing a set.
- [x] **WRK-23**: Recover the authoritative rest deadline/pause state and device-owned cues across backgrounding, process death and offline restart.
- [x] **WRK-24**: Open trend via a dedicated icon and show Recent, Best, Change, six-session history and an accessible chart from comparable facts.
- [x] **WRK-25**: Limit exercise overflow to flat between-set timing, Replace exercise and Delete exercise; keep trend separate.
- [x] **WRK-26**: Use explicit sec controls for between-set rest and plan default rest; persist changes immediately without cadence, rest-between-reps, nested Advanced Timing or sound/haptic plan controls.
- [x] **WRK-27**: Show plan identity and 1.25/2.5/5 weight-increment choices with saved selection; preserve the distinction between increment preference and existing set targets.
- [x] **WRK-28**: Keep Edit plan after workout reachable and route to the real editor after the active session boundary, preserving schedule/history rules.
- [x] **WRK-29**: Open the global Add exercise picker, search available exercises, choose an exercise and add it to the active session with loading/error/retry handling.
- [x] **WRK-30**: Replace the chosen exercise through a contextual picker while retaining valid committed facts and requiring the domain's compatibility/impact rules.
- [x] **WRK-31**: Require a second explicit Confirm delete action before removing an exercise and preserve committed source history and safe next-current selection.
- [x] **WRK-32**: Support grip drag and accessible Move up/Move down alternatives while preserving current exercise/set identity; cancelled gestures must not commit a reorder.
- [x] **WRK-33**: Preserve shipped undo/edit-removal recovery through contextual feedback without adding a persistent Undo control to the approved compact dock.
- [x] **WRK-34**: Preserve Finish workout, Finish as partial, Finish workout later, zero-set save and Discard workout with confirmation and error/retry states.
- [x] **WRK-35**: Preserve complete/partial summary, per-exercise results/effort, modified-from-plan status, details/return actions and failed-summary retry.
- [x] **WRK-36**: Keep plan-change write-back explicit with preview/accept/cancel and failed-write retry; finishing never silently changes future targets.

### Phase 16: Calendar and read-only detail

- [ ] **CAL-01**: Fill the area above bottom navigation with a Monday-first month grid and persistent Previous, month title, Today and Next controls.
- [ ] **CAL-02**: Place the info action immediately left of App Settings and show Activity and Status groups in a Calendar key sheet, with no inline legend.
- [ ] **CAL-03**: Use orange Strength and blue Running, solid/tinted Complete, dotted half-filled Partial and transparent dashed Planned, with neutral status samples.
- [ ] **CAL-04**: Use shared month/focused date/event cells with 28px date and 36px event tracks, stable effective 4px top inset and measured row-height continuity.
- [ ] **CAL-05**: Show up to two compact titled events per date in selected and adjacent weeks, preserving full names/statuses in day accessibility labels.
- [ ] **CAL-06**: Distinguish selected date, today, outside-month dates, rest day and empty dates without changing event status semantics.
- [ ] **CAL-07**: Keep clipped previous/current/next month panels following horizontal pointer movement one-to-one, clamped to one panel, while vertical intent scrolls normally.
- [ ] **CAL-08**: Change the visible title at 25% width, revert immediately below the threshold or on cancel, and settle only at or beyond 25%; shorter drags snap back even when fast.
- [ ] **CAL-09**: Preserve the 240ms month-settle motion and cubic-bezier(.22,.8,.3,1), with completion handling that avoids stale selection or duplicate navigation.
- [ ] **CAL-10**: Keep previous/next/Today controls usable in both month and focused views, preserving/clamping selected day and returning to today's actual local date.
- [ ] **CAL-11**: Provide visible-focus arrow navigation and activation for date cells plus non-gesture month controls.
- [ ] **CAL-12**: Animate the selected month row to the top and its following row to the bottom, retain a single Monday-first weekday header, and reveal compact agenda rows.
- [ ] **CAL-13**: Reverse both focused rows to their measured month positions before showing month mode and restoring selected-day focus.
- [ ] **CAL-14**: On adjacent-week date selection, collapse to month, select/focus the new date, then expand its week with events preserved.
- [ ] **CAL-15**: Keep identical selected dates, navigation sequence and agenda content when reduced motion removes row movement and month transitions.
- [ ] **CAL-16**: Use one full-width tap target per event with title, one-line result/target, sport/status, source and chevron; remove nested Resume/View/Match actions.
- [ ] **CAL-17**: Route Strength to read-only workout detail, planned Running to Running plan, and imported Running to Garmin activity detail using real entity identities.
- [ ] **CAL-18**: Render Active-shaped full-height completed/partial workout detail with exercise disclosure, all set rows and result/state semantics, but no edit/complete/reorder/settings mutation.
- [ ] **CAL-19**: Render planned Strength as a read-only plan-occurrence preview without inventing a session ID, completed set or result.
- [ ] **CAL-20**: Preserve agenda date, expanded week and triggering-row focus on detail Back, and expose expand/collapse controls for each historical exercise.
- [ ] **CAL-21**: Add source-backed loading, empty, stale-projection/error and retry states that retain the selected date and never display invented sessions.
- [ ] **CAL-22**: Keep deliberate Correct workout, revision history, draft validation, stale-revision conflict and save/retry in the existing correction route, outside Calendar's read-only detail context.
- [ ] **CAL-23**: Keep intentional Resume workout and Remove from history/confirmation reachable from a separate management context while Calendar history stays read-only.

### Phase 17: Library, plan creation and structured Running

- [x] **LIB-01**: Remember Plans/Exercises selection with independent search, filters, favorites and detail-return state.
- [x] **LIB-02**: Present Active Plans, My Plans and Starter Plans with owned/inactive/starter/Running identity, next scheduled item and grouped counts.
- [x] **LIB-03**: Search each view, clear query separately, apply filter counts and preserve query when clearing filters; distinguish No matches from true no-plan state.
- [x] **LIB-04**: Show Favorites, Recent and All Exercises with per-exercise favorite toggles and searchable metric/equipment context.
- [x] **LIB-05**: Provide Create plan and Create exercise from the Library actions sheet; keep Import plan explicitly unavailable/Later rather than implying a working importer.
- [x] **LIB-06**: Route every Create plan entry, including true empty Plans, to one neutral Strength/Running chooser explaining that creation does not activate.
- [x] **LIB-07**: Show No plans yet and Create a strength or running plan to get started with the same chooser action.
- [ ] **LIB-08**: Add a plan summary route with active/inactive status, schedule, history, source and training days before editing actions.
- [x] **LIB-09**: Provide Edit plan, Edit schedule, Duplicate, Archive plan/confirmation and Reactivate plan with preserved history and explicit activation.
- [x] **LIB-10**: Retain immutable starter preview, source/equipment/schedule/training days, Preview activation and Save editable copy.
- [x] **LIB-11**: Preview the actual affected schedules and create/activate a reviewed owned copy only on confirmation; Save without activating stays inactive.
- [x] **LIB-12**: Keep template-update comparison and Create new copy reachable through the existing activation update query route, preserving previous owned history.
- [x] **LIB-13**: Collect Plan name and First day, continue to the real editor, and save the draft without activation.
- [x] **LIB-14**: Preserve day/exercise/set/metric target editing, add/move/remove actions and explicit save while applying the approved compact editor presentation.
- [x] **LIB-15**: Preserve unsaved-change confirmation, save failure/retry, revision conflict, archive/duplicate confirmations and immutable completed history.
- [x] **LIB-16**: Edit future weekday bindings with selected-day state and Save schedule, preserving real effective-date, rotation and multi-plan ownership rules.
- [x] **LIB-17**: Retain occurrence/all-occurrences scope, compatible metric selection, target review and refreshed impact preview before saving replacement.
- [x] **LIB-18**: Retain removal impact, replacement binding/remove binding, effective date and current-workout guard before deleting a plan day.
- [x] **LIB-19**: Show exercise instructions, tracking, equipment, last result and plan usage with favorite and Hide from pickers actions while preserving bundled facts.
- [x] **LIB-20**: Show custom identity and manual progression; edit name/tracking/equipment through the real editor and archive explicitly.
- [x] **LIB-21**: Create a local custom exercise with valid Name, Tracking and Equipment fields, then open its detail; preserve all supported metric-profile choices.
- [x] **LIB-22**: Preserve existing edit?mode=copy and edit?mode=metric routes, future-target impact, policy choice, confirmation and active-workout guard.
- [x] **LIB-23**: Preserve loading, query failure/retry, refresh failure, deleted/missing detail and content-update review/dismiss states in all Library flows.
- [x] **LIB-24**: Show saved goal/pacing/schedule and derived weekly sessions with Sync Garmin / match activity, Edit running plan and collision entry points.
- [x] **LIB-25**: Open Running creation from the chooser with goal, benchmark and structured sessions; save inactive and make Garmin connection optional afterward.
- [x] **LIB-26**: Edit goal distance/time and weekly sessions, validate invalid goal input, and persist edits that the detail and Progress can read.
- [x] **LIB-27**: Add/edit a session with Workout type, Day, Warm-up, Cool-down, Session preview and Save session; preserve common fields when changing type.
- [x] **LIB-28**: Expose Volume (time or distance) and Easy target (pace, HR zone, or RPE) for Recovery sessions.
- [x] **LIB-29**: Expose volume, Effort target and Easy throughout/Steady finish/Progression finish options for Long run.
- [x] **LIB-30**: Expose Total volume, Stages, Start target and Finish target for Progression sessions.
- [x] **LIB-31**: Expose Continuous/Tempo repeats format, Repeats, Work duration/distance, Recovery and Intensity target for Tempo.
- [x] **LIB-32**: Expose Repeats, Work duration/distance, Recovery and pace/HR-zone/RPE target for Intervals.
- [x] **LIB-33**: Expose Repeats, Uphill duration/distance, Return recovery and Effort target for Hills.
- [x] **LIB-34**: Expose Structured/Unstructured style, Surges/repeats, Fast segment or cue, Easy float/recovery and Effort target.
- [x] **LIB-35**: Persist session addition, edit, deletion and order; preserve a truly empty saved session list and provide error/retry without restoring fixture defaults.
- [ ] **LIB-36**: Offer Move run, Move strength and Keep both with actual future-date choices, explicit confirmation and persisted outcomes.

### Phase 18: Standalone Garmin account sync and activity detail

- [ ] **GAR-01**: Open Garmin contextually from Workout and Running plan and publish a real Calendar-origin activity-detail route contract; CAL-17/20 own final Calendar entry/return integration after this destination exists. Preserve exactly four app roots.
- [ ] **GAR-02**: Keep Garmin Sync on one line in a stable three-column header with appearance flush right and an inert back placeholder at Garmin's root.
- [ ] **GAR-03**: Show Garmin not connected with Connect Garmin and retained imported-history access; show honest offline, unavailable and sign-in-needed states without fake partner-approval or FIT-fallback actions.
- [ ] **GAR-04**: Sign in to the owner's account through the bundled native/Python client with foreground credentials/MFA, cancel/error/expired-session recovery and verified authenticated reads; persist refreshed tokens in Keystore-backed private encryption and never log or back them up.
- [ ] **GAR-05**: Show verified account connection, last successful sync, imported activities and durable dedupe status with Sync now and Disconnect Garmin; packaging runs standalone without AI agents, Python installed separately, or a development server.
- [ ] **GAR-06**: Execute bounded foreground sync with clear busy, new/unchanged/partial-failure, offline, 403/429 and sign-in-needed results; preserve prior facts, bound retries, and do not claim success from a fixture or failed data read.
- [ ] **GAR-07**: Disconnect locally by invalidating in-flight generations and clearing credentials/session state without deleting imported history; prevent late network results from writing, allow later reconnection, and never claim server-side revocation without a supported verified operation.
- [ ] **GAR-08**: Read paginated Running summaries plus per-activity summary/splits/detail JSON through a typed allowlisted native bridge, validate and normalize it with explicit sampling/timezone provenance, and capacity-check before one atomic idempotent SQLite import.
- [ ] **GAR-09**: Handle malformed/oversized/truncated JSON, missing channels, unsupported sport, duplicates, changed source revisions, ambiguous timezone and cancelled/interrupted sync with complete recovery paths and no partial facts or lost history.
- [ ] **GAR-10**: Show imported outdoor elapsed/moving time, distance/pace facts, optional route and spaced Average heart rate label/value when present.
- [ ] **GAR-11**: Show No route for treadmill activity plus distance/time/pace/laps and available source facts; never invent a route.
- [ ] **GAR-12**: Display Lap, Time and Pace columns from imported lap semantics with accessible row/column labels and honest missing values.
- [ ] **GAR-13**: Open Match to scheduled workout, show candidate identities and select one candidate without completing anything yet.
- [ ] **GAR-14**: Persist exactly the selected candidate only on Confirm match; Leave unmatched/Back performs no match, and failed/stale confirmation preserves the activity.
- [ ] **GAR-15**: Provide loading, missing activity, parse/projection error and retry states with correct Back behavior and no fabricated detail.
- [ ] **GAR-16**: Use the same persisted Light/Dark/System appearance controls as App Settings, with synchronized selection and dismiss/focus restoration.

### Phase 19: Progress and personal goals

- [ ] **PRO-01**: Provide All, Strength and Running tabs plus 4 weeks, 12 weeks and All time ranges with selected/accessibility state and keyboard alternatives.
- [ ] **PRO-02**: Show nearest active goal with Latest, Best, Target and personal-history goal line, active goals and planned-next context from real comparable facts.
- [ ] **PRO-03**: Show primary strength goal, gap/status, Needs review and exercise-progress rows using comparable completed history.
- [ ] **PRO-04**: Show latest/best/target/gap, goal-line trend, running goals, best efforts and derived pacing from imported activities.
- [ ] **PRO-05**: Keep the default 2.4 km goal at 11:00 with 4:35/km, 1:50/400 m and 0:55/200 m; derive changes only from explicit owner-selected targets.
- [ ] **PRO-06**: Keep 10 km and Half Marathon target times unset until chosen; show Set target/Target unset and No effort recorded without plotting zero.
- [ ] **PRO-07**: Provide ready, sparse, empty and loading presentations: one effort says More data needed, missing imports show no zero chart, loading communicates busy.
- [ ] **PRO-08**: Provide source-loading failure/retry and stale/rebuilding projection states without losing current sport/range or reporting unreliable results.
- [ ] **PRO-09**: Open primary chart/exercise/best-effort details with an accessible history chart, separate goal line and clear empty state.
- [ ] **PRO-10**: Preserve the existing exercise-history route, comparable metric facts, source sessions, empty/error/loading states and return navigation.
- [ ] **PRO-11**: Offer Load/Relative only when a valid optional bodyweight exists for a load metric; disclose its measurement basis and never change targets.
- [ ] **PRO-12**: Edit Distance, Target time, Optional target date and Available training days while showing a read-only Current benchmark and explicit Save target/Cancel.
- [ ] **PRO-13**: Persist validated target edits to source facts; reject invalid time/date without losing draft and keep plan/detail/Progress goal displays consistent.
- [ ] **PRO-14**: Show Review target with Current/Proposed values, personal-history evidence and Keep current/Use target choices.
- [ ] **PRO-15**: Persist acceptance/keep decisions once with revision checks; keep failure/retry visible and prevent a dismissed recommendation reappearing from a fixture rerender.
- [ ] **PRO-16**: Keep Body metrics/Settings and Bodyweight history reachable; explain personal history and optional measurements without collecting gender/height or creating a score.
- [ ] **PRO-17**: Show optional empty/bodyweight history with Add first entry/Add entry, dated values, Edit and two-step Delete/Confirm.
- [ ] **PRO-18**: Provide dated kg input with Add/Edit, Save entry/Cancel, error feedback and persistence; enforce reviewed valid measurement/date bounds.

### Phase 20: Native acceptance, accessibility and performance

- [ ] **VER-01**: Verify every inventory route/interaction/state against its mapped requirement and native implementation with recorded evidence and no unmapped route.
- [ ] **VER-02**: Compare native screenshots against approved Light and Dark and verify System transitions on all root, detail and sheet surfaces.
- [ ] **VER-03**: Verify 360×800, 390×844, 600×960 and 840×1080-equivalent viewports plus landscape without loss of required actions or changing the four-root composition.
- [ ] **VER-04**: Verify required actions at 200% text, minimum 48dp touch targets, semantic labels and meaningful non-color state encoding.
- [ ] **VER-05**: Verify keyboard/D-pad movement, visible focus, Back/Escape, focus restoration and keyboard-safe editing across all sheets and deep routes.
- [ ] **VER-06**: Verify Calendar and other transitions keep identical destination/state semantics with motion disabled.
- [ ] **VER-07**: Run real SQLite migration, backup/restore/merge, idempotency and historical-revision tests with old and new multi-plan databases.
- [ ] **VER-08**: Verify offline strength workouts and process-death recovery at start/edit/commit/rest/finish/import/match boundaries, distinguishing committed and uncommitted work.
- [ ] **VER-09**: Verify native 1:1 drag, 25% title/settle boundary, short-fast snap-back, vertical intent, expand/collapse/adjacent-week continuity and cancel.
- [ ] **VER-10**: Verify a self-contained ARM64 APK's Python/native packaging, real account login/MFA/read, encrypted token refresh/cold restart/logout, JSON fidelity, idempotent sync and explicit matching; synthetic tests alone cannot close live account/network evidence, and partner approval/FIT decoding is not a prerequisite.
- [ ] **VER-11**: Preserve or improve existing p95 interaction and launch budgets with the full calendar, large histories, long active sessions and representative import loads.
- [ ] **VER-12**: Record owner-attended Samsung visual/usability/accessibility acceptance in addition to automated evidence.
- [ ] **VER-13**: Prepare signed personal-use Android release verification, recovery/rollback evidence and a complete parity/deviation review before any later release authorization.

## Out of Scope

| Capability | Reason |
|---|---|
| Partner Activity API/broker, desktop-to-Drive bridge, FIT decoder and manual FIT import | Owner selected on-phone account JSON sync; these are deferred alternatives rather than milestone gates. |
| Runtime LLMs/agents, downloaded Python scripts, local sync web server or development terminal | Standalone APK uses bundled ordinary code through a typed native bridge. |
| In-app outdoor or treadmill recording, live GPS, run pause/finish | Owner and revision 9 make Garmin the recorder. |
| Extra Profile, Running or Garmin root destination | Exactly four approved roots. |
| Cadence, rest-between-reps, nested Advanced Timing UI, plan-owned sound/haptics | Removed by latest owner/approval contract; preserve source facts. |
| Import plan functionality behind the prototype Later label | Explicit placeholder; no approved executable plan-import behavior. |
| Readiness/composite score, predictive guarantee, gender or height | No source-supported product requirement. |
| Implicit target changes, auto-matching/completion, auto-activation on creation/import | All require explicit durable owner decisions. |
| Pixel-exact simulated status bar, three-phone review wrapper, Reset demo and Preview error buttons | Prototype review harness; use test fixtures to exercise states. |
| Product code, builds, signing, release or deployment in this planning session | Owner review gate remains in force. |

## Traceability

Roadmap validation completed 2026-10-06. The Phase column uses the sequential
phase IDs from `.planning/ROADMAP.md`; every v1.2 requirement appears exactly
once and remains Pending until its owning phase is implemented and verified.

| Requirement | Phase | Inventory ID | Status |
|---|---:|---|---|
| DOM-01 | 13 | domain.multi-active | Complete |
| DOM-02 | 13 | domain.activation-separate | Complete |
| DOM-03 | 13 | domain.migrate-existing | Complete |
| DOM-04 | 13 | domain.schedule-independent | Complete |
| DOM-05 | 13 | domain.schedule-collision | Complete |
| DOM-06 | 13 | domain.workout-selection | Complete |
| DOM-07 | 13 | domain.running-structure | Complete |
| DOM-08 | 13 | domain.running-targets | Complete |
| DOM-09 | 13 | domain.advisory-intensity | Complete |
| DOM-10 | 13 | domain.import-source-facts | Complete |
| DOM-11 | 13 | domain.import-idempotency | Complete |
| DOM-12 | 13 | domain.matching-confirmed | Complete |
| DOM-13 | 13 | domain.rebuildable-projections | Complete |
| DOM-14 | 13 | domain.bodyweight-facts | Complete |
| DOM-15 | 13 | domain.backup-merge | Complete |
| DOM-16 | 13 | domain.offline-transaction | Complete |
| DOM-17 | 13 | domain.history-integrity | Complete |
| SHL-01 | 14 | shell.four-roots | Complete |
| SHL-02 | 14 | shell.root-state | Complete |
| SHL-03 | 14 | shell.appearance | Complete |
| SHL-04 | 14 | shell.tokens | Complete |
| SHL-05 | 14 | shell.sheets | Complete |
| SHL-06 | 14 | shell.toasts | Complete |
| SHL-07 | 14 | shell.launch | Complete |
| SHL-08 | 14 | shell.rest-alerts | Complete |
| SHL-09 | 14 | shell.settings-deep-links | Complete |
| SHL-10 | 14 | shell.removed-sessions | Complete |
| SHL-11 | 14 | shell.data-recovery | Complete |
| SHL-12 | 14 | shell.automatic-backup | Complete |
| SHL-13 | 14 | shell.manual-backup | Complete |
| WRK-01 | 15 | workout.root-identity | Complete |
| WRK-02 | 15 | workout.day-switch | Complete |
| WRK-03 | 15 | workout.scheduled-rest-empty | Complete |
| WRK-04 | 15 | workout.start-alternate | Complete |
| WRK-05 | 15 | workout.start-resume | Complete |
| WRK-06 | 15 | workout.context-running | Complete |
| WRK-07 | 15 | workout.active-layout | Complete |
| WRK-08 | 15 | workout.active-back | Complete |
| WRK-09 | 15 | workout.exercise-disclosure | Complete |
| WRK-10 | 15 | workout.active-indicator | Complete |
| WRK-11 | 15 | workout.set-states | Complete |
| WRK-12 | 15 | workout.row-edit | Complete |
| WRK-13 | 15 | workout.load-reps-editor | Complete |
| WRK-14 | 15 | workout.duration-editor | Complete |
| WRK-15 | 15 | workout.all-metrics | Complete |
| WRK-16 | 15 | workout.warmup-order | Complete |
| WRK-17 | 15 | workout.add-set | Complete |
| WRK-18 | 15 | workout.complete-commit | Complete |
| WRK-19 | 15 | workout.complete-failure | Complete |
| WRK-20 | 15 | workout.completion-collapse | Complete |
| WRK-21 | 15 | workout.rest-dock | Complete |
| WRK-22 | 15 | workout.rest-controls | Complete |
| WRK-23 | 15 | workout.rest-recovery | Complete |
| WRK-24 | 15 | workout.trend | Complete |
| WRK-25 | 15 | workout.exercise-menu | Complete |
| WRK-26 | 15 | workout.timing-flat | Complete |
| WRK-27 | 15 | workout.plan-increment | Complete |
| WRK-28 | 15 | workout.plan-after-workout | Complete |
| WRK-29 | 15 | workout.add-exercise | Complete |
| WRK-30 | 15 | workout.replace-exercise | Complete |
| WRK-31 | 15 | workout.delete-exercise | Complete |
| WRK-32 | 15 | workout.reorder | Complete |
| WRK-33 | 15 | workout.undo | Complete |
| WRK-34 | 15 | workout.outcomes | Complete |
| WRK-35 | 15 | workout.completion-review | Complete |
| WRK-36 | 15 | workout.completion-writeback | Complete |
| CAL-01 | 16 | calendar.month | Pending |
| CAL-02 | 16 | calendar.calendar-key | Pending |
| CAL-03 | 16 | calendar.event-encoding | Pending |
| CAL-04 | 16 | calendar.date-grid | Pending |
| CAL-05 | 16 | calendar.events-titles | Pending |
| CAL-06 | 16 | calendar.today-selection | Pending |
| CAL-07 | 16 | calendar.drag-follow | Pending |
| CAL-08 | 16 | calendar.threshold | Pending |
| CAL-09 | 16 | calendar.month-motion | Pending |
| CAL-10 | 16 | calendar.month-navigation | Pending |
| CAL-11 | 16 | calendar.keyboard | Pending |
| CAL-12 | 16 | calendar.expand-week | Pending |
| CAL-13 | 16 | calendar.collapse-week | Pending |
| CAL-14 | 16 | calendar.adjacent-week | Pending |
| CAL-15 | 16 | calendar.reduced-motion | Pending |
| CAL-16 | 16 | calendar.agenda | Pending |
| CAL-17 | 16 | calendar.agenda-routing | Pending |
| CAL-18 | 16 | calendar.readonly-history | Pending |
| CAL-19 | 16 | calendar.planned-preview | Pending |
| CAL-20 | 16 | calendar.detail-return | Pending |
| CAL-21 | 16 | calendar.calendar-load-error | Pending |
| CAL-22 | 16 | calendar.history-deep-correction | Pending |
| CAL-23 | 16 | calendar.history-management | Pending |
| LIB-01 | 17 | library.views | Complete |
| LIB-02 | 17 | library.plans-groups | Complete |
| LIB-03 | 17 | library.search-filters | Complete |
| LIB-04 | 17 | library.exercise-lists | Complete |
| LIB-05 | 17 | library.actions-menu | Complete |
| LIB-06 | 17 | library.plan-type-chooser | Complete |
| LIB-07 | 17 | library.empty-plans | Complete |
| LIB-08 | 17 | library.owned-detail | Pending |
| LIB-09 | 17 | library.owned-actions | Complete |
| LIB-10 | 17 | library.starter-detail | Complete |
| LIB-11 | 17 | library.starter-activation | Complete |
| LIB-12 | 17 | library.template-update | Complete |
| LIB-13 | 17 | library.create-strength | Complete |
| LIB-14 | 17 | library.plan-editor | Complete |
| LIB-15 | 17 | library.editor-draft-guards | Complete |
| LIB-16 | 17 | library.schedule-editor | Complete |
| LIB-17 | 17 | library.replacement-impact | Complete |
| LIB-18 | 17 | library.day-removal-impact | Complete |
| LIB-19 | 17 | library.builtin-exercise | Complete |
| LIB-20 | 17 | library.custom-exercise | Complete |
| LIB-21 | 17 | library.create-exercise | Complete |
| LIB-22 | 17 | library.copy-metric-migration | Complete |
| LIB-23 | 17 | library.library-load-errors | Complete |
| LIB-24 | 17 | library.running-detail | Complete |
| LIB-25 | 17 | library.running-create | Complete |
| LIB-26 | 17 | library.running-goal-edit | Complete |
| LIB-27 | 17 | library.running-session-common | Complete |
| LIB-28 | 17 | library.running-recovery | Complete |
| LIB-29 | 17 | library.running-long | Complete |
| LIB-30 | 17 | library.running-progression | Complete |
| LIB-31 | 17 | library.running-tempo | Complete |
| LIB-32 | 17 | library.running-intervals | Complete |
| LIB-33 | 17 | library.running-hills | Complete |
| LIB-34 | 17 | library.running-fartlek | Complete |
| LIB-35 | 17 | library.running-session-lifecycle | Complete |
| LIB-36 | 17 | library.running-conflict | Pending |
| GAR-01 | 18 | garmin.entry | Pending |
| GAR-02 | 18 | garmin.header | Pending |
| GAR-03 | 18 | garmin.not-connected | Pending |
| GAR-04 | 18 | garmin.consent | Pending |
| GAR-05 | 18 | garmin.connected | Pending |
| GAR-06 | 18 | garmin.sync-states | Pending |
| GAR-07 | 18 | garmin.revoke | Pending |
| GAR-08 | 18 | garmin.json-sync | Pending |
| GAR-09 | 18 | garmin.sync-recovery | Pending |
| GAR-10 | 18 | garmin.activity-outdoor | Pending |
| GAR-11 | 18 | garmin.activity-treadmill | Pending |
| GAR-12 | 18 | garmin.laps | Pending |
| GAR-13 | 18 | garmin.match-candidates | Pending |
| GAR-14 | 18 | garmin.match-confirm | Pending |
| GAR-15 | 18 | garmin.detail-recovery | Pending |
| GAR-16 | 18 | garmin.appearance | Pending |
| PRO-01 | 19 | progress.sport-range | Pending |
| PRO-02 | 19 | progress.all | Pending |
| PRO-03 | 19 | progress.strength | Pending |
| PRO-04 | 19 | progress.running | Pending |
| PRO-05 | 19 | progress.fixed-goal | Pending |
| PRO-06 | 19 | progress.unset-goals | Pending |
| PRO-07 | 19 | progress.running-source-states | Pending |
| PRO-08 | 19 | progress.progress-errors | Pending |
| PRO-09 | 19 | progress.history-sheet | Pending |
| PRO-10 | 19 | progress.exercise-history-route | Pending |
| PRO-11 | 19 | progress.relative-view | Pending |
| PRO-12 | 19 | progress.target-editor | Pending |
| PRO-13 | 19 | progress.target-persistence | Pending |
| PRO-14 | 19 | progress.recommendation | Pending |
| PRO-15 | 19 | progress.recommendation-persistence | Pending |
| PRO-16 | 19 | progress.progress-settings | Pending |
| PRO-17 | 19 | progress.bodyweight-history | Pending |
| PRO-18 | 19 | progress.bodyweight-editor | Pending |
| VER-01 | 20 | verification.parity | Pending |
| VER-02 | 20 | verification.themes | Pending |
| VER-03 | 20 | verification.viewports | Pending |
| VER-04 | 20 | verification.text-accessibility | Pending |
| VER-05 | 20 | verification.keyboard-focus | Pending |
| VER-06 | 20 | verification.reduced-motion | Pending |
| VER-07 | 20 | verification.sqlite-migration | Pending |
| VER-08 | 20 | verification.offline-recovery | Pending |
| VER-09 | 20 | verification.calendar-gestures | Pending |
| VER-10 | 20 | verification.garmin-import | Pending |
| VER-11 | 20 | verification.performance | Pending |
| VER-12 | 20 | verification.physical-review | Pending |
| VER-13 | 20 | verification.release-readiness | Pending |

## Coverage

| Phase | Requirements |
|---|---:|
| 13 | 17 |
| 14 | 13 |
| 15 | 36 |
| 16 | 23 |
| 17 | 36 |
| 18 | 16 |
| 19 | 18 |
| 20 | 13 |
| **Total** | **172** |

- Unmapped requirements: 0.
- Requirements with more than one owning phase: 0.
- Existing deep routes and required native failure/recovery states are explicit requirements even when absent from the prototype.
- Native fidelity, accessible alternatives, transaction correctness and migration evidence remain pending implementation.

*Researched, roadmapped and traceability-validated 2026-10-06. No implementation, build, native execution, release or deployment was performed.*
