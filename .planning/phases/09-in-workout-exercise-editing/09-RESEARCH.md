# Phase 9: In-Workout Exercise Editing — Research

**Phase:** 09-in-workout-exercise-editing  
**Researched:** 2026-09-15  
**Confidence:** High for the existing command/persistence seams; Medium for the precise new schema because owner decisions require a new persisted distinction that does not yet exist.

## Verification anchor

Phase 9 must satisfy the six roadmap criteria: add appends a fresh snapshot, replace preserves completed history, remove only hard-deletes no-completion work, reorder is presentation-only, edited sessions remain scheduled/progression-safe, and the completion flow offers explicit default-No write-back. [VERIFIED: .planning/ROADMAP.md:84-98]

The binding decisions are: all-or-nothing write-back through the owned-plan path (D-01/D-02); row-level append-only facts and completed-set correct-or-undo protection (D-03); single-select add with null lineage (D-04); replace-to-skip when completed (D-05); guarded remove (D-06); display-only reorder with accessible fallback (D-07); and consume scheduled opportunity plus modified-from-plan semantics (D-08). [VERIFIED: .planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md:19-65]

## Standard stack and non-negotiable persistence pattern

### Repository-owned command architecture

- Screens must call runtime/domain commands, never SQL. All writes ultimately call `kernel.write`; its writer is FIFO (`private tail`) and wraps the callback in `BEGIN IMMEDIATE`, `COMMIT`, and `ROLLBACK`. [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-84] [VERIFIED: src/platform/sqlite/sqliteKernel.ts:125-156]
- A session edit must write all source facts, session revision/active-pointer changes, idempotency receipt, and any durable pending effects inside **one** `kernel.write` callback; UI refresh/haptics/effect draining happens only after it returns. Existing remove does this and returns only after the receipt is inserted. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1014-1175] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3330-3377]
- Match the set-command layering: a small domain validation function, repository capability on `ActiveWorkoutRepository`, a `WorkoutCommandConflictError` for stale/state conflicts, runtime wiring, then UI. `ActiveWorkoutRepository` currently exposes optional remove methods and `WorkoutCommandConflictError` has `kind = "conflict"` and `retryable = false`. [VERIFIED: src/domains/workout/activeWorkout.ts:196-221] [VERIFIED: src/domains/workout/activeWorkout.ts:270-305]
- The requirement-level transaction rule is explicit: source mutation plus durable pending effects commits before UI acknowledgement. [VERIFIED: .planning/REQUIREMENTS.md:64-72]

### New command shape to plan

Create a focused `src/domains/workout/sessionExerciseCommands.ts` rather than expanding set-only terminology. Export through the workout barrel and add matching `ActiveWorkoutRepository` methods. This is an implementation recommendation, not an existing API. [ASSUMED]

Use a common immutable request envelope for **addExercise**, **replaceExercise**, **removeExercise**, and **reorderExercises**:

```ts
{ requestId, requestSha256, sessionId, expectedSessionRevision, occurredAtMs, ...commandSpecific }
```

For targeted commands add `sessionExerciseId` and `expectedExerciseRevision`; replacement includes the new exercise id/new session-exercise id/new working-set id and a requested display position; reorder carries the exact ordered session-exercise IDs (or moves from/to) and expected revisions for every affected row. Return `{ outcome: "committed" | "already_committed", sessionId, sessionRevision, ...ids }`. [ASSUMED]

Mirror `validateRemoveInput`: trimmed bounded identifiers, lowercase 64-char SHA-256, nonnegative integer revisions/times, then reject missing repository capability. [VERIFIED: src/domains/workout/setCommands.ts:27-64] The current remove receipt checks a replay by request ID plus hash and command facts; a hash mismatch becomes `remove_set_replay_conflict`, while a matching replay returns `already_committed`. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1019-1041]

Add a separate immutable `workout_session_exercise_edit_receipts` table (or deliberately extend the receipt table with new operation/entity columns; the former is clearer) with request id/hash, operation, session id, primary/affected exercise identifiers, expected/result session revision, result JSON, committed time, and immutable update/delete triggers. The existing receipt migration is the direct schema and verification template. [VERIFIED: src/platform/sqlite/migrations/0017_workout_remove_receipts.ts:4-46] [VERIFIED: src/platform/sqlite/migrations/0017_workout_remove_receipts.ts:76-131]

## Existing data model and the exact writer seam

### Current snapshot rows

`workout_sessions` has `active_session_exercise_id`, `active_set_id`, and `revision`; `session_exercises` has source plan-day lineage, immutable copied identity fields, `ordinal`, target revision, status, revision; `session_sets` has source target lineage, copied target/unit/rule JSON, observed values, status, completion key, revision. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:136-217]

