# Roadmap: Gym Tracker

## Milestones

- **v1.0 Personal-use Gym Tracker** — Phases 1-7 (shipped 2026-09-14)
- **v1.1 In-Workout Editing, Advanced Timing & Drive Backup** — Phases 8-12 (shipped 2026-10-01)
- **v1.2 Prototype Parity, Concurrent Plans & Garmin Import** — Phases 13-20 (planning; implementation requires later owner authorization)

## Milestone Outcome

Reproduce the owner-approved Revision 18 prototype in the Android application while preserving SQLite authority, commit-gated workout behavior, immutable history, offline operation, recovery, backup/merge, accessibility, and performance. Strength and Running plans coexist through real domain contracts; Garmin supplies imported Running facts rather than an in-app recorder.

**Planning gate:** This roadmap authorizes planning only. Every phase must be discussed, UI-heavy phases must receive a UI specification, executable plans must pass checks and review convergence, and the complete milestone must stop for owner review before any implementation, build, device mutation, release, or deployment.

## Phases

<details>
<summary>v1.0 Personal-use Gym Tracker (Phases 1-7) — SHIPPED 2026-09-14</summary>

Archived detail: .planning/milestones/v1.0-ROADMAP.md

- [x] Phase 1: Trustworthy Workout Loop
- [x] Phase 2: Owned Library and Planning
- [x] Phase 3: Calendar and History Integrity
- [x] Phase 4: Overall Progress and Complete Progression
- [x] Phase 5: Recovery, Distribution, and Release
- [x] Phase 6: Material 3 UX Remediation
- [x] Phase 7: Post-Candidate UX Refinement

</details>

<details>
<summary>v1.1 In-Workout Editing, Advanced Timing & Drive Backup (Phases 8-12) — SHIPPED 2026-10-01</summary>

Archived detail: .planning/milestones/v1.1-ROADMAP.md

- [x] Phase 8: Session Overview & Navigation
- [x] Phase 9: In-Workout Exercise Editing
- [x] Phase 10: Advanced Set Timing
- [x] Phase 11: Portable History & Merge Restore
- [x] Phase 12: Automatic Google Drive Backup & Replacement Restore

</details>

### v1.2 Prototype Parity, Concurrent Plans & Garmin Import — PLANNED

- [x] **Phase 13: One-per-Sport Plan & Running Foundation** - Establish authoritative zero/one-per-sport activation, Running-session, import, matching, portability, and history contracts. (completed 2026-10-08)
- [ ] **Phase 14: Prototype Visual Shell** - Establish the approved four-root visual, navigation, appearance, overlay, startup, and settings system.
- [ ] **Phase 15: Workout Parity** - Deliver the approved Workout and Active Workout experience without weakening offline or commit-gated behavior.
- [ ] **Phase 16: Calendar Parity** - Deliver the full-height interactive Calendar and read-only historical detail flow using the Phase 15 presentation contract.
- [ ] **Phase 17: Library & Running Plans** - Deliver complete Library parity plus persistent structured Running-plan creation, editing, scheduling, and collision decisions.
- [ ] **Phase 18: Garmin Account Sync** - Deliver the selected standalone ARM64 embedded-client sync, factual activity detail, deduplication, recovery, and confirmed matching.
- [ ] **Phase 19: Progress Parity** - Deliver factual Strength and Running progress, goals, recommendations, and optional bodyweight views from durable evidence.
- [ ] **Phase 20: Native Acceptance** - Demonstrate cross-phase native fidelity, accessibility, recovery, integrity, and performance before later release authorization.

**Coverage:** 172/172 v1.2 requirements mapped exactly once: DOM 17; SHL 13; WRK 36; CAL 23; LIB 36; GAR 16; PRO 18; VER 13.

## Dependency Rationale

