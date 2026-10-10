---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Prototype Parity, Concurrent Plans & Garmin Import — PLANNED
current_phase: 17
current_phase_name: Library & Running Plans
status: executing
stopped_at: Completed 17-12-PLAN.md
last_updated: "2026-10-10T20:41:02.491Z"
last_activity: 2026-10-11
last_activity_desc: Phase 17 execution started
state_head: 4d04581971d4a68d2a0337728b9cf365d7f4a5ae
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 98
  completed_plans: 53
  percent: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-06)

**Core value:** Open today's workout, see trustworthy next targets, complete each working set with one primary action, recover safely from interruption, and understand exactly why the next target is recommended.
**Current focus:** Phase 17 — Library & Running Plans

## Current Position

Phase: 17 (Library & Running Plans) — EXECUTING
Plan: 13 of 14
Status: Ready to execute
Last activity: 2026-10-11 — Phase 17 execution started

Progress: [█░░░░░░░░░] 13%

## Delivery Model and Planning Gate

Gym Tracker remains a signed personal-use Android APK/AAB with SQLite-authoritative offline workouts. v1.2 is planning-only in the current session: discuss every phase, create UI specifications for UI-heavy phases, create executable plans, run plan checks and review convergence, then stop for owner review before implementation, builds, device mutation, release, or deployment.

## Performance Metrics

**Completed history:**

- Milestones shipped: 2 (v1.0 and v1.1)
- Phases completed: 12
- Plans completed: 119 (83 in v1.0; 36 in v1.1)
- v1.2 phases: 8 planned; 98 baseline plans retained for focused revision; 0 executed

**Recent trend:** v1.1 closed with 5/5 phases and 36/36 plans complete, all integrity-critical files at 100% coverage, cross-phase integration passing, and the signed APK installed unchanged on the Samsung SM-S916B.
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 13 P01 | 5 min | 3 tasks | 6 files |
| Phase 13 P02 | 43min | 3 tasks | 15 files |
| Phase 14 P01 | 9m | 2 tasks | 10 files |
| Phase 14 P02 | 9m | 3 tasks | 12 files |
| Phase 14 P03 | 42m | 2 tasks | 10 files |
| Phase 14 P04 | 7m | 3 tasks | 10 files |
| Phase 14-prototype-visual-shell P05 | 9m | 3 tasks | 9 files |
| Phase 14 P06 | 34m | 2 tasks | 9 files |
| Phase 14 P12 | 7m | 2 tasks | 5 files |
| Phase 14 P07 | 5m | 2 tasks | 4 files |
| Phase 14 P08 | 8m | 3 tasks | 7 files |
| Phase 14 P09 | 15m | 3 tasks | 11 files |
| Phase 14 P10 | 196m | 3 tasks | 24 files |
| Phase 14-prototype-visual-shell P11 | 3m | 2 tasks | 2 files |
| Phase 15 P01 | 8m | 3 tasks | 10 files |
| Phase 15-workout-parity P03 | 32m | 3 tasks | 8 files |
| Phase 15 P02 | 27min | 6 tasks | 15 files |
| Phase 15 P04 | 13min | 3 tasks | 7 files |
| Phase 15 P06 | 1h 40m | 3 tasks | 14 files |
| Phase 15 P05 | 6m | 3 tasks | 4 files |
| Phase 15 P07 | 7m | 3 tasks | 5 files |
| Phase 15 P08 | 12m | 3 tasks | 7 files |
| Phase 15-workout-parity P09 | 13m | 2 tasks | 11 files |
| Phase 15 P10 | 11m | 3 tasks | 10 files |
| Phase 15 P11 | 13 min | 2 tasks | 5 files |
| Phase 15 P12 | 4 min | 2 tasks | 5 files |
| Phase 15 P13 | 4m | 2 tasks | 10 files |
| Phase 17 P01 | 2h | 3 tasks | 11 files |
| Phase 17 P04 | 6min | 3 tasks | 6 files |
| Phase 17 P05 | 5min | 3 tasks | 5 files |
| Phase 17 P06 | 7m | 3 tasks | 7 files |
| Phase 17 P07 | 45m | 3 tasks | 13 files |
| Phase 17 P09 | 2h 7m | 2 tasks | 14 files |
| Phase 17 P02 | 7m | 3 tasks | 8 files |
| Phase 17 P08 | 13m | 3 tasks | 19 files |
| Phase 17 P10 | 10m | 3 tasks | 9 files |
| Phase 17 P03 | 8m | 2 tasks | 5 files |
| Phase 17 P11 | 7m | 3 tasks | 11 files |
| Phase 17 P12 | 20m | 2 tasks | 18 files |

## Accumulated Context

### Decisions