Later metric migration adds the metric-contract and exercise-generation snapshot fields used by runtime reads/writes. Existing runtime probes explicitly look for `metric_contract_version` and `exercise_metric_generation` on session exercises and sets. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:428-448]

The active-workout loader orders exercises by `ordinal` and sets by exercise ordinal/kind/ordinal, then exposes exercise name, metric identity/profile, status, revision and working sets to the UI. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:613-703]

The start-workout copier is the correct source for a new exercise snapshot: it inserts `source_plan_day_exercise_id`, copied exercise name/metric identity/rest/target revision/status/revision, then inserts target/unit/rule/version and source target lineage on every set. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:859-899] [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:915-958]

For D-04, query the available library exercise's metric identity and default rest, derive its metric contract's default target/units/rule in the same way the owned-plan target editor constructs a fresh occurrence, insert a **single** working `session_sets` row, set both plan-target lineage columns to `NULL`, and give it status `planned` (or `active` only if it is selected as the next active set). `addWorkingSet` demonstrates the snapshot insert columns and that user-added copies use `source_plan_working_set_target_id = NULL`. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1527-1618]

### Active pointer, revision, rest, and safety rules

Every exercise command must read the in-progress session in the writer, verify `expectedSessionRevision`, conditionally write active pointers (`active_session_exercise_id`, `active_set_id`) where the edit removes the active exercise/set, increment session revision exactly once, and re-select the next eligible working set by display order. Existing guarded removal shows this full sequence. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1043-1149]

If an edit invalidates the rest state's `next_set_id`, set rest idle and enqueue reconciliation in the same transaction. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1131-1142]

The pre-existing completed-set barrier is concrete: remove only accepts `planned`, `draft`, or `skipped`, then refuses when any `session_undo_snapshots` reference exists with `remove_set_history_immutable`; deletion is conditionally constrained to non-completed statuses. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1048-1067] [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1117-1129]

**Important reconciliation of D-03 with D-06:** “hard-delete” is permissible only for an uncommitted, zero-completed provisional exercise and all its non-completed sets. It must not delete a row with any completed set or undo snapshot. For completed history, transition the exercise and only noncompleted child sets to `skipped`; retain completed set rows and their snapshots. This generalizes existing `skipExercise`, which marks planned/draft sets skipped, marks the exercise skipped, advances active pointers, increments session revision, and queues finish effects atomically. [VERIFIED: src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2194-2279]

## Per-decision implementation notes

### D-03 / WORK-24 and carried WORK-04 — append-only snapshot invariant

- Add: append a new `session_exercises` snapshot and one new `session_sets` snapshot; never edit an existing exercise/set's name, metric identity, unit JSON, target JSON/rule version, or creation order. [VERIFIED: .planning/REQUIREMENTS.md:16-24]
- Replace with zero completed: validate that no child working set is completed and no undo snapshot references any child; delete the provisional original plus only provisional child sets, normalize **display** order, then insert the replacement at the same ordinal. Preserve the original planned-order value separately (schema recommendation below). [ASSUMED]
- Replace with completed: update original and non-completed children to skipped (do not rewrite completed rows), append a new replacement snapshot, then assign its display position. [VERIFIED: .planning/REQUIREMENTS.md:31-37]
- Remove: only the zero-completed branch can delete provisional data. Completed branch is skip-only, excludes it from remaining-work counts, and must preserve its completed facts. [VERIFIED: .planning/ROADMAP.md:91-96]
- Reorder: do not overload `ordinal` if it represents order-at-creation. Persist a separately named display ordinal and leave creation/planned ordinal fixed; this is necessary to prove the requirement's “order-at-creation” and D-07's immutable planned order. [VERIFIED: .planning/REQUIREMENTS.md:31-37] [ASSUMED]

### D-04 / WORK-20 — add

- Source the exercise from the established library search. `LibraryScreen` owns the shared `M3SearchField`, filters, and library exercise search contract; plan editor already demonstrates a compact single-select `M3SearchField` plus accessible exercise option rows. [VERIFIED: src/ui/screens/LibraryScreen.tsx:142-177] [VERIFIED: src/ui/screens/OwnedPlanEditorScreen.tsx:1294-1359]
- The plan replacement screen's picker is **metric-compatible filtering**, so it cannot be copied directly for add: it says “No available exercise has the same complete metric identity.” Phase 9 add must accept any available exercise and derive a profile-appropriate default rather than requiring compatibility with a removed exercise. [VERIFIED: src/ui/screens/ExerciseReplacementScreen.tsx:382-403]
- Runtime should expose a lightweight `listAvailableWorkoutExercises()` option including ID, name, metric identity, default rest, and default target scheme materialization. The owned-plan runtime already exposes an analogous `listExercises()` option and `createId(kind)` factory. [VERIFIED: src/bootstrap/ownedPlanRuntime.tsx:34-79] [VERIFIED: src/bootstrap/ownedPlanRuntime.tsx:91-106]
- Mark the new row `origin = 'added'`; set `source_plan_day_exercise_id` and set-target lineage `NULL`; no recommendation generation must target it. [VERIFIED: .planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md:35-42]

