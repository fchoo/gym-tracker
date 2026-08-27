# Phase 3: Calendar and History Integrity - Research

**Researched:** 2026-08-24
**Status:** Implementation-ready

## Summary

Phase 3 adds one authoritative effective-history adapter above immutable session tables, not a second mutable session model. Existing session rows stay original facts. A forward migration adds an immutable original-fact boundary, a versioned complete overlay snapshot, append-only audit/lifecycle events, subject revisions, and disposable projection tables. Calendar, session detail, metric history, and later period inputs read the adapter. Corrections, voids, and restores update source facts, invalidate recommendations, advance affected subject revisions, and enqueue durable rebuild effects inside the existing private serialized write transaction.

Existing source already supplies the load-bearing pieces:

- CalendarField and LocalDate preserve civil dates without interpreting date-only strings as instants.
- SerializedWriteExecutor and kernel.write provide FIFO BEGIN IMMEDIATE ownership.
- EffectRunner compares expectedRevision before handlers and supersedes stale effects.
- MetricExposure, comparability, aggregates, and best-candidate selection define the metric rules.
- Owned schedule opportunities persist planned_not_completed states for Calendar.
- AdaptiveScreen, content cards, actions, sheets, and tokens supply the UI system.

## Source Architecture

### Effective session facts

history_session_overlays stores one canonical effective_snapshot_json per finalized session with revision, lifecycle, effective civil date/timezone, note, and provenance. A missing overlay means the source session snapshot is effective. The snapshot is deliberately complete and validated before write so structural corrections remain replayable. Original session rows are the baseline and are never deleted or rewritten.

history_audit_events is append-only. It records correction, void, and restore events with session ID, result revision, timestamp, entity/field identity, and canonical before/after JSON. Audit data is source fact; every projection is rebuildable.

### Affected-subject graph

history_subject_revisions stores a monotonic revision for normalized subjects:

- session:sessionId
- date:effectiveLocalDate
- exercise:exerciseId:metricIdentity:comparatorKey
- target:legacy-or-owned:targetId
- period:periodKey

Each history mutation calculates the union of old/new snapshot subjects. In one transaction it enforces the expected effective revision, writes overlay/lifecycle/audit facts, increments all subjects, invalidates matching pending recommendations, supersedes obsolete generation effects, queues one revision-fenced rebuild row in the dedicated `history_rebuild_effects` queue per subject/revision, and commits before any UI acknowledgement. The existing `pending_effects` table intentionally remains limited to its original effect types because its SQLite CHECK constraint cannot be widened additively.

### Projection reducer

Targeted and full rebuild use the same pure canonically sorted reducer over effective source facts. Targeted rebuild replaces subject rows after a revision check; full rebuild clears/repopulates all projection rows deterministically. Fixtures compare canonical JSON rows for records, eligible/comparable exposures, exercise metrics, period-input summaries, and recommendation invalidation scopes.

Warm-ups remain in detail but never enter eligible exposure inputs. Existing partial-session eligibility remains: a partial is comparable only when all planned working sets for that exercise completed.

### Calendar reads

Calendar month reads combine effective sessions with owned_plan_schedule_opportunities by LocalDate. Default rows filter effective lifecycle to active and expose completed, partial, manual, planned-not-completed, and current-day states. Selected-date reads return factual sessions and actual exercise/working-set counts from effective snapshots. Phase 4 period analytics remain out of scope.

### Runtime and UI boundary

workoutAppRuntime remains the only app-facing composition root. It owns a historyRepository capability and exact refresh scopes. Screens/routes never import SQLite. It drains post-commit history effects best-effort, without allowing derivative failure to negate an acknowledged source write.

## Migration Shape

Migration 0013_history_integrity is additive:

1. Add original creation-offset retention and backfill it from source started instant plus stored timezone.
2. Add overlays, audit events, subject revisions, and rebuild-effect support.
3. Add projection tables and indexes.
4. Seed only necessary lifecycle compatibility for existing voided sessions; ordinary sessions use missing-overlay fallback.
5. Verify foreign keys, audit immutability triggers, civil-date constraints, and projection schemas.

No source deletion is permitted. The existing migration runner continues to own recovery and integrity checking.

## UI Contract Findings

- Calendar needs a civil grid, current-day treatment, labelled markers, selected-date session list, and empty/loading/error states with no color-only meaning.
- Session detail needs factual original/effective information, discreet Corrected/Removed status, separate warm-ups, correction entry, audit disclosure, and destructive confirmation.
- Correction uses an explicit editor with CalendarField, time-style and numeric controls, Save/Cancel, conflict recovery, and no optimistic history update.
- Removed sessions is a focused list with Restore confirmation and no permanent-delete affordance.
- Best/Average/Last remains identity/comparator segmented and must state its segment in text. No global volume headline is added.

## Verification Strategy

1. Pure domain tests cover snapshot canonicalization, subject fan-out, comparator boundaries, audit payload privacy, and target/full reducer equivalence.
2. Host SQLite integration migrates retained schemas, seeds each mutation class, asserts atomic rollback/invalidation/effects, and compares targeted/full rows byte-for-byte.
3. Component/route tests cover all Calendar/detail/correction/removed/history states at compact/medium/expanded plus 200% text and keyboard semantics.
4. Native contract harness and installed-APK evidence are run once serially after Phase 3 source stabilizes.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Overlay drifts from original facts | Complete canonical snapshot, append-only audit, source fallback, no direct finalized-session update |
| Correction invalidates undiscovered evidence | Subject union uses old/new snapshots and target references; fixtures cover every mutation category |
| Rebuild worker writes stale data | Existing expected-revision runner gate plus projection-write guard |
| Date moves on timezone change | Civil LocalDate and stored timezone/offset are source facts; date-only values never become instants |
| Recommendation changes after acknowledgement | Matching pending recommendations are invalidated in the source transaction before success returns |
| Dense history UI loses accessibility | Existing 48dp primitives, visible labels, non-color states, and adaptive composition |

## Implementation Order

1. Add migration/schema, immutable/effective types, and Calendar/session read tracer.
2. Route metric history through effective facts and prove warm-up/comparator behavior.
3. Add subject revisions, projections, rebuild worker, and equivalence suite.
4. Add correction editor/ledger and atomic command path.
5. Add void/restore/Removed sessions and final exact automated evidence.