- Phase 13 precedes every domain consumer because the shipped singleton plan model cannot safely support the approved screens, schedules, imports, matches, or recovery graph.
- Phase 14 precedes all feature UI phases so typography, color, four-root navigation, sheets, toasts, appearance, focus, and retained settings behavior are shared rather than reimplemented.
- Phase 15 precedes Phase 16 because Calendar reuses the Active-shaped workout presentation through a strictly read-only capability boundary. Phase 16's implementation/final routing closure also waits for Phases 17-18 so real Running-plan and Garmin destinations exist; phase numbers preserve review grouping rather than mandatory execution order.
- Phase 17 follows Phase 15 so Library restyling consumes the completed TIM-01 authoring cut and cannot reintroduce retired plan-editor controls; it then precedes Phase 18 because imported activities can only be matched against persisted, stable Running plans, session revisions, schedule versions, and ordered occurrence identities.
- Phase 18 precedes Phase 19 so Running progress is computed from actual imported evidence rather than prototype fixtures or inferred values.
- Phase 20 depends on Phases 13-19 and integrates their evidence; it is not the first phase in which transaction, migration, accessibility, or lifecycle behavior is tested.

## Final Owner Decisions and Transport Selection

The 2026-10-07 owner amendment in `.planning/v1.2-OWNER-DECISIONS.md`
supersedes prior open-decision and transport-comparison text. There are 0 pending
product decisions. Native proof remains implementation evidence and cannot
silently select a different transport.

1. **MAP-01 approved:** One active plan per sport. Do not re-ask the cardinality question.
2. **Garmin transport selected:** Bundle Python 3.13 through Chaquopy 17.0 with pinned python-garminconnect 0.3.17 commit `218e72ca5459e014435fc2d94fd18bd601fa0c14`; use ARM64 activity summary/splits/detail JSON. No program access, partner API/broker, desktop/Drive bridge, FIT decoder/manual FIT prerequisite, runtime AI agent, or Hermes change belongs to this milestone.
3. **TIM-01 approved:** Retire cadence/cluster authoring, reconciliation, callbacks and playback; no legacy playback compatibility mode. Ordinary workout history and between-set rest still require preservation.
4. **DEV-01/DEV-02 approved:** Use adaptive narrow Calendar padding and Light title `#9B470B`; verify the chosen behavior during implementation without reopening owner approval.
5. **Running same-day sessions:** This is settled scope, not a gate: one Running plan supports multiple stable, ordered session slots on the same weekday. No phase may introduce a silent one-session-per-day restriction.

## Phase Details

### Phase 13: One-per-Sport Plan & Running Foundation

**Goal**: The owner can safely keep Strength and Running plans, structured Running sessions, imported activity evidence, and historical data in one authoritative, recoverable local model.
**Depends on**: Phase 12 (shipped v1.1 recovery and automatic-backup foundation)
**Directory**: .planning/phases/13-multi-plan-running-foundation
**Requirements**: DOM-01, DOM-02, DOM-03, DOM-04, DOM-05, DOM-06, DOM-07, DOM-08, DOM-09, DOM-10, DOM-11, DOM-12, DOM-13, DOM-14, DOM-15, DOM-16, DOM-17
**Rationale**: Every v1.2 surface depends on replacing the shipped global active-plan assumptions with explicit plan, schedule, occurrence, source, and revision identities before presentation can be truthful.
**Canonical refs**: [Owner brief](v1.2-OWNER-BRIEF.md); [requirements](REQUIREMENTS.md); [research synthesis](research/v1.2/SUMMARY.md); [multi-plan ADR](architecture/v1.2-multi-active-plans.md); [migration risks](architecture/v1.2-migration-risks.md); [Garmin import ADR](architecture/v1.2-garmin-import.md)
**Success Criteria** (what must be TRUE):

  1. The owner can keep zero or one active Strength plan and zero or one active Running plan together; changing or consuming one schedule does not silently change the other, and repository/schema constraints enforce per-sport uniqueness.
  2. New, copied, imported, or edited plans remain inactive until the owner explicitly activates them, while upgraded v1.1 plans, recoverable workouts, completed history, revisions, and stable identities remain intact.
  3. A Running plan can persist all seven approved session types, advisory pace/HR-zone/RPE targets, and multiple stable ordered session slots on the same weekday across restart, backup, restore, and merge.
  4. Overlapping occurrences remain separately identifiable; Move run, Move strength, Keep both, workout selection, and activity matching affect only the explicitly selected occurrence and never rewrite history.
  5. Imported activities, matches, goals, and optional bodyweight survive idempotent replay and portability, while workout edits/completion remain offline and are acknowledged only after the exclusive transaction commits.

**Plans**: 15/16 plans executed

