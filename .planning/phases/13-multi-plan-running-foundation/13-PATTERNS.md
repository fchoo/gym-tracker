# Phase 13: Multi-Plan & Running Foundation - Pattern Map

**Mapped:** 2026-10-06  
**Scope:** 24 recommended new files plus 24 existing integration/test hotspots  
**Structural analogs found:** 24 / 24 new files  
**Semantic new boundaries:** 6 (Running revisions, selected occurrence provenance, imported activities, match ledger, dated bodyweight, successor portability graph)

## Pattern Selection Summary

Phase 13 should copy five existing pattern families, not invent a parallel stack:

1. **Schema and invariant pattern:** immutable source rows, explicit indexes/triggers, in-transaction verification from `0022_portable_owner_identities.ts` and schedule identity from `0008_schedule_activation.ts`.
2. **Command/repository pattern:** validate and hash in a typed command, replay a durable receipt, fence expected revisions, then commit through `kernel.write` as in `scheduleCommands.ts` and `starterPlanRepository.ts`.
3. **Pure transition pattern:** discriminated immutable state plus revision-fenced pure transitions from `scheduleState.ts`.
4. **Portability pattern:** explicit versioned table graph, ownership filters, reference closure, ID remaps, atomic source replacement, and `rebuild_pending` from the existing portability modules.
5. **Evidence pattern:** shared host/native case IDs plus real-SQLite integration and failure injection from `migrationsEffects.contract.ts`, `schedule-activation.test.ts`, and `portable-merge.test.ts`.

No authentication middleware applies: this is an offline local application. The equivalent trust boundary is capability-oriented typed ports plus `(owner_namespace, portable_id)` identity at portability boundaries.

## New File Classification and Closest Analogs

Names below follow the Phase 13 research recommendations. Exact internal names may change, but splitting or combining files must preserve the assigned boundary.

| Recommended New File | Role | Data Flow | Closest Existing Analog | Match Quality | Copy This Pattern |
|---|---|---|---|---|---|
| `src/platform/sqlite/migrations/0028_multi_plan_running_foundation.ts` | migration | batch / transform | `src/platform/sqlite/migrations/0022_portable_owner_identities.ts` | exact structural | Ordered statements, immutable/validation triggers, explicit verifier over columns/index SQL/trigger SQL; mark destructive because active constraints change. |
| `src/domains/running/contracts.ts` | model / utility | transform | `src/domains/metrics/contracts.ts` | role-match | `z.strictObject`, versioned discriminated shapes, atomic integer units, parse function, typed boundary error. |
| `src/domains/running/commands.ts` | service | request-response | `src/domains/scheduling/scheduleCommands.ts` | role-match | Validate IDs/revisions, canonical request hash, deterministic child IDs, typed repository staging, post-commit invalidation. |
| `src/domains/running/activityMatchCommands.ts` | service | event-driven / request-response | `src/domains/scheduling/scheduleCommands.ts` | role-match | Read/replay receipt, load exact state, pure transition, stage append-only event, expected-revision conflict. Do not copy Strength completion coupling. |
| `src/domains/activities/importContracts.ts` | model | transform | `src/domains/metrics/contracts.ts` | role-match | Strict versioned normalized facts with explicit optionality and integer SI units; no provider SDK or SQL types. |
| `src/domains/activities/activityIdentity.ts` | utility | transform | `src/domains/portability/mergePlan.ts` | role-match | Classify exact identity/digest outcomes before writes; deterministic conflict/no-op/new/review result, never fuzzy auto-merge. |
| `src/domains/activities/importCommands.ts` | service | request-response | `src/domains/plans/ownedPlanCommands.ts` | role-match | Pure input validation and canonical hashing before a short repository transaction; committed result only after receipt write. |
| `src/domains/bodyweight/contracts.ts` | model | transform | `src/domains/metrics/contracts.ts` | role-match | Strict schema and integer grams, but a separate aggregate from `bodyweight_reps`. |
| `src/domains/bodyweight/commands.ts` | service | CRUD / event-driven | `src/domains/plans/ownedPlanCommands.ts` | role-match | Stable ID, expected revision, edit/delete event or tombstone, request hash, typed conflict. |
| `src/domains/scheduling/activePlanSelection.ts` | utility | transform | `src/domains/scheduling/scheduleState.ts` | exact structural | Pure, deterministic selection over explicit active pairs/occurrences; fail on ambiguity instead of first-row fallback. |
| `src/bootstrap/trainingFoundationRuntime.ts` | provider | request-response | `src/bootstrap/ownedPlanRuntime.tsx` | exact structural | Frozen typed port facade, repository construction at bootstrap only, injected clock/UUID/SHA-256, no SQL exposure. |
| `src/platform/sqlite/repositories/runningPlanRepository.ts` | store / repository | CRUD | `src/platform/sqlite/repositories/ownedPlanRepository.ts` | exact structural | Staged immutable graph writes, request receipt, expected revision, inactive creation, committed snapshot read-back. |
| `src/platform/sqlite/repositories/importedActivityRepository.ts` | store / repository | batch / CRUD | `src/platform/sqlite/repositories/starterPlanRepository.ts` | role-match | One `kernel.write`, replay receipt first, resolve external-ref/hash identity matrix, append immutable payload facts, return typed result after commit. |
| `src/platform/sqlite/repositories/runningActivityMatchRepository.ts` | store / repository | event-driven | `src/platform/sqlite/repositories/historyCommandRepository.ts` plus schedule receipt pattern | role-match | Append audit event and rebuild/update current relation in the same transaction; the event is source truth, current relation is derivative. |
| `src/platform/sqlite/repositories/bodyweightRepository.ts` | store / repository | CRUD / event-driven | `src/platform/sqlite/repositories/historyCommandRepository.ts` | role-match | Revisioned correction/removal facts and tombstones without rewriting historical source rows. |
| `src/platform/sqlite/repositories/trainingCalendarRepository.ts` | store / repository | batch / transform | `src/platform/sqlite/repositories/historyRepository.ts` | exact structural | Typed bounded date-range read, effective overlays, stable sorting; replace date-state collapse and N+1 counts with batched multi-source events. |
| `tests/migrations/fixtures/v27-multi-plan-baseline.sql` | test fixture | batch | `tests/migrations/fixtures/v6-metric-profiles.sql` | exact structural | Synthetic retained schema fixture with explicit IDs; add active pair, recoverable workout, completed history, timing state, portable IDs, and backup state. |
| `tests/integration/multi-plan-activation.test.ts` | test | request-response | `tests/sqlite-host/schedule-activation.test.ts` | exact | Real SQLite, paired activation, conflict rollback, other-sport byte/fact preservation. |
| `tests/integration/running-foundation.test.ts` | test | CRUD / event-driven | `tests/integration/schedule-commands.test.ts` | exact structural | Command-level revisions, same-weekday ordered slots, opportunity transitions, restart read-back. |
| `tests/integration/imported-activity-facts.test.ts` | test | batch / CRUD | `tests/integration/content-import.test.ts` | role-match | Atomic aggregate import, duplicate/revision/conflict matrix, rollback after child failure, no Strength session/activation mutation. |
| `tests/integration/running-activity-match.test.ts` | test | event-driven | `tests/integration/today-schedule-workout.test.ts` | role-match | Exact opportunity selection, replay, stale conflict, unmatch/reassign, restart, and no current-activation lookup. |
| `tests/integration/bodyweight-history.test.ts` | test | CRUD / event-driven | `tests/sqlite-host/historyRepository.test.ts` | role-match | Source + overlay/tombstone behavior, dated ordering, restore, and proof that workout targets never change. |
| `tests/integration/multi-plan-portability.test.ts` | test | batch / file-I/O | `tests/integration/portable-merge.test.ts` | exact | Collect, clean restore, merge preview/commit, relaunch, deterministic rebuild parity, legacy archive matrix. |
| `tests/sqlite-host/trainingCalendarRepository.test.ts` | test | batch / transform | `tests/sqlite-host/historyRepository.test.ts` | exact | Bounded range, effective corrections, inactive-plan history, multiple same-date identities, batched query behavior. |

