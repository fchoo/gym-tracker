# Phase 11 Research: Portable History & Merge Restore

**Phase:** 11 — Portable History & Merge Restore (v1.1)  
**Requirements:** DATA-08, DATA-09  
**Research date:** 2026-09-15

## Research scope and current baseline

This research is grounded in the Phase 11 context, discussion, roadmap, requirements, and source files that exist in the design worktree. Phases 9 and 10 are plan-time dependencies. Their v19/v20 migrations and summaries do not yet exist on disk; the highest existing migration is v18. [VERIFIED: src/platform/sqlite/migrations/index.ts:1-37]

Phase 11 must reuse, not fork, the GTBK logical backup pipeline. The recommended implementation is a v21 identity/merge migration after execution-time v19 and v20, a backward-compatible GTBK v2 logical/envelope extension, a read-only merge preflight that returns a single-use plan token and preview, a single writer transaction for the commit, and the existing derivative reconciliation pipeline after commit. [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-CONTEXT.md:23-43] [VERIFIED: .planning/REQUIREMENTS.md:45-47]

## Standard stack and required patterns

- SQLite is authoritative. All mutations use the private serialized writer. SqliteKernel.write delegates to SerializedWriteExecutor; the executor runs BEGIN IMMEDIATE, serializes FIFO work, commits only after the command succeeds, and rolls back command or commit failures. [VERIFIED: src/platform/sqlite/sqliteKernel.ts:125-144] [VERIFIED: src/platform/sqlite/serializedWriter.ts:27-84]
- The portable archive is a logical, allowlisted GTBK payload, not a copied SQLite database. The registry intentionally excludes catalog, FTS, effects, and database internals. [VERIFIED: src/domains/portability/backupContracts.ts:22-79]
- GTBK has magic bytes GTBK, current outer envelope version 1, AES-256-GCM encrypted payload, and an Argon2id password KDF descriptor. [VERIFIED: src/domains/portability/backupFormat.ts:20-23] [VERIFIED: src/domains/portability/backupFormat.ts:84-100]
- Existing replacement restore already has the desired high-level sequence: authenticate/decrypt, validate, preview, consume single-use token, commit, rebuild. Merge must be its strict superset. [VERIFIED: src/domains/portability/restoreCommands.ts:287-364]

## Existing backup format and version guards (D-03)

### Current exact guards

- LOGICAL_BACKUP_FORMAT_VERSION is 1. parseLogicalBackupSnapshot accepts only that exact snapshot version and otherwise raises backup_snapshot_unsupported_version. [VERIFIED: src/domains/portability/backupContracts.ts:1-11] [VERIFIED: src/domains/portability/backupContracts.ts:318-384]
- The outer envelope independently has FORMAT_VERSION 1 in its prefix and authenticated header, rejecting a different version as backup_archive_unsupported_version. [VERIFIED: src/domains/portability/backupFormat.ts:20-23] [VERIFIED: src/domains/portability/backupFormat.ts:212-277]
- Restore accepts producer schemas [15, 16, 17, 18] only. It requires exact table and manifest key sets, exact current local columns/types, unique primary-key tuples, domain invariants, and reference validity. [VERIFIED: src/domains/portability/restoreCommands.ts:146-162] [VERIFIED: src/domains/portability/restoreCommands.ts:186-239]
- Limits are 32 MiB archive, 24 MiB plaintext, 100,000 total rows, 25,000/table, 64 KiB/string, and nesting depth 16. [VERIFIED: src/domains/portability/backupContracts.ts:3-11]

### D-03 implementation conclusion

Bump the logical snapshot and envelope versions additively to v2, but make decoders accept v1 and v2. A v1 adapter must continue to support old clean restore. Do not simply change the current exact constants to 2, which would reject every existing backup. Add v19, v20, and v21 to the supported-schema allowlist after those migrations exist. [VERIFIED: src/domains/portability/backupContracts.ts:321-334] [VERIFIED: src/domains/portability/restoreCommands.ts:191-220] [ASSUMED: dual-version adapter design is required by the current exact guards]

### Current logical source table contract

The current registry is 43 tables with these primary keys:

- app_settings(key); exercise_owner_preferences(exercise_id); exercises(id); exercise_library_entries(exercise_id); exercise_aliases(id); exercise_search_terms(id); exercise_taxonomy(exercise_id, kind, relation, ordinal); taxonomy_terms(kind, slug).
- metric_profile_migration_events(idempotency_key); exercise_metric_baselines(exercise_id, exercise_metric_generation).
- plans(id); plan_schedules(id); plan_schedule_bindings(id); plan_days(id); plan_day_exercises(id); plan_warmup_sets(id); plan_working_set_targets(id); progression_policies(id); progression_recommendations(id).
- owned_plan_aggregate_states(plan_id); owned_plan_mutation_requests(request_id); owned_plan_starter_sources(plan_id); owned_plan_day_sources(plan_day_id); owned_plan_day_exercises(id); owned_plan_warmup_sets(id); owned_plan_working_set_targets(id); owned_plan_progression_policies(id); owned_plan_occurrence_sources(plan_day_exercise_id); owned_plan_schedules(id); owned_plan_schedule_versions(id); owned_plan_schedule_bindings(id); owned_plan_schedule_overrides(id); owned_plan_schedule_opportunities(id); owned_plan_schedule_events(id).
- starter_plan_activation_requests(request_id); workout_sessions(id); session_exercises(id); session_sets(id); session_rest_states(session_id); session_undo_snapshots(id); history_session_overlays(session_id); history_audit_events(id); owned_progression_recommendations(id).

[VERIFIED: src/domains/portability/backupContracts.ts:27-75]

The parser validates safe JSON-like values and each declared primary-key tuple before any writer sees a snapshot. [VERIFIED: src/domains/portability/backupContracts.ts:279-312] Existing tests verify source tables are included while history_projection_period_inputs, pending_effects, and sqlite_master are excluded. [VERIFIED: src/domains/portability/backupContracts.test.ts:55-72]

### Required v1.1 graph updates

For Phase 11, update together: LOGICAL_BACKUP_TABLE_DEFINITIONS, LOGICAL_BACKUP_TABLE_FILTERS, snapshot adapters/validation, LOGICAL_BACKUP_REFERENCE_DEFINITIONS, restore ordering, source verification, supported versions, and host tests. Phase 9 added-origin, modified-from-plan, display-ordinal data and Phase 10 advanced timing configuration/state must be portable source facts; FTS, projections, effect queues, recommendations/UI caches that are derivatives must remain excluded and be rebuilt. [VERIFIED: src/platform/sqlite/repositories/logicalBackupRepository.ts:67-117] [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:100-141] [VERIFIED: .planning/REQUIREMENTS.md:45-46] [ASSUMED: exact Phase 9/10 names unavailable before those phases execute]

## Restore engine and transaction reuse (D-04)

### Preflight, crypto, errors, token store

RestoreCommands currently offers preflightSecureRestore(password) returning cancelled or ready with token/preview, commitSecureRestore(token, confirmation), and explicit token invalidation. [VERIFIED: src/domains/portability/restoreCommands.ts:85-108]

RestoreCommandError codes are exactly:

- restore_archive_invalid
- restore_archive_limit_exceeded
- restore_archive_unavailable
- restore_archive_unsupported_version
- restore_preflight_token_invalid
- restore_confirmation_invalid
- restore_commit_failed

[VERIFIED: src/domains/portability/restoreCommands.ts:110-119]

The codec receives the Argon2id descriptor with algorithm, iterations, memoryKiB, outputLength, parallelism, salt, and version. It maps wrong password and tampering to the same archive-unavailable error and wipes password/archive buffers in finally. [VERIFIED: src/domains/portability/restoreCommands.ts:287-345]

The preflight store permits one active opaque token and consumes it once. Existing clean restore requires exact, case-sensitive REPLACE; a failed writer attempt cannot replay because commit consumes before writing. [VERIFIED: src/domains/portability/restoreCommands.ts:266-285] [VERIFIED: src/domains/portability/restoreCommands.ts:347-364] [VERIFIED: src/domains/portability/restoreCommands.test.ts:545-600]

**Merge extension:** add named preflightSecureMerge and commitSecureMerge alongside existing restore commands or in an adjacent module. Reuse the same authenticated-open, validator, single-use token, and safe error mapping. Use a distinct exact merge confirmation such as MERGE, not REPLACE. [ASSUMED: exact merge word is planner discretion; distinct action prevents stale/replacement confusion]

### FK graph and writer discipline