- [x] 13-01-PLAN.md
- [x] 13-02-PLAN.md
- [x] 13-03-PLAN.md
- [x] 13-04-PLAN.md
- [x] 13-05-PLAN.md
- [x] 13-06-PLAN.md
- [x] 13-07-PLAN.md
- [x] 13-08-PLAN.md
- [x] 13-09-PLAN.md
- [x] 13-10-PLAN.md
- [x] 13-11-PLAN.md
- [x] 13-12-PLAN.md
- [x] 13-13-PLAN.md
- [x] 13-14-PLAN.md
- [x] 13-15-PLAN.md
- [x] 13-16-PLAN.md

**Plan flags**: research required; migration and portability plan required; plan check required; fresh review convergence required; MAP-01 and TIM-01 are locked, not checkpoints

### Phase 14: Prototype Visual Shell

**Goal**: The owner experiences one coherent Revision 18 visual and navigation system across the four roots, deep routes, settings, recovery surfaces, and appearance modes.
**Depends on**: Phase 13
**Directory**: .planning/phases/14-prototype-visual-shell
**Requirements**: SHL-01, SHL-02, SHL-03, SHL-04, SHL-05, SHL-06, SHL-07, SHL-08, SHL-09, SHL-10, SHL-11, SHL-12, SHL-13
**Rationale**: Workout, Calendar, Library, Garmin, and Progress need the same tokens, typography, navigation, overlays, focus behavior, and retained settings routes before feature parity work branches out.
**Canonical refs**: [Owner brief](v1.2-OWNER-BRIEF.md); [source precedence](design/v1.2-SOURCE-PRECEDENCE.md); Revision 18 approved.json and approved-hybrid.html; [research synthesis](research/v1.2/SUMMARY.md); [deviation register](design/v1.2-DEVIATIONS.md)
**Success Criteria** (what must be TRUE):

  1. The owner navigates exactly Workout, Calendar, Library, and Progress through the approved bottom composition at every supported width, with selected state, destination state, deep-route exit, and focus preserved.
  2. Light, Dark, and System appearance choices persist and stay synchronized across roots, Active Workout, sheets, and dialogs using the approved typography, colors, spacing, borders, and density; GAR-16 owns the same behavior on the later Garmin route.
  3. Contextual sheets, dialogs, and top toasts match the approved hierarchy, remain keyboard-safe, restore focus correctly, announce status accessibly, and never obstruct the workout command/rest dock.
  4. Startup exposes truthful loading, trusted, failure/retry, notification-permission, and continue-without-alerts states without moving authority away from SQLite.
  5. Rest alerts, removed sessions, manual recovery/merge, automatic backup, CSV export, privacy, and their empty/busy/failure/retry states remain reachable through Settings after the shell changes.

**Plans**: 12/12 plans executed

- [x] 14-01-PLAN.md
- [x] 14-02-PLAN.md
- [x] 14-03-PLAN.md
- [x] 14-04-PLAN.md
- [x] 14-05-PLAN.md
- [x] 14-06-PLAN.md
- [x] 14-07-PLAN.md
- [x] 14-08-PLAN.md
- [x] 14-09-PLAN.md
- [x] 14-10-PLAN.md
- [x] 14-11-PLAN.md
- [x] 14-12-PLAN.md

**UI hint**: yes
**Plan flags**: focused research; UI specification required; plan check required; fresh review convergence required; DEV-02 is accepted with native verification pending implementation

### Phase 15: Workout Parity

