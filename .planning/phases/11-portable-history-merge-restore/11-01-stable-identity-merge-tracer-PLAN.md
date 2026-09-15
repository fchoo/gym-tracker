---
phase: 11-portable-history-merge-restore
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domains/portability/portableIdentity.ts
  - src/domains/portability/portableIdentity.test.ts
  - src/domains/portability/backupContracts.ts
  - src/domains/portability/backupContracts.test.ts
  - src/domains/portability/backupFormat.ts
  - src/domains/portability/backupFormat.test.ts
  - src/domains/portability/backupCommands.ts
  - src/domains/portability/backupCommands.test.ts
  - src/domains/portability/restoreCommands.ts
  - src/domains/portability/restoreCommands.test.ts
  - src/domains/portability/mergeCommands.ts
  - src/domains/portability/mergeCommands.test.ts
  - src/platform/sqlite/migrations/0021_portable_owner_identities.ts
  - src/platform/sqlite/migrations/index.ts
  - src/platform/sqlite/repositories/logicalBackupRepository.ts
  - src/platform/sqlite/repositories/logicalRestoreRepository.ts
  - src/platform/sqlite/repositories/logicalMergeRepository.ts
  - src/platform/sqlite/repositories/restorePreflightAdapters.ts
  - src/platform/sqlite/repositories/plansWorkoutRepository.ts
  - src/platform/sqlite/repositories/historyCommandRepository.ts
  - src/platform/sqlite/repositories/restoreReconciliationRepository.ts
  - src/bootstrap/workoutAppRuntime.tsx
  - src/testing/contracts/migrationsEffects.contract.ts
  - src/testing/contracts/portableMerge.contract.ts
  - src/testing/contracts/portableMerge.contract.test.ts
  - app/__native-contracts.tsx
  - scripts/run-native-sqlite-contracts.mjs
  - tests/sqlite-host/migrations-effects.test.ts
  - tests/sqlite-host/logicalBackupRepository.test.ts
  - tests/sqlite-host/logicalRestoreRepository.test.ts
  - tests/sqlite-host/logicalMergeRepository.test.ts
  - tests/integration/portable-merge.test.ts
  - scripts/run-coverage-gate.mjs
  - package.json
autonomous: false
requirements: [DATA-08, DATA-09]
must_haves:
  truths:
    - "D-02: schema 21 gives every owner-created exercise, plan, and workout-session root an immutable opaque owner-scoped portable identity; new writes allocate it atomically and the migration backfills existing roots without deriving identity from names, timestamps, device IDs, or mutable content."
    - "D-03: current exports use additive GTBK logical/envelope v2 while v1 archives remain accepted for restore-clean; v1 archives are rejected safely for merge because they lack stable identities."
    - "D-04: the tracer performs authenticated decrypt, parse/validation, stable-identity dedup, read-only preview, a single private-writer merge transaction, and deterministic reconciliation for one workout-session aggregate."
    - "D-01: the tracer proves newest-by-canonical-timestamp wins for one duplicate workout-session aggregate, with a canonical payload digest as the deterministic equal-timestamp tie-break."
    - "Any injected tracer failure or cancellation leaves a byte-for-byte canonical dump of authoritative rows plus schema/trigger metadata unchanged; success reaches derivative parity before reporting ready."
    - "The v21 migration, GTBK v2 bump, dual-version decoder, v19/v20/v21 supported-schema entries, Phase 9/10 source-table definitions/filters, and reference graph update ship in this same wave."
  artifacts:
    - {path: src/platform/sqlite/migrations/0021_portable_owner_identities.ts, provides: schema-21 owner namespace and immutable portable root identities}
    - {path: src/domains/portability/mergeCommands.ts, provides: transport-agnostic authenticated merge preflight/token/commit boundary}
    - {path: src/platform/sqlite/repositories/logicalMergeRepository.ts, provides: one-writer workout-session tracer transaction}
    - {path: tests/sqlite-host/logicalMergeRepository.test.ts, provides: populated-database merge and rollback byte-equality proof}
    - {path: src/testing/contracts/portableMerge.contract.ts, provides: the same tracer success/failure cases on host and real Expo SQLite}
  key_links:
    - {from: portable owner/root identity, to: GTBK v2 logical rows, via: backup allowlist and v2 parser validation}
    - {from: merge preview token, to: current SQLite state, via: archive digest plus deterministic local-source fingerprint checked again inside the writer}
    - {from: selected session aggregate, to: child rows and foreign keys, via: one complete FK-closed identity remap plan}
    - {from: successful merge commit, to: FTS/projection readiness, via: portability_restore_state and restoreReconciliationRepository parity checks}
