# Phase 13: Multi-Plan & Running Foundation - Context

**Gathered:** 2026-10-06
**Status:** Ready for execution planning; owner decisions finalized 2026-10-07

<domain>
## Phase Boundary

Replace the shipped singleton-plan assumptions with authoritative Strength and
Running identities, schedules, occurrences, imported-activity facts, matching,
bodyweight, and complete portability. This phase exposes typed read/command ports
for later UI phases; it does not build the prototype screens or provider transport.

</domain>

<decisions>
## Implementation Decisions

### Authority, identity, and migration
- **D13-01:** SQLite remains the sole source of truth; screens and future provider adapters use typed ports and never execute SQL.
- **D13-02:** Add immutable `plan_kind`; backfill every existing plan and schedule as `strength` without reclassifying historical metrics.
- **D13-03:** Preserve the global one-in-progress-Strength-workout invariant while making plan activation and schedules sport-aware.
- **D13-04:** Capture exact plan/day-or-session, schedule/version, opportunity, timezone, and command provenance at start/match time. Completion never discovers the currently active schedule after the fact.
- **D13-05:** Migration 0023's backup-trigger table set is frozen to its historical schema. New authoritative tables gain generation triggers only after creation; test fresh-to-latest and schema-27-to-latest.
- **D13-06:** Existing archives remain readable through versioned table graphs; new source facts, identities, tombstones, receipts, and match events join a successor portability contract. Rebuildable projections and credentials stay excluded.

### Running and imported facts
- **D13-07:** A Running plan owns stable, immutable session revisions for Recovery, Long run, Progression, Tempo, Intervals, Hills, and Fartlek.
- **D13-08:** Weekday Running supports multiple stable ordered session slots on the same weekday. Preserve Strength binding uniqueness; use explicit Running slot identity/ordinal. No one-session-per-day restriction.
- **D13-09:** Imported activities remain immutable independent aggregates. Import never creates/activates a plan or creates Strength workout sessions.
- **D13-10:** One imported activity can fulfill one selected Running opportunity only after explicit owner confirmation; unmatch/reassign appends audited events.

### Final owner decisions
- **MAP-01:** Approved `one-per-sport`: enforce exactly zero or one active Strength plan and zero or one active Running plan, each with its own schedule and collision handling. Multiple ordered Running session slots on one weekday remain valid; arbitrary multiple active plans within one sport are not allowed.
- **TIM-01:** Approved `retire-playback` with no legacy compatibility mode: remove cadence/cluster authoring, runtime commands, playback, foreground reconciliation, and queued callbacks. Preserve ordinary workout/history facts, dormant source records required for portability, committed/draft sets, the active pointer, and independent between-set rest integrity.
- **GAR-ARCH:** Phase 13 owns the durable imported-activity and match boundary consumed by Phase 18. The only Garmin adapter input is Phase 18's typed `GarminSourceEnvelope` from `src/domains/activities/garminActivitySourcePort.ts`; Phase 13 does not define another transport or infer source identity from filenames, dates, distances, or normalized totals.

### Claude's Discretion
- Exact migration file split and internal type names after checking current schema 27.
- Query batching/indexes that preserve the documented identities and measured budgets.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/v1.2-OWNER-BRIEF.md` — locked product/domain boundary.
- `.planning/REQUIREMENTS.md` — DOM-01 through DOM-17.
- `.planning/architecture/v1.2-multi-active-plans.md` — singleton map, approved per-sport schema, and timing retirement.
- `.planning/architecture/v1.2-garmin-import.md` — import identities and match ledger.
- `.planning/architecture/v1.2-migration-risks.md` — migration/portability failure matrix.
- `.planning/research/v1.2/SUMMARY.md` — phase order and risks.
- `.planning/milestones/v1.1-phases/11-portable-history-merge-restore/11-CONTEXT.md` — merge invariants.
- `.planning/milestones/v1.1-phases/12-automatic-google-drive-sync/12-CONTEXT.md` — backup generation/quarantine authority.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/platform/sqlite/repositories/starterPlanRepository.ts`: activation receipts/revision fencing; scope by sport.
- `src/platform/sqlite/repositories/plansWorkoutRepository.ts`: authoritative session snapshot/start; add schedule provenance.
- `src/bootstrap/scheduleRuntime.tsx`: existing scheduling command surface; replace implicit singleton reads with explicit identity.
- `src/domains/portability/restoreCommands.ts`, `mergePlan.ts`: atomic restore/merge; validate activation per chosen cardinality.

### Integration Points
- Schema 27 migration registry and `0023_automatic_drive_backup.ts`.
- Calendar/Workout typed read models, the Phase 18 `GarminSourceEnvelope` adapter port, and Progress rebuilds.

</code_context>

<specifics>
## Specific Ideas

Use a narrow tracer: migrate a legacy Strength database, add one inactive
Running plan with two ordered same-weekday sessions, activate per the reviewed
policy, materialize independent occurrences, round-trip backup/restore, and prove
the existing active workout resumes unchanged.

</specifics>

<deferred>
## Deferred Ideas

- Running Rotation scheduling and cumulative multi-activity fulfillment.
- Garmin transport, authentication, bounded JSON retrieval, and `GarminSourceEnvelope` construction belong to Phase 18.

</deferred>

---
*Phase: 13-multi-plan-running-foundation*
*Context gathered: 2026-10-06*