## Existing Files to Modify and the Pattern They Already Own

| Existing File | Role / Flow | Required Phase 13 Change | Pattern Authority |
|---|---|---|---|
| `src/platform/sqlite/migrations/index.ts` | config / batch | Register the actual next immutable migration and advance `CURRENT_SCHEMA_VERSION`; never renumber or edit an applied migration's semantics. | `migrations` registry, lines 28-60. |
| `src/platform/sqlite/migrations/0023_automatic_drive_backup.ts` | migration / event-driven | Freeze the historical schema-23 trigger table set before the successor registry grows. Preserve the emitted schema-23 SQL exactly. | Current live-registry dependency at lines 1, 34-35 is the seam to isolate. |
| `src/platform/sqlite/repositories/starterPlanRepository.ts` | repository / request-response | Scope active-pair reads, expectations, deactivation, receipts, and read-back by accepted MAP-01 cardinality/sport. | `readReceipt`, `readActiveSchedule`, `createStarterPlanRepository`. |
| `src/platform/sqlite/repositories/scheduleRepository.ts` | repository / event-driven | Replace scalar pair assumptions with explicit pair collection/target kind; centralize paired invariant assertion. | Current `readActiveSchedulePair`, `activePairMatches`, activation transaction. |
| `src/domains/scheduling/scheduleState.ts` | utility / transform | Preserve Strength transitions; add slot-aware Running/collision events or a sibling transition module. | Revision-fenced pure transition functions. |
| `src/domains/scheduling/scheduleCommands.ts` | service / request-response | Every mutation receives explicit plan/schedule/version/opportunity/slot; replay remains by request ID + hash. | `executeOpportunityAction`, lines 644-735. |
| `src/domains/workout/index.ts` | model / request-response | Replace scalar `StartWorkoutRequest` with selected occurrence provenance and expected revisions. Keep empty-workout variant separate. | Existing discriminated request + repository port, lines 21-35 and 96-104. |
| `src/platform/sqlite/repositories/plansWorkoutRepository.ts` | repository / CRUD | Validate ownership and exact schedule selection inside the writer; insert immutable session schedule link and start receipt atomically. Remove/contain `LIMIT 1` compatibility reads. | `startWorkout`, lines 776-876; anti-pattern lines 1366-1384 and 1538-1547. |
| `src/bootstrap/scheduleRuntime.tsx` | provider / request-response | Return coherent multi-context Today and complete by captured session link/receipt, never parameterless current activation. | Existing command facade; current completion seam cited in Phase 13 research at lines 886-943. |
| `src/bootstrap/workoutAppRuntime.tsx` | provider / request-response | Pass the selected occurrence intact, retain global recovered Strength session authority, and apply the approved TIM-01 timing retirement after automatic record validation. | Existing start/lifecycle coordinator, not a new source of domain selection. |
| `src/platform/sqlite/repositories/historyRepository.ts` | repository / batch | Retain effective Strength history but stop current-lifecycle filtering/date-state collapse; delegate unified event ranges to the new repository. | `loadCalendarMonth`, lines 760-864. |
| `src/platform/sqlite/repositories/progressRepository.ts` | repository / transform | Consume new Running/bodyweight facts behind freshness/rebuild gates; never make projections authoritative. | Existing unavailable-when-stale pattern cited in research at lines 320-396. |
| `src/domains/portability/backupContracts.ts` | config / batch | Add an exact successor format graph; keep v1/v2 definitions unchanged and explicit. | `LOGICAL_BACKUP_TABLE_DEFINITIONS`, `logicalBackupTablesForVersion`, exact-key parser. |
| `src/domains/portability/restoreCommands.ts` | service / file-I/O | Select graph/defaults/references/invariants by format/schema; legacy defaults only where deterministic (`plan_kind = strength`). | `LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS`, `additiveColumnDefaults`, `validateRows`. |
| `src/domains/portability/mergePlan.ts` | service / batch | Add aggregate classes/remaps/conflicts for new roots and resolve active candidates once over the projected result by accepted MAP-01 policy. | `PortableMergeOperation`, `buildPortableMergePlan`; replace global normalization in `planAggregate`. |
| `src/platform/sqlite/repositories/logicalBackupRepository.ts` | repository / batch | Add an explicit owner filter for every new portable source table. | `LOGICAL_BACKUP_TABLE_FILTERS`, lines 68-123. |
| `src/platform/sqlite/repositories/logicalRestoreRepository.ts` | repository / batch | Extend dependency order, captured trigger set, source verification, and rebuild subjects. | `sourceDependencies`, `INSERT_ORDER`, `createLogicalRestoreRepository`. |
| `src/platform/sqlite/repositories/logicalMergeRepository.ts` | repository / batch | Extend aggregate closure, writes, exact read-back, trigger capture, and fingerprint invalidation. | Existing full-plan aggregate validation/write pipeline. |
| `src/testing/contracts/migrationsEffects.contract.ts` | test contract / batch | Add fresh-to-latest and schema-27-to-latest Phase 13 cases, failure cuts, source digests, and generation-trigger checks. | Case registry + adapter runner. |
| `src/testing/contracts/portableMerge.contract.ts` | test contract / batch | Extend operation/closure/remap cases for Running/import/match/bodyweight/provenance. | Portable case registry and deterministic parity runner. |
| `tests/sqlite-host/migrations-effects.test.ts` | test / batch | Add schema-27 fixture upgrade, exact index/trigger SQL, failure injection, recovery copy, FK/integrity, and migration-23 freeze proof. | Existing large migration harness; locate with contract case IDs before targeted edits. |
| `tests/integration/today-schedule-workout.test.ts` | test / request-response | Add selected-occurrence mismatch/staleness, plan switch before completion retry, one global recovered Strength session. | Start→complete→retry scenarios, lines 1165-1365. |
| `tests/integration/portable-merge.test.ts` | test / batch | Add full successor graph clean restore/merge/relaunch and derivative parity. | Preflight token, `rebuild_pending`, relaunch/reconcile, lines 202-330. |
| `tests/sqlite-host/schedule-activation.test.ts` | test / batch | Replace singleton-only assertions with the approved zero-or-one active pair per sport matrix while retaining immutable consumed facts. | Existing constraint and immutable event proof, lines 557-642. |