- Phase 13 owns all shared domain invariants and precedes every domain consumer; Phase 14 owns shared presentation and precedes every feature UI phase.
- Phase 15 precedes Calendar read-only Active-shaped detail reuse; Phase 17 precedes Garmin matching; Phase 18 precedes factual Running progress; Phase 20 depends on Phases 13-19.
- One Running plan supports multiple stable, ordered session slots on the same weekday; a one-session-per-day constraint is prohibited.
- MAP-01 approved: zero or one active plan per sport. TIM-01 approved: retire cadence/cluster playback and authoring completely; no legacy playback compatibility mode.
- DEV-01 and DEV-02 approved; native geometry/contrast verification remains pending implementation, not pending owner approval.
- Garmin transport is selected: Python 3.13 + Chaquopy 17.0 + pinned python-garminconnect 0.3.17 commit `218e72ca5459e014435fc2d94fd18bd601fa0c14`, ARM64 summary/splits/detail JSON through `modules/garmin-connect/` and `src/platform/garmin/`.
- No Garmin program access, partner API/broker, desktop/Drive bridge, manual FIT/FIT decoder prerequisite, runtime AI agent, or Hermes change is in this milestone.
- Runtime is a standalone installed app with no dynamic AI agents or development server. Hermes is an embedded JS engine, not an agent; no engine switch is requested.
- SQLite facts, exclusive commit acknowledgment, immutable history, offline workouts, deterministic rebuilds, and complete backup/restore/merge coverage remain non-negotiable.
- Revision 18 is the presentation oracle; necessary deviations require an explicit register entry and owner acceptance.
- [Phase 13]: Migration 23 consumes a frozen schema-23 trigger registry, never the mutable latest backup graph.
- [Phase 13]: MAP-01 is approved one-per-sport as recorded 2026-10-07; implementation proof remains pending.
- [Phase 13]: MAP-01 active plan/schedule pairs are asserted per sport under the exclusive writer transaction.
- [Phase 13]: Running opportunity identity is schedule-version plus stable slot plus local date/timezone, never date-only.
- [Phase 14]: ArchivoVariable remains proof-only until Plan 14-02 records a clean-tree Android font-axis verdict.
- [Phase 14]: Phase 14 font proof binds source tree, APK, package/profile, source registry, cases, and screenshot overlays before accepting evidence.
- [Phase 14]: Revision 18 font approval is sealed to ddced4d8, the supplied source/APK hashes, and both reviewed scale overlays.
- [Phase 14]: Appearance preserves System as null and retains the last authoritative value when a SQLite write fails.
- [Phase 14]: Loading keeps all four roots disabled at the bottom; font and appearance failures stop before trusted runtime mounting.
- [Phase 14]: BottomSheet owns cancellation, focus restoration, modal isolation, and IME-safe geometry; consumers retain draft and mutation state.
- [Phase 14]: SemanticToast accepts only bounded presentation events and never receives workflow authority callbacks.
- [Phase 14]: BottomSheet remains the sole owner of modal isolation, keyboard geometry, focus restoration, and safe cancellation.
- [Phase 14]: Consumers retain drafts, validation, busy latches, and mutation authority; ConfirmationDialog preserves d5071087 sequential confirmation behavior.
- [Phase 14]: AppSettingsContent owns ordered settings presentation while sheet and route hosts retain navigation and focus authority.
- [Phase 14]: RestAlertSettingsSheet keeps serialized optimistic writes/readback rollback while BottomSheet owns presentation and dismissal.
- [Phase 14]: Library overlay consumers retain screen-owned query, filter, selection, scroll, and draft state while BottomSheet owns presentation and safe dismissal.
- [Phase 14]: Workout completion confirmation remains source-authoritative; ConfirmationDialog only presents consequences and blocks both actions while submission is busy.
- [Phase 14]: Removed-session success is presentation-only and occurs after the runtime refresh callback plus authoritative list reload.
- [Phase 14]: Removed-session restore keeps identity and effective revision visible; focus returns to its surviving trigger or the screen heading.
- [Phase 14]: Phase 14: Backup routes project controller/facade results; opaque file handles, tokens, latches and source mutations stay below presentation.
- [Phase 14]: Phase 14: ConfirmationDialog accepts caller-owned review content and disabled gates while exact DELETE, REPLACE and MERGE checks remain route/controller-owned.
- [Phase 14]: Phase 14: The canonical 13-item shell ledger is the single source for requirements, native stages, flows, and evidence paths.
- [Phase 14]: Phase 14: Shell evidence accepts only matching source, retained/installed APK, development-test identity, device, report, privacy, and DEV-02 native proof.
- [Phase 14]: Phase 14: Native matrix preserves requested theme, viewport, text, focus/input, motion, startup, and no-write recovery coverage.
- [Phase 14]: Phase 14: A cancellation-only recovery fixture is enabled only for the phase14 development-test native contract, so real recovery UI is exercised without archive data or production behavior changes.
- [Phase 14]: Phase 14: Native evidence targets real route/action identifiers with explicit IME clearance; static labels and hub pages are not accepted as action proof.
- [Phase 14]: Phase 14: Final shell evidence is accepted only after fresh source/APK/installed-device/report identity and privacy validation agree across all 13 obligations.
- [Phase 14]: DEV-02 remains owner-approved accessible-9b470b from 2026-10-07; fresh Plan 14-10 evidence independently verifies Light #9B470B titles, #D97820 sport roles, and unchanged Dark treatment.
- [Phase 15]: Workout routes preserve explicit owning context and retry the same authoritative session ID.
- [Phase 15]: WorkoutSessionPresentation is immutable and command-free; Active composes capabilities separately.
- [Phase 15]: Workout root starts the saved selected occurrence envelope directly; local preview never re-resolves or mutates schedule facts.
- [Phase 15]: Rest uses a disabled Nothing scheduled primary with explicit alternatives; Running context remains navigation-only.
- [Phase 15]: TIM-01 retirement removes all app/UI playback and authoring surfaces while preserving portable legacy timing facts and independent between-set rest.
- [Phase 15]: The fail-closed TIM-01 UI audit covers app/ and src/ui/ only; persistence and domain readers remain for historical byte portability.
- [Phase 15]: Phase 15: Set rows expose edit intent only; local drafts persist exclusively through explicit Save.
- [Phase 15]: Phase 15: Completed corrections use Save committed set edit and retain the sheet draft when the revision-fenced command fails.
- [Phase 15]: Phase 15: Complete Set remains screen-owned, duplicate-safe, and retries the exact transaction envelope.
- [Phase 15]: Exercise rest defaults use canonical request receipts; eligible rest resolves exercise override before plan preference.
- [Phase 15]: Phase 15: WorkoutActionDock remains render-only; ActiveWorkoutScreen owns retry, revision, idempotency, and committed effects.
- [Phase 15]: Phase 15: Add Set is scoped to the invoking exercise and exposes only warm-up or working additions.
- [Phase 15]: Rest controls remain permanently visible and keep source mutations behind the revisioned command port.
- [Phase 15]: Plan settings preserve a local draft until the owning preference port acknowledges persistence.
- [Phase 15]: Picker failures remain explicit and retryable; they never masquerade as an empty exercise catalog.
- [Phase 15]: Active Workout retries reuse the original receipt envelope; contextual Undo remains a bounded toast action outside persistent docks.
- [Phase 15]: Active trend projects one completed compatible result per session, bounded to six newest sessions.
- [Phase 15]: Post-workout plan editing retains source plan identity and routes only after a session boundary.
- [Phase 15]: Phase 15: terminal workout navigation requires the matching authoritative session ID and status; failures retain Active facts and reuse the original envelope.
- [Phase 15]: Phase 15: write-back presents source-derived typed target deltas; no supported delta is Keep-only and never changes the plan.
- [Phase 15]: Phase 15: unknown terminal receipts re-read durable session facts before deciding to navigate or reuse the original retry envelope.
- [Phase 15]: Phase 15 evidence accepts only Expo SQLite-authoritative native cases; fixture-only evidence is rejected.
- [Phase 15]: Phase 15 visual evidence recomputes approved/source-manifest/reference hashes and binds native plus reference inputs.
- [Phase 15]: TIM-01 evidence requires approved retire-playback with zero-cue lifecycle proof and no compatibility branch.
- [Phase 15]: Phase 15 native evidence uses one action-bearing representative per ledger case plus only distinct risk variants.
- [Phase 15]: Phase 15 native matrix restores font scale, appearance, orientation, notification state, and fixture database after each case.
- [Phase 15]: Phase 15 rendered benchmark records first RestDock native-frame timing and raw long-session samples; host validation is not native evidence.
- [Phase 15]: Phase 15 exact-source APK/native/performance acceptance is deferred to Phase 20's single end-of-all-phases production-APK closure; no native PASS is claimed.
- [Phase 17]: Running create acknowledges only source-table readback after the exclusive SQLite command.
- [Phase 17]: Running create remains inactive; Phase 13 MAP-01 activation stays authoritative.
- [Phase 17]: Strength creation is isolated in create-strength while Plan 17-02 retains ownership of replacing the shared create route with the neutral chooser.
- [Phase 17]: Owned-plan revision conflicts refresh only the committed snapshot; the local aggregate draft remains until the owner explicitly resolves it.
- [Phase 17]: [Phase 17]: Stale Strength schedule conflicts refresh authoritative facts without replacing the local draft.
- [Phase 17]: [Phase 17]: Replacement and plan-day removal use a final focus-restoring ConfirmationDialog; domain preview tokens and revisions remain authoritative.
- [Phase 17]: Starter save creates a fresh inactive owned copy and routes to editing only after durable commit and authoritative refresh.
- [Phase 17]: Strength starter activation reads and mutates only Strength schedule state; Running remains unaffected under MAP-01.
- [Phase 17]: Template-update copies re-read the comparison immediately after confirmation, binding creation to current revisions while preserving owned history.
- [Phase 17]: Bundled instruction steps are accepted catalog facts with provenance; custom and copied exercises intentionally have none.
- [Phase 17]: Linked legacy entries cite their existing approved upstream source; preserved legacy entries retain Original Gym Tracker provenance.
- [Phase 17]: Running session IDs, revisions, slots, and request hashes are allocated inside the runtime writer boundary; routes retain only UI drafts.
- [Phase 17]: Only the selected Recovery, Long run, or Progression discriminated branch is serialized; inactive type drafts remain screen-local.
- [Phase 17]: Create-plan navigation is neutral: only an explicit chooser choice enters Strength or Running authoring, and neither transition can activate a plan.
- [Phase 17]: The Library runtime returns a sport-aware active collection from one batched snapshot; duplicate active rows for one sport fail closed instead of being hidden.
- [Phase 17]: True empty is determined from the new authoritative active collection plus persisted owned plans, while legacy test snapshots remain backwards-compatible during the migration.
- [Phase 17]: [Phase 17]: Running lifecycle is source-derived from plans.is_active plus running_plans.status; routes never infer or write lifecycle facts.
- [Phase 17]: [Phase 17]: Running activation atomically replaces only the same-sport active pair; Strength remains untouched.
- [Phase 17]: [Phase 17]: Archived Running plans retain immutable history and reactivate as inactive, requiring a fresh activation review.
- [Phase 17]: Phase 17: Tempo Continuous omits repetitions/recovery; Tempo repeats owns them as a strict selected branch.
- [Phase 17]: Phase 17: Structured and Unstructured Fartlek persist exclusive quantity or bounded-cue shapes; no generic notes payload is used.
- [Phase 17]: Phase 17: One root per session kind per plan remains authoritative, so each Fartlek style is independently round-tripped as inactive source facts.
- [Phase 17]: Owned Strength rows default to a source-backed summary while all existing deep edit and schedule routes remain directly addressable.
- [Phase 17]: Owned archive/reactivate is reviewed separately from schedule activation; UI does not bypass current revision, receipt, active-workout, or MAP-01 guards.
- [Phase 17]: [Phase 17] Current Running membership is retireable while stable roots and revisions remain immutable history.
- [Phase 17]: [Phase 17] Only aggregate/session Runtime saves publish complete Running membership; lower-level graph appends remain partial.
- [Phase 17]: [Phase 17] Running final-session removal is local and confirmation-gated until an explicit Save.
- [Phase 17]: Phase 17 Plan 12: Option A keeps collision outcomes and receipts append-only, with a rebuildable current-intent projection.
- [Phase 17]: Phase 17 Plan 12: Collision confirmation fences both Strength and Running identities and revisions; only the selected stable occurrence receives intent.

