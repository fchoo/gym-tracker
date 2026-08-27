# Feature Research

**Domain:** Offline-first personal gym workout planner and logger  
**Researched:** 2026-08-16  
**Confidence:** HIGH for approved product scope; MEDIUM for ecosystem comparisons

## Research Boundary

The product and design scope is already approved. This research validates how the approved behaviors should be classified for requirements and roadmap creation; it does not propose additional product scope.

A feature category can be table stakes while its execution is differentiating. For example, a rest timer is expected, but authoritative recovery after process death, late notifications, permission denial, and Undo is a differentiator.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these behaviors would make a personal gym tracker feel incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Required Behavior |
|---------|--------------|------------|-------------------|
| Reusable workout plans and day templates | Strong, Hevy, FitNotes, and JEFIT all support reusable routines or templates | HIGH | Create, rename, duplicate, reorder, edit, archive, and independently run plan days; provide original starter plans; preserve bundled versus user-owned ownership |
| Flexible scheduling | A plan must guide the next workout without blocking real-life changes | HIGH | Support weekday and rotation schedules, date overrides, missed-day visibility, choose-another-day, repeat, skip, train-anyway, and empty-workout paths without silent schedule rewrites |
| Fast active-workout logging | The gym-floor interaction must be faster than a notebook or spreadsheet | HIGH | Start a planned or empty workout; prefill from recommended, previous, plan-default, or manual values; expose one active working set and one primary completion action |
| Exercise-appropriate set values | A general tracker cannot assume every exercise is `weight × reps` | HIGH | Log weighted, bodyweight, assisted, timed, distance/time, interval/round, and unscored observations using fixed units and validated metric profiles |
| Separate warm-up and working sets | Warm-ups are common, but should not distort progress evidence | MEDIUM | Label and store warm-ups, allow plan/previous/manual sources, collapse completed warm-ups, and exclude them from working-set completion, records, headline statistics, and progression evidence |
| In-workout editing and partial completion | Users mistype values, change exercises, and end sessions early | HIGH | Edit values, skip or replace exercises through secondary actions, confirm destructive actions, retain actual completed counts, and explicitly finish a workout as partial |
| Rest timer controls | Automatic rest timing is standard in established gym trackers | HIGH | Start rest after eligible working sets; show the next target; allow pause/resume, `−15s`, `+15s`, and skip; alert when rest ends; do not start rest after the final set unless configured |
| Basic interruption continuity | A timer and active workout must survive ordinary backgrounding | HIGH | Persist the active exercise, set, values, completion, and rest state; show an explicit resume or elapsed-rest message; keep in-app timing usable when notifications are denied |
| Calendar and session history | Users expect to find when they trained and what they performed | HIGH | Show completed, partial, manual-visit, and planned-not-completed states; open date details; preserve local training date across timezone changes; retain `N/N (100%)`-style completion |
| Exercise history and records | Previous values, trends, and personal records are standard tracker capabilities | HIGH | Show comparable visits and metric-aware `Best`, `Average`, and `Last`; support relevant trends and estimated 1RM only where applicable; use `First recorded session` or `No history yet` instead of zero-valued analytics |
| Progression context | A tracker should help users decide what to repeat or increase | HIGH | Show the current target, previous comparable performance, records, and progress trends; produce useful baseline or hold behavior when history is sparse |
| Searchable exercise library | Catalog search, taxonomy, and custom exercises are standard | HIGH | Provide live partial search, aliases, filters for type/muscle/equipment/origin, recent/favorite ordering, clear-filters, reviewed built-ins, and custom exercises |
| Historical correction and removal | Users need to fix inaccurate logs and remove accidental sessions | HIGH | Correct completed or partial sessions, recalculate dependent displays, confirm removal, and provide a recoverable path rather than silently corrupting history |
| User-controlled backup, restore, and export | Local-only data must remain portable and recoverable without an account | HIGH | Create a manual backup, restore into a clean install, preview what will be replaced, fail without changing local data, and export workouts in a spreadsheet-friendly format |
| Android accessibility fundamentals | Platform-quality software must remain usable with large text and external input | HIGH | Support 200% text without loss of required content, meaningful labels and headings, at least 48dp interactive targets, logical focus, visible contrast, and status communication that does not depend on color alone |
| Complete offline critical path | Gym connectivity is unreliable and the app is explicitly local-first | HIGH | Start, log, time rest, resume, finish, correct, and review workouts in airplane mode with no account or network requirement |