## Pattern Assignments

### 1. Destructive Migration and Immutable Source Graph

**Apply to:** `0028_multi_plan_running_foundation.ts`, migration registry, all new source tables.  
**Primary analog:** `src/platform/sqlite/migrations/0022_portable_owner_identities.ts` — `portableOwnerIdentitiesMigration`.  
**Schedule identity analog:** `src/platform/sqlite/migrations/0008_schedule_activation.ts`.

Copy the pattern of checked source rows, immutable identity triggers, explicit indexes, and a verifier that inspects actual SQLite objects—not just TypeScript constants.

**Immutable trigger pattern** (`0022_portable_owner_identities.ts:10-20`):

```typescript
function immutableTrigger(
  name: string,
  table: string,
  column: string,
): string {
  return `CREATE TRIGGER ${name}
    BEFORE UPDATE OF ${column} ON ${table}
    FOR EACH ROW WHEN OLD.${column} IS NOT NULL AND NEW.${column} <> OLD.${column}
    BEGIN
      SELECT RAISE(ABORT, 'portable_identity_immutable');
    END`;
}
```

**Migration verification pattern** (`0022_portable_owner_identities.ts:222-245`, `267-292`):

```typescript
export const portableOwnerIdentitiesMigration: Migration = Object.freeze({
  version: 22,
  name: "portable-owner-identities",
  kind: "additive",
  async up(transaction) {
    for (const statement of PORTABLE_OWNER_IDENTITIES_SCHEMA_STATEMENTS) {
      await transaction.execute(statement);
    }
  },
  async verify(transaction: SqliteTransactionExecutor) {
    for (const [table, column] of REQUIRED_COLUMNS) {
      const columns = await transaction.queryAll<{ name: string }>(
        `PRAGMA table_info(${table})`,
      );
      if (!columns.some(({ name }) => name === column)) {
        throw new Error("portable_owner_identity_schema_incomplete");
      }
    }
    // ...query sqlite_master and compare required index/trigger SQL...
  },
});
```