LOGICAL_BACKUP_REFERENCE_DEFINITIONS is the explicit source graph. It covers exercise/catalog references, plans and owned-plan graph, sessions to exercises/sets/rest/undo/history graph, and recommendation graph; retained bundled parents are marked allowRetained. [VERIFIED: src/domains/portability/restoreCommands.ts:157-162]

Restore derives parent-first insert order and reverse delete order. It excludes only nullable cyclic pointers from ordering (active session exercise/set and next rest set), leaving SQLite foreign-key checks to validate them later. [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:100-141]

The clean restore uses one kernel.write transaction: foreign-key check, defer FKs, capture current owned rows, temporarily drop only delete-blocking triggers, delete in reverse graph order, insert in graph order, recreate/verify triggers, verify source identities plus foreign_key_check, then set portability_restore_state to rebuild_pending. [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:292-395]

The host test injects a failure after every capture, trigger-drop, delete, insert, trigger-recreate, verification and state-update stage and asserts the canonical state equals the pre-write snapshot. [VERIFIED: tests/sqlite-host/logicalRestoreRepository.test.ts:375-405]

**D-04 conclusion:** merge must calculate a complete plan before opening the writer, then apply all updates/inserts/deletes in one kernel.write. Candidate validation/preflight must be read-only; the existing candidate-probe comments explicitly prohibit preflight from opening a writer. [VERIFIED: src/platform/sqlite/repositories/restorePreflightAdapters.ts:138-203] [VERIFIED: src/platform/sqlite/serializedWriter.ts:46-84]

## Stable owner-scoped identity (D-02)

### Current key facts

- Existing backup primary keys are physical IDs/request IDs and related tuples; no separate portable owner identity exists. [VERIFIED: src/domains/portability/backupContracts.ts:27-75]
- Owned plans and custom exercises are created as kind plus expo-crypto randomUUID. [VERIFIED: src/bootstrap/ownedPlanRuntime.tsx:91-109] [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:2186-2201]
- Workout session ID is currently composed as session_, startedAtMs, and a source/plan-day suffix. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:775-804]
- Sessions carry started_at_ms, optional completed_at_ms and revision; sets carry draft_updated_at_ms, completed_at_ms and revision. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:136-245]
- Settings carry revision/updated_at_ms. Overlays carry effective_revision, created_at_ms, updated_at_ms; history events carry occurred_at_ms. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:326-332] [VERIFIED: src/platform/sqlite/migrations/0013_history_integrity.ts:37-65]

Current IDs survive a restore that preserves them, but they are not a defined owner-scoped identity contract and current session ID construction can collide for equal start/source input. D-02 requires a migration/backfill and permanent portable identity semantics. [VERIFIED: src/platform/sqlite/repositories/plansWorkoutRepository.ts:775-804] [ASSUMED: collision follows deterministic ID construction]

### Recommended migration and identity rule

Add v21 after Phase 9 v19 and Phase 10 v20. Add one persistent opaque owner namespace and immutable opaque portable IDs for merge roots and merge-relevant dependents, either as columns or a strict mapping table. Prefer source-row fields where practical; use random IDs at creation; never derive IDs from names, timestamps, device ID, or mutable content. Preserve them in every v2 backup and clean restore. [ASSUMED: exact column versus mapping-table design remains planner discretion]

Backfill existing records transactionally. Legacy v1 archives remain clean-restorable through a v1 adapter, then migration/backfill establishes identities for their next export. A legacy archive without portable IDs must not merge into unrelated existing data; fail closed or route the owner to restore-clean. [VERIFIED: src/domains/portability/backupContracts.ts:321-384] [ASSUMED: clean-only legacy merge policy is necessary because current backup lacks D-02 identity]

If adding non-null fields requires table reconstruction, classify migration destructive so the runner creates/validates recovery backup. The runner executes each migration in kernel.write, runs up/verify/integrity checks, and only then sets user_version. [VERIFIED: src/platform/sqlite/migrationRunner.ts:220-265]

## D-01 conflict engine: aggregate map and comparators