---

<objective>Lead Phase 11 with a production-quality vertical tracer: schema-21 stable owner-scoped identities, backward-compatible GTBK v2, and one populated-database workout-session merge that is previewed, newest-wins, atomic, fail-closed, and deterministically rebuilt.</objective>

<execution_context>
@$HOME/.trae/gsd-core/workflows/execute-plan.md
@$HOME/.trae/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/11-portable-history-merge-restore/11-CONTEXT.md
@.planning/phases/11-portable-history-merge-restore/11-RESEARCH.md
@.planning/phases/09-in-workout-exercise-editing/09-06-phase-verification-PLAN.md
@.planning/phases/10-advanced-set-timing/10-04-integrity-lifecycle-verification-PLAN.md

**Cross-phase execution contract.** Phase 11 depends on completed Phases 9 and 10. Their planned migrations v19 and v20 do not exist in this planning checkout. At execution, first read their SUMMARY files and inspect the actual migration registry/source graph. Add Phase 11 as the next migration after the execution-time maximum (expected `0021_portable_owner_identities.ts` after v20); never renumber, recreate, or guess Phase 9/10 columns. Ensure every Phase 9/10 authoritative source fact is in the v2 table/filter/reference graph, while FTS, projections, recommendations, effect queues, and UI caches remain excluded derivatives.

Plan-time anchors that exist now: `src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts:1-90` and `migrations/index.ts:1-37` for migration shape/registration; `backupContracts.ts:1-79,318-384` for the v1 exact-version/table contract; `backupFormat.ts:20-23,84-100,212-277` for envelope versioning; `restoreCommands.ts:73-162,186-364` for authenticated preflight, current `[15,16,17,18]` allowlist, reference graph, token, and commit; `logicalBackupRepository.ts:67-117,195-234`; `logicalRestoreRepository.ts:100-141,292-395`; `restorePreflightAdapters.ts:138-235`; and `restoreReconciliationRepository.ts:125-331`.

Identity design to implement after the gate below: one singleton opaque owner namespace plus immutable random portable IDs on the three merge roots (`exercises` for owner-created rows, `plans` for owner-created rows, `workout_sessions`), with a canonical merge-modified timestamp on session roots. The stable tuple is owner namespace + record class + portable ID. Child rows stay inside their root's FK-closed aggregate and are remapped as a unit; settings retain their stable key. Add database constraints/immutability triggers and repository creation paths so identity cannot be silently regenerated.
</context>

