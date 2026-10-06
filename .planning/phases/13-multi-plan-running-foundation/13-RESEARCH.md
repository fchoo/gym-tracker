# Phase 13: Multi-Plan & Running Foundation - Research

**Researched:** 2026-10-06
**Domain:** SQLite-authoritative multi-plan identity, Running scheduling, imported facts, provenance, and portability
**Confidence:** MEDIUM overall; HIGH for the inspected schema-27/code baseline and MEDIUM for unimplemented schema/port recommendations

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Owner-review checkpoints
- **MAP-01:** At-most-one active plan per sport is the recommended partial-index policy, but remains unaccepted. The first irreversible constraint task must be a decision checkpoint and show the alternative multi-plan selection/index design.
- **TIM-01:** Preserve all legacy cadence/cluster configs and snapshots. Retiring authoring, reconciliation, queued callbacks, and playback while keeping set/rest recovery is recommended but remains owner-review gated.
- **GAR-ARCH:** Phase 13 builds provider-independent import/match facts. It does not introduce a hosted broker.

### Claude's Discretion
- Exact migration file split and internal type names after checking current schema 27.
- Query batching/indexes that preserve the documented identities and measured budgets.

### Deferred Ideas (OUT OF SCOPE)
- Running Rotation scheduling and cumulative multi-activity fulfillment.
- Official Garmin transport/broker implementation belongs to Phase 18 and a separate security review.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| DOM-01 | Support multiple active owned Strength and Running plans with independent schedules; migrate the shipped one-active-plan assumptions without bypassing repository rules. | MAP-01 gate, singleton inventory, paired activation validator, and coordinated repository/runtime cutover. [VERIFIED: .planning/REQUIREMENTS.md:17; src/platform/sqlite/migrations/0008_schedule_activation.ts:472-477] |
| DOM-02 | Persist new plan structure in an inactive state; creation, import, duplication and editing must not activate it implicitly. | Reuse the shipped inactive-copy result and separate activation command. [VERIFIED: .planning/REQUIREMENTS.md:18; src/platform/sqlite/repositories/starterPlanRepository.ts:1128-1154,1360-1379] |
| DOM-03 | Migrate existing plans, sessions and schedules transactionally while preserving identifiers, workout recovery state and authoritative completed history. | Destructive migration with validated recovery copy, deterministic `strength` backfill, canonical fact digests, and failure injection. [VERIFIED: .planning/REQUIREMENTS.md:19; src/platform/sqlite/migrationRunner.ts:201-273] |
| DOM-04 | Resolve each plan's dates and rotation independently with explicit timezone/effective-date ownership; aggregate all eligible occurrences for Workout and Calendar. | Reuse plan-scoped schedule versions, pass explicit schedule identity to every command, and add a range-based typed event query. [VERIFIED: .planning/REQUIREMENTS.md:20; src/platform/sqlite/migrations/0008_schedule_activation.ts:274-331] |
| DOM-05 | Represent overlapping plan occurrences and apply explicit Move run, Move strength or Keep both decisions without rewriting historical facts. | Stable per-occurrence identity and append-only override/collision events; no date-only status collapse. [VERIFIED: .planning/REQUIREMENTS.md:21; .planning/architecture/v1.2-multi-active-plans.md:143-147] |
| DOM-06 | Choose the intended scheduled occurrence when several plans are active and preserve the existing single recovered in-progress workout authority. | Replace scalar Today/start inputs with a selected occurrence carrying plan/schedule/version/opportunity/revision provenance. [VERIFIED: .planning/REQUIREMENTS.md:22; src/domains/workout/index.ts:21-35] |
| DOM-07 | Persist Recovery, Long run, Progression, Tempo, Intervals, Hills and Fartlek sessions with common and contextual steps, order and stable identities. | Stable Running session roots plus immutable revisions and version-bound ordered slots. [VERIFIED: .planning/REQUIREMENTS.md:23; .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:27-30] |
| DOM-08 | Persist distance, optional owner-selected time/date, benchmark provenance and available training days; keep 10 km and Half Marathon times unset until explicitly chosen. | Running profile/goal source facts with nullable owner values and provenance; no zero/default fabrication. [VERIFIED: .planning/REQUIREMENTS.md:24] |
| DOM-09 | Preserve pace, heart-rate-zone and RPE targets as advisory session fields without guaranteeing an outcome or collecting gender or height. | Strict discriminated Running target schemas; source facts never mutate workout targets. [VERIFIED: .planning/REQUIREMENTS.md:25] |
| DOM-10 | Persist activity source, external ID, content hash, timestamps, sport subtype, distance, elapsed/moving time, available HR, route and lap facts as source evidence. | Provider-independent immutable activity/payload aggregates; Phase 18 supplies bytes/transport. [VERIFIED: .planning/REQUIREMENTS.md:26; .planning/architecture/v1.2-garmin-import.md:77-93] |
| DOM-11 | Deduplicate repeat sync and manual import using external Garmin activity identity and content hash, including FIT-to-API and API-to-FIT order. | Separate verified external-reference and exact-byte-hash indexes with receipt replay and conflict outcomes. [VERIFIED: .planning/REQUIREMENTS.md:27; .planning/architecture/v1.2-garmin-import.md:95-115] |
| DOM-12 | Require explicit owner confirmation of the selected scheduled occurrence before creating a durable activity match; import alone never completes or activates a plan. | Match/unmatch/reassign event ledger plus rebuildable one-to-one current relation. [VERIFIED: .planning/REQUIREMENTS.md:28; .planning/architecture/v1.2-garmin-import.md:147-159] |
| DOM-13 | Build Calendar aggregation and comparable Running best-effort/goal views from durable facts with replayable projections and truthful missing/sparse states. | Source-fact query ports and deterministic projection freshness/rebuild semantics. [VERIFIED: .planning/REQUIREMENTS.md:29; src/platform/sqlite/repositories/progressRepository.ts:320-396] |
| DOM-14 | Persist optional dated bodyweight entries, edits and deletions for relative-strength views only; entries never alter workout targets. | Separate measurement aggregate; do not reuse the exercise metric profile named `bodyweight_reps`. [VERIFIED: .planning/REQUIREMENTS.md:30; src/domains/metrics/contracts.ts:5-25,115-129] |
| DOM-15 | Extend backup, restore and merge to all multi-plan, Running, imported-activity, match, goal and bodyweight facts and identities without duplicate creation. | Successor graph/version, ownership filters, FK closure/remaps, conflict preview, trigger restoration, and rebuild gate. [VERIFIED: .planning/REQUIREMENTS.md:31; src/domains/portability/backupContracts.ts:1-15,31-110] |
| DOM-16 | Keep workouts fully offline and acknowledge edits/completion only after exclusive transactions commit; notifications and UI feedback follow durable results. | Preserve the FIFO `BEGIN IMMEDIATE` writer and return authoritative state only after `COMMIT`. [VERIFIED: .planning/REQUIREMENTS.md:32; src/platform/sqlite/serializedWriter.ts:6-8,27-73] |
| DOM-17 | Preserve correction revisions, remove/restore tombstones, metric identities, original snapshots and explicit recommendation acceptance across the new multi-plan model. | Extend source graph and queries without rewriting existing sessions, overlays, snapshots, or decisions. [VERIFIED: .planning/REQUIREMENTS.md:33; src/platform/sqlite/repositories/historyRepository.ts:760-864] |
</phase_requirements>

## Summary

Phase 13 must ship as one coherent domain/storage release: the schema, active-pair validators, typed query/command ports, workout provenance, Running slots, import/match/bodyweight facts, and complete portability graph have to agree before later UI phases may persist or display the new model. The current database is schema 27, still has global one-active-plan/one-active-schedule indexes, scalar active readers, a start command without schedule provenance, completion that rediscovers the active schedule, a one-opportunity-per-date/source uniqueness rule, and a v2 portability allowlist. [VERIFIED: src/platform/sqlite/migrations/index.ts:21-60; src/platform/sqlite/migrations/0008_schedule_activation.ts:367-477; src/domains/workout/index.ts:21-35; src/bootstrap/scheduleRuntime.tsx:886-943; src/domains/portability/backupContracts.ts:1-110]

The narrow production tracer must finish before breadth expansion. It migrates a synthetic schema-27 Strength database, retains its active/recoverable workout, defines the minimum Running readiness contract, adds one inactive Running plan with two ordered sessions on the same weekday, applies the MAP-01-selected activation policy, materializes two distinct opportunities, reads one exact planned-Strength occurrence through `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence(occurrenceId)` with immutable targets and null-on-stale semantics, then round-trips that source graph through successor backup and clean restore with canonical parity. Import/match/bodyweight breadth and full merge expansion follow only after this slice passes. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:73-79]