For Phase 13, use `kind: "destructive"` because global activation constraints are replaced even though source facts are retained. Verify:

- deterministic `strength` backfill without title/metric inference;
- exact active index predicates fixed by approved MAP-01 and applied only after automatic record validation;
- plan/schedule kind agreement and paired activation;
- immutable stable roots/revisions/receipts/events/tombstones;
- slot-aware Running uniqueness;
- `foreign_key_check`, `integrity_check`, and unchanged canonical fact digests;
- generation triggers installed only after each new source table exists.

**Do not copy the current Running-incompatible keys.** Strength bindings currently enforce `UNIQUE(schedule_version_id, week_index, weekday)` (`0008_schedule_activation.ts:301-330`), while opportunities enforce `UNIQUE(schedule_id, local_date, source)` and completed outcomes require a Strength `session_id` (`0008_schedule_activation.ts:367-413`). Running needs its own stable slot-aware binding/opportunity identity and match ledger.

### 2. Historical Generation Trigger Freeze

**Apply to:** `0023_automatic_drive_backup.ts`, successor migration, backup generation tests.  
**Analog:** current trigger factory in `0023_automatic_drive_backup.ts:27-36`.

```typescript
function trigger(table: string, operation: "INSERT" | "UPDATE" | "DELETE"): string {
  return `CREATE TRIGGER automatic_backup_generation_${table}_${operation.toLowerCase()}
    AFTER ${operation} ON ${table} FOR EACH ROW
    BEGIN UPDATE automatic_backup_state SET mutation_generation = mutation_generation + 1,
      dirty_since_ms = COALESCE(dirty_since_ms, CAST(strftime('%s','now') AS INTEGER) * 1000)
      WHERE id = 1; END`;
}
export const AUTOMATIC_BACKUP_GENERATION_TRIGGER_STATEMENTS = Object.freeze(
  LOGICAL_BACKUP_TABLES.filter((table) => table !== "portable_owner_identity").flatMap((table) => [trigger(table, "INSERT"), trigger(table, "UPDATE"), trigger(table, "DELETE")]),
);
```

The factory is reusable; the live `LOGICAL_BACKUP_TABLES` dependency is not. Introduce a frozen schema-23 table constant whose generated statements are byte/semantics-equivalent to the current migration. Generate Phase 13 triggers in the successor migration after table creation. Do not add generation triggers to projections or `running_opportunity_completions`.

### 3. Strict Versioned Domain Contracts

**Apply to:** Running sessions/goals/targets, imported activity normalized drafts, dated bodyweight facts.  
**Analog:** `src/domains/metrics/contracts.ts`.

**Strict schema and typed boundary error** (`contracts.ts:27-64`):

```typescript
export const MetricIdentitySchema = z.strictObject({
  profile: z.enum(METRIC_PROFILES),
  contractVersion: z.number().int().positive().safe(),
  exerciseMetricGeneration: z.number().int().positive().safe(),
});

export type MetricIdentity = z.infer<typeof MetricIdentitySchema>;

export function parseMetricIdentity(input: unknown): MetricIdentity {
  const result = MetricIdentitySchema.safeParse(input);
  if (!result.success) {
    throw new MetricBoundaryError("validation", "metric_identity_invalid");
  }
  return result.data;
}
```

Use a discriminated union with literal schema versions/session kinds. Keep optional source facts nullable/absent; do not fabricate zeros. Distances are integer metres, durations integer milliseconds, bodyweight integer grams, and hashes fixed-length lowercase hex. Pace/HR-zone/RPE remain advisory fields. Gender/height are absent from the contract.

Do not reuse `BodyweightRepsTargetV1Schema`: it stores reps and `variationId` (`contracts.ts:115-129`), not dated owner mass.

### 4. Pure Revision-Fenced Schedule and Match Transitions

**Apply to:** Running opportunity move/keep-both outcomes, match/unmatch/reassign, collision overrides.  
**Analog:** `src/domains/scheduling/scheduleState.ts`.

**Transition pattern** (`scheduleState.ts:433-496`):

