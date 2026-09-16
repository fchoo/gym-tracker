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

## v1.1 — In-Workout Editing, Advanced Timing & Cross-Device Sync

> Requirements finalized in `.planning/REQUIREMENTS.md` (owner UX + sync decisions
> recorded 2026-09-15); active-workout UX in `.planning/design/v1.1-UX-FLOW.md` and the
> resolved decision record in `.planning/design/v1.1-OPEN-QUESTIONS.md`. Phases 8-12 below
> are ready for per-phase discuss/plan.

**Goal:** The owner can run a workout from a session-overview screen (all exercises + sets
on one scrollable page), add/replace/remove/reorder exercises live without breaking
immutable history, optionally write session edits back to the plan, use per-rep/cluster
timing, keep one canonical history/backup, and have it **automatically sync across their
personal devices through their own Google Drive** (client-side encrypted) — all delivered
in the signed personal-use APK.

**Requirements:** WORK-19..WORK-27, WORK-26, DATA-08, DATA-09, DATA-10.

**Proposed phases:**

- [x] **Phase 8: Session Overview & Navigation** — Reorient the active workout to land on a scrollable exercise-list overview (WORK-19) with the active set anchored and Complete reachable inline; unify the empty-workout state into the overview; preserve all v1 workout-loop guarantees. (Requirements: WORK-19; touches WORK-24 read model.) (completed 2026-09-16)
- [ ] **Phase 9: In-Workout Exercise Editing** — Append-only add, history-safe replace, guarded remove, and presentation-order reorder from the overview, with the row-level immutable-snapshot model, modified-from-plan/scheduling semantics, and the end-of-workout "save changes to plan?" opt-in (default No). (Requirements: WORK-20, WORK-21, WORK-22, WORK-23, WORK-24, WORK-25, WORK-27.)
- [ ] **Phase 10: Advanced Set Timing** — Versioned per-rep cadence and cluster-set intra-rest timer state machine (both modes), advisory-only cues, non-authoritative over recorded facts, lifecycle-safe. (Requirement: WORK-26.)
- [ ] **Phase 11: Portable History & Merge Restore** — Stable owner-scoped record identities and one canonical, portable, versioned, encrypted backup that restores clean or **merges** (authenticated, conflict-ruled, previewed, all-or-nothing) into existing data, with deterministic derivative rebuild and a manual import/export path. (Requirements: DATA-08, DATA-09.)
- [ ] **Phase 12: Automatic Google-Drive Sync** — Optional owner-initiated Google sign-in (One-Tap, `drive.file`), one app-created encrypted store per account, and automatic reconciliation on foreground/background/commit built as derivative replication over the Phase 11 merge engine; client-side XChaCha20-Poly1305 encryption, secure key storage, retryable failure, and no impact on the offline workout path. Reuses `helper-payroll-app`'s Google sign-in + Drive + Noble-cipher patterns; does NOT adopt its Firestore transport. (Requirement: DATA-10.)

**Coverage (proposed):** 12/12 v1.1 requirements mapped across Phases 8-12.

**Recorded reversal:** v1.0 was strictly no-account / offline-only. v1.1 adds **optional**
Google sign-in for owner-controlled Drive sync (DATA-10). The app stays fully functional
offline and unsynced; sign-in is never required to log workouts.

## Phase Details

### Phase 8: Session Overview & Navigation

**Goal**: The owner starting or resuming a workout lands on a single scrollable session overview showing every exercise with its sets inline, with the active set anchored and the primary Complete action reachable without leaving the overview, while every v1.0 workout-loop guarantee (commit-gated completion, Undo, rest, recovery) is preserved.
**Depends on**: Phase 7 (v1.0 active-workout implementation)
**Requirements**: WORK-19
**Success Criteria** (what must be TRUE):

  1. Starting or resuming a workout renders all session exercises (planned, active, completed, skipped) as one scrollable list with their sets inline, not a one-exercise focus screen.
  2. The active set is the default scroll anchor and its Complete action is reachable inline; the one-tap completion loop, Undo, and RestDock behave exactly as v1.0.
  3. Empty/unplanned workouts land on the overview with a prominent Add-exercise affordance and no set rows.
  4. All v1.0 lifecycle guarantees (process-death recovery, rotation/background restore, notification reconciliation) still pass on the overview.

**UI hint**: yes

### Phase 9: In-Workout Exercise Editing