<tasks>
<task type="checkpoint:decision" gate="blocking">
  <decision>Confirm locked one-way D-02 before publishing schema-21 owner-scoped identity semantics.</decision>
  <files>src/domains/portability/portableIdentity.ts, src/platform/sqlite/migrations/0021_portable_owner_identities.ts</files>
  <context>D-02 is LOCKED. The execution choice is only whether to uphold the specified stable tuple and proceed. Once a v2 backup is exported, changing identity semantics would break recognition of that record across devices/reinstalls. Existing roots must be randomly backfilled, future roots must allocate identity in the same authoritative write, and identity must be immutable.</context>
  <options>
    <option id="uphold-d02"><name>Uphold D-02</name><pros>Publishes one explicit portable identity contract and permits safe dedup.</pros><cons>Future changes require a compatibility migration and adapters for already-exported v2 archives.</cons></option>
    <option id="stop-plan"><name>Stop execution</name><pros>Avoids publishing an unapproved identity contract.</pros><cons>DATA-08 and DATA-09 remain incomplete; weakening or substituting D-02 is not allowed.</cons></option>
  </options>
  <resume-signal>Select: uphold-d02 or stop-plan</resume-signal>
  <action>Record exactly one resume signal. Continue only for `uphold-d02`; `stop-plan` ends execution before schema, format, or merge changes. Do not reinterpret the locked decision.</action>
  <verify><manual>The execution record contains `uphold-d02` before Task 2 starts, or ends with no Task 2+ changes.</manual></verify>
  <acceptance_criteria>D-02 is explicitly accepted as a one-way published identity contract before migration 21 or GTBK v2 implementation begins.</acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Ship schema-21 stable identities and the additive GTBK v2 contract together</name>
  <files>src/domains/portability/portableIdentity.ts, src/domains/portability/portableIdentity.test.ts, src/platform/sqlite/migrations/0021_portable_owner_identities.ts, src/platform/sqlite/migrations/index.ts, src/platform/sqlite/repositories/plansWorkoutRepository.ts, src/platform/sqlite/repositories/historyCommandRepository.ts, src/domains/portability/backupContracts.ts, src/domains/portability/backupContracts.test.ts, src/domains/portability/backupFormat.ts, src/domains/portability/backupFormat.test.ts, src/domains/portability/backupCommands.ts, src/domains/portability/backupCommands.test.ts, src/domains/portability/restoreCommands.ts, src/domains/portability/restoreCommands.test.ts, src/platform/sqlite/repositories/logicalBackupRepository.ts, src/platform/sqlite/repositories/logicalRestoreRepository.ts, src/testing/contracts/migrationsEffects.contract.ts, tests/sqlite-host/migrations-effects.test.ts, tests/sqlite-host/logicalBackupRepository.test.ts, tests/sqlite-host/logicalRestoreRepository.test.ts, scripts/run-coverage-gate.mjs</files>
  <read_first>.planning/phases/11-portable-history-merge-restore/11-CONTEXT.md, .planning/phases/11-portable-history-merge-restore/11-RESEARCH.md, src/platform/sqlite/migrations/0018_workout_remove_receipt_entity_ids.ts, src/platform/sqlite/migrations/index.ts, src/domains/portability/backupContracts.ts, src/domains/portability/backupFormat.ts, src/domains/portability/restoreCommands.ts, src/platform/sqlite/repositories/logicalBackupRepository.ts, src/platform/sqlite/repositories/logicalRestoreRepository.ts, src/testing/contracts/migrationsEffects.contract.ts</read_first>
  <action>After confirming the actual Phase 9/10 schema, add/register migration 21. Create exactly one non-null singleton random owner namespace; add non-null random portable IDs to owner-created exercises, owner-created plans, and workout sessions (bundled roots remain recognized through catalog identity), plus a non-null canonical merge-modified timestamp for sessions. Backfill inside the migration with opaque randomness, unique constraints on owner namespace/class/portable ID, shape checks, indexes, and triggers that reject identity mutation. Update every creation/import/correction/void path so identity allocation and session modified-at updates occur in the same private-writer transaction as the source mutation. Define/fully cover canonical identity validation and deterministic timestamp+portable-ID ordering.