**Primary recommendation:** Put MAP-01 before any uniqueness DDL; implement the complete migration/readiness/two-slot/activation/occurrence/detail/recovery/backup-restore tracer with no dependency on later breadth; finalize migration 0028 and all new source-generation triggers once in that tracer plan; then expand the seven Running types, import/removal, matching, bodyweight, projections, and merge. Put TIM-01 before deleting/gating any timing entry point. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-40]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Plan kind and active cardinality | Database / Storage | Domain / Application | SQLite constraints prevent impossible cardinality; domain validation ensures plan/schedule pairs and readiness agree. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:472-477; src/platform/sqlite/repositories/scheduleRepository.ts:799-856] |
| Running session revisions and same-day slots | Domain / Application | Database / Storage | Pure type-specific validation owns meaning; immutable revision/slot rows preserve it. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:47-61] |
| Today/Calendar occurrence selection | Domain query ports | Database / Storage | Screens consume typed snapshots; range queries aggregate stable identities without SQL in presentation. [VERIFIED: .trae/rules/rules.md:10-14; src/bootstrap/scheduleRuntime.tsx:132-221] |
| Strength workout start/completion provenance | Database / Storage | Domain / Application | Selection is validated and snapshotted atomically; replay resolves by stored identity, never current activation. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-25] |
| Imported activity facts and matching | Domain / Application | Database / Storage | Provider adapters deliver normalized input; independent immutable source aggregates and audited match events own durable semantics. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:27-31] |
| Bodyweight source facts | Domain / Application | Database / Storage | Dated measurement commands own validation; Progress consumes facts without changing targets. [VERIFIED: .planning/REQUIREMENTS.md:30] |
| Backup/restore/merge | Portability domain | Database / Storage | Versioned parsers, identity maps, graph closure, one writer transaction, and deterministic rebuild form one boundary. [VERIFIED: src/domains/portability/restoreCommands.ts:147-165,230-300; src/platform/sqlite/repositories/logicalRestoreRepository.ts:376-438] |
| Provider transport and product screens | Out of Phase 13 | Phase 18 / later UI | Phase 13 exposes ports and facts only; broker/transport is explicitly deferred. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-36,83-88] |

## Project Constraints (from .trae/rules/rules.md)

- Read and preserve the repository `AGENTS.md` routing contract. [VERIFIED: .trae/rules/rules.md:1-3]
- Treat SQLite source facts as authoritative. [VERIFIED: .trae/rules/rules.md:10]
- Keep notifications, projections, and recommendations replayable or rebuildable. [VERIFIED: .trae/rules/rules.md:11]
- Never acknowledge a set before its exclusive transaction commits. [VERIFIED: .trae/rules/rules.md:12]
- Preserve bundled versus user-owned data boundaries. [VERIFIED: .trae/rules/rules.md:13]
- Keep the workout critical path offline. [VERIFIED: .trae/rules/rules.md:14]
- Write tests with each behavior; integrity-critical modules require complete branch coverage. [VERIFIED: .trae/rules/rules.md:15]
- Future implementation commits must be atomic and end with `Co-authored-by: TRAE CLI <noreply@users.noreply.github.com>`. This research task does not commit. [VERIFIED: .trae/rules/rules.md:16-19]
- The two source-document paths written in `.trae/rules/rules.md` are currently absent; matching files exist with the `bytedance-` filename prefix and were used only as supporting architecture/QA evidence. [VERIFIED: environment audit 2026-10-06]

## Verified Schema-27 Baseline

### Discrete contract values

| Contract | Verbatim values | Planning consequence |
|---|---|---|
| Current schema | `version: 27`, `name: "advanced-timing-target-ownership"`, `kind: "additive"` [VERIFIED: src/platform/sqlite/migrations/0027_advanced_timing_target_ownership.ts:30-33] | Allocate the next version at execution time; do not hard-code 28 until the registry is re-read. |
| Migration kinds | `"additive" | "destructive" | "long"` [VERIFIED: src/platform/sqlite/migrationRunner.ts:14-22] | The constraint-changing migration is destructive and therefore requires a validated recovery copy. |
| Plan kind target | `strength` and `running` [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-30] | Backfill every legacy plan/schedule to `strength`; never infer from metrics. |
| Global workout state | `status = 'in_progress'` [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:333-335] | Preserve exactly one recoverable Strength workout globally, independently of active-plan count. |
| Existing schedule modes | `"weekday" | "rotation"` [VERIFIED: src/platform/sqlite/repositories/scheduleRepository.ts:52-75] | Strength retains both; initial Running uses Weekday with multiple ordered slots. |
| Existing start modes | `"scheduled" | "alternate" | "rest_day" | "empty"` [VERIFIED: src/domains/workout/index.ts:9-35] | New selected-occurrence input must preserve these meanings while adding provenance. |
| Existing opportunity outcomes | `'completed'`, `'skipped'`, `'planned_not_completed'`, `'advanced'`, `'rest_day'` [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:380-411] | Running match fulfillment cannot masquerade as the existing Strength `completed` row that requires a `session_id`. |
| Legacy timing states | `'idle'`, `'running'`, `'paused'`, `'stopped'`, `'expired'`; modes `'per_rep'`, `'cluster'` [VERIFIED: src/platform/sqlite/migrations/0021_advanced_set_timing.ts:93-130] | TIM-01 validation must cover every retained state and both modes. |
| Accepted archive schema versions | `[15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]` [VERIFIED: src/domains/portability/restoreCommands.ts:147-150] | Successor parsers must keep these producer versions readable. |
| Current portable formats | `LOGICAL_BACKUP_FORMAT_VERSION = 2`; accepted `[1, 2]` [VERIFIED: src/domains/portability/backupContracts.ts:1-5] | Add a successor graph/version; do not redefine v1/v2 table requirements. |
| Archive bounds | `32 MiB` archive, `24 MiB` plaintext, `100_000` total rows, `25_000` rows/table, `64 KiB` string, nesting depth `16` [VERIFIED: src/domains/portability/backupContracts.ts:7-15] | Chunk imported samples and capacity-preflight them; never silently omit source facts. |
| Exercise metric named bodyweight | `"bodyweight_reps"` stores repetitions and source, not dated kg [VERIFIED: src/domains/metrics/contracts.ts:5-25,115-129] | DOM-14 needs a separate measurement aggregate; naming must avoid conflating the two. |

### Singleton and provenance inventory

| Existing source seam | Exact symbol / behavior | Required Phase 13 change |
|---|---|---|
| `0008_schedule_activation.ts` | `one_active_owned_schedule` and `one_active_owned_plan` are global partial unique indexes. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:472-477] | Replace only after MAP-01; create replacement constraints before dropping global indexes in the same migration transaction. |
| `starterPlanRepository.ts` | `readActiveSchedule()` rejects more than one plan/schedule; `deactivateCurrent()` changes the global pair. [VERIFIED: src/platform/sqlite/repositories/starterPlanRepository.ts:233-275,510-537] | Return/validate active pairs by plan kind; deactivate only the selected policy scope. |
| `scheduleRepository.ts` | `readActiveSchedulePair()` returns one scalar pair; activation globally deactivates it and Strength-readiness requires working-set targets. [VERIFIED: src/platform/sqlite/repositories/scheduleRepository.ts:799-918,941-1089] | Centralize `assertActivePlanPairs`; use kind-specific readiness and full expected pair(s). |
| `scheduleRuntime.tsx` | `activeSchedule()` rejects `rows.length > 1`; `loadToday()` returns one `ScheduleTodayRead`. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:481-499,576-610] | Read a coherent collection/snapshot and require an explicit schedule for every mutation. |
| `plansWorkoutRepository.ts` | Start inserts `(plan_id, plan_day_id)` from caller input but carries no schedule/version/opportunity identity. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:776-876] | Validate plan/day ownership and selection revisions inside the start transaction; insert immutable schedule link/provenance atomically. |
| `workoutAppRuntime.tsx` | `startPlanDay(dayId, mode)` separately discovers a plan from Today/legacy activation. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:950-953,2473-2502] | Replace with a selected-occurrence object returned by the read port; no independent rediscovery. |
| `scheduleRuntime.tsx` completion | `completeScheduledSession()` falls back to `activeSchedule()` after checking existing consumed opportunity. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:886-943] | Resolve the stored session link and replay a stable receipt even after plan activation changes. |
| `workoutAppRuntime.tsx` completion | Workout outcome commits first, then schedule completion runs separately and errors are swallowed with `.catch(() => null)`. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3949-3983] | Preserve workout commit truth, but make durable schedule-reconciliation provenance/receipt explicit so retry cannot be lost or redirected. |
| Legacy Today | `getTodayView()` and `getActivation()` use copied-plan `LIMIT 1`. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:1366-1384,1538-1572] | Remove from production Today or explicitly constrain to a verified Strength compatibility path that rejects ambiguity. |
| Calendar history | Month loading scans all sessions, performs a count query per session, filters missed opportunities through current active schedules, and collapses into date states. [VERIFIED: src/platform/sqlite/repositories/historyRepository.ts:760-864] | Add range-indexed batched typed events with stable source IDs; historical facts must not depend on current activation. |
| Portability | Restore validation rejects more than one active plan; merge demotes archive activation if any local plan/schedule is active. [VERIFIED: src/domains/portability/restoreCommands.ts:209-228; src/domains/portability/mergePlan.ts:1093-1172] | Validate/resolve the projected whole graph under MAP-01-selected cardinality, by sport/policy, before commit. |
| Backup generation | Migration 23 imports live `LOGICAL_BACKUP_TABLES` and creates triggers from it. [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:1-36,44-58] | Freeze the historical list used by migration 23; successor migrations create triggers only after new tables exist. |