| Locked record class | Aggregate/table set | Existing facts | Required merge behavior |
|---|---|---|---|
| Sessions | workout_sessions root plus session_exercises, session_sets, session_rest_states, session_undo_snapshots | started_at_ms, completed_at_ms, revision; set draft/completion timestamps | newest-by-timestamp selects one complete session aggregate. Add canonical merge modified-at timestamp in v21. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:136-245] |
| Corrections / void | history_session_overlays, history_audit_events, voided session status | overlay updated_at_ms/effective_revision; audit occurred_at_ms/event type correction, void, restore; session allows voided | newest-by-timestamp with deterministic tie-break; preserve whole selected history aggregate. [VERIFIED: src/platform/sqlite/migrations/0013_history_integrity.ts:37-75] [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:143-163] |
| Settings | app_settings | key, revision, updated_at_ms | existing/local wins on duplicate identity/key; import only missing settings. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:326-332] |
| Custom exercises | custom/copied exercises plus library, alias/search/taxonomy/preferences/baseline graph | physical ID today; no portable ID | keep both different portable identities; same portable ID dedupes; do not dedup by name. [VERIFIED: src/platform/sqlite/repositories/logicalBackupRepository.ts:74-85] |
| Plans | custom/copied plans plus complete plan, owned-plan, schedule and recommendation graph | physical IDs; owned aggregate state timestamps and mutation committed_at_ms | keep both different portable identities; same portable ID dedupes, preserving complete graph. [VERIFIED: src/platform/sqlite/repositories/logicalBackupRepository.ts:85-109] [VERIFIED: src/platform/sqlite/migrations/0009_owned_plans.ts:43-110] |

The conflict rule itself is locked: newest timestamp for sessions/corrections/void, local wins settings, and identity-deduped keep-both for distinct custom exercises/plans. [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-CONTEXT.md:17-37] [VERIFIED: .planning/phases/11-portable-history-merge-restore/11-DISCUSSION-LOG.md:10-22]

Do not use revision alone as a distributed merge clock. Revisions are optimistic concurrency values, not universal timestamps. Define a non-null merge timestamp for each aggregate root and tie equal timestamps using the immutable portable ID so all devices choose identically. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:156-163] [ASSUMED: canonical timestamp/tie-break addition]

For keep-both, build an identity-to-local-ID map before writing. Same portable identity/different physical ID maps to local physical IDs. Different portable identities/same physical ID get deterministic fresh local IDs, and every child FK in the imported in-memory aggregate is rewritten. A plan cannot apply a child independently from a rejected/losing parent aggregate. Fail closed when a full FK-closed mapping cannot be produced. [VERIFIED: src/domains/portability/restoreCommands.ts:225-239] [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:100-141] [ASSUMED: ID remap algorithm]

## Merge preview and stale-preflight rule

RestorePreview already contains sourceFormatVersion, createdAtMs, non-zero replacement counts, and catalog/reference availability. It is produced only after decrypt, validation, reference check, and candidate probe. [VERIFIED: src/domains/portability/restoreCommands.ts:73-89] [VERIFIED: src/domains/portability/restoreCommands.ts:241-260] [VERIFIED: src/domains/portability/restoreCommands.ts:305-321]

Extend it with a mode discriminator and bounded merge counts per locked class: inserted, duplicate unchanged, local-won, archive-won, kept-both, plus conflict total. Do not return raw rows, names, passwords, paths, SQL, or archive diagnostics. [VERIFIED: src/domains/portability/restoreCommands.test.ts:210-245] [VERIFIED: app/more/data-and-recovery.tsx:636-680] [ASSUMED: preview field names]

The existing preflight digest includes only snapshotId, createdAtMs, and totalRows. That is insufficient for a state-dependent merge. Bind the merge token to archive identity plus a deterministic local source fingerprint or re-read/recalculate the plan under the writer before changes. Reject stale plans rather than applying a preview calculated against different local facts. [VERIFIED: src/domains/portability/restoreCommands.ts:262-285] [ASSUMED: stale preflight protection]

## Derivative rebuild

Replacement restore commits portability_restore_state = rebuild_pending; that state table is schema v16. [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:361-387] [VERIFIED: src/platform/sqlite/migrations/0016_portability_restore_state.ts:4-46]

The reconciliation repository then reads effective sessions, supersedes active effects, clears all history derivative tables, reseeds subjects, rebuilds search/FTS and history projections, verifies exact FTS and history parity, and marks ready only when parity succeeds. It otherwise returns retryable_failure with rebuild_pending. [VERIFIED: src/platform/sqlite/repositories/restoreReconciliationRepository.ts:125-166] [VERIFIED: src/platform/sqlite/repositories/restoreReconciliationRepository.ts:244-331]