**Goal**: The owner can orient, start, resume, edit, complete, recover, and finish a Strength workout through the approved scan-first experience without losing any committed fact or offline guarantee.
**Depends on**: Phase 13, Phase 14
**Directory**: .planning/phases/15-workout-parity
**Requirements**: WRK-01, WRK-02, WRK-03, WRK-04, WRK-05, WRK-06, WRK-07, WRK-08, WRK-09, WRK-10, WRK-11, WRK-12, WRK-13, WRK-14, WRK-15, WRK-16, WRK-17, WRK-18, WRK-19, WRK-20, WRK-21, WRK-22, WRK-23, WRK-24, WRK-25, WRK-26, WRK-27, WRK-28, WRK-29, WRK-30, WRK-31, WRK-32, WRK-33, WRK-34, WRK-35, WRK-36
**Rationale**: The offline workout loop is the product's critical path and must reach parity on top of stable multi-plan contracts before Calendar safely reuses its presentation for history.
**Canonical refs**: [Owner brief](v1.2-OWNER-BRIEF.md); Revision 18 approved.json and approved-hybrid.html; [source precedence](design/v1.2-SOURCE-PRECEDENCE.md); [research synthesis](research/v1.2/SUMMARY.md); [multi-plan ADR timing-retirement contract](architecture/v1.2-multi-active-plans.md)
**Success Criteria** (what must be TRUE):

  1. Workout immediately shows the selected real plan/day identity, summary, full exercise preview, truthful scheduled/rest/no-plan state, and Start or exact Resume action; changing a preview never advances a schedule.
  2. Active Workout presents every exercise in one scrollable scan-first list with W1/W2 and 01/02 ordering, one active-exercise edge, distinct current/completed/planned row states, separate trend/menu targets, and no second current stripe.
  3. Tapping a set opens the compatible editor for every shipped metric profile; Save is explicit, failed or duplicate completion never shows false success, and a committed final set collapses the exercise and advances focus only after the transaction completes.
  4. The full-width rest dock, countdown, pause/resume, ±15, skip, device-owned cues, and next-set context recover correctly across backgrounding, process death, and offline restart without completing a set.
  5. Add/replace/delete/reorder, Undo recovery, trend, flat second-based timing, finish/partial/later/discard, completion review, and explicit plan write-back preserve protected history and expose actionable retry states.

**Plans**: 13/13 plans executed

- [x] 15-01-PLAN.md
- [x] 15-02-PLAN.md
- [x] 15-03-PLAN.md
- [x] 15-04-PLAN.md
- [x] 15-05-PLAN.md
- [x] 15-06-PLAN.md
- [x] 15-07-PLAN.md
- [x] 15-08-PLAN.md
- [x] 15-09-PLAN.md
- [x] 15-10-PLAN.md
- [x] 15-11-PLAN.md
- [x] 15-12-PLAN.md
- [x] 15-13-PLAN.md

**UI hint**: yes
**Plan flags**: focused legacy-timing cutover proof; UI specification required; plan check required; fresh review convergence required; TIM-01 retirement is locked with no compatibility mode

### Phase 16: Calendar Parity

**Goal**: The owner can understand and navigate real Strength and Running intent/history through the approved spatial Calendar, then inspect workout history without Calendar gaining mutation authority.
**Depends on**: Phase 13, Phase 14, Phase 15, Phase 17, Phase 18
**Directory**: .planning/phases/16-calendar-parity
**Requirements**: CAL-01, CAL-02, CAL-03, CAL-04, CAL-05, CAL-06, CAL-07, CAL-08, CAL-09, CAL-10, CAL-11, CAL-12, CAL-13, CAL-14, CAL-15, CAL-16, CAL-17, CAL-18, CAL-19, CAL-20, CAL-21, CAL-22, CAL-23
**Rationale**: Calendar depends on real multi-source events and reuses Phase 15's Active-shaped content, but its own read-only boundary, native gestures, measured row transitions, and return context form a coherent user capability.
**Canonical refs**: [Owner brief](v1.2-OWNER-BRIEF.md); Revision 18 approved.json and approved-hybrid.html; [source precedence](design/v1.2-SOURCE-PRECEDENCE.md); [research synthesis](research/v1.2/SUMMARY.md); [deviation register](design/v1.2-DEVIATIONS.md); [native verification matrix](verification/v1.2-native-verification-matrix.md)
**Success Criteria** (what must be TRUE):

  1. Calendar fills the space above navigation with a Monday-first month, stable date/event tracks, up to two titled events per date, persistent month controls, and an Info-before-Settings key that separates sport from status without relying on color alone.
  2. Previous/current/next panels follow horizontal input one-to-one, the title changes at the 25% distance boundary, crossing back or cancelling reverts immediately, short fast drags snap back, and vertical intent continues to scroll normally.
  3. Selecting a date moves the selected row to the top and following row to the bottom, collapse reverses to measured positions, and adjacent-week selection performs collapse → select/focus → expand with identical semantics under reduced motion.
  4. Each agenda event is one accessible full-width target and routes by real identity: Strength history to read-only Active-shaped detail, planned Strength to occurrence preview, planned Running to its plan, and imported Running to Garmin detail.
  5. Back restores the expanded date/week and trigger focus; loading, empty, stale/error, and retry states never invent sessions, while correction, resume, revision history, and removal remain available only in their separate management contexts.