Bump the logical snapshot and GTBK envelope writer to v2, but make both readers explicitly accept v1 and v2. A v1 adapter must retain the exact existing restore-clean semantics; it must never fabricate identities for merge. Extend `LOGICAL_BACKUP_SUPPORTED_SCHEMA_VERSIONS` from the execution-time list through 21 (expected 15..21). In this same task inspect execution-time v19/v20 tables/columns and update `LOGICAL_BACKUP_TABLE_DEFINITIONS`, ownership filters, `LOGICAL_BACKUP_REFERENCE_DEFINITIONS`, restore ordering/source verification, and host fixtures so all authoritative Phase 9/10/11 facts are portable. Keep derivatives excluded. Add tests for identity backfill/immutability/uniqueness/new-write atomicity, dual envelope/logical versions, v1 restore-clean, v1 merge-ineligible marker, v2 round-trip, graph completeness, unknown versions, and migration rollback. Extend the real Expo `migrations-effects` contract with v21 persistence/rollback/verification. Register identity, migration 21, and changed portability integrity modules in `scripts/run-coverage-gate.mjs` at exactly 100% statements/branches/functions/lines.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability/portableIdentity.test.ts src/domains/portability/backupContracts.test.ts src/domains/portability/backupFormat.test.ts src/domains/portability/backupCommands.test.ts src/domains/portability/restoreCommands.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/migrations-effects.test.ts tests/sqlite-host/logicalBackupRepository.test.ts tests/sqlite-host/logicalRestoreRepository.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run android:devtest:fresh -- --suite phase11 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase11/build.json</native></verify>
  <acceptance_criteria>D-02 is a constrained, immutable, randomly backfilled owner-scoped identity contract proven in host and real Expo SQLite; D-03 is additive GTBK v2 with v1 restore-clean regression passing; migration 21, supported schemas through 21, and the complete v19/v20/v21 source/reference graph ship together.</acceptance_criteria>
  <reversibility rating="one-way">D-02 identity tuples become externally durable as soon as GTBK v2 is exported; never regenerate or reinterpret them.</reversibility>
  <done>Current and future owner roots have portable identities, GTBK v2 carries them and all v1.1 source facts, and old GTBK v1 still restores clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Build a read-only single-session merge preflight</name>
  <files>src/domains/portability/mergeCommands.ts, src/domains/portability/mergeCommands.test.ts, src/platform/sqlite/repositories/restorePreflightAdapters.ts, src/platform/sqlite/repositories/restorePreflightAdapters.test.ts, src/bootstrap/workoutAppRuntime.tsx, scripts/run-coverage-gate.mjs</files>
  <read_first>src/domains/portability/restoreCommands.ts, src/domains/portability/restoreCommands.test.ts, src/platform/sqlite/repositories/restorePreflightAdapters.ts, src/domains/portability/backupContracts.ts, src/domains/portability/backupFormat.ts</read_first>
  <action>Create transport-agnostic `preflightSecureMerge`/invalidate/commit types beside, not inside Drive or file transport. Reuse the GTBK Argon2id/AES authenticated-open discipline and safe error mapping: read bounded bytes, authenticate/decrypt before parsing, validate schema/table/reference/identity invariants, then read local facts. For the tracer, plan exactly one complete workout-session aggregate. Same portable identity selects newest canonical modified timestamp; equal timestamps use a documented portable-ID/payload-digest tie-break that is stable on every device. Build a bounded, row-free preview with mode, inserted/duplicate/archive-won/local-won counts and conflicts. Issue a single-use token bound to archive digest, complete planned operations, and a deterministic fingerprint of current authoritative local rows/schema. Picker cancellation returns cancelled and performs no write. Reject v1 for merge with safe restore-clean guidance. Never expose passwords, paths, names, rows, SQL, crypto details, or archive diagnostics. Preflight must have no writer dependency and tests must prove it cannot mutate SQLite.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability/mergeCommands.test.ts src/platform/sqlite/repositories/restorePreflightAdapters.test.ts &amp;&amp; npm run typecheck &amp;&amp; npm run test:coverage -- --runInBand</automated></verify>
  <acceptance_criteria>D-01 newest-wins is deterministic for the session tracer; D-02 drives dedup; D-03 v1 is clean-only and v2 mergeable; D-04 authentication precedes parse and preview is read-only, bounded, single-use, state-bound, and cancel-safe.</acceptance_criteria>
  <reversibility rating="costly">D-01's newest-wins comparator becomes the reconciliation precedent consumed by Phase 12; change only by revalidating merge and downstream sync.</reversibility>
  <done>A populated local DB can safely preview one session merge without opening a writer.</done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <decision>Confirm locked one-way D-04 before connecting a merge plan to the repository-owned writer.</decision>
  <files>src/platform/sqlite/repositories/logicalMergeRepository.ts, src/domains/portability/mergeCommands.ts, src/bootstrap/workoutAppRuntime.tsx</files>
  <context>D-04 is LOCKED. Commit must consume the token, revalidate the local fingerprint, and apply the complete FK-closed plan in one `SqliteKernel.write` transaction. No preflight write, savepoint-per-record, best-effort continuation, or partial commit path is permitted. Failure must preserve the existing authoritative database exactly.</context>
  <options>
    <option id="uphold-d04"><name>Uphold D-04</name><pros>Preserves the owner's only history and gives Phase 12 a safe reconciliation primitive.</pros><cons>Any single invalid row aborts the whole merge and requires correction/retry.</cons></option>
    <option id="stop-plan"><name>Stop execution</name><pros>Prevents accidental publication of a partial-write path.</pros><cons>The vertical tracer and DATA-08 remain incomplete; weakening D-04 is not allowed.</cons></option>
  </options>
  <resume-signal>Select: uphold-d04 or stop-plan</resume-signal>
  <action>Record exactly one signal. Continue only for `uphold-d04`; `stop-plan` ends execution before writer/runtime wiring.</action>
  <verify><manual>The execution record contains `uphold-d04` before Task 5 starts, or execution ends without merge-writer changes.</manual></verify>
  <acceptance_criteria>D-04's fail-closed one-transaction contract is explicitly accepted before any merge writer is implemented.</acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Commit and rebuild the single-session merge tracer atomically</name>
  <files>src/domains/portability/mergeCommands.ts, src/domains/portability/mergeCommands.test.ts, src/platform/sqlite/repositories/logicalMergeRepository.ts, src/platform/sqlite/repositories/restoreReconciliationRepository.ts, src/bootstrap/workoutAppRuntime.tsx, src/testing/contracts/portableMerge.contract.ts, src/testing/contracts/portableMerge.contract.test.ts, app/__native-contracts.tsx, scripts/run-native-sqlite-contracts.mjs, tests/sqlite-host/logicalMergeRepository.test.ts, tests/integration/portable-merge.test.ts, scripts/run-coverage-gate.mjs, package.json</files>
  <read_first>src/platform/sqlite/serializedWriter.ts, src/platform/sqlite/sqliteKernel.ts, src/platform/sqlite/repositories/logicalRestoreRepository.ts, tests/sqlite-host/logicalRestoreRepository.test.ts, src/platform/sqlite/repositories/restoreReconciliationRepository.ts, src/bootstrap/workoutAppRuntime.tsx</read_first>
  <action>Implement the tracer writer behind `commitSecureMerge` with exact case-sensitive `MERGE` confirmation. Consume the token before attempting a write; inside one `kernel.write`/`BEGIN IMMEDIATE`, recompute and compare local fingerprint, defer/check FKs, map the selected session root and all session children as one aggregate, perform the required insert/update replacement, verify portable identity uniqueness, canonical selected source facts, triggers/schema metadata, and `foreign_key_check`, then mark portability state `rebuild_pending`. Any stale plan, conflict, confirmation failure, insert/update/trigger/FK/verification/commit failure returns one safe code and rolls back the whole transaction. There is no per-row catch/continue or alternate writer.

