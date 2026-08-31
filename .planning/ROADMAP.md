# Roadmap: Gym Tracker

## Overview

Gym Tracker v1 is delivered through six reviewed, dependency-ordered phases. Phase 1 proves the integrity kernel and one complete Full Body Foundation workout vertical slice on a real Android development-test APK. Later phases expand owned content and planning, make history safely correctable, add period-based progress and complete progression, prepare encrypted recovery and digest-bound release, then remediate the exact-candidate Material 3 and accessibility findings before final promotion. SQLite source facts remain authoritative throughout; notifications, FTS, projections, recommendations, and UI query caches remain replayable or rebuildable derivatives.

## Delivery Contract

- The phase order is fixed: trustworthy writes and lifecycle recovery → owned content and schedules → correctable history → progress and recommendation breadth → recovery/release preparation → Material 3 remediation and final release re-verification.
- Every phase leaves the repository buildable and its included user flow usable.
- Accessibility, adaptive layout, CI, migrations, tests, diagnostics, native CNG proof, backup seams, and release-artifact identity begin in Phase 1 and are verified continuously. Phase 5 closes these foundations; it does not introduce them for the first time.
- Screens never execute SQL. All source mutations use the repository-owned private SQLite writer, FIFO serialization, and explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`; correctness does not rely directly on `withExclusiveTransactionAsync()`.
- A source mutation and its durable pending effects commit atomically before UI acknowledgement, haptics, notification work, cache invalidation, or other external effects.
- Cross-cutting verification inherited by every plan: strict typecheck, lint, behavior tests, integrity-critical complete branch coverage, retained migration fixtures, redacted diagnostics, accessibility semantics, and clean build proof appropriate to the changed surface.
- Native dependency, config-plugin, SQLite-kernel, notification, crypto, or Expo SDK changes rerun clean CNG generation, actual Expo SQLite contracts, and the applicable installed-APK smoke flows.

## Phases

- [x] **Phase 1: Trustworthy Workout Loop** - Prove the Android, SQLite, lifecycle, accessibility, CI, and release foundations through one complete offline workout loop. (completed 2026-08-17)
- [x] **Phase 2: Owned Library and Planning** - Give the owner a reviewed searchable catalog, custom exercises, editable copied plans, complete schedules, and all approved metric profiles. (automated evidence complete; physical verification deferred to final release gate)
- [x] **Phase 3: Calendar and History Integrity** - Make workout history chronological, metric-aware, correctable, reversible, and deterministically rebuildable. (automated source evidence complete 2026-08-25; physical verification deferred to final release gate)
- [x] **Phase 4: Overall Progress and Complete Progression** - Deliver period-based evidence and the complete explicit, versioned recommendation lifecycle. (automated source evidence complete 2026-08-26; physical verification deferred to final release gate)
- [ ] **Phase 5: Recovery, Distribution, and Release** - Complete encrypted portability, CSV export, release-wide accessibility proof, and unchanged signed-artifact promotion.
- [ ] **Phase 6: Material 3 UX Remediation** - Resolve the whole-app Material 3, accessibility, and Progress-runtime blockers found on the exact Phase 5 candidate, then produce a replacement installable APK for final verification.

## Phase Details

### Phase 1: Trustworthy Workout Loop

**Goal**: The owner can repeatedly complete and recover one trustworthy Full Body Foundation workout offline, while the repository proves the integrity kernel and cross-cutting foundations every later phase will use.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, FOUND-08, FOUND-09, WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, WORK-06, WORK-07, WORK-08, WORK-09, WORK-10, WORK-11, WORK-12, WORK-13, WORK-14, WORK-15, WORK-16, WORK-17, WORK-18, REL-01, REL-02
**Success Criteria** (what must be TRUE):

  1. Owner can install the development-test APK, launch without an account or network, and use the accessible System/Light/Dark four-destination shell; the active workout keeps its current action in focus and hides root navigation.
  2. Owner can activate Full Body Foundation as a personal copy, see a consistent scheduled target and comparable history on Today, and start the scheduled day, another day, a rest-day session, or an empty workout without silently changing the schedule.
  3. Owner can choose target values, record optional warm-ups, complete each working set exactly once, recover a failed save with entered values intact, undo for eight seconds, and control automatic or manual timestamp-derived rest; no success, advancement, haptic, rest, or notification is observable before commit.
  4. Backgrounding, rotation, Android process death, denied or late notifications, and relaunch preserve or reconstruct the active exercise, set, entered values, and running/paused/expired rest state from SQLite without making notifications authoritative.
  5. Owner can finish as completed or partial, resume when valid, confirm discard, review explicit session outcomes, and see a metric-appropriate completion plus one evidence-backed recommendation path that changes a future target only after acceptance.

**Plans**: 10 likely plans

**Likely Plan Slices and Waves**:

- **Wave 0 — native prerequisite**
  - [x] 01-01: Configure the Android SDK and pinned Expo toolchain; scaffold strict TypeScript/CNG; encode generated-native assertions, Android Auto Backup exclusions, reproducible clean prebuild, installable development-test APK, and artifact hash/retention plumbing without committing `android/`.
- **Wave 1 — foundations after 01-01; parallel where independent**
  - [x] 01-02: Extract repository `DESIGN.md`; implement precision-instrument tokens, System/Light/Dark appearance, compact/medium/expanded layout primitives, 200% text behavior, 48dp targets, semantic actions, focus/live-region rules, reduced motion, and the four-root shell.
  - [x] 01-03: Establish vertical module boundaries, runtime contracts, explicit clock, typed errors, privacy-safe diagnostics, exact query invalidation, unit/component/host-SQLite harnesses, coverage policy, and reviewed PR gate ordering.
  - [x] 01-04: Run the blocking SQLite spike and implement the private preconfigured writer, FIFO queue, separate WAL reader, and explicit `BEGIN IMMEDIATE`; prove per-connection foreign keys, serialization, contention, rollback, prepared-resource cleanup, and no pre-commit effects on actual Expo SQLite.
  - [x] 01-05: Spike the app-owned Argon2id native path in the CNG development build with known-answer support, background execution, clean registration, ABI/page-size compatibility, minimum-device timing, and release-artifact seam; do not add backup product UI.
- **Wave 2 — integrity kernel and first trusted data**
  - [x] 01-06: Build launch-blocking transactional migrations, retained fixtures, internal pre-migration recovery, integrity/foreign-key checks, durable pending-effects leases/replay, exact invalidation, stale-effect rejection, and startup/foreground draining on the proven writer.
  - [x] 01-07: Add the reviewed Full Body Foundation subset, bundled/user-owned ownership rules, copied-plan activation, schedule seed, immutable session snapshots, `load_reps` contract, Today read model, and planned/alternate/rest-day/empty start flows.
- **Wave 3 — complete working-set path**
  - [x] 01-08: Implement accessible active-workout entry, warm-ups, recommended/last/default/manual inline values, idempotent compact Complete/Skip actions, inline save failure and Retry, post-commit advancement/haptic, and eight-second transactional Undo.
  - [x] 01-09: Implement persisted automatic/manual rest, pause/resume/±15/skip, stable-revision Android notification reconciliation, permission/channel policy, stale/late handling, and rotation/background/`killApp` recovery.
- **Wave 4 — vertical-slice closure**
  - [x] 01-10: Implement completed/partial/resumable/discarded/skipped/zero-set outcomes, completion and basic session detail, first deterministic double-progression evidence/decision seam, airplane-mode repetition, performance measurement, and Phase 1 end-to-end gates.

**Research Flags**:

- **Deep research and blocking spike**: actual Expo SQLite private-writer behavior. Feature writes must not begin until 01-04 proves configured connection PRAGMAs, FIFO ownership, `BEGIN IMMEDIATE`, rollback, lock behavior, and commit-before-effects on the pinned native adapter.
- **Focused Android decision**: exact-alarm access versus accepted late delivery, stable channel defaults, silent/DND behavior, permission transitions, boot wording, minimum-device matrix, and real process-death versus restart evidence.
- **Focused native feasibility spike**: app-owned Argon2id bridge using the reviewed primitive, including vectors, thread behavior, CNG registration, ABI/16 KB page support, and 250–750 ms minimum-device calibration.

**Release / Verification Gate**:

- Clean checkout can configure/generate/build/install a CNG development-test APK, with generated native output showing explicit Auto Backup exclusions and no dependence on manual `android/` edits.
- Actual Expo SQLite proves the production writer's foreign-key, FIFO, isolation, rollback, contention, migration, durable-effect, and commit-before-acknowledgement contracts.
- PR CI runs typecheck → lint → unit/component → host SQLite/coverage → native Expo SQLite → Android smoke in the reviewed order and can hash, retain, download, and verify the same artifact.
- Airplane-mode Full Body Foundation use passes repeatedly; rapid taps save once; failure injection leaves no partial source/effect state; `killApp` recovery preserves active input/rest; notification denial or lateness never changes workout truth.
- The first progression path has complete warm-up exclusion, effort, evidence, stale-revision, and explicit-acceptance coverage; working-set commit and dock transition meet the p95 ≤150 ms target on the minimum profile.
- Argon2 feasibility passes in the development build or Phase 5 backup format planning remains blocked for re-research.

**UI hint**: yes

### Phase 2: Owned Library and Planning

**Goal**: The owner can manage a complete personal exercise and plan library, schedule any approved plan safely, and run every starter plan with explicit metric semantics without mutating bundled sources.
**Depends on**: Phase 1
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-11, LIB-12
**Success Criteria** (what must be TRUE):

  1. Owner can switch between Plans and Exercises, return to the last section, and search at least 300 reviewed exercises by partial name or alias with safe, paginated filters for taxonomy, origin, visibility, recent use, and favorites.
  2. Owner can create, edit, hide, and archive a custom exercise with an explicit metric profile, while content-pack updates change only bundled rows and preserve custom content, copied plans, unavailable source identity, and historical snapshots.
  3. Owner can activate any of six original starter templates—including an equipment-heavy Monday–Friday Chest / Back / Shoulders / Legs / Arms split—as an independently editable user-owned copy with its attribution, targets, schedule defaults, and progression policies intact.
  4. Owner can create, rename, duplicate, reorder, edit, schedule, and archive plans/days; weekday, rotation, overrides, rest days, explicit repeat/skip/advance, Train anyway, midnight, DST, and timezone cases never silently rewrite the intended schedule.
  5. Every approved observation type displays, compares, averages, ties, rounds, and determines comparable exposure according to its versioned metric profile rather than being forced into load/reps semantics.

**Plans**: 34/34 live plans executed; implementation/automated verification passed; historical Plan 02-35 is superseded by the consolidated Phase 5 Plan 05-07 release gate

- [x] 02-01-PLAN.md
- [x] 02-02-PLAN.md
- [x] 02-03-PLAN.md
- [x] 02-04-PLAN.md
- [x] 02-05-PLAN.md
- [x] 02-06-PLAN.md
- [x] 02-07-PLAN.md
- [x] 02-08-PLAN.md
- [x] 02-09-PLAN.md
- [x] 02-10-PLAN.md
- [x] 02-11-PLAN.md
- [x] 02-12-PLAN.md
- [x] 02-13-PLAN.md
- [x] 02-14-PLAN.md
- [x] 02-15-PLAN.md
- [x] 02-16-PLAN.md
- [x] 02-17-PLAN.md
- [x] 02-18-PLAN.md
- [x] 02-19-PLAN.md
- [x] 02-20-PLAN.md
- [x] 02-21-PLAN.md
- [x] 02-22-PLAN.md — Make expanded navigation a true left rail while compact and medium layouts retain bottom navigation.
- [x] 02-23-PLAN.md — Replace every Phase 2 free-form date input with an accessible in-app calendar.
- [x] 02-24-PLAN.md — Add time-style duration controls and consistent integer/decimal keypad semantics.
- [x] 02-25-PLAN.md — Establish the global grey-canvas/near-black-card system and convert Library to flat cards.
- [x] 02-26-PLAN.md — Complete the grey-canvas/near-black-card migration across all remaining content surfaces.
- [x] 02-27-PLAN.md — Repair current-schema add/copy persistence and add narrow revision-checked active-session set correction.
- [x] 02-28-PLAN.md — Deliver sticky Active Workout identity, Today's plan, glyph/status actions, retry/focus, and unlimited active-session completed-set editing.
- [x] 02-29-PLAN.md — Deliver the collapsible, ordered, accessible RestDock and remove redundant skip feedback.
- [x] 02-30-PLAN.md — Add versioned Android rest channels and persisted independent sound/vibration preferences.
- [x] 02-31-PLAN.md — Add rest-alert settings, durable at-most-one foreground feedback attempts, and deterministic native controls.
- [x] 02-32-PLAN.md — Reconcile D-56 through D-67, remediation cases, UI surfaces, and six-template traceability.
- [x] 02-33-PLAN.md — Extend native, Maestro, coverage, and verifier contracts for every remediation.
- [x] 02-34-PLAN.md — Build one exact-HEAD APK and regenerate all automated Phase 2 evidence from unchanged bytes.
- 02-35-PLAN.md — **Superseded by 05-07.** Retained as the historical Phase 2 attended-gate design; it was not executed and produced no approval or terminal-seal artifact.

**Likely Plan Slices and Waves**:

- **Wave 1 — freeze independent contracts**
  - [x] 02-01: Freeze and import the reviewed 300+ exercise content pack, stable IDs, aliases/duplicates, taxonomy, attribution, source revisions, ownership policy, unavailable sources, and content-upgrade/migration fixtures.
  - [x] 02-02: Research and implement FTS5 normalization, punctuation-safe partial search, relational filters, stable-ID pagination/ranking, same-transaction synchronization, parity diagnostics, and deterministic rebuild/repair.
  - [x] 02-03: Define and test every approved metric profile's versioned observations, aggregates, comparator direction, comparable exposure, precision, tie order, defaults, and manual-policy fallback.
- **Wave 2 — user-owned vertical slices**
  - [x] 02-04: Deliver the combined Library exercise experience, filters, favorites/recent ordering, custom exercise lifecycle, attribution, visibility, and unavailable-source states through accessible/adaptive primitives.
  - [x] 02-05: Add all six reviewed starter templates and clone activation with valid reviewed exercise references, explicit metric semantics, source notes, defaults, and progression policy versions.
  - [x] 02-06: Deliver user-owned plan/day creation, rename, duplicate, reorder, target editing, archiving, and snapshot-safe plan execution.
- **Wave 3 — schedule closure**
  - [x] 02-07: Deliver weekday/rotation schedules, overrides, repeat/skip/advance, rest day, Train anyway, local-midnight/DST/timezone fixtures, cross-profile starter-plan workouts, and Phase 2 gates.
- **Wave 13 — independent remediation contracts**
  - [x] 02-22: Correct adaptive root-navigation geometry.
  - [x] 02-23: Deliver the shared calendar and migrate every date-entry flow.
  - [x] 02-25: Establish global card tokens/primitives and convert Library.
  - [x] 02-27: Repair add/copy persistence and define safe in-progress completed-set correction.
  - [x] 02-30: Deliver versioned Android alert channels and persisted preferences.
- **Wave 14 — input and surface expansion** *(blocked on the relevant Wave 13 foundation)*
  - [x] 02-24: Deliver time-style and semantic numeric controls after the calendar primitive.
  - [x] 02-26: Apply the global card system to remaining app content surfaces after Library establishes the primitive.
- **Wave 15 — Active Workout convergence** *(blocked on Waves 13–14)*
  - [x] 02-28: Integrate sticky identity, Today's plan, glyph/status actions, retry/focus, and completed-set editing.
- **Wave 16 — rest controls** *(blocked on Wave 15)*
  - [x] 02-29: Deliver the collapsible ordered RestDock with no skipped-rest notice.
- **Wave 17 — alert UI and foreground feedback** *(blocked on Waves 13 and 16)*
  - [x] 02-31: Deliver persisted settings UI, durable at-most-one foreground feedback attempts, and native test controls.
- **Wave 18 — amendment traceability** *(blocked on all product remediation)*
  - [x] 02-32: Reconcile decisions, gaps, UI surfaces, and source-owned remediation cases.
- **Wave 19 — evidence contracts** *(blocked on Wave 18)*
  - [x] 02-33: Harden native, Maestro, coverage, and verifier contracts for the amended source.
- **Wave 20 — exact-HEAD automated evidence** *(blocked on Wave 19)*
  - [x] 02-34: Build once and regenerate all automated evidence against one immutable APK.
- **Wave 21 — superseded attended closeout**
  - 02-35: **Superseded by 05-07.** Its emulator/Samsung, accessibility, performance, approval, and terminal-seal scope now runs once against the exact final Phase 5 candidate.

**Cross-cutting constraints:**

- SQLite source facts remain authoritative; notification, haptic, UI, and evidence failures never roll back or redefine committed workout/rest state.
- Every glyph control retains an exact accessible name, visible focus, keyboard/D-pad activation, and a minimum 48dp target.
- No remediation APK evidence is valid until Plan 02-34 builds one clean exact-HEAD candidate and all producers use those unchanged bytes.
- Every implementation and metadata commit before terminal sealing ends with `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`.
- Phase 5 Plan 05-07 is the sole owner of the final exact-candidate attended checklist, truthful owner approval, no-rebuild promotion proof, and terminal-seal handoff across Phases 2–5.

**Research Flags**:

- **Focused FTS research**: choose and fixture prefix versus substring behavior, tokenizer normalization, punctuation/escaping, ranking, page boundaries, and stable-ID parity/rebuild semantics before 02-02 implementation.
- **Acceptance freeze, not broad research**: audit the visible 300+ exercise IDs, aliases, taxonomy, attribution, starter substitutions, and all metric comparator/aggregate contracts before their slices close.

**Release / Verification Gate**:

- FTS and relational rows have stable-ID parity after bundled import, custom create/edit/hide/archive, content upgrade, and full rebuild; punctuation and partial-match fixtures pass on host and actual Expo SQLite.
- Content-pack upgrades preserve custom exercises, copied plans, source attribution, unavailable references, and immutable session snapshots across retained migration fixtures.
- Every starter plan references valid reviewed content and versioned progression policies; a custom plan can be created, scheduled, and run without mutating any bundled template.
- Every newly added screen passes its component, compact/medium/expanded, 200% text, semantics, keyboard/D-pad, non-color, and reduced-motion checks; the repository remains clean-buildable and the Phase 1 workout loop still passes.

**UI hint**: yes

### Phase 3: Calendar and History Integrity

**Goal**: The owner can inspect, correct, remove, and restore historical work while dates, audits, metrics, recommendations, and rebuildable projections remain trustworthy.
**Depends on**: Phase 2
**Requirements**: HIST-01, HIST-02, HIST-03, HIST-04, HIST-05, HIST-06, HIST-07, HIST-08, HIST-09
**Success Criteria** (what must be TRUE):

  1. Owner can browse completed, partial, manual, planned-not-completed, and current-day calendar states, select a date, and see visits/sessions with stable historical local dates and actual `N/N (100%)`-style completion counts.
  2. Owner can view metric-aware Best, Average, and Last from comparable working sets for an exercise, with warm-ups displayed separately and excluded from records/progression evidence.
  3. Owner can correct all approved completed/partial session fields and sets at any time, while a discreet audit shows field/set identity, previous value, corrected value, and timestamp without rewriting the original snapshot.
  4. Owner can remove a completed session from ordinary history and derived metrics, restore it from Removed sessions, and observe records, comparable exposures, period inputs, and pending recommendations update deterministically after correction, void, or restore.

**Plans**: 5/5 implementation plans complete; physical verification deferred to final release gate

**Likely Plan Slices and Waves**:

- **Wave 1 — read surfaces and rebuild contract**
  - [x] 03-01: Implemented calendar state/date rules, stable local-date storage, selected-date visits, factual completion counts, and complete session detail.
  - [x] 03-02: Implemented versioned comparable-exposure queries and metric-aware Best/Average/Last history with warm-up separation and navigation.
  - [x] 03-03: Implemented affected-subject revision fan-out, durable targeted rebuild effects, stale-result rejection, projection freshness, full rebuild, and privacy-safe diagnostics.
- **Wave 2 — mutable history commands**
  - [x] 03-04: Implemented the correction field matrix, immutable originals, correction ledger, validation, and atomic invalidation.
  - [x] 03-05: Implemented reversible void/restore and Removed sessions, targeted/full rebuild equivalence, and automated-only exact-HEAD evidence contracts.

**Research Flags**:

- **Focused design required**: freeze subject-revision fan-out for corrections, exercise replacement, date changes, plan reassociation, voids, and restores that affect multiple exercises or periods before 03-03.
- Calendar/session-detail and audit-ledger UI follow established reviewed patterns; research is limited to rebuild scope and equivalence fixtures.

**Release / Verification Gate**:

- Historical local dates remain stable across timezone changes while timestamps and creation offsets remain available.
- Correction, void, and restore source transactions atomically increment every affected subject revision and enqueue required invalidation/rebuild work; changed-history recommendations are invalidated before command acknowledgement.
- For every retained fixture and mutation class, targeted rebuild output exactly equals a full rebuild for records, comparable exposures, exercise metrics, and affected period summaries.
- Calendar, history, correction, Removed sessions, and metric detail pass accessibility/adaptive checks; prior workout/library flows, migrations, diagnostics, native SQLite contracts, and clean builds remain green.

**UI hint**: yes

### Phase 4: Overall Progress and Complete Progression

**Goal**: The owner can understand period-based training evidence and decide every approved progression recommendation without opaque scores, inaccessible charts, or silent plan changes.
**Depends on**: Phase 3
**Requirements**: PROG-01, PROG-02, PROG-03, PROG-04, PROG-05, PROG-06, PROG-07, PROG-08, PROG-09, PROG-10, PROG-11
**Success Criteria** (what must be TRUE):

  1. Owner can view Overall Progress for 4 weeks, 12 weeks, and All time with scheduled opportunities completed, working sets, improving/holding/attention counts, recent metric-aware records, and one consistency trend—without aggregate kilogram volume or a global fitness/readiness score.
  2. Every progress summary, status row, and chart drills into its source sessions/exercises and has equivalent plain-language and accessible tabular output from the same query.
  3. Sparse or stale evidence displays Baseline, Hold, or Updating progress; Needs attention, Recent improvements, and searchable exercise progress use calm evidence-first language and never imply medical judgment.
  4. Owner receives reproducible versioned outcomes for complete weighted double progression and each approved plan-authored non-load policy, including missing/hard/failed effort, incomplete exposure, regression, equipment increments, assistance, duration, variation, distance/time, intervals, and manual unscored work.
  5. Owner can inspect evidence/current/proposed target/rule/confidence, then accept or reject; pending suggestions remain visible until decided, invalidated, or superseded, and no unaccepted or stale suggestion changes a target or overwrites a manual edit.

**Plans**: 8/8 implementation plans complete; automated source verification complete; physical verification deferred to final release gate

- [x] 04-01-PLAN.md
- [x] 04-02-PLAN.md
- [x] 04-03-PLAN.md
- [x] 04-04-PLAN.md
- [x] 04-05-PLAN.md
- [x] 04-06-PLAN.md
- [x] 04-07-PLAN.md
- [x] 04-08-PLAN.md

**Likely Plan Slices and Waves**:

- **Wave 1 — current projections and presentation**
  - [x] 04-01: Implement revision-aware 4-week/12-week/all-time period projections for opportunities, sets, status counts, records, and consistency with baseline/Hold/Updating freshness states and source drill-downs.
  - [x] 04-02: Deliver accessible Overall Progress, Needs attention, Recent improvements, searchable exercise progress, shared text/table/chart queries, period controls, and calm evidence-first states.
- **Wave 2 — complete deterministic policies**
  - [x] 04-03: Complete weighted double-progression fixtures for upper-bound completion, effort branches, incomplete exposure, regression, equipment increments, and warm-up/comparability exclusions.
  - [x] 04-04: Domain-review and implement only the approved plan-authored assistance, duration, variation, fixed-distance/time, and interval comparators; keep unscored work manual.
- **Wave 3 — recommendation lifecycle**
  - [x] 04-05: Implement stored versioned evidence and full pending/accepted/rejected/invalidated/superseded lifecycle with source target revisions and optimistic acceptance that cannot overwrite manual edits.
  - [x] 04-06: Integrate Today and Progress recommendation review, stale-projection behavior, diagnostics/rebuild proof, accessible analytics verification, performance checks, and Phase 4 gates.
- **Wave 4 — verification gap closure**
  - [x] 04-07: Add source-carrying Overall summary/status rows and accessible drill-downs for PROG-03.
- **Wave 5 — non-load outcome closure**
  - [x] 04-08: Deterministically expose reviewed non-load policy outcomes in Workout history without target mutation.

**Research Flags**:

- **Domain review required**: freeze a fixture-backed rule for each plan-authored assistance step, duration cap, variation, fixed-distance/time target, and interval protocol. Resistance evidence must not be generalized into cardio, injury, readiness, or medical advice.
- Period filters and drill-down navigation use the established projection/query architecture and need no broad exploratory research.

**Release / Verification Gate**:

- Every displayed summary and recommendation is reproducible from current source facts, stored evidence, subject/target revisions, and a named versioned rule.
- No pending, rejected, invalidated, superseded, stale, or otherwise unaccepted recommendation mutates a plan target; concurrent manual edits win safely.
- Sparse/incomplete/stale history produces explicit Baseline, Hold, manual, or Updating states rather than zero-valued analytics or false precision.
- Non-resistance progression remains explicitly plan-authored, unscored work remains manual, and every chart has equivalent text/table output with keyboard, 200% text, and non-color usability.
- Full regression keeps all prior phases buildable and usable, including migration fixtures, actual SQLite contracts, process-death, denied-notification, and deterministic rebuild suites.

**UI hint**: yes

### Phase 5: Recovery, Distribution, and Release

**Goal**: The owner can safely export and recover all user-owned data, and can install the exact signed, physically approved, accessible Android release bytes.
**Depends on**: Phase 4
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, REL-03, REL-04, REL-05, REL-06
**Success Criteria** (what must be TRUE):

  1. Owner can create a versioned logical backup of user-owned plans, exercises, sessions, corrections, void state, settings, and content references; the default password-protected archive exposes no workout payload or plaintext residue.
  2. Owner can authenticate, preview, and restore a valid backup into an independently clean install, after which bundled references reconcile and search/progress/history rebuild to the same usable state.
  3. Wrong password, tampering, unsupported version, oversized/malformed input, cancellation, validation failure, or insert failure leaves the existing database unchanged and shows a safe, actionable error.
  4. Owner can export a versioned, safely escaped CSV with stable columns, explicit units, locale-independent values, timestamps, set kinds, corrections, void state, recommendations, and decisions.
  5. On the signed release build, the complete app remains usable in airplane mode and passes System/Light/Dark, compact/medium/expanded, rotation, 200% text, keyboard/D-pad, logical focus, reduced motion, non-color, notification, process-death, performance, and post-implementation visual review; the public APK is byte-identical to the approved candidate.

**Plans**: 7 likely plans

- [x] 05-01-PLAN.md
- [x] 05-02-PLAN.md
- [x] 05-03-PLAN.md
- [x] 05-04-PLAN.md
- [x] 05-05-PLAN.md
- [x] 05-06-PLAN.md
- [x] 05-07-PLAN.md

**Likely Plan Slices and Waves**:

- **Wave 1 — freeze the security and release contracts**
  - [x] 05-01: Conduct the backup security review and freeze logical schema/version compatibility, authenticated header/AAD, Argon2id parameters, AES-256-GCM envelope, archive/compressed/decompressed/row/string/nesting/memory limits, cancellation, password UX, plaintext lifecycle, and frozen fixtures. (completed 2026-08-26)
  - [x] 05-02: Rehearse private signed candidate build-once, SHA-256/build metadata, artifact retention/download, protected physical-device approval/rejection, inner-file digest validation, and unchanged promotion before public release work. (completed 2026-08-26)
- **Wave 2 — portability paths**
  - [x] 05-03: Implement bounded logical backup collection, reviewed native Argon2id derivation, authenticated AES-256-GCM export, temporary-file cleanup, explicit sharing, known-answer/frozen-archive tests, and safe diagnostics. (completed 2026-08-26; native/device verification deferred to the final Phase 5 gate)
  - [x] 05-04: Implement restore preflight, authenticate/decrypt-before-parse, bounded validation, replacement preview, cancellation, and one serialized all-or-nothing user-owned replacement transaction. (completed 2026-08-26; native/device verification deferred to the final Phase 5 gate)
  - [x] 05-05: Reconcile bundled references after restore, rebuild FTS and all projections/recommendations, verify independently clean-install restore with Auto Backup controlled, and prove every failure mode mutates nothing.
  - [x] 05-06: Implement versioned CSV serialization, stable columns/order/units/timestamps/decimals, correction/void/recommendation fields, injection-safe escaping, deterministic filenames, and explicit sharing. (completed 2026-08-26; native/device verification deferred to the final Phase 5 gate)
- **Wave 3 — release closure**
  - [x] 05-07: Prepare the production-only candidate matrix, exact Phase 2–5 attended ledger/recorder, cross-run no-rebuild promotion, and single-command Terminal Seal handoff. (source/automation preparation completed 2026-08-26; one real signed candidate, automated/device/assistive/design observations, literal owner approval, promotion, and Terminal Seal remain pending)

**Research Flags**:

- **Deep security review**: native KDF implementation, envelope/AAD, whole-buffer AES-GCM resource ceiling, input bounds, password/key/plaintext lifetime, archive compatibility, cancellation, and atomic replacement.
- **Operational rehearsal**: protected environment, signing secret isolation, retention/download, candidate rejection, digest evidence, and unchanged promotion.
- **Physical/manual review**: keyboard/D-pad, logical focus, font scale, dynamic layouts, rotation, reduced motion, notification channel behavior, real process death/reboot wording, minimum-device performance, and visual comparison with approved references.

**Release / Verification Gate**:

- Argon2id and AES-GCM known-answer tests, frozen archive compatibility, nonce uniqueness, calibrated minimum-device budgets, bounds, cleanup, and privacy-safe diagnostics pass through the audited native path.
- Wrong-password, tampered, unsupported, oversized, malformed, cancelled, validation-failed, and insert-failed restores leave the pre-existing database byte-for-logical-state unchanged; valid restore succeeds on an independently clean install with Auto Backup/D2D contamination excluded.
- Restore rebuilds FTS, records, comparable exposures, period progress, and recommendations deterministically; CSV fixtures prove stable versioned columns, units, decimals, timestamps, corrections/voids, and escaping.
- The exact signed candidates pass retained-schema migration, airplane-mode workout, notification denied/late/granted, `killApp`, rotation, clean restore, adaptive widths, System/Light/Dark, 200% text, keyboard/D-pad, logical focus, reduced motion, performance, and post-implementation design-review gates.
- Public promotion verifies that the GitHub Release APK/AAB SHA-256 values exactly match the privately retained, physically approved candidates; release is blocked on any failed gate and never rebuilds approved bytes.

**UI hint**: yes

## Coverage

| Phase | Requirement Count | Requirement Families |
|-------|-------------------|----------------------|
| 1. Trustworthy Workout Loop | 29 | FOUND-01..09, WORK-01..18, REL-01..02 |
| 2. Owned Library and Planning | 12 | LIB-01..12 |
| 3. Calendar and History Integrity | 9 | HIST-01..09 |
| 4. Overall Progress and Complete Progression | 11 | PROG-01..11 |
| 5. Recovery, Distribution, and Release | 11 | DATA-01..07, REL-03..06 |
| 6. Material 3 UX Remediation | 10 | UX-01..10 |
| **Total** | **82** | **82/82 mapped exactly once** |

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 source/release preparation → Phase 6 remediation → Phase 5 final promotion gate

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Trustworthy Workout Loop | 10/10 | Complete    | 2026-08-17 |
| 2. Owned Library and Planning | 34/34 live; 1 superseded | Implementation verified; release gate in 05-07 | 2026-08-26 |
| 3. Calendar and History Integrity | 5/5 | Implementation verified; release gate in 05-07 | 2026-08-25 |
| 4. Overall Progress and Complete Progression | 8/8 | Implementation verified; release gate in 05-07 | 2026-08-26 |
| 5. Recovery, Distribution, and Release | 7/7 | In Progress|  |
| 6. Material 3 UX Remediation | 0/0 | Not planned |  |

### Phase 6: Material 3 UX Remediation

**Goal:** The owner can use a coherent Material 3 Android interface across Library, Calendar, plan editing, Progress, Today, and shared navigation, with every exact-candidate audit blocker fixed without changing authoritative workout or portability semantics.
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10
**Depends on:** Phase 5
**Success Criteria** (what must be TRUE):

  1. Library filtering is visibly responsive in light/dark, uses M3 filter chips with Favorite directly accessible, uses shared M3 Search, supports pull-to-refresh, shows filled-green selected stars, and keeps provenance out of browse rows.
  2. Root Calendar and every date picker render complete six-row grids with adjacent-month dates, support horizontal month swipes plus accessible button alternatives, and retain exact LocalDate/bounds/timezone behavior.
  3. Plan day/exercise rows support continuous touch-and-hold reordering, explicit accessible up/down fallbacks, a compact one-row hierarchy at normal text scale, and legible adaptation at 200% text.
  4. Root navigation remains usable at 200% text, Today has one unambiguous path to secondary tools/settings, and Progress loads or recovers through Retry on the production runtime.
  5. Focused regression tests, full project gates, clean Android generation/build, emulator verification, and Samsung touch/accessibility review pass against one replacement APK; release approval and promotion remain separate explicit actions.
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 6 to break down)