### Differentiators (Approved Competitive Advantage)

These are not new scope. They are the approved behaviors that make the implementation meaningfully better than a generic tracker.

| Feature | Value Proposition | Complexity | Differentiating Behavior |
|---------|-------------------|------------|--------------------------|
| One consistent, explainable `Next target` | Removes calculation and ambiguity without pretending to be a coach | HIGH | Show evidence, rule, current target, and proposed target; keep recommendations pending until explicitly accepted or rejected; never silently mutate a plan |
| Transaction-before-acknowledgement set completion | Makes every visible completion trustworthy | HIGH | Validate and commit the set before advancing, haptic feedback, Undo, timer start, or notification work; on failure preserve values and show `Set not saved · Retry` |
| Authoritative recoverable rest timing | The user can trust the timer after interruption instead of restarting or guessing | HIGH | Derive time from persisted timestamps; reconcile disposable Android notifications from SQLite on commit, launch, foreground, permission change, Undo, finish, and correction; ignore stale delivery |
| One metric contract from plan through export | Mixed fitness remains meaningful instead of forcing every result into kilograms | HIGH | Use the same versioned metric semantics for targets, actuals, history, recommendations, backup, and CSV; compare only compatible exposures |
| Warm-up-safe and metric-aware analytics | Prevents inflated records and meaningless aggregate volume | HIGH | Keep warm-ups visible but analytically separate; use exercise-specific comparators; omit global kilogram-volume and composite fitness/readiness scores |
| Auditable correction and reversible removal | Fixes mistakes without erasing what happened or leaving stale analytics | HIGH | Record before/after correction history, void rather than delete sessions, expose Removed sessions with Restore, and deterministically rebuild records, summaries, comparisons, and pending recommendations |
| Reviewed, versioned content with user ownership | Catalog updates and plan progression cannot rewrite personal history | HIGH | Ship a curated attributed subset, keep starter templates immutable, clone activation into user-owned plans, preserve source revisions, and snapshot session names/targets/rules |
| Safe local data ownership | A personal offline app should not make recovery a privacy or corruption risk | HIGH | Encrypt backups by default, authenticate archive contents, preview before replacement, validate before mutation, replace user-owned rows transactionally, and leave the existing database unchanged on any failure |
| External-input interaction parity | External-input users get the same trustworthy workout path, not a reduced secondary flow | HIGH | Touch, keyboard, and D-pad invoke the same transaction, Undo, haptic setting, and rest transition; charts have text and data-table equivalents |
| Calm evidence-first feedback | Keeps the product useful for years without guilt mechanics | MEDIUM | Use factual `Repeat`, `Hold`, and `Ready to increase` language; distinguish decisions from urgency; avoid streak-loss, moral judgment, and opaque scores |

## Approved Behavioral Contract by Domain

### Workout Planning and Logging

- Today shows the selected or scheduled day, one next target per exercise, the latest comparable result, estimated duration, and exercise count.
- `Start [day name]` remains visible before historical context scrolls.
- Users can choose another plan day or start an empty workout.
- Starting a workout snapshots plan-day names, order, targets, units, and rule versions so later edits affect only future sessions.
- Each exercise can source starting values from Recommended, Last workout, Plan default, or Manual.
- One working-set row is active and the sticky action is the only primary completion control.
- A successful completion validates, commits, advances, starts eligible rest, provides configured feedback, and offers eight-second Undo.
- A failed save preserves entered values, does not advance or start rest, and remains retryable across restart.
- Only one active workout is allowed; attempting another offers Resume, Finish as partial, or Discard.

### Timer and Recovery