### Pending Owner Review

- Product decisions pending: **0**. MAP-01, TIM-01, DEV-01, DEV-02 and the Garmin transport selection are closed.
- Review the complete reconciled planning set after the final fresh convergence run; technical proof gaps remain implementation evidence, not new product questions.
- No execute-phase command is authorized before that owner review.

### Blockers/Concerns

- **Garmin native proof:** The selected embedded client is source-supported but has not yet been built or tested with the owner's account. A proof failure records a concrete blocker; it does not silently switch transport.
- **Garmin data fidelity:** JSON detail samples have chart/polyline limits; verify field presence and sampling before using them for exact best-effort claims. FIT is deferred until this is settled.
- **Plan freshness:** The transport-focused current-file review converged with 0 HIGH and 0 actionable non-HIGH findings. The older FIT/official-provider result remains historical only.
- **Owner-review stop:** No phase execution, application edit, build, device mutation, release, or deployment is authorized by this roadmap.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|---|---|---|---|---|
| Ecosystem | Wear OS | v2 | Project initialization | v1.0 |
| Ecosystem | Health Connect import/export | v2 | Project initialization | v1.0 |
| Distribution | Public GitHub Release or store promotion ceremony (V2-05) | v2 | Personal-use reconciliation | v1.0 |

## Session Continuity

Last session: 2026-10-10T20:41:02.341Z
Stopped at: Completed 17-12-PLAN.md
Resume file: None
Next action: Present the complete planning set for owner review; after explicit approval, run `/gsd-execute-phase 13`.