## Standard Stack

No new runtime package is needed for Phase 13. Use the installed/locked stack and postpone FIT decoding/OAuth packages to Phase 18. [VERIFIED: package.json:92-132; .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-36]

### Core

| Library / Tool | Locked version | Published | Purpose | Why standard here |
|---|---:|---|---|---|
| TypeScript | `~6.0.3` | 2026-04-16 | Typed ports, discriminated unions, command/result contracts | Already project standard; no parallel handwritten transport/domain shapes. [VERIFIED: package.json:125-132; npm view exact version metadata 2026-10-06] |
| Expo / React Native | `~57.0.25` / `0.86.3` | 2026-09-24 / 2026-08-24 | Android runtime | Keep the shipped platform; do not combine this migration with an SDK upgrade. [VERIFIED: package.json:92-123; npm view exact version metadata 2026-10-06] |
| `expo-sqlite` | `~57.0.3` | 2026-09-11 | SQLite source graph and real-device contracts | Existing kernel already owns WAL reader plus FIFO `BEGIN IMMEDIATE` writer. [VERIFIED: package.json:96-110; src/platform/sqlite/connection.ts:142-206; npm view exact version metadata 2026-10-06] |
| Zod | `4.4.3` | 2026-05-04 | Strict external/persistence boundary schemas | Existing metric contracts use strict schemas; normalized import/Running commands should follow that boundary. [VERIFIED: package.json:123; src/domains/metrics/contracts.ts:1-33; npm view exact version metadata 2026-10-06] |

### Supporting

| Library / Tool | Locked version | Published | Purpose | When to use |
|---|---:|---|---|---|
| Jest | `29.7.0` | 2023-09-12 | Unit, host-SQLite, integration projects | Every task; extend existing suites rather than add a test framework. [VERIFIED: package.json:23-28,125-132; jest.config.js:26-90; npm view exact version metadata 2026-10-06] |
| React Native Testing Library | `14.0.1` | 2026-06-23 | Port/runtime component contracts | Only for typed runtime presentation adapters touched by Phase 13; no new UI scope. [VERIFIED: package.json:125-132; npm view exact version metadata 2026-10-06] |
| Native `migrations-effects` contract | Existing repository harness | — | Expo SQLite migration/rollback behavior | Required at the phase gate after host contracts. [VERIFIED: package.json:26,73; src/testing/contracts/migrationsEffects.contract.ts] |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|---|---|---|
| Existing schedule engine | A second Running scheduler | Rejected: duplicates timezone/version/override semantics and increases divergence risk. Add Running bindings/opportunities while reusing date/version primitives. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:47-61] |
| Existing SQLite writer | ORM/new database abstraction | Rejected: weakens established transaction and recovery seams without a Phase 13 need. [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-85; .trae/rules/rules.md:10-15] |
| Separate import source aggregate | Fake `workout_sessions` for runs | Rejected: existing completed opportunities require a Strength session FK and imported activity must stay independent. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:367-413; .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:27-31] |

**Installation:**

```bash
npm ci
```

`node_modules` is absent in this worktree, so `npm ci` is a Wave 0 environment prerequisite, not a package addition. [VERIFIED: environment audit 2026-10-06; package.json:6-9]

## Package Legitimacy Audit

Not applicable: Phase 13 installs no external package. The existing lockfile stack is retained, and FIT/OAuth packages remain out of scope until Phase 18. Therefore the package-legitimacy gate is not triggered. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-36,83-88]

## Architecture Patterns

### System Architecture Diagram

```text
Later UI / provider adapter inputs
          |
          v
Strict typed read + command ports
          |
          +------------------------+
          |                        |
          v                        v
Plan/schedule selection       Normalized activity/bodyweight commands
          |                        |
          +------------+-----------+
                       v
            FIFO exclusive SQLite writer
                       |
      +----------------+--------------------+
      |                |                    |
      v                v                    v
 Plan + Running     Strength session     Import/match/bodyweight
 source graph       provenance/facts     immutable source facts
      |                |                    |
      +----------------+--------------------+
                       v
            Versioned portability graph
             / restore / merge / rebuild
                       |
                       v
       Rebuildable Today / Calendar / Progress reads
```

The entry points are typed application commands, the decision points are kind/readiness/revision/cardinality checks inside the writer, and the outputs are committed source facts followed by rebuildable read models. No screen or future provider adapter owns SQL. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-31; src/platform/sqlite/sqliteKernel.ts:38-60,139-205]

### Component Responsibilities and Exact Seams

| Responsibility | Existing source/symbol to change or reuse | Planned extension |
|---|---|---|
| Migration registry/recovery | `migrations`, `CURRENT_SCHEMA_VERSION`, `createMigrationRunner`, `createExpoRecoveryBackupPort` [VERIFIED: src/platform/sqlite/migrations/index.ts:28-60; src/platform/sqlite/migrationRunner.ts:201-275; src/platform/sqlite/recoveryBackup.ts:73-125] | Successor migration(s), schema-27 fixture, recovery-copy proof, frozen schema-23 trigger list. |
| Paired activation | `readActiveSchedulePair`, `activePairMatches`, `activateScheduleTransaction`; starter equivalents [VERIFIED: src/platform/sqlite/repositories/scheduleRepository.ts:799-856,941-1101; src/platform/sqlite/repositories/starterPlanRepository.ts:233-318,1181-1299] | Kind/policy-scoped pair collection, shared invariant validator, complete expected active state. |
| Running authoring | `createOwnedPlanRuntimePort`, `OwnedPlanRepository`; existing Strength readiness remains separate [VERIFIED: src/bootstrap/ownedPlanRuntime.tsx:46-122; src/platform/sqlite/repositories/ownedPlanRepository.ts:137-224] | The tracer defines minimum `evaluateRunningReadiness` in `src/domains/running/contracts.ts` before activation consumes it; later breadth extends that same export plus stable roots/revisions. |
| Today/Calendar | `ScheduleTodayRead`, `loadToday`, `historyRepository.loadCalendarMonth` [VERIFIED: src/bootstrap/scheduleRuntime.tsx:191-221,576-677; src/platform/sqlite/repositories/historyRepository.ts:760-864] | `src/bootstrap/trainingFoundationRuntime.ts` exports `TrainingFoundationRuntimePort.loadPlannedStrengthOccurrence(occurrenceId): Promise<PlannedStrengthOccurrenceDetail | null>`; `src/domains/workout/index.ts` owns the immutable target-bearing result; `plansWorkoutRepository` implements exact query-only provenance/null-on-stale. Breadth adds coherent Today and bounded event ranges. |
| Workout start/completion | `StartWorkoutRequest`, `plansWorkoutRepository.startWorkout`, `completeScheduledSession`, `finishWorkoutCompleted` [VERIFIED: src/domains/workout/index.ts:9-44; src/platform/sqlite/repositories/plansWorkoutRepository.ts:776-876; src/bootstrap/scheduleRuntime.tsx:886-943; src/bootstrap/workoutAppRuntime.tsx:3973-3983] | Explicit selected occurrence, immutable session schedule link, durable completion receipt/reconciliation. |
| Import/match | No current imported-activity or Running-match production module was found by repository search. [VERIFIED: `rg` audit over `src`, `app`, and `tests`, 2026-10-06] | Provider-independent normalized contracts, immutable payload revisions/receipts, match ledger, current relation rebuild. |
| Bodyweight | Existing `bodyweight_reps` metric is not a dated kg history. [VERIFIED: src/domains/metrics/contracts.ts:115-129] | Separate dated measurement source facts, commands, tombstones, and Progress read seam. |
| Progress | `createProgressRepository` gates on projection freshness before reading projections. [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:320-396] | Add Running/bodyweight source/query ports without making UI caches authoritative. |
| Portability | `backupContracts`, `restoreCommands`, `mergePlan`, `logicalBackupRepository`, `logicalRestoreRepository`, `logicalMergeRepository` [VERIFIED: src/domains/portability/backupContracts.ts:1-110; src/domains/portability/restoreCommands.ts:147-300; src/platform/sqlite/repositories/logicalRestoreRepository.ts:376-438; src/platform/sqlite/repositories/logicalMergeRepository.ts:1264-1352] | Version-specific graph registry, new filters/refs/remaps/conflicts/triggers/rebuilds, old-reader compatibility. |

### Recommended Future File Map

These names are implementation recommendations, not current files; exact internal names remain planner discretion. [ASSUMED]

