# Requirements: Gym Tracker — v1.1

**Defined:** 2026-09-15
**Milestone:** v1.1 — In-Workout Editing, Session Overview, Advanced Timing, Merge Restore
**Core Value:** Open today's workout, see trustworthy next targets, complete each working set with one primary action, recover safely from interruption, and understand exactly why the next target is recommended.

> **Status:** DRAFT for owner review (UX flow + open questions accompany this file). No planning or implementation has started. Requirement text and IDs may change after the UX review.

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

- [ ] **WORK-19**: Starting or resuming a workout lands on a **session overview** — a single scrollable list of every exercise in the session with its sets inline (planned, active, completed, skipped, added) — rather than jumping directly into the first exercise's set entry. The currently-active set remains visually distinguished and is the default scroll anchor; the primary set action (Complete) is reachable without leaving the overview. Empty workouts land on the overview with an Add-exercise affordance and no set rows.
- [ ] **WORK-20**: From the session overview the owner can **add an exercise** to the in-progress workout by choosing any available exercise from the reviewed library (with the shared Material 3 Search/filter used elsewhere). The added exercise appends to the end of the session with its metric profile's default target scheme and one working set, is marked as owner-added (distinct from planned), and never mutates any existing exercise or set.
- [ ] **WORK-21**: From the session overview the owner can **replace an exercise**. Replacement never rewrites an exercise row: if the exercise has no completed working sets it is removed and the replacement is appended in its display position; if it has completed working sets the original is retained as skipped and the replacement is appended, so all completed history is preserved. The replacement is chosen from the reviewed library and carries its own immutable snapshot.
- [ ] **WORK-22**: From the session overview the owner can **remove a whole exercise**. An exercise with zero completed working sets is hard-deleted from the session; an exercise with any completed working set cannot be hard-deleted and is instead **skipped** (its completed history is retained and excluded from remaining-work counts). Session progress totals and history snapshots stay correct and rebuildable after either outcome.
- [ ] **WORK-23**: From the session overview the owner can **reorder exercises** by touch-and-hold drag (with an accessible up/down fallback), changing only a presentation/display order. The original planned order captured at session start is preserved immutably for history; reordering never alters completed-set facts or the planned-order snapshot.
- [ ] **WORK-24**: Every session-exercise and session-set row stores an **append-only immutable snapshot** of its name, order-at-creation, metric profile, units, targets, and rule versions. Mid-workout add/replace/remove/reorder operations only append new snapshot rows or transition status; no operation rewrites or deletes a committed snapshot, and completed sets always remain correct-or-undo (never hard-deleted). Owner-added exercises carry an explicit `added` origin and a null plan-target lineage (no automatic progression; manual only).
- [ ] **WORK-25**: A workout whose composition was edited mid-session still completes its scheduled opportunity (the owner trained that day) but is marked as **modified-from-plan**; schedule rotation/weekday advancement and progression treat added/replaced/removed exercises deterministically (no silent target mutation, no advancement on exercises absent from the planned day).

### Advanced Set Timing (promoted from V2-03)

- [ ] **WORK-26**: The owner can configure **per-repetition and cluster-set timer modes** on an exercise or set through a separately reviewed, versioned timer state machine, distinct from between-set rest. Per-rep mode emits a cadence cue per repetition; cluster mode inserts short intra-set rests (e.g. 3+3+3 with fixed gaps) without turning one set into multiple recorded sets. Timing cues are advisory and never authoritative for recorded set/rest facts; SQLite remains the source of truth, and denied/failed audio never corrupts the session.

### Data Portability (promoted from V2-04)

- [ ] **DATA-08**: The owner can **merge a backup into existing data** (in addition to today's clean-install replacement restore). Merge authenticates and decrypts before parsing, uses stable owner-scoped identities to detect duplicates, applies an approved conflict-resolution rule per record class (plans, exercises, sessions, corrections, void state, settings), previews the merge outcome before commit, and mutates user-owned tables in one all-or-nothing transaction. Any authentication, validation, conflict, cancellation, or insert failure leaves the existing database unchanged and shows a safe, actionable error; FTS and all projections rebuild deterministically after a successful merge.

## Cross-cutting constraints (inherited)

- SQLite source facts remain authoritative; notification, haptic, audio, UI, and evidence failures never roll back or redefine committed workout/rest state.
- Screens never execute SQL; all mutations use the repository-owned private writer with FIFO serialization and explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`.
- A source mutation and its durable pending effects commit atomically before UI acknowledgement, haptics, notifications, or cache invalidation.
- Every new/changed control retains an exact accessible name, visible focus, keyboard/D-pad activation, non-color cue, and a minimum 48dp target; new surfaces pass System/Light/Dark, compact/medium/expanded, 200% text, and reduced-motion checks.
- Integrity-critical domain/application modules keep 100% statement/branch/function/line coverage; new behavior ships with tests, real Expo SQLite contracts where persistence changes, and Maestro flows for lifecycle-visible behavior.
- Delivery remains the signed personal-use APK/AAB via `personal-apk.yml`.

## Definition of Done (v1.1)

- Every checked requirement is implemented and passes its phase-scoped automated verification (typecheck, lint, boundaries, unit/component/host-SQLite/integration, coverage, native Expo SQLite contracts and Maestro flows where applicable).
- The session overview is the default active-workout surface; add/replace/remove/reorder operate from it and preserve the append-only snapshot invariant (WORK-24).
- Merge restore leaves the existing database unchanged on any failure and rebuilds derivatives deterministically on success.
- v1.1 is delivered as a signed personal-use APK/AAB, sideloaded unchanged.

## Traceability (to be assigned during roadmap/planning)

| Requirement | Phase | Status |
|-------------|-------|--------|
| WORK-19 | TBD | Draft |
| WORK-20 | TBD | Draft |
| WORK-21 | TBD | Draft |
| WORK-22 | TBD | Draft |
| WORK-23 | TBD | Draft |
| WORK-24 | TBD | Draft |
| WORK-25 | TBD | Draft |
| WORK-26 | TBD | Draft |
| DATA-08 | TBD | Draft |

**Coverage:** 9 v1.1 requirements defined; phase mapping pending roadmap creation.

## Deferred beyond v1.1

- **V2-01**: Wear OS.
- **V2-02**: Health Connect import/export.
- **V2-05**: Public GitHub Release / store promotion ceremony (attended device matrix, owner-approval token, no-rebuild digest gate, Terminal Seal).

---
*Requirements drafted: 2026-09-15 for v1.1 (in-workout editing, session overview, advanced timing, merge restore). Pending owner UX review before planning.*
