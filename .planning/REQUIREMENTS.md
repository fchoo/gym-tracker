# Requirements: Gym Tracker

**Defined:** 2026-08-16  
**Core Value:** Open today's workout, see trustworthy next targets, complete each working set with one primary action, recover safely from interruption, and understand exactly why the next target is recommended.

## v1 Requirements

### Foundation and Shell

- [x] **FOUND-01**: Owner can use the workout critical path without an account or network connection.
- [x] **FOUND-02**: App provides Today, Calendar, Library, and Progress root destinations, with active workouts hiding root navigation.
- [x] **FOUND-03**: App uses SQLite source facts as authority and does not acknowledge source writes before their exclusive transaction commits.
- [x] **FOUND-04**: App replays durable pending effects after process death without duplicating notifications, projections, or recommendations.
- [x] **FOUND-05**: App can migrate every retained schema fixture transactionally and recover from a failed destructive migration without losing existing user data.
- [x] **FOUND-06**: App provides typed runtime contracts, errors, and privacy-safe diagnostics at persistence and platform boundaries.
- [x] **FOUND-07**: App follows the approved precision-instrument design tokens and component vocabulary in System, Light, and Dark appearance modes.
- [x] **FOUND-08**: App supports compact, medium, and expanded Android window classes without moving the active workout action away from the current work.
- [x] **FOUND-09**: App supports 200% text, keyboard/D-pad access, logical focus, reduced motion, non-color cues, meaningful labels, and minimum 48dp targets from the first shipped screen.

### Workout Loop

- [x] **WORK-01**: Owner can activate the bundled Full Body Foundation template as a user-owned copied plan without mutating bundled content.
- [x] **WORK-02**: Today shows the scheduled plan day, estimated duration, consistent Next target values, latest comparable history, and pending recommendation status.
- [x] **WORK-03**: Owner can start a scheduled plan day, choose another plan day, train on a rest day without silently advancing the schedule, or start an empty workout.
- [x] **WORK-04**: Starting a planned workout stores immutable snapshots of exercise names, order, metric profiles, units, targets, and rule versions.
- [x] **WORK-05**: Owner can select recommended, last comparable, plan default, or manual values for each working set.
- [x] **WORK-06**: Owner can add, copy, complete, skip, and review optional warm-up sets that never affect working-set completion, records, or progression.
- [x] **WORK-07**: Owner can complete the active working set through the active row's primary action or equivalent touch/keyboard/D-pad input exactly once, even under rapid repeated input.
- [x] **WORK-08**: A completed set advances, haptics, Undo, rest state, and notification work only after its source facts and durable effects commit successfully.
- [x] **WORK-09**: A failed set save preserves entered values, does not advance or start rest, and shows inline `Set not saved · Retry`.
- [x] **WORK-10**: Owner can undo a completed set for eight seconds and restore its prior active-set and rest state.
- [x] **WORK-11**: Automatic between-set rest derives from persisted timestamps and supports pause, resume, subtract 15 seconds, add 15 seconds, and skip.
- [x] **WORK-12**: Owner can manually start rest from Active Workout using the exercise's configured rest duration, even when no preceding set has just completed.
- [x] **WORK-13**: App reconciles Android rest notifications from persisted SQLite state after relevant commits, launch, foreground, permission change, Undo, finish, and supported boot handling.
- [x] **WORK-14**: Denied, late, missing, or stale notifications never change workout truth or prevent the in-app timer from remaining correct.
- [x] **WORK-15**: After backgrounding, rotation, or Android process death, app restores the active exercise, active set, entered values, and running/paused/expired rest state.
- [x] **WORK-16**: Owner can finish a workout as completed or partial, resume it later when valid, or discard it only after destructive confirmation.
- [x] **WORK-17**: Session statuses distinguish in-progress, completed, partial, discarded, voided, manual visit, skipped exercise, and zero-set outcomes using explicit rules.
- [x] **WORK-18**: Completion shows duration, exercises completed, working sets completed, metric-appropriate exercise results, optional effort, and the next useful action.

### Library and Planning

