# Architecture research: Gym Tracker v1.2

**Domain:** Personal offline Strength planner/logger with independently scheduled Running plans and imported Garmin activity history.  
**Researched:** 2026-10-06  
**Code baseline:** `703b9d21a900dcadbcd4138c3691256174667bf1`; SQLite schema 27.  
**Confidence:** MEDIUM, returned by the configured confidence seam for cross-checked web search.  
**Status:** Research complete; architecture and policy proposals await owner review. No implementation performed.

## Recommendation

Extend the shipped SQLite domain with explicit immutable plan types and independent schedule selection. Reuse the existing schedule engine and source/derived-state boundaries. Keep one recoverable in-progress Strength workout, and store imported Running activities separately from the Strength set/session graph. A match between an import and a scheduled run is an audited owner-confirmed relation, not a new workout or a guessed completion.

**Proposed cardinality:** zero or one active plan per sport, so Strength and Running can be active together. The owner brief and revision-18 prototype require concurrency but do not explicitly prohibit multiple same-sport plans. That policy is awaiting the owner's answer; do not describe it as approved.

The domain foundation must precede the new root, Calendar, Library, and Progress presentation. This is not a label change: two SQLite unique indexes, multiple repository/runtime singleton readers, restore validation and merge normalization enforce the shipped single-plan rule.

Detailed reviewable design: [multi-active plan ADR](../../architecture/v1.2-multi-active-plans.md). Failure paths and planned evidence: [migration risks](../../architecture/v1.2-migration-risks.md).

## Component boundaries

```text
Workout / Calendar / Library / Progress
                  |
        Typed runtime/query ports
          /                 \
Strength authoring       Running authoring
sets/targets            immutable structured day revisions
          \                 /
       Shared plan/schedule commands
       type + readiness + revision checks
                  |
       Serialized SQLite writer
     /            |             \
Session facts  Schedule facts   Imported activity facts
     |             \             /
History overlays    Confirmed match events
     \                  /
        Rebuildable Calendar/Progress
                  |
      Canonical logical backup graph
       manual GTBK / automatic Drive
```

| Component | Existing / proposed paths | Responsibility |
|---|---|---|
| Plan creation and readiness | Existing `src/domains/plans/`, `ownedPlanRepository.ts`; proposed `src/domains/running/`, `runningPlanRepository.ts` | Explicit type chooser; inactive creation; type-specific validation; revisions and immutable owned identities. |
| Activation | Existing `starterPlanRepository.ts`, `scheduleRepository.ts` | Paired activation/deactivation scoped to sport; full expected pair; idempotent receipts. |
| Scheduling | Existing `src/domains/scheduling/scheduleState.ts`, `scheduleCommands.ts`, `scheduleRepository.ts` | Prospective versions, per-plan weekday/rotation rules, explicit overrides, local-date/timezone semantics. |
| Today selection | Existing `src/bootstrap/scheduleRuntime.tsx`, `workoutAppRuntime.tsx`; proposed `activePlanSelection.ts` | Recovery priority, both typed contexts, explicit selected schedule inputs; no ambiguous first-row selection. |
| Strength session start | Existing `plansWorkoutRepository.ts`, proposed `workout_session_schedule_links` | Validate selected plan/day, snapshot targets and schedule provenance atomically, preserve one in-progress session. |
| Unified Calendar | Existing `historyRepository.ts`; proposed `trainingCalendarRepository.ts` | Stable typed events from effective Strength history, schedule previews and imported Running facts. |
| Import/match | Proposed Garmin tables and `runningActivityMatchRepository.ts` | Separate deduped source facts; explicit match confirmation; auditable relation changes; no activation side effects. |
| Recovery/portability | Existing `migrationRunner.ts`, `recoveryBackup.ts`, `logicalBackupRepository.ts`, `logicalRestoreRepository.ts`, `logicalMergeRepository.ts` | Every supported legacy producer remains restorable; all new authoritative facts included/remapped; derived state rebuild completes before trusted UI. |

## Findings that change the roadmap