- Rest is automatically started after a completed working set when another active working set remains.
- Pause stores remaining time; resume computes new timestamps; adjustment and skip are immediately reflected in authoritative state.
- The app explicitly reports resumed or already-ended rest rather than displaying a reset timer.
- Notification denial affects background alerts, not workout or timer truth.
- A late or stale notification never overrides the persisted active-session revision.
- Process death after the set commit but before notification scheduling is repaired by replayable post-commit work.
- After reboot, v1 guarantees correct state on app launch; firing an alert during the reboot interval is not guaranteed.

### History and Progress

- Workout sessions are the source of truth for visits, records, period summaries, and progression evidence.
- Completed and partial workouts preserve actual exercise and set counts; unplanned sessions and manual visits remain identifiable.
- Historical local date remains stable after timezone changes.
- Exercise history uses profile-specific comparators and excludes warm-ups, skipped sets, invalid sets, and voided sessions from working-set evidence.
- Progress defaults to 4 weeks and also supports 12 weeks and All time.
- Every displayed progress summary drills into the sessions or exercises that produced it.
- Overall Progress uses scheduled-opportunity consistency, exercise status, and exercise-appropriate records—not aggregate kilogram volume or a global score.

### Progression

- Recommendations are deterministic, versioned, serializable, and available offline.
- Every recommendation stores its evidence and rule version and remains pending until accepted, rejected, invalidated, or superseded.
- Weighted double progression holds load until all working sets reach the upper range; missing or hard effort prevents an automatic increase.
- Repetition and load increases are both valid strategies; equipment increments constrain proposed load changes.
- Sparse history yields a baseline repeat; partial success yields hold/add-reps; full success can propose progression; repeated regression yields hold, optional plan-authored deload, or manual review.
- Cardio and interval progression is plan-authored; mobility/unscored work has no automatic progression.
- Recommendations never infer injury, offer medical advice, or silently change a future target.

### Exercise Library and Plans

- Built-ins include type, movement classification, muscles, equipment, metric profile, default unit/rest/increment, source pack, revision, license, and attribution.
- Search is case-insensitive partial matching over names and aliases; taxonomy filters remain independently clearable.
- Custom exercises require name, exercise type, and metric profile; absent progression policy defaults to Hold/manual decision.
- Five original starter templates cover the approved audiences and equipment contexts.
- Starter activation creates a user-owned copy; editing, scheduling, recommendations, and history bind to that copy.
- Missing or upgraded source content never rewrites historical snapshots.

### Correction

- Completed and partial sessions can be corrected at any time.
- Each correction records field or set identity, previous value, corrected value, and timestamp.
- The original plan snapshot remains intact and a `Corrected` label exposes the audit history behind disclosure.
- Correction recalculates records, aggregates, comparable history, period summaries, and dependent pending recommendations.
- `Remove from history` voids rather than deletes; voided sessions disappear from default analytics but remain restorable.
- Void acknowledgement occurs only after dependent pending recommendations are invalidated; Restore recalculates the same derived outputs.

### Backup, Restore, and Export

- Backups include user-owned database content, custom exercises, plans, sessions, settings, content-pack manifest, schema version, and integrity metadata.
- Password encryption is the default; password and derived keys are never stored or logged, and there is no password recovery.
- Restore validates envelope, authentication, manifest, schema, IDs, row counts, references, content versions, and resource limits before mutation.
- Restore shows counts and requires explicit Replace local data or Cancel.
- Replacement happens in one transaction after staging; any failure leaves current data unchanged.
- CSV covers sessions, exercises, working sets, explicit warm-up set kind, recommendations, and decisions.

### Accessibility

- Compact, medium, and expanded layouts preserve the primary workout action; portrait and landscape are supported.
- At 200% text, names wrap, controls grow, context reflows, and required text is neither clipped nor hidden.
- Row meaning is exposed in a stable semantic order and decorative elements are hidden.
- Timer labels update meaningfully without a per-second live announcement.
- Every control is reachable by touch, keyboard, and D-pad with logical focus and restoration after sheets.
- Completion, timer attention, and error states combine text/icon with optional color, motion, haptic, or sound.
- Reduced motion removes positional animation and chart interpolation without removing information.