**Plans**: 7 plans

Plans:

- [ ] 16-01-PLAN.md — Preflight upstream capabilities, prove the semantic transition controller, and implement accepted DEV-01/DEV-02 contracts.
- [ ] 16-02-PLAN.md — Build the source-backed full-height month grid, Calendar key, encodings, focus, and query states.
- [ ] 16-03-PLAN.md — Build capability-safe workout history and planned Strength preview while preserving management routes.
- [ ] 16-04-PLAN.md — Implement UI-thread 1:1 month drag and measured expand/collapse/adjacent motion.
- [ ] 16-05-PLAN.md — Complete compact agenda routing and Calendar-owned Back/scroll/focus restoration.
- [ ] 16-06-PLAN.md — Capture diagnostic native geometry and mapped Revision 18 overlay/difference artifacts.
- [ ] 16-07-PLAN.md — Integrate real Phase 17/18 destinations, seal evidence, and hand performance diagnostics to Phase 20.

**UI hint**: yes
**Plan flags**: research required; UI specification required; plan check required; fresh review convergence required; DEV-01 and DEV-02 are accepted with native evidence pending

### Phase 17: Library & Running Plans

**Goal**: The owner can browse and maintain the complete plan/exercise library and create, edit, schedule, and explicitly activate persistent structured Running plans.
**Depends on**: Phase 13, Phase 14, Phase 15
**Directory**: .planning/phases/17-library-running-plans
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04, LIB-05, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-11, LIB-12, LIB-13, LIB-14, LIB-15, LIB-16, LIB-17, LIB-18, LIB-19, LIB-20, LIB-21, LIB-22, LIB-23, LIB-24, LIB-25, LIB-26, LIB-27, LIB-28, LIB-29, LIB-30, LIB-31, LIB-32, LIB-33, LIB-34, LIB-35, LIB-36
**Rationale**: Authoring consumes Phase 13's durable identities, Phase 14's shared controls, and Phase 15's completed timing-authoring retirement; completing it before Garmin ensures every match candidate refers to a real versioned Running plan and occurrence without reintroducing cadence/cluster controls.
**Canonical refs**: [Owner brief](v1.2-OWNER-BRIEF.md); Revision 18 approved.json and approved-hybrid.html; [source precedence](design/v1.2-SOURCE-PRECEDENCE.md); [research synthesis](research/v1.2/SUMMARY.md); [multi-plan ADR](architecture/v1.2-multi-active-plans.md)
**Success Criteria** (what must be TRUE):

  1. Plans and Exercises retain independent search, filters, favorites, scroll/detail-return state, grouped active/inactive/starter identity, and truthful loading, empty, no-match, update, failure, and retry states.
  2. Every Create plan entry—including a truly empty Plans view—opens the same neutral Strength/Running chooser, and saving, copying, or importing never activates a plan without a separate explicit confirmation.
  3. Owned, starter, schedule, replacement/removal-impact, custom exercise, metric-migration, duplicate, archive, and reactivate routes preserve drafts, revisions, effective dates, active-workout guards, and immutable completed history.
  4. The owner can create and edit goals plus Recovery, Long run, Progression, Tempo, Intervals, Hills, and Fartlek sessions with their approved common/type-specific fields, validation, stable identities, deletion, and ordering.
  5. A saved Running plan can remain truly empty or contain multiple stable ordered sessions on the same weekday after reopen; future Move run, Move strength, and Keep both decisions persist only after explicit review and confirmation.

**Plans**: 11/14 plans executed

- [x] 17-01-PLAN.md
- [x] 17-02-PLAN.md
- [x] 17-03-PLAN.md
- [x] 17-04-PLAN.md
- [x] 17-05-PLAN.md
- [x] 17-06-PLAN.md
- [x] 17-07-PLAN.md
- [x] 17-08-PLAN.md
- [x] 17-09-PLAN.md
- [x] 17-10-PLAN.md
- [x] 17-11-PLAN.md
- [ ] 17-12-PLAN.md
- [ ] 17-13-PLAN.md
- [ ] 17-14-PLAN.md