- [x] **LIB-01**: Library combines a visible Plans and Exercises switch and remembers the last opened section.
- [x] **LIB-02**: App ships at least 300 reviewed common exercises with stable IDs, aliases, type, muscle groups, equipment, metric profile, source revision, license, and attribution.
- [x] **LIB-03**: Owner can search exercises by partial name or alias and filter by type, muscle group, equipment, origin, visibility, recent use, and favorite status.
- [x] **LIB-04**: Search keeps relational rows authoritative, synchronizes FTS in the same write transaction, paginates results, handles punctuation safely, and can rebuild the FTS index.
- [x] **LIB-05**: Owner can create, edit, hide, and archive custom exercises with an explicit metric profile and manual progression when no policy is configured.
- [x] **LIB-06**: App ships six original starter-plan templates with goal, experience, schedule, equipment, source notes, explicit metric semantics, and progression policies; one template is an equipment-heavy Monday–Friday Chest / Back / Shoulders / Legs / Arms split.
- [x] **LIB-07**: Activating any starter template clones its plan, days, targets, schedule defaults, and source attribution into user-owned rows.
- [x] **LIB-08**: Owner can create, rename, duplicate, reorder, edit, schedule, and archive user-owned plans and plan days.
- [x] **LIB-09**: Scheduling supports weekday and rotation modes, date overrides, repeat, explicit skip/advance, rest day, Train anyway, local midnight, DST, and timezone behavior without silent schedule rewrites.
- [x] **LIB-10**: Content-pack upgrades can update only bundled rows, preserve custom/copied rows and historical snapshots, and retain removed sources as unavailable.
- [x] **LIB-11**: Each supported metric profile has versioned observation and aggregate contracts, comparator direction, average population, precision, tie order, and comparable-exposure rules.
- [x] **LIB-12**: App supports load/reps, bodyweight reps, added load/reps, assisted reps, timed hold, fixed distance, fixed time, intervals, and unscored observations needed by approved plans.

### Calendar and History

- [x] **HIST-01**: Calendar distinguishes completed, partial, manual, planned-not-completed, and current-day states.
- [x] **HIST-02**: Selecting a date shows its visits and sessions with actual `N/N (100%)`-style completion counts.
- [x] **HIST-03**: Historical local dates remain stable across timezone changes while preserving timestamps and creation offset.
- [x] **HIST-04**: Exercise history shows metric-aware Best, Average, and Last from comparable working sets while displaying warm-ups separately.
- [x] **HIST-05**: Owner can correct completed or partial sessions at any time, including values, set kind, set addition/removal, exercise replacement, date/time, effort, notes, and plan association where valid.
- [x] **HIST-06**: Every correction stores field/set identity, previous value, corrected value, timestamp, and a discreet audit history without rewriting the original session snapshot.
- [x] **HIST-07**: Owner can void a completed session through Remove from history, exclude it from ordinary history and derived metrics, and restore it from Removed sessions.
- [x] **HIST-08**: Corrections, voids, and restores transactionally invalidate dependent recommendations and trigger deterministic targeted projection rebuilds.
- [x] **HIST-09**: Targeted projection rebuild output equals a full rebuild for records, comparable exposures, exercise metrics, and affected period summaries.

### Progress and Recommendations

- [x] **PROG-01**: Progress shows Overall Progress for 4 weeks, 12 weeks, and All time without a global fitness, readiness, or aggregate kilogram-volume score.
- [x] **PROG-02**: Overall Progress shows scheduled opportunities completed, working sets, improving/holding/attention counts, recent metric-aware records, and one consistency trend.
- [x] **PROG-03**: Every overall summary drills into the source sessions or exercises, and every chart has equivalent text and accessible table output.
- [x] **PROG-04**: Progress shows Needs attention, Recent improvements, and searchable exercise progress using calm evidence-first language.
- [x] **PROG-05**: Sparse or stale projections show baseline, Hold, or Updating progress states instead of zero-valued or known-obsolete analytics.
- [x] **PROG-06**: Weighted double progression holds load until every planned working set reaches the upper rep bound and effort is Easy or On target.
- [x] **PROG-07**: Missing effort, Hard effort, incomplete exposure, Failed effort, repeated regression, and equipment increments produce explicit versioned outcomes without medical claims.
- [x] **PROG-08**: Non-load progression is profile-specific and plan-authored for assistance steps, duration caps, variations, fixed-distance/time, and interval protocols; unscored work remains manual.
- [x] **PROG-09**: Every recommendation stores versioned evidence, current target, proposed target, rule, confidence/reason, source plan-target revision, and decision lifecycle.
- [x] **PROG-10**: Recommendations never change future targets without explicit acceptance, and stale recommendations become superseded rather than overwriting manual edits.
- [x] **PROG-11**: Pending recommendations appear quietly on Today and in Progress until accepted, rejected, invalidated, or superseded.

### Material 3 UX Remediation