```text
src/domains/running/                         # schemas, readiness, selection, match commands
src/domains/activities/                      # normalized imported-fact contracts and identity rules
src/domains/bodyweight/                      # dated measurement commands and validation
src/platform/sqlite/repositories/
├── runningPlanRepository.ts                 # stable roots/revisions/bindings
├── importedActivityRepository.ts            # source aggregates/payloads/receipts
├── runningActivityMatchRepository.ts        # audited events + rebuilt relation
├── bodyweightRepository.ts                  # source facts/tombstones
└── trainingCalendarRepository.ts             # bounded multi-source event reads
tests/integration/
├── multi-plan-foundation-tracer.test.ts      # pre-breadth migration/readiness/slots/detail/recovery/roundtrip proof
├── multi-plan-activation.test.ts
├── running-foundation.test.ts
├── running-activity-match.test.ts
├── bodyweight-history.test.ts
└── multi-plan-portability.test.ts
src/platform/sqlite/repositories/
└── progressRepository.test.ts                 # direct Running/goal/bodyweight sparse/freshness/rebuild evidence
```

### Pattern 1: Explicit Selection, Snapshot at Start, Replay by Provenance

**What:** A read model returns a selected occurrence containing exact plan/day-or-session, schedule/version/slot/opportunity, local date/timezone, expected revisions, and source command identity. Start validates that object inside the exclusive transaction and writes the session plus immutable link. Completion reads the link and stable receipt; it never calls scalar `activeSchedule()`. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-25]

**When to use:** Every scheduled start, skip/move/miss, Running match, and completion/retry.

**Example:**

```typescript
// Proposed shape; field names may change. Enum values are locked above.
type SelectedOccurrence = Readonly<{
  planKind: "strength" | "running";
  planId: string;
  planDayOrSessionId: string;
  scheduleId: string;
  scheduleVersionId: string;
  slotId: string;
  opportunityId: string;
  localDate: string;
  timeZone: string;
  expectedPlanRevision: number;
  expectedScheduleRevision: number;
}>;
```

The values `"strength" | "running"` are quoted verbatim from the locked plan-kind decision. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-30]

### Pattern 2: Stable Running Root + Immutable Revision + Versioned Slot Binding

**What:** A stable Running session identity owns append-only immutable revisions. A future schedule version binds an exact session revision to `weekday` and an explicit stable slot/ordinal. Reordering writes a future version; past opportunities keep their earlier binding. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:47-61]

**When to use:** Every Running create/edit/duplicate/schedule operation.

**Critical same-day rule:** Existing Strength bindings have `UNIQUE(schedule_version_id, week_index, weekday)`, and existing opportunities have `UNIQUE(schedule_id, local_date, source)`. Both constraints would collapse two Running sessions on one weekday/date. The plan must introduce a Running-specific slot-aware binding and slot-aware opportunity identity, not merely update UI lists. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:301-331,367-414]

### Pattern 3: Immutable Source Facts + Audited Relation + Rebuildable Current View

**What:** Imported activity payloads and planned occurrences remain independent. Match/unmatch/reassign appends an event bound to exact source and opportunity revisions. A current one-to-one completion relation is derived and rebuildable. Bodyweight likewise uses dated source facts/tombstones, while relative-strength views are derived. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:77-115,147-159; .planning/REQUIREMENTS.md:30]

**When to use:** Import identity convergence, explicit matching, unmatching, restore/merge, and relative Progress.

### Pattern 4: Versioned Portability Graph, Not a Growing Global Allowlist

**What:** Keep v1/v2 definitions exact and introduce successor table definitions, refs, filters, conflict classes, ID maps, trigger lists, and rebuild recipes. Migration 23 must keep using its historical table list even on a fresh install. [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:1-36; src/domains/portability/backupContracts.ts:31-110]

**When to use:** Any new authoritative table or column. Adding a table to SQLite without adding it to the correct portability version is incomplete.

### Anti-Patterns to Avoid

- **UI-only concurrency:** Removing indexes or displaying two plans while scalar readers/deactivation/restore/merge remain global. [VERIFIED: .planning/research/v1.2/PITFALLS.md:11-23]
- **Date-only Running identity:** Same-day slots, overlapping sports, and candidate matches must not collapse to a local date or title. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:27-31]
- **Current-activation completion:** A completed session must never consume whichever schedule is active during retry. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:922-941]
- **Fake Strength sessions for imports:** Imported evidence stays independent of `workout_sessions`. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:27-31]
- **Global registry mutation:** Extending `LOGICAL_BACKUP_TABLES` in place without isolating migration 23 breaks fresh installs. [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:1-36]
- **Bodyweight metric conflation:** `bodyweight_reps` is reps/variation, not the owner's dated kg measurement. [VERIFIED: src/domains/metrics/contracts.ts:115-129]
- **Timing UI-only retirement:** Hidden foreground reconciliation and queued cue paths can continue even if controls disappear. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2546-2609,3192-3394]

## Migration, Trigger, Backup, Restore, and Merge Sequence

### 0. Decision and drift preflight

1. Re-read `CURRENT_SCHEMA_VERSION`; if it is no longer 27, renumber and update every fixture/allowlist rather than editing a shipped migration. [VERIFIED: src/platform/sqlite/migrations/index.ts:28-60]
2. Stop at **MAP-01** before defining same-sport uniqueness/indexes. Present both designs: (A) at most one active pair per sport with per-kind partial indexes; (B) multiple same-sport actives with no per-kind unique index and explicit ordered selection/cardinality in every query/command/merge preview. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-35]
3. Inspect the retained schema-27 fixture for one active pair, pair agreement, valid owned roots, schedule uniqueness, one in-progress session, FK/integrity health, and timing ownership. Abort on corruption; do not pick a winner. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:42-53]
4. Create and validate the recovery database because a non-additive migration triggers `RecoveryBackupPort`; retain it through one healthy post-upgrade startup. [VERIFIED: src/platform/sqlite/migrationRunner.ts:220-240; src/platform/sqlite/recoveryBackup.ts:73-125]

### 1. Freeze historical contracts before new tables

Keep the current v2 table definitions/list as the historical list consumed by migration 23. Introduce a versioned successor registry rather than making migration 23 import a future table list. Fresh database → latest must execute migration 23 before any new table exists without generating a trigger against a missing table. [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:1-36; .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:23-25]

### 2. Constraint-changing migration transaction

Within one destructive migration transaction:

1. Validate legacy cardinality and pair agreement.
2. Add checked immutable plan/schedule kind columns with deterministic legacy default `strength`; do not infer from plan title, metric profile, timed exercise, or history. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-25]
3. Create Running root/revision/profile, slot binding/opportunity, session provenance, activity/payload/reference/receipt, match-event/current relation, goal, and bodyweight source tables in parent-before-child order. Exact table names remain planner discretion. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:43-59; .planning/architecture/v1.2-garmin-import.md:77-93]
4. Create immutability/no-delete/identity/FK guards and replacement activation indexes selected by MAP-01. SQLite partial-index predicates cannot reference other tables, so any per-kind schedule index requires a guarded copied kind column. [CITED: https://www.sqlite.org/partialindex.html]
5. Create replacement indexes before dropping `one_active_owned_schedule` and `one_active_owned_plan`; keep the whole replacement atomic. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:472-477; .planning/architecture/v1.2-migration-risks.md:42-51]
6. Add generation triggers for every new authoritative table only after that table exists. Do not add triggers to rebuildable current relations/projections. [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:27-36]
7. Verify table/column shape, full index SQL/predicates from `sqlite_master`, `PRAGMA index_list`, trigger count/SQL, paired activation, stable IDs, unchanged fact digests, `foreign_key_check`, and `integrity_check`; `user_version` commits with the migration. [VERIFIED: src/platform/sqlite/migrationRunner.ts:242-273]

Migration 0028 has one owning tracer plan and is final after this transaction ships: it includes every Phase 13 source table and source-generation trigger. Later tasks may add tests only; a discovered schema defect requires a separately numbered successor migration and must never rewrite 0028.

SQLite `ALTER TABLE ... ADD COLUMN` supports checked columns but `NOT NULL` needs a non-null default; added constraints are tested against existing rows. Use that only for deterministic legacy defaults, not invented Running facts. [CITED: https://sqlite.org/lang_altertable.html]

### 3. Coherent runtime cutover

Ship schema and all active readers/commands in the same release: starter activation, schedule activation, Today, date overrides, timezone decisions, skip/miss/advance, workout start, completion reconciliation, restore validation, merge normalization, Calendar, and Progress. Any retained legacy scalar method must be explicitly Strength-only and fail on ambiguity. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:10-24]

### 4. Successor backup collection

After every new source table has ownership filters and exact primary keys, collect a coherent successor snapshot and captured generation using the serialized database boundary. Keep credentials, transport jobs/cursors, UI caches, current completion overlays, and Calendar/Progress projections outside the portable graph. Preserve v1/v2 parsing and add schema successor support without weakening exact-key validation. [VERIFIED: src/platform/sqlite/repositories/logicalBackupRepository.ts:153-248; src/domains/portability/backupContracts.ts:235-243,396-473]

