# Roadmap: Gym Tracker

## Milestones

- ✅ **v1.0 Personal-use Gym Tracker** — Phases 1-7 (shipped 2026-09-14, delivered as the signed personal-use APK)
- 🚧 **v1.1 In-Workout Editing, Advanced Timing & Cross-Device Sync** — Phases 8-12 (in design; requirements + UX flow finalized, ready to plan)

## Delivery model

v1 ships as a signed personal-use Android APK/AAB built once by `personal-apk.yml`
(reviewed source gates → signed Gradle release build → `apksigner` verification →
downloadable artifact). The public-release ceremony (exact-candidate attended device
matrix, owner-approval token, no-rebuild GitHub Release promotion, and Terminal Seal)
is retired for the personal-use milestone (removed in PR #29) and tracked as **V2-05**
for any future public distribution.

## Phases

<details>
<summary>✅ v1.0 Personal-use Gym Tracker (Phases 1-7) — SHIPPED 2026-09-14</summary>

Full phase detail, requirements, and verification gates are archived in
`.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`,
and `.planning/milestones/v1.0-MILESTONE-AUDIT.md`.

- [x] Phase 1: Trustworthy Workout Loop (10/10 plans) — completed 2026-08-17
- [x] Phase 2: Owned Library and Planning (34/34 plans) — completed 2026-08-26
- [x] Phase 3: Calendar and History Integrity (5/5 plans) — completed 2026-08-25
- [x] Phase 4: Overall Progress and Complete Progression (8/8 plans) — completed 2026-08-26
- [x] Phase 5: Recovery, Distribution, and Release (7/7 plans) — completed 2026-09-14 (signed personal-use build; promotion ceremony retired)
- [x] Phase 6: Material 3 UX Remediation (9/9 plans) — completed 2026-09-06 (merged via PRs #10-#25)
- [x] Phase 7: Post-Candidate UX Refinement (10/10 plans) — completed 2026-09-14 (merged via PR #26)

**Coverage:** 94/94 v1 requirements (FOUND, WORK, LIB, HIST, PROG, UX-01..22, DATA, REL) mapped and complete.

</details>

## v1.1 — In-Workout Editing & Advanced Timing (proposed)

> Design stage. Requirements are drafted in `.planning/REQUIREMENTS.md` (owner UX
> decisions recorded 2026-09-15); the active-workout UX is specified in
> `.planning/design/v1.1-UX-FLOW.md` and resolved questions in
> `.planning/design/v1.1-OPEN-QUESTIONS.md`. Phases below are a **proposed**
> decomposition for owner review — not yet planned or executed.

**Goal:** The owner can run a workout from a session-overview screen (all exercises + sets
on one scrollable page), add/replace/remove/reorder exercises live without breaking
immutable history, optionally write session edits back to the plan, use per-rep/cluster
timing, keep one canonical history/backup, and have it **automatically sync across their
personal devices through their own Google Drive** (client-side encrypted) — all delivered
in the signed personal-use APK.

**Requirements:** WORK-19..WORK-27, WORK-26, DATA-08, DATA-09, DATA-10.

**Proposed phases:**

- [ ] **Phase 8: Session Overview & Navigation** — Reorient the active workout to land on a scrollable exercise-list overview (WORK-19) with the active set anchored and Complete reachable inline; unify the empty-workout state into the overview; preserve all v1 workout-loop guarantees. (Requirements: WORK-19; touches WORK-24 read model.)
- [ ] **Phase 9: In-Workout Exercise Editing** — Append-only add, history-safe replace, guarded remove, and presentation-order reorder from the overview, with the row-level immutable-snapshot model, modified-from-plan/scheduling semantics, and the end-of-workout "save changes to plan?" opt-in (default No). (Requirements: WORK-20, WORK-21, WORK-22, WORK-23, WORK-24, WORK-25, WORK-27.)
- [ ] **Phase 10: Advanced Set Timing** — Versioned per-rep cadence and cluster-set intra-rest timer state machine (both modes), advisory-only cues, non-authoritative over recorded facts, lifecycle-safe. (Requirement: WORK-26.)
- [ ] **Phase 11: Portable History & Merge Restore** — Stable owner-scoped record identities and one canonical, portable, versioned, encrypted backup that restores clean or **merges** (authenticated, conflict-ruled, previewed, all-or-nothing) into existing data, with deterministic derivative rebuild and a manual import/export path. (Requirements: DATA-08, DATA-09.)
- [ ] **Phase 12: Automatic Google-Drive Sync** — Optional owner-initiated Google sign-in (One-Tap, `drive.file`), one app-created encrypted store per account, and automatic reconciliation on foreground/background/commit built as derivative replication over the Phase 11 merge engine; client-side XChaCha20-Poly1305 encryption, secure key storage, retryable failure, and no impact on the offline workout path. Reuses `helper-payroll-app`'s Google sign-in + Drive + Noble-cipher patterns; does NOT adopt its Firestore transport. (Requirement: DATA-10.)

**Coverage (proposed):** 12/12 v1.1 requirements mapped across Phases 8-12.

**Recorded reversal:** v1.0 was strictly no-account / offline-only. v1.1 adds **optional**
Google sign-in for owner-controlled Drive sync (DATA-10). The app stays fully functional
offline and unsynced; sign-in is never required to log workouts.