- [ ] **UX-01**: Library exercise filters use compact Material 3 filter-chip behavior with an immediately visible selected state in System, Light, and Dark modes; Favorite is a standalone one-tap chip and the full taxonomy remains available without obscuring the result list.
- [ ] **UX-02**: Library plan search, Library exercise search, Progress exercise search, and owned-plan exercise picking use one shared Material 3 Search component with a leading search icon, integrated clear action, keyboard/IME behavior, and accessible busy, empty, and result states.
- [ ] **UX-03**: The root Calendar always renders a complete six-row month grid with subdued adjacent-month dates, preserves civil-date and timezone semantics, and supports horizontal previous/next month swipes with labelled button alternatives.
- [ ] **UX-04**: Plan days and exercises support touch-and-hold continuous drag reordering with a 48dp handle, visible movement feedback, and accessible up/down fallback actions; primary row content stays on one horizontal line at normal text scale and remains legible at 200% text.
- [ ] **UX-05**: Every in-app date field uses a consistent Material 3/Google Calendar-inspired dialog with clear selected-date hierarchy, a complete bounded calendar grid, month swipe plus labelled buttons, explicit Cancel/Confirm behavior, and unchanged LocalDate correctness.
- [ ] **UX-06**: Library refresh is performed through pull-to-refresh on the owning list; the permanent Refresh Library button is removed, failed refresh preserves current results and filters, and a labelled retry remains available only in the failure state.
- [ ] **UX-07**: Favorite controls use a filled approved-green star plus accessible selected state when active and an outlined star when inactive, without relying on color alone.
- [ ] **UX-08**: Exercise browse and Favorite/Recent rows omit source namespace, revision, license, and attribution while Exercise Detail retains complete provenance.
- [ ] **UX-09**: Root navigation and shared dialogs remain readable and operable at Android 200% font scale without clipped labels; Today exposes one unambiguous route to secondary tools/settings instead of duplicate More affordances.
- [ ] **UX-10**: Progress loads its normal empty or populated view on the production runtime, Retry recovers from a transient failure, and any fix preserves SQLite source authority and rebuildable projections.

### Data Portability and Release

- [x] **DATA-01**: Owner can create a versioned logical backup containing user-owned plans, exercises, sessions, corrections, void state, settings, and content references without raw database replacement.
- [x] **DATA-02**: Backup encryption defaults to password-derived Argon2id and authenticated AES-256-GCM using reviewed native primitives, calibrated parameters, known-answer tests, and no persisted password/key.
- [x] **DATA-03**: Backup format authenticates metadata, enforces archive/compressed/decompressed/row/string/nesting limits, and leaves no plaintext residue after export or failure.
- [x] **DATA-04**: Restore authenticates and decrypts before parsing, validates manifest/schema/IDs/references/limits, previews replacement, and mutates user-owned tables in one transaction only after all validation succeeds.
- [x] **DATA-05**: Wrong password, tampering, unsupported version, oversized input, validation failure, cancellation, or insert failure leaves the existing database unchanged and shows a safe error.
- [x] **DATA-06**: Restore reconciles bundled references separately, rebuilds FTS and all projections, and succeeds in an independently clean install.
- [x] **DATA-07**: Owner can export versioned CSV with stable column order, explicit units, locale-independent decimals, timestamps, set kind, corrections, void status, recommendations, decisions, and safe escaping.
- [x] **REL-01**: Project uses Expo CNG from committed config/plugins and can reproducibly generate a clean Android development-test build without committed `android/`.
- [x] **REL-02**: Every pull request runs typecheck, lint, unit, component, host SQLite, coverage, native Expo SQLite, and Android smoke gates in the reviewed order.
- [ ] **REL-03**: Nightly and release workflows run the full migration, lifecycle, permission, backup/restore, adaptive, accessibility, performance, and mutation-test matrix.
- [ ] **REL-04**: Release workflow builds signed APK/AAB candidate bytes once, records SHA-256 and build metadata, and stores them privately pending physical-device approval.
- [ ] **REL-05**: Public GitHub Release promotion verifies and publishes the exact physically approved candidate bytes without rebuilding.
- [ ] **REL-06**: Release remains blocked until airplane-mode, process-death, notification, clean-restore, adaptive, 200% text, assistive-technology, performance, and post-implementation design-review gates pass.

## Definition of Done

- A checked requirement is implemented and has passed its phase-scoped automated verification. Milestone completion additionally requires the consolidated Phase 5 exact-candidate native/device/human evidence for every requirement that needs it.
- Integrity-critical domain/application modules meet 100% statement, branch, function, and line coverage; remaining testable TypeScript meets the reviewed global thresholds.
- Real Expo SQLite contract tests prove foreign keys, serialization, rollback, migrations, effects, and projections on the native adapter.
- The five milestone exit gates pass in order without bypassing their data-contract dependencies.
- A signed Android APK and checksum are promoted to GitHub Releases only after the exact candidate digest passes physical-device approval.

## v2 Requirements

### Ecosystem and Specialized Training