### 5. Restore sequence

1. Authenticate/decrypt (manual GTBK) or validate the already verified automatic snapshot before any source mutation.
2. Select table/column/reference definitions by archive format/schema; materialize only explicit legacy defaults such as `plan_kind = strength`.
3. Validate owner identity, graph closure, active pairs under MAP-01, at most one in-progress Strength session, Running slot uniqueness, match one-to-one rules, and bounds.
4. In one writer transaction: capture current owned rows, suspend only known source delete/generation triggers, delete in reverse dependency order, insert in dependency order, recreate the exact captured/new trigger set, compare canonical identities/facts, run FK checks, and mark `rebuild_pending`. [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:132-175,197-240,269-373,376-438]
5. Advance/realign automatic-backup dirty state exactly once through the reviewed restore/handover seam; do not rely on the suspended per-row triggers and do not let derivative rebuilds manufacture generations. [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:72-83; .planning/milestones/v1.1-phases/12-automatic-google-drive-sync/12-CONTEXT.md:95-109]
6. Rebuild match current relation, history/Calendar/Progress/search projections deterministically; trusted UI stays gated until ready. [VERIFIED: .planning/milestones/v1.1-phases/11-portable-history-merge-restore/11-CONTEXT.md:40-49]

### 6. Merge sequence

1. Preflight the complete projected result, not each plan independently. Same portable plan with conflicting kind is a conflict. Apply owner-scoped activity/bodyweight identities and match closure before preview. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:186-195]
2. Resolve active candidates once under MAP-01-selected policy. The current `planAggregate()` global `activeLocalPlanExists`/`activeLocalScheduleExists` demotion must be replaced. [VERIFIED: src/domains/portability/mergePlan.ts:1093-1172]
3. Bind preview to local fingerprint/revisions; any intervening plan/activation/import/bodyweight mutation invalidates it.
4. Commit settings and all accepted/remapped aggregates in one exclusive transaction, verify graph/FK/canonical slice, and mark `rebuild_pending`; no-op duplicate/local-won plans return ready only after fingerprint validation. [VERIFIED: src/platform/sqlite/repositories/logicalMergeRepository.ts:1264-1352]
5. Rebuild before readiness; automatic-backup generation must advance for the committed new source graph, never because a derivative rebuild ran.

## Domain Seam Details

### Running same-day slots

- Keep Strength's existing schedule binding uniqueness unchanged. A Running binding must identify the exact stable Running session, immutable revision, schedule version, weekday, and ordered slot. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:27-30]
- Model each slot as a separately addressable occurrence/event. Two same-date Running slots plus a Strength opportunity are three identities; completing/moving/matching one cannot affect the others. [VERIFIED: .planning/architecture/v1.2-multi-active-plans.md:131-147]
- Existing opportunity identity `UNIQUE(schedule_id, local_date, source)` is insufficient for same-day Running. Include stable slot identity in the Running opportunity key or use a Running-specific opportunity table; never reuse a date-only uniqueness rule. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:367-414]
- Initial Running supports Weekday only; Running Rotation and cumulative multi-activity fulfillment are deferred. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:83-88]

### Query → start → completion provenance

1. **Query:** return recovery plus every eligible Strength/Running context from one coherent SQLite snapshot. Include stable event/opportunity IDs and exact schedule version/slot/session revision, not only `ScheduleTodayRead`'s current scalar pair. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:210-221; src/platform/sqlite/sqliteKernel.ts:46-60,179-205]
2. **Selection:** UI later passes back the selected object and expected revisions. Stale plan/day ownership or schedule version fails closed; no session row is inserted.
3. **Start:** validate the plan kind, plan/day membership, readiness, opportunity state, schedule/version/slot, local date/timezone, and one-active-workout invariant inside the writer. Insert `workout_sessions`, snapshots, provenance link, and stable command receipt atomically. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:776-876; src/platform/sqlite/migrations/0001_initial.ts:333-335]
4. **Completion:** source workout completion remains authoritative even if later schedule reconciliation retries. Reconciliation uses the stored link and request receipt; switching active plans cannot redirect it. Do not swallow an unrecorded reconciliation without durable pending/retry evidence. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3973-3983; src/bootstrap/scheduleRuntime.tsx:886-943]

### Imported activity and match seams

- Phase 13 accepts validated provider-independent normalized drafts; it does not select files, decode FIT, hold credentials, call Garmin, or host a broker. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-36,83-88]
- Keep exact source bytes hash and verified external reference as independent identity signals. Exact replays return the existing receipt; same external ID/different hash becomes an immutable revision requiring explicit acceptance; conflicting resolutions never silently coalesce. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:95-115]
- Import commit writes all source rows plus receipt in one short transaction and never activates/creates a plan or Strength session. Match is a separate confirmation transaction bound to exact accepted payload and exact occurrence/revisions. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:27-31]
- Unmatch/reassign appends events. The rebuildable current relation enforces one current activity per opportunity and one current opportunity per activity; replay cannot overwrite a newer relation. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:147-159]
- Remove/restore is an explicit revision-fenced activity command. Removal appends a portable tombstone plus an audited current-match invalidation in the same exclusive transaction; restore appends a new event and leaves the activity unmatched until a fresh explicit confirmation. Exact replay is idempotent, stale commands write nothing, and delayed import/restore/merge cannot resurrect an old relation.

### Bodyweight and Progress seams

- Persist dated kg as integer grams with stable portable identity, revision, and explicit edit/delete tombstone or audit facts. Storing atomic measurements as integer grams follows the project source contract. [VERIFIED: /Users/bytedance/.gstack/projects/gym_tracker/bytedance-pre-git-design-20260815-132500.md:1070-1077]
- Do not attach bodyweight to a workout target or overload `bodyweight_reps`. Relative-strength reads choose the applicable dated measurement by a documented basis in Phase 19; Phase 13 only supplies durable facts and a truthful absence state. [VERIFIED: .planning/REQUIREMENTS.md:30; src/domains/metrics/contracts.ts:115-129]
- Reuse Progress freshness behavior: if source-derived subjects are stale and no rebuild work exists, return unavailable rather than stale totals. [VERIFIED: src/platform/sqlite/repositories/progressRepository.ts:320-396]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Transaction serialization | A second mutex/optimistic in-memory authority | Existing `SqliteKernel.write` / `SerializedWriteExecutor` | It already guarantees FIFO `BEGIN IMMEDIATE`, rollback, commit, and typed storage errors. [VERIFIED: src/platform/sqlite/sqliteKernel.ts:139-205; src/platform/sqlite/serializedWriter.ts:27-85] |
| Date/timezone scheduling | A Running-only date engine | Existing local-date/timezone/schedule transition primitives | Strength already has versioned date, timezone, override, and rotation semantics; duplicate engines drift. [VERIFIED: src/platform/sqlite/repositories/scheduleRepository.ts:1-24,1531-1864] |
| Idempotency | Timestamp/title guessing or UI debounce | Stable request ID + request SHA-256 + receipt + expected revisions | Shipped starter/schedule commands already replay or conflict deterministically. [VERIFIED: src/platform/sqlite/repositories/starterPlanRepository.ts:1186-1217; src/platform/sqlite/repositories/scheduleRepository.ts:941-959] |
| Backup graph discovery | `sqlite_master` dump or “all new tables” | Versioned explicit allowlists, filters, refs, remaps, bounds | Portability intentionally excludes catalog/derivative/secret state and validates exact fields. [VERIFIED: src/domains/portability/backupContracts.ts:17-110] |
| Migration backup | File-copy guesses | Existing `RecoveryBackupPort` / Expo database backup seam | It verifies `user_version`, FK, and integrity before migration. [VERIFIED: src/platform/sqlite/recoveryBackup.ts:40-125] |
| Runtime validation | Ad hoc screen checks | Zod strict schemas at external/persistence boundaries plus pure domain validation | Prevents screens/adapters from inventing accepted shapes. [VERIFIED: src/domains/metrics/contracts.ts:27-64; /Users/bytedance/.gstack/projects/gym_tracker/bytedance-pre-git-design-20260815-132500.md:1198-1236] |
| Derived completion/history | Mutating planned/source facts | Event ledger plus deterministic rebuild | Supports unmatch/reassign, restore, and conflict visibility without rewriting history. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:147-159] |

**Key insight:** The hard part is not table creation; it is keeping every identity and revision coherent across activation, start, completion, match, backup, clean restore, merge, automatic generation, and rebuild. Reuse the shipped transactional/portability machinery and extend it end-to-end.

