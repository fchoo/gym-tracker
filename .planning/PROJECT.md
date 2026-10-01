# Gym Tracker

## What This Is

Gym Tracker is an Android-first personal workout planner and logger for one owner. It combines a calendar, plan and exercise library, one-tap guided workouts, history-safe in-workout editing, advanced set timing, portable encrypted recovery, automatic replacement-phone backup, metric-aware history, and explainable progression recommendations in an offline-first Expo application.

The app should feel like a quiet training instrument. It should be faster and clearer than a spreadsheet or generic tracker without pretending to be a human coach.

## Core Value

Open today's workout, see trustworthy next targets, complete each working set with one primary action, recover safely from interruption, and understand exactly why the next target is recommended.

_Confirmed still correct at v1.1 close: editing, advanced timing, and backup/recovery extend this loop without moving authority away from local SQLite._

## Requirements

### Validated

- ✓ Offline Android workout critical path with no account or network requirement — Phase 1 (v1.0)
- ✓ Today, Calendar, Library, and Progress root shell with focused workouts outside root navigation — Phase 1 (v1.0)
- ✓ Full Body Foundation activation as a user-owned copy with scheduled, alternate, rest-day, and empty starts — Phase 1 (v1.0)
- ✓ Inline warm-up and working-set values, compact Complete/Skip actions, commit-gated Retry, eight-second Undo, and recoverable rest — Phase 1 (v1.0)
- ✓ SQLite-authoritative writes, migrations, durable effects, notification repair, and process-death recovery — Phase 1 (v1.0)
- ✓ Factual completion/detail plus one evidence-backed, explicitly accepted double-progression path — Phase 1 (v1.0)
- ✓ System/Light/Dark, compact/medium/expanded layouts, 200% text, keyboard/D-pad, visible focus, reduced motion, and non-color cues — Phase 1 (v1.0)
- ✓ Reproducible Expo CNG build with exact-byte native, E2E, performance, and Argon2 contracts; signed personal-use APK/AAB delivered via `personal-apk.yml` — Phase 1/5 (v1.0)
- ✓ Combined plans-and-exercises Library with a reviewed 300+ exercise catalog, custom exercises, and user-owned starter-plan copies — Phase 2 (v1.0)
- ✓ Six original starter templates including an equipment-heavy weekday body-part split, with safe weekday/rotation schedule behavior — Phase 2 (v1.0)
- ✓ All nine metric profiles with versioned observation/aggregate/comparator contracts — Phase 2 (v1.0)
- ✓ Calendar, effective metric history, auditable corrections, reversible session removal, and deterministic history rebuilds — Phase 3 (v1.0)
- ✓ Period-based Overall Progress (4/12/all-time) and explainable, explicitly accepted progression recommendations with a full lifecycle — Phase 4 (v1.0)
- ✓ Encrypted backup/restore, CSV export, and privacy-safe diagnostics — Phase 5 (v1.0)
- ✓ Coherent Material 3 UX across Library, Calendar, plan editing, Progress, Today, and navigation — Phase 6 (v1.0)
- ✓ Post-candidate UX refinement: cleaner nav/Today, consolidated Settings, compact set editor, set/warm-up removal, rest-timer audio, and a distinctive app icon — Phase 7 (v1.0)
- ✓ Signed personal-use Android APK/AAB delivery built once and sideloaded unchanged — Phase 5 (v1.0)
- ✓ Scrollable all-exercise workout overview with history-safe add, replace, remove, reorder, schedule semantics, and explicit default-No plan write-back — Phases 8-9 (v1.1)
- ✓ Per-repetition cadence and cluster-set timing with independent row configuration, lifecycle recovery, and advisory-only cue delivery — Phase 10 (v1.1)
- ✓ Stable owner-scoped portable identities plus password-encrypted GTBK restore-clean and previewed atomic merge — Phase 11 (v1.1)
- ✓ Optional single-active-device Google Drive backup with restore quarantine, verified latest/previous snapshots, writer fencing, and replacement recovery — Phase 12 (v1.1)
- ✓ Signed production APK/AAB built with the pinned toolchain and installed unchanged on the Samsung SM-S916B — v1.1

### Active

No active milestone requirements. The next milestone starts with fresh requirements.

### Out of Scope

- Multi-user accounts, social sharing, a hosted app backend, and concurrent multi-device sync — still out of scope. *(v1.1 note: optional single-owner Google sign-in for automatic replacement-phone backup is in scope via DATA-10; this is owner-controlled personal storage, not a shared backend or multi-user account system.)*
- Social profiles, plan sharing, leaderboards, and community features — not part of the personal-use goal.
- Wear OS — defer until the phone workout loop is proven.
- Health Connect — defer until the local session model has real usage history.
- Camera form analysis and generative coaching — outside the trust and complexity boundary.
- Nutrition, body measurements, and recovery scoring — unrelated to the workout-tracking core.
- Exercise media without independently verified licensing and attribution.
- Screen-reader and switch-scanning assistive technology support — TalkBack and Samsung Universal/Switch Access are not required for this personal-use v1; existing semantic labels remain, while keyboard/D-pad stays release-gated.
- Public GitHub Release / store promotion ceremony (attended device matrix, owner-approval token, no-rebuild digest gate, Terminal Seal) — retired for personal-use v1 delivery; tracked as V2-05 if public distribution is pursued.
- Marketing site and app-store listing art — implementation and release follow-up.