Runtime already invokes it after clean restore and reports ready only after rebuilt/already_ready. Merge must use this exact path or a generalized equivalent and may not claim success while derivatives are stale. [VERIFIED: src/bootstrap/workoutAppRuntime.tsx:3623-3637] [VERIFIED: .planning/REQUIREMENTS.md:64-72]

## UI surface

SettingsScreen exposes Data and recovery with the more-data-and-recovery test ID. [VERIFIED: src/ui/screens/SettingsScreen.tsx:328-344]

The real route is app/more/data-and-recovery.tsx. It currently provides secure backup, replacement restore, and CSV; replacement says it replaces current user-owned data only after preview/confirmation. [VERIFIED: app/more/data-and-recovery.tsx:470-588]

Its review is already an accessible list of bounded facts, focus target Review backup, destructive warning, exact REPLACE confirmation and ready/rebuild-pending outcomes. [VERIFIED: app/more/data-and-recovery.tsx:636-685] Unmount currently invalidates a restore token. [VERIFIED: app/more/data-and-recovery.tsx:430-459]

Add an explicit Import / merge backup action alongside the clearly retained Restore clean action. The v1.1 UX flow locates manual Export backup and Import / merge backup under Settings → Data & recovery. [VERIFIED: .planning/design/v1.1-UX-FLOW.md:121-143]

Merge review must identify the operation, show conflict/count summary and settings-local behavior, say no change has happened yet, and retain accessible rows/focus/48dp controls. A cancel/back/unmount must invalidate the merge token. [VERIFIED: .planning/REQUIREMENTS.md:64-72] [ASSUMED: exact merge copy]

## Tests, coverage, Expo SQLite contracts, Maestro

### Required automated tests

- Extend backupContracts tests for v1/v2 parser compatibility, v19/v20/v21 table graph, portable-ID validation, limits and legacy clean-only behavior.
- Extend restoreCommands tests for authenticated-before-parse, schema/reference validation, merge preview, all D-01 outcomes, timestamp tie-break, token invalidation/staleness, cancellation, exact merge confirmation, and safe errors with no secret leakage.
- Keep merge command implementation under the 100% integrity gate or add its file to scripts/run-coverage-gate.mjs. backupContracts.ts and restoreCommands.ts are already gate entries. [VERIFIED: scripts/run-coverage-gate.mjs:16-23] [VERIFIED: scripts/run-coverage-gate.mjs:60-101]
- Current tests establish the relevant patterns: schema allowlist table cases, preview only after full authenticated validation, and token consume-before-writer. [VERIFIED: src/domains/portability/restoreCommands.test.ts:190-245] [VERIFIED: src/domains/portability/restoreCommands.test.ts:545-600]

### Required host SQLite proofs

Add logicalMergeRepository host tests or extend logicalRestoreRepository tests to prove:

1. archive merge into populated source data with all D-01 outcomes;
2. same visible name but different exercise/plan portable identity keeps both with a full valid FK graph;
3. same stable session identity chooses newest aggregate; correction/void outcome follows newest timestamp and deterministic tie-break;
4. local setting is unchanged byte-for-byte/source-row for duplicate setting;
5. old v1 archive clean restore works; v1 merge safely rejects;
6. every auth, parse, validation, conflict, cancel, stale-plan, update/insert/delete, trigger, foreign-key, verification and commit failure leaves canonical source state and schema/trigger metadata exactly unchanged;
7. successful merge reaches rebuild_pending then deterministic FTS/projection/recommendation parity ready.

The exact rollback-test pattern exists and must be duplicated for merge. [VERIFIED: tests/sqlite-host/logicalRestoreRepository.test.ts:375-405] The clean-install test already proves restored source facts and rebuilt derivatives on a clean host database. [VERIFIED: tests/sqlite-host/cleanInstallRestore.test.ts:345-460]

Add v21 migration/backfill verification to migrationsEffects.contract.ts and run it in real Expo SQLite. The contract imports runtime migrations and includes migration rollback/verify/integrity cases. [VERIFIED: src/testing/contracts/migrationsEffects.contract.ts:1-40] [VERIFIED: src/testing/contracts/migrationsEffects.contract.ts:122-130]

### Maestro surface