```typescript
export function transitionWeekdayOpportunity(input: Readonly<{
  current: ScheduleOpportunityV1;
  expectedRevision: number;
  action: WeekdayOpportunityAction;
}>): WeekdayOpportunityTransitionResult {
  assertExpectedRevision(input.current.revision, input.expectedRevision);
  if (input.current.state === "consumed") {
    throw new ScheduleTransitionError("schedule_opportunity_consumed");
  }
  if (input.current.source !== "weekday") {
    throw new ScheduleTransitionError("schedule_weekday_source_invalid");
  }
  // Return next immutable state plus append-only events.
}
```

Keep pure transition code free of SQL and clocks. Inputs contain the exact stable slot/opportunity/session revision. Output is `{ next, events }`. The repository checks current rows and persists both under the exclusive writer. Running match transitions must also carry accepted payload revision and expected current relation revision.

### 5. Typed Command Staging and Runtime Ports

**Apply to:** all new command services and `trainingFoundationRuntime.ts`.  
**Command analog:** `scheduleCommands.ts`.  
**Port analog:** `ownedPlanRuntime.tsx`.

**Canonical request and deterministic IDs** (`scheduleCommands.ts:349-416`):

```typescript
const canonical = Object.freeze({
  operation: "save_schedule_version" as const,
  requestId: value.requestId,
  scheduleId: value.scheduleId,
  planId: value.planId,
  expectedScheduleRevision: value.expectedScheduleRevision,
  expectedPlanRevision: value.expectedPlanRevision,
  todayLocalDate,
  savedAtMs: value.savedAtMs,
  before: value.before,
  next,
  confirmationToken: value.confirmationToken,
});
const requestSha256 = await digest(context.sha256, canonical);
const staged = Object.freeze({
  ...canonical,
  requestSha256,
  versionId: deterministicId("schedule-version", requestSha256),
});
return postCommit(context, await context.repository.saveVersion(staged));
```

**Runtime port facade** (`ownedPlanRuntime.tsx:46-69`, `102-117`):

```typescript
export type OwnedPlanRuntimePort = Readonly<{
  createDraft(input: Readonly<{ name: string; dayName: string }>): Promise<OwnedPlanRepositoryResult>;
  loadPlan(planId: string): Promise<OwnedPlanSnapshot | null>;
  savePlan(input: Readonly<{
    expectedRevision: number;
    plan: OwnedPlanDraftInput;
  }>): Promise<OwnedPlanRepositoryResult>;
}>;

export function createOwnedPlanRuntimePort(
  kernel: SqliteKernel,
  dependencies: Readonly<{
    nowMs(): number;
    randomUUID(): string;
    sha256(value: string): Promise<string>;
  }>,
): OwnedPlanRuntimePort {
  const repository = createOwnedPlanRepository(kernel);
  // ...return a frozen command/read facade...
}
```

Later screens and the Phase 18 adapter receive only these ports. They must not import SQLite repositories or construct SQL. Phase 13 defines `GarminSourceEnvelope` and begins at that validated envelope; Phase 18 owns Garmin authentication, network reads, and JSON normalization.

### 6. Receipt-Fenced Repository Transaction

**Apply to:** activation, Running authoring, import, match, bodyweight correction, completion reconciliation.  
**Analog:** `starterPlanRepository.ts:createStarterPlanRepository`.

**Replay/fence/write pattern** (`starterPlanRepository.ts:1189-1217`, `1291-1298`):

```typescript
const outcome = await kernel.write<ActivationOutcome>(
  async (transaction) => {
    const receipt = await readReceipt(transaction, input.requestId);
    if (receipt !== undefined) {
      return receipt.request_sha256 === input.requestSha256
        ? { kind: "result", result: parseCommittedResult(receipt.result_json) }
        : { kind: "conflict", code: "starter_request_identity_conflict" };
    }
    const active = await readActiveSchedule(transaction);
    if (!expectedActiveRevisionMatches(
      active,
      input.expectedActiveScheduleRevision,
    )) {
      return { kind: "conflict", code: "starter_schedule_revision_conflict" };
    }
    // Validate all source ownership and revisions, write facts/events...
    await insertReceipt(transaction, input, result);
    return { kind: "result", result };
  },
);
if (outcome.kind === "conflict") {
  throw new StarterPlanRepositoryError(outcome.code);
}
return outcome.result;
```

Import and match require separate request tables/receipts. An import receipt may return new/duplicate/review/conflict but never match or activate. Match receipt binds exact imported activity + accepted payload + selected opportunity/revisions. Same request ID/different hash is a conflict.

**Commit-gating authority** (`serializedWriter.ts:46-72`):

```typescript
await this.writer.execAsync(SQLITE_BEGIN_IMMEDIATE);
result = await command(this.writer);
await this.beforeCommit?.();
await this.writer.execAsync(SQLITE_COMMIT);
return result;
```

No notification, invalidation, UI success, or provider acknowledgment may occur before this promise resolves.

### 7. Selected Occurrence and Workout Provenance