### D-05 / WORK-21 — replace

Use the same library picker but with a selected original. Do not reuse plan replacement's same-metric restriction for the session replacement unless a target-transfer UX is deliberately chosen; D-05 requires the replacement “carries its own snapshot,” and D-04's default-scheme behavior is the safer model. [VERIFIED: .planning/REQUIREMENTS.md:31-35] [ASSUMED]

Before mutation, atomically determine completed child working-set count and active/rest ownership. On no-completed delete provisional original+children and insert replacement at its display position; on any completed, skip original/noncompleted children and insert replacement without touching completed children. Both branches mark the session `modified_from_plan = 1`. [ASSUMED]

### D-06 / WORK-22 — remove

Offer a confirmation whose copy distinguishes “Remove” from “Mark skipped; completed sets are retained.” Use the `skipExercise` state transition rather than duplicating a weaker implementation for the completed branch. [VERIFIED: src/domains/workout/finishWorkout.ts:24-31] [VERIFIED: src/platform/sqlite/repositories/workoutOutcomeRepository.ts:2194-2279]

### D-07 / WORK-23 — reorder

Reuse `PlanEditorReorderableRow` from `OwnedPlanEditorScreen`: each occurrence passes both `onMoveTo(..., "drag")` and explicit `onMoveUp`/`onMoveDown`; the state helper reassigns contiguous ordinals and provides text feedback such as `"${item.name} dragged to ${targetIndex + 1} of ${reordered.length}"`. [VERIFIED: src/ui/screens/OwnedPlanEditorScreen.tsx:897-953] [VERIFIED: src/ui/screens/OwnedPlanEditorScreen.tsx:1246-1292]

The Phase 9 version must bind that component to a committed repository command rather than draft-only React state. Persist presentation `display_ordinal` contiguously in one revision-checked transaction; do not change `planned_ordinal`/creation ordinal, completed facts, or source lineage. Its drag-test IDs should follow the established `drag-exercise-*` convention. [VERIFIED: maestro/phase7/plan-schedule-reorder.yaml:52-62] [ASSUMED]

### D-08 / WORK-25 — scheduling and progression

Existing completion calls `finishCompleted` first, then `schedules.completeScheduledSession(sessionId)`. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3504-3514] `completeScheduledSession` accepts only a completed `scheduled_day` session with plan/day IDs, then sends the session start instant/local date and plan day into `completeScheduledOpportunity`. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:886-930]

Therefore, retain that schedule consumption path for modified sessions: the owner trained the scheduled day. Store `workout_sessions.modified_from_plan` during the first successful composition edit; schedule transition itself should remain based on session source/day, not composition equality. [ASSUMED]

Progression is a separate effect/repository path. Its interface generates recommendations using `sessionId`, `expectedSessionRevision`, and `nowMs`; it resolves set target references only when legacy or owned lineage exists. [VERIFIED: src/domains/progression/recommendationCommands.ts:33-53] [VERIFIED: src/platform/sqlite/repositories/workoutOutcomeRepository.ts:187-220]

Implement deterministic eligibility in the progression evidence query/generator: only completed working sets whose session exercise has non-null lineage to an occurrence that was in the planned day at start are eligible; added rows with null lineage cannot generate/advance a recommendation. For replaced/removed planned occurrences, retain facts but do not silently mutate targets; missing planned exercise evidence simply yields no auto-progression for that occurrence. [VERIFIED: .planning/REQUIREMENTS.md:35-37] [ASSUMED]

### D-01/D-02 / WORK-27 — write-back at finish

The UI prompt belongs after the final completion outcome is committed and before navigation to `WorkoutCompletionScreen`: this ensures the recorded session is durable whether the owner chooses No, closes the prompt, or the plan write conflicts. Existing completion is a thin domain validator/repository call and the runtime already performs post-commit lifecycle/read refresh. [VERIFIED: src/domains/workout/finishWorkout.ts:65-76] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3480-3514]

Show exactly `Save these changes to the plan?` (default No) only when: session is planned/scheduled with owning **owned** plan/day, `modified_from_plan = 1`, and a recomputed comparison/delta from immutable planned snapshot is nonempty. Never show it for empty/unplanned sessions or edits that ultimately return composition to the planned snapshot. [VERIFIED: .planning/REQUIREMENTS.md:31-37] [ASSUMED]