Create a Phase 11 data-recovery Maestro flow and runner/evidence contract patterned after Phase 5. Test Settings navigation, Restore clean and Import/merge actions, picker cancel, merge review/conflict summary, accessible labels/focus, disabled/enabled confirmation, safe cancellation/error copy, and success/rebuild-pending UI. Maestro cannot prove byte-level transaction rollback; pair it with host/native SQLite contracts. [VERIFIED: maestro/phase5/data-recovery.yaml:7-27] [VERIFIED: scripts/run-phase5-maestro.mjs:21-49]

The existing component tests already verify accessible preview rows, exact confirmation, duplicate-press latch, safe error copy, and retry with fresh token; carry these patterns to merge. [VERIFIED: app/more/__tests__/data-and-recovery.test.tsx:273-429]

## Reusable assets

| Path and lines | Reuse requirement |
|---|---|
| src/domains/portability/backupContracts.ts:1-384 | Logical registry, limits, parser, primary-key validation; make dual-version capable. |
| src/domains/portability/backupFormat.ts:20-100,212-277 | GTBK envelope, authenticated header, version guards; accept v1/v2. |
| src/domains/portability/restoreCommands.ts:73-364 | Crypto preflight, preview, validation, token store/error mapping; add merge mode. |
| src/platform/sqlite/repositories/logicalBackupRepository.ts:67-117,195-234 | Explicit ownership filters and consistent source snapshot; add v19/v20/v21 graph. |
| src/platform/sqlite/repositories/logicalRestoreRepository.ts:100-141,292-395 | FK ordering, trigger handling, all-or-nothing writer verification; use for merge writer. |
| src/platform/sqlite/repositories/restorePreflightAdapters.ts:138-235 | Pure candidate validation and read-only schema/catalog ports; add merge read seam. |
| src/platform/sqlite/repositories/restoreReconciliationRepository.ts:125-331 | FTS/projection deterministic rebuild and parity gate. |
| src/bootstrap/workoutAppRuntime.tsx:1296-1337,3612-3637 | Production construction/runtime API/post-commit rebuild wiring. |
| app/more/data-and-recovery.tsx:430-688 | Existing UI state/token cleanup/a11y preview and safe copy. |
| tests/sqlite-host/logicalRestoreRepository.test.ts:375-405 | Transactional fault injection and unchanged DB proof model. |

## Pitfalls

1. Never mutate in preflight; it must remain read-only. [VERIFIED: src/platform/sqlite/repositories/restorePreflightAdapters.ts:138-203]
2. Never merge child fragments independently of their selected aggregate root; this can create FK-invalid mixed snapshots. [VERIFIED: src/domains/portability/restoreCommands.ts:225-239] [ASSUMED: aggregate atomicity requirement]
3. Do not use revision as a cross-device winner clock; add canonical modified timestamp plus stable-ID tie-break. [VERIFIED: src/platform/sqlite/migrations/0001_initial.ts:156-163] [ASSUMED: comparator design]
4. Do not break v1 clean restore while adding v2. [VERIFIED: src/domains/portability/backupContracts.ts:321-334] [VERIFIED: src/domains/portability/backupFormat.ts:212-277]
5. Update every backup graph surface for v19/v20/v21 or data will be rejected/lost. [VERIFIED: src/platform/sqlite/repositories/logicalBackupRepository.ts:67-117] [VERIFIED: src/domains/portability/restoreCommands.ts:186-239]
6. Preserve immutable triggers. Existing restore drops only delete blockers inside its transaction and recreates/verifies before commit. [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:35-53] [VERIFIED: src/platform/sqlite/repositories/logicalRestoreRepository.ts:344-395]
7. Bind merge preview to current local state; current digest has archive facts only. [VERIFIED: src/domains/portability/restoreCommands.ts:262-285] [ASSUMED: local-state fingerprint]
8. Do not call a merge ready until derivative parity succeeds; rebuild_pending is an explicit recoverable intermediate state. [VERIFIED: src/platform/sqlite/repositories/restoreReconciliationRepository.ts:307-329] [VERIFIED: app/more/data-and-recovery.tsx:675-685]

## Confidence

| Topic | Confidence |
|---|---|
| D-01 lock, current GTBK/replacement restore/write/rebuild assets | High |
| Need for v21 identity migration/backfill and merge aggregate planning | High |
| Exact owner identity column/mapping table and canonical timestamp field | Medium; planner choice required |
| Exact v19/v20 tables and columns | Low until their phases execute; dependency recorded explicitly |

## RESEARCH COMPLETE
