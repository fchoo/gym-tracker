# Gym Tracker

## What This Is

Gym Tracker is an Android-first personal workout planner and logger for one owner. It combines a calendar, plan and exercise library, one-tap guided workouts, recoverable rest timing, metric-aware history, and explainable progression recommendations in an offline-first Expo application.

The app should feel like a quiet training instrument. It should be faster and clearer than a spreadsheet or generic tracker without pretending to be a human coach.

## Core Value

Open today's workout, see trustworthy next targets, complete each working set with one primary action, recover safely from interruption, and understand exactly why the next target is recommended.

## Requirements

### Validated

- ✓ Offline Android workout critical path with no account or network requirement — Phase 1
- ✓ Today, Calendar, Library, and Progress root shell with focused workouts outside root navigation — Phase 1
- ✓ Full Body Foundation activation as a user-owned copy with scheduled, alternate, rest-day, and empty starts — Phase 1
- ✓ Inline warm-up and working-set values, compact Complete/Skip actions, commit-gated Retry, eight-second Undo, and recoverable rest — Phase 1
- ✓ SQLite-authoritative writes, migrations, durable effects, notification repair, and process-death recovery — Phase 1
- ✓ Factual completion/detail plus one evidence-backed, explicitly accepted double-progression path — Phase 1
- ✓ System/Light/Dark, compact/medium/expanded layouts, 200% text, keyboard/D-pad, visible focus, reduced motion, and non-color cues — Phase 1
- ✓ Reproducible Expo CNG development-test APK with exact-byte native, E2E, performance, Argon2, and Samsung physical approval — Phase 1
- ✓ Calendar, effective metric history, auditable corrections, reversible session removal, and deterministic history rebuilds — Phase 3 automated source evidence; final physical verification deferred

### Active

- [ ] Combine plans and exercises in Library while preserving their distinct jobs.
- [ ] Provide a reviewed built-in exercise catalog with type, muscle, equipment, metric profile, source revision, and attribution.
- [ ] Allow custom exercises and user-owned copies of immutable starter plans.
- [ ] Provide six original starter-plan templates, including an equipment-heavy weekday body-part split, with safe schedule behavior.
- [ ] Provide period-based Overall Progress and explainable, explicitly accepted progression recommendations.
- [ ] Support backup, restore, CSV export, and privacy-safe diagnostics.
- [ ] Produce verified signed Android artifacts through a protected candidate-to-release workflow.

### Out of Scope

- Accounts and cloud synchronization — v1 is single-user and local-first.
- Social profiles, plan sharing, leaderboards, and community features — not part of the personal-use goal.
- Wear OS — defer until the phone workout loop is proven.
- Health Connect — defer until the local session model has real usage history.
- Camera form analysis and generative coaching — outside the trust and complexity boundary.
- Nutrition, body measurements, and recovery scoring — unrelated to the workout-tracking core.
- Per-repetition or cluster-set timers — specialized mode deferred from v1.
- Exercise media without independently verified licensing and attribution.
- Screen-reader and switch-scanning assistive technology support — TalkBack and Samsung Universal/Switch Access are not required for this personal-use v1; existing semantic labels remain, while keyboard/D-pad stays release-gated.
- Marketing site and app-store listing art — implementation and release follow-up.

## Context

- The owner requested a personal Android gym tracker and intends to use it during real workouts.
- The differentiator is one-tap, explainable next-set guidance rather than a larger catalog of generic fitness features.
- Plan-aware exercise history belongs on Today; Progress is overall and period-based.
- The visual direction is a card-light precision instrument using Source Sans 3, IBM Plex Mono numerals, semantic colors, and explicit light/dark tokens.
- The design and engineering plan passed interactive GStack reviews with no unresolved decisions.
- Approved design references:
  - `~/.gstack/projects/gym_tracker/designs/approved-20260815/core-workout-flow.png`
  - `~/.gstack/projects/gym_tracker/designs/system-review-20260815/app-system-reference.png`
- Source contract:
  - `~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md`
- QA contract:
  - `~/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md`

## Constraints