Do **not** call `ownedPlanRuntime.replaceExercise` once per delta: its existing public contract is a replacement of one occurrence or all same occurrences and requires a preview/review checklist. [VERIFIED: src/domains/plans/planImpactCommands.ts:96-127] [VERIFIED: src/domains/plans/planImpactCommands.ts:633-661] D-01 requires add/remove/reorder too, in one all-or-nothing operation. Reuse the owned-plan **mutation-request / aggregate-state architecture**, but introduce an explicit `applySessionExerciseEditsToPlan` command/repository operation accepting the full day composition/delta, expected plan revision, preview token/hash, and one request id. [ASSUMED]

The existing replacement path proves the required safety mechanics: runtime creates the owned repository/impact repository with sha256 and routes `previewExerciseReplacement`/`replacePlanExercise`; command rebuilds preview facts, rejects stale revision/token, then applies atomically with request hashing and post-commit invalidation. [VERIFIED: src/bootstrap/ownedPlanRuntime.tsx:91-106] [VERIFIED: src/bootstrap/ownedPlanRuntime.tsx:208-221] [VERIFIED: src/domains/plans/planImpactCommands.ts:395-415] [VERIFIED: src/domains/plans/planImpactCommands.ts:633-664]

The write-back aggregate must create/retire/reorder **owned** day occurrences, targets, policies, and IDs in one transaction while retaining all session rows unchanged. The current plan-impact preview explicitly reports `currentWorkoutUnaffected`; Phase 9 must preserve that property even though the workout is already complete. [VERIFIED: src/domains/plans/planImpactCommands.ts:96-109] [VERIFIED: src/ui/screens/ExerciseReplacementScreen.tsx:416-421]

## Required migration and backup portability update

**Conclusion: a schema migration is required; planned version is 19 (current latest is 18).** [VERIFIED: src/platform/sqlite/migrations/index.ts:15-37]

Minimum schema proposal:

1. `workout_sessions.modified_from_plan INTEGER NOT NULL DEFAULT 0 CHECK(modified_from_plan IN (0,1))`; this is required for durable D-08 and process-death-safe D-02 prompt eligibility.
2. `session_exercises.origin TEXT NOT NULL DEFAULT 'planned' CHECK(origin IN ('planned','added'))`; explicit D-04 owner-added provenance.
3. Preserve immutable `ordinal` as creation/planned ordinal, add `display_ordinal INTEGER NOT NULL`; update active loader/query ordering and unique index to session/display order. If initial plan order must be separately auditable for an added/replacement row, name the existing ordinal `created_ordinal` only in the read model, not a destructive rename.
4. Add immutable session-exercise command receipt table plus triggers as above.
5. If write-back must be recoverable/idempotent over app restart, add a user-owned write-back request/receipt record; otherwise owned plan mutation requests can be the receipt only if their operation enum/result JSON is extended to represent the full session delta. [ASSUMED]

The migration must be additive and verify its exact columns/checks/indexes/triggers, following migration 17. Register it in `migrations/index.ts`; the runner validates ordered manifest, applies each migration through the private writer, and runs foreign-key/integrity checks. [VERIFIED: src/platform/sqlite/migrationRunner.ts:69-82] [VERIFIED: src/platform/sqlite/migrationRunner.ts:201-230] [VERIFIED: src/platform/sqlite/migrations/0017_workout_remove_receipts.ts:76-131]

Because logical backups select real source-table columns and validate exact columns, new columns automatically appear in table snapshots but are not portable until restore accepts the resulting schema. Migration 19 already extended the live supported list through 19; the corrective receipt migration must extend it through 20, update version fixtures, and retain restore schema tests. [VERIFIED: src/domains/portability/restoreCommands.ts:146-162] [VERIFIED: src/domains/portability/restoreCommands.ts:191-220]

Update `LOGICAL_BACKUP_REFERENCE_DEFINITIONS` for any new receipt/write-back table and its foreign keys. Existing definitions already cover sessions, session exercises, plan lineage, sets, rest, undo snapshots, and schedule opportunity/session link. [VERIFIED: src/domains/portability/restoreCommands.ts:157-162] Add any new user-owned table to `LOGICAL_BACKUP_TABLE_DEFINITIONS`; otherwise exact-key backup validation will reject or omit it. [VERIFIED: src/domains/portability/backupContracts.ts:22-79]

## Integration points and reusable assets