## Context

- The owner requested a personal Android gym tracker and intends to use it during real workouts.
- The differentiator is one-tap, explainable next-set guidance rather than a larger catalog of generic fitness features.
- Plan-aware exercise history belongs on Today; Progress is overall and period-based.
- The visual direction is a card-light precision instrument using Source Sans 3, IBM Plex Mono numerals, semantic colors, and explicit light/dark tokens.
- The design and engineering plan passed interactive GStack reviews with no unresolved decisions.
- **v1.0 shipped (2026-09-14)** as a signed personal-use Android APK/AAB via `personal-apk.yml`. All seven phases are verified; 94/94 v1 requirements complete. Latest signed build: workflow run `34746276143`.
- **v1.1 shipped (2026-10-01)** as a signed personal-use Android APK/AAB installed on the Samsung SM-S916B. All five phases are verified; 12/12 requirements, 10/10 cross-phase connections, and 5/5 end-to-end flows complete. Production APK SHA-256: `19d24eded09eb3b293dd101e915820394f030aefbfb8b2c4d9f98f4c966ead8c`.
- **Tech stack as shipped:** Expo SDK 57 (CNG), TypeScript strict, Expo Router, Expo SQLite (FTS5), notifications, Bouncy Castle Argon2id + AES-256-GCM backup crypto, Concept G app icon. Coverage on the final PR gate: 141 suites / 2,473 tests, all 83 integrity-critical files at 100%.
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
- **Security**: Manual GTBK backup archives use integrity protection and password encryption; automatic Drive snapshots are integrity-checked unencrypted JSON protected by Google-account access. Secrets and workout payloads never enter diagnostics.
- **Performance**: Working-set commit and dock transition p95 is at most 150 ms on the minimum supported Android profile.
- **Testing**: Integrity-critical domain and application code requires complete branch coverage, real SQLite contract tests, and Android E2E for lifecycle behavior.
- **Distribution**: Expo CNG generates native projects; signed personal-use APK/AAB bytes are signature-verified and sideloaded unchanged. Public promotion remains deferred under V2-05.
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
| Five staged milestones | Proves the load-bearing workout loop before broad features depend on it | ✓ Validated v1.0 (delivered as 7 phases) |
| Private signed candidate promotion | Exact physical-device-tested bytes become the public release | ⚠️ Revisited v1.0 — replaced by the signed personal-use APK (`personal-apk.yml`); public promotion deferred to V2-05 |
| Exclude screen-reader and switch-scanning assistive technologies from v1 | The personal-use release does not require TalkBack or OEM switch setup; keyboard/D-pad, focus, labels, large text, reduced motion, non-color cues, and target sizing remain required | ✓ Validated v1.0 |
| Deliver v1 as a signed personal-use APK, retire the public-release ceremony | Single-owner personal use does not need the attended device matrix, owner-approval token, no-rebuild GitHub Release promotion, or Terminal Seal; the device-free `personal-apk.yml` build is the delivery | ✓ Accepted 2026-09-14 (PR #29; tracked as V2-05) |
| Use Drive as single-active-device backup, not live sync | The owner has one active phone and needs simple replacement recovery; writer fencing and restore quarantine prevent an old or fresh install from replacing the recovery copy | ✓ Accepted 2026-09-26 (DATA-10) |
| Protect automatic backup with the Google account only | Removes a separate backup passphrase and gives a WhatsApp-like restore flow; automatic JSON is readable to anyone with Drive access, while manual GTBK remains password-encrypted | ✓ Accepted 2026-09-26 (DATA-10) |
| Use one scrollable workout overview with history-safe session editing | Keeps the workout loop scan-friendly while add/replace/remove/reorder preserve immutable recorded facts | ✓ Validated Phases 8-9 (v1.1) |
| Keep advanced set timing separate from between-set rest | Per-rep cadence and cluster gaps remain advisory and cannot redefine committed set or rest facts | ✓ Validated Phase 10 (v1.1) |
| Use stable owner-scoped identities for portable merge | Restore and merge recognize the same personal records without rewriting immutable history | ✓ Validated Phase 11 (v1.1) |
| Keep manual GTBK and automatic Drive recovery as separate products | Manual GTBK remains password-encrypted and portable; automatic Drive JSON optimizes replacement-phone recovery without a passphrase | ✓ Validated Phases 11-12 (v1.1) |

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
*Last updated: 2026-10-01 after v1.1 milestone completion and signed Samsung installation*