**Apply to:** `StartWorkoutRequest`, `plansWorkoutRepository.startWorkout`, completion reconciliation.  
**Closest analog:** existing discriminated request in `src/domains/workout/index.ts:21-35`; this is an extension, not a copy-as-is.

Current request carries only plan/day/date/timezone. Current insert writes the session but no schedule/version/opportunity link (`plansWorkoutRepository.ts:776-835`). Phase 13 must add a selected occurrence containing:

- `planKind`, `planId`, and exact plan day or Running session root/revision;
- `scheduleId`, `scheduleVersionId`, stable slot ID/ordinal, and opportunity ID;
- `localDate`, `timeZone`, start mode, expected plan/schedule/opportunity revisions;
- stable command/request identity.

Validate the complete tuple inside the same `kernel.write` that inserts `workout_sessions`, snapshots, immutable `workout_session_schedule_links`, and the start receipt. Completion resolves by this link and a completion receipt. It never calls a parameterless `activeSchedule()`.

The existing `LIMIT 1` readers in `plansWorkoutRepository.ts:1366-1384` and `1538-1547` are migration targets/anti-patterns, not analogs.

### 8. Unified Calendar Read Repository

**Apply to:** `trainingCalendarRepository.ts`.  
**Analog:** `historyRepository.ts:loadCalendarMonth`, lines 760-864.

Reuse:

- local-date parsing and explicit range bounds;
- effective history overlays;
- deterministic identity tie-breaks;
- immutable read results.

Replace:

- global all-history scan with bounded source queries;
- per-session count query (`historyRepository.ts:796-818`) with batched grouped counts;
- current-lifecycle filter on missed opportunities (`783-794`) with source-history rules;
- `Map<date, CalendarDayState[]>` collapse (`826-848`) with stable typed event rows.

The result port should return multiple separately addressable Strength, Running planned, and imported events on one date. Reads must not materialize opportunities, mutate pointers, or infer matches.

### 9. Versioned Portability Graph

**Apply to:** all backup/restore/merge files and every new authoritative table.  
**Analogs:** `backupContracts.ts`, `logicalBackupRepository.ts`, `restoreCommands.ts`, `logicalRestoreRepository.ts`, `mergePlan.ts`.

**Explicit allowlist** (`backupContracts.ts:26-31`, `85-110`):

```typescript
/**
 * This is intentionally an allowlist rather than a sqlite_master query.
 */
export const LOGICAL_BACKUP_TABLE_DEFINITIONS = Object.freeze({
  // table: { primaryKey: [...] }
});

export const LOGICAL_BACKUP_TABLES = Object.freeze(
  Object.keys(LOGICAL_BACKUP_TABLE_DEFINITIONS).sort(),
);

export function logicalBackupTablesForVersion(
  version: LogicalBackupFormatVersion,
  schemaVersion = Number.POSITIVE_INFINITY,
): readonly LogicalBackupTableName[] {
  // Return the exact graph for that producer version.
}
```

Create a successor definition rather than appending mandatory tables to v2. Preserve exact-key parsing and resource bounds. Add every new source root, revision, provenance link, receipt, tombstone, and match event. Exclude credentials, transport cursors/jobs, Calendar/Progress projections, and the rebuildable current match relation.

**Fail-closed ownership filter** (`logicalBackupRepository.ts:68-75`):

```typescript
/**
 * Adding a source table to the logical contract requires an explicit ownership rule;
 * TypeScript rejects a missing table instead of silently applying an unrestricted query.
 */
export const LOGICAL_BACKUP_TABLE_FILTERS = Object.freeze({
  // one explicit owner/closure filter per table
} satisfies Readonly<Record<LogicalTableName, string>>);
```

**Atomic restore and rebuild gate** (`logicalRestoreRepository.ts:384-429`):

```typescript
return await kernel.write(async (transaction) => {
  await transaction.execute("PRAGMA defer_foreign_keys = ON");
  await captureCurrentSourceOwnership(transaction, snapshotTables);
  const triggers = await capturedRestoreTriggers(transaction);
  await dropRestoreTriggers(transaction, triggers, input.faultAfter);
  await deleteCurrentSources(transaction, snapshotTables, input.faultAfter);
  await insertSnapshot(transaction, snapshot, input.faultAfter);
  await recreateRestoreTriggers(transaction, triggers, input.faultAfter);
  await verifySourceTables(transaction, snapshot);
  await transaction.execute(
    "UPDATE portability_restore_state SET state = 'rebuild_pending', updated_at_ms = ? WHERE id = 1",
    [stateUpdatedAtMs],
  );
  return Object.freeze({ state: "rebuild_pending" as const });
});
```

Merge must extend `PortableMergeOperation`/aggregate closure and perform activation resolution once across the complete projected result. The current global demotion checks (`mergePlan.ts:1106-1113`, `1157-1168`) are explicitly unsuitable for concurrent sports.

### 10. Test and Evidence Harness

**Apply to:** new integration/host files and shared native contracts.  
**Analogs:** `migrationsEffects.contract.ts`, `schedule-activation.test.ts`, `today-schedule-workout.test.ts`, `portable-merge.test.ts`.

**Shared case registry/runner** (`migrationsEffects.contract.ts:27-43`, `1019-1063`):