| Asset | Reuse / required change |
|---|---|
| `src/domains/workout/activeWorkout.ts:36-68,196-305` | Extend status/view types (origin, display order, modified flag), inputs/results, and repository interface. Existing active view includes `activeSetId`, `activeExerciseId`, all exercises and progress. |
| `src/domains/workout/setCommands.ts:27-64,192-212` | Copy input validation, optional capability error behavior, request hash/revision contract. |
| `src/platform/sqlite/repositories/workoutRepository.ts:613-703,1014-1175` | Main read/write seam; add edit commands here under one writer transaction. |
| `src/bootstrap/workoutAppRuntime.tsx:3292-3409` | Add a generalized `runSessionExerciseMutation` refresh/error bridge and export runtime actions to Phase 8 overview. |
| `src/ui/screens/OwnedPlanEditorScreen.tsx:897-953,1246-1292` | Reuse drag-first row plus accessible up/down fallback; change draft callback to persisted session command. |
| `src/ui/screens/OwnedPlanEditorScreen.tsx:1294-1359` and `src/ui/components/M3SearchField` | Reuse Material 3 single-select Search/filter presentation for add/replacement picker. |
| `src/domains/plans/planImpactCommands.ts:395-415,633-664` and `src/bootstrap/ownedPlanRuntime.tsx:208-221` | Safety pattern for WORK-27 preview + revision/hash/replay + atomic owned plan mutation. Needs a full-day aggregate command, not N replacements. |
| `src/bootstrap/scheduleRuntime.tsx:886-930` | Preserve scheduled-opportunity consumption after finish. |
| `src/domains/portability/restoreCommands.ts:157-162` | Update graph for all new persisted references/receipts. |

## Test, coverage, and Maestro surface

### Unit/domain

- New `sessionExerciseCommands.test.ts`: every identifier/hash/time/revision validation branch; absent repo capability; request canonicalization; conflict mapping; idempotent replay vs mismatched replay. `setCommands.test.ts` is the direct test convention. [VERIFIED: src/domains/workout/setCommands.ts:46-64] [VERIFIED: src/domains/workout/setCommands.ts:192-212]
- `activeWorkout` contract tests: origin/display/planned-order data visible; all new inputs/result types; skipped/active/progress read model.
- Extend `finishWorkout` tests for save-to-plan prompt decision guard/state machine (No does nothing, Yes invokes explicit write-back only after finish; stale plan is surfaced without changing session). `finishWorkout` presently validates only finish confirmation/revision/time. [VERIFIED: src/domains/workout/finishWorkout.ts:65-155]
- Extend `planImpactCommands.test.ts` for all-or-nothing aggregate add/remove/reorder/replace, stale preview/revision, replay, and no session mutation; existing replacement checks require all five review fields. [VERIFIED: src/domains/plans/planImpactCommands.ts:633-661]

### Host SQLite / migration / integration

- Add real Expo SQLite contracts for migration 19: upgrade from every retained fixture, new columns/default/checks/indexes/triggers, rollback on injected migration failure, FK/integrity checks, and logical backup → restore exact row round-trip. Existing host migration and logical-backup suites establish the locations. [VERIFIED: tests/sqlite-host/migrations-effects.test.ts:1-1] [VERIFIED: tests/sqlite-host/logicalBackupRepository.test.ts:1-1] [VERIFIED: tests/sqlite-host/logicalRestoreRepository.test.ts:1-1]
- Repository tests must prove: add inserts only new rows; zero-completed replace/remove deletes only provisional rows; completed replace/remove preserves completed row, undo snapshot, target/rule/metric identity; reorder changes only `display_ordinal`; active/rest pointers never dangle; each success increments session revision once; retry does not duplicate rows; write failure rolls back every row and receipt.
- Progression/schedule tests must prove edited scheduled session consumes exactly one opportunity, added/null-lineage work never advances targets, and no planned-absent exercise gets automatic progression. [VERIFIED: src/bootstrap/scheduleRuntime.tsx:886-930] [VERIFIED: src/domains/progression/recommendationCommands.ts:47-53]
- Owned-plan integration must prove the prompted Yes applies all deltas atomically, stale plan applies none, No applies none, and prior session/history rows remain byte-for-byte unchanged.

### Coverage gate

Add the new domain command module and migration 19 to `scripts/run-coverage-gate.mjs`; the gate executes unit/components/sqlite-host/integration coverage and fails each integrity-critical file below 100% statements/branches/functions/lines. [VERIFIED: scripts/run-coverage-gate.mjs:16-101] [VERIFIED: scripts/run-coverage-gate.mjs:122-175]

### Maestro

Create `maestro/phase9/in-workout-exercise-editing.yaml` plus any setup subflow. It should: start a planned workout; add a searched exercise and assert `Added`; replace pre-completion and assert position; complete a set then replace/remove and assert original `Skipped` plus retained completion; use accessible Move up/Move down and assert order; force stop/relaunch to prove persisted order/modified flag; finish and verify default No leaves plan unchanged; repeat Yes and verify plan day updates after relaunch. Use Phase 7's staged environment-variable flow, launch/relaunch (`clearState: false`), IDs, and `assertVisible above` ordering evidence as the reference. [VERIFIED: maestro/phase7/plan-schedule-reorder.yaml:1-7] [VERIFIED: maestro/phase7/plan-schedule-reorder.yaml:64-139]

## Pitfalls / planner guardrails