## Runtime State Inventory

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | The production database name is `gym-tracker.db`; installed v1.1 databases may contain schema-27 plans, schedules, active/partial workouts, history, timing, identities, and backup state. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:399-403; src/platform/sqlite/migrations/index.ts:21-60] | **Data migration**, not only code edits. Use synthetic schema-27 fixtures and the validated recovery-copy path; do not inspect/mutate a live phone DB during planning. |
| Live service config | Google Drive can hold v2/schema-27 immutable snapshots and a manifest, but Drive auth/manifest topology does not need a manual config migration for Phase 13. [VERIFIED: .planning/milestones/v1.1-phases/12-automatic-google-drive-sync/12-CONTEXT.md:39-70,95-109] | **Code/contract extension:** next local source mutation produces a successor snapshot; retain v1/v2 restore and latest/previous recovery. Do not patch provider state or credentials. |
| OS-registered state | No OS registration is part of the multi-plan domain migration. Android notification/rest behavior remains keyed to the one active Strength session. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-25] | None for registrations; rebuild the native test APK for migration/process-death evidence later. |
| Secrets/env vars | Phase 13 introduces no Garmin credential, broker secret, OAuth token, or provider environment variable. Google authorization remains adapter-owned and excluded from logical backups. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-36,83-88; .planning/milestones/v1.1-phases/12-automatic-google-drive-sync/12-CONTEXT.md:161-174] | None. Preserve secret exclusion and diagnostics redaction. |
| Build artifacts / installed packages | `node_modules` and `adb` are unavailable in this worktree/PATH; Node, npm, Java, sqlite3, and Maestro are available. [VERIFIED: environment audit 2026-10-06] | Run `npm ci` before host tests; restore the pinned Android SDK/adb path before native `migrations-effects`. An old installed APK must not be used as a downgrade after new-schema writes. |

## Common Pitfalls

### Pitfall 1: MAP-01 leaks into DDL before approval
**What goes wrong:** A per-kind unique index silently locks one same-sport plan.
**How to avoid:** Make the first irreversible constraint task a decision checkpoint, with both index/selection/merge designs.
**Warning sign:** Migration SQL contains `one_active_*_per_kind` before MAP-01 evidence. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-35]

### Pitfall 2: Only the two global indexes change
**What goes wrong:** scalar readers, global deactivation, `LIMIT 1`, restore validation, and merge normalization still pick/reject/demote the wrong plan.
**How to avoid:** Complete the full singleton inventory in one release.
**Warning sign:** `activeSchedule()` remains parameterless in a mutation path. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:10-24]

### Pitfall 3: Same-day Running slots collapse twice
**What goes wrong:** binding uniqueness or opportunity uniqueness allows only one slot.
**How to avoid:** Test two ordered Running slots on the same weekday/date through query, match, backup, restore, and merge.
**Warning sign:** an identity key stops at schedule/date/source. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:301-331,367-414]

### Pitfall 4: Start validates IDs independently
**What goes wrong:** a day from plan A is paired with plan B, or a stale version starts a mixed session.
**How to avoid:** selected-occurrence input plus in-transaction ownership/revision validation.
**Warning sign:** public start API still accepts only `dayId` and `mode`. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:950-953,2473-2502]

### Pitfall 5: Completion follows current activation
**What goes wrong:** plan switching between session start and retry consumes another schedule or loses the completion.
**How to avoid:** immutable session link plus stable reconciliation receipt.
**Warning sign:** completion calls scalar `activeSchedule()`. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:886-943]

### Pitfall 6: Migration 23 sees future tables
**What goes wrong:** fresh install fails before successor table creation.
**How to avoid:** freeze the schema-23 trigger table set and add successor triggers after table creation.
**Warning sign:** migration 23 imports a registry that includes Phase 13 tables. [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:1-36]

### Pitfall 7: SQLite migration passes but portability is incomplete
**What goes wrong:** Running/import/bodyweight facts disappear or duplicate after restore/merge.
**How to avoid:** versioned graph, filters, exact columns, refs, ID maps, conflicts, trigger restoration, and rebuild tests in the same phase.
**Warning sign:** a new authoritative table is absent from portable-merge fixtures. [VERIFIED: .planning/research/v1.2/PITFALLS.md:39-51]

### Pitfall 8: Import dedupe implies match
**What goes wrong:** a duplicate/revision outcome automatically completes a plan opportunity.
**How to avoid:** separate import receipt transaction from explicit match event transaction.
**Warning sign:** imported activity insert updates schedule state. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:27-31]

### Pitfall 9: Bodyweight kg is stored as `bodyweight_reps`
**What goes wrong:** dated measurements contaminate exercise metric identity/targets.
**How to avoid:** separate measurement aggregate and derived relative view only.
**Warning sign:** bodyweight edit writes `session_sets` or progression targets. [VERIFIED: src/domains/metrics/contracts.ts:115-129; .planning/REQUIREMENTS.md:30]

### Pitfall 10: TIM-01 removes controls but leaves callbacks
**What goes wrong:** invisible foreground/queued reconciliation emits cues, or migration rewrites legacy timing snapshots.
**How to avoid:** preserve bytes/facts and test every command/reconciliation/callback/relaunch/restore seam before gated retirement.
**Warning sign:** UI files change but `reconcileAdvancedTimingAfterForeground` and runtime command exports remain live. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3192-3394]

### Pitfall 11: Calendar history depends on current activation
**What goes wrong:** switching plans hides past missed work and date-state aggregation loses event identity.
**How to avoid:** source-based typed events, effective overlays, bounded date queries, and batched counts.
**Warning sign:** historical query joins `schedule.lifecycle = 'active'`. [VERIFIED: src/platform/sqlite/repositories/historyRepository.ts:783-835]

### Pitfall 12: Migration failure is treated as whole-batch rollback
**What goes wrong:** earlier successor migrations may already be committed because the runner commits each migration separately.
**How to avoid:** keep inseparable constraint/data transformations in one migration or design restart-safe valid intermediate versions; reopen with a fresh runner after failure.
**Warning sign:** plan claims all pending versions roll back together. [VERIFIED: src/platform/sqlite/migrationRunner.ts:201-273]

## Code Examples

### Commit-gated command pattern

```typescript
// Existing project pattern: the result escapes only after COMMIT.
return kernel.write(async (transaction) => {
  // 1. replay/validate request receipt
  // 2. validate complete expected identity + revisions
  // 3. write immutable source facts and receipt
  // 4. assert paired/FK/domain invariants
  return committedResult;
});
```

`SqliteKernel.write` delegates to the FIFO serialized writer, whose exact transaction strings are `"BEGIN IMMEDIATE"`, `"COMMIT"`, and `"ROLLBACK"`. [VERIFIED: src/platform/sqlite/sqliteKernel.ts:139-165; src/platform/sqlite/serializedWriter.ts:6-8,46-73]

### Completion replay rule

```text
sessionId
  -> immutable workout-session schedule link
  -> captured plan/day + schedule/version + slot/opportunity + timezone
  -> stable completion request/receipt
  -> effective opportunity resolver
  -> commit/replay against original identity
```

This replaces the current post-hoc `activeSchedule()` lookup and preserves source workout truth if schedule reconciliation needs retry. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:886-943; src/bootstrap/workoutAppRuntime.tsx:3973-3983]

### Restore readiness rule

```text
validated source graph
  -> one exclusive replace/merge transaction
  -> state = rebuild_pending
  -> deterministic completion/calendar/history/progress rebuild
  -> state = ready
  -> trusted reads enabled
```

The existing restore writer already returns the verbatim state `"rebuild_pending"`; Phase 13 extends what must rebuild before `ready`. [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:39-44,376-438]

## State of the Art

| Old / shipped approach | Phase 13 approach | Impact |
|---|---|---|
| One global active plan/schedule pair | Cardinality selected at MAP-01 with explicit sport/policy-scoped pairs | Strength and Running can coexist without hidden deactivation. [VERIFIED: src/platform/sqlite/migrations/0008_schedule_activation.ts:472-477; .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:19-25] |
| Scalar Today and `startPlanDay(dayId, mode)` | Coherent multi-context read + exact selected occurrence | Stops mixed plan/day and stale-version starts. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:210-221; src/bootstrap/workoutAppRuntime.tsx:950-953] |
| Completion discovers active schedule | Completion replays captured session provenance | Plan switches cannot redirect historical completion. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:886-943] |
| Date states and current-lifecycle missed filter | Stable typed multi-source events | Several same-day events and inactive-plan history remain addressable. [VERIFIED: src/platform/sqlite/repositories/historyRepository.ts:760-864] |
| v2 global portability graph | Exact versioned graphs with successor source facts | Old archives remain readable while new facts are complete. [VERIFIED: src/domains/portability/backupContracts.ts:1-110] |
| Advanced timing fully active | Facts preserved; retirement requires TIM-01 and zero-cue proof | Avoids destructive migration and invisible playback. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-35] |