```typescript
export const MIGRATIONS_EFFECTS_CONTRACT_CASES = [
  "migration-empty-v0",
  "migration-retained-v1",
  "migration-statement-rollback",
  "migration-verify-rollback",
  "migration-commit-rollback",
  "migration-integrity-block",
  "migration-recovery-backup",
] as const;

export async function runMigrationsEffectsContract(adapter) {
  for (const caseId of MIGRATIONS_EFFECTS_CONTRACT_CASES) {
    await contractCases[caseId](adapter, caseId);
  }
}
```

**Failure injection pattern** (`migrationsEffects.contract.ts:264-300`): iterate every statement index and both `before`/`after`, then assert old version and old schema/facts remain. Add verification, integrity, and commit cuts; reopen with a fresh runner after failure.

**Required Phase 13 evidence matrix:**

| Evidence | Owning Test/Contract | Must Prove |
|---|---|---|
| Fresh DB → latest | `migrations-effects` shared contract + host/native harness | Migration 23 never references future tables; successor schema/index/trigger SQL is exact. |
| Schema 27 → latest | new synthetic fixture + same contract | IDs, completed history, recoverable workout, timing bytes, portable identities, opportunities, and backup state unchanged except deterministic `strength` backfill. |
| Constraint failure cuts | migration contract | Statement/verify/integrity/commit failures leave a valid old or fully new version; validated recovery artifact exists for destructive work. |
| Independent activation | `multi-plan-activation.test.ts` | Other sport's revision, pointer, overrides, opportunities, and receipts are identical after activation/replacement. Approved MAP-01 defines same-sport expectations. |
| Same-weekday slots | `running-foundation.test.ts` | Two Running slots on one date remain distinct across restart, move/keep-both decisions, and schedule edits. |
| Start/complete provenance | extend `today-schedule-workout.test.ts` | Mismatched/stale selection writes nothing; plan switch before retry cannot redirect completion; replay consumes original opportunity once. |
| GarminSourceEnvelope identity matrix | `imported-activity-facts.test.ts` | Account-scoped exact replay, changed canonical digest revision, component-hash provenance conflict, no-resurrection, and no plan/session side effects. |
| Match ledger | `running-activity-match.test.ts` | Explicit confirmation, exact revisions, one-to-one current relation, append-only unmatch/reassign, stale replay rejection. |
| Bodyweight | `bodyweight-history.test.ts` | Dated grams/edit/delete/tombstone round-trip; no workout target mutation. |
| Successor portability | `multi-plan-portability.test.ts` + portable merge contract | v1/v2 readable; successor facts complete; remaps/closure/conflicts correct; trigger restoration; `rebuild_pending` → deterministic `ready`. |
| Calendar/Progress projection | host repository tests | Stable multi-source events, sparse/unavailable truth, deterministic rebuild, derivative rebuild does not dirty backup. |
| Native lifecycle | extended `migrations-effects` device suite | Upgrade, process death, offline start/complete, relaunch recovery, and no pre-commit acknowledgment. |

## Shared Patterns

### Errors and Diagnostics

- Domain validation errors: typed, non-retryable, stable code/correlation code (`ScheduleCommandInputError`, `MetricBoundaryError`).
- Expected stale/replay conflicts: return a typed repository outcome inside the transaction, then throw the typed domain/repository error outside it (`starterPlanRepository.ts:1295-1298`).
- Storage failures: let the SQLite kernel map raw failures; expose stable storage codes only.
- Diagnostics contain versions, counts, hashes, case IDs, and opaque receipt IDs. Never log raw rows, workout payloads, activity routes/HR, file paths, provider account subjects, or SQL parameters.

### Validation Order

1. Parse/validate strict external shape and bounds.
2. Validate identifiers, time, and expected revisions.
3. Build canonical payload and request SHA-256.
4. Enter `kernel.write`.
5. Replay receipt or reject request-ID/hash conflict.
6. Re-read complete authoritative ownership/revision state.
7. Apply a pure transition and write source facts/events/receipt.
8. Assert pair/FK/domain invariants and exact read-back.
9. Commit.
10. Only then invalidate projections, notify, or acknowledge.

### Stable Identity

- Local FKs use local IDs; portability uses `(owner_namespace, portable_id)`.
- Stable root IDs survive edits; edits append immutable revisions.
- A displayed opportunity/event carries its own stable identity, never only a date/title.
- Deterministic IDs may derive from the canonical request hash where replay must reconstruct the same children.
- Receipts and tombstones are source facts and join the successor portable graph.

### Source vs Projection

Authoritative: plans/kind, schedule versions/bindings/opportunities/events, Running roots/revisions, workout provenance, imported aggregates/payload revisions/refs/receipts, match events, bodyweight revisions/tombstones.  
Rebuildable: current match relation, Calendar event projection, Progress aggregates, search indexes, UI caches.  
Excluded: provider credentials, transport jobs/cursors, temporary file bytes, connection state.

## Intentional New Boundaries

These are not gaps to paper over with the nearest Strength table.