## Anti-Features (Keep Excluded)

| Anti-Feature | Why It Is Commonly Requested | Why It Is Problematic Here | Approved Alternative |
|--------------|------------------------------|----------------------------|----------------------|
| Accounts and cloud synchronization | Multi-device access and automatic backup | Adds authentication, backend, conflict resolution, privacy, network, and operating cost to a one-owner offline tool | No-account local database plus manual encrypted backup and restore |
| Social profiles, feeds, sharing, leaderboards, and community plans | Motivation and discovery | Changes the product into a network, encourages comparison, and requires moderation and identity systems | Private factual progress and original bundled starter plans |
| Generative-AI coaching | Appears personalized and adaptive | Recommendations become opaque, network-dependent, hard to validate, and potentially over-authoritative | Deterministic versioned rules with evidence and explicit acceptance |
| Camera form analysis or live coaching | Promises technique feedback | Requires complex vision, safety claims, media permissions, and device-specific validation | Exercise instructions and user-controlled notes only |
| Wear OS | Convenient wrist logging | Duplicates the integrity-critical active-workout state machine before the phone loop is proven | Prove Android phone interaction first |
| Health Connect import/export | Ecosystem integration | Adds identity matching, duplication, permission, and semantic-conflict work before the local model has usage evidence | Stable local session model and CSV portability |
| Nutrition tracking | Broadens fitness coverage | Creates a separate food database, goals, privacy model, and daily workflow unrelated to fast workout logging | Keep the app exercise-session focused |
| Body measurements, progress photos, and recovery scores | Offers a wider transformation dashboard | Adds sensitive data and encourages composite interpretations the app cannot justify | Exercise-specific history, records, and consistency |
| Global strength, fitness, readiness, or recovery score | Produces one impressive headline | Collapses incompatible metrics into false precision and can feel judgmental | Metric-aware exercise trends and plain-language period summaries |
| Aggregate kilogram-volume headline | Common in strength dashboards | Excludes non-load exercises and overstates the meaning of mixed exercise totals | Exercise-appropriate Best/Average/Last and comparable improvements |
| Per-repetition timers and cluster-set programming | Supports specialized training modes | Multiplies timer states, notifications, controls, and recovery cases in the critical path | Between-set rest only in v1 |
| Generic adaptive cardio coaching | Adds progression to all activities | No universal safe rule exists across distance, duration, intervals, and conditioning goals | Only plan-authored cardio and interval progressions |
| Unverified exercise images or video | Makes the library look richer | Licensing, attribution, storage, accessibility, and update risk exceed v1 value | Text instructions and metadata until each asset is independently cleared |
| Copied proprietary programs | Familiar branded plans attract users | Creates copyright, attribution, and maintenance risk | Five original templates based on general published principles |
| Runtime scraping or remote catalog fetching | Makes the catalog appear current | Breaks offline guarantees and introduces uncontrolled content drift | Maintainer-only pinned import, review, and versioned shipped pack |
| Merge restore | Seems safer than replacing current data | Stable-identity and conflict rules are not designed; partial merging can silently duplicate or corrupt history | Previewed all-or-nothing replacement in v1 |
| Streak-loss and guilt mechanics | Can drive short-term engagement | Conflicts with calm personal use and turns interruptions into moral failure | Scheduled-opportunity consistency with neutral language |

## Feature Dependencies

