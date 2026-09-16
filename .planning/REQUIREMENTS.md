# Requirements: Gym Tracker — v1.1

**Defined:** 2026-09-15
**Milestone:** v1.1 — In-Workout Editing, Session Overview, Advanced Timing, Merge Restore
**Core Value:** Open today's workout, see trustworthy next targets, complete each working set with one primary action, recover safely from interruption, and understand exactly why the next target is recommended.

> **Status:** ACTIVE — owner UX decisions recorded 2026-09-15 (see "Owner decisions" below). Phase 8 is complete; Phases 9–12 remain in the active milestone.

## Delivery model (unchanged from v1.0)

v1.1 continues to ship as a signed personal-use Android APK/AAB built once by
`personal-apk.yml`. The retired public-release ceremony remains out of scope (tracked
as V2-05). SQLite source facts stay authoritative; notifications, FTS, projections,
recommendations, and UI caches remain rebuildable derivatives.

## Carried-forward invariant (reframes v1.0 WORK-04)

v1.0 WORK-04 stated: *"Starting a planned workout stores immutable snapshots of exercise
names, order, metric profiles, units, targets, and rule versions."* v1.1 does **not**
weaken this. It clarifies that immutability is **row-level and append-only**, exactly as
set add/remove already works today (`addWorkingSet` appends; `removeWorkingSet` refuses
when a completed/undo snapshot exists). Composition of a live session may change **only**
by appending new snapshot rows or transitioning a row's status — never by rewriting or
destroying a committed fact. See **WORK-24**.

## v1.1 Requirements

### Session Overview and Navigation

- [x] **WORK-19**: Starting or resuming a workout lands on a **session overview** — a single scrollable list of every exercise in the session with its sets inline (planned, active, completed, skipped, added) — rather than jumping directly into the first exercise's set entry. The currently-active set remains visually distinguished and is the default scroll anchor; the primary set action (Complete) is reachable without leaving the overview. Empty workouts land on the overview with an Add-exercise affordance and no set rows.
- [ ] **WORK-20**: From the session overview the owner can **add an exercise** to the in-progress workout by choosing any available exercise from the reviewed library (with the shared Material 3 Search/filter used elsewhere). The added exercise appends to the end of the session with its metric profile's default target scheme and one working set, is marked as owner-added (distinct from planned), and never mutates any existing exercise or set.
- [ ] **WORK-21**: From the session overview the owner can **replace an exercise**. Replacement never rewrites an exercise row: if the exercise has no completed working sets it is removed and the replacement is appended in its display position; if it has completed working sets the original is retained as skipped and the replacement is appended, so all completed history is preserved. The replacement is chosen from the reviewed library and carries its own immutable snapshot.
- [ ] **WORK-22**: From the session overview the owner can **remove a whole exercise**. An exercise with zero completed working sets is hard-deleted from the session; an exercise with any completed working set cannot be hard-deleted and is instead **skipped** (its completed history is retained and excluded from remaining-work counts). Session progress totals and history snapshots stay correct and rebuildable after either outcome.
- [ ] **WORK-23**: From the session overview the owner can **reorder exercises** by touch-and-hold drag (with an accessible up/down fallback), changing only a presentation/display order. The original planned order captured at session start is preserved immutably for history; reordering never alters completed-set facts or the planned-order snapshot.
- [ ] **WORK-24**: Every session-exercise and session-set row stores an **append-only immutable snapshot** of its name, order-at-creation, metric profile, units, targets, and rule versions. Mid-workout add/replace/remove/reorder operations only append new snapshot rows or transition status; no operation rewrites or deletes a committed snapshot, and completed sets always remain correct-or-undo (never hard-deleted). Owner-added exercises carry an explicit `added` origin and a null plan-target lineage (no automatic progression; manual only).
- [ ] **WORK-25**: A workout whose composition was edited mid-session still completes its scheduled opportunity (the owner trained that day) but is marked as **modified-from-plan**; schedule rotation/weekday advancement and progression treat added/replaced/removed exercises deterministically (no silent target mutation, no advancement on exercises absent from the planned day).
- [ ] **WORK-27**: When a workout that was edited mid-session finishes, the completion flow offers an explicit **"Save these changes to the plan?"** choice (default **No**). Choosing No keeps all edits session-scoped and never mutates the plan. Choosing Yes applies the session's add/replace/remove/reorder deltas to the owning plan day as an explicit, revision-checked plan edit (reusing the v1.0 owned-plan editing path), previews nothing silently, and leaves already-recorded history untouched. The prompt appears only when the session actually diverged from its planned day and never for empty/unplanned workouts.

### Advanced Set Timing (promoted from V2-03)

