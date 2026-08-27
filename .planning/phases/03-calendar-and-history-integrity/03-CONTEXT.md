# Phase 3: Calendar and History Integrity - Context

**Gathered:** 2026-08-24  
**Status:** Ready for research, UI review, and planning  
**Mode:** Autonomous decisions authorized by the owner

<domain>
## Phase Boundary

Deliver chronological Calendar and exercise-history reads plus safe correction, removal, restoration, audit, and deterministic rebuild behavior for completed and partial historical workouts. The phase makes saved history trustworthy without rewriting original session snapshots. It does not add Phase 4 Overall Progress presentation or Phase 5 backup/export/release behavior.

</domain>

<decisions>
## Implementation Decisions

### Historical truth and civil time
- **D-01:** A workout's original local date, stored timezone, start/completion instants, and creation UTC offset are immutable historical facts. Migration records the creation offset for retained rows from their original start instant and stored timezone; future sessions persist it at creation.
- **D-02:** A correction never updates workout sessions, session exercises, or session sets for a finalized session. It writes a revisioned effective-history overlay whose canonical snapshot is resolved over the original facts. Existing in-progress correction behavior remains owned by Phase 2.
- **D-03:** Date/time corrections are explicit overlay fields. They validate a civil LocalDate, stored timezone, and ordering, but never infer or rewrite original local dates after a device timezone change. Calendar/history order use effective local date plus effective local start time; original timestamp, original timezone, and creation offset remain inspectable in the audit disclosure.
- **D-04:** The Calendar's default chronology includes completed, partial, manual, planned-not-completed, and current-day states. Voided work is excluded by default and is reachable only through Removed sessions.

### Effective snapshots and corrections
- **D-05:** Phase 3 uses an immutable original snapshot plus a single revisioned current overlay and append-only audit ledger. The overlay contains a validated complete effective session snapshot, not partial ad-hoc columns, so added/removed/retyped/replaced sets remain replayable. The original session rows remain the baseline and are never deleted or rewritten.
- **D-06:** Corrections are available only for completed and partial sessions. The editable matrix is exactly: working/warm-up values; set kind; add/remove set; exercise replacement; local date/time, effort, owner note; and plan/day association where the selected plan graph is valid. No value, target, profile, or comparability conversion is inferred.
- **D-07:** Every corrected field/set has a stable identity. Original set IDs remain their IDs; correction-added objects receive a correction-owned UUID. Removing a set marks it absent in the overlay only. The audit records entity kind and ID, field path, canonical previous value, canonical corrected value, correction timestamp, and resulting session revision.
- **D-08:** Exercise replacement requires an explicit available exercise and a complete compatible metric identity plus valid observations/targets. If identity differs, the owner supplies values under the new contract; historical observations are never silently converted. Plan reassociation requires a valid existing owned-plan/day relationship or the session remains unassociated.
- **D-09:** Owner notes are bounded user data, are visible only in the session detail/audit context, and never enter diagnostics, telemetry, effect payloads, or generated evidence.

### Removal, restoration, and audit
- **D-10:** Remove from history is a confirmation-gated reversible void for a completed session. It creates an immutable lifecycle audit event and marks the effective history lifecycle voided; it does not delete any session, set, audit, or recommendation-decision row.
- **D-11:** Removed sessions live in a dedicated surface with the effective date, plan/session label, removal time, and a Restore action. Restore is revision-checked, creates an immutable audit event, and reactivates the exact retained effective snapshot.
- **D-12:** Session detail shows a discreet Corrected label when its overlay revision is non-zero. Correction history stays behind an explicit disclosure so ordinary history remains scan-friendly. Original facts and audit rows are readable but not editable.

### Metrics, recommendation invalidation, and rebuilds
- **D-13:** All Calendar, history, exercise Best/Average/Last, records, and Phase 4 period inputs read the effective-history adapter. Warm-ups remain visible separately and are never eligible for records, aggregates, comparable exposure, or progression evidence.
- **D-14:** Every history mutation computes the union of old and new affected subjects: session, effective local date, exercise/metric identity/comparator boundary, applicable plan target, and affected period input. It atomically increments those subject revisions, invalidates pending legacy and owned recommendations that depend on affected evidence before acknowledgement, supersedes their obsolete generation effects, and queues one durable targeted rebuild effect per subject/revision.
- **D-15:** Derived history projections are disposable. A worker may write them only when its expected subject revision still matches. Stale work is marked superseded and cannot overwrite a newer projection. A visible Updating history freshness state is allowed; stale values are never represented as final.
- **D-16:** Targeted rebuild and full rebuild use the same pure, canonically sorted reducer over effective source facts. Retained fixtures cover value correction, set kind/add/remove, replacement, date/time, reassociation, void, and restore, and assert byte-equivalent projections for records, comparable exposures, exercise metrics, and affected period inputs.

### Calendar and history presentation
- **D-17:** Calendar is a civil-month grid using the existing in-app calendar primitives; it never parses a date-only value as an instant. Day state uses text/accessibility labels and distinct glyph/border treatment, not color alone. The selected date lists factual sessions and N/N (100%)-style exercise and working-set counts from effective facts.
- **D-18:** Exercise history is metric-aware and version-segmented by complete metric identity plus the existing comparator boundary. It provides Best, Average, and Last from comparable completed working sets; a partial session contributes only when all planned working sets for that exercise completed. Separate warm-up rows are visible without influencing those results.
- **D-19:** Calendar, session detail, correction editor, removed sessions, and exercise-history surfaces reuse the grey-canvas/white-card light and graphite-canvas/near-black-card dark contract, AdaptiveScreen, existing 48dp action primitives, fixed spacing/type tokens, compact/medium/expanded layouts, 200% text reflow, keyboard/D-pad support, and reduced motion.