After commit, invoke the existing generalized reconciliation pipeline: clear/reseed/rebuild FTS and every projection/recommendation derivative deterministically, verify exact parity, and report `ready` only on parity; otherwise retain durable `rebuild_pending` for retry. Add exhaustive fault injection at every writer stage and compare a canonical byte serialization of all authoritative source rows, `sqlite_schema`, trigger SQL, `user_version`, and portability state before/after every failure. Add a real populated-database integration case where archive session wins, relaunches, reaches parity, and produces the same derivative digest on two rebuilds. Create a minimal shared `portableMerge` contract and expose it through `app/__native-contracts.tsx`/`run-native-sqlite-contracts.mjs`; it must run populated-session success plus injected insert and verification failures and compare the pre/post canonical database byte image on actual Expo SQLite. Build the Phase 11 dev-test artifact only after this tracer code exists. Expose only decrypted snapshot + local DB ports; import no Google/Drive/sync module. Register merge commands/repository at exact 100% coverage.</action>
  <verify><automated>npm run test:unit -- --runInBand src/domains/portability/mergeCommands.test.ts src/testing/contracts/portableMerge.contract.test.ts &amp;&amp; npm run test:sqlite:host -- --runInBand tests/sqlite-host/logicalMergeRepository.test.ts tests/sqlite-host/restoreReconciliationRepository.test.ts &amp;&amp; npm run test:integration -- --runInBand tests/integration/portable-merge.test.ts &amp;&amp; npm run test:coverage -- --runInBand</automated><native>npm run android:devtest:fresh -- --suite phase11 &amp;&amp; npm run test:sqlite:device -- --suite migrations-effects --manifest artifacts/native/phase11/build.json &amp;&amp; npm run test:sqlite:device -- --suite portable-merge --manifest artifacts/native/phase11/build.json</native></verify>
  <acceptance_criteria>D-04 is proven by one private-writer transaction and byte-identical canonical DB evidence for cancellation, stale plan, conflict, insert/update/FK/trigger/verification/commit failures; the minimal insert/verification rollback matrix also passes on real Expo SQLite; D-01/D-02 select one complete newest session aggregate; success deterministically reaches derivative parity; the API is transport-agnostic.</acceptance_criteria>
  <reversibility rating="one-way">D-04 forbids any partial-write path. Future transports must call this atomic primitive rather than bypassing it.</reversibility>
  <done>The vertical tracer merges one session into existing data end to end, fails closed under injected faults, and reports success only after deterministic rebuild.</done>
</task>
</tasks>

<verification>Before Plan 11-02, retain: checkpoint signals for D-02 and D-04; schema-21 host and real Expo results; v1 restore-clean plus v2 round trips; authenticated read-only preview tests; the populated-DB single-session winner; every-stage canonical byte-equality rollback evidence; deterministic derivative digests; and exact 100% coverage output from `npm run test:coverage` → `scripts/run-coverage-gate.mjs`.</verification>
<success_criteria>Roadmap criteria 1-3 are proven for a one-session vertical slice, DATA-09 has its stable identity and additive portable format foundation, DATA-08 has an authenticated/previewed/atomic minimal merge, and no Phase 12 transport exists.</success_criteria>
<output>Create `.planning/phases/11-portable-history-merge-restore/11-01-SUMMARY.md` when done.</output>