**UI hint**: yes
**Plan flags**: focused research only; UI specification required; plan check required; review convergence required; no one-session-per-day restriction permitted

### Phase 18: Garmin Account Sync

**Goal**: The owner can sign in to Garmin from a standalone ARM64 Android app, sync validated activity summary/splits/detail JSON, inspect truthful outdoor or treadmill details, and explicitly match one activity to one scheduled Running occurrence.
**Depends on**: Phase 13, Phase 14, Phase 17
**Directory**: .planning/phases/18-garmin-import
**Requirements**: GAR-01, GAR-02, GAR-03, GAR-04, GAR-05, GAR-06, GAR-07, GAR-08, GAR-09, GAR-10, GAR-11, GAR-12, GAR-13, GAR-14, GAR-15, GAR-16
**Rationale**: The owner selected a pinned embedded Python client that needs no Garmin program access, partner broker, desktop bridge, manual FIT path or runtime agent. Phase 18 must prove packaging, authenticated reads, secure session recovery, bounded JSON normalization and idempotent writes before Progress consumes those facts.
**Canonical refs**: [Owner brief](v1.2-OWNER-BRIEF.md); Revision 18 approved.json and approved-hybrid.html; [research synthesis](research/v1.2/SUMMARY.md); [Garmin import ADR](architecture/v1.2-garmin-import.md); [migration risks](architecture/v1.2-migration-risks.md); [native verification matrix](verification/v1.2-native-verification-matrix.md)
**Success Criteria** (what must be TRUE):

  1. Garmin opens contextually from Workout, a Running plan, or an imported Calendar activity while the app retains exactly four roots and synchronized Light/Dark/System appearance.
  2. The bundled Python 3.13/Chaquopy 17.0 module pins python-garminconnect 0.3.17 commit `218e72ca5459e014435fc2d94fd18bd601fa0c14`, exposes only login/MFA/logout and paged Running summary/activity/splits/detail reads, and runs blocking work off the UI thread without a Python subprocess, local server, on-device pip or downloaded scripts.
  3. Credentials and MFA remain foreground interactions; encrypted DI tokens stay outside logical backups and diagnostics. Fresh and expired sessions recover truthfully across cold restart, while disconnect invalidates in-flight work and preserves imported history.
  4. Outdoor detail shows only available elapsed/moving, distance, pace, route, heart-rate, and lap evidence; treadmill explicitly shows No route; the accessible lap table uses Lap, Time, and Pace with honest missing values.
  5. Matching shows stable candidates and writes only the explicitly selected occurrence after Confirm; Back/Leave unmatched writes nothing. Real account packaging/login/MFA/read/restart proof is required implementation evidence, not a product-decision or alternate-transport gate.

**Plans**: 14 plans
**UI hint**: yes
**Plan flags**: research complete; UI specification required; embedded-client security review required; plan check required; fresh review convergence required; no alternate transport fallback

### Phase 19: Progress Parity

**Goal**: The owner can understand factual Strength and imported Running progress, goals, gaps, and recommendations without invented evidence or silent target changes.
**Depends on**: Phase 13, Phase 14, Phase 17, Phase 18
**Directory**: .planning/phases/19-progress-parity
**Requirements**: PRO-01, PRO-02, PRO-03, PRO-04, PRO-05, PRO-06, PRO-07, PRO-08, PRO-09, PRO-10, PRO-11, PRO-12, PRO-13, PRO-14, PRO-15, PRO-16, PRO-17, PRO-18
**Rationale**: Running progress is only trustworthy after persistent goals and real imported activity evidence exist; Strength and recommendation behavior must continue to use comparable effective history.
**Canonical refs**: [Owner brief](v1.2-OWNER-BRIEF.md); Revision 18 approved.json and approved-hybrid.html; [research synthesis](research/v1.2/SUMMARY.md); [Garmin import ADR](architecture/v1.2-garmin-import.md); [native verification matrix](verification/v1.2-native-verification-matrix.md)
**Success Criteria** (what must be TRUE):

  1. All, Strength, and Running tabs plus 4 weeks, 12 weeks, and All time preserve selected state and show only comparable durable source facts.
  2. Strength and Running views show factual latest, best, target, gap, goal line, evidence, and planned-next context; 2.4 km remains 11:00 with the approved splits, while 10 km and Half Marathon stay visibly unset until chosen.
  3. Loading, empty, one-effort/More data needed, missing-import, stale/rebuilding, error, and retry states remain honest and retain the selected sport/range without plotting missing evidence as zero.
  4. Target editing and recommendation review preserve draft values on validation/save failure and persist Keep current or Use target exactly once with revision checks and no fixture-driven reappearance.
  5. Optional dated bodyweight can be added, edited, and explicitly deleted for disclosed relative-load views only; it never collects gender/height, creates a fitness score, or changes workout targets.