| Boundary | Why It Is New | Structural Pattern to Reuse | Forbidden Substitution |
|---|---|---|---|
| Stable Running session root + immutable revisions + slot binding | Strength `plan_days` and one-binding-per-weekday cannot represent multiple ordered same-day sessions. | Owned plan revision fencing + schedule version/binding identities. | Weakening Strength uniqueness or identifying a run by weekday/title only. |
| Selected occurrence + immutable workout schedule link | Current start request omits schedule/version/opportunity provenance. | Discriminated request + transactional snapshot creation. | Completion lookup through current active schedule. |
| Imported activity aggregate/payload revisions | Imported evidence exists without any plan or Strength session. | Immutable source/receipt/portable identity patterns. | Creating `workout_sessions`, activating a plan, or auto-completing on import. |
| Match event ledger + rebuildable current relation | Matching is an audited owner decision independent of import. | Schedule/history append-only events + pure transition. | Mutable link row as sole truth, date-only matching, or automatic candidate acceptance. |
| Dated bodyweight measurement aggregate | Exercise metric `bodyweight_reps` is not owner mass history. | Strict integer-unit contract + history corrections/tombstones. | Writing session sets, progression targets, or metric profile rows. |
| Successor portability graph | New source tables cannot be made mandatory for v1/v2 or visible to migration 23. | Exact versioned allowlists, refs, filters, remaps, trigger capture, rebuild gate. | Growing one global registry used by historical migrations. |

## Anti-Patterns to Reject in Plans and Reviews

1. **Encoding MAP-01 inconsistently.** Validate approved `one-per-sport` before DDL, then enforce zero or one active pair for each sport; do not retain an arbitrary same-sport branch.
2. **Editing an applied migration's outcome.** Preserve historical migration semantics. Use the actual next version and test fresh plus schema-27 upgrades.
3. **Changing only the two global indexes.** Scalar readers, global deactivation, `LIMIT 1`, restore invariants, merge normalization, Today, and completion must cut over coherently.
4. **Date-only identity.** `UNIQUE(schedule_id, local_date, source)` cannot represent same-day Running slots; titles/timestamps are not identity.
5. **Current-activation completion.** Session completion/retry must use captured provenance, never whichever schedule is active later.
6. **Import implies match/plan/session.** Import writes independent evidence only. Match is a separate owner-confirmed transaction.
7. **Projection as source truth.** Current match/completion, Calendar, and Progress rows must be rebuildable from source events/facts.
8. **Global portability allowlist mutation.** Migration 23 currently imports `LOGICAL_BACKUP_TABLES`; isolate a historical table set before adding successor tables.
9. **Unrestricted backup collection.** Every new source table requires an explicit owner/closure filter; no `sqlite_master` dump.
10. **Bodyweight conflation.** Do not reuse `bodyweight_reps`, workout targets, or session observations for dated mass.
11. **UI/provider SQL.** Screens and Phase 18 adapters consume typed ports only.
12. **Calendar N+1 and date-state collapse.** Batch counts and emit stable event rows; do not query every session separately or return only status sets.
13. **Timing UI-only retirement.** Approved TIM-01 requires removal of authoring, reconciliation, queued callbacks, and playback; all ordinary history plus set/pointer/rest recovery remain intact while dormant historical bytes are not interpreted.
14. **Personal-data fixtures/diagnostics.** Tests use synthetic facts; evidence never commits owner routes, HR, workout rows, filenames, or account subjects.

## No Semantic Analog Found

| New Concept | Closest Structural Analog | Why Direct Copy Is Wrong |
|---|---|---|
| Running session revision graph | Owned Strength plan graph | Running has seven discriminated session types and multiple ordered same-weekday slots; Strength day/exercise constraints differ. |
| Imported activity aggregate | Content import or workout session | Content import is bundled catalog data; a workout session is Strength execution. Neither models immutable external activity evidence/revisions. |
| Running activity match ledger | Schedule opportunity completion/history audit | Existing completion requires a Strength session; match/unmatch/reassign needs exact imported payload and opportunity revisions plus one-to-one derivative relation. |
| Dated bodyweight history | `bodyweight_reps` metric | Existing metric stores reps/variation and participates in workout targets; owner mass must remain separate. |
| Workout schedule provenance link | Existing session snapshot | Existing snapshot preserves exercises/targets but not schedule/version/slot/opportunity identity. |
| Multi-source training event port | Calendar month state map | Existing reader collapses identity into status-by-date and filters missed facts through current activation. |

The planner should use the Phase 13 research/ADRs for these semantics while copying transaction, identity, error, and test structure from the analogs above.

## Metadata

**Analog search scope:** `src/domains`, `src/platform/sqlite`, `src/bootstrap`, `src/testing/contracts`, `tests/integration`, `tests/sqlite-host`, `tests/migrations/fixtures`  
**Primary analog families inspected:** migrations 0008/0022/0023; starter/workout/history/portability repositories; metric/schedule/workout contracts; migration/merge/integration harnesses  
**Pattern extraction date:** 2026-10-06  
**Settled-record gates preserved:** Automatically validate MAP-01 before active-cardinality DDL and TIM-01 before timing runtime retirement; Garmin transport remains Phase 18.