**Goal**: From the session overview the owner can add, replace, remove, and reorder whole exercises during a live workout without ever rewriting or destroying committed history, and can optionally push those session edits back to the plan at finish time.
**Depends on**: Phase 8
**Requirements**: WORK-20, WORK-21, WORK-22, WORK-23, WORK-24, WORK-25, WORK-27
**Success Criteria** (what must be TRUE):

  1. Add appends a library exercise with a fresh immutable snapshot, default target scheme, one working set, and an `added` origin; no existing exercise/set row changes.
  2. Replace never rewrites a row: with no completed sets it removes + appends in position; with completed sets it keeps the original as skipped and appends the replacement, preserving all completed history.
  3. Remove hard-deletes only an exercise with zero completed sets; otherwise it is skipped, and progress totals plus history snapshots stay correct and rebuildable either way.
  4. Reorder changes a presentation/display order only; the planned order captured at session start stays immutable and completed-set facts are untouched.
  5. Every session-exercise/session-set row carries an append-only immutable snapshot (WORK-24); an edited session consumes its scheduled opportunity flagged modified-from-plan with deterministic, non-mutating progression.
  6. At finish, an edited-from-plan workout offers an explicit "Save these changes to the plan?" choice defaulting to No; Yes applies deltas through the revision-checked owned-plan editor and never alters recorded history.

**UI hint**: yes

### Phase 10: Advanced Set Timing

**Goal**: The owner can configure per-repetition cadence and cluster-set intra-rest timing on an exercise or set through a versioned timer state machine, with cues that are advisory only and never authoritative for recorded set/rest facts.
**Depends on**: Phase 9
**Requirements**: WORK-26
**Success Criteria** (what must be TRUE):

  1. Per-rep mode emits a configurable cadence cue per repetition; cluster mode inserts fixed intra-set rests (e.g. 3+3+3) recorded as one set, not multiple.
  2. Timing modes are configurable per exercise and per set and persist with the plan/session across backgrounding and process death.
  3. Cues are advisory: SQLite remains the source of truth, and denied or failed audio never corrupts recorded facts or the rest state machine.
  4. Advanced timing is distinct from and does not regress the v1.0 between-set rest timer.

**UI hint**: yes

### Phase 11: Portable History & Merge Restore

**Goal**: The owner has one canonical, portable, versioned, encrypted backup carrying stable owner-scoped record identities, which a device can restore-clean or merge into existing data (authenticated, conflict-ruled, previewed, all-or-nothing) with deterministic derivative rebuild.
**Depends on**: Phase 5 (v1.0 backup/restore) and the v1.1 data model from Phases 9-10
**Requirements**: DATA-08, DATA-09
**Success Criteria** (what must be TRUE):

  1. Records carry stable owner-scoped identities so the same session/plan/exercise is recognized across devices and reinstalls.
  2. A backup can be merged into existing data: authenticate/decrypt before parse, detect duplicates by identity, apply per-record-class conflict rules, preview the outcome, and commit in one all-or-nothing transaction.
  3. Any auth, validation, conflict, cancellation, or insert failure leaves the existing database unchanged with a safe, actionable error; success rebuilds FTS and all projections deterministically.
  4. The owner can export the canonical backup on demand and import/merge it on another personal device with no data loss (manual fallback path).

**UI hint**: yes

### Phase 12: Automatic Google-Drive Sync

**Goal**: The owner can optionally sign into their own Google account so the app automatically keeps one app-created, client-side-encrypted store synced across their personal devices through Google Drive, built as derivative replication over the Phase 11 merge engine, with local SQLite remaining authoritative and the offline workout path never blocked.
**Depends on**: Phase 11
**Requirements**: DATA-10
**Success Criteria** (what must be TRUE):

  1. Optional owner-initiated Google One-Tap sign-in with `drive.file` scope connects sync; the app remains fully usable offline and unsynced without it, and sign-out/disconnect is explicit.
  2. One app-created Drive file per account holds the canonical store; with the same account on multiple devices each device sees and reconciles that file automatically on foreground, background/close, and after a workout/edit commit.
  3. All synced payload is client-side encrypted (XChaCha20-Poly1305) before upload; keys live only in secure device storage and never reach Drive, logs, analytics, or exports.
  4. Sync replicates over the DATA-08 merge engine (per-record-class conflict rules, never blind overwrite); any auth, network, decryption, conflict, or write failure leaves local data unchanged and is retryable; sync never blocks or mutates the live workout path.
  5. New native dependencies (Google sign-in, Noble ciphers) pass the repository dependency-audit gate; the reused patterns come from `helper-payroll-app` without adopting its Firestore transport.

**UI hint**: yes

## Backlog