| Finding | Consequence | Evidence |
|---|---|---|
| Global unique indexes for plans and schedules | Constraint migration is a prerequisite for concurrent presentation | `0008_schedule_activation.ts:472` |
| Existing schedule tables are already plan-scoped | Reuse engine; change selection/cardinality and typed readiness rather than creating a second scheduler | `0008_schedule_activation.ts:257` |
| Single in-progress session is a separate unique index | Preserve workout/recovery protection while expanding plan activation | `0001_initial.ts:333` |
| Multiple active readers and previews reject >1 | Change runtime ports and repository validation in same domain phase | `starterPlanRepository.ts:259`, `scheduleRepository.ts:824`, `scheduleRuntime.tsx:495`, `workoutAppRuntime.tsx:1913` |
| Legacy Today uses `LIMIT 1` and copied-only plans | Eliminate production fallback or explicitly constrain legacy API to Strength | `plansWorkoutRepository.ts:1374/:1540` |
| Workout start takes day ID and rediscovers plan independently | Pass explicit selection identity and validate ownership inside start transaction | `workoutAppRuntime.tsx:2474` |
| Completion rediscovers currently active schedule | Persist session schedule provenance and replay by original source identity | `scheduleRuntime.tsx:922` |
| Restore rejects >1 active plan; merge globally demotes | Portability is part of domain readiness, before the first Running plan is user-owned | `restoreCommands.ts:224`, `mergePlan.ts:1107/:1157` |
| Migration 23 reads live backup table list | Freeze historic list before registering new tables; test fresh install, not only upgrade | `0023_automatic_drive_backup.ts:34` |
| Completed opportunity requires Strength session FK | Separate imported fulfillment relation; no fake Strength sessions | `0008_schedule_activation.ts:395` |
| Calendar stores per-date states and filters historical misses by current active schedule | New typed event query must preserve multiple events and past facts after plan switch | `historyRepository.ts:783/:828` |
| Current month query scans all history and counts each session | Batch/range queries with overlay-aware effective dates; protect workout commit performance | `historyRepository.ts:762/:797` |

All source paths in this table are under `src/platform/sqlite/` unless an explicit `src/bootstrap`/domain path is stated in the component table or companion ADR. File basenames resolve to the existing repository/migration files identified there.

## Patterns to follow

### Paired activation scoped to plan kind

Use `plans.plan_kind` as canonical type, with a guarded immutable copy on owned schedules for per-kind partial uniqueness. Index predicates cannot join another table. Both active flags change together inside the existing exclusive writer, with a shared post-write pair validator. Preserve independent revisions and schedule state for the other sport. Keep old plans and histories when replacing an active plan.

### Explicit selection identity at every command

```typescript
// Proposed application contract; not implemented.
type ScheduledSelection = Readonly<{
  planKind: 'strength' | 'running';
  planId: string;
  planDayId: string;
  scheduleId: string;
  scheduleVersionId: string;
  opportunityId: string;
  expectedPlanRevision: number;
  expectedScheduleRevision: number;
}>;
```

Strength start validates this selection in the transaction and snapshots provenance. Running opens plan/import context and never uses the Strength start API. Both sports can have work on the same date without completing or skipping each other.

### Immutable planned intent, imported facts and confirmed relationships

Running edits append structured day revisions; schedule-version bindings preserve past intended workouts. Garmin/FIT imports preserve independent activity facts. Owner confirmation binds exact activity revision and exact opportunity/version/day revision. An auditable unmatch affects the relation, not either source. Date/title similarity only suggests a candidate.

### Restore and merge as an end-to-end graph

New columns require explicit legacy materialization defaults because the parser checks exact keys. New tables require versioned allow-lists, ownership filters, FK definitions, merge conflict classes, portable ID remaps, source-generation triggers and deterministic rebuilds. A successful schema migration without those paths is not a usable domain foundation.

### Retire advisory timing without deleting historical configuration

Phase 10 cadence/cluster playback is explicitly advisory and stored separately from between-set rest. Preserve all old snapshots/configuration as dormant legacy data; retire authoring and gate every playback/foreground/queued-callback path. New sessions resolve advanced timing off. Existing sessions retain sets, pointers and between-set rest recovery, with a concise compatibility notice when needed. Do not force completion or discard unless implementation cannot prove safe cue isolation; then block cutover for a reviewed compatibility path. The companion ADR identifies exact runtime seams and the risk document adds TIM-01–03 verification.

## Anti-patterns to avoid

- Removing unique indexes while retaining singleton `LIMIT 1`, unscoped active joins or scalar revision expectations.
- Treating the two-sport prototype as permission to run two Strength sessions simultaneously.
- Inferring sport from exercise metric profile, legacy plan title or imported file name.
- Reclassifying or deleting old set/timing snapshots to fit the new presentation.
- Marking a scheduled run complete merely because an import is nearby in time.
- Reusing `workout_sessions` for imported Running facts to satisfy an existing FK.
- Adding source tables to a live registry without testing historical migration users of that registry.
- Deriving past Calendar facts from current plan activation, or flattening multiple events into one date status.