### Claude's Discretion
- Exact SQL index names, internal canonical snapshot shape, projection-table partitioning, and bounded diagnostic code strings, provided the atomic fan-out and rebuild-equivalence contracts hold.
- Exact month navigation controls, marker glyphs, sheet route structure, audit disclosure presentation, and empty/loading/error copy within the locked visual and accessibility contracts.
- Whether the Calendar renders a selected-date detail pane at medium/expanded widths or keeps it below the grid, provided it uses the same source read and keeps focus/back behavior deterministic.

</decisions>

<specifics>
## Specific Ideas

- Calendar answers “When did I train, and what happened that day?” rather than duplicating Phase 4 analytics.
- Preserve the user-approved Gmail-like surface contrast: neutral grey canvas with white cards in Light; graphite grey canvas with near-black cards in Dark.
- The history integrity path must work fully offline and never mutate user workout history merely to satisfy a test or benchmark.

</specifics>

<canonical_refs>
## Canonical References

### Product and requirement boundary
- .planning/PROJECT.md — source-of-truth, offline, adaptive, diagnostics, and projection principles.
- .planning/REQUIREMENTS.md §Calendar and History — HIST-01 through HIST-09 acceptance requirements.
- .planning/ROADMAP.md §Phase 3 — required slices, success criteria, and release gate.
- .planning/STATE.md — deferred Phase 2 attended verification and current autonomous sequence.
- .planning/phases/02-owned-library-and-planning/02-CONTEXT.md — schedule/local-date, metric identity, owned-plan, and theme decisions inherited by Phase 3.

### Product and QA source contracts
- DESIGN.md — current token, adaptive, semantic-action, and accessibility contract.
- ~/.gstack/projects/gym_tracker/pre-git-design-20260815-132500.md §Calendar and History — product behavior for history, corrections, void/restore, and metric history.
- ~/.gstack/projects/gym_tracker/pre-git-eng-review-test-plan-20260815-224500.md §History Integrity — retained verification sequence and edge cases.

### Existing source seams
- src/platform/sqlite/sqliteKernel.ts and serializedWriter.ts — sole authority for serialized BEGIN IMMEDIATE history writes.
- src/platform/sqlite/migrations/index.ts and migrationRunner.ts — forward migration registration and verified recovery behavior.
- src/platform/sqlite/repositories/workoutOutcomeRepository.ts — session-detail query and outcome/recommendation patterns to extend.
- src/platform/sqlite/repositories/metricRepository.ts and src/domains/metrics/exposure.ts / aggregates.ts — current comparable-history/metric contracts that must consume effective history.
- src/platform/sqlite/repositories/scheduleRepository.ts and src/bootstrap/scheduleRuntime.tsx — owned schedule opportunities for planned-not-completed Calendar state.
- src/bootstrap/workoutLifecycle.ts and src/platform/sqlite/effects/ — existing durable-effect and stale-revision replay patterns.
- src/bootstrap/workoutAppRuntime.tsx — typed runtime boundary; screens/routes must receive history capabilities here rather than SQL.
- src/ui/screens/SessionDetailScreen.tsx, src/ui/screens/ExerciseDetailScreen.tsx, src/ui/screens/RootScreens.tsx, and app/(tabs)/calendar.tsx — presentation and routing extension points.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CalendarField plus LocalDate helpers already enforce civil-date confirmation and must be reused for month/date corrections.
- AdaptiveScreen, ScreenHeader, SectionHeader, ContentCard, ConfirmationSheet, InlineNotice, and semantic action primitives already provide the required theme/adaptive/accessibility behavior.
- SessionDetail already separates warm-ups, working sets, factual progress, and recommendations; Phase 3 extends it with effective-history/audit/lifecycle data rather than replacing it.
- MetricExposure, areMetricExposuresComparable, aggregate functions, and selectBestMetricCandidate are the canonical metric rules.
- Owned schedule opportunities provide persisted planned-not-completed state and schedule-local-date semantics.

### Established Patterns
- Authoritative mutations use kernel.write through the private serialized writer and commit durable effects in the same transaction.
- Pending effects are revision-checked and stale results are rejected, which is the model for history rebuild effects.
- Runtime routes have typed capabilities and UI never imports SQLite repositories.
- Source session snapshots are already independent from mutable plan/catalog graphs, so overlay resolution can preserve history under content/plan changes.

### Integration Points
- Migration 0013_history_integrity introduces original timestamp-offset retention, history overlays/audits/lifecycle, subject revisions, rebuild effects, and rebuildable projection storage.
- A historyRepository becomes the single read/write adapter for effective session detail, Calendar, exercise history, correction, void/restore, audit, and rebuild work.
- workoutAppRuntime.tsx exposes the history port and coordinates non-authoritative lifecycle draining after a successful source commit.
- Calendar and detail routes consume runtime reads/actions and invalidate/reload only their exact affected view after acknowledged commits.

</code_context>

<deferred>
## Deferred Ideas

- Overall 4/12-week/All-time dashboards, trend charts, recommendation breadth, and period-summary presentation remain Phase 4; Phase 3 creates only their correct rebuildable inputs.
- Backup/restore/export of correction and void facts, public distribution, and release approval remain Phase 5.
- Permanent history deletion, automatic metric conversion, silent plan reassociation, cloud sync, and generic AI coaching are out of scope.

</deferred>

---

*Phase: 03-calendar-and-history-integrity*  
*Context gathered: 2026-08-24*