1. **Never treat the plan as the live session source.** A plan write-back must happen after the session finish commit and must not mutate `session_exercises`/`session_sets`; current plan UI already calls out “This workout uses an immutable snapshot. The replacement changes only future plan use.” [VERIFIED: src/ui/screens/ExerciseReplacementScreen.tsx:416-421]
2. **Do not delete completed or undo-referenced rows.** Check all child working sets, not just the exercise status; preserve completed set records and undo references. [VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1058-1067]
3. **Do not implement reorder by rewriting creation ordinal.** It would violate WORK-24's order-at-creation and D-07; use a new display-order column/read ordering. [VERIFIED: .planning/REQUIREMENTS.md:31-37]
4. **Do not use repeated `replaceExercise` calls for write-back.** D-01 needs all deltas in a single owned-plan transaction; individual calls can partially apply. [VERIFIED: .planning/phases/09-in-workout-exercise-editing/09-CONTEXT.md:19-31]
5. **Do not infer modified status solely from UI actions.** Persist and derive/verify it in the transaction so process death, retry, and finish prompt are deterministic. [ASSUMED]
6. **Do not run automatic progression for null target lineage.** Current target-reference resolution returns null if both lineage IDs are absent. [VERIFIED: src/platform/sqlite/repositories/workoutOutcomeRepository.ts:206-220]
7. **Do not acknowledge UI/haptics early.** Keep effects and pointer changes inside writer and refresh only after committed return. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3330-3377]

## Recommended plan decomposition

1. Migration 19 + backup/restore graph/version/contracts and host-SQLite proof.
2. Session-exercise domain/repository commands + active-view read model, integrity receipts, deterministic active/rest/progression flag behavior, full coverage.
3. Runtime/overview picker and add/replace/remove/reorder UI with accessibility, drag fallback, component tests, and Maestro persistence proof.
4. Finish prompt and all-or-nothing owned-plan aggregate write-back, schedule/progression integration, full regression/coverage/Maestro.

## 2026-09-16 Replan Correction — forward-only replace/remove receipts

### Corrected premise and binding recommendation

The prior migration recommendation is now stale. Migration 19 has already shipped
`workout_session_exercise_edit_receipts`, but its exact operation constraint is
`operation IN ('add_exercise')` and its `session_exercise_id` foreign key is
`REFERENCES session_exercises(id) ON DELETE RESTRICT`. [VERIFIED:
src/platform/sqlite/migrations/0019_session_exercise_editing.ts:12-22]

The shipped add path inserts that receipt in the same writer transaction after it
creates the added exercise and its initial set. [VERIFIED:
src/platform/sqlite/repositories/workoutRepository.ts:1470-1528] Therefore, a
later D-06 hard-delete of that provisional added exercise would be rejected by the
existing add receipt even if the new remove command used a separate receipt table.
Do not edit migration 19. Ship a **forward-only migration 20** that rebuilds the
receipt table under the same public name, copies every v19 add receipt unchanged,
and replaces the entity FK with scalar immutable evidence. This is the only safe
way to keep both v19 replay and the permitted provisional-delete branch.

**Primary recommendation:** Migration 20 must rebuild
`workout_session_exercise_edit_receipts` as a portable, immutable command ledger
whose exercise IDs are evidence values, not foreign keys; extend the operation
set to `add_exercise`, `replace_exercise`, and `remove_exercise`. Retain a
`workout_sessions(id) ON DELETE RESTRICT` FK if desired, but create **no foreign
key at all** from a receipt to `session_exercises` or `session_sets`.

### Required v20 receipt schema

Use a destructive/rebuild migration patterned after v18: first drop v19's two
immutability triggers, rename the legacy table, create the new strict table, copy
the legacy columns verbatim, drop the legacy table, then recreate the immutable
triggers. Migration 18 already establishes this repository's forward-only
table-rebuild, copy, and trigger-recreation pattern. [VERIFIED:
src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts:72-105]

The v20 table should have these exact logical fields (names are recommendations,
not yet source facts):

| Column | Constraint / purpose |
|---|---|
| `request_id` | `TEXT PRIMARY KEY`, bounded nonblank request identity; replay lookup. |
| `request_sha256` | Lowercase 64-hex digest of the full canonical request; mismatch means conflict. |
| `operation` | `CHECK(operation IN ('add_exercise','replace_exercise','remove_exercise'))`. |
| `session_id` | Bounded session identity; may retain `REFERENCES workout_sessions(id) ON DELETE RESTRICT`. |
| `subject_session_exercise_id` | Non-null bounded scalar ID for the added/replaced/removed original; **no FK**. |
| `replacement_session_exercise_id` | Nullable bounded scalar ID; non-null only for `replace_exercise`; **no FK**. |
| `expected_session_revision` | Nonnegative optimistic-concurrency input. |
| `result_session_revision` | `CHECK(result_session_revision = expected_session_revision + 1)`. |
| `result_json` | Valid, canonical result facts sufficient to replay without querying a deleted row. |
| `committed_at_ms` | Nonnegative immutable commit timestamp. |