```text
Reviewed metric registry + versioned observation contract
    ├──requires──> Exercise library taxonomy
    ├──requires──> Plan targets
    ├──requires──> Set logging
    ├──requires──> Metric-aware history
    ├──requires──> Progression rules
    └──requires──> Backup and CSV schemas

User-owned plan copies + schedule rules
    └──requires──> Today suggestion and workout snapshot
                           └──requires──> Active workout
                                              ├──requires──> Transactional set commit
                                              └──requires──> Persisted rest state
                                                                     └──requires──> Notification reconciliation

Immutable session snapshots
    └──requires──> Comparable history
                       ├──requires──> Best / Average / Last
                       └──requires──> Progression recommendations
                                            └──requires──> Explicit accept/reject lifecycle

Correction ledger + reversible void
    └──requires──> Rebuildable records, summaries, comparisons, and recommendations

Versioned logical backup
    └──requires──> Stable IDs + migrations + ownership rules + restore staging

Accessibility semantics and adaptive layout
    ──cross-cuts──> Shell + workout + timer + history + progress + backup/restore
```

### Dependency Notes

- **Metric contracts precede UI breadth:** Plans, actuals, history, recommendations, CSV, and backup must agree on the meaning and version of each observation before additional exercise profiles ship.
- **Transactional set persistence precedes timer effects:** A timer, notification, haptic, or visible completion cannot begin until the set commit succeeds.
- **Session snapshots precede trustworthy history:** Historical names, targets, units, order, and rule versions must be immutable before plan editing and content-pack upgrades are exposed.
- **History precedes recommendation breadth:** Comparable working-set evidence and invalidation rules must exist before additional progression policies or period summaries.
- **Correction requires rebuildable derivatives:** Records, progress, and recommendations cannot be safely corrected if their derivation is not deterministic.
- **Backup belongs after schema ownership stabilizes:** Restore must distinguish bundled content from user-owned data and migrate logical rows without raw database replacement.
- **Accessibility cannot be deferred to polish:** Focus order, semantic actions, reflow, and chart alternatives affect component and navigation architecture from the first workout slice.

## MVP Definition

### Milestone 1: Trustworthy Workout Loop

- [ ] One reviewed starter plan activates as a user-owned copy.
- [ ] Today shows next targets and comparable history for the plan.
- [ ] A workout can start, resume, complete, or finish partial offline.
- [ ] Warm-ups and transactional working sets behave distinctly.
- [ ] Rest survives backgrounding and process death; notification denial does not break in-app timing.
- [ ] Basic session detail and metric-aware history exist for `load_reps`.
- [ ] One deterministic double-progression rule shows evidence and requires acceptance.

### Required Before Complete v1 Release

- [ ] Full owned plan/day editor, schedule behavior, custom exercises, reviewed catalog, and all starter plans.
- [ ] Calendar states, complete metric-aware history, corrections, void/restore, and deterministic rebuilds.
- [ ] Period-based Overall Progress and all approved recommendation profiles and decision states.
- [ ] Password-encrypted backup, validated transactional restore, and versioned CSV export.
- [ ] System/Light/Dark, adaptive width classes, 200% text, keyboard/D-pad, logical-focus, reduced-motion, and non-color verification.

### Explicitly Deferred Beyond v1

- [ ] Accounts, cloud synchronization, social/community features, Wear OS, and Health Connect.
- [ ] Generative coaching, camera analysis, nutrition, body measurements, and recovery scores.
- [ ] Per-repetition/cluster timers, generic adaptive cardio coaching, and uncleared exercise media.
- [ ] Merge restore until stable identity and conflict behavior is separately designed.

## Feature Prioritization Matrix

| Capability | User Value | Implementation Cost | Priority | Approved Milestone |
|------------|------------|---------------------|----------|--------------------|
| Offline plan activation and Today | HIGH | HIGH | P1 | 1 |
| Transactional one-tap set logging | HIGH | HIGH | P1 | 1 |
| Recoverable rest timer | HIGH | HIGH | P1 | 1 |
| Basic history and double progression | HIGH | HIGH | P1 | 1 |
| Complete library, plans, and schedules | HIGH | HIGH | P1 | 2 |
| Calendar, correction, void, and restore | HIGH | HIGH | P1 | 3 |
| Overall progress and complete recommendation lifecycle | HIGH | HIGH | P1 | 4 |
| Encrypted backup, restore, and CSV | HIGH | HIGH | P1 | 5 |
| Complete adaptive/accessibility verification | HIGH | HIGH | P1 | Cross-cutting; release gate in 5 |
| Deferred anti-features | LOW for core goal | VERY HIGH | EXCLUDE | Not v1 |