- **V2-01**: Owner can use Wear OS after the phone workout loop has real usage evidence.
- **V2-02**: Owner can import or export approved data through Health Connect after duplicate and semantic-conflict rules are designed.
- **V2-03**: Owner can configure per-repetition or cluster-set timer modes through a separately reviewed state machine.
- **V2-04**: Owner can merge a backup into existing data after stable identity and conflict rules are approved.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Accounts and cloud sync | Contradicts the single-owner offline-first v1 and introduces backend/conflict complexity |
| Social profiles, sharing, leaderboards, and community | Changes the product into a network and requires identity/moderation |
| Generative coaching or camera form analysis | Opaque, network-dependent, difficult to validate, and outside the trust boundary |
| Nutrition, body measurements, photos, and readiness scoring | Separate sensitive workflows unrelated to fast workout logging |
| Global fitness or strength score | Collapses incompatible exercise metrics into false precision |
| Generic adaptive cardio coaching | No universal safe progression rule across conditioning goals |
| Unverified exercise media or copied proprietary programs | Licensing, attribution, and maintenance risk |
| Runtime scraping or remote catalogs | Breaks offline behavior and controlled versioned content |
| Marketing website and store-listing art | Not required for the personal Android application milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| FOUND-06 | Phase 1 | Complete |
| FOUND-07 | Phase 1 | Complete |
| FOUND-08 | Phase 1 | Complete |
| FOUND-09 | Phase 1 | Complete |
| WORK-01 | Phase 1 | Complete |
| WORK-02 | Phase 1 | Complete |
| WORK-03 | Phase 1 | Complete |
| WORK-04 | Phase 1 | Complete |
| WORK-05 | Phase 1 | Complete |
| WORK-06 | Phase 1 | Complete |
| WORK-07 | Phase 1 | Complete |
| WORK-08 | Phase 1 | Complete |
| WORK-09 | Phase 1 | Complete |
| WORK-10 | Phase 1 | Complete |
| WORK-11 | Phase 1 | Complete |
| WORK-12 | Phase 1 | Complete |
| WORK-13 | Phase 1 | Complete |
| WORK-14 | Phase 1 | Complete |
| WORK-15 | Phase 1 | Complete |
| WORK-16 | Phase 1 | Complete |
| WORK-17 | Phase 1 | Complete |
| WORK-18 | Phase 1 | Complete |
| LIB-01 | Phase 2 | Complete |
| LIB-02 | Phase 2 | Complete |
| LIB-03 | Phase 2 | Complete |
| LIB-04 | Phase 2 | Complete |
| LIB-05 | Phase 2 | Complete |
| LIB-06 | Phase 2 | Complete |
| LIB-07 | Phase 2 | Complete |
| LIB-08 | Phase 2 | Complete |
| LIB-09 | Phase 2 | Complete |
| LIB-10 | Phase 2 | Complete |
| LIB-11 | Phase 2 | Complete |
| LIB-12 | Phase 2 | Complete |
| HIST-01 | Phase 3 | Complete |
| HIST-02 | Phase 3 | Complete |
| HIST-03 | Phase 3 | Complete |
| HIST-04 | Phase 3 | Complete |
| HIST-05 | Phase 3 | Complete |
| HIST-06 | Phase 3 | Complete |
| HIST-07 | Phase 3 | Complete |
| HIST-08 | Phase 3 | Complete |
| HIST-09 | Phase 3 | Complete |
| PROG-01 | Phase 4 | Complete |
| PROG-02 | Phase 4 | Complete |
| PROG-03 | Phase 4 | Complete |
| PROG-04 | Phase 4 | Complete |
| PROG-05 | Phase 4 | Complete |
| PROG-06 | Phase 4 | Complete |
| PROG-07 | Phase 4 | Complete |
| PROG-08 | Phase 4 | Complete |
| PROG-09 | Phase 4 | Complete |
| PROG-10 | Phase 4 | Complete |
| PROG-11 | Phase 4 | Complete |
| UX-01 | Phase 6 | Pending |
| UX-02 | Phase 6 | Pending |
| UX-03 | Phase 6 | Pending |
| UX-04 | Phase 6 | Pending |
| UX-05 | Phase 6 | Pending |
| UX-06 | Phase 6 | Pending |
| UX-07 | Phase 6 | Pending |
| UX-08 | Phase 6 | Pending |
| UX-09 | Phase 6 | Pending |
| UX-10 | Phase 6 | Pending |
| DATA-01 | Phase 5 | Complete |
| DATA-02 | Phase 5 | Complete |
| DATA-03 | Phase 5 | Complete |
| DATA-04 | Phase 5 | Complete |
| DATA-05 | Phase 5 | Complete |
| DATA-06 | Phase 5 | Complete |
| DATA-07 | Phase 5 | Complete |
| REL-01 | Phase 1 | Complete |
| REL-02 | Phase 1 | Complete |
| REL-03 | Phase 5 | Pending |
| REL-04 | Phase 5 | Pending |
| REL-05 | Phase 5 | Pending |
| REL-06 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 82 total
- Mapped to phases: 82
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-16*
*Last updated: 2026-08-31 for Phase 6 Material 3 UX remediation*