**Plans**: 10 plans
**UI hint**: yes
**Plan flags**: focused metrics research; UI specification required; plan check required; review convergence required

### Phase 20: Native Acceptance

**Goal**: The owner has source-bound native evidence that the complete v1.2 system matches the approved prototype and preserves data, accessibility, recovery, offline, and performance contracts before any release decision.
**Depends on**: Phase 13, Phase 14, Phase 15, Phase 16, Phase 17, Phase 18, Phase 19
**Directory**: .planning/phases/20-native-acceptance
**Requirements**: VER-01, VER-02, VER-03, VER-04, VER-05, VER-06, VER-07, VER-08, VER-09, VER-10, VER-11, VER-12, VER-13
**Rationale**: Cross-surface fidelity and end-to-end migration/recovery proof require the completed system, while every earlier phase still owns its own component, domain, SQLite, accessibility, and lifecycle checks.
**Canonical refs**: [Owner brief](v1.2-OWNER-BRIEF.md); [prototype parity matrix](design/v1.2-prototype-parity-matrix.md); [native verification matrix](verification/v1.2-native-verification-matrix.md); [deviation register](design/v1.2-DEVIATIONS.md); [research synthesis](research/v1.2/SUMMARY.md); Revision 18 approved.json and approved-hybrid.html
**Success Criteria** (what must be TRUE):

  1. Every inventory route, interaction, state, and requirement has source-bound native evidence or a reviewed N/A reason, with no unmapped parity row and no unexplained deviation from Revision 18.
  2. The complete app is usable in Light, Dark, and System at all required portrait/landscape sizes, 200% text, minimum 48dp targets, keyboard/D-pad, visible focus, Back/Escape, and reduced motion without losing required actions or changing the four-root composition.
  3. Real SQLite upgrade, restore, merge, historical-revision, offline workout, process-death, Garmin JSON dedupe, encrypted session restart, and explicit matching journeys preserve committed facts and distinguish committed from uncommitted work.
  4. Native Calendar drag/threshold/morph behavior and representative launch, root switch, set commit, editor, search, Calendar, Progress, import, backup, and merge workloads meet their reviewed numeric budgets with raw evidence retained.
  5. An attended Samsung review records visual, usability, accessibility, and interaction observations separately from automated proof, and signed personal-use release verification is prepared without treating either as release authorization.

**Plans**: 12 plans
**UI hint**: yes
**Plan flags**: focused verification research; parity ledger and UI review required; plan check required; fresh review convergence required; depends on all prior phases; DEV-01/02 are accepted and Garmin native proof remains pending implementation

## Progress

**Execution DAG:** 13 → 14 → 15 → 17 → 18 → {16,19} → 20. Dependencies above are authoritative; no implementation starts until the owner approves the completed planning set.

| Phase | Directory | Plans Complete | Status | Completed |
|---|---|---:|---|---|
| 13. One-per-Sport Plan & Running Foundation | 13-multi-plan-running-foundation | 16/16 | Complete    | 2026-10-08 |
| 14. Prototype Visual Shell | 14-prototype-visual-shell | 12/12 | In Progress|  |
| 15. Workout Parity | 15-workout-parity | 13/13 | In Progress|  |
| 16. Calendar Parity | 16-calendar-parity | 0/7 | Not started | - |
| 17. Library & Running Plans | 17-library-running-plans | 11/14 | In Progress|  |
| 18. Garmin Account Sync | 18-garmin-import | 0/14 | Not started | - |
| 19. Progress Parity | 19-progress-parity | 0/10 | Not started | - |
| 20. Native Acceptance | 20-native-acceptance | 0/12 | Not started | - |

## Backlog

- V2-01: Wear OS.
- V2-02: Health Connect import/export.
- V2-05: Public GitHub Release or store promotion ceremony.