**Priority key:**

- **P1:** Required for the approved complete v1, delivered in dependency order.
- **EXCLUDE:** Explicitly outside v1; do not create roadmap phases for it.

## Competitor Feature Analysis

| Feature | Established Baseline | Approved Gym Tracker Approach |
|---------|----------------------|-------------------------------|
| Plans and logging | Strong, Hevy, FitNotes, and JEFIT provide routines/templates, custom workouts, set logging, and prior-performance context | Preserve that baseline, but reduce the active state to one next target, one active set, and one primary completion action |
| Rest timer | Hevy and FitNotes document automatic timers, alerts, and quick timer controls | Add persisted timestamps, explicit recovery copy, notification reconciliation, stale-event protection, and timer-state Undo |
| History and progress | Competitors provide calendars/timelines, previous workouts, PRs, charts, and volume statistics | Use metric-aware comparators, stable local dates, explicit partial states, drill-down, and no misleading aggregate-volume headline |
| Exercise library | Competitors provide large catalogs, filters, instructions, custom exercises, and prebuilt plans | Prefer a smaller reviewed versioned subset, aliases, provenance, immutable starter templates, and user-owned copies |
| Progression | Competitors range from previous-value display to automated progressive-overload or AI recommendations | Use conservative deterministic rules, stored evidence and versions, useful Hold/Repeat states, and explicit plan mutation |
| Correction | Active-workout editing and historical deletion are common; some deletion is irreversible | Add correction history, reversible void/restore, and deterministic invalidation/recalculation |
| Data ownership | Strong supports CSV; FitNotes supports local backup/restore and export | Add encrypted authenticated archives, restore preview, resource limits, and no mutation on validation or transaction failure |
| Accessibility | Platform conventions expect scalable text, semantics, and reachable controls, but fitness marketing rarely treats parity as a core feature | Make 200% text, keyboard/D-pad input, chart alternatives, logical focus, reduced motion, and non-color cues release-gated |

## Requirement Ambiguities and Missing Acceptance Criteria

The approved direction has no unresolved product-design decision. The following are implementation-level acceptance details that should be made explicit in requirements or phase plans before the affected behavior is built.

| Area | Gap | Acceptance Detail Needed |
|------|-----|--------------------------|
| Manual rest start | The problem statement requests manual start, but the detailed Rest dock only specifies automatic start, pause/resume, adjust, and skip | Define where manual start is available, which default duration it uses, and whether it is allowed without a preceding completed set |
| Timer device behavior | Sound, vibration, and default adjustment require physical-device calibration | Specify tested Android versions/devices, alert behavior in silent/DND modes, meaningful announcement thresholds, and final defaults |
| Reboot recovery | Launch recovery is guaranteed, but notification delivery during reboot is not | State whether a boot receiver ships in v1 or is explicitly absent; test that launch reconciliation never duplicates or revives stale rest |
| Partial-workout classification | Partial completion is supported, but the exact boundary between completed, partial, skipped, and discarded is not fully enumerated | Define status rules for skipped exercises, missing sets, user-selected partial finish, zero-set sessions, and manual visits |
| Correction field scope | Corrections can occur at any time, but editable fields are not exhaustively listed | Provide a field/action matrix for values, set kind, add/remove set, exercise replacement, date/time, effort, notes, plan association, and active-rest effects |
| Metric aggregates | `Best`, `Average`, and `Last` are required, but every metric profile needs exact formulas and tie-breaking | Define comparator, average population, precision, tie ordering, estimated-1RM formula/version, and treatment of partial comparable exposures |
| Non-load progression | Approved behavior depends on plan-authored variations, assistance steps, duration caps, and interval protocols | Define versioned rule fixtures and acceptance examples for each profile before Milestone 4 |
| Schedule mutation | Weekday, rotation, override, repeat, and skip behavior is defined, but edits to an active schedule need exhaustive cases | Specify active-plan replacement, mid-rotation day edits, override precedence, local-midnight behavior, and DST/timezone tests |
| Reviewed catalog | A reviewed subset of at least 300 is approved, but the exact list remains open | Freeze the visible exercise IDs, alias/duplicate policy, taxonomy review checklist, starter-plan substitutions, and attribution acceptance |
| Backup password and limits | Algorithms and safe ordering are approved, but operational limits are not numeric | Set password UX rules, Argon2id calibrated parameters, maximum archive/decompressed size, row/string/nesting limits, cancellation boundary, and performance budget |
| Restore compatibility | Unsupported versions fail safely, but retained compatibility range is not named | Define which older backup versions must migrate, how newer versions fail, and clean-install fixtures for every supported version |
| CSV contract | Included entities are named, but the stable external schema is not complete | Version headers/columns, row ordering, units/base values, locale/decimal rules, timestamps/timezones, corrections, voided sessions, escaping, and filename |
| Accessibility targets | The behavior is strong, but several thresholds remain qualitative | Adopt at least 48dp targets; name contrast checks, test-device/font-scale matrix, focus-order expectations, live-region thresholds, reduced-motion trigger, and accessible table format |
| Offline verification | The full critical path must be offline, but the network-denial acceptance matrix is not enumerated | Test first launch after content is installed, start/resume/complete/correct/history, notification denial, backup/export, and process restart in airplane mode |