**Deprecated/outdated for new production use:** copied-plan `LIMIT 1` Today/activation selectors, scalar `activeSchedule()` mutations, completion-by-current-activation, date-only event identity, and a portability registry that assumes every supported format has the latest table set. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:1366-1384,1538-1572; src/bootstrap/scheduleRuntime.tsx:481-499,886-943; src/domains/portability/backupContracts.ts:88-110]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node | Typecheck/tests/scripts | ✓ | `v24.19.0` | Pinned version matches `package.json`. [VERIFIED: environment audit 2026-10-06; package.json:7-9] |
| npm | Dependency restore/test scripts | ✓ | `11.17.0` | Run `npm ci`. [VERIFIED: environment audit 2026-10-06; package.json:6-9] |
| `node_modules` | Jest/TypeScript/Expo commands | ✗ | — | `npm ci` before validation. [VERIFIED: environment audit 2026-10-06] |
| sqlite3 CLI | Fixture/schema inspection | ✓ | `3.54.0` | Real correctness still uses Expo SQLite contracts. [VERIFIED: environment audit 2026-10-06] |
| Java | Android tooling | ✓ | OpenJDK `27` | Use pinned project toolchain if native build scripts reject it. [VERIFIED: environment audit 2026-10-06] |
| Maestro | Later lifecycle evidence | ✓ | `2.8.0` | Phase 13 needs native storage/process-death evidence, not new UI flows. [VERIFIED: environment audit 2026-10-06] |
| Android `adb` | Device `migrations-effects` | ✗ | — | Restore Android SDK/platform-tools to PATH before the native phase gate. [VERIFIED: environment audit 2026-10-06] |
| Project knowledge graph | Semantic discovery | ✗ | — | Graph absent; direct source/artifact inspection used. [VERIFIED: `.planning/graphs/graph.json` absence, 2026-10-06] |

**Missing dependencies with no fallback:** Android `adb` blocks the native migration contract until restored.
**Missing dependencies with fallback:** `node_modules` is restored deterministically with `npm ci`.

The older PROJECT environment statement that adb is installed is stale relative to this session's PATH audit; the planner should trust the live availability check. [VERIFIED: .planning/PROJECT.md:115-126; environment audit 2026-10-06]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Jest `29.7.0` with unit, components, sqlite-host, and integration projects; native Expo SQLite `migrations-effects` harness [VERIFIED: package.json:23-28,125-132; jest.config.js:26-90] |
| Config file | `jest.config.js` [VERIFIED: jest.config.js:1-90] |
| Quick run command | `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts` [ASSUMED] (future file) |
| Existing regression command | `npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts tests/integration/schedule-commands.test.ts tests/integration/portable-merge.test.ts` [VERIFIED: existing test files and package.json:27] |
| Full host suite command | `npm run typecheck && npm run lint && npm run test:unit -- --runInBand && npm run test:sqlite:host -- --runInBand && npm run test:integration -- --runInBand && npm run test:coverage -- --runInBand` [VERIFIED: package.json:19-28,72-73] |
| Native phase gate | `npm run android:devtest:fresh -- --suite phase13 && npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase13/build.json` [ASSUMED] (future Phase 13 manifest; existing suite command verified at package.json:26,79) |

### Owner Decision Checkpoints

| Checkpoint | Must occur before | Evidence shown | Plan behavior |
|---|---|---|---|
| MAP-01 | Any replacement active-plan/schedule uniqueness DDL or merge cardinality implementation | Side-by-side schema/index, selection, Today, activation, and merge designs for one-per-sport versus multiple-same-sport | Blocking `checkpoint:decision`; no default may be encoded before acceptance. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-35] |
| TIM-01 | Removing/gating authoring, runtime commands, foreground reconciliation, queued callbacks, or playback | Legacy state matrix for `idle/running/paused/stopped/expired`, zero-cue evidence, unchanged config/snapshot bytes, recovered set pointer and between-set rest | Blocking `checkpoint:decision`; preservation tests land before any cutover. [VERIFIED: src/platform/sqlite/migrations/0021_advanced_set_timing.ts:93-130; .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-35] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| DOM-01 | Independent activation under selected cardinality | integration + real SQLite | `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts tests/integration/multi-plan-activation.test.ts` | ❌ Wave 0 |
| DOM-02 | Create/copy/import/edit remains inactive | integration | `npm run test:integration -- --runInBand tests/integration/multi-plan-foundation-tracer.test.ts tests/integration/multi-plan-activation.test.ts` | ❌ Wave 0; extend existing starter/owned-plan tests |
| DOM-03 | Fresh→latest, 27→latest, failure cuts, recovery copy, unchanged facts | sqlite-host + native | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts` | ✅ extend |
| DOM-04 | Independent Weekday/Rotation/timezone/effective dates | unit + integration | `npm run test:integration -- --runInBand tests/integration/schedule-commands.test.ts tests/integration/running-foundation.test.ts` | mixed; new Running file ❌ |
| DOM-05 | Move run/strength/keep both affects selected future occurrence only | unit + integration | `npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts` | ❌ Wave 0 |
| DOM-06 | Selected occurrence validation and one recovered Strength workout | integration | `npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts` | ✅ extend |
| DOM-07 | Seven types, immutable revisions, same-day slot order | unit + integration | `npm run test:integration -- --runInBand tests/integration/running-foundation.test.ts` | ❌ Wave 0 |
| DOM-08 | Goal/benchmark/date/training-day provenance and unset long goals | unit + integration | `npm run test:unit -- --runInBand src/domains/running` | ❌ Wave 0 |
| DOM-09 | Advisory pace/HR-zone/RPE strict validation | unit | `npm run test:unit -- --runInBand src/domains/running` | ❌ Wave 0 |
| DOM-10 | Independent immutable activity facts with optional channels | integration | `npm run test:integration -- --runInBand tests/integration/imported-activity-facts.test.ts` | ❌ Wave 0 |
| DOM-11 | External/hash order matrix and receipt replay/conflicts | unit + integration | `npm run test:integration -- --runInBand tests/integration/imported-activity-facts.test.ts` | ❌ Wave 0 |
| DOM-12 | Explicit match, stale/replay, unmatch/reassign, one-to-one relation | integration | `npm run test:integration -- --runInBand tests/integration/running-activity-match.test.ts` | ❌ Wave 0 |
| DOM-13 | Deterministic Calendar/Progress rebuild and sparse/unavailable states | sqlite-host + unit | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/trainingCalendarRepository.test.ts` | ❌ Wave 0; extend Progress tests |
| DOM-14 | Dated grams, edit/delete, no target mutation | unit + integration | `npm run test:unit -- --runInBand src/platform/sqlite/repositories/progressRepository.test.ts && npm run test:integration -- --runInBand tests/integration/bodyweight-history.test.ts` | ❌ Wave 0 |
| DOM-15 | v1/v2/successor restore, merge remap/conflict, triggers, rebuild | integration + native | `npm run test:integration -- --runInBand tests/integration/multi-plan-portability.test.ts tests/integration/portable-merge.test.ts` | new file ❌; existing regression ✅ |
| DOM-16 | Offline exclusive commit and no pre-commit acknowledgment | integration + runtime | `npm run test:integration -- --runInBand tests/integration/today-schedule-workout.test.ts` | ✅ extend |
| DOM-17 | Snapshots, overlays, tombstones, identities, decisions unchanged | sqlite-host + integration | `npm run test:sqlite:host -- --runInBand tests/sqlite-host/historyRepository.test.ts` | ✅ extend |

### Mandatory Scenario Matrix

- Fresh DB → latest and schema 27 → latest, with full `sqlite_master`, FK, integrity, trigger, and canonical source checks. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:57-66]
- Failure before/after each new migration statement, verify phase, integrity phase, and commit; reopen with a fresh runner. [VERIFIED: src/platform/sqlite/migrationRunner.ts:130-160,201-273]
- Strength + Running active; replace one sport; the other schedule revision, pointer, overrides, and opportunities remain identical. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:67-73]
- Two Running slots on one weekday/date plus Strength; each retains identity across restart, backup, clean restore, and merge.
- Start from a selected occurrence; crash before/after commit; switch plan; complete/retry exactly once against original provenance. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:74-80]
- Import without a plan; both FIT→API and API→FIT identity order; stale match; unmatch/reassign; removed source cannot resurrect. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:84-87]
- New source-only mutations advance automatic generation; derivative rebuild alone does not. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:88-94]
- TIM-01 state/callback/relaunch/restore matrix preserves bytes, set pointer, drafts, and between-set rest with zero unapproved cue retirement behavior. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:78-80]

### Sampling Rate