Add a partial/check constraint that `replacement_session_exercise_id IS NULL` for
add/remove and `IS NOT NULL` for replace. Add an index on
`(session_id, committed_at_ms, request_id)` for session receipt inspection; the
primary key already supplies idempotency lookup. Recreate reject-all update and
delete triggers on the rebuilt table. The old receipt design already proves the
repository convention: immutable receipt triggers and a `json_valid(result_json)`
constraint. [VERIFIED: src/platform/sqlite/migrations/0017_workout_remove_receipts.ts:6-45]

`result_json` must be canonical JSON and include, at minimum, the verbatim result
facts `outcome`, `sessionId`, `subjectSessionExerciseId`,
`replacementSessionExerciseId`, and `sessionRevision`; add results also retain
`initialSetId`. The repository must compare every persisted input fact
(`request_sha256`, operation, session ID, subject ID, replacement ID where
applicable, expected revision, and commit time) before returning this result; a
same request ID with any differing fact returns a conflict. This mirrors the
existing add replay gate, which compares hash, operation, session/exercise ID,
expected revision, and committed time before returning the stored result.
[VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:889-899]
[VERIFIED: src/platform/sqlite/repositories/workoutRepository.ts:1399-1417]

Do not make `result_json` the only copy of the subject/replacement identities.
The scalar columns make exact matching/indexing auditable; JSON preserves the
complete stable return value. Enforce JSON-to-column agreement in the command
before insert and validate it on replay; SQL `json_extract` checks are an
optional defense-in-depth addition. [ASSUMED]

### D-03/D-05/D-06 behavior required by the receipt design

- **D-03:** completed and undo-referenced rows are never deleted. A replace/remove
  with any completed set marks the existing exercise skipped; its source rows and
  undo facts remain byte-identical except for the allowed status/revision mutation.
  The existing completed-set undo code reads a persisted snapshot and updates the
  completed set/exercise states, confirming that dangling/deleted referenced rows
  are not acceptable in this branch. [VERIFIED:
  src/platform/sqlite/repositories/workoutRepository.ts:2397-2473]
- **D-05:** with no completed sets, replace deletes the original provisional
  exercise plus permitted provisional children only after the new replacement and
  receipt outcome are staged in the same writer transaction. Its receipt refers
  to the deleted original only through `subject_session_exercise_id`.
  [ASSUMED]
- **D-06:** with no completed sets, remove clears active/rest pointers first if
  necessary, deletes provisional child sets, deletes the exercise, updates the
  session revision, and inserts the receipt atomically. `workout_sessions` already
  uses `ON DELETE SET NULL` for `active_session_exercise_id` and
  `active_set_id`; the command must nevertheless produce its intended active/rest
  state rather than depending on incidental FK action. [VERIFIED:
  src/platform/sqlite/migrations/0001_initial.ts:160-162]

### Required portability wave

The receipt table is already a logical-backup source table with primary key
`request_id`, and the collector currently treats it as categorically user-owned.
[VERIFIED: src/domains/portability/backupContracts.ts:67-75]
[VERIFIED: src/platform/sqlite/repositories/logicalBackupRepository.ts:67-75]
[VERIFIED: src/platform/sqlite/repositories/logicalBackupRepository.ts:110-117]

In the same v20 implementation wave, update all of the following:

1. `backupContracts.ts`: retain the same table entry/primary key, and extend
   snapshot fixtures so rows carry every rebuilt-table column exactly.
2. `logicalBackupRepository.ts`: keep the `"1"` ownership filter; it is correct
   because immutable command receipts are user-owned source facts.
3. `restoreCommands.ts`: replace the obsolete receipt-to-exercise edge with only
   `workout_session_exercise_edit_receipts.session_id -> workout_sessions.id`.
   The current graph contains both edges, including the stale
   `session_exercise_id -> session_exercises.id` relation that must disappear.
   [VERIFIED: src/domains/portability/restoreCommands.ts:161-162]
4. Extend `LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS` through 20. It currently
   explicitly accepts `[15, 16, 17, 18, 19]`, and restore rejects other producer
   versions before writing. [VERIFIED: src/domains/portability/restoreCommands.ts:146-147]
   [VERIFIED: src/domains/portability/restoreCommands.ts:186-220]
5. Update host logical-backup/logical-restore fixtures and the shared
   `migrations-effects` contract, then run the same named migration case on real
   Expo SQLite; the existing v19 contract currently checks only v19 columns and
   trigger existence. [VERIFIED:
   src/testing/contracts/migrationsEffects.contract.ts:394-431]

This is not optional cleanup: logical restore checks exact table keys, exact row
columns against the destination schema, and every declared reference before it
writes. [VERIFIED: src/domains/portability/restoreCommands.ts:191-220]