## Roadmap recommendations

1. **Multi-active/Running domain foundation:** owner cardinality; schema/readiness; all singleton replacements; provenance; Running revision contracts; import/match storage contract; full backup/restore/merge support. Deep research and real SQLite verification required.
2. **Shared visual/root shell:** consume typed read ports and maintain the four approved roots. Presentation can be developed against frozen contract fixtures after the domain contract is stable.
3. **Workout/Active:** preserve commit gating, one in-progress session, recovery priority and all legacy snapshots; render prototype controls faithfully.
4. **Calendar/animation:** consume event identities and query ranges rather than inferring status; prove multi-event history and same-date independence before gesture/pixel evidence.
5. **Library/creation/Running:** explicit type chooser and inactive creation; structured Running editor with domain validation/revisions; schedule actions bind a specific plan.
6. **Progress/Garmin:** implement API/manual import adapters and owner-confirmed matching against recoverable foundation; never invent progress/goal evidence. See Garmin ADR for access/auth constraints.
7. **Native acceptance:** process death, offline workouts, old/new backups, confirmed matching, Light/Dark/System, accessibility, visual parity and performance. Prototype approval is not proof of migration correctness.

If the orchestrator places import-table implementation in the Garmin phase, the domain phase must still freeze its schemas and match/portability contract, and the first phase that writes imported data must deliver backup/merge/rebuild support in the same release. No unrecoverable intermediate user data is acceptable.

## Scale and performance

This is a single-owner local app; user-count scaling tables are misleading. Relevant dimensions are history length, calendar range and imported sample volume.

| Concern | Ordinary personal history | Long history / imports | Required guard |
|---|---|---|---|
| Active schedule lookup | Up to two under proposed limit | Same bounded cardinality | Read one coherent snapshot; reject ambiguity. |
| Calendar | Visible month plus adjacent weeks | Avoid scanning/counting all sessions | Range-indexed, batched summaries with correction overlays. |
| Imported samples | Summary/laps and bounded chunks | Existing archive size/count limits apply | Garmin ADR payload bounds; no unbounded per-sample table growth. |
| Writer contention | Set commits remain highest-priority user path | Parse imports before short write transaction | Preserve shipped 150 ms p95 working-set commit/dock budget. |
| Backup/rebuild | Full canonical source graph | Explicit size and duration fixtures | Restore gate stays closed until all new derivatives rebuild. |

## Open owner decisions

MAP-01 cardinality is the only schema-defining unresolved choice: one active plan per sport versus several same-sport plans. Other proposed defaults needing review are Strength/recovery primary Today behavior, Weekday-only Running and single daily slot, per-sport local-wins activation on merge, one-to-one confirmed Running fulfillment, and retaining the existing activation-during-workout restriction. The exact questions and impact are in the companion ADR.

## Sources and research method

- Live repository and archived shipped contracts cited in the companion ADR, read at the baseline above. Owner brief overrides the prototype's stale review-status field and older one-plan contract.
- https://www.sqlite.org/partialindex.html — current official documentation; search verified prohibition on other-table references in partial predicates.
- https://sqlite.org/lang_altertable.html — current official documentation; additive column/default restrictions.
- https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ — pinned SDK family official transaction scope documentation.

`architecture-research-plan.json` records questions and provider availability. `gsd-tools query research-plan` selected `websearch` for both; official results were cross-checked against implementation. `classify-confidence --provider websearch --verified` returned **MEDIUM**, used for both cached digests and these research conclusions. Cache keys: `cef6bff1359e17674859fcba8903a48161a5d0bb9751a646c8a843d7f70bdca4` and `610247350a508a66990270b1d06f12b6f52c947ed06ee5089589e7cb53eee821`. Direct SQLite HTTPS extraction failed TLS, so no claim relies on an unseen fetched document or a fabricated publication date. No new dependency recommendation is required.

Scope coverage checked: activation, schedules, Today, session start/completion, Calendar/history, migrations/recovery, logical backup/restore/merge, automatic backup generation and Running match boundaries. Tests are specified, not executed. The browser/prototype walkthrough and Garmin ecosystem research belong to the other assigned workstreams.