- **Per task commit:** run the smallest owning pure/integration file plus `npm run typecheck` for contract changes.
- **Per wave merge:** `npm run test:all` plus the targeted migration/portability regression set. [VERIFIED: package.json:72]
- **Schema/portability wave gate:** host `migrations-effects` + portable merge + automatic Drive backup regressions.
- **Phase gate:** full host suite, coverage gate for every integrity-critical changed module, native `migrations-effects`, and process-death/offline evidence before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] Restore dependencies with `npm ci`.
- [ ] Assert Node/npm satisfy `package.json.engines` and fail on lockfile drift before the first RED test.
- [ ] Add `tests/integration/multi-plan-foundation-tracer.test.ts` before implementation; no breadth plan begins until its legacy migration, minimum readiness, two-slot activation/materialization, exact Strength detail/null-on-stale, active recovery, and backup/restore cases pass.
- [ ] Add a schema-27 synthetic fixture containing active plan/schedule, completed history, saved partial/in-progress session, timing states, portable IDs, and automatic-backup state.
- [ ] Add future test files listed in the requirement map; exact names may be adjusted by the planner. [ASSUMED]
- [ ] Add `src/platform/sqlite/repositories/progressRepository.test.ts` for direct Running/goal/bodyweight sparse/freshness/rebuild coverage.
- [ ] Extend `src/testing/contracts/migrationsEffects.contract.ts` with fresh→latest and 27→latest Phase 13 cases.
- [ ] Extend native suite case IDs/build manifest validation for Phase 13.
- [ ] Restore Android SDK/adb availability before native execution.
- [ ] Add a canonical protected-table digest helper so migration/restore/merge tests compare facts, not only row counts.

## Security Domain

Security enforcement is enabled at ASVS level 1. [VERIFIED: .planning/config.json: workflow.security_enforcement=true, workflow.security_asvs_level=1]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---:|---|
| V2 Authentication | No for Phase 13 | No new account/provider authentication; Garmin broker is Phase 18. Existing Google auth remains outside logical facts. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-36,83-88] |
| V3 Session Management | No for Phase 13 | No web/user session is introduced. Stable workout/session IDs are domain identities, not authentication sessions. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:6-14,33-36] |
| V4 Access Control | Yes | Capability-oriented typed ports; screens/adapters receive no SQL/private writer; owner namespace scopes portable identities. [VERIFIED: src/platform/sqlite/sqliteKernel.ts:38-60; src/platform/sqlite/repositories/logicalMergeRepository.ts:1430-1446] |
| V5 Input Validation | Yes | Strict schemas, bounded values/chunks, exact-key archive parsing, prepared SQL parameters, expected revisions, and fail-closed unsupported versions. [VERIFIED: src/domains/portability/backupContracts.ts:168-243,396-473; src/platform/sqlite/connection.ts:94-139] |
| V6 Cryptography | Yes, unchanged boundary | Reuse existing encrypted manual GTBK and verified automatic snapshot integrity; no new crypto or secret custody in Phase 13. [VERIFIED: .planning/milestones/v1.1-REQUIREMENTS.md:52-61] |

### Known Threat Patterns for the Phase 13 Stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Stale/mixed plan-day-schedule selection | Tampering | Full selected identity + expected revisions, in-transaction ownership checks, no `LIMIT 1` fallback. [VERIFIED: src/domains/workout/index.ts:21-35; src/platform/sqlite/repositories/plansWorkoutRepository.ts:1366-1384] |
| Duplicate/replayed import or match command | Tampering / Repudiation | Request ID/hash receipts, immutable events, expected current relation revision, auditable unmatch/reassign. [VERIFIED: src/platform/sqlite/repositories/starterPlanRepository.ts:1186-1217; .planning/architecture/v1.2-garmin-import.md:147-159] |
| Cross-owner merge linkage | Spoofing / Tampering | `(owner_namespace, portable_id)` identity, FK closure/remap validation, explicit conflict preview. [VERIFIED: .planning/milestones/v1.1-phases/11-portable-history-merge-restore/11-CONTEXT.md:34-49] |
| Oversized archive/sample graph | Denial of Service | Existing byte/row/string/nesting limits, bounded chunks, cumulative capacity preflight, reject before source commit. [VERIFIED: src/domains/portability/backupContracts.ts:7-15] |
| Route/HR/workout payloads in diagnostics | Information Disclosure | Codes, versions, counts, hashes, opaque receipts only; never raw rows, routes, paths, secrets, or SQL parameters. [VERIFIED: /Users/bytedance/.gstack/projects/gym_tracker/bytedance-pre-git-design-20260815-132500.md:1238-1283] |
| Restore resurrects removed/matched facts | Tampering | Portable tombstones/events, current relation rebuild, delayed replay revision fences. [VERIFIED: .planning/architecture/v1.2-garmin-import.md:183-190] |
| New source table omitted from Drive generation | Repudiation / Data loss | Source-table generation triggers installed after creation; mutation-only generation tests; trigger capture/recreate on restore. [VERIFIED: src/platform/sqlite/migrations/0023_automatic_drive_backup.ts:27-36; src/platform/sqlite/repositories/logicalRestoreRepository.ts:72-83,116-130] |
| Old binary opens new schema | Tampering / Data loss | Forward-only recovery/export; never install old APK as schema downgrade after new facts. [VERIFIED: .planning/architecture/v1.2-migration-risks.md:53-55] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Schema 27 remains current when implementation starts. [ASSUMED] | Migration preflight | Migration number/fixtures/accepted versions must be recalculated; never edit shipped bytes. |
| A2 | Recommended future file/table/type names in this research are accepted as planner-internal names. [ASSUMED] | Future file map / examples | Low architectural risk; exact imports/tasks change. Locked identities and behavior do not. |
| A3 | The proposed targeted future test commands complete inside the desired quick feedback window. [ASSUMED] | Validation Architecture | Planner may split fixtures/files further after measurement. |

## Open Questions

1. **MAP-01 — active plans within one sport**
   - What we know: Strength and Running must coexist; at-most-one per sport is recommended but unaccepted. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-35]
   - What's unclear: whether several same-sport plans may be active simultaneously.
   - Recommendation: block the first uniqueness/index task and obtain the owner decision with both complete designs; no schema default.

2. **TIM-01 — cadence/cluster runtime retirement**
   - What we know: all configurations/snapshots and set/rest recovery must remain. Runtime authoring/reconciliation/callback/playback retirement is recommended but unaccepted. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:33-35]
   - What's unclear: whether the retirement cutover is accepted after zero-cue/recovery proof.
   - Recommendation: land preservation tests first, then block runtime removal/gating on an owner checkpoint; if cue isolation cannot be proved, retain compatibility behavior.

No additional owner question is required for Phase 13. Garmin transport/broker remains deferred, and exact internal naming/query indexes are explicitly within planner discretion. [VERIFIED: .planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md:38-40,83-88]

## Sources

### Primary (HIGH confidence)

- `.planning/phases/13-multi-plan-running-foundation/13-CONTEXT.md` — locked decisions, checkpoints, phase boundary, tracer.
- `.planning/REQUIREMENTS.md:15-33` and `.planning/ROADMAP.md:79-96` — DOM-01–17 and phase success criteria.
- `.planning/architecture/v1.2-multi-active-plans.md`, `v1.2-garmin-import.md`, `v1.2-migration-risks.md` — reviewed proposals and failure matrix.
- Live schema/runtime/portability sources cited inline, especially `migrations/index.ts`, migrations 0001/0008/0021/0023/0027, scheduling/workout runtimes, and logical backup/restore/merge modules.
- Shipped v1.1 Phase 10/11/12 contexts and verification reports — timing, merge, and automatic backup contracts.
- `package.json`, `jest.config.js`, existing test files — toolchain and validation seams.

### Secondary (MEDIUM confidence)

- [SQLite partial indexes](https://www.sqlite.org/partialindex.html) — partial predicate restrictions; official search result checked 2026-10-06.
- [SQLite ALTER TABLE](https://sqlite.org/lang_altertable.html) — `ADD COLUMN` restrictions/check behavior; official search result checked 2026-10-06.
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) — database backup API; official search result checked 2026-10-06. The project kernel remains implementation authority.
- `/Users/bytedance/.gstack/projects/gym_tracker/bytedance-pre-git-design-20260815-132500.md` and `bytedance-pre-git-eng-review-test-plan-20260815-224500.md` — original architecture and QA contracts; matching fallback filenames used because the rule-listed names are absent.

### Tertiary (LOW confidence)

- None. Unimplemented naming/timing assumptions are isolated in the Assumptions Log rather than presented as facts.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — exact project versions/scripts were opened and registry existence/publish metadata was checked; no package addition is proposed.
- Architecture baseline: HIGH — schema 27, indexes, tables, runtime call paths, and portability code were opened directly at HEAD `917b924d618a003a38aa895092f9caed79ebe36e`.
- Future architecture: MEDIUM — grounded in locked context and ADRs but not implemented; MAP-01/TIM-01 remain owner gates.
- Pitfalls: HIGH for identified current seams, MEDIUM for unimplemented mitigations.
- Validation: HIGH for existing harness/commands, MEDIUM for future file names and unmeasured quick-run duration.

**Research method:** Required research-plan seam used the existing architecture question file; provider `websearch` was classified `MEDIUM` only after official-source cross-check. Cache entries were not retained in the worktree because the assigned output scope permits only this RESEARCH.md. The project graph was absent, so direct source inspection was used. No app code, build, device mutation, test execution, commit, or user question occurred.

**Research date:** 2026-10-06
**Valid until:** 2026-11-05, or immediately invalid if the migration registry, Phase 13 context, MAP-01, or TIM-01 changes.