- [ ] **WORK-26**: The owner can configure **per-repetition and cluster-set timer modes** on an exercise or set through a separately reviewed, versioned timer state machine, distinct from between-set rest. **Both modes are in scope for v1.1.** Per-rep mode emits a cadence cue per repetition (configurable tempo); cluster mode inserts short intra-set rests (e.g. 3+3+3 with fixed gaps) without turning one set into multiple recorded sets. Modes are configurable per exercise and per set, persist with the plan/session, and survive backgrounding and process death. Timing cues are advisory and never authoritative for recorded set/rest facts; SQLite remains the source of truth, and denied/failed audio never corrupts the session.

### Data Portability & Cross-Device History (promoted from V2-04, expanded)

- [ ] **DATA-08**: The owner can **merge a backup into existing data** (in addition to today's clean-install replacement restore). Merge authenticates and decrypts before parsing, uses stable owner-scoped identities to detect duplicates, applies an approved per-record-class conflict rule (see WORK/DATA decisions), previews the merge outcome before commit, and mutates user-owned tables in one all-or-nothing transaction. Any authentication, validation, conflict, cancellation, or insert failure leaves the existing database unchanged and shows a safe, actionable error; FTS and all projections rebuild deterministically after a successful merge.
- [ ] **DATA-09**: The owner has a **single canonical history/backup they can carry to any of their personal devices** and restore/merge without data loss. Backups are portable, versioned, integrity-protected, and password-encrypted (reusing the v1.0 GTBK format), carry stable owner-scoped record identities so the same session/plan is recognized across devices, and are self-describing enough that a fresh install on a new device can restore-clean **or** merge (DATA-08) into existing data. The owner can export/import the latest backup on demand and see when/where it was last produced. This manual path is the fallback whenever automatic sync (DATA-10) is unavailable or declined.
- [ ] **DATA-10**: The owner can enable **automatic cross-device sync through their own Google Drive**. With the same Google account signed in on each personal device (One-Tap sign-in, `drive.file` scope), the app keeps one canonical encrypted store in its own Drive-created file and reconciles devices automatically — triggered on app foreground, on background/close, and after a workout or edit commits (near-real-time, not millisecond-live). All payload is **client-side encrypted** (XChaCha20-Poly1305) so Google/Drive sees only ciphertext and sizes/timestamps; the encryption key never leaves the device unencrypted. Sync is a **derivative replication over the DATA-08 merge engine** (per-record-class conflict rules, append/merge of a change-log, never blind overwrite): local SQLite remains the authoritative source, sync never blocks or mutates the live workout path, and any auth, network, decryption, conflict, or write failure leaves local data unchanged and is safely retryable. Sign-out and "disconnect sync" are explicit, and DATA-09 manual export/import remains available as the no-Drive fallback.

> **Architecture note (reuse + a key learning from `helper-payroll-app`):** That repo's ADR 0001 found Google Drive `drive.file` unusable as a *multi-account family* live-sync transport because "each account's app token discovered only files created under its own grant." That limitation does **not** apply here: Gym Tracker is single-owner with the **same Google account on every device**, so the same grant sees the app-created file everywhere — Drive is a valid transport for this case. Reuse the proven pieces: `react-native-nitro-google-signin` (One-Tap + Drive scope), `@noble/ciphers` XChaCha20-Poly1305 client-side encryption, Drive REST v3, `expo-secure-store` for key persistence. Firestore (their multi-account transport) is **not** adopted — no shared backend, no third-party data processor.

## Owner decisions (recorded 2026-09-15)

These resolve the open questions and are now binding for planning:

- **Scope (Q14):** Full batch — WORK-19..WORK-27, WORK-26, DATA-08, DATA-09, DATA-10. V2-03 and V2-04 are both included in v1.1.
- **Advanced timing (Q10):** Both per-rep cadence **and** cluster-set intra-rests ship in v1.1 (WORK-26).
- **Cross-device history (Q13):** In scope AND **automatic sync approved (owner, 2026-09-15).** DATA-09 delivers the portable canonical backup + manual import/export fallback; **DATA-10 delivers automatic sync via the owner's own Google Drive** (`drive.file`, client-side encrypted). This is an explicit, recorded reversal of the app's prior "no account / offline-only" stance: signing into Google is now an optional, owner-initiated feature; the app remains fully functional offline and unsynced if Drive is never connected.
- **Sync backend (2026-09-15):** Owner's own Google Drive (not a managed service, not self-hosted). Refer to `helper-payroll-app` for the Google One-Tap + Drive REST + Noble-cipher implementation; do NOT adopt its Firestore transport (that existed only for its multi-account family case).
- **Replace with completed sets (Q6):** Approved — original stays visible as **skipped**, replacement appended; history preserved (WORK-21).
- **Write-back to plan (Q9):** End-of-workout **explicit choice, default No** (WORK-27); edits are session-scoped unless the owner opts in.
- **Accepted recommendations (defaults):** Q1 anchor to active set within the full list; Q2 overview-only active screen; Q3 unify empty workout into overview; Q4 single-select add; Q5 append-to-end then reorder; Q7 added/replacement exercises are manual-only (no auto-progression); Q8 edited session consumes the scheduled opportunity + modified-from-plan flag; Q11 a cluster is one recorded set with advisory intra-rests.
- **Conflict rule (Q12):** newest-by-timestamp for sessions/corrections/void state; existing-wins for settings; keep-both for distinct custom exercises/plans (dedup by stable owner-scoped identity). To be confirmed at DATA-08 discuss-phase.

## Cross-cutting constraints (inherited)

- SQLite source facts remain authoritative; notification, haptic, audio, UI, and evidence failures never roll back or redefine committed workout/rest state.
- Screens never execute SQL; all mutations use the repository-owned private writer with FIFO serialization and explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`.
- A source mutation and its durable pending effects commit atomically before UI acknowledgement, haptics, notifications, or cache invalidation.
- Every new/changed control retains an exact accessible name, visible focus, keyboard/D-pad activation, non-color cue, and a minimum 48dp target; new surfaces pass System/Light/Dark, compact/medium/expanded, 200% text, and reduced-motion checks.
- **Sync is derivative and non-authoritative:** local SQLite remains the source of truth; sync (DATA-10) replicates over the DATA-08 merge engine and never blocks, delays, or mutates the offline workout critical path. Google sign-in is optional; the app is fully usable offline and unsynced.
- **Sync security:** all synced payload is client-side encrypted (XChaCha20-Poly1305) before leaving the device; keys live only in `expo-secure-store` / Android Keystore and are never written to Drive, logs, analytics, or exports; Drive uses the `drive.file` scope (app-created files only), and OAuth tokens are handled through the vetted sign-in library. New third-party native dependencies (Google sign-in, Noble ciphers) pass the repo's dependency-audit gate.
- Integrity-critical domain/application modules keep 100% statement/branch/function/line coverage; new behavior ships with tests, real Expo SQLite contracts where persistence changes, and Maestro flows for lifecycle-visible behavior.
- Delivery remains the signed personal-use APK/AAB via `personal-apk.yml`.

## Definition of Done (v1.1)

- Every checked requirement is implemented and passes its phase-scoped automated verification (typecheck, lint, boundaries, unit/component/host-SQLite/integration, coverage, native Expo SQLite contracts and Maestro flows where applicable).
- The session overview is the default active-workout surface; add/replace/remove/reorder operate from it and preserve the append-only snapshot invariant (WORK-24).
- Merge restore leaves the existing database unchanged on any failure and rebuilds derivatives deterministically on success; the canonical backup restores or merges onto any personal device without data loss (DATA-09); automatic Google-Drive sync (DATA-10) keeps the same-account devices reconciled with client-side encryption and never corrupts the offline workout path.
- v1.1 is delivered as a signed personal-use APK/AAB, sideloaded unchanged.

## Traceability (to be assigned during roadmap/planning)

| Requirement | Phase | Status |
|-------------|-------|--------|
| WORK-19 | 8 | Complete |
| WORK-20 | 9 (proposed) | Draft |
| WORK-21 | 9 (proposed) | Draft |
| WORK-22 | 9 (proposed) | Draft |
| WORK-23 | 9 (proposed) | Draft |
| WORK-24 | 9 (proposed) | Draft |
| WORK-25 | 9 (proposed) | Draft |
| WORK-27 | 9 (proposed) | Draft |
| WORK-26 | 10 (proposed) | Draft |
| DATA-08 | 11 (proposed) | Draft |
| DATA-09 | 11 (proposed) | Draft |
| DATA-10 | 12 (proposed) | Draft |

**Coverage:** 12 v1.1 requirements mapped; 1 complete and 11 pending.

## Deferred beyond v1.1

- **V2-01**: Wear OS.
- **V2-02**: Health Connect import/export.
- **V2-05**: Public GitHub Release / store promotion ceremony (attended device matrix, owner-approval token, no-rebuild digest gate, Terminal Seal).

---
*Requirements drafted: 2026-09-15 for v1.1 (in-workout editing, session overview, advanced timing, cross-device merge + automatic Google-Drive sync). Owner UX + sync decisions recorded 2026-09-15; proceeding to milestone planning.*