### Downstream version re-grounding

Phase 9's new v20 makes downstream fixed-version prose stale. Apply these edits
when those plans are replanned; alternatively replace the fixed numbers with an
execution-time "next migration after the registry maximum" rule wherever no
specific on-disk file contract is needed:

| Downstream file | Stale anchor | Required correction |
|---|---|---|
| `10-01-per-rep-cadence-tracer-PLAN.md` | Replanned Phase 10 anchor: `0021_advanced_set_timing.ts` / schema v21 after Phase 9 v19/v20. | Retain a live-registry check and support schemas through v21, including both Phase 9 receipt migrations. |
| `10-04-integrity-lifecycle-verification-PLAN.md` | It repeatedly requires schema/v20 host and Expo proof. [VERIFIED: .planning/phases/10-advanced-set-timing/10-04-integrity-lifecycle-verification-PLAN.md:45-48] | Shift those assertions/artifact labels to v21. |
| `11-01-stable-identity-merge-tracer-PLAN.md` | It fixes Phase 11 at `0021`, schema 21, and a v19/v20/v21 graph. [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-01-stable-identity-merge-tracer-PLAN.md:80-110] | Shift to `0022_portable_owner_identities.ts`, schema v22, supported schemas through v22, and v19/v20/v21/v22 graph—or make it execution-time next-on-disk. |
| `11-04-portability-verification-PLAN.md` | It specifies v19/v20 facts and critical v21 migration proof. [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-04-portability-verification-PLAN.md:78-80] | Include Phase 9 v20 receipts, Phase 10 v21 facts, and Phase 11 v22 migration proof. |
| `12-01-encrypted-drive-tracer-PLAN.md` | Replanned Phase 12 anchor: `0023_google_drive_sync.ts` / expected schema v23 after Phase 11 v22. | Inspect the live registry after Phase 11 and preserve the execution-time next-on-disk guard. |
| `12-02-change-log-scheduler-reconcile-PLAN.md` and `12-04-sync-security-verification-PLAN.md` | They refer to v22 bookkeeping / a schema-21-to-22 upgrade. [VERIFIED: .planning/phases/12-automatic-google-drive-sync/12-02-change-log-scheduler-reconcile-PLAN.md:54-57] [VERIFIED: .planning/phases/12-automatic-google-drive-sync/12-04-sync-security-verification-PLAN.md:89-93] | Shift to v23 bookkeeping and populated schema-v22 -> v23 proof, or use execution-time next-on-disk constraints. |

### Minimum replan proof matrix

1. **Migration:** migrate a populated v19 database containing an add receipt;
   assert the copy is byte-for-byte equal in all legacy fields, no receipt FK
   targets `session_exercises`, the session FK/triggers/check/index exist, and
   injected failure at each rename/create/copy/drop/trigger step rolls back to
   the exact pre-v20 schema/data.
2. **Remove provisional added exercise:** add, then remove the same zero-completed
   exercise; assert its set/exercise are absent, its v19 add receipt and v20 remove
   receipt remain, replay of each original request returns its stored result, and
   a changed SHA-256/input returns a conflict rather than reapplying.
3. **Replace provisional original:** replace a zero-completed original; assert the
   old row/children disappear, result evidence names both identities, replay is
   stable after process restart, and no receipt FK blocks delete.
4. **Completed/undo branch:** complete a set, capture canonical serialized rows
   for `session_exercises`, `session_sets`, and `session_undo_snapshots`, then
   replace/remove; assert original is skipped, no completed/undo row is deleted,
   and all non-allowed facts are byte-identical. Exercise undo after the command
   to prove the snapshot still restores valid rows.
5. **Transaction faults:** inject errors before the receipt insert, after the
   receipt insert but before commit, and at every delete/update pointer step;
   assert rollback leaves source rows, pointers, revision, and receipts exactly
   as before. The private writer's commit/rollback contract is the governing
   transaction boundary. [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-84]
6. **Portability:** host and real Expo contracts must round-trip an archive where
   a receipt references a deleted subject ID, validate the one remaining receipt
   graph edge, and reject a malformed/unsupported producer schema without any
   write. [VERIFIED: src/domains/portability/restoreCommands.ts:186-220]

### Replan-specific pitfalls

- Do not create a companion replace/remove table while leaving v19's add receipt
  FK in place; it fails D-06 for any added exercise.
- Do not cascade-delete receipts: that destroys replay evidence and violates the
  existing immutable-ledger convention.
- Do not omit receipts from backup as "operational" data: this repository has
  explicitly included this table as a logical source fact.
- Do not claim a row is immutable merely because the schema has triggers: D-05/D-06
  deliberately permit physical deletion only for provisional no-completion rows;
  tests must prove the completed/undo boundary separately.

## RESEARCH COMPLETE