- **Platform**: Android is the first release target; architecture remains portable to iOS.
- **Stack**: Expo, TypeScript strict mode, Expo Router, SQLite, notifications, haptics, file sharing, and reviewed native crypto where required.
- **Source of truth**: SQLite source facts are authoritative; notifications, projections, recommendations, and UI query caches are replayable or rebuildable derivatives.
- **Persistence**: Multi-statement writes use repository-owned exclusive transactions; screens never execute SQL.
- **Offline**: Starting, completing, resuming, and reviewing a workout works in airplane mode.
- **Security**: Backup archives use integrity protection and password encryption by default; secrets and workout payloads never enter diagnostics.
- **Performance**: Working-set commit and dock transition p95 is at most 150 ms on the minimum supported Android profile.
- **Testing**: Integrity-critical domain and application code requires complete branch coverage, real SQLite contract tests, and Android E2E for lifecycle behavior.
- **Distribution**: Expo CNG generates native projects; GitHub Actions produces private signed candidates promoted unchanged after physical-device digest approval.
- **Environment**: The current machine has the pinned Node, Java, Android SDK/adb, API 36 emulator, Maestro, and native verification toolchain. Physical-device availability remains session-dependent.

## Delivery Milestones

### Milestone 1: Trustworthy Workout Loop

Build and verify the repository foundation, one reviewed starter plan, Today, active workout, warm-ups, transactional working sets, recoverable rest, completion, basic history, and one deterministic double-progression rule.

### Milestone 2: Owned Library and Planning

Expand the reviewed catalog, add custom exercises, plans, schedules, editing, user-owned copies, and the remaining metric profiles needed by starter plans.

### Milestone 3: Calendar and History Integrity

Add calendar, session details, metric-aware history, corrections, reversible removal, and deterministic derived-state rebuilds.

### Milestone 4: Overall Progress and Complete Progression

Add period-based progress, consistency trend, recommendations, remaining comparators, and the complete recommendation lifecycle.

### Milestone 5: Recovery, Distribution, and Release

Add encrypted backup/restore, CSV export, complete adaptive/accessibility verification, signed candidate builds, physical-device approval, GitHub Release promotion, and post-implementation design QA.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Expo local-first domain architecture | Reuses the owner's workflow, supports Android first, and preserves later iOS portability | ✓ Validated Phase 1 |
| SQLite source facts are authoritative | Prevents cache, notification, and projection drift | ✓ Validated Phase 1 |
| Exclusive repository-owned transactions | Avoids Expo SQLite async transaction capture and fake completion | ✓ Validated Phase 1 |
| Durable pending-effects outbox | Replays notifications and derived work after process death | ✓ Validated Phase 1 |
| Rebuildable projections | Corrections, voids, and restore remain deterministic | ✓ Automated source proof, final physical validation deferred |
| Starter activation creates a user-owned copy | Personal targets progress without mutating bundled templates | ✓ Validated Phase 1 |
| Four root destinations | Separates doing, chronology, configuration, and overall analytics | ✓ Validated Phase 1 |
| Card-light precision-instrument design | Optimizes gym-floor scanning without generic dashboard styling | ✓ Validated Phase 1 |
| Three-layer test strategy | Pure rules, real SQLite, and Android lifecycle each get appropriate proof | ✓ Validated Phase 1 |
| Five staged milestones | Proves the load-bearing workout loop before broad features depend on it | — Pending |
| Private signed candidate promotion | Exact physical-device-tested bytes become the public release | — Pending |
| Exclude screen-reader and switch-scanning assistive technologies from v1 | The personal-use release does not require TalkBack or OEM switch setup; keyboard/D-pad, focus, labels, large text, reduced motion, non-color cues, and target sizing remain required | — Accepted 2026-08-17 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? Move them to Out of Scope with a reason.
2. Requirements validated? Move them to Validated with the phase reference.
3. New requirements emerged? Add them to Active.
4. Decisions to log? Add them to Key Decisions.
5. "What This Is" still accurate? Update it if reality drifted.

**After each milestone:**
1. Review all sections.
2. Reconfirm the Core Value.
3. Audit Out of Scope and its reasons.
4. Update Context with implementation and verification evidence.

---
*Last updated: 2026-08-25 after Phase 3 automated completion*