## Sources

### Approved Project Sources

- `<repo>/.planning/PROJECT.md` — approved scope, milestones, and exclusions (HIGH confidence, direct project source).
- `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md` — approved product, interaction, architecture, accessibility, backup, and delivery contract (HIGH confidence, direct project source).

### Competitor and Ecosystem Sources

- Strong official product features: https://www.strong.app/
- Strong official workout workflow: https://help.strongapp.io/article/229-my-first-workout
- Strong official CSV/privacy behavior: https://help.strongapp.io/article/232-privacy-policy
- Hevy official fitness-log use case: https://www.hevyapp.com/use-cases/fitness-log/
- Hevy official rest-timer controls: https://www.hevyapp.com/features/live-activity/
- Hevy official previous-value behavior: https://help.hevyapp.com/hc/en-us/articles/34105442929943-Previous-Workout-Values-Vs-Routine-Values-How-to-Adjust-in-Settings
- Hevy official historical deletion behavior: https://help.hevyapp.com/hc/en-us/articles/35119576252951-Reset-Data-Duplicate-Exercise-Routines-and-Manual-Deletion
- FitNotes official workout tracking: http://www.fitnotesapp.com/workout_tracking/
- FitNotes official calendar: https://www.fitnotesapp.com/calendar/
- FitNotes official backup and restore: http://www.fitnotesapp.com/settings/
- JEFIT official workout logging overview: https://www.jefit.com/use-case/workout-logging-app
- JEFIT official workout planning overview: https://www.jefit.com/use-case/workout-planner

### Standards and Evidence

- Android accessibility guidance, including 48dp touch targets and semantic descriptions: https://developer.android.com/guide/topics/ui/accessibility/apps
- Android 14 nonlinear font scaling to 200% and maximum-font testing: https://developer.android.com/about/versions/14/features#non-linear-font-scaling
- Material touch-target guidance: https://m3.material.io/foundations/designing/structure
- ACSM current resistance-training guidance: https://acsm.org/resistance-training-guidelines-update-2026/
- ACSM progression models position stand: https://pubmed.ncbi.nlm.nih.gov/11828249/
- Load versus repetition progression trial: https://pmc.ncbi.nlm.nih.gov/articles/PMC9528903/
- Current ACSM resistance-training position stand: https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/

External ecosystem findings are MEDIUM confidence: the GSD confidence seam classifies verified WebSearch findings as MEDIUM, and critical claims were cross-checked against multiple official or primary sources. Competitor availability and packaging can change; requirements should rely on the approved behavior contract, not competitor parity alone.

---
*Feature research for: Offline-first personal gym tracker*  
*Researched: 2026-08-16*
